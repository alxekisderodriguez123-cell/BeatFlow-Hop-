import * as THREE from 'three';
import type { SongPalette } from '../../types/game';
import {
  addInkOutline,
  createCelToonGradientMap,
  createCrossStarTexture,
  createIllustratedReactorBackdropTexture,
} from './illustratedLayers';
import { SeededRng } from './seededRandom';
import { disposeObjectTree } from './sharedTextures';
import type { WorldAtmosphere, WorldBuildOptions, WorldInstance, WorldUpdateContext } from './types';

export class IndustrialReactorWorld implements WorldInstance {
  public readonly theme = 'reactor' as const;
  public readonly group = new THREE.Group();
  public readonly atmosphere: WorldAtmosphere = {
    backgroundColor: 0x0a1020,
    fogColor: 0x13203b,
    fogDensity: 0.0085,
    hemiSkyColor: 0x38bdf8,
    hemiGroundColor: 0x1e293b,
    dirLightColor: 0xfde68a,
  };

  private rng: SeededRng;
  private toonGrad: THREE.DataTexture;
  private skyMat!: THREE.ShaderMaterial;
  private floorMat!: THREE.ShaderMaterial;
  private plasmaRingOuter!: THREE.Mesh;
  private plasmaRingInner!: THREE.Mesh;
  private plasmaCoreMat!: THREE.ShaderMaterial;
  private turbines: THREE.Group[] = [];
  private conduitMats: THREE.MeshBasicMaterial[] = [];
  private sparkPoints!: THREE.Points;
  private sparkMat!: THREE.PointsMaterial;
  private sparkCount = 190;

  constructor(opts: WorldBuildOptions) {
    this.rng = new SeededRng(`${opts.seed}:reactor`);
    this.toonGrad = createCelToonGradientMap();
    this.sparkCount = opts.graphicsQuality === 'low' ? 80 : opts.graphicsQuality === 'medium' ? 135 : 190;

    this.buildReactorHallDome();
    this.buildIndustrialDeck();
    this.buildReactorBackdrops(opts.maxAnisotropy);
    this.buildGantriesAndTurbines(opts.graphicsQuality);
    this.buildPlasmaReactorCore();
    this.buildRisingReactorSparks();
  }

  private buildReactorHallDome(): void {
    const geo = new THREE.SphereGeometry(138, 28, 16);
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
          vec3 darkSteel = vec3(0.035, 0.055, 0.12);
          vec3 midIndigo = vec3(0.08, 0.14, 0.26);
          vec3 col = mix(midIndigo, darkSteel, smoothstep(0.0, 0.55, y));
          float coreGlow = exp(-length(vDir.xy - vec2(0.0, 0.08)) * 3.0);
          col += mix(vec3(0.14, 0.78, 0.96), vec3(0.98, 0.62, 0.18), 0.35) * coreGlow * (0.35 + uKick * 0.35 + uEnergy * 0.2);
          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.group.add(new THREE.Mesh(geo, this.skyMat));
  }

  private buildIndustrialDeck(): void {
    const geo = new THREE.PlaneGeometry(175, 175);
    this.floorMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
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
        uniform float uTime;
        uniform float uKick;
        uniform float uEnergy;
        uniform float uBrightness;
        varying vec3 vWorldPos;
        void main() {
          float fade = exp(-abs(vWorldPos.z + 20.0) * 0.011);
          float grateX = step(0.88, abs(sin(vWorldPos.x * 0.9)));
          float grateZ = step(0.88, abs(sin(vWorldPos.z * 0.9)));
          float surge = smoothstep(0.82, 1.0, sin(vWorldPos.z * 0.35 + uTime * 3.6));
          vec3 base = vec3(0.04, 0.06, 0.13);
          vec3 col = base + vec3(0.95, 0.6, 0.16) * (grateX * grateZ * 0.18) * fade;
          col += vec3(0.14, 0.84, 0.98) * surge * (0.08 + uKick * 0.2 + uEnergy * 0.1) * fade;
          gl_FragColor = vec4(col * uBrightness, 1.0);
        }
      `,
    });
    const floor = new THREE.Mesh(geo, this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1.68, -54);
    this.group.add(floor);
  }

  private buildReactorBackdrops(anisotropy: number): void {
    const tex = createIllustratedReactorBackdropTexture(this.rng, anisotropy);
    const wallMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const walls = [
      { x: -18, y: 9.5, z: -48, w: 34, h: 24, rotY: 0.45 },
      { x: 18, y: 9.5, z: -48, w: 34, h: 24, rotY: -0.45 },
    ];
    for (const w of walls) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.h), wallMat);
      m.position.set(w.x, w.y, w.z);
      m.rotation.y = w.rotY;
      this.group.add(m);
    }
  }

  private buildGantriesAndTurbines(quality: string): void {
    const steelMat = new THREE.MeshToonMaterial({ color: 0x1c2845, gradientMap: this.toonGrad });
    const tankGeo = new THREE.CylinderGeometry(1.4, 1.4, 11, 10);
    const pipeGeo = new THREE.CylinderGeometry(0.24, 0.24, 12, 8);

    const archCount = quality === 'low' ? 3 : 5;
    for (let i = 0; i < archCount; i++) {
      const z = -14 - i * 13;
      const g = new THREE.Group();
      g.position.set(0, 0, z);

      const mat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xf59e0b : 0x22d3ee });
      this.conduitMats.push(mat);

      const leftTank = new THREE.Mesh(tankGeo, steelMat);
      leftTank.position.set(-8.8, 3.8, 0);
      addInkOutline(leftTank, 0x050814, 1.05);

      const rightTank = new THREE.Mesh(tankGeo, steelMat);
      rightTank.position.set(8.8, 3.8, 0);
      addInkOutline(rightTank, 0x050814, 1.05);

      const leftPipe = new THREE.Mesh(pipeGeo, mat);
      leftPipe.position.set(-7.1, 4.2, 0);
      const rightPipe = new THREE.Mesh(pipeGeo, mat);
      rightPipe.position.set(7.1, 4.2, 0);

      const beam = new THREE.Mesh(new THREE.BoxGeometry(17.5, 0.55, 0.65), steelMat);
      beam.position.set(0, 8.8, 0);
      addInkOutline(beam, 0x050814, 1.05);

      g.add(leftTank, rightTank, leftPipe, rightPipe, beam);
      this.group.add(g);
    }

    // Spinning turbine rotors flanking hall
    const bladeGeo = new THREE.BoxGeometry(0.42, 4.4, 0.14);
    const hubGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.6, 12);
    hubGeo.rotateX(Math.PI / 2);

    [-11.5, 11.5].forEach((x) => {
      const rotor = new THREE.Group();
      rotor.position.set(x, 6.2, -32);
      const hub = new THREE.Mesh(hubGeo, steelMat);
      addInkOutline(hub, 0x050814, 1.06);
      rotor.add(hub);

      for (let b = 0; b < 4; b++) {
        const blade = new THREE.Mesh(bladeGeo, steelMat);
        blade.rotation.z = (b / 4) * Math.PI;
        addInkOutline(blade, 0x050814, 1.06);
        rotor.add(blade);
      }
      this.group.add(rotor);
      this.turbines.push(rotor);
    });
  }

  private buildPlasmaReactorCore(): void {
    const coreGroup = new THREE.Group();
    coreGroup.position.set(0, 7.6, -72);

    this.plasmaRingOuter = new THREE.Mesh(
      new THREE.TorusGeometry(9.2, 0.32, 12, 40),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee }),
    );
    this.plasmaRingInner = new THREE.Mesh(
      new THREE.TorusGeometry(6.8, 0.24, 10, 32),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
    );

    this.plasmaCoreMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uKick: { value: 0 },
        uEnergy: { value: 0.25 },
        uBrightness: { value: 1.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uKick;
        uniform float uEnergy;
        uniform float uBrightness;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          float pulse = exp(-r * 2.6);
          float ring = smoothstep(0.06, 0.0, abs(r - (0.55 + 0.05 * sin(uTime * 3.0))));
          float mask = smoothstep(0.95, 0.1, r);
          vec3 col = mix(vec3(0.14, 0.85, 0.98), vec3(0.98, 0.65, 0.2), clamp(r, 0.0, 1.0));
          col = mix(col, vec3(1.0), pulse * 0.72);
          float alpha = clamp((pulse * 0.7 + ring * 0.45 + uKick * 0.28) * mask * (0.75 + uEnergy * 0.25), 0.0, 0.9);
          gl_FragColor = vec4(col * uBrightness, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    coreGroup.add(
      this.plasmaRingOuter,
      this.plasmaRingInner,
      new THREE.Mesh(new THREE.CircleGeometry(6.8, 36), this.plasmaCoreMat),
    );
    this.group.add(coreGroup);
  }

  private buildRisingReactorSparks(): void {
    const pos = new Float32Array(this.sparkCount * 3);
    const cols = new Float32Array(this.sparkCount * 3);
    const c1 = new THREE.Color('#fbbf24');
    const c2 = new THREE.Color('#22d3ee');
    const c3 = new THREE.Color('#fb923c');

    for (let i = 0; i < this.sparkCount; i++) {
      pos[i * 3] = this.rng.range(-24, 24);
      pos[i * 3 + 1] = this.rng.range(-1, 18);
      pos[i * 3 + 2] = this.rng.range(-78, 4);
      const c = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    this.sparkMat = new THREE.PointsMaterial({
      size: 0.34,
      map: createCrossStarTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sparkPoints = new THREE.Points(geo, this.sparkMat);
    this.group.add(this.sparkPoints);
  }

  public setPalette(_palette: SongPalette): void {
    // Industrial Reactor maintains its amber-plasma & cyan-steel identity
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

    this.floorMat.uniforms.uTime.value = elapsed;
    this.floorMat.uniforms.uKick.value = effKick;
    this.floorMat.uniforms.uEnergy.value = effEnergy;
    this.floorMat.uniforms.uBrightness.value = bright;

    this.plasmaRingOuter.rotation.z = elapsed * (0.25 + effEnergy * 0.45);
    this.plasmaRingInner.rotation.z = -elapsed * (0.4 + effBass * 0.55);
    this.plasmaRingInner.scale.setScalar(1 + effKick * 0.08);
    this.plasmaCoreMat.uniforms.uTime.value = elapsed;
    this.plasmaCoreMat.uniforms.uKick.value = effKick;
    this.plasmaCoreMat.uniforms.uEnergy.value = effEnergy;
    this.plasmaCoreMat.uniforms.uBrightness.value = bright;

    const spin = mode === 'paused' ? 0 : (0.9 + effBass * 2.2) * dt;
    this.turbines.forEach((t, i) => {
      t.rotation.z += i % 2 === 0 ? spin : -spin;
    });

    this.conduitMats.forEach((m, i) => {
      m.color.setHex(i % 2 === 0 ? 0xf59e0b : 0x22d3ee).offsetHSL(0, 0, Math.min(0.2, effSnare * 0.2));
    });

    const activeRatio = particleIntensity === 'low' ? 0.34 : particleIntensity === 'medium' ? 0.68 : 1.0;
    const activeCount = Math.floor(this.sparkCount * activeRatio);
    this.sparkPoints.geometry.setDrawRange(0, activeCount);
    this.sparkMat.opacity = Math.min(0.92, (0.44 + effHigh * 0.25 + effHihat * 0.26) * partMult * bright);

    const pAttr = this.sparkPoints.geometry.attributes.position as THREE.BufferAttribute;
    const riseSpeed = mode === 'paused' ? 0 : 2.8 + effEnergy * 3.8;
    for (let i = 0; i < activeCount; i++) {
      let y = pAttr.getY(i) + riseSpeed * dt;
      if (y > 18) y = -1;
      pAttr.setY(i, y);
    }
    pAttr.needsUpdate = true;
  }

  public dispose(): void {
    this.toonGrad.dispose();
    disposeObjectTree(this.group);
  }
}
