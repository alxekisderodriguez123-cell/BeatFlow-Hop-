import type { MusicalSectionType } from '../types/game';
import type { RealtimeAudioBands } from '../services/audioEngine';

export interface ReactiveLightingSettings {
  intensity: number; // 0..2
  color: string;
  saturation: number; // 0.3..1.8
  exposure: number; // 0.5..1.5
  emission: number; // 0.2..2.0
  bloomIntensity: number; // 0.1..1.5
  pulseDuration: number; // seconds (0.06..0.5)
  attack: number; // seconds (0.005..0.1)
  release: number; // seconds (0.08..0.8)
  frequency: number; // sensitivity scale (0.4..2.0)
  threshold: number; // 0.02..0.25
  smoothing: number; // 0.1..0.95
  decay: number; // 1..15
}

export interface ReactiveLightingOutput {
  kickPulse: number;
  snarePulse: number;
  hihatPulse: number;
  bassLevel: number;
  dropFlash: number;
  sectionIntensityScale: number;
  ambientModulation: number;
  effectiveExposure: number;
  effectiveEmission: number;
  effectiveBloom: number;
  effectiveSaturation: number;
}

export const DEFAULT_REACTIVE_LIGHTING_SETTINGS: ReactiveLightingSettings = {
  intensity: 1.0,
  color: '#22d3ee',
  saturation: 1.0,
  exposure: 0.92,
  emission: 1.0,
  bloomIntensity: 0.44,
  pulseDuration: 0.16,
  attack: 0.015,
  release: 0.22,
  frequency: 1.0,
  threshold: 0.065,
  smoothing: 0.65,
  decay: 6.2,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function expDamp(current: number, target: number, lambda: number, dt: number): number {
  const t = 1 - Math.exp(-Math.max(0.1, lambda) * clamp(dt, 0, 0.08));
  return current + (target - current) * t;
}

/**
 * Shared Music Reactive Lighting processor.
 * Consumes existing `RealtimeAudioBands` from `audioEngine` / `menuAmbientAudio`
 * without spawning any duplicate Web Audio analyser.
 * Usable across both original 3D worlds (`BeatflowScene`) and custom levels (`LevelPlaytest`).
 */
export class MusicReactiveLighting {
  private settings: ReactiveLightingSettings;

  private prevKickRaw = 0;
  private prevSnareRaw = 0;
  private prevHihatRaw = 0;

  private kickEnv = 0;
  private snareEnv = 0;
  private hihatEnv = 0;
  private bassEnv = 0;
  private dropEnv = 0;
  private sectionScale = 1.0;

  private kickCooldown = 0;
  private snareCooldown = 0;
  private hihatCooldown = 0;

  constructor(initial?: Partial<ReactiveLightingSettings>) {
    this.settings = { ...DEFAULT_REACTIVE_LIGHTING_SETTINGS, ...initial };
  }

  public updateSettings(patch: Partial<ReactiveLightingSettings>): void {
    this.settings = { ...this.settings, ...patch };
  }

  public getSettings(): ReactiveLightingSettings {
    return { ...this.settings };
  }

  public reset(): void {
    this.prevKickRaw = 0;
    this.prevSnareRaw = 0;
    this.prevHihatRaw = 0;
    this.kickEnv = 0;
    this.snareEnv = 0;
    this.hihatEnv = 0;
    this.bassEnv = 0;
    this.dropEnv = 0;
    this.sectionScale = 1.0;
    this.kickCooldown = 0;
    this.snareCooldown = 0;
    this.hihatCooldown = 0;
  }

  public triggerDropBurst(strength = 1.0): void {
    this.dropEnv = Math.max(this.dropEnv, clamp(strength, 0.2, 1.4));
  }

  public step(
    dt: number,
    bands: Pick<RealtimeAudioBands, 'subBass' | 'bass' | 'lowMid' | 'mid' | 'highMid' | 'treble' | 'energy'>,
    section: MusicalSectionType,
    inSilence: boolean,
    reactiveEnabled = true,
  ): ReactiveLightingOutput {
    const safeDt = clamp(dt, 0.001, 0.08);
    const s = this.settings;

    if (!reactiveEnabled || inSilence) {
      this.kickEnv = expDamp(this.kickEnv, 0, s.decay * 1.4, safeDt);
      this.snareEnv = expDamp(this.snareEnv, 0, s.decay * 1.4, safeDt);
      this.hihatEnv = expDamp(this.hihatEnv, 0, s.decay * 1.6, safeDt);
      this.bassEnv = expDamp(this.bassEnv, inSilence ? 0.08 : 0.16, 4, safeDt);
      this.dropEnv = Math.max(0, this.dropEnv - safeDt * 2.5);
      this.sectionScale = expDamp(this.sectionScale, inSilence ? 0.55 : 0.85, 3, safeDt);
    } else {
      const freqGain = clamp(s.frequency, 0.4, 2.0);
      const rawKick = (bands.subBass * 0.65 + bands.bass * 0.35) * freqGain;
      const rawSnare = (bands.lowMid * 0.48 + bands.mid * 0.52) * freqGain;
      const rawHihat = (bands.highMid * 0.52 + bands.treble * 0.48) * freqGain;

      const kickDelta = Math.max(0, rawKick - this.prevKickRaw);
      const snareDelta = Math.max(0, rawSnare - this.prevSnareRaw);
      const hihatDelta = Math.max(0, rawHihat - this.prevHihatRaw);

      this.prevKickRaw = rawKick;
      this.prevSnareRaw = rawSnare;
      this.prevHihatRaw = rawHihat;

      this.kickCooldown = Math.max(0, this.kickCooldown - safeDt);
      this.snareCooldown = Math.max(0, this.snareCooldown - safeDt);
      this.hihatCooldown = Math.max(0, this.hihatCooldown - safeDt);

      const attackRate = 1 / Math.max(0.005, s.attack);
      const releaseRate = Math.max(1.2, s.decay / Math.max(0.12, s.release * 4.2));
      const holdCooldown = clamp(s.pulseDuration * 0.55, 0.05, 0.16);

      if (kickDelta > s.threshold && this.kickCooldown <= 0) {
        const peak = clamp(kickDelta * 4.4 * s.intensity, 0.25, 1.0);
        this.kickEnv = expDamp(this.kickEnv, peak, attackRate, safeDt);
        this.kickCooldown = holdCooldown;
      } else {
        this.kickEnv = expDamp(this.kickEnv, 0, releaseRate, safeDt);
      }

      if (snareDelta > s.threshold * 0.9 && this.snareCooldown <= 0) {
        const peak = clamp(snareDelta * 4.2 * s.intensity, 0.2, 1.0);
        this.snareEnv = expDamp(this.snareEnv, peak, attackRate * 1.1, safeDt);
        this.snareCooldown = holdCooldown;
      } else {
        this.snareEnv = expDamp(this.snareEnv, 0, releaseRate * 1.15, safeDt);
      }

      if (hihatDelta > s.threshold * 0.72 && this.hihatCooldown <= 0) {
        const peak = clamp(hihatDelta * 3.8 * s.intensity, 0.15, 0.85);
        this.hihatEnv = expDamp(this.hihatEnv, peak, attackRate * 1.3, safeDt);
        this.hihatCooldown = Math.max(0.045, holdCooldown * 0.75);
      } else {
        this.hihatEnv = expDamp(this.hihatEnv, 0, releaseRate * 1.35, safeDt);
      }

      const smoothLambda = clamp((1 - s.smoothing) * 24 + 4, 3, 22);
      this.bassEnv = expDamp(this.bassEnv, clamp(bands.bass * freqGain, 0, 1.2), smoothLambda, safeDt);

      const targetSection =
        section === 'drop'
          ? 1.3
          : section === 'chorus'
            ? 1.16
            : section === 'buildup'
              ? 1.08
              : section === 'calm' || section === 'breakdown'
                ? 0.72
                : 0.95;
      this.sectionScale = expDamp(this.sectionScale, targetSection, 2.8, safeDt);
      this.dropEnv = Math.max(0, this.dropEnv - safeDt * 2.1);
    }

    const ambientMod = clamp((0.35 + this.bassEnv * 0.65) * this.sectionScale * s.intensity, 0.2, 1.6);

    return {
      kickPulse: clamp(this.kickEnv, 0, 1.2),
      snarePulse: clamp(this.snareEnv, 0, 1.2),
      hihatPulse: clamp(this.hihatEnv, 0, 1.0),
      bassLevel: clamp(this.bassEnv, 0, 1.2),
      dropFlash: clamp(this.dropEnv, 0, 1.2),
      sectionIntensityScale: this.sectionScale,
      ambientModulation: ambientMod,
      effectiveExposure: clamp(s.exposure * (0.94 + this.kickEnv * 0.08 + this.dropEnv * 0.1), 0.55, 1.45),
      effectiveEmission: clamp(s.emission * this.sectionScale * (0.85 + this.kickEnv * 0.32), 0.3, 2.2),
      effectiveBloom: clamp(s.bloomIntensity * (0.9 + this.kickEnv * 0.2 + this.dropEnv * 0.25), 0.15, 1.4),
      effectiveSaturation: clamp(s.saturation * (0.95 + bands.energy * 0.15), 0.35, 1.8),
    };
  }
}
