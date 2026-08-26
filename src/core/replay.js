function clone(value) {
  return structuredClone(value);
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function lerpAngle(start, end, amount) {
  const turn = Math.atan2(Math.sin(end - start), Math.cos(end - start));
  return start + turn * amount;
}

function interpolateArray(start = [], end = [], amount) {
  return start.map((value, index) => lerp(value, end[index] ?? value, amount));
}

function interpolateObject(start = {}, end = {}, amount) {
  return Object.fromEntries(
    Object.keys(start).map((key) => {
      const startValue = start[key];
      const endValue = end[key];
      return [
        key,
        typeof startValue === "number" && typeof endValue === "number"
          ? lerp(startValue, endValue, amount)
          : startValue,
      ];
    }),
  );
}

export function sampleReplay(replay, rawCursor, { loop = true } = {}) {
  if (!Array.isArray(replay) || replay.length === 0) return null;
  if (replay.length === 1) {
    return rawCursor > 0 && !loop ? null : clone(replay[0]);
  }

  const cursor = Number(rawCursor);
  if (!Number.isFinite(cursor) || cursor < 0) {
    throw new RangeError("Replay cursor must be a non-negative finite number.");
  }

  const duration = replay.length - 1;
  if (!loop && cursor > duration) return null;
  const playbackCursor = loop ? cursor % duration : Math.min(cursor, duration);
  const firstIndex = Math.floor(playbackCursor);
  const secondIndex = Math.min(firstIndex + 1, replay.length - 1);
  const amount = playbackCursor - firstIndex;
  const first = replay[firstIndex];
  const second = replay[secondIndex];

  if (amount === 0 || firstIndex === secondIndex) return clone(first);

  return {
    ...clone(first),
    position: interpolateObject(first.position, second.position, amount),
    heading: lerpAngle(first.heading, second.heading, amount),
    speed: lerp(first.speed, second.speed, amount),
    progress: lerp(first.progress, second.progress, amount),
    score: lerp(first.score, second.score, amount),
    sensors: interpolateArray(first.sensors, second.sensors, amount),
    action: interpolateObject(first.action, second.action, amount),
    onTrack: first.onTrack && second.onTrack,
  };
}

export function createReplayHistory({ limit = 50 } = {}) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("Replay history limit must be a positive integer.");
  }

  let entries = [];
  let selectedIndex = -1;
  let followingLatest = true;

  function add(entry) {
    if (!entry || !Number.isInteger(entry.generation) || entry.generation < 1) {
      throw new TypeError("Replay history entries need a positive generation.");
    }
    const selectedGeneration = entries[selectedIndex]?.generation ?? null;
    const next = entry;
    const existingIndex = entries.findIndex(
      (candidate) => candidate.generation === next.generation,
    );
    if (existingIndex >= 0) entries[existingIndex] = next;
    else entries.push(next);
    entries.sort((left, right) => left.generation - right.generation);
    if (entries.length > limit) entries = entries.slice(-limit);

    if (followingLatest) {
      selectedIndex = entries.length - 1;
    } else {
      selectedIndex = Math.max(
        0,
        entries.findIndex(
          (candidate) => candidate.generation === selectedGeneration,
        ),
      );
    }
    return current();
  }

  function current() {
    return selectedIndex >= 0 ? entries[selectedIndex] : null;
  }

  function previous() {
    if (entries.length === 0) return null;
    followingLatest = false;
    selectedIndex = Math.max(0, selectedIndex - 1);
    return current();
  }

  function next() {
    if (entries.length === 0) return null;
    selectedIndex = Math.min(entries.length - 1, selectedIndex + 1);
    followingLatest = false;
    return current();
  }

  function followLatest() {
    followingLatest = true;
    selectedIndex = entries.length - 1;
    return current();
  }

  function selectGeneration(generation) {
    const index = entries.findIndex((entry) => entry.generation === generation);
    if (index < 0) {
      throw new RangeError(`Replay generation ${generation} is not available.`);
    }
    followingLatest = false;
    selectedIndex = index;
    return current();
  }

  function clear() {
    entries = [];
    selectedIndex = -1;
    followingLatest = true;
  }

  return Object.freeze({
    add,
    current,
    previous,
    next,
    followLatest,
    selectGeneration,
    clear,
    list() {
      return [...entries];
    },
    get followingLatest() {
      return followingLatest;
    },
  });
}
