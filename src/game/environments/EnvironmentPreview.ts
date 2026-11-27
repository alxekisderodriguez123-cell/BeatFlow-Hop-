import type { EnvironmentTheme, OfficialEnvironmentTheme, QualityLevel } from '../../types/game';
import { CameraRig, type ProjectedPoint } from '../CameraRig';
import { PerspectiveTrack } from '../engine25d/PerspectiveTrack';
import { ScenarioPainters } from '../engine25d/scenarios/ScenarioPainters';
import {
  computeTrackLayout,
  type AudioVisualBands,
  type TrackVisualState,
} from '../engine25d/types';
import { getEnvironmentDefinition } from './environmentDefinitions';
import { resolveSafeEnvironmentTheme } from './environmentSelector';

/**
 * Pure Canvas 2.5D Environment Preview Engine.
 * Renders the exact same ScenarioPainters + PerspectiveTrack visual pipeline as gameplay
 * at an isolated low-power ~30 FPS loop with adaptive DPR.
 */
export class EnvironmentPreview {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cameraRig: CameraRig;
  private scenarioPainters = new ScenarioPainters();
  private perspectiveTrack = new PerspectiveTrack();

  private disposed = false;
  private rafId = 0;
  private lastTickMs = 0;
  private elapsedSec = 0;
  private trackScroll = 0;
  private width = 420;
  private height = 240;
  private dpr = 1;

  private currentTheme: OfficialEnvironmentTheme;
  private currentQuality: QualityLevel;
  private orbitPhase = 0;
  private pHorizon: ProjectedPoint = { x: 0, y: 0, depth: 1, scale: 1 };
  private bands: AudioVisualBands;
  private trackState: TrackVisualState;

  constructor(
    container: HTMLElement,
    initialTheme: EnvironmentTheme,
    quality: QualityLevel = 'medium',
    onContextLost?: () => void,
  ) {
    void onContextLost;
    this.container = container;
    this.currentTheme = resolveSafeEnvironmentTheme(initialTheme);
    this.currentQuality = quality;

    this.width = Math.max(160, container.clientWidth || 420);
    this.height = Math.max(100, container.clientHeight || 240);

    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('No se pudo inicializar el contexto Canvas 2D de vista previa.');
    }
    this.ctx = ctx;
    container.appendChild(this.canvas);

    this.cameraRig = new CameraRig(this.width / this.height, 1.6);

    const layout = computeTrackLayout(4);
    const def = getEnvironmentDefinition(this.currentTheme);
    this.bands = {
      subBass: 0.42,
      bass: 0.46,
      lowMid: 0.36,
      mid: 0.42,
      highMid: 0.35,
      treble: 0.3,
      high: 0.33,
      energy: 0.48,
      kickPulse: 0.25,
      snarePulse: 0.2,
      hihatPulse: 0.18,
      dropFlash: 0,
      bassTransient: 0,
      sectionType: 'groove',
      feverActive: false,
      isMenu: true,
      reactiveEnabled: true,
      reducedFlash: false,
      glowScale: 1,
      bloomScale: 1,
      brightnessScale: 1,
      sideBrightness: 0.9,
      particleScale: 0.85,
      reflectionQuality: 'low',
      graphicsQuality: quality,
    };

    this.trackState = {
      layout,
      palette: { ...def.colorPalette },
      trackPrimaryHex: def.colorPalette.primary,
      trackSecondaryHex: def.colorPalette.secondary,
      trackAccentHex: def.colorPalette.accent,
      trackScroll: 0,
      elapsed: 0,
      laneFlash: [0, 0, 0, 0],
      laneMissFlash: [0, 0, 0, 0],
      activeHoldLanes: [false, false, false, false],
      activeSlideCursor: {
        active: false,
        x: 0,
        z: 1.6,
        colorHex: def.colorPalette.primary,
      },
      missWaveLife: 0,
      missWaveMaxLife: 1,
      bands: this.bands,
      particles: [],
      shockwaves: [],
      lanePulses: [],
      surfaceWaves: [],
      chordBeams: [],
    };

    this.resize();
    this.loadTheme(initialTheme, quality);
    this.startLoop();
  }

  public loadTheme(theme: EnvironmentTheme, quality: QualityLevel = this.currentQuality): void {
    if (this.disposed) return;
    const safeTheme = resolveSafeEnvironmentTheme(theme);
    this.currentTheme = safeTheme;
    this.currentQuality = quality;
    const def = getEnvironmentDefinition(safeTheme);

    this.trackState.palette = { ...def.colorPalette };
    this.trackState.trackPrimaryHex = def.colorPalette.primary;
    this.trackState.trackSecondaryHex = def.colorPalette.secondary;
    this.trackState.trackAccentHex = def.colorPalette.accent;
    this.bands.graphicsQuality = quality;
    this.scenarioPainters.invalidateCache();

    this.stepSimulation(1 / 30);
    this.renderFrame();
  }

  public resize(): void {
    if (this.disposed) return;
    const w = Math.max(160, this.container.clientWidth || 420);
    const h = Math.max(100, this.container.clientHeight || 240);
    const maxDpr = this.currentQuality === 'low' ? 1 : 1.35;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);

    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.cameraRig.updateFraming(w / h, this.trackState.layout.roadWidth);
    this.scenarioPainters.invalidateCache();
    this.renderFrame();
  }

  private stepSimulation(dt: number): void {
    this.elapsedSec += dt;
    this.orbitPhase += dt * 0.45;
    this.trackScroll = (this.trackScroll + dt * 1.65) % 1;

    const beatCycle = (this.elapsedSec * 2.0) % 1;
    const kick = Math.pow(Math.max(0, 1 - beatCycle * 3.8), 2);
    const snare = Math.pow(Math.max(0, 1 - (((this.elapsedSec * 2.0 + 0.5) % 1) * 4.2)), 2);
    const hihat = Math.pow(Math.max(0, 1 - (((this.elapsedSec * 4.0) % 1) * 5.0)), 2);

    this.bands.subBass = 0.4 + kick * 0.45;
    this.bands.bass = 0.44 + kick * 0.4;
    this.bands.lowMid = 0.36 + snare * 0.32;
    this.bands.mid = 0.42 + snare * 0.3;
    this.bands.highMid = 0.34 + hihat * 0.34;
    this.bands.treble = 0.3 + hihat * 0.3;
    this.bands.high = 0.32 + hihat * 0.3;
    this.bands.energy = 0.46 + Math.sin(this.elapsedSec * 1.1) * 0.16 + kick * 0.22;
    this.bands.kickPulse = kick;
    this.bands.snarePulse = snare;
    this.bands.hihatPulse = hihat;

    this.trackState.trackScroll = this.trackScroll;
    this.trackState.elapsed = this.elapsedSec;
    this.trackState.laneFlash[0] = kick * 0.45;
    this.trackState.laneFlash[1] = snare * 0.35;
    this.trackState.laneFlash[2] = hihat * 0.35;
    this.trackState.laneFlash[3] = kick * 0.45;

    this.cameraRig.update(dt, {
      subBass: this.bands.subBass,
      bass: this.bands.bass,
      mid: this.bands.mid,
      high: this.bands.high,
      energy: this.bands.energy,
      bassTransient: kick * 0.4,
      bpm: 120,
      isPlaying: false,
      isMenu: true,
      menuParallaxX: Math.sin(this.orbitPhase) * 0.65,
      menuParallaxY: Math.cos(this.orbitPhase * 0.7) * 0.35,
      menuAnimationsEnabled: true,
      reactiveEnabled: true,
      visualIntensity: 'medium',
      inSilence: false,
      sectionType: 'groove',
      feverActive: false,
      cameraConfig: {
        enabled: true,
        staticView: false,
        reducedMotion: false,
        smoothTransitions: true,
        overallIntensity: 0.75,
        dynamicZoom: { enabled: true, intensity: 0.75 },
        horizontalOffset: { enabled: true, intensity: 0.75 },
        verticalOffset: { enabled: true, intensity: 0.7 },
        tilt: { enabled: true, intensity: 0.65 },
        pullBack: { enabled: true, intensity: 0.7 },
        cameraShake: { enabled: false, intensity: 0 },
      },
    });
  }

  private renderFrame(): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const hasHorizon = this.cameraRig.projectPointInto(0, 0, -56, w, h, this.pHorizon);
    const horizonY = hasHorizon ? this.pHorizon.y : h * 0.44;
    const vanishX = hasHorizon ? this.pHorizon.x : w * 0.5;
    const pose = this.cameraRig.getPose();

    this.scenarioPainters.render(ctx, {
      theme: this.currentTheme,
      width: w,
      height: h,
      dpr: this.dpr,
      elapsed: this.elapsedSec,
      trackScroll: this.trackScroll,
      horizonScreenY: horizonY,
      vanishScreenX: vanishX,
      rollRad: pose.rollRad,
      parallaxX: Math.sin(this.orbitPhase) * 0.45,
      parallaxY: Math.cos(this.orbitPhase * 0.7) * 0.25,
      palette: this.trackState.palette,
      bands: this.bands,
    });

    this.perspectiveTrack.renderBaseTrack(ctx, this.cameraRig, w, h, this.trackState);
    ctx.restore();
  }

  private startLoop(): void {
    const minIntervalMs = 33; // ~30 FPS low-power preview loop
    const loop = (now: number) => {
      if (this.disposed) return;
      if (now - this.lastTickMs >= minIntervalMs) {
        const dt = Math.min(0.08, Math.max(0.016, (now - this.lastTickMs) / 1000));
        this.lastTickMs = now;
        this.stepSimulation(dt);
        this.renderFrame();
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.lastTickMs = performance.now();
    this.rafId = requestAnimationFrame(loop);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.scenarioPainters.dispose();
    if (this.canvas.parentElement === this.container) {
      this.container.removeChild(this.canvas);
    }
  }
}
