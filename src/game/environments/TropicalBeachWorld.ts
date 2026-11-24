import * as THREE from 'three';
import type { SongPalette } from '../../types/game';
import {
  addInkOutline,
  createCelToonGradientMap,
  createCrossStarTexture,
  createIllustratedPalmShoreTexture,
  createIllustratedSunTexture,
  createStylizedCloudTexture,
} from './illustratedLayers';
import { SeededRng } from './seededRandom';
import { disposeObjectTree } from './sharedTextures';
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
    backgroundColor: 0x160e38,
    fogColor: 0x3b1f62,
    fogDensity: 0.0072,
    hemiSkyColor: 0xf472b6,
    hemiGroundColor: 0x1e1b4b,
    dirLightColor: 0xfde68a,
  };

  private rng: SeededRng;
  private skyMat!: THREE.ShaderMaterial;
  private sunSprite!: THREE.Sprite;
  private sunMat!: THREE.SpriteMaterial;
  private cloudSprites: Array<{ sprite: THREE.Sprite; baseX: number; speed: number }> = [];
  private oceanMat!: THREE.ShaderMaterial;
  private shoreMat!: THREE.ShaderMaterial;
  private palms: PalmEntry[] = [];
  private starPoints!: THREE.Points;
  private starMat!: THREE.PointsMaterial;
  private starCount = 220;
  private toonGrad: THREE.DataTexture;

  constructor(opts: WorldBuildOptions) {
    this.rng = new SeededRng(`${opts.seed}:tropical-illustrated`);
    this.toonGrad = createCelToonGradientMap();
    this.starCount = opts.graphicsQuality === 'low' ? 95 : opts.graphicsQuality === 'medium' ? 160 : 220;

    this.buildIllustratedTwilightSky();
    this.buildSunsetOrbAndStylizedClouds();
    this.buildBioluminescentSeaAndCoves(opts.graphicsQuality);
    this.buildIllustratedParallaxPalmSilhouettes(opts.maxAnisotropy);
    this.buildCelOutlinedHeroPalms(opts.graphicsQuality);
    this.buildTwilightSparkles();
  }

  private buildIllustratedTwilightSky(): void {
    const geo = new THREE.SphereGeometry(142, 32, 20);
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
        uniform float uTime;
        uniform float uEnergy;
        uniform float uBass;
        uniform float uBrightness;
        varying vec3 vDir;

        void main() {
          float y = clamp(vDir.y, -0.15, 1.0);
          vec3 zenith = vec3(0.08, 0.12, 0.36);
          vec3 upperViolet = vec3(0.24, 0.19, 0.56);
          vec3 midRose = vec3(0.64, 0.28, 0.62);
          vec3 horizonPeach = vec3(0.98, 0.62, 0.38);

          vec3 col = mix(horizonPeach, midRose, smoothstep(0.01, 0.16, y));
          col = mix(col, upperViolet, smoothstep(0.14, 0.36, y));
          col = mix(col, zenith, smoothstep(0.32, 0.68, y));

          // Radiant sun glow behind central track vanishing point
          float glowDist = length((vDir.xy - vec2(0.0, 0.055)) * vec2(0.62, 1.45));
          float halo = exp(-glowDist * 4.2);
          col += vec3(1.0, 0.85, 0.52) * halo * (0.48 + uBass * 0.24 + uEnergy * 0.18);

          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.group.add(new THREE.Mesh(geo, this.skyMat));
  }

  private buildSunsetOrbAndStylizedClouds(): void {
    const sunTex = createIllustratedSunTexture('#fffbeb', '#fde047', '#fb7185', false);
    this.sunMat = new THREE.SpriteMaterial({
      map: sunTex,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      fog: false,
    });
    this.sunSprite = new THREE.Sprite(this.sunMat);
    this.sunSprite.position.set(0, 6.2, -92);
    this.sunSprite.scale.set(28, 28, 1);
    this.group.add(this.sunSprite);

    const cloudLeftTex = createStylizedCloudTexture('#50317d', '#f9a8d4', '#231347', false);
    const cloudRightTex = createStylizedCloudTexture('#4c2d76', '#fdba74', '#231347', true);

    const cloudPlacements = [
      { x: -34, y: 27, z: -86, w: 46, h: 17, tex: cloudLeftTex, speed: 0.25 },
      { x: 35, y: 24, z: -84, w: 48, h: 18, tex: cloudRightTex, speed: -0.22 },
      { x: -22, y: 17, z: -78, w: 34, h: 13, tex: cloudRightTex, speed: 0.16 },
      { x: 24, y: 16, z: -76, w: 34, h: 13, tex: cloudLeftTex, speed: -0.18 },
      { x: 0, y: 34, z: -96, w: 54, h: 18, tex: cloudLeftTex, speed: 0.1 },
    ];

    for (const c of cloudPlacements) {
      const mat = new THREE.SpriteMaterial({
        map: c.tex,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        fog: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(c.x, c.y, c.z);
      sp.scale.set(c.w, c.h, 1);
      this.group.add(sp);
      this.cloudSprites.push({ sprite: sp, baseX: c.x, speed: c.speed });
    }
  }

  private buildBioluminescentSeaAndCoves(quality: string): void {
    const segs = quality === 'low' ? 38 : 64;
    const geo = new THREE.PlaneGeometry(190, 165, segs, segs);
    geo.rotateX(-Math.PI / 2);

    this.oceanMat = new THREE.ShaderMaterial({
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
        varying float vWaveCrest;

        void main() {
          vec3 pos = position;
          float w1 = sin(pos.z * 0.24 + uTime * 1.8) * (0.2 + uBass * 0.18);
          float w2 = cos(pos.x * 0.2 - uTime * 1.2) * 0.12;
          pos.y += w1 + w2;
          vWaveCrest = clamp((w1 + w2 + 0.22) * 1.4, 0.0, 1.0);
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
        varying float vWaveCrest;

        void main() {
          vec3 deepIndigo = vec3(0.16, 0.16, 0.45);
          vec3 twilightCyan = vec3(0.18, 0.56, 0.84);
          vec3 sunsetGold = vec3(1.0, 0.72, 0.42);
          vec3 lavenderFoam = vec3(0.75, 0.52, 0.96);

          float distFade = exp(-abs(vWorldPos.z + 18.0) * 0.0095);
          vec3 col = mix(deepIndigo, twilightCyan, vWaveCrest * 0.65);

          // Crisp stylized ripple bands (illustrated cel bands)
          float bandWave = sin(vWorldPos.z * 0.9 + uTime * 2.2 + sin(vWorldPos.x * 0.25) * 1.6);
          float celFoam = step(0.66, bandWave * 0.5 + 0.5);
          col += lavenderFoam * celFoam * (0.34 + uKick * 0.35 + uBass * 0.22) * distFade;

          // Center warm golden sunset reflection path on water
          float sunPath = exp(-abs(vWorldPos.x) * 0.11);
          float shimmer = step(0.45, sin(vWorldPos.z * 2.0 + uTime * 3.1) * cos(vWorldPos.x * 0.85));
          col += sunsetGold * sunPath * (0.38 + shimmer * 0.44 + uEnergy * 0.2);

          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
    });

    const ocean = new THREE.Mesh(geo, this.oceanMat);
    ocean.position.set(0, -1.35, -56);
    this.group.add(ocean);

    // Stylized inked coastal coves left & right
    const shoreGeo = new THREE.PlaneGeometry(36, 130, 18, 28);
    shoreGeo.rotateX(-Math.PI / 2);
    const pos = shoreGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const curveCoast = Math.sin(z * 0.11) * 0.45 + Math.cos(x * 0.22) * 0.22;
      const elevation = Math.max(0, (Math.abs(x) - 5.2) * 0.09);
      pos.setY(i, curveCoast + elevation);
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
          float shoreLine = smoothstep(14.0, 7.2, abs(vWorldPos.x) + sin(vWorldPos.z * 0.18) * 1.4);
          float foamLine = smoothstep(0.18, 0.0, abs(abs(vWorldPos.x) + sin(vWorldPos.z * 0.18) * 1.4 - 9.2));
          vec3 sandCol = vec3(0.24, 0.15, 0.42);
          vec3 wetSand = vec3(0.36, 0.28, 0.65);
          vec3 col = mix(sandCol, wetSand, shoreLine * 0.72);
          col += vec3(0.55, 0.92, 1.0) * foamLine * (0.55 + uEnergy * 0.35);
          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
    });

    [-23, 23].forEach((x) => {
      const shore = new THREE.Mesh(shoreGeo, this.shoreMat);
      shore.position.set(x, -1.42, -46);
      this.group.add(shore);
    });
  }

  private buildIllustratedParallaxPalmSilhouettes(anisotropy: number): void {
    const texLeft = createIllustratedPalmShoreTexture(this.rng, anisotropy, {
      silhouetteHex: '#25174a',
      rimHex: '#f472b6',
      inkHex: '#0d0720',
      leanRight: true,
    });
    const texRight = createIllustratedPalmShoreTexture(this.rng, anisotropy, {
      silhouetteHex: '#25174a',
      rimHex: '#fbbf24',
      inkHex: '#0d0720',
      leanRight: false,
    });

    const leftMat = new THREE.MeshBasicMaterial({
      map: texLeft,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const rightMat = new THREE.MeshBasicMaterial({
      map: texRight,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const panels = [
      { x: -18, y: 4.5, z: -64, w: 30, h: 15, mat: leftMat, rotY: 0.14 },
      { x: 18, y: 4.5, z: -64, w: 30, h: 15, mat: rightMat, rotY: -0.14 },
      { x: -24, y: 5.5, z: -44, w: 28, h: 14, mat: leftMat, rotY: 0.25 },
      { x: 24, y: 5.5, z: -44, w: 28, h: 14, mat: rightMat, rotY: -0.25 },
    ];
    for (const p of panels) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), p.mat);
      m.position.set(p.x, p.y, p.z);
      m.rotation.y = p.rotY;
      this.group.add(m);
    }
  }

  private buildCelOutlinedHeroPalms(quality: string): void {
    const trunkMat = new THREE.MeshToonMaterial({
      color: 0x2c1b4e,
      gradientMap: this.toonGrad,
    });
    const frondMat = new THREE.MeshToonMaterial({
      color: 0x3b2366,
      emissive: 0x86198f,
      emissiveIntensity: 0.22,
      gradientMap: this.toonGrad,
      side: THREE.DoubleSide,
    });
    const rockMat = new THREE.MeshToonMaterial({
      color: 0x261a48,
      gradientMap: this.toonGrad,
    });

    // Stylized inked coastal rocks
    const rockGeo = new THREE.IcosahedronGeometry(1.0, 0);
    for (let i = 0; i < 8; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(side * this.rng.range(7.2, 14.5), -1.15, -8 - i * 6.5);
      rock.scale.set(this.rng.range(0.9, 1.8), this.rng.range(0.55, 1.0), this.rng.range(0.9, 1.5));
      addInkOutline(rock, 0x0b061d, 1.06);
      this.group.add(rock);
    }

    // Shared curved stylized palm frond blade
    const frondShape = new THREE.Shape();
    frondShape.moveTo(0, 0);
    frondShape.quadraticCurveTo(0.48, 1.25, 0.14, 2.9);
    frondShape.lineTo(0, 3.25);
    frondShape.lineTo(-0.14, 2.9);
    frondShape.quadraticCurveTo(-0.48, 1.25, 0, 0);
    const frondGeo = new THREE.ShapeGeometry(frondShape, 5);
    frondGeo.rotateX(Math.PI * 0.42);
    const fPos = frondGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fPos.count; i++) {
      const z = fPos.getZ(i);
      fPos.setY(i, fPos.getY(i) - z * z * 0.12);
    }
    frondGeo.computeVertexNormals();

    const palmCount = quality === 'low' ? 6 : 10;
    for (let i = 0; i < palmCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const palm = new THREE.Group();
      const height = this.rng.range(6.4, 9.6);
      const lean = -side * this.rng.range(1.2, 2.3);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(lean * 0.3, height * 0.38, 0),
        new THREE.Vector3(lean * 0.78, height * 0.76, 0),
        new THREE.Vector3(lean, height, 0),
      ]);
      const trunkGeo = new THREE.TubeGeometry(curve, 10, 0.15, 6, false);
      const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
      addInkOutline(trunkMesh, 0x0b061d, 1.12);
      palm.add(trunkMesh);

      const crown = new THREE.Group();
      crown.position.set(lean, height, 0);
      const fronds = 7;
      for (let f = 0; f < fronds; f++) {
        const frond = new THREE.Mesh(frondGeo, frondMat);
        frond.rotation.y = (f / fronds) * Math.PI * 2 + this.rng.range(-0.15, 0.15);
        frond.rotation.x = this.rng.range(-0.14, 0.18);
        frond.scale.setScalar(this.rng.range(0.88, 1.18));
        crown.add(frond);
      }
      palm.add(crown);

      palm.position.set(side * this.rng.range(7.6, 13.8), -1.35, -7 - i * 5.2);
      this.group.add(palm);

      this.palms.push({
        group: palm,
        phase: this.rng.range(0, Math.PI * 2),
        baseRotZ: this.rng.range(-0.04, 0.04),
      });
    }
  }

  private buildTwilightSparkles(): void {
    const pos = new Float32Array(this.starCount * 3);
    const cols = new Float32Array(this.starCount * 3);
    const c1 = new THREE.Color('#ffffff');
    const c2 = new THREE.Color('#fde68a');
    const c3 = new THREE.Color('#a5f3fc');

    for (let i = 0; i < this.starCount; i++) {
      const highSky = i < this.starCount * 0.65;
      pos[i * 3] = this.rng.range(-48, 48);
      pos[i * 3 + 1] = highSky ? this.rng.range(10, 36) : this.rng.range(0.5, 9);
      pos[i * 3 + 2] = this.rng.range(-88, 4);
      const c = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    this.starMat = new THREE.PointsMaterial({
      size: 0.42,
      map: createCrossStarTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.starPoints = new THREE.Points(geo, this.starMat);
    this.group.add(this.starPoints);
  }

  public setPalette(_palette: SongPalette): void {
    // Tropical Beach preserves its vibrant twilight sunset illustrated palette
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
    const partMult = particleIntensity === 'low' ? 0.38 : particleIntensity === 'medium' ? 0.7 : 1.0;
    const bright = THREE.MathUtils.clamp(brightness, 0.5, 1.35);
    const silenceDamp = inSilence ? 0.35 : 1.0;

    const effBass = reactiveEnabled ? bass * visMult * silenceDamp : 0.16;
    const effHigh = reactiveEnabled ? high * visMult * silenceDamp : 0.14;
    const effEnergy = reactiveEnabled ? energy * visMult * silenceDamp : 0.18;
    const effKick = reactiveEnabled ? kickPulse * visMult * silenceDamp : 0;
    const effHihat = reactiveEnabled ? hihatPulse * visMult * silenceDamp : 0;

    this.skyMat.uniforms.uTime.value = elapsed;
    this.skyMat.uniforms.uEnergy.value = effEnergy;
    this.skyMat.uniforms.uBass.value = effBass;
    this.skyMat.uniforms.uBrightness.value = bright;

    // Gentle sunset solar breathing synced cleanly to Kick/Bass
    const sunScale = 27.5 + effBass * 2.2 + effKick * 2.0;
    this.sunSprite.scale.set(sunScale, sunScale, 1);
    this.sunMat.opacity = Math.min(1, (0.9 + effBass * 0.1) * bright);

    // Slow illustrated cloud drift
    for (const c of this.cloudSprites) {
      c.sprite.position.x = c.baseX + Math.sin(elapsed * 0.08 + c.baseX) * 2.4;
    }

    this.oceanMat.uniforms.uTime.value = elapsed;
    this.oceanMat.uniforms.uBass.value = effBass;
    this.oceanMat.uniforms.uKick.value = effKick;
    this.oceanMat.uniforms.uEnergy.value = effEnergy;
    this.oceanMat.uniforms.uBrightness.value = bright;

    this.shoreMat.uniforms.uTime.value = elapsed;
    this.shoreMat.uniforms.uEnergy.value = effEnergy;
    this.shoreMat.uniforms.uBrightness.value = bright;

    // Gentle tropical breeze sway on cel-shaded palms
    const swayAmp = 0.03 + effBass * 0.024 + effKick * 0.014;
    for (const p of this.palms) {
      p.group.rotation.z = p.baseRotZ + Math.sin(elapsed * 1.15 + p.phase) * swayAmp;
    }

    // Crisp twinkling stars & water sparkles (subtle hihat glint boost)
    const activeRatio = particleIntensity === 'low' ? 0.34 : particleIntensity === 'medium' ? 0.68 : 1.0;
    const activeCount = Math.floor(this.starCount * activeRatio);
    this.starPoints.geometry.setDrawRange(0, activeCount);
    this.starMat.opacity = Math.min(0.95, (0.55 + effHigh * 0.25 + effHihat * 0.25) * partMult * bright);

    const pAttr = this.starPoints.geometry.attributes.position as THREE.BufferAttribute;
    const driftSpeed = mode === 'paused' ? 0 : 1.8 + effEnergy * 3.0;
    for (let i = 0; i < activeCount; i++) {
      let z = pAttr.getZ(i) + driftSpeed * dt;
      if (z > 6) z = -88;
      pAttr.setZ(i, z);
    }
    pAttr.needsUpdate = true;
  }

  public dispose(): void {
    this.toonGrad.dispose();
    disposeObjectTree(this.group);
  }
}
