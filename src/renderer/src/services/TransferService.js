import _ from 'lodash';
import { resolveTokens, normalizeString, resolvePrimitiveValue, calculateSimilarity, getRowValue } from '../utils/transferUtils';
import { constructPayload } from './PayloadFactory';

const RELAY_CSP_APP_NAME = 'Systek_SynergyCSPRelay';
const DEFAULT_API_PAGE_SIZE = 200;
const RELAY_UPLOAD_CHUNK_BYTES = 2.5 * 1024 * 1024;
const RELAY_SESSION_FILE_CHUNK_CHARS = 2 * 1024 * 1024;

const normalizeControlText = value => value === null || value === undefined
    ? null
    : String(value);

const CONNECTIVITY_FAILURE_STATUSES = new Set([401, 403, 502, 503, 504]);

const getErrorHttpStatus = error => {
    if (Number.isFinite(error?.status)) return error.status;
    const match = /\bHTTP\s+(\d{3})\b/i.exec(String(error?.message || ''));
    return match ? Number(match[1]) : null;
};

const isConnectivityFailureStatus = status => CONNECTIVITY_FAILURE_STATUSES.has(status);

const getHttpStatusMessage = status => {
    const statusMessages = {
        401: 'Oturum gecersiz veya suresi dolmus. Yeniden giris yapip transferi devam ettirin.',
        403: 'CSP ortamina erisim engellendi. VPN/ortam baglantisini ve oturum yetkisini kontrol edip transferi devam ettirin.',
        404: 'Relay API adresi bulunamadi. Deploy URL ve yayinlanmis Systek_SynergyCSPRelay uygulamasini kontrol edin.',
        502: 'CSP ortamina ulasilamiyor. VPN/ortam baglantisini kontrol edip transferi devam ettirin.',
        503: 'CSP ortami su anda yanit vermiyor. VPN/ortam baglantisini kontrol edip transferi devam ettirin.',
        504: 'CSP ortami zaman asimina ugradi. VPN/ortam baglantisini kontrol edip transferi devam ettirin.'
    };

    return statusMessages[status] || null;
};

const getNetworkFailureMessage = error => {
    const message = String(error?.message || '');
    if (
        error?.name === 'TypeError' ||
        /failed to fetch|networkerror|load failed|internet disconnected|network request failed/i.test(message)
    ) {
        return 'CSP ortamina baglanti kurulamadi. VPN/ortam baglantisini kontrol edip transferi devam ettirin.';
    }
    return null;
};

const getTransferFailureMessage = error => {
    return getHttpStatusMessage(getErrorHttpStatus(error)) || getNetworkFailureMessage(error) || error?.message || 'Network/Processing Error';
};

const isConnectivityFailure = error => {
    return isConnectivityFailureStatus(getErrorHttpStatus(error)) || Boolean(getNetworkFailureMessage(error));
};

const getRelayCapabilityFailureMessage = error => {
    if (error?.relayCapabilityMissing) {
        return 'Yayinlanmis Systek_SynergyCSPRelay uygulamasi bu transfer ozelligini desteklemiyor. Guncel CSP Relay projesini build/deploy edip tekrar deneyin.';
    }

    const connectivityMessage = getHttpStatusMessage(getErrorHttpStatus(error)) || getNetworkFailureMessage(error);
    if (connectivityMessage) return connectivityMessage;

    return 'Relay capability kontrolu tamamlanamadi. Ortam baglantisini, oturumu ve yayinlanmis Systek_SynergyCSPRelay uygulamasini kontrol edin.';
};

async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let i = 0; i <= maxRetries; i++) {
        try {
            const res = await fetch(url, options);
            if ((res.status === 502 || res.status === 503 || res.status === 504) && i < maxRetries) {
                console.warn(`[API] ${res.status} Error on ${url}. Retrying ${i + 1}/${maxRetries}...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i))); // 1s, 2s, 4s
                continue;
            }
            return res;
        } catch (err) {
            if (i < maxRetries) {
                console.warn(`[API] Network error on ${url}. Retrying ${i + 1}/${maxRetries}...`, err);
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
                continue;
            }
            throw err;
        }
    }
}

function parseJsonBody(body) {
    if (!body) return {};
    if (typeof body === 'object') return _.cloneDeep(body);
    return JSON.parse(body);
}

function getApiPageSize(parsedBody) {
    const configuredTake = Number(parsedBody?.loadOptions?.pagination?.take);
    return Number.isFinite(configuredTake) && configuredTake > 0 ? configuredTake : DEFAULT_API_PAGE_SIZE;
}

function resolveApiParameterValue(value, rowData, objectContext) {
    const rawVal = resolveTokens(value, rowData, objectContext);
    if (typeof rawVal !== 'string') return rawVal;
    if (rawVal !== '' && !isNaN(rawVal)) return Number(rawVal);
    if (rawVal.toLowerCase() === 'true') return true;
    if (rawVal.toLowerCase() === 'false') return false;
    return rawVal;
}

function injectInternalApiParameters(parsedBody, parameters, rowData, objectContext) {
    if (!Array.isArray(parameters)) return;

    const resolvedParameters = [];

    parameters.forEach(param => {
        if (!param?.key) return;

        const finalVal = resolveApiParameterValue(param.value, rowData, objectContext);
        parsedBody[param.key] = finalVal;
        resolvedParameters.push({ key: param.key, value: finalVal });
    });

    if (resolvedParameters.length > 0) {
        parsedBody.parameters = resolvedParameters;
    }
}

function getDuplicateCheckColumns(mapping) {
    const configuredColumns = Array.isArray(mapping?.duplicateCheckColumns)
        ? mapping.duplicateCheckColumns.filter(Boolean)
        : [];
    const columnSettings = (mapping?.gridColumns || [])
        .filter(column => column?.name && (
            column?.skipIfDuplicate === true || column?.mapping?.skipIfDuplicate === true
        ))
        .map(column => column.name);

    return [...new Set([...configuredColumns, ...columnSettings])];
}

function getDuplicateCaseSensitiveColumns(mapping) {
    const configuredColumns = Array.isArray(mapping?.duplicateCaseSensitiveColumns)
        ? mapping.duplicateCaseSensitiveColumns.filter(Boolean)
        : [];
    const columnSettings = (mapping?.gridColumns || [])
        .filter(column => column?.name && (
            column?.skipIfDuplicate === true || column?.mapping?.skipIfDuplicate === true
        ) && (
            column?.duplicateCaseSensitive === true || column?.mapping?.duplicateCaseSensitive === true
        ))
        .map(column => column.name);

    return [...new Set([...configuredColumns, ...columnSettings])];
}

function usesDuplicateGridPrevention(objectDefinitions = []) {
    return objectDefinitions.some(definition => {
        const mapping = definition?.mapping || {};
        if (getDuplicateCheckColumns(mapping).length > 0) return true;
        return usesDuplicateGridPrevention(mapping.gridColumns || []);
    });
}

function withPagination(body, skip, take) {
    const parsedBody = parseJsonBody(body);
    if (!parsedBody.loadOptions) parsedBody.loadOptions = {};
    parsedBody.loadOptions.pagination = { skip, take };
    return JSON.stringify(parsedBody);
}

async function fetchApiResultList(resolvedUrl, fetchOptions, resolvedBody, responsePath, apiLog = null) {
    const method = fetchOptions.method || 'GET';
    const canPage = method !== 'GET' && method !== 'HEAD' && resolvedBody;

    if (!canPage) {
        const res = await fetchWithRetry(resolvedUrl, fetchOptions);
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`API lookup failed (HTTP ${res.status}): ${errText}`);
        }
        const json = await res.json();
        if (apiLog) apiLog.raw.response = json;
        return _.get(json, responsePath || 'result.result') || [];
    }

    let parsedBody;
    try {
        parsedBody = parseJsonBody(resolvedBody);
    } catch (e) {
        const res = await fetchWithRetry(resolvedUrl, fetchOptions);
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`API lookup failed (HTTP ${res.status}): ${errText}`);
        }
        const json = await res.json();
        if (apiLog) apiLog.raw.response = json;
        return _.get(json, responsePath || 'result.result') || [];
    }

    if (!parsedBody.loadOptions) {
        const res = await fetchWithRetry(resolvedUrl, fetchOptions);
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`API lookup failed (HTTP ${res.status}): ${errText}`);
        }
        const json = await res.json();
        if (apiLog) apiLog.raw.response = json;
        return _.get(json, responsePath || 'result.result') || [];
    }

    const take = getApiPageSize(parsedBody);
    const allItems = [];
    const pageResponses = [];

    for (let skip = 0; ; skip += take) {
        const pageBody = withPagination(parsedBody, skip, take);
        const pageOptions = { ...fetchOptions, body: pageBody };
        const res = await fetchWithRetry(resolvedUrl, pageOptions);
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`API lookup page failed (skip: ${skip}, take: ${take}, HTTP ${res.status}): ${errText}`);
        }

        const json = await res.json();
        const pageItems = _.get(json, responsePath || 'result.result') || [];
        if (apiLog) {
            pageResponses.push({
                pagination: { skip, take },
                count: Array.isArray(pageItems) ? pageItems.length : 0,
                request: {
                    url: resolvedUrl,
                    method,
                    headers: pageOptions.headers,
                    body: parseJsonBody(pageBody)
                },
                response: json
            });
        }

        if (!Array.isArray(pageItems) || pageItems.length === 0) break;

        allItems.push(...pageItems);
        if (pageItems.length < take) break;
    }

    if (apiLog) {
        apiLog.raw.response = {
            pagination: {
                pageSize: take,
                pages: pageResponses.length,
                totalItems: allItems.length
            },
            pages: pageResponses
        };
        apiLog.raw.pages = pageResponses;
    }

    return allItems;
}
/**
 * Uploads a file using the 2-step CreateFileParts → UploadFileParts flow.
 * Returns { FileSecretKey, Category, Path } on success, or throws on failure.
 *
 * @param {string} baseUrl  - base Transfer API URL (without trailing slash)
 * @param {object} headers  - common auth headers (Authorization, bimser-encrypted-data, bimser-language)
 * @param {object} fileInfo - { name, contentType, size, buffer } from readFileAsBuffer
 * @param {string} targetPath - The full target folder path (e.g. "DOCUMENTS/ENVRA/FIRMALAR")
 * @param {string} category - RelatedDocuments category/library caption (e.g. "DOCUMENTS")
 * @param {object} executionLog - shared execution log array for diagnostics
 */
async function uploadFileInParts(baseUrl, headers, fileInfo, targetPath, category, executionLog) {
    const { name, contentType, size, buffer } = fileInfo;
    const normalizedTargetPath = normalizeDocumentTargetPath(targetPath);
    const resolvedCategory = category || (normalizedTargetPath ? getDocumentPathLibrary(normalizedTargetPath) : null);

    // ── Step 1: CreateFileParts ──────────────────────────────────────────────
    const createLog = {
        key: `create_file_parts_${Date.now()}_${Math.random()}`,
        step: 'CreateFileParts',
        details: `File: ${name} (${size} bytes)`,
        status: 'Pending'
    };
    executionLog.push(createLog);

    const createBody = {
        Name: name,
        Description: name,
        DataLength: size,
        ContentType: contentType
    };
    if (normalizedTargetPath) {
        createBody.Path = normalizedTargetPath;
    }

    const createRes = await fetchWithRetry(`${baseUrl}/CreateFileParts`, {
        method: 'POST',
        headers,
        body: JSON.stringify(createBody)
    });

    if (!createRes.ok) {
        const errText = await createRes.text();
        createLog.status = 'Error';
        createLog.raw = { request: { url: `${baseUrl}/CreateFileParts`, body: createBody }, response: errText };
        throw new Error(`CreateFileParts failed (HTTP ${createRes.status}): ${errText}`);
    }

    const createJson = await createRes.json();
    createLog.status = 'Success';
    createLog.raw = { request: { url: `${baseUrl}/CreateFileParts`, body: createBody }, response: createJson };

    const fileSecretKey = createJson.fileSecretKey;
    const uploadParts = createJson.uploadParts; // Array<{id, startByte, endByte, url}>

    if (!fileSecretKey || !Array.isArray(uploadParts) || uploadParts.length === 0) {
        throw new Error(`CreateFileParts response missing fileSecretKey or uploadParts for "${name}"`);
    }

    // Convert plain array (from IPC) to Uint8Array for slicing
    const byteArray = new Uint8Array(buffer);

    const normalizedUploadParts = uploadParts.map(part => ({
        id: part.id,
        startByte: part.startByte,
        endByte: part.endByte,
        url: part.url
    }));
    const totalRelayChunks = Math.ceil(size / RELAY_UPLOAD_CHUNK_BYTES);

    // ── Step 2: UploadFileParts (small relay chunks, SDK upload on final chunk) ──
    for (let chunkStart = 0, chunkIndex = 1; chunkStart < size; chunkStart += RELAY_UPLOAD_CHUNK_BYTES, chunkIndex++) {
        const chunkEndExclusive = Math.min(chunkStart + RELAY_UPLOAD_CHUNK_BYTES, size);
        const partLog = {
            key: `upload_chunk_${chunkIndex}_${Date.now()}_${Math.random()}`,
            step: 'UploadFileParts',
            details: `File: ${name}, Chunk #${chunkIndex}/${totalRelayChunks} (bytes ${chunkStart}-${chunkEndExclusive - 1})`,
            status: 'Pending'
        };
        executionLog.push(partLog);

        // Slice the file into relay-safe chunks and convert to base64.
        const slice = byteArray.slice(chunkStart, chunkEndExclusive);
        let binary = '';
        for (let i = 0; i < slice.length; i++) binary += String.fromCharCode(slice[i]);
        const chunkBase64 = btoa(binary);

        const uploadBody = {
            FileSecretKey: fileSecretKey,
            UploadParts: normalizedUploadParts,
            ContentType: contentType,
            Data: chunkBase64,
            DataLength: slice.length,
            ChunkStartByte: chunkStart,
            TotalFileBytes: size
        };

        const uploadUrl = `${baseUrl}/UploadFileParts`;
        const uploadReq = {
            method: 'POST',
            headers,
            body: JSON.stringify(uploadBody)
        };

        const uploadRes = await fetchWithRetry(uploadUrl, uploadReq);

        // Keep the network payload intact; only the diagnostic copy is shortened for the UI.
        const loggedBody = {
            ...uploadBody,
            Data: chunkBase64.substring(0, 50) + '... [TRUNCATED FOR LOGS - FULL DATA SENT]'
        };
        
        const reqLogInfo = {
            url: uploadUrl,
            method: 'POST',
            headers,
            body: loggedBody,
            logInfo: {
                dataTruncated: true,
                fullDataSent: true,
                dataLength: chunkBase64.length,
                rawByteLength: slice.length,
                chunkStartByte: chunkStart,
                chunkEndByte: chunkEndExclusive - 1,
                totalFileBytes: size,
                relayChunkIndex: chunkIndex,
                totalRelayChunks,
                totalUploadParts: uploadParts.length,
                cspUploadParts: normalizedUploadParts.map(part => ({
                    id: part.id,
                    startByte: part.startByte,
                    endByte: part.endByte,
                    byteLength: part.endByte - part.startByte + 1
                }))
            }
        };

        if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            partLog.status = 'Error';
            partLog.raw = { request: reqLogInfo, response: errText };
            throw new Error(`UploadFileParts failed for "${name}" chunk #${chunkIndex}/${totalRelayChunks} (HTTP ${uploadRes.status}): ${errText}`);
        }

        // Response is true/false
        const uploadResult = await uploadRes.json();
        if (uploadResult !== true) {
            partLog.status = 'Error';
            partLog.raw = { request: reqLogInfo, response: uploadResult };
            throw new Error(`UploadFileParts returned false for "${name}" chunk #${chunkIndex}/${totalRelayChunks}`);
        }

        partLog.status = 'Success';
        partLog.raw = { request: reqLogInfo, response: uploadResult };
    }

    // ── Result: return descriptor for the final payload ──────────────────────
    return {
        FileSecretKey: fileSecretKey,
        Category: resolvedCategory,
        Path: normalizedTargetPath || null,
        FileSize: size
    };
}

function fileInfoToRelatedDocumentItem(fileInfo, targetPath = null, category = null) {
    const { name, contentType, size, buffer } = fileInfo;
    const byteArray = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < byteArray.length; i++) binary += String.fromCharCode(byteArray[i]);

    return {
        Name: name,
        Description: name,
        ContentType: contentType || 'application/octet-stream',
        Data: btoa(binary),
        FileSize: size,
        Category: category || null,
        Path: normalizeDocumentTargetPath(targetPath) || null
    };
}

function collectEmbeddedRelatedDocumentItems(rows = []) {
    const items = [];
    const visitRows = relatedRows => {
        for (const row of relatedRows || []) {
            const formFields = row?.FormFields;
            for (const relatedDocuments of formFields?.RelatedDocuments || []) {
                for (const item of relatedDocuments?.Items || []) {
                    if (!item?.FileSecretKey && typeof item?.Data === 'string' && item.Data.length > 0) {
                        items.push(item);
                    }
                }
            }
            for (const nestedGrid of formFields?.RelatedGrids || []) {
                visitRows(nestedGrid?.Rows || []);
            }
        }
    };
    visitRows(rows);
    return items;
}

async function stageRelatedGridFilesForSession(baseUrl, headers, sessionId, rows, executionLog) {
    const embeddedItems = collectEmbeddedRelatedDocumentItems(rows);

    for (const item of embeddedItems) {
        const encodedData = item.Data;
        const uploadToken = crypto.randomUUID().replace(/-/g, '');
        const totalChunks = Math.ceil(encodedData.length / RELAY_SESSION_FILE_CHUNK_CHARS);

        for (let chunkStart = 0, chunkIndex = 1; chunkStart < encodedData.length; chunkStart += RELAY_SESSION_FILE_CHUNK_CHARS, chunkIndex++) {
            const chunkData = encodedData.slice(chunkStart, chunkStart + RELAY_SESSION_FILE_CHUNK_CHARS);
            const uploadBody = {
                SessionId: sessionId,
                UploadToken: uploadToken,
                Data: chunkData,
                DataLength: chunkData.length,
                ChunkStart: chunkStart,
                TotalEncodedLength: encodedData.length
            };
            const uploadUrl = `${baseUrl}/UploadSessionFileChunk`;
            const uploadLog = {
                key: `session_file_chunk_${Date.now()}_${Math.random()}`,
                step: 'UploadSessionFileChunk',
                details: `${item.Name || 'RelatedDocument'}: chunk ${chunkIndex}/${totalChunks}`,
                status: 'Pending'
            };
            executionLog.push(uploadLog);

            const response = await fetchWithRetry(uploadUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(uploadBody)
            });
            const responseBody = response.ok ? await response.json() : await response.text();
            uploadLog.raw = {
                request: {
                    url: uploadUrl,
                    method: 'POST',
                    headers,
                    body: {
                        ...uploadBody,
                        Data: `[OMITTED ${chunkData.length} BASE64 CHARACTERS]`
                    }
                },
                response: responseBody
            };

            if (!response.ok) {
                uploadLog.status = 'Error';
                const error = new Error(`UploadSessionFileChunk failed for "${item.Name || 'RelatedDocument'}" chunk ${chunkIndex}/${totalChunks} (HTTP ${response.status} ${response.statusText})`);
                error.rawResponse = responseBody;
                throw error;
            }
            uploadLog.status = 'Success';
        }

        item.TransferFileToken = uploadToken;
        delete item.Data;
    }
}

function hasEmbeddedRelatedGridFiles(flowPayload) {
    if (!Array.isArray(flowPayload?.FlowDocuments)) return false;
    return flowPayload.FlowDocuments.some(document =>
        collectEmbeddedRelatedDocumentItems(document?.FormFields?.RelatedGrids?.flatMap(grid => grid?.Rows || []) || []).length > 0
    );
}

function normalizeDocumentTargetPath(path) {
    return String(path || '').replace(/\\/g, '/').trim().replace(/^\/+|\/+$/g, '');
}

function getDocumentPathLibrary(path) {
    const normalized = normalizeDocumentTargetPath(path);
    return normalized.split('/').filter(Boolean)[0] || 'DOCUMENTS';
}

function resolveRelatedDocumentTarget(mapping = {}, rowData = {}, objectContext = {}) {
    const rawPath = mapping.savePathTemplate
        ? resolveTokens(mapping.savePathTemplate, rowData, objectContext)
        : mapping.savePathCol
            ? getRowValue(rowData, mapping.savePathCol)
            : mapping.savePath || '';
    const targetPath = normalizeDocumentTargetPath(rawPath);
    const category = mapping.category || (targetPath ? getDocumentPathLibrary(targetPath) : null);
    return {
        targetPath,
        category
    };
}

async function executeDocumentTransfer(rowData, definitionData, globalStore, executionLog) {
    const localPath = String(getRowValue(rowData, definitionData.localPathColumn) || '').trim();
    const targetPath = String(getRowValue(rowData, definitionData.cspPathColumn) || '').trim();

    if (!localPath) {
        throw new Error(`Local file path is empty in Excel column '${definitionData.localPathColumn || ''}'.`);
    }
    if (!targetPath) {
        throw new Error(`CSP target path is empty in Excel column '${definitionData.cspPathColumn || ''}'.`);
    }
    if (!window.api?.readFileAsBuffer) {
        throw new Error('Local file reader is not available.');
    }

    const fileInfo = await window.api.readFileAsBuffer(localPath);
    if (!fileInfo?.success) {
        throw new Error(`Failed to read local file '${localPath}': ${fileInfo?.error || 'Unknown error'}`);
    }

    const deployUrl = globalStore.get('deployUrl');
    if (!deployUrl) throw new Error('Deploy URL not found');

    const baseUrl = `${deployUrl.replace(/\/$/, '')}/apps/${RELAY_CSP_APP_NAME}/latest/api/Transfer`;
    const headers = { 'Content-Type': 'application/json' };
    const token = globalStore.get('token');
    const encryptedData = globalStore.get('encryptedData');
    if (token) headers.Authorization = `Bearer ${token}`;
    if (encryptedData) headers['bimser-encrypted-data'] = encryptedData;
    headers['bimser-language'] = globalStore.get('language') || 'tr-TR';

    const uploadResult = await uploadFileInParts(baseUrl, headers, fileInfo, targetPath, getDocumentPathLibrary(targetPath), executionLog);
    return {
        status: 'Success',
        message: 'Document Uploaded',
        payload: {
            MainId: getRowValue(rowData, definitionData.mainIdColumn),
            LocalPath: localPath,
            TargetPath: targetPath,
            FileName: fileInfo.name,
            FileSize: fileInfo.size
        },
        response: uploadResult,
        executionLog,
        warnings: []
    };
}

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

    // Initialize raw details for diagnostics
    logEntry.raw = {
        request: {
            url: `${baseUrl}/CreateForm`,
            method: 'POST',
            headers,
            body: payload
        },
        response: null
    };

    try {
        const response = await fetchWithRetry(`${baseUrl}/CreateForm`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            logEntry.status = 'Error';
            let errorText = await response.text();
            logEntry.raw.response = errorText;
            const err = new Error(`HTTP ${response.status} ${response.statusText}`);
            err.rawResponse = errorText;
            throw err;
        }

        const json = await response.json();
        logEntry.raw.response = json;

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

    } catch (err) {
        logEntry.status = 'Error';
        if (logEntry.raw && !logEntry.raw.response) {
            logEntry.raw.response = err.message || String(err);
        }
        throw err;
    }
}

/**
 * Parses a cell value that may contain a JSON array string like ["a","b"] or [1,2]
 * Returns an array of string values, or null if not a valid array.
 */
function tryParseArrayCell(rawVal) {
    if (rawVal === null || rawVal === undefined) return null;
    const str = String(rawVal).trim();
    if (!str.startsWith('[')) return null;
    try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) return parsed.map(v => String(v));
    } catch (e) { /* not valid JSON */ }
    return null;
}

/**
 * Helper: Resolve a mapping that is flagged as isArray.
 * 
 * Excel mode: parses the cell value as a JSON array (e.g. ["asd","abc"])
 *   and runs resolvePrimitiveValue on each element.
 * 
 * API mode: parses the cell value as a JSON array, runs a lookup for
 *   EACH element, then returns the collected values as an array.
 *   e.g. ["asd","abc"] -> [2, 3]
 * 
 * Fixed mode: wraps the single fixed value in an array [fixedValue].
 */
async function resolveMappedValueArray(mapping, rowData, globalStore, apiCache, objectContext, executionLog = [], warnings = [], fieldName = '', systemSettings = {}) {
    // ── EXCEL ────────────────────────────────────────────────────────────────────
    if (mapping.source === 'Excel') {
        const col = mapping.valueCol;
        if (!col) return { Value: [], Text: '' };

        const rawCell = getRowValue(rowData, col);
        const items = tryParseArrayCell(rawCell);
        const separateText = mapping.useSeparateTextColumn === true && mapping.textCol;
        const rawTextCell = separateText ? getRowValue(rowData, mapping.textCol) : null;
        const textItems = separateText ? tryParseArrayCell(rawTextCell) : null;

        if (!items) {
            // Not an array - fall back to single value wrapped in array
            const single = resolvePrimitiveValue(rawCell, mapping.dataType, mapping);
            const text = separateText
                ? String(rawTextCell !== null && rawTextCell !== undefined ? rawTextCell : '')
                : String(single !== null ? single : '');
            return { Value: single !== null ? [single] : [], Text: text };
        }

        const values = items.map(item => resolvePrimitiveValue(item, mapping.dataType, mapping));
        return { Value: values, Text: (textItems || items).join(', ') };
    }

    // ── API ──────────────────────────────────────────────────────────────────────
    if (mapping.source === 'API') {
        // Determine the search key column value (the array cell)
        let rawCell = '';
        if (mapping.searchKeyTemplate) {
            rawCell = String(resolveTokens(mapping.searchKeyTemplate, rowData, objectContext));
        } else if (mapping.textCol) {
            rawCell = String(getRowValue(rowData, mapping.textCol) || '');
        }

        const items = tryParseArrayCell(rawCell);

        // If not a parseable array, treat as single-element array
        const searchItems = items || (rawCell.trim() ? [rawCell.trim()] : []);

        if (searchItems.length === 0) {
            executionLog.push({
                key: `api_arr_skip_${Date.now()}_${Math.random()}`,
                step: 'API Request',
                details: `Field: ${fieldName} -> Skipped (empty array)`,
                status: 'Success'
            });
            return { Value: [], Text: '' };
        }

        executionLog.push({
            key: `api_arr_${Date.now()}_${Math.random()}`,
            step: 'API Request',
            details: `Field: ${fieldName}, Items: ${JSON.stringify(searchItems)}`,
            status: 'Success'
        });

        // Create a non-array version of the mapping for individual lookups
        const singleMapping = { ...mapping, isArray: false };

        // Run a lookup for each item sequentially (cache will absorb repeated calls to same endpoint)
        const resolvedValues = [];
        const resolvedTexts = [];

        for (const item of searchItems) {
            // Temporarily patch rowData so that {{col}} resolves to this individual item
            const patchedRowData = mapping.searchKeyTemplate
                ? { ...rowData }  // tokens will be replaced via a patched template below
                : { ...rowData, [mapping.textCol || '__array_item__']: item };

            // Patch the searchKeyTemplate to return just this item (literal)
            const patchedMapping = {
                ...singleMapping,
                searchKeyTemplate: item,  // use the raw item as the key directly
            };

            const result = await resolveSingleApiItem(patchedMapping, item, rowData, globalStore, apiCache, objectContext, executionLog, warnings, `${fieldName}[${item}]`, systemSettings);
            resolvedValues.push(result.Value);
            resolvedTexts.push(result.Text);
        }

        return { Value: resolvedValues, Text: resolvedTexts.join(', ') };
    }

    // ── FIXED ────────────────────────────────────────────────────────────────────
    if (mapping.source === 'Fixed') {
        const val = mapping.fixedValue;
        const finalValue = resolvePrimitiveValue(val, mapping.dataType, mapping);
        const finalText = mapping.fixedText !== undefined && mapping.fixedText !== ''
            ? String(mapping.fixedText)
            : String(finalValue !== null ? finalValue : '');
        return { Value: finalValue !== null ? [finalValue] : [], Text: finalText };
    }

    return { Value: [], Text: '' };
}

/**
 * Internal helper used by resolveMappedValueArray for API mode.
 * Performs a single-item lookup against the already-fetched API result list.
 * Re-uses the cache so the same API endpoint is called only once per unique body.
 */
async function resolveSingleApiItem(mapping, searchKey, rowData, globalStore, apiCache, objectContext, executionLog = [], warnings = [], fieldName = '', systemSettings = {}) {
    const apiMatchThreshold = systemSettings.apiMatchThreshold !== undefined ? systemSettings.apiMatchThreshold : 0.9;
    const apiCacheLimit = systemSettings.apiCacheLimit !== undefined ? systemSettings.apiCacheLimit : 50;
    const useApiCache = mapping.cacheApiResponse !== false;

    // Build URL / Body (same as main resolveMappedValue)
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
            if (!parsedBody.loadOptions) parsedBody.loadOptions = {};
            parsedBody.loadOptions.distinct = true;
            parsedBody.loadOptions.filterNulls = true;
            parsedBody.loadOptions.filters = parsedBody.loadOptions.filters || [];
            parsedBody.loadOptions.sorts = parsedBody.loadOptions.sorts || null;
            if (mapping.valuePath) {
                const m = mapping.valuePath.match(/{{\s*([^{}]+?)\s*}}/);
                if (m) parsedBody.loadOptions.valueExpr = m[1].trim();
            }
            parsedBody.loadOptions.pagination = {
                skip: 0,
                take: getApiPageSize(parsedBody)
            };
            if (!useApiCache) parsedBody.forceRefresh = true;
            else if (parsedBody.forceRefresh === undefined) parsedBody.forceRefresh = false;
            injectInternalApiParameters(parsedBody, mapping.parameters, rowData, objectContext);
            resolvedBody = JSON.stringify(parsedBody);
        } catch (e) {
            console.warn('Failed to inject parameters into Internal API body (array item)', e);
        }
    } else if (mapping.apiType === 'External' && mapping.parameters && Array.isArray(mapping.parameters)) {
        try {
            const urlObj = new URL(resolvedUrl);
            mapping.parameters.forEach(p => {
                const key = p.key;
                const val = resolveTokens(p.value, rowData, objectContext);
                if (key) urlObj.searchParams.append(key, val);
            });
            resolvedUrl = urlObj.toString();
        } catch (e) {
            console.warn('Invalid URL for adding params', resolvedUrl);
        }
    }

    const cacheKey = `${resolvedUrl}|${resolvedBody}`;
    let apiResultList = [];

    if (useApiCache && apiCache.has(cacheKey)) {
        apiResultList = apiCache.get(cacheKey);
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
                } catch (e) { /* ignore */ }
            }
            if (fetchOptions.method !== 'GET' && fetchOptions.method !== 'HEAD') {
                fetchOptions.body = resolvedBody;
            }
            apiResultList = await fetchApiResultList(resolvedUrl, fetchOptions, resolvedBody, mapping.responsePath);
            if (useApiCache && Array.isArray(apiResultList)) {
                apiCache.set(cacheKey, apiResultList);
                if (apiCache.size > apiCacheLimit) {
                    const keysIter = apiCache.keys();
                    const deleteCount = Math.max(1, Math.round(apiCacheLimit * 0.2));
                    for (let i = 0; i < deleteCount; i++) {
                        const nextKey = keysIter.next().value;
                        if (nextKey !== undefined) apiCache.delete(nextKey);
                    }
                }
            }
        } catch (err) {
            console.error('Array Item Lookup API Error', err);
        }
    }

    // Match this specific searchKey against the result list
    let bestMatch = null;
    let maxSimilarity = 0;
    let bestMatchText = '';

    if (Array.isArray(apiResultList)) {
        for (const item of apiResultList) {
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
            if (maxSimilarity === 1) break;
        }
    }

    if (bestMatch && maxSimilarity >= apiMatchThreshold) {
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
        const finalValue = resolvePrimitiveValue(rawValue, mapping.dataType, mapping);
        const txtTemplate = mapping.textPath || mapping.displayFormat;
        let finalText = searchKey;
        if (txtTemplate) {
            finalText = txtTemplate.replace(/{{\s*([^{}]+?)\s*}}/g, (m, rawK) => {
                const k = rawK.trim();
                return bestMatch[k] !== undefined ? bestMatch[k] : '';
            });
        }
        return { Value: finalValue, Text: finalText };
    } else {
        const showBest = bestMatchText && maxSimilarity > 0.15;
        warnings.push(`Field '${fieldName}': Could not match API value for '${searchKey}'${showBest ? `. (Closest: "${bestMatchText}" - ${(maxSimilarity * 100).toFixed(0)}%)` : ''}`);
        return { Value: null, Text: '' };
    }
}

/**
 * Helper: Resolve a single value mapping (Excel or API)
 */
async function resolveMappedValue(mapping, rowData, globalStore, apiCache, objectContext, executionLog = [], warnings = [], fieldName = '', systemSettings = {}) {
    let finalValue = null;
    let finalText = '';

    const apiMatchThreshold = systemSettings.apiMatchThreshold !== undefined ? systemSettings.apiMatchThreshold : 0.9;
    const apiCacheLimit = systemSettings.apiCacheLimit !== undefined ? systemSettings.apiCacheLimit : 50;
    const useApiCache = mapping?.cacheApiResponse !== false;

    if (!mapping) return { Value: null, Text: '' };

    // ── ARRAY MODE ──────────────────────────────────────────────────────────────
    if (mapping.isArray) {
        return await resolveMappedValueArray(mapping, rowData, globalStore, apiCache, objectContext, executionLog, warnings, fieldName, systemSettings);
    }
    // ────────────────────────────────────────────────────────────────────────────

    if (mapping.source === 'Excel') {
        const col = mapping.valueCol;
        if (col) {
            const rawVal = getRowValue(rowData, col);
            finalValue = resolvePrimitiveValue(rawVal, mapping.dataType, mapping);
            if (mapping.useSeparateTextColumn === true && mapping.textCol) {
                const rawText = getRowValue(rowData, mapping.textCol);
                finalText = String(rawText !== null && rawText !== undefined ? rawText : '');
            } else {
                finalText = String(finalValue !== null ? finalValue : '');
            }
        }
    } else if (mapping.source === 'API') {
        let searchKey = '';
        if (mapping.searchKeyTemplate) {
            searchKey = String(resolveTokens(mapping.searchKeyTemplate, rowData, objectContext));
        } else if (mapping.textCol) {
            searchKey = String(getRowValue(rowData, mapping.textCol) || '');
        }

        const trimmedKey = searchKey.trim();
        if (!trimmedKey || trimmedKey === 'null' || trimmedKey === 'undefined') {
            const apiLog = {
                key: `api_skip_${Date.now()}_${Math.random()}`,
                step: 'API Request',
                details: `Field: ${fieldName} -> Skipped (Excel search key ${mapping.searchKeyTemplate || ''} is empty)`,
                status: 'Success'
            };
            executionLog.push(apiLog);
            return { Value: null, Text: '' };
        }

        const apiLog = { key: `api_${Date.now()}_${Math.random()}`, step: 'API Request', details: `Field: ${fieldName}, Query: "${trimmedKey}"`, status: 'Pending' };
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

                // 3. Page through all rows so API matching can see the full dataset.
                parsedBody.loadOptions.pagination = {
                    skip: 0,
                    take: getApiPageSize(parsedBody)
                };
                
                // 4. Ensure forceRefresh
                if (!useApiCache) {
                    parsedBody.forceRefresh = true;
                } else if (parsedBody.forceRefresh === undefined) {
                    parsedBody.forceRefresh = false;
                }

                // 5. Handle Parameters in both supported payload shapes:
                // root fields (DISTRICTID: 2060) and parameters array ({ key, value }).
                injectInternalApiParameters(parsedBody, mapping.parameters, rowData, objectContext);

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

        // Initialize apiLog.raw with request details so UI can always inspect it (even on cache hit)
        apiLog.raw = {
            request: {
                url: resolvedUrl,
                method: fetchOptions.method,
                headers: fetchOptions.headers,
                body: resolvedBody ? (function() { try { return JSON.parse(resolvedBody); } catch(e) { return resolvedBody; } })() : null
            },
            response: null,
            cacheEnabled: useApiCache
        };

        if (useApiCache && apiCache.has(cacheKey)) {
            apiResultList = apiCache.get(cacheKey);
            // Update LRU by re-inserting
            apiCache.delete(cacheKey);
            apiCache.set(cacheKey, apiResultList);
            apiLog.raw.response = { "message": "Loaded from cache", "cachedDataSize": apiResultList?.length };
        } else {
            try {
                apiResultList = await fetchApiResultList(resolvedUrl, fetchOptions, resolvedBody, mapping.responsePath, apiLog);
                if (useApiCache && Array.isArray(apiResultList)) {
                    apiCache.set(cacheKey, apiResultList);

                    // PREVENT MEMORY LEAK: Limit apiCache size with Map
                    if (apiCache.size > apiCacheLimit) {
                        const keysIter = apiCache.keys();
                        const deleteCount = Math.max(1, Math.round(apiCacheLimit * 0.2)); // delete 20% of entries
                        for (let i = 0; i < deleteCount; i++) {
                            const nextKey = keysIter.next().value;
                            if (nextKey !== undefined) apiCache.delete(nextKey);
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

        // Apply Threshold
        if (bestMatch && maxSimilarity >= apiMatchThreshold) {
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
            finalValue = resolvePrimitiveValue(rawValue, mapping.dataType, mapping);

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
        finalValue = resolvePrimitiveValue(val, mapping.dataType, mapping);
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

    // Extract System Settings with fallback defaults
    const apiMatchThreshold = definitionData?.apiMatchThreshold !== undefined 
        ? definitionData.apiMatchThreshold 
        : (globalStore?.get('apiMatchThreshold') !== undefined ? globalStore.get('apiMatchThreshold') : 0.9);

    const apiCacheLimit = definitionData?.apiCacheLimit !== undefined 
        ? definitionData.apiCacheLimit 
        : (globalStore?.get('apiCacheLimit') !== undefined ? globalStore.get('apiCacheLimit') : 50);

    const relatedGridChunkSize = definitionData?.relatedGridChunkSize !== undefined 
        ? definitionData.relatedGridChunkSize 
        : (globalStore?.get('relatedGridChunkSize') !== undefined ? globalStore.get('relatedGridChunkSize') : 5);

    const systemSettings = { apiMatchThreshold, apiCacheLimit, relatedGridChunkSize };

    try {
        executionLog.push({ key: `init_${Date.now()}_${Math.random()}`, step: 'Initialize', details: 'Row parsing started', status: 'Success' });

        if (globalStore.get('transactionType') === 'DocumentTransfer') {
            return await executeDocumentTransfer(rowData, definitionData, globalStore, executionLog);
        }

        // 1. Resolve Mapped Objects
        const mappedObjects = [];
        const objectContext = {}; // for dependencies

        // Extract LoginAs if enabled
        if (definitionData.loginAsEnabled && definitionData.loginAsColumn) {
            const rawVal = getRowValue(rowData, definitionData.loginAsColumn);
            if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
                loginAsValue = String(rawVal).trim();
            }
        }

        const toFormControlParameter = (mapping = {}, defaultScope = 'Current') => ({
            Source: 'FormControl',
            ControlName: mapping.controlName,
            Property: mapping.controlProperty || 'Value',
            Scope: mapping.controlScope || defaultScope
        });

        const resolveParameterDefinitions = async (paramsDef, sourceRow, context, defaultControlScope = 'Current') => {
            if (!paramsDef || !Array.isArray(paramsDef)) return {};

            const resolved = {};
            for (const p of paramsDef) {
                if (!p.key) continue;

                const type = p.type || 'Value';
                const mapping = p.mapping || {};

                if (mapping.source === 'FormControl') {
                    resolved[p.key] = toFormControlParameter(mapping, defaultControlScope);
                    continue;
                }

                if (type === 'InlineGrid' || type === 'RelatedGrid') {
                    const masterCol = mapping.masterKey;
                    resolved[p.key] = masterCol
                        ? await resolveGridRows(type, mapping, getRowValue(sourceRow, masterCol))
                        : [];
                    continue;
                }

                const res = await resolveMappedValue(mapping, sourceRow, globalStore, apiCache, context, executionLog, warnings, p.key, systemSettings);
                resolved[p.key] = res.Value !== null ? res.Value : res.Text;
            }

            return resolved;
        };

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

            // Process grid rows sequentially to prevent parallel Electron IPC failures
            // (especially when reading large files via readFileAsBase64)
            const resolvedRows = [];
            for (const gridRow of gridRows) {
                const rowContext = { ...objectContext }; // inherit parent context
                const rowObjects = [];

                for (const colDef of gridColumns) {
                    const colType = colDef.type || 'Value';

                    if (colType === 'InlineGrid' || colType === 'RelatedGrid') {
                        // Recursive call for nested grids inside a grid column
                        const nestedRows = await resolveGridRows(colType, colDef.mapping, gridRow[colDef.mapping?.masterKey]);

                        if (colType === 'RelatedGrid') {
                            rowObjects.push({
                                FieldName: colDef.name,
                                Type: 'RelatedGrid',
                                ProjectName: colDef.mapping?.relatedProjectName,
                                FormName: colDef.mapping?.relatedFormName,
                                DocumentIdColumnName: colDef.mapping?.relatedDocIdCol,
                                WriteMode: colDef.mapping?.gridWriteMode || 'Append',
                                UniqueColumns: getDuplicateCheckColumns(colDef.mapping),
                                CaseSensitiveUniqueColumns: getDuplicateCaseSensitiveColumns(colDef.mapping),
                                Rows: nestedRows
                            });
                            continue;
                        } else {
                            rowObjects.push({
                                FieldName: colDef.name,
                                Type: 'InlineGrid',
                                WriteMode: colDef.mapping?.gridWriteMode || 'Append',
                                UniqueColumns: getDuplicateCheckColumns(colDef.mapping),
                                CaseSensitiveUniqueColumns: getDuplicateCaseSensitiveColumns(colDef.mapping),
                                Rows: nestedRows
                            });
                            continue;
                        }
                    }

                    if (colType === 'RelatedDocument') {
                        const pathCol = colDef.mapping?.pathCol;
                        if (pathCol) {
                            const filePathRaw = String(gridRow[pathCol] || '').trim();
                            if (filePathRaw && window.api?.readFileAsBuffer) {
                                let filePaths = [];
                                try {
                                    const parsed = JSON.parse(filePathRaw);
                                    if (Array.isArray(parsed)) {
                                        filePaths = parsed.map(p => String(p || '').trim()).filter(Boolean);
                                    } else {
                                        filePaths = [filePathRaw];
                                    }
                                } catch (e) {
                                    filePaths = [filePathRaw];
                                }

                                const deployUrl = globalStore.get('deployUrl');
                                const fileBaseUrl = `${deployUrl.replace(/\/$/, '')}/apps/${RELAY_CSP_APP_NAME}/latest/api/Transfer`;
                                const fileHeaders = { 'Content-Type': 'application/json' };
                                const token = globalStore.get('token');
                                const encryptedData = globalStore.get('encryptedData');
                                const userLang = globalStore.get('language') || 'tr-TR';
                                if (token) fileHeaders['Authorization'] = `Bearer ${token}`;
                                if (encryptedData) fileHeaders['bimser-encrypted-data'] = encryptedData;
                                fileHeaders['bimser-language'] = userLang;

                                const resolvedItems = [];
                                for (const filePath of filePaths) {
                                    const fileResult = await window.api.readFileAsBuffer(filePath);
                                    if (fileResult.success) {
                                        try {
                                            const { targetPath, category } = resolveRelatedDocumentTarget(colDef.mapping, gridRow, rowContext);
                                            const descriptor = targetPath
                                                ? await uploadFileInParts(
                                                    fileBaseUrl,
                                                    fileHeaders,
                                                    fileResult,
                                                    targetPath,
                                                    category,
                                                    executionLog
                                                )
                                                : fileInfoToRelatedDocumentItem(fileResult, null, category);
                                            resolvedItems.push(descriptor);
                                        } catch (uploadErr) {
                                            const errMsg = `RelatedDocument '${colDef.name}': upload failed for "${filePath}" - ${uploadErr.message}`;
                                            executionLog.push({
                                                key: `reldoc_upload_err_${Date.now()}_${Math.random()}`,
                                                step: 'RelatedDocument Upload',
                                                details: errMsg,
                                                status: 'Error'
                                            });
                                            throw new Error(errMsg);
                                        }
                                    } else {
                                        const errMsg = `RelatedDocument '${colDef.name}': failed to read file "${filePath}" - ${fileResult.error || 'Unknown error'}`;
                                        executionLog.push({
                                            key: `reldoc_err_${Date.now()}_${Math.random()}`,
                                            step: 'RelatedDocument Read',
                                            details: errMsg,
                                            status: 'Error'
                                        });
                                        throw new Error(errMsg);
                                    }
                                }

                                if (resolvedItems.length > 0) {
                                    rowObjects.push({
                                        FieldName: colDef.name,
                                        Type: 'RelatedDocument',
                                        Items: resolvedItems
                                    });
                                }
                            } else if (filePathRaw && !window.api?.readFileAsBuffer) {
                                const errMsg = `RelatedDocument '${colDef.name}': readFileAsBuffer API not available`;
                                executionLog.push({
                                    key: `reldoc_api_err_${Date.now()}_${Math.random()}`,
                                    step: 'RelatedDocument Read',
                                    details: errMsg,
                                    status: 'Error'
                                });
                                throw new Error(errMsg);
                            }
                        }
                        continue; // Skip to next column
                    }

                    // Standard value resolution
                    const result = await resolveMappedValue(colDef.mapping, gridRow, globalStore, apiCache, rowContext, executionLog, warnings, colDef.name, systemSettings);

                    // Add to rowContext so subsequent columns in the grid row can use it
                    rowContext[colDef.name] = result;

                    rowObjects.push({
                        FieldName: colDef.name,
                        Value: result.Value,
                        Text: normalizeControlText(result.Text),
                        DataType: colDef.mapping?.dataType || colDef.dataType || 'String',
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
                        inlineGrids.push({ FieldName: obj.FieldName, WriteMode: obj.WriteMode || 'Append', UniqueColumns: obj.UniqueColumns || [], CaseSensitiveUniqueColumns: obj.CaseSensitiveUniqueColumns || [], Rows: obj.Rows || [] });
                    } else if (obj.Type === 'RelatedGrid') {
                        relatedGrids.push({
                            FieldName: obj.FieldName,
                            ProjectName: obj.ProjectName,
                            FormName: obj.FormName,
                            DocumentIdColumnName: obj.DocumentIdColumnName,
                            WriteMode: obj.WriteMode || 'Append',
                            UniqueColumns: obj.UniqueColumns || [],
                            CaseSensitiveUniqueColumns: obj.CaseSensitiveUniqueColumns || [],
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
                        if (Array.isArray(obj.Items)) {
                            relatedDocsMap[obj.FieldName].Items.push(...obj.Items);
                        } else if (obj.FileSecretKey) {
                            relatedDocsMap[obj.FieldName].Items.push({
                                FileSecretKey: obj.FileSecretKey,
                                Category: obj.Category,
                                Path: obj.Path,
                                FileSize: obj.FileSize
                            });
                        }
                    } else {
                        objects.push({
                            FieldName: obj.FieldName,
                            Value: obj.Value,
                            Text: normalizeControlText(obj.Text),
                            DataType: obj.DataType
                        });
                    }
                });

                const rowResult = gridType === 'RelatedGrid'
                    ? {
                        FormParameters: await resolveParameterDefinitions(mapping.formParams, gridRow, rowContext, 'Parent'),
                        FormFields: {
                            Objects: objects,
                            InlineGrids: inlineGrids,
                            RelatedGrids: relatedGrids,
                            RelatedDocuments: relatedDocs
                        }
                    }
                    : {
                        Objects: objects,
                        InlineGrids: inlineGrids,
                        RelatedGrids: relatedGrids,
                        RelatedDocuments: relatedDocs
                    };
                resolvedRows.push(rowResult);
            }
            return resolvedRows;
        };

        // --- Dependency Graph based Concurrent Object Resolution ---
        const objectDefinitions = definitionData.objects || [];
        const objectDefinitionsByName = new Map(objectDefinitions.map(def => [def.name, def]));
        const getDependencies = (def) => {
            const deps = new Set();
            const mappingStr = JSON.stringify(def.mapping || {});
            const regex = /{{\s*([^{}]+?)\s*}}/g;
            let match;
            while ((match = regex.exec(mappingStr)) !== null) {
                const token = match[1].trim();
                const baseKey = token.split('.')[0];
                // Check if the token baseKey matches any other object's name
                if (objectDefinitionsByName.has(baseKey) && baseKey !== def.name) {
                    deps.add(baseKey);
                }
            }
            return Array.from(deps);
        };

        const dependencyMap = new Map(objectDefinitions.map(def => [def.name, getDependencies(def)]));
        const visitState = new Map();
        const validateDependencyGraph = (objectName, path = []) => {
            const state = visitState.get(objectName);
            if (state === 'visited') return;
            if (state === 'visiting') {
                throw new Error(`Circular object dependency detected: ${[...path, objectName].join(' -> ')}`);
            }

            visitState.set(objectName, 'visiting');
            for (const dependencyName of dependencyMap.get(objectName) || []) {
                validateDependencyGraph(dependencyName, [...path, objectName]);
            }
            visitState.set(objectName, 'visited');
        };
        objectDefinitions.forEach(def => validateDependencyGraph(def.name));

        const objectPromises = {};

        const resolveObjectTask = async (def) => {
            if (objectPromises[def.name]) {
                return objectPromises[def.name];
            }

            const task = Promise.resolve().then(async () => {
                const deps = dependencyMap.get(def.name) || [];
                // Wait for dependencies to finish first
                await Promise.all(deps.map(depName => {
                    const depDef = objectDefinitionsByName.get(depName);
                    return depDef ? resolveObjectTask(depDef) : Promise.resolve();
                }));

                const mapping = def.mapping || {};
                const type = def.type || 'Object';
                let rowObj = null;

                if (type === 'InlineGrid') {
                    const masterCol = mapping.masterKey;
                    if (masterCol) {
                        const masterValue = getRowValue(rowData, masterCol);
                        const resolvedRows = await resolveGridRows(type, mapping, masterValue);
                        rowObj = { FieldName: def.name, Type: 'InlineGrid', WriteMode: mapping.gridWriteMode || 'Append', UniqueColumns: getDuplicateCheckColumns(mapping), CaseSensitiveUniqueColumns: getDuplicateCaseSensitiveColumns(mapping), Rows: resolvedRows };
                    }
                } else if (type === 'RelatedGrid') {
                    const masterCol = mapping.masterKey;
                    if (masterCol) {
                        const masterValue = getRowValue(rowData, masterCol);
                        const resolvedRows = await resolveGridRows(type, mapping, masterValue);
                        rowObj = {
                            FieldName: def.name,
                            Type: 'RelatedGrid',
                            ProjectName: mapping.relatedProjectName,
                            FormName: mapping.relatedFormName,
                            DocumentIdColumnName: mapping.relatedDocIdCol,
                            WriteMode: mapping.gridWriteMode || 'Append',
                            UniqueColumns: getDuplicateCheckColumns(mapping),
                            CaseSensitiveUniqueColumns: getDuplicateCaseSensitiveColumns(mapping),
                            Rows: resolvedRows
                        };
                    }
                } else if (type === 'RelatedDocument') {
                    const pathCol = mapping.pathCol;
                    if (pathCol) {
                        const filePathRaw = String(getRowValue(rowData, pathCol) || '').trim();
                        if (filePathRaw && window.api?.readFileAsBuffer) {
                            let filePaths = [];
                            try {
                                const parsed = JSON.parse(filePathRaw);
                                if (Array.isArray(parsed)) {
                                    filePaths = parsed.map(p => String(p || '').trim()).filter(Boolean);
                                } else {
                                    filePaths = [filePathRaw];
                                }
                            } catch (e) {
                                filePaths = [filePathRaw];
                            }

                            const fileDeployUrl = globalStore.get('deployUrl');
                            if (!fileDeployUrl) throw new Error('Deploy URL not found');
                            const fileBaseUrl = `${fileDeployUrl.replace(/\/$/, '')}/apps/${RELAY_CSP_APP_NAME}/latest/api/Transfer`;
                            const fileHeaders = { 'Content-Type': 'application/json' };
                            const token = globalStore.get('token');
                            const encryptedData = globalStore.get('encryptedData');
                            const userLang = globalStore.get('language') || 'tr-TR';
                            if (token) fileHeaders['Authorization'] = `Bearer ${token}`;
                            if (encryptedData) fileHeaders['bimser-encrypted-data'] = encryptedData;
                            fileHeaders['bimser-language'] = userLang;

                            const resolvedItems = [];
                            for (const filePath of filePaths) {
                                const fileResult = await window.api.readFileAsBuffer(filePath);
                                if (fileResult.success) {
                                    try {
                                        const { targetPath, category } = resolveRelatedDocumentTarget(mapping, rowData, objectContext);
                                        const descriptor = targetPath
                                            ? await uploadFileInParts(
                                                fileBaseUrl,
                                                fileHeaders,
                                                fileResult,
                                                targetPath,
                                                category,
                                                executionLog
                                            )
                                            : fileInfoToRelatedDocumentItem(fileResult, null, category);
                                        resolvedItems.push(descriptor);
                                    } catch (uploadErr) {
                                        const errMsg = `RelatedDocument '${def.name}': upload failed for "${filePath}" - ${uploadErr.message}`;
                                        executionLog.push({
                                            key: `reldoc_upload_err_${Date.now()}_${Math.random()}`,
                                            step: 'RelatedDocument Upload',
                                            details: errMsg,
                                            status: 'Error'
                                        });
                                        throw new Error(errMsg);
                                    }
                                } else {
                                    const errMsg = `RelatedDocument '${def.name}': failed to read file "${filePath}" - ${fileResult.error || 'Unknown error'}`;
                                    executionLog.push({
                                        key: `reldoc_err_${Date.now()}_${Math.random()}`,
                                        step: 'RelatedDocument Read',
                                        details: errMsg,
                                        status: 'Error'
                                    });
                                    throw new Error(errMsg);
                                }
                            }

                            if (resolvedItems.length > 0) {
                                rowObj = {
                                    FieldName: def.name,
                                    Type: 'RelatedDocument',
                                    Items: resolvedItems
                                };
                            }
                        } else if (filePathRaw && !window.api?.readFileAsBuffer) {
                            const errMsg = `RelatedDocument '${def.name}': readFileAsBuffer API not available`;
                            executionLog.push({
                                key: `reldoc_api_err_${Date.now()}_${Math.random()}`,
                                step: 'RelatedDocument Read',
                                details: errMsg,
                                status: 'Error'
                            });
                            throw new Error(errMsg);
                        } else if (!filePathRaw) {
                            console.warn(`[RelatedDocument] No file path in column "${pathCol}" for this row.`);
                        }
                    }
                } else {
                    const result = await resolveMappedValue(mapping, rowData, globalStore, apiCache, objectContext, executionLog, warnings, def.name, systemSettings);
                    objectContext[def.name] = result;
                    rowObj = {
                        FieldName: def.name,
                        Value: result.Value,
                        Text: normalizeControlText(result.Text),
                        DataType: mapping.dataType || 'String',
                        Type: 'Object'
                    };
                }

                return rowObj;
            });

            objectPromises[def.name] = task;
            return objectPromises[def.name];
        };

        // Execute all objects concurrently (dependency graph determines the real execution order)
        const allMappedObjects = await Promise.all(objectDefinitions.map(def => resolveObjectTask(def)));
        mappedObjects.push(...allMappedObjects.filter(Boolean));

        // Resolve Flow & Form Parameters AFTER objects are resolved (so they can access objectContext)
        const resolvedFlowParams = await resolveParameterDefinitions(definitionData.flowParams, rowData, objectContext, 'Current');
        const resolvedFormParams = await resolveParameterDefinitions(definitionData.formParams, rowData, objectContext, 'Current');

        // 2. Construct Payload
        const transactionType = globalStore.get('transactionType') || 'CreateFlow';
        const rawDocumentId = transactionType === 'EditForm'
            ? getRowValue(rowData, definitionData.documentIdColumn)
            : null;
        const documentId = rawDocumentId === null || rawDocumentId === undefined || rawDocumentId === ''
            ? null
            : Number(rawDocumentId);

        if (transactionType === 'EditForm' && (!Number.isSafeInteger(documentId) || documentId < 0)) {
            throw new Error(`Invalid DocumentId in Excel column '${definitionData.documentIdColumn || ''}': ${rawDocumentId ?? '(empty)'}`);
        }
        const config = {
            projectName: globalStore.get('projectName'),
            formName: globalStore.get('formName'),
            documentId,
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

        const postTransferJson = async (endpoint, body, logEntry = null) => {
            const url = `${baseUrl}/${endpoint}`;
            const res = await fetchWithRetry(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });

            const responseBody = res.ok ? await res.json() : await res.text();
            if (logEntry) {
                logEntry.raw = {
                    request: { url, method: 'POST', headers, body },
                    response: responseBody
                };
            }

            if (!res.ok) {
                const err = new Error(`${endpoint} failed (HTTP ${res.status} ${res.statusText})`);
                err.rawResponse = responseBody;
                err.status = res.status;
                err.statusText = res.statusText;
                err.endpoint = endpoint;
                err.url = url;
                throw err;
            }

            return responseBody;
        };

        const needsUniqueGridColumns = usesDuplicateGridPrevention(definitionData.objects || []);
        const needsSessionFileChunks = transactionType === 'CreateFlow' && hasEmbeddedRelatedGridFiles(payload);
        if (needsUniqueGridColumns || needsSessionFileChunks) {
            const capabilityLog = {
                key: `capabilities_${Date.now()}_${Math.random()}`,
                step: 'Relay Capability Check',
                details: 'Checking required relay capabilities',
                status: 'Pending'
            };
            executionLog.push(capabilityLog);

            try {
                const capabilities = await postTransferJson('Capabilities', {}, capabilityLog);
                const supportsUniqueGridColumns = capabilities?.uniqueGridColumns === true || capabilities?.UniqueGridColumns === true;
                const supportsSessionFileChunks = capabilities?.sessionFileChunks === true || capabilities?.SessionFileChunks === true;
                if (needsUniqueGridColumns && !supportsUniqueGridColumns) {
                    const capabilityError = new Error('The deployed relay does not report duplicate grid row support.');
                    capabilityError.relayCapabilityMissing = true;
                    throw capabilityError;
                }
                if (needsSessionFileChunks && !supportsSessionFileChunks) {
                    const capabilityError = new Error('The deployed relay does not report RelatedGrid session file chunk support.');
                    capabilityError.relayCapabilityMissing = true;
                    throw capabilityError;
                }
                capabilityLog.status = 'Success';
                capabilityLog.details = 'Required relay capabilities are active';
            } catch (error) {
                capabilityLog.status = 'Error';
                capabilityLog.details = getRelayCapabilityFailureMessage(error);
                const capabilityError = new Error(capabilityLog.details);
                capabilityError.rawResponse = error.rawResponse;
                capabilityError.status = error.status;
                capabilityError.statusText = error.statusText;
                throw capabilityError;
            }
        }

        const extractRelatedGridJobs = (flowPayload) => {
            if (transactionType !== 'CreateFlow') return { beginPayload: flowPayload, jobs: [] };

            const beginPayload = _.cloneDeep(flowPayload);
            const jobs = [];

            (beginPayload.FlowDocuments || []).forEach(doc => {
                const relatedGrids = doc.FormFields?.RelatedGrids || [];
                relatedGrids.forEach(grid => {
                    if (Array.isArray(grid.Rows) && grid.Rows.length > 0) {
                        jobs.push({
                            documentName: doc.DocumentName,
                            relatedGrid: _.cloneDeep(grid)
                        });
                    }
                });
                doc.FormFields.RelatedGrids = [];
            });

            return { beginPayload, jobs };
        };

        let status = 'Error';
        let msg = '';
        let fullApiResponse = null;
        let responseOk = false;
        let responseStatus = 0;
        let responseStatusText = '';
        let autoPauseTransfer = false;
        const sessionDiagnostics = [];

        const { beginPayload, jobs: relatedGridJobs } = extractRelatedGridJobs(payload);

        if (transactionType === 'CreateFlow' && relatedGridJobs.length > 0) {
            execLog.details = `Session transfer: ${relatedGridJobs.length} RelatedGrid field(s)`;

            const beginLog = { key: `flow_session_begin_${Date.now()}_${Math.random()}`, step: 'BeginFlowSession', details: `Endpoint: BeginFlowSession`, status: 'Pending' };
            executionLog.push(beginLog);
            const beginResponse = await postTransferJson('BeginFlowSession', beginPayload, beginLog);
            beginLog.status = 'Success';
            sessionDiagnostics.push({ step: 'BeginFlowSession', response: beginResponse });

            const sessionId = beginResponse.sessionId || beginResponse.SessionId;
            if (!sessionId) throw new Error('BeginFlowSession response did not include sessionId.');

            for (const job of relatedGridJobs) {
                const rows = job.relatedGrid.Rows || [];
                for (let i = 0; i < rows.length; i += relatedGridChunkSize) {
                    const chunkRows = rows.slice(i, i + relatedGridChunkSize);
                    await stageRelatedGridFilesForSession(baseUrl, headers, sessionId, chunkRows, executionLog);
                    const appendBody = {
                        SessionId: sessionId,
                        DocumentName: job.documentName,
                        RelatedGrid: {
                            ...job.relatedGrid,
                            WriteMode: i === 0 ? (job.relatedGrid.WriteMode || 'Append') : 'Append',
                            Rows: chunkRows
                        }
                    };
                    const appendLog = {
                        key: `flow_session_append_${Date.now()}_${Math.random()}`,
                        step: 'AppendRelatedGridRows',
                        details: `${job.relatedGrid.FieldName}: rows ${i + 1}-${i + chunkRows.length}/${rows.length}`,
                        status: 'Pending'
                    };
                    executionLog.push(appendLog);
                    const appendResponse = await postTransferJson('AppendRelatedGridRows', appendBody, appendLog);
                    appendLog.status = 'Success';
                    sessionDiagnostics.push({ step: 'AppendRelatedGridRows', fieldName: job.relatedGrid.FieldName, rowCount: chunkRows.length, response: appendResponse });
                }
            }

            const finalizeBody = { SessionId: sessionId };
            const finalizeLog = { key: `flow_session_finalize_${Date.now()}_${Math.random()}`, step: 'FinalizeFlowSession', details: `Endpoint: FinalizeFlowSession`, status: 'Pending' };
            executionLog.push(finalizeLog);
            fullApiResponse = await postTransferJson('FinalizeFlowSession', finalizeBody, finalizeLog);
            finalizeLog.status = 'Success';
            sessionDiagnostics.push({ step: 'FinalizeFlowSession', response: fullApiResponse });

            responseOk = true;
            responseStatus = 200;
            responseStatusText = 'OK';
        } else {
            const requestPayload = transactionType === 'CreateFlow' ? beginPayload : payload;
            const response = await fetchWithRetry(`${baseUrl}/${endpointStr}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestPayload)
            });

            responseOk = response.ok;
            responseStatus = response.status;
            responseStatusText = response.statusText;

            if (response.ok) {
                fullApiResponse = await response.json();
            } else {
                fullApiResponse = await response.text();
            }
        }

        msg = `HTTP ${responseStatus} ${responseStatusText}`;

        if (responseOk) {

            // Check for CSP Validation Errors (Even if HTTP 200)
            let hasValidationErrors = false;
            const validationEntries = [];
            const pushValidationEntry = (message, source = 'Main Form') => {
                if (!message) return;
                validationEntries.push({ message, source });
            };

            const saveResp = fullApiResponse.saveResponse || fullApiResponse;
            if (saveResp) {
                if (saveResp.actionResult === false) hasValidationErrors = true;

                if (Array.isArray(saveResp.validationErrors) && saveResp.validationErrors.length > 0) {
                    hasValidationErrors = true;
                    saveResp.validationErrors.forEach(err => pushValidationEntry(err.message, 'Main Form'));
                }

                if (saveResp.result && Array.isArray(saveResp.result.validationErrors) && saveResp.result.validationErrors.length > 0) {
                    hasValidationErrors = true;
                    saveResp.result.validationErrors.forEach(err => pushValidationEntry(err.message, 'Main Form'));
                }

                if (Array.isArray(saveResp.forms)) {
                    saveResp.forms.forEach((f, index) => {
                        const source = f.formName || f.FormName || f.name || f.Name || f.documentName || f.DocumentName || `Form ${index + 1}`;
                        const vErrors = f.formSaveResponse?.result?.validationErrors;
                        if (Array.isArray(vErrors) && vErrors.length > 0) {
                            hasValidationErrors = true;
                            vErrors.forEach(err => pushValidationEntry(err.message, source));
                        }
                    });
                }
            }

            if (hasValidationErrors) {
                status = 'ValidationError';
                const uniqueMsgs = [...new Set(validationEntries.map(entry => entry.message))];
                const validationSources = [...new Set(validationEntries.map(entry => entry.source))];
                const sourceLabel = validationSources.length === 1 ? validationSources[0] : 'Form';
                execLog.status = 'Error';
                msg = uniqueMsgs.length > 0 ? `* ${uniqueMsgs.join('\n* ')}` : 'Validation Failed';
                execLog.details = `${sourceLabel} validation failed`;
                const finalizeLog = executionLog.find(log => log.step === 'FinalizeFlowSession');
                if (finalizeLog) {
                    finalizeLog.status = 'Error';
                    finalizeLog.details = `Endpoint: FinalizeFlowSession - ${sourceLabel} validation failed`;
                }
            } else {
                status = 'Success';
                execLog.status = 'Success';
                if (transactionType === 'CreateForm') msg = 'Form Created';
                else if (transactionType === 'EditForm') msg = 'Form Updated';
                else msg = 'Flow Created';
            }
        } else {
            execLog.status = 'Error';
            execLog.details += ' - HTTP Failed';
            msg = getHttpStatusMessage(responseStatus) || msg;
            autoPauseTransfer = isConnectivityFailureStatus(responseStatus);
        }

        // Capture raw diagnostics for the final execution step
        execLog.raw = {
            request: {
                url: `${baseUrl}/${endpointStr}`,
                method: 'POST',
                headers,
                body: transactionType === 'CreateFlow' && relatedGridJobs.length > 0 ? beginPayload : payload,
                sessionDiagnostics
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
            warnings,
            autoPauseTransfer
        };

    } catch (networkError) {
        if (executionLog.length > 0 && executionLog[executionLog.length - 1].status === 'Pending') {
            executionLog[executionLog.length - 1].status = 'Error';
        }
        return {
            status: networkError.isValidationError ? 'ValidationError' : 'Error',
            message: getTransferFailureMessage(networkError),
            payload,
            response: networkError.rawResponse || null,
            executionLog,
            warnings,
            autoPauseTransfer: isConnectivityFailure(networkError)
        };
    }
};

