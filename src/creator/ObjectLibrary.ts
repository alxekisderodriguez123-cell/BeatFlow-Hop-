import type {
  BackgroundTriggerParams,
  CameraFxKind,
  CameraFxTriggerParams,
  CasillaShape,
  CreatorCategoryId,
  CreatorObject,
  CreatorObjectType,
  HitExplosionStyle,
  ObjectCategory,
  PulseKind,
  ScreenPulseTriggerParams,
  TriggerType,
} from '../types/creator';
import type { ConcreteNoteShape, EnvironmentTheme, NoteKind } from '../types/game';

export interface ObjectTemplate {
  type: CreatorObjectType;
  category: ObjectCategory;
  label: string;
  shortLabel: string;
  description: string;
  defaultColor: string;
  defaultShape: ConcreteNoteShape;
  defaultScale: [number, number, number];
  defaultTriggerType?: TriggerType;
  noteKind?: NoteKind;
  casillaShape?: CasillaShape;
}

export interface CreatorBuildItem {
  id: string;
  categoryTab: CreatorCategoryId;
  objectType: CreatorObjectType;
  label: string;
  shortLabel: string;
  accentColor: string;
  casillaShape?: CasillaShape;
  noteKind?: NoteKind;
  cameraFxKind?: CameraFxKind;
  pulseKind?: PulseKind;
  backgroundTheme?: EnvironmentTheme;
  backgroundPresetMode?: 'theme' | 'color' | 'parallax' | 'particles' | 'transition';
}

export const CREATOR_CATEGORY_TABS: Array<{ id: CreatorCategoryId; label: string }> = [
  { id: 'casillas', label: 'CASILLAS' },
  { id: 'camera_fx', label: 'CAMERA FX' },
  { id: 'pulses', label: 'PULSES' },
  { id: 'backgrounds', label: 'BACKGROUNDS' },
];

export const CREATOR_BUILD_ITEMS: CreatorBuildItem[] = [
  // 1. CASILLAS (100% gameplay)
  {
    id: 'casilla_square',
    categoryTab: 'casillas',
    objectType: 'note_tap',
    label: 'Cuadrado',
    shortLabel: 'Cuadrado',
    accentColor: '#22d3ee',
    casillaShape: 'square',
    noteKind: 'tap',
  },
  {
    id: 'casilla_circle',
    categoryTab: 'casillas',
    objectType: 'note_tap',
    label: 'Círculo',
    shortLabel: 'Círculo',
    accentColor: '#38bdf8',
    casillaShape: 'circle',
    noteKind: 'tap',
  },
  {
    id: 'casilla_triangle',
    categoryTab: 'casillas',
    objectType: 'note_tap',
    label: 'Triángulo',
    shortLabel: 'Triángulo',
    accentColor: '#ec4899',
    casillaShape: 'triangle',
    noteKind: 'tap',
  },
  {
    id: 'casilla_diamond',
    categoryTab: 'casillas',
    objectType: 'note_tap',
    label: 'Diamante',
    shortLabel: 'Diamante',
    accentColor: '#a855f7',
    casillaShape: 'diamond',
    noteKind: 'tap',
  },
  {
    id: 'casilla_long',
    categoryTab: 'casillas',
    objectType: 'note_hold',
    label: 'Casilla Larga',
    shortLabel: 'Larga',
    accentColor: '#f59e0b',
    casillaShape: 'long',
    noteKind: 'hold',
  },
  {
    id: 'casilla_flick',
    categoryTab: 'casillas',
    objectType: 'note_flick',
    label: 'Flick',
    shortLabel: 'Flick',
    accentColor: '#fde047',
    casillaShape: 'triangle',
    noteKind: 'flick',
  },
  {
    id: 'casilla_slide',
    categoryTab: 'casillas',
    objectType: 'note_slide',
    label: 'Slide',
    shortLabel: 'Slide',
    accentColor: '#2dd4bf',
    casillaShape: 'long',
    noteKind: 'slide',
  },

  // 2. CAMERA FX (14 effects per PDF 2)
  { id: 'fx_shake', categoryTab: 'camera_fx', objectType: 'camera_fx_trigger', label: 'Shake', shortLabel: 'Shake', accentColor: '#f59e0b', cameraFxKind: 'shake' },
  { id: 'fx_border_lights', categoryTab: 'camera_fx', objectType: 'camera_fx_trigger', label: 'Border Lights', shortLabel: 'Border Lights', accentColor: '#22d3ee', cameraFxKind: 'border_lights' },
  { id: 'fx_zoom', categoryTab: 'camera_fx', objectType: 'camera_fx_trigger', label: 'Zoom', shortLabel: 'Zoom', accentColor: '#38bdf8', cameraFxKind: 'zoom' },
  { id: 'fx_chromatic', categoryTab: 'camera_fx', objectType: 'camera_fx_trigger', label: 'Chromatic', shortLabel: 'Chromatic', accentColor: '#e879f9', cameraFxKind: 'chromatic' },
  { id: 'fx_glitch', categoryTab: 'camera_fx', objectType: 'camera_fx_trigger', label: 'Glitch', shortLabel: 'Glitch', accentColor: '#34d399', cameraFxKind: 'glitch' },
  { id: 'fx_invert', categoryTab: 'camera_fx', objectType: 'camera_fx_trigger', label: 'Invert Colors', shortLabel: 'Invert', accentColor: '#f8fafc', cameraFxKind: 'invert_colors' },
  { id: 'fx_flash', categoryTab: 'camera_fx', objectType: 'camera_fx_trigger', label: 'Flash', shortLabel: 'Flash', accentColor: '#fde047', cameraFxKind: 'flash' },
  { id: 'fx_rotation', categoryTab: 'camera_fx', objectType: 'camera_fx_trigger', label: 'Rotation', shortLabel: 'Rotation', accentColor: '#818cf8', cameraFxKind: 'rotation' },
  { id: 'fx_blur', categoryTab: 'camera_fx', objectType: 'camera_fx_trigger', label: 'Blur', shortLabel: 'Blur', accentColor: '#94a3b8', cameraFxKind: 'blur' },
  { id: 'fx_focus', categoryTab: 'camera_fx', objectType: 'camera_fx_trigger', label: 'Focus', shortLabel: 'Focus', accentColor: '#60a5fa', cameraFxKind: 'focus' },
  { id: 'fx_distortion', categoryTab: 'camera_fx', objectType: 'camera_fx_trigger', label: 'Distortion', shortLabel: 'Distortion', accentColor: '#c084fc', cameraFxKind: 'distortion' },
  { id: 'fx_vignette', categoryTab: 'camera_fx', objectType: 'camera_fx_trigger', label: 'Vignette', shortLabel: 'Vignette', accentColor: '#fb7185', cameraFxKind: 'vignette' },
  { id: 'fx_motion_blur', categoryTab: 'camera_fx', objectType: 'camera_fx_trigger', label: 'Motion Blur', shortLabel: 'Motion Blur', accentColor: '#2dd4bf', cameraFxKind: 'motion_blur' },
  { id: 'fx_color_grading', categoryTab: 'camera_fx', objectType: 'camera_fx_trigger', label: 'Color Grading', shortLabel: 'Grading', accentColor: '#fb923c', cameraFxKind: 'color_grading' },

  // 3. PULSES (8 modes per PDF 2)
  { id: 'pulse_borders_4', categoryTab: 'pulses', objectType: 'pulse_trigger', label: '4 Bordes', shortLabel: '4 Bordes', accentColor: '#22d3ee', pulseKind: 'borders_4' },
  { id: 'pulse_border_top', categoryTab: 'pulses', objectType: 'pulse_trigger', label: 'Borde Superior', shortLabel: 'Superior', accentColor: '#38bdf8', pulseKind: 'border_top' },
  { id: 'pulse_border_bottom', categoryTab: 'pulses', objectType: 'pulse_trigger', label: 'Borde Inferior', shortLabel: 'Inferior', accentColor: '#ec4899', pulseKind: 'border_bottom' },
  { id: 'pulse_borders_side', categoryTab: 'pulses', objectType: 'pulse_trigger', label: 'Bordes Laterales', shortLabel: 'Laterales', accentColor: '#a855f7', pulseKind: 'borders_side' },
  { id: 'pulse_full_flash', categoryTab: 'pulses', objectType: 'pulse_trigger', label: 'Flash Completo', shortLabel: 'Flash Full', accentColor: '#fde047', pulseKind: 'full_flash' },
  { id: 'pulse_radial', categoryTab: 'pulses', objectType: 'pulse_trigger', label: 'Pulso Radial', shortLabel: 'Radial', accentColor: '#34d399', pulseKind: 'radial_pulse' },
  { id: 'pulse_color', categoryTab: 'pulses', objectType: 'pulse_trigger', label: 'Pulso de Color', shortLabel: 'Color', accentColor: '#fb7185', pulseKind: 'color_pulse' },
  { id: 'pulse_glow', categoryTab: 'pulses', objectType: 'pulse_trigger', label: 'Glow Progresivo', shortLabel: 'Glow', accentColor: '#818cf8', pulseKind: 'progressive_glow' },

  // 4. BACKGROUNDS (Trigger actions; presets are rendered alongside via ENVIRONMENT_DEFINITIONS)
  { id: 'bg_color', categoryTab: 'backgrounds', objectType: 'background_trigger', label: 'Color Fondo', shortLabel: 'Color FX', accentColor: '#22d3ee', backgroundPresetMode: 'color' },
  { id: 'bg_parallax', categoryTab: 'backgrounds', objectType: 'background_trigger', label: 'Parallax / Velocidad', shortLabel: 'Parallax', accentColor: '#a855f7', backgroundPresetMode: 'parallax' },
  { id: 'bg_particles', categoryTab: 'backgrounds', objectType: 'background_trigger', label: 'Partículas Fondo', shortLabel: 'Partículas', accentColor: '#fbbf24', backgroundPresetMode: 'particles' },
  { id: 'bg_transition', categoryTab: 'backgrounds', objectType: 'background_trigger', label: 'Transición Escena', shortLabel: 'Transición', accentColor: '#ec4899', backgroundPresetMode: 'transition' },
];

export const OBJECT_CATEGORY_LABELS: Record<ObjectCategory | 'all', string> = {
  all: 'Todo',
  gameplay: 'Casillas',
  decoration: 'Legado',
  effects: 'FX y Pulses',
  control: 'Triggers',
};

export const OBJECT_LIBRARY_TEMPLATES: ObjectTemplate[] = [
  // ACTIVE CASILLAS
  {
    type: 'note_tap',
    category: 'gameplay',
    label: 'Casilla Cuadrado',
    shortLabel: 'Cuadrado',
    description: 'Casilla rítmica de pulsación simple',
    defaultColor: '#22d3ee',
    defaultShape: 'square',
    defaultScale: [1, 1, 1],
    noteKind: 'tap',
    casillaShape: 'square',
  },
  {
    type: 'note_hold',
    category: 'gameplay',
    label: 'Casilla Larga',
    shortLabel: 'Larga',
    description: 'Casilla larga sostenida con duración editable',
    defaultColor: '#f59e0b',
    defaultShape: 'tile',
    defaultScale: [1, 1, 1],
    noteKind: 'hold',
    casillaShape: 'long',
  },
  {
    type: 'note_flick',
    category: 'gameplay',
    label: 'Casilla Flick',
    shortLabel: 'Flick',
    description: 'Casilla direccional de gesto rápido',
    defaultColor: '#fde047',
    defaultShape: 'prism',
    defaultScale: [1, 1, 1],
    noteKind: 'flick',
    casillaShape: 'triangle',
  },
  {
    type: 'note_slide',
    category: 'gameplay',
    label: 'Casilla Slide',
    shortLabel: 'Slide',
    description: 'Casilla deslizable hacia otro carril',
    defaultColor: '#2dd4bf',
    defaultShape: 'tile',
    defaultScale: [1, 1, 1],
    noteKind: 'slide',
    casillaShape: 'long',
  },
  // ACTIVE V3 TRIGGERS
  {
    type: 'camera_fx_trigger',
    category: 'effects',
    label: 'Trigger Camera FX',
    shortLabel: 'Camera FX',
    description: 'Efecto cinematográfico de cámara o pantalla activado por línea verde',
    defaultColor: '#38bdf8',
    defaultShape: 'diamond',
    defaultScale: [1, 1, 1],
    defaultTriggerType: 'camera_fx',
  },
  {
    type: 'pulse_trigger',
    category: 'effects',
    label: 'Trigger Pulse',
    shortLabel: 'Pulse',
    description: 'Pulso de bordes, flash o glow reactivo',
    defaultColor: '#22d3ee',
    defaultShape: 'ring',
    defaultScale: [1, 1, 1],
    defaultTriggerType: 'screen_pulse',
  },
  {
    type: 'background_trigger',
    category: 'effects',
    label: 'Trigger Background',
    shortLabel: 'Background',
    description: 'Transición o modulación de escenario y partículas',
    defaultColor: '#ec4899',
    defaultShape: 'square',
    defaultScale: [1, 1, 1],
    defaultTriggerType: 'background',
  },
  // LEGACY READ-COMPATIBLE TYPES (kept for v1/v2 migration; excluded from active BUILD tray)
  {
    type: 'receptor',
    category: 'gameplay',
    label: 'Pulsador / Receptor',
    shortLabel: 'Pulsador',
    description: 'Zona receptora heredada',
    defaultColor: '#38bdf8',
    defaultShape: 'square',
    defaultScale: [1.1, 0.35, 1.1],
  },
  {
    type: 'lane_segment',
    category: 'gameplay',
    label: 'Carril / Pista',
    shortLabel: 'Carril',
    description: 'Segmento heredado',
    defaultColor: '#6366f1',
    defaultShape: 'tile',
    defaultScale: [1.35, 0.12, 4.0],
  },
  {
    type: 'hit_zone',
    category: 'gameplay',
    label: 'Zona Táctil',
    shortLabel: 'Zona Hit',
    description: 'Zona heredada',
    defaultColor: '#ec4899',
    defaultShape: 'ring',
    defaultScale: [1.25, 0.25, 1.25],
  },
  {
    type: 'obstacle',
    category: 'gameplay',
    label: 'Obstáculo (Legado)',
    shortLabel: 'Obstáculo',
    description: 'Elemento heredado de niveles v1/v2',
    defaultColor: '#ef4444',
    defaultShape: 'prism',
    defaultScale: [1, 1.25, 1],
  },
  {
    type: 'platform',
    category: 'gameplay',
    label: 'Plataforma (Legado)',
    shortLabel: 'Plataforma',
    description: 'Elemento heredado de niveles v1/v2',
    defaultColor: '#818cf8',
    defaultShape: 'square',
    defaultScale: [1.8, 0.25, 2.5],
  },
  {
    type: 'interactive_orb',
    category: 'gameplay',
    label: 'Orbe (Legado)',
    shortLabel: 'Orbe',
    description: 'Elemento heredado de niveles v1/v2',
    defaultColor: '#34d399',
    defaultShape: 'sphere',
    defaultScale: [0.95, 0.95, 0.95],
  },
  {
    type: 'speed_portal',
    category: 'gameplay',
    label: 'Portal (Legado)',
    shortLabel: 'Portal',
    description: 'Elemento heredado de niveles v1/v2',
    defaultColor: '#c084fc',
    defaultShape: 'ring',
    defaultScale: [1.6, 1.8, 0.4],
  },
  {
    type: 'geom_box',
    category: 'decoration',
    label: 'Cubo (Legado)',
    shortLabel: 'Cubo',
    description: 'Geometría heredada v1/v2',
    defaultColor: '#22d3ee',
    defaultShape: 'square',
    defaultScale: [1, 1, 1],
  },
  {
    type: 'geom_triangle',
    category: 'decoration',
    label: 'Pirámide (Legado)',
    shortLabel: 'Triángulo',
    description: 'Geometría heredada v1/v2',
    defaultColor: '#fb923c',
    defaultShape: 'prism',
    defaultScale: [1, 1.2, 1],
  },
  {
    type: 'geom_cylinder',
    category: 'decoration',
    label: 'Cilindro (Legado)',
    shortLabel: 'Cilindro',
    description: 'Geometría heredada v1/v2',
    defaultColor: '#a855f7',
    defaultShape: 'disc',
    defaultScale: [0.8, 2.2, 0.8],
  },
  {
    type: 'geom_sphere',
    category: 'decoration',
    label: 'Esfera (Legado)',
    shortLabel: 'Esfera',
    description: 'Geometría heredada v1/v2',
    defaultColor: '#38bdf8',
    defaultShape: 'sphere',
    defaultScale: [1, 1, 1],
  },
  {
    type: 'geom_diamond',
    category: 'decoration',
    label: 'Diamante (Legado)',
    shortLabel: 'Diamante',
    description: 'Geometría heredada v1/v2',
    defaultColor: '#e879f9',
    defaultShape: 'diamond',
    defaultScale: [1, 1.25, 1],
  },
  {
    type: 'geom_ring',
    category: 'decoration',
    label: 'Aro (Legado)',
    shortLabel: 'Aro',
    description: 'Geometría heredada v1/v2',
    defaultColor: '#2dd4bf',
    defaultShape: 'ring',
    defaultScale: [1.4, 1.4, 0.35],
  },
  {
    type: 'panel',
    category: 'decoration',
    label: 'Panel (Legado)',
    shortLabel: 'Panel',
    description: 'Decoración heredada v1/v2',
    defaultColor: '#6366f1',
    defaultShape: 'tile',
    defaultScale: [2.2, 1.4, 0.15],
  },
  {
    type: 'structure_arch',
    category: 'decoration',
    label: 'Arco (Legado)',
    shortLabel: 'Arco',
    description: 'Decoración heredada v1/v2',
    defaultColor: '#22d3ee',
    defaultShape: 'ring',
    defaultScale: [5.5, 3.6, 0.45],
  },
  {
    type: 'light_beacon',
    category: 'decoration',
    label: 'Baliza (Legado)',
    shortLabel: 'Luz',
    description: 'Decoración heredada v1/v2',
    defaultColor: '#fde047',
    defaultShape: 'disc',
    defaultScale: [0.55, 2.4, 0.55],
  },
  {
    type: 'particle_prop',
    category: 'decoration',
    label: 'Partículas (Legado)',
    shortLabel: 'Partículas',
    description: 'Decoración heredada v1/v2',
    defaultColor: '#f472b6',
    defaultShape: 'sphere',
    defaultScale: [1.2, 1.2, 1.2],
  },
  {
    type: 'ambient_element',
    category: 'decoration',
    label: 'Ambiente (Legado)',
    shortLabel: 'Ambiente',
    description: 'Decoración heredada v1/v2',
    defaultColor: '#34d399',
    defaultShape: 'prism',
    defaultScale: [1.8, 2.5, 0.6],
  },
  {
    type: 'particle_emitter',
    category: 'effects',
    label: 'Emisor (Legado)',
    shortLabel: 'Emisor',
    description: 'Efecto heredado v1/v2',
    defaultColor: '#ec4899',
    defaultShape: 'sphere',
    defaultScale: [0.8, 0.8, 0.8],
  },
  {
    type: 'light_source',
    category: 'effects',
    label: 'Foco (Legado)',
    shortLabel: 'Foco',
    description: 'Efecto heredado v1/v2',
    defaultColor: '#fde047',
    defaultShape: 'sphere',
    defaultScale: [0.75, 0.75, 0.75],
  },
  {
    type: 'distortion_field',
    category: 'effects',
    label: 'Campo Distorsión',
    shortLabel: 'Distorsión',
    description: 'Trigger screen_fx heredado v1/v2',
    defaultColor: '#a855f7',
    defaultShape: 'ring',
    defaultScale: [1.5, 1.5, 0.4],
    defaultTriggerType: 'screen_fx',
  },
  {
    type: 'screen_fx_node',
    category: 'effects',
    label: 'FX Pantalla',
    shortLabel: 'FX Pantalla',
    description: 'Trigger screen_fx heredado v1/v2',
    defaultColor: '#38bdf8',
    defaultShape: 'diamond',
    defaultScale: [0.9, 0.9, 0.9],
    defaultTriggerType: 'screen_fx',
  },
  {
    type: 'luminous_orb',
    category: 'effects',
    label: 'Halo (Legado)',
    shortLabel: 'Halo',
    description: 'Efecto heredado v1/v2',
    defaultColor: '#22d3ee',
    defaultShape: 'sphere',
    defaultScale: [1.1, 1.1, 1.1],
  },
  {
    type: 'transition_gate',
    category: 'effects',
    label: 'Puerta Transición',
    shortLabel: 'Transición',
    description: 'Efecto heredado v1/v2',
    defaultColor: '#fb7185',
    defaultShape: 'ring',
    defaultScale: [4.8, 2.8, 0.35],
    defaultTriggerType: 'color',
  },
  {
    type: 'trigger_node',
    category: 'control',
    label: 'Trigger (Evento)',
    shortLabel: 'Trigger',
    description: 'Nodo de automatización heredado o avanzado',
    defaultColor: '#f59e0b',
    defaultShape: 'hexagon',
    defaultScale: [0.85, 0.85, 0.85],
    defaultTriggerType: 'color',
  },
  {
    type: 'marker_node',
    category: 'control',
    label: 'Marcador',
    shortLabel: 'Marcador',
    description: 'Punto de referencia temporal',
    defaultColor: '#34d399',
    defaultShape: 'diamond',
    defaultScale: [0.7, 1.3, 0.7],
  },
  {
    type: 'reference_point',
    category: 'control',
    label: 'Referencia',
    shortLabel: 'Referencia',
    description: 'Ancla espacial heredada',
    defaultColor: '#38bdf8',
    defaultShape: 'sphere',
    defaultScale: [0.65, 0.65, 0.65],
  },
  {
    type: 'group_anchor',
    category: 'control',
    label: 'Ancla de Grupo',
    shortLabel: 'Grupo',
    description: 'Pivote heredado',
    defaultColor: '#c084fc',
    defaultShape: 'hexagon',
    defaultScale: [0.75, 0.75, 0.75],
  },
  {
    type: 'event_node',
    category: 'control',
    label: 'Nodo Lógica',
    shortLabel: 'Lógica',
    description: 'Trigger lógico heredado',
    defaultColor: '#fb7185',
    defaultShape: 'prism',
    defaultScale: [0.8, 0.8, 0.8],
    defaultTriggerType: 'logic',
  },
];

let objSeq = 1;
export function generateCreatorObjectId(prefix = 'obj'): string {
  objSeq++;
  return `${prefix}-${Date.now().toString(36)}-${objSeq.toString(36)}`;
}

export function casillaShapeToConcreteShape(shape: CasillaShape): ConcreteNoteShape {
  switch (shape) {
    case 'square':
      return 'square';
    case 'circle':
      return 'disc';
    case 'triangle':
      return 'prism';
    case 'diamond':
      return 'diamond';
    case 'long':
    default:
      return 'tile';
  }
}

export function concreteShapeToCasillaShape(
  shape: ConcreteNoteShape,
  kind?: NoteKind,
): CasillaShape {
  if (kind === 'hold' || kind === 'slide') return 'long';
  switch (shape) {
    case 'square':
      return 'square';
    case 'disc':
    case 'sphere':
      return 'circle';
    case 'prism':
      return 'triangle';
    case 'diamond':
      return 'diamond';
    default:
      return 'square';
  }
}

export function createDefaultCameraFxParams(
  fxKind: CameraFxKind = 'zoom',
): CameraFxTriggerParams {
  return {
    fxKind,
    intensity: fxKind === 'flash' ? 0.55 : fxKind === 'invert_colors' ? 1.0 : 0.75,
    duration: fxKind === 'flash' ? 0.25 : 0.8,
    fadeIn: 0.08,
    fadeOut: 0.25,
    easing: 'easeInOut',
    color: '#22d3ee',
    secondaryColor: '#ec4899',
    zoomFovDelta: fxKind === 'zoom' ? -10 : 0,
    rotationDeg: fxKind === 'rotation' ? 6 : 0,
    frequency: fxKind === 'shake' || fxKind === 'glitch' ? 14 : 4,
    syncWithBpm: true,
    delay: 0,
  };
}

export function createDefaultScreenPulseParams(
  pulseKind: PulseKind = 'borders_4',
): ScreenPulseTriggerParams {
  return {
    pulseKind,
    color: '#22d3ee',
    secondaryColor: '#ec4899',
    intensity: 0.85,
    duration: 0.45,
    fadeIn: 0.05,
    fadeOut: 0.28,
    density: 1.0,
    speed: 1.0,
    smoothness: 0.65,
    syncWithBpm: true,
    audioReactiveBand: 'low',
    edgeMask: {
      top:
        pulseKind === 'borders_4' ||
        pulseKind === 'border_top' ||
        pulseKind === 'full_flash',
      bottom:
        pulseKind === 'borders_4' ||
        pulseKind === 'border_bottom' ||
        pulseKind === 'full_flash',
      left:
        pulseKind === 'borders_4' ||
        pulseKind === 'borders_side' ||
        pulseKind === 'full_flash',
      right:
        pulseKind === 'borders_4' ||
        pulseKind === 'borders_side' ||
        pulseKind === 'full_flash',
    },
    blendMode: 'additive',
    delay: 0,
  };
}

export function createDefaultBackgroundTriggerParams(
  theme?: EnvironmentTheme,
): BackgroundTriggerParams {
  return {
    theme,
    primaryColor: '#22d3ee',
    secondaryColor: '#ec4899',
    brightness: 1.0,
    saturation: 1.0,
    parallaxSpeed: 1.0,
    scrollSpeed: 1.0,
    particleDensity: 1.0,
    transitionDuration: 0.9,
    layerVisibility: {
      sky: true,
      midground: true,
      foreground: true,
    },
    easing: 'easeInOut',
    delay: 0,
  };
}

export function createDefaultTriggerPayload(
  type: TriggerType,
  targetGroupId = 1,
): NonNullable<CreatorObject['trigger']> {
  switch (type) {
    case 'camera_fx':
      return {
        type: 'camera_fx',
        params: createDefaultCameraFxParams('zoom'),
      };
    case 'screen_pulse':
      return {
        type: 'screen_pulse',
        params: createDefaultScreenPulseParams('borders_4'),
      };
    case 'background':
      return {
        type: 'background',
        params: createDefaultBackgroundTriggerParams(),
      };
    case 'color':
      return {
        type: 'color',
        params: {
          targetGroupId,
          color: '#ec4899',
          hueShift: 0,
          saturation: 1.0,
          value: 1.0,
          brightness: 1.0,
          opacity: 1.0,
          emission: 1.25,
          glowIntensity: 1.15,
          blendMode: 'normal',
          interpolate: true,
          fadeIn: 0.25,
          holdDuration: 1.2,
          fadeOut: 0.4,
          easing: 'easeInOut',
          exclusive: false,
          delay: 0,
        },
      };
    case 'alpha':
      return {
        type: 'alpha',
        params: {
          targetGroupId,
          startValue: 1,
          endValue: 0.15,
          fadeDuration: 0.6,
          delay: 0,
          easing: 'easeInOut',
        },
      };
    case 'pulse':
      return {
        type: 'pulse',
        params: {
          targetGroupId,
          pulseColor: '#fde047',
          intensity: 1.35,
          fadeIn: 0.05,
          hold: 0.12,
          fadeOut: 0.28,
          frequency: 2,
          repeatCount: 1,
          blendMode: 'additive',
          exclusive: false,
          syncWithMusic: true,
        },
      };
    case 'move':
      return {
        type: 'move',
        params: {
          targetGroupId,
          targetX: 0,
          targetY: 1.2,
          targetZ: 0,
          relative: true,
          duration: 0.8,
          delay: 0,
          easing: 'easeOut',
          repeat: 1,
          reverse: true,
          loop: false,
          axisLock: 'none',
        },
      };
    case 'rotate':
      return {
        type: 'rotate',
        params: {
          targetGroupId,
          rotX: 0,
          rotY: 180,
          rotZ: 0,
          rotationCenter: { x: 0, y: 0, z: 0 },
          duration: 1.0,
          delay: 0,
          easing: 'easeInOut',
          repeat: 1,
          continuous: false,
          lockRotation: false,
        },
      };
    case 'scale':
      return {
        type: 'scale',
        params: {
          targetGroupId,
          scaleX: 1.35,
          scaleY: 1.35,
          scaleZ: 1.35,
          uniformScale: true,
          duration: 0.45,
          delay: 0,
          easing: 'back',
          repeat: 1,
          restoreOriginal: true,
        },
      };
    case 'toggle':
      return {
        type: 'toggle',
        params: {
          targetGroupId,
          activate: false,
          collisionEnabled: false,
          renderingEnabled: false,
          immediate: true,
          delay: 0,
        },
      };
    case 'spawn':
      return {
        type: 'spawn',
        params: {
          targetEventId: 'evt-1',
          delay: 0.25,
          repeat: 1,
          triggerOnce: false,
          previewDisabled: false,
        },
      };
    case 'camera':
      return {
        type: 'camera',
        params: {
          action: 'zoom',
          zoomFovDelta: -8,
          offsetX: 0,
          offsetY: 0.4,
          offsetZ: -0.6,
          rotZ: 3,
          shakeIntensity: 0.4,
          lockCamera: false,
          duration: 0.75,
          delay: 0,
          easing: 'easeInOut',
        },
      };
    case 'screen_fx':
      return {
        type: 'screen_fx',
        params: {
          effect: 'bloom',
          intensity: 0.75,
          duration: 0.9,
          fadeIn: 0.15,
          fadeOut: 0.35,
          color: '#22d3ee',
          minQuality: 'low',
          delay: 0,
        },
      };
    case 'audio':
      return {
        type: 'audio',
        params: {
          eventKind: 'kick',
          threshold: 0.45,
          targetGroupId,
          spawnEventId: 'evt-1',
          cooldownSec: 0.18,
        },
      };
    case 'logic':
      return {
        type: 'logic',
        params: {
          op: 'COUNTER',
          variableA: 'hits',
          compareOp: '>=',
          compareValue: 5,
          incrementBy: 1,
          randomChance: 0.5,
          timerIntervalSec: 1.0,
          eventName: 'evt-logic',
          outputTrueEventId: 'evt-1',
          targetGroupId,
        },
      };
  }
}

export function getObjectTemplate(type: CreatorObjectType): ObjectTemplate {
  return OBJECT_LIBRARY_TEMPLATES.find((t) => t.type === type) ?? OBJECT_LIBRARY_TEMPLATES[0];
}

export function isCasillaObject(obj: CreatorObject): boolean {
  return (
    obj.type === 'note_tap' ||
    obj.type === 'note_hold' ||
    obj.type === 'note_flick' ||
    obj.type === 'note_slide'
  );
}

export function isTriggerLineObject(obj: CreatorObject): boolean {
  return Boolean(obj.trigger);
}

export function createObjectFromBuildItem(
  item: CreatorBuildItem,
  options: {
    timeSec: number;
    lane: number;
    laneCount: number;
    primaryPaletteColor?: string;
    secondaryPaletteColor?: string;
  },
): CreatorObject {
  const timeSec = Math.max(0, Number(options.timeSec.toFixed(3)));
  const laneCount = Math.max(4, options.laneCount);

  if (item.categoryTab === 'casillas') {
    const lane = Math.max(0, Math.min(laneCount - 1, options.lane));
    const shape = item.casillaShape ?? 'square';
    const noteKind = item.noteKind ?? (shape === 'long' ? 'hold' : 'tap');
    const objType: CreatorObjectType =
      noteKind === 'hold'
        ? 'note_hold'
        : noteKind === 'flick'
          ? 'note_flick'
          : noteKind === 'slide'
            ? 'note_slide'
            : 'note_tap';

    const color =
      item.accentColor ||
      (lane % 2 === 0
        ? options.primaryPaletteColor ?? '#22d3ee'
        : options.secondaryPaletteColor ?? '#ec4899');
    const laneX = (lane - (laneCount - 1) / 2) * 1.45;
    const hitExplosion: HitExplosionStyle = noteKind === 'hold' ? 'neon_flame' : 'shockwave';

    return {
      id: generateCreatorObjectId('cas'),
      name: item.label,
      type: objType,
      category: 'gameplay',
      timeSec,
      lane,
      position: { x: Number(laneX.toFixed(2)), y: 0.14, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layer: 1,
      locked: false,
      hidden: false,
      collisionEnabled: true,
      groupIds: [1],
      material: {
        color,
        emissive: color,
        secondaryColor: options.secondaryPaletteColor ?? '#ec4899',
        colorComboMode: 'solid',
        opacity: 1,
        emission: 0.9,
        glowIntensity: 0.95,
        blendMode: 'normal',
        shape: casillaShapeToConcreteShape(shape),
        hitExplosion,
      },
      noteData: {
        lane,
        kind: noteKind,
        casillaShape: shape,
        durationSec: noteKind === 'hold' ? 1.0 : noteKind === 'slide' ? 0.75 : 0,
        flickDirection: noteKind === 'flick' ? 'up' : undefined,
        slideTargetLane: noteKind === 'slide' ? Math.min(laneCount - 1, lane + 1) : undefined,
        points: 120,
      },
    };
  }

  if (item.categoryTab === 'camera_fx') {
    const fxKind = item.cameraFxKind ?? 'zoom';
    return {
      id: generateCreatorObjectId('cam'),
      name: `Camera FX: ${item.label}`,
      type: 'camera_fx_trigger',
      category: 'effects',
      timeSec,
      lane: -1,
      position: { x: -3.6, y: 0.8, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layer: 3,
      locked: false,
      hidden: false,
      collisionEnabled: false,
      groupIds: [1],
      material: {
        color: item.accentColor,
        emissive: item.accentColor,
        opacity: 1,
        emission: 1,
        glowIntensity: 1,
        blendMode: 'additive',
        shape: 'diamond',
      },
      trigger: {
        type: 'camera_fx',
        params: createDefaultCameraFxParams(fxKind),
      },
    };
  }

  if (item.categoryTab === 'pulses') {
    const pulseKind = item.pulseKind ?? 'borders_4';
    return {
      id: generateCreatorObjectId('pls'),
      name: `Pulse: ${item.label}`,
      type: 'pulse_trigger',
      category: 'effects',
      timeSec,
      lane: -1,
      position: { x: -3.6, y: 1.0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      layer: 3,
      locked: false,
      hidden: false,
      collisionEnabled: false,
      groupIds: [1],
      material: {
        color: item.accentColor,
        emissive: item.accentColor,
        secondaryColor: '#ec4899',
        opacity: 1,
        emission: 1,
        glowIntensity: 1,
        blendMode: 'additive',
        shape: 'ring',
      },
      trigger: {
        type: 'screen_pulse',
        params: createDefaultScreenPulseParams(pulseKind),
      },
    };
  }

  // backgrounds
  const bgParams = createDefaultBackgroundTriggerParams(item.backgroundTheme);
  if (item.backgroundPresetMode === 'particles') {
    bgParams.particleDensity = 1.65;
  } else if (item.backgroundPresetMode === 'parallax') {
    bgParams.parallaxSpeed = 1.6;
    bgParams.scrollSpeed = 1.45;
  } else if (item.backgroundPresetMode === 'color') {
    bgParams.primaryColor = options.primaryPaletteColor ?? '#22d3ee';
    bgParams.secondaryColor = options.secondaryPaletteColor ?? '#ec4899';
    bgParams.saturation = 1.25;
  }
  return {
    id: generateCreatorObjectId('bg'),
    name: `BG: ${item.label}`,
    type: 'background_trigger',
    category: 'effects',
    timeSec,
    lane: -1,
    position: { x: -3.6, y: 1.2, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    layer: 3,
    locked: false,
    hidden: false,
    collisionEnabled: false,
    groupIds: [1],
    material: {
      color: item.accentColor,
      emissive: item.accentColor,
      secondaryColor: bgParams.secondaryColor,
      opacity: 1,
      emission: 1,
      glowIntensity: 1,
      blendMode: 'normal',
      shape: 'square',
    },
    trigger: {
      type: 'background',
      params: bgParams,
    },
  };
}

export function createObjectFromTemplate(
  type: CreatorObjectType,
  options: {
    timeSec?: number;
    lane?: number;
    laneCount?: number;
    position?: { x: number; y: number; z: number };
    groupIds?: number[];
    triggerType?: TriggerType;
  } = {},
): CreatorObject {
  const tpl = getObjectTemplate(type);
  const laneCount = options.laneCount ?? 4;
  const lane = options.lane ?? (tpl.category === 'gameplay' ? 1 : -1);
  const timeSec = Math.max(0, Number((options.timeSec ?? 2.0).toFixed(3)));
  const laneX =
    lane >= 0 && lane < laneCount
      ? (lane - (laneCount - 1) / 2) * 1.45
      : tpl.category === 'decoration'
        ? -3.4
        : 0;

  const isNote =
    type === 'note_tap' ||
    type === 'note_hold' ||
    type === 'note_flick' ||
    type === 'note_slide';

  const triggerKind = options.triggerType ?? tpl.defaultTriggerType;
  const casillaShape = tpl.casillaShape ?? concreteShapeToCasillaShape(tpl.defaultShape, tpl.noteKind);

  return {
    id: generateCreatorObjectId(tpl.category.slice(0, 3)),
    name: tpl.label,
    type,
    category: tpl.category,
    timeSec,
    lane,
    position: options.position ?? {
      x: Number(laneX.toFixed(2)),
      y: type === 'structure_arch' ? 1.8 : type === 'obstacle' ? 0.55 : 0.14,
      z: 0,
    },
    rotation: { x: 0, y: 0, z: 0 },
    scale: {
      x: tpl.defaultScale[0],
      y: tpl.defaultScale[1],
      z: tpl.defaultScale[2],
    },
    layer: tpl.category === 'gameplay' ? 1 : tpl.category === 'control' ? 3 : 2,
    locked: false,
    hidden: false,
    collisionEnabled: tpl.category === 'gameplay',
    groupIds: options.groupIds ?? [1],
    material: {
      color: tpl.defaultColor,
      emissive: tpl.defaultColor,
      secondaryColor: '#ec4899',
      colorComboMode: 'solid',
      opacity: 1,
      emission: 0.85,
      glowIntensity: 0.9,
      blendMode: 'normal',
      shape: tpl.defaultShape,
      hitExplosion: isNote ? (type === 'note_hold' ? 'neon_flame' : 'shockwave') : 'none',
    },
    noteData: isNote
      ? {
          lane: Math.max(0, lane),
          kind: tpl.noteKind ?? 'tap',
          casillaShape,
          durationSec: type === 'note_hold' ? 1.0 : type === 'note_slide' ? 0.75 : 0,
          flickDirection: type === 'note_flick' ? 'up' : undefined,
          slideTargetLane:
            type === 'note_slide' ? Math.min(laneCount - 1, Math.max(0, lane) + 1) : undefined,
          points: 120,
        }
      : type === 'obstacle' ||
          type === 'interactive_orb' ||
          type === 'hit_zone' ||
          type === 'speed_portal'
        ? {
            lane: Math.max(0, lane),
            kind: 'tap',
            durationSec: 0,
            isHazard: type === 'obstacle',
            speedMultiplier: type === 'speed_portal' ? 1.25 : undefined,
            points: type === 'interactive_orb' || type === 'hit_zone' ? 160 : 0,
          }
        : undefined,
    trigger: triggerKind ? createDefaultTriggerPayload(triggerKind, 1) : undefined,
  };
}
