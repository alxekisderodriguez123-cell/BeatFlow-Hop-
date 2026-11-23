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
    subtitle: 'Metrópolis nocturna futurista con neones y tráfico aéreo',
  },
  {
    id: 'tropical',
    label: 'Tropical Beach',
    subtitle: 'Playa nocturna al atardecer con palmeras y olas bioluminiscentes',
  },
  {
    id: 'ocean',
    label: 'Ocean World',
    subtitle: 'Mar abierto nocturno con oleaje dinámico y partículas brillantes',
  },
  {
    id: 'mountain',
    label: 'Mountain Landscape',
    subtitle: 'Cordillera alpina nocturna con auroras boreales y niebla',
  },
  {
    id: 'newyork',
    label: 'New York Night',
    subtitle: 'Puente de Brooklyn, skyline iluminado y reflejos sobre el río',
  },
  {
    id: 'cosmic',
    label: 'Cosmic Dimension',
    subtitle: 'Espacio profundo con nebulosas, planeta anillado y asteroides',
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
    // High percussive drive, strong bass/tempo & rhythmic complexity
    cyberpunk:
      avgPercussive * 1.35 +
      avgBass * 0.9 +
      Math.min(1, bpm / 145) * 0.8 +
      complexity * 0.75 +
      rng.range(0, 0.35),

    // Intense energy + bright high-frequency sparkle + high dynamic drops
    cosmic:
      avgEnergy * 1.2 +
      avgHigh * 1.15 +
      avgCentroid * 0.85 +
      Math.min(1, dynRange / 22) * 0.65 +
      rng.range(0, 0.35),

    // Balanced mid-energy groove, harmonic warmth, moderate tempo
    tropical:
      (1 - Math.abs(avgEnergy - 0.45)) * 0.95 +
      avgHarmonic * 1.05 +
      (1 - Math.min(1, Math.abs(bpm - 105) / 55)) * 0.8 +
      (1 - avgPercussive) * 0.45 +
      rng.range(0, 0.35),

    // Flowing harmonic continuity, lower percussive spikes, moderate-calm energy
    ocean:
      avgHarmonic * 1.15 +
      (1 - avgEnergy) * 0.8 +
      (1 - complexity) * 0.65 +
      avgCentroid * 0.55 +
      rng.range(0, 0.35),

    // Wide dynamic range, atmospheric calmness or soaring harmonic builds
    mountain:
      (1 - avgPercussive) * 0.95 +
      Math.min(1, dynRange / 20) * 0.9 +
      avgHarmonic * 0.9 +
      (1 - avgBass) * 0.5 +
      rng.range(0, 0.35),

    // Strong mid-range presence, steady urban groove & balanced bass/highs
    newyork:
      (sumMid / Math.max(1, count)) * 1.2 +
      avgPercussive * 0.7 +
      (1 - Math.abs(bpm - 118) / 60) * 0.75 +
      avgEnergy * 0.6 +
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
