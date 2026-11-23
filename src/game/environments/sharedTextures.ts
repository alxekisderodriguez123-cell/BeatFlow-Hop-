import * as THREE from 'three';
import { SeededRng } from './seededRandom';

export function createSoftGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.65, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCloudPuffTexture(tintHex = '#ffffff'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const col = new THREE.Color(tintHex);
  const r = Math.round(col.r * 255);
  const g = Math.round(col.g * 255);
  const b = Math.round(col.b * 255);

  const puffs = [
    { x: 64, y: 64, rad: 54, a: 0.32 },
    { x: 46, y: 58, rad: 38, a: 0.28 },
    { x: 84, y: 66, rad: 36, a: 0.25 },
    { x: 62, y: 48, rad: 34, a: 0.22 },
  ];
  for (const p of puffs) {
    const grad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.rad);
    grad.addColorStop(0, `rgba(${r},${g},${b},${p.a})`);
    grad.addColorStop(0.55, `rgba(${r},${g},${b},${p.a * 0.45})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCyberFacadeTexture(
  rng: SeededRng,
  anisotropy: number,
  warmMode = false,
): { albedo: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const w = 256;
  const h = 512;

  const aCanvas = document.createElement('canvas');
  aCanvas.width = w;
  aCanvas.height = h;
  const aCtx = aCanvas.getContext('2d')!;

  const eCanvas = document.createElement('canvas');
  eCanvas.width = w;
  eCanvas.height = h;
  const eCtx = eCanvas.getContext('2d')!;

  // Dark architectural concrete/glass base
  const bg = aCtx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, warmMode ? '#090e1c' : '#050816');
  bg.addColorStop(0.6, warmMode ? '#0f1628' : '#080e24');
  bg.addColorStop(1, '#040610');
  aCtx.fillStyle = bg;
  aCtx.fillRect(0, 0, w, h);

  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, w, h);

  const cols = warmMode ? 12 : 10;
  const rows = warmMode ? 34 : 28;
  const padX = 14;
  const padY = 14;
  const cellW = (w - padX * 2) / cols;
  const cellH = (h - padY * 2) / rows;

  const paletteCols = warmMode
    ? ['#fbbf24', '#fde68a', '#f97316', '#7dd3fc', '#e2e8f0']
    : ['#22d3ee', '#38bdf8', '#e879f9', '#f472b6', '#fb923c'];

  for (let row = 0; row < rows; row++) {
    const floorLitProb = rng.range(0.28, 0.78);
    // Occasional dark mechanical floor
    if (row % 7 === 0) {
      aCtx.fillStyle = '#03050d';
      aCtx.fillRect(4, padY + row * cellH, w - 8, cellH * 0.85);
      continue;
    }

    const floorTint = rng.pick(paletteCols);
    for (let col = 0; col < cols; col++) {
      const x = padX + col * cellW + 2;
      const y = padY + row * cellH + 2;
      const ww = Math.max(3, cellW - 4);
      const wh = Math.max(3, cellH - 5);

      // Subtle window pane frame on albedo
      aCtx.fillStyle = '#111a33';
      aCtx.fillRect(x, y, ww, wh);

      if (rng.next() < floorLitProb) {
        const c = rng.next() < 0.75 ? floorTint : rng.pick(paletteCols);
        const alpha = rng.range(0.45, 0.92);
        eCtx.fillStyle = c;
        eCtx.globalAlpha = alpha;
        eCtx.fillRect(x, y, ww, wh);

        aCtx.fillStyle = c;
        aCtx.globalAlpha = alpha * 0.45;
        aCtx.fillRect(x, y, ww, wh);
      }
    }
    eCtx.globalAlpha = 1;
    aCtx.globalAlpha = 1;
  }

  // Vertical architectural neon trims for Cyberpunk mode
  if (!warmMode) {
    const stripCol = rng.pick(['#22d3ee', '#e879f9', '#fb7185']);
    eCtx.fillStyle = stripCol;
    eCtx.globalAlpha = 0.7;
    eCtx.fillRect(5, 8, 3, h - 16);
    eCtx.fillRect(w - 8, 8, 3, h - 16);
    eCtx.globalAlpha = 1;
  }

  const albedo = new THREE.CanvasTexture(aCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = THREE.RepeatWrapping;
  albedo.wrapT = THREE.RepeatWrapping;
  albedo.anisotropy = anisotropy;

  const emissive = new THREE.CanvasTexture(eCanvas);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.wrapS = THREE.RepeatWrapping;
  emissive.wrapT = THREE.RepeatWrapping;
  emissive.anisotropy = anisotropy;

  return { albedo, emissive };
}

export function createCyberBillboardTexture(
  rng: SeededRng,
  anisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const primary = rng.pick(['#06b6d4', '#ec4899', '#f97316', '#8b5cf6']);
  const secondary = rng.pick(['#22d3ee', '#fde047', '#f472b6', '#38bdf8']);

  ctx.fillStyle = '#040817';
  ctx.fillRect(0, 0, 256, 128);

  // Glowing tech border
  ctx.strokeStyle = primary;
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 120);

  // Diagonal cyber stripes / graphic
  ctx.fillStyle = secondary;
  ctx.globalAlpha = 0.22;
  for (let i = -32; i < 256; i += 24) {
    ctx.beginPath();
    ctx.moveTo(i, 120);
    ctx.lineTo(i + 12, 120);
    ctx.lineTo(i + 44, 8);
    ctx.lineTo(i + 32, 8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Graphic EQ bars or cyber emblem
  const bars = 12;
  for (let i = 0; i < bars; i++) {
    const bh = rng.range(18, 74);
    ctx.fillStyle = i % 2 === 0 ? primary : secondary;
    ctx.fillRect(22 + i * 18, 102 - bh, 12, bh);
  }

  // Top accent bar
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.fillRect(22, 16, 140, 7);
  ctx.fillStyle = primary;
  ctx.fillRect(172, 16, 62, 7);
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

export function disposeObjectTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh | THREE.Points | THREE.Line;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const mat = (mesh as THREE.Mesh).material;
    if (mat) {
      const list = Array.isArray(mat) ? mat : [mat];
      for (const m of list) {
        materials.add(m);
        for (const val of Object.values(m)) {
          if (val && (val as THREE.Texture).isTexture) {
            textures.add(val as THREE.Texture);
          }
        }
        const shaderMat = m as THREE.ShaderMaterial;
        if (shaderMat.uniforms) {
          for (const u of Object.values(shaderMat.uniforms)) {
            if (u?.value && (u.value as THREE.Texture).isTexture) {
              textures.add(u.value as THREE.Texture);
            }
          }
        }
      }
    }
  });

  geometries.forEach((g) => g.dispose());
  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
}
