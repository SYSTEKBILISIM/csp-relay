import React from 'react';
import { Tooltip } from 'antd';
import { CheckOutlined } from '@ant-design/icons';

export const StepIndicator = ({ current, onStepClick, stepData = {}, disabled = false }) => {
    const steps = [
        { key: 0, label: 'Domain', icon: 'server' },
        { key: 1, label: 'Login', icon: 'lock' },
        { key: 2, label: 'Setup', icon: 'project' },
        { key: 3, label: 'Definition', icon: 'cloud-upload' },
        { key: 4, label: 'Transfer', icon: 'sync' }
    ];

    const getTooltipContent = (stepKey) => {
        if (stepKey === 0) {
            return stepData.domain ? (
                <div>
                    <strong>Connected Domain:</strong><br />
                    {stepData.domain}
                </div>
            ) : "Connect to Domain";
        }
        if (stepKey === 1) {
            return stepData.user ? (
                <div>
                    <strong>Logged In As:</strong><br />
                    {stepData.user.username}
                </div>
            ) : "Login Credentials";
        }
        if (stepKey === 2) {
            return stepData.project ? (
                <div>
                    <strong>Project Info:</strong><br />
                    {stepData.project.projectName} / {stepData.project.flowName}<br />
                    <small>{stepData.project.transactionType}</small>
                </div>
            ) : "Project Configuration";
        }
        if (stepKey === 3) return "Transfer Definition";
        return "Transfer Execution";
    };

    return (
        <div className={`step-indicator ${disabled ? 'disabled' : ''}`}>
            {steps.map((step, index) => {
                const isActive = current === step.key;
                const isCompleted = current > step.key;
                const isLast = index === steps.length - 1;

                return (
                    <React.Fragment key={step.key}>
                        <Tooltip title={disabled ? "Transfer in progress" : getTooltipContent(step.key)}>
                            <div
                                className={`step-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${disabled ? 'disabled-item' : ''}`}
                                onClick={() => !disabled && onStepClick && onStepClick(step.key)}
                                style={{ transition: 'all 0.3s ease', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled && !isActive ? 0.5 : 1 }}
                            >
                                <div className="step-circle">
                                    {isCompleted ? <CheckOutlined style={{ fontSize: 12 }} /> : step.key + 1}
                                </div>
                                {isActive && (
                                    <span className="step-label" style={{
                                        marginLeft: 8,
                                        fontWeight: 600,
                                        color: '#0f172a',
                                        fontSize: '0.9rem',
                                        animation: 'fadeIn 0.3s ease-in'
                                    }}>
                                        {step.label}
                                    </span>
                                )}
                            </div>
                        </Tooltip>

                        {!isLast && (
                            <div style={{
                                width: 24,
                                height: 2,
                                background: isCompleted ? '#10b981' : '#e2e8f0',
                                borderRadius: 1,
                                transition: 'background 0.3s ease',
                                opacity: disabled ? 0.5 : 1
                            }}></div>
                        )}
                    </React.Fragment>
                );
            })}

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateX(-5px); }
                    to { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </div>
    );
};
