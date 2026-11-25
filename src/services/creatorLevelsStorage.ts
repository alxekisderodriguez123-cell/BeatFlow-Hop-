import type { BeatflowLevelDocument } from '../types/creator';
import {
  createEmptyLevelDocument,
  generateUniqueLevelId,
  migrateLevelDocument,
  prepareLevelForSerialization,
} from '../creator/LevelSerializer';
import {
  CREATOR_BUILD_ITEMS,
  createObjectFromBuildItem,
} from '../creator/ObjectLibrary';

const LEGACY_CREATOR_LEVELS_KEY = 'beatflow_creator_levels_v1';
const CREATOR_ACTIVE_ID_KEY = 'beatflow_creator_active_id_v1';

const CREATOR_DB_NAME = 'BeatflowHopCreatorDB';
const CREATOR_DB_VERSION = 1;
const STORE_LEVELS = 'levels';
const STORE_META = 'creator_meta';

const META_ACTIVE_LEVEL_ID = 'activeLevelId';
const META_MIGRATION_V1_DONE = 'migration_v1_done';
const META_STARTERS_SEEDED = 'starters_seeded';

interface MetaRecord {
  key: string;
  value: unknown;
}

export interface MigrationStatus {
  migratedCount: number;
  verified: boolean;
  legacyCleared: boolean;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let initPromise: Promise<MigrationStatus> | null = null;
const levelOpQueues = new Map<string, Promise<unknown>>();
const memoryFallbackLevels = new Map<string, BeatflowLevelDocument>();
let memoryFallbackActiveId: string | null = null;

function buildStarterTemplates(): BeatflowLevelDocument[] {
  const classic = createEmptyLevelDocument({
    levelId: 'demo-xanderai-neon-pulse',
    levelName: 'Neon Pulse Showcase',
    authorId: 'xanderai-official',
    authorName: 'XanderAI Games',
    environmentTheme: 'cyberpunk',
    difficulty: 'normal',
    bpm: 128,
    durationSec: 36,
    songTitle: 'Cyber Pulse (Demo)',
    songArtist: 'XanderAI Games',
  });
  classic.description =
    'Plantilla oficial basada en casillas (Cuadrado, Círculo, Triángulo, Diamante y Largas) con triggers de Camera FX, Pulses y Backgrounds.';

  const squareItem = CREATOR_BUILD_ITEMS.find((i) => i.id === 'casilla_square')!;
  const circleItem = CREATOR_BUILD_ITEMS.find((i) => i.id === 'casilla_circle')!;
  const triItem = CREATOR_BUILD_ITEMS.find((i) => i.id === 'casilla_triangle')!;
  const diamondItem = CREATOR_BUILD_ITEMS.find((i) => i.id === 'casilla_diamond')!;
  const longItem = CREATOR_BUILD_ITEMS.find((i) => i.id === 'casilla_long')!;
  const zoomFxItem = CREATOR_BUILD_ITEMS.find((i) => i.id === 'fx_zoom')!;
  const chromaFxItem = CREATOR_BUILD_ITEMS.find((i) => i.id === 'fx_chromatic')!;
  const pulse4Item = CREATOR_BUILD_ITEMS.find((i) => i.id === 'pulse_borders_4')!;
  const bgColorItem = CREATOR_BUILD_ITEMS.find((i) => i.id === 'bg_color')!;

  const beat = 60 / 128;
  const shapes = [squareItem, circleItem, triItem, diamondItem];
  for (let i = 0; i < 24; i++) {
    const t = 1.5 + i * beat;
    const lane = i % 4;
    const item = i % 6 === 5 ? longItem : shapes[i % shapes.length];
    const obj = createObjectFromBuildItem(item, {
      timeSec: t,
      lane,
      laneCount: 4,
    });
    if (i % 6 === 5 && obj.noteData) {
      obj.noteData.durationSec = beat * 1.5;
    }
    classic.objects.push(obj);
  }

  classic.objects.push(
    createObjectFromBuildItem(pulse4Item, { timeSec: beat * 4, lane: -1, laneCount: 4 }),
    createObjectFromBuildItem(zoomFxItem, { timeSec: beat * 8, lane: -1, laneCount: 4 }),
    createObjectFromBuildItem(bgColorItem, { timeSec: beat * 12, lane: -1, laneCount: 4 }),
    createObjectFromBuildItem(chromaFxItem, { timeSec: beat * 16, lane: -1, laneCount: 4 }),
  );
  classic.objects.sort((a, b) => a.timeSec - b.timeSec);

  const tropical = createEmptyLevelDocument({
    levelId: 'demo-xanderai-sunset-hop',
    levelName: 'Tropical Sunset Hop',
    authorId: 'xanderai-official',
    authorName: 'XanderAI Games',
    environmentTheme: 'tropical',
    difficulty: 'hard',
    bpm: 136,
    durationSec: 32,
    songTitle: 'Golden Horizon (Demo)',
    songArtist: 'XanderAI Games',
  });
  tropical.description =
    'Secuencia rítmica en 4 carriles con combos de color, casillas largas y pulsos reactivos al compás.';
  tropical.audio.palette = {
    primary: '#fb923c',
    secondary: '#fb7185',
    accent: '#fde047',
  };

  const tBeat = 60 / 136;
  for (let i = 0; i < 20; i++) {
    const t = 1.2 + i * tBeat;
    const lane = (i * 3) % 4;
    const item = i % 5 === 4 ? longItem : shapes[i % shapes.length];
    const obj = createObjectFromBuildItem(item, {
      timeSec: t,
      lane,
      laneCount: 4,
      primaryPaletteColor: '#fb923c',
      secondaryPaletteColor: '#fb7185',
    });
    if (obj.material) {
      obj.material.colorComboMode = i % 2 === 0 ? 'gradient' : 'solid';
    }
    tropical.objects.push(obj);
  }
  tropical.objects.push(
    createObjectFromBuildItem(pulse4Item, { timeSec: tBeat * 4, lane: -1, laneCount: 4 }),
    createObjectFromBuildItem(zoomFxItem, { timeSec: tBeat * 10, lane: -1, laneCount: 4 }),
  );
  tropical.objects.sort((a, b) => a.timeSec - b.timeSec);

  return [classic, tropical];
}

export function getStarterCreatorTemplates(): BeatflowLevelDocument[] {
  return buildStarterTemplates();
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openCreatorDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(CREATOR_DB_NAME, CREATOR_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_LEVELS)) {
          db.createObjectStore(STORE_LEVELS, { keyPath: 'levelId' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error ?? new Error('No se pudo abrir la base de datos de niveles.'));
      };
    });
  }
  return dbPromise;
}

function enqueueLevelOp<T>(levelId: string, op: () => Promise<T>): Promise<T> {
  const prev = levelOpQueues.get(levelId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(op);
  const cleanup = next.then(
    () => undefined,
    () => undefined,
  );
  levelOpQueues.set(levelId, cleanup);
  void cleanup.then(() => {
    if (levelOpQueues.get(levelId) === cleanup) {
      levelOpQueues.delete(levelId);
    }
  });
  return next;
}

async function readMetaValue<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => {
      const rec = req.result as MetaRecord | undefined;
      resolve(rec ? (rec.value as T) : undefined);
    };
    req.onerror = () => reject(req.error);
  });
}

async function writeMetaValue(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put({ key, value } satisfies MetaRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllLevelKeys(db: IDBDatabase): Promise<Set<string>> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LEVELS, 'readonly');
    const req = tx.objectStore(STORE_LEVELS).getAllKeys();
    req.onsuccess = () => {
      const keys = (req.result as IDBValidKey[]) ?? [];
      resolve(new Set(keys.map((k) => String(k))));
    };
    req.onerror = () => reject(req.error);
  });
}

function readLegacyLevelsFromLocalStorage(): BeatflowLevelDocument[] | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LEGACY_CREATOR_LEVELS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const migrated: BeatflowLevelDocument[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const doc = migrateLevelDocument(item as Record<string, unknown>);
      if (!doc.levelId || seen.has(doc.levelId)) {
        doc.levelId = generateUniqueLevelId();
      }
      seen.add(doc.levelId);
      migrated.push(doc);
    }
    return migrated;
  } catch {
    return null;
  }
}

async function performInitAndMigration(): Promise<MigrationStatus> {
  if (!hasIndexedDb()) {
    const legacy = readLegacyLevelsFromLocalStorage();
    const initial = legacy && legacy.length > 0 ? legacy : buildStarterTemplates();
    for (const doc of initial) {
      if (!memoryFallbackLevels.has(doc.levelId)) {
        memoryFallbackLevels.set(doc.levelId, structuredClone(doc));
      }
    }
    return { migratedCount: legacy?.length ?? 0, verified: true, legacyCleared: false };
  }

  const db = await openCreatorDb();
  let migratedCount = 0;
  let verified = true;
  let legacyCleared = false;

  const legacyLevels = readLegacyLevelsFromLocalStorage();
  if (legacyLevels !== null) {
    if (legacyLevels.length > 0) {
      const existingKeys = await getAllLevelKeys(db);
      const toInsert = legacyLevels.filter((lvl) => !existingKeys.has(lvl.levelId));

      if (toInsert.length > 0) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_LEVELS, 'readwrite');
          const store = tx.objectStore(STORE_LEVELS);
          for (const doc of toInsert) {
            store.put(prepareLevelForSerialization(doc, { preserveUpdatedDate: true }));
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }

      const verifiedKeys = await getAllLevelKeys(db);
      verified = legacyLevels.every((lvl) => verifiedKeys.has(lvl.levelId));
      migratedCount = legacyLevels.length;
    }

    if (verified) {
      await writeMetaValue(db, META_MIGRATION_V1_DONE, true);
      await writeMetaValue(db, META_STARTERS_SEEDED, true);
      try {
        localStorage.removeItem(LEGACY_CREATOR_LEVELS_KEY);
        legacyCleared = true;
      } catch {
        legacyCleared = false;
      }
    }
  }

  // Seed starter templates only on a genuinely fresh install with zero records
  const existingKeysAfterMigration = await getAllLevelKeys(db);
  const startersSeeded = await readMetaValue<boolean>(db, META_STARTERS_SEEDED);
  if (existingKeysAfterMigration.size === 0 && !startersSeeded) {
    const starters = buildStarterTemplates();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_LEVELS, STORE_META], 'readwrite');
      const store = tx.objectStore(STORE_LEVELS);
      for (const starter of starters) {
        store.put(prepareLevelForSerialization(starter, { preserveUpdatedDate: true }));
      }
      tx.objectStore(STORE_META).put({
        key: META_STARTERS_SEEDED,
        value: true,
      } satisfies MetaRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Sync legacy activeLevelId into IndexedDB meta if not set yet
  const storedActiveId = await readMetaValue<string | null>(db, META_ACTIVE_LEVEL_ID);
  if (storedActiveId === undefined && typeof localStorage !== 'undefined') {
    try {
      const legacyActive = localStorage.getItem(CREATOR_ACTIVE_ID_KEY);
      if (legacyActive) {
        await writeMetaValue(db, META_ACTIVE_LEVEL_ID, legacyActive);
      }
    } catch {
      // Ignore
    }
  }

  return { migratedCount, verified, legacyCleared };
}

export async function initCreatorLevelsStorage(): Promise<MigrationStatus> {
  if (!initPromise) {
    initPromise = performInitAndMigration().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

function sortLevelsByUpdated(list: BeatflowLevelDocument[]): BeatflowLevelDocument[] {
  return [...list].sort((a, b) => {
    const ta = Date.parse(b.updatedDate || b.creationDate || '') || 0;
    const tb = Date.parse(a.updatedDate || a.creationDate || '') || 0;
    return ta - tb;
  });
}

export async function loadAllCreatorLevels(): Promise<BeatflowLevelDocument[]> {
  await initCreatorLevelsStorage();
  if (!hasIndexedDb()) {
    return sortLevelsByUpdated(
      Array.from(memoryFallbackLevels.values()).map((d) => structuredClone(d)),
    );
  }
  const db = await openCreatorDb();
  const rawList = await new Promise<BeatflowLevelDocument[]>((resolve, reject) => {
    const tx = db.transaction(STORE_LEVELS, 'readonly');
    const req = tx.objectStore(STORE_LEVELS).getAll();
    req.onsuccess = () => resolve((req.result as BeatflowLevelDocument[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  return sortLevelsByUpdated(
    rawList.map((raw) => migrateLevelDocument(raw as unknown as Record<string, unknown>)),
  );
}

export async function getCreatorLevelById(
  levelId: string,
): Promise<BeatflowLevelDocument | null> {
  if (!levelId) return null;
  await initCreatorLevelsStorage();
  if (!hasIndexedDb()) {
    const found = memoryFallbackLevels.get(levelId);
    return found ? structuredClone(found) : null;
  }
  const db = await openCreatorDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LEVELS, 'readonly');
    const req = tx.objectStore(STORE_LEVELS).get(levelId);
    req.onsuccess = () => {
      const rec = req.result as Record<string, unknown> | undefined;
      resolve(rec ? migrateLevelDocument(rec) : null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveCreatorLevel(
  level: BeatflowLevelDocument,
  options: { setActive?: boolean; preserveUpdatedDate?: boolean } = {},
): Promise<BeatflowLevelDocument> {
  await initCreatorLevelsStorage();
  const targetId = level.levelId || generateUniqueLevelId();
  const snapshotCopy = structuredClone({ ...level, levelId: targetId });

  return enqueueLevelOp(targetId, async () => {
    const prepared = prepareLevelForSerialization(snapshotCopy, {
      preserveUpdatedDate: options.preserveUpdatedDate,
    });

    if (!hasIndexedDb()) {
      memoryFallbackLevels.set(prepared.levelId, structuredClone(prepared));
      if (options.setActive) {
        memoryFallbackActiveId = prepared.levelId;
      }
      return structuredClone(prepared);
    }

    const db = await openCreatorDb();
    await new Promise<void>((resolve, reject) => {
      const stores = options.setActive ? [STORE_LEVELS, STORE_META] : [STORE_LEVELS];
      const tx = db.transaction(stores, 'readwrite');
      tx.objectStore(STORE_LEVELS).put(prepared);
      if (options.setActive) {
        tx.objectStore(STORE_META).put({
          key: META_ACTIVE_LEVEL_ID,
          value: prepared.levelId,
        } satisfies MetaRecord);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    if (options.setActive && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(CREATOR_ACTIVE_ID_KEY, prepared.levelId);
      } catch {
        // Ignore
      }
    }

    return structuredClone(prepared);
  });
}

export async function createNewCreatorLevel(
  options: Parameters<typeof createEmptyLevelDocument>[0] = {},
): Promise<BeatflowLevelDocument> {
  const fresh = createEmptyLevelDocument({
    ...options,
    levelId: options.levelId || generateUniqueLevelId(),
  });
  return saveCreatorLevel(fresh, { setActive: true, preserveUpdatedDate: true });
}

export async function duplicateCreatorLevel(
  source: BeatflowLevelDocument,
  customName?: string,
): Promise<BeatflowLevelDocument> {
  await initCreatorLevelsStorage();
  const latestFromDb = await getCreatorLevelById(source.levelId);
  const baseDoc = structuredClone(latestFromDb ?? source);
  const nowIso = new Date().toISOString();
  const copyName = (customName ?? `${baseDoc.levelName} (Copia)`).trim().slice(0, 64);

  const duplicated: BeatflowLevelDocument = {
    ...baseDoc,
    levelId: generateUniqueLevelId(),
    levelName: copyName || `${baseDoc.levelName} (Copia)`,
    creationDate: nowIso,
    updatedDate: nowIso,
    version: 1,
  };

  return saveCreatorLevel(duplicated, { setActive: false, preserveUpdatedDate: true });
}

export async function renameCreatorLevel(
  levelId: string,
  newName: string,
): Promise<BeatflowLevelDocument | null> {
  const cleanName = newName.trim().slice(0, 64);
  if (!levelId || !cleanName) return null;
  await initCreatorLevelsStorage();

  return enqueueLevelOp(levelId, async () => {
    if (!hasIndexedDb()) {
      const existing = memoryFallbackLevels.get(levelId);
      if (!existing) return null;
      const updated: BeatflowLevelDocument = {
        ...structuredClone(existing),
        levelName: cleanName,
        updatedDate: new Date().toISOString(),
      };
      memoryFallbackLevels.set(levelId, updated);
      return structuredClone(updated);
    }

    const db = await openCreatorDb();
    const existing = await new Promise<BeatflowLevelDocument | null>((resolve, reject) => {
      const tx = db.transaction(STORE_LEVELS, 'readonly');
      const req = tx.objectStore(STORE_LEVELS).get(levelId);
      req.onsuccess = () => {
        const rec = req.result as Record<string, unknown> | undefined;
        resolve(rec ? migrateLevelDocument(rec) : null);
      };
      req.onerror = () => reject(req.error);
    });

    if (!existing) return null;

    const updated = prepareLevelForSerialization({
      ...existing,
      levelId,
      levelName: cleanName,
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LEVELS, 'readwrite');
      tx.objectStore(STORE_LEVELS).put(updated);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return structuredClone(updated);
  });
}

export async function deleteCreatorLevel(levelId: string): Promise<BeatflowLevelDocument[]> {
  await initCreatorLevelsStorage();
  if (!levelId) return loadAllCreatorLevels();

  await enqueueLevelOp(levelId, async () => {
    if (!hasIndexedDb()) {
      memoryFallbackLevels.delete(levelId);
      if (memoryFallbackActiveId === levelId) {
        const next = Array.from(memoryFallbackLevels.values())[0];
        memoryFallbackActiveId = next?.levelId ?? null;
      }
      return;
    }

    const db = await openCreatorDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LEVELS, 'readwrite');
      tx.objectStore(STORE_LEVELS).delete(levelId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });

  const remaining = await loadAllCreatorLevels();
  const currentActive = await loadActiveCreatorLevelId();
  if (currentActive === levelId) {
    await saveActiveCreatorLevelId(remaining[0]?.levelId ?? null);
  }
  return remaining;
}

export async function loadActiveCreatorLevelId(): Promise<string | null> {
  await initCreatorLevelsStorage();
  if (!hasIndexedDb()) {
    return memoryFallbackActiveId;
  }
  const db = await openCreatorDb();
  const val = await readMetaValue<string | null>(db, META_ACTIVE_LEVEL_ID);
  if (typeof val === 'string' && val.length > 0) return val;
  if (typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(CREATOR_ACTIVE_ID_KEY);
    } catch {
      return null;
    }
  }
  return null;
}

export async function saveActiveCreatorLevelId(levelId: string | null): Promise<void> {
  await initCreatorLevelsStorage();
  if (!hasIndexedDb()) {
    memoryFallbackActiveId = levelId;
    return;
  }
  const db = await openCreatorDb();
  await writeMetaValue(db, META_ACTIVE_LEVEL_ID, levelId);
  if (typeof localStorage !== 'undefined') {
    try {
      if (levelId) localStorage.setItem(CREATOR_ACTIVE_ID_KEY, levelId);
      else localStorage.removeItem(CREATOR_ACTIVE_ID_KEY);
    } catch {
      // Ignore
    }
  }
}

export function resetCreatorStorageForTests(): void {
  memoryFallbackLevels.clear();
  memoryFallbackActiveId = null;
  initPromise = null;
  dbPromise = null;
  levelOpQueues.clear();
}
