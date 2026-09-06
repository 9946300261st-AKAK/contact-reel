import { createHash, createHmac, randomBytes } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { type RenderInput, type RenderJob, type RenderOutput } from "@workspace/api-zod";
import {
  VIDEO_FORMATS,
  calculateTimeline,
  estimateRenderCost,
} from "@workspace/contactreel-core";
import { logger } from "./logger";
import { resolveSourceImages } from "./source-store";
import { isSupabaseConfigured, supabaseRequest } from "./supabase-connector";

const execFileAsync = promisify(execFile);
const renderRoot = path.join(tmpdir(), "contactreel-renders");
const jobs = new Map<string, JobRecord>();
const idempotency = new Map<string, string>();
const queue: string[] = [];
let activeJobId: string | undefined;

type JobRecord = {
  id: string;
  input: RenderInput;
  seed: number;
  createdAt: number;
  startedAt?: number;
  status: RenderJob["status"];
  progress: number;
  stage: string;
  output?: RenderOutput;
  outputPath?: string;
  error?: { code: string; message: string };
  child?: ReturnType<typeof spawn>;
  cancelled?: boolean;
};

function apiKeyMatches(requestKey?: string) {
  const configured = process.env.API_KEY_SECRET;
  if (!configured) return true;
  return Boolean(requestKey && createHash("sha256").update(requestKey).digest("hex") === createHash("sha256").update(configured).digest("hex"));
}

export function isApiKeyValid(requestKey?: string) {
  return apiKeyMatches(requestKey);
}

function safeFilename(input: string | null | undefined, fallback: string) {
  const clean = (input || fallback)
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 110);
  return clean.toLowerCase().endsWith(".mp4") ? clean : `${clean || fallback}.mp4`;
}

function outputUrl(jobId: string) {
  return `/api/v1/render/${jobId}/download`;
}

function toResponse(job: JobRecord): RenderJob {
  const elapsedSeconds = job.startedAt
    ? Math.max(0, (Date.now() - job.startedAt) / 1000)
    : 0;
  const estimatedRemainingSeconds =
    job.progress > 0 && job.progress < 100
      ? Math.max(0, elapsedSeconds * (100 - job.progress) / job.progress)
      : null;
  return {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    seed: job.seed,
    elapsedSeconds: Math.round(elapsedSeconds * 10) / 10,
    estimatedRemainingSeconds:
      estimatedRemainingSeconds === null
        ? null
        : Math.round(estimatedRemainingSeconds * 10) / 10,
    output: job.output || null,
    error: job.error || null,
  };
}

function renderAccepted(job: JobRecord) {
  return { jobId: job.id, status: job.status, seed: job.seed };
}

async function validateFfmpeg() {
  await execFileAsync("ffmpeg", ["-version"]);
}

async function probeOutput(outputPath: string, expected: RenderInput): Promise<RenderOutput> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration,size:stream=codec_name,codec_type,width,height,avg_frame_rate,nb_frames",
    "-of",
    "json",
    outputPath,
  ]);
  const metadata = JSON.parse(stdout);
  const stream = metadata.streams?.find((item: { codec_type?: string }) => item.codec_type === "video");
  if (!stream || stream.codec_name !== "h264") throw new Error("Output validation failed: expected H.264 video.");
  const { width, height } = VIDEO_FORMATS[expected.format];
  const actualWidth = Number(stream.width);
  const actualHeight = Number(stream.height);
  const actualFps = String(stream.avg_frame_rate || "");
  const [fpsNumerator, fpsDenominator] = actualFps.split("/").map(Number);
  const fps = fpsDenominator ? Math.round(fpsNumerator / fpsDenominator) : Number(actualFps);
  const file = await stat(outputPath);
  const frameCount = Number(stream.nb_frames) || Math.round(Number(metadata.format?.duration || 0) * expected.fps);
  if (actualWidth !== width || actualHeight !== height || fps !== expected.fps) {
    throw new Error(`Output validation failed: got ${actualWidth}x${actualHeight} at ${fps} FPS.`);
  }
  return {
    url: outputUrl("pending"),
    filename: safeFilename(expected.filename, "contactreel.mp4"),
    mimeType: "video/mp4",
    size: file.size,
    width: actualWidth,
    height: actualHeight,
    fps,
    duration: Number(Number(metadata.format?.duration || 0).toFixed(3)),
    frameCount,
    codec: stream.codec_name,
    hasAudio: metadata.streams?.some((item: { codec_type?: string }) => item.codec_type === "audio") || false,
  };
}

async function normalizeImage(
  sourcePath: string,
  outputPath: string,
  width: number,
  height: number,
) {
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    sourcePath,
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},setsar=1`,
    "-frames:v",
    "1",
    "-c:v",
    "mjpeg",
    "-q:v",
    "2",
    "-y",
    outputPath,
  ]);
}

async function uploadToSupabase(job: JobRecord, outputPath: string, filename: string) {
  const bucket = process.env.SUPABASE_RENDER_BUCKET || "reel-renders";
  if (!isSupabaseConfigured()) return undefined;
  const year = new Date().getUTCFullYear();
  const month = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const remotePath = `${year}/${month}/${filename}`;
  const body = await readFile(outputPath);
  const response = await supabaseRequest(
    `/storage/v1/object/${encodeURIComponent(bucket)}/${remotePath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "video/mp4",
        "x-upsert": "true",
      },
      body,
    },
  );
  if (!response.ok) throw new Error(`Supabase output upload failed (${response.status}).`);
  const signed = await supabaseRequest(
    `/storage/v1/object/sign/${encodeURIComponent(bucket)}/${remotePath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { expiresIn: 60 * 60 * 24 },
    },
  );
  if (!signed.ok) throw new Error(`Supabase signed URL creation failed (${signed.status}).`);
  const signedPayload = (await signed.json()) as { signedURL?: string };
  if (!signedPayload.signedURL) throw new Error("Supabase did not return a signed URL.");
  return true;
}

async function sendCallback(job: JobRecord) {
  const callbackUrl = job.input.callbackUrl;
  if (!callbackUrl) return;
  const payload = JSON.stringify(toResponse(job));
  const secret = process.env.WEBHOOK_SECRET;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["X-ContactReel-Signature"] = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    const response = await fetch(callbackUrl, { method: "POST", headers, body: payload });
    if (!response.ok) logger.warn({ jobId: job.id, status: response.status }, "render callback returned an error");
  } catch (error) {
    logger.warn({ jobId: job.id, error }, "render callback failed");
  }
}

async function runJob(job: JobRecord) {
  const jobDir = path.join(renderRoot, job.id);
  await mkdir(jobDir, { recursive: true });
  try {
    job.startedAt = Date.now();
    job.status = "rendering";
    job.stage = "Preparing photos";
    job.progress = 5;
    await validateFfmpeg();
    if (job.cancelled) throw new Error("Render cancelled.");
    const cost = estimateRenderCost(
      job.input.duration,
      job.input.fps,
      job.input.format,
      0,
      job.input.quality,
    );
    if (cost.likelyHeavy && job.input.duration > 600) {
      throw new Error("This project is too large for the configured worker. Reduce duration or quality.");
    }
    const images = await resolveSourceImages(job.input.sourceId, jobDir);
    if (images.length === 0) throw new Error(`Source "${job.input.sourceId}" was not found.`);
    const imageIds = images.map((image) => image.id);
    const { width, height } = VIDEO_FORMATS[job.input.format];
    job.stage = "Generating sequence";
    job.progress = 12;
    const timeline = calculateTimeline(
      imageIds,
      job.input.duration,
      job.input.photoDuration,
      job.input.fps,
      job.input.sequence,
      job.seed,
    );
    const segmentCount = Math.ceil(timeline.frameCount / timeline.photoFrameCount);
    const normalizedDir = path.join(jobDir, "normalized");
    await mkdir(normalizedDir, { recursive: true });
    const normalized = new Map<string, string>();
    for (const [index, image] of images.entries()) {
      const normalizedPath = path.join(normalizedDir, `${index}.jpg`);
      await normalizeImage(image.filePath, normalizedPath, width, height);
      normalized.set(image.id, normalizedPath);
    }
    const manifest = path.join(jobDir, "sequence.txt");
    const lines: string[] = [];
    for (let index = 0; index < segmentCount; index += 1) {
      const imageId = timeline.frames[Math.min(index * timeline.photoFrameCount, timeline.frames.length - 1)]?.imageId;
      const image = images.find((candidate) => candidate.id === imageId) || images[index % images.length];
      const normalizedPath = normalized.get(image.id) || image.filePath;
      lines.push(`file '${normalizedPath.replace(/'/g, "'\\''")}'`);
      lines.push(`duration ${timeline.photoFrameCount / job.input.fps}`);
    }
    const lastImage = images.find((image) => image.id === timeline.frames[timeline.frames.length - 1]?.imageId) || images[0];
    const normalizedLastPath = normalized.get(lastImage.id) || lastImage.filePath;
    lines.push(`file '${normalizedLastPath.replace(/'/g, "'\\''")}'`);
    await writeFile(manifest, `${lines.join("\n")}\n`);
    if (job.cancelled) throw new Error("Render cancelled.");

    const outputFilename = safeFilename(job.input.filename, `contactreel_${job.id}.mp4`);
    const outputPath = path.join(renderRoot, `${job.id}-${outputFilename}`);
    const crf = { draft: "28", high: "19", maximum: "15" }[job.input.quality];
    const preset = { draft: "veryfast", high: "medium", maximum: "slow" }[job.input.quality];
    job.stage = "Rendering frames";
    job.progress = 20;
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      manifest,
      "-fps_mode",
      "cfr",
      "-r",
      String(job.input.fps),
      "-frames:v",
      String(timeline.frameCount),
      "-c:v",
      "libx264",
      "-preset",
      preset,
      "-crf",
      crf,
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      "-y",
      outputPath,
    ];
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    job.child = child;
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 5000) stderr = stderr.slice(-5000);
    });
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        job.child = undefined;
        if (job.cancelled || signal === "SIGTERM") reject(new Error("Render cancelled."));
        else if (code !== 0) reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}.`));
        else resolve();
      });
    });
    job.stage = "Validating output";
    job.progress = 85;
    const output = await probeOutput(outputPath, job.input);
    output.filename = outputFilename;
    output.url = outputUrl(job.id);
    job.stage = "Uploading";
    job.progress = 94;
    await uploadToSupabase(job, outputPath, outputFilename);
    job.stage = "Ready";
    job.progress = 100;
    job.status = "completed";
    job.output = output;
    job.outputPath = outputPath;
    logger.info({ jobId: job.id, width: output.width, height: output.height, fps: output.fps, frameCount: output.frameCount }, "render completed");
  } catch (error) {
    if (job.cancelled || (error instanceof Error && error.message === "Render cancelled.")) {
      job.status = "cancelled";
      job.stage = "Cancelled";
      job.progress = 0;
      job.error = { code: "CANCELLED", message: "Render cancelled by the user." };
      logger.info({ jobId: job.id }, "render cancelled");
    } else {
      job.status = "failed";
      job.stage = "Failed";
      job.progress = 0;
      job.error = {
        code: "RENDER_ERROR",
        message: error instanceof Error ? error.message : "Render failed.",
      };
      logger.error({ jobId: job.id, error }, "render failed");
    }
  } finally {
    job.child = undefined;
    await rm(jobDir, { recursive: true, force: true });
    await sendCallback(job);
    activeJobId = undefined;
    void runNext();
  }
}

async function runNext() {
  if (activeJobId || queue.length === 0) return;
  const nextId = queue.shift();
  if (!nextId) return;
  const job = jobs.get(nextId);
  if (!job || job.cancelled) return void runNext();
  activeJobId = nextId;
  await runJob(job);
}

export function createRenderJob(input: RenderInput, idempotencyKey?: string) {
  if (idempotencyKey) {
    const existingId = idempotency.get(idempotencyKey);
    if (existingId) {
      const existing = jobs.get(existingId);
      if (existing) return { job: existing, reused: true };
    }
  }
  const seed = input.seed ?? randomBytes(4).readUInt32BE(0) % 2_147_483_647;
  const id = `cr_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const job: JobRecord = {
    id,
    input: { ...input, seed },
    seed,
    createdAt: Date.now(),
    status: "queued",
    progress: 0,
    stage: "Queued",
  };
  jobs.set(id, job);
  if (idempotencyKey) idempotency.set(idempotencyKey, id);
  queue.push(id);
  logger.info({ jobId: id, sourceId: input.sourceId }, "render job queued");
  void runNext();
  return { job, reused: false };
}

export function getRenderJob(jobId: string) {
  return jobs.get(jobId);
}

export function cancelRenderJob(jobId: string) {
  const job = jobs.get(jobId);
  if (!job) return undefined;
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") return job;
  job.cancelled = true;
  if (job.child) job.child.kill("SIGTERM");
  if (job.status === "queued") {
    job.status = "cancelled";
    job.stage = "Cancelled";
    job.progress = 0;
    job.error = { code: "CANCELLED", message: "Render cancelled by the user." };
  }
  return job;
}

export function cancelAllRenderJobs() {
  const cancelledJobIds: string[] = [];
  for (const job of jobs.values()) {
    if (job.status === "queued" || job.status === "rendering") {
      cancelRenderJob(job.id);
      cancelledJobIds.push(job.id);
    }
  }
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const queuedJob = jobs.get(queue[index]);
    if (!queuedJob || queuedJob.status === "cancelled") queue.splice(index, 1);
  }
  return {
    cancelledJobIds,
    cancelledCount: cancelledJobIds.length,
    activeJobId: activeJobId || null,
    queueDepth: queue.length,
  };
}

export function renderJobResponse(job: JobRecord) {
  return toResponse(job);
}

export function renderAcceptedResponse(job: JobRecord) {
  return renderAccepted(job);
}

export async function getRenderFile(jobId: string) {
  const job = jobs.get(jobId);
  if (!job?.outputPath || job.status !== "completed") return undefined;
  try {
    await stat(job.outputPath);
    return { path: job.outputPath, filename: job.output?.filename || `contactreel_${jobId}.mp4` };
  } catch {
    return undefined;
  }
}

export function queueStatus() {
  return { queueDepth: queue.length, worker: true, active: Boolean(activeJobId) };
}

export function ffmpegAvailable() {
  return execFileAsync("ffmpeg", ["-version"]).then(() => true).catch(() => false);
}

export function checkCallbackUrl(value: string | null | undefined) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const cleanupInterval = setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [jobId, job] of jobs.entries()) {
    if (job.createdAt < cutoff && ["completed", "failed", "cancelled"].includes(job.status)) {
      jobs.delete(jobId);
      void rm(job.outputPath || path.join(renderRoot, `${jobId}-`), { force: true }).catch(() => undefined);
    }
  }
}, 60 * 60 * 1000);
cleanupInterval.unref();