# Contributing to ContactReel

## Prerequisites

- Node.js 20+ (the project is tested with Node.js 24)
- pnpm 10+
- FFmpeg and FFprobe on `PATH`
- Supabase credentials only when testing durable source/output storage

This repository intentionally enforces pnpm in its `preinstall` script. Use `corepack enable` or install pnpm directly; do not generate a second lockfile with npm or Yarn.

## Project structure

```text
artifacts/contactreel/       React/Vite editor
artifacts/api-server/        Express API and render worker
lib/api-spec/                OpenAPI source of truth
lib/api-client-react/        Generated React Query client
lib/api-zod/                 Generated server validation schemas
lib/contactreel-core/        Shared deterministic sequence/timeline engine
lib/db/                      Optional Drizzle/Postgres connection and schema
supabase/migrations/         Portable SQL for Supabase/Postgres
```

## Development commands

```bash
pnpm install
pnpm run dev:api       # API on PORT, defaults to 8080
pnpm run dev:web       # Vite editor on PORT, defaults to 5173
pnpm run typecheck
pnpm test
pnpm run build:web
pnpm run build:api
pnpm start             # start the built API
```

Run the API and editor in separate terminals during development. Replit workflows are conveniences; no source code depends on them.

## Environment configuration

Copy `.env.example` to `.env` and fill only the values needed for the workflow. Never commit `.env`, Supabase service-role keys, API keys, webhook secrets, uploaded photos, or generated videos.

`DATABASE_URL` is only needed for the optional Drizzle migration tooling and future shared persistence. The current single-process render path can run without it. `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be placed in Vite client variables.

## Testing and build

The deterministic engine has focused Node tests:

```bash
pnpm --filter @workspace/contactreel-core run test
```

The full check is:

```bash
pnpm run typecheck
pnpm test
PORT=5173 BASE_PATH=/ pnpm run build:web
pnpm run build:api
```

For a render smoke test, create a local source with `POST /api/v1/sources`, queue a one-second 30 FPS render, poll its job ID, download the MP4, and inspect it with `ffprobe`.

## Rendering changes

### Changing the sequence engine

Edit `lib/contactreel-core/src/index.ts`, update or add deterministic tests, then run the core test suite. Keep the seed semantics stable: a given source pool, mode, settings, and seed must produce the same sequence.

### Changing FFmpeg settings

Edit the worker in `artifacts/api-server/src/lib/render-service.ts`. Preserve:

- final output dimensions from `VIDEO_FORMATS`
- exact frame count from the shared timeline
- CFR output
- H.264 encoding
- independent FFprobe validation

Add a real render smoke test when changing filters, concat handling, codec settings, or output metadata.

### Adding a future output format

1. Add the format to `lib/contactreel-core` and `lib/api-spec/openapi.yaml`.
2. Regenerate API clients/schemas with the existing OpenAPI codegen command.
3. Add UI controls and a worker encoder branch.
4. Add output validation expectations and tests.
5. Update README, architecture, and migration documentation.

## API changes

OpenAPI is authoritative. Update `lib/api-spec/openapi.yaml` first, regenerate clients, then update server routes and tests. Do not hand-edit generated API files.

## Pull requests

Before opening a pull request:

1. Run typecheck, tests, and both production builds.
2. Check `git diff --check`.
3. Confirm no secret, uploaded media, `dist/`, `node_modules/`, or temporary files are staged.
4. Describe any behavior change to sequence determinism, timing, storage, authentication, or callbacks.