import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Crown,
  Disc3,
  Home,
  Music,
  Settings,
  Trash2,
  Trophy,
} from 'lucide-react';
import { clearAllRecords, loadAllSongStats } from '../services/recordsStorage';
import { DIFFICULTY_LABELS } from '../game/presets';

interface RecordsViewProps {
  onNavigate: (screen: 'menu' | 'music' | 'records' | 'settings') => void;
}

export const RecordsView: React.FC<RecordsViewProps> = ({ onNavigate }) => {
  const [version, setVersion] = useState(0);
  const [expandedSongId, setExpandedSongId] = useState<string | null>(null);

  const statsList = useMemo(() => {
    const all = loadAllSongStats();
    return Object.values(all).sort((a, b) => b.bestScore - a.bestScore);
  }, [version]);

  const summary = useMemo(() => {
    let bestScore = 0;
    let bestCombo = 0;
    let totalPlays = 0;
    let totalCompletions = 0;
    for (const s of statsList) {
      if (s.bestScore > bestScore) bestScore = s.bestScore;
      if (s.bestCombo > bestCombo) bestCombo = s.bestCombo;
      totalPlays += s.playCount;
      totalCompletions += s.completions;
    }
    return { bestScore, bestCombo, totalPlays, totalCompletions };
  }, [statsList]);

  const handleClear = () => {
    clearAllRecords();
    setVersion((v) => v + 1);
  };

  return (
    <div className="relative z-10 flex flex-col w-full h-full bg-[#060919]/94">
      <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-cyan-500/20 bg-slate-950/90 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('menu')}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-200 hover:text-cyan-300 hover:bg-slate-800/70 cursor-pointer"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-lg sm:text-xl text-white">
            Récords y Estadísticas
          </h1>
        </div>

        {statsList.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="min-h-[44px] px-3 flex items-center gap-1.5 rounded-xl text-xs font-semibold text-rose-300 hover:bg-rose-500/15 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Reiniciar</span>
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto beatflow-scroll px-4 sm:px-6 py-4">
        <div className="max-w-4xl mx-auto space-y-5">
          {/* Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-950/85 border border-amber-400/30">
              <div className="text-xs text-slate-400">Mejor Puntuación</div>
              <div className="font-mono-num text-xl font-bold text-amber-300 mt-1">
                {summary.bestScore.toLocaleString('es-ES')}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-950/85 border border-cyan-400/30">
              <div className="text-xs text-slate-400">Combo Máximo</div>
              <div className="font-mono-num text-xl font-bold text-cyan-300 mt-1">
                x{summary.bestCombo}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-950/85 border border-fuchsia-400/30">
              <div className="text-xs text-slate-400">Partidas Jugadas</div>
              <div className="font-mono-num text-xl font-bold text-fuchsia-300 mt-1">
                {summary.totalPlays}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-950/85 border border-indigo-400/30">
              <div className="text-xs text-slate-400">Completadas</div>
              <div className="font-mono-num text-xl font-bold text-indigo-300 mt-1">
                {summary.totalCompletions}
              </div>
            </div>
          </div>

          {/* Per-song Stats with Differentiated Modality Records */}
          {statsList.length === 0 ? (
            <div className="text-center py-14 px-6 rounded-3xl bg-slate-950/70 border border-slate-800">
              <Crown className="w-10 h-10 text-amber-400/70 mx-auto mb-3" />
              <h2 className="font-display font-bold text-lg text-white">
                Aún no hay récords registrados
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Completa o juega cualquier canción de tu biblioteca para guardar aquí tus
                puntuaciones por dificultad, carriles y modificadores.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <h2 className="text-xs font-semibold tracking-wider text-slate-400">
                RÉCORDS POR CANCIÓN Y MODALIDAD
              </h2>
              {statsList.map((item, idx) => {
                const variants = Object.values(item.variants ?? {}).sort(
                  (a, b) => b.bestScore - a.bestScore,
                );
                const isExpanded = expandedSongId === item.songId;

                return (
                  <div
                    key={item.songId}
                    className="rounded-2xl bg-slate-950/88 border border-slate-800 overflow-hidden"
                  >
                    <div
                      onClick={() =>
                        variants.length > 0 &&
                        setExpandedSongId(isExpanded ? null : item.songId)
                      }
                      className={`flex items-center gap-3 p-3 ${
                        variants.length > 0 ? 'cursor-pointer hover:bg-slate-900/60' : ''
                      }`}
                    >
                      <div className="font-mono-num text-sm font-bold text-cyan-300 w-6 text-center shrink-0">
                        #{idx + 1}
                      </div>
                      {item.coverArtDataUrl ? (
                        <img
                          src={item.coverArtDataUrl}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-xl object-cover shrink-0 border border-white/10"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center shrink-0">
                          <Disc3 className="w-5 h-5 text-cyan-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-white truncate">{item.title}</div>
                        <div className="text-xs text-slate-400 truncate">
                          {item.artist} · {item.playCount} partidas · {item.completions} completadas
                          {item.bestMaxPerfectChain
                            ? ` · Chain x${item.bestMaxPerfectChain}`
                            : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-2">
                        <div>
                          <div className="font-mono-num text-sm font-bold text-amber-300">
                            {item.bestScore.toLocaleString('es-ES')}
                          </div>
                          <div className="font-mono-num text-[11px] text-slate-300">
                            x{item.bestCombo} · {item.bestAccuracy.toFixed(1)}%
                          </div>
                        </div>
                        {variants.length > 0 &&
                          (isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          ))}
                      </div>
                    </div>

                    {isExpanded && variants.length > 0 && (
                      <div className="px-3 pb-3 pt-1 border-t border-slate-800/80 space-y-1.5 bg-slate-950/60">
                        {variants.map((v) => (
                          <div
                            key={v.variantKey}
                            className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs"
                          >
                            <div className="min-w-0">
                              <span className="font-bold text-cyan-300">
                                {DIFFICULTY_LABELS[v.difficulty] ?? v.difficulty} · {v.laneCount}K
                              </span>
                              <span className="text-slate-400 ml-2">{v.modifierLabel}</span>
                            </div>
                            <div className="font-mono-num text-right shrink-0">
                              <span className="font-bold text-amber-300">
                                {v.bestScore.toLocaleString('es-ES')}
                              </span>
                              <span className="text-slate-400 ml-2">
                                {v.bestAccuracy.toFixed(1)}% · x{v.bestCombo}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Tab Navigation */}
      <nav className="grid grid-cols-4 h-16 bg-slate-950/95 border-t border-cyan-500/20 shrink-0">
        <button
          type="button"
          onClick={() => onNavigate('menu')}
          className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-100 cursor-pointer"
        >
          <Home className="w-5 h-5" />
          <span className="text-[11px] font-medium">Inicio</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('music')}
          className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-100 cursor-pointer"
        >
          <Music className="w-5 h-5" />
          <span className="text-[11px] font-medium">Música</span>
        </button>
        <button
          type="button"
          className="flex flex-col items-center justify-center gap-1 text-amber-400 cursor-pointer"
        >
          <Trophy className="w-5 h-5" />
          <span className="text-[11px] font-semibold">Récords</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-100 cursor-pointer"
        >
          <Settings className="w-5 h-5" />
          <span className="text-[11px] font-medium">Config.</span>
        </button>
      </nav>
    </div>
  );
};
