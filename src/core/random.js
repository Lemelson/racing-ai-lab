const UINT32_RANGE = 0x1_0000_0000;

function assertSeed(seed) {
  if (typeof seed !== "number" || !Number.isFinite(seed)) {
    throw new TypeError("Random seed must be a finite number.");
  }
  if (!Number.isInteger(seed)) {
    throw new RangeError("Random seed must be an integer.");
  }
  return seed >>> 0;
}

function assertFiniteRange(minimum, maximum) {
  if (
    typeof minimum !== "number" ||
    typeof maximum !== "number" ||
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum)
  ) {
    throw new TypeError("Random range bounds must be finite numbers.");
  }
  if (maximum < minimum) {
    throw new RangeError("Random range maximum must not be below its minimum.");
  }
}

/**
 * Creates a small deterministic PRNG suitable for reproducible experiments.
 * The implementation deliberately has no dependency on Math.random().
 */
export function createSeededRandom(seed) {
  let state = assertSeed(seed);

  const random = () => {
    // Mulberry32 uses only uint32 arithmetic and is stable across Node versions.
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };

  random.next = random;
  random.float = random;
  random.nextInt = (exclusiveMaximum) => {
    if (
      typeof exclusiveMaximum !== "number" ||
      !Number.isFinite(exclusiveMaximum) ||
      !Number.isInteger(exclusiveMaximum) ||
      exclusiveMaximum <= 0
    ) {
      throw new RangeError("Random integer maximum must be a positive integer.");
    }
    return Math.floor(random() * exclusiveMaximum);
  };
  random.range = (minimum, maximum) => {
    assertFiniteRange(minimum, maximum);
    return minimum + random() * (maximum - minimum);
  };
  random.getState = () => state;

  return random;
}
