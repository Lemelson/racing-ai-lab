export function createFitnessTracker(options) {
  const courseLength = Number(options?.courseLength);
  const maxForwardJump = Number(options?.maxForwardJump ?? courseLength * 0.15);
  const progressWeight = Number(options?.progressWeight ?? 1);
  const speedWeight = Number(options?.speedWeight ?? 0.015);
  const collisionPenalty = Number(options?.collisionPenalty ?? 25);

  if (!Number.isFinite(courseLength) || courseLength <= 0) {
    throw new RangeError("Fitness tracker needs a positive course length.");
  }

  let score = 0;
  let lastDistance = 0;
  let furthestDistance = 0;
  let laps = 0;
  let collisions = 0;
  let initialized = false;

  function update(sample) {
    const distanceAlong = Number(sample.distanceAlong);
    const speed = Math.max(0, Number(sample.speed ?? 0));
    const onTrack = sample.onTrack === true;
    let forwardDistance = 0;

    if (!Number.isFinite(distanceAlong) || !Number.isFinite(speed)) {
      throw new TypeError("Fitness samples must contain finite values.");
    }

    if (onTrack && !initialized) {
      const candidate = distanceAlong;
      if (candidate > 0 && candidate <= maxForwardJump) {
        forwardDistance = candidate;
      }
      lastDistance = distanceAlong;
      furthestDistance = distanceAlong;
      initialized = true;
    } else if (onTrack) {
      let candidate = distanceAlong - lastDistance;
      const crossedFinish =
        lastDistance > courseLength * 0.75 &&
        distanceAlong < courseLength * 0.25;
      const crossedFinishBackwards =
        lastDistance < courseLength * 0.25 &&
        distanceAlong > courseLength * 0.75;

      if (crossedFinish) {
        candidate = courseLength - lastDistance + distanceAlong;
      }

      if (candidate > 0 && candidate <= maxForwardJump) {
        if (crossedFinish) {
          laps += 1;
        }
        const absoluteDistance = laps * courseLength + distanceAlong;
        forwardDistance = Math.min(
          candidate,
          Math.max(0, absoluteDistance - furthestDistance),
        );
        furthestDistance = Math.max(furthestDistance, absoluteDistance);
        lastDistance = distanceAlong;
      } else if (candidate <= 0 || crossedFinishBackwards) {
        lastDistance = distanceAlong;
      }
    }

    let deltaScore =
      forwardDistance * progressWeight +
      forwardDistance * speed * speedWeight;

    if (sample.collided === true) {
      collisions += 1;
      deltaScore -= collisionPenalty;
    }

    score += deltaScore;
    return {
      score,
      deltaScore,
      forwardDistance,
      laps,
      collisions,
    };
  }

  return Object.freeze({
    update,
    snapshot() {
      return { score, lastDistance, furthestDistance, laps, collisions };
    },
  });
}
