import React, { useState, useEffect, useRef } from 'react';
import { Card, Form, Button, Typography, Select, Table, Input, Modal, Space, Row, Col, Tooltip, Radio, Divider, Badge, message, Collapse, theme, Tag, Segmented, Tabs } from 'antd';
import { InteractionOutlined, PlusOutlined, DeleteOutlined, SettingOutlined, ArrowUpOutlined, ArrowDownOutlined, LinkOutlined, DownloadOutlined, UploadOutlined, BuildOutlined, ArrowRightOutlined, TableOutlined, InfoCircleOutlined, PushpinOutlined, HolderOutlined, SearchOutlined } from '@ant-design/icons';
import { globalStore } from '../store/GlobalStore';
import '../assets/css/TransferScreen.css';

const { Title, Text } = Typography;
const { Option } = Select;

import { useMapping } from '../hooks/useMapping';
import { MappingFields } from './mapping/MappingFields';
import { GridMappingConfig } from './mapping/GridMappingConfig';
import { RelatedDocumentConfig } from './mapping/RelatedDocumentConfig';
import { ParametersModal } from './ParametersModal';
import { MappingConfigModal } from './mapping/MappingConfigModal';
import { ResizableTitle } from './ResizableTitle';

export const TransferScreen = ({ onFinish, initialData }) => {
    const [form] = Form.useForm();
    const [messageApi, contextHolder] = message.useMessage();
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef(null);

    const tableContainerRef = useRef(null);
    const [tableScrollY, setTableScrollY] = useState(400);

    // Dynamic Table Height (similar to Execution Screen)
    useEffect(() => {
        if (!tableContainerRef.current) return;
        const updateHeight = () => {
            if (tableContainerRef.current) {
                // Table header is typically ~39px, plus borders. Subtracting 40px to be safe.
                const height = tableContainerRef.current.clientHeight - 40;
                setTableScrollY(height > 0 ? height : 400);
            }
        };
        const observer = new ResizeObserver(updateHeight);
        observer.observe(tableContainerRef.current);
        updateHeight();
        return () => observer.disconnect();
    }, []);

    // Excel Data
    const [sheets, setSheets] = useState([]);
    const [sheetColumns, setSheetColumns] = useState({});

    // Mapping State (MVC Hook)
    const {
        objects,
        setObjects,
        addObject,
        removeObject,
        moveObject,
        reorderObjects,
        updateObject,
        updateMapping
    } = useMapping([]);

    const [mainSheet, setMainSheet] = useState(null);
    const [mainIdColumn, setMainIdColumn] = useState(null);
    // const [objects, setObjects] = useState([]); // REMOVED

    // Parameters State
    const [flowParams, setFlowParams] = useState([]);
    const [formParams, setFormParams] = useState([]);
    const [loginAsEnabled, setLoginAsEnabled] = useState(false);
    const [loginAsColumn, setLoginAsColumn] = useState(null);
    const [apiMatchThreshold, setApiMatchThreshold] = useState(0.9);
    const [apiCacheLimit, setApiCacheLimit] = useState(50);
    const [relatedGridChunkSize, setRelatedGridChunkSize] = useState(5);
    const [isParamsModalVisible, setIsParamsModalVisible] = useState(false);
    const [draggedOverIndex, setDraggedOverIndex] = useState(-1);

    const [colWidths, setColWidths] = useState({ sort: 50, name: 280, type: 160, source: 250, action: 90 });
    const handleResize = key => (e, { size }) => {
        setColWidths(prev => ({ ...prev, [key]: Math.max(size.width, 50) }));
    };

    const handleParamsSave = (values) => {
        setFlowParams(values.flowParams || []);
        setFormParams(values.formParams || []);
        setLoginAsEnabled(values.loginAsEnabled || false);
        setLoginAsColumn(values.loginAsColumn || null);
        setApiMatchThreshold(values.apiMatchThreshold !== undefined ? values.apiMatchThreshold : 0.9);
        setApiCacheLimit(values.apiCacheLimit !== undefined ? values.apiCacheLimit : 50);
        setRelatedGridChunkSize(values.relatedGridChunkSize !== undefined ? values.relatedGridChunkSize : 5);
        setIsParamsModalVisible(false);
    };

    // Modal State
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [currentObjectKey, setCurrentObjectKey] = useState(null);
    const [currentObjectType, setCurrentObjectType] = useState('Object');
    const [currentObjectMapping, setCurrentObjectMapping] = useState(null);
    const [valueSource, setValueSource] = useState('Excel'); // 'Excel' or 'API'

    // Config Data for URL Construction
    const [deployUrl, setDeployUrl] = useState('');
    const [projectName, setProjectName] = useState('');

    useEffect(() => {
        // Load Excel Metadata
        const storedSheets = globalStore.get('excelSheets') || [];
        const storedColumns = globalStore.get('excelColumns') || {};

        // Load Config Data
        setDeployUrl(globalStore.get('deployUrl') || '');
        setProjectName(globalStore.get('projectName') || '');

        setSheets(storedSheets);
        setSheetColumns(storedColumns);

        console.log('TransferScreen Mounted. InitialData:', initialData);

        // Restore State or Auto-Select
        if (initialData && (initialData.mainSheet || (initialData.objects && initialData.objects.length > 0))) {
            console.log('Restoring from initialData...');
            if (initialData.mainSheet) {
                setMainSheet(initialData.mainSheet);
                form.setFieldsValue({ mainSheet: initialData.mainSheet });
            }
            if (initialData.mainIdColumn) {
                setMainIdColumn(initialData.mainIdColumn);
                form.setFieldsValue({ mainIdColumn: initialData.mainIdColumn });
            }
            if (initialData.objects) {
                setObjects(initialData.objects);
            }
            if (initialData.flowParams) {
                setFlowParams(initialData.flowParams);
            }
            if (initialData.formParams) {
                setFormParams(initialData.formParams);
            }
            if (initialData.loginAsEnabled !== undefined) {
                setLoginAsEnabled(initialData.loginAsEnabled);
            }
            if (initialData.loginAsColumn) {
                setLoginAsColumn(initialData.loginAsColumn);
            }
            if (initialData.apiMatchThreshold !== undefined) {
                setApiMatchThreshold(initialData.apiMatchThreshold);
            }
            if (initialData.apiCacheLimit !== undefined) {
                setApiCacheLimit(initialData.apiCacheLimit);
            }
            if (initialData.relatedGridChunkSize !== undefined) {
                setRelatedGridChunkSize(initialData.relatedGridChunkSize);
            }
        } else if (storedSheets.length > 0 && !mainSheet) {
            // Only auto-select if no state exists
            setMainSheet(storedSheets[0]);
            form.setFieldsValue({ mainSheet: storedSheets[0] });
        }
    }, [initialData]);
    // Helper functions removed as they are now in the hook

    // Export Configuration
    const handleExport = () => {
        if (objects.length === 0 && flowParams.length === 0 && formParams.length === 0) {
            messageApi.warning('Nothing to export (No objects or parameters).');
            return;
        }
        const data = {
            mainSheet,
            mainIdColumn,
            objects,
            flowParams,
            formParams,
            loginAsEnabled,
            loginAsColumn,
            apiMatchThreshold,
            apiCacheLimit,
            relatedGridChunkSize
        };
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = `transfer-config-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        messageApi.success('Configuration exported successfully.');
    };

    // Import Configuration
    const handleImport = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                // Restore Objects
                if (data.objects && Array.isArray(data.objects)) {
                    setObjects(data.objects);
                }

                // Restore Main Sheet
                if (data.mainSheet && sheets.includes(data.mainSheet)) {
                    setMainSheet(data.mainSheet);
                    form.setFieldsValue({ mainSheet: data.mainSheet });
                }

                // Restore Main ID Column
                if (data.mainIdColumn) {
                    setMainIdColumn(data.mainIdColumn);
                    form.setFieldsValue({ mainIdColumn: data.mainIdColumn });
                }

                // Restore Parameters
                if (data.flowParams) setFlowParams(data.flowParams);
                if (data.formParams) setFormParams(data.formParams);
                if (data.loginAsEnabled !== undefined) setLoginAsEnabled(data.loginAsEnabled);
                if (data.loginAsColumn) setLoginAsColumn(data.loginAsColumn);
                if (data.apiMatchThreshold !== undefined) setApiMatchThreshold(data.apiMatchThreshold);
                if (data.apiCacheLimit !== undefined) setApiCacheLimit(data.apiCacheLimit);
                if (data.relatedGridChunkSize !== undefined) setRelatedGridChunkSize(data.relatedGridChunkSize);

                messageApi.success('Configuration imported successfully.');
            } catch (error) {
                console.error(error);
                messageApi.error('Failed to parse configuration file.');
            }
            // Reset input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    // Helper to constructing Internal URL for preview
    const constructInternalUrl = (queryName) => {
        if (!queryName) return '';
        const cleanUrl = deployUrl.replace(/\/$/, ""); // Remove trailing slash
        return `${cleanUrl}/apps/${projectName}/latest/api/DataSource/${queryName}`;
    };

    // Open Mapping Modal
    const openMappingModal = (record) => {
        setCurrentObjectKey(record.key);
        setCurrentObjectType(record.type); // Store current type (InlineGrid or Object)

        const existingMap = record.mapping;
        const mapping = existingMap || {
            source: 'Excel',
            isArray: false,
            apiType: 'Internal',
            apiMethod: 'GET',
            responsePath: 'result.result',
            // Default Body for Internal
            parameters: [],
            apiBody: JSON.stringify({
                forceRefresh: false,
                loadOptions: { pagination: { skip: 0, take: 100 }, sorts: null, filters: [], distinct: true, filterNulls: true },
                parameters: []
            }, null, 2),
            variableMap: {},
            // Grid Defaults
            gridColumns: [],
            relatedProjectName: '',
            relatedFormName: '',
            relatedDocIdCol: 'RELATIONDOCUMENTID'
        };
        setValueSource(mapping.source || 'Excel');
        setCurrentObjectMapping({
            isArray: false,
            ...mapping
        });
        setIsModalVisible(true);
    };

    const [searchQuery, setSearchQuery] = useState('');

    const columns = [
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
            title: <span className="table-header-bold">Object Name</span>,
            dataIndex: 'name',
            key: 'name',
            width: colWidths.name,
            render: (_, record) => (
                <Input
                    size="small"
                    value={record.name}
                    onChange={(e) => updateObject(record.key, 'name', e.target.value)}
                    placeholder="e.g. CompanyName"
                    className="input-sm-fixed"
                />
            )
        },
        {
            title: <span className="table-header-bold">Type</span>,
            dataIndex: 'type',
            key: 'type',
            width: colWidths.type,
            render: (text, record) => (
                <Select
                    size="small"
                    value={text}
                    onChange={(value) => updateObject(record.key, 'type', value)}
                    className="select-sm-fixed definiation-type-column"
                    options={[
                        { label: 'Object', value: 'Object' },
                        { label: 'Inline Grid', value: 'InlineGrid' },
                        { label: 'Related Grid', value: 'RelatedGrid' },
                        { label: 'Related Document', value: 'RelatedDocument' }
                    ]}
                />
            )
        },
        {
            title: <span className="table-header-bold">Source</span>,
            key: 'source',
            width: colWidths.source,
            render: (_, record) => {
                const mapping = record.mapping || {};
                let summaryNode;

                if (record.type === 'InlineGrid' || record.type === 'RelatedGrid') {
                    const cols = mapping.gridColumns?.length || 0;
                    summaryNode = cols > 0
                        ? <Tag color="purple" style={{ margin: 0 }}>Grid Configured</Tag>
                        : <Tag color="warning" style={{ margin: 0 }}>Grid Setup Needed</Tag>;
                } else if (record.type === 'RelatedDocument') {
                    summaryNode = mapping.pathCol
                        ? (
                            <Tooltip title={`File: ${mapping.pathCol}`} mouseEnterDelay={0.3}>
                                <Tag color="purple" style={{ margin: 0 }}>
                                    <span style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'bottom' }}>
                                        File: {mapping.pathCol}
                                    </span>
                                </Tag>
                            </Tooltip>
                        )
                        : <Tag color="warning" style={{ margin: 0 }}>Setup Needed</Tag>;
                } else {
                    if (mapping.source === 'API') {
                        summaryNode = mapping.apiUrl
                            ? (
                                <Tooltip title={`API: ${mapping.apiUrl}`} mouseEnterDelay={0.3}>
                                    <Tag color="blue" style={{ margin: 0 }}>
                                        <span style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'bottom' }}>
                                            API: {mapping.apiUrl}
                                        </span>
                                    </Tag>
                                </Tooltip>
                            )
                            : <Tag color="warning" style={{ margin: 0 }}>API: Config Needed</Tag>;
                    } else if (mapping.source === 'Fixed') {
                        summaryNode = mapping.fixedValue
                            ? (
                                <Tooltip title={`Fixed: ${mapping.fixedValue}`} mouseEnterDelay={0.3}>
                                    <Tag color="gold" style={{ margin: 0 }}>
                                        <span style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'bottom' }}>
                                            Fixed: {mapping.fixedValue}
                                        </span>
                                    </Tag>
                                </Tooltip>
                            )
                            : <Tag color="warning" style={{ margin: 0 }}>Fixed: Enter Value</Tag>;
                    } else {
                        summaryNode = mapping.valueCol
                            ? (
                                <Tooltip title={mapping.valueCol} mouseEnterDelay={0.3}>
                                    <Tag color="cyan" style={{ margin: 0 }}>
                                        <span style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'bottom' }}>
                                            {mapping.valueCol}
                                        </span>
                                    </Tag>
                                </Tooltip>
                            )
                            : <Tag color="error" style={{ margin: 0 }}>Unmapped</Tag>;
                    }
                }

                return <div className="tag-nowrap">{summaryNode}</div>;
            }
        },
        {
            title: <span className="table-header-bold" style={{ textAlign: 'center !important' }}>Action</span>,
            key: 'action',
            width: colWidths.action,
            align: "center",
            render: (_, record) => (
                <Space size={4}>

                    <Tooltip title="Configure Mapping">
                        <Button
                            size="small"
                            icon={<SettingOutlined />}
                            onClick={() => openMappingModal(record)}
                            type={record.mapping && (Object.keys(record.mapping).length > 1 || ((record.type === 'InlineGrid' || record.type === 'RelatedGrid') && record.mapping?.gridColumns?.length > 0)) ? "primary" : "default"}
                            ghost={record.mapping && (Object.keys(record.mapping).length > 1 || ((record.type === 'InlineGrid' || record.type === 'RelatedGrid') && record.mapping?.gridColumns?.length > 0))}
                        />
                    </Tooltip>
                    <Button
                        size="small"
                        icon={<DeleteOutlined />}
                        danger
                        onClick={() => removeObject(record.key)}
                    />
                </Space>
            )
        }
    ];

    const handleSubmit = (values) => {
        setLoading(true);
        console.log('Transfer Definition:', { ...values, objects, mainSheet, flowParams, formParams, loginAsEnabled, loginAsColumn, apiMatchThreshold, apiCacheLimit, relatedGridChunkSize });

        // Save to store
        globalStore.set('mappingMainSheet', mainSheet);
        globalStore.set('mappingMainIdColumn', mainIdColumn);
        globalStore.set('mappingObjects', objects);
        globalStore.set('flowParams', flowParams);
        globalStore.set('formParams', formParams);
        globalStore.set('loginAsEnabled', loginAsEnabled);
        globalStore.set('loginAsColumn', loginAsColumn);
        globalStore.set('apiMatchThreshold', apiMatchThreshold);
        globalStore.set('apiCacheLimit', apiCacheLimit);
        globalStore.set('relatedGridChunkSize', relatedGridChunkSize);

        setTimeout(() => {
            setLoading(false);
            if (onFinish) onFinish({ ...values, objects, mainSheet, mainIdColumn, flowParams, formParams, loginAsEnabled, loginAsColumn, apiMatchThreshold, apiCacheLimit, relatedGridChunkSize });
        }, 1000);
    };

    // Get columns for the selected sheet
    const currentColumns = mainSheet ? (sheetColumns[mainSheet] || []) : [];

    // Filter available objects for mapping
    const availableObjects = objects.filter(o => o.name);

    return (
        <>
            {contextHolder}
            <Card
                variant="borderless"
                className="transfer-container"
                styles={{ body: { padding: '24px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' } }}
            >
                <div className="transfer-header">
                    <div className="transfer-title-box">
                        <Title level={3}>
                            Transfer Definition
                        </Title>
                        <Text type="secondary">Define mapping rules</Text>
                    </div>
                    <Space>
                        {/* Parameters button removed from here */}
                        <Button icon={<DownloadOutlined />} onClick={handleExport} size="small">Export</Button>
                        <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current.click()} size="small">Import</Button>
                        {/* Hidden Input for Import */}
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            accept=".json"
                            onChange={handleImport}
                        />
                    </Space>
                </div>

                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    initialValues={{}}
                    className="transfer-form"
                >
                    <div className="transfer-form-inner">
                        {/* Top Controls Row */}
                        <div className="top-controls-row">
                            <div className="top-controls-selectors">
                                <Form.Item
                                    name="mainSheet"
                                    label={<span className="form-item-label-bold">Main Sheet</span>}
                                    rules={[{ required: true, message: 'Please select Main Sheet' }]}
                                    style={{ marginBottom: 0, flex: 1 }}
                                >
                                    <Select
                                        placeholder="Select Main Sheet"
                                        onChange={(val) => {
                                            setMainSheet(val);
                                            setMainIdColumn(null);
                                            form.setFieldsValue({ mainIdColumn: null });
                                        }}
                                        options={sheets.map(s => ({ label: s, value: s }))}
                                    />
                                </Form.Item>

                                <Form.Item
                                    name="mainIdColumn"
                                    label={<span className="form-item-label-bold">Main ID Column</span>}
                                    rules={[{ required: true, message: 'Please select Main ID Column' }]}
                                    style={{ marginBottom: 0, flex: 1 }}
                                >
                                    <Select
                                        placeholder="Select ID Column"
                                        onChange={setMainIdColumn}
                                        options={currentColumns.map(c => ({ label: c, value: c }))}
                                        showSearch
                                    />
                                </Form.Item>
                            </div>

                            <Space align="end" size={16}>
                                <Tooltip title="Settings & Parameters">
                                    <Button
                                        icon={<SettingOutlined />}
                                        onClick={() => setIsParamsModalVisible(true)}
                                        size="middle"
                                        type={flowParams.length > 0 || formParams.length > 0 || loginAsEnabled ? 'primary' : 'default'}
                                        ghost={flowParams.length > 0 || formParams.length > 0 || loginAsEnabled}
                                        style={{ borderRadius: 8 }}
                                    />
                                </Tooltip>
                                <Input
                                    prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                                    placeholder="Search objects..."
                                    allowClear
                                    variant="filled"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    style={{ width: 220, borderRadius: 8 }}
                                />
                            </Space>
                        </div>

                        {/* Objects Mapping Table - Scrollable Body */}
                        <div ref={tableContainerRef} className={`mapping-table-card ${objects.length === 0 ? 'empty-state' : ''}`}>
                            <Table
                                components={{ header: { cell: ResizableTitle } }}
                                tableLayout="fixed"
                                dataSource={objects.filter(obj => {
                                    if (!searchQuery) return true;
                                    const query = searchQuery.toLowerCase();
                                    const matchName = (obj.name || '').toLowerCase().includes(query);
                                    const matchType = (obj.type || '').toLowerCase().includes(query);
                                    return matchName || matchType;
                                })}
                                columns={columns.map(col => ({
                                    ...col,
                                    onHeaderCell: column => ({
                                        width: column.width,
                                        onResize: handleResize(column.key)
                                    })
                                }))}
                                pagination={false}
                                size="small"
                                rowKey="key"
                                style={{ fontSize: '12px', width: '100%' }}
                                onRow={(record, index) => {
                                    const isFiltered = !!searchQuery;
                                    const isDraggedOver = index === draggedOverIndex;
                                    return {
                                        draggable: !isFiltered,
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
                                        onDragLeave: () => {
                                            // Optional: logic to clear if moving out of table
                                        },
                                        onDrop: (e) => {
                                            e.preventDefault();
                                            setDraggedOverIndex(-1);
                                            const dragIndex = Number(e.dataTransfer.getData('dragIndex'));
                                            if (dragIndex === index || isNaN(dragIndex)) return;
                                            reorderObjects(dragIndex, index);
                                        }
                                    };
                                }}
                                footer={objects.length > 0 ? () => (
                                    <Button
                                        type="dashed"
                                        block
                                        icon={<PlusOutlined />}
                                        onClick={addObject}
                                        style={{ height: 40, borderRadius: 8, borderColor: '#cbd5e1', color: '#475569', background: 'transparent' }}
                                    >
                                        Add New Object
                                    </Button>
                                ) : undefined}
                            />
                            {objects.length === 0 && (
                                <div className="mapping-table-empty-footer">
                                    <Button
                                        type="dashed"
                                        block
                                        icon={<PlusOutlined />}
                                        onClick={addObject}
                                        style={{ height: 40, borderRadius: 8, borderColor: '#cbd5e1', color: '#475569', background: 'transparent' }}
                                    >
                                        Add New Object
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Footer / Submit */}
                        <Button type="primary" htmlType="submit" block loading={loading} className="submit-btn-large">
                            Review & Transfer
                        </Button>
                    </div>
                </Form>

                <MappingConfigModal
                    visible={isModalVisible}
                    onCancel={() => setIsModalVisible(false)}
                    onSave={(values) => {
                        if (values.apiType === 'Internal' && values.apiUrl) {
                            values.fullUrl = constructInternalUrl(values.apiUrl);
                        }
                        updateObject(currentObjectKey, 'mapping', values);
                        setIsModalVisible(false);
                    }}
                    initialValues={currentObjectMapping}
                    excelColumns={currentColumns}
                    constructInternalUrl={constructInternalUrl}
                    type={currentObjectType}
                    sheetColumns={sheetColumns}
                    currentColumns={currentColumns}
                    title="Configure Object Mapping"
                    width={950}
                />

                <ParametersModal
                    visible={isParamsModalVisible}
                    onCancel={() => setIsParamsModalVisible(false)}
                    onSave={handleParamsSave}
                    initialValues={{ flowParams, formParams, loginAsEnabled, loginAsColumn, apiMatchThreshold, apiCacheLimit, relatedGridChunkSize }}
                    excelColumns={mainSheet ? (sheetColumns[mainSheet] || []) : []}
                    constructInternalUrl={constructInternalUrl}
                    sheets={sheets}
                    sheetColumns={sheetColumns}
                    currentColumns={currentColumns}
                    showInherit={false}
                />
            </Card >
        </>
    );
};
