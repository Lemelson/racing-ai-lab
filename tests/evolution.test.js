import test from "node:test";
import assert from "node:assert/strict";

import { createSeededRandom } from "../src/core/random.js";
import {
  createNetwork,
  forwardNetwork,
  networkParameterCount,
} from "../src/core/network.js";
import {
  createEvolutionConfig,
  createGenome,
  crossoverGenomes,
  mutateGenome,
  nextGeneration,
} from "../src/core/evolution.js";

test("seeded RNG is deterministic and rejects invalid seeds", () => {
  const first = createSeededRandom(0x1234abcd);
  const second = createSeededRandom(0x1234abcd);

  assert.deepEqual(
    Array.from({ length: 5 }, () => first()),
    Array.from({ length: 5 }, () => second()),
  );
  assert.throws(() => createSeededRandom(Number.NaN), /finite/i);
  assert.throws(() => createSeededRandom(Number.POSITIVE_INFINITY), /finite/i);
});

test("network defaults to 8 inputs, 10 tanh hidden units, and 3 tanh outputs", () => {
  const network = createNetwork({ seed: 7 });

  assert.deepEqual(network.shape, {
    inputSize: 8,
    hiddenLayers: [10],
    outputSize: 3,
    activation: "tanh",
  });
  assert.equal(networkParameterCount(network), 123);

  const outputs = forwardNetwork(network, [
    0.1,
    0.2,
    0.3,
    0.4,
    0.5,
    0.6,
    0.7,
    0.25,
  ]);

  assert.equal(outputs.length, 3);
  assert.ok(outputs.every((value) => Number.isFinite(value)));
  assert.ok(outputs.every((value) => value >= -1 && value <= 1));
});

test("network supports multiple configurable hidden layers", () => {
  const network = createNetwork({ seed: 7, hiddenLayers: [16, 8] });

  assert.deepEqual(network.shape, {
    inputSize: 8,
    hiddenLayers: [16, 8],
    outputSize: 3,
    activation: "tanh",
  });
  assert.equal(networkParameterCount(network), 307);
  assert.equal(network.parameters.length, 307);
  assert.equal(network.toManifest().topology, "8->16->8->3");

  const outputs = forwardNetwork(network, [
    0.1,
    0.2,
    0.3,
    0.4,
    0.5,
    0.6,
    0.7,
    0.25,
  ]);

  assert.equal(outputs.length, 3);
  assert.ok(outputs.every((value) => Number.isFinite(value)));
});

test("network rejects non-finite or incorrectly sized observations", () => {
  const network = createNetwork({ seed: 11 });

  assert.throws(
    () => forwardNetwork(network, [0, 0, 0, 0, 0, 0, 0, Number.NaN]),
    /finite/i,
  );
  assert.throws(
    () => forwardNetwork(network, [0, 0, 0]),
    /8/i,
  );
});

test("zero parameters produce zero tanh actions", () => {
  const network = createNetwork({ parameters: new Array(123).fill(0) });

  assert.deepEqual(
    forwardNetwork(network, [0, 0, 0, 0, 0, 0, 0, 0]),
    [0, 0, 0],
  );
});

test("default checkpoints preserve the original weights-then-biases layout", () => {
  const parameters = new Array(123).fill(0);
  parameters[80] = 1;
  parameters[90] = 1;
  const network = createNetwork({ parameters });

  const [firstOutput] = forwardNetwork(
    network,
    [0, 0, 0, 0, 0, 0, 0, 0],
  );

  assert.ok(Math.abs(firstOutput - Math.tanh(Math.tanh(1))) < 1e-12);
});

test("genome mutation is deterministic and rate zero preserves genes", () => {
  const genome = createGenome({ seed: 3 });
  const unchanged = mutateGenome(genome, {
    rng: createSeededRandom(99),
    mutationRate: 0,
    mutationScale: 0.25,
  });
  const mutated = mutateGenome(genome, {
    rng: createSeededRandom(99),
    mutationRate: 1,
    mutationScale: 0.25,
  });
  const repeated = mutateGenome(genome, {
    rng: createSeededRandom(99),
    mutationRate: 1,
    mutationScale: 0.25,
  });

  assert.deepEqual(unchanged.genes, genome.genes);
  assert.notDeepEqual(mutated.genes, genome.genes);
  assert.deepEqual(mutated.genes, repeated.genes);
});

test("crossover combines finite genes without mutating either parent", () => {
  const parentA = createGenome({ genes: new Array(123).fill(-1), fitness: 4 });
  const parentB = createGenome({ genes: new Array(123).fill(1), fitness: 8 });
  const child = crossoverGenomes(parentA, parentB, {
    rng: createSeededRandom(5),
  });

  assert.equal(child.genes.length, 123);
  assert.ok(child.genes.every((gene) => gene === -1 || gene === 1));
  assert.equal(child.fitness, null);
  assert.deepEqual(parentA.genes, new Array(123).fill(-1));
  assert.deepEqual(parentB.genes, new Array(123).fill(1));
});

test("ranked elitist generation keeps the best genomes and fills the population", () => {
  const population = [
    createGenome({ genes: new Array(123).fill(1), fitness: 3 }),
    createGenome({ genes: new Array(123).fill(4), fitness: 10 }),
    createGenome({ genes: new Array(123).fill(2), fitness: 8 }),
    createGenome({ genes: new Array(123).fill(0), fitness: 1 }),
  ];

  const next = nextGeneration(population, {
    eliteCount: 2,
    rng: createSeededRandom(12),
    mutationRate: 0,
  });

  assert.equal(next.length, population.length);
  assert.deepEqual(next.slice(0, 2).map((genome) => genome.fitness), [10, 8]);
  assert.deepEqual(next[0].genes, new Array(123).fill(4));
  assert.deepEqual(next[1].genes, new Array(123).fill(2));
  assert.ok(next.slice(2).every((genome) => genome.fitness === null));
});

test("evolution operators preserve a dynamic genome length", () => {
  const first = createGenome({ genes: new Array(307).fill(-1), fitness: 10 });
  const second = createGenome({ genes: new Array(307).fill(1), fitness: 8 });
  const next = nextGeneration([first, second], {
    eliteCount: 1,
    rng: createSeededRandom(12),
    mutationRate: 0,
  });

  assert.equal(next.length, 2);
  assert.ok(next.every((genome) => genome.genes.length === 307));
  assert.throws(
    () =>
      crossoverGenomes(
        createGenome({ genes: new Array(10).fill(0) }),
        createGenome({ genes: new Array(11).fill(0) }),
      ),
    /same length/i,
  );
});

test("evolution config is serializable and carries a manifest-friendly network contract", () => {
  const config = createEvolutionConfig({
    algorithmId: "chatgpt",
    algorithmVersion: "2.0.0",
    seed: 42,
    populationSize: 32,
    eliteCount: 4,
    mutationRate: 0.15,
    mutationScale: 0.2,
  });
  const manifest = config.toManifest();

  assert.equal(config.network.inputSize, 8);
  assert.deepEqual(config.network.hiddenLayers, [10]);
  assert.equal(config.network.outputSize, 3);
  assert.equal(manifest.algorithmId, "chatgpt");
  assert.equal(manifest.algorithmVersion, "2.0.0");
  assert.equal(manifest.topology, "8->10->3");
  assert.equal(manifest.parameterCount, 123);
  assert.doesNotThrow(() => JSON.stringify(config));
});

test("evolution config carries a configurable deep network contract", () => {
  const config = createEvolutionConfig({
    populationSize: 4,
    eliteCount: 1,
    network: { hiddenLayers: [16, 8] },
  });
  const manifest = config.toManifest();
  const genome = createGenome({ seed: 3, network: config.network });

  assert.deepEqual(config.network.hiddenLayers, [16, 8]);
  assert.equal(config.network.parameterCount, 307);
  assert.equal(manifest.topology, "8->16->8->3");
  assert.equal(manifest.parameterCount, 307);
  assert.equal(genome.genes.length, 307);
});

test("default evolution config uses a reproducible zero seed", () => {
  const config = createEvolutionConfig();

  assert.equal(config.seed, 0);
  assert.deepEqual(config.createRandom()(), createSeededRandom(0)());
});

test("evolution rejects non-finite genes and mutation settings", () => {
  assert.throws(
    () => createGenome({ genes: [Number.NaN, ...new Array(122).fill(0)] }),
    /finite/i,
  );

  const genome = createGenome({ seed: 1, fitness: 0 });
  assert.throws(
    () => mutateGenome(genome, { mutationRate: Number.NaN }),
    /finite/i,
  );
  assert.throws(
    () => nextGeneration([genome], { eliteCount: 0 }),
    /elite/i,
  );
});
