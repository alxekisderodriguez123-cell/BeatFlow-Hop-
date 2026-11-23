import * as THREE from 'three';
import type { SongPalette } from '../../types/game';
import { SeededRng } from './seededRandom';
import { createCloudPuffTexture, createSoftGlowTexture, disposeObjectTree } from './sharedTextures';
import type { WorldAtmosphere, WorldBuildOptions, WorldInstance, WorldUpdateContext } from './types';

function ridgeFbm(x: number, z: number, seedOffset: number): number {
  const n1 = 1 - Math.abs(Math.sin(x * 0.085 + seedOffset) * Math.cos(z * 0.075 - seedOffset * 0.5));
  const n2 = 1 - Math.abs(Math.sin(x * 0.19 - z * 0.14 + seedOffset * 1.7));
  const n3 = Math.sin(x * 0.42 + z * 0.37) * 0.5 + 0.5;
  return n1 * 0.58 + n2 * 0.28 + n3 * 0.14;
}

export class MountainLandscapeWorld implements WorldInstance {
  public readonly theme = 'mountain' as const;
  public readonly group = new THREE.Group();
  public readonly atmosphere: WorldAtmosphere = {
    backgroundColor: 0x040b18,
    fogColor: 0x081a2b,
    fogDensity: 0.0085,
    hemiSkyColor: 0x34d399,
    hemiGroundColor: 0x09111f,
    dirLightColor: 0xcffafe,
  };

  private rng: SeededRng;
  private skyMat!: THREE.ShaderMaterial;
  private auroraMats: THREE.ShaderMaterial[] = [];
  private mistLakeMat!: THREE.ShaderMaterial;
  private snowPoints!: THREE.Points;
  private snowMat!: THREE.PointsMaterial;
  private snowCount = 260;

  constructor(opts: WorldBuildOptions) {
    this.rng = new SeededRng(`${opts.seed}:mountain`);
    this.buildAlpineNightSky();
    this.buildAuroraCurtains();
    this.buildMountainRanges();
    this.buildPineFoothills();
    this.buildValleyLakeAndMist();
    this.buildAlpineParticles();
  }

  private buildAlpineNightSky(): void {
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

        void main() {
          float y = clamp(vDir.y, -0.2, 1.0);
          vec3 zenith = vec3(0.015, 0.035, 0.11);
          vec3 horizon = vec3(0.04, 0.14, 0.24);
          vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.55, y));

          // Crisp alpine starfield
          float cell = hash(floor(vDir.xy * 210.0));
          float stars = step(0.992, cell) * smoothstep(0.08, 0.35, y);
          float twinkle = 0.65 + 0.35 * sin(uTime * 2.8 + cell * 55.0);
          col += vec3(0.84, 0.96, 1.0) * stars * twinkle;

          // Ambient aurora sky glow
          float auroraGlow = exp(-abs(vDir.y - 0.28) * 5.5) * (0.45 + 0.55 * sin(vDir.x * 2.5 + uTime * 0.4));
          col += vec3(0.04, 0.42, 0.38) * max(0.0, auroraGlow) * (0.35 + uEnergy * 0.3);

          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.group.add(new THREE.Mesh(geo, this.skyMat));
  }

  private buildAuroraCurtains(): void {
    const ribbonConfigs = [
      { y: 21, z: -64, w: 120, h: 20, colA: '#10b981', colB: '#22d3ee', phase: 0 },
      { y: 25, z: -80, w: 140, h: 24, colA: '#34d399', colB: '#a855f7', phase: 2.1 },
    ];

    for (const cfg of ribbonConfigs) {
      const geo = new THREE.PlaneGeometry(cfg.w, cfg.h, 48, 8);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const curveZ = Math.sin(x * 0.06 + cfg.phase) * 9.0 + Math.cos(x * 0.13) * 4.0;
        pos.setZ(i, curveZ);
      }
      geo.computeVertexNormals();

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uEnergy: { value: 0.25 },
          uBass: { value: 0.2 },
          uBrightness: { value: 1.0 },
          uColorA: { value: new THREE.Color(cfg.colA) },
          uColorB: { value: new THREE.Color(cfg.colB) },
          uPhase: { value: cfg.phase },
        },
        vertexShader: `
          uniform float uTime;
          uniform float uPhase;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 p = position;
            p.z += sin(p.x * 0.1 + uTime * 0.65 + uPhase) * 2.4;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uEnergy;
          uniform float uBass;
          uniform float uBrightness;
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          uniform float uPhase;
          varying vec2 vUv;

          void main() {
            float rays = 0.5 + 0.5 * sin(vUv.x * 38.0 + uTime * 1.3 + uPhase);
            float fineRays = 0.5 + 0.5 * sin(vUv.x * 84.0 - uTime * 2.1);
            float verticalFade = smoothstep(0.0, 0.28, vUv.y) * smoothstep(1.0, 0.22, vUv.y);
            float edgeFade = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
            float shimmer = rays * 0.65 + fineRays * 0.35;

            vec3 col = mix(uColorA, uColorB, clamp(vUv.y * 1.15 + sin(vUv.x * 5.0 + uTime) * 0.2, 0.0, 1.0));
            float alpha = verticalFade * edgeFade * shimmer * (0.28 + uEnergy * 0.26 + uBass * 0.14);
            gl_FragColor = vec4(col * (0.85 + uEnergy * 0.3) * uBrightness, clamp(alpha, 0.0, 0.62));
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      this.auroraMats.push(mat);

      const curtain = new THREE.Mesh(geo, mat);
      curtain.position.set(this.rng.range(-6, 6), cfg.y, cfg.z);
      curtain.rotation.x = 0.16;
      this.group.add(curtain);
    }
  }

  private buildMountainRanges(): void {
    const seedOffset = this.rng.range(0, 50);

    // Build sculpted alpine heightfields flanking left/right valley + distant horizon peaks
    const buildRangeMesh = (
      width: number,
      depth: number,
      segX: number,
      segZ: number,
      maxHeight: number,
      valleyClearance: number,
      posX: number,
      posZ: number,
      tintDark: THREE.Color,
      tintSnow: THREE.Color,
    ) => {
      const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
      geo.rotateX(-Math.PI / 2);

      const pos = geo.attributes.position as THREE.BufferAttribute;
      const colors = new Float32Array(pos.count * 3);
      const col = new THREE.Color();

      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i);
        const lz = pos.getZ(i);
        const worldX = lx + posX;
        const worldZ = lz + posZ;

        // Keep central rhythm track valley clear
        const distFromCenter = Math.abs(worldX);
        const valleyMask = THREE.MathUtils.smoothstep(
          distFromCenter,
          valleyClearance,
          valleyClearance + 14,
        );
        // Also raise distant background ridge behind spawn
        const backMask = THREE.MathUtils.smoothstep(-worldZ, 52, 82);
        const mask = Math.max(valleyMask, backMask * 0.92);

        const ridge = ridgeFbm(worldX, worldZ, seedOffset);
        const h = Math.pow(ridge, 1.45) * maxHeight * mask;
        pos.setY(i, h - 1.7);

        const snowFactor = THREE.MathUtils.smoothstep(h, maxHeight * 0.42, maxHeight * 0.78);
        col.copy(tintDark).lerp(tintSnow, snowFactor);
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
      }

      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.86,
        metalness: 0.12,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(posX, 0, posZ);
      this.group.add(mesh);
    };

    // Near flanking crags
    buildRangeMesh(
      140,
      130,
      64,
      58,
      20,
      5.5,
      0,
      -48,
      new THREE.Color('#0c172e'),
      new THREE.Color('#7dd3fc'),
    );

    // Distant colossal snow-capped silhouette range across horizon
    buildRangeMesh(
      210,
      70,
      64,
      26,
      34,
      0,
      0,
      -96,
      new THREE.Color('#091328'),
      new THREE.Color('#a5f3fc'),
    );
  }

  private buildPineFoothills(): void {
    // Instanced multi-tier alpine conifers along lower flanking slopes
    const tier1 = new THREE.ConeGeometry(0.65, 1.5, 6);
    tier1.translate(0, 1.0, 0);
    const tier2 = new THREE.ConeGeometry(0.48, 1.2, 6);
    tier2.translate(0, 1.8, 0);

    const treeMat = new THREE.MeshStandardMaterial({
      color: 0x071b24,
      roughness: 0.85,
      metalness: 0.05,
    });

    const count = 48;
    const meshLow = new THREE.InstancedMesh(tier1, treeMat, count);
    const meshTop = new THREE.InstancedMesh(tier2, treeMat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * this.rng.range(5.4, 14.5);
      const z = this.rng.range(-68, -4);
      const scale = this.rng.range(0.75, 1.65);

      dummy.position.set(x, -1.55, z);
      dummy.rotation.y = this.rng.range(0, Math.PI * 2);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      meshLow.setMatrixAt(i, dummy.matrix);
      meshTop.setMatrixAt(i, dummy.matrix);
    }

    meshLow.instanceMatrix.needsUpdate = true;
    meshTop.instanceMatrix.needsUpdate = true;
    meshLow.computeBoundingSphere();
    meshTop.computeBoundingSphere();
    this.group.add(meshLow, meshTop);
  }

  private buildValleyLakeAndMist(): void {
    // Reflective glacial river/lake surface under the track corridor
    const geo = new THREE.PlaneGeometry(36, 130);
    this.mistLakeMat = new THREE.ShaderMaterial({
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
          float ripple = sin(vWorldPos.z * 0.75 + uTime * 1.4) * cos(vWorldPos.x * 0.9 - uTime * 0.9);
          vec3 base = vec3(0.02, 0.06, 0.14);
          vec3 auroraRef = mix(vec3(0.05, 0.55, 0.45), vec3(0.12, 0.52, 0.78), 0.5 + 0.5 * ripple);
          float shimmer = smoothstep(0.25, 0.95, ripple * 0.5 + 0.5);
          vec3 col = base + auroraRef * shimmer * (0.28 + uEnergy * 0.24);
          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
    });
    const lake = new THREE.Mesh(geo, this.mistLakeMat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(0, -1.68, -48);
    this.group.add(lake);

    // Drifting valley fog banks
    const mistTex = createCloudPuffTexture('#38bdf8');
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.SpriteMaterial({
        map: mistTex,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(
        this.rng.sign() * this.rng.range(8, 26),
        this.rng.range(0.5, 4.5),
        this.rng.range(-78, -12),
      );
      sp.scale.set(this.rng.range(18, 32), this.rng.range(6, 11), 1);
      this.group.add(sp);
    }
  }

  private buildAlpineParticles(): void {
    const pos = new Float32Array(this.snowCount * 3);
    const cols = new Float32Array(this.snowCount * 3);
    const c1 = new THREE.Color('#6ee7b7');
    const c2 = new THREE.Color('#bae6fd');
    const c3 = new THREE.Color('#e0f2fe');

    for (let i = 0; i < this.snowCount; i++) {
      pos[i * 3] = this.rng.range(-28, 28);
      pos[i * 3 + 1] = this.rng.range(0.2, 20);
      pos[i * 3 + 2] = this.rng.range(-80, 6);
      const c = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    this.snowMat = new THREE.PointsMaterial({
      size: 0.24,
      map: createSoftGlowTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.snowPoints = new THREE.Points(geo, this.snowMat);
    this.group.add(this.snowPoints);
  }

  public setPalette(_palette: SongPalette): void {
    // Alpine Aurora maintains its cohesive emerald-cyan-indigo atmosphere
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

    for (const mat of this.auroraMats) {
      mat.uniforms.uTime.value = elapsed;
      mat.uniforms.uEnergy.value = effEnergy;
      mat.uniforms.uBass.value = effBass;
      mat.uniforms.uBrightness.value = bright;
    }

    this.mistLakeMat.uniforms.uTime.value = elapsed;
    this.mistLakeMat.uniforms.uEnergy.value = effEnergy;
    this.mistLakeMat.uniforms.uBrightness.value = bright;

    const activeRatio = particleIntensity === 'low' ? 0.32 : particleIntensity === 'medium' ? 0.65 : 1.0;
    const activeCount = Math.floor(this.snowCount * activeRatio);
    this.snowPoints.geometry.setDrawRange(0, activeCount);
    this.snowMat.opacity = (0.34 + effHigh * 0.3) * partMult * bright;

    const pAttr = this.snowPoints.geometry.attributes.position as THREE.BufferAttribute;
    const fallSpeed = mode === 'paused' ? 0 : 1.4 + effEnergy * 1.8;
    const driftZ = mode === 'paused' ? 0 : 2.5 + effBass * 4.5;
    for (let i = 0; i < activeCount; i++) {
      let y = pAttr.getY(i) - fallSpeed * dt;
      let z = pAttr.getZ(i) + driftZ * dt;
      if (y < 0) y = 20;
      if (z > 8) z = -80;
      pAttr.setY(i, y);
      pAttr.setZ(i, z);
    }
    pAttr.needsUpdate = true;
  }

  public dispose(): void {
    disposeObjectTree(this.group);
  }
}
