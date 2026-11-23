export type DifficultyLevel = 'easy' | 'normal' | 'hard' | 'expert' | 'master' | 'custom';

export type LaneCount = 4 | 5 | 6 | 7 | 8;

export type NoteKind = 'tap' | 'hold' | 'flick' | 'slide';

export type FlickDirection = 'left' | 'right' | 'up';

export type HitJudgment = 'perfect' | 'good' | 'ok' | 'miss';

export type NoteShape =
  | 'auto'
  | 'tile'
  | 'square'
  | 'sphere'
  | 'disc'
  | 'hexagon'
  | 'diamond'
  | 'prism'
  | 'ring';

export type ConcreteNoteShape = Exclude<NoteShape, 'auto'>;

export type QualityLevel = 'low' | 'medium' | 'high';

export type VisualIntensity = 'low' | 'medium' | 'high';

export type EnvironmentTheme =
  | 'cyberpunk'
  | 'tropical'
  | 'ocean'
  | 'mountain'
  | 'newyork'
  | 'cosmic';

export type EnvironmentPreference = 'auto' | 'random' | EnvironmentTheme;

export type AudiovisualPresetId =
  | 'auto'
  | 'neon_city'
  | 'cyberpunk'
  | 'cosmic'
  | 'ocean'
  | 'sunset'
  | 'electronic'
  | 'dreamscape'
  | 'minimal_neon';

export type ScreenRoute = 'menu' | 'music' | 'records' | 'settings' | 'playing';

export interface MechanicFrequencyConfig {
  enabled: boolean;
  /** Frequency multiplier (0.2 = rare, 1.0 = standard, 1.6 = frequent) */
  frequency: number;
}

export interface MechanicsConfig {
  holdNotes: MechanicFrequencyConfig;
  doubleNotes: {
    enabled: boolean;
    frequency: number;
    maxSimultaneous: 2 | 3 | 4;
  };
  streams: MechanicFrequencyConfig;
  trills: MechanicFrequencyConfig;
  flickNotes: MechanicFrequencyConfig;
  slideNotes: MechanicFrequencyConfig;
  feverMode: {
    enabled: boolean;
    /** Multiplier boost during Fever (2.0..3.0) */
    multiplierBoost: number;
    durationSec: number;
  };
  perfectChain: {
    enabled: boolean;
    milestoneStep: number;
  };
  rhythmBurst: MechanicFrequencyConfig;
  precisionChallenge: {
    enabled: boolean;
    /** Window compression during intense sections (0.65..0.9) */
    strictness: number;
  };
  dynamicSections: boolean;
  earlyReleasePenalty: 'proportional' | 'miss';
  slideTolerance: number; // 0.65..1.4
}

export interface CameraEffectToggle {
  enabled: boolean;
  intensity: number; // 0..1.5
}

export interface CameraConfig {
  enabled: boolean;
  staticView: boolean;
  overallIntensity: number; // 0..1.5
  dynamicZoom: CameraEffectToggle;
  pullBack: CameraEffectToggle;
  horizontalOffset: CameraEffectToggle;
  verticalOffset: CameraEffectToggle;
  tilt: CameraEffectToggle;
  cameraShake: CameraEffectToggle;
  smoothTransitions: boolean;
  reducedMotion: boolean;
}

export interface VisualsConfig {
  preset: AudiovisualPresetId;
  useCustomColors: boolean;
  customPalette: SongPalette;
  bloomIntensity: number; // 0.2..1.5
  glowIntensity: number; // 0.3..1.5
  sceneBrightness: number; // 0.6..1.35
  sideBrightness: number; // 0.35..1.3
  particleIntensityValue: number; // 0.2..1.5
  flashIntensity: number; // 0..1.2
  screenEffects: boolean;
  reducedFlash: boolean;
}

export interface AudioReactionConfig {
  frequencySensitivity: number; // 0.5..1.8
  reactionIntensity: number; // 0.3..1.6
  bpmDetectionEnabled: boolean;
  beatDetectionEnabled: boolean;
  subBassWeight: number; // 0..1.6
  bassWeight: number; // 0..1.6
  midWeight: number; // 0..1.6
  highMidWeight: number; // 0..1.6
  trebleWeight: number; // 0..1.6
}

export type MenuAmbientPreset =
  | 'cyberpunk_ambient'
  | 'synthwave'
  | 'electronic_chill'
  | 'cinematic_futuristic'
  | 'deep_space'
  | 'ambient_electronic';

export type MenuAmbientSourceMode = 'preset' | 'custom';

export interface MenuAmbientConfig {
  musicEnabled: boolean;
  musicVolume: number; // 0..1
  preset: MenuAmbientPreset;
  sourceMode: MenuAmbientSourceMode;
  customTrackName?: string;
  customLoop: boolean;
  customPaused: boolean;
  ambientEffectsEnabled: boolean;
  menuAnimationsEnabled: boolean;
  visualIntensity: VisualIntensity;
}

export interface PerformanceConfig {
  performanceMode: 'auto' | 'quality' | 'balanced' | 'battery';
  effectFrequency: QualityLevel;
  lightingQuality: QualityLevel;
}

export type MusicalFocus = 'balanced' | 'melody_vocal' | 'rhythm_bass' | 'harmonic';

export interface GenerationConfig {
  difficulty: DifficultyLevel;
  laneCount: LaneCount;
  /** Maximum allowed misses before Game Over (default 3, 999 = no fail) */
  maxMisses: number;
  /** Multiplier for note density (0.4 = sparse, 1.0 = standard, 1.6 = dense) */
  noteDensity: number;
  /** Approach speed multiplier (0.7 = relaxed, 1.0 = standard, 1.8 = fast) */
  approachSpeed: number;
  /** How much procedural variation between runs (0 = strict beats, 1 = high variety) */
  proceduralVariation: number;
  /** Pattern complexity: staircases, crossovers, chords (0..1) */
  patternComplexity: number;
  /** Acceptance window in milliseconds (+/- around exact beat) */
  hitWindowMs: number;
  /** Randomness weight for lane/rhythm picks (0..1) */
  randomness: number;
  /** Musical layer priority focus */
  musicalFocus?: MusicalFocus;
  /** Seed string for deterministic level reproduction */
  seed: string;
  mechanics: MechanicsConfig;
}

export interface GameSettings {
  musicVolume: number; // 0..1
  ambientVolume: number; // 0..1
  impactVolume: number; // 0..1
  uiVolume: number; // 0..1
  uiSoundsEnabled: boolean;
  sfxVolume: number; // legacy compatibility (mirrors ambient/impact)
  brightness: number; // 0.6..1.35
  visualIntensity: VisualIntensity;
  particleIntensity: VisualIntensity;
  graphicsQuality: QualityLevel;
  reflectionQuality: QualityLevel;
  reactiveVisuals: boolean;
  touchSensitivity: number; // 0.7..1.4
  audioOffsetMs: number; // -150..+150 ms latency calibration
  defaultDifficulty: DifficultyLevel;
  noteShape: NoteShape;
  environmentMode: EnvironmentPreference;
  vibration: boolean;
  generationConfig: GenerationConfig;
  cameraConfig: CameraConfig;
  visualsConfig: VisualsConfig;
  audioReactionConfig: AudioReactionConfig;
  performanceConfig: PerformanceConfig;
  menuAmbientConfig: MenuAmbientConfig;
}

export type SpectralBand6 =
  | 'sub_bass'
  | 'bass'
  | 'low_mid'
  | 'mid'
  | 'high_mid'
  | 'treble'
  | 'full';

export interface OnsetEvent {
  time: number; // seconds
  strength: number; // normalized 0..1
  band: 'bass' | 'mid' | 'high' | 'full';
  /** Fine 6-band spectral classification */
  band6?: SpectralBand6;
  /** Origin layer before fusion */
  layer?: 'percussive_low' | 'percussive_mid' | 'percussive_high' | 'harmonic' | 'bassline';
  /** Fine musical role estimated via HPSS + salience */
  role?: MusicalRole;
  /** Estimated sustained duration (seconds) for vocal/melodic/harmonic notes */
  duration?: number;
}

export interface EnergyFrame {
  time: number;
  bass: number; // 0..1
  mid: number; // 0..1
  high: number; // 0..1
  total: number; // 0..1
  subBass?: number;
  lowMid?: number;
  highMid?: number;
  treble?: number;
  rms?: number;
  centroid?: number; // 0..1
  bandwidth?: number; // 0..1
  rolloff?: number; // 0..1
  flux?: number; // 0..1
  harmonicStrength?: number; // 0..1
  harmonicChange?: number; // 0..1
  vocalPresence?: number; // 0..1 (indirect DSP formant/tonal estimate)
  percussiveRatio?: number; // 0..1
  harmonicFlux?: number; // 0..1 (STFT-HPSS separated harmonic onset flux)
  percussiveFlux?: number; // 0..1 (STFT-HPSS separated percussive onset flux)
  pitchSalience?: number; // 0..1 (harmonic comb pitch clarity)
  basslineActivity?: number; // 0..1 (sustained low-frequency harmonic activity)
}

export interface SilenceRange {
  start: number;
  end: number;
}

export interface TempoSegment {
  start: number;
  end: number;
  bpm: number;
  confidence: number; // 0..1
  feel: 'normal' | 'half_time' | 'double_time';
}

export interface SubdivisionBeat {
  time: number;
  division: 2 | 3 | 4;
  strength: number;
}

export type MusicalSectionType =
  | 'calm'
  | 'groove'
  | 'buildup'
  | 'drop'
  | 'chorus'
  | 'breakdown'
  | 'silence';

export interface MusicalSection {
  start: number;
  end: number;
  type: MusicalSectionType;
  energy: number; // 0..1
  rhythmicDensity: number; // 0..1
  harmonicActivity: number; // 0..1
}

export type MusicalEventType =
  | 'beat'
  | 'percussion'
  | 'melodic'
  | 'harmonic'
  | 'vocal_phrase'
  | 'drop'
  | 'subdivision';

export type MusicalRole =
  | 'kick'
  | 'snare'
  | 'hihat'
  | 'bassline'
  | 'vocal'
  | 'melody'
  | 'harmony'
  | 'synth_seq'
  | 'drop'
  | 'beat';

export interface MusicalEvent {
  time: number;
  type: MusicalEventType;
  role?: MusicalRole;
  confidence: number; // 0..1
  intensity: number; // 0..1
  relevance: number; // 0..1 (weighted multi-layer fusion score)
  band: SpectralBand6;
  beatAlignment: number; // 0..1
  duration?: number;
  pitchClass?: number; // 0..11 dominant chroma bin
  spectralCentroid?: number; // 0..1
  harmonicIntensity?: number; // 0..1
  percussiveIntensity?: number; // 0..1
  pitchConfidence?: number; // 0..1
  melodicStep?: number; // signed semitone contour delta (-6..+6)
}

export interface FusionWeights {
  beat: number;
  percussion: number;
  melodic: number;
  harmonic: number;
  vocal: number;
  drop: number;
}

export interface MusicProfile {
  analysisVersion?: number;
  bpm: number;
  tempoConfidence?: number; // 0..1
  timeSignature?: '4/4' | '3/4' | '6/8' | 'irregular';
  duration: number;
  beats: number[];
  subdivisions?: SubdivisionBeat[];
  tempoSegments?: TempoSegment[];
  onsets: OnsetEvent[];
  fusedEvents?: MusicalEvent[];
  sections?: MusicalSection[];
  drops?: number[];
  crescendos?: Array<{ start: number; end: number; slope: number }>;
  energyTimeline: EnergyFrame[];
  silenceRanges: SilenceRange[];
  averageEnergy: number;
  dynamicRangeDb?: number;
  rhythmicComplexity?: number; // 0..1
  analyzedAt: number;
}

export interface SongPalette {
  primary: string;
  secondary: string;
  accent: string;
}

export interface SongMetadata {
  id: string;
  title: string;
  artist: string;
  album: string;
  fileName: string;
  fileSize: number;
  duration: number;
  coverArtDataUrl?: string;
  palette: SongPalette;
  addedAt: number;
  lastPlayedAt?: number;
  isFavorite: boolean;
  profile?: MusicProfile;
}

export interface SlideWaypoint {
  timeOffset: number; // seconds after note.time
  lane: number;
}

export interface LevelNote {
  id: number;
  time: number; // seconds from song start
  lane: number; // 0 .. laneCount - 1
  kind: NoteKind;
  durationSec?: number; // for hold & slide notes
  flickDir?: FlickDirection; // for flick notes
  slidePath?: SlideWaypoint[]; // for slide notes (includes start {0, lane} ... {durationSec, endLane})
  intensity: number; // 0..1
  isChord?: boolean;
  chordGroupSize?: number;
  patternTag?: 'stream' | 'trill' | 'burst' | 'chord' | 'normal';
  sectionType?: MusicalSectionType;
  challengeSection?: boolean;
  eventType?: MusicalEventType;
  pitchClass?: number;
  hit: boolean;
  missed: boolean;
}

export interface GeneratedLevel {
  seed: string;
  difficulty: DifficultyLevel;
  laneCount: LaneCount;
  maxMisses: number;
  bpm: number;
  notes: LevelNote[];
  noteSpeed: number; // world units per second
  hitWindowSec: number;
  precisionStrictness: number;
  stats: {
    totalNotes: number;
    chordsCount: number;
    holdsCount: number;
    flicksCount: number;
    slidesCount: number;
    streamsCount: number;
    trillsCount: number;
    burstsCount: number;
    challengeNotesCount: number;
    averageNps: number;
  };
}

export interface SongRecordVariant {
  variantKey: string;
  difficulty: DifficultyLevel;
  laneCount: LaneCount;
  modifierLabel: string;
  bestScore: number;
  bestCombo: number;
  bestAccuracy: number;
  bestMaxPerfectChain: number;
  playCount: number;
  completions: number;
  lastPlayedAt: number;
  bestSeed?: string;
}

export interface SongStats {
  songId: string;
  title: string;
  artist: string;
  coverArtDataUrl?: string;
  bestScore: number;
  bestCombo: number;
  bestAccuracy: number;
  bestMaxPerfectChain?: number;
  playCount: number;
  completions: number;
  lastPlayedAt: number;
  bestSeed?: string;
  variants?: Record<string, SongRecordVariant>;
}

export interface GameplayBreakdown {
  perfectCount: number;
  goodCount: number;
  okCount: number;
  holdsCompleted: number;
  holdsBroken: number;
  chordsHit: number;
  flicksHit: number;
  slidesCompleted: number;
  maxPerfectChain: number;
  feverActivations: number;
  avgMultiplier: number;
}

export interface GameResult {
  song: SongMetadata;
  score: number;
  maxCombo: number;
  hits: number;
  misses: number;
  totalNotesSpawned: number;
  totalNotesInLevel: number;
  accuracy: number;
  durationPlayed: number;
  completed: boolean;
  isNewRecord: boolean;
  isNewVariantRecord?: boolean;
  previousBest: number;
  seed: string;
  difficulty: DifficultyLevel;
  laneCount: LaneCount;
  maxMisses: number;
  modifierLabel: string;
  stars: number; // 0..3
  breakdown: GameplayBreakdown;
}

export interface ScreenPulseState {
  color: string;
  edgeAlpha: number;
  feverAlpha: number;
  dropRingPulse: number;
}

export interface LiveGameplayStats {
  score: number;
  combo: number;
  maxCombo: number;
  hits: number;
  misses: number;
  maxMisses: number;
  accuracy: number;
  currentTime: number;
  duration: number;
  laneCount: LaneCount;
  perfectCount: number;
  goodCount: number;
  okCount: number;
  perfectChain: number;
  maxPerfectChain: number;
  feverActive: boolean;
  feverCharge: number; // 0..1
  feverRemainingSec: number;
  feverDurationSec: number;
  feverMultiplier: number;
  feverActivations: number;
  currentMultiplier: number;
  precisionChallengeActive: boolean;
  currentSection: MusicalSectionType;
  lastJudgment: {
    judgment: HitJudgment;
    lane: number;
    points: number;
    label: string;
    id: number;
  } | null;
  screenPulse: ScreenPulseState;
}
