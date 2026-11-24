import type {
  ConcreteNoteShape,
  DifficultyLevel,
  EnvironmentTheme,
  FlickDirection,
  LaneCount,
  MusicalSectionType,
  NoteKind,
  QualityLevel,
  SongPalette,
} from './game';

export type EasingType =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'cubic'
  | 'quintic'
  | 'bounce'
  | 'elastic'
  | 'back';

export type BlendModeType = 'normal' | 'additive' | 'multiply' | 'screen';

export type ObjectCategory = 'gameplay' | 'decoration' | 'effects' | 'control';

export type CreatorObjectType =
  // Gameplay
  | 'note_tap'
  | 'note_hold'
  | 'note_flick'
  | 'note_slide'
  | 'receptor'
  | 'lane_segment'
  | 'hit_zone'
  | 'obstacle'
  | 'platform'
  | 'interactive_orb'
  | 'speed_portal'
  // Decoration
  | 'geom_box'
  | 'geom_triangle'
  | 'geom_cylinder'
  | 'geom_sphere'
  | 'geom_diamond'
  | 'geom_ring'
  | 'panel'
  | 'structure_arch'
  | 'light_beacon'
  | 'particle_prop'
  | 'ambient_element'
  // Effects
  | 'particle_emitter'
  | 'light_source'
  | 'distortion_field'
  | 'screen_fx_node'
  | 'luminous_orb'
  | 'transition_gate'
  // Control
  | 'trigger_node'
  | 'marker_node'
  | 'reference_point'
  | 'group_anchor'
  | 'event_node';

export type TriggerType =
  | 'color'
  | 'alpha'
  | 'pulse'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'toggle'
  | 'spawn'
  | 'camera'
  | 'screen_fx'
  | 'audio'
  | 'logic';

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface CreatorMaterialSpec {
  color: string;
  emissive: string;
  opacity: number; // 0..1
  emission: number; // 0..2.5
  glowIntensity: number; // 0..2
  blendMode: BlendModeType;
  shape: ConcreteNoteShape;
}

export interface CreatorNoteData {
  lane: number;
  kind: NoteKind;
  durationSec: number;
  flickDirection?: FlickDirection;
  slideTargetLane?: number;
  touchZoneX?: number; // -1..1 for freeform touch zone mode
  touchZoneY?: number; // -1..1
  speedMultiplier?: number;
  points?: number;
  damageOnMiss?: number;
  isHazard?: boolean;
}

export interface ColorTriggerParams {
  targetGroupId: number;
  color: string;
  hueShift: number; // -180..180
  saturation: number; // 0..2
  value: number; // 0..2
  brightness: number; // 0.2..2
  opacity: number; // 0..1
  emission: number; // 0..2.5
  glowIntensity: number; // 0..2.5
  blendMode: BlendModeType;
  interpolate: boolean;
  fadeIn: number;
  holdDuration: number;
  fadeOut: number;
  easing: EasingType;
  exclusive: boolean;
  delay: number;
}

export interface AlphaTriggerParams {
  targetGroupId: number;
  startValue: number; // 0..1
  endValue: number; // 0..1
  fadeDuration: number;
  delay: number;
  easing: EasingType;
}

export interface PulseTriggerParams {
  targetGroupId: number;
  pulseColor: string;
  intensity: number; // 0.1..2.5
  fadeIn: number;
  hold: number;
  fadeOut: number;
  frequency: number; // Hz for repeated pulses
  repeatCount: number;
  blendMode: BlendModeType;
  exclusive: boolean;
  syncWithMusic: boolean;
}

export interface MoveTriggerParams {
  targetGroupId: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  relative: boolean;
  duration: number;
  delay: number;
  easing: EasingType;
  repeat: number;
  reverse: boolean;
  loop: boolean;
  followTargetId?: string;
  axisLock: 'none' | 'x' | 'y' | 'z' | 'xy' | 'xz';
}

export interface RotateTriggerParams {
  targetGroupId: number;
  rotX: number; // degrees
  rotY: number;
  rotZ: number;
  rotationCenter: Vec3Tuple;
  duration: number;
  delay: number;
  easing: EasingType;
  repeat: number;
  continuous: boolean;
  lockRotation: boolean;
}

export interface ScaleTriggerParams {
  targetGroupId: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  uniformScale: boolean;
  duration: number;
  delay: number;
  easing: EasingType;
  repeat: number;
  restoreOriginal: boolean;
}

export interface ToggleTriggerParams {
  targetGroupId: number;
  activate: boolean;
  collisionEnabled: boolean;
  renderingEnabled: boolean;
  immediate: boolean;
  delay: number;
}

export interface SpawnTriggerParams {
  targetEventId: string;
  delay: number;
  repeat: number;
  triggerOnce: boolean;
  previewDisabled: boolean;
  conditionVar?: string;
  conditionMinValue?: number;
}

export interface CameraTriggerParams {
  action: 'zoom' | 'offset' | 'rotate' | 'follow' | 'shake' | 'target' | 'lock' | 'reset';
  zoomFovDelta: number; // -25..+30
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  rotZ: number; // degrees tilt
  shakeIntensity: number; // 0..1.5
  followGroupId?: number;
  targetObjectId?: string;
  lockCamera: boolean;
  duration: number;
  delay: number;
  easing: EasingType;
}

export type ScreenEffectKind =
  | 'bloom'
  | 'chromaticAberration'
  | 'vignette'
  | 'motionBlur'
  | 'distortion'
  | 'colorGrading'
  | 'exposure'
  | 'screenFlash'
  | 'screenShake'
  | 'blur'
  | 'pixelation';

export interface ScreenFxTriggerParams {
  effect: ScreenEffectKind;
  intensity: number; // 0..1.5
  duration: number;
  fadeIn: number;
  fadeOut: number;
  color: string;
  minQuality: QualityLevel;
  delay: number;
}

export type AudioTriggerEventKind =
  | 'beat'
  | 'onset'
  | 'kick'
  | 'snare'
  | 'bass'
  | 'drop'
  | 'section'
  | 'time'
  | 'bpm';

export interface AudioTriggerParams {
  eventKind: AudioTriggerEventKind;
  threshold: number; // 0..1
  minBpm?: number;
  sectionTarget?: MusicalSectionType;
  targetGroupId: number;
  spawnEventId: string;
  cooldownSec: number;
}

export type LogicOpKind =
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'COMPARE'
  | 'COUNTER'
  | 'RANDOM'
  | 'TIMER'
  | 'EVENT_RECEIVED'
  | 'TRIGGER_ONCE';

export interface LogicTriggerParams {
  op: LogicOpKind;
  variableA: string;
  variableB?: string;
  compareOp: '==' | '!=' | '>' | '>=' | '<' | '<=';
  compareValue: number;
  incrementBy: number;
  randomChance: number; // 0..1
  timerIntervalSec: number;
  eventName: string;
  outputTrueEventId: string;
  outputFalseEventId?: string;
  targetGroupId?: number;
}

export type TriggerConfigPayload =
  | { type: 'color'; params: ColorTriggerParams }
  | { type: 'alpha'; params: AlphaTriggerParams }
  | { type: 'pulse'; params: PulseTriggerParams }
  | { type: 'move'; params: MoveTriggerParams }
  | { type: 'rotate'; params: RotateTriggerParams }
  | { type: 'scale'; params: ScaleTriggerParams }
  | { type: 'toggle'; params: ToggleTriggerParams }
  | { type: 'spawn'; params: SpawnTriggerParams }
  | { type: 'camera'; params: CameraTriggerParams }
  | { type: 'screen_fx'; params: ScreenFxTriggerParams }
  | { type: 'audio'; params: AudioTriggerParams }
  | { type: 'logic'; params: LogicTriggerParams };

export interface CreatorObject {
  id: string;
  name: string;
  type: CreatorObjectType;
  category: ObjectCategory;
  timeSec: number; // Longitudinal song timeline time in seconds
  lane: number; // Optional lane anchor (-1 = free spatial X)
  position: Vec3Tuple;
  rotation: Vec3Tuple; // degrees
  scale: Vec3Tuple;
  layer: number; // 0..7
  locked: boolean;
  hidden: boolean;
  collisionEnabled: boolean;
  groupIds: number[];
  eventId?: string; // Optional trigger receiver / spawn ID
  material: CreatorMaterialSpec;
  noteData?: CreatorNoteData;
  trigger?: TriggerConfigPayload;
}

export interface CreatorGroup {
  id: number; // Stable numeric Group ID (1..9999)
  name: string;
  color: string;
  locked: boolean;
  visible: boolean;
  active: boolean;
}

export interface TimelineKeyframe {
  id: string;
  track: 'notes' | 'triggers' | 'animation' | 'camera' | 'effects';
  timeSec: number;
  durationSec: number;
  targetGroupId?: number;
  targetObjectId?: string;
  property: 'posX' | 'posY' | 'posZ' | 'rotY' | 'rotZ' | 'scale' | 'color' | 'opacity' | 'glow';
  fromValue: number | string;
  toValue: number | string;
  easing: EasingType;
}

export interface TimelineMarker {
  id: string;
  timeSec: number;
  label: string;
  color: string;
  kind: 'section' | 'bookmark' | 'drop' | 'playtest';
}

export type CustomGameplayMode =
  | 'classic_lanes'
  | 'two_thumb'
  | 'touch_zones'
  | 'precision_timing'
  | 'timed_survival'
  | 'sequence_memory'
  | 'experimental';

export interface CustomGameplayRules {
  mode: CustomGameplayMode;
  laneCount: LaneCount;
  twoThumbMode: boolean;
  approachSpeed: number; // 0.6..2.2
  hitWindowMs: number; // 45..220
  maxMisses: number; // 1..999
  enableObstacles: boolean;
  enableTouchZones: boolean;
  enableFever: boolean;
  scorePerHit: number;
  survivalTimeGoalSec: number;
  inputMapping: {
    allowKeyboard: boolean;
    allowTouch: boolean;
    allowMultiTouchZones: boolean;
  };
}

export interface LevelCameraSettings {
  baseFov: number;
  baseHeight: number;
  baseDistance: number;
  followPlayer: boolean;
  allowCameraTriggers: boolean;
}

export interface LevelEffectsSettings {
  bloomEnabled: boolean;
  bloomIntensity: number;
  chromaticStrength: number;
  reactiveLightingEnabled: boolean;
  kickIntensity: number;
  snareFlash: number;
  hihatSparkle: number;
  attackMs: number;
  releaseMs: number;
}

export type RightsAuthorizationType =
  | 'original_author'
  | 'distribution_license'
  | 'rights_holder_permission'
  | 'public_domain'
  | 'authorized_remix_cover'
  | 'verifiable_authorization';

export interface AudioRightsDeclaration {
  authorizationType: RightsAuthorizationType;
  licenseName: string; // e.g. CC-BY 4.0, CC0, Original XanderAI License
  rightsHolder: string;
  sourceUrl?: string;
  attributionText?: string;
  allowRemixAndLevelUse: boolean;
  verifiedAt?: number;
}

export interface LevelAudioMetadata {
  songId?: string;
  title: string;
  artist: string;
  durationSec: number;
  bpm: number;
  offsetMs: number;
  palette: SongPalette;
  rights: AudioRightsDeclaration;
}

export interface BeatflowLevelDocument {
  schemaVersion: number; // Current = 2
  levelId: string;
  authorId: string;
  authorName: string;
  levelName: string;
  description: string;
  difficulty: DifficultyLevel;
  creationDate: string;
  updatedDate: string;
  version: number;
  requiredGameVersion: string;
  assetReferences: string[];
  environmentTheme: EnvironmentTheme;
  audio: LevelAudioMetadata;
  gameplayRules: CustomGameplayRules;
  camera: LevelCameraSettings;
  effects: LevelEffectsSettings;
  groups: CreatorGroup[];
  objects: CreatorObject[];
  timelineKeyframes: TimelineKeyframe[];
  markers: TimelineMarker[];
  variables: Record<string, number>;
}

export interface CommunityMusicTrack {
  id: string;
  title: string;
  artist: string;
  genre: string;
  durationSec: number;
  bpm: number;
  palette: SongPalette;
  rights: AudioRightsDeclaration;
  favorites: number;
  plays: number;
  downloads: number;
  moderationStatus: 'approved' | 'under_review' | 'removed';
  reportCount: number;
  sampleSynthPreset: 'cyber_pulse' | 'sunset_chill' | 'synthwave_drive' | 'cosmic_arp';
  isBuiltin: boolean;
  uploadedAt: string;
}

export interface CommunityComment {
  id: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface CommunityLevelEntry {
  id: string;
  level: BeatflowLevelDocument;
  creatorName: string;
  difficulty: DifficultyLevel;
  ratingAvg: number;
  ratingCount: number;
  plays: number;
  downloads: number;
  favorites: number;
  comments: CommunityComment[];
  reportCount: number;
  moderationStatus: 'approved' | 'under_review' | 'removed';
  publishedAt: string;
}

export interface ModerationReport {
  id: string;
  targetType: 'music' | 'level';
  targetId: string;
  reason: 'copyright' | 'unauthorized_newgrounds' | 'inappropriate' | 'broken_level';
  details: string;
  reportedAt: string;
}
