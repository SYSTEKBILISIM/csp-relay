import { optimizeLogValue } from '../../../shared/logValueOptimizer'

class FileLogService {
    get api() {
        return window.api?.transferLogs
    }

    async saveDetail(key, details, summary = {}) {
        if (!this.api) throw new Error('File log API is unavailable.')
        const { details: _summaryDetails, ...summaryWithoutDetails } = summary
        const checkpointDetails = {
            warnings: details?.warnings || [],
            executionLog: (details?.executionLog || []).map(step => ({
                key: step.key,
                step: step.step,
                details: step.details,
                status: step.status
            }))
        }
        return this.api.append(key, optimizeLogValue({
            ...summaryWithoutDetails,
            key,
            details: checkpointDetails
        }))
    }

    async getDetail(key) {
        if (!this.api) return null
        return this.api.get(key)
    }

    async getRecoveredDetail(sessionId, key) {
        if (!this.api) return null
        return this.api.getRecoveredDetail(sessionId, key)
    }

    async getRecoveredReplayPayload(sessionId, key) {
        if (!this.api) return null
        return this.api.getRecoveredReplayPayload(sessionId, key)
    }

    async clearAll(metadata = {}) {
        if (!this.api) return
        return this.api.reset(metadata)
    }

    async saveRecoveryContext(context = {}) {
        if (!this.api) return
        return this.api.saveContext(context)
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

    async exportDataJson(data, suggestedName) {
        if (!this.api) throw new Error('File log API is unavailable.')
        return this.api.exportDataJson(data, suggestedName)
    }
}

export const logDB = new FileLogService()
