import type { EnvironmentTheme, QualityLevel, SongPalette } from '../../types/game';

export interface EnvironmentColorPalette extends SongPalette {
  tertiary: string;
  complementary: string;
  skyTop: string;
  skyHorizon: string;
  feverPrimary: string;
  feverSecondary: string;
}

export interface EnvironmentDefinition {
  environmentId: EnvironmentTheme;
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

export const ENVIRONMENT_DEFINITIONS: Record<EnvironmentTheme, EnvironmentDefinition> = {
  cyberpunk: {
    environmentId: 'cyberpunk',
    displayName: 'Cyberpunk City',
    description: 'Metrópolis nocturna ilustrada con rascacielos neón, arcos energéticos, luna llena y portal en el horizonte.',
    backgroundLayers: ['Cielo nocturno estrellado', 'Luna estilizada', 'Skyline de rascacielos con ventanas'],
    foregroundLayers: ['Arcos luminosos de pista', 'Paneles ecualizadores laterales', 'Chispas ascendentes'],
    parallaxSettings: { skyFactor: 0.12, midgroundFactor: 0.35, foregroundFactor: 0.85 },
    colorPalette: {
      primary: '#22d3ee',
      secondary: '#f43f8e',
      accent: '#f59e0b',
      tertiary: '#6366f1',
      complementary: '#fde047',
      skyTop: '#0b0824',
      skyHorizon: '#2a1252',
      feverPrimary: '#fbbf24',
      feverSecondary: '#ec4899',
    },
    lightingProfile: {
      ambientIntensity: 0.55,
      keyLightIntensity: 1.0,
      bloomIntensity: 0.44,
      exposure: 0.92,
      fogDensity: 0.008,
    },
    particleProfile: { kind: 'Estrellas y chispas neón', densityScale: 1.0, driftSpeed: 1.2 },
    animationProfile: { tempoCoupling: 1.0, horizonPulseStrength: 0.85, cameraSwayScale: 1.0 },
    cameraSettings: { previewPos: [0, 3.3, 6.8], previewLookAt: [0, 2.1, -24], baseFov: 60 },
    qualitySettings: { recommendedQuality: 'high', gpuCostLabel: 'Medio', supportsLowEndMobile: true },
    ambientEffectsSummary: 'Arcos reactivos al kick, ventanas moduladas y halo lunar',
  },
  tropical: {
    environmentId: 'tropical',
    displayName: 'Tropical Beach',
    description: 'Atardecer violeta-dorado con palmeras ilustradas, nubes cálidas y reflejos bioluminiscentes sobre el mar.',
    backgroundLayers: ['Gradiente crepuscular', 'Sol dorado con halo', 'Nubes estilizadas con borde solar'],
    foregroundLayers: ['Islotes costeros', 'Palmeras cel-shaded', 'Brillos de marea'],
    parallaxSettings: { skyFactor: 0.08, midgroundFactor: 0.28, foregroundFactor: 0.78 },
    colorPalette: {
      primary: '#22d3ee',
      secondary: '#fb7185',
      accent: '#fde047',
      tertiary: '#a855f7',
      complementary: '#34d399',
      skyTop: '#24144f',
      skyHorizon: '#f97316',
      feverPrimary: '#fde047',
      feverSecondary: '#fb7185',
    },
    lightingProfile: {
      ambientIntensity: 0.65,
      keyLightIntensity: 1.05,
      bloomIntensity: 0.38,
      exposure: 0.96,
      fogDensity: 0.006,
    },
    particleProfile: { kind: 'Destellos solares y brisa marina', densityScale: 0.85, driftSpeed: 0.85 },
    animationProfile: { tempoCoupling: 0.8, horizonPulseStrength: 0.7, cameraSwayScale: 0.85 },
    cameraSettings: { previewPos: [0, 3.1, 6.6], previewLookAt: [0, 1.9, -22], baseFov: 58 },
    qualitySettings: { recommendedQuality: 'high', gpuCostLabel: 'Ligero', supportsLowEndMobile: true },
    ambientEffectsSummary: 'Brisa en palmeras, oleaje luminoso y reflejos cálidos',
  },
  ocean: {
    environmentId: 'ocean',
    displayName: 'Ocean World',
    description: 'Mar nocturno estilizado con oleaje bioluminiscente azul cian, luna brillante y horizonte neblinoso.',
    backgroundLayers: ['Cielo estrellado marino', 'Luna llena con reflejo', 'Nubes bajas nocturnas'],
    foregroundLayers: ['Olas estilizadas con cresta', 'Estelas bioluminiscentes', 'Rocas costeras'],
    parallaxSettings: { skyFactor: 0.1, midgroundFactor: 0.3, foregroundFactor: 0.8 },
    colorPalette: {
      primary: '#22d3ee',
      secondary: '#38bdf8',
      accent: '#34d399',
      tertiary: '#1d4ed8',
      complementary: '#f472b6',
      skyTop: '#041226',
      skyHorizon: '#0e3a5c',
      feverPrimary: '#34d399',
      feverSecondary: '#38bdf8',
    },
    lightingProfile: {
      ambientIntensity: 0.56,
      keyLightIntensity: 0.92,
      bloomIntensity: 0.4,
      exposure: 0.9,
      fogDensity: 0.008,
    },
    particleProfile: { kind: 'Plancton luminoso flotante', densityScale: 0.9, driftSpeed: 0.9 },
    animationProfile: { tempoCoupling: 0.85, horizonPulseStrength: 0.75, cameraSwayScale: 0.9 },
    cameraSettings: { previewPos: [0, 3.0, 6.4], previewLookAt: [0, 1.6, -24], baseFov: 58 },
    qualitySettings: { recommendedQuality: 'medium', gpuCostLabel: 'Ligero', supportsLowEndMobile: true },
    ambientEffectsSummary: 'Ondas sincronizadas al bajo y partículas marinas',
  },
  mountain: {
    environmentId: 'mountain',
    displayName: 'Mountain Landscape',
    description: 'Cordillera alpina nocturna con auroras boreales ondulantes y reflejo espejo sobre el lago.',
    backgroundLayers: ['Cielo boreal con estrellas', 'Cintas de aurora animadas', 'Cumbres nevadas por capas'],
    foregroundLayers: ['Pinos estilizados', 'Lago reflectante', 'Luciérnagas de valle'],
    parallaxSettings: { skyFactor: 0.1, midgroundFactor: 0.32, foregroundFactor: 0.75 },
    colorPalette: {
      primary: '#34d399',
      secondary: '#38bdf8',
      accent: '#c084fc',
      tertiary: '#6366f1',
      complementary: '#fde047',
      skyTop: '#071426',
      skyHorizon: '#16384d',
      feverPrimary: '#34d399',
      feverSecondary: '#c084fc',
    },
    lightingProfile: {
      ambientIntensity: 0.58,
      keyLightIntensity: 0.95,
      bloomIntensity: 0.38,
      exposure: 0.91,
      fogDensity: 0.007,
    },
    particleProfile: { kind: 'Luciérnagas y polvo glaciar', densityScale: 0.85, driftSpeed: 0.75 },
    animationProfile: { tempoCoupling: 0.82, horizonPulseStrength: 0.65, cameraSwayScale: 0.82 },
    cameraSettings: { previewPos: [0, 3.2, 6.7], previewLookAt: [0, 2.2, -25], baseFov: 59 },
    qualitySettings: { recommendedQuality: 'medium', gpuCostLabel: 'Ligero', supportsLowEndMobile: true },
    ambientEffectsSummary: 'Auroras reactivas a frecuencias medias y brillo estelar',
  },
  newyork: {
    environmentId: 'newyork',
    displayName: 'New York Night',
    description: 'Skyline iluminado de Manhattan con puente colgante dorado y reflejos sobre el río.',
    backgroundLayers: ['Noche metropolitana', 'Luna urbana', 'Siluetas de rascacielos emblemáticos'],
    foregroundLayers: ['Puente colgante con cables', 'Balizas y ventanas', 'Destellos de tráfico'],
    parallaxSettings: { skyFactor: 0.14, midgroundFactor: 0.4, foregroundFactor: 0.85 },
    colorPalette: {
      primary: '#fbbf24',
      secondary: '#38bdf8',
      accent: '#fb7185',
      tertiary: '#818cf8',
      complementary: '#22d3ee',
      skyTop: '#090b22',
      skyHorizon: '#232859',
      feverPrimary: '#fbbf24',
      feverSecondary: '#38bdf8',
    },
    lightingProfile: {
      ambientIntensity: 0.56,
      keyLightIntensity: 1.0,
      bloomIntensity: 0.42,
      exposure: 0.92,
      fogDensity: 0.008,
    },
    particleProfile: { kind: 'Luces urbanas y reflejos dorados', densityScale: 0.95, driftSpeed: 1.1 },
    animationProfile: { tempoCoupling: 0.95, horizonPulseStrength: 0.8, cameraSwayScale: 0.95 },
    cameraSettings: { previewPos: [0, 3.4, 6.9], previewLookAt: [0, 2.3, -24], baseFov: 60 },
    qualitySettings: { recommendedQuality: 'high', gpuCostLabel: 'Medio', supportsLowEndMobile: true },
    ambientEffectsSummary: 'Cables luminosos en el puente y rascacielos pulsantes',
  },
  cosmic: {
    environmentId: 'cosmic',
    displayName: 'Cosmic Dimension',
    description: 'Nebulosa profunda con planeta anillado ilustrado, asteroides flotantes y campo estelar.',
    backgroundLayers: ['Nebulosa multicolor', 'Planeta anillado estilizado', 'Estrellas de 4 puntas'],
    foregroundLayers: ['Cinturón de asteroides', 'Anillos de portal espacial', 'Polvo estelar'],
    parallaxSettings: { skyFactor: 0.12, midgroundFactor: 0.36, foregroundFactor: 0.88 },
    colorPalette: {
      primary: '#38bdf8',
      secondary: '#e879f9',
      accent: '#fbbf24',
      tertiary: '#7c3aed',
      complementary: '#34d399',
      skyTop: '#060318',
      skyHorizon: '#240b4c',
      feverPrimary: '#fbbf24',
      feverSecondary: '#e879f9',
    },
    lightingProfile: {
      ambientIntensity: 0.54,
      keyLightIntensity: 1.02,
      bloomIntensity: 0.46,
      exposure: 0.93,
      fogDensity: 0.007,
    },
    particleProfile: { kind: 'Polvo estelar hiperespacial', densityScale: 1.1, driftSpeed: 1.35 },
    animationProfile: { tempoCoupling: 1.08, horizonPulseStrength: 0.9, cameraSwayScale: 1.05 },
    cameraSettings: { previewPos: [0, 3.3, 6.8], previewLookAt: [0, 2.4, -26], baseFov: 62 },
    qualitySettings: { recommendedQuality: 'high', gpuCostLabel: 'Medio', supportsLowEndMobile: true },
    ambientEffectsSummary: 'Órbita de asteroides y nebulosa modulada por energía',
  },
  nightclub: {
    environmentId: 'nightclub',
    displayName: 'Nightclub',
    description: 'Club electrónico con focos móviles, haces láser, torres de altavoces y ecualizadores.',
    backgroundLayers: ['Cúpula nocturna de escenario', 'Muros ecualizadores 2.5D', 'Haces láser cruzados'],
    foregroundLayers: ['Altavoces reactivos al kick', 'Conos de foco', 'Haze iluminado'],
    parallaxSettings: { skyFactor: 0.15, midgroundFactor: 0.42, foregroundFactor: 0.9 },
    colorPalette: {
      primary: '#22d3ee',
      secondary: '#ec4899',
      accent: '#a855f7',
      tertiary: '#38bdf8',
      complementary: '#fde047',
      skyTop: '#0b0722',
      skyHorizon: '#290d4a',
      feverPrimary: '#ec4899',
      feverSecondary: '#22d3ee',
    },
    lightingProfile: {
      ambientIntensity: 0.52,
      keyLightIntensity: 1.05,
      bloomIntensity: 0.48,
      exposure: 0.94,
      fogDensity: 0.009,
    },
    particleProfile: { kind: 'Destellos de pista y haze de club', densityScale: 1.1, driftSpeed: 1.25 },
    animationProfile: { tempoCoupling: 1.15, horizonPulseStrength: 1.0, cameraSwayScale: 1.05 },
    cameraSettings: { previewPos: [0, 3.2, 6.6], previewLookAt: [0, 2.0, -20], baseFov: 61 },
    qualitySettings: { recommendedQuality: 'high', gpuCostLabel: 'Alto', supportsLowEndMobile: true },
    ambientEffectsSummary: 'Focos dinámicos, subwoofers pulsantes y láseres al ritmo',
  },
  synthwave: {
    environmentId: 'synthwave',
    displayName: 'Synthwave Highway',
    description: 'Autopista retrofuturista con cuadrícula magenta hacia un sol estriado sobre sierras violetas.',
    backgroundLayers: ['Cielo atardecer ochentero', 'Sol retro rayado', 'Cordillera poligonal violeta'],
    foregroundLayers: ['Rejilla horizonte brillante', 'Postes neón laterales', 'Estelas veloces'],
    parallaxSettings: { skyFactor: 0.1, midgroundFactor: 0.34, foregroundFactor: 0.86 },
    colorPalette: {
      primary: '#f43f8e',
      secondary: '#22d3ee',
      accent: '#fde047',
      tertiary: '#a855f7',
      complementary: '#38bdf8',
      skyTop: '#16072d',
      skyHorizon: '#be185d',
      feverPrimary: '#fde047',
      feverSecondary: '#f43f8e',
    },
    lightingProfile: {
      ambientIntensity: 0.58,
      keyLightIntensity: 1.0,
      bloomIntensity: 0.45,
      exposure: 0.94,
      fogDensity: 0.007,
    },
    particleProfile: { kind: 'Estrellas retro y chispas horizontales', densityScale: 0.95, driftSpeed: 1.4 },
    animationProfile: { tempoCoupling: 1.05, horizonPulseStrength: 0.9, cameraSwayScale: 0.95 },
    cameraSettings: { previewPos: [0, 3.1, 6.6], previewLookAt: [0, 2.0, -24], baseFov: 60 },
    qualitySettings: { recommendedQuality: 'high', gpuCostLabel: 'Ligero', supportsLowEndMobile: true },
    ambientEffectsSummary: 'Sol retro pulsante, cuadrícula progresiva y palmeras/montañas',
  },
  reactor: {
    environmentId: 'reactor',
    displayName: 'Industrial Reactor',
    description: 'Central energética futurista con núcleo de plasma giratorio, turbinas y conductos presurizados.',
    backgroundLayers: ['Cámara blindada industrial', 'Núcleo de plasma central', 'Conductos energéticos'],
    foregroundLayers: ['Turbinas sincronizadas', 'Barreras hidráulicas', 'Chispas térmicas'],
    parallaxSettings: { skyFactor: 0.14, midgroundFactor: 0.44, foregroundFactor: 0.9 },
    colorPalette: {
      primary: '#f59e0b',
      secondary: '#22d3ee',
      accent: '#fb7185',
      tertiary: '#fb923c',
      complementary: '#38bdf8',
      skyTop: '#0a0d18',
      skyHorizon: '#2e1d14',
      feverPrimary: '#fbbf24',
      feverSecondary: '#22d3ee',
    },
    lightingProfile: {
      ambientIntensity: 0.54,
      keyLightIntensity: 1.06,
      bloomIntensity: 0.45,
      exposure: 0.93,
      fogDensity: 0.009,
    },
    particleProfile: { kind: 'Chispas de plasma y vapor iluminado', densityScale: 1.05, driftSpeed: 1.3 },
    animationProfile: { tempoCoupling: 1.12, horizonPulseStrength: 0.95, cameraSwayScale: 1.02 },
    cameraSettings: { previewPos: [0, 3.3, 6.8], previewLookAt: [0, 2.2, -22], baseFov: 61 },
    qualitySettings: { recommendedQuality: 'high', gpuCostLabel: 'Alto', supportsLowEndMobile: true },
    ambientEffectsSummary: 'Rotación de turbinas, núcleo de plasma y pulsos de presión',
  },
  digital: {
    environmentId: 'digital',
    displayName: 'Digital Dimension',
    description: 'Matriz cibernética geométrica con portales flotantes, poliedros wireframe y flujos de datos.',
    backgroundLayers: ['Cúpula matricial digital', 'Portales vectoriales en túnel', 'Retícula espacial'],
    foregroundLayers: ['Poliedros flotantes', 'Flujo de paquetes de datos', 'Líneas holográficas'],
    parallaxSettings: { skyFactor: 0.16, midgroundFactor: 0.45, foregroundFactor: 0.92 },
    colorPalette: {
      primary: '#22d3ee',
      secondary: '#a855f7',
      accent: '#34d399',
      tertiary: '#38bdf8',
      complementary: '#fb7185',
      skyTop: '#040b1c',
      skyHorizon: '#161b4f',
      feverPrimary: '#34d399',
      feverSecondary: '#a855f7',
    },
    lightingProfile: {
      ambientIntensity: 0.55,
      keyLightIntensity: 0.98,
      bloomIntensity: 0.44,
      exposure: 0.92,
      fogDensity: 0.008,
    },
    particleProfile: { kind: 'Flujo de datos en Z y nodos cuánticos', densityScale: 1.1, driftSpeed: 1.5 },
    animationProfile: { tempoCoupling: 1.1, horizonPulseStrength: 0.88, cameraSwayScale: 1.0 },
    cameraSettings: { previewPos: [0, 3.25, 6.7], previewLookAt: [0, 2.1, -23], baseFov: 62 },
    qualitySettings: { recommendedQuality: 'high', gpuCostLabel: 'Medio', supportsLowEndMobile: true },
    ambientEffectsSummary: 'Poliedros reactivos a hi-hat, portales vectoriales y datos',
  },
};

export function getEnvironmentDefinition(theme: EnvironmentTheme): EnvironmentDefinition {
  return ENVIRONMENT_DEFINITIONS[theme] ?? ENVIRONMENT_DEFINITIONS.cyberpunk;
}

const thumbnailCache = new Map<EnvironmentTheme, string>();

/**
 * Generates an illustrated 2.5D stylized miniature thumbnail offline for scenario selection cards,
 * keeping GPU memory free by avoiding 10 simultaneous WebGL renderers.
 */
export function renderEnvironmentThumbnailDataUrl(theme: EnvironmentTheme): string {
  const cached = thumbnailCache.get(theme);
  if (cached) return cached;
  if (typeof document === 'undefined') return '';

  const def = getEnvironmentDefinition(theme);
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const { skyTop, skyHorizon, primary, secondary, accent } = def.colorPalette;

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, 128);
  sky.addColorStop(0, skyTop);
  sky.addColorStop(1, skyHorizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 320, 180);

  // Subtle stars / sparkles
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 24; i++) {
    const sx = ((i * 67 + theme.length * 19) % 306) + 7;
    const sy = ((i * 37 + i * i) % 86) + 8;
    ctx.globalAlpha = 0.25 + (i % 4) * 0.18;
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.globalAlpha = 1;

  // Center focal body (Sun / Moon / Core / Planet / Spotlight)
  const cx = 160;
  const cy = theme === 'cosmic' ? 62 : 94;
  const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 56);
  glow.addColorStop(0, accent);
  glow.addColorStop(0.45, secondary + '88');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, 56, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = theme === 'ocean' || theme === 'cyberpunk' ? '#f8fafc' : accent;
  ctx.beginPath();
  ctx.arc(cx, cy, theme === 'tropical' || theme === 'synthwave' ? 24 : 18, 0, Math.PI * 2);
  ctx.fill();

  if (theme === 'cosmic') {
    ctx.strokeStyle = primary;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 38, 9, -0.22, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Stylized midground silhouettes per world
  ctx.fillStyle = '#120b2e';
  if (theme === 'cyberpunk' || theme === 'newyork' || theme === 'nightclub') {
    const heights = [48, 72, 42, 86, 54, 46, 80, 58, 66, 44];
    heights.forEach((h, idx) => {
      const bx = idx * 33 - 4;
      if (idx === 4 || idx === 5) return; // Keep center runway vista clear
      ctx.fillStyle = idx % 2 === 0 ? '#110b2b' : '#18103a';
      ctx.fillRect(bx, 118 - h, 28, h + 14);
      ctx.fillStyle = idx % 2 === 0 ? primary : secondary;
      ctx.globalAlpha = 0.65;
      ctx.fillRect(bx + 5, 118 - h + 6, 4, 4);
      ctx.fillRect(bx + 15, 118 - h + 14, 4, 4);
      ctx.globalAlpha = 1;
    });
  } else if (theme === 'mountain' || theme === 'synthwave' || theme === 'reactor') {
    ctx.beginPath();
    ctx.moveTo(0, 122);
    ctx.lineTo(42, 74);
    ctx.lineTo(84, 108);
    ctx.lineTo(126, 78);
    ctx.lineTo(194, 80);
    ctx.lineTo(238, 68);
    ctx.lineTo(286, 106);
    ctx.lineTo(320, 72);
    ctx.lineTo(320, 125);
    ctx.lineTo(0, 125);
    ctx.closePath();
    ctx.fill();
  } else if (theme === 'tropical' || theme === 'ocean') {
    ctx.fillStyle = '#0c1638';
    ctx.fillRect(0, 112, 320, 68);
    ctx.strokeStyle = primary;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, 128);
    ctx.lineTo(95, 128);
    ctx.moveTo(220, 134);
    ctx.lineTo(308, 134);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (theme === 'digital') {
    ctx.strokeStyle = primary;
    ctx.lineWidth = 2;
    for (let r = 1; r <= 3; r++) {
      const sz = r * 26;
      ctx.globalAlpha = 0.55 - r * 0.12;
      ctx.strokeRect(cx - sz, 95 - sz * 0.6, sz * 2, sz * 1.2);
    }
    ctx.globalAlpha = 1;
  }

  // Ground + Perspective Rhythm Track Runway
  const groundGrad = ctx.createLinearGradient(0, 114, 0, 180);
  groundGrad.addColorStop(0, '#0d0924');
  groundGrad.addColorStop(1, '#060512');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, 114, 320, 66);

  const trackGrad = ctx.createLinearGradient(0, 112, 0, 180);
  trackGrad.addColorStop(0, '#1b1347');
  trackGrad.addColorStop(1, '#261a66');
  ctx.fillStyle = trackGrad;
  ctx.beginPath();
  ctx.moveTo(142, 112);
  ctx.lineTo(178, 112);
  ctx.lineTo(256, 180);
  ctx.lineTo(64, 180);
  ctx.closePath();
  ctx.fill();

  // Track rails & lane guides
  ctx.strokeStyle = primary;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(142, 112);
  ctx.lineTo(64, 180);
  ctx.moveTo(178, 112);
  ctx.lineTo(256, 180);
  ctx.stroke();

  ctx.strokeStyle = secondary;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(160, 112);
  ctx.lineTo(160, 180);
  ctx.stroke();

  // Mini note tiles on runway
  ctx.fillStyle = accent;
  ctx.fillRect(118, 152, 24, 9);
  ctx.fillStyle = primary;
  ctx.fillRect(178, 142, 22, 8);

  const url = canvas.toDataURL('image/png');
  thumbnailCache.set(theme, url);
  return url;
}
