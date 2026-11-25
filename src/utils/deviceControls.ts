import { useEffect, useState } from 'react';

export type GameplayDeviceType = 'phone' | 'tablet' | 'pc';
export type GameplayOrientation = 'portrait' | 'landscape';
export type GameplayInputMode = 'direct_3d' | 'panels';

export interface GameplayControlProfile {
  deviceType: GameplayDeviceType;
  orientation: GameplayOrientation;
  showVisualPanels: boolean;
  inputMode: GameplayInputMode;
}

const PHONE_SMALLEST_WIDTH_THRESHOLD = 600;
const PHONE_UA_SMALLEST_WIDTH_MAX = 680;

function matchMediaSafe(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

export function detectGameplayControlProfile(): GameplayControlProfile {
  if (typeof window === 'undefined') {
    return {
      deviceType: 'pc',
      orientation: 'landscape',
      showVisualPanels: true,
      inputMode: 'panels',
    };
  }

  const vw = Math.max(1, window.innerWidth || document.documentElement?.clientWidth || 1280);
  const vh = Math.max(1, window.innerHeight || document.documentElement?.clientHeight || 800);
  const orientation: GameplayOrientation = vw > vh ? 'landscape' : 'portrait';
  const shortSide = Math.min(vw, vh);

  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const ua = nav?.userAgent ?? '';
  const maxTouchPoints = nav?.maxTouchPoints ?? 0;

  const coarsePrimary = matchMediaSafe('(pointer: coarse)');
  const anyCoarse = matchMediaSafe('(any-pointer: coarse)');
  const finePrimary = matchMediaSafe('(pointer: fine)');
  const canHover = matchMediaSafe('(hover: hover)');

  const isPhoneUa =
    /iPhone|iPod|Windows Phone/i.test(ua) ||
    (/Android/i.test(ua) && /Mobile/i.test(ua));
  const isTabletUa =
    /iPad/i.test(ua) ||
    (/Macintosh/i.test(ua) && maxTouchPoints > 1) ||
    (/Android/i.test(ua) && !/Mobile/i.test(ua));

  const hasTouchHardware = maxTouchPoints > 0 || coarsePrimary || anyCoarse;

  let deviceType: GameplayDeviceType;

  // PC / Desktop: no touch hardware, OR primary fine mouse pointer with hover and non-mobile UA
  if (
    !hasTouchHardware ||
    (finePrimary && canHover && !coarsePrimary && !isPhoneUa && !isTabletUa)
  ) {
    deviceType = 'pc';
  } else {
    // Touch device (Phone vs Tablet) using orientation-invariant shortest CSS side
    // so rotating a phone to landscape never promotes it to tablet or PC.
    if (isPhoneUa && shortSide < PHONE_UA_SMALLEST_WIDTH_MAX) {
      deviceType = 'phone';
    } else if (shortSide < PHONE_SMALLEST_WIDTH_THRESHOLD) {
      deviceType = 'phone';
    } else if (isTabletUa || shortSide >= PHONE_SMALLEST_WIDTH_THRESHOLD) {
      deviceType = 'tablet';
    } else {
      deviceType = 'phone';
    }
  }

  // Truth table:
  // - Phone (portrait or landscape) -> direct_3d (no bottom lane panels)
  // - Tablet portrait -> direct_3d (no bottom lane panels)
  // - Tablet landscape -> panels (visual bottom lane panels)
  // - PC -> panels (visual bottom lane panels + keyboard shortcuts)
  const showVisualPanels =
    deviceType === 'pc' || (deviceType === 'tablet' && orientation === 'landscape');

  return {
    deviceType,
    orientation,
    showVisualPanels,
    inputMode: showVisualPanels ? 'panels' : 'direct_3d',
  };
}

export function useGameplayControlMode(): GameplayControlProfile {
  const [profile, setProfile] = useState<GameplayControlProfile>(() =>
    detectGameplayControlProfile(),
  );

  useEffect(() => {
    const refresh = () => {
      const next = detectGameplayControlProfile();
      setProfile((prev) =>
        prev.deviceType === next.deviceType &&
        prev.orientation === next.orientation &&
        prev.showVisualPanels === next.showVisualPanels &&
        prev.inputMode === next.inputMode
          ? prev
          : next,
      );
    };

    refresh();
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);

    const pointerMq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)')
        : null;
    const hoverMq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(hover: hover)')
        : null;

    pointerMq?.addEventListener?.('change', refresh);
    hoverMq?.addEventListener?.('change', refresh);

    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('orientationchange', refresh);
      pointerMq?.removeEventListener?.('change', refresh);
      hoverMq?.removeEventListener?.('change', refresh);
    };
  }, []);

  return profile;
}
