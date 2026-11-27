import type {
  BackgroundLibraryCategory,
  EnvironmentPreference,
  EnvironmentTheme,
  MusicProfile,
  OfficialEnvironmentTheme,
} from '../../types/game';
import { SeededRng } from './seededRandom';

export const VANILLA_ENVIRONMENT_THEMES: readonly OfficialEnvironmentTheme[] = [
  'tropical',
  'cyberpunk',
  'sakura',
  'cosmic',
] as const;

export const EDITOR_ENVIRONMENT_THEMES: readonly EnvironmentTheme[] = [] as const;

export const ALL_ENVIRONMENT_THEMES: readonly OfficialEnvironmentTheme[] = VANILLA_ENVIRONMENT_THEMES;

export const LEGACY_THEME_ALIAS_MAP: Record<EnvironmentTheme, OfficialEnvironmentTheme> = {
  tropical: 'tropical',
  ocean: 'tropical',
  floating_paradise: 'tropical',
  cyberpunk: 'cyberpunk',
  newyork: 'cyberpunk',
  nightclub: 'cyberpunk',
  synthwave: 'cyberpunk',
  reactor: 'cyberpunk',
  digital: 'cyberpunk',
  editor_prism_matrix: 'cyberpunk',
  editor_crimson_eclipse: 'cyberpunk',
  sakura: 'sakura',
  mountain: 'sakura',
  editor_jade_sanctuary: 'sakura',
  cosmic: 'cosmic',
  crystal: 'cosmic',
  aurora_ice: 'cosmic',
};

const VALID_THEME_SET = new Set<string>(Object.keys(LEGACY_THEME_ALIAS_MAP));

export function isValidEnvironmentTheme(value: unknown): value is EnvironmentTheme {
  return typeof value === 'string' && VALID_THEME_SET.has(value);
}

export function resolveSafeEnvironmentTheme(
  value: unknown,
  fallback: EnvironmentTheme = 'cyberpunk',
): OfficialEnvironmentTheme {
  if (typeof value === 'string' && value in LEGACY_THEME_ALIAS_MAP) {
    return LEGACY_THEME_ALIAS_MAP[value as EnvironmentTheme];
  }
  return LEGACY_THEME_ALIAS_MAP[fallback] ?? 'cyberpunk';
}

export function getEnvironmentCategory(_theme: EnvironmentTheme): BackgroundLibraryCategory {
  return 'vanilla';
}

export const ENVIRONMENT_OPTIONS: Array<{
  id: EnvironmentPreference;
  label: string;
  subtitle: string;
  category?: BackgroundLibraryCategory;
}> = [
  {
    id: 'auto',
    label: 'Automático (Música)',
    subtitle: 'Selecciona el escenario ilustrado ideal según energía, BPM y espectro del tema',
  },
  {
    id: 'random',
    label: 'Aleatorio',
    subtitle: 'Elige un escenario diferente en cada partida',
  },
  {
    id: 'tropical',
    label: 'Atardecer Tropical',
    subtitle: 'Cielo dorado-violeta, sol cálido sobre el océano, palmeras mecidas y destellos luminosos',
    category: 'vanilla',
  },
  {
    id: 'cyberpunk',
    label: 'Ciudad Cyber Neón',
    subtitle: 'Metrópolis nocturna con puente iluminado, rascacielos reactivos, vehículos voladores y reflejos',
    category: 'vanilla',
  },
  {
    id: 'sakura',
    label: 'Santuario Sakura',
    subtitle: 'Arco Torii carmesí, Monte Fuji nevado, pagoda, lago cristalino y lluvia de pétalos de cerezo',
    category: 'vanilla',
  },
  {
    id: 'cosmic',
    label: 'Nebulosa Cósmica',
    subtitle: 'Galaxia púrpura-índigo con planeta anillado, lunas orbitales, asteroides flotantes y polvo estelar',
    category: 'vanilla',
  },
];

export function getEnvironmentLabel(pref: EnvironmentPreference): string {
  if (pref === 'auto') return 'Automático (Música)';
  if (pref === 'random') return 'Aleatorio';
  const normalized = resolveSafeEnvironmentTheme(pref);
  return ENVIRONMENT_OPTIONS.find((o) => o.id === normalized)?.label ?? 'Ciudad Cyber Neón';
}

/**
 * Selects one of the 4 official illustrated 2.5D scenarios purely from measured acoustic/rhythmic
 * DSP features (or seeded random when insufficient profile data exists).
 */
export function resolveEnvironmentTheme(
  preference: EnvironmentPreference,
  profile: MusicProfile | null | undefined,
  seed: string,
): OfficialEnvironmentTheme {
  if (preference !== 'auto' && preference !== 'random') {
    return resolveSafeEnvironmentTheme(preference);
  }

  const rng = new SeededRng(`${seed}:${preference}`);

  if (preference === 'random' || !profile || profile.energyTimeline.length < 4) {
    return rng.pick(VANILLA_ENVIRONMENT_THEMES);
  }

  const frames = profile.energyTimeline;
  let sumBass = 0;
  let sumMid = 0;
  let sumHigh = 0;
  let sumCentroid = 0;
  let sumHarmonic = 0;
  let sumPercussive = 0;
  let count = 0;

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    sumBass += f.bass;
    sumMid += f.mid;
    sumHigh += f.high;
    sumCentroid += f.centroid ?? 0.5;
    sumHarmonic += f.harmonicStrength ?? 0.45;
    sumPercussive += f.percussiveRatio ?? 0.5;
    count++;
  }

  const avgBass = sumBass / Math.max(1, count);
  const avgMid = sumMid / Math.max(1, count);
  const avgHigh = sumHigh / Math.max(1, count);
  const avgCentroid = sumCentroid / Math.max(1, count);
  const avgHarmonic = sumHarmonic / Math.max(1, count);
  const avgPercussive = sumPercussive / Math.max(1, count);
  const avgEnergy = profile.averageEnergy;
  const bpm = profile.bpm || 120;
  const complexity = profile.rhythmicComplexity ?? 0.5;
  const dynRange = profile.dynamicRangeDb ?? 12;

  const scores: Record<OfficialEnvironmentTheme, number> = {
    tropical:
      (1 - Math.abs(avgEnergy - 0.46)) * 0.95 +
      avgHarmonic * 0.95 +
      (1 - Math.min(1, Math.abs(bpm - 108) / 55)) * 0.8 +
      (1 - avgPercussive) * 0.4 +
      rng.range(0, 0.3),
    cyberpunk:
      avgPercussive * 1.25 +
      avgBass * 0.9 +
      Math.min(1, bpm / 145) * 0.8 +
      complexity * 0.75 +
      rng.range(0, 0.3),
    sakura:
      avgHarmonic * 1.25 +
      avgMid * 0.95 +
      (1 - avgPercussive) * 0.65 +
      (1 - Math.abs(bpm - 104) / 52) * 0.65 +
      rng.range(0, 0.3),
    cosmic:
      avgEnergy * 1.15 +
      avgHigh * 1.1 +
      avgCentroid * 0.85 +
      Math.min(1, dynRange / 22) * 0.7 +
      rng.range(0, 0.3),
  };

  let bestTheme: OfficialEnvironmentTheme = 'cyberpunk';
  let bestScore = -Infinity;
  for (const theme of VANILLA_ENVIRONMENT_THEMES) {
    if (scores[theme] > bestScore) {
      bestScore = scores[theme];
      bestTheme = theme;
    }
  }
  return bestTheme;
}
