# Migrating ContactReel to an Independent Git Repository

These steps assume the current builder is unavailable. The Git repository is the source of truth.

## 1. Clone and install

```bash
git clone <your-repository-url> contactreel
cd contactreel
corepack enable
pnpm install
```

The repository intentionally uses pnpm. `npm install` and Yarn are rejected to prevent lockfile drift.

## 2. Configure environment

```bash
cp .env.example .env
```

Set:

- `PORT` for the Express API
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for Supabase Storage
- `SUPABASE_IMAGE_BUCKET` and `SUPABASE_RENDER_BUCKET` if using non-default bucket names
- `API_KEY_SECRET` for automation authentication
- `WEBHOOK_SECRET` for signed callback verification
- `DATABASE_URL` only when using the optional Postgres/Drizzle migration tooling

Do not expose service-role, API, or webhook secrets to the browser.

## 3. Recreate Supabase

Create a Supabase project and run the SQL in `supabase/migrations/0001_contactreel.sql` using the Supabase SQL editor or CLI migration workflow.

The migration creates:

- `contactreel_sources`
- `contactreel_source_images`
- `contactreel_render_jobs`
- indexes, uniqueness constraints, status checks, timestamp trigger, and RLS defaults
- private `reel-images` and `reel-renders` buckets
- service-role-only storage policies

### Storage layout

```text
reel-images/
  <sourceId>/
    001.jpg
    002.png
    003.webp

reel-renders/
  2026/
    09/
      contactreel_<jobId>.mp4
```

Both buckets are private. The API uses the service role to list/download source images and upload outputs. Output access is provided through signed URLs. JPEG/JPG, PNG, and WebP are accepted for inputs.

## 4. Install FFmpeg

Install FFmpeg and FFprobe through the host package manager and confirm:

```bash
ffmpeg -version
ffprobe -version
```

The render worker fails explicitly if either executable is unavailable. No browser recording API is required.

## 5. Run locally

Use two terminals:

```bash
# terminal 1
pnpm run dev:api

# terminal 2
pnpm run dev:web
```

The API is available at `http://localhost:8080/api` by default and the editor at `http://localhost:5173`.

## 6. Verify

```bash
curl http://localhost:8080/api/v1/health
pnpm run typecheck
pnpm test
pnpm run build:web
pnpm run build:api
```

For an end-to-end render, upload a source with `POST /api/v1/sources`, call `POST /api/v1/render`, poll `GET /api/v1/render/:jobId`, and download `GET /api/v1/render/:jobId/download`.

## 7. Deploy

Deploy the API and static Vite output as separate services or behind one reverse proxy:

```bash
pnpm run build:web
pnpm run build:api
pnpm start
```

Serve `artifacts/contactreel/dist/public` as the static frontend and proxy `/api` to the Express process. Set the same server environment variables in the deployment platform.

For a single process, the API’s in-process queue is adequate. Before running multiple API replicas, move active jobs and idempotency records to a shared queue/Postgres implementation based on the included migration.

## 8. n8n integration

Configure an n8n HTTP Request node:

```http
POST https://your-domain.example/api/v1/render
Authorization: Bearer {{$env.CONTACTREEL_API_KEY}}
Idempotency-Key: {{$execution.id}}
Content-Type: application/json
```

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
  "callbackUrl": "https://n8n.example/webhook/contactreel"
}
```

Poll the returned `jobId` or use the callback. Validate `X-ContactReel-Signature` with the configured webhook secret.