import * as THREE from 'three';
import type { SongPalette } from '../../types/game';
import { SeededRng } from './seededRandom';
import { createCloudPuffTexture, createSoftGlowTexture, disposeObjectTree } from './sharedTextures';
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
    backgroundColor: 0x040314,
    fogColor: 0x090524,
    fogDensity: 0.0068,
    hemiSkyColor: 0x38bdf8,
    hemiGroundColor: 0x1e0b38,
    dirLightColor: 0xfde68a,
  };

  private rng: SeededRng;
  private skyMat!: THREE.ShaderMaterial;
  private planetGroup = new THREE.Group();
  private planetMat!: THREE.ShaderMaterial;
  private ringMat!: THREE.ShaderMaterial;
  private asteroidMesh!: THREE.InstancedMesh;
  private asteroids: AsteroidItem[] = [];
  private shards: CrystalShard[] = [];
  private shardMat!: THREE.MeshStandardMaterial;
  private starPoints!: THREE.Points;
  private starMat!: THREE.PointsMaterial;
  private starCount = 380;

  private readonly _dummy = new THREE.Object3D();

  constructor(opts: WorldBuildOptions) {
    this.rng = new SeededRng(`${opts.seed}:cosmic`);
    this.buildNebulaSkyDome();
    this.buildRingedGasGiantAndMoons();
    this.buildNebulaDustClouds();
    this.buildSculptedAsteroids(opts.graphicsQuality);
    this.buildFloatingCosmicShards();
    this.buildStarfieldDust();
  }

  private buildNebulaSkyDome(): void {
    const geo = new THREE.SphereGeometry(135, 32, 20);
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
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p *= 2.05;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec2 uv = vec2(atan(vDir.z, vDir.x) + uSeedRot, vDir.y * 2.2);
          float n1 = fbm(uv * 2.4 + vec2(uTime * 0.012, 0.0));
          float n2 = fbm(uv * 4.1 - vec2(0.0, uTime * 0.015));

          vec3 voidSpace = vec3(0.015, 0.015, 0.06);
          vec3 nebTeal = vec3(0.04, 0.62, 0.78);
          vec3 nebMagenta = vec3(0.68, 0.16, 0.85);
          vec3 nebGold = vec3(0.96, 0.54, 0.14);

          vec3 col = voidSpace;
          col += nebTeal * smoothstep(0.42, 0.82, n1) * (0.55 + uEnergy * 0.35);
          col += nebMagenta * smoothstep(0.48, 0.86, n2) * (0.48 + uBass * 0.35);
          col += nebGold * smoothstep(0.64, 0.92, n1 * n2 * 1.9) * 0.55;

          // Dense multi-tier cosmic starfield
          float cellA = hash(floor(vDir.xy * 210.0 + vDir.z * 70.0));
          float cellB = hash(floor(vDir.xy * 95.0 - vDir.z * 35.0));
          float starA = step(0.992, cellA);
          float starB = step(0.995, cellB);
          col += vec3(0.82, 0.94, 1.0) * starA * (0.6 + 0.4 * sin(uTime * 3.0 + cellA * 50.0));
          col += vec3(1.0, 0.85, 0.6) * starB * 1.1;

          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.group.add(new THREE.Mesh(geo, this.skyMat));
  }

  private buildRingedGasGiantAndMoons(): void {
    // Hero Ringed Planet positioned majestically in the upper-left/right horizon vista (matching screenshot 4)
    const side = this.rng.sign();
    this.planetGroup.position.set(side * this.rng.range(13, 19), this.rng.range(11, 15), -68);
    this.planetGroup.rotation.z = side * 0.32;
    this.planetGroup.rotation.x = 0.25;

    const planetGeo = new THREE.SphereGeometry(7.2, 32, 24);
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
          float bands = sin(vPos.y * 1.9 + sin(vPos.x * 0.6 + uTime * 0.25) * 1.4) * 0.5 + 0.5;
          vec3 colA = vec3(0.05, 0.42, 0.58);
          vec3 colB = vec3(0.82, 0.48, 0.22);
          vec3 base = mix(colA, colB, bands * 0.72);

          vec3 lightDir = normalize(vec3(0.65, 0.55, 0.6));
          float diff = max(0.08, dot(vNormal, lightDir));
          vec3 viewDir = normalize(-vViewPos);
          float rim = pow(1.0 - max(0.0, dot(viewDir, vNormal)), 3.0);

          vec3 col = base * diff + vec3(0.18, 0.85, 0.98) * rim * (0.55 + uEnergy * 0.3);
          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
      fog: false,
    });
    const planet = new THREE.Mesh(planetGeo, this.planetMat);
    this.planetGroup.add(planet);

    // Concentric translucent planetary rings
    const ringGeo = new THREE.RingGeometry(9.2, 16.2, 64);
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
          float norm = clamp((r - 9.2) / 7.0, 0.0, 1.0);
          float rings = sin(norm * 42.0) * 0.5 + 0.5;
          float cassiniGap = smoothstep(0.02, 0.08, abs(norm - 0.58));
          float edgeFade = smoothstep(0.0, 0.1, norm) * smoothstep(1.0, 0.85, norm);
          vec3 col = mix(vec3(0.95, 0.68, 0.34), vec3(0.24, 0.82, 0.96), norm);
          float alpha = edgeFade * cassiniGap * (0.28 + rings * 0.42);
          gl_FragColor = vec4(col * (0.85 + uEnergy * 0.25) * uBrightness, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    });
    const ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.planetGroup.add(ring);
    this.group.add(this.planetGroup);

    // Secondary distant moon on opposite flank
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      emissive: 0x7c2d12,
      emissiveIntensity: 0.35,
      roughness: 0.72,
    });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(2.8, 20, 16), moonMat);
    moon.position.set(-side * this.rng.range(16, 24), this.rng.range(9, 16), -58);
    this.group.add(moon);
  }

  private buildNebulaDustClouds(): void {
    const texTeal = createCloudPuffTexture('#06b6d4');
    const texPink = createCloudPuffTexture('#d946ef');
    const texGold = createCloudPuffTexture('#f59e0b');
    const texList = [texTeal, texPink, texGold];

    for (let i = 0; i < 12; i++) {
      const mat = new THREE.SpriteMaterial({
        map: texList[i % 3],
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      const side = i % 2 === 0 ? -1 : 1;
      sp.position.set(
        side * this.rng.range(10, 34),
        this.rng.range(1, 18),
        this.rng.range(-86, -24),
      );
      sp.scale.set(this.rng.range(18, 32), this.rng.range(12, 22), 1);
      this.group.add(sp);
    }
  }

  private buildSculptedAsteroids(quality: string): void {
    // Displaced irregular asteroid geometry (not uniform spheres/boxes)
    const astGeo = new THREE.IcosahedronGeometry(0.85, 1);
    const pos = astGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const crag = 0.72 + 0.42 * Math.sin(vx * 3.4 + vy * 2.1 - vz * 2.9);
      pos.setXYZ(i, vx * crag * 1.15, vy * crag * 0.85, vz * crag);
    }
    astGeo.computeVertexNormals();

    const astMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      emissive: 0x1e1b4b,
      emissiveIntensity: 0.25,
      roughness: 0.82,
      metalness: 0.25,
      flatShading: true,
    });

    const count = quality === 'low' ? 28 : 48;
    this.asteroidMesh = new THREE.InstancedMesh(astGeo, astMat, count);
    this.asteroidMesh.frustumCulled = false;

    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const item: AsteroidItem = {
        pos: new THREE.Vector3(
          side * this.rng.range(6.2, 24.0),
          this.rng.range(-4.5, 12.0),
          this.rng.range(-84, -4),
        ),
        rot: new THREE.Euler(
          this.rng.range(0, Math.PI),
          this.rng.range(0, Math.PI),
          this.rng.range(0, Math.PI),
        ),
        rotSpeed: new THREE.Vector3(
          this.rng.range(-0.6, 0.6),
          this.rng.range(-0.8, 0.8),
          this.rng.range(-0.5, 0.5),
        ),
        scale: this.rng.range(0.45, 1.85),
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

  private buildFloatingCosmicShards(): void {
    const shardGeo = new THREE.OctahedronGeometry(0.42, 0);
    shardGeo.scale(0.65, 1.7, 0.65);

    this.shardMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.72,
      metalness: 0.6,
      roughness: 0.22,
    });

    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const mesh = new THREE.Mesh(shardGeo, this.shardMat);
      const baseY = this.rng.range(0.5, 7.5);
      mesh.position.set(
        side * this.rng.range(6.0, 12.5),
        baseY,
        this.rng.range(-66, -8),
      );
      this.group.add(mesh);
      this.shards.push({
        mesh,
        baseY,
        phase: this.rng.range(0, Math.PI * 2),
        rotSpeed: this.rng.range(0.5, 1.4),
      });
    }
  }

  private buildStarfieldDust(): void {
    const pos = new Float32Array(this.starCount * 3);
    const cols = new Float32Array(this.starCount * 3);
    const c1 = new THREE.Color('#22d3ee');
    const c2 = new THREE.Color('#e879f9');
    const c3 = new THREE.Color('#fbbf24');

    for (let i = 0; i < this.starCount; i++) {
      pos[i * 3] = this.rng.range(-36, 36);
      pos[i * 3 + 1] = this.rng.range(-4, 24);
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
      size: 0.28,
      map: createSoftGlowTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.starPoints = new THREE.Points(geo, this.starMat);
    this.group.add(this.starPoints);
  }

  public setPalette(_palette: SongPalette): void {
    // Cosmic Dimension keeps its cohesive nebula / ringed planet palette
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
    this.skyMat.uniforms.uBass.value = effBass;
    this.skyMat.uniforms.uBrightness.value = bright;

    this.planetMat.uniforms.uTime.value = elapsed;
    this.planetMat.uniforms.uEnergy.value = effEnergy;
    this.planetMat.uniforms.uBrightness.value = bright;
    this.ringMat.uniforms.uEnergy.value = effEnergy;
    this.ringMat.uniforms.uBrightness.value = bright;

    this.shardMat.emissiveIntensity = (0.52 + effHigh * 0.48) * bright;

    const motionMult = mode === 'paused' ? 0 : 1 + effEnergy * 0.7;
    for (let i = 0; i < this.asteroids.length; i++) {
      const a = this.asteroids[i];
      a.rot.x += a.rotSpeed.x * dt * motionMult;
      a.rot.y += a.rotSpeed.y * dt * motionMult;
      a.rot.z += a.rotSpeed.z * dt * motionMult;
      this._dummy.position.set(
        a.pos.x,
        a.pos.y + Math.sin(elapsed * 0.7 + a.orbitPhase) * 0.35,
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
    this.starMat.opacity = (0.38 + effHigh * 0.35) * partMult * bright;

    const pAttr = this.starPoints.geometry.attributes.position as THREE.BufferAttribute;
    const warpSpeed = mode === 'playing' ? (9 + effBass * 14) * silenceDamp : mode === 'idle' ? 3.2 : 0.3;
    for (let i = 0; i < activeCount; i++) {
      let z = pAttr.getZ(i) + warpSpeed * dt;
      if (z > 8) z = -95;
      pAttr.setZ(i, z);
    }
    pAttr.needsUpdate = true;
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
