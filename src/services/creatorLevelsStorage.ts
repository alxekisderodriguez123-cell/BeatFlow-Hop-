import type { BeatflowLevelDocument } from '../types/creator';
import { createEmptyLevelDocument, migrateLevelDocument } from '../creator/LevelSerializer';
import { createObjectFromTemplate } from '../creator/ObjectLibrary';
import { createDefaultGameplayRules } from '../creator/LevelSerializer';

const CREATOR_LEVELS_KEY = 'beatflow_creator_levels_v1';

function buildStarterTemplates(): BeatflowLevelDocument[] {
  // 1. Classic 4-Lane Neon Demo with Color/Pulse/Camera Triggers
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
    'Plantilla oficial de XanderAI Games con notas manuales, arcos de neón en Grupo 2 y triggers Color/Pulse/Camera sincronizados.';
  classic.groups.push({
    id: 2,
    name: 'Arcos Neón',
    color: '#ec4899',
    locked: false,
    visible: true,
    active: true,
  });

  const beat = 60 / 128;
  for (let i = 0; i < 24; i++) {
    const t = 1.5 + i * beat;
    const lane = i % 4;
    classic.objects.push(
      createObjectFromTemplate(i % 6 === 5 ? 'note_hold' : i % 8 === 3 ? 'note_flick' : 'note_tap', {
        timeSec: t,
        lane,
        laneCount: 4,
      }),
    );
    if (i % 4 === 0) {
      const arch = createObjectFromTemplate('structure_arch', {
        timeSec: t,
        lane: -1,
        position: { x: 0, y: 1.9, z: 0 },
        groupIds: [2],
      });
      classic.objects.push(arch);
    }
  }

  const colorTrig = createObjectFromTemplate('trigger_node', {
    timeSec: beat * 8,
    lane: -1,
    position: { x: -3.6, y: 0.6, z: 0 },
    triggerType: 'color',
  });
  if (colorTrig.trigger?.type === 'color') {
    colorTrig.trigger.params.targetGroupId = 2;
    colorTrig.trigger.params.color = '#ec4899';
  }
  const camTrig = createObjectFromTemplate('trigger_node', {
    timeSec: beat * 16,
    lane: -1,
    position: { x: -3.6, y: 1.2, z: 0 },
    triggerType: 'camera',
  });
  classic.objects.push(colorTrig, camTrig);

  // 2. Experimental Touch Zones & Obstacles Demo
  const exp = createEmptyLevelDocument({
    levelId: 'demo-xanderai-touch-reactor',
    levelName: 'Reactor Touch Zones',
    authorId: 'xanderai-official',
    authorName: 'XanderAI Games',
    environmentTheme: 'reactor',
    difficulty: 'hard',
    bpm: 136,
    durationSec: 32,
    songTitle: 'Reactor Core (Demo)',
    songArtist: 'XanderAI Games',
  });
  exp.description =
    'Demostración de modo Touch Zones + Obstáculos y Orbes Interactivos con triggers Move y Screen FX.';
  exp.gameplayRules = createDefaultGameplayRules('touch_zones', 4);
  exp.groups.push({
    id: 2,
    name: 'Pilares Móviles',
    color: '#fbbf24',
    locked: false,
    visible: true,
    active: true,
  });

  const expBeat = 60 / 136;
  for (let i = 0; i < 18; i++) {
    const t = 1.2 + i * expBeat;
    const type = i % 5 === 4 ? 'obstacle' : i % 4 === 2 ? 'interactive_orb' : 'hit_zone';
    const lane = i % 4;
    exp.objects.push(
      createObjectFromTemplate(type, {
        timeSec: t,
        lane,
        laneCount: 4,
      }),
    );
    if (i % 3 === 0) {
      exp.objects.push(
        createObjectFromTemplate('geom_diamond', {
          timeSec: t,
          lane: -1,
          position: { x: i % 2 === 0 ? -3.4 : 3.4, y: 1.5, z: 0 },
          groupIds: [2],
        }),
      );
    }
  }
  const moveTrig = createObjectFromTemplate('trigger_node', {
    timeSec: expBeat * 6,
    lane: -1,
    position: { x: 3.6, y: 0.7, z: 0 },
    triggerType: 'move',
  });
  if (moveTrig.trigger?.type === 'move') {
    moveTrig.trigger.params.targetGroupId = 2;
    moveTrig.trigger.params.targetY = 1.6;
  }
  exp.objects.push(moveTrig);

  return [classic, exp];
}

export function loadSavedCreatorLevels(): BeatflowLevelDocument[] {
  try {
    const raw = localStorage.getItem(CREATOR_LEVELS_KEY);
    if (!raw) {
      const starters = buildStarterTemplates();
      localStorage.setItem(CREATOR_LEVELS_KEY, JSON.stringify(starters));
      return starters;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const starters = buildStarterTemplates();
      localStorage.setItem(CREATOR_LEVELS_KEY, JSON.stringify(starters));
      return starters;
    }
    return parsed.map((item) => migrateLevelDocument(item));
  } catch {
    return buildStarterTemplates();
  }
}

export function saveCreatorLevel(level: BeatflowLevelDocument): BeatflowLevelDocument[] {
  const list = loadSavedCreatorLevels();
  const nextDoc: BeatflowLevelDocument = {
    ...level,
    updatedDate: new Date().toISOString(),
  };
  const idx = list.findIndex((l) => l.levelId === nextDoc.levelId);
  const updated =
    idx >= 0
      ? list.map((l, i) => (i === idx ? nextDoc : l))
      : [nextDoc, ...list];
  try {
    localStorage.setItem(CREATOR_LEVELS_KEY, JSON.stringify(updated));
  } catch {
    // Storage quota fallback
  }
  return updated;
}

export function deleteCreatorLevel(levelId: string): BeatflowLevelDocument[] {
  const list = loadSavedCreatorLevels().filter((l) => l.levelId !== levelId);
  try {
    localStorage.setItem(CREATOR_LEVELS_KEY, JSON.stringify(list));
  } catch {
    // Ignore
  }
  return list;
}
