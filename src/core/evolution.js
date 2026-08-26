import { NETWORK_SHAPE, createNetwork } from "./network.js";
import { createSeededRandom } from "./random.js";

export const EVOLUTION_CONFIG_VERSION = 1;

const DEFAULTS = Object.freeze({
  algorithmId: "evolutionary-driver",
  algorithmVersion: "1.0.0",
  seed: 0,
  populationSize: 250,
  eliteCount: 25,
  mutationRate: 0.1,
  mutationScale: 0.15,
});

function isSequence(value) {
  return Array.isArray(value) || ArrayBuffer.isView(value);
}

function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return value;
}

function positiveInteger(value, label) {
  finiteNumber(value, label);
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer.`);
  }
  return value;
}

function finiteGenes(genes) {
  if (!isSequence(genes)) {
    throw new TypeError("Genome genes must be an array of finite numbers.");
  }
  if (genes.length === 0) {
    throw new RangeError("Genome must contain at least one gene.");
  }
  const values = Array.from(genes);
  if (!values.every((gene) => typeof gene === "number" && Number.isFinite(gene))) {
    throw new TypeError("Genome genes must contain only finite numbers.");
  }
  return values;
}

function optionalFitness(fitness) {
  if (fitness === null || fitness === undefined) {
    return null;
  }
  return finiteNumber(fitness, "Genome fitness");
}

function validatedGenome(genome, label = "Genome") {
  if (!genome || typeof genome !== "object") {
    throw new TypeError(`${label} must be an object.`);
  }
  const genes = finiteGenes(genome.genes ?? genome.parameters);
  const fitness = optionalFitness(genome.fitness);
  return { genes, fitness };
}

function randomFunction(rng, fallbackSeed = 0) {
  const candidate = rng ?? createSeededRandom(fallbackSeed);
  const random = typeof candidate === "function" ? candidate : candidate?.next;
  if (typeof random !== "function") {
    throw new TypeError("Evolution RNG must be a function or expose next().");
  }
  return () => {
    const value = random();
    finiteNumber(value, "Evolution RNG output");
    if (value < 0 || value >= 1) {
      throw new RangeError("Evolution RNG output must be in [0, 1).");
    }
    return value;
  };
}

function cloneGenome(genome, preserveFitness = true) {
  const validated = validatedGenome(genome);
  return Object.freeze({
    genes: Object.freeze([...validated.genes]),
    fitness: preserveFitness ? validated.fitness : null,
  });
}

function rankPopulation(population) {
  return population
    .map((genome, index) => ({ genome: validatedGenome(genome), index }))
    .map((entry) => ({ ...entry, genome: { ...entry.genome } }))
    .sort((left, right) => {
      const fitnessDifference = right.genome.fitness - left.genome.fitness;
      return fitnessDifference || left.index - right.index;
    });
}

function selectRanked(ranked, random) {
  const totalWeight = (ranked.length * (ranked.length + 1)) / 2;
  let target = random() * totalWeight;

  for (let index = 0; index < ranked.length; index += 1) {
    const weight = ranked.length - index;
    target -= weight;
    if (target < 0) {
      return ranked[index].genome;
    }
  }

  return ranked.at(-1).genome;
}

function validateRate(value, label) {
  finiteNumber(value, label);
  if (value < 0 || value > 1) {
    throw new RangeError(`${label} must be between 0 and 1.`);
  }
  return value;
}

export function createGenome(options = {}) {
  const source = isSequence(options) ? { genes: options } : options ?? {};
  let genes = source.genes ?? source.parameters ?? source.network?.genes;

  if (genes === undefined) {
    const network = createNetwork({
      ...(source.config?.network ?? source.network),
      seed: source.seed ?? source.config?.seed ?? 0,
    });
    genes = network.toParameters();
  }

  return Object.freeze({
    genes: Object.freeze(finiteGenes(genes)),
    fitness: optionalFitness(source.fitness),
  });
}

export function mutateGenome(genome, options = {}) {
  const parent = validatedGenome(genome);
  const mutationRate = validateRate(
    options.mutationRate ?? options.rate ?? 0.1,
    "Mutation rate",
  );
  const mutationScale = finiteNumber(
    options.mutationScale ?? options.scale ?? 0.15,
    "Mutation scale",
  );
  if (mutationScale < 0) {
    throw new RangeError("Mutation scale must not be negative.");
  }

  const random = randomFunction(options.rng, options.seed ?? 0);
  const genes = parent.genes.map((gene) => {
    if (random() >= mutationRate) {
      return gene;
    }
    const mutated = gene + (random() * 2 - 1) * mutationScale;
    return finiteNumber(mutated, "Mutated gene");
  });

  return Object.freeze({
    genes: Object.freeze(genes),
    fitness: null,
  });
}

export function crossoverGenomes(parentA, parentB, options = {}) {
  const first = validatedGenome(parentA, "First parent");
  const second = validatedGenome(parentB, "Second parent");
  if (first.genes.length !== second.genes.length) {
    throw new RangeError("Parent genomes must have the same length.");
  }
  const random = randomFunction(options.rng, options.seed ?? 0);
  const genes = first.genes.map((gene, index) =>
    random() < 0.5 ? gene : second.genes[index],
  );

  return Object.freeze({
    genes: Object.freeze(genes),
    fitness: null,
  });
}

export function nextGeneration(population, options = {}) {
  if (!Array.isArray(population) || population.length === 0) {
    throw new RangeError("Population must contain at least one genome.");
  }

  const eliteCount = positiveInteger(
    options.eliteCount ?? Math.max(1, Math.ceil(population.length * 0.1)),
    "Elite count",
  );
  if (eliteCount > population.length) {
    throw new RangeError("Elite count cannot exceed population size.");
  }

  const ranked = rankPopulation(population);
  const geneCount = ranked[0].genome.genes.length;
  if (ranked.some((entry) => entry.genome.genes.length !== geneCount)) {
    throw new RangeError("Population genomes must have the same length.");
  }
  if (ranked.some((entry) => entry.genome.fitness === null)) {
    throw new TypeError("Every genome must have finite fitness before ranking.");
  }

  const random = randomFunction(options.rng, options.seed ?? 0);
  const mutationRate = validateRate(
    options.mutationRate ?? options.rate ?? 0.1,
    "Mutation rate",
  );
  const mutationScale = finiteNumber(
    options.mutationScale ?? options.scale ?? 0.15,
    "Mutation scale",
  );
  if (mutationScale < 0) {
    throw new RangeError("Mutation scale must not be negative.");
  }

  const next = ranked
    .slice(0, eliteCount)
    .map((entry) => cloneGenome(entry.genome, true));

  while (next.length < population.length) {
    const first = selectRanked(ranked, random);
    const second = selectRanked(ranked, random);
    const child = crossoverGenomes(first, second, { rng: random });
    next.push(
      mutateGenome(child, {
        rng: random,
        mutationRate,
        mutationScale,
      }),
    );
  }

  return next;
}

export function createEvolutionConfig(options = {}) {
  const source = options ?? {};
  const algorithmId = source.algorithmId ?? DEFAULTS.algorithmId;
  const algorithmVersion = source.algorithmVersion ?? DEFAULTS.algorithmVersion;
  if (typeof algorithmId !== "string" || algorithmId.trim() === "") {
    throw new TypeError("Algorithm id must be a non-empty string.");
  }
  if (typeof algorithmVersion !== "string" || algorithmVersion.trim() === "") {
    throw new TypeError("Algorithm version must be a non-empty string.");
  }

  const seed = source.seed ?? DEFAULTS.seed;
  finiteNumber(seed, "Evolution seed");
  if (!Number.isInteger(seed) || seed < 0) {
    throw new RangeError("Evolution seed must be a non-negative integer.");
  }
  const populationSize = positiveInteger(
    source.populationSize ?? DEFAULTS.populationSize,
    "Population size",
  );
  const eliteCount = positiveInteger(
    source.eliteCount ?? DEFAULTS.eliteCount,
    "Elite count",
  );
  if (eliteCount > populationSize) {
    throw new RangeError("Elite count cannot exceed population size.");
  }
  const mutationRate = validateRate(
    source.mutationRate ?? DEFAULTS.mutationRate,
    "Mutation rate",
  );
  const mutationScale = finiteNumber(
    source.mutationScale ?? DEFAULTS.mutationScale,
    "Mutation scale",
  );
  if (mutationScale < 0) {
    throw new RangeError("Mutation scale must not be negative.");
  }

  const networkDefinition = source.network ?? {};
  if (
    (networkDefinition.inputSize ?? NETWORK_SHAPE.inputSize) !==
      NETWORK_SHAPE.inputSize ||
    (networkDefinition.outputSize ?? NETWORK_SHAPE.outputSize) !==
      NETWORK_SHAPE.outputSize ||
    (networkDefinition.activation ?? NETWORK_SHAPE.activation) !==
      NETWORK_SHAPE.activation
  ) {
    throw new RangeError("Evolution network must use 8 inputs, 3 outputs, and tanh.");
  }
  const compiledNetwork = createNetwork({ ...networkDefinition, seed });
  const networkManifest = compiledNetwork.toManifest();

  const config = {
    configVersion: EVOLUTION_CONFIG_VERSION,
    algorithmId: algorithmId.trim(),
    algorithmVersion: algorithmVersion.trim(),
    seed,
    populationSize,
    eliteCount,
    mutationRate,
    mutationScale,
    network: Object.freeze({
      inputSize: compiledNetwork.shape.inputSize,
      hiddenLayers: Object.freeze([...compiledNetwork.shape.hiddenLayers]),
      outputSize: compiledNetwork.shape.outputSize,
      activation: compiledNetwork.shape.activation,
      parameterCount: networkManifest.parameterCount,
    }),
    createRandom() {
      return createSeededRandom(seed);
    },
    toManifest() {
      return {
        configVersion: EVOLUTION_CONFIG_VERSION,
        algorithmId: config.algorithmId,
        algorithmVersion: config.algorithmVersion,
        seed: config.seed,
        populationSize: config.populationSize,
        eliteCount: config.eliteCount,
        mutationRate: config.mutationRate,
        mutationScale: config.mutationScale,
        topology: networkManifest.topology,
        activation: compiledNetwork.shape.activation,
        parameterCount: networkManifest.parameterCount,
      };
    },
  };

  return Object.freeze(config);
}
