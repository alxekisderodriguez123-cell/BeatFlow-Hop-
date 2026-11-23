import React from 'react';

interface BeatflowLogoProps {
  compact?: boolean;
  energy?: number;
  animate?: boolean;
  reducedMotion?: boolean;
}

export const BeatflowLogo: React.FC<BeatflowLogoProps> = ({
  compact = false,
  energy = 0.25,
  animate = true,
  reducedMotion = false,
}) => {
  const pulse = animate && !reducedMotion ? Math.max(0, Math.min(1, energy)) : 0.22;
  const haloScale = 1 + pulse * 0.055;
  const haloOpacity = 0.26 + pulse * 0.42;
  const glowIntensity = Math.round(18 + pulse * 18);

  return (
    <div
      className={`flex flex-col items-center select-none ${
        animate && !reducedMotion && !compact ? 'bf-fade-up bf-float-slow' : ''
      }`}
    >
      <svg
        viewBox="0 0 460 155"
        className={compact ? 'w-56 h-auto' : 'w-[310px] sm:w-[395px] h-auto transition-transform duration-150'}
        style={
          compact
            ? undefined
            : {
                filter: `drop-shadow(0 0 ${glowIntensity}px rgba(34,211,238,${(0.36 + pulse * 0.32).toFixed(2)}))`,
              }
        }
        role="img"
        aria-label="BEATFLOW HOP"
      >
        <defs>
          <linearGradient id="bf-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="bf-pink" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f5d0fe" />
            <stop offset="45%" stopColor="#f472b6" />
            <stop offset="100%" stopColor="#c026d3" />
          </linearGradient>
          <linearGradient id="bf-wave" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
            <stop offset="20%" stopColor="#22d3ee" />
            <stop offset="50%" stopColor="#ffffff" />
            <stop offset="80%" stopColor="#e879f9" />
            <stop offset="100%" stopColor="#e879f9" stopOpacity="0" />
          </linearGradient>
          <filter id="bf-glow" x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer reactive orbital halo */}
        <circle
          cx="230"
          cy="76"
          r="64"
          fill="none"
          stroke="url(#bf-wave)"
          strokeWidth={2.2 + pulse * 1.4}
          opacity={haloOpacity}
          style={{
            transformOrigin: '230px 76px',
            transform: `scale(${haloScale.toFixed(3)})`,
          }}
        />
        {!compact && (
          <circle
            cx="230"
            cy="76"
            r="74"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1"
            strokeDasharray="6 10"
            opacity={(0.14 + pulse * 0.25).toFixed(2)}
          />
        )}

        {/* BEATFLOW */}
        <text
          x="230"
          y="68"
          textAnchor="middle"
          fill="url(#bf-cyan)"
          filter="url(#bf-glow)"
          style={{
            fontFamily: "'Chakra Petch', sans-serif",
            fontWeight: 700,
            fontStyle: 'italic',
            fontSize: '56px',
            letterSpacing: '3px',
          }}
        >
          BEATFLOW
        </text>

        {/* Equalizer pulse wave dividing BEATFLOW and HOP */}
        <path
          d="M 28 83 L 118 83 L 128 71 L 138 94 L 148 64 L 158 98 L 168 75 L 178 86 L 188 83 L 272 83 L 282 74 L 292 95 L 302 62 L 312 96 L 322 72 L 332 88 L 342 83 L 432 83"
          fill="none"
          stroke="url(#bf-wave)"
          strokeWidth={2.6 + pulse * 1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#bf-glow)"
        />

        {/* HOP */}
        <text
          x="235"
          y="136"
          textAnchor="middle"
          fill="url(#bf-pink)"
          filter="url(#bf-glow)"
          style={{
            fontFamily: "'Chakra Petch', sans-serif",
            fontWeight: 700,
            fontStyle: 'italic',
            fontSize: '52px',
            letterSpacing: '6px',
          }}
        >
          HOP
        </text>
      </svg>

      {!compact && (
        <p className="mt-1 text-sm sm:text-base font-medium tracking-wide text-slate-100/95 text-center drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
          Feel the <span className="text-cyan-300 font-semibold">music</span>. Play the{' '}
          <span className="text-fuchsia-300 font-semibold">rhythm</span>.
        </p>
      )}
    </div>
  );
};
