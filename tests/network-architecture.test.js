import test from "node:test";
import assert from "node:assert/strict";

import {
  NETWORK_ARCHITECTURE_PRESETS,
  addHiddenLayer,
  detectNetworkArchitecturePreset,
  networkArchitectureParameterCount,
  normalizeNetworkArchitecture,
  removeHiddenLayer,
  serializeNetworkArchitecture,
  updateHiddenLayer,
  validateNetworkArchitecture,
} from "../src/core/network-architecture.js";

test("network presets expose the four supported Russian-language choices", () => {
  assert.deepEqual(Object.keys(NETWORK_ARCHITECTURE_PRESETS), [
    "compact",
    "baseline",
    "deep",
    "wide",
  ]);
  assert.deepEqual(NETWORK_ARCHITECTURE_PRESETS.compact.hiddenLayers, [8]);
  assert.deepEqual(NETWORK_ARCHITECTURE_PRESETS.baseline.hiddenLayers, [10]);
  assert.deepEqual(NETWORK_ARCHITECTURE_PRESETS.deep.hiddenLayers, [16, 8]);
  assert.deepEqual(NETWORK_ARCHITECTURE_PRESETS.wide.hiddenLayers, [24]);

  for (const preset of Object.values(NETWORK_ARCHITECTURE_PRESETS)) {
    assert.match(preset.label, /[А-Яа-яЁё]/);
    assert.match(preset.description, /[А-Яа-яЁё]/);
    assert.match(preset.tradeoffs, /[А-Яа-яЁё]/);
  }
});

test("normalization validates one to three hidden layers with 4 to 64 neurons", () => {
  const deep = normalizeNetworkArchitecture("deep");
  assert.deepEqual(deep, {
    hiddenLayers: [16, 8],
    topology: "8→16→8→3",
    parameterCount: 307,
    presetId: "deep",
  });

  const source = [12, 6, 4];
  const custom = normalizeNetworkArchitecture(source);
  source[0] = 64;
  assert.deepEqual(custom.hiddenLayers, [12, 6, 4]);
  assert.equal(custom.parameterCount, 229);
  assert.equal(custom.presetId, "custom");
  assert.equal(validateNetworkArchitecture(custom), true);

  for (const invalid of [
    [],
    [4, 4, 4, 4],
    [3],
    [65],
    [8.5],
    ["10"],
  ]) {
    assert.throws(
      () => normalizeNetworkArchitecture(invalid),
      /hidden layers|neurons/i,
    );
  }
  assert.throws(
    () => normalizeNetworkArchitecture("unknown"),
    /preset/i,
  );
});

test("hidden layers can be added, updated, and removed without mutating input", () => {
  const baseline = normalizeNetworkArchitecture([10]);
  const added = addHiddenLayer(baseline, 12);
  const updated = updateHiddenLayer(added, 0, 16);
  const removed = removeHiddenLayer(updated, 1);

  assert.deepEqual(baseline.hiddenLayers, [10]);
  assert.deepEqual(added.hiddenLayers, [10, 12]);
  assert.deepEqual(updated.hiddenLayers, [16, 12]);
  assert.deepEqual(removed.hiddenLayers, [16]);

  assert.throws(
    () => addHiddenLayer([8, 8, 8], 8),
    /three hidden layers/i,
  );
  assert.throws(
    () => removeHiddenLayer([8], 0),
    /one hidden layer/i,
  );
  assert.throws(
    () => updateHiddenLayer([8], 1, 10),
    /index/i,
  );
});

test("parameter counting includes every weight and bias", () => {
  assert.equal(networkArchitectureParameterCount([8]), 99);
  assert.equal(networkArchitectureParameterCount([10]), 123);
  assert.equal(networkArchitectureParameterCount([16, 8]), 307);
  assert.equal(networkArchitectureParameterCount([24]), 291);
});

test("preset detection and serialization distinguish presets from custom clones", () => {
  const architecture = normalizeNetworkArchitecture([16, 8]);
  assert.equal(detectNetworkArchitecturePreset(architecture), "deep");
  assert.equal(detectNetworkArchitecturePreset([12, 6]), "custom");

  const first = serializeNetworkArchitecture(architecture);
  const second = serializeNetworkArchitecture(architecture);
  assert.deepEqual(first, {
    hiddenLayers: [16, 8],
    topology: "8→16→8→3",
    parameterCount: 307,
    presetId: "deep",
  });
  assert.notEqual(first, second);
  assert.notEqual(first.hiddenLayers, second.hiddenLayers);

  first.hiddenLayers[0] = 64;
  assert.deepEqual(architecture.hiddenLayers, [16, 8]);
  assert.deepEqual(second.hiddenLayers, [16, 8]);
});
