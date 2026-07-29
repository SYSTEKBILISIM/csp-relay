import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Card, Typography, Button, Table, Progress, Row, Col, Tooltip, Modal, Input, Space, Tabs, Tag, Alert, Upload, Empty, ConfigProvider, Divider, Popover, App } from 'antd';
import {
    DownloadOutlined, CheckCircleOutlined, SyncOutlined, CloseCircleOutlined,
    InfoCircleOutlined, InfoCircleFilled, SearchOutlined, CopyOutlined, FileTextOutlined,
    CloudDownloadOutlined, UnorderedListOutlined,
    CodeOutlined, CaretUpOutlined, CaretDownOutlined, EyeOutlined,
    InboxOutlined, ImportOutlined, ArrowLeftOutlined, DeleteOutlined, CloseOutlined,
    HistoryOutlined, FileExcelOutlined
} from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import { LogDetailsModal, safeJsonFormat, CopyAnimatedButton } from './log/LogDetailsModal';
import { logDB } from '../services/IndexedDBService';
import '../assets/css/TransferExecutionScreen.css';
import '../assets/css/LogViewer.css';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;



const StableCell = ({ children, style }) => (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: '24px', padding: '4px 0', ...style }}>
        {children}
    </div>
);

const HighlightText = ({ text, highlight, isFocused }) => {
    if (!highlight || !text) return text;
    const textStr = String(text);
    const lowText = textStr.toLocaleLowerCase('tr-TR');
    const lowHighlight = highlight.toLocaleLowerCase('tr-TR');

    if (!lowText.includes(lowHighlight)) return text;

    const parts = [];
    let lastIdx = 0;
    let idx = lowText.indexOf(lowHighlight);

    while (idx !== -1) {
        if (idx > lastIdx) {
            parts.push(textStr.substring(lastIdx, idx));
        }
        // Turkish İ and i are both 1 character, so length is consistent
        parts.push(textStr.substring(idx, idx + highlight.length));
        lastIdx = idx + highlight.length;
        idx = lowText.indexOf(lowHighlight, lastIdx);
    }

    if (lastIdx < textStr.length) {
        parts.push(textStr.substring(lastIdx));
    }

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 'normal' }}>
            {parts.map((part, i) =>
                part.toLocaleLowerCase('tr-TR') === lowHighlight ?
                    <mark key={i} style={{ backgroundColor: isFocused ? '#facc15' : '#fef08a', border: isFocused ? '1px solid #eab308' : 'none', color: 'black', padding: '0 2px', margin: 0, borderRadius: 2, lineHeight: 'inherit', fontWeight: isFocused ? 'bold' : 'normal' }}>{part}</mark> :
                    part
            )}
        </span>
    );
};

export const LogViewer = ({ onBack, onRestoreSession }) => {
    const { message } = App.useApp();
    const [logData, setLogData] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [debouncedSearchText, setDebouncedSearchText] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);
    const [previewModalVisible, setPreviewModalVisible] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
    const [recoverableSessions, setRecoverableSessions] = useState([]);
    const [recoveringSessionId, setRecoveringSessionId] = useState(null);
    const [exportLoading, setExportLoading] = useState(null);
    const searchInputRef = useRef(null);
    const tableContainerRef = useRef(null);
    const resultsTableRef = useRef(null);
    const [tableScrollY, setTableScrollY] = useState(400);

    const visibleResults = useMemo(() => logData?.results || [], [logData]);

    const matches = useMemo(() => {
        if (!debouncedSearchText || !logData) return [];
        const lowSearch = debouncedSearchText.toLocaleLowerCase('tr-TR');
        return visibleResults
            .filter(item => {
                const rowData = item.rowData || {};
                if (String(item.id).toLocaleLowerCase('tr-TR').includes(lowSearch) ||
                    String(item.status || '').toLocaleLowerCase('tr-TR').includes(lowSearch) ||
                    String(item.message || '').toLocaleLowerCase('tr-TR').includes(lowSearch)
                ) return true;
                return Object.values(rowData).some(val => String(val).toLocaleLowerCase('tr-TR').includes(lowSearch));
            })
            .map(item => item.key || item.id);
    }, [visibleResults, debouncedSearchText]);

    const stats = useMemo(() => {
        if (!logData) return null;
        const results = logData.results || [];
        const successCount = results.filter(l => l.status === 'Success').length;
        const warningCount = results.filter(l => l.status === 'Warning').length;
        const errorCount = results.filter(l => l.status === 'Error').length;
        const validationCount = results.filter(l => l.status === 'ValidationError').length;

        return {
            total: results.length,
            success: successCount + warningCount,
            error: errorCount + validationCount,
            processed: results.length, // All are processed in viewer
            retried: logData.stats?.retried || 0,
            successBreakdown: {
                Success: successCount,
                Warning: warningCount
            },
            errorBreakdown: {
                Error: errorCount,
                ValidationError: validationCount
            }
        };
    }, [logData]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearchText(searchText), 400);
        return () => clearTimeout(timer);
    }, [searchText]);

    useEffect(() => {
        logDB.listRecoverable()
            .then(setRecoverableSessions)
            .catch(error => console.error('Failed to inspect recoverable transfer logs:', error));
    }, []);

    // Update currentMatchIndex when matches change
    useEffect(() => {
        if (matches.length > 0) {
            setCurrentMatchIndex(0);
        } else {
            setCurrentMatchIndex(-1);
        }
    }, [matches]);

    // Resize observer for table height
    useEffect(() => {
        if (!tableContainerRef.current) return;
        const updateHeight = () => {
            if (tableContainerRef.current) {
                const height = tableContainerRef.current.clientHeight - 34;
                setTableScrollY(height > 50 ? height : 400);
            }
        };
        const observer = new ResizeObserver(updateHeight);
        observer.observe(tableContainerRef.current);
        updateHeight();
        return () => observer.disconnect();
    }, [logData]);

    const handleFileUpload = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const fileText = e.target.result;
            try {
                const json = JSON.parse(fileText);
                if (!json.results) {
                    message.error("Invalid log file format. 'results' array is missing.");
                    return;
                }
                setLogData(json);
                message.success("Logs loaded successfully.");
            } catch (err) {
                const latestRecords = new Map();
                let metadata = {};
                let invalidLineCount = 0;
                for (const line of fileText.split(/\r?\n/)) {
                    if (!line.trim()) continue;
                    try {
                        const record = JSON.parse(line);
                        if (record.recordType === 'transfer-metadata' && record.metadata && typeof record.metadata === 'object') {
                            metadata = record.metadata;
                            continue;
                        }
                        if (record.key === undefined || record.key === null) {
                            invalidLineCount += 1;
                            continue;
                        }
                        latestRecords.set(String(record.key), record);
                    } catch {
                        invalidLineCount += 1;
                    }
                }

                if (latestRecords.size === 0) {
                    message.error("Failed to parse the JSON/JSONL log file.");
                    return;
                }

                const results = [...latestRecords.values()];
                setLogData({
                    ...metadata,
                    recovered: true,
                    recoverySource: 'selected JSONL file',
                    recoveryWarningCount: invalidLineCount,
                    exportDate: new Date(file.lastModified).toLocaleString(),
                    results
                });
                message.success(`${results.length} rows recovered from the JSONL file.`);
            }
        };
        reader.readAsText(file);
        return false; // Prevent auto-upload
    };

    const handleRecoverTransfer = async (sessionId = 'latest') => {
        setRecoveringSessionId(sessionId);
        try {
            const recovered = await logDB.recover(sessionId);
            if (!recovered?.results?.length) {
                message.warning('No recoverable transfer log was found.');
                setRecoverableSessions([]);
                return;
            }
            setLogData(recovered);
            const warning = recovered.recoveryWarningCount
                ? ` ${recovered.recoveryWarningCount} incomplete log line was skipped.`
                : '';
            message.success(`${recovered.results.length} rows recovered.${warning}`);
        } catch (error) {
            message.error(`Failed to recover the transfer: ${error.message}`);
        } finally {
            setRecoveringSessionId(null);
        }
    };

    const handleRestoreTransfer = async (sessionId) => {
        setRecoveringSessionId(sessionId);
        try {
            const recovered = await logDB.recover(sessionId);
            if (!recovered?.recoveryContext && !recovered?.results?.length) {
                message.warning('No recoverable records were found in this session.');
                return;
            }
            await onRestoreSession?.(recovered);
            message.success('Session restored. Opening the transfer screen...');
        } catch (error) {
            message.error(`The session could not be restored: ${error.message}`);
        } finally {
            setRecoveringSessionId(null);
        }
    };

    const clearLogs = () => {
        setLogData(null);
        setSearchText('');
    };

    const handleOpenDetails = async (record) => {
        let detailRecord = record;
        if (!record.details && logData?.recoverySessionId && record.hasDetails) {
            try {
                const details = await logDB.getRecoveredDetail(logData.recoverySessionId, record.key);
                detailRecord = { ...record, details };
            } catch (error) {
                message.error(`The record details could not be opened: ${error.message}`);
            }
        }
        setSelectedLog(detailRecord);
        setModalVisible(true);
    };

    const handleExportExcel = async () => {
        if (!logData?.results?.length) {
            message.warning('No logs to export.');
            return;
        }
        setExportLoading('excel');
        try {
            await new Promise(resolve => setTimeout(resolve, 50));
            const mainIdKey = logData.mainIdColumn || 'ID';
            const exportData = logData.results.map(log => ({
                '#': log.id,
                Status: log.status,
                [mainIdKey]: log.rowData?.[mainIdKey] ?? log.id ?? '-',
                Message: log.message,
                Timestamp: log.timestamp,
                Duration: log.duration,
                'Preview Data': log.rowData ? JSON.stringify(log.rowData) : '',
                Payload: log.details?.payload ? JSON.stringify(log.details.payload, null, 2) : '',
                Response: log.details?.response ? JSON.stringify(log.details.response, null, 2) : '',
                OperationTree: log.details?.executionLog?.map(step => `[${step.status}] ${step.step} - ${step.details}`).join(' | ') || ''
            }));
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportData), 'TransferLogs');
            XLSX.writeFile(workbook, `Recovered_TransferLogs_${Date.now()}.xlsx`);
            message.success('Recovered logs exported to Excel.');
        } catch (error) {
            message.error(`Failed to export Excel: ${error.message}`);
        } finally {
            setExportLoading(null);
        }
    };

    const handleExportJson = async () => {
        if (!logData?.results?.length) {
            message.warning('No logs to export.');
            return;
        }
        setExportLoading('json');
        try {
            const safeProjectName = String(logData.projectName || 'recovered').replace(/[<>:"/\\|?*]/g, '_');
            const result = await logDB.exportDataJson(logData, `Recovered_Transfer_Logs_${safeProjectName}_${Date.now()}.json`);
            if (result?.canceled) {
                message.info('Log export canceled.');
                return;
            }
            if (!result?.success) throw new Error(result?.error || 'The log file could not be exported.');
            message.success(`Recovered logs exported to ${result.filePath}`);
        } catch (error) {
            message.error(`Failed to export JSON: ${error.message}`);
        } finally {
            setExportLoading(null);
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
                    <Button type="primary" onClick={() => confirm()} icon={<SearchOutlined />} size="small" style={{ width: 90 }}>Search</Button>
                    <Button onClick={() => clearFilters()} size="small" style={{ width: 90 }}>Reset</Button>
                </Space>
            </div>
        ),
        filterIcon: filtered => <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />,
        onFilter: (value, record) => record[dataIndex] ? record[dataIndex].toString().toLowerCase().includes(value.toLowerCase()) : '',
    });

    const columns = [
        {
            title: <span className="table-header-sm">#</span>,
            dataIndex: 'id',
            width: 50,
            sorter: (a, b) => a.id - b.id,
            render: (text, record) => (
                <StableCell style={{ color: '#64748b' }}>
                    <HighlightText text={text} highlight={debouncedSearchText} isFocused={matches.length > 0 && (record.key || record.id) === matches[currentMatchIndex]} />
                </StableCell>
            )
        },
        {
            title: <span className="table-header-sm">Status</span>,
            dataIndex: 'status',
            width: 150,
            filters: [{ text: 'Success', value: 'Success' }, { text: 'Warning', value: 'Warning' }, { text: 'Error', value: 'Error' }, { text: 'Validation Error', value: 'ValidationError' }],
            onFilter: (value, record) => record.status === value,
            render: (status, record) => {
                const isFocused = matches.length > 0 && (record.key || record.id) === matches[currentMatchIndex];
                return (
                    <StableCell style={{ color: status === 'Success' ? '#16a34a' : status === 'Warning' ? '#f59e0b' : status === 'ValidationError' ? '#e11d48' : '#dc2626', fontWeight: 600, gap: 6 }}>
                        <div style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'start', flexShrink: 0 }}>
                            {status === 'Success' ? <CheckCircleOutlined /> : status === 'Warning' ? <InfoCircleOutlined /> : <CloseCircleOutlined />}
                        </div>
                        <span>
                            <HighlightText text={status === 'ValidationError' ? 'Validation Error' : status} highlight={debouncedSearchText} isFocused={isFocused} />
                        </span>
                    </StableCell>
                );
            }
        },
        {
            title: <span className="table-header-sm">Target ID</span>,
            width: 130,
            render: (_, record) => {
                const idVal = record.rowData?.[logData?.mainIdColumn || 'ID'] || record.id;
                const isFocused = matches.length > 0 && (record.key || record.id) === matches[currentMatchIndex];
                return (
                    <StableCell style={{ fontWeight: 600, color: '#1e293b' }}>
                        <HighlightText text={idVal || '-'} highlight={debouncedSearchText} isFocused={isFocused} />
                    </StableCell>
                );
            }
        },
        {
            title: <span className="table-header-sm">Message</span>,
            dataIndex: 'message',
            sorter: (a, b) => a.message.localeCompare(b.message),
            ...getColumnSearchProps('message'),
            ellipsis: { showTitle: false },
            render: (v, record) => <StableCell><Tooltip placement="topLeft" title={v}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}><HighlightText text={v} highlight={debouncedSearchText} isFocused={matches.length > 0 && (record.key || record.id) === matches[currentMatchIndex]} /></span></Tooltip></StableCell>
        },
        {
            title: <span className="table-header-sm">Timestamp</span>,
            dataIndex: 'timestamp',
            width: 135,
            render: (text) => <StableCell style={{ fontSize: '11px', color: '#94a3b8' }}>{text}</StableCell>
        },
        {
            title: <span className="table-header-sm">Duration</span>,
            dataIndex: 'duration',
            width: 100,
            align: 'right',
            render: (text) => <StableCell style={{ justifyContent: 'flex-end', width: '100%' }}>{text}</StableCell>
        },
        {
            title: <span className="table-header-sm">Details</span>,
            key: 'details',
            width: 70,
            align: 'center',
            render: (_, record) => (
                <StableCell style={{ justifyContent: 'center', width: '100%' }}>
                    <Tooltip title="View Details">
                        <Button size="small" icon={<InfoCircleOutlined />} onClick={() => handleOpenDetails(record)} />
                    </Tooltip>
                </StableCell>
            )
        }
    ];

    const handleJumpNavigate = (direction) => {
        if (matches.length === 0) return;
        let nextIdx = currentMatchIndex + direction;
        if (nextIdx >= matches.length) nextIdx = 0;
        if (nextIdx < 0) nextIdx = matches.length - 1;
        setCurrentMatchIndex(nextIdx);

        const visualIdx = visibleResults.findIndex(item => (item.key || item.id) === matches[nextIdx]);
        if (visualIdx !== -1 && resultsTableRef.current) {
            resultsTableRef.current.scrollTo({ index: visualIdx, align: 'top' });
        }
    };

    return (
        <ConfigProvider theme={{ token: { colorPrimary: '#3b82f6', borderRadius: 10 } }}>
            <div className="log-viewer-page" style={{ height: '100%', padding: '16px 20px', background: '#f8fafc', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <Button icon={<ArrowLeftOutlined />} onClick={onBack} size="large" style={{ marginRight: 16, borderRadius: '50%' }} />
                        <div>
                            <Title level={2} style={{ margin: 0 }}>Log Viewer</Title>
                            <Text type="secondary">Review and analyze offline transfer logs</Text>
                        </div>
                    </div>
                    {logData && (
                        <Space>
                            {onRestoreSession && logData.recovered && (
                                <Button
                                    type="primary"
                                    icon={<HistoryOutlined />}
                                    onClick={() => onRestoreSession(logData)}
                                    size="large"
                                >
                                    Restore This Session
                                </Button>
                            )}
                            <Tooltip title="Close">
                                <Button
                                    danger
                                    icon={<CloseOutlined />}
                                    onClick={clearLogs}
                                    size="large"
                                    style={{ borderRadius: '50%' }}
                                />
                            </Tooltip>
                        </Space>
                    )}
                </div>

                {!logData ? (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="log-viewer-load-shell"
                    >
                        <div className="log-viewer-load-content">
                            {recoverableSessions.length > 0 && (
                                <Alert
                                    className="log-viewer-recover-panel"
                                    type="info"
                                    style={{ marginBottom: 20, textAlign: 'left' }}
                                    message={
                                        <div className="log-viewer-session-heading">
                                            <div>
                                                <Text strong>Recent sessions</Text>
                                                <Text type="secondary">Automatically saved transfer logs</Text>
                                            </div>
                                            <span>{recoverableSessions.length} found</span>
                                        </div>
                                    }
                                    description={
                                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                            <div style={{ maxHeight: 220, overflowY: 'auto', width: '100%' }}>
                                                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                                    {recoverableSessions.map(session => (
                                                        <div
                                                            className="log-viewer-session-card"
                                                            key={session.id}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                gap: 12,
                                                                padding: 10,
                                                                border: '1px solid #fde68a',
                                                                borderRadius: 8,
                                                                background: '#fff'
                                                            }}
                                                        >
                                                            <div className="log-viewer-session-mark">
                                                                <HistoryOutlined />
                                                            </div>
                                                            <div className="log-viewer-session-copy">
                                                                <Text strong ellipsis style={{ display: 'block' }}>{session.label}</Text>
                                                                <Text type="secondary" style={{ fontSize: 11 }}>
                                                                    {session.recordCountKnown
                                                                        ? `${session.recordCount} rows`
                                                                        : `${Math.max(1, Math.round((session.sizeBytes || 0) / (1024 * 1024)))} MB log`}
                                                                    {' · '}
                                                                    {new Date(session.modifiedAt).toLocaleString()}
                                                                    {session.hasRecoveryAssets
                                                                        ? Number.isFinite(session.recoveryAssetRecordCount)
                                                                            ? ` · ${session.recoveryAssetRecordCount} rows with preserved files`
                                                                            : ' · preserved files available'
                                                                        : ''}
                                                                    {session.recoveryAssetsMissing
                                                                        ? ' · recovery file store missing'
                                                                        : ''}
                                                                </Text>
                                                            </div>
                                                            <Space>
                                                                <Button
                                                                    type="text"
                                                                    icon={<EyeOutlined />}
                                                                    loading={recoveringSessionId === session.id}
                                                                    disabled={Boolean(recoveringSessionId && recoveringSessionId !== session.id)}
                                                                    onClick={() => handleRecoverTransfer(session.id)}
                                                                >
                                                                    Review
                                                                </Button>
                                                                {onRestoreSession && (
                                                                    <Button
                                                                        type="primary"
                                                                        icon={<HistoryOutlined />}
                                                                        loading={recoveringSessionId === session.id}
                                                                        disabled={Boolean(recoveringSessionId && recoveringSessionId !== session.id)}
                                                                        onClick={() => handleRestoreTransfer(session.id)}
                                                                    >
                                                                        Restore
                                                                    </Button>
                                                                )}
                                                            </Space>
                                                        </div>
                                                    ))}
                                                </Space>
                                            </div>
                                        </Space>
                                    }
                                />
                            )}

                            <Dragger
                                className="log-viewer-file-dragger"
                                accept=".json,.jsonl"
                                multiple={false}
                                beforeUpload={handleFileUpload}
                                showUploadList={false}
                            >
                                <p className="ant-upload-drag-icon">
                                    <InboxOutlined style={{ color: '#64748b', fontSize: 36, opacity: 0.6 }} />
                                </p>
                                <p className="ant-upload-text">
                                    Click or drag JSON file here
                                </p>
                                <p className="ant-upload-hint">
                                    Exported JSON or persisted active-transfer-log.jsonl
                                </p>
                            </Dragger>
                        </div>
                    </motion.div>
                ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {logData.recovered && (
                            <Alert
                                className="log-viewer-recovery-banner"
                                type={logData.recoveryWarningCount ? 'warning' : 'success'}
                                showIcon
                                closable
                                style={{ marginBottom: 12 }}
                                message={`${logData.results.length} rows recovered from ${logData.recoverySource}`}
                                description={logData.recoveryWarningCount
                                    ? `${logData.recoveryWarningCount} incomplete/corrupt line was skipped; all intact rows are shown.`
                                    : 'The persisted on-disk log was read successfully.'}
                            />
                        )}
                        <Row gutter={12} className="log-viewer-stats-row">
                            <Col span={8}>
                                <Card size="small" className="log-viewer-stat-card log-viewer-stat-total">
                                    <div className="log-viewer-stat-content">
                                        <span className="log-viewer-stat-icon"><FileTextOutlined /></span>
                                        <span className="log-viewer-stat-copy">
                                            <span className="log-viewer-stat-label">Total Rows</span>
                                            <span className="log-viewer-stat-value">{stats.total}</span>
                                        </span>
                                    </div>
                                </Card>
                            </Col>
                            <Col span={8}>
                                <Tooltip
                                    title={
                                        <div className="stats-tooltip-container">
                                            <div className="stats-tooltip-title">Success Breakdown</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <div className="stats-breakdown-row">
                                                    <span style={{ color: '#86efac' }}>Success:</span>
                                                    <span style={{ fontWeight: 800 }}>{stats.successBreakdown?.Success || 0}</span>
                                                </div>
                                                <div className="stats-breakdown-row">
                                                    <span style={{ color: '#fcd34d' }}>Warnings:</span>
                                                    <span style={{ fontWeight: 800 }}>{stats.successBreakdown?.Warning || 0}</span>
                                                </div>
                                            </div>
                                        </div>
                                    }
                                    placement="bottomLeft"
                                    arrow
                                >
                                    <Card size="small" className="stats-help-cursor log-viewer-stat-card log-viewer-stat-success">
                                        <div className="log-viewer-stat-content">
                                            <span className="log-viewer-stat-icon"><CheckCircleOutlined /></span>
                                            <span className="log-viewer-stat-copy">
                                                <span className="log-viewer-stat-label">Success</span>
                                                <span className="log-viewer-stat-value">{stats.success}</span>
                                            </span>
                                        </div>
                                    </Card>
                                </Tooltip>
                            </Col>
                            <Col span={8}>
                                <Tooltip
                                    title={
                                        <div className="stats-tooltip-container">
                                            <div className="stats-tooltip-title">Failure Breakdown</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <div className="stats-breakdown-row">
                                                    <span style={{ color: '#fca5a5' }}>System Errors:</span>
                                                    <span style={{ fontWeight: 800 }}>{stats.errorBreakdown?.Error || 0}</span>
                                                </div>
                                                <div className="stats-breakdown-row">
                                                    <span style={{ color: '#fca5a5' }}>Validation Errors:</span>
                                                    <span style={{ fontWeight: 800 }}>{stats.errorBreakdown?.ValidationError || 0}</span>
                                                </div>
                                                <div className="stats-breakdown-total">
                                                    <span style={{ color: '#7dd3fc' }}>Total Retried:</span>
                                                    <span style={{ fontWeight: 800, color: '#7dd3fc' }}>{stats.retried || 0}</span>
                                                </div>
                                            </div>
                                        </div>
                                    }
                                    placement="bottomLeft"
                                    arrow
                                >
                                    <Card size="small" className="stats-help-cursor log-viewer-stat-card log-viewer-stat-failed">
                                        <div className="log-viewer-stat-content">
                                            <span className="log-viewer-stat-icon"><CloseCircleOutlined /></span>
                                            <span className="log-viewer-stat-copy">
                                                <span className="log-viewer-stat-label">Failed</span>
                                                <span className="log-viewer-stat-value">{stats.error}</span>
                                            </span>
                                        </div>
                                    </Card>
                                </Tooltip>
                            </Col>
                        </Row>

                        <Card className="log-viewer-results-card" size="small" styles={{ body: { padding: 0, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <div className="table-controls" style={{ padding: '12px 16px', minHeight: 64, display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9', background: '#fff', flexShrink: 0 }}>
                                <div className="log-viewer-table-toolbar-row">
                                    <div className="log-viewer-metadata-bar">
                                        <div className="log-viewer-metadata-item log-viewer-project-meta">
                                            <Text type="secondary" style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 600, lineHeight: '12px' }}>Project Name</Text>
                                            <Text strong style={{ fontSize: 12, color: '#1e293b', lineHeight: '16px' }} ellipsis>{logData.projectName || 'N/A'}</Text>
                                        </div>
                                        <div className="log-viewer-metadata-item">
                                            <Text type="secondary" style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 600, lineHeight: '12px' }}>Transfer Type</Text>
                                            <Tag color="blue" style={{ margin: 0, fontSize: 10, fontWeight: 700, lineHeight: '16px' }}>{logData.transactionType || logData.transferType || 'N/A'}</Tag>
                                        </div>
                                        <div className="log-viewer-metadata-item log-viewer-export-date-meta">
                                            <Text type="secondary" style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 600, lineHeight: '12px' }}>Export Date</Text>
                                            <Text strong style={{ fontSize: 12, color: '#1e293b', lineHeight: '16px' }}>{logData.exportDate || 'N/A'}</Text>
                                        </div>

                                        <Popover
                                            trigger="click"
                                            placement="bottomLeft"
                                            title={<Text strong style={{ fontSize: 13 }}>Operation Details</Text>}
                                            content={
                                                <div style={{ minWidth: 200, padding: '4px 0' }}>
                                                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                                                        {(logData.flowName || logData.formName) && (
                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <Text type="secondary" style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 600 }}>Target {logData.flowName ? 'Flow' : 'Form'}</Text>
                                                                <Text strong style={{ fontSize: 12 }}>{logData.flowName || logData.formName}</Text>
                                                            </div>
                                                        )}
                                                        {logData.flowDocumentName && (
                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <Text type="secondary" style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 600 }}>Document</Text>
                                                                <Text strong style={{ fontSize: 12 }}>{logData.flowDocumentName}</Text>
                                                            </div>
                                                        )}
                                                        {logData.startingEventCode && (
                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <Text type="secondary" style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 600 }}>Start Event</Text>
                                                                <Text strong style={{ fontSize: 12 }}>{logData.startingEventCode}</Text>
                                                            </div>
                                                        )}
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <Text type="secondary" style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 600 }}>Source File</Text>
                                                            <Text strong style={{ fontSize: 11, color: '#16a34a' }}>{logData.fileName || logData.filename || 'N/A'}</Text>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <Text type="secondary" style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 600 }}>Source Sheet</Text>
                                                            <Text strong style={{ fontSize: 12 }}>{logData.mainSheet || logData.sheetName || 'N/A'}</Text>
                                                        </div>
                                                    </Space>
                                                </div>
                                            }
                                        >
                                            <Button
                                                type="text"
                                                size="small"
                                                icon={<InfoCircleFilled />}
                                                className="log-viewer-details-button"
                                                aria-label="View full operation details"
                                            />
                                        </Popover>
                                    </div>
                                    <div className="log-viewer-table-actions">
                                        <Tooltip title="Export recovered logs to Excel">
                                            <Button
                                                icon={<FileExcelOutlined style={{ color: '#16a34a' }} />}
                                                onClick={handleExportExcel}
                                                loading={exportLoading === 'excel'}
                                                disabled={Boolean(exportLoading && exportLoading !== 'excel')}
                                            />
                                        </Tooltip>
                                        <Tooltip title="Export recovered logs to JSON">
                                            <Button
                                                icon={<DownloadOutlined style={{ color: '#3b82f6' }} />}
                                                onClick={handleExportJson}
                                                loading={exportLoading === 'json'}
                                                disabled={Boolean(exportLoading && exportLoading !== 'json')}
                                            />
                                        </Tooltip>
                                        {matches.length > 0 && (
                                            <div className="log-viewer-match-count">{currentMatchIndex + 1} / {matches.length}</div>
                                        )}
                                        <Input
                                            ref={searchInputRef}
                                            className="log-viewer-search-input"
                                            placeholder="Find in logs..."
                                            prefix={<SearchOutlined style={{ color: '#3b82f6' }} />}
                                            value={searchText}
                                            onChange={e => setSearchText(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleJumpNavigate(e.shiftKey ? -1 : 1); }}
                                            style={{ width: 250, borderRadius: 8, background: '#f8fafc', height: 32 }}
                                            allowClear
                                            suffix={searchText && <Space size={4}><Button size="small" type="text" icon={<CaretUpOutlined />} onClick={() => handleJumpNavigate(-1)} /><Button size="small" type="text" icon={<CaretDownOutlined />} onClick={() => handleJumpNavigate(1)} /></Space>}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div id="results-table-container" ref={tableContainerRef} className="results-table-container scrollable-table-box log-viewer-results-grid" style={{ flex: 1, background: '#fff' }}>
                                <Table
                                    ref={resultsTableRef}
                                    dataSource={visibleResults}
                                    columns={columns}
                                    pagination={false}
                                    virtual
                                    size="small"
                                    scroll={{ y: tableScrollY }}
                                    rowKey={r => r.key || r.id}
                                    tableLayout="fixed"
                                    style={{ fontSize: '13px', width: '100%' }}
                                />
                            </div>
                        </Card>
                    </div>
                )}

                <LogDetailsModal
                    visible={modalVisible}
                    onCancel={() => setModalVisible(false)}
                    selectedLog={selectedLog}
                />
            </div>
        </ConfigProvider>
    );
};
