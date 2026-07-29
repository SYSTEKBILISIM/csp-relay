export const parseRowSelectionExpression = (expression, rowCount) => {
    const value = String(expression || '').trim();
    if (!value) {
        throw new Error('Enter at least one row number or range.');
    }

    const tokens = value.split(',').map(token => token.trim());
    if (tokens.some(token => !token)) {
        throw new Error('Separate row numbers and ranges with commas.');
    }

    const rows = new Set();

    for (const token of tokens) {
        const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token);
        if (!match) {
            throw new Error(`"${token}" is not a valid row number or range.`);
        }

        const start = Number(match[1]);
        const end = match[2] ? Number(match[2]) : start;

        if (start < 1 || end < 1 || start > rowCount || end > rowCount) {
            throw new Error(`Rows must be between 1 and ${rowCount}.`);
        }
        if (start > end) {
            throw new Error(`Range "${token}" must start with the smaller row number.`);
        }

        for (let row = start; row <= end; row += 1) {
            rows.add(row);
        }
    }

    return [...rows].sort((left, right) => left - right);
};
