import { useState, useRef, useEffect } from 'react';
import { App } from 'antd';
import { globalStore } from '../store/GlobalStore';
import { processRowAndExecute } from '../services/TransferService';
import { logDB } from '../services/IndexedDBService';
import {
    TRANSFER_EXECUTION_SCOPE,
    isExecutableTransferStatus,
    isSpecialTransferScope
} from '../utils/transferExecutionScope';

const DEFAULT_WORK_UNITS = 1;
const PARALLEL_ROW_LIMIT = 5;

const formatEstimatedSeconds = seconds => {
    const totalSeconds = Math.max(0, Math.round(seconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;
    return hours > 0
        ? `${hours}h ${minutes}m ${remainingSeconds}s`
        : minutes > 0
            ? `${minutes}m ${remainingSeconds}s`
            : `${remainingSeconds}s`;
};

// Reusable hook for transfer logic
const cleanJson = (data) => {
    if (data === null || data === undefined) return null;
    if (typeof data === 'object') return data;
    try {
        const parsed = JSON.parse(data);
        if (typeof parsed === 'object') return parsed;
        if (typeof parsed === 'string') return cleanJson(parsed); // Handle double-stringification
        return parsed;
    } catch (e) {
        return data; // Not JSON, return as is (string)
    }
};

const getStepWorkUnits = (step) => {
    const pageCount = step?.raw?.pages?.length;
    if (Number.isFinite(pageCount) && pageCount > 1) return pageCount;
    return DEFAULT_WORK_UNITS;
};

const getExecutionWorkUnits = (executionLog) => {
    if (!Array.isArray(executionLog) || executionLog.length === 0) {
        return DEFAULT_WORK_UNITS;
    }
    return executionLog.reduce((total, step) => total + getStepWorkUnits(step), 0);
};

const isReliableTimingStatus = status => status === 'Success' || status === 'Warning';

export const useTransferExecution = (definitionData, onStatusChange) => {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [stats, setStats] = useState({ 
        total: 0, 
        processed: 0, 
        success: 0, 
        error: 0, 
        retried: 0,
        errorBreakdown: { ValidationError: 0, Error: 0 },
        successBreakdown: { Success: 0, Warning: 0 }
    });
    const [logs, setLogs] = useState([]);
    const [estimatedTime, setEstimatedTime] = useState(null);
    const [estimatedFinishAt, setEstimatedFinishAt] = useState(null);
    const [executionMode, _setExecutionMode] = useState('sequential');
    const executionModeRef = useRef('sequential');
    const [executionTiming, setExecutionTiming] = useState({
        startedAt: null,
        endedAt: null,
        elapsedMs: 0
    });
    const executionTimingRef = useRef({
        startedAt: null,
        endedAt: null,
        pausedAt: null,
        totalPausedMs: 0
    });
    const estimationRef = useRef({
        processedCount: 0,
        durationAccumulator: 0,
        workUnitsAccumulator: 0,
        remainingMs: null
    });
    const logSessionInitializedRef = useRef(false);
    const [isComplete, setIsComplete] = useState(false);
    const [isStopped, setIsStopped] = useState(false);
    const [excelData, setExcelData] = useState([]);

    const [isPaused, setIsPaused] = useState(false);
    const [isPausing, setIsPausing] = useState(false);
    const isPausingRef = useRef(false);
    const [isStopping, setIsStopping] = useState(false);
    const isStoppingRef = useRef(false);
    const [selectedRowKeys, _setSelectedRowKeys] = useState([]);
    const selectedRowKeysRef = useRef([]);

    const setSelectedRowKeys = (keys) => {
        selectedRowKeysRef.current = keys;
        _setSelectedRowKeys(keys);
        
        // Safe sync: Update the total count whenever the user chooses rows, 
        // but only if we haven't started processing yet to prevent jumping numbers.
        if (!isRunning.current && !loading) {
            setStats(prev => ({ 
                ...prev, 
                total: keys.length,
                processed: 0,
                success: 0,
                error: 0,
                retried: 0,
                successBreakdown: { Success: 0, Warning: 0 },
                errorBreakdown: { ValidationError: 0, Error: 0 }
            }));
            setProgress(0);
        }
    };

    const isRunning = useRef(false);
    const isPausedRef = useRef(false);
    const apiCache = useRef(new Map());
    const allSheetsData = useRef({});
    // Explicit visual metrics for Retry operations
    const [retryState, setRetryState] = useState({ isRetrying: false, total: 0, processed: 0 });
    const retryStateRef = useRef({ isRetrying: false, total: 0, processed: 0 });

    const updateRetryState = (newState) => {
        const payload = { ...retryStateRef.current, ...newState };
        retryStateRef.current = payload;
        setRetryState(payload);
    };

    const setExecutionMode = (mode) => {
        executionModeRef.current = mode;
        _setExecutionMode(mode);
    };

    // Performance Optimization for Huge Arrays (100k+ records)
    const logsStateRef = useRef([]); 
    const lastUpdate = useRef(0);
    const wasRetryContextRef = useRef(false); // Persists retry context across pause/resume
    const executionScopeRef = useRef(TRANSFER_EXECUTION_SCOPE.PENDING);
    const attemptedSpecialScopeKeysRef = useRef(new Set());
    const [isRetryMode, setIsRetryMode] = useState(false); // For UI context-aware labels

    useEffect(() => {
        if (!loading || !executionTimingRef.current.startedAt) return undefined;

        const updateElapsed = () => {
            const timing = executionTimingRef.current;
            setExecutionTiming(prev => ({
                ...prev,
                elapsedMs: Date.now() - timing.startedAt - timing.totalPausedMs
            }));
        };

        updateElapsed();
        const timer = setInterval(updateElapsed, 1000);
        return () => clearInterval(timer);
    }, [loading]);


    // Initialize Data and Populate Queue table
    useEffect(() => {
        const storedData = globalStore.get('excelContent') || {};
        allSheetsData.current = storedData;
        const sheetName = definitionData?.mainSheet;
        if (sheetName && storedData[sheetName]) {
            const data = storedData[sheetName];
            setExcelData(data);
            
            // Transform directly to Pending logs immediately for the summary view
            const initialLogs = data.map((row, index) => {
                return {
                    key: index,
                    id: index + 1,
                    status: 'Pending',
                    message: 'Waiting in queue...',
                    duration: '-',
                    timestamp: '-'
                };
            });
            
            logsStateRef.current = initialLogs;
            setLogs(initialLogs);
            
            const initialKeys = initialLogs.map(l => l.key);
            setSelectedRowKeys(initialKeys); // All checked initially
            
            setStats({ total: initialKeys.length, processed: 0, success: 0, error: 0 });
            setProgress(0);
            setEstimatedTime(null);
            setEstimatedFinishAt(null);
            setIsComplete(false);
            setIsStopped(false);
            // Keep the previous on-disk session recoverable until a new transfer actually starts.
            logSessionInitializedRef.current = false;
        }
    }, [definitionData]);

    const pauseTransfer = () => {
        if (isRunning.current) {
            setIsPausing(true);
            isPausingRef.current = true;
            isRunning.current = false;
            message.info(executionModeRef.current === 'parallel'
                ? 'Pausing transfer... waiting for active rows.'
                : 'Pausing transfer... waiting for current row.');
        }
    };

    const stopTransfer = () => {
        if (isRunning.current) {
            setIsStopping(true);
            isStoppingRef.current = true;
            isRunning.current = false;
            message.info(executionModeRef.current === 'parallel'
                ? 'Stopping transfer... waiting for active rows.'
                : 'Stopping transfer... waiting for current row.');
        } else if (isPaused || isPausedRef.current) {
            isRunning.current = false;
            finishTransfer(true);
            executionScopeRef.current = TRANSFER_EXECUTION_SCOPE.PENDING;
            attemptedSpecialScopeKeysRef.current = new Set();
            wasRetryContextRef.current = false;
            setIsRetryMode(false);
            message.warning('Transfer stopped completely. Use Restart from Scratch to begin again.');
        }
    };

    const resumeTransfer = () => {
        if (isPausedRef.current || isPaused) {
            startTransfer(executionScopeRef.current);
        }
    };

    const resumeTransferWithFailures = () => {
        if (isPausedRef.current || isPaused) {
            startTransfer(TRANSFER_EXECUTION_SCOPE.PENDING_AND_ERRORS, { resetSpecialAttempts: true });
        }
    };

    const getExecutableRows = (scope = TRANSFER_EXECUTION_SCOPE.PENDING) => logsStateRef.current.filter(log => {
        if (!selectedRowKeysRef.current.includes(log.key)) return false;
        if (isSpecialTransferScope(scope) && attemptedSpecialScopeKeysRef.current.has(log.key)) return false;
        return isExecutableTransferStatus(log.status, scope);
    });

    const getRemainingRowCount = (scope = TRANSFER_EXECUTION_SCOPE.PENDING) => logsStateRef.current.filter(log => {
        if (!selectedRowKeysRef.current.includes(log.key)) return false;
        if (log.status === 'Processing') return true;
        if (isSpecialTransferScope(scope) && attemptedSpecialScopeKeysRef.current.has(log.key)) return false;
        return isExecutableTransferStatus(log.status, scope);
    }).length;

    const finishTransfer = (stopped = false) => {
        const endedAt = Date.now();
        const timing = executionTimingRef.current;
        const currentPauseMs = timing.pausedAt ? endedAt - timing.pausedAt : 0;
        executionTimingRef.current.endedAt = endedAt;
        setExecutionTiming(prev => ({
            ...prev,
            endedAt,
            elapsedMs: prev.startedAt
                ? endedAt - prev.startedAt - timing.totalPausedMs - currentPauseMs
                : 0
        }));
        setLoading(false);
        setIsPaused(false);
        isPausedRef.current = false;
        setIsComplete(true);
        setIsStopped(stopped);
        updateRetryState({ isRetrying: false });
        if (onStatusChange) onStatusChange(false);
    };

    const syncGlobalStats = () => {
        const allLogs = logsStateRef.current;
        const selectedKeys = selectedRowKeysRef.current || [];

        // Only count rows that are selected OR have already been processed in this session
        const activeLogs = allLogs.filter(l => 
            l.status !== 'Pending' || selectedKeys.includes(l.key)
        );

        const total = activeLogs.length;
        const processed = activeLogs.filter(l => l.status !== 'Pending' && l.status !== 'Processing').length;
        const success = activeLogs.filter(l => l.status === 'Success' || l.status === 'Warning').length;
        const error = activeLogs.filter(l => l.status === 'Error' || l.status === 'ValidationError').length;

        const successBreakdown = {
            Success: activeLogs.filter(l => l.status === 'Success').length,
            Warning: activeLogs.filter(l => l.status === 'Warning').length
        };
        const errorBreakdown = {
            ValidationError: activeLogs.filter(l => l.status === 'ValidationError').length,
            Error: activeLogs.filter(l => l.status === 'Error').length
        };

        setStats(prev => ({
            ...prev,
            total,
            processed,
            success,
            error,
            successBreakdown,
            errorBreakdown
        }));

        if (total > 0) {
            setProgress(Math.round((processed / total) * 100));
        } else {
            setProgress(0);
        }
    };

    const startTransfer = async (scope = TRANSFER_EXECUTION_SCOPE.PENDING, options = {}) => {
        const isResuming = isPausedRef.current || isPaused;
        const isRetryContext = scope === TRANSFER_EXECUTION_SCOPE.RETRY;
        const includesFailedRows = scope === TRANSFER_EXECUTION_SCOPE.PENDING_AND_ERRORS;
        const scopeChanged = executionScopeRef.current !== scope;
        if (!isResuming || scopeChanged || options.resetSpecialAttempts === true) {
            attemptedSpecialScopeKeysRef.current = new Set();
        }
        executionScopeRef.current = scope;
        wasRetryContextRef.current = isRetryContext;
        setIsRetryMode(isRetryContext);

        const pendingRows = getExecutableRows(scope);

        if (pendingRows.length === 0) {
            if (isResuming) {
                finishTransfer();
                wasRetryContextRef.current = false;
                setIsRetryMode(false);
                message.info('Transfer already completed. No rows left to resume.');
            } else {
                message.warning('No entries match execution criteria.');
            }
            return;
        }

        if (!isResuming) {
            const startedAt = Date.now();
            if (!logSessionInitializedRef.current) {
                try {
                    await logDB.clearAll({
                        projectName: definitionData?.projectName || 'Unnamed Project',
                        transactionType: definitionData?.transactionType || 'N/A',
                        deployAgent: definitionData?.deployAgent || 'N/A',
                        flowName: definitionData?.flowName,
                        formName: definitionData?.formName,
                        flowDocumentName: definitionData?.flowDocumentName,
                        startingEventCode: definitionData?.startingEventCode,
                        mainIdColumn: definitionData?.mainIdColumn,
                        mainSheet: definitionData?.mainSheet,
                        fileName: definitionData?.fileName,
                        transferStartedAt: new Date(startedAt).toLocaleString()
                    });
                    logSessionInitializedRef.current = true;
                } catch (error) {
                    message.error(`Transfer log could not be initialized: ${error.message}`);
                    return;
                }
            }
            executionTimingRef.current = {
                startedAt,
                endedAt: null,
                pausedAt: null,
                totalPausedMs: 0
            };
            estimationRef.current = {
                processedCount: 0,
                durationAccumulator: 0,
                workUnitsAccumulator: 0,
                remainingMs: null
            };
            setExecutionTiming({ startedAt, endedAt: null, elapsedMs: 0 });
            setEstimatedTime(null);
            setEstimatedFinishAt(null);
            apiCache.current = new Map();
        } else {
            const resumedAt = Date.now();
            const timing = executionTimingRef.current;
            if (timing.pausedAt) {
                timing.totalPausedMs += resumedAt - timing.pausedAt;
            }
            timing.pausedAt = null;
            timing.endedAt = null;
            setExecutionTiming(prev => ({
                ...prev,
                endedAt: null,
                elapsedMs: prev.startedAt
                    ? resumedAt - prev.startedAt - timing.totalPausedMs
                    : 0
            }));
            if (Number.isFinite(estimationRef.current.remainingMs)) {
                setEstimatedFinishAt(resumedAt + estimationRef.current.remainingMs);
            }
        }

        setLoading(true);
        if (onStatusChange) onStatusChange(true);
        isRunning.current = true;
        setIsComplete(false);
        setIsStopped(false);
        setIsStopping(false);
        isStoppingRef.current = false;
        setIsPausing(false);
        isPausingRef.current = false;

        if (!isResuming && !isRetryContext) {
            updateRetryState({ isRetrying: false, total: 0, processed: 0 });
        }
        setIsPaused(false);
        isPausedRef.current = false;

        const rowConcurrency = executionModeRef.current === 'parallel'
            ? Math.min(PARALLEL_ROW_LIMIT, pendingRows.length)
            : 1;

        let autoPauseReason = null;
        const requestAutoPauseForConnectivity = reason => {
            if (autoPauseReason) return;
            autoPauseReason = reason || 'CSP ortam baglantisi koptu.';
            setIsPausing(true);
            isPausingRef.current = true;
            isRunning.current = false;
            message.warning('CSP ortam baglantisi koptu. Transfer otomatik olarak duraklatiliyor; baglantiyi duzeltip Resume Pending + Failed ile devam edin.');
        };

        const updateEstimatedTimeFromWork = () => {
            const estimation = estimationRef.current;
            if (estimation.processedCount === 0) return;

            const avgMillisPerWorkUnit = estimation.durationAccumulator
                / Math.max(estimation.workUnitsAccumulator, DEFAULT_WORK_UNITS);
            const avgWorkUnitsPerRow = estimation.workUnitsAccumulator / estimation.processedCount;
            const remainingRows = getRemainingRowCount(scope);
            const remainingWorkUnits = remainingRows * avgWorkUnitsPerRow;
            const remainingMs = (avgMillisPerWorkUnit * remainingWorkUnits) / rowConcurrency;
            const estSecs = remainingMs / 1000;
            estimation.remainingMs = remainingMs;

            if (remainingRows > 0) {
                setEstimatedTime(formatEstimatedSeconds(estSecs));
                setEstimatedFinishAt(Date.now() + Math.max(0, remainingMs));
            } else {
                estimation.remainingMs = 0;
                setEstimatedTime('0s');
                setEstimatedFinishAt(Date.now());
            }
        };

        const refreshExecutionState = (force = false) => {
            if (force || isRetryContext || Date.now() - lastUpdate.current > 250) {
                setLogs([...logsStateRef.current]);
                lastUpdate.current = Date.now();
                syncGlobalStats();
            }
        };

        const processLogEntry = async currentLog => {
            const activeLog = logsStateRef.current.find(log => log.key === currentLog.key);
            if (!activeLog) return;

            const rowData = allSheetsData.current[definitionData.mainSheet][currentLog.key];
            const iterStart = Date.now();
            const wasFailedRow = activeLog.status === 'Error' || activeLog.status === 'ValidationError';
            activeLog.status = 'Processing';
            activeLog.message = 'Resolving fields and executing flow...';
            refreshExecutionState(true);
            let detailObj;

            try {
                const result = await processRowAndExecute(rowData, definitionData, globalStore, apiCache.current, allSheetsData.current);
                const duration = Date.now() - iterStart;
                activeLog.workUnits = getExecutionWorkUnits(result.executionLog);

                detailObj = {
                    payload: result.payload,
                    response: cleanJson(result.response),
                    executionLog: (result.executionLog || []).map(step => ({
                        ...step,
                        raw: step.raw ? {
                            ...step.raw,
                            response: cleanJson(step.raw.response)
                        } : undefined
                    })),
                    warnings: result.warnings || []
                };

                activeLog.status = result.status;
                activeLog.message = result.message;
                activeLog.duration = `${duration}ms`;
                activeLog.timestamp = new Date().toLocaleString();
                if (isReliableTimingStatus(activeLog.status)) {
                    estimationRef.current.durationAccumulator += duration;
                    estimationRef.current.workUnitsAccumulator += activeLog.workUnits;
                    estimationRef.current.processedCount += 1;
                }
                if (result.autoPauseTransfer === true) {
                    requestAutoPauseForConnectivity(result.message);
                }
            } catch (err) {
                console.error(err);
                const duration = Date.now() - iterStart;
                const errMsg = err.message || 'Unknown Error';
                const isValidation = err.isValidationError === true;
                detailObj = {
                    payload: err.failedPayload ? JSON.stringify(err.failedPayload, null, 2) : 'Error constructing payload or executing flow',
                    response: cleanJson(err.rawResponse || errMsg),
                    executionLog: [],
                    warnings: []
                };

                activeLog.status = isValidation ? 'ValidationError' : 'Error';
                activeLog.message = errMsg;
                activeLog.duration = `${duration}ms`;
                activeLog.timestamp = new Date().toLocaleString();
                activeLog.workUnits = getExecutionWorkUnits(detailObj.executionLog);
                if (err.autoPauseTransfer === true) {
                    requestAutoPauseForConnectivity(errMsg);
                }
            }

            try {
                await logDB.saveDetail(currentLog.key, detailObj, { ...activeLog }, rowData);
            } catch (e) {
                console.error('File Log Save Error:', e);
            }

            if (isRetryContext) {
                updateRetryState({ processed: retryStateRef.current.processed + 1 });
            }
            if (isRetryContext || (includesFailedRows && wasFailedRow)) {
                setStats(prev => ({ ...prev, retried: prev.retried + 1 }));
            }
            if (isSpecialTransferScope(scope)) {
                attemptedSpecialScopeKeysRef.current.add(currentLog.key);
            }
            if (isRetryContext) {
                selectedRowKeysRef.current = selectedRowKeysRef.current.filter(key => key !== currentLog.key);
            }

            updateEstimatedTimeFromWork();
            refreshExecutionState();
        };

        syncGlobalStats();

        if (rowConcurrency === 1) {
            for (const currentLog of pendingRows) {
                if (!isRunning.current) break;
                await processLogEntry(currentLog);
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        } else {
            let nextRowIndex = 0;
            const worker = async () => {
                while (isRunning.current) {
                    const currentIndex = nextRowIndex;
                    nextRowIndex += 1;
                    if (currentIndex >= pendingRows.length) return;
                    await processLogEntry(pendingRows[currentIndex]);
                }
            };
            await Promise.all(Array.from({ length: rowConcurrency }, () => worker()));
        }

        refreshExecutionState(true);
        setLoading(false);
        if (onStatusChange) onStatusChange(false);

        const wasStopped = isStoppingRef.current;
        const wasPaused = isPausingRef.current;
        setIsStopping(false);
        isStoppingRef.current = false;
        setIsPausing(false);
        isPausingRef.current = false;
        isRunning.current = false;

        if (wasPaused) {
            const remainingRows = getExecutableRows(scope);
            const canResume = remainingRows.length > 0;

            if (canResume) {
                const pausedAt = Date.now();
                executionTimingRef.current.pausedAt = pausedAt;
                setExecutionTiming(prev => ({
                    ...prev,
                    elapsedMs: prev.startedAt
                        ? pausedAt - prev.startedAt - executionTimingRef.current.totalPausedMs
                        : 0
                }));
                setIsPaused(true);
                isPausedRef.current = true;
                setIsComplete(false);
                if (autoPauseReason) {
                    message.warning(autoPauseReason);
                } else {
                    message.success('Transfer paused successfully.');
                }
            } else {
                finishTransfer();
                wasRetryContextRef.current = false;
                setIsRetryMode(false);
                message.info('Transfer completed before pause. No rows left to resume.');
            }
        } else if (wasStopped) {
            finishTransfer(true);
            executionScopeRef.current = TRANSFER_EXECUTION_SCOPE.PENDING;
            attemptedSpecialScopeKeysRef.current = new Set();
            wasRetryContextRef.current = false;
            setIsRetryMode(false);
            message.warning('Transfer stopped completely. Use Restart from Scratch to begin again.');
        } else {
            finishTransfer();
            message.success('Transfer process completed successfully.');

            if (isRetryContext) {
                updateRetryState({ isRetrying: false });
                setIsRetryMode(false);
                wasRetryContextRef.current = false;
            }
        }
    };

    const moveLog = (dragIndex, dropIndex) => {
        const newLogs = [...logsStateRef.current];
        const item = newLogs[dragIndex];
        newLogs.splice(dragIndex, 1);
        newLogs.splice(dropIndex, 0, item);
        logsStateRef.current = newLogs;
        setLogs(newLogs);
    };

    const resetTransfer = () => {
        logSessionInitializedRef.current = false;
        const resetLogs = logsStateRef.current.map(l => {
            return {
                ...l,
                status: 'Pending',
                message: 'Waiting in queue...',
                duration: '-',
                timestamp: '-'
            };
        });
        logsStateRef.current = resetLogs;
        setLogs(resetLogs);
        setSelectedRowKeys(resetLogs.map(l => l.key));
        setStats({ total: resetLogs.length, processed: 0, success: 0, error: 0 });
        setProgress(0);
        setEstimatedTime(null);
        setEstimatedFinishAt(null);
        executionTimingRef.current = {
            startedAt: null,
            endedAt: null,
            pausedAt: null,
            totalPausedMs: 0
        };
        estimationRef.current = {
            processedCount: 0,
            durationAccumulator: 0,
            workUnitsAccumulator: 0,
            remainingMs: null
        };
        setExecutionTiming({ startedAt: null, endedAt: null, elapsedMs: 0 });
        setIsComplete(false);
        setIsStopped(false);
        isRunning.current = false;
        setLoading(false);
        setIsPaused(false);
        isPausedRef.current = false;
        wasRetryContextRef.current = false;
        executionScopeRef.current = TRANSFER_EXECUTION_SCOPE.PENDING;
        attemptedSpecialScopeKeysRef.current = new Set();
        setIsRetryMode(false);
        updateRetryState({ isRetrying: false, total: 0, processed: 0 });
    };

    const retryFailed = (retrySystem = true, retryValidation = true) => {
        const retryKeys = [];
        logsStateRef.current.forEach(l => {
            const isSys = l.status === 'Error';
            const isVal = l.status === 'ValidationError';
            if ((isSys && retrySystem) || (isVal && retryValidation)) {
                retryKeys.push(l.key);
            }
        });

        if (retryKeys.length === 0) {
            message.warning('No matching errors to retry.');
            return;
        }

        // Update selection without touching row statuses — table stays intact
        selectedRowKeysRef.current = retryKeys;
        setSelectedRowKeys(retryKeys);
        setIsComplete(false);
        updateRetryState({ isRetrying: true, total: retryKeys.length, processed: 0 });

        setTimeout(() => {
            startTransfer(TRANSFER_EXECUTION_SCOPE.RETRY);
        }, 150);
    };

    return {
        loading,
        progress,
        stats,
        logs,
        estimatedTime,
        estimatedFinishAt,
        executionMode,
        setExecutionMode,
        executionTiming,
        isComplete,
        isStopped,
        excelData,
        isPaused,
        selectedRowKeys,
        setSelectedRowKeys,
        startTransfer,
        stopTransfer,
        pauseTransfer,
        resumeTransfer,
        resumeTransferWithFailures,
        moveLog,
        resetTransfer,
        retryFailed,
        getLogDetailsAsync: (key) => logDB.getDetail(key),
        getRowData: (key) => allSheetsData.current[definitionData?.mainSheet]?.[key],
        retryState,
        isRetryMode,
        isStopping,
        isPausing
    };
};
