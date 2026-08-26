import { createCourse } from "./course.js";
import { createTrainingLane } from "./training.js";

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer.`);
  }
  return value;
}

function normalizeHiddenLayers(value) {
  const hiddenLayers = [...(value ?? [10])];
  if (
    hiddenLayers.length === 0 ||
    hiddenLayers.some((size) => !Number.isInteger(size) || size < 1)
  ) {
    throw new RangeError("Hidden layers must contain positive integers.");
  }
  return hiddenLayers;
}

function normalizeTracks(tracks) {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new RangeError("Training start payload needs at least one track.");
  }
  const normalized = tracks.map((track, index) => {
    const definition = structuredClone(track?.definition);
    createCourse(definition);
    const key = String(track.key ?? `track-${index}`);
    return {
      key,
      name: String(track.name ?? definition.name ?? `Трасса ${index + 1}`),
      definition,
    };
  });
  if (new Set(normalized.map((track) => track.key)).size !== normalized.length) {
    throw new RangeError("Training track keys must be unique.");
  }
  return normalized;
}

export function validateTrainingStartPayload(payload) {
  if (!payload || typeof payload !== "object" || payload.type !== "start") {
    throw new TypeError("Training start payload must have type start.");
  }
  const config = structuredClone(payload.config);
  if (!config || typeof config !== "object") {
    throw new TypeError("Training start payload needs a config.");
  }
  config.hiddenLayers = normalizeHiddenLayers(config.hiddenLayers);
  const speed = payload.speed;
  if (speed !== "normal" && speed !== "fast") {
    throw new RangeError("Training speed must be normal or fast.");
  }
  return {
    type: "start",
    tracks: normalizeTracks(payload.tracks),
    config,
    targetGeneration: positiveInteger(
      payload.targetGeneration,
      "Target generation",
    ),
    speed,
  };
}

export function createTrainingStartPayload(options) {
  return validateTrainingStartPayload({
    ...options,
    type: "start",
  });
}

export function createTrainingLaneFromStartPayload(payload) {
  const start = validateTrainingStartPayload(payload);
  const tracks = start.tracks.map((track) => ({
    key: track.key,
    name: track.name,
    course: createCourse(track.definition),
  }));
  return {
    start,
    lane: createTrainingLane({
      tracks,
      config: start.config,
    }),
  };
}
