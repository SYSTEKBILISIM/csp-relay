import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
    readFileAsBase64: (filePath) => ipcRenderer.invoke('read-file-as-base64', filePath),
    readFileAsBuffer: (filePath) => ipcRenderer.invoke('read-file-as-buffer', filePath),
    transferLogs: {
        reset: (metadata = {}) => ipcRenderer.invoke('transfer-log:reset', metadata),
        append: (key, data) => ipcRenderer.invoke('transfer-log:append', { key, data }),
        get: (key) => ipcRenderer.invoke('transfer-log:get', key),
        getPath: () => ipcRenderer.invoke('transfer-log:path'),
        listRecoverable: () => ipcRenderer.invoke('transfer-log:list-recoverable'),
        recover: (sessionId = 'latest') => ipcRenderer.invoke('transfer-log:recover', sessionId),
        exportJson: (metadata, suggestedName) => ipcRenderer.invoke('transfer-log:export-json', { metadata, suggestedName }),
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
