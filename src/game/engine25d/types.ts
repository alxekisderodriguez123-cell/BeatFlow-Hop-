import type {
  ConcreteNoteShape,
  FlickDirection,
  LaneCount,
  LevelNote,
  MusicalSectionType,
  OfficialEnvironmentTheme,
  QualityLevel,
  SongPalette,
} from '../../types/game';

export const HIT_LINE_Z = 1.6;
export const SPAWN_Z = -48;
export const DESPAWN_Z = 4.5;

export interface TrackLayout {
  laneCount: LaneCount;
  laneStep: number;
  roadWidth: number;
  noteScaleX: number;
  laneX: number[];
}

export function computeTrackLayout(laneCount: LaneCount): TrackLayout {
  const stepMap: Record<LaneCount, number> = {
    4: 1.5,
    5: 1.38,
    6: 1.28,
    7: 1.2,
    8: 1.12,
  };
  const laneStep = stepMap[laneCount] ?? 1.5;
  const roadWidth = laneCount * laneStep + 0.35;
  const noteScaleX = laneStep / 1.5;
  const laneX: number[] = [];
  for (let i = 0; i < laneCount; i++) {
    laneX.push((i - (laneCount - 1) / 2) * laneStep);
  }
  return { laneCount, laneStep, roadWidth, noteScaleX, laneX };
}

export interface AudioVisualBands {
  subBass: number;
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  treble: number;
  high: number;
  energy: number;
  kickPulse: number;
  snarePulse: number;
  hihatPulse: number;
  dropFlash: number;
  bassTransient: number;
  sectionType: MusicalSectionType;
  feverActive: boolean;
  isMenu: boolean;
  reactiveEnabled: boolean;
  reducedFlash: boolean;
  glowScale: number;
  bloomScale: number;
  brightnessScale: number;
  sideBrightness: number;
  particleScale: number;
  reflectionQuality: QualityLevel;
  graphicsQuality: QualityLevel;
}

export interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface PooledShockwave {
  active: boolean;
  x: number;
  y: number;
  z: number;
  life: number;
  maxLife: number;
  maxRadius: number;
  color: string;
  secondaryColor: string;
  isFlame: boolean;
}

export interface PooledLanePulse {
  active: boolean;
  lane: number;
  z: number;
  life: number;
  maxLife: number;
  length: number;
  color: string;
}

export interface PooledSurfaceWave {
  active: boolean;
  z: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface PooledChordBeam {
  active: boolean;
  x1: number;
  x2: number;
  z: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface ActiveNoteRenderItem {
  data: LevelNote;
  z: number;
  tailZ: number;
  colorHex: string;
  secondaryHex: string;
  shape: ConcreteNoteShape;
  flickDir?: FlickDirection;
  holdStarted: boolean;
  holdHeldNow: boolean;
  slideActive: boolean;
  opacity: number;
  proximityBoost: number;
}

export interface TrackVisualState {
  layout: TrackLayout;
  palette: SongPalette;
  trackPrimaryHex: string;
  trackSecondaryHex: string;
  trackAccentHex: string;
  trackScroll: number;
  elapsed: number;
  laneFlash: number[];
  laneMissFlash: number[];
  activeHoldLanes: boolean[];
  activeSlideCursor: {
    active: boolean;
    x: number;
    z: number;
    colorHex: string;
  };
  missWaveLife: number;
  missWaveMaxLife: number;
  bands: AudioVisualBands;
  particles: PooledParticle[];
  shockwaves: PooledShockwave[];
  lanePulses: PooledLanePulse[];
  surfaceWaves: PooledSurfaceWave[];
  chordBeams: PooledChordBeam[];
}

export interface ScenarioRenderParams {
  theme: OfficialEnvironmentTheme;
  width: number;
  height: number;
  dpr: number;
  elapsed: number;
  trackScroll: number;
  horizonScreenY: number;
  vanishScreenX: number;
  rollRad: number;
  parallaxX: number;
  parallaxY: number;
  palette: SongPalette;
  bands: AudioVisualBands;
}
