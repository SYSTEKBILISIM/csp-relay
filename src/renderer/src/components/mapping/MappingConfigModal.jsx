import React, { useEffect } from 'react';
import { Modal, Form, message } from 'antd';
import { MappingFields } from './MappingFields';
import { GridMappingConfig } from './GridMappingConfig';
import { RelatedDocumentConfig } from './RelatedDocumentConfig';

export const MappingConfigModal = ({ 
    visible, 
    onCancel, 
    onSave, 
    initialValues, 
    excelColumns, 
    constructInternalUrl, 
    type = 'Object', 
    sheetColumns, 
    currentColumns,
    mainFormFields = [],
    formScopes = [],
    currentFormName,
    title = "Configure Mapping",
    width = 950,
    zIndex = 1000
}) => {
    const [form] = Form.useForm();
    const [apiStep, setApiStep] = React.useState(0);
    const rootFormScopes = React.useMemo(() => ([{
        key: 'main',
        label: 'Main Form',
        path: [],
        fields: mainFormFields.filter(field => field?.name && field.type !== 'InlineGrid' && field.type !== 'RelatedGrid')
    }]), [mainFormFields]);
    const effectiveFormScopes = React.useMemo(() => (
        formScopes.length > 0 ? formScopes : rootFormScopes
    ), [formScopes, rootFormScopes]);

    useEffect(() => {
        if (visible) {
            form.resetFields();
            setApiStep(0); // Reset API steps
            // Check if initialValues has keys, otherwise use defaults
            if (initialValues && Object.keys(initialValues).length > 0 && initialValues.source) {
                form.setFieldsValue({
                    isArray: false,
                    gridWriteMode: 'Append',
                    ...initialValues
                });
            } else {
                // Default values if new or empty
                form.setFieldsValue({ 
                    source: 'Excel', 
                    dataType: 'String',
                    isArray: false,
                    apiMethod: 'POST', 
                    apiType: 'Internal', 
                    responsePath: 'result.result',
                    gridColumns: [],
                    gridWriteMode: 'Append',
                    ...initialValues 
                });
            }
        }
    }, [visible, initialValues]);

    const handleOk = () => {
        const formValues = form.getFieldsValue(true);
        
        // Final guardrail for API mode
        if (formValues.source === 'API') {
            const fieldCaptions = {
                apiType: 'Topology',
                apiMethod: 'Method',
                apiUrl: formValues.apiType === 'Internal' ? 'DataSource Name' : 'Endpoint URL',
                responsePath: 'Items Path',
                displayFormat: 'Match Property',
                searchKeyTemplate: 'Excel Search Key',
                valuePath: 'Value Path',
                textPath: 'Text Path'
            };

            const missing = Object.keys(fieldCaptions).filter(f => !formValues[f]);
            if (missing.length > 0) {
                const labels = missing.map(f => fieldCaptions[f]).join(', ');
                message.error(`Required configuration missing: ${labels}. Please complete all steps.`);
                return;
            }
        }

        form.validateFields().then(validatedValues => {
            // Use getFieldsValue(true) to ensure unmounted step data is preserved
            const allValues = form.getFieldsValue(true);
            const values = { ...allValues };
            Object.keys(validatedValues).forEach(key => {
                if (Array.isArray(validatedValues[key]) && Array.isArray(allValues[key])) {
                    values[key] = validatedValues[key].map((item, idx) => {
                        const originalItem = allValues[key][idx] || {};
                        return { ...originalItem, ...item };
                    });
                } else if (typeof validatedValues[key] === 'object' && validatedValues[key] !== null &&
                           typeof allValues[key] === 'object' && allValues[key] !== null) {
                    values[key] = { ...allValues[key], ...validatedValues[key] };
                } else {
                    values[key] = validatedValues[key];
                }
            });

            if (type === 'InlineGrid' || type === 'RelatedGrid') {
                values.duplicateCheckColumns = (values.gridColumns || [])
                    .filter(column => column?.name && (
                        column?.skipIfDuplicate === true || column?.mapping?.skipIfDuplicate === true
                    ))
                    .map(column => column.name);
                values.duplicateCaseSensitiveColumns = (values.gridColumns || [])
                    .filter(column => column?.name && (
                        column?.skipIfDuplicate === true || column?.mapping?.skipIfDuplicate === true
                    ) && (
                        column?.duplicateCaseSensitive === true || column?.mapping?.duplicateCaseSensitive === true
                    ))
                    .map(column => column.name);
            }
            onSave(values);
        }).catch(errorInfo => {
            if (errorInfo.errorFields && errorInfo.errorFields.length > 0) {
                form.scrollToField(errorInfo.errorFields[0].name, { behavior: 'smooth', block: 'center' });
            }
        });
    };

    return (
        <Modal
            title={title}
            open={visible}
            onCancel={onCancel}
            onOk={handleOk}
            width={width}
            zIndex={zIndex}
            destroyOnHidden
            style={{ top: 50 }}
            styles={{ 
                header: { borderBottom: '1px solid #f1f5f9', padding: '12px 24px' },
                body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', padding: '12px 24px 24px 24px' } 
            }}
        >
            <Form form={form} layout="vertical" preserve={true}>
                {type === 'InlineGrid' || type === 'RelatedGrid' ? (
                    <GridMappingConfig
                        form={form}
                        type={type}
                        currentColumns={currentColumns || excelColumns}
                        sheetColumns={sheetColumns}
                        excelColumns={excelColumns}
                        constructInternalUrl={constructInternalUrl}
                        ancestorScopes={effectiveFormScopes}
                        formName={currentFormName}
                    />
                ) : type === 'RelatedDocument' ? (
                    <RelatedDocumentConfig
                        form={form}
                        excelColumns={excelColumns}
                    />
                ) : (
                    <div className="fade-in-anim">
                        <MappingFields
                            formInstance={form}
                            scopeColumns={excelColumns}
                            constructInternalUrl={constructInternalUrl}
                            formScopes={effectiveFormScopes}
                            apiStep={apiStep}
                            setApiStep={setApiStep}
                        />
                    </div>
                )}
            </Form>
        </Modal>
    );
};
