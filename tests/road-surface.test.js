import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRoadSurface,
  pointOnRoadSurface,
} from "../src/core/road-surface.js";

test("a sharp concave corner stays completely covered by the rendered road", () => {
  const points = [
    { x: 0, y: 0, width: 80 },
    { x: 120, y: 0, width: 80 },
    { x: 70, y: 35, width: 80 },
  ];
  const surface = buildRoadSurface(points, {
    defaultWidth: 80,
    closed: false,
  });

  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 24) {
    const point = {
      x: 120 + Math.cos(angle) * 34,
      y: Math.sin(angle) * 34,
    };
    assert.equal(
      pointOnRoadSurface(point, surface),
      true,
      `corner contains a triangular hole near angle ${angle}`,
    );
  }
});

test("variable-width road primitives preserve the local width at every join", () => {
  const surface = buildRoadSurface(
    [
      { x: 0, y: 0, width: 40 },
      { x: 100, y: 0, width: 100 },
      { x: 100, y: 100, width: 60 },
    ],
    { defaultWidth: 72, closed: false },
  );

  assert.deepEqual(
    surface.joins.map((join) => join.radius),
    [20, 50, 30],
  );
  assert.equal(pointOnRoadSurface({ x: 147, y: 0 }, surface), true);
  assert.equal(pointOnRoadSurface({ x: 153, y: 0 }, surface), false);
});

test("distant route segments expose a grade-separated self-crossing", () => {
  const surface = buildRoadSurface(
    [
      { x: -120, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 120 },
      { x: 0, y: -120 },
      { x: -120, y: -120 },
    ],
    { defaultWidth: 28, closed: false },
  );

  assert.equal(surface.intersections.length, 1);
  assert.deepEqual(
    {
      x: surface.intersections[0].x,
      y: surface.intersections[0].y,
      underSegmentIndex: surface.intersections[0].underSegmentIndex,
      overSegmentIndex: surface.intersections[0].overSegmentIndex,
    },
    {
      x: 60,
      y: 0,
      underSegmentIndex: 0,
      overSegmentIndex: 2,
    },
  );
});
