import test from "node:test";
import assert from "node:assert/strict";

import { createLabCatalog, createMemoryStorage } from "../src/core/catalog.js";

const track = {
  id: "ridge-loop",
  name: "Ridge Loop",
  width: 72,
  closed: true,
  points: [
    { x: 20, y: 20, width: 60, elevation: 0 },
    { x: 180, y: 20, width: 80, elevation: 8 },
    { x: 180, y: 120, width: 90, elevation: 12 },
    { x: 20, y: 120, width: 70, elevation: 0 },
  ],
};

test("catalog persists local width and elevation in the same immutable version", () => {
  const storage = createMemoryStorage();
  const catalog = createLabCatalog({ storage });

  const reference = catalog.saveTrack(track);
  const reopened = createLabCatalog({ storage }).getTrack(reference);

  assert.equal(reference.version, 1);
  assert.deepEqual(reopened.definition.points, track.points);
  assert.equal(reopened.reference.checksum, reference.checksum);
});

test("editing a saved track creates a new version without changing the old one", () => {
  const catalog = createLabCatalog({ storage: createMemoryStorage() });

  const versionOne = catalog.saveTrack(track);
  const versionTwo = catalog.saveTrack({ ...track, width: 90 });

  assert.equal(versionTwo.version, 2);
  assert.equal(catalog.getTrack(versionOne).definition.width, 72);
  assert.equal(catalog.getTrack(versionTwo).definition.width, 90);
});

test("algorithm versions keep display identity separate from provider", () => {
  const catalog = createLabCatalog({ storage: createMemoryStorage() });

  catalog.registerAlgorithm({
    id: "chatgpt-v1",
    provider: "ChatGPT",
    displayName: "ChatGPT v1",
    color: "#5eead4",
    config: { mutationRate: 0.08 },
  });
  catalog.registerAlgorithm({
    id: "chatgpt-v2",
    provider: "ChatGPT",
    displayName: "ChatGPT v2",
    color: "#38bdf8",
    config: { mutationRate: 0.14 },
  });

  assert.deepEqual(
    catalog.listAlgorithms().map(({ id, provider }) => ({ id, provider })),
    [
      { id: "chatgpt-v1", provider: "ChatGPT" },
      { id: "chatgpt-v2", provider: "ChatGPT" },
    ],
  );
});

test("catalog rejects duplicate algorithm version identifiers", () => {
  const catalog = createLabCatalog({ storage: createMemoryStorage() });
  const algorithm = {
    id: "gemini-v1",
    provider: "Gemini",
    displayName: "Gemini v1",
    color: "#a78bfa",
    config: {},
  };

  catalog.registerAlgorithm(algorithm);

  assert.throws(() => catalog.registerAlgorithm(algorithm), /already exists/i);
});

test("catalog persists a named run with its checkpoint, replay, and configuration", () => {
  const storage = createMemoryStorage();
  const catalog = createLabCatalog({ storage });
  const saved = catalog.saveRun({
    name: "Техническая трасса · 50 поколений",
    trackDefinitions: [track],
    config: {
      populationSize: 40,
      generationLimit: 50,
      episodeSteps: 300,
      hiddenLayers: [16, 8],
      seed: 42,
    },
    result: {
      generation: 50,
      bestFitness: 123.5,
      bestProgress: 0.82,
      totalSteps: 600000,
    },
    checkpoint: {
      genes: [0.25, -0.5, 0.75],
      topology: "8->16->8->3",
    },
    replay: [{ step: 0, position: { x: 10, y: 20 }, heading: 0 }],
    selectedTrackKey: "track:a",
    trackSnapshots: [
      {
        trackKey: "track:a",
        checkpoint: { genes: [0.25, -0.5, 0.75] },
        replay: [{ step: 0 }],
      },
    ],
    fitnessHistory: [
      {
        generation: 50,
        trackViews: [
          { trackKey: "track:a", bestFitness: 123.5, medianFitness: 60 },
        ],
      },
    ],
  });

  const reopened = createLabCatalog({ storage }).getRun(saved.id);

  assert.equal(reopened.name, "Техническая трасса · 50 поколений");
  assert.deepEqual(reopened.config.hiddenLayers, [16, 8]);
  assert.deepEqual(reopened.checkpoint.genes, [0.25, -0.5, 0.75]);
  assert.equal(reopened.replay.length, 1);
  assert.equal(reopened.result.generation, 50);
  assert.equal(reopened.selectedTrackKey, "track:a");
  assert.equal(reopened.trackSnapshots[0].trackKey, "track:a");
  assert.equal(reopened.fitnessHistory[0].generation, 50);
  assert.deepEqual(
    createLabCatalog({ storage }).listRuns().map((run) => run.id),
    [saved.id],
  );
});

test("catalog rejects unnamed runs and non-finite checkpoint weights", () => {
  const catalog = createLabCatalog({ storage: createMemoryStorage() });

  assert.throws(
    () => catalog.saveRun({ name: " ", checkpoint: { genes: [1] } }),
    /name/i,
  );
  assert.throws(
    () =>
      catalog.saveRun({
        name: "Broken",
        checkpoint: { genes: [Number.NaN] },
      }),
    /finite/i,
  );
});
