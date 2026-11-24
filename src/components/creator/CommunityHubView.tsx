import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Flag,
  Heart,
  MessageSquare,
  Music,
  Pause,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Star,
  Wrench,
} from 'lucide-react';
import type {
  BeatflowLevelDocument,
  CommunityLevelEntry,
  CommunityMusicTrack,
  ModerationReport,
  RightsAuthorizationType,
} from '../../types/creator';
import type { DifficultyLevel } from '../../types/game';
import { createEmptyLevelDocument } from '../../creator/LevelSerializer';
import { saveCreatorLevel } from '../../services/creatorLevelsStorage';
import { communityPlatform } from '../../services/communityPlatform';

interface CommunityHubViewProps {
  onBack: () => void;
  onOpenInCreator: (level: BeatflowLevelDocument, startPlaytest?: boolean) => void;
}

export const CommunityHubView: React.FC<CommunityHubViewProps> = ({
  onBack,
  onOpenInCreator,
}) => {
  const [tab, setTab] = useState<'levels' | 'music'>('levels');
  const [query, setQuery] = useState('');
  const [diffFilter, setDiffFilter] = useState<DifficultyLevel | 'all'>('all');
  const [sortBy, setSortBy] = useState<'popular' | 'rating' | 'recent'>('popular');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const [levels, setLevels] = useState<CommunityLevelEntry[]>([]);
  const [tracks, setTracks] = useState<CommunityMusicTrack[]>([]);
  const [favLevelIds, setFavLevelIds] = useState<Set<string>>(new Set());
  const [favMusicIds, setFavMusicIds] = useState<Set<string>>(new Set());
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);

  const [commentTargetId, setCommentTargetId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [reportTarget, setReportTarget] = useState<{
    type: 'level' | 'music';
    id: string;
    name: string;
  } | null>(null);
  const [reportReason, setReportReason] = useState<ModerationReport['reason']>('copyright');
  const [reportDetails, setReportDetails] = useState('');

  const [uploadTrackOpen, setUploadTrackOpen] = useState(false);
  const [upTitle, setUpTitle] = useState('');
  const [upArtist, setUpArtist] = useState('');
  const [upGenre, setUpGenre] = useState('Electronic');
  const [upBpm, setUpBpm] = useState(128);
  const [upAuthType, setUpAuthType] = useState<RightsAuthorizationType>('original_author');
  const [upLicense, setUpLicense] = useState('CC-BY 4.0');
  const [upHolder, setUpHolder] = useState('');
  const [upSourceUrl, setUpSourceUrl] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((c) => (c === msg ? null : c));
    }, 3500);
  };

  const refreshData = () => {
    setLevels(
      communityPlatform.getLevels({
        query,
        difficulty: diffFilter,
        sortBy,
        favoritesOnly,
      }),
    );
    setTracks(
      communityPlatform.getMusicTracks({
        query,
        favoritesOnly,
      }),
    );
    setFavLevelIds(communityPlatform.getFavoriteIds('level'));
    setFavMusicIds(communityPlatform.getFavoriteIds('music'));
  };

  useEffect(() => {
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, diffFilter, sortBy, favoritesOnly]);

  useEffect(() => {
    return () => {
      communityPlatform.stopTrackPreview();
    };
  }, []);

  const handlePlayLevel = (entry: CommunityLevelEntry) => {
    communityPlatform.incrementStat('level', entry.id, 'plays');
    onOpenInCreator(structuredClone(entry.level), true);
  };

  const handleDownloadToCreator = (entry: CommunityLevelEntry) => {
    communityPlatform.incrementStat('level', entry.id, 'downloads');
    saveCreatorLevel(entry.level);
    onOpenInCreator(structuredClone(entry.level), false);
  };

  const handleUseMusicInCreator = (track: CommunityMusicTrack) => {
    communityPlatform.incrementStat('music', track.id, 'downloads');
    const doc = createEmptyLevelDocument({
      levelName: `${track.title} Remix`,
      bpm: track.bpm,
      durationSec: track.durationSec,
      songTitle: track.title,
      songArtist: track.artist,
      songId: track.id,
    });
    doc.audio.palette = { ...track.palette };
    doc.audio.rights = { ...track.rights };
    onOpenInCreator(doc, false);
  };

  const handleUploadTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = communityPlatform.submitAuthorizedMusicTrack({
      title: upTitle,
      artist: upArtist,
      genre: upGenre,
      bpm: upBpm,
      durationSec: 45,
      rights: {
        authorizationType: upAuthType,
        licenseName: upLicense,
        rightsHolder: upHolder || upArtist,
        sourceUrl: upSourceUrl.trim() || undefined,
        allowRemixAndLevelUse: true,
      },
    });
    if (!res.ok) {
      notify(res.error ?? 'Error al verificar los derechos de la pista.');
      return;
    }
    setUploadTrackOpen(false);
    setUpTitle('');
    setUpArtist('');
    setUpSourceUrl('');
    refreshData();
    notify('Pista publicada en Música Comunitaria XanderAI.');
  };

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[#050817] text-slate-100 overflow-hidden">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#080d24] border-b border-cyan-400/25 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              communityPlatform.stopTrackPreview();
              onBack();
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Menú</span>
          </button>
          <div>
            <h1 className="font-display font-extrabold text-base sm:text-lg tracking-wide text-white">
              Comunidad XanderAI Games
            </h1>
            <p className="text-[11px] text-cyan-300/90">
              Niveles .bfn compartidos y Música Autorizada libre de conflictos de copyright
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('levels')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              tab === 'levels'
                ? 'bg-cyan-500/25 border-cyan-400 text-white'
                : 'bg-white/5 border-white/10 text-slate-300'
            }`}
          >
            Niveles ({levels.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('music')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              tab === 'music'
                ? 'bg-fuchsia-500/25 border-fuchsia-400 text-white'
                : 'bg-white/5 border-white/10 text-slate-300'
            }`}
          >
            Música Comunitaria ({tracks.length})
          </button>
        </div>
      </header>

      {/* Search & Filters Strip */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[#070b1e] border-b border-white/10 shrink-0">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              tab === 'levels'
                ? 'Buscar nivel, creador o canción...'
                : 'Buscar pista, artista o género...'
            }
            className="w-full bg-black/40 border border-white/15 rounded-xl pl-9 pr-3 py-1.5 text-xs"
          />
        </div>

        {tab === 'levels' && (
          <>
            <select
              value={diffFilter}
              onChange={(e) => setDiffFilter(e.target.value as DifficultyLevel | 'all')}
              className="bg-black/50 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs"
            >
              <option value="all">Todas las dificultades</option>
              <option value="easy">Fácil</option>
              <option value="normal">Normal</option>
              <option value="hard">Difícil</option>
              <option value="expert">Experto</option>
              <option value="master">Maestro</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'popular' | 'rating' | 'recent')}
              className="bg-black/50 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs"
            >
              <option value="popular">Más jugados</option>
              <option value="rating">Mejor valorados</option>
              <option value="recent">Más recientes</option>
            </select>
          </>
        )}

        <button
          type="button"
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer ${
            favoritesOnly
              ? 'bg-rose-500/25 border-rose-400 text-rose-100'
              : 'bg-white/5 border-white/15 text-slate-300'
          }`}
        >
          <Heart className={`w-3.5 h-3.5 ${favoritesOnly ? 'fill-current' : ''}`} />
          <span>Favoritos</span>
        </button>

        {tab === 'music' && (
          <button
            type="button"
            onClick={() => setUploadTrackOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-fuchsia-600/85 hover:bg-fuchsia-500 text-white text-xs font-bold cursor-pointer ml-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Subir Pista Autorizada</span>
          </button>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'levels' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-w-6xl mx-auto">
            {levels.map((entry) => {
              const isFav = favLevelIds.has(entry.id);
              return (
                <div
                  key={entry.id}
                  className="flex flex-col justify-between rounded-2xl bg-[#0a1026] border border-cyan-400/25 p-4 space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display font-bold text-base text-white">
                          {entry.level.levelName}
                        </h3>
                        <p className="text-xs text-slate-300">
                          por <strong className="text-cyan-300">{entry.creatorName}</strong> ·{' '}
                          {entry.level.audio.title}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          communityPlatform.toggleFavorite('level', entry.id);
                          refreshData();
                        }}
                        className={`p-1.5 rounded-lg border cursor-pointer ${
                          isFav
                            ? 'border-rose-400/50 bg-rose-500/20 text-rose-300'
                            : 'border-white/10 text-slate-400 hover:text-white'
                        }`}
                        aria-label="Favorito"
                      >
                        <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                      </button>
                    </div>

                    <p className="text-xs text-slate-400 line-clamp-2">
                      {entry.level.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300 pt-1">
                      <span className="font-mono-num text-amber-300 font-bold">
                        ★ {entry.ratingAvg} ({entry.ratingCount})
                      </span>
                      <span>· {entry.difficulty.toUpperCase()}</span>
                      <span>· {entry.level.audio.bpm} BPM</span>
                      <span>· {entry.plays} jugadas</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-300">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{entry.level.audio.rights.licenseName}</span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-white/10">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePlayLevel(entry)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white text-xs font-bold cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Jugar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadToCreator(entry)}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold cursor-pointer"
                      >
                        <Wrench className="w-3.5 h-3.5 text-cyan-300" />
                        <span>Editor</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCommentTargetId(commentTargetId === entry.id ? null : entry.id)
                        }
                        className="p-2 rounded-xl bg-white/5 border border-white/15 text-slate-300 cursor-pointer"
                        title="Comentarios y valoración"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setReportTarget({
                            type: 'level',
                            id: entry.id,
                            name: entry.level.levelName,
                          })
                        }
                        className="p-2 rounded-xl bg-white/5 border border-white/15 text-slate-400 hover:text-rose-300 cursor-pointer"
                        title="Reportar contenido"
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {commentTargetId === entry.id && (
                      <div className="rounded-xl bg-black/40 border border-white/10 p-2.5 space-y-2 text-xs">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400 mr-1">Valorar:</span>
                          {[1, 2, 3, 4, 5].map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => {
                                communityPlatform.rateLevel(entry.id, s);
                                refreshData();
                                notify(`Valorado con ${s} estrellas`);
                              }}
                              className="p-1 text-amber-300 hover:scale-110 cursor-pointer"
                            >
                              <Star className="w-3.5 h-3.5 fill-current" />
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder="Escribe un comentario..."
                            className="flex-1 bg-black/50 border border-white/15 rounded-lg px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              communityPlatform.addComment(entry.id, 'Jugador Local', commentText);
                              setCommentText('');
                              refreshData();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-cyan-600 text-white font-semibold cursor-pointer"
                          >
                            Enviar
                          </button>
                        </div>
                        {entry.comments.slice(0, 3).map((c) => (
                          <div key={c.id} className="text-[11px] text-slate-300">
                            <strong className="text-cyan-300">{c.authorName}:</strong> {c.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-5xl mx-auto">
            {tracks.map((track) => {
              const isPlaying = playingTrackId === track.id;
              const isFav = favMusicIds.has(track.id);
              return (
                <div
                  key={track.id}
                  className="flex flex-col justify-between rounded-2xl bg-[#0a1026] border border-fuchsia-400/25 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (isPlaying) {
                            communityPlatform.stopTrackPreview();
                            setPlayingTrackId(null);
                          } else {
                            setPlayingTrackId(track.id);
                            communityPlatform.startTrackPreview(track, () => setPlayingTrackId(null));
                          }
                        }}
                        className="w-11 h-11 rounded-xl bg-fuchsia-500/25 border border-fuchsia-400/50 flex items-center justify-center text-fuchsia-200 hover:text-white shrink-0 cursor-pointer"
                        aria-label={isPlaying ? 'Detener muestra' : 'Escuchar muestra'}
                      >
                        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                      </button>
                      <div className="min-w-0">
                        <h3 className="font-display font-bold text-sm text-white truncate">
                          {track.title}
                        </h3>
                        <p className="text-xs text-slate-300 truncate">
                          {track.artist} · {track.genre}
                        </p>
                        <p className="text-[11px] text-cyan-300 font-mono-num">
                          {track.bpm} BPM · {track.durationSec}s · {track.downloads} usos
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        communityPlatform.toggleFavorite('music', track.id);
                        refreshData();
                      }}
                      className={`p-1.5 rounded-lg border cursor-pointer ${
                        isFav
                          ? 'border-rose-400/50 bg-rose-500/20 text-rose-300'
                          : 'border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10 text-[11px]">
                    <span className="flex items-center gap-1 text-emerald-300 truncate">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{track.rights.licenseName}</span>
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleUseMusicInCreator(track)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-cyan-500/25 border border-cyan-400/50 text-cyan-100 font-bold cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Usar en Editor</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setReportTarget({
                            type: 'music',
                            id: track.id,
                            name: track.title,
                          })
                        }
                        className="p-1.5 rounded-xl bg-white/5 border border-white/15 text-slate-400 hover:text-rose-300 cursor-pointer"
                        title="Reportar pista"
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload Authorized Track Modal */}
      {uploadTrackOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={handleUploadTrackSubmit}
            className="w-full max-w-md rounded-2xl bg-[#070b1e] border border-fuchsia-400/45 p-5 space-y-3 text-xs"
          >
            <div className="flex items-center gap-2 font-display font-bold text-base text-white">
              <Music className="w-4 h-4 text-fuchsia-300" />
              <span>Subir Pista Autorizada (XanderAI)</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Solo se admiten pistas originales, con licencia de distribución o permiso verificable.
              El sistema bloquea enlaces no autorizados de Newgrounds.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-slate-400">Título</span>
                <input
                  type="text"
                  required
                  value={upTitle}
                  onChange={(e) => setUpTitle(e.target.value)}
                  className="w-full bg-black/40 border border-white/15 rounded-lg px-2 py-1.5"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Artista</span>
                <input
                  type="text"
                  required
                  value={upArtist}
                  onChange={(e) => setUpArtist(e.target.value)}
                  className="w-full bg-black/40 border border-white/15 rounded-lg px-2 py-1.5"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Género</span>
                <input
                  type="text"
                  value={upGenre}
                  onChange={(e) => setUpGenre(e.target.value)}
                  className="w-full bg-black/40 border border-white/15 rounded-lg px-2 py-1.5"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">BPM</span>
                <input
                  type="number"
                  min="50"
                  max="240"
                  value={upBpm}
                  onChange={(e) => setUpBpm(Number(e.target.value) || 124)}
                  className="w-full bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 font-mono-num"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-slate-400">Autorización Legal</span>
              <select
                value={upAuthType}
                onChange={(e) => setUpAuthType(e.target.value as RightsAuthorizationType)}
                className="w-full bg-black/50 border border-white/15 rounded-lg px-2 py-1.5"
              >
                <option value="original_author">Obra original propia</option>
                <option value="distribution_license">Licencia abierta / CC-BY</option>
                <option value="public_domain">Dominio público (CC0)</option>
                <option value="rights_holder_permission">Permiso del titular</option>
                <option value="authorized_remix_cover">Remix / Cover autorizado</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-slate-400">Licencia</span>
                <input
                  type="text"
                  required
                  value={upLicense}
                  onChange={(e) => setUpLicense(e.target.value)}
                  className="w-full bg-black/40 border border-white/15 rounded-lg px-2 py-1.5"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Titular</span>
                <input
                  type="text"
                  value={upHolder}
                  onChange={(e) => setUpHolder(e.target.value)}
                  placeholder="Nombre del titular"
                  className="w-full bg-black/40 border border-white/15 rounded-lg px-2 py-1.5"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-slate-400">URL / Fuente (opcional)</span>
              <input
                type="text"
                value={upSourceUrl}
                onChange={(e) => setUpSourceUrl(e.target.value)}
                className="w-full bg-black/40 border border-white/15 rounded-lg px-2 py-1.5"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUploadTrackOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/15 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-fuchsia-600 text-white font-bold cursor-pointer"
              >
                Registrar Pista
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Report / Moderation Modal */}
      {reportTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#070b1e] border border-rose-400/45 p-5 space-y-3 text-xs">
            <h3 className="font-display font-bold text-base text-white">
              Reportar "{reportTarget.name}"
            </h3>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value as ModerationReport['reason'])}
              className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5"
            >
              <option value="copyright">Infracción de derechos de autor</option>
              <option value="unauthorized_newgrounds">Uso no autorizado de Newgrounds</option>
              <option value="broken_level">Nivel roto / inacabable</option>
              <option value="inappropriate">Contenido inapropiado</option>
            </select>
            <textarea
              rows={3}
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Detalles del reporte..."
              className="w-full bg-black/40 border border-white/15 rounded-lg p-2"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/15 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  communityPlatform.reportContent({
                    targetType: reportTarget.type,
                    targetId: reportTarget.id,
                    reason: reportReason,
                    details: reportDetails,
                  });
                  setReportTarget(null);
                  setReportDetails('');
                  refreshData();
                  notify('Reporte enviado al sistema de moderación.');
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold cursor-pointer"
              >
                Enviar Reporte
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#0b132f] border border-cyan-400/55 text-cyan-100 text-xs font-semibold shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
};
