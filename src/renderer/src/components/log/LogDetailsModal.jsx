import React, { useState } from 'react';
import { Modal, Tabs, Tag, Space, Typography, Table, Button, Tooltip, Input, App } from 'antd';
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

export const LogDetailsModal = ({ visible, onCancel, selectedLog, onExportSingle }) => {
    const { message } = App.useApp();
    const [stepDetails, setStepDetails] = useState(null);
    const [stepModalVisible, setStepModalVisible] = useState(false);

    const executionLog = selectedLog?.details?.executionLog || selectedLog?.executionLog || [];

    return (
        <>
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: 'calc(100% - 24px)' }}>
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
                width={1100}
                style={{ top: 50 }}
                styles={{
                    header: { borderBottom: '1px solid #f1f5f9', padding: '16px 24px' },
                    body: {
                        padding: '8px 24px 24px 24px',
                        height: 'calc(100vh - 180px)',
                        minHeight: '450px',
                        maxHeight: '620px',
                        display: 'flex',
                        flexDirection: 'column',
                        overflowY: 'hidden'
                    }
                }}
            >
                {selectedLog && (
                    <>
                        <div style={{ padding: '20px 24px 10px 24px', flexShrink: 0 }}>
                            {selectedLog.warnings && selectedLog.warnings.length > 0 && (
                                <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 10, display: 'flex', gap: 12 }}>
                                    <InfoCircleOutlined style={{ color: '#f59e0b', marginTop: 3 }} />
                                    <div>
                                        <Text strong style={{ color: '#92400e', fontSize: 13 }}>API Mapping Warnings</Text>
                                        <ul style={{ margin: '4px 0 0 0', paddingLeft: 18, fontSize: 12, color: '#b45309' }}>
                                            {selectedLog.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
                                        </ul>
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
                                    color: '#334155'
                                }}>
                                    {selectedLog.message}
                                </div>
                            </div>
                        </div>

                        <Tabs
                            defaultActiveKey="1"
                            type="card"
                            className="log-details-tabs"
                            tabBarStyle={{ margin: '0 36px', marginBottom: 0 }}
                            style={{ marginTop: '-12px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
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
                            <Tag color={stepDetails?.status === 'Success' ? 'success' : 'warning'} style={{
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
                width={950}
                style={{ top: 50 }}
                styles={{
                    header: { borderBottom: '1px solid #f1f5f9', padding: '16px 24px' },
                    body: {
                        padding: 0,
                        height: 'calc(100vh - 250px)',
                        minHeight: '350px',
                        maxHeight: '550px',
                        display: 'flex',
                        flexDirection: 'column',
                        overflowY: 'hidden'
                    }
                }}
            >
                {stepDetails && (
                    <Tabs
                        className="log-details-tabs"
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                        tabBarStyle={{ padding: '0 24px', marginBottom: 0 }}
                        items={[
                            {
                                key: 'request',
                                label: <Space><CloudUploadOutlined /> Request Payload</Space>,
                                children: (
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                        <div style={{
                                            padding: '16px 24px',
                                            background: '#f8fafc',
                                            borderBottom: '1px solid #e2e8f0',
                                            flexShrink: 0
                                        }}>
                                            <Text type="secondary" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>Endpoint URL</Text>
                                            <Input
                                                readOnly
                                                value={stepDetails.raw?.request?.url}
                                                addonBefore={
                                                    <div style={{
                                                        fontWeight: 800,
                                                        fontSize: '11px',
                                                        color: stepDetails.raw?.request?.method === 'POST' ? '#0ea5e9' : '#6366f1',
                                                        padding: '0 8px',
                                                        minWidth: 40,
                                                        textAlign: 'center'
                                                    }}>
                                                        {stepDetails.raw?.request?.method || 'POST'}
                                                    </div>
                                                }
                                                suffix={
                                                    <Tooltip title="Copy URL">
                                                        <Button
                                                            size="small"
                                                            type="text"
                                                            icon={<CopyOutlined style={{ color: '#94a3b8' }} />}
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(stepDetails.raw?.request?.url);
                                                                message.success('URL copied');
                                                            }}
                                                        />
                                                    </Tooltip>
                                                }
                                                style={{
                                                    borderRadius: '8px',
                                                    overflow: 'hidden',
                                                    fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
                                                    fontSize: '12px',
                                                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                                                }}
                                            />
                                        </div>
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
                                    </div>
                                )
                            },
                            {
                                key: 'response',
                                label: <Space><CloudDownloadOutlined /> Response Body</Space>,
                                children: (
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
