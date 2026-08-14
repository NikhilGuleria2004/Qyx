type SearchRecord = {
  id: string;
  text: string;
  timestamp: number;
  conversationId: string;
  senderId: string;
};

type SearchIndex = {
  add: (record: SearchRecord) => Promise<void>;
  search: (query: string) => Promise<SearchRecord[]>;
  clear: () => Promise<void>;
};

function createInMemoryIndex(): SearchIndex {
  const store = new Map<string, SearchRecord>();

  return {
    async add(record) {
      store.set(record.id, record);
    },

    async search(query) {
      const lower = query.toLowerCase();
      const results: SearchRecord[] = [];
      for (const record of store.values()) {
        if (record.text.toLowerCase().includes(lower)) {
          results.push(record);
        }
      }
      return results.sort((a, b) => b.timestamp - a.timestamp);
    },

    async clear() {
      store.clear();
    },
  };
}

let index: SearchIndex | null = null;

export async function getSearchIndex(): Promise<SearchIndex> {
  if (index) return index;

  if (typeof indexedDB !== 'undefined') {
    index = createIndexedDBIndex();
  } else {
    index = createInMemoryIndex();
  }

  return index;
}

function createIndexedDBIndex(): SearchIndex {
  const DB_NAME = 'qyx-search';
  const STORE_NAME = 'messages';

  function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('text', 'text', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('conversationId', 'conversationId', { unique: false });
        }
      };
    });
  }

  return {
    async add(record) {
      const db = await openDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(record);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },

    async search(query) {
      const db = await openDB();
      return new Promise<SearchRecord[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const results: SearchRecord[] = [];
        const request = store.openCursor();
        const lower = query.toLowerCase();

        request.onerror = () => reject(request.error);
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const record = cursor.value as SearchRecord;
            if (record.text.toLowerCase().includes(lower)) {
              results.push(record);
            }
            cursor.continue();
          } else {
            resolve(results.sort((a, b) => b.timestamp - a.timestamp));
          }
        };
      });
    },

    async clear() {
      const db = await openDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },
  };
}
