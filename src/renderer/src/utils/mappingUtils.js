export const extractTokens = (text) => {
    if (!text) return [];
    const regex = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
    const tokens = new Set();
    let match;
    while ((match = regex.exec(text)) !== null) {
        tokens.add(match[1]);
    }
    return Array.from(tokens);
};
