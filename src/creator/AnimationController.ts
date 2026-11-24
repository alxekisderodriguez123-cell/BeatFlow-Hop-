import type {
  BlendModeType,
  CreatorGroup,
  CreatorObject,
  EasingType,
  TimelineKeyframe,
} from '../types/creator';
import { blendHex } from '../services/chromaticEngine';

export interface ObjectRuntimeState {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  rotOffsetX: number;
  rotOffsetY: number;
  rotOffsetZ: number;
  scaleMultX: number;
  scaleMultY: number;
  scaleMultZ: number;
  color: string;
  opacity: number;
  emission: number;
  glowIntensity: number;
  blendMode: BlendModeType;
  visible: boolean;
  collisionEnabled: boolean;
}

export interface GroupRuntimeOverride {
  groupId: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  rotOffsetX: number;
  rotOffsetY: number;
  rotOffsetZ: number;
  scaleMultX: number;
  scaleMultY: number;
  scaleMultZ: number;
  colorOverride: string | null;
  colorWeight: number;
  pulseColor: string | null;
  pulseWeight: number;
  opacityMult: number;
  emissionBoost: number;
  glowBoost: number;
  blendMode?: BlendModeType;
  active: boolean;
  visible: boolean;
  collisionEnabled: boolean;
}

export function evaluateEasing(t: number, easing: EasingType): number {
  const x = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'easeIn':
      return x * x;
    case 'easeOut':
      return 1 - (1 - x) * (1 - x);
    case 'easeInOut':
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case 'cubic':
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'quintic':
      return x < 0.5 ? 16 * Math.pow(x, 5) : 1 - Math.pow(-2 * x + 2, 5) / 2;
    case 'bounce': {
      const n1 = 7.5625;
      const d1 = 2.75;
      let k = x;
      if (k < 1 / d1) return n1 * k * k;
      if (k < 2 / d1) return n1 * (k -= 1.5 / d1) * k + 0.75;
      if (k < 2.5 / d1) return n1 * (k -= 2.25 / d1) * k + 0.9375;
      return n1 * (k -= 2.625 / d1) * k + 0.984375;
    }
    case 'elastic': {
      if (x === 0 || x === 1) return x;
      const c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
    }
    case 'back': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
    case 'linear':
    default:
      return x;
  }
}

export function createNeutralGroupOverride(group: CreatorGroup): GroupRuntimeOverride {
  return {
    groupId: group.id,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    rotOffsetX: 0,
    rotOffsetY: 0,
    rotOffsetZ: 0,
    scaleMultX: 1,
    scaleMultY: 1,
    scaleMultZ: 1,
    colorOverride: null,
    colorWeight: 0,
    pulseColor: null,
    pulseWeight: 0,
    opacityMult: 1,
    emissionBoost: 1,
    glowBoost: 1,
    active: group.active,
    visible: group.visible,
    collisionEnabled: true,
  };
}

/**
 * Evaluates Timeline keyframes and active Group overrides cleanly without mutating source objects.
 */
export class AnimationController {
  private groupStates = new Map<number, GroupRuntimeOverride>();

  public reset(groups: CreatorGroup[]): void {
    this.groupStates.clear();
    for (const g of groups) {
      this.groupStates.set(g.id, createNeutralGroupOverride(g));
    }
  }

  public getOrCreateGroupState(groupId: number): GroupRuntimeOverride {
    let st = this.groupStates.get(groupId);
    if (!st) {
      st = {
        groupId,
        offsetX: 0,
        offsetY: 0,
        offsetZ: 0,
        rotOffsetX: 0,
        rotOffsetY: 0,
        rotOffsetZ: 0,
        scaleMultX: 1,
        scaleMultY: 1,
        scaleMultZ: 1,
        colorOverride: null,
        colorWeight: 0,
        pulseColor: null,
        pulseWeight: 0,
        opacityMult: 1,
        emissionBoost: 1,
        glowBoost: 1,
        active: true,
        visible: true,
        collisionEnabled: true,
      };
      this.groupStates.set(groupId, st);
    }
    return st;
  }

  public beginFrame(groups: CreatorGroup[]): void {
    for (const g of groups) {
      const st = this.getOrCreateGroupState(g.id);
      st.offsetX = 0;
      st.offsetY = 0;
      st.offsetZ = 0;
      st.rotOffsetX = 0;
      st.rotOffsetY = 0;
      st.rotOffsetZ = 0;
      st.scaleMultX = 1;
      st.scaleMultY = 1;
      st.scaleMultZ = 1;
      st.colorOverride = null;
      st.colorWeight = 0;
      st.pulseColor = null;
      st.pulseWeight = 0;
      st.opacityMult = 1;
      st.emissionBoost = 1;
      st.glowBoost = 1;
      st.blendMode = undefined;
    }
  }

  public applyKeyframesAtTime(keyframes: TimelineKeyframe[], timeSec: number): void {
    for (const kf of keyframes) {
      if (timeSec < kf.timeSec) continue;
      const dur = Math.max(0.001, kf.durationSec);
      const rawT = Math.min(1, (timeSec - kf.timeSec) / dur);
      const t = evaluateEasing(rawT, kf.easing);

      if (!kf.targetGroupId) continue;
      const st = this.getOrCreateGroupState(kf.targetGroupId);
      const fromNum = typeof kf.fromValue === 'number' ? kf.fromValue : Number(kf.fromValue) || 0;
      const toNum = typeof kf.toValue === 'number' ? kf.toValue : Number(kf.toValue) || 0;
      const val = fromNum + (toNum - fromNum) * t;

      switch (kf.property) {
        case 'posX':
          st.offsetX += val;
          break;
        case 'posY':
          st.offsetY += val;
          break;
        case 'posZ':
          st.offsetZ += val;
          break;
        case 'rotY':
          st.rotOffsetY += val;
          break;
        case 'rotZ':
          st.rotOffsetZ += val;
          break;
        case 'scale':
          st.scaleMultX *= Math.max(0.05, val);
          st.scaleMultY *= Math.max(0.05, val);
          st.scaleMultZ *= Math.max(0.05, val);
          break;
        case 'opacity':
          st.opacityMult *= Math.max(0, Math.min(1, val));
          break;
        case 'glow':
          st.glowBoost *= Math.max(0.1, val);
          break;
        case 'color': {
          const fromCol = String(kf.fromValue || '#22d3ee');
          const toCol = String(kf.toValue || '#ec4899');
          st.colorOverride = blendHex(fromCol, toCol, t);
          st.colorWeight = 1;
          break;
        }
      }
    }
  }

  public resolveObjectState(obj: CreatorObject, out: ObjectRuntimeState): ObjectRuntimeState {
    out.offsetX = 0;
    out.offsetY = 0;
    out.offsetZ = 0;
    out.rotOffsetX = 0;
    out.rotOffsetY = 0;
    out.rotOffsetZ = 0;
    out.scaleMultX = 1;
    out.scaleMultY = 1;
    out.scaleMultZ = 1;
    out.color = obj.material.color;
    out.opacity = obj.material.opacity;
    out.emission = obj.material.emission;
    out.glowIntensity = obj.material.glowIntensity;
    out.blendMode = obj.material.blendMode;
    out.visible = !obj.hidden;
    out.collisionEnabled = obj.collisionEnabled;

    for (const gid of obj.groupIds) {
      const g = this.groupStates.get(gid);
      if (!g) continue;
      if (!g.visible || !g.active) out.visible = false;
      if (!g.collisionEnabled) out.collisionEnabled = false;

      out.offsetX += g.offsetX;
      out.offsetY += g.offsetY;
      out.offsetZ += g.offsetZ;
      out.rotOffsetX += g.rotOffsetX;
      out.rotOffsetY += g.rotOffsetY;
      out.rotOffsetZ += g.rotOffsetZ;
      out.scaleMultX *= g.scaleMultX;
      out.scaleMultY *= g.scaleMultY;
      out.scaleMultZ *= g.scaleMultZ;
      out.opacity *= g.opacityMult;
      out.emission *= g.emissionBoost;
      out.glowIntensity *= g.glowBoost;

      if (g.blendMode) out.blendMode = g.blendMode;
      if (g.colorOverride && g.colorWeight > 0.001) {
        out.color = blendHex(out.color, g.colorOverride, g.colorWeight);
      }
      if (g.pulseColor && g.pulseWeight > 0.001) {
        out.color = blendHex(out.color, g.pulseColor, g.pulseWeight);
      }
    }

    out.opacity = Math.max(0, Math.min(1, out.opacity));
    return out;
  }

  public getGroupSnapshot(): GroupRuntimeOverride[] {
    return Array.from(this.groupStates.values());
  }
}
