import { useState, useRef, useEffect } from 'react';
import { App } from 'antd';
import { globalStore } from '../store/GlobalStore';
import { processRowAndExecute } from '../services/TransferService';
import { logDB } from '../services/IndexedDBService';

const MAX_DETAIL_LOGS = 500;

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
    const totalTimeAccumulator = useRef(0);

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
            message.info('Pausing transfer... waiting for current row.');
        }
    };

    const stopTransfer = () => {
        if (isRunning.current) {
            setIsStopping(true);
            isStoppingRef.current = true;
            isRunning.current = false;
            message.info('Stopping transfer... waiting for current row.');
        } else if (isPaused || isPausedRef.current) {
            // If already paused, we can stop immediately as nothing is running
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
        wasRetryContextRef.current = isRetryContext;
        setIsRetryMode(isRetryContext);
        const pendingRows = logsStateRef.current.filter(l => {
            if (!selectedRowKeysRef.current.includes(l.key)) return false;
            if (isRetryContext) return l.status === 'Error' || l.status === 'ValidationError';
            return l.status === 'Pending';
        });

        if (pendingRows.length === 0) {
            message.warning('No entries match execution criteria.');
            return;
        }

        setLoading(true);
        if (onStatusChange) onStatusChange(true);
        isRunning.current = true;
        setIsComplete(false);
        setIsStopping(false);
        isStoppingRef.current = false;
        setIsPausing(false);
        isPausingRef.current = false;

        if (!isPaused && !isRetryContext) {
            apiCache.current = new Map();
            totalTimeAccumulator.current = 0;
            updateRetryState({ isRetrying: false, total: 0, processed: 0 });
        }
        setIsPaused(false);
        isPausedRef.current = false;

        const targetCount = pendingRows.length;
        let sessionProcessedCount = 0; // Local counter for estimated time of current session

        // Sync initial stats
        syncGlobalStats();

        for (let i = 0; i < logsStateRef.current.length; i++) {
            if (!isRunning.current) break;

            const currentLog = logsStateRef.current[i];
            const isRetryTarget = isRetryContext && (currentLog.status === 'Error' || currentLog.status === 'ValidationError');

            if (!selectedRowKeysRef.current.includes(currentLog.key) || (currentLog.status !== 'Pending' && !isRetryTarget)) {
                continue;
            }

            const rowData = allSheetsData.current[definitionData.mainSheet][currentLog.key];
            const iterStart = Date.now();
            let duration = 0;

            const activeLog = logsStateRef.current[i];
            activeLog.status = 'Processing';
            activeLog.message = 'Resolving fields and executing flow...';

            if (isRetryContext || Date.now() - lastUpdate.current > 1000) {
                setLogs([...logsStateRef.current]);
                lastUpdate.current = Date.now();
            }

            try {
                const result = await processRowAndExecute(rowData, definitionData, globalStore, apiCache.current, allSheetsData.current);
                duration = Date.now() - iterStart;
                totalTimeAccumulator.current += duration;

                sessionProcessedCount++;

                if (isRetryContext) {
                    updateRetryState({ processed: retryStateRef.current.processed + 1 });
                    setStats(prev => ({ ...prev, retried: prev.retried + 1 }));
                    selectedRowKeysRef.current = selectedRowKeysRef.current.filter(k => k !== currentLog.key);
                }

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
                    console.error("IndexedDB Save Error:", e);
                }

                activeLog.status = result.status;
                activeLog.message = result.message;
                activeLog.duration = `${duration}ms`;
                activeLog.timestamp = new Date().toLocaleString();

            } catch (err) {
                console.error(err);
                duration = Date.now() - iterStart;
                totalTimeAccumulator.current += duration;

                const errMsg = err.message || 'Unknown Error';
                const isValidation = err.isValidationError === true;
                const failedPayloadData = err.failedPayload ? JSON.stringify(err.failedPayload, null, 2) : 'Error constructing payload or executing flow';
                const errorResponse = err.rawResponse || errMsg;

                const detailObj = {
                    payload: failedPayloadData,
                    response: cleanJson(errorResponse),
                    executionLog: [],
                    warnings: []
                };

                try {
                    await logDB.saveDetail(currentLog.key, detailObj);
                } catch (e) {
                    console.error("IndexedDB Save Error:", e);
                }

                activeLog.status = isValidation ? 'ValidationError' : 'Error';
                activeLog.message = errMsg;
                activeLog.duration = `${duration}ms`;
                activeLog.timestamp = new Date().toLocaleString();

                sessionProcessedCount++;

                if (isRetryContext) {
                    updateRetryState({ processed: retryStateRef.current.processed + 1 });
                    setStats(prev => ({ ...prev, retried: prev.retried + 1 }));
                }
            }

            // Sync UI and Global Stats
            if (isRetryContext || Date.now() - lastUpdate.current > 1000) {
                setLogs([...logsStateRef.current]);
                lastUpdate.current = Date.now();
                syncGlobalStats();
            }

            // Update estimated time based on session progress
            const avgMillis = totalTimeAccumulator.current / Math.max(sessionProcessedCount, 1);
            const remaining = targetCount - sessionProcessedCount;
            const estSecs = (avgMillis * remaining) / 1000;
            if (remaining > 0) {
                const m = Math.floor(estSecs / 60);
                const s = Math.round(estSecs % 60);
                setEstimatedTime(m > 0 ? `${m}m ${s}s` : `${s}s`);
            } else {
                setEstimatedTime('0s');
            }

            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Finalization
        setLogs([...logsStateRef.current]);
        syncGlobalStats();
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
            setIsComplete(true);
            if (wasStopped) {
                message.warning('Transfer completely stopped.');
            } else {
                message.success('Transfer process completed successfully.');
            }

            if (isRetryMode) {
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
