import * as THREE from 'three';
import type { SongPalette } from '../../types/game';
import {
  addInkOutline,
  createCelToonGradientMap,
  createCrossStarTexture,
} from './illustratedLayers';
import { SeededRng } from './seededRandom';
import { disposeObjectTree } from './sharedTextures';
import type { WorldAtmosphere, WorldBuildOptions, WorldInstance, WorldUpdateContext } from './types';

interface AsteroidItem {
  pos: THREE.Vector3;
  rot: THREE.Euler;
  rotSpeed: THREE.Vector3;
  scale: number;
  orbitPhase: number;
}

interface CrystalShard {
  mesh: THREE.Mesh;
  baseY: number;
  phase: number;
  rotSpeed: number;
}

export class CosmicDimensionWorld implements WorldInstance {
  public readonly theme = 'cosmic' as const;
  public readonly group = new THREE.Group();
  public readonly atmosphere: WorldAtmosphere = {
    backgroundColor: 0x0a0624,
    fogColor: 0x160b3d,
    fogDensity: 0.0058,
    hemiSkyColor: 0x38bdf8,
    hemiGroundColor: 0x1e0b38,
    dirLightColor: 0xfde68a,
  };

  private rng: SeededRng;
  private toonGrad: THREE.DataTexture;
  private skyMat!: THREE.ShaderMaterial;
  private planetGroup = new THREE.Group();
  private planetMat!: THREE.ShaderMaterial;
  private ringMat!: THREE.ShaderMaterial;
  private asteroidMesh!: THREE.InstancedMesh;
  private asteroids: AsteroidItem[] = [];
  private shards: CrystalShard[] = [];
  private shardMat!: THREE.MeshToonMaterial;
  private starPoints!: THREE.Points;
  private starMat!: THREE.PointsMaterial;
  private starCount = 300;

  private readonly _dummy = new THREE.Object3D();

  constructor(opts: WorldBuildOptions) {
    this.rng = new SeededRng(`${opts.seed}:cosmic-illustrated`);
    this.toonGrad = createCelToonGradientMap();
    this.starCount = opts.graphicsQuality === 'low' ? 120 : opts.graphicsQuality === 'medium' ? 210 : 300;

    this.buildIllustratedNebulaSky();
    this.buildCelRingedPlanet();
    this.buildInkOutlinedAsteroids(opts.graphicsQuality);
    this.buildFloatingCosmicCrystals();
    this.buildCrossStarField();
  }

  private buildIllustratedNebulaSky(): void {
    const geo = new THREE.SphereGeometry(142, 32, 20);
    const seedRot = this.rng.range(0, 6.28);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.25 },
        uBass: { value: 0.2 },
        uBrightness: { value: 1.0 },
        uSeedRot: { value: seedRot },
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
        uniform float uSeedRot;
        varying vec3 vDir;

        void main() {
          float y = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 deepSpace = vec3(0.04, 0.03, 0.14);
          vec3 nebViolet = vec3(0.28, 0.1, 0.52);
          vec3 nebCyan = vec3(0.06, 0.48, 0.72);
          vec3 nebCoral = vec3(0.84, 0.28, 0.52);

          float wave = sin(vDir.x * 3.2 + vDir.y * 2.4 + uSeedRot + uTime * 0.15) * 0.5 + 0.5;
          float band = smoothstep(0.22, 0.78, wave);
          vec3 col = mix(deepSpace, nebViolet, smoothstep(0.2, 0.75, y));
          col += nebCyan * band * (0.34 + uEnergy * 0.24);
          col += nebCoral * (1.0 - band) * smoothstep(0.15, 0.65, y) * (0.28 + uBass * 0.24);

          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.group.add(new THREE.Mesh(geo, this.skyMat));
  }

  private buildCelRingedPlanet(): void {
    const side = this.rng.sign();
    this.planetGroup.position.set(side * 15.5, 13.5, -72);
    this.planetGroup.rotation.z = side * 0.3;
    this.planetGroup.rotation.x = 0.24;

    const planetGeo = new THREE.SphereGeometry(7.2, 28, 22);
    this.planetMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.25 },
        uBrightness: { value: 1.0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPos;
        varying vec3 vViewPos;
        void main() {
          vPos = position;
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewPos = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uEnergy;
        uniform float uBrightness;
        varying vec3 vNormal;
        varying vec3 vPos;
        varying vec3 vViewPos;

        void main() {
          float bands = step(0.5, sin(vPos.y * 1.8 + sin(vPos.x * 0.5) * 0.9) * 0.5 + 0.5);
          vec3 colA = vec3(0.16, 0.62, 0.88);
          vec3 colB = vec3(0.96, 0.52, 0.34);
          vec3 base = mix(colA, colB, bands * 0.72);

          vec3 lightDir = normalize(vec3(0.65, 0.55, 0.6));
          float diff = step(0.25, dot(vNormal, lightDir)) * 0.55 + 0.45;
          vec3 viewDir = normalize(-vViewPos);
          float rim = step(0.68, 1.0 - max(0.0, dot(viewDir, vNormal)));

          vec3 col = base * diff + vec3(0.35, 0.92, 1.0) * rim * (0.45 + uEnergy * 0.25);
          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
      fog: false,
    });
    const planet = new THREE.Mesh(planetGeo, this.planetMat);
    addInkOutline(planet, 0x070418, 1.035);
    this.planetGroup.add(planet);

    const ringGeo = new THREE.RingGeometry(9.4, 16.4, 56);
    ringGeo.rotateX(Math.PI / 2);
    this.ringMat = new THREE.ShaderMaterial({
      uniforms: {
        uEnergy: { value: 0.25 },
        uBrightness: { value: 1.0 },
      },
      vertexShader: `
        varying vec3 vLocal;
        void main() {
          vLocal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uEnergy;
        uniform float uBrightness;
        varying vec3 vLocal;
        void main() {
          float r = length(vLocal.xz);
          float norm = clamp((r - 9.4) / 7.0, 0.0, 1.0);
          float bands = step(0.35, sin(norm * 24.0) * 0.5 + 0.5);
          float gap = smoothstep(0.02, 0.06, abs(norm - 0.55));
          float edge = smoothstep(0.0, 0.08, norm) * smoothstep(1.0, 0.88, norm);
          vec3 col = mix(vec3(0.98, 0.72, 0.34), vec3(0.26, 0.88, 1.0), norm);
          float alpha = edge * gap * (0.42 + bands * 0.38);
          gl_FragColor = vec4(col * (0.85 + uEnergy * 0.2) * uBrightness, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    });
    this.planetGroup.add(new THREE.Mesh(ringGeo, this.ringMat));
    this.group.add(this.planetGroup);

    const moonMat = new THREE.MeshToonMaterial({
      color: 0xf59e0b,
      emissive: 0x7c2d12,
      emissiveIntensity: 0.25,
      gradientMap: this.toonGrad,
    });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(2.6, 18, 14), moonMat);
    moon.position.set(-side * 19, 12, -58);
    addInkOutline(moon, 0x070418, 1.05);
    this.group.add(moon);
  }

  private buildInkOutlinedAsteroids(quality: string): void {
    const astGeo = new THREE.IcosahedronGeometry(0.85, 0);
    const astMat = new THREE.MeshToonMaterial({
      color: 0x3b336b,
      emissive: 0x1e1b4b,
      emissiveIntensity: 0.25,
      gradientMap: this.toonGrad,
    });

    const count = quality === 'low' ? 22 : 38;
    this.asteroidMesh = new THREE.InstancedMesh(astGeo, astMat, count);
    this.asteroidMesh.frustumCulled = false;

    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const item: AsteroidItem = {
        pos: new THREE.Vector3(side * this.rng.range(6.6, 23.0), this.rng.range(-4.0, 11.5), this.rng.range(-84, -5)),
        rot: new THREE.Euler(this.rng.range(0, Math.PI), this.rng.range(0, Math.PI), 0),
        rotSpeed: new THREE.Vector3(this.rng.range(-0.5, 0.5), this.rng.range(-0.7, 0.7), 0),
        scale: this.rng.range(0.5, 1.65),
        orbitPhase: this.rng.range(0, Math.PI * 2),
      };
      this.asteroids.push(item);

      this._dummy.position.copy(item.pos);
      this._dummy.rotation.copy(item.rot);
      this._dummy.scale.setScalar(item.scale);
      this._dummy.updateMatrix();
      this.asteroidMesh.setMatrixAt(i, this._dummy.matrix);
    }
    this.asteroidMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.asteroidMesh);
  }

  private buildFloatingCosmicCrystals(): void {
    const shardGeo = new THREE.OctahedronGeometry(0.42, 0);
    shardGeo.scale(0.65, 1.65, 0.65);

    this.shardMat = new THREE.MeshToonMaterial({
      color: 0x22d3ee,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.55,
      gradientMap: this.toonGrad,
    });

    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const mesh = new THREE.Mesh(shardGeo, this.shardMat);
      addInkOutline(mesh, 0x070418, 1.08);
      const baseY = this.rng.range(0.8, 7.5);
      mesh.position.set(side * this.rng.range(6.4, 12.2), baseY, -8 - i * 5.8);
      this.group.add(mesh);
      this.shards.push({
        mesh,
        baseY,
        phase: this.rng.range(0, Math.PI * 2),
        rotSpeed: this.rng.range(0.5, 1.2),
      });
    }
  }

  private buildCrossStarField(): void {
    const pos = new Float32Array(this.starCount * 3);
    const cols = new Float32Array(this.starCount * 3);
    const c1 = new THREE.Color('#22d3ee');
    const c2 = new THREE.Color('#f472b6');
    const c3 = new THREE.Color('#fde68a');

    for (let i = 0; i < this.starCount; i++) {
      pos[i * 3] = this.rng.range(-36, 36);
      pos[i * 3 + 1] = this.rng.range(-4, 26);
      pos[i * 3 + 2] = this.rng.range(-95, 8);
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
    // Cosmic Dimension maintains its cel-shaded nebula & ringed giant palette
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
    this.skyMat.uniforms.uBass.value = effBass;
    this.skyMat.uniforms.uBrightness.value = bright;

    this.planetGroup.scale.setScalar(1 + effKick * 0.045);
    this.planetMat.uniforms.uTime.value = elapsed;
    this.planetMat.uniforms.uEnergy.value = effEnergy;
    this.planetMat.uniforms.uBrightness.value = bright;
    this.ringMat.uniforms.uEnergy.value = effEnergy;
    this.ringMat.uniforms.uBrightness.value = bright;

    this.shardMat.emissiveIntensity = (0.45 + effHigh * 0.4 + effKick * 0.25) * bright;

    const motionMult = mode === 'paused' ? 0 : 1 + effEnergy * 0.65;
    for (let i = 0; i < this.asteroids.length; i++) {
      const a = this.asteroids[i];
      a.rot.x += a.rotSpeed.x * dt * motionMult;
      a.rot.y += a.rotSpeed.y * dt * motionMult;
      this._dummy.position.set(
        a.pos.x,
        a.pos.y + Math.sin(elapsed * 0.7 + a.orbitPhase) * 0.3,
        a.pos.z,
      );
      this._dummy.rotation.copy(a.rot);
      this._dummy.scale.setScalar(a.scale);
      this._dummy.updateMatrix();
      this.asteroidMesh.setMatrixAt(i, this._dummy.matrix);
    }
    this.asteroidMesh.instanceMatrix.needsUpdate = true;

    for (const s of this.shards) {
      s.mesh.position.y = s.baseY + Math.sin(elapsed * 1.4 + s.phase) * 0.35;
      s.mesh.rotation.y += s.rotSpeed * dt * motionMult;
    }

    const activeRatio = particleIntensity === 'low' ? 0.34 : particleIntensity === 'medium' ? 0.68 : 1.0;
    const activeCount = Math.floor(this.starCount * activeRatio);
    this.starPoints.geometry.setDrawRange(0, activeCount);
    this.starMat.opacity = Math.min(0.95, (0.48 + effHigh * 0.28 + effHihat * 0.25) * partMult * bright);

    const pAttr = this.starPoints.geometry.attributes.position as THREE.BufferAttribute;
    const warpSpeed = mode === 'playing' ? (8.5 + effBass * 12) * silenceDamp : mode === 'idle' ? 3.0 : 0.3;
    for (let i = 0; i < activeCount; i++) {
      let z = pAttr.getZ(i) + warpSpeed * dt;
      if (z > 8) z = -95;
      pAttr.setZ(i, z);
    }
    pAttr.needsUpdate = true;
  }

  public dispose(): void {
    this.toonGrad.dispose();
    disposeObjectTree(this.group);
  }
}
