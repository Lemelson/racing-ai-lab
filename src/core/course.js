import {
  buildRoadSurface,
  pointOnRoadSurface,
} from "./road-surface.js";
import { footprintPoints } from "./vehicle-spec.js";

const EPSILON = 1e-6;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function normalizedPoints(points) {
  const normalized = [];

  for (const source of points ?? []) {
    const point = {
      x: Number(source.x),
      y: Number(source.y),
      elevation: Number(source.elevation ?? 0),
    };
    if (source.width != null) {
      point.width = Number(source.width);
    }

    if (
      ![point.x, point.y, point.elevation].every(Number.isFinite) ||
      (point.width != null && (!Number.isFinite(point.width) || point.width <= 0))
    ) {
      throw new TypeError("Course points must contain finite coordinates.");
    }

    const previous = normalized.at(-1);
    if (!previous || distanceSquared(previous, point) > EPSILON) {
      normalized.push(point);
    }
  }

  if (
    normalized.length > 1 &&
    distanceSquared(normalized[0], normalized.at(-1)) <= EPSILON
  ) {
    normalized.pop();
  }

  if (normalized.length < 3) {
    throw new RangeError("A course needs at least three distinct points.");
  }

  return normalized;
}

function createSegments(points, closed) {
  const count = closed ? points.length : points.length - 1;
  const segments = [];
  let cumulative = 0;

  for (let index = 0; index < count; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);

    if (length <= EPSILON) {
      continue;
    }

    segments.push({
      index,
      start,
      end,
      dx,
      dy,
      length,
      startDistance: cumulative,
    });
    cumulative += length;
  }

  return { segments, totalLength: cumulative };
}

export function createCourse(definition) {
  const points = normalizedPoints(definition?.points);
  const width = Number(definition?.width ?? 72);
  const closed = definition?.closed !== false;

  if (!Number.isFinite(width) || width <= 0) {
    throw new RangeError("Course width must be a positive finite number.");
  }

  const { segments, totalLength } = createSegments(points, closed);
  if (segments.length < 2 || totalLength <= EPSILON) {
    throw new RangeError("Course geometry has no usable length.");
  }
  const roadSurface = buildRoadSurface(points, {
    defaultWidth: width,
    closed,
  });

  function locate(position) {
    let nearest = null;

    for (const segment of segments) {
      const relativeX = position.x - segment.start.x;
      const relativeY = position.y - segment.start.y;
      const dot = relativeX * segment.dx + relativeY * segment.dy;
      const t = clamp(dot / (segment.length * segment.length), 0, 1);
      const x = segment.start.x + segment.dx * t;
      const y = segment.start.y + segment.dy * t;
      const squaredDistance = (position.x - x) ** 2 + (position.y - y) ** 2;

      if (!nearest || squaredDistance < nearest.squaredDistance) {
        const elevation =
          segment.start.elevation +
          (segment.end.elevation - segment.start.elevation) * t;
        const startWidth = segment.start.width ?? width;
        const endWidth = segment.end.width ?? width;
        const roadWidth = startWidth + (endWidth - startWidth) * t;
        const distanceAlong = segment.startDistance + segment.length * t;
        nearest = {
          x,
          y,
          elevation,
          segmentIndex: segment.index,
          segmentT: t,
          distanceFromCenter: Math.sqrt(squaredDistance),
          squaredDistance,
          distanceAlong,
          progress: distanceAlong / totalLength,
          heading: Math.atan2(segment.dy, segment.dx),
          grade: (segment.end.elevation - segment.start.elevation) / segment.length,
          roadWidth,
        };
      }
    }

    return {
      ...nearest,
      onTrack: pointOnRoadSurface(position, roadSurface),
    };
  }

  function poseAtDistance(rawDistance) {
    let distance = Number(rawDistance);
    if (!Number.isFinite(distance)) {
      throw new TypeError("Distance must be finite.");
    }

    if (closed) {
      distance = ((distance % totalLength) + totalLength) % totalLength;
    } else {
      distance = clamp(distance, 0, totalLength);
    }

    const segment =
      segments.find(
        (candidate) =>
          distance >= candidate.startDistance &&
          distance <= candidate.startDistance + candidate.length,
      ) ?? segments.at(-1);
    const t = clamp((distance - segment.startDistance) / segment.length, 0, 1);

    return {
      x: segment.start.x + segment.dx * t,
      y: segment.start.y + segment.dy * t,
      elevation:
        segment.start.elevation +
        (segment.end.elevation - segment.start.elevation) * t,
      heading: Math.atan2(segment.dy, segment.dx),
      grade: (segment.end.elevation - segment.start.elevation) / segment.length,
      roadWidth:
        (segment.start.width ?? width) +
        ((segment.end.width ?? width) - (segment.start.width ?? width)) * t,
      distanceAlong: distance,
      progress: distance / totalLength,
    };
  }

  function raycast(origin, angle, maxDistance, step = 1) {
    if (maxDistance <= 0 || step <= 0) {
      throw new RangeError("Ray distance and step must be positive.");
    }

    if (!locate(origin).onTrack) {
      return 0;
    }

    for (let distance = step; distance <= maxDistance; distance += step) {
      const point = {
        x: origin.x + Math.cos(angle) * distance,
        y: origin.y + Math.sin(angle) * distance,
      };
      if (!locate(point).onTrack) {
        return clamp(distance / maxDistance, 0, 1);
      }
    }

    return 1;
  }

  function containsFootprint(footprint) {
    return footprintPoints(footprint).every((point) => locate(point).onTrack);
  }

  function toDefinition() {
    return {
      id: definition.id,
      name: definition.name,
      width,
      closed,
      points: points.map((point) => ({ ...point })),
    };
  }

  return Object.freeze({
    width,
    length: totalLength,
    points: points.map((point) => Object.freeze({ ...point })),
    roadSurface,
    locate,
    poseAtDistance,
    raycast,
    containsFootprint,
    toDefinition,
  });
}
