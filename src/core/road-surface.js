const EPSILON = 1e-6;

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${label} must be finite.`);
  }
  return number;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (number <= 0) {
    throw new RangeError(`${label} must be positive.`);
  }
  return number;
}

function readPoint(source, index, defaultWidth, extraWidth) {
  const x = finiteNumber(source?.x, `Road point ${index + 1} x`);
  const y = finiteNumber(source?.y, `Road point ${index + 1} y`);
  const width = positiveNumber(
    source?.width ?? defaultWidth,
    `Road point ${index + 1} width`,
  );
  const radius = (width + extraWidth) / 2;
  if (radius <= 0) {
    throw new RangeError("Road width plus extra width must be positive.");
  }
  return Object.freeze({ x, y, width, radius });
}

function segmentPrimitive(start, end, index) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= EPSILON) return null;

  const normalX = -dy / length;
  const normalY = dx / length;
  const polygon = Object.freeze([
    Object.freeze({
      x: start.x + normalX * start.radius,
      y: start.y + normalY * start.radius,
    }),
    Object.freeze({
      x: end.x + normalX * end.radius,
      y: end.y + normalY * end.radius,
    }),
    Object.freeze({
      x: end.x - normalX * end.radius,
      y: end.y - normalY * end.radius,
    }),
    Object.freeze({
      x: start.x - normalX * start.radius,
      y: start.y - normalY * start.radius,
    }),
  ]);

  return Object.freeze({
    index,
    start,
    end,
    dx,
    dy,
    length,
    startRadius: start.radius,
    endRadius: end.radius,
    polygon,
  });
}

function cross(leftX, leftY, rightX, rightY) {
  return leftX * rightY - leftY * rightX;
}

function segmentIntersection(under, over) {
  const denominator = cross(under.dx, under.dy, over.dx, over.dy);
  if (Math.abs(denominator) <= EPSILON) return null;

  const offsetX = over.start.x - under.start.x;
  const offsetY = over.start.y - under.start.y;
  const underT = cross(offsetX, offsetY, over.dx, over.dy) / denominator;
  const overT = cross(offsetX, offsetY, under.dx, under.dy) / denominator;
  if (
    underT <= EPSILON ||
    underT >= 1 - EPSILON ||
    overT <= EPSILON ||
    overT >= 1 - EPSILON
  ) {
    return null;
  }

  return Object.freeze({
    x: under.start.x + under.dx * underT,
    y: under.start.y + under.dy * underT,
    underSegmentIndex: under.index,
    overSegmentIndex: over.index,
    underRadius:
      under.startRadius +
      (under.endRadius - under.startRadius) * underT,
    overRadius:
      over.startRadius +
      (over.endRadius - over.startRadius) * overT,
    overHeading: Math.atan2(over.dy, over.dx),
  });
}

function selfIntersections(segments, closed) {
  const intersections = [];
  for (let left = 0; left < segments.length; left += 1) {
    for (let right = left + 1; right < segments.length; right += 1) {
      const under = segments[left];
      const over = segments[right];
      const adjacent =
        Math.abs(under.index - over.index) <= 1 ||
        (closed &&
          under.index === 0 &&
          over.index === segments.length - 1);
      if (adjacent) continue;
      const intersection = segmentIntersection(under, over);
      if (intersection) intersections.push(intersection);
    }
  }
  return Object.freeze(intersections);
}

/**
 * Build a road as overlapping tapered segment strips and circular joins.
 *
 * Unlike a single offset polygon, these primitives remain a union at sharp
 * corners and when nearby road sections overlap. A Canvas renderer can append
 * every segment polygon and join circle to one path and fill it once.
 */
export function buildRoadSurface(
  source,
  { defaultWidth = 80, closed = false, extraWidth = 0 } = {},
) {
  if (!Array.isArray(source)) {
    throw new TypeError("Road points must be an array.");
  }

  const fallbackWidth = positiveNumber(defaultWidth, "Default road width");
  const widthExtension = finiteNumber(extraWidth, "Extra road width");
  const points = source.map((point, index) =>
    readPoint(point, index, fallbackWidth, widthExtension),
  );
  const segmentCount = closed ? points.length : Math.max(0, points.length - 1);
  const segments = [];

  for (let index = 0; index < segmentCount; index += 1) {
    const segment = segmentPrimitive(
      points[index],
      points[(index + 1) % points.length],
      index,
    );
    if (segment) segments.push(segment);
  }

  const joins = points.map((point) =>
    Object.freeze({
      x: point.x,
      y: point.y,
      radius: point.radius,
    }),
  );

  return Object.freeze({
    closed: Boolean(closed),
    segments: Object.freeze(segments),
    joins: Object.freeze(joins),
    intersections: selfIntersections(segments, Boolean(closed)),
  });
}

function pointInSegment(point, segment) {
  const relativeX = point.x - segment.start.x;
  const relativeY = point.y - segment.start.y;
  const denominator = segment.length * segment.length;
  const t = Math.max(
    0,
    Math.min(1, (relativeX * segment.dx + relativeY * segment.dy) / denominator),
  );
  const centerX = segment.start.x + segment.dx * t;
  const centerY = segment.start.y + segment.dy * t;
  const radius =
    segment.startRadius +
    (segment.endRadius - segment.startRadius) * t;
  return Math.hypot(point.x - centerX, point.y - centerY) <= radius + EPSILON;
}

export function pointOnRoadSurface(point, surface) {
  const candidate = {
    x: finiteNumber(point?.x, "Road probe x"),
    y: finiteNumber(point?.y, "Road probe y"),
  };
  if (!surface || !Array.isArray(surface.segments) || !Array.isArray(surface.joins)) {
    throw new TypeError("A compiled road surface is required.");
  }

  if (surface.segments.some((segment) => pointInSegment(candidate, segment))) {
    return true;
  }
  return surface.joins.some(
    (join) =>
      Math.hypot(candidate.x - join.x, candidate.y - join.y) <=
      join.radius + EPSILON,
  );
}
