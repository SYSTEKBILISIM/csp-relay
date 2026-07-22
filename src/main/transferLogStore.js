import { createReadStream, createWriteStream } from 'fs'
import { appendFile, mkdir, open, stat, writeFile } from 'fs/promises'
import { createInterface } from 'readline'
import { dirname, join } from 'path'
import { optimizeLogValue } from '../shared/logValueOptimizer'

export { optimizeLogValue } from '../shared/logValueOptimizer'

export class TransferLogStore {
    constructor(baseDirectory) {
        this.preferredDirectory = join(baseDirectory, 'logs')
        this.directory = this.preferredDirectory
        this.filePath = join(this.directory, 'active-transfer-log.jsonl')
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
        this.filePath = join(this.directory, 'active-transfer-log.jsonl')
        try {
            this.byteOffset = (await stat(this.filePath)).size
        } catch {
            this.byteOffset = 0
        }
        return this.filePath
    }

    reset() {
        this.writeQueue = this.writeQueue.then(async () => {
            await writeFile(this.filePath, '', 'utf8')
            this.index.clear()
            this.byteOffset = 0
        })
        return this.writeQueue.then(() => ({ success: true, filePath: this.filePath }))
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

        await writeChunk(`${JSON.stringify({ ...optimizeLogValue(metadata), exportDate: new Date().toLocaleString() }).slice(0, -1)},\n\"results\":[`)

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
}
