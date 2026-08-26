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

function segmentPrimitive(start, end) {
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
