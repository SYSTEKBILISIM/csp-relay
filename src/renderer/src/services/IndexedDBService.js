import { optimizeLogValue } from '../../../shared/logValueOptimizer'

class FileLogService {
    get api() {
        return window.api?.transferLogs
    }

    async saveDetail(key, details, summary = {}, rowData = {}) {
        if (!this.api) throw new Error('File log API is unavailable.')
        return this.api.append(key, optimizeLogValue({
            ...summary,
            key,
            details,
            rowData
        }))
    }

    async getDetail(key) {
        if (!this.api) return null
        return this.api.get(key)
    }

    async clearAll() {
        if (!this.api) return
        return this.api.reset()
    }

    async getPath() {
        if (!this.api) return null
        return this.api.getPath()
    }

    async listRecoverable() {
        if (!this.api) return []
        return this.api.listRecoverable()
    }

    async recover(sessionId = 'latest') {
        if (!this.api) return null
        return this.api.recover(sessionId)
    }

    async exportJson(metadata, suggestedName) {
        if (!this.api) throw new Error('File log API is unavailable.')
        return this.api.exportJson(metadata, suggestedName)
    }
}

export const logDB = new FileLogService()
