import test from "node:test";
import assert from "node:assert/strict";

import {
  agentPresentation,
  buildFitnessSeries,
  compactReplayArtifact,
} from "../src/core/training-analysis.js";

test("followed leader is blue while alternatives move from green to yellow to red", () => {
  assert.deepEqual(agentPresentation({ rank: 1, total: 10, followed: true }), {
    tier: "followed",
    color: "#1769ff",
    label: "Отслеживаемый лидер",
  });
  assert.equal(agentPresentation({ rank: 2, total: 10 }).tier, "strong");
  assert.equal(agentPresentation({ rank: 5, total: 10 }).tier, "medium");
  assert.equal(agentPresentation({ rank: 10, total: 10 }).tier, "weak");
});

test("fitness series uses the selected track and keeps generation navigation data", () => {
  const artifacts = [
    {
      generation: 1,
      bestFitness: 4,
      medianFitness: 2,
      trackViews: [
        { trackKey: "a", bestFitness: 10, medianFitness: 5 },
        { trackKey: "b", bestFitness: 7, medianFitness: 3 },
      ],
    },
    {
      generation: 2,
      bestFitness: 8,
      medianFitness: 3,
      trackViews: [
        { trackKey: "a", bestFitness: 14, medianFitness: 8 },
        { trackKey: "b", bestFitness: 9, medianFitness: 4 },
      ],
    },
  ];

  assert.deepEqual(buildFitnessSeries(artifacts, "b"), [
    { generation: 1, bestFitness: 7, medianFitness: 3 },
    { generation: 2, bestFitness: 9, medianFitness: 4 },
  ]);
  assert.deepEqual(buildFitnessSeries(artifacts), [
    { generation: 1, bestFitness: 4, medianFitness: 2 },
    { generation: 2, bestFitness: 8, medianFitness: 3 },
  ]);
});

test("older replay artifacts keep summaries and only the top requested agents", () => {
  const agents = [1, 2, 3].map((rank) => ({
    trackRank: rank,
    replay: [{ step: rank }],
  }));
  const artifact = {
    generation: 7,
    populationSize: 3,
    rankedAgents: agents,
    populationReplays: agents.map((agent) => agent.replay),
    trackViews: [
      {
        trackKey: "a",
        checkpoint: { genes: [1, 2] },
        rankedAgents: agents,
        populationReplays: agents.map((agent) => agent.replay),
        replay: agents[0].replay,
      },
    ],
  };

  const compact = compactReplayArtifact(artifact, { agentLimit: 2 });

  assert.equal(compact.populationSize, 3);
  assert.equal(compact.rankedAgents.length, 2);
  assert.equal(compact.trackViews[0].rankedAgents.length, 2);
  assert.deepEqual(compact.trackViews[0].checkpoint, { genes: [1, 2] });
  assert.equal(artifact.rankedAgents.length, 3);
});
