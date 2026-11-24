import * as THREE from 'three';
import type { SongPalette } from '../../types/game';
import {
  addInkOutline,
  createCelToonGradientMap,
  createCrossStarTexture,
  createIllustratedEqualizerTexture,
} from './illustratedLayers';
import { SeededRng } from './seededRandom';
import { disposeObjectTree } from './sharedTextures';
import type { WorldAtmosphere, WorldBuildOptions, WorldInstance, WorldUpdateContext } from './types';

const _colA = new THREE.Color();
const _colB = new THREE.Color();
const _colAccent = new THREE.Color();

export class NightclubWorld implements WorldInstance {
  public readonly theme = 'nightclub' as const;
  public readonly group = new THREE.Group();
  public readonly atmosphere: WorldAtmosphere = {
    backgroundColor: 0x0b0722,
    fogColor: 0x1a0e3d,
    fogDensity: 0.009,
    hemiSkyColor: 0xe879f9,
    hemiGroundColor: 0x160c2e,
    dirLightColor: 0xbae6fd,
  };

  private rng: SeededRng;
  private toonGrad: THREE.DataTexture;
  private primaryColor = new THREE.Color('#22d3ee');
  private secondaryColor = new THREE.Color('#ec4899');
  private accentColor = new THREE.Color('#a855f7');

  private skyMat!: THREE.ShaderMaterial;
  private floorMat!: THREE.ShaderMaterial;
  private stageRingMat!: THREE.MeshBasicMaterial;
  private stageRing!: THREE.Mesh;
  private spotCones: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; baseRotZ: number; phase: number }> = [];
  private laserBeams: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; baseRotZ: number; phase: number }> = [];
  private speakerCones: THREE.Mesh[] = [];
  private hazePoints!: THREE.Points;
  private hazeMat!: THREE.PointsMaterial;
  private hazeCount = 190;

  constructor(opts: WorldBuildOptions) {
    this.rng = new SeededRng(`${opts.seed}:nightclub`);
    this.toonGrad = createCelToonGradientMap();
    this.primaryColor.set(opts.palette.primary);
    this.secondaryColor.set(opts.palette.secondary);
    this.accentColor.set(opts.palette.accent);
    this.hazeCount = opts.graphicsQuality === 'low' ? 80 : opts.graphicsQuality === 'medium' ? 135 : 190;

    this.buildClubBackdropDome();
    this.buildGlossyClubFloor();
    this.buildStageArchAndSpeakerStacks();
    this.buildEqualizerScreens(opts.maxAnisotropy);
    this.buildSpotlightsAndLasers(opts.graphicsQuality);
    this.buildClubSparkles();
  }

  private buildClubBackdropDome(): void {
    const geo = new THREE.SphereGeometry(138, 28, 16);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uEnergy: { value: 0.25 },
        uBrightness: { value: 1.0 },
        uColA: { value: this.primaryColor.clone() },
        uColB: { value: this.secondaryColor.clone() },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uEnergy;
        uniform float uBrightness;
        uniform vec3 uColA;
        uniform vec3 uColB;
        varying vec3 vDir;
        void main() {
          float y = clamp(vDir.y, -0.15, 1.0);
          vec3 roof = vec3(0.03, 0.02, 0.1);
          vec3 wall = vec3(0.11, 0.06, 0.26);
          vec3 col = mix(wall, roof, smoothstep(0.0, 0.55, y));
          float stageGlow = exp(-length(vDir.xy - vec2(0.0, 0.08)) * 2.6);
          col += mix(uColB, uColA, 0.5 + 0.5 * vDir.x) * stageGlow * (0.28 + uEnergy * 0.24);
          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.group.add(new THREE.Mesh(geo, this.skyMat));
  }

  private buildGlossyClubFloor(): void {
    const geo = new THREE.PlaneGeometry(175, 175);
    this.floorMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uKick: { value: 0 },
        uEnergy: { value: 0.25 },
        uBrightness: { value: 1.0 },
        uColA: { value: this.primaryColor.clone() },
        uColB: { value: this.secondaryColor.clone() },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uKick;
        uniform float uEnergy;
        uniform float uBrightness;
        uniform vec3 uColA;
        uniform vec3 uColB;
        varying vec3 vWorldPos;
        void main() {
          float fade = exp(-abs(vWorldPos.z + 20.0) * 0.011);
          float tileX = step(0.92, abs(sin(vWorldPos.x * 0.75)));
          float tileZ = step(0.92, abs(sin(vWorldPos.z * 0.75 + uTime * 1.4)));
          float wave = smoothstep(0.84, 1.0, sin(vWorldPos.z * 0.3 + uTime * 3.0));
          vec3 base = vec3(0.05, 0.03, 0.14);
          vec3 neon = mix(uColA, uColB, smoothstep(-20.0, 20.0, vWorldPos.x));
          vec3 col = base + neon * ((tileX + tileZ) * 0.11 + wave * (0.06 + uKick * 0.16)) * (0.7 + uEnergy * 0.35) * fade;
          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
    });
    const floor = new THREE.Mesh(geo, this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1.68, -54);
    this.group.add(floor);
  }

  private buildStageArchAndSpeakerStacks(): void {
    const darkRigMat = new THREE.MeshToonMaterial({ color: 0x141030, gradientMap: this.toonGrad });
    const trimMat = new THREE.MeshBasicMaterial({ color: this.primaryColor });

    // Overhead club lighting truss frames flanking corridor cleanly
    for (let i = 0; i < 4; i++) {
      const z = -14 - i * 14;
      const g = new THREE.Group();
      g.position.set(0, 0, z);

      const leftTower = new THREE.Mesh(new THREE.BoxGeometry(0.45, 9.5, 0.45), darkRigMat);
      leftTower.position.set(-6.4, 3.8, 0);
      addInkOutline(leftTower, 0x050312, 1.08);
      const rightTower = new THREE.Mesh(new THREE.BoxGeometry(0.45, 9.5, 0.45), darkRigMat);
      rightTower.position.set(6.4, 3.8, 0);
      addInkOutline(rightTower, 0x050312, 1.08);
      const topTruss = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.42, 0.45), darkRigMat);
      topTruss.position.set(0, 8.6, 0);
      addInkOutline(topTruss, 0x050312, 1.06);
      const glowBar = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.14, 0.5), trimMat);
      glowBar.position.set(0, 8.35, 0);

      g.add(leftTower, rightTower, topTruss, glowBar);
      this.group.add(g);
    }

    // Hero DJ stage backdrop ring at horizon
    this.stageRingMat = new THREE.MeshBasicMaterial({ color: this.secondaryColor });
    this.stageRing = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.34, 12, 48), this.stageRingMat);
    this.stageRing.position.set(0, 6.8, -72);
    this.group.add(this.stageRing);

    // Ink-outlined speaker subwoofer stacks flanking stage left & right
    const cabGeo = new THREE.BoxGeometry(3.4, 5.8, 2.6);
    const wooferGeo = new THREE.TorusGeometry(0.95, 0.16, 10, 24);
    const wooferMat = new THREE.MeshBasicMaterial({ color: this.accentColor });

    [-10.2, 10.2].forEach((x) => {
      [-20, -38, -56].forEach((z) => {
        const cab = new THREE.Mesh(cabGeo, darkRigMat);
        cab.position.set(x, 1.2, z);
        addInkOutline(cab, 0x050312, 1.05);
        this.group.add(cab);

        const w1 = new THREE.Mesh(wooferGeo, wooferMat);
        w1.position.set(x, 2.4, z + 1.36);
        const w2 = new THREE.Mesh(wooferGeo, wooferMat);
        w2.position.set(x, 0.1, z + 1.36);
        this.speakerCones.push(w1, w2);
        this.group.add(w1, w2);
      });
    });
  }

  private buildEqualizerScreens(anisotropy: number): void {
    const texA = createIllustratedEqualizerTexture('#22d3ee', '#ec4899', '#060414', anisotropy);
    const texB = createIllustratedEqualizerTexture('#a855f7', '#fbbf24', '#060414', anisotropy);
    const matA = new THREE.MeshBasicMaterial({ map: texA, transparent: true, side: THREE.DoubleSide });
    const matB = new THREE.MeshBasicMaterial({ map: texB, transparent: true, side: THREE.DoubleSide });

    const screens = [
      { x: -16.5, y: 7.5, z: -50, w: 9.5, h: 5.5, rotY: 0.42, mat: matA },
      { x: 16.5, y: 7.5, z: -50, w: 9.5, h: 5.5, rotY: -0.42, mat: matB },
      { x: -19.5, y: 9.2, z: -68, w: 12, h: 6.8, rotY: 0.25, mat: matB },
      { x: 19.5, y: 9.2, z: -68, w: 12, h: 6.8, rotY: -0.25, mat: matA },
    ];
    for (const s of screens) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), s.mat);
      m.position.set(s.x, s.y, s.z);
      m.rotation.y = s.rotY;
      this.group.add(m);
    }
  }

  private buildSpotlightsAndLasers(quality: string): void {
    const coneGeo = new THREE.ConeGeometry(2.8, 22, 14, 1, true);
    coneGeo.translate(0, -11, 0);

    const spotCount = quality === 'low' ? 4 : 6;
    for (let i = 0; i < spotCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? this.primaryColor : this.secondaryColor,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(coneGeo, mat);
      mesh.position.set(side * (6.2 + (i % 3) * 2.2), 11.5, -24 - i * 8);
      const baseRotZ = side * 0.28;
      mesh.rotation.z = baseRotZ;
      this.group.add(mesh);
      this.spotCones.push({ mesh, mat, baseRotZ, phase: i * 1.1 });
    }

    // Crisp laser fan beams firing above the track
    const laserGeo = new THREE.PlaneGeometry(0.14, 46);
    laserGeo.translate(0, -23, 0);
    const laserCount = quality === 'low' ? 4 : 8;
    for (let i = 0; i < laserCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const mat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0x22d3ee : i % 3 === 1 ? 0xf43f8e : 0xa855f7,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(laserGeo, mat);
      mesh.position.set(side * 8.5, 13.5, -48 - (i % 4) * 6);
      const baseRotZ = side * (0.35 + (i % 4) * 0.14);
      mesh.rotation.z = baseRotZ;
      mesh.rotation.x = 0.35;
      this.group.add(mesh);
      this.laserBeams.push({ mesh, mat, baseRotZ, phase: i * 0.8 });
    }
  }

  private buildClubSparkles(): void {
    const pos = new Float32Array(this.hazeCount * 3);
    const cols = new Float32Array(this.hazeCount * 3);
    const c1 = new THREE.Color('#22d3ee');
    const c2 = new THREE.Color('#ec4899');
    const c3 = new THREE.Color('#fde047');

    for (let i = 0; i < this.hazeCount; i++) {
      pos[i * 3] = this.rng.range(-26, 26);
      pos[i * 3 + 1] = this.rng.range(0.5, 18);
      pos[i * 3 + 2] = this.rng.range(-78, 4);
      const c = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    this.hazeMat = new THREE.PointsMaterial({
      size: 0.36,
      map: createCrossStarTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.hazePoints = new THREE.Points(geo, this.hazeMat);
    this.group.add(this.hazePoints);
  }

  public setPalette(palette: SongPalette): void {
    this.primaryColor.set(palette.primary);
    this.secondaryColor.set(palette.secondary);
    this.accentColor.set(palette.accent);
  }

  public update(ctx: WorldUpdateContext): void {
    const {
      dt,
      elapsed,
      mode,
      mid,
      high,
      energy,
      kickPulse = 0,
      snarePulse = 0,
      hihatPulse = 0,
      chromaticA,
      chromaticB,
      chromaticAccent,
      inSilence,
      reactiveEnabled,
      visualIntensity,
      particleIntensity,
      brightness,
    } = ctx;

    const visMult = visualIntensity === 'low' ? 0.45 : visualIntensity === 'medium' ? 0.75 : 1.0;
    const partMult = particleIntensity === 'low' ? 0.35 : particleIntensity === 'medium' ? 0.68 : 1.0;
    const bright = THREE.MathUtils.clamp(brightness, 0.5, 1.32);
    const silenceDamp = inSilence ? 0.32 : 1.0;

    const effMid = reactiveEnabled ? mid * visMult * silenceDamp : 0.14;
    const effHigh = reactiveEnabled ? high * visMult * silenceDamp : 0.12;
    const effEnergy = reactiveEnabled ? energy * visMult * silenceDamp : 0.16;
    const effKick = reactiveEnabled ? kickPulse * visMult * silenceDamp : 0;
    const effSnare = reactiveEnabled ? snarePulse * visMult * silenceDamp : 0;
    const effHihat = reactiveEnabled ? hihatPulse * visMult * silenceDamp : 0;

    _colA.copy(chromaticA ?? this.primaryColor);
    _colB.copy(chromaticB ?? this.secondaryColor);
    _colAccent.copy(chromaticAccent ?? this.accentColor);

    this.skyMat.uniforms.uEnergy.value = effEnergy;
    this.skyMat.uniforms.uBrightness.value = bright;
    this.skyMat.uniforms.uColA.value.copy(_colA);
    this.skyMat.uniforms.uColB.value.copy(_colB);

    this.floorMat.uniforms.uTime.value = elapsed;
    this.floorMat.uniforms.uKick.value = effKick;
    this.floorMat.uniforms.uEnergy.value = effEnergy;
    this.floorMat.uniforms.uBrightness.value = bright;
    this.floorMat.uniforms.uColA.value.copy(_colA);
    this.floorMat.uniforms.uColB.value.copy(_colB);

    // Stage ring & subwoofer cones pump cleanly on Kick
    this.stageRingMat.color.copy(_colB);
    this.stageRing.scale.setScalar(1 + effKick * 0.08);
    const subScale = 1 + effKick * 0.14;
    for (const cone of this.speakerCones) {
      cone.scale.setScalar(subScale);
    }

    // Sweeping spotlights on Mid / Energy
    for (let i = 0; i < this.spotCones.length; i++) {
      const sp = this.spotCones[i];
      sp.mesh.rotation.z = sp.baseRotZ + Math.sin(elapsed * (1.2 + effMid * 1.1) + sp.phase) * 0.32;
      sp.mat.color.copy(i % 2 === 0 ? _colA : _colB);
      sp.mat.opacity = Math.min(0.16, (0.045 + effMid * 0.08) * bright);
    }

    // Crisp laser fans flare on Snare / Hi-hat transients
    for (let i = 0; i < this.laserBeams.length; i++) {
      const lb = this.laserBeams[i];
      lb.mesh.rotation.z = lb.baseRotZ + Math.cos(elapsed * 2.1 + lb.phase) * 0.18;
      lb.mat.color.copy(i % 2 === 0 ? _colA : _colAccent);
      lb.mat.opacity = Math.min(0.68, (0.14 + effSnare * 0.36 + effHihat * 0.25) * bright);
    }

    const activeRatio = particleIntensity === 'low' ? 0.34 : particleIntensity === 'medium' ? 0.68 : 1.0;
    const activeCount = Math.floor(this.hazeCount * activeRatio);
    this.hazePoints.geometry.setDrawRange(0, activeCount);
    this.hazeMat.opacity = Math.min(0.9, (0.4 + effHigh * 0.25 + effHihat * 0.25) * partMult * bright);

    const pAttr = this.hazePoints.geometry.attributes.position as THREE.BufferAttribute;
    const speed = mode === 'paused' ? 0 : 4.5 + effEnergy * 7.5;
    for (let i = 0; i < activeCount; i++) {
      let z = pAttr.getZ(i) + speed * dt;
      if (z > 6) z = -78;
      pAttr.setZ(i, z);
    }
    pAttr.needsUpdate = true;
  }

  public dispose(): void {
    this.toonGrad.dispose();
    disposeObjectTree(this.group);
  }
}
