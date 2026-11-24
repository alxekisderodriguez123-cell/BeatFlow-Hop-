import type {
  CreatorObject,
  CreatorObjectType,
  ObjectCategory,
  TriggerType,
} from '../types/creator';
import type { ConcreteNoteShape, NoteKind } from '../types/game';

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
}

export const OBJECT_CATEGORY_LABELS: Record<ObjectCategory | 'all', string> = {
  all: 'Todo',
  gameplay: 'Gameplay',
  decoration: 'Decoración',
  effects: 'Efectos',
  control: 'Control',
};

export const OBJECT_LIBRARY_TEMPLATES: ObjectTemplate[] = [
  // GAMEPLAY
  {
    type: 'note_tap',
    category: 'gameplay',
    label: 'Nota Tap',
    shortLabel: 'Nota',
    description: 'Nota rítmica estándar de pulsación simple',
    defaultColor: '#22d3ee',
    defaultShape: 'tile',
    defaultScale: [1, 1, 1],
    noteKind: 'tap',
  },
  {
    type: 'note_hold',
    category: 'gameplay',
    label: 'Nota Hold',
    shortLabel: 'Hold',
    description: 'Nota sostenida con cinta continua de duración editable',
    defaultColor: '#f59e0b',
    defaultShape: 'tile',
    defaultScale: [1, 1, 1],
    noteKind: 'hold',
  },
  {
    type: 'note_flick',
    category: 'gameplay',
    label: 'Nota Flick',
    shortLabel: 'Flick',
    description: 'Nota direccional de gesto rápido',
    defaultColor: '#fde047',
    defaultShape: 'diamond',
    defaultScale: [1, 1, 1],
    noteKind: 'flick',
  },
  {
    type: 'note_slide',
    category: 'gameplay',
    label: 'Nota Slide',
    shortLabel: 'Slide',
    description: 'Nota deslizable hacia otro carril o zona',
    defaultColor: '#2dd4bf',
    defaultShape: 'hexagon',
    defaultScale: [1, 1, 1],
    noteKind: 'slide',
  },
  {
    type: 'receptor',
    category: 'gameplay',
    label: 'Pulsador / Receptor',
    shortLabel: 'Pulsador',
    description: 'Zona receptora o pad interactivo personalizado',
    defaultColor: '#38bdf8',
    defaultShape: 'square',
    defaultScale: [1.1, 0.35, 1.1],
  },
  {
    type: 'lane_segment',
    category: 'gameplay',
    label: 'Carril / Pista',
    shortLabel: 'Carril',
    description: 'Segmento de carril personalizable para rutas alternativas',
    defaultColor: '#6366f1',
    defaultShape: 'tile',
    defaultScale: [1.35, 0.12, 4.0],
  },
  {
    type: 'hit_zone',
    category: 'gameplay',
    label: 'Zona Táctil / Impacto',
    shortLabel: 'Zona Hit',
    description: 'Zona de ritmo libre en pantalla para modos experimentales',
    defaultColor: '#ec4899',
    defaultShape: 'ring',
    defaultScale: [1.25, 0.25, 1.25],
  },
  {
    type: 'obstacle',
    category: 'gameplay',
    label: 'Obstáculo / Pincho',
    shortLabel: 'Obstáculo',
    description: 'Bloque de peligro a esquivar durante la secuencia',
    defaultColor: '#ef4444',
    defaultShape: 'prism',
    defaultScale: [1, 1.25, 1],
  },
  {
    type: 'platform',
    category: 'gameplay',
    label: 'Plataforma',
    shortLabel: 'Plataforma',
    description: 'Superficie elevada 3D para coreografías y obstáculos',
    defaultColor: '#818cf8',
    defaultShape: 'square',
    defaultScale: [1.8, 0.25, 2.5],
  },
  {
    type: 'interactive_orb',
    category: 'gameplay',
    label: 'Orbe Interactivo',
    shortLabel: 'Orbe',
    description: 'Objeto interactivo que dispara eventos al pulsarlo',
    defaultColor: '#34d399',
    defaultShape: 'sphere',
    defaultScale: [0.95, 0.95, 0.95],
  },
  {
    type: 'speed_portal',
    category: 'gameplay',
    label: 'Portal Modificador',
    shortLabel: 'Portal',
    description: 'Modifica velocidad o reglas al cruzar su tiempo',
    defaultColor: '#c084fc',
    defaultShape: 'ring',
    defaultScale: [1.6, 1.8, 0.4],
  },

  // DECORATION
  {
    type: 'geom_box',
    category: 'decoration',
    label: 'Cubo Neón',
    shortLabel: 'Cubo',
    description: 'Forma geométrica cúbica decorativa',
    defaultColor: '#22d3ee',
    defaultShape: 'square',
    defaultScale: [1, 1, 1],
  },
  {
    type: 'geom_triangle',
    category: 'decoration',
    label: 'Pirámide / Prisma',
    shortLabel: 'Triángulo',
    description: 'Pirámide luminosa estilizada',
    defaultColor: '#fb923c',
    defaultShape: 'prism',
    defaultScale: [1, 1.2, 1],
  },
  {
    type: 'geom_cylinder',
    category: 'decoration',
    label: 'Cilindro / Pilar',
    shortLabel: 'Cilindro',
    description: 'Columna o pilar luminoso lateral',
    defaultColor: '#a855f7',
    defaultShape: 'disc',
    defaultScale: [0.8, 2.2, 0.8],
  },
  {
    type: 'geom_sphere',
    category: 'decoration',
    label: 'Esfera',
    shortLabel: 'Esfera',
    description: 'Esfera flotante decorativa',
    defaultColor: '#38bdf8',
    defaultShape: 'sphere',
    defaultScale: [1, 1, 1],
  },
  {
    type: 'geom_diamond',
    category: 'decoration',
    label: 'Diamante',
    shortLabel: 'Diamante',
    description: 'Cristal octaedro brillante',
    defaultColor: '#e879f9',
    defaultShape: 'diamond',
    defaultScale: [1, 1.25, 1],
  },
  {
    type: 'geom_ring',
    category: 'decoration',
    label: 'Aro Orbital',
    shortLabel: 'Aro',
    description: 'Anillo geométrico rotatorio',
    defaultColor: '#2dd4bf',
    defaultShape: 'ring',
    defaultScale: [1.4, 1.4, 0.35],
  },
  {
    type: 'panel',
    category: 'decoration',
    label: 'Panel Holográfico',
    shortLabel: 'Panel',
    description: 'Pantalla o valla luminosa lateral',
    defaultColor: '#6366f1',
    defaultShape: 'tile',
    defaultScale: [2.2, 1.4, 0.15],
  },
  {
    type: 'structure_arch',
    category: 'decoration',
    label: 'Arco Estructural',
    shortLabel: 'Arco',
    description: 'Pórtico arquitectónico sobre la pista',
    defaultColor: '#22d3ee',
    defaultShape: 'ring',
    defaultScale: [5.5, 3.6, 0.45],
  },
  {
    type: 'light_beacon',
    category: 'decoration',
    label: 'Faro / Baliza',
    shortLabel: 'Luz',
    description: 'Baliza luminosa decorativa reactiva',
    defaultColor: '#fde047',
    defaultShape: 'cylinder' as unknown as ConcreteNoteShape,
    defaultScale: [0.55, 2.4, 0.55],
  },
  {
    type: 'particle_prop',
    category: 'decoration',
    label: 'Nube de Partículas',
    shortLabel: 'Partículas',
    description: 'Grupo visual de chispas decorativas',
    defaultColor: '#f472b6',
    defaultShape: 'sphere',
    defaultScale: [1.2, 1.2, 1.2],
  },
  {
    type: 'ambient_element',
    category: 'decoration',
    label: 'Elemento Ambiental',
    shortLabel: 'Ambiente',
    description: 'Silueta o pieza ambiental de fondo 2.5D',
    defaultColor: '#34d399',
    defaultShape: 'prism',
    defaultScale: [1.8, 2.5, 0.6],
  },

  // EFFECTS
  {
    type: 'particle_emitter',
    category: 'effects',
    label: 'Emisor de Partículas',
    shortLabel: 'Emisor FX',
    description: 'Emisor configurable vinculado a triggers o música',
    defaultColor: '#ec4899',
    defaultShape: 'sphere',
    defaultScale: [0.8, 0.8, 0.8],
  },
  {
    type: 'light_source',
    category: 'effects',
    label: 'Fuente de Luz',
    shortLabel: 'Foco',
    description: 'Punto luminoso de acento para zonas del nivel',
    defaultColor: '#fde047',
    defaultShape: 'sphere',
    defaultScale: [0.75, 0.75, 0.75],
  },
  {
    type: 'distortion_field',
    category: 'effects',
    label: 'Campo de Distorsión',
    shortLabel: 'Distorsión',
    description: 'Dispara distorsión óptica temporal al cruzarse',
    defaultColor: '#a855f7',
    defaultShape: 'ring',
    defaultScale: [1.5, 1.5, 0.4],
    defaultTriggerType: 'screen_fx',
  },
  {
    type: 'screen_fx_node',
    category: 'effects',
    label: 'Efecto de Pantalla',
    shortLabel: 'FX Pantalla',
    description: 'Activa Bloom, Aberración, Flash o Viñeta',
    defaultColor: '#38bdf8',
    defaultShape: 'diamond',
    defaultScale: [0.9, 0.9, 0.9],
    defaultTriggerType: 'screen_fx',
  },
  {
    type: 'luminous_orb',
    category: 'effects',
    label: 'Objeto Luminoso',
    shortLabel: 'Halo',
    description: 'Núcleo brillante de alto glow para grupos animados',
    defaultColor: '#22d3ee',
    defaultShape: 'sphere',
    defaultScale: [1.1, 1.1, 1.1],
  },
  {
    type: 'transition_gate',
    category: 'effects',
    label: 'Puerta de Transición',
    shortLabel: 'Transición',
    description: 'Marca cambio de sección visual con flash suave',
    defaultColor: '#fb7185',
    defaultShape: 'ring',
    defaultScale: [4.8, 2.8, 0.35],
    defaultTriggerType: 'color',
  },

  // CONTROL
  {
    type: 'trigger_node',
    category: 'control',
    label: 'Trigger (Evento)',
    shortLabel: 'Trigger',
    description: 'Nodo de automatización: Color, Move, Rotate, Camera, Audio, Logic...',
    defaultColor: '#f59e0b',
    defaultShape: 'hexagon',
    defaultScale: [0.85, 0.85, 0.85],
    defaultTriggerType: 'color',
  },
  {
    type: 'marker_node',
    category: 'control',
    label: 'Marcador de Tiempo',
    shortLabel: 'Marcador',
    description: 'Punto de referencia para probar desde aquí y secciones',
    defaultColor: '#34d399',
    defaultShape: 'diamond',
    defaultScale: [0.7, 1.3, 0.7],
  },
  {
    type: 'reference_point',
    category: 'control',
    label: 'Punto de Referencia',
    shortLabel: 'Referencia',
    description: 'Ancla espacial para Follow Target o cámara',
    defaultColor: '#38bdf8',
    defaultShape: 'sphere',
    defaultScale: [0.65, 0.65, 0.65],
  },
  {
    type: 'group_anchor',
    category: 'control',
    label: 'Ancla de Grupo',
    shortLabel: 'Grupo',
    description: 'Pivote auxiliar para rotaciones o movimientos grupales',
    defaultColor: '#c084fc',
    defaultShape: 'hexagon',
    defaultScale: [0.75, 0.75, 0.75],
  },
  {
    type: 'event_node',
    category: 'control',
    label: 'Nodo de Lógica / Evento',
    shortLabel: 'Lógica',
    description: 'Disparador lógico AND/OR/Counter/Timer sin código arbitrario',
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

export function createDefaultTriggerPayload(
  type: TriggerType,
  targetGroupId = 1,
): NonNullable<CreatorObject['trigger']> {
  switch (type) {
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
  const safeShape: ConcreteNoteShape =
    tpl.defaultShape === ('cylinder' as unknown as ConcreteNoteShape) ? 'disc' : tpl.defaultShape;

  const isNote =
    type === 'note_tap' ||
    type === 'note_hold' ||
    type === 'note_flick' ||
    type === 'note_slide';

  const triggerKind = options.triggerType ?? tpl.defaultTriggerType;

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
      opacity: 1,
      emission: 0.85,
      glowIntensity: 0.9,
      blendMode: 'normal',
      shape: safeShape,
    },
    noteData: isNote
      ? {
          lane: Math.max(0, lane),
          kind: tpl.noteKind ?? 'tap',
          durationSec: type === 'note_hold' ? 1.2 : type === 'note_slide' ? 0.75 : 0,
          flickDirection: type === 'note_flick' ? 'up' : undefined,
          slideTargetLane:
            type === 'note_slide' ? Math.min(laneCount - 1, Math.max(0, lane) + 1) : undefined,
          points: 120,
        }
      : type === 'obstacle' || type === 'interactive_orb' || type === 'hit_zone' || type === 'speed_portal'
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
