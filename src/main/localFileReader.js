import { open, stat } from 'fs/promises'
import { basename, extname } from 'path'
import mime from 'mime-types'

const MAX_CHUNK_BYTES = 3 * 1024 * 1024

export const getLocalFileInfo = async filePath => {
    const fileStats = await stat(filePath)
    if (!fileStats.isFile()) {
        throw new Error('The selected path is not a file.')
    }
    return {
        filePath,
        name: basename(filePath),
        extension: extname(filePath),
        contentType: mime.lookup(filePath) || 'application/octet-stream',
        size: fileStats.size
    }
}

export const readLocalFileChunkBase64 = async (filePath, byteOffset = 0, byteLength = MAX_CHUNK_BYTES) => {
    const fileStats = await stat(filePath)
    const safeOffset = Math.max(0, Number(byteOffset) || 0)
    const safeLength = Math.min(
        MAX_CHUNK_BYTES,
        Math.max(1, Number(byteLength) || MAX_CHUNK_BYTES),
        Math.max(0, fileStats.size - safeOffset)
    )
    if (safeLength === 0) {
        return {
            data: '',
            byteOffset: safeOffset,
            nextByteOffset: safeOffset,
            bytesRead: 0,
            totalBytes: fileStats.size,
            done: true
        }
    }

    const handle = await open(filePath, 'r')
    try {
        const buffer = Buffer.allocUnsafe(safeLength)
        const { bytesRead } = await handle.read(buffer, 0, safeLength, safeOffset)
        const nextByteOffset = safeOffset + bytesRead
        return {
            data: buffer.subarray(0, bytesRead).toString('base64'),
            byteOffset: safeOffset,
            nextByteOffset,
            bytesRead,
            totalBytes: fileStats.size,
            done: nextByteOffset >= fileStats.size
        }
    } finally {
        await handle.close()
    }
}
