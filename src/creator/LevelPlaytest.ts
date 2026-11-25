import type { FlickDirection, MusicalSectionType, QualityLevel } from '../types/game';
import type { BeatflowLevelDocument } from '../types/creator';
import { audioEngine } from '../services/audioEngine';
import { ChromaticEngine } from '../services/chromaticEngine';
import { MusicReactiveLighting, type ReactiveLightingOutput } from '../game/MusicReactiveLighting';
import { AnimationController, type ObjectRuntimeState } from './AnimationController';
import { CameraController, type ResolvedCameraState } from './CameraController';
import { EffectController, type ResolvedScreenEffectsState } from './EffectController';
import { TriggerSystem, type TriggerDebugLogEntry } from './TriggerSystem';
import { validateLevelDocument, type LevelValidationReport } from './LevelValidator';
import { CustomGameplayRuntime, type CustomRuntimeStats } from './CustomGameplayRuntime';

export interface PlaytestOptions {
  startTimeSec: number;
  speedScale: number; // 0.25 .. 2.0
  visualOnly: boolean;
  hasAudioBuffer: boolean;
  deviceQuality: QualityLevel;
}

export interface PlaytestInspectionSnapshot {
  running: boolean;
  paused: boolean;
  currentTime: number;
  speedScale: number;
  visualOnly: boolean;
  section: MusicalSectionType;
  activeGroupIds: number[];
  triggerLog: TriggerDebugLogEntry[];
  variables: Record<string, number>;
  validation: LevelValidationReport;
  cameraState: ResolvedCameraState;
  effectsState: ResolvedScreenEffectsState;
  lighting: ReactiveLightingOutput;
  gameplay: CustomRuntimeStats;
}

/**
 * Coordinates Playtest execution inside BeatFlow Creator & Community Level Player:
 * - Start from beginning or any timeline marker
 * - Speed control (0.25x .. 2x)
 * - Visual-only vs Full Gameplay mode
 * - Real-time inspection of active Groups, Trigger log, Variables, Camera, Screen FX, and Validation errors
 */
export class LevelPlaytest {
  private level: BeatflowLevelDocument;
  private animCtrl = new AnimationController();
  private cameraCtrl: CameraController;
  private effectCtrl = new EffectController();
  private triggerSys = new TriggerSystem();
  private reactiveLighting = new MusicReactiveLighting();
  private chromatic = new ChromaticEngine();
  private gameplay: CustomGameplayRuntime;
  private validation: LevelValidationReport;

  private running = false;
  private paused = false;
  private currentTime = 0;
  private startTimeSec = 0;
  private speedScale = 1.0;
  private visualOnly = false;
  private hasAudioBuffer = false;
  private lastBeatIndex = -1;
  private lastLighting: ReactiveLightingOutput;
  private lastCameraState: ResolvedCameraState;
  private lastEffectsState: ResolvedScreenEffectsState;

  constructor(level: BeatflowLevelDocument, quality: QualityLevel = 'high') {
    this.level = level;
    this.cameraCtrl = new CameraController(level.camera);
    this.effectCtrl.configure(quality, true);
    this.validation = validateLevelDocument(level);
    this.gameplay = new CustomGameplayRuntime(level, {
      onEmitEvent: (eventId) => this.emitExternalEvent(eventId),
      onVariableAdd: (varName, delta) => {
        const cur = this.triggerSys.getVariables()[varName] ?? 0;
        this.triggerSys.setVariable(varName, cur + delta);
      },
    });
    this.lastLighting = this.reactiveLighting.step(0.016, {
      subBass: 0.1,
      bass: 0.1,
      lowMid: 0.1,
      mid: 0.1,
      highMid: 0.08,
      treble: 0.06,
      energy: 0.1,
    }, 'groove', false, false);
    this.lastCameraState = this.cameraCtrl.evaluate(0);
    this.lastEffectsState = this.effectCtrl.evaluate(0);
  }

  public syncLevel(level: BeatflowLevelDocument, quality: QualityLevel): void {
    this.level = level;
    this.validation = validateLevelDocument(level);
    this.cameraCtrl.setBaseSettings(level.camera);
    this.effectCtrl.configure(quality, true);
    this.reactiveLighting.updateSettings({
      intensity: level.effects.kickIntensity,
      bloomIntensity: level.effects.bloomIntensity,
      attack: Math.max(0.005, level.effects.attackMs / 1000),
      release: Math.max(0.05, level.effects.releaseMs / 1000),
    });
  }

  public start(options: PlaytestOptions): void {
    this.startTimeSec = Math.max(0, options.startTimeSec);
    this.currentTime = this.startTimeSec;
    this.speedScale = Math.max(0.25, Math.min(2.0, options.speedScale));
    this.visualOnly = options.visualOnly;
    this.hasAudioBuffer = options.hasAudioBuffer;
    this.running = true;
    this.paused = false;
    this.lastBeatIndex = -1;

    this.animCtrl.reset(this.level.groups);
    this.cameraCtrl.setBaseSettings(this.level.camera);
    this.cameraCtrl.reset();
    this.effectCtrl.configure(options.deviceQuality, true);
    this.effectCtrl.reset();
    this.triggerSys.reset(this.level.variables);
    this.reactiveLighting.reset();
    this.chromatic.reset();
    this.gameplay.loadLevel(this.level, this.startTimeSec);
    this.validation = validateLevelDocument(this.level);

    if (this.hasAudioBuffer) {
      audioEngine.playMusic(this.startTimeSec);
    }
  }

  public pause(): void {
    if (!this.running || this.paused) return;
    this.paused = true;
    if (this.hasAudioBuffer) audioEngine.pauseMusic();
  }

  public resume(): void {
    if (!this.running || !this.paused) return;
    this.paused = false;
    if (this.hasAudioBuffer) audioEngine.resumeMusic();
  }

  public stop(): void {
    this.running = false;
    this.paused = false;
    if (this.hasAudioBuffer) audioEngine.stopMusic();
  }

  public setSpeedScale(speed: number): void {
    this.speedScale = Math.max(0.25, Math.min(2.0, speed));
  }

  public setVisualOnly(visualOnly: boolean): void {
    this.visualOnly = visualOnly;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public getCurrentTime(): number {
    return this.currentTime;
  }

  private emitExternalEvent(eventId: string): void {
    this.triggerSys.emitEvent(
      eventId,
      this.level.objects,
      {
        currentTime: this.currentTime,
        dt: 0.016,
        bpm: this.level.audio.bpm,
        section: this.resolveSection(this.currentTime),
        beatTriggered: false,
        onsetTriggered: false,
        lighting: this.lastLighting,
        inPlaytest: true,
      },
      this.cameraCtrl,
      this.effectCtrl,
    );
  }

  private resolveSection(timeSec: number): MusicalSectionType {
    let cur: MusicalSectionType = 'groove';
    for (const m of this.level.markers) {
      if (m.timeSec <= timeSec) {
        if (m.kind === 'drop') cur = 'drop';
        else if (m.label.toLowerCase().includes('calm')) cur = 'calm';
        else if (m.label.toLowerCase().includes('build')) cur = 'buildup';
        else if (m.label.toLowerCase().includes('chorus')) cur = 'chorus';
        else if (m.label.toLowerCase().includes('break')) cur = 'breakdown';
      }
    }
    return cur;
  }

  public step(rawDt: number): void {
    if (!this.running || this.paused) return;
    const dt = Math.min(0.05, Math.max(0.001, rawDt)) * this.speedScale;

    if (this.hasAudioBuffer && Math.abs(this.speedScale - 1.0) < 0.02 && audioEngine.getDuration() > 0) {
      const audioTime = audioEngine.getCurrentTime();
      this.currentTime = Math.max(this.currentTime, audioTime);
    } else {
      this.currentTime += dt;
    }

    const bands = this.hasAudioBuffer
      ? audioEngine.getRealtimeAudioState(1.0)
      : (() => {
          const beatPhase = ((this.currentTime * this.level.audio.bpm) / 60) % 1;
          const kick = beatPhase < 0.14 ? 0.82 : 0.18;
          return {
            currentTime: this.currentTime,
            subBass: kick,
            bass: kick * 0.9,
            lowMid: 0.32,
            mid: 0.36,
            highMid: beatPhase > 0.45 && beatPhase < 0.62 ? 0.65 : 0.2,
            treble: 0.25,
            high: 0.3,
            energy: 0.45,
            isPlaying: true,
          };
        })();

    const section = this.resolveSection(this.currentTime);
    const beatDur = 60 / Math.max(40, this.level.audio.bpm);
    const beatIdx = Math.floor(this.currentTime / beatDur);
    const beatTriggered = beatIdx !== this.lastBeatIndex;
    this.lastBeatIndex = beatIdx;

    this.lastLighting = this.reactiveLighting.step(
      dt,
      bands,
      section,
      false,
      this.level.effects.reactiveLightingEnabled,
    );

    this.chromatic.updateExtended({
      basePalette: this.level.audio.palette,
      worldTheme: this.level.environmentTheme,
      section,
      energy: bands.energy,
      beatPulse: this.lastLighting.kickPulse,
      elapsed: this.currentTime,
      bpm: this.level.audio.bpm,
      dt,
      intensity: this.level.effects.chromaticStrength + 0.6,
      flashIntensity: this.level.effects.snareFlash,
      reducedFlash: false,
      screenEffects: true,
      feverActive: this.gameplay.getStats().feverActive,
      brightnessScale: 1,
    });

    this.animCtrl.beginFrame(this.level.groups);
    this.animCtrl.applyKeyframesAtTime(this.level.timelineKeyframes, this.currentTime);

    this.triggerSys.step(
      this.level.objects,
      this.level.groups,
      {
        currentTime: this.currentTime,
        dt,
        bpm: this.level.audio.bpm,
        section,
        beatTriggered,
        onsetTriggered: this.lastLighting.snarePulse > 0.45,
        lighting: this.lastLighting,
        inPlaytest: true,
      },
      this.animCtrl,
      this.cameraCtrl,
      this.effectCtrl,
    );

    this.lastCameraState = this.cameraCtrl.evaluate(this.currentTime);
    this.lastEffectsState = this.effectCtrl.evaluate(
      this.currentTime,
      this.level.audio.bpm,
      this.lastLighting,
    );

    this.gameplay.step(
      this.currentTime,
      dt,
      Math.max(10, this.level.audio.durationSec),
      section,
      this.visualOnly,
    );

    if (this.currentTime >= Math.max(10, this.level.audio.durationSec)) {
      this.pause();
    }
  }

  public scrubPreviewAt(timeSec: number): void {
    this.currentTime = Math.max(0, timeSec);
    this.animCtrl.beginFrame(this.level.groups);
    this.animCtrl.applyKeyframesAtTime(this.level.timelineKeyframes, this.currentTime);
    this.lastCameraState = this.cameraCtrl.evaluate(this.currentTime);
    this.lastEffectsState = this.effectCtrl.evaluate(this.currentTime);
  }

  public resolveObjectRuntime(objIdx: number, out: ObjectRuntimeState): ObjectRuntimeState {
    const obj = this.level.objects[objIdx];
    return this.animCtrl.resolveObjectState(obj, out);
  }

  public getAnimationController(): AnimationController {
    return this.animCtrl;
  }

  public getGameplayRuntime(): CustomGameplayRuntime {
    return this.gameplay;
  }

  public handleLaneInput(lane: number): boolean {
    if (!this.running || this.paused || this.visualOnly) return false;
    return this.gameplay.handleLanePress(lane, this.currentTime);
  }

  public handleLaneRelease(lane: number): void {
    if (!this.running || this.paused || this.visualOnly) return;
    this.gameplay.handleLaneRelease(lane, this.currentTime);
  }

  public handleLaneFlick(lane: number, dir: FlickDirection): boolean {
    if (!this.running || this.paused || this.visualOnly) return false;
    return this.gameplay.handleLaneFlick(lane, dir, this.currentTime);
  }

  public handleLaneSlide(lane: number): boolean {
    if (!this.running || this.paused || this.visualOnly) return false;
    return this.gameplay.handleLaneSlide(lane, this.currentTime);
  }

  public handleTouchZoneTap(nx: number): boolean {
    if (!this.running || this.paused || this.visualOnly) return false;
    return this.gameplay.handleTouchZoneTap(nx, this.currentTime);
  }

  public getInspectionSnapshot(): PlaytestInspectionSnapshot {
    return {
      running: this.running,
      paused: this.paused,
      currentTime: this.currentTime,
      speedScale: this.speedScale,
      visualOnly: this.visualOnly,
      section: this.resolveSection(this.currentTime),
      activeGroupIds: this.triggerSys.getActiveGroupIds(),
      triggerLog: this.triggerSys.getDebugLog(),
      variables: this.triggerSys.getVariables(),
      validation: this.validation,
      cameraState: this.lastCameraState,
      effectsState: this.lastEffectsState,
      lighting: this.lastLighting,
      gameplay: this.gameplay.getStats(),
    };
  }
}
