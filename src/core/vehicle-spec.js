export const VEHICLE_SPEC = Object.freeze({
  width: 18,
  length: 32,
});

export function footprintPoints({
  position,
  heading,
  width = VEHICLE_SPEC.width,
  length = VEHICLE_SPEC.length,
}) {
  const halfWidth = Number(width) / 2;
  const halfLength = Number(length) / 2;
  if (
    !position ||
    ![position.x, position.y, heading, halfWidth, halfLength].every(Number.isFinite) ||
    halfWidth <= 0 ||
    halfLength <= 0
  ) {
    throw new TypeError("Vehicle footprint needs finite positive dimensions.");
  }

  const forward = { x: Math.cos(heading), y: Math.sin(heading) };
  const right = { x: -forward.y, y: forward.x };
  const point = (forwardOffset, rightOffset) => ({
    x:
      position.x +
      forward.x * forwardOffset +
      right.x * rightOffset,
    y:
      position.y +
      forward.y * forwardOffset +
      right.y * rightOffset,
  });

  return [
    point(halfLength, halfWidth),
    point(halfLength, 0),
    point(halfLength, -halfWidth),
    point(0, halfWidth),
    point(0, -halfWidth),
    point(-halfLength, halfWidth),
    point(-halfLength, 0),
    point(-halfLength, -halfWidth),
  ];
}
