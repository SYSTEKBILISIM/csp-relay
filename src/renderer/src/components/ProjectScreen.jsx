import React, { useState } from 'react';
import { Card, Form, Input, Select, Button, Typography, Row, Col, Upload, Tooltip, App } from 'antd';
import { ProjectOutlined, PartitionOutlined, BuildOutlined, FileTextOutlined, FileExcelOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { globalStore } from '../store/GlobalStore';
import { parseExcelFile } from '../services/ExcelService';
import { apiClient } from '../api/client';

import '../assets/css/ProjectScreen.css';

const { Title, Text } = Typography;
const { Option } = Select;
const { Dragger } = Upload;

const getLocalizedText = (textObj) => {
    if (!textObj) return '';
    const lang = globalStore.get('language') || 'tr-TR';
    if (typeof textObj === 'string') return textObj;
    if (textObj[lang]) return textObj[lang];
    const firstKey = Object.keys(textObj)[0];
    return firstKey ? textObj[firstKey] : '';
};

const turkishLower = (str) => {
    if (!str) return '';
    return str.toLocaleLowerCase('tr-TR');
};

export const ProjectScreen = ({ onFinish, deployAgents = [], initialData }) => {
    const { message } = App.useApp();
    const [form] = Form.useForm();

    // Watch fields for dynamic icon coloring
    const watchedTransactionType = Form.useWatch('transactionType', form);
    const watchedDeployAgent = Form.useWatch('deployAgent', form);
    const watchedProjectName = Form.useWatch('projectName', form);
    const watchedFlowName = Form.useWatch('flowName', form);
    const watchedFormName = Form.useWatch('formName', form);
    const watchedFlowDocName = Form.useWatch('flowDocumentName', form);
    const watchedEventCode = Form.useWatch('startingEventCode', form);

    const [loading, setLoading] = useState(false);
    const [transactionType, setTransactionType] = useState(null);
    const [fileList, setFileList] = useState([]);
    const [projects, setProjects] = useState([]);
    const [projectsLoading, setProjectsLoading] = useState(false);
    const [forms, setForms] = useState([]);
    const [flows, setFlows] = useState([]);
    const [flowDocs, setFlowDocs] = useState([]);
    const [flowEvents, setFlowEvents] = useState([]);
    const [projectTree, setProjectTree] = useState(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [docsLoading, setDocsLoading] = useState(false);

    const fetchProjectDetails = async (projectSecretKey) => {
        const mainUrl = globalStore.get('mainUrl');
        if (!mainUrl || !projectSecretKey) return;

        setDetailsLoading(true);
        try {
            apiClient.setBaseUrl(mainUrl);
            const headers = {
                'bimser-language': globalStore.get('language') || 'tr-TR',
                'bimser-encrypted-data': globalStore.get('encryptedData'),
                'Authorization': `Bearer ${globalStore.get('token')}`
            };

            const [formsRes, flowsRes, treeRes] = await Promise.all([
                apiClient.post('/api/ide/ProjectManager/GetForms', { projectSecretKey }, { headers }),
                apiClient.post('/api/ide/ProjectManager/GetFlows', { projectSecretKey }, { headers }),
                apiClient.post('/api/ide/ProjectManager/OpenProject', { projectSecretKey }, { headers })
            ]);

            if (treeRes.success && treeRes.result?.data) {
                try {
                    setProjectTree(JSON.parse(treeRes.result.data));
                } catch (e) {
                    console.error('Failed to parse project tree:', e);
                }
            }
            if (formsRes.success && formsRes.result?.forms) {
                const extractedForms = formsRes.result.forms.map(item => {
                    let caption = item.name;
                    if (item.identity?.idFormat && item.identity.idFormat !== '<u>') {
                        caption = item.identity.idFormat;
                    }
                    return {
                        value: item.name,
                        name: item.name,
                        text: caption,
                        label: `${item.name} ${caption}`
                    };
                });
                setForms(extractedForms);
            }

            if (flowsRes.success && flowsRes.result?.flows) {
                const extractedFlows = flowsRes.result.flows.map(item => {
                    const caption = getLocalizedCaption(item);
                    return {
                        id: item.id,
                        value: item.name,
                        name: item.name,
                        text: caption,
                        label: `${item.name} ${caption}`
                    };
                });
                setFlows(extractedFlows);
            }
        } catch (error) {
            console.error('Failed to fetch project details:', error);
            message.error('Project Details Load Error: ' + error.message);
        } finally {
            setDetailsLoading(false);
        }
    };

    const getFlowNumericId = (items, flowName) => {
        if (!items) return null;
        for (const item of items) {
            // Check if this item is our flow file (type 1)
            if (item.type === 1 && item.name === flowName) {
                return item.id;
            }
            // Recurse into folders
            if (item.items && item.items.length > 0) {
                const foundId = getFlowNumericId(item.items, flowName);
                if (foundId) return foundId;
            }
        }
        return null;
    };

    const fetchFlowDocuments = async (flowId) => {
        const mainUrl = globalStore.get('mainUrl');
        const projectSecretKey = globalStore.get('projectSecretKey');
        if (!mainUrl || !flowId || !projectSecretKey) return;

        setDocsLoading(true);
        try {
            apiClient.setBaseUrl(mainUrl);
            const headers = {
                'bimser-language': globalStore.get('language') || 'tr-TR',
                'bimser-encrypted-data': globalStore.get('encryptedData'),
                'Authorization': `Bearer ${globalStore.get('token')}`
            };

            const payload = {
                itemId: flowId,
                itemType: 1,
                itemData: null,
                passKey: null,
                projectSecretKey
            };

            const response = await apiClient.post('/api/ide/SolutionExplorer/GetItemContent', payload, { headers });

            if (response.success && response.result?.itemData) {
                const flowData = JSON.parse(response.result.itemData);

                // Extract Events
                const extractedEvents = (flowData.properties?.events || []).map(e => {
                    const desc = getLocalizedText(e.description);
                    return {
                        value: e.id,
                        text: desc,
                        label: `${e.id} ${desc}`
                    };
                });
                setFlowEvents(extractedEvents);

                // Extract Documents
                const extractedDocs = (flowData.items || [])
                    .filter(item => item.typeName === "FlowDocument")
                    .map(item => {
                        const caption = getLocalizedCaption(item);
                        return {
                            value: item.name,
                            name: item.name,
                            text: caption,
                            label: `${item.name} ${caption}`
                        };
                    });
                setFlowDocs(extractedDocs);
            }
        } catch (error) {
            console.error('Failed to fetch flow documents:', error);
            message.error('Flow Documents Load Error: ' + error.message);
        } finally {
            setDocsLoading(false);
        }
    };

    const fetchProjects = async () => {
        const mainUrl = globalStore.get('mainUrl');
        if (!mainUrl) return;

        setProjectsLoading(true);
        try {
            apiClient.setBaseUrl(mainUrl);

            // Build headers manually based on state (similar to TransferService)
            const headers = {
                'bimser-language': globalStore.get('language') || 'tr-TR'
            };
            const encryptedData = globalStore.get('encryptedData');
            if (encryptedData) headers['bimser-encrypted-data'] = encryptedData;
            const token = globalStore.get('token');
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await apiClient.post('/api/ide/ProjectManager/GetProjects', {}, { headers });
            if (response.success && response.result?.projects) {
                setProjects(response.result.projects);
            } else {
                setProjects([]);
                const errorMsg = response.message || (response.result && response.result.message);
                if (errorMsg) message.error(errorMsg);
            }
        } catch (error) {
            console.error('Failed to fetch projects:', error);
            message.error('Project Load Error: ' + error.message);
            setProjects([]);
        } finally {
            setProjectsLoading(false);
        }
    };

    const getLocalizedCaption = (project) => {
        const userLang = globalStore.get('language') || 'tr-TR';
        const captions = project.caption || {};

        if (captions[userLang]) return captions[userLang];

        // Fallback
        const availableLangs = Object.keys(captions).filter(l => captions[l]);
        if (availableLangs.length > 0) {
            const firstLang = availableLangs[0];
            return `${captions[firstLang]} (${firstLang})`;
        }

        return project.name;
    };

    // Restore state
    React.useEffect(() => {
        if (initialData) {
            form.setFieldsValue(initialData);
            if (initialData.transactionType) setTransactionType(initialData.transactionType);

            // Restore File Visual
            if (initialData.fileName) {
                const storedPath = globalStore.get('transferFile');
                setFileList([{
                    uid: '-1',
                    name: initialData.fileName,
                    status: 'done',
                    path: storedPath // Restore path for handleSubmit
                }]);
            }
        }
    }, [initialData]);

    React.useEffect(() => {
        fetchProjects();
    }, []);

    // Effect to fetch details when project list is loaded and initial project is set
    React.useEffect(() => {
        const projectName = form.getFieldValue('projectName');
        if (projectName && projects.length > 0) {
            const selectedProject = projects.find(p => p.name === projectName);
            if (selectedProject) fetchProjectDetails(selectedProject.secretKey);
        }
    }, [projects]);

    React.useEffect(() => {
        const flowName = form.getFieldValue('flowName');
        if (flowName && flows.length > 0 && projectTree) {
            const numericId = getFlowNumericId(projectTree.items, flowName);
            if (numericId) {
                fetchFlowDocuments(numericId);
            } else {
                const selectedFlow = flows.find(f => f.name === flowName);
                if (selectedFlow) fetchFlowDocuments(selectedFlow.id);
            }
        }
    }, [flows, projectTree]);

    const uploadProps = {
        name: 'file',
        multiple: false,
        maxCount: 1,
        accept: '.xlsx, .xls',
        beforeUpload: async (file) => {
            setFileList([file]);

            try {
                const { sheets, sheetColumns, fileContent } = await parseExcelFile(file);

                // Save to Store
                globalStore.set('excelSheets', sheets);
                globalStore.set('excelColumns', sheetColumns);
                globalStore.set('excelContent', fileContent);

                message.success(`Parsed ${sheets.length} sheets successfully`);
            } catch (err) {
                console.error('Excel processing error:', err);
                message.error('Failed to parse Excel file.');
                setFileList([]); // Clear invalid file
            }

            return false; // Prevent auto upload
        },
        fileList,
        onRemove: () => {
            setFileList([]);
            globalStore.delete('excelSheets');
            globalStore.delete('excelColumns');
            globalStore.delete('excelContent');
        },
    };

    const handleSubmit = (values) => {
        if (fileList.length === 0) {
            message.error('Please upload an Excel file');
            return;
        }

        setLoading(true);
        console.log('Project Setup:', { ...values, file: fileList[0] });

        // Save constants
        globalStore.set('deployAgent', values.deployAgent); // ID

        // Find and save full deploy URL
        const selectedAgent = deployAgents.find(a => a.uId === values.deployAgent);
        if (selectedAgent && selectedAgent.url) {
            globalStore.set('deployUrl', selectedAgent.url);
        } else {
            console.warn('Deploy URL not found for agent:', values.deployAgent);
            // Fallback or empty?
            globalStore.set('deployUrl', '');
        }

        globalStore.set('transactionType', values.transactionType);
        globalStore.set('projectName', values.projectName);

        const selectedProject = projects.find(p => p.name === values.projectName);
        if (selectedProject) {
            globalStore.set('projectSecretKey', selectedProject.secretKey);
        }

        globalStore.set('flowName', values.flowName);
        globalStore.set('formName', values.formName);
        globalStore.set('flowDocumentName', values.flowDocumentName);
        globalStore.set('startingEventCode', values.startingEventCode);
        globalStore.set('transferFile', fileList[0].path); // Save file path here

        // Simulate/Execute naming logic
        setTimeout(() => {
            setLoading(false);
            if (onFinish) {
                const selectedProject = projects.find(p => p.name === values.projectName);
                onFinish({
                    ...values,
                    fileName: fileList[0].name,
                    projectSecretKey: selectedProject?.secretKey
                });
            }
        }, 1000);
    };

    return (
        <Card
            variant="borderless"
            className="project-card"
            styles={{ body: { padding: '0' } }}
        >
            <div className="project-header">
                <Title level={3} className="project-title">
                    Project Setup
                </Title>
                <Text type="secondary" className="project-subtitle">
                    Configure your relay environment
                </Text>
            </div>

            <Form
                form={form}
                name="project_form"
                layout="vertical"
                onFinish={handleSubmit}
                requiredMark={false}
            >
                <Row gutter={[24, 20]} style={{ marginTop: 10, marginBottom: 10 }}>
                    <Col span={12}>
                        <Form.Item
                            noStyle
                            shouldUpdate={(prev, cur) => prev.transactionType !== cur.transactionType}
                        >
                            {({ getFieldValue }) => (
                                <Form.Item
                                    name="transactionType"
                                    label={<span className="project-label">Transfer Type</span>}
                                    rules={[{ required: true, message: 'Required' }]}
                                    style={{ marginBottom: 20 }}
                                >
                                    <Select
                                        placeholder="Type"
                                        onSelect={() => document.activeElement.blur()}
                                        onChange={(val) => {
                                            setTransactionType(val);
                                            form.setFieldsValue({
                                                projectName: undefined,
                                                formName: undefined,
                                                flowName: undefined,
                                                flowDocumentName: undefined,
                                                startingEventCode: undefined
                                            });
                                            setForms([]);
                                            setFlows([]);
                                            setFlowDocs([]);
                                            setFlowEvents([]);
                                        }}
                                        prefix={<BuildOutlined className={getFieldValue('transactionType') ? "project-select-icon-active" : "project-select-icon-default"} />}
                                        className="project-select"
                                        classNames={{ popup: 'project-select-popup' }}
                                    >
                                        <Option value="CreateFlow">CreateFlow</Option>
                                        <Option value="CreateForm">CreateForm</Option>
                                        <Option value="EditForm">EditForm</Option>
                                    </Select>
                                </Form.Item>
                            )}
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item
                            noStyle
                            shouldUpdate={(prev, cur) => prev.deployAgent !== cur.deployAgent}
                        >
                            {({ getFieldValue }) => (
                                <Form.Item
                                    name="deployAgent"
                                    label={
                                        <span className="project-label-with-icon">
                                            Deploy Agent
                                            <Tooltip title="Select the deploy agent information for the transfer application.">
                                                <InfoCircleOutlined className="project-select-secondary-icon" style={{ cursor: 'pointer' }} />
                                            </Tooltip>
                                        </span>
                                    }
                                    rules={[{ required: true, message: 'Required' }]}
                                    style={{ marginBottom: 12 }}
                                >
                                    <Select
                                        placeholder="Agent"
                                        onSelect={() => document.activeElement.blur()}
                                        prefix={<BuildOutlined className={getFieldValue('deployAgent') ? "project-select-icon-active" : "project-select-icon-default"} />}
                                        className="project-select"
                                        classNames={{ popup: 'project-select-popup' }}
                                        onChange={(val) => {
                                            form.setFieldsValue({ projectName: undefined });
                                        }}
                                    >
                                        {(Array.isArray(deployAgents) ? deployAgents : []).map((agent, index) => (
                                            <Option key={index} value={agent.uId}>{agent.uId}</Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            )}
                        </Form.Item>
                    </Col>
                </Row>

                {transactionType === 'CreateFlow' && (
                    <div className="project-animated-section">
                        <Row gutter={[24, 20]} style={{ marginTop: 10, marginBottom: 10 }}>
                            <Col span={12}>
                                <Form.Item
                                    noStyle
                                    shouldUpdate={(prev, cur) => prev.projectName !== cur.projectName}
                                >
                                    {({ getFieldValue }) => (
                                        <Form.Item
                                            name="projectName"
                                            label={<span className="project-label">Project Name</span>}
                                            rules={[{ required: true, message: 'Required' }]}
                                            style={{ marginBottom: 20 }}
                                        >
                                            <Select
                                                showSearch
                                                onSelect={() => document.activeElement.blur()}
                                                loading={projectsLoading}
                                                placeholder="Select project"
                                                prefix={<ProjectOutlined className={getFieldValue('projectName') ? "project-select-icon-active" : "project-select-icon-default"} />}
                                                className="project-select project-select-full"
                                                classNames={{ popup: 'project-select-popup' }}
                                                filterOption={(input, option) => {
                                                    const search = turkishLower(input);
                                                    const label = turkishLower(option.label || '');
                                                    return label.includes(search);
                                                }}
                                                onChange={(val) => {
                                                    const selectedProject = projects.find(p => p.name === val);
                                                    setForms([]);
                                                    setFlows([]);
                                                    setFlowDocs([]);
                                                    setFlowEvents([]);
                                                    form.setFieldsValue({
                                                        formName: undefined,
                                                        flowName: undefined,
                                                        flowDocumentName: undefined,
                                                        startingEventCode: undefined
                                                    });

                                                    if (selectedProject) {
                                                        globalStore.set('projectSecretKey', selectedProject.secretKey);
                                                        fetchProjectDetails(selectedProject.secretKey);
                                                    }
                                                }}
                                            >
                                                {projects.map(project => (
                                                    <Option key={project.id} value={project.name} label={`${project.name} ${getLocalizedCaption(project)}`}>
                                                        <div className="project-option-container">
                                                            <span className="project-option-main">{project.name}</span>
                                                            <span className="project-option-sub">{getLocalizedCaption(project)}</span>
                                                        </div>
                                                    </Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    )}
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    noStyle
                                    shouldUpdate={(prev, cur) => prev.flowName !== cur.flowName}
                                >
                                    {({ getFieldValue }) => (
                                        <Form.Item
                                            name="flowName"
                                            label={<span className="project-label">Flow Name</span>}
                                            rules={[{ required: true, message: 'Required' }]}
                                            style={{ marginBottom: 20 }}
                                        >
                                            <Select
                                                showSearch
                                                onSelect={() => document.activeElement.blur()}
                                                loading={detailsLoading}
                                                placeholder="Select Flow"
                                                prefix={<PartitionOutlined className={getFieldValue('flowName') ? "project-select-icon-active" : "project-select-icon-default"} />}
                                                className="project-select project-select-full"
                                                classNames={{ popup: 'project-select-popup' }}
                                                filterOption={(input, option) => {
                                                    const search = turkishLower(input);
                                                    const label = turkishLower(option.label || '');
                                                    return label.includes(search);
                                                }}
                                                onChange={(val) => {
                                                    const selectedFlow = flows.find(f => f.name === val);
                                                    setFlowDocs([]);
                                                    setFlowEvents([]);
                                                    form.setFieldsValue({
                                                        flowDocumentName: undefined,
                                                        startingEventCode: undefined
                                                    });

                                                    if (selectedFlow && projectTree) {
                                                        const numericId = getFlowNumericId(projectTree.items, val);
                                                        if (numericId) {
                                                            fetchFlowDocuments(numericId);
                                                        } else {
                                                            fetchFlowDocuments(selectedFlow.id);
                                                        }
                                                    }
                                                }}
                                            >
                                                {flows.map(item => (
                                                    <Option key={item.value} value={item.value} label={`${item.name} ${item.text}`}>
                                                        <div className="project-option-container">
                                                            <span className="project-option-main">{item.name}</span>
                                                            <span className="project-option-sub">{item.text}</span>
                                                        </div>
                                                    </Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    )}
                                </Form.Item>
                            </Col>
                        </Row>

                        <Row gutter={[24, 20]} style={{ marginTop: 10, marginBottom: 10 }}>
                            <Col span={12}>
                                <Form.Item
                                    noStyle
                                    shouldUpdate={(prev, cur) => prev.flowDocumentName !== cur.flowDocumentName}
                                >
                                    {({ getFieldValue }) => (
                                        <Form.Item
                                            name="flowDocumentName"
                                            label={<span className="project-label">Flow Document Name</span>}
                                            rules={[{ required: true, message: 'Required' }]}
                                            style={{ marginBottom: 20 }}
                                        >
                                            <Select
                                                showSearch
                                                onSelect={() => document.activeElement.blur()}
                                                loading={docsLoading}
                                                placeholder="Select Flow Document"
                                                prefix={<FileTextOutlined className={getFieldValue('flowDocumentName') ? "project-select-icon-active" : "project-select-icon-default"} />}
                                                className="project-select project-select-full"
                                                classNames={{ popup: 'project-select-popup' }}
                                                filterOption={(input, option) => {
                                                    const search = turkishLower(input);
                                                    const label = turkishLower(option.label || '');
                                                    return label.includes(search);
                                                }}
                                            >
                                                {flowDocs.map(item => (
                                                    <Option key={item.value} value={item.value} label={`${item.name} ${item.text}`}>
                                                        <div className="project-option-container">
                                                            <span className="project-option-main">{item.name}</span>
                                                            <span className="project-option-sub">{item.text}</span>
                                                        </div>
                                                    </Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    )}
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    noStyle
                                    shouldUpdate={(prev, cur) => prev.startingEventCode !== cur.startingEventCode}
                                >
                                    {({ getFieldValue }) => (
                                        <Form.Item
                                            name="startingEventCode"
                                            label={
                                                <span className="project-label-with-icon">
                                                    Starting Event Code
                                                    <Tooltip title="The starting event code for the created flow. Default is 4.">
                                                        <InfoCircleOutlined className="project-select-secondary-icon" style={{ cursor: 'pointer' }} />
                                                    </Tooltip>
                                                </span>
                                            }
                                            rules={[{ required: true, message: 'Required' }]}
                                            style={{ marginBottom: 20 }}
                                        >
                                            <Select
                                                showSearch
                                                onSelect={() => document.activeElement.blur()}
                                                placeholder="Select starting event"
                                                prefix={<BuildOutlined className={getFieldValue('startingEventCode') ? "project-select-icon-active" : "project-select-icon-default"} />}
                                                className="project-select project-select-full"
                                                classNames={{ popup: 'project-select-popup' }}
                                                loading={docsLoading}
                                                filterOption={(input, option) => {
                                                    const search = turkishLower(input);
                                                    const label = turkishLower(option.label || '');
                                                    return label.includes(search);
                                                }}
                                            >
                                                {flowEvents.map(event => (
                                                    <Option key={event.value} value={event.value} label={event.label}>
                                                        <div className="project-option-container">
                                                            <span className="project-option-main">{event.value}</span>
                                                            <span className="project-option-sub">{event.text}</span>
                                                        </div>
                                                    </Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    )}
                                </Form.Item>
                            </Col>
                        </Row>
                    </div>
                )}

                {(transactionType === 'CreateForm' || transactionType === 'EditForm') && (
                    <div className="project-animated-section">
                        <Row gutter={[24, 20]} style={{ marginTop: 10, marginBottom: 10 }}>
                            <Col span={12}>
                                <Form.Item
                                    name="projectName"
                                    label={<span className="project-label">Project Name</span>}
                                    rules={[{ required: true, message: 'Required' }]}
                                    style={{ marginBottom: 20 }}
                                >
                                    <Select
                                        showSearch
                                        onSelect={() => document.activeElement.blur()}
                                        loading={projectsLoading}
                                        placeholder="Select project"
                                        prefix={<ProjectOutlined className="project-select-secondary-icon" />}
                                        className="project-select project-select-full"
                                        classNames={{ popup: 'project-select-popup' }}
                                        filterOption={(input, option) => {
                                            const search = turkishLower(input);
                                            const label = turkishLower(option.label || '');
                                            return label.includes(search);
                                        }}
                                        onChange={(val) => {
                                            const selectedProject = projects.find(p => p.name === val);
                                            setForms([]);
                                            form.setFieldsValue({ formName: undefined });
                                            if (selectedProject) {
                                                globalStore.set('projectSecretKey', selectedProject.secretKey);
                                                fetchProjectDetails(selectedProject.secretKey);
                                            }
                                        }}
                                    >
                                        {projects.map(project => (
                                            <Option key={project.id} value={project.name} label={`${project.name} ${getLocalizedCaption(project)}`}>
                                                <div className="project-option-container">
                                                    <span className="project-option-main">{project.name}</span>
                                                    <span className="project-option-sub">{getLocalizedCaption(project)}</span>
                                                </div>
                                            </Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    noStyle
                                    shouldUpdate={(prev, cur) => prev.formName !== cur.formName}
                                >
                                    {({ getFieldValue }) => (
                                        <Form.Item
                                            name="formName"
                                            label={<span className="project-label">Form Name</span>}
                                            rules={[{ required: true, message: 'Required' }]}
                                            style={{ marginBottom: 20 }}
                                        >
                                            <Select
                                                showSearch
                                                onSelect={() => document.activeElement.blur()}
                                                loading={detailsLoading}
                                                placeholder="Select Form"
                                                prefix={<PartitionOutlined className={getFieldValue('formName') ? "project-select-icon-active" : "project-select-icon-default"} />}
                                                className="project-select project-select-full"
                                                classNames={{ popup: 'project-select-popup' }}
                                                filterOption={(input, option) => {
                                                    const search = turkishLower(input);
                                                    const label = turkishLower(option.label || '');
                                                    return label.includes(search);
                                                }}
                                            >
                                                {forms.map(item => (
                                                    <Option key={item.value} value={item.value} label={`${item.name} ${item.text}`}>
                                                        <div className="project-option-container">
                                                            <span className="project-option-main">{item.name}</span>
                                                            <span className="project-option-sub">{item.text}</span>
                                                        </div>
                                                    </Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    )}
                                </Form.Item>
                            </Col>
                        </Row>
                    </div>
                )}

                <Form.Item
                    label={<span className="project-label">Data Source (Excel)</span>}
                    required
                    style={{ marginBottom: 20 }}
                >
                    <Dragger {...uploadProps} className="project-dragger">
                        <p className="ant-upload-drag-icon">
                            <FileExcelOutlined style={{ color: '#10b981', fontSize: 24 }} />
                        </p>
                        <p className="ant-upload-text project-dragger-text">
                            Click or drag file to this area
                        </p>
                    </Dragger>
                </Form.Item>

                <Form.Item style={{ marginTop: 10 }}>
                    <Button
                        type="primary"
                        htmlType="submit"
                        block
                        loading={loading}
                        className="project-submit-btn"
                    >
                        Create Environment
                    </Button>
                </Form.Item>
            </Form>
        </Card>
    );
};
