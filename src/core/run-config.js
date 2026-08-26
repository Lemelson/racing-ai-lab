const TIMESTEP_HZ = 30;

function integerInRange(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new RangeError(
      `${label} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return number;
}

function networkParameterCount(layers) {
  let total = 0;
  for (let index = 0; index < layers.length - 1; index += 1) {
    total += layers[index] * layers[index + 1] + layers[index + 1];
  }
  return total;
}

export function createRunConfig(source = {}) {
  const populationSize = integerInRange(
    source.populationSize,
    6,
    200,
    "Population size",
  );
  const generationLimit = integerInRange(
    source.generationLimit,
    1,
    1000,
    "Generation limit",
  );
  const episodeDurationSeconds = integerInRange(
    source.episodeDurationSeconds,
    2,
    120,
    "Episode duration",
  );
  const trackCount = integerInRange(source.trackCount, 1, 12, "Track count");
  const seed = integerInRange(source.seed ?? 0, 0, 0xffffffff, "Seed");
  const hiddenLayers = [...(source.hiddenLayers ?? [10])];
  if (
    hiddenLayers.length < 1 ||
    hiddenLayers.length > 3 ||
    hiddenLayers.some(
      (size) => !Number.isInteger(size) || size < 4 || size > 64,
    )
  ) {
    throw new RangeError(
      "Hidden layers must contain one to three integer sizes from 4 to 64.",
    );
  }

  const episodeSteps = episodeDurationSeconds * TIMESTEP_HZ;
  const layers = [8, ...hiddenLayers, 3];

  return Object.freeze({
    populationSize,
    generationLimit,
    episodeDurationSeconds,
    episodeSteps,
    timestepHz: TIMESTEP_HZ,
    trackCount,
    hiddenLayers: Object.freeze(hiddenLayers),
    seed,
    topology: layers.join("→"),
    parameterCount: networkParameterCount(layers),
    estimatedSteps:
      populationSize * generationLimit * episodeSteps * trackCount,
  });
}
