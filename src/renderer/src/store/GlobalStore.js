// Simple event-based store for global application state/constants
class GlobalStore {
    constructor() {
        this.state = {
            encryptedData: null,
            loginParameters: null, // Stores response from GetLoginParameters (Languages, etc.)
            session: {
                username: '',
                password: '',
                language: 'tr-TR' // Default
            }
        };
        this.listeners = [];
        this.ipcTimeout = null;
        this.pendingIpcUpdates = new Map();
    }

    _flushIpcUpdates() {
        if (!window.electron || !window.electron.ipcRenderer) return;
        this.pendingIpcUpdates.forEach((value, key) => {
            window.electron.ipcRenderer.send('update-global-constant', { key, value });
        });
        this.pendingIpcUpdates.clear();
    }

    set(key, value) {
        if (this.state[key] !== value) {
            this.state[key] = value;
            this.notify(key, value);

            // Sync with Main process if available (debounced)
            this.pendingIpcUpdates.set(key, value);
            if (this.ipcTimeout) clearTimeout(this.ipcTimeout);
            this.ipcTimeout = setTimeout(() => this._flushIpcUpdates(), 100);
        }
    }

    get(key) {
        return this.state[key];
    }

    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    notify(key, value) {
        this.listeners.forEach(cb => cb(key, value));
    }

    delete(key) {
        if (this.state.hasOwnProperty(key)) {
            delete this.state[key];
            this.notify(key, undefined);

            // Sync with Main process if available (debounced)
            this.pendingIpcUpdates.set(key, null);
            if (this.ipcTimeout) clearTimeout(this.ipcTimeout);
            this.ipcTimeout = setTimeout(() => this._flushIpcUpdates(), 100);
        }
    }
}

export const globalStore = new GlobalStore();
