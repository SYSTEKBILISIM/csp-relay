import React from 'react';
import { Form, Select, Typography, Alert } from 'antd';
import { FileOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;

/**
 * Config UI for RelatedDocument type objects.
 * The user selects which Excel column contains the file path for this row.
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
                description="Select the Excel column that contains the absolute file path for each row. The file will be read at transfer time and sent as Name, Extension, and Data (base64)."
                type="info"
                showIcon
                style={{ marginBottom: 20, fontSize: 12 }}
            />

            <Form.Item
                name="pathCol"
                label={<span style={{ fontWeight: 600 }}>File Path Column</span>}
                rules={[{ required: true, message: 'Please select File Path Column' }]}
                style={{ marginBottom: 0 }}
            >
                <Select
                    placeholder="Select Excel column containing file path..."
                    showSearch
                    optionFilterProp="children"
                    style={{ width: '100%' }}
                >
                    {excelColumns.map(col => (
                        <Option key={col} value={col}>{col}</Option>
                    ))}
                </Select>
            </Form.Item>
        </div>
    );
};
