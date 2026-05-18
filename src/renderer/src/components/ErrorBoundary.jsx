import React from 'react';
import { Result, Button, Typography, Card } from 'antd';
import { ReloadOutlined, WarningOutlined } from '@ant-design/icons';

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

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          height: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          background: '#f8fafc',
          padding: 24 
        }}>
          <Card style={{ maxWidth: 600, borderRadius: 24, boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}>
            <Result
              status="error"
              title="Bir Hata Oluştu"
              subTitle="Uygulama beklenmedik bir sorunla karşılaştı. Aktarım çok büyükse bellek yetersiz kalmış olabilir."
              icon={<WarningOutlined style={{ color: '#ef4444' }} />}
              extra={[
                <Button 
                  type="primary" 
                  key="reload" 
                  icon={<ReloadOutlined />} 
                  onClick={this.handleReload}
                  size="large"
                  style={{ borderRadius: 8 }}
                >
                  Uygulamayı Yeniden Başlat
                </Button>
              ]}
            >
              <div className="desc">
                <Paragraph>
                  <Text strong style={{ fontSize: 16 }}>
                    Hata Detayı:
                  </Text>
                </Paragraph>
                <Paragraph copyable style={{ 
                  background: '#f1f5f9', 
                  padding: 12, 
                  borderRadius: 8, 
                  fontFamily: 'monospace',
                  fontSize: 12,
                  maxHeight: 200,
                  overflow: 'auto'
                }}>
                  {this.state.error && this.state.error.toString()}
                  <br />
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </Paragraph>
              </div>
            </Result>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
