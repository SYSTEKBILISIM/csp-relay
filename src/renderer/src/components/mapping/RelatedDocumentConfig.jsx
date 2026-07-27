import React from 'react';
import { Form, Select, Typography, Tag } from 'antd';
import {
    ArrowRightOutlined,
    FileExcelOutlined,
    FileOutlined,
    FolderOpenOutlined,
    InfoCircleOutlined
} from '@ant-design/icons';

const { Text } = Typography;

/**
 * Config UI for RelatedDocument type objects.
 * The user selects which Excel column contains the local file path and optional CSP save path for this row.
 * At execution time, the app reads the file and sends Name, Extension, Data (base64).
 */
export const RelatedDocumentConfig = ({ form, excelColumns = [] }) => {
    const pathColumn = Form.useWatch('pathCol', form);
    const savePathColumn = Form.useWatch('savePathCol', form);
    const columnOptions = React.useMemo(() => (
        (excelColumns || [])
            .filter(col => col !== undefined && col !== null && col !== '')
            .map(col => ({ value: col, label: col }))
    ), [excelColumns]);

    const flowNodeStyle = {
        flex: 1,
        minWidth: 0,
        padding: '10px 12px',
        borderRadius: 8,
        background: '#fff',
        border: '1px solid #e2e8f0'
    };

    return (
        <div style={{ animation: 'fadeIn 0.3s', padding: '0 8px 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 14, marginBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, color: '#0284c7', background: '#e0f2fe' }}>
                        <FileOutlined style={{ fontSize: 17 }} />
                    </div>
                    <div>
                        <Text strong style={{ display: 'block', fontSize: 14, color: '#0f172a' }}>Related Document Source</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>Map the local file and its optional CSP destination.</Text>
                    </div>
                </div>
                <Tag color="blue" style={{ margin: 0, borderRadius: 10, fontSize: 10 }}>2-STEP MAPPING</Tag>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', marginBottom: 16, borderRadius: 8, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <InfoCircleOutlined style={{ marginTop: 2, color: '#0284c7' }} />
                <Text style={{ fontSize: 12, color: 'inherit' }}>
                    Select the Excel column containing each file's absolute local path. Choose a save-path column only when the CSP folder changes by row.
                </Text>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
                <div style={{ padding: 16, borderRadius: 10, background: '#f8fbff', border: '1px solid #bae0ff' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
                        <div style={{ flex: '0 0 auto', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: '#fff', background: '#1677ff', fontSize: 12, fontWeight: 700 }}>1</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 7 }}>
                                <Text strong style={{ color: '#0f172a' }}>Local file path</Text>
                                <Tag color="blue" style={{ margin: 0, borderRadius: 8, fontSize: 10 }}>REQUIRED</Tag>
                            </div>
                            <Text type="secondary" style={{ display: 'block', marginTop: 3, fontSize: 11 }}>
                                Absolute path used to read the document from this computer.
                            </Text>
                        </div>
                    </div>

                    <Form.Item
                        name="pathCol"
                        label={<Text strong style={{ fontSize: 12 }}>Excel column</Text>}
                        rules={[{ required: true, message: 'Please select the file path column' }]}
                        style={{ marginBottom: 0 }}
                    >
                        <Select
                            options={columnOptions}
                            placeholder="Select the file path column"
                            showSearch
                            optionFilterProp="label"
                            style={{ width: '100%' }}
                        />
                    </Form.Item>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, color: '#64748b' }}>
                        <FileExcelOutlined style={{ color: '#16a34a' }} />
                        <Text type="secondary" style={{ fontSize: 11 }}>Example value: C:\Files\invoice.pdf</Text>
                    </div>
                </div>

                <div style={{ padding: 16, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
                        <div style={{ flex: '0 0 auto', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: '#475569', background: '#e2e8f0', fontSize: 12, fontWeight: 700 }}>2</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 7 }}>
                                <Text strong style={{ color: '#0f172a' }}>CSP save folder</Text>
                                <Tag style={{ margin: 0, borderRadius: 8, fontSize: 10, color: '#64748b' }}>OPTIONAL</Tag>
                            </div>
                            <Text type="secondary" style={{ display: 'block', marginTop: 3, fontSize: 11 }}>
                                Dynamic target folder. Leave empty to use the control's default path.
                            </Text>
                        </div>
                    </div>

                    <Form.Item
                        name="savePathCol"
                        label={<Text strong style={{ fontSize: 12 }}>Excel column</Text>}
                        style={{ marginBottom: 0 }}
                    >
                        <Select
                            allowClear
                            options={columnOptions}
                            placeholder="Use the default CSP folder"
                            showSearch
                            optionFilterProp="label"
                            style={{ width: '100%' }}
                        />
                    </Form.Item>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, color: '#64748b' }}>
                        <FolderOpenOutlined style={{ color: '#d97706' }} />
                        <Text type="secondary" style={{ fontSize: 11 }}>Example value: DOCUMENTS/ABC</Text>
                    </div>
                </div>
            </div>

            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <Text strong style={{ display: 'block', marginBottom: 9, fontSize: 11, color: '#64748b', letterSpacing: 0.4 }}>UPLOAD FLOW</Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={flowNodeStyle}>
                        <Text type="secondary" style={{ display: 'block', fontSize: 10 }}>EXCEL SOURCE</Text>
                        <Text ellipsis style={{ display: 'block', fontSize: 12, color: pathColumn ? '#0f172a' : '#94a3b8' }}>
                            {pathColumn || 'Select file path column'}
                        </Text>
                    </div>
                    <ArrowRightOutlined style={{ flex: '0 0 auto', color: '#94a3b8' }} />
                    <div style={{ ...flowNodeStyle, flex: '0 0 130px', textAlign: 'center', color: '#0369a1', background: '#f0f9ff', borderColor: '#bae6fd' }}>
                        <FileOutlined style={{ marginRight: 6 }} />
                        <Text strong style={{ fontSize: 12, color: 'inherit' }}>Read file</Text>
                    </div>
                    <ArrowRightOutlined style={{ flex: '0 0 auto', color: '#94a3b8' }} />
                    <div style={flowNodeStyle}>
                        <Text type="secondary" style={{ display: 'block', fontSize: 10 }}>CSP DESTINATION</Text>
                        <Text ellipsis style={{ display: 'block', fontSize: 12, color: savePathColumn ? '#0f172a' : '#64748b' }}>
                            {savePathColumn || 'Control default folder'}
                        </Text>
                    </div>
                </div>
            </div>
        </div>
    );
};
