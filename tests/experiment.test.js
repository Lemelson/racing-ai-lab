import test from "node:test";
import assert from "node:assert/strict";

import { createExperimentScheduler } from "../src/core/experiment.js";

test("equal-step scheduling gives every algorithm the same simulation budget", () => {
  const scheduler = createExperimentScheduler({
    mode: "equal-steps",
    entries: ["chatgpt-v1", "chatgpt-v2", "gemini-v1"],
    stepBudget: 1200,
  });

  while (!scheduler.done) {
    scheduler.nextBatch(73);
  }

  assert.deepEqual(scheduler.snapshot().entries.map((entry) => entry.steps), [
    1200,
    1200,
    1200,
  ]);
});

test("round-robin batches never let one algorithm lead by more than one batch", () => {
  const scheduler = createExperimentScheduler({
    mode: "equal-steps",
    entries: ["a", "b", "c"],
    stepBudget: 5000,
  });

  for (let index = 0; index < 11; index += 1) {
    scheduler.nextBatch(64);
    const steps = scheduler.snapshot().entries.map((entry) => entry.steps);
    assert.ok(Math.max(...steps) - Math.min(...steps) <= 64);
  }
});

test("scheduler rejects duplicate algorithm identifiers", () => {
  assert.throws(
    () =>
      createExperimentScheduler({
        mode: "equal-steps",
        entries: ["chatgpt-v1", "chatgpt-v1"],
        stepBudget: 100,
      }),
    /unique/i,
  );
});
