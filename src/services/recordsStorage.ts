import type {
  AudioReactionConfig,
  CameraConfig,
  DifficultyLevel,
  GameplayBreakdown,
  GameSettings,
  GenerationConfig,
  LaneCount,
  MechanicsConfig,
  MenuAmbientConfig,
  PerformanceConfig,
  SongRecordVariant,
  SongStats,
  VisualsConfig,
} from '../types/game';

const SETTINGS_KEY = 'beatflow_hop_settings_v1';
const STATS_KEY = 'beatflow_hop_song_stats_v1';
const SELECTED_SONG_KEY = 'beatflow_hop_selected_song_v1';
const TUTORIAL_DONE_KEY = 'beatflow_hop_tutorial_done_v1';

export function normalizeDifficulty(diff: string | undefined): DifficultyLevel {
  if (diff === 'extreme') return 'master';
  if (
    diff === 'easy' ||
    diff === 'normal' ||
    diff === 'hard' ||
    diff === 'expert' ||
    diff === 'master' ||
    diff === 'custom'
  ) {
    return diff;
  }
  return 'normal';
}

export function getPresetMechanicsConfig(difficulty: DifficultyLevel): MechanicsConfig {
  switch (difficulty) {
    case 'easy':
      return {
        holdNotes: { enabled: true, frequency: 0.65 },
        doubleNotes: { enabled: false, frequency: 0.3, maxSimultaneous: 2 },
        streams: { enabled: false, frequency: 0.35 },
        trills: { enabled: false, frequency: 0.3 },
        flickNotes: { enabled: false, frequency: 0.35 },
        slideNotes: { enabled: true, frequency: 0.4 },
        feverMode: { enabled: true, multiplierBoost: 2.0, durationSec: 9 },
        perfectChain: { enabled: true, milestoneStep: 10 },
        rhythmBurst: { enabled: false, frequency: 0.4 },
        precisionChallenge: { enabled: false, strictness: 0.85 },
        dynamicSections: true,
        earlyReleasePenalty: 'proportional',
        slideTolerance: 1.25,
      };
    case 'normal':
      return {
        holdNotes: { enabled: true, frequency: 0.9 },
        doubleNotes: { enabled: true, frequency: 0.65, maxSimultaneous: 2 },
        streams: { enabled: true, frequency: 0.6 },
        trills: { enabled: false, frequency: 0.45 },
        flickNotes: { enabled: true, frequency: 0.55 },
        slideNotes: { enabled: true, frequency: 0.65 },
        feverMode: { enabled: true, multiplierBoost: 2.0, durationSec: 8.5 },
        perfectChain: { enabled: true, milestoneStep: 15 },
        rhythmBurst: { enabled: true, frequency: 0.6 },
        precisionChallenge: { enabled: false, strictness: 0.82 },
        dynamicSections: true,
        earlyReleasePenalty: 'proportional',
        slideTolerance: 1.1,
      };
    case 'hard':
      return {
        holdNotes: { enabled: true, frequency: 1.05 },
        doubleNotes: { enabled: true, frequency: 0.95, maxSimultaneous: 2 },
        streams: { enabled: true, frequency: 0.95 },
        trills: { enabled: true, frequency: 0.75 },
        flickNotes: { enabled: true, frequency: 0.9 },
        slideNotes: { enabled: true, frequency: 0.9 },
        feverMode: { enabled: true, multiplierBoost: 2.5, durationSec: 8 },
        perfectChain: { enabled: true, milestoneStep: 20 },
        rhythmBurst: { enabled: true, frequency: 0.95 },
        precisionChallenge: { enabled: true, strictness: 0.82 },
        dynamicSections: true,
        earlyReleasePenalty: 'proportional',
        slideTolerance: 1.0,
      };
    case 'expert':
      return {
        holdNotes: { enabled: true, frequency: 1.15 },
        doubleNotes: { enabled: true, frequency: 1.15, maxSimultaneous: 3 },
        streams: { enabled: true, frequency: 1.2 },
        trills: { enabled: true, frequency: 1.05 },
        flickNotes: { enabled: true, frequency: 1.15 },
        slideNotes: { enabled: true, frequency: 1.1 },
        feverMode: { enabled: true, multiplierBoost: 2.5, durationSec: 8 },
        perfectChain: { enabled: true, milestoneStep: 25 },
        rhythmBurst: { enabled: true, frequency: 1.2 },
        precisionChallenge: { enabled: true, strictness: 0.76 },
        dynamicSections: true,
        earlyReleasePenalty: 'proportional',
        slideTolerance: 0.95,
      };
    case 'master':
      return {
        holdNotes: { enabled: true, frequency: 1.25 },
        doubleNotes: { enabled: true, frequency: 1.35, maxSimultaneous: 4 },
        streams: { enabled: true, frequency: 1.4 },
        trills: { enabled: true, frequency: 1.3 },
        flickNotes: { enabled: true, frequency: 1.3 },
        slideNotes: { enabled: true, frequency: 1.2 },
        feverMode: { enabled: true, multiplierBoost: 3.0, durationSec: 7.5 },
        perfectChain: { enabled: true, milestoneStep: 25 },
        rhythmBurst: { enabled: true, frequency: 1.4 },
        precisionChallenge: { enabled: true, strictness: 0.7 },
        dynamicSections: true,
        earlyReleasePenalty: 'miss',
        slideTolerance: 0.85,
      };
    case 'custom':
    default:
      return {
        holdNotes: { enabled: true, frequency: 1.0 },
        doubleNotes: { enabled: true, frequency: 0.85, maxSimultaneous: 2 },
        streams: { enabled: true, frequency: 0.85 },
        trills: { enabled: true, frequency: 0.7 },
        flickNotes: { enabled: true, frequency: 0.85 },
        slideNotes: { enabled: true, frequency: 0.85 },
        feverMode: { enabled: true, multiplierBoost: 2.25, durationSec: 8 },
        perfectChain: { enabled: true, milestoneStep: 20 },
        rhythmBurst: { enabled: true, frequency: 0.85 },
        precisionChallenge: { enabled: true, strictness: 0.8 },
        dynamicSections: true,
        earlyReleasePenalty: 'proportional',
        slideTolerance: 1.0,
      };
  }
}

export function getPresetGenerationConfig(
  difficulty: DifficultyLevel,
  seed?: string,
  laneCount: LaneCount = 4,
  maxMisses = 3,
): GenerationConfig {
  const s = seed ?? generateRandomSeed();
  const normalized = normalizeDifficulty(difficulty);
  const mechanics = getPresetMechanicsConfig(normalized);
  switch (normalized) {
    case 'easy':
      return {
        difficulty: 'easy',
        laneCount,
        maxMisses,
        noteDensity: 0.56,
        approachSpeed: 0.78,
        proceduralVariation: 0.35,
        patternComplexity: 0.22,
        hitWindowMs: 175,
        randomness: 0.28,
        musicalFocus: 'balanced',
        seed: s,
        mechanics,
      };
    case 'normal':
      return {
        difficulty: 'normal',
        laneCount,
        maxMisses,
        noteDensity: 0.92,
        approachSpeed: 1.0,
        proceduralVariation: 0.58,
        patternComplexity: 0.45,
        hitWindowMs: 145,
        randomness: 0.46,
        musicalFocus: 'balanced',
        seed: s,
        mechanics,
      };
    case 'hard':
      return {
        difficulty: 'hard',
        laneCount,
        maxMisses,
        noteDensity: 1.22,
        approachSpeed: 1.22,
        proceduralVariation: 0.72,
        patternComplexity: 0.7,
        hitWindowMs: 120,
        randomness: 0.6,
        musicalFocus: 'balanced',
        seed: s,
        mechanics,
      };
    case 'expert':
      return {
        difficulty: 'expert',
        laneCount,
        maxMisses,
        noteDensity: 1.42,
        approachSpeed: 1.42,
        proceduralVariation: 0.82,
        patternComplexity: 0.86,
        hitWindowMs: 105,
        randomness: 0.7,
        musicalFocus: 'balanced',
        seed: s,
        mechanics,
      };
    case 'master':
      return {
        difficulty: 'master',
        laneCount,
        maxMisses,
        noteDensity: 1.6,
        approachSpeed: 1.58,
        proceduralVariation: 0.9,
        patternComplexity: 0.96,
        hitWindowMs: 92,
        randomness: 0.78,
        musicalFocus: 'balanced',
        seed: s,
        mechanics,
      };
    case 'custom':
    default:
      return {
        difficulty: 'custom',
        laneCount,
        maxMisses,
        noteDensity: 1.0,
        approachSpeed: 1.08,
        proceduralVariation: 0.65,
        patternComplexity: 0.58,
        hitWindowMs: 135,
        randomness: 0.55,
        musicalFocus: 'balanced',
        seed: s,
        mechanics,
      };
  }
}

export function generateRandomSeed(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'BF-';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  enabled: true,
  staticView: false,
  overallIntensity: 1.0,
  dynamicZoom: { enabled: true, intensity: 1.0 },
  pullBack: { enabled: true, intensity: 0.9 },
  horizontalOffset: { enabled: true, intensity: 0.85 },
  verticalOffset: { enabled: true, intensity: 0.8 },
  tilt: { enabled: true, intensity: 0.8 },
  cameraShake: { enabled: true, intensity: 0.75 },
  smoothTransitions: true,
  reducedMotion: false,
};

export const DEFAULT_VISUALS_CONFIG: VisualsConfig = {
  preset: 'auto',
  useCustomColors: false,
  customPalette: {
    primary: '#06d6f2',
    secondary: '#f43f8e',
    accent: '#6366f1',
  },
  bloomIntensity: 1.0,
  glowIntensity: 1.0,
  sceneBrightness: 1.0,
  sideBrightness: 0.85,
  particleIntensityValue: 1.0,
  flashIntensity: 0.65,
  screenEffects: true,
  reducedFlash: false,
};

export const DEFAULT_AUDIO_REACTION_CONFIG: AudioReactionConfig = {
  frequencySensitivity: 1.05,
  reactionIntensity: 1.0,
  bpmDetectionEnabled: true,
  beatDetectionEnabled: true,
  subBassWeight: 1.0,
  bassWeight: 1.15,
  midWeight: 1.0,
  highMidWeight: 1.0,
  trebleWeight: 1.05,
};

export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  performanceMode: 'auto',
  effectFrequency: 'high',
  lightingQuality: 'high',
};

export const DEFAULT_MENU_AMBIENT_CONFIG: MenuAmbientConfig = {
  musicEnabled: true,
  musicVolume: 0.45,
  preset: 'cyberpunk_ambient',
  sourceMode: 'preset',
  customTrackName: '',
  customLoop: true,
  customPaused: false,
  ambientEffectsEnabled: true,
  menuAnimationsEnabled: true,
  visualIntensity: 'high',
};

export const DEFAULT_SETTINGS: GameSettings = {
  musicVolume: 0.85,
  ambientVolume: 0.7,
  impactVolume: 0.6,
  uiVolume: 0.55,
  uiSoundsEnabled: true,
  sfxVolume: 0.65,
  brightness: 1.0,
  visualIntensity: 'high',
  particleIntensity: 'high',
  graphicsQuality: 'high',
  reflectionQuality: 'high',
  reactiveVisuals: true,
  touchSensitivity: 1.0,
  audioOffsetMs: 0,
  defaultDifficulty: 'normal',
  noteShape: 'auto',
  environmentMode: 'auto',
  vibration: true,
  generationConfig: getPresetGenerationConfig('normal', undefined, 4, 3),
  cameraConfig: DEFAULT_CAMERA_CONFIG,
  visualsConfig: DEFAULT_VISUALS_CONFIG,
  audioReactionConfig: DEFAULT_AUDIO_REACTION_CONFIG,
  performanceConfig: DEFAULT_PERFORMANCE_CONFIG,
  menuAmbientConfig: DEFAULT_MENU_AMBIENT_CONFIG,
};

function mergeMechanics(
  base: MechanicsConfig,
  incoming?: Partial<MechanicsConfig>,
): MechanicsConfig {
  if (!incoming) return base;
  return {
    ...base,
    ...incoming,
    holdNotes: { ...base.holdNotes, ...(incoming.holdNotes ?? {}) },
    doubleNotes: { ...base.doubleNotes, ...(incoming.doubleNotes ?? {}) },
    streams: { ...base.streams, ...(incoming.streams ?? {}) },
    trills: { ...base.trills, ...(incoming.trills ?? {}) },
    flickNotes: { ...base.flickNotes, ...(incoming.flickNotes ?? {}) },
    slideNotes: { ...base.slideNotes, ...(incoming.slideNotes ?? {}) },
    feverMode: { ...base.feverMode, ...(incoming.feverMode ?? {}) },
    perfectChain: { ...base.perfectChain, ...(incoming.perfectChain ?? {}) },
    rhythmBurst: { ...base.rhythmBurst, ...(incoming.rhythmBurst ?? {}) },
    precisionChallenge: {
      ...base.precisionChallenge,
      ...(incoming.precisionChallenge ?? {}),
    },
  };
}

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    const normalizedDefaultDiff = normalizeDifficulty(parsed.defaultDifficulty);
    const parsedGen = parsed.generationConfig as Partial<GenerationConfig> | undefined;
    const normalizedGenDiff = normalizeDifficulty(parsedGen?.difficulty ?? normalizedDefaultDiff);
    const baseGen = getPresetGenerationConfig(
      normalizedGenDiff,
      parsedGen?.seed,
      parsedGen?.laneCount ?? 4,
      parsedGen?.maxMisses ?? 3,
    );

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      defaultDifficulty: normalizedDefaultDiff,
      generationConfig: {
        ...baseGen,
        ...(parsedGen ?? {}),
        difficulty: normalizedGenDiff,
        laneCount: ([4, 5, 6, 7, 8].includes(Number(parsedGen?.laneCount))
          ? Number(parsedGen?.laneCount)
          : 4) as LaneCount,
        maxMisses: parsedGen?.maxMisses ?? 3,
        mechanics: mergeMechanics(baseGen.mechanics, parsedGen?.mechanics),
      },
      cameraConfig: {
        ...DEFAULT_CAMERA_CONFIG,
        ...(parsed.cameraConfig ?? {}),
        dynamicZoom: {
          ...DEFAULT_CAMERA_CONFIG.dynamicZoom,
          ...(parsed.cameraConfig?.dynamicZoom ?? {}),
        },
        pullBack: {
          ...DEFAULT_CAMERA_CONFIG.pullBack,
          ...(parsed.cameraConfig?.pullBack ?? {}),
        },
        horizontalOffset: {
          ...DEFAULT_CAMERA_CONFIG.horizontalOffset,
          ...(parsed.cameraConfig?.horizontalOffset ?? {}),
        },
        verticalOffset: {
          ...DEFAULT_CAMERA_CONFIG.verticalOffset,
          ...(parsed.cameraConfig?.verticalOffset ?? {}),
        },
        tilt: {
          ...DEFAULT_CAMERA_CONFIG.tilt,
          ...(parsed.cameraConfig?.tilt ?? {}),
        },
        cameraShake: {
          ...DEFAULT_CAMERA_CONFIG.cameraShake,
          ...(parsed.cameraConfig?.cameraShake ?? {}),
        },
      },
      visualsConfig: {
        ...DEFAULT_VISUALS_CONFIG,
        ...(parsed.visualsConfig ?? {}),
        customPalette: {
          ...DEFAULT_VISUALS_CONFIG.customPalette,
          ...(parsed.visualsConfig?.customPalette ?? {}),
        },
      },
      audioReactionConfig: {
        ...DEFAULT_AUDIO_REACTION_CONFIG,
        ...(parsed.audioReactionConfig ?? {}),
      },
      performanceConfig: {
        ...DEFAULT_PERFORMANCE_CONFIG,
        ...(parsed.performanceConfig ?? {}),
      },
      menuAmbientConfig: {
        ...DEFAULT_MENU_AMBIENT_CONFIG,
        ...(parsed.menuAmbientConfig ?? {}),
      },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function buildModifierLabel(cfg: GenerationConfig): string {
  const tags: string[] = [];
  if (cfg.maxMisses >= 999) tags.push('Sin derrota');
  else if (cfg.maxMisses !== 3) tags.push(`${cfg.maxMisses} fallos`);
  if (!cfg.mechanics.holdNotes.enabled) tags.push('Sin Hold');
  if (!cfg.mechanics.flickNotes.enabled) tags.push('Sin Flick');
  if (!cfg.mechanics.slideNotes.enabled) tags.push('Sin Slide');
  if (cfg.mechanics.precisionChallenge.enabled) tags.push('Precisión');
  if (cfg.mechanics.feverMode.enabled) tags.push('Fever');
  return tags.length > 0 ? tags.slice(0, 3).join(' · ') : 'Estándar';
}

export function buildVariantKey(cfg: GenerationConfig): string {
  const m = cfg.mechanics;
  const modSig = [
    cfg.maxMisses >= 999 ? 'nf' : `m${cfg.maxMisses}`,
    m.holdNotes.enabled ? 'h1' : 'h0',
    m.doubleNotes.enabled ? `d${m.doubleNotes.maxSimultaneous}` : 'd0',
    m.flickNotes.enabled ? 'fl1' : 'fl0',
    m.slideNotes.enabled ? 'sl1' : 'sl0',
    m.precisionChallenge.enabled ? 'pc1' : 'pc0',
    m.feverMode.enabled ? 'fv1' : 'fv0',
  ].join('-');
  return `${cfg.difficulty}_${cfg.laneCount}k_${modSig}`;
}

export function loadAllSongStats(): Record<string, SongStats> {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, SongStats>;
  } catch {
    return {};
  }
}

export function getOverallBestScore(): number {
  const all = loadAllSongStats();
  let best = 0;
  for (const s of Object.values(all)) {
    if (s.bestScore > best) best = s.bestScore;
  }
  return best;
}

export function recordGameResult(params: {
  songId: string;
  title: string;
  artist: string;
  coverArtDataUrl?: string;
  score: number;
  maxCombo: number;
  accuracy: number;
  completed: boolean;
  seed: string;
  config: GenerationConfig;
  breakdown: GameplayBreakdown;
}): {
  isNewRecord: boolean;
  isNewVariantRecord: boolean;
  previousBest: number;
  updated: SongStats;
} {
  const all = loadAllSongStats();
  const existing = all[params.songId];
  const previousBest = existing?.bestScore ?? 0;
  const isNewRecord = params.score > previousBest && params.score > 0;

  const variantKey = buildVariantKey(params.config);
  const modifierLabel = buildModifierLabel(params.config);
  const existingVariants: Record<string, SongRecordVariant> = { ...(existing?.variants ?? {}) };
  const prevVar = existingVariants[variantKey];
  const prevVarBest = prevVar?.bestScore ?? 0;
  const isNewVariantRecord = params.score > prevVarBest && params.score > 0;

  existingVariants[variantKey] = {
    variantKey,
    difficulty: params.config.difficulty,
    laneCount: params.config.laneCount,
    modifierLabel,
    bestScore: Math.max(prevVarBest, params.score),
    bestCombo: Math.max(prevVar?.bestCombo ?? 0, params.maxCombo),
    bestAccuracy: Math.max(prevVar?.bestAccuracy ?? 0, params.accuracy),
    bestMaxPerfectChain: Math.max(
      prevVar?.bestMaxPerfectChain ?? 0,
      params.breakdown.maxPerfectChain,
    ),
    playCount: (prevVar?.playCount ?? 0) + 1,
    completions: (prevVar?.completions ?? 0) + (params.completed ? 1 : 0),
    lastPlayedAt: Date.now(),
    bestSeed: isNewVariantRecord ? params.seed : prevVar?.bestSeed ?? params.seed,
  };

  const updated: SongStats = {
    songId: params.songId,
    title: params.title,
    artist: params.artist,
    coverArtDataUrl: params.coverArtDataUrl ?? existing?.coverArtDataUrl,
    bestScore: Math.max(previousBest, params.score),
    bestCombo: Math.max(existing?.bestCombo ?? 0, params.maxCombo),
    bestAccuracy: Math.max(existing?.bestAccuracy ?? 0, params.accuracy),
    bestMaxPerfectChain: Math.max(
      existing?.bestMaxPerfectChain ?? 0,
      params.breakdown.maxPerfectChain,
    ),
    playCount: (existing?.playCount ?? 0) + 1,
    completions: (existing?.completions ?? 0) + (params.completed ? 1 : 0),
    lastPlayedAt: Date.now(),
    bestSeed: isNewRecord ? params.seed : existing?.bestSeed ?? params.seed,
    variants: existingVariants,
  };

  all[params.songId] = updated;
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(all));
  } catch {
    // Ignore quota errors
  }

  return { isNewRecord, isNewVariantRecord, previousBest, updated };
}

export function clearAllRecords(): void {
  try {
    localStorage.removeItem(STATS_KEY);
  } catch {
    // Ignore
  }
}

export function loadSelectedSongId(): string | null {
  try {
    return localStorage.getItem(SELECTED_SONG_KEY);
  } catch {
    return null;
  }
}

export function saveSelectedSongId(id: string | null): void {
  try {
    if (id) localStorage.setItem(SELECTED_SONG_KEY, id);
    else localStorage.removeItem(SELECTED_SONG_KEY);
  } catch {
    // Ignore
  }
}

export function loadTutorialCompleted(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_DONE_KEY) === '1';
  } catch {
    return true;
  }
}

export function saveTutorialCompleted(completed: boolean): void {
  try {
    if (completed) localStorage.setItem(TUTORIAL_DONE_KEY, '1');
    else localStorage.removeItem(TUTORIAL_DONE_KEY);
  } catch {
    // Ignore
  }
}
