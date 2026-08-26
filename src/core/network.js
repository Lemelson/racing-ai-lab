import { createSeededRandom } from "./random.js";

export const NETWORK_SHAPE = Object.freeze({
  inputSize: 8,
  hiddenSize: 10,
  hiddenLayers: Object.freeze([10]),
  outputSize: 3,
  activation: "tanh",
});

function layerSizes(shape) {
  return [shape.inputSize, ...shape.hiddenLayers, shape.outputSize];
}

function parameterCount(shape) {
  const sizes = layerSizes(shape);
  let count = 0;
  for (let index = 0; index < sizes.length - 1; index += 1) {
    count += sizes[index] * sizes[index + 1] + sizes[index + 1];
  }
  return count;
}

export const NETWORK_PARAMETER_COUNT = parameterCount(NETWORK_SHAPE);

function normalizeShape(options = {}) {
  const inputSize = Number(options.inputSize ?? NETWORK_SHAPE.inputSize);
  const outputSize = Number(options.outputSize ?? NETWORK_SHAPE.outputSize);
  const hiddenLayers = options.hiddenLayers
    ? [...options.hiddenLayers].map(Number)
    : [Number(options.hiddenSize ?? NETWORK_SHAPE.hiddenSize)];
  if (
    !Number.isInteger(inputSize) ||
    !Number.isInteger(outputSize) ||
    inputSize <= 0 ||
    outputSize <= 0 ||
    hiddenLayers.length === 0 ||
    hiddenLayers.some((size) => !Number.isInteger(size) || size <= 0)
  ) {
    throw new RangeError("Network layer sizes must be positive integers.");
  }
  return Object.freeze({
    inputSize,
    hiddenLayers: Object.freeze(hiddenLayers),
    outputSize,
    activation: "tanh",
  });
}

export function networkParameterCount(network) {
  return network?.parameters?.length ?? parameterCount(normalizeShape(network));
}

export function forwardNetwork(network, observation) {
  if (!network?.shape || !Array.isArray(network.parameters)) {
    throw new TypeError("A compiled network is required.");
  }
  if (
    !Array.isArray(observation) ||
    observation.length !== network.shape.inputSize
  ) {
    throw new RangeError(
      `Network observation must contain ${network.shape.inputSize} values.`,
    );
  }
  if (!observation.every(Number.isFinite)) {
    throw new TypeError("Network observation values must be finite.");
  }

  let values = [...observation];
  let offset = 0;
  const sizes = layerSizes(network.shape);
  for (let layer = 0; layer < sizes.length - 1; layer += 1) {
    const inputSize = sizes[layer];
    const outputSize = sizes[layer + 1];
    const biasOffset = offset + inputSize * outputSize;
    const next = [];
    for (let output = 0; output < outputSize; output += 1) {
      let sum = network.parameters[biasOffset + output];
      for (let input = 0; input < inputSize; input += 1) {
        sum +=
          values[input] *
          network.parameters[offset + output * inputSize + input];
      }
      next.push(Math.tanh(sum));
    }
    offset = biasOffset + outputSize;
    values = next;
  }
  return values;
}

export function createNetwork(options = {}) {
  const shape = normalizeShape(options);
  const count = parameterCount(shape);
  let parameters;
  if (options.parameters != null) {
    parameters = Array.from(options.parameters);
    if (parameters.length !== count) {
      throw new RangeError(`Network needs exactly ${count} parameters.`);
    }
    if (!parameters.every(Number.isFinite)) {
      throw new TypeError("Network parameters must be finite.");
    }
  } else {
    const rng = createSeededRandom(options.seed ?? 0);
    parameters = Array.from({ length: count }, () => rng.range(-1, 1));
  }

  const network = {
    shape,
    parameters: Object.freeze(parameters),
    genes: Object.freeze(parameters),
    forward(observation) {
      return forwardNetwork(network, observation);
    },
    forwardActions(observation) {
      const [steering, throttle, brake] = forwardNetwork(network, observation);
      return {
        steering,
        throttle: (throttle + 1) / 2,
        brake: (brake + 1) / 2,
      };
    },
    toParameters() {
      return [...parameters];
    },
    toManifest() {
      return {
        topology: layerSizes(shape).join("->"),
        activation: "tanh",
        parameterCount: count,
      };
    },
  };
  return Object.freeze(network);
}
