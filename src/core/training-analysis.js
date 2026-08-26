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
