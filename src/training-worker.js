import {
  buildTrainingTelemetry,
  compactReplayArtifact,
} from "./core/training-analysis.js";
import {
  chooseTrainingWorkerCount,
  createTrainingTaskQueue,
} from "./core/training-pool.js";
import { createTrainingLaneFromStartPayload } from "./core/training-worker-contract.js";

let lane = null;
let running = false;
let paused = false;
let speed = "normal";
let targetGeneration = 0;
let runToken = 0;
let requestSequence = 0;
let lastResult = null;
let pool = [];

function send(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

function terminatePool() {
  for (const entry of pool) entry.worker.terminate();
  pool = [];
}

function createPoolWorker(start, workerIndex) {
  const worker = new Worker(
    new URL("./training-evaluator-worker.js", import.meta.url),
    { type: "module", name: `racing-evaluator-${workerIndex + 1}` },
  );
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    worker.addEventListener("message", (event) => {
      const message = event.data ?? {};
      if (message.type === "ready") {
        resolve();
        return;
      }
      if (message.type === "progress") {
        pending.get(message.requestId)?.onProgress?.(message.progress);
        return;
      }
      if (message.type === "result") {
        const request = pending.get(message.requestId);
        if (!request) return;
        pending.delete(message.requestId);
        request.resolve(message);
        return;
      }
      if (message.type === "error") {
        const error = new Error(message.message || "Evaluator worker failed.");
        if (message.requestId && pending.has(message.requestId)) {
          const request = pending.get(message.requestId);
          pending.delete(message.requestId);
          request.reject(error);
        } else {
          reject(error);
        }
      }
    });
    worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "Evaluator worker stopped.");
      reject(error);
      for (const request of pending.values()) request.reject(error);
      pending.clear();
    });
  });
  worker.postMessage({
    type: "init",
    tracks: start.tracks,
    config: start.config,
  });
  return {
    worker,
    pending,
    ready,
    evaluate(message, onProgress) {
      return new Promise((resolve, reject) => {
        pending.set(message.requestId, { resolve, reject, onProgress });
        worker.postMessage(message);
      });
    },
  };
}

async function initializePool(start, token) {
  terminatePool();
  const hardwareConcurrency = Math.max(
    1,
    Math.floor(Number(navigator.hardwareConcurrency) || 1),
  );
  const workerCount = chooseTrainingWorkerCount({
    hardwareConcurrency,
    populationSize: start.config.populationSize,
    requested: start.workerCount,
  });
  pool = Array.from({ length: workerCount }, (_, index) =>
    createPoolWorker(start, index),
  );
  await Promise.all(pool.map((entry) => entry.ready));
  if (token !== runToken) {
    terminatePool();
    return null;
  }
  return { workerCount, hardwareConcurrency };
}

function schedule(token) {
  if (!running || paused || token !== runToken) return;
  setTimeout(
    () => void trainNext(token),
    speed === "fast" ? 0 : 120,
  );
}

async function trainNext(token) {
  if (!running || paused || token !== runToken || !lane || pool.length === 0) {
    return;
  }
  try {
    const startedAt = performance.now();
    const plan = lane.createGenerationPlan();
    const taskQueue = createTrainingTaskQueue(plan.tasks);
    const progressByWorker = new Map();
    const evaluations = [];
    let completedEpisodes = 0;
    let completedSteps = 0;
    let bestObservedFitness = 0;
    let bestObservedProgress = 0;
    let lastProgressSentAt = -Infinity;
    function emitProgress(workerIndex, progress = null) {
      if (token !== runToken) return;
      if (progress) progressByWorker.set(workerIndex, progress);
      else progressByWorker.delete(workerIndex);
      const aggregate = [...progressByWorker.values()].reduce(
        (summary, current) => ({
          liveEpisodes: summary.liveEpisodes + current.completedEpisodes,
          liveSteps: summary.liveSteps + current.completedSteps,
          bestObservedFitness: Math.max(
            summary.bestObservedFitness,
            current.bestObservedFitness,
          ),
          bestObservedProgress: Math.max(
            summary.bestObservedProgress,
            current.bestObservedProgress,
          ),
          trackKey: current.trackKey,
          trackName: current.trackName,
        }),
        {
          liveEpisodes: 0,
          liveSteps: 0,
          bestObservedFitness,
          bestObservedProgress,
          trackKey: progress?.trackKey ?? null,
          trackName: progress?.trackName ?? null,
        },
      );
      const now = performance.now();
      const progressSnapshot = {
        generation: plan.generation,
        completedEpisodes: completedEpisodes + aggregate.liveEpisodes,
        totalEpisodes: plan.totalEpisodes,
        completedSteps: completedSteps + aggregate.liveSteps,
        totalStepBudget: plan.totalStepBudget,
        bestObservedFitness: aggregate.bestObservedFitness,
        bestObservedProgress: aggregate.bestObservedProgress,
        trackKey: aggregate.trackKey,
        trackName: aggregate.trackName,
      };
      const isBoundary =
        progressSnapshot.completedSteps === 1 ||
        progressSnapshot.completedEpisodes === plan.totalEpisodes;
      if (!isBoundary && now - lastProgressSentAt < 100) return;
      lastProgressSentAt = now;
      const elapsedMilliseconds = now - startedAt;
      send("progress", {
        telemetry: {
          ...progressSnapshot,
          elapsedMilliseconds,
          workerCount: pool.length,
          hardwareConcurrency:
            Math.max(1, Number(navigator.hardwareConcurrency) || 1),
          ...buildTrainingTelemetry({
            ...progressSnapshot,
            targetGeneration,
            elapsedMilliseconds,
          }),
        },
      });
    }
    await Promise.all(
      pool.map(async (entry, workerIndex) => {
        for (
          let task = taskQueue.take();
          task;
          task = taskQueue.take()
        ) {
          const requestId =
            `${token}:${plan.generation}:${requestSequence += 1}`;
          const result = await entry.evaluate(
            {
              type: "evaluate",
              requestId,
              trackOrder: plan.trackOrder,
              tasks: [task],
            },
            (progress) => emitProgress(workerIndex, progress),
          );
          progressByWorker.delete(workerIndex);
          completedEpisodes += result.completedEpisodes;
          completedSteps += result.completedSteps;
          bestObservedFitness = Math.max(
            bestObservedFitness,
            result.bestObservedFitness,
          );
          bestObservedProgress = Math.max(
            bestObservedProgress,
            result.bestObservedProgress,
          );
          evaluations.push(...result.evaluations);
          emitProgress(workerIndex);
        }
      }),
    );
    if (token !== runToken) return;
    const result = lane.completeGenerationPlan(evaluations);
    const computeMilliseconds = performance.now() - startedAt;
    const stepsPerSecond =
      computeMilliseconds > 0
        ? Math.round((result.steps * 1_000) / computeMilliseconds)
        : 0;
    const compactArtifact = compactReplayArtifact(result, { agentLimit: 10 });
    lastResult = {
      ...compactArtifact,
      computeMilliseconds,
      stepsPerSecond,
      workerCount: pool.length,
      hardwareConcurrency:
        Math.max(1, Number(navigator.hardwareConcurrency) || 1),
    };
    send("generation", { artifact: lastResult });

    if (result.generation >= targetGeneration) {
      running = false;
      send("complete");
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

async function startTraining(message) {
  try {
    runToken += 1;
    const token = runToken;
    const created = createTrainingLaneFromStartPayload(message);
    lane = created.lane;
    targetGeneration = created.start.targetGeneration;
    speed = created.start.speed;
    running = true;
    paused = false;
    lastResult = null;
    send("pool-initializing");
    const poolInfo = await initializePool(created.start, token);
    if (!poolInfo || token !== runToken) return;
    send("started", {
      targetGeneration,
      speed,
      ...poolInfo,
    });
    schedule(token);
  } catch (error) {
    lane = null;
    running = false;
    paused = false;
    lastResult = null;
    terminatePool();
    send("error", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

self.addEventListener("message", (event) => {
  const message = event.data ?? {};
  if (message.type === "start") {
    void startTraining(message);
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
    terminatePool();
    send("stopped");
  }
});
