import { createReadStream, createWriteStream } from 'fs'
import { appendFile, mkdir, open, readFile, readdir, rm, stat, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { createInterface } from 'readline'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import { optimizeLogValue } from '../shared/logValueOptimizer'

export { optimizeLogValue } from '../shared/logValueOptimizer'

const LEGACY_ACTIVE_FILE_NAME = 'active-transfer-log.jsonl'
const LEGACY_PREVIOUS_FILE_NAME = 'last-transfer-log.jsonl'
const SESSION_FILE_PREFIX = 'active-transfer-log_'
const RECOVERY_CONTEXT_SUFFIX = '.context.json'
const RECOVERY_ASSET_SUFFIX = '.recovery'
const RECOVERY_SECRET_KEYS = new Set(['password', 'token', 'encrypteddata', 'authorization'])
const RECOVERY_SOURCE_DATA_KEYS = new Set([
    'excelcontent',
    'filecontent',
    'allsheetsdata',
    'sheetcolumns',
    'excelcolumns',
    'sheets'
])

const getRecoveryContextPath = filePath => filePath.replace(/\.jsonl$/i, RECOVERY_CONTEXT_SUFFIX)
const getRecoveryAssetDirectory = filePath => filePath.replace(/\.jsonl$/i, RECOVERY_ASSET_SUFFIX)

const pathIsType = async (filePath, type) => {
    try {
        const fileStats = await stat(filePath)
        return type === 'directory' ? fileStats.isDirectory() : fileStats.isFile()
    } catch {
        return false
    }
}

const resolveRecoveryAssetPath = (filePath, relativePath) => {
    const root = resolve(getRecoveryAssetDirectory(filePath))
    const target = resolve(root, String(relativePath || ''))
    const pathFromRoot = relative(root, target)
    if (!pathFromRoot || pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
        throw new Error('Invalid recovery binary reference.')
    }
    return target
}

const optimizeDefinition = definition => Object.fromEntries(
    Object.entries(definition || {})
        .filter(([key]) => !RECOVERY_SOURCE_DATA_KEYS.has(String(key).toLowerCase()))
        .map(([key, value]) => [
            key,
            RECOVERY_SECRET_KEYS.has(String(key).toLowerCase())
                ? '[REDACTED]'
                : Array.isArray(value)
                ? value.map(item => optimizeLogValue(item))
                : optimizeLogValue(value, key, definition)
        ])
)

const sanitizeFilePart = (value, fallback) => {
    const sanitized = String(value || fallback)
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/[. ]+$/g, '')
        .slice(0, 60)
    return sanitized || fallback
}

const getTargetDescriptor = metadata => {
    const transactionType = String(metadata?.transactionType || '').toLocaleLowerCase('en-US')
    if (transactionType.includes('flow') || (!metadata?.formName && metadata?.flowName)) {
        return `Flow-${sanitizeFilePart(metadata?.flowName, 'Unknown')}`
    }
    if (transactionType.includes('form') || metadata?.formName) {
        return `Form-${sanitizeFilePart(metadata?.formName, 'Unknown')}`
    }
    return sanitizeFilePart(metadata?.transactionType, 'Transfer')
}

export class TransferLogStore {
    constructor(baseDirectory) {
        this.preferredDirectory = join(baseDirectory, 'logs')
        this.directory = this.preferredDirectory
        this.filePath = join(this.directory, LEGACY_ACTIVE_FILE_NAME)
        this.index = new Map()
        this.byteOffset = 0
        this.writeQueue = Promise.resolve()
        this.scanCache = new Map()
        this.recoveryAssetBatches = new Map()
    }

    async ensureDirectory(fallbackDirectory) {
        try {
            await mkdir(this.preferredDirectory, { recursive: true })
            const probe = await open(join(this.preferredDirectory, 'active-transfer-log.jsonl'), 'a')
            await probe.close()
            this.directory = this.preferredDirectory
        } catch (error) {
            this.directory = join(fallbackDirectory, 'logs')
            await mkdir(this.directory, { recursive: true })
            const probe = await open(join(this.directory, 'active-transfer-log.jsonl'), 'a')
            await probe.close()
        }
        const legacyEntries = await readdir(this.directory, { withFileTypes: true })
        await Promise.all(legacyEntries
            .filter(entry => entry.isDirectory() && entry.name.endsWith(RECOVERY_ASSET_SUFFIX))
            .map(entry => rm(join(this.directory, entry.name), { recursive: true, force: true })))
        this.filePath = join(this.directory, LEGACY_ACTIVE_FILE_NAME)
        const scan = await this.scanFile(this.filePath)
        this.index = new Map([...scan.records].map(([key, value]) => [key, value.location]))
        this.recoveryAssetBatches = new Map(
            [...scan.records]
                .filter(([, value]) => value.record.recoveryAssets?.batchId)
                .map(([key, value]) => [key, value.record.recoveryAssets.batchId])
        )
        this.byteOffset = scan.size
        return this.filePath
    }

    reset(metadata = {}) {
        this.writeQueue = this.writeQueue.then(async () => {
            const sessionId = randomUUID()
            const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
            const projectName = sanitizeFilePart(metadata.projectName, 'Unnamed_Project')
            const targetDescriptor = getTargetDescriptor(metadata)
            const fileName = `${SESSION_FILE_PREFIX}${projectName}_${targetDescriptor}_${timestamp}_${sessionId.slice(0, 8)}.jsonl`
            this.filePath = join(this.directory, fileName)

            const optimizedMetadata = optimizeLogValue({
                ...metadata,
                logSessionId: sessionId,
                logFileName: fileName
            })
            const metadataLine = Object.keys(optimizedMetadata).length > 0
                ? `${JSON.stringify({
                    recordType: 'transfer-metadata',
                    metadata: optimizedMetadata
                })}\n`
                : ''
            await writeFile(this.filePath, metadataLine, 'utf8')
            this.scanCache.delete(this.filePath)
            this.index.clear()
            this.recoveryAssetBatches.clear()
            this.byteOffset = Buffer.byteLength(metadataLine)
        })
        return this.writeQueue.then(() => ({
            success: true,
            filePath: this.filePath,
            sessionId: basename(this.filePath)
        }))
    }

    saveContext(context = {}) {
        this.writeQueue = this.writeQueue.then(async () => {
            const recoveryContext = {
                version: 1,
                savedAt: new Date().toISOString(),
                mainUrl: typeof context.mainUrl === 'string' ? context.mainUrl : undefined,
                definitionData: optimizeDefinition(context.definitionData),
                excelSourcePath: typeof context.excelSourcePath === 'string'
                    ? context.excelSourcePath
                    : undefined,
                selectedRowKeys: Array.isArray(context.selectedRowKeys)
                    ? context.selectedRowKeys
                    : []
            }
            await writeFile(
                getRecoveryContextPath(this.filePath),
                JSON.stringify(recoveryContext),
                'utf8'
            )
            return {
                success: true,
                contextFilePath: getRecoveryContextPath(this.filePath)
            }
        })
        return this.writeQueue
    }

    async readContext(filePath) {
        try {
            return JSON.parse(await readFile(getRecoveryContextPath(filePath), 'utf8'))
        } catch {
            return null
        }
    }

    async readMetadataHeader(filePath) {
        let handle
        try {
            handle = await open(filePath, 'r')
            const buffer = Buffer.alloc(64 * 1024)
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
            const firstLine = buffer.subarray(0, bytesRead).toString('utf8').split(/\r?\n/, 1)[0]
            if (!firstLine) return {}
            const record = JSON.parse(firstLine)
            return record.recordType === 'transfer-metadata' && record.metadata && typeof record.metadata === 'object'
                ? record.metadata
                : {}
        } catch {
            return {}
        } finally {
            await handle?.close()
        }
    }

    async scanFile(filePath) {
        let fileStats
        try {
            fileStats = await stat(filePath)
        } catch {
            return { filePath, size: 0, modifiedAt: null, invalidLineCount: 0, metadata: {}, records: new Map() }
        }
        const cached = this.scanCache.get(filePath)
        if (cached && cached.size === fileStats.size && cached.modifiedAtMs === fileStats.mtimeMs) {
            return cached.scan
        }

        const records = new Map()
        let metadata = {}
        const input = createInterface({
            input: createReadStream(filePath, { encoding: 'utf8' }),
            crlfDelay: Infinity
        })
        let currentOffset = 0
        let invalidLineCount = 0

        for await (const line of input) {
            const contentLength = Buffer.byteLength(line)
            const lineLength = contentLength + (currentOffset + contentLength < fileStats.size ? 1 : 0)
            if (line) {
                try {
                    const record = JSON.parse(line)
                    if (record.recordType === 'transfer-metadata' && record.metadata && typeof record.metadata === 'object') {
                        metadata = record.metadata
                    } else if (record.key !== undefined && record.key !== null) {
                        const { details, ...summary } = record
                        records.set(String(record.key), {
                            location: { offset: currentOffset, length: lineLength },
                            record: {
                                ...summary,
                                hasDetails: Boolean(details)
                            }
                        })
                    }
                } catch {
                    // A power/network interruption can leave the last JSONL line incomplete.
                    // Keep every valid record and report the skipped line to the viewer.
                    invalidLineCount += 1
                }
            }
            currentOffset += lineLength
        }

        const scan = {
            filePath,
            size: fileStats.size,
            modifiedAt: fileStats.mtime.toISOString(),
            invalidLineCount,
            metadata,
            records
        }
        this.scanCache.set(filePath, {
            size: fileStats.size,
            modifiedAtMs: fileStats.mtimeMs,
            scan
        })
        return scan
    }

    async listRecoverable() {
        await this.writeQueue
        const entries = await readdir(this.directory, { withFileTypes: true })
        const candidates = entries
            .filter(entry => entry.isFile() && (
                entry.name === LEGACY_ACTIVE_FILE_NAME ||
                entry.name === LEGACY_PREVIOUS_FILE_NAME ||
                (entry.name.startsWith(SESSION_FILE_PREFIX) && entry.name.endsWith('.jsonl'))
            ))
            .map(entry => ({
                id: entry.name,
                filePath: join(this.directory, entry.name)
            }))
        const sessions = await Promise.all(candidates.map(async candidate => {
            const fileStats = await stat(candidate.filePath)
            if (fileStats.size === 0) return null

            const cachedScan = this.scanCache.get(candidate.filePath)?.scan
            const isCurrentSession = candidate.filePath === this.filePath
            const metadata = cachedScan?.metadata || await this.readMetadataHeader(candidate.filePath)
            const metadataRowCount = Number(metadata.totalRows)
            const recordCount = cachedScan?.records.size ??
                (isCurrentSession
                    ? this.index.size
                    : Number.isFinite(metadataRowCount) && metadataRowCount >= 0
                        ? metadataRowCount
                        : null)
            const recoveryAssetDirectoryAvailable = await pathIsType(
                getRecoveryAssetDirectory(candidate.filePath),
                'directory'
            )
            const hasRecoveryContext = await pathIsType(getRecoveryContextPath(candidate.filePath), 'file')
            const recoveryAssetRecordCount = cachedScan
                ? [...cachedScan.records.values()]
                    .filter(value => value.record.recoveryAssets?.fileCount > 0)
                    .length
                : isCurrentSession
                    ? this.recoveryAssetBatches.size
                    : null
            const targetName = metadata.flowName || metadata.formName
            const targetType = metadata.flowName ? 'Flow' : metadata.formName ? 'Form' : metadata.transactionType
            const labelParts = [
                metadata.projectName,
                targetName ? `${targetType}: ${targetName}` : targetType
            ].filter(Boolean)
            return {
                id: candidate.id,
                label: labelParts.join(' · ') || candidate.id,
                recordCount,
                recordCountKnown: Number.isFinite(recordCount),
                sizeBytes: fileStats.size,
                modifiedAt: fileStats.mtime.toISOString(),
                invalidLineCount: cachedScan?.invalidLineCount ?? null,
                filePath: candidate.filePath,
                projectName: metadata.projectName,
                transactionType: metadata.transactionType,
                flowName: metadata.flowName,
                formName: metadata.formName,
                logFileName: metadata.logFileName || candidate.id,
                hasRecoveryContext,
                hasRecoveryAssets: recoveryAssetDirectoryAvailable,
                recoveryAssetsMissing: Number.isFinite(recoveryAssetRecordCount) &&
                    recoveryAssetRecordCount > 0 &&
                    !recoveryAssetDirectoryAvailable,
                recoveryAssetRecordCount
            }
        }))

        return sessions
            .filter(Boolean)
            .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt))
    }

    async recover(sessionId = 'latest') {
        await this.writeQueue
        const sessions = await this.listRecoverable()
        const selected = sessionId === 'latest'
            ? sessions[0]
            : sessions.find(session =>
                session.id === sessionId ||
                (sessionId === 'active' && session.id === basename(this.filePath)) ||
                (sessionId === 'previous' && session.id === LEGACY_PREVIOUS_FILE_NAME)
            )
        if (!selected) return null

        const scan = await this.scanFile(selected.filePath)
        const recoveryContext = await this.readContext(selected.filePath)
        const results = [...scan.records.values()]
            .sort((a, b) => a.location.offset - b.location.offset)
            .map(value => value.record)

        return {
            ...scan.metadata,
            recovered: true,
            recoverySource: selected.label,
            sourceFile: selected.filePath,
            recoveryWarningCount: scan.invalidLineCount,
            recoverySessionId: selected.id,
            recoveryContext,
            exportDate: new Date(selected.modifiedAt).toLocaleString(),
            results
        }
    }

    append(key, data) {
        this.writeQueue = this.writeQueue.then(async () => {
            const {
                rowData: _rowData,
                recoveryAssets: _recoveryAssets,
                ...dataWithoutSources
            } = data || {}
            const sourceDetails = dataWithoutSources.details || {}
            const checkpointDetails = {
                warnings: Array.isArray(sourceDetails.warnings) ? sourceDetails.warnings : [],
                executionLog: (sourceDetails.executionLog || []).map(step => ({
                    key: step?.key,
                    step: step?.step,
                    details: step?.details,
                    status: step?.status
                }))
            }
            const recordInput = {
                key,
                ...dataWithoutSources,
                details: checkpointDetails
            }

            const record = optimizeLogValue(recordInput)
            const line = `${JSON.stringify(record)}\n`
            const length = Buffer.byteLength(line)
            const offset = this.byteOffset
            await appendFile(this.filePath, line, 'utf8')
            this.scanCache.delete(this.filePath)
            this.index.set(String(key), { offset, length })
            this.recoveryAssetBatches.delete(String(key))
            this.byteOffset += length
        })
        return this.writeQueue.then(() => ({ success: true }))
    }

    async get(key) {
        await this.writeQueue
        const location = this.index.get(String(key))
        if (!location) return null

        const handle = await open(this.filePath, 'r')
        try {
            const buffer = Buffer.alloc(location.length)
            await handle.read(buffer, 0, location.length, location.offset)
            const record = JSON.parse(buffer.toString('utf8').trim())
            return record.details || null
        } finally {
            await handle.close()
        }
    }

    async getRecoveredDetail(sessionId, key) {
        await this.writeQueue
        const sessions = await this.listRecoverable()
        const selected = sessions.find(session => session.id === sessionId)
        if (!selected) return null

        const scan = await this.scanFile(selected.filePath)
        const location = scan.records.get(String(key))?.location
        if (!location) return null

        const handle = await open(selected.filePath, 'r')
        try {
            const buffer = Buffer.alloc(location.length)
            await handle.read(buffer, 0, location.length, location.offset)
            const record = JSON.parse(buffer.toString('utf8').trim())
            return record.details || null
        } finally {
            await handle.close()
        }
    }

    async getRecoveredReplayPayload(sessionId, key) {
        await this.writeQueue
        const sessions = await this.listRecoverable()
        const selected = sessions.find(session => session.id === sessionId)
        if (!selected) return null

        const scan = await this.scanFile(selected.filePath)
        const location = scan.records.get(String(key))?.location
        if (!location) return null

        const handle = await open(selected.filePath, 'r')
        try {
            const buffer = Buffer.alloc(location.length)
            await handle.read(buffer, 0, location.length, location.offset)
            const record = JSON.parse(buffer.toString('utf8').trim())
            const payload = record.details?.payload
            if (!payload) return null
            return payload
        } finally {
            await handle.close()
        }
    }

    async readRecoveryBinaryChunk(sessionId, relativePath, byteOffset = 0, byteLength = 1.5 * 1024 * 1024) {
        await this.writeQueue
        const normalizedSessionId = basename(String(sessionId || ''))
        if (!normalizedSessionId || normalizedSessionId !== String(sessionId || '')) {
            throw new Error('Invalid recovery session identifier.')
        }

        const sessionFilePath = join(this.directory, normalizedSessionId)
        const binaryPath = resolveRecoveryAssetPath(sessionFilePath, relativePath)
        const fileStats = await stat(binaryPath)
        const safeOffset = Math.max(0, Number(byteOffset) || 0)
        const safeLength = Math.min(
            1.5 * 1024 * 1024,
            Math.max(1, Number(byteLength) || 1.5 * 1024 * 1024),
            Math.max(0, fileStats.size - safeOffset)
        )
        if (safeLength === 0) {
            return {
                data: '',
                byteOffset: safeOffset,
                nextByteOffset: safeOffset,
                totalBytes: fileStats.size,
                done: true
            }
        }

        const handle = await open(binaryPath, 'r')
        try {
            const buffer = Buffer.alloc(safeLength)
            const { bytesRead } = await handle.read(buffer, 0, safeLength, safeOffset)
            const nextByteOffset = safeOffset + bytesRead
            return {
                data: buffer.subarray(0, bytesRead).toString('base64'),
                byteOffset: safeOffset,
                nextByteOffset,
                totalBytes: fileStats.size,
                done: nextByteOffset >= fileStats.size
            }
        } finally {
            await handle.close()
        }
    }

    async exportJson(destinationPath, metadata = {}) {
        await this.writeQueue
        await mkdir(dirname(destinationPath), { recursive: true })
        const scan = await this.scanFile(this.filePath)
        const recoveryContext = await this.readContext(this.filePath)

        const output = createWriteStream(destinationPath, { encoding: 'utf8' })
        const writeChunk = chunk => {
            if (output.write(chunk, 'utf8')) return Promise.resolve()
            return new Promise((resolve, reject) => {
                const handleDrain = () => {
                    output.off('error', handleError)
                    resolve()
                }
                const handleError = error => {
                    output.off('drain', handleDrain)
                    reject(error)
                }
                output.once('drain', handleDrain)
                output.once('error', handleError)
            })
        }

        await writeChunk(`${JSON.stringify({
            ...scan.metadata,
            ...optimizeLogValue(metadata),
            recoveryContext: recoveryContext || undefined,
            exportDate: new Date().toLocaleString()
        }).slice(0, -1)},\n\"results\":[`)

        const latestOffsets = new Set([...this.index.values()].map(value => value.offset))
        const input = createInterface({ input: createReadStream(this.filePath, { encoding: 'utf8' }), crlfDelay: Infinity })
        let currentOffset = 0
        let first = true
        for await (const line of input) {
            const lineLength = Buffer.byteLength(`${line}\n`)
            if (line && latestOffsets.has(currentOffset)) {
                if (!first) await writeChunk(',')
                await writeChunk(line)
                first = false
            }
            currentOffset += lineLength
        }
        await writeChunk(']}')
        await new Promise((resolve, reject) => {
            output.end(resolve)
            output.once('error', reject)
        })
        return { success: true, filePath: destinationPath }
    }

    async exportDataJson(destinationPath, data = {}) {
        await mkdir(dirname(destinationPath), { recursive: true })
        const { results = [], ...metadata } = data
        const output = createWriteStream(destinationPath, { encoding: 'utf8' })
        const writeChunk = chunk => {
            if (output.write(chunk, 'utf8')) return Promise.resolve()
            return new Promise((resolve, reject) => {
                const handleDrain = () => {
                    output.off('error', handleError)
                    resolve()
                }
                const handleError = error => {
                    output.off('drain', handleDrain)
                    reject(error)
                }
                output.once('drain', handleDrain)
                output.once('error', handleError)
            })
        }

        await writeChunk(`${JSON.stringify({
            ...optimizeLogValue(metadata),
            exportDate: new Date().toLocaleString()
        }).slice(0, -1)},\n"results":[`)
        for (let index = 0; index < results.length; index += 1) {
            if (index > 0) await writeChunk(',')
            await writeChunk(JSON.stringify(optimizeLogValue(results[index])))
        }
        await writeChunk(']}')
        await new Promise((resolve, reject) => {
            output.end(resolve)
            output.once('error', reject)
        })
        return { success: true, filePath: destinationPath }
    }
}
