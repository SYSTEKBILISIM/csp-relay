import React from 'react';
import { Form, Select, Typography, Segmented, theme } from 'antd';
import {
    FileExcelOutlined,
    FileOutlined,
    FolderOpenOutlined,
    LinkOutlined,
    PaperClipOutlined,
    TableOutlined
} from '@ant-design/icons';

const { Text } = Typography;

const toColumnOptions = columns => (columns || [])
    .filter(column => column !== undefined && column !== null && column !== '')
    .map(column => ({ value: column, label: column }));

/**
 * Config UI for RelatedDocument objects.
 * A document can be read from the current main row, or multiple document rows can
 * be collected from another sheet by matching a main key to a parent/detail key.
 */
export const RelatedDocumentConfig = ({
    form,
    excelColumns = [],
    sheetColumns,
    mainSheet,
    mainIdColumn
}) => {
    const { token } = theme.useToken();
    const sourceMode = Form.useWatch('relatedDocumentSource', form) || 'MainSheet';
    const relatedSheet = Form.useWatch('relatedSheet', form);

    const mainColumnOptions = React.useMemo(() => toColumnOptions(excelColumns), [excelColumns]);
    const relatedColumnOptions = React.useMemo(
        () => toColumnOptions(relatedSheet ? sheetColumns?.[relatedSheet] : []),
        [relatedSheet, sheetColumns]
    );
    const sourceColumnOptions = sourceMode === 'RelatedSheet' ? relatedColumnOptions : mainColumnOptions;
    const relatedSheetOptions = React.useMemo(() => (
        Object.keys(sheetColumns || {})
            .filter(sheet => sheet !== mainSheet)
            .map(sheet => ({ value: sheet, label: sheet }))
    ), [sheetColumns, mainSheet]);
    const supportsRelatedSheet = relatedSheetOptions.length > 0;

    const handleSourceChange = nextMode => {
        form.setFieldsValue({
            relatedDocumentSource: nextMode,
            relatedSheet: undefined,
            detailKey: undefined,
            pathCol: undefined,
            savePathCol: undefined,
            masterKey: nextMode === 'RelatedSheet' ? (mainIdColumn || undefined) : undefined
        });
    };

    return (
        <div
            style={{
                animation: 'fadeIn 0.2s',
                padding: 20,
                borderRadius: token.borderRadiusLG + 4,
                background: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                        style={{
                            width: 36,
                            height: 36,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flex: '0 0 auto',
                            borderRadius: token.borderRadiusLG,
                            color: token.colorPrimary,
                            background: token.colorPrimaryBg
                        }}
                    >
                        <PaperClipOutlined style={{ fontSize: 17 }} />
                    </div>
                    <div>
                        <Text strong style={{ display: 'block', fontSize: 15 }}>Related Document</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {sourceMode === 'RelatedSheet' ? 'Multiple files from a related sheet' : 'File data from the main sheet'}
                        </Text>
                    </div>
                </div>

                {supportsRelatedSheet && (
                    <Form.Item name="relatedDocumentSource" style={{ width: 330, marginBottom: 0 }}>
                        <Segmented
                            block
                            options={[
                                { label: 'Main sheet', value: 'MainSheet', icon: <FileExcelOutlined /> },
                                { label: 'Related sheet', value: 'RelatedSheet', icon: <TableOutlined /> }
                            ]}
                            onChange={handleSourceChange}
                        />
                    </Form.Item>
                )}
            </div>

            {sourceMode === 'RelatedSheet' && supportsRelatedSheet && (
                <div
                    style={{
                        padding: 16,
                        marginBottom: 14,
                        borderRadius: token.borderRadiusLG,
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        boxShadow: token.boxShadowTertiary
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                        <LinkOutlined style={{ color: token.colorPrimary }} />
                        <Text strong>Sheet relation</Text>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 12 }}>
                        <Form.Item
                            name="relatedSheet"
                            label="Related sheet"
                            rules={[{ required: true, message: 'Please select the related document sheet' }]}
                            style={{ marginBottom: 0 }}
                        >
                            <Select
                                options={relatedSheetOptions}
                                placeholder="Select sheet"
                                showSearch
                                optionFilterProp="label"
                                variant="filled"
                                onChange={() => form.setFieldsValue({ detailKey: undefined, pathCol: undefined, savePathCol: undefined })}
                            />
                        </Form.Item>
                        <Form.Item
                            name="masterKey"
                            label="Main ID column"
                            rules={[{ required: true, message: 'Please select the main sheet ID column' }]}
                            style={{ marginBottom: 0 }}
                        >
                            <Select options={mainColumnOptions} placeholder="ID" showSearch optionFilterProp="label" variant="filled" />
                        </Form.Item>
                        <Form.Item
                            name="detailKey"
                            label="Parent ID column"
                            rules={[{ required: true, message: 'Please select the parent ID column' }]}
                            style={{ marginBottom: 0 }}
                        >
                            <Select
                                options={relatedColumnOptions}
                                placeholder="PARENTID"
                                showSearch
                                optionFilterProp="label"
                                variant="filled"
                                disabled={!relatedSheet}
                            />
                        </Form.Item>
                    </div>
                </div>
            )}

            <div
                style={{
                    padding: 16,
                    borderRadius: token.borderRadiusLG,
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    boxShadow: token.boxShadowTertiary
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <FileOutlined style={{ color: token.colorPrimary }} />
                    <Text strong>File columns</Text>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                    <Form.Item
                        name="pathCol"
                        label={<Text strong>Local file path</Text>}
                        rules={[{ required: true, message: 'Please select the file path column' }]}
                        style={{ marginBottom: 0 }}
                    >
                        <Select
                            options={sourceColumnOptions}
                            placeholder="Select path column"
                            showSearch
                            optionFilterProp="label"
                            variant="filled"
                            suffixIcon={<FileExcelOutlined style={{ color: token.colorTextQuaternary }} />}
                            disabled={sourceMode === 'RelatedSheet' && !relatedSheet}
                        />
                    </Form.Item>

                    <Form.Item
                        name="savePathCol"
                        label={<Text strong>CSP folder <Text type="secondary" style={{ fontWeight: 400 }}>(optional)</Text></Text>}
                        style={{ marginBottom: 0 }}
                    >
                        <Select
                            allowClear
                            options={sourceColumnOptions}
                            placeholder="Use default folder"
                            showSearch
                            optionFilterProp="label"
                            variant="filled"
                            suffixIcon={<FolderOpenOutlined style={{ color: token.colorTextQuaternary }} />}
                            disabled={sourceMode === 'RelatedSheet' && !relatedSheet}
                        />
                    </Form.Item>
                </div>
            </div>
        </div>
    );
};
