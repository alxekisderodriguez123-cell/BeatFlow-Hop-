import type { CameraRig, ProjectedPoint } from '../CameraRig';
import { hexWithAlpha } from '../noteColorPalette';
import { HIT_LINE_Z, type TrackVisualState } from './types';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Renders the 2.5D translucent neon highway, lane dividers, beat grid, outer rails,
 * hit line & lane receptors, active slide cursor, pooled lane pulses, shockwaves,
 * chord beams, and impact burst particles.
 */
export class PerspectiveTrack {
  private pTL: ProjectedPoint = { x: 0, y: 0, depth: 1, scale: 1 };
  private pTR: ProjectedPoint = { x: 0, y: 0, depth: 1, scale: 1 };
  private pBL: ProjectedPoint = { x: 0, y: 0, depth: 1, scale: 1 };
  private pBR: ProjectedPoint = { x: 0, y: 0, depth: 1, scale: 1 };
  private pA: ProjectedPoint = { x: 0, y: 0, depth: 1, scale: 1 };
  private pB: ProjectedPoint = { x: 0, y: 0, depth: 1, scale: 1 };

  public renderBaseTrack(
    ctx: CanvasRenderingContext2D,
    cameraRig: CameraRig,
    width: number,
    height: number,
    state: TrackVisualState,
  ): void {
    const {
      layout,
      trackPrimaryHex,
      trackSecondaryHex,
      trackAccentHex,
      trackScroll,
      bands,
    } = state;
    const halfW = layout.roadWidth * 0.5;
    const farZ = -56;
    const nearZ = 5.4;

    if (
      !cameraRig.projectPointInto(-halfW, 0, farZ, width, height, this.pTL) ||
      !cameraRig.projectPointInto(halfW, 0, farZ, width, height, this.pTR) ||
      !cameraRig.projectPointInto(-halfW, 0, nearZ, width, height, this.pBL) ||
      !cameraRig.projectPointInto(halfW, 0, nearZ, width, height, this.pBR)
    ) {
      return;
    }

    ctx.save();

    // 1. Subtle under-deck side aura flanking the runway
    const auraAlpha = clamp(0.16 + bands.bass * 0.16 + (bands.feverActive ? 0.14 : 0), 0.1, 0.45);
    const padExpand = Math.max(18, (this.pBR.x - this.pBL.x) * 0.08);
    ctx.fillStyle = hexWithAlpha(bands.feverActive ? trackAccentHex : trackPrimaryHex, auraAlpha * 0.45);
    ctx.beginPath();
    ctx.moveTo(this.pTL.x - 6, this.pTL.y);
    ctx.lineTo(this.pTR.x + 6, this.pTR.y);
    ctx.lineTo(this.pBR.x + padExpand, this.pBR.y);
    ctx.lineTo(this.pBL.x - padExpand, this.pBL.y);
    ctx.closePath();
    ctx.fill();

    // 2. Main translucent dark indigo-violet glass highway
    const deckGrad = ctx.createLinearGradient(0, this.pTL.y, 0, this.pBL.y);
    deckGrad.addColorStop(0, 'rgba(20, 14, 58, 0.72)');
    deckGrad.addColorStop(0.45, 'rgba(18, 12, 48, 0.88)');
    deckGrad.addColorStop(1, 'rgba(26, 16, 68, 0.94)');
    ctx.fillStyle = deckGrad;
    ctx.beginPath();
    ctx.moveTo(this.pTL.x, this.pTL.y);
    ctx.lineTo(this.pTR.x, this.pTR.y);
    ctx.lineTo(this.pBR.x, this.pBR.y);
    ctx.lineTo(this.pBL.x, this.pBL.y);
    ctx.closePath();
    ctx.fill();

    // 3. Alternating longitudinal subtle lane glow bands
    for (let i = 0; i < layout.laneCount; i++) {
      const lx0 = -halfW + 0.175 + i * layout.laneStep;
      const lx1 = lx0 + layout.laneStep;
      const f = state.laneFlash[i] ?? 0;
      const mf = state.laneMissFlash[i] ?? 0;
      const holdOn = state.activeHoldLanes[i] ? 0.35 : 0;
      const laneCol = i % 2 === 0 ? trackPrimaryHex : trackSecondaryHex;
      const laneAlpha = clamp(0.055 + f * 0.24 + holdOn * 0.2, 0.04, 0.36);

      if (
        cameraRig.projectPointInto(lx0, 0, farZ, width, height, this.pA) &&
        cameraRig.projectPointInto(lx1, 0, farZ, width, height, this.pB)
      ) {
        const topLx = this.pA.x;
        const topLy = this.pA.y;
        const topRx = this.pB.x;
        const topRy = this.pB.y;
        if (
          cameraRig.projectPointInto(lx0, 0, nearZ, width, height, this.pA) &&
          cameraRig.projectPointInto(lx1, 0, nearZ, width, height, this.pB)
        ) {
          ctx.fillStyle = mf > 0.05 ? `rgba(244, 63, 94, ${(mf * 0.28).toFixed(3)})` : hexWithAlpha(laneCol, laneAlpha);
          ctx.beginPath();
          ctx.moveTo(topLx, topLy);
          ctx.lineTo(topRx, topRy);
          ctx.lineTo(this.pB.x, this.pB.y);
          ctx.lineTo(this.pA.x, this.pA.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // 4. Scrolling horizontal beat-grid bands
    const gridSpacing = 5.5;
    const offset = ((trackScroll * 1.45) % 1 + 1) % 1;
    ctx.lineWidth = 1.25;
    for (let step = 0; step < 11; step++) {
      const gz = farZ + (step + offset) * gridSpacing;
      if (gz > nearZ || gz < farZ) continue;
      if (
        cameraRig.projectPointInto(-halfW + 0.08, 0, gz, width, height, this.pA) &&
        cameraRig.projectPointInto(halfW - 0.08, 0, gz, width, height, this.pB)
      ) {
        const depthFade = clamp((gz - farZ) / 28, 0.08, 1);
        ctx.strokeStyle = `rgba(165, 180, 252, ${(0.11 * depthFade).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(this.pA.x, this.pA.y);
        ctx.lineTo(this.pB.x, this.pB.y);
        ctx.stroke();
      }
    }

    // 5. Inner lane divider hairlines
    ctx.lineWidth = 1.4;
    for (let i = 1; i < layout.laneCount; i++) {
      const divX = -halfW + 0.175 + i * layout.laneStep;
      if (
        cameraRig.projectPointInto(divX, 0, farZ, width, height, this.pA) &&
        cameraRig.projectPointInto(divX, 0, nearZ, width, height, this.pB)
      ) {
        const divGrad = ctx.createLinearGradient(this.pA.x, this.pA.y, this.pB.x, this.pB.y);
        divGrad.addColorStop(0, 'rgba(148, 163, 184, 0.08)');
        divGrad.addColorStop(0.5, 'rgba(186, 230, 253, 0.34)');
        divGrad.addColorStop(1, 'rgba(224, 242, 254, 0.55)');
        ctx.strokeStyle = divGrad;
        ctx.beginPath();
        ctx.moveTo(this.pA.x, this.pA.y);
        ctx.lineTo(this.pB.x, this.pB.y);
        ctx.stroke();
      }
    }

    // 6. Pooled longitudinal lane pulses & surface waves
    for (let i = 0; i < state.lanePulses.length; i++) {
      const lp = state.lanePulses[i];
      if (!lp.active) continue;
      const frac = 1 - lp.life / lp.maxLife;
      const zStart = lp.z;
      const zEnd = Math.max(farZ, lp.z - lp.length);
      const lx = layout.laneX[lp.lane] ?? 0;
      const hw = layout.laneStep * 0.42;
      if (
        cameraRig.projectPointInto(lx - hw, 0.02, zEnd, width, height, this.pA) &&
        cameraRig.projectPointInto(lx + hw, 0.02, zEnd, width, height, this.pB)
      ) {
        const farLx = this.pA.x;
        const farLy = this.pA.y;
        const farRx = this.pB.x;
        const farRy = this.pB.y;
        if (
          cameraRig.projectPointInto(lx - hw, 0.02, zStart, width, height, this.pA) &&
          cameraRig.projectPointInto(lx + hw, 0.02, zStart, width, height, this.pB)
        ) {
          ctx.fillStyle = hexWithAlpha(lp.color, (1 - frac) * 0.48);
          ctx.beginPath();
          ctx.moveTo(farLx, farLy);
          ctx.lineTo(farRx, farRy);
          ctx.lineTo(this.pB.x, this.pB.y);
          ctx.lineTo(this.pA.x, this.pA.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    for (let i = 0; i < state.surfaceWaves.length; i++) {
      const sw = state.surfaceWaves[i];
      if (!sw.active) continue;
      const alpha = (sw.life / sw.maxLife) * 0.55;
      if (
        cameraRig.projectPointInto(-halfW, 0.03, sw.z, width, height, this.pA) &&
        cameraRig.projectPointInto(halfW, 0.03, sw.z, width, height, this.pB)
      ) {
        ctx.strokeStyle = hexWithAlpha(sw.color, alpha);
        ctx.lineWidth = Math.max(2, this.pA.scale * 0.14);
        ctx.beginPath();
        ctx.moveTo(this.pA.x, this.pA.y);
        ctx.lineTo(this.pB.x, this.pB.y);
        ctx.stroke();
      }
    }

    // 7. Outer luminous neon rails (left & right)
    const railGlow = clamp(0.65 + bands.bass * 0.25 + bands.kickPulse * 0.2, 0.5, 1.0) * bands.glowScale;
    const leftRailCol = bands.feverActive ? trackAccentHex : trackPrimaryHex;
    const rightRailCol = bands.feverActive ? trackAccentHex : trackSecondaryHex;

    ctx.lineCap = 'round';
    // Left rail glow + core
    ctx.strokeStyle = hexWithAlpha(leftRailCol, clamp(0.38 * railGlow, 0.15, 0.72));
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(this.pTL.x, this.pTL.y);
    ctx.lineTo(this.pBL.x, this.pBL.y);
    ctx.stroke();

    ctx.strokeStyle = hexWithAlpha(leftRailCol, 0.96);
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(this.pTL.x, this.pTL.y);
    ctx.lineTo(this.pBL.x, this.pBL.y);
    ctx.stroke();

    // Right rail glow + core
    ctx.strokeStyle = hexWithAlpha(rightRailCol, clamp(0.38 * railGlow, 0.15, 0.72));
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(this.pTR.x, this.pTR.y);
    ctx.lineTo(this.pBR.x, this.pBR.y);
    ctx.stroke();

    ctx.strokeStyle = hexWithAlpha(rightRailCol, 0.96);
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(this.pTR.x, this.pTR.y);
    ctx.lineTo(this.pBR.x, this.pBR.y);
    ctx.stroke();

    // 8. Hit Line Bar + Lane Receptor Pads (at z = HIT_LINE_Z)
    if (
      cameraRig.projectPointInto(-halfW, 0.03, HIT_LINE_Z, width, height, this.pA) &&
      cameraRig.projectPointInto(halfW, 0.03, HIT_LINE_Z, width, height, this.pB)
    ) {
      const hitCol = bands.feverActive ? trackAccentHex : '#e0f2fe';
      ctx.strokeStyle = hexWithAlpha(trackPrimaryHex, 0.42);
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(this.pA.x, this.pA.y);
      ctx.lineTo(this.pB.x, this.pB.y);
      ctx.stroke();

      ctx.strokeStyle = hitCol;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(this.pA.x, this.pA.y);
      ctx.lineTo(this.pB.x, this.pB.y);
      ctx.stroke();
    }

    // Lane Receptor Pads
    const padHalfW = layout.laneStep * 0.41;
    const padHalfZ = 0.46;
    for (let i = 0; i < layout.laneCount; i++) {
      const lx = layout.laneX[i];
      const f = state.laneFlash[i] ?? 0;
      const mf = state.laneMissFlash[i] ?? 0;
      const holdOn = state.activeHoldLanes[i];
      const baseCol = mf > 0.05 ? '#f43f5e' : i % 2 === 0 ? trackPrimaryHex : trackSecondaryHex;
      const activeBoost = holdOn ? 0.85 : f;

      if (
        cameraRig.projectPointInto(lx - padHalfW, 0.04, HIT_LINE_Z - padHalfZ, width, height, this.pTL) &&
        cameraRig.projectPointInto(lx + padHalfW, 0.04, HIT_LINE_Z - padHalfZ, width, height, this.pTR) &&
        cameraRig.projectPointInto(lx - padHalfW, 0.04, HIT_LINE_Z + padHalfZ, width, height, this.pBL) &&
        cameraRig.projectPointInto(lx + padHalfW, 0.04, HIT_LINE_Z + padHalfZ, width, height, this.pBR)
      ) {
        ctx.fillStyle = hexWithAlpha(baseCol, clamp(0.14 + activeBoost * 0.46, 0.12, 0.72));
        ctx.beginPath();
        ctx.moveTo(this.pTL.x, this.pTL.y);
        ctx.lineTo(this.pTR.x, this.pTR.y);
        ctx.lineTo(this.pBR.x, this.pBR.y);
        ctx.lineTo(this.pBL.x, this.pBL.y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = hexWithAlpha(
          activeBoost > 0.25 ? '#ffffff' : baseCol,
          clamp(0.55 + activeBoost * 0.45, 0.5, 1.0),
        );
        ctx.lineWidth = activeBoost > 0.25 ? 2.4 : 1.6;
        ctx.stroke();
      }
    }

    // 9. Miss crimson warning wave across hit line
    if (state.missWaveLife > 0) {
      const frac = state.missWaveLife / state.missWaveMaxLife;
      if (
        cameraRig.projectPointInto(-halfW, 0.08, HIT_LINE_Z, width, height, this.pA) &&
        cameraRig.projectPointInto(halfW, 0.08, HIT_LINE_Z, width, height, this.pB)
      ) {
        ctx.strokeStyle = `rgba(244, 63, 94, ${(frac * 0.85).toFixed(3)})`;
        ctx.lineWidth = 6 + (1 - frac) * 14;
        ctx.beginPath();
        ctx.moveTo(this.pA.x, this.pA.y);
        ctx.lineTo(this.pB.x, this.pB.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  public renderForegroundEffects(
    ctx: CanvasRenderingContext2D,
    cameraRig: CameraRig,
    width: number,
    height: number,
    state: TrackVisualState,
  ): void {
    ctx.save();

    // 1. Chord horizontal energy beams
    for (let i = 0; i < state.chordBeams.length; i++) {
      const cb = state.chordBeams[i];
      if (!cb.active) continue;
      const frac = cb.life / cb.maxLife;
      if (
        cameraRig.projectPointInto(cb.x1, 0.16, cb.z, width, height, this.pA) &&
        cameraRig.projectPointInto(cb.x2, 0.16, cb.z, width, height, this.pB)
      ) {
        ctx.strokeStyle = hexWithAlpha(cb.color, frac * 0.88);
        ctx.lineWidth = Math.max(2.5, this.pA.scale * 0.09);
        ctx.beginPath();
        ctx.moveTo(this.pA.x, this.pA.y);
        ctx.lineTo(this.pB.x, this.pB.y);
        ctx.stroke();
      }
    }

    // 2. Active slide cursor orb
    if (state.activeSlideCursor.active) {
      if (
        cameraRig.projectPointInto(
          state.activeSlideCursor.x,
          0.22,
          state.activeSlideCursor.z,
          width,
          height,
          this.pA,
        )
      ) {
        const r = Math.max(10, this.pA.scale * 0.28);
        const grad = ctx.createRadialGradient(this.pA.x, this.pA.y, 2, this.pA.x, this.pA.y, r * 1.9);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.45, hexWithAlpha(state.activeSlideCursor.colorHex, 0.9));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.pA.x, this.pA.y, r * 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3. Shockwaves & hit explosions
    for (let i = 0; i < state.shockwaves.length; i++) {
      const sw = state.shockwaves[i];
      if (!sw.active) continue;
      const progress = 1 - sw.life / sw.maxLife;
      const alpha = (1 - progress) * (sw.isFlame ? 0.92 : 0.78);
      if (cameraRig.projectPointInto(sw.x, sw.y, sw.z, width, height, this.pA)) {
        const rx = sw.maxRadius * (0.28 + progress * 0.88) * this.pA.scale;
        const ry = rx * 0.44;
        ctx.strokeStyle = hexWithAlpha(sw.color, alpha);
        ctx.lineWidth = Math.max(2, (1 - progress) * 5.5);
        ctx.beginPath();
        ctx.ellipse(this.pA.x, this.pA.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Inner bright flash core during first half
        if (progress < 0.55) {
          const coreAlpha = (1 - progress / 0.55) * 0.85;
          const cg = ctx.createRadialGradient(this.pA.x, this.pA.y, 1, this.pA.x, this.pA.y, rx * 0.8);
          cg.addColorStop(0, `rgba(255,255,255,${coreAlpha.toFixed(3)})`);
          cg.addColorStop(0.5, hexWithAlpha(sw.secondaryColor, coreAlpha * 0.55));
          cg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = cg;
          ctx.beginPath();
          ctx.arc(this.pA.x, this.pA.y, rx * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }

        if (sw.isFlame) {
          const plumeH = rx * (1.2 + progress * 1.1);
          const fg = ctx.createLinearGradient(this.pA.x, this.pA.y, this.pA.x, this.pA.y - plumeH);
          fg.addColorStop(0, hexWithAlpha(sw.color, alpha * 0.8));
          fg.addColorStop(0.6, hexWithAlpha(sw.secondaryColor, alpha * 0.4));
          fg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.moveTo(this.pA.x - rx * 0.35, this.pA.y);
          ctx.lineTo(this.pA.x, this.pA.y - plumeH);
          ctx.lineTo(this.pA.x + rx * 0.35, this.pA.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // 4. Pooled Hit Burst Particles
    for (let i = 0; i < state.particles.length; i++) {
      const pt = state.particles[i];
      if (!pt.active) continue;
      const frac = pt.life / pt.maxLife;
      if (cameraRig.projectPointInto(pt.x, pt.y, pt.z, width, height, this.pA)) {
        const rad = Math.max(1.5, pt.size * this.pA.scale * frac);
        ctx.fillStyle = hexWithAlpha(pt.color, clamp(frac * 0.95, 0, 1));
        ctx.beginPath();
        ctx.arc(this.pA.x, this.pA.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
