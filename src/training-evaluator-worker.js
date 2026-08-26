import { createCourse } from "./core/course.js";
import { createTrainingEvaluator } from "./core/training.js";

let evaluator = null;
let trackCount = 0;
let episodeSteps = 0;

function send(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

self.addEventListener("message", (event) => {
  const message = event.data ?? {};
  if (message.type === "init") {
    try {
      const tracks = message.tracks.map((track) => ({
        key: track.key,
        name: track.name,
        course: createCourse(track.definition),
      }));
      evaluator = createTrainingEvaluator({
        tracks,
        config: message.config,
      });
      trackCount = tracks.length;
      episodeSteps = message.config.episodeSteps;
      send("ready");
    } catch (error) {
      send("error", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (message.type !== "evaluate" || !evaluator) return;
  const requestId = message.requestId;
  try {
    let completedEpisodes = 0;
    let completedSteps = 0;
    let bestObservedFitness = 0;
    let bestObservedProgress = 0;
    let lastProgressSentAt = -Infinity;
    const totalEpisodes = message.tasks.length * trackCount;
    const totalStepBudget = totalEpisodes * episodeSteps;
    const evaluations = message.tasks.map((task) => {
      const baseEpisodes = completedEpisodes;
      const baseSteps = completedSteps;
      const evaluation = evaluator.evaluate(task, {
        trackOrder: message.trackOrder,
        onProgress(progress) {
          bestObservedFitness = Math.max(
            bestObservedFitness,
            progress.bestObservedFitness,
          );
          bestObservedProgress = Math.max(
            bestObservedProgress,
            progress.bestObservedProgress,
          );
          const now = performance.now();
          const isBoundary =
            baseSteps + progress.completedSteps === 1 ||
            (progress.episodeComplete &&
              baseEpisodes + progress.completedEpisodes === totalEpisodes);
          if (!isBoundary && now - lastProgressSentAt < 100) return;
          lastProgressSentAt = now;
          send("progress", {
            requestId,
            progress: {
              completedEpisodes:
                baseEpisodes + progress.completedEpisodes,
              totalEpisodes,
              completedSteps: baseSteps + progress.completedSteps,
              totalStepBudget,
              bestObservedFitness,
              bestObservedProgress,
              trackKey: progress.trackKey,
              trackName: progress.trackName,
            },
          });
        },
      });
      completedEpisodes += evaluation.episodes.length;
      completedSteps += evaluation.episodes.reduce(
        (sum, entry) => sum + entry.episode.stepsExecuted,
        0,
      );
      return evaluation;
    });
    send("result", {
      requestId,
      evaluations,
      completedEpisodes,
      completedSteps,
      totalEpisodes,
      totalStepBudget,
      bestObservedFitness,
      bestObservedProgress,
    });
  } catch (error) {
    send("error", {
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
