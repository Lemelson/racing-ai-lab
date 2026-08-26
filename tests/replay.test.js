import test from "node:test";
import assert from "node:assert/strict";

import {
  createReplayHistory,
  sampleReplay,
} from "../src/core/replay.js";

const replay = [
  {
    step: 0,
    position: { x: 0, y: 10, elevation: 0 },
    heading: Math.PI - 0.1,
    speed: 20,
    progress: 0.1,
    sensors: [0.2, 0.4],
    score: 1,
    onTrack: true,
  },
  {
    step: 1,
    position: { x: 10, y: 20, elevation: 2 },
    heading: -Math.PI + 0.1,
    speed: 30,
    progress: 0.2,
    sensors: [0.4, 0.8],
    score: 3,
    onTrack: true,
  },
];

test("replay sampling interpolates position and heading between simulation steps", () => {
  const frame = sampleReplay(replay, 0.5, { loop: false });

  assert.deepEqual(frame.position, { x: 5, y: 15, elevation: 1 });
  assert.ok(Math.abs(Math.abs(frame.heading) - Math.PI) < 1e-9);
  assert.equal(frame.speed, 25);
  assert.ok(Math.abs(frame.progress - 0.15) < 1e-12);
  assert.ok(Math.abs(frame.sensors[0] - 0.3) < 1e-12);
  assert.ok(Math.abs(frame.sensors[1] - 0.6) < 1e-12);
  assert.equal(frame.score, 2);
});

test("a crashed short replay does not restart while the generation is still playing", () => {
  assert.equal(sampleReplay(replay, 2.1, { loop: false }), null);
  assert.ok(
    Math.abs(sampleReplay(replay, 2.1, { loop: true }).position.x - 1) < 1e-12,
  );
});

test("replay history follows new generations until the user inspects an older one", () => {
  const history = createReplayHistory({ limit: 3 });
  history.add({ generation: 1, replay });
  history.add({ generation: 2, replay });
  assert.equal(history.current().generation, 2);

  history.previous();
  history.add({ generation: 3, replay });
  assert.equal(history.current().generation, 1);

  history.next();
  assert.equal(history.current().generation, 2);
  history.selectGeneration(3);
  assert.equal(history.current().generation, 3);
  assert.equal(history.followingLatest, false);
  assert.throws(() => history.selectGeneration(99), /generation/i);
  history.followLatest();
  assert.equal(history.current().generation, 3);

  history.add({ generation: 4, replay });
  assert.deepEqual(history.list().map((entry) => entry.generation), [2, 3, 4]);
});
