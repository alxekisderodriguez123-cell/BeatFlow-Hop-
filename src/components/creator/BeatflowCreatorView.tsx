import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlignCenterHorizontal,
  ArrowLeft,
  BoxSelect,
  CheckCircle2,
  ClipboardCopy,
  ClipboardPaste,
  CopyPlus,
  Download,
  FlipHorizontal2,
  FolderOpen,
  Globe,
  Hand,
  MousePointer2,
  Move,
  Music,
  Pause,
  Play,
  PlusSquare,
  Redo2,
  RotateCcw,
  Save,
  Scissors,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  Upload,
  Wand2,
} from 'lucide-react';
import type { QualityLevel } from '../../types/game';
import type {
  AudioRightsDeclaration,
  BeatflowLevelDocument,
  CreatorObjectType,
  ObjectCategory,
  RightsAuthorizationType,
} from '../../types/creator';
import { getLaneKeyCodes, getLaneKeyLabels } from '../../game/presets';
import { analyzeAudioBuffer } from '../../services/audioAnalyzer';
import { audioEngine } from '../../services/audioEngine';
import { extractPaletteFromCoverArt, parseMp3Id3Tags } from '../../services/id3Parser';
import { communityPlatform } from '../../services/communityPlatform';
import {
  deleteCreatorLevel,
  loadSavedCreatorLevels,
  saveCreatorLevel,
} from '../../services/creatorLevelsStorage';
import { CreatorCanvas, type CanvasPerfMetrics } from '../../creator/CreatorCanvas';
import { CreatorEditor, type EditorToolMode } from '../../creator/CreatorEditor';
import {
  createEmptyLevelDocument,
  deserializeLevelFromBfn,
  serializeLevelToBfn,
} from '../../creator/LevelSerializer';
import { validateLevelDocument } from '../../creator/LevelValidator';
import { LevelPlaytest, type PlaytestInspectionSnapshot } from '../../creator/LevelPlaytest';
import {
  OBJECT_CATEGORY_LABELS,
  OBJECT_LIBRARY_TEMPLATES,
} from '../../creator/ObjectLibrary';
import { extractWaveformPeaks, type BeatSnapDivision } from '../../creator/TimelineEditor';
import { ObjectInspectorPanel } from './ObjectInspectorPanel';
import { TimelineEditorPanel } from './TimelineEditorPanel';

interface BeatflowCreatorViewProps {
  initialLevel?: BeatflowLevelDocument | null;
  initialLaunchPlaytest?: boolean;
  deviceQuality: QualityLevel;
  onBack: () => void;
  onOpenCommunity: () => void;
}

export const BeatflowCreatorView: React.FC<BeatflowCreatorViewProps> = ({
  initialLevel,
  initialLaunchPlaytest = false,
  deviceQuality,
  onBack,
  onOpenCommunity,
}) => {
  const editorRef = useRef<CreatorEditor | null>(null);
  if (!editorRef.current) {
    const startDoc = initialLevel ?? loadSavedCreatorLevels()[0] ?? createEmptyLevelDocument();
    editorRef.current = new CreatorEditor(startDoc);
  }

  const canvasHostRef = useRef<HTMLDivElement>(null);
  const canvasCtrlRef = useRef<CreatorCanvas | null>(null);
  const playtestRef = useRef<LevelPlaytest | null>(null);
  const mp3InputRef = useRef<HTMLInputElement>(null);
  const bfnInputRef = useRef<HTMLInputElement>(null);

  const [snapshot, setSnapshot] = useState(() => editorRef.current!.getSnapshot());
  const [cursorTime, setCursorTime] = useState(0);
  const [placeTemplate, setPlaceTemplate] = useState<CreatorObjectType>('note_tap');
  const [libCategory, setLibCategory] = useState<ObjectCategory | 'all'>('all');
  const [libSearch, setLibSearch] = useState('');
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [hasAudioBuffer, setHasAudioBuffer] = useState(false);
  const [analyzingAudio, setAnalyzingAudio] = useState(false);

  const [playtestSpeed, setPlaytestSpeed] = useState(1.0);
  const [visualOnlyPlaytest, setVisualOnlyPlaytest] = useState(false);
  const [playtestActive, setPlaytestActive] = useState(false);
  const [playtestPaused, setPlaytestPaused] = useState(false);
  const [inspectSnap, setInspectSnap] = useState<PlaytestInspectionSnapshot | null>(null);
  const [perfMetrics, setPerfMetrics] = useState<CanvasPerfMetrics>({
    fps: 60,
    drawCalls: 0,
    visibleObjects: 0,
    instancedDecorCount: 0,
  });

  const [mobileTab, setMobileTab] = useState<'canvas' | 'objects' | 'inspector'>('canvas');
  const [levelsDrawerOpen, setLevelsDrawerOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [autoPatternOpen, setAutoPatternOpen] = useState(false);
  const [savedLevels, setSavedLevels] = useState<BeatflowLevelDocument[]>(() =>
    loadSavedCreatorLevels(),
  );
  const [toast, setToast] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);

  // Auto-Pattern state
  const [pendingProfile, setPendingProfile] = useState<Awaited<ReturnType<typeof analyzeAudioBuffer>> | null>(null);

  // Publish modal state
  const [pubCreatorName, setPubCreatorName] = useState(snapshot.level.authorName || 'XanderAI Creator');
  const [pubAuthType, setPubAuthType] = useState<RightsAuthorizationType>(
    snapshot.level.audio.rights.authorizationType,
  );
  const [pubLicenseName, setPubLicenseName] = useState(snapshot.level.audio.rights.licenseName);
  const [pubRightsHolder, setPubRightsHolder] = useState(snapshot.level.audio.rights.rightsHolder);
  const [pubSourceUrl, setPubSourceUrl] = useState(snapshot.level.audio.rights.sourceUrl ?? '');
  const [pubAllowRemix, setPubAllowRemix] = useState(
    snapshot.level.audio.rights.allowRemixAndLevelUse,
  );

  const cursorTimeRef = useRef(cursorTime);
  cursorTimeRef.current = cursorTime;
  const placeTemplateRef = useRef(placeTemplate);
  placeTemplateRef.current = placeTemplate;

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((cur) => (cur === msg ? null : cur));
    }, 3600);
  }, []);

  const refreshSnapshot = useCallback(() => {
    if (!editorRef.current) return;
    const snap = editorRef.current.getSnapshot();
    setSnapshot(snap);
    playtestRef.current?.syncLevel(snap.level, deviceQuality);
    canvasCtrlRef.current?.syncState(
      snap.level,
      snap.selectedIds,
      snap.activeTool,
      cursorTimeRef.current,
      playtestRef.current,
    );
  }, [deviceQuality]);

  // Mount Three.js CreatorCanvas & LevelPlaytest once
  useEffect(() => {
    if (!canvasHostRef.current || !editorRef.current) return;
    const initialDoc = editorRef.current.getLevel();
    const playtest = new LevelPlaytest(initialDoc, deviceQuality);
    playtestRef.current = playtest;

    const canvas = new CreatorCanvas(canvasHostRef.current, initialDoc, {
      onSelectIds: (ids, additive) => {
        editorRef.current?.selectMany(ids, additive);
        refreshSnapshot();
      },
      onPlaceAt: (timeSec, lane, worldPos) => {
        editorRef.current?.placeObject(placeTemplateRef.current, {
          timeSec,
          lane,
          position: worldPos,
        });
        refreshSnapshot();
      },
      onMoveSelectedDelta: (dx, dy, dTimeSec) => {
        const ed = editorRef.current;
        if (!ed) return;
        const sel = new Set(ed.getSnapshot().selectedIds);
        ed.mutateObjects(
          (objs) =>
            objs.map((o) => {
              if (!sel.has(o.id) || o.locked) return o;
              const nextTime = Math.max(0, Number((o.timeSec + dTimeSec).toFixed(3)));
              return {
                ...o,
                timeSec: nextTime,
                position: {
                  ...o.position,
                  x: Number((o.position.x + dx).toFixed(2)),
                  y: Number(Math.max(0, o.position.y + dy).toFixed(2)),
                },
              };
            }),
          false,
        );
        refreshSnapshot();
      },
      onContextLossChange: (lost) => setContextLost(lost),
    });
    canvasCtrlRef.current = canvas;

    if (initialLaunchPlaytest) {
      playtest.start({
        startTimeSec: 0,
        speedScale: 1,
        visualOnly: false,
        hasAudioBuffer: false,
        deviceQuality,
      });
      setPlaytestActive(true);
      setPlaytestPaused(false);
    }

    return () => {
      playtest.stop();
      audioEngine.stopMusic();
      canvas.dispose();
      canvasCtrlRef.current = null;
      playtestRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync canvas whenever cursor or snapshot changes
  useEffect(() => {
    canvasCtrlRef.current?.syncState(
      snapshot.level,
      snapshot.selectedIds,
      snapshot.activeTool,
      cursorTime,
      playtestRef.current,
    );
  }, [snapshot, cursorTime]);

  // Poll inspection & perf telemetry smoothly
  useEffect(() => {
    const id = window.setInterval(() => {
      if (canvasCtrlRef.current) {
        setPerfMetrics(canvasCtrlRef.current.getPerfMetrics());
      }
      if (playtestRef.current && playtestActive) {
        const snap = playtestRef.current.getInspectionSnapshot();
        setInspectSnap(snap);
        setCursorTime(snap.currentTime);
        if (!snap.running && playtestActive) {
          setPlaytestActive(false);
          setPlaytestPaused(false);
        }
      }
    }, 90);
    return () => window.clearInterval(id);
  }, [playtestActive]);

  const startPlaytest = useCallback(
    (fromStart: boolean) => {
      const pt = playtestRef.current;
      const ed = editorRef.current;
      if (!pt || !ed) return;
      const doc = ed.getLevel();
      const startAt = fromStart ? 0 : cursorTimeRef.current;
      pt.syncLevel(doc, deviceQuality);
      pt.start({
        startTimeSec: startAt,
        speedScale: playtestSpeed,
        visualOnly: visualOnlyPlaytest,
        hasAudioBuffer,
        deviceQuality,
      });
      setPlaytestActive(true);
      setPlaytestPaused(false);
      setInspectSnap(pt.getInspectionSnapshot());
    },
    [deviceQuality, hasAudioBuffer, playtestSpeed, visualOnlyPlaytest],
  );

  const stopPlaytest = useCallback(() => {
    playtestRef.current?.stop();
    setPlaytestActive(false);
    setPlaytestPaused(false);
  }, []);

  // Playtest Keyboard Lane Input + Editor Shortcuts
  useEffect(() => {
    const laneCount = snapshot.level.gameplayRules.laneCount;
    const codes = getLaneKeyCodes(laneCount);

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }

      if (playtestActive && playtestRef.current) {
        if (e.code === 'Escape') {
          e.preventDefault();
          stopPlaytest();
          return;
        }
        for (let i = 0; i < codes.length; i++) {
          if (codes[i].includes(e.code)) {
            e.preventDefault();
            playtestRef.current.handleLaneInput(i);
            return;
          }
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) editorRef.current?.redo();
        else editorRef.current?.undo();
        refreshSnapshot();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        editorRef.current?.copySelected();
        refreshSnapshot();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        editorRef.current?.pasteAtTime(cursorTimeRef.current);
        refreshSnapshot();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        editorRef.current?.deleteSelected();
        refreshSnapshot();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!playtestActive || !playtestRef.current) return;
      for (let i = 0; i < codes.length; i++) {
        if (codes[i].includes(e.code)) {
          playtestRef.current.handleLaneRelease(i);
          return;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [playtestActive, snapshot.level.gameplayRules.laneCount, refreshSnapshot, stopPlaytest]);

  const handleImportMp3 = async (file: File) => {
    setAnalyzingAudio(true);
    try {
      const buf = await audioEngine.decodeBlob(file);
      audioEngine.setBuffer(buf);
      setHasAudioBuffer(true);
      setWaveformPeaks(extractWaveformPeaks(buf, 260));

      const arrBuf = await file.arrayBuffer();
      const id3 = parseMp3Id3Tags(arrBuf);
      const coverPalette = id3.coverArtDataUrl
        ? await extractPaletteFromCoverArt(id3.coverArtDataUrl)
        : snapshot.level.audio.palette;

      const profile = await analyzeAudioBuffer(buf);
      setPendingProfile(profile);

      editorRef.current?.mutateLevel((doc) => ({
        ...doc,
        audio: {
          ...doc.audio,
          title: id3.title || file.name.replace(/\.[^/.]+$/, ''),
          artist: id3.artist || 'Artista Local',
          durationSec: Number(buf.duration.toFixed(2)),
          bpm: Math.round(profile.bpm || doc.audio.bpm),
          palette: coverPalette,
        },
      }));
      refreshSnapshot();
      setAutoPatternOpen(true);
      notify(`Audio analizado (${Math.round(profile.bpm)} BPM) y waveform cargado.`);
    } catch {
      notify('No se pudo decodificar este archivo de audio.');
    } finally {
      setAnalyzingAudio(false);
    }
  };

  const handleExportBfn = () => {
    const doc = editorRef.current!.getLevel();
    const json = serializeLevelToBfn(doc);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.levelName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'nivel'}.bfn`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Nivel exportado en formato .bfn');
  };

  const handleImportBfn = async (file: File) => {
    try {
      const text = await file.text();
      const res = deserializeLevelFromBfn(text);
      if (!res.ok || !res.level) {
        notify(res.error ?? 'No se pudo importar el archivo .bfn');
        return;
      }
      editorRef.current?.setLevel(res.level, true);
      refreshSnapshot();
      setSavedLevels(saveCreatorLevel(res.level));
      notify(`Nivel "${res.level.levelName}" importado correctamente.`);
    } catch {
      notify('Error al leer el archivo .bfn.');
    }
  };

  const handlePublishSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rights: AudioRightsDeclaration = {
      authorizationType: pubAuthType,
      licenseName: pubLicenseName,
      rightsHolder: pubRightsHolder,
      sourceUrl: pubSourceUrl.trim() || undefined,
      allowRemixAndLevelUse: pubAllowRemix,
    };

    editorRef.current?.mutateLevel((doc) => ({
      ...doc,
      authorName: pubCreatorName,
      audio: { ...doc.audio, rights },
    }));
    const updatedDoc = editorRef.current!.getLevel();
    const res = communityPlatform.publishLevel(updatedDoc, pubCreatorName);
    if (!res.ok) {
      notify(res.error ?? 'Error al publicar en Comunidad XanderAI.');
      return;
    }
    setSavedLevels(saveCreatorLevel(updatedDoc));
    setPublishOpen(false);
    notify('Nivel publicado en Comunidad XanderAI Games.');
  };

  const filteredTemplates = OBJECT_LIBRARY_TEMPLATES.filter((t) => {
    if (libCategory !== 'all' && t.category !== libCategory) return false;
    if (libSearch.trim()) {
      const q = libSearch.toLowerCase();
      return (
        t.label.toLowerCase().includes(q) ||
        t.shortLabel.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const validationReport = validateLevelDocument(snapshot.level);
  const laneLabels = getLaneKeyLabels(snapshot.level.gameplayRules.laneCount);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[#040713] text-slate-100 overflow-hidden select-none">
      {/* Top Studio Bar */}
      <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#070b1e] border-b border-cyan-400/25 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => {
              stopPlaytest();
              onBack();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Menú</span>
          </button>

          <input
            type="text"
            value={snapshot.level.levelName}
            onChange={(e) => {
              editorRef.current?.mutateLevel(
                (doc) => ({ ...doc, levelName: e.target.value }),
                false,
              );
              refreshSnapshot();
            }}
            className="w-36 sm:w-52 bg-black/40 border border-cyan-400/30 rounded-lg px-2.5 py-1 text-xs sm:text-sm font-bold text-white truncate"
            aria-label="Nombre del nivel"
          />

          <label className="hidden md:flex items-center gap-1 text-xs bg-black/40 border border-white/15 rounded-lg px-2 py-1">
            <span className="text-slate-400">BPM</span>
            <input
              type="number"
              min="40"
              max="260"
              value={snapshot.level.audio.bpm}
              onChange={(e) => {
                editorRef.current?.mutateLevel((doc) => ({
                  ...doc,
                  audio: { ...doc.audio, bpm: Math.max(40, Math.min(260, Number(e.target.value) || 120)) },
                }));
                refreshSnapshot();
              }}
              className="w-12 bg-transparent font-mono-num text-cyan-300 font-bold text-center outline-none"
            />
          </label>
        </div>

        {/* Playtest Controls */}
        <div className="flex items-center gap-1.5">
          {!playtestActive ? (
            <>
              <button
                type="button"
                onClick={() => startPlaytest(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:brightness-110 text-white text-xs font-bold shadow-[0_0_16px_rgba(34,211,238,0.35)] cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Playtest</span>
              </button>
              <button
                type="button"
                onClick={() => setVisualOnlyPlaytest((v) => !v)}
                className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                  visualOnlyPlaytest
                    ? 'bg-fuchsia-500/25 border-fuchsia-400 text-fuchsia-100'
                    : 'bg-white/5 border-white/15 text-slate-300'
                }`}
                title="Alternar entre Gameplay completo y Solo Visual"
              >
                {visualOnlyPlaytest ? 'Solo Visual' : 'Gameplay'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  if (!playtestRef.current) return;
                  if (playtestPaused) {
                    playtestRef.current.resume();
                    setPlaytestPaused(false);
                  } else {
                    playtestRef.current.pause();
                    setPlaytestPaused(true);
                  }
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/25 border border-amber-400/50 text-amber-100 text-xs font-bold cursor-pointer"
              >
                {playtestPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{playtestPaused ? 'Reanudar' : 'Pausa'}</span>
              </button>
              <button
                type="button"
                onClick={stopPlaytest}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/25 border border-rose-400/50 text-rose-100 text-xs font-bold cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Volver al Editor</span>
              </button>
            </>
          )}

          <select
            value={playtestSpeed}
            onChange={(e) => {
              const s = Number(e.target.value);
              setPlaytestSpeed(s);
              playtestRef.current?.setSpeedScale(s);
            }}
            className="bg-black/45 border border-white/15 rounded-lg px-1.5 py-1.5 text-[11px] font-mono-num"
            aria-label="Velocidad de playtest"
          >
            <option value={0.5}>0.5x</option>
            <option value={0.75}>0.75x</option>
            <option value={1}>1.0x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2.0x</option>
          </select>
        </div>

        {/* File, Audio & Community Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!snapshot.canUndo}
            onClick={() => {
              editorRef.current?.undo();
              refreshSnapshot();
            }}
            className="p-1.5 rounded-lg bg-white/5 border border-white/15 disabled:opacity-35 cursor-pointer"
            title="Deshacer (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={!snapshot.canRedo}
            onClick={() => {
              editorRef.current?.redo();
              refreshSnapshot();
            }}
            className="p-1.5 rounded-lg bg-white/5 border border-white/15 disabled:opacity-35 cursor-pointer"
            title="Rehacer"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => mp3InputRef.current?.click()}
            disabled={analyzingAudio}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-400/40 text-indigo-100 text-xs font-semibold cursor-pointer"
            title="Cargar MP3 local y analizar BPM/Waveform"
          >
            <Music className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{analyzingAudio ? 'Analizando...' : 'MP3'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const updated = saveCreatorLevel(editorRef.current!.getLevel());
              setSavedLevels(updated);
              notify('Nivel guardado localmente.');
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 text-xs font-semibold cursor-pointer"
            title="Guardar localmente"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Guardar</span>
          </button>

          <button
            type="button"
            onClick={handleExportBfn}
            className="p-1.5 rounded-lg bg-white/5 border border-white/15 text-cyan-200 cursor-pointer"
            title="Exportar .bfn"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => bfnInputRef.current?.click()}
            className="p-1.5 rounded-lg bg-white/5 border border-white/15 text-cyan-200 cursor-pointer"
            title="Importar .bfn"
          >
            <Upload className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setLevelsDrawerOpen((v) => !v)}
            className="p-1.5 rounded-lg bg-white/5 border border-white/15 text-slate-200 cursor-pointer"
            title="Mis Niveles Guardados"
          >
            <FolderOpen className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-fuchsia-600/80 hover:bg-fuchsia-500 text-white text-xs font-bold cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Publicar</span>
          </button>
        </div>

        <input
          ref={mp3InputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImportMp3(f);
            e.target.value = '';
          }}
        />
        <input
          ref={bfnInputRef}
          type="file"
          accept=".bfn,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImportBfn(f);
            e.target.value = '';
          }}
        />
      </header>

      {/* Mobile View Switcher */}
      <div className="lg:hidden grid grid-cols-3 bg-[#080c22] border-b border-white/10 text-xs font-semibold shrink-0">
        {(['canvas', 'objects', 'inspector'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setMobileTab(t)}
            className={`py-2 cursor-pointer ${
              mobileTab === t ? 'text-cyan-300 border-b-2 border-cyan-400 bg-cyan-500/10' : 'text-slate-400'
            }`}
          >
            {t === 'canvas' ? 'Lienzo 3D' : t === 'objects' ? 'Objetos' : 'Inspector'}
          </button>
        ))}
      </div>

      {/* Main Studio Workspace */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        {/* Left Dock: Tools & Object Library */}
        <aside
          className={`${
            mobileTab === 'objects' ? 'flex w-full' : 'hidden'
          } lg:flex lg:w-64 xl:w-72 flex-col bg-[#070b1e]/95 border-r border-cyan-400/20 shrink-0 min-h-0`}
        >
          {/* Tool Selector */}
          <div className="p-2 border-b border-white/10 grid grid-cols-4 gap-1">
            {(
              [
                { id: 'select', label: 'Sel', icon: MousePointer2 },
                { id: 'box_select', label: 'Región', icon: BoxSelect },
                { id: 'move', label: 'Mover', icon: Move },
                { id: 'place', label: 'Colocar', icon: PlusSquare },
              ] as Array<{ id: EditorToolMode; label: string; icon: React.ComponentType<{ className?: string }> }>
            ).map((tool) => {
              const Icon = tool.icon;
              const active = snapshot.activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => {
                    editorRef.current?.setTool(tool.id);
                    refreshSnapshot();
                  }}
                  className={`flex flex-col items-center justify-center py-1.5 rounded-lg border text-[10px] font-semibold cursor-pointer ${
                    active
                      ? 'bg-cyan-500/25 border-cyan-400 text-white'
                      : 'bg-white/[0.03] border-white/10 text-slate-300 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 mb-0.5" />
                  <span>{tool.label}</span>
                </button>
              );
            })}
          </div>

          {/* Clipboard & Alignment Quick Actions */}
          <div className="p-2 border-b border-white/10 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => {
                editorRef.current?.copySelected();
                refreshSnapshot();
              }}
              className="p-1.5 rounded bg-white/5 border border-white/10 text-slate-200 hover:text-cyan-300 cursor-pointer"
              title="Copiar"
            >
              <ClipboardCopy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                editorRef.current?.cutSelected();
                refreshSnapshot();
              }}
              className="p-1.5 rounded bg-white/5 border border-white/10 text-slate-200 hover:text-cyan-300 cursor-pointer"
              title="Cortar"
            >
              <Scissors className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                editorRef.current?.pasteAtTime(cursorTime);
                refreshSnapshot();
              }}
              className="p-1.5 rounded bg-white/5 border border-white/10 text-slate-200 hover:text-cyan-300 cursor-pointer"
              title="Pegar en cursor"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                editorRef.current?.duplicateSelected(1);
                refreshSnapshot();
              }}
              className="p-1.5 rounded bg-white/5 border border-white/10 text-slate-200 hover:text-cyan-300 cursor-pointer"
              title="Duplicar"
            >
              <CopyPlus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                editorRef.current?.alignSelected('snap_beat');
                refreshSnapshot();
              }}
              className="p-1.5 rounded bg-white/5 border border-white/10 text-slate-200 hover:text-cyan-300 cursor-pointer"
              title="Alinear al Beat"
            >
              <AlignCenterHorizontal className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                editorRef.current?.alignSelected('mirror_x');
                refreshSnapshot();
              }}
              className="p-1.5 rounded bg-white/5 border border-white/10 text-slate-200 hover:text-cyan-300 cursor-pointer"
              title="Espejo horizontal"
            >
              <FlipHorizontal2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                editorRef.current?.deleteSelected();
                refreshSnapshot();
              }}
              className="p-1.5 rounded bg-rose-500/15 border border-rose-400/30 text-rose-300 hover:text-white cursor-pointer"
              title="Eliminar selección"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => canvasCtrlRef.current?.resetCameraView()}
              className="p-1.5 rounded bg-white/5 border border-white/10 text-slate-200 hover:text-cyan-300 cursor-pointer ml-auto"
              title="Centrar vista 3D"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Object Library Filter & Search */}
          <div className="p-2 border-b border-white/10 space-y-1.5">
            <input
              type="text"
              placeholder="Buscar objeto o trigger..."
              value={libSearch}
              onChange={(e) => setLibSearch(e.target.value)}
              className="w-full bg-black/40 border border-white/15 rounded-lg px-2.5 py-1 text-xs"
            />
            <div className="flex flex-wrap gap-1">
              {(['all', 'gameplay', 'decoration', 'effects', 'control'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setLibCategory(cat)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${
                    libCategory === cat
                      ? 'bg-cyan-500/25 border-cyan-400 text-white'
                      : 'bg-black/30 border-white/10 text-slate-400'
                  }`}
                >
                  {OBJECT_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          {/* Library Grid */}
          <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-1.5 content-start">
            {filteredTemplates.map((tpl) => {
              const selected = placeTemplate === tpl.type;
              return (
                <button
                  key={tpl.type}
                  type="button"
                  onClick={() => {
                    setPlaceTemplate(tpl.type);
                    editorRef.current?.placeObject(tpl.type, {
                      timeSec: cursorTime,
                      lane: tpl.category === 'gameplay' ? 1 : -1,
                    });
                    refreshSnapshot();
                  }}
                  className={`flex flex-col items-start gap-1 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                    selected
                      ? 'bg-cyan-500/20 border-cyan-400 text-white'
                      : 'bg-[#0b122b] border-white/10 text-slate-200 hover:border-cyan-400/50'
                  }`}
                  title={tpl.description}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className="w-3 h-3 rounded-sm border border-white/30"
                      style={{ backgroundColor: tpl.defaultColor }}
                    />
                    <span className="text-[9px] uppercase text-slate-400">{tpl.category.slice(0, 4)}</span>
                  </div>
                  <span className="text-[11px] font-bold leading-tight">{tpl.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center 3D Viewport + Playtest Overlay */}
        <main
          className={`${
            mobileTab === 'canvas' ? 'flex' : 'hidden'
          } lg:flex flex-1 flex-col relative min-w-0 min-h-0`}
        >
          <div ref={canvasHostRef} className="relative flex-1 min-h-0 w-full overflow-hidden">
            {contextLost && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#050819]/90 text-sm text-cyan-200">
                Recuperando contexto gráfico 3D...
              </div>
            )}

            {/* Screen FX Flash Overlay during Playtest */}
            {playtestActive && inspectSnap && inspectSnap.effectsState.screenFlash > 0.01 && (
              <div
                className="pointer-events-none absolute inset-0 z-10"
                style={{
                  backgroundColor: inspectSnap.effectsState.flashColor,
                  opacity: inspectSnap.effectsState.screenFlash * 0.45,
                }}
              />
            )}

            {/* Floating Viewport Top Overlay: Inspector / Validator / Stats */}
            <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-start justify-between pointer-events-none gap-2">
              <div className="pointer-events-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDebugOpen((v) => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                    validationReport.valid
                      ? 'bg-[#070b1e]/90 border-cyan-400/40 text-cyan-200'
                      : 'bg-rose-950/90 border-rose-400/60 text-rose-200'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>
                    {perfMetrics.fps} FPS · {snapshot.level.objects.length} obj
                    {!validationReport.valid ? ` · ${validationReport.errors.length} err` : ''}
                  </span>
                </button>
              </div>

              {playtestActive && inspectSnap && (
                <div className="pointer-events-auto flex items-center gap-3 px-3 py-1.5 rounded-xl bg-[#050818]/92 border border-cyan-400/45 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400">PUNTOS</div>
                    <div className="font-mono-num font-bold text-white">
                      {inspectSnap.gameplay.score.toLocaleString('es-ES')}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">COMBO</div>
                    <div className="font-mono-num font-bold text-cyan-300">
                      x{inspectSnap.gameplay.combo}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">FALLOS</div>
                    <div className="font-mono-num font-bold text-rose-300">
                      {inspectSnap.gameplay.misses}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Playtest Judgment Callout */}
            {playtestActive && inspectSnap?.gameplay.lastJudgment && (
              <div className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 z-20 text-center">
                <div className="font-display font-extrabold text-lg tracking-wider text-cyan-200 drop-shadow">
                  {inspectSnap.gameplay.lastJudgment.label}
                </div>
              </div>
            )}

            {/* Debug & Validator Popover */}
            {debugOpen && (
              <div className="absolute top-12 left-2.5 z-30 w-72 max-h-[65%] overflow-y-auto rounded-xl bg-[#070b1e]/96 border border-cyan-400/40 p-3 text-xs space-y-2.5 shadow-2xl">
                <div className="flex items-center justify-between font-bold text-cyan-200">
                  <span>Inspector Runtime & Validador</span>
                  <button
                    type="button"
                    onClick={() => setDebugOpen(false)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    ×
                  </button>
                </div>

                <div className="text-[11px] text-slate-300 space-y-0.5">
                  <div>Draw Calls: <strong className="font-mono-num">{perfMetrics.drawCalls}</strong></div>
                  <div>Instanced Cubes: <strong className="font-mono-num">{perfMetrics.instancedDecorCount}</strong></div>
                  {inspectSnap && (
                    <div>
                      Grupos Activos:{' '}
                      <strong className="font-mono-num text-fuchsia-300">
                        {inspectSnap.activeGroupIds.map((g) => `G${g}`).join(', ') || 'Ninguno'}
                      </strong>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="font-bold text-[11px] text-amber-300">Validación (.bfn)</div>
                  {validationReport.errors.length === 0 && validationReport.warnings.length === 0 && (
                    <div className="flex items-center gap-1 text-emerald-300 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Sin errores detectados.
                    </div>
                  )}
                  {validationReport.errors.map((err, i) => (
                    <div key={i} className="text-rose-300 text-[11px]">• {err.message}</div>
                  ))}
                  {validationReport.warnings.map((w, i) => (
                    <div key={i} className="text-amber-200/80 text-[11px]">• {w.message}</div>
                  ))}
                </div>

                {inspectSnap && inspectSnap.triggerLog.length > 0 && (
                  <div className="space-y-1">
                    <div className="font-bold text-[11px] text-cyan-300">Triggers Recientes</div>
                    {inspectSnap.triggerLog.slice(0, 8).map((entry) => (
                      <div key={entry.id} className="text-[10px] text-slate-300 font-mono-num">
                        [{entry.timeSec.toFixed(2)}s] {entry.detail}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Interactive Gameplay Playtest Touch Lanes / Touch Zones */}
            {playtestActive && !visualOnlyPlaytest && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-xl flex flex-col gap-1.5">
                {snapshot.level.gameplayRules.enableTouchZones && (
                  <div
                    onPointerDown={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                      playtestRef.current?.handleTouchZoneTap(nx);
                    }}
                    className="w-full py-2 rounded-xl bg-fuchsia-500/20 border border-fuchsia-400/50 text-center text-[11px] font-bold text-fuchsia-100 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Hand className="w-3.5 h-3.5" />
                    <span>ZONA TÁCTIL LIBRE (Toca cualquier punto horizontal)</span>
                  </div>
                )}
                <div
                  className="grid gap-1.5"
                  style={{
                    gridTemplateColumns: `repeat(${snapshot.level.gameplayRules.laneCount}, minmax(0, 1fr))`,
                  }}
                >
                  {laneLabels.map((lbl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onPointerDown={() => playtestRef.current?.handleLaneInput(idx)}
                      onPointerUp={() => playtestRef.current?.handleLaneRelease(idx)}
                      className="py-3 rounded-xl bg-[#070b1e]/85 active:bg-cyan-500/40 border border-cyan-400/45 text-xs font-bold text-cyan-200 cursor-pointer"
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Right Dock: ObjectInspectorPanel */}
        <aside
          className={`${
            mobileTab === 'inspector' ? 'flex w-full' : 'hidden'
          } lg:flex lg:w-72 xl:w-80 flex-col shrink-0 min-h-0`}
        >
          <ObjectInspectorPanel
            level={snapshot.level}
            selectedIds={snapshot.selectedIds}
            onMutateObjects={(upd) => {
              editorRef.current?.mutateObjects(upd);
              refreshSnapshot();
            }}
            onMutateLevel={(upd) => {
              editorRef.current?.mutateLevel(upd);
              refreshSnapshot();
            }}
            onCreateGroup={(name, assign) => {
              editorRef.current?.createGroup(name, assign);
              refreshSnapshot();
            }}
            onAssignGroup={(gid) => {
              editorRef.current?.assignGroupToSelected(gid);
              refreshSnapshot();
            }}
            onRemoveGroup={(gid) => {
              editorRef.current?.removeGroupFromSelected(gid);
              refreshSnapshot();
            }}
            onMergeGroups={(src, dst) => {
              editorRef.current?.mergeGroups(src, dst);
              refreshSnapshot();
            }}
            onToggleGroupProp={(gid, prop) => {
              editorRef.current?.toggleGroupProp(gid, prop);
              refreshSnapshot();
            }}
            onSelectGroup={(gid) => {
              editorRef.current?.selectGroup(gid);
              refreshSnapshot();
            }}
          />
        </aside>
      </div>

      {/* Bottom Timeline Editor */}
      <TimelineEditorPanel
        level={snapshot.level}
        cursorTime={cursorTime}
        snapDivision={snapshot.snapDivision}
        waveformPeaks={waveformPeaks}
        selectedIds={snapshot.selectedIds}
        onSeekTime={(t) => {
          setCursorTime(t);
          if (!playtestActive) playtestRef.current?.scrubPreviewAt(t);
        }}
        onChangeSnap={(div: BeatSnapDivision) => {
          editorRef.current?.setSnapDivision(div);
          refreshSnapshot();
        }}
        onSelectObjectId={(id, add) => {
          editorRef.current?.selectSingle(id, add);
          refreshSnapshot();
        }}
        onAddMarker={(m) => {
          editorRef.current?.addMarker(m);
          refreshSnapshot();
        }}
        onRemoveMarker={(id) => {
          editorRef.current?.removeMarker(id);
          refreshSnapshot();
        }}
        onAddKeyframe={(kf) => {
          editorRef.current?.addKeyframe(kf);
          refreshSnapshot();
        }}
        onDuplicateSelected={() => {
          editorRef.current?.duplicateSelected(1);
          refreshSnapshot();
        }}
        onPlaytestFromCursor={() => startPlaytest(false)}
      />

      {/* Saved Levels Drawer */}
      {levelsDrawerOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#070b1e] border border-cyan-400/40 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-white">Mis Niveles Locales (.bfn)</h3>
              <button
                type="button"
                onClick={() => setLevelsDrawerOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                Cerrar
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const blank = createEmptyLevelDocument();
                  editorRef.current?.setLevel(blank, true);
                  refreshSnapshot();
                  setLevelsDrawerOpen(false);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500/25 border border-cyan-400/50 text-xs font-bold text-cyan-100 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                Nuevo Nivel Vacío
              </button>
              <button
                type="button"
                onClick={() => {
                  setLevelsDrawerOpen(false);
                  onOpenCommunity();
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-fuchsia-500/25 border border-fuchsia-400/50 text-xs font-bold text-fuchsia-100 cursor-pointer"
              >
                <Globe className="w-4 h-4" />
                Explorar Comunidad
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-2">
              {savedLevels.map((lvl) => (
                <div
                  key={lvl.levelId}
                  className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#0b122b] border border-white/10"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-white truncate">{lvl.levelName}</div>
                    <div className="text-xs text-slate-400">
                      {lvl.environmentTheme} · {lvl.audio.bpm} BPM · {lvl.objects.length} objetos
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        editorRef.current?.setLevel(lvl, true);
                        refreshSnapshot();
                        setLevelsDrawerOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/25 border border-cyan-400/45 text-xs font-bold text-cyan-100 cursor-pointer"
                    >
                      Abrir
                    </button>
                    <button
                      type="button"
                      onClick={() => setSavedLevels(deleteCreatorLevel(lvl.levelId))}
                      className="p-1.5 rounded-lg bg-rose-500/15 border border-rose-400/35 text-rose-300 cursor-pointer"
                      title="Eliminar nivel"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Optional Auto-Pattern Assistant Modal after MP3 Analysis */}
      {autoPatternOpen && pendingProfile && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#070b1e] border border-indigo-400/45 p-5 space-y-3">
            <div className="flex items-center gap-2 font-display font-bold text-base text-white">
              <Wand2 className="w-5 h-5 text-cyan-300" />
              <span>Asistente Opcional de Patrón Base</span>
            </div>
            <p className="text-xs text-slate-300">
              Se analizó la canción ({Math.round(pendingProfile.bpm)} BPM). ¿Quieres generar una base
              de notas editable en el timeline o prefieres construir desde cero manualmente?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setAutoPatternOpen(false)}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-xs font-semibold cursor-pointer"
              >
                Solo Audio (Manual)
              </button>
              <button
                type="button"
                onClick={() => {
                  const count = editorRef.current?.applyAutoPatternFromMusicProfile(
                    pendingProfile,
                    {
                      difficulty: snapshot.level.difficulty,
                      laneCount: snapshot.level.gameplayRules.laneCount,
                      replaceExistingNotes: false,
                    },
                  );
                  refreshSnapshot();
                  setAutoPatternOpen(false);
                  notify(`Se añadieron ${count ?? 0} notas base editables.`);
                }}
                className="px-3 py-2 rounded-xl bg-cyan-500/80 hover:bg-cyan-500 text-white text-xs font-bold cursor-pointer"
              >
                Generar Base Editable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish to XanderAI Community Modal with Strict Audio Rights Declaration */}
      {publishOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={handlePublishSubmit}
            className="w-full max-w-md rounded-2xl bg-[#070b1e] border border-fuchsia-400/45 p-5 space-y-3 text-xs"
          >
            <h3 className="font-display font-bold text-base text-white">
              Publicar en Comunidad XanderAI Games
            </h3>
            <p className="text-slate-300 text-[11px]">
              Declara los derechos de uso musical. No se permite distribuir pistas protegidas ni
              recurrir a contenido de Newgrounds sin licencia verificable del titular.
            </p>
            <label className="block space-y-1">
              <span className="text-slate-400">Nombre del Creador</span>
              <input
                type="text"
                required
                value={pubCreatorName}
                onChange={(e) => setPubCreatorName(e.target.value)}
                className="w-full bg-black/40 border border-white/15 rounded-lg px-2.5 py-1.5"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-slate-400">Tipo de Autorización Musical</span>
              <select
                value={pubAuthType}
                onChange={(e) => setPubAuthType(e.target.value as RightsAuthorizationType)}
                className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5"
              >
                <option value="original_author">Autor original de la obra</option>
                <option value="distribution_license">Licencia explícita (CC-BY / Royalty-Free)</option>
                <option value="rights_holder_permission">Permiso expreso del titular</option>
                <option value="public_domain">Dominio público (CC0)</option>
                <option value="authorized_remix_cover">Remix / Cover autorizado</option>
                <option value="verifiable_authorization">Autorización verificable</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-slate-400">Licencia</span>
                <input
                  type="text"
                  required
                  value={pubLicenseName}
                  onChange={(e) => setPubLicenseName(e.target.value)}
                  className="w-full bg-black/40 border border-white/15 rounded-lg px-2 py-1.5"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Titular / Autor</span>
                <input
                  type="text"
                  required
                  value={pubRightsHolder}
                  onChange={(e) => setPubRightsHolder(e.target.value)}
                  className="w-full bg-black/40 border border-white/15 rounded-lg px-2 py-1.5"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-slate-400">Fuente / Enlace de Licencia (opcional)</span>
              <input
                type="text"
                value={pubSourceUrl}
                onChange={(e) => setPubSourceUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-black/40 border border-white/15 rounded-lg px-2.5 py-1.5"
              />
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pubAllowRemix}
                onChange={(e) => setPubAllowRemix(e.target.checked)}
              />
              <span>Confirmo que el audio posee autorización legítima para niveles comunitarios</span>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPublishOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/15 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold cursor-pointer"
              >
                Validar y Publicar
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#0b132f] border border-cyan-400/55 text-cyan-100 text-xs font-semibold shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
};
