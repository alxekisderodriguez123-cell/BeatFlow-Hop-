import * as THREE from 'three';
import type { SeededRng } from './seededRandom';

/**
 * 3-step nearest-filtered gradient texture for cohesive cel-shaded 2.5D foreground 3D props.
 */
export function createCelToonGradientMap(): THREE.DataTexture {
  const data = new Uint8Array([92, 178, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Attaches a crisp comic/illustration dark ink outline shell to a 3D mesh (BackSide extrusion).
 */
export function addInkOutline(
  mesh: THREE.Mesh,
  outlineColor = 0x0a071c,
  scaleThickness = 1.045,
): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    color: outlineColor,
    side: THREE.BackSide,
  });
  const outline = new THREE.Mesh(mesh.geometry, mat);
  outline.scale.setScalar(scaleThickness);
  mesh.add(outline);
  return outline;
}

/**
 * Crisp 4-point diamond/cross sparkle sprite matching stylized rhythm-game skies.
 */
export function createCrossStarTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  glow.addColorStop(0, 'rgba(255,255,255,0.98)');
  glow.addColorStop(0.22, 'rgba(255,255,255,0.52)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);

  // Crisp 4-point star diamond
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(32, 5);
  ctx.quadraticCurveTo(34, 30, 59, 32);
  ctx.quadraticCurveTo(34, 34, 32, 59);
  ctx.quadraticCurveTo(30, 34, 5, 32);
  ctx.quadraticCurveTo(30, 30, 32, 5);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Crisp stylized vector cloud ribbon texture with body shading + sunlit/neon rim edge.
 */
export function createStylizedCloudTexture(
  bodyHex: string,
  rimHex: string,
  inkHex = '#190f38',
  flip = false,
): THREE.CanvasTexture {
  const w = 512;
  const h = 192;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  if (flip) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }

  const drawCloudShape = (offsetY: number) => {
    ctx.beginPath();
    ctx.moveTo(28, 146 + offsetY);
    ctx.bezierCurveTo(18, 118 + offsetY, 62, 92 + offsetY, 108, 106 + offsetY);
    ctx.bezierCurveTo(126, 62 + offsetY, 198, 46 + offsetY, 242, 84 + offsetY);
    ctx.bezierCurveTo(278, 34 + offsetY, 368, 38 + offsetY, 398, 92 + offsetY);
    ctx.bezierCurveTo(442, 82 + offsetY, 488, 110 + offsetY, 484, 146 + offsetY);
    ctx.quadraticCurveTo(260, 160 + offsetY, 28, 146 + offsetY);
    ctx.closePath();
  };

  // Bright rim underside highlight
  drawCloudShape(5);
  ctx.fillStyle = rimHex;
  ctx.globalAlpha = 0.72;
  ctx.fill();

  // Main cloud body
  ctx.globalAlpha = 0.92;
  const grad = ctx.createLinearGradient(0, 42, 0, 155);
  grad.addColorStop(0, bodyHex);
  grad.addColorStop(0.75, bodyHex);
  grad.addColorStop(1, rimHex);
  drawCloudShape(0);
  ctx.fillStyle = grad;
  ctx.fill();

  // Crisp subtle upper rim outline
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = inkHex;
  ctx.lineWidth = 3;
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Illustrated full moon with crisp stylized craters and soft atmospheric halo.
 */
export function createIllustratedMoonTexture(
  coreHex = '#f8fafc',
  craterHex = '#cbd5e1',
  haloHex = '#a5f3fc',
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size * 0.5;

  // Atmospheric outer halo
  const halo = ctx.createRadialGradient(c, c, 46, c, c, 126);
  halo.addColorStop(0, haloHex);
  halo.addColorStop(0.35, 'rgba(186, 230, 253, 0.34)');
  halo.addColorStop(1, 'rgba(186, 230, 253, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  // Moon disc clipped
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, 54, 0, Math.PI * 2);
  ctx.clip();

  const discGrad = ctx.createRadialGradient(c - 14, c - 16, 8, c, c, 56);
  discGrad.addColorStop(0, '#ffffff');
  discGrad.addColorStop(0.65, coreHex);
  discGrad.addColorStop(1, craterHex);
  ctx.fillStyle = discGrad;
  ctx.fillRect(c - 56, c - 56, 112, 112);

  // Subtle illustrated maria / craters
  const craters = [
    { x: c - 16, y: c - 14, r: 12, a: 0.25 },
    { x: c + 18, y: c - 6, r: 9, a: 0.22 },
    { x: c - 4, y: c + 16, r: 14, a: 0.2 },
    { x: c + 20, y: c + 20, r: 7, a: 0.18 },
    { x: c - 26, y: c + 10, r: 6, a: 0.16 },
  ];
  for (const cr of craters) {
    ctx.fillStyle = craterHex;
    ctx.globalAlpha = cr.a;
    ctx.beginPath();
    ctx.arc(cr.x, cr.y, cr.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Crisp bright rim
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c, c, 54, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Illustrated radiant sunset or retro striped synthwave sun texture.
 */
export function createIllustratedSunTexture(
  topHex: string,
  bottomHex: string,
  glowHex: string,
  stripedSynthwave = false,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size * 0.5;

  // Radiant sunset/synthwave bloom halo
  const halo = ctx.createRadialGradient(c, c, 44, c, c, 128);
  halo.addColorStop(0, '#ffffff');
  halo.addColorStop(0.28, glowHex);
  halo.addColorStop(1, 'rgba(255, 160, 80, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, 64, 0, Math.PI * 2);
  ctx.clip();

  const grad = ctx.createLinearGradient(0, c - 64, 0, c + 64);
  grad.addColorStop(0, topHex);
  grad.addColorStop(0.58, bottomHex);
  grad.addColorStop(1, glowHex);
  ctx.fillStyle = grad;
  ctx.fillRect(c - 65, c - 65, 130, 130);

  if (stripedSynthwave) {
    ctx.globalCompositeOperation = 'destination-out';
    const bands = [
      { y: c + 8, h: 3 },
      { y: c + 19, h: 5 },
      { y: c + 31, h: 7 },
      { y: c + 44, h: 9 },
      { y: c + 56, h: 10 },
    ];
    for (const b of bands) {
      ctx.fillRect(c - 70, b.y, 140, b.h);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Illustrated 2.5D skyscraper silhouette panel with dark ink outlines, neon roof edges & crisp windows.
 */
export function createIllustratedSkylineLayerTexture(
  rng: SeededRng,
  anisotropy: number,
  options: {
    bodyTop: string;
    bodyBottom: string;
    inkColor: string;
    rimColors: string[];
    windowColors: string[];
    includeSpires?: boolean;
  },
): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const buildingCount = 13;
  const slotW = w / buildingCount;

  for (let i = 0; i < buildingCount; i++) {
    const bw = rng.range(slotW * 0.72, slotW * 1.18);
    const bx = i * slotW - bw * 0.08 + rng.range(-6, 6);
    const bh = rng.range(h * 0.34, h * 0.84);
    const by = h - bh;
    const rimCol = options.rimColors[i % options.rimColors.length];

    // Building body
    const bg = ctx.createLinearGradient(bx, by, bx, h);
    bg.addColorStop(0, options.bodyTop);
    bg.addColorStop(1, options.bodyBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(bx, by, bw, bh);

    // Optional stepped crown setback
    if (i % 3 === 0) {
      const capW = bw * 0.62;
      const capH = rng.range(24, 48);
      const capX = bx + (bw - capW) * 0.5;
      const capY = by - capH + 2;
      ctx.fillStyle = options.bodyTop;
      ctx.fillRect(capX, capY, capW, capH);
      ctx.strokeStyle = options.inkColor;
      ctx.lineWidth = 3.5;
      ctx.strokeRect(capX, capY, capW, capH);

      // Luminous roof rim
      ctx.fillStyle = rimCol;
      ctx.fillRect(capX + 2, capY + 2, capW - 4, 4);

      if (options.includeSpires && i % 2 === 0) {
        ctx.fillStyle = rimCol;
        ctx.fillRect(capX + capW * 0.5 - 2, capY - 38, 4, 38);
      }
    }

    // Crisp ink contour
    ctx.strokeStyle = options.inkColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(bx, by, bw, bh);

    // Bright stylized rooftop & side rim line
    ctx.fillStyle = rimCol;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(bx + 3, by + 2, bw - 6, 4);
    ctx.fillRect(bx + 3, by + 2, 3, bh * 0.55);
    ctx.globalAlpha = 1;

    // Sharp geometric neon window grid
    const cols = Math.max(3, Math.floor(bw / 15));
    const rows = Math.max(6, Math.floor(bh / 16));
    const cellW = (bw - 18) / cols;
    const cellH = (bh - 28) / rows;
    const rowTint = options.windowColors[i % options.windowColors.length];

    for (let r = 0; r < rows; r++) {
      if (r % 6 === 0) continue; // mechanical dark band
      const rowLit = rng.range(0.32, 0.82);
      const cTint = r % 5 === 0 ? rimCol : rowTint;
      for (let c = 0; c < cols; c++) {
        if (rng.next() > rowLit) continue;
        const wx = bx + 9 + c * cellW + 1.5;
        const wy = by + 16 + r * cellH + 2;
        const ww = Math.max(4, cellW - 4);
        const wh = Math.max(4, cellH - 5);
        ctx.fillStyle = rng.next() < 0.78 ? cTint : options.windowColors[(i + c) % options.windowColors.length];
        ctx.globalAlpha = rng.range(0.55, 0.95);
        ctx.fillRect(wx, wy, ww, wh);
      }
    }
    ctx.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

/**
 * Illustrated 2.5D tropical palm grove & coastal rock silhouette panel (Reference 1 aesthetic).
 */
export function createIllustratedPalmShoreTexture(
  rng: SeededRng,
  anisotropy: number,
  options: {
    silhouetteHex: string;
    rimHex: string;
    inkHex: string;
    leanRight: boolean;
  },
): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Coastal rock shelf along bottom
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h - 78);
  ctx.quadraticCurveTo(220, h - 130, 480, h - 84);
  ctx.quadraticCurveTo(760, h - 42, w, h - 98);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = options.silhouetteHex;
  ctx.fill();
  ctx.strokeStyle = options.inkHex;
  ctx.lineWidth = 4;
  ctx.stroke();

  const palmCount = 5;
  for (let i = 0; i < palmCount; i++) {
    const baseX = rng.range(110, w - 120);
    const baseY = h - 48;
    const topY = rng.range(85, 210);
    const lean = (options.leanRight ? 1 : -1) * rng.range(45, 115);
    const topX = baseX + lean;

    // Curved trunk polygon
    ctx.beginPath();
    ctx.moveTo(baseX - 16, baseY);
    ctx.quadraticCurveTo(baseX + lean * 0.35 - 10, (baseY + topY) * 0.5, topX - 6, topY);
    ctx.lineTo(topX + 6, topY);
    ctx.quadraticCurveTo(baseX + lean * 0.35 + 10, (baseY + topY) * 0.5, baseX + 16, baseY);
    ctx.closePath();
    ctx.fillStyle = options.silhouetteHex;
    ctx.fill();
    ctx.strokeStyle = options.inkHex;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Rim highlight on sunlit edge of trunk
    ctx.beginPath();
    ctx.moveTo(baseX + (options.leanRight ? 12 : -12), baseY - 12);
    ctx.quadraticCurveTo(
      baseX + lean * 0.35 + (options.leanRight ? 7 : -7),
      (baseY + topY) * 0.5,
      topX + (options.leanRight ? 4 : -4),
      topY,
    );
    ctx.strokeStyle = options.rimHex;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.72;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Stylized arching palm fronds
    const fronds = 7;
    for (let f = 0; f < fronds; f++) {
      const ang = -Math.PI * 0.95 + (f / (fronds - 1)) * Math.PI * 1.15;
      const len = rng.range(88, 138);
      const ex = topX + Math.cos(ang) * len;
      const ey = topY + Math.sin(ang) * len * 0.68 + 34;
      const cx = topX + Math.cos(ang) * len * 0.52;
      const cy = topY + Math.sin(ang) * len * 0.35 - 24;

      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.quadraticCurveTo(cx, cy, ex, ey);
      ctx.quadraticCurveTo(cx + 4, cy + 20, topX, topY + 6);
      ctx.closePath();
      ctx.fillStyle = options.silhouetteHex;
      ctx.fill();
      ctx.strokeStyle = options.inkHex;
      ctx.lineWidth = 2.8;
      ctx.stroke();

      // Sunlit frond rim stroke
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.quadraticCurveTo(cx, cy, ex, ey);
      ctx.strokeStyle = options.rimHex;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.78;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

/**
 * Illustrated 2.5D geometric mountain ridge + ink contours + sunlit/neon facets.
 */
export function createIllustratedMountainTexture(
  rng: SeededRng,
  anisotropy: number,
  options: {
    shadeHex: string;
    litHex: string;
    rimHex: string;
    inkHex: string;
    includePines?: boolean;
  },
): THREE.CanvasTexture {
  const w = 1024;
  const h = 420;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const peakCount = 7;
  const step = w / peakCount;

  for (let i = 0; i < peakCount; i++) {
    const px = (i + 0.5) * step + rng.range(-28, 28);
    const py = rng.range(52, 185);
    const leftX = px - rng.range(135, 200);
    const rightX = px + rng.range(135, 200);

    // Shadow half
    ctx.beginPath();
    ctx.moveTo(leftX, h);
    ctx.lineTo(px, py);
    ctx.lineTo(px + rng.range(-18, 22), h);
    ctx.closePath();
    ctx.fillStyle = options.shadeHex;
    ctx.fill();

    // Lit facet half
    ctx.beginPath();
    ctx.moveTo(px + rng.range(-18, 22), h);
    ctx.lineTo(px, py);
    ctx.lineTo(rightX, h);
    ctx.closePath();
    ctx.fillStyle = options.litHex;
    ctx.fill();

    // Crisp outer ink contour
    ctx.beginPath();
    ctx.moveTo(leftX, h);
    ctx.lineTo(px, py);
    ctx.lineTo(rightX, h);
    ctx.strokeStyle = options.inkHex;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Luminous ridge rim edge
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(rightX * 0.72 + px * 0.28, h * 0.45 + py * 0.55);
    ctx.strokeStyle = options.rimHex;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (options.includePines) {
    ctx.fillStyle = options.inkHex;
    for (let x = 20; x < w; x += 28) {
      const th = rng.range(36, 76);
      ctx.beginPath();
      ctx.moveTo(x, h - th);
      ctx.lineTo(x - 16, h);
      ctx.lineTo(x + 16, h);
      ctx.closePath();
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

/**
 * Illustrated equalizer / stage graphic screen panel matching Reference 2 billboards & club LEDs.
 */
export function createIllustratedEqualizerTexture(
  primaryHex: string,
  secondaryHex: string,
  inkHex = '#09071a',
  anisotropy = 4,
): THREE.CanvasTexture {
  const w = 256;
  const h = 144;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#090b22';
  ctx.fillRect(0, 0, w, h);

  // Inner dark frame & crisp neon outline
  ctx.strokeStyle = inkHex;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  ctx.strokeStyle = primaryHex;
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, w - 16, h - 16);

  // Segmented LED EQ bars
  const cols = 14;
  const barW = (w - 38) / cols;
  const heights = [0.45, 0.72, 0.9, 0.62, 0.84, 0.96, 0.58, 0.76, 0.88, 0.52, 0.79, 0.64, 0.48, 0.38];
  for (let c = 0; c < cols; c++) {
    const col = c % 2 === 0 ? primaryHex : secondaryHex;
    const totalH = (h - 38) * heights[c];
    const segs = Math.max(2, Math.floor(totalH / 10));
    for (let s = 0; s < segs; s++) {
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.55 + (s / segs) * 0.45;
      ctx.fillRect(20 + c * barW, h - 22 - s * 10, barW - 4, 7);
    }
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

/**
 * Illustrated industrial reactor hall backdrop (inked steel gantries, pipes, turbine grilles).
 */
export function createIllustratedReactorBackdropTexture(
  rng: SeededRng,
  anisotropy: number,
): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#090d1f';
  ctx.fillRect(0, 0, w, h);

  // Diagonal structural truss beams
  ctx.strokeStyle = '#162040';
  ctx.lineWidth = 18;
  for (let y = 0; y < h; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + 128);
    ctx.moveTo(w, y);
    ctx.lineTo(0, y + 128);
    ctx.stroke();
  }

  // Vertical industrial conduits + glowing amber/cyan energy tubes
  for (let i = 0; i < 6; i++) {
    const x = 36 + i * 84;
    ctx.fillStyle = '#111936';
    ctx.fillRect(x, 0, 32, h);
    ctx.strokeStyle = '#040610';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, 0, 32, h);

    const glowCol = i % 2 === 0 ? '#f59e0b' : '#22d3ee';
    ctx.fillStyle = glowCol;
    ctx.globalAlpha = 0.72;
    ctx.fillRect(x + 12, 0, 8, h);
    ctx.globalAlpha = 1;
  }

  // Horizontal hazard trim bands
  for (let y = 90; y < h; y += 170) {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, y, w, 24);
    ctx.fillStyle = rng.next() > 0.5 ? '#f59e0b' : '#38bdf8';
    for (let x = 0; x < w; x += 48) {
      ctx.fillRect(x + 8, y + 6, 24, 12);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

/**
 * Illustrated abstract cybernetic matrix & wireframe polyhedral backdrop for Digital Dimension.
 */
export function createIllustratedDigitalMatrixTexture(
  primaryHex: string,
  secondaryHex: string,
  anisotropy: number,
): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, w, h);

  // Clean circuit frame cells
  ctx.strokeStyle = primaryHex;
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.45;
  for (let x = 32; x < w; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 16);
    ctx.lineTo(x, h - 16);
    ctx.stroke();
  }
  for (let y = 32; y < h; y += 64) {
    ctx.beginPath();
    ctx.moveTo(16, y);
    ctx.lineTo(w - 16, y);
    ctx.stroke();
  }

  // Crisp diamond nodes at intersections
  ctx.globalAlpha = 0.85;
  for (let x = 64; x < w; x += 128) {
    for (let y = 64; y < h; y += 128) {
      ctx.fillStyle = (x + y) % 256 === 0 ? primaryHex : secondaryHex;
      ctx.beginPath();
      ctx.moveTo(x, y - 9);
      ctx.lineTo(x + 9, y);
      ctx.lineTo(x, y + 9);
      ctx.lineTo(x - 9, y);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}
