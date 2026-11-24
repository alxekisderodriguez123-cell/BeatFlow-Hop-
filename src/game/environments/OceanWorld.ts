import * as THREE from 'three';
import type { SongPalette } from '../../types/game';
import {
  addInkOutline,
  createCelToonGradientMap,
  createCrossStarTexture,
  createIllustratedMoonTexture,
  createStylizedCloudTexture,
} from './illustratedLayers';
import { SeededRng } from './seededRandom';
import { disposeObjectTree } from './sharedTextures';
import type { WorldAtmosphere, WorldBuildOptions, WorldInstance, WorldUpdateContext } from './types';

export class OceanWorld implements WorldInstance {
  public readonly theme = 'ocean' as const;
  public readonly group = new THREE.Group();
  public readonly atmosphere: WorldAtmosphere = {
    backgroundColor: 0x071535,
    fogColor: 0x0d2856,
    fogDensity: 0.008,
    hemiSkyColor: 0x38bdf8,
    hemiGroundColor: 0x081a38,
    dirLightColor: 0xbae6fd,
  };

  private rng: SeededRng;
  private toonGrad: THREE.DataTexture;
  private skyMat!: THREE.ShaderMaterial;
  private moonSprite!: THREE.Sprite;
  private cloudSprites: Array<{ sprite: THREE.Sprite; baseX: number }> = [];
  private waterMat!: THREE.ShaderMaterial;
  private lightShaftMats: THREE.MeshBasicMaterial[] = [];
  private bioParticles!: THREE.Points;
  private bioMat!: THREE.PointsMaterial;
  private bioCount = 260;
  private bioSpeeds: Float32Array;

  constructor(opts: WorldBuildOptions) {
    this.rng = new SeededRng(`${opts.seed}:ocean-illustrated`);
    this.toonGrad = createCelToonGradientMap();
    this.bioCount = opts.graphicsQuality === 'low' ? 110 : opts.graphicsQuality === 'medium' ? 185 : 260;
    this.bioSpeeds = new Float32Array(this.bioCount);

    this.buildIllustratedSeaSky();
    this.buildCelMoonAndMarineClouds();
    this.buildStylizedBioluminescentWaves(opts.graphicsQuality);
    this.buildInkOutlinedSeaStacks();
    this.buildMoonLightShafts();
    this.buildSparkleCurrents();
  }

  private buildIllustratedSeaSky(): void {
    const geo = new THREE.SphereGeometry(140, 32, 18);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.25 },
        uBass: { value: 0.2 },
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
        uniform float uBass;
        uniform float uBrightness;
        varying vec3 vDir;

        void main() {
          float y = clamp(vDir.y, -0.15, 1.0);
          vec3 zenith = vec3(0.025, 0.075, 0.24);
          vec3 midBlue = vec3(0.05, 0.24, 0.52);
          vec3 horizonAqua = vec3(0.14, 0.62, 0.84);

          vec3 col = mix(horizonAqua, midBlue, smoothstep(0.01, 0.26, y));
          col = mix(col, zenith, smoothstep(0.24, 0.68, y));

          float horizonGlow = exp(-abs(y - 0.04) * 9.0);
          col += vec3(0.18, 0.88, 0.96) * horizonGlow * (0.28 + uBass * 0.24 + uEnergy * 0.16);

          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.group.add(new THREE.Mesh(geo, this.skyMat));
  }

  private buildCelMoonAndMarineClouds(): void {
    const moonTex = createIllustratedMoonTexture('#e0f2fe', '#7dd3fc', 'rgba(56,189,248,0.45)');
    const moonMat = new THREE.SpriteMaterial({
      map: moonTex,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      fog: false,
    });
    this.moonSprite = new THREE.Sprite(moonMat);
    this.moonSprite.position.set(this.rng.range(-8, 8), 24, -94);
    this.moonSprite.scale.set(22, 22, 1);
    this.group.add(this.moonSprite);

    const cloudA = createStylizedCloudTexture('#14346b', '#67e8f9', '#08183b', false);
    const cloudB = createStylizedCloudTexture('#163872', '#a5f3fc', '#08183b', true);

    const placements = [
      { x: -34, y: 20, z: -84, w: 46, h: 16, tex: cloudA },
      { x: 34, y: 18, z: -82, w: 46, h: 16, tex: cloudB },
      { x: -16, y: 12, z: -78, w: 32, h: 12, tex: cloudB },
      { x: 18, y: 13, z: -76, w: 32, h: 12, tex: cloudA },
    ];
    for (const c of placements) {
      const mat = new THREE.SpriteMaterial({
        map: c.tex,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
        fog: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(c.x, c.y, c.z);
      sp.scale.set(c.w, c.h, 1);
      this.group.add(sp);
      this.cloudSprites.push({ sprite: sp, baseX: c.x });
    }
  }

  private buildStylizedBioluminescentWaves(quality: string): void {
    const segs = quality === 'low' ? 42 : 68;
    const geo = new THREE.PlaneGeometry(190, 175, segs, segs);
    geo.rotateX(-Math.PI / 2);

    this.waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0.2 },
        uKick: { value: 0 },
        uEnergy: { value: 0.25 },
        uBrightness: { value: 1.0 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uBass;
        varying vec3 vWorldPos;
        varying float vHeight;

        void main() {
          vec3 pos = position;
          float w1 = sin(pos.z * 0.21 + uTime * 1.7) * (0.34 + uBass * 0.24);
          float w2 = cos(pos.x * 0.24 - uTime * 1.2) * 0.2;
          float h = w1 + w2;
          pos.y += h;
          vHeight = h;
          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uBass;
        uniform float uKick;
        uniform float uEnergy;
        uniform float uBrightness;
        varying vec3 vWorldPos;
        varying float vHeight;

        void main() {
          float distFade = exp(-abs(vWorldPos.z + 18.0) * 0.0095);
          vec3 deepSea = vec3(0.03, 0.11, 0.3);
          vec3 celWave = vec3(0.06, 0.34, 0.64);
          vec3 bioCyan = vec3(0.18, 0.94, 1.0);

          float band = smoothstep(-0.15, 0.42, vHeight);
          vec3 col = mix(deepSea, celWave, step(0.45, band) * 0.65 + band * 0.35);

          float crest = step(0.68, sin(vWorldPos.z * 0.65 + uTime * 2.2 + sin(vWorldPos.x * 0.3) * 1.8) * 0.5 + 0.5);
          col += bioCyan * crest * (0.42 + uKick * 0.45 + uBass * 0.28) * distFade;

          float moonPath = exp(-abs(vWorldPos.x) * 0.14);
          float sparkle = step(0.5, sin(vWorldPos.z * 2.2 + uTime * 3.0) * cos(vWorldPos.x * 1.1));
          col += vec3(0.65, 0.95, 1.0) * moonPath * (0.24 + sparkle * 0.38 + uEnergy * 0.16);

          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
    });

    const water = new THREE.Mesh(geo, this.waterMat);
    water.position.set(0, -1.28, -58);
    this.group.add(water);
  }

  private buildInkOutlinedSeaStacks(): void {
    const stackGeo = new THREE.ConeGeometry(3.1, 8.6, 7, 2);
    const rockMat = new THREE.MeshToonMaterial({
      color: 0x0f274d,
      emissive: 0x083358,
      emissiveIntensity: 0.25,
      gradientMap: this.toonGrad,
    });

    for (let i = 0; i < 8; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const stack = new THREE.Mesh(stackGeo, rockMat);
      stack.position.set(side * this.rng.range(15, 36), -1.8, -18 - i * 9.5);
      stack.scale.set(this.rng.range(0.9, 1.9), this.rng.range(0.65, 1.4), this.rng.range(0.9, 1.7));
      stack.rotation.y = this.rng.range(0, Math.PI * 2);
      addInkOutline(stack, 0x040d21, 1.05);
      this.group.add(stack);
    }
  }

  private buildMoonLightShafts(): void {
    const geo = new THREE.CylinderGeometry(0.45, 3.8, 26, 10, 1, true);
    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x22d3ee : 0x7dd3fc,
        transparent: true,
        opacity: 0.05,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.lightShaftMats.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(side * this.rng.range(10, 22), 9.5, -28 - i * 13);
      mesh.rotation.z = side * -0.12;
      this.group.add(mesh);
    }
  }

  private buildSparkleCurrents(): void {
    const pos = new Float32Array(this.bioCount * 3);
    const cols = new Float32Array(this.bioCount * 3);
    const c1 = new THREE.Color('#22d3ee');
    const c2 = new THREE.Color('#a5f3fc');
    const c3 = new THREE.Color('#ffffff');

    for (let i = 0; i < this.bioCount; i++) {
      pos[i * 3] = this.rng.range(-32, 32);
      pos[i * 3 + 1] = i < this.bioCount * 0.55 ? this.rng.range(-1.0, 1.4) : this.rng.range(2.0, 22.0);
      pos[i * 3 + 2] = this.rng.range(-88, 6);
      this.bioSpeeds[i] = this.rng.range(3.0, 8.2);
      const c = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    this.bioMat = new THREE.PointsMaterial({
      size: 0.36,
      map: createCrossStarTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.bioParticles = new THREE.Points(geo, this.bioMat);
    this.group.add(this.bioParticles);
  }

  public setPalette(_palette: SongPalette): void {
    // Ocean World maintains its stylized cobalt & bioluminescent cyan palette
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
      inSilence,
      reactiveEnabled,
      visualIntensity,
      particleIntensity,
      graphicsQuality,
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
    const effSnare = reactiveEnabled ? snarePulse * visMult * silenceDamp : 0;
    const effHihat = reactiveEnabled ? hihatPulse * visMult * silenceDamp : 0;

    this.skyMat.uniforms.uTime.value = elapsed;
    this.skyMat.uniforms.uEnergy.value = effEnergy;
    this.skyMat.uniforms.uBass.value = effBass;
    this.skyMat.uniforms.uBrightness.value = bright;

    for (const c of this.cloudSprites) {
      c.sprite.position.x = c.baseX + Math.sin(elapsed * 0.08 + c.baseX) * 2.0;
    }

    this.waterMat.uniforms.uTime.value = elapsed;
    this.waterMat.uniforms.uBass.value = effBass;
    this.waterMat.uniforms.uKick.value = effKick;
    this.waterMat.uniforms.uEnergy.value = effEnergy;
    this.waterMat.uniforms.uBrightness.value = bright;

    const showShafts = graphicsQuality !== 'low';
    this.lightShaftMats.forEach((m, i) => {
      m.opacity = showShafts ? (0.03 + (i % 2 === 0 ? effBass : effSnare) * 0.05) * bright : 0;
    });

    const activeRatio = particleIntensity === 'low' ? 0.34 : particleIntensity === 'medium' ? 0.68 : 1.0;
    const activeCount = Math.floor(this.bioCount * activeRatio);
    this.bioParticles.geometry.setDrawRange(0, activeCount);
    this.bioMat.opacity = Math.min(0.92, (0.48 + effHigh * 0.25 + effHihat * 0.24) * partMult * bright);

    const pAttr = this.bioParticles.geometry.attributes.position as THREE.BufferAttribute;
    const speedMult = mode === 'paused' ? 0 : 0.65 + effEnergy * 0.85;
    for (let i = 0; i < activeCount; i++) {
      let z = pAttr.getZ(i) + this.bioSpeeds[i] * speedMult * dt;
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
