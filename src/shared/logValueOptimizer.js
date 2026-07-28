const MAX_STRING_LENGTH = 64 * 1024
const MAX_VERBOSE_ERROR_LENGTH = 8 * 1024
const MAX_RAW_RESPONSE_LENGTH = 32 * 1024
const MAX_FINAL_RESPONSE_LENGTH = 64 * 1024
const RESPONSE_PREVIEW_LENGTH = 8 * 1024
const MAX_ARRAY_ITEMS = 200
const PREVIEW_ARRAY_ITEMS = 20
const BINARY_KEYS = new Set(['data', 'buffer', 'bytes', 'base64', 'filecontent', 'contentbytes'])
const SECRET_KEYS = new Set(['authorization', 'bimser-encrypted-data'])
const VERBOSE_ERROR_KEYS = new Set(['stacktracestring', 'remotestacktracestring', 'externalexception'])

const getParentMetadata = parent => ({
    name: parent?.name ?? parent?.Name ?? parent?.fileName ?? parent?.FileName,
    path: parent?.path ?? parent?.Path ?? parent?.filePath ?? parent?.FilePath,
    dataLength: parent?.dataLength ?? parent?.DataLength ?? parent?.size ?? parent?.Size
})

export const optimizeLogValue = (value, key = '', parent = null, ancestors = new WeakSet()) => {
    const normalizedKey = String(key).toLowerCase()

    if (SECRET_KEYS.has(normalizedKey) && value) return '[REDACTED]'

    if (typeof value === 'string') {
        const stringLimit = VERBOSE_ERROR_KEYS.has(normalizedKey)
            ? MAX_VERBOSE_ERROR_LENGTH
            : MAX_STRING_LENGTH
        if (BINARY_KEYS.has(normalizedKey) && value.length > 512) {
            return {
                omitted: true,
                type: 'binary-string',
                encodedLength: value.length,
                ...getParentMetadata(parent)
            }
        }
        if (value.length > stringLimit) {
            return `${value.slice(0, stringLimit)}\n...[TRUNCATED ${value.length - stringLimit} CHARACTERS; ORIGINAL LENGTH ${value.length}]`
        }
        return value
    }

    if (value === null || value === undefined || typeof value !== 'object') return value

    if (normalizedKey === 'pages' && Array.isArray(value)) {
        return {
            omitted: true,
            type: 'api-page-details',
            pageCount: value.length,
            preview: value.slice(0, PREVIEW_ARRAY_ITEMS).map(page => ({
                pagination: page?.pagination,
                count: page?.count
            }))
        }
    }

    if (normalizedKey === 'response') {
        try {
            const serialized = JSON.stringify(value)
            const isRawResponse = parent && Object.prototype.hasOwnProperty.call(parent, 'request')
            const responseLimit = isRawResponse ? MAX_RAW_RESPONSE_LENGTH : MAX_FINAL_RESPONSE_LENGTH
            if (serialized.length > responseLimit) {
                return {
                    omitted: true,
                    type: isRawResponse ? 'large-raw-response' : 'large-response',
                    originalLength: serialized.length,
                    preview: serialized.slice(0, RESPONSE_PREVIEW_LENGTH)
                }
            }
        } catch {
            // Continue with the normal circular-safe traversal.
        }
    }

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
