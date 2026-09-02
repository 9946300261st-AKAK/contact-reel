# ContactReel Architecture

ContactReel is a browser editor backed by an HTTP API and a deterministic FFmpeg worker. The repository is intentionally self-contained: the UI, API contract, shared sequence engine, render worker, tests, and Supabase migration are all versioned together.

## System diagram

```text
┌────────────────────┐
│ React/Vite editor  │
│ upload + preview   │
└─────────┬──────────┘
          │ typed REST requests
          ▼
┌────────────────────┐       ┌──────────────────────┐
│ Express API        │──────▶│ in-process job queue │
│ auth + validation  │       │ one active worker    │
└──────┬─────────────┘       └──────────┬───────────┘
       │                                │
       │ source resolution              │ FFmpeg + FFprobe
       ▼                                ▼
┌────────────────────┐       ┌──────────────────────┐
│ Local temp files   │       │ H.264 MP4 output     │
│ or Supabase image  │       │ validation + cleanup │
│ bucket             │       └──────────┬───────────┘
└────────────────────┘                  │
                                       ▼
                              Supabase render bucket
                              or download endpoint

n8n ──POST /render──▶ API ──callback/poll──▶ n8n
```

## Frontend

`artifacts/contactreel` is a responsive React/Vite editor. It loads source metadata, accepts JPEG/JPG, PNG, and WebP files, previews the deterministic sequence, and sends only the selected source ID plus render settings to the API. Object URLs are revoked when files are removed or the editor unmounts.

The browser preview imports the same `lib/contactreel-core` package as the worker. Random sequence previews use an explicit seed; the seed is sent with the render request so preview and export have the same order.

## API and authentication

`artifacts/api-server` is an Express application mounted under `/api`. Zod schemas generated from `lib/api-spec/openapi.yaml` validate source and render inputs at the HTTP boundary.

When `API_KEY_SECRET` is present, render creation and cancellation require `Authorization: Bearer <API_KEY_SECRET>`. GET status and download routes remain pollable by job ID. Render mutations have an IP-based per-minute rate limit controlled by `RENDER_RATE_LIMIT_PER_MINUTE`.

`Idempotency-Key` maps a retrying client request to the original job. Callback URLs are restricted to HTTP(S), and callback payloads can be verified with an HMAC-SHA256 digest in `X-ContactReel-Signature`.

## Queue and worker

The first deployment uses one in-process worker. A job is accepted, stored in memory, and processed FIFO. The worker reports stages (`Queued`, `Preparing photos`, `Generating sequence`, `Rendering frames`, `Validating output`, `Uploading`, `Ready`) and supports SIGTERM cancellation of the FFmpeg child process.

This choice keeps local setup small and makes the behavior deterministic. For multiple API replicas, replace the queue map with a shared queue and persist job metadata using the included SQL model.

## Sequence and timeline engine

`lib/contactreel-core` is the source of truth for:

- seeded random and sequential source ordering
- no immediate repeats across random shuffle passes
- FPS-quantized photo duration
- exact `round(duration × FPS)` frame counts
- frame-to-image ranges and timestamps
- centered cover crop math
- project validation and render-cost estimates

The worker normalizes every original image into a final-resolution, cover-cropped JPEG before building the concat manifest. This prevents mixed source dimensions from changing timestamps in FFmpeg’s still-image concat demuxer.

## FFmpeg and FFprobe

FFmpeg produces silent H.264 MP4 files at:

- `9:16`: 1080×1920
- `1:1`: 1080×1080
- `16:9`: 1920×1080

Quality presets map to CRF/preset pairs. FFprobe independently verifies codec, dimensions, FPS, duration, frame count, audio absence, and file size before a job is marked complete.

## Supabase and storage

Supabase is optional for local development. When configured, the service-role key remains server-only. The image bucket is private and expects files under `sourceId/filename.ext`. The render bucket is private and receives completed MP4s under a UTC year/month prefix. The API returns a signed render URL when upload succeeds.

The storage and database recreation plan is in `MIGRATION.md` and `supabase/migrations/0001_contactreel.sql`.

## n8n and webhooks

n8n can store source images in the image bucket, call `POST /api/v1/render` with `sourceId` and settings, then poll the job endpoint or provide `callbackUrl`. The callback body mirrors the job status response. Configure `WEBHOOK_SECRET` to authenticate callbacks.

## Persistence boundary

The current manual upload source registry and active queue are process-local to keep the initial project dependency-light. Supabase Storage is the durable path for automation. The optional Postgres migration defines durable sources, source images, render jobs, idempotency keys, and output metadata for a future shared-worker deployment.