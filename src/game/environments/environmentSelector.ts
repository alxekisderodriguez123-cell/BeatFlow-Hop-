import type {
  EnvironmentPreference,
  EnvironmentTheme,
  MusicProfile,
} from '../../types/game';
import { SeededRng } from './seededRandom';

export const ALL_ENVIRONMENT_THEMES: readonly EnvironmentTheme[] = [
  'cyberpunk',
  'tropical',
  'ocean',
  'mountain',
  'newyork',
  'cosmic',
  'nightclub',
  'synthwave',
  'reactor',
  'digital',
] as const;

export const ENVIRONMENT_OPTIONS: Array<{
  id: EnvironmentPreference;
  label: string;
  subtitle: string;
}> = [
  {
    id: 'auto',
    label: 'Automático (Música)',
    subtitle: 'Selecciona el mundo según la energía, ritmo y espectro del tema',
  },
  {
    id: 'random',
    label: 'Aleatorio',
    subtitle: 'Elige un mundo diferente en cada partida',
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk City',
    subtitle: 'Metrópolis nocturna ilustrada con rascacielos neón, arcos y portal',
  },
  {
    id: 'tropical',
    label: 'Tropical Beach',
    subtitle: 'Atardecer violeta-dorado con palmeras estilizadas y brillos en el mar',
  },
  {
    id: 'ocean',
    label: 'Ocean World',
    subtitle: 'Mar nocturno estilizado con oleaje luminoso y bruma lunar',
  },
  {
    id: 'mountain',
    label: 'Mountain Landscape',
    subtitle: 'Cordillera ilustrada bajo auroras boreales y reflejos sobre el lago',
  },
  {
    id: 'newyork',
    label: 'New York Night',
    subtitle: 'Skyline Manhattan ilustrado con puente luminoso y reflejos dorados',
  },
  {
    id: 'cosmic',
    label: 'Cosmic Dimension',
    subtitle: 'Nebulosa profunda con planeta anillado ilustrado y asteroides',
  },
  {
    id: 'nightclub',
    label: 'Nightclub',
    subtitle: 'Club electrónico con focos dinámicos, láseres y muros ecualizadores',
  },
  {
    id: 'synthwave',
    label: 'Synthwave Highway',
    subtitle: 'Autopista retrofuturista hacia un sol neón entre montañas violetas',
  },
  {
    id: 'reactor',
    label: 'Industrial Reactor',
    subtitle: 'Central energética futurista con turbinas, conductos y núcleo plasma',
  },
  {
    id: 'digital',
    label: 'Digital Dimension',
    subtitle: 'Matriz cibernética abstracta con portales geométricos y datos en vuelo',
  },
];

export function getEnvironmentLabel(pref: EnvironmentPreference): string {
  return ENVIRONMENT_OPTIONS.find((o) => o.id === pref)?.label ?? 'Automático (Música)';
}

/**
 * Selects an environment purely from measured acoustic/rhythmic DSP features
 * (never inventing music genres) or uses seeded random when insufficient profile data exists.
 */
export function resolveEnvironmentTheme(
  preference: EnvironmentPreference,
  profile: MusicProfile | null | undefined,
  seed: string,
): EnvironmentTheme {
  if (preference !== 'auto' && preference !== 'random') {
    return preference;
  }

  const rng = new SeededRng(`${seed}:${preference}`);

  if (preference === 'random' || !profile || profile.energyTimeline.length < 4) {
    return rng.pick(ALL_ENVIRONMENT_THEMES);
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

  // Score each environment based on continuous acoustic & rhythmic measurements
  const scores: Record<EnvironmentTheme, number> = {
    cyberpunk:
      avgPercussive * 1.25 +
      avgBass * 0.85 +
      Math.min(1, bpm / 145) * 0.75 +
      complexity * 0.75 +
      rng.range(0, 0.35),

    cosmic:
      avgEnergy * 1.15 +
      avgHigh * 1.1 +
      avgCentroid * 0.85 +
      Math.min(1, dynRange / 22) * 0.65 +
      rng.range(0, 0.35),

    tropical:
      (1 - Math.abs(avgEnergy - 0.45)) * 0.95 +
      avgHarmonic * 1.05 +
      (1 - Math.min(1, Math.abs(bpm - 105) / 55)) * 0.8 +
      (1 - avgPercussive) * 0.45 +
      rng.range(0, 0.35),

    ocean:
      avgHarmonic * 1.15 +
      (1 - avgEnergy) * 0.8 +
      (1 - complexity) * 0.65 +
      avgCentroid * 0.55 +
      rng.range(0, 0.35),

    mountain:
      (1 - avgPercussive) * 0.95 +
      Math.min(1, dynRange / 20) * 0.9 +
      avgHarmonic * 0.9 +
      (1 - avgBass) * 0.5 +
      rng.range(0, 0.35),

    newyork:
      avgMid * 1.15 +
      avgPercussive * 0.7 +
      (1 - Math.abs(bpm - 118) / 60) * 0.75 +
      avgEnergy * 0.6 +
      rng.range(0, 0.35),

    nightclub:
      avgBass * 1.2 +
      avgPercussive * 1.1 +
      (1 - Math.min(1, Math.abs(bpm - 128) / 48)) * 0.9 +
      avgEnergy * 0.75 +
      rng.range(0, 0.35),

    synthwave:
      avgHarmonic * 0.95 +
      avgMid * 0.9 +
      (1 - Math.min(1, Math.abs(bpm - 114) / 50)) * 0.85 +
      avgBass * 0.65 +
      rng.range(0, 0.35),

    reactor:
      avgBass * 1.15 +
      avgPercussive * 1.0 +
      complexity * 0.95 +
      Math.min(1, dynRange / 18) * 0.7 +
      rng.range(0, 0.35),

    digital:
      avgCentroid * 1.1 +
      avgHigh * 0.95 +
      complexity * 0.9 +
      Math.min(1, bpm / 150) * 0.75 +
      rng.range(0, 0.35),
  };

  let bestTheme: EnvironmentTheme = 'cyberpunk';
  let bestScore = -Infinity;
  for (const theme of ALL_ENVIRONMENT_THEMES) {
    if (scores[theme] > bestScore) {
      bestScore = scores[theme];
      bestTheme = theme;
    }
  }
  return bestTheme;
}
