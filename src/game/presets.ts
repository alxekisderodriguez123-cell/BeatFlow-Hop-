import type {
  AudiovisualPresetId,
  ConcreteNoteShape,
  EnvironmentTheme,
  LaneCount,
  MusicProfile,
  NoteShape,
  SongPalette,
} from '../types/game';
import { resolveEnvironmentTheme } from './environments/environmentSelector';

export interface AudiovisualPreset {
  id: AudiovisualPresetId;
  label: string;
  description: string;
  palette: SongPalette;
  environment: EnvironmentTheme | 'auto';
  defaultNoteShape: ConcreteNoteShape;
  bloomScale: number;
  glowScale: number;
}

export const AUDIOVISUAL_PRESETS: AudiovisualPreset[] = [
  {
    id: 'auto',
    label: 'Automático (Canción)',
    description: 'Adapta colores, mundo 3D y geometría al análisis y carátula de cada canción',
    palette: { primary: '#22d3ee', secondary: '#e879f9', accent: '#6366f1' },
    environment: 'auto',
    defaultNoteShape: 'tile',
    bloomScale: 1.0,
    glowScale: 1.0,
  },
  {
    id: 'neon_city',
    label: 'Neon City',
    description: 'Cian eléctrico, magenta urbano y rascacielos futuristas',
    palette: { primary: '#06d6f2', secondary: '#ec4899', accent: '#3b82f6' },
    environment: 'newyork',
    defaultNoteShape: 'tile',
    bloomScale: 1.0,
    glowScale: 1.0,
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    description: 'Neón ácido cian-fucsia con alto contraste sintético',
    palette: { primary: '#00f5d4', secondary: '#ff2a85', accent: '#8b5cf6' },
    environment: 'cyberpunk',
    defaultNoteShape: 'hexagon',
    bloomScale: 1.12,
    glowScale: 1.15,
  },
  {
    id: 'cosmic',
    label: 'Cosmic',
    description: 'Índigo astral, violeta estelar y energía orbital',
    palette: { primary: '#38bdf8', secondary: '#c084fc', accent: '#f59e0b' },
    environment: 'cosmic',
    defaultNoteShape: 'sphere',
    bloomScale: 1.08,
    glowScale: 1.1,
  },
  {
    id: 'ocean',
    label: 'Ocean',
    description: 'Turquesa bioluminiscente, azul abisal y reflejos líquidos',
    palette: { primary: '#2dd4bf', secondary: '#38bdf8', accent: '#0ea5e9' },
    environment: 'ocean',
    defaultNoteShape: 'disc',
    bloomScale: 0.92,
    glowScale: 0.95,
  },
  {
    id: 'sunset',
    label: 'Sunset',
    description: 'Ámbar dorado, coral cálido y atardecer tropical',
    palette: { primary: '#fb923c', secondary: '#f43f5e', accent: '#facc15' },
    environment: 'tropical',
    defaultNoteShape: 'diamond',
    bloomScale: 0.96,
    glowScale: 1.02,
  },
  {
    id: 'electronic',
    label: 'Electronic',
    description: 'Verde láser, azul eléctrico y precisión de club electrónico',
    palette: { primary: '#22c55e', secondary: '#06b6d4', accent: '#a855f7' },
    environment: 'cyberpunk',
    defaultNoteShape: 'prism',
    bloomScale: 1.1,
    glowScale: 1.12,
  },
  {
    id: 'dreamscape',
    label: 'Dreamscape',
    description: 'Lavanda etéreo, menta luminosa y cordillera nocturna',
    palette: { primary: '#67e8f9', secondary: '#f0abfc', accent: '#818cf8' },
    environment: 'mountain',
    defaultNoteShape: 'ring',
    bloomScale: 0.9,
    glowScale: 0.95,
  },
  {
    id: 'minimal_neon',
    label: 'Minimal Neon',
    description: 'Alto contraste limpio con brillo contenido para máxima lectura',
    palette: { primary: '#38bdf8', secondary: '#f472b6', accent: '#94a3b8' },
    environment: 'newyork',
    defaultNoteShape: 'square',
    bloomScale: 0.65,
    glowScale: 0.78,
  },
];

export function getPresetById(id: AudiovisualPresetId): AudiovisualPreset {
  return AUDIOVISUAL_PRESETS.find((p) => p.id === id) ?? AUDIOVISUAL_PRESETS[0];
}

export function resolveNoteShape(
  shape: NoteShape,
  presetId: AudiovisualPresetId,
  envTheme?: EnvironmentTheme,
): ConcreteNoteShape {
  if (shape !== 'auto') return shape;
  if (presetId !== 'auto') {
    return getPresetById(presetId).defaultNoteShape;
  }
  switch (envTheme) {
    case 'cosmic':
      return 'sphere';
    case 'ocean':
      return 'disc';
    case 'tropical':
      return 'diamond';
    case 'mountain':
      return 'prism';
    case 'newyork':
      return 'square';
    case 'cyberpunk':
    default:
      return 'tile';
  }
}

export function resolveEffectivePalette(
  presetId: AudiovisualPresetId,
  songPalette: SongPalette,
  useCustomColors: boolean,
  customPalette?: SongPalette,
): SongPalette {
  if (useCustomColors && customPalette) {
    return customPalette;
  }
  if (presetId !== 'auto') {
    return getPresetById(presetId).palette;
  }
  return songPalette;
}

export function resolveEffectiveEnvironment(
  presetId: AudiovisualPresetId,
  envMode: 'auto' | 'random' | EnvironmentTheme,
  profile: MusicProfile | null | undefined,
  seed: string,
): EnvironmentTheme {
  if (envMode !== 'auto') {
    return resolveEnvironmentTheme(envMode, profile, seed);
  }
  const preset = getPresetById(presetId);
  if (preset.environment !== 'auto') {
    return preset.environment;
  }
  return resolveEnvironmentTheme('auto', profile, seed);
}

export function getLaneKeyLabels(laneCount: LaneCount): string[] {
  switch (laneCount) {
    case 4:
      return ['D', 'F', 'J', 'K'];
    case 5:
      return ['D', 'F', 'SPC', 'J', 'K'];
    case 6:
      return ['S', 'D', 'F', 'J', 'K', 'L'];
    case 7:
      return ['S', 'D', 'F', 'SPC', 'J', 'K', 'L'];
    case 8:
      return ['A', 'S', 'D', 'F', 'J', 'K', 'L', 'Ñ'];
  }
}

export function getLaneKeyCodes(laneCount: LaneCount): string[][] {
  switch (laneCount) {
    case 4:
      return [
        ['KeyD', 'Digit1'],
        ['KeyF', 'Digit2'],
        ['KeyJ', 'Digit3'],
        ['KeyK', 'Digit4'],
      ];
    case 5:
      return [
        ['KeyD', 'Digit1'],
        ['KeyF', 'Digit2'],
        ['Space', 'Digit3'],
        ['KeyJ', 'Digit4'],
        ['KeyK', 'Digit5'],
      ];
    case 6:
      return [
        ['KeyS', 'Digit1'],
        ['KeyD', 'Digit2'],
        ['KeyF', 'Digit3'],
        ['KeyJ', 'Digit4'],
        ['KeyK', 'Digit5'],
        ['KeyL', 'Digit6'],
      ];
    case 7:
      return [
        ['KeyS', 'Digit1'],
        ['KeyD', 'Digit2'],
        ['KeyF', 'Digit3'],
        ['Space', 'Digit4'],
        ['KeyJ', 'Digit5'],
        ['KeyK', 'Digit6'],
        ['KeyL', 'Digit7'],
      ];
    case 8:
      return [
        ['KeyA', 'Digit1'],
        ['KeyS', 'Digit2'],
        ['KeyD', 'Digit3'],
        ['KeyF', 'Digit4'],
        ['KeyJ', 'Digit5'],
        ['KeyK', 'Digit6'],
        ['KeyL', 'Digit7'],
        ['Semicolon', 'Quote', 'Digit8'],
      ];
  }
}

export const NOTE_SHAPE_OPTIONS: Array<{ id: NoteShape; label: string }> = [
  { id: 'auto', label: 'Automático' },
  { id: 'tile', label: 'Rectángulos' },
  { id: 'square', label: 'Cuadrados' },
  { id: 'sphere', label: 'Esferas' },
  { id: 'disc', label: 'Discos' },
  { id: 'hexagon', label: 'Hexágonos' },
  { id: 'diamond', label: 'Diamantes' },
  { id: 'prism', label: 'Prismas' },
  { id: 'ring', label: 'Aros' },
];

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Fácil',
  normal: 'Normal',
  hard: 'Difícil',
  expert: 'Experto',
  master: 'Maestro',
  custom: 'Personalizado',
};
