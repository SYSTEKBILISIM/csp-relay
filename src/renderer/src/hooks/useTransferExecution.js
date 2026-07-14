import { useState, useRef, useEffect } from 'react';
import { App } from 'antd';
import { globalStore } from '../store/GlobalStore';
import { processRowAndExecute } from '../services/TransferService';
import { logDB } from '../services/IndexedDBService';

const MAX_DETAIL_LOGS = 500;
const DEFAULT_WORK_UNITS = 1;
const PARALLEL_ROW_LIMIT = 4;

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
    const [executionMode, setExecutionMode] = useState('sequential');
    const [executionTiming, setExecutionTiming] = useState({
        startedAt: null,
        endedAt: null,
        elapsedMs: 0
    });
    const executionTimingRef = useRef({ startedAt: null, endedAt: null });
    const [isComplete, setIsComplete] = useState(false);
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

    // Performance Optimization for Huge Arrays (100k+ records)
    const logsStateRef = useRef([]); 
    const lastUpdate = useRef(0);
    const wasRetryContextRef = useRef(false); // Persists retry context across pause/resume
    const [isRetryMode, setIsRetryMode] = useState(false); // For UI context-aware labels

    useEffect(() => {
        if (!loading || !executionTimingRef.current.startedAt) return undefined;

        const updateElapsed = () => {
            setExecutionTiming(prev => ({
                ...prev,
                elapsedMs: Date.now() - executionTimingRef.current.startedAt
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
            setIsComplete(false);
            // Clear IndexedDB for a fresh start
            logDB.clearAll().catch(console.error);
        }
    }, [definitionData]);

    const pauseTransfer = () => {
        if (isRunning.current) {
            setIsPausing(true);
            isPausingRef.current = true;
            isRunning.current = false;
            message.info(executionMode === 'parallel'
                ? 'Pausing transfer... waiting for active rows.'
                : 'Pausing transfer... waiting for current row.');
        }
    };

    const stopTransfer = () => {
        if (isRunning.current) {
            setIsStopping(true);
            isStoppingRef.current = true;
            isRunning.current = false;
            message.info(executionMode === 'parallel'
                ? 'Stopping transfer... waiting for active rows.'
                : 'Stopping transfer... waiting for current row.');
        } else if (isPaused || isPausedRef.current) {
            // If already paused, we can stop immediately as nothing is running
            const endedAt = Date.now();
            executionTimingRef.current.endedAt = endedAt;
            setExecutionTiming(prev => ({
                ...prev,
                endedAt,
                elapsedMs: prev.startedAt ? endedAt - prev.startedAt : 0
            }));
            setIsPaused(false);
            isPausedRef.current = false;
            setLoading(false);
            setIsComplete(true);
            wasRetryContextRef.current = false;
            setIsRetryMode(false);
            message.warning('Transfer completely stopped.');
            if (onStatusChange) onStatusChange(false);
        }
    };

    const resumeTransfer = () => {
        if (isPausedRef.current || isPaused) {
            startTransfer(wasRetryContextRef.current);
        }
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

    const startTransfer = async (isRetryContext = false) => {
        const isResuming = isPausedRef.current || isPaused;
        wasRetryContextRef.current = isRetryContext;
        setIsRetryMode(isRetryContext);

        const pendingRows = logsStateRef.current.filter(log => {
            if (!selectedRowKeysRef.current.includes(log.key)) return false;
            if (isRetryContext) return log.status === 'Error' || log.status === 'ValidationError';
            return log.status === 'Pending';
        });

        if (pendingRows.length === 0) {
            message.warning('No entries match execution criteria.');
            return;
        }

        if (!isResuming) {
            const startedAt = Date.now();
            executionTimingRef.current = { startedAt, endedAt: null };
            setExecutionTiming({ startedAt, endedAt: null, elapsedMs: 0 });
            apiCache.current = new Map();
        } else {
            executionTimingRef.current.endedAt = null;
            setExecutionTiming(prev => ({ ...prev, endedAt: null }));
        }

        setLoading(true);
        if (onStatusChange) onStatusChange(true);
        isRunning.current = true;
        setIsComplete(false);
        setIsStopping(false);
        isStoppingRef.current = false;
        setIsPausing(false);
        isPausingRef.current = false;

        if (!isResuming && !isRetryContext) {
            updateRetryState({ isRetrying: false, total: 0, processed: 0 });
        }
        setIsPaused(false);
        isPausedRef.current = false;

        let sessionProcessedCount = 0;
        let sessionDurationAccumulator = 0;
        let sessionWorkUnitsAccumulator = 0;
        const rowConcurrency = executionMode === 'parallel'
            ? Math.min(PARALLEL_ROW_LIMIT, pendingRows.length)
            : 1;

        const updateEstimatedTimeFromWork = () => {
            if (sessionProcessedCount === 0) return;

            const avgMillisPerWorkUnit = sessionDurationAccumulator / Math.max(sessionWorkUnitsAccumulator, DEFAULT_WORK_UNITS);
            const avgWorkUnitsPerRow = sessionWorkUnitsAccumulator / sessionProcessedCount;
            const remainingRows = Math.max(pendingRows.length - sessionProcessedCount, 0);
            const remainingWorkUnits = remainingRows * avgWorkUnitsPerRow;
            const estSecs = (avgMillisPerWorkUnit * remainingWorkUnits) / (1000 * rowConcurrency);

            if (remainingRows > 0) {
                const minutes = Math.floor(estSecs / 60);
                const seconds = Math.round(estSecs % 60);
                setEstimatedTime(minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`);
            } else {
                setEstimatedTime('0s');
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
            activeLog.status = 'Processing';
            activeLog.message = 'Resolving fields and executing flow...';
            refreshExecutionState(true);

            try {
                const result = await processRowAndExecute(rowData, definitionData, globalStore, apiCache.current, allSheetsData.current);
                const duration = Date.now() - iterStart;
                activeLog.workUnits = getExecutionWorkUnits(result.executionLog);

                const detailObj = {
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

                try {
                    await logDB.saveDetail(currentLog.key, detailObj);
                } catch (e) {
                    console.error('IndexedDB Save Error:', e);
                }

                activeLog.status = result.status;
                activeLog.message = result.message;
                activeLog.duration = `${duration}ms`;
                activeLog.timestamp = new Date().toLocaleString();
                sessionDurationAccumulator += duration;
                sessionWorkUnitsAccumulator += activeLog.workUnits;
            } catch (err) {
                console.error(err);
                const duration = Date.now() - iterStart;
                const errMsg = err.message || 'Unknown Error';
                const isValidation = err.isValidationError === true;
                const detailObj = {
                    payload: err.failedPayload ? JSON.stringify(err.failedPayload, null, 2) : 'Error constructing payload or executing flow',
                    response: cleanJson(err.rawResponse || errMsg),
                    executionLog: [],
                    warnings: []
                };

                try {
                    await logDB.saveDetail(currentLog.key, detailObj);
                } catch (e) {
                    console.error('IndexedDB Save Error:', e);
                }

                activeLog.status = isValidation ? 'ValidationError' : 'Error';
                activeLog.message = errMsg;
                activeLog.duration = `${duration}ms`;
                activeLog.timestamp = new Date().toLocaleString();
                activeLog.workUnits = getExecutionWorkUnits(detailObj.executionLog);
                sessionDurationAccumulator += duration;
                sessionWorkUnitsAccumulator += activeLog.workUnits;
            }

            sessionProcessedCount += 1;
            if (isRetryContext) {
                updateRetryState({ processed: retryStateRef.current.processed + 1 });
                setStats(prev => ({ ...prev, retried: prev.retried + 1 }));
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
            setIsPaused(true);
            isPausedRef.current = true;
            message.success('Transfer paused successfully.');
        } else {
            const endedAt = Date.now();
            executionTimingRef.current.endedAt = endedAt;
            setExecutionTiming(prev => ({
                ...prev,
                endedAt,
                elapsedMs: prev.startedAt ? endedAt - prev.startedAt : 0
            }));
            setIsComplete(true);
            if (wasStopped) {
                message.warning('Transfer completely stopped.');
            } else {
                message.success('Transfer process completed successfully.');
            }

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
        logDB.clearAll().catch(console.error);
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
        executionTimingRef.current = { startedAt: null, endedAt: null };
        setExecutionTiming({ startedAt: null, endedAt: null, elapsedMs: 0 });
        setIsComplete(false);
        isRunning.current = false;
        setLoading(false);
        setIsPaused(false);
        isPausedRef.current = false;
        wasRetryContextRef.current = false;
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
            startTransfer(true);
        }, 150);
    };

    return {
        loading,
        progress,
        stats,
        logs,
        estimatedTime,
        executionMode,
        setExecutionMode,
        executionTiming,
        isComplete,
        excelData,
        isPaused,
        selectedRowKeys,
        setSelectedRowKeys,
        startTransfer,
        stopTransfer,
        pauseTransfer,
        resumeTransfer,
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
