import React, { useState } from 'react';
import { Modal, Tabs, Tag, Space, Typography, Table, Button, Tooltip, App } from 'antd';
import {
    InfoCircleOutlined,
    CloudUploadOutlined,
    CloudDownloadOutlined,
    CopyOutlined,
    CheckCircleOutlined,
    DownloadOutlined
} from '@ant-design/icons';
import Editor from '@monaco-editor/react';

const { Text } = Typography;

/**
 * Robustly format JSON-like objects or stringified JSON strings
 */
export const safeJsonFormat = (data) => {
    if (data === null || data === undefined) return '';
    if (typeof data === 'object') return JSON.stringify(data, null, 2);
    if (typeof data === 'string') {
        const trimmed = data.trim();
        if (trimmed === '') return '';
        if (trimmed.startsWith('{') || trimmed.startsWith('[') || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
            try {
                const parsed = JSON.parse(trimmed);
                if (typeof parsed === 'object' && parsed !== null) return JSON.stringify(parsed, null, 2);
                if (typeof parsed === 'string') return safeJsonFormat(parsed);
                return String(parsed);
            } catch (e) { return data; }
        }
    }
    return String(data);
};

export const CopyAnimatedButton = ({ text }) => {
    const { message } = App.useApp();
    const [copied, setCopied] = useState(false);
    const handleCopy = (e) => {
        e.stopPropagation();
        if (!text) {
            message.warning("Nothing to copy!");
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => message.error('Failed to copy'));
    };

    return (
        <Tooltip title={copied ? "Copied!" : "Copy to Clipboard"}>
            <Button
                type="default"
                shape="circle"
                icon={copied ? <CheckCircleOutlined /> : <CopyOutlined />}
                onClick={handleCopy}
                className={`copy-btn-circular ${copied ? 'copied' : ''}`}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
            />
        </Tooltip>
    );
};

const getStepPages = (stepDetails) => {
    const raw = stepDetails?.raw || {};
    if (Array.isArray(raw.pages) && raw.pages.length > 0) return raw.pages;

    const responsePages = raw.response?.pages;
    if (!Array.isArray(responsePages) || responsePages.length === 0) return [];

    return responsePages.map((page) => {
        const request = raw.request ? JSON.parse(JSON.stringify(raw.request)) : {};
        if (request.body && page.pagination) {
            request.body.loadOptions = request.body.loadOptions || {};
            request.body.loadOptions.pagination = page.pagination;
        }
        return { ...page, request };
    });
};

const getPagedSummary = (stepDetails, pages) => ({
    requestCount: pages.length,
    pageSize: stepDetails?.raw?.response?.pagination?.pageSize || pages[0]?.pagination?.take,
    totalItems: stepDetails?.raw?.response?.pagination?.totalItems || pages.reduce((sum, page) => sum + (Number(page.count) || 0), 0),
    pages: pages.map((page, index) => ({
        page: index + 1,
        pagination: page.pagination,
        count: page.count
    }))
});

export const LogDetailsModal = ({ visible, onCancel, selectedLog, onExportSingle }) => {
    const [stepDetails, setStepDetails] = useState(null);
    const [stepModalVisible, setStepModalVisible] = useState(false);

    const executionLog = selectedLog?.details?.executionLog || selectedLog?.executionLog || [];
    const stepPages = getStepPages(stepDetails);
    const hasStepPages = stepPages.length > 0;
    const stepPagesSummary = getPagedSummary(stepDetails, stepPages);

    return (
        <>
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: 'calc(100% - 10px)' }}>
                        <Space align="center" size={12}>
                            <span style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Request #{selectedLog?.id} Details</span>
                            {selectedLog && (
                                <Tag color={
                                    selectedLog.status === 'Success' ? 'success' :
                                        selectedLog.status === 'Warning' ? 'warning' :
                                            selectedLog.status === 'Processing' ? 'processing' :
                                                selectedLog.status === 'ValidationError' ? '#fee2e2' : 'error'
                                } style={{
                                    margin: 0,
                                    padding: '2px 10px',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    borderRadius: 6,
                                    color: selectedLog.status === 'ValidationError' ? '#ef4444' : undefined,
                                    border: selectedLog.status === 'ValidationError' ? '1px solid #fecaca' : undefined
                                }}>
                                    {selectedLog.status === 'ValidationError' ? 'VALIDATION ERROR' : selectedLog.status.toUpperCase()}
                                </Tag>
                            )}
                        </Space>
                        <div style={{ marginRight: 8 }}>
                            {selectedLog && onExportSingle && (
                                <Tooltip title="Export JSON">
                                    <Button
                                        type="text"
                                        icon={<DownloadOutlined style={{ fontSize: 18, color: '#94a3b8' }} />}
                                        onClick={() => onExportSingle(selectedLog)}
                                        className="hover-btn-soft"
                                    />
                                </Tooltip>
                            )}
                        </div>
                    </div>
                }
                open={visible}
                onCancel={onCancel}
                footer={null}
                width="min(1280px, calc(100vw - 96px))"
                style={{ top: 40 }}
                styles={{
                    content: {
                        maxHeight: 'calc(100vh - 80px)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    },
                    header: { borderBottom: '1px solid #f1f5f9', padding: '16px 24px', userSelect: 'text' },
                    body: {
                        flex: 1,
                        height: 'calc(100vh - 148px)',
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        overflowY: 'hidden',
                        userSelect: 'text'
                    }
                }}
            >
                {selectedLog && (
                    <>
                        <div style={{ padding: '20px 24px 10px 24px', flexShrink: 0 }}>
                            {selectedLog.warnings && selectedLog.warnings.length > 0 && (
                                <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 10, display: 'flex', gap: 12 }}>
                                    <InfoCircleOutlined style={{ color: '#f59e0b', marginTop: 3 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <Text strong style={{ color: '#92400e', fontSize: 13 }}>API Mapping Warnings</Text>
                                        <div style={{ maxHeight: '150px', overflowY: 'auto', marginTop: 6, paddingRight: 4 }}>
                                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#b45309', lineHeight: '1.6' }}>
                                                {selectedLog.warnings.map((w, idx) => <li key={idx} style={{ marginBottom: 4 }}>{w}</li>)}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="detail-modal-msg-container" style={{ marginBottom: 16 }}>
                                <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Final Message</Text>
                                <div className="detail-modal-msg-box" style={{
                                    padding: '10px 16px',
                                    background: '#f8fafc',
                                    borderRadius: 10,
                                    marginTop: 6,
                                    border: '1px solid #e2e8f0',
                                    fontSize: 13,
                                    lineHeight: '1.6',
                                    color: '#334155',
                                    maxHeight: '100px',
                                    overflowY: 'auto'
                                }}>
                                    {selectedLog.message}
                                </div>
                            </div>
                        </div>

                        <Tabs
                            defaultActiveKey="1"
                            className="log-details-tabs log-primary-tabs"
                            tabBarStyle={{ margin: '0 24px 12px 24px' }}
                            style={{ marginTop: '-8px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                            items={[
                                {
                                    key: '1',
                                    label: <Space><InfoCircleOutlined /> Operation Tree</Space>,
                                    children: (
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 24px', paddingBottom: 12 }}>
                                            <Table
                                                dataSource={executionLog}
                                                rowKey="key"
                                                pagination={false}
                                                size="small"
                                                scroll={{ y: '100%' }}
                                                locale={{ emptyText: <Text type="secondary" italic>No execution logs available for this row.</Text> }}
                                                columns={[
                                                    {
                                                        title: 'Step',
                                                        dataIndex: 'step',
                                                        key: 'step',
                                                        width: 220,
                                                        render: t => <Text strong style={{ fontSize: 12, color: '#334155' }}>{t}</Text>
                                                    },
                                                    {
                                                        title: 'Status',
                                                        dataIndex: 'status',
                                                        key: 'status',
                                                        width: 110,
                                                        render: s => (<Tag color={s === 'Success' ? 'success' : s === 'Warning' ? 'warning' : s === 'Pending' ? 'processing' : 'error'} style={{ fontSize: 10, fontWeight: 700, borderRadius: 4 }}>{(s || '').toUpperCase()}</Tag>)
                                                    },
                                                    {
                                                        title: 'Details',
                                                        dataIndex: 'details',
                                                        key: 'details',
                                                        render: t => <Text style={{ fontSize: 12, color: '#64748b' }}>{t}</Text>
                                                    },
                                                    {
                                                        title: '',
                                                        key: 'inspect',
                                                        width: 40,
                                                        render: (_, step) => (
                                                            <Tooltip title="Inspect Step Details">
                                                                <Button
                                                                    type="text"
                                                                    size="small"
                                                                    icon={<InfoCircleOutlined style={{ color: '#3b82f6' }} />}
                                                                    disabled={!step.raw}
                                                                    onClick={() => {
                                                                        setStepDetails(step);
                                                                        setStepModalVisible(true);
                                                                    }}
                                                                />
                                                            </Tooltip>
                                                        )
                                                    }
                                                ]}
                                                style={{ flex: 1, border: '1px solid #f1f5f9', borderRadius: 12, overflow: 'hidden' }}
                                            />
                                        </div>
                                    )
                                },
                                {
                                    key: '2',
                                    label: <Space><CloudUploadOutlined /> Request Payload</Space>,
                                    children: (
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 24px', paddingBottom: 12 }}>
                                            <div className="editor-wrapper" style={{ flex: 1, position: 'relative', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                                                <div className="copy-btn-floating" style={{ position: 'absolute', right: 16, top: 16, zIndex: 10 }}>
                                                    <CopyAnimatedButton text={selectedLog.details?.payload || selectedLog.payload || ''} />
                                                </div>
                                                <Editor
                                                    height="100%"
                                                    defaultLanguage="json"
                                                    value={safeJsonFormat(selectedLog.details?.payload || selectedLog.payload || '')}
                                                    options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, formatOnPaste: true, automaticLayout: true, padding: { top: 16 } }}
                                                />
                                            </div>
                                        </div>
                                    )
                                },
                                {
                                    key: '3',
                                    label: <Space><CloudDownloadOutlined /> Response Body</Space>,
                                    children: (
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 24px', paddingBottom: 12 }}>
                                            <div className="editor-wrapper" style={{ flex: 1, position: 'relative', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                                                <div className="copy-btn-floating" style={{ position: 'absolute', right: 16, top: 16, zIndex: 10 }}>
                                                    <CopyAnimatedButton text={selectedLog.details?.response || selectedLog.response || ''} />
                                                </div>
                                                <Editor
                                                    height="100%"
                                                    defaultLanguage="json"
                                                    value={safeJsonFormat(selectedLog.details?.response || selectedLog.response || '')}
                                                    options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, formatOnPaste: true, automaticLayout: true, padding: { top: 16 } }}
                                                />
                                            </div>
                                        </div>
                                    )
                                }
                            ]}
                        />
                    </>
                )}
            </Modal>

            {/* Step Details Sub-Modal */}
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: 'calc(100% - 24px)' }}>
                        <Space align="center" size={12}>
                            <InfoCircleOutlined style={{ color: '#3b82f6', fontSize: 18 }} />
                            <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Step Details: {stepDetails?.step}</span>
                            <Tag color={stepDetails?.status === 'Success' ? 'success' : stepDetails?.status === 'Warning' ? 'warning' : stepDetails?.status === 'Pending' ? 'processing' : 'error'} style={{
                                margin: 0,
                                fontWeight: 700,
                                borderRadius: 4,
                                fontSize: 11
                            }}>
                                {stepDetails?.status?.toUpperCase()}
                            </Tag>
                        </Space>
                    </div>
                }
                open={stepModalVisible}
                onCancel={() => setStepModalVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setStepModalVisible(false)} style={{ borderRadius: 8 }}>Close</Button>
                ]}
                width="min(1180px, calc(100vw - 120px))"
                style={{ top: 50 }}
                styles={{
                    content: {
                        maxHeight: 'calc(100vh - 80px)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    },
                    header: { borderBottom: '1px solid #f1f5f9', padding: '16px 24px', userSelect: 'text' },
                    body: {
                        padding: 0,
                        flex: 1,
                        height: 'calc(100vh - 212px)',
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        overflowY: 'hidden',
                        userSelect: 'text'
                    }
                }}
            >
                {stepDetails && (
                    <Tabs
                        className="log-details-tabs log-primary-tabs"
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                        tabBarStyle={{ margin: '12px 24px 12px 24px' }}
                        items={[
                            {
                                key: 'request',
                                label: <Space><CloudUploadOutlined /> Request Payload{hasStepPages ? <Tag color="blue">{stepPages.length} requests</Tag> : null}</Space>,
                                children: (
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                        {hasStepPages ? (
                                            <Tabs
                                                className="paged-step-tabs"
                                                size="small"
                                                tabPosition="left"
                                                style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
                                                items={[
                                                    {
                                                        key: 'all',
                                                        label: 'All Pages',
                                                        children: (
                                                            <div style={{ height: '100%', position: 'relative' }}>
                                                                <div className="copy-btn-floating" style={{ position: 'absolute', right: 16, top: 16, zIndex: 10 }}>
                                                                    <CopyAnimatedButton text={JSON.stringify(stepPages.map(page => page.request || {}), null, 2)} />
                                                                </div>
                                                                <Editor
                                                                    height="100%"
                                                                    defaultLanguage="json"
                                                                    value={safeJsonFormat(stepPages.map(page => page.request || {}))}
                                                                    options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 16 } }}
                                                                />
                                                            </div>
                                                        )
                                                    },
                                                    ...stepPages.map((page, index) => ({
                                                        key: `page-${index}`,
                                                        label: `Page ${index + 1} (${page.pagination?.skip || 0}-${(page.pagination?.skip || 0) + (page.pagination?.take || 0)})`,
                                                        children: (
                                                            <div style={{ height: '100%', position: 'relative' }}>
                                                                <div className="copy-btn-floating" style={{ position: 'absolute', right: 16, top: 16, zIndex: 10 }}>
                                                                    <CopyAnimatedButton text={JSON.stringify(page.request || {}, null, 2)} />
                                                                </div>
                                                                <Editor
                                                                    height="100%"
                                                                    defaultLanguage="json"
                                                                    value={safeJsonFormat(page.request || {})}
                                                                    options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 16 } }}
                                                                />
                                                            </div>
                                                        )
                                                    }))
                                                ]}
                                            />
                                        ) : (
                                            <div style={{ flex: 1, position: 'relative' }}>
                                                <div className="copy-btn-floating" style={{ position: 'absolute', right: 16, top: 16, zIndex: 10 }}>
                                                    <CopyAnimatedButton text={JSON.stringify(stepDetails.raw?.request || {}, null, 2)} />
                                                </div>
                                                <Editor
                                                    height="100%"
                                                    defaultLanguage="json"
                                                    value={safeJsonFormat(stepDetails.raw?.request || {})}
                                                    options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 16 } }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )
                            },
                            {
                                key: 'response',
                                label: <Space><CloudDownloadOutlined /> Response Body{hasStepPages ? <Tag color="blue">{stepPagesSummary.totalItems} rows</Tag> : null}</Space>,
                                children: (
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                        {hasStepPages ? (
                                            <Tabs
                                                className="paged-step-tabs"
                                                size="small"
                                                tabPosition="left"
                                                style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
                                                items={[
                                                    {
                                                        key: 'all',
                                                        label: 'All Pages',
                                                        children: (
                                                            <div style={{ height: '100%', position: 'relative' }}>
                                                                <div className="copy-btn-floating" style={{ position: 'absolute', right: 16, top: 16, zIndex: 10 }}>
                                                                    <CopyAnimatedButton text={JSON.stringify(stepPages, null, 2)} />
                                                                </div>
                                                                <Editor
                                                                    height="100%"
                                                                    defaultLanguage="json"
                                                                    value={safeJsonFormat(stepPages)}
                                                                    options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 16 } }}
                                                                />
                                                            </div>
                                                        )
                                                    },
                                                    {
                                                        key: 'summary',
                                                        label: 'Summary',
                                                        children: (
                                                            <div style={{ height: '100%', position: 'relative' }}>
                                                                <div className="copy-btn-floating" style={{ position: 'absolute', right: 16, top: 16, zIndex: 10 }}>
                                                                    <CopyAnimatedButton text={JSON.stringify(stepPagesSummary, null, 2)} />
                                                                </div>
                                                                <Editor
                                                                    height="100%"
                                                                    defaultLanguage="json"
                                                                    value={safeJsonFormat(stepPagesSummary)}
                                                                    options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 16 } }}
                                                                />
                                                            </div>
                                                        )
                                                    },                                                    
                                                    ...stepPages.map((page, index) => ({
                                                        key: `page-${index}`,
                                                        label: `Page ${index + 1} (${page.count || 0})`,
                                                        children: (
                                                            <div style={{ height: '100%', position: 'relative' }}>
                                                                <div className="copy-btn-floating" style={{ position: 'absolute', right: 16, top: 16, zIndex: 10 }}>
                                                                    <CopyAnimatedButton text={JSON.stringify(page.response || {}, null, 2)} />
                                                                </div>
                                                                <Editor
                                                                    height="100%"
                                                                    defaultLanguage="json"
                                                                    value={safeJsonFormat(page.response || {})}
                                                                    options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 16 } }}
                                                                />
                                                            </div>
                                                        )
                                                    }))
                                                ]}
                                            />
                                        ) : (
                                            <div style={{ flex: 1, position: 'relative' }}>
                                                <div className="copy-btn-floating" style={{ position: 'absolute', right: 16, top: 16, zIndex: 10 }}>
                                                    <CopyAnimatedButton text={JSON.stringify(stepDetails.raw?.response || {}, null, 2)} />
                                                </div>
                                                <Editor
                                                    height="100%"
                                                    defaultLanguage="json"
                                                    value={safeJsonFormat(stepDetails.raw?.response || {})}
                                                    options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 16 } }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )
                            }
                        ]}
                    />
                )}
            </Modal>
        </>
    );
};
