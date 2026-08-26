import { createTrainingLaneFromStartPayload } from "./core/training-worker-contract.js";

let lane = null;
let running = false;
let paused = false;
let speed = "normal";
let targetGeneration = 0;
let runToken = 0;
let lastResult = null;

function send(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

function schedule(token) {
  if (!running || paused || token !== runToken) return;
  setTimeout(
    () => trainNext(token),
    speed === "fast" ? 0 : 120,
  );
}

function trainNext(token) {
  if (!running || paused || token !== runToken || !lane) return;
  try {
    const startedAt = performance.now();
    const result = lane.trainGeneration();
    const computeMilliseconds = performance.now() - startedAt;
    const stepsPerSecond =
      computeMilliseconds > 0
        ? Math.round((result.steps * 1000) / computeMilliseconds)
        : 0;
    lastResult = {
      ...result,
      computeMilliseconds,
      stepsPerSecond,
    };
    send("generation", { artifact: lastResult });

    if (result.generation >= targetGeneration) {
      running = false;
      send("complete", { artifact: lastResult });
      return;
    }
    schedule(token);
  } catch (error) {
    running = false;
    send("error", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

self.addEventListener("message", (event) => {
  const message = event.data ?? {};
  if (message.type === "start") {
    try {
      runToken += 1;
      const created = createTrainingLaneFromStartPayload(message);
      lane = created.lane;
      targetGeneration = created.start.targetGeneration;
      speed = created.start.speed;
      running = true;
      paused = false;
      lastResult = null;
      send("started", { targetGeneration });
      schedule(runToken);
    } catch (error) {
      lane = null;
      running = false;
      paused = false;
      lastResult = null;
      send("error", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (message.type === "pause") {
    paused = true;
    send("paused");
    return;
  }

  if (message.type === "resume") {
    if (!lane) return;
    paused = false;
    running = true;
    send("resumed");
    schedule(runToken);
    return;
  }

  if (message.type === "continue") {
    if (!lane) return;
    const additionalGenerations = Math.max(
      1,
      Math.floor(Number(message.additionalGenerations) || 1),
    );
    targetGeneration =
      (lastResult?.generation ?? 0) + additionalGenerations;
    paused = false;
    running = true;
    send("resumed", { targetGeneration });
    schedule(runToken);
    return;
  }

  if (message.type === "speed") {
    speed = message.value === "fast" ? "fast" : "normal";
    return;
  }

  if (message.type === "stop") {
    running = false;
    paused = false;
    runToken += 1;
    send("stopped", { artifact: lastResult });
  }
});
