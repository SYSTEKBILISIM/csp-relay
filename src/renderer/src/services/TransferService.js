import _ from 'lodash';
import { resolveTokens, normalizeString, resolvePrimitiveValue, calculateSimilarity } from '../utils/transferUtils';
import { constructPayload } from './PayloadFactory';

const RELAY_CSP_APP_NAME = 'Systek_SynergyCSPRelay';

async function submitRelatedGridRow(projectName, formName, formFields, globalStore, executionLog = [], loginAs = null) {
    const logEntry = { key: `rg_${Date.now()}_${Math.random()}`, step: 'RelatedGrid Submit', details: `Form: ${formName}`, status: 'Pending' };
    executionLog.push(logEntry);

    const deployUrl = globalStore.get('deployUrl');
    if (!deployUrl) throw new Error('Deploy URL not found for RelatedGrid row submission');

    const baseUrl = `${deployUrl.replace(/\/$/, '')}/apps/${RELAY_CSP_APP_NAME}/latest/api/Transfer`;

    const payload = {
        ProjectName: projectName,
        FormName: formName,
        FormParameters: {},
        FormFields: formFields
    };

    if (loginAs) payload.LoginAs = loginAs;

    const headers = { 'Content-Type': 'application/json' };
    const token = globalStore.get('token');
    const encryptedData = globalStore.get('encryptedData');
    const userLang = globalStore.get('language') || 'tr-TR';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (encryptedData) headers['bimser-encrypted-data'] = encryptedData;
    headers['bimser-language'] = userLang;

    const response = await fetch(`${baseUrl}/CreateForm`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        logEntry.status = 'Error';
        let errorText = await response.text();
        const err = new Error(`HTTP ${response.status} ${response.statusText}`);
        err.rawResponse = errorText;
        throw err;
    }

    const json = await response.json();
    
    // Capture raw diagnostics for Step Inspector
    logEntry.raw = {
        request: {
            url: `${baseUrl}/CreateForm`,
            method: 'POST',
            headers,
            body: payload
        },
        response: json
    };

    // Check validation errors first
    const saveResp = json.saveResponse || json;
    let hasValidationErrors = false;
    let errorMsgs = [];

    if (saveResp?.actionResult === false) {
        hasValidationErrors = true;
    }

    // Check direct validationErrors (common for CreateForm)
    if (Array.isArray(saveResp?.validationErrors) && saveResp.validationErrors.length > 0) {
        hasValidationErrors = true;
        saveResp.validationErrors.forEach(e => { if (e.message) errorMsgs.push(e.message) });
    }

    // Check nested result.validationErrors
    if (saveResp?.result && Array.isArray(saveResp.result.validationErrors) && saveResp.result.validationErrors.length > 0) {
        hasValidationErrors = true;
        saveResp.result.validationErrors.forEach(e => { if (e.message) errorMsgs.push(e.message) });
    }

    // Check nested forms validationErrors (common for CreateFlow)
    if (Array.isArray(saveResp?.forms)) {
        saveResp.forms.forEach(f => {
            const errs = f.formSaveResponse?.result?.validationErrors;
            if (errs) errs.forEach(e => { if (e.message) errorMsgs.push(e.message) });
        });
    }

    if (hasValidationErrors) {
        logEntry.status = 'Error';
        const uniqueMsgs = [...new Set(errorMsgs)];
        const errMessage = uniqueMsgs.length > 0
            ? `• ${uniqueMsgs.join('\n• ')}`
            : 'Server rejected creation due to validation errors';
        const err = new Error(errMessage);
        err.isValidationError = true;
        err.rawResponse = JSON.stringify(json);
        throw err;
    }

    // Attempt multiple paths to extract documentId
    let docId = json?.saveResponse?.forms?.[0]?.formSaveResponse?.result?.documentId
        || json?.saveResponse?.documentId
        || json?.documentId;

    if (!docId) {
        logEntry.status = 'Error';
        throw new Error('Failed to retrieve DocumentId from response');
    }

    logEntry.status = 'Success';
    logEntry.details += ` (DocumentId: ${docId})`;
    return docId;
}

/**
 * Helper: Resolve a single value mapping (Excel or API)
 */
async function resolveMappedValue(mapping, rowData, globalStore, apiCache, objectContext, executionLog = [], warnings = [], fieldName = '') {
    let finalValue = null;
    let finalText = '';

    if (!mapping) return { Value: null, Text: '' };

    if (mapping.source === 'Excel') {
        const col = mapping.valueCol;
        if (col) {
            const rawVal = rowData[col];
            finalValue = resolvePrimitiveValue(rawVal, mapping.dataType);
            finalText = String(finalValue !== null ? finalValue : '');
        }
    } else if (mapping.source === 'API') {
        let searchKey = '';
        if (mapping.searchKeyTemplate) {
            searchKey = String(resolveTokens(mapping.searchKeyTemplate, rowData, objectContext));
        } else if (mapping.textCol) {
            searchKey = String(rowData[mapping.textCol] || '');
        }

        const trimmedKey = searchKey.trim();
        if (!trimmedKey || trimmedKey === 'null' || trimmedKey === 'undefined') {
            const apiLog = {
                key: `api_skip_${Date.now()}_${Math.random()}`,
                step: 'API Lookup',
                details: `Field: ${fieldName} -> Skipped (Excel search key ${mapping.searchKeyTemplate || ''} is empty)`,
                status: 'Success'
            };
            executionLog.push(apiLog);
            return { Value: null, Text: '' };
        }

        const apiLog = { key: `api_${Date.now()}_${Math.random()}`, step: 'API Lookup', details: `Field: ${fieldName}, Query: "${trimmedKey}"`, status: 'Pending' };
        executionLog.push(apiLog);

        // Resolve URL/Body
        let resolvedUrl = '';
        if (mapping.apiType === 'Internal') {
            const deployUrl = globalStore.get('deployUrl') || '';
            const projectName = globalStore.get('projectName') || '';
            const cleanUrl = deployUrl.replace(/\/$/, "");
            const queryName = resolveTokens(mapping.apiUrl, rowData, objectContext);
            resolvedUrl = `${cleanUrl}/apps/${projectName}/latest/api/DataSource/${queryName}`;
        } else {
            resolvedUrl = resolveTokens(mapping.apiUrl, rowData, objectContext);
        }
        let resolvedBody = resolveTokens(mapping.apiBody, rowData, objectContext);
        const resolvedHeaders = resolveTokens(mapping.apiHeaders || '{}', rowData, objectContext);

        if (mapping.apiType === 'Internal') {
            try {
                const parsedBody = JSON.parse(resolvedBody || '{}');

                // 1. Ensure standard structure (loadOptions)
                if (!parsedBody.loadOptions) parsedBody.loadOptions = {};
                parsedBody.loadOptions.distinct = true;
                parsedBody.loadOptions.filterNulls = true;
                parsedBody.loadOptions.filters = parsedBody.loadOptions.filters || [];
                parsedBody.loadOptions.sorts = parsedBody.loadOptions.sorts || null;
                
                // 2. Map valueExpr from the "Value Field" defined in the UI
                if (mapping.valuePath) {
                    const valueFieldMatch = mapping.valuePath.match(/{{\s*([^{}]+?)\s*}}/);
                    if (valueFieldMatch) {
                        parsedBody.loadOptions.valueExpr = valueFieldMatch[1].trim();
                    }
                }

                // 3. REMOVE pagination as requested by USER
                delete parsedBody.loadOptions.pagination;
                
                // 4. Ensure forceRefresh
                if (parsedBody.forceRefresh === undefined) {
                    parsedBody.forceRefresh = false;
                }

                // 5. Handle Parameters in Synergy-Standard Array Format [{key, value}]
                if (mapping.parameters && Array.isArray(mapping.parameters)) {
                    if (!Array.isArray(parsedBody.parameters)) {
                        parsedBody.parameters = [];
                    }

                    mapping.parameters.forEach(p => {
                        if (p.key) {
                            const rawVal = resolveTokens(p.value, rowData, objectContext);
                            let finalVal = rawVal;

                            // Cast to number or boolean for correct API processing
                            if (typeof rawVal === 'string') {
                                if (rawVal !== '' && !isNaN(rawVal)) {
                                    finalVal = Number(rawVal);
                                } else if (rawVal.toLowerCase() === 'true') {
                                    finalVal = true;
                                } else if (rawVal.toLowerCase() === 'false') {
                                    finalVal = false;
                                }
                            }

                            // Check if parameter already exists in template, update or push
                            const existingIdx = parsedBody.parameters.findIndex(item => item.key === p.key);
                            if (existingIdx !== -1) {
                                parsedBody.parameters[existingIdx].value = finalVal;
                            } else {
                                parsedBody.parameters.push({ key: p.key, value: finalVal });
                            }
                        }
                    });

                    // Log structure is now visible via the Step Detail icon (raw property),
                    // so we keep the summary clean as requested.
                }

                resolvedBody = JSON.stringify(parsedBody);
            } catch (e) {
                console.warn('Failed to inject parameters into Internal API body', e);
            }
        } else if (mapping.apiType === 'External' && mapping.parameters && Array.isArray(mapping.parameters)) {
            try {
                // Parse existing URL to handle existing query params
                const urlObj = new URL(resolvedUrl);
                mapping.parameters.forEach(p => {
                    const key = p.key;
                    const val = resolveTokens(p.value, rowData, objectContext); // Resolve {{tokens}}
                    if (key) urlObj.searchParams.append(key, val);
                });
                resolvedUrl = urlObj.toString();
            } catch (e) {
                console.warn('Invalid URL for adding params', resolvedUrl);
            }
        }

        const cacheKey = `${resolvedUrl}|${resolvedBody}`;
        let apiResultList = [];

        if (apiCache.has(cacheKey)) {
            apiResultList = apiCache.get(cacheKey);
            // Update LRU by re-inserting
            apiCache.delete(cacheKey);
            apiCache.set(cacheKey, apiResultList);
        } else {
            try {
                const fetchOptions = {
                    method: mapping.apiType === 'Internal' ? 'POST' : (mapping.apiMethod || 'GET'),
                    headers: { 'Content-Type': 'application/json' }
                };

                if (mapping.apiType === 'Internal') {
                    const token = globalStore.get('token');
                    const encryptedData = globalStore.get('encryptedData');
                    const userLang = globalStore.get('language') || 'tr-TR';
                    if (token) fetchOptions.headers['Authorization'] = `Bearer ${token}`;
                    if (encryptedData) fetchOptions.headers['bimser-encrypted-data'] = encryptedData;
                    fetchOptions.headers['bimser-language'] = userLang;
                }

                if (mapping.apiHeaders) {
                    try {
                        const h = JSON.parse(resolvedHeaders);
                        fetchOptions.headers = { ...fetchOptions.headers, ...h };
                    } catch (e) {
                        // console.warn('Header parse error', e);
                    }
                }

                if (fetchOptions.method !== 'GET' && fetchOptions.method !== 'HEAD') {
                    fetchOptions.body = resolvedBody;
                }

                const res = await fetch(resolvedUrl, fetchOptions);
                if (res.ok) {
                    const json = await res.json();
                    apiResultList = _.get(json, mapping.responsePath || 'result.result') || [];
                    apiCache.set(cacheKey, apiResultList);

                    // Capture detailed info for diagnostics
                    apiLog.raw = {
                        request: {
                            url: resolvedUrl,
                            method: fetchOptions.method,
                            headers: fetchOptions.headers,
                            body: resolvedBody ? (function() { try { return JSON.parse(resolvedBody); } catch(e) { return resolvedBody; } })() : null
                        },
                        response: json
                    };

                    // PREVENT MEMORY LEAK: Limit apiCache size with Map
                    if (apiCache.size > 50) {
                        const keysIter = apiCache.keys();
                        for (let i = 0; i < 10; i++) {
                            apiCache.delete(keysIter.next().value);
                        }
                    }
                }
            } catch (err) {
                console.error('Lookup API Error', err);
            }
        }

        // Client-side Filtering/Matching with Similarity Scoring
        let bestMatch = null;
        let maxSimilarity = 0;
        let bestMatchText = "";

        if (Array.isArray(apiResultList)) {
            for (const item of apiResultList) {
                // Resolve Display Format for comparison
                const itemText = (mapping.displayFormat || '').replace(/{{\s*([^{}]+?)\s*}}/g, (m, rawK) => {
                    const k = rawK.trim();
                    return item[k] !== undefined ? item[k] : '';
                });

                const similarity = calculateSimilarity(searchKey, itemText);
                if (similarity > maxSimilarity) {
                    maxSimilarity = similarity;
                    bestMatch = item;
                    bestMatchText = itemText;
                }
                if (maxSimilarity === 1) break; // Optimization: exact match found
            }
        }

        // Apply Threshold: 90% similarity required to consider it a match
        if (bestMatch && maxSimilarity >= 0.9) {
            // 1. Resolve Value Field (Supports Template or Path for backward compatibility)
            const valTemplate = mapping.valuePath || '{{id}}';
            let rawValue = '';
            if (valTemplate.includes('{{')) {
                rawValue = valTemplate.replace(/{{\s*([^{}]+?)\s*}}/g, (m, rawK) => {
                    const k = rawK.trim();
                    return bestMatch[k] !== undefined ? bestMatch[k] : '';
                });
            } else {
                rawValue = _.get(bestMatch, valTemplate);
            }
            finalValue = resolvePrimitiveValue(rawValue, mapping.dataType);

            // 2. Resolve Text Field (Templates) - Fallback to displayFormat (Match Pattern)
            const txtTemplate = mapping.textPath || mapping.displayFormat;
            if (txtTemplate) {
                finalText = txtTemplate.replace(/{{\s*([^{}]+?)\s*}}/g, (m, rawK) => {
                    const k = rawK.trim();
                    return bestMatch[k] !== undefined ? bestMatch[k] : '';
                });
            } else {
                finalText = searchKey;
            }

            apiLog.status = 'Success';
            apiLog.details += ` -> Match Found${maxSimilarity < 1 ? ` (${(maxSimilarity * 100).toFixed(0)}%)` : ''}`;
        } else {
            finalValue = "";
            finalText = "";
            apiLog.status = 'Warning';
            // Only show best candidate if it's somewhat relevant (> 0.15)
            const showBest = bestMatchText && maxSimilarity > 0.15;
            apiLog.details += ` -> No Match Found${showBest ? ` (Best: "${bestMatchText}" - ${(maxSimilarity * 100).toFixed(0)}%)` : ''}`;
            warnings.push(`Field '${fieldName}': Could not match API value for '${searchKey}'${showBest ? `. (Closest attempt: "${bestMatchText}" with ${(maxSimilarity * 100).toFixed(0)}% match)` : ''}`);
        }
    }

    // Fixed Value (New Step handling)
    else if (mapping.source === 'Fixed') {
        const val = mapping.fixedValue;
        // Check if value is numeric or primitive and resolve it
        finalValue = resolvePrimitiveValue(val, mapping.dataType);
        finalText = mapping.fixedText !== undefined && mapping.fixedText !== ''
            ? String(mapping.fixedText)
            : String(finalValue !== null ? finalValue : '');
    }

    return { Value: finalValue, Text: finalText };
}

/**
 * Process a single row: Resolve Mappings (Values/API) -> Construct Payload -> Execute Transfer
 */
export const processRowAndExecute = async (rowData, definitionData, globalStore, apiCache, allSheetsData) => {
    const executionLog = [];
    const warnings = [];
    let payload = null;
    let loginAsValue = null;

    try {
        executionLog.push({ key: `init_${Date.now()}_${Math.random()}`, step: 'Initialize', details: 'Row parsing started', status: 'Success' });

        // 1. Resolve Mapped Objects
        const mappedObjects = [];
        const objectContext = {}; // for dependencies

        // Extract LoginAs if enabled
        if (definitionData.loginAsEnabled && definitionData.loginAsColumn) {
            const rawVal = rowData[definitionData.loginAsColumn];
            if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
                loginAsValue = String(rawVal).trim();
            }
        }

        // --- Recursive Helper to resolve grid rows ---
        const resolveGridRows = async (gridType, mapping, masterValue) => {
            const gridSheetName = mapping.gridSheet;
            const detailCol = mapping.detailKey;
            const gridColumns = mapping.gridColumns || [];

            if (!gridSheetName || !detailCol || !allSheetsData || masterValue == null || masterValue === '') {
                return [];
            }

            const gridRows = (allSheetsData[gridSheetName] || []).filter(r => {
                const detailVal = r[detailCol];
                return detailVal != null && detailVal !== '' && String(detailVal).trim() === String(masterValue).trim();
            });

            return await Promise.all(gridRows.map(async gridRow => {
                const rowContext = { ...objectContext }; // inherit parent context
                const rowObjects = [];

                for (const colDef of gridColumns) {
                    const colType = colDef.type || 'Value';

                    if (colType === 'InlineGrid' || colType === 'RelatedGrid') {
                        // Recursive call for nested grids inside a grid column
                        const nestedRows = await resolveGridRows(colType, colDef.mapping, gridRow[colDef.mapping?.masterKey]);

                        if (colType === 'RelatedGrid') {
                            const submittedRowRefs = [];
                            const chunkSize = 5;
                            for (let i = 0; i < nestedRows.length; i += chunkSize) {
                                const chunk = nestedRows.slice(i, i + chunkSize);
                                const results = await Promise.all(chunk.map(async (nestedRow) => {
                                    try {
                                        const relationDocId = await submitRelatedGridRow(
                                            colDef.mapping?.relatedProjectName,
                                            colDef.mapping?.relatedFormName,
                                            nestedRow.FormFields,
                                            globalStore,
                                            executionLog,
                                            loginAsValue
                                        );
                                        return { RelationDocumentId: relationDocId };
                                    } catch (err) {
                                        console.error('Failed to submit nested RelatedGrid row:', err);
                                        const customErr = new Error(`Grid mapping '${colDef.name}' row failed: ${err.message}`);
                                        customErr.isValidationError = err.isValidationError;
                                        customErr.failedPayload = nestedRow.FormFields;
                                        customErr.rawResponse = err.rawResponse;
                                        throw customErr;
                                    }
                                }));
                                submittedRowRefs.push(...results);
                            }

                            rowObjects.push({
                                FieldName: colDef.name,
                                Type: 'RelatedGrid',
                                ProjectName: colDef.mapping?.relatedProjectName,
                                FormName: colDef.mapping?.relatedFormName,
                                DocumentIdColumnName: colDef.mapping?.relatedDocIdCol,
                                Rows: submittedRowRefs
                            });
                            continue;
                        } else {
                            rowObjects.push({
                                FieldName: colDef.name,
                                Type: 'InlineGrid',
                                Rows: nestedRows
                            });
                            continue;
                        }
                    }

                    if (colType === 'RelatedDocument') {
                        const pathCol = colDef.mapping?.pathCol;
                        if (pathCol) {
                            const filePath = String(gridRow[pathCol] || '').trim();
                            if (filePath && window.api?.readFileAsBase64) {
                                const fileResult = await window.api.readFileAsBase64(filePath);
                                if (fileResult.success) {
                                    rowObjects.push({
                                        FieldName: colDef.name,
                                        Type: 'RelatedDocument',
                                        Name: fileResult.name,
                                        ContentType: fileResult.contentType,
                                        Extension: fileResult.extension,
                                        Data: fileResult.data
                                    });
                                }
                            }
                        }
                        continue; // Ignore if failed or empty, move to next
                    }

                    // Standard value resolution
                    const result = await resolveMappedValue(colDef.mapping, gridRow, globalStore, apiCache, rowContext, executionLog, warnings, colDef.name);

                    // Add to rowContext so subsequent columns in the grid row can use it
                    rowContext[colDef.name] = result;

                    rowObjects.push({
                        FieldName: colDef.name,
                        Value: result.Value,
                        Text: result.Text,
                        Type: 'Object'
                    });
                }

                // Filter out any null objects (e.g., failed RelatedDocuments)
                const validRowObjects = rowObjects.filter(Boolean);

                const objects = [];
                const inlineGrids = [];
                const relatedGrids = [];
                const relatedDocs = [];

                const relatedDocsMap = {};

                validRowObjects.forEach(obj => {
                    if (obj.Type === 'InlineGrid') {
                        inlineGrids.push({ FieldName: obj.FieldName, Rows: obj.Rows || [] });
                    } else if (obj.Type === 'RelatedGrid') {
                        relatedGrids.push({
                            FieldName: obj.FieldName,
                            ProjectName: obj.ProjectName,
                            FormName: obj.FormName,
                            DocumentIdColumnName: obj.DocumentIdColumnName,
                            Rows: obj.Rows || []
                        });
                    } else if (obj.Type === 'RelatedDocument') {
                        if (!relatedDocsMap[obj.FieldName]) {
                            relatedDocsMap[obj.FieldName] = {
                                FieldName: obj.FieldName,
                                Items: []
                            };
                            relatedDocs.push(relatedDocsMap[obj.FieldName]);
                        }
                        relatedDocsMap[obj.FieldName].Items.push({
                            Name: obj.Name || 'Document.pdf',    // Default fallback to prevent crash
                            ContentType: obj.ContentType || 'application/octet-stream',
                            Extension: obj.Extension || '.pdf',
                            Data: obj.Data
                        });
                    } else {
                        objects.push({
                            FieldName: obj.FieldName,
                            Value: obj.Value,
                            Text: obj.Text
                        });
                    }
                });

                if (gridType === 'RelatedGrid') {
                    return {
                        FormFields: {
                            Objects: objects,
                            InlineGrids: inlineGrids,
                            RelatedGrids: relatedGrids,
                            RelatedDocuments: relatedDocs
                        }
                    };
                } else {
                    return {
                        Objects: objects,
                        InlineGrids: inlineGrids,
                        RelatedGrids: relatedGrids,
                        RelatedDocuments: relatedDocs
                    };
                }
            }));
        };

        // --- Helper to resolve a list of parameters ---
        const resolveParameters = async (paramsDef) => {
            if (!paramsDef || !Array.isArray(paramsDef)) return {};
            const resolved = {};
            for (const p of paramsDef) {
                if (p.key) {
                    const type = p.type || 'Value';
                    const mapping = p.mapping || {};

                    if (type === 'InlineGrid' || type === 'RelatedGrid') {
                        const masterCol = mapping.masterKey;
                        if (masterCol) {
                            const masterValue = rowData[masterCol];
                            const resolvedRows = await resolveGridRows(type, mapping, masterValue);
                            resolved[p.key] = resolvedRows;
                        } else {
                            resolved[p.key] = [];
                        }
                    } else {
                        const res = await resolveMappedValue(mapping, rowData, globalStore, apiCache, objectContext, executionLog, warnings, p.key);
                        resolved[p.key] = res.Value !== null ? res.Value : res.Text;
                    }
                }
            }
            return resolved;
        };

        // --- Dependency Graph based Concurrent Object Resolution ---
        const getDependencies = (def) => {
            const deps = new Set();
            const mappingStr = JSON.stringify(def.mapping || {});
            const regex = /{{\s*([^{}]+?)\s*}}/g;
            let match;
            while ((match = regex.exec(mappingStr)) !== null) {
                const token = match[1].trim();
                const baseKey = token.split('.')[0];
                // Check if the token baseKey matches any other object's name
                if (definitionData.objects && definitionData.objects.some(o => o.name === baseKey && o.name !== def.name)) {
                    deps.add(baseKey);
                }
            }
            return Array.from(deps);
        };

        const objectPromises = {};

        const resolveObjectTask = async (def) => {
            if (objectPromises[def.name]) {
                return objectPromises[def.name];
            }

            const task = async () => {
                const deps = getDependencies(def);
                // Wait for dependencies to finish first
                await Promise.all(deps.map(depName => {
                    const depDef = definitionData.objects.find(o => o.name === depName);
                    return depDef ? resolveObjectTask(depDef) : Promise.resolve();
                }));

                const mapping = def.mapping || {};
                const type = def.type || 'Object';
                let rowObj = null;

                if (type === 'InlineGrid') {
                    const masterCol = mapping.masterKey;
                    if (masterCol) {
                        const masterValue = rowData[masterCol];
                        const resolvedRows = await resolveGridRows(type, mapping, masterValue);
                        rowObj = { FieldName: def.name, Type: 'InlineGrid', Rows: resolvedRows };
                    }
                } else if (type === 'RelatedGrid') {
                    const masterCol = mapping.masterKey;
                    if (masterCol) {
                        const masterValue = rowData[masterCol];
                        const resolvedRows = await resolveGridRows(type, mapping, masterValue);
                        const submittedRowRefs = [];
                        const chunkSize = 5;
                        for (let i = 0; i < resolvedRows.length; i += chunkSize) {
                            const chunk = resolvedRows.slice(i, i + chunkSize);
                            const results = await Promise.all(chunk.map(async (rRow) => {
                                try {
                                    const relationDocId = await submitRelatedGridRow(
                                        mapping.relatedProjectName,
                                        mapping.relatedFormName,
                                        rRow.FormFields,
                                        globalStore,
                                        executionLog,
                                        loginAsValue
                                    );
                                    return { RelationDocumentId: relationDocId };
                                } catch (err) {
                                    console.error('Failed to submit top-level RelatedGrid row:', err);
                                    const customErr = new Error(`Grid mapping '${def.name}' row failed: ${err.message}`);
                                    customErr.isValidationError = err.isValidationError;
                                    customErr.failedPayload = rRow.FormFields;
                                    customErr.rawResponse = err.rawResponse;
                                    throw customErr;
                                }
                            }));
                            submittedRowRefs.push(...results);
                        }
                        rowObj = {
                            FieldName: def.name,
                            Type: 'RelatedGrid',
                            ProjectName: mapping.relatedProjectName,
                            FormName: mapping.relatedFormName,
                            DocumentIdColumnName: mapping.relatedDocIdCol,
                            Rows: submittedRowRefs
                        };
                    }
                } else if (type === 'RelatedDocument') {
                    const pathCol = mapping.pathCol;
                    if (pathCol) {
                        const filePath = String(rowData[pathCol] || '').trim();
                        if (filePath && window.api?.readFileAsBase64) {
                            const fileResult = await window.api.readFileAsBase64(filePath);
                            if (fileResult.success) {
                                rowObj = {
                                    FieldName: def.name,
                                    Type: 'RelatedDocument',
                                    Name: fileResult.name,
                                    ContentType: fileResult.contentType,
                                    Extension: fileResult.extension,
                                    Data: fileResult.data
                                };
                            } else {
                                console.warn(`[RelatedDocument] Failed to read file "${filePath}": ${fileResult.error}`);
                            }
                        } else {
                            console.warn(`[RelatedDocument] No file path in column "${pathCol}" for this row.`);
                        }
                    }
                } else {
                    const result = await resolveMappedValue(mapping, rowData, globalStore, apiCache, objectContext, executionLog, warnings, def.name);
                    objectContext[def.name] = result;
                    rowObj = { FieldName: def.name, Value: result.Value, Text: result.Text, Type: 'Object' };
                }

                return rowObj;
            };

            objectPromises[def.name] = task();
            return objectPromises[def.name];
        };

        // Execute all objects concurrently (dependency graph determines the real execution order)
        const allMappedObjects = await Promise.all((definitionData.objects || []).map(def => resolveObjectTask(def)));
        mappedObjects.push(...allMappedObjects.filter(Boolean));

        // Resolve Flow & Form Parameters AFTER objects are resolved (so they can access objectContext)
        const resolvedFlowParams = await resolveParameters(definitionData.flowParams);
        const resolvedFormParams = await resolveParameters(definitionData.formParams);

        // 2. Construct Payload
        const transactionType = globalStore.get('transactionType') || 'CreateFlow';
        const config = {
            projectName: globalStore.get('projectName'),
            formName: globalStore.get('formName'),
            flowName: globalStore.get('flowName'),
            flowDocName: globalStore.get('flowDocumentName'),
            startingEventCode: globalStore.get('startingEventCode'),
            flowParams: resolvedFlowParams,
            formParams: resolvedFormParams,
            loginAs: loginAsValue
        };

        payload = constructPayload(transactionType, config, mappedObjects, definitionData.objects || []);

        // 3. Execute Final Transfer
        const deployUrl = globalStore.get('deployUrl');
        if (!deployUrl) return { status: 'Error', message: 'Deploy URL not found', payload, executionLog, warnings };

        const baseUrl = `${deployUrl.replace(/\/$/, '')}/apps/${RELAY_CSP_APP_NAME}/latest/api/Transfer`;

        // Determine Endpoint
        let endpointStr = 'CreateFlow';
        if (transactionType === 'CreateForm' || transactionType === 'EditForm') endpointStr = transactionType;

        const execLog = { key: `trans_${Date.now()}_${Math.random()}`, step: 'Execute Transfer', details: `Endpoint: ${endpointStr}`, status: 'Pending' };
        executionLog.push(execLog);

        const headers = { 'Content-Type': 'application/json' };
        const token = globalStore.get('token');
        const encryptedData = globalStore.get('encryptedData');
        const userLang = globalStore.get('language') || 'tr-TR';
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (encryptedData) headers['bimser-encrypted-data'] = encryptedData;
        headers['bimser-language'] = userLang;

        const response = await fetch(`${baseUrl}/${endpointStr}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        let status = 'Error';
        let msg = `HTTP ${response.status} ${response.statusText}`;
        let fullApiResponse = null;

        if (response.ok) {
            fullApiResponse = await response.json();

            // Check for CSP Validation Errors (Even if HTTP 200)
            let hasValidationErrors = false;
            let validationMessages = [];

            const saveResp = fullApiResponse.saveResponse || fullApiResponse;
            if (saveResp) {
                if (saveResp.actionResult === false) hasValidationErrors = true;

                if (Array.isArray(saveResp.validationErrors) && saveResp.validationErrors.length > 0) {
                    hasValidationErrors = true;
                    saveResp.validationErrors.forEach(err => { if (err.message) validationMessages.push(err.message); });
                }

                if (saveResp.result && Array.isArray(saveResp.result.validationErrors) && saveResp.result.validationErrors.length > 0) {
                    hasValidationErrors = true;
                    saveResp.result.validationErrors.forEach(err => { if (err.message) validationMessages.push(err.message); });
                }

                if (Array.isArray(saveResp.forms)) {
                    saveResp.forms.forEach(f => {
                        const vErrors = f.formSaveResponse?.result?.validationErrors;
                        if (Array.isArray(vErrors) && vErrors.length > 0) {
                            hasValidationErrors = true;
                            vErrors.forEach(err => { if (err.message) validationMessages.push(err.message); });
                        }
                    });
                }
            }

            if (hasValidationErrors) {
                status = 'ValidationError';
                const uniqueMsgs = [...new Set(validationMessages)];
                msg = uniqueMsgs.length > 0 ? `• ${uniqueMsgs.join('\n• ')}` : 'Validation Failed';
                execLog.status = 'Error';
                execLog.details += ' - Validation Failed';
            } else {
                status = 'Success';
                execLog.status = 'Success';
                if (transactionType === 'CreateForm') msg = 'Form Created';
                else if (transactionType === 'EditForm') msg = 'Form Updated';
                else msg = 'Flow Created';
            }
        } else {
            const errorText = await response.text();
            fullApiResponse = errorText;
            msg = `HTTP ${response.status} ${response.statusText}`;
            execLog.status = 'Error';
            execLog.details += ' - HTTP Failed';
        }

        // Capture raw diagnostics for the final execution step
        execLog.raw = {
            request: {
                url: `${baseUrl}/${endpointStr}`,
                method: 'POST',
                headers,
                body: payload
            },
            response: fullApiResponse
        };

        if (status === 'Success' && warnings.length > 0) {
            status = 'Warning';
        }

        return {
            status,
            message: msg,
            payload,
            response: fullApiResponse,
            executionLog,
            warnings
        };

    } catch (networkError) {
        if (executionLog.length > 0 && executionLog[executionLog.length - 1].status === 'Pending') {
            executionLog[executionLog.length - 1].status = 'Error';
        }
        return {
            status: networkError.isValidationError ? 'ValidationError' : 'Error',
            message: networkError.message || 'Network/Processing Error',
            payload,
            response: networkError.rawResponse || null,
            executionLog,
            warnings
        };
    }
};

