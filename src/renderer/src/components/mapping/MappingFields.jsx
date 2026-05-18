import React from 'react';
import { Card, Form, Row, Col, Typography, Segmented, Select, Input, Space, Popover, Divider, Collapse, Tag, Steps, AutoComplete, Badge, Button } from 'antd';
import { 
    TableOutlined, BuildOutlined, PushpinOutlined, InfoCircleOutlined, 
    LinkOutlined, ArrowRightOutlined, GlobalOutlined, SearchOutlined, 
    NodeIndexOutlined, EyeOutlined, InfoCircleFilled, ArrowLeftOutlined
} from '@ant-design/icons';
import { ParametersList } from './ParametersList';

import Editor from '@monaco-editor/react';

const { Text } = Typography;
const { Option } = Select;

export const MappingFields = ({
    formInstance,
    scopeColumns = [],
    constructInternalUrl,
    fieldPrefix = [], // Array path for nested forms
    apiStep = 0,
    setApiStep
}) => {
    // Helper to resolve field name
    const getName = (name) => {
        if (Array.isArray(name)) {
            return fieldPrefix.length > 0 ? [...fieldPrefix, ...name] : name;
        }
        return fieldPrefix.length > 0 ? [...fieldPrefix, name] : name;
    };

    // Ref to track the state of inputs BEFORE onSelect fires
    const lastSearchValues = React.useRef({});

    const handleTemplateSearch = (val, fieldKey) => {
        lastSearchValues.current[fieldKey] = val;
    };

    const handleTemplateSelect = (value, fieldKey) => {
        const prevVal = lastSearchValues.current[fieldKey] || '';
        const lastTagIndex = prevVal.lastIndexOf('}}');
        const base = lastTagIndex !== -1 ? prevVal.substring(0, lastTagIndex + 2) : '';
        const separator = (base && !base.endsWith(' ')) ? ' ' : '';
        const newValue = base + separator + value;

        formInstance.setFieldValue(getName(fieldKey), newValue);
        lastSearchValues.current[fieldKey] = newValue;
    };

    const templateOptionsFilter = (inputValue, option) => {
        if (!inputValue) return true;
        const lastPart = inputValue.split('}}').pop().trim();
        if (!lastPart) return true;
        return option.value.toUpperCase().indexOf(lastPart.toUpperCase()) !== -1;
    };

    return (
        <div style={{ padding: '2px 0' }}>
            {/* 1. Header: Source & Data Type - High Density & Aligned */}
            <div style={{
                background: '#fff',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid #eef2f6',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                marginBottom: 16
            }}>
                <Row gutter={20} align="middle">
                    <Col span={15}>
                        <Form.Item
                            name={getName("source")}
                            label={<Text strong style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mapping Mode</Text>}
                            style={{ marginBottom: 0 }}
                        >
                            <Segmented
                                options={[
                                    { label: 'Excel', value: 'Excel', icon: <TableOutlined /> },
                                    { label: 'API', value: 'API', icon: <BuildOutlined /> },
                                    { label: 'Fixed', value: 'Fixed', icon: <PushpinOutlined /> }
                                ]}
                                block
                                size="middle"
                                style={{ height: 32, display: 'flex', alignItems: 'center' }}
                                onChange={(val) => {
                                    const path = getName("source");
                                    formInstance.setFieldValue(path, val);
                                }}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={9}>
                        <Form.Item
                            name={getName("dataType")}
                            label={<Text strong style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target Type</Text>}
                            rules={[{ required: true, message: 'Please select Target Type' }]}
                            style={{ marginBottom: 0 }}
                        >
                            <Select placeholder="Type" variant="filled" style={{ borderRadius: 8, width: '100%', height: 32 }} size="middle">
                                <Option value="String">String</Option>
                                <Option value="Integer">Integer</Option>
                                <Option value="Decimal">Decimal</Option>
                                <Option value="Date">Date</Option>
                                <Option value="Boolean">Boolean</Option>
                            </Select>
                        </Form.Item>
                    </Col>
                </Row>
            </div>

            {/* Dynamic Sections Wrapper */}
            <Form.Item noStyle shouldUpdate>
                {({ getFieldValue }) => {
                    const sourceState = getFieldValue(getName("source")) || 'Excel';
                    const apiType = getFieldValue(getName("apiType")) || 'Internal';
                    const url = getFieldValue(getName('apiUrl')) || '';
                    const body = getFieldValue(getName('apiBody')) || '';
                    const headers = getFieldValue(getName('apiHeaders')) || '';

                    return (
                        <>
                            {/* 2. Source: EXCEL MODE */}
                            {sourceState === 'Excel' && (
                                <div style={{ 
                                    animation: 'fadeIn 0.2s',
                                    background: '#f8faff', 
                                    padding: '12px 14px', 
                                    borderRadius: '12px',
                                    borderTop: '4px solid #1677ff',
                                    border: '1px solid #eef2f6'
                                }}>
                                    <Form.Item
                                        name={getName("valueCol")}
                                        label={<Text strong style={{ fontSize: 12, color: '#1e293b' }}>Source Excel Column</Text>}
                                        rules={[{ required: true, message: 'Please select Source Excel Column' }]}
                                        help={<Text type="secondary" style={{ fontSize: 10 }}>Target will be mapped directly from this column.</Text>}
                                        style={{ marginBottom: 0 }}
                                    >
                                        <Select showSearch placeholder="Choose column..." style={{ width: '100%' }}>
                                            {scopeColumns.map(col => <Option key={col} value={col}>{col}</Option>)}
                                        </Select>
                                    </Form.Item>
                                </div>
                            )}

                            {/* 3. Source: API MODE - REIMAGINED WITH STEPS */}
                            {sourceState === 'API' && (
                                <div style={{
                                    animation: 'fadeIn 0.2s',
                                    background: '#fff',
                                    borderRadius: '12px',
                                    border: '1px solid #eef2f6',
                                    overflow: 'hidden',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
                                }}>
                                    {/* Compact Step Indicator */}
                                    <div style={{ padding: '14px 16px', background: '#fcfcfd', borderBottom: '1px solid #f1f5f9' }}>
                                        <div style={{ maxWidth: 520, margin: '0 auto' }}>
                                            <Steps
                                                size="small"
                                                current={apiStep}
                                                onChange={setApiStep}
                                                items={[
                                                    { title: 'Connection' },
                                                    { title: 'Payload' },
                                                    { title: 'Mapping' }
                                                ]}
                                                style={{ cursor: 'pointer' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Step Content Area */}
                                    <div style={{ padding: '12px 14px' }}>
                                        {apiStep === 0 && (
                                            <div style={{ animation: 'fadeIn 0.2s' }}>
                                                <Row gutter={16}>
                                                    <Col span={14}>
                                                        <Form.Item 
                                                            name={getName("apiType")} 
                                                            label={<Text strong style={{ fontSize: 11 }}>Topology</Text>} 
                                                            rules={[{ required: true, message: 'Please select Topology' }]} 
                                                            style={{ marginBottom: 12 }}
                                                            initialValue="Internal"
                                                        >
                                                            <Segmented
                                                                size="middle"
                                                                options={[
                                                                    { label: 'Internal', value: 'Internal' },
                                                                    { label: 'External', value: 'External' }
                                                                ]}
                                                                block
                                                                style={{ height: 32, display: 'flex', alignItems: 'center' }}
                                                                onChange={(val) => {
                                                                    const path = getName("apiType");
                                                                    formInstance.setFieldValue(path, val);
                                                                }}
                                                            />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={10}>
                                                        <Form.Item 
                                                            name={getName("apiMethod")} 
                                                            label={<Text strong style={{ fontSize: 11 }}>Method</Text>} 
                                                            rules={[{ required: true, message: 'Please select Method' }]} 
                                                            style={{ marginBottom: 12 }}
                                                            initialValue="GET"
                                                        >
                                                            <Segmented 
                                                                size="middle" 
                                                                options={['GET', 'POST', 'PUT']} 
                                                                block 
                                                                style={{ height: 32, display: 'flex', alignItems: 'center' }} 
                                                                onChange={(val) => {
                                                                    const path = getName("apiMethod");
                                                                    formInstance.setFieldValue(path, val);
                                                                }}
                                                            />
                                                        </Form.Item>
                                                    </Col>
                                                </Row>

                                                <Form.Item
                                                    name={getName("apiUrl")}
                                                    label={<Text strong style={{ fontSize: 11 }}>{apiType === 'Internal' ? "DataSource Name" : "Endpoint URL"}</Text>}
                                                    rules={[{ required: true, message: apiType === 'Internal' ? 'Please enter DataSource Name' : 'Please enter Endpoint URL' }]}
                                                    style={{ marginBottom: 4 }}
                                                >
                                                    <Input
                                                        prefix={apiType === 'Internal' ? <BuildOutlined style={{ color: '#3b82f6' }} /> : <GlobalOutlined style={{ color: '#3b82f6' }} />}
                                                        placeholder={apiType === 'Internal' ? "e.g. GetCustomerData" : "https://api..."}
                                                        variant="filled"
                                                        suffix={
                                                            apiType === 'Internal' ? (
                                                                <Popover content={<div style={{ maxWidth: 300, wordBreak: 'break-all' }}>{constructInternalUrl(url) || '...'}</div>} title="Full Internal URL" trigger="hover">
                                                                    <InfoCircleOutlined style={{ color: '#1677ff', cursor: 'help' }} />
                                                                </Popover>
                                                            ) : null
                                                        }
                                                    />
                                                </Form.Item>
                                            </div>
                                        )}

                                        {apiStep === 1 && (
                                            <div style={{ animation: 'fadeIn 0.2s' }}>
                                                {(() => {
                                                    const parameters = getFieldValue(getName('parameters')) || [];

                                                    const collapseItems = [];
                                                    if (apiType === 'Internal') {
                                                        collapseItems.push({
                                                            key: 'params',
                                                            label: (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                                    <div style={{ width: 28, height: 28, background: '#eff6ff', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                        <InfoCircleFilled style={{ color: '#3b82f6', fontSize: 14 }} />
                                                                    </div>
                                                                    <Text strong style={{ fontSize: 15, color: '#1e293b' }}>DataSource Parameters</Text>
                                                                </div>
                                                            ),
                                                            children: (
                                                                <div style={{ padding: '2px 0 2px 24px' }}>
                                                                    <ParametersList name={getName("parameters")} label="" />
                                                                </div>
                                                            )
                                                        });
                                                    }

                                                    collapseItems.push(
                                                        { key: 'headers', label: <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                            <div style={{ width: 28, height: 28, background: '#f5f3ff', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <GlobalOutlined style={{ color: '#7c3aed', fontSize: 14 }} />
                                                            </div>
                                                            <Text strong style={{ fontSize: 15, color: '#1e293b' }}>Custom Headers (JSON)</Text>
                                                        </div>, children: (
                                                            <div style={{ padding: '2px 0 2px 24px' }}>
                                                                <Form.Item name={getName("apiHeaders")} noStyle>
                                                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                                                                        <Editor height="120px" defaultLanguage="json" theme="light" options={{ minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 12 }} />
                                                                    </div>
                                                                </Form.Item>
                                                            </div>
                                                        )},
                                                        { key: 'body', label: <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                            <div style={{ width: 28, height: 28, background: '#fff1f2', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <BuildOutlined style={{ color: '#e11d48', fontSize: 14 }} />
                                                            </div>
                                                            <Text strong style={{ fontSize: 15, color: '#1e293b' }}>Request Body (JSON)</Text>
                                                        </div>, children: (
                                                            <div style={{ padding: '2px 0 2px 24px' }}>
                                                                <Form.Item name={getName("apiBody")} noStyle>
                                                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                                                                        <Editor height="120px" defaultLanguage="json" theme="light" options={{ minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 12 }} />
                                                                    </div>
                                                                </Form.Item>
                                                            </div>
                                                        )}
                                                    );

                                                    return (
                                                        <>
                                                            <Collapse 
                                                                ghost 
                                                                size="small" 
                                                                defaultActiveKey={apiType === 'Internal' ? ['params'] : ['body']}
                                                                items={collapseItems}
                                                                style={{ marginBottom: 16 }}
                                                            />
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        )}

                                        {apiStep === 2 && (
                                            <div style={{ animation: 'fadeIn 0.2s' }}>
                                                {/* Unified container for alignment - No background, light grey inputs */}
                                                <div style={{ padding: '0' }}>
                                                    <Row gutter={16}>
                                                        <Col span={12}>
                                                            <Form.Item name={getName("responsePath")} label={<Text strong style={{ fontSize: 11 }}>Items Path</Text>} rules={[{ required: true, message: 'Please enter Items Path' }]} style={{ marginBottom: 12 }} initialValue="result.result">
                                                                <Input size="small" placeholder="result.result" variant="filled" style={{ borderRadius: 6, background: '#f3f4f6' }} />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col span={12}>
                                                            <Form.Item name={getName("displayFormat")} label={<Text strong style={{ fontSize: 11 }}>Match Property</Text>} rules={[{ required: true, message: 'Please enter Match Property' }]} style={{ marginBottom: 12 }}>
                                                                    <Input size="small" placeholder="{{Name}}" variant="filled" style={{ borderRadius: 6, background: '#f3f4f6' }} />
                                                            </Form.Item>
                                                        </Col>
                                                    </Row>
                                                    <Form.Item name={getName("searchKeyTemplate")} label={<Text strong style={{ fontSize: 11 }}>Excel Search Key</Text>} rules={[{ required: true, message: 'Please enter Excel Search Key' }]} style={{ marginBottom: 20 }}>
                                                        <AutoComplete
                                                            size="small"
                                                            options={(scopeColumns || []).map(col => ({ value: `{{${col}}}` }))}
                                                            onSearch={(val) => handleTemplateSearch(val, "searchKeyTemplate")}
                                                            onSelect={(val) => handleTemplateSelect(val, "searchKeyTemplate")}
                                                            filterOption={templateOptionsFilter}
                                                        >
                                                            <Input size="small" placeholder="e.g. {{ID}}" variant="filled" style={{ borderRadius: 6, background: '#f3f4f6' }} />
                                                        </AutoComplete>
                                                    </Form.Item>

                                                    <Row gutter={16}>
                                                        <Col span={12}>
                                                            <Form.Item name={getName("valuePath")} label={<Text strong style={{ fontSize: 11 }}>Value</Text>} rules={[{ required: true, message: 'Please enter Value Path' }]} style={{ marginBottom: 0 }}>
                                                                <Input size="small" placeholder="{{id}}" variant="filled" style={{ borderRadius: 6, background: '#f3f4f6' }} />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col span={12}>
                                                            <Form.Item name={getName("textPath")} label={<Text strong style={{ fontSize: 11 }}>Text</Text>} rules={[{ required: true, message: 'Please enter Text Path' }]} style={{ marginBottom: 0 }}>
                                                                <Input size="small" placeholder="{{name}}" variant="filled" style={{ borderRadius: 6, background: '#f3f4f6' }} />
                                                            </Form.Item>
                                                        </Col>
                                                    </Row>
                                                </div>
                                            </div>
                                        )}

                                        {/* Navigation Buttons */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                                            <Button 
                                                disabled={apiStep === 0} 
                                                onClick={() => setApiStep(prev => prev - 1)}
                                                icon={<ArrowLeftOutlined />}
                                                size="small"
                                            >
                                                Back
                                            </Button>
                                            {apiStep < 2 ? (
                                                <Button 
                                                    type="primary" 
                                                    onClick={() => setApiStep(prev => prev + 1)}
                                                    icon={<ArrowRightOutlined />}
                                                    size="small"
                                                >
                                                    Next Step
                                                </Button>
                                            ) : (
                                                <div style={{ padding: '4px 8px', background: '#f0fdf4', borderRadius: 6, border: '1px solid #dcfce7' }}>
                                                    <Text type="success" strong style={{ fontSize: 11 }}>Configuration Complete</Text>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 4. Source: FIXED VALUE MODE */}
                            {sourceState === 'Fixed' && (
                                <div style={{ 
                                    animation: 'fadeIn 0.2s',
                                    background: '#fffef3', 
                                    padding: '12px 14px', 
                                    borderRadius: '12px',
                                    borderTop: '4px solid #faad14',
                                    border: '1px solid #fff1b8'
                                }}>
                                    <Row gutter={16}>
                                        <Col span={12}>
                                            <Form.Item
                                                name={getName("fixedValue")}
                                                label={<Text strong style={{ fontSize: 12, color: '#854d0e' }}>Value</Text>}
                                                rules={[{ required: true, message: 'Please enter Value' }]}
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Input placeholder="Enter value..." prefix={<PushpinOutlined style={{ color: '#faad14' }} />} />
                                            </Form.Item>
                                        </Col>
                                        <Col span={12}>
                                            <Form.Item
                                                name={getName("fixedText")}
                                                label={<Text strong style={{ fontSize: 12, color: '#854d0e' }}>Text</Text>}
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Input placeholder="Display text..." prefix={<InfoCircleOutlined style={{ color: '#faad14' }} />} />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                </div>
                            )}
                        </>
                    );
                }}
            </Form.Item>

            {/* Redesigned Summary Footer - More Compact */}
            <div style={{ 
                marginTop: 20, 
                padding: '10px 14px', 
                borderRadius: '10px', 
                background: '#f8fafc', 
                border: '1px solid #e2e8f0',
                display: 'flex', 
                alignItems: 'center', 
                gap: 12
            }}>
                <Badge status="processing" color="#1677ff" />
                <Form.Item shouldUpdate noStyle>
                    {({ getFieldValue }) => {
                        const src = getFieldValue(getName('source'));
                        const txt = getFieldValue(getName('searchKeyTemplate')) || getFieldValue(getName('textCol'));
                        const val = getFieldValue(getName('valueCol'));
                        const compare = getFieldValue(getName('displayFormat'));
                        const fixedVal = getFieldValue(getName('fixedValue'));

                        return (
                            <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <Text strong style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', display: 'block' }}>Active Preview</Text>
                                {src === 'Excel' ? (
                                    <Text style={{ fontSize: 12 }}>Mapped from <Tag color="blue" bordered={false} style={{ fontSize: 11, padding: '0 4px' }}>{val || '???'}</Tag></Text>
                                ) : src === 'API' ? (
                                    <Text style={{ fontSize: 12 }}>
                                        API Search <Text strong>{txt || '???'}</Text> (Match <Text code style={{ fontSize: 10 }}>{compare || '???'}</Text>)
                                    </Text>
                                ) : src === 'Fixed' ? (
                                    <Text style={{ fontSize: 12 }}>Static: <Tag color="gold" bordered={false} style={{ fontSize: 11 }}>{fixedVal || '???'}</Tag></Text>
                                ) : null}
                            </div>
                        );
                    }}
                </Form.Item>
            </div>
        </div>
    );
};
