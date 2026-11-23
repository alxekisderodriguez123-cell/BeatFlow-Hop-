import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Disc3, Flame, Pause, ShieldAlert, Sparkles } from 'lucide-react';
import type {
  FlickDirection,
  LaneCount,
  LiveGameplayStats,
  SongMetadata,
} from '../types/game';
import { getLaneKeyLabels } from '../game/presets';

interface GameplayHudProps {
  song: SongMetadata;
  stats: LiveGameplayStats;
  externalPressedLanes?: boolean[];
  onLanePress: (lane: number) => void;
  onLaneRelease: (lane: number) => void;
  onLaneSlideMove: (lane: number) => void;
  onLaneFlick: (lane: number, dir: FlickDirection) => void;
  onPause: () => void;
}

interface PointerTrack {
  startX: number;
  startY: number;
  startTime: number;
  startLane: number;
  currentLane: number;
  flickSent: boolean;
}

export const GameplayHud: React.FC<GameplayHudProps> = ({
  song,
  stats,
  externalPressedLanes,
  onLanePress,
  onLaneRelease,
  onLaneSlideMove,
  onLaneFlick,
  onPause,
}) => {
  const laneCount: LaneCount = stats.laneCount ?? 4;
  const keyLabels = getLaneKeyLabels(laneCount);
  const arenaRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef<Map<number, PointerTrack>>(new Map());
  const [touchPressed, setTouchPressed] = useState<boolean[]>(() =>
    new Array(laneCount).fill(false),
  );

  useEffect(() => {
    setTouchPressed(new Array(laneCount).fill(false));
    pointersRef.current.clear();
  }, [laneCount]);

  const syncTouchPressed = useCallback(() => {
    const next = new Array(laneCount).fill(false);
    for (const p of pointersRef.current.values()) {
      if (p.currentLane >= 0 && p.currentLane < laneCount) {
        next[p.currentLane] = true;
      }
    }
    setTouchPressed(next);
  }, [laneCount]);

  const getLaneFromClientX = useCallback(
    (clientX: number): number => {
      const rect = arenaRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return 0;
      const rel = (clientX - rect.left) / rect.width;
      return Math.max(0, Math.min(laneCount - 1, Math.floor(rel * laneCount)));
    },
    [laneCount],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic pointer events
    }
    const lane = getLaneFromClientX(e.clientX);
    pointersRef.current.set(e.pointerId, {
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      startLane: lane,
      currentLane: lane,
      flickSent: false,
    });
    syncTouchPressed();
    onLanePress(lane);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = pointersRef.current.get(e.pointerId);
    if (!track) return;

    const dx = e.clientX - track.startX;
    const dy = e.clientY - track.startY;
    const dist = Math.hypot(dx, dy);
    const elapsed = performance.now() - track.startTime;

    // Swipe / Flick gesture recognition (rapid swipe within 190ms)
    if (!track.flickSent && dist >= 26 && elapsed <= 195) {
      let dir: FlickDirection = 'up';
      if (Math.abs(dx) > Math.abs(dy) * 1.15) {
        dir = dx < 0 ? 'left' : 'right';
      } else if (dy < -18) {
        dir = 'up';
      } else {
        dir = dx < 0 ? 'left' : 'right';
      }
      track.flickSent = true;
      onLaneFlick(track.startLane, dir);
    }

    // Continuous slide lane tracking
    const nextLane = getLaneFromClientX(e.clientX);
    if (nextLane !== track.currentLane) {
      track.currentLane = nextLane;
      syncTouchPressed();
      onLaneSlideMove(nextLane);
    }
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = pointersRef.current.get(e.pointerId);
    if (!track) return;
    const releasedLane = track.currentLane;
    pointersRef.current.delete(e.pointerId);
    syncTouchPressed();
    onLaneRelease(releasedLane);
  };

  const progressPct =
    stats.duration > 0 ? Math.min(100, Math.max(0, (stats.currentTime / stats.duration) * 100)) : 0;

  const feverPct = stats.feverActive
    ? Math.max(
        0,
        Math.min(100, (stats.feverRemainingSec / Math.max(1, stats.feverDurationSec)) * 100),
      )
    : Math.max(0, Math.min(100, stats.feverCharge * 100));

  const screenAlpha = Math.max(
    stats.screenPulse?.edgeAlpha ?? 0,
    stats.screenPulse?.feverAlpha ?? 0,
  );

  const judgmentColor =
    stats.lastJudgment?.judgment === 'perfect'
      ? 'text-cyan-200 drop-shadow-[0_0_12px_rgba(34,211,238,0.85)]'
      : stats.lastJudgment?.judgment === 'good'
        ? 'text-emerald-300 drop-shadow-[0_0_10px_rgba(52,211,153,0.75)]'
        : stats.lastJudgment?.judgment === 'ok'
          ? 'text-amber-300'
          : 'text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.85)]';

  const maxMissesDisplay = stats.maxMisses >= 999 ? '∞' : stats.maxMisses;
  const shieldSlots = stats.maxMisses <= 6 ? stats.maxMisses : 0;

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none select-none">
      {/* Subtle Reactive Screen Edge Glow (never washes out notes) */}
      {screenAlpha > 0.01 && (
        <div
          className="fixed inset-0 pointer-events-none transition-opacity duration-75"
          style={{
            boxShadow: `inset 0 0 ${stats.feverActive ? 90 : 65}px ${stats.screenPulse.color}`,
            opacity: screenAlpha,
          }}
        />
      )}

      {/* Top Song Progress Bar */}
      <div className="relative w-full h-1.5 bg-[#040614]/90 border-b border-cyan-500/20">
        <div
          className={`h-full transition-[width] duration-100 ${
            stats.feverActive
              ? 'bg-gradient-to-r from-amber-300 via-pink-400 to-cyan-300 shadow-[0_0_14px_rgba(251,191,36,0.9)]'
              : 'bg-gradient-to-r from-cyan-400 via-indigo-400 to-fuchsia-400 shadow-[0_0_12px_rgba(34,211,238,0.85)]'
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Top HUD Row */}
      <div className="flex items-start justify-between px-3 sm:px-6 pt-2.5 gap-2">
        {/* Top-Left: Score, Multiplier, Fever Gauge, Song Info */}
        <div className="flex flex-col gap-1.5 max-w-[46vw] sm:max-w-xs">
          <div
            className={`relative bg-[#050818]/88 border rounded-xl px-3 py-2 overflow-hidden ${
              stats.feverActive
                ? 'border-amber-400/75 shadow-[0_0_24px_rgba(251,191,36,0.3)]'
                : 'border-cyan-400/35 shadow-[0_0_18px_rgba(6,182,212,0.18)]'
            }`}
          >
            <div
              className={`absolute top-0 left-0 w-1 h-full ${
                stats.feverActive
                  ? 'bg-gradient-to-b from-amber-300 to-pink-500'
                  : 'bg-gradient-to-b from-cyan-400 to-indigo-500'
              }`}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold tracking-[0.14em] text-cyan-300">
                PUNTOS
              </span>
              <span className="font-mono-num text-[10px] font-bold text-amber-300 tabular-nums">
                x{stats.currentMultiplier.toFixed(1)} · {stats.accuracy.toFixed(0)}%
              </span>
            </div>
            <div className="font-mono-num text-xl sm:text-3xl font-bold text-white leading-tight tabular-nums">
              {stats.score.toLocaleString('es-ES')}
            </div>

            {/* Fever Charge / Active Duration Bar */}
            <div className="mt-1.5">
              <div className="flex items-center justify-between text-[9px] font-bold tracking-wider mb-0.5">
                <span
                  className={`flex items-center gap-1 ${
                    stats.feverActive ? 'text-amber-300' : 'text-slate-400'
                  }`}
                >
                  <Flame className="w-3 h-3" />
                  {stats.feverActive ? `FEVER x${stats.feverMultiplier.toFixed(1)}` : 'FEVER'}
                </span>
                <span className="font-mono-num text-slate-300">
                  {stats.feverActive
                    ? `${stats.feverRemainingSec.toFixed(1)}s`
                    : `${Math.round(feverPct)}%`}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-sm bg-slate-900 overflow-hidden">
                <div
                  className={`h-full transition-all duration-100 ${
                    stats.feverActive
                      ? 'bg-gradient-to-r from-amber-300 via-rose-400 to-fuchsia-400'
                      : 'bg-gradient-to-r from-cyan-500 to-amber-400'
                  }`}
                  style={{ width: `${feverPct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-[#050818]/84 border border-indigo-400/25 rounded-xl px-2.5 py-1.5">
            {song.coverArtDataUrl ? (
              <img
                src={song.coverArtDataUrl}
                alt={song.title}
                referrerPolicy="no-referrer"
                className="w-6 h-6 rounded-lg object-cover shrink-0 border border-cyan-300/30"
              />
            ) : (
              <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center shrink-0">
                <Disc3 className="w-3.5 h-3.5 text-cyan-300" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-white truncate">{song.title}</div>
              <div className="text-[9px] text-slate-300 truncate">
                {laneCount} carriles · {stats.currentSection.toUpperCase()}
              </div>
            </div>
          </div>
        </div>

        {/* Top-Center: Combo + Perfect Chain + Judgment + Precision Challenge Notice */}
        <div className="flex flex-col items-center pt-0.5 text-center min-w-[90px]">
          {stats.feverActive && (
            <div className="px-2.5 py-0.5 mb-1 rounded-md bg-amber-500/25 border border-amber-300/70 text-[10px] font-display font-bold tracking-[0.2em] text-amber-200 animate-pulse">
              FEVER MODE
            </div>
          )}

          {stats.precisionChallengeActive && (
            <div className="px-2 py-0.5 mb-1 rounded-md bg-rose-500/20 border border-rose-400/60 text-[9px] font-bold tracking-wider text-rose-200 flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" />
              PRECISIÓN ESTRICTA
            </div>
          )}

          {stats.combo > 0 && (
            <div>
              <div className="text-[10px] font-bold tracking-[0.2em] text-cyan-200/90">COMBO</div>
              <div className="font-display italic font-bold text-3xl sm:text-5xl text-transparent bg-clip-text bg-gradient-to-b from-white via-cyan-200 to-fuchsia-400 tabular-nums leading-none">
                x{stats.combo}
              </div>
            </div>
          )}

          {stats.perfectChain >= 3 && (
            <div className="mt-1 flex items-center gap-1 text-[10px] font-mono-num font-bold text-cyan-300">
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>PERFECT x{stats.perfectChain}</span>
            </div>
          )}

          {stats.lastJudgment && (
            <div
              key={stats.lastJudgment.id}
              className={`mt-1.5 font-display italic font-bold text-sm sm:text-base tracking-wider ${judgmentColor}`}
            >
              {stats.lastJudgment.label}
            </div>
          )}
        </div>

        {/* Top-Right: Pause + Fault Monitor */}
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={onPause}
            className="pointer-events-auto min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#050818]/88 border border-cyan-400/45 hover:border-cyan-300 text-white active:scale-95 transition-all cursor-pointer"
            aria-label="Pausar partida"
          >
            <Pause className="w-5 h-5 text-cyan-200" />
          </button>

          <div className="relative bg-[#050818]/88 border border-rose-400/35 rounded-xl px-3 py-1.5 flex flex-col items-end overflow-hidden">
            <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-rose-400 to-fuchsia-500" />
            <div className="text-[10px] font-bold tracking-[0.12em] text-slate-300">
              FALLOS{' '}
              <span
                className={`font-mono-num tabular-nums ${
                  stats.maxMisses < 999 && stats.misses >= Math.max(1, stats.maxMisses - 1)
                    ? 'text-rose-400'
                    : 'text-white'
                }`}
              >
                {stats.misses} / {maxMissesDisplay}
              </span>
            </div>
            {shieldSlots > 0 && (
              <div className="flex items-center gap-1 mt-1">
                {Array.from({ length: shieldSlots }).map((_, idx) => {
                  const isFaulted = idx < stats.misses;
                  return (
                    <span
                      key={idx}
                      className={`w-2.5 h-2 rounded-sm border transition-all ${
                        isFaulted
                          ? 'bg-rose-500 border-rose-200 shadow-[0_0_8px_rgba(244,63,94,0.9)]'
                          : 'bg-slate-900/90 border-cyan-400/35'
                      }`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom N-Lane Multi-Touch / Slide / Flick Arena */}
      <div
        ref={arenaRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUpOrCancel}
        onPointerCancel={handlePointerUpOrCancel}
        style={{ gridTemplateColumns: `repeat(${laneCount}, minmax(0, 1fr))` }}
        className="w-full h-[46vh] max-w-5xl mx-auto grid gap-1 px-1.5 sm:px-6 pb-3 pointer-events-auto touch-none"
      >
        {Array.from({ length: laneCount }).map((_, lane) => {
          const isPressed =
            Boolean(touchPressed[lane]) || Boolean(externalPressedLanes?.[lane]);
          const isCyan = lane % 2 === 0;
          return (
            <div
              key={lane}
              className={`relative flex flex-col items-center justify-end pb-2.5 rounded-xl border transition-colors ${
                isPressed
                  ? isCyan
                    ? 'bg-cyan-400/20 border-cyan-300/85 shadow-[inset_0_-18px_28px_rgba(34,211,238,0.22)]'
                    : 'bg-fuchsia-400/20 border-fuchsia-300/85 shadow-[inset_0_-18px_28px_rgba(232,121,249,0.22)]'
                  : 'bg-transparent border-white/8'
              }`}
            >
              <span
                className={`text-[10px] sm:text-[11px] font-mono-num font-bold px-2 py-0.5 rounded-md border tracking-wider transition-all ${
                  isPressed
                    ? isCyan
                      ? 'bg-cyan-500/35 border-cyan-200 text-white'
                      : 'bg-fuchsia-500/35 border-fuchsia-200 text-white'
                    : 'bg-[#050818]/75 border-cyan-400/20 text-slate-300'
                }`}
              >
                {keyLabels[lane]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
