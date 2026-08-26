const DEFAULT_FIXED_DT = 1 / 60;
const DEFAULT_MAX_SPEED = 300;
const DEFAULT_MAX_ACCELERATION = 120;
const DEFAULT_BRAKE_DECELERATION = 240;
const DEFAULT_MAX_STEERING_RATE = 2.8;
const DEFAULT_GRAVITY = 9.81;
const DT_EPSILON = 1e-12;

function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite.`);
  }

  return value;
}

function nonNegativeNumber(value, label) {
  const number = finiteNumber(value, label);
  if (number < 0) {
    throw new RangeError(`${label} must be non-negative.`);
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

function boundedNumber(value, minimum, maximum, label) {
  const number = finiteNumber(value, label);
  if (number < minimum || number > maximum) {
    throw new RangeError(`${label} must be in [${minimum}, ${maximum}].`);
  }

  return number;
}

function readPoint(source, label = "Position") {
  if (!source || typeof source !== "object") {
    throw new TypeError(`${label} is required.`);
  }

  const x = finiteNumber(source.x, `${label} x`);
  const y = finiteNumber(source.y, `${label} y`);
  const elevation = finiteNumber(source.elevation ?? 0, `${label} elevation`);

  return { x, y, elevation };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function cloneSnapshot(state) {
  const position = Object.freeze({ ...state.position });
  return Object.freeze({
    position,
    x: position.x,
    y: position.y,
    elevation: position.elevation,
    heading: state.heading,
    speed: state.speed,
    grade: state.grade,
    onTrack: state.onTrack,
    time: state.time,
    throttle: state.throttle,
    brake: state.brake,
    steering: state.steering,
  });
}

function courseSample(course, position) {
  if (!course) {
    return { grade: 0, elevation: position.elevation, onTrack: true };
  }

  if (typeof course.locate !== "function") {
    throw new TypeError("Vehicle course must expose locate(position).");
  }

  const sample = course.locate(position);
  const grade = finiteNumber(sample?.grade ?? 0, "Course grade");
  const elevation = finiteNumber(
    sample?.elevation ?? position.elevation,
    "Course elevation",
  );

  return {
    grade,
    elevation,
    onTrack: sample?.onTrack !== false,
    heading: sample?.heading,
  };
}

function readAction(action = {}) {
  if (!action || typeof action !== "object") {
    throw new TypeError("Vehicle action must be an object.");
  }

  const throttle = boundedNumber(
    action.throttle ?? 0,
    0,
    1,
    "Throttle",
  );
  const brake = boundedNumber(action.brake ?? 0, 0, 1, "Brake");
  const steering = boundedNumber(
    action.steering ?? 0,
    -1,
    1,
    "Steering",
  );

  return { throttle, brake, steering };
}

/**
 * Create a deterministic fixed-timestep, planar kinematic vehicle.
 * Course elevation contributes a gravity term along the nearest course
 * segment; the renderer remains 2D while elevation is retained in state.
 */
export function createVehicle(options = {}) {
  const course = options.course;
  if (course !== undefined && (!course || typeof course.locate !== "function")) {
    throw new TypeError("Vehicle course must expose locate(position).");
  }

  const fixedDt = positiveNumber(
    options.fixedDt ?? DEFAULT_FIXED_DT,
    "Fixed timestep",
  );
  const maxSpeed = positiveNumber(
    options.maxSpeed ?? DEFAULT_MAX_SPEED,
    "Maximum speed",
  );
  const maxAcceleration = nonNegativeNumber(
    options.maxAcceleration ?? options.acceleration ?? DEFAULT_MAX_ACCELERATION,
    "Maximum acceleration",
  );
  const brakeDeceleration = nonNegativeNumber(
    options.brakeDeceleration ?? options.braking ?? DEFAULT_BRAKE_DECELERATION,
    "Brake deceleration",
  );
  const maxSteeringRate = nonNegativeNumber(
    options.maxSteeringRate ?? options.turnRate ?? DEFAULT_MAX_STEERING_RATE,
    "Maximum steering rate",
  );
  const gravity = nonNegativeNumber(options.gravity ?? DEFAULT_GRAVITY, "Gravity");

  const initialPosition = readPoint(options.position ?? { x: 0, y: 0 });
  const initialHeading = finiteNumber(options.heading ?? 0, "Heading");
  const initialSpeed = boundedNumber(
    options.initialSpeed ?? options.speed ?? 0,
    0,
    maxSpeed,
    "Initial speed",
  );
  const initialSample = courseSample(course, initialPosition);
  const state = {
    position: {
      x: initialPosition.x,
      y: initialPosition.y,
      elevation:
        options.position?.elevation === undefined
          ? initialSample.elevation
          : initialPosition.elevation,
    },
    heading: initialHeading,
    speed: initialSpeed,
    grade: initialSample.grade,
    onTrack: initialSample.onTrack,
    time: 0,
    throttle: 0,
    brake: 0,
    steering: 0,
  };

  function step(action = {}, dt = fixedDt) {
    const timestep = positiveNumber(dt, "Timestep");
    if (Math.abs(timestep - fixedDt) > DT_EPSILON) {
      throw new RangeError("Vehicle step must use its fixed timestep.");
    }

    const controls = readAction(action);
    const sampleBefore = courseSample(course, state.position);
    const headingForGrade =
      typeof sampleBefore.heading === "number" &&
      Number.isFinite(sampleBefore.heading)
        ? sampleBefore.heading
        : state.heading;
    const headingDelta = state.heading - headingForGrade;
    const gradeAcceleration =
      -gravity *
      sampleBefore.grade *
      Math.cos(headingDelta) /
      Math.sqrt(1 + sampleBefore.grade ** 2);
    const acceleration =
      maxAcceleration * controls.throttle -
      brakeDeceleration * controls.brake +
      gradeAcceleration;
    const previousSpeed = state.speed;
    const nextSpeed = clamp(
      previousSpeed + acceleration * timestep,
      0,
      maxSpeed,
    );
    const nextHeading =
      state.heading +
      controls.steering *
        maxSteeringRate *
        (previousSpeed / maxSpeed) *
        timestep;
    const travelDistance = ((previousSpeed + nextSpeed) / 2) * timestep;
    const nextPosition = {
      x: state.position.x + Math.cos(nextHeading) * travelDistance,
      y: state.position.y + Math.sin(nextHeading) * travelDistance,
      elevation: state.position.elevation,
    };
    const sampleAfter = courseSample(course, nextPosition);

    nextPosition.elevation = sampleAfter.elevation;
    state.position = nextPosition;
    state.heading = nextHeading;
    state.speed = nextSpeed;
    state.grade = sampleAfter.grade;
    state.onTrack = sampleAfter.onTrack;
    state.time += fixedDt;
    state.throttle = controls.throttle;
    state.brake = controls.brake;
    state.steering = controls.steering;

    return cloneSnapshot(state);
  }

  function snapshot() {
    return cloneSnapshot(state);
  }

  return Object.freeze({
    fixedDt,
    step,
    snapshot,
  });
}
