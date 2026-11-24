import type { QualityLevel } from '../types/game';
import type { ScreenEffectKind, ScreenFxTriggerParams } from '../types/creator';

interface ActiveFxEntry {
  id: string;
  startTime: number;
  params: ScreenFxTriggerParams;
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

  public configure(quality: QualityLevel, enabled = true): void {
    this.deviceQuality = quality;
    this.effectsEnabled = enabled;
  }

  public reset(): void {
    this.active = [];
  }

  public trigger(id: string, currentTime: number, params: ScreenFxTriggerParams): void {
    if (!this.effectsEnabled) return;
    if (QUALITY_RANK[this.deviceQuality] < QUALITY_RANK[params.minQuality]) {
      return;
    }
    this.active.push({
      id,
      startTime: currentTime + Math.max(0, params.delay),
      params,
    });
    if (this.active.length > 32) {
      this.active.shift();
    }
  }

  public evaluate(currentTime: number): ResolvedScreenEffectsState {
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
    };

    if (!this.effectsEnabled) return out;

    const qualityCap =
      this.deviceQuality === 'low' ? 0.45 : this.deviceQuality === 'medium' ? 0.78 : 1.0;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i];
      const p = item.params;
      const totalDur = Math.max(0.05, p.duration + p.fadeIn + p.fadeOut);
      const dt = currentTime - item.startTime;
      if (dt < 0) continue;
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
    }

    return out;
  }
}
