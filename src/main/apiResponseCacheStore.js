import { createHash } from 'crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'

const hashCacheKey = key => createHash('sha256').update(String(key)).digest('hex')
const getSessionDirectoryName = sessionId => `session-${hashCacheKey(sessionId).slice(0, 24)}`

export class ApiResponseCacheStore {
    constructor() {
        this.baseDirectory = null
        this.directory = null
        this.sessionId = null
        this.entries = new Map()
        this.writeQueue = Promise.resolve()
    }

    async ensureDirectory(userDataDirectory) {
        this.baseDirectory = join(userDataDirectory, 'cache', 'api-responses')
        await mkdir(this.baseDirectory, { recursive: true })
        const staleEntries = await readdir(this.baseDirectory, { withFileTypes: true })
        await Promise.all(staleEntries.map(entry =>
            rm(join(this.baseDirectory, entry.name), { recursive: true, force: true })
        ))
        return this.baseDirectory
    }

    async activateSession(sessionId, preserveExisting = true) {
        const normalizedSessionId = String(sessionId || '').trim()
        if (!normalizedSessionId) throw new Error('API cache session identifier is required.')

        this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
            if (!this.baseDirectory) throw new Error('API response cache base directory is not initialized.')

            const activeDirectoryName = getSessionDirectoryName(normalizedSessionId)
            const entries = await readdir(this.baseDirectory, { withFileTypes: true })
            for (const entry of entries) {
                if (entry.name === activeDirectoryName) continue
                await rm(join(this.baseDirectory, entry.name), { recursive: true, force: true })
            }

            this.directory = join(this.baseDirectory, activeDirectoryName)
            this.sessionId = normalizedSessionId
            if (!preserveExisting) {
                await rm(this.directory, { recursive: true, force: true })
            }
            await mkdir(this.directory, { recursive: true })
            this.entries.clear()

            const cachedFiles = await readdir(this.directory, { withFileTypes: true })
            for (const entry of cachedFiles) {
                if (!entry.isFile() || !entry.name.endsWith('.json')) continue
                const filePath = join(this.directory, entry.name)
                const fileStats = await stat(filePath)
                this.entries.set(entry.name.slice(0, -5), {
                    filePath,
                    sizeBytes: fileStats.size
                })
            }
        })
        await this.writeQueue
        return {
            success: true,
            directory: this.directory,
            sessionId: this.sessionId,
            entryCount: this.entries.size
        }
    }

    async clearActiveSession() {
        this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
            if (this.directory) {
                await rm(this.directory, { recursive: true, force: true })
            }
            this.directory = null
            this.sessionId = null
            this.entries.clear()
        })
        await this.writeQueue
        return { success: true }
    }

    async get(key) {
        await this.writeQueue
        if (!this.directory) return { hit: false }

        const cacheId = hashCacheKey(key)
        const filePath = join(this.directory, `${cacheId}.json`)
        try {
            const json = await readFile(filePath, 'utf8')
            const existing = this.entries.get(cacheId)
            this.entries.delete(cacheId)
            this.entries.set(cacheId, existing || {
                filePath,
                sizeBytes: Buffer.byteLength(json)
            })
            return { hit: true, json }
        } catch {
            this.entries.delete(cacheId)
            return { hit: false }
        }
    }

    async set(key, json) {
        const serialized = typeof json === 'string' ? json : JSON.stringify(json)

        this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
            if (!this.directory || !this.sessionId) {
                throw new Error('An active API cache session is not initialized.')
            }

            const cacheId = hashCacheKey(key)
            const filePath = join(this.directory, `${cacheId}.json`)
            await writeFile(filePath, serialized, 'utf8')
            this.entries.delete(cacheId)
            this.entries.set(cacheId, {
                filePath,
                sizeBytes: Buffer.byteLength(serialized)
            })
        })

        await this.writeQueue
        return { success: true }
    }

    async getStats() {
        await this.writeQueue
        if (!this.directory) {
            return { entryCount: 0, sizeBytes: 0, sessionId: null }
        }

        if (this.entries.size === 0) {
            const files = await readdir(this.directory, { withFileTypes: true })
            for (const entry of files) {
                if (!entry.isFile() || !entry.name.endsWith('.json')) continue
                const filePath = join(this.directory, entry.name)
                const fileStats = await stat(filePath)
                this.entries.set(entry.name.slice(0, -5), {
                    filePath,
                    sizeBytes: fileStats.size
                })
            }
        }

        return {
            entryCount: this.entries.size,
            sizeBytes: [...this.entries.values()].reduce((total, entry) => total + entry.sizeBytes, 0),
            sessionId: this.sessionId
        }
    }
}
