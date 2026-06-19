/**
 * Normalizes a string for comparison (Turkish-aware).
 */
export const normalizeString = (str) => {
    if (!str) return '';

    // Turkish character map for folding to standard Latin equivalents
    const charMap = {
        'ı': 'i', 'I': 'i', 'İ': 'i', 'i': 'i',
        'ş': 's', 'Ş': 's',
        'ğ': 'g', 'Ğ': 'g',
        'ç': 'c', 'Ç': 'c',
        'ö': 'o', 'Ö': 'o',
        'ü': 'u', 'Ü': 'u'
    };

    return String(str)
        .trim()
        .toLocaleLowerCase('tr-TR') // Crucial for Turkish I/i folding
        .replace(/[ıİşŞğĞçÇöÖüÜ]/g, match => charMap[match] || match)
        .replace(/[^a-z0-9]/g, '') // Remove symbols for maximum match capability
        .replace(/\s+/g, '')
        .trim();
};

/**
 * Calculates similarity between two strings (0 to 1).
 * Uses Levenshtein distance for structural similarity.
 */
export const calculateSimilarity = (str1, str2) => {
    if (!str1 || !str2) return 0;

    // Quick check
    if (str1 === str2) return 1;

    const s1 = normalizeString(str1);
    const s2 = normalizeString(str2);

    if (s1 === s2) return 1;
    if (!s1 || !s2) return 0;

    // --- Substring Bonus ---
    // If one is a significant part of the other, give very high score
    if (s1.length > 3 && s2.length > 3) {
        if (s1.includes(s2) || s2.includes(s1)) {
            return 0.95;
        }
    }

    // --- Levenshtein Distance ---
    const len1 = s1.length;
    const len2 = s2.length;
    const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));

    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;

    for (let j = 1; j <= len2; j++) {
        for (let i = 1; i <= len1; i++) {
            const substitutionCost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,      // insertion
                matrix[j - 1][i] + 1,      // deletion
                matrix[j - 1][i - 1] + substitutionCost // substitution
            );
        }
    }

    const distance = matrix[len2][len1];
    const maxLen = Math.max(len1, len2);
    return (maxLen - distance) / maxLen;
};

/**
 * Finds the corresponding key in rowData, supporting Turkish-aware case-insensitive
 * and fuzzy normalized matching.
 * @param {object} rowData 
 * @param {string} targetKey 
 * @returns {string|null}
 */
export const findRowDataKey = (rowData, targetKey) => {
    if (!rowData || !targetKey) return null;
    
    // 1. Try exact match
    if (rowData[targetKey] !== undefined) return targetKey;

    const trimmedTarget = String(targetKey).trim();
    if (rowData[trimmedTarget] !== undefined) return trimmedTarget;

    // 2. Try case-insensitive matching (Turkish-aware)
    const lowerTarget = trimmedTarget.toLocaleLowerCase('tr-TR');
    const keys = Object.keys(rowData);
    for (const key of keys) {
        if (String(key).trim().toLocaleLowerCase('tr-TR') === lowerTarget) {
            return key;
        }
    }

    // 3. Try normalized matching (ignoring punctuation, spaces, and folding Turkish characters)
    const normalizedTarget = normalizeString(trimmedTarget);
    if (normalizedTarget) {
        for (const key of keys) {
            if (normalizeString(key) === normalizedTarget) {
                return key;
            }
        }
    }

    return null;
};

/**
 * Safely gets a value from rowData, supporting Turkish-aware fuzzy matching for column keys.
 * @param {object} rowData 
 * @param {string} targetKey 
 * @returns {any}
 */
export const getRowValue = (rowData, targetKey) => {
    if (!rowData || !targetKey) return undefined;
    const resolvedKey = findRowDataKey(rowData, targetKey);
    return resolvedKey ? rowData[resolvedKey] : undefined;
};

/**
 * Replaces {{token}} placeholders in a template string with values from rowData or context.
 * @param {string} template 
 * @param {object} rowData - Excel row data
 * @param {object} processedObjects - Context from previously mapped objects
 * @returns {string}
 */
export const resolveTokens = (template, rowData, processedObjects) => {
    if (!template || typeof template !== 'string') return '';
    return template.replace(/{{\s*([^{}]+?)\s*}}/g, (match, rawToken) => {
        const token = rawToken.trim();

        // Priority 0: Fuzzy / Exact match in Row Data (handles keys with dots like "VD." or "T.C." and Turkish characters)
        if (rowData) {
            const val = getRowValue(rowData, token);
            if (val !== undefined) {
                return val;
            }
        }

        const parts = token.split('.');
        const baseKey = parts[0];
        const subKey = parts.length > 1 ? parts[1] : null;

        // Priority 1: Context (Previous mapped objects)
        if (processedObjects && processedObjects[baseKey] !== undefined) {
            const val = processedObjects[baseKey];
            if (typeof val === 'object' && val !== null) {
                // If a specific sub-property like .Value or .Text is requested
                if (subKey && val[subKey] !== undefined) {
                    return val[subKey];
                }
                // Fallback to .Value if it's an object and no specific property was given
                return val.Value !== undefined ? val.Value : '';
            }
            return val;
        }

        // Priority 2: Row Data (Excel columns)
        if (rowData) {
            const val = getRowValue(rowData, baseKey);
            if (val !== undefined) {
                return val;
            }
        }

        return ''; // Unresolved token
    });
};

/**
 * Parses a value into a Date object handling various inputs.
 * Supports:
 * - JS Date objects
 * - Strings: "DD.MM.YYYY", "DD/MM/YYYY", "DD-MM-YYYY"
 * - Excel Serial Numbers (Numbers)
 * @param {any} rawVal 
 * @returns {Date|null}
 */
export const parseValueToDate = (rawVal) => {
    if (rawVal === undefined || rawVal === null) return null;

    let dateObj = null;

    // 1. Existing Date
    if (rawVal instanceof Date && !isNaN(rawVal)) {
        dateObj = rawVal;
    }
    // 2. String Parsing
    else if (typeof rawVal === 'string') {
        const dmyMatch = rawVal.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
        if (dmyMatch) {
            const d = parseInt(dmyMatch[1], 10);
            const m = parseInt(dmyMatch[2], 10) - 1;
            const y = parseInt(dmyMatch[3], 10);
            dateObj = new Date(y, m, d);
        } else {
            const parsed = new Date(rawVal);
            if (!isNaN(parsed)) dateObj = parsed;
        }
    }
    // 3. Excel Serial Number
    else if (typeof rawVal === 'number') {
        const dateCode = rawVal;
        const utcDate = new Date(Math.round((dateCode - 25569) * 86400 * 1000));

        // Convert UTC midnight to Local Midnight
        dateObj = new Date(
            utcDate.getUTCFullYear(),
            utcDate.getUTCMonth(),
            utcDate.getUTCDate()
        );
    }

    if (dateObj && !isNaN(dateObj)) return dateObj;
    return null;
};

/**
 * Formats a Date object to "YYYY-MM-DDTHH:mm:ss" string (Local time).
 * @param {Date} dateObj 
 * @returns {string}
 */
export const formatDateToISO = (dateObj) => {
    if (!dateObj) return '';
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const mm = String(dateObj.getMinutes()).padStart(2, '0');
    const ss = String(dateObj.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
};

/**
 * Resolves a primitive value based on Data Type.
 * @param {any} rawVal 
 * @param {string} dataType 
 * @returns {any}
 */
export const resolvePrimitiveValue = (rawVal, dataType, mapping = {}) => {
    if (rawVal === undefined || rawVal === null) {
        if (dataType === 'Boolean') {
            if (mapping.nonEmptyIsTrue) return false;
            if (mapping.emptyIsFalse) return false;
            return null;
        }
        return null;
    }
    switch (dataType) {
        case 'Date':
            const dateObj = parseValueToDate(rawVal);
            return dateObj ? formatDateToISO(dateObj) : rawVal;
        case 'Integer':
            const i = parseInt(rawVal, 10);
            return isNaN(i) ? null : i;
        case 'Decimal':
            const f = parseFloat(rawVal);
            return isNaN(f) ? null : f;
        case 'Boolean':
            const strVal = String(rawVal).trim().toLowerCase();

            if (mapping.nonEmptyIsTrue) {
                return strVal !== '';
            }

            if (strVal === '') {
                if (mapping.emptyIsFalse) return false;
                return null;
            }

            let customTrue = [];
            if (mapping.trueValues && typeof mapping.trueValues === 'string') {
                customTrue = mapping.trueValues.split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
            }

            if (customTrue.includes(strVal)) {
                return true;
            }

            if (mapping.otherValuesAreFalse) {
                return false;
            }

            let customFalse = [];
            if (mapping.falseValues && typeof mapping.falseValues === 'string') {
                customFalse = mapping.falseValues.split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
            }

            if (customFalse.includes(strVal)) {
                return false;
            }

            return null;
        default: // String
            return String(rawVal);
    }
};
