import { createEvolutionConfig, createGenome, nextGeneration } from "./evolution.js";
import { createFitnessTracker } from "./fitness.js";
import { createNetwork } from "./network.js";
import { createSeededRandom } from "./random.js";
import { createRaySensors } from "./sensors.js";
import { createVehicle } from "./vehicle.js";
import { VEHICLE_SPEC } from "./vehicle-spec.js";

function positiveInteger(value, label, minimum = 1) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new RangeError(`${label} must be an integer of at least ${minimum}.`);
  }
  return value;
}

function createInitialPopulation(size, rng, network, initialGenome = null) {
  const population = Array.from({ length: size }, () =>
    createGenome({
      seed: rng.nextInt(0x7fffffff) + 1,
      network,
    }),
  );
  if (initialGenome) {
    population[0] = createGenome({
      genes: initialGenome.genes ?? initialGenome,
    });
    if (population[0].genes.length !== population[1].genes.length) {
      throw new RangeError("Initial checkpoint does not match the selected network.");
    }
  }
  return population;
}

function normalizedAction(network, observation) {
  const action = network.forwardActions(observation);
  return {
    steering: action.steering,
    throttle: action.throttle,
    brake: Math.max(0, Math.min(1, (action.brake - 0.55) / 0.45)),
  };
}

export function evaluateGenome({
  course,
  genome,
  episodeSteps,
  sensors,
  hiddenLayers,
  onStep,
}) {
  const start = course.poseAtDistance(Math.min(4, course.length * 0.01));
  const maxSpeed = 150;
  const vehicle = createVehicle({
    course,
    position: {
      x: start.x,
      y: start.y,
      elevation: start.elevation,
    },
    heading: start.heading,
    fixedDt: 1 / 30,
    maxAcceleration: 100,
    brakeDeceleration: 180,
    maxSteeringRate: 4.2,
    maxSpeed,
    gravity: 9.81,
  });
  const tracker = createFitnessTracker({
    courseLength: course.length,
    maxForwardJump: Math.max(30, course.length * 0.08),
    collisionPenalty: 18,
  });
  const network = createNetwork({
    parameters: genome.genes,
    hiddenLayers,
  });
  const replay = [];
  let maxProgress = 0;
  let collided = false;
  let stepsExecuted = 0;

  for (let step = 0; step < episodeSteps; step += 1) {
    const before = vehicle.snapshot();
    const rayDistances = sensors.observe(course, before);
    const observation = [...rayDistances, before.speed / maxSpeed];
    const action = normalizedAction(network, observation);
    const state = vehicle.step(action);
    const routeOptions =
      before.distanceAlong == null
        ? undefined
        : { referenceDistanceAlong: before.distanceAlong };
    const location = course.locate(state.position, routeOptions);
    const onTrack = course.containsFootprint({
      position: state.position,
      heading: state.heading,
      ...VEHICLE_SPEC,
    }, routeOptions);
    const collisionThisStep = !onTrack && !collided;
    collided ||= !onTrack;
    const fitness = tracker.update({
      distanceAlong: location.distanceAlong,
      speed: state.speed,
      onTrack,
      collided: collisionThisStep,
    });

    stepsExecuted += 1;
    if (onTrack) {
      maxProgress = Math.max(maxProgress, location.progress);
    }
    replay.push({
      step,
      position: { ...state.position },
      heading: state.heading,
      speed: state.speed,
      onTrack,
      progress: location.progress,
      sensors: [...rayDistances],
      action,
      score: fitness.score,
      eliminated: !onTrack,
    });
    if (
      onStep &&
      (stepsExecuted === 1 ||
        stepsExecuted % 30 === 0 ||
        stepsExecuted === episodeSteps ||
        !onTrack)
    ) {
      onStep({
        stepsExecuted,
        score: fitness.score,
        maxProgress,
      });
    }
    if (!onTrack) break;
  }

  return {
    fitness: tracker.snapshot().score,
    maxProgress,
    replay,
    stepsExecuted,
  };
}

export function aggregateTrackScores(scores, mode = "balanced") {
  if (!Array.isArray(scores) || scores.length === 0) {
    throw new RangeError("Track scores cannot be empty.");
  }
  if (!scores.every(Number.isFinite)) {
    throw new TypeError("Track scores must be finite.");
  }
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const worst = Math.min(...scores);
  if (mode === "mean") return mean;
  if (mode === "balanced") return mean * 0.75 + worst * 0.25;
  if (mode === "worst") return worst;
  throw new RangeError("Unknown aggregate mode.");
}

function normalizeTracks({ course, tracks }) {
  const values = tracks ?? (
    course
      ? [{ key: "single-course", name: "Трасса", course }]
      : []
  );
  if (!Array.isArray(values) || values.length === 0) {
    throw new RangeError("Training lane needs at least one track.");
  }
  const normalized = values.map((track, index) => {
    const compiled = track?.course;
    if (!compiled?.poseAtDistance || !compiled?.locate || !compiled?.raycast) {
      throw new TypeError("Training lane needs compiled courses.");
    }
    const key = String(track.key ?? `track-${index}`);
    return {
      key,
      name: String(track.name ?? key),
      course: compiled,
      sensors: createRaySensors({
        maxDistance: Math.max(100, compiled.width * 2.5),
        step: Math.max(2, compiled.width / 18),
      }),
    };
  });
  if (new Set(normalized.map((track) => track.key)).size !== normalized.length) {
    throw new RangeError("Training track keys must be unique.");
  }
  return normalized;
}

function shuffledTracks(tracks, rng) {
  const result = [...tracks];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = rng.nextInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function createTrainingEvaluator({ course, tracks, config }) {
  const normalizedTracks = normalizeTracks({ course, tracks });
  const episodeSteps = positiveInteger(config?.episodeSteps, "Episode steps");
  const hiddenLayers = [...(config?.hiddenLayers ?? [10])];
  const tracksByKey = new Map(
    normalizedTracks.map((track) => [track.key, track]),
  );

  function evaluate(task, options = {}) {
    const populationIndex = Number(task?.populationIndex);
    const genes = [...(task?.genes ?? [])];
    if (!Number.isInteger(populationIndex) || populationIndex < 0) {
      throw new RangeError("Evaluation task needs a population index.");
    }
    if (genes.length === 0 || !genes.every(Number.isFinite)) {
      throw new TypeError("Evaluation task needs finite genome genes.");
    }
    const trackOrder =
      options.trackOrder ?? normalizedTracks.map((track) => track.key);
    if (
      !Array.isArray(trackOrder) ||
      trackOrder.length !== normalizedTracks.length ||
      new Set(trackOrder).size !== normalizedTracks.length ||
      trackOrder.some((key) => !tracksByKey.has(key))
    ) {
      throw new RangeError("Evaluation track order must include every track.");
    }
    const onProgress =
      typeof options.onProgress === "function" ? options.onProgress : null;
    let completedEpisodes = 0;
    let completedSteps = 0;
    let bestObservedFitness = 0;
    let bestObservedProgress = 0;
    const episodes = trackOrder.map((trackKey) => {
      const track = tracksByKey.get(trackKey);
      const episode = evaluateGenome({
        course: track.course,
        genome: { genes },
        episodeSteps,
        sensors: track.sensors,
        hiddenLayers,
        onStep(update) {
          onProgress?.({
            populationIndex,
            completedEpisodes,
            totalEpisodes: trackOrder.length,
            completedSteps: completedSteps + update.stepsExecuted,
            totalStepBudget: trackOrder.length * episodeSteps,
            bestObservedFitness: Math.max(
              bestObservedFitness,
              (update.score / track.course.length) * 100,
            ),
            bestObservedProgress: Math.max(
              bestObservedProgress,
              update.maxProgress,
            ),
            trackKey: track.key,
            trackName: track.name,
            episodeComplete: false,
          });
        },
      });
      completedEpisodes += 1;
      completedSteps += episode.stepsExecuted;
      bestObservedFitness = Math.max(
        bestObservedFitness,
        (episode.fitness / track.course.length) * 100,
      );
      bestObservedProgress = Math.max(
        bestObservedProgress,
        episode.maxProgress,
      );
      onProgress?.({
        populationIndex,
        completedEpisodes,
        totalEpisodes: trackOrder.length,
        completedSteps,
        totalStepBudget: trackOrder.length * episodeSteps,
        bestObservedFitness,
        bestObservedProgress,
        trackKey: track.key,
        trackName: track.name,
        episodeComplete: true,
      });
      return {
        trackKey: track.key,
        episode,
      };
    });
    return {
      populationIndex,
      episodes,
    };
  }

  return Object.freeze({
    evaluate,
  });
}

export function createTrainingLane({ course, tracks, config }) {
  const normalizedTracks = normalizeTracks({ course, tracks });

  const populationSize = positiveInteger(
    config?.populationSize,
    "Population size",
    2,
  );
  const episodeSteps = positiveInteger(config?.episodeSteps, "Episode steps");
  const eliteCount = positiveInteger(config?.eliteCount ?? 2, "Elite count");
  if (eliteCount >= populationSize) {
    throw new RangeError("Elite count must be smaller than population size.");
  }

  const evolution = createEvolutionConfig({
    algorithmId: config.id,
    algorithmVersion: config.version ?? "1.0.0",
    seed: config.seed,
    populationSize,
    eliteCount,
    mutationRate: config.mutationRate,
    mutationScale: config.mutationScale,
    network: {
      hiddenLayers: config.hiddenLayers ?? [10],
    },
  });
  const rng = createSeededRandom(config.seed);
  const orderRng = createSeededRandom(
    ((config.trackOrderSeed ?? config.seed) ^ 0x9e3779b9) >>> 0,
  );
  const aggregateMode = config.aggregateMode ?? "balanced";
  aggregateTrackScores([0], aggregateMode);

  let population = createInitialPopulation(
    populationSize,
    rng,
    evolution.network,
    config.initialGenome,
  );
  let generation = 0;
  let totalSteps = 0;
  let lastResult = null;
  let pendingPlan = null;
  const evaluator = createTrainingEvaluator({
    tracks: normalizedTracks,
    config: {
      episodeSteps,
      hiddenLayers: evolution.network.hiddenLayers,
    },
  });

  function createGenerationPlan() {
    if (pendingPlan) {
      throw new Error("The current generation plan has not been completed.");
    }
    const orderedTracks = shuffledTracks(normalizedTracks, orderRng);
    const plan = {
      generation: generation + 1,
      trackOrder: orderedTracks.map((track) => track.key),
      totalEpisodes: populationSize * orderedTracks.length,
      totalStepBudget: populationSize * orderedTracks.length * episodeSteps,
      tasks: population.map((genome, populationIndex) => ({
        populationIndex,
        genes: [...genome.genes],
      })),
    };
    pendingPlan = {
      ...plan,
      orderedTracks,
    };
    return structuredClone(plan);
  }

  function completeGenerationPlan(evaluations) {
    if (!pendingPlan) {
      throw new Error("Create a generation plan before completing it.");
    }
    if (!Array.isArray(evaluations) || evaluations.length !== populationSize) {
      throw new RangeError("Generation evaluations must cover the population.");
    }
    const byPopulationIndex = new Map();
    for (const evaluation of evaluations) {
      if (
        !Number.isInteger(evaluation?.populationIndex) ||
        evaluation.populationIndex < 0 ||
        evaluation.populationIndex >= populationSize ||
        byPopulationIndex.has(evaluation.populationIndex)
      ) {
        throw new RangeError("Generation evaluations need unique population indices.");
      }
      byPopulationIndex.set(evaluation.populationIndex, evaluation);
    }
    const orderedTracks = pendingPlan.orderedTracks;
    const completedSteps = evaluations.reduce(
      (sum, evaluation) =>
        sum +
        evaluation.episodes.reduce(
          (episodeSum, entry) => episodeSum + entry.episode.stepsExecuted,
          0,
        ),
      0,
    );
    const evaluated = population.map((genome, populationIndex) => {
      const evaluation = byPopulationIndex.get(populationIndex);
      if (!evaluation || evaluation.episodes.length !== orderedTracks.length) {
        throw new RangeError("Each genome must be evaluated on every track.");
      }
      const episodes = orderedTracks.map((track) => {
        const result = evaluation.episodes.find(
          (entry) => entry.trackKey === track.key,
        );
        if (!result?.episode) {
          throw new RangeError("Evaluation result is missing a track.");
        }
        return {
          track,
          episode: result.episode,
        };
      });
      const normalizedScores = episodes.map(
        ({ track, episode }) =>
          (episode.fitness / track.course.length) * 100,
      );
      const aggregateFitness = aggregateTrackScores(
        normalizedScores,
        aggregateMode,
      );
      return {
        populationIndex,
        genome: createGenome({
          genes: genome.genes,
          fitness: aggregateFitness,
        }),
        aggregateFitness,
        episodes,
      };
    });
    pendingPlan = null;
    evaluated.sort(
      (left, right) =>
        right.aggregateFitness - left.aggregateFitness ||
        left.populationIndex - right.populationIndex,
    );

    const fitnessValues = evaluated
      .map((entry) => entry.aggregateFitness)
      .sort((a, b) => a - b);
    const middle = Math.floor(fitnessValues.length / 2);
    const medianFitness =
      fitnessValues.length % 2 === 0
        ? (fitnessValues[middle - 1] + fitnessValues[middle]) / 2
        : fitnessValues[middle];
    const best = evaluated[0];
    const agentTrackResults = (entry) =>
      entry.episodes.map(({ track, episode }) => ({
        trackKey: track.key,
        trackName: track.name,
        rawFitness: episode.fitness,
        normalizedScore: (episode.fitness / track.course.length) * 100,
        maxProgress: episode.maxProgress,
        stepsExecuted: episode.stepsExecuted,
      }));
    const bestTrackResults = best.episodes.map(({ track, episode }) => ({
      trackKey: track.key,
      trackName: track.name,
      rawFitness: episode.fitness,
      normalizedScore: (episode.fitness / track.course.length) * 100,
      maxProgress: episode.maxProgress,
      stepsExecuted: episode.stepsExecuted,
    }));
    const globalRankByPopulationIndex = new Map(
      evaluated.map((entry, index) => [entry.populationIndex, index + 1]),
    );
    const manifest = evolution.toManifest();
    const trackViews = normalizedTracks.map((track) => {
      const entries = evaluated
        .map((entry) => {
          const episode = entry.episodes.find(
            (candidate) => candidate.track.key === track.key,
          ).episode;
          return {
            populationIndex: entry.populationIndex,
            globalRank: globalRankByPopulationIndex.get(entry.populationIndex),
            genome: entry.genome,
            fitness: (episode.fitness / track.course.length) * 100,
            rawFitness: episode.fitness,
            maxProgress: episode.maxProgress,
            stepsExecuted: episode.stepsExecuted,
            crashed: episode.replay.at(-1)?.onTrack === false,
            replay: episode.replay,
          };
        })
        .sort(
          (left, right) =>
            right.fitness - left.fitness ||
            left.populationIndex - right.populationIndex,
        );
      const trackFitnessValues = entries
        .map((entry) => entry.fitness)
        .sort((left, right) => left - right);
      const trackMiddle = Math.floor(trackFitnessValues.length / 2);
      const trackMedianFitness =
        trackFitnessValues.length % 2 === 0
          ? (trackFitnessValues[trackMiddle - 1] +
              trackFitnessValues[trackMiddle]) /
            2
          : trackFitnessValues[trackMiddle];
      const ranked = entries.map((entry, index) => ({
        trackRank: index + 1,
        globalRank: entry.globalRank,
        populationIndex: entry.populationIndex,
        fitness: entry.fitness,
        rawFitness: entry.rawFitness,
        maxProgress: entry.maxProgress,
        stepsExecuted: entry.stepsExecuted,
        crashed: entry.crashed,
        replay: entry.replay,
      }));
      const champion = entries[0];
      return {
        trackKey: track.key,
        trackName: track.name,
        bestFitness: champion.fitness,
        medianFitness: trackMedianFitness,
        bestProgress: champion.maxProgress,
        championPopulationIndex: champion.populationIndex,
        checkpoint: {
          generation: generation + 1,
          genes: [...champion.genome.genes],
          topology: manifest.topology,
          parameterCount: manifest.parameterCount,
        },
        rankedAgents: ranked,
        replay: ranked[0].replay,
        populationReplays: ranked.map((agent) => agent.replay),
      };
    });
    const primaryTrack = normalizedTracks[0];
    const rankedAgents = evaluated.map((entry, index) => {
      const trackResults = agentTrackResults(entry);
      const primaryEpisode = entry.episodes.find(
        (episodeEntry) => episodeEntry.track.key === primaryTrack.key,
      ).episode;
      const progressValuesForAgent = trackResults.map(
        (result) => result.maxProgress,
      );
      return {
        rank: index + 1,
        populationIndex: entry.populationIndex,
        fitness: entry.aggregateFitness,
        meanProgress:
          progressValuesForAgent.reduce((sum, value) => sum + value, 0) /
          progressValuesForAgent.length,
        worstProgress: Math.min(...progressValuesForAgent),
        crashed: primaryEpisode.replay.at(-1)?.onTrack === false,
        replay: primaryEpisode.replay,
        trackResults,
      };
    });

    population = nextGeneration(
      evaluated.map((entry) => entry.genome),
      {
        eliteCount: evolution.eliteCount,
        mutationRate: evolution.mutationRate,
        mutationScale: evolution.mutationScale,
        rng,
      },
    );
    generation += 1;
    const steps = completedSteps;
    totalSteps += steps;
    const progressValues = bestTrackResults.map((result) => result.maxProgress);
    lastResult = {
      generation,
      steps,
      totalSteps,
      populationSize,
      trackCount: normalizedTracks.length,
      aggregateMode,
      trackOrder: orderedTracks.map((track) => track.key),
      bestFitness: best.aggregateFitness,
      medianFitness,
      bestProgress:
        progressValues.reduce((sum, value) => sum + value, 0) /
        progressValues.length,
      bestMeanProgress:
        progressValues.reduce((sum, value) => sum + value, 0) /
        progressValues.length,
      bestWorstProgress: Math.min(...progressValues),
      bestTrackResults,
      bestGenome: {
        genes: [...best.genome.genes],
        fitness: best.aggregateFitness,
      },
      checkpoint: {
        generation,
        genes: [...best.genome.genes],
        topology: manifest.topology,
        parameterCount: manifest.parameterCount,
      },
      rankedAgents,
      replay: rankedAgents[0].replay,
      populationReplays: rankedAgents.map((agent) => agent.replay),
      replayTrackKey: primaryTrack.key,
      trackViews,
      replaysByTrack: Object.fromEntries(
        trackViews.map((trackView) => [
          trackView.trackKey,
          {
            replay: trackView.replay,
            populationReplays: trackView.populationReplays,
          },
        ]),
      ),
    };
    const { replaysByTrack, ...result } = lastResult;
    return structuredClone(result);
  }

  function trainGeneration(options = {}) {
    const onProgress =
      typeof options.onProgress === "function" ? options.onProgress : null;
    const plan = createGenerationPlan();
    let completedEpisodes = 0;
    let completedSteps = 0;
    let bestObservedFitness = 0;
    let bestObservedProgress = 0;
    const evaluations = plan.tasks.map((task) => {
      const baseEpisodes = completedEpisodes;
      const baseSteps = completedSteps;
      const evaluation = evaluator.evaluate(task, {
        trackOrder: plan.trackOrder,
        onProgress(update) {
          bestObservedFitness = Math.max(
            bestObservedFitness,
            update.bestObservedFitness,
          );
          bestObservedProgress = Math.max(
            bestObservedProgress,
            update.bestObservedProgress,
          );
          onProgress?.({
            ...update,
            generation: plan.generation,
            completedEpisodes: baseEpisodes + update.completedEpisodes,
            totalEpisodes: plan.totalEpisodes,
            completedSteps: baseSteps + update.completedSteps,
            totalStepBudget: plan.totalStepBudget,
            bestObservedFitness,
            bestObservedProgress,
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
    return completeGenerationPlan(evaluations);
  }

  function snapshot() {
    const snapshot = {
      id: config.id,
      displayName: config.displayName,
      color: config.color,
      generation,
      totalSteps,
      trackCount: normalizedTracks.length,
      aggregateMode,
      trackOrder: lastResult?.trackOrder ?? normalizedTracks.map((track) => track.key),
      sensorCount: normalizedTracks[0].sensors.count,
      bestFitness: lastResult?.bestFitness ?? null,
      medianFitness: lastResult?.medianFitness ?? null,
      bestProgress: lastResult?.bestProgress ?? 0,
      bestMeanProgress: lastResult?.bestMeanProgress ?? 0,
      bestWorstProgress: lastResult?.bestWorstProgress ?? 0,
      bestTrackResults: lastResult
        ? structuredClone(lastResult.bestTrackResults)
        : [],
      bestGenome: lastResult
        ? structuredClone(lastResult.bestGenome)
        : null,
      checkpoint: lastResult
        ? structuredClone(lastResult.checkpoint)
        : null,
      rankedAgents: lastResult
        ? structuredClone(lastResult.rankedAgents)
        : [],
      manifest: evolution.toManifest(),
    };
    if (normalizedTracks.length === 1) {
      const replay = lastResult?.replaysByTrack[normalizedTracks[0].key];
      snapshot.replay = replay ? structuredClone(replay.replay) : [];
      snapshot.populationReplays = replay
        ? structuredClone(replay.populationReplays)
        : [];
    }
    return snapshot;
  }

  function replaySnapshot(trackKey = normalizedTracks[0].key) {
    const track = normalizedTracks.find((candidate) => candidate.key === trackKey);
    if (!track) throw new RangeError("Unknown track.");
    const replay = lastResult?.replaysByTrack[trackKey];
    return {
      generation,
      trackKey,
      trackName: track.name,
      replay: replay ? structuredClone(replay.replay) : [],
      populationReplays: replay
        ? structuredClone(replay.populationReplays)
        : [],
    };
  }

  return Object.freeze({
    trainGeneration,
    createGenerationPlan,
    completeGenerationPlan,
    snapshot,
    replaySnapshot,
  });
}
