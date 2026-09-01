---
name: FFmpeg image concat timing
description: Constraint for deterministic still-image montage encoding with mixed source dimensions.
---

FFmpeg concat manifests with still images of mixed dimensions can collapse the intended duration/frame count even when each `duration` directive is correct. Normalize every source image to the final output dimensions before building the concat manifest.

**Why:** The concat demuxer derives timestamps from image streams; mixed dimensions introduce inconsistent image-stream behavior and produced only the first photo hold during validation.

**How to apply:** Keep the original bytes for storage and preview, but make final-resolution, cover-cropped intermediates for the export manifest, then encode with CFR and an exact frame count.