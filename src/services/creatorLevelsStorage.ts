import type { BeatflowLevelDocument } from '../types/creator';
import { createEmptyLevelDocument, migrateLevelDocument } from '../creator/LevelSerializer';
import {
  CREATOR_BUILD_ITEMS,
  createObjectFromBuildItem,
} from '../creator/ObjectLibrary';

const CREATOR_LEVELS_KEY = 'beatflow_creator_levels_v1';
const CREATOR_ACTIVE_ID_KEY = 'beatflow_creator_active_id_v1';

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
  const nextDoc: BeatflowLevelDocument = migrateLevelDocument({
    ...level,
    updatedDate: new Date().toISOString(),
  } as unknown as Record<string, unknown>);
  const idx = list.findIndex((l) => l.levelId === nextDoc.levelId);
  const updated =
    idx >= 0 ? list.map((l, i) => (i === idx ? nextDoc : l)) : [nextDoc, ...list];
  try {
    localStorage.setItem(CREATOR_LEVELS_KEY, JSON.stringify(updated));
    localStorage.setItem(CREATOR_ACTIVE_ID_KEY, nextDoc.levelId);
  } catch {
    // Storage quota fallback
  }
  return updated;
}

export function deleteCreatorLevel(levelId: string): BeatflowLevelDocument[] {
  const list = loadSavedCreatorLevels().filter((l) => l.levelId !== levelId);
  try {
    localStorage.setItem(CREATOR_LEVELS_KEY, JSON.stringify(list));
    if (localStorage.getItem(CREATOR_ACTIVE_ID_KEY) === levelId) {
      if (list[0]) localStorage.setItem(CREATOR_ACTIVE_ID_KEY, list[0].levelId);
      else localStorage.removeItem(CREATOR_ACTIVE_ID_KEY);
    }
  } catch {
    // Ignore
  }
  return list;
}

export function loadActiveCreatorLevelId(): string | null {
  try {
    return localStorage.getItem(CREATOR_ACTIVE_ID_KEY);
  } catch {
    return null;
  }
}

export function saveActiveCreatorLevelId(levelId: string): void {
  try {
    localStorage.setItem(CREATOR_ACTIVE_ID_KEY, levelId);
  } catch {
    // Ignore
  }
}
