import React, { useState, useRef, useEffect } from 'react';
import { Card, Typography, Button, Table, Progress, Tooltip, Modal, Input, Space, Tabs, Tag, Alert, Segmented, Popover, Checkbox, Select, App } from 'antd';
import { PlayCircleOutlined, DownloadOutlined, CheckCircleOutlined, SyncOutlined, CloseCircleOutlined, InfoCircleOutlined, StopOutlined, SearchOutlined, CopyOutlined, FileTextOutlined, PauseCircleOutlined, UnorderedListOutlined, CodeOutlined, CaretUpOutlined, CaretDownOutlined, HolderOutlined, UndoOutlined, ReloadOutlined, RightOutlined, EyeOutlined, FileExcelOutlined, DatabaseOutlined, HistoryOutlined, ExportOutlined, OrderedListOutlined, ThunderboltOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import Editor from '@monaco-editor/react';
import { useTransferExecution } from '../hooks/useTransferExecution';
import { LogDetailsModal, safeJsonFormat, CopyAnimatedButton } from './log/LogDetailsModal';
import { getRowValue } from '../utils/transferUtils';
import { ResizableTitle } from './ResizableTitle';
import { logDB } from '../services/IndexedDBService';
import '../assets/css/TransferExecutionScreen.css';

// Robust Turkish-aware lowercasing with normalization
const turkishLower = (str) => {
    if (!str) return '';
    const s = String(str).normalize('NFC');
    // We do both toLocaleLowerCase AND manual replacement to catch all cases
    return s.toLocaleLowerCase('tr-TR')
        .replace(/İ/g, 'i')
        .replace(/I/g, 'ı')
        .toLowerCase();
};

const HighlightText = ({ text, highlight, isFocused }) => {
    if (!highlight || !text) return <>{text}</>;
    const textStr = String(text);
    const lowText = turkishLower(textStr);
    const lowHighlight = turkishLower(highlight);

    if (!lowText.includes(lowHighlight)) return <>{text}</>;

    const result = [];
    let lastIndex = 0;

    // We use a more careful approach to find indices because casing can change string length
    // But for Turkish İ/i/I/ı, length usually stays 1. 
    // Still, let's use the lowText.indexOf and hope for the best, 
    // but we'll use a sliding window if needed.

    let matchIndex = lowText.indexOf(lowHighlight);
    while (matchIndex !== -1) {
        if (matchIndex > lastIndex) {
            result.push(textStr.substring(lastIndex, matchIndex));
        }

        const matchedPart = textStr.substring(matchIndex, matchIndex + highlight.length);
        result.push(
            <mark key={matchIndex} className={`highlight-mark ${isFocused ? 'highlight-mark-focus' : 'highlight-mark-default'}`}>
                {matchedPart}
            </mark>
        );

        lastIndex = matchIndex + highlight.length;
        matchIndex = lowText.indexOf(lowHighlight, lastIndex);
    }

    if (lastIndex < textStr.length) {
        result.push(textStr.substring(lastIndex));
    }

    return <span className="highlight-text-wrapper">{result}</span>;
};

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

const QUEUE_SELECTION_COLUMN_WIDTH = 28;
const QUEUE_DRAG_COLUMN_WIDTH = 22;

const formatExecutionTime = timestamp => timestamp
    ? {
        date: new Date(timestamp).toLocaleDateString(),
        time: new Date(timestamp).toLocaleTimeString()
    }
    : '-';

const formatElapsedTime = milliseconds => {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return '-';
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
        ? `${hours}h ${minutes}m ${seconds}s`
        : minutes > 0
            ? `${minutes}m ${seconds}s`
            : `${seconds}s`;
};

const ExecutionDateValue = ({ timestamp }) => {
    const value = formatExecutionTime(timestamp);
    if (value === '-') return <span className="execution-time-empty">-</span>;
    return (
        <span className="execution-date-value">
            <span>{value.time}</span>
            <small>{value.date}</small>
        </span>
    );
};


export const TransferExecutionScreen = ({ definitionData, onFinish, onStatusChange }) => {
    const { message } = App.useApp();
    // MVC: Use Custom Hook for Logic
    const {
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
        excelData, // Exposed if needed for UI checks
        isPaused,
        selectedRowKeys,
        setSelectedRowKeys,
        startTransfer,
        stopTransfer,
        pauseTransfer,
        moveLog,
        resetTransfer,
        retryFailed,
        getLogDetailsAsync,
        retryState,
        resumeTransfer,
        isRetryMode,
        getRowData,
        isStopping,
        isPausing
    } = useTransferExecution(definitionData, onStatusChange);

    // View State (Modal & Table Height)
    const [activeTab, setActiveTab] = useState('queue');
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);
    const [previewModalVisible, setPreviewModalVisible] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const tableContainerRef = useRef(null);
    const [tableScrollY, setTableScrollY] = useState(400);
    const [tableViewportWidth, setTableViewportWidth] = useState(0);
    const [searchText, setSearchText] = useState('');
    const [debouncedSearchText, setDebouncedSearchText] = useState('');
    const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
    const searchInputRef = useRef(null);
    const queueTableRef = useRef(null);
    const resultsTableRef = useRef(null);
    const [resultColWidths, setResultColWidths] = useState({
        id: 50,
        status: 150,
        mainId: 140,
        message: 270,
        timestamp: 135,
        duration: 100,
        details: 70
    });
    const [queueColWidths, setQueueColWidths] = useState({
        dragHandle: QUEUE_DRAG_COLUMN_WIDTH,
        id: 50,
        status: 140,
        mainId: 130,
        rowData: 150
    });

    const handleResultResize = key => (e, { size }) => {
        setResultColWidths(prev => ({ ...prev, [key]: Math.max(size.width, key === 'details' ? 60 : 50) }));
    };

    const handleQueueResize = key => (e, { size }) => {
        setQueueColWidths(prev => ({ ...prev, [key]: Math.max(size.width, 50) }));
    };

    const nonResizableColumnKeys = new Set(['dragHandle']);

    // Debounce Search Text to prevent UI freeze on large datasets
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchText(searchText);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchText]);

    // --- Retry Logic ---
    const [retryOptions, setRetryOptions] = useState({ system: true, validation: true });

    // We compute these synchronously from logs
    const countSysErrs = logs.filter(l => l.status === 'Error').length;
    const countValErrs = logs.filter(l => l.status === 'ValidationError').length;
    const totalErrs = countSysErrs + countValErrs;

    const handleRetry = () => {
        setSearchText('');
        setCurrentMatchIndex(-1);
        retryFailed(retryOptions.system, retryOptions.validation);
    };

    const retryPopoverContent = (
        <div className="retry-popover-content">
            <div className="retry-popover-title">Select error types to retry:</div>

            <Checkbox
                checked={retryOptions.system}
                onChange={e => setRetryOptions({ ...retryOptions, system: e.target.checked })}
                disabled={countSysErrs === 0}
            >
                <div className="retry-popover-row">
                    <span className={countSysErrs > 0 ? 'retry-popover-label-sys' : 'retry-popover-label-disabled'}>System Errors</span>
                    <span className="retry-popover-count">({countSysErrs})</span>
                </div>
            </Checkbox>

            <Checkbox
                checked={retryOptions.validation}
                onChange={e => setRetryOptions({ ...retryOptions, validation: e.target.checked })}
                disabled={countValErrs === 0}
            >
                <div className="retry-popover-row">
                    <span className={countValErrs > 0 ? 'retry-popover-label-val' : 'retry-popover-label-disabled'}>Validation Errors</span>
                    <span className="retry-popover-count">({countValErrs})</span>
                </div>
            </Checkbox>

            <Button
                type="primary"
                danger
                onClick={handleRetry}
                disabled={!retryOptions.system && !retryOptions.validation}
                className="retry-popover-btn"
                icon={<PlayCircleOutlined />}
            >
                Start Retry
            </Button>
        </div>
    );

    // Dynamic Table Height
    useEffect(() => {
        if (!tableContainerRef.current) return;
        const updateHeight = () => {
            if (tableContainerRef.current) {
                // Precision adjustment: subtract slightly more header/border height to prevent table bottom clipping
                const height = tableContainerRef.current.clientHeight - 35;
                setTableScrollY(height > 50 ? height : 400);
                setTableViewportWidth(tableContainerRef.current.clientWidth - 5);
            }
        };
        const observer = new ResizeObserver(updateHeight);
        observer.observe(tableContainerRef.current);
        updateHeight();
        return () => observer.disconnect();
    }, []);

    const handleStartTransfer = () => {
        setSearchText('');
        setCurrentMatchIndex(-1);
        setActiveTab('results');
        startTransfer();
    };

    // Prevent closing window during transfer
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (loading) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [loading]);

    const handleExportLogs = async () => {
        if (logs.length === 0) {
            message.warning('No logs to export.');
            return;
        }

        message.loading({ content: 'Preparing logs for export. This may take a while for large datasets...', key: 'exportLogs', duration: 0 });

        try {
            // Using a timeout to allow the loading message to render before blocking the thread with the loop/xlsx
            await new Promise(resolve => setTimeout(resolve, 50));

            if (!definitionData) {
                throw new Error("Definition data is missing. Please restart the process.");
            }

            const exportData = [];
            for (const l of logs) {
                if (l.status === 'Pending') continue;

                let details = {};
                try {
                    details = await getLogDetailsAsync(l.key) || {};
                } catch (dbErr) {
                    console.error('Failed to get details for log:', l.key, dbErr);
                    // Continue with empty details
                }

                const rowData = getRowData(l.key) || {};
                const mainIdKey = definitionData?.mainIdColumn || 'ID';

                exportData.push({
                    "#": l.id,
                    Status: l.status,
                    [mainIdKey]: getRowValue(rowData, mainIdKey) || '-',
                    Message: l.message,
                    Timestamp: l.timestamp,
                    Duration: l.duration,
                    "Preview Data": rowData ? JSON.stringify(rowData) : '',
                    Payload: details.payload ? (typeof details.payload === 'object' ? JSON.stringify(details.payload, null, 2) : details.payload) : '',
                    Response: details.response ? (typeof details.response === 'object' ? JSON.stringify(details.response, null, 2) : details.response) : '',
                    OperationTree: details.executionLog ? details.executionLog.map(step => `[${step.status}] ${step.step} - ${step.details}`).join(' | ') : ''
                });
            }

            if (exportData.length === 0) {
                message.warning({ content: 'No processed logs to export.', key: 'exportLogs' });
                return;
            }

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "TransferLogs");
            XLSX.writeFile(wb, `TransferLogs_${Date.now()}.xlsx`);
            message.success({ content: 'Logs exported successfully.', key: 'exportLogs' });
        } catch (error) {
            console.error('Export Error:', error);
            message.error({ content: `Failed to export logs: ${error.message}`, key: 'exportLogs', duration: 4 });
        }
    };

    const handleExportFullJSON = async () => {
        if (logs.length === 0) {
            message.warning('No logs to export.');
            return;
        }

        message.loading({ content: 'Preparing the file-backed transfer log...', key: 'exportJson', duration: 0 });

        try {
            if (!definitionData) {
                throw new Error("Definition data is missing. Please restart the process.");
            }

            if (!logs.some(log => log.status !== 'Pending' && log.status !== 'Processing')) {
                message.warning({ content: 'No processed logs to export.', key: 'exportJson' });
                return;
            }

            const metadata = {
                projectName: definitionData?.projectName || 'Unnamed Project',
                transactionType: definitionData?.transactionType || 'N/A',
                deployAgent: definitionData?.deployAgent || 'N/A',
                flowName: definitionData?.flowName,
                formName: definitionData?.formName,
                flowDocumentName: definitionData?.flowDocumentName,
                startingEventCode: definitionData?.startingEventCode,
                mainSheet: definitionData?.mainSheet,
                fileName: definitionData?.fileName,
                stats
            };
            const safeProjectName = String(definitionData?.projectName || 'export').replace(/[<>:"/\\|?*]/g, '_');
            const result = await logDB.exportJson(metadata, `Full_Transfer_Logs_${safeProjectName}_${Date.now()}.json`);
            if (result?.canceled) {
                message.info({ content: 'Log export canceled.', key: 'exportJson' });
                return;
            }
            if (!result?.success) throw new Error(result?.error || 'The log file could not be exported.');
            message.success({ content: `Transfer logs exported to ${result.filePath}`, key: 'exportJson', duration: 5 });
        } catch (error) {
            console.error('JSON Export Error:', error);
            message.error({ content: `Failed to export JSON: ${error.message}`, key: 'exportJson', duration: 4 });
        }
    };

    const getColumnSearchProps = (dataIndex) => ({
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
            <div style={{ padding: 8 }}>
                <Input
                    placeholder={`Search ${dataIndex}`}
                    value={selectedKeys[0]}
                    onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
                    onPressEnter={() => confirm()}
                    style={{ marginBottom: 8, display: 'block' }}
                />
                <Space>
                    <Button
                        type="primary"
                        onClick={() => confirm()}
                        icon={<SearchOutlined />}
                        size="small"
                        style={{ width: 90 }}
                    >Search</Button>
                    <Button onClick={() => clearFilters()} size="small" style={{ width: 90 }}>Reset</Button>
                </Space>
            </div>
        ),
        filterIcon: filtered => <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />,
        onFilter: (value, record) => record[dataIndex] ? turkishLower(record[dataIndex]).includes(turkishLower(value)) : false,
    });

    const handleExportSingleLog = (log) => {
        if (!log) return;
        const dataStr = JSON.stringify(log, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `TransferRequest_${log.id}_Logs.json`;
        link.click();
        URL.revokeObjectURL(url);
        message.success(`Request #${log.id} logs exported.`);
    };

    const StableCell = ({ children, style = {} }) => (
        <div className="stable-cell" style={style}>
            {children}
        </div>
    );

    const TruncatedText = ({ text, highlight, isFocused }) => {
        const value = text ?? '-';
        return (
            <Tooltip placement="topLeft" title={String(value)}>
                <span className="cell-ellipsis">
                    <HighlightText text={value} highlight={highlight} isFocused={isFocused} />
                </span>
            </Tooltip>
        );
    };

    const makeResizableColumns = (tableColumns, widths, onResize) => tableColumns.map(col => {
        if (col === Table.SELECTION_COLUMN) return col;
        const key = col.key || col.dataIndex;
        const width = widths[key] ?? col.width;
        const nextColumn = {
            ...col,
            width
        };
        if (nonResizableColumnKeys.has(key)) {
            return nextColumn;
        }
        return {
            ...nextColumn,
            onHeaderCell: column => ({
                width: column.width,
                onResize: onResize(key)
            })
        };
    });

    const fitColumnWidthsToViewport = (widths, extraWidth = 0) => {
        const entries = Object.entries(widths);
        const totalWidth = entries.reduce((sum, [, width]) => sum + width, 0);
        const availableWidth = tableViewportWidth - extraWidth;

        if (availableWidth <= 0 || totalWidth <= availableWidth) return widths;

        const scale = availableWidth / totalWidth;
        const fittedWidths = Object.fromEntries(
            entries.map(([key, width]) => [key, Math.max(key === 'details' ? 60 : 50, Math.floor(width * scale))])
        );
        const fittedTotal = Object.values(fittedWidths).reduce((sum, width) => sum + width, 0);

        // Give rounding differences to the flexible content column so the table
        // finishes exactly at the visible right edge.
        if (fittedWidths.message && fittedWidths.message + availableWidth - fittedTotal >= 50) {
            fittedWidths.message += availableWidth - fittedTotal;
        } else if (fittedWidths.rowData && fittedWidths.rowData + availableWidth - fittedTotal >= 50) {
            fittedWidths.rowData += availableWidth - fittedTotal;
        }

        return fittedWidths;
    };

    const getScrollConfig = (widths, rowCount, extraWidth = 0) => {
        if (rowCount === 0) return undefined;
        return {
            x: Math.max(Object.values(widths).reduce((sum, width) => sum + width, 0) + extraWidth, tableViewportWidth),
            y: tableScrollY
        };
    };

    const fittedResultColWidths = fitColumnWidthsToViewport(resultColWidths);
    const fittedQueueColWidths = fitColumnWidthsToViewport(queueColWidths, QUEUE_SELECTION_COLUMN_WIDTH);



    const columns = [
        {
            title: <span className="table-header-sm">#</span>,
            key: 'id',
            dataIndex: 'id',
            sorter: (a, b) => a.id - b.id,
            render: (text, record) => (
                <StableCell style={{ color: '#64748b' }}>
                    <TruncatedText text={text} highlight={debouncedSearchText} isFocused={matches.length > 0 && record.key === matches[currentMatchIndex]} />
                </StableCell>
            )
        },
        {
            title: <span className="table-header-sm">Status</span>,
            key: 'status',
            dataIndex: 'status',
            filters: [{ text: 'Success', value: 'Success' }, { text: 'Warning', value: 'Warning' }, { text: 'Error', value: 'Error' }, { text: 'Validation Error', value: 'ValidationError' }, { text: 'Processing', value: 'Processing' }],
            onFilter: (value, record) => record.status === value,
            render: (status, record) => {
                const isFocused = matches.length > 0 && record.key === matches[currentMatchIndex];
                const displayStatus = status === 'ValidationError' ? 'Validation Error' : status;
                return (
                    <StableCell style={{ color: status === 'Success' ? '#16a34a' : status === 'Warning' ? '#f59e0b' : status === 'Processing' ? '#3b82f6' : status === 'ValidationError' ? '#e11d48' : '#dc2626', fontWeight: 600, gap: 6 }}>
                        <div style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'start', flexShrink: 0 }}>
                            {status === 'Success' ? <CheckCircleOutlined /> : status === 'Warning' ? <InfoCircleOutlined /> : status === 'Processing' ? <SyncOutlined spin /> : <CloseCircleOutlined />}
                        </div>
                        <TruncatedText text={displayStatus} highlight={debouncedSearchText} isFocused={isFocused} />
                    </StableCell>
                );
            }
        },
        {
            title: <span className="table-header-sm">{definitionData.mainIdColumn || 'ID'}</span>,
            key: 'mainId',
            render: (_, record) => {
                const rowData = getRowData(record.key) || {};
                const idVal = getRowValue(rowData, definitionData.mainIdColumn);
                const isFocused = matches.length > 0 && record.key === matches[currentMatchIndex];
                return (
                    <StableCell style={{ fontWeight: 600, color: '#1e293b' }}>
                        <TruncatedText text={idVal || '-'} highlight={debouncedSearchText} isFocused={isFocused} />
                    </StableCell>
                );
            }
        },
        {
            title: <span className="table-header-sm">Message</span>,
            key: 'message',
            dataIndex: 'message',
            sorter: (a, b) => a.message.localeCompare(b.message),
            ...getColumnSearchProps('message'),
            ellipsis: { showTitle: false },
            render: (v, record) => <StableCell><TruncatedText text={v} highlight={debouncedSearchText} isFocused={matches.length > 0 && record.key === matches[currentMatchIndex]} /></StableCell>
        },
        {
            title: <span className="table-header-sm">Timestamp</span>,
            key: 'timestamp',
            dataIndex: 'timestamp',
            sorter: (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
            render: (text) => <StableCell style={{ fontSize: '11px', color: '#94a3b8' }}><TruncatedText text={text} /></StableCell>
        },
        {
            title: <span className="table-header-sm">Duration</span>,
            key: 'duration',
            dataIndex: 'duration',
            align: 'right',
            sorter: (a, b) => parseInt(a.duration) - parseInt(b.duration),
            render: (text) => <StableCell style={{ justifyContent: 'flex-end', width: '100%' }}><TruncatedText text={text} /></StableCell>
        },
        {
            title: <span className="table-header-sm">Details</span>,
            key: 'details',
            width: 70,
            align: 'center',
            render: (_, record) => {
                return (
                    <StableCell style={{ justifyContent: 'center', width: '100%' }}>
                        <Tooltip title="View Details">
                            <Button
                                size="small"
                                style={{
                                    fontSize: '12px',
                                    height: 24,
                                    padding: '0 8px'
                                }}
                                icon={<InfoCircleOutlined />}
                                onClick={async () => {
                                    let details = {};
                                    try {
                                        details = await getLogDetailsAsync(record.key) || {};
                                    } catch (err) {
                                        console.error("Log Details Load Error (Falling back to record data):", err);
                                    }
                                    setSelectedLog({ ...record, ...details });
                                    setModalVisible(true);
                                }}
                            />
                        </Tooltip>
                    </StableCell>
                );
            }
        }
    ];

    const queueColumns = [
        {
            title: '',
            dataIndex: 'dragHandle',
            key: 'dragHandle',
            className: 'queue-drag-column',
            align: 'center',
            onHeaderCell: () => ({ className: 'queue-drag-column' }),
            render: (_, record) => {
                const isLocked = loading || record.status !== 'Pending';
                return (
                    <StableCell style={{ justifyContent: 'center', padding: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isLocked ? 0.4 : 1 }}>
                            <HolderOutlined style={{ color: '#94a3b8', fontSize: 13, cursor: isLocked ? 'not-allowed' : 'grab' }} title={isLocked ? "Locked - Cannot drag processed row" : "Drag to reorder"} />
                        </div>
                    </StableCell>
                );
            }
        },
        Table.SELECTION_COLUMN,
        {
            title: <span className="table-header-sm">#</span>,
            dataIndex: 'id',
            key: 'id',
            render: (text, record) => (
                <StableCell style={{ color: '#64748b', fontWeight: 600 }}>
                    <TruncatedText text={text} highlight={debouncedSearchText} isFocused={matches.length > 0 && record.key === matches[currentMatchIndex]} />
                </StableCell>
            )
        },
        {
            title: <span className="table-header-sm">Status</span>,
            dataIndex: 'status',
            key: 'status',
            filters: [{ text: 'Success', value: 'Success' }, { text: 'Warning', value: 'Warning' }, { text: 'Error', value: 'Error' }, { text: 'Validation Error', value: 'ValidationError' }, { text: 'Pending', value: 'Pending' }, { text: 'Processing', value: 'Processing' }],
            onFilter: (value, record) => record.status === value,
            render: (status, record) => {
                const isFocused = matches.length > 0 && record.key === matches[currentMatchIndex];
                const displayStatus = status === 'ValidationError' ? 'Validation Error' : status;
                return (
                    <StableCell style={{ color: status === 'Success' ? '#16a34a' : status === 'Warning' ? '#f59e0b' : status === 'Pending' ? '#94a3b8' : status === 'Processing' ? '#3b82f6' : status === 'ValidationError' ? '#e11d48' : '#dc2626', fontWeight: 600, gap: 6 }}>
                        <div style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {status === 'Success' ? <CheckCircleOutlined /> : status === 'Warning' ? <InfoCircleOutlined /> : status === 'Processing' ? <SyncOutlined spin /> : status === 'Pending' ? <FileTextOutlined /> : <CloseCircleOutlined />}
                        </div>
                        <TruncatedText text={displayStatus} highlight={debouncedSearchText} isFocused={isFocused} />
                    </StableCell>
                );
            }
        },
        {
            title: <span className="table-header-sm">{definitionData.mainIdColumn || 'ID'}</span>,
            key: 'mainId',
            render: (_, record) => {
                const rowData = getRowData(record.key) || {};
                const idVal = getRowValue(rowData, definitionData.mainIdColumn);
                const isFocused = matches.length > 0 && record.key === matches[currentMatchIndex];
                return (
                    <StableCell style={{ fontWeight: 600, color: '#1e293b' }}>
                        <TruncatedText text={idVal || '-'} highlight={debouncedSearchText} isFocused={isFocused} />
                    </StableCell>
                );
            }
        },
        {
            title: <span className="table-header-sm">Preview Data</span>,
            dataIndex: 'rowData',
            key: 'rowData',
            render: (_, record) => {
                const rowData = getRowData(record.key) || {};
                const isDetailMatch = debouncedSearchText && Object.entries(rowData).some(([k, v]) =>
                    String(k).toLowerCase().includes(debouncedSearchText.toLowerCase()) ||
                    String(v).toLowerCase().includes(debouncedSearchText.toLowerCase())
                );
                const isFocused = matches.length > 0 && record.key === matches[currentMatchIndex];

                return (
                    <StableCell>
                        <Button
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={(e) => { e.stopPropagation(); setPreviewData(rowData); setPreviewModalVisible(true); }}
                            className={`show-data-btn ${isDetailMatch ? (isFocused ? 'match-focus' : 'match-active') : ''}`}
                        >
                            {isDetailMatch ? 'Show Match' : 'Show Data'}
                        </Button>
                    </StableCell>
                );
            }
        }
    ];

    const computedResultLogs = React.useMemo(() =>
        logs.filter(l => l.status !== 'Pending').reverse()
        , [logs]);

    const matches = React.useMemo(() => {
        if (!debouncedSearchText) return [];
        const lowSearch = turkishLower(debouncedSearchText);
        const currentData = activeTab === 'queue' ? logs : computedResultLogs;

        return currentData
            .filter(item => {
                const rowData = getRowData(item.key) || {};
                const idVal = turkishLower(getRowValue(rowData, definitionData.mainIdColumn) || '');

                // 1. Check basic functional fields ONLY (Exclude technical fields)
                if (
                    turkishLower(item.id).includes(lowSearch) ||
                    turkishLower(item.status || '').includes(lowSearch) ||
                    turkishLower(item.message || '').includes(lowSearch) ||
                    idVal.includes(lowSearch)
                ) return true;

                // 2. Check all Excel data fields (Content provided by user)
                return Object.values(rowData).some(val =>
                    val !== null && val !== undefined && turkishLower(val).includes(lowSearch)
                );
            })
            .map(item => item.key);
    }, [logs, computedResultLogs, debouncedSearchText, definitionData.mainIdColumn, activeTab]);

    useEffect(() => {
        if (matches.length > 0) {
            setCurrentMatchIndex(0);
            performJump(0);
        } else {
            setCurrentMatchIndex(-1);
        }
    }, [matches.length, activeTab]);

    const performJump = (idx) => {
        const currentData = activeTab === 'queue' ? logs : computedResultLogs;
        const visualIdx = currentData.findIndex(item => item.key === matches[idx]);
        if (visualIdx !== -1) {
            const activeRef = activeTab === 'queue' ? queueTableRef : resultsTableRef;
            if (activeRef.current) {
                activeRef.current.scrollTo({ index: visualIdx, align: 'top' });
            }
        }
    };

    const handleJumpNavigate = (direction) => {
        if (matches.length === 0) return;
        let nextIdx = currentMatchIndex + direction;
        if (nextIdx >= matches.length) nextIdx = 0;
        if (nextIdx < 0) nextIdx = matches.length - 1;
        setCurrentMatchIndex(nextIdx);
        performJump(nextIdx);
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const isLiveModeRef = useRef(true);
    const lastScrollHeightRef = useRef(0);
    const lastScrollTopRef = useRef(0);

    const handleResultsScroll = (e) => {
        const scrollTop = e.target.scrollTop;
        if (scrollTop <= 2) {
            isLiveModeRef.current = true;
        }
        lastScrollTopRef.current = scrollTop;
        lastScrollHeightRef.current = e.target.scrollHeight;
    };

    const handleUserInteraction = (e) => {
        const isDragging = e.type === 'mousedown';
        const isScrollingDown = e.type === 'wheel' && e.deltaY > 0;
        const isKeyMovingDown = e.type === 'keydown' && (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ');

        if (isDragging || isScrollingDown || isKeyMovingDown) {
            isLiveModeRef.current = false;
        }
    };

    React.useLayoutEffect(() => {
        const holder = document.querySelector('.results-table-container .ant-table-tbody-virtual-holder, .results-table-container .rc-virtual-list-holder');
        if (!holder) return;

        if (isLiveModeRef.current) {
            holder.scrollTop = 0;
            requestAnimationFrame(() => { holder.scrollTop = 0; });
        } else {
            const newHeight = holder.scrollHeight;
            const delta = newHeight - lastScrollHeightRef.current;
            if (delta > 0) {
                holder.scrollTop = lastScrollTopRef.current + delta;
            }
        }
        lastScrollHeightRef.current = holder.scrollHeight;
        lastScrollTopRef.current = holder.scrollTop;
    }, [computedResultLogs]);

    const rowSelection = {
        columnWidth: QUEUE_SELECTION_COLUMN_WIDTH,
        selectedRowKeys,
        onChange: (newSelectedRowKeys) => {
            if (loading || isPaused) {
                message.warning("Row selection is locked while transfer is active/paused.");
                return;
            }
            setSelectedRowKeys(newSelectedRowKeys);
        },
        getCheckboxProps: (record) => ({
            disabled: loading || record.status !== 'Pending',
        }),
    };

    const onQueueRow = (record, index) => {
        const isLocked = record.status !== 'Pending';

        if (loading || isLocked) {
            return {
                style: { cursor: 'not-allowed' }
            };
        }

        return {
            draggable: true,
            style: { cursor: 'grab' },
            onDragStart: (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('dragIndex', index);
            },
            onDragOver: (e) => {
                e.preventDefault();
            },
            onDrop: (e) => {
                e.preventDefault();
                const dragIndex = Number(e.dataTransfer.getData('dragIndex'));
                if (dragIndex === index || isNaN(dragIndex)) return;

                if (logs[index].status !== 'Pending') {
                    message.warning("You cannot place un-processed rows above or between already processed ones.");
                    return;
                }

                moveLog(dragIndex, index);
            }
        };
    };

    const showTransferIndicator = loading || isPaused || retryState.isRetrying;
    const isTransferActive = loading || retryState.isRetrying;

    return (
        <Card variant="borderless" className="exec-container" styles={{ body: { padding: '16px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' } }}>
            <div className="exec-header">
                <div className="exec-header-copy">
                    <Title level={3}>
                        {isComplete ? 'Transfer Completed' : 'Queue Details & Transfer'}
                    </Title>
                    <Text type="secondary">Review summary rows and configure process execution</Text>
                </div>
                <Segmented
                    className="execution-mode-header"
                    value={executionMode}
                    onChange={setExecutionMode}
                    disabled={loading && !isPausing && !isStopping}
                    options={[
                        {
                            value: 'sequential',
                            label: <Tooltip title="Synchronous: Processes Excel rows one by one in their queue order"><OrderedListOutlined /></Tooltip>
                        },
                        {
                            value: 'parallel',
                            label: <Tooltip title="Asynchronous: Processes up to 5 independent rows at the same time"><ThunderboltOutlined /></Tooltip>
                        }
                    ]}
                />
            </div>

            <Card className="exec-stats-wrapper" styles={{ body: { padding: '18px 22px' } }}>
                <div className="execution-stats-layout">
                    <div className="exec-stats-circle">
                        <Progress
                            type="circle"
                            percent={progress}
                            size={108}
                            strokeWidth={6}
                            strokeColor={progress === 100 ? '#10b981' : '#3b82f6'}
                            trailColor="#e8eef6"
                        />
                    </div>
                    <div className="execution-counts-grid">
                        <div className="execution-count-item count-processed">
                            <div className="execution-count-label">
                                <span>Processed</span>
                                {retryState.isRetrying && (
                                    <div className="retry-badge">
                                        <SyncOutlined spin style={{ fontSize: 9 }} />
                                        Retry {retryState.processed}/{retryState.total}
                                    </div>
                                )}
                            </div>
                            <div className="execution-count-value">
                                {showTransferIndicator && (
                                    <span className={isTransferActive ? 'transfer-activity-loader is-active' : 'transfer-activity-loader'} aria-hidden="true">
                                        <span />
                                        <span />
                                        <span />
                                    </span>
                                )}{' '}
                                {stats.processed} / {stats.total}
                            </div>
                        </div>
                        <div className="execution-count-item count-success">
                            <div className="execution-count-label">Success</div>
                                <Tooltip
                                    title={
                                        <div className="stats-tooltip-container">
                                            <div className="stats-tooltip-title">
                                                Success Breakdown
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <div className="stats-breakdown-row">
                                                    <span style={{ color: '#86efac' }}>Success:</span>
                                                    <span style={{ fontWeight: 500 }}>{stats.successBreakdown?.Success || 0}</span>
                                                </div>
                                                <div className="stats-breakdown-row">
                                                    <span style={{ color: '#fcd34d' }}>Warnings:</span>
                                                    <span style={{ fontWeight: 500 }}>{stats.successBreakdown?.Warning || 0}</span>
                                                </div>
                                            </div>
                                        </div>
                                    }
                                    placement="bottomLeft"
                                    arrow={true}
                                >
                                    <div className="execution-count-value stats-help-cursor"><CheckCircleOutlined /> {stats.success}</div>
                                </Tooltip>
                        </div>
                        <div className="execution-count-item count-failed">
                            <div className="execution-count-label">Failed</div>
                                <Tooltip
                                    title={
                                        <div className="stats-tooltip-container">
                                            <div className="stats-tooltip-title">
                                                Failure Breakdown
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <div className="stats-breakdown-row">
                                                    <span style={{ color: '#fca5a5' }}>System Errors:</span>
                                                    <span style={{ fontWeight: 500 }}>{stats.errorBreakdown?.Error || 0}</span>
                                                </div>
                                                <div className="stats-breakdown-row">
                                                    <span style={{ color: '#fca5a5' }}>Validation Errors:</span>
                                                    <span style={{ fontWeight: 500 }}>{stats.errorBreakdown?.ValidationError || 0}</span>
                                                </div>
                                                <div className="stats-breakdown-total">
                                                    <span style={{ color: '#7dd3fc' }}>Total Retried:</span>
                                                    <span style={{ fontWeight: 500, color: '#7dd3fc' }}>{stats.retried || 0}</span>
                                                </div>
                                            </div>
                                        </div>
                                    }
                                    placement="bottomLeft"
                                    arrow={true}
                                >
                                    <div className="execution-count-value stats-help-cursor"><CloseCircleOutlined /> {stats.error}</div>
                                </Tooltip>
                        </div>
                    </div>
                    <div className="execution-timing-grid">
                        <div className="execution-time-stat">
                            <div className="execution-time-label">Started</div>
                            <div className="execution-time-value"><ExecutionDateValue timestamp={executionTiming.startedAt} /></div>
                        </div>
                        <div className="execution-time-stat">
                            <div className="execution-time-label">Finished</div>
                            <div className="execution-time-value"><ExecutionDateValue timestamp={executionTiming.endedAt} /></div>
                        </div>
                        <div className="execution-time-stat">
                            <div className="execution-time-label">Remaining</div>
                            <div className="execution-time-value">{estimatedTime || '-'}</div>
                        </div>
                        <div className="execution-time-stat">
                            <div className="execution-time-label">Est. Finish</div>
                            <div className="execution-time-value"><ExecutionDateValue timestamp={estimatedFinishAt} /></div>
                        </div>
                        <div className="execution-time-stat">
                            <div className="execution-time-label">Elapsed</div>
                            <div className="execution-time-value">{executionTiming.startedAt ? formatElapsedTime(executionTiming.elapsedMs) : '-'}</div>
                        </div>
                    </div>
                </div>
            </Card>

            <div className="action-buttons-row">
                <div className="transfer-action-buttons">
                {!loading && !isPaused && !isComplete && !retryState.isRetrying && (
                    <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStartTransfer} size="large">Start Transfer</Button>
                )}
                {isPaused && !loading && (
                    <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => { setSearchText(''); setCurrentMatchIndex(-1); resumeTransfer(); }} size="large"
                        className="resume-btn">
                        {isRetryMode ? 'Resume Retry' : 'Resume Transfer'}
                    </Button>
                )}
                {loading && (
                    <Button type="default" icon={<PauseCircleOutlined />} onClick={pauseTransfer} disabled={isPaused || isStopping || isPausing} size="large"
                        className="pause-btn">
                        {isPausing ? (isRetryMode ? 'Pausing Retry...' : 'Pausing...') : (isRetryMode ? 'Pause Retry' : 'Pause')}
                    </Button>
                )}
                {(loading || isPaused) && (
                    <Button danger icon={<StopOutlined />} onClick={stopTransfer} size="large" disabled={isStopping || isPausing}>
                        {isStopping ? (isRetryMode ? 'Stopping Retry...' : 'Stopping...') : (isRetryMode ? 'Stop Retry' : 'Stop Transfer')}
                    </Button>
                )}

                {isComplete && totalErrs > 0 && (
                    <Popover content={retryPopoverContent} title="Retry Configuration" trigger="click" placement="bottomLeft">
                        <Button type="primary" danger icon={<UndoOutlined />} size="large">Retry {totalErrs} Failed Rows</Button>
                    </Popover>
                )}
                {isComplete && (
                    <Button type="dashed" icon={<ReloadOutlined />} onClick={resetTransfer} size="large">Restart from Scratch</Button>
                )}

                {(!loading && stats.processed > 0) && (
                    <Space size={12} style={{ marginLeft: 'auto' }}>
                        <Tooltip title="Export to Excel">
                            <Button
                                type="default"
                                icon={<FileExcelOutlined style={{ color: '#16a34a' }} />}
                                onClick={handleExportLogs}
                                size="large"
                                className="hover-btn-soft"
                            />
                        </Tooltip>
                        <Tooltip title="Export Transfer Logs">
                            <Button
                                type="default"
                                icon={<DownloadOutlined style={{ color: '#3b82f6' }} />}
                                onClick={handleExportFullJSON}
                                size="large"
                                className="hover-btn-soft"
                            />
                        </Tooltip>
                    </Space>
                )}
                </div>
            </div>

            <div className="table-controls">
                <Segmented
                    value={activeTab}
                    onChange={setActiveTab}
                    options={[
                        { label: 'Queue Summary', value: 'queue', icon: <UnorderedListOutlined /> },
                        { label: <RightOutlined style={{ color: '#94a3b8', fontSize: '12px' }} />, value: 'arrow', disabled: true },
                        { label: 'Execution Results', value: 'results', icon: <CodeOutlined /> }
                    ]}
                />

                <Space>
                    {searchText && matches.length > 0 && (
                        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, marginRight: 8 }}>
                            {currentMatchIndex + 1} / {matches.length}
                        </div>
                    )}
                    <Input
                        ref={searchInputRef}
                        className="search-input-wrapper"
                        placeholder={loading ? "Search disabled during transfer" : "Find in table... (Ctrl + F)"}
                        disabled={loading}
                        prefix={<SearchOutlined style={{ color: loading ? '#94a3b8' : '#3b82f6' }} />}
                        suffix={
                            !loading && searchText && (
                                <Space size={4}>
                                    <Button size="small" type="text" icon={<CaretUpOutlined />} onClick={() => handleJumpNavigate(-1)} />
                                    <Button size="small" type="text" icon={<CaretDownOutlined />} onClick={() => handleJumpNavigate(1)} />
                                </Space>
                            )
                        }
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                    handleJumpNavigate(-1);
                                } else {
                                    handleJumpNavigate(1);
                                }
                            }
                        }}
                        allowClear
                    />
                </Space>
            </div>


            <div ref={tableContainerRef} className="table-container-outer" style={{ marginTop: 12 }}>
                <div className="table-container-inner">
                    {activeTab === 'queue' && (
                        <div id="queue-table-container" className="scrollable-table-box">
                            <Table
                                components={{ header: { cell: ResizableTitle } }}
                                ref={queueTableRef}
                                onRow={onQueueRow}
                                rowSelection={rowSelection}
                                dataSource={logs}
                                columns={makeResizableColumns(queueColumns, fittedQueueColWidths, handleQueueResize)}
                                pagination={false}
                                virtual={logs.length > 0}
                                scroll={getScrollConfig(fittedQueueColWidths, logs.length, QUEUE_SELECTION_COLUMN_WIDTH)}
                                size="small"
                                rowKey="key"
                                tableLayout="fixed"
                                style={{ fontSize: '13px', width: '100%' }}
                            />
                        </div>
                    )}
                    {activeTab === 'results' && (
                        <div
                            id="results-table-container"
                            className="results-table-container scrollable-table-box"
                            onScrollCapture={handleResultsScroll}
                            onWheel={handleUserInteraction}
                            onMouseDown={handleUserInteraction}
                            onKeyDown={handleUserInteraction}
                        >
                            <Table
                                components={{ header: { cell: ResizableTitle } }}
                                ref={resultsTableRef}
                                dataSource={computedResultLogs}
                                columns={makeResizableColumns(columns, fittedResultColWidths, handleResultResize)}
                                pagination={false}
                                virtual={computedResultLogs.length > 0}
                                size="small"
                                scroll={getScrollConfig(fittedResultColWidths, computedResultLogs.length)}
                                rowKey="key"
                                tableLayout="fixed"
                                style={{ fontSize: '13px', width: '100%' }}
                            />
                        </div>
                    )}
                </div>
            </div>
            <LogDetailsModal
                visible={modalVisible}
                onCancel={() => setModalVisible(false)}
                selectedLog={selectedLog}
                onExportSingle={handleExportSingleLog}
            />

            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', width: 'calc(100% - 36px)' }}>
                        <span style={{ fontSize: 18, fontWeight: 600, marginRight: 12 }}>Row Data Preview</span>
                    </div>
                }
                open={previewModalVisible}
                onCancel={() => setPreviewModalVisible(false)}
                footer={null}
                width={800}
                style={{ top: 50 }}
                styles={{ body: { padding: '20px 24px' } }}
            >
                {previewData && (
                    <div className="editor-wrapper">
                        <div className="copy-btn-floating">
                            <CopyAnimatedButton text={JSON.stringify(previewData, null, 2)} />
                        </div>
                        <Editor
                            height="100%"
                            defaultLanguage="json"
                            value={safeJsonFormat(previewData)}
                            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, formatOnPaste: true, automaticLayout: true, padding: { top: 16 } }}
                        />
                    </div>
                )}
            </Modal>
        </Card>
    );
};
