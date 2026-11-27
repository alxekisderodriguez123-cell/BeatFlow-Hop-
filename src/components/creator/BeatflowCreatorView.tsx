import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BoxSelect,
  Check,
  ChevronRight,
  ClipboardCopy,
  ClipboardPaste,
  CopyPlus,
  Eye,
  EyeOff,
  Group,
  Hand,
  Hammer,
  Maximize2,
  MousePointer2,
  Move,
  Music,
  Palette,
  Pause,
  Pencil,
  Play,
  Redo2,
  Repeat,
  Settings,
  Sliders,
  Trash2,
  Undo2,
  Ungroup,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { BeatflowScene } from '../../game/BeatflowScene';
import type {
  EnvironmentTheme,
  GameSettings,
  QualityLevel,
  SongMetadata,
} from '../../types/game';
import type {
  AudioRightsDeclaration,
  BeatflowLevelDocument,
  CreatorCategoryId,
  CreatorMainTab,
  CreatorObject,
  RightsAuthorizationType,
  ViewLayerVisibility,
} from '../../types/creator';
import {
  ALL_ENVIRONMENT_THEMES,
  VANILLA_ENVIRONMENT_THEMES,
} from '../../game/environments/environmentSelector';
import {
  ENVIRONMENT_DEFINITIONS,
  renderEnvironmentThumbnailDataUrl,
} from '../../game/environments/environmentDefinitions';
import { audioEngine } from '../../services/audioEngine';
import { getSongBlob } from '../../services/musicStorage';
import { analyzeAudioBuffer } from '../../services/audioAnalyzer';
import { communityPlatform } from '../../services/communityPlatform';
import {
  createNewCreatorLevel,
  deleteCreatorLevel,
  duplicateCreatorLevel,
  getCreatorLevelById,
  initCreatorLevelsStorage,
  loadActiveCreatorLevelId,
  loadAllCreatorLevels,
  renameCreatorLevel,
  saveActiveCreatorLevelId,
  saveCreatorLevel,
} from '../../services/creatorLevelsStorage';
import { CreatorEditor, type EditorToolMode } from '../../creator/CreatorEditor';
import { CreatorGridCanvas } from '../../creator/CreatorGridCanvas';
import {
  CREATOR_BUILD_ITEMS,
  CREATOR_CATEGORY_TABS,
  type CreatorBuildItem,
  isCasillaObject,
} from '../../creator/ObjectLibrary';
import { createEmptyLevelDocument } from '../../creator/LevelSerializer';
import {
  exportLevelAsZipPackage,
  importLevelFromZipInput,
} from '../../creator/LevelPackageZip';
import { validateLevelDocument } from '../../creator/LevelValidator';
import {
  type BeatSnapDivision,
  secondsToBarBeat,
} from '../../creator/TimelineEditor';
import { ensureCreatorAudioDecoded } from '../../creator/CreatorPlaytestAdapter';
import { CreatorConfigModal } from './CreatorConfigModal';
import { CreatorRgbDrawer } from './CreatorRgbDrawer';
import { CreatorPlaytestOverlay } from './CreatorPlaytestOverlay';

interface BeatflowCreatorViewProps {
  initialLevel?: BeatflowLevelDocument | null;
  initialLaunchPlaytest?: boolean;
  deviceQuality: QualityLevel;
  gameSettings: GameSettings;
  scene: BeatflowScene | null;
  onBack: () => void;
  onOpenCommunity: () => void;
  onPlaytestActiveChange?: (active: boolean) => void;
}

const SNAP_OPTIONS: Array<{ id: BeatSnapDivision; label: string }> = [
  { id: '1/1', label: '1/1' },
  { id: '1/2', label: '1/2' },
  { id: '1/4', label: '1/4' },
  { id: '1/8', label: '1/8' },
  { id: '1/16', label: '1/16' },
  { id: 'free', label: 'Libre' },
];

function renderCasillaIcon(shape?: string, noteKind?: string) {
  if (noteKind === 'hold' || shape === 'long') {
    return (
      <svg viewBox="0 0 28 28" className="w-6 h-6">
        <rect x="8" y="3" width="12" height="22" rx="4" fill="currentColor" fillOpacity="0.28" stroke="currentColor" strokeWidth="2" />
        <rect x="7" y="18" width="14" height="7" rx="2.5" fill="currentColor" />
      </svg>
    );
  }
  if (noteKind === 'slide') {
    return (
      <svg viewBox="0 0 28 28" className="w-6 h-6">
        <path d="M8 22 C8 14, 20 14, 20 6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="8" cy="22" r="3.5" fill="currentColor" />
        <circle cx="20" cy="6" r="3" fill="currentColor" />
      </svg>
    );
  }
  if (noteKind === 'flick') {
    return (
      <svg viewBox="0 0 28 28" className="w-6 h-6">
        <polygon points="14,4 23,17 17,17 17,24 11,24 11,17 5,17" fill="currentColor" />
      </svg>
    );
  }
  if (shape === 'circle') {
    return (
      <svg viewBox="0 0 28 28" className="w-6 h-6">
        <circle cx="14" cy="14" r="9" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="2.4" />
      </svg>
    );
  }
  if (shape === 'triangle') {
    return (
      <svg viewBox="0 0 28 28" className="w-6 h-6">
        <polygon points="14,4 24,23 4,23" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      </svg>
    );
  }
  if (shape === 'diamond') {
    return (
      <svg viewBox="0 0 28 28" className="w-6 h-6">
        <polygon points="14,3 25,14 14,25 3,14" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 28 28" className="w-6 h-6">
      <rect x="5" y="5" width="18" height="18" rx="4" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}

export const BeatflowCreatorView: React.FC<BeatflowCreatorViewProps> = ({
  initialLevel,
  initialLaunchPlaytest = false,
  deviceQuality,
  gameSettings,
  scene,
  onBack,
  onOpenCommunity,
  onPlaytestActiveChange,
}) => {
  const editorRef = useRef<CreatorEditor | null>(null);
  if (!editorRef.current) {
    editorRef.current = new CreatorEditor(
      initialLevel ? structuredClone(initialLevel) : createEmptyLevelDocument(),
    );
  }

  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const gridCtrlRef = useRef<CreatorGridCanvas | null>(null);
  const trayScrollRef = useRef<HTMLDivElement>(null);
  const scrollTrackRef = useRef<HTMLDivElement>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const storageReadyRef = useRef(false);
  const pendingAutosaveDocRef = useRef<BeatflowLevelDocument | null>(null);
  const activeLevelIdRef = useRef<string>(editorRef.current.getLevel().levelId);
  const documentSwitchEpochRef = useRef(0);

  const [snapshot, setSnapshot] = useState(() => editorRef.current!.getSnapshot());
  const [mainTab, setMainTab] = useState<CreatorMainTab>('build');
  const [categoryTab, setCategoryTab] = useState<CreatorCategoryId>('casillas');
  const [activeBuildItemId, setActiveBuildItemId] = useState<string>('casilla_square');
  const [cursorTime, setCursorTime] = useState(0);
  const [viewportMetrics, setViewportMetrics] = useState({
    scrollTimeSec: 0,
    visibleDurationSec: 4,
    totalDurationSec: 36,
    pixelsPerSec: 155,
  });

  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [savedLevels, setSavedLevels] = useState<BeatflowLevelDocument[]>([]);
  const [loadingLevels, setLoadingLevels] = useState(true);
  const [zipBusy, setZipBusy] = useState(false);
  const [hasLinkedAudio, setHasLinkedAudio] = useState(false);
  const [playbackVolume, setPlaybackVolume] = useState(gameSettings.musicVolume ?? 0.8);
  const [musicPreviewPlaying, setMusicPreviewPlaying] = useState(false);

  const [configOpen, setConfigOpen] = useState(false);
  const [rgbOpen, setRgbOpen] = useState(false);
  const [repeatModalOpen, setRepeatModalOpen] = useState(false);
  const [repeatCount, setRepeatCount] = useState(4);
  const [repeatGapBeats, setRepeatGapBeats] = useState(1);
  const [multiDeleteConfirmOpen, setMultiDeleteConfirmOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [playtestSession, setPlaytestSession] = useState<{
    visualOnly: boolean;
    startTimeSec: number;
  } | null>(() => (initialLaunchPlaytest ? { visualOnly: false, startTimeSec: 0 } : null));

  // Publish form state
  const [pubCreatorName, setPubCreatorName] = useState(snapshot.level.authorName || 'Creator');
  const [pubAuthType, setPubAuthType] = useState<RightsAuthorizationType>(
    snapshot.level.audio.rights.authorizationType,
  );
  const [pubLicenseName, setPubLicenseName] = useState(snapshot.level.audio.rights.licenseName);
  const [pubRightsHolder, setPubRightsHolder] = useState(snapshot.level.audio.rights.rightsHolder);
  const [pubSourceUrl, setPubSourceUrl] = useState(snapshot.level.audio.rights.sourceUrl ?? '');
  const [pubAllowRemix, setPubAllowRemix] = useState(
    snapshot.level.audio.rights.allowRemixAndLevelUse,
  );

  // Lazy thumbnails inside Creator BACKGROUNDS tab
  const [worldThumbnails, setWorldThumbnails] = useState<Map<EnvironmentTheme, string>>(
    () => new Map(),
  );

  useEffect(() => {
    if (categoryTab !== 'backgrounds') return;
    let cancelled = false;
    let rafId = 0;
    const pending = ALL_ENVIRONMENT_THEMES.filter((t) => !worldThumbnails.has(t));
    if (pending.length === 0) return;

    let idx = 0;
    const pump = () => {
      if (cancelled) return;
      const batch: Array<[EnvironmentTheme, string]> = [];
      const limit = Math.min(pending.length, idx + 2);
      for (; idx < limit; idx++) {
        const theme = pending[idx];
        batch.push([theme, renderEnvironmentThumbnailDataUrl(theme)]);
      }
      if (batch.length > 0) {
        setWorldThumbnails((prev) => {
          const next = new Map(prev);
          for (const [k, v] of batch) next.set(k, v);
          return next;
        });
      }
      if (idx < pending.length) {
        rafId = requestAnimationFrame(pump);
      }
    };

    rafId = requestAnimationFrame(pump);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [categoryTab, worldThumbnails]);

  const activeBuildItem = useMemo<CreatorBuildItem | null>(() => {
    return (
      CREATOR_BUILD_ITEMS.find((i) => i.id === activeBuildItemId) ??
      CREATOR_BUILD_ITEMS.find((i) => i.categoryTab === categoryTab) ??
      null
    );
  }, [activeBuildItemId, categoryTab]);

  const selectedObjects = useMemo(() => {
    const selSet = new Set(snapshot.selectedIds);
    return snapshot.level.objects.filter((o) => selSet.has(o.id));
  }, [snapshot.level.objects, snapshot.selectedIds]);

  const validationReport = useMemo(
    () => validateLevelDocument(snapshot.level),
    [snapshot.level],
  );

  const mainTabRef = useRef(mainTab);
  mainTabRef.current = mainTab;
  const activeBuildItemRef = useRef(activeBuildItem);
  activeBuildItemRef.current = activeBuildItem;
  const playtestActiveRef = useRef(Boolean(playtestSession));
  playtestActiveRef.current = Boolean(playtestSession);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((cur) => (cur === msg ? null : cur));
    }, 3200);
  }, []);

  const syncPublishFormFromLevel = useCallback((doc: BeatflowLevelDocument) => {
    setPubCreatorName(doc.authorName || 'Creator');
    setPubAuthType(doc.audio.rights.authorizationType);
    setPubLicenseName(doc.audio.rights.licenseName);
    setPubRightsHolder(doc.audio.rights.rightsHolder);
    setPubSourceUrl(doc.audio.rights.sourceUrl ?? '');
    setPubAllowRemix(doc.audio.rights.allowRemixAndLevelUse);
  }, []);

  const persistDocNow = useCallback(
    async (doc: BeatflowLevelDocument, setActive = true): Promise<BeatflowLevelDocument> => {
      const snapshotDoc = structuredClone(doc);
      const saved = await saveCreatorLevel(snapshotDoc, { setActive });
      if (!mountedRef.current) return saved;
      const list = await loadAllCreatorLevels();
      if (!mountedRef.current) return saved;
      setSavedLevels(list);
      if (activeLevelIdRef.current === saved.levelId) {
        setSaveState('saved');
      }
      return saved;
    },
    [],
  );

  const flushPendingAutosave = useCallback(async () => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const pending = pendingAutosaveDocRef.current;
    if (pending) {
      pendingAutosaveDocRef.current = null;
      await persistDocNow(pending, pending.levelId === activeLevelIdRef.current);
    }
  }, [persistDocNow]);

  const scheduleAutosave = useCallback(
    (doc: BeatflowLevelDocument) => {
      if (!storageReadyRef.current) return;
      const docSnapshot = structuredClone(doc);
      pendingAutosaveDocRef.current = docSnapshot;
      setSaveState('saving');
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      autosaveTimerRef.current = window.setTimeout(() => {
        autosaveTimerRef.current = null;
        const toSave = pendingAutosaveDocRef.current;
        if (toSave && toSave.levelId === docSnapshot.levelId) {
          pendingAutosaveDocRef.current = null;
          void persistDocNow(toSave, toSave.levelId === activeLevelIdRef.current);
        }
      }, 550);
    },
    [persistDocNow],
  );

  const refreshSnapshot = useCallback(
    (triggerAutosave = true) => {
      const ed = editorRef.current;
      if (!ed) return;
      const snap = ed.getSnapshot();
      setSnapshot(snap);
      gridCtrlRef.current?.setState({
        level: snap.level,
        selectedIds: snap.selectedIds,
        mainTab: mainTabRef.current,
        editTool: snap.activeTool,
        snapDivision: snap.snapDivision,
        hasActiveBuildItem: Boolean(activeBuildItemRef.current),
      });
      if (gridCtrlRef.current) {
        setViewportMetrics(gridCtrlRef.current.getViewportMetrics());
      }
      if (triggerAutosave) {
        scheduleAutosave(snap.level);
      }
    },
    [scheduleAutosave],
  );

  const switchToDocument = useCallback(
    async (
      nextDoc: BeatflowLevelDocument,
      options: { persistNext?: boolean } = {},
    ): Promise<BeatflowLevelDocument | null> => {
      setMusicPreviewPlaying(false);
      audioEngine.stopMusic();
      await flushPendingAutosave();

      const myEpoch = ++documentSwitchEpochRef.current;
      const previousId = activeLevelIdRef.current;
      const target = options.persistNext
        ? await saveCreatorLevel(structuredClone(nextDoc), { setActive: true })
        : await (async () => {
            const fromDb = await getCreatorLevelById(nextDoc.levelId);
            const chosen = fromDb ?? structuredClone(nextDoc);
            await saveActiveCreatorLevelId(chosen.levelId);
            return chosen;
          })();

      if (!mountedRef.current || documentSwitchEpochRef.current !== myEpoch) {
        return null;
      }

      editorRef.current?.loadProject(target);
      activeLevelIdRef.current = target.levelId;
      pendingAutosaveDocRef.current = null;
      if (target.levelId !== previousId) {
        setCursorTime(0);
        gridCtrlRef.current?.setScrollTime(0);
      }
      syncPublishFormFromLevel(target);
      refreshSnapshot(false);
      setSaveState('saved');

      const list = await loadAllCreatorLevels();
      if (mountedRef.current && documentSwitchEpochRef.current === myEpoch) {
        setSavedLevels(list);
      }
      return target;
    },
    [flushPendingAutosave, refreshSnapshot, syncPublishFormFromLevel],
  );

  // Check linked audio on level change
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (!snapshot.level.audio.songId) {
        if (alive) setHasLinkedAudio(false);
        return;
      }
      const blob = await getSongBlob(snapshot.level.audio.songId);
      if (alive) setHasLinkedAudio(Boolean(blob));
    };
    void check();
    return () => {
      alive = false;
    };
  }, [snapshot.level.audio.songId]);

  // Mount CreatorGridCanvas once
  useEffect(() => {
    if (!gridCanvasRef.current || !editorRef.current) return;
    const initSnap = editorRef.current.getSnapshot();

    const grid = new CreatorGridCanvas(gridCanvasRef.current, initSnap.level, {
      onSelectObject: (id, additive) => {
        editorRef.current?.selectSingle(id, additive);
        refreshSnapshot(false);
      },
      onSelectMany: (ids, additive) => {
        editorRef.current?.selectMany(ids, additive);
        refreshSnapshot(false);
      },
      onPlaceAt: (lane, timeSec) => {
        const item = activeBuildItemRef.current;
        if (!item) return;
        editorRef.current?.placeBuildItem(item, { timeSec, lane });
        refreshSnapshot(true);
      },
      onDragBegin: () => {
        editorRef.current?.beginInteractiveTransform();
      },
      onDragMoveSelected: (deltaLane, deltaTimeSec) => {
        const ed = editorRef.current;
        if (!ed) return;
        const sel = new Set(ed.getSnapshot().selectedIds);
        const laneCount = ed.getLevel().gameplayRules.laneCount;
        ed.mutateObjects(
          (objs) =>
            objs.map((o) => {
              if (!sel.has(o.id) || o.locked) return o;
              const nextTime = Math.max(0, Number((o.timeSec + deltaTimeSec).toFixed(4)));
              const nextLane = isCasillaObject(o)
                ? Math.max(0, Math.min(laneCount - 1, o.lane + deltaLane))
                : o.lane;
              return { ...o, timeSec: nextTime, lane: nextLane };
            }),
          false,
        );
        gridCtrlRef.current?.setState({ level: ed.getLevel() });
      },
      onDragResizeLong: (objectId, nextDurationSec) => {
        const ed = editorRef.current;
        if (!ed) return;
        ed.mutateObjects(
          (objs) =>
            objs.map((o) =>
              o.id === objectId && o.noteData
                ? {
                    ...o,
                    noteData: {
                      ...o.noteData,
                      durationSec: Math.max(0.15, Number(nextDurationSec.toFixed(3))),
                    },
                  }
                : o,
            ),
          false,
        );
        gridCtrlRef.current?.setState({ level: ed.getLevel() });
      },
      onDragEnd: (changed) => {
        editorRef.current?.commitInteractiveTransform(changed);
        refreshSnapshot(changed);
      },
      onScrollChange: (scrollTimeSec) => {
        setCursorTime(scrollTimeSec);
        if (gridCtrlRef.current) {
          setViewportMetrics(gridCtrlRef.current.getViewportMetrics());
        }
      },
      onSeekPlayhead: (tSec) => {
        setCursorTime(tSec);
      },
    });

    gridCtrlRef.current = grid;
    grid.setActive(!playtestActiveRef.current);
    setViewportMetrics(grid.getViewportMetrics());

    return () => {
      grid.dispose();
      gridCtrlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suspend 2D grid rendering during 2.5D playtest & notify parent App of playtest visibility
  useEffect(() => {
    const active = Boolean(playtestSession);
    gridCtrlRef.current?.setActive(!active);
    onPlaytestActiveChange?.(active);
  }, [playtestSession, onPlaytestActiveChange]);

  useEffect(() => {
    return () => {
      onPlaytestActiveChange?.(false);
    };
  }, [onPlaytestActiveChange]);

  // Sync mode/tool changes to CreatorGridCanvas
  useEffect(() => {
    gridCtrlRef.current?.setState({
      level: snapshot.level,
      selectedIds: snapshot.selectedIds,
      mainTab,
      editTool: snapshot.activeTool,
      snapDivision: snapshot.snapDivision,
      hasActiveBuildItem: Boolean(activeBuildItem),
    });
  }, [snapshot, mainTab, activeBuildItem]);

  // Initialize IndexedDB creator storage, migrate legacy levels safely, and hydrate active project
  useEffect(() => {
    mountedRef.current = true;
    const myEpoch = documentSwitchEpochRef.current;
    let cancelled = false;

    const hydrate = async () => {
      setLoadingLevels(true);
      try {
        await initCreatorLevelsStorage();
        if (cancelled || !mountedRef.current) return;

        if (initialLevel) {
          const saved = await saveCreatorLevel(structuredClone(initialLevel), {
            setActive: true,
          });
          if (cancelled || !mountedRef.current || documentSwitchEpochRef.current !== myEpoch) {
            return;
          }
          editorRef.current?.loadProject(saved);
          activeLevelIdRef.current = saved.levelId;
          syncPublishFormFromLevel(saved);
          const list = await loadAllCreatorLevels();
          if (cancelled || !mountedRef.current) return;
          setSavedLevels(list);
          refreshSnapshot(false);
          storageReadyRef.current = true;
          setSaveState('saved');
          return;
        }

        let list = await loadAllCreatorLevels();
        if (cancelled || !mountedRef.current || documentSwitchEpochRef.current !== myEpoch) {
          return;
        }

        const activeId = await loadActiveCreatorLevelId();
        if (cancelled || !mountedRef.current || documentSwitchEpochRef.current !== myEpoch) {
          return;
        }

        let targetDoc =
          (activeId ? list.find((l) => l.levelId === activeId) : undefined) ?? list[0];

        if (!targetDoc) {
          targetDoc = await createNewCreatorLevel();
          list = await loadAllCreatorLevels();
        } else if (activeId !== targetDoc.levelId) {
          await saveActiveCreatorLevelId(targetDoc.levelId);
        }

        if (cancelled || !mountedRef.current || documentSwitchEpochRef.current !== myEpoch) {
          return;
        }
        editorRef.current?.loadProject(targetDoc);
        activeLevelIdRef.current = targetDoc.levelId;
        syncPublishFormFromLevel(targetDoc);
        setSavedLevels(list);
        refreshSnapshot(false);
        storageReadyRef.current = true;
        setSaveState('saved');
      } finally {
        if (!cancelled && mountedRef.current) {
          setLoadingLevels(false);
        }
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup autosave & preview audio on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      if (storageReadyRef.current) {
        const pending = pendingAutosaveDocRef.current;
        pendingAutosaveDocRef.current = null;
        if (pending) {
          void saveCreatorLevel(pending, { setActive: true });
        } else if (editorRef.current) {
          void saveCreatorLevel(editorRef.current.getLevel(), { setActive: true });
        }
      }
      audioEngine.stopMusic();
    };
  }, []);

  // Playback Music preview loop (Audio-only, advances blue playhead line on 2D grid)
  useEffect(() => {
    if (!musicPreviewPlaying) {
      gridCtrlRef.current?.setPlaybackTime(null, false);
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let usingRealAudio = false;
    let virtualTime = cursorTime;
    let lastPerf = performance.now();

    const startPreview = async () => {
      const level = editorRef.current!.getLevel();
      const decoded = await ensureCreatorAudioDecoded(level);
      if (cancelled) return;

      usingRealAudio = decoded;
      audioEngine.setMusicVolume(playbackVolume);

      if (decoded) {
        audioEngine.playMusic(cursorTime, () => {
          if (!cancelled) {
            setMusicPreviewPlaying(false);
          }
        });
      } else {
        notify('Reproduciendo línea de tiempo (asigna un MP3 en Config para audio)');
      }

      const tick = (now: number) => {
        if (cancelled) return;
        const dt = Math.min(0.05, (now - lastPerf) / 1000);
        lastPerf = now;

        const t = usingRealAudio ? audioEngine.getCurrentTime() : (virtualTime += dt);
        setCursorTime(t);
        gridCtrlRef.current?.setPlaybackTime(t, true);

        if (!usingRealAudio && t >= level.audio.durationSec) {
          setMusicPreviewPlaying(false);
          return;
        }
        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
    };

    void startPreview();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      audioEngine.stopMusic();
      gridCtrlRef.current?.setPlaybackTime(null, false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicPreviewPlaying]);

  // Keyboard shortcuts (Ctrl+Z Undo, Ctrl+Y Redo, Delete) when editing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (playtestActiveRef.current || configOpen || rgbOpen || publishOpen) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) editorRef.current?.redo();
        else editorRef.current?.undo();
        refreshSnapshot(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        editorRef.current?.redo();
        refreshSnapshot(true);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editorRef.current && editorRef.current.getSnapshot().selectedIds.length > 0) {
          e.preventDefault();
          handleTrashAction();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configOpen, rgbOpen, publishOpen, refreshSnapshot]);

  const handleTrashAction = () => {
    const count = editorRef.current?.getSnapshot().selectedIds.length ?? 0;
    if (count === 0) {
      notify('Selecciona una casilla o línea verde primero.');
      return;
    }
    if (count >= 2) {
      setMultiDeleteConfirmOpen(true);
      return;
    }
    editorRef.current?.deleteSelected();
    refreshSnapshot(true);
  };

  const handleConfirmMultiDelete = () => {
    setMultiDeleteConfirmOpen(false);
    editorRef.current?.deleteSelected();
    refreshSnapshot(true);
  };

  const handleSelectMode = (mode: CreatorMainTab) => {
    setMainTab(mode);
    if (mode === 'edit' && snapshot.activeTool === 'place') {
      editorRef.current?.setTool('select');
      refreshSnapshot(false);
    }
  };

  const handleSelectCategory = (cat: CreatorCategoryId) => {
    setCategoryTab(cat);
    setMainTab('build');
    const firstInCat = CREATOR_BUILD_ITEMS.find((i) => i.categoryTab === cat);
    if (firstInCat) {
      setActiveBuildItemId(firstInCat.id);
    }
  };

  const handleLaunchPlaytest = (visualOnly: boolean, fromStart = false) => {
    if (!editorRef.current) return;
    setMusicPreviewPlaying(false);
    audioEngine.stopMusic();
    const currentDoc = editorRef.current.getLevel();
    void flushPendingAutosave().then(() => persistDocNow(currentDoc, true));
    setPlaytestSession({
      visualOnly,
      startTimeSec: fromStart ? 0 : Math.max(0, cursorTime),
    });
  };

  const handleSelectLocalSong = async (song: SongMetadata, autoGenerateBase: boolean) => {
    const ed = editorRef.current;
    if (!ed) return;
    const blob = await getSongBlob(song.id);
    let profile = song.profile;
    if (blob) {
      const buf = await audioEngine.decodeBlob(blob);
      audioEngine.setBuffer(buf);
      if (!profile) {
        profile = await analyzeAudioBuffer(buf);
      }
      setHasLinkedAudio(true);
    }
    const nextBpm = Math.round(profile?.bpm ?? song.profile?.bpm ?? ed.getLevel().audio.bpm);
    const nextDur = Math.max(12, Math.round(song.duration || profile?.duration || 36));

    ed.mutateLevel((prev) => ({
      ...prev,
      audio: {
        ...prev.audio,
        songId: song.id,
        title: song.title,
        artist: song.artist,
        bpm: nextBpm,
        durationSec: nextDur,
        palette: song.palette,
      },
    }));

    if (autoGenerateBase && profile) {
      const added = ed.applyAutoPatternFromMusicProfile(profile, {
        difficulty: ed.getLevel().difficulty,
        laneCount: ed.getLevel().gameplayRules.laneCount,
        replaceExistingNotes: false,
      });
      notify(`Audio cargado · +${added} casillas base editables`);
    } else {
      notify(`Canción vinculada: ${song.title} (${nextBpm} BPM)`);
    }
    refreshSnapshot(true);
  };

  const handleOpenLevel = async (lvl: BeatflowLevelDocument) => {
    const opened = await switchToDocument(lvl);
    if (opened) {
      notify(`Abierto "${opened.levelName}"`);
    }
  };

  const handleNewEmptyLevel = async () => {
    setMusicPreviewPlaying(false);
    audioEngine.stopMusic();
    await flushPendingAutosave();
    const fresh = await createNewCreatorLevel();
    if (!mountedRef.current) return;
    await switchToDocument(fresh);
    notify('Nuevo nivel vacío listo');
  };

  const handleDuplicateLevel = async (lvl: BeatflowLevelDocument) => {
    await flushPendingAutosave();
    if (editorRef.current && lvl.levelId === activeLevelIdRef.current) {
      await persistDocNow(editorRef.current.getLevel(), true);
    }
    const copy = await duplicateCreatorLevel(lvl);
    if (!mountedRef.current) return;
    const list = await loadAllCreatorLevels();
    if (!mountedRef.current) return;
    setSavedLevels(list);
    notify(`Duplicado como "${copy.levelName}"`);
  };

  const handleRenameLevel = async (levelId: string, newName: string) => {
    await flushPendingAutosave();
    const updated = await renameCreatorLevel(levelId, newName);
    if (!updated || !mountedRef.current) return;
    if (editorRef.current && levelId === activeLevelIdRef.current) {
      editorRef.current.mutateLevel((prev) => ({
        ...prev,
        levelName: updated.levelName,
        updatedDate: updated.updatedDate,
      }));
      refreshSnapshot(false);
      setSaveState('saved');
    }
    const list = await loadAllCreatorLevels();
    if (mountedRef.current) {
      setSavedLevels(list);
      notify(`Renombrado a "${updated.levelName}"`);
    }
  };

  const handleDeleteSavedLevel = async (levelId: string) => {
    await flushPendingAutosave();
    const deletingActive = levelId === activeLevelIdRef.current;
    if (deletingActive && pendingAutosaveDocRef.current?.levelId === levelId) {
      pendingAutosaveDocRef.current = null;
    }
    const remaining = await deleteCreatorLevel(levelId);
    if (!mountedRef.current) return;
    setSavedLevels(remaining);

    if (deletingActive) {
      let nextLevel = remaining[0];
      if (!nextLevel) {
        nextLevel = await createNewCreatorLevel();
        const refreshed = await loadAllCreatorLevels();
        if (mountedRef.current) setSavedLevels(refreshed);
      }
      if (nextLevel && mountedRef.current) {
        await switchToDocument(nextLevel);
      }
    }
    notify('Nivel eliminado');
  };

  const handleExportZip = async (targetLevel?: BeatflowLevelDocument) => {
    if (zipBusy) return;
    setZipBusy(true);
    try {
      await flushPendingAutosave();
      let docToExport: BeatflowLevelDocument | null = null;
      if (targetLevel && targetLevel.levelId !== activeLevelIdRef.current) {
        docToExport = (await getCreatorLevelById(targetLevel.levelId)) ?? targetLevel;
      } else if (editorRef.current) {
        docToExport = await persistDocNow(editorRef.current.getLevel(), true);
      } else if (targetLevel) {
        docToExport = targetLevel;
      }
      if (!docToExport) return;

      const res = await exportLevelAsZipPackage(docToExport);
      if (!mountedRef.current) return;
      if (!res.ok) {
        notify(res.error ?? 'No se pudo exportar el paquete .zip');
        return;
      }
      notify(
        res.platform === 'native'
          ? `Paquete ${res.fileName} compartido`
          : `Exportado paquete completo ${res.fileName}`,
      );
    } finally {
      if (mountedRef.current) setZipBusy(false);
    }
  };

  const handleImportZipFile = async (file: File) => {
    if (zipBusy) return;
    setZipBusy(true);
    try {
      await flushPendingAutosave();
      const res = await importLevelFromZipInput(file);
      if (!mountedRef.current) return;
      if (!res.ok || !res.level) {
        notify(res.error ?? 'Archivo .zip inválido');
        return;
      }
      await switchToDocument(res.level);
      setConfigOpen(false);
      notify(
        res.importedAudioTitle
          ? `Importado "${res.level.levelName}" con audio "${res.importedAudioTitle}"`
          : `Importado "${res.level.levelName}" (.zip)`,
      );
    } finally {
      if (mountedRef.current) setZipBusy(false);
    }
  };

  const handlePublishSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editorRef.current) return;
    const rights: AudioRightsDeclaration = {
      authorizationType: pubAuthType,
      licenseName: pubLicenseName,
      rightsHolder: pubRightsHolder,
      sourceUrl: pubSourceUrl.trim() || undefined,
      allowRemixAndLevelUse: pubAllowRemix,
      verifiedAt: Date.now(),
    };
    editorRef.current.mutateLevel((prev) => ({
      ...prev,
      authorName: pubCreatorName.trim() || 'Creator',
      audio: { ...prev.audio, rights },
    }));
    const doc = editorRef.current.getLevel();
    const res = communityPlatform.publishLevel(doc, doc.authorName);
    if (!res.ok) {
      notify(res.error ?? 'No se pudo validar el nivel para publicación.');
      return;
    }
    void persistDocNow(doc, true);
    setPublishOpen(false);
    notify('Nivel validado y publicado en Comunidad.');
  };

  // Vertical scrollbar thumb drag handler
  const handleScrollTrackPointer = (clientY: number) => {
    const el = scrollTrackRef.current;
    const grid = gridCtrlRef.current;
    if (!el || !grid) return;
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) return;
    // Bottom = 0s, Top = maxScroll
    const normFromTop = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const normFromBottom = 1 - normFromTop;
    const metrics = grid.getViewportMetrics();
    const maxScroll = Math.max(1, metrics.totalDurationSec - metrics.visibleDurationSec * 0.4);
    grid.setScrollTime(normFromBottom * maxScroll);
  };

  const barBeatLabel = secondsToBarBeat(
    cursorTime,
    snapshot.level.audio.bpm,
    snapshot.level.audio.offsetMs,
  );
  const viewSettings: ViewLayerVisibility =
    snapshot.level.viewSettings ?? {
      grid: true,
      casillas: true,
      triggerLines: true,
      cameraFx: true,
      pulses: true,
      particles: true,
      beatGuides: true,
    };

  const categoryItems = CREATOR_BUILD_ITEMS.filter((i) => i.categoryTab === categoryTab);

  // Scrollbar thumb geometry
  const maxScrollSec = Math.max(
    1,
    viewportMetrics.totalDurationSec - viewportMetrics.visibleDurationSec * 0.4,
  );
  const thumbFrac = Math.max(
    0.08,
    Math.min(0.65, viewportMetrics.visibleDurationSec / Math.max(1, viewportMetrics.totalDurationSec)),
  );
  const scrollRatio = Math.max(0, Math.min(1, viewportMetrics.scrollTimeSec / maxScrollSec));
  const thumbTopPct = (1 - scrollRatio) * (1 - thumbFrac) * 100;

  const hasLongSelected = selectedObjects.some(
    (o) => o.noteData?.kind === 'hold' || o.noteData?.kind === 'slide',
  );
  const hasGroupInSelection = selectedObjects.some((o) => o.groupIds.length > 0);

  return (
    <>
      <div
        className={`fixed inset-0 z-10 flex flex-col bg-[#050817] text-slate-100 select-none overflow-hidden ${
          playtestSession ? 'hidden' : ''
        }`}
      >
        {/* 0. Compact Top Header */}
        <header className="h-12 px-2 sm:px-3 flex items-center justify-between gap-2 bg-[#070b1e] border-b border-white/10 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                setMusicPreviewPlaying(false);
                audioEngine.stopMusic();
                if (storageReadyRef.current && editorRef.current) {
                  void flushPendingAutosave();
                  void persistDocNow(editorRef.current.getLevel(), true);
                }
                onBack();
              }}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-slate-100 shrink-0 cursor-pointer"
              aria-label="Volver al menú"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="font-display font-bold text-xs sm:text-sm text-white truncate">
                {snapshot.level.levelName}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400 tabular-nums">
                <span className="font-mono text-cyan-300 font-semibold">
                  {barBeatLabel.formatted} · {cursorTime.toFixed(1)}s
                </span>
                <span>
                  {saveState === 'saving' ? 'Guardando...' : 'Guardado'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!validationReport.valid && (
              <button
                type="button"
                onClick={() => setValidationOpen((v) => !v)}
                className="min-h-[36px] px-2 rounded-lg bg-rose-500/20 border border-rose-400/45 text-rose-200 text-[10px] font-bold cursor-pointer tabular-nums"
              >
                {validationReport.errors.length} err
              </button>
            )}

            <label className="flex items-center gap-1">
              <span className="hidden sm:inline text-[10px] text-slate-400 font-semibold">
                Compás
              </span>
              <select
                value={snapshot.snapDivision}
                onChange={(e) => {
                  editorRef.current?.setSnapDivision(e.target.value as BeatSnapDivision);
                  refreshSnapshot(false);
                }}
                aria-label="Subdivisión rítmica"
                className="min-h-[38px] bg-[#0b122b] border border-cyan-400/35 rounded-xl px-2 text-xs font-bold text-cyan-200 tabular-nums cursor-pointer"
              >
                {SNAP_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        {/* 1. Central Vertical 2D Grid + Floating Top-Right Actions + Right Vertical Scrollbar */}
        <div className="flex-1 min-h-0 flex relative overflow-hidden">
          {/* Central Grid Host */}
          <div className="flex-1 min-w-0 h-full relative bg-[#040713]">
            <canvas ref={gridCanvasRef} className="w-full h-full block touch-none" />

            {/* Validation Popover */}
            {validationOpen && (
              <div className="absolute top-2 left-2 z-20 w-72 max-w-[82vw] rounded-xl bg-[#070b1e]/95 border border-rose-400/45 p-3 text-xs space-y-1.5 shadow-2xl">
                <div className="flex items-center justify-between font-bold text-rose-200">
                  <span>Validación del nivel</span>
                  <button
                    type="button"
                    onClick={() => setValidationOpen(false)}
                    className="px-2 py-0.5 text-slate-300 cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
                {validationReport.errors.map((err, i) => (
                  <div key={i} className="text-rose-300 text-[11px]">
                    • {err.message}
                  </div>
                ))}
                {validationReport.warnings.map((w, i) => (
                  <div key={i} className="text-amber-200 text-[11px]">
                    • {w.message}
                  </div>
                ))}
              </div>
            )}

            {/* Top-Right Floating Vertical Action Column (PDF 1 + PDF 2) */}
            <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1.5 pointer-events-auto">
              <button
                type="button"
                onClick={() => setConfigOpen(true)}
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-[#0b122b]/92 border border-white/20 text-slate-100 hover:border-cyan-400 shadow-lg cursor-pointer"
                title="Configuración"
                aria-label="Configuración"
              >
                <Settings className="w-5 h-5" />
              </button>

              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  disabled={!snapshot.canUndo}
                  onClick={() => {
                    editorRef.current?.undo();
                    refreshSnapshot(true);
                  }}
                  className="w-11 h-11 flex items-center justify-center rounded-xl bg-[#0b122b]/92 border border-white/20 text-slate-100 disabled:opacity-35 shadow-lg cursor-pointer"
                  title="Deshacer"
                  aria-label="Deshacer"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={!snapshot.canRedo}
                  onClick={() => {
                    editorRef.current?.redo();
                    refreshSnapshot(true);
                  }}
                  className="w-11 h-11 flex items-center justify-center rounded-xl bg-[#0b122b]/92 border border-white/20 text-slate-100 disabled:opacity-35 shadow-lg cursor-pointer"
                  title="Rehacer"
                  aria-label="Rehacer"
                >
                  <Redo2 className="w-4 h-4" />
                </button>
              </div>

              {/* Playtest (Green, real BeatflowScene runtime) */}
              <button
                type="button"
                onClick={() => handleLaunchPlaytest(false, false)}
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-emerald-500/90 hover:bg-emerald-500 border border-emerald-300 text-slate-950 shadow-lg cursor-pointer"
                title="Playtest real"
                aria-label="Playtest"
              >
                <Play className="w-5 h-5 fill-current" />
              </button>

              {/* Playback Music (Blue, audio + playhead line only) */}
              <button
                type="button"
                onClick={() => setMusicPreviewPlaying((p) => !p)}
                className={`w-11 h-11 flex items-center justify-center rounded-xl border shadow-lg cursor-pointer ${
                  musicPreviewPlaying
                    ? 'bg-sky-400 border-sky-200 text-slate-950'
                    : 'bg-sky-500/85 hover:bg-sky-500 border-sky-300/70 text-white'
                }`}
                title="Playback Music (solo audio)"
                aria-label="Playback Music"
              >
                {musicPreviewPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Music className="w-5 h-5" />
                )}
              </button>

              {/* Contextual RGB Inspector */}
              <button
                type="button"
                onClick={() => setRgbOpen(true)}
                className={`w-11 h-11 flex items-center justify-center rounded-xl border shadow-lg cursor-pointer ${
                  selectedObjects.length > 0
                    ? 'bg-fuchsia-500/35 border-fuchsia-300 text-white'
                    : 'bg-[#0b122b]/92 border-white/20 text-slate-200'
                }`}
                title="RGB e Inspector"
                aria-label="RGB"
              >
                <Palette className="w-5 h-5" />
              </button>

              {/* Papelera / Delete */}
              <button
                type="button"
                onClick={handleTrashAction}
                className={`w-11 h-11 flex items-center justify-center rounded-xl border shadow-lg cursor-pointer ${
                  selectedObjects.length > 0
                    ? 'bg-rose-500/30 border-rose-400 text-rose-100'
                    : 'bg-[#0b122b]/92 border-white/20 text-slate-400'
                }`}
                title="Eliminar selección"
                aria-label="Papelera"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>

            {/* Contextual Floating Mobile Controls for Move (4-way) or Resize Long */}
            {mainTab === 'edit' &&
              selectedObjects.length > 0 &&
              snapshot.activeTool === 'move' && (
                <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 p-1.5 rounded-2xl bg-[#070b1e]/92 border border-cyan-400/40 shadow-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      editorRef.current?.moveSelected(-1, 0);
                      refreshSnapshot(true);
                    }}
                    className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/10 active:bg-cyan-500/30 text-white cursor-pointer"
                    aria-label="Mover izquierda"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const ed = editorRef.current;
                        if (ed) ed.moveSelected(0, ed.getSnapStepSec());
                        refreshSnapshot(true);
                      }}
                      className="w-11 h-10 flex items-center justify-center rounded-xl bg-white/10 active:bg-cyan-500/30 text-white cursor-pointer"
                      aria-label="Mover adelante"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const ed = editorRef.current;
                        if (ed) ed.moveSelected(0, -ed.getSnapStepSec());
                        refreshSnapshot(true);
                      }}
                      className="w-11 h-10 flex items-center justify-center rounded-xl bg-white/10 active:bg-cyan-500/30 text-white cursor-pointer"
                      aria-label="Mover atrás"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      editorRef.current?.moveSelected(1, 0);
                      refreshSnapshot(true);
                    }}
                    className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/10 active:bg-cyan-500/30 text-white cursor-pointer"
                    aria-label="Mover derecha"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

            {mainTab === 'edit' &&
              hasLongSelected &&
              snapshot.activeTool === 'resize_long' && (
                <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-[#070b1e]/92 border border-amber-400/45 shadow-2xl">
                  <span className="text-[11px] font-bold text-amber-200 px-1">Largo:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const target = selectedObjects.find(
                        (o) => o.noteData?.kind === 'hold' || o.noteData?.kind === 'slide',
                      );
                      if (target) {
                        editorRef.current?.resizeLongNote(
                          target.id,
                          -(editorRef.current.getSnapStepSec()),
                        );
                        refreshSnapshot(true);
                      }
                    }}
                    className="min-h-[40px] min-w-[44px] rounded-xl bg-white/10 text-white font-bold cursor-pointer"
                  >
                    -Paso
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const target = selectedObjects.find(
                        (o) => o.noteData?.kind === 'hold' || o.noteData?.kind === 'slide',
                      );
                      if (target) {
                        editorRef.current?.resizeLongNote(
                          target.id,
                          editorRef.current.getSnapStepSec(),
                        );
                        refreshSnapshot(true);
                      }
                    }}
                    className="min-h-[40px] min-w-[44px] rounded-xl bg-amber-500/30 border border-amber-400/50 text-amber-100 font-bold cursor-pointer"
                  >
                    +Paso
                  </button>
                </div>
              )}
          </div>

          {/* Right Vertical Scrollbar Slider + Up/Down Arrows + Zoom */}
          <div className="w-11 shrink-0 flex flex-col items-center justify-between py-1.5 bg-[#070c22] border-l border-white/10">
            <button
              type="button"
              onClick={() => gridCtrlRef.current?.scrollByBeats(4)}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/5 active:bg-cyan-500/30 text-slate-200 cursor-pointer"
              aria-label="Subir en la pista"
            >
              <ArrowUp className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() =>
                gridCtrlRef.current?.setZoomPixelsPerSec(viewportMetrics.pixelsPerSec + 30)
              }
              className="w-9 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-white cursor-pointer"
              aria-label="Acercar zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <div
              ref={scrollTrackRef}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                handleScrollTrackPointer(e.clientY);
              }}
              onPointerMove={(e) => {
                if (e.buttons > 0) handleScrollTrackPointer(e.clientY);
              }}
              className="relative flex-1 w-5 my-1 rounded-full bg-white/5 border border-white/10 touch-none cursor-pointer"
            >
              <div
                className="absolute left-0.5 right-0.5 rounded-full bg-cyan-400/75"
                style={{
                  top: `${thumbTopPct}%`,
                  height: `${thumbFrac * 100}%`,
                }}
              />
            </div>

            <button
              type="button"
              onClick={() =>
                gridCtrlRef.current?.setZoomPixelsPerSec(viewportMetrics.pixelsPerSec - 30)
              }
              className="w-9 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-white cursor-pointer"
              aria-label="Alejar zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => gridCtrlRef.current?.scrollByBeats(-4)}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/5 active:bg-cyan-500/30 text-slate-200 cursor-pointer"
              aria-label="Bajar en la pista"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Scrollable 4-Category Bar */}
        <nav
          aria-label="Categorías de creación"
          className="h-11 shrink-0 bg-[#080d24] border-t border-white/10 flex items-center justify-between sm:justify-start gap-1 px-2 overflow-x-auto no-scrollbar"
        >
          {CREATOR_CATEGORY_TABS.map((tab) => {
            const active = mainTab === 'build' && categoryTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectCategory(tab.id)}
                className={`min-h-[40px] px-2.5 sm:px-4 rounded-lg text-[10.5px] sm:text-[11px] font-extrabold tracking-wider whitespace-nowrap border-b-2 transition-colors cursor-pointer shrink-0 ${
                  active
                    ? 'border-cyan-400 text-cyan-200 bg-cyan-500/12'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* 3. Contextual Tray (BUILD / EDIT / VIEW) + '>' scroll arrow */}
        <div className="h-[92px] shrink-0 bg-[#060a1c] border-t border-white/10 relative flex items-center">
          <div
            ref={trayScrollRef}
            className="flex-1 h-full overflow-x-auto no-scrollbar flex items-center gap-2 px-2.5 pr-11"
          >
            {mainTab === 'build' && (
              <>
                {/* Official 2.5D Illustrated Background Library when categoryTab === 'backgrounds' */}
                {categoryTab === 'backgrounds' && (
                  <>
                    <div className="shrink-0 h-[74px] px-2.5 flex flex-col justify-center items-center border border-cyan-400/25 rounded-lg bg-cyan-500/8">
                      <span className="text-[9px] font-extrabold tracking-widest text-cyan-300 uppercase">
                        Escenarios 2.5D
                      </span>
                      <span className="text-[10px] font-bold text-slate-300 tabular-nums">
                        {VANILLA_ENVIRONMENT_THEMES.length}
                      </span>
                    </div>
                    {VANILLA_ENVIRONMENT_THEMES.map((theme) => {
                      const def = ENVIRONMENT_DEFINITIONS[theme];
                      const active = snapshot.level.environmentTheme === theme;
                      return (
                        <button
                          key={theme}
                          type="button"
                          onClick={() => {
                            editorRef.current?.mutateLevel((prev) => ({
                              ...prev,
                              environmentTheme: theme,
                              audio: {
                                ...prev.audio,
                                palette: {
                                  primary: def.colorPalette.primary,
                                  secondary: def.colorPalette.secondary,
                                  accent: def.colorPalette.accent,
                                },
                              },
                            }));
                            refreshSnapshot(true);
                            notify(`Escenario 2.5D: ${def.displayName}`);
                          }}
                          className={`h-[74px] w-28 shrink-0 rounded-xl overflow-hidden border relative text-left cursor-pointer ${
                            active
                              ? 'border-cyan-400 ring-1 ring-cyan-400/60'
                              : 'border-white/15 opacity-85 hover:opacity-100'
                          }`}
                        >
                          {worldThumbnails.get(theme) ? (
                            <img
                              src={worldThumbnails.get(theme)}
                              alt={def.displayName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div
                              className="w-full h-full"
                              style={{
                                background: `linear-gradient(135deg, ${def.colorPalette.primary}44, ${def.colorPalette.secondary}55)`,
                              }}
                            />
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/92 via-black/65 to-transparent px-1.5 py-1">
                            <div className="text-[10px] font-bold text-white truncate">
                              {def.displayName}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}

                {/* Build Items (Casillas, 14 Camera FX, 8 Pulses, 4 Background Triggers) */}
                {categoryItems.map((item) => {
                  const selected = activeBuildItem?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveBuildItemId(item.id)}
                      className={`h-[74px] min-w-[76px] px-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer transition-colors ${
                        selected
                          ? 'bg-cyan-500/22 border-cyan-400 text-white'
                          : 'bg-[#0b122b] border-white/10 text-slate-200 hover:border-white/25'
                      }`}
                    >
                      <div style={{ color: item.accentColor }}>
                        {item.categoryTab === 'casillas' ? (
                          renderCasillaIcon(item.casillaShape, item.noteKind)
                        ) : (
                          <span
                            className="w-6 h-6 rounded-lg border border-white/25 flex items-center justify-center text-[10px] font-extrabold"
                            style={{ backgroundColor: `${item.accentColor}26` }}
                          >
                            {item.categoryTab === 'camera_fx'
                              ? 'FX'
                              : item.categoryTab === 'pulses'
                                ? 'PL'
                                : 'BG'}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold leading-tight whitespace-nowrap">
                        {item.shortLabel}
                      </span>
                    </button>
                  );
                })}
              </>
            )}

            {mainTab === 'edit' && (
              <>
                {(
                  [
                    { id: 'select', label: 'Select', icon: MousePointer2 },
                    { id: 'multi_select', label: 'Multi-Sel', icon: Check },
                    { id: 'box_select', label: 'Box Select', icon: BoxSelect },
                    { id: 'move', label: 'Move', icon: Move },
                    { id: 'resize_long', label: 'Resize Long', icon: Maximize2 },
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
                        refreshSnapshot(false);
                      }}
                      className={`h-[74px] min-w-[74px] px-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer ${
                        active
                          ? 'bg-cyan-500/25 border-cyan-400 text-white'
                          : 'bg-[#0b122b] border-white/10 text-slate-200'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-[10px] font-bold whitespace-nowrap">{tool.label}</span>
                    </button>
                  );
                })}

                <EditActionButton
                  label="Duplicate"
                  icon={CopyPlus}
                  disabled={selectedObjects.length === 0}
                  onClick={() => {
                    editorRef.current?.duplicateSelected(1);
                    refreshSnapshot(true);
                  }}
                />
                <EditActionButton
                  label="Repeat"
                  icon={Repeat}
                  disabled={selectedObjects.length === 0}
                  onClick={() => setRepeatModalOpen(true)}
                />
                <EditActionButton
                  label="Copy"
                  icon={ClipboardCopy}
                  disabled={selectedObjects.length === 0}
                  onClick={() => {
                    editorRef.current?.copySelected();
                    refreshSnapshot(false);
                    notify('Selección copiada');
                  }}
                />
                <EditActionButton
                  label="Paste"
                  icon={ClipboardPaste}
                  disabled={snapshot.clipboardCount === 0}
                  onClick={() => {
                    editorRef.current?.pasteAtTime(cursorTime);
                    refreshSnapshot(true);
                  }}
                />
                <EditActionButton
                  label={hasGroupInSelection ? 'Ungroup' : 'Group'}
                  icon={hasGroupInSelection ? Ungroup : Group}
                  disabled={selectedObjects.length === 0}
                  onClick={() => {
                    if (hasGroupInSelection) {
                      editorRef.current?.ungroupSelected();
                      notify('Selección desagrupada');
                    } else if (selectedObjects.length >= 2) {
                      const groupId = editorRef.current?.createGroup(
                        `Grupo ${snapshot.level.groups.length}`,
                        true,
                      );
                      if (groupId) notify(`Asignado a Grupo ${groupId}`);
                    } else {
                      notify('Selecciona 2+ elementos para agrupar.');
                    }
                    refreshSnapshot(true);
                  }}
                />
                <EditActionButton
                  label="Batch RGB"
                  icon={Palette}
                  disabled={selectedObjects.length === 0}
                  onClick={() => setRgbOpen(true)}
                />
                <EditActionButton
                  label="Delete"
                  icon={Trash2}
                  danger
                  disabled={selectedObjects.length === 0}
                  onClick={handleTrashAction}
                />
              </>
            )}

            {mainTab === 'view' && (
              <>
                {(
                  [
                    { key: 'grid', label: 'Cuadrícula' },
                    { key: 'casillas', label: 'Casillas' },
                    { key: 'triggerLines', label: 'Líneas verdes' },
                    { key: 'cameraFx', label: 'Camera FX' },
                    { key: 'pulses', label: 'Pulses' },
                    { key: 'particles', label: 'Partículas' },
                    { key: 'beatGuides', label: 'Guías compás' },
                  ] as Array<{ key: keyof ViewLayerVisibility; label: string }>
                ).map((item) => {
                  const on = viewSettings[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        editorRef.current?.updateViewSettings({ [item.key]: !on });
                        refreshSnapshot(true);
                      }}
                      className={`h-[74px] min-w-[84px] px-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer ${
                        on
                          ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-100'
                          : 'bg-[#0b122b] border-white/10 text-slate-400'
                      }`}
                    >
                      {on ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                      <span className="text-[10px] font-bold whitespace-nowrap">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>

          {/* Right '>' Tray Scroll Cue */}
          <button
            type="button"
            onClick={() =>
              trayScrollRef.current?.scrollBy({ left: 160, behavior: 'smooth' })
            }
            className="absolute right-0 top-0 bottom-0 w-9 bg-gradient-to-l from-[#060a1c] via-[#060a1c]/95 to-transparent flex items-center justify-center text-cyan-300 cursor-pointer"
            aria-label="Desplazar bandeja"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* 4. Bottom 3-Mode Navigation Bar: BUILD · EDIT · VIEW */}
        <footer className="h-[54px] shrink-0 bg-[#040714] border-t border-white/15 grid grid-cols-3">
          {(
            [
              { id: 'build', label: 'BUILD', icon: Hammer },
              { id: 'edit', label: 'EDIT', icon: Pencil },
              { id: 'view', label: 'VIEW', icon: Sliders },
            ] as Array<{ id: CreatorMainTab; label: string; icon: React.ComponentType<{ className?: string }> }>
          ).map((mode) => {
            const Icon = mode.icon;
            const active = mainTab === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleSelectMode(mode.id)}
                className={`flex items-center justify-center gap-2 font-display font-extrabold text-xs tracking-wider border-t-2 transition-colors cursor-pointer ${
                  active
                    ? 'border-cyan-400 text-cyan-200 bg-cyan-500/12'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{mode.label}</span>
              </button>
            );
          })}
        </footer>

        {/* Config Modal */}
        <CreatorConfigModal
          open={configOpen}
          level={snapshot.level}
          savedLevels={savedLevels}
          loadingLevels={loadingLevels}
          zipBusy={zipBusy}
          playbackVolume={playbackVolume}
          hasLinkedAudio={hasLinkedAudio}
          onClose={() => setConfigOpen(false)}
          onUpdateLevel={(updater) => {
            editorRef.current?.mutateLevel(updater);
            refreshSnapshot(true);
          }}
          onChangeVolume={(v) => {
            setPlaybackVolume(v);
            audioEngine.setMusicVolume(v);
          }}
          onSelectLocalSong={handleSelectLocalSong}
          onLaunchVisualPreview={() => handleLaunchPlaytest(true, false)}
          onOpenLevel={handleOpenLevel}
          onNewEmptyLevel={handleNewEmptyLevel}
          onDuplicateLevel={handleDuplicateLevel}
          onRenameLevel={handleRenameLevel}
          onDeleteSavedLevel={handleDeleteSavedLevel}
          onExportZip={handleExportZip}
          onImportZipFile={handleImportZipFile}
          onOpenPublishModal={() => setPublishOpen(true)}
          onOpenCommunity={() => {
            setMusicPreviewPlaying(false);
            audioEngine.stopMusic();
            if (storageReadyRef.current && editorRef.current) {
              void flushPendingAutosave();
              void persistDocNow(editorRef.current.getLevel(), true);
            }
            onOpenCommunity();
          }}
        />

        {/* Contextual RGB & Trigger Inspector Drawer */}
        <CreatorRgbDrawer
          open={rgbOpen}
          selectedObjects={selectedObjects}
          laneCount={snapshot.level.gameplayRules.laneCount}
          bpm={snapshot.level.audio.bpm}
          songPaletteColors={[
            snapshot.level.audio.palette.primary,
            snapshot.level.audio.palette.secondary,
            snapshot.level.audio.palette.accent,
          ]}
          onClose={() => setRgbOpen(false)}
          onUpdateCasillaMaterial={(patch) => {
            editorRef.current?.batchUpdateMaterial(patch);
            refreshSnapshot(true);
          }}
          onMutateSelectedObjects={(updater) => {
            const selSet = new Set(snapshot.selectedIds);
            editorRef.current?.mutateObjects((objs) =>
              objs.map((o) => (selSet.has(o.id) ? updater(o) : o)),
            );
            refreshSnapshot(true);
          }}
          onDeleteSelected={() => {
            setRgbOpen(false);
            handleTrashAction();
          }}
        />

        {/* Repeat Pattern Modal */}
        {repeatModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-xs rounded-2xl bg-[#070b1e] border border-cyan-400/40 p-4 space-y-3 text-xs">
              <div className="font-display font-bold text-sm text-white">Repetir Patrón</div>
              <label className="block space-y-1">
                <span className="text-slate-300">Cantidad de repeticiones</span>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={repeatCount}
                  onChange={(e) => setRepeatCount(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
                  className="w-full min-h-[42px] bg-black/40 border border-white/15 rounded-xl px-3 text-white tabular-nums"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-slate-300">Intervalo (en beats)</span>
                <input
                  type="number"
                  min={0.25}
                  max={16}
                  step={0.25}
                  value={repeatGapBeats}
                  onChange={(e) => setRepeatGapBeats(Math.max(0.25, Math.min(16, Number(e.target.value) || 1)))}
                  className="w-full min-h-[42px] bg-black/40 border border-white/15 rounded-xl px-3 text-white tabular-nums"
                />
              </label>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setRepeatModalOpen(false)}
                  className="min-h-[40px] px-3 rounded-xl bg-white/5 border border-white/15 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editorRef.current?.repeatSelectedPattern(repeatCount, repeatGapBeats);
                    refreshSnapshot(true);
                    setRepeatModalOpen(false);
                    notify(`Patrón repetido ×${repeatCount}`);
                  }}
                  className="min-h-[40px] px-4 rounded-xl bg-cyan-500 text-slate-950 font-bold cursor-pointer"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Modal ONLY for Multi-Delete (>= 2 elements) */}
        {multiDeleteConfirmOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-xs rounded-2xl bg-[#070b1e] border border-rose-400/45 p-4 space-y-3 text-xs">
              <div className="font-display font-bold text-sm text-white">
                Eliminar {selectedObjects.length} elementos
              </div>
              <p className="text-slate-300">
                ¿Confirmas eliminar los {selectedObjects.length} elementos seleccionados? Podrás revertirlo con Deshacer.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setMultiDeleteConfirmOpen(false)}
                  className="min-h-[40px] px-3 rounded-xl bg-white/5 border border-white/15 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMultiDelete}
                  className="min-h-[40px] px-4 rounded-xl bg-rose-500 text-white font-bold cursor-pointer"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Publish Modal */}
        {publishOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <form
              onSubmit={handlePublishSubmit}
              className="w-full max-w-md rounded-2xl bg-[#070b1e] border border-fuchsia-400/45 p-4 space-y-3 text-xs"
            >
              <h3 className="font-display font-bold text-base text-white">
                Publicar en Comunidad
              </h3>
              <label className="block space-y-1">
                <span className="text-slate-300">Nombre del Creador</span>
                <input
                  type="text"
                  required
                  value={pubCreatorName}
                  onChange={(e) => setPubCreatorName(e.target.value)}
                  className="w-full min-h-[42px] bg-black/40 border border-white/15 rounded-xl px-3"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-slate-300">Autorización Musical</span>
                <select
                  value={pubAuthType}
                  onChange={(e) => setPubAuthType(e.target.value as RightsAuthorizationType)}
                  className="w-full min-h-[42px] bg-[#0b122b] border border-white/15 rounded-xl px-3"
                >
                  <option value="original_author">Autor original</option>
                  <option value="distribution_license">Licencia explícita (CC-BY / Royalty-Free)</option>
                  <option value="rights_holder_permission">Permiso expreso del titular</option>
                  <option value="public_domain">Dominio público (CC0)</option>
                  <option value="authorized_remix_cover">Remix / Cover autorizado</option>
                  <option value="verifiable_authorization">Autorización verificable</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-slate-300">Licencia</span>
                  <input
                    type="text"
                    required
                    value={pubLicenseName}
                    onChange={(e) => setPubLicenseName(e.target.value)}
                    className="w-full min-h-[40px] bg-black/40 border border-white/15 rounded-xl px-2.5"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">Titular</span>
                  <input
                    type="text"
                    required
                    value={pubRightsHolder}
                    onChange={(e) => setPubRightsHolder(e.target.value)}
                    className="w-full min-h-[40px] bg-black/40 border border-white/15 rounded-xl px-2.5"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-slate-300">Enlace de licencia (opcional)</span>
                <input
                  type="text"
                  value={pubSourceUrl}
                  onChange={(e) => setPubSourceUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full min-h-[40px] bg-black/40 border border-white/15 rounded-xl px-2.5"
                />
              </label>
              <label className="flex items-center gap-2 min-h-[40px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={pubAllowRemix}
                  onChange={(e) => setPubAllowRemix(e.target.checked)}
                />
                <span>Confirmo que el audio posee autorización legítima</span>
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPublishOpen(false)}
                  className="min-h-[40px] px-3 rounded-xl bg-white/5 border border-white/15 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-4 rounded-xl bg-fuchsia-600 text-white font-bold cursor-pointer"
                >
                  Validar y Publicar
                </button>
              </div>
            </form>
          </div>
        )}

        {toast && (
          <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-3.5 py-2 rounded-xl bg-[#0b132f] border border-cyan-400/55 text-cyan-100 text-xs font-semibold shadow-xl max-w-[90vw] text-center">
            {toast}
          </div>
        )}
      </div>

      {/* Real BeatflowScene Playtest & 2.5D Preview Overlay */}
      {playtestSession && (
        <CreatorPlaytestOverlay
          scene={scene}
          level={snapshot.level}
          viewSettings={viewSettings}
          deviceQuality={deviceQuality}
          gameSettings={gameSettings}
          startTimeSec={playtestSession.startTimeSec}
          initialVisualOnly={playtestSession.visualOnly}
          onExit={() => {
            setPlaytestSession(null);
            // Restore menu/creator palette cleanly on exit
            scene?.updateSettings(gameSettings);
          }}
        />
      )}
    </>
  );
  void Hand;
};

const EditActionButton: React.FC<{
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}> = ({ label, icon: Icon, disabled, danger, onClick }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`h-[74px] min-w-[74px] px-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer disabled:opacity-35 ${
      danger
        ? 'bg-rose-500/15 border-rose-400/40 text-rose-200'
        : 'bg-[#0b122b] border-white/10 text-slate-200 hover:border-white/25'
    }`}
  >
    <Icon className="w-5 h-5" />
    <span className="text-[10px] font-bold whitespace-nowrap">{label}</span>
  </button>
);
