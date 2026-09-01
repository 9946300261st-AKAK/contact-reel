import assert from "node:assert/strict";
import test from "node:test";
import {
  VIDEO_FORMATS,
  calculateCrop,
  calculateTimeline,
  generateSequence,
  quantizePhotoDuration,
} from "./index";

test("seeded random sequences are reproducible and avoid pass-boundary repeats", () => {
  const first = generateSequence(["a", "b", "c", "d"], 12, "random", 183729);
  const second = generateSequence(["a", "b", "c", "d"], 12, "random", 183729);
  assert.deepEqual(first, second);
  for (let index = 1; index < first.items.length; index += 1) {
    assert.notEqual(first.items[index], first.items[index - 1]);
  }
});

test("sequential mode cycles the source pool", () => {
  assert.deepEqual(generateSequence(["a", "b"], 5, "sequential", 1).items, ["a", "b", "a", "b", "a"]);
});

test("timeline uses exact frame count and FPS-quantized photo timing", () => {
  const timeline = calculateTimeline(["a", "b", "c"], 30, 0.1, 30, "sequential", 1);
  assert.equal(timeline.frameCount, 900);
  assert.equal(timeline.duration, 30);
  assert.equal(timeline.photoFrameCount, 3);
  assert.equal(timeline.frames.at(-1)?.timestamp, 899 / 30);
  assert.equal(quantizePhotoDuration(0.03, 30), 1);
  assert.equal(quantizePhotoDuration(0.03, 60), 2);
});

test("cover crop preserves aspect ratio for portrait, landscape, and square sources", () => {
  const vertical = calculateCrop(4000, 6000, VIDEO_FORMATS["9:16"].width, VIDEO_FORMATS["9:16"].height);
  const landscape = calculateCrop(6000, 4000, VIDEO_FORMATS["9:16"].width, VIDEO_FORMATS["9:16"].height);
  const square = calculateCrop(3000, 3000, VIDEO_FORMATS["1:1"].width, VIDEO_FORMATS["1:1"].height);
  assert.equal(vertical.scaledWidth >= 1080 && vertical.scaledHeight >= 1920, true);
  assert.equal(landscape.scaledWidth >= 1080 && landscape.scaledHeight >= 1920, true);
  assert.equal(square.scaledWidth >= 1080 && square.scaledHeight >= 1080, true);
  assert.equal(landscape.cropY >= 0, true);
});