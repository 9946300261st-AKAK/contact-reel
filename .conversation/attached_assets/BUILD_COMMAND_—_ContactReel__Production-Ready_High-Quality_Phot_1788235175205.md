# BUILD COMMAND — ContactReel: Production-Ready High-Quality Photo Reel Generator

Build a complete, production-ready web application called **ContactReel**.

This is not a visual mockup, prototype, or static HTML demo.

The final project must be fully functional and deployable on **Replit**, with:

- A polished browser-based editor
- High-quality deterministic video rendering
- Server-side FFmpeg rendering for reliable MP4/H.264 export
- Supabase Storage integration for image/output storage
- A clean REST API designed specifically for automation systems such as n8n
- A job/queue-based rendering architecture
- Proper cancellation, error handling, memory management, and cleanup
- Complete README and deployment instructions

The original ContactReel concept should be preserved, but the underlying implementation must be substantially rebuilt.

---

# 1. PRODUCT PURPOSE

ContactReel creates fast-paced vertical and horizontal photo montage videos.

The application allows a user to:

1. Upload/select a collection of photographs.
2. Randomize their order.
3. Generate a rapid-cut montage.
4. Control total video duration.
5. Control photo duration.
6. Select aspect ratio.
7. Select FPS.
8. Select export quality.
9. Preview the resulting sequence.
10. Regenerate/randomize the sequence.
11. Export a genuinely high-quality video.
12. Download the resulting MP4.

The application must also support automated rendering through an API.

The intended automation workflow is:

```text
Supabase image pool
        ↓
n8n
        ↓
ContactReel REST API
        ↓
Render Worker
        ↓
FFmpeg
        ↓
High-quality MP4
        ↓
Supabase Storage
        ↓
n8n
```

n8n should NOT need to upload image binaries directly to ContactReel.

Instead, n8n should primarily send:

- source/project ID
- total duration
- photo duration
- aspect ratio
- FPS
- quality
- sequence mode
- optional random seed
- optional callback URL

The rendering service retrieves the relevant images from Supabase.

---

# 2. CRITICAL ARCHITECTURAL REQUIREMENT

DO NOT reproduce the previous ContactReel export architecture.

The previous implementation used:

- Canvas
- canvas.captureStream(60)
- requestAnimationFrame()
- MediaRecorder
- 720×1280
- fixed 8 Mbps bitrate

DO NOT use this architecture as the production export engine.

In particular:

- Do not use requestAnimationFrame() as the authoritative video timeline.
- Do not depend on monitor refresh rate.
- Do not depend on live browser animation timing for export.
- Do not render at 720×1280 and upscale.
- Do not use a fixed 8 Mbps bitrate as the production quality strategy.
- Do not make MediaRecorder the primary MP4/H.264 renderer.

The production rendering pipeline must use deterministic frame/timestamp generation and a reliable server-side encoder.

Preferred architecture:

```text
Frontend
   ↓
REST API
   ↓
Render Queue
   ↓
Render Worker
   ↓
FFmpeg
   ↓
H.264
   ↓
MP4
```

The architecture must be modular enough that the render worker can later be moved from Replit to another server without rewriting the frontend.

---

# 3. DEPLOYMENT TARGET

The application will eventually be deployed publicly through **Replit**.

Build specifically for this environment.

The project must include:

- production start command
- development start command
- environment variable configuration
- FFmpeg availability detection
- Supabase configuration
- API authentication configuration
- CORS configuration
- health endpoint
- error logging
- graceful shutdown
- deployment instructions

Do not assume persistent local filesystem storage.

Replit's local filesystem must only be considered temporary.

Persistent assets must live in Supabase Storage.

---

# 4. RECOMMENDED TECHNOLOGY

Use a modern TypeScript-based architecture.

Preferred:

Frontend:

- React
- TypeScript
- modern CSS or Tailwind
- Vite or an appropriate Replit-compatible frontend setup

Backend:

- Node.js
- TypeScript
- Express/Fastify or another lightweight production-ready HTTP framework

Rendering:

- FFmpeg
- server-side deterministic rendering
- worker architecture

Storage:

- Supabase Storage
- Supabase PostgreSQL where database persistence is useful

Queue:

- Redis + BullMQ if practical

If Replit constraints make Redis impractical for the first deployment, implement a clean abstraction so the queue can initially use a database-backed job system or controlled worker pool.

Do not create unnecessary infrastructure if it prevents the application from running reliably on Replit.

---

# 5. APPLICATION ARCHITECTURE

Structure the repository approximately like:

```text
contactreel/
│
├── apps/
│   ├── web/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── ...
│   │
│   ├── api/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── services/
│   │   └── ...
│   │
│   └── worker/
│       ├── renderer/
│       ├── encoder/
│       ├── jobs/
│       └── ...
│
├── packages/
│   ├── core/
│   │   ├── sequence/
│   │   ├── timeline/
│   │   ├── crop/
│   │   ├── validation/
│   │   └── schemas/
│   │
│   └── shared/
│
├── tests/
│
├── README.md
├── package.json
├── .env.example
└── deployment configuration
```

You may alter the exact structure if a better production architecture is appropriate.

The critical requirement is separation of:

- UI
- API
- rendering
- shared sequence/timeline logic
- storage

---

# 6. SHARED CORE ENGINE

Create a shared core module containing the deterministic logic.

It must be usable by both:

- frontend
- backend renderer

It should include functions equivalent to:

```text
generateSequence()
calculateTimeline()
calculateFrameRanges()
calculateCrop()
validateProject()
estimateRenderCost()
```

The browser preview and server export must use the SAME underlying project/sequence definition.

Do not independently implement randomization logic in the frontend and backend.

---

# 7. PROJECT JSON SCHEMA

Represent a ContactReel project as structured JSON.

Example:

```json
{
  "version": 1,
  "sourceId": "campaign-042",

  "video": {
    "format": "9:16",
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "duration": 30
  },

  "timing": {
    "photoDuration": 0.1
  },

  "sequence": {
    "mode": "random",
    "seed": 827391
  },

  "image": {
    "fit": "cover"
  },

  "quality": "high"
}
```

Validate all incoming project data.

Never trust API input.

---

# 8. DEFAULT VIDEO FORMATS

Support:

### Vertical

```text
1080 × 1920
9:16
```

Default.

### Square

```text
1080 × 1080
1:1
```

### Widescreen

```text
1920 × 1080
16:9
```

The architecture must allow additional resolutions later.

Never use 720×1280 as the main output.

---

# 9. FPS

Support:

```text
30 FPS
60 FPS
```

Default:

```text
30 FPS
```

The selected FPS must actually determine the rendered frame rate.

Do not merely use captureStream(60).

The generated MP4 must contain the correct frame-rate metadata.

---

# 10. DURATION

Total duration:

```text
Minimum: 0.5 seconds
Maximum: 20 minutes
Default: 30 seconds
```

Photo duration:

```text
Minimum: 0.03 seconds
Maximum: 10 seconds
Default: 0.10 seconds
```

The video timeline must be frame/timestamp authoritative.

For example:

```text
30 seconds × 30 FPS = 900 frames
```

The renderer must generate exactly the required frame/timestamp timeline.

Do not rely on:

```javascript
Math.round(totalDuration / photoDuration)
```

as the sole timing mechanism.

---

# 11. SHORT PHOTO DURATIONS

Photo durations must be quantized against the selected FPS.

Example:

At 30 FPS:

```text
0.03 seconds ≈ 1 frame
```

At 60 FPS:

```text
0.03 seconds ≈ 2 frames
```

Implement a clear deterministic rule.

The UI must inform the user that extremely short durations are quantized by FPS.

---

# 12. SEQUENCE ENGINE

Initial modes:

```text
Random
Sequential
```

Random should be the default.

Architecture should allow:

```text
Manual
```

later.

Random mode requirements:

- shuffle the photo pool
- avoid immediate repetition
- cycle through the pool when necessary
- reshuffle between passes
- avoid repeating the same image at a pass boundary where possible
- never accidentally treat the wrong array item as the final image
- use deterministic seeded randomness when a seed is provided

Example:

```text
Pool:
A B C D

Possible sequence:

C A D B | B C A D | D A C B
```

But the boundary should avoid:

```text
B | B
```

where possible.

---

# 13. RANDOM SEED

Support an optional seed.

Example:

```json
{
  "sequence": {
    "mode": "random",
    "seed": 183729
  }
}
```

Same:

```text
images + settings + seed
```

must produce the same sequence.

This is important for automation and reproducibility.

If no seed is provided, generate one and return it in the render response.

---

# 14. IMAGE STORAGE

Supabase Storage will be the persistent source of uploaded images.

Do NOT depend on Replit local storage for permanent image storage.

Recommended structure:

```text
reel-images/
    source-001/
        001.jpg
        002.jpg
        003.jpg

    source-002/
        001.jpg
        002.jpg
        003.jpg
```

The API should normally receive:

```json
{
  "sourceId": "source-002"
}
```

rather than raw image files.

The renderer then resolves the source ID to the appropriate images.

---

# 15. SUPABASE DATABASE

Use Supabase PostgreSQL where useful.

Possible tables:

```text
sources
source_images
render_jobs
render_outputs
api_keys
```

Example conceptual schema:

sources:

```text
id
name
created_at
```

source_images:

```text
id
source_id
storage_path
filename
width
height
enabled
sort_order
created_at
```

render_jobs:

```text
id
source_id
status
settings_json
progress
created_at
started_at
completed_at
error
```

render_outputs:

```text
id
job_id
storage_path
filename
mime_type
size
width
height
fps
duration
codec
created_at
```

Do not overengineer the database.

---

# 16. IMAGE QUALITY

Original images must NOT be unnecessarily recompressed during upload.

Preserve:

- original JPEG quality
- original PNG data
- original WebP data

At rendering time:

- decode source
- high-quality scale
- crop to target aspect ratio
- render at final output resolution

Do not permanently convert all source images to 720p thumbnails for rendering.

Thumbnails may be generated separately for UI purposes.

---

# 17. SUPPORTED IMAGE FORMATS

At minimum:

```text
JPEG
JPG
PNG
WebP
```

Detect:

- corrupt images
- unsupported formats
- invalid files
- missing files
- failed decoding

Do not silently discard them.

Report useful errors.

---

# 18. IMAGE CROP

Default:

```text
Cover
```

The image must completely fill the target frame.

Never stretch non-uniformly.

Examples:

Portrait → crop appropriately.

Landscape → crop appropriately.

Square → crop appropriately.

Maintain aspect ratio.

Use high-quality scaling.

Future architecture should allow:

```text
cover
contain
blurred-background
```

---

# 19. RENDERING ENGINE

Use server-side FFmpeg for the production export.

The renderer must:

1. Resolve source images.
2. Validate images.
3. Generate deterministic sequence.
4. Calculate exact timeline.
5. Render frames/images according to the timeline.
6. Encode H.264.
7. Package as MP4.
8. Validate output.
9. Upload output to Supabase Storage.
10. Return output metadata.
11. Clean temporary resources.

The renderer must NOT depend on requestAnimationFrame().

The renderer must NOT depend on browser refresh rate.

---

# 20. VIDEO ENCODING

Preferred:

```text
MP4
H.264
```

Use an appropriate quality-oriented encoder configuration.

Do not simply hardcode:

```text
8 Mbps
```

Use sensible quality parameters for 1080p.

Prefer CRF/CQ-style quality control where the selected H.264 encoder supports it.

Use appropriate encoding presets balancing:

- quality
- file size
- rendering speed

Quality presets:

### Draft

Faster rendering, smaller file.

### High

Recommended default.

High visual quality suitable for social media.

### Maximum

Highest practical quality with larger file size and slower encoding.

Do not blindly multiply bitrate between presets.

---

# 21. OUTPUT VALIDATION

After rendering, independently inspect the actual generated file.

Do NOT trust settings alone.

Use FFprobe or equivalent to verify:

- container
- codec
- width
- height
- FPS
- duration
- frame count
- bitrate where available
- audio track presence
- file size

Store actual metadata with the render result.

---

# 22. AUDIO

Initial version:

```text
Silent video
```

Do not add audio unnecessarily.

However, structure the renderer so that future audio can be added without redesigning the rendering engine.

---

# 23. REST API

Create a documented REST API.

At minimum:

```http
POST /api/v1/render
GET  /api/v1/render/:jobId
POST /api/v1/render/:jobId/cancel
GET  /api/v1/render/:jobId/download
GET  /api/v1/health
```

---

# 24. PRIMARY N8N ENDPOINT

The most important endpoint is:

```http
POST /api/v1/render
```

Example:

```json
{
  "sourceId": "campaign-042",

  "duration": 30,
  "photoDuration": 0.1,

  "format": "9:16",
  "fps": 30,

  "quality": "high",

  "sequence": "random",

  "seed": 183729
}
```

Optional:

```json
{
  "callbackUrl": "https://example.com/webhook/contactreel"
}
```

The API should not require n8n to upload image binaries.

---

# 25. API RESPONSE

Render creation should return quickly.

Example:

```json
{
  "jobId": "cr_82f91",
  "status": "queued",
  "seed": 183729
}
```

Use:

```text
202 Accepted
```

when appropriate.

Do NOT keep the HTTP request open for the entire render.

---

# 26. JOB STATUS

Example:

```http
GET /api/v1/render/cr_82f91
```

Queued:

```json
{
  "jobId": "cr_82f91",
  "status": "queued",
  "progress": 0
}
```

Rendering:

```json
{
  "jobId": "cr_82f91",
  "status": "rendering",
  "progress": 62,
  "stage": "encoding",
  "elapsedSeconds": 12,
  "estimatedRemainingSeconds": 8
}
```

Completed:

```json
{
  "jobId": "cr_82f91",
  "status": "completed",
  "progress": 100,

  "output": {
    "url": "...",
    "filename": "contactreel_cr_82f91.mp4",
    "mimeType": "video/mp4",
    "size": 18429342,
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "duration": 30,
    "codec": "h264"
  }
}
```

Failed:

```json
{
  "jobId": "cr_82f91",
  "status": "failed",
  "error": {
    "code": "ENCODER_ERROR",
    "message": "..."
  }
}
```

Never leave a job permanently stuck in:

```text
rendering
```

---

# 27. WEBHOOK CALLBACK

If callbackUrl is supplied:

When complete:

```http
POST callbackUrl
```

Example:

```json
{
  "jobId": "cr_82f91",
  "status": "completed",
  "output": {
    "url": "...",
    "filename": "contactreel_cr_82f91.mp4",
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "duration": 30,
    "codec": "h264"
  }
}
```

Also support failure callbacks.

Sign webhook requests with a secret if practical.

---

# 28. N8N-FRIENDLY DESIGN

The API should be easy to use with an n8n HTTP Request node.

The intended workflow should be:

```text
Trigger
 ↓
Supabase image source already exists
 ↓
HTTP Request
 ↓
POST /api/v1/render
 ↓
Wait / webhook
 ↓
GET output
 ↓
Cloudinary / social media / other automation
```

n8n should not need to understand:

- FFmpeg
- frame generation
- image cropping
- encoding
- sequence generation

ContactReel handles all of that.

---

# 29. API AUTHENTICATION

Protect the API.

Use API keys initially.

Example:

```http
Authorization: Bearer cr_live_xxxxxxxxx
```

Do not expose Supabase service-role credentials to the frontend.

Use server-side environment variables.

Support API-key authentication for n8n.

Implement basic rate limiting.

---

# 30. IDEMPOTENCY

Support:

```http
Idempotency-Key: unique-job-key
```

If the same request is submitted again with the same idempotency key, avoid unnecessarily creating duplicate expensive renders.

This is important for n8n retries.

---

# 31. WEB UI

Retain the original ContactReel personality:

- dark
- compact
- technical/editorial
- red and amber accents
- monospace labels
- minimal clutter

But significantly improve UX.

Structure:

```text
CONTACTREEL

Fast-paced photo montage generator

────────────────────────

STEP 01
PHOTOS

[ Drop photos here ]

Photo count: 42

[thumbnail grid]

[ Clear all ]

────────────────────────

STEP 02
VIDEO SETTINGS

Total duration
[ 30.0 sec ]

Photo duration
[ 0.10 sec ]

Aspect ratio
[ 9:16 ]

FPS
[ 30 ]

Quality
[ High ]

Sequence
[ Random ]

────────────────────────

STEP 03
PREVIEW & EXPORT

[ video preview ]

Frame 124 / 900

[ Play ] [ Pause ] [ Stop ]

[ Regenerate Sequence ]

[ Export ]

────────────────────────

Export progress

Rendering frames...
████████████░░░░ 72%

Elapsed: 00:12
Remaining: ~00:05

[ Cancel Export ]

────────────────────────

READY

[ Download MP4 ]
```

---

# 32. BROWSER PHOTO UPLOAD

The manual UI must support:

- file picker
- drag/drop
- multiple images
- JPEG/JPG
- PNG
- WebP

Show:

- photo count
- thumbnails
- individual remove
- clear all
- upload errors
- corrupt image errors

Support approximately:

```text
10–100 images
```

without unnecessarily duplicating decoded pixel buffers.

---

# 33. PREVIEW

Preview must use the same active sequence definition as export.

When user clicks:

```text
Preview
```

generate/lock the sequence.

Export must use that same sequence.

If the user wants a new random sequence:

```text
Regenerate Sequence
```

must explicitly create a new sequence/seed.

Display the current seed where useful.

Do not silently generate one random sequence for preview and another for export.

---

# 34. BROWSER PREVIEW VS SERVER EXPORT

The preview can use browser Canvas/WebCodecs/etc. for interactive playback.

However:

**Preview timing must represent the same timeline that the server renderer will export.**

The preview is not the production encoder.

The production encoder is FFmpeg on the render worker.

---

# 35. EXPORT PROGRESS

Use clear stages:

```text
Preparing photos...
Generating sequence...
Rendering frames...
Encoding video...
Validating output...
Uploading...
Finalizing...
Ready.
```

Do not say:

```text
Recording...
```

because the application is not recording a live stream.

---

# 36. CANCEL EXPORT

Implement:

```text
Cancel Export
```

Cancellation must:

- stop the worker job
- terminate FFmpeg
- remove temporary files
- release resources
- update job status to cancelled
- return UI to usable state

Never leave the application permanently disabled.

---

# 37. MEMORY MANAGEMENT

This is critical.

Do not create:

```text
one full-resolution canvas per image
```

and retain them indefinitely.

Use:

- decode-on-demand
- controlled image caching
- reusable rendering buffers
- temporary files where appropriate
- worker processes
- proper cleanup

After render:

- remove temporary files
- close streams
- terminate workers where appropriate
- release buffers
- clean object URLs
- remove incomplete outputs

Repeated rendering must not cause unbounded memory growth.

---

# 38. OBJECT URL MANAGEMENT

Whenever:

```javascript
URL.createObjectURL()
```

is used:

track the URL.

Revoke it when no longer required.

Do not leak:

- image object URLs
- preview URLs
- download Blob URLs

Repeated exports must remain stable.

---

# 39. ERROR HANDLING

Handle:

- no images
- invalid project
- invalid image
- corrupt image
- unsupported image
- missing Supabase source
- missing storage file
- FFmpeg unavailable
- encoder error
- output validation failure
- render timeout
- memory risk
- cancellation
- unsupported browser feature
- extremely large source pool
- extremely long project
- invalid FPS
- invalid duration
- invalid photo duration

Never leave an operation permanently displaying an active progress state after failure.

---

# 40. LARGE PROJECT PROTECTION

Before rendering, estimate resource requirements.

Warn/reject when necessary for:

- 100+ images
- 20-minute projects
- very high FPS
- Maximum quality
- extremely short photo durations
- unusually large source images

Do not silently crash the process.

Provide a clear message such as:

```text
This project may require significant rendering resources.
Consider reducing duration, FPS, or quality.
```

---

# 41. QUALITY PRESETS

Provide:

### Draft

Fastest practical render.

### High

Default.

High-quality social-media output.

### Maximum

Highest practical quality.

Larger file and longer render time.

Display approximate file size when practical.

---

# 42. OUTPUT FILE NAMING

Generate useful filenames.

Example:

```text
contactreel_2026-08-30_2234.mp4
```

or:

```text
contactreel_cr_82f91.mp4
```

Allow API clients to optionally provide a safe filename.

Sanitize filenames.

---

# 43. STORAGE OUTPUT

Store completed files in Supabase Storage.

Example:

```text
reel-renders/
    2026/
        08/
            contactreel_cr_82f91.mp4
```

Return a usable URL.

Prefer signed URLs when appropriate.

Implement cleanup/retention strategy so storage does not grow indefinitely.

---

# 44. SECURITY

Never expose:

- Supabase service-role key
- internal worker credentials
- database credentials
- private storage credentials

to the browser.

Validate:

- API requests
- source IDs
- callback URLs
- filenames
- file types
- file sizes

Prevent path traversal.

Prevent arbitrary filesystem access through API parameters.

Do not allow users to tell FFmpeg to execute arbitrary command-line arguments.

All FFmpeg parameters must be generated internally from validated settings.

---

# 45. SUPABASE ACCESS

The renderer should be able to securely retrieve source images.

Preferred:

```text
sourceId
 ↓
server resolves source
 ↓
server obtains authorized storage URLs
 ↓
worker downloads/processes images
```

Do not make the entire image bucket publicly accessible just for convenience.

Use appropriate signed URLs or server-side Supabase credentials.

---

# 46. FRONTEND ENVIRONMENT

The frontend must never receive the Supabase service-role key.

Only safe public configuration may be exposed client-side.

Server secrets belong in Replit environment variables.

Create:

```text
.env.example
```

with all required variables documented.

---

# 47. HEALTH CHECK

Provide:

```http
GET /api/v1/health
```

Return information such as:

```json
{
  "status": "ok",
  "ffmpeg": true,
  "supabase": true,
  "worker": true
}
```

Do not expose sensitive information.

---

# 48. LOGGING

Implement useful structured logs for:

- job created
- job started
- image resolution
- render progress
- FFmpeg process
- job completed
- job failed
- job cancelled
- cleanup

Avoid logging:

- secrets
- API keys
- private signed URLs unnecessarily
- sensitive user data

---

# 49. BROWSER COMPATIBILITY

Support:

- Chrome desktop
- Edge desktop
- Firefox where technically feasible
- modern mobile browsers for basic UI

The server-side MP4 rendering should not depend on browser encoder availability.

If browser-specific preview functionality is unavailable, provide a graceful fallback.

---

# 50. TESTING

Create automated tests for:

### Sequence

- deterministic seed
- no immediate repeats
- pass boundary behavior
- sequential mode
- long duration
- short duration

### Timeline

- exact frame count
- 30 FPS
- 60 FPS
- 0.03-second photo duration
- 0.1-second photo duration
- 30-second project
- 60-second project

### Crop

Test:

```text
4000×6000
6000×4000
3000×3000
```

against:

```text
9:16
1:1
16:9
```

### API

Test:

- validation
- authentication
- render creation
- status
- cancellation
- webhook
- idempotency

---

# 51. REQUIRED QUALITY TEST

Create/test with:

```text
4000×6000 portrait
6000×4000 landscape
3000×3000 square
```

Generate:

```text
10-second
9:16
1080×1920
30 FPS
High quality
```

Extract representative frames from the generated MP4.

Compare against source images.

Ensure the output does not have the severe softness caused by the previous 720×1280 pipeline.

---

# 52. REQUIRED OUTPUT VALIDATION TEST

For every preset, generate and independently inspect:

### 9:16

```text
1080×1920
```

### 1:1

```text
1080×1080
```

### 16:9

```text
1920×1080
```

Verify actual:

- dimensions
- duration
- FPS
- frame count
- codec
- container
- bitrate/quality metadata where available
- audio track presence/absence
- playback compatibility

Use FFprobe or equivalent.

Include the results in the README/test report.

---

# 53. STRESS TEST

Test:

```text
10 images
50 images
100 images
```

with:

```text
10 sec
30 sec
60 sec
```

and:

```text
0.1 sec/photo
0.2 sec/photo
0.5 sec/photo
```

Look for:

- crashes
- memory growth
- browser freezing
- worker failure
- timing drift
- incorrect duration
- skipped images
- corrupted MP4
- FFmpeg failures
- incomplete cleanup

---

# 54. REPLIT DEPLOYMENT

The application must be deployable directly to Replit.

Provide:

```text
npm install
npm run dev
npm run build
npm start
```

or an equivalent clean set of commands.

Document:

- Replit environment variables
- Supabase setup
- database schema
- storage bucket creation
- FFmpeg installation/detection
- worker startup
- API key creation
- n8n configuration
- production deployment

If Replit's runtime requires a different FFmpeg installation strategy, implement it explicitly and document it.

---

# 55. ENVIRONMENT VARIABLES

Create `.env.example`.

Include appropriate variables such as:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

SUPABASE_IMAGE_BUCKET=
SUPABASE_RENDER_BUCKET=

API_KEY_SECRET=

REDIS_URL=

PUBLIC_BASE_URL=

WEBHOOK_SECRET=

MAX_RENDER_DURATION=
MAX_SOURCE_IMAGES=
```

Only include variables actually required by the implementation.

Never hardcode secrets.

---

# 56. FUTURE EXTENSIBILITY

The architecture should make these possible later without rewriting the rendering core:

- music/audio
- transitions
- text overlays
- captions
- blurred backgrounds
- manual ordering
- contain mode
- image positioning/focal point
- multiple output presets
- custom resolution
- custom bitrate/quality
- webhook integrations
- custom output destinations
- API usage billing
- user accounts

Do not implement all of these now unless necessary.

Build the architecture so they can be added cleanly.

---

# 57. NO UNNECESSARY BACKEND COMPLEXITY

Do not introduce cloud services merely because they are fashionable.

The essential production architecture is:

```text
Replit
 ├── Frontend
 ├── API
 └── Render Worker / FFmpeg

Supabase
 ├── Images
 ├── Outputs
 └── Metadata

n8n
 └── Automation
```

If Redis is required for reliable job processing, use it.

If not, implement a simpler worker queue that is robust for the expected Replit deployment.

Prioritize working software over excessive infrastructure.

---

# 58. FINAL UI BEHAVIOR

Manual workflow:

```text
Upload photos
      ↓
Configure settings
      ↓
Generate sequence
      ↓
Preview
      ↓
Regenerate if desired
      ↓
Export
      ↓
Render
      ↓
Validate
      ↓
Download MP4
```

Automated workflow:

```text
Images already in Supabase
      ↓
n8n sends render request
      ↓
ContactReel creates job
      ↓
Worker retrieves images
      ↓
Sequence generated
      ↓
FFmpeg renders
      ↓
Output validated
      ↓
MP4 uploaded to Supabase
      ↓
Webhook/status response
      ↓
n8n continues workflow
```

---

# 59. ACCEPTANCE CRITERIA

Do not consider the project complete unless ALL are true:

- [ ] Default vertical output is 1080×1920.
- [ ] Square output is 1080×1080.
- [ ] Widescreen output is 1920×1080.
- [ ] JPEG/JPG/PNG/WebP work.
- [ ] 10–100 images work.
- [ ] Original source quality is preserved until rendering.
- [ ] No unnecessary 720p intermediate pipeline exists.
- [ ] Cover crop works correctly.
- [ ] No image stretching.
- [ ] Randomization works correctly.
- [ ] Immediate repetition is avoided where possible.
- [ ] Random seed is deterministic.
- [ ] Sequence is shared between preview/export.
- [ ] 30 FPS works.
- [ ] 60 FPS works.
- [ ] Timeline is deterministic.
- [ ] requestAnimationFrame is NOT used as export timing.
- [ ] MediaRecorder is NOT the primary production encoder.
- [ ] Server-side FFmpeg generates the production MP4.
- [ ] H.264 MP4 works whenever FFmpeg supports it.
- [ ] Duration is accurate.
- [ ] Actual output dimensions are validated.
- [ ] Actual FPS is validated.
- [ ] Actual codec is validated.
- [ ] Actual frame count is validated.
- [ ] Output playback is tested.
- [ ] Cancel works.
- [ ] Errors cleanly reset jobs/UI.
- [ ] Temporary files are cleaned.
- [ ] Blob/object URLs are revoked.
- [ ] Repeated exports do not continuously increase memory.
- [ ] Supabase Storage works.
- [ ] Replit deployment works.
- [ ] REST API works.
- [ ] API authentication works.
- [ ] n8n can trigger rendering using only sourceId + settings.
- [ ] Render status can be polled.
- [ ] Optional webhook callback works.
- [ ] Idempotency works.
- [ ] Output can be consumed by n8n.
- [ ] README is complete.
- [ ] `.env.example` exists.
- [ ] Testing results are documented.

---

# 60. IMPORTANT IMPLEMENTATION PRIORITY

Build in this order.

## Phase 1 — Rendering Core

First build:

```text
Project schema
↓
Sequence engine
↓
Timeline engine
↓
Image retrieval
↓
Crop/scaling
↓
FFmpeg rendering
↓
MP4 validation
```

Prove that this produces genuinely high-quality:

```text
1080×1920 H.264 MP4
```

before spending significant time polishing the UI.

## Phase 2 — API

Build:

```text
POST /render
GET /render/:id
POST /render/:id/cancel
```

and Supabase integration.

Verify rendering works without the browser.

## Phase 3 — Worker/Queue

Implement robust asynchronous jobs, cancellation, progress, cleanup, and retry behavior.

## Phase 4 — Web UI

Build the ContactReel editor around the already-working rendering core.

## Phase 5 — n8n Integration

Test the complete workflow:

```text
Supabase images
→ n8n
→ ContactReel API
→ Render Worker
→ MP4
→ Supabase
→ n8n
```

## Phase 6 — Production Testing

Run the complete quality and stress tests described above.

Fix issues before declaring completion.

---

# 61. DO NOT CHEAT THE REQUIREMENTS

Do not:

- create a mock export button
- generate a fake download
- export only WebM while claiming MP4
- render at 720p and upscale
- use requestAnimationFrame for authoritative export timing
- use MediaRecorder as the production encoder
- silently reduce source images
- silently skip broken images
- hardcode fake progress
- report UI dimensions without inspecting the file
- leave FFmpeg processes running
- leave temporary files indefinitely
- expose Supabase secrets
- make the entire Supabase bucket public just for convenience
- require n8n to upload all image binaries
- make n8n control the frontend
- create a separate random sequence for preview and export

---

# 62. FINAL DELIVERABLES

Deliver:

1. Complete working source code.
2. Production-ready Replit project.
3. Functional frontend.
4. Functional REST API.
5. Functional server-side FFmpeg renderer.
6. Worker/job system.
7. Supabase integration.
8. n8n-compatible API.
9. Webhook support.
10. API authentication.
11. Cancellation.
12. Output validation.
13. Automated tests.
14. README.
15. `.env.example`.
16. Replit deployment instructions.
17. Supabase setup instructions.
18. n8n integration instructions.
19. Architecture documentation.
20. Test report showing actual exported dimensions, FPS, codec, duration, and file validation.

At the end, provide:

### Architecture Summary

Explain exactly how the system works.

### Export Pipeline

Explain exactly how images become deterministic H.264 MP4 frames.

### Replit Deployment

Explain exactly how to deploy it.

### Supabase Setup

Explain exactly how to configure image and render storage.

### n8n Integration

Provide a copyable example HTTP Request configuration/payload.

### Test Results

Show actual test results rather than claiming that tests were performed without evidence.

The final result must be a genuinely functional **ContactReel web application + rendering API + rendering worker**, not merely a frontend demo.