import test from "node:test";
import assert from "node:assert/strict";

import { createCourse } from "../src/core/course.js";
import {
  buildRoadSurface,
  pointOnRoadSurface,
} from "../src/core/road-surface.js";

const rectangle = [
  { x: 0, y: 0, elevation: 0 },
  { x: 200, y: 0, elevation: 10 },
  { x: 200, y: 120, elevation: 20 },
  { x: 0, y: 120, elevation: 10 },
];

test("course rejects a stroke with fewer than three distinct points", () => {
  assert.throws(
    () => createCourse({ points: [{ x: 0, y: 0 }, { x: 0, y: 0 }], width: 40 }),
    /three distinct points/i,
  );
});

test("course projects positions onto ordered progress around the lap", () => {
  const course = createCourse({ points: rectangle, width: 60, closed: true });

  const start = course.locate({ x: 30, y: 3 });
  const afterFirstCorner = course.locate({ x: 198, y: 60 });

  assert.equal(start.onTrack, true);
  assert.equal(afterFirstCorner.onTrack, true);
  assert.ok(afterFirstCorner.distanceAlong > start.distanceAlong);
  assert.ok(afterFirstCorner.progress > start.progress);
});

test("course interpolates elevation independently from the 2D renderer", () => {
  const course = createCourse({ points: rectangle, width: 60, closed: true });

  const pose = course.poseAtDistance(100);

  assert.equal(pose.x, 100);
  assert.equal(pose.y, 0);
  assert.equal(pose.elevation, 5);
  assert.equal(pose.grade > 0, true);
});

test("course raycast returns normalized distance to the road edge", () => {
  const course = createCourse({ points: rectangle, width: 60, closed: true });

  const hit = course.raycast({ x: 100, y: 0 }, Math.PI / 2, 100);

  assert.ok(hit > 0.25 && hit < 0.35);
});

test("course serialization preserves editable point elevation", () => {
  const course = createCourse({ id: "ridge", name: "Ridge", points: rectangle, width: 60 });

  assert.deepEqual(course.toDefinition(), {
    id: "ridge",
    name: "Ridge",
    width: 60,
    closed: true,
    points: rectangle,
  });
});

test("course uses the locally painted road width for collision checks", () => {
  const course = createCourse({
    points: [
      { x: 0, y: 0, width: 40 },
      { x: 200, y: 0, width: 120 },
      { x: 200, y: 200, width: 120 },
      { x: 0, y: 200, width: 40 },
    ],
    width: 60,
    closed: true,
  });

  const narrow = course.locate({ x: 60, y: 40 });
  const wide = course.locate({ x: 190, y: 40 });

  assert.equal(narrow.onTrack, false);
  assert.equal(wide.onTrack, true);
  assert.ok(wide.roadWidth > narrow.roadWidth);
  assert.equal(course.toDefinition().points[0].width, 40);
});

test("vehicle footprint fails when its center is on-road but a corner is outside", () => {
  const course = createCourse({
    points: rectangle,
    width: 20,
    closed: true,
  });

  assert.equal(course.locate({ x: 100, y: 0 }).onTrack, true);
  assert.equal(
    course.containsFootprint({
      position: { x: 100, y: 0 },
      heading: 0,
      width: 18,
      length: 32,
    }),
    true,
  );
  assert.equal(
    course.containsFootprint({
      position: { x: 100, y: 4 },
      heading: 0,
      width: 18,
      length: 32,
    }),
    false,
  );
});

test("collision and renderer share the same variable-width road union", () => {
  const points = [
    { x: 0, y: 0, width: 30 },
    { x: 120, y: 0, width: 120 },
    { x: 70, y: 35, width: 30 },
    { x: 160, y: 80, width: 100 },
    { x: 0, y: 100, width: 30 },
  ];
  const course = createCourse({ points, width: 80, closed: true });
  const rendered = buildRoadSurface(points, {
    defaultWidth: 80,
    closed: true,
  });

  for (let x = -20; x <= 180; x += 4) {
    for (let y = -20; y <= 120; y += 4) {
      const point = { x, y };
      assert.equal(
        course.locate(point).onTrack,
        pointOnRoadSurface(point, rendered),
        `renderer/collision mismatch at ${x},${y}`,
      );
    }
  }
});

test("a distant self-crossing branch does not become a route shortcut", () => {
  const course = createCourse({
    points: [
      { x: -120, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 120 },
      { x: 0, y: -120 },
      { x: -120, y: -120 },
    ],
    width: 28,
    closed: false,
  });
  const firstBranch = course.locate({ x: 60, y: 0 });
  const laterBranch = course.locate(
    { x: 45, y: -30 },
    { referenceDistanceAlong: firstBranch.distanceAlong },
  );

  assert.equal(firstBranch.segmentIndex, 0);
  assert.equal(
    laterBranch.onTrack,
    false,
    "the remote crossing branch must be separated from the current route",
  );
  assert.equal(
    course.containsFootprint(
      {
        position: { x: 45, y: -30 },
        heading: Math.atan2(-240, -120),
        width: 8,
        length: 12,
      },
      { referenceDistanceAlong: firstBranch.distanceAlong },
    ),
    false,
    "a car must not turn from the current branch onto the later crossing branch",
  );

  const laterBranchDistance = course.locate({ x: 45, y: -30 }).distanceAlong;
  const samePointOnItsOwnBranch = course.locate(
    { x: 45, y: -30 },
    { referenceDistanceAlong: laterBranchDistance },
  );
  assert.equal(
    samePointOnItsOwnBranch.onTrack,
    true,
    "the crossing branch must remain drivable when reached in route order",
  );
});
