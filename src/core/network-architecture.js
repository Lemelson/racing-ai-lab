const INPUT_SIZE = 8;
const OUTPUT_SIZE = 3;
const MIN_HIDDEN_LAYERS = 1;
const MAX_HIDDEN_LAYERS = 3;
const MIN_NEURONS = 4;
const MAX_NEURONS = 64;

function countParameters(hiddenLayers) {
  const layers = [INPUT_SIZE, ...hiddenLayers, OUTPUT_SIZE];
  let total = 0;
  for (let index = 0; index < layers.length - 1; index += 1) {
    total += layers[index] * layers[index + 1] + layers[index + 1];
  }
  return total;
}

function preset(id, label, hiddenLayers, description, tradeoffs) {
  const frozenLayers = Object.freeze([...hiddenLayers]);
  return Object.freeze({
    id,
    label,
    hiddenLayers: frozenLayers,
    description,
    tradeoffs,
    topology: [INPUT_SIZE, ...frozenLayers, OUTPUT_SIZE].join("→"),
    parameterCount: countParameters(frozenLayers),
  });
}

export const NETWORK_ARCHITECTURE_PRESETS = Object.freeze({
  compact: preset(
    "compact",
    "Компактная",
    [8],
    "Один скрытый слой из 8 нейронов.",
    "Считает быстрее, но хуже описывает сложное поведение.",
  ),
  baseline: preset(
    "baseline",
    "Базовая",
    [10],
    "Один скрытый слой из 10 нейронов.",
    "Сбалансированный стартовый вариант для большинства запусков.",
  ),
  deep: preset(
    "deep",
    "Глубокая",
    [16, 8],
    "Два скрытых слоя из 16 и 8 нейронов.",
    "Выразительнее на сложных трассах, но содержит больше весов.",
  ),
  wide: preset(
    "wide",
    "Широкая",
    [24],
    "Один широкий скрытый слой из 24 нейронов.",
    "Даёт больше ёмкости в одном слое ценой более долгого обучения.",
  ),
});

function hiddenLayersFrom(source) {
  if (typeof source === "string") {
    const selected = NETWORK_ARCHITECTURE_PRESETS[source];
    if (!selected) {
      throw new RangeError(`Unknown network architecture preset: ${source}.`);
    }
    return [...selected.hiddenLayers];
  }
  if (Array.isArray(source)) return [...source];
  if (source && Array.isArray(source.hiddenLayers)) {
    return [...source.hiddenLayers];
  }
  throw new TypeError(
    "Network architecture must be a preset or contain hidden layers.",
  );
}

function validateHiddenLayers(hiddenLayers) {
  if (
    hiddenLayers.length < MIN_HIDDEN_LAYERS ||
    hiddenLayers.length > MAX_HIDDEN_LAYERS
  ) {
    throw new RangeError("Network needs one to three hidden layers.");
  }
  if (
    hiddenLayers.some(
      (neurons) =>
        !Number.isInteger(neurons) ||
        neurons < MIN_NEURONS ||
        neurons > MAX_NEURONS,
    )
  ) {
    throw new RangeError(
      "Each hidden layer needs an integer from 4 to 64 neurons.",
    );
  }
}

function matchingPresetId(hiddenLayers) {
  for (const [id, candidate] of Object.entries(
    NETWORK_ARCHITECTURE_PRESETS,
  )) {
    if (
      candidate.hiddenLayers.length === hiddenLayers.length &&
      candidate.hiddenLayers.every(
        (neurons, index) => neurons === hiddenLayers[index],
      )
    ) {
      return id;
    }
  }
  return "custom";
}

export function normalizeNetworkArchitecture(source = "baseline") {
  const hiddenLayers = hiddenLayersFrom(source);
  validateHiddenLayers(hiddenLayers);
  const frozenLayers = Object.freeze(hiddenLayers);
  return Object.freeze({
    hiddenLayers: frozenLayers,
    topology: [INPUT_SIZE, ...frozenLayers, OUTPUT_SIZE].join("→"),
    parameterCount: countParameters(frozenLayers),
    presetId: matchingPresetId(frozenLayers),
  });
}

export function validateNetworkArchitecture(source) {
  normalizeNetworkArchitecture(source);
  return true;
}

export function networkArchitectureParameterCount(source) {
  const hiddenLayers = hiddenLayersFrom(source);
  validateHiddenLayers(hiddenLayers);
  return countParameters(hiddenLayers);
}

export function detectNetworkArchitecturePreset(source) {
  const hiddenLayers = hiddenLayersFrom(source);
  validateHiddenLayers(hiddenLayers);
  return matchingPresetId(hiddenLayers);
}

export function addHiddenLayer(source, neurons = 10) {
  const architecture = normalizeNetworkArchitecture(source);
  if (architecture.hiddenLayers.length >= MAX_HIDDEN_LAYERS) {
    throw new RangeError("A network cannot have more than three hidden layers.");
  }
  return normalizeNetworkArchitecture([
    ...architecture.hiddenLayers,
    neurons,
  ]);
}

export function updateHiddenLayer(source, index, neurons) {
  const architecture = normalizeNetworkArchitecture(source);
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= architecture.hiddenLayers.length
  ) {
    throw new RangeError("Hidden layer index is out of range.");
  }
  const hiddenLayers = [...architecture.hiddenLayers];
  hiddenLayers[index] = neurons;
  return normalizeNetworkArchitecture(hiddenLayers);
}

export function removeHiddenLayer(source, index) {
  const architecture = normalizeNetworkArchitecture(source);
  if (architecture.hiddenLayers.length <= MIN_HIDDEN_LAYERS) {
    throw new RangeError("A network must keep at least one hidden layer.");
  }
  const targetIndex =
    index === undefined ? architecture.hiddenLayers.length - 1 : index;
  if (
    !Number.isInteger(targetIndex) ||
    targetIndex < 0 ||
    targetIndex >= architecture.hiddenLayers.length
  ) {
    throw new RangeError("Hidden layer index is out of range.");
  }
  const hiddenLayers = [...architecture.hiddenLayers];
  hiddenLayers.splice(targetIndex, 1);
  return normalizeNetworkArchitecture(hiddenLayers);
}

export function serializeNetworkArchitecture(source) {
  const architecture = normalizeNetworkArchitecture(source);
  return {
    hiddenLayers: [...architecture.hiddenLayers],
    topology: architecture.topology,
    parameterCount: architecture.parameterCount,
    presetId: architecture.presetId,
  };
}
