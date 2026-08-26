const AGENT_PRESENTATIONS = Object.freeze({
  followed: Object.freeze({
    tier: "followed",
    color: "#1769ff",
    label: "Отслеживаемый лидер",
  }),
  strong: Object.freeze({
    tier: "strong",
    color: "#16a34a",
    label: "Сильный агент",
  }),
  medium: Object.freeze({
    tier: "medium",
    color: "#d79b00",
    label: "Средний агент",
  }),
  weak: Object.freeze({
    tier: "weak",
    color: "#dc3f3f",
    label: "Слабый агент",
  }),
});

export function agentPresentation({ rank, total, followed = false }) {
  if (!Number.isInteger(rank) || rank < 1) {
    throw new RangeError("Agent rank must be a positive integer.");
  }
  if (!Number.isInteger(total) || total < rank) {
    throw new RangeError("Agent total must include its rank.");
  }
  if (followed) return { ...AGENT_PRESENTATIONS.followed };
  const percentile = total <= 1 ? 0 : (rank - 1) / (total - 1);
  if (percentile <= 1 / 3) return { ...AGENT_PRESENTATIONS.strong };
  if (percentile <= 2 / 3) return { ...AGENT_PRESENTATIONS.medium };
  return { ...AGENT_PRESENTATIONS.weak };
}

export function buildFitnessSeries(artifacts, trackKey = null) {
  if (!Array.isArray(artifacts)) {
    throw new TypeError("Fitness history must be an array.");
  }
  return artifacts
    .map((artifact) => {
      const source = trackKey
        ? artifact.trackViews?.find((track) => track.trackKey === trackKey)
        : artifact;
      if (
        !source ||
        !Number.isInteger(artifact.generation) ||
        !Number.isFinite(source.bestFitness) ||
        !Number.isFinite(source.medianFitness)
      ) {
        return null;
      }
      return {
        generation: artifact.generation,
        bestFitness: source.bestFitness,
        medianFitness: source.medianFitness,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.generation - right.generation);
}

export function buildRewardMarkers(course, { interval = 0.1 } = {}) {
  if (
    !course ||
    !Number.isFinite(course.length) ||
    course.length <= 0 ||
    typeof course.poseAtDistance !== "function"
  ) {
    throw new TypeError("Reward markers need a compiled course.");
  }
  if (!Number.isFinite(interval) || interval <= 0 || interval >= 1) {
    throw new RangeError("Reward marker interval must be between zero and one.");
  }
  const markers = [];
  for (let progress = interval; progress < 1 - 1e-9; progress += interval) {
    const normalizedProgress = Number(progress.toFixed(10));
    const distanceAlong = course.length * normalizedProgress;
    const pose = course.poseAtDistance(distanceAlong);
    markers.push({
      progress: normalizedProgress,
      distanceAlong,
      x: pose.x,
      y: pose.y,
      heading: pose.heading,
      label: `${Math.round(normalizedProgress * 100)}%`,
    });
  }
  return markers;
}

export function buildTrainingTelemetry(source) {
  const generation = Number(source?.generation);
  const targetGeneration = Number(source?.targetGeneration);
  const completedEpisodes = Number(source?.completedEpisodes);
  const totalEpisodes = Number(source?.totalEpisodes);
  const completedSteps = Number(source?.completedSteps);
  const totalStepBudget = Number(source?.totalStepBudget);
  const elapsedMilliseconds = Number(source?.elapsedMilliseconds);
  if (
    !Number.isInteger(generation) ||
    generation < 1 ||
    !Number.isInteger(targetGeneration) ||
    targetGeneration < generation ||
    !Number.isInteger(completedEpisodes) ||
    completedEpisodes < 0 ||
    !Number.isInteger(totalEpisodes) ||
    totalEpisodes < 1 ||
    completedEpisodes > totalEpisodes ||
    !Number.isInteger(completedSteps) ||
    completedSteps < 0 ||
    !Number.isInteger(totalStepBudget) ||
    totalStepBudget < completedSteps ||
    !Number.isFinite(elapsedMilliseconds) ||
    elapsedMilliseconds < 0
  ) {
    throw new RangeError("Training telemetry values are inconsistent.");
  }
  const generationProgress = Math.max(
    completedEpisodes / totalEpisodes,
    completedSteps / totalStepBudget,
  );
  const overallProgress =
    (generation - 1 + generationProgress) / targetGeneration;
  const stepsPerSecond =
    elapsedMilliseconds > 0
      ? Math.round((completedSteps * 1_000) / elapsedMilliseconds)
      : 0;
  const estimatedGenerationMilliseconds =
    generationProgress > 0
      ? elapsedMilliseconds / generationProgress
      : 0;
  const remainingGenerationMilliseconds = Math.max(
    0,
    estimatedGenerationMilliseconds - elapsedMilliseconds,
  );
  const remainingFullGenerations = targetGeneration - generation;
  return {
    generationProgress,
    overallProgress,
    stepsPerSecond,
    estimatedGenerationMilliseconds,
    remainingGenerationMilliseconds,
    estimatedRunRemainingMilliseconds:
      remainingGenerationMilliseconds +
      remainingFullGenerations * estimatedGenerationMilliseconds,
  };
}

export function compactReplayArtifact(
  artifact,
  { agentLimit = 5 } = {},
) {
  if (!artifact || typeof artifact !== "object") {
    throw new TypeError("Replay artifact is required.");
  }
  if (!Number.isInteger(agentLimit) || agentLimit < 1) {
    throw new RangeError("Replay agent limit must be positive.");
  }
  const rankedAgents = (artifact.rankedAgents ?? []).slice(0, agentLimit);
  const trackViews = (artifact.trackViews ?? []).map((view) => {
    const trackAgents = (view.rankedAgents ?? []).slice(0, agentLimit);
    return {
      ...view,
      rankedAgents: trackAgents,
      replay: trackAgents[0]?.replay ?? view.replay,
      populationReplays: trackAgents.map((agent) => agent.replay),
    };
  });
  return {
    ...artifact,
    rankedAgents,
    replay: rankedAgents[0]?.replay ?? artifact.replay,
    populationReplays: rankedAgents.map((agent) => agent.replay),
    trackViews,
  };
}
