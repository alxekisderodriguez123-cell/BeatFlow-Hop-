export interface CustomMenuAudioRecord {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  blob: Blob;
  savedAt: number;
}

const DB_NAME = 'BeatflowHopMenuMusicDB';
const DB_VERSION = 1;
const STORE_NAME = 'custom_menu_audio';
const ACTIVE_KEY = 'active_track';

const SUPPORTED_EXTENSIONS = /\.(mp3|wav|ogg|m4a|aac|flac|webm|opus)$/i;

export function isCompatibleMenuAudioFile(file: File): boolean {
  if (file.type && file.type.startsWith('audio/')) return true;
  return SUPPORTED_EXTENSIONS.test(file.name);
}

function openMenuMusicDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir MenuMusicDB'));
  });
}

export async function saveCustomMenuAudio(file: File): Promise<CustomMenuAudioRecord> {
  const db = await openMenuMusicDb();
  const record: CustomMenuAudioRecord = {
    id: ACTIVE_KEY,
    fileName: file.name,
    mimeType: file.type || 'audio/mpeg',
    size: file.size,
    blob: file,
    savedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => {
      db.close();
      resolve(record);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('No se pudo guardar la música del menú'));
    };
  });
}

export async function loadCustomMenuAudio(): Promise<CustomMenuAudioRecord | null> {
  const db = await openMenuMusicDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(ACTIVE_KEY);
    req.onsuccess = () => {
      const res = req.result as CustomMenuAudioRecord | undefined;
      db.close();
      resolve(res ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error ?? new Error('No se pudo leer la música del menú'));
    };
  });
}

export async function clearCustomMenuAudio(): Promise<void> {
  const db = await openMenuMusicDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(ACTIVE_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('No se pudo eliminar la música del menú'));
    };
  });
}
