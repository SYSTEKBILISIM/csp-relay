const hasMappedValue = value => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.length > 0 && value.every(hasMappedValue);
    return true;
};

export const getRequiredMappingError = (mapping, result, fieldName) => {
    if (mapping?.requiredValue !== true || hasMappedValue(result?.Value)) return null;

    const source = mapping.source === 'API' ? 'API lookup did not produce a match/value' : 'mapped source is empty';
    return `Required field '${fieldName}' is missing: ${source}. Transfer was not submitted.`;
};
