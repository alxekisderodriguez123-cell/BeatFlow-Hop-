import type {
  BackgroundLibraryCategory,
  EnvironmentTheme,
  OfficialEnvironmentTheme,
  QualityLevel,
  SongPalette,
} from '../../types/game';
import { resolveSafeEnvironmentTheme } from './environmentSelector';

export interface EnvironmentColorPalette extends SongPalette {
  tertiary: string;
  complementary: string;
  skyTop: string;
  skyHorizon: string;
  feverPrimary: string;
  feverSecondary: string;
}

export interface EnvironmentDefinition {
  environmentId: OfficialEnvironmentTheme;
  category: BackgroundLibraryCategory;
  displayName: string;
  description: string;
  backgroundLayers: string[];
  foregroundLayers: string[];
  parallaxSettings: {
    skyFactor: number;
    midgroundFactor: number;
    foregroundFactor: number;
  };
  colorPalette: EnvironmentColorPalette;
  lightingProfile: {
    ambientIntensity: number;
    keyLightIntensity: number;
    bloomIntensity: number;
    exposure: number;
    fogDensity: number;
  };
  particleProfile: {
    kind: string;
    densityScale: number;
    driftSpeed: number;
  };
  animationProfile: {
    tempoCoupling: number;
    horizonPulseStrength: number;
    cameraSwayScale: number;
  };
  cameraSettings: {
    previewPos: [number, number, number];
    previewLookAt: [number, number, number];
    baseFov: number;
  };
  qualitySettings: {
    recommendedQuality: QualityLevel;
    gpuCostLabel: 'Ligero' | 'Medio' | 'Alto';
    supportsLowEndMobile: boolean;
  };
  ambientEffectsSummary: string;
}

const CORE_DEFINITIONS: Record<OfficialEnvironmentTheme, EnvironmentDefinition> = {
  tropical: {
    environmentId: 'tropical',
    category: 'vanilla',
    displayName: 'Atardecer Tropical',
    description:
      'Cielo crepuscular naranja-violeta, sol dorado resplandeciente sobre el mar, palmeras estilizadas mecidas por la brisa y pista luminosa.',
    backgroundLayers: [
      'Cielo ilustrado violeta-rosa-dorado',
      'Disco solar cálido con halo atmosférico',
      'Nubes estilizadas y horizonte oceánico',
    ],
    foregroundLayers: [
      'Palmeras tropicales en silueta reactiva',
      'Reflejos dorados y espuma en la orilla',
      'Chispas solares ascendentes',
    ],
    parallaxSettings: { skyFactor: 0.08, midgroundFactor: 0.3, foregroundFactor: 0.85 },
    colorPalette: {
      primary: '#22d3ee',
      secondary: '#fb7185',
      accent: '#fde047',
      tertiary: '#a855f7',
      complementary: '#fb923c',
      skyTop: '#241452',
      skyHorizon: '#ff9a52',
      feverPrimary: '#fde047',
      feverSecondary: '#fb7185',
    },
    lightingProfile: {
      ambientIntensity: 0.65,
      keyLightIntensity: 1.0,
      bloomIntensity: 0.42,
      exposure: 1.0,
      fogDensity: 0.004,
    },
    particleProfile: { kind: 'Destellos solares y brisa marina', densityScale: 1.0, driftSpeed: 0.9 },
    animationProfile: { tempoCoupling: 0.9, horizonPulseStrength: 0.8, cameraSwayScale: 0.92 },
    cameraSettings: { previewPos: [0, 3.25, 6.6], previewLookAt: [0, 1.85, -24], baseFov: 60 },
    qualitySettings: { recommendedQuality: 'high', gpuCostLabel: 'Ligero', supportsLowEndMobile: true },
    ambientEffectsSummary: 'Sol vibrante al ritmo, reflejos marinos y palmeras con balanceo suave',
  },
  cyberpunk: {
    environmentId: 'cyberpunk',
    category: 'vanilla',
    displayName: 'Ciudad Cyber Neón',
    description:
      'Metrópolis futurista ilustrada bajo un cielo estrellado, luna con aurora orbital, puente iluminado, tráfico aéreo y rascacielos reactivos.',
    backgroundLayers: [
      'Cielo nocturno estrellado con aurora cian-magenta',
      'Luna luminosa con anillo orbital',
      'Horizonte urbano multicapa y puente colgante',
    ],
    foregroundLayers: [
      'Ventanas rítmicas y carteles holográficos',
      'Vehículos voladores con estelas de luz',
      'Reflejos líquidos sobre el río urbano',
    ],
    parallaxSettings: { skyFactor: 0.12, midgroundFactor: 0.36, foregroundFactor: 0.88 },
    colorPalette: {
      primary: '#22d3ee',
      secondary: '#f43f8e',
      accent: '#f59e0b',
      tertiary: '#6366f1',
      complementary: '#fde047',
      skyTop: '#0b0826',
      skyHorizon: '#31125e',
      feverPrimary: '#fbbf24',
      feverSecondary: '#ec4899',
    },
    lightingProfile: {
      ambientIntensity: 0.58,
      keyLightIntensity: 1.0,
      bloomIntensity: 0.45,
      exposure: 0.96,
      fogDensity: 0.005,
    },
    particleProfile: { kind: 'Estrellas y chispas neón', densityScale: 1.0, driftSpeed: 1.2 },
    animationProfile: { tempoCoupling: 1.0, horizonPulseStrength: 0.88, cameraSwayScale: 1.0 },
    cameraSettings: { previewPos: [0, 3.3, 6.8], previewLookAt: [0, 2.0, -24], baseFov: 60 },
    qualitySettings: { recommendedQuality: 'high', gpuCostLabel: 'Ligero', supportsLowEndMobile: true },
    ambientEffectsSummary: 'Skyline neón multicapa, vehículos voladores y reflejos reactivos al bajo',
  },
  sakura: {
    environmentId: 'sakura',
    category: 'vanilla',
    displayName: 'Santuario Sakura',
    description:
      'Paisaje japonés ilustrado con cielo rosa lavanda, Monte Fuji nevado, pagoda tradicional, arco Torii carmesí y pétalos de cerezo flotando.',
    backgroundLayers: [
      'Cielo rosa pastel con luna luminosa',
      'Monte Fuji nevado entre nubes suaves',
      'Pagoda tradicional y puente de madera',
    ],
    foregroundLayers: [
      'Arco Torii carmesí enmarcando la pista',
      'Copas floridas de cerezo en primer plano',
      'Lago espejo rosa-índigo y lluvia de pétalos',
    ],
    parallaxSettings: { skyFactor: 0.09, midgroundFactor: 0.3, foregroundFactor: 0.84 },
    colorPalette: {
      primary: '#f472b6',
      secondary: '#c084fc',
      accent: '#fde68a',
      tertiary: '#fb7185',
      complementary: '#67e8f9',
      skyTop: '#2d154d',
      skyHorizon: '#f9a8d4',
      feverPrimary: '#fda4af',
      feverSecondary: '#c084fc',
    },
    lightingProfile: {
      ambientIntensity: 0.66,
      keyLightIntensity: 1.0,
      bloomIntensity: 0.38,
      exposure: 0.98,
      fogDensity: 0.004,
    },
    particleProfile: { kind: 'Pétalos de cerezo y destellos cálidos', densityScale: 1.0, driftSpeed: 0.8 },
    animationProfile: { tempoCoupling: 0.88, horizonPulseStrength: 0.74, cameraSwayScale: 0.88 },
    cameraSettings: { previewPos: [0, 3.25, 6.6], previewLookAt: [0, 1.9, -24], baseFov: 60 },
    qualitySettings: { recommendedQuality: 'high', gpuCostLabel: 'Ligero', supportsLowEndMobile: true },
    ambientEffectsSummary: 'Arco Torii, Monte Fuji y pétalos mecidos en 2.5D con reflejo lacustre',
  },
  cosmic: {
    environmentId: 'cosmic',
    category: 'vanilla',
    displayName: 'Nebulosa Cósmica',
    description:
      'Espacio profundo ilustrado con nubes de nebulosa púrpura-cián, gran planeta anillado, lunas flotantes, asteroides en órbita y polvo estelar.',
    backgroundLayers: [
      'Cielo cósmico estrellado de alto contraste',
      'Nubes de nebulosa púrpura, índigo y cian',
      'Gran planeta anillado y lunas orbitales',
    ],
    foregroundLayers: [
      'Asteroides facetados flotando en paralelo',
      'Destellos estelares de cuatro puntas',
      'Horizonte de energía galáctica',
    ],
    parallaxSettings: { skyFactor: 0.14, midgroundFactor: 0.38, foregroundFactor: 0.88 },
    colorPalette: {
      primary: '#38bdf8',
      secondary: '#e879f9',
      accent: '#fbbf24',
      tertiary: '#7c3aed',
      complementary: '#34d399',
      skyTop: '#06061b',
      skyHorizon: '#2f1669',
      feverPrimary: '#fbbf24',
      feverSecondary: '#e879f9',
    },
    lightingProfile: {
      ambientIntensity: 0.58,
      keyLightIntensity: 1.0,
      bloomIntensity: 0.44,
      exposure: 0.96,
      fogDensity: 0.005,
    },
    particleProfile: { kind: 'Estrellas de 4 puntas y polvo nebular', densityScale: 1.05, driftSpeed: 1.05 },
    animationProfile: { tempoCoupling: 0.96, horizonPulseStrength: 0.84, cameraSwayScale: 0.96 },
    cameraSettings: { previewPos: [0, 3.3, 6.8], previewLookAt: [0, 2.0, -24], baseFov: 60 },
    qualitySettings: { recommendedQuality: 'high', gpuCostLabel: 'Ligero', supportsLowEndMobile: true },
    ambientEffectsSummary: 'Planeta anillado gigante, asteroides flotantes y nebulosa viva',
  },
};

export const ENVIRONMENT_DEFINITIONS: Record<EnvironmentTheme, EnvironmentDefinition> = {
  tropical: CORE_DEFINITIONS.tropical,
  ocean: CORE_DEFINITIONS.tropical,
  floating_paradise: CORE_DEFINITIONS.tropical,
  cyberpunk: CORE_DEFINITIONS.cyberpunk,
  newyork: CORE_DEFINITIONS.cyberpunk,
  nightclub: CORE_DEFINITIONS.cyberpunk,
  synthwave: CORE_DEFINITIONS.cyberpunk,
  reactor: CORE_DEFINITIONS.cyberpunk,
  digital: CORE_DEFINITIONS.cyberpunk,
  editor_prism_matrix: CORE_DEFINITIONS.cyberpunk,
  editor_crimson_eclipse: CORE_DEFINITIONS.cyberpunk,
  sakura: CORE_DEFINITIONS.sakura,
  mountain: CORE_DEFINITIONS.sakura,
  editor_jade_sanctuary: CORE_DEFINITIONS.sakura,
  cosmic: CORE_DEFINITIONS.cosmic,
  crystal: CORE_DEFINITIONS.cosmic,
  aurora_ice: CORE_DEFINITIONS.cosmic,
};

export function getEnvironmentDefinition(theme: EnvironmentTheme): EnvironmentDefinition {
  return CORE_DEFINITIONS[resolveSafeEnvironmentTheme(theme)];
}

const thumbnailCache = new Map<OfficialEnvironmentTheme, string>();

/**
 * Generates and caches a crisp 320x180 2D illustrated thumbnail for any scenario.
 * Used across the Environment Preview selector and Creator Background Library.
 */
export function renderEnvironmentThumbnailDataUrl(theme: EnvironmentTheme): string {
  const safeTheme = resolveSafeEnvironmentTheme(theme);
  const existing = thumbnailCache.get(safeTheme);
  if (existing) return existing;

  const def = CORE_DEFINITIONS[safeTheme];
  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const { primary, secondary, accent, skyTop, skyHorizon } = def.colorPalette;
  const cx = 160;

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, 118);
  sky.addColorStop(0, skyTop);
  sky.addColorStop(0.68, skyHorizon);
  sky.addColorStop(1, safeTheme === 'tropical' ? '#fde047' : secondary + '99');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 320, 180);

  if (safeTheme === 'tropical') {
    // Sunset glow + sun disc
    const sunHalo = ctx.createRadialGradient(cx, 102, 8, cx, 102, 74);
    sunHalo.addColorStop(0, 'rgba(255, 248, 210, 0.96)');
    sunHalo.addColorStop(0.35, 'rgba(253, 224, 71, 0.65)');
    sunHalo.addColorStop(0.75, 'rgba(251, 113, 133, 0.25)');
    sunHalo.addColorStop(1, 'rgba(251, 113, 133, 0)');
    ctx.fillStyle = sunHalo;
    ctx.fillRect(cx - 76, 26, 152, 110);

    ctx.fillStyle = '#fff7d6';
    ctx.beginPath();
    ctx.arc(cx, 106, 30, Math.PI, 0);
    ctx.fill();

    // Soft clouds
    ctx.fillStyle = 'rgba(255, 195, 175, 0.35)';
    ctx.beginPath();
    ctx.ellipse(54, 34, 42, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(268, 42, 46, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ocean band & reflections
    const sea = ctx.createLinearGradient(0, 106, 0, 180);
    sea.addColorStop(0, '#3e1e6b');
    sea.addColorStop(1, '#120a2c');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 106, 320, 74);

    // Palm silhouettes left & right
    ctx.strokeStyle = '#1c1038';
    ctx.fillStyle = '#1c1038';
    const drawMiniPalm = (bx: number, by: number, lean: number, scale: number) => {
      ctx.lineWidth = 4 * scale;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      const tx = bx + lean * scale;
      const ty = by - 58 * scale;
      ctx.quadraticCurveTo(bx + lean * 0.35 * scale, by - 30 * scale, tx, ty);
      ctx.stroke();
      for (let a = 0; a < 6; a++) {
        const ang = -Math.PI + (a / 5) * Math.PI * 1.1 - 0.15;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(
          tx + Math.cos(ang) * 18 * scale,
          ty + Math.sin(ang) * 12 * scale - 6 * scale,
          tx + Math.cos(ang) * 28 * scale,
          ty + Math.sin(ang) * 18 * scale + 5 * scale,
        );
        ctx.lineWidth = 2.4 * scale;
        ctx.stroke();
      }
    };
    drawMiniPalm(42, 126, 16, 1.0);
    drawMiniPalm(74, 118, 12, 0.72);
    drawMiniPalm(278, 126, -16, 1.0);
    drawMiniPalm(246, 118, -12, 0.72);
  } else if (safeTheme === 'cyberpunk') {
    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 24; i++) {
      const sx = ((i * 73) % 310) + 5;
      const sy = ((i * 37) % 68) + 6;
      ctx.fillRect(sx, sy, 1.4, 1.4);
    }

    // Moon + orbital ring
    ctx.fillStyle = 'rgba(235, 245, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(218, 36, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = primary;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(218, 36, 30, 8, -0.35, 0, Math.PI * 2);
    ctx.stroke();

    // Suspension bridge silhouette
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(78, 92);
    ctx.quadraticCurveTo(160, 108, 242, 92);
    ctx.stroke();

    // Skyline buildings
    const towers = [
      [8, 38, 26], [38, 24, 24], [66, 52, 22], [92, 68, 18],
      [212, 66, 18], [234, 46, 22], [260, 26, 26], [290, 42, 24],
    ];
    towers.forEach(([bx, by, bw], idx) => {
      ctx.fillStyle = '#0e0a2a';
      ctx.fillRect(bx, by, bw, 118 - by);
      ctx.strokeStyle = idx % 2 === 0 ? primary : secondary;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, 118 - by);
      ctx.fillStyle = idx % 2 === 0 ? primary + 'aa' : secondary + 'aa';
      for (let wy = by + 6; wy < 108; wy += 8) {
        ctx.fillRect(bx + 4, wy, bw - 8, 2);
      }
    });

    // River reflection
    ctx.fillStyle = '#0a0720';
    ctx.fillRect(0, 114, 320, 66);
  } else if (safeTheme === 'sakura') {
    // Moon
    ctx.fillStyle = 'rgba(255, 240, 248, 0.92)';
    ctx.beginPath();
    ctx.arc(216, 34, 15, 0, Math.PI * 2);
    ctx.fill();

    // Mount Fuji
    ctx.fillStyle = '#533575';
    ctx.beginPath();
    ctx.moveTo(64, 114);
    ctx.lineTo(148, 48);
    ctx.lineTo(172, 48);
    ctx.lineTo(256, 114);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fdf4ff';
    ctx.beginPath();
    ctx.moveTo(148, 48);
    ctx.lineTo(172, 48);
    ctx.lineTo(186, 63);
    ctx.lineTo(168, 59);
    ctx.lineTo(160, 65);
    ctx.lineTo(148, 58);
    ctx.lineTo(134, 63);
    ctx.closePath();
    ctx.fill();

    // Pagoda on right
    ctx.fillStyle = '#2c1747';
    ctx.fillRect(264, 64, 18, 50);
    for (let tier = 0; tier < 3; tier++) {
      const ty = 64 + tier * 13;
      ctx.beginPath();
      ctx.moveTo(255, ty);
      ctx.lineTo(273, ty - 7);
      ctx.lineTo(291, ty);
      ctx.closePath();
      ctx.fill();
    }

    // Torii gate framing track
    ctx.fillStyle = '#be185d';
    ctx.fillRect(108, 60, 104, 7);
    ctx.fillRect(118, 72, 84, 5);
    ctx.fillRect(124, 64, 7, 50);
    ctx.fillRect(189, 64, 7, 50);

    // Sakura canopies
    ctx.fillStyle = '#f9a8d4';
    ctx.beginPath();
    ctx.arc(24, 24, 30, 0, Math.PI * 2);
    ctx.arc(58, 16, 22, 0, Math.PI * 2);
    ctx.arc(296, 24, 30, 0, Math.PI * 2);
    ctx.arc(262, 16, 22, 0, Math.PI * 2);
    ctx.fill();

    // Lake
    ctx.fillStyle = '#241242';
    ctx.fillRect(0, 114, 320, 66);
  } else {
    // Cosmic stars
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 36; i++) {
      const sx = ((i * 53) % 312) + 4;
      const sy = ((i * 29) % 108) + 4;
      ctx.globalAlpha = 0.4 + (i % 4) * 0.15;
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;

    // Large ringed planet upper right
    const pGrad = ctx.createRadialGradient(224, 34, 6, 232, 42, 46);
    pGrad.addColorStop(0, '#c084fc');
    pGrad.addColorStop(0.55, '#6d28d9');
    pGrad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.arc(234, 42, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#67e8f9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(234, 44, 58, 13, -0.32, 0, Math.PI * 2);
    ctx.stroke();

    // Secondary moon left
    const mGrad = ctx.createRadialGradient(42, 76, 4, 48, 82, 26);
    mGrad.addColorStop(0, '#a855f7');
    mGrad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = mGrad;
    ctx.beginPath();
    ctx.arc(48, 82, 24, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#09071d';
    ctx.fillRect(0, 114, 320, 66);
  }

  // Perspective Neon Rhythm Highway (signature look)
  const trackGrad = ctx.createLinearGradient(0, 108, 0, 180);
  trackGrad.addColorStop(0, '#181042');
  trackGrad.addColorStop(1, '#261868');
  ctx.fillStyle = trackGrad;
  ctx.beginPath();
  ctx.moveTo(143, 108);
  ctx.lineTo(177, 108);
  ctx.lineTo(258, 180);
  ctx.lineTo(62, 180);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = primary;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(143, 108);
  ctx.lineTo(62, 180);
  ctx.stroke();

  ctx.strokeStyle = secondary;
  ctx.beginPath();
  ctx.moveTo(177, 108);
  ctx.lineTo(258, 180);
  ctx.stroke();

  // Inner dividers & luminous tiles
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(160, 108);
  ctx.lineTo(160, 180);
  ctx.stroke();

  ctx.fillStyle = primary;
  ctx.fillRect(108, 152, 26, 9);
  ctx.fillStyle = secondary;
  ctx.fillRect(184, 146, 26, 9);
  ctx.fillStyle = accent;
  ctx.fillRect(148, 128, 22, 7);

  const url = canvas.toDataURL('image/png');
  thumbnailCache.set(safeTheme, url);
  return url;
}
