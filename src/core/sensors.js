const SENSOR_COUNT = 7;
const DEFAULT_MAX_DISTANCE = 100;
const DEFAULT_STEP = 1;
const DEFAULT_ANGLES = Object.freeze([
  -Math.PI / 2,
  -Math.PI / 3,
  -Math.PI / 6,
  0,
  Math.PI / 6,
  Math.PI / 3,
  Math.PI / 2,
]);
const RANGE_EPSILON = 1e-9;

function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite.`);
  }

  return value;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (number <= 0) {
    throw new RangeError(`${label} must be positive.`);
  }

  return number;
}

function readOffset(source, index) {
  const offset = source ?? { x: 0, y: 0 };
  const x = finiteNumber(offset.x ?? 0, `Ray ${index + 1} x offset`);
  const y = finiteNumber(offset.y ?? 0, `Ray ${index + 1} y offset`);

  return Object.freeze({ x, y });
}

function compileRay(source, index, defaultMaxDistance, defaultStep) {
  const definition =
    typeof source === "number" ? { angle: source } : source ?? {};
  const angle = finiteNumber(
    definition.angle,
    `Ray ${index + 1} angle`,
  );
  const maxDistance = positiveNumber(
    definition.maxDistance ?? defaultMaxDistance,
    `Ray ${index + 1} max distance`,
  );
  const step = positiveNumber(
    definition.step ?? defaultStep,
    `Ray ${index + 1} step`,
  );

  return Object.freeze({
    angle,
    maxDistance,
    step,
    offset: readOffset(definition.offset, index),
  });
}

function readVehiclePose(vehicle) {
  const candidate = vehicle?.position ?? vehicle;
  if (!candidate || typeof candidate !== "object") {
    throw new TypeError("A vehicle pose is required to read sensors.");
  }

  const x = finiteNumber(candidate.x, "Vehicle x position");
  const y = finiteNumber(candidate.y, "Vehicle y position");
  const heading = finiteNumber(
    vehicle?.heading ?? candidate.heading ?? 0,
    "Vehicle heading",
  );
  const referenceDistanceAlong =
    vehicle?.distanceAlong == null
      ? undefined
      : finiteNumber(vehicle.distanceAlong, "Vehicle route distance");

  return { x, y, heading, referenceDistanceAlong };
}

function normalizedReading(value, index) {
  const reading = finiteNumber(value, `Ray ${index + 1} distance`);
  if (reading < -RANGE_EPSILON || reading > 1 + RANGE_EPSILON) {
    throw new RangeError(`Ray ${index + 1} distance must be in [0, 1].`);
  }

  return Math.max(0, Math.min(1, reading));
}

/**
 * Create a fixed seven-ray sensor rig. Ray angles are relative to the
 * vehicle's heading and distances are normalized by the configured range.
 */
export function createRaySensors(options = {}) {
  const defaultMaxDistance = positiveNumber(
    options.maxDistance ?? DEFAULT_MAX_DISTANCE,
    "Default ray max distance",
  );
  const defaultStep = positiveNumber(
    options.step ?? DEFAULT_STEP,
    "Default ray step",
  );
  const source = options.rays ?? options.angles ?? DEFAULT_ANGLES;

  if (!Array.isArray(source)) {
    throw new TypeError("Ray configuration must be an array.");
  }
  if (source.length !== SENSOR_COUNT) {
    throw new RangeError("A sensor rig must contain exactly seven rays.");
  }

  const rays = Object.freeze(
    source.map((ray, index) =>
      compileRay(ray, index, defaultMaxDistance, defaultStep),
    ),
  );

  function observe(course, vehicle) {
    let targetCourse = course;
    let targetVehicle = vehicle;
    if (!targetCourse?.raycast && targetVehicle?.raycast) {
      [targetCourse, targetVehicle] = [targetVehicle, targetCourse];
    }
    if (typeof targetCourse?.raycast !== "function") {
      throw new TypeError("A course with a raycast function is required.");
    }

    const pose = readVehiclePose(targetVehicle);
    const cosHeading = Math.cos(pose.heading);
    const sinHeading = Math.sin(pose.heading);

    return Object.freeze(
      rays.map((ray, index) => {
        const origin = {
          x:
            pose.x + ray.offset.x * cosHeading - ray.offset.y * sinHeading,
          y:
            pose.y + ray.offset.x * sinHeading + ray.offset.y * cosHeading,
        };
        const worldAngle = pose.heading + ray.angle;
        const reading = targetCourse.raycast(
          origin,
          worldAngle,
          ray.maxDistance,
          ray.step,
          pose.referenceDistanceAlong == null
            ? undefined
            : { referenceDistanceAlong: pose.referenceDistanceAlong },
        );

        return normalizedReading(reading, index);
      }),
    );
  }

  return Object.freeze({
    count: SENSOR_COUNT,
    rays,
    observe,
  });
}

export const createSensorRig = createRaySensors;
