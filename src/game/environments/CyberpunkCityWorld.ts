import * as THREE from 'three';
import type { QualityLevel, SongPalette } from '../../types/game';
import {
  addInkOutline,
  createCelToonGradientMap,
  createCrossStarTexture,
  createIllustratedEqualizerTexture,
  createIllustratedMoonTexture,
  createIllustratedSkylineLayerTexture,
} from './illustratedLayers';
import { SeededRng } from './seededRandom';
import { createCyberFacadeTexture, disposeObjectTree } from './sharedTextures';
import type { WorldAtmosphere, WorldBuildOptions, WorldInstance, WorldUpdateContext } from './types';

interface FlyingCraft {
  group: THREE.Group;
  trailMat: THREE.MeshBasicMaterial;
  laneX: number;
  baseY: number;
  z: number;
  speed: number;
  dir: number;
  phase: number;
}

const _tmpColA = new THREE.Color();
const _tmpColB = new THREE.Color();
const _tmpColAccent = new THREE.Color();
const _white = new THREE.Color(0xffffff);

export class CyberpunkCityWorld implements WorldInstance {
  public readonly theme = 'cyberpunk' as const;
  public readonly group = new THREE.Group();
  public readonly atmosphere: WorldAtmosphere = {
    backgroundColor: 0x0b0b28,
    fogColor: 0x15133d,
    fogDensity: 0.0085,
    hemiSkyColor: 0x818cf8,
    hemiGroundColor: 0x1e1b4b,
    dirLightColor: 0xe0f2fe,
  };

  private rng: SeededRng;
  private quality: QualityLevel;
  private toonGrad: THREE.DataTexture;

  private primaryColor = new THREE.Color('#22d3ee');
  private secondaryColor = new THREE.Color('#f43f8e');
  private accentColor = new THREE.Color('#fb923c');

  private skyMat!: THREE.ShaderMaterial;
  private moonSprite!: THREE.Sprite;
  private wetDeckMat!: THREE.ShaderMaterial;
  private buildingMats: THREE.MeshStandardMaterial[] = [];
  private crownMats: THREE.MeshBasicMaterial[] = [];
  private archMats: THREE.MeshBasicMaterial[] = [];
  private billboardMats: THREE.MeshBasicMaterial[] = [];

  // Horizon Energy Portal
  private portalGroup = new THREE.Group();
  private portalOuterRing!: THREE.Mesh;
  private portalInnerRing!: THREE.Mesh;
  private portalOuterMat!: THREE.MeshBasicMaterial;
  private portalInnerMat!: THREE.MeshBasicMaterial;
  private portalCoreMat!: THREE.ShaderMaterial;

  // Flying vehicles + trails
  private flyingCrafts: FlyingCraft[] = [];

  // Crisp starry sparkles
  private ambientParticles!: THREE.Points;
  private particleMat!: THREE.PointsMaterial;
  private particleCount = 220;

  constructor(opts: WorldBuildOptions) {
    this.rng = new SeededRng(`${opts.seed}:cyberpunk-illustrated`);
    this.quality = opts.graphicsQuality;
    this.toonGrad = createCelToonGradientMap();
    this.primaryColor.set(opts.palette.primary);
    this.secondaryColor.set(opts.palette.secondary);
    this.accentColor.set(opts.palette.accent);
    this.particleCount = this.quality === 'low' ? 90 : this.quality === 'medium' ? 150 : 220;

    this.buildIllustratedSkyAndMoon();
    this.buildWetUrbanFloor();
    this.buildIllustratedParallaxSkyline(opts.maxAnisotropy);
    this.buildOutlined3DSkyscrapers(opts.maxAnisotropy);
    this.buildLuminousGantryArches();
    this.buildHorizonEnergyPortal();
    this.buildEqualizerBillboards(opts.maxAnisotropy);
    this.buildFlyingTraffic();
    this.buildCrispNightStars();
  }

  private buildIllustratedSkyAndMoon(): void {
    const geo = new THREE.SphereGeometry(142, 32, 20);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.25 },
        uSubBass: { value: 0.2 },
        uBrightness: { value: 1.0 },
        uHorizonGlow: { value: this.primaryColor.clone() },
        uHorizonAccent: { value: this.secondaryColor.clone() },
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
        uniform float uSubBass;
        uniform float uBrightness;
        uniform vec3 uHorizonGlow;
        uniform vec3 uHorizonAccent;
        varying vec3 vDir;

        void main() {
          float y = clamp(vDir.y, -0.15, 1.0);
          vec3 zenith = vec3(0.03, 0.04, 0.16);
          vec3 midIndigo = vec3(0.11, 0.1, 0.34);
          vec3 horizonViolet = vec3(0.28, 0.14, 0.45);

          vec3 col = mix(horizonViolet, midIndigo, smoothstep(0.02, 0.32, y));
          col = mix(col, zenith, smoothstep(0.28, 0.72, y));

          float hBand = exp(-abs(vDir.y - 0.04) * 7.5);
          vec3 glowMix = mix(uHorizonGlow, uHorizonAccent, smoothstep(-0.6, 0.6, vDir.x));
          col += glowMix * hBand * (0.28 + uSubBass * 0.32 + uEnergy * 0.18);

          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.group.add(new THREE.Mesh(geo, this.skyMat));

    // Crisp illustrated full moon high center matching Reference 2
    const moonTex = createIllustratedMoonTexture('#f8fafc', '#cbd5e1', 'rgba(186,230,253,0.45)');
    const moonMat = new THREE.SpriteMaterial({
      map: moonTex,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      fog: false,
    });
    this.moonSprite = new THREE.Sprite(moonMat);
    this.moonSprite.position.set(0, 32, -96);
    this.moonSprite.scale.set(22, 22, 1);
    this.group.add(this.moonSprite);
  }

  private buildWetUrbanFloor(): void {
    const geo = new THREE.PlaneGeometry(185, 185);
    this.wetDeckMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.25 },
        uKick: { value: 0 },
        uBrightness: { value: 1.0 },
        uScroll: { value: 0 },
        uReflectA: { value: this.primaryColor.clone() },
        uReflectB: { value: this.secondaryColor.clone() },
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
        uniform float uScroll;
        uniform vec3 uReflectA;
        uniform vec3 uReflectB;
        varying vec3 vWorldPos;

        void main() {
          float distFade = exp(-abs(vWorldPos.z + 20.0) * 0.011);
          float laneLine = smoothstep(0.96, 1.0, abs(sin(vWorldPos.x * 0.52)));
          float pulseWave = smoothstep(0.86, 1.0, sin(vWorldPos.z * 0.28 + uScroll * 6.2831));
          vec3 base = vec3(0.055, 0.045, 0.16);
          vec3 glow = mix(uReflectA, uReflectB, smoothstep(-28.0, 28.0, vWorldPos.x));
          vec3 col = base + glow * (laneLine * 0.16 + pulseWave * (0.08 + uKick * 0.18)) * (0.7 + uEnergy * 0.35) * distFade;
          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
    });
    const floor = new THREE.Mesh(geo, this.wetDeckMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1.68, -56);
    this.group.add(floor);
  }

  private buildIllustratedParallaxSkyline(anisotropy: number): void {
    const texA = createIllustratedSkylineLayerTexture(this.rng, anisotropy, {
      bodyTop: '#241a5e',
      bodyBottom: '#130c36',
      inkColor: '#09071a',
      rimColors: ['#f472b6', '#22d3ee', '#fbbf24'],
      windowColors: ['#38bdf8', '#f472b6', '#fde047'],
      includeSpires: true,
    });
    const texB = createIllustratedSkylineLayerTexture(this.rng, anisotropy, {
      bodyTop: '#1d154a',
      bodyBottom: '#0f0a2b',
      inkColor: '#070515',
      rimColors: ['#22d3ee', '#a855f7', '#fb923c'],
      windowColors: ['#22d3ee', '#fb7185', '#c084fc'],
      includeSpires: false,
    });

    const matA = new THREE.MeshBasicMaterial({
      map: texA,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const matB = new THREE.MeshBasicMaterial({
      map: texB,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const walls = [
      { x: -24, y: 12.5, z: -64, w: 36, h: 28, rotY: 0.28, mat: matA },
      { x: 24, y: 12.5, z: -64, w: 36, h: 28, rotY: -0.28, mat: matB },
      { x: -34, y: 14, z: -84, w: 46, h: 34, rotY: 0.08, mat: matB },
      { x: 34, y: 14, z: -84, w: 46, h: 34, rotY: -0.08, mat: matA },
    ];
    for (const w of walls) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.h), w.mat);
      m.position.set(w.x, w.y, w.z);
      m.rotation.y = w.rotY;
      this.group.add(m);
    }
  }

  private buildOutlined3DSkyscrapers(maxAnisotropy: number): void {
    const facadeColors = ['#38bdf8', '#e879f9', '#fb923c'];
    for (let i = 0; i < 3; i++) {
      const f = createCyberFacadeTexture(this.rng, maxAnisotropy, false);
      this.buildingMats.push(
        new THREE.MeshStandardMaterial({
          map: f.albedo,
          emissiveMap: f.emissive,
          emissive: new THREE.Color(facadeColors[i]),
          emissiveIntensity: 0.72,
          roughness: 0.45,
          metalness: 0.35,
        }),
      );
    }

    const crownCols = [0x22d3ee, 0xf43f8e, 0xfbbf24, 0xa855f7];
    crownCols.forEach((hex) => {
      this.crownMats.push(new THREE.MeshBasicMaterial({ color: hex }));
    });

    const count = this.quality === 'low' ? 12 : this.quality === 'medium' ? 18 : 24;
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const tier = i % 2;
      const z = -9 - i * 3.0 + this.rng.range(-0.6, 0.6);
      const x = side * (11.5 + tier * 5.2 + this.rng.range(-0.8, 1.4));
      const w = this.rng.range(3.2, 5.2);
      const d = this.rng.range(3.2, 5.0);
      const h = this.rng.range(16, 30) + tier * 4.5;

      const tower = new THREE.Group();
      tower.position.set(x, -1.68, z);

      const facadeMat = this.buildingMats[i % this.buildingMats.length];
      const crownMat = this.crownMats[i % this.crownMats.length];

      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), facadeMat);
      body.position.y = h * 0.5;
      addInkOutline(body, 0x070515, 1.04);

      const roofRim = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.28, d * 1.04), crownMat);
      roofRim.position.y = h + 0.14;

      tower.add(body, roofRim);

      if (i % 3 === 0) {
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 4.5, 6), crownMat);
        spire.position.y = h + 2.4;
        tower.add(spire);
      }

      this.group.add(tower);
    }
  }

  private buildLuminousGantryArches(): void {
    const darkFrameMat = new THREE.MeshToonMaterial({
      color: 0x141236,
      gradientMap: this.toonGrad,
    });

    const archCount = this.quality === 'low' ? 4 : 6;
    const pillarGeo = new THREE.BoxGeometry(0.28, 8.2, 0.36);
    const beamGeo = new THREE.BoxGeometry(12.2, 0.28, 0.34);

    for (let i = 0; i < archCount; i++) {
      const z = -11 - i * 10.2;
      const col = i % 2 === 0 ? this.primaryColor : this.accentColor;
      const mat = new THREE.MeshBasicMaterial({ color: col });
      this.archMats.push(mat);

      const g = new THREE.Group();
      g.position.set(0, 0, z);

      const leftPillar = new THREE.Mesh(pillarGeo, darkFrameMat);
      leftPillar.position.set(-5.8, 3.6, 0);
      leftPillar.rotation.z = -0.09;
      addInkOutline(leftPillar, 0x060412, 1.08);

      const rightPillar = new THREE.Mesh(pillarGeo, darkFrameMat);
      rightPillar.position.set(5.8, 3.6, 0);
      rightPillar.rotation.z = 0.09;
      addInkOutline(rightPillar, 0x060412, 1.08);

      const leftStrip = new THREE.Mesh(new THREE.BoxGeometry(0.11, 7.8, 0.4), mat);
      leftStrip.position.set(-5.62, 3.6, 0);
      leftStrip.rotation.z = -0.09;

      const rightStrip = new THREE.Mesh(new THREE.BoxGeometry(0.11, 7.8, 0.4), mat);
      rightStrip.position.set(5.62, 3.6, 0);
      rightStrip.rotation.z = 0.09;

      const topBeam = new THREE.Mesh(beamGeo, darkFrameMat);
      topBeam.position.set(0, 7.65, 0);
      addInkOutline(topBeam, 0x060412, 1.06);

      const topStrip = new THREE.Mesh(new THREE.BoxGeometry(11.3, 0.14, 0.4), mat);
      topStrip.position.set(0, 7.46, 0);

      g.add(leftPillar, rightPillar, leftStrip, rightStrip, topBeam, topStrip);
      this.group.add(g);
    }
  }

  private buildHorizonEnergyPortal(): void {
    this.portalGroup.position.set(0, 7.4, -74);

    this.portalOuterMat = new THREE.MeshBasicMaterial({ color: this.primaryColor });
    this.portalInnerMat = new THREE.MeshBasicMaterial({ color: this.secondaryColor });

    this.portalOuterRing = new THREE.Mesh(new THREE.TorusGeometry(9.6, 0.28, 12, 48), this.portalOuterMat);
    this.portalInnerRing = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.2, 10, 36), this.portalInnerMat);

    this.portalCoreMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uKick: { value: 0 },
        uEnergy: { value: 0.25 },
        uBrightness: { value: 1.0 },
        uColorA: { value: this.primaryColor.clone() },
        uColorB: { value: this.secondaryColor.clone() },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uKick;
        uniform float uEnergy;
        uniform float uBrightness;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          float ring1 = smoothstep(0.06, 0.0, abs(r - (0.65 + 0.04 * sin(uTime * 2.2))));
          float ring2 = smoothstep(0.05, 0.0, abs(r - 0.4));
          float core = exp(-r * 2.4);
          float mask = smoothstep(0.95, 0.1, r);
          vec3 col = mix(uColorA, uColorB, clamp(r, 0.0, 1.0));
          col = mix(col, vec3(1.0), core * 0.72);
          float alpha = clamp((core * 0.65 + ring1 * 0.45 + ring2 * 0.35 + uKick * 0.22) * mask * (0.72 + uEnergy * 0.3), 0.0, 0.85);
          gl_FragColor = vec4(col * uBrightness, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const coreDisc = new THREE.Mesh(new THREE.CircleGeometry(7.2, 40), this.portalCoreMat);
    this.portalGroup.add(this.portalOuterRing, this.portalInnerRing, coreDisc);
    this.group.add(this.portalGroup);
  }

  private buildEqualizerBillboards(maxAnisotropy: number): void {
    const boardCount = this.quality === 'low' ? 4 : 8;
    for (let i = 0; i < boardCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const tex = createIllustratedEqualizerTexture(
        i % 2 === 0 ? '#f43f8e' : '#22d3ee',
        i % 2 === 0 ? '#fbbf24' : '#a855f7',
        '#09071a',
        maxAnisotropy,
      );
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.94,
        side: THREE.DoubleSide,
      });
      this.billboardMats.push(mat);

      const board = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.0), mat);
      board.position.set(side * (7.8 + (i % 2) * 1.4), 3.6 + (i % 3) * 2.1, -13 - i * 7.8);
      board.rotation.y = -side * 0.95;
      this.group.add(board);
    }
  }

  private buildFlyingTraffic(): void {
    const hullGeo = new THREE.ConeGeometry(0.18, 0.95, 5);
    hullGeo.rotateX(Math.PI / 2);
    const wingGeo = new THREE.BoxGeometry(0.95, 0.04, 0.34);
    const trailGeo = new THREE.ConeGeometry(0.1, 2.1, 6);
    trailGeo.rotateX(-Math.PI / 2);

    const hullMat = new THREE.MeshToonMaterial({ color: 0x16143a, gradientMap: this.toonGrad });
    const thrusterColors = [0x22d3ee, 0xf97316, 0xf43f8e];
    const craftCount = this.quality === 'low' ? 5 : 10;

    for (let i = 0; i < craftCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const g = new THREE.Group();
      const hull = new THREE.Mesh(hullGeo, hullMat);
      addInkOutline(hull, 0x060412, 1.12);
      const wings = new THREE.Mesh(wingGeo, hullMat);
      wings.position.z = -0.12;

      const tHex = thrusterColors[i % thrusterColors.length];
      const trailMat = new THREE.MeshBasicMaterial({
        color: tHex,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const trailL = new THREE.Mesh(trailGeo, trailMat);
      trailL.position.set(-0.22, 0, -1.45);
      const trailR = new THREE.Mesh(trailGeo, trailMat);
      trailR.position.set(0.22, 0, -1.45);

      g.add(hull, wings, trailL, trailR);
      const dir = i % 3 === 0 ? 1 : -1;
      g.rotation.y = dir > 0 ? 0 : Math.PI;

      const laneX = side * this.rng.range(6.6, 16.5);
      const baseY = this.rng.range(2.6, 12.0);
      const z = this.rng.range(-82, -8);
      g.position.set(laneX, baseY, z);
      this.group.add(g);

      this.flyingCrafts.push({
        group: g,
        trailMat,
        laneX,
        baseY,
        z,
        speed: this.rng.range(12, 22),
        dir,
        phase: this.rng.range(0, Math.PI * 2),
      });
    }
  }

  private buildCrispNightStars(): void {
    const pos = new Float32Array(this.particleCount * 3);
    const cols = new Float32Array(this.particleCount * 3);
    const c1 = new THREE.Color('#ffffff');
    const c2 = new THREE.Color('#22d3ee');
    const c3 = new THREE.Color('#f472b6');

    for (let i = 0; i < this.particleCount; i++) {
      pos[i * 3] = this.rng.range(-36, 36);
      pos[i * 3 + 1] = this.rng.range(3, 30);
      pos[i * 3 + 2] = this.rng.range(-90, 6);
      const c = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    this.particleMat = new THREE.PointsMaterial({
      size: 0.4,
      map: createCrossStarTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ambientParticles = new THREE.Points(geo, this.particleMat);
    this.group.add(this.ambientParticles);
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
      bass,
      mid,
      energy,
      subBass = bass * 0.8,
      highMid = mid,
      treble = mid,
      kickPulse = 0,
      snarePulse = 0,
      hihatPulse = 0,
      menuAmbientEffects = true,
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

    const effSub = reactiveEnabled ? subBass * visMult * silenceDamp : 0.14;
    const effBass = reactiveEnabled ? bass * visMult * silenceDamp : 0.16;
    const effMid = reactiveEnabled ? mid * visMult * silenceDamp : 0.14;
    const effHighMid = reactiveEnabled ? highMid * visMult * silenceDamp : 0.12;
    const effTreble = reactiveEnabled ? treble * visMult * silenceDamp : 0.1;
    const effEnergy = reactiveEnabled ? energy * visMult * silenceDamp : 0.15;
    const effKick = reactiveEnabled ? kickPulse * visMult * silenceDamp : 0;
    const effSnare = reactiveEnabled ? snarePulse * visMult * silenceDamp : 0;
    const effHihat = reactiveEnabled ? hihatPulse * visMult * silenceDamp : 0;

    _tmpColA.copy(chromaticA ?? this.primaryColor);
    _tmpColB.copy(chromaticB ?? this.secondaryColor);
    _tmpColAccent.copy(chromaticAccent ?? this.accentColor);

    this.skyMat.uniforms.uTime.value = elapsed;
    this.skyMat.uniforms.uEnergy.value = effEnergy;
    this.skyMat.uniforms.uSubBass.value = effSub;
    this.skyMat.uniforms.uBrightness.value = bright;
    this.skyMat.uniforms.uHorizonGlow.value.copy(_tmpColA);
    this.skyMat.uniforms.uHorizonAccent.value.copy(_tmpColB);

    this.wetDeckMat.uniforms.uTime.value = elapsed;
    this.wetDeckMat.uniforms.uEnergy.value = effEnergy;
    this.wetDeckMat.uniforms.uKick.value = effKick;
    this.wetDeckMat.uniforms.uBrightness.value = bright;
    this.wetDeckMat.uniforms.uScroll.value =
      mode === 'playing' ? (elapsed * 0.45) % 1 : (elapsed * 0.14) % 1;
    this.wetDeckMat.uniforms.uReflectA.value.copy(_tmpColA);
    this.wetDeckMat.uniforms.uReflectB.value.copy(_tmpColB);

    // Building windows subtly respond to Mid/HighMid
    this.buildingMats.forEach((m, idx) => {
      const band = idx === 0 ? effBass : idx === 1 ? effMid : effHighMid;
      m.emissiveIntensity = Math.min(1.15, (0.58 + band * 0.42) * bright);
    });

    // Gantry arches pulse crisply along the corridor on Kick / Snare
    this.archMats.forEach((m, idx) => {
      const baseCol = idx % 2 === 0 ? _tmpColA : _tmpColAccent;
      m.color.copy(baseCol).lerp(_white, effKick * 0.28 + effSnare * 0.22);
    });

    // Horizon Portal responds to Kick + SubBass
    const portalScale = 1 + effKick * 0.065;
    this.portalGroup.scale.setScalar(portalScale);
    this.portalOuterRing.rotation.z = elapsed * (0.14 + effMid * 0.15);
    this.portalInnerRing.rotation.z = -elapsed * (0.2 + effBass * 0.2);
    this.portalOuterMat.color.copy(_tmpColA);
    this.portalInnerMat.color.copy(_tmpColB);
    this.portalCoreMat.uniforms.uTime.value = elapsed;
    this.portalCoreMat.uniforms.uKick.value = effKick;
    this.portalCoreMat.uniforms.uEnergy.value = effEnergy;
    this.portalCoreMat.uniforms.uBrightness.value = bright;
    this.portalCoreMat.uniforms.uColorA.value.copy(_tmpColA);
    this.portalCoreMat.uniforms.uColorB.value.copy(_tmpColB);

    // Billboards & Traffic
    const speedFactor = mode === 'paused' ? 0 : 1 + effEnergy * 0.85;
    for (const c of this.flyingCrafts) {
      c.group.visible = menuAmbientEffects || mode === 'playing';
      if (!c.group.visible) continue;
      c.z += c.dir * c.speed * speedFactor * dt;
      if (c.z > 10) c.z = -88;
      if (c.z < -88) c.z = 10;
      c.group.position.set(
        c.laneX + Math.sin(elapsed * 0.9 + c.phase) * 0.45,
        c.baseY + Math.cos(elapsed * 1.3 + c.phase) * 0.28,
        c.z,
      );
      c.trailMat.opacity = Math.min(0.82, (0.36 + effSnare * 0.35 + effHighMid * 0.2) * bright);
    }

    // Crisp stars & hi-hat glints
    this.ambientParticles.visible = menuAmbientEffects || mode === 'playing';
    if (this.ambientParticles.visible) {
      const activeRatio =
        particleIntensity === 'low' ? 0.34 : particleIntensity === 'medium' ? 0.68 : 1.0;
      const activeCount = Math.floor(this.particleCount * activeRatio);
      this.ambientParticles.geometry.setDrawRange(0, activeCount);
      this.particleMat.opacity = Math.min(0.92, (0.45 + effTreble * 0.2 + effHihat * 0.25) * partMult * bright);

      const pAttr = this.ambientParticles.geometry.attributes.position as THREE.BufferAttribute;
      const pSpeed = mode === 'playing' ? (7.5 + effBass * 10) * silenceDamp : 2.2;
      for (let i = 0; i < activeCount; i++) {
        let z = pAttr.getZ(i) + pSpeed * dt;
        if (z > 8) z = -90;
        pAttr.setZ(i, z);
      }
      pAttr.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.toonGrad.dispose();
    disposeObjectTree(this.group);
  }
}
