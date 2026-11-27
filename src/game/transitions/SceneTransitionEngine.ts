import type { EnvironmentTheme, SceneTransitionType, SongPalette } from '../../types/game';
import { getEnvironmentDefinition } from '../environments/environmentDefinitions';

export const SCENE_TRANSITION_TYPES: readonly SceneTransitionType[] = [
  'fade',
  'slide',
  'zoom',
  'portal',
  'flash',
  'color_shift',
] as const;

export const SCENE_TRANSITION_LABELS: Record<SceneTransitionType, string> = {
  fade: 'Fade',
  slide: 'Slide',
  zoom: 'Zoom',
  portal: 'Portal',
  flash: 'Flash',
  color_shift: 'Color Shift',
};

export interface SceneTransitionRequest {
  id: number;
  type: SceneTransitionType;
  durationMs: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  reducedFlash: boolean;
}

export function resolveTransitionPalette(
  theme?: EnvironmentTheme,
  fallback?: SongPalette,
): { primaryColor: string; secondaryColor: string; accentColor: string } {
  if (theme) {
    const def = getEnvironmentDefinition(theme);
    return {
      primaryColor: def.colorPalette.primary,
      secondaryColor: def.colorPalette.secondary,
      accentColor: def.colorPalette.accent,
    };
  }
  return {
    primaryColor: fallback?.primary ?? '#22d3ee',
    secondaryColor: fallback?.secondary ?? '#e879f9',
    accentColor: fallback?.accent ?? '#6366f1',
  };
}
