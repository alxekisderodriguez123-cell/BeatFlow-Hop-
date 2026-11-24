import * as THREE from 'three';
import type { EnvironmentTheme } from '../types/game';

/**
 * Curated luminous rhythm-tile swatches inspired by vibrant illustrated rhythm games
 * (golden yellow, tangerine orange, electric cyan, coral red, mint turquoise, neon violet).
 * Every swatch is tuned for instant legibility over dark twilight/cyberpunk runways.
 */
const HARMONIC_TILE_SWATCHES = [
  new THREE.Color('#22d3ee'), // Electric cyan
  new THREE.Color('#fb7185'), // Coral rose
  new THREE.Color('#fde047'), // Luminous yellow
  new THREE.Color('#fb923c'), // Tangerine orange
  new THREE.Color('#2dd4bf'), // Turquoise mint
  new THREE.Color('#c084fc'), // Bright neon violet
  new THREE.Color('#38bdf8'), // Sky azure
  new THREE.Color('#f43f5e'), // Crimson coral
  new THREE.Color('#a3e635'), // Lime neon
  new THREE.Color('#f472b6'), // Radiant pink
];

const WORLD_COMPLEMENT_INDEX_SETS: Record<EnvironmentTheme, number[]> = {
  cyberpunk: [2, 3, 0, 7, 5, 4], // Yellow, Orange, Cyan, Coral-red (Reference 2)
  tropical: [0, 1, 2, 4, 3, 9],  // Cyan, Coral-rose, Yellow, Mint (Reference 1)
  ocean: [0, 4, 2, 6, 1, 5],
  mountain: [4, 0, 5, 2, 1, 6],
  newyork: [2, 0, 3, 1, 6, 5],
  cosmic: [5, 0, 2, 9, 4, 3],
  nightclub: [0, 9, 5, 2, 4, 7],
  synthwave: [9, 0, 2, 3, 5, 1],
  reactor: [3, 0, 2, 7, 4, 6],
  digital: [0, 5, 4, 2, 6, 9],
};

const FLICK_COLOR = new THREE.Color('#fde047');
const SLIDE_COLOR = new THREE.Color('#2dd4bf');

// Pre-allocated cache slots to ensure zero allocations per frame & safe contrast enforcement
const _tmpHsl = { h: 0, s: 0, l: 0 };
const _cachePool: THREE.Color[] = Array.from({ length: 64 }, () => new THREE.Color());

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
export function computeRelativeLuminance(color: THREE.Color): number {
  const linearize = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * linearize(color.r) + 0.7152 * linearize(color.g) + 0.0722 * linearize(color.b);
}

/**
 * Guarantees every note has crisp readability (minimum luminance & vibrant saturation)
 * against dark twilight/neon track lanes.
 */
function ensureContrastFloor(color: THREE.Color, targetOut: THREE.Color): THREE.Color {
  targetOut.copy(color);
  targetOut.getHSL(_tmpHsl);

  if (_tmpHsl.l < 0.54 || computeRelativeLuminance(targetOut) < 0.24) {
    let lumBoost = Math.max(0.56, _tmpHsl.l);
    const sat = Math.max(0.72, _tmpHsl.s);
    targetOut.setHSL(_tmpHsl.h, sat, lumBoost);
    for (let step = 0; step < 5 && computeRelativeLuminance(targetOut) < 0.24 && lumBoost < 0.76; step++) {
      lumBoost = Math.min(0.76, lumBoost + 0.05);
      targetOut.setHSL(_tmpHsl.h, sat, lumBoost);
    }
  } else if (_tmpHsl.l > 0.78) {
    targetOut.setHSL(_tmpHsl.h, Math.max(0.68, _tmpHsl.s), 0.74);
  }
  return targetOut;
}

/**
 * Returns a deterministic, track-legible color for a note harmonized with song cover art
 * and current 3D world palette.
 *
 * The same (noteId, lane, kind, worldTheme) always resolves identically so notes never flicker mid-flight.
 */
export function resolveNoteColor(
  noteId: number,
  lane: number,
  kind: string,
  primary: THREE.Color,
  secondary: THREE.Color,
  accent: THREE.Color,
  worldTheme: EnvironmentTheme = 'cyberpunk',
): THREE.Color {
  const slot = Math.abs(noteId + lane * 7) % _cachePool.length;
  const out = _cachePool[slot];

  if (kind === 'flick') {
    out.copy(FLICK_COLOR).lerp(accent, 0.24);
    return ensureContrastFloor(out, out);
  }

  if (kind === 'slide') {
    out.copy(SLIDE_COLOR).lerp(primary, 0.28);
    return ensureContrastFloor(out, out);
  }

  const worldIndices = WORLD_COMPLEMENT_INDEX_SETS[worldTheme] ?? WORLD_COMPLEMENT_INDEX_SETS.cyberpunk;
  const seed = stableHash(Math.imul(noteId + 1, 73856093) ^ Math.imul(lane + 1, 19349663));
  const pickSlot = seed % 9;

  if (pickSlot === 0) {
    return ensureContrastFloor(primary, out);
  }
  if (pickSlot === 1) {
    return ensureContrastFloor(secondary, out);
  }
  if (pickSlot === 2) {
    return ensureContrastFloor(accent, out);
  }

  const swatchIdx = worldIndices[(seed >>> 3) % worldIndices.length];
  const swatch = HARMONIC_TILE_SWATCHES[swatchIdx];
  const songAnchor = pickSlot % 2 === 0 ? primary : secondary;
  // Blend swatch strongly (78%) with a gentle (22%) song-cover tint so every note pops crisply
  out.copy(swatch).lerp(songAnchor, 0.22);
  return ensureContrastFloor(out, out);
}
