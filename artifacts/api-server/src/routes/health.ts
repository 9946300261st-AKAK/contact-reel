import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { ffmpegAvailable, queueStatus } from "../lib/render-service";
import { isSupabaseConfigured } from "../lib/source-store";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/v1/health", async (_req, res) => {
  const ffmpeg = await ffmpegAvailable();
  const queue = queueStatus();
  res.json({
    status: ffmpeg && queue.worker ? "ok" : "degraded",
    ffmpeg,
    supabase: isSupabaseConfigured(),
    worker: queue.worker,
    queueDepth: queue.queueDepth,
  });
});

export default router;
