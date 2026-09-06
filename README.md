# ContactReel

ContactReel turns a pool of photographs into fast-cut, high-quality vertical, square, or widescreen MP4 reels. The browser editor and the server renderer share one deterministic sequence and timeline engine, so the frame shown in preview is the frame exported by FFmpeg.

## Architecture summary

```text
React editor
  -> typed REST contract
  -> in-process render queue
  -> FFmpeg worker
  -> FFprobe validation
  -> optional Supabase Storage upload
```

- `lib/contactreel-core` contains seeded sequence generation, FPS-quantized timing, exact frame ranges, cover crop math, project validation, and render-cost estimation.
- `artifacts/api-server` exposes the REST API and owns temporary source files, queue state, FFmpeg processes, validation, cancellation, cleanup, and optional Supabase access.
- `artifacts/contactreel` is the browser editor. Its local source upload sends original image data to the API for a renderable temporary source; the API never needs this path for n8n automation.
- The queue is intentionally a small controlled worker pool (one active FFmpeg job) for the first Replit deployment. The render service boundary can be replaced by BullMQ or a separate worker without changing the frontend contract.

## Run locally

```bash
corepack enable
pnpm install
```

Run the API and web editor in separate terminals:

```bash
pnpm run dev:api
pnpm run dev:web
```

The API defaults to `http://localhost:8080`; the Vite editor defaults to `http://localhost:5173`. Set `PORT` or `BASE_PATH` when hosting them elsewhere. The project enforces pnpm so a clone cannot accidentally create a second lockfile with npm or Yarn.

## Environment

Copy `.env.example` to your local environment or add the values as environment variables. In Replit, attach the managed Supabase connector to the API environment and configure it with a `service_role` key. The API uses the connector proxy automatically, so `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are only needed for independent non-Replit clones. Service-role credentials are server-only and must never be exposed to the browser.

`DATABASE_URL` is only needed when using the optional Drizzle/Postgres connection and the portable migration tooling. The current one-worker mode does not require a database.

### Supabase setup

1. Create or connect a Supabase project through the Replit Supabase integration.
2. Use a `service_role` key for the attached connection. An anon key cannot list private Storage objects or create buckets.
3. Create private Storage buckets named `reel-images` and `reel-renders` (or apply `supabase/migrations/0001_contactreel.sql` with an administrator connection).
4. Arrange source images under `sourceId/filename.ext` in the image bucket.
5. The worker lists and downloads supported JPEG, PNG, and WebP files server-side. Completed MP4s are uploaded to the render bucket. The API keeps its local download route as the immediate result URL and also archives the file in the render bucket.

The local editor source endpoint is useful for manual projects without Supabase. It preserves original bytes in temporary storage until the source is used; it does not create a permanently public bucket.

## REST API

Base path: `/api`

```http
GET  /api/v1/health
GET  /api/healthz
GET  /api/v1/sources
POST /api/v1/sources
GET  /api/v1/sources/:sourceId
POST /api/v1/render
GET  /api/v1/render/:jobId
POST /api/v1/render/:jobId/cancel
GET  /api/v1/render/:jobId/download
```

`POST /api/v1/render` returns immediately with `202 Accepted`:

```json
{
  "sourceId": "campaign-042",
  "duration": 30,
  "photoDuration": 0.1,
  "format": "9:16",
  "fps": 30,
  "quality": "high",
  "sequence": "random",
  "seed": 183729,
  "callbackUrl": "https://example.com/webhook/contactreel"
}
```

Use `Authorization: Bearer <API_KEY_SECRET>` when `API_KEY_SECRET` is configured. Add `Idempotency-Key: unique-job-key` to make n8n retries reuse the same render job.

## n8n flow

1. Store images in Supabase Storage at `sourceId/filename.ext`.
2. Add an HTTP Request node:
   - Method: `POST`
   - URL: `https://your-contactreel-domain/api/v1/render`
   - Header: `Authorization: Bearer {{$env.CONTACTREEL_API_KEY}}`
   - Header: `Idempotency-Key: {{$json.executionId}}`
   - JSON body: the payload above.
3. Poll `GET /api/v1/render/{{$json.jobId}}`, or use `callbackUrl`.
4. When status is `completed`, consume `output.url` or GET the download route.

Webhook payloads mirror the job response. When `WEBHOOK_SECRET` is set, validate the HMAC-SHA256 hex digest in `X-ContactReel-Signature` against the raw JSON body.

## Export pipeline

1. Validate all settings at the HTTP boundary.
2. Resolve the source from local temporary storage or Supabase.
3. Probe every source image with FFprobe so corrupt files fail explicitly.
4. Generate the seeded sequence from the active pool.
5. Convert photo duration to whole frames using `round(photoDuration * fps)`, with a minimum of one frame.
6. Build an exact `round(duration * fps)` frame timeline.
7. Feed an FFmpeg concat manifest into a final-resolution Lanczos scale/crop filter.
8. Encode silent H.264 MP4 with a quality preset (`draft`, `high`, or `maximum`) using CRF rather than a fixed bitrate.
9. Probe the generated file independently for container, codec, dimensions, FPS, duration, frame count, audio presence, and file size.
10. Upload to Supabase when configured, return a signed URL, clean the job workspace, and keep only the completed local output needed by the download route.

The export engine does not use `requestAnimationFrame`, `canvas.captureStream`, or `MediaRecorder`.

## Portable deployment

The repository does not require the current builder to develop or deploy ContactReel. Use `ARCHITECTURE.md` for system boundaries, `CONTRIBUTING.md` for development conventions, and `MIGRATION.md` for a clean-environment migration checklist.

```bash
pnpm install
pnpm run build:web
pnpm run build:api
pnpm start
```

Serve `artifacts/contactreel/dist/public` as the static frontend and proxy `/api` to the API process. Install FFmpeg and FFprobe on the host and provide the server variables in `.env`.

## Replit deployment

The project also includes Replit workflow/artifact configuration for convenient Replit deployment. Publish after setting the environment variables above. FFmpeg and FFprobe are detected at runtime; the health endpoint reports whether they are available.

The API currently uses an in-process single-worker queue, which avoids requiring Redis during the first deployment. For multiple API replicas, move `render-service.ts` queue state into a shared queue and store job metadata in PostgreSQL or Supabase before scaling horizontally.

## Tests

Run the deterministic core test suite:

```bash
pnpm --filter @workspace/contactreel-core run test
```

The suite covers seeded reproducibility, immediate-repeat avoidance, sequential cycling, exact 30 FPS frame counts, short-duration quantization, and cover crop behavior for portrait, landscape, and square images. Runtime output validation is performed by FFprobe in the render worker after every completed export.