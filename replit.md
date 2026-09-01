# ContactReel

ContactReel creates deterministic, high-quality photo montage MP4s from a compact browser editor or an automation-friendly REST API.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API and render worker
- `pnpm --filter @workspace/contactreel run dev` — run the ContactReel editor
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/contactreel-core run test` — deterministic sequence/timeline/crop tests
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Optional env: Supabase URL/service key, storage bucket names, API key secret, webhook secret; see `.env.example`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod 4-generated API schemas
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/contactreel-core/src/index.ts` — shared project types, deterministic sequence/timeline logic, crop math, and render cost estimation
- `lib/api-spec/openapi.yaml` — REST contract source of truth
- `artifacts/api-server/src/lib/source-store.ts` — source validation, temporary image storage, and Supabase image resolution
- `artifacts/api-server/src/lib/render-service.ts` — queue, FFmpeg worker, FFprobe output validation, cancellation, webhooks, and cleanup
- `artifacts/contactreel/src/` — browser editor
- `README.md` — setup, deployment, Supabase, n8n, architecture, and test instructions

## Architecture decisions

- Preview/export share the core timeline; a new seed is created only when the user explicitly regenerates.
- FFmpeg is authoritative for MP4 output; browser playback is preview-only.
- The first deployment uses one controlled in-process worker to avoid requiring Redis; the service boundary is queue-provider agnostic.
- Supabase is optional at runtime for local development but supported server-side for private source and render buckets.

## Product

- Upload JPEG/JPG, PNG, and WebP photographs with drag/drop and file picker support.
- Configure duration, photo duration, aspect ratio, FPS, quality, and sequence mode.
- Preview the locked sequence, regenerate it with a new seed, and export a real H.264 MP4.
- Poll/cancel renders, download completed outputs, and trigger renders from n8n with only a source ID and settings.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
