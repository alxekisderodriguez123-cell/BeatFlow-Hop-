import type {
  CameraFxTriggerParams,
  CameraTriggerParams,
  EasingType,
  LevelCameraSettings,
} from '../types/creator';
import { evaluateEasing } from './AnimationController';

export interface ActiveCameraTween {
  id: string;
  startTime: number;
  kind: 'legacy' | 'camera_fx';
  params?: CameraTriggerParams;
  fxParams?: CameraFxTriggerParams;
}

export interface ResolvedCameraState {
  fov: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  rollDeg: number;
  shake: number;
  locked: boolean;
  followGroupId?: number;
  targetObjectId?: string;
}

export class CameraController {
  private base: LevelCameraSettings;
  private tweens: ActiveCameraTween[] = [];
  private locked = false;

  constructor(base: LevelCameraSettings) {
    this.base = { ...base };
  }

  public setBaseSettings(base: LevelCameraSettings): void {
    this.base = { ...base };
  }

  public reset(): void {
    this.tweens = [];
    this.locked = false;
  }

  public trigger(id: string, currentTime: number, params: CameraTriggerParams): void {
    if (params.action === 'reset') {
      this.tweens = [];
      this.locked = false;
      return;
    }
    if (params.action === 'lock') {
      this.locked = params.lockCamera;
      return;
    }
    this.tweens.push({
      id,
      startTime: currentTime + Math.max(0, params.delay),
      kind: 'legacy',
      params,
    });
    if (this.tweens.length > 32) {
      this.tweens.shift();
    }
  }

  public triggerCameraFx(id: string, currentTime: number, params: CameraFxTriggerParams): void {
    this.tweens.push({
      id,
      startTime: currentTime + Math.max(0, params.delay),
      kind: 'camera_fx',
      fxParams: params,
    });
    if (this.tweens.length > 32) {
      this.tweens.shift();
    }
  }

  public evaluate(currentTime: number): ResolvedCameraState {
    const state: ResolvedCameraState = {
      fov: this.base.baseFov,
      offsetX: 0,
      offsetY: 0,
      offsetZ: 0,
      rollDeg: 0,
      shake: 0,
      locked: this.locked,
    };

    if (!this.base.allowCameraTriggers) return state;

    for (let i = 0; i < this.tweens.length; i++) {
      const tw = this.tweens[i];
      if (currentTime < tw.startTime) continue;

      if (tw.kind === 'legacy' && tw.params) {
        const p = tw.params;
        const dur = Math.max(0.01, p.duration);
        const rawT = Math.min(1, (currentTime - tw.startTime) / dur);
        const easeT = evaluateEasing(rawT, (p.easing ?? 'easeInOut') as EasingType);

        if (p.action === 'zoom') {
          state.fov += p.zoomFovDelta * easeT;
        } else if (p.action === 'offset') {
          state.offsetX += p.offsetX * easeT;
          state.offsetY += p.offsetY * easeT;
          state.offsetZ += p.offsetZ * easeT;
        } else if (p.action === 'rotate') {
          state.rollDeg += p.rotZ * easeT;
        } else if (p.action === 'shake') {
          const decay = 1 - rawT;
          state.shake = Math.max(state.shake, p.shakeIntensity * decay);
        } else if (p.action === 'follow') {
          state.followGroupId = p.followGroupId;
        } else if (p.action === 'target') {
          state.targetObjectId = p.targetObjectId;
        }
      } else if (tw.kind === 'camera_fx' && tw.fxParams) {
        const p = tw.fxParams;
        const dt = currentTime - tw.startTime;
        const totalDur = Math.max(0.05, p.duration + p.fadeIn + p.fadeOut);
        if (dt > totalDur) continue;

        let env = 1;
        if (p.fadeIn > 0 && dt < p.fadeIn) {
          env = evaluateEasing(dt / p.fadeIn, p.easing ?? 'easeInOut');
        } else if (p.fadeOut > 0 && dt > p.fadeIn + p.duration) {
          env =
            1 -
            evaluateEasing((dt - p.fadeIn - p.duration) / p.fadeOut, p.easing ?? 'easeInOut');
        }

        if (p.fxKind === 'zoom') {
          const fovDelta = p.zoomFovDelta ?? -10 * p.intensity;
          state.fov += fovDelta * env;
          state.offsetZ += -0.45 * p.intensity * env;
        } else if (p.fxKind === 'focus') {
          state.fov += -6 * p.intensity * env;
          state.offsetZ += -0.35 * p.intensity * env;
        } else if (p.fxKind === 'rotation') {
          const deg = p.rotationDeg ?? 6 * p.intensity;
          state.rollDeg += deg * env;
        } else if (p.fxKind === 'shake') {
          state.shake = Math.max(state.shake, p.intensity * env);
        }
      }
    }

    state.fov = Math.max(40, Math.min(98, state.fov));
    return state;
  }
}
