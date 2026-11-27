import type { OfficialEnvironmentTheme } from '../../../types/game';
import { hexWithAlpha } from '../../noteColorPalette';
import type { AudioVisualBands, ScenarioRenderParams } from '../types';

interface AmbientSprite {
  x: number;
  y: number;
  speed: number;
  size: number;
  phase: number;
  drift: number;
  tintIdx: number;
}

interface SkyVehicle {
  x: number;
  yFrac: number;
  speed: number;
  dir: 1 | -1;
  len: number;
  colorIdx: number;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Illustrated 2.5D Scenario Painter Engine.
 * Pre-renders complex static sky, mountain, nebula, and city silhouette geometry to an
 * offscreen cache rebuilt ONLY on canvas size/DPR/theme/quality changes (zero thermal waste),
 * while painting vibrant audio-reactive parallax layers and particles every frame.
 */
export class ScenarioPainters {
  private cacheCanvas: HTMLCanvasElement | null = null;
  private cacheKey = '';

  private sprites: AmbientSprite[] = [];
  private vehicles: SkyVehicle[] = [];

  constructor() {
    for (let i = 0; i < 64; i++) {
      this.sprites.push({
        x: ((i * 7919) % 1000) / 1000,
        y: ((i * 3571) % 1000) / 1000,
        speed: 0.03 + ((i * 19) % 10) * 0.008,
        size: 1.5 + (i % 5) * 1.1,
        phase: i * 1.37,
        drift: 0.4 + (i % 4) * 0.22,
        tintIdx: i % 3,
      });
    }

    for (let i = 0; i < 7; i++) {
      this.vehicles.push({
        x: (i * 0.19) % 1.2 - 0.1,
        yFrac: 0.16 + (i % 4) * 0.075,
        speed: 0.08 + (i % 3) * 0.045,
        dir: i % 2 === 0 ? 1 : -1,
        len: 28 + (i % 3) * 16,
        colorIdx: i % 2,
      });
    }
  }

  public invalidateCache(): void {
    this.cacheKey = '';
  }

  public dispose(): void {
    this.cacheCanvas = null;
    this.cacheKey = '';
  }

  private ensureStaticBackdrop(
    theme: OfficialEnvironmentTheme,
    width: number,
    height: number,
    horizonY: number,
    vanishX: number,
    quality: string,
  ): HTMLCanvasElement | null {
    if (typeof document === 'undefined' || width <= 0 || height <= 0) return null;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const hy = Math.round(horizonY);
    const vx = Math.round(vanishX);
    const key = `${theme}|${w}|${h}|${hy}|${vx}|${quality}`;
    if (this.cacheCanvas && this.cacheKey === key) {
      return this.cacheCanvas;
    }

    if (!this.cacheCanvas) {
      this.cacheCanvas = document.createElement('canvas');
    }
    const c = this.cacheCanvas;
    // Slight overscan (1.12x) prevents exposed corners during camera roll / parallax shift
    const ow = Math.round(w * 1.14);
    const oh = Math.round(h * 1.14);
    c.width = ow;
    c.height = oh;
    const g = c.getContext('2d');
    if (!g) return null;

    const ox = Math.round((ow - w) * 0.5);
    const oy = Math.round((oh - h) * 0.5);
    g.save();
    g.translate(ox, oy);

    switch (theme) {
      case 'tropical':
        this.bakeTropicalBackdrop(g, w, h, hy, vx);
        break;
      case 'cyberpunk':
        this.bakeCyberpunkBackdrop(g, w, h, hy, vx);
        break;
      case 'sakura':
        this.bakeSakuraBackdrop(g, w, h, hy, vx);
        break;
      case 'cosmic':
        this.bakeCosmicBackdrop(g, w, h, hy, vx);
        break;
    }

    g.restore();
    this.cacheKey = key;
    return c;
  }

  private bakeTropicalBackdrop(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    hy: number,
    vx: number,
  ): void {
    // Rich Twilight-to-Sunset gradient
    const sky = g.createLinearGradient(0, -h * 0.08, 0, hy + 8);
    sky.addColorStop(0, '#1b0f47');
    sky.addColorStop(0.28, '#532578');
    sky.addColorStop(0.58, '#b84376');
    sky.addColorStop(0.84, '#f97b58');
    sky.addColorStop(1, '#fde68a');
    g.fillStyle = sky;
    g.fillRect(-w * 0.1, -h * 0.1, w * 1.2, hy + h * 0.15);

    // Soft stylized sunset cloud ribbons
    const cloudColors = ['rgba(255, 198, 178, 0.22)', 'rgba(244, 114, 182, 0.18)'];
    for (let i = 0; i < 6; i++) {
      g.fillStyle = cloudColors[i % 2];
      const cx = w * (0.1 + (i * 0.19) % 0.9);
      const cy = hy * (0.18 + (i % 3) * 0.16);
      const rx = w * (0.12 + (i % 3) * 0.05);
      const ry = h * (0.022 + (i % 2) * 0.012);
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, -0.05 + (i % 2) * 0.1, 0, Math.PI * 2);
      g.fill();
    }

    // Distant volcanic coastline silhouette
    g.fillStyle = '#3b1c5a';
    g.beginPath();
    g.moveTo(-w * 0.1, hy);
    g.lineTo(w * 0.12, hy - h * 0.032);
    g.lineTo(w * 0.29, hy - h * 0.014);
    g.lineTo(w * 0.42, hy);
    g.lineTo(w * 0.58, hy);
    g.lineTo(w * 0.72, hy - h * 0.018);
    g.lineTo(w * 0.89, hy - h * 0.036);
    g.lineTo(w * 1.1, hy);
    g.closePath();
    g.fill();

    // Ocean gradient below horizon
    const sea = g.createLinearGradient(0, hy, 0, h * 1.1);
    sea.addColorStop(0, '#6a337a');
    sea.addColorStop(0.22, '#3a1d66');
    sea.addColorStop(0.65, '#190e44');
    sea.addColorStop(1, '#09061d');
    g.fillStyle = sea;
    g.fillRect(-w * 0.1, hy, w * 1.2, h * 1.2 - hy);

    // Subtle sandy shore banks flanking both sides
    g.fillStyle = '#25154e';
    g.beginPath();
    g.moveTo(-w * 0.1, hy + h * 0.12);
    g.quadraticCurveTo(w * 0.16, hy + h * 0.22, -w * 0.1, h * 0.9);
    g.closePath();
    g.fill();

    g.beginPath();
    g.moveTo(w * 1.1, hy + h * 0.12);
    g.quadraticCurveTo(w * 0.84, hy + h * 0.22, w * 1.1, h * 0.9);
    g.closePath();
    g.fill();

    // Distant sunset horizon glow centered on vanishing point
    const sunHalo = g.createRadialGradient(vx, hy, 4, vx, hy, Math.min(w, h) * 0.42);
    sunHalo.addColorStop(0, 'rgba(255, 251, 224, 0.9)');
    sunHalo.addColorStop(0.28, 'rgba(253, 224, 71, 0.45)');
    sunHalo.addColorStop(0.65, 'rgba(251, 113, 133, 0.16)');
    sunHalo.addColorStop(1, 'rgba(251, 113, 133, 0)');
    g.fillStyle = sunHalo;
    g.beginPath();
    g.arc(vx, hy, Math.min(w, h) * 0.42, 0, Math.PI * 2);
    g.fill();
  }

  private bakeCyberpunkBackdrop(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    hy: number,
    vx: number,
  ): void {
    // Deep twilight cyber sky
    const sky = g.createLinearGradient(0, -h * 0.08, 0, hy + 10);
    sky.addColorStop(0, '#07061d');
    sky.addColorStop(0.42, '#14124a');
    sky.addColorStop(0.78, '#2d1666');
    sky.addColorStop(1, '#582282');
    g.fillStyle = sky;
    g.fillRect(-w * 0.1, -h * 0.1, w * 1.2, hy + h * 0.15);

    // Starfield
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 60; i++) {
      const sx = (((i * 997) % 1000) / 1000) * w;
      const sy = (((i * 541) % 1000) / 1000) * (hy * 0.82);
      g.globalAlpha = 0.25 + (i % 5) * 0.12;
      const r = i % 7 === 0 ? 1.8 : 1.0;
      g.fillRect(sx, sy, r, r);
    }
    g.globalAlpha = 1;

    // Distant haze skyline silhouettes
    g.fillStyle = '#1b144f';
    const farCount = 22;
    for (let i = 0; i < farCount; i++) {
      const bx = (i / farCount) * w;
      const bw = w / farCount + 3;
      const distFromCenter = Math.abs(bx + bw * 0.5 - vx) / (w * 0.5);
      const bh = h * (0.04 + ((i * 37) % 10) * 0.015) * (0.38 + distFromCenter * 0.9);
      g.fillRect(bx, hy - bh, bw, bh + 4);
    }

    // Suspension bridge silhouette behind the track horizon
    const bridgeY = hy - h * 0.075;
    g.strokeStyle = 'rgba(56, 189, 248, 0.42)';
    g.lineWidth = Math.max(1.5, w * 0.0028);
    g.beginPath();
    g.moveTo(w * 0.06, bridgeY + h * 0.04);
    g.lineTo(w * 0.94, bridgeY + h * 0.04);
    g.stroke();

    // Bridge towers
    const tLeft = w * 0.25;
    const tRight = w * 0.75;
    g.fillStyle = '#110f3a';
    g.fillRect(tLeft - 6, bridgeY - h * 0.09, 12, h * 0.17);
    g.fillRect(tRight - 6, bridgeY - h * 0.09, 12, h * 0.17);

    // Suspension cables
    g.strokeStyle = 'rgba(232, 121, 249, 0.42)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(w * 0.02, bridgeY + h * 0.04);
    g.quadraticCurveTo(w * 0.14, bridgeY + h * 0.02, tLeft, bridgeY - h * 0.085);
    g.quadraticCurveTo(vx, bridgeY + h * 0.028, tRight, bridgeY - h * 0.085);
    g.quadraticCurveTo(w * 0.86, bridgeY + h * 0.02, w * 0.98, bridgeY + h * 0.04);
    g.stroke();

    // River basin below horizon
    const river = g.createLinearGradient(0, hy, 0, h * 1.1);
    river.addColorStop(0, '#22155a');
    river.addColorStop(0.35, '#120d3b');
    river.addColorStop(1, '#060516');
    g.fillStyle = river;
    g.fillRect(-w * 0.1, hy, w * 1.2, h * 1.2 - hy);
  }

  private bakeSakuraBackdrop(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    hy: number,
    vx: number,
  ): void {
    // Dreamy pink-lavender sky
    const sky = g.createLinearGradient(0, -h * 0.08, 0, hy + 8);
    sky.addColorStop(0, '#361b5e');
    sky.addColorStop(0.36, '#7a3e8c');
    sky.addColorStop(0.72, '#e284b5');
    sky.addColorStop(1, '#fde2ef');
    g.fillStyle = sky;
    g.fillRect(-w * 0.1, -h * 0.1, w * 1.2, hy + h * 0.15);

    // Luminous moon upper-right of center
    const moonX = vx + w * 0.14;
    const moonY = hy * 0.36;
    const moonR = Math.min(w, h) * 0.075;
    const moonHalo = g.createRadialGradient(moonX, moonY, moonR * 0.4, moonX, moonY, moonR * 2.4);
    moonHalo.addColorStop(0, 'rgba(255, 245, 250, 0.95)');
    moonHalo.addColorStop(0.45, 'rgba(249, 168, 212, 0.35)');
    moonHalo.addColorStop(1, 'rgba(249, 168, 212, 0)');
    g.fillStyle = moonHalo;
    g.beginPath();
    g.arc(moonX, moonY, moonR * 2.4, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = '#fff5fa';
    g.beginPath();
    g.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    g.fill();

    // Distant misty violet ridge
    g.fillStyle = '#7c4c96';
    g.beginPath();
    g.moveTo(-w * 0.1, hy);
    g.quadraticCurveTo(w * 0.18, hy - h * 0.08, w * 0.38, hy - h * 0.025);
    g.quadraticCurveTo(w * 0.65, hy - h * 0.02, w * 0.84, hy - h * 0.075);
    g.lineTo(w * 1.1, hy);
    g.closePath();
    g.fill();

    // Snow-capped Mount Fuji centered behind horizon
    const fujiW = Math.min(w * 0.56, h * 0.68);
    const fujiH = h * 0.22;
    g.fillStyle = '#5c3b85';
    g.beginPath();
    g.moveTo(vx - fujiW * 0.55, hy);
    g.quadraticCurveTo(vx - fujiW * 0.18, hy - fujiH * 0.55, vx - fujiW * 0.08, hy - fujiH);
    g.lineTo(vx + fujiW * 0.08, hy - fujiH);
    g.quadraticCurveTo(vx + fujiW * 0.18, hy - fujiH * 0.55, vx + fujiW * 0.55, hy);
    g.closePath();
    g.fill();

    // Fuji snow cap
    g.fillStyle = '#fdf2f8';
    g.beginPath();
    g.moveTo(vx - fujiW * 0.08, hy - fujiH);
    g.lineTo(vx + fujiW * 0.08, hy - fujiH);
    g.lineTo(vx + fujiW * 0.18, hy - fujiH * 0.64);
    g.lineTo(vx + fujiW * 0.08, hy - fujiH * 0.72);
    g.lineTo(vx, hy - fujiH * 0.61);
    g.lineTo(vx - fujiW * 0.08, hy - fujiH * 0.72);
    g.lineTo(vx - fujiW * 0.18, hy - fujiH * 0.64);
    g.closePath();
    g.fill();

    // Traditional wooden bridge left + tiered Pagoda silhouette right
    g.fillStyle = '#311a54';
    const px = w * 0.84;
    const pw = Math.max(24, w * 0.055);
    g.fillRect(px - pw * 0.35, hy - h * 0.16, pw * 0.7, h * 0.16);
    for (let t = 0; t < 4; t++) {
      const ty = hy - h * 0.04 - t * h * 0.036;
      const rw = pw * (1.15 - t * 0.14);
      g.beginPath();
      g.moveTo(px - rw, ty);
      g.lineTo(px, ty - h * 0.025);
      g.lineTo(px + rw, ty);
      g.closePath();
      g.fill();
    }

    // Left lantern bridge
    g.fillRect(-w * 0.05, hy - h * 0.035, w * 0.32, h * 0.015);
    for (let p = 0; p < 4; p++) {
      g.fillRect(w * (0.04 + p * 0.06), hy - h * 0.055, 5, h * 0.055);
    }

    // Calm pink-indigo reflective lake below horizon
    const lake = g.createLinearGradient(0, hy, 0, h * 1.1);
    lake.addColorStop(0, '#854b8f');
    lake.addColorStop(0.28, '#3b1e63');
    lake.addColorStop(0.75, '#1b0f3e');
    lake.addColorStop(1, '#0c0721');
    g.fillStyle = lake;
    g.fillRect(-w * 0.1, hy, w * 1.2, h * 1.2 - hy);
  }

  private bakeCosmicBackdrop(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    hy: number,
    _vx: number,
  ): void {
    // Deep galactic backdrop
    const space = g.createLinearGradient(0, -h * 0.08, 0, h * 1.1);
    space.addColorStop(0, '#050517');
    space.addColorStop(0.38, '#160d42');
    space.addColorStop(0.65, '#2b1366');
    space.addColorStop(1, '#08061c');
    g.fillStyle = space;
    g.fillRect(-w * 0.1, -h * 0.1, w * 1.2, h * 1.2);

    // Lush nebula clouds (layered radial blobs)
    const clouds = [
      { x: w * 0.22, y: hy * 0.45, r: w * 0.34, c: 'rgba(139, 92, 246, 0.26)' },
      { x: w * 0.72, y: hy * 0.65, r: w * 0.38, c: 'rgba(56, 189, 248, 0.22)' },
      { x: w * 0.48, y: hy * 0.92, r: w * 0.42, c: 'rgba(232, 121, 249, 0.24)' },
      { x: w * 0.15, y: hy * 1.08, r: w * 0.3, c: 'rgba(34, 211, 238, 0.16)' },
    ];
    for (const cl of clouds) {
      const grad = g.createRadialGradient(cl.x, cl.y, 4, cl.x, cl.y, cl.r);
      grad.addColorStop(0, cl.c);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cl.x, cl.y, cl.r, 0, Math.PI * 2);
      g.fill();
    }

    // Crisp multi-depth starfield
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 95; i++) {
      const sx = (((i * 887) % 1000) / 1000) * w;
      const sy = (((i * 613) % 1000) / 1000) * (h * 0.92);
      g.globalAlpha = 0.25 + (i % 6) * 0.12;
      const rad = i % 11 === 0 ? 2.0 : i % 4 === 0 ? 1.4 : 0.9;
      g.beginPath();
      g.arc(sx, sy, rad, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // Secondary purple moon on left
    const mx = w * 0.14;
    const my = hy * 0.84;
    const mr = Math.min(w, h) * 0.125;
    const mGrad = g.createRadialGradient(mx + mr * 0.3, my - mr * 0.3, mr * 0.12, mx, my, mr);
    mGrad.addColorStop(0, '#c084fc');
    mGrad.addColorStop(0.55, '#5b21b6');
    mGrad.addColorStop(1, '#180c3d');
    g.fillStyle = mGrad;
    g.beginPath();
    g.arc(mx, my, mr, 0, Math.PI * 2);
    g.fill();

    // Subtle moon craters
    g.fillStyle = 'rgba(20, 8, 52, 0.3)';
    g.beginPath();
    g.arc(mx - mr * 0.24, my + mr * 0.15, mr * 0.18, 0, Math.PI * 2);
    g.arc(mx + mr * 0.25, my + mr * 0.32, mr * 0.11, 0, Math.PI * 2);
    g.fill();

    // Large Ringed Gas Planet upper-right
    const px = w * 0.82;
    const py = hy * 0.32;
    const pr = Math.min(w, h) * 0.21;

    // Back half of ring
    g.save();
    g.translate(px, py);
    g.rotate(-0.34);
    g.strokeStyle = 'rgba(103, 232, 249, 0.55)';
    g.lineWidth = Math.max(4, pr * 0.11);
    g.beginPath();
    g.ellipse(0, 0, pr * 1.85, pr * 0.42, 0, Math.PI, Math.PI * 2);
    g.stroke();
    g.restore();

    // Planet sphere
    const pGrad = g.createRadialGradient(px - pr * 0.32, py - pr * 0.28, pr * 0.15, px, py, pr);
    pGrad.addColorStop(0, '#e879f9');
    pGrad.addColorStop(0.42, '#7c3aed');
    pGrad.addColorStop(0.85, '#311473');
    pGrad.addColorStop(1, '#120833');
    g.fillStyle = pGrad;
    g.beginPath();
    g.arc(px, py, pr, 0, Math.PI * 2);
    g.fill();

    // Front half of ring
    g.save();
    g.translate(px, py);
    g.rotate(-0.34);
    g.strokeStyle = 'rgba(125, 211, 252, 0.88)';
    g.lineWidth = Math.max(4, pr * 0.11);
    g.beginPath();
    g.ellipse(0, 0, pr * 1.85, pr * 0.42, 0, 0, Math.PI);
    g.stroke();
    g.strokeStyle = 'rgba(244, 114, 182, 0.65)';
    g.lineWidth = Math.max(2, pr * 0.045);
    g.beginPath();
    g.ellipse(0, 0, pr * 1.58, pr * 0.35, 0, 0, Math.PI);
    g.stroke();
    g.restore();
  }

  public render(ctx: CanvasRenderingContext2D, p: ScenarioRenderParams): void {
    const {
      theme,
      width,
      height,
      elapsed,
      trackScroll,
      horizonScreenY,
      vanishScreenX,
      rollRad,
      parallaxX,
      parallaxY,
      palette,
      bands,
    } = p;

    const bg = this.ensureStaticBackdrop(
      theme,
      width,
      height,
      horizonScreenY,
      vanishScreenX,
      bands.graphicsQuality,
    );

    ctx.save();
    // Couple backdrop subtly with camera roll & parallax while overscan hides edges
    const cx = width * 0.5;
    const cy = height * 0.5;
    ctx.translate(cx + parallaxX * 14, cy + parallaxY * 9);
    ctx.rotate(rollRad * 0.55);
    ctx.translate(-cx, -cy);

    if (bg) {
      const ox = (bg.width - width) * 0.5;
      const oy = (bg.height - height) * 0.5;
      ctx.drawImage(bg, -ox, -oy);
    } else {
      ctx.fillStyle = '#09071d';
      ctx.fillRect(0, 0, width, height);
    }

    // Brightness modulation if user lowered or raised sceneBrightness
    if (Math.abs(bands.brightnessScale - 1) > 0.03) {
      if (bands.brightnessScale < 1) {
        ctx.fillStyle = `rgba(3, 5, 16, ${clamp((1 - bands.brightnessScale) * 0.72, 0, 0.5)})`;
        ctx.fillRect(-width * 0.1, -height * 0.1, width * 1.2, height * 1.2);
      } else {
        ctx.fillStyle = `rgba(255, 255, 255, ${clamp((bands.brightnessScale - 1) * 0.16, 0, 0.14)})`;
        ctx.fillRect(-width * 0.1, -height * 0.1, width * 1.2, height * 1.2);
      }
    }

    // Dynamic world-specific animated & music-reactive elements
    switch (theme) {
      case 'tropical':
        this.drawTropicalDynamic(ctx, p);
        break;
      case 'cyberpunk':
        this.drawCyberpunkDynamic(ctx, p);
        break;
      case 'sakura':
        this.drawSakuraDynamic(ctx, p);
        break;
      case 'cosmic':
        this.drawCosmicDynamic(ctx, p);
        break;
    }

    // Horizon energy bloom reacting to kick/drop/fever
    const pulseAlpha = clamp(
      (0.14 + bands.bass * 0.22 + bands.kickPulse * 0.24 + bands.dropFlash * 0.28 + (bands.feverActive ? 0.14 : 0)) *
        bands.glowScale *
        bands.sideBrightness *
        (bands.reducedFlash ? 0.55 : 1.0),
      0,
      0.75,
    );
    if (pulseAlpha > 0.02) {
      const hRadius = Math.min(width, height) * (0.28 + bands.bass * 0.1);
      const hg = ctx.createRadialGradient(
        vanishScreenX,
        horizonScreenY,
        4,
        vanishScreenX,
        horizonScreenY,
        hRadius,
      );
      const glowColor = bands.feverActive ? palette.accent : palette.primary;
      hg.addColorStop(0, hexWithAlpha(glowColor, pulseAlpha));
      hg.addColorStop(0.5, hexWithAlpha(palette.secondary, pulseAlpha * 0.42));
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(vanishScreenX, horizonScreenY, hRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Animated ambient particles (sparkles, sakura petals, cosmic stardust)
    this.drawAmbientParticles(ctx, theme, width, height, horizonScreenY, elapsed, trackScroll, palette, bands);

    ctx.restore();
  }

  private drawTropicalDynamic(ctx: CanvasRenderingContext2D, p: ScenarioRenderParams): void {
    const { width, height, elapsed, trackScroll, horizonScreenY: hy, vanishScreenX: vx, bands } = p;
    const reactive = bands.reactiveEnabled ? 1 : 0.2;
    const bassScale = 1 + (bands.bass * 0.12 + bands.kickPulse * 0.1) * reactive;
    const sunR = Math.min(width, height) * 0.135 * bassScale;

    // Warm sunset sun disc on horizon
    const sunGrad = ctx.createLinearGradient(vx, hy - sunR, vx, hy);
    sunGrad.addColorStop(0, '#fffbeb');
    sunGrad.addColorStop(0.55, '#fde047');
    sunGrad.addColorStop(1, '#fb7185');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(vx, hy + 2, sunR, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    // Shimmering ocean reflection ribbons
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const f = (i + 1) / 9;
      const ry = hy + f * (height - hy) * 0.65;
      const rw = width * (0.08 + f * 0.24) * (0.85 + bands.mid * 0.25);
      const waveX = Math.sin(elapsed * 2.1 + i * 1.4) * (10 + f * 16);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(253, 224, 71, 0.28)' : 'rgba(251, 113, 133, 0.22)';
      ctx.fillRect(vx - rw * 0.5 + waveX, ry, rw, 2.2 + f * 2.4);
    }

    // Shore wave highlights left & right
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.38)';
    ctx.lineWidth = 2;
    const shoreWave = Math.sin(trackScroll * 1.2 + elapsed * 1.8) * 6;
    ctx.beginPath();
    ctx.moveTo(0, hy + (height - hy) * 0.28 + shoreWave);
    ctx.quadraticCurveTo(width * 0.14, hy + (height - hy) * 0.34, width * 0.24, hy + (height - hy) * 0.52);
    ctx.moveTo(width, hy + (height - hy) * 0.28 - shoreWave);
    ctx.quadraticCurveTo(width * 0.86, hy + (height - hy) * 0.34, width * 0.76, hy + (height - hy) * 0.52);
    ctx.stroke();
    ctx.restore();

    // Swaying coastal palm tree silhouettes on both flanks
    const sway = Math.sin(elapsed * 1.35) * (0.04 + bands.mid * 0.03 * reactive);
    const drawPalm = (baseX: number, baseY: number, lean: number, scale: number, rimColor: string) => {
      ctx.save();
      const tipX = baseX + (lean + sway * 110) * scale;
      const tipY = baseY - 145 * scale;
      // Trunk
      ctx.strokeStyle = '#190e38';
      ctx.lineWidth = 10 * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(baseX + lean * 0.3 * scale, baseY - 75 * scale, tipX, tipY);
      ctx.stroke();

      // Sunlit rim highlight along trunk edge
      ctx.strokeStyle = rimColor;
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.moveTo(baseX + (lean < 0 ? -3 : 3) * scale, baseY);
      ctx.quadraticCurveTo(baseX + lean * 0.3 * scale, baseY - 75 * scale, tipX, tipY);
      ctx.stroke();

      // Palm fronds
      for (let f = 0; f < 7; f++) {
        const ang = -Math.PI * 0.95 + (f / 6) * Math.PI * 1.15 + sway * 0.45;
        const flen = (66 + (f % 2) * 14) * scale;
        const ex = tipX + Math.cos(ang) * flen;
        const ey = tipY + Math.sin(ang) * flen * 0.68 + 18 * scale;
        const cx = tipX + Math.cos(ang) * flen * 0.5;
        const cy = tipY + Math.sin(ang) * flen * 0.32 - 12 * scale;

        ctx.fillStyle = '#1e1042';
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.quadraticCurveTo(cx, cy - 9 * scale, ex, ey);
        ctx.quadraticCurveTo(cx, cy + 7 * scale, tipX, tipY);
        ctx.fill();

        ctx.strokeStyle = rimColor;
        ctx.lineWidth = 1.2 * scale;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.quadraticCurveTo(cx, cy - 8 * scale, ex, ey);
        ctx.stroke();
      }
      ctx.restore();
    };

    const palmScale = clamp(Math.min(width, height) / 720, 0.58, 1.25);
    drawPalm(width * 0.08, hy + height * 0.14, 34, palmScale * 1.05, 'rgba(251, 146, 60, 0.65)');
    drawPalm(width * 0.19, hy + height * 0.06, 22, palmScale * 0.72, 'rgba(253, 224, 71, 0.55)');
    drawPalm(width * 0.92, hy + height * 0.14, -34, palmScale * 1.05, 'rgba(251, 146, 60, 0.65)');
    drawPalm(width * 0.81, hy + height * 0.06, -22, palmScale * 0.72, 'rgba(253, 224, 71, 0.55)');
  }

  private drawCyberpunkDynamic(ctx: CanvasRenderingContext2D, p: ScenarioRenderParams): void {
    const { width, height, elapsed, horizonScreenY: hy, vanishScreenX: vx, palette, bands } = p;
    const sideLum = bands.sideBrightness;
    const pulse = (0.35 + bands.bass * 0.4 + bands.kickPulse * 0.25) * sideLum;

    // Animated aurora ribbon in upper sky
    ctx.save();
    const aurGrad = ctx.createLinearGradient(0, hy * 0.1, width, hy * 0.5);
    aurGrad.addColorStop(0, 'rgba(34, 211, 238, 0)');
    aurGrad.addColorStop(0.35, hexWithAlpha(palette.primary, 0.26 * sideLum));
    aurGrad.addColorStop(0.68, hexWithAlpha(palette.secondary, 0.24 * sideLum));
    aurGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
    ctx.strokeStyle = aurGrad;
    ctx.lineWidth = Math.max(24, height * 0.06);
    ctx.beginPath();
    const wave = Math.sin(elapsed * 0.65) * height * 0.03;
    ctx.moveTo(-width * 0.05, hy * 0.42 + wave);
    ctx.bezierCurveTo(
      width * 0.3,
      hy * 0.12 - wave,
      width * 0.68,
      hy * 0.54 + wave,
      width * 1.05,
      hy * 0.22 - wave,
    );
    ctx.stroke();

    // Ringed Cyber Moon upper-right
    const mx = vx + width * 0.22;
    const my = hy * 0.34;
    const mr = Math.min(width, height) * 0.072;
    const moonGrad = ctx.createRadialGradient(mx - mr * 0.2, my - mr * 0.2, 4, mx, my, mr);
    moonGrad.addColorStop(0, '#f0f9ff');
    moonGrad.addColorStop(0.7, '#93c5fd');
    moonGrad.addColorStop(1, '#4f46e5');
    ctx.fillStyle = moonGrad;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = hexWithAlpha(palette.primary, 0.72 * sideLum);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(mx, my, mr * 1.85, mr * 0.44, -0.35 + Math.sin(elapsed * 0.4) * 0.05, 0, Math.PI * 2);
    ctx.stroke();

    // Parallax Mid/Near Cyber Skyscrapers Left & Right with reactive neon windows
    const buildings = [
      { x: 0.01, w: 0.11, h: 0.52, c: palette.primary },
      { x: 0.11, w: 0.085, h: 0.39, c: palette.secondary },
      { x: 0.19, w: 0.068, h: 0.27, c: palette.primary },
      { x: 0.742, w: 0.068, h: 0.28, c: palette.secondary },
      { x: 0.805, w: 0.085, h: 0.41, c: palette.primary },
      { x: 0.885, w: 0.11, h: 0.54, c: palette.secondary },
    ];

    const pxOff = p.parallaxX * 18;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const bx = b.x * width + pxOff * (i < 3 ? -0.4 : 0.4);
      const bw = b.w * width;
      const bh = b.h * height;
      const by = hy - bh + height * 0.04;

      const bGrad = ctx.createLinearGradient(bx, by, bx, hy + 20);
      bGrad.addColorStop(0, '#120f3c');
      bGrad.addColorStop(1, '#080721');
      ctx.fillStyle = bGrad;
      ctx.fillRect(bx, by, bw, hy + 24 - by);

      ctx.strokeStyle = hexWithAlpha(b.c, clamp(0.45 + pulse * 0.45, 0.3, 0.95));
      ctx.lineWidth = 1.6;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, hy + 24 - by);

      // Audio-reactive window grid strips
      const rows = Math.max(4, Math.floor(bh / 18));
      for (let r = 0; r < rows; r++) {
        const wy = by + 10 + r * 14;
        if (wy > hy - 6) break;
        const rowActive = ((r + i) % 3 === 0 ? bands.bass : bands.mid) > 0.25 || r % 2 === 0;
        ctx.fillStyle = hexWithAlpha(b.c, rowActive ? clamp(0.32 + pulse * 0.45, 0.25, 0.85) : 0.12);
        ctx.fillRect(bx + bw * 0.16, wy, bw * 0.68, 3.5);
      }

      // River reflection beneath building
      const refAlpha = clamp(0.22 + bands.bass * 0.16, 0.12, 0.45) * sideLum;
      const refGrad = ctx.createLinearGradient(0, hy, 0, hy + bh * 0.55);
      refGrad.addColorStop(0, hexWithAlpha(b.c, refAlpha));
      refGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = refGrad;
      ctx.fillRect(bx + bw * 0.15, hy + 2, bw * 0.7, bh * 0.55);
    }

    // Flying vehicles with glowing neon trails
    if (bands.graphicsQuality !== 'low') {
      for (const v of this.vehicles) {
        const vxPos = (((v.x + elapsed * v.speed * v.dir) % 1.3) + 1.3) % 1.3 - 0.15;
        const sx = vxPos * width;
        const sy = hy * v.yFrac + Math.sin(elapsed * 2 + v.x * 10) * 3;
        const col = v.colorIdx === 0 ? palette.primary : palette.secondary;

        const trailGrad = ctx.createLinearGradient(
          sx - v.dir * v.len * 2.2,
          sy,
          sx,
          sy,
        );
        trailGrad.addColorStop(0, 'rgba(0,0,0,0)');
        trailGrad.addColorStop(1, hexWithAlpha(col, 0.85 * sideLum));
        ctx.strokeStyle = trailGrad;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(sx - v.dir * v.len * 2.2, sy);
        ctx.lineTo(sx, sy);
        ctx.stroke();

        ctx.fillStyle = '#e0f2fe';
        ctx.beginPath();
        ctx.ellipse(sx, sy, 6, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Water shimmer lines
    ctx.strokeStyle = hexWithAlpha(palette.primary, 0.22 * sideLum);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const y = hy + (i + 1) * (height - hy) * 0.11;
      const shift = Math.sin(elapsed * 2 + i) * 14;
      ctx.beginPath();
      ctx.moveTo(width * 0.05 + shift, y);
      ctx.lineTo(width * 0.24 + shift, y);
      ctx.moveTo(width * 0.76 - shift, y);
      ctx.lineTo(width * 0.95 - shift, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawSakuraDynamic(ctx: CanvasRenderingContext2D, p: ScenarioRenderParams): void {
    const { width, height, elapsed, horizonScreenY: hy, vanishScreenX: vx, bands } = p;
    const sideLum = bands.sideBrightness;
    const beatLift = bands.kickPulse * 4 * (bands.reactiveEnabled ? 1 : 0.2);

    ctx.save();
    // Iconic Crimson Torii Gate framing the perspective track near the horizon
    const gateSpan = Math.min(width * 0.44, height * 0.42);
    const gateH = Math.min(height * 0.25, gateSpan * 0.62);
    const gx1 = vx - gateSpan * 0.38;
    const gx2 = vx + gateSpan * 0.38;
    const topY = hy - gateH - beatLift * 0.4;
    const pillarW = Math.max(7, gateSpan * 0.048);

    // Subtle warm crimson glow behind Torii
    ctx.shadowColor = 'rgba(244, 63, 94, 0.55)';
    ctx.shadowBlur = 12 * bands.glowScale;

    // Pillars
    ctx.fillStyle = '#be123c';
    ctx.fillRect(gx1 - pillarW * 0.5, topY + 6, pillarW, hy - topY + 4);
    ctx.fillRect(gx2 - pillarW * 0.5, topY + 6, pillarW, hy - topY + 4);

    // Pillar stone bases
    ctx.fillStyle = '#2e1042';
    ctx.fillRect(gx1 - pillarW * 0.72, hy - 8, pillarW * 1.44, 12);
    ctx.fillRect(gx2 - pillarW * 0.72, hy - 8, pillarW * 1.44, 12);

    // Lower crossbeam (Nuki)
    ctx.fillStyle = '#e11d48';
    ctx.fillRect(vx - gateSpan * 0.48, topY + gateH * 0.26, gateSpan * 0.96, pillarW * 0.72);

    // Upper curved lintel (Kasagi)
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.moveTo(vx - gateSpan * 0.58, topY - 4);
    ctx.quadraticCurveTo(vx, topY + 10, vx + gateSpan * 0.58, topY - 4);
    ctx.lineTo(vx + gateSpan * 0.55, topY + pillarW * 1.05);
    ctx.quadraticCurveTo(vx, topY + pillarW * 1.65, vx - gateSpan * 0.55, topY + pillarW * 1.05);
    ctx.closePath();
    ctx.fill();

    // Dark cap on Kasagi
    ctx.fillStyle = '#3b0764';
    ctx.beginPath();
    ctx.moveTo(vx - gateSpan * 0.59, topY - 7);
    ctx.quadraticCurveTo(vx, topY + 7, vx + gateSpan * 0.59, topY - 7);
    ctx.lineTo(vx + gateSpan * 0.58, topY - 1);
    ctx.quadraticCurveTo(vx, topY + 11, vx - gateSpan * 0.58, topY - 1);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;

    // Overhanging swaying Sakura blossom canopies framing top corners
    const swayX = Math.sin(elapsed * 1.1) * 7;
    const swayY = Math.cos(elapsed * 0.9) * 3;
    const drawCanopy = (side: -1 | 1) => {
      const originX = side === -1 ? -10 : width + 10;
      const dir = -side;
      // Branch
      ctx.strokeStyle = '#3b1c47';
      ctx.lineWidth = Math.max(6, width * 0.012);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(originX, height * 0.18);
      ctx.quadraticCurveTo(
        originX + dir * width * 0.14,
        height * 0.12 + swayY,
        originX + dir * width * 0.24 + swayX,
        height * 0.07 + swayY,
      );
      ctx.stroke();

      // Layered pink blossom puffs
      const puffs = [
        { ox: 0.05, oy: 0.05, r: 0.095, c: '#f472b6' },
        { ox: 0.13, oy: 0.08, r: 0.075, c: '#f9a8d4' },
        { ox: 0.2, oy: 0.04, r: 0.06, c: '#fbcfe8' },
        { ox: 0.07, oy: 0.15, r: 0.065, c: '#ec4899' },
      ];
      for (const pf of puffs) {
        ctx.fillStyle = pf.c;
        ctx.globalAlpha = 0.88 * sideLum;
        ctx.beginPath();
        ctx.arc(
          originX + dir * width * pf.ox + swayX * 0.8,
          height * pf.oy + swayY,
          Math.min(width, height) * pf.r,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    drawCanopy(-1);
    drawCanopy(1);

    // Soft lake reflections below horizon
    ctx.strokeStyle = 'rgba(249, 168, 212, 0.26)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const ly = hy + (i + 1) * (height - hy) * 0.11;
      const sx = Math.sin(elapsed * 1.5 + i * 1.7) * 12;
      ctx.beginPath();
      ctx.moveTo(width * 0.08 + sx, ly);
      ctx.lineTo(width * 0.26 + sx, ly);
      ctx.moveTo(width * 0.74 - sx, ly);
      ctx.lineTo(width * 0.92 - sx, ly);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawCosmicDynamic(ctx: CanvasRenderingContext2D, p: ScenarioRenderParams): void {
    const { width, height, elapsed, horizonScreenY: hy, vanishScreenX: vx, palette, bands } = p;
    const sideLum = bands.sideBrightness;
    const reactive = bands.reactiveEnabled ? 1 : 0.25;

    ctx.save();
    // Pulsing cosmic nebula rim glow around upper-right planet & center horizon
    const glowR = Math.min(width, height) * (0.24 + bands.mid * 0.06 * reactive);
    const cg = ctx.createRadialGradient(vx, hy, 4, vx, hy, glowR);
    cg.addColorStop(0, hexWithAlpha(palette.primary, 0.38 * sideLum));
    cg.addColorStop(0.5, hexWithAlpha(palette.secondary, 0.22 * sideLum));
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(vx, hy, glowR, 0, Math.PI * 2);
    ctx.fill();

    // Parallax floating faceted asteroids along both sides
    const rocks = [
      { x: 0.11, y: 0.66, r: 22, speed: 0.9, rot: 0.2 },
      { x: 0.21, y: 0.48, r: 13, speed: 1.3, rot: -0.4 },
      { x: 0.07, y: 0.82, r: 28, speed: 0.7, rot: 0.5 },
      { x: 0.88, y: 0.62, r: 24, speed: 1.0, rot: -0.3 },
      { x: 0.79, y: 0.45, r: 12, speed: 1.4, rot: 0.35 },
      { x: 0.92, y: 0.8, r: 26, speed: 0.8, rot: -0.5 },
    ];

    const rockScale = clamp(Math.min(width, height) / 760, 0.65, 1.3);
    for (let i = 0; i < rocks.length; i++) {
      const rk = rocks[i];
      const bob = Math.sin(elapsed * rk.speed + i * 1.9) * (6 + bands.subBass * 6 * reactive);
      const rx = rk.x * width + p.parallaxX * 14 * (i < 3 ? -1 : 1);
      const ry = rk.y * height + bob;
      const rad = rk.r * rockScale;

      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(rk.rot + Math.sin(elapsed * 0.4 + i) * 0.12);

      ctx.fillStyle = '#1b1147';
      ctx.strokeStyle = hexWithAlpha(i % 2 === 0 ? palette.primary : palette.secondary, 0.48 * sideLum);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-rad, -rad * 0.2);
      ctx.lineTo(-rad * 0.35, -rad * 0.9);
      ctx.lineTo(rad * 0.65, -rad * 0.72);
      ctx.lineTo(rad, rad * 0.15);
      ctx.lineTo(rad * 0.3, rad * 0.88);
      ctx.lineTo(-rad * 0.65, rad * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Small orbiting moon bobbing mid-right
    const omx = width * 0.74 + Math.cos(elapsed * 0.45) * 10;
    const omy = hy * 0.68 + Math.sin(elapsed * 0.65) * 5;
    const omr = Math.min(width, height) * 0.028;
    ctx.fillStyle = '#a78bfa';
    ctx.beginPath();
    ctx.arc(omx, omy, omr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawAmbientParticles(
    ctx: CanvasRenderingContext2D,
    theme: OfficialEnvironmentTheme,
    width: number,
    height: number,
    hy: number,
    elapsed: number,
    _trackScroll: number,
    palette: { primary: string; secondary: string; accent: string },
    bands: AudioVisualBands,
  ): void {
    const count = Math.round(
      (bands.graphicsQuality === 'low' ? 16 : bands.graphicsQuality === 'medium' ? 32 : 48) *
        clamp(bands.particleScale, 0.35, 1.3),
    );
    if (count <= 0) return;

    const colors =
      theme === 'tropical'
        ? ['#fde047', '#fff7ed', '#fb7185']
        : theme === 'sakura'
          ? ['#fbcfe8', '#f472b6', '#fde68a']
          : theme === 'cosmic'
            ? ['#e0f2fe', '#c084fc', '#67e8f9']
            : [palette.primary, palette.secondary, '#e0f2fe'];

    ctx.save();
    for (let i = 0; i < count && i < this.sprites.length; i++) {
      const sp = this.sprites[i];
      const col = colors[sp.tintIdx % colors.length];

      if (theme === 'sakura') {
        // Falling drifting sakura petals
        const py = ((sp.y + elapsed * sp.speed * 1.4) % 1.05) * height;
        const px =
          ((sp.x + Math.sin(elapsed * sp.drift + sp.phase) * 0.045 + elapsed * 0.015) % 1.04) * width;
        const rot = elapsed * 1.8 + sp.phase;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.65 + Math.sin(elapsed * 2 + sp.phase) * 0.2;
        ctx.beginPath();
        ctx.ellipse(0, 0, sp.size * 1.7, sp.size * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        // Rising sparkles / 4-point cosmic stars
        const py = (1 - ((sp.y + elapsed * sp.speed) % 1.0)) * (height * 0.92);
        const px = (sp.x + Math.sin(elapsed * sp.drift + sp.phase) * 0.02) * width;
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(elapsed * 3.2 + sp.phase));
        const r = sp.size * (0.85 + bands.high * 0.45);
        ctx.fillStyle = col;
        ctx.globalAlpha = twinkle * (py < hy ? 0.85 : 0.45);
        if (theme === 'cosmic' && i % 4 === 0) {
          // 4-point star sparkle
          ctx.beginPath();
          ctx.moveTo(px, py - r * 2.2);
          ctx.lineTo(px + r * 0.5, py - r * 0.5);
          ctx.lineTo(px + r * 2.2, py);
          ctx.lineTo(px + r * 0.5, py + r * 0.5);
          ctx.lineTo(px, py + r * 2.2);
          ctx.lineTo(px - r * 0.5, py + r * 0.5);
          ctx.lineTo(px - r * 2.2, py);
          ctx.lineTo(px - r * 0.5, py - r * 0.5);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }
}
