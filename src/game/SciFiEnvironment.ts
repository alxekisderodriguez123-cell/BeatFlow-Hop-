import * as THREE from 'three';
import type { QualityLevel, SongPalette, VisualIntensity } from '../types/game';

function createTechTowerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Deep obsidian metallic cladding
  const bg = ctx.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, '#040714');
  bg.addColorStop(0.5, '#070c22');
  bg.addColorStop(1, '#030510');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 512);

  // Architectural vertical energy conduits
  ctx.fillStyle = 'rgba(34, 211, 238, 0.65)';
  ctx.fillRect(14, 0, 4, 512);
  ctx.fillRect(238, 0, 4, 512);

  ctx.fillStyle = 'rgba(232, 121, 249, 0.45)';
  ctx.fillRect(126, 24, 4, 464);

  // Technological segmented floor ribs & holographic data strips (not apartment windows)
  for (let y = 18; y < 500; y += 22) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(24, y, 208, 4);

    if (y % 44 === 18) {
      const isCyan = (y / 44) % 2 === 0;
      ctx.fillStyle = isCyan ? 'rgba(56, 189, 248, 0.6)' : 'rgba(192, 132, 252, 0.55)';
      ctx.fillRect(32, y + 6, 72, 3);
      ctx.fillRect(152, y + 6, 72, 3);
    } else if (y % 66 === 40) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(48, y + 6, 160, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createGlowSpriteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.65, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class SciFiEnvironment {
  private group = new THREE.Group();
  private primaryColor = new THREE.Color('#22d3ee');
  private secondaryColor = new THREE.Color('#e879f9');
  private accentColor = new THREE.Color('#6366f1');

  // Portal & Horizon Focal Point
  private portalGroup = new THREE.Group();
  private outerPortalRing!: THREE.Mesh;
  private innerPortalRing!: THREE.Mesh;
  private portalCoreMat!: THREE.ShaderMaterial;
  private pylonBeamMats: THREE.MeshBasicMaterial[] = [];
  private archGlowMats: THREE.MeshStandardMaterial[] = [];

  // Technological Metropolis & Holographic Panels
  private towerTex!: THREE.CanvasTexture;
  private towerMat!: THREE.MeshStandardMaterial;
  private holoPanelMats: THREE.ShaderMaterial[] = [];
  private holoPanelMeshes: THREE.Mesh[] = [];
  private floatingNodes: THREE.Mesh[] = [];

  // Equalizer Monoliths
  private eqBarsLeft: THREE.Mesh[] = [];
  private eqBarsRight: THREE.Mesh[] = [];

  // Volumetric Sky Beams
  private skyBeams: THREE.Mesh[] = [];

  // Ambient Tech Particles
  private starPoints!: THREE.Points;
  private starCount = 320;
  private starMat!: THREE.PointsMaterial;

  constructor(scene: THREE.Scene, maxAnisotropy: number) {
    this.towerTex = createTechTowerTexture();
    this.towerTex.anisotropy = maxAnisotropy;

    this.buildNexusPortal();
    this.buildOverheadLightArches();
    this.buildSciFiMetropolis();
    this.buildHolographicPanels();
    this.buildFloatingTechNodes();
    this.buildEqualizerMonoliths();
    this.buildVolumetricBeams();
    this.buildAmbientParticles();

    scene.add(this.group);
  }

  private buildNexusPortal(): void {
    this.portalGroup.position.set(0, 6.2, -52);

    // Outer orbital segmented ring
    const outerGeo = new THREE.TorusGeometry(9.6, 0.22, 12, 64);
    const outerMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.78,
      metalness: 0.8,
      roughness: 0.28,
    });
    this.outerPortalRing = new THREE.Mesh(outerGeo, outerMat);

    // Inner counter-rotating ring
    const innerGeo = new THREE.TorusGeometry(7.2, 0.16, 10, 48, Math.PI * 1.65);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0xe879f9,
      emissive: 0xe879f9,
      emissiveIntensity: 0.85,
      metalness: 0.82,
      roughness: 0.25,
    });
    this.innerPortalRing = new THREE.Mesh(innerGeo, innerMat);

    // Procedural GLSL holographic resonance core disc
    const coreGeo = new THREE.CircleGeometry(6.8, 48);
    this.portalCoreMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0.2 },
        uBrightness: { value: 1.0 },
        uColorA: { value: this.primaryColor.clone() },
        uColorB: { value: this.secondaryColor.clone() },
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
        uniform float uEnergy;
        uniform float uBrightness;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying vec2 vUv;

        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float angle = atan(p.y, p.x);

          float rings = sin(r * 20.0 - uTime * (2.5 + uEnergy * 3.0)) * 0.5 + 0.5;
          float sweep = smoothstep(0.0, 1.0, sin(angle * 4.0 + uTime * 1.2) * 0.5 + 0.5);
          float coreFade = smoothstep(1.0, 0.14, r);
          float rimGlow = smoothstep(0.75, 0.98, r) * smoothstep(1.02, 0.95, r);

          vec3 col = mix(uColorA, uColorB, sweep * 0.65 + r * 0.35);
          float alpha = (coreFade * (0.09 + rings * 0.12 + uEnergy * 0.16) + rimGlow * 0.38);
          gl_FragColor = vec4(col * (0.68 + uEnergy * 0.35) * uBrightness, clamp(alpha, 0.0, 0.55));
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const coreDisc = new THREE.Mesh(coreGeo, this.portalCoreMat);
    this.portalGroup.add(this.outerPortalRing, this.innerPortalRing, coreDisc);

    // Twin Monumental Angled Cyber Pylons framing the Portal
    const pylonBodyGeo = new THREE.BoxGeometry(1.1, 14.5, 1.6);
    const pylonDarkMat = new THREE.MeshStandardMaterial({
      color: 0x060a1c,
      metalness: 0.9,
      roughness: 0.2,
    });
    const conduitGeo = new THREE.BoxGeometry(0.18, 13.8, 0.24);

    [-1, 1].forEach((side, idx) => {
      const pylon = new THREE.Mesh(pylonBodyGeo, pylonDarkMat);
      pylon.position.set(side * 8.8, 0.5, 1.2);
      pylon.rotation.z = side * 0.12;

      const conduitMat = new THREE.MeshBasicMaterial({
        color: idx === 0 ? 0x22d3ee : 0xe879f9,
      });
      this.pylonBeamMats.push(conduitMat);
      const conduit = new THREE.Mesh(conduitGeo, conduitMat);
      conduit.position.set(-side * 0.55, 0, 0.68);
      pylon.add(conduit);

      this.portalGroup.add(pylon);
    });

    this.group.add(this.portalGroup);
  }

  private buildOverheadLightArches(): void {
    // 4 sleek futuristic light bridges spanning over the highway to give tunnel depth
    const archPositionsZ = [-10, -21, -32, -43];
    const archDarkMat = new THREE.MeshStandardMaterial({
      color: 0x050816,
      metalness: 0.88,
      roughness: 0.22,
    });

    archPositionsZ.forEach((z, idx) => {
      const archGroup = new THREE.Group();
      archGroup.position.set(0, 0, z);

      // Left & right angled pillars outside the highway rails
      const legGeo = new THREE.BoxGeometry(0.26, 7.2, 0.35);
      const leftLeg = new THREE.Mesh(legGeo, archDarkMat);
      leftLeg.position.set(-5.6, 3.3, 0);
      leftLeg.rotation.z = -0.18;

      const rightLeg = new THREE.Mesh(legGeo, archDarkMat);
      rightLeg.position.set(5.6, 3.3, 0);
      rightLeg.rotation.z = 0.18;

      // Top truss beam
      const topGeo = new THREE.BoxGeometry(10.2, 0.28, 0.4);
      const topBeam = new THREE.Mesh(topGeo, archDarkMat);
      topBeam.position.set(0, 6.75, 0);

      // Glowing under-strip (controlled emissive to avoid washing out overhead tunnel)
      const glowMat = new THREE.MeshStandardMaterial({
        color: idx % 2 === 0 ? 0x22d3ee : 0xe879f9,
        emissive: idx % 2 === 0 ? 0x22d3ee : 0xe879f9,
        emissiveIntensity: 0.65,
        roughness: 0.25,
      });
      this.archGlowMats.push(glowMat);

      const stripGeo = new THREE.BoxGeometry(8.8, 0.08, 0.12);
      const strip = new THREE.Mesh(stripGeo, glowMat);
      strip.position.set(0, 6.56, 0);

      archGroup.add(leftLeg, rightLeg, topBeam, strip);
      this.group.add(archGroup);
    });
  }

  private buildSciFiMetropolis(): void {
    const bGeo = new THREE.BoxGeometry(1, 1, 1);
    this.towerMat = new THREE.MeshStandardMaterial({
      map: this.towerTex,
      emissiveMap: this.towerTex,
      emissive: new THREE.Color(0x6366f1),
      emissiveIntensity: 0.45,
      roughness: 0.42,
      metalness: 0.65,
      envMapIntensity: 0.4,
    });

    const count = 48;
    const towers = new THREE.InstancedMesh(bGeo, this.towerMat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const tier = i % 3;
      const z = -7 - (i * 1.15) % 52;
      const x = side * (10.5 + tier * 4.2 + Math.sin(i * 1.9) * 1.2);
      const h = 10 + ((i * 5) % 18) + tier * 3.5;
      const w = 2.1 + (i % 3) * 0.9;

      dummy.position.set(x, h * 0.5 - 0.5, z);
      dummy.scale.set(w, h, w * 1.15);
      dummy.updateMatrix();
      towers.setMatrixAt(i, dummy.matrix);
    }

    towers.instanceMatrix.needsUpdate = true;
    towers.computeBoundingSphere();
    this.group.add(towers);

    // Sleek glowing spire antennas on selected foreground towers
    const spireGeo = new THREE.CylinderGeometry(0.03, 0.08, 4.5, 8);
    const spireMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const spire = new THREE.Mesh(spireGeo, spireMat);
      spire.position.set(side * (12.5 + (i % 3) * 3.5), 16 + (i % 4) * 3, -12 - i * 4.2);
      this.group.add(spire);
    }
  }

  private buildHolographicPanels(): void {
    const panelGeo = new THREE.PlaneGeometry(2.6, 1.5);
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -12 - Math.floor(i / 2) * 14;
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uEnergy: { value: 0.3 },
          uBrightness: { value: 1.0 },
          uColor: { value: (i % 2 === 0 ? this.primaryColor : this.secondaryColor).clone() },
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
          uniform float uEnergy;
          uniform float uBrightness;
          uniform vec3 uColor;
          varying vec2 vUv;

          void main() {
            float border = step(vUv.x, 0.04) + step(0.96, vUv.x) + step(vUv.y, 0.06) + step(0.94, vUv.y);
            float scanline = sin(vUv.y * 42.0 - uTime * 4.0) * 0.5 + 0.5;
            float wave = smoothstep(0.06, 0.0, abs(vUv.y - (0.5 + 0.25 * sin(vUv.x * 8.0 + uTime * 3.0) * (0.4 + uEnergy))));
            float alpha = clamp(border * 0.4 + scanline * 0.08 + wave * (0.35 + uEnergy * 0.25), 0.0, 0.62);
            gl_FragColor = vec4(uColor * (0.75 + wave * 0.35) * uBrightness, alpha);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(panelGeo, mat);
      mesh.position.set(side * 6.8, 3.8 + (i % 3) * 0.4, z);
      mesh.rotation.y = -side * 0.65;
      this.group.add(mesh);
      this.holoPanelMats.push(mat);
      this.holoPanelMeshes.push(mesh);
    }
  }

  private buildFloatingTechNodes(): void {
    const nodeGeo = new THREE.OctahedronGeometry(0.32, 0);
    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const mat = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0x22d3ee : 0xe879f9,
        emissive: i % 2 === 0 ? 0x22d3ee : 0xe879f9,
        emissiveIntensity: 0.65,
        metalness: 0.72,
        roughness: 0.32,
      });
      const node = new THREE.Mesh(nodeGeo, mat);
      node.position.set(side * (6.2 + (i % 3) * 1.4), 2.4 + (i % 4) * 0.8, -8 - i * 4.2);
      node.userData.baseY = node.position.y;
      node.userData.phase = i * 0.85;
      this.group.add(node);
      this.floatingNodes.push(node);
    }
  }

  private buildEqualizerMonoliths(): void {
    const barGeo = new THREE.BoxGeometry(0.28, 1, 0.45);
    for (let i = 0; i < 14; i++) {
      const z = -3.5 - i * 3.1;
      const ratio = i / 13;
      const col = new THREE.Color().lerpColors(
        new THREE.Color(0x0891b2),
        new THREE.Color(0xc026d3),
        ratio,
      );

      const matL = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.62,
        roughness: 0.3,
        metalness: 0.5,
        envMapIntensity: 0.35,
      });
      const matR = matL.clone();

      const barL = new THREE.Mesh(barGeo, matL);
      barL.position.set(-4.35, 0.5, z);
      const barR = new THREE.Mesh(barGeo, matR);
      barR.position.set(4.35, 0.5, z);

      this.group.add(barL, barR);
      this.eqBarsLeft.push(barL);
      this.eqBarsRight.push(barR);
    }
  }

  private buildVolumetricBeams(): void {
    const beamGeo = new THREE.CylinderGeometry(0.18, 1.4, 24, 12, 1, true);
    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const mat = new THREE.MeshBasicMaterial({
        color: i < 2 ? 0x22d3ee : 0xe879f9,
        transparent: true,
        opacity: 0.04,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const beam = new THREE.Mesh(beamGeo, mat);
      beam.position.set(side * (7.8 + (i >= 2 ? 3.8 : 0)), 11.5, -40 - (i >= 2 ? 6 : 0));
      beam.rotation.z = side * -0.16;
      this.group.add(beam);
      this.skyBeams.push(beam);
    }
  }

  private buildAmbientParticles(): void {
    const positions = new Float32Array(this.starCount * 3);
    const colors = new Float32Array(this.starCount * 3);
    const c1 = new THREE.Color(0x22d3ee);
    const c2 = new THREE.Color(0xe879f9);
    const c3 = new THREE.Color(0x94a3b8);

    for (let i = 0; i < this.starCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 46;
      positions[i * 3 + 1] = 1.6 + Math.random() * 22;
      positions[i * 3 + 2] = -60 + Math.random() * 68;

      const pick = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      colors[i * 3] = pick.r;
      colors[i * 3 + 1] = pick.g;
      colors[i * 3 + 2] = pick.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.starMat = new THREE.PointsMaterial({
      size: 0.24,
      map: createGlowSpriteTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.starPoints = new THREE.Points(geo, this.starMat);
    this.group.add(this.starPoints);
  }

  public setPalette(palette: SongPalette): void {
    this.primaryColor.set(palette.primary);
    this.secondaryColor.set(palette.secondary);
    this.accentColor.set(palette.accent);

    this.portalCoreMat.uniforms.uColorA.value.copy(this.primaryColor);
    this.portalCoreMat.uniforms.uColorB.value.copy(this.secondaryColor);
    (this.outerPortalRing.material as THREE.MeshStandardMaterial).color.copy(this.primaryColor);
    (this.outerPortalRing.material as THREE.MeshStandardMaterial).emissive.copy(this.primaryColor);
    (this.innerPortalRing.material as THREE.MeshStandardMaterial).color.copy(this.secondaryColor);
    (this.innerPortalRing.material as THREE.MeshStandardMaterial).emissive.copy(this.secondaryColor);

    if (this.pylonBeamMats[0]) this.pylonBeamMats[0].color.copy(this.primaryColor);
    if (this.pylonBeamMats[1]) this.pylonBeamMats[1].color.copy(this.secondaryColor);

    this.archGlowMats.forEach((m, idx) => {
      const c = idx % 2 === 0 ? this.primaryColor : this.secondaryColor;
      m.color.copy(c);
      m.emissive.copy(c);
    });

    this.holoPanelMats.forEach((m, idx) => {
      m.uniforms.uColor.value.copy(idx % 2 === 0 ? this.primaryColor : this.secondaryColor);
    });

    this.skyBeams.forEach((beam, idx) => {
      (beam.material as THREE.MeshBasicMaterial).color.copy(
        idx < 2 ? this.primaryColor : this.secondaryColor,
      );
    });
  }

  public update(params: {
    dt: number;
    elapsed: number;
    mode: 'idle' | 'playing' | 'paused' | 'ended';
    bass: number;
    mid: number;
    high: number;
    energy: number;
    inSilence: boolean;
    reactiveEnabled: boolean;
    visualIntensity: VisualIntensity;
    particleIntensity: VisualIntensity;
    graphicsQuality: QualityLevel;
    brightness: number;
  }): void {
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
    } = params;

    const visMult = visualIntensity === 'low' ? 0.42 : visualIntensity === 'medium' ? 0.72 : 1.0;
    const partMult = particleIntensity === 'low' ? 0.32 : particleIntensity === 'medium' ? 0.65 : 0.92;
    const brightScale = THREE.MathUtils.clamp(brightness, 0.5, 1.35);
    const silenceDamp = inSilence ? 0.32 : 1.0;

    const effectiveBass = reactiveEnabled ? bass * visMult * silenceDamp : 0.14;
    const effectiveMid = reactiveEnabled ? mid * visMult * silenceDamp : 0.12;
    const effectiveHigh = reactiveEnabled ? high * visMult * silenceDamp : 0.1;
    const effectiveEnergy = reactiveEnabled ? energy * visMult * silenceDamp : 0.15;

    // Animated tower energy conduit scroll (balanced emissive, never blows out)
    this.towerTex.offset.y = -(elapsed * (inSilence ? 0.04 : 0.14 + effectiveEnergy * 0.2)) % 1;
    this.towerMat.emissiveIntensity = (0.34 + effectiveEnergy * 0.48) * brightScale;

    // Portal rotation & resonance shader
    const rotSpeed = mode === 'paused' ? 0 : (0.18 + effectiveBass * 0.4) * silenceDamp;
    this.outerPortalRing.rotation.z += dt * rotSpeed;
    this.innerPortalRing.rotation.z -= dt * rotSpeed * 1.45;
    (this.outerPortalRing.material as THREE.MeshStandardMaterial).emissiveIntensity =
      (0.55 + effectiveBass * 0.45) * brightScale;
    (this.innerPortalRing.material as THREE.MeshStandardMaterial).emissiveIntensity =
      (0.6 + effectiveMid * 0.45) * brightScale;
    this.portalCoreMat.uniforms.uTime.value = elapsed;
    this.portalCoreMat.uniforms.uEnergy.value = effectiveEnergy;
    this.portalCoreMat.uniforms.uBrightness.value = brightScale;

    // Overhead light bridge pulses (kept crisp & bounded)
    this.archGlowMats.forEach((mat, idx) => {
      const wave = 0.5 + 0.5 * Math.sin(elapsed * 3.5 - idx * 1.1);
      mat.emissiveIntensity = (0.42 + wave * 0.25 + effectiveBass * 0.6) * silenceDamp * brightScale;
    });

    // Holographic HUD panels
    this.holoPanelMats.forEach((mat, idx) => {
      mat.uniforms.uTime.value = elapsed + idx * 0.7;
      mat.uniforms.uEnergy.value = effectiveEnergy;
      mat.uniforms.uBrightness.value = brightScale;
    });

    // Subtle float on tech nodes
    for (const node of this.floatingNodes) {
      const phase = node.userData.phase as number;
      const baseY = node.userData.baseY as number;
      node.position.y = baseY + Math.sin(elapsed * 1.6 + phase) * 0.25;
      node.rotation.y += dt * (0.7 + effectiveHigh * 1.2);
      node.rotation.x += dt * 0.3;
      (node.material as THREE.MeshStandardMaterial).emissiveIntensity =
        (0.45 + effectiveHigh * 0.45) * brightScale;
    }

    // Equalizer monolith pillars
    for (let i = 0; i < this.eqBarsLeft.length; i++) {
      const bandVal = i < 4 ? effectiveBass : i < 9 ? effectiveMid : effectiveHigh;
      const idleWave = 0.35 + 0.25 * Math.sin(elapsed * 2.2 + i * 0.55);
      const targetH =
        mode === 'playing' && reactiveEnabled
          ? 0.45 + bandVal * (6.2 - i * 0.18)
          : idleWave * 1.6;
      const barL = this.eqBarsLeft[i];
      const barR = this.eqBarsRight[i];
      barL.scale.y = THREE.MathUtils.damp(barL.scale.y, targetH, 16, dt);
      barR.scale.y = THREE.MathUtils.damp(barR.scale.y, targetH, 16, dt);
      barL.position.y = barL.scale.y * 0.5;
      barR.position.y = barR.scale.y * 0.5;

      const eqEmissive = (0.42 + bandVal * 0.48) * silenceDamp * brightScale;
      (barL.material as THREE.MeshStandardMaterial).emissiveIntensity = eqEmissive;
      (barR.material as THREE.MeshStandardMaterial).emissiveIntensity = eqEmissive;
    }

    // Volumetric light beams
    const showBeams = graphicsQuality !== 'low';
    this.skyBeams.forEach((beam, idx) => {
      beam.visible = showBeams;
      if (!showBeams) return;
      const mat = beam.material as THREE.MeshBasicMaterial;
      const pulse = idx < 2 ? effectiveBass : effectiveMid;
      mat.opacity = (0.022 + pulse * 0.055) * silenceDamp * brightScale;
    });

    // Ambient flowing particles
    const starPos = this.starPoints.geometry.attributes.position as THREE.BufferAttribute;
    const starSpeed =
      mode === 'playing'
        ? (10 + effectiveBass * 14) * silenceDamp
        : mode === 'idle'
          ? 3.5
          : 0.35;
    const activeRatio = particleIntensity === 'low' ? 0.3 : particleIntensity === 'medium' ? 0.65 : 1.0;
    const activeCount = Math.floor(this.starCount * activeRatio);
    this.starPoints.geometry.setDrawRange(0, activeCount);
    this.starMat.opacity = (0.26 + effectiveEnergy * 0.28) * partMult * brightScale * (inSilence ? 0.45 : 1);

    for (let i = 0; i < activeCount; i++) {
      let z = starPos.getZ(i) + starSpeed * dt;
      if (z > 8) z = -60;
      starPos.setZ(i, z);
    }
    starPos.needsUpdate = true;
  }

  public dispose(): void {
    this.towerTex.dispose();
    this.starMat.map?.dispose();
  }
}
