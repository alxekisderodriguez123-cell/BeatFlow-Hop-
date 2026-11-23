import * as THREE from 'three';
import type { QualityLevel, SongPalette } from '../../types/game';
import { SeededRng } from './seededRandom';
import {
  createCloudPuffTexture,
  createCyberBillboardTexture,
  createCyberFacadeTexture,
  createSoftGlowTexture,
  disposeObjectTree,
} from './sharedTextures';
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

interface FloatingShard {
  basePos: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  bobSpeed: number;
  bobAmp: number;
  phase: number;
  scale: number;
}

const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _tmpColA = new THREE.Color();
const _tmpColB = new THREE.Color();
const _tmpColAccent = new THREE.Color();

export class CyberpunkCityWorld implements WorldInstance {
  public readonly theme = 'cyberpunk' as const;
  public readonly group = new THREE.Group();
  public readonly atmosphere: WorldAtmosphere = {
    backgroundColor: 0x050819,
    fogColor: 0x090e2b,
    fogDensity: 0.0112,
    hemiSkyColor: 0x67e8f9,
    hemiGroundColor: 0x1e1b4b,
    dirLightColor: 0xe0f2fe,
  };

  private rng: SeededRng;
  private quality: QualityLevel;
  private primaryColor = new THREE.Color('#22d3ee');
  private secondaryColor = new THREE.Color('#f43f8e');
  private accentColor = new THREE.Color('#f97316');

  private skyMat!: THREE.ShaderMaterial;
  private wetDeckMat!: THREE.ShaderMaterial;
  private trafficStreaksMat!: THREE.ShaderMaterial;
  private buildingMats: THREE.MeshStandardMaterial[] = [];
  private crownMats: THREE.MeshStandardMaterial[] = [];
  private bridgeMats: THREE.MeshStandardMaterial[] = [];
  private archMats: THREE.MeshStandardMaterial[] = [];
  private billboardMats: THREE.MeshBasicMaterial[] = [];
  private holoMats: THREE.ShaderMaterial[] = [];
  private holoMeshes: THREE.Mesh[] = [];

  // Horizon Energy Portal
  private portalGroup = new THREE.Group();
  private portalOuterRing!: THREE.Mesh;
  private portalInnerRing!: THREE.Mesh;
  private portalOuterMat!: THREE.MeshStandardMaterial;
  private portalInnerMat!: THREE.MeshStandardMaterial;
  private portalCoreMat!: THREE.ShaderMaterial;

  // Flying vehicles + trails
  private flyingCrafts: FlyingCraft[] = [];

  // Floating geometric tech shards
  private shardInstancedMesh: THREE.InstancedMesh | null = null;
  private shardMat: THREE.MeshStandardMaterial | null = null;
  private shards: FloatingShard[] = [];

  // Ambient suspended particles
  private ambientParticles!: THREE.Points;
  private particleMat!: THREE.PointsMaterial;
  private particleCount = 260;

  constructor(opts: WorldBuildOptions) {
    this.rng = new SeededRng(`${opts.seed}:cyberpunk-remaster`);
    this.quality = opts.graphicsQuality;
    this.primaryColor.set(opts.palette.primary);
    this.secondaryColor.set(opts.palette.secondary);
    this.accentColor.set(opts.palette.accent);

    this.particleCount = this.quality === 'low' ? 90 : this.quality === 'medium' ? 170 : 260;

    this.buildSkyDome();
    this.buildWetUrbanUnderdeck();
    this.buildSideViaducts();
    this.buildSculptedSkyline(opts.maxAnisotropy);
    this.buildSkyBridgesAndGantries();
    this.buildHorizonEnergyPortal();
    this.buildHolographicSignsAndBillboards(opts.maxAnisotropy);
    this.buildFlyingTraffic();
    this.buildFloatingTechShards();
    this.buildUrbanParticles();
  }

  private buildSkyDome(): void {
    const geo = new THREE.SphereGeometry(142, 32, 20);
    const hueShift = this.rng.range(-0.03, 0.03);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.2 },
        uSubBass: { value: 0.15 },
        uBrightness: { value: 1.0 },
        uColorA: { value: new THREE.Color('#071130').offsetHSL(hueShift, 0, 0) },
        uColorB: { value: new THREE.Color('#210e3d').offsetHSL(hueShift, 0, 0) },
        uHorizonGlow: { value: new THREE.Color('#0ea5e9') },
        uHorizonAccent: { value: new THREE.Color('#e879f9') },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uEnergy;
        uniform float uSubBass;
        uniform float uBrightness;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uHorizonGlow;
        uniform vec3 uHorizonAccent;
        varying vec3 vWorldDir;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        void main() {
          float h = clamp(vWorldDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 sky = mix(vec3(0.024, 0.042, 0.12), uColorA, smoothstep(0.45, 0.88, h));
          sky = mix(sky, uColorB, smoothstep(0.38, 0.62, h) * 0.72);

          // Volumetric neon horizon mist & cyan-magenta split
          float horizonBand = exp(-abs(vWorldDir.y - 0.03) * 8.5);
          vec3 hGlow = mix(uHorizonGlow, uHorizonAccent, smoothstep(-0.65, 0.65, vWorldDir.x));
          sky += hGlow * horizonBand * (0.42 + uSubBass * 0.45 + uEnergy * 0.22);

          // Subtle upper cyber aurora wisps & stars
          vec2 cloudUv = vec2(vWorldDir.x * 2.4 + uTime * 0.01, vWorldDir.y * 5.2);
          float c = noise(cloudUv * 2.2) * 0.6 + noise(cloudUv * 4.8 - uTime * 0.012) * 0.4;
          float cloudMask = smoothstep(0.5, 0.8, c) * smoothstep(0.04, 0.28, vWorldDir.y) * smoothstep(0.7, 0.2, vWorldDir.y);
          sky = mix(sky, vec3(0.12, 0.2, 0.4) + hGlow * 0.28, cloudMask * 0.48);

          float starVal = hash(floor(vWorldDir.xz * 260.0 + vWorldDir.y * 220.0));
          float stars = step(0.9965, starVal) * smoothstep(0.18, 0.48, vWorldDir.y);
          sky += vec3(0.75, 0.9, 1.0) * stars * 0.55;

          gl_FragColor = vec4(sky * uBrightness, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.group.add(new THREE.Mesh(geo, this.skyMat));
  }

  private buildWetUrbanUnderdeck(): void {
    const geo = new THREE.PlaneGeometry(180, 190);
    this.wetDeckMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.2 },
        uSubBass: { value: 0.15 },
        uBrightness: { value: 1.0 },
        uScroll: { value: 0 },
        uReflectA: { value: this.primaryColor.clone() },
        uReflectB: { value: this.secondaryColor.clone() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uEnergy;
        uniform float uSubBass;
        uniform float uBrightness;
        uniform float uScroll;
        uniform vec3 uReflectA;
        uniform vec3 uReflectB;
        varying vec2 vUv;
        varying vec3 vWorldPos;

        void main() {
          float distFade = exp(-abs(vWorldPos.z + 20.0) * 0.013);
          float laneGrid = smoothstep(0.95, 1.0, abs(sin(vWorldPos.x * 0.54)));
          float roadBands = smoothstep(0.88, 1.0, sin(vWorldPos.z * 0.34 + uScroll * 6.2831));
          float puddleRipple = 0.5 + 0.5 * sin(vWorldPos.z * 0.9 + vWorldPos.x * 1.5 + uTime * 2.0);

          vec3 base = vec3(0.016, 0.025, 0.068);
          vec3 glow = mix(uReflectA, uReflectB, smoothstep(-32.0, 32.0, vWorldPos.x));
          float pulse = 0.6 + uSubBass * 0.45 + uEnergy * 0.35;
          vec3 col = base + glow * (laneGrid * 0.15 + roadBands * 0.085 + puddleRipple * 0.055) * pulse * distFade;
          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
    });
    const floor = new THREE.Mesh(geo, this.wetDeckMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1.72, -55);
    this.group.add(floor);
  }

  private buildSideViaducts(): void {
    const viaductGeo = new THREE.PlaneGeometry(3.4, 145);
    this.trafficStreaksMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.2 },
        uBrightness: { value: 1.0 },
        uStreakColor: { value: new THREE.Color('#fb923c') },
        uAltColor: { value: new THREE.Color('#f43f8e') },
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
        uniform float uEnergy;
        uniform float uBrightness;
        uniform vec3 uStreakColor;
        uniform vec3 uAltColor;
        varying vec2 vUv;

        void main() {
          float lane1 = smoothstep(0.14, 0.025, abs(vUv.x - 0.26));
          float lane2 = smoothstep(0.14, 0.025, abs(vUv.x - 0.74));
          float dash1 = smoothstep(0.45, 0.96, sin(vUv.y * 44.0 - uTime * 8.0));
          float dash2 = smoothstep(0.45, 0.96, sin(vUv.y * 38.0 + uTime * 6.5));
          float edgeLine = smoothstep(0.045, 0.0, abs(vUv.x - 0.04)) + smoothstep(0.045, 0.0, abs(vUv.x - 0.96));

          vec3 col = vec3(0.028, 0.042, 0.105);
          col += uStreakColor * lane1 * dash1 * (0.72 + uEnergy * 0.45);
          col += uAltColor * lane2 * dash2 * (0.68 + uEnergy * 0.45);
          col += vec3(0.22, 0.78, 0.98) * edgeLine * 0.26;
          gl_FragColor = vec4(col * uBrightness, 0.92);
        }
      `,
      transparent: true,
    });

    [-6.3, 6.3].forEach((x) => {
      const road = new THREE.Mesh(viaductGeo, this.trafficStreaksMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, -1.25, -52);
      this.group.add(road);
    });
  }

  private buildSculptedSkyline(maxAnisotropy: number): void {
    const facadeColors = ['#38bdf8', '#e879f9', '#fb923c', '#22d3ee'];
    for (let i = 0; i < 4; i++) {
      const f = createCyberFacadeTexture(this.rng, maxAnisotropy, false);
      const mat = new THREE.MeshStandardMaterial({
        map: f.albedo,
        emissiveMap: f.emissive,
        emissive: new THREE.Color(facadeColors[i]),
        emissiveIntensity: 0.7,
        roughness: 0.34,
        metalness: 0.72,
        envMapIntensity: 0.45,
      });
      this.buildingMats.push(mat);
    }

    const darkTrimMat = new THREE.MeshStandardMaterial({
      color: 0x070d21,
      metalness: 0.88,
      roughness: 0.26,
    });

    const crownCols = [0x22d3ee, 0xf43f8e, 0xf97316, 0x818cf8];
    crownCols.forEach((hex) => {
      this.crownMats.push(
        new THREE.MeshStandardMaterial({
          color: hex,
          emissive: hex,
          emissiveIntensity: 0.78,
          roughness: 0.22,
          metalness: 0.5,
        }),
      );
    });

    const count = this.quality === 'low' ? 22 : this.quality === 'medium' ? 32 : 42;
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const tier = i % 3;
      const z = -7 - i * 2.45 + this.rng.range(-0.8, 0.8);
      const x = side * (9.5 + tier * 5.4 + this.rng.range(-1.2, 2.1));
      const baseW = this.rng.range(2.6, 4.8);
      const baseD = this.rng.range(2.6, 4.8);
      const totalH = this.rng.range(14, 34) + tier * 5.2;

      const towerGroup = new THREE.Group();
      towerGroup.position.set(x, -1.72, z);

      const facadeMat = this.buildingMats[i % this.buildingMats.length];
      const crownMat = this.crownMats[i % this.crownMats.length];

      // Podium base
      const podiumH = totalH * 0.22;
      const podium = new THREE.Mesh(
        new THREE.BoxGeometry(baseW * 1.18, podiumH, baseD * 1.18),
        darkTrimMat,
      );
      podium.position.y = podiumH * 0.5;
      towerGroup.add(podium);

      const style = i % 6;
      if (style === 0) {
        // Dual-setback cyber monolith + glowing collar + spire
        const h1 = totalH * 0.52;
        const m1 = new THREE.Mesh(new THREE.BoxGeometry(baseW, h1, baseD), facadeMat);
        m1.position.y = podiumH + h1 * 0.5;
        const h2 = totalH * 0.26;
        const m2 = new THREE.Mesh(new THREE.BoxGeometry(baseW * 0.72, h2, baseD * 0.72), facadeMat);
        m2.position.y = podiumH + h1 + h2 * 0.5;
        const collar = new THREE.Mesh(new THREE.BoxGeometry(baseW * 0.78, 0.34, baseD * 0.78), crownMat);
        collar.position.y = podiumH + h1 + h2;
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, totalH * 0.18, 6), crownMat);
        mast.position.y = podiumH + h1 + h2 + totalH * 0.09;
        towerGroup.add(m1, m2, collar, mast);
      } else if (style === 1) {
        // Tapered hexagonal spire + glowing orbital collar
        const shaftH = totalH * 0.68;
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(baseW * 0.4, baseW * 0.62, shaftH, 6),
          facadeMat,
        );
        shaft.position.y = podiumH + shaftH * 0.5;
        const crownRing = new THREE.Mesh(
          new THREE.TorusGeometry(baseW * 0.46, 0.13, 8, 6),
          crownMat,
        );
        crownRing.rotation.x = Math.PI / 2;
        crownRing.position.y = podiumH + shaftH + 0.14;
        const spire = new THREE.Mesh(
          new THREE.ConeGeometry(baseW * 0.22, totalH * 0.24, 6),
          darkTrimMat,
        );
        spire.position.y = podiumH + shaftH + totalH * 0.12;
        towerGroup.add(shaft, crownRing, spire);
      } else if (style === 2) {
        // Sloped beveled wedge tower
        const wShape = new THREE.Shape();
        const hw = baseW * 0.5;
        const sh = totalH * 0.78;
        wShape.moveTo(-hw, 0);
        wShape.lineTo(hw, 0);
        wShape.lineTo(hw * 0.86, sh);
        wShape.lineTo(-hw * 0.68, sh * 0.8);
        wShape.closePath();
        const extrudeGeo = new THREE.ExtrudeGeometry(wShape, {
          depth: baseD * 0.86,
          bevelEnabled: true,
          bevelThickness: 0.12,
          bevelSize: 0.1,
          bevelSegments: 1,
        });
        extrudeGeo.center();
        const wedge = new THREE.Mesh(extrudeGeo, facadeMat);
        wedge.position.y = podiumH + sh * 0.5;
        const roofStrip = new THREE.Mesh(
          new THREE.BoxGeometry(baseW * 0.82, 0.2, 0.24),
          crownMat,
        );
        roofStrip.position.set(0, podiumH + sh * 0.9, baseD * 0.44);
        roofStrip.rotation.z = 0.2;
        towerGroup.add(wedge, roofStrip);
      } else if (style === 3) {
        // Twin-column recessed atrium tower with dual vertical neon fins
        const colW = baseW * 0.38;
        const mainH = totalH * 0.74;
        const leftCol = new THREE.Mesh(new THREE.BoxGeometry(colW, mainH, baseD), facadeMat);
        leftCol.position.set(-baseW * 0.28, podiumH + mainH * 0.5, 0);
        const rightCol = new THREE.Mesh(new THREE.BoxGeometry(colW, mainH * 0.92, baseD), facadeMat);
        rightCol.position.set(baseW * 0.28, podiumH + mainH * 0.46, 0);
        const coreSpine = new THREE.Mesh(new THREE.BoxGeometry(0.18, mainH * 0.88, baseD * 0.6), crownMat);
        coreSpine.position.set(0, podiumH + mainH * 0.48, 0);
        const topBridge = new THREE.Mesh(new THREE.BoxGeometry(baseW * 0.96, 0.5, baseD * 0.7), darkTrimMat);
        topBridge.position.set(0, podiumH + mainH * 0.82, 0);
        towerGroup.add(leftCol, rightCol, coreSpine, topBridge);
      } else if (style === 4) {
        // Terraced neon plaza skyscraper with mid-tower glowing balcony ring
        const h1 = totalH * 0.44;
        const lower = new THREE.Mesh(new THREE.BoxGeometry(baseW * 1.05, h1, baseD * 1.05), facadeMat);
        lower.position.y = podiumH + h1 * 0.5;
        const midBand = new THREE.Mesh(new THREE.BoxGeometry(baseW * 1.14, 0.28, baseD * 1.14), crownMat);
        midBand.position.y = podiumH + h1 + 0.14;
        const h2 = totalH * 0.38;
        const upper = new THREE.Mesh(new THREE.BoxGeometry(baseW * 0.66, h2, baseD * 0.66), facadeMat);
        upper.position.y = podiumH + h1 + 0.28 + h2 * 0.5;
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), crownMat);
        beacon.position.y = podiumH + h1 + 0.28 + h2 + 0.3;
        towerGroup.add(lower, midBand, upper, beacon);
      } else {
        // Cantilevered overhang tower
        const h1 = totalH * 0.5;
        const h2 = totalH * 0.3;
        const lower = new THREE.Mesh(new THREE.BoxGeometry(baseW * 0.78, h1, baseD * 0.8), facadeMat);
        lower.position.y = podiumH + h1 * 0.5;
        const upper = new THREE.Mesh(new THREE.BoxGeometry(baseW * 1.08, h2, baseD * 0.96), facadeMat);
        upper.position.set(-side * 0.45, podiumH + h1 + h2 * 0.5, 0);
        const rim = new THREE.Mesh(new THREE.BoxGeometry(baseW * 1.12, 0.22, baseD), crownMat);
        rim.position.set(-side * 0.45, podiumH + h1, 0);
        towerGroup.add(lower, upper, rim);
      }

      this.group.add(towerGroup);
    }

    // Distant volumetric city haze curtain
    const cloudTex = createCloudPuffTexture('#1e3a8a');
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.SpriteMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(this.rng.range(-52, 52), this.rng.range(4, 16), -90 - i * 4);
      sp.scale.set(this.rng.range(30, 48), this.rng.range(11, 18), 1);
      this.group.add(sp);
    }
  }

  private buildSkyBridgesAndGantries(): void {
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x091026,
      metalness: 0.88,
      roughness: 0.25,
    });

    // 1. Elevated Cyber Sky-Bridges spanning high over the corridor between skyscrapers
    const bridgeCount = this.quality === 'low' ? 3 : 5;
    for (let i = 0; i < bridgeCount; i++) {
      const z = -22 - i * 13.5;
      const y = 10.5 + (i % 3) * 2.6;
      const span = 26 + (i % 2) * 6;
      const colHex = i % 2 === 0 ? 0x22d3ee : 0xf43f8e;
      const stripMat = new THREE.MeshStandardMaterial({
        color: colHex,
        emissive: colHex,
        emissiveIntensity: 0.72,
        roughness: 0.25,
        metalness: 0.4,
      });
      this.bridgeMats.push(stripMat);

      const bridgeGroup = new THREE.Group();
      bridgeGroup.position.set(0, y, z);

      const deck = new THREE.Mesh(new THREE.BoxGeometry(span, 0.65, 1.35), darkMetal);
      const underGlow = new THREE.Mesh(new THREE.BoxGeometry(span * 0.94, 0.14, 0.32), stripMat);
      underGlow.position.y = -0.35;
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(span * 0.96, 0.1, 1.42), stripMat);
      topRail.position.y = 0.34;

      bridgeGroup.add(deck, underGlow, topRail);
      this.group.add(bridgeGroup);
    }

    // 2. Sleek Perspective Gantry Arches flanking the highway (never obscuring the track)
    const archCount = this.quality === 'low' ? 4 : 6;
    const pillarGeo = new THREE.BoxGeometry(0.24, 8.2, 0.32);
    const beamGeo = new THREE.BoxGeometry(11.6, 0.22, 0.28);

    for (let i = 0; i < archCount; i++) {
      const z = -10 - i * 10.5;
      const col = i % 2 === 0 ? this.primaryColor : this.secondaryColor;
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.65,
        roughness: 0.24,
        metalness: 0.5,
      });
      this.archMats.push(mat);

      const g = new THREE.Group();
      g.position.set(0, 0, z);

      const leftPillar = new THREE.Mesh(pillarGeo, darkMetal);
      leftPillar.position.set(-5.7, 3.6, 0);
      leftPillar.rotation.z = -0.1;

      const rightPillar = new THREE.Mesh(pillarGeo, darkMetal);
      rightPillar.position.set(5.7, 3.6, 0);
      rightPillar.rotation.z = 0.1;

      const leftStrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 7.6, 0.36), mat);
      leftStrip.position.set(-5.55, 3.6, 0);
      leftStrip.rotation.z = -0.1;

      const rightStrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 7.6, 0.36), mat);
      rightStrip.position.set(5.55, 3.6, 0);
      rightStrip.rotation.z = 0.1;

      const topBeam = new THREE.Mesh(beamGeo, darkMetal);
      topBeam.position.set(0, 7.6, 0);
      const topStrip = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.1, 0.32), mat);
      topStrip.position.set(0, 7.46, 0);

      g.add(leftPillar, rightPillar, leftStrip, rightStrip, topBeam, topStrip);
      this.group.add(g);
    }
  }

  private buildHorizonEnergyPortal(): void {
    this.portalGroup.position.set(0, 7.8, -74);

    this.portalOuterMat = new THREE.MeshStandardMaterial({
      color: this.primaryColor,
      emissive: this.primaryColor,
      emissiveIntensity: 0.92,
      roughness: 0.2,
      metalness: 0.6,
    });
    this.portalInnerMat = new THREE.MeshStandardMaterial({
      color: this.secondaryColor,
      emissive: this.secondaryColor,
      emissiveIntensity: 0.95,
      roughness: 0.2,
      metalness: 0.6,
    });

    this.portalOuterRing = new THREE.Mesh(
      new THREE.TorusGeometry(9.4, 0.26, 12, 48),
      this.portalOuterMat,
    );
    this.portalInnerRing = new THREE.Mesh(
      new THREE.TorusGeometry(7.3, 0.18, 10, 32),
      this.portalInnerMat,
    );

    // Subtle energy vortex disc inside portal
    this.portalCoreMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSubBass: { value: 0.2 },
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
        uniform float uSubBass;
        uniform float uEnergy;
        uniform float uBrightness;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying vec2 vUv;

        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          float angle = atan(p.y, p.x);
          float ring1 = smoothstep(0.06, 0.0, abs(r - (0.62 + 0.06 * sin(uTime * 2.2))));
          float ring2 = smoothstep(0.05, 0.0, abs(r - (0.42 + 0.04 * cos(uTime * 3.0))));
          float swirl = 0.5 + 0.5 * sin(angle * 6.0 + r * 12.0 - uTime * 3.4);
          float mask = smoothstep(0.95, 0.15, r);

          vec3 col = mix(uColorA, uColorB, swirl);
          float intensity = (0.16 + ring1 * 0.45 + ring2 * 0.35 + uSubBass * 0.38) * mask;
          gl_FragColor = vec4(col * (0.7 + uEnergy * 0.35) * uBrightness, clamp(intensity, 0.0, 0.55));
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const coreDisc = new THREE.Mesh(new THREE.CircleGeometry(7.1, 40), this.portalCoreMat);

    // Cyber Torii frame bars framing the portal
    const toriiMat = new THREE.MeshStandardMaterial({
      color: 0x070d20,
      metalness: 0.9,
      roughness: 0.25,
    });
    const pylonGeo = new THREE.BoxGeometry(0.85, 19.5, 0.9);
    const leftPylon = new THREE.Mesh(pylonGeo, toriiMat);
    leftPylon.position.set(-10.8, -0.5, 0);
    const rightPylon = new THREE.Mesh(pylonGeo, toriiMat);
    rightPylon.position.set(10.8, -0.5, 0);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(26.5, 0.9, 1.1), toriiMat);
    lintel.position.set(0, 9.6, 0);
    const lintelGlow = new THREE.Mesh(
      new THREE.BoxGeometry(25.2, 0.22, 1.18),
      this.portalOuterMat,
    );
    lintelGlow.position.set(0, 9.15, 0);

    this.portalGroup.add(
      this.portalOuterRing,
      this.portalInnerRing,
      coreDisc,
      leftPylon,
      rightPylon,
      lintel,
      lintelGlow,
    );
    this.group.add(this.portalGroup);
  }

  private buildHolographicSignsAndBillboards(maxAnisotropy: number): void {
    const boardCount = this.quality === 'low' ? 5 : 10;
    for (let i = 0; i < boardCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const tex = createCyberBillboardTexture(this.rng, maxAnisotropy);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
      });
      this.billboardMats.push(mat);

      const board = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), mat);
      board.position.set(side * (7.5 + (i % 2) * 1.4), 3.6 + (i % 3) * 2.3, -11 - i * 7.2);
      board.rotation.y = -side * (Math.PI * 0.34);
      this.group.add(board);
    }

    // Audio-reactive holographic telemetry HUD frames flanking corridor
    const holoCount = this.quality === 'low' ? 4 : 6;
    for (let i = 0; i < holoCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const col = i % 2 === 0 ? this.primaryColor : this.secondaryColor;
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uEnergy: { value: 0.3 },
          uTreble: { value: 0.2 },
          uBrightness: { value: 1.0 },
          uColor: { value: col.clone() },
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
          uniform float uEnergy;
          uniform float uTreble;
          uniform float uBrightness;
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float border = step(vUv.x, 0.035) + step(0.965, vUv.x) + step(vUv.y, 0.055) + step(0.945, vUv.y);
            float scan = sin(vUv.y * 44.0 - uTime * 5.2) * 0.5 + 0.5;
            float wave = smoothstep(0.055, 0.0, abs(vUv.y - (0.5 + 0.26 * sin(vUv.x * 11.0 + uTime * 4.2) * (0.4 + uEnergy))));
            float bars = step(0.75, fract(vUv.x * 14.0)) * step(vUv.y, 0.28 + 0.38 * uTreble * abs(sin(floor(vUv.x * 14.0) * 2.1 + uTime * 4.0)));
            float alpha = clamp(border * 0.42 + scan * 0.08 + wave * (0.35 + uEnergy * 0.25) + bars * 0.28, 0.0, 0.65);
            gl_FragColor = vec4(uColor * (0.72 + wave * 0.3 + uTreble * 0.25) * uBrightness, alpha);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.holoMats.push(mat);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.4), mat);
      mesh.position.set(side * 6.65, 4.4 + (i % 2) * 1.35, -16 - i * 9.5);
      mesh.rotation.y = -side * 0.58;
      this.group.add(mesh);
      this.holoMeshes.push(mesh);
    }
  }

  private buildFlyingTraffic(): void {
    const hullGeo = new THREE.ConeGeometry(0.18, 0.98, 5);
    hullGeo.rotateX(Math.PI / 2);
    const wingGeo = new THREE.BoxGeometry(0.98, 0.04, 0.34);
    const thrusterGeo = new THREE.SphereGeometry(0.085, 8, 8);
    const trailGeo = new THREE.ConeGeometry(0.1, 2.2, 6);
    trailGeo.rotateX(-Math.PI / 2);

    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.88,
      roughness: 0.22,
    });
    const thrusterColors = [0x22d3ee, 0xf97316, 0xf43f8e];
    const craftCount = this.quality === 'low' ? 6 : this.quality === 'medium' ? 10 : 14;

    for (let i = 0; i < craftCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const g = new THREE.Group();
      const hull = new THREE.Mesh(hullGeo, hullMat);
      const wings = new THREE.Mesh(wingGeo, hullMat);
      wings.position.z = -0.12;

      const tHex = thrusterColors[i % thrusterColors.length];
      const tMat = new THREE.MeshBasicMaterial({ color: tHex });
      const trailMat = new THREE.MeshBasicMaterial({
        color: tHex,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const tL = new THREE.Mesh(thrusterGeo, tMat);
      tL.position.set(-0.22, 0, -0.46);
      const tR = new THREE.Mesh(thrusterGeo, tMat);
      tR.position.set(0.22, 0, -0.46);

      const trailL = new THREE.Mesh(trailGeo, trailMat);
      trailL.position.set(-0.22, 0, -1.55);
      const trailR = new THREE.Mesh(trailGeo, trailMat);
      trailR.position.set(0.22, 0, -1.55);

      g.add(hull, wings, tL, tR, trailL, trailR);
      const dir = i % 3 === 0 ? 1 : -1;
      g.rotation.y = dir > 0 ? 0 : Math.PI;

      const laneX = side * this.rng.range(6.4, 17.5);
      const baseY = this.rng.range(2.2, 12.5);
      const z = this.rng.range(-82, -8);
      g.position.set(laneX, baseY, z);
      this.group.add(g);

      this.flyingCrafts.push({
        group: g,
        trailMat,
        laneX,
        baseY,
        z,
        speed: this.rng.range(11, 24),
        dir,
        phase: this.rng.range(0, Math.PI * 2),
      });
    }
  }

  private buildFloatingTechShards(): void {
    const shardCount = this.quality === 'low' ? 12 : this.quality === 'medium' ? 20 : 28;
    const geo = new THREE.OctahedronGeometry(0.28, 0);
    this.shardMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.75,
      metalness: 0.78,
      roughness: 0.22,
    });
    this.shardInstancedMesh = new THREE.InstancedMesh(geo, this.shardMat, shardCount);
    this.shardInstancedMesh.frustumCulled = false;

    for (let i = 0; i < shardCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const basePos = new THREE.Vector3(
        side * this.rng.range(5.6, 13.5),
        this.rng.range(1.6, 9.2),
        this.rng.range(-68, -6),
      );
      const rotSpeed = new THREE.Vector3(
        this.rng.range(0.3, 1.1),
        this.rng.range(0.4, 1.4),
        this.rng.range(0.2, 0.9),
      );
      const scale = this.rng.range(0.65, 1.45);
      const phase = this.rng.range(0, Math.PI * 2);
      this.shards.push({
        basePos,
        rotSpeed,
        bobSpeed: this.rng.range(0.8, 1.6),
        bobAmp: this.rng.range(0.22, 0.55),
        phase,
        scale,
      });

      _euler.set(phase, phase * 0.7, 0);
      _quat.setFromEuler(_euler);
      _scale.setScalar(scale);
      _mat4.compose(basePos, _quat, _scale);
      this.shardInstancedMesh.setMatrixAt(i, _mat4);
      this.shardInstancedMesh.setColorAt(
        i,
        i % 3 === 0 ? this.primaryColor : i % 3 === 1 ? this.secondaryColor : this.accentColor,
      );
    }
    this.shardInstancedMesh.instanceMatrix.needsUpdate = true;
    if (this.shardInstancedMesh.instanceColor) {
      this.shardInstancedMesh.instanceColor.needsUpdate = true;
    }
    this.group.add(this.shardInstancedMesh);
  }

  private buildUrbanParticles(): void {
    const pos = new Float32Array(this.particleCount * 3);
    const cols = new Float32Array(this.particleCount * 3);
    const c1 = new THREE.Color('#22d3ee');
    const c2 = new THREE.Color('#f43f8e');
    const c3 = new THREE.Color('#fb923c');

    for (let i = 0; i < this.particleCount; i++) {
      pos[i * 3] = this.rng.range(-28, 28);
      pos[i * 3 + 1] = this.rng.range(0.5, 22);
      pos[i * 3 + 2] = this.rng.range(-88, 6);
      const c = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    this.particleMat = new THREE.PointsMaterial({
      size: 0.25,
      map: createSoftGlowTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
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

    this.wetDeckMat.uniforms.uReflectA.value.copy(this.primaryColor);
    this.wetDeckMat.uniforms.uReflectB.value.copy(this.secondaryColor);
    this.portalOuterMat.color.copy(this.primaryColor);
    this.portalOuterMat.emissive.copy(this.primaryColor);
    this.portalInnerMat.color.copy(this.secondaryColor);
    this.portalInnerMat.emissive.copy(this.secondaryColor);
    this.portalCoreMat.uniforms.uColorA.value.copy(this.primaryColor);
    this.portalCoreMat.uniforms.uColorB.value.copy(this.secondaryColor);

    this.holoMats.forEach((m, i) => {
      m.uniforms.uColor.value.copy(i % 2 === 0 ? this.primaryColor : this.secondaryColor);
    });
  }

  public update(ctx: WorldUpdateContext): void {
    const {
      dt,
      elapsed,
      mode,
      bass,
      mid,
      high,
      energy,
      subBass = bass * 0.8,
      lowMid = (bass + mid) * 0.5,
      highMid = (mid + high) * 0.5,
      treble = high,
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
    const partMult = particleIntensity === 'low' ? 0.32 : particleIntensity === 'medium' ? 0.65 : 0.94;
    const bright = THREE.MathUtils.clamp(brightness, 0.5, 1.32);
    const silenceDamp = inSilence ? 0.32 : 1.0;

    // 6-band differentiated audio drivers
    const effSub = reactiveEnabled ? subBass * visMult * silenceDamp : 0.14;
    const effBass = reactiveEnabled ? bass * visMult * silenceDamp : 0.16;
    const effLowMid = reactiveEnabled ? lowMid * visMult * silenceDamp : 0.14;
    const effMid = reactiveEnabled ? mid * visMult * silenceDamp : 0.14;
    const effHighMid = reactiveEnabled ? highMid * visMult * silenceDamp : 0.12;
    const effTreble = reactiveEnabled ? treble * visMult * silenceDamp : 0.1;
    const effEnergy = reactiveEnabled ? energy * visMult * silenceDamp : 0.15;

    _tmpColA.copy(chromaticA ?? this.primaryColor);
    _tmpColB.copy(chromaticB ?? this.secondaryColor);
    _tmpColAccent.copy(chromaticAccent ?? this.accentColor);

    // 1. Sky Dome & Volumetric Mist -> SubBass + Chromatic shift
    this.skyMat.uniforms.uTime.value = elapsed;
    this.skyMat.uniforms.uEnergy.value = effEnergy;
    this.skyMat.uniforms.uSubBass.value = effSub;
    this.skyMat.uniforms.uBrightness.value = bright;
    this.skyMat.uniforms.uHorizonGlow.value.copy(_tmpColA);
    this.skyMat.uniforms.uHorizonAccent.value.copy(_tmpColB);

    // 2. Wet Urban Floor & Viaducts -> SubBass + LowMid
    this.wetDeckMat.uniforms.uTime.value = elapsed;
    this.wetDeckMat.uniforms.uEnergy.value = effEnergy;
    this.wetDeckMat.uniforms.uSubBass.value = effSub;
    this.wetDeckMat.uniforms.uBrightness.value = bright;
    this.wetDeckMat.uniforms.uScroll.value =
      mode === 'playing' ? (elapsed * 0.45) % 1 : (elapsed * 0.14) % 1;
    this.wetDeckMat.uniforms.uReflectA.value.copy(_tmpColA);
    this.wetDeckMat.uniforms.uReflectB.value.copy(_tmpColB);

    this.trafficStreaksMat.uniforms.uTime.value =
      elapsed * (mode === 'paused' ? 0 : 1 + effBass * 0.45);
    this.trafficStreaksMat.uniforms.uEnergy.value = effLowMid;
    this.trafficStreaksMat.uniforms.uBrightness.value = bright;

    // 3. Buildings -> LowMid & Mid (staggered per material so they don't blink uniformly)
    this.buildingMats.forEach((m, idx) => {
      const bandVal = idx === 0 ? effLowMid : idx === 1 ? effMid : idx === 2 ? effEnergy : effBass * 0.85;
      m.emissiveIntensity = Math.min(1.18, (0.52 + bandVal * 0.46) * bright);
    });
    this.crownMats.forEach((m, idx) => {
      const pulse = idx % 2 === 0 ? effBass : effTreble;
      m.emissiveIntensity = Math.min(1.25, (0.56 + pulse * 0.5) * bright);
    });

    // 4. Sky-bridges & Corridor Gantry Arches -> Bass & Mid
    this.bridgeMats.forEach((m, idx) => {
      m.emissive.copy(idx % 2 === 0 ? _tmpColA : _tmpColB);
      m.emissiveIntensity = Math.min(1.15, (0.48 + effMid * 0.48) * bright);
    });
    this.archMats.forEach((m, idx) => {
      const wave = Math.sin(elapsed * 2.8 - idx * 0.9) * 0.5 + 0.5;
      m.emissive.copy(idx % 2 === 0 ? _tmpColA : _tmpColB);
      m.emissiveIntensity = Math.min(1.15, (0.42 + effBass * 0.44 + wave * 0.14) * bright);
    });

    // 5. Horizon Energy Portal -> SubBass + Mid rotation
    this.portalOuterRing.rotation.z = elapsed * (0.14 + effMid * 0.16);
    this.portalInnerRing.rotation.z = -elapsed * (0.22 + effBass * 0.22);
    this.portalOuterMat.emissive.copy(_tmpColA);
    this.portalInnerMat.emissive.copy(_tmpColB);
    this.portalOuterMat.emissiveIntensity = Math.min(1.25, (0.68 + effBass * 0.42) * bright);
    this.portalInnerMat.emissiveIntensity = Math.min(1.25, (0.7 + effSub * 0.48) * bright);
    this.portalCoreMat.uniforms.uTime.value = elapsed;
    this.portalCoreMat.uniforms.uSubBass.value = effSub;
    this.portalCoreMat.uniforms.uEnergy.value = effEnergy;
    this.portalCoreMat.uniforms.uBrightness.value = bright;
    this.portalCoreMat.uniforms.uColorA.value.copy(_tmpColA);
    this.portalCoreMat.uniforms.uColorB.value.copy(_tmpColB);

    // 6. Holograms -> HighMid & Treble
    this.holoMeshes.forEach((mesh, idx) => {
      mesh.visible = menuAmbientEffects || mode === 'playing';
      const mat = this.holoMats[idx];
      if (mat) {
        mat.uniforms.uTime.value = elapsed + idx * 0.7;
        mat.uniforms.uEnergy.value = effHighMid;
        mat.uniforms.uTreble.value = effTreble;
        mat.uniforms.uBrightness.value = bright;
        mat.uniforms.uColor.value.copy(idx % 2 === 0 ? _tmpColA : _tmpColB);
      }
    });

    // 7. Flying Hovercraft + Luminous Trails -> HighMid & Energy
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
      c.trailMat.opacity = Math.min(0.68, (0.28 + effHighMid * 0.32) * bright);
    }

    // 8. Floating Tech Shards -> Mid architectural motion
    if (this.shardInstancedMesh && this.shardMat) {
      this.shardInstancedMesh.visible = menuAmbientEffects || mode === 'playing';
      if (this.shardInstancedMesh.visible) {
        this.shardMat.emissiveIntensity = Math.min(1.15, (0.55 + effMid * 0.42) * bright);
        for (let i = 0; i < this.shards.length; i++) {
          const sh = this.shards[i];
          _pos.set(
            sh.basePos.x,
            sh.basePos.y + Math.sin(elapsed * sh.bobSpeed + sh.phase) * (sh.bobAmp + effMid * 0.25),
            sh.basePos.z,
          );
          _euler.set(
            elapsed * sh.rotSpeed.x + sh.phase,
            elapsed * sh.rotSpeed.y + sh.phase,
            elapsed * sh.rotSpeed.z,
          );
          _quat.setFromEuler(_euler);
          _scale.setScalar(sh.scale * (1 + effBass * 0.14));
          _mat4.compose(_pos, _quat, _scale);
          this.shardInstancedMesh.setMatrixAt(i, _mat4);
        }
        this.shardInstancedMesh.instanceMatrix.needsUpdate = true;
      }
    }

    // 9. Ambient Suspended Particles -> HighMid / Treble
    this.ambientParticles.visible = menuAmbientEffects || mode === 'playing';
    if (this.ambientParticles.visible) {
      const activeRatio =
        particleIntensity === 'low' ? 0.32 : particleIntensity === 'medium' ? 0.65 : 1.0;
      const activeCount = Math.floor(this.particleCount * activeRatio);
      this.ambientParticles.geometry.setDrawRange(0, activeCount);
      this.particleMat.opacity = Math.min(0.75, (0.26 + (effHighMid + effTreble) * 0.18) * partMult * bright);

      const pAttr = this.ambientParticles.geometry.attributes.position as THREE.BufferAttribute;
      const pSpeed = mode === 'playing' ? (8.5 + effBass * 12) * silenceDamp : 2.6;
      for (let i = 0; i < activeCount; i++) {
        let z = pAttr.getZ(i) + pSpeed * dt;
        if (z > 8) z = -88;
        pAttr.setZ(i, z);
      }
      pAttr.needsUpdate = true;
    }
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
