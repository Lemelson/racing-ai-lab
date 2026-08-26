const EPSILON = 1e-6;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function copyPoint(point) {
  const copy = {
    x: finiteNumber(point?.x),
    y: finiteNumber(point?.y),
  };
  if (point?.width != null) copy.width = finiteNumber(point.width);
  if (point?.elevation != null) copy.elevation = finiteNumber(point.elevation);
  return copy;
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function interpolatePoint(start, end, t) {
  const point = {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };

  for (const property of ["width", "elevation"]) {
    if (start[property] != null || end[property] != null) {
      const startValue = finiteNumber(start[property], finiteNumber(end[property]));
      const endValue = finiteNumber(end[property], startValue);
      point[property] = startValue + (endValue - startValue) * t;
    }
  }

  return point;
}

function usablePoints(source) {
  const points = [];
  for (const value of source ?? []) {
    const point = copyPoint(value);
    if (!points.length || distance(points.at(-1), point) > EPSILON) {
      points.push(point);
    }
  }
  return points;
}

export function resamplePath(source, { spacing = 16, closed = false } = {}) {
  const points = usablePoints(source);
  const sampleSpacing = Number(spacing);

  if (!Number.isFinite(sampleSpacing) || sampleSpacing <= 0) {
    throw new RangeError("Sample spacing must be a positive finite number.");
  }
  if (points.length < 2) return points;

  const segmentCount = closed ? points.length : points.length - 1;
  const segments = [];
  let totalLength = 0;

  for (let index = 0; index < segmentCount; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const length = distance(start, end);
    if (length <= EPSILON) continue;
    segments.push({ start, end, length, startDistance: totalLength });
    totalLength += length;
  }

  if (totalLength <= EPSILON) return [points[0]];

  const sampleDistances = [];
  for (
    let sampleDistance = 0;
    closed ? sampleDistance < totalLength - EPSILON : sampleDistance <= totalLength;
    sampleDistance += sampleSpacing
  ) {
    sampleDistances.push(Math.min(sampleDistance, totalLength));
  }
  if (!closed && sampleDistances.at(-1) < totalLength - EPSILON) {
    sampleDistances.push(totalLength);
  }

  let segmentIndex = 0;
  return sampleDistances.map((sampleDistance) => {
    while (
      segmentIndex < segments.length - 1 &&
      sampleDistance >
        segments[segmentIndex].startDistance + segments[segmentIndex].length
    ) {
      segmentIndex += 1;
    }
    const segment = segments[segmentIndex];
    const t = Math.max(
      0,
      Math.min(
        1,
        (sampleDistance - segment.startDistance) / segment.length,
      ),
    );
    return interpolatePoint(segment.start, segment.end, t);
  });
}

export function smoothPath(
  source,
  { closed = false, passes = 1 } = {},
) {
  const passCount = Number(passes);
  if (!Number.isInteger(passCount) || passCount < 0 || passCount > 6) {
    throw new RangeError("Smoothing passes must be an integer from 0 to 6.");
  }
  let points = usablePoints(source);
  if (points.length < 3 || passCount === 0) return points;

  for (let pass = 0; pass < passCount; pass += 1) {
    const smoothed = [];
    if (!closed) smoothed.push(copyPoint(points[0]));
    const segmentCount = closed ? points.length : points.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      smoothed.push(interpolatePoint(start, end, 0.25));
      smoothed.push(interpolatePoint(start, end, 0.75));
    }
    if (!closed) smoothed.push(copyPoint(points.at(-1)));
    points = smoothed;
  }
  return points;
}

export function appendStroke(
  existingSource,
  strokeSource,
  { spacing = 16, snapDistance = 36 } = {},
) {
  const existing = usablePoints(existingSource);
  const stroke = resamplePath(strokeSource, { spacing });
  if (stroke.length < 2) {
    return { attached: false, points: existing };
  }
  if (existing.length === 0) {
    return { attached: true, points: stroke };
  }

  const start = existing[0];
  const end = existing.at(-1);
  const strokeStart = stroke[0];
  const strokeEnd = stroke.at(-1);
  const candidates = [
    { kind: "append", reverse: false, distance: distance(end, strokeStart) },
    { kind: "append", reverse: true, distance: distance(end, strokeEnd) },
    { kind: "prepend", reverse: false, distance: distance(start, strokeEnd) },
    { kind: "prepend", reverse: true, distance: distance(start, strokeStart) },
  ].sort((left, right) => left.distance - right.distance);
  const match = candidates[0];

  if (match.distance > snapDistance) {
    return { attached: false, points: existing };
  }

  const oriented = match.reverse ? [...stroke].reverse() : stroke;
  if (match.kind === "append") {
    return {
      attached: true,
      points: [...existing, ...oriented.slice(1)],
    };
  }
  return {
    attached: true,
    points: [...oriented.slice(0, -1), ...existing],
  };
}

export function eraseRoute(source, { center, radius }) {
  const brushRadius = Number(radius);
  if (!Number.isFinite(brushRadius) || brushRadius <= 0) {
    throw new RangeError("Eraser radius must be a positive finite number.");
  }
  return usablePoints(source).filter(
    (point) => distance(point, center) > brushRadius,
  );
}

export function eraseRouteFragments(fragmentsSource, { center, radius }) {
  const brushRadius = Number(radius);
  if (!Number.isFinite(brushRadius) || brushRadius <= 0) {
    throw new RangeError("Eraser radius must be a positive finite number.");
  }

  const fragments = [];
  for (const source of fragmentsSource ?? []) {
    let active = [];
    for (const point of usablePoints(source)) {
      if (distance(point, center) <= brushRadius) {
        if (active.length >= 2) fragments.push(active);
        active = [];
      } else {
        active.push(point);
      }
    }
    if (active.length >= 2) fragments.push(active);
  }
  return fragments;
}

function orientedForEndpoint(fragment, endpoint, targetSide) {
  const shouldReverse =
    (targetSide === "end" && endpoint === "start") ||
    (targetSide === "start" && endpoint === "end");
  return shouldReverse ? [...fragment].reverse() : [...fragment];
}

function endpointCandidates(fragments, point) {
  return fragments.flatMap((fragment, fragmentIndex) => [
    {
      fragmentIndex,
      endpoint: "start",
      point: fragment[0],
      distance: distance(fragment[0], point),
    },
    {
      fragmentIndex,
      endpoint: "end",
      point: fragment.at(-1),
      distance: distance(fragment.at(-1), point),
    },
  ]);
}

function selectAttachmentPair(fragments, stroke, snapDistance) {
  const startCandidates = [
    null,
    ...endpointCandidates(fragments, stroke[0]).filter(
      (candidate) => candidate.distance <= snapDistance,
    ),
  ];
  const endCandidates = [
    null,
    ...endpointCandidates(fragments, stroke.at(-1)).filter(
      (candidate) => candidate.distance <= snapDistance,
    ),
  ];
  const pairs = [];

  for (const start of startCandidates) {
    for (const end of endCandidates) {
      if (
        start &&
        end &&
        start.fragmentIndex === end.fragmentIndex &&
        start.endpoint === end.endpoint
      ) {
        continue;
      }
      const count = Number(Boolean(start)) + Number(Boolean(end));
      const totalDistance = (start?.distance ?? 0) + (end?.distance ?? 0);
      pairs.push({ start, end, count, totalDistance });
    }
  }

  return pairs.sort(
    (left, right) =>
      right.count - left.count || left.totalDistance - right.totalDistance,
  )[0];
}

export function addStrokeToFragments(
  fragmentsSource,
  strokeSource,
  { spacing = 16, snapDistance = 36 } = {},
) {
  const fragments = (fragmentsSource ?? [])
    .map(usablePoints)
    .filter((fragment) => fragment.length >= 2);
  const stroke = resamplePath(strokeSource, { spacing });
  if (stroke.length < 2) {
    return { attached: false, closed: false, fragments };
  }
  if (fragments.length === 0) {
    const closed =
      stroke.length >= 3 &&
      distance(stroke[0], stroke.at(-1)) <= snapDistance;
    if (closed) stroke.pop();
    return { attached: true, closed, fragments: [stroke] };
  }

  const pair = selectAttachmentPair(fragments, stroke, snapDistance);
  if (pair.count === 0) {
    return {
      attached: false,
      closed: false,
      fragments: [...fragments, stroke],
    };
  }

  let orientedStroke = [...stroke];
  let leftAttachment = pair.start;
  let rightAttachment = pair.end;
  if (!leftAttachment && rightAttachment) {
    orientedStroke.reverse();
    leftAttachment = rightAttachment;
    rightAttachment = null;
  }

  const leftFragment = orientedForEndpoint(
    fragments[leftAttachment.fragmentIndex],
    leftAttachment.endpoint,
    "end",
  );
  orientedStroke[0] = copyPoint(leftFragment.at(-1));

  if (!rightAttachment) {
    const merged = [...leftFragment, ...orientedStroke.slice(1)];
    return {
      attached: true,
      closed: false,
      fragments: fragments.map((fragment, index) =>
        index === leftAttachment.fragmentIndex ? merged : fragment,
      ),
    };
  }

  const rightFragment = orientedForEndpoint(
    fragments[rightAttachment.fragmentIndex],
    rightAttachment.endpoint,
    "start",
  );
  orientedStroke[orientedStroke.length - 1] = copyPoint(rightFragment[0]);

  let merged;
  const closesExistingFragment =
    leftAttachment.fragmentIndex === rightAttachment.fragmentIndex;
  if (closesExistingFragment) {
    merged = [...leftFragment, ...orientedStroke.slice(1)];
    if (distance(merged[0], merged.at(-1)) <= EPSILON) merged.pop();
  } else {
    merged = [
      ...leftFragment,
      ...orientedStroke.slice(1),
      ...rightFragment.slice(1),
    ];
  }

  const removedIndexes = new Set([
    leftAttachment.fragmentIndex,
    rightAttachment.fragmentIndex,
  ]);
  return {
    attached: true,
    closed: closesExistingFragment,
    fragments: [
      ...fragments.filter((_, index) => !removedIndexes.has(index)),
      merged,
    ],
  };
}

export function paintRouteProperty(
  source,
  { center, radius, property, value, falloff = false },
) {
  if (!["width", "elevation"].includes(property)) {
    throw new RangeError("Only width and elevation can be painted.");
  }
  const brushRadius = Number(radius);
  const numericValue = Number(value);
  if (
    !Number.isFinite(brushRadius) ||
    brushRadius <= 0 ||
    !Number.isFinite(numericValue) ||
    (property === "width" && numericValue <= 0)
  ) {
    throw new RangeError("Brush radius and value must be finite.");
  }

  return usablePoints(source).map((point) => {
    const pointDistance = distance(point, center);
    if (pointDistance > brushRadius) return point;
    if (!falloff) return { ...point, [property]: numericValue };
    const currentValue = finiteNumber(point[property], numericValue);
    const weight = Math.max(0, 1 - pointDistance / brushRadius);
    return {
      ...point,
      [property]: currentValue + (numericValue - currentValue) * weight,
    };
  });
}

export function finalizeRoute(
  source,
  { spacing = 18, closed = true, smoothingPasses = 0 } = {},
) {
  const smoothed = smoothPath(source, {
    closed,
    passes: smoothingPasses,
  });
  const points = resamplePath(smoothed, { spacing, closed });
  if (points.length < 3) {
    throw new RangeError("Нарисуй маршрут минимум из трёх участков.");
  }
  return { closed, points };
}

export function finalizeFragments(
  fragmentsSource,
  {
    spacing = 18,
    closed = true,
    maxClosingDistance = 80,
    smoothingPasses = 0,
    routeClosed,
  } = {},
) {
  const fragments = (fragmentsSource ?? [])
    .map(usablePoints)
    .filter((fragment) => fragment.length >= 2);
  if (fragments.length !== 1) {
    throw new RangeError("Трасса должна образовывать единый маршрут.");
  }
  if (closed && routeClosed === false) {
    throw new RangeError("Соедини начало и конец трассы.");
  }
  if (
    closed &&
    routeClosed !== true &&
    distance(fragments[0][0], fragments[0].at(-1)) > maxClosingDistance
  ) {
    throw new RangeError("Соедини начало и конец трассы.");
  }
  return finalizeRoute(fragments[0], {
    spacing,
    closed,
    smoothingPasses,
  });
}

export function fitRouteInView(
  source,
  {
    viewportWidth,
    viewportHeight,
    padding = 48,
    minimumZoom = 0.05,
    maximumZoom = 4,
  },
) {
  const points = usablePoints(source);
  const width = Number(viewportWidth);
  const height = Number(viewportHeight);
  const inset = Math.max(0, Number(padding));

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError("Viewport dimensions must be positive.");
  }
  if (points.length === 0) {
    return { zoom: 1, offsetX: width / 2, offsetY: height / 2 };
  }

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const routeWidth = Math.max(EPSILON, maxX - minX);
  const routeHeight = Math.max(EPSILON, maxY - minY);
  const availableWidth = Math.max(1, width - inset * 2);
  const availableHeight = Math.max(1, height - inset * 2);
  const zoom = Math.max(
    minimumZoom,
    Math.min(maximumZoom, availableWidth / routeWidth, availableHeight / routeHeight),
  );

  return {
    zoom,
    offsetX: width / 2 - ((minX + maxX) / 2) * zoom,
    offsetY: height / 2 - ((minY + maxY) / 2) * zoom,
  };
}
