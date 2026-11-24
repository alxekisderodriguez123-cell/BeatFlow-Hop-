import * as THREE from 'three';
import type { SongPalette } from '../../types/game';
import {
  addInkOutline,
  createCelToonGradientMap,
  createCrossStarTexture,
  createIllustratedMountainTexture,
  createIllustratedPalmShoreTexture,
  createIllustratedSunTexture,
} from './illustratedLayers';
import { SeededRng } from './seededRandom';
import { disposeObjectTree } from './sharedTextures';
import type { WorldAtmosphere, WorldBuildOptions, WorldInstance, WorldUpdateContext } from './types';

export class SynthwaveHighwayWorld implements WorldInstance {
  public readonly theme = 'synthwave' as const;
  public readonly group = new THREE.Group();
  public readonly atmosphere: WorldAtmosphere = {
    backgroundColor: 0x16082f,
    fogColor: 0x331259,
    fogDensity: 0.0068,
    hemiSkyColor: 0xf43f8e,
    hemiGroundColor: 0x1e0b3a,
    dirLightColor: 0xfde047,
  };

  private rng: SeededRng;
  private toonGrad: THREE.DataTexture;
  private skyMat!: THREE.ShaderMaterial;
  private sunSprite!: THREE.Sprite;
  private gridMat!: THREE.ShaderMaterial;
  private pylonMats: THREE.MeshBasicMaterial[] = [];
  private starPoints!: THREE.Points;
  private starMat!: THREE.PointsMaterial;
  private starCount = 240;

  constructor(opts: WorldBuildOptions) {
    this.rng = new SeededRng(`${opts.seed}:synthwave`);
    this.toonGrad = createCelToonGradientMap();
    this.starCount = opts.graphicsQuality === 'low' ? 95 : opts.graphicsQuality === 'medium' ? 165 : 240;

    this.buildSynthwaveSkyAndStripedSun();
    this.buildScrollingNeonGridPlain();
    this.buildJaggedNeonMountains(opts.maxAnisotropy);
    this.buildRoadsideLightPylons(opts.graphicsQuality);
    this.buildWarpStars();
  }

  private buildSynthwaveSkyAndStripedSun(): void {
    const geo = new THREE.SphereGeometry(142, 32, 18);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uEnergy: { value: 0.25 },
        uKick: { value: 0 },
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
        uniform float uKick;
        uniform float uBrightness;
        varying vec3 vDir;
        void main() {
          float y = clamp(vDir.y, -0.15, 1.0);
          vec3 zenith = vec3(0.05, 0.03, 0.2);
          vec3 midViolet = vec3(0.32, 0.09, 0.5);
          vec3 horizonMagenta = vec3(0.88, 0.22, 0.56);
          vec3 horizonOrange = vec3(1.0, 0.56, 0.2);

          vec3 col = mix(horizonOrange, horizonMagenta, smoothstep(0.0, 0.14, y));
          col = mix(col, midViolet, smoothstep(0.12, 0.34, y));
          col = mix(col, zenith, smoothstep(0.3, 0.7, y));

          float sunGlow = exp(-length((vDir.xy - vec2(0.0, 0.08)) * vec2(0.6, 1.3)) * 3.8);
          col += vec3(1.0, 0.65, 0.25) * sunGlow * (0.42 + uKick * 0.26 + uEnergy * 0.2);
          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.group.add(new THREE.Mesh(geo, this.skyMat));

    const sunTex = createIllustratedSunTexture('#fde047', '#fb7185', '#f97316', true);
    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sunTex,
        transparent: true,
        opacity: 0.98,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sunSprite.position.set(0, 10.5, -94);
    this.sunSprite.scale.set(36, 36, 1);
    this.group.add(this.sunSprite);
  }

  private buildScrollingNeonGridPlain(): void {
    const geo = new THREE.PlaneGeometry(210, 185);
    this.gridMat = new THREE.ShaderMaterial({
      uniforms: {
        uScroll: { value: 0 },
        uKick: { value: 0 },
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
        uniform float uScroll;
        uniform float uKick;
        uniform float uEnergy;
        uniform float uBrightness;
        varying vec3 vWorldPos;
        void main() {
          float fade = exp(-abs(vWorldPos.z + 18.0) * 0.0085);
          float gx = smoothstep(0.92, 0.99, abs(sin(vWorldPos.x * 0.95)));
          float gz = smoothstep(0.92, 0.99, abs(sin(vWorldPos.z * 0.55 + uScroll * 6.2831)));
          float grid = max(gx, gz);
          vec3 base = vec3(0.08, 0.03, 0.22);
          vec3 lineCol = mix(vec3(0.95, 0.24, 0.68), vec3(0.14, 0.85, 0.98), smoothstep(4.0, 32.0, abs(vWorldPos.x)));
          vec3 col = base + lineCol * grid * (0.62 + uEnergy * 0.25 + uKick * 0.35) * fade;
          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
    });
    const plain = new THREE.Mesh(geo, this.gridMat);
    plain.rotation.x = -Math.PI / 2;
    plain.position.set(0, -1.68, -60);
    this.group.add(plain);
  }

  private buildJaggedNeonMountains(anisotropy: number): void {
    const mtnTex = createIllustratedMountainTexture(this.rng, anisotropy, {
      shadeHex: '#180a36',
      litHex: '#331466',
      rimHex: '#f43f8e',
      inkHex: '#0a041a',
      includePines: false,
    });
    const mtnMat = new THREE.MeshBasicMaterial({
      map: mtnTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const palmLeftTex = createIllustratedPalmShoreTexture(this.rng, anisotropy, {
      silhouetteHex: '#160830',
      rimHex: '#22d3ee',
      inkHex: '#090318',
      leanRight: true,
    });
    const palmRightTex = createIllustratedPalmShoreTexture(this.rng, anisotropy, {
      silhouetteHex: '#160830',
      rimHex: '#f43f8e',
      inkHex: '#090318',
      leanRight: false,
    });

    const mtnLeft = new THREE.Mesh(new THREE.PlaneGeometry(54, 22), mtnMat);
    mtnLeft.position.set(-34, 7.2, -74);
    mtnLeft.rotation.y = 0.2;
    const mtnRight = new THREE.Mesh(new THREE.PlaneGeometry(54, 22), mtnMat);
    mtnRight.position.set(34, 7.2, -74);
    mtnRight.rotation.y = -0.2;

    const pL = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 13),
      new THREE.MeshBasicMaterial({ map: palmLeftTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    pL.position.set(-18, 4.5, -52);
    pL.rotation.y = 0.28;

    const pR = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 13),
      new THREE.MeshBasicMaterial({ map: palmRightTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    pR.position.set(18, 4.5, -52);
    pR.rotation.y = -0.28;

    this.group.add(mtnLeft, mtnRight, pL, pR);
  }

  private buildRoadsideLightPylons(quality: string): void {
    const darkMat = new THREE.MeshToonMaterial({ color: 0x1b0b3b, gradientMap: this.toonGrad });
    const count = quality === 'low' ? 6 : 10;
    const postGeo = new THREE.BoxGeometry(0.24, 3.6, 0.24);
    const barGeo = new THREE.BoxGeometry(0.14, 2.2, 0.28);

    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const mat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xf43f8e : 0x22d3ee });
      this.pylonMats.push(mat);

      const post = new THREE.Mesh(postGeo, darkMat);
      post.position.set(side * 6.8, 0.2, -10 - i * 7.2);
      post.rotation.z = side * -0.18;
      addInkOutline(post, 0x070214, 1.08);

      const glow = new THREE.Mesh(barGeo, mat);
      glow.position.set(side * 6.65, 0.7, -10 - i * 7.2);
      glow.rotation.z = side * -0.18;

      this.group.add(post, glow);
    }
  }

  private buildWarpStars(): void {
    const pos = new Float32Array(this.starCount * 3);
    const cols = new Float32Array(this.starCount * 3);
    const c1 = new THREE.Color('#22d3ee');
    const c2 = new THREE.Color('#f472b6');
    const c3 = new THREE.Color('#fde047');

    for (let i = 0; i < this.starCount; i++) {
      pos[i * 3] = this.rng.range(-38, 38);
      pos[i * 3 + 1] = this.rng.range(1.5, 28);
      pos[i * 3 + 2] = this.rng.range(-90, 6);
      const c = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    this.starMat = new THREE.PointsMaterial({
      size: 0.4,
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
    // Synthwave Highway preserves its iconic magenta/orange/cyan retrofuturistic gradient
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

    this.skyMat.uniforms.uEnergy.value = effEnergy;
    this.skyMat.uniforms.uKick.value = effKick;
    this.skyMat.uniforms.uBrightness.value = bright;

    const sunSize = 35 + effBass * 2.5 + effKick * 2.6;
    this.sunSprite.scale.set(sunSize, sunSize, 1);

    this.gridMat.uniforms.uScroll.value =
      mode === 'paused' ? 0 : (elapsed * (0.55 + effEnergy * 0.45)) % 1;
    this.gridMat.uniforms.uKick.value = effKick;
    this.gridMat.uniforms.uEnergy.value = effEnergy;
    this.gridMat.uniforms.uBrightness.value = bright;

    this.pylonMats.forEach((m, i) => {
      const colHex = i % 2 === 0 ? 0xf43f8e : 0x22d3ee;
      m.color.setHex(colHex).offsetHSL(0, 0, Math.min(0.25, effSnare * 0.25));
    });

    const activeRatio = particleIntensity === 'low' ? 0.34 : particleIntensity === 'medium' ? 0.68 : 1.0;
    const activeCount = Math.floor(this.starCount * activeRatio);
    this.starPoints.geometry.setDrawRange(0, activeCount);
    this.starMat.opacity = Math.min(0.95, (0.48 + effHigh * 0.25 + effHihat * 0.26) * partMult * bright);

    const pAttr = this.starPoints.geometry.attributes.position as THREE.BufferAttribute;
    const speed = mode === 'paused' ? 0 : 9.5 + effBass * 13;
    for (let i = 0; i < activeCount; i++) {
      let z = pAttr.getZ(i) + speed * dt;
      if (z > 8) z = -90;
      pAttr.setZ(i, z);
    }
    pAttr.needsUpdate = true;
  }

  public dispose(): void {
    this.toonGrad.dispose();
    disposeObjectTree(this.group);
  }
}
