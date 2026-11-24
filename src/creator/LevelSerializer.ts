import type {
  BeatflowLevelDocument,
  CreatorGroup,
  CreatorObject,
  CustomGameplayMode,
  CustomGameplayRules,
} from '../types/creator';
import type { DifficultyLevel, EnvironmentTheme, LaneCount } from '../types/game';
import { GroupManager } from './GroupManager';

export const CURRENT_BFN_SCHEMA_VERSION = 2;
export const REQUIRED_GAME_VERSION = '2.0.0';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype', 'eval', 'script', 'code']);

function sanitizePlainValue<T>(val: T, depth = 0): T {
  if (depth > 16 || val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.map((item) => sanitizePlainValue(item, depth + 1)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    out[k] = sanitizePlainValue(v, depth + 1);
  }
  return out as T;
}

export function createDefaultGameplayRules(
  mode: CustomGameplayMode = 'classic_lanes',
  laneCount: LaneCount = 4,
): CustomGameplayRules {
  return {
    mode,
    laneCount,
    twoThumbMode: mode === 'two_thumb',
    approachSpeed: 1.0,
    hitWindowMs: mode === 'precision_timing' ? 75 : 135,
    maxMisses: mode === 'timed_survival' ? 1 : 999,
    enableObstacles: true,
    enableTouchZones: mode === 'touch_zones' || mode === 'experimental',
    enableFever: true,
    scorePerHit: 120,
    survivalTimeGoalSec: 45,
    inputMapping: {
      allowKeyboard: true,
      allowTouch: true,
      allowMultiTouchZones: true,
    },
  };
}

export function createEmptyLevelDocument(options: {
  levelId?: string;
  levelName?: string;
  authorId?: string;
  authorName?: string;
  environmentTheme?: EnvironmentTheme;
  difficulty?: DifficultyLevel;
  bpm?: number;
  durationSec?: number;
  songTitle?: string;
  songArtist?: string;
  songId?: string;
} = {}): BeatflowLevelDocument {
  const nowIso = new Date().toISOString();
  const id = options.levelId || `lvl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const groups = GroupManager.ensureDefaultGroup([]);

  return {
    schemaVersion: CURRENT_BFN_SCHEMA_VERSION,
    levelId: id,
    authorId: options.authorId || 'local-creator',
    authorName: options.authorName || 'Creador Local',
    levelName: options.levelName || 'Nuevo Nivel BeatFlow',
    description: 'Nivel personalizado creado con BeatFlow Creator.',
    difficulty: options.difficulty || 'normal',
    creationDate: nowIso,
    updatedDate: nowIso,
    version: 1,
    requiredGameVersion: REQUIRED_GAME_VERSION,
    assetReferences: [],
    environmentTheme: options.environmentTheme || 'cyberpunk',
    audio: {
      songId: options.songId,
      title: options.songTitle || 'Pista Personalizada',
      artist: options.songArtist || 'XanderAI Games',
      durationSec: Math.max(15, options.durationSec ?? 60),
      bpm: Math.max(40, Math.min(260, options.bpm ?? 124)),
      offsetMs: 0,
      palette: {
        primary: '#22d3ee',
        secondary: '#ec4899',
        accent: '#6366f1',
      },
      rights: {
        authorizationType: 'original_author',
        licenseName: 'Original / Uso Personal Local',
        rightsHolder: options.authorName || 'Creador Local',
        allowRemixAndLevelUse: true,
      },
    },
    gameplayRules: createDefaultGameplayRules('classic_lanes', 4),
    camera: {
      baseFov: 56,
      baseHeight: 3.3,
      baseDistance: 5.4,
      followPlayer: true,
      allowCameraTriggers: true,
    },
    effects: {
      bloomEnabled: true,
      bloomIntensity: 0.45,
      chromaticStrength: 0.35,
      reactiveLightingEnabled: true,
      kickIntensity: 1.0,
      snareFlash: 0.65,
      hihatSparkle: 0.55,
      attackMs: 15,
      releaseMs: 220,
    },
    groups,
    objects: [],
    timelineKeyframes: [],
    markers: [
      {
        id: 'm-start',
        timeSec: 0,
        label: 'Inicio',
        color: '#22d3ee',
        kind: 'section',
      },
    ],
    variables: {
      hits: 0,
      phase: 0,
    },
  };
}

/**
 * Migrates v1 `.bfn` documents cleanly to v2 schema without losing notes, triggers, or metadata.
 */
export function migrateLevelDocument(raw: Record<string, unknown>): BeatflowLevelDocument {
  const sanitized = sanitizePlainValue(raw);
  const base = createEmptyLevelDocument({
    levelId: typeof sanitized.levelId === 'string' ? sanitized.levelId : undefined,
    levelName: typeof sanitized.levelName === 'string' ? sanitized.levelName : undefined,
    authorId: typeof sanitized.authorId === 'string' ? sanitized.authorId : undefined,
    authorName: typeof sanitized.authorName === 'string' ? sanitized.authorName : undefined,
  });

  const srcSchema = Number(sanitized.schemaVersion ?? 1);
  const rawObjects = Array.isArray(sanitized.objects) ? (sanitized.objects as CreatorObject[]) : [];
  const rawGroups = Array.isArray(sanitized.groups) ? (sanitized.groups as CreatorGroup[]) : [];

  const merged: BeatflowLevelDocument = {
    ...base,
    ...(sanitized as Partial<BeatflowLevelDocument>),
    schemaVersion: CURRENT_BFN_SCHEMA_VERSION,
    requiredGameVersion: REQUIRED_GAME_VERSION,
    groups: GroupManager.ensureDefaultGroup(rawGroups),
    objects: rawObjects.map((o) => ({
      ...o,
      groupIds: Array.isArray(o.groupIds) && o.groupIds.length > 0 ? o.groupIds : [1],
      material: {
        color: o.material?.color || '#22d3ee',
        emissive: o.material?.emissive || o.material?.color || '#22d3ee',
        opacity: typeof o.material?.opacity === 'number' ? o.material.opacity : 1,
        emission: typeof o.material?.emission === 'number' ? o.material.emission : 0.85,
        glowIntensity: typeof o.material?.glowIntensity === 'number' ? o.material.glowIntensity : 0.9,
        blendMode: o.material?.blendMode || 'normal',
        shape: o.material?.shape || 'tile',
      },
    })),
    timelineKeyframes: Array.isArray(sanitized.timelineKeyframes)
      ? (sanitized.timelineKeyframes as BeatflowLevelDocument['timelineKeyframes'])
      : [],
    markers:
      Array.isArray(sanitized.markers) && sanitized.markers.length > 0
        ? (sanitized.markers as BeatflowLevelDocument['markers'])
        : base.markers,
    variables:
      sanitized.variables && typeof sanitized.variables === 'object'
        ? (sanitized.variables as Record<string, number>)
        : base.variables,
    gameplayRules: {
      ...base.gameplayRules,
      ...((sanitized.gameplayRules as Partial<CustomGameplayRules> | undefined) ?? {}),
    },
    camera: {
      ...base.camera,
      ...((sanitized.camera as Partial<BeatflowLevelDocument['camera']> | undefined) ?? {}),
    },
    effects: {
      ...base.effects,
      ...((sanitized.effects as Partial<BeatflowLevelDocument['effects']> | undefined) ?? {}),
    },
    audio: {
      ...base.audio,
      ...((sanitized.audio as Partial<BeatflowLevelDocument['audio']> | undefined) ?? {}),
      rights: {
        ...base.audio.rights,
        ...(((sanitized.audio as Partial<BeatflowLevelDocument['audio']> | undefined)?.rights) ?? {}),
      },
    },
  };

  // v1 compatibility: ensure version bumped & asset references refreshed
  if (srcSchema < 2) {
    merged.version = Math.max(1, Number(merged.version || 1));
  }
  merged.assetReferences = collectAssetReferences(merged);
  return merged;
}

export function collectAssetReferences(doc: BeatflowLevelDocument): string[] {
  const refs = new Set<string>();
  refs.add(`env:${doc.environmentTheme}`);
  if (doc.audio.songId) refs.add(`song:${doc.audio.songId}`);
  for (const obj of doc.objects) {
    refs.add(`obj:${obj.type}`);
  }
  return Array.from(refs);
}

export function serializeLevelToBfn(doc: BeatflowLevelDocument): string {
  const prepared: BeatflowLevelDocument = {
    ...sanitizePlainValue(doc),
    schemaVersion: CURRENT_BFN_SCHEMA_VERSION,
    requiredGameVersion: REQUIRED_GAME_VERSION,
    updatedDate: new Date().toISOString(),
    assetReferences: collectAssetReferences(doc),
  };
  return JSON.stringify(prepared, null, 2);
}

export interface DeserializeResult {
  ok: boolean;
  level?: BeatflowLevelDocument;
  error?: string;
}

export function deserializeLevelFromBfn(jsonText: string): DeserializeResult {
  if (!jsonText || typeof jsonText !== 'string') {
    return { ok: false, error: 'Archivo .bfn vacío o ilegible.' };
  }
  if (jsonText.length > 15_000_000) {
    return { ok: false, error: 'El archivo .bfn excede el tamaño máximo permitido (15 MB).' };
  }
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Formato JSON .bfn inválido.' };
    }
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.objects)) {
      return { ok: false, error: 'El nivel .bfn no contiene una lista válida de objetos.' };
    }
    if (record.schemaVersion !== undefined && typeof record.schemaVersion !== 'number') {
      return { ok: false, error: 'Versión de esquema .bfn inválida.' };
    }
    const migrated = migrateLevelDocument(record);
    return { ok: true, level: migrated };
  } catch {
    return { ok: false, error: 'Error de sintaxis JSON al importar el archivo .bfn.' };
  }
}
