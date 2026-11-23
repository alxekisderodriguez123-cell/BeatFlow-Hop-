import React from 'react';
import { Home, Play, RotateCcw, Settings } from 'lucide-react';

interface PauseModalProps {
  songTitle: string;
  onResume: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
  onExitToMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  songTitle,
  onResume,
  onRestart,
  onOpenSettings,
  onExitToMenu,
}) => {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-[#090e24] border border-cyan-400/35 p-6 shadow-[0_0_40px_rgba(34,211,238,0.2)]">
        <div className="text-center mb-6">
          <h2 className="font-display font-bold text-2xl text-white tracking-wide">
            PARTIDA EN PAUSA
          </h2>
          <p className="text-xs text-slate-300 truncate mt-1">{songTitle}</p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onResume}
            className="min-h-[48px] w-full rounded-2xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-fuchsia-600 text-white font-display font-bold text-base flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Play className="w-5 h-5 fill-white" />
            <span>Continuar</span>
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="min-h-[48px] w-full rounded-2xl bg-slate-900 border border-cyan-400/30 hover:border-cyan-300 text-slate-100 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-cyan-300" />
            <span>Reiniciar</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-[48px] w-full rounded-2xl bg-slate-900 border border-slate-700 hover:border-fuchsia-400/60 text-slate-100 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Settings className="w-4 h-4 text-fuchsia-300" />
            <span>Configuración</span>
          </button>

          <button
            type="button"
            onClick={onExitToMenu}
            className="min-h-[48px] w-full rounded-2xl bg-slate-950 border border-slate-800 hover:border-rose-400/50 text-slate-300 hover:text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Volver al menú</span>
          </button>
        </div>
      </div>
    </div>
  );
};
