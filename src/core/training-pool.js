function positiveInteger(value, fallback = 1) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function chooseTrainingWorkerCount({
  hardwareConcurrency,
  populationSize,
  requested = "auto",
}) {
  const hardware = positiveInteger(hardwareConcurrency);
  const workItems = positiveInteger(populationSize);
  const automatic = hardware;
  const desired =
    requested === "auto" ? automatic : positiveInteger(requested, automatic);
  return Math.max(1, Math.min(desired, hardware, workItems));
}

export function splitTrainingTasks(tasks, workerCount) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new RangeError("Training tasks cannot be empty.");
  }
  const count = Math.max(
    1,
    Math.min(positiveInteger(workerCount), tasks.length),
  );
  const batches = Array.from({ length: count }, () => []);
  tasks.forEach((task, index) => {
    batches[index % count].push(task);
  });
  return batches;
}

export function createTrainingTaskQueue(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new RangeError("Training tasks cannot be empty.");
  }
  let nextIndex = 0;
  return Object.freeze({
    take() {
      if (nextIndex >= tasks.length) return null;
      const task = tasks[nextIndex];
      nextIndex += 1;
      return task;
    },
    get remaining() {
      return Math.max(0, tasks.length - nextIndex);
    },
  });
}
