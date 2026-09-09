export const MIN_PARALLEL_WORKER_COUNT = 1;
export const MAX_PARALLEL_WORKER_COUNT = 6;
export const DEFAULT_PARALLEL_WORKER_COUNT = 3;

export const normalizeParallelWorkerCount = value => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return DEFAULT_PARALLEL_WORKER_COUNT;
    return Math.min(
        MAX_PARALLEL_WORKER_COUNT,
        Math.max(MIN_PARALLEL_WORKER_COUNT, Math.round(numericValue))
    );
};

export const getDispatchConcurrency = (executionMode, parallelWorkerCount) =>
    executionMode === 'parallel'
        ? normalizeParallelWorkerCount(parallelWorkerCount)
        : 1;
