import test from "node:test";
import assert from "node:assert/strict";

import {
  createTrainingLaneFromStartPayload,
  createTrainingStartPayload,
  validateTrainingStartPayload,
} from "../src/core/training-worker-contract.js";

const trackDefinition = {
  id: "worker-loop",
  name: "Worker Loop",
  width: 140,
  closed: true,
  points: [
    { x: 0, y: 0 },
    { x: 320, y: 0 },
    { x: 320, y: 240 },
    { x: 0, y: 240 },
  ],
};

const deepConfig = {
  id: "worker-deep",
  displayName: "Worker Deep",
  color: "#0b63f6",
  populationSize: 6,
  eliteCount: 2,
  episodeSteps: 12,
  seed: 42,
  mutationRate: 0.12,
  mutationScale: 0.2,
  hiddenLayers: [16, 8],
};

test("a deep training start payload survives structured cloning", () => {
  const payload = createTrainingStartPayload({
    tracks: [
      {
        key: "primary",
        name: "Primary",
        definition: trackDefinition,
      },
    ],
    config: deepConfig,
    targetGeneration: 5,
    speed: "fast",
  });

  const cloned = structuredClone(payload);

  assert.equal(cloned.type, "start");
  assert.deepEqual(cloned.config.hiddenLayers, [16, 8]);
  assert.equal(cloned.targetGeneration, 5);
  assert.equal(cloned.speed, "fast");
  assert.deepEqual(cloned.tracks[0].definition, trackDefinition);
  assert.doesNotThrow(() => validateTrainingStartPayload(cloned));
});

test("a worker lane compiles track definitions and trains the deep topology", () => {
  const payload = createTrainingStartPayload({
    tracks: [{ key: "primary", definition: trackDefinition }],
    config: deepConfig,
    targetGeneration: 1,
    speed: "normal",
  });

  const { lane, start } = createTrainingLaneFromStartPayload(payload);
  const result = lane.trainGeneration();
  const snapshot = lane.snapshot();

  assert.equal(start.targetGeneration, 1);
  assert.equal(result.checkpoint.parameterCount, 307);
  assert.equal(result.checkpoint.topology, "8->16->8->3");
  assert.equal(result.bestGenome.genes.length, 307);
  assert.equal(snapshot.manifest.topology, "8->16->8->3");
});

test("training start payloads reject invalid track definitions", () => {
  assert.throws(
    () =>
      createTrainingStartPayload({
        tracks: [],
        config: deepConfig,
        targetGeneration: 1,
        speed: "normal",
      }),
    /track/i,
  );
  assert.throws(
    () =>
      validateTrainingStartPayload({
        type: "start",
        tracks: [
          {
            key: "broken",
            definition: {
              width: 80,
              points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
            },
          },
        ],
        config: deepConfig,
        targetGeneration: 1,
        speed: "normal",
      }),
    /three/i,
  );
});
