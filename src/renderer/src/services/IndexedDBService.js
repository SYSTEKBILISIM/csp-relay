const DB_NAME = 'TransferLogsDB';
const STORE_NAME = 'LogDetails';
const DB_VERSION = 1;

class IndexedDBService {
    constructor() {
        this.db = null;
        this.initPromise = null;
        this.memoryStore = new Map(); // Fallback for fatal DB errors
        this.isMemoryFallback = false;
    }

    async initDB() {
        if (this.isMemoryFallback) return null;
        if (this.db) return this.db;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                    }
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    resolve(this.db);
                };

                request.onerror = (event) => {
                    const error = event.target.error;
                    console.error('IndexedDB Initialization error:', error);
                    
                    // If it's a fatal internal error, switch to memory fallback
                    if (error?.name === 'UnknownError' || error?.message?.includes('Internal error')) {
                        console.warn('Switching to In-Memory storage due to IndexedDB internal error.');
                        this.isMemoryFallback = true;
                        this.initPromise = null;
                        resolve(null);
                    } else {
                        this.initPromise = null;
                        reject(error);
                    }
                };
            } catch (e) {
                console.error('IndexedDB Open Exception:', e);
                this.isMemoryFallback = true;
                resolve(null);
            }
        });

        return this.initPromise;
    }

    _saveToMemoryFallback(key, data) {
        if (this.memoryStore.size >= 1000) {
            const firstKey = this.memoryStore.keys().next().value;
            this.memoryStore.delete(firstKey);
        }
        this.memoryStore.set(key, { key, ...data });
    }

    async saveDetail(key, data) {
        if (this.isMemoryFallback) {
            this._saveToMemoryFallback(key, data);
            return;
        }

        try {
            const db = await this.initDB();
            if (!db) {
                this._saveToMemoryFallback(key, data);
                return;
            }

            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put({ key, ...data });

                request.onsuccess = () => resolve();
                request.onerror = (event) => reject(event.target.error);
            });
        } catch (e) {
            console.error('Save Fallback triggered:', e);
            this._saveToMemoryFallback(key, data);
        }
    }

    async getDetail(key) {
        if (this.isMemoryFallback || this.memoryStore.has(key)) {
            return this.memoryStore.get(key) || null;
        }

        try {
            const db = await this.initDB();
            if (!db) return this.memoryStore.get(key) || null;

            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(key);

                request.onsuccess = (event) => resolve(event.target.result || null);
                request.onerror = (event) => reject(event.target.error);
            });
        } catch (e) {
            return this.memoryStore.get(key) || null;
        }
    }

    async clearAll() {
        this.memoryStore.clear();
        if (this.isMemoryFallback) return;

        try {
            const db = await this.initDB();
            if (!db) return;
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.clear();
        } catch (e) {
            // Silently fail for clear
        }
    }

    async getAllDetailsAsStream(callback) {
        // Handle memory store
        for (const value of this.memoryStore.values()) {
            await callback(value);
        }
        
        if (this.isMemoryFallback) return;

        try {
            const db = await this.initDB();
            if (!db) return;
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.openCursor();

            return new Promise((resolve, reject) => {
                request.onsuccess = async (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        // Avoid duplicates if also in memory
                        if (!this.memoryStore.has(cursor.key)) {
                            await callback(cursor.value);
                        }
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = (event) => reject(event.target.error);
            });
        } catch (e) {
            // Memory already handled
        }
    }
}

export const logDB = new IndexedDBService();
