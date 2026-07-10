import React from 'react';
import { Card, Form, Row, Col, Typography, Segmented, Select, Input, Space, Popover, Divider, Collapse, Tag, Steps, AutoComplete, Badge, Button, Checkbox } from 'antd';
import {
    TableOutlined, BuildOutlined, PushpinOutlined, InfoCircleOutlined,
    LinkOutlined, ArrowRightOutlined, GlobalOutlined, SearchOutlined,
    NodeIndexOutlined, EyeOutlined, InfoCircleFilled, ArrowLeftOutlined,
    FormOutlined
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
    const inputRefs = React.useRef({});
    const filterCache = React.useRef({ inputValue: null, scopeColumns: null, hasAnyMatch: false, searchVal: '' });

    const memoizedOptions = React.useMemo(() => {
        return (scopeColumns || [])
            .filter(col => col !== undefined && col !== null && col !== '')
            .map(col => ({ value: `{{${col}}}` }));
    }, [scopeColumns]);

    const getNestedValue = (obj, path) => {
        if (!path || !obj) return undefined;
        const keys = Array.isArray(path) ? path : [path];
        let current = obj;
        for (const key of keys) {
            if (current === null || current === undefined) return undefined;
            current = current[key];
        }
        return current;
    };

    const shouldFormUpdate = (prev, curr) => {
        const fields = ["source", "dataType", "apiType", "apiUrl", "nonEmptyIsTrue", "otherValuesAreFalse", "parameters", "controlName", "controlProperty"];
        for (const field of fields) {
            const path = getName(field);
            if (JSON.stringify(getNestedValue(prev, path)) !== JSON.stringify(getNestedValue(curr, path))) {
                return true;
            }
        }
        return false;
    };

    const handleTemplateSearch = (val, fieldKey) => {
        lastSearchValues.current[fieldKey] = val;
    };

    const handleTemplateSelect = (value, fieldKey) => {
        const prevVal = lastSearchValues.current[fieldKey] || '';
        const inputEl = inputRefs.current[fieldKey];
        
        if (!inputEl) {
            // Fallback to programmatic updates if element is not ready
            const lastTagCloseIndex = prevVal.lastIndexOf('}}');
            let base = prevVal;
            const lastTagOpenIndex = prevVal.lastIndexOf('{{');
            if (lastTagOpenIndex !== -1 && lastTagOpenIndex > lastTagCloseIndex) {
                base = prevVal.substring(0, lastTagOpenIndex);
            }
            const separator = (base && !base.endsWith(' ') && !base.endsWith('{')) ? ' ' : '';
            const newValue = base + separator + value;
            formInstance.setFieldValue(getName(fieldKey), newValue);
            lastSearchValues.current[fieldKey] = newValue;
            return;
        }

        // Focus the input natively so execCommand applies to it
        inputEl.focus();

        const start = inputEl.selectionStart;
        const end = inputEl.selectionEnd;

        if (start !== end) {
            // Highlighting selection exists: replace it natively (preserves undo/redo stack)
            document.execCommand('insertText', false, value);
        } else {
            // No selection (just cursor): replace active typing tag if exists
            const lastTagCloseIndex = prevVal.lastIndexOf('}}');
            const lastTagOpenIndex = prevVal.lastIndexOf('{{');
            
            if (lastTagOpenIndex !== -1 && lastTagOpenIndex > lastTagCloseIndex) {
                // Select the text starting from '{{' to the end of input
                inputEl.setSelectionRange(lastTagOpenIndex, prevVal.length);
                document.execCommand('insertText', false, value);
            } else {
                // Otherwise, append to the end
                const separator = (prevVal && !prevVal.endsWith(' ') && !prevVal.endsWith('{')) ? ' ' : '';
                inputEl.setSelectionRange(prevVal.length, prevVal.length);
                document.execCommand('insertText', false, separator + value);
            }
        }

        // Sync local search cache with the new value
        lastSearchValues.current[fieldKey] = formInstance.getFieldValue(getName(fieldKey));
    };

    const templateOptionsFilter = (inputValue, option) => {
        if (!inputValue) return true;
        
        if (
            filterCache.current.inputValue !== inputValue ||
            filterCache.current.scopeColumns !== scopeColumns
        ) {
            const lastPart = inputValue.split('}}').pop().trim();
            if (!lastPart) {
                filterCache.current = {
                    inputValue,
                    scopeColumns,
                    hasAnyMatch: false,
                    searchVal: ''
                };
            } else {
                const searchVal = lastPart.toUpperCase();
                const cleanedCols = (scopeColumns || []).filter(col => col !== undefined && col !== null && col !== '');
                const hasAnyMatch = cleanedCols.some(col => `{{${col}}}`.toUpperCase().includes(searchVal));
                filterCache.current = {
                    inputValue,
                    scopeColumns,
                    hasAnyMatch,
                    searchVal
                };
            }
        }

        const { hasAnyMatch, searchVal } = filterCache.current;
        if (!searchVal || !hasAnyMatch) return true;
        return option.value.toUpperCase().indexOf(searchVal) !== -1;
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
                <Row gutter={16} align="middle">
                    <Col span={11}>
                        <Form.Item
                            name={getName("source")}
                            label={<Text strong style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mapping Mode</Text>}
                            style={{ marginBottom: 0 }}
                        >
                            <Segmented
                                options={[
                                    { label: 'Excel', value: 'Excel', icon: <TableOutlined /> },
                                    { label: 'API', value: 'API', icon: <BuildOutlined /> },
                                    { label: 'Fixed', value: 'Fixed', icon: <PushpinOutlined /> },
                                    { label: 'Form Field', value: 'FormControl', icon: <FormOutlined /> }
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
                    <Col span={6}>
                        <Form.Item
                            name={getName("isArray")}
                            label={
                                <Space size={4}>
                                    <Text strong style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Structure</Text>
                                    <Popover
                                        content={
                                            <div style={{ maxWidth: 260, fontSize: 12 }}>
                                                <Text strong>Array Mode</Text>
                                                <p style={{ margin: '4px 0 0 0', color: '#64748b' }}>
                                                    If enabled, cell values like <Text code>["abc", "def"]</Text> will be parsed as a JSON array and resolved/mapped individually.
                                                </p>
                                            </div>
                                        }
                                        trigger="hover"
                                        placement="topRight"
                                    >
                                        <InfoCircleOutlined style={{ fontSize: 10, color: '#94a3b8', cursor: 'help' }} />
                                    </Popover>
                                </Space>
                            }
                            style={{ marginBottom: 0 }}
                        >
                            <Segmented
                                options={[
                                    { label: 'Single', value: false },
                                    { label: 'Array', value: true }
                                ]}
                                block
                                size="middle"
                                style={{ height: 32, display: 'flex', alignItems: 'center' }}
                                onChange={(val) => {
                                    const path = getName("isArray");
                                    formInstance.setFieldValue(path, val);
                                }}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={7}>
                        <Form.Item
                            name={getName("dataType")}
                            label={<Text strong style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target Type</Text>}
                            rules={[{ required: true, message: 'Please select Target Type' }]}
                            style={{ marginBottom: 0 }}
                        >
                            <Select
                                placeholder="Type"
                                variant="filled"
                                style={{ borderRadius: 8, width: '100%', height: 32 }}
                                size="middle"
                                options={[
                                    { label: 'String', value: 'String' },
                                    { label: 'Integer', value: 'Integer' },
                                    { label: 'Decimal', value: 'Decimal' },
                                    { label: 'Date', value: 'Date' },
                                    { label: 'Boolean', value: 'Boolean' }
                                ]}
                            />
                        </Form.Item>
                    </Col>

                </Row>
            </div>

            {/* Dynamic Sections Wrapper */}
            <Form.Item noStyle shouldUpdate={shouldFormUpdate}>
                {({ getFieldValue }) => {
                    const sourceState = getFieldValue(getName("source")) || 'Excel';
                    const dataTypeState = getFieldValue(getName("dataType")) || 'String';
                    const apiType = getFieldValue(getName("apiType")) || 'Internal';
                    const url = getFieldValue(getName('apiUrl')) || '';
                    const body = getFieldValue(getName('apiBody')) || '';
                    const headers = getFieldValue(getName('apiHeaders')) || '';

                    return (
                        <>
                            {dataTypeState === 'Boolean' && (
                                <div style={{
                                    animation: 'fadeIn 0.2s',
                                    background: '#f8faff',
                                    padding: '12px 14px',
                                    borderRadius: '12px',
                                    borderTop: '4px solid #1677ff',
                                    border: '1px solid #eef2f6',
                                    marginBottom: 16
                                }}>
                                    <Text strong style={{ fontSize: 12, color: '#1e293b', display: 'block', marginBottom: 12 }}>
                                        Boolean Value Mapping Settings
                                    </Text>

                                    {/* Row 1: Checkboxes aligned in one row with 2-1-1 proportions (12-6-6) */}
                                    <Row gutter={16} style={{ marginBottom: getFieldValue(getName("nonEmptyIsTrue")) ? 0 : 12 }}>
                                        <Col span={12}>
                                            <Form.Item
                                                name={getName("nonEmptyIsTrue")}
                                                valuePropName="checked"
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Checkbox style={{ fontSize: 11, fontWeight: 500 }}>
                                                    Map any non-empty value to True
                                                </Checkbox>
                                            </Form.Item>
                                        </Col>

                                        {!getFieldValue(getName("nonEmptyIsTrue")) && (
                                            <>
                                                <Col span={6}>
                                                    <Form.Item
                                                        name={getName("otherValuesAreFalse")}
                                                        valuePropName="checked"
                                                        style={{ marginBottom: 0 }}
                                                    >
                                                        <Checkbox style={{ fontSize: 11, fontWeight: 500 }}>
                                                            Treat unmatched as False
                                                        </Checkbox>
                                                    </Form.Item>
                                                </Col>
                                                <Col span={6}>
                                                    <Form.Item
                                                        name={getName("emptyIsFalse")}
                                                        valuePropName="checked"
                                                        style={{ marginBottom: 0 }}
                                                    >
                                                        <Checkbox style={{ fontSize: 11, fontWeight: 500 }}>
                                                            Treat Null/Empty as False
                                                        </Checkbox>
                                                    </Form.Item>
                                                </Col>
                                            </>
                                        )}
                                    </Row>

                                    {/* Row 2: Inputs (True / False) */}
                                    {!getFieldValue(getName("nonEmptyIsTrue")) && (
                                        <Row gutter={16}>
                                            {/* True Values Column */}
                                            <Col span={getFieldValue(getName("otherValuesAreFalse")) ? 24 : 12}>
                                                <Form.Item
                                                    name={getName("trueValues")}
                                                    label={<Text strong style={{ fontSize: 11, color: '#1e293b' }}>True Values (Comma separated)</Text>}
                                                    rules={[{ required: true, message: 'Bu alanın doldurulması zorunludur' }]}
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <Input size="small" placeholder="e.g. yes, true, active" className="boolean-settings-input" />
                                                </Form.Item>
                                            </Col>

                                            {/* False Values Column */}
                                            {!getFieldValue(getName("otherValuesAreFalse")) && (
                                                <Col span={12}>
                                                    <Form.Item
                                                        name={getName("falseValues")}
                                                        label={<Text strong style={{ fontSize: 11, color: '#1e293b' }}>False Values (Comma separated)</Text>}
                                                        rules={[{ required: true, message: 'Bu alanın doldurulması zorunludur' }]}
                                                        style={{ marginBottom: 0 }}
                                                    >
                                                        <Input size="small" placeholder="e.g. no, false, inactive" className="boolean-settings-input" />
                                                    </Form.Item>
                                                </Col>
                                            )}
                                        </Row>
                                    )}
                                </div>
                            )}

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
                                            {(scopeColumns || []).filter(col => col !== undefined && col !== null && col !== '').map(col => <Option key={col} value={col}>{col}</Option>)}
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
                                                        size="small"
                                                        prefix={apiType === 'Internal' ? <BuildOutlined style={{ color: '#3b82f6' }} /> : <GlobalOutlined style={{ color: '#3b82f6' }} />}
                                                        placeholder={apiType === 'Internal' ? "e.g. GetCustomerData" : "https://api..."}
                                                        variant="filled"
                                                        style={{ borderRadius: 6, background: '#f8fafc' }}
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
                                                        {
                                                            key: 'headers', label: <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                                                            )
                                                        },
                                                        {
                                                            key: 'body', label: <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                                                            )
                                                        }
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
                                                                <Input size="small" placeholder="result.result" variant="filled" style={{ borderRadius: 6, background: '#f8fafc' }} />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col span={12}>
                                                            <Form.Item name={getName("displayFormat")} label={<Text strong style={{ fontSize: 11 }}>Match Property</Text>} rules={[{ required: true, message: 'Please enter Match Property' }]} style={{ marginBottom: 12 }}>
                                                                <Input size="small" placeholder="{{Name}}" variant="filled" style={{ borderRadius: 6, background: '#f8fafc' }} />
                                                            </Form.Item>
                                                        </Col>
                                                    </Row>
                                                    <Form.Item name={getName("searchKeyTemplate")} label={<Text strong style={{ fontSize: 11 }}>Excel Search Key</Text>} rules={[{ required: true, message: 'Please enter Excel Search Key' }]} style={{ marginBottom: 20 }}>
                                                        <AutoComplete
                                                            size="small"
                                                            className="mapping-autocomplete"
                                                            style={{ width: '100%' }}
                                                            options={memoizedOptions}
                                                            onSearch={(val) => handleTemplateSearch(val, "searchKeyTemplate")}
                                                            onSelect={(val) => handleTemplateSelect(val, "searchKeyTemplate")}
                                                            filterOption={templateOptionsFilter}
                                                        >
                                                            <Input 
                                                                ref={(el) => {
                                                                    if (el) {
                                                                        inputRefs.current["searchKeyTemplate"] = el.input || el;
                                                                    }
                                                                }}
                                                                size="small" 
                                                                placeholder="e.g. {{ID}}" 
                                                                variant="borderless" 
                                                                style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }} 
                                                            />
                                                        </AutoComplete>
                                                    </Form.Item>

                                                    <Row gutter={16}>
                                                        <Col span={12}>
                                                            <Form.Item name={getName("valuePath")} label={<Text strong style={{ fontSize: 11 }}>Value</Text>} rules={[{ required: true, message: 'Please enter Value Path' }]} style={{ marginBottom: 0 }}>
                                                                <Input size="small" placeholder="{{id}}" variant="filled" style={{ borderRadius: 6, background: '#f8fafc' }} />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col span={12}>
                                                            <Form.Item name={getName("textPath")} label={<Text strong style={{ fontSize: 11 }}>Text</Text>} rules={[{ required: true, message: 'Please enter Text Path' }]} style={{ marginBottom: 0 }}>
                                                                <Input size="small" placeholder="{{name}}" variant="filled" style={{ borderRadius: 6, background: '#f8fafc' }} />
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

                            {/* 3. Source: FORM CONTROL MODE */}
                            {sourceState === 'FormControl' && (
                                <div style={{
                                    animation: 'fadeIn 0.2s',
                                    background: '#f7fffb',
                                    padding: '12px 14px',
                                    borderRadius: '12px',
                                    borderTop: '4px solid #10b981',
                                    border: '1px solid #d1fae5'
                                }}>
                                    <Row gutter={16}>
                                        <Col span={16}>
                                            <Form.Item
                                                name={getName("controlName")}
                                                label={<Text strong style={{ fontSize: 12, color: '#065f46' }}>Source Form Field</Text>}
                                                rules={[{ required: true, message: 'Please enter source form field' }]}
                                                help={<Text type="secondary" style={{ fontSize: 10 }}>Reads from the live CSP form instance after fields are applied.</Text>}
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Input placeholder="e.g. dmDocumentNo" prefix={<FormOutlined style={{ color: '#10b981' }} />} />
                                            </Form.Item>
                                        </Col>
                                        <Col span={8}>
                                            <Form.Item
                                                name={getName("controlProperty")}
                                                label={<Text strong style={{ fontSize: 12, color: '#065f46' }}>Property</Text>}
                                                initialValue="Value"
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Select
                                                    options={[
                                                        { label: 'Value', value: 'Value' },
                                                        { label: 'Text', value: 'Text' }
                                                    ]}
                                                />
                                            </Form.Item>
                                        </Col>
                                    </Row>
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
                        const isArray = getFieldValue(getName('isArray'));

                        return (
                            <div style={{ flex: 1, lineHeight: '1.6' }}>
                                <Text strong style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Active Preview / Mapping logic</Text>
                                {src === 'Excel' ? (
                                    <Text style={{ fontSize: 12, color: '#334155' }}>
                                        {isArray ? (
                                            <span>
                                                Parses Excel column <Tag color="blue" bordered={false} style={{ fontSize: 11, padding: '0 4px', margin: '0 2px' }}>{val || '???'}</Tag> as a JSON array and maps each item individually.
                                            </span>
                                        ) : (
                                            <span>
                                                Maps values directly from Excel column <Tag color="blue" bordered={false} style={{ fontSize: 11, padding: '0 4px', margin: '0 2px' }}>{val || '???'}</Tag>.
                                            </span>
                                        )}
                                    </Text>
                                ) : src === 'API' ? (
                                    <Text style={{ fontSize: 12, color: '#334155' }}>
                                        {isArray ? (
                                            <span>
                                                Parses Excel cell <Text strong style={{ margin: '0 2px' }}>{txt || '???'}</Text> as a JSON array, searches API dataset, and returns list of IDs matching <Text code style={{ fontSize: 11, padding: '1px 4px' }}>{compare || '???'}</Text>.
                                            </span>
                                        ) : (
                                            <span>
                                                Searches API using Excel value <Text strong style={{ margin: '0 2px' }}>{txt || '???'}</Text> and matches against property <Text code style={{ fontSize: 11, padding: '1px 4px' }}>{compare || '???'}</Text> to find the correct ID.
                                            </span>
                                        )}
                                    </Text>
                                ) : src === 'Fixed' ? (
                                    <Text style={{ fontSize: 12, color: '#334155' }}>
                                        {isArray ? (
                                            <span>
                                                Applies a static JSON array/list: <Tag color="gold" bordered={false} style={{ fontSize: 11, padding: '0 4px', margin: '0 2px' }}>{fixedVal || '???'}</Tag>.
                                            </span>
                                        ) : (
                                            <span>
                                                Applies a static value: <Tag color="gold" bordered={false} style={{ fontSize: 11, padding: '0 4px', margin: '0 2px' }}>{fixedVal || '???'}</Tag> to all records.
                                            </span>
                                        )}
                                    </Text>
                                ) : src === 'FormControl' ? (
                                    <Text style={{ fontSize: 12, color: '#334155' }}>
                                        Reads <Tag color="green" bordered={false} style={{ fontSize: 11, padding: '0 4px', margin: '0 2px' }}>{getFieldValue(getName('controlName')) || '???'}</Tag>
                                        {'.'}{getFieldValue(getName('controlProperty')) || 'Value'} from the CSP form instance.
                                    </Text>
                                ) : null}
                            </div>
                        );
                    }}
                </Form.Item>
            </div>
        </div>
    );
};
