import React from 'react';
import { Row, Col, Form, Input, Button, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';

const { Text } = Typography;

export const ParametersList = ({ name = "parameters", label = "Parameters", help = null }) => (
    <div style={{ marginBottom: 16 }}>
        {label && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong style={{ fontSize: 13 }}>{label}</Text>
                {help && <Text type="secondary" style={{ fontSize: 11 }}>{help}</Text>}
            </div>
        )}

        <Form.List name={name}>
            {(fields, { add, remove }) => (
                <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 6, overflow: 'hidden' }}>
                    {fields.length > 0 && (
                        <Row style={{ background: '#fafafa', padding: '4px 8px', borderBottom: '1px solid #f0f0f0' }}>
                            <Col span={10}><Text type="secondary" style={{ fontSize: 10, fontWeight: 600 }}>KEY</Text></Col>
                            <Col span={12}><Text type="secondary" style={{ fontSize: 10, fontWeight: 600 }}>VALUE</Text></Col>
                            <Col span={2}></Col>
                        </Row>
                    )}
                    {fields.map(({ key, name, ...restField }) => (
                        <Row key={key} align="middle" style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0' }}>
                            <Col span={10} style={{ paddingRight: 8 }}>
                                <Form.Item {...restField} name={[name, 'key']} rules={[{ required: true, message: 'Please enter key' }]} style={{ marginBottom: 0 }}>
                                    <Input placeholder="Key" variant="filled" style={{ padding: '4px 8px' }} />
                                </Form.Item>
                            </Col>
                            <Col span={1} style={{ textAlign: 'center', color: '#d9d9d9' }}>:</Col>
                            <Col span={11} style={{ paddingLeft: 8 }}>
                                <Form.Item {...restField} name={[name, 'value']} rules={[{ required: true, message: 'Please enter value' }]} style={{ marginBottom: 0 }}>
                                    <Input placeholder="Value" variant="filled" style={{ padding: '4px 8px', color: '#1677ff' }} />
                                </Form.Item>
                            </Col>
                            <Col span={2} style={{ textAlign: 'right' }}>
                                <DeleteOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f', cursor: 'pointer', padding: 4 }} />
                            </Col>
                        </Row>
                    ))}
                    <Button type="dashed" onClick={() => add({ key: '', value: '' })} block icon={<PlusOutlined />} style={{ border: 'none', borderRadius: 0, height: 32, fontSize: 12 }}>
                        Add Parameter
                    </Button>
                </div>
            )}
        </Form.List>
    </div>
);
