import React, { useState } from 'react';
import { Form, Row, Col, Select, Input, Typography, Table, Space, Button, Tooltip, Tag, Modal, Switch } from 'antd';
import {
    LinkOutlined, BuildOutlined, TableOutlined, PlusOutlined,
    DeleteOutlined, SettingOutlined, ArrowUpOutlined, ArrowDownOutlined,
    InteractionOutlined, InfoCircleFilled, HolderOutlined
} from '@ant-design/icons';
import { MappingFields } from './MappingFields';
import { RelatedDocumentConfig } from './RelatedDocumentConfig';
import { ParametersModal } from '../ParametersModal';
import { ResizableTitle } from '../ResizableTitle';

const { Text } = Typography;
const { Option } = Select;

export const GridMappingConfig = ({ form, type, currentColumns = [], sheetColumns = {}, excelColumns = [], constructInternalUrl }) => {
    const [isColumnModalVisible, setIsColumnModalVisible] = useState(false);
    const [activeColumnIndex, setActiveColumnIndex] = useState(null);
    const [columnForm] = Form.useForm();
    const [isParamsModalVisible, setIsParamsModalVisible] = useState(false);
    const [apiStep, setApiStep] = useState(0);

    const [colWidths, setColWidths] = useState({ sort: 50, name: 160, type: 180, source: 180, action: 90 });
    const [draggedOverIndex, setDraggedOverIndex] = useState(-1);

    const handleResize = key => (e, { size }) => {
        setColWidths(prev => ({ ...prev, [key]: size.width }));
    };

    const handleColumnConfigure = (index) => {
        setActiveColumnIndex(index);
        const gridColumns = form.getFieldValue('gridColumns') || [];
        const columnData = gridColumns[index] || {};

        const mapping = columnData.mapping || {
            source: 'Excel',
            dataType: columnData.dataType || 'String',
            apiType: 'Internal',
            responsePath: 'result.result',
            parameters: [],
            apiBody: JSON.stringify({
                forceRefresh: false,
                loadOptions: { pagination: { skip: 0, take: 100 }, sorts: null, filters: [], distinct: true, filterNulls: true },
                parameters: []
            }, null, 2),
            variableMap: {},
            valueCol: columnData.valueCol
        };

        columnForm.resetFields();
        setApiStep(0);
        columnForm.setFieldsValue(mapping);
        setIsColumnModalVisible(true);
    };

    const handleColumnModalOk = () => {
        const innerValues = columnForm.getFieldsValue(true);

        // Final guardrail for API mode
        if (innerValues.source === 'API') {
            if (apiStep < 2) {
                Modal.warning({
                    title: 'Incomplete Configuration',
                    content: 'Please complete all 3 steps (Connection -> Payload -> Mapping) before saving.',
                });
                return;
            }
            if (!innerValues.responsePath || !innerValues.valuePath) {
                Modal.error({
                    title: 'Missing Mapping Info',
                    content: 'Required mapping fields (Items Path or Final ID Field) are missing in Step 3.',
                });
                return;
            }
        }

        columnForm.validateFields().then(values => {
            if (values.apiType === 'Internal' && values.apiUrl && typeof constructInternalUrl === 'function') {
                values.fullUrl = constructInternalUrl(values.apiUrl);
            }

            const gridColumns = form.getFieldValue('gridColumns') || [];
            const updatedColumns = [...gridColumns];
            updatedColumns[activeColumnIndex] = {
                ...updatedColumns[activeColumnIndex],
                mapping: values,
                type: values.type || updatedColumns[activeColumnIndex].type || 'Object',
                dataType: values.dataType
            };

            form.setFieldsValue({ gridColumns: updatedColumns });
            setIsColumnModalVisible(false);
        });
    };

    return (
        <div style={{ animation: 'fadeIn 0.3s', padding: '0' }}>
            {/* JOIN CONFIGURATION - PREMIUM STYLE */}
            <div style={{
                marginBottom: 24,
                background: '#f8fafc',
                padding: '24px',
                borderRadius: '16px',
                border: '1px solid #eef2f6',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <div style={{ width: 36, height: 36, background: '#e0f2fe', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <LinkOutlined style={{ color: '#0284c7', fontSize: 18 }} />
                    </div>
                    <div>
                        <Text strong style={{ fontSize: 15, color: '#1e293b', display: 'block' }}>Join Environment</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>Define how the source sheet links to the grid data.</Text>
                    </div>
                </div>
                <Row gutter={20}>
                    <Col span={24} style={{ marginBottom: 20 }}>
                        <Form.Item name="gridSheet" label={<Text strong style={{ fontSize: 13 }}>Target Grid Sheet</Text>} rules={[{ required: true, message: 'Please select target grid sheet' }]} style={{ marginBottom: 0 }}>
                            <Select placeholder="Select the sheet containing grid data" showSearch variant="filled">
                                {Object.keys(sheetColumns).map(sheet => <Option key={sheet} value={sheet}>{sheet}</Option>)}
                            </Select>
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item
                            name="masterKey"
                            label={<Text strong style={{ fontSize: 13 }}>Master Key (Main)</Text>}
                            rules={[{ required: true, message: 'Please select master key column' }]}
                            tooltip={{ title: "The unique ID in the Main Sheet to link rows." }}
                            style={{ marginBottom: 0 }}
                        >
                            <Select showSearch placeholder="Select Column" variant="filled">
                                {currentColumns.map(col => <Option key={col} value={col}>{col}</Option>)}
                            </Select>
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item noStyle shouldUpdate={(prev, curr) => prev.gridSheet !== curr.gridSheet}>
                            {({ getFieldValue }) => {
                                const s = getFieldValue('gridSheet');
                                const cols = s ? (sheetColumns[s] || []) : [];
                                return (
                                    <Form.Item
                                        name="detailKey"
                                        label={<Text strong style={{ fontSize: 13 }}>Detail Key (Grid)</Text>}
                                        rules={[{ required: true, message: 'Please select Column' }]}
                                        tooltip={{ title: "The corresponding ID column in the Grid Sheet." }}
                                        style={{ marginBottom: 0 }}
                                    >
                                        <Select showSearch placeholder="Select Column" variant="filled">
                                            {cols.map(col => <Option key={col} value={col}>{col}</Option>)}
                                        </Select>
                                    </Form.Item>
                                );
                            }}
                        </Form.Item>
                    </Col>
                </Row>
            </div>

            {/* RELATED GRID SPECIFIC SETTINGS */}
            {type === 'RelatedGrid' && (
                <div style={{
                    marginBottom: 24,
                    background: '#fdfaff',
                    padding: '24px',
                    borderRadius: '16px',
                    border: '1px solid #f5f3ff',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                        <div style={{ width: 36, height: 36, background: '#f5f3ff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <BuildOutlined style={{ color: '#7c3aed', fontSize: 18 }} />
                        </div>
                        <div>
                            <Text strong style={{ fontSize: 15, color: '#1e293b', display: 'block' }}>Related Registry Settings</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>Configure structural identifiers for the target relation.</Text>
                        </div>
                    </div>
                    <Row gutter={16} style={{ marginBottom: 16 }}>
                        <Col span={8}>
                            <Form.Item name="relatedProjectName" label={<Text strong style={{ fontSize: 12 }}>Target Project</Text>} rules={[{ required: true, message: 'Please enter Target Project' }]} style={{ marginBottom: 0 }}>
                                <Input placeholder="Project Name" variant="filled" size="small" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="relatedFormName" label={<Text strong style={{ fontSize: 12 }}>Target Form</Text>} rules={[{ required: true, message: 'Please enter Target Form' }]} style={{ marginBottom: 0 }}>
                                <Input placeholder="Form Name" variant="filled" size="small" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="relatedDocIdCol" label={<Text strong style={{ fontSize: 12 }}>Link Column</Text>} rules={[{ required: true, message: 'Please enter Link Column' }]} tooltip={{ title: "The API DocumentIdColumnName" }} style={{ marginBottom: 0 }}>
                                <Input placeholder="RELATIONDOCUMENTID" variant="filled" size="small" />
                            </Form.Item>
                        </Col>
                    </Row>
                </div>
            )}

            {/* GRID COLUMNS MAPPING */}
            <div style={{ marginBottom: 12 }}>
                <Form.List name="gridColumns">
                    {(fields, { add, remove, move }) => {
                        const gridColumnsConfig = [
                            {
                                title: <span className="table-header-bold">Sort</span>,
                                key: 'sort',
                                width: colWidths.sort,
                                align: 'center',
                                render: () => (
                                    <div className="stable-cell-centered">
                                        <HolderOutlined style={{ color: '#94a3b8', fontSize: 13, cursor: 'grab' }} />
                                    </div>
                                )
                            },
                            {
                                title: <span className="table-header-bold">Field Name</span>,
                                key: 'name',
                                minWidth: colWidths.name,
                                render: (_, field) => (
                                    <Form.Item name={[field.name, 'name']} rules={[{ required: true, message: 'Please enter Field Name' }]} style={{ marginBottom: 0 }}>
                                        <Input placeholder="Column Name" size="small" variant="filled" className="input-sm-fixed" style={{ fontWeight: 500 }} />
                                    </Form.Item>
                                )
                            },
                            {
                                title: <span className="table-header-bold">Type</span>,
                                key: 'type',

                                width: colWidths.type,
                                render: (_, field) => (
                                    <Form.Item name={[field.name, 'type']} style={{ marginBottom: 0 }}>
                                        <Select size="small" variant="outlined" style={{ width: '100%', borderRadius: 4, padding: '5px 10px' }}>
                                            <Option value="Object">Object</Option>
                                            <Option value="InlineGrid">Inline Grid</Option>
                                            <Option value="RelatedGrid">Related Grid</Option>
                                            <Option value="RelatedDocument">Related Document</Option>
                                        </Select>
                                    </Form.Item>
                                )
                            },
                            {
                                title: <span className="table-header-bold">Source</span>,
                                key: 'source',
                                width: colWidths.source,
                                render: (_, field) => (
                                    <Form.Item shouldUpdate noStyle>
                                        {({ getFieldValue }) => {
                                            const colData = getFieldValue(['gridColumns', field.name]) || {};
                                            const mapping = colData.mapping || {};
                                            let summaryNode;

                                            if (colData.type === 'InlineGrid' || colData.type === 'RelatedGrid') {
                                                const cols = mapping.gridColumns?.length || 0;
                                                summaryNode = cols > 0
                                                    ? <Tag color="purple" style={{ margin: 0 }}>Grid Configured</Tag>
                                                    : <Tag color="warning" style={{ margin: 0 }}>Grid Setup Needed</Tag>;
                                            } else if (colData.type === 'RelatedDocument') {
                                                summaryNode = mapping.pathCol
                                                    ? <Tag color="purple" style={{ margin: 0 }}>File: {mapping.pathCol}</Tag>
                                                    : <Tag color="warning" style={{ margin: 0 }}>Setup Needed</Tag>;
                                            } else {
                                                if (mapping.source === 'API') {
                                                    summaryNode = mapping.apiUrl
                                                        ? <Tag color="blue" style={{ margin: 0 }}>API Ready</Tag>
                                                        : <Tag color="warning" style={{ margin: 0 }}>API Needed</Tag>;
                                                } else if (mapping.source === 'Fixed') {
                                                    summaryNode = mapping.fixedValue
                                                        ? <Tag color="gold" style={{ margin: 0 }}>Fixed: {mapping.fixedValue}</Tag>
                                                        : <Tag color="warning" style={{ margin: 0 }}>Fixed Needed</Tag>;
                                                } else {
                                                    summaryNode = mapping.valueCol
                                                        ? <Tag color="cyan" style={{ margin: 0 }}>{mapping.valueCol}</Tag>
                                                        : <Tag color="error" style={{ margin: 0 }}>Unmapped</Tag>;
                                                }
                                            }
                                            return <div className="tag-nowrap">{summaryNode}</div>;
                                        }}
                                    </Form.Item>
                                )
                            },
                            {
                                title: <span className="table-header-bold">Action</span>,
                                key: 'action',
                                width: colWidths.action,
                                align: 'center',
                                render: (_, field) => {
                                    const colData = form.getFieldValue(['gridColumns', field.name]) || {};
                                    const mapping = colData.mapping || {};
                                    const hasMapping = mapping && (
                                        (colData.type === 'RelatedDocument' && mapping.pathCol) ||
                                        ((colData.type === 'InlineGrid' || colData.type === 'RelatedGrid') && mapping.gridColumns?.length > 0) ||
                                        (mapping.source === 'API' && mapping.apiUrl) ||
                                        (mapping.source === 'Fixed' && mapping.fixedValue) ||
                                        (mapping.source === 'Excel' && mapping.valueCol)
                                    );

                                    return (
                                        <Space size={4}>
                                            <Tooltip title="Configure Mapping">
                                                <Button
                                                    size="small"
                                                    icon={<SettingOutlined />}
                                                    onClick={() => handleColumnConfigure(field.name)}
                                                    type={hasMapping ? "primary" : "default"}
                                                    ghost={hasMapping}
                                                />
                                            </Tooltip>
                                            <Button
                                                size="small"
                                                icon={<DeleteOutlined />}
                                                onClick={() => remove(field.name)}
                                                danger
                                            />
                                        </Space>
                                    );
                                }
                            }
                        ];

                        const resizableColumns = gridColumnsConfig.map((col) => ({
                            ...col,
                            onHeaderCell: (column) => ({
                                width: column.width,
                                onResize: handleResize(column.key),
                            }),
                        }));

                        return (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px 20px 4px', marginBottom: 0, borderBottom: '1px solid #f1f5f9' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 36, height: 36, background: '#f8fafc', borderRadius: '8px', border: '1px solid #eef2f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <TableOutlined style={{ color: '#64748b', fontSize: 16 }} />
                                        </div>
                                        <div>
                                            <Text strong style={{ fontSize: 15 }}>Object Properties Mapping</Text>
                                        </div>
                                    </div>
                                    <Space size={12}>
                                        {type === 'RelatedGrid' && (() => {
                                            const formParams = form.getFieldValue('formParams') || [];
                                            const gridSheet = form.getFieldValue('gridSheet');
                                            return (
                                                <Tooltip title="Configure Parameters">
                                                    <Button
                                                        icon={<SettingOutlined />}
                                                        onClick={() => setIsParamsModalVisible(true)}
                                                        size="middle"
                                                        type={formParams.length > 0 ? 'primary' : 'default'}
                                                        ghost={formParams.length > 0}
                                                        disabled={!gridSheet}
                                                        style={{ borderRadius: 8 }}
                                                    >
                                                    </Button>
                                                </Tooltip>
                                            );
                                        })()}
                                        <Button
                                            type="dashed"
                                            size="middle"
                                            onClick={() => add()}
                                            icon={<PlusOutlined />}
                                            style={{ borderRadius: 8 }}
                                        >
                                            Add New Property
                                        </Button>
                                    </Space>
                                </div>
                                <div className="mapping-table-card" style={{ marginTop: 24, flex: 'none', maxHeight: '400px', overflowY: 'auto', paddingBottom: 1 }}>
                                    <Table
                                        components={{ header: { cell: ResizableTitle } }}
                                        dataSource={fields}
                                        columns={resizableColumns}
                                        pagination={false}
                                        size="small"
                                        rowKey="key"
                                        rowClassName="compact-row"
                                        locale={{ emptyText: <div style={{ padding: '32px 0', color: '#94a3b8' }}>No properties added yet. Start by clicking "Add New Property".</div> }}
                                        onRow={(record, index) => {
                                            const isDraggedOver = index === draggedOverIndex;
                                            return {
                                                draggable: true,
                                                className: isDraggedOver ? 'drop-row drag-row-active' : 'drag-row-active',
                                                onDragStart: (e) => {
                                                    e.dataTransfer.effectAllowed = 'move';
                                                    e.dataTransfer.setData('dragIndex', index);
                                                    e.currentTarget.style.opacity = '0.5';
                                                },
                                                onDragEnd: (e) => {
                                                    e.currentTarget.style.opacity = '1';
                                                    setDraggedOverIndex(-1);
                                                },
                                                onDragEnter: (e) => {
                                                    e.preventDefault();
                                                    setDraggedOverIndex(index);
                                                },
                                                onDragOver: (e) => {
                                                    e.preventDefault();
                                                    if (draggedOverIndex !== index) {
                                                        setDraggedOverIndex(index);
                                                    }
                                                },
                                                onDrop: (e) => {
                                                    e.preventDefault();
                                                    setDraggedOverIndex(-1);
                                                    const dragIndex = Number(e.dataTransfer.getData('dragIndex'));
                                                    if (dragIndex === index || isNaN(dragIndex)) return;
                                                    move(dragIndex, index);
                                                }
                                            };
                                        }}
                                    />
                                </div>
                            </>
                        );
                    }}
                </Form.List>
            </div>

            {/* Parameters Modal */}
            {type === 'RelatedGrid' && (() => {
                const gridSheet = form.getFieldValue('gridSheet');
                const gridSheetColumns = gridSheet ? (sheetColumns[gridSheet] || []) : excelColumns;
                return (
                    <ParametersModal
                        visible={isParamsModalVisible}
                        onCancel={() => setIsParamsModalVisible(false)}
                        initialValues={{ formParams: form.getFieldValue('formParams') || [] }}
                        onSave={(values) => {
                            form.setFieldsValue({ formParams: values.formParams });
                            setIsParamsModalVisible(false);
                        }}
                        excelColumns={gridSheetColumns}
                        constructInternalUrl={constructInternalUrl}
                        sheets={Object.keys(sheetColumns)}
                        sheetColumns={sheetColumns}
                        currentColumns={gridSheetColumns}
                        hideFlowParams={true}
                    />
                );
            })()}

            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ background: '#e0f2fe', padding: '6px', borderRadius: '8px' }}>
                            <SettingOutlined style={{ color: '#0369a1' }} />
                        </div>
                        <Text strong style={{ fontSize: 16 }}>
                            Property Configuration: {form.getFieldValue(['gridColumns', activeColumnIndex, 'name']) || 'New Property'}
                        </Text>
                    </div>
                }
                open={isColumnModalVisible}
                onOk={handleColumnModalOk}
                onCancel={() => setIsColumnModalVisible(false)}
                width={950}
                style={{ top: 50 }}
                styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', padding: '12px 24px 24px 24px' } }}
                closeIcon={<div style={{ background: '#f8fafc', padding: 8, borderRadius: 8 }}>×</div>}
                zIndex={1002}
                destroyOnHidden
            >
                <Form form={columnForm} layout="vertical" initialValues={{ source: 'Excel', apiType: 'Internal' }}>
                    {(() => {
                        const currentInnerType = form.getFieldValue(['gridColumns', activeColumnIndex, 'type']) || 'Object';

                        if (currentInnerType === 'InlineGrid' || currentInnerType === 'RelatedGrid') {
                            return (
                                <GridMappingConfig
                                    form={columnForm}
                                    type={currentInnerType}
                                    currentColumns={currentColumns}
                                    sheetColumns={sheetColumns}
                                    excelColumns={excelColumns}
                                    constructInternalUrl={constructInternalUrl}
                                />
                            );
                        }

                        if (currentInnerType === 'RelatedDocument') {
                            return (
                                <RelatedDocumentConfig
                                    form={columnForm}
                                    excelColumns={(() => {
                                        const gs = form.getFieldValue('gridSheet');
                                        return gs ? (sheetColumns[gs] || []) : excelColumns;
                                    })()}
                                />
                            );
                        }

                        return (() => {
                            const gridSheet = form.getFieldValue('gridSheet');
                            const gridSheetColumns = gridSheet ? (sheetColumns[gridSheet] || []) : excelColumns;
                            return (
                                <MappingFields
                                    formInstance={columnForm}
                                    scopeColumns={gridSheetColumns}
                                    constructInternalUrl={constructInternalUrl}
                                    apiStep={apiStep}
                                    setApiStep={setApiStep}
                                />
                            );
                        })();
                    })()}
                </Form>
            </Modal>
        </div>
    );
};
