const MAX_STRING_LENGTH = 64 * 1024
const MAX_ARRAY_ITEMS = 200
const PREVIEW_ARRAY_ITEMS = 20
const BINARY_KEYS = new Set(['data', 'buffer', 'bytes', 'base64', 'filecontent', 'contentbytes'])
const SECRET_KEYS = new Set(['authorization', 'bimser-encrypted-data'])

const getParentMetadata = parent => ({
    name: parent?.name ?? parent?.Name ?? parent?.fileName ?? parent?.FileName,
    path: parent?.path ?? parent?.Path ?? parent?.filePath ?? parent?.FilePath,
    dataLength: parent?.dataLength ?? parent?.DataLength ?? parent?.size ?? parent?.Size
})

export const optimizeLogValue = (value, key = '', parent = null, ancestors = new WeakSet()) => {
    const normalizedKey = String(key).toLowerCase()

    if (SECRET_KEYS.has(normalizedKey) && value) return '[REDACTED]'

    if (typeof value === 'string') {
        if (BINARY_KEYS.has(normalizedKey) && value.length > 512) {
            return {
                omitted: true,
                type: 'binary-string',
                encodedLength: value.length,
                ...getParentMetadata(parent)
            }
        }
        if (value.length > MAX_STRING_LENGTH) {
            return `${value.slice(0, MAX_STRING_LENGTH)}\n...[TRUNCATED ${value.length - MAX_STRING_LENGTH} CHARACTERS; ORIGINAL LENGTH ${value.length}]`
        }
        return value
    }

    if (value === null || value === undefined || typeof value !== 'object') return value
    if (ancestors.has(value)) return '[CIRCULAR]'
    ancestors.add(value)

    let result
    if (Array.isArray(value)) {
        if (BINARY_KEYS.has(normalizedKey) && value.length > 256) {
            result = {
                omitted: true,
                type: 'byte-array',
                dataLength: value.length,
                ...getParentMetadata(parent)
            }
        } else if (value.length > MAX_ARRAY_ITEMS) {
            result = {
                omitted: true,
                type: 'large-array',
                itemCount: value.length,
                preview: value.slice(0, PREVIEW_ARRAY_ITEMS).map(item => optimizeLogValue(item, '', null, ancestors))
            }
        } else {
            result = value.map(item => optimizeLogValue(item, '', null, ancestors))
        }
    } else {
        result = {}
        for (const [childKey, childValue] of Object.entries(value)) {
            result[childKey] = optimizeLogValue(childValue, childKey, value, ancestors)
        }
    }

    ancestors.delete(value)
    return result
}
