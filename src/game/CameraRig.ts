import * as THREE from 'three';
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

/**
 * Real 3D Cinematic Camera Rig (v2.1).
 * Operates directly on Three.js PerspectiveCamera position (X/Y/Z),
 * virtual FOV projection, LookAt target, and Roll tilt while preserving
 * full visibility of all 4-8 lanes and the hit zone.
 */
export class CameraRig {
  public readonly camera: THREE.PerspectiveCamera;
  private baseCamY = 3.15;
  private baseCamZ = 6.25;
  private baseFov = 62;
  private readonly hitLineZ: number;
  private lastAspect = 1;
  private lastTrackWidth = 6.35;

  // Event-driven envelopes
  private beatPulse = 0;
  private impactZoomPulse = 0;
  private dropTransitionTimer = 0; // counts down from 1.2s -> 0
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
  private introSweep = 0; // 1 -> 0 during menu-to-gameplay transition

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

  constructor(aspect: number, hitLineZ: number) {
    this.hitLineZ = hitLineZ;
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.1, 180);
    this.updateFraming(aspect, 6.35);
  }

  public updateFraming(aspect: number, trackWidth = this.lastTrackWidth): void {
    this.lastAspect = Math.max(0.25, aspect);
    this.lastTrackWidth = Math.max(5.5, trackWidth);
    this.camera.aspect = this.lastAspect;

    const halfWidthNeeded = this.lastTrackWidth * 0.56;

    if (this.lastAspect < 1.1) {
      const t = THREE.MathUtils.clamp((1.1 - this.lastAspect) / 0.65, 0, 1);
      const extraLaneFactor = Math.max(0, (this.lastTrackWidth - 6.35) * 0.42);
      this.baseCamZ = THREE.MathUtils.lerp(6.25, 9.5, t) + extraLaneFactor;
      this.baseCamY = THREE.MathUtils.lerp(3.15, 4.45, t) + extraLaneFactor * 0.45;
      const distToHit = this.baseCamZ - this.hitLineZ;
      const neededTanHalfV = halfWidthNeeded / (distToHit * Math.max(0.4, this.lastAspect));
      this.baseFov = THREE.MathUtils.clamp(
        THREE.MathUtils.radToDeg(2 * Math.atan(neededTanHalfV)),
        62,
        96,
      );
    } else {
      const extra = Math.max(0, (this.lastTrackWidth - 6.35) * 0.35);
      this.baseCamZ = 6.25 + extra;
      this.baseCamY = 3.15 + extra * 0.35;
      this.baseFov = THREE.MathUtils.clamp(62 + extra * 2.5, 62, 76);
    }

    this.camera.fov = this.baseFov;
    this.camera.position.set(0, this.baseCamY, this.baseCamZ);
    this.camera.lookAt(0, 0.55, -26);
    this.camera.rotation.z = 0;
    this.camera.updateProjectionMatrix();
  }

  public triggerBeatPulse(strength = 0.5, isDrop = false): void {
    const clamped = THREE.MathUtils.clamp(strength, 0.1, 1.0);
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
    const s = THREE.MathUtils.clamp(strength, 0.15, 1.2);
    this.impactZoomPulse = Math.max(this.impactZoomPulse, s);
    this.verticalAccent = THREE.MathUtils.clamp(this.verticalAccent - s * 0.12, -0.24, 0.24);
  }

  public triggerDropTransition(direction?: -1 | 1): void {
    this.dropTransitionTimer = 1.25;
    this.dropDirection = direction ?? (Math.random() < 0.5 ? -1 : 1);
    this.impactZoomPulse = 1.15;
    this.preDropTension = 0;
    this.shakeEnergy = Math.max(this.shakeEnergy, 0.85);
    this.tiltAccent = this.dropDirection * 0.048;
    this.lateralAccent = THREE.MathUtils.clamp(this.dropDirection * 0.38, -0.62, 0.62);
    this.verticalAccent = -0.22;
  }

  public triggerLateralAccent(direction: -1 | 1, strength = 0.5): void {
    const s = THREE.MathUtils.clamp(strength, 0.1, 1.1);
    this.lateralAccent = THREE.MathUtils.clamp(
      this.lateralAccent + direction * s * 0.34,
      -0.64,
      0.64,
    );
    this.tiltAccent = THREE.MathUtils.clamp(
      this.tiltAccent + direction * s * 0.028,
      -0.06,
      0.06,
    );
  }

  public triggerShake(strength = 0.45): void {
    this.shakeEnergy = Math.min(1.25, Math.max(this.shakeEnergy, strength));
  }

  public setPreDropTension(amount: number): void {
    this.preDropTension = THREE.MathUtils.clamp(amount, 0, 1);
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
    this.lateralAccent = THREE.MathUtils.damp(this.lateralAccent, 0, 4.2, dt);
    this.verticalAccent = THREE.MathUtils.damp(this.verticalAccent, 0, 4.6, dt);
    this.tiltAccent = THREE.MathUtils.damp(this.tiltAccent, 0, 4.4, dt);

    const cfg = input?.cameraConfig;
    const isStatic = Boolean(cfg?.staticView) || (cfg ? !cfg.enabled : false);
    const isReduced = Boolean(cfg?.reducedMotion);
    const masterEnabled = !isStatic && Boolean(input?.reactiveEnabled) && !input?.inSilence;

    if (isStatic) {
      // Snap cleanly back to neutral perspective and return immediately
      this.curFovOffset = THREE.MathUtils.damp(this.curFovOffset, 0, 18, dt);
      this.curOffsetX = THREE.MathUtils.damp(this.curOffsetX, 0, 18, dt);
      this.curOffsetY = THREE.MathUtils.damp(this.curOffsetY, 0, 18, dt);
      this.curOffsetZ = THREE.MathUtils.damp(this.curOffsetZ, 0, 18, dt);
      this.curLookX = THREE.MathUtils.damp(this.curLookX, 0, 18, dt);
      this.curLookY = THREE.MathUtils.damp(this.curLookY, 0.55, 18, dt);
      this.curRoll = THREE.MathUtils.damp(this.curRoll, 0, 18, dt);
      this.curShakeX = 0;
      this.curShakeY = 0;

      const nextFov = THREE.MathUtils.clamp(this.baseFov + this.curFovOffset, 52, 98);
      if (Math.abs(this.camera.fov - nextFov) > 0.01) {
        this.camera.fov = nextFov;
        this.camera.updateProjectionMatrix();
      }
      this.camera.position.set(
        this.curOffsetX,
        this.baseCamY + this.curOffsetY,
        this.baseCamZ + this.curOffsetZ,
      );
      this.camera.lookAt(this.curLookX, this.curLookY, -26);
      this.camera.rotation.z = this.curRoll;
      return;
    }

    // Menu Panoramic Idle Camera (with subtle drift & interactive parallax)
    if (input?.isMenu) {
      const animScale =
        input.menuAnimationsEnabled === false ? 0 : isReduced ? 0.25 : 1.0;
      this.menuDriftPhase += dt * 0.38 * animScale;
      const px = THREE.MathUtils.clamp(input.menuParallaxX ?? 0, -1, 1);
      const py = THREE.MathUtils.clamp(input.menuParallaxY ?? 0, -1, 1);
      const breath = (input.energy ?? 0.15) * 0.45;

      const menuX =
        animScale * (Math.sin(this.menuDriftPhase) * 0.55 + px * 0.48);
      const menuY =
        animScale * (0.52 + Math.cos(this.menuDriftPhase * 0.7) * 0.16 + py * 0.24);
      const menuZ = animScale * (0.45 - breath * 0.35);
      const menuFov = animScale * (-1.4 - breath * 1.2);
      const menuLookX = menuX * 0.55;
      const menuLookY = 1.45 + py * 0.18;
      const menuRoll = !isReduced ? animScale * (Math.sin(this.menuDriftPhase * 0.8) * 0.014 - px * 0.012) : 0;

      this.curFovOffset = THREE.MathUtils.damp(this.curFovOffset, menuFov, 4.0, dt);
      this.curOffsetX = THREE.MathUtils.damp(this.curOffsetX, menuX, 4.0, dt);
      this.curOffsetY = THREE.MathUtils.damp(this.curOffsetY, menuY, 4.0, dt);
      this.curOffsetZ = THREE.MathUtils.damp(this.curOffsetZ, menuZ, 4.0, dt);
      this.curLookX = THREE.MathUtils.damp(this.curLookX, menuLookX, 4.0, dt);
      this.curLookY = THREE.MathUtils.damp(this.curLookY, menuLookY, 4.0, dt);
      this.curRoll = THREE.MathUtils.damp(this.curRoll, menuRoll, 4.0, dt);

      const nextFov = THREE.MathUtils.clamp(this.baseFov + this.curFovOffset, 52, 98);
      if (Math.abs(this.camera.fov - nextFov) > 0.01) {
        this.camera.fov = nextFov;
        this.camera.updateProjectionMatrix();
      }
      this.camera.position.set(
        this.curOffsetX,
        this.baseCamY + this.curOffsetY,
        this.baseCamZ + this.curOffsetZ,
      );
      this.camera.lookAt(this.curLookX, this.curLookY, -34);
      this.camera.rotation.z = this.curRoll;
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

    const bpmRate = input?.bpm ? THREE.MathUtils.clamp(input.bpm / 120, 0.75, 1.45) : 1.0;
    if (input?.isPlaying && overall > 0) {
      this.swayPhase +=
        dt * bpmRate * (1.1 + (input.energy ?? 0) * 1.45 + (input.feverActive ? 0.35 : 0));
      this.shakePhase += dt * 42;
    }

    const energy = input?.energy ?? 0;
    const bass = input?.bass ?? 0;
    const transient = input?.bassTransient ?? 0;
    const section = input?.sectionType ?? 'groove';

    // Cinematic drop envelope (0 -> 1 peak at onset -> smooth release)
    const dropFrac = this.dropTransitionTimer > 0 ? this.dropTransitionTimer / 1.25 : 0;
    const dropBell = Math.sin(dropFrac * Math.PI);

    // 1. Section-aware Zoom Out (Pull-Back) in calm / breakdown / transition
    let targetPull = 0;
    if (section === 'calm' || section === 'breakdown') {
      targetPull = 0.85;
    } else if (section === 'chorus') {
      targetPull = 0.15;
    }
    this.pullBackTarget = THREE.MathUtils.damp(this.pullBackTarget, targetPull, 2.4, dt);

    // 2. Dynamic Zoom In + Impact Zoom + Zoom Out (both Z distance AND FOV projection)
    const zoomEnabled = cfg ? cfg.dynamicZoom.enabled : true;
    const zoomIntensity = zoomEnabled ? (cfg?.dynamicZoom.intensity ?? 1.0) * overall : 0;
    const pullEnabled = cfg ? cfg.pullBack.enabled : true;
    const pullIntensity = pullEnabled ? (cfg?.pullBack.intensity ?? 0.9) * overall : 0;

    const buildupPush = section === 'buildup' ? 0.42 : 0;
    const feverPush = input?.feverActive ? 0.35 : 0;

    // Negative Z = physically closer to track; Negative FOV = cinematic zoom-in lens
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

    const targetZ = THREE.MathUtils.clamp(zoomInZ + zoomOutZ, -1.65, 1.35);

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

    const targetFovOffset = THREE.MathUtils.clamp(zoomInFov + zoomOutFov, -7.2, 4.4);

    // 3. Horizontal Camera Offset (smooth rhythmic sway + lateral accents + automatic center recovery)
    const horizMult =
      cfg && cfg.horizontalOffset.enabled ? cfg.horizontalOffset.intensity * overall : 0;
    const swayAmt = (0.09 + energy * 0.24 + (section === 'chorus' || section === 'drop' ? 0.12 : 0));
    const targetOffsetX = THREE.MathUtils.clamp(
      horizMult * (Math.sin(this.swayPhase) * swayAmt + this.lateralAccent + dropBell * this.dropDirection * 0.25),
      -0.78,
      0.78,
    );

    // 4. Vertical Camera Offset (subtle height arc + beat bounce + drop swoop)
    const vertEnabled = cfg?.verticalOffset ? cfg.verticalOffset.enabled : true;
    const vertBaseIntensity = cfg?.verticalOffset
      ? cfg.verticalOffset.intensity
      : (cfg?.horizontalOffset.intensity ?? 0.8);
    const vertMult = vertEnabled ? vertBaseIntensity * overall : 0;
    const calmFloat = section === 'calm' || section === 'breakdown' ? 0.18 : 0;
    const targetOffsetY = THREE.MathUtils.clamp(
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

    // Subtle LookAt counterweight keeps hit-line grounded while shifting perspective naturally
    const targetLookX = targetOffsetX * 0.35;
    const targetLookY =
      0.55 + targetOffsetY * 0.22 - this.preDropTension * 0.08 + introArcY * 0.45;

    // 5. Camera Tilt (perceptible musical roll with automatic recovery to 0)
    const tiltEnabled = cfg?.tilt ? cfg.tilt.enabled : true;
    const tiltBaseIntensity = cfg?.tilt
      ? cfg.tilt.intensity
      : (cfg?.horizontalOffset.intensity ?? 0.8);
    const tiltMult = !isReduced && tiltEnabled ? tiltBaseIntensity * overall : 0;
    const targetRoll = THREE.MathUtils.clamp(
      tiltMult *
        (Math.sin(this.swayPhase * 0.85) * (0.012 + energy * 0.026) +
          this.tiltAccent +
          this.lateralAccent * 0.042),
      -0.068,
      0.068,
    );

    // 6. Controlled Camera Shake (disabled when reducedMotion)
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

    // 7. Smooth exponential interpolation & recovery
    const smooth = isReduced || (cfg ? cfg.smoothTransitions : true);
    const dampFast = smooth ? 9.5 : 22;
    const dampSlow = smooth ? 5.6 : 18;

    this.curFovOffset = THREE.MathUtils.damp(this.curFovOffset, targetFovOffset, dampFast, dt);
    this.curOffsetX = THREE.MathUtils.damp(this.curOffsetX, targetOffsetX, dampSlow, dt);
    this.curOffsetY = THREE.MathUtils.damp(this.curOffsetY, targetOffsetY + introArcY, dampFast, dt);
    this.curOffsetZ = THREE.MathUtils.damp(this.curOffsetZ, targetZ + introArcZ, dampFast, dt);
    this.curLookX = THREE.MathUtils.damp(this.curLookX, targetLookX, dampSlow, dt);
    this.curLookY = THREE.MathUtils.damp(this.curLookY, targetLookY, dampSlow, dt);
    this.curRoll = THREE.MathUtils.damp(this.curRoll, targetRoll, dampSlow, dt);
    this.curShakeX = THREE.MathUtils.damp(this.curShakeX, targetShakeX, 26, dt);
    this.curShakeY = THREE.MathUtils.damp(this.curShakeY, targetShakeY, 26, dt);

    const nextFov = THREE.MathUtils.clamp(this.baseFov + this.curFovOffset, 52, 98);
    if (Math.abs(this.camera.fov - nextFov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.set(
      this.curOffsetX + this.curShakeX,
      this.baseCamY + this.curOffsetY + this.curShakeY,
      this.baseCamZ + this.curOffsetZ,
    );
    this.camera.lookAt(this.curLookX, this.curLookY, -26);
    this.camera.rotation.z = this.curRoll;
  }
}
