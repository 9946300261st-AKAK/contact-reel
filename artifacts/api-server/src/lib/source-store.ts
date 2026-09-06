import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Source, SourceInput } from "@workspace/api-zod";
import { logger } from "./logger";
import {
  isSupabaseConfigured as managedSupabaseConfigured,
  supabaseRequest,
} from "./supabase-connector";

const execFileAsync = promisify(execFile);
const sourceRoot = path.join(tmpdir(), "contactreel-sources");
const maxImageBytes = 35 * 1024 * 1024;

export type StoredImage = {
  id: string;
  name: string;
  contentType: string;
  filePath: string;
  width: number;
  height: number;
};

type StoredSource = {
  id: string;
  name: string;
  createdAt: string;
  images: StoredImage[];
};

const sources = new Map<string, StoredSource>();

function safeId(value: string) {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function extensionFor(contentType: string) {
  return contentType === "image/png"
    ? ".png"
    : contentType === "image/webp"
      ? ".webp"
      : ".jpg";
}

function decodeDataUrl(dataUrl: string, contentType: string) {
  const expectedPrefix = `data:${contentType};base64,`;
  if (!dataUrl.startsWith(expectedPrefix)) {
    throw new Error(`Image data for ${contentType} is not a valid base64 data URL.`);
  }
  const buffer = Buffer.from(dataUrl.slice(expectedPrefix.length), "base64");
  if (buffer.length === 0 || buffer.length > maxImageBytes) {
    throw new Error("Image data is empty or exceeds the 35 MB per-image limit.");
  }
  return buffer;
}

async function probeImage(filePath: string) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "json",
    filePath,
  ]);
  const stream = JSON.parse(stdout).streams?.[0];
  if (!stream?.width || !stream?.height) {
    throw new Error("Image could not be decoded or has no usable dimensions.");
  }
  return { width: Number(stream.width), height: Number(stream.height) };
}

function sourceToResponse(source: StoredSource): Source {
  return {
    id: source.id,
    name: source.name,
    imageCount: source.images.length,
    images: source.images.map((image) => ({
      id: image.id,
      name: image.name,
      contentType: image.contentType,
      previewUrl: `/api/v1/sources/${source.id}/images/${image.id}`,
      width: image.width,
      height: image.height,
    })),
    createdAt: new Date(source.createdAt),
  };
}

export async function createLocalSource(input: SourceInput): Promise<Source> {
  if (!input.images.length) throw new Error("Add at least one image.");
  const id = `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const sourceDir = path.join(sourceRoot, id);
  await mkdir(sourceDir, { recursive: true });
  const images: StoredImage[] = [];
  try {
    for (const [index, image] of input.images.entries()) {
      const imageId = `img_${index.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const filePath = path.join(sourceDir, `${imageId}${extensionFor(image.contentType)}`);
      const buffer = decodeDataUrl(image.dataUrl, image.contentType);
      await writeFile(filePath, buffer, { flag: "wx" });
      const dimensions = await probeImage(filePath);
      images.push({
        id: imageId,
        name: image.name,
        contentType: image.contentType,
        filePath,
        ...dimensions,
      });
    }
  } catch (error) {
    await rm(sourceDir, { recursive: true, force: true });
    throw error;
  }
  const source: StoredSource = {
    id,
    name: input.name,
    createdAt: new Date().toISOString(),
    images,
  };
  sources.set(id, source);
  logger.info({ sourceId: id, imageCount: images.length }, "photo source created");
  return sourceToResponse(source);
}

export function listLocalSources() {
  return [...sources.values()].map(sourceToResponse);
}

export function getLocalSource(sourceId: string) {
  if (!safeId(sourceId)) return undefined;
  return sources.get(sourceId);
}

export function getLocalImage(sourceId: string, imageId: string) {
  const source = getLocalSource(sourceId);
  if (!source || !safeId(imageId)) return undefined;
  return source.images.find((image) => image.id === imageId);
}

async function resolveSupabaseImages(sourceId: string, workspace: string) {
  if (!managedSupabaseConfigured()) return undefined;
  const bucket = process.env.SUPABASE_IMAGE_BUCKET || "reel-images";
  if (!safeId(sourceId)) throw new Error("Invalid sourceId.");
  const listResponse = await supabaseRequest(
    `/storage/v1/object/list/${encodeURIComponent(bucket)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        prefix: `${sourceId}/`,
        limit: 100,
        sortBy: { column: "name", order: "asc" },
      },
    },
  );
  if (!listResponse.ok) {
    throw new Error(`Supabase source lookup failed (${listResponse.status}).`);
  }
  const listed = (await listResponse.json()) as Array<{ name?: string }>;
  const imageFiles = listed.filter((item) => /\.(jpe?g|png|webp)$/i.test(item.name || ""));
  if (imageFiles.length === 0) throw new Error(`No supported images found for source "${sourceId}".`);

  const images: StoredImage[] = [];
  for (const [index, item] of imageFiles.entries()) {
    const relativePath = item.name || "";
    const remotePath = `${sourceId}/${relativePath}`;
    const response = await supabaseRequest(
      `/storage/v1/object/${encodeURIComponent(bucket)}/${remotePath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
    );
    if (!response.ok) throw new Error(`Supabase image download failed (${response.status}).`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > maxImageBytes) {
      throw new Error(`Supabase image "${relativePath}" is empty or exceeds the 35 MB limit.`);
    }
    const localPath = path.join(workspace, `supabase_${index}_${path.basename(relativePath)}`);
    await writeFile(localPath, buffer);
    const dimensions = await probeImage(localPath);
    images.push({
      id: `supabase_${index}`,
      name: path.basename(relativePath),
      contentType: /\.(png)$/i.test(relativePath)
        ? "image/png"
        : /\.(webp)$/i.test(relativePath)
          ? "image/webp"
          : "image/jpeg",
      filePath: localPath,
      ...dimensions,
    });
  }
  return images;
}

export async function resolveSourceImages(sourceId: string, workspace: string) {
  const localSource = getLocalSource(sourceId);
  if (localSource) return localSource.images;
  return (await resolveSupabaseImages(sourceId, workspace)) || [];
}

export async function readStoredImage(image: StoredImage) {
  return readFile(image.filePath);
}

export function isSupabaseConfigured() {
  return managedSupabaseConfigured();
}