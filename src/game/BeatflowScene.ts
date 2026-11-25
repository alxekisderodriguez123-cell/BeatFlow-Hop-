import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ChromaticEngine } from '../services/chromaticEngine';
import type {
  ConcreteNoteShape,
  EnvironmentTheme,
  FlickDirection,
  GameplayBreakdown,
  GameSettings,
  GeneratedLevel,
  HitJudgment,
  LaneCount,
  LevelNote,
  MusicalSectionType,
  MusicProfile,
  NoteShape,
  QualityLevel,
  ScreenPulseState,
  SongPalette,
} from '../types/game';
import { audioEngine } from '../services/audioEngine';
import { menuAmbientAudio } from '../services/menuAmbientAudio';
import { CameraRig } from './CameraRig';
import { EnvironmentManager } from './environments/EnvironmentManager';
import {
  getPresetById,
  resolveEffectiveEnvironment,
  resolveEffectivePalette,
  resolveNoteShape,
} from './presets';
import type { WorldAtmosphere } from './environments/types';
import {
  createFlameTrailTexture,
  createTileInnerRingTexture,
} from './environments/sharedTextures';
import { resolveNoteColor } from './noteColorPalette';
import { MusicReactiveLighting } from './MusicReactiveLighting';
import { casillaShapeToConcreteShape } from '../creator/ObjectLibrary';

export const HIT_LINE_Z = 1.6;
export const SPAWN_Z = -48;
export const DESPAWN_Z = 4.5;

const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _tmpColor = new THREE.Color();
const _customColorA = new THREE.Color();
const _customColorB = new THREE.Color();
const _missColor = new THREE.Color(0xef4444);
const _slideCompleteColor = new THREE.Color(0x34d399);
const _victoryGoldColor = new THREE.Color(0xfbbf24);
const _feverColorA = new THREE.Color('#fbbf24');
const _feverColorB = new THREE.Color('#ec4899');
const _burstColor = new THREE.Color('#38bdf8');

interface TrackLayout {
  laneCount: LaneCount;
  laneStep: number;
  roadWidth: number;
  noteScaleX: number;
  laneX: number[];
}

function computeTrackLayout(laneCount: LaneCount): TrackLayout {
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

interface PooledNoteSlot {
  active: boolean;
  noteId: number;
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  trimMesh: THREE.Mesh;
  topRingMesh: THREE.Mesh;
  reflectionMesh: THREE.Mesh;
  trailMesh: THREE.Mesh;
  holdTailMesh: THREE.Mesh;
  holdCapMesh: THREE.Mesh;
  flickArrowMesh: THREE.Mesh;
  slideSeg1Mesh: THREE.Mesh;
  slideSeg2Mesh: THREE.Mesh;
  slideEndMesh: THREE.Mesh;
}

interface ActiveHoldState {
  note: LevelNote;
  startTime: number;
  endTime: number;
  lastTickTime: number;
  pointsAccumulated: number;
}

interface ActiveSlideState {
  note: LevelNote;
  startTime: number;
  endTime: number;
  lastTickTime: number;
  offPathSec: number;
  lastPlayedLane: number;
}

interface BurstParticle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

interface LanePulseSlot {
  active: boolean;
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  lane: number;
  z: number;
  speedZ: number;
  life: number;
  maxLife: number;
  maxOpacity: number;
}

interface SurfaceWaveSlot {
  active: boolean;
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  z: number;
  speedZ: number;
  life: number;
  maxLife: number;
  maxOpacity: number;
}

interface ShockwaveSlot {
  active: boolean;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  flare: THREE.Mesh;
  flareMat: THREE.MeshBasicMaterial;
  flame: THREE.Mesh;
  flameMat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  expandScale: number;
  flarePeak: number;
}

interface ChordBeamSlot {
  active: boolean;
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

export interface GameplaySnapshot {
  currentTime: number;
  duration: number;
  score: number;
  combo: number;
  maxCombo: number;
  hits: number;
  misses: number;
  maxMisses: number;
  perfectCount: number;
  goodCount: number;
  okCount: number;
  perfectChain: number;
  maxPerfectChain: number;
  feverActive: boolean;
  feverCharge: number;
  feverRemainingSec: number;
  feverDurationSec: number;
  feverMultiplier: number;
  feverActivations: number;
  currentMultiplier: number;
  precisionChallengeActive: boolean;
  currentSection: MusicalSectionType;
  screenPulse: ScreenPulseState;
}

export interface GameplayCallbacks {
  onJudgment: (
    note: LevelNote,
    judgment: HitJudgment,
    combo: number,
    scoreDelta: number,
    label: string,
  ) => void;
  onMiss: (note: LevelNote, missesTotal: number, reasonLabel?: string) => void;
  onDefeat: () => void;
  onProgress: (snapshot: GameplaySnapshot) => void;
}

function createCircuitTrackTextures(): {
  albedo: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  const size = 1024;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const ctx = albedoCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, size, 0);
  bg.addColorStop(0, '#120b2e');
  bg.addColorStop(0.24, '#1b1347');
  bg.addColorStop(0.5, '#221859');
  bg.addColorStop(0.76, '#1b1347');
  bg.addColorStop(1, '#120b2e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  rCtx.fillStyle = '#585858';
  rCtx.fillRect(0, 0, size, size);

  const laneCenters = [128, 384, 640, 896];
  laneCenters.forEach((cx, idx) => {
    const laneGrad = ctx.createLinearGradient(cx - 116, 0, cx + 116, 0);
    const col = idx % 2 === 0 ? 'rgba(56, 189, 248, 0.08)' : 'rgba(232, 121, 249, 0.075)';
    laneGrad.addColorStop(0, 'rgba(0,0,0,0)');
    laneGrad.addColorStop(0.5, col);
    laneGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = laneGrad;
    ctx.fillRect(cx - 116, 0, 232, size);

    rCtx.fillStyle = '#767676';
    rCtx.fillRect(cx - 116, 0, 6, size);
    rCtx.fillRect(cx + 110, 0, 6, size);

    ctx.strokeStyle = idx % 2 === 0 ? 'rgba(56, 189, 248, 0.13)' : 'rgba(244, 114, 182, 0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 48, 0);
    ctx.lineTo(cx - 48, size * 0.35);
    ctx.lineTo(cx - 28, size * 0.42);
    ctx.lineTo(cx - 28, size * 0.85);
    ctx.lineTo(cx - 48, size * 0.92);
    ctx.lineTo(cx - 48, size);
    ctx.stroke();
  });

  // Crisp subtle center perspective guide streak
  ctx.fillStyle = 'rgba(192, 132, 252, 0.065)';
  ctx.fillRect(size * 0.5 - 6, 0, 12, size);

  for (let y = 0; y < size; y += 128) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  const albedo = new THREE.CanvasTexture(albedoCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = THREE.RepeatWrapping;
  albedo.wrapT = THREE.RepeatWrapping;
  albedo.repeat.set(1, 9);

  const roughness = new THREE.CanvasTexture(roughCanvas);
  roughness.wrapS = THREE.RepeatWrapping;
  roughness.wrapT = THREE.RepeatWrapping;
  roughness.repeat.set(1, 9);

  return { albedo, roughness };
}

function createNoteReflectionTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
  grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.32)');
  grad.addColorStop(0.78, 'rgba(255, 255, 255, 0.08)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createLongitudinalPulseTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const vGrad = ctx.createLinearGradient(0, 0, 0, 128);
  vGrad.addColorStop(0, 'rgba(255,255,255,0)');
  vGrad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  vGrad.addColorStop(0.5, 'rgba(255,255,255,0.95)');
  vGrad.addColorStop(0.65, 'rgba(255,255,255,0.55)');
  vGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, 64, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function getRelativeLuminance(col: THREE.Color): number {
  return 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
}

function getContrastRatioAgainstTrack(col: THREE.Color): number {
  const trackLum = 0.012;
  const noteLum = getRelativeLuminance(col);
  return (Math.max(noteLum, trackLum) + 0.05) / (Math.min(noteLum, trackLum) + 0.05);
}

function resolveReadableNoteColors(palette: SongPalette): {
  notePrimary: THREE.Color;
  noteSecondary: THREE.Color;
  noteAccent: THREE.Color;
  trackPrimary: THREE.Color;
  trackSecondary: THREE.Color;
  trackAccent: THREE.Color;
} {
  const trackPrimary = new THREE.Color(palette.primary);
  const trackSecondary = new THREE.Color(palette.secondary);
  const trackAccent = new THREE.Color(palette.accent);

  const tpHsl = { h: 0, s: 0, l: 0 };
  trackPrimary.getHSL(tpHsl);
  trackPrimary.setHSL(
    tpHsl.h,
    Math.min(0.95, Math.max(0.55, tpHsl.s)),
    Math.min(0.56, Math.max(0.36, tpHsl.l)),
  );

  const tsHsl = { h: 0, s: 0, l: 0 };
  trackSecondary.getHSL(tsHsl);
  trackSecondary.setHSL(
    tsHsl.h,
    Math.min(0.95, Math.max(0.55, tsHsl.s)),
    Math.min(0.56, Math.max(0.36, tsHsl.l)),
  );

  const notePrimary = new THREE.Color(palette.primary);
  const pHsl = { h: 0, s: 0, l: 0 };
  notePrimary.getHSL(pHsl);
  if ((pHsl.h > 0.59 && pHsl.h < 0.72 && pHsl.l < 0.54) || pHsl.s < 0.35) {
    notePrimary.set('#06d6f2');
  } else {
    notePrimary.setHSL(
      pHsl.h,
      THREE.MathUtils.clamp(pHsl.s, 0.86, 1.0),
      THREE.MathUtils.clamp(pHsl.l, 0.5, 0.62),
    );
  }
  if (getContrastRatioAgainstTrack(notePrimary) < 5.0) {
    notePrimary.set('#06d6f2');
  }

  const noteSecondary = new THREE.Color(palette.secondary);
  const sHsl = { h: 0, s: 0, l: 0 };
  noteSecondary.getHSL(sHsl);
  if ((sHsl.h > 0.59 && sHsl.h < 0.72 && sHsl.l < 0.54) || sHsl.s < 0.35) {
    noteSecondary.set('#f43f8e');
  } else {
    noteSecondary.setHSL(
      sHsl.h,
      THREE.MathUtils.clamp(sHsl.s, 0.86, 1.0),
      THREE.MathUtils.clamp(sHsl.l, 0.52, 0.63),
    );
  }
  if (getContrastRatioAgainstTrack(noteSecondary) < 4.8) {
    noteSecondary.set('#f43f8e');
  }

  const pFinal = { h: 0, s: 0, l: 0 };
  const sFinal = { h: 0, s: 0, l: 0 };
  notePrimary.getHSL(pFinal);
  noteSecondary.getHSL(sFinal);
  const rawHueDiff = Math.abs(pFinal.h - sFinal.h);
  const hueDist = Math.min(rawHueDiff, 1 - rawHueDiff);
  if (hueDist < 0.14) {
    const isWarm = pFinal.h > 0.78 || pFinal.h < 0.08;
    noteSecondary.set(isWarm ? '#06d6f2' : '#f43f8e');
  }

  const noteAccent = new THREE.Color('#fbbf24'); // Bright amber-gold for flick/slide highlights

  return {
    notePrimary,
    noteSecondary,
    noteAccent,
    trackPrimary,
    trackSecondary,
    trackAccent,
  };
}

export class BeatflowScene {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private scene: THREE.Scene;
  private cameraRig: CameraRig;
  private envManager!: EnvironmentManager;
  private isSoftwareGl: boolean;
  private currentEnvSeed = 'BF-MENU';
  private baseSongPalette: SongPalette = {
    primary: '#22d3ee',
    secondary: '#e879f9',
    accent: '#6366f1',
  };
  private currentPalette: SongPalette = { ...this.baseSongPalette };

  private frameId = 0;
  private disposed = false;
  private clock = new THREE.Clock();

  // Configurable Track
  private trackLayout: TrackLayout = computeTrackLayout(4);
  private trackGroup = new THREE.Group();
  private roadAlbedoTex: THREE.CanvasTexture;
  private roadRoughTex: THREE.CanvasTexture;
  private noteReflectionTex: THREE.CanvasTexture;
  private pulseGradientTex: THREE.CanvasTexture;
  private tileInnerRingTex: THREE.CanvasTexture;
  private flameTrailTex: THREE.CanvasTexture;
  private roadMat!: THREE.MeshStandardMaterial;
  private lanePadMeshes: THREE.Mesh[] = [];
  private lanePadRingMats: THREE.MeshBasicMaterial[] = [];
  private laneStripMeshes: THREE.Mesh[] = [];
  private laneEdgeMats: THREE.MeshBasicMaterial[][] = [];
  private laneFlash: number[] = [0, 0, 0, 0];
  private laneMissFlash: number[] = [0, 0, 0, 0];
  private hitLineMat!: THREE.MeshStandardMaterial;
  private sideRailMats: THREE.MeshStandardMaterial[] = [];
  private dividerMats: THREE.MeshStandardMaterial[] = [];
  private underDeckConduitMats: THREE.MeshBasicMaterial[] = [];
  private railBracketMats: THREE.MeshStandardMaterial[] = [];

  // Advanced pooled track & impact effects
  private shockwavePool: ShockwaveSlot[] = [];
  private lanePulsePool: LanePulseSlot[] = [];
  private surfaceWavePool: SurfaceWaveSlot[] = [];
  private chordBeamPool: ChordBeamSlot[] = [];
  private slideCursorMesh!: THREE.Mesh;
  private slideCursorMat!: THREE.MeshBasicMaterial;
  private missWaveRing!: THREE.Mesh;
  private missWaveLife = 0;

  // Lighting
  private hemiLight!: THREE.HemisphereLight;
  private dirLight!: THREE.DirectionalLight;
  private leftNeonLight!: THREE.PointLight;
  private rightNeonLight!: THREE.PointLight;
  private horizonLight!: THREE.PointLight;
  private baseFogDensity = 0.0115;
  private baseFogColor = new THREE.Color(0x080d26);

  // Palette colors & progressive chromatic scene modulation
  private primaryColor = new THREE.Color('#22d3ee');
  private secondaryColor = new THREE.Color('#e879f9');
  private accentColor = new THREE.Color('#6366f1');
  private notePrimaryColor = new THREE.Color('#06d6f2');
  private noteSecondaryColor = new THREE.Color('#f43f8e');
  private noteAccentColor = new THREE.Color('#fbbf24');
  private chromaticPhase = 0;
  private chromaticEngine = new ChromaticEngine();
  private reactiveLighting = new MusicReactiveLighting();
  private chromaticColA = new THREE.Color('#22d3ee');
  private chromaticColB = new THREE.Color('#e879f9');
  private chromaticColAccent = new THREE.Color('#6366f1');

  // Menu & adaptive performance state
  private isMenuMode = true;
  private menuParallaxX = 0;
  private menuParallaxY = 0;
  private autoPerfLevel: QualityLevel = 'high';
  private perfFrameSamples = 0;
  private perfFrameAccum = 0;
  private lastPerfScaleChangeMs = 0;
  private isMobileGpu = false;
  private suspended = false;
  private isDocumentHidden = false;
  private renderContext: 'menu' | 'gameplay' | 'playtest' | 'paused' = 'menu';
  private loopRunning = false;
  private lastRenderTimeMs = 0;
  private accumulatedMenuDt = 0;
  private pauseRenderDone = false;
  private hasActiveParticles = false;

  // Note pooling
  private currentShape: ConcreteNoteShape = 'tile';
  private notePool: PooledNoteSlot[] = [];
  private noteGeoCache: Record<
    ConcreteNoteShape,
    { core: THREE.BufferGeometry; trim: THREE.BufferGeometry }
  > = {} as Record<ConcreteNoteShape, { core: THREE.BufferGeometry; trim: THREE.BufferGeometry }>;
  private reflectionGeo!: THREE.PlaneGeometry;
  private trailGeo!: THREE.PlaneGeometry;
  private topRingGeo!: THREE.PlaneGeometry;
  private holdTailGeo!: THREE.BoxGeometry;
  private holdCapGeo!: THREE.CylinderGeometry;
  private flickArrowGeo!: THREE.ExtrudeGeometry;
  private slideSegGeo!: THREE.BoxGeometry;
  private slideEndGeo!: THREE.CylinderGeometry;

  // Particle burst pool (bounded & scaled by performance config)
  private particleMesh!: THREE.InstancedMesh;
  private particleMat!: THREE.MeshBasicMaterial;
  private particles: BurstParticle[] = [];
  private readonly MAX_BURST_PARTICLES = 220;

  // Gameplay state
  private mode: 'idle' | 'playing' | 'paused' | 'ended' = 'idle';
  private activeLevel: GeneratedLevel | null = null;
  private activeProfile: MusicProfile | null = null;
  private callbacks: GameplayCallbacks | null = null;
  private settings: GameSettings;

  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private hits = 0;
  private misses = 0;
  private perfectCount = 0;
  private goodCount = 0;
  private okCount = 0;
  private perfectChain = 0;
  private maxPerfectChain = 0;
  private holdsCompleted = 0;
  private holdsBroken = 0;
  private chordsHit = 0;
  private flicksHit = 0;
  private slidesCompleted = 0;
  private multiplierSum = 0;
  private multiplierSamples = 0;
  private nextSearchIdx = 0;
  private nextBeatIdx = 0;
  private nextDropIdx = 0;

  // Hold & Slide live trackers
  private heldLanes: boolean[] = new Array(8).fill(false);
  private activePointerLane: number | null = null;
  private activeHolds = new Map<number, ActiveHoldState>();
  private activeSlides = new Map<number, ActiveSlideState>();
  private chordHitTracker = new Map<number, { count: number; minLane: number; maxLane: number }>();

  // Fever state
  private feverCharge = 0;
  private feverActive = false;
  private feverRemainingSec = 0;
  private feverActivations = 0;

  // Smoothed 6-band reactive & transient DSP state
  private smoothedSubBass = 0;
  private smoothedBass = 0;
  private smoothedLowMid = 0;
  private smoothedMid = 0;
  private smoothedHighMid = 0;
  private smoothedTreble = 0;
  private smoothedHigh = 0;
  private smoothedEnergy = 0;
  private prevRawBass = 0;
  private bassTransientCooldown = 0;
  private kickPulse = 0;
  private snarePulse = 0;
  private hihatPulse = 0;
  private roadScrollOffset = 0;
  private defeatFlash = 0;
  private dropScreenPulse = 0;
  private lastHudPush = 0;
  private currentSection: MusicalSectionType = 'groove';
  private prevSection: MusicalSectionType = 'groove';

  // Isolated Creator Playtest & 2.5D/3D Preview state (strictly disabled in Classic Mode)
  private creatorPlaytestActive = false;
  private creatorVirtualClockEnabled = false;
  private creatorVirtualTimeSec = 0;
  private creatorVirtualDurationSec = 40;
  private creatorSpeedScale = 1.0;
  private creatorVisualOnly = false;
  private creatorCameraOverride: {
    fovDelta: number;
    offsetX: number;
    offsetY: number;
    offsetZ: number;
    rollRad: number;
    shake: number;
  } | null = null;
  private creatorEffectsOverride: {
    bloomDelta: number;
    exposureDelta: number;
    bgTheme?: EnvironmentTheme;
    bgPrimary?: string;
    bgSecondary?: string;
    bgBrightness?: number;
  } | null = null;
  private creatorAppliedBgTheme: EnvironmentTheme | null = null;

  constructor(container: HTMLElement, initialSettings: GameSettings) {
    this.container = container;
    this.settings = initialSettings;
    this.trackLayout = computeTrackLayout(initialSettings.generationConfig.laneCount ?? 4);
    this.currentShape = resolveNoteShape(
      initialSettings.noteShape,
      initialSettings.visualsConfig?.preset ?? 'auto',
    );

    this.isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    this.isMobileGpu = (() => {
      if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
      const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
      const coarse =
        typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
      return uaMobile || (coarse && Math.min(window.innerWidth, window.innerHeight) <= 920);
    })();
    this.isDocumentHidden =
      typeof document !== 'undefined' && document.visibilityState === 'hidden';

    const width = container.clientWidth || window.innerWidth;
    const height = Math.max(1, container.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && initialSettings.graphicsQuality !== 'low' && !this.isMobileGpu,
      powerPreference: this.isMobileGpu ? 'default' : 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure =
      0.88 * (initialSettings.visualsConfig?.sceneBrightness ?? initialSettings.brightness);
    this.applyQualityPixelRatio();
    this.renderer.setSize(width, height);

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050819);
    this.scene.fog = new THREE.FogExp2(0x080d26, this.baseFogDensity);

    this.cameraRig = new CameraRig(width / height, HIT_LINE_Z);
    this.cameraRig.updateFraming(width / height, this.trackLayout.roadWidth);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const maxAniso = Math.min(
      this.renderer.capabilities.getMaxAnisotropy(),
      this.isMobileGpu ? 4 : 8,
    );
    const trackTexs = createCircuitTrackTextures();
    this.roadAlbedoTex = trackTexs.albedo;
    this.roadRoughTex = trackTexs.roughness;
    this.roadAlbedoTex.anisotropy = maxAniso;
    this.roadRoughTex.anisotropy = maxAniso;
    this.noteReflectionTex = createNoteReflectionTexture();
    this.pulseGradientTex = createLongitudinalPulseTexture();
    this.tileInnerRingTex = createTileInnerRingTexture();
    this.flameTrailTex = createFlameTrailTexture();

    this.setupLights();
    this.scene.add(this.trackGroup);
    this.rebuildCircuitTrack(this.trackLayout.laneCount);

    const initialPreset = initialSettings.visualsConfig?.preset ?? 'auto';
    const initialEnvPref = initialSettings.environmentMode ?? 'auto';
    const initialTheme: EnvironmentTheme =
      initialPreset === 'auto' && initialEnvPref === 'auto'
        ? 'cyberpunk'
        : resolveEffectiveEnvironment(initialPreset, initialEnvPref, null, this.currentEnvSeed);
    this.envManager = new EnvironmentManager(
      this.scene,
      maxAniso,
      initialTheme,
      this.currentEnvSeed,
      this.getEffectiveQuality(),
      this.currentPalette,
    );
    const initAtmo = this.envManager.getAtmosphere();
    if (initAtmo) this.applyAtmosphere(initAtmo);

    this.buildNoteGeometries();
    this.buildNotePool();
    this.buildParticlePool();
    this.setupPostProcessing(width, height);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.cameraRig.camera);
    }

    window.addEventListener('resize', this.handleResize);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
    this.syncLoopState();
  }

  private setupPostProcessing(width: number, height: number): void {
    if (this.isSoftwareGl) return;

    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.cameraRig.camera);
    this.composer.addPass(renderPass);

    const bloomDivisor = this.isMobileGpu ? 3 : 2;
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(
        Math.max(1, Math.floor(width / bloomDivisor)),
        Math.max(1, Math.floor(height / bloomDivisor)),
      ),
      0.24,
      0.28,
      0.92,
    );
    this.composer.addPass(this.bloomPass);
    this.syncBloomSettings();
  }

  private getEffectiveBrightness(): number {
    const base = this.settings.visualsConfig?.sceneBrightness ?? this.settings.brightness;
    return THREE.MathUtils.clamp(base, 0.55, 1.35);
  }

  private getRoadEnvIntensity(): number {
    const base =
      this.settings.reflectionQuality === 'low'
        ? 0.14
        : this.settings.reflectionQuality === 'medium'
          ? 0.3
          : 0.44;
    return base * this.getEffectiveBrightness();
  }

  private getEffectiveQuality(): QualityLevel {
    const perfMode = this.settings.performanceConfig?.performanceMode ?? 'auto';
    if (perfMode === 'battery') return 'low';
    if (perfMode === 'balanced') return 'medium';
    if (perfMode === 'auto') {
      if (this.settings.graphicsQuality === 'low') return 'low';
      if (this.settings.graphicsQuality === 'medium' && this.autoPerfLevel === 'high') {
        return 'medium';
      }
      return this.autoPerfLevel;
    }
    return this.settings.graphicsQuality;
  }

  private syncBloomSettings(): void {
    if (!this.bloomPass) return;
    const effQuality = this.getEffectiveQuality();
    const perfBattery = this.settings.performanceConfig?.performanceMode === 'battery';
    const userBloom = this.settings.visualsConfig?.bloomIntensity ?? 1.0;
    const menuLowMobile =
      this.isMobileGpu &&
      this.renderContext === 'menu' &&
      this.settings.menuAmbientConfig?.visualIntensity === 'low';
    const enabled = effQuality !== 'low' && !perfBattery && userBloom > 0.05 && !menuLowMobile;
    this.bloomPass.enabled = enabled;
    const presetScale = getPresetById(this.settings.visualsConfig?.preset ?? 'auto').bloomScale;
    const baseStrength =
      this.settings.visualIntensity === 'low'
        ? 0.14
        : this.settings.visualIntensity === 'medium'
          ? 0.24
          : 0.32;
    const brightFactor = THREE.MathUtils.clamp(
      0.45 + (this.getEffectiveBrightness() - 0.6) * 0.75,
      0.35,
      1.15,
    );
    this.bloomPass.threshold = this.settings.visualsConfig?.reducedFlash ? 0.94 : 0.91;
    this.bloomPass.strength = THREE.MathUtils.clamp(
      baseStrength * brightFactor * userBloom * presetScale,
      0.05,
      0.65,
    );
    this.bloomPass.radius = effQuality === 'high' ? (this.isMobileGpu ? 0.26 : 0.32) : 0.22;
  }

  private applyQualityPixelRatio(): void {
    if (this.isSoftwareGl) {
      this.renderer.setPixelRatio(1);
      return;
    }
    const effQuality = this.getEffectiveQuality();
    const perfBattery = this.settings.performanceConfig?.performanceMode === 'battery';
    let maxPr = 2;
    if (perfBattery || effQuality === 'low') {
      maxPr = 1;
    } else if (this.isMobileGpu) {
      maxPr = effQuality === 'medium' ? 1.25 : 1.5;
    } else {
      maxPr = effQuality === 'medium' ? 1.5 : 2;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPr));
  }

  private setupLights(): void {
    const bright = this.getEffectiveBrightness();

    this.hemiLight = new THREE.HemisphereLight(0x818cf8, 0x050816, 0.48 * bright);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xe0f2fe, 0.95 * bright);
    this.dirLight.position.set(2.5, 16, 11);
    this.scene.add(this.dirLight);

    this.leftNeonLight = new THREE.PointLight(0x22d3ee, 1.2 * bright, 28, 1.6);
    this.leftNeonLight.position.set(-4.8, 2.2, 0.5);
    this.scene.add(this.leftNeonLight);

    this.rightNeonLight = new THREE.PointLight(0xe879f9, 1.2 * bright, 28, 1.6);
    this.rightNeonLight.position.set(4.8, 2.2, 0.5);
    this.scene.add(this.rightNeonLight);

    this.horizonLight = new THREE.PointLight(0x6366f1, 2.0 * bright, 52, 1.4);
    this.horizonLight.position.set(0, 6.0, -40);
    this.scene.add(this.horizonLight);
  }

  private disposeGroupMeshes(group: THREE.Group): void {
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        } else {
          m.material?.dispose();
        }
      }
    });
    group.clear();
  }

  private rebuildCircuitTrack(laneCount: LaneCount): void {
    this.disposeGroupMeshes(this.trackGroup);
    this.lanePadMeshes = [];
    this.lanePadRingMats = [];
    this.laneStripMeshes = [];
    this.laneEdgeMats = [];
    this.sideRailMats = [];
    this.dividerMats = [];
    this.underDeckConduitMats = [];
    this.railBracketMats = [];
    this.shockwavePool = [];
    this.lanePulsePool = [];
    this.surfaceWavePool = [];
    this.chordBeamPool = [];

    this.trackLayout = computeTrackLayout(laneCount);
    const { roadWidth, laneStep, laneX } = this.trackLayout;
    this.laneFlash = new Array(laneCount).fill(0);
    this.laneMissFlash = new Array(laneCount).fill(0);

    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.cameraRig.updateFraming(w / h, roadWidth);

    // Road deck
    const roadGeo = new THREE.PlaneGeometry(roadWidth, 68);
    this.roadMat = new THREE.MeshStandardMaterial({
      map: this.roadAlbedoTex,
      roughnessMap: this.roadRoughTex,
      roughness: 0.56,
      metalness: 0.7,
      envMapIntensity: this.getRoadEnvIntensity(),
    });
    const roadMesh = new THREE.Mesh(roadGeo, this.roadMat);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set(0, 0, -24);
    this.trackGroup.add(roadMesh);

    const underDeckGeo = new THREE.BoxGeometry(roadWidth + 0.24, 0.24, 68.4);
    const underDeckMat = new THREE.MeshStandardMaterial({
      color: 0x050814,
      metalness: 0.85,
      roughness: 0.35,
    });
    const underDeck = new THREE.Mesh(underDeckGeo, underDeckMat);
    underDeck.position.set(0, -0.125, -24);
    this.trackGroup.add(underDeck);

    // Under-deck glowing energy conduits (strictly beneath deck so notes remain ultra-clear)
    const conduitGeo = new THREE.BoxGeometry(0.11, 0.05, 68.2);
    for (let cIdx = -1; cIdx <= 1; cIdx++) {
      const cCol = cIdx === 0 ? this.accentColor : cIdx < 0 ? this.primaryColor : this.secondaryColor;
      const cMat = new THREE.MeshBasicMaterial({
        color: cCol,
        transparent: true,
        opacity: 0.52,
      });
      this.underDeckConduitMats.push(cMat);
      const conduit = new THREE.Mesh(conduitGeo, cMat);
      conduit.position.set(cIdx * (roadWidth * 0.42), -0.26, -24);
      this.trackGroup.add(conduit);
    }

    // Side rails (controlled emissive to never overexpose edges)
    const railX = roadWidth * 0.5 + 0.08;
    const housingGeo = new THREE.BoxGeometry(0.24, 0.14, 68);
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x070b1c,
      metalness: 0.9,
      roughness: 0.25,
    });
    const coreRailGeo = new THREE.BoxGeometry(0.08, 0.08, 68);
    const leftRailMat = new THREE.MeshStandardMaterial({
      color: this.primaryColor,
      emissive: this.primaryColor,
      emissiveIntensity: 0.38,
      metalness: 0.4,
      roughness: 0.28,
    });
    const rightRailMat = new THREE.MeshStandardMaterial({
      color: this.secondaryColor,
      emissive: this.secondaryColor,
      emissiveIntensity: 0.38,
      metalness: 0.4,
      roughness: 0.28,
    });
    this.sideRailMats = [leftRailMat, rightRailMat];

    const leftHousing = new THREE.Mesh(housingGeo, housingMat);
    leftHousing.position.set(-railX, 0.06, -24);
    const leftCore = new THREE.Mesh(coreRailGeo, leftRailMat);
    leftCore.position.set(-railX + 0.1, 0.11, -24);

    const rightHousing = new THREE.Mesh(housingGeo, housingMat);
    rightHousing.position.set(railX, 0.06, -24);
    const rightCore = new THREE.Mesh(coreRailGeo, rightRailMat);
    rightCore.position.set(railX - 0.1, 0.11, -24);

    this.trackGroup.add(leftHousing, leftCore, rightHousing, rightCore);

    // Futuristic segmented rail brackets & outer tech pylons along the bridge
    const bracketGeo = new THREE.BoxGeometry(0.22, 0.28, 0.45);
    const leftBracketMat = new THREE.MeshStandardMaterial({
      color: 0x0b122b,
      emissive: this.primaryColor,
      emissiveIntensity: 0.3,
      metalness: 0.85,
      roughness: 0.25,
    });
    const rightBracketMat = new THREE.MeshStandardMaterial({
      color: 0x0b122b,
      emissive: this.secondaryColor,
      emissiveIntensity: 0.3,
      metalness: 0.85,
      roughness: 0.25,
    });
    this.railBracketMats = [leftBracketMat, rightBracketMat];
    for (let z = 1; z >= -52; z -= 6.5) {
      const lb = new THREE.Mesh(bracketGeo, leftBracketMat);
      lb.position.set(-railX - 0.22, 0.02, z);
      const rb = new THREE.Mesh(bracketGeo, rightBracketMat);
      rb.position.set(railX + 0.22, 0.02, z);
      this.trackGroup.add(lb, rb);
    }

    this.leftNeonLight.position.set(-railX - 1.4, 2.2, 0.5);
    this.rightNeonLight.position.set(railX + 1.4, 2.2, 0.5);

    // Lane dividers (laneCount - 1)
    const divGeo = new THREE.BoxGeometry(0.028, 0.02, 68);
    for (let i = 0; i < laneCount - 1; i++) {
      const divX = (laneX[i] + laneX[i + 1]) * 0.5;
      const isCenter = Math.abs(divX) < 0.05;
      const col = isCenter ? this.accentColor : this.primaryColor;
      const divMat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: isCenter ? 0.42 : 0.3,
        transparent: true,
        opacity: isCenter ? 0.58 : 0.42,
      });
      this.dividerMats.push(divMat);
      const div = new THREE.Mesh(divGeo, divMat);
      div.position.set(divX, 0.018, -24);
      this.trackGroup.add(div);
    }

    // Lane strips, per-lane dynamic edge borders & Receptor pads
    const stripGeo = new THREE.PlaneGeometry(laneStep * 0.92, 62);
    const edgeGeo = new THREE.PlaneGeometry(0.048, 62);
    const padOuterGeo = new THREE.BoxGeometry(laneStep * 0.86, 0.07, 0.72);
    const padRingGeo = new THREE.RingGeometry(
      laneStep * 0.18,
      laneStep * 0.28,
      24,
    );

    const padBevelGeo = new THREE.PlaneGeometry(laneStep * 0.8, 0.62);

    for (let i = 0; i < laneCount; i++) {
      const isEven = i % 2 === 0;
      const laneCol = isEven ? this.primaryColor : this.secondaryColor;
      const noteCol = isEven ? this.notePrimaryColor : this.noteSecondaryColor;

      const stripMat = new THREE.MeshBasicMaterial({
        color: laneCol,
        transparent: true,
        opacity: 0.02,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(laneX[i], 0.023, -22);
      this.trackGroup.add(strip);
      this.laneStripMeshes.push(strip);

      // Left & right dynamic border strips inside each lane
      const leftEdgeMat = new THREE.MeshBasicMaterial({
        color: laneCol,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const rightEdgeMat = new THREE.MeshBasicMaterial({
        color: laneCol,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.laneEdgeMats.push([leftEdgeMat, rightEdgeMat]);

      const leftEdge = new THREE.Mesh(edgeGeo, leftEdgeMat);
      leftEdge.rotation.x = -Math.PI / 2;
      leftEdge.position.set(laneX[i] - laneStep * 0.44, 0.026, -22);
      const rightEdge = new THREE.Mesh(edgeGeo, rightEdgeMat);
      rightEdge.rotation.x = -Math.PI / 2;
      rightEdge.position.set(laneX[i] + laneStep * 0.44, 0.026, -22);
      this.trackGroup.add(leftEdge, rightEdge);

      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x0f1736,
        emissive: noteCol,
        emissiveIntensity: 0.42,
        metalness: 0.72,
        roughness: 0.22,
      });
      const padFrame = new THREE.Mesh(padOuterGeo, frameMat);
      padFrame.position.set(laneX[i], 0.036, HIT_LINE_Z);

      const ringMat = new THREE.MeshBasicMaterial({
        map: this.tileInnerRingTex,
        color: noteCol,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.lanePadRingMats.push(ringMat);
      const padBevel = new THREE.Mesh(padBevelGeo, ringMat);
      padBevel.rotation.x = -Math.PI / 2;
      padBevel.position.set(0, 0.044, 0);
      padFrame.add(padBevel);

      const innerHalo = new THREE.Mesh(padRingGeo, ringMat);
      innerHalo.rotation.x = -Math.PI / 2;
      innerHalo.position.set(0, 0.041, 0);
      padFrame.add(innerHalo);

      this.trackGroup.add(padFrame);
      this.lanePadMeshes.push(padFrame);
    }

    // Hit line
    const hitGeo = new THREE.BoxGeometry(roadWidth + 0.1, 0.045, 0.085);
    this.hitLineMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: this.primaryColor,
      emissiveIntensity: 0.68,
      metalness: 0.75,
      roughness: 0.25,
    });
    const hitLine = new THREE.Mesh(hitGeo, this.hitLineMat);
    hitLine.position.set(0, 0.04, HIT_LINE_Z);
    this.trackGroup.add(hitLine);

    // Pooled longitudinal lane pulses (18 slots)
    const lanePulseGeo = new THREE.PlaneGeometry(laneStep * 0.76, 3.6);
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.pulseGradientTex,
        color: this.primaryColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(lanePulseGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.trackGroup.add(mesh);
      this.lanePulsePool.push({
        active: false,
        mesh,
        mat,
        lane: 0,
        z: 0,
        speedZ: 28,
        life: 0,
        maxLife: 0.7,
        maxOpacity: 0.26,
      });
    }

    // Pooled surface energy waves (4 wide horizontal bands)
    const surfWaveGeo = new THREE.PlaneGeometry(roadWidth * 0.98, 1.5);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.pulseGradientTex,
        color: this.primaryColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(surfWaveGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.trackGroup.add(mesh);
      this.surfaceWavePool.push({
        active: false,
        mesh,
        mat,
        z: SPAWN_Z,
        speedZ: 34,
        life: 0,
        maxLife: 1.1,
        maxOpacity: 0.22,
      });
    }

    // Pooled expanding hit shockwaves + localized radial hit flares + upward stylized flame hit plumes (8 slots)
    const hitWaveGeo = new THREE.RingGeometry(0.32, 0.48, 28);
    const hitFlareGeo = new THREE.CircleGeometry(laneStep * 0.56, 24);
    const hitFlameGeo = new THREE.PlaneGeometry(laneStep * 0.82, 2.35);
    for (let i = 0; i < 8; i++) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: this.primaryColor,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(hitWaveGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;

      const flareMat = new THREE.MeshBasicMaterial({
        map: this.noteReflectionTex,
        color: this.primaryColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const flare = new THREE.Mesh(hitFlareGeo, flareMat);
      flare.rotation.x = -Math.PI / 2;
      flare.visible = false;

      const flameMat = new THREE.MeshBasicMaterial({
        map: this.flameTrailTex,
        color: 0xfbbf24,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const flame = new THREE.Mesh(hitFlameGeo, flameMat);
      flame.rotation.x = -Math.PI / 2 + 0.16;
      flame.visible = false;

      this.trackGroup.add(ring, flare, flame);
      this.shockwavePool.push({
        active: false,
        ring,
        ringMat,
        flare,
        flareMat,
        flame,
        flameMat,
        life: 0,
        maxLife: 0.34,
        expandScale: 3.4,
        flarePeak: 0.52,
      });
    }

    // Pooled chord linking beams (4 slots)
    const chordBeamGeo = new THREE.PlaneGeometry(1, 0.28);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.pulseGradientTex,
        color: this.accentColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(chordBeamGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.trackGroup.add(mesh);
      this.chordBeamPool.push({
        active: false,
        mesh,
        mat,
        life: 0,
        maxLife: 0.26,
      });
    }

    // Active Slide follower cursor beacon
    const slideCursorGeo = new THREE.RingGeometry(0.28, 0.45, 24);
    this.slideCursorMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.slideCursorMesh = new THREE.Mesh(slideCursorGeo, this.slideCursorMat);
    this.slideCursorMesh.rotation.x = -Math.PI / 2;
    this.slideCursorMesh.position.set(0, 0.08, HIT_LINE_Z);
    this.slideCursorMesh.visible = false;
    this.trackGroup.add(this.slideCursorMesh);

    // Miss wave ring
    const missWaveGeo = new THREE.RingGeometry(0.45, 0.7, 24);
    const missWaveMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.missWaveRing = new THREE.Mesh(missWaveGeo, missWaveMat);
    this.missWaveRing.rotation.x = -Math.PI / 2;
    this.missWaveRing.position.set(0, 0.07, HIT_LINE_Z + 0.35);
    this.trackGroup.add(this.missWaveRing);
  }

  private buildNoteGeometries(): void {
    // 1. Tile (beveled rectangle)
    const tileShape = new THREE.Shape();
    const w = 0.54;
    const h = 0.34;
    const r = 0.09;
    tileShape.moveTo(-w + r, -h);
    tileShape.lineTo(w - r, -h);
    tileShape.quadraticCurveTo(w, -h, w, -h + r);
    tileShape.lineTo(w, h - r);
    tileShape.quadraticCurveTo(w, h, w - r, h);
    tileShape.lineTo(-w + r, h);
    tileShape.quadraticCurveTo(-w, h, -w, h - r);
    tileShape.lineTo(-w, -h + r);
    tileShape.quadraticCurveTo(-w, -h, -w + r, -h);

    const tileCore = new THREE.ExtrudeGeometry(tileShape, {
      depth: 0.15,
      bevelEnabled: true,
      bevelThickness: 0.045,
      bevelSize: 0.045,
      bevelSegments: 2,
    });
    tileCore.rotateX(-Math.PI / 2);
    tileCore.center();
    const tileTrim = new THREE.BoxGeometry(1.22, 0.08, 0.8);
    this.noteGeoCache.tile = { core: tileCore, trim: tileTrim };

    // 2. Square (precision bevel cube-tile)
    const sqShape = new THREE.Shape();
    const sw = 0.44;
    const sr = 0.07;
    sqShape.moveTo(-sw + sr, -sw);
    sqShape.lineTo(sw - sr, -sw);
    sqShape.quadraticCurveTo(sw, -sw, sw, -sw + sr);
    sqShape.lineTo(sw, sw - sr);
    sqShape.quadraticCurveTo(sw, sw, sw - sr, sw);
    sqShape.lineTo(-sw + sr, sw);
    sqShape.quadraticCurveTo(-sw, sw, -sw, sw - sr);
    sqShape.lineTo(-sw, -sw + sr);
    sqShape.quadraticCurveTo(-sw, -sw, -sw + sr, -sw);
    const sqCore = new THREE.ExtrudeGeometry(sqShape, {
      depth: 0.17,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 2,
    });
    sqCore.rotateX(-Math.PI / 2);
    sqCore.center();
    const sqTrim = new THREE.BoxGeometry(1.02, 0.08, 1.02);
    this.noteGeoCache.square = { core: sqCore, trim: sqTrim };

    // 3. Sphere
    const sphereCore = new THREE.SphereGeometry(0.35, 22, 16);
    const sphereTrim = new THREE.TorusGeometry(0.49, 0.055, 10, 32);
    sphereTrim.rotateX(Math.PI / 2.35);
    this.noteGeoCache.sphere = { core: sphereCore, trim: sphereTrim };

    // 4. Disc
    const discCore = new THREE.CylinderGeometry(0.46, 0.48, 0.14, 28);
    const discTrim = new THREE.TorusGeometry(0.51, 0.05, 10, 28);
    discTrim.rotateX(Math.PI / 2);
    this.noteGeoCache.disc = { core: discCore, trim: discTrim };

    // 5. Hexagon
    const hexCore = new THREE.CylinderGeometry(0.46, 0.49, 0.18, 6);
    const hexTrim = new THREE.TorusGeometry(0.52, 0.05, 8, 6);
    hexTrim.rotateX(Math.PI / 2);
    this.noteGeoCache.hexagon = { core: hexCore, trim: hexTrim };

    // 6. Diamond
    const diamondCore = new THREE.OctahedronGeometry(0.41, 0);
    diamondCore.scale(1.12, 0.72, 1.12);
    const diamondTrim = new THREE.OctahedronGeometry(0.51, 0);
    diamondTrim.scale(1.16, 0.78, 1.16);
    this.noteGeoCache.diamond = { core: diamondCore, trim: diamondTrim };

    // 7. Prism
    const prismCore = new THREE.ConeGeometry(0.46, 0.48, 4);
    prismCore.rotateY(Math.PI / 4);
    const prismTrim = new THREE.TorusGeometry(0.5, 0.05, 8, 4);
    prismTrim.rotateX(Math.PI / 2);
    prismTrim.rotateY(Math.PI / 4);
    this.noteGeoCache.prism = { core: prismCore, trim: prismTrim };

    // 8. Ring
    const ringCore = new THREE.TorusGeometry(0.38, 0.11, 14, 32);
    ringCore.rotateX(Math.PI / 2);
    const ringTrim = new THREE.CylinderGeometry(0.24, 0.24, 0.08, 24);
    this.noteGeoCache.ring = { core: ringCore, trim: ringTrim };

    this.reflectionGeo = new THREE.PlaneGeometry(1.5, 1.3);
    this.trailGeo = new THREE.PlaneGeometry(0.72, 2.4);
    this.topRingGeo = new THREE.PlaneGeometry(1.06, 0.68);

    // Special mechanics helper geometries
    this.holdTailGeo = new THREE.BoxGeometry(0.52, 0.1, 1);
    this.holdCapGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.16, 16);

    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.36);
    arrowShape.lineTo(0.28, 0.02);
    arrowShape.lineTo(0.11, 0.02);
    arrowShape.lineTo(0.11, -0.26);
    arrowShape.lineTo(-0.11, -0.26);
    arrowShape.lineTo(-0.11, 0.02);
    arrowShape.lineTo(-0.28, 0.02);
    arrowShape.closePath();
    this.flickArrowGeo = new THREE.ExtrudeGeometry(arrowShape, {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 1,
    });
    this.flickArrowGeo.center();

    this.slideSegGeo = new THREE.BoxGeometry(0.36, 0.09, 1);
    this.slideEndGeo = new THREE.CylinderGeometry(0.34, 0.38, 0.16, 18);
  }

  private buildNotePool(): void {
    const poolSize = 68;
    const geos = this.noteGeoCache[this.currentShape];

    for (let i = 0; i < poolSize; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x06d6f2,
        emissive: 0x06d6f2,
        emissiveIntensity: 0.42,
        metalness: 0.24,
        roughness: 0.18,
        envMapIntensity: this.isMobileGpu ? 0.32 : 0.48,
      });

      const trimMat = new THREE.MeshStandardMaterial({
        color: 0x67e8f9,
        emissive: 0x06d6f2,
        emissiveIntensity: 0.52,
        metalness: 0.45,
        roughness: 0.2,
      });

      const reflMat = new THREE.MeshBasicMaterial({
        map: this.noteReflectionTex,
        color: 0x06d6f2,
        transparent: true,
        opacity: 0.16,
        blending: THREE.NormalBlending,
        depthWrite: false,
      });

      const trailMat = new THREE.MeshBasicMaterial({
        map: this.pulseGradientTex,
        color: 0x06d6f2,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const holdMat = new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x06d6f2,
        emissiveIntensity: 0.65,
        metalness: 0.25,
        roughness: 0.2,
        transparent: true,
        opacity: 0.88,
      });

      const flickMat = new THREE.MeshStandardMaterial({
        color: 0xfde047,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.85,
        metalness: 0.3,
        roughness: 0.18,
      });

      const slideMat = new THREE.MeshStandardMaterial({
        color: 0x34d399,
        emissive: 0x10b981,
        emissiveIntensity: 0.72,
        metalness: 0.28,
        roughness: 0.2,
        transparent: true,
        opacity: 0.9,
      });

      const topRingMat = new THREE.MeshBasicMaterial({
        map: this.tileInnerRingTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const coreMesh = new THREE.Mesh(geos.core, coreMat);
      const trimMesh = new THREE.Mesh(geos.trim, trimMat);
      const topRingMesh = new THREE.Mesh(this.topRingGeo, topRingMat);
      topRingMesh.rotation.x = -Math.PI / 2;
      topRingMesh.position.y = 0.132;
      const reflectionMesh = new THREE.Mesh(this.reflectionGeo, reflMat);
      reflectionMesh.rotation.x = -Math.PI / 2;
      reflectionMesh.position.y = -0.185;

      const trailMesh = new THREE.Mesh(this.trailGeo, trailMat);
      trailMesh.rotation.x = -Math.PI / 2;
      trailMesh.position.set(0, -0.145, -1.25);
      trailMesh.visible = false;

      const holdTailMesh = new THREE.Mesh(this.holdTailGeo, holdMat);
      holdTailMesh.visible = false;
      const holdCapMesh = new THREE.Mesh(this.holdCapGeo, holdMat);
      holdCapMesh.visible = false;

      const flickArrowMesh = new THREE.Mesh(this.flickArrowGeo, flickMat);
      flickArrowMesh.visible = false;
      flickArrowMesh.position.y = 0.42;

      const slideSeg1Mesh = new THREE.Mesh(this.slideSegGeo, slideMat);
      slideSeg1Mesh.visible = false;
      const slideSeg2Mesh = new THREE.Mesh(this.slideSegGeo, slideMat);
      slideSeg2Mesh.visible = false;
      const slideEndMesh = new THREE.Mesh(this.slideEndGeo, slideMat);
      slideEndMesh.visible = false;

      group.add(
        coreMesh,
        trimMesh,
        topRingMesh,
        reflectionMesh,
        trailMesh,
        holdTailMesh,
        holdCapMesh,
        flickArrowMesh,
        slideSeg1Mesh,
        slideSeg2Mesh,
        slideEndMesh,
      );
      this.scene.add(group);

      this.notePool.push({
        active: false,
        noteId: -1,
        group,
        coreMesh,
        trimMesh,
        topRingMesh,
        reflectionMesh,
        trailMesh,
        holdTailMesh,
        holdCapMesh,
        flickArrowMesh,
        slideSeg1Mesh,
        slideSeg2Mesh,
        slideEndMesh,
      });
    }
  }

  private buildParticlePool(): void {
    const geo = new THREE.OctahedronGeometry(0.11, 0);
    this.particleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.particleMesh = new THREE.InstancedMesh(geo, this.particleMat, this.MAX_BURST_PARTICLES);
    this.particleMesh.frustumCulled = false;

    for (let i = 0; i < this.MAX_BURST_PARTICLES; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(0, -100, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.45,
        size: 1,
        color: new THREE.Color(0x06d6f2),
      });
      _mat4.makeTranslation(0, -100, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setHex(0x06d6f2));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.particleMesh);
  }

  public setNoteShape(shape: NoteShape): void {
    const resolved = resolveNoteShape(
      shape,
      this.settings.visualsConfig?.preset ?? 'auto',
      this.envManager?.getCurrentTheme(),
    );
    if (this.currentShape === resolved) return;
    this.currentShape = resolved;
    const geos = this.noteGeoCache[resolved];
    for (const slot of this.notePool) {
      slot.coreMesh.geometry = geos.core;
      slot.trimMesh.geometry = geos.trim;
      (slot.trimMesh.material as THREE.MeshStandardMaterial).wireframe = resolved === 'diamond';
    }
  }

  private applyAtmosphere(atmo: WorldAtmosphere): void {
    (this.scene.background as THREE.Color).setHex(atmo.backgroundColor);
    this.baseFogColor.setHex(atmo.fogColor);
    this.baseFogDensity = atmo.fogDensity;
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.baseFogColor);
      this.scene.fog.density = atmo.fogDensity;
    }
    this.hemiLight.color.setHex(atmo.hemiSkyColor);
    this.hemiLight.groundColor.setHex(atmo.hemiGroundColor);
    this.dirLight.color.setHex(atmo.dirLightColor);
  }

  public setEnvironment(theme: EnvironmentTheme, seed?: string): void {
    const targetSeed = seed ?? this.currentEnvSeed;
    this.currentEnvSeed = targetSeed;
    const atmo = this.envManager.loadEnvironment(
      theme,
      targetSeed,
      this.getEffectiveQuality(),
      this.currentPalette,
    );
    this.applyAtmosphere(atmo);
    this.setNoteShape(this.settings.noteShape);
  }

  public getCurrentEnvironment(): EnvironmentTheme {
    return this.envManager.getCurrentTheme();
  }

  public setPalette(songPalette: SongPalette): void {
    this.baseSongPalette = songPalette;
    const vis = this.settings.visualsConfig;
    const effective = resolveEffectivePalette(
      vis?.preset ?? 'auto',
      songPalette,
      Boolean(vis?.useCustomColors),
      vis?.customPalette,
    );
    this.currentPalette = effective;

    const resolved = resolveReadableNoteColors(effective);
    this.primaryColor.copy(resolved.trackPrimary);
    this.secondaryColor.copy(resolved.trackSecondary);
    this.accentColor.copy(resolved.trackAccent);
    this.notePrimaryColor.copy(resolved.notePrimary);
    this.noteSecondaryColor.copy(resolved.noteSecondary);
    this.noteAccentColor.copy(resolved.noteAccent);

    this.leftNeonLight.color.copy(this.primaryColor);
    this.rightNeonLight.color.copy(this.secondaryColor);
    this.horizonLight.color.copy(this.accentColor);

    if (this.sideRailMats[0]) {
      this.sideRailMats[0].color.copy(this.primaryColor);
      this.sideRailMats[0].emissive.copy(this.primaryColor);
    }
    if (this.sideRailMats[1]) {
      this.sideRailMats[1].color.copy(this.secondaryColor);
      this.sideRailMats[1].emissive.copy(this.secondaryColor);
    }
    if (this.hitLineMat) this.hitLineMat.emissive.copy(this.primaryColor);

    this.dividerMats.forEach((m, idx) => {
      const c = idx === Math.floor(this.dividerMats.length / 2) ? this.accentColor : this.primaryColor;
      m.color.copy(c);
      m.emissive.copy(c);
    });

    for (let i = 0; i < this.trackLayout.laneCount; i++) {
      const c = i % 2 === 0 ? this.primaryColor : this.secondaryColor;
      const nc = i % 2 === 0 ? this.notePrimaryColor : this.noteSecondaryColor;
      if (this.laneStripMeshes[i]) {
        (this.laneStripMeshes[i].material as THREE.MeshBasicMaterial).color.copy(c);
      }
      if (this.lanePadMeshes[i]) {
        (this.lanePadMeshes[i].material as THREE.MeshStandardMaterial).emissive.copy(nc);
      }
      if (this.lanePadRingMats[i]) {
        this.lanePadRingMats[i].color.copy(nc);
      }
      if (this.laneEdgeMats[i]) {
        this.laneEdgeMats[i][0].color.copy(c);
        this.laneEdgeMats[i][1].color.copy(c);
      }
    }

    this.envManager?.setPalette(effective);
  }

  public updateSettings(next: GameSettings): void {
    const prevQuality = this.settings.graphicsQuality;
    const prevEnvMode = this.settings.environmentMode;
    const prevPreset = this.settings.visualsConfig?.preset;
    const prevCustomColors = this.settings.visualsConfig?.useCustomColors;
    const prevCustomPal = this.settings.visualsConfig?.customPalette;
    const prevPerf = this.settings.performanceConfig?.performanceMode;
    const prevLanes = this.trackLayout.laneCount;

    this.settings = next;
    const nextLanes = next.generationConfig.laneCount ?? 4;
    if (this.mode !== 'playing' && nextLanes !== prevLanes) {
      this.rebuildCircuitTrack(nextLanes);
    }

    const bright = this.getEffectiveBrightness();
    this.renderer.toneMappingExposure = 0.88 * bright;
    this.hemiLight.intensity = 0.48 * bright;
    this.dirLight.intensity = 0.95 * bright;

    const partScale =
      (next.particleIntensity === 'low' ? 0.45 : next.particleIntensity === 'medium' ? 0.72 : 0.95) *
      (next.visualsConfig?.particleIntensityValue ?? 1.0);
    this.particleMat.opacity = THREE.MathUtils.clamp(0.68 * partScale * bright, 0.15, 0.95);

    this.setPalette(this.baseSongPalette);
    this.setNoteShape(next.noteShape);
    this.syncBloomSettings();
    this.roadMat.envMapIntensity = this.getRoadEnvIntensity();

    const qualityChanged =
      next.graphicsQuality !== prevQuality ||
      next.performanceConfig?.performanceMode !== prevPerf;
    const envChanged =
      next.environmentMode !== prevEnvMode ||
      next.visualsConfig?.preset !== prevPreset ||
      next.visualsConfig?.useCustomColors !== prevCustomColors ||
      next.visualsConfig?.customPalette !== prevCustomPal;

    if (qualityChanged || envChanged) {
      const nextTheme = resolveEffectiveEnvironment(
        next.visualsConfig?.preset ?? 'auto',
        next.environmentMode ?? 'auto',
        this.activeProfile,
        this.currentEnvSeed,
      );
      this.setEnvironment(nextTheme, this.currentEnvSeed);
    }

    if (qualityChanged) {
      this.applyQualityPixelRatio();
      const w = this.container.clientWidth || window.innerWidth;
      const h = Math.max(1, this.container.clientHeight || window.innerHeight);
      this.composer?.setSize(w, h);
    }
    if (this.renderContext === 'paused' && !this.suspended && !this.isDocumentHidden) {
      this.pauseRenderDone = false;
      this.syncLoopState();
    }
  }

  public startLevel(
    level: GeneratedLevel,
    palette: SongPalette,
    callbacks: GameplayCallbacks,
    profile?: MusicProfile,
    environmentOverride?: EnvironmentTheme,
  ): void {
    this.activeLevel = level;
    this.activeProfile = profile ?? null;
    this.callbacks = callbacks;

    if (level.laneCount !== this.trackLayout.laneCount) {
      this.rebuildCircuitTrack(level.laneCount);
    }

    this.setPalette(palette);

    const chosenTheme =
      environmentOverride ??
      resolveEffectiveEnvironment(
        this.settings.visualsConfig?.preset ?? 'auto',
        this.settings.environmentMode ?? 'auto',
        this.activeProfile,
        level.seed,
      );
    this.setEnvironment(chosenTheme, level.seed);

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hits = 0;
    this.misses = 0;
    this.perfectCount = 0;
    this.goodCount = 0;
    this.okCount = 0;
    this.perfectChain = 0;
    this.maxPerfectChain = 0;
    this.holdsCompleted = 0;
    this.holdsBroken = 0;
    this.chordsHit = 0;
    this.flicksHit = 0;
    this.slidesCompleted = 0;
    this.multiplierSum = 0;
    this.multiplierSamples = 0;
    this.nextSearchIdx = 0;
    this.nextBeatIdx = 0;
    this.nextDropIdx = 0;
    this.defeatFlash = 0;
    this.dropScreenPulse = 0;
    this.feverCharge = 0;
    this.feverActive = false;
    this.feverRemainingSec = 0;
    this.feverActivations = 0;
    this.activeHolds.clear();
    this.activeSlides.clear();
    this.chordHitTracker.clear();
    this.heldLanes.fill(false);
    this.activePointerLane = null;
    this.prevRawBass = 0;
    this.bassTransientCooldown = 0;
    this.reactiveLighting.reset();
    this.kickPulse = 0;
    this.snarePulse = 0;
    this.hihatPulse = 0;
    this.prevSection = 'groove';
    this.currentSection = 'groove';
    this.creatorPlaytestActive = false;
    this.creatorVirtualClockEnabled = false;
    this.creatorVirtualTimeSec = 0;
    this.creatorSpeedScale = 1.0;
    this.creatorVisualOnly = false;
    this.creatorCameraOverride = null;
    this.creatorEffectsOverride = null;
    this.creatorAppliedBgTheme = null;
    this.isMenuMode = false;
    this.mode = 'playing';
    this.setRenderContext('gameplay');
    this.cameraRig.triggerGameplayIntro();
    this.resetPooledTrackEffects();

    const defaultGeos = this.noteGeoCache[this.currentShape];
    for (const slot of this.notePool) {
      slot.active = false;
      slot.noteId = -1;
      slot.group.visible = false;
      slot.coreMesh.geometry = defaultGeos.core;
      slot.trimMesh.geometry = defaultGeos.trim;
      (slot.trimMesh.material as THREE.MeshStandardMaterial).wireframe =
        this.currentShape === 'diamond';
    }
  }

  public startCreatorPlaytest(
    level: GeneratedLevel,
    palette: SongPalette,
    callbacks: GameplayCallbacks,
    options: {
      profile?: MusicProfile;
      environmentOverride?: EnvironmentTheme;
      useVirtualClock?: boolean;
      startTimeSec?: number;
      durationSec?: number;
      speedScale?: number;
      visualOnly?: boolean;
    },
  ): void {
    this.startLevel(level, palette, callbacks, options.profile, options.environmentOverride);
    this.creatorPlaytestActive = true;
    this.setRenderContext('playtest');
    this.creatorVirtualClockEnabled = Boolean(options.useVirtualClock);
    this.creatorVirtualTimeSec = Math.max(0, options.startTimeSec ?? 0);
    this.creatorVirtualDurationSec = Math.max(10, options.durationSec ?? 40);
    this.creatorSpeedScale = Math.max(0.25, Math.min(2.0, options.speedScale ?? 1.0));
    this.creatorVisualOnly = Boolean(options.visualOnly);
    this.creatorAppliedBgTheme = options.environmentOverride ?? null;

    if (this.creatorVirtualTimeSec > 0.1) {
      for (const n of level.notes) {
        if (n.time < this.creatorVirtualTimeSec - 0.1) {
          n.hit = true;
        } else {
          break;
        }
      }
    }
  }

  public setCreatorPlaytestRuntime(params: {
    cameraOverride?: {
      fovDelta: number;
      offsetX: number;
      offsetY: number;
      offsetZ: number;
      rollRad: number;
      shake: number;
    } | null;
    effectsOverride?: {
      bloomDelta: number;
      exposureDelta: number;
      bgTheme?: EnvironmentTheme;
      bgPrimary?: string;
      bgSecondary?: string;
      bgBrightness?: number;
    } | null;
    speedScale?: number;
    visualOnly?: boolean;
  }): void {
    if (!this.creatorPlaytestActive) return;
    if (params.cameraOverride !== undefined) this.creatorCameraOverride = params.cameraOverride;
    if (params.effectsOverride !== undefined) {
      this.creatorEffectsOverride = params.effectsOverride;
      const targetTheme = params.effectsOverride?.bgTheme;
      if (targetTheme && targetTheme !== this.creatorAppliedBgTheme) {
        this.creatorAppliedBgTheme = targetTheme;
        this.setEnvironment(targetTheme, this.currentEnvSeed);
      }
      if (params.effectsOverride?.bgPrimary || params.effectsOverride?.bgSecondary) {
        this.setPalette({
          primary: params.effectsOverride.bgPrimary || this.baseSongPalette.primary,
          secondary: params.effectsOverride.bgSecondary || this.baseSongPalette.secondary,
          accent: this.baseSongPalette.accent,
        });
      }
    }
    if (params.speedScale !== undefined) {
      this.creatorSpeedScale = Math.max(0.25, Math.min(2.0, params.speedScale));
    }
    if (params.visualOnly !== undefined) {
      this.creatorVisualOnly = params.visualOnly;
    }
  }

  private getGameplayCurrentTime(): number {
    if (this.creatorPlaytestActive && this.creatorVirtualClockEnabled) {
      return this.creatorVirtualTimeSec;
    }
    return audioEngine.getCurrentTime();
  }

  public setMenuMode(active: boolean): void {
    this.isMenuMode = active;
    if (active) {
      this.setRenderContext('menu');
    } else {
      this.menuParallaxX = 0;
      this.menuParallaxY = 0;
    }
    this.syncBloomSettings();
  }

  public setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    this.syncLoopState();
  }

  public isSuspended(): boolean {
    return this.suspended || this.isDocumentHidden;
  }

  public setRenderContext(ctx: 'menu' | 'gameplay' | 'playtest' | 'paused'): void {
    if (this.renderContext === ctx) return;
    this.renderContext = ctx;
    this.pauseRenderDone = false;
    this.accumulatedMenuDt = 0;
    this.perfFrameAccum = 0;
    this.perfFrameSamples = 0;
    this.syncBloomSettings();
    this.syncLoopState();
  }

  public setMenuParallax(nx: number, ny: number): void {
    this.menuParallaxX = THREE.MathUtils.clamp(nx, -1, 1);
    this.menuParallaxY = THREE.MathUtils.clamp(ny, -1, 1);
  }

  private resetPooledTrackEffects(): void {
    for (const s of this.shockwavePool) {
      s.active = false;
      s.ring.visible = false;
      s.flare.visible = false;
      s.flame.visible = false;
    }
    for (const p of this.lanePulsePool) {
      p.active = false;
      p.mesh.visible = false;
    }
    for (const w of this.surfaceWavePool) {
      w.active = false;
      w.mesh.visible = false;
    }
    for (const b of this.chordBeamPool) {
      b.active = false;
      b.mesh.visible = false;
    }
    if (this.slideCursorMesh) {
      this.slideCursorMesh.visible = false;
    }
  }

  public setMode(mode: 'idle' | 'playing' | 'paused' | 'ended'): void {
    this.mode = mode;
    if (mode === 'playing') {
      this.setRenderContext(this.creatorPlaytestActive ? 'playtest' : 'gameplay');
    } else if (mode === 'paused') {
      this.setRenderContext('paused');
    } else if (mode === 'idle') {
      this.activeLevel = null;
      this.activeProfile = null;
      this.creatorPlaytestActive = false;
      this.creatorVirtualClockEnabled = false;
      this.creatorVirtualTimeSec = 0;
      this.creatorCameraOverride = null;
      this.creatorEffectsOverride = null;
      this.creatorAppliedBgTheme = null;
      this.activeHolds.clear();
      this.activeSlides.clear();
      this.heldLanes.fill(false);
      this.feverActive = false;
      this.feverCharge = 0;
      this.resetPooledTrackEffects();
      const defaultGeos = this.noteGeoCache[this.currentShape];
      for (const slot of this.notePool) {
        slot.active = false;
        slot.group.visible = false;
        slot.coreMesh.geometry = defaultGeos.core;
        slot.trimMesh.geometry = defaultGeos.trim;
        (slot.trimMesh.material as THREE.MeshStandardMaterial).wireframe =
          this.currentShape === 'diamond';
      }
      this.syncBloomSettings();
      this.renderer.toneMappingExposure = 0.88 * this.getEffectiveBrightness();
      this.setRenderContext('menu');
    }
  }

  public triggerDefeatEffect(): void {
    this.mode = 'ended';
    this.defeatFlash = 1.0;
    this.missWaveLife = 1.0;
    this.missWaveRing.position.set(0, 0.08, HIT_LINE_Z);
    this.spawnBurst(0, 0.35, HIT_LINE_Z, _missColor, 28, false);
  }

  public triggerVictoryEffect(): void {
    this.mode = 'ended';
    this.spawnSurfaceWave(_victoryGoldColor, -34, 0.24);
    for (let i = 0; i < this.trackLayout.laneCount; i++) {
      const col = i % 2 === 0 ? this.primaryColor : _victoryGoldColor;
      this.spawnBurst(this.trackLayout.laneX[i], 0.4, HIT_LINE_Z, col, 8, false);
      this.spawnLanePulse(i, col, true, 32, 0.28);
    }
  }

  private getActiveMultiplier(): number {
    const comboMult = 1 + Math.min(2.5, Math.floor(this.combo / 15) * 0.25);
    const chainMult =
      this.settings.generationConfig.mechanics.perfectChain.enabled && this.perfectChain >= 5
        ? Math.min(1.5, 1 + Math.floor(this.perfectChain / 10) * 0.1)
        : 1.0;
    const feverMult = this.feverActive
      ? this.settings.generationConfig.mechanics.feverMode.multiplierBoost
      : 1.0;
    return Number((comboMult * chainMult * feverMult).toFixed(2));
  }

  private evaluateTimingJudgment(
    absDiff: number,
    hitWindow: number,
  ): { judgment: HitJudgment; precisionBonus: number; label: string } {
    if (absDiff <= hitWindow * 0.42) {
      return { judgment: 'perfect', precisionBonus: 70, label: 'PERFECT' };
    }
    if (absDiff <= hitWindow * 0.76) {
      return { judgment: 'good', precisionBonus: 40, label: 'GOOD' };
    }
    return { judgment: 'ok', precisionBonus: 15, label: 'OK' };
  }

  private getNoteHitWindow(note: LevelNote): number {
    const level = this.activeLevel!;
    const sensitivityMult = Math.max(0.75, Math.min(1.35, this.settings.touchSensitivity));
    const precisionScale = note.challengeSection ? level.precisionStrictness : 1.0;
    return level.hitWindowSec * sensitivityMult * precisionScale;
  }

  private applySuccessHit(
    note: LevelNote,
    absDiff: number,
    hitWindow: number,
    scoreScale = 1.0,
    customLabel?: string,
  ): void {
    const { judgment, precisionBonus, label } = this.evaluateTimingJudgment(absDiff, hitWindow);

    if (judgment === 'perfect') {
      this.perfectCount++;
      this.perfectChain++;
      if (this.perfectChain > this.maxPerfectChain) {
        this.maxPerfectChain = this.perfectChain;
      }
    } else {
      if (judgment === 'good') this.goodCount++;
      else this.okCount++;
      this.perfectChain = 0;
    }

    this.hits++;
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    const mult = this.getActiveMultiplier();
    this.multiplierSum += mult;
    this.multiplierSamples++;

    const basePts = (100 + precisionBonus) * scoreScale;
    const scoreDelta = Math.round(basePts * mult);
    this.score += scoreDelta;

    // Chord group completion tracking + synchronized multi-lane beam glow
    if (note.isChord) {
      const bucket = Math.round(note.time * 25);
      const prev = this.chordHitTracker.get(bucket);
      const nextCount = (prev?.count ?? 0) + 1;
      const minLane = prev ? Math.min(prev.minLane, note.lane) : note.lane;
      const maxLane = prev ? Math.max(prev.maxLane, note.lane) : note.lane;
      this.chordHitTracker.set(bucket, { count: nextCount, minLane, maxLane });
      if (nextCount === (note.chordGroupSize ?? 2)) {
        this.chordsHit++;
        this.spawnChordBeam(minLane, maxLane, this.feverActive ? _feverColorA : this.accentColor);
      }
    }

    // Fever charge accumulation
    const feverCfg = this.settings.generationConfig.mechanics.feverMode;
    if (feverCfg.enabled && !this.feverActive) {
      const gain =
        judgment === 'perfect'
          ? 0.045 + Math.min(0.025, this.perfectChain * 0.001)
          : judgment === 'good'
            ? 0.024
            : 0.012;
      this.feverCharge = Math.min(1, this.feverCharge + gain);
      if (this.feverCharge >= 1) {
        this.feverActive = true;
        this.feverRemainingSec = feverCfg.durationSec;
        this.feverActivations++;
        this.feverCharge = 0;
        audioEngine.playFeverActivateSound();
        this.cameraRig.triggerBeatPulse(0.9, false);
        this.cameraRig.triggerImpactZoom(0.85);
        this.spawnSurfaceWave(_feverColorA, -36, 0.25);
        for (let l = 0; l < this.trackLayout.laneCount; l++) {
          this.spawnLanePulse(l, l % 2 === 0 ? _feverColorA : _feverColorB, true, 32, 0.26);
        }
      }
    }

    const laneXPos = this.trackLayout.laneX[note.lane] ?? 0;
    const laneCol = this.getNoteDisplayColor(note);
    const hitStyle = note.customHitExplosion ?? 'sparks';

    if (hitStyle !== 'none') {
      const burstCount =
        hitStyle === 'ring'
          ? 3
          : hitStyle === 'burst'
            ? 22
            : hitStyle === 'neon_flame'
              ? 16
              : note.patternTag === 'burst'
                ? judgment === 'perfect'
                  ? 20
                  : 14
                : judgment === 'perfect'
                  ? 14
                  : 10;
      this.spawnBurst(laneXPos, 0.3, HIT_LINE_Z, laneCol, burstCount, false);

      this.spawnHitShockwave(
        laneXPos,
        laneCol,
        hitStyle === 'ring' || hitStyle === 'shockwave'
          ? 4.4
          : judgment === 'perfect'
            ? 3.8
            : 2.9,
        hitStyle === 'ring'
          ? 0.22
          : hitStyle === 'neon_flame'
            ? 0.72
            : judgment === 'perfect'
              ? 0.56
              : 0.4,
      );

      if (hitStyle === 'burst') {
        this.spawnSurfaceWave(laneCol, -32, 0.22);
      }
    }

    // Longitudinal pulse travelling up the struck lane
    this.spawnLanePulse(
      note.lane,
      laneCol,
      true,
      note.patternTag === 'burst' ? 36 : 28,
      note.patternTag === 'burst' ? 0.28 : 0.2,
    );

    // Rhythm Burst special energy wave & camera kick
    if (note.patternTag === 'burst') {
      this.spawnSurfaceWave(_burstColor, -34, 0.16);
      this.cameraRig.triggerImpactZoom(0.45);
    }

    // Subtle lateral / vertical / tilt camera accent on outer lanes, chords, or flicks
    const midIndex = (this.trackLayout.laneCount - 1) / 2;
    if (Math.abs(note.lane - midIndex) >= 1.1 && (note.intensity > 0.62 || note.kind === 'flick')) {
      this.cameraRig.triggerLateralAccent(note.lane < midIndex ? -1 : 1, note.intensity * 0.65);
    }
    if (note.eventType === 'drop' || note.isChord || note.intensity > 0.72) {
      this.cameraRig.triggerBeatPulse(note.intensity, note.eventType === 'drop');
    }

    if (this.settings.vibration && navigator.vibrate) {
      navigator.vibrate(judgment === 'perfect' ? 14 : 10);
    }

    const finalLabel =
      customLabel ??
      (this.settings.generationConfig.mechanics.perfectChain.enabled &&
      judgment === 'perfect' &&
      this.perfectChain >= 5 &&
      this.perfectChain % this.settings.generationConfig.mechanics.perfectChain.milestoneStep === 0
        ? `CHAIN x${this.perfectChain}!`
        : label);

    this.callbacks?.onJudgment(note, judgment, this.combo, scoreDelta, finalLabel);
  }

  private registerMiss(note: LevelNote, reasonLabel = 'MISS'): void {
    if (note.missed) return;
    note.missed = true;
    this.misses++;
    this.combo = 0;
    this.perfectChain = 0;
    if (!this.feverActive) {
      this.feverCharge = Math.max(0, this.feverCharge - 0.08);
    }

    const laneIdx = Math.max(0, Math.min(this.trackLayout.laneCount - 1, note.lane));
    this.laneMissFlash[laneIdx] = 1.0;
    this.missWaveLife = 1.0;
    this.missWaveRing.position.set(this.trackLayout.laneX[laneIdx], 0.07, HIT_LINE_Z + 0.25);
    this.spawnBurst(
      this.trackLayout.laneX[laneIdx],
      0.26,
      HIT_LINE_Z + 0.35,
      _missColor,
      12,
      true,
    );
    this.cameraRig.triggerShake(0.35);
    audioEngine.playMissSound();
    if (this.settings.vibration && navigator.vibrate) {
      navigator.vibrate([30, 20, 30]);
    }

    this.callbacks?.onMiss(note, this.misses, reasonLabel);

    const maxAllowed = this.activeLevel?.maxMisses ?? 3;
    if (maxAllowed < 999 && this.misses >= maxAllowed) {
      this.triggerDefeatEffect();
      this.callbacks?.onDefeat();
    }
  }

  public handleLaneInput(lane: number): void {
    if (lane < 0 || lane >= this.trackLayout.laneCount) return;
    this.heldLanes[lane] = true;
    this.activePointerLane = lane;
    this.laneFlash[lane] = 1.0;

    if (this.mode !== 'playing' || !this.activeLevel) return;

    const currentTime = this.getGameplayCurrentTime();
    let bestNote: LevelNote | null = null;
    let bestAbsDiff = Infinity;
    let bestWindow = this.activeLevel.hitWindowSec;

    for (let i = this.nextSearchIdx; i < this.activeLevel.notes.length; i++) {
      const note = this.activeLevel.notes[i];
      const hw = this.getNoteHitWindow(note);
      if (note.time - currentTime > hw) break;
      if (note.hit || note.missed) continue;
      if (note.lane !== lane) continue;

      const diff = Math.abs(note.time - currentTime);
      if (diff <= hw && diff < bestAbsDiff) {
        bestAbsDiff = diff;
        bestNote = note;
        bestWindow = hw;
      }
    }

    if (!bestNote) return;

    // Flick notes wait for directional swipe (or keyboard flick trigger) unless user already swiped
    if (bestNote.kind === 'flick') {
      return;
    }

    bestNote.hit = true;

    if (bestNote.kind === 'hold' && bestNote.durationSec) {
      this.activeHolds.set(bestNote.id, {
        note: bestNote,
        startTime: currentTime,
        endTime: bestNote.time + bestNote.durationSec,
        lastTickTime: currentTime,
        pointsAccumulated: 0,
      });
      this.applySuccessHit(bestNote, bestAbsDiff, bestWindow, 0.75);
      return;
    }

    if (bestNote.kind === 'slide' && bestNote.slidePath && bestNote.durationSec) {
      this.activeSlides.set(bestNote.id, {
        note: bestNote,
        startTime: currentTime,
        endTime: bestNote.time + bestNote.durationSec,
        lastTickTime: currentTime,
        offPathSec: 0,
        lastPlayedLane: lane,
      });
      this.applySuccessHit(bestNote, bestAbsDiff, bestWindow, 0.75);
      return;
    }

    this.applySuccessHit(bestNote, bestAbsDiff, bestWindow, bestNote.isChord ? 1.15 : 1.0);
  }

  public handleLaneRelease(lane: number): void {
    if (lane < 0 || lane >= this.trackLayout.laneCount) return;
    this.heldLanes[lane] = false;

    if (this.mode !== 'playing' || !this.activeLevel) return;
    const currentTime = this.getGameplayCurrentTime();
    const earlyPenalty = this.settings.generationConfig.mechanics.earlyReleasePenalty;

    for (const [id, hold] of this.activeHolds.entries()) {
      if (hold.note.lane !== lane) continue;
      const totalDur = Math.max(0.15, hold.endTime - hold.note.time);
      const heldRatio = THREE.MathUtils.clamp((currentTime - hold.note.time) / totalDur, 0, 1);
      this.activeHolds.delete(id);

      if (heldRatio >= 0.78) {
        this.holdsCompleted++;
        const bonus = Math.round(95 * this.getActiveMultiplier());
        this.score += bonus;
        const laneCol = this.getNoteDisplayColor(hold.note);
        this.spawnHitShockwave(this.trackLayout.laneX[lane], laneCol, 3.6, 0.55);
        this.spawnLanePulse(lane, laneCol, true, 32, 0.26);
        this.spawnBurst(
          this.trackLayout.laneX[lane],
          0.32,
          HIT_LINE_Z,
          laneCol,
          12,
          false,
        );
      } else {
        this.holdsBroken++;
        if (earlyPenalty === 'miss' || heldRatio < 0.25) {
          this.registerMiss(hold.note, 'SOLTADO');
        } else {
          this.perfectChain = 0;
          const partial = Math.round(45 * heldRatio);
          this.score += partial;
        }
      }
    }
  }

  public handleLaneSlideMove(toLane: number): void {
    if (toLane < 0 || toLane >= this.trackLayout.laneCount) return;
    this.activePointerLane = toLane;
    this.laneFlash[toLane] = Math.max(this.laneFlash[toLane], 0.68);
  }

  public handleLaneFlick(lane: number, dir: FlickDirection): void {
    if (lane < 0 || lane >= this.trackLayout.laneCount) return;
    this.laneFlash[lane] = 1.0;

    if (this.mode !== 'playing' || !this.activeLevel) return;
    const currentTime = this.getGameplayCurrentTime();

    let bestNote: LevelNote | null = null;
    let bestAbsDiff = Infinity;
    let bestWindow = this.activeLevel.hitWindowSec;

    for (let i = this.nextSearchIdx; i < this.activeLevel.notes.length; i++) {
      const note = this.activeLevel.notes[i];
      const hw = this.getNoteHitWindow(note) * 1.15;
      if (note.time - currentTime > hw) break;
      if (note.hit || note.missed || note.kind !== 'flick') continue;
      if (Math.abs(note.lane - lane) > 1) continue;

      const diff = Math.abs(note.time - currentTime);
      if (diff <= hw && diff < bestAbsDiff) {
        bestAbsDiff = diff;
        bestNote = note;
        bestWindow = hw;
      }
    }

    if (!bestNote) return;

    const expected = bestNote.flickDir ?? 'up';
    const matchesDir =
      dir === expected ||
      (expected === 'up' && (dir === 'up' || dir === 'left' || dir === 'right'));

    bestNote.hit = true;
    this.flicksHit++;
    const accentDir: -1 | 1 =
      dir === 'left'
        ? -1
        : dir === 'right'
          ? 1
          : bestNote.lane < this.trackLayout.laneCount / 2
            ? -1
            : 1;
    this.cameraRig.triggerLateralAccent(accentDir, 0.9);

    // Sweeping directional Flick flare across adjacent lane
    const sweepLane = Math.max(
      0,
      Math.min(this.trackLayout.laneCount - 1, bestNote.lane + (dir === 'left' ? -1 : dir === 'right' ? 1 : 0)),
    );
    this.laneFlash[sweepLane] = Math.max(this.laneFlash[sweepLane], 0.88);
    this.spawnLanePulse(bestNote.lane, this.noteAccentColor, true, 38, 0.28);

    this.applySuccessHit(
      bestNote,
      matchesDir ? bestAbsDiff : bestWindow * 0.72,
      bestWindow,
      matchesDir ? 1.35 : 0.9,
      matchesDir ? 'FLICK!' : 'GOOD',
    );
  }

  private getExpectedSlideLane(note: LevelNote, currentTime: number): number {
    const path = note.slidePath;
    if (!path || path.length === 0) return note.lane;
    const elapsed = Math.max(0, currentTime - note.time);
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      if (elapsed <= b.timeOffset) {
        const span = Math.max(0.001, b.timeOffset - a.timeOffset);
        const t = THREE.MathUtils.clamp((elapsed - a.timeOffset) / span, 0, 1);
        return THREE.MathUtils.lerp(a.lane, b.lane, t);
      }
    }
    return path[path.length - 1].lane;
  }

  private getNoteDisplayColor(note: LevelNote): THREE.Color {
    if (this.feverActive) {
      return note.lane % 2 === 0 ? _feverColorA : _feverColorB;
    }
    if (note.customColor) {
      _customColorA.set(note.customColor);
      if (note.customSecondaryColor && note.customColorComboMode && note.customColorComboMode !== 'solid') {
        _customColorB.set(note.customSecondaryColor);
        if (note.customColorComboMode === 'alternating') {
          return note.id % 2 === 0 ? _customColorA : _customColorB;
        }
        if (note.customColorComboMode === 'gradient') {
          const blend = 0.5 + 0.5 * Math.sin(this.clock.elapsedTime * 3.2 + note.id * 0.6);
          return _customColorA.lerp(_customColorB, blend);
        }
        return _customColorA.lerp(_customColorB, note.lane % 2 === 0 ? 0.25 : 0.75);
      }
      return _customColorA;
    }
    const worldTheme = this.envManager?.getCurrentTheme() ?? 'cyberpunk';
    return resolveNoteColor(
      note.id,
      note.lane,
      note.kind,
      this.chromaticColA,
      this.chromaticColB,
      this.chromaticColAccent,
      worldTheme,
    );
  }

  private spawnHitShockwave(
    x: number,
    color: THREE.Color,
    expandScale = 3.4,
    flarePeak = 0.5,
  ): void {
    if (this.settings.visualsConfig?.reducedFlash) {
      flarePeak *= 0.45;
    }
    for (let i = 0; i < this.shockwavePool.length; i++) {
      const s = this.shockwavePool[i];
      if (s.active) continue;
      s.active = true;
      s.life = 0;
      s.maxLife = 0.38;
      s.expandScale = expandScale;
      s.flarePeak = flarePeak;
      s.ring.position.set(x, 0.068, HIT_LINE_Z);
      s.ring.scale.setScalar(0.85);
      s.ringMat.color.copy(color);
      s.ringMat.opacity = 0.55;
      s.ring.visible = true;

      s.flare.position.set(x, 0.062, HIT_LINE_Z);
      s.flare.scale.setScalar(0.75);
      s.flareMat.color.copy(color);
      s.flareMat.opacity = flarePeak;
      s.flare.visible = true;

      s.flame.position.set(x, 0.24, HIT_LINE_Z - 0.85);
      s.flame.scale.set(0.95, 0.72, 1);
      // Warm vibrant amber-gold flame tinted subtly with note color
      s.flameMat.color.copy(_victoryGoldColor).lerp(color, 0.32);
      s.flameMat.opacity = this.settings.visualsConfig?.reducedFlash ? 0.28 : 0.74;
      s.flame.visible = this.getEffectiveQuality() !== 'low';
      return;
    }
  }

  private spawnLanePulse(
    lane: number,
    color: THREE.Color,
    upwardFromHitLine: boolean,
    speedZ = 28,
    maxOpacity = 0.22,
  ): void {
    const perfMode = this.settings.performanceConfig?.performanceMode ?? 'quality';
    if (perfMode === 'battery' && Math.random() > 0.55) return;
    if (this.settings.visualsConfig?.reducedFlash) {
      maxOpacity *= 0.45;
    }

    const safeLane = Math.max(0, Math.min(this.trackLayout.laneCount - 1, lane));
    const laneXPos = this.trackLayout.laneX[safeLane] ?? 0;

    for (let i = 0; i < this.lanePulsePool.length; i++) {
      const p = this.lanePulsePool[i];
      if (p.active) continue;
      p.active = true;
      p.lane = safeLane;
      p.life = 0;
      p.maxLife = upwardFromHitLine ? 0.72 : 1.05;
      p.z = upwardFromHitLine ? HIT_LINE_Z - 0.5 : SPAWN_Z + 2;
      p.speedZ = upwardFromHitLine ? -Math.abs(speedZ) : Math.abs(speedZ);
      p.maxOpacity = maxOpacity;
      p.mat.color.copy(color);
      p.mat.opacity = maxOpacity;
      p.mesh.position.set(laneXPos, 0.029, p.z);
      p.mesh.visible = true;
      return;
    }
  }

  private spawnSurfaceWave(
    color: THREE.Color,
    speedZ = -34,
    maxOpacity = 0.18,
  ): void {
    if (this.settings.visualsConfig?.reducedFlash) {
      maxOpacity *= 0.45;
    }
    for (let i = 0; i < this.surfaceWavePool.length; i++) {
      const w = this.surfaceWavePool[i];
      if (w.active) continue;
      w.active = true;
      w.life = 0;
      w.maxLife = 1.05;
      w.z = speedZ < 0 ? HIT_LINE_Z : SPAWN_Z;
      w.speedZ = speedZ;
      w.maxOpacity = maxOpacity;
      w.mat.color.copy(color);
      w.mat.opacity = maxOpacity;
      w.mesh.position.set(0, 0.031, w.z);
      w.mesh.visible = true;
      return;
    }
  }

  private spawnChordBeam(minLane: number, maxLane: number, color: THREE.Color): void {
    const x1 = this.trackLayout.laneX[minLane] ?? 0;
    const x2 = this.trackLayout.laneX[maxLane] ?? 0;
    const span = Math.abs(x2 - x1);
    if (span < 0.2) return;

    for (let i = 0; i < this.chordBeamPool.length; i++) {
      const b = this.chordBeamPool[i];
      if (b.active) continue;
      b.active = true;
      b.life = 0;
      b.maxLife = 0.28;
      b.mat.color.copy(color);
      b.mat.opacity = this.settings.visualsConfig?.reducedFlash ? 0.35 : 0.68;
      b.mesh.position.set((x1 + x2) * 0.5, 0.072, HIT_LINE_Z);
      b.mesh.scale.set(span + 0.6, 1.4, 1);
      b.mesh.visible = true;
      return;
    }
  }

  private getActiveParticleBudget(): number {
    const perfMode = this.settings.performanceConfig?.performanceMode ?? 'quality';
    if (perfMode === 'battery' || this.settings.graphicsQuality === 'low') return 72;
    if (perfMode === 'balanced' || this.settings.graphicsQuality === 'medium') return 130;
    return this.MAX_BURST_PARTICLES;
  }

  private spawnBurst(
    x: number,
    y: number,
    z: number,
    color: THREE.Color,
    count: number,
    downwardMiss: boolean,
  ): void {
    const partScale =
      (this.settings.particleIntensity === 'low'
        ? 0.4
        : this.settings.particleIntensity === 'medium'
          ? 0.72
          : 1.0) * (this.settings.visualsConfig?.particleIntensityValue ?? 1.0);
    const actualCount = Math.max(2, Math.round(count * partScale));
    const budget = this.getActiveParticleBudget();

    let spawned = 0;
    for (let i = 0; i < budget && spawned < actualCount; i++) {
      const p = this.particles[i];
      if (p.active) continue;
      p.active = true;
      p.pos.set(x + (Math.random() - 0.5) * 0.45, y, z + (Math.random() - 0.5) * 0.25);
      p.vel.set(
        (Math.random() - 0.5) * (downwardMiss ? 6.5 : 5.2),
        downwardMiss ? 0.5 + Math.random() * 1.6 : 2.2 + Math.random() * 4.8,
        (Math.random() - 0.5) * 4.2,
      );
      p.life = 0;
      p.maxLife = downwardMiss ? 0.32 + Math.random() * 0.16 : 0.38 + Math.random() * 0.24;
      p.size = (downwardMiss ? 0.85 : 0.75) + Math.random() * 0.85;
      p.color.copy(color);
      spawned++;
      this.hasActiveParticles = true;
    }
  }

  private isTimeInProfileSilence(time: number): boolean {
    if (!this.activeProfile) return false;
    for (const r of this.activeProfile.silenceRanges) {
      if (time >= r.start && time <= r.end) return true;
    }
    return false;
  }

  private getSectionAtTime(time: number): MusicalSectionType {
    if (!this.activeProfile?.sections) return 'groove';
    for (const sec of this.activeProfile.sections) {
      if (time >= sec.start && time <= sec.end) return sec.type;
    }
    return 'groove';
  }

  private handleVisibilityChange = (): void => {
    this.isDocumentHidden =
      typeof document !== 'undefined' && document.visibilityState === 'hidden';
    this.syncLoopState();
  };

  private stopLoop(): void {
    this.loopRunning = false;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.frameId = 0;
  }

  private syncLoopState(): void {
    if (this.disposed) return;
    const shouldPauseCompletely = this.suspended || this.isDocumentHidden;
    if (shouldPauseCompletely) {
      this.stopLoop();
      return;
    }
    if (!this.loopRunning) {
      this.clock.getDelta();
      this.lastRenderTimeMs = 0;
      this.accumulatedMenuDt = 0;
      this.startLoop();
    }
  }

  private getTargetFrameIntervalMs(): number {
    if (this.renderContext === 'gameplay' || this.renderContext === 'playtest') {
      return 0; // Full native vsync for rhythm gameplay & playtest
    }
    if (this.renderContext === 'paused') {
      return this.mode === 'ended' ? 50 : 250;
    }
    // Menu idle pacing: ~30fps (~22fps in low/battery) cuts idle GPU load by 50-75%
    const effQuality = this.getEffectiveQuality();
    if (effQuality === 'low' || this.settings.performanceConfig?.performanceMode === 'battery') {
      return 44;
    }
    return this.isMobileGpu ? 34 : 32;
  }

  private renderSceneFrame(): void {
    const effQuality = this.getEffectiveQuality();
    const useComposer =
      !this.isSoftwareGl &&
      Boolean(this.composer) &&
      Boolean(this.bloomPass?.enabled) &&
      effQuality !== 'low';
    if (useComposer && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.cameraRig.camera);
    }
  }

  private startLoop(): void {
    if (this.loopRunning || this.disposed) return;
    this.loopRunning = true;

    const tick = (nowMs: number) => {
      if (this.disposed || !this.loopRunning) return;
      if (this.suspended || this.isDocumentHidden) {
        this.stopLoop();
        return;
      }

      const rawDt = this.clock.getDelta();

      // When paused (and not playing defeat/victory outro), render one settled frame then stop burning GPU
      if (this.renderContext === 'paused' && this.mode === 'paused') {
        if (!this.pauseRenderDone) {
          this.pauseRenderDone = true;
          this.update(0, 0);
          this.renderSceneFrame();
        }
        this.stopLoop();
        return;
      }

      const minIntervalMs = this.getTargetFrameIntervalMs();
      if (minIntervalMs > 0) {
        this.accumulatedMenuDt += rawDt;
        if (this.lastRenderTimeMs > 0 && nowMs - this.lastRenderTimeMs < minIntervalMs) {
          this.frameId = requestAnimationFrame(tick);
          return;
        }
        const stepDt = Math.min(this.accumulatedMenuDt || rawDt, 0.08);
        this.accumulatedMenuDt = 0;
        this.lastRenderTimeMs = nowMs;
        this.update(stepDt, stepDt);
      } else {
        const dt = Math.min(rawDt, 0.05);
        this.lastRenderTimeMs = nowMs;
        this.update(dt, rawDt);
      }

      this.renderSceneFrame();

      if (this.isSoftwareGl) {
        this.afterDraw(() => tick(performance.now()));
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    this.frameId = requestAnimationFrame(tick);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed || !this.loopRunning) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  
  private updateChromaticProgression(
    dt: number,
    beatPulse: number,
  ): void {
    const visualConfig = this.settings.visualsConfig;

    const dynamicPalette = this.chromaticEngine.update({
      basePalette: this.currentPalette,
      worldTheme: this.envManager?.getCurrentTheme(),
      section: this.currentSection,
      energy: this.smoothedEnergy,
      beatPulse,
      elapsed: this.clock.elapsedTime,
      bpm: this.activeProfile?.bpm ?? 120,
      dt,
      intensity: visualConfig?.glowIntensity ?? 1.0,
      flashIntensity: visualConfig?.flashIntensity ?? 0.65,
      reducedFlash: Boolean(visualConfig?.reducedFlash),
      screenEffects: visualConfig?.screenEffects !== false,
      feverActive: this.feverActive,
      brightnessScale: this.getEffectiveBrightness(),
    });

    this.chromaticColA.set(dynamicPalette.primary);
    this.chromaticColB.set(dynamicPalette.secondary);
    this.chromaticColAccent.set(dynamicPalette.accent);

    // Keep the scene's main color references synchronized.
    this.primaryColor.copy(this.chromaticColA);
    this.secondaryColor.copy(this.chromaticColB);
    this.accentColor.copy(this.chromaticColAccent);

    // Dynamic lane strips and edges.
    for (let i = 0; i < this.trackLayout.laneCount; i++) {
      const laneColor =
        i % 2 === 0
          ? this.chromaticColA
          : this.chromaticColB;

      if (this.laneStripMeshes[i]) {
        const material = this.laneStripMeshes[i]
          .material as THREE.MeshBasicMaterial;

        material.color.copy(laneColor);
      }

      if (this.laneEdgeMats[i]) {
        this.laneEdgeMats[i][0].color.copy(laneColor);
        this.laneEdgeMats[i][1].color.copy(laneColor);
      }
    }

    // Dynamic divider colors.
    this.dividerMats.forEach((material, index) => {
      const color =
        index === Math.floor(this.dividerMats.length / 2)
          ? this.chromaticColAccent
          : index % 2 === 0
            ? this.chromaticColA
            : this.chromaticColB;

      material.color.copy(color);
      material.emissive.copy(color);
    });

    // Hit line follows the song palette without changing note colors.
    if (this.hitLineMat) {
      this.hitLineMat.emissive.copy(this.chromaticColA);
    }
  }

  private update(dt: number, rawDt = dt): void {
    // Adaptive FPS scaling with hysteresis when performanceMode === 'auto' (measured only during active gameplay/playtest)
    if (
      this.settings.performanceConfig?.performanceMode === 'auto' &&
      !this.isSoftwareGl &&
      (this.renderContext === 'gameplay' || this.renderContext === 'playtest') &&
      this.mode === 'playing' &&
      rawDt > 0
    ) {
      this.perfFrameAccum += rawDt;
      this.perfFrameSamples++;
      if (this.perfFrameSamples >= 24) {
        const avgDt = this.perfFrameAccum / this.perfFrameSamples;
        this.perfFrameAccum = 0;
        this.perfFrameSamples = 0;
        const nowMs = performance.now();
        const prevEff = this.autoPerfLevel;
        if (avgDt > 0.038) {
          this.autoPerfLevel = 'low';
        } else if (avgDt > 0.024) {
          this.autoPerfLevel = this.autoPerfLevel === 'high' ? 'medium' : 'low';
        } else if (avgDt < 0.0155 && nowMs - this.lastPerfScaleChangeMs > 8000) {
          this.autoPerfLevel = this.autoPerfLevel === 'low' ? 'medium' : 'high';
        }
        if (this.autoPerfLevel !== prevEff) {
          this.lastPerfScaleChangeMs = nowMs;
          this.applyQualityPixelRatio();
          this.syncBloomSettings();
        }
      }
    }

    const audioCfg = this.settings.audioReactionConfig;
    const menuCfg = this.settings.menuAmbientConfig;
    const menuVisualMult =
      menuCfg?.visualIntensity === 'low' ? 0.55 : menuCfg?.visualIntensity === 'high' ? 1.18 : 0.88;

    if (this.creatorPlaytestActive && this.creatorVirtualClockEnabled && this.mode === 'playing') {
      this.creatorVirtualTimeSec += dt * this.creatorSpeedScale;
    }

    const rawMenuBands =
      this.mode === 'idle' ? menuAmbientAudio.getAmbientBands(this.clock.elapsedTime) : null;

    const audioState = rawMenuBands
      ? {
          subBass: rawMenuBands.subBass * menuVisualMult,
          bass: rawMenuBands.bass * menuVisualMult,
          lowMid: rawMenuBands.lowMid * menuVisualMult,
          mid: rawMenuBands.mid * menuVisualMult,
          highMid: rawMenuBands.highMid * menuVisualMult,
          treble: rawMenuBands.treble * menuVisualMult,
          high: (rawMenuBands.highMid + rawMenuBands.treble) * 0.5 * menuVisualMult,
          energy: rawMenuBands.energy * menuVisualMult,
          currentTime: 0,
          isPlaying: false,
        }
      : this.creatorPlaytestActive && this.creatorVirtualClockEnabled
        ? (() => {
            const bpm = this.activeLevel?.bpm ?? 124;
            const phase = ((this.creatorVirtualTimeSec * bpm) / 60) % 1;
            const kick = phase < 0.16 ? 0.78 : 0.18;
            return {
              subBass: kick,
              bass: kick * 0.9,
              lowMid: 0.28,
              mid: 0.34,
              highMid: phase > 0.45 && phase < 0.65 ? 0.62 : 0.2,
              treble: 0.24,
              high: 0.28,
              energy: 0.32 + kick * 0.35,
              currentTime: this.creatorVirtualTimeSec,
              isPlaying: this.mode === 'playing',
            };
          })()
        : audioEngine.getRealtimeAudioState(audioCfg?.frequencySensitivity ?? 1.0);

    const reactive = this.settings.reactiveVisuals;
    const reactMult = audioCfg?.reactionIntensity ?? 1.0;
    const visMult =
      (this.settings.visualIntensity === 'low'
        ? 0.5
        : this.settings.visualIntensity === 'medium'
          ? 0.82
          : 1.15) * reactMult;

    // 6-band frequency smoothing
    this.smoothedSubBass = THREE.MathUtils.damp(
      this.smoothedSubBass,
      audioState.subBass * (audioCfg?.subBassWeight ?? 1.0),
      10,
      dt,
    );
    this.smoothedBass = THREE.MathUtils.damp(
      this.smoothedBass,
      audioState.bass * (audioCfg?.bassWeight ?? 1.15),
      14,
      dt,
    );
    this.smoothedLowMid = THREE.MathUtils.damp(this.smoothedLowMid, audioState.lowMid, 14, dt);
    this.smoothedMid = THREE.MathUtils.damp(
      this.smoothedMid,
      audioState.mid * (audioCfg?.midWeight ?? 1.0),
      14,
      dt,
    );
    this.smoothedHighMid = THREE.MathUtils.damp(
      this.smoothedHighMid,
      audioState.highMid * (audioCfg?.highMidWeight ?? 1.0),
      16,
      dt,
    );
    this.smoothedTreble = THREE.MathUtils.damp(
      this.smoothedTreble,
      audioState.treble * (audioCfg?.trebleWeight ?? 1.05),
      18,
      dt,
    );
    this.smoothedHigh = THREE.MathUtils.damp(this.smoothedHigh, audioState.high, 15, dt);
    this.smoothedEnergy = THREE.MathUtils.damp(this.smoothedEnergy, audioState.energy, 12, dt);

    // Fast low-latency separated Kick / Snare / Hi-Hat reactive lighting module
    const rawBass = audioState.bass;
    const bassTransient = Math.max(0, rawBass - this.prevRawBass);
    this.prevRawBass = rawBass;
    this.bassTransientCooldown = Math.max(0, this.bassTransientCooldown - dt);

    const inSilence =
      this.mode === 'playing' && this.isTimeInProfileSilence(audioState.currentTime);
    const silenceDamp = inSilence ? 0.3 : 1.0;

    this.reactiveLighting.updateSettings({
      intensity: reactMult,
      frequency: audioCfg?.frequencySensitivity ?? 1.0,
      exposure: 0.88 * this.getEffectiveBrightness(),
      bloomIntensity: this.settings.visualsConfig?.bloomIntensity ?? 0.44,
    });
    const reactOut = this.reactiveLighting.step(
      dt,
      audioState,
      this.currentSection,
      inSilence,
      reactive,
    );
    this.kickPulse = reactOut.kickPulse;
    this.snarePulse = reactOut.snarePulse;
    this.hihatPulse = reactOut.hihatPulse;

    if (
      this.mode === 'playing' &&
      reactive &&
      !inSilence &&
      bassTransient > 0.14 &&
      this.bassTransientCooldown <= 0
    ) {
      this.bassTransientCooldown = 0.24;
      this.cameraRig.triggerImpactZoom(Math.min(0.85, bassTransient * 2.4));
      this.spawnSurfaceWave(
        this.feverActive ? _feverColorA : this.primaryColor,
        32,
        0.15,
      );
    }

    const prevSec = this.prevSection;
    if (this.mode === 'playing') {
      this.currentSection = this.getSectionAtTime(audioState.currentTime);
    } else {
      this.currentSection = 'groove';
    }
    this.prevSection = this.currentSection;

    if (this.mode === 'playing' && prevSec !== this.currentSection && this.currentSection === 'drop') {
      this.cameraRig.triggerDropTransition();
      audioEngine.playDropImpactSound();
      this.dropScreenPulse = 1.0;
      this.spawnSurfaceWave(
        this.feverActive ? _feverColorA : this.secondaryColor,
        -38,
        0.24,
      );
      for (let l = 0; l < this.trackLayout.laneCount; l++) {
        this.spawnLanePulse(
          l,
          l % 2 === 0 ? this.primaryColor : this.secondaryColor,
          true,
          34,
          0.22,
        );
      }
    }

    // Update Fever timer
    if (this.mode === 'playing' && this.feverActive) {
      this.feverRemainingSec = Math.max(0, this.feverRemainingSec - dt);
      if (this.feverRemainingSec <= 0) {
        this.feverActive = false;
      }
    }

    // Beat / Drop anticipation & impact triggers from audio analysis
    if (this.mode === 'playing' && this.activeProfile && audioCfg?.beatDetectionEnabled !== false) {
      const beats = this.activeProfile.beats;
      while (this.nextBeatIdx < beats.length && beats[this.nextBeatIdx] <= audioState.currentTime) {
        if (audioState.currentTime - beats[this.nextBeatIdx] < 0.08) {
          this.cameraRig.triggerBeatPulse(0.32 + this.smoothedBass * 0.35, false);
          if (reactive && !inSilence) {
            const pulseLane = this.nextBeatIdx % this.trackLayout.laneCount;
            this.spawnLanePulse(
              pulseLane,
              pulseLane % 2 === 0 ? this.primaryColor : this.secondaryColor,
              false,
              26,
              0.14,
            );
            if (this.nextBeatIdx % 2 === 0) {
              this.spawnSurfaceWave(
                this.feverActive ? _feverColorA : this.accentColor,
                28,
                0.12,
              );
            }
          }
        }
        this.nextBeatIdx++;
      }

      const drops = this.activeProfile.drops ?? [];
      while (this.nextDropIdx < drops.length && drops[this.nextDropIdx] < audioState.currentTime - 0.1) {
        this.nextDropIdx++;
      }
      if (this.nextDropIdx < drops.length) {
        const distToDrop = drops[this.nextDropIdx] - audioState.currentTime;
        if (distToDrop > 0 && distToDrop < 2.2) {
          // Pre-drop punch-in anticipation!
          this.cameraRig.setPreDropTension(1 - distToDrop / 2.2);
        } else if (distToDrop <= 0 && distToDrop > -0.1) {
          this.cameraRig.triggerBeatPulse(1.0, true);
          audioEngine.playDropImpactSound();
          this.dropScreenPulse = 1.0;
          this.spawnSurfaceWave(
            this.feverActive ? _feverColorA : this.secondaryColor,
            -38,
            0.25,
          );
          this.nextDropIdx++;
        } else {
          this.cameraRig.setPreDropTension(0);
        }
      }
    }

    this.dropScreenPulse = Math.max(0, this.dropScreenPulse - dt * 2.4);

    // Scroll circuit track
    const scrollSpeed =
      this.mode === 'playing' && this.activeLevel
        ? this.activeLevel.noteSpeed * 0.145 * (inSilence ? 0.75 : 1.0)
        : this.mode === 'idle'
          ? 1.85 * menuVisualMult
          : 0;
    this.roadScrollOffset = (this.roadScrollOffset + scrollSpeed * dt) % 1;
    this.roadAlbedoTex.offset.y = -this.roadScrollOffset;
    this.roadRoughTex.offset.y = -this.roadScrollOffset;

    const brightScale = this.getEffectiveBrightness();
    const glowScale =
      (this.settings.visualsConfig?.glowIntensity ?? 1.0) *
      getPresetById(this.settings.visualsConfig?.preset ?? 'auto').glowScale;
    const sideBrightScale = this.settings.visualsConfig?.sideBrightness ?? 0.85;
    const reducedFlashScale = this.settings.visualsConfig?.reducedFlash ? 0.52 : 1.0;
    const effQuality = this.getEffectiveQuality();

    this.updateChromaticProgression(dt, this.smoothedBass);

    // Update active dynamic 3D world environment with full 6-band DSP + separated rhythmic pulses
    this.envManager.update({
      dt,
      elapsed: this.clock.elapsedTime,
      mode: this.mode,
      subBass: this.smoothedSubBass,
      bass: this.smoothedBass,
      lowMid: this.smoothedLowMid,
      mid: this.smoothedMid,
      highMid: this.smoothedHighMid,
      treble: this.smoothedTreble,
      high: this.smoothedHigh,
      energy: this.smoothedEnergy,
      inSilence,
      reactiveEnabled: reactive,
      visualIntensity: this.settings.visualIntensity,
      particleIntensity: this.settings.particleIntensity,
      graphicsQuality: effQuality,
      reflectionQuality: this.settings.reflectionQuality,
      brightness: brightScale * sideBrightScale * (this.mode === 'idle' ? menuVisualMult : 1),
      sectionType: this.currentSection,
      beatPulse: this.dropScreenPulse,
      kickPulse: reactive && !inSilence ? this.kickPulse : 0,
      snarePulse: reactive && !inSilence ? this.snarePulse : 0,
      hihatPulse: reactive && !inSilence ? this.hihatPulse : 0,
      dropFlash: this.dropScreenPulse,
      isMenu: this.isMenuMode,
      menuAmbientEffects: menuCfg?.ambientEffectsEnabled !== false,
      chromaticA: this.chromaticColA,
      chromaticB: this.chromaticColB,
      chromaticAccent: this.chromaticColAccent,
    });

    // 6-Band Frequency-Reactive Scene Lighting (clamped to preserve dark track & crisp note contrast):
    // SubBass -> Fog depth & Horizon ambient + under-deck conduits
    // Bass -> Side rails & left key neon
    // LowMid / Mid -> Right key neon & mid ambience
    // HighMid / Treble -> Lane borders, Hit line shimmer & fine particle sparkles
    const subPulse = reactive ? this.smoothedSubBass * visMult * silenceDamp : 0.12;
    const bassPulse = reactive ? this.smoothedBass * visMult * silenceDamp : 0.18;
    const lowMidPulse = reactive ? this.smoothedLowMid * visMult * silenceDamp : 0.14;
    const midPulse = reactive ? this.smoothedMid * visMult * silenceDamp : 0.16;
    const highMidPulse = reactive ? this.smoothedHighMid * visMult * silenceDamp : 0.1;
    const treblePulse = reactive ? this.smoothedTreble * visMult * silenceDamp : 0.08;
    const feverBoost = this.feverActive ? 1.24 : 1.0;

    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = THREE.MathUtils.clamp(
        this.baseFogDensity * (1 - subPulse * 0.14),
        0.006,
        0.03,
      );
    }

    this.hemiLight.intensity = Math.min(1.0, (0.48 + subPulse * 0.16) * brightScale);
    this.dirLight.intensity = Math.min(1.3, 0.95 * brightScale);
    this.leftNeonLight.color.copy(this.chromaticColA);
    this.rightNeonLight.color.copy(this.chromaticColB);
    this.horizonLight.color.copy(this.chromaticColAccent);

    this.leftNeonLight.intensity = Math.min(
      3.4,
      (1.05 + bassPulse * 1.35) * brightScale * feverBoost * sideBrightScale,
    );
    this.rightNeonLight.intensity = Math.min(
      3.4,
      (1.05 + midPulse * 1.35) * brightScale * feverBoost * sideBrightScale,
    );
    this.horizonLight.intensity = Math.min(
      4.2,
      (1.75 + (subPulse + bassPulse + midPulse) * 0.85) * brightScale * feverBoost,
    );

    if (this.sideRailMats[0]) {
      this.sideRailMats[0].emissiveIntensity = Math.min(
        1.15,
        (0.36 + bassPulse * 0.3 + this.kickPulse * 0.28) *
          brightScale *
          glowScale *
          sideBrightScale *
          reducedFlashScale,
      );
      if (this.feverActive) this.sideRailMats[0].emissive.copy(_feverColorA);
      else this.sideRailMats[0].emissive.copy(this.chromaticColA);
    }
    if (this.sideRailMats[1]) {
      this.sideRailMats[1].emissiveIntensity = Math.min(
        1.15,
        (0.36 + midPulse * 0.3 + this.kickPulse * 0.28) *
          brightScale *
          glowScale *
          sideBrightScale *
          reducedFlashScale,
      );
      if (this.feverActive) this.sideRailMats[1].emissive.copy(_feverColorB);
      else this.sideRailMats[1].emissive.copy(this.chromaticColB);
    }
    if (this.railBracketMats[0]) {
      this.railBracketMats[0].emissive.copy(this.chromaticColA);
      this.railBracketMats[0].emissiveIntensity = Math.min(
        1.05,
        (0.24 + lowMidPulse * 0.32 + this.snarePulse * 0.42) *
          brightScale *
          glowScale *
          reducedFlashScale,
      );
    }
    if (this.railBracketMats[1]) {
      this.railBracketMats[1].emissive.copy(this.chromaticColB);
      this.railBracketMats[1].emissiveIntensity = Math.min(
        1.05,
        (0.24 + highMidPulse * 0.32 + this.hihatPulse * 0.38) *
          brightScale *
          glowScale *
          reducedFlashScale,
      );
    }
    this.underDeckConduitMats.forEach((m, idx) => {
      m.color.copy(
        idx === 1 ? this.chromaticColAccent : idx === 0 ? this.chromaticColA : this.chromaticColB,
      );
      m.opacity = THREE.MathUtils.clamp(
        (0.34 + subPulse * 0.38) * brightScale * reducedFlashScale,
        0.2,
        0.85,
      );
    });
    this.dividerMats.forEach((m) => {
      m.emissiveIntensity = Math.min(
        0.85,
        (0.3 + highMidPulse * 0.18) * brightScale * glowScale * reducedFlashScale,
      );
    });

    // Spawn delicate treble glints on side edges in high energy / fever without blocking notes
    if (
      this.mode === 'playing' &&
      reactive &&
      !this.settings.visualsConfig?.reducedFlash &&
      (treblePulse > 0.55 || this.feverActive) &&
      Math.random() < (this.feverActive ? 0.32 : 0.12)
    ) {
      const randX = (Math.random() - 0.5) * this.trackLayout.roadWidth;
      const sideX = randX >= 0 ? this.trackLayout.roadWidth * 0.58 : -this.trackLayout.roadWidth * 0.58;
      this.spawnBurst(
        sideX,
        0.5 + Math.random() * 1.4,
        -6 - Math.random() * 18,
        this.feverActive ? _feverColorA : this.primaryColor,
        1,
        false,
      );
    }

    // Lane receptor pads, dynamic per-lane borders & surface glow fade
    for (let i = 0; i < this.trackLayout.laneCount; i++) {
      const isHeld = this.heldLanes[i];
      this.laneFlash[i] = isHeld
        ? Math.max(0.55, this.laneFlash[i] - dt * 4.5)
        : Math.max(0, this.laneFlash[i] - dt * 6.8);
      this.laneMissFlash[i] = Math.max(0, this.laneMissFlash[i] - dt * 3.8);

      const f = this.laneFlash[i];
      const mf = this.laneMissFlash[i];
      const pad = this.lanePadMeshes[i];
      if (!pad) continue;

      pad.position.y = 0.036 - f * 0.022;
      pad.scale.setScalar(1 + f * 0.09);

      const padMat = pad.material as THREE.MeshStandardMaterial;
      const laneBaseCol = i % 2 === 0 ? this.notePrimaryColor : this.noteSecondaryColor;
      if (mf > 0.05) {
        padMat.emissive.setHex(0xef4444);
        padMat.emissiveIntensity = Math.min(1.45, (0.4 + mf * 0.9) * brightScale);
        this.lanePadRingMats[i].color.setHex(0xef4444);
      } else {
        padMat.emissive.copy(
          this.feverActive ? (i % 2 === 0 ? _feverColorA : _feverColorB) : laneBaseCol,
        );
        padMat.emissiveIntensity = Math.min(
          1.45,
          (0.34 + f * 0.72 + bassPulse * 0.15) * brightScale * glowScale * reducedFlashScale,
        );
        this.lanePadRingMats[i].color.copy(padMat.emissive);
      }
      this.lanePadRingMats[i].opacity = Math.min(
        0.9,
        (0.38 + f * 0.4) * Math.min(1.1, brightScale),
      );

      if (this.laneStripMeshes[i]) {
        (this.laneStripMeshes[i].material as THREE.MeshBasicMaterial).opacity = Math.min(
          0.22,
          (0.012 + f * 0.14 + (reactive ? lowMidPulse * 0.016 : 0)) *
            brightScale *
            reducedFlashScale,
        );
      }

      // Per-lane edge border illumination reactive to DSP bands + lane flash + miss/fever state
      const edges = this.laneEdgeMats[i];
      if (edges) {
        const bandDrive = i % 2 === 0 ? bassPulse : midPulse;
        const edgeOpacity = THREE.MathUtils.clamp(
          (0.09 + bandDrive * 0.14 + highMidPulse * 0.06 + f * 0.34 + (this.feverActive ? 0.08 : 0)) *
            Math.min(1.15, brightScale) *
            reducedFlashScale,
          0.06,
          0.58,
        );
        if (mf > 0.08) {
          _tmpColor.copy(_missColor);
        } else if (this.feverActive) {
          _tmpColor.copy(i % 2 === 0 ? _feverColorA : _feverColorB);
        } else {
          _tmpColor.copy(i % 2 === 0 ? this.primaryColor : this.secondaryColor);
        }
        edges[0].color.copy(_tmpColor);
        edges[1].color.copy(_tmpColor);
        edges[0].opacity = edgeOpacity;
        edges[1].opacity = edgeOpacity;
      }
    }

    // Animate pooled longitudinal lane pulses
    for (let i = 0; i < this.lanePulsePool.length; i++) {
      const p = this.lanePulsePool[i];
      if (!p.active) continue;
      p.life += dt;
      p.z += p.speedZ * dt;
      const frac = p.life / p.maxLife;
      if (frac >= 1 || p.z < SPAWN_Z - 4 || p.z > DESPAWN_Z + 2) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.mesh.position.z = p.z;
      p.mat.opacity = p.maxOpacity * Math.sin(frac * Math.PI) * Math.min(1.1, brightScale);
    }

    // Animate pooled surface energy waves
    for (let i = 0; i < this.surfaceWavePool.length; i++) {
      const w = this.surfaceWavePool[i];
      if (!w.active) continue;
      w.life += dt;
      w.z += w.speedZ * dt;
      const frac = w.life / w.maxLife;
      if (frac >= 1 || w.z < SPAWN_Z - 4 || w.z > DESPAWN_Z + 2) {
        w.active = false;
        w.mesh.visible = false;
        continue;
      }
      w.mesh.position.z = w.z;
      w.mat.opacity = w.maxOpacity * Math.sin(frac * Math.PI) * Math.min(1.1, brightScale);
    }

    // Animate pooled expanding hit shockwaves + radial flares + upward flame hit trails
    for (let i = 0; i < this.shockwavePool.length; i++) {
      const s = this.shockwavePool[i];
      if (!s.active) continue;
      s.life += dt;
      const frac = s.life / s.maxLife;
      if (frac >= 1) {
        s.active = false;
        s.ring.visible = false;
        s.flare.visible = false;
        s.flame.visible = false;
        continue;
      }
      const inv = 1 - frac;
      s.ring.scale.setScalar(0.85 + frac * s.expandScale);
      s.ringMat.opacity = inv * 0.52 * Math.min(1.15, brightScale);
      s.flare.scale.setScalar(0.75 + frac * (s.expandScale * 0.55));
      s.flareMat.opacity = inv * inv * s.flarePeak * Math.min(1.15, brightScale);
      if (s.flame.visible) {
        s.flame.position.z = HIT_LINE_Z - 0.8 - frac * 1.45;
        s.flame.position.y = 0.2 + frac * 0.35;
        s.flame.scale.set(0.92 + frac * 0.3, 0.72 + frac * 0.65, 1);
        s.flameMat.opacity =
          inv * inv * (this.settings.visualsConfig?.reducedFlash ? 0.3 : 0.78) * Math.min(1.1, brightScale);
      }
    }

    // Animate pooled chord linking beams
    for (let i = 0; i < this.chordBeamPool.length; i++) {
      const b = this.chordBeamPool[i];
      if (!b.active) continue;
      b.life += dt;
      const frac = b.life / b.maxLife;
      if (frac >= 1) {
        b.active = false;
        b.mesh.visible = false;
        continue;
      }
      b.mat.opacity = (1 - frac) * 0.62 * Math.min(1.15, brightScale) * reducedFlashScale;
    }

    // Miss wave ring
    if (this.missWaveLife > 0) {
      this.missWaveLife = Math.max(0, this.missWaveLife - dt * 3.2);
      const prog = 1 - this.missWaveLife;
      this.missWaveRing.scale.setScalar(1 + prog * 3.5);
      (this.missWaveRing.material as THREE.MeshBasicMaterial).opacity =
        this.missWaveLife * 0.62 * Math.min(1.15, brightScale);
    }

    if (this.defeatFlash > 0) {
      this.defeatFlash = Math.max(0, this.defeatFlash - dt * 1.4);
      this.hitLineMat.emissive.setHex(0xef4444);
      this.hitLineMat.emissiveIntensity = Math.min(
        1.8,
        (1.55 * this.defeatFlash + 0.55) * brightScale,
      );
    } else {
      this.hitLineMat.emissive.copy(this.feverActive ? _feverColorA : this.primaryColor);
      this.hitLineMat.emissiveIntensity = Math.min(
        1.4,
        (0.68 + highMidPulse * 0.32 + bassPulse * 0.22) *
          brightScale *
          glowScale *
          reducedFlashScale,
      );
    }

    // Real 3D Dynamic Cinematic Camera Update
    this.cameraRig.update(dt, {
      subBass: this.smoothedSubBass,
      bass: this.smoothedBass,
      mid: this.smoothedMid,
      high: this.smoothedHigh,
      energy: this.smoothedEnergy,
      bassTransient,
      bpm: this.activeProfile?.bpm ?? 120,
      isPlaying: audioState.isPlaying,
      reactiveEnabled: reactive,
      visualIntensity: this.settings.visualIntensity,
      inSilence,
      sectionType: this.currentSection,
      feverActive: this.feverActive,
      cameraConfig: this.settings.cameraConfig,
      isMenu: this.isMenuMode,
      menuParallaxX: this.menuParallaxX,
      menuParallaxY: this.menuParallaxY,
      menuAnimationsEnabled: this.settings.menuAmbientConfig?.menuAnimationsEnabled !== false,
    });

    // Apply Creator trigger Camera FX / EffectController runtime deltas (isolated to Creator Playtest)
    if (this.creatorPlaytestActive) {
      if (this.creatorCameraOverride) {
        const co = this.creatorCameraOverride;
        const targetFov = THREE.MathUtils.clamp(this.cameraRig.camera.fov + co.fovDelta, 40, 102);
        if (Math.abs(this.cameraRig.camera.fov - targetFov) > 0.01) {
          this.cameraRig.camera.fov = targetFov;
          this.cameraRig.camera.updateProjectionMatrix();
        }
        const shakeX =
          co.shake > 0.01 ? Math.sin(this.clock.elapsedTime * 52) * 0.14 * co.shake : 0;
        const shakeY =
          co.shake > 0.01 ? Math.cos(this.clock.elapsedTime * 61) * 0.1 * co.shake : 0;
        this.cameraRig.camera.position.x += co.offsetX + shakeX;
        this.cameraRig.camera.position.y += co.offsetY + shakeY;
        this.cameraRig.camera.position.z += co.offsetZ;
        this.cameraRig.camera.rotation.z += co.rollRad;
      }
      if (this.creatorEffectsOverride) {
        const eo = this.creatorEffectsOverride;
        if (this.bloomPass) {
          this.bloomPass.strength = THREE.MathUtils.clamp(0.28 + eo.bloomDelta, 0.05, 1.15);
        }
        this.renderer.toneMappingExposure = THREE.MathUtils.clamp(
          0.88 * this.getEffectiveBrightness() * (eo.bgBrightness ?? 1) + eo.exposureDelta,
          0.35,
          1.75,
        );
      }
    }

    // Update burst particles (skip entire loop when pool is idle)
    if (this.hasActiveParticles) {
      let dirtyParticles = false;
      let anyStillActive = false;
      for (let i = 0; i < this.MAX_BURST_PARTICLES; i++) {
        const p = this.particles[i];
        if (!p.active) continue;
        dirtyParticles = true;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          _mat4.makeTranslation(0, -100, 0);
          this.particleMesh.setMatrixAt(i, _mat4);
          continue;
        }
        anyStillActive = true;
        p.vel.y -= 9.5 * dt;
        p.pos.addScaledVector(p.vel, dt);
        const s = p.size * (1 - p.life / p.maxLife);
        _scale.setScalar(Math.max(0.01, s));
        _quat.identity();
        _mat4.compose(p.pos, _quat, _scale);
        this.particleMesh.setMatrixAt(i, _mat4);
        this.particleMesh.setColorAt(i, p.color);
      }
      this.hasActiveParticles = anyStillActive;
      if (dirtyParticles) {
        this.particleMesh.instanceMatrix.needsUpdate = true;
        if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
      }
    }

    // Synchronized gameplay notes + active Holds/Slides
    if (this.mode === 'playing' && this.activeLevel) {
      const playTime = this.getGameplayCurrentTime();
      this.updateActiveHolds(playTime);
      this.updateActiveSlides(playTime, dt);
      this.updateActiveNotes(playTime);
    } else if (this.slideCursorMesh.visible) {
      this.slideCursorMesh.visible = false;
    }
  }

  private updateActiveHolds(currentTime: number): void {
    for (const [id, hold] of this.activeHolds.entries()) {
      const lane = hold.note.lane;
      if (!this.heldLanes[lane]) continue;

      this.laneFlash[lane] = 0.85;
      const laneCol = this.getNoteDisplayColor(hold.note);
      if (currentTime - hold.lastTickTime >= 0.13) {
        hold.lastTickTime = currentTime;
        const tickPts = Math.round(18 * this.getActiveMultiplier());
        this.score += tickPts;
        hold.pointsAccumulated += tickPts;
        this.spawnBurst(
          this.trackLayout.laneX[lane],
          0.26,
          HIT_LINE_Z,
          laneCol,
          3,
          false,
        );
        if (Math.random() < 0.48) {
          this.spawnLanePulse(lane, laneCol, true, 30, 0.18);
        }
      }

      if (currentTime >= hold.endTime - 0.05) {
        this.activeHolds.delete(id);
        this.holdsCompleted++;
        const bonus = Math.round(95 * this.getActiveMultiplier());
        this.score += bonus;
        this.spawnHitShockwave(this.trackLayout.laneX[lane], laneCol, 3.8, 0.56);
        this.spawnLanePulse(lane, laneCol, true, 34, 0.28);
        this.spawnBurst(
          this.trackLayout.laneX[lane],
          0.35,
          HIT_LINE_Z,
          laneCol,
          14,
          false,
        );
      }
    }
  }

  private updateActiveSlides(currentTime: number, dt: number): void {
    const tol = this.settings.generationConfig.mechanics.slideTolerance ?? 1.0;
    const maxDist = 0.92 * tol;
    let cursorShown = false;

    for (const [id, slide] of this.activeSlides.entries()) {
      const expectedLaneFloat = this.getExpectedSlideLane(slide.note, currentTime);
      const nearestLane = Math.round(expectedLaneFloat);
      const clampedFloor = Math.max(0, Math.min(this.trackLayout.laneCount - 1, Math.floor(expectedLaneFloat)));
      const clampedCeil = Math.max(0, Math.min(this.trackLayout.laneCount - 1, Math.ceil(expectedLaneFloat)));
      const lanePos = THREE.MathUtils.lerp(
        this.trackLayout.laneX[clampedFloor] ?? 0,
        this.trackLayout.laneX[clampedCeil] ?? 0,
        expectedLaneFloat - Math.floor(expectedLaneFloat),
      );

      // Check if any active finger / held key is near the interpolated slide path
      let tracked = false;
      if (this.activePointerLane !== null && Math.abs(this.activePointerLane - expectedLaneFloat) <= maxDist) {
        tracked = true;
      } else {
        for (let l = 0; l < this.trackLayout.laneCount; l++) {
          if (this.heldLanes[l] && Math.abs(l - expectedLaneFloat) <= maxDist) {
            tracked = true;
            break;
          }
        }
      }

      if (tracked) {
        slide.offPathSec = 0;
        const clampedNearest = Math.max(0, Math.min(this.trackLayout.laneCount - 1, nearestLane));
        this.laneFlash[clampedNearest] = 0.85;

        if (!cursorShown) {
          cursorShown = true;
          this.slideCursorMesh.visible = true;
          this.slideCursorMesh.position.set(lanePos, 0.08, HIT_LINE_Z);
          this.slideCursorMesh.scale.setScalar(1.0 + this.smoothedBass * 0.25);
          this.slideCursorMat.color.copy(this.feverActive ? _feverColorA : _slideCompleteColor);
          this.slideCursorMat.opacity = 0.82;
        }

        if (currentTime - slide.lastTickTime >= 0.11 || nearestLane !== slide.lastPlayedLane) {
          if (nearestLane !== slide.lastPlayedLane) {
            slide.lastPlayedLane = nearestLane;
            this.spawnLanePulse(clampedNearest, _slideCompleteColor, true, 30, 0.2);
          }
          slide.lastTickTime = currentTime;
          this.score += Math.round(22 * this.getActiveMultiplier());
          this.spawnBurst(lanePos, 0.28, HIT_LINE_Z, _slideCompleteColor, 3, false);
        }
      } else {
        slide.offPathSec += dt;
        if (slide.offPathSec > 0.28 * tol) {
          this.activeSlides.delete(id);
          this.registerMiss(slide.note, 'SLIDE ROTO');
          continue;
        }
      }

      if (currentTime >= slide.endTime - 0.05) {
        this.activeSlides.delete(id);
        this.slidesCompleted++;
        const bonus = Math.round(115 * this.getActiveMultiplier());
        this.score += bonus;
        const endX =
          this.trackLayout.laneX[Math.max(0, Math.min(this.trackLayout.laneCount - 1, nearestLane))];
        this.spawnHitShockwave(endX, _slideCompleteColor, 3.8, 0.56);
        this.spawnLanePulse(
          Math.max(0, Math.min(this.trackLayout.laneCount - 1, nearestLane)),
          _slideCompleteColor,
          true,
          34,
          0.26,
        );
        this.spawnBurst(endX, 0.36, HIT_LINE_Z, _slideCompleteColor, 15, false);
      }
    }

    if (!cursorShown && this.slideCursorMesh.visible) {
      this.slideCursorMesh.visible = false;
    }
  }

  private updateActiveNotes(currentTime: number): void {
    const level = this.activeLevel!;
    const notes = level.notes;
    const speed = level.noteSpeed;

    while (
      this.nextSearchIdx < notes.length &&
      (notes[this.nextSearchIdx].hit || notes[this.nextSearchIdx].missed) &&
      !this.activeHolds.has(notes[this.nextSearchIdx].id) &&
      !this.activeSlides.has(notes[this.nextSearchIdx].id)
    ) {
      this.nextSearchIdx++;
    }

    for (const slot of this.notePool) {
      slot.active = false;
      slot.group.visible = false;
      slot.trailMesh.visible = false;
      slot.holdTailMesh.visible = false;
      slot.holdCapMesh.visible = false;
      slot.flickArrowMesh.visible = false;
      slot.slideSeg1Mesh.visible = false;
      slot.slideSeg2Mesh.visible = false;
      slot.slideEndMesh.visible = false;
    }

    let poolCursor = 0;
    const lookAheadSec = (HIT_LINE_Z - SPAWN_Z) / speed + 0.35;
    const brightScale = this.getEffectiveBrightness();
    const glowScale =
      (this.settings.visualsConfig?.glowIntensity ?? 1.0) *
      getPresetById(this.settings.visualsConfig?.preset ?? 'auto').glowScale;
    const reflOpacity =
      (this.settings.reflectionQuality === 'low'
        ? 0
        : this.settings.reflectionQuality === 'medium'
          ? 0.12
          : 0.22) * brightScale;
    const showTrails = this.getEffectiveQuality() !== 'low';

    let precisionActiveNow = false;

    for (let i = this.nextSearchIdx; i < notes.length; i++) {
      const note = notes[i];
      const isHeldActive = this.activeHolds.has(note.id);
      const isSlideActive = this.activeSlides.has(note.id);

      if ((note.hit || note.missed) && !isHeldActive && !isSlideActive) continue;

      const hw = this.getNoteHitWindow(note);
      const timeUntilHit = note.time - currentTime;

      // Visual-only Creator Preview: auto-showcase note hit right at the hit line
      if (this.creatorPlaytestActive && this.creatorVisualOnly && !note.hit && timeUntilHit <= 0) {
        note.hit = true;
        this.laneFlash[note.lane] = 0.85;
        this.applySuccessHit(note, 0, hw, 1.0, '');
        continue;
      }

      if (!note.hit && timeUntilHit < -hw) {
        this.registerMiss(note);
        if (this.mode !== 'playing') return;
        continue;
      }

      if (timeUntilHit > lookAheadSec) break;
      if (poolCursor >= this.notePool.length) continue;
      if (note.challengeSection && timeUntilHit < 1.2) {
        precisionActiveNow = true;
      }

      const z = isHeldActive || isSlideActive ? HIT_LINE_Z : HIT_LINE_Z - timeUntilHit * speed;
      if (!isHeldActive && !isSlideActive && (z < SPAWN_Z || z > DESPAWN_Z)) continue;

      const slot = this.notePool[poolCursor++];
      slot.active = true;
      slot.noteId = note.id;
      slot.group.visible = true;

      const noteShape = note.customCasillaShape
        ? casillaShapeToConcreteShape(note.customCasillaShape)
        : this.currentShape;
      const geos = this.noteGeoCache[noteShape] ?? this.noteGeoCache[this.currentShape];
      if (slot.coreMesh.geometry !== geos.core) {
        slot.coreMesh.geometry = geos.core;
        slot.trimMesh.geometry = geos.trim;
      }
      (slot.trimMesh.material as THREE.MeshStandardMaterial).wireframe = noteShape === 'diamond';

      const laneX = this.trackLayout.laneX[note.lane] ?? 0;
      const sx = this.trackLayout.noteScaleX;
      const floatY = 0.21 + Math.sin(currentTime * 4.2 + note.id * 0.7) * 0.02;

      slot.group.position.set(laneX, floatY, z);
      slot.coreMesh.scale.set(sx, 1, 1);
      slot.trimMesh.scale.set(sx, 1, 1);
      slot.topRingMesh.scale.set(
        noteShape === 'square' ? sx * 0.88 : sx,
        noteShape === 'square' ? 1.2 : 1,
        1,
      );
      slot.topRingMesh.visible =
        noteShape === 'tile' ||
        noteShape === 'square' ||
        noteShape === 'disc' ||
        noteShape === 'hexagon';
      slot.reflectionMesh.scale.set(sx, 1, 1);

      if (noteShape === 'diamond' || noteShape === 'prism') {
        slot.coreMesh.rotation.y = (currentTime * 1.9 + note.id * 0.7) % (Math.PI * 2);
        slot.trimMesh.rotation.y = slot.coreMesh.rotation.y;
      } else if (noteShape === 'sphere') {
        slot.coreMesh.rotation.y = 0;
        slot.trimMesh.rotation.z = (currentTime * 2.5 + note.id * 0.5) % (Math.PI * 2);
      } else {
        slot.coreMesh.rotation.y = 0;
        slot.trimMesh.rotation.y = 0;
      }

      const col = this.getNoteDisplayColor(note);
      const coreMat = slot.coreMesh.material as THREE.MeshStandardMaterial;
      coreMat.color.copy(col);
      coreMat.emissive.copy(col);
      coreMat.emissiveIntensity = (0.44 + note.intensity * 0.24) * brightScale * glowScale;

      const trimMat = slot.trimMesh.material as THREE.MeshStandardMaterial;
      trimMat.color.copy(col).lerp(_color.setHex(0xffffff), note.challengeSection ? 0.54 : 0.42);
      trimMat.emissive.copy(note.challengeSection ? _feverColorA : col);
      trimMat.emissiveIntensity = (0.56 + note.intensity * 0.18) * brightScale * glowScale;

      const topRingMat = slot.topRingMesh.material as THREE.MeshBasicMaterial;
      topRingMat.opacity = THREE.MathUtils.clamp((0.68 + note.intensity * 0.22) * glowScale, 0.45, 0.92);

      const reflMat = slot.reflectionMesh.material as THREE.MeshBasicMaterial;
      slot.reflectionMesh.visible = reflOpacity > 0 && !isHeldActive && !isSlideActive;
      if (slot.reflectionMesh.visible) {
        reflMat.color.copy(col);
        reflMat.opacity = reflOpacity * (0.8 + note.intensity * 0.2);
        slot.reflectionMesh.position.y = -(floatY - 0.025);
      }

      const trailMat = slot.trailMesh.material as THREE.MeshBasicMaterial;
      slot.trailMesh.visible =
        showTrails &&
        !isHeldActive &&
        !isSlideActive &&
        note.kind !== 'hold' &&
        note.kind !== 'slide';
      if (slot.trailMesh.visible) {
        const trailLenScale = THREE.MathUtils.clamp(speed / 18, 0.7, 1.55);
        slot.trailMesh.scale.set(sx * 0.92, trailLenScale, 1);
        slot.trailMesh.position.set(0, -(floatY - 0.055), -1.15 * trailLenScale);
        trailMat.color.copy(col);
        trailMat.opacity = THREE.MathUtils.clamp(
          (0.2 + note.intensity * 0.14) * brightScale,
          0.14,
          0.36,
        );
      }

      // Render HOLD Ribbon Tail
      if (note.kind === 'hold' && note.durationSec) {
        const remainingSec = isHeldActive
          ? Math.max(0.05, note.time + note.durationSec - currentTime)
          : note.durationSec;
        const tailLen = Math.max(0.25, remainingSec * speed);
        slot.holdTailMesh.visible = true;
        slot.holdTailMesh.scale.set(sx, 1, tailLen);
        slot.holdTailMesh.position.set(0, -0.02, -tailLen * 0.5);
        slot.holdCapMesh.visible = true;
        slot.holdCapMesh.scale.set(sx, 1, 1);
        slot.holdCapMesh.position.set(0, 0, -tailLen);

        const hMat = slot.holdTailMesh.material as THREE.MeshStandardMaterial;
        hMat.color.copy(col);
        hMat.emissive.copy(isHeldActive ? _feverColorA : col);
        hMat.emissiveIntensity = (isHeldActive ? 0.95 : 0.6) * brightScale * glowScale;
      }

      // Render FLICK Directional Chevron
      if (note.kind === 'flick') {
        slot.flickArrowMesh.visible = true;
        const dir: FlickDirection = note.flickDir ?? 'up';
        const bob = Math.sin(currentTime * 11 + note.id) * 0.06;
        slot.flickArrowMesh.position.set(0, 0.48 + bob, 0);
        slot.flickArrowMesh.scale.setScalar(0.85 * Math.min(1, sx * 1.1));
        if (dir === 'left') slot.flickArrowMesh.rotation.set(0, 0, Math.PI / 2);
        else if (dir === 'right') slot.flickArrowMesh.rotation.set(0, 0, -Math.PI / 2);
        else slot.flickArrowMesh.rotation.set(0, 0, 0);
      }

      // Render SLIDE Connected Path
      if (note.kind === 'slide' && note.slidePath && note.slidePath.length >= 2) {
        const p0 = note.slidePath[0];
        const pLast = note.slidePath[note.slidePath.length - 1];
        const pMid = note.slidePath.length >= 3 ? note.slidePath[1] : null;

        const baseZOffset = isSlideActive ? (currentTime - note.time) * speed : 0;
        const x0 = 0;
        const z0 = baseZOffset;

        const targetEndX = (this.trackLayout.laneX[pLast.lane] ?? laneX) - laneX;
        const targetEndZ = -pLast.timeOffset * speed + baseZOffset;

        if (pMid) {
          const midX = (this.trackLayout.laneX[pMid.lane] ?? laneX) - laneX;
          const midZ = -pMid.timeOffset * speed + baseZOffset;
          this.positionSlideSegment(slot.slideSeg1Mesh, x0, z0, midX, midZ, sx);
          this.positionSlideSegment(slot.slideSeg2Mesh, midX, midZ, targetEndX, targetEndZ, sx);
        } else {
          this.positionSlideSegment(slot.slideSeg1Mesh, x0, z0, targetEndX, targetEndZ, sx);
          slot.slideSeg2Mesh.visible = false;
        }

        slot.slideEndMesh.visible = true;
        slot.slideEndMesh.position.set(targetEndX, 0, targetEndZ);
        slot.slideEndMesh.scale.set(sx, 1, 1);

        const sMat = slot.slideSeg1Mesh.material as THREE.MeshStandardMaterial;
        sMat.emissiveIntensity = (isSlideActive ? 0.92 : 0.68) * brightScale * glowScale;
        void p0;
      }
    }

    const now = performance.now();
    if (now - this.lastHudPush > 35) {
      this.lastHudPush = now;
      const vis = this.settings.visualsConfig;
      const flashAllowed = vis?.screenEffects !== false;
      const flashScale = vis?.reducedFlash ? 0.3 : (vis?.flashIntensity ?? 0.65);
      const bassEdge = this.settings.reactiveVisuals ? this.smoothedBass * 0.24 * flashScale : 0;
      const dropEdge = this.dropScreenPulse * 0.36 * flashScale;

      this.callbacks?.onProgress({
        currentTime,
        duration: this.creatorPlaytestActive
          ? Math.max(audioEngine.getDuration() || 0, this.creatorVirtualDurationSec)
          : audioEngine.getDuration(),
        score: this.score,
        combo: this.combo,
        maxCombo: this.maxCombo,
        hits: this.hits,
        misses: this.misses,
        maxMisses: level.maxMisses,
        perfectCount: this.perfectCount,
        goodCount: this.goodCount,
        okCount: this.okCount,
        perfectChain: this.perfectChain,
        maxPerfectChain: this.maxPerfectChain,
        feverActive: this.feverActive,
        feverCharge: this.feverCharge,
        feverRemainingSec: this.feverRemainingSec,
        feverDurationSec: this.settings.generationConfig.mechanics.feverMode.durationSec,
        feverMultiplier: this.settings.generationConfig.mechanics.feverMode.multiplierBoost,
        feverActivations: this.feverActivations,
        currentMultiplier: this.getActiveMultiplier(),
        precisionChallengeActive: precisionActiveNow,
        currentSection: this.currentSection,
        screenPulse: {
          color: this.feverActive ? '#fbbf24' : this.currentPalette.primary,
          edgeAlpha: flashAllowed ? THREE.MathUtils.clamp(bassEdge + dropEdge, 0, 0.45) : 0,
          feverAlpha: flashAllowed && this.feverActive ? 0.22 * flashScale : 0,
          dropRingPulse: flashAllowed ? this.dropScreenPulse * flashScale : 0,
        },
      });
    }
  }

  private positionSlideSegment(
    mesh: THREE.Mesh,
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    scaleX: number,
  ): void {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.position.set((x1 + x2) * 0.5, -0.02, (z1 + z2) * 0.5);
    mesh.rotation.y = Math.atan2(dx, dz);
    mesh.scale.set(scaleX, 1, len);
  }

  public getFinalStats(): {
    score: number;
    maxCombo: number;
    hits: number;
    misses: number;
    breakdown: GameplayBreakdown;
  } {
    const avgMultiplier =
      this.multiplierSamples > 0
        ? Number((this.multiplierSum / this.multiplierSamples).toFixed(2))
        : 1.0;
    return {
      score: this.score,
      maxCombo: this.maxCombo,
      hits: this.hits,
      misses: this.misses,
      breakdown: {
        perfectCount: this.perfectCount,
        goodCount: this.goodCount,
        okCount: this.okCount,
        holdsCompleted: this.holdsCompleted,
        holdsBroken: this.holdsBroken,
        chordsHit: this.chordsHit,
        flicksHit: this.flicksHit,
        slidesCompleted: this.slidesCompleted,
        maxPerfectChain: this.maxPerfectChain,
        feverActivations: this.feverActivations,
        avgMultiplier,
      },
    };
  }

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.cameraRig.updateFraming(width / height, this.trackLayout.roadWidth);
    this.renderer.setSize(width, height);
    this.applyQualityPixelRatio();
    this.composer?.setSize(width, height);
    if (this.bloomPass) {
      const bloomDivisor = this.isMobileGpu ? 3 : 2;
      this.bloomPass.resolution.set(
        Math.max(1, Math.floor(width / bloomDivisor)),
        Math.max(1, Math.floor(height / bloomDivisor)),
      );
    }
    if (this.renderContext === 'paused' && !this.suspended && !this.isDocumentHidden) {
      this.pauseRenderDone = false;
      this.syncLoopState();
    }
  };

  public dispose(): void {
    this.disposed = true;
    this.stopLoop();
    window.removeEventListener('resize', this.handleResize);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    Object.values(this.noteGeoCache).forEach((entry) => {
      entry.core.dispose();
      entry.trim.dispose();
    });
    this.reflectionGeo.dispose();
    this.trailGeo.dispose();
    this.topRingGeo.dispose();
    this.holdTailGeo.dispose();
    this.holdCapGeo.dispose();
    this.flickArrowGeo.dispose();
    this.slideSegGeo.dispose();
    this.slideEndGeo.dispose();

    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        } else {
          m.material?.dispose();
        }
      }
    });

    this.envManager.dispose();
    this.roadAlbedoTex.dispose();
    this.roadRoughTex.dispose();
    this.noteReflectionTex.dispose();
    this.pulseGradientTex.dispose();
    this.tileInnerRingTex.dispose();
    this.flameTrailTex.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
