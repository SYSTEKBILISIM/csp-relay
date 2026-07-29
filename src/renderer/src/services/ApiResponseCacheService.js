class DiskApiResponseCacheService {
    constructor() {
        this.pendingReads = new Map()
    }

    get api() {
        return window.api?.apiCache
    }

    async activate(sessionId, preserveExisting = true) {
        if (!this.api) return { success: false, unavailable: true }
        this.pendingReads.clear()
        try {
            return await this.api.activate(sessionId, preserveExisting)
        } catch (error) {
            console.warn('[API Cache] Disk cache session could not be activated; transfer will continue without cached reads.', error)
            return { success: false, error: error.message }
        }
    }

    async get(key) {
        if (!this.api) return undefined
        if (this.pendingReads.has(key)) return this.pendingReads.get(key)

        const pendingRead = this.api.get(key)
            .then(result => result?.hit ? JSON.parse(result.json) : undefined)
            .catch(error => {
                console.warn('[API Cache] Disk read failed; fetching fresh data.', error)
                return undefined
            })
            .finally(() => {
                this.pendingReads.delete(key)
            })
        this.pendingReads.set(key, pendingRead)
        return pendingRead
    }

    async set(key, value) {
        if (!this.api) return
        try {
            await this.api.set(key, JSON.stringify(value))
        } catch (error) {
            console.warn('[API Cache] Disk write failed; transfer will continue without caching this response.', error)
        }
    }

    async getStats() {
        if (!this.api) return { entryCount: 0, sizeBytes: 0, sessionId: null }
        return this.api.getStats()
    }

    async clearActive() {
        this.pendingReads.clear()
        if (!this.api) return
        return this.api.clearActive()
    }
}

export const apiResponseCache = new DiskApiResponseCacheService()
