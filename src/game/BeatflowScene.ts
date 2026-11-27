import { casillaShapeToConcreteShape } from '../creator/ObjectLibrary';
import { audioEngine } from '../services/audioEngine';
import { ChromaticEngine } from '../services/chromaticEngine';
import { menuAmbientAudio } from '../services/menuAmbientAudio';
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
  OfficialEnvironmentTheme,
  QualityLevel,
  ScreenPulseState,
  SongPalette,
} from '../types/game';
import { CameraRig, type ProjectedPoint } from './CameraRig';
import { NoteRenderer25D } from './engine25d/NoteRenderer25D';
import { PerspectiveTrack } from './engine25d/PerspectiveTrack';
import { ScenarioPainters } from './engine25d/scenarios/ScenarioPainters';
import {
  computeTrackLayout,
  DESPAWN_Z,
  HIT_LINE_Z,
  SPAWN_Z,
  type ActiveNoteRenderItem,
  type AudioVisualBands,
  type PooledChordBeam,
  type PooledLanePulse,
  type PooledParticle,
  type PooledShockwave,
  type PooledSurfaceWave,
  type TrackLayout,
  type TrackVisualState,
} from './engine25d/types';
import { resolveSafeEnvironmentTheme } from './environments/environmentSelector';
import { MusicReactiveLighting } from './MusicReactiveLighting';
import {
  lerpHex,
  resolveNoteColorHex,
  resolveReadableTrackColors,
} from './noteColorPalette';
import {
  getPresetById,
  resolveEffectiveEnvironment,
  resolveEffectivePalette,
  resolveNoteShape,
} from './presets';

export { HIT_LINE_Z, SPAWN_Z, DESPAWN_Z };

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

interface DirectPointerTrack {
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  startLane: number;
  currentLane: number;
  flickArmed: boolean;
  flickSent: boolean;
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

const MISS_COLOR_HEX = '#ef4444';
const SLIDE_COMPLETE_COLOR_HEX = '#34d399';
const VICTORY_GOLD_HEX = '#fbbf24';
const FEVER_COLOR_A = '#fbbf24';
const FEVER_COLOR_B = '#ec4899';
const BURST_COLOR_HEX = '#38bdf8';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function damp(a: number, b: number, lambda: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

export class BeatflowScene {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private resizeObserver: ResizeObserver | null = null;
  private cameraRig: CameraRig;
  private scenarioPainters = new ScenarioPainters();
  private perspectiveTrack = new PerspectiveTrack();
  private noteRenderer = new NoteRenderer25D();

  private width = 1280;
  private height = 720;
  private dpr = 1;
  private frameId = 0;
  private disposed = false;

  private trackLayout: TrackLayout;
  private laneFlash: number[] = [0, 0, 0, 0];
  private laneMissFlash: number[] = [0, 0, 0, 0];
  private activeHoldLanes: boolean[] = [false, false, false, false];
  private missWaveLife = 0;
  private readonly missWaveMaxLife = 1.0;

  // Theme & Palette
  private currentTheme: OfficialEnvironmentTheme = 'cyberpunk';
  private currentEnvSeed = 'BEATFLOW-DEFAULT';
  private baseSongPalette: SongPalette = {
    primary: '#22d3ee',
    secondary: '#e879f9',
    accent: '#6366f1',
  };
  private currentPalette: SongPalette = { ...this.baseSongPalette };
  private primaryColorHex = '#22d3ee';
  private secondaryColorHex = '#e879f9';
  private accentColorHex = '#6366f1';
  private notePrimaryHex = '#06d6f2';
  private noteSecondaryHex = '#f43f8e';
  private noteAccentHex = '#fbbf24';
  private chromaticColA = '#22d3ee';
  private chromaticColB = '#e879f9';
  private chromaticColAccent = '#6366f1';

  private chromaticEngine = new ChromaticEngine();
  private reactiveLighting = new MusicReactiveLighting();

  // Menu & adaptive performance state
  private isMenuMode = true;
  private tutorialBackdropOverride = false;
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
  private lastTickPerfMs = 0;
  private lastRenderTimeMs = 0;
  private accumulatedMenuDt = 0;
  private pauseRenderDone = false;
  private elapsedSec = 0;

  // Pre-allocated render & VFX pools (zero GC spikes)
  private currentShape: ConcreteNoteShape = 'tile';
  private particles: PooledParticle[] = [];
  private readonly MAX_BURST_PARTICLES = 220;
  private shockwaves: PooledShockwave[] = [];
  private lanePulses: PooledLanePulse[] = [];
  private surfaceWaves: PooledSurfaceWave[] = [];
  private chordBeams: PooledChordBeam[] = [];
  private noteRenderQueue: ActiveNoteRenderItem[] = [];
  private pHorizon: ProjectedPoint = { x: 0, y: 0, depth: 1, scale: 1 };

  private bands: AudioVisualBands;
  private trackState: TrackVisualState;

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

  // Direct 2.5D touch controls (phones & portrait tablets)
  private directTouchEnabled = false;
  private directTouchListenersAttached = false;
  private directPointers = new Map<number, DirectPointerTrack>();

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

  // Isolated Creator Playtest & 2.5D Preview state (strictly disabled in Classic Mode)
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

    this.isMobileGpu = (() => {
      if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
      const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
      const coarse =
        typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
      return uaMobile || (coarse && Math.min(window.innerWidth, window.innerHeight) <= 920);
    })();
    this.isDocumentHidden =
      typeof document !== 'undefined' && document.visibilityState === 'hidden';

    this.width = Math.max(1, container.clientWidth || window.innerWidth);
    this.height = Math.max(1, container.clientHeight || window.innerHeight);

    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('No se pudo inicializar el motor gráfico Canvas 2.5D.');
    }
    this.ctx = ctx;
    container.appendChild(this.canvas);

    this.cameraRig = new CameraRig(this.width / this.height, HIT_LINE_Z);
    this.cameraRig.updateFraming(this.width / this.height, this.trackLayout.roadWidth);

    this.initPools();

    this.bands = {
      subBass: 0.2,
      bass: 0.2,
      lowMid: 0.2,
      mid: 0.2,
      highMid: 0.2,
      treble: 0.2,
      high: 0.2,
      energy: 0.2,
      kickPulse: 0,
      snarePulse: 0,
      hihatPulse: 0,
      dropFlash: 0,
      bassTransient: 0,
      sectionType: 'groove',
      feverActive: false,
      isMenu: true,
      reactiveEnabled: initialSettings.reactiveVisuals,
      reducedFlash: Boolean(initialSettings.visualsConfig?.reducedFlash),
      glowScale: 1,
      bloomScale: 1,
      brightnessScale: this.getEffectiveBrightness(),
      sideBrightness: initialSettings.visualsConfig?.sideBrightness ?? 0.85,
      particleScale: 1,
      reflectionQuality: initialSettings.reflectionQuality,
      graphicsQuality: this.getEffectiveQuality(),
    };

    this.trackState = {
      layout: this.trackLayout,
      palette: { ...this.currentPalette },
      trackPrimaryHex: this.primaryColorHex,
      trackSecondaryHex: this.secondaryColorHex,
      trackAccentHex: this.accentColorHex,
      trackScroll: 0,
      elapsed: 0,
      laneFlash: this.laneFlash,
      laneMissFlash: this.laneMissFlash,
      activeHoldLanes: this.activeHoldLanes,
      activeSlideCursor: {
        active: false,
        x: 0,
        z: HIT_LINE_Z,
        colorHex: SLIDE_COMPLETE_COLOR_HEX,
      },
      missWaveLife: 0,
      missWaveMaxLife: this.missWaveMaxLife,
      bands: this.bands,
      particles: this.particles,
      shockwaves: this.shockwaves,
      lanePulses: this.lanePulses,
      surfaceWaves: this.surfaceWaves,
      chordBeams: this.chordBeams,
    };

    const initialPreset = initialSettings.visualsConfig?.preset ?? 'auto';
    const initialEnvPref = initialSettings.environmentMode ?? 'auto';
    const initialTheme: EnvironmentTheme =
      initialPreset === 'auto' && initialEnvPref === 'auto'
        ? 'cyberpunk'
        : resolveEffectiveEnvironment(initialPreset, initialEnvPref, null, this.currentEnvSeed);
    this.setEnvironment(initialTheme, this.currentEnvSeed);

    this.applyCanvasResolution();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(container);
    }
    window.addEventListener('resize', this.handleResize);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    this.syncLoopState();
  }

  private initPools(): void {
    this.particles = [];
    for (let i = 0; i < this.MAX_BURST_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.4,
        size: 0.12,
        color: '#22d3ee',
      });
    }

    this.shockwaves = [];
    for (let i = 0; i < 10; i++) {
      this.shockwaves.push({
        active: false,
        x: 0,
        y: 0.06,
        z: HIT_LINE_Z,
        life: 0,
        maxLife: 0.38,
        maxRadius: 1.5,
        color: '#22d3ee',
        secondaryColor: '#e879f9',
        isFlame: false,
      });
    }

    this.lanePulses = [];
    for (let i = 0; i < 20; i++) {
      this.lanePulses.push({
        active: false,
        lane: 0,
        z: HIT_LINE_Z,
        life: 0,
        maxLife: 0.72,
        length: 3.4,
        color: '#22d3ee',
      });
    }

    this.surfaceWaves = [];
    for (let i = 0; i < 6; i++) {
      this.surfaceWaves.push({
        active: false,
        z: SPAWN_Z,
        life: 0,
        maxLife: 1.05,
        color: '#22d3ee',
      });
    }

    this.chordBeams = [];
    for (let i = 0; i < 6; i++) {
      this.chordBeams.push({
        active: false,
        x1: 0,
        x2: 0,
        z: HIT_LINE_Z,
        life: 0,
        maxLife: 0.28,
        color: '#6366f1',
      });
    }
  }

  private getEffectiveBrightness(): number {
    const base = this.settings.visualsConfig?.sceneBrightness ?? this.settings.brightness;
    return clamp(base, 0.55, 1.35);
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

  private applyCanvasResolution(): void {
    const w = Math.max(1, this.container.clientWidth || window.innerWidth);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    const effQuality = this.getEffectiveQuality();
    const perfBattery = this.settings.performanceConfig?.performanceMode === 'battery';

    let maxDpr = 2;
    if (perfBattery || effQuality === 'low') {
      maxDpr = 1;
    } else if (this.isMobileGpu) {
      maxDpr = effQuality === 'medium' ? 1.3 : 1.6;
    } else {
      maxDpr = effQuality === 'medium' ? 1.5 : 2;
    }

    const nextDpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const changed =
      Math.abs(w - this.width) > 0.5 ||
      Math.abs(h - this.height) > 0.5 ||
      Math.abs(nextDpr - this.dpr) > 0.02;

    this.width = w;
    this.height = h;
    this.dpr = nextDpr;

    if (changed || this.canvas.width === 0) {
      this.canvas.width = Math.max(1, Math.round(w * nextDpr));
      this.canvas.height = Math.max(1, Math.round(h * nextDpr));
      this.cameraRig.updateFraming(w / h, this.trackLayout.roadWidth);
      this.scenarioPainters.invalidateCache();
    }
  }

  private rebuildCircuitTrack(laneCount: LaneCount): void {
    this.trackLayout = computeTrackLayout(laneCount);
    this.laneFlash = new Array(laneCount).fill(0);
    this.laneMissFlash = new Array(laneCount).fill(0);
    this.activeHoldLanes = new Array(laneCount).fill(false);

    if (this.trackState) {
      this.trackState.layout = this.trackLayout;
      this.trackState.laneFlash = this.laneFlash;
      this.trackState.laneMissFlash = this.laneMissFlash;
      this.trackState.activeHoldLanes = this.activeHoldLanes;
    }
    this.cameraRig.updateFraming(this.width / this.height, this.trackLayout.roadWidth);
  }

  public setNoteShape(shape: NoteShape): void {
    const resolved = resolveNoteShape(
      shape,
      this.settings.visualsConfig?.preset ?? 'auto',
      this.currentTheme,
    );
    this.currentShape = resolved;
  }

  public setEnvironment(theme: EnvironmentTheme, seed?: string): void {
    const targetSeed = seed ?? this.currentEnvSeed;
    this.currentEnvSeed = targetSeed;
    if (this.isMenuMode) {
      this.tutorialBackdropOverride = targetSeed.startsWith('TUTORIAL-');
    } else {
      this.tutorialBackdropOverride = false;
    }
    const safeTheme = resolveSafeEnvironmentTheme(theme);
    if (this.currentTheme !== safeTheme) {
      this.currentTheme = safeTheme;
      this.scenarioPainters.invalidateCache();
    }
    this.setNoteShape(this.settings.noteShape);
  }

  public getCurrentEnvironment(): EnvironmentTheme {
    return this.currentTheme;
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

    const resolved = resolveReadableTrackColors(effective);
    this.primaryColorHex = resolved.trackPrimaryHex;
    this.secondaryColorHex = resolved.trackSecondaryHex;
    this.accentColorHex = resolved.trackAccentHex;
    this.notePrimaryHex = resolved.notePrimaryHex;
    this.noteSecondaryHex = resolved.noteSecondaryHex;
    this.noteAccentHex = resolved.noteAccentHex;

    if (this.trackState) {
      this.trackState.palette = effective;
      this.trackState.trackPrimaryHex = this.primaryColorHex;
      this.trackState.trackSecondaryHex = this.secondaryColorHex;
      this.trackState.trackAccentHex = this.accentColorHex;
    }
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

    this.setPalette(this.baseSongPalette);
    this.setNoteShape(next.noteShape);

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
      this.applyCanvasResolution();
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
    this.missWaveLife = 0;
    this.feverCharge = 0;
    this.feverActive = false;
    this.feverRemainingSec = 0;
    this.feverActivations = 0;
    this.activeHolds.clear();
    this.activeSlides.clear();
    this.chordHitTracker.clear();
    this.heldLanes.fill(false);
    this.activeHoldLanes.fill(false);
    this.laneFlash.fill(0);
    this.laneMissFlash.fill(0);
    this.activePointerLane = null;
    this.prevRawBass = 0;
    this.bassTransientCooldown = 0;
    this.reactiveLighting.reset();
    this.chromaticEngine.reset();
    this.kickPulse = 0;
    this.snarePulse = 0;
    this.hihatPulse = 0;
    this.prevSection = 'groove';
    this.currentSection = 'groove';
    this.creatorPlaytestActive = false;
    this.creatorVirtualClockEnabled = false;
    this.creatorVirtualTimeSec = 0;
    this.creatorVisualOnly = false;
    this.creatorSpeedScale = 1.0;
    this.creatorCameraOverride = null;
    this.creatorEffectsOverride = null;
    this.creatorAppliedBgTheme = null;
    this.isMenuMode = false;
    this.tutorialBackdropOverride = false;
    this.mode = 'playing';
    this.clearDirectPointers();
    this.syncDirectTouchListeners();
    this.setRenderContext('gameplay');
    this.cameraRig.triggerGameplayIntro();
    this.resetPooledTrackEffects();
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
    this.syncDirectTouchListeners();
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
      this.syncDirectTouchListeners();
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
      this.tutorialBackdropOverride = false;
      this.setRenderContext('menu');
    } else {
      this.tutorialBackdropOverride = false;
      this.menuParallaxX = 0;
      this.menuParallaxY = 0;
    }
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
    this.syncLoopState();
  }

  public setMenuParallax(nx: number, ny: number): void {
    this.menuParallaxX = clamp(nx, -1, 1);
    this.menuParallaxY = clamp(ny, -1, 1);
  }

  private resetPooledTrackEffects(): void {
    for (let i = 0; i < this.shockwaves.length; i++) this.shockwaves[i].active = false;
    for (let i = 0; i < this.lanePulses.length; i++) this.lanePulses[i].active = false;
    for (let i = 0; i < this.surfaceWaves.length; i++) this.surfaceWaves[i].active = false;
    for (let i = 0; i < this.chordBeams.length; i++) this.chordBeams[i].active = false;
    for (let i = 0; i < this.particles.length; i++) this.particles[i].active = false;
    this.trackState.activeSlideCursor.active = false;
    this.noteRenderQueue.length = 0;
  }

  public setMode(mode: 'idle' | 'playing' | 'paused' | 'ended'): void {
    this.mode = mode;
    if (mode === 'playing') {
      this.setRenderContext(this.creatorPlaytestActive ? 'playtest' : 'gameplay');
      this.syncDirectTouchListeners();
    } else if (mode === 'paused') {
      this.clearDirectPointers();
      this.syncDirectTouchListeners();
      this.setRenderContext('paused');
    } else if (mode === 'ended') {
      this.clearDirectPointers();
      this.syncDirectTouchListeners();
    } else if (mode === 'idle') {
      this.clearDirectPointers();
      this.syncDirectTouchListeners();
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
      this.activeHoldLanes.fill(false);
      this.feverActive = false;
      this.feverCharge = 0;
      this.resetPooledTrackEffects();
      this.setRenderContext('menu');
    }
  }

  public triggerDefeatEffect(): void {
    this.mode = 'ended';
    this.clearDirectPointers();
    this.syncDirectTouchListeners();
    this.defeatFlash = 1.0;
    this.missWaveLife = this.missWaveMaxLife;
    this.spawnBurst(0, 0.35, HIT_LINE_Z, MISS_COLOR_HEX, 28, false);
  }

  public triggerVictoryEffect(): void {
    this.mode = 'ended';
    this.clearDirectPointers();
    this.syncDirectTouchListeners();
    this.spawnSurfaceWave(VICTORY_GOLD_HEX, 0.24);
    for (let i = 0; i < this.trackLayout.laneCount; i++) {
      const col = i % 2 === 0 ? this.primaryColorHex : VICTORY_GOLD_HEX;
      this.spawnBurst(this.trackLayout.laneX[i], 0.4, HIT_LINE_Z, col, 8, false);
      this.spawnLanePulse(i, col, 3.6);
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

    if (note.isChord) {
      const bucket = Math.round(note.time * 25);
      const prev = this.chordHitTracker.get(bucket);
      const nextCount = (prev?.count ?? 0) + 1;
      const minLane = prev ? Math.min(prev.minLane, note.lane) : note.lane;
      const maxLane = prev ? Math.max(prev.maxLane, note.lane) : note.lane;
      this.chordHitTracker.set(bucket, { count: nextCount, minLane, maxLane });
      if (nextCount === (note.chordGroupSize ?? 2)) {
        this.chordsHit++;
        this.spawnChordBeam(minLane, maxLane, this.feverActive ? FEVER_COLOR_A : this.accentColorHex);
      }
    }

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
        this.spawnSurfaceWave(FEVER_COLOR_A, 0.25);
        for (let l = 0; l < this.trackLayout.laneCount; l++) {
          this.spawnLanePulse(l, l % 2 === 0 ? FEVER_COLOR_A : FEVER_COLOR_B, 4.2);
        }
      }
    }

    const laneXPos = this.trackLayout.laneX[note.lane] ?? 0;
    const laneCol = this.getNoteDisplayColorHex(note);
    const hitStyle = note.customHitExplosion ?? 'sparks';

    if (hitStyle !== 'none') {
      const burstCount =
        hitStyle === 'ring'
          ? 4
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
      this.spawnBurst(laneXPos, 0.28, HIT_LINE_Z, laneCol, burstCount, false);

      this.spawnHitShockwave(
        laneXPos,
        laneCol,
        hitStyle === 'ring' || hitStyle === 'shockwave'
          ? 1.9
          : judgment === 'perfect'
            ? 1.65
            : 1.3,
        hitStyle === 'neon_flame',
      );

      if (hitStyle === 'burst') {
        this.spawnSurfaceWave(laneCol, 0.22);
      }
    }

    this.spawnLanePulse(
      note.lane,
      laneCol,
      note.patternTag === 'burst' ? 4.8 : 3.4,
    );

    if (note.patternTag === 'burst') {
      this.spawnSurfaceWave(BURST_COLOR_HEX, 0.16);
      this.cameraRig.triggerImpactZoom(0.45);
    }

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
    this.missWaveLife = this.missWaveMaxLife;
    this.spawnBurst(
      this.trackLayout.laneX[laneIdx],
      0.26,
      HIT_LINE_Z + 0.35,
      MISS_COLOR_HEX,
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
      const heldRatio = clamp((currentTime - hold.note.time) / totalDur, 0, 1);
      this.activeHolds.delete(id);

      if (heldRatio >= 0.78) {
        this.holdsCompleted++;
        const bonus = Math.round(95 * this.getActiveMultiplier());
        this.score += bonus;
        const laneCol = this.getNoteDisplayColorHex(hold.note);
        this.spawnHitShockwave(this.trackLayout.laneX[lane], laneCol, 1.65, false);
        this.spawnLanePulse(lane, laneCol, 3.8);
        this.spawnBurst(this.trackLayout.laneX[lane], 0.32, HIT_LINE_Z, laneCol, 12, false);
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

    const sweepLane = Math.max(
      0,
      Math.min(
        this.trackLayout.laneCount - 1,
        bestNote.lane + (dir === 'left' ? -1 : dir === 'right' ? 1 : 0),
      ),
    );
    this.laneFlash[sweepLane] = Math.max(this.laneFlash[sweepLane], 0.88);
    this.spawnLanePulse(bestNote.lane, this.noteAccentHex, 4.4);

    this.applySuccessHit(
      bestNote,
      matchesDir ? bestAbsDiff : bestWindow * 0.72,
      bestWindow,
      matchesDir ? 1.35 : 0.9,
      matchesDir ? 'FLICK!' : 'GOOD',
    );
  }

  public setDirectTouchEnabled(enabled: boolean): void {
    if (this.directTouchEnabled !== enabled) {
      this.directTouchEnabled = enabled;
      if (!enabled) {
        this.clearDirectPointers();
      }
    }
    this.syncDirectTouchListeners();
  }

  private clearDirectPointers(): void {
    if (this.directPointers.size > 0) {
      this.directPointers.clear();
      this.heldLanes.fill(false);
      this.activePointerLane = null;
    }
  }

  private syncDirectTouchListeners(): void {
    const shouldAttach =
      !this.disposed &&
      this.directTouchEnabled &&
      this.mode === 'playing' &&
      !(this.creatorPlaytestActive && this.creatorVisualOnly);

    const el = this.canvas;
    if (shouldAttach && !this.directTouchListenersAttached) {
      el.style.touchAction = 'none';
      el.addEventListener('pointerdown', this.handleCanvasPointerDown);
      el.addEventListener('pointermove', this.handleCanvasPointerMove);
      el.addEventListener('pointerup', this.handleCanvasPointerUpOrCancel);
      el.addEventListener('pointercancel', this.handleCanvasPointerUpOrCancel);
      this.directTouchListenersAttached = true;
    } else if (!shouldAttach && this.directTouchListenersAttached) {
      el.style.touchAction = '';
      el.removeEventListener('pointerdown', this.handleCanvasPointerDown);
      el.removeEventListener('pointermove', this.handleCanvasPointerMove);
      el.removeEventListener('pointerup', this.handleCanvasPointerUpOrCancel);
      el.removeEventListener('pointercancel', this.handleCanvasPointerUpOrCancel);
      this.directTouchListenersAttached = false;
      this.clearDirectPointers();
    }
  }

  private syncHeldLanesFromDirectPointers(): void {
    this.heldLanes.fill(false);
    let latestLane: number | null = null;
    for (const track of this.directPointers.values()) {
      if (
        !track.flickArmed &&
        track.currentLane >= 0 &&
        track.currentLane < this.trackLayout.laneCount
      ) {
        this.heldLanes[track.currentLane] = true;
        latestLane = track.currentLane;
      }
    }
    this.activePointerLane = latestLane;
  }

  private resolveDirectTouchNote(clientX: number, clientY: number): LevelNote | null {
    const level = this.activeLevel;
    if (!level) return null;

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const trackHit = this.cameraRig.unprojectToPlane(clientX, clientY, rect, 0.04);
    const noteHit = this.cameraRig.unprojectToPlane(clientX, clientY, rect, 0.21);
    const planePt = trackHit ?? noteHit;

    const currentTime = this.getGameplayCurrentTime();
    const speed = level.noteSpeed;
    const halfLaneX = this.trackLayout.laneStep * 0.52;
    const hitLineZoneHalfZ = 1.55;

    let bestNote: LevelNote | null = null;
    let bestRank = Infinity;

    for (let i = this.nextSearchIdx; i < level.notes.length; i++) {
      const note = level.notes[i];
      const baseHw = this.getNoteHitWindow(note);
      const hw = note.kind === 'flick' ? baseHw * 1.15 : baseHw;
      if (note.time - currentTime > hw) break;
      if (note.hit || note.missed) continue;

      const absTimeDiff = Math.abs(note.time - currentTime);
      if (absTimeDiff > hw) continue;

      const laneX = this.trackLayout.laneX[note.lane];
      if (laneX === undefined) continue;
      const noteZ = HIT_LINE_Z - (note.time - currentTime) * speed;

      if (noteZ < HIT_LINE_Z - Math.max(2.6, hw * speed + 0.35) || noteZ > DESPAWN_Z + 0.5) {
        continue;
      }

      let matched = false;
      let spatialDist = Infinity;

      if (
        planePt &&
        Math.abs(planePt.x - laneX) <= halfLaneX &&
        (Math.abs(planePt.z - noteZ) <= 1.05 ||
          (Math.abs(planePt.z - HIT_LINE_Z) <= hitLineZoneHalfZ &&
            Math.abs(noteZ - HIT_LINE_Z) <= 2.3))
      ) {
        matched = true;
        spatialDist = Math.hypot(planePt.x - laneX, planePt.z - noteZ);
      } else {
        // Fallback screen-space bounding test around projected note head
        const proj = this.cameraRig.projectPoint(laneX, 0.18, noteZ, rect.width, rect.height);
        if (proj) {
          const px = clientX - rect.left;
          const py = clientY - rect.top;
          const halfHitPx = Math.max(26, proj.scale * halfLaneX * 1.15);
          const halfHitPy = Math.max(28, proj.scale * 0.72);
          if (Math.abs(px - proj.x) <= halfHitPx && Math.abs(py - proj.y) <= halfHitPy) {
            matched = true;
            spatialDist = Math.hypot((px - proj.x) / halfHitPx, (py - proj.y) / halfHitPy) * 0.5;
          }
        }
      }

      if (!matched) continue;

      const rank = absTimeDiff + spatialDist * 0.04;
      if (rank < bestRank) {
        bestRank = rank;
        bestNote = note;
      }
    }

    return bestNote;
  }

  private resolveTrackLaneFromClient(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const pt = this.cameraRig.unprojectToPlane(clientX, clientY, rect, 0.04);
    if (!pt) return null;

    if (
      Math.abs(pt.x) > this.trackLayout.roadWidth * 0.65 ||
      pt.z < -16 ||
      pt.z > DESPAWN_Z + 2.5
    ) {
      return null;
    }

    const rawLane = pt.x / this.trackLayout.laneStep + (this.trackLayout.laneCount - 1) / 2;
    return Math.max(0, Math.min(this.trackLayout.laneCount - 1, Math.round(rawLane)));
  }

  private handleCanvasPointerDown = (e: PointerEvent): void => {
    if (!this.directTouchEnabled || this.mode !== 'playing' || !this.activeLevel) return;
    if (this.creatorPlaytestActive && this.creatorVisualOnly) return;

    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic pointer events
    }

    const hitNote = this.resolveDirectTouchNote(e.clientX, e.clientY);
    if (hitNote) {
      const isFlick = hitNote.kind === 'flick';
      this.directPointers.set(e.pointerId, {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startTime: performance.now(),
        startLane: hitNote.lane,
        currentLane: hitNote.lane,
        flickArmed: isFlick,
        flickSent: false,
      });

      if (isFlick) {
        this.laneFlash[hitNote.lane] = Math.max(this.laneFlash[hitNote.lane], 0.72);
      } else {
        this.handleLaneInput(hitNote.lane);
      }
      return;
    }

    if (this.activeSlides.size > 0) {
      const trackLane = this.resolveTrackLaneFromClient(e.clientX, e.clientY);
      if (trackLane !== null) {
        this.directPointers.set(e.pointerId, {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          startTime: performance.now(),
          startLane: trackLane,
          currentLane: trackLane,
          flickArmed: false,
          flickSent: false,
        });
        this.syncHeldLanesFromDirectPointers();
        this.handleLaneSlideMove(trackLane);
      }
    }
  };

  private handleCanvasPointerMove = (e: PointerEvent): void => {
    const track = this.directPointers.get(e.pointerId);
    if (!track) return;

    if (track.flickArmed && !track.flickSent) {
      const dx = e.clientX - track.startX;
      const dy = e.clientY - track.startY;
      const dist = Math.hypot(dx, dy);
      const elapsed = performance.now() - track.startTime;

      if (dist >= 22 && elapsed <= 220) {
        let dir: FlickDirection = 'up';
        if (Math.abs(dx) > Math.abs(dy) * 1.15) {
          dir = dx < 0 ? 'left' : 'right';
        } else if (dy < -16) {
          dir = 'up';
        } else {
          dir = dx < 0 ? 'left' : 'right';
        }
        track.flickSent = true;
        this.handleLaneFlick(track.startLane, dir);
      }
    }

    if (this.activeSlides.size > 0) {
      const nextLane = this.resolveTrackLaneFromClient(e.clientX, e.clientY);
      if (nextLane !== track.currentLane) {
        track.currentLane = nextLane ?? -1;
        this.syncHeldLanesFromDirectPointers();
        if (nextLane !== null) {
          this.handleLaneSlideMove(nextLane);
        }
      }
    }
  };

  private handleCanvasPointerUpOrCancel = (e: PointerEvent): void => {
    const track = this.directPointers.get(e.pointerId);
    if (!track) return;
    const releasedLane = track.currentLane;
    const wasFlickOnly = track.flickArmed;
    this.directPointers.delete(e.pointerId);

    try {
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }

    if (wasFlickOnly) return;

    let laneStillHeld = false;
    for (const other of this.directPointers.values()) {
      if (!other.flickArmed && other.currentLane === releasedLane) {
        laneStillHeld = true;
        break;
      }
    }

    this.syncHeldLanesFromDirectPointers();
    if (!laneStillHeld && releasedLane >= 0 && releasedLane < this.trackLayout.laneCount) {
      this.handleLaneRelease(releasedLane);
    }
  };

  private getExpectedSlideLane(note: LevelNote, currentTime: number): number {
    const path = note.slidePath;
    if (!path || path.length === 0) return note.lane;
    const elapsed = Math.max(0, currentTime - note.time);
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      if (elapsed <= b.timeOffset) {
        const span = Math.max(0.001, b.timeOffset - a.timeOffset);
        const t = clamp((elapsed - a.timeOffset) / span, 0, 1);
        return lerp(a.lane, b.lane, t);
      }
    }
    return path[path.length - 1].lane;
  }

  private getNoteDisplayColorHex(note: LevelNote): string {
    if (this.feverActive) {
      return note.lane % 2 === 0 ? FEVER_COLOR_A : FEVER_COLOR_B;
    }
    if (note.customColor) {
      if (
        note.customSecondaryColor &&
        note.customColorComboMode &&
        note.customColorComboMode !== 'solid'
      ) {
        if (note.customColorComboMode === 'alternating') {
          return note.id % 2 === 0 ? note.customColor : note.customSecondaryColor;
        }
        if (note.customColorComboMode === 'gradient') {
          const blend = 0.5 + 0.5 * Math.sin(this.elapsedSec * 3.2 + note.id * 0.6);
          return lerpHex(note.customColor, note.customSecondaryColor, blend);
        }
        return lerpHex(note.customColor, note.customSecondaryColor, note.lane % 2 === 0 ? 0.25 : 0.75);
      }
      return note.customColor;
    }
    return resolveNoteColorHex(
      note.id,
      note.lane,
      note.kind,
      this.chromaticColA,
      this.chromaticColB,
      this.chromaticColAccent,
      this.currentTheme,
    );
  }

  private spawnHitShockwave(
    x: number,
    colorHex: string,
    maxRadius = 1.6,
    isFlame = false,
  ): void {
    const reduced = Boolean(this.settings.visualsConfig?.reducedFlash);
    for (let i = 0; i < this.shockwaves.length; i++) {
      const s = this.shockwaves[i];
      if (s.active) continue;
      s.active = true;
      s.x = x;
      s.y = 0.06;
      s.z = HIT_LINE_Z;
      s.maxLife = reduced ? 0.28 : 0.38;
      s.life = s.maxLife;
      s.maxRadius = maxRadius;
      s.color = colorHex;
      s.secondaryColor = VICTORY_GOLD_HEX;
      s.isFlame = isFlame && !reduced && this.getEffectiveQuality() !== 'low';
      return;
    }
  }

  private spawnLanePulse(lane: number, colorHex: string, length = 3.5): void {
    const perfMode = this.settings.performanceConfig?.performanceMode ?? 'quality';
    if (perfMode === 'battery' && Math.random() > 0.55) return;
    const safeLane = Math.max(0, Math.min(this.trackLayout.laneCount - 1, lane));
    for (let i = 0; i < this.lanePulses.length; i++) {
      const p = this.lanePulses[i];
      if (p.active) continue;
      p.active = true;
      p.lane = safeLane;
      p.z = HIT_LINE_Z - 0.3;
      p.maxLife = 0.65;
      p.life = p.maxLife;
      p.length = length;
      p.color = colorHex;
      return;
    }
  }

  private spawnSurfaceWave(colorHex: string, maxAlpha = 0.22): void {
    void maxAlpha;
    for (let i = 0; i < this.surfaceWaves.length; i++) {
      const w = this.surfaceWaves[i];
      if (w.active) continue;
      w.active = true;
      w.z = HIT_LINE_Z - 0.5;
      w.maxLife = 0.95;
      w.life = w.maxLife;
      w.color = colorHex;
      return;
    }
  }

  private spawnChordBeam(minLane: number, maxLane: number, colorHex: string): void {
    const x1 = this.trackLayout.laneX[minLane] ?? 0;
    const x2 = this.trackLayout.laneX[maxLane] ?? 0;
    if (Math.abs(x2 - x1) < 0.2) return;
    for (let i = 0; i < this.chordBeams.length; i++) {
      const b = this.chordBeams[i];
      if (b.active) continue;
      b.active = true;
      b.x1 = x1;
      b.x2 = x2;
      b.z = HIT_LINE_Z;
      b.maxLife = 0.28;
      b.life = b.maxLife;
      b.color = colorHex;
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
    colorHex: string,
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
      p.x = x + (Math.random() - 0.5) * 0.45;
      p.y = y;
      p.z = z + (Math.random() - 0.5) * 0.25;
      p.vx = (Math.random() - 0.5) * (downwardMiss ? 6.5 : 5.2);
      p.vy = downwardMiss ? 0.5 + Math.random() * 1.6 : 2.2 + Math.random() * 4.8;
      p.vz = (Math.random() - 0.5) * 4.2;
      p.maxLife = downwardMiss ? 0.32 + Math.random() * 0.16 : 0.38 + Math.random() * 0.24;
      p.life = p.maxLife;
      p.size = ((downwardMiss ? 0.85 : 0.75) + Math.random() * 0.85) * 0.08;
      p.color = colorHex;
      spawned++;
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
      this.lastTickPerfMs = performance.now();
      this.lastRenderTimeMs = 0;
      this.accumulatedMenuDt = 0;
      this.startLoop();
    }
  }

  private getTargetFrameIntervalMs(): number {
    if (this.renderContext === 'gameplay' || this.renderContext === 'playtest') {
      return 0;
    }
    if (this.renderContext === 'paused') {
      return this.mode === 'ended' ? 50 : 250;
    }
    const effQuality = this.getEffectiveQuality();
    if (effQuality === 'low' || this.settings.performanceConfig?.performanceMode === 'battery') {
      return 44;
    }
    return this.isMobileGpu ? 34 : 32;
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

      const rawDt = Math.max(0, (nowMs - (this.lastTickPerfMs || nowMs)) / 1000);
      this.lastTickPerfMs = nowMs;

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
      this.frameId = requestAnimationFrame(tick);
    };

    this.frameId = requestAnimationFrame(tick);
  }

  private updateChromaticProgression(dt: number, beatPulse: number): void {
    const visualConfig = this.settings.visualsConfig;

    const dynamicPalette = this.chromaticEngine.update({
      basePalette: this.currentPalette,
      worldTheme: this.currentTheme,
      section: this.currentSection,
      energy: this.smoothedEnergy,
      beatPulse,
      elapsed: this.elapsedSec,
      bpm: this.activeProfile?.bpm ?? 120,
      dt,
      intensity: visualConfig?.glowIntensity ?? 1.0,
      flashIntensity: visualConfig?.flashIntensity ?? 0.65,
      reducedFlash: Boolean(visualConfig?.reducedFlash),
      screenEffects: visualConfig?.screenEffects !== false,
      feverActive: this.feverActive,
      brightnessScale: this.getEffectiveBrightness(),
    });

    this.chromaticColA = dynamicPalette.primary;
    this.chromaticColB = dynamicPalette.secondary;
    this.chromaticColAccent = dynamicPalette.accent;

    this.primaryColorHex = this.chromaticColA;
    this.secondaryColorHex = this.chromaticColB;
    this.accentColorHex = this.chromaticColAccent;

    this.trackState.trackPrimaryHex = this.feverActive ? FEVER_COLOR_A : this.chromaticColA;
    this.trackState.trackSecondaryHex = this.feverActive ? FEVER_COLOR_B : this.chromaticColB;
    this.trackState.trackAccentHex = this.chromaticColAccent;
  }

  private update(dt: number, rawDt = dt): void {
    this.elapsedSec += dt;

    if (
      this.settings.performanceConfig?.performanceMode === 'auto' &&
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
          this.applyCanvasResolution();
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
      this.mode === 'idle' ? menuAmbientAudio.getAmbientBands(this.elapsedSec) : null;

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

    this.smoothedSubBass = damp(
      this.smoothedSubBass,
      audioState.subBass * (audioCfg?.subBassWeight ?? 1.0),
      10,
      dt,
    );
    this.smoothedBass = damp(
      this.smoothedBass,
      audioState.bass * (audioCfg?.bassWeight ?? 1.15),
      14,
      dt,
    );
    this.smoothedLowMid = damp(this.smoothedLowMid, audioState.lowMid, 14, dt);
    this.smoothedMid = damp(
      this.smoothedMid,
      audioState.mid * (audioCfg?.midWeight ?? 1.0),
      14,
      dt,
    );
    this.smoothedHighMid = damp(
      this.smoothedHighMid,
      audioState.highMid * (audioCfg?.highMidWeight ?? 1.0),
      16,
      dt,
    );
    this.smoothedTreble = damp(
      this.smoothedTreble,
      audioState.treble * (audioCfg?.trebleWeight ?? 1.05),
      18,
      dt,
    );
    this.smoothedHigh = damp(this.smoothedHigh, audioState.high, 15, dt);
    this.smoothedEnergy = damp(this.smoothedEnergy, audioState.energy, 12, dt);

    const rawBass = audioState.bass;
    const bassTransient = Math.max(0, rawBass - this.prevRawBass);
    this.prevRawBass = rawBass;
    this.bassTransientCooldown = Math.max(0, this.bassTransientCooldown - dt);

    const inSilence =
      this.mode === 'playing' && this.isTimeInProfileSilence(audioState.currentTime);

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
      this.spawnSurfaceWave(this.feverActive ? FEVER_COLOR_A : this.primaryColorHex, 0.15);
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
      this.spawnSurfaceWave(this.feverActive ? FEVER_COLOR_A : this.secondaryColorHex, 0.24);
      for (let l = 0; l < this.trackLayout.laneCount; l++) {
        this.spawnLanePulse(l, l % 2 === 0 ? this.primaryColorHex : this.secondaryColorHex, 3.8);
      }
    }

    if (this.mode === 'playing' && this.feverActive) {
      this.feverRemainingSec = Math.max(0, this.feverRemainingSec - dt);
      if (this.feverRemainingSec <= 0) {
        this.feverActive = false;
      }
    }

    if (this.mode === 'playing' && this.activeProfile && audioCfg?.beatDetectionEnabled !== false) {
      const beats = this.activeProfile.beats;
      while (this.nextBeatIdx < beats.length && beats[this.nextBeatIdx] <= audioState.currentTime) {
        if (audioState.currentTime - beats[this.nextBeatIdx] < 0.08) {
          this.cameraRig.triggerBeatPulse(0.32 + this.smoothedBass * 0.35, false);
          if (reactive && !inSilence) {
            const pulseLane = this.nextBeatIdx % this.trackLayout.laneCount;
            this.spawnLanePulse(
              pulseLane,
              pulseLane % 2 === 0 ? this.primaryColorHex : this.secondaryColorHex,
              2.8,
            );
            if (this.nextBeatIdx % 2 === 0) {
              this.spawnSurfaceWave(this.feverActive ? FEVER_COLOR_A : this.accentColorHex, 0.12);
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
          this.cameraRig.setPreDropTension(1 - distToDrop / 2.2);
        } else if (distToDrop <= 0 && distToDrop > -0.1) {
          this.cameraRig.triggerBeatPulse(1.0, true);
          audioEngine.playDropImpactSound();
          this.dropScreenPulse = 1.0;
          this.spawnSurfaceWave(this.feverActive ? FEVER_COLOR_A : this.secondaryColorHex, 0.25);
          this.nextDropIdx++;
        } else {
          this.cameraRig.setPreDropTension(0);
        }
      }
    }

    this.dropScreenPulse = Math.max(0, this.dropScreenPulse - dt * 2.4);

    const scrollSpeed =
      this.mode === 'playing' && this.activeLevel
        ? this.activeLevel.noteSpeed * 0.145 * (inSilence ? 0.75 : 1.0)
        : this.mode === 'idle'
          ? 1.85 * menuVisualMult
          : 0;
    this.roadScrollOffset = (this.roadScrollOffset + scrollSpeed * dt) % 1;

    this.updateChromaticProgression(dt, this.smoothedBass);

    // Sync AudioVisualBands for 2.5D painters & track
    const glowScale =
      (this.settings.visualsConfig?.glowIntensity ?? 1.0) *
      getPresetById(this.settings.visualsConfig?.preset ?? 'auto').glowScale;
    const partScale =
      (this.settings.particleIntensity === 'low'
        ? 0.45
        : this.settings.particleIntensity === 'medium'
          ? 0.78
          : 1.05) * (this.settings.visualsConfig?.particleIntensityValue ?? 1.0);

    const creatorBgBright =
      this.creatorPlaytestActive && this.creatorEffectsOverride?.bgBrightness !== undefined
        ? this.creatorEffectsOverride.bgBrightness
        : 1;

    this.bands.subBass = this.smoothedSubBass;
    this.bands.bass = this.smoothedBass;
    this.bands.lowMid = this.smoothedLowMid;
    this.bands.mid = this.smoothedMid;
    this.bands.highMid = this.smoothedHighMid;
    this.bands.treble = this.smoothedTreble;
    this.bands.high = this.smoothedHigh;
    this.bands.energy = this.smoothedEnergy;
    this.bands.kickPulse = reactive && !inSilence ? this.kickPulse : 0;
    this.bands.snarePulse = reactive && !inSilence ? this.snarePulse : 0;
    this.bands.hihatPulse = reactive && !inSilence ? this.hihatPulse : 0;
    this.bands.dropFlash = this.dropScreenPulse;
    this.bands.bassTransient = bassTransient;
    this.bands.sectionType = this.currentSection;
    this.bands.feverActive = this.feverActive;
    this.bands.isMenu = this.isMenuMode && !this.tutorialBackdropOverride;
    this.bands.reactiveEnabled = reactive;
    this.bands.reducedFlash = Boolean(this.settings.visualsConfig?.reducedFlash);
    this.bands.glowScale = glowScale;
    this.bands.bloomScale = this.settings.visualsConfig?.bloomIntensity ?? 1.0;
    this.bands.brightnessScale = clamp(this.getEffectiveBrightness() * creatorBgBright, 0.4, 1.5);
    this.bands.sideBrightness = this.settings.visualsConfig?.sideBrightness ?? 0.85;
    this.bands.particleScale = partScale;
    this.bands.reflectionQuality = this.settings.reflectionQuality;
    this.bands.graphicsQuality = this.getEffectiveQuality();

    // Update lane flashes & active hold indicators
    for (let i = 0; i < this.trackLayout.laneCount; i++) {
      const isHeld = this.heldLanes[i];
      this.laneFlash[i] = isHeld
        ? Math.max(0.55, this.laneFlash[i] - dt * 4.5)
        : Math.max(0, this.laneFlash[i] - dt * 6.8);
      this.laneMissFlash[i] = Math.max(0, this.laneMissFlash[i] - dt * 3.8);
      this.activeHoldLanes[i] = false;
    }
    for (const hold of this.activeHolds.values()) {
      if (hold.note.lane >= 0 && hold.note.lane < this.activeHoldLanes.length) {
        this.activeHoldLanes[hold.note.lane] = true;
      }
    }

    // Update pooled VFX (counting down life -> 0 so PerspectiveTrack fades cleanly)
    for (let i = 0; i < this.lanePulses.length; i++) {
      const lp = this.lanePulses[i];
      if (!lp.active) continue;
      lp.life -= dt;
      lp.z -= 28 * dt;
      if (lp.life <= 0 || lp.z < SPAWN_Z) {
        lp.active = false;
      }
    }

    for (let i = 0; i < this.surfaceWaves.length; i++) {
      const sw = this.surfaceWaves[i];
      if (!sw.active) continue;
      sw.life -= dt;
      sw.z -= 34 * dt;
      if (sw.life <= 0 || sw.z < SPAWN_Z) {
        sw.active = false;
      }
    }

    for (let i = 0; i < this.shockwaves.length; i++) {
      const sw = this.shockwaves[i];
      if (!sw.active) continue;
      sw.life -= dt;
      if (sw.life <= 0) sw.active = false;
    }

    for (let i = 0; i < this.chordBeams.length; i++) {
      const cb = this.chordBeams[i];
      if (!cb.active) continue;
      cb.life -= dt;
      if (cb.life <= 0) cb.active = false;
    }

    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      if (!pt.active) continue;
      pt.life -= dt;
      if (pt.life <= 0) {
        pt.active = false;
        continue;
      }
      pt.vy -= 9.5 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z += pt.vz * dt;
    }

    this.missWaveLife = Math.max(0, this.missWaveLife - dt * 3.2);
    this.defeatFlash = Math.max(0, this.defeatFlash - dt * 1.4);

    // Update Camera Rig
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
      isMenu: this.isMenuMode && !this.tutorialBackdropOverride,
      menuParallaxX: this.menuParallaxX,
      menuParallaxY: this.menuParallaxY,
      menuAnimationsEnabled: this.settings.menuAmbientConfig?.menuAnimationsEnabled !== false,
    });

    if (this.creatorPlaytestActive && this.creatorCameraOverride) {
      this.cameraRig.applyCreatorOverride(this.creatorCameraOverride, this.elapsedSec);
    }

    this.trackState.trackScroll = this.roadScrollOffset;
    this.trackState.elapsed = this.elapsedSec;
    this.trackState.missWaveLife = this.missWaveLife;

    if (this.mode === 'playing' && this.activeLevel) {
      const playTime = this.getGameplayCurrentTime();
      this.updateActiveHolds(playTime);
      this.updateActiveSlides(playTime, dt);
      this.updateActiveNotes(playTime);
    } else {
      this.trackState.activeSlideCursor.active = false;
      this.noteRenderQueue.length = 0;
    }
  }

  private updateActiveHolds(currentTime: number): void {
    for (const [id, hold] of this.activeHolds.entries()) {
      const lane = hold.note.lane;
      if (!this.heldLanes[lane]) continue;

      this.laneFlash[lane] = 0.85;
      const laneCol = this.getNoteDisplayColorHex(hold.note);
      if (currentTime - hold.lastTickTime >= 0.13) {
        hold.lastTickTime = currentTime;
        const tickPts = Math.round(18 * this.getActiveMultiplier());
        this.score += tickPts;
        hold.pointsAccumulated += tickPts;
        this.spawnBurst(this.trackLayout.laneX[lane], 0.26, HIT_LINE_Z, laneCol, 3, false);
        if (Math.random() < 0.48) {
          this.spawnLanePulse(lane, laneCol, 3.0);
        }
      }

      if (currentTime >= hold.endTime - 0.05) {
        this.activeHolds.delete(id);
        this.holdsCompleted++;
        const bonus = Math.round(95 * this.getActiveMultiplier());
        this.score += bonus;
        this.spawnHitShockwave(this.trackLayout.laneX[lane], laneCol, 1.75, false);
        this.spawnLanePulse(lane, laneCol, 3.8);
        this.spawnBurst(this.trackLayout.laneX[lane], 0.35, HIT_LINE_Z, laneCol, 14, false);
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
      const clampedFloor = Math.max(
        0,
        Math.min(this.trackLayout.laneCount - 1, Math.floor(expectedLaneFloat)),
      );
      const clampedCeil = Math.max(
        0,
        Math.min(this.trackLayout.laneCount - 1, Math.ceil(expectedLaneFloat)),
      );
      const lanePos = lerp(
        this.trackLayout.laneX[clampedFloor] ?? 0,
        this.trackLayout.laneX[clampedCeil] ?? 0,
        expectedLaneFloat - Math.floor(expectedLaneFloat),
      );

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
          this.trackState.activeSlideCursor.active = true;
          this.trackState.activeSlideCursor.x = lanePos;
          this.trackState.activeSlideCursor.z = HIT_LINE_Z;
          this.trackState.activeSlideCursor.colorHex = this.feverActive
            ? FEVER_COLOR_A
            : SLIDE_COMPLETE_COLOR_HEX;
        }

        if (currentTime - slide.lastTickTime >= 0.11 || nearestLane !== slide.lastPlayedLane) {
          if (nearestLane !== slide.lastPlayedLane) {
            slide.lastPlayedLane = nearestLane;
            this.spawnLanePulse(clampedNearest, SLIDE_COMPLETE_COLOR_HEX, 3.2);
          }
          slide.lastTickTime = currentTime;
          this.score += Math.round(22 * this.getActiveMultiplier());
          this.spawnBurst(lanePos, 0.28, HIT_LINE_Z, SLIDE_COMPLETE_COLOR_HEX, 3, false);
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
        this.spawnHitShockwave(endX, SLIDE_COMPLETE_COLOR_HEX, 1.75, false);
        this.spawnLanePulse(
          Math.max(0, Math.min(this.trackLayout.laneCount - 1, nearestLane)),
          SLIDE_COMPLETE_COLOR_HEX,
          3.8,
        );
        this.spawnBurst(endX, 0.36, HIT_LINE_Z, SLIDE_COMPLETE_COLOR_HEX, 15, false);
      }
    }

    if (!cursorShown) {
      this.trackState.activeSlideCursor.active = false;
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

    this.noteRenderQueue.length = 0;
    const lookAheadSec = (HIT_LINE_Z - SPAWN_Z) / speed + 0.35;
    let precisionActiveNow = false;

    for (let i = this.nextSearchIdx; i < notes.length; i++) {
      const note = notes[i];
      const isHeldActive = this.activeHolds.has(note.id);
      const isSlideActive = this.activeSlides.has(note.id);

      if ((note.hit || note.missed) && !isHeldActive && !isSlideActive) continue;

      const hw = this.getNoteHitWindow(note);
      const timeUntilHit = note.time - currentTime;

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
      if (this.noteRenderQueue.length >= 96) continue;
      if (note.challengeSection && timeUntilHit < 1.2) {
        precisionActiveNow = true;
      }

      const z = isHeldActive || isSlideActive ? HIT_LINE_Z : HIT_LINE_Z - timeUntilHit * speed;
      if (!isHeldActive && !isSlideActive && (z < SPAWN_Z || z > DESPAWN_Z)) continue;

      let tailZ = z;
      if (note.kind === 'hold' && note.durationSec) {
        const remainingSec = isHeldActive
          ? Math.max(0.05, note.time + note.durationSec - currentTime)
          : note.durationSec;
        tailZ = (isHeldActive ? HIT_LINE_Z : z) - Math.max(0.25, remainingSec * speed);
      }

      const noteShape = note.customCasillaShape
        ? casillaShapeToConcreteShape(note.customCasillaShape)
        : this.currentShape;

      const primaryHex = this.getNoteDisplayColorHex(note);
      const secondaryHex = note.customSecondaryColor || this.secondaryColorHex;

      this.noteRenderQueue.push({
        data: note,
        z,
        tailZ,
        colorHex: primaryHex,
        secondaryHex,
        shape: noteShape,
        flickDir: note.flickDir,
        holdStarted: isHeldActive,
        holdHeldNow: isHeldActive && Boolean(this.heldLanes[note.lane]),
        slideActive: isSlideActive,
        opacity: 1,
        proximityBoost: clamp(1 - Math.abs(timeUntilHit) / 0.45, 0, 1),
      });
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
          color: this.feverActive ? FEVER_COLOR_A : this.currentPalette.primary,
          edgeAlpha: flashAllowed ? clamp(bassEdge + dropEdge, 0, 0.45) : 0,
          feverAlpha: flashAllowed && this.feverActive ? 0.22 * flashScale : 0,
          dropRingPulse: flashAllowed ? this.dropScreenPulse * flashScale : 0,
        },
      });
    }
  }

  private renderSceneFrame(): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (w <= 0 || h <= 0) return;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const hasHorizon = this.cameraRig.projectPointInto(0, 0, -56, w, h, this.pHorizon);
    const horizonY = hasHorizon ? this.pHorizon.y : h * 0.44;
    const vanishX = hasHorizon ? this.pHorizon.x : w * 0.5;
    const pose = this.cameraRig.getPose();

    const showMenuBackdrop = this.isMenuMode && !this.tutorialBackdropOverride;

    // 1. Illustrated 2.5D Environment Backdrop (with offscreen static cache + dynamic reactive layers)
    this.scenarioPainters.render(ctx, {
      theme: this.currentTheme,
      width: w,
      height: h,
      dpr: this.dpr,
      elapsed: this.elapsedSec,
      trackScroll: this.roadScrollOffset,
      horizonScreenY: horizonY,
      vanishScreenX: vanishX,
      rollRad: pose.rollRad,
      parallaxX: showMenuBackdrop ? this.menuParallaxX : clamp(pose.camX * 0.65, -1, 1),
      parallaxY: showMenuBackdrop ? this.menuParallaxY : clamp((pose.camY - 3.2) * 0.5, -1, 1),
      palette: this.currentPalette,
      bands: this.bands,
    });

    // 2. Perspective Translucent Runway + Lane Receptors + Pulses
    this.perspectiveTrack.renderBaseTrack(ctx, this.cameraRig, w, h, this.trackState);

    // 3. 2.5D Extruded Notes + Hold Ribbons + Slide Curves + Flick Arrows
    if (this.mode === 'playing' && this.activeLevel && this.noteRenderQueue.length > 0) {
      this.noteRenderer.renderNotes(
        ctx,
        this.cameraRig,
        w,
        h,
        this.noteRenderQueue,
        this.trackLayout,
        this.getGameplayCurrentTime(),
        this.activeLevel.noteSpeed,
        this.elapsedSec,
        this.bands.glowScale,
        this.settings.reflectionQuality,
      );
    }

    // 4. Foreground Impact Shockwaves, Chord Beams, Slide Orb & Burst Particles
    this.perspectiveTrack.renderForegroundEffects(ctx, this.cameraRig, w, h, this.trackState);

    // 5. Optional subtle defeat crimson tint flash
    if (this.defeatFlash > 0.02) {
      ctx.fillStyle = `rgba(239, 68, 68, ${(this.defeatFlash * 0.24).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
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
    this.applyCanvasResolution();
    if (this.renderContext === 'paused' && !this.suspended && !this.isDocumentHidden) {
      this.pauseRenderDone = false;
      this.syncLoopState();
    }
  };

  public dispose(): void {
    this.disposed = true;
    this.directTouchEnabled = false;
    this.clearDirectPointers();
    this.syncDirectTouchListeners();
    this.stopLoop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('resize', this.handleResize);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    this.scenarioPainters.dispose();
    if (this.canvas.parentElement === this.container) {
      this.container.removeChild(this.canvas);
    }
  }
}
