import type { CameraConfig, MusicalSectionType, VisualIntensity } from '../types/game';

export interface CameraAudioInput {
  subBass: number;
  bass: number;
  mid: number;
  high: number;
  energy: number;
  bassTransient: number;
  bpm: number;
  isPlaying: boolean;
  isMenu?: boolean;
  menuParallaxX?: number;
  menuParallaxY?: number;
  menuAnimationsEnabled?: boolean;
  reactiveEnabled: boolean;
  visualIntensity: VisualIntensity;
  inSilence: boolean;
  sectionType: MusicalSectionType;
  feverActive: boolean;
  cameraConfig: CameraConfig;
}

export interface CameraPose {
  camX: number;
  camY: number;
  camZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  fovDeg: number;
  rollRad: number;
  aspect: number;
  fx: number;
  fy: number;
  fz: number;
  rx: number;
  ry: number;
  rz: number;
  ux: number;
  uy: number;
  uz: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  depth: number;
  scale: number;
}

export interface CameraOverrideInput {
  fovDelta?: number;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
  rollRad?: number;
  shake?: number;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function damp(a: number, b: number, lambda: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

/**
 * Pure 2.5D Analytical Perspective Camera Rig.
 * Computes smooth camera position (X/Y/Z), dynamic FOV, LookAt target, and Roll tilt,
 * plus exact pinhole projection and inverse ray-to-plane unprojection for direct touch controls.
 */
export class CameraRig {
  private baseCamY = 3.15;
  private baseCamZ = 6.25;
  private baseFov = 62;
  private baseLookY = 0.55;
  private readonly hitLineZ: number;
  private lastAspect = 1;
  private lastTrackWidth = 6.35;

  // Event-driven envelopes
  private beatPulse = 0;
  private impactZoomPulse = 0;
  private dropTransitionTimer = 0;
  private dropDirection: -1 | 1 = 1;
  private preDropTension = 0;
  private pullBackTarget = 0;
  private shakeEnergy = 0;
  private lateralAccent = 0;
  private verticalAccent = 0;
  private tiltAccent = 0;
  private swayPhase = 0;
  private shakePhase = 0;
  private menuDriftPhase = 0;
  private introSweep = 0;

  // Damped current camera transforms
  private curFovOffset = 0;
  private curOffsetX = 0;
  private curOffsetY = 0;
  private curOffsetZ = 0;
  private curLookX = 0;
  private curLookY = 0.55;
  private curRoll = 0;
  private curShakeX = 0;
  private curShakeY = 0;

  // Active pose (reused object to avoid per-frame allocations)
  private pose: CameraPose = {
    camX: 0,
    camY: 3.15,
    camZ: 6.25,
    lookX: 0,
    lookY: 0.55,
    lookZ: -26,
    fovDeg: 62,
    rollRad: 0,
    aspect: 1,
    fx: 0,
    fy: 0,
    fz: -1,
    rx: 1,
    ry: 0,
    rz: 0,
    ux: 0,
    uy: 1,
    uz: 0,
  };

  constructor(aspect: number, hitLineZ: number) {
    this.hitLineZ = hitLineZ;
    this.updateFraming(aspect, 6.35);
  }

  public updateFraming(aspect: number, trackWidth = this.lastTrackWidth): void {
    this.lastAspect = Math.max(0.25, aspect);
    this.lastTrackWidth = Math.max(5.5, trackWidth);

    const halfWidthNeeded = this.lastTrackWidth * 0.56;

    if (this.lastAspect < 1.1) {
      const t = clamp((1.1 - this.lastAspect) / 0.65, 0, 1);
      const extraLaneFactor = Math.max(0, (this.lastTrackWidth - 6.35) * 0.42);
      this.baseCamZ = lerp(6.25, 9.5, t) + extraLaneFactor;
      this.baseCamY = lerp(3.15, 4.45, t) + extraLaneFactor * 0.45;
      this.baseLookY = lerp(0.68, 0.55, t);
      const distToHit = this.baseCamZ - this.hitLineZ;
      const neededTanHalfV = halfWidthNeeded / (distToHit * Math.max(0.4, this.lastAspect));
      this.baseFov = clamp((2 * Math.atan(neededTanHalfV) * 180) / Math.PI, 62, 96);
    } else {
      const wideT = clamp((this.lastAspect - 1.1) / 1.1, 0, 1);
      const extra = Math.max(0, (this.lastTrackWidth - 6.35) * 0.35);
      this.baseCamZ = 6.25 + extra + wideT * 0.25;
      this.baseCamY = 3.15 + extra * 0.35 + wideT * 0.22;
      this.baseLookY = lerp(0.68, 0.98, wideT);
      this.baseFov = clamp(62 + extra * 2.4 - wideT * 3.5, 56, 74);
    }

    this.curLookY = this.baseLookY;
    this.commitPose(0, this.baseCamY, this.baseCamZ, 0, this.baseLookY, -26, this.baseFov, 0);
  }

  private commitPose(
    camX: number,
    camY: number,
    camZ: number,
    lookX: number,
    lookY: number,
    lookZ: number,
    fovDeg: number,
    rollRad: number,
  ): void {
    const p = this.pose;
    p.camX = camX;
    p.camY = camY;
    p.camZ = camZ;
    p.lookX = lookX;
    p.lookY = lookY;
    p.lookZ = lookZ;
    p.fovDeg = clamp(fovDeg, 45, 108);
    p.rollRad = rollRad;
    p.aspect = this.lastAspect;

    // Forward vector f = normalize(look - cam)
    let fx = lookX - camX;
    let fy = lookY - camY;
    let fz = lookZ - camZ;
    const fLen = Math.hypot(fx, fy, fz) || 1;
    fx /= fLen;
    fy /= fLen;
    fz /= fLen;

    // r0 = normalize(cross(f, (0, 1, 0))) = normalize(-fz, 0, fx)
    let r0x = -fz;
    let r0y = 0;
    let r0z = fx;
    const rLen = Math.hypot(r0x, r0z) || 1;
    r0x /= rLen;
    r0z /= rLen;

    // u0 = cross(r0, f)
    const u0x = r0y * fz - r0z * fy;
    const u0y = r0z * fx - r0x * fz;
    const u0z = r0x * fy - r0y * fx;

    const c = Math.cos(rollRad);
    const s = Math.sin(rollRad);

    p.fx = fx;
    p.fy = fy;
    p.fz = fz;

    p.rx = r0x * c + u0x * s;
    p.ry = r0y * c + u0y * s;
    p.rz = r0z * c + u0z * s;

    p.ux = -r0x * s + u0x * c;
    p.uy = -r0y * s + u0y * c;
    p.uz = -r0z * s + u0z * c;
  }

  public getPose(): CameraPose {
    return this.pose;
  }

  public getBaseFov(): number {
    return this.baseFov;
  }

  public applyCreatorOverride(override: CameraOverrideInput | null, elapsedSec = 0): void {
    if (!override) return;
    const shakeAmt = Math.min(0.65, Math.max(0, override.shake ?? 0));
    const sx = shakeAmt > 0.005 ? Math.sin(elapsedSec * 52) * 0.14 * shakeAmt : 0;
    const sy = shakeAmt > 0.005 ? Math.cos(elapsedSec * 61) * 0.1 * shakeAmt : 0;

    const camX = this.pose.camX + (override.offsetX ?? 0) + sx;
    const camY = Math.max(1.2, this.pose.camY + (override.offsetY ?? 0) + sy);
    const camZ = clamp(this.pose.camZ + (override.offsetZ ?? 0), 2.8, 15.0);
    const fov = clamp(this.pose.fovDeg + (override.fovDelta ?? 0), 45, 102);
    const roll = this.pose.rollRad + (override.rollRad ?? 0);

    this.commitPose(camX, camY, camZ, this.pose.lookX, this.pose.lookY, this.pose.lookZ, fov, roll);
  }

  /**
   * Projects a world-space point (x, y, z) into canvas CSS pixels using current camera pose.
   */
  public projectPoint(
    wx: number,
    wy: number,
    wz: number,
    width: number,
    height: number,
  ): ProjectedPoint | null {
    const p = this.pose;
    const dx = wx - p.camX;
    const dy = wy - p.camY;
    const dz = wz - p.camZ;

    const depth = dx * p.fx + dy * p.fy + dz * p.fz;
    if (depth <= 0.25) return null;

    const cx = dx * p.rx + dy * p.ry + dz * p.rz;
    const cy = dx * p.ux + dy * p.uy + dz * p.uz;

    const focalY = (height * 0.5) / Math.tan((p.fovDeg * Math.PI) / 360);
    const invDepth = 1 / depth;
    return {
      x: width * 0.5 + cx * invDepth * focalY,
      y: height * 0.5 - cy * invDepth * focalY,
      depth,
      scale: focalY * invDepth,
    };
  }

  /**
   * Projects into a pre-allocated output object (zero GC pressure inside hot render loops).
   */
  public projectPointInto(
    wx: number,
    wy: number,
    wz: number,
    width: number,
    height: number,
    out: ProjectedPoint,
  ): boolean {
    const p = this.pose;
    const dx = wx - p.camX;
    const dy = wy - p.camY;
    const dz = wz - p.camZ;

    const depth = dx * p.fx + dy * p.fy + dz * p.fz;
    if (depth <= 0.25) return false;

    const cx = dx * p.rx + dy * p.ry + dz * p.rz;
    const cy = dx * p.ux + dy * p.uy + dz * p.uz;

    const focalY = (height * 0.5) / Math.tan((p.fovDeg * Math.PI) / 360);
    const invDepth = 1 / depth;
    out.x = width * 0.5 + cx * invDepth * focalY;
    out.y = height * 0.5 - cy * invDepth * focalY;
    out.depth = depth;
    out.scale = focalY * invDepth;
    return true;
  }

  /**
   * Intersects pointer ray with the horizontal track plane y = planeY.
   * Exact analytical inverse of `projectPoint`.
   */
  public unprojectToPlane(
    clientX: number,
    clientY: number,
    rect: { left: number; top: number; width: number; height: number },
    planeY = 0,
  ): { x: number; z: number } | null {
    if (rect.width <= 0 || rect.height <= 0) return null;
    const p = this.pose;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const focalY = (rect.height * 0.5) / Math.tan((p.fovDeg * Math.PI) / 360);
    if (focalY <= 0) return null;

    const nx = (px - rect.width * 0.5) / focalY;
    const ny = (rect.height * 0.5 - py) / focalY;

    const rayX = p.fx + nx * p.rx + ny * p.ux;
    const rayY = p.fy + nx * p.ry + ny * p.uy;
    const rayZ = p.fz + nx * p.rz + ny * p.uz;

    if (Math.abs(rayY) < 1e-5) return null;
    const t = (planeY - p.camY) / rayY;
    if (t <= 0 || t > 180) return null;

    return {
      x: p.camX + t * rayX,
      z: p.camZ + t * rayZ,
    };
  }

  public triggerBeatPulse(strength = 0.5, isDrop = false): void {
    const clamped = clamp(strength, 0.1, 1.0);
    this.beatPulse = Math.max(this.beatPulse, clamped);
    if (clamped >= 0.48) {
      this.impactZoomPulse = Math.max(this.impactZoomPulse, clamped * 0.72);
      this.verticalAccent = Math.max(this.verticalAccent, clamped * 0.14);
    }
    if (isDrop) {
      this.triggerDropTransition();
    }
  }

  public triggerImpactZoom(strength = 0.7): void {
    const s = clamp(strength, 0.15, 1.2);
    this.impactZoomPulse = Math.max(this.impactZoomPulse, s);
    this.verticalAccent = clamp(this.verticalAccent - s * 0.12, -0.24, 0.24);
  }

  public triggerDropTransition(direction?: -1 | 1): void {
    this.dropTransitionTimer = 1.25;
    this.dropDirection = direction ?? (Math.random() < 0.5 ? -1 : 1);
    this.impactZoomPulse = 1.15;
    this.preDropTension = 0;
    this.shakeEnergy = Math.max(this.shakeEnergy, 0.85);
    this.tiltAccent = this.dropDirection * 0.048;
    this.lateralAccent = clamp(this.dropDirection * 0.38, -0.62, 0.62);
    this.verticalAccent = -0.22;
  }

  public triggerLateralAccent(direction: -1 | 1, strength = 0.5): void {
    const s = clamp(strength, 0.1, 1.1);
    this.lateralAccent = clamp(this.lateralAccent + direction * s * 0.34, -0.64, 0.64);
    this.tiltAccent = clamp(this.tiltAccent + direction * s * 0.028, -0.06, 0.06);
  }

  public triggerShake(strength = 0.45): void {
    this.shakeEnergy = Math.min(1.25, Math.max(this.shakeEnergy, strength));
  }

  public setPreDropTension(amount: number): void {
    this.preDropTension = clamp(amount, 0, 1);
  }

  public triggerGameplayIntro(): void {
    this.introSweep = 1.0;
  }

  public update(dt: number, input?: CameraAudioInput): void {
    this.beatPulse = Math.max(0, this.beatPulse - dt * 4.4);
    this.impactZoomPulse = Math.max(0, this.impactZoomPulse - dt * 3.8);
    this.dropTransitionTimer = Math.max(0, this.dropTransitionTimer - dt);
    this.introSweep = Math.max(0, this.introSweep - dt * 1.6);
    this.shakeEnergy = Math.max(0, this.shakeEnergy - dt * 5.2);
    this.lateralAccent = damp(this.lateralAccent, 0, 4.2, dt);
    this.verticalAccent = damp(this.verticalAccent, 0, 4.6, dt);
    this.tiltAccent = damp(this.tiltAccent, 0, 4.4, dt);

    const cfg = input?.cameraConfig;
    const isStatic = Boolean(cfg?.staticView) || (cfg ? !cfg.enabled : false);
    const isReduced = Boolean(cfg?.reducedMotion);
    const masterEnabled = !isStatic && Boolean(input?.reactiveEnabled) && !input?.inSilence;

    if (isStatic) {
      this.curFovOffset = damp(this.curFovOffset, 0, 18, dt);
      this.curOffsetX = damp(this.curOffsetX, 0, 18, dt);
      this.curOffsetY = damp(this.curOffsetY, 0, 18, dt);
      this.curOffsetZ = damp(this.curOffsetZ, 0, 18, dt);
      this.curLookX = damp(this.curLookX, 0, 18, dt);
      this.curLookY = damp(this.curLookY, this.baseLookY, 18, dt);
      this.curRoll = damp(this.curRoll, 0, 18, dt);
      this.curShakeX = 0;
      this.curShakeY = 0;

      const nextFov = clamp(this.baseFov + this.curFovOffset, 52, 98);
      this.commitPose(
        this.curOffsetX,
        this.baseCamY + this.curOffsetY,
        this.baseCamZ + this.curOffsetZ,
        this.curLookX,
        this.curLookY,
        -26,
        nextFov,
        this.curRoll,
      );
      return;
    }

    if (input?.isMenu) {
      const animScale =
        input.menuAnimationsEnabled === false ? 0 : isReduced ? 0.25 : 1.0;
      this.menuDriftPhase += dt * 0.38 * animScale;
      const px = clamp(input.menuParallaxX ?? 0, -1, 1);
      const py = clamp(input.menuParallaxY ?? 0, -1, 1);
      const breath = (input.energy ?? 0.15) * 0.45;

      const menuX = animScale * (Math.sin(this.menuDriftPhase) * 0.55 + px * 0.48);
      const menuY = animScale * (0.52 + Math.cos(this.menuDriftPhase * 0.7) * 0.16 + py * 0.24);
      const menuZ = animScale * (0.45 - breath * 0.35);
      const menuFov = animScale * (-1.4 - breath * 1.2);
      const menuLookX = menuX * 0.55;
      const menuLookY = 1.45 + py * 0.18;
      const menuRoll = !isReduced
        ? animScale * (Math.sin(this.menuDriftPhase * 0.8) * 0.014 - px * 0.012)
        : 0;

      this.curFovOffset = damp(this.curFovOffset, menuFov, 4.0, dt);
      this.curOffsetX = damp(this.curOffsetX, menuX, 4.0, dt);
      this.curOffsetY = damp(this.curOffsetY, menuY, 4.0, dt);
      this.curOffsetZ = damp(this.curOffsetZ, menuZ, 4.0, dt);
      this.curLookX = damp(this.curLookX, menuLookX, 4.0, dt);
      this.curLookY = damp(this.curLookY, menuLookY, 4.0, dt);
      this.curRoll = damp(this.curRoll, menuRoll, 4.0, dt);

      const nextFov = clamp(this.baseFov + this.curFovOffset, 52, 98);
      this.commitPose(
        this.curOffsetX,
        this.baseCamY + this.curOffsetY,
        this.baseCamZ + this.curOffsetZ,
        this.curLookX,
        this.curLookY,
        -34,
        nextFov,
        this.curRoll,
      );
      return;
    }

    const visScale =
      input?.visualIntensity === 'low'
        ? 0.55
        : input?.visualIntensity === 'medium'
          ? 0.85
          : 1.05;

    const overall = !masterEnabled
      ? 0
      : isReduced
        ? (cfg?.overallIntensity ?? 1.0) * 0.25
        : (cfg?.overallIntensity ?? 1.0) * visScale;

    const bpmRate = input?.bpm ? clamp(input.bpm / 120, 0.75, 1.45) : 1.0;
    if (input?.isPlaying && overall > 0) {
      this.swayPhase +=
        dt * bpmRate * (1.1 + (input.energy ?? 0) * 1.45 + (input.feverActive ? 0.35 : 0));
      this.shakePhase += dt * 42;
    }

    const energy = input?.energy ?? 0;
    const bass = input?.bass ?? 0;
    const transient = input?.bassTransient ?? 0;
    const section = input?.sectionType ?? 'groove';

    const dropFrac = this.dropTransitionTimer > 0 ? this.dropTransitionTimer / 1.25 : 0;
    const dropBell = Math.sin(dropFrac * Math.PI);

    let targetPull = 0;
    if (section === 'calm' || section === 'breakdown') {
      targetPull = 0.85;
    } else if (section === 'chorus') {
      targetPull = 0.15;
    }
    this.pullBackTarget = damp(this.pullBackTarget, targetPull, 2.4, dt);

    const zoomEnabled = cfg ? cfg.dynamicZoom.enabled : true;
    const zoomIntensity = zoomEnabled ? (cfg?.dynamicZoom.intensity ?? 1.0) * overall : 0;
    const pullEnabled = cfg ? cfg.pullBack.enabled : true;
    const pullIntensity = pullEnabled ? (cfg?.pullBack.intensity ?? 0.9) * overall : 0;

    const buildupPush = section === 'buildup' ? 0.42 : 0;
    const feverPush = input?.feverActive ? 0.35 : 0;

    const zoomInZ =
      zoomIntensity *
      -(
        this.preDropTension * 1.1 +
        buildupPush +
        this.impactZoomPulse * 0.72 +
        this.beatPulse * 0.28 +
        transient * 0.35 +
        feverPush
      );
    const zoomOutZ =
      Math.max(zoomIntensity * 0.45, pullIntensity) * (this.pullBackTarget * 1.15);

    const targetZ = clamp(zoomInZ + zoomOutZ, -1.65, 1.35);

    const zoomInFov =
      zoomIntensity *
      -(
        this.preDropTension * 4.4 +
        buildupPush * 2.2 +
        this.impactZoomPulse * 2.8 +
        this.beatPulse * 1.1 +
        bass * 0.95 +
        (input?.feverActive ? 1.2 : 0)
      );
    const zoomOutFov =
      Math.max(zoomIntensity * 0.45, pullIntensity) * (this.pullBackTarget * 3.1);

    const targetFovOffset = clamp(zoomInFov + zoomOutFov, -7.2, 4.4);

    const horizMult =
      cfg && cfg.horizontalOffset.enabled ? cfg.horizontalOffset.intensity * overall : 0;
    const swayAmt = 0.09 + energy * 0.24 + (section === 'chorus' || section === 'drop' ? 0.12 : 0);
    const targetOffsetX = clamp(
      horizMult * (Math.sin(this.swayPhase) * swayAmt + this.lateralAccent + dropBell * this.dropDirection * 0.25),
      -0.78,
      0.78,
    );

    const vertEnabled = cfg?.verticalOffset ? cfg.verticalOffset.enabled : true;
    const vertBaseIntensity = cfg?.verticalOffset
      ? cfg.verticalOffset.intensity
      : (cfg?.horizontalOffset.intensity ?? 0.8);
    const vertMult = vertEnabled ? vertBaseIntensity * overall : 0;
    const calmFloat = section === 'calm' || section === 'breakdown' ? 0.18 : 0;
    const targetOffsetY = clamp(
      vertMult *
        (Math.cos(this.swayPhase * 1.5) * (0.06 + energy * 0.12) +
          this.verticalAccent +
          calmFloat -
          this.preDropTension * 0.16 +
          dropBell * 0.18),
      -0.38,
      0.46,
    );

    const introArcY = !isReduced ? this.introSweep * 0.42 : 0;
    const introArcZ = !isReduced ? this.introSweep * 0.55 : 0;

    const targetLookX = targetOffsetX * 0.35;
    const targetLookY =
      this.baseLookY + targetOffsetY * 0.22 - this.preDropTension * 0.08 + introArcY * 0.45;

    const tiltEnabled = cfg?.tilt ? cfg.tilt.enabled : true;
    const tiltBaseIntensity = cfg?.tilt
      ? cfg.tilt.intensity
      : (cfg?.horizontalOffset.intensity ?? 0.8);
    const tiltMult = !isReduced && tiltEnabled ? tiltBaseIntensity * overall : 0;
    const targetRoll = clamp(
      tiltMult *
        (Math.sin(this.swayPhase * 0.85) * (0.012 + energy * 0.026) +
          this.tiltAccent +
          this.lateralAccent * 0.042),
      -0.068,
      0.068,
    );

    const shakeMult =
      !isReduced && cfg && cfg.cameraShake.enabled ? cfg.cameraShake.intensity * overall : 0;
    const shakeAmp = this.shakeEnergy * shakeMult;
    const targetShakeX =
      shakeAmp > 0.01
        ? (Math.sin(this.shakePhase * 1.7) * 0.07 + Math.cos(this.shakePhase * 2.9) * 0.03) *
          shakeAmp
        : 0;
    const targetShakeY =
      shakeAmp > 0.01
        ? (Math.cos(this.shakePhase * 2.1) * 0.055 + Math.sin(this.shakePhase * 3.3) * 0.025) *
          shakeAmp
        : 0;

    const smooth = isReduced || (cfg ? cfg.smoothTransitions : true);
    const dampFast = smooth ? 9.5 : 22;
    const dampSlow = smooth ? 5.6 : 18;

    this.curFovOffset = damp(this.curFovOffset, targetFovOffset, dampFast, dt);
    this.curOffsetX = damp(this.curOffsetX, targetOffsetX, dampSlow, dt);
    this.curOffsetY = damp(this.curOffsetY, targetOffsetY + introArcY, dampFast, dt);
    this.curOffsetZ = damp(this.curOffsetZ, targetZ + introArcZ, dampFast, dt);
    this.curLookX = damp(this.curLookX, targetLookX, dampSlow, dt);
    this.curLookY = damp(this.curLookY, targetLookY, dampSlow, dt);
    this.curRoll = damp(this.curRoll, targetRoll, dampSlow, dt);
    this.curShakeX = damp(this.curShakeX, targetShakeX, 26, dt);
    this.curShakeY = damp(this.curShakeY, targetShakeY, 26, dt);

    const nextFov = clamp(this.baseFov + this.curFovOffset, 52, 98);
    this.commitPose(
      this.curOffsetX + this.curShakeX,
      this.baseCamY + this.curOffsetY + this.curShakeY,
      this.baseCamZ + this.curOffsetZ,
      this.curLookX,
      this.curLookY,
      -26,
      nextFov,
      this.curRoll,
    );
  }
}
