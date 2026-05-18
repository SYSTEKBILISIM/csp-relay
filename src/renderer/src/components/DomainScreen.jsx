import React, { useState } from 'react';
import { Card, Input, Button, Typography, message } from 'antd';
import { GlobalOutlined, LinkOutlined, FileTextOutlined } from '@ant-design/icons';
import { apiClient } from '../api/client';
import { globalStore } from '../store/GlobalStore';
import logo from '../assets/csp-relay.png';
import '../assets/css/DomainScreen.css';

const { Title, Text } = Typography;

export const DomainScreen = ({ onConnect, onOpenViewer }) => {
    const [domain, setDomain] = useState('');
    const [loading, setLoading] = useState(false);
    const [messageApi, contextHolder] = message.useMessage();

    const handleConnect = async () => {
        let cleanDomain = domain.trim();
        while (cleanDomain.endsWith('/')) {
            cleanDomain = cleanDomain.slice(0, -1);
        }

        if (!cleanDomain) {
            messageApi.warning('Please enter a domain address');
            return;
        }


        setLoading(true);
        try {
            console.log(`Checking connection to: ${cleanDomain}`);

            const payload = {
                DomainAddress: cleanDomain,
                Source: 'WebInterface'
            };

            // Set base url immediately to test connectivity
            apiClient.setBaseUrl(cleanDomain);

            const result = await apiClient.post('/api/web/Login/GetLoginParameters', payload);

            console.log('Connection successful:', result);
            messageApi.success('Connected successfully to Synergy CSP');

            // Store response and domain
            globalStore.set('loginParameters', result);
            globalStore.set('mainUrl', cleanDomain);

            // Delay slightly for UX
            setTimeout(() => {
                if (onConnect) onConnect(cleanDomain);
            }, 500);

        } catch (err) {
            console.error('Connection failed:', err);
            messageApi.error(`Bağlantı hatası: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {contextHolder}
            <Card
                variant="borderless"
                className="domain-card"
                styles={{ body: { padding: '0' } }}
            >
                <div className="domain-header-box">
                    <div className="domain-logo-box">
                        <img src={logo} alt="CSP Relay Logo" className="domain-logo" />
                    </div>

                    <Title level={3} className="domain-title">
                        Synergy CSP Relay
                    </Title>
                    <Text type="secondary" className="domain-subtitle">
                        Transfer Application
                    </Text>
                </div>

                <Input
                    size="large"
                    placeholder="Domain Address"
                    prefix={<LinkOutlined style={{ color: '#94a3b8' }} />}
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    onPressEnter={handleConnect}
                    className="domain-input"
                />

                <Button
                    type="primary"
                    size="large"
                    block
                    onClick={handleConnect}
                    loading={loading}
                    className="domain-btn-gradient"
                >
                    Connect
                </Button>

                <div style={{ marginTop: 24, textAlign: 'center', borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 12, fontWeight: 500 }}>
                        ANALYSIS TOOLS
                    </Text>
                    <Button 
                        type="default" 
                        icon={<FileTextOutlined style={{ color: '#0ea5e9' }} />} 
                        onClick={onOpenViewer}
                        block
                        className="domain-viewer-btn"
                        style={{ height: 40, borderRadius: 10 }}
                    >
                        Analyze Transfer Logs
                    </Button>
                    <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 8 }}>
                        View details from previously exported .json log files
                    </Text>
                </div>
            </Card>
        </>
    );
};
