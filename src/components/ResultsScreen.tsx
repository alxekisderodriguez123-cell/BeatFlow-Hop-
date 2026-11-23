import React from 'react';
import { Crown, Home, RefreshCw, RotateCcw, Star } from 'lucide-react';
import type { GameResult } from '../types/game';
import { DIFFICULTY_LABELS } from '../game/presets';

interface ResultsScreenProps {
  result: GameResult;
  onRetryNewSeed: () => void;
  onRetrySameSeed: () => void;
  onBackToMenu: () => void;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  result,
  onRetryNewSeed,
  onRetrySameSeed,
  onBackToMenu,
}) => {
  const isVictory = result.completed;
  const b = result.breakdown;

  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 overflow-y-auto ${
        isVictory
          ? 'bg-gradient-to-b from-[#07153a]/95 via-[#070b22]/96 to-[#050714]/98'
          : 'bg-gradient-to-b from-[#2b0718]/95 via-[#130618]/96 to-[#050714]/98'
      }`}
    >
      <div
        className={`w-full max-w-md rounded-3xl p-5 sm:p-6 border my-auto ${
          isVictory
            ? 'bg-[#091230]/95 border-cyan-400/45 shadow-[0_0_50px_rgba(34,211,238,0.28)]'
            : 'bg-[#170918]/95 border-rose-500/45 shadow-[0_0_50px_rgba(244,63,94,0.28)]'
        }`}
      >
        {/* Header Status */}
        <div className="flex flex-col items-center text-center mb-4">
          {isVictory ? (
            <>
              <div className="w-11 h-11 rounded-2xl bg-amber-400/15 border border-amber-300/50 flex items-center justify-center mb-2">
                <Crown className="w-6 h-6 text-amber-300" />
              </div>
              <h2 className="font-display italic font-bold text-3xl text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-cyan-300">
                ¡COMPLETADO!
              </h2>
            </>
          ) : (
            <>
              <h2 className="font-display italic font-bold text-3xl text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-red-400 to-fuchsia-400">
                GAME OVER
              </h2>
              <p className="text-xs font-medium text-rose-200/90 mt-1">
                Alcanzaste el límite de {result.maxMisses} fallos
              </p>
            </>
          )}

          <p className="text-xs text-slate-300 mt-1 truncate max-w-full">
            {result.song.title} · {result.song.artist}
          </p>
          <p className="text-[11px] font-mono-num text-cyan-300/90 mt-0.5">
            {DIFFICULTY_LABELS[result.difficulty] ?? result.difficulty} · {result.laneCount} Carriles · {result.modifierLabel}
          </p>

          {(result.isNewRecord || result.isNewVariantRecord) && (
            <div className="mt-2 px-3 py-1 rounded-md bg-amber-400/15 border border-amber-300/50 text-[11px] font-bold text-amber-300">
              {result.isNewRecord ? '¡NUEVO RÉCORD PERSONAL!' : '¡RÉCORD EN ESTA MODALIDAD!'}
            </div>
          )}
        </div>

        {/* Stars */}
        {isVictory && (
          <div className="flex items-center justify-center gap-3 mb-4">
            {[1, 2, 3].map((s) => (
              <Star
                key={s}
                className={`w-8 h-8 ${
                  s <= result.stars
                    ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.75)]'
                    : 'text-slate-700'
                }`}
              />
            ))}
          </div>
        )}

        {/* Primary Stats */}
        <div
          className={`rounded-2xl p-3.5 border mb-4 space-y-2 ${
            isVictory
              ? 'bg-slate-950/80 border-cyan-400/25'
              : 'bg-black/55 border-rose-400/25'
          }`}
        >
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-300">Puntuación</span>
            <span className="font-mono-num font-bold text-lg text-white">
              {result.score.toLocaleString('es-ES')}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300">Precisión / Combo Máx.</span>
            <span className="font-mono-num font-bold text-cyan-300">
              {result.accuracy.toFixed(1)}% · x{result.maxCombo}
            </span>
          </div>

          {/* Judgment Breakdown Grid */}
          <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-white/10 text-center">
            <div className="rounded-lg bg-slate-900/90 py-1.5">
              <div className="text-[9px] font-bold text-cyan-300">PERFECT</div>
              <div className="font-mono-num text-xs font-bold text-white">{b.perfectCount}</div>
            </div>
            <div className="rounded-lg bg-slate-900/90 py-1.5">
              <div className="text-[9px] font-bold text-emerald-300">GOOD</div>
              <div className="font-mono-num text-xs font-bold text-white">{b.goodCount}</div>
            </div>
            <div className="rounded-lg bg-slate-900/90 py-1.5">
              <div className="text-[9px] font-bold text-amber-300">OK</div>
              <div className="font-mono-num text-xs font-bold text-white">{b.okCount}</div>
            </div>
            <div className="rounded-lg bg-slate-900/90 py-1.5">
              <div className="text-[9px] font-bold text-rose-400">MISS</div>
              <div className="font-mono-num text-xs font-bold text-rose-300">{result.misses}</div>
            </div>
          </div>

          {/* Advanced Mechanics Breakdown */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-2 border-t border-white/10 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-400">Perfect Chain máx.</span>
              <span className="font-mono-num text-cyan-300">x{b.maxPerfectChain}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Fever activado</span>
              <span className="font-mono-num text-amber-300">{b.feverActivations}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Hold (ok/roto)</span>
              <span className="font-mono-num text-slate-200">
                {b.holdsCompleted}/{b.holdsBroken}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Flick / Slide</span>
              <span className="font-mono-num text-slate-200">
                {b.flicksHit} / {b.slidesCompleted}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Acordes / Mult. med.</span>
              <span className="font-mono-num text-slate-200">
                {b.chordsHit} · x{b.avgMultiplier.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Tiempo / Semilla</span>
              <span className="font-mono-num text-slate-300">
                {formatTime(result.durationPlayed)} · {result.seed}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onRetryNewSeed}
              className="min-h-[46px] px-3 rounded-2xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-fuchsia-600 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span>{isVictory ? 'Volver a jugar' : 'Intentar de nuevo'}</span>
            </button>

            <button
              type="button"
              onClick={onRetrySameSeed}
              className="min-h-[46px] px-3 rounded-2xl bg-slate-900 border border-cyan-400/35 hover:border-cyan-300 text-slate-100 font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 shrink-0 text-cyan-300" />
              <span>Misma semilla</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onBackToMenu}
            className="min-h-[44px] w-full rounded-2xl bg-slate-950/90 border border-slate-700 hover:border-slate-500 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Volver al menú</span>
          </button>
        </div>
      </div>
    </div>
  );
};
