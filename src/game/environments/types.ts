import type * as THREE from 'three';
import type {
  EnvironmentTheme,
  MusicalSectionType,
  QualityLevel,
  SongPalette,
  VisualIntensity,
} from '../../types/game';

export interface WorldAtmosphere {
  backgroundColor: number;
  fogColor: number;
  fogDensity: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  dirLightColor: number;
}

export interface WorldUpdateContext {
  dt: number;
  elapsed: number;
  mode: 'idle' | 'playing' | 'paused' | 'ended';
  bass: number;
  mid: number;
  high: number;
  energy: number;
  subBass?: number;
  lowMid?: number;
  highMid?: number;
  treble?: number;
  sectionType?: MusicalSectionType;
  beatPulse?: number;
  kickPulse?: number;
  snarePulse?: number;
  hihatPulse?: number;
  dropFlash?: number;
  isMenu?: boolean;
  menuAmbientEffects?: boolean;
  chromaticA?: THREE.Color;
  chromaticB?: THREE.Color;
  chromaticAccent?: THREE.Color;
  inSilence: boolean;
  reactiveEnabled: boolean;
  visualIntensity: VisualIntensity;
  particleIntensity: VisualIntensity;
  graphicsQuality: QualityLevel;
  reflectionQuality: QualityLevel;
  brightness: number;
}

export interface WorldBuildOptions {
  seed: string;
  maxAnisotropy: number;
  graphicsQuality: QualityLevel;
  palette: SongPalette;
}

export interface WorldInstance {
  readonly theme: EnvironmentTheme;
  readonly group: THREE.Group;
  readonly atmosphere: WorldAtmosphere;
  setPalette(palette: SongPalette): void;
  update(ctx: WorldUpdateContext): void;
  dispose(): void;
}
