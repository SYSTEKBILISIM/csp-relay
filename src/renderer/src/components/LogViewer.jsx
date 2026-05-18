import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Card, Typography, Button, Table, Progress, Statistic, Row, Col, Tooltip, Modal, Input, Space, Tabs, Tag, Alert, Segmented, Upload, Empty, ConfigProvider, Divider, Popover, App } from 'antd';
import {
    DownloadOutlined, CheckCircleOutlined, SyncOutlined, CloseCircleOutlined,
    InfoCircleOutlined, SearchOutlined, CopyOutlined, FileTextOutlined,
    CloudUploadOutlined, CloudDownloadOutlined, UnorderedListOutlined,
    CodeOutlined, CaretUpOutlined, CaretDownOutlined, EyeOutlined,
    InboxOutlined, ImportOutlined, ArrowLeftOutlined, DeleteOutlined, CloseOutlined
} from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { LogDetailsModal, safeJsonFormat, CopyAnimatedButton } from './log/LogDetailsModal';
import '../assets/css/TransferExecutionScreen.css';

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

export const LogViewer = ({ onBack }) => {
    const { message } = App.useApp();
    const [logData, setLogData] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [debouncedSearchText, setDebouncedSearchText] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);
    const [previewModalVisible, setPreviewModalVisible] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

    const searchInputRef = useRef(null);
    const tableContainerRef = useRef(null);
    const resultsTableRef = useRef(null);
    const [tableScrollY, setTableScrollY] = useState(400);

    const matches = useMemo(() => {
        if (!debouncedSearchText || !logData) return [];
        const lowSearch = debouncedSearchText.toLocaleLowerCase('tr-TR');
        return (logData.results || [])
            .filter(item => {
                const rowData = item.rowData || {};
                if (String(item.id).toLocaleLowerCase('tr-TR').includes(lowSearch) ||
                    String(item.status || '').toLocaleLowerCase('tr-TR').includes(lowSearch) ||
                    String(item.message || '').toLocaleLowerCase('tr-TR').includes(lowSearch)
                ) return true;
                return Object.values(rowData).some(val => String(val).toLocaleLowerCase('tr-TR').includes(lowSearch));
            })
            .map(item => item.key || item.id);
    }, [logData, debouncedSearchText]);

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
            try {
                const json = JSON.parse(e.target.result);
                if (!json.results) {
                    message.error("Invalid log file format. 'results' array is missing.");
                    return;
                }
                setLogData(json);
                message.success("Logs loaded successfully.");
            } catch (err) {
                message.error("Failed to parse JSON file.");
            }
        };
        reader.readAsText(file);
        return false; // Prevent auto-upload
    };

    const clearLogs = () => {
        setLogData(null);
        setSearchText('');
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
                        <Button size="small" icon={<InfoCircleOutlined />} onClick={() => { setSelectedLog(record); setModalVisible(true); }} />
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

        const visualIdx = logData.results.findIndex(item => (item.key || item.id) === matches[nextIdx]);
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
                            <Title level={2} style={{ margin: 0 }}>Standalone Log Viewer</Title>
                            <Text type="secondary">Review and analyze offline transfer logs</Text>
                        </div>
                    </div>
                    {logData && (
                        <Tooltip>
                            <Button
                                danger
                                icon={<CloseOutlined />}
                                onClick={clearLogs}
                                size="large"
                                style={{ borderRadius: '50%' }}
                            />
                        </Tooltip>
                    )}
                </div>

                {!logData ? (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%)',
                            borderRadius: 20,
                            margin: '0 0 16px 0',
                            border: '1px solid #e0f2fe'
                        }}
                    >
                        <Card
                            style={{
                                width: 480,
                                borderRadius: 20,
                                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.04), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
                                border: '1px solid #fff'
                            }}
                            styles={{ body: { padding: '32px 24px' } }}
                        >
                            <div style={{ textAlign: 'center', marginBottom: 28 }}>
                                <div style={{
                                    width: 52,
                                    height: 52,
                                    background: '#eff6ff',
                                    borderRadius: 14,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 16px auto',
                                    border: '1px solid #dbeafe'
                                }}>
                                    <CloudUploadOutlined style={{ color: '#3b82f6', fontSize: 24 }} />
                                </div>
                                <Title level={4} style={{ margin: '0 0 4px 0', color: '#1e293b' }}>Load Transfer Logs</Title>
                                <Text type="secondary" style={{ fontSize: 13 }}>Select the .json log file exported during transfer</Text>
                            </div>

                            <Dragger
                                accept=".json"
                                multiple={false}
                                beforeUpload={handleFileUpload}
                                showUploadList={false}
                                style={{
                                    background: '#f8fafc',
                                    border: '2px dashed #cbd5e1',
                                    borderRadius: 14,
                                    padding: '24px 0',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <p className="ant-upload-drag-icon">
                                    <InboxOutlined style={{ color: '#64748b', fontSize: 36, opacity: 0.6 }} />
                                </p>
                                <p className="ant-upload-text" style={{ fontSize: 14, fontWeight: 600, color: '#475569', marginTop: 12 }}>
                                    Click or drag JSON file here
                                </p>
                                <p className="ant-upload-hint" style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                                    Comprehensive JSON exports only
                                </p>
                            </Dragger>
                        </Card>
                    </motion.div>
                ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <Row gutter={16} style={{ marginBottom: 12 }}>
                            <Col span={8}>
                                <Card size="small" style={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                    <Statistic title="Total Rows" value={stats.total} prefix={<FileTextOutlined style={{ color: '#64748b' }} />} />
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
                                    <Card size="small" className="stats-help-cursor" style={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                        <Statistic title="Success" value={stats.success} styles={{ content: { color: '#16a34a' } }} prefix={<CheckCircleOutlined />} />
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
                                    <Card size="small" className="stats-help-cursor" style={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                        <Statistic title="Failed" value={stats.error} styles={{ content: { color: '#dc2626' } }} prefix={<CloseCircleOutlined />} />
                                    </Card>
                                </Tooltip>
                            </Col>
                        </Row>

                        <Card size="small" styles={{ body: { padding: 0, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }} style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRadius: 12, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                            <div className="table-controls" style={{ padding: '12px 16px', minHeight: 64, display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9', background: '#fff', flexShrink: 0 }}>
                                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Space size="large" separator={<Divider type="vertical" style={{ borderColor: '#e2e8f0', height: 24 }} />} style={{ flex: 1, minWidth: 0, overflow: 'hidden', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, justifyContent: 'center' }}>
                                            <Text type="secondary" style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 600, lineHeight: '12px' }}>Project Name</Text>
                                            <Text strong style={{ fontSize: 12, color: '#1e293b', lineHeight: '16px' }} ellipsis>{logData.projectName || 'N/A'}</Text>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, justifyContent: 'center' }}>
                                            <Text type="secondary" style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 600, lineHeight: '12px' }}>Transfer Type</Text>
                                            <Tag color="blue" style={{ margin: 0, fontSize: 10, fontWeight: 700, lineHeight: '16px' }}>{logData.transactionType || logData.transferType || 'N/A'}</Tag>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, justifyContent: 'center' }}>
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
                                                icon={<InfoCircleOutlined style={{ color: '#3b82f6' }} />}
                                                style={{
                                                    height: 24,
                                                    padding: '0 10px',
                                                    borderRadius: 6,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    background: '#eff6ff',
                                                    border: '1px solid #dbeafe'
                                                }}
                                            >
                                                <Text strong style={{ fontSize: 11, color: '#2563eb' }}>View Full Details</Text>
                                            </Button>
                                        </Popover>
                                    </Space>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, height: 32 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', height: 32, minWidth: 45, justifyContent: 'flex-end', visibility: matches.length > 0 ? 'visible' : 'hidden' }}>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', userSelect: 'none' }}>{currentMatchIndex + 1} / {matches.length}</div>
                                        </div>
                                        <Input
                                            ref={searchInputRef}
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
                            <div ref={tableContainerRef} className="results-table-container scrollable-table-box" style={{ flex: 1, background: '#fff' }}>
                                <Table
                                    ref={resultsTableRef}
                                    dataSource={logData.results}
                                    columns={columns}
                                    pagination={false}
                                    virtual
                                    size="small"
                                    scroll={{ y: tableScrollY }}
                                    rowKey={r => r.key || r.id}
                                    style={{ fontSize: '13px' }}
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
