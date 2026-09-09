import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
    readFileAsBase64: (filePath) => ipcRenderer.invoke('read-file-as-base64', filePath),
    readFileAsBuffer: (filePath) => ipcRenderer.invoke('read-file-as-buffer', filePath),
    readFileInfo: (filePath) => ipcRenderer.invoke('read-file-info', filePath),
    readFileBytes: (filePath) => ipcRenderer.invoke('read-file-bytes', filePath),
    getPathForFile: (file) => webUtils.getPathForFile(file),
    selectExcelFile: () => ipcRenderer.invoke('select-excel-file'),
    onQuickSelectionShortcut: (callback) => {
        const listener = () => callback()
        ipcRenderer.on('shortcut:quick-selection', listener)
        return () => ipcRenderer.removeListener('shortcut:quick-selection', listener)
    },
    readFileChunkBase64: (filePath, byteOffset, byteLength) =>
        ipcRenderer.invoke('read-file-chunk-base64', { filePath, byteOffset, byteLength }),
    apiCache: {
        activate: (sessionId, preserveExisting = true) =>
            ipcRenderer.invoke('api-cache:activate', { sessionId, preserveExisting }),
        get: (key) => ipcRenderer.invoke('api-cache:get', key),
        set: (key, json) => ipcRenderer.invoke('api-cache:set', { key, json }),
        getStats: () => ipcRenderer.invoke('api-cache:stats'),
        clearActive: () => ipcRenderer.invoke('api-cache:clear-active')
    },
    transferLogs: {
        reset: (metadata = {}) => ipcRenderer.invoke('transfer-log:reset', metadata),
        saveContext: (context = {}) => ipcRenderer.invoke('transfer-log:save-context', context),
        append: (key, data) => ipcRenderer.invoke('transfer-log:append', { key, data }),
        get: (key) => ipcRenderer.invoke('transfer-log:get', key),
        getRecoveredDetail: (sessionId, key) => ipcRenderer.invoke('transfer-log:get-recovered-detail', { sessionId, key }),
        getRecoveredReplayPayload: (sessionId, key) => ipcRenderer.invoke('transfer-log:get-recovered-replay-payload', { sessionId, key }),
        readRecoveryBinaryChunk: (sessionId, relativePath, byteOffset, byteLength) =>
            ipcRenderer.invoke('transfer-log:read-recovery-binary-chunk', {
                sessionId,
                relativePath,
                byteOffset,
                byteLength
            }),
        getPath: () => ipcRenderer.invoke('transfer-log:path'),
        listRecoverable: () => ipcRenderer.invoke('transfer-log:list-recoverable'),
        getRecoverySummary: (sessionId) => ipcRenderer.invoke('transfer-log:get-recovery-summary', sessionId),
        deleteRecoverySession: (sessionId) => ipcRenderer.invoke('transfer-log:delete-recovery-session', sessionId),
        recover: (sessionId = 'latest') => ipcRenderer.invoke('transfer-log:recover', sessionId),
        exportJson: (metadata, suggestedName) => ipcRenderer.invoke('transfer-log:export-json', { metadata, suggestedName }),
        exportRecovery: (metadata, suggestedName) => ipcRenderer.invoke('transfer-log:export-recovery', { metadata, suggestedName }),
        exportDataJson: (data, suggestedName) => ipcRenderer.invoke('transfer-log:export-data-json', { data, suggestedName })
    }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('electron', electronAPI)
        contextBridge.exposeInMainWorld('api', api)
    } catch (error) {
        console.error(error)
    }
} else {
    window.electron = electronAPI
    window.api = api
}
