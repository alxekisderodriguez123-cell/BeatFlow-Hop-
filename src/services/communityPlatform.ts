import type {
  AudioRightsDeclaration,
  BeatflowLevelDocument,
  CommunityComment,
  CommunityLevelEntry,
  CommunityMusicTrack,
  ModerationReport,
} from '../types/creator';
import type { DifficultyLevel } from '../types/game';
import { migrateLevelDocument } from '../creator/LevelSerializer';
import { validateLevelDocument } from '../creator/LevelValidator';
import { getStarterCreatorTemplates } from './creatorLevelsStorage';

const COMMUNITY_MUSIC_KEY = 'beatflow_xanderai_music_v1';
const COMMUNITY_LEVELS_KEY = 'beatflow_xanderai_levels_v1';
const COMMUNITY_REPORTS_KEY = 'beatflow_xanderai_reports_v1';
const COMMUNITY_FAVS_KEY = 'beatflow_xanderai_favs_v1';

export interface CommunityRemoteAdapter {
  syncLevels?: () => Promise<CommunityLevelEntry[]>;
  syncMusic?: () => Promise<CommunityMusicTrack[]>;
  publishLevelRemote?: (entry: CommunityLevelEntry) => Promise<void>;
}

const BUILTIN_COMMUNITY_MUSIC: CommunityMusicTrack[] = [
  {
    id: 'xai-track-cyber-pulse',
    title: 'Neon Horizon Drive',
    artist: 'XanderAI Soundworks',
    genre: 'Cyberpunk / Synth',
    durationSec: 42,
    bpm: 128,
    palette: { primary: '#22d3ee', secondary: '#ec4899', accent: '#6366f1' },
    rights: {
      authorizationType: 'original_author',
      licenseName: 'XanderAI Original CC-BY 4.0',
      rightsHolder: 'XanderAI Games',
      attributionText: 'Música original libre de uso en niveles BeatFlow Hop',
      allowRemixAndLevelUse: true,
    },
    favorites: 482,
    plays: 3120,
    downloads: 940,
    moderationStatus: 'approved',
    reportCount: 0,
    sampleSynthPreset: 'cyber_pulse',
    isBuiltin: true,
    uploadedAt: '2026-10-01T10:00:00Z',
  },
  {
    id: 'xai-track-sunset-palm',
    title: 'Golden Tide Mirage',
    artist: 'XanderAI Soundworks',
    genre: 'Tropical Chillwave',
    durationSec: 38,
    bpm: 112,
    palette: { primary: '#fb923c', secondary: '#fb7185', accent: '#fde047' },
    rights: {
      authorizationType: 'original_author',
      licenseName: 'XanderAI Original CC-BY 4.0',
      rightsHolder: 'XanderAI Games',
      attributionText: 'Pista autorizada para BeatFlow Creator',
      allowRemixAndLevelUse: true,
    },
    favorites: 356,
    plays: 2290,
    downloads: 615,
    moderationStatus: 'approved',
    reportCount: 0,
    sampleSynthPreset: 'sunset_chill',
    isBuiltin: true,
    uploadedAt: '2026-10-08T12:00:00Z',
  },
  {
    id: 'xai-track-synthwave-run',
    title: 'Midnight Highway 84',
    artist: 'XanderAI Collective',
    genre: 'Synthwave / Outrun',
    durationSec: 46,
    bpm: 136,
    palette: { primary: '#f43f8e', secondary: '#22d3ee', accent: '#a855f7' },
    rights: {
      authorizationType: 'distribution_license',
      licenseName: 'CC0 1.0 Universal',
      rightsHolder: 'XanderAI Collective',
      attributionText: 'Dominio público / uso libre en comunidad BeatFlow',
      allowRemixAndLevelUse: true,
    },
    favorites: 610,
    plays: 4480,
    downloads: 1320,
    moderationStatus: 'approved',
    reportCount: 0,
    sampleSynthPreset: 'synthwave_drive',
    isBuiltin: true,
    uploadedAt: '2026-10-14T14:30:00Z',
  },
  {
    id: 'xai-track-cosmic-arp',
    title: 'Orbital Resonance',
    artist: 'XanderAI Lab',
    genre: 'Electro / Cosmic',
    durationSec: 40,
    bpm: 142,
    palette: { primary: '#38bdf8', secondary: '#c084fc', accent: '#34d399' },
    rights: {
      authorizationType: 'original_author',
      licenseName: 'XanderAI Creator Open License',
      rightsHolder: 'XanderAI Games',
      attributionText: 'Autorizado para remix, playtest y distribución comunitaria',
      allowRemixAndLevelUse: true,
    },
    favorites: 295,
    plays: 1950,
    downloads: 540,
    moderationStatus: 'approved',
    reportCount: 0,
    sampleSynthPreset: 'cosmic_arp',
    isBuiltin: true,
    uploadedAt: '2026-10-20T09:15:00Z',
  },
];

export interface RightsCheckResult {
  valid: boolean;
  reason?: string;
}

/**
 * Enforces explicit Music Rights Verification.
 * Strictly blocks unauthorized Newgrounds scraping or undeclared copyrighted uploads.
 */
export function validateAudioRightsDeclaration(
  rights: AudioRightsDeclaration,
  sourceUrl?: string,
): RightsCheckResult {
  if (!rights) {
    return { valid: false, reason: 'Falta la declaración de derechos del audio.' };
  }
  if (!rights.licenseName.trim()) {
    return { valid: false, reason: 'Especifica el nombre de la licencia (ej. CC-BY 4.0, CC0, Original).' };
  }
  if (!rights.rightsHolder.trim()) {
    return { valid: false, reason: 'Especifica el titular de derechos o autor verificado.' };
  }
  if (!rights.allowRemixAndLevelUse) {
    return { valid: false, reason: 'La pista debe autorizar su uso dentro de niveles comunitarios.' };
  }

  const combinedUrl = `${sourceUrl ?? ''} ${rights.sourceUrl ?? ''}`.toLowerCase();
  if (
    combinedUrl.includes('newgrounds.com') &&
    rights.authorizationType !== 'rights_holder_permission' &&
    rights.authorizationType !== 'verifiable_authorization' &&
    rights.authorizationType !== 'distribution_license'
  ) {
    return {
      valid: false,
      reason:
        'No se permite usar enlaces de Newgrounds sin licencia explícita de distribución o permiso verificable del titular.',
    };
  }

  return { valid: true };
}

function buildInitialCommunityLevels(): CommunityLevelEntry[] {
  const starters = getStarterCreatorTemplates();
  return starters.map((lvl, idx) => ({
    id: `comm-${lvl.levelId}`,
    level: lvl,
    creatorName: lvl.authorName || 'XanderAI Games',
    difficulty: lvl.difficulty,
    ratingAvg: idx === 0 ? 4.9 : 4.7,
    ratingCount: idx === 0 ? 128 : 84,
    plays: idx === 0 ? 2450 : 1620,
    downloads: idx === 0 ? 780 : 510,
    favorites: idx === 0 ? 340 : 215,
    comments: [
      {
        id: `c-init-${idx}`,
        authorName: 'XanderAI QA',
        text: 'Nivel oficial de demostración listo para jugar offline y editar en BeatFlow Creator.',
        createdAt: '2026-10-25T11:00:00Z',
      },
    ],
    reportCount: 0,
    moderationStatus: 'approved',
    publishedAt: lvl.creationDate,
  }));
}

class CommunityPlatformService {
  private remoteAdapter: CommunityRemoteAdapter | null = null;
  private previewCtx: AudioContext | null = null;
  private previewTimer: number | null = null;
  private previewPlayingId: string | null = null;

  public registerRemoteAdapter(adapter: CommunityRemoteAdapter): void {
    this.remoteAdapter = adapter;
  }

  public getMusicTracks(filters?: {
    query?: string;
    genre?: string;
    minBpm?: number;
    maxBpm?: number;
    favoritesOnly?: boolean;
  }): CommunityMusicTrack[] {
    let list: CommunityMusicTrack[] = [];
    try {
      const raw = localStorage.getItem(COMMUNITY_MUSIC_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CommunityMusicTrack[];
        if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
      }
    } catch {
      // ignore
    }
    if (list.length === 0) {
      list = [...BUILTIN_COMMUNITY_MUSIC];
      try {
        localStorage.setItem(COMMUNITY_MUSIC_KEY, JSON.stringify(list));
      } catch {
        // ignore
      }
    }

    const favs = this.getFavoriteIds('music');
    let result = list.filter((t) => t.moderationStatus !== 'removed');
    if (filters?.query?.trim()) {
      const q = filters.query.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.genre.toLowerCase().includes(q),
      );
    }
    if (filters?.genre && filters.genre !== 'all') {
      result = result.filter((t) => t.genre.toLowerCase().includes(filters.genre!.toLowerCase()));
    }
    if (filters?.minBpm) {
      result = result.filter((t) => t.bpm >= filters.minBpm!);
    }
    if (filters?.maxBpm) {
      result = result.filter((t) => t.bpm <= filters.maxBpm!);
    }
    if (filters?.favoritesOnly) {
      result = result.filter((t) => favs.has(t.id));
    }
    return result;
  }

  public submitAuthorizedMusicTrack(input: {
    title: string;
    artist: string;
    genre: string;
    bpm: number;
    durationSec: number;
    rights: AudioRightsDeclaration;
  }): { ok: boolean; track?: CommunityMusicTrack; error?: string } {
    const check = validateAudioRightsDeclaration(input.rights, input.rights.sourceUrl);
    if (!check.valid) {
      return { ok: false, error: check.reason };
    }
    if (!input.title.trim() || !input.artist.trim()) {
      return { ok: false, error: 'Título y artista son obligatorios.' };
    }

    const track: CommunityMusicTrack = {
      id: `xai-user-${Date.now().toString(36)}`,
      title: input.title.trim(),
      artist: input.artist.trim(),
      genre: input.genre.trim() || 'Electronic',
      durationSec: Math.max(15, Math.min(600, input.durationSec || 60)),
      bpm: Math.max(50, Math.min(240, input.bpm || 124)),
      palette: { primary: '#22d3ee', secondary: '#ec4899', accent: '#6366f1' },
      rights: { ...input.rights, verifiedAt: Date.now() },
      favorites: 0,
      plays: 0,
      downloads: 0,
      moderationStatus: 'approved',
      reportCount: 0,
      sampleSynthPreset: 'cyber_pulse',
      isBuiltin: false,
      uploadedAt: new Date().toISOString(),
    };

    const current = this.getAllRawMusic();
    const updated = [track, ...current];
    try {
      localStorage.setItem(COMMUNITY_MUSIC_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
    return { ok: true, track };
  }

  private getAllRawMusic(): CommunityMusicTrack[] {
    try {
      const raw = localStorage.getItem(COMMUNITY_MUSIC_KEY);
      if (raw) return JSON.parse(raw) as CommunityMusicTrack[];
    } catch {
      // ignore
    }
    return [...BUILTIN_COMMUNITY_MUSIC];
  }

  public getLevels(filters?: {
    query?: string;
    difficulty?: DifficultyLevel | 'all';
    sortBy?: 'popular' | 'rating' | 'recent';
    favoritesOnly?: boolean;
  }): CommunityLevelEntry[] {
    let list: CommunityLevelEntry[] = [];
    try {
      const raw = localStorage.getItem(COMMUNITY_LEVELS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CommunityLevelEntry[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          list = parsed.map((e) => ({
            ...e,
            level: migrateLevelDocument(e.level as unknown as Record<string, unknown>),
          }));
        }
      }
    } catch {
      // ignore
    }
    if (list.length === 0) {
      list = buildInitialCommunityLevels();
      this.saveAllLevels(list);
    }

    const favs = this.getFavoriteIds('level');
    let res = list.filter((e) => e.moderationStatus !== 'removed');

    if (filters?.query?.trim()) {
      const q = filters.query.toLowerCase();
      res = res.filter(
        (e) =>
          e.level.levelName.toLowerCase().includes(q) ||
          e.creatorName.toLowerCase().includes(q) ||
          e.level.audio.title.toLowerCase().includes(q),
      );
    }
    if (filters?.difficulty && filters.difficulty !== 'all') {
      res = res.filter((e) => e.difficulty === filters.difficulty);
    }
    if (filters?.favoritesOnly) {
      res = res.filter((e) => favs.has(e.id));
    }

    const sortBy = filters?.sortBy ?? 'popular';
    res.sort((a, b) => {
      if (sortBy === 'rating') return b.ratingAvg - a.ratingAvg;
      if (sortBy === 'recent') return b.publishedAt.localeCompare(a.publishedAt);
      return b.plays + b.downloads * 2 - (a.plays + a.downloads * 2);
    });
    return res;
  }

  private saveAllLevels(list: CommunityLevelEntry[]): void {
    try {
      localStorage.setItem(COMMUNITY_LEVELS_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }

  public publishLevel(
    level: BeatflowLevelDocument,
    creatorName: string,
  ): { ok: boolean; entry?: CommunityLevelEntry; error?: string } {
    const rightsCheck = validateAudioRightsDeclaration(
      level.audio.rights,
      level.audio.rights.sourceUrl,
    );
    if (!rightsCheck.valid) {
      return { ok: false, error: rightsCheck.reason };
    }
    const validation = validateLevelDocument(level, { requireCommunityRights: true });
    if (!validation.valid) {
      return {
        ok: false,
        error: validation.errors[0]?.message ?? 'El nivel contiene errores de validación.',
      };
    }

    const all = this.getLevels();
    const entry: CommunityLevelEntry = {
      id: `comm-${level.levelId}-${Date.now().toString(36)}`,
      level: structuredClone({
        ...level,
        authorName: creatorName.trim() || level.authorName,
      }),
      creatorName: creatorName.trim() || level.authorName,
      difficulty: level.difficulty,
      ratingAvg: 5.0,
      ratingCount: 1,
      plays: 1,
      downloads: 0,
      favorites: 0,
      comments: [],
      reportCount: 0,
      moderationStatus: 'approved',
      publishedAt: new Date().toISOString(),
    };
    this.saveAllLevels([entry, ...all]);
    void this.remoteAdapter?.publishLevelRemote?.(entry);
    return { ok: true, entry };
  }

  public rateLevel(entryId: string, stars: number): CommunityLevelEntry[] {
    const s = Math.max(1, Math.min(5, Math.round(stars)));
    const all = this.getRawAllLevels().map((e) => {
      if (e.id !== entryId) return e;
      const totalScore = e.ratingAvg * e.ratingCount + s;
      const nextCount = e.ratingCount + 1;
      return {
        ...e,
        ratingCount: nextCount,
        ratingAvg: Number((totalScore / nextCount).toFixed(2)),
      };
    });
    this.saveAllLevels(all);
    return this.getLevels();
  }

  public addComment(entryId: string, authorName: string, text: string): CommunityLevelEntry[] {
    const clean = text.trim();
    if (!clean) return this.getLevels();
    const comment: CommunityComment = {
      id: `cmt-${Date.now().toString(36)}`,
      authorName: authorName.trim() || 'Jugador BeatFlow',
      text: clean.slice(0, 280),
      createdAt: new Date().toISOString(),
    };
    const all = this.getRawAllLevels().map((e) =>
      e.id === entryId ? { ...e, comments: [comment, ...e.comments].slice(0, 30) } : e,
    );
    this.saveAllLevels(all);
    return this.getLevels();
  }

  public incrementStat(
    targetType: 'level' | 'music',
    id: string,
    field: 'plays' | 'downloads',
  ): void {
    if (targetType === 'level') {
      const all = this.getRawAllLevels().map((e) =>
        e.id === id ? { ...e, [field]: e[field] + 1 } : e,
      );
      this.saveAllLevels(all);
    } else {
      const all = this.getAllRawMusic().map((t) =>
        t.id === id ? { ...t, [field]: t[field] + 1 } : t,
      );
      try {
        localStorage.setItem(COMMUNITY_MUSIC_KEY, JSON.stringify(all));
      } catch {
        // ignore
      }
    }
  }

  public getFavoriteIds(kind: 'level' | 'music'): Set<string> {
    try {
      const raw = localStorage.getItem(COMMUNITY_FAVS_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw) as { level?: string[]; music?: string[] };
      return new Set(kind === 'level' ? (parsed.level ?? []) : (parsed.music ?? []));
    } catch {
      return new Set();
    }
  }

  public toggleFavorite(kind: 'level' | 'music', id: string): boolean {
    let data: { level: string[]; music: string[] } = { level: [], music: [] };
    try {
      const raw = localStorage.getItem(COMMUNITY_FAVS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { level?: string[]; music?: string[] };
        data = { level: p.level ?? [], music: p.music ?? [] };
      }
    } catch {
      // ignore
    }
    const list = kind === 'level' ? data.level : data.music;
    const exists = list.includes(id);
    const nextList = exists ? list.filter((x) => x !== id) : [...list, id];
    if (kind === 'level') data.level = nextList;
    else data.music = nextList;
    try {
      localStorage.setItem(COMMUNITY_FAVS_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }

    if (kind === 'level') {
      const all = this.getRawAllLevels().map((e) =>
        e.id === id ? { ...e, favorites: Math.max(0, e.favorites + (exists ? -1 : 1)) } : e,
      );
      this.saveAllLevels(all);
    } else {
      const all = this.getAllRawMusic().map((t) =>
        t.id === id ? { ...t, favorites: Math.max(0, t.favorites + (exists ? -1 : 1)) } : t,
      );
      try {
        localStorage.setItem(COMMUNITY_MUSIC_KEY, JSON.stringify(all));
      } catch {
        // ignore
      }
    }
    return !exists;
  }

  public reportContent(input: {
    targetType: 'level' | 'music';
    targetId: string;
    reason: ModerationReport['reason'];
    details: string;
  }): ModerationReport {
    const report: ModerationReport = {
      id: `rep-${Date.now().toString(36)}`,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      details: input.details.trim().slice(0, 400),
      reportedAt: new Date().toISOString(),
    };

    try {
      const raw = localStorage.getItem(COMMUNITY_REPORTS_KEY);
      const list = raw ? (JSON.parse(raw) as ModerationReport[]) : [];
      localStorage.setItem(COMMUNITY_REPORTS_KEY, JSON.stringify([report, ...list].slice(0, 100)));
    } catch {
      // ignore
    }

    // Immediate local moderation action: mark under_review, or removed on 2+ reports / copyright violation
    if (input.targetType === 'level') {
      const all = this.getRawAllLevels().map((e) => {
        if (e.id !== input.targetId) return e;
        const count = e.reportCount + 1;
        const status: CommunityLevelEntry['moderationStatus'] =
          input.reason === 'unauthorized_newgrounds' || count >= 2 ? 'removed' : 'under_review';
        return { ...e, reportCount: count, moderationStatus: status };
      });
      this.saveAllLevels(all);
    } else {
      const all = this.getAllRawMusic().map((t) => {
        if (t.id !== input.targetId) return t;
        const count = t.reportCount + 1;
        const status: CommunityMusicTrack['moderationStatus'] =
          input.reason === 'unauthorized_newgrounds' || count >= 2 ? 'removed' : 'under_review';
        return { ...t, reportCount: count, moderationStatus: status };
      });
      try {
        localStorage.setItem(COMMUNITY_MUSIC_KEY, JSON.stringify(all));
      } catch {
        // ignore
      }
    }

    return report;
  }

  private getRawAllLevels(): CommunityLevelEntry[] {
    try {
      const raw = localStorage.getItem(COMMUNITY_LEVELS_KEY);
      if (raw) return JSON.parse(raw) as CommunityLevelEntry[];
    } catch {
      // ignore
    }
    return buildInitialCommunityLevels();
  }

  /**
   * Procedural WebAudio preview synthesizer for authorized XanderAI Community Music tracks.
   * Ensures real audio playback works cleanly offline with zero third-party hotlinks.
   */
  public getPreviewPlayingId(): string | null {
    return this.previewPlayingId;
  }

  public stopTrackPreview(): void {
    if (this.previewTimer !== null) {
      window.clearInterval(this.previewTimer);
      this.previewTimer = null;
    }
    this.previewPlayingId = null;
    if (this.previewCtx) {
      void this.previewCtx.close().catch(() => {});
      this.previewCtx = null;
    }
  }

  public startTrackPreview(track: CommunityMusicTrack, onStop?: () => void): void {
    this.stopTrackPreview();
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.previewCtx = ctx;
    this.previewPlayingId = track.id;
    this.incrementStat('music', track.id, 'plays');

    const beatSec = 60 / Math.max(60, track.bpm);
    const scaleNotes =
      track.sampleSynthPreset === 'sunset_chill'
        ? [261.63, 329.63, 392.0, 493.88, 392.0, 329.63]
        : track.sampleSynthPreset === 'cosmic_arp'
          ? [293.66, 349.23, 440.0, 523.25, 587.33, 440.0]
          : track.sampleSynthPreset === 'synthwave_drive'
            ? [196.0, 246.94, 293.66, 392.0, 329.63, 246.94]
            : [220.0, 261.63, 329.63, 392.0, 440.0, 329.63];

    let step = 0;
    const triggerStep = () => {
      if (!this.previewCtx || this.previewPlayingId !== track.id) return;
      const now = this.previewCtx.currentTime;

      // Kick on downbeats
      if (step % 2 === 0) {
        const kick = this.previewCtx.createOscillator();
        const kGain = this.previewCtx.createGain();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(125, now);
        kick.frequency.exponentialRampToValueAtTime(42, now + 0.14);
        kGain.gain.setValueAtTime(0.22, now);
        kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        kick.connect(kGain);
        kGain.connect(this.previewCtx.destination);
        kick.start(now);
        kick.stop(now + 0.17);
      }

      // Melodic synth arp
      const osc = this.previewCtx.createOscillator();
      const gain = this.previewCtx.createGain();
      osc.type = track.sampleSynthPreset === 'sunset_chill' ? 'triangle' : 'sawtooth';
      const freq = scaleNotes[step % scaleNotes.length];
      osc.frequency.setValueAtTime(freq, now);
      const filter = this.previewCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1600, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.09, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + beatSec * 0.45);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.previewCtx.destination);
      osc.start(now);
      osc.stop(now + beatSec * 0.48);

      step++;
      if (step >= 32) {
        this.stopTrackPreview();
        onStop?.();
      }
    };

    triggerStep();
    this.previewTimer = window.setInterval(triggerStep, Math.round((beatSec * 1000) / 2));
  }
}

export const communityPlatform = new CommunityPlatformService();
