import React from 'react';
import type { SceneTransitionRequest } from '../game/transitions/SceneTransitionEngine';

interface SceneTransitionOverlayProps {
  transition: SceneTransitionRequest | null;
  zIndexClass?: string;
}

/**
 * Non-blocking GPU-composited visual transition overlay supporting:
 * fade, slide, zoom, portal, flash, and color_shift.
 */
export const SceneTransitionOverlay: React.FC<SceneTransitionOverlayProps> = ({
  transition,
  zIndexClass = 'z-40',
}) => {
  if (!transition) return null;

  const { id, type, durationMs, primaryColor, secondaryColor, accentColor, reducedFlash } =
    transition;
  const dur = `${Math.max(240, Math.min(2400, durationMs))}ms`;
  const flashPeak = reducedFlash ? '0.26' : '0.58';

  if (type === 'slide') {
    return (
      <div
        key={id}
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 ${zIndexClass} overflow-hidden`}
      >
        <div
          className="bf-tr-anim absolute inset-y-0 -inset-x-12"
          style={{
            background: `linear-gradient(105deg, transparent 0%, ${primaryColor}55 24%, #070b22 48%, ${secondaryColor}66 76%, transparent 100%)`,
            animation: `bf-tr-slide ${dur} cubic-bezier(0.22, 1, 0.36, 1) forwards`,
            willChange: 'transform, opacity',
          }}
        />
      </div>
    );
  }

  if (type === 'zoom') {
    return (
      <div
        key={id}
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 ${zIndexClass} flex items-center justify-center overflow-hidden`}
      >
        <div
          className="bf-tr-anim w-[125vmax] h-[125vmax] rounded-3xl border-4"
          style={{
            borderColor: primaryColor,
            boxShadow: `inset 0 0 90px ${secondaryColor}88, 0 0 80px ${primaryColor}66`,
            background: `radial-gradient(circle at center, transparent 18%, ${accentColor}38 48%, #050718 82%)`,
            animation: `bf-tr-zoom ${dur} cubic-bezier(0.22, 1, 0.36, 1) forwards`,
            willChange: 'transform, opacity',
          }}
        />
      </div>
    );
  }

  if (type === 'portal') {
    return (
      <div
        key={id}
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 ${zIndexClass} flex items-center justify-center overflow-hidden`}
      >
        <div
          className="bf-tr-anim w-[75vmin] h-[75vmin] rounded-full"
          style={{
            border: `4px solid ${primaryColor}`,
            boxShadow: `0 0 65px ${primaryColor}, inset 0 0 70px ${secondaryColor}`,
            background: `radial-gradient(circle at center, ${
              reducedFlash ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.42)'
            } 0%, ${primaryColor}55 34%, ${secondaryColor}44 62%, transparent 78%)`,
            animation: `bf-tr-portal ${dur} cubic-bezier(0.16, 1, 0.3, 1) forwards`,
            willChange: 'transform, opacity',
          }}
        />
      </div>
    );
  }

  if (type === 'flash') {
    return (
      <div
        key={id}
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 ${zIndexClass} overflow-hidden`}
      >
        <div
          className="bf-tr-anim absolute inset-0"
          style={
            {
              background: `radial-gradient(circle at center, #ffffff 0%, ${primaryColor}bb 42%, ${secondaryColor}88 78%, transparent 100%)`,
              '--bf-flash-peak': flashPeak,
              animation: `bf-tr-flash ${dur} ease-out forwards`,
              willChange: 'transform, opacity',
            } as React.CSSProperties
          }
        />
      </div>
    );
  }

  if (type === 'color_shift') {
    return (
      <div
        key={id}
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 ${zIndexClass} overflow-hidden`}
      >
        <div
          className="bf-tr-anim absolute -inset-12 mix-blend-screen"
          style={{
            background: `linear-gradient(125deg, ${primaryColor}aa 0%, ${secondaryColor}aa 50%, ${accentColor}aa 100%)`,
            animation: `bf-tr-color-shift ${dur} cubic-bezier(0.22, 1, 0.36, 1) forwards`,
            willChange: 'transform, opacity',
          }}
        />
      </div>
    );
  }

  // Default: 'fade'
  return (
    <div
      key={id}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 ${zIndexClass} overflow-hidden`}
    >
      <div
        className="bf-tr-anim absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 42%, ${primaryColor}33 0%, #050819 72%)`,
          animation: `bf-tr-fade ${dur} ease-in-out forwards`,
          willChange: 'opacity',
        }}
      />
    </div>
  );
};
