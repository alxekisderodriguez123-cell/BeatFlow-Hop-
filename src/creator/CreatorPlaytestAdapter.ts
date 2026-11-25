import type {
  GeneratedLevel,
  LaneCount,
  LevelNote,
  MusicProfile,
  SongMetadata,
  SongPalette,
} from '../types/game';
import type { BeatflowLevelDocument, CreatorObject } from '../types/creator';
import { isCasillaObject } from './ObjectLibrary';
import { getSongBlob } from '../services/musicStorage';
import { audioEngine } from '../services/audioEngine';

export interface AdaptedCreatorPlaytest {
  generatedLevel: GeneratedLevel;
  palette: SongPalette;
  profile: MusicProfile;
  songMeta: SongMetadata;
  sortedTriggers: CreatorObject[];
  durationSec: number;
}

export function adaptCreatorLevelForScene(level: BeatflowLevelDocument): AdaptedCreatorPlaytest {
  const laneCount: LaneCount = level.gameplayRules.laneCount ?? 4;
  const bpm = Math.max(40, level.audio.bpm || 120);
  const beatDur = 60 / bpm;
  const durationSec = Math.max(12, level.audio.durationSec || 36);
  const approachSpeed = Math.max(0.6, Math.min(2.2, level.gameplayRules.approachSpeed || 1.0));
  const noteSpeed = 18 * approachSpeed;

  const casillas = level.objects
    .filter((o) => isCasillaObject(o))
    .slice()
    .sort((a, b) => a.timeSec - b.timeSec);

  const notes: LevelNote[] = [];
  let holdsCount = 0;
  let flicksCount = 0;
  let slidesCount = 0;

  casillas.forEach((obj, idx) => {
    const lane = Math.max(0, Math.min(laneCount - 1, Math.round(obj.lane >= 0 ? obj.lane : 0)));
    const kind =
      obj.noteData?.kind ??
      (obj.type === 'note_hold'
        ? 'hold'
        : obj.type === 'note_flick'
          ? 'flick'
          : obj.type === 'note_slide'
            ? 'slide'
            : 'tap');

    const durSec =
      kind === 'hold' || kind === 'slide'
        ? Math.max(0.15, obj.noteData?.durationSec ?? beatDur)
        : undefined;

    if (kind === 'hold') holdsCount++;
    if (kind === 'flick') flicksCount++;
    if (kind === 'slide') slidesCount++;

    const slideEndLane = Math.max(
      0,
      Math.min(laneCount - 1, obj.noteData?.slideTargetLane ?? Math.min(laneCount - 1, lane + 1)),
    );

    notes.push({
      id: idx + 1,
      time: Math.max(0, obj.timeSec),
      lane,
      kind,
      durationSec: durSec,
      flickDir: kind === 'flick' ? (obj.noteData?.flickDirection ?? 'up') : undefined,
      slidePath:
        kind === 'slide' && durSec
          ? [
              { timeOffset: 0, lane },
              { timeOffset: durSec, lane: slideEndLane },
            ]
          : undefined,
      intensity: obj.material.glowIntensity ?? 0.75,
      hit: false,
      missed: false,
      customColor: obj.material.color,
      customSecondaryColor: obj.material.secondaryColor,
      customColorComboMode: obj.material.colorComboMode,
      customCasillaShape: obj.noteData?.casillaShape,
      customHitExplosion: obj.material.hitExplosion,
    });
  });

  const beats: number[] = [];
  for (let t = Math.max(0, (level.audio.offsetMs || 0) / 1000); t <= durationSec; t += beatDur) {
    beats.push(Number(t.toFixed(4)));
  }

  const drops = level.markers
    .filter((m) => m.kind === 'drop')
    .map((m) => m.timeSec);

  const profile: MusicProfile = {
    bpm,
    duration: durationSec,
    beats,
    onsets: [],
    drops,
    energyTimeline: [],
    silenceRanges: [],
    averageEnergy: 0.55,
    analyzedAt: Date.now(),
  };

  const generatedLevel: GeneratedLevel = {
    seed: `creator:${level.levelId}`,
    difficulty: level.difficulty,
    laneCount,
    maxMisses: 999,
    bpm,
    notes,
    noteSpeed,
    hitWindowSec: 0.145,
    precisionStrictness: 1.0,
    stats: {
      totalNotes: notes.length,
      chordsCount: 0,
      holdsCount,
      flicksCount,
      slidesCount,
      streamsCount: 0,
      trillsCount: 0,
      burstsCount: 0,
      challengeNotesCount: 0,
      averageNps: durationSec > 0 ? Number((notes.length / durationSec).toFixed(2)) : 0,
    },
  };

  const songMeta: SongMetadata = {
    id: level.audio.songId || `creator_${level.levelId}`,
    title: level.levelName || level.audio.title || 'Nivel Creator',
    artist: level.authorName || level.audio.artist || 'Creator',
    album: 'BeatFlow Creator',
    fileName: `${level.levelId}.bfn`,
    fileSize: 0,
    duration: durationSec,
    palette: level.audio.palette,
    addedAt: Date.parse(level.creationDate) || Date.now(),
    isFavorite: false,
    profile,
  };

  const sortedTriggers = level.objects
    .filter((o) => !isCasillaObject(o))
    .slice()
    .sort((a, b) => a.timeSec - b.timeSec);

  return {
    generatedLevel,
    palette: level.audio.palette,
    profile,
    songMeta,
    sortedTriggers,
    durationSec,
  };
}

export async function ensureCreatorAudioDecoded(level: BeatflowLevelDocument): Promise<boolean> {
  if (!level.audio.songId) return false;
  try {
    const blob = await getSongBlob(level.audio.songId);
    if (!blob) return false;
    const buffer = await audioEngine.decodeBlob(blob);
    audioEngine.setBuffer(buffer);
    return true;
  } catch {
    return false;
  }
}
