import { optimizeLogValue } from '../../../shared/logValueOptimizer'

class FileLogService {
    get api() {
        return window.api?.transferLogs
    }

    async saveDetail(key, details, summary = {}) {
        if (!this.api) throw new Error('File log API is unavailable.')
        const { details: _summaryDetails, ...summaryWithoutDetails } = summary
        const checkpointDetails = {
            payload: details?.payload,
            response: details?.response,
            warnings: details?.warnings || [],
            executionLog: (details?.executionLog || []).map(step => ({
                key: step.key,
                step: step.step,
                details: step.details,
                status: step.status,
                raw: step.raw
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

    async getRecoverySummary(sessionId) {
        if (!this.api) return null
        return this.api.getRecoverySummary(sessionId)
    }

    async deleteRecoverySession(sessionId) {
        if (!this.api) throw new Error('File log API is unavailable.')
        return this.api.deleteRecoverySession(sessionId)
    }

    async recover(sessionId = 'latest') {
        if (!this.api) return null
        return this.api.recover(sessionId)
    }

    async exportJson(metadata, suggestedName) {
        if (!this.api) throw new Error('File log API is unavailable.')
        return this.api.exportJson(metadata, suggestedName)
    }

    async exportRecovery(metadata, suggestedName, fallbackData) {
        if (!this.api) throw new Error('File log API is unavailable.')
        if (typeof this.api.exportRecovery === 'function') {
            try {
                return await this.api.exportRecovery(metadata, suggestedName)
            } catch (error) {
                const handlerUnavailable = /no handler registered|handler.*not.*registered/i.test(error?.message || '')
                if (!handlerUnavailable || !fallbackData || typeof this.api.exportDataJson !== 'function') {
                    throw error
                }

                return this.api.exportDataJson(fallbackData, suggestedName)
            }
        }
        if (fallbackData && typeof this.api.exportDataJson === 'function') {
            return this.api.exportDataJson(fallbackData, suggestedName)
        }
        throw new Error('Recovery export is unavailable. Restart the application and try again.')
    }

    async exportDataJson(data, suggestedName) {
        if (!this.api) throw new Error('File log API is unavailable.')
        return this.api.exportDataJson(data, suggestedName)
    }
}

export const logDB = new FileLogService()
