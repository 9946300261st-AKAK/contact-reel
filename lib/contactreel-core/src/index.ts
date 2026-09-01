export type VideoFormat = "9:16" | "1:1" | "16:9";
export type Quality = "draft" | "high" | "maximum";
export type SequenceMode = "random" | "sequential";

export type PhotoDescriptor = {
  id: string;
  width: number;
  height: number;
};

export type ContactReelProject = {
  version: 1;
  sourceId: string;
  video: {
    format: VideoFormat;
    width: number;
    height: number;
    fps: 30 | 60;
    duration: number;
  };
  timing: {
    photoDuration: number;
  };
  sequence: {
    mode: SequenceMode;
    seed?: number;
  };
  image: {
    fit: "cover";
  };
  quality: Quality;
};

export type FrameRange = {
  frame: number;
  timestamp: number;
  imageIndex: number;
  imageId: string;
};

export type Timeline = {
  fps: 30 | 60;
  frameCount: number;
  duration: number;
  photoFrameCount: number;
  frames: FrameRange[];
};

export type CropResult = {
  scale: number;
  scaledWidth: number;
  scaledHeight: number;
  cropX: number;
  cropY: number;
};

export const VIDEO_FORMATS: Record<
  VideoFormat,
  { width: number; height: number; label: string }
> = {
  "9:16": { width: 1080, height: 1920, label: "Vertical" },
  "1:1": { width: 1080, height: 1080, label: "Square" },
  "16:9": { width: 1920, height: 1080, label: "Widescreen" },
};

const MAX_SEED = 2_147_483_647;

function nextRandom(state: { value: number }) {
  state.value = (state.value * 1_664_525 + 1_013_904_223) >>> 0;
  return state.value / 4_294_967_296;
}

function createSeed(seed?: number) {
  if (Number.isInteger(seed) && seed! >= 0 && seed! <= MAX_SEED) {
    return seed!;
  }
  return Math.floor(Math.random() * MAX_SEED);
}

function shuffle<T>(values: T[], state: { value: number }) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom(state) * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

/**
 * Builds a deterministic sequence of image ids. Every pass is shuffled and
 * pass boundaries avoid repeating the previous frame when the pool allows it.
 */
export function generateSequence(
  imageIds: string[],
  requiredItems: number,
  mode: SequenceMode = "random",
  seed?: number,
) {
  const pool = [...new Set(imageIds)];
  const count = Math.max(0, Math.floor(requiredItems));
  const resolvedSeed = createSeed(seed);
  if (pool.length === 0 || count === 0) {
    return { items: [] as string[], seed: resolvedSeed };
  }
  if (mode === "sequential") {
    return {
      items: Array.from({ length: count }, (_, index) => pool[index % pool.length]),
      seed: resolvedSeed,
    };
  }

  const state = { value: resolvedSeed >>> 0 };
  const items: string[] = [];
  let previous: string | undefined;
  while (items.length < count) {
    let pass = shuffle(pool, state);
    if (previous && pass.length > 1 && pass[0] === previous) {
      [pass[0], pass[1]] = [pass[1], pass[0]];
    }
    items.push(...pass.slice(0, count - items.length));
    previous = items[items.length - 1];
  }
  return { items, seed: resolvedSeed };
}

export function quantizePhotoDuration(photoDuration: number, fps: 30 | 60) {
  return Math.max(1, Math.round(photoDuration * fps));
}

export function calculateTimeline(
  imageIds: string[],
  duration: number,
  photoDuration: number,
  fps: 30 | 60,
  mode: SequenceMode = "random",
  seed?: number,
): Timeline & { seed: number } {
  const frameCount = Math.max(1, Math.round(duration * fps));
  const photoFrameCount = quantizePhotoDuration(photoDuration, fps);
  const sequenceLength = Math.ceil(frameCount / photoFrameCount);
  const sequence = generateSequence(imageIds, sequenceLength, mode, seed);
  const frames = Array.from({ length: frameCount }, (_, frame) => {
    const imageIndex = Math.floor(frame / photoFrameCount) % sequence.items.length;
    return {
      frame,
      timestamp: frame / fps,
      imageIndex,
      imageId: sequence.items[imageIndex] ?? "",
    };
  });
  return {
    fps,
    frameCount,
    duration: frameCount / fps,
    photoFrameCount,
    frames,
    seed: sequence.seed,
  };
}

export function calculateFrameRanges(
  imageIds: string[],
  duration: number,
  photoDuration: number,
  fps: 30 | 60,
  mode: SequenceMode = "random",
  seed?: number,
) {
  return calculateTimeline(imageIds, duration, photoDuration, fps, mode, seed);
}

export function calculateCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): CropResult {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    throw new Error("Image and target dimensions must be positive.");
  }
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const scaledWidth = Math.ceil(sourceWidth * scale);
  const scaledHeight = Math.ceil(sourceHeight * scale);
  return {
    scale,
    scaledWidth,
    scaledHeight,
    cropX: Math.max(0, Math.floor((scaledWidth - targetWidth) / 2)),
    cropY: Math.max(0, Math.floor((scaledHeight - targetHeight) / 2)),
  };
}

export function validateProject(project: Partial<ContactReelProject>) {
  const issues: string[] = [];
  if (!project.sourceId) issues.push("A sourceId is required.");
  const video = project.video;
  if (!video || !(video.format in VIDEO_FORMATS)) {
    issues.push("A supported video format is required.");
  }
  if (!video || ![30, 60].includes(video.fps)) {
    issues.push("FPS must be 30 or 60.");
  }
  if (!video || video.duration < 0.5 || video.duration > 1200) {
    issues.push("Duration must be between 0.5 and 1200 seconds.");
  }
  const photoDuration = project.timing?.photoDuration;
  if (
    typeof photoDuration !== "number" ||
    photoDuration < 0.03 ||
    photoDuration > 10
  ) {
    issues.push("Photo duration must be between 0.03 and 10 seconds.");
  }
  if (!project.sequence || !["random", "sequential"].includes(project.sequence.mode)) {
    issues.push("Sequence mode must be random or sequential.");
  }
  if (!project.image || project.image.fit !== "cover") {
    issues.push("Only cover image fitting is supported.");
  }
  if (!project.quality || !["draft", "high", "maximum"].includes(project.quality)) {
    issues.push("Quality must be draft, high, or maximum.");
  }
  return { valid: issues.length === 0, issues };
}

export function estimateRenderCost(
  duration: number,
  fps: 30 | 60,
  format: VideoFormat,
  imageCount: number,
  quality: Quality,
) {
  const { width, height } = VIDEO_FORMATS[format];
  const frameCount = Math.max(1, Math.round(duration * fps));
  const megapixelsPerFrame = (width * height) / 1_000_000;
  const qualityMultiplier = { draft: 0.75, high: 1, maximum: 1.35 }[quality];
  return {
    frameCount,
    megapixels: Math.round(frameCount * megapixelsPerFrame * 100) / 100,
    estimatedSourceImages: Math.max(0, imageCount),
    likelyHeavy:
      imageCount > 100 ||
      duration > 300 ||
      (fps === 60 && quality === "maximum") ||
      frameCount > 18_000,
    qualityMultiplier,
  };
}