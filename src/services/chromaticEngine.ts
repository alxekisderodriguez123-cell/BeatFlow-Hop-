
import type {
  MusicalSectionType,
  SongPalette,
} from '../types/game';

export interface ChromaticEngineInput {
  basePalette: SongPalette;
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

const SECTION_STYLES: Record<
  MusicalSectionType,
  ChromaticStyle
> = {
  calm: {
    hueShift: -7,
    saturation: 0.78,
    lightness: 0.82,
    accentBoost: 0.82,
  },
  groove: {
    hueShift: 0,
    saturation: 1,
    lightness: 1,
    accentBoost: 1,
  },
  buildup: {
    hueShift: 12,
    saturation: 1.12,
    lightness: 1.06,
    accentBoost: 1.18,
  },
  drop: {
    hueShift: 25,
    saturation: 1.28,
    lightness: 1.18,
    accentBoost: 1.55,
  },
  chorus: {
    hueShift: 15,
    saturation: 1.2,
    lightness: 1.12,
    accentBoost: 1.35,
  },
  breakdown: {
    hueShift: -12,
    saturation: 0.74,
    lightness: 0.88,
    accentBoost: 0.75,
  },
  silence: {
    hueShift: -5,
    saturation: 0.48,
    lightness: 0.62,
    accentBoost: 0.45,
  },
};

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.max(min, Math.min(max, value));
}

function parseHex(hex: string): RGBColor {
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

function rgbToHex(color: RGBColor): string {
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

    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }

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

function transformColor(
  hex: string,
  style: ChromaticStyle,
  energy: number,
  intensity: number,
  phase: number,
): string {
  const hsl = rgbToHsl(parseHex(hex));

  const energySaturation = 1 + energy * 0.12;
  const energyLightness = 1 + energy * 0.07;

  const transformed: HSLColor = {
    h: (hsl.h + style.hueShift + phase + 360) % 360,
    s: clamp(
      hsl.s *
        style.saturation *
        energySaturation *
        (0.92 + intensity * 0.08),
      0.28,
      1,
    ),
    l: clamp(
      hsl.l *
        style.lightness *
        energyLightness,
      0.24,
      0.76,
    ),
  };

  return rgbToHex(hslToRgb(transformed));
}

function blendHex(
  from: string,
  to: string,
  amount: number,
): string {
  const a = parseHex(from);
  const b = parseHex(to);
  const t = clamp(amount, 0, 1);

  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

export class ChromaticEngine {
  private currentPalette: SongPalette | null = null;
  private lastBasePalette = '';

  public reset(): void {
    this.currentPalette = null;
    this.lastBasePalette = '';
  }

  public update(input: ChromaticEngineInput): SongPalette {
    const base = input.basePalette ?? DEFAULT_PALETTE;

    const baseKey = [
      base.primary,
      base.secondary,
      base.accent,
    ].join('|');

    if (baseKey !== this.lastBasePalette) {
      this.lastBasePalette = baseKey;

      // New song: start from its real identity colors.
      if (!this.currentPalette) {
        this.currentPalette = { ...base };
      }
    }

    const energy = clamp(input.energy, 0, 1);
    const intensity = clamp(input.intensity, 0.35, 1.5);
    const beatPulse = clamp(input.beatPulse, 0, 1.5);

    const style =
      SECTION_STYLES[input.section] ??
      SECTION_STYLES.groove;

    // Small organic hue movement, not an unrelated color carousel.
    const bpmFactor = clamp(input.bpm / 120, 0.65, 1.65);
    const phase =
      Math.sin(input.elapsed * 0.22 * bpmFactor) * 3.2;

    const primary = transformColor(
      base.primary,
      style,
      energy,
      intensity,
      phase,
    );

    const secondary = transformColor(
      base.secondary,
      style,
      energy,
      intensity,
      phase * -0.7,
    );

    let accent = transformColor(
      base.accent,
      {
        ...style,
        saturation: style.saturation * style.accentBoost,
        lightness: style.lightness * 1.04,
      },
      energy,
      intensity,
      phase * 1.3,
    );

    // Musical impacts add a controlled accent highlight.
    // Reduced-flash mode keeps the response much softer.
    if (input.screenEffects && beatPulse > 0.2) {
      const flashLimit = input.reducedFlash ? 0.035 : 0.16;
      const flash = clamp(
        beatPulse *
          input.flashIntensity *
          (input.reducedFlash ? 0.025 : 0.12),
        0,
        flashLimit,
      );

      accent = blendHex(accent, '#ffffff', flash);
    }

    const target: SongPalette = {
      primary,
      secondary,
      accent,
    };

    if (!this.currentPalette) {
      this.currentPalette = target;
      return { ...target };
    }

    // Smooth transitions; drops react faster than calm sections.
    const transitionSpeed =
      input.section === 'drop'
        ? 5.8
        : input.section === 'buildup'
          ? 4.8
          : 3.4;

    const smoothing =
      1 - Math.exp(-transitionSpeed * clamp(input.dt, 0, 0.05));

    this.currentPalette = {
      primary: blendHex(
        this.currentPalette.primary,
        target.primary,
        smoothing,
      ),
      secondary: blendHex(
        this.currentPalette.secondary,
        target.secondary,
        smoothing,
      ),
      accent: blendHex(
        this.currentPalette.accent,
        target.accent,
        smoothing,
      ),
    };

    return { ...this.currentPalette };
  }
}
