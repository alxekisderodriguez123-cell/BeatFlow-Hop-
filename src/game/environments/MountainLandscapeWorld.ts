import * as THREE from 'three';
import type { SongPalette } from '../../types/game';
import {
  addInkOutline,
  createCelToonGradientMap,
  createCrossStarTexture,
  createIllustratedMoonTexture,
  createIllustratedMountainTexture,
  createStylizedCloudTexture,
} from './illustratedLayers';
import { SeededRng } from './seededRandom';
import { disposeObjectTree } from './sharedTextures';
import type { WorldAtmosphere, WorldBuildOptions, WorldInstance, WorldUpdateContext } from './types';

export class MountainLandscapeWorld implements WorldInstance {
  public readonly theme = 'mountain' as const;
  public readonly group = new THREE.Group();
  public readonly atmosphere: WorldAtmosphere = {
    backgroundColor: 0x0a132c,
    fogColor: 0x13274a,
    fogDensity: 0.0072,
    hemiSkyColor: 0x34d399,
    hemiGroundColor: 0x0f172a,
    dirLightColor: 0xcffafe,
  };

  private rng: SeededRng;
  private toonGrad: THREE.DataTexture;
  private skyMat!: THREE.ShaderMaterial;
  private auroraMats: THREE.ShaderMaterial[] = [];
  private mistLakeMat!: THREE.ShaderMaterial;
  private snowPoints!: THREE.Points;
  private snowMat!: THREE.PointsMaterial;
  private snowCount = 220;

  constructor(opts: WorldBuildOptions) {
    this.rng = new SeededRng(`${opts.seed}:mountain-illustrated`);
    this.toonGrad = createCelToonGradientMap();
    this.snowCount = opts.graphicsQuality === 'low' ? 95 : opts.graphicsQuality === 'medium' ? 155 : 220;

    this.buildIllustratedAlpineSky();
    this.buildAuroraRibbons();
    this.buildIllustratedParallaxMountains(opts.maxAnisotropy);
    this.buildInkOutlinedPines();
    this.buildAuroraReflectingLake();
    this.buildAlpineStarlightAndSnow();
  }

  private buildIllustratedAlpineSky(): void {
    const geo = new THREE.SphereGeometry(140, 32, 18);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.25 },
        uBrightness: { value: 1.0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uEnergy;
        uniform float uBrightness;
        varying vec3 vDir;

        void main() {
          float y = clamp(vDir.y, -0.15, 1.0);
          vec3 zenith = vec3(0.03, 0.06, 0.2);
          vec3 midSky = vec3(0.08, 0.19, 0.38);
          vec3 horizonGlow = vec3(0.16, 0.48, 0.56);

          vec3 col = mix(horizonGlow, midSky, smoothstep(0.01, 0.28, y));
          col = mix(col, zenith, smoothstep(0.24, 0.68, y));

          float auroraSky = exp(-abs(vDir.y - 0.25) * 5.0) * (0.5 + 0.5 * sin(vDir.x * 2.2 + uTime * 0.35));
          col += vec3(0.08, 0.58, 0.52) * auroraSky * (0.35 + uEnergy * 0.25);

          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.group.add(new THREE.Mesh(geo, this.skyMat));

    const moonTex = createIllustratedMoonTexture('#f0fdf4', '#99f6e4', 'rgba(52,211,153,0.42)');
    const moon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: moonTex,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        fog: false,
      }),
    );
    moon.position.set(18, 28, -94);
    moon.scale.set(17, 17, 1);
    this.group.add(moon);

    const cloudTex = createStylizedCloudTexture('#142a4f', '#5eead4', '#08142b', false);
    const cloud = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        fog: false,
      }),
    );
    cloud.position.set(-28, 22, -88);
    cloud.scale.set(44, 15, 1);
    this.group.add(cloud);
  }

  private buildAuroraRibbons(): void {
    const configs = [
      { y: 21, z: -68, w: 125, h: 20, colA: '#10b981', colB: '#22d3ee', phase: 0 },
      { y: 25, z: -82, w: 140, h: 24, colA: '#34d399', colB: '#c084fc', phase: 2.1 },
    ];

    for (const cfg of configs) {
      const geo = new THREE.PlaneGeometry(cfg.w, cfg.h, 40, 6);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setZ(i, Math.sin(x * 0.06 + cfg.phase) * 8.5 + Math.cos(x * 0.12) * 3.5);
      }
      geo.computeVertexNormals();

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uEnergy: { value: 0.25 },
          uKick: { value: 0 },
          uBrightness: { value: 1.0 },
          uColorA: { value: new THREE.Color(cfg.colA) },
          uColorB: { value: new THREE.Color(cfg.colB) },
          uPhase: { value: cfg.phase },
        },
        vertexShader: `
          uniform float uTime;
          uniform float uPhase;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 p = position;
            p.z += sin(p.x * 0.1 + uTime * 0.65 + uPhase) * 2.0;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uEnergy;
          uniform float uKick;
          uniform float uBrightness;
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          uniform float uPhase;
          varying vec2 vUv;
          void main() {
            float band = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.2, vUv.y);
            float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
            float rays = 0.55 + 0.45 * sin(vUv.x * 32.0 + uTime * 1.2 + uPhase);
            vec3 col = mix(uColorA, uColorB, vUv.y);
            float alpha = band * edge * rays * (0.34 + uEnergy * 0.24 + uKick * 0.22);
            gl_FragColor = vec4(col * uBrightness, clamp(alpha, 0.0, 0.68));
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      this.auroraMats.push(mat);

      const curtain = new THREE.Mesh(geo, mat);
      curtain.position.set(0, cfg.y, cfg.z);
      curtain.rotation.x = 0.14;
      this.group.add(curtain);
    }
  }

  private buildIllustratedParallaxMountains(anisotropy: number): void {
    const farTex = createIllustratedMountainTexture(this.rng, anisotropy, {
      shadeHex: '#13244b',
      litHex: '#1f3b6e',
      rimHex: '#5eead4',
      inkHex: '#070e22',
      includePines: false,
    });
    const nearTex = createIllustratedMountainTexture(this.rng, anisotropy, {
      shadeHex: '#0f1c38',
      litHex: '#193259',
      rimHex: '#67e8f9',
      inkHex: '#050a18',
      includePines: true,
    });

    const farMat = new THREE.MeshBasicMaterial({ map: farTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const nearMat = new THREE.MeshBasicMaterial({ map: nearTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });

    const layers = [
      { x: 0, y: 12.5, z: -86, w: 120, h: 34, rotY: 0, mat: farMat },
      { x: -24, y: 7.5, z: -56, w: 42, h: 20, rotY: 0.24, mat: nearMat },
      { x: 24, y: 7.5, z: -56, w: 42, h: 20, rotY: -0.24, mat: nearMat },
    ];
    for (const l of layers) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(l.w, l.h), l.mat);
      m.position.set(l.x, l.y, l.z);
      m.rotation.y = l.rotY;
      this.group.add(m);
    }
  }

  private buildInkOutlinedPines(): void {
    const tier1 = new THREE.ConeGeometry(0.72, 1.8, 6);
    tier1.translate(0, 1.0, 0);
    const tier2 = new THREE.ConeGeometry(0.52, 1.4, 6);
    tier2.translate(0, 1.9, 0);

    const treeMat = new THREE.MeshToonMaterial({
      color: 0x0d2b38,
      emissive: 0x064e3b,
      emissiveIntensity: 0.18,
      gradientMap: this.toonGrad,
    });

    const count = 18;
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const g = new THREE.Group();
      const low = new THREE.Mesh(tier1, treeMat);
      const top = new THREE.Mesh(tier2, treeMat);
      addInkOutline(low, 0x040b18, 1.08);
      addInkOutline(top, 0x040b18, 1.08);
      g.add(low, top);
      g.position.set(side * this.rng.range(6.4, 14.5), -1.62, -6 - i * 3.6);
      g.scale.setScalar(this.rng.range(0.85, 1.55));
      this.group.add(g);
    }
  }

  private buildAuroraReflectingLake(): void {
    const geo = new THREE.PlaneGeometry(170, 150);
    this.mistLakeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.25 },
        uKick: { value: 0 },
        uBrightness: { value: 1.0 },
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
        uniform float uEnergy;
        uniform float uKick;
        uniform float uBrightness;
        varying vec3 vWorldPos;
        void main() {
          float ripple = sin(vWorldPos.z * 0.72 + uTime * 1.4) * cos(vWorldPos.x * 0.85 - uTime * 0.9);
          vec3 base = vec3(0.04, 0.1, 0.22);
          vec3 auroraRef = mix(vec3(0.08, 0.72, 0.58), vec3(0.18, 0.68, 0.94), 0.5 + 0.5 * ripple);
          float shimmer = step(0.32, ripple * 0.5 + 0.5);
          vec3 col = base + auroraRef * shimmer * (0.28 + uEnergy * 0.22 + uKick * 0.24);
          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
    });
    const lake = new THREE.Mesh(geo, this.mistLakeMat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(0, -1.65, -52);
    this.group.add(lake);
  }

  private buildAlpineStarlightAndSnow(): void {
    const pos = new Float32Array(this.snowCount * 3);
    const cols = new Float32Array(this.snowCount * 3);
    const c1 = new THREE.Color('#6ee7b7');
    const c2 = new THREE.Color('#a5f3fc');
    const c3 = new THREE.Color('#ffffff');

    for (let i = 0; i < this.snowCount; i++) {
      pos[i * 3] = this.rng.range(-32, 32);
      pos[i * 3 + 1] = this.rng.range(0.5, 24);
      pos[i * 3 + 2] = this.rng.range(-84, 6);
      const c = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    this.snowMat = new THREE.PointsMaterial({
      size: 0.36,
      map: createCrossStarTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.snowPoints = new THREE.Points(geo, this.snowMat);
    this.group.add(this.snowPoints);
  }

  public setPalette(_palette: SongPalette): void {
    // Mountain Landscape keeps its illustrated emerald aurora palette
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
      hihatPulse = 0,
      inSilence,
      reactiveEnabled,
      visualIntensity,
      particleIntensity,
      brightness,
    } = ctx;

    const visMult = visualIntensity === 'low' ? 0.45 : visualIntensity === 'medium' ? 0.75 : 1.0;
    const partMult = particleIntensity === 'low' ? 0.35 : particleIntensity === 'medium' ? 0.68 : 1.0;
    const bright = THREE.MathUtils.clamp(brightness, 0.5, 1.35);
    const silenceDamp = inSilence ? 0.35 : 1.0;

    const effBass = reactiveEnabled ? bass * visMult * silenceDamp : 0.16;
    const effHigh = reactiveEnabled ? high * visMult * silenceDamp : 0.14;
    const effEnergy = reactiveEnabled ? energy * visMult * silenceDamp : 0.18;
    const effKick = reactiveEnabled ? kickPulse * visMult * silenceDamp : 0;
    const effHihat = reactiveEnabled ? hihatPulse * visMult * silenceDamp : 0;

    this.skyMat.uniforms.uTime.value = elapsed;
    this.skyMat.uniforms.uEnergy.value = effEnergy;
    this.skyMat.uniforms.uBrightness.value = bright;

    for (const mat of this.auroraMats) {
      mat.uniforms.uTime.value = elapsed;
      mat.uniforms.uEnergy.value = effEnergy;
      mat.uniforms.uKick.value = effKick;
      mat.uniforms.uBrightness.value = bright;
    }

    this.mistLakeMat.uniforms.uTime.value = elapsed;
    this.mistLakeMat.uniforms.uEnergy.value = effEnergy;
    this.mistLakeMat.uniforms.uKick.value = effKick;
    this.mistLakeMat.uniforms.uBrightness.value = bright;

    const activeRatio = particleIntensity === 'low' ? 0.32 : particleIntensity === 'medium' ? 0.65 : 1.0;
    const activeCount = Math.floor(this.snowCount * activeRatio);
    this.snowPoints.geometry.setDrawRange(0, activeCount);
    this.snowMat.opacity = Math.min(0.92, (0.45 + effHigh * 0.25 + effHihat * 0.22) * partMult * bright);

    const pAttr = this.snowPoints.geometry.attributes.position as THREE.BufferAttribute;
    const fallSpeed = mode === 'paused' ? 0 : 1.2 + effEnergy * 1.6;
    const driftZ = mode === 'paused' ? 0 : 2.2 + effBass * 4.0;
    for (let i = 0; i < activeCount; i++) {
      let y = pAttr.getY(i) - fallSpeed * dt;
      let z = pAttr.getZ(i) + driftZ * dt;
      if (y < 0) y = 24;
      if (z > 8) z = -84;
      pAttr.setY(i, y);
      pAttr.setZ(i, z);
    }
    pAttr.needsUpdate = true;
  }

  public dispose(): void {
    this.toonGrad.dispose();
    disposeObjectTree(this.group);
  }
}
