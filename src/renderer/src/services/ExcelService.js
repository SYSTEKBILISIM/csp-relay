import { read, utils } from 'xlsx';

const parseWorkbookData = data => {
    const workbook = read(data, { type: 'array' });
    const sheets = workbook.SheetNames;
    const sheetColumns = {};
    const fileContent = {};

    sheets.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const headers = utils.sheet_to_json(worksheet, { header: 1 })[0] || [];
        sheetColumns[sheetName] = headers;
        fileContent[sheetName] = utils.sheet_to_json(worksheet, { cellDates: true, defval: '' });
    });

    return { sheets, sheetColumns, fileContent };
};

/**
 * Parses an Excel file and returns sheets and content.
 * @param {File|Blob} file 
 * @returns {Promise<{sheets: string[], sheetColumns: object, fileContent: object}>}
 */
export const parseExcelFile = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                resolve(parseWorkbookData(data));
            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
};

export const parseExcelFilePath = async filePath => {
    if (!window.api?.readFileBytes) {
        throw new Error('Local Excel file reader is unavailable.');
    }
    const result = await window.api.readFileBytes(filePath);
    if (!result?.success) {
        throw new Error(result?.error || `Excel source could not be read: ${filePath}`);
    }
    return parseWorkbookData(new Uint8Array(result.data));
};
