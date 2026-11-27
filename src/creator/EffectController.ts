import type { EnvironmentTheme, QualityLevel, SceneTransitionType } from '../types/game';
import type {
  BackgroundTriggerParams,
  CameraFxTriggerParams,
  PulseKind,
  ScreenEffectKind,
  ScreenFxTriggerParams,
  ScreenPulseTriggerParams,
} from '../types/creator';
import type { ReactiveLightingOutput } from '../game/MusicReactiveLighting';

interface ActiveFxEntry {
  id: string;
  startTime: number;
  kind: 'screen_fx' | 'camera_fx' | 'screen_pulse' | 'background';
  screenFx?: ScreenFxTriggerParams;
  cameraFx?: CameraFxTriggerParams;
  screenPulse?: ScreenPulseTriggerParams;
  background?: BackgroundTriggerParams;
}

export interface ActiveScreenPulseLayer {
  pulseKind: PulseKind;
  color: string;
  secondaryColor: string;
  alpha: number;
  speed: number;
  density: number;
  smoothness: number;
  edgeMask: {
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
  };
  blendMode: string;
}

export interface ResolvedBackgroundFxState {
  overrideActive: boolean;
  theme?: EnvironmentTheme;
  primaryColor?: string;
  secondaryColor?: string;
  brightness: number;
  saturation: number;
  parallaxSpeed: number;
  scrollSpeed: number;
  particleDensity: number;
  activeTransitionId?: string;
  activeTransitionType?: SceneTransitionType;
  activeTransitionDurationMs?: number;
  layerVisibility: {
    sky: boolean;
    midground: boolean;
    foreground: boolean;
  };
}

export interface ResolvedScreenEffectsState {
  bloom: number;
  chromaticAberration: number;
  vignette: number;
  motionBlur: number;
  distortion: number;
  colorGrading: number;
  exposureDelta: number;
  screenFlash: number;
  flashColor: string;
  screenShake: number;
  blur: number;
  pixelation: number;
  // v3 Camera FX & Pulses extensions
  glitch: number;
  invertColors: number;
  focus: number;
  borderLightsAlpha: number;
  borderLightsColor: string;
  activePulses: ActiveScreenPulseLayer[];
  background: ResolvedBackgroundFxState;
}

const QUALITY_RANK: Record<QualityLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export class EffectController {
  private active: ActiveFxEntry[] = [];
  private deviceQuality: QualityLevel = 'high';
  private effectsEnabled = true;
  private persistentBackground: ResolvedBackgroundFxState = {
    overrideActive: false,
    brightness: 1,
    saturation: 1,
    parallaxSpeed: 1,
    scrollSpeed: 1,
    particleDensity: 1,
    layerVisibility: { sky: true, midground: true, foreground: true },
  };

  public configure(quality: QualityLevel, enabled = true): void {
    this.deviceQuality = quality;
    this.effectsEnabled = enabled;
  }

  public reset(): void {
    this.active = [];
    this.persistentBackground = {
      overrideActive: false,
      brightness: 1,
      saturation: 1,
      parallaxSpeed: 1,
      scrollSpeed: 1,
      particleDensity: 1,
      layerVisibility: { sky: true, midground: true, foreground: true },
    };
  }

  public trigger(id: string, currentTime: number, params: ScreenFxTriggerParams): void {
    if (!this.effectsEnabled) return;
    if (QUALITY_RANK[this.deviceQuality] < QUALITY_RANK[params.minQuality]) {
      return;
    }
    this.active.push({
      id,
      startTime: currentTime + Math.max(0, params.delay),
      kind: 'screen_fx',
      screenFx: params,
    });
    if (this.active.length > 48) {
      this.active.shift();
    }
  }

  public triggerCameraFx(id: string, currentTime: number, params: CameraFxTriggerParams): void {
    if (!this.effectsEnabled) return;
    this.active.push({
      id,
      startTime: currentTime + Math.max(0, params.delay),
      kind: 'camera_fx',
      cameraFx: params,
    });
    if (this.active.length > 48) {
      this.active.shift();
    }
  }

  public triggerScreenPulse(id: string, currentTime: number, params: ScreenPulseTriggerParams): void {
    if (!this.effectsEnabled) return;
    this.active.push({
      id,
      startTime: currentTime + Math.max(0, params.delay),
      kind: 'screen_pulse',
      screenPulse: params,
    });
    if (this.active.length > 48) {
      this.active.shift();
    }
  }

  public triggerBackground(id: string, currentTime: number, params: BackgroundTriggerParams): void {
    this.active.push({
      id,
      startTime: currentTime + Math.max(0, params.delay),
      kind: 'background',
      background: params,
    });
    if (this.active.length > 48) {
      this.active.shift();
    }
  }

  public evaluate(
    currentTime: number,
    bpm = 124,
    lighting?: ReactiveLightingOutput,
  ): ResolvedScreenEffectsState {
    const out: ResolvedScreenEffectsState = {
      bloom: 0,
      chromaticAberration: 0,
      vignette: 0,
      motionBlur: 0,
      distortion: 0,
      colorGrading: 0,
      exposureDelta: 0,
      screenFlash: 0,
      flashColor: '#22d3ee',
      screenShake: 0,
      blur: 0,
      pixelation: 0,
      glitch: 0,
      invertColors: 0,
      focus: 0,
      borderLightsAlpha: 0,
      borderLightsColor: '#22d3ee',
      activePulses: [],
      background: {
        ...this.persistentBackground,
        layerVisibility: { ...this.persistentBackground.layerVisibility },
      },
    };

    if (!this.effectsEnabled) return out;

    const qualityCap =
      this.deviceQuality === 'low' ? 0.55 : this.deviceQuality === 'medium' ? 0.85 : 1.0;

    const beatPhase = ((currentTime * Math.max(40, bpm)) / 60) % 1;
    const bpmPulse = Math.max(0.35, 1 - beatPhase * 0.75);

    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i];
      const dt = currentTime - item.startTime;
      if (dt < 0) continue;

      if (item.kind === 'background' && item.background) {
        const bg = item.background;
        const dur = Math.max(0.05, bg.transitionDuration);
        const t = Math.min(1, dt / dur);
        out.background = {
          overrideActive: true,
          theme: bg.theme ?? this.persistentBackground.theme,
          primaryColor: bg.primaryColor,
          secondaryColor: bg.secondaryColor,
          brightness:
            this.persistentBackground.brightness +
            (bg.brightness - this.persistentBackground.brightness) * t,
          saturation:
            this.persistentBackground.saturation +
            (bg.saturation - this.persistentBackground.saturation) * t,
          parallaxSpeed:
            this.persistentBackground.parallaxSpeed +
            (bg.parallaxSpeed - this.persistentBackground.parallaxSpeed) * t,
          scrollSpeed:
            this.persistentBackground.scrollSpeed +
            (bg.scrollSpeed - this.persistentBackground.scrollSpeed) * t,
          particleDensity:
            this.persistentBackground.particleDensity +
            (bg.particleDensity - this.persistentBackground.particleDensity) * t,
          activeTransitionId: item.id,
          activeTransitionType: bg.transitionType ?? 'fade',
          activeTransitionDurationMs: Math.round(Math.max(240, dur * 1000)),
          layerVisibility: { ...bg.layerVisibility },
        };
        if (t >= 1) {
          this.persistentBackground = {
            ...out.background,
            activeTransitionId: undefined,
            activeTransitionType: undefined,
            activeTransitionDurationMs: undefined,
            layerVisibility: { ...out.background.layerVisibility },
          };
          this.active.splice(i, 1);
        }
        continue;
      }

      if (item.kind === 'screen_fx' && item.screenFx) {
        const p = item.screenFx;
        const totalDur = Math.max(0.05, p.duration + p.fadeIn + p.fadeOut);
        if (dt > totalDur) {
          this.active.splice(i, 1);
          continue;
        }
        let env = 1;
        if (p.fadeIn > 0 && dt < p.fadeIn) {
          env = dt / p.fadeIn;
        } else if (p.fadeOut > 0 && dt > p.fadeIn + p.duration) {
          env = Math.max(0, 1 - (dt - p.fadeIn - p.duration) / p.fadeOut);
        }
        const val = Math.min(1.5, p.intensity * env * qualityCap);
        const effect: ScreenEffectKind = p.effect;

        switch (effect) {
          case 'bloom':
            out.bloom = Math.max(out.bloom, val);
            break;
          case 'chromaticAberration':
            out.chromaticAberration = Math.max(out.chromaticAberration, val);
            break;
          case 'vignette':
            out.vignette = Math.max(out.vignette, val);
            break;
          case 'motionBlur':
            out.motionBlur = Math.max(out.motionBlur, val);
            break;
          case 'distortion':
            out.distortion = Math.max(out.distortion, val);
            break;
          case 'colorGrading':
            out.colorGrading = Math.max(out.colorGrading, val);
            break;
          case 'exposure':
            out.exposureDelta = Math.max(out.exposureDelta, val * 0.4);
            break;
          case 'screenFlash':
            if (val > out.screenFlash) {
              out.screenFlash = Math.min(0.65, val);
              out.flashColor = p.color || '#22d3ee';
            }
            break;
          case 'screenShake':
            out.screenShake = Math.max(out.screenShake, val);
            break;
          case 'blur':
            out.blur = Math.max(out.blur, val);
            break;
          case 'pixelation':
            out.pixelation = Math.max(out.pixelation, val);
            break;
        }
        continue;
      }

      if (item.kind === 'camera_fx' && item.cameraFx) {
        const p = item.cameraFx;
        const totalDur = Math.max(0.05, p.duration + p.fadeIn + p.fadeOut);
        if (dt > totalDur) {
          this.active.splice(i, 1);
          continue;
        }
        let env = 1;
        if (p.fadeIn > 0 && dt < p.fadeIn) env = dt / p.fadeIn;
        else if (p.fadeOut > 0 && dt > p.fadeIn + p.duration) {
          env = Math.max(0, 1 - (dt - p.fadeIn - p.duration) / p.fadeOut);
        }
        const syncMult = p.syncWithBpm ? bpmPulse : 1;
        const val = Math.min(1.6, p.intensity * env * syncMult * qualityCap);

        switch (p.fxKind) {
          case 'shake':
            out.screenShake = Math.max(out.screenShake, val);
            break;
          case 'border_lights':
            if (val > out.borderLightsAlpha) {
              out.borderLightsAlpha = Math.min(0.95, val);
              out.borderLightsColor = p.color || '#22d3ee';
            }
            break;
          case 'chromatic':
            out.chromaticAberration = Math.max(out.chromaticAberration, val);
            break;
          case 'glitch':
            out.glitch = Math.max(out.glitch, val);
            break;
          case 'invert_colors':
            out.invertColors = Math.max(out.invertColors, Math.min(1, val));
            break;
          case 'flash':
            if (val > out.screenFlash) {
              out.screenFlash = Math.min(0.7, val);
              out.flashColor = p.color || '#ffffff';
            }
            break;
          case 'blur':
            out.blur = Math.max(out.blur, val);
            break;
          case 'focus':
            out.focus = Math.max(out.focus, val);
            break;
          case 'distortion':
            out.distortion = Math.max(out.distortion, val);
            break;
          case 'vignette':
            out.vignette = Math.max(out.vignette, val);
            break;
          case 'motion_blur':
            out.motionBlur = Math.max(out.motionBlur, val);
            break;
          case 'color_grading':
            out.colorGrading = Math.max(out.colorGrading, val);
            break;
          case 'zoom':
          case 'rotation':
            // Handled geometrically by CameraController; subtle bloom accent
            out.bloom = Math.max(out.bloom, val * 0.25);
            break;
        }
        continue;
      }

      if (item.kind === 'screen_pulse' && item.screenPulse) {
        const p = item.screenPulse;
        const totalDur = Math.max(0.05, p.duration + p.fadeIn + p.fadeOut);
        if (dt > totalDur) {
          this.active.splice(i, 1);
          continue;
        }
        let env = 1;
        if (p.fadeIn > 0 && dt < p.fadeIn) env = dt / p.fadeIn;
        else if (p.fadeOut > 0 && dt > p.fadeIn + p.duration) {
          env = Math.max(0, 1 - (dt - p.fadeIn - p.duration) / p.fadeOut);
        }

        let bandBoost = 1;
        if (lighting && p.audioReactiveBand !== 'none') {
          if (p.audioReactiveBand === 'low') {
            bandBoost = 0.65 + Math.max(lighting.bassLevel, lighting.kickPulse) * 0.75;
          } else if (p.audioReactiveBand === 'mid') {
            bandBoost = 0.65 + lighting.snarePulse * 0.75;
          } else if (p.audioReactiveBand === 'high') {
            bandBoost = 0.65 + lighting.hihatPulse * 0.75;
          } else if (p.audioReactiveBand === 'energy') {
            bandBoost = 0.65 + Math.max(lighting.bassLevel, lighting.ambientModulation) * 0.65;
          }
        }
        const bpmMult = p.syncWithBpm ? 0.7 + bpmPulse * 0.45 : 1;
        const alpha = Math.min(0.95, p.intensity * env * bandBoost * bpmMult * qualityCap);

        out.activePulses.push({
          pulseKind: p.pulseKind,
          color: p.color || '#22d3ee',
          secondaryColor: p.secondaryColor || p.color || '#ec4899',
          alpha,
          speed: p.speed,
          density: p.density,
          smoothness: p.smoothness,
          edgeMask: { ...p.edgeMask },
          blendMode: p.blendMode,
        });
      }
    }

    return out;
  }
}
