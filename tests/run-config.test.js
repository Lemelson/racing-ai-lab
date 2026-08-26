import test from "node:test";
import assert from "node:assert/strict";

import { createRunConfig } from "../src/core/run-config.js";

test("run configuration turns visible episode time into an exact step budget", () => {
  const config = createRunConfig({
    populationSize: 40,
    generationLimit: 50,
    episodeDurationSeconds: 10,
    trackCount: 3,
    hiddenLayers: [16, 8],
    seed: 42,
  });

  assert.equal(config.timestepHz, 30);
  assert.equal(config.episodeSteps, 300);
  assert.equal(config.estimatedSteps, 1_800_000);
  assert.equal(config.topology, "8→16→8→3");
  assert.equal(config.parameterCount, 307);
});

test("run configuration rejects unreasonable simulation and network budgets", () => {
  assert.throws(
    () =>
      createRunConfig({
        populationSize: 5,
        generationLimit: 50,
        episodeDurationSeconds: 10,
        trackCount: 1,
        hiddenLayers: [10],
        seed: 1,
      }),
    /population/i,
  );
  assert.throws(
    () =>
      createRunConfig({
        populationSize: 40,
        generationLimit: 50,
        episodeDurationSeconds: 0,
        trackCount: 1,
        hiddenLayers: [10],
        seed: 1,
      }),
    /duration/i,
  );
  assert.throws(
    () =>
      createRunConfig({
        populationSize: 40,
        generationLimit: 50,
        episodeDurationSeconds: 10,
        trackCount: 1,
        hiddenLayers: [256],
        seed: 1,
      }),
    /hidden/i,
  );
});
