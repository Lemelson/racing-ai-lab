const SUPPORTED_MODES = new Set(["equal-steps"]);

export function createExperimentScheduler(config) {
  const mode = config?.mode ?? "equal-steps";
  const identifiers = [...(config?.entries ?? [])];
  const stepBudget = Number(config?.stepBudget);

  if (!SUPPORTED_MODES.has(mode)) {
    throw new RangeError(`Unsupported scheduling mode: ${mode}`);
  }
  if (identifiers.length === 0) {
    throw new RangeError("An experiment needs at least one entry.");
  }
  if (new Set(identifiers).size !== identifiers.length) {
    throw new RangeError("Experiment entry identifiers must be unique.");
  }
  if (!Number.isInteger(stepBudget) || stepBudget <= 0) {
    throw new RangeError("Step budget must be a positive integer.");
  }

  const entries = identifiers.map((id) => ({ id, steps: 0 }));

  function nextBatch(requestedSteps) {
    const batchSize = Math.max(1, Math.floor(Number(requestedSteps)));
    const allocations = [];

    for (const entry of entries) {
      const allocated = Math.min(batchSize, stepBudget - entry.steps);
      entry.steps += Math.max(0, allocated);
      allocations.push({ id: entry.id, steps: Math.max(0, allocated) });
    }

    return allocations;
  }

  function snapshot() {
    return {
      mode,
      stepBudget,
      done: entries.every((entry) => entry.steps >= stepBudget),
      entries: entries.map((entry) => ({ ...entry })),
    };
  }

  return Object.freeze({
    nextBatch,
    snapshot,
    get done() {
      return entries.every((entry) => entry.steps >= stepBudget);
    },
  });
}
