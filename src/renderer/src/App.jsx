import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfigProvider, Layout, theme, App as AntApp } from 'antd';
import { DomainScreen } from './components/DomainScreen';
import { LoginScreen } from './components/LoginScreen';
import { ProjectScreen } from './components/ProjectScreen';
import { TransferScreen } from './components/TransferScreen';
import { TransferExecutionScreen } from './components/TransferExecutionScreen';
import { CustomHeader } from './components/CustomHeader';
import { StepIndicator } from './components/StepIndicator';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LogViewer } from './components/LogViewer';
import './assets/css/App.css';

// AntD Layout Components
const { Content, Footer } = Layout;

function App() {
    const [current, setCurrent] = useState(0); // 0: Domain, 1: Login, 2: Project, 3: Definition, 4: Execute
    const [config, setConfig] = useState(null);
    const [deployAgents, setDeployAgents] = useState([]);
    const [isTransferring, setIsTransferring] = useState(false); // Controls navigation lock

    const [stepData, setStepData] = useState({
        domain: null,
        user: null, // Stores username/login info
        project: null, // Stores project/flow info
        definition: null // Stores mapping info
    });

    // Theme Configuration
    const { defaultAlgorithm } = theme;
    const customTheme = {
        token: {
            colorPrimary: '#0ea5e9', // Sky 500
            borderRadius: 12,
            fontFamily: 'Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif',
            colorBgContainer: 'rgba(255, 255, 255, 0.8)',
        },
        algorithm: defaultAlgorithm
    };

    const handleDomainConnect = (domainUrl) => {
        console.log('Domain connected:', domainUrl);
        setConfig({ domain: domainUrl });
        setStepData(prev => ({ ...prev, domain: domainUrl }));
        setCurrent(1);
    };

    const handleLogin = (data) => {
        console.log('Login success:', data);
        if (data.deployAgents) {
            setDeployAgents(data.deployAgents);
        }
        // data usually contains { username, token, etc. }
        // We only want to store non-sensitive info for tooltips
        setStepData(prev => ({ ...prev, user: { username: data.username || 'User' } }));
        setCurrent(2);
    };

    const handleProjectSetup = (data) => {
        console.log('Project setup complete:', data);
        setStepData(prev => ({ ...prev, project: data }));
        setCurrent(3); // Move to Transfer
    };

    const handleTransferComplete = (data) => {
        console.log('Transfer defined:', data);
        setStepData(prev => ({ ...prev, definition: data }));
        setCurrent(4); // Move to Execution
    };

    const handleExecutionComplete = () => {
        console.log('Orchestration complete');
        // Final State or Reset
    };

    // Animation variants
    const variants = {
        enter: (direction) => ({
            x: direction > 0 ? 500 : -500,
            opacity: 0,
            scale: 0.95
        }),
        center: {
            zIndex: 1,
            x: 0,
            opacity: 1,
            scale: 1
        },
        exit: (direction) => ({
            zIndex: 0,
            x: direction < 0 ? 500 : -500,
            opacity: 0,
            scale: 0.95
        })
    };

    const mergedDefinitionData = useMemo(() => ({
        ...(stepData.project || {}),
        ...(stepData.definition || {})
    }), [stepData.project, stepData.definition]);

    return (
        <ConfigProvider theme={customTheme}>
            <AntApp>
                <Layout className="main-layout">
                    <CustomHeader />

                    <Content className="app-content">
                        <ErrorBoundary>
                            {/* Animated Content Area */}
                            <div className="screen-wrapper">
                                <AnimatePresence initial={false} custom={current} mode="wait">
                                    {current === 0 && (
                                        <motion.div
                                            key="domain"
                                            custom={current}
                                            variants={variants}
                                            initial="enter"
                                            animate="center"
                                            exit="exit"
                                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                            className="motion-container-sm"
                                        >
                                            <DomainScreen onConnect={handleDomainConnect} onOpenViewer={() => setCurrent(5)} />
                                        </motion.div>
                                    )}

                                    {current === 1 && (
                                        <motion.div
                                            key="login"
                                            custom={current}
                                            variants={variants}
                                            initial="enter"
                                            animate="center"
                                            exit="exit"
                                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                            className="motion-container-sm"
                                        >
                                            <LoginScreen onLogin={handleLogin} />
                                        </motion.div>
                                    )}

                                    {current === 2 && (
                                        <motion.div
                                            key="project"
                                            custom={current}
                                            variants={variants}
                                            initial="enter"
                                            animate="center"
                                            exit="exit"
                                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                            className="motion-container-md"
                                        >
                                            <ProjectScreen
                                                onFinish={handleProjectSetup}
                                                deployAgents={deployAgents}
                                                initialData={stepData.project}
                                            />
                                        </motion.div>
                                    )}

                                    {current === 3 && (
                                        <motion.div
                                            key="transfer"
                                            custom={current}
                                            variants={variants}
                                            initial="enter"
                                            animate="center"
                                            exit="exit"
                                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                            className="motion-container-lg"
                                        >
                                            <TransferScreen
                                                onFinish={handleTransferComplete}
                                                initialData={stepData.definition}
                                            />
                                        </motion.div>
                                    )}

                                    {current === 4 && (
                                        <motion.div
                                            key="execution"
                                            custom={current}
                                            variants={variants}
                                            initial="enter"
                                            animate="center"
                                            exit="exit"
                                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                            className="motion-container-lg"
                                        >
                                            <TransferExecutionScreen
                                                definitionData={mergedDefinitionData}
                                                onFinish={handleExecutionComplete}
                                                onStatusChange={setIsTransferring}
                                            />
                                        </motion.div>
                                    )}
                                    {current === 5 && (
                                        <motion.div
                                            key="logviewer"
                                            custom={current}
                                            variants={variants}
                                            initial="enter"
                                            animate="center"
                                            exit="exit"
                                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                            style={{ width: '100%', height: '100%' }}
                                        >
                                            <LogViewer onBack={() => setCurrent(0)} />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </ErrorBoundary>
                    </Content>

                    {current !== 5 && (
                        <Footer className="app-footer">
                            <StepIndicator
                                current={current}
                                stepData={stepData}
                                disabled={isTransferring}
                                onStepClick={(stepIndex) => {
                                    // Simple nav logic: allow clicking back ONLY if not transferring
                                    if (!isTransferring && stepIndex < current) setCurrent(stepIndex);
                                }}
                            />
                        </Footer>
                    )}
                </Layout>
            </AntApp>
        </ConfigProvider>
    );
}


export default App;
