/**
 * IndexedDB 封装 — LinkMemo 本地数据存储
 */

const DB_NAME = 'LinkMemoDB';
const DB_VERSION = 2;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('links')) {
        const linkStore = db.createObjectStore('links', { keyPath: 'id' });
        linkStore.createIndex('createdAt', 'createdAt', { unique: false });
        linkStore.createIndex('category', 'categoryName', { unique: false });
        linkStore.createIndex('favorite', 'isFavorite', { unique: false });
      }
      if (!db.objectStoreNames.contains('todos')) {
        const todoStore = db.createObjectStore('todos', { keyPath: 'id' });
        todoStore.createIndex('createdAt', 'createdAt', { unique: false });
        todoStore.createIndex('completed', 'isCompleted', { unique: false });
        todoStore.createIndex('sortOrder', 'sortOrder', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('chatHistory')) {
        db.createObjectStore('chatHistory', { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// ====== 聊天历史 ======

async function saveChatHistory(messages) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('chatHistory', 'readwrite');
    const store = tx.objectStore('chatHistory');
    store.clear(); // 清空旧记录
    messages.forEach((m, i) => store.put({ id: i, ...m }));
    tx.oncomplete = () => resolve();
  });
}

async function loadChatHistory() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('chatHistory', 'readonly');
    const request = tx.objectStore('chatHistory').getAll();
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => a.id - b.id).map(m => ({ role: m.role, text: m.text, actions: m.actions || [] })));
    request.onerror = () => resolve([]);
  });
}

async function clearChatHistory() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('chatHistory', 'readwrite');
    tx.objectStore('chatHistory').clear();
    tx.oncomplete = () => resolve();
  });
}

// ====== 链接 (Links) ======

async function getAllLinks() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('links', 'readonly');
    const store = tx.objectStore('links');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

async function saveLink(link) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('links', 'readwrite');
    tx.objectStore('links').put(link);
    tx.oncomplete = () => resolve();
  });
}

async function deleteLink(id) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('links', 'readwrite');
    tx.objectStore('links').delete(id);
    tx.oncomplete = () => resolve();
  });
}

async function getLink(id) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('links', 'readonly');
    const request = tx.objectStore('links').get(id);
    request.onsuccess = () => resolve(request.result);
  });
}

// ====== 待办 (Todos) ======

async function getAllTodos() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('todos', 'readonly');
    const request = tx.objectStore('todos').getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

async function saveTodo(todo) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('todos', 'readwrite');
    tx.objectStore('todos').put(todo);
    tx.oncomplete = () => resolve();
  });
}

async function deleteTodo(id) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('todos', 'readwrite');
    tx.objectStore('todos').delete(id);
    tx.oncomplete = () => resolve();
  });
}

// ====== 设置 (Settings) ======

async function getSetting(key) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('settings', 'readonly');
    const request = tx.objectStore('settings').get(key);
    request.onsuccess = () => resolve(request.result?.value ?? null);
  });
}

async function setSetting(key, value) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ key, value });
    tx.oncomplete = () => resolve();
  });
}

// ====== 导出 ======

async function exportAllData() {
  const [links, todos, settings] = await Promise.all([
    getAllLinks(), getAllTodos(), (async () => {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction('settings', 'readonly');
        const request = tx.objectStore('settings').getAll();
        request.onsuccess = () => resolve(request.result || []);
      });
    })()
  ]);
  return {
    exportDate: new Date().toISOString(),
    links,
    todos,
    settings: settings.filter(s => s.key !== 'api_key')
  };
}
