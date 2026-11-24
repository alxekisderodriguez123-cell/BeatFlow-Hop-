import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Clock,
  Disc3,
  Heart,
  Home,
  Music,
  Pause,
  Play,
  Plus,
  Search,
  Settings,
  Trash2,
  Trophy,
  Upload,
} from 'lucide-react';
import type { SongMetadata } from '../types/game';
import { getSongBlob } from '../services/musicStorage';

interface MusicLibraryProps {
  songs: SongMetadata[];
  selectedSongId: string | null;
  importing: boolean;
  importProgressText: string;
  onImportFiles: (files: FileList | File[]) => void;
  onSelectSong: (song: SongMetadata) => void;
  onPlaySongSetup: (song: SongMetadata) => void;
  onToggleFavorite: (songId: string) => void;
  onRemoveSong: (songId: string) => void;
  onNavigate: (screen: 'menu' | 'music' | 'records' | 'settings') => void;
}

function formatDuration(sec: number): string {
  if (!sec || !Number.isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const MusicLibrary: React.FC<MusicLibraryProps> = ({
  songs,
  selectedSongId,
  importing,
  importProgressText,
  onImportFiles,
  onSelectSong,
  onPlaySongSetup,
  onToggleFavorite,
  onRemoveSong,
  onNavigate,
}) => {
  const [filter, setFilter] = useState<'all' | 'favorites' | 'recent'>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = '';
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewId(null);
  };

  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  const handleTogglePreview = async (e: React.MouseEvent, song: SongMetadata) => {
    e.stopPropagation();
    if (previewId === song.id) {
      stopPreview();
      return;
    }
    stopPreview();
    try {
      const blob = await getSongBlob(song.id);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      const audio = new Audio(url);
      audio.volume = 0.7;
      audio.onended = () => stopPreview();
      previewAudioRef.current = audio;
      setPreviewId(song.id);
      await audio.play();
    } catch {
      stopPreview();
    }
  };

  const filteredSongs = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = songs;

    if (filter === 'favorites') {
      list = list.filter((s) => s.isFavorite);
    } else if (filter === 'recent') {
      list = list
        .filter((s) => Boolean(s.lastPlayedAt))
        .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0));
    }

    if (q) {
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.fileName.toLowerCase().includes(q),
      );
    }
    return list;
  }, [songs, filter, query]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onImportFiles(e.dataTransfer.files);
    }
  };

  return (
    <div
      className="relative z-10 flex flex-col w-full h-full bg-[#060919]/92"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,audio/mpeg,audio/mp3,audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onImportFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {/* Top App Bar */}
      <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-cyan-500/20 bg-slate-950/90 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              stopPreview();
              onNavigate('menu');
            }}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-200 hover:text-cyan-300 hover:bg-slate-800/70 transition-colors cursor-pointer"
            aria-label="Volver al menú"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-lg sm:text-xl tracking-wide text-white">
            Mi Música
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
              searchOpen
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                : 'text-slate-300 hover:bg-slate-800/70'
            }`}
            aria-label="Buscar canciones"
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-3.5 flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-fuchsia-600 text-white text-xs sm:text-sm font-semibold hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Importar MP3</span>
          </button>
        </div>
      </header>

      {/* Optional Search Bar */}
      {searchOpen && (
        <div className="px-4 sm:px-6 py-2.5 bg-slate-950/75 border-b border-slate-800 shrink-0">
          <div className="max-w-5xl mx-auto relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título o artista..."
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-cyan-400"
              autoFocus
            />
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="px-4 sm:px-6 pt-3 pb-2 shrink-0">
        <div className="max-w-5xl mx-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`min-h-[40px] px-4 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              filter === 'all'
                ? 'bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white shadow-[0_0_14px_rgba(168,85,247,0.45)]'
                : 'bg-slate-900/90 text-slate-300 border border-slate-700/80 hover:border-slate-500'
            }`}
          >
            Todas ({songs.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('favorites')}
            className={`min-h-[40px] px-4 rounded-full text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              filter === 'favorites'
                ? 'bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white shadow-[0_0_14px_rgba(168,85,247,0.45)]'
                : 'bg-slate-900/90 text-slate-300 border border-slate-700/80 hover:border-slate-500'
            }`}
          >
            <Heart className="w-3.5 h-3.5" />
            <span>Favoritas</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter('recent')}
            className={`min-h-[40px] px-4 rounded-full text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              filter === 'recent'
                ? 'bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white shadow-[0_0_14px_rgba(168,85,247,0.45)]'
                : 'bg-slate-900/90 text-slate-300 border border-slate-700/80 hover:border-slate-500'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Recientes</span>
          </button>
        </div>
      </div>

      {/* Importing Banner */}
      {importing && (
        <div className="px-4 sm:px-6 pb-2 shrink-0">
          <div className="max-w-3xl mx-auto px-4 py-2.5 rounded-xl bg-cyan-950/70 border border-cyan-400/40 text-xs sm:text-sm text-cyan-200 flex items-center justify-between">
            <span>{importProgressText || 'Importando archivos de audio...'}</span>
            <span className="font-mono-num text-cyan-300">Cargando...</span>
          </div>
        </div>
      )}

      {/* Song List */}
      <div className="flex-1 overflow-y-auto beatflow-scroll px-4 sm:px-6 py-2">
        <div className="max-w-5xl mx-auto pb-4">
          {filteredSongs.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12 px-6 rounded-3xl bg-slate-950/70 border border-dashed border-cyan-500/35 mt-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/25 to-fuchsia-500/25 border border-cyan-400/40 flex items-center justify-center mb-4">
                <Upload className="w-8 h-8 text-cyan-300" />
              </div>
              <h2 className="font-display font-bold text-lg text-white mb-1">
                {songs.length === 0
                  ? 'Tu biblioteca local está vacía'
                  : 'Sin coincidencias en este filtro'}
              </h2>
              <p className="text-sm text-slate-300 max-w-md mb-5">
                {songs.length === 0
                  ? 'Selecciona o arrastra archivos MP3 de tu dispositivo. Se guardan localmente en tu navegador sin borrar ni modificar tus archivos originales.'
                  : 'Prueba con otra búsqueda o cambia de pestaña.'}
              </p>
              {songs.length === 0 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[48px] px-6 rounded-2xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-fuchsia-600 text-white font-semibold text-sm flex items-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                  <span>Importar archivos MP3</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {filteredSongs.map((song) => {
              const isSelected = song.id === selectedSongId;
              const isPreviewing = song.id === previewId;

              return (
                <div
                  key={song.id}
                  onClick={() => onSelectSong(song)}
                  className={`group flex items-center gap-3 p-2.5 sm:p-3 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900/95 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.22)]'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  {/* Cover art */}
                  {song.coverArtDataUrl ? (
                    <img
                      src={song.coverArtDataUrl}
                      alt={song.title}
                      referrerPolicy="no-referrer"
                      className="w-13 h-13 sm:w-14 sm:h-14 rounded-xl object-cover shrink-0 border border-white/15"
                    />
                  ) : (
                    <div
                      className="w-13 h-13 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center shrink-0 border border-white/15"
                      style={{
                        background: `linear-gradient(135deg, ${song.palette.primary}33, ${song.palette.secondary}33)`,
                      }}
                    >
                      <Disc3 className="w-7 h-7 text-cyan-300" />
                    </div>
                  )}

                  {/* Track info */}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm sm:text-base font-bold text-white truncate">
                      {song.title}
                    </div>
                    <div className="text-xs sm:text-sm text-slate-300 truncate">
                      {song.artist}
                      {song.profile?.bpm ? (
                        <span className="text-cyan-300"> · {song.profile.bpm} BPM</span>
                      ) : null}
                    </div>
                  </div>

                  {/* Duration + Actions */}
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <span className="font-mono-num text-xs text-slate-300 hidden sm:inline mr-1">
                      {formatDuration(song.duration)}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(song.id);
                      }}
                      className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
                        song.isFavorite
                          ? 'text-fuchsia-400 hover:bg-fuchsia-500/15'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
                      }`}
                      aria-label={song.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                    >
                      <Heart className={`w-4 h-4 ${song.isFavorite ? 'fill-fuchsia-400' : ''}`} />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleTogglePreview(e, song)}
                      className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
                        isPreviewing
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                          : 'text-slate-300 hover:bg-slate-800/70'
                      }`}
                      aria-label={isPreviewing ? 'Detener vista previa' : 'Reproducir vista previa'}
                      title="Reproducción de prueba"
                    >
                      {isPreviewing ? <Pause className="w-4 h-4" /> : <Music className="w-4 h-4" />}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (previewId === song.id) stopPreview();
                        onRemoveSong(song.id);
                      }}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      aria-label="Quitar de la biblioteca"
                      title="Quitar de la biblioteca (no borra el archivo original)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        stopPreview();
                        onPlaySongSetup(song);
                      }}
                      className="min-h-[44px] min-w-[44px] sm:px-3.5 flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-600 text-white font-semibold text-xs hover:brightness-110 active:scale-95 transition-all shadow-[0_0_16px_rgba(168,85,247,0.45)] cursor-pointer"
                      aria-label={`Jugar ${song.title}`}
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span className="hidden sm:inline">Jugar</span>
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          )}

          {songs.length > 0 && (
            <p className="text-[11px] text-slate-400 text-center pt-2">
              Tus canciones permanecen guardadas localmente. Eliminar una pista solo la quita de la lista del juego sin tocar el archivo original de tu dispositivo.
            </p>
          )}
        </div>
      </div>

      {/* Drag & drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-30 bg-cyan-950/85 border-2 border-dashed border-cyan-400 flex flex-col items-center justify-center pointer-events-none">
          <Upload className="w-12 h-12 text-cyan-300 mb-3" />
          <p className="font-display font-bold text-xl text-white">Suelta tus archivos MP3 aquí</p>
        </div>
      )}

      {/* Bottom Tab Navigation */}
      <nav className="grid grid-cols-4 h-16 bg-slate-950/95 border-t border-cyan-500/20 shrink-0">
        <button
          type="button"
          onClick={() => {
            stopPreview();
            onNavigate('menu');
          }}
          className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-100 cursor-pointer"
        >
          <Home className="w-5 h-5" />
          <span className="text-[11px] font-medium">Inicio</span>
        </button>
        <button
          type="button"
          className="flex flex-col items-center justify-center gap-1 text-fuchsia-400 cursor-pointer"
        >
          <Music className="w-5 h-5" />
          <span className="text-[11px] font-semibold">Música</span>
        </button>
        <button
          type="button"
          onClick={() => {
            stopPreview();
            onNavigate('records');
          }}
          className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-100 cursor-pointer"
        >
          <Trophy className="w-5 h-5" />
          <span className="text-[11px] font-medium">Récords</span>
        </button>
        <button
          type="button"
          onClick={() => {
            stopPreview();
            onNavigate('settings');
          }}
          className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-100 cursor-pointer"
        >
          <Settings className="w-5 h-5" />
          <span className="text-[11px] font-medium">Config.</span>
        </button>
      </nav>
    </div>
  );
};
