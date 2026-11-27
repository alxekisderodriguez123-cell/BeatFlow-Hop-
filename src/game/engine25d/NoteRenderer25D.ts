import type { ConcreteNoteShape, FlickDirection, QualityLevel } from '../../types/game';
import type { CameraRig, ProjectedPoint } from '../CameraRig';
import { hexWithAlpha } from '../noteColorPalette';
import {
  HIT_LINE_Z,
  SPAWN_Z,
  type ActiveNoteRenderItem,
  type TrackLayout,
} from './types';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Renders 2.5D extruded notes, hold ribbons, curved slide trajectories,
 * directional flick chevrons, glossy runway reflections, and Creator color modes
 * in Painter's order (farthest-to-nearest).
 */
export class NoteRenderer25D {
  private pHead: ProjectedPoint = { x: 0, y: 0, depth: 1, scale: 1 };
  private pTail: ProjectedPoint = { x: 0, y: 0, depth: 1, scale: 1 };
  private pTL: ProjectedPoint = { x: 0, y: 0, depth: 1, scale: 1 };
  private pTR: ProjectedPoint = { x: 0, y: 0, depth: 1, scale: 1 };
  private pBL: ProjectedPoint = { x: 0, y: 0, depth: 1, scale: 1 };
  private pBR: ProjectedPoint = { x: 0, y: 0, depth: 1, scale: 1 };
  private pA: ProjectedPoint = { x: 0, y: 0, depth: 1, scale: 1 };
  private pB: ProjectedPoint = { x: 0, y: 0, depth: 1, scale: 1 };
  private pRefl: ProjectedPoint = { x: 0, y: 0, depth: 1, scale: 1 };

  public renderNotes(
    ctx: CanvasRenderingContext2D,
    cameraRig: CameraRig,
    width: number,
    height: number,
    notes: ActiveNoteRenderItem[],
    layout: TrackLayout,
    currentTime: number,
    noteSpeed: number,
    elapsed: number,
    glowScale: number,
    reflectionQuality: QualityLevel,
  ): void {
    if (notes.length === 0) return;

    // Sort back-to-front (smaller Z = farther from camera = draw first)
    notes.sort((a, b) => a.z - b.z);

    ctx.save();
    for (let i = 0; i < notes.length; i++) {
      const item = notes[i];
      const n = item.data;

      // 1. Render Hold or Slide tail first (behind the note head)
      if (n.kind === 'hold' && n.durationSec && n.durationSec > 0.05) {
        this.drawHoldTail(
          ctx,
          cameraRig,
          width,
          height,
          item,
          layout,
          elapsed,
          glowScale,
        );
      } else if (n.kind === 'slide' && n.slidePath && n.slidePath.length >= 2) {
        this.drawSlideRibbon(
          ctx,
          cameraRig,
          width,
          height,
          item,
          layout,
          currentTime,
          noteSpeed,
          elapsed,
          glowScale,
        );
      }

      // 2. Render Note Head
      const laneX = layout.laneX[n.lane] ?? 0;
      const headZ = item.holdStarted ? Math.max(HIT_LINE_Z, item.z) : item.z;
      if (headZ < SPAWN_Z - 1 || headZ > 5.0) continue;

      if (!cameraRig.projectPointInto(laneX, 0.16, headZ, width, height, this.pHead)) {
        continue;
      }

      const halfW = 0.44 * layout.noteScaleX;
      const halfD = 0.34;
      if (
        !cameraRig.projectPointInto(laneX - halfW, 0.16, headZ - halfD, width, height, this.pTL) ||
        !cameraRig.projectPointInto(laneX + halfW, 0.16, headZ - halfD, width, height, this.pTR) ||
        !cameraRig.projectPointInto(laneX - halfW, 0.16, headZ + halfD, width, height, this.pBL) ||
        !cameraRig.projectPointInto(laneX + halfW, 0.16, headZ + halfD, width, height, this.pBR)
      ) {
        continue;
      }

      const depthFade = clamp((headZ - SPAWN_Z) / 7.5, 0.15, 1.0) * item.opacity;
      if (depthFade <= 0.02) continue;

      // Glossy reflection on track surface beneath note
      if (reflectionQuality !== 'low' && headZ > -36) {
        if (cameraRig.projectPointInto(laneX, 0.01, headZ, width, height, this.pRefl)) {
          const rx = Math.max(8, (this.pBR.x - this.pBL.x) * 0.62);
          const ry = Math.max(4, rx * 0.34);
          const rg = ctx.createRadialGradient(
            this.pRefl.x,
            this.pRefl.y + ry * 0.25,
            1,
            this.pRefl.x,
            this.pRefl.y + ry * 0.25,
            rx,
          );
          const reflAlpha = (reflectionQuality === 'high' ? 0.32 : 0.2) * depthFade;
          rg.addColorStop(0, hexWithAlpha(item.colorHex, reflAlpha));
          rg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.ellipse(this.pRefl.x, this.pRefl.y + ry * 0.25, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      this.drawNoteHead(
        ctx,
        item,
        depthFade,
        elapsed,
        glowScale,
      );

      // 3. Directional Flick Arrow above Flick notes
      if (n.kind === 'flick' && item.flickDir) {
        this.drawFlickArrow(
          ctx,
          this.pHead.x,
          this.pHead.y - Math.max(12, this.pHead.scale * 0.28),
          this.pHead.scale,
          item.flickDir,
          elapsed,
          depthFade,
        );
      }
    }
    ctx.restore();
  }

  private drawHoldTail(
    ctx: CanvasRenderingContext2D,
    cameraRig: CameraRig,
    width: number,
    height: number,
    item: ActiveNoteRenderItem,
    layout: TrackLayout,
    elapsed: number,
    glowScale: number,
  ): void {
    const lx = layout.laneX[item.data.lane] ?? 0;
    const startZ = item.holdStarted ? HIT_LINE_Z : item.z;
    const endZ = item.tailZ;
    if (endZ >= startZ - 0.08) return;

    const clampedEndZ = Math.max(SPAWN_Z - 4, endZ);
    const ribbonHalfW = 0.22 * layout.noteScaleX;

    if (
      !cameraRig.projectPointInto(lx - ribbonHalfW, 0.11, clampedEndZ, width, height, this.pTL) ||
      !cameraRig.projectPointInto(lx + ribbonHalfW, 0.11, clampedEndZ, width, height, this.pTR) ||
      !cameraRig.projectPointInto(lx - ribbonHalfW, 0.11, startZ, width, height, this.pBL) ||
      !cameraRig.projectPointInto(lx + ribbonHalfW, 0.11, startZ, width, height, this.pBR)
    ) {
      return;
    }

    const activeBoost = item.holdHeldNow ? 1.25 : 0.85;
    const pulse = 0.78 + 0.22 * Math.sin(elapsed * 12);
    const alpha = clamp(item.opacity * 0.78 * activeBoost * pulse, 0.2, 0.95);

    const grad = ctx.createLinearGradient(0, this.pTL.y, 0, this.pBL.y);
    grad.addColorStop(0, hexWithAlpha(item.secondaryHex || item.colorHex, alpha * 0.55));
    grad.addColorStop(1, hexWithAlpha(item.colorHex, alpha));

    // Outer ribbon body
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(this.pTL.x, this.pTL.y);
    ctx.lineTo(this.pTR.x, this.pTR.y);
    ctx.lineTo(this.pBR.x, this.pBR.y);
    ctx.lineTo(this.pBL.x, this.pBL.y);
    ctx.closePath();
    ctx.fill();

    // Bright center energy spine
    const topMidX = (this.pTL.x + this.pTR.x) * 0.5;
    const topMidY = (this.pTL.y + this.pTR.y) * 0.5;
    const botMidX = (this.pBL.x + this.pBR.x) * 0.5;
    const botMidY = (this.pBL.y + this.pBR.y) * 0.5;

    ctx.strokeStyle = `rgba(255, 255, 255, ${(alpha * 0.85 * Math.min(1.2, glowScale)).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.8, (this.pBR.x - this.pBL.x) * 0.18);
    ctx.beginPath();
    ctx.moveTo(topMidX, topMidY);
    ctx.lineTo(botMidX, botMidY);
    ctx.stroke();

    // Luminous Hold End-Cap
    if (cameraRig.projectPointInto(lx, 0.12, clampedEndZ, width, height, this.pTail)) {
      const capW = Math.max(4, (this.pTR.x - this.pTL.x) * 0.58);
      const capH = Math.max(2.5, capW * 0.45);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(topMidX, topMidY, capW, capH, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSlideRibbon(
    ctx: CanvasRenderingContext2D,
    cameraRig: CameraRig,
    width: number,
    height: number,
    item: ActiveNoteRenderItem,
    layout: TrackLayout,
    currentTime: number,
    noteSpeed: number,
    elapsed: number,
    _glowScale: number,
  ): void {
    const path = item.data.slidePath;
    if (!path || path.length < 2) return;

    const steps = Math.max(8, (path.length - 1) * 6);
    const totalDur = item.data.durationSec ?? path[path.length - 1].timeOffset;
    if (totalDur <= 0.02) return;

    const halfW = 0.19 * layout.noteScaleX;
    const pulse = 0.8 + 0.2 * Math.sin(elapsed * 10);
    const alpha = clamp(item.opacity * (item.slideActive ? 0.94 : 0.72) * pulse, 0.18, 0.95);

    const sampleLaneAt = (tOff: number): number => {
      for (let k = 0; k < path.length - 1; k++) {
        const a = path[k];
        const b = path[k + 1];
        if (tOff >= a.timeOffset && tOff <= b.timeOffset) {
          const span = Math.max(0.001, b.timeOffset - a.timeOffset);
          const u = (tOff - a.timeOffset) / span;
          const smoothU = u * u * (3 - 2 * u);
          return a.lane + (b.lane - a.lane) * smoothU;
        }
      }
      return path[path.length - 1].lane;
    };

    const getWorldXForLaneFloat = (laneF: number): number => {
      const base = layout.laneX[0] ?? 0;
      return base + laneF * layout.laneStep;
    };

    // Build smooth quad segments along slide trajectory
    for (let s = 0; s < steps; s++) {
      const f0 = s / steps;
      const f1 = (s + 1) / steps;
      const t0 = item.data.time + f0 * totalDur;
      const t1 = item.data.time + f1 * totalDur;
      const z0 = HIT_LINE_Z - (t0 - currentTime) * noteSpeed;
      const z1 = HIT_LINE_Z - (t1 - currentTime) * noteSpeed;
      if (z1 < SPAWN_Z - 4 || z0 > 4.6) continue;

      const x0 = getWorldXForLaneFloat(sampleLaneAt(f0 * totalDur));
      const x1 = getWorldXForLaneFloat(sampleLaneAt(f1 * totalDur));

      if (
        cameraRig.projectPointInto(x0 - halfW, 0.12, z0, width, height, this.pBL) &&
        cameraRig.projectPointInto(x0 + halfW, 0.12, z0, width, height, this.pBR) &&
        cameraRig.projectPointInto(x1 - halfW, 0.12, z1, width, height, this.pTL) &&
        cameraRig.projectPointInto(x1 + halfW, 0.12, z1, width, height, this.pTR)
      ) {
        ctx.fillStyle = hexWithAlpha(item.colorHex, alpha * 0.72);
        ctx.beginPath();
        ctx.moveTo(this.pTL.x, this.pTL.y);
        ctx.lineTo(this.pTR.x, this.pTR.y);
        ctx.lineTo(this.pBR.x, this.pBR.y);
        ctx.lineTo(this.pBL.x, this.pBL.y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = `rgba(255,255,255,${(alpha * 0.85).toFixed(3)})`;
        ctx.lineWidth = Math.max(1.5, (this.pBR.x - this.pBL.x) * 0.22);
        ctx.beginPath();
        ctx.moveTo((this.pBL.x + this.pBR.x) * 0.5, (this.pBL.y + this.pBR.y) * 0.5);
        ctx.lineTo((this.pTL.x + this.pTR.x) * 0.5, (this.pTL.y + this.pTR.y) * 0.5);
        ctx.stroke();
      }
    }

    // Waypoint diamond nodes
    for (let k = 1; k < path.length; k++) {
      const wp = path[k];
      const wz = HIT_LINE_Z - (item.data.time + wp.timeOffset - currentTime) * noteSpeed;
      if (wz < SPAWN_Z || wz > 4.5) continue;
      const wx = layout.laneX[wp.lane] ?? 0;
      if (cameraRig.projectPointInto(wx, 0.16, wz, width, height, this.pA)) {
        const r = Math.max(4, this.pA.scale * 0.16);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(this.pA.x, this.pA.y - r);
        ctx.lineTo(this.pA.x + r, this.pA.y);
        ctx.lineTo(this.pA.x, this.pA.y + r);
        ctx.lineTo(this.pA.x - r, this.pA.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  private drawNoteHead(
    ctx: CanvasRenderingContext2D,
    item: ActiveNoteRenderItem,
    alpha: number,
    elapsed: number,
    glowScale: number,
  ): void {
    const cx = this.pHead.x;
    const cy = this.pHead.y;
    const topW = Math.max(8, this.pTR.x - this.pTL.x);
    const botW = Math.max(10, this.pBR.x - this.pBL.x);
    const hPx = Math.max(4.5, Math.abs(this.pBL.y - this.pTL.y));
    const depthThickness = clamp(hPx * 0.45, 3, 12);

    const n = item.data;
    const shape: ConcreteNoteShape =
      n.customCasillaShape === 'circle'
        ? 'disc'
        : n.customCasillaShape === 'triangle'
          ? 'prism'
          : n.customCasillaShape === 'diamond'
            ? 'diamond'
            : n.customCasillaShape === 'square'
              ? 'square'
              : item.shape;

    const prox = item.proximityBoost;
    const primary = item.colorHex;
    const secondary = item.secondaryHex || primary;
    const comboMode = n.customColorComboMode;

    // Resolve fill style (solid, gradient, split, alternating)
    let fillStyle: string | CanvasGradient = hexWithAlpha(primary, alpha);
    if (comboMode === 'gradient' && secondary !== primary) {
      const grad = ctx.createLinearGradient(this.pBL.x, cy, this.pBR.x, cy);
      grad.addColorStop(0, hexWithAlpha(primary, alpha));
      grad.addColorStop(1, hexWithAlpha(secondary, alpha));
      fillStyle = grad;
    } else if (comboMode === 'split' && secondary !== primary) {
      const grad = ctx.createLinearGradient(this.pBL.x, cy, this.pBR.x, cy);
      grad.addColorStop(0, hexWithAlpha(primary, alpha));
      grad.addColorStop(0.49, hexWithAlpha(primary, alpha));
      grad.addColorStop(0.51, hexWithAlpha(secondary, alpha));
      grad.addColorStop(1, hexWithAlpha(secondary, alpha));
      fillStyle = grad;
    } else if (comboMode === 'alternating' && secondary !== primary) {
      const useSec = Math.floor(elapsed * 4) % 2 === 1;
      fillStyle = hexWithAlpha(useSec ? secondary : primary, alpha);
    }

    // MusicalRole halo (kick bass punch)
    if (n.musicalRole === 'kick' || n.musicalRole === 'drop') {
      const haloRx = botW * (0.64 + prox * 0.14);
      const haloRy = hPx * (0.82 + prox * 0.18);
      ctx.fillStyle = hexWithAlpha(primary, alpha * (0.24 + prox * 0.2) * Math.min(1.2, glowScale));
      ctx.beginPath();
      ctx.ellipse(cx, cy, haloRx, haloRy, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw 2.5D extruded shape
    if (shape === 'sphere' || shape === 'disc') {
      const rx = botW * 0.44;
      const ry = shape === 'sphere' ? rx * 0.72 : Math.max(4, hPx * 0.56);
      // Side rim
      ctx.fillStyle = hexWithAlpha(primary, alpha * 0.48);
      ctx.beginPath();
      ctx.ellipse(cx, cy + depthThickness * 0.65, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      // Main cap
      ctx.fillStyle = fillStyle;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      // Rim + bright core highlight
      ctx.strokeStyle = `rgba(255,255,255,${(alpha * (0.72 + prox * 0.25)).toFixed(3)})`;
      ctx.lineWidth = 1.6 + prox * 0.8;
      ctx.stroke();

      ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.36).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(cx - rx * 0.18, cy - ry * 0.2, rx * 0.42, ry * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (shape === 'ring') {
      const rx = botW * 0.45;
      const ry = Math.max(4.5, hPx * 0.56);
      ctx.strokeStyle = fillStyle;
      ctx.lineWidth = Math.max(3.5, rx * 0.28);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.8, ry * 0.8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${(alpha * 0.85).toFixed(3)})`;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    } else if (shape === 'diamond') {
      const rx = botW * 0.48;
      const ry = Math.max(5.5, hPx * 0.75);
      // 3D front rim
      ctx.fillStyle = hexWithAlpha(primary, alpha * 0.45);
      ctx.beginPath();
      ctx.moveTo(cx - rx, cy);
      ctx.lineTo(cx, cy + ry);
      ctx.lineTo(cx + rx, cy);
      ctx.lineTo(cx + rx, cy + depthThickness);
      ctx.lineTo(cx, cy + ry + depthThickness);
      ctx.lineTo(cx - rx, cy + depthThickness);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = fillStyle;
      ctx.beginPath();
      ctx.moveTo(cx, cy - ry);
      ctx.lineTo(cx + rx, cy);
      ctx.lineTo(cx, cy + ry);
      ctx.lineTo(cx - rx, cy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${(alpha * 0.82).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else if (shape === 'prism') {
      const rx = botW * 0.45;
      const ry = Math.max(6, hPx * 0.85);
      ctx.fillStyle = fillStyle;
      ctx.beginPath();
      ctx.moveTo(cx, cy - ry);
      ctx.lineTo(cx + rx, cy + ry * 0.65);
      ctx.lineTo(cx - rx, cy + ry * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${(alpha * 0.84).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else if (shape === 'hexagon') {
      const rx = botW * 0.46;
      const ry = Math.max(5, hPx * 0.62);
      ctx.fillStyle = fillStyle;
      ctx.beginPath();
      ctx.moveTo(cx - rx * 0.55, cy - ry);
      ctx.lineTo(cx + rx * 0.55, cy - ry);
      ctx.lineTo(cx + rx, cy);
      ctx.lineTo(cx + rx * 0.55, cy + ry);
      ctx.lineTo(cx - rx * 0.55, cy + ry);
      ctx.lineTo(cx - rx, cy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${(alpha * 0.82).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else {
      // 'tile' & 'square' — Signature beveled 2.5D glowing perspective rhythm pad
      const padT = shape === 'square' ? topW * 0.42 : topW * 0.48;
      const padB = shape === 'square' ? botW * 0.42 : botW * 0.48;
      const yTop = this.pTL.y;
      const yBot = this.pBL.y;

      // Extruded front face (2.5D thickness)
      ctx.fillStyle = hexWithAlpha(primary, alpha * 0.46);
      ctx.beginPath();
      ctx.moveTo(cx - padB, yBot);
      ctx.lineTo(cx + padB, yBot);
      ctx.lineTo(cx + padB, yBot + depthThickness);
      ctx.lineTo(cx - padB, yBot + depthThickness);
      ctx.closePath();
      ctx.fill();

      // Perspective top face
      ctx.fillStyle = fillStyle;
      ctx.beginPath();
      ctx.moveTo(cx - padT, yTop);
      ctx.lineTo(cx + padT, yTop);
      ctx.lineTo(cx + padB, yBot);
      ctx.lineTo(cx - padB, yBot);
      ctx.closePath();
      ctx.fill();

      // Crisp specular white/neon rim
      ctx.strokeStyle = `rgba(255,255,255,${(alpha * (0.78 + prox * 0.22)).toFixed(3)})`;
      ctx.lineWidth = 1.6 + prox * 0.8;
      ctx.stroke();

      // Inner luminous tablet face highlight
      const inT = padT * 0.72;
      const inB = padB * 0.72;
      const inYTop = yTop + (yBot - yTop) * 0.2;
      const inYBot = yTop + (yBot - yTop) * 0.78;
      ctx.fillStyle = `rgba(255,255,255,${(alpha * (0.24 + prox * 0.16)).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(cx - inT, inYTop);
      ctx.lineTo(cx + inT, inYTop);
      ctx.lineTo(cx + inB, inYBot);
      ctx.lineTo(cx - inB, inYBot);
      ctx.closePath();
      ctx.fill();
    }

    // Crisp musical accent glint for snare / clap / hihat
    if (n.musicalRole === 'snare' || n.musicalRole === 'clap') {
      const r = Math.max(2.5, botW * 0.1);
      ctx.fillStyle = `rgba(255, 250, 220, ${(alpha * 0.9).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 1.4);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r * 1.4);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawFlickArrow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    dir: FlickDirection,
    elapsed: number,
    alpha: number,
  ): void {
    const bob = Math.sin(elapsed * 8) * Math.max(1.5, scale * 0.04);
    const sz = clamp(scale * 0.22, 6, 18);
    ctx.save();
    ctx.translate(x, y + bob);
    if (dir === 'left') ctx.rotate(-Math.PI * 0.5);
    else if (dir === 'right') ctx.rotate(Math.PI * 0.5);

    ctx.strokeStyle = `rgba(254, 240, 138, ${alpha.toFixed(3)})`;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
    ctx.lineWidth = Math.max(2, sz * 0.24);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(-sz * 0.75, sz * 0.35);
    ctx.lineTo(0, -sz * 0.45);
    ctx.lineTo(sz * 0.75, sz * 0.35);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, sz * 0.85);
    ctx.lineTo(0, -sz * 0.35);
    ctx.stroke();
    ctx.restore();
  }
}
