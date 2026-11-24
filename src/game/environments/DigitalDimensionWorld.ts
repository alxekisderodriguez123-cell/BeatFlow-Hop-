import * as THREE from 'three';
import type { SongPalette } from '../../types/game';
import {
  addInkOutline,
  createCelToonGradientMap,
  createCrossStarTexture,
  createIllustratedDigitalMatrixTexture,
} from './illustratedLayers';
import { SeededRng } from './seededRandom';
import { disposeObjectTree } from './sharedTextures';
import type { WorldAtmosphere, WorldBuildOptions, WorldInstance, WorldUpdateContext } from './types';

const _colA = new THREE.Color();
const _colB = new THREE.Color();

export class DigitalDimensionWorld implements WorldInstance {
  public readonly theme = 'digital' as const;
  public readonly group = new THREE.Group();
  public readonly atmosphere: WorldAtmosphere = {
    backgroundColor: 0x060b24,
    fogColor: 0x0e1844,
    fogDensity: 0.0068,
    hemiSkyColor: 0x22d3ee,
    hemiGroundColor: 0x1e1b4b,
    dirLightColor: 0xe0f2fe,
  };

  private rng: SeededRng;
  private toonGrad: THREE.DataTexture;
  private primaryColor = new THREE.Color('#22d3ee');
  private secondaryColor = new THREE.Color('#a855f7');

  private skyMat!: THREE.ShaderMaterial;
  private gridMat!: THREE.ShaderMaterial;
  private portalFrames: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; phase: number }> = [];
  private polyhedra: Array<{ mesh: THREE.Mesh; baseY: number; phase: number; speed: number }> = [];
  private dataParticles!: THREE.Points;
  private dataMat!: THREE.PointsMaterial;
  private dataCount = 220;

  constructor(opts: WorldBuildOptions) {
    this.rng = new SeededRng(`${opts.seed}:digital`);
    this.toonGrad = createCelToonGradientMap();
    this.primaryColor.set(opts.palette.primary);
    this.secondaryColor.set(opts.palette.secondary);
    this.dataCount = opts.graphicsQuality === 'low' ? 90 : opts.graphicsQuality === 'medium' ? 150 : 220;

    this.buildCyberVoidSky();
    this.buildDigitalMatrixFloor();
    this.buildParallaxHologramLayers(opts.maxAnisotropy);
    this.buildGeometricPortalTunnel();
    this.buildFloatingPolyhedra();
    this.buildDataSparkles();
  }

  private buildCyberVoidSky(): void {
    const geo = new THREE.SphereGeometry(142, 28, 16);
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
          vec3 zenith = vec3(0.02, 0.04, 0.14);
          vec3 horizon = vec3(0.07, 0.13, 0.34);
          vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.65, y));
          float centerGlow = exp(-length(vDir.xy - vec2(0.0, 0.08)) * 3.2);
          col += mix(uColA, uColB, 0.5) * centerGlow * (0.28 + uEnergy * 0.24);
          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.group.add(new THREE.Mesh(geo, this.skyMat));
  }

  private buildDigitalMatrixFloor(): void {
    const geo = new THREE.PlaneGeometry(190, 185);
    this.gridMat = new THREE.ShaderMaterial({
      uniforms: {
        uScroll: { value: 0 },
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
        uniform float uScroll;
        uniform float uKick;
        uniform float uEnergy;
        uniform float uBrightness;
        uniform vec3 uColA;
        uniform vec3 uColB;
        varying vec3 vWorldPos;
        void main() {
          float fade = exp(-abs(vWorldPos.z + 18.0) * 0.009);
          float gx = step(0.94, abs(sin(vWorldPos.x * 0.72)));
          float gz = step(0.94, abs(sin(vWorldPos.z * 0.5 + uScroll * 6.2831)));
          float pulse = smoothstep(0.85, 1.0, sin(vWorldPos.z * 0.32 + uScroll * 6.2831));
          vec3 base = vec3(0.03, 0.05, 0.16);
          vec3 gridCol = mix(uColA, uColB, smoothstep(-28.0, 28.0, vWorldPos.x));
          vec3 col = base + gridCol * (max(gx, gz) * 0.34 + pulse * (0.08 + uKick * 0.22)) * (0.72 + uEnergy * 0.3) * fade;
          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
    });
    const floor = new THREE.Mesh(geo, this.gridMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1.68, -56);
    this.group.add(floor);
  }

  private buildParallaxHologramLayers(anisotropy: number): void {
    const tex = createIllustratedDigitalMatrixTexture('#22d3ee', '#a855f7', anisotropy);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const planes = [
      { x: -20, y: 8.5, z: -42, w: 28, h: 24, rotY: 0.65 },
      { x: 20, y: 8.5, z: -42, w: 28, h: 24, rotY: -0.65 },
      { x: -28, y: 12, z: -68, w: 34, h: 28, rotY: 0.35 },
      { x: 28, y: 12, z: -68, w: 34, h: 28, rotY: -0.35 },
    ];
    for (const p of planes) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), mat);
      m.position.set(p.x, p.y, p.z);
      m.rotation.y = p.rotY;
      this.group.add(m);
    }
  }

  private buildGeometricPortalTunnel(): void {
    const count = 6;
    for (let i = 0; i < count; i++) {
      const radius = 8.4 + i * 0.85;
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? this.primaryColor : this.secondaryColor,
      });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.16, 4, 4), mat);
      mesh.position.set(0, 7.6, -74 + i * 7.5);
      mesh.rotation.z = Math.PI * 0.25 + i * 0.12;
      this.group.add(mesh);
      this.portalFrames.push({ mesh, mat, phase: i * 0.6 });
    }
  }

  private buildFloatingPolyhedra(): void {
    const bodyMat = new THREE.MeshToonMaterial({
      color: 0x1e2b6b,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.32,
      gradientMap: this.toonGrad,
    });
    const geo = new THREE.OctahedronGeometry(0.95, 0);

    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const m = new THREE.Mesh(geo, bodyMat);
      addInkOutline(m, 0x05091d, 1.07);
      const baseY = this.rng.range(1.6, 9.2);
      m.position.set(side * this.rng.range(7.2, 15.5), baseY, -10 - i * 5.8);
      m.scale.setScalar(this.rng.range(0.7, 1.35));
      this.group.add(m);
      this.polyhedra.push({
        mesh: m,
        baseY,
        phase: this.rng.range(0, Math.PI * 2),
        speed: this.rng.range(0.5, 1.1),
      });
    }
  }

  private buildDataSparkles(): void {
    const pos = new Float32Array(this.dataCount * 3);
    const cols = new Float32Array(this.dataCount * 3);
    const c1 = new THREE.Color('#22d3ee');
    const c2 = new THREE.Color('#a855f7');
    const c3 = new THREE.Color('#ffffff');

    for (let i = 0; i < this.dataCount; i++) {
      pos[i * 3] = this.rng.range(-34, 34);
      pos[i * 3 + 1] = this.rng.range(0.5, 24);
      pos[i * 3 + 2] = this.rng.range(-88, 6);
      const c = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    this.dataMat = new THREE.PointsMaterial({
      size: 0.36,
      map: createCrossStarTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.dataParticles = new THREE.Points(geo, this.dataMat);
    this.group.add(this.dataParticles);
  }

  public setPalette(palette: SongPalette): void {
    this.primaryColor.set(palette.primary);
    this.secondaryColor.set(palette.secondary);
  }

  public update(ctx: WorldUpdateContext): void {
    const {
      dt,
      elapsed,
      mode,
      bass,
      high,
      energy,
      kickPulse = 0,
      snarePulse = 0,
      hihatPulse = 0,
      chromaticA,
      chromaticB,
      inSilence,
      reactiveEnabled,
      visualIntensity,
      particleIntensity,
      brightness,
    } = ctx;

    const visMult = visualIntensity === 'low' ? 0.45 : visualIntensity === 'medium' ? 0.75 : 1.0;
    const partMult = particleIntensity === 'low' ? 0.35 : particleIntensity === 'medium' ? 0.68 : 1.0;
    const bright = THREE.MathUtils.clamp(brightness, 0.5, 1.35);
    const silenceDamp = inSilence ? 0.34 : 1.0;

    const effBass = reactiveEnabled ? bass * visMult * silenceDamp : 0.16;
    const effHigh = reactiveEnabled ? high * visMult * silenceDamp : 0.14;
    const effEnergy = reactiveEnabled ? energy * visMult * silenceDamp : 0.18;
    const effKick = reactiveEnabled ? kickPulse * visMult * silenceDamp : 0;
    const effSnare = reactiveEnabled ? snarePulse * visMult * silenceDamp : 0;
    const effHihat = reactiveEnabled ? hihatPulse * visMult * silenceDamp : 0;

    _colA.copy(chromaticA ?? this.primaryColor);
    _colB.copy(chromaticB ?? this.secondaryColor);

    this.skyMat.uniforms.uEnergy.value = effEnergy;
    this.skyMat.uniforms.uBrightness.value = bright;
    this.skyMat.uniforms.uColA.value.copy(_colA);
    this.skyMat.uniforms.uColB.value.copy(_colB);

    this.gridMat.uniforms.uScroll.value =
      mode === 'paused' ? 0 : (elapsed * (0.48 + effEnergy * 0.38)) % 1;
    this.gridMat.uniforms.uKick.value = effKick;
    this.gridMat.uniforms.uEnergy.value = effEnergy;
    this.gridMat.uniforms.uBrightness.value = bright;
    this.gridMat.uniforms.uColA.value.copy(_colA);
    this.gridMat.uniforms.uColB.value.copy(_colB);

    this.portalFrames.forEach((pf, idx) => {
      pf.mesh.rotation.z = Math.PI * 0.25 + elapsed * (idx % 2 === 0 ? 0.14 : -0.14) + pf.phase;
      pf.mesh.scale.setScalar(1 + effKick * 0.055);
      pf.mat.color.copy(idx % 2 === 0 ? _colA : _colB);
      if (effSnare > 0.1) pf.mat.color.offsetHSL(0, 0, Math.min(0.18, effSnare * 0.18));
    });

    const rotMult = mode === 'paused' ? 0 : 1 + effEnergy * 0.6;
    for (const p of this.polyhedra) {
      p.mesh.position.y = p.baseY + Math.sin(elapsed * 1.3 + p.phase) * 0.4;
      p.mesh.rotation.y += p.speed * dt * rotMult;
      p.mesh.rotation.x += p.speed * 0.5 * dt * rotMult;
    }

    const activeRatio = particleIntensity === 'low' ? 0.34 : particleIntensity === 'medium' ? 0.68 : 1.0;
    const activeCount = Math.floor(this.dataCount * activeRatio);
    this.dataParticles.geometry.setDrawRange(0, activeCount);
    this.dataMat.opacity = Math.min(0.92, (0.45 + effHigh * 0.25 + effHihat * 0.25) * partMult * bright);

    const pAttr = this.dataParticles.geometry.attributes.position as THREE.BufferAttribute;
    const speed = mode === 'paused' ? 0 : 7.0 + effBass * 10;
    for (let i = 0; i < activeCount; i++) {
      let z = pAttr.getZ(i) + speed * dt;
      if (z > 8) z = -88;
      pAttr.setZ(i, z);
    }
    pAttr.needsUpdate = true;
  }

  public dispose(): void {
    this.toonGrad.dispose();
    disposeObjectTree(this.group);
  }
}
