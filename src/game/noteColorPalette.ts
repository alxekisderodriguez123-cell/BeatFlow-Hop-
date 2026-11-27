import type { EnvironmentTheme, OfficialEnvironmentTheme, SongPalette } from '../types/game';

export interface RgbColor {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
}

export interface ReadableTrackColors {
  notePrimaryHex: string;
  noteSecondaryHex: string;
  noteAccentHex: string;
  trackPrimaryHex: string;
  trackSecondaryHex: string;
  trackAccentHex: string;
}

const HARMONIC_TILE_HEXES = [
  '#22d3ee', // Electric cyan
  '#fb7185', // Coral rose
  '#fde047', // Luminous yellow
  '#fb923c', // Tangerine orange
  '#2dd4bf', // Turquoise mint
  '#c084fc', // Bright neon violet
  '#38bdf8', // Sky azure
  '#f43f5e', // Crimson coral
  '#a3e635', // Lime neon
  '#f472b6', // Radiant pink
] as const;

const WORLD_COMPLEMENT_INDEX_SETS: Record<OfficialEnvironmentTheme, readonly number[]> = {
  cyberpunk: [2, 3, 0, 7, 5, 4], // Yellow, Orange, Cyan, Coral-red
  tropical: [0, 1, 2, 4, 3, 9],  // Cyan, Coral-rose, Yellow, Mint
  sakura: [9, 5, 0, 2, 1, 4],    // Pink, Violet, Cyan, Gold
  cosmic: [5, 0, 2, 9, 4, 3],    // Violet, Cyan, Gold, Pink
};

const FLICK_HEX = '#fde047';
const SLIDE_HEX = '#2dd4bf';

const hexParseCache = new Map<string, RgbColor>();
const noteHexCache = new Map<string, string>();

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function normalizeThemeKey(theme: EnvironmentTheme): OfficialEnvironmentTheme {
  switch (theme) {
    case 'tropical':
    case 'ocean':
    case 'floating_paradise':
      return 'tropical';
    case 'sakura':
    case 'mountain':
    case 'editor_jade_sanctuary':
      return 'sakura';
    case 'cosmic':
    case 'crystal':
    case 'aurora_ice':
      return 'cosmic';
    default:
      return 'cyberpunk';
  }
}

export function hexToRgb(hex: string): RgbColor {
  const cached = hexParseCache.get(hex);
  if (cached) return cached;
  const clean = hex.replace('#', '').trim();
  let rgb: RgbColor = { r: 34, g: 211, b: 238 };
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    rgb = {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  } else if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    rgb = {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  if (hexParseCache.size < 512) {
    hexParseCache.set(hex, rgb);
  }
  return rgb;
}

export function rgbToHex(rgb: RgbColor): string {
  const r = Math.round(clamp(rgb.r, 0, 255)).toString(16).padStart(2, '0');
  const g = Math.round(clamp(rgb.g, 0, 255)).toString(16).padStart(2, '0');
  const b = Math.round(clamp(rgb.b, 0, 255)).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function rgbToCss(rgb: RgbColor, alpha = 1): string {
  const r = Math.round(clamp(rgb.r, 0, 255));
  const g = Math.round(clamp(rgb.g, 0, 255));
  const b = Math.round(clamp(rgb.b, 0, 255));
  if (alpha >= 0.999) return `rgb(${r},${g},${b})`;
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1).toFixed(3)})`;
}

export function hexWithAlpha(hex: string, alpha: number): string {
  return rgbToCss(hexToRgb(hex), alpha);
}

export function lerpRgb(a: RgbColor, b: RgbColor, t: number): RgbColor {
  const u = clamp(t, 0, 1);
  return {
    r: a.r + (b.r - a.r) * u,
    g: a.g + (b.g - a.g) * u,
    b: a.b + (b.b - a.b) * u,
  };
}

export function lerpHex(hexA: string, hexB: string, t: number): string {
  return rgbToHex(lerpRgb(hexToRgb(hexA), hexToRgb(hexB), t));
}

function rgbToHsl(rgb: RgbColor): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): RgbColor {
  const hh = ((h % 1) + 1) % 1;
  const ss = clamp(s, 0, 1);
  const ll = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh * 6) % 2) - 1));
  const m = ll - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  const sec = Math.floor(hh * 6);
  if (sec === 0) { r = c; g = x; }
  else if (sec === 1) { r = x; g = c; }
  else if (sec === 2) { g = c; b = x; }
  else if (sec === 3) { g = x; b = c; }
  else if (sec === 4) { r = x; b = c; }
  else { r = c; b = x; }

  return {
    r: (r + m) * 255,
    g: (g + m) * 255,
    b: (b + m) * 255,
  };
}

function stableHash(value: number): number {
  let hash = Math.imul(value ^ 0x45d9f3b, 0x45d9f3b);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x45d9f3b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * Computes relative sRGB luminance (0..1) to guard against unreadable dark notes.
 */
export function computeRelativeLuminance(rgb: RgbColor): number {
  const linearize = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

function ensureContrastFloorHex(hex: string): string {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);

  if (hsl.l < 0.54 || computeRelativeLuminance(rgb) < 0.24) {
    let lumBoost = Math.max(0.56, hsl.l);
    const sat = Math.max(0.72, hsl.s);
    let candidate = hslToRgb(hsl.h, sat, lumBoost);
    for (let step = 0; step < 5 && computeRelativeLuminance(candidate) < 0.24 && lumBoost < 0.76; step++) {
      lumBoost = Math.min(0.76, lumBoost + 0.05);
      candidate = hslToRgb(hsl.h, sat, lumBoost);
    }
    return rgbToHex(candidate);
  }
  if (hsl.l > 0.78) {
    return rgbToHex(hslToRgb(hsl.h, Math.max(0.68, hsl.s), 0.74));
  }
  return rgbToHex(rgb);
}

function getContrastRatioAgainstTrack(rgb: RgbColor): number {
  const trackLum = 0.012;
  const noteLum = computeRelativeLuminance(rgb);
  return (Math.max(noteLum, trackLum) + 0.05) / (Math.min(noteLum, trackLum) + 0.05);
}

export function resolveReadableTrackColors(palette: SongPalette): ReadableTrackColors {
  const tpHsl = rgbToHsl(hexToRgb(palette.primary));
  const trackPrimaryHex = rgbToHex(
    hslToRgb(tpHsl.h, clamp(tpHsl.s, 0.55, 0.95), clamp(tpHsl.l, 0.36, 0.56)),
  );

  const tsHsl = rgbToHsl(hexToRgb(palette.secondary));
  const trackSecondaryHex = rgbToHex(
    hslToRgb(tsHsl.h, clamp(tsHsl.s, 0.55, 0.95), clamp(tsHsl.l, 0.36, 0.56)),
  );

  const pRgb = hexToRgb(palette.primary);
  const pHsl = rgbToHsl(pRgb);
  let notePrimaryHex =
    (pHsl.h > 0.59 && pHsl.h < 0.72 && pHsl.l < 0.54) || pHsl.s < 0.35
      ? '#06d6f2'
      : rgbToHex(hslToRgb(pHsl.h, clamp(pHsl.s, 0.86, 1.0), clamp(pHsl.l, 0.5, 0.62)));
  if (getContrastRatioAgainstTrack(hexToRgb(notePrimaryHex)) < 5.0) {
    notePrimaryHex = '#06d6f2';
  }

  const sRgb = hexToRgb(palette.secondary);
  const sHsl = rgbToHsl(sRgb);
  let noteSecondaryHex =
    (sHsl.h > 0.59 && sHsl.h < 0.72 && sHsl.l < 0.54) || sHsl.s < 0.35
      ? '#f43f8e'
      : rgbToHex(hslToRgb(sHsl.h, clamp(sHsl.s, 0.86, 1.0), clamp(sHsl.l, 0.52, 0.63)));
  if (getContrastRatioAgainstTrack(hexToRgb(noteSecondaryHex)) < 4.8) {
    noteSecondaryHex = '#f43f8e';
  }

  const pFinal = rgbToHsl(hexToRgb(notePrimaryHex));
  const sFinal = rgbToHsl(hexToRgb(noteSecondaryHex));
  const rawHueDiff = Math.abs(pFinal.h - sFinal.h);
  const hueDist = Math.min(rawHueDiff, 1 - rawHueDiff);
  if (hueDist < 0.14) {
    const isWarm = pFinal.h > 0.78 || pFinal.h < 0.08;
    noteSecondaryHex = isWarm ? '#06d6f2' : '#f43f8e';
  }

  return {
    notePrimaryHex,
    noteSecondaryHex,
    noteAccentHex: '#fbbf24',
    trackPrimaryHex,
    trackSecondaryHex,
    trackAccentHex: palette.accent || '#6366f1',
  };
}

/**
 * Returns a deterministic, track-legible hex color for a note harmonized with song cover art
 * and current 2.5D illustrated scenario palette.
 */
export function resolveNoteColorHex(
  noteId: number,
  lane: number,
  kind: string,
  primaryHex: string,
  secondaryHex: string,
  accentHex: string,
  worldTheme: EnvironmentTheme = 'cyberpunk',
): string {
  const normTheme = normalizeThemeKey(worldTheme);
  const cacheKey = `${noteId}|${lane}|${kind}|${primaryHex}|${secondaryHex}|${accentHex}|${normTheme}`;
  const cached = noteHexCache.get(cacheKey);
  if (cached) return cached;

  let resolved: string;
  if (kind === 'flick') {
    resolved = ensureContrastFloorHex(lerpHex(FLICK_HEX, accentHex, 0.24));
  } else if (kind === 'slide') {
    resolved = ensureContrastFloorHex(lerpHex(SLIDE_HEX, primaryHex, 0.28));
  } else {
    const worldIndices = WORLD_COMPLEMENT_INDEX_SETS[normTheme] ?? WORLD_COMPLEMENT_INDEX_SETS.cyberpunk;
    const seed = stableHash(Math.imul(noteId + 1, 73856093) ^ Math.imul(lane + 1, 19349663));
    const pickSlot = seed % 9;

    if (pickSlot === 0) {
      resolved = ensureContrastFloorHex(primaryHex);
    } else if (pickSlot === 1) {
      resolved = ensureContrastFloorHex(secondaryHex);
    } else if (pickSlot === 2) {
      resolved = ensureContrastFloorHex(accentHex);
    } else {
      const swatchIdx = worldIndices[(seed >>> 3) % worldIndices.length];
      const swatch = HARMONIC_TILE_HEXES[swatchIdx];
      const songAnchor = pickSlot % 2 === 0 ? primaryHex : secondaryHex;
      resolved = ensureContrastFloorHex(lerpHex(swatch, songAnchor, 0.22));
    }
  }

  if (noteHexCache.size > 2048) {
    noteHexCache.clear();
  }
  noteHexCache.set(cacheKey, resolved);
  return resolved;
}
