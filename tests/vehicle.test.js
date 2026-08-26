import test from "node:test";
import assert from "node:assert/strict";

import { createCourse } from "../src/core/course.js";
import { createRaySensors } from "../src/core/sensors.js";
import { createVehicle } from "../src/core/vehicle.js";

const square = createCourse({
  points: [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 120 },
    { x: 0, y: 120 },
  ],
  width: 40,
});

const straight = createCourse({
  points: [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 400, y: 0 },
  ],
  width: 40,
  closed: false,
});

test("seven configurable rays return normalized distances and respect vehicle heading", () => {
  const sensors = createRaySensors({
    angles: [0, 0, 0, 0, 0, 0, 0],
    maxDistance: 500,
    step: 0.5,
  });

  const forward = sensors.observe(straight, {
    position: { x: 80, y: 0 },
    heading: 0,
  });
  const backward = sensors.observe(straight, {
    position: { x: 80, y: 0 },
    heading: Math.PI,
  });

  assert.equal(forward.length, 7);
  assert.ok(forward.every((distance) => distance >= 0 && distance <= 1));
  assert.ok(backward.every((distance) => distance >= 0 && distance <= 1));
  assert.ok(forward[0] > backward[0]);
});

test("ray offsets are rotated with the vehicle and each ray may have its own range", () => {
  const sensors = createRaySensors({
    rays: [
      { angle: 0, maxDistance: 20, offset: { x: 0, y: 0 } },
      { angle: 0, maxDistance: 200, offset: { x: 0, y: 0 } },
      { angle: 0, maxDistance: 200, offset: { x: 4, y: 0 } },
      { angle: 0, maxDistance: 200, offset: { x: 0, y: 0 } },
      { angle: 0, maxDistance: 200, offset: { x: 0, y: 0 } },
      { angle: 0, maxDistance: 200, offset: { x: 0, y: 0 } },
      { angle: 0, maxDistance: 200, offset: { x: 0, y: 0 } },
    ],
    step: 0.5,
  });

  const readings = sensors.observe(square, {
    position: { x: 100, y: 0 },
    heading: Math.PI / 2,
  });

  assert.equal(readings.length, 7);
  assert.ok(readings[0] >= 0 && readings[0] <= 1);
  assert.ok(readings[1] >= 0 && readings[1] <= 1);
  assert.ok(readings[2] < readings[1]);
});

test("sensor configuration and observations reject invalid finite values", () => {
  assert.throws(
    () => createRaySensors({ angles: [0, 0, 0] }),
    /seven/i,
  );
  assert.throws(
    () =>
      createRaySensors({
        angles: [0, 0, 0, 0, 0, 0, Number.NaN],
      }),
    /finite/i,
  );
  assert.throws(
    () => createRaySensors({ maxDistance: 0 }),
    /positive/i,
  );

  const sensors = createRaySensors();
  assert.throws(
    () => sensors.observe(square, { position: { x: Infinity, y: 0 }, heading: 0 }),
    /finite/i,
  );
});

test("vehicle advances with a fixed timestep and bounded controls", () => {
  const vehicle = createVehicle({
    course: straight,
    position: { x: 20, y: 0 },
    fixedDt: 0.1,
    maxAcceleration: 10,
    maxSpeed: 100,
  });

  const next = vehicle.step({ throttle: 1, brake: 0, steering: 0 });

  assert.equal(next.time, 0.1);
  assert.ok(next.speed > 0);
  assert.ok(next.position.x > 20);
  assert.equal(next.position.y, 0);
  assert.equal(next.throttle, 1);
  assert.equal(next.brake, 0);
  assert.equal(next.steering, 0);
  assert.throws(
    () => vehicle.step({ throttle: 0, brake: 0, steering: 0 }, 0.05),
    /fixed timestep/i,
  );
});

test("vehicle cannot switch onto a distant branch at a self-crossing", () => {
  const selfCrossing = createCourse({
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
  const vehicle = createVehicle({
    course: selfCrossing,
    position: { x: 60, y: 0 },
    heading: Math.atan2(-240, -120),
    initialSpeed: 60,
    fixedDt: 0.1,
    maxAcceleration: 0,
    maxSpeed: 100,
  });

  let state = vehicle.snapshot();
  for (let step = 0; step < 8 && state.onTrack; step += 1) {
    state = vehicle.step({ throttle: 0, brake: 0, steering: 0 });
  }

  assert.equal(
    state.onTrack,
    false,
    "the route-local barrier must eliminate a car that turns onto the crossing",
  );
});

test("vehicle braking reduces speed and steering changes heading deterministically", () => {
  const vehicle = createVehicle({
    course: straight,
    position: { x: 20, y: 0 },
    heading: 0,
    initialSpeed: 30,
    fixedDt: 0.1,
    maxSpeed: 100,
    brakeDeceleration: 100,
    maxSteeringRate: 2,
  });

  const next = vehicle.step({ throttle: 0, brake: 1, steering: 1 });

  assert.ok(next.speed < 30);
  assert.ok(next.speed >= 0);
  assert.notEqual(next.heading, 0);
});

test("grade from course elevation changes longitudinal acceleration", () => {
  const flat = createCourse({
    points: [
      { x: 0, y: 0, elevation: 0 },
      { x: 100, y: 0, elevation: 0 },
      { x: 200, y: 0, elevation: 0 },
    ],
    width: 40,
    closed: false,
  });
  const uphill = createCourse({
    points: [
      { x: 0, y: 0, elevation: 0 },
      { x: 100, y: 0, elevation: 100 },
      { x: 200, y: 0, elevation: 100 },
    ],
    width: 40,
    closed: false,
  });

  const createTestVehicle = (course) =>
    createVehicle({
      course,
      position: { x: 10, y: 0 },
      initialSpeed: 20,
      fixedDt: 0.1,
      maxAcceleration: 0,
      gravity: 20,
      maxSpeed: 100,
    });

  const flatState = createTestVehicle(flat).step({
    throttle: 0,
    brake: 0,
    steering: 0,
  });
  const uphillState = createTestVehicle(uphill).step({
    throttle: 0,
    brake: 0,
    steering: 0,
  });

  assert.equal(flatState.grade, 0);
  assert.ok(uphillState.grade > 0);
  assert.ok(uphillState.speed < flatState.speed);
  assert.ok(uphillState.position.elevation > flatState.position.elevation);
});

test("vehicle actions, options, and state remain finite and deterministic", () => {
  assert.throws(
    () => createVehicle({ fixedDt: Number.NaN }),
    /finite/i,
  );
  assert.throws(
    () => createVehicle({ position: { x: Infinity, y: 0 } }),
    /finite/i,
  );

  const options = {
    course: straight,
    position: { x: 20, y: 0 },
    fixedDt: 1 / 60,
    initialSpeed: 5,
  };
  const first = createVehicle(options);
  const second = createVehicle(options);
  const actions = [
    { throttle: 1, brake: 0, steering: 0.2 },
    { throttle: 0.5, brake: 0, steering: -0.4 },
    { throttle: 0, brake: 0.25, steering: 0 },
  ];

  const firstStates = actions.map((action) => first.step(action));
  const secondStates = actions.map((action) => second.step(action));

  assert.deepEqual(firstStates, secondStates);
  assert.throws(
    () => first.step({ throttle: Number.NaN, brake: 0, steering: 0 }),
    /finite/i,
  );
  assert.throws(
    () => second.step({ throttle: 0, brake: 0, steering: 2 }),
    /steering/i,
  );
});
