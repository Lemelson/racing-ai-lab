import { createLabCatalog } from "./core/catalog.js";
import { createCourse } from "./core/course.js";
import {
  NETWORK_ARCHITECTURE_PRESETS,
  addHiddenLayer,
  normalizeNetworkArchitecture,
  removeHiddenLayer,
  updateHiddenLayer,
} from "./core/network-architecture.js";
import { TRACK_PRESETS } from "./core/presets.js";
import { createReplayHistory, sampleReplay } from "./core/replay.js";
import { buildRoadSurface } from "./core/road-surface.js";
import { createRunConfig } from "./core/run-config.js";
import {
  agentPresentation,
  buildFitnessSeries,
  buildRewardMarkers,
  compactReplayArtifact,
} from "./core/training-analysis.js";
import {
  addStrokeToFragments,
  eraseRouteFragments,
  finalizeFragments,
  fitRouteInView,
  paintRouteProperty,
  resamplePath,
  smoothPath,
} from "./core/track-editor.js";
import { VEHICLE_SPEC } from "./core/vehicle-spec.js";

const SENSOR_ANGLES = [
  -Math.PI / 2,
  -Math.PI / 3,
  -Math.PI / 6,
  0,
  Math.PI / 6,
  Math.PI / 3,
  Math.PI / 2,
];

const BASELINE = Object.freeze({
  id: "baseline-ga",
  displayName: "Базовый эволюционный алгоритм",
  color: "#0b63f6",
  version: "1.0.0",
  seed: 20260826,
  mutationRate: 0.14,
  mutationScale: 0.2,
});

const byId = (id) => document.getElementById(id);
const elements = {
  appHeader: byId("app-header"),
  main: byId("main"),
  editorHeader: byId("editor-header-controls"),
  editorName: byId("editor-track-name"),
  editorStatus: byId("editor-draft-status"),
  editorUndo: byId("editor-undo"),
  editorRedo: byId("editor-redo"),
  editorZoomOut: byId("editor-zoom-out"),
  editorZoomIn: byId("editor-zoom-in"),
  editorZoomOutput: byId("editor-zoom-output"),
  editorFit: byId("editor-fit"),
  editorFullscreen: byId("editor-fullscreen"),
  editorFinish: byId("editor-finish"),
  createTrack: byId("create-track"),
  exampleGrid: byId("example-grid"),
  savedTrackList: byId("saved-track-list"),
  editorWorkspace: byId("editor-workspace"),
  editorCanvas: byId("editor-canvas"),
  editorPropertyPanel: byId("editor-property-panel"),
  reliefControl: document.querySelector(".relief-control"),
  elevationTool: byId("elevation-tool"),
  editorMessage: byId("editor-message"),
  routeWidth: byId("route-width"),
  routeWidthOutput: byId("route-width-output"),
  widthBrushValue: byId("width-brush-value"),
  widthBrushOutput: byId("width-brush-output"),
  widthBrushRadius: byId("width-brush-radius"),
  widthRadiusOutput: byId("width-radius-output"),
  eraserRadius: byId("eraser-radius"),
  eraserRadiusOutput: byId("eraser-radius-output"),
  elevationValue: byId("elevation-value"),
  elevationValueOutput: byId("elevation-value-output"),
  elevationRadius: byId("elevation-radius"),
  elevationRadiusOutput: byId("elevation-radius-output"),
  simulationCanvas: byId("simulation-canvas"),
  simulationCanvasLabel: byId("simulation-canvas-label"),
  simulationTitle: byId("simulation-title"),
  runningIndicator: byId("running-indicator"),
  simulationForm: byId("simulation-form"),
  runName: byId("run-name"),
  simulationTrackSelect: byId("simulation-track-select"),
  additionalTrackOptions: byId("additional-track-options"),
  aggregateMode: byId("aggregate-mode"),
  populationSize: byId("population-size"),
  generationLimit: byId("generation-limit"),
  episodeDuration: byId("episode-duration"),
  networkPreset: byId("network-preset"),
  networkDiagram: byId("network-diagram"),
  networkLayers: byId("network-layers"),
  networkAddLayer: byId("network-add-layer"),
  networkParameterCount: byId("network-parameter-count"),
  networkExplanation: byId("network-explanation"),
  seed: byId("seed"),
  workerCount: byId("worker-count"),
  workerCountHelp: byId("worker-count-help"),
  budgetSummary: byId("budget-summary"),
  simulationStart: byId("simulation-start"),
  runningControls: byId("running-controls"),
  runningTrackName: byId("running-track-name"),
  simulationPause: byId("simulation-pause"),
  simulationStop: byId("simulation-stop"),
  simulationMessage: byId("simulation-message"),
  simulationThroughput: byId("simulation-throughput"),
  throughputExplanation: byId("throughput-explanation"),
  trainingGenerationProgress: byId("training-generation-progress"),
  trainingCurrentGeneration: byId("training-current-generation"),
  trainingEpisodes: byId("training-episodes"),
  trainingLiveSteps: byId("training-live-steps"),
  trainingCurrentTrack: byId("training-current-track"),
  trainingElapsed: byId("training-elapsed"),
  trainingEta: byId("training-eta"),
  runningSpeedMode: byId("running-speed-mode"),
  runningPopulation: byId("running-population"),
  runningGenerations: byId("running-generations"),
  runningEpisode: byId("running-episode"),
  runningNetwork: byId("running-network"),
  runningEvolution: byId("running-evolution"),
  runningSeed: byId("running-seed"),
  runningWorkers: byId("running-workers"),
  runningAggregate: byId("running-aggregate"),
  runningBudget: byId("running-budget"),
  replayStatus: byId("replay-status"),
  trackViewPanel: byId("track-view-panel"),
  trackViewTabs: byId("track-view-tabs"),
  trackWeightsToggle: byId("track-weights-toggle"),
  trackWeightsPanel: byId("track-weights-panel"),
  trackWeightsTitle: byId("track-weights-title"),
  trackWeightsSummary: byId("track-weights-summary"),
  trackWeightsGrid: byId("track-weights-grid"),
  trackWeightsDetails: byId("track-weights-details"),
  viewedGeneration: byId("viewed-generation"),
  latestGeneration: byId("latest-generation"),
  followLatest: byId("follow-latest"),
  populationView: byId("population-view"),
  populationViewPanel: document.querySelector(".population-view-panel"),
  sensorToggle: byId("sensor-toggle"),
  rewardToggle: byId("reward-toggle"),
  agentCount: byId("agent-count"),
  replayTransport: byId("replay-transport"),
  replayPrevious: byId("replay-previous"),
  replayPlay: byId("replay-play"),
  replayNext: byId("replay-next"),
  replayProgress: byId("replay-progress"),
  replayRate: byId("replay-rate"),
  runResult: byId("run-result"),
  runResultSummary: byId("run-result-summary"),
  saveRunName: byId("save-run-name"),
  saveRun: byId("save-run"),
  continueTraining: byId("continue-training"),
  showWeights: byId("show-weights"),
  savedRuns: byId("saved-runs"),
  metricGeneration: byId("metric-generation"),
  metricProgress: byId("metric-progress"),
  metricFitness: byId("metric-fitness"),
  metricSteps: byId("metric-steps"),
  fitnessDialog: byId("fitness-dialog"),
  fitnessDialogClose: byId("fitness-dialog-close"),
  fitnessDialogTrack: byId("fitness-dialog-track"),
  fitnessChart: byId("fitness-chart"),
  fitnessChartSvg: byId("fitness-chart-svg"),
  fitnessChartPoints: byId("fitness-chart-points"),
  fitnessChartSelection: byId("fitness-chart-selection"),
  toast: byId("toast"),
};

const catalog = createLabCatalog({ storage: window.localStorage });
const views = Object.fromEntries(
  [...document.querySelectorAll("[data-view]")].map((view) => [
    view.dataset.view,
    view,
  ]),
);

let currentView = "tracks";
let activeTrackDefinition = structuredClone(TRACK_PRESETS[2]);
let activeCourse = createCourse(activeTrackDefinition);
let activeTrackSelection = `example:${activeTrackDefinition.id}`;
let toastTimer = null;

let editorDraft = null;
let editorTool = "route";
let editorHistory = [];
let editorFuture = [];
let editorPointer = null;
let editorHoverPoint = null;
let editorVehicleProbe = null;
let spacePressed = false;
let editorViewTransform = { zoom: 1, offsetX: 0, offsetY: 0 };
let editorNeedsFit = true;

let simulationViewTransform = { zoom: 1, offsetX: 0, offsetY: 0 };
let simulationNeedsFit = true;
let trainingWorker = null;
let trainingRunning = false;
let trainingPaused = false;
let trainingSpeed = "normal";
let activeWorkerCount = 0;
let detectedHardwareConcurrency = Math.max(
  1,
  Math.floor(Number(navigator.hardwareConcurrency) || 1),
);
let targetGeneration = 50;
let replayClock = 0;
let replayRate = 1;
let playbackPaused = false;
let populationView = "best";
let selectedReplayTrackKey = null;
let trackWeightsVisible = false;
let rewardMarkersVisible = false;
let networkArchitecture = normalizeNetworkArchitecture("baseline");
let displayedArtifact = null;
let latestArtifact = null;
let currentRun = null;
let fitnessHistory = [];
let agentCountLabel = "";
const replayHistory = createReplayHistory({ limit: 100 });
let previousFrameTime = performance.now();

function formatInteger(value) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatFitness(value) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value ?? 0);
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "считаем…";
  const seconds = Math.max(1, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes} мин ${remainder} с` : `${minutes} мин`;
}

function russianPlural(value, one, few, many) {
  const absolute = Math.abs(Math.trunc(Number(value)));
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function automaticWorkerCount() {
  return Math.max(
    1,
    Math.min(
      Number(elements.populationSize.value) || 1,
      detectedHardwareConcurrency,
    ),
  );
}

function selectedWorkerCount() {
  return elements.workerCount.value === "auto"
    ? "auto"
    : Math.max(1, Number(elements.workerCount.value) || 1);
}

function renderWorkerCountOptions() {
  const selected = elements.workerCount.value || "auto";
  const automatic = automaticWorkerCount();
  elements.workerCount.replaceChildren();
  const automaticOption = document.createElement("option");
  automaticOption.value = "auto";
  automaticOption.textContent =
    `Авто — ${automatic} Workers из ${detectedHardwareConcurrency} ядер`;
  elements.workerCount.append(automaticOption);
  for (let count = 1; count <= detectedHardwareConcurrency; count += 1) {
    const option = document.createElement("option");
    option.value = String(count);
    option.textContent =
      count === detectedHardwareConcurrency
        ? `${count} — все вычислительные потоки`
        : `${count} Workers`;
    elements.workerCount.append(option);
  }
  elements.workerCount.value =
    selected === "auto" ||
    Number(selected) <= detectedHardwareConcurrency
      ? selected
      : "auto";
  elements.workerCountHelp.textContent =
    `Mac сообщает ${detectedHardwareConcurrency} логических ядер. Авто запускает ${automatic} вычислительных Workers — по одному на каждый логический CPU-поток.`;
}

function uniqueTrackId() {
  return `track-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 5500);
}

function setEditorMessage(message, error = false) {
  elements.editorMessage.textContent = message;
  elements.editorMessage.classList.toggle("is-error", error);
  elements.editorMessage.classList.toggle("is-visible", Boolean(message));
}

function setSimulationMessage(message) {
  elements.simulationMessage.textContent = message;
}

function latestSavedTracks() {
  const latestById = new Map();
  for (const record of catalog.listTracks()) {
    const current = latestById.get(record.reference.id);
    if (!current || record.reference.version > current.reference.version) {
      latestById.set(record.reference.id, record);
    }
  }
  return [...latestById.values()].sort(
    (left, right) => right.reference.version - left.reference.version,
  );
}

function setView(name, { updateHash = true } = {}) {
  if (!views[name]) name = "tracks";
  currentView = name;

  for (const [viewName, view] of Object.entries(views)) {
    view.hidden = viewName !== name;
  }
  elements.editorHeader.hidden = name !== "editor";
  elements.appHeader.classList.toggle("is-editor", name === "editor");
  document.body.classList.toggle(
    "is-fixed-view",
    name === "editor" || name === "simulation",
  );

  for (const link of document.querySelectorAll("[data-nav-view]")) {
    const activeName = name === "editor" ? "tracks" : name;
    link.classList.toggle("is-active", link.dataset.navView === activeName);
  }

  const titles = {
    tracks: "Трассы · Racing AI",
    editor: "Редактор трассы · Racing AI",
    simulation: "Симуляция · Racing AI",
  };
  document.title = titles[name];

  if (name === "tracks") renderTrackLibrary();
  if (name === "simulation") {
    fillSimulationTrackSelect();
    simulationNeedsFit = true;
  }
  if (name === "editor") editorNeedsFit = true;

  if (updateHash && location.hash !== `#${name}`) {
    history.pushState(null, "", `#${name}`);
  }
}

function routeFromHash() {
  const requested = location.hash.slice(1);
  if (requested === "editor" && !editorDraft) {
    setView("tracks", { updateHash: false });
    return;
  }
  setView(views[requested] ? requested : "tracks", { updateHash: false });
}

function prepareCanvas(canvas) {
  const bounds = canvas.getBoundingClientRect();
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, width, height, dpr };
}

function drawGrid(context, width, height, transform) {
  context.fillStyle = "#f5f6f7";
  context.fillRect(0, 0, width, height);

  const gap = Math.max(15, 26 * transform.zoom);
  const offsetX = ((transform.offsetX % gap) + gap) % gap;
  const offsetY = ((transform.offsetY % gap) + gap) % gap;
  context.fillStyle = "#d9dde2";
  for (let x = offsetX; x < width; x += gap) {
    for (let y = offsetY; y < height; y += gap) {
      context.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
}

function fillRoadSurface(
  context,
  fragment,
  defaultWidth,
  extraWidth,
  closed,
  color,
) {
  if (fragment.length < 2) return;
  const surface = buildRoadSurface(fragment, {
    defaultWidth,
    extraWidth,
    closed,
  });
  context.fillStyle = color;
  for (const segment of surface.segments) {
    context.beginPath();
    context.moveTo(segment.polygon[0].x, segment.polygon[0].y);
    for (const point of segment.polygon.slice(1)) {
      context.lineTo(point.x, point.y);
    }
    context.closePath();
    context.fill();
  }
  for (const join of surface.joins) {
    context.beginPath();
    context.arc(join.x, join.y, join.radius, 0, Math.PI * 2);
    context.fill();
  }
}

function drawSelfCrossingBarriers(
  context,
  fragment,
  defaultWidth,
  closed,
) {
  const surface = buildRoadSurface(fragment, { defaultWidth, closed });
  for (const crossing of surface.intersections) {
    const span = crossing.underRadius * 2 + 12;
    const roadWidth = crossing.overRadius * 2;
    context.save();
    context.translate(crossing.x, crossing.y);
    context.rotate(crossing.overHeading);

    context.fillStyle = "#aeb4bb";
    context.fillRect(-span / 2, -(roadWidth + 8) / 2, span, roadWidth + 8);
    context.fillStyle = "#4b5056";
    context.fillRect(-span / 2, -roadWidth / 2, span, roadWidth);

    context.strokeStyle = "#d8dde3";
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(-span / 2, -roadWidth / 2);
    context.lineTo(span / 2, -roadWidth / 2);
    context.moveTo(-span / 2, roadWidth / 2);
    context.lineTo(span / 2, roadWidth / 2);
    context.stroke();
    context.restore();
  }
}

function drawRoad(
  context,
  fragments,
  {
    defaultWidth = 80,
    closed = false,
    showEndpoints = false,
    transform,
    alpha = 1,
  } = {},
) {
  context.save();
  context.translate(transform.offsetX, transform.offsetY);
  context.scale(transform.zoom, transform.zoom);

  for (const [fragmentIndex, fragment] of fragments.entries()) {
    context.globalAlpha = alpha;
    fillRoadSurface(context, fragment, defaultWidth, 6, closed, "#aeb4bb");
    fillRoadSurface(context, fragment, defaultWidth, 0, closed, "#4b5056");
    drawSelfCrossingBarriers(context, fragment, defaultWidth, closed);
    context.globalAlpha = 1;

    if (showEndpoints && !closed && fragment.length > 0) {
      const radius = 8 / transform.zoom;
      for (const [endpointIndex, endpoint] of [
        fragment[0],
        fragment.at(-1),
      ].entries()) {
        context.beginPath();
        context.arc(endpoint.x, endpoint.y, radius, 0, Math.PI * 2);
        context.fillStyle =
          fragmentIndex === 0 && endpointIndex === 0
            ? "#138a43"
            : "#0b63f6";
        context.fill();
        context.lineWidth = 2 / transform.zoom;
        context.strokeStyle = "#ffffff";
        context.stroke();
      }
    }
  }
  context.restore();
}

function drawStartLine(context, definition, transform) {
  const [start, next] = definition.points;
  if (!start || !next) return;
  const roadWidth = start.width ?? definition.width;
  const heading = Math.atan2(next.y - start.y, next.x - start.x);
  const cells = 8;
  const cellHeight = roadWidth / cells;

  context.save();
  context.translate(transform.offsetX, transform.offsetY);
  context.scale(transform.zoom, transform.zoom);
  context.translate(start.x, start.y);
  context.rotate(heading);
  for (let index = 0; index < cells; index += 1) {
    context.fillStyle = index % 2 === 0 ? "#ffffff" : "#202328";
    context.fillRect(-4, -roadWidth / 2 + index * cellHeight, 8, cellHeight);
  }
  context.restore();
}

function drawRewardMarkers(context, course, transform) {
  const markers = buildRewardMarkers(course);
  context.save();
  context.translate(transform.offsetX, transform.offsetY);
  context.scale(transform.zoom, transform.zoom);
  context.font = `${11 / transform.zoom}px -apple-system, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "bottom";
  for (const marker of markers) {
    const pose = course.poseAtDistance(marker.distanceAlong);
    context.save();
    context.translate(marker.x, marker.y);
    context.rotate(marker.heading);
    context.setLineDash([4 / transform.zoom, 4 / transform.zoom]);
    context.strokeStyle = "rgb(255 255 255 / 0.9)";
    context.lineWidth = 2 / transform.zoom;
    context.beginPath();
    context.moveTo(0, -pose.roadWidth / 2);
    context.lineTo(0, pose.roadWidth / 2);
    context.stroke();
    context.restore();
    const normalX = -Math.sin(marker.heading);
    const normalY = Math.cos(marker.heading);
    const labelOffset = pose.roadWidth / 2 + 7 / transform.zoom;
    context.fillStyle = "#1769ff";
    context.fillText(
      marker.label,
      marker.x + normalX * labelOffset,
      marker.y + normalY * labelOffset,
    );
  }
  context.restore();
}

function drawTrackThumbnail(canvas, definition) {
  const { context, width, height } = prepareCanvas(canvas);
  const transform = fitRouteInView(definition.points, {
    viewportWidth: width,
    viewportHeight: height,
    padding: Math.min(width, height) * 0.16,
  });
  drawGrid(context, width, height, transform);
  drawRoad(context, [definition.points], {
    defaultWidth: Math.max(22, definition.width),
    closed: definition.closed !== false,
    transform,
  });
}

function createExampleCard(definition) {
  const article = document.createElement("article");
  article.className = "track-example";
  article.innerHTML = `
    <canvas class="track-thumbnail" aria-label="Схема трассы ${definition.name}"></canvas>
    <h3>${definition.name}</h3>
    <p>Готовый пример</p>
    <button class="button button-secondary" type="button">Открыть копию</button>
  `;
  article.querySelector("button").addEventListener("click", () => {
    openEditor(definition, { copy: true });
  });
  requestAnimationFrame(() => {
    drawTrackThumbnail(article.querySelector("canvas"), definition);
  });
  return article;
}

function createSavedTrackRow(record) {
  const row = document.createElement("article");
  row.className = "saved-track-row";
  row.innerHTML = `
    <canvas class="track-thumbnail" aria-label="Схема трассы ${record.definition.name}"></canvas>
    <div class="saved-track-info">
      <h3>${record.definition.name}</h3>
      <p class="saved-track-status">Готова к симуляции · версия ${record.reference.version}</p>
    </div>
    <div class="saved-track-actions">
      <button class="button button-secondary" data-action="edit" type="button">Редактировать</button>
      <button class="button button-primary" data-action="run" type="button">Запустить</button>
    </div>
  `;
  row.querySelector('[data-action="edit"]').addEventListener("click", () => {
    openEditor(record.definition);
  });
  row.querySelector('[data-action="run"]').addEventListener("click", () => {
    selectActiveTrack(
      record.definition,
      `saved:${record.reference.id}:${record.reference.version}`,
    );
    setView("simulation");
  });
  requestAnimationFrame(() => {
    drawTrackThumbnail(row.querySelector("canvas"), record.definition);
  });
  return row;
}

function renderTrackLibrary() {
  elements.exampleGrid.replaceChildren(
    ...TRACK_PRESETS.map(createExampleCard),
  );

  const saved = latestSavedTracks();
  elements.savedTrackList.replaceChildren();
  if (saved.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <strong>Сохранённых трасс пока нет</strong>
      <span>Создайте новую или откройте копию готового примера.</span>
    `;
    elements.savedTrackList.append(empty);
    return;
  }
  for (const record of saved) {
    elements.savedTrackList.append(createSavedTrackRow(record));
  }
}

function editorSnapshot() {
  return structuredClone({
    fragments: editorDraft.fragments,
    defaultWidth: editorDraft.defaultWidth,
    closed: editorDraft.closed,
    vehicleProbe: editorVehicleProbe,
  });
}

function restoreEditorSnapshot(snapshot) {
  editorDraft.fragments = structuredClone(snapshot.fragments);
  editorDraft.defaultWidth = snapshot.defaultWidth;
  editorDraft.closed = Boolean(snapshot.closed);
  editorVehicleProbe = structuredClone(snapshot.vehicleProbe ?? null);
  elements.routeWidth.value = snapshot.defaultWidth;
  elements.routeWidthOutput.textContent = `${Math.round(snapshot.defaultWidth)} px`;
  markEditorDirty();
}

function pushEditorHistory(snapshot) {
  editorHistory.push(structuredClone(snapshot));
  if (editorHistory.length > 20) editorHistory.shift();
  editorFuture = [];
  updateHistoryButtons();
}

function updateHistoryButtons() {
  elements.editorUndo.disabled = editorHistory.length === 0;
  elements.editorRedo.disabled = editorFuture.length === 0;
}

function undoEditor() {
  if (editorHistory.length === 0) return;
  editorFuture.push(editorSnapshot());
  restoreEditorSnapshot(editorHistory.pop());
  updateHistoryButtons();
}

function redoEditor() {
  if (editorFuture.length === 0) return;
  editorHistory.push(editorSnapshot());
  restoreEditorSnapshot(editorFuture.pop());
  updateHistoryButtons();
}

function markEditorDirty() {
  if (!editorDraft) return;
  editorDraft.dirty = true;
  elements.editorStatus.innerHTML =
    '<span aria-hidden="true"></span>Черновик — прогресс не рассчитывается';
}

function openEditor(definition = null, { copy = false } = {}) {
  if (trainingRunning) stopTraining("Обучение остановлено перед редактированием.");
  const source = definition ? structuredClone(definition) : null;
  const name = source
    ? copy
      ? `Копия: ${source.name}`
      : source.name
    : "Моя трасса";

  editorDraft = {
    id: source && !copy ? source.id : uniqueTrackId(),
    name,
    defaultWidth: source?.width ?? 80,
    closed: Boolean(source?.closed),
    fragments: source?.points?.length ? [structuredClone(source.points)] : [],
    dirty: true,
  };
  editorHistory = [];
  editorFuture = [];
  editorVehicleProbe = null;
  editorHoverPoint = null;
  elements.editorName.value = name;
  elements.routeWidth.value = editorDraft.defaultWidth;
  elements.routeWidthOutput.textContent =
    `${Math.round(editorDraft.defaultWidth)} px`;
  updateHistoryButtons();
  setEditorTool("route");
  setEditorMessage(
    source
      ? "Это редактируемая копия. Старая сохранённая версия не изменится."
      : "Нарисуйте маршрут. Следующий штрих начинайте у синей точки.",
  );
  editorNeedsFit = true;
  setView("editor");
}

function setEditorTool(tool) {
  editorTool = tool;
  for (const button of document.querySelectorAll("[data-editor-tool]")) {
    const active = button.dataset.editorTool === tool;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  for (const options of document.querySelectorAll("[data-tool-options]")) {
    options.hidden = options.dataset.toolOptions !== tool;
  }
  const cursors = {
    route: "crosshair",
    width: "crosshair",
    erase: "crosshair",
    pan: "grab",
    elevation: "crosshair",
    vehicle: "crosshair",
  };
  elements.editorCanvas.style.cursor = cursors[tool];
}

function fitEditorToTrack() {
  const bounds = elements.editorCanvas.getBoundingClientRect();
  const points = editorDraft?.fragments.flat() ?? [];
  if (points.length === 0) {
    editorViewTransform = {
      zoom: 1,
      offsetX: bounds.width / 2,
      offsetY: bounds.height / 2,
    };
  } else {
    editorViewTransform = fitRouteInView(points, {
      viewportWidth: bounds.width,
      viewportHeight: bounds.height,
      padding:
        Math.min(bounds.width, bounds.height) * 0.16 +
        editorDraft.defaultWidth / 2,
    });
  }
  updateEditorZoomOutput();
}

function updateEditorZoomOutput() {
  elements.editorZoomOutput.textContent =
    `${Math.round(editorViewTransform.zoom * 100)}%`;
}

function zoomEditorAt(screenPoint, factor) {
  const oldZoom = editorViewTransform.zoom;
  const newZoom = Math.max(0.08, Math.min(5, oldZoom * factor));
  const worldX =
    (screenPoint.x - editorViewTransform.offsetX) / oldZoom;
  const worldY =
    (screenPoint.y - editorViewTransform.offsetY) / oldZoom;
  editorViewTransform.zoom = newZoom;
  editorViewTransform.offsetX = screenPoint.x - worldX * newZoom;
  editorViewTransform.offsetY = screenPoint.y - worldY * newZoom;
  updateEditorZoomOutput();
}

function editorScreenPoint(event) {
  const bounds = elements.editorCanvas.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

function editorWorldPoint(event) {
  const point = editorScreenPoint(event);
  return {
    x: (point.x - editorViewTransform.offsetX) / editorViewTransform.zoom,
    y: (point.y - editorViewTransform.offsetY) / editorViewTransform.zoom,
  };
}

function coalescedWorldPoints(event) {
  const events =
    typeof event.getCoalescedEvents === "function"
      ? event.getCoalescedEvents()
      : [];
  const values = events.length ? events : [event];
  return values.map(editorWorldPoint);
}

function startEditorPointer(event) {
  if (!editorDraft) return;
  editorHoverPoint = editorWorldPoint(event);
  const temporaryPan = event.button === 1 || spacePressed;
  const tool = temporaryPan ? "pan" : editorTool;
  if (event.button !== 0 && event.button !== 1) return;
  if (tool === "route" && editorDraft.closed) {
    setEditorMessage(
      "Трасса уже замкнута. Используйте ластик, чтобы открыть участок для редактирования.",
    );
    return;
  }
  event.preventDefault();

  editorPointer = {
    pointerId: event.pointerId,
    tool,
    rawPoints: coalescedWorldPoints(event),
    previousScreen: editorScreenPoint(event),
    before: editorSnapshot(),
  };
  elements.editorCanvas.setPointerCapture(event.pointerId);
  if (tool === "pan") elements.editorCanvas.style.cursor = "grabbing";
}

function moveEditorPointer(event) {
  editorHoverPoint = editorWorldPoint(event);
  if (!editorPointer || editorPointer.pointerId !== event.pointerId) return;
  event.preventDefault();
  if (editorPointer.tool === "pan") {
    const screen = editorScreenPoint(event);
    editorViewTransform.offsetX += screen.x - editorPointer.previousScreen.x;
    editorViewTransform.offsetY += screen.y - editorPointer.previousScreen.y;
    editorPointer.previousScreen = screen;
    return;
  }
  editorPointer.rawPoints.push(...coalescedWorldPoints(event));
}

function applyBrushToFragments(rawPoints, property, value, radius) {
  const brushPath = resamplePath(rawPoints, {
    spacing: Math.max(4, radius / 3),
  });
  let fragments = editorDraft.fragments;
  for (const center of brushPath) {
    fragments = fragments.map((fragment) =>
      paintRouteProperty(fragment, {
        center,
        radius,
        property,
        value,
        falloff: true,
      }),
    );
  }
  editorDraft.fragments = fragments;
}

function finishEditorPointer(event) {
  if (!editorPointer || editorPointer.pointerId !== event.pointerId) return;
  event.preventDefault();
  if (editorPointer.tool !== "pan") {
    editorPointer.rawPoints.push(...coalescedWorldPoints(event));
  }
  const session = editorPointer;
  editorPointer = null;
  if (elements.editorCanvas.hasPointerCapture(event.pointerId)) {
    elements.editorCanvas.releasePointerCapture(event.pointerId);
  }
  elements.editorCanvas.style.cursor =
    editorTool === "pan" ? "grab" : "crosshair";

  if (session.tool === "pan") return;
  const raw = session.rawPoints;
  if (raw.length < 2 && session.tool === "route") return;

  if (session.tool === "route") {
    const enriched = raw.map((point) => ({
      ...point,
      width: Number(elements.routeWidth.value),
      elevation: 0,
    }));
    const result = addStrokeToFragments(editorDraft.fragments, enriched, {
      spacing: 16,
      snapDistance: 36 / editorViewTransform.zoom,
    });
    editorDraft.fragments = result.fragments;
    editorDraft.closed = result.closed;
    setEditorMessage(
      result.closed
        ? "Трасса замкнута и готова к сохранению."
        : result.attached
          ? "Маршрут обновлён. Доведите синий конец до зелёного старта."
        : "Штрих не касается синей точки и сохранён отдельно. Соедините фрагменты.",
      !result.attached && result.fragments.length > 1,
    );
  } else if (session.tool === "erase") {
    const radius = Number(elements.eraserRadius.value);
    const brushPath = resamplePath(raw, {
      spacing: Math.max(4, radius / 3),
    });
    let fragments = editorDraft.fragments;
    for (const center of brushPath) {
      fragments = eraseRouteFragments(fragments, { center, radius });
    }
    editorDraft.fragments = fragments;
    editorDraft.closed = false;
    editorVehicleProbe = null;
    setEditorMessage("Участок удалён. Разрыв не соединяется скрытой прямой.");
  } else if (session.tool === "width") {
    applyBrushToFragments(
      raw,
      "width",
      Number(elements.widthBrushValue.value),
      Number(elements.widthBrushRadius.value),
    );
    setEditorMessage("Локальная ширина изменена.");
  } else if (session.tool === "elevation") {
    applyBrushToFragments(
      raw,
      "elevation",
      Number(elements.elevationValue.value),
      Number(elements.elevationRadius.value),
    );
    setEditorMessage("Высота участка изменена. Она влияет на физику, но остаётся в 2D.");
  } else if (session.tool === "vehicle") {
    if (!editorDraft.closed || editorDraft.fragments.length !== 1) {
      setEditorMessage("Сначала замкните трассу, затем проверьте габарит машины.", true);
    } else {
      const draftCourse = createCourse({
        width: editorDraft.defaultWidth,
        closed: true,
        points: editorDraft.fragments[0],
      });
      const location = draftCourse.locate(raw.at(-1));
      const position = { x: location.x, y: location.y };
      editorVehicleProbe = {
        position,
        heading: location.heading,
        fits: draftCourse.containsFootprint({
          position,
          heading: location.heading,
          ...VEHICLE_SPEC,
        }),
        roadWidth: location.roadWidth,
      };
      setEditorMessage(
        editorVehicleProbe.fits
          ? `Машина ${VEHICLE_SPEC.width} × ${VEHICLE_SPEC.length} px помещается здесь.`
          : `Машина ${VEHICLE_SPEC.width} × ${VEHICLE_SPEC.length} px выходит за границу дороги.`,
        !editorVehicleProbe.fits,
      );
    }
  }

  pushEditorHistory(session.before);
  markEditorDirty();
}

function cancelEditorPointer(event) {
  if (!editorPointer || editorPointer.pointerId !== event.pointerId) return;
  editorPointer = null;
  elements.editorCanvas.style.cursor =
    editorTool === "pan" ? "grab" : "crosshair";
}

function finishAndSaveEditor() {
  if (!editorDraft) return;
  try {
    const finalized = finalizeFragments(editorDraft.fragments, {
      spacing: 18,
      closed: true,
      maxClosingDistance: Math.max(90, editorDraft.defaultWidth * 1.6),
      smoothingPasses: 2,
      routeClosed: editorDraft.closed,
    });
    const definition = {
      id: editorDraft.id,
      name: elements.editorName.value.trim() || "Моя трасса",
      width: editorDraft.defaultWidth,
      closed: true,
      points: finalized.points.map((point) => ({
        x: point.x,
        y: point.y,
        width: point.width ?? editorDraft.defaultWidth,
        elevation: point.elevation ?? 0,
      })),
    };
    const compiled = createCourse(definition);
    const reference = catalog.saveTrack(compiled.toDefinition());
    editorDraft.dirty = false;
    selectActiveTrack(
      compiled.toDefinition(),
      `saved:${reference.id}:${reference.version}`,
    );
    renderTrackLibrary();
    fillSimulationTrackSelect();
    showToast(`Трасса сохранена · версия ${reference.version}`);
    setView("tracks");
  } catch (error) {
    setEditorMessage(error.message, true);
  }
}

function selectActiveTrack(definition, selection) {
  activeTrackDefinition = structuredClone(definition);
  activeCourse = createCourse(activeTrackDefinition);
  activeTrackSelection = selection;
  simulationNeedsFit = true;
  replayClock = 0;
}

function fillSimulationTrackSelect() {
  const select = elements.simulationTrackSelect;
  const previousAdditional = new Set(
    [...elements.additionalTrackOptions.querySelectorAll("input:checked")].map(
      (input) => input.value,
    ),
  );
  select.replaceChildren();
  for (const preset of TRACK_PRESETS) {
    select.add(new Option(`${preset.name} · готовый пример`, `example:${preset.id}`));
  }
  for (const record of latestSavedTracks()) {
    select.add(
      new Option(
        `${record.definition.name} · версия ${record.reference.version}`,
        `saved:${record.reference.id}:${record.reference.version}`,
      ),
    );
  }
  if ([...select.options].some((option) => option.value === activeTrackSelection)) {
    select.value = activeTrackSelection;
  } else {
    activeTrackSelection = select.options[0]?.value ?? "";
    select.value = activeTrackSelection;
  }
  elements.additionalTrackOptions.replaceChildren();
  for (const option of [...select.options]) {
    if (option.value === select.value) continue;
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = option.value;
    input.checked = previousAdditional.has(option.value);
    label.append(input, document.createTextNode(option.textContent));
    elements.additionalTrackOptions.append(label);
  }
  updateBudgetSummary();
}

function selectedTrainingTrackSelections() {
  return [
    elements.simulationTrackSelect.value,
    ...[
      ...elements.additionalTrackOptions.querySelectorAll("input:checked"),
    ].map((input) => input.value),
  ].filter(Boolean);
}

function trackDefinitionForSelection(value) {
  const [kind, id, version] = value.split(":");
  if (kind === "example") {
    return TRACK_PRESETS.find((entry) => entry.id === id) ?? null;
  }
  if (kind === "saved") {
    return catalog.getTrack({ id, version: Number(version) }).definition;
  }
  return null;
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(
    "http://www.w3.org/2000/svg",
    name,
  );
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function diagramNodePositions(size) {
  const visible = Math.min(size, 8);
  if (visible === 1) return [74];
  return Array.from(
    { length: visible },
    (_, index) => 24 + (index * 100) / (visible - 1),
  );
}

function renderNetworkDiagram() {
  const layers = [8, ...networkArchitecture.hiddenLayers, 3];
  const width = Math.max(360, layers.length * 105);
  const height = 170;
  const svg = svgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    "aria-hidden": "true",
    focusable: "false",
  });
  const xPositions = layers.map(
    (_, index) => 42 + (index * (width - 84)) / (layers.length - 1),
  );
  const nodePositions = layers.map(diagramNodePositions);

  for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex += 1) {
    for (const startY of nodePositions[layerIndex]) {
      for (const endY of nodePositions[layerIndex + 1]) {
        svg.append(
          svgElement("line", {
            x1: xPositions[layerIndex] + 7,
            y1: startY,
            x2: xPositions[layerIndex + 1] - 7,
            y2: endY,
            class: "network-connection",
          }),
        );
      }
    }
  }

  layers.forEach((size, layerIndex) => {
    const group = svgElement("g", {
      class:
        layerIndex === 0
          ? "network-node-group is-input"
          : layerIndex === layers.length - 1
            ? "network-node-group is-output"
            : "network-node-group is-hidden",
    });
    for (const y of nodePositions[layerIndex]) {
      group.append(
        svgElement("circle", {
          cx: xPositions[layerIndex],
          cy: y,
          r: 6,
          class: "network-node",
        }),
      );
    }
    const label = svgElement("text", {
      x: xPositions[layerIndex],
      y: 148,
      "text-anchor": "middle",
      class: "network-layer-label",
    });
    label.textContent =
      layerIndex === 0
        ? "Входы"
        : layerIndex === layers.length - 1
          ? "Выходы"
          : `Скрытый ${layerIndex}`;
    const count = svgElement("text", {
      x: xPositions[layerIndex],
      y: 163,
      "text-anchor": "middle",
      class: "network-layer-count",
    });
    count.textContent = `${size}${size > 8 ? " (свёрнуто)" : ""}`;
    group.append(label, count);
    svg.append(group);
  });

  elements.networkDiagram.replaceChildren(svg);
  elements.networkDiagram.setAttribute(
    "aria-label",
    `Нейросеть ${networkArchitecture.topology}: 8 входов, ` +
      `${networkArchitecture.hiddenLayers.length} скрытых слоя, 3 выхода, ` +
      `${networkArchitecture.parameterCount} обучаемых параметров.`,
  );
}

function setNetworkArchitecture(next) {
  networkArchitecture = normalizeNetworkArchitecture(next);
  renderNetworkEditor();
  updateBudgetSummary();
}

function adjustHiddenLayer(index, delta) {
  const value = networkArchitecture.hiddenLayers[index] + delta;
  if (value < 4 || value > 64) return;
  setNetworkArchitecture(
    updateHiddenLayer(networkArchitecture, index, value),
  );
}

function renderNetworkLayers() {
  elements.networkLayers.replaceChildren();
  networkArchitecture.hiddenLayers.forEach((neurons, index) => {
    const row = document.createElement("div");
    row.className = "network-layer-row";
    const copy = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = `Скрытый слой ${index + 1}`;
    const summary = document.createElement("strong");
    summary.textContent = `${neurons} нейронов`;
    copy.append(label, summary);
    const controls = document.createElement("div");
    controls.className = "network-layer-controls";

    const decrement = document.createElement("button");
    decrement.type = "button";
    decrement.textContent = "−";
    decrement.setAttribute(
      "aria-label",
      `Уменьшить скрытый слой ${index + 1}`,
    );
    decrement.disabled = neurons <= 4;
    decrement.addEventListener("click", () => adjustHiddenLayer(index, -1));

    const input = document.createElement("input");
    input.className = "network-neuron-input";
    input.type = "number";
    input.min = "4";
    input.max = "64";
    input.step = "1";
    input.value = String(neurons);
    input.inputMode = "numeric";
    input.setAttribute(
      "aria-label",
      `Число нейронов в скрытом слое ${index + 1}`,
    );
    input.addEventListener("input", () => {
      const value = Number(input.value);
      if (!Number.isInteger(value) || value < 4 || value > 64) return;
      try {
        setNetworkArchitecture(
          updateHiddenLayer(networkArchitecture, index, value),
        );
      } catch (error) {
        input.value = String(networkArchitecture.hiddenLayers[index]);
        showToast(error.message);
      }
    });

    const increment = document.createElement("button");
    increment.type = "button";
    increment.textContent = "+";
    increment.setAttribute(
      "aria-label",
      `Увеличить скрытый слой ${index + 1}`,
    );
    increment.disabled = neurons >= 64;
    increment.addEventListener("click", () => adjustHiddenLayer(index, 1));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "network-layer-remove";
    remove.textContent = "×";
    remove.setAttribute(
      "aria-label",
      `Удалить скрытый слой ${index + 1}`,
    );
    remove.disabled = networkArchitecture.hiddenLayers.length <= 1;
    remove.addEventListener("click", () =>
      setNetworkArchitecture(removeHiddenLayer(networkArchitecture, index)),
    );
    controls.append(decrement, input, increment, remove);
    row.append(copy, controls);
    elements.networkLayers.append(row);
  });
}

function renderNetworkEditor() {
  const presetId = networkArchitecture.presetId;
  const customOption = elements.networkPreset.querySelector(
    'option[value="custom"]',
  );
  if (presetId === "custom") {
    customOption.hidden = false;
    customOption.disabled = false;
    elements.networkPreset.value = "custom";
  } else {
    elements.networkPreset.value = presetId;
    customOption.hidden = true;
    customOption.disabled = true;
  }

  renderNetworkDiagram();
  renderNetworkLayers();
  elements.networkAddLayer.disabled =
    networkArchitecture.hiddenLayers.length >= 3;
  const preset = NETWORK_ARCHITECTURE_PRESETS[presetId];
  let summary = elements.networkExplanation.querySelector(
    ".network-preset-summary",
  );
  if (!summary) {
    summary = document.createElement("p");
    summary.className = "network-preset-summary";
    elements.networkExplanation.prepend(summary);
  }
  summary.textContent = preset
    ? `${preset.label}: ${preset.description} ${preset.tradeoffs}`
    : "Пользовательская схема: ручные изменения реально будут использованы при обучении и сохранены вместе с checkpoint.";
  elements.networkParameterCount.innerHTML =
    `<strong>${formatInteger(networkArchitecture.parameterCount)}</strong> ` +
    `обучаемых параметров · ${networkArchitecture.topology}`;
}

function updateBudgetSummary() {
  try {
    const config = createRunConfig({
      populationSize: Number(elements.populationSize.value),
      generationLimit: Number(elements.generationLimit.value),
      episodeDurationSeconds: Number(elements.episodeDuration.value),
      trackCount: Math.max(1, selectedTrainingTrackSelections().length),
      hiddenLayers: [...networkArchitecture.hiddenLayers],
      seed: Number(elements.seed.value),
    });
    const perGeneration =
      config.populationSize * config.episodeSteps * config.trackCount;
    elements.budgetSummary.innerHTML = `
      <strong>До ${formatInteger(perGeneration)} шагов на поколение.</strong>
      ${config.populationSize} машин × ${config.episodeSteps} шагов
      (${config.episodeDurationSeconds} с) × ${config.trackCount} трасс.
      Сеть ${config.topology}, ${formatInteger(config.parameterCount)} весов.
      Полный лимит — ${formatInteger(config.estimatedSteps)} шагов.
    `;
  } catch (error) {
    elements.budgetSummary.innerHTML = `<strong>Проверьте параметры запуска.</strong> ${error.message}`;
  }
}

function loadTrackSelection(value) {
  const [kind, id, version] = value.split(":");
  if (kind === "example") {
    const preset = TRACK_PRESETS.find((entry) => entry.id === id);
    if (preset) selectActiveTrack(preset, value);
  } else if (kind === "saved") {
    const record = catalog.getTrack({ id, version: Number(version) });
    selectActiveTrack(record.definition, value);
  }
}

function fitSimulationToTrack() {
  const bounds = elements.simulationCanvas.getBoundingClientRect();
  simulationViewTransform = fitRouteInView(activeCourse.points, {
    viewportWidth: bounds.width,
    viewportHeight: bounds.height,
    padding:
      Math.min(bounds.width, bounds.height) * 0.12 + activeCourse.width / 2,
  });
}

function trackViewForArtifact(artifact, trackKey = selectedReplayTrackKey) {
  if (!artifact) return null;
  const views = artifact.trackViews ?? [];
  const view =
    views.find((candidate) => candidate.trackKey === trackKey) ??
    views[0];
  if (view) return view;
  return {
    trackKey:
      artifact.replayTrackKey ??
      currentRun?.tracks?.[0]?.key ??
      "single-course",
    trackName:
      currentRun?.tracks?.[0]?.name ??
      activeTrackDefinition.name ??
      "Трасса",
    bestFitness: artifact.bestFitness,
    medianFitness: artifact.medianFitness,
    bestProgress: artifact.bestProgress,
    checkpoint: artifact.checkpoint,
    rankedAgents: artifact.rankedAgents,
    replay: artifact.replay,
    populationReplays: artifact.populationReplays,
  };
}

function selectedTrackArtifact(artifact = displayedArtifact) {
  if (!artifact) return null;
  const view = trackViewForArtifact(artifact);
  if (!view) return artifact;
  return {
    ...artifact,
    bestFitness: view.bestFitness ?? artifact.bestFitness,
    medianFitness: view.medianFitness ?? artifact.medianFitness,
    bestProgress: view.bestProgress ?? artifact.bestProgress,
    checkpoint: view.checkpoint ?? artifact.checkpoint,
    rankedAgents: view.rankedAgents ?? artifact.rankedAgents,
    replay: view.replay ?? artifact.replay,
    populationReplays:
      view.populationReplays ?? artifact.populationReplays,
    replayTrackKey: view.trackKey,
  };
}

function activateReplayTrack(trackKey) {
  const runTrack = currentRun?.tracks?.find((track) => track.key === trackKey);
  if (!runTrack?.definition) return;
  activeTrackDefinition = structuredClone(runTrack.definition);
  activeCourse = createCourse(activeTrackDefinition);
  simulationNeedsFit = true;
}

function renderTrackViewTabs(artifact = displayedArtifact) {
  const trackViews = artifact?.trackViews ?? [];
  elements.trackViewTabs.replaceChildren();
  elements.trackViewPanel.hidden = !artifact;
  if (!artifact) return;
  const views =
    trackViews.length > 0 ? trackViews : [trackViewForArtifact(artifact)];
  if (!views.some((view) => view.trackKey === selectedReplayTrackKey)) {
    selectedReplayTrackKey = views[0]?.trackKey ?? null;
  }
  for (const view of views) {
    const button = document.createElement("button");
    const active = view.trackKey === selectedReplayTrackKey;
    button.type = "button";
    button.role = "tab";
    button.dataset.trackKey = view.trackKey;
    button.setAttribute("aria-selected", String(active));
    button.className = active ? "is-active" : "";
    button.textContent = view.trackName;
    elements.trackViewTabs.append(button);
  }
  activateReplayTrack(selectedReplayTrackKey);
}

function renderTrackWeightsPanel(artifact = displayedArtifact) {
  const selected = selectedTrackArtifact(artifact);
  const checkpoint = selected?.checkpoint;
  elements.trackWeightsToggle.setAttribute(
    "aria-pressed",
    String(trackWeightsVisible),
  );
  elements.trackWeightsToggle.textContent = trackWeightsVisible
    ? "Скрыть веса"
    : "Веса лидера";
  elements.trackWeightsPanel.hidden =
    !trackWeightsVisible || !checkpoint?.genes?.length;
  elements.trackWeightsGrid.replaceChildren();
  if (!checkpoint?.genes?.length) return;

  const view = trackViewForArtifact(artifact);
  elements.trackWeightsTitle.textContent =
    `Лидер · ${view?.trackName ?? "трасса"}`;
  elements.trackWeightsSummary.textContent =
    `${checkpoint.topology} · ${formatInteger(checkpoint.parameterCount)} весов`;
  const genes = checkpoint.genes;
  const cellCount = Math.min(160, genes.length);
  const maximum = Math.max(1e-9, ...genes.map((value) => Math.abs(value)));
  for (let index = 0; index < cellCount; index += 1) {
    const geneIndex = Math.min(
      genes.length - 1,
      Math.floor((index / cellCount) * genes.length),
    );
    const value = genes[geneIndex];
    const cell = document.createElement("i");
    cell.style.background = value >= 0 ? "#1769ff" : "#dc3f3f";
    cell.style.opacity = String(0.18 + 0.82 * Math.abs(value / maximum));
    elements.trackWeightsGrid.append(cell);
  }
}

function renderRunningConfiguration() {
  const config = currentRun?.config;
  if (!config) return;
  elements.runningPopulation.textContent =
    `${formatInteger(config.populationSize)} машин`;
  elements.runningGenerations.textContent =
    `${formatInteger(config.generationLimit)} ${russianPlural(config.generationLimit, "поколение", "поколения", "поколений")}`;
  elements.runningEpisode.textContent =
    `${config.episodeDurationSeconds} с · ${formatInteger(config.episodeSteps)} шагов`;
  elements.runningNetwork.textContent =
    `${config.topology} · ${formatInteger(config.parameterCount)} ${russianPlural(config.parameterCount, "вес", "веса", "весов")}`;
  elements.runningEvolution.textContent =
    `${formatInteger(config.eliteCount)} элиты · mutation ${Math.round(config.mutationRate * 100)}% / ${String(config.mutationScale).replace(".", ",")}`;
  elements.runningSeed.textContent = String(config.seed);
  elements.runningWorkers.textContent =
    activeWorkerCount > 0
      ? `${activeWorkerCount} вычислительных Workers · ${detectedHardwareConcurrency} логических ядер`
      : selectedWorkerCount() === "auto"
        ? `Авто · ${automaticWorkerCount()} вычислительных Workers`
        : `${selectedWorkerCount()} вычислительных Workers`;
  elements.runningAggregate.textContent =
    `${elements.aggregateMode.selectedOptions[0]?.textContent ?? config.aggregateMode} · ${config.trackCount} ${russianPlural(config.trackCount, "трасса", "трассы", "трасс")}`;
  elements.runningBudget.textContent =
    `${formatInteger(config.estimatedSteps)} шагов`;
  elements.runningSpeedMode.textContent =
    trainingSpeed === "fast" ? "Максимум · без паузы" : "Обычно · +120 мс";
}

function resetTrainingTelemetry() {
  elements.trainingGenerationProgress.value = 0;
  elements.trainingCurrentGeneration.textContent =
    `Поколение 1 / ${formatInteger(targetGeneration)}`;
  elements.trainingEpisodes.textContent = "0 / 0";
  elements.trainingLiveSteps.textContent = "0";
  elements.trainingCurrentTrack.textContent = "—";
  elements.trainingElapsed.textContent = "0 с";
  elements.trainingEta.textContent = "Считаем…";
  elements.throughputExplanation.textContent =
    "Первое обновление появится после первого рассчитанного заезда.";
}

function handleTrainingProgress(telemetry) {
  if (Number.isInteger(telemetry.workerCount) && telemetry.workerCount > 0) {
    activeWorkerCount = telemetry.workerCount;
  }
  if (
    Number.isInteger(telemetry.hardwareConcurrency) &&
    telemetry.hardwareConcurrency > 0
  ) {
    detectedHardwareConcurrency = telemetry.hardwareConcurrency;
  }
  const generationPercent = Math.round(telemetry.generationProgress * 100);
  const completedBefore = latestArtifact?.totalSteps ?? 0;
  elements.trainingGenerationProgress.value = telemetry.generationProgress;
  elements.trainingCurrentGeneration.textContent =
    `Поколение ${formatInteger(telemetry.generation)} / ${formatInteger(targetGeneration)} · ${generationPercent}%`;
  elements.trainingEpisodes.textContent =
    `${formatInteger(telemetry.completedEpisodes)} / ${formatInteger(telemetry.totalEpisodes)}`;
  elements.trainingLiveSteps.textContent =
    `${formatInteger(telemetry.completedSteps)} / до ${formatInteger(telemetry.totalStepBudget)}`;
  elements.trainingCurrentTrack.textContent = telemetry.trackName;
  elements.trainingElapsed.textContent =
    formatDuration(telemetry.elapsedMilliseconds);
  elements.trainingEta.textContent =
    formatDuration(telemetry.estimatedRunRemainingMilliseconds);
  elements.simulationThroughput.textContent =
    `${formatInteger(telemetry.stepsPerSecond)} шагов/с`;
  elements.throughputExplanation.textContent =
    `${generationPercent}% текущего поколения · ${activeWorkerCount || 1} Workers · ${trainingSpeed === "fast" ? "без паузы между поколениями" : "пауза 120 мс между поколениями"}. Скорость — физические шаги, не replay.`;
  renderRunningConfiguration();
  elements.metricGeneration.textContent = `${telemetry.generation}…`;
  elements.metricProgress.textContent =
    `${Math.round(telemetry.bestObservedProgress * 100)}%*`;
  elements.metricFitness.textContent =
    `${formatFitness(telemetry.bestObservedFitness)}*`;
  elements.metricSteps.textContent =
    formatInteger(completedBefore + telemetry.completedSteps);
}

function updateSimulationMetrics(snapshot = null) {
  const selected = selectedTrackArtifact(snapshot);
  elements.metricGeneration.textContent = formatInteger(selected?.generation ?? 0);
  elements.metricProgress.textContent =
    `${Math.round((selected?.bestProgress ?? 0) * 100)}%`;
  elements.metricFitness.textContent = formatFitness(selected?.bestFitness ?? 0);
  elements.metricSteps.textContent = formatInteger(selected?.totalSteps ?? 0);
}

function setSimulationRunningUi(running) {
  elements.simulationForm.hidden = running;
  elements.runningControls.hidden = !running;
  elements.runningIndicator.hidden = !running;
  elements.simulationTitle.textContent = running
    ? trainingPaused
      ? "Обучение на паузе"
      : "Обучение идёт"
    : latestArtifact
      ? "Результат запуска"
      : "Новый запуск";
  elements.simulationCanvasLabel.hidden = Boolean(displayedArtifact);
  elements.runResult.hidden = running || !latestArtifact;
}

function replayDuration(artifact = displayedArtifact) {
  const selected = selectedTrackArtifact(artifact);
  if (!selected) return 0;
  const replays = selected.populationReplays ?? [selected.replay];
  return Math.max(0, ...replays.map((replay) => (replay?.length ?? 1) - 1));
}

function setDisplayedArtifact(artifact, { resetClock = true } = {}) {
  displayedArtifact = artifact;
  if (!artifact) return;
  renderTrackViewTabs(artifact);
  renderTrackWeightsPanel(artifact);
  if (resetClock) replayClock = 0;
  elements.replayStatus.hidden = false;
  elements.populationViewPanel.hidden = false;
  elements.replayTransport.hidden = false;
  elements.simulationCanvasLabel.hidden = true;
  elements.viewedGeneration.value = artifact.generation;
  elements.viewedGeneration.textContent = artifact.generation;
  elements.latestGeneration.value = latestArtifact?.generation ?? artifact.generation;
  elements.latestGeneration.textContent =
    latestArtifact?.generation ?? artifact.generation;
  elements.followLatest.disabled =
    artifact.generation === latestArtifact?.generation;
  elements.replayPrevious.disabled =
    replayHistory.list()[0]?.generation === artifact.generation;
  elements.replayNext.disabled =
    replayHistory.list().at(-1)?.generation === artifact.generation;
  syncReplayPlayButton();
  updateSimulationMetrics(artifact);
  updateAgentCount(artifact, 0);
}

function updateAgentCount(artifact, activeCount) {
  const available = artifact?.rankedAgents?.length ??
    artifact?.populationReplays?.length ??
    0;
  const populationSize = artifact?.populationSize ?? available;
  const crashed = Math.max(0, available - activeCount);
  const label =
    available < populationSize
      ? `${available} лучших replay из ${populationSize} · ${activeCount} на трассе`
      : `${populationSize} всего · ${activeCount} на трассе · ${crashed} сошли`;
  if (label !== agentCountLabel) {
    elements.agentCount.textContent = label;
    agentCountLabel = label;
  }
}

function showRunResult(artifact, message) {
  if (!artifact) return;
  const selected = selectedTrackArtifact(artifact);
  const trackView = trackViewForArtifact(artifact);
  const topology =
    selected.checkpoint?.topology ??
    currentRun?.config?.topology?.replaceAll("→", "->") ??
    "8->10->3";
  elements.runResultSummary.textContent =
    `Поколение ${selected.generation}, ${trackView?.trackName ?? "трасса"}. Лучший progress ` +
    `${Math.round((selected.bestProgress ?? 0) * 100)}%, fitness ` +
    `${formatFitness(selected.bestFitness)}, ${formatInteger(selected.totalSteps)} ` +
    `шагов. Модель ${topology}, ${formatInteger(selected.checkpoint?.parameterCount ?? 0)} весов.`;
  elements.saveRunName.value =
    currentRun?.name || `Запуск · поколение ${artifact.generation}`;
  elements.runResult.hidden = false;
  setSimulationMessage(message);
}

function selectReplayGeneration(generation) {
  try {
    const artifact = replayHistory.selectGeneration(generation);
    setDisplayedArtifact(artifact);
    elements.fitnessDialog.close();
    setSimulationMessage(
      `Открыт replay поколения ${generation} на трассе «${trackViewForArtifact(artifact)?.trackName ?? "Трасса"}».`,
    );
  } catch (error) {
    showToast(error.message);
  }
}

function fitnessArtifactSummary(artifact) {
  return {
    generation: artifact.generation,
    bestFitness: artifact.bestFitness,
    medianFitness: artifact.medianFitness,
    bestProgress: artifact.bestProgress,
    totalSteps: artifact.totalSteps,
    trackViews: (artifact.trackViews ?? []).map((view) => ({
      trackKey: view.trackKey,
      trackName: view.trackName,
      bestFitness: view.bestFitness,
      medianFitness: view.medianFitness,
      bestProgress: view.bestProgress,
    })),
  };
}

function renderFitnessChart() {
  const series = buildFitnessSeries(
    fitnessHistory.length > 0 ? fitnessHistory : replayHistory.list(),
    selectedReplayTrackKey,
  );
  elements.fitnessChartSvg.replaceChildren();
  elements.fitnessChartPoints.replaceChildren();
  const view = trackViewForArtifact(displayedArtifact);
  elements.fitnessDialogTrack.textContent =
    `${view?.trackName ?? "Общий результат"} · ${series.length} поколений`;
  if (series.length === 0) {
    elements.fitnessChartSelection.textContent =
      "График появится после первого рассчитанного поколения.";
    return;
  }

  const width = 720;
  const height = 320;
  const left = 58;
  const right = 24;
  const top = 24;
  const bottom = 46;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = series.flatMap((point) => [
    point.bestFitness,
    point.medianFitness,
  ]);
  let minimum = Math.min(0, ...values);
  let maximum = Math.max(0, ...values);
  if (maximum - minimum < 1) {
    maximum += 0.5;
    minimum -= 0.5;
  }
  const firstGeneration = series[0].generation;
  const lastGeneration = series.at(-1).generation;
  const generationSpan = Math.max(1, lastGeneration - firstGeneration);
  const x = (generation) =>
    left + ((generation - firstGeneration) / generationSpan) * plotWidth;
  const y = (fitness) =>
    top + ((maximum - fitness) / (maximum - minimum)) * plotHeight;

  for (let index = 0; index <= 4; index += 1) {
    const chartY = top + (plotHeight * index) / 4;
    const value = maximum - ((maximum - minimum) * index) / 4;
    elements.fitnessChartSvg.append(
      svgElement("line", {
        x1: left,
        x2: width - right,
        y1: chartY,
        y2: chartY,
        class: "fitness-grid-line",
      }),
    );
    const label = svgElement("text", {
      x: left - 10,
      y: chartY + 4,
      class: "fitness-axis-label",
      "text-anchor": "end",
    });
    label.textContent = formatFitness(value);
    elements.fitnessChartSvg.append(label);
  }
  const firstLabel = svgElement("text", {
    x: left,
    y: height - 14,
    class: "fitness-axis-label",
    "text-anchor": "start",
  });
  firstLabel.textContent = `Поколение ${firstGeneration}`;
  const lastLabel = svgElement("text", {
    x: width - right,
    y: height - 14,
    class: "fitness-axis-label",
    "text-anchor": "end",
  });
  lastLabel.textContent = `Поколение ${lastGeneration}`;
  elements.fitnessChartSvg.append(firstLabel, lastLabel);

  for (const [field, className] of [
    ["medianFitness", "fitness-line-median"],
    ["bestFitness", "fitness-line-best"],
  ]) {
    elements.fitnessChartSvg.append(
      svgElement("polyline", {
        points: series
          .map((point) => `${x(point.generation)},${y(point[field])}`)
          .join(" "),
        class: className,
      }),
    );
  }

  for (const point of series) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fitness-point";
    if (point.generation === displayedArtifact?.generation) {
      button.classList.add("is-selected");
    }
    button.style.left = `${(x(point.generation) / width) * 100}%`;
    button.style.top = `${(y(point.bestFitness) / height) * 100}%`;
    button.setAttribute(
      "aria-label",
      `Поколение ${point.generation}: лучший fitness ${formatFitness(point.bestFitness)}, медиана ${formatFitness(point.medianFitness)}`,
    );
    button.title =
      `Поколение ${point.generation}\nЛучший: ${formatFitness(point.bestFitness)}\nМедиана: ${formatFitness(point.medianFitness)}`;
    button.addEventListener("click", () =>
      selectReplayGeneration(point.generation),
    );
    elements.fitnessChartPoints.append(button);
  }
  const latest = series.at(-1);
  elements.fitnessChartSelection.textContent =
    `Последнее поколение: лучший fitness ${formatFitness(latest.bestFitness)}, ` +
    `медиана ${formatFitness(latest.medianFitness)}. Нажмите на точку, чтобы открыть replay.`;
}

function openFitnessChart() {
  renderFitnessChart();
  elements.fitnessDialog.showModal();
}

function finishTraining(message) {
  trainingRunning = false;
  trainingPaused = false;
  elements.simulationPause.textContent = "Пауза обучения";
  setSimulationRunningUi(false);
  if (latestArtifact) showRunResult(latestArtifact, message);
  else setSimulationMessage(message);
}

function handleGenerationArtifact(artifact) {
  activeWorkerCount = artifact.workerCount ?? activeWorkerCount;
  detectedHardwareConcurrency =
    artifact.hardwareConcurrency ?? detectedHardwareConcurrency;
  if (
    latestArtifact &&
    latestArtifact.generation !== artifact.generation
  ) {
    replayHistory.add(
      compactReplayArtifact(latestArtifact, { agentLimit: 5 }),
    );
  }
  latestArtifact = artifact;
  fitnessHistory = [
    ...fitnessHistory.filter(
      (entry) => entry.generation !== artifact.generation,
    ),
    fitnessArtifactSummary(artifact),
  ].sort((left, right) => left.generation - right.generation);
  replayHistory.add(artifact);
  if (replayHistory.followingLatest) {
    setDisplayedArtifact(replayHistory.current());
  } else {
    elements.latestGeneration.value = artifact.generation;
    elements.latestGeneration.textContent = artifact.generation;
    elements.followLatest.disabled = false;
  }
  elements.simulationThroughput.textContent =
    `${formatInteger(artifact.stepsPerSecond ?? 0)} шагов/с`;
  elements.trainingGenerationProgress.value = 1;
  elements.trainingCurrentGeneration.textContent =
    `Поколение ${formatInteger(artifact.generation)} / ${formatInteger(targetGeneration)} · готово`;
  elements.trainingEpisodes.textContent =
    `${formatInteger(artifact.populationSize * artifact.trackCount)} / ${formatInteger(artifact.populationSize * artifact.trackCount)}`;
  elements.trainingLiveSteps.textContent =
    `${formatInteger(artifact.steps)} выполнено`;
  elements.trainingElapsed.textContent =
    formatDuration(artifact.computeMilliseconds);
  elements.trainingEta.textContent =
    artifact.generation >= targetGeneration ? "готово" : "уточняется…";
  elements.throughputExplanation.textContent =
    `Поколение ${artifact.generation}: ${formatInteger(artifact.steps)} шагов на ${activeWorkerCount || 1} Workers. Если машины живут дольше, шагов становится больше.`;
  renderRunningConfiguration();
  setSimulationMessage(
    `Поколение ${artifact.generation} рассчитано. На экране проигрывается готовый replay; обучение идёт независимо.`,
  );
}

function ensureTrainingWorker() {
  trainingWorker?.terminate();
  trainingWorker = new Worker(
    new URL("./training-worker.js", import.meta.url),
    { type: "module" },
  );
  trainingWorker.addEventListener("message", (event) => {
    const message = event.data ?? {};
    if (message.type === "pool-initializing") {
      elements.simulationThroughput.textContent = "Запускаем CPU-пул…";
      elements.throughputExplanation.textContent =
        "Компилируем трассы в каждом Worker. Это разовая подготовка перед первым поколением.";
    } else if (message.type === "started") {
      activeWorkerCount = message.workerCount ?? 1;
      detectedHardwareConcurrency =
        message.hardwareConcurrency ?? detectedHardwareConcurrency;
      renderRunningConfiguration();
      setSimulationMessage(
        `Запущено ${activeWorkerCount} вычислительных Workers на ${detectedHardwareConcurrency} логических ядрах.`,
      );
    } else if (message.type === "progress") {
      handleTrainingProgress(message.telemetry);
    } else if (message.type === "generation") {
      handleGenerationArtifact(message.artifact);
    } else if (message.type === "complete") {
      finishTraining("Лимит поколений достигнут. Можно сохранить запуск, посмотреть веса или продолжить.");
    } else if (message.type === "stopped") {
      finishTraining("Запуск остановлен после текущего поколения. Результат и replay доступны ниже.");
    } else if (message.type === "paused") {
      setSimulationMessage("Обучение на паузе. Replay можно смотреть независимо.");
    } else if (message.type === "error") {
      finishTraining(`Ошибка обучения: ${message.message}`);
    }
  });
  trainingWorker.addEventListener("error", (event) => {
    finishTraining(`Worker обучения остановлен: ${event.message}`);
  });
}

function startTraining(event) {
  event.preventDefault();
  try {
    loadTrackSelection(elements.simulationTrackSelect.value);
    const selections = selectedTrainingTrackSelections();
    const trackDefinitions = selections.map((selection) => {
      const definition = trackDefinitionForSelection(selection);
      if (!definition) throw new RangeError("Не удалось открыть выбранную трассу.");
      return {
        key: selection,
        name: definition.name,
        definition: structuredClone(definition),
      };
    });
    const runConfig = createRunConfig({
      populationSize: Number(elements.populationSize.value),
      generationLimit: Number(elements.generationLimit.value),
      episodeDurationSeconds: Number(elements.episodeDuration.value),
      trackCount: trackDefinitions.length,
      hiddenLayers: [...networkArchitecture.hiddenLayers],
      seed: Number(elements.seed.value),
    });
    targetGeneration = runConfig.generationLimit;
    const eliteCount = Math.max(
      2,
      Math.min(
        runConfig.populationSize - 1,
        Math.round(runConfig.populationSize * 0.1),
      ),
    );
    currentRun = {
      name: elements.runName.value.trim() || "Новый запуск",
      tracks: trackDefinitions,
      config: {
        ...BASELINE,
        ...runConfig,
        hiddenLayers: [...runConfig.hiddenLayers],
        eliteCount,
        aggregateMode: elements.aggregateMode.value,
        workerCount: selectedWorkerCount(),
      },
    };

    replayHistory.clear();
    fitnessHistory = [];
    displayedArtifact = null;
    latestArtifact = null;
    selectedReplayTrackKey = trackDefinitions[0]?.key ?? null;
    trackWeightsVisible = false;
    replayClock = 0;
    playbackPaused = false;
    elements.replayStatus.hidden = true;
    elements.trackViewPanel.hidden = true;
    elements.trackWeightsPanel.hidden = true;
    elements.populationViewPanel.hidden = false;
    elements.replayTransport.hidden = true;
    elements.runResult.hidden = true;
    ensureTrainingWorker();
    trainingRunning = true;
    trainingPaused = false;
    activeWorkerCount = 0;
    elements.simulationPause.textContent = "Пауза обучения";
    elements.runningTrackName.textContent =
      trackDefinitions.length === 1
        ? trackDefinitions[0].name
        : `${trackDefinitions.length} трасс · ${elements.aggregateMode.selectedOptions[0].textContent}`;
    elements.simulationThroughput.textContent = "Рассчитываем…";
    resetTrainingTelemetry();
    renderRunningConfiguration();
    setSimulationRunningUi(true);
    updateSimulationMetrics();
    setSimulationMessage(
      "Считается поколение 1. Звёздочкой отмечены предварительные progress и fitness по уже завершённым заездам.",
    );
    trainingWorker.postMessage({
      type: "start",
      tracks: trackDefinitions,
      config: currentRun.config,
      targetGeneration,
      speed: trainingSpeed,
      workerCount: currentRun.config.workerCount,
    });
  } catch (error) {
    setSimulationMessage(error.message);
    return;
  }
}

function stopTraining() {
  if (!trainingWorker || !trainingRunning) {
    return;
  }
  trainingWorker.postMessage({ type: "stop" });
  setSimulationMessage("Завершаем текущее поколение и готовим итоговый результат…");
}

function toggleTrainingPause() {
  if (!trainingRunning || !trainingWorker) return;
  trainingPaused = !trainingPaused;
  elements.simulationPause.textContent = trainingPaused
    ? "Продолжить обучение"
    : "Пауза обучения";
  trainingWorker.postMessage({ type: trainingPaused ? "pause" : "resume" });
  setSimulationRunningUi(true);
}

function navigateReplay(direction) {
  const artifact =
    direction < 0 ? replayHistory.previous() : replayHistory.next();
  if (artifact) setDisplayedArtifact(artifact);
}

function followLatestReplay() {
  const artifact = replayHistory.followLatest();
  if (artifact) setDisplayedArtifact(artifact);
}

function syncReplayPlayButton() {
  elements.replayPlay.setAttribute(
    "aria-pressed",
    String(!playbackPaused),
  );
  elements.replayPlay.setAttribute(
    "aria-label",
    playbackPaused ? "Воспроизвести повтор" : "Поставить повтор на паузу",
  );
  elements.replayPlay.querySelector("span").textContent =
    playbackPaused ? "▶" : "Ⅱ";
}

function toggleReplayPlayback() {
  playbackPaused = !playbackPaused;
  syncReplayPlayButton();
}

function continueCurrentTraining() {
  if (!trainingWorker || !latestArtifact || trainingRunning) return;
  const additionalGenerations = currentRun?.config?.generationLimit ?? 50;
  targetGeneration = latestArtifact.generation + additionalGenerations;
  trainingRunning = true;
  trainingPaused = false;
  elements.simulationPause.textContent = "Пауза обучения";
  setSimulationRunningUi(true);
  setSimulationMessage(
    `Продолжаем ещё ${additionalGenerations} поколений с текущей популяцией.`,
  );
  trainingWorker.postMessage({
    type: "continue",
    additionalGenerations,
  });
}

function compactResult(artifact) {
  return {
    generation: artifact.generation,
    bestFitness: artifact.bestFitness,
    medianFitness: artifact.medianFitness,
    bestProgress: artifact.bestProgress,
    totalSteps: artifact.totalSteps,
    stepsPerSecond: artifact.stepsPerSecond,
    bestTrackResults: artifact.bestTrackResults,
  };
}

function saveCurrentRun() {
  const sourceArtifact = displayedArtifact ?? latestArtifact;
  const artifact = selectedTrackArtifact(sourceArtifact);
  if (!artifact?.checkpoint?.genes?.length || !currentRun) {
    showToast("Сначала дождитесь хотя бы одного завершённого поколения.");
    return;
  }
  try {
    const trackSnapshots = (sourceArtifact.trackViews ?? []).map((view) => ({
      trackKey: view.trackKey,
      trackName: view.trackName,
      bestFitness: view.bestFitness,
      medianFitness: view.medianFitness,
      bestProgress: view.bestProgress,
      checkpoint: view.checkpoint,
      replay: view.replay,
    }));
    const saved = catalog.saveRun({
      name:
        elements.saveRunName.value.trim() ||
        currentRun.name ||
        `Запуск · поколение ${artifact.generation}`,
      trackDefinitions: currentRun.tracks.map((track) => track.definition),
      config: currentRun.config,
      result: compactResult(artifact),
      checkpoint: artifact.checkpoint,
      replay: artifact.replay,
      selectedTrackKey: selectedReplayTrackKey,
      trackSnapshots,
      fitnessHistory,
    });
    elements.saveRunName.value = saved.name;
    renderSavedRuns();
    showToast(`Сохранено: ${saved.name}`);
  } catch (error) {
    showToast(error.message);
  }
}

function filenamePart(value) {
  return String(value)
    .trim()
    .replaceAll(/[^a-zA-Z0-9а-яА-ЯёЁ._-]+/g, "-")
    .slice(0, 60) || "racing-model";
}

function downloadCheckpoint(artifact, name) {
  const payload = {
    name,
    generation: artifact.generation,
    topology: artifact.checkpoint.topology,
    parameterCount: artifact.checkpoint.parameterCount,
    genes: artifact.checkpoint.genes,
    config: currentRun?.config ?? null,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filenamePart(name)}-weights.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function showWeightsDialog(artifact = displayedArtifact ?? latestArtifact, name = currentRun?.name) {
  if (!artifact?.checkpoint?.genes?.length) {
    showToast("У выбранного результата нет сохранённых весов.");
    return;
  }
  document.querySelector("#weights-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "weights-dialog";
  dialog.className = "weights-dialog";
  const heading = document.createElement("div");
  heading.className = "weights-dialog-heading";
  const title = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = `Поколение ${artifact.generation}`;
  const h2 = document.createElement("h2");
  h2.textContent = artifact.checkpoint.topology;
  title.append(eyebrow, h2);
  const close = document.createElement("button");
  close.className = "icon-button";
  close.type = "button";
  close.setAttribute("aria-label", "Закрыть");
  close.textContent = "×";
  close.addEventListener("click", () => dialog.close());
  heading.append(title, close);

  const description = document.createElement("p");
  description.className = "weights-description";
  description.textContent =
    `${formatInteger(artifact.checkpoint.parameterCount)} обучаемых весов. ` +
    "Синий — положительный вес, красный — отрицательный; яркость показывает модуль.";
  const grid = document.createElement("div");
  grid.className = "weight-grid";
  const maximum = Math.max(
    1e-9,
    ...artifact.checkpoint.genes.map((weight) => Math.abs(weight)),
  );
  artifact.checkpoint.genes.forEach((weight, index) => {
    const cell = document.createElement("span");
    cell.className = `weight-cell ${weight >= 0 ? "is-positive" : "is-negative"}`;
    cell.style.opacity = String(0.18 + 0.82 * Math.abs(weight / maximum));
    cell.title = `w${index + 1}: ${weight.toFixed(5)}`;
    grid.append(cell);
  });
  const actions = document.createElement("div");
  actions.className = "weights-dialog-actions";
  const download = document.createElement("button");
  download.className = "button button-primary";
  download.type = "button";
  download.textContent = "Скачать веса JSON";
  download.addEventListener("click", () =>
    downloadCheckpoint(artifact, name || "racing-model"),
  );
  actions.append(download);
  dialog.append(heading, description, grid, actions);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

function openSavedRun(run) {
  const snapshots = run.trackSnapshots?.length
    ? run.trackSnapshots
    : [
        {
          trackKey: "saved-run-track-0",
          trackName: run.trackDefinitions?.[0]?.name ?? "Трасса",
          bestFitness: run.result.bestFitness,
          medianFitness: run.result.medianFitness,
          bestProgress: run.result.bestProgress,
          checkpoint: run.checkpoint,
          replay: run.replay,
        },
      ];
  const selectedSnapshot =
    snapshots.find((snapshot) => snapshot.trackKey === run.selectedTrackKey) ??
    snapshots[0];
  const definitionIndex = Math.max(0, snapshots.indexOf(selectedSnapshot));
  const definition =
    run.trackDefinitions?.[definitionIndex] ?? run.trackDefinitions?.[0];
  if (definition) {
    selectActiveTrack(definition, `saved-run:${run.id}`);
  }
  const trackViews = snapshots.map((snapshot) => ({
    ...snapshot,
    rankedAgents: [
      {
        trackRank: 1,
        globalRank: 1,
        populationIndex: 0,
        fitness: snapshot.bestFitness,
        maxProgress: snapshot.bestProgress,
        crashed: snapshot.replay?.at(-1)?.onTrack === false,
        replay: snapshot.replay,
      },
    ],
    populationReplays: [snapshot.replay],
  }));
  const artifact = {
    generation: run.result.generation,
    bestFitness: run.result.bestFitness,
    medianFitness: run.result.medianFitness,
    bestProgress: run.result.bestProgress,
    totalSteps: run.result.totalSteps,
    stepsPerSecond: run.result.stepsPerSecond,
    checkpoint: selectedSnapshot.checkpoint,
    replay: selectedSnapshot.replay,
    populationReplays: [selectedSnapshot.replay],
    rankedAgents: trackViews.find(
      (view) => view.trackKey === selectedSnapshot.trackKey,
    ).rankedAgents,
    replayTrackKey: selectedSnapshot.trackKey,
    trackViews,
  };
  currentRun = {
    name: run.name,
    tracks: (run.trackDefinitions ?? []).map((track, index) => ({
      key: snapshots[index]?.trackKey ?? `saved-run-track-${index}`,
      name: track.name,
      definition: track,
    })),
    config: run.config,
  };
  if (run.config.hiddenLayers) {
    setNetworkArchitecture(run.config.hiddenLayers);
  }
  elements.runName.value = run.name;
  elements.populationSize.value =
    run.config.populationSize ?? elements.populationSize.value;
  elements.generationLimit.value =
    run.config.generationLimit ?? elements.generationLimit.value;
  elements.episodeDuration.value =
    run.config.episodeDurationSeconds ?? elements.episodeDuration.value;
  elements.seed.value = run.config.seed ?? elements.seed.value;
  updateBudgetSummary();
  replayHistory.clear();
  fitnessHistory = run.fitnessHistory?.length
    ? run.fitnessHistory
    : [fitnessArtifactSummary(artifact)];
  selectedReplayTrackKey = selectedSnapshot.trackKey;
  latestArtifact = artifact;
  replayHistory.add(artifact);
  setDisplayedArtifact(artifact);
  showRunResult(artifact, `Открыт сохранённый запуск «${run.name}».`);
}

function renderSavedRuns() {
  const runs = catalog.listRuns();
  elements.savedRuns.replaceChildren();
  if (runs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "saved-runs-empty";
    empty.textContent = "Сохранённых запусков пока нет.";
    elements.savedRuns.append(empty);
    return;
  }
  for (const run of runs) {
    const card = document.createElement("article");
    card.className = "saved-run-card";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = run.name;
    const meta = document.createElement("span");
    meta.textContent =
      `Поколение ${run.result.generation} · ${Math.round((run.result.bestProgress ?? 0) * 100)}%`;
    copy.append(title, meta);
    const actions = document.createElement("div");
    const open = document.createElement("button");
    open.type = "button";
    open.className = "button button-secondary";
    open.textContent = "Открыть";
    open.addEventListener("click", () => openSavedRun(run));
    const weights = document.createElement("button");
    weights.type = "button";
    weights.className = "button button-secondary";
    weights.textContent = "Веса";
    weights.addEventListener("click", () =>
      showWeightsDialog(
        {
          generation: run.result.generation,
          checkpoint: run.checkpoint,
        },
        run.name,
      ),
    );
    actions.append(open, weights);
    card.append(copy, actions);
    elements.savedRuns.append(card);
  }
}

function drawSensors(context, frame, transform) {
  const sensorRange = Math.max(100, activeCourse.width * 2.5);
  context.save();
  context.translate(transform.offsetX, transform.offsetY);
  context.scale(transform.zoom, transform.zoom);
  for (let index = 0; index < frame.sensors.length; index += 1) {
    const distance = frame.sensors[index] * sensorRange;
    const angle = frame.heading + SENSOR_ANGLES[index];
    context.beginPath();
    context.moveTo(frame.position.x, frame.position.y);
    context.lineTo(
      frame.position.x + Math.cos(angle) * distance,
      frame.position.y + Math.sin(angle) * distance,
    );
    context.strokeStyle = "#ffffff";
    context.globalAlpha = 0.72;
    context.lineWidth = 3.6 / transform.zoom;
    context.stroke();
    context.strokeStyle = "#22d3ee";
    context.globalAlpha = 0.95;
    context.lineWidth = 1.5 / transform.zoom;
    context.setLineDash([5 / transform.zoom, 4 / transform.zoom]);
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.arc(
      frame.position.x + Math.cos(angle) * distance,
      frame.position.y + Math.sin(angle) * distance,
      2.8 / transform.zoom,
      0,
      Math.PI * 2,
    );
    context.fillStyle = "#22d3ee";
    context.globalAlpha = 1;
    context.fill();
  }
  context.restore();
}

function drawVehicle(context, frame, transform, presentation, rank = null) {
  const width = VEHICLE_SPEC.width;
  const length = VEHICLE_SPEC.length;
  const followed = presentation.tier === "followed";
  context.save();
  context.translate(transform.offsetX, transform.offsetY);
  context.scale(transform.zoom, transform.zoom);
  context.translate(frame.position.x, frame.position.y);
  context.rotate(frame.heading + Math.PI / 2);
  context.globalAlpha = followed ? 1 : 0.82;
  context.fillStyle = presentation.color;
  context.strokeStyle = followed ? "#ffffff" : "#ffffffcc";
  context.lineWidth = (followed ? 3 : 1.5) / transform.zoom;
  if (followed) {
    context.shadowColor = "rgb(23 105 255 / 0.45)";
    context.shadowBlur = 14 / transform.zoom;
  }
  context.beginPath();
  context.roundRect(-width / 2, -length / 2, width, length, 4);
  context.fill();
  context.stroke();
  context.shadowBlur = 0;
  context.fillStyle = "#ffffff";
  context.globalAlpha = followed ? 1 : 0.78;
  context.fillRect(-width * 0.28, -length * 0.2, width * 0.56, length * 0.3);
  if (rank != null) {
    context.rotate(-Math.PI / 2);
    context.fillStyle = "#ffffff";
    context.globalAlpha = 1;
    context.font = `${followed ? 12 : 9}px -apple-system, sans-serif`;
    context.textAlign = "center";
    context.fillText(`#${rank}`, 0, -length * 0.72);
  }
  context.restore();
}

function drawCrashMarker(context, frame, transform) {
  context.save();
  context.translate(transform.offsetX, transform.offsetY);
  context.scale(transform.zoom, transform.zoom);
  context.translate(frame.position.x, frame.position.y);
  const radius = 11 / transform.zoom;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fillStyle = "rgb(239 68 68 / 0.18)";
  context.fill();
  context.strokeStyle = "#ef4444";
  context.lineWidth = 2 / transform.zoom;
  context.beginPath();
  context.moveTo(-5 / transform.zoom, -5 / transform.zoom);
  context.lineTo(5 / transform.zoom, 5 / transform.zoom);
  context.moveTo(5 / transform.zoom, -5 / transform.zoom);
  context.lineTo(-5 / transform.zoom, 5 / transform.zoom);
  context.stroke();
  context.restore();
}

function drawEditorToolPreview(context) {
  if (!editorHoverPoint || editorTool === "pan" || editorTool === "vehicle") return;
  const radii = {
    route: Number(elements.routeWidth.value) / 2,
    width: Number(elements.widthBrushRadius.value),
    erase: Number(elements.eraserRadius.value),
    elevation: Number(elements.elevationRadius.value),
  };
  const radius = radii[editorTool];
  if (!Number.isFinite(radius)) return;
  const color = editorTool === "erase" ? "#c83333" : "#0b63f6";
  context.save();
  context.translate(editorViewTransform.offsetX, editorViewTransform.offsetY);
  context.scale(editorViewTransform.zoom, editorViewTransform.zoom);
  context.beginPath();
  context.arc(editorHoverPoint.x, editorHoverPoint.y, radius, 0, Math.PI * 2);
  context.fillStyle =
    editorTool === "erase" ? "rgb(200 51 51 / 0.10)" : "rgb(11 99 246 / 0.10)";
  context.fill();
  context.lineWidth = 2 / editorViewTransform.zoom;
  context.strokeStyle = "#ffffff";
  context.stroke();
  context.setLineDash([5 / editorViewTransform.zoom, 4 / editorViewTransform.zoom]);
  context.strokeStyle = color;
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = color;
  context.font = `${12 / editorViewTransform.zoom}px -apple-system, sans-serif`;
  context.fillText(
    `R ${Math.round(radius)} px`,
    editorHoverPoint.x + radius + 8 / editorViewTransform.zoom,
    editorHoverPoint.y - 8 / editorViewTransform.zoom,
  );
  context.restore();
}

function drawEditorVehicleProbe(context) {
  if (!editorVehicleProbe) return;
  const { position, heading, fits, roadWidth } = editorVehicleProbe;
  context.save();
  context.translate(editorViewTransform.offsetX, editorViewTransform.offsetY);
  context.scale(editorViewTransform.zoom, editorViewTransform.zoom);
  context.translate(position.x, position.y);
  context.rotate(heading + Math.PI / 2);
  context.fillStyle = fits ? "rgb(19 138 67 / 0.28)" : "rgb(200 51 51 / 0.28)";
  context.strokeStyle = fits ? "#138a43" : "#c83333";
  context.lineWidth = 2 / editorViewTransform.zoom;
  context.beginPath();
  context.roundRect(
    -VEHICLE_SPEC.width / 2,
    -VEHICLE_SPEC.length / 2,
    VEHICLE_SPEC.width,
    VEHICLE_SPEC.length,
    3,
  );
  context.fill();
  context.stroke();
  context.restore();
  context.save();
  const screenX =
    position.x * editorViewTransform.zoom + editorViewTransform.offsetX;
  const screenY =
    position.y * editorViewTransform.zoom + editorViewTransform.offsetY;
  context.font = "12px -apple-system, sans-serif";
  context.fillStyle = fits ? "#138a43" : "#c83333";
  context.fillText(
    `${fits ? "Проходит" : "Не проходит"} · машина ${VEHICLE_SPEC.width}×${VEHICLE_SPEC.length} · дорога ${Math.round(roadWidth)} px`,
    screenX + 16,
    screenY - 16,
  );
  context.restore();
}

function drawEditorFrame() {
  const { context, width, height } = prepareCanvas(elements.editorCanvas);
  if (editorNeedsFit && editorDraft) {
    fitEditorToTrack();
    editorNeedsFit = false;
  }
  drawGrid(context, width, height, editorViewTransform);
  if (!editorDraft) return;
  drawRoad(context, editorDraft.fragments, {
    defaultWidth: editorDraft.defaultWidth,
    closed: editorDraft.closed,
    showEndpoints: !editorDraft.closed,
    transform: editorViewTransform,
  });
  if (
    editorPointer &&
    editorPointer.tool === "route" &&
    editorPointer.rawPoints.length > 1
  ) {
    const prepared = smoothPath(
      resamplePath(editorPointer.rawPoints, {
        spacing: Math.max(5, 8 / editorViewTransform.zoom),
      }),
      { passes: 1 },
    );
    const preview = prepared.map((point) => ({
      ...point,
      width: Number(elements.routeWidth.value),
    }));
    drawRoad(context, [preview], {
      defaultWidth: Number(elements.routeWidth.value),
      transform: editorViewTransform,
      alpha: 0.55,
    });
  }
  drawEditorVehicleProbe(context);
  drawEditorToolPreview(context);
}

function drawSimulationFrame(deltaSeconds) {
  const { context, width, height } = prepareCanvas(elements.simulationCanvas);
  if (simulationNeedsFit) {
    fitSimulationToTrack();
    simulationNeedsFit = false;
  }
  drawGrid(context, width, height, simulationViewTransform);
  drawRoad(context, [activeTrackDefinition.points], {
    defaultWidth: activeTrackDefinition.width,
    closed: true,
    transform: simulationViewTransform,
  });
  drawStartLine(context, activeTrackDefinition, simulationViewTransform);
  if (rewardMarkersVisible) {
    drawRewardMarkers(context, activeCourse, simulationViewTransform);
  }

  const artifact = selectedTrackArtifact(displayedArtifact);
  if (!artifact?.replay?.length) return;
  const duration = replayDuration(artifact);
  if (!playbackPaused) {
    replayClock += deltaSeconds * 30 * replayRate;
  }
  if (duration > 0 && replayClock > duration) {
    const previousGeneration = artifact.generation;
    const next = replayHistory.next();
    if (next && next.generation !== previousGeneration) {
      setDisplayedArtifact(next);
    } else {
      replayClock %= duration;
    }
  }

  const replays = artifact.populationReplays ?? [artifact.replay];
  const frames = replays.map((replay) =>
    sampleReplay(replay, replayClock, { loop: false }),
  );
  const visibleCount =
    populationView === "all"
      ? replays.length
      : populationView === "top"
        ? Math.min(5, replays.length)
        : 1;
  const activeCount = frames.filter((frame) => frame?.onTrack).length;
  for (let index = visibleCount - 1; index >= 1; index -= 1) {
    const frame = frames[index];
    if (frame?.onTrack) {
      drawVehicle(
        context,
        frame,
        simulationViewTransform,
        agentPresentation({
          rank: index + 1,
          total: replays.length,
        }),
        index + 1,
      );
    }
  }

  const bestFrame =
    sampleReplay(artifact.replay, replayClock, { loop: false }) ??
    artifact.replay.at(-1);
  if (bestFrame) {
    if (bestFrame.onTrack) {
      if (elements.sensorToggle.checked) {
        drawSensors(context, bestFrame, simulationViewTransform);
      }
      drawVehicle(
        context,
        bestFrame,
        simulationViewTransform,
        agentPresentation({
          rank: 1,
          total: replays.length,
          followed: true,
        }),
        1,
      );
    } else {
      drawCrashMarker(context, bestFrame, simulationViewTransform);
    }
  }
  updateAgentCount(artifact, activeCount);
  elements.replayProgress.value =
    duration > 0 ? String((Math.min(replayClock, duration) / duration) * 100) : "0";
}

function renderFrame(timestamp) {
  const deltaSeconds = Math.min(0.1, (timestamp - previousFrameTime) / 1000);
  previousFrameTime = timestamp;
  if (currentView === "editor") drawEditorFrame();
  if (currentView === "simulation") drawSimulationFrame(deltaSeconds);
  requestAnimationFrame(renderFrame);
}

document.querySelectorAll("[data-editor-tool]").forEach((button) => {
  button.addEventListener("click", () => setEditorTool(button.dataset.editorTool));
});

elements.createTrack.addEventListener("click", () => openEditor());
elements.editorName.addEventListener("input", () => {
  if (editorDraft) {
    editorDraft.name = elements.editorName.value;
    markEditorDirty();
  }
});
elements.editorUndo.addEventListener("click", undoEditor);
elements.editorRedo.addEventListener("click", redoEditor);
elements.editorFit.addEventListener("click", fitEditorToTrack);
elements.editorZoomOut.addEventListener("click", () => {
  const bounds = elements.editorCanvas.getBoundingClientRect();
  zoomEditorAt({ x: bounds.width / 2, y: bounds.height / 2 }, 0.8);
});
elements.editorZoomIn.addEventListener("click", () => {
  const bounds = elements.editorCanvas.getBoundingClientRect();
  zoomEditorAt({ x: bounds.width / 2, y: bounds.height / 2 }, 1.25);
});
elements.editorFullscreen.addEventListener("click", async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await elements.editorWorkspace.requestFullscreen();
  }
});
elements.editorFinish.addEventListener("click", finishAndSaveEditor);
elements.elevationTool.addEventListener("click", () => {
  setEditorTool("elevation");
  elements.reliefControl.open = false;
});

for (const [input, output, suffix] of [
  [elements.routeWidth, elements.routeWidthOutput, " px"],
  [elements.widthBrushValue, elements.widthBrushOutput, " px"],
  [elements.widthBrushRadius, elements.widthRadiusOutput, " px"],
  [elements.eraserRadius, elements.eraserRadiusOutput, " px"],
  [elements.elevationValue, elements.elevationValueOutput, " м"],
  [elements.elevationRadius, elements.elevationRadiusOutput, " px"],
]) {
  input.addEventListener("input", () => {
    output.textContent = `${input.value}${suffix}`;
    if (input === elements.routeWidth && editorDraft) {
      editorDraft.defaultWidth = Number(input.value);
      markEditorDirty();
    }
  });
}

elements.editorCanvas.addEventListener("pointerdown", startEditorPointer);
elements.editorCanvas.addEventListener("pointermove", moveEditorPointer);
elements.editorCanvas.addEventListener("pointerenter", (event) => {
  editorHoverPoint = editorWorldPoint(event);
});
elements.editorCanvas.addEventListener("pointerleave", () => {
  // Keep the last canvas position so slider changes update the visible brush.
});
elements.editorCanvas.addEventListener("pointerup", finishEditorPointer);
elements.editorCanvas.addEventListener("pointercancel", cancelEditorPointer);
elements.editorCanvas.addEventListener("contextmenu", (event) => event.preventDefault());
elements.editorCanvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    zoomEditorAt(editorScreenPoint(event), Math.exp(-event.deltaY * 0.0012));
  },
  { passive: false },
);

elements.simulationTrackSelect.addEventListener("change", () => {
  loadTrackSelection(elements.simulationTrackSelect.value);
  fillSimulationTrackSelect();
});
elements.additionalTrackOptions.addEventListener("change", updateBudgetSummary);
elements.aggregateMode.addEventListener("change", updateBudgetSummary);
for (const input of [
  elements.populationSize,
  elements.generationLimit,
  elements.episodeDuration,
  elements.seed,
]) {
  input?.addEventListener("input", () => {
    if (input === elements.populationSize) renderWorkerCountOptions();
    updateBudgetSummary();
  });
}
elements.workerCount.addEventListener("change", renderRunningConfiguration);
elements.networkPreset.addEventListener("change", () => {
  if (elements.networkPreset.value === "custom") return;
  setNetworkArchitecture(elements.networkPreset.value);
});
elements.networkAddLayer.addEventListener("click", () => {
  try {
    setNetworkArchitecture(
      addHiddenLayer(
        networkArchitecture,
        networkArchitecture.hiddenLayers.at(-1) ?? 10,
      ),
    );
  } catch (error) {
    showToast(error.message);
  }
});
elements.simulationForm.addEventListener("submit", startTraining);
elements.simulationPause.addEventListener("click", toggleTrainingPause);
elements.simulationStop.addEventListener("click", stopTraining);
elements.replayPrevious.addEventListener("click", () => navigateReplay(-1));
elements.replayNext.addEventListener("click", () => navigateReplay(1));
elements.followLatest.addEventListener("click", followLatestReplay);
elements.replayPlay.addEventListener("click", toggleReplayPlayback);
elements.replayProgress.addEventListener("input", () => {
  replayClock =
    (Number(elements.replayProgress.value) / 100) * replayDuration();
});
elements.replayRate.addEventListener("change", () => {
  replayRate = Number(elements.replayRate.value) || 1;
});
elements.populationView.addEventListener("click", (event) => {
  const button = event.target.closest("[data-population-view]");
  if (!button) return;
  populationView = button.dataset.populationView;
  for (const candidate of elements.populationView.querySelectorAll("button")) {
    const active = candidate === button;
    candidate.classList.toggle("is-active", active);
    candidate.setAttribute("aria-pressed", String(active));
  }
});
elements.trackViewTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-track-key]");
  if (!button || button.dataset.trackKey === selectedReplayTrackKey) return;
  selectedReplayTrackKey = button.dataset.trackKey;
  replayClock = 0;
  renderTrackViewTabs();
  renderTrackWeightsPanel();
  updateSimulationMetrics(displayedArtifact);
  updateAgentCount(selectedTrackArtifact(), 0);
  if (!trainingRunning && latestArtifact) {
    showRunResult(
      latestArtifact,
      `Показан лидер трассы «${trackViewForArtifact(displayedArtifact)?.trackName}».`,
    );
  }
});
elements.trackWeightsToggle.addEventListener("click", () => {
  trackWeightsVisible = !trackWeightsVisible;
  renderTrackWeightsPanel();
});
elements.rewardToggle.addEventListener("change", () => {
  rewardMarkersVisible = elements.rewardToggle.checked;
  showToast(
    rewardMarkersVisible
      ? "Показаны отметки каждых 10% трассы. Реальная награда начисляется непрерывно за новую дистанцию."
      : "Отметки награды скрыты.",
  );
});
elements.trackWeightsDetails.addEventListener("click", () =>
  showWeightsDialog(selectedTrackArtifact()),
);
elements.metricFitness.addEventListener("click", openFitnessChart);
elements.fitnessDialogClose.addEventListener("click", () =>
  elements.fitnessDialog.close(),
);
elements.saveRun.addEventListener("click", saveCurrentRun);
elements.continueTraining.addEventListener("click", continueCurrentTraining);
elements.showWeights.addEventListener("click", () =>
  showWeightsDialog(selectedTrackArtifact()),
);
document.querySelectorAll("[data-speed]").forEach((button) => {
  button.addEventListener("click", () => {
    trainingSpeed = button.dataset.speed;
    document.querySelectorAll("[data-speed]").forEach((candidate) => {
      candidate.classList.toggle("is-active", candidate === button);
    });
    trainingWorker?.postMessage({
      type: "speed",
      value: trainingSpeed,
    });
    renderRunningConfiguration();
    elements.throughputExplanation.textContent =
      trainingSpeed === "fast"
        ? "Максимум: паузы между поколениями нет; физика и объём расчёта не меняются."
        : "Обычно: между поколениями есть пауза 120 мс для более спокойной нагрузки.";
  });
});

window.addEventListener("keydown", (event) => {
  const editingText =
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLSelectElement ||
    event.target instanceof HTMLTextAreaElement;
  if (event.code === "Space" && !editingText) {
    spacePressed = true;
    if (currentView === "editor" && !editorPointer) {
      elements.editorCanvas.style.cursor = "grab";
    }
    event.preventDefault();
  }
  if (currentView === "editor" && !editingText && (event.metaKey || event.ctrlKey)) {
    if (event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redoEditor();
      else undoEditor();
    }
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    spacePressed = false;
    if (currentView === "editor" && !editorPointer) {
      elements.editorCanvas.style.cursor =
        editorTool === "pan" ? "grab" : "crosshair";
    }
  }
});

window.addEventListener("hashchange", routeFromHash);
window.addEventListener("resize", () => {
  if (currentView === "editor") editorNeedsFit = true;
  if (currentView === "simulation") simulationNeedsFit = true;
});

renderTrackLibrary();
renderNetworkEditor();
renderWorkerCountOptions();
fillSimulationTrackSelect();
updateSimulationMetrics();
setSimulationRunningUi(false);
renderSavedRuns();
routeFromHash();
requestAnimationFrame(renderFrame);
