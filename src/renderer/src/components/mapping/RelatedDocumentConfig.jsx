import React from 'react';
import { Form, Select, Typography, Alert } from 'antd';
import { FileOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;

/**
 * Config UI for RelatedDocument type objects.
 * The user selects which Excel column contains the local file path and optional CSP save path for this row.
 * At execution time, the app reads the file and sends Name, Extension, Data (base64).
 */
export const RelatedDocumentConfig = ({ form, excelColumns = [] }) => {
    return (
        <div style={{ animation: 'fadeIn 0.3s', padding: '0 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 12, marginBottom: 20, borderBottom: '1px solid #f1f5f9' }}>
                <FileOutlined style={{ color: '#64748b', fontSize: 16 }} />
                <Text strong style={{ fontSize: 14, color: '#1e293b' }}>Related Document Configuration</Text>
            </div>

            <Alert
                message="File Path Column"
                description="Select the Excel column that contains the absolute local file path for each row. Optionally select a CSP save path column when the document must be uploaded under a dynamic folder."
                type="info"
                showIcon
                style={{ marginBottom: 20, fontSize: 12 }}
            />

            <Form.Item
                name="pathCol"
                label={<span style={{ fontWeight: 600 }}>File Path Column</span>}
                rules={[{ required: true, message: 'Please select File Path Column' }]}
                style={{ marginBottom: 16 }}
            >
                <Select
                    placeholder="Select Excel column containing file path..."
                    showSearch
                    optionFilterProp="children"
                    style={{ width: '100%' }}
                >
                    {(excelColumns || []).filter(col => col !== undefined && col !== null && col !== '').map(col => (
                        <Option key={col} value={col}>{col}</Option>
                    ))}
                </Select>
            </Form.Item>

            <Form.Item
                name="savePathCol"
                label={<span style={{ fontWeight: 600 }}>Save Path Column</span>}
                help={<Text type="secondary" style={{ fontSize: 11 }}>Optional. Example: DOCUMENTS/ABC</Text>}
                style={{ marginBottom: 0 }}
            >
                <Select
                    allowClear
                    placeholder="Optional CSP folder path column..."
                    showSearch
                    optionFilterProp="children"
                    style={{ width: '100%' }}
                >
                    {(excelColumns || []).filter(col => col !== undefined && col !== null && col !== '').map(col => (
                        <Option key={col} value={col}>{col}</Option>
                    ))}
                </Select>
            </Form.Item>
        </div>
    );
};
