import JSZip from 'jszip';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { BeatflowLevelDocument } from '../types/creator';
import type { BackgroundLibraryCategory, DifficultyLevel, EnvironmentTheme } from '../types/game';
import {
  getEnvironmentCategory,
  resolveSafeEnvironmentTheme,
} from '../game/environments/environmentSelector';
import {
  CURRENT_BFN_SCHEMA_VERSION,
  REQUIRED_GAME_VERSION,
  collectAssetReferences,
  deserializeLevelDocumentJson,
  generateUniqueLevelId,
  prepareLevelForSerialization,
  serializeLevelDocumentJson,
} from './LevelSerializer';
import { validateLevelDocument } from './LevelValidator';
import {
  getSongPackageData,
  importAudioBlobToLibrary,
} from '../services/musicStorage';
import { saveCreatorLevel } from '../services/creatorLevelsStorage';

export const LEVEL_PACKAGE_FORMAT = 'beatflow-hop-level-package';
export const LEVEL_PACKAGE_FORMAT_VERSION = 1;

const MAX_ZIP_INPUT_BYTES = 80 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_LEVEL_JSON_BYTES = 15 * 1024 * 1024;
const MAX_AUDIO_BYTES = 60 * 1024 * 1024;
const ANDROID_EXPORT_DIR = 'beatflow_exports';

const FORBIDDEN_ZIP_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.html',
  '.htm',
  '.svg',
  '.exe',
  '.dll',
  '.bat',
  '.cmd',
  '.sh',
  '.ps1',
  '.apk',
  '.dex',
  '.jar',
  '.vbs',
]);

const ALLOWED_AUDIO_EXTENSIONS = new Set([
  'mp3',
  'mpeg',
  'mpga',
  'wav',
  'ogg',
  'm4a',
  'aac',
  'flac',
  'webm',
]);

export interface BeatflowZipManifest {
  format: typeof LEVEL_PACKAGE_FORMAT;
  formatVersion: number;
  gameVersion: string;
  schemaVersion: number;
  exportedAt: string;
  levelFile: string;
  level: {
    levelId: string;
    levelName: string;
    authorId: string;
    authorName: string;
    difficulty: DifficultyLevel;
    environmentTheme: EnvironmentTheme;
    environmentCategory?: BackgroundLibraryCategory;
    objectCount: number;
  };
  audio: {
    included: boolean;
    filePath?: string;
    originalFileName?: string;
    extension?: string;
    mimeType?: string;
    byteLength?: number;
    originalSongId?: string;
    title: string;
    artist: string;
    bpm: number;
    offsetMs: number;
    durationSec: number;
  };
}

export interface BuildZipResult {
  ok: boolean;
  zipBlob?: Blob;
  zipBytes?: Uint8Array;
  fileName?: string;
  manifest?: BeatflowZipManifest;
  error?: string;
}

export interface ExportZipResult {
  ok: boolean;
  cancelled?: boolean;
  platform?: 'native' | 'web';
  fileName?: string;
  activityType?: string;
  error?: string;
}

export interface ImportZipResult {
  ok: boolean;
  level?: BeatflowLevelDocument;
  manifest?: BeatflowZipManifest;
  importedAudioTitle?: string;
  error?: string;
}

function sanitizeBaseName(raw: string, fallback = 'nivel_beatflow'): string {
  const cleaned = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return cleaned || fallback;
}

function extractExtension(fileName: string, mimeType?: string): string {
  const match = /\.([a-zA-Z0-9]{1,8})$/.exec(fileName.trim());
  if (match) {
    const ext = match[1].toLowerCase();
    if (ALLOWED_AUDIO_EXTENSIONS.has(ext)) return ext;
  }
  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('aac')) return 'aac';
  if (mime.includes('flac')) return 'flac';
  if (mime.includes('webm')) return 'webm';
  return 'mp3';
}

function mimeFromExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'm4a':
      return 'audio/mp4';
    case 'aac':
      return 'audio/aac';
    case 'flac':
      return 'audio/flac';
    case 'webm':
      return 'audio/webm';
    case 'mp3':
    case 'mpeg':
    case 'mpga':
    default:
      return 'audio/mpeg';
  }
}

function resolveSafeAudioMime(rawMime: string | undefined, ext: string): string {
  const clean = (rawMime || '').split(';')[0].trim().toLowerCase();
  if (clean.startsWith('audio/') || clean === 'application/ogg') {
    return clean;
  }
  return mimeFromExtension(ext);
}

export function isSafeZipEntryPath(entryPath: string): boolean {
  if (!entryPath || typeof entryPath !== 'string') return false;
  if (entryPath.includes('\0') || entryPath.includes('\\') || entryPath.includes(':')) {
    return false;
  }
  if (entryPath.startsWith('/') || entryPath.startsWith('.')) return false;
  const segments = entryPath.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return false;
  for (const seg of segments) {
    if (seg === '.' || seg === '..') return false;
  }
  const lower = entryPath.toLowerCase();
  for (const ext of FORBIDDEN_ZIP_EXTENSIONS) {
    if (lower.endsWith(ext)) return false;
  }
  return true;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(''));
}

function isCancelError(err: unknown): boolean {
  if (!err) return false;
  const name = err instanceof Error ? err.name.toLowerCase() : '';
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    name === 'aborterror' ||
    msg.includes('cancel') ||
    msg.includes('abort') ||
    msg.includes('dismissed')
  );
}

async function cleanupStaleAndroidCacheExports(): Promise<void> {
  try {
    const res = await Filesystem.readdir({
      path: ANDROID_EXPORT_DIR,
      directory: Directory.Cache,
    });
    const now = Date.now();
    for (const entry of res.files) {
      if (entry.type !== 'file') continue;
      const ageMs = now - (entry.mtime || 0);
      if (ageMs > 60_000 || res.files.length > 4) {
        await Filesystem.deleteFile({
          path: `${ANDROID_EXPORT_DIR}/${entry.name}`,
          directory: Directory.Cache,
        }).catch(() => {});
      }
    }
  } catch {
    // Cache folder may not exist yet
  }
}

export async function buildLevelZipPackage(doc: BeatflowLevelDocument): Promise<BuildZipResult> {
  const prepared = prepareLevelForSerialization(doc, { preserveUpdatedDate: true });
  const zip = new JSZip();

  let audioIncluded = false;
  let audioZipPath: string | undefined;
  let audioOriginalName: string | undefined;
  let audioExt: string | undefined;
  let audioMime: string | undefined;
  let audioByteLength: number | undefined;

  if (prepared.audio.songId) {
    const songData = await getSongPackageData(prepared.audio.songId);
    if (!songData || !songData.blob || songData.blob.size === 0) {
      return {
        ok: false,
        error:
          'Este nivel tiene una canción vinculada, pero el archivo de audio no se encontró en la biblioteca local. Vincula o reimporta la canción antes de exportar el ZIP.',
      };
    }

    const rawBytes = new Uint8Array(await songData.blob.arrayBuffer());
    if (rawBytes.byteLength === 0) {
      return {
        ok: false,
        error: 'El archivo de audio vinculado está vacío y no puede empaquetarse.',
      };
    }

    const origFileName =
      songData.metadata?.fileName ||
      `${sanitizeBaseName(prepared.audio.title || 'audio', 'audio')}.mp3`;
    audioExt = extractExtension(origFileName, songData.blob.type);
    audioMime = resolveSafeAudioMime(songData.blob.type, audioExt);
    const safeAudioStem = sanitizeBaseName(
      origFileName.replace(/\.[^.]+$/, ''),
      'track',
    );
    audioZipPath = `audio/${safeAudioStem}.${audioExt}`;
    audioOriginalName = origFileName;
    audioByteLength = rawBytes.byteLength;
    audioIncluded = true;

    // Store raw original audio bytes with STORE compression (lossless, fast, zero re-encoding)
    zip.file(audioZipPath, rawBytes, { compression: 'STORE' });
  }

  const manifest: BeatflowZipManifest = {
    format: LEVEL_PACKAGE_FORMAT,
    formatVersion: LEVEL_PACKAGE_FORMAT_VERSION,
    gameVersion: REQUIRED_GAME_VERSION,
    schemaVersion: CURRENT_BFN_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    levelFile: 'level.json',
    level: {
      levelId: prepared.levelId,
      levelName: prepared.levelName,
      authorId: prepared.authorId,
      authorName: prepared.authorName,
      difficulty: prepared.difficulty,
      environmentTheme: resolveSafeEnvironmentTheme(prepared.environmentTheme),
      environmentCategory: getEnvironmentCategory(
        resolveSafeEnvironmentTheme(prepared.environmentTheme),
      ),
      objectCount: prepared.objects.length,
    },
    audio: {
      included: audioIncluded,
      filePath: audioZipPath,
      originalFileName: audioOriginalName,
      extension: audioExt,
      mimeType: audioMime,
      byteLength: audioByteLength,
      originalSongId: prepared.audio.songId,
      title: prepared.audio.title,
      artist: prepared.audio.artist,
      bpm: prepared.audio.bpm,
      offsetMs: prepared.audio.offsetMs,
      durationSec: prepared.audio.durationSec,
    },
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('level.json', serializeLevelDocumentJson(prepared));

  const zipBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const zipArrayBuffer = zipBytes.buffer.slice(
    zipBytes.byteOffset,
    zipBytes.byteOffset + zipBytes.byteLength,
  ) as ArrayBuffer;
  const zipBlob = new Blob([zipArrayBuffer], { type: 'application/zip' });
  const fileName = `${sanitizeBaseName(prepared.levelName, 'nivel_beatflow')}.zip`;

  return {
    ok: true,
    zipBlob,
    zipBytes,
    fileName,
    manifest,
  };
}

export async function exportLevelAsZipPackage(
  doc: BeatflowLevelDocument,
): Promise<ExportZipResult> {
  const built = await buildLevelZipPackage(doc);
  if (!built.ok || !built.zipBlob || !built.zipBytes || !built.fileName) {
    return {
      ok: false,
      error: built.error ?? 'No se pudo construir el paquete ZIP del nivel.',
    };
  }

  if (Capacitor.isNativePlatform()) {
    await cleanupStaleAndroidCacheExports();

    const uniqueName = `${sanitizeBaseName(doc.levelName, 'nivel')}_${Date.now().toString(36)}.zip`;
    const tempPath = `${ANDROID_EXPORT_DIR}/${uniqueName}`;
    let writtenUri = '';

    try {
      const base64Data = uint8ArrayToBase64(built.zipBytes);
      const writeResult = await Filesystem.writeFile({
        path: tempPath,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true,
      });
      writtenUri = writeResult.uri;
      if (!writtenUri) {
        const uriRes = await Filesystem.getUri({
          path: tempPath,
          directory: Directory.Cache,
        });
        writtenUri = uriRes.uri;
      }
      if (!writtenUri) {
        return {
          ok: false,
          error: 'No se pudo obtener la ruta temporal del archivo ZIP en el dispositivo.',
        };
      }

      const canShare = await Share.canShare();
      if (!canShare.value) {
        await Filesystem.deleteFile({ path: tempPath, directory: Directory.Cache }).catch(() => {});
        return {
          ok: false,
          error: 'El sistema nativo de compartir no está disponible en este dispositivo.',
        };
      }

      const shareRes = await Share.share({
        title: `${doc.levelName} — BeatFlow Hop`,
        text: `Nivel de BeatFlow Hop: ${doc.levelName} (${doc.objects.length} objetos)`,
        files: [writtenUri],
        dialogTitle: 'Compartir paquete de nivel (.zip)',
      });

      // Keep FileProvider URI alive briefly while receiving app reads stream, then delete temp file
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          void Filesystem.deleteFile({
            path: tempPath,
            directory: Directory.Cache,
          }).catch(() => {});
        }, 60_000);
      }

      return {
        ok: true,
        platform: 'native',
        fileName: built.fileName,
        activityType: shareRes.activityType,
      };
    } catch (err) {
      await Filesystem.deleteFile({ path: tempPath, directory: Directory.Cache }).catch(() => {});
      if (isCancelError(err)) {
        return {
          ok: false,
          cancelled: true,
          error: 'Compartir cancelado por el usuario.',
        };
      }
      return {
        ok: false,
        error:
          err instanceof Error
            ? `No se pudo compartir el archivo ZIP: ${err.message}`
            : 'No se pudo compartir el archivo ZIP en Android.',
      };
    }
  }

  // Browser fallback download (.zip)
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return {
      ok: false,
      error: 'La descarga de archivos no está disponible en este entorno.',
    };
  }

  const url = URL.createObjectURL(built.zipBlob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = built.fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return {
    ok: true,
    platform: 'web',
    fileName: built.fileName,
  };
}

function hasZipMagicBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06))
  );
}

export async function importLevelFromZipInput(
  input: File | Blob | ArrayBuffer | Uint8Array,
): Promise<ImportZipResult> {
  try {
    let bytes: Uint8Array;
    if (input instanceof Uint8Array) {
      bytes = input;
    } else if (input instanceof ArrayBuffer) {
      bytes = new Uint8Array(input);
    } else {
      if (input.size <= 0) {
        return { ok: false, error: 'El archivo seleccionado está vacío.' };
      }
      if (input.size > MAX_ZIP_INPUT_BYTES) {
        return { ok: false, error: 'El paquete ZIP supera el límite permitido (80 MB).' };
      }
      bytes = new Uint8Array(await input.arrayBuffer());
    }

    if (bytes.byteLength === 0 || bytes.byteLength > MAX_ZIP_INPUT_BYTES) {
      return { ok: false, error: 'El tamaño del paquete ZIP es inválido.' };
    }
    if (!hasZipMagicBytes(bytes)) {
      return { ok: false, error: 'El archivo seleccionado no es un paquete ZIP válido.' };
    }

    const zip = await JSZip.loadAsync(bytes);
    const entryNames = Object.keys(zip.files);
    if (entryNames.length === 0 || entryNames.length > 64) {
      return { ok: false, error: 'Estructura del paquete ZIP inválida.' };
    }

    for (const name of entryNames) {
      const entry = zip.files[name];
      if (entry.dir) continue;
      if (!isSafeZipEntryPath(name)) {
        return {
          ok: false,
          error: `Paquete ZIP rechazado: contiene una ruta o archivo inseguro (${name}).`,
        };
      }
    }

    const manifestEntry = zip.file('manifest.json');
    if (!manifestEntry) {
      return { ok: false, error: 'Paquete ZIP inválido: falta manifest.json.' };
    }

    const manifestBytes = await manifestEntry.async('uint8array');
    if (manifestBytes.byteLength === 0 || manifestBytes.byteLength > MAX_MANIFEST_BYTES) {
      return { ok: false, error: 'El archivo manifest.json tiene un tamaño inválido.' };
    }

    let manifest: BeatflowZipManifest;
    try {
      const rawManifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Record<
        string,
        unknown
      >;
      if (
        !rawManifest ||
        typeof rawManifest !== 'object' ||
        rawManifest.format !== LEVEL_PACKAGE_FORMAT
      ) {
        return { ok: false, error: 'Este archivo ZIP no corresponde a un nivel de BEATFLOW HOP.' };
      }
      if (
        typeof rawManifest.formatVersion !== 'number' ||
        !Number.isInteger(rawManifest.formatVersion) ||
        rawManifest.formatVersion < 1 ||
        rawManifest.formatVersion > LEVEL_PACKAGE_FORMAT_VERSION
      ) {
        return {
          ok: false,
          error: `Versión de paquete ZIP no compatible (${String(rawManifest.formatVersion)}).`,
        };
      }
      if (
        typeof rawManifest.levelFile !== 'string' ||
        !isSafeZipEntryPath(rawManifest.levelFile)
      ) {
        return { ok: false, error: 'Referencia al documento del nivel inválida en manifest.json.' };
      }
      manifest = rawManifest as unknown as BeatflowZipManifest;
    } catch {
      return { ok: false, error: 'El archivo manifest.json del ZIP está corrupto.' };
    }

    const levelEntry = zip.file(manifest.levelFile);
    if (!levelEntry) {
      return {
        ok: false,
        error: `Paquete ZIP incompleto: falta el archivo "${manifest.levelFile}".`,
      };
    }

    const levelBytes = await levelEntry.async('uint8array');
    if (levelBytes.byteLength === 0 || levelBytes.byteLength > MAX_LEVEL_JSON_BYTES) {
      return { ok: false, error: 'El documento del nivel dentro del ZIP excede el tamaño válido.' };
    }

    const levelJsonText = new TextDecoder().decode(levelBytes);
    const deserialized = deserializeLevelDocumentJson(levelJsonText);
    if (!deserialized.ok || !deserialized.level) {
      return { ok: false, error: deserialized.error ?? 'Documento de nivel inválido.' };
    }

    const validation = validateLevelDocument(deserialized.level);
    if (!validation.valid) {
      return {
        ok: false,
        error: validation.errors[0]?.message ?? 'El nivel importado contiene errores estructurales.',
      };
    }

    let importedDoc: BeatflowLevelDocument = structuredClone(deserialized.level);
    let importedAudioTitle: string | undefined;

    if (manifest.audio?.included) {
      const audioPath = manifest.audio.filePath;
      if (!audioPath || !isSafeZipEntryPath(audioPath)) {
        return { ok: false, error: 'Ruta de audio inválida en el paquete ZIP.' };
      }
      const audioEntry = zip.file(audioPath);
      if (!audioEntry) {
        return {
          ok: false,
          error: 'Paquete ZIP incompleto: falta el archivo de música declarado en el manifest.',
        };
      }

      const audioBytes = await audioEntry.async('uint8array');
      if (audioBytes.byteLength === 0 || audioBytes.byteLength > MAX_AUDIO_BYTES) {
        return { ok: false, error: 'El archivo de audio dentro del ZIP está vacío o excede el límite permitido.' };
      }

      const fileName =
        manifest.audio.originalFileName ||
        audioPath.split('/').pop() ||
        `${sanitizeBaseName(importedDoc.audio.title || 'audio', 'audio')}.mp3`;
      const ext = extractExtension(fileName, manifest.audio.mimeType);
      const mimeType = resolveSafeAudioMime(manifest.audio.mimeType, ext);
      const audioBuffer = audioBytes.buffer.slice(
        audioBytes.byteOffset,
        audioBytes.byteOffset + audioBytes.byteLength,
      ) as ArrayBuffer;
      const audioBlob = new Blob([audioBuffer], { type: mimeType });

      const savedSong = await importAudioBlobToLibrary({
        blob: audioBlob,
        fileName,
        mimeType,
        title: manifest.audio.title || importedDoc.audio.title,
        artist: manifest.audio.artist || importedDoc.audio.artist,
        durationSec: manifest.audio.durationSec || importedDoc.audio.durationSec,
        palette: importedDoc.audio.palette,
      });

      importedDoc.audio = {
        ...importedDoc.audio,
        songId: savedSong.id,
        title: importedDoc.audio.title || savedSong.title,
        artist: importedDoc.audio.artist || savedSong.artist,
        durationSec:
          importedDoc.audio.durationSec > 0
            ? importedDoc.audio.durationSec
            : savedSong.duration || 60,
      };
      importedAudioTitle = savedSong.title;
    } else {
      // No audio embedded in package: ensure we don't point to a nonexistent foreign songId
      if (importedDoc.audio.songId && !importedDoc.audio.songId.startsWith('xai-')) {
        importedDoc.audio = { ...importedDoc.audio, songId: undefined };
      }
    }

    // Assign a new independent local levelId so imports never silently overwrite existing levels
    const nowIso = new Date().toISOString();
    importedDoc = {
      ...importedDoc,
      levelId: generateUniqueLevelId(),
      updatedDate: nowIso,
    };
    importedDoc.assetReferences = collectAssetReferences(importedDoc);

    const saved = await saveCreatorLevel(importedDoc, {
      setActive: true,
      preserveUpdatedDate: true,
    });

    return {
      ok: true,
      level: saved,
      manifest,
      importedAudioTitle,
    };
  } catch {
    return {
      ok: false,
      error: 'El archivo ZIP está dañado o no pudo abrirse.',
    };
  }
}
