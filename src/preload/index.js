import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
    readFileAsBase64: (filePath) => ipcRenderer.invoke('read-file-as-base64', filePath),
    readFileAsBuffer: (filePath) => ipcRenderer.invoke('read-file-as-buffer', filePath),
    transferLogs: {
        reset: () => ipcRenderer.invoke('transfer-log:reset'),
        append: (key, data) => ipcRenderer.invoke('transfer-log:append', { key, data }),
        get: (key) => ipcRenderer.invoke('transfer-log:get', key),
        getPath: () => ipcRenderer.invoke('transfer-log:path'),
        exportJson: (metadata, suggestedName) => ipcRenderer.invoke('transfer-log:export-json', { metadata, suggestedName })
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
