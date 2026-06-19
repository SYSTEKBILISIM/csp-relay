import React from 'react';
import { Result, Button, Typography, Card, Space, Divider } from 'antd';
import { ReloadOutlined, WarningOutlined, DownloadOutlined, CloseCircleOutlined, ArrowLeftOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error('Uncaught error:', error, errorInfo);
  }

  handleDismiss = () => {
    // Signal TransferScreen to recover data from localStorage
    sessionStorage.setItem('error_recovery_pending', 'true');
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleExportRecovered = () => {
    try {
      const savedConfig = localStorage.getItem('temp_transfer_config');
      if (!savedConfig) return;
      const data = JSON.parse(savedConfig);
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `recovered-transfer-config-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Failed to export recovered configuration:', e);
    }
  };

  render() {
    if (this.state.hasError) {
      let hasRecoverableData = false;
      try {
        const savedConfig = localStorage.getItem('temp_transfer_config');
        if (savedConfig) {
          const parsed = JSON.parse(savedConfig);
          if (
            (parsed.objects && parsed.objects.length > 0) ||
            parsed.mainSheet ||
            (parsed.flowParams && parsed.flowParams.length > 0) ||
            (parsed.formParams && parsed.formParams.length > 0)
          ) {
            hasRecoverableData = true;
          }
        }
      } catch (e) {
        // ignore
      }

      const errorText = [
        this.state.error && this.state.error.toString(),
        this.state.errorInfo && this.state.errorInfo.componentStack
      ].filter(Boolean).join('\n');

      return (
        <div style={{ 
          height: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          background: '#f8fafc',
          padding: 24 
        }}>
          <Card style={{ maxWidth: 700, width: '100%', borderRadius: 24, boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}>
            <Result
              status="error"
              title="Bir Hata Oluştu"
              subTitle="Beklenmedik bir sorunla karşılaşıldı. Hatayı kapatıp işleminize devam edebilirsiniz."
              icon={<WarningOutlined style={{ color: '#ef4444' }} />}
              extra={
                <Space size={16} wrap>
                  <Button 
                    type="primary" 
                    key="dismiss" 
                    icon={<ArrowLeftOutlined />} 
                    onClick={this.handleDismiss}
                    size="large"
                    style={{ borderRadius: 8 }}
                  >
                    Kapat ve Devam Et
                  </Button>
                  {hasRecoverableData && (
                    <Button
                      type="default"
                      key="recover"
                      icon={<DownloadOutlined />}
                      onClick={this.handleExportRecovered}
                      size="large"
                      style={{ borderRadius: 8, borderColor: '#10b981', color: '#10b981' }}
                    >
                      Tanımlamaları Kurtar (Dışa Aktar)
                    </Button>
                  )}
                </Space>
              }
            >
              <div className="desc">
                <Paragraph>
                  <Text strong style={{ fontSize: 16 }}>
                    Hata Detayı:
                  </Text>
                </Paragraph>
                <Paragraph
                  copyable={{ text: errorText }}
                  style={{ 
                    background: '#f1f5f9', 
                    padding: 12, 
                    borderRadius: 8, 
                    fontFamily: 'monospace',
                    fontSize: 12,
                    maxHeight: 200,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    userSelect: 'text'
                  }}
                >
                  {errorText}
                </Paragraph>
              </div>

              {/* Reload option tucked away at the bottom */}
              <Divider style={{ margin: '12px 0 8px 0', borderColor: '#f1f5f9' }} />
              <div style={{ textAlign: 'right' }}>
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={this.handleReload}
                  style={{ color: '#94a3b8', fontSize: 12 }}
                >
                  Uygulamayı yeniden başlat
                </Button>
              </div>
            </Result>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
