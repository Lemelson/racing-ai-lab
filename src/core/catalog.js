const STORAGE_KEY = "racing-ai-lab.catalog.v1";

function clone(value) {
  return structuredClone(value);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function checksum(value) {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function initialState() {
  return { tracks: {}, algorithms: [], runs: [] };
}

export function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

export function createLabCatalog({ storage }) {
  if (!storage?.getItem || !storage?.setItem) {
    throw new TypeError("Catalog storage must implement getItem and setItem.");
  }

  const raw = storage.getItem(STORAGE_KEY);
  const parsed = raw ? JSON.parse(raw) : initialState();
  const state = {
    tracks: parsed.tracks ?? {},
    algorithms: parsed.algorithms ?? [],
    runs: parsed.runs ?? [],
  };

  function persist() {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function saveTrack(definition) {
    if (!definition?.id || !definition?.name) {
      throw new TypeError("Track id and name are required.");
    }
    if (!Array.isArray(definition.points) || definition.points.length < 3) {
      throw new RangeError("Track needs at least three points.");
    }

    const versions = state.tracks[definition.id] ?? [];
    const version = versions.length + 1;
    const canonical = clone({
      ...definition,
      closed: definition.closed !== false,
      points: definition.points.map((point) => ({
        x: Number(point.x),
        y: Number(point.y),
        ...(point.width == null ? {} : { width: Number(point.width) }),
        elevation: Number(point.elevation ?? 0),
      })),
    });
    const reference = {
      id: definition.id,
      version,
      checksum: checksum(canonical),
    };

    state.tracks[definition.id] = [
      ...versions,
      { reference, definition: canonical },
    ];
    persist();
    return clone(reference);
  }

  function getTrack(reference) {
    const versions = state.tracks[reference?.id] ?? [];
    const record = versions.find((candidate) => {
      if (reference.version != null && candidate.reference.version !== reference.version) {
        return false;
      }
      if (
        reference.checksum != null &&
        candidate.reference.checksum !== reference.checksum
      ) {
        return false;
      }
      return true;
    });

    if (!record) {
      throw new RangeError("Track version not found.");
    }
    return clone(record);
  }

  function listTracks() {
    return Object.values(state.tracks)
      .flatMap((versions) => versions)
      .map((record) => clone(record));
  }

  function registerAlgorithm(manifest) {
    if (!manifest?.id || !manifest?.displayName || !manifest?.provider) {
      throw new TypeError("Algorithm id, provider, and display name are required.");
    }
    if (state.algorithms.some((entry) => entry.id === manifest.id)) {
      throw new RangeError(`Algorithm ${manifest.id} already exists.`);
    }

    const record = {
      ...clone(manifest),
      checksum: checksum(manifest),
      status: manifest.status ?? "ready",
    };
    state.algorithms.push(record);
    persist();
    return clone(record);
  }

  function listAlgorithms() {
    return state.algorithms.map((entry) => clone(entry));
  }

  function saveRun(artifact) {
    const name = artifact?.name?.trim();
    if (!name) {
      throw new TypeError("Run name is required.");
    }
    const genes = artifact?.checkpoint?.genes;
    if (
      !Array.isArray(genes) ||
      genes.length === 0 ||
      !genes.every((value) => typeof value === "number" && Number.isFinite(value))
    ) {
      throw new TypeError("Checkpoint weights must be a non-empty finite array.");
    }

    const createdAt = new Date().toISOString();
    const canonical = clone({
      ...artifact,
      name,
      createdAt,
      updatedAt: createdAt,
    });
    const record = {
      ...canonical,
      id:
        artifact.id ??
        `run-${Date.now()}-${checksum({
          name,
          createdAt,
          genes,
        }).slice(0, 8)}`,
    };
    state.runs = [
      ...state.runs.filter((candidate) => candidate.id !== record.id),
      record,
    ];
    persist();
    return clone(record);
  }

  function getRun(id) {
    const record = state.runs.find((candidate) => candidate.id === id);
    if (!record) {
      throw new RangeError("Saved run not found.");
    }
    return clone(record);
  }

  function listRuns() {
    return [...state.runs]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((record) => clone(record));
  }

  function deleteRun(id) {
    const previousLength = state.runs.length;
    state.runs = state.runs.filter((candidate) => candidate.id !== id);
    if (state.runs.length === previousLength) return false;
    persist();
    return true;
  }

  return Object.freeze({
    saveTrack,
    getTrack,
    listTracks,
    registerAlgorithm,
    listAlgorithms,
    saveRun,
    getRun,
    listRuns,
    deleteRun,
  });
}
