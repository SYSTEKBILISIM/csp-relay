import { read, utils } from 'xlsx';

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
                const workbook = read(data, { type: 'array' });

                const sheets = workbook.SheetNames;
                const sheetColumns = {};
                const fileContent = {};

                sheets.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];

                    // 1. Get headers (Row 1)
                    const headers = utils.sheet_to_json(worksheet, { header: 1 })[0] || [];
                    sheetColumns[sheetName] = headers;

                    // 2. Get full content
                    // cellDates: true -> Parsing 36683 as JS Date
                    // defval: '' -> Empty cells as empty strings
                    const rawData = utils.sheet_to_json(worksheet, { cellDates: true, defval: '' });

                    // Store Raw Data (Dates are Objects)
                    fileContent[sheetName] = rawData;
                });

                resolve({
                    sheets,
                    sheetColumns,
                    fileContent
                });

            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
};
