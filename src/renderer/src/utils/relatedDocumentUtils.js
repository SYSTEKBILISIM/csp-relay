import { getRowValue } from './transferUtils.js';

export const parseRelatedDocumentPaths = rawValue => {
    const rawPath = String(rawValue || '').trim();
    if (!rawPath) return [];

    try {
        const parsed = JSON.parse(rawPath);
        if (Array.isArray(parsed)) {
            return parsed.map(path => String(path || '').trim()).filter(Boolean);
        }
    } catch {
        // A plain file path is the common case and is not JSON.
    }

    return [rawPath];
};

export const getRelatedDocumentSourceRows = (mapping, mainRow, definitionData, allSheetsData) => {
    if (mapping.relatedDocumentSource !== 'RelatedSheet') {
        return [mainRow];
    }

    const relatedSheet = mapping.relatedSheet;
    const masterKey = mapping.masterKey || definitionData.mainIdColumn;
    const detailKey = mapping.detailKey;
    if (!relatedSheet || !masterKey || !detailKey) {
        throw new Error('RelatedDocument related-sheet mapping requires a sheet, main ID column, and parent ID column.');
    }

    const relatedRows = allSheetsData?.[relatedSheet];
    if (!Array.isArray(relatedRows)) {
        throw new Error(`RelatedDocument sheet '${relatedSheet}' was not found in the selected Excel file.`);
    }

    const masterValue = getRowValue(mainRow, masterKey);
    if (masterValue === null || masterValue === undefined || String(masterValue).trim() === '') {
        return [];
    }

    return relatedRows.filter(relatedRow => {
        const detailValue = getRowValue(relatedRow, detailKey);
        return detailValue !== null
            && detailValue !== undefined
            && String(detailValue).trim() !== ''
            && String(detailValue).trim() === String(masterValue).trim();
    });
};
