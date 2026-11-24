import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { EnvironmentTheme, QualityLevel } from '../../types/game';
import { createWorldByTheme } from './EnvironmentManager';
import { getEnvironmentDefinition } from './environmentDefinitions';
import type { WorldInstance } from './types';

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

/**
 * Independent 3D Environment Preview Engine.
 * - Reuses real world builders (`createWorldByTheme`) so preview matches actual gameplay.
 * - Uses an isolated PerspectiveCamera, reduced resolution, and throttled frame rate (~30 FPS).
 * - Never loads multiple worlds simultaneously and disposes every geometry, material, texture,
 *   and PMREM render target cleanly on world change or unmount.
 */
export class EnvironmentPreview {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private hemiLight: THREE.HemisphereLight;
  private dirLight: THREE.DirectionalLight;
  private activeWorld: WorldInstance | null = null;

  private isSoftwareGl: boolean;
  private disposed = false;
  private rafId = 0;
  private timerId = 0;
  private lastTickMs = 0;
  private elapsedSec = 0;
  private currentTheme: EnvironmentTheme;
  private currentQuality: QualityLevel;
  private orbitPhase = 0;
  private onContextLostCb?: () => void;

  // Mini preview runway strip so camera framing matches real track perspective
  private trackGroup: THREE.Group;
  private trackMat: THREE.MeshStandardMaterial;
  private railLeftMat: THREE.MeshStandardMaterial;
  private railRightMat: THREE.MeshStandardMaterial;

  constructor(
    container: HTMLElement,
    initialTheme: EnvironmentTheme,
    quality: QualityLevel = 'medium',
    onContextLost?: () => void,
  ) {
    this.container = container;
    this.currentTheme = initialTheme;
    this.currentQuality = quality;
    this.onContextLostCb = onContextLost;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(160, container.clientWidth || 420);
    const height = Math.max(100, container.clientHeight || 240);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'low-power',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.94;
    // Preview intentionally renders at reduced resolution to protect gameplay GPU budget
    const maxPreviewDpr = this.isSoftwareGl ? 0.85 : 1.25;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPreviewDpr));
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 175);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();

    this.hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x1e1b4b, 0.65);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.dirLight.position.set(5, 10, 8);
    this.scene.add(this.dirLight);

    // Lightweight miniature track guide inside preview
    this.trackGroup = new THREE.Group();
    this.trackMat = new THREE.MeshStandardMaterial({
      color: 0x1b1347,
      roughness: 0.38,
      metalness: 0.45,
    });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.14, 52), this.trackMat);
    deck.position.set(0, -0.07, -20);
    this.trackGroup.add(deck);

    this.railLeftMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.7,
      roughness: 0.25,
      metalness: 0.5,
    });
    this.railRightMat = new THREE.MeshStandardMaterial({
      color: 0xf43f8e,
      emissive: 0xf43f8e,
      emissiveIntensity: 0.7,
      roughness: 0.25,
      metalness: 0.5,
    });
    const railGeo = new THREE.BoxGeometry(0.14, 0.14, 52);
    const rL = new THREE.Mesh(railGeo, this.railLeftMat);
    rL.position.set(-2.95, 0.04, -20);
    const rR = new THREE.Mesh(railGeo, this.railRightMat);
    rR.position.set(2.95, 0.04, -20);
    this.trackGroup.add(rL, rR);
    this.scene.add(this.trackGroup);

    this.loadTheme(initialTheme, quality);
    this.startLoop();
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.onContextLostCb?.();
  };

  public loadTheme(theme: EnvironmentTheme, quality: QualityLevel = this.currentQuality): void {
    if (this.disposed) return;
    if (this.activeWorld && this.currentTheme === theme && this.currentQuality === quality) {
      return;
    }

    if (this.activeWorld) {
      this.scene.remove(this.activeWorld.group);
      this.activeWorld.dispose();
      this.activeWorld = null;
    }

    this.currentTheme = theme;
    this.currentQuality = quality;
    const def = getEnvironmentDefinition(theme);
    const maxAniso = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    const world = createWorldByTheme(theme, `PREVIEW-${theme}`, maxAniso, quality, def.colorPalette);
    this.activeWorld = world;
    this.scene.add(world.group);

    // Apply atmosphere & camera framing
    const atm = world.atmosphere;
    this.scene.background = new THREE.Color(atm.backgroundColor);
    this.scene.fog = new THREE.FogExp2(atm.fogColor, atm.fogDensity);
    this.hemiLight.color.setHex(atm.hemiSkyColor);
    this.hemiLight.groundColor.setHex(atm.hemiGroundColor);
    this.dirLight.color.setHex(atm.dirLightColor);
    this.renderer.toneMappingExposure = def.lightingProfile.exposure;

    this.railLeftMat.color.set(def.colorPalette.primary);
    this.railLeftMat.emissive.set(def.colorPalette.primary);
    this.railRightMat.color.set(def.colorPalette.secondary);
    this.railRightMat.emissive.set(def.colorPalette.secondary);

    const [px, py, pz] = def.cameraSettings.previewPos;
    const [lx, ly, lz] = def.cameraSettings.previewLookAt;
    this.camera.fov = def.cameraSettings.baseFov;
    this.camera.position.set(px, py, pz);
    this.camera.lookAt(lx, ly, lz);
    this.camera.updateProjectionMatrix();

    // Render one immediate frame
    this.stepSimulation(1 / 30);
    this.renderer.render(this.scene, this.camera);
  }

  public resize(): void {
    if (this.disposed) return;
    const width = Math.max(160, this.container.clientWidth || 420);
    const height = Math.max(100, this.container.clientHeight || 240);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private stepSimulation(dt: number): void {
    this.elapsedSec += dt;
    this.orbitPhase += dt * 0.45;
    const def = getEnvironmentDefinition(this.currentTheme);

    // Subtle simulated beat envelope so users can evaluate lights & motion cleanly
    const beatCycle = (this.elapsedSec * 2.0) % 1;
    const kick = Math.pow(Math.max(0, 1 - beatCycle * 3.8), 2);
    const snare = Math.pow(Math.max(0, 1 - (((this.elapsedSec * 2.0 + 0.5) % 1) * 4.2)), 2);
    const hihat = Math.pow(Math.max(0, 1 - (((this.elapsedSec * 4.0) % 1) * 5.0)), 2);
    const energy = 0.45 + Math.sin(this.elapsedSec * 1.1) * 0.18 + kick * 0.22;

    const [px, py, pz] = def.cameraSettings.previewPos;
    const [lx, ly, lz] = def.cameraSettings.previewLookAt;
    this.camera.position.set(
      px + Math.sin(this.orbitPhase) * 0.65,
      py + Math.sin(this.orbitPhase * 0.7) * 0.16,
      pz + kick * -0.14,
    );
    this.camera.lookAt(lx, ly, lz);

    this.railLeftMat.emissiveIntensity = 0.55 + kick * 0.45;
    this.railRightMat.emissiveIntensity = 0.55 + snare * 0.45;

    this.activeWorld?.update({
      dt,
      elapsed: this.elapsedSec,
      mode: 'idle',
      subBass: 0.42 + kick * 0.45,
      bass: 0.46 + kick * 0.4,
      lowMid: 0.4 + snare * 0.35,
      mid: 0.44 + snare * 0.3,
      highMid: 0.36 + hihat * 0.35,
      treble: 0.32 + hihat * 0.32,
      high: 0.35 + hihat * 0.3,
      energy,
      kickPulse: kick,
      snarePulse: snare,
      hihatPulse: hihat,
      beatPulse: kick,
      dropFlash: 0,
      sectionType: 'groove',
      isMenu: true,
      menuAmbientEffects: true,
      chromaticA: new THREE.Color(def.colorPalette.primary),
      chromaticB: new THREE.Color(def.colorPalette.secondary),
      chromaticAccent: new THREE.Color(def.colorPalette.accent),
      inSilence: false,
      reactiveEnabled: true,
      visualIntensity: 'medium',
      particleIntensity: 'medium',
      graphicsQuality: this.currentQuality,
      reflectionQuality: 'low',
      brightness: 1.0,
    });
  }

  private startLoop(): void {
    const minIntervalMs = this.isSoftwareGl ? 110 : 33; // Capped ~30 FPS (or slower on software WebGL)
    const loop = (now: number) => {
      if (this.disposed) return;
      if (now - this.lastTickMs >= minIntervalMs) {
        const dt = Math.min(0.08, Math.max(0.016, (now - this.lastTickMs) / 1000));
        this.lastTickMs = now;
        this.stepSimulation(dt);
        this.renderer.render(this.scene, this.camera);
      }
      if (this.isSoftwareGl) {
        this.timerId = window.setTimeout(() => {
          if (!this.disposed) {
            this.rafId = requestAnimationFrame(loop);
          }
        }, 70);
      } else {
        this.rafId = requestAnimationFrame(loop);
      }
    };
    this.lastTickMs = performance.now();
    this.rafId = requestAnimationFrame(loop);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.timerId);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);

    if (this.activeWorld) {
      this.scene.remove(this.activeWorld.group);
      this.activeWorld.dispose();
      this.activeWorld = null;
    }

    this.trackGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });

    if (this.envRT) {
      this.envRT.dispose();
      this.envRT = null;
    }

    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
