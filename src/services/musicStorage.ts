import {
  cleanTrackNameFromFilename,
  extractPaletteFromCoverArt,
  parseMp3Id3Tags,
} from './id3Parser';
import type { MusicProfile, SongMetadata, SongPalette } from '../types/game';

const DB_NAME = 'BeatflowHopLibraryDB';
const DB_VERSION = 1;
const STORE_META = 'songs_meta';
const STORE_BLOBS = 'songs_blobs';

interface StoredBlobRecord {
  id: string;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB'));
  });
}

export async function getAllSongs(): Promise<SongMetadata[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);
    const req = store.getAll();
    req.onsuccess = () => {
      const list = (req.result as SongMetadata[]) ?? [];
      list.sort((a, b) => b.addedAt - a.addedAt);
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getSongBlob(songId: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readonly');
    const req = tx.objectStore(STORE_BLOBS).get(songId);
    req.onsuccess = () => {
      const rec = req.result as StoredBlobRecord | undefined;
      resolve(rec?.blob ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getSongMetadataById(songId: string): Promise<SongMetadata | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get(songId);
    req.onsuccess = () => {
      resolve((req.result as SongMetadata | undefined) ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getSongPackageData(
  songId: string,
): Promise<{ blob: Blob; metadata: SongMetadata | null } | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META, STORE_BLOBS], 'readonly');
    const metaReq = tx.objectStore(STORE_META).get(songId);
    const blobReq = tx.objectStore(STORE_BLOBS).get(songId);
    let meta: SongMetadata | null = null;
    let blob: Blob | null = null;
    metaReq.onsuccess = () => {
      meta = (metaReq.result as SongMetadata | undefined) ?? null;
    };
    blobReq.onsuccess = () => {
      blob = (blobReq.result as StoredBlobRecord | undefined)?.blob ?? null;
    };
    tx.oncomplete = () => {
      if (!blob) {
        resolve(null);
        return;
      }
      resolve({ blob, metadata: meta });
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateSongMetadata(
  songId: string,
  patch: Partial<SongMetadata>,
): Promise<SongMetadata | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    const store = tx.objectStore(STORE_META);
    const getReq = store.get(songId);
    getReq.onsuccess = () => {
      const existing = getReq.result as SongMetadata | undefined;
      if (!existing) {
        resolve(null);
        return;
      }
      const updated: SongMetadata = { ...existing, ...patch };
      store.put(updated);
      tx.oncomplete = () => resolve(updated);
    };
    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveSongProfile(songId: string, profile: MusicProfile): Promise<void> {
  await updateSongMetadata(songId, { profile });
}

export async function toggleSongFavorite(songId: string): Promise<boolean> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    const store = tx.objectStore(STORE_META);
    const getReq = store.get(songId);
    let nextFav = false;
    getReq.onsuccess = () => {
      const existing = getReq.result as SongMetadata | undefined;
      if (!existing) {
        resolve(false);
        return;
      }
      nextFav = !existing.isFavorite;
      store.put({ ...existing, isFavorite: nextFav });
    };
    tx.oncomplete = () => resolve(nextFav);
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeSongFromLibrary(songId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META, STORE_BLOBS], 'readwrite');
    tx.objectStore(STORE_META).delete(songId);
    tx.objectStore(STORE_BLOBS).delete(songId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function measureAudioDuration(blob: Blob): Promise<number> {
  if (typeof Audio === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return 0;
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = 'metadata';
    const cleanup = () => {
      URL.revokeObjectURL(url);
    };
    audio.onloadedmetadata = () => {
      const d = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      cleanup();
      resolve(d);
    };
    audio.onerror = () => {
      cleanup();
      resolve(0);
    };
    audio.src = url;
  });
}

async function createContentSongId(bytes: ArrayBuffer, fileName: string): Promise<string> {
  const sizeStr = bytes.byteLength.toString(36);
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    try {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const arr = new Uint8Array(digest);
      let hex = '';
      for (let i = 0; i < 12; i++) {
        hex += arr[i].toString(16).padStart(2, '0');
      }
      return `song_${hex}_${sizeStr}`;
    } catch {
      // Fallback below
    }
  }
  const view = new Uint8Array(bytes);
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(view.length / 4096));
  for (let i = 0; i < view.length; i += step) {
    hash ^= view[i];
    hash = Math.imul(hash, 16777619);
  }
  for (let i = 0; i < fileName.length; i++) {
    hash ^= fileName.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `song_${(hash >>> 0).toString(36)}_${sizeStr}`;
}

export async function importAudioBlobToLibrary(params: {
  blob: Blob;
  fileName: string;
  mimeType?: string;
  title?: string;
  artist?: string;
  album?: string;
  durationSec?: number;
  palette?: SongPalette;
}): Promise<SongMetadata> {
  const arrayBuffer = await params.blob.arrayBuffer();
  const id = await createContentSongId(arrayBuffer, params.fileName);

  const existingMeta = await getSongMetadataById(id);
  const existingBlob = existingMeta ? await getSongBlob(id) : null;
  if (existingMeta && existingBlob && existingBlob.size === params.blob.size) {
    return existingMeta;
  }

  const mime = params.mimeType || params.blob.type || 'audio/mpeg';
  const storedBlob = new Blob([arrayBuffer], { type: mime });
  const id3 = parseMp3Id3Tags(arrayBuffer);
  const fallback = cleanTrackNameFromFilename(params.fileName);
  const measured = await measureAudioDuration(storedBlob);
  const duration = measured > 0 ? measured : Math.max(0, params.durationSec ?? 0);
  const palette =
    params.palette ??
    (await extractPaletteFromCoverArt(id3.coverArtDataUrl));

  const metadata: SongMetadata = {
    id,
    title: params.title?.trim() || id3.title || fallback.title,
    artist: params.artist?.trim() || id3.artist || fallback.artist,
    album: params.album?.trim() || id3.album || '',
    fileName: params.fileName,
    fileSize: storedBlob.size,
    duration,
    coverArtDataUrl: id3.coverArtDataUrl,
    palette,
    addedAt: Date.now(),
    isFavorite: false,
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_META, STORE_BLOBS], 'readwrite');
    tx.objectStore(STORE_META).put(metadata);
    tx.objectStore(STORE_BLOBS).put({ id, blob: storedBlob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return metadata;
}

function createSongId(file: File): string {
  const base = `${file.name}_${file.size}_${file.lastModified}`;
  let hash = 2166136261;
  for (let i = 0; i < base.length; i++) {
    hash ^= base.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `song_${(hash >>> 0).toString(36)}_${file.size.toString(36)}`;
}

export async function importMp3Files(
  files: FileList | File[],
  onProgress?: (done: number, total: number, fileName: string) => void,
): Promise<{ imported: SongMetadata[]; skipped: string[] }> {
  const fileArr = Array.from(files);
  const existingSongs = await getAllSongs();
  const existingIds = new Set(existingSongs.map((s) => s.id));

  const imported: SongMetadata[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < fileArr.length; i++) {
    const file = fileArr[i];
    onProgress?.(i, fileArr.length, file.name);

    const isAudio =
      file.type.startsWith('audio/') ||
      /\.(mp3|mpeg|mpga|wav|ogg|m4a)$/i.test(file.name);

    if (!isAudio) {
      skipped.push(file.name);
      continue;
    }

    const id = createSongId(file);
    if (existingIds.has(id)) {
      const existing = existingSongs.find((s) => s.id === id);
      if (existing) imported.push(existing);
      continue;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const id3 = parseMp3Id3Tags(arrayBuffer);
      const fallback = cleanTrackNameFromFilename(file.name);
      const duration = await measureAudioDuration(file);
      const palette = await extractPaletteFromCoverArt(id3.coverArtDataUrl);

      const metadata: SongMetadata = {
        id,
        title: id3.title || fallback.title,
        artist: id3.artist || fallback.artist,
        album: id3.album || '',
        fileName: file.name,
        fileSize: file.size,
        duration,
        coverArtDataUrl: id3.coverArtDataUrl,
        palette,
        addedAt: Date.now() + i,
        isFavorite: false,
      };

      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([STORE_META, STORE_BLOBS], 'readwrite');
        tx.objectStore(STORE_META).put(metadata);
        tx.objectStore(STORE_BLOBS).put({ id, blob: file });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      existingIds.add(id);
      imported.push(metadata);
    } catch {
      skipped.push(file.name);
    }
  }

  onProgress?.(fileArr.length, fileArr.length, '');
  return { imported, skipped };
}
