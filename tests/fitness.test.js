import test from "node:test";
import assert from "node:assert/strict";

import { createFitnessTracker } from "../src/core/fitness.js";

test("fitness rewards forward progress only once", () => {
  const tracker = createFitnessTracker({ courseLength: 1000 });

  const first = tracker.update({ distanceAlong: 100, speed: 10, onTrack: true });
  const repeated = tracker.update({ distanceAlong: 100, speed: 25, onTrack: true });
  const backwards = tracker.update({ distanceAlong: 80, speed: 25, onTrack: true });

  assert.ok(first.score > 0);
  assert.equal(repeated.deltaScore, 0);
  assert.equal(backwards.deltaScore, 0);
});

test("fitness does not reward revisiting an already credited segment", () => {
  const tracker = createFitnessTracker({
    courseLength: 1000,
    speedWeight: 0,
  });

  tracker.update({ distanceAlong: 100, speed: 0, onTrack: true });
  tracker.update({ distanceAlong: 80, speed: 0, onTrack: true });
  const revisited = tracker.update({
    distanceAlong: 100,
    speed: 0,
    onTrack: true,
  });
  const newGround = tracker.update({
    distanceAlong: 120,
    speed: 0,
    onTrack: true,
  });

  assert.equal(revisited.forwardDistance, 0);
  assert.equal(newGround.forwardDistance, 20);
  assert.equal(newGround.score, 120);
});

test("speed bonus requires verified forward progress", () => {
  const slow = createFitnessTracker({ courseLength: 1000 });
  const fast = createFitnessTracker({ courseLength: 1000 });

  slow.update({ distanceAlong: 0, speed: 0, onTrack: true });
  fast.update({ distanceAlong: 0, speed: 0, onTrack: true });

  const slowResult = slow.update({ distanceAlong: 50, speed: 5, onTrack: true });
  const fastResult = fast.update({ distanceAlong: 50, speed: 20, onTrack: true });
  const stationaryFast = fast.update({ distanceAlong: 50, speed: 100, onTrack: true });

  assert.ok(fastResult.deltaScore > slowResult.deltaScore);
  assert.equal(stationaryFast.deltaScore, 0);
});

test("fitness handles a legitimate finish-line wrap without rewarding teleportation", () => {
  const tracker = createFitnessTracker({ courseLength: 1000, maxForwardJump: 120 });

  tracker.update({ distanceAlong: 950, speed: 10, onTrack: true });
  const wrapped = tracker.update({ distanceAlong: 20, speed: 10, onTrack: true });
  const teleport = tracker.update({ distanceAlong: 700, speed: 10, onTrack: true });

  assert.equal(wrapped.laps, 1);
  assert.ok(wrapped.deltaScore > 0);
  assert.equal(teleport.deltaScore, 0);
});

test("off-track movement cannot accumulate progress or speed reward", () => {
  const tracker = createFitnessTracker({ courseLength: 1000 });

  tracker.update({ distanceAlong: 10, speed: 5, onTrack: true });
  const offTrack = tracker.update({
    distanceAlong: 80,
    speed: 30,
    onTrack: false,
    collided: true,
  });

  assert.ok(offTrack.deltaScore < 0);
  assert.equal(offTrack.forwardDistance, 0);
  assert.equal(offTrack.collisions, 1);
});
