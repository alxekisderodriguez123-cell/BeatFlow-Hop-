import type {
  EnvironmentTheme,
  MusicalSectionType,
  NoteKind,
  SongPalette,
} from '../types/game';
import { getEnvironmentDefinition } from '../game/environments/environmentDefinitions';

export interface ChromaticEngineInput {
  basePalette: SongPalette;
  worldTheme?: EnvironmentTheme;
  section: MusicalSectionType;
  energy: number;
  beatPulse: number;
  elapsed: number;
  bpm: number;
  dt: number;
  intensity: number;
  flashIntensity: number;
  reducedFlash: boolean;
  screenEffects: boolean;
  feverActive?: boolean;
  saturationScale?: number;
  brightnessScale?: number;
  emissionScale?: number;
  contrastFloor?: number;
}

export interface ChromaticState extends SongPalette {
  tertiary: string;
  complementary: string;
  feverPrimary: string;
  feverSecondary: string;
  noteSpecialColors: Record<NoteKind, string>;
  saturation: number;
  brightness: number;
  emission: number;
  glowIntensity: number;
  contrastRatio: number;
}

export interface ChromaticOverride {
  id: string;
  channel: 'global' | 'primary' | 'secondary' | 'accent' | 'ambient';
  color: string;
  weight: number; // 0..1
  emissionBoost: number;
  saturationScale: number;
  brightnessScale: number;
}

interface HSLColor {
  h: number;
  s: number;
  l: number;
}

interface RGBColor {
  r: number;
  g: number;
  b: number;
}

interface ChromaticStyle {
  hueShift: number;
  saturation: number;
  lightness: number;
  accentBoost: number;
}

const DEFAULT_PALETTE: SongPalette = {
  primary: '#22d3ee',
  secondary: '#e879f9',
  accent: '#6366f1',
};

const WORLD_ANCHOR_PALETTES: Record<
  EnvironmentTheme,
  SongPalette & { tertiary: string; complementary: string; feverPrimary: string; feverSecondary: string }
> = {
  cyberpunk: { primary: '#22d3ee', secondary: '#f43f8e', accent: '#f59e0b', tertiary: '#6366f1', complementary: '#fde047', feverPrimary: '#fbbf24', feverSecondary: '#ec4899' },
  tropical: { primary: '#22d3ee', secondary: '#fb7185', accent: '#fde047', tertiary: '#a855f7', complementary: '#34d399', feverPrimary: '#fde047', feverSecondary: '#fb7185' },
  ocean: { primary: '#22d3ee', secondary: '#38bdf8', accent: '#34d399', tertiary: '#1d4ed8', complementary: '#f472b6', feverPrimary: '#34d399', feverSecondary: '#38bdf8' },
  mountain: { primary: '#34d399', secondary: '#38bdf8', accent: '#c084fc', tertiary: '#6366f1', complementary: '#fde047', feverPrimary: '#34d399', feverSecondary: '#c084fc' },
  newyork: { primary: '#fbbf24', secondary: '#38bdf8', accent: '#fb7185', tertiary: '#818cf8', complementary: '#22d3ee', feverPrimary: '#fbbf24', feverSecondary: '#38bdf8' },
  cosmic: { primary: '#38bdf8', secondary: '#e879f9', accent: '#fbbf24', tertiary: '#7c3aed', complementary: '#34d399', feverPrimary: '#fbbf24', feverSecondary: '#e879f9' },
  nightclub: { primary: '#22d3ee', secondary: '#ec4899', accent: '#a855f7', tertiary: '#38bdf8', complementary: '#fde047', feverPrimary: '#ec4899', feverSecondary: '#22d3ee' },
  synthwave: { primary: '#f43f8e', secondary: '#22d3ee', accent: '#fde047', tertiary: '#a855f7', complementary: '#38bdf8', feverPrimary: '#fde047', feverSecondary: '#f43f8e' },
  reactor: { primary: '#f59e0b', secondary: '#22d3ee', accent: '#fb7185', tertiary: '#fb923c', complementary: '#38bdf8', feverPrimary: '#fbbf24', feverSecondary: '#22d3ee' },
  digital: { primary: '#22d3ee', secondary: '#a855f7', accent: '#34d399', tertiary: '#38bdf8', complementary: '#fb7185', feverPrimary: '#34d399', feverSecondary: '#a855f7' },
};

const SECTION_STYLES: Record<MusicalSectionType, ChromaticStyle> = {
  calm: { hueShift: -7, saturation: 0.78, lightness: 0.84, accentBoost: 0.82 },
  groove: { hueShift: 0, saturation: 1, lightness: 1, accentBoost: 1 },
  buildup: { hueShift: 12, saturation: 1.12, lightness: 1.06, accentBoost: 1.18 },
  drop: { hueShift: 22, saturation: 1.24, lightness: 1.14, accentBoost: 1.48 },
  chorus: { hueShift: 14, saturation: 1.18, lightness: 1.1, accentBoost: 1.32 },
  breakdown: { hueShift: -11, saturation: 0.76, lightness: 0.88, accentBoost: 0.76 },
  silence: { hueShift: -5, saturation: 0.5, lightness: 0.65, accentBoost: 0.48 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function parseHex(hex: string): RGBColor {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return { r: 34, g: 211, b: 238 };
  }
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

export function rgbToHex(color: RGBColor): string {
  const toHex = (value: number) =>
    Math.round(clamp(value, 0, 255))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function rgbToHsl(color: RGBColor): HSLColor {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
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
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s, l };
}

function hslToRgb(color: HSLColor): RGBColor {
  const h = ((color.h % 360) + 360) % 360;
  const s = clamp(color.s, 0, 1);
  const l = clamp(color.l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return {
    r: (r + m) * 255,
    g: (g + m) * 255,
    b: (b + m) * 255,
  };
}

function srgbRelativeLuminance(rgb: RGBColor): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

export function enforceHexContrast(hex: string, minLuminance = 0.22): string {
  const hsl = rgbToHsl(parseHex(hex));
  let l = hsl.l;
  const s = clamp(hsl.s, 0.32, 1);
  let out = hslToRgb({ h: hsl.h, s, l });
  for (let i = 0; i < 6 && srgbRelativeLuminance(out) < minLuminance && l < 0.78; i++) {
    l = Math.min(0.78, l + 0.06);
    out = hslToRgb({ h: hsl.h, s, l });
  }
  return rgbToHex(out);
}

export function computeComplementaryHex(hex: string, shiftDeg = 180): string {
  const hsl = rgbToHsl(parseHex(hex));
  return rgbToHex(hslToRgb({ h: (hsl.h + shiftDeg + 360) % 360, s: clamp(hsl.s, 0.45, 0.96), l: clamp(hsl.l, 0.45, 0.7) }));
}

function transformColor(
  hex: string,
  style: ChromaticStyle,
  energy: number,
  intensity: number,
  phase: number,
  satScale = 1,
  brightScale = 1,
): string {
  const hsl = rgbToHsl(parseHex(hex));
  const energySaturation = 1 + energy * 0.12;
  const energyLightness = 1 + energy * 0.07;

  const transformed: HSLColor = {
    h: (hsl.h + style.hueShift + phase + 360) % 360,
    s: clamp(hsl.s * style.saturation * energySaturation * satScale * (0.92 + intensity * 0.08), 0.24, 1),
    l: clamp(hsl.l * style.lightness * energyLightness * brightScale, 0.22, 0.78),
  };

  return rgbToHex(hslToRgb(transformed));
}

export function blendHex(from: string, to: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  const t = clamp(amount, 0, 1);
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

function stableHash(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Chromatic Engine 2.0:
 * - Deterministic per-object/note hues (never random per frame).
 * - Full scenario + song palette harmony with tertiary, complementary, and Fever palettes.
 * - Supports explicit trigger color overrides without mutating underlying object definitions.
 */
export class ChromaticEngine {
  private currentState: ChromaticState | null = null;
  private lastBasePalette = '';
  private overrides = new Map<string, ChromaticOverride>();

  public reset(): void {
    this.currentState = null;
    this.lastBasePalette = '';
    this.overrides.clear();
  }

  public setOverride(override: ChromaticOverride): void {
    this.overrides.set(override.id, override);
  }

  public removeOverride(id: string): void {
    this.overrides.delete(id);
  }

  public clearOverrides(): void {
    this.overrides.clear();
  }

  public getDeterministicColor(objectKey: string, palette?: SongPalette): string {
    const state = this.currentState;
    const primary = palette?.primary ?? state?.primary ?? DEFAULT_PALETTE.primary;
    const secondary = palette?.secondary ?? state?.secondary ?? DEFAULT_PALETTE.secondary;
    const accent = palette?.accent ?? state?.accent ?? DEFAULT_PALETTE.accent;
    const tertiary = state?.tertiary ?? computeComplementaryHex(primary, 120);

    const h = stableHash(objectKey);
    const pool = [primary, secondary, accent, tertiary];
    const base = pool[h % pool.length];
    const hsl = rgbToHsl(parseHex(base));
    const jitterDeg = ((h >>> 4) % 15) - 7;
    return rgbToHex(
      hslToRgb({
        h: (hsl.h + jitterDeg + 360) % 360,
        s: clamp(hsl.s, 0.55, 1),
        l: clamp(hsl.l, 0.48, 0.72),
      }),
    );
  }

  public getCurrentState(): ChromaticState | null {
    return this.currentState ? { ...this.currentState } : null;
  }

  public updateExtended(input: ChromaticEngineInput): ChromaticState {
    const base = input.basePalette ?? DEFAULT_PALETTE;
    const baseKey = [base.primary, base.secondary, base.accent, input.worldTheme ?? 'cyberpunk'].join('|');

    const worldAnchor = input.worldTheme
      ? WORLD_ANCHOR_PALETTES[input.worldTheme]
      : WORLD_ANCHOR_PALETTES.cyberpunk;
    const envDef = input.worldTheme ? getEnvironmentDefinition(input.worldTheme) : null;

    if (baseKey !== this.lastBasePalette) {
      this.lastBasePalette = baseKey;
      if (!this.currentState) {
        this.currentState = {
          primary: base.primary,
          secondary: base.secondary,
          accent: base.accent,
          tertiary: worldAnchor.tertiary,
          complementary: worldAnchor.complementary,
          feverPrimary: worldAnchor.feverPrimary,
          feverSecondary: worldAnchor.feverSecondary,
          noteSpecialColors: {
            tap: base.primary,
            hold: base.secondary,
            flick: '#fde047',
            slide: '#2dd4bf',
          },
          saturation: 1,
          brightness: 1,
          emission: 1,
          glowIntensity: input.intensity,
          contrastRatio: 1,
        };
      }
    }

    const energy = clamp(input.energy, 0, 1);
    const intensity = clamp(input.intensity, 0.35, 1.5);
    const beatPulse = clamp(input.beatPulse, 0, 1.5);
    const satScale = clamp(input.saturationScale ?? 1, 0.3, 1.8);
    const brightScale = clamp(input.brightnessScale ?? 1, 0.4, 1.6);
    const contrastFloor = clamp(input.contrastFloor ?? 0.22, 0.14, 0.36);

    const style = SECTION_STYLES[input.section] ?? SECTION_STYLES.groove;
    const bpmFactor = clamp(input.bpm / 120, 0.65, 1.65);
    const phase = Math.sin(input.elapsed * 0.22 * bpmFactor) * 3.2;

    let primary = transformColor(base.primary, style, energy, intensity, phase, satScale, brightScale);
    let secondary = transformColor(base.secondary, style, energy, intensity, phase * -0.7, satScale, brightScale);
    let accent = transformColor(
      base.accent,
      { ...style, saturation: style.saturation * style.accentBoost, lightness: style.lightness * 1.04 },
      energy,
      intensity,
      phase * 1.3,
      satScale,
      brightScale,
    );

    primary = blendHex(primary, worldAnchor.primary, 0.18);
    secondary = blendHex(secondary, worldAnchor.secondary, 0.18);
    accent = blendHex(accent, worldAnchor.accent, 0.22);

    let tertiary = blendHex(computeComplementaryHex(primary, 115), worldAnchor.tertiary, 0.35);
    let complementary = blendHex(computeComplementaryHex(primary, 180), worldAnchor.complementary, 0.3);

    // Fever Mode palette blend
    if (input.feverActive) {
      primary = blendHex(primary, worldAnchor.feverPrimary, 0.45);
      secondary = blendHex(secondary, worldAnchor.feverSecondary, 0.45);
      accent = blendHex(accent, '#fde047', 0.35);
    }

    // Apply explicit Color / Pulse Trigger overrides cleanly
    let extraEmission = input.emissionScale ?? 1;
    let extraSat = satScale;
    let extraBright = brightScale;

    for (const ov of this.overrides.values()) {
      const w = clamp(ov.weight, 0, 1);
      if (w <= 0.001) continue;
      if (ov.channel === 'global' || ov.channel === 'primary') primary = blendHex(primary, ov.color, w);
      if (ov.channel === 'global' || ov.channel === 'secondary') secondary = blendHex(secondary, ov.color, w);
      if (ov.channel === 'global' || ov.channel === 'accent') accent = blendHex(accent, ov.color, w);
      if (ov.channel === 'ambient') tertiary = blendHex(tertiary, ov.color, w);
      extraEmission *= 1 + (ov.emissionBoost - 1) * w;
      extraSat *= 1 + (ov.saturationScale - 1) * w;
      extraBright *= 1 + (ov.brightnessScale - 1) * w;
    }

    if (input.screenEffects && beatPulse > 0.2) {
      const flashLimit = input.reducedFlash ? 0.035 : 0.16;
      const flash = clamp(
        beatPulse * input.flashIntensity * (input.reducedFlash ? 0.025 : 0.12),
        0,
        flashLimit,
      );
      accent = blendHex(accent, '#ffffff', flash);
    }

    primary = enforceHexContrast(primary, contrastFloor);
    secondary = enforceHexContrast(secondary, contrastFloor);
    accent = enforceHexContrast(accent, contrastFloor);
    tertiary = enforceHexContrast(tertiary, contrastFloor * 0.9);
    complementary = enforceHexContrast(complementary, contrastFloor);

    const target: ChromaticState = {
      primary,
      secondary,
      accent,
      tertiary,
      complementary,
      feverPrimary: worldAnchor.feverPrimary,
      feverSecondary: worldAnchor.feverSecondary,
      noteSpecialColors: {
        tap: primary,
        hold: secondary,
        flick: enforceHexContrast(blendHex('#fde047', accent, 0.22), 0.3),
        slide: enforceHexContrast(blendHex('#2dd4bf', primary, 0.25), 0.28),
      },
      saturation: extraSat,
      brightness: extraBright,
      emission: clamp(extraEmission * (0.85 + energy * 0.35), 0.3, 2.2),
      glowIntensity: clamp(intensity * (envDef?.lightingProfile.bloomIntensity ?? 0.45) * 2.1, 0.3, 2.0),
      contrastRatio: Number((srgbRelativeLuminance(parseHex(primary)) / 0.04).toFixed(2)),
    };

    if (!this.currentState) {
      this.currentState = target;
      return { ...target };
    }

    const transitionSpeed = input.section === 'drop' ? 6.0 : input.section === 'buildup' ? 4.8 : 3.4;
    const smoothing = 1 - Math.exp(-transitionSpeed * clamp(input.dt, 0, 0.05));

    this.currentState = {
      primary: blendHex(this.currentState.primary, target.primary, smoothing),
      secondary: blendHex(this.currentState.secondary, target.secondary, smoothing),
      accent: blendHex(this.currentState.accent, target.accent, smoothing),
      tertiary: blendHex(this.currentState.tertiary, target.tertiary, smoothing),
      complementary: blendHex(this.currentState.complementary, target.complementary, smoothing),
      feverPrimary: target.feverPrimary,
      feverSecondary: target.feverSecondary,
      noteSpecialColors: target.noteSpecialColors,
      saturation: this.currentState.saturation + (target.saturation - this.currentState.saturation) * smoothing,
      brightness: this.currentState.brightness + (target.brightness - this.currentState.brightness) * smoothing,
      emission: this.currentState.emission + (target.emission - this.currentState.emission) * smoothing,
      glowIntensity: this.currentState.glowIntensity + (target.glowIntensity - this.currentState.glowIntensity) * smoothing,
      contrastRatio: target.contrastRatio,
    };

    return { ...this.currentState };
  }

  public update(input: ChromaticEngineInput): SongPalette {
    const ext = this.updateExtended(input);
    return {
      primary: ext.primary,
      secondary: ext.secondary,
      accent: ext.accent,
    };
  }
}
