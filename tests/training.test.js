import test from "node:test";
import assert from "node:assert/strict";

import { createCourse } from "../src/core/course.js";
import { TRACK_PRESETS } from "../src/core/presets.js";
import {
  aggregateTrackScores,
  createTrainingEvaluator,
  createTrainingLane,
} from "../src/core/training.js";

const trainingCourse = createCourse({
  id: "test-loop",
  name: "Test Loop",
  width: 90,
  points: [
    { x: 40, y: 40, elevation: 0 },
    { x: 260, y: 40, elevation: 4 },
    { x: 320, y: 150, elevation: 8 },
    { x: 260, y: 260, elevation: 4 },
    { x: 40, y: 260, elevation: 0 },
    { x: -20, y: 150, elevation: 0 },
  ],
});

const laneConfig = {
  id: "chatgpt-v1",
  displayName: "ChatGPT v1",
  color: "#5eead4",
  populationSize: 6,
  eliteCount: 2,
  episodeSteps: 40,
  seed: 42,
  mutationRate: 0.12,
  mutationScale: 0.2,
};

test("a training lane advances exactly one generation and reports its true step cost", () => {
  const lane = createTrainingLane({ course: trainingCourse, config: laneConfig });

  const result = lane.trainGeneration();

  assert.equal(result.generation, 1);
  assert.equal(result.steps, laneConfig.populationSize * laneConfig.episodeSteps);
  assert.equal(result.totalSteps, result.steps);
  assert.equal(result.populationSize, laneConfig.populationSize);
  assert.ok(Number.isFinite(result.bestFitness));
  assert.ok(Number.isFinite(result.medianFitness));
  assert.ok(result.bestFitness >= result.medianFitness);
  assert.ok(result.replay.length > 1);
});

test("training is deterministic for the same course, seed, and algorithm config", () => {
  const first = createTrainingLane({ course: trainingCourse, config: laneConfig });
  const second = createTrainingLane({ course: trainingCourse, config: laneConfig });

  const firstResults = [first.trainGeneration(), first.trainGeneration()];
  const secondResults = [second.trainGeneration(), second.trainGeneration()];

  assert.deepEqual(
    firstResults.map(({ bestFitness, medianFitness, bestProgress }) => ({
      bestFitness,
      medianFitness,
      bestProgress,
    })),
    secondResults.map(({ bestFitness, medianFitness, bestProgress }) => ({
      bestFitness,
      medianFitness,
      bestProgress,
    })),
  );
});

test("lane snapshots expose display identity without leaking mutable population state", () => {
  const lane = createTrainingLane({ course: trainingCourse, config: laneConfig });
  lane.trainGeneration();

  const snapshot = lane.snapshot();

  assert.equal(snapshot.id, "chatgpt-v1");
  assert.equal(snapshot.displayName, "ChatGPT v1");
  assert.equal(snapshot.color, "#5eead4");
  assert.equal(snapshot.sensorCount, 7);
  assert.equal("population" in snapshot, false);
  assert.equal(snapshot.populationReplays.length, laneConfig.populationSize);
  assert.deepEqual(snapshot.populationReplays[0], snapshot.replay);
});

test("lane rejects invalid population and episode budgets", () => {
  assert.throws(
    () =>
      createTrainingLane({
        course: trainingCourse,
        config: { ...laneConfig, populationSize: 1 },
      }),
    /population/i,
  );
  assert.throws(
    () =>
      createTrainingLane({
        course: trainingCourse,
        config: { ...laneConfig, episodeSteps: 0 },
      }),
    /episode/i,
  );
});

test("aggregate modes reward consistency across tracks", () => {
  assert.equal(aggregateTrackScores([100, 50, 0], "mean"), 50);
  assert.equal(aggregateTrackScores([100, 50, 0], "balanced"), 37.5);
  assert.equal(aggregateTrackScores([100, 50, 0], "worst"), 0);
});

test("multi-track training evaluates every genome on every selected track", () => {
  const secondCourse = createCourse({
    id: "second-loop",
    name: "Second Loop",
    width: 110,
    points: [
      { x: 0, y: 0 },
      { x: 260, y: 0 },
      { x: 260, y: 180 },
      { x: 0, y: 180 },
    ],
  });
  const lane = createTrainingLane({
    tracks: [
      { key: "track:b", name: "B", course: secondCourse },
      { key: "track:a", name: "A", course: trainingCourse },
    ],
    config: { ...laneConfig, aggregateMode: "balanced" },
  });

  const result = lane.trainGeneration();
  const snapshot = lane.snapshot();

  assert.equal(
    result.steps,
    laneConfig.populationSize * laneConfig.episodeSteps * 2,
  );
  assert.equal(result.trackCount, 2);
  assert.deepEqual([...result.trackOrder].sort(), ["track:a", "track:b"]);
  assert.equal(result.bestTrackResults.length, 2);
  assert.equal(snapshot.aggregateMode, "balanced");
  assert.equal("replay" in snapshot, false);
  assert.equal(lane.replaySnapshot("track:a").populationReplays.length, 6);
  assert.throws(() => lane.replaySnapshot("missing"), /unknown track/i);

  assert.equal(result.trackViews.length, 2);
  for (const trackView of result.trackViews) {
    assert.equal(trackView.rankedAgents.length, laneConfig.populationSize);
    assert.equal(trackView.rankedAgents[0].trackRank, 1);
    assert.equal(trackView.replay, trackView.rankedAgents[0].replay);
    assert.equal(
      trackView.checkpoint.genes.length,
      result.checkpoint.parameterCount,
    );
    assert.deepEqual(
      trackView.populationReplays,
      trackView.rankedAgents.map((agent) => agent.replay),
    );
    assert.ok(
      trackView.rankedAgents.every(
        (agent, index, agents) =>
          index === 0 || agents[index - 1].fitness >= agent.fitness,
      ),
    );
  }
});

test("an agent episode ends on its first footprint collision", () => {
  const technicalCourse = createCourse(TRACK_PRESETS[2]);
  const lane = createTrainingLane({
    course: technicalCourse,
    config: {
      ...laneConfig,
      populationSize: 6,
      episodeSteps: 100,
      seed: 1,
    },
  });

  const result = lane.trainGeneration();
  const crashed = result.populationReplays.filter((replay) =>
    replay.some((frame) => !frame.onTrack),
  );

  assert.ok(crashed.length > 0);
  for (const replay of crashed) {
    const firstCollision = replay.findIndex((frame) => !frame.onTrack);
    assert.equal(firstCollision, replay.length - 1);
  }
  assert.ok(result.steps < 6 * 100);
});

test("training exposes a configurable-network champion checkpoint", () => {
  const lane = createTrainingLane({
    course: trainingCourse,
    config: {
      ...laneConfig,
      hiddenLayers: [16, 8],
    },
  });

  const result = lane.trainGeneration();
  const snapshot = lane.snapshot();

  assert.equal(result.bestGenome.genes.length, 307);
  assert.equal(result.rankedAgents.length, laneConfig.populationSize);
  assert.equal(result.rankedAgents[0].rank, 1);
  assert.equal(result.rankedAgents[0].replay.length > 0, true);
  assert.equal(snapshot.manifest.topology, "8->16->8->3");
  assert.equal(snapshot.manifest.parameterCount, 307);
});

test("a long generation reports monotonic episode progress before it completes", () => {
  const lane = createTrainingLane({
    tracks: [
      { key: "track:a", name: "A", course: trainingCourse },
      { key: "track:b", name: "B", course: trainingCourse },
    ],
    config: {
      ...laneConfig,
      populationSize: 6,
      episodeSteps: 12,
    },
  });
  const progress = [];

  const result = lane.trainGeneration({
    onProgress(update) {
      progress.push(update);
    },
  });

  assert.ok(progress.length > 12);
  assert.equal(progress[0].completedEpisodes, 0);
  assert.ok(progress[0].completedSteps > 0);
  assert.ok(progress[0].completedSteps < result.steps);
  assert.deepEqual(
    progress
      .filter((update) => update.episodeComplete)
      .map((update) => update.completedEpisodes),
    Array.from({ length: 12 }, (_, index) => index + 1),
  );
  assert.ok(progress.every((update) => update.generation === 1));
  assert.ok(progress.every((update) => update.totalEpisodes === 12));
  assert.ok(progress.every((update) => Number.isFinite(update.bestObservedFitness)));
  assert.ok(progress.every((update) => Number.isFinite(update.bestObservedProgress)));
  assert.ok(
    progress.every(
      (update, index) =>
        index === 0 || update.completedSteps >= progress[index - 1].completedSteps,
    ),
  );
  assert.equal(progress.at(-1).completedSteps, result.steps);
});

test("a serializable generation plan can be evaluated out of order and committed deterministically", () => {
  const tracks = [
    { key: "track:a", name: "A", course: trainingCourse },
    {
      key: "track:b",
      name: "B",
      course: createCourse({
        id: "parallel-b",
        width: 100,
        points: [
          { x: 0, y: 0 },
          { x: 240, y: 0 },
          { x: 240, y: 180 },
          { x: 0, y: 180 },
        ],
      }),
    },
  ];
  const config = {
    ...laneConfig,
    populationSize: 6,
    episodeSteps: 12,
  };
  const sequentialLane = createTrainingLane({ tracks, config });
  const plannedLane = createTrainingLane({ tracks, config });
  const evaluator = createTrainingEvaluator({ tracks, config });

  const expected = sequentialLane.trainGeneration();
  const plan = plannedLane.createGenerationPlan();
  const evaluations = plan.tasks
    .map((task) => evaluator.evaluate(task, { trackOrder: plan.trackOrder }))
    .reverse();
  const actual = plannedLane.completeGenerationPlan(evaluations);

  assert.equal(structuredClone(plan).tasks.length, config.populationSize);
  assert.equal(actual.generation, expected.generation);
  assert.equal(actual.steps, expected.steps);
  assert.equal(actual.bestFitness, expected.bestFitness);
  assert.equal(actual.medianFitness, expected.medianFitness);
  assert.deepEqual(actual.trackOrder, expected.trackOrder);
  assert.deepEqual(actual.checkpoint.genes, expected.checkpoint.genes);
});
