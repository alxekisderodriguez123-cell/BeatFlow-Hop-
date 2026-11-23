import * as THREE from 'three';
import type { SongPalette } from '../../types/game';
import { SeededRng } from './seededRandom';
import { createSoftGlowTexture, disposeObjectTree } from './sharedTextures';
import type { WorldAtmosphere, WorldBuildOptions, WorldInstance, WorldUpdateContext } from './types';

export class OceanWorld implements WorldInstance {
  public readonly theme = 'ocean' as const;
  public readonly group = new THREE.Group();
  public readonly atmosphere: WorldAtmosphere = {
    backgroundColor: 0x030c1f,
    fogColor: 0x051833,
    fogDensity: 0.0105,
    hemiSkyColor: 0x38bdf8,
    hemiGroundColor: 0x041126,
    dirLightColor: 0xbae6fd,
  };

  private rng: SeededRng;
  private skyMat!: THREE.ShaderMaterial;
  private waterMat!: THREE.ShaderMaterial;
  private lightShaftMats: THREE.MeshBasicMaterial[] = [];
  private bioParticles!: THREE.Points;
  private bioMat!: THREE.PointsMaterial;
  private bioCount = 340;
  private bioSpeeds: Float32Array;

  constructor(opts: WorldBuildOptions) {
    this.rng = new SeededRng(`${opts.seed}:ocean`);
    this.bioSpeeds = new Float32Array(this.bioCount);

    this.buildAbyssalSkyDome();
    this.buildDynamicOceanSurface(opts.graphicsQuality);
    this.buildSeaStacksAndReefSilhouettes();
    this.buildVolumetricLightShafts();
    this.buildBioluminescentCurrents();
  }

  private buildAbyssalSkyDome(): void {
    const geo = new THREE.SphereGeometry(135, 32, 18);
    const horizonShift = this.rng.range(-0.04, 0.06);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.25 },
        uBrightness: { value: 1.0 },
        uShift: { value: horizonShift },
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
        uniform float uShift;
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
          vec3 deepNight = vec3(0.015, 0.045, 0.14);
          vec3 horizonTeal = vec3(0.04, 0.36 + uShift, 0.58);
          vec3 col = mix(horizonTeal, deepNight, smoothstep(0.02, 0.52, y));

          // Distant horizon marine clouds
          float c = noise(vec2(vDir.x * 3.4 + uTime * 0.01, vDir.y * 9.5));
          float cloudMask = smoothstep(0.45, 0.76, c) * smoothstep(0.0, 0.06, y) * smoothstep(0.28, 0.08, y);
          col = mix(col, vec3(0.02, 0.12, 0.24), cloudMask * 0.65);

          // Crisp stars above ocean horizon
          float starCell = hash(floor(vDir.xy * 185.0));
          float stars = step(0.993, starCell) * smoothstep(0.14, 0.45, y);
          col += vec3(0.75, 0.94, 1.0) * stars * (0.6 + 0.4 * sin(uTime * 2.2 + starCell * 50.0));

          // Subtle turquoise aurora mist near horizon
          float mist = exp(-abs(y - 0.06) * 11.0);
          col += vec3(0.04, 0.65, 0.85) * mist * (0.28 + uEnergy * 0.25);

          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.group.add(new THREE.Mesh(geo, this.skyMat));
  }

  private buildDynamicOceanSurface(quality: string): void {
    const segs = quality === 'low' ? 56 : quality === 'medium' ? 88 : 112;
    const geo = new THREE.PlaneGeometry(190, 175, segs, segs);
    geo.rotateX(-Math.PI / 2);

    this.waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0.2 },
        uMid: { value: 0.2 },
        uEnergy: { value: 0.25 },
        uBrightness: { value: 1.0 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uBass;
        varying vec3 vWorldPos;
        varying float vHeight;
        varying float vSlope;

        void main() {
          vec3 pos = position;
          float w1 = sin(pos.z * 0.19 + uTime * 1.65 + pos.x * 0.09) * (0.38 + uBass * 0.28);
          float w2 = cos(pos.x * 0.23 - uTime * 1.25 + pos.z * 0.12) * 0.24;
          float w3 = sin((pos.x + pos.z) * 0.35 + uTime * 2.3) * 0.11;
          float h = w1 + w2 + w3;
          pos.y += h;
          vHeight = h;
          vSlope = abs(cos(pos.z * 0.19 + uTime * 1.65 + pos.x * 0.09)) + abs(sin(pos.x * 0.23 - uTime * 1.25));
          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uBass;
        uniform float uMid;
        uniform float uEnergy;
        uniform float uBrightness;
        varying vec3 vWorldPos;
        varying float vHeight;
        varying float vSlope;

        void main() {
          float distFade = exp(-abs(vWorldPos.z + 18.0) * 0.01);
          vec3 abyss = vec3(0.012, 0.045, 0.13);
          vec3 swell = vec3(0.03, 0.18, 0.38);
          vec3 bio = vec3(0.04, 0.85, 1.0);
          vec3 deepTeal = vec3(0.02, 0.55, 0.72);

          float crest = smoothstep(-0.2, 0.48, vHeight);
          vec3 col = mix(abyss, swell, crest);

          // Flowing bioluminescent plankton veins across wave ridges (matching screenshot 1)
          float vein = sin(vWorldPos.x * 0.42 + sin(vWorldPos.z * 0.22 + uTime * 0.9) * 2.4);
          float veinSpark = smoothstep(0.62, 0.98, vein * 0.5 + 0.5) * smoothstep(0.15, 0.65, crest);
          float microFoam = smoothstep(0.68, 0.99, sin(vWorldPos.x * 1.5 - uTime * 2.1) * cos(vWorldPos.z * 1.4 + uTime * 1.7));

          col += bio * veinSpark * (0.62 + uBass * 0.55) * distFade;
          col += deepTeal * microFoam * 0.35 * (0.7 + uMid * 0.4) * distFade;
          col += vec3(0.04, 0.32, 0.52) * clamp(vSlope * 0.18, 0.0, 0.35) * (0.7 + uEnergy * 0.3);

          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
    });

    const water = new THREE.Mesh(geo, this.waterMat);
    water.position.set(0, -1.25, -58);
    this.group.add(water);
  }

  private buildSeaStacksAndReefSilhouettes(): void {
    // Distant volcanic sea stacks & submerged reef silhouettes framing deep ocean vistas
    const stackGeo = new THREE.ConeGeometry(3.2, 8.5, 7, 3);
    const pos = stackGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const crag = 0.78 + 0.34 * Math.sin(vx * 1.7 + vy * 0.9 + vz * 2.1);
      pos.setXYZ(i, vx * crag, vy, vz * crag);
    }
    stackGeo.computeVertexNormals();

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x071529,
      emissive: 0x063552,
      emissiveIntensity: 0.28,
      roughness: 0.78,
      metalness: 0.2,
    });

    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const stack = new THREE.Mesh(stackGeo, rockMat);
      stack.position.set(
        side * this.rng.range(16, 42),
        -2.0,
        this.rng.range(-95, -24),
      );
      stack.scale.set(
        this.rng.range(0.9, 2.2),
        this.rng.range(0.65, 1.5),
        this.rng.range(0.9, 2.0),
      );
      stack.rotation.y = this.rng.range(0, Math.PI * 2);
      this.group.add(stack);
    }
  }

  private buildVolumetricLightShafts(): void {
    const geo = new THREE.CylinderGeometry(0.4, 3.6, 26, 12, 1, true);
    for (let i = 0; i < 5; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x06b6d4 : 0x38bdf8,
        transparent: true,
        opacity: 0.04,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.lightShaftMats.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(side * this.rng.range(9, 22), 9.5, -28 - i * 12);
      mesh.rotation.z = side * this.rng.range(-0.18, -0.06);
      this.group.add(mesh);
    }
  }

  private buildBioluminescentCurrents(): void {
    const pos = new Float32Array(this.bioCount * 3);
    const cols = new Float32Array(this.bioCount * 3);
    const c1 = new THREE.Color('#22d3ee');
    const c2 = new THREE.Color('#38bdf8');
    const c3 = new THREE.Color('#a5f3fc');

    for (let i = 0; i < this.bioCount; i++) {
      pos[i * 3] = this.rng.range(-30, 30);
      // Concentrate bioluminescent motes skimming the waves and drifting upward
      pos[i * 3 + 1] = i < 200 ? this.rng.range(-1.1, 0.8) : this.rng.range(0.8, 12.0);
      pos[i * 3 + 2] = this.rng.range(-88, 6);
      this.bioSpeeds[i] = this.rng.range(3.5, 9.5);
      const c = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    this.bioMat = new THREE.PointsMaterial({
      size: 0.28,
      map: createSoftGlowTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.bioParticles = new THREE.Points(geo, this.bioMat);
    this.group.add(this.bioParticles);
  }

  public setPalette(_palette: SongPalette): void {
    // Ocean World keeps its cohesive deep sea & bioluminescent cyan palette
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
      graphicsQuality,
      brightness,
    } = ctx;

    const visMult = visualIntensity === 'low' ? 0.45 : visualIntensity === 'medium' ? 0.75 : 1.0;
    const partMult = particleIntensity === 'low' ? 0.35 : particleIntensity === 'medium' ? 0.68 : 0.96;
    const bright = THREE.MathUtils.clamp(brightness, 0.5, 1.35);
    const silenceDamp = inSilence ? 0.35 : 1.0;

    const effBass = reactiveEnabled ? bass * visMult * silenceDamp : 0.16;
    const effMid = reactiveEnabled ? mid * visMult * silenceDamp : 0.14;
    const effHigh = reactiveEnabled ? high * visMult * silenceDamp : 0.12;
    const effEnergy = reactiveEnabled ? energy * visMult * silenceDamp : 0.18;

    this.skyMat.uniforms.uTime.value = elapsed;
    this.skyMat.uniforms.uEnergy.value = effEnergy;
    this.skyMat.uniforms.uBrightness.value = bright;

    this.waterMat.uniforms.uTime.value = elapsed;
    this.waterMat.uniforms.uBass.value = effBass;
    this.waterMat.uniforms.uMid.value = effMid;
    this.waterMat.uniforms.uEnergy.value = effEnergy;
    this.waterMat.uniforms.uBrightness.value = bright;

    const showShafts = graphicsQuality !== 'low';
    this.lightShaftMats.forEach((m, i) => {
      m.opacity = showShafts ? (0.024 + (i % 2 === 0 ? effBass : effMid) * 0.045) * bright : 0;
    });

    const activeRatio = particleIntensity === 'low' ? 0.34 : particleIntensity === 'medium' ? 0.68 : 1.0;
    const activeCount = Math.floor(this.bioCount * activeRatio);
    this.bioParticles.geometry.setDrawRange(0, activeCount);
    this.bioMat.opacity = (0.38 + effHigh * 0.35) * partMult * bright;

    const pAttr = this.bioParticles.geometry.attributes.position as THREE.BufferAttribute;
    const speedMult = mode === 'paused' ? 0 : 0.65 + effEnergy * 0.9;
    for (let i = 0; i < activeCount; i++) {
      let z = pAttr.getZ(i) + this.bioSpeeds[i] * speedMult * dt;
      if (z > 8) z = -88;
      pAttr.setZ(i, z);
    }
    pAttr.needsUpdate = true;
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
