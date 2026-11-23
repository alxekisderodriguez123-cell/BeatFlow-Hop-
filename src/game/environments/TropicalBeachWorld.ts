import * as THREE from 'three';
import type { SongPalette } from '../../types/game';
import { SeededRng } from './seededRandom';
import { createSoftGlowTexture, disposeObjectTree } from './sharedTextures';
import type { WorldAtmosphere, WorldBuildOptions, WorldInstance, WorldUpdateContext } from './types';

interface PalmEntry {
  group: THREE.Group;
  phase: number;
  baseRotZ: number;
}

export class TropicalBeachWorld implements WorldInstance {
  public readonly theme = 'tropical' as const;
  public readonly group = new THREE.Group();
  public readonly atmosphere: WorldAtmosphere = {
    backgroundColor: 0x0b0824,
    fogColor: 0x1b0f3b,
    fogDensity: 0.0095,
    hemiSkyColor: 0xf472b6,
    hemiGroundColor: 0x0f172a,
    dirLightColor: 0xfde68a,
  };

  private rng: SeededRng;
  private skyMat!: THREE.ShaderMaterial;
  private oceanMat!: THREE.ShaderMaterial;
  private shoreMat!: THREE.ShaderMaterial;
  private palms: PalmEntry[] = [];
  private fireflies!: THREE.Points;
  private fireflyMat!: THREE.PointsMaterial;
  private fireflyCount = 240;

  constructor(opts: WorldBuildOptions) {
    this.rng = new SeededRng(`${opts.seed}:tropical`);
    this.buildSunsetMilkyWaySky();
    this.buildBioluminescentOcean(opts.graphicsQuality);
    this.buildWetShorelinesAndRocks();
    this.buildSculptedPalmGroves();
    this.buildTropicalFireflies();
  }

  private buildSunsetMilkyWaySky(): void {
    const geo = new THREE.SphereGeometry(135, 32, 20);
    const sunShift = this.rng.range(-0.08, 0.08);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.25 },
        uBrightness: { value: 1.0 },
        uSunX: { value: sunShift },
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
        uniform float uSunX;
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
          vec3 zenith = vec3(0.03, 0.05, 0.22);
          vec3 midSky = vec3(0.28, 0.06, 0.42);
          vec3 horizonPink = vec3(0.86, 0.14, 0.56);
          vec3 horizonGold = vec3(1.0, 0.68, 0.22);

          vec3 col = mix(midSky, zenith, smoothstep(0.08, 0.52, y));
          col = mix(horizonPink, col, smoothstep(0.01, 0.24, y));

          // Glowing sunset core at horizon
          vec2 sunPos = vec2(uSunX, 0.045);
          float sunDist = length((vDir.xy - sunPos) * vec2(0.75, 1.8));
          float sunGlow = exp(-sunDist * 4.5);
          float sunDisc = smoothstep(0.09, 0.055, length(vDir.xy - vec2(uSunX, 0.06)));
          col += horizonGold * sunGlow * (0.85 + uEnergy * 0.25);
          col = mix(col, vec3(1.0, 0.92, 0.55), sunDisc * 0.9);

          // Milky-Way cosmic ribbon rising above horizon (matching screenshot 6)
          float bandCoord = vDir.x * 1.4 - vDir.y * 0.45 - 0.1;
          float milky = exp(-bandCoord * bandCoord * 18.0) * smoothstep(0.05, 0.35, y);
          float neb = noise(vDir.xy * 6.5 + vec2(0.0, uTime * 0.015));
          col += mix(vec3(0.75, 0.18, 0.92), vec3(0.12, 0.85, 0.98), neb) * milky * (0.45 + neb * 0.4);

          // Starfield in upper sky
          float starCell = hash(floor(vDir.xy * 190.0));
          float stars = step(0.994, starCell) * smoothstep(0.12, 0.45, y);
          col += vec3(0.85, 0.94, 1.0) * stars * (0.65 + 0.35 * sin(uTime * 2.5 + starCell * 40.0));

          // Sculpted sunset cloud silhouettes
          float c = noise(vec2(vDir.x * 3.8 + uTime * 0.008, vDir.y * 12.0));
          float cloudBand = smoothstep(0.46, 0.72, c) * smoothstep(0.0, 0.06, y) * smoothstep(0.28, 0.08, y);
          vec3 cloudCol = mix(vec3(0.08, 0.03, 0.16), vec3(0.55, 0.14, 0.45), sunGlow);
          col = mix(col, cloudCol, cloudBand * 0.72);

          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.group.add(new THREE.Mesh(geo, this.skyMat));
  }

  private buildBioluminescentOcean(quality: string): void {
    const segsX = quality === 'low' ? 48 : 84;
    const segsZ = quality === 'low' ? 48 : 84;
    const geo = new THREE.PlaneGeometry(180, 160, segsX, segsZ);
    geo.rotateX(-Math.PI / 2);

    this.oceanMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0.2 },
        uEnergy: { value: 0.25 },
        uBrightness: { value: 1.0 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uBass;
        varying vec3 vWorldPos;
        varying float vWaveCrest;

        void main() {
          vec3 pos = position;
          float w1 = sin(pos.z * 0.22 + uTime * 1.9 + pos.x * 0.08) * (0.28 + uBass * 0.24);
          float w2 = cos(pos.x * 0.18 - uTime * 1.35 + pos.z * 0.14) * 0.16;
          float roll = sin(pos.z * 0.45 + uTime * 2.6) * 0.08;
          pos.y += w1 + w2 + roll;
          vWaveCrest = clamp((w1 + w2 + 0.25) * 1.25, 0.0, 1.0);
          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uBass;
        uniform float uEnergy;
        uniform float uBrightness;
        varying vec3 vWorldPos;
        varying float vWaveCrest;

        void main() {
          vec3 deepWater = vec3(0.02, 0.05, 0.20);
          vec3 midWater = vec3(0.05, 0.16, 0.42);
          vec3 bioCyan = vec3(0.04, 0.88, 0.98);
          vec3 sunReflect = vec3(1.0, 0.58, 0.24);
          vec3 pinkReflect = vec3(0.88, 0.18, 0.62);

          float distFade = exp(-abs(vWorldPos.z + 15.0) * 0.011);
          vec3 col = mix(deepWater, midWater, vWaveCrest * 0.8);

          // Bioluminescent cyan crest foam flowing toward shoreline
          float foamRipple = sin(vWorldPos.z * 0.85 + uTime * 2.8 + sin(vWorldPos.x * 0.35) * 2.0);
          float bioMask = smoothstep(0.55, 0.95, vWaveCrest) * smoothstep(0.15, 0.85, foamRipple * 0.5 + 0.5);
          col += bioCyan * bioMask * (0.55 + uBass * 0.55) * distFade;

          // Center sunset water reflection shimmer path
          float sunPath = exp(-abs(vWorldPos.x) * 0.14);
          float sparkle = smoothstep(0.45, 0.98, sin(vWorldPos.z * 1.7 + uTime * 3.4) * cos(vWorldPos.x * 1.2 - uTime * 1.8));
          col += mix(pinkReflect, sunReflect, sunPath) * sunPath * (0.28 + sparkle * 0.48 + uEnergy * 0.22);

          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
    });

    const ocean = new THREE.Mesh(geo, this.oceanMat);
    ocean.position.set(0, -1.35, -56);
    this.group.add(ocean);
  }

  private buildWetShorelinesAndRocks(): void {
    // Organic curving sandy shorebanks flanking left & right sides (outside track x = ±3.5)
    const shoreGeo = new THREE.PlaneGeometry(34, 130, 24, 36);
    shoreGeo.rotateX(-Math.PI / 2);
    const pos = shoreGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const dune = Math.sin(z * 0.12) * 0.4 + Math.cos(x * 0.25 + z * 0.08) * 0.25;
      const slope = Math.max(0, (Math.abs(x) - 4.0) * 0.08);
      pos.setY(i, dune + slope);
    }
    shoreGeo.computeVertexNormals();

    this.shoreMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.25 },
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
        uniform float uBrightness;
        varying vec3 vWorldPos;
        void main() {
          float wetBand = smoothstep(14.0, 5.5, abs(vWorldPos.x));
          vec3 drySand = vec3(0.08, 0.04, 0.16);
          vec3 wetReflect = mix(vec3(0.45, 0.12, 0.42), vec3(0.05, 0.65, 0.85), 0.5 + 0.5 * sin(vWorldPos.z * 0.15 + uTime));
          vec3 col = mix(drySand, wetReflect * (0.45 + uEnergy * 0.35), wetBand * 0.65);
          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
    });

    [-21.5, 21.5].forEach((x) => {
      const shore = new THREE.Mesh(shoreGeo, this.shoreMat);
      shore.position.set(x, -1.42, -46);
      this.group.add(shore);
    });

    // Sculpted coastal basalt rock clusters
    const rockGeo = new THREE.IcosahedronGeometry(1.1, 1);
    const rPos = rockGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < rPos.count; i++) {
      const vx = rPos.getX(i);
      const vy = rPos.getY(i);
      const vz = rPos.getZ(i);
      const n = 0.78 + 0.35 * Math.sin(vx * 3.1 + vy * 2.7 + vz * 1.9);
      rPos.setXYZ(i, vx * n * 1.3, vy * n * 0.72, vz * n);
    }
    rockGeo.computeVertexNormals();

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x16112b,
      roughness: 0.75,
      metalness: 0.15,
    });

    for (let i = 0; i < 16; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(
        side * this.rng.range(6.8, 16.5),
        -1.18,
        this.rng.range(-78, -6),
      );
      rock.rotation.set(this.rng.range(0, 0.3), this.rng.range(0, Math.PI * 2), 0);
      rock.scale.setScalar(this.rng.range(0.65, 1.85));
      this.group.add(rock);
    }
  }

  private buildSculptedPalmGroves(): void {
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x1b122b,
      roughness: 0.85,
      metalness: 0.1,
    });
    const frondMat = new THREE.MeshStandardMaterial({
      color: 0x0d2138,
      emissive: 0x0c4a6e,
      emissiveIntensity: 0.25,
      roughness: 0.55,
      side: THREE.DoubleSide,
    });

    // Shared curved frond blade geometry (arched tapered leaf)
    const frondShape = new THREE.Shape();
    frondShape.moveTo(0, 0);
    frondShape.quadraticCurveTo(0.45, 1.2, 0.14, 2.85);
    frondShape.lineTo(0, 3.15);
    frondShape.lineTo(-0.14, 2.85);
    frondShape.quadraticCurveTo(-0.45, 1.2, 0, 0);
    const frondGeo = new THREE.ShapeGeometry(frondShape, 6);
    frondGeo.rotateX(Math.PI * 0.42);
    // Curve downward along length
    const fPos = frondGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fPos.count; i++) {
      const z = fPos.getZ(i);
      fPos.setY(i, fPos.getY(i) - z * z * 0.13);
    }
    frondGeo.computeVertexNormals();

    const palmCount = 18;
    for (let i = 0; i < palmCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const palm = new THREE.Group();

      const height = this.rng.range(6.2, 10.5);
      const lean = -side * this.rng.range(1.2, 2.4); // Lean organically over the water/track vista
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(lean * 0.3, height * 0.38, this.rng.range(-0.4, 0.4)),
        new THREE.Vector3(lean * 0.78, height * 0.76, 0),
        new THREE.Vector3(lean, height, 0),
      ]);
      const trunkGeo = new THREE.TubeGeometry(curve, 12, 0.16, 7, false);
      // Taper trunk from base to crown
      const tPos = trunkGeo.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < tPos.count; v++) {
        const yFrac = THREE.MathUtils.clamp(tPos.getY(v) / height, 0, 1);
        const center = curve.getPoint(yFrac);
        const taper = THREE.MathUtils.lerp(1.45, 0.55, yFrac);
        tPos.setX(v, center.x + (tPos.getX(v) - center.x) * taper);
        tPos.setZ(v, center.z + (tPos.getZ(v) - center.z) * taper);
      }
      trunkGeo.computeVertexNormals();

      const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
      palm.add(trunkMesh);

      const crown = new THREE.Group();
      crown.position.set(lean, height, 0);
      const fronds = 8;
      for (let f = 0; f < fronds; f++) {
        const frond = new THREE.Mesh(frondGeo, frondMat);
        frond.rotation.y = (f / fronds) * Math.PI * 2 + this.rng.range(-0.2, 0.2);
        frond.rotation.x = this.rng.range(-0.18, 0.22);
        frond.scale.setScalar(this.rng.range(0.85, 1.2));
        crown.add(frond);
      }
      palm.add(crown);

      palm.position.set(
        side * this.rng.range(7.2, 16.0),
        -1.35,
        -6 - i * 4.2 + this.rng.range(-1.2, 1.2),
      );
      this.group.add(palm);

      this.palms.push({
        group: palm,
        phase: this.rng.range(0, Math.PI * 2),
        baseRotZ: this.rng.range(-0.04, 0.04),
      });
    }
  }

  private buildTropicalFireflies(): void {
    const pos = new Float32Array(this.fireflyCount * 3);
    const cols = new Float32Array(this.fireflyCount * 3);
    const c1 = new THREE.Color('#22d3ee');
    const c2 = new THREE.Color('#fbbf24');
    const c3 = new THREE.Color('#f472b6');

    for (let i = 0; i < this.fireflyCount; i++) {
      pos[i * 3] = this.rng.range(-28, 28);
      pos[i * 3 + 1] = this.rng.range(-0.4, 9.5);
      pos[i * 3 + 2] = this.rng.range(-80, 6);
      const c = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    this.fireflyMat = new THREE.PointsMaterial({
      size: 0.26,
      map: createSoftGlowTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.fireflies = new THREE.Points(geo, this.fireflyMat);
    this.group.add(this.fireflies);
  }

  public setPalette(_palette: SongPalette): void {
    // Tropical Beach preserves its sunset & bioluminescent cyan coastal identity
  }

  public update(ctx: WorldUpdateContext): void {
    const {
      dt,
      elapsed,
      mode,
      bass,
      high,
      energy,
      inSilence,
      reactiveEnabled,
      visualIntensity,
      particleIntensity,
      brightness,
    } = ctx;

    const visMult = visualIntensity === 'low' ? 0.45 : visualIntensity === 'medium' ? 0.75 : 1.0;
    const partMult = particleIntensity === 'low' ? 0.35 : particleIntensity === 'medium' ? 0.68 : 0.95;
    const bright = THREE.MathUtils.clamp(brightness, 0.5, 1.35);
    const silenceDamp = inSilence ? 0.35 : 1.0;

    const effBass = reactiveEnabled ? bass * visMult * silenceDamp : 0.16;
    const effHigh = reactiveEnabled ? high * visMult * silenceDamp : 0.14;
    const effEnergy = reactiveEnabled ? energy * visMult * silenceDamp : 0.18;

    this.skyMat.uniforms.uTime.value = elapsed;
    this.skyMat.uniforms.uEnergy.value = effEnergy;
    this.skyMat.uniforms.uBrightness.value = bright;

    this.oceanMat.uniforms.uTime.value = elapsed;
    this.oceanMat.uniforms.uBass.value = effBass;
    this.oceanMat.uniforms.uEnergy.value = effEnergy;
    this.oceanMat.uniforms.uBrightness.value = bright;

    this.shoreMat.uniforms.uTime.value = elapsed;
    this.shoreMat.uniforms.uEnergy.value = effEnergy;
    this.shoreMat.uniforms.uBrightness.value = bright;

    // Gentle tropical breeze sway on palm trees
    const swayAmp = 0.032 + effBass * 0.028;
    for (const p of this.palms) {
      p.group.rotation.z = p.baseRotZ + Math.sin(elapsed * 1.2 + p.phase) * swayAmp;
    }

    // Drift glowing coastal mist & fireflies
    const activeRatio = particleIntensity === 'low' ? 0.32 : particleIntensity === 'medium' ? 0.65 : 1.0;
    const activeCount = Math.floor(this.fireflyCount * activeRatio);
    this.fireflies.geometry.setDrawRange(0, activeCount);
    this.fireflyMat.opacity = (0.34 + effHigh * 0.32) * partMult * bright;

    const pAttr = this.fireflies.geometry.attributes.position as THREE.BufferAttribute;
    const driftSpeed = mode === 'paused' ? 0 : 2.8 + effEnergy * 4.2;
    for (let i = 0; i < activeCount; i++) {
      let z = pAttr.getZ(i) + driftSpeed * dt;
      if (z > 8) z = -80;
      pAttr.setZ(i, z);
    }
    pAttr.needsUpdate = true;
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
