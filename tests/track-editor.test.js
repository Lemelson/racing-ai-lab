import test from "node:test";
import assert from "node:assert/strict";

import {
  addStrokeToFragments,
  appendStroke,
  eraseRoute,
  eraseRouteFragments,
  finalizeFragments,
  finalizeRoute,
  fitRouteInView,
  paintRouteProperty,
  resamplePath,
  smoothPath,
} from "../src/core/track-editor.js";

function roundedCoordinates(points) {
  return points.map(({ x, y }) => [Math.round(x), Math.round(y)]);
}

test("resampling produces the same route for slow and fast pointer input", () => {
  const sparseInput = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];
  const denseInput = Array.from({ length: 101 }, (_, x) => ({ x, y: 0 }));

  const sparseRoute = resamplePath(sparseInput, { spacing: 20 });
  const denseRoute = resamplePath(denseInput, { spacing: 20 });

  assert.deepEqual(roundedCoordinates(sparseRoute), [
    [0, 0],
    [20, 0],
    [40, 0],
    [60, 0],
    [80, 0],
    [100, 0],
  ]);
  assert.deepEqual(roundedCoordinates(denseRoute), roundedCoordinates(sparseRoute));
});

test("appending a later stroke extends the nearest route endpoint", () => {
  const route = resamplePath(
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    { spacing: 20 },
  );

  const result = appendStroke(
    route,
    [
      { x: 102, y: 1 },
      { x: 200, y: 0 },
    ],
    { spacing: 20, snapDistance: 12 },
  );

  assert.equal(result.attached, true);
  assert.deepEqual(roundedCoordinates(result.points).at(-1), [200, 0]);
  assert.ok(result.points.length > route.length);
});

test("a disconnected stroke is rejected instead of silently replacing the route", () => {
  const route = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];

  const result = appendStroke(
    route,
    [
      { x: 300, y: 300 },
      { x: 400, y: 300 },
    ],
    { snapDistance: 20 },
  );

  assert.equal(result.attached, false);
  assert.deepEqual(result.points, route);
});

test("finalizing a closed route samples the hidden closing segment uniformly", () => {
  const draft = [
    { x: 0, y: 0, width: 60 },
    { x: 100, y: 0, width: 80 },
    { x: 100, y: 100, width: 100 },
    { x: 0, y: 100, width: 80 },
  ];

  const finalized = finalizeRoute(draft, { spacing: 25, closed: true });

  assert.equal(finalized.closed, true);
  assert.equal(finalized.points.length, 16);
  assert.deepEqual(roundedCoordinates(finalized.points).slice(-3), [
    [0, 75],
    [0, 50],
    [0, 25],
  ]);
  assert.equal(finalized.points.at(-1).width, 65);
});

test("width and elevation brushes update only nearby route samples", () => {
  const route = [
    { x: 0, y: 0, width: 60, elevation: 0 },
    { x: 50, y: 0, width: 60, elevation: 0 },
    { x: 100, y: 0, width: 60, elevation: 0 },
  ];

  const widened = paintRouteProperty(route, {
    center: { x: 50, y: 0 },
    radius: 30,
    property: "width",
    value: 110,
  });
  const raised = paintRouteProperty(widened, {
    center: { x: 0, y: 0 },
    radius: 10,
    property: "elevation",
    value: 12,
  });

  assert.deepEqual(
    raised.map(({ width, elevation }) => [width, elevation]),
    [
      [60, 12],
      [110, 0],
      [60, 0],
    ],
  );
});

test("soft width brush blends the road edge instead of creating a hard step", () => {
  const route = [
    { x: 0, y: 0, width: 60 },
    { x: 25, y: 0, width: 60 },
    { x: 50, y: 0, width: 60 },
  ];

  const painted = paintRouteProperty(route, {
    center: { x: 0, y: 0 },
    radius: 50,
    property: "width",
    value: 100,
    falloff: true,
  });

  assert.deepEqual(
    painted.map((point) => Math.round(point.width)),
    [100, 80, 60],
  );
});

test("eraser removes nearby samples and keeps the rest editable", () => {
  const route = Array.from({ length: 6 }, (_, index) => ({
    x: index * 20,
    y: 0,
  }));

  const erased = eraseRoute(route, { center: { x: 50, y: 0 }, radius: 12 });

  assert.deepEqual(roundedCoordinates(erased), [
    [0, 0],
    [20, 0],
    [80, 0],
    [100, 0],
  ]);
});

test("erasing the middle of a route creates two fragments without a hidden chord", () => {
  const route = Array.from({ length: 7 }, (_, index) => ({
    x: index * 20,
    y: 0,
  }));

  const fragments = eraseRouteFragments([route], {
    center: { x: 60, y: 0 },
    radius: 15,
  });

  assert.equal(fragments.length, 2);
  assert.deepEqual(fragments.map(roundedCoordinates), [
    [
      [0, 0],
      [20, 0],
      [40, 0],
    ],
    [
      [80, 0],
      [100, 0],
      [120, 0],
    ],
  ]);
});

test("a bridge stroke reconnects two erased fragments into one route", () => {
  const fragments = [
    [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ],
    [
      { x: 80, y: 0 },
      { x: 120, y: 0 },
    ],
  ];

  const result = addStrokeToFragments(
    fragments,
    [
      { x: 40, y: 1 },
      { x: 80, y: 1 },
    ],
    { spacing: 10, snapDistance: 8 },
  );

  assert.equal(result.fragments.length, 1);
  assert.deepEqual(roundedCoordinates(result.fragments[0]), [
    [0, 0],
    [40, 0],
    [50, 1],
    [60, 1],
    [70, 1],
    [80, 0],
    [120, 0],
  ]);
});

test("a closing stroke preserves an explicit closed-route state", () => {
  const result = addStrokeToFragments(
    [
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ],
    ],
    [
      { x: 100, y: 1 },
      { x: 50, y: 60 },
      { x: 2, y: 1 },
    ],
    { spacing: 10, snapDistance: 8 },
  );

  assert.equal(result.closed, true);
  assert.equal(result.fragments.length, 1);
  assert.deepEqual(roundedCoordinates(result.fragments[0])[0], [0, 0]);
  assert.notDeepEqual(
    roundedCoordinates(result.fragments[0]).at(-1),
    roundedCoordinates(result.fragments[0])[0],
    "closed routes store topology instead of a duplicate endpoint",
  );
});

test("a first stroke that ends in the start snap zone becomes closed", () => {
  const result = addStrokeToFragments(
    [],
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 3, y: 2 },
    ],
    { spacing: 10, snapDistance: 8 },
  );

  assert.equal(result.closed, true);
});

test("finalization rejects disconnected fragments and distant endpoints", () => {
  assert.throws(
    () =>
      finalizeFragments([
        [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
        ],
        [
          { x: 100, y: 0 },
          { x: 120, y: 0 },
        ],
      ]),
    /единый маршрут/i,
  );

  assert.throws(
    () =>
      finalizeFragments(
        [
          [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 200, y: 0 },
          ],
        ],
        { maxClosingDistance: 50 },
      ),
    /соедини начало и конец/i,
  );
});

test("explicit closure is required before finalization", () => {
  const fragment = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 5, y: 4 },
  ];

  assert.throws(
    () => finalizeFragments([fragment], { routeClosed: false }),
    /соедини начало и конец/i,
  );
  assert.equal(
    finalizeFragments([fragment], { routeClosed: true }).closed,
    true,
  );
});

test("closed-path smoothing is baked into editable geometry with interpolated properties", () => {
  const smoothed = smoothPath(
    [
      { x: 0, y: 0, width: 40 },
      { x: 100, y: 0, width: 80 },
      { x: 100, y: 100, width: 120 },
      { x: 0, y: 100, width: 80 },
    ],
    { closed: true, passes: 1 },
  );

  assert.deepEqual(roundedCoordinates(smoothed), [
    [25, 0],
    [75, 0],
    [100, 25],
    [100, 75],
    [75, 100],
    [25, 100],
    [0, 75],
    [0, 25],
  ]);
  assert.deepEqual(
    smoothed.map((point) => Math.round(point.width)),
    [50, 70, 90, 110, 110, 90, 70, 50],
  );
});

test("fit view keeps every route point inside the requested padding", () => {
  const route = [
    { x: -400, y: 100 },
    { x: 800, y: 700 },
  ];

  const view = fitRouteInView(route, {
    viewportWidth: 1000,
    viewportHeight: 600,
    padding: 60,
  });
  const screenPoints = route.map((point) => ({
    x: point.x * view.zoom + view.offsetX,
    y: point.y * view.zoom + view.offsetY,
  }));

  for (const point of screenPoints) {
    assert.ok(point.x >= 60 && point.x <= 940);
    assert.ok(point.y >= 60 && point.y <= 540);
  }
});
