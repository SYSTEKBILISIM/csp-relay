import React, { useEffect, useState } from 'react';
import { Modal, Form, Tabs, Button, Input, Space, Empty, Typography, Tag, Table, Tooltip, Select, Switch, message } from 'antd';
import { PlusOutlined, DeleteOutlined, BuildOutlined, PushpinOutlined, TableOutlined, SettingOutlined, InfoCircleFilled, FormOutlined } from '@ant-design/icons';
import { MappingFields } from './mapping/MappingFields';
import { GridMappingConfig } from './mapping/GridMappingConfig';
import { MappingConfigModal } from './mapping/MappingConfigModal';
import { ResizableTitle } from './ResizableTitle';

const { Text } = Typography;
const { Option } = Select;




// --- Main Modal ---
export const ParametersModal = ({ visible, onCancel, onSave, initialValues, excelColumns, constructInternalUrl, sheets, sheetColumns, currentColumns, hideFlowParams = false, showInherit = true }) => {
    const [form] = Form.useForm();

    // State for the sub-modal
    const [configModalVisible, setConfigModalVisible] = useState(false);
    const [currentList, setCurrentList] = useState(null); // 'flowParams' or 'formParams'
    const [currentIndex, setCurrentIndex] = useState(null);
    const [currentMapping, setCurrentMapping] = useState(null);
    const [currentType, setCurrentType] = useState('Value');

    // Add resizable columns state. Giving the last one no explicit width allows it to take up remaining space.
    const [colWidths, setColWidths] = useState({ key: 250, source: 150, action: 80 });
    const handleResize = key => (e, { size }) => {
        setColWidths(prev => ({ ...prev, [key]: size.width }));
    };

    useEffect(() => {
        if (visible) {
            form.resetFields();
            if (initialValues) {
                form.setFieldsValue(initialValues);
            }
        }
    }, [visible]);

    const handleConfigure = (listName, index) => {
        const item = form.getFieldValue([listName, index]);
        setCurrentList(listName);
        setCurrentIndex(index);
        setCurrentMapping(item?.mapping || {});
        setCurrentType(item?.type || 'Value');
        setConfigModalVisible(true);
    };

    const handleConfigSave = (newMapping) => {
        // Update the specific item's mapping directly using the path
        // This ensures better compatibility with Form.List tracking
        console.log('Saving config for:', currentList, currentIndex, newMapping);
        form.setFieldValue([currentList, currentIndex, 'mapping'], newMapping);

        // Force a re-render of the specific field if needed, but setFieldValue should trigger listeners
        setConfigModalVisible(false);
    };

    const columns = (listName, remove) => [
        {
            title: <span style={{ fontSize: '13px', fontWeight: 500 }}>Parameter Key</span>,
            dataIndex: 'key',
            key: 'key',
            width: colWidths.key,
            render: (_, field) => {
                const { key, ...restField } = field;
                return (
                    <Form.Item
                        key={key}
                        {...restField}
                        name={[field.name, 'key']}
                        rules={[{ required: true, message: 'Please enter Parameter Name' }]}
                        style={{ marginBottom: 0 }}
                    >
                        <Input placeholder="Key Name" size="small" style={{ fontSize: '12px', height: '28px', padding: '4px 8px' }} />
                    </Form.Item>
                );
            }
        },
        // Type column removed per user request
        {
            title: <span style={{ fontSize: '13px', fontWeight: 500 }}>Configuration</span>,
            key: 'source',
            // No fixed width allows this column to stretch and fill responsive modal space
            render: (_, field) => (
                <>
                    {/* Hidden Item to ensure mapping object is registered and included in validateFields */}
                    <Form.Item name={[field.name, 'mapping']} hidden>
                        <div />
                    </Form.Item>

                    <Form.Item shouldUpdate noStyle>
                        {({ getFieldValue }) => {
                            const mapping = getFieldValue([listName, field.name, 'mapping']) || {};

                            if (!mapping || !mapping.source) {
                                return <Tag style={{ margin: 0 }} icon={<SettingOutlined spin />} color="default">Needs Config</Tag>;
                            }

                            const source = mapping.source || 'Grid';
                            let color = 'cyan';
                            let icon = <TableOutlined />;
                            let text = source;

                            if (source === 'Fixed') {
                                color = 'orange';
                                icon = <PushpinOutlined />;
                                text = mapping.fixedValue ? `Fixed: ${mapping.fixedValue}` : 'Fixed (Empty)';
                            } else if (source === 'API') {
                                color = 'geekblue';
                                icon = <BuildOutlined />;
                                text = 'API Connection';
                            } else if (source === 'Excel') {
                                text = mapping.valueCol ? `Excel: ${mapping.valueCol}` : 'Excel (Select Column)';
                            } else if (source === 'FormControl') {
                                color = 'green';
                                icon = <FormOutlined />;
                                text = mapping.controlName ? `Form: ${mapping.controlName}.${mapping.controlProperty || 'Value'}` : 'Form Field';
                            } else {
                                // Default grid/object summary
                                color = 'blue';
                                icon = <TableOutlined />;
                                text = 'Object config';
                            }

                            return (
                                <Tag color={color} style={{ margin: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'middle' }}>
                                    {icon} {text}
                                </Tag>
                            );
                        }}
                    </Form.Item>
                </>
            )
        },
        {
            title: <span style={{ fontSize: '13px', fontWeight: 500 }}>Action</span>,
            key: 'action',
            width: colWidths.action,
            render: (_, field) => (
                <Space>
                    <Tooltip title="Configure Mapping">
                        <Button
                            size="small"
                            icon={<SettingOutlined />}
                            onClick={() => handleConfigure(listName, field.name)}
                        />
                    </Tooltip>
                    <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(field.name)}
                    />
                </Space>
            )
        }
    ];

    const renderList = (name) => (
        <Form.List name={name}>
            {(fields, { add, remove }) => {
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div style={{ marginBottom: 16, textAlign: 'right' }}>
                            <Button type="dashed" onClick={() => add({ key: '', type: 'Object' })} icon={<PlusOutlined />}>
                                Add Parameter
                            </Button>
                        </div>
                        <Table
                            components={{ header: { cell: ResizableTitle } }}
                            dataSource={fields}
                            columns={columns(name, remove).map(col => ({
                                ...col,
                                onHeaderCell: column => ({
                                    width: column.width,
                                    onResize: handleResize(column.key)
                                })
                            }))}
                            pagination={false}
                            size="small"
                            bordered
                            rowKey="key"
                            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No parameters" /> }}
                        />
                    </div>
                );
            }}
        </Form.List>
    );

    return (
        <>
            <Modal
                open={visible}
                title="Configure Parameters"
                onCancel={onCancel}
                onOk={() => form.validateFields().then(onSave)}
                width={600}
                zIndex={1005} // Sit above GridMappingConfig (1002)
                destroyOnHidden
                maskClosable={false}
                style={{ top: 50 }}
                styles={{ body: { height: '480px', padding: 0 } }}
            >
                <Form form={form} layout="vertical" preserve={true} style={{ height: '100%' }}>
                    <Tabs
                        defaultActiveKey={hideFlowParams ? "2" : "1"}
                        tabBarStyle={{ padding: '0 24px', marginBottom: 0 }}
                        items={[
                            !hideFlowParams && {
                                key: '1',
                                label: 'Flow Parameters',
                                children: <div style={{ height: '400px', padding: 16, overflowY: 'auto' }}>{renderList('flowParams')}</div>
                            },
                            {
                                key: '2',
                                label: 'Form Parameters',
                                children: <div style={{ height: '400px', padding: 16, overflowY: 'auto' }}>{renderList('formParams')}</div>
                            },
                            {
                                key: '3',
                                label: 'LoginAs Settings',
                                children: (
                                    <div style={{ height: '400px', padding: 16, overflowY: 'hidden' }}>
                                        <div style={{ marginBottom: 16 }}>
                                            <div style={{ 
                                                marginBottom: 16, 
                                                padding: '12px 16px', 
                                                background: '#f0f9ff', 
                                                borderRadius: 10, 
                                                border: '1px solid #e0f2fe',
                                                display: 'flex',
                                                gap: 12
                                            }}>
                                                <InfoCircleFilled style={{ color: '#0ea5e9', fontSize: 14, marginTop: 2 }} />
                                                <Text type="secondary" style={{ fontSize: 13, color: '#0369a1', lineHeight: '1.5' }}>
                                                    The selected column must contain the username of the users defined in the system. LoginAs will be skipped for empty values.
                                                </Text>
                                            </div>

                                            {/* Unified Security Settings Card */}
                                            <div style={{
                                                background: '#fff',
                                                borderRadius: '12px',
                                                border: '1px solid #f1f5f9',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                                                overflow: 'hidden'
                                            }}>
                                                {/* Parent Inheritance Row - Only shown if not at root level */}
                                                {showInherit && (
                                                    <div style={{
                                                        padding: '16px 20px',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        background: '#fff'
                                                    }}>
                                                        <div style={{ flex: 1, paddingRight: 20 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                                <Text strong style={{ fontSize: 14, color: '#1e293b' }}>Inherit Parent Security Context</Text>
                                                                <Tag color="blue" style={{ fontSize: 10, borderRadius: 4, height: 18, lineHeight: '18px' }}>Global</Tag>
                                                            </div>
                                                            <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                                                                Automatically propagate parent form LoginAs settings.
                                                            </Text>
                                                        </div>
                                                        <Form.Item name="inheritLoginAs" valuePropName="checked" initialValue={true} style={{ marginBottom: 0 }}>
                                                            <Switch 
                                                                size="middle" 
                                                                onChange={(checked) => {
                                                                    if (checked) {
                                                                        form.setFieldsValue({ loginAsEnabled: false, loginAsColumn: null });
                                                                    }
                                                                }}
                                                            />
                                                        </Form.Item>
                                                    </div>
                                                )}

                                                {/* Security Configuration Section */}
                                                <Form.Item noStyle shouldUpdate={(prev, curr) => prev.inheritLoginAs !== curr.inheritLoginAs}>
                                                    {({ getFieldValue }) => (!showInherit || !getFieldValue('inheritLoginAs')) && (
                                                        <div style={{ 
                                                            borderTop: showInherit ? '1px solid #f8fafc' : 'none', 
                                                            background: '#fcfcfc', 
                                                            padding: '16px 20px', 
                                                            animation: 'fadeIn 0.3s' 
                                                        }}>
                                                            <div style={{ 
                                                                display: 'flex', 
                                                                justifyContent: 'space-between', 
                                                                alignItems: 'center', 
                                                                marginBottom: getFieldValue('loginAsEnabled') ? 12 : 0 
                                                            }}>
                                                                <div>
                                                                    <Text strong style={{ fontSize: 13, color: '#334155' }}>
                                                                        {showInherit ? 'Manual LoginAs Override' : 'Enable LoginAs Support'}
                                                                    </Text>
                                                                    <Text type="secondary" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
                                                                        {showInherit ? 'Explicitly define target username column.' : 'Select the Excel column containing the usernames.'}
                                                                    </Text>
                                                                </div>
                                                                <Form.Item name="loginAsEnabled" valuePropName="checked" style={{ marginBottom: 0 }}>
                                                                    <Switch 
                                                                        size="middle" 
                                                                        onChange={(checked) => {
                                                                            if (!checked) {
                                                                                form.setFieldsValue({ loginAsColumn: null });
                                                                            }
                                                                        }}
                                                                    />
                                                                </Form.Item>
                                                            </div>

                                                            <Form.Item
                                                                noStyle
                                                                shouldUpdate={(prevValues, currentValues) => prevValues.loginAsEnabled !== currentValues.loginAsEnabled}
                                                            >
                                                                {({ getFieldValue }) =>
                                                                    getFieldValue('loginAsEnabled') ? (
                                                                        <div style={{ marginTop: 12, animation: 'fadeIn 0.2s' }}>
                                                                            <Form.Item
                                                                                name="loginAsColumn"
                                                                                label={<Text strong style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Target Excel Username Column</Text>}
                                                                                rules={[{ required: true, message: 'Please select Target Excel Username Column' }]}
                                                                                style={{ width: '100%', marginBottom: 0 }}
                                                                            >
                                                                                <Select
                                                                                    placeholder="Select Excel Column"
                                                                                    options={(excelColumns || []).map(c => ({ label: c, value: c }))}
                                                                                    size="middle"
                                                                                    showSearch
                                                                                    style={{ width: '100%' }}
                                                                                />
                                                                            </Form.Item>
                                                                        </div>
                                                                    ) : null
                                                                }
                                                            </Form.Item>
                                                        </div>
                                                    )}
                                                </Form.Item>
                                            </div>
                                        </div>
                                    </div>
                                )
                            },
                            {
                                key: '4',
                                label: 'System Settings',
                                children: (
                                    <div style={{ height: '400px', padding: 24, overflowY: 'auto' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                            <div style={{ 
                                                padding: '12px 16px', 
                                                background: '#f8fafc', 
                                                borderRadius: 10, 
                                                border: '1px solid #e2e8f0',
                                                display: 'flex',
                                                gap: 12
                                            }}>
                                                <InfoCircleFilled style={{ color: '#64748b', fontSize: 14, marginTop: 2 }} />
                                                <Text type="secondary" style={{ fontSize: 13, color: '#334155', lineHeight: '1.5' }}>
                                                    Configure global system parameters, execution thresholds, and limits for the transfer process.
                                                </Text>
                                            </div>

                                            {/* API Match Threshold Slider / Selector */}
                                            <div style={{
                                                background: '#fff',
                                                borderRadius: '12px',
                                                border: '1px solid #f1f5f9',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                                                padding: '16px 20px'
                                            }}>
                                                <div style={{ marginBottom: 12 }}>
                                                    <Text strong style={{ fontSize: 14, color: '#1e293b' }}>API Value Match Threshold</Text>
                                                    <Text type="secondary" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
                                                        Minimum similarity ratio required for fuzzy search field lookups.
                                                    </Text>
                                                </div>
                                                <Form.Item
                                                    name="apiMatchThreshold"
                                                    initialValue={0.9}
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <Select
                                                        style={{ width: '100%' }}
                                                        options={[
                                                            { label: '100% (Exact Matches Only)', value: 1.0 },
                                                            { label: '95% (Highly Restrictive Similarity)', value: 0.95 },
                                                            { label: '90% (Recommended Default)', value: 0.90 },
                                                            { label: '85% (Standard Fuzzy)', value: 0.85 },
                                                            { label: '80% (Moderate Similarity)', value: 0.80 },
                                                            { label: '70% (Highly Permissive Fuzzy)', value: 0.70 },
                                                            { label: '50% (Extremely Broad Match)', value: 0.50 }
                                                        ]}
                                                    />
                                                </Form.Item>
                                            </div>

                                            {/* Concurrent Request Limit for RelatedGrid */}
                                            <div style={{
                                                background: '#fff',
                                                borderRadius: '12px',
                                                border: '1px solid #f1f5f9',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                                                padding: '16px 20px'
                                            }}>
                                                <div style={{ marginBottom: 12 }}>
                                                    <Text strong style={{ fontSize: 14, color: '#1e293b' }}>Concurrent RelatedGrid Requests</Text>
                                                    <Text type="secondary" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
                                                        Maximum concurrent HTTP request chunk size for related grid rows submission.
                                                    </Text>
                                                </div>
                                                <Form.Item
                                                    name="relatedGridChunkSize"
                                                    initialValue={5}
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <Select
                                                        style={{ width: '100%' }}
                                                        options={[
                                                            { label: '1 (Strictly Sequential)', value: 1 },
                                                            { label: '3 (Low Traffic Concurrency)', value: 3 },
                                                            { label: '5 (Recommended Default)', value: 5 },
                                                            { label: '10 (High Parallel Performance)', value: 10 },
                                                            { label: '20 (Max Power / High Risk)', value: 20 }
                                                        ]}
                                                    />
                                                </Form.Item>
                                            </div>

                                            {/* LRU Cache Limit */}
                                            <div style={{
                                                background: '#fff',
                                                borderRadius: '12px',
                                                border: '1px solid #f1f5f9',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                                                padding: '16px 20px'
                                            }}>
                                                <div style={{ marginBottom: 12 }}>
                                                    <Text strong style={{ fontSize: 14, color: '#1e293b' }}>API Cache Size Limit</Text>
                                                    <Text type="secondary" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
                                                        Maximum number of unique query results held in session memory.
                                                    </Text>
                                                </div>
                                                <Form.Item
                                                    name="apiCacheLimit"
                                                    initialValue={50}
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <Select
                                                        style={{ width: '100%' }}
                                                        options={[
                                                            { label: '10 (Minimal Footprint Cache)', value: 10 },
                                                            { label: '25 (Sleek Session Cache)', value: 25 },
                                                            { label: '50 (Recommended Default)', value: 50 },
                                                            { label: '100 (Extensive Cache)', value: 100 },
                                                            { label: '200 (Heavy-load Cache)', value: 200 }
                                                        ]}
                                                    />
                                                </Form.Item>
                                            </div>
                                        </div>
                                    </div>
                                )
                            }
                        ].filter(Boolean)}
                    />
                </Form>
            </Modal>

            {/* Sub-Modal for Editing Mapping */}
            <MappingConfigModal
                visible={configModalVisible}
                onCancel={() => setConfigModalVisible(false)}
                onSave={handleConfigSave}
                initialValues={currentMapping}
                excelColumns={excelColumns}
                constructInternalUrl={constructInternalUrl}
                type={currentType}
                sheetColumns={sheetColumns}
                currentColumns={currentColumns}
                title="Configure Parameter Mapping"
                width={750}
                zIndex={1010}
            />
        </>
    );
};
