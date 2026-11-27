import React, { useRef } from 'react';
import {
  Disc3,
  Hand,
  Loader2,
  Music,
  Play,
  Shuffle,
  Sparkles,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import type { EnvironmentTheme, SongMetadata } from '../types/game';
import { ENVIRONMENT_OPTIONS } from '../game/environments/environmentSelector';

interface OnboardingTutorialModalProps {
  tutorialTheme: EnvironmentTheme;
  songs: SongMetadata[];
  selectedSongId: string | null;
  importing: boolean;
  importProgressText: string;
  analyzing: boolean;
  onSelectSong: (song: SongMetadata) => void;
  onImportFiles: (files: FileList | File[]) => void;
  onRerollScenario: () => void;
  onStartTutorial: (song: SongMetadata) => void;
  onSkip: () => void;
}

export const OnboardingTutorialModal: React.FC<OnboardingTutorialModalProps> = ({
  tutorialTheme,
  songs,
  selectedSongId,
  importing,
  importProgressText,
  analyzing,
  onSelectSong,
  onImportFiles,
  onRerollScenario,
  onStartTutorial,
  onSkip,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const envMeta =
    ENVIRONMENT_OPTIONS.find((o) => o.id === tutorialTheme) ??
    ENVIRONMENT_OPTIONS.find((o) => o.id === 'cyberpunk')!;

  const activeSong = songs.find((s) => s.id === selectedSongId) ?? songs[0] ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#020512]/72"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-modal-title"
    >
      <div className="w-full max-w-lg max-h-[92dvh] flex flex-col rounded-3xl bg-[#05091d]/96 border border-cyan-400/45 shadow-[0_0_45px_rgba(34,211,238,0.22)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cyan-500/20 bg-[#060b22] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/30 to-fuchsia-500/30 border border-cyan-400/50 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-[0.18em] text-cyan-300">
                BIENVENIDO A BEATFLOW HOP
              </div>
              <h2
                id="tutorial-modal-title"
                className="font-display font-bold text-base sm:text-lg text-white truncate"
              >
                Tutorial Rápido & Escenario 2.5D
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onSkip}
            disabled={analyzing}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/70 cursor-pointer shrink-0 disabled:opacity-40"
            aria-label="Omitir tutorial"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto beatflow-scroll px-5 py-4 space-y-4">
          {/* Random 2.5D Scenario Card */}
          <div className="rounded-2xl bg-[#08102a] border border-indigo-400/35 p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-[0.14em] text-indigo-300">
                ESCENARIO 2.5D ASIGNADO AL AZAR
              </div>
              <div className="font-display font-bold text-sm sm:text-base text-white mt-0.5 truncate">
                {envMeta.label}
              </div>
              <div className="text-xs text-slate-300 line-clamp-2 mt-0.5">
                {envMeta.subtitle}
              </div>
            </div>
            <button
              type="button"
              onClick={onRerollScenario}
              disabled={analyzing}
              className="min-h-[44px] px-3 rounded-xl bg-indigo-900/70 border border-cyan-400/40 text-cyan-200 text-xs font-semibold flex items-center gap-1.5 shrink-0 hover:border-cyan-300 cursor-pointer disabled:opacity-40"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Cambiar</span>
            </button>
          </div>

          {/* Core Mechanics & Controls Summary */}
          <div className="rounded-2xl bg-[#070d23] border border-slate-800 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] text-cyan-300">
              <Hand className="w-4 h-4" />
              <span>CÓMO JUGAR</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-2.5">
                <div className="font-semibold text-cyan-300">Tap & Acordes</div>
                <p className="text-slate-300 text-[11px] mt-0.5">
                  Toca el carril (o teclas D F J K) cuando la nota cruce la línea luminosa.
                </p>
              </div>
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-2.5">
                <div className="font-semibold text-fuchsia-300">Hold</div>
                <p className="text-slate-300 text-[11px] mt-0.5">
                  Mantén presionado el carril hasta que termine la cinta energética.
                </p>
              </div>
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-2.5">
                <div className="font-semibold text-amber-300">Flick</div>
                <p className="text-slate-300 text-[11px] mt-0.5">
                  Desliza rápido en la dirección de la flecha (o Shift / flechas).
                </p>
              </div>
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-2.5">
                <div className="font-semibold text-emerald-300">Slide</div>
                <p className="text-slate-300 text-[11px] mt-0.5">
                  Arrastra el dedo siguiendo la trayectoria continua entre carriles.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-400/25 rounded-xl px-3 py-2">
              <Zap className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>
                El tutorial se inicia en <strong>Modo Práctica (Fácil · 4K · Sin derrota)</strong> para que pruebes el ritmo sin presión.
              </span>
            </div>
          </div>

          {/* MP3 Import / Song Selection */}
          <div className="rounded-2xl bg-[#070d23] border border-cyan-500/30 p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] text-cyan-300">
                <Music className="w-4 h-4" />
                <span>TU CANCIÓN MP3 PARA EL TUTORIAL</span>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing || analyzing}
                className="min-h-[38px] px-3 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 text-xs font-semibold flex items-center gap-1.5 hover:bg-cyan-500/30 cursor-pointer disabled:opacity-50"
              >
                {importing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span>{importing ? 'Cargando...' : 'Cargar MP3'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,audio/mpeg,audio/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onImportFiles(e.target.files);
                    e.target.value = '';
                  }
                }}
              />
            </div>

            {importing && importProgressText && (
              <div className="text-xs text-cyan-300 font-medium">{importProgressText}</div>
            )}

            {songs.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="w-full min-h-[76px] rounded-xl border border-dashed border-cyan-400/50 bg-[#05091a] flex flex-col items-center justify-center gap-1 px-4 py-3 text-center hover:border-cyan-300 transition-colors cursor-pointer"
              >
                <Upload className="w-5 h-5 text-cyan-300" />
                <span className="text-xs sm:text-sm font-semibold text-white">
                  Selecciona un archivo MP3 de tu dispositivo
                </span>
                <span className="text-[11px] text-slate-400">
                  Se analizará automáticamente su ritmo, BPM y secciones para crear el nivel
                </span>
              </button>
            ) : (
              <div className="max-h-36 overflow-y-auto beatflow-scroll space-y-1.5 pr-1">
                {songs.map((song) => {
                  const selected = activeSong?.id === song.id;
                  return (
                    <button
                      key={song.id}
                      type="button"
                      onClick={() => onSelectSong(song)}
                      className={`w-full min-h-[46px] px-3 py-2 rounded-xl flex items-center gap-2.5 text-left border transition-colors cursor-pointer ${
                        selected
                          ? 'bg-cyan-500/18 border-cyan-400 text-white'
                          : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {song.coverArtDataUrl ? (
                        <img
                          src={song.coverArtDataUrl}
                          alt={song.title}
                          className="w-8 h-8 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                          <Disc3 className="w-4 h-4 text-cyan-300" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate">{song.title}</div>
                        <div className="text-[10px] text-slate-400 truncate">{song.artist}</div>
                      </div>
                      {selected && (
                        <span className="text-[10px] font-bold text-cyan-300 shrink-0">
                          LISTA
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-slate-800 bg-[#050819] flex flex-col sm:flex-row gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onSkip}
            disabled={analyzing}
            className="sm:w-1/3 min-h-[46px] rounded-xl bg-slate-900 border border-slate-700 text-slate-300 text-xs sm:text-sm font-semibold hover:text-white cursor-pointer disabled:opacity-40"
          >
            Omitir tutorial
          </button>
          <button
            type="button"
            disabled={!activeSong || importing || analyzing}
            onClick={() => activeSong && onStartTutorial(activeSong)}
            className="sm:flex-1 min-h-[46px] rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-500 to-fuchsia-600 text-white font-display font-bold text-sm tracking-wide flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(34,211,238,0.3)] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Analizando canción...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {activeSong
                    ? `Iniciar tutorial (${envMeta.label})`
                    : 'Carga un MP3 para iniciar'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
