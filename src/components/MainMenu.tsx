import React, { useEffect, useRef, useState } from 'react';
import {
  Crown,
  Disc3,
  Globe,
  Music,
  Pause,
  Play,
  Settings,
  Trophy,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react';
import { BeatflowLogo } from './BeatflowLogo';
import { menuAmbientAudio } from '../services/menuAmbientAudio';
import type { MenuAmbientConfig, SongMetadata } from '../types/game';

interface MainMenuProps {
  bestScore: number;
  selectedSong: SongMetadata | null;
  songCount: number;
  menuAmbientConfig?: MenuAmbientConfig;
  reducedMotion?: boolean;
  onPlayClick: () => void;
  onToggleMenuMusic?: () => void;
  onToggleMenuMusicPause?: () => void;
  onParallaxChange?: (nx: number, ny: number) => void;
  onNavigate: (screen: 'music' | 'records' | 'settings' | 'creator' | 'community') => void;
}

const SPARKS = [
  { left: '12%', bottom: '16%', delay: '0s', dur: '5.5s', color: 'bg-cyan-300' },
  { left: '24%', bottom: '28%', delay: '1.2s', dur: '6.2s', color: 'bg-fuchsia-400' },
  { left: '78%', bottom: '22%', delay: '0.7s', dur: '5.8s', color: 'bg-cyan-400' },
  { left: '86%', bottom: '36%', delay: '2.1s', dur: '6.4s', color: 'bg-pink-400' },
  { left: '42%', bottom: '12%', delay: '1.7s', dur: '5.1s', color: 'bg-indigo-300' },
  { left: '64%', bottom: '18%', delay: '0.4s', dur: '6.6s', color: 'bg-amber-300' },
];

export const MainMenu: React.FC<MainMenuProps> = ({
  bestScore,
  selectedSong,
  songCount,
  menuAmbientConfig,
  reducedMotion = false,
  onPlayClick,
  onToggleMenuMusic,
  onToggleMenuMusicPause,
  onParallaxChange,
  onNavigate,
}) => {
  const animationsOn = (menuAmbientConfig?.menuAnimationsEnabled ?? true) && !reducedMotion;
  const ambientMusicOn = menuAmbientConfig?.musicEnabled ?? true;
  const isCustomMenuTrack =
    menuAmbientConfig?.sourceMode === 'custom' && Boolean(menuAmbientConfig?.customTrackName);
  const customPaused = Boolean(menuAmbientConfig?.customPaused);

  const [bars, setBars] = useState<number[]>([0.22, 0.35, 0.45, 0.38, 0.3, 0.24]);
  const [energy, setEnergy] = useState(0.24);
  const [hudOffset, setHudOffset] = useState({ x: 0, y: 0 });
  const rafRef = useRef(0);
  const lastSampleRef = useRef(0);

  useEffect(() => {
    if (!animationsOn) {
      setBars([0.2, 0.28, 0.35, 0.3, 0.25, 0.18]);
      setEnergy(0.2);
      return;
    }

    const step = (now: number) => {
      if (now - lastSampleRef.current >= 55) {
        lastSampleRef.current = now;
        const bands = menuAmbientAudio.getAmbientBands(now * 0.001);
        setBars([
          bands.subBass,
          bands.bass,
          bands.lowMid,
          bands.mid,
          bands.highMid,
          bands.treble,
        ]);
        setEnergy(bands.energy);
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animationsOn]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!animationsOn) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    onParallaxChange?.(nx, ny);
    setHudOffset({ x: nx * -3.5, y: ny * -2.5 });
  };

  const handlePointerLeave = () => {
    onParallaxChange?.(0, 0);
    setHudOffset({ x: 0, y: 0 });
  };

  return (
    <div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative z-10 flex flex-col justify-between w-full h-full px-5 py-5 sm:px-8 sm:py-7"
    >
      {/* Lightweight ambient HUD sparks (no backdrop blur over WebGL) */}
      {animationsOn && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {SPARKS.map((sp, i) => (
            <span
              key={i}
              className={`absolute w-1.5 h-1.5 rounded-full ${sp.color} opacity-60`}
              style={{
                left: sp.left,
                bottom: sp.bottom,
                animation: `bf-spark-rise ${sp.dur} ease-out ${sp.delay} infinite`,
              }}
            />
          ))}
          {/* Subtle holographic corner frame accents */}
          <span className="hidden sm:block absolute top-4 left-4 w-7 h-7 border-t-2 border-l-2 border-cyan-400/40 rounded-tl-md" />
          <span className="hidden sm:block absolute top-4 right-4 w-7 h-7 border-t-2 border-r-2 border-fuchsia-400/40 rounded-tr-md" />
          <span className="hidden sm:block absolute bottom-4 left-4 w-7 h-7 border-b-2 border-l-2 border-cyan-400/35 rounded-bl-md" />
          <span className="hidden sm:block absolute bottom-4 right-4 w-7 h-7 border-b-2 border-r-2 border-fuchsia-400/35 rounded-br-md" />
        </div>
      )}

      {/* Top Bar: Personal Best, Quick Ambient Audio Mute & Settings */}
      <div className="relative z-10 flex items-center justify-between w-full max-w-5xl mx-auto">
        <button
          type="button"
          onClick={() => onNavigate('records')}
          className="relative flex items-center gap-2.5 min-h-[44px] px-4 py-2 rounded-xl bg-[#050818]/92 border border-cyan-400/45 hover:border-cyan-300 hover:-translate-y-0.5 active:scale-[0.98] shadow-[0_0_20px_rgba(34,211,238,0.2)] transition-all cursor-pointer overflow-hidden"
          aria-label="Récord personal"
        >
          <span className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-300 to-cyan-400" />
          <Crown className="w-4 h-4 text-amber-300 shrink-0" />
          <span className="text-xs text-cyan-200/90 font-semibold tracking-wider">RÉCORD</span>
          <span className="font-mono-num text-sm font-bold text-white tabular-nums">
            {bestScore.toLocaleString('es-ES')}
          </span>
        </button>

        <div className="flex items-center gap-2">
          {isCustomMenuTrack && ambientMusicOn && onToggleMenuMusicPause && (
            <button
              type="button"
              onClick={onToggleMenuMusicPause}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl bg-[#050818]/92 border border-fuchsia-400/40 hover:border-fuchsia-300 text-fuchsia-200 hover:text-white shadow-[0_0_14px_rgba(217,70,239,0.2)] transition-all cursor-pointer"
              aria-label={
                customPaused
                  ? 'Reproducir pista ambiental personalizada'
                  : 'Pausar pista ambiental personalizada'
              }
              title={menuAmbientConfig?.customTrackName}
            >
              {customPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
            </button>
          )}

          {onToggleMenuMusic && (
            <button
              type="button"
              onClick={onToggleMenuMusic}
              className="flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl bg-[#050818]/92 border border-cyan-400/35 hover:border-cyan-300/80 text-slate-200 hover:text-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.16)] transition-all cursor-pointer"
              aria-label={ambientMusicOn ? 'Silenciar música ambiental del menú' : 'Activar música ambiental del menú'}
              title={
                isCustomMenuTrack
                  ? menuAmbientConfig?.customTrackName
                  : ambientMusicOn
                    ? 'Música del menú activa'
                    : 'Música del menú silenciada'
              }
            >
              {ambientMusicOn ? (
                <Volume2 className="w-4 h-4 text-cyan-300" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" />
              )}
              <span className="hidden sm:inline text-[11px] font-semibold tracking-wide max-w-[110px] truncate">
                {ambientMusicOn
                  ? isCustomMenuTrack
                    ? menuAmbientConfig?.customTrackName
                    : 'Ambiente'
                  : 'Silencio'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl bg-[#050818]/92 border border-indigo-400/40 hover:border-cyan-400/80 hover:-translate-y-0.5 active:scale-[0.97] text-slate-200 hover:text-cyan-300 shadow-[0_0_16px_rgba(99,102,241,0.24)] transition-all cursor-pointer"
            aria-label="Configuración"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Center Lockup & Navigation Stack with Subtle Parallax */}
      <div
        className="relative z-10 flex flex-col items-center justify-center w-full max-w-sm sm:max-w-md mx-auto gap-3.5 my-auto transition-transform duration-150 ease-out"
        style={{
          transform: animationsOn
            ? `translate3d(${hudOffset.x.toFixed(1)}px, ${hudOffset.y.toFixed(1)}px, 0)`
            : undefined,
        }}
      >
        <BeatflowLogo
          energy={energy}
          animate={menuAmbientConfig?.menuAnimationsEnabled ?? true}
          reducedMotion={reducedMotion}
        />

        {/* Ambient Neon Equalizer Telemetry Bar */}
        <div className="flex items-end justify-center gap-1 h-4 px-3" aria-hidden="true">
          {bars.map((val, idx) => {
            const hPct = Math.round(24 + Math.min(1, Math.max(0, val)) * 76);
            const barCol =
              idx < 2 ? 'bg-cyan-400' : idx < 4 ? 'bg-indigo-400' : 'bg-fuchsia-400';
            return (
              <span
                key={idx}
                className={`w-1.5 rounded-full ${barCol} transition-[height] duration-75`}
                style={{ height: `${hPct}%`, opacity: ambientMusicOn ? 0.88 : 0.3 }}
              />
            );
          })}
        </div>

        {/* Active Song Futuristic Telemetry Strip */}
        {selectedSong ? (
          <button
            type="button"
            onClick={() => onNavigate('music')}
            className="relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-[#050818]/92 border border-cyan-400/45 hover:border-cyan-300 hover:-translate-y-0.5 active:scale-[0.99] shadow-[0_0_24px_rgba(34,211,238,0.18)] transition-all text-left cursor-pointer overflow-hidden"
          >
            <span className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-400 via-indigo-400 to-fuchsia-400" />
            {selectedSong.coverArtDataUrl ? (
              <img
                src={selectedSong.coverArtDataUrl}
                alt={selectedSong.title}
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-lg object-cover shrink-0 border border-cyan-300/35"
              />
            ) : (
              <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-cyan-500/25 to-fuchsia-500/25 border border-cyan-300/30 flex items-center justify-center shrink-0">
                <Disc3 className="w-5 h-5 text-cyan-300" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-cyan-300">
                <span>PISTA ACTIVA</span>
                {selectedSong.profile?.bpm ? (
                  <span className="font-mono-num text-fuchsia-300">
                    {Math.round(selectedSong.profile.bpm)} BPM
                  </span>
                ) : null}
              </div>
              <div className="text-sm font-bold text-white truncate">
                {selectedSong.title} ·{' '}
                <span className="font-normal text-slate-300">{selectedSong.artist}</span>
              </div>
            </div>
            <span className="text-xs font-bold tracking-wide text-fuchsia-300 shrink-0">
              Cambiar
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate('music')}
            className="w-full text-xs text-slate-100 bg-[#050818]/92 hover:bg-[#0b112b] border border-cyan-400/30 hover:border-cyan-300/70 rounded-xl px-4 py-2.5 text-center transition-colors cursor-pointer"
          >
            {songCount > 0
              ? `${songCount} canciones listas en Mi Música`
              : 'Importa tus archivos MP3 locales en Mi Música para comenzar'}
          </button>
        )}

        {/* Primary Play CTA + Futuristic Menu Stack */}
        <div
          className={`flex flex-col w-full gap-2.5 ${animationsOn ? 'bf-fade-up' : ''}`}
          style={animationsOn ? { animationDelay: '90ms' } : undefined}
        >
          <button
            type="button"
            onClick={onPlayClick}
            className="group relative w-full min-h-[56px] flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-fuchsia-600 hover:brightness-110 hover:-translate-y-0.5 active:scale-[0.98] transition-all text-white font-display font-bold text-xl tracking-[0.14em] shadow-[0_0_34px_rgba(34,211,238,0.48),0_0_26px_rgba(217,70,239,0.38)] border border-cyan-200/50 cursor-pointer overflow-hidden"
          >
            <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/85 to-transparent" />
            {animationsOn && (
              <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent bf-scan-sheen" />
            )}
            <Play className="w-6 h-6 fill-white drop-shadow-[0_0_8px_rgba(255,255,255,0.85)] transition-transform group-hover:scale-110" />
            <span>JUGAR</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('music')}
            className="relative w-full min-h-[48px] flex items-center justify-center gap-3 rounded-xl bg-[#050818]/92 hover:bg-[#0b112b] border border-cyan-400/35 hover:border-cyan-300/85 hover:-translate-y-0.5 active:scale-[0.99] transition-all text-slate-100 font-semibold text-base shadow-[0_0_16px_rgba(6,182,212,0.14)] cursor-pointer"
          >
            <Music className="w-5 h-5 text-cyan-400" />
            <span>Mi Música</span>
            {songCount > 0 && (
              <span className="text-xs font-mono-num text-cyan-300 tabular-nums">({songCount})</span>
            )}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onNavigate('creator')}
              className="relative min-h-[46px] flex items-center justify-center gap-2 rounded-xl bg-[#050818]/92 hover:bg-[#0b112b] border border-cyan-400/35 hover:border-cyan-300/85 hover:-translate-y-0.5 active:scale-[0.99] transition-all text-slate-100 font-semibold text-sm shadow-[0_0_16px_rgba(34,211,238,0.16)] cursor-pointer"
            >
              <Wrench className="w-4 h-4 text-cyan-300" />
              <span>BeatFlow Creator</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('community')}
              className="relative min-h-[46px] flex items-center justify-center gap-2 rounded-xl bg-[#050818]/92 hover:bg-[#0b112b] border border-fuchsia-400/35 hover:border-fuchsia-300/85 hover:-translate-y-0.5 active:scale-[0.99] transition-all text-slate-100 font-semibold text-sm shadow-[0_0_16px_rgba(217,70,239,0.16)] cursor-pointer"
            >
              <Globe className="w-4 h-4 text-fuchsia-300" />
              <span>Comunidad</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onNavigate('records')}
              className="relative min-h-[46px] flex items-center justify-center gap-2 rounded-xl bg-[#050818]/92 hover:bg-[#0b112b] border border-indigo-400/35 hover:border-indigo-300/85 hover:-translate-y-0.5 active:scale-[0.99] transition-all text-slate-100 font-semibold text-sm shadow-[0_0_16px_rgba(99,102,241,0.14)] cursor-pointer"
            >
              <Trophy className="w-4 h-4 text-amber-300" />
              <span>Récords</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="relative min-h-[46px] flex items-center justify-center gap-2 rounded-xl bg-[#050818]/92 hover:bg-[#0b112b] border border-fuchsia-400/35 hover:border-fuchsia-300/85 hover:-translate-y-0.5 active:scale-[0.99] transition-all text-slate-100 font-semibold text-sm shadow-[0_0_16px_rgba(217,70,239,0.14)] cursor-pointer"
            >
              <Settings className="w-4 h-4 text-fuchsia-400" />
              <span>Configuración</span>
            </button>
          </div>
        </div>
      </div>

      {/* Subtle Bottom Control Hint */}
      <div className="relative z-10 text-center text-xs font-medium text-cyan-100/80 tracking-wider drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
        Toca los carriles, haz clic o usa teclado D · F · J · K · Esc Pausa
      </div>
    </div>
  );
};
