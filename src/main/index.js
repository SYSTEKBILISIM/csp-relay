import { app, shell, BrowserWindow, ipcMain, powerSaveBlocker, dialog, crashReporter, session } from 'electron'
import { dirname, join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { appendFile, mkdir } from 'fs/promises'

// Disable background throttling to ensure high performance during transfers
// even when the window is minimized, hidden, or the screen is locked.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
crashReporter.start({ uploadToServer: false, compress: false })
import { readFileSync } from 'fs'
import { basename, extname } from 'path'
import mime from 'mime-types'; // Added dynamic MIME type lookup
import { TransferLogStore } from './transferLogStore'
import { ApiResponseCacheStore } from './apiResponseCacheStore'
import { getLocalFileInfo, readLocalFileChunkBase64 } from './localFileReader'

import icon from '../../resources/icon.png?asset'

const writeRuntimeEvent = async (eventName, details = {}) => {
    try {
        const logDirectory = join(app.getPath('userData'), 'logs')
        await mkdir(logDirectory, { recursive: true })
        await appendFile(join(logDirectory, 'electron-runtime-events.jsonl'), `${JSON.stringify({
            timestamp: new Date().toISOString(),
            event: eventName,
            ...details
        })}\n`, 'utf8')
    } catch (error) {
        console.error('[Main] Runtime event could not be logged:', error)
    }
}

function createWindow() {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 1000, // Doubled width
        height: 800, // Compact height
        minWidth: 600,
        minHeight: 600,
        show: false,
        autoHideMenuBar: true,
        icon: icon,
        titleBarStyle: 'hidden', // Hide default title bar
        titleBarOverlay: {
            color: '#f8fafc', // Match light bg-app/header
            symbolColor: '#1e293b', // Dark symbols for light theme
            height: 32 // Compact header height
        },
        title: '', // Prevent native title display
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            webSecurity: false
        }
    })

    mainWindow.on('ready-to-show', () => {
        mainWindow.show()
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    mainWindow.webContents.on('before-input-event', (event, input) => {
        const isQuickSelectionShortcut = input.type === 'keyDown' &&
            input.control &&
            input.alt &&
            !input.shift &&
            (input.code === 'KeyS' || String(input.key || '').toLowerCase() === 's')

        if (isQuickSelectionShortcut) {
            event.preventDefault()
            mainWindow.webContents.send('shortcut:quick-selection')
        }
    })

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
        writeRuntimeEvent('render-process-gone', {
            reason: details.reason,
            exitCode: details.exitCode,
            url: mainWindow.webContents.getURL()
        })
        dialog.showMessageBox(mainWindow, {
            type: 'error',
            title: 'Synergy CSP Relay',
            message: 'Uygulama arayuzu beklenmedik sekilde durdu.',
            detail: 'Transfer logs were saved to disk. Reopen the application and check the latest session under Recoverable Logs.',
            buttons: ['Tamam']
        }).catch(() => undefined)
    })

    mainWindow.webContents.on('unresponsive', () => {
        writeRuntimeEvent('renderer-unresponsive', {
            url: mainWindow.webContents.getURL()
        })
    })

    mainWindow.webContents.on('responsive', () => {
        writeRuntimeEvent('renderer-responsive', {
            url: mainWindow.webContents.getURL()
        })
    })

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (errorCode === -3) return
        writeRuntimeEvent('did-fail-load', {
            errorCode,
            errorDescription,
            validatedURL,
            isMainFrame
        })
    })

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

// Global Store in Main Process
const globalBackendStore = {};
const transferLogStore = new TransferLogStore(is.dev ? app.getAppPath() : dirname(app.getPath('exe')))
const apiResponseCacheStore = new ApiResponseCacheStore()

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
    writeRuntimeEvent('app-ready', {
        appVersion: app.getVersion(),
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome
    })

    // Prevent the OS from suspending the app or entering deep sleep
    powerSaveBlocker.start('prevent-app-suspension');

    const transferLogReady = transferLogStore.ensureDirectory(app.getPath('userData')).catch(error => {
        console.error('[Main] Transfer log directory could not be initialized:', error)
        throw error
    })
    const apiResponseCacheReady = apiResponseCacheStore.ensureDirectory(app.getPath('userData')).catch(error => {
        console.error('[Main] API response cache directory could not be initialized:', error)
        throw error
    })

    ipcMain.handle('transfer-log:reset', async (_event, metadata = {}) => {
        await transferLogReady
        return transferLogStore.reset(metadata)
    })
    ipcMain.handle('transfer-log:append', async (_event, { key, data }) => {
        await transferLogReady
        return transferLogStore.append(key, data)
    })
    ipcMain.handle('transfer-log:save-context', async (_event, context = {}) => {
        await transferLogReady
        return transferLogStore.saveContext(context)
    })
    ipcMain.handle('transfer-log:get', async (_event, key) => {
        await transferLogReady
        return transferLogStore.get(key)
    })
    ipcMain.handle('transfer-log:get-recovered-detail', async (_event, { sessionId, key }) => {
        await transferLogReady
        return transferLogStore.getRecoveredDetail(sessionId, key)
    })
    ipcMain.handle('transfer-log:get-recovered-replay-payload', async (_event, { sessionId, key }) => {
        await transferLogReady
        return transferLogStore.getRecoveredReplayPayload(sessionId, key)
    })
    ipcMain.handle('transfer-log:read-recovery-binary-chunk', async (_event, {
        sessionId,
        relativePath,
        byteOffset,
        byteLength
    }) => {
        await transferLogReady
        return transferLogStore.readRecoveryBinaryChunk(sessionId, relativePath, byteOffset, byteLength)
    })
    ipcMain.handle('transfer-log:path', async () => {
        await transferLogReady
        return transferLogStore.filePath
    })
    ipcMain.handle('transfer-log:list-recoverable', async () => {
        await transferLogReady
        return transferLogStore.listRecoverable()
    })
    ipcMain.handle('transfer-log:get-recovery-summary', async (_event, sessionId) => {
        await transferLogReady
        return transferLogStore.getRecoverySummary(sessionId)
    })
    ipcMain.handle('transfer-log:delete-recovery-session', async (_event, sessionId) => {
        await transferLogReady
        return transferLogStore.deleteRecoverySession(sessionId)
    })
    ipcMain.handle('transfer-log:recover', async (_event, sessionId) => {
        await transferLogReady
        return transferLogStore.recover(sessionId)
    })
    ipcMain.handle('transfer-log:export-json', async (_event, { metadata, suggestedName }) => {
        await transferLogReady
        const result = await dialog.showSaveDialog({
            title: 'Export Transfer Logs',
            defaultPath: join(app.getPath('downloads'), suggestedName || `Full_Transfer_Logs_${Date.now()}.json`),
            filters: [{ name: 'JSON Files', extensions: ['json'] }]
        })
        if (result.canceled || !result.filePath) return { success: false, canceled: true }
        return transferLogStore.exportJson(result.filePath, metadata)
    })
    ipcMain.handle('transfer-log:export-data-json', async (_event, { data, suggestedName }) => {
        await transferLogReady
        const result = await dialog.showSaveDialog({
            title: 'Export Recovered Transfer Logs',
            defaultPath: join(app.getPath('downloads'), suggestedName || `Recovered_Transfer_Logs_${Date.now()}.json`),
            filters: [{ name: 'JSON Files', extensions: ['json'] }]
        })
        if (result.canceled || !result.filePath) return { success: false, canceled: true }
        return transferLogStore.exportDataJson(result.filePath, data)
    })
    ipcMain.handle('api-cache:activate', async (_event, { sessionId, preserveExisting = true }) => {
        await apiResponseCacheReady
        return apiResponseCacheStore.activateSession(sessionId, preserveExisting)
    })
    ipcMain.handle('api-cache:get', async (_event, key) => {
        await apiResponseCacheReady
        return apiResponseCacheStore.get(key)
    })
    ipcMain.handle('api-cache:set', async (_event, { key, json }) => {
        await apiResponseCacheReady
        return apiResponseCacheStore.set(key, json)
    })
    ipcMain.handle('api-cache:stats', async () => {
        await apiResponseCacheReady
        return apiResponseCacheStore.getStats()
    })
    ipcMain.handle('api-cache:clear-active', async () => {
        await apiResponseCacheReady
        return apiResponseCacheStore.clearActiveSession()
    })

    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron')

    // Listen for global constant updates
    ipcMain.on('update-global-constant', (event, { key, value }) => {
        console.log(`[Main] Update constant: ${key}`);
        globalBackendStore[key] = value;
    });

    // IPC: Read a local file and return it as base64 (for RelatedDocument uploads)
    ipcMain.handle('read-file-as-base64', async (_event, filePath) => {
        try {
            const buf = readFileSync(filePath);
            const ext = extname(filePath); // e.g. ".pdf"
            const fullName = basename(filePath); // e.g. "Test.pdf"

            // Look up the mime type using the mime-types package
            const contentType = mime.lookup(filePath) || 'application/octet-stream';

            return { success: true, name: fullName, extension: ext, contentType, data: buf.toString('base64') };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // IPC: Read a local file and return its metadata + raw buffer (for chunked UploadFileParts flow)
    ipcMain.handle('read-file-as-buffer', async (_event, filePath) => {
        try {
            const buf = readFileSync(filePath);
            const ext = extname(filePath); // e.g. ".pdf"
            const fullName = basename(filePath); // e.g. "Test.pdf"
            const contentType = mime.lookup(filePath) || 'application/octet-stream';

            // Transfer the buffer as a plain Array so it survives IPC serialization
            return {
                success: true,
                name: fullName,
                extension: ext,
                contentType,
                size: buf.length,
                buffer: Array.from(buf)
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
    ipcMain.handle('read-file-info', async (_event, filePath) => {
        try {
            return {
                success: true,
                ...await getLocalFileInfo(filePath)
            }
        } catch (err) {
            return { success: false, error: err.message }
        }
    })
    ipcMain.handle('read-file-bytes', async (_event, filePath) => {
        try {
            return {
                success: true,
                data: readFileSync(filePath)
            }
        } catch (err) {
            return { success: false, error: err.message }
        }
    })
    ipcMain.handle('select-excel-file', async () => {
        const result = await dialog.showOpenDialog({
            title: 'Select the Excel source file for recovery',
            properties: ['openFile'],
            filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }]
        })
        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, canceled: true }
        }
        return {
            success: true,
            filePath: result.filePaths[0]
        }
    })
    ipcMain.handle('read-file-chunk-base64', async (_event, { filePath, byteOffset = 0, byteLength }) => {
        try {
            return {
                success: true,
                ...await readLocalFileChunkBase64(filePath, byteOffset, byteLength)
            }
        } catch (err) {
            return { success: false, error: err.message }
        }
    })


    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    const cleanupResults = await Promise.allSettled([
        session.defaultSession.clearCache(),
        session.defaultSession.clearStorageData({ storages: ['indexdb'] })
    ])
    cleanupResults.forEach((result, index) => {
        if (result.status === 'rejected') {
            writeRuntimeEvent(index === 0 ? 'cache-cleanup-failed' : 'legacy-indexeddb-cleanup-failed', {
                error: result.reason?.message || String(result.reason)
            })
        }
    })

    createWindow()

    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('child-process-gone', (_event, details) => {
    writeRuntimeEvent('child-process-gone', {
        type: details.type,
        reason: details.reason,
        exitCode: details.exitCode,
        serviceName: details.serviceName,
        name: details.name
    })
})
