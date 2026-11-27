import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Eye,
  FolderOpen,
  Globe,
  Music,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import type { DifficultyLevel, LaneCount, SongMetadata } from '../../types/game';
import type { BeatflowLevelDocument } from '../../types/creator';
import { getAllSongs, importMp3Files } from '../../services/musicStorage';

interface CreatorConfigModalProps {
  open: boolean;
  level: BeatflowLevelDocument;
  savedLevels: BeatflowLevelDocument[];
  loadingLevels?: boolean;
  zipBusy?: boolean;
  playbackVolume: number;
  hasLinkedAudio: boolean;
  onClose: () => void;
  onUpdateLevel: (updater: (prev: BeatflowLevelDocument) => BeatflowLevelDocument) => void;
  onChangeVolume: (vol: number) => void;
  onSelectLocalSong: (song: SongMetadata, autoGenerateBase: boolean) => Promise<void>;
  onLaunchVisualPreview: () => void;
  onOpenLevel: (lvl: BeatflowLevelDocument) => void | Promise<void>;
  onNewEmptyLevel: () => void | Promise<void>;
  onDuplicateLevel: (lvl: BeatflowLevelDocument) => void | Promise<void>;
  onRenameLevel: (levelId: string, newName: string) => void | Promise<void>;
  onDeleteSavedLevel: (levelId: string) => void | Promise<void>;
  onExportZip: (targetLevel?: BeatflowLevelDocument) => void | Promise<void>;
  onImportZipFile: (file: File) => void | Promise<void>;
  onOpenPublishModal: () => void;
  onOpenCommunity?: () => void;
}

const DIFFICULTIES: Array<{ id: DifficultyLevel; label: string }> = [
  { id: 'easy', label: 'Fácil' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Difícil' },
  { id: 'expert', label: 'Experto' },
  { id: 'master', label: 'Maestro' },
  { id: 'custom', label: 'Custom' },
];

export const CreatorConfigModal: React.FC<CreatorConfigModalProps> = ({
  open,
  level,
  savedLevels,
  loadingLevels = false,
  zipBusy = false,
  playbackVolume,
  hasLinkedAudio,
  onClose,
  onUpdateLevel,
  onChangeVolume,
  onSelectLocalSong,
  onLaunchVisualPreview,
  onOpenLevel,
  onNewEmptyLevel,
  onDuplicateLevel,
  onRenameLevel,
  onDeleteSavedLevel,
  onExportZip,
  onImportZipFile,
  onOpenPublishModal,
  onOpenCommunity,
}) => {
  const [songs, setSongs] = useState<SongMetadata[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [importingAudio, setImportingAudio] = useState(false);
  const [autoGenAfterPick, setAutoGenAfterPick] = useState(false);
  const [sectionTab, setSectionTab] = useState<'general' | 'audio' | 'levels'>('general');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoadingSongs(true);
    getAllSongs()
      .then((list) => {
        if (alive) setSongs(list);
      })
      .finally(() => {
        if (alive) setLoadingSongs(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;

  const handleImportMp3 = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImportingAudio(true);
    try {
      const { imported } = await importMp3Files(files);
      const refreshed = await getAllSongs();
      setSongs(refreshed);
      if (imported[0]) {
        await onSelectLocalSong(imported[0], autoGenAfterPick);
      }
    } finally {
      setImportingAudio(false);
      e.target.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-xl max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-[#070b1e] border border-cyan-400/35 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div>
            <h2 className="font-display font-bold text-base text-white">Configuración del Nivel</h2>
            <p className="text-[11px] text-slate-400">
              Metadatos, audio local, BPM, carriles y paquetes .zip
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 cursor-pointer"
            aria-label="Cerrar configuración"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="grid grid-cols-3 border-b border-white/10 bg-[#050817] shrink-0">
          {(
            [
              { id: 'general', label: 'Nivel & Pista' },
              { id: 'audio', label: 'Música & Sync' },
              { id: 'levels', label: 'Niveles / .zip' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSectionTab(tab.id)}
              className={`min-h-[44px] text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                sectionTab === tab.id
                  ? 'border-cyan-400 text-cyan-200 bg-cyan-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {sectionTab === 'general' && (
            <>
              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-slate-300">Nombre del nivel</span>
                  <input
                    type="text"
                    value={level.levelName}
                    onChange={(e) =>
                      onUpdateLevel((prev) => ({ ...prev, levelName: e.target.value }))
                    }
                    maxLength={64}
                    className="w-full min-h-[44px] bg-black/40 border border-white/15 rounded-xl px-3 text-sm text-white focus:border-cyan-400 outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-slate-300">Descripción corta</span>
                  <textarea
                    rows={2}
                    value={level.description}
                    onChange={(e) =>
                      onUpdateLevel((prev) => ({ ...prev, description: e.target.value }))
                    }
                    maxLength={180}
                    className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:border-cyan-400 outline-none resize-none"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-300">Autor</span>
                    <input
                      type="text"
                      value={level.authorName}
                      onChange={(e) =>
                        onUpdateLevel((prev) => ({ ...prev, authorName: e.target.value }))
                      }
                      maxLength={40}
                      className="w-full min-h-[44px] bg-black/40 border border-white/15 rounded-xl px-3 text-xs text-white focus:border-cyan-400 outline-none"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-300">Dificultad</span>
                    <select
                      value={level.difficulty}
                      onChange={(e) =>
                        onUpdateLevel((prev) => ({
                          ...prev,
                          difficulty: e.target.value as DifficultyLevel,
                        }))
                      }
                      className="w-full min-h-[44px] bg-[#0b122b] border border-white/15 rounded-xl px-3 text-xs text-white focus:border-cyan-400 outline-none"
                    >
                      {DIFFICULTIES.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-300">Carriles</span>
                    <select
                      value={level.gameplayRules.laneCount}
                      onChange={(e) =>
                        onUpdateLevel((prev) => ({
                          ...prev,
                          gameplayRules: {
                            ...prev.gameplayRules,
                            laneCount: Number(e.target.value) as LaneCount,
                          },
                        }))
                      }
                      className="w-full min-h-[44px] bg-[#0b122b] border border-white/15 rounded-xl px-2.5 text-xs text-white tabular-nums"
                    >
                      {([4, 5, 6, 7, 8] as LaneCount[]).map((c) => (
                        <option key={c} value={c}>
                          {c} carriles
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-300">
                      Velocidad ({level.gameplayRules.approachSpeed.toFixed(2)}x)
                    </span>
                    <input
                      type="number"
                      min={0.6}
                      max={2.2}
                      step={0.05}
                      value={level.gameplayRules.approachSpeed}
                      onChange={(e) =>
                        onUpdateLevel((prev) => ({
                          ...prev,
                          gameplayRules: {
                            ...prev.gameplayRules,
                            approachSpeed: Math.max(
                              0.6,
                              Math.min(2.2, Number(e.target.value) || 1.0),
                            ),
                          },
                        }))
                      }
                      className="w-full min-h-[44px] bg-black/40 border border-white/15 rounded-xl px-3 text-xs text-white tabular-nums"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-300">Duración (s)</span>
                    <input
                      type="number"
                      min={10}
                      max={600}
                      step={1}
                      value={Math.round(level.audio.durationSec)}
                      onChange={(e) =>
                        onUpdateLevel((prev) => ({
                          ...prev,
                          audio: {
                            ...prev.audio,
                            durationSec: Math.max(10, Math.min(600, Number(e.target.value) || 30)),
                          },
                        }))
                      }
                      className="w-full min-h-[44px] bg-black/40 border border-white/15 rounded-xl px-3 text-xs text-white tabular-nums"
                    />
                  </label>
                </div>
              </div>

              <div className="pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLaunchVisualPreview();
                  }}
                  className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-indigo-500/25 hover:bg-indigo-500/35 border border-indigo-400/50 text-indigo-100 font-bold text-sm cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>Abrir Vista Previa 2.5D</span>
                </button>
              </div>
            </>
          )}

          {sectionTab === 'audio' && (
            <>
              <div className="rounded-xl bg-[#0b122b] border border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-400">Canción vinculada</div>
                    <div className="font-bold text-sm text-white truncate">
                      {level.audio.title || 'Sin canción'} — {level.audio.artist || 'Local'}
                    </div>
                    <div className="text-[11px] text-cyan-300 tabular-nums">
                      {hasLinkedAudio
                        ? 'Audio decodificado listo para Playtest y Playback'
                        : 'Sin MP3 decodificado (Playback usará reloj visual)'}
                    </div>
                  </div>
                  <Music className="w-5 h-5 text-cyan-300 shrink-0" />
                </div>

                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <label className="block space-y-1">
                    <span className="text-[11px] text-slate-300">BPM</span>
                    <input
                      type="number"
                      min={40}
                      max={260}
                      step={1}
                      value={Math.round(level.audio.bpm)}
                      onChange={(e) =>
                        onUpdateLevel((prev) => ({
                          ...prev,
                          audio: {
                            ...prev.audio,
                            bpm: Math.max(40, Math.min(260, Number(e.target.value) || 120)),
                          },
                        }))
                      }
                      className="w-full min-h-[44px] bg-black/40 border border-white/15 rounded-xl px-2.5 text-white tabular-nums"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] text-slate-300">Offset (ms)</span>
                    <input
                      type="number"
                      min={-500}
                      max={500}
                      step={5}
                      value={Math.round(level.audio.offsetMs)}
                      onChange={(e) =>
                        onUpdateLevel((prev) => ({
                          ...prev,
                          audio: {
                            ...prev.audio,
                            offsetMs: Math.max(-500, Math.min(500, Number(e.target.value) || 0)),
                          },
                        }))
                      }
                      className="w-full min-h-[44px] bg-black/40 border border-white/15 rounded-xl px-2.5 text-white tabular-nums"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] text-slate-300">
                      Volumen ({Math.round(playbackVolume * 100)}%)
                    </span>
                    <div className="min-h-[44px] flex items-center">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={playbackVolume}
                        onChange={(e) => onChangeVolume(Number(e.target.value))}
                        className="w-full accent-cyan-400"
                      />
                    </div>
                  </label>
                </div>
              </div>

              {/* Select from local Music Library or import new MP3 */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-200">Biblioteca Local</span>
                  <button
                    type="button"
                    disabled={importingAudio}
                    onClick={() => audioInputRef.current?.click()}
                    className="min-h-[44px] px-3 rounded-xl bg-cyan-500/20 border border-cyan-400/45 text-cyan-100 font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{importingAudio ? 'Importando...' : 'Importar Audio'}</span>
                  </button>
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleImportMp3}
                  />
                </div>

                <label className="flex items-center gap-2.5 min-h-[44px] px-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoGenAfterPick}
                    onChange={(e) => setAutoGenAfterPick(e.target.checked)}
                    className="w-4 h-4 accent-cyan-400"
                  />
                  <Wand2 className="w-4 h-4 text-cyan-300 shrink-0" />
                  <span className="text-slate-200">
                    Generar patrón base editable de casillas al cargar canción
                  </span>
                </label>

                {loadingSongs ? (
                  <div className="py-6 text-center text-slate-400">Cargando canciones...</div>
                ) : songs.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 bg-black/25 rounded-xl border border-white/10">
                    No hay canciones locales guardadas. Usa &ldquo;Importar Audio&rdquo; para cargar un archivo MP3/WAV/OGG.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {songs.map((s) => {
                      const active = level.audio.songId === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => void onSelectLocalSong(s, autoGenAfterPick)}
                          className={`w-full min-h-[52px] flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left cursor-pointer ${
                            active
                              ? 'bg-cyan-500/20 border-cyan-400 text-white'
                              : 'bg-[#0b122b] border-white/10 text-slate-200 hover:border-cyan-400/40'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-bold truncate">{s.title}</div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {s.artist} · {Math.round(s.duration)}s
                              {s.profile?.bpm ? ` · ${Math.round(s.profile.bpm)} BPM` : ''}
                            </div>
                          </div>
                          <span className="text-[11px] font-bold text-cyan-300 shrink-0">
                            {active ? 'Activa' : 'Usar'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {sectionTab === 'levels' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void onNewEmptyLevel();
                    onClose();
                  }}
                  className="min-h-[46px] flex items-center justify-center gap-1.5 rounded-xl bg-cyan-500/20 border border-cyan-400/45 text-cyan-100 font-bold cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Nuevo Nivel</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPublishModal();
                  }}
                  className="min-h-[46px] flex items-center justify-center gap-1.5 rounded-xl bg-fuchsia-500/20 border border-fuchsia-400/45 text-fuchsia-100 font-bold cursor-pointer"
                >
                  <Globe className="w-4 h-4" />
                  <span>Publicar</span>
                </button>
                <button
                  type="button"
                  disabled={zipBusy}
                  onClick={() => void onExportZip(level)}
                  className="min-h-[46px] flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-100 font-bold cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{zipBusy ? 'Procesando...' : 'Exportar ZIP'}</span>
                </button>
                <button
                  type="button"
                  disabled={zipBusy}
                  onClick={() => zipInputRef.current?.click()}
                  className="min-h-[46px] flex items-center justify-center gap-1.5 rounded-xl bg-white/5 border border-white/15 text-slate-100 font-bold cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  <span>{zipBusy ? 'Procesando...' : 'Importar ZIP'}</span>
                </button>
                <input
                  ref={zipInputRef}
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onImportZipFile(f);
                    e.target.value = '';
                  }}
                />
              </div>

              {onOpenCommunity && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCommunity();
                  }}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-indigo-500/20 border border-indigo-400/40 text-indigo-100 font-bold cursor-pointer"
                >
                  <Globe className="w-4 h-4" />
                  <span>Explorar Comunidad</span>
                </button>
              )}

              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-slate-200">
                    <FolderOpen className="w-4 h-4 text-cyan-300" />
                    <span>Niveles Independientes ({savedLevels.length})</span>
                  </div>
                  <span className="text-[10px] text-slate-400">IndexedDB local</span>
                </div>

                {loadingLevels ? (
                  <div className="py-6 text-center text-slate-400">Cargando niveles...</div>
                ) : savedLevels.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 bg-black/25 rounded-xl border border-white/10">
                    No hay niveles guardados todavía. Crea uno nuevo o importa un paquete .zip.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {savedLevels.map((lvl) => {
                      const isCurrent = lvl.levelId === level.levelId;
                      const isRenaming = renamingId === lvl.levelId;
                      const isConfirmingDelete = confirmDeleteId === lvl.levelId;

                      return (
                        <div
                          key={lvl.levelId}
                          className={`rounded-xl border p-2.5 space-y-2 ${
                            isCurrent
                              ? 'bg-cyan-500/15 border-cyan-400/55'
                              : 'bg-[#0b122b] border-white/10'
                          }`}
                        >
                          {isRenaming ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const trimmed = renameDraft.trim();
                                if (trimmed) {
                                  void onRenameLevel(lvl.levelId, trimmed);
                                }
                                setRenamingId(null);
                              }}
                              className="flex items-center gap-1.5"
                            >
                              <input
                                type="text"
                                autoFocus
                                maxLength={64}
                                value={renameDraft}
                                onChange={(e) => setRenameDraft(e.target.value)}
                                aria-label="Nuevo nombre del nivel"
                                className="flex-1 min-h-[38px] bg-black/50 border border-cyan-400/60 rounded-lg px-2.5 text-xs text-white outline-none"
                              />
                              <button
                                type="submit"
                                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-emerald-500/25 border border-emerald-400/50 text-emerald-200 cursor-pointer"
                                aria-label="Guardar nombre"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setRenamingId(null)}
                                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-white/5 border border-white/15 text-slate-300 cursor-pointer"
                                aria-label="Cancelar renombrar"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </form>
                          ) : (
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-white truncate">
                                    {lvl.levelName}
                                  </span>
                                  {isCurrent && (
                                    <span className="px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-200 text-[10px] font-bold shrink-0">
                                      Activo
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 tabular-nums truncate">
                                  {lvl.environmentTheme} · {Math.round(lvl.audio.bpm)} BPM ·{' '}
                                  {lvl.objects.length} obj ·{' '}
                                  {lvl.audio.songId ? `Audio: ${lvl.audio.title}` : 'Sin audio'}
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                void onOpenLevel(lvl);
                                onClose();
                              }}
                              className="min-h-[38px] px-3 rounded-lg bg-cyan-500/25 border border-cyan-400/45 text-cyan-100 font-bold cursor-pointer"
                            >
                              {isCurrent ? 'Continuar' : 'Abrir'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void onDuplicateLevel(lvl)}
                              className="min-h-[38px] px-2.5 flex items-center gap-1 rounded-lg bg-white/5 border border-white/15 text-slate-200 font-semibold cursor-pointer"
                              title="Duplicar nivel"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>Duplicar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteId(null);
                                setRenamingId(lvl.levelId);
                                setRenameDraft(lvl.levelName);
                              }}
                              className="min-h-[38px] px-2.5 flex items-center gap-1 rounded-lg bg-white/5 border border-white/15 text-slate-200 font-semibold cursor-pointer"
                              title="Renombrar nivel"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Renombrar</span>
                            </button>
                            <button
                              type="button"
                              disabled={zipBusy}
                              onClick={() => void onExportZip(lvl)}
                              className="min-h-[38px] px-2.5 flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-400/35 text-emerald-200 font-semibold cursor-pointer disabled:opacity-50"
                              title="Exportar paquete ZIP"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>ZIP</span>
                            </button>

                            {isConfirmingDelete ? (
                              <div className="ml-auto flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmDeleteId(null);
                                    void onDeleteSavedLevel(lvl.levelId);
                                  }}
                                  className="min-h-[38px] px-2.5 rounded-lg bg-rose-600 text-white font-bold cursor-pointer"
                                >
                                  Confirmar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="min-h-[38px] px-2 rounded-lg bg-white/5 border border-white/15 text-slate-300 cursor-pointer"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setRenamingId(null);
                                  setConfirmDeleteId(lvl.levelId);
                                }}
                                className="ml-auto min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-rose-500/15 border border-rose-400/35 text-rose-300 cursor-pointer"
                                title="Eliminar nivel"
                                aria-label={`Eliminar ${lvl.levelName}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
