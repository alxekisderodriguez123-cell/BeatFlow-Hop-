import * as THREE from 'three';
import type { SongPalette } from '../../types/game';
import { SeededRng } from './seededRandom';
import {
  createCyberFacadeTexture,
  createSoftGlowTexture,
  disposeObjectTree,
} from './sharedTextures';
import type { WorldAtmosphere, WorldBuildOptions, WorldInstance, WorldUpdateContext } from './types';

export class NewYorkNightWorld implements WorldInstance {
  public readonly theme = 'newyork' as const;
  public readonly group = new THREE.Group();
  public readonly atmosphere: WorldAtmosphere = {
    backgroundColor: 0x05091c,
    fogColor: 0x0b1533,
    fogDensity: 0.0085,
    hemiSkyColor: 0x93c5fd,
    hemiGroundColor: 0x1e1b2e,
    dirLightColor: 0xfef3c7,
  };

  private rng: SeededRng;
  private skyMat!: THREE.ShaderMaterial;
  private riverMat!: THREE.ShaderMaterial;
  private skylineMats: THREE.MeshStandardMaterial[] = [];
  private bridgeLightMat!: THREE.MeshStandardMaterial;
  private spireBeaconMat!: THREE.MeshStandardMaterial;
  private harborLights!: THREE.Points;
  private harborMat!: THREE.PointsMaterial;
  private lightCount = 180;

  constructor(opts: WorldBuildOptions) {
    this.rng = new SeededRng(`${opts.seed}:newyork`);
    this.buildManhattanNightSky();
    this.buildEastRiverWater(opts.graphicsQuality);
    this.buildForegroundPierPilings();
    this.buildBrooklynBridgeSpan();
    this.buildManhattanSkyline(opts.maxAnisotropy);
    this.buildHarborSparkles();
  }

  private buildManhattanNightSky(): void {
    const geo = new THREE.SphereGeometry(135, 32, 18);
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
          float y = clamp(vDir.y, -0.2, 1.0);
          vec3 zenith = vec3(0.025, 0.04, 0.14);
          vec3 cityGlow = vec3(0.18, 0.15, 0.28);
          vec3 warmHaze = vec3(0.42, 0.24, 0.14);

          vec3 col = mix(cityGlow, zenith, smoothstep(0.02, 0.55, y));
          float horizonBand = exp(-abs(y - 0.02) * 10.0);
          col += warmHaze * horizonBand * (0.45 + uEnergy * 0.25);

          // High drifting night cloud wisps lit gently from Manhattan below
          float c = noise(vec2(vDir.x * 3.0 + uTime * 0.008, vDir.y * 8.0));
          float cloud = smoothstep(0.52, 0.78, c) * smoothstep(0.05, 0.25, y) * smoothstep(0.65, 0.2, y);
          col = mix(col, vec3(0.18, 0.2, 0.34), cloud * 0.45);

          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.group.add(new THREE.Mesh(geo, this.skyMat));
  }

  private buildEastRiverWater(quality: string): void {
    const segs = quality === 'low' ? 40 : 64;
    const geo = new THREE.PlaneGeometry(185, 165, segs, segs);
    geo.rotateX(-Math.PI / 2);

    this.riverMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.25 },
        uBass: { value: 0.2 },
        uBrightness: { value: 1.0 },
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorldPos;
        void main() {
          vec3 pos = position;
          pos.y += sin(pos.z * 0.35 + uTime * 1.5) * 0.07 + cos(pos.x * 0.28 - uTime * 1.2) * 0.06;
          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uEnergy;
        uniform float uBass;
        uniform float uBrightness;
        varying vec3 vWorldPos;

        void main() {
          float distFade = exp(-abs(vWorldPos.z + 18.0) * 0.011);
          vec3 riverDark = vec3(0.02, 0.055, 0.11);
          vec3 warmCityRef = vec3(0.95, 0.65, 0.22);
          vec3 cyanBridgeRef = vec3(0.18, 0.78, 0.88);
          vec3 emeraldRef = vec3(0.2, 0.72, 0.56);

          float ripple = sin(vWorldPos.z * 2.2 + uTime * 2.6 + sin(vWorldPos.x * 0.5) * 1.8);
          float shimmer = smoothstep(0.15, 0.95, ripple * 0.5 + 0.5);

          // Elongated vertical reflections of skyline & bridge lights
          float warmCols = pow(0.5 + 0.5 * sin(vWorldPos.x * 0.28 + 1.2), 3.0);
          float cyanCols = pow(0.5 + 0.5 * cos(vWorldPos.x * 0.35 - 0.6), 3.0);
          float centerEm = exp(-abs(vWorldPos.x) * 0.06);

          vec3 col = riverDark;
          col += warmCityRef * warmCols * shimmer * (0.28 + uEnergy * 0.22) * distFade;
          col += cyanBridgeRef * cyanCols * shimmer * (0.24 + uBass * 0.2) * distFade;
          col += emeraldRef * centerEm * shimmer * 0.14 * distFade;

          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
    });

    const river = new THREE.Mesh(geo, this.riverMat);
    river.position.set(0, -1.55, -56);
    this.group.add(river);
  }

  private buildForegroundPierPilings(): void {
    // Weathered harbor wooden pier pilings flanking foreground edges (matching screenshot 5)
    const pilingGeo = new THREE.CylinderGeometry(0.16, 0.19, 2.2, 8);
    const pilingMat = new THREE.MeshStandardMaterial({
      color: 0x1b1512,
      roughness: 0.9,
      metalness: 0.05,
    });
    const lanternMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const lanternGeo = new THREE.SphereGeometry(0.12, 8, 8);

    const offsets = [
      [-5.6, -4.5],
      [-6.5, -7.2],
      [-5.2, -10.0],
      [5.6, -4.5],
      [6.5, -7.2],
      [5.2, -10.0],
    ];
    offsets.forEach(([x, z], idx) => {
      const post = new THREE.Mesh(pilingGeo, pilingMat);
      post.position.set(x, -0.75, z);
      this.group.add(post);
      if (idx % 2 === 0) {
        const bulb = new THREE.Mesh(lanternGeo, lanternMat);
        bulb.position.set(x, 0.42, z);
        this.group.add(bulb);
      }
    });
  }

  private buildBrooklynBridgeSpan(): void {
    // Iconic Brooklyn Bridge with Gothic double-arch stone towers + catenary suspension cables
    const bridgeGroup = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x3f3730,
      roughness: 0.85,
      metalness: 0.12,
    });
    const cableMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.75,
      roughness: 0.3,
    });
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.65,
      roughness: 0.4,
    });
    this.bridgeLightMat = new THREE.MeshStandardMaterial({
      color: 0xfde68a,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.95,
      roughness: 0.2,
    });

    // Sculpt Gothic double-arch stone tower via ExtrudeGeometry with two pointed arch holes
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

    // Place two bridge towers flanking the vista cleanly, spanning along a dramatic diagonal/cross vista
    const bridgeZ = -48;
    const leftTowerX = -15.5;
    const rightTowerX = 15.5;

    [leftTowerX, rightTowerX].forEach((tx) => {
      const tower = new THREE.Mesh(towerGeo, stoneMat);
      tower.position.set(tx, 6.8, bridgeZ);
      // Add stepped stone cornice cap
      const cap = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.75, 2.2), stoneMat);
      cap.position.set(tx, 15.2, bridgeZ);
      bridgeGroup.add(tower, cap);
    });

    // Elevated bridge road deck spanning across background above horizon (high enough not to clash with portal/track)
    const deckY = 4.6;
    const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(74, 0.55, 2.4), deckMat);
    bridgeDeck.position.set(0, deckY, bridgeZ);
    bridgeGroup.add(bridgeDeck);

    // Parabolic main suspension cables (left approach, center span, right approach)
    const spans = [
      { x0: -36, y0: deckY + 0.4, x1: leftTowerX, y1: 14.8 },
      { x0: leftTowerX, y0: 14.8, x1: rightTowerX, y1: 14.8 },
      { x0: rightTowerX, y0: 14.8, x1: 36, y1: deckY + 0.4 },
    ];

    [-0.9, 0.9].forEach((zOff) => {
      spans.forEach((sp, sIdx) => {
        const midX = (sp.x0 + sp.x1) * 0.5;
        const sagY = sIdx === 1 ? deckY + 1.25 : (sp.y0 + sp.y1) * 0.5 - 2.6;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(sp.x0, sp.y0, bridgeZ + zOff),
          new THREE.Vector3(midX, sagY, bridgeZ + zOff),
          new THREE.Vector3(sp.x1, sp.y1, bridgeZ + zOff),
        ]);
        const cableMesh = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 18, 0.085, 6, false),
          cableMat,
        );
        bridgeGroup.add(cableMesh);

        // Warm bridge necklace string lights along the cable curve
        const bulbGeo = new THREE.SphereGeometry(0.11, 6, 6);
        const count = sIdx === 1 ? 11 : 7;
        for (let b = 1; b < count; b++) {
          const pt = curve.getPoint(b / count);
          const bulb = new THREE.Mesh(bulbGeo, this.bridgeLightMat);
          bulb.position.copy(pt);
          bridgeGroup.add(bulb);
        }
      });
    });

    // Vertical suspender cables
    const suspMat = new THREE.MeshBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.55 });
    for (let sx = -30; sx <= 30; sx += 2.6) {
      if (Math.abs(sx - leftTowerX) < 2.2 || Math.abs(sx - rightTowerX) < 2.2) continue;
      const distNorm = Math.abs(sx) / rightTowerX;
      const topY =
        Math.abs(sx) <= rightTowerX
          ? THREE.MathUtils.lerp(deckY + 1.25, 14.6, distNorm * distNorm)
          : THREE.MathUtils.lerp(14.6, deckY + 0.4, (Math.abs(sx) - rightTowerX) / 20.5);
      const h = Math.max(0.5, topY - deckY);
      const susp = new THREE.Mesh(new THREE.BoxGeometry(0.035, h, 0.035), suspMat);
      susp.position.set(sx, deckY + h * 0.5, bridgeZ + 0.9);
      bridgeGroup.add(susp);
    }

    this.group.add(bridgeGroup);
  }

  private buildManhattanSkyline(maxAnisotropy: number): void {
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
          roughness: 0.42,
          metalness: 0.55,
          envMapIntensity: 0.35,
        }),
      );
    });

    this.spireBeaconMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.95,
      roughness: 0.2,
    });

    // Hero One World Trade Center spire building on the left-mid skyline (matching screenshot 5)
    const owtcGroup = new THREE.Group();
    const owtcX = this.rng.range(-26, -18);
    owtcGroup.position.set(owtcX, -1.55, -72);
    const owtcBody = new THREE.Mesh(
      new THREE.CylinderGeometry(1.75, 2.55, 29, 8),
      this.skylineMats[1],
    );
    owtcBody.position.y = 14.5;
    const owtcRing = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.75, 1.5, 8), this.spireBeaconMat);
    owtcRing.position.y = 29.5;
    const owtcSpire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.18, 7.5, 6),
      this.spireBeaconMat,
    );
    owtcSpire.position.y = 33.8;
    owtcGroup.add(owtcBody, owtcRing, owtcSpire);
    this.group.add(owtcGroup);

    // Sculpted Lower Manhattan skyline clusters left, right & behind the bridge
    const buildingCount = 30;
    for (let i = 0; i < buildingCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const inBackBand = i >= 18;
      const x = inBackBand
        ? this.rng.range(-48, 48)
        : side * this.rng.range(11.5, 32.0);
      const z = inBackBand
        ? this.rng.range(-88, -62)
        : this.rng.range(-66, -14);
      const w = this.rng.range(2.6, 5.2);
      const d = this.rng.range(2.6, 4.8);
      const h = this.rng.range(10, 26);

      const mat = this.skylineMats[i % this.skylineMats.length];
      const bGroup = new THREE.Group();
      bGroup.position.set(x, -1.55, z);

      const base = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.72, d), mat);
      base.position.y = h * 0.36;
      const upper = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.74, h * 0.28, d * 0.74),
        mat,
      );
      upper.position.y = h * 0.72 + h * 0.14;
      bGroup.add(base, upper);

      if (i % 4 === 0) {
        const crown = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.55, 0.45, d * 0.55),
          this.bridgeLightMat,
        );
        crown.position.y = h + 0.22;
        bGroup.add(crown);
      }

      this.group.add(bGroup);
    }
  }

  private buildHarborSparkles(): void {
    const pos = new Float32Array(this.lightCount * 3);
    const cols = new Float32Array(this.lightCount * 3);
    const c1 = new THREE.Color('#fde68a');
    const c2 = new THREE.Color('#7dd3fc');
    const c3 = new THREE.Color('#fb923c');

    for (let i = 0; i < this.lightCount; i++) {
      pos[i * 3] = this.rng.range(-30, 30);
      pos[i * 3 + 1] = this.rng.range(-0.6, 14);
      pos[i * 3 + 2] = this.rng.range(-80, 4);
      const c = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    this.harborMat = new THREE.PointsMaterial({
      size: 0.22,
      map: createSoftGlowTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.harborLights = new THREE.Points(geo, this.harborMat);
    this.group.add(this.harborLights);
  }

  public setPalette(_palette: SongPalette): void {
    // New York Night preserves its iconic warm gold / Manhattan blue-cyan palette
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
      inSilence,
      reactiveEnabled,
      visualIntensity,
      particleIntensity,
      brightness,
    } = ctx;

    const visMult = visualIntensity === 'low' ? 0.45 : visualIntensity === 'medium' ? 0.75 : 1.0;
    const partMult = particleIntensity === 'low' ? 0.32 : particleIntensity === 'medium' ? 0.65 : 0.92;
    const bright = THREE.MathUtils.clamp(brightness, 0.5, 1.35);
    const silenceDamp = inSilence ? 0.35 : 1.0;

    const effBass = reactiveEnabled ? bass * visMult * silenceDamp : 0.16;
    const effMid = reactiveEnabled ? mid * visMult * silenceDamp : 0.14;
    const effHigh = reactiveEnabled ? high * visMult * silenceDamp : 0.12;
    const effEnergy = reactiveEnabled ? energy * visMult * silenceDamp : 0.18;

    this.skyMat.uniforms.uTime.value = elapsed;
    this.skyMat.uniforms.uEnergy.value = effEnergy;
    this.skyMat.uniforms.uBrightness.value = bright;

    this.riverMat.uniforms.uTime.value = elapsed;
    this.riverMat.uniforms.uEnergy.value = effEnergy;
    this.riverMat.uniforms.uBass.value = effBass;
    this.riverMat.uniforms.uBrightness.value = bright;

    this.skylineMats.forEach((m, i) => {
      m.emissiveIntensity = (0.58 + (i === 0 ? effMid : effHigh) * 0.35) * bright;
    });
    this.bridgeLightMat.emissiveIntensity = (0.72 + effBass * 0.42) * bright;
    this.spireBeaconMat.emissiveIntensity = (0.75 + effHigh * 0.45) * bright;

    const activeRatio = particleIntensity === 'low' ? 0.32 : particleIntensity === 'medium' ? 0.65 : 1.0;
    const activeCount = Math.floor(this.lightCount * activeRatio);
    this.harborLights.geometry.setDrawRange(0, activeCount);
    this.harborMat.opacity = (0.28 + effHigh * 0.25) * partMult * bright;

    const pAttr = this.harborLights.geometry.attributes.position as THREE.BufferAttribute;
    const speed = mode === 'paused' ? 0 : 1.8 + effEnergy * 2.5;
    for (let i = 0; i < activeCount; i++) {
      let z = pAttr.getZ(i) + speed * dt;
      if (z > 6) z = -80;
      pAttr.setZ(i, z);
    }
    pAttr.needsUpdate = true;
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
