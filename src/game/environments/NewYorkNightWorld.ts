import * as THREE from 'three';
import type { SongPalette } from '../../types/game';
import {
  addInkOutline,
  createCelToonGradientMap,
  createCrossStarTexture,
  createIllustratedMoonTexture,
  createIllustratedSkylineLayerTexture,
  createStylizedCloudTexture,
} from './illustratedLayers';
import { SeededRng } from './seededRandom';
import { createCyberFacadeTexture, disposeObjectTree } from './sharedTextures';
import type { WorldAtmosphere, WorldBuildOptions, WorldInstance, WorldUpdateContext } from './types';

export class NewYorkNightWorld implements WorldInstance {
  public readonly theme = 'newyork' as const;
  public readonly group = new THREE.Group();
  public readonly atmosphere: WorldAtmosphere = {
    backgroundColor: 0x090f2b,
    fogColor: 0x15224c,
    fogDensity: 0.0076,
    hemiSkyColor: 0x93c5fd,
    hemiGroundColor: 0x1e1b38,
    dirLightColor: 0xfef3c7,
  };

  private rng: SeededRng;
  private toonGrad: THREE.DataTexture;
  private skyMat!: THREE.ShaderMaterial;
  private riverMat!: THREE.ShaderMaterial;
  private skylineMats: THREE.MeshStandardMaterial[] = [];
  private bridgeLightMat!: THREE.MeshBasicMaterial;
  private spireBeaconMat!: THREE.MeshBasicMaterial;
  private harborLights!: THREE.Points;
  private harborMat!: THREE.PointsMaterial;
  private lightCount = 170;

  constructor(opts: WorldBuildOptions) {
    this.rng = new SeededRng(`${opts.seed}:newyork-illustrated`);
    this.toonGrad = createCelToonGradientMap();
    this.lightCount = opts.graphicsQuality === 'low' ? 75 : opts.graphicsQuality === 'medium' ? 120 : 170;

    this.buildManhattanIllustratedSky();
    this.buildEastRiverReflections();
    this.buildInkOutlinedPierLanterns();
    this.buildBrooklynBridgeSpan();
    this.buildManhattanIllustratedSkyline(opts.maxAnisotropy);
    this.buildHarborSparkles();
  }

  private buildManhattanIllustratedSky(): void {
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
        uniform float uEnergy;
        uniform float uBrightness;
        varying vec3 vDir;

        void main() {
          float y = clamp(vDir.y, -0.15, 1.0);
          vec3 zenith = vec3(0.035, 0.055, 0.19);
          vec3 midSky = vec3(0.14, 0.16, 0.36);
          vec3 warmHaze = vec3(0.58, 0.32, 0.22);

          vec3 col = mix(warmHaze, midSky, smoothstep(0.01, 0.24, y));
          col = mix(col, zenith, smoothstep(0.22, 0.65, y));

          float horizonBand = exp(-abs(y - 0.03) * 9.0);
          col += vec3(0.95, 0.65, 0.28) * horizonBand * (0.32 + uEnergy * 0.22);

          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.group.add(new THREE.Mesh(geo, this.skyMat));

    const moonTex = createIllustratedMoonTexture('#fef9c3', '#fde68a', 'rgba(251,191,36,0.38)');
    const moon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: moonTex,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        fog: false,
      }),
    );
    moon.position.set(-16, 28, -94);
    moon.scale.set(17, 17, 1);
    this.group.add(moon);

    const cloudTex = createStylizedCloudTexture('#1e2954', '#fbbf24', '#0b1026', true);
    const cloud = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        fog: false,
      }),
    );
    cloud.position.set(28, 22, -88);
    cloud.scale.set(44, 15, 1);
    this.group.add(cloud);
  }

  private buildEastRiverReflections(): void {
    const geo = new THREE.PlaneGeometry(185, 165);
    this.riverMat = new THREE.ShaderMaterial({
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
          float distFade = exp(-abs(vWorldPos.z + 18.0) * 0.01);
          vec3 riverDark = vec3(0.035, 0.07, 0.16);
          vec3 warmGold = vec3(0.98, 0.72, 0.26);
          vec3 cyanBridge = vec3(0.22, 0.82, 0.95);

          float ripple = sin(vWorldPos.z * 1.9 + uTime * 2.4 + sin(vWorldPos.x * 0.45) * 1.5);
          float celBand = step(0.25, ripple * 0.5 + 0.5);
          float warmCols = pow(0.5 + 0.5 * sin(vWorldPos.x * 0.28 + 1.2), 3.0);
          float cyanCols = pow(0.5 + 0.5 * cos(vWorldPos.x * 0.34 - 0.5), 3.0);

          vec3 col = riverDark;
          col += warmGold * warmCols * celBand * (0.34 + uEnergy * 0.22 + uKick * 0.22) * distFade;
          col += cyanBridge * cyanCols * celBand * (0.28 + uKick * 0.2) * distFade;

          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
    });

    const river = new THREE.Mesh(geo, this.riverMat);
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, -1.55, -56);
    this.group.add(river);
  }

  private buildInkOutlinedPierLanterns(): void {
    const pilingGeo = new THREE.CylinderGeometry(0.18, 0.22, 2.4, 8);
    const pilingMat = new THREE.MeshToonMaterial({ color: 0x292020, gradientMap: this.toonGrad });
    const lanternMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
    const lanternGeo = new THREE.SphereGeometry(0.15, 8, 8);

    const offsets = [
      [-6.0, -5.0],
      [-7.0, -8.5],
      [6.0, -5.0],
      [7.0, -8.5],
    ];
    offsets.forEach(([x, z], idx) => {
      const post = new THREE.Mesh(pilingGeo, pilingMat);
      post.position.set(x, -0.75, z);
      addInkOutline(post, 0x080716, 1.08);
      this.group.add(post);
      if (idx % 2 === 0) {
        const bulb = new THREE.Mesh(lanternGeo, lanternMat);
        bulb.position.set(x, 0.52, z);
        this.group.add(bulb);
      }
    });
  }

  private buildBrooklynBridgeSpan(): void {
    const bridgeGroup = new THREE.Group();
    const stoneMat = new THREE.MeshToonMaterial({ color: 0x4b423c, gradientMap: this.toonGrad });
    const cableMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
    const deckMat = new THREE.MeshToonMaterial({ color: 0x161d36, gradientMap: this.toonGrad });
    this.bridgeLightMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });

    const towerShape = new THREE.Shape();
    towerShape.moveTo(-2.6, 0);
    towerShape.lineTo(2.6, 0);
    towerShape.lineTo(2.35, 16.5);
    towerShape.lineTo(-2.35, 16.5);
    towerShape.closePath();

    [-1.05, 1.05].forEach((ax) => {
      const archHole = new THREE.Path();
      archHole.moveTo(ax - 0.65, 4.2);
      archHole.lineTo(ax - 0.65, 11.2);
      archHole.quadraticCurveTo(ax, 13.6, ax + 0.65, 11.2);
      archHole.lineTo(ax + 0.65, 4.2);
      archHole.closePath();
      towerShape.holes.push(archHole);
    });

    const towerGeo = new THREE.ExtrudeGeometry(towerShape, {
      depth: 1.5,
      bevelEnabled: true,
      bevelThickness: 0.14,
      bevelSize: 0.12,
      bevelSegments: 2,
    });
    towerGeo.center();

    const bridgeZ = -48;
    const leftTowerX = -15.5;
    const rightTowerX = 15.5;

    [leftTowerX, rightTowerX].forEach((tx) => {
      const tower = new THREE.Mesh(towerGeo, stoneMat);
      tower.position.set(tx, 6.8, bridgeZ);
      addInkOutline(tower, 0x070818, 1.04);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.75, 2.2), stoneMat);
      cap.position.set(tx, 15.2, bridgeZ);
      bridgeGroup.add(tower, cap);
    });

    const deckY = 4.6;
    const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(74, 0.55, 2.4), deckMat);
    bridgeDeck.position.set(0, deckY, bridgeZ);
    bridgeGroup.add(bridgeDeck);

    const spans = [
      { x0: -36, y0: deckY + 0.4, x1: leftTowerX, y1: 14.8 },
      { x0: leftTowerX, y0: 14.8, x1: rightTowerX, y1: 14.8 },
      { x0: rightTowerX, y0: 14.8, x1: 36, y1: deckY + 0.4 },
    ];

    const bulbGeo = new THREE.SphereGeometry(0.13, 6, 6);
    [-0.9, 0.9].forEach((zOff) => {
      spans.forEach((sp, sIdx) => {
        const midX = (sp.x0 + sp.x1) * 0.5;
        const sagY = sIdx === 1 ? deckY + 1.25 : (sp.y0 + sp.y1) * 0.5 - 2.6;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(sp.x0, sp.y0, bridgeZ + zOff),
          new THREE.Vector3(midX, sagY, bridgeZ + zOff),
          new THREE.Vector3(sp.x1, sp.y1, bridgeZ + zOff),
        ]);
        const cableMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.085, 6, false), cableMat);
        bridgeGroup.add(cableMesh);

        const count = sIdx === 1 ? 11 : 7;
        for (let b = 1; b < count; b++) {
          const pt = curve.getPoint(b / count);
          const bulb = new THREE.Mesh(bulbGeo, this.bridgeLightMat);
          bulb.position.copy(pt);
          bridgeGroup.add(bulb);
        }
      });
    });

    this.group.add(bridgeGroup);
  }

  private buildManhattanIllustratedSkyline(maxAnisotropy: number): void {
    const skylineTex = createIllustratedSkylineLayerTexture(this.rng, maxAnisotropy, {
      bodyTop: '#1a254d',
      bodyBottom: '#0c132d',
      inkColor: '#06091a',
      rimColors: ['#fbbf24', '#38bdf8', '#fb923c'],
      windowColors: ['#fde68a', '#7dd3fc', '#fb923c'],
      includeSpires: true,
    });
    const bgMat = new THREE.MeshBasicMaterial({
      map: skylineTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(118, 36), bgMat);
    backdrop.position.set(0, 14, -84);
    this.group.add(backdrop);

    const warmFacades = [
      createCyberFacadeTexture(this.rng, maxAnisotropy, true),
      createCyberFacadeTexture(this.rng, maxAnisotropy, true),
    ];
    warmFacades.forEach((f, idx) => {
      this.skylineMats.push(
        new THREE.MeshStandardMaterial({
          map: f.albedo,
          emissiveMap: f.emissive,
          emissive: new THREE.Color(idx === 0 ? '#fbbf24' : '#7dd3fc'),
          emissiveIntensity: 0.72,
          roughness: 0.45,
          metalness: 0.35,
        }),
      );
    });

    this.spireBeaconMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    // One WTC hero spire with ink outline
    const owtcGroup = new THREE.Group();
    owtcGroup.position.set(-22, -1.55, -68);
    const owtcBody = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 2.55, 28, 8), this.skylineMats[1]);
    owtcBody.position.y = 14;
    addInkOutline(owtcBody, 0x070a1c, 1.04);
    const owtcSpire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.18, 7.5, 6), this.spireBeaconMat);
    owtcSpire.position.y = 31.5;
    owtcGroup.add(owtcBody, owtcSpire);
    this.group.add(owtcGroup);

    const buildingCount = 14;
    for (let i = 0; i < buildingCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * this.rng.range(12.5, 30.0);
      const z = this.rng.range(-64, -14);
      const w = this.rng.range(2.8, 4.8);
      const d = this.rng.range(2.8, 4.6);
      const h = this.rng.range(11, 24);

      const mat = this.skylineMats[i % this.skylineMats.length];
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      base.position.set(x, -1.55 + h * 0.5, z);
      addInkOutline(base, 0x070a1c, 1.04);
      this.group.add(base);
    }
  }

  private buildHarborSparkles(): void {
    const pos = new Float32Array(this.lightCount * 3);
    const cols = new Float32Array(this.lightCount * 3);
    const c1 = new THREE.Color('#fde68a');
    const c2 = new THREE.Color('#7dd3fc');
    const c3 = new THREE.Color('#ffffff');

    for (let i = 0; i < this.lightCount; i++) {
      pos[i * 3] = this.rng.range(-32, 32);
      pos[i * 3 + 1] = this.rng.range(0.5, 22);
      pos[i * 3 + 2] = this.rng.range(-84, 4);
      const c = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    this.harborMat = new THREE.PointsMaterial({
      size: 0.34,
      map: createCrossStarTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.harborLights = new THREE.Points(geo, this.harborMat);
    this.group.add(this.harborLights);
  }

  public setPalette(_palette: SongPalette): void {
    // New York Night retains its amber-gold & skyline blue aesthetic
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
      kickPulse = 0,
      snarePulse = 0,
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

    const effMid = reactiveEnabled ? mid * visMult * silenceDamp : 0.14;
    const effHigh = reactiveEnabled ? high * visMult * silenceDamp : 0.12;
    const effEnergy = reactiveEnabled ? energy * visMult * silenceDamp : 0.18;
    const effKick = reactiveEnabled ? kickPulse * visMult * silenceDamp : 0;
    const effSnare = reactiveEnabled ? snarePulse * visMult * silenceDamp : 0;
    const effHihat = reactiveEnabled ? hihatPulse * visMult * silenceDamp : 0;

    this.skyMat.uniforms.uTime.value = elapsed;
    this.skyMat.uniforms.uEnergy.value = effEnergy;
    this.skyMat.uniforms.uBrightness.value = bright;

    this.riverMat.uniforms.uTime.value = elapsed;
    this.riverMat.uniforms.uEnergy.value = effEnergy;
    this.riverMat.uniforms.uKick.value = effKick;
    this.riverMat.uniforms.uBrightness.value = bright;

    this.skylineMats.forEach((m, i) => {
      m.emissiveIntensity = (0.58 + (i === 0 ? effMid : effHigh) * 0.32 + effSnare * 0.18) * bright;
    });

    const activeRatio = particleIntensity === 'low' ? 0.32 : particleIntensity === 'medium' ? 0.65 : 1.0;
    const activeCount = Math.floor(this.lightCount * activeRatio);
    this.harborLights.geometry.setDrawRange(0, activeCount);
    this.harborMat.opacity = Math.min(0.9, (0.42 + effHigh * 0.24 + effHihat * 0.25) * partMult * bright);

    const pAttr = this.harborLights.geometry.attributes.position as THREE.BufferAttribute;
    const speed = mode === 'paused' ? 0 : 1.6 + effEnergy * 2.4 + bass * 1.2;
    for (let i = 0; i < activeCount; i++) {
      let z = pAttr.getZ(i) + speed * dt;
      if (z > 6) z = -84;
      pAttr.setZ(i, z);
    }
    pAttr.needsUpdate = true;
  }

  public dispose(): void {
    this.toonGrad.dispose();
    disposeObjectTree(this.group);
  }
}
