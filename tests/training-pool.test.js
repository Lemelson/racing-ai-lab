import test from "node:test";
import assert from "node:assert/strict";

import {
  createTrainingTaskQueue,
  chooseTrainingWorkerCount,
  splitTrainingTasks,
} from "../src/core/training-pool.js";

test("automatic worker count uses every logical core for evaluation", () => {
  assert.equal(
    chooseTrainingWorkerCount({
      hardwareConcurrency: 10,
      populationSize: 40,
      requested: "auto",
    }),
    10,
  );
  assert.equal(
    chooseTrainingWorkerCount({
      hardwareConcurrency: 10,
      populationSize: 6,
      requested: "auto",
    }),
    6,
  );
});

test("an explicit worker count is clamped to available work and hardware", () => {
  assert.equal(
    chooseTrainingWorkerCount({
      hardwareConcurrency: 10,
      populationSize: 40,
      requested: 4,
    }),
    4,
  );
  assert.equal(
    chooseTrainingWorkerCount({
      hardwareConcurrency: 10,
      populationSize: 3,
      requested: 20,
    }),
    3,
  );
});

test("training tasks are distributed once with balanced batch sizes", () => {
  const tasks = Array.from({ length: 40 }, (_, populationIndex) => ({
    populationIndex,
  }));

  const batches = splitTrainingTasks(tasks, 9);

  assert.equal(batches.length, 9);
  assert.equal(Math.max(...batches.map((batch) => batch.length)), 5);
  assert.equal(Math.min(...batches.map((batch) => batch.length)), 4);
  assert.deepEqual(
    batches.flat().map((task) => task.populationIndex).sort((a, b) => a - b),
    tasks.map((task) => task.populationIndex),
  );
});

test("a shared task queue lets faster workers claim the next genome", () => {
  const tasks = Array.from({ length: 7 }, (_, populationIndex) => ({
    populationIndex,
  }));
  const queue = createTrainingTaskQueue(tasks);

  const claimed = [
    queue.take(),
    queue.take(),
    queue.take(),
    queue.take(),
    queue.take(),
    queue.take(),
    queue.take(),
  ];

  assert.deepEqual(claimed, tasks);
  assert.equal(queue.take(), null);
  assert.equal(queue.remaining, 0);
});
