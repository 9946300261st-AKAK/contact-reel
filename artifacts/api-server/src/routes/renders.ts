import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import {
  CreateRenderBody,
  CreateRenderHeader,
  GetRenderParams,
} from "@workspace/api-zod";
import {
  cancelRenderJob,
  cancelAllRenderJobs,
  createRenderJob,
  getRenderFile,
  getRenderJob,
  isApiKeyValid,
  renderAcceptedResponse,
  renderJobResponse,
  checkCallbackUrl,
} from "../lib/render-service";

const router: IRouter = Router();
const rateWindowMs = 60_000;
const requestCounts = new Map<string, { startedAt: number; count: number }>();

function renderRateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const max = Math.max(1, Number(process.env.RENDER_RATE_LIMIT_PER_MINUTE || 30));
  const current = requestCounts.get(key);
  const bucket = !current || now - current.startedAt >= rateWindowMs
    ? { startedAt: now, count: 0 }
    : current;
  bucket.count += 1;
  requestCounts.set(key, bucket);
  res.setHeader("X-RateLimit-Limit", String(max));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
  if (bucket.count > max) {
    res.status(429).json({ error: "Render rate limit exceeded. Try again shortly.", code: "RATE_LIMITED" });
    return;
  }
  next();
}

function bearerToken(req: Request) {
  const header = req.header("Authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
}

function requireRenderAuth(req: Request, res: Response, next: NextFunction) {
  if (!isApiKeyValid(bearerToken(req))) {
    res.status(401).json({ error: "A valid Bearer API key is required.", code: "UNAUTHORIZED" });
    return;
  }
  next();
}

router.post("/v1/render", renderRateLimit, requireRenderAuth, (req, res) => {
  const body = CreateRenderBody.safeParse(req.body);
  const header = CreateRenderHeader.safeParse({ "Idempotency-Key": req.header("Idempotency-Key") });
  if (!body.success || !header.success || !checkCallbackUrl(body.success ? body.data.callbackUrl : undefined)) {
    res.status(400).json({ error: "Invalid render settings or callback URL.", code: "INVALID_RENDER" });
    return;
  }
  const { job, reused } = createRenderJob(body.data, header.data["Idempotency-Key"]);
  res.status(reused ? 200 : 202).json(renderAcceptedResponse(job));
});

router.get("/v1/render/:jobId", (req, res) => {
  const parsed = GetRenderParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid job id.", code: "INVALID_JOB_ID" });
    return;
  }
  const job = getRenderJob(parsed.data.jobId);
  if (!job) {
    res.status(404).json({ error: "Render job not found.", code: "JOB_NOT_FOUND" });
    return;
  }
  res.json(renderJobResponse(job));
});

router.post("/v1/render/:jobId/cancel", renderRateLimit, requireRenderAuth, (req, res) => {
  const parsed = GetRenderParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid job id.", code: "INVALID_JOB_ID" });
    return;
  }
  const job = cancelRenderJob(parsed.data.jobId);
  if (!job) {
    res.status(404).json({ error: "Render job not found.", code: "JOB_NOT_FOUND" });
    return;
  }
  res.json(renderJobResponse(job));
});

router.post("/v1/render/cancel-all", renderRateLimit, requireRenderAuth, (_req, res) => {
  res.json(cancelAllRenderJobs());
});

router.get("/v1/render/:jobId/download", async (req, res) => {
  const parsed = GetRenderParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid job id.", code: "INVALID_JOB_ID" });
    return;
  }
  const output = await getRenderFile(parsed.data.jobId);
  if (!output) {
    res.status(404).json({ error: "Completed render output not found.", code: "OUTPUT_NOT_FOUND" });
    return;
  }
  res.download(output.path, output.filename, (error) => {
    if (error && !res.headersSent) {
      res.status(500).json({ error: "The output could not be downloaded.", code: "DOWNLOAD_ERROR" });
    }
  });
});

export default router;