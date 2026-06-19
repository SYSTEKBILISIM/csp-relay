/**
 * Constructs the payload for the transfer API based on Transaction Type.
 * @param {string} transactionType - CreateFlow, CreateForm, EditForm
 * @param {object} config - { projectName, flowName, flowDocName, formName }
 * @param {Array} mappedObjects - Array of resolved objects { FieldName, Value, Text, Type, Rows? }
 * @param {Array} objectDefinitions - Original definition (unused now as Type is in mappedObjects)
 * @returns {object} Payload
 */
export const constructPayload = (transactionType, config, mappedObjects, objectDefinitions) => {
    const { projectName, flowName, flowDocName, formName, flowParams, formParams: configFormParams, loginAs } = config;

    // Helper to organize objects into types
    const formObjects = [];
    const inlineGridsArray = [];
    const relatedGridsArray = [];
    const relatedDocs = [];

    mappedObjects.forEach(obj => {
        if (obj.Type === 'InlineGrid') {
            inlineGridsArray.push({
                FieldName: obj.FieldName,
                Rows: obj.Rows || []
            });
        } else if (obj.Type === 'RelatedGrid') {
            relatedGridsArray.push({
                FieldName: obj.FieldName,
                ProjectName: obj.ProjectName,
                FormName: obj.FormName,
                DocumentIdColumnName: obj.DocumentIdColumnName,
                Rows: obj.Rows || []
            });
        } else if (obj.Type === 'RelatedDocument') {
            const items = [];
            if (Array.isArray(obj.Items)) {
                items.push(...obj.Items);
            } else {
                items.push({
                    Name: obj.Name,
                    ContentType: obj.ContentType,
                    Extension: obj.Extension,
                    Data: obj.Data
                });
            }
            relatedDocs.push({
                FieldName: obj.FieldName,
                Items: items
            });
        } else {
            formObjects.push({
                FieldName: obj.FieldName,
                Value: obj.Value,
                Text: obj.Text
            });
        }
    });

    const formFields = {
        Objects: formObjects,
        InlineGrids: inlineGridsArray,
        RelatedGrids: relatedGridsArray,
        RelatedDocuments: relatedDocs
    };

    if (transactionType === 'CreateForm' || transactionType === 'EditForm') {
        const result = {
            ProjectName: projectName,
            FormName: formName,
            FormParameters: configFormParams || {}, // Added FormParameters
            FormFields: formFields
        };
        if (loginAs) result.LoginAs = String(loginAs);
        return result;

    } else {
        // --- FLOW PAYLOAD ---
        const result = {
            ProjectName: projectName,
            FlowName: flowName,
            FlowParameters: flowParams || {}, // Added FlowParameters
            StartingEvent: config.startingEventCode !== undefined && config.startingEventCode !== null ? Number(config.startingEventCode) : 4,
            FlowDocuments: [
                {
                    "DocumentName": flowDocName,
                    "FormParameters": configFormParams || {}, // Added FormParameters inside Document
                    "FormFields": formFields // Enhanced to include Grids
                }
            ]
        };
        if (loginAs) result.LoginAs = String(loginAs);
        return result;
    }
};
