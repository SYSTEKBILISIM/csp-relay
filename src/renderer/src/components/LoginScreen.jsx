import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Select, Button, Typography, message } from 'antd';
import { UserOutlined, LockOutlined, GlobalOutlined } from '@ant-design/icons';
import { globalStore } from '../store/GlobalStore';
import { apiClient } from '../api/client';
import '../assets/css/LoginScreen.css';

const { Title, Text } = Typography;
const { Option } = Select;

export const LoginScreen = ({ onLogin }) => {
    const [form] = Form.useForm();
    const [languages, setLanguages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [messageApi, contextHolder] = message.useMessage();

    useEffect(() => {
        // Load languages from store
        const params = globalStore.get('loginParameters');

        if (params && Array.isArray(params.Languages)) {
            setLanguages(params.Languages);

            // Set default
            if (params.DefaultLanguage) {
                form.setFieldsValue({ language: params.DefaultLanguage });
            } else if (params.Languages.length > 0) {
                form.setFieldsValue({ language: params.Languages[0].Name });
            }
        } else {
            // Fallback
            setLanguages([
                { Name: 'tr-TR', Text: 'Türkçe' },
                { Name: 'en-US', Text: 'English' }
            ]);
        }
    }, []);

    const onFinish = async (values) => {
        setLoading(true);

        try {
            // Get necessary headers
            const encryptedData = globalStore.get('encryptedData');

            // Construct Body
            const body = {
                language: values.language,
                username: values.username,
                password: values.password,
                rememberMe: false,
                captcha: null,
                captchaId: null
            };

            console.log('Login Request:', body);

            // Make API Call
            const result = await apiClient.post('/api/web/Login/Login', body, {
                headers: {
                    'bimser-encrypted-data': encryptedData,
                    'bimser-language': values.language
                }
            });

            console.log('Login Result:', result);

            if (result.success) {
                // Determine token based on response structure
                let token = result.token;
                if (!token && result.result && result.result.token) {
                    token = result.result.token;
                }

                if (token) {
                    globalStore.set('token', token);
                    globalStore.set('language', values.language);

                    // Step 2: Fetch Deploy Agents
                    try {
                        const agentsResult = await apiClient.get('/api/buildManager/BuildManager/GetDeployAgents', {}, {
                            headers: {
                                'bimser-devtools': true,
                                'bimser-encrypted-data': encryptedData,
                                'bimser-language': values.language,
                                'authorization': `Bearer ${token}`
                            }
                        });

                        console.log('Deploy Agents Result:', agentsResult);

                        // Extract agents safely
                        let agentsList = [];
                        if (Array.isArray(agentsResult)) {
                            agentsList = agentsResult;
                        } else if (agentsResult && Array.isArray(agentsResult.result)) {
                            agentsList = agentsResult.result;
                        } else if (agentsResult && agentsResult.result && Array.isArray(agentsResult.result.deployAgents)) {
                            // Correct structure based on user feedback/screenshot
                            agentsList = agentsResult.result.deployAgents;
                        } else if (agentsResult && agentsResult.result && Array.isArray(agentsResult.result.result)) {
                            agentsList = agentsResult.result.result;
                        } else if (agentsResult && Array.isArray(agentsResult.value)) {
                            agentsList = agentsResult.value;
                        }

                        console.log('Extracted Agents List:', agentsList);

                        // Pass both login result and agents to the callback
                        const loginData = {
                            loginResult: result,
                            deployAgents: agentsList,
                            username: values.username
                        };

                        messageApi.success('Login Successful');
                        if (onLogin) onLogin(loginData);

                    } catch (agentError) {
                        console.error('Failed to fetch agents:', agentError);
                        messageApi.warning('Login successful but failed to fetch deploy agents.');
                        // Proceed anyway, maybe retry later? For now proceed.
                        if (onLogin) onLogin({ loginResult: result, deployAgents: [] });
                    }

                } else {
                    throw new Error('Token not found in response');
                }
            } else {
                // Handle API error messages
                throw new Error(result.message || 'Login failed');
            }

        } catch (error) {
            console.error('Login Error:', error);
            messageApi.error(error.message || 'Connection failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {contextHolder}
            <Card
                variant="borderless"
                className="login-card"
                styles={{ body: { padding: '0' } }}
            >
                <div className="login-header-box">
                    <Title level={3} className="login-title">
                        Welcome Back
                    </Title>
                    <Text type="secondary" className="login-subtitle">
                        Please sign in to continue
                    </Text>
                </div>

                <Form
                    form={form}
                    name="login_form"
                    layout="vertical"
                    onFinish={onFinish}
                    size="large" /* Request: Increase input height */
                    requiredMark={false}
                >
                    <Form.Item
                        name="language"
                        label={<span className="form-field-label">Language</span>}
                        rules={[{ required: true, message: 'Required' }]}
                        style={{ marginBottom: 2 }}
                    >
                        <Select
                            placeholder="Select Language"
                            suffixIcon={<GlobalOutlined style={{ color: '#64748b' }} />}
                            className="login-input-rounded"
                            styles={{
                                popup: { borderRadius: 12, padding: 8 }
                            }}
                        >
                            {languages.map(lang => (
                                <Option key={lang.Name} value={lang.Name}>{lang.Text || lang.Name}</Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item
                        name="username"
                        label={<span className="form-field-label">Username</span>}
                        rules={[{ required: true, message: 'Required' }]}
                        style={{ marginBottom: 2 }}
                    >
                        <Input
                            prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
                            placeholder="Enter username"
                            className="login-input-rounded"
                        />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        label={<span className="form-field-label">Password</span>}
                        rules={[{ required: true, message: 'Required' }]}
                        labelCol={{ style: { paddingBottom: 0, margin: 0 } }}
                        wrapperCol={{ style: { marginTop: 0 } }}
                        style={{ marginBottom: 2 }}
                    >
                        <Input.Password
                            prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                            placeholder="Enter password"
                            className="login-input-rounded"
                        />
                    </Form.Item>

                    <Form.Item style={{ marginTop: 12 }}>
                        <Button
                            type="primary"
                            htmlType="submit"
                            block
                            loading={loading}
                            className="login-btn-gradient"
                        >
                            Log In
                        </Button>
                    </Form.Item>
                </Form>
            </Card>
        </>
    );
};
