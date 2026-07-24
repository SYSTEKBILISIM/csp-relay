import { createReadStream, createWriteStream } from 'fs'
import { appendFile, mkdir, open, readdir, stat, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { createInterface } from 'readline'
import { basename, dirname, join } from 'path'
import { optimizeLogValue } from '../shared/logValueOptimizer'

export { optimizeLogValue } from '../shared/logValueOptimizer'

const LEGACY_ACTIVE_FILE_NAME = 'active-transfer-log.jsonl'
const LEGACY_PREVIOUS_FILE_NAME = 'last-transfer-log.jsonl'
const SESSION_FILE_PREFIX = 'active-transfer-log_'

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
        this.filePath = join(this.directory, LEGACY_ACTIVE_FILE_NAME)
        const scan = await this.scanFile(this.filePath)
        this.index = new Map([...scan.records].map(([key, value]) => [key, value.location]))
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
            this.index.clear()
            this.byteOffset = Buffer.byteLength(metadataLine)
        })
        return this.writeQueue.then(() => ({
            success: true,
            filePath: this.filePath,
            sessionId: basename(this.filePath)
        }))
    }

    async scanFile(filePath) {
        let fileStats
        try {
            fileStats = await stat(filePath)
        } catch {
            return { filePath, size: 0, modifiedAt: null, invalidLineCount: 0, metadata: {}, records: new Map() }
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
                        records.set(String(record.key), {
                            location: { offset: currentOffset, length: lineLength },
                            record
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

        return {
            filePath,
            size: fileStats.size,
            modifiedAt: fileStats.mtime.toISOString(),
            invalidLineCount,
            metadata,
            records
        }
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
        const sessions = []

        for (const candidate of candidates) {
            const scan = await this.scanFile(candidate.filePath)
            if (scan.records.size === 0) continue
            const targetName = scan.metadata.flowName || scan.metadata.formName
            const targetType = scan.metadata.flowName ? 'Flow' : scan.metadata.formName ? 'Form' : scan.metadata.transactionType
            const labelParts = [
                scan.metadata.projectName,
                targetName ? `${targetType}: ${targetName}` : targetType
            ].filter(Boolean)
            sessions.push({
                id: candidate.id,
                label: labelParts.join(' · ') || candidate.id,
                recordCount: scan.records.size,
                modifiedAt: scan.modifiedAt,
                invalidLineCount: scan.invalidLineCount,
                filePath: candidate.filePath,
                projectName: scan.metadata.projectName,
                transactionType: scan.metadata.transactionType,
                flowName: scan.metadata.flowName,
                formName: scan.metadata.formName,
                logFileName: scan.metadata.logFileName || candidate.id
            })
        }

        return sessions.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt))
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
        const results = [...scan.records.values()]
            .sort((a, b) => a.location.offset - b.location.offset)
            .map(value => value.record)

        return {
            ...scan.metadata,
            recovered: true,
            recoverySource: selected.label,
            sourceFile: selected.filePath,
            recoveryWarningCount: scan.invalidLineCount,
            exportDate: new Date(selected.modifiedAt).toLocaleString(),
            results
        }
    }

    append(key, data) {
        this.writeQueue = this.writeQueue.then(async () => {
            const record = optimizeLogValue({ key, ...data })
            const line = `${JSON.stringify(record)}\n`
            const length = Buffer.byteLength(line)
            const offset = this.byteOffset
            await appendFile(this.filePath, line, 'utf8')
            this.index.set(String(key), { offset, length })
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

    async exportJson(destinationPath, metadata = {}) {
        await this.writeQueue
        await mkdir(dirname(destinationPath), { recursive: true })
        const scan = await this.scanFile(this.filePath)

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
