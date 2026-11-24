import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BeatflowScene } from './game/BeatflowScene';
import { ALL_ENVIRONMENT_THEMES } from './game/environments/environmentSelector';
import {
  getLaneKeyCodes,
  getPresetById,
  resolveEffectiveEnvironment,
} from './game/presets';
import { ANALYSIS_VERSION, analyzeAudioBuffer } from './services/audioAnalyzer';
import { audioEngine } from './services/audioEngine';
import { menuAmbientAudio } from './services/menuAmbientAudio';
import {
  clearCustomMenuAudio,
  isCompatibleMenuAudioFile,
  loadCustomMenuAudio,
  saveCustomMenuAudio,
} from './services/menuMusicStorage';
import { generateProceduralLevel } from './services/levelGenerator';
import {
  getAllSongs,
  getSongBlob,
  importMp3Files,
  removeSongFromLibrary,
  saveSongProfile,
  toggleSongFavorite,
  updateSongMetadata,
} from './services/musicStorage';
import {
  buildModifierLabel,
  generateRandomSeed,
  getOverallBestScore,
  getPresetGenerationConfig,
  loadSelectedSongId,
  loadSettings,
  loadTutorialCompleted,
  recordGameResult,
  saveSelectedSongId,
  saveSettings,
  saveTutorialCompleted,
} from './services/recordsStorage';
import type {
  AudiovisualPresetId,
  EnvironmentPreference,
  EnvironmentTheme,
  GameResult,
  GameSettings,
  GeneratedLevel,
  GenerationConfig,
  LaneCount,
  LiveGameplayStats,
  NoteShape,
  ScreenRoute,
  SongMetadata,
} from './types/game';
import { MainMenu } from './components/MainMenu';
import { MusicLibrary } from './components/MusicLibrary';
import { RecordsView } from './components/RecordsView';
import { SettingsView } from './components/SettingsView';
import { LevelSetupModal } from './components/LevelSetupModal';
import { GameplayHud } from './components/GameplayHud';
import { PauseModal } from './components/PauseModal';
import { ResultsScreen } from './components/ResultsScreen';
import { OnboardingTutorialModal } from './components/OnboardingTutorialModal';
import { BeatflowCreatorView } from './components/creator/BeatflowCreatorView';
import { CommunityHubView } from './components/creator/CommunityHubView';
import type { BeatflowLevelDocument } from './types/creator';

function pickRandomEnvironmentTheme(exclude?: EnvironmentTheme): EnvironmentTheme {
  const pool = exclude
    ? ALL_ENVIRONMENT_THEMES.filter((t) => t !== exclude)
    : ALL_ENVIRONMENT_THEMES;
  return pool[Math.floor(Math.random() * pool.length)] ?? 'cyberpunk';
}

function getPresetForTheme(theme: EnvironmentTheme): AudiovisualPresetId {
  switch (theme) {
    case 'newyork':
      return 'neon_city';
    case 'cosmic':
      return 'cosmic';
    case 'ocean':
      return 'ocean';
    case 'tropical':
      return 'sunset';
    case 'mountain':
      return 'dreamscape';
    case 'nightclub':
      return 'electronic';
    case 'synthwave':
      return 'cyberpunk';
    case 'reactor':
      return 'electronic';
    case 'digital':
      return 'cyberpunk';
    case 'cyberpunk':
    default:
      return 'cyberpunk';
  }
}

const createInitialLiveStats = (laneCount: LaneCount, maxMisses: number): LiveGameplayStats => ({
  score: 0,
  combo: 0,
  maxCombo: 0,
  hits: 0,
  misses: 0,
  maxMisses,
  accuracy: 100,
  currentTime: 0,
  duration: 0,
  laneCount,
  perfectCount: 0,
  goodCount: 0,
  okCount: 0,
  perfectChain: 0,
  maxPerfectChain: 0,
  feverActive: false,
  feverCharge: 0,
  feverRemainingSec: 0,
  feverDurationSec: 8,
  feverMultiplier: 2,
  feverActivations: 0,
  currentMultiplier: 1,
  precisionChallengeActive: false,
  currentSection: 'groove',
  lastJudgment: null,
  screenPulse: {
    color: '#22d3ee',
    edgeAlpha: 0,
    feverAlpha: 0,
    dropRingPulse: 0,
  },
});

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BeatflowScene | null>(null);

  const [screen, setScreen] = useState<ScreenRoute>('menu');
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [songs, setSongs] = useState<SongMetadata[]>([]);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(() => loadSelectedSongId());
  const [bestScore, setBestScore] = useState<number>(() => getOverallBestScore());

  const [importing, setImporting] = useState(false);
  const [importProgressText, setImportProgressText] = useState('');

  const [setupSong, setSetupSong] = useState<SongMetadata | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const [activeSong, setActiveSong] = useState<SongMetadata | null>(null);
  const [activeConfig, setActiveConfig] = useState<GenerationConfig>(settings.generationConfig);
  const [activeLevel, setActiveLevel] = useState<GeneratedLevel | null>(null);
  const [liveStats, setLiveStats] = useState<LiveGameplayStats>(() =>
    createInitialLiveStats(
      settings.generationConfig.laneCount,
      settings.generationConfig.maxMisses,
    ),
  );
  const [keyboardPressedLanes, setKeyboardPressedLanes] = useState<boolean[]>(() =>
    new Array(8).fill(false),
  );
  const [paused, setPaused] = useState(false);
  const [inGameSettingsOpen, setInGameSettingsOpen] = useState(false);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [transitionVeil, setTransitionVeil] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState<boolean>(() => !loadTutorialCompleted());
  const [tutorialTheme, setTutorialTheme] = useState<EnvironmentTheme>(() =>
    pickRandomEnvironmentTheme(),
  );
  const [creatorInitialLevel, setCreatorInitialLevel] = useState<BeatflowLevelDocument | null>(null);
  const [creatorAutoPlaytest, setCreatorAutoPlaytest] = useState(false);

  const activeSongRef = useRef<SongMetadata | null>(null);
  const activeConfigRef = useRef<GenerationConfig>(settings.generationConfig);
  const activeLevelRef = useRef<GeneratedLevel | null>(null);
  const gameEndedRef = useRef(false);
  const judgmentCounterRef = useRef(0);
  const lastKeyTapRef = useRef<{ lane: number; time: number } | null>(null);

  useEffect(() => {
    activeSongRef.current = activeSong;
  }, [activeSong]);

  useEffect(() => {
    activeConfigRef.current = activeConfig;
  }, [activeConfig]);

  useEffect(() => {
    activeLevelRef.current = activeLevel;
  }, [activeLevel]);

  // Mount Three.js 3D Stage once
  useEffect(() => {
    if (!canvasMountRef.current) return;
    const threeScene = new BeatflowScene(canvasMountRef.current, settings);
    sceneRef.current = threeScene;
    if (tutorialOpen) {
      threeScene.setPalette(getPresetById(getPresetForTheme(tutorialTheme)).palette);
      threeScene.setEnvironment(tutorialTheme, `TUTORIAL-${tutorialTheme}`);
    }
    return () => {
      threeScene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load persistent local library
  useEffect(() => {
    let alive = true;
    getAllSongs()
      .then((list) => {
        if (!alive) return;
        setSongs(list);
        if (list.length > 0) {
          const savedId = loadSelectedSongId();
          const valid = savedId && list.some((s) => s.id === savedId);
          const nextId = valid ? savedId : list[0].id;
          setSelectedSongId(nextId);
          saveSelectedSongId(nextId);
          const initialSong = list.find((s) => s.id === nextId);
          if (initialSong && !tutorialOpen) {
            sceneRef.current?.setPalette(initialSong.palette);
            const theme = resolveEffectiveEnvironment(
              settings.visualsConfig?.preset ?? 'auto',
              settings.environmentMode ?? 'auto',
              initialSong.profile,
              initialSong.id,
            );
            sceneRef.current?.setEnvironment(theme, initialSong.id);
          }
        }
      })
      .catch(() => {
        if (alive) setErrorToast('No se pudo cargar la biblioteca local.');
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load persisted custom local menu background audio (if configured)
  useEffect(() => {
    let alive = true;
    loadCustomMenuAudio()
      .then(async (rec) => {
        if (!alive || !rec) return;
        try {
          await menuAmbientAudio.decodeAndSetCustomBlob(rec.blob, rec.fileName);
        } catch {
          // If corrupted or unsupported, revert cleanly without crashing
          await clearCustomMenuAudio().catch(() => {});
          if (alive) {
            setSettings((prev) => ({
              ...prev,
              menuAmbientConfig: {
                ...prev.menuAmbientConfig,
                sourceMode: 'preset',
                customTrackName: '',
                customPaused: false,
              },
            }));
          }
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Sync audio, menu ambient audio & 3D settings
  useEffect(() => {
    audioEngine.setMusicVolume(settings.musicVolume);
    audioEngine.setAmbientVolume(settings.ambientVolume ?? 0.6);
    audioEngine.setImpactVolume(settings.impactVolume ?? 0.65);
    audioEngine.setUiVolume(settings.uiVolume ?? 0.45, settings.uiSoundsEnabled ?? true);
    audioEngine.setAudioOffsetMs(settings.audioOffsetMs ?? 0);
    if (settings.menuAmbientConfig) {
      menuAmbientAudio.setSourceMode(settings.menuAmbientConfig.sourceMode ?? 'preset');
      menuAmbientAudio.setLoop(settings.menuAmbientConfig.customLoop ?? true);
      menuAmbientAudio.setPaused(Boolean(settings.menuAmbientConfig.customPaused));
      menuAmbientAudio.setEnabled(settings.menuAmbientConfig.musicEnabled);
      menuAmbientAudio.setVolume(settings.menuAmbientConfig.musicVolume);
      menuAmbientAudio.setPreset(settings.menuAmbientConfig.preset);
    }
    sceneRef.current?.updateSettings(settings);
    saveSettings(settings);
  }, [settings]);

  // Keep menu ambient audio strictly separated from gameplay & creator playtest
  useEffect(() => {
    sceneRef.current?.setMenuMode(screen === 'menu');
    if (screen === 'playing' || screen === 'creator' || screen === 'community') {
      menuAmbientAudio.exitToGameplay();
    } else {
      menuAmbientAudio.enterMenu();
    }
  }, [screen]);

  useEffect(() => {
    return () => {
      menuAmbientAudio.dispose();
    };
  }, []);

  const showError = (msg: string) => {
    setErrorToast(msg);
    window.setTimeout(() => {
      setErrorToast((cur) => (cur === msg ? null : cur));
    }, 4500);
  };

  const selectedSong = songs.find((s) => s.id === selectedSongId) ?? songs[0] ?? null;

  const handleUpdateSettings = useCallback((next: GameSettings) => {
    setSettings(next);
  }, []);

  const handleSelectCustomMenuAudio = useCallback(
    async (file: File) => {
      if (!isCompatibleMenuAudioFile(file)) {
        showError('Formato de audio no compatible. Usa MP3, WAV, OGG, M4A, AAC o FLAC.');
        return;
      }
      try {
        await menuAmbientAudio.decodeAndSetCustomBlob(file, file.name);
        await saveCustomMenuAudio(file);
        setSettings((prev) => ({
          ...prev,
          menuAmbientConfig: {
            ...prev.menuAmbientConfig,
            musicEnabled: true,
            sourceMode: 'custom',
            customTrackName: file.name,
            customPaused: false,
          },
        }));
      } catch {
        showError('No se pudo decodificar el archivo de música para el menú.');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleClearCustomMenuAudio = useCallback(async () => {
    await clearCustomMenuAudio().catch(() => {});
    menuAmbientAudio.clearCustomAudio();
    setSettings((prev) => ({
      ...prev,
      menuAmbientConfig: {
        ...prev.menuAmbientConfig,
        sourceMode: 'preset',
        customTrackName: '',
        customPaused: false,
      },
    }));
  }, []);

  const handleImportFiles = async (files: FileList | File[]) => {
    setImporting(true);
    setImportProgressText('Leyendo archivos MP3...');
    try {
      const { imported, skipped } = await importMp3Files(files, (done, total, name) => {
        if (name) setImportProgressText(`Importando ${done + 1}/${total}: ${name}`);
      });
      const updated = await getAllSongs();
      setSongs(updated);
      if (imported.length > 0) {
        const first = imported[0];
        setSelectedSongId(first.id);
        saveSelectedSongId(first.id);
        if (!tutorialOpen) {
          sceneRef.current?.setPalette(first.palette);
          const theme = resolveEffectiveEnvironment(
            settings.visualsConfig?.preset ?? 'auto',
            settings.environmentMode ?? 'auto',
            first.profile,
            first.id,
          );
          sceneRef.current?.setEnvironment(theme, first.id);
        }
      }
      if (skipped.length > 0) {
        showError(`Se omitieron ${skipped.length} archivo(s) no compatibles.`);
      }
    } catch {
      showError('Ocurrió un error al importar los archivos de audio.');
    } finally {
      setImporting(false);
      setImportProgressText('');
    }
  };

  const handleSelectSong = (song: SongMetadata) => {
    audioEngine.playUiTick();
    setSelectedSongId(song.id);
    saveSelectedSongId(song.id);
    if (!tutorialOpen) {
      sceneRef.current?.setPalette(song.palette);
      const theme = resolveEffectiveEnvironment(
        settings.visualsConfig?.preset ?? 'auto',
        settings.environmentMode ?? 'auto',
        song.profile,
        song.id,
      );
      sceneRef.current?.setEnvironment(theme, song.id);
    }
  };

  const handleToggleFavorite = async (songId: string) => {
    audioEngine.playUiTick();
    const nextFav = await toggleSongFavorite(songId);
    setSongs((prev) => prev.map((s) => (s.id === songId ? { ...s, isFavorite: nextFav } : s)));
  };

  const handleRemoveSong = async (songId: string) => {
    audioEngine.playUiTick();
    await removeSongFromLibrary(songId);
    const updated = await getAllSongs();
    setSongs(updated);
    if (selectedSongId === songId) {
      const next = updated[0]?.id ?? null;
      setSelectedSongId(next);
      saveSelectedSongId(next);
    }
  };

  const finalizeMatch = useCallback((completed: boolean) => {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;

    audioEngine.stopMusic();
    const song = activeSongRef.current;
    const level = activeLevelRef.current;
    const cfg = activeConfigRef.current;
    const final = sceneRef.current?.getFinalStats() ?? {
      score: 0,
      maxCombo: 0,
      hits: 0,
      misses: 0,
      breakdown: {
        perfectCount: 0,
        goodCount: 0,
        okCount: 0,
        holdsCompleted: 0,
        holdsBroken: 0,
        chordsHit: 0,
        flicksHit: 0,
        slidesCompleted: 0,
        maxPerfectChain: 0,
        feverActivations: 0,
        avgMultiplier: 1,
      },
    };

    if (!song || !level) return;

    const totalAttempted = final.hits + final.misses;
    const accuracy = totalAttempted > 0 ? (final.hits / totalAttempted) * 100 : 100;
    const durationPlayed = completed
      ? song.duration || audioEngine.getDuration()
      : audioEngine.getCurrentTime();

    if (completed) {
      sceneRef.current?.triggerVictoryEffect();
      audioEngine.playVictorySound();
    } else {
      audioEngine.playGameOverSound();
    }

    const { isNewRecord, isNewVariantRecord, previousBest } = recordGameResult({
      songId: song.id,
      title: song.title,
      artist: song.artist,
      coverArtDataUrl: song.coverArtDataUrl,
      score: final.score,
      maxCombo: final.maxCombo,
      accuracy,
      completed,
      seed: cfg.seed,
      config: cfg,
      breakdown: final.breakdown,
    });
    setBestScore(getOverallBestScore());

    let stars = 0;
    if (completed) {
      if (final.misses === 0 && accuracy >= 92) stars = 3;
      else if (final.misses <= 1 && accuracy >= 80) stars = 2;
      else stars = 1;
    }

    const res: GameResult = {
      song,
      score: final.score,
      maxCombo: final.maxCombo,
      hits: final.hits,
      misses: final.misses,
      totalNotesSpawned: totalAttempted,
      totalNotesInLevel: level.notes.length,
      accuracy,
      durationPlayed,
      completed,
      isNewRecord,
      isNewVariantRecord,
      previousBest,
      seed: cfg.seed,
      difficulty: cfg.difficulty,
      laneCount: level.laneCount,
      maxMisses: level.maxMisses,
      modifierLabel: buildModifierLabel(cfg),
      stars,
      breakdown: final.breakdown,
    };

    window.setTimeout(() => {
      setGameResult(res);
    }, completed ? 450 : 650);
  }, []);

  const launchSongSession = async (
    song: SongMetadata,
    config: GenerationConfig,
    noteShape: NoteShape,
    environmentMode: EnvironmentPreference = settings.environmentMode ?? 'auto',
    preset: AudiovisualPresetId = settings.visualsConfig?.preset ?? 'auto',
  ) => {
    setAnalyzing(true);
    try {
      const blob = await getSongBlob(song.id);
      if (!blob) {
        showError('No se encontró el archivo de audio en la biblioteca local.');
        setAnalyzing(false);
        return;
      }

      const audioBuffer = await audioEngine.decodeBlob(blob);
      let profile = song.profile;
      if (!profile || (profile.analysisVersion ?? 1) < ANALYSIS_VERSION) {
        profile = await analyzeAudioBuffer(audioBuffer);
        await saveSongProfile(song.id, profile);
      }

      const updatedMeta = await updateSongMetadata(song.id, {
        lastPlayedAt: Date.now(),
        duration: song.duration || audioBuffer.duration,
      });
      const resolvedSong = updatedMeta ? { ...updatedMeta, profile } : { ...song, profile };

      setSongs((prev) => prev.map((s) => (s.id === resolvedSong.id ? resolvedSong : s)));

      const nextSettings: GameSettings = {
        ...settings,
        noteShape,
        environmentMode,
        generationConfig: config,
        visualsConfig: {
          ...settings.visualsConfig,
          preset,
        },
      };
      setSettings(nextSettings);

      const level = generateProceduralLevel(profile, config);
      const resolvedEnv = resolveEffectiveEnvironment(preset, environmentMode, profile, config.seed);

      audioEngine.setBuffer(audioBuffer);
      gameEndedRef.current = false;
      setActiveSong(resolvedSong);
      setActiveConfig(config);
      setActiveLevel(level);
      setGameResult(null);
      setPaused(false);
      setInGameSettingsOpen(false);
      setKeyboardPressedLanes(new Array(8).fill(false));
      setLiveStats({
        ...createInitialLiveStats(level.laneCount, level.maxMisses),
        duration: audioBuffer.duration,
      });

      setSetupSong(null);
      menuAmbientAudio.exitToGameplay();
      setTransitionVeil(true);
      window.setTimeout(() => setTransitionVeil(false), 460);
      setScreen('playing');

      sceneRef.current?.updateSettings(nextSettings);
      sceneRef.current?.startLevel(
        level,
        resolvedSong.palette,
        {
          onJudgment: (_note, judgment, combo, points, label) => {
            const jId = ++judgmentCounterRef.current;
            setLiveStats((prev) => ({
              ...prev,
              combo,
              maxCombo: Math.max(prev.maxCombo, combo),
              lastJudgment: {
                judgment,
                lane: _note.lane,
                points,
                label,
                id: jId,
              },
            }));
          },
          onMiss: (note, missesTotal, reasonLabel = 'MISS') => {
            const jId = ++judgmentCounterRef.current;
            setLiveStats((prev) => ({
              ...prev,
              combo: 0,
              perfectChain: 0,
              misses: missesTotal,
              lastJudgment: {
                judgment: 'miss',
                lane: note.lane,
                points: 0,
                label: reasonLabel,
                id: jId,
              },
            }));
          },
          onDefeat: () => {
            finalizeMatch(false);
          },
          onProgress: (snap) => {
            const total = snap.hits + snap.misses;
            const accuracy = total > 0 ? (snap.hits / total) * 100 : 100;
            setLiveStats((prev) => ({
              ...prev,
              score: snap.score,
              combo: snap.combo,
              maxCombo: snap.maxCombo,
              hits: snap.hits,
              misses: snap.misses,
              maxMisses: snap.maxMisses,
              accuracy,
              currentTime: snap.currentTime,
              duration: snap.duration,
              perfectCount: snap.perfectCount,
              goodCount: snap.goodCount,
              okCount: snap.okCount,
              perfectChain: snap.perfectChain,
              maxPerfectChain: snap.maxPerfectChain,
              feverActive: snap.feverActive,
              feverCharge: snap.feverCharge,
              feverRemainingSec: snap.feverRemainingSec,
              feverDurationSec: snap.feverDurationSec,
              feverMultiplier: snap.feverMultiplier,
              feverActivations: snap.feverActivations,
              currentMultiplier: snap.currentMultiplier,
              precisionChallengeActive: snap.precisionChallengeActive,
              currentSection: snap.currentSection,
              screenPulse: snap.screenPulse,
            }));
          },
        },
        resolvedSong.profile,
        resolvedEnv,
      );

      audioEngine.playMusic(0, () => {
        finalizeMatch(true);
      });
    } catch {
      showError('No se pudo decodificar este archivo MP3. Verifica que no esté dañado.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePause = useCallback(() => {
    if (screen !== 'playing' || gameEndedRef.current || gameResult) return;
    audioEngine.pauseMusic();
    sceneRef.current?.setMode('paused');
    setPaused(true);
  }, [screen, gameResult]);

  const handleResume = useCallback(() => {
    if (!paused) return;
    setPaused(false);
    setInGameSettingsOpen(false);
    sceneRef.current?.setMode('playing');
    audioEngine.resumeMusic(() => finalizeMatch(true));
  }, [paused, finalizeMatch]);

  const handleExitToMenu = useCallback(() => {
    audioEngine.stopMusic();
    sceneRef.current?.setMode('idle');
    sceneRef.current?.setMenuMode(true);
    setPaused(false);
    setInGameSettingsOpen(false);
    setGameResult(null);
    setActiveLevel(null);
    setTransitionVeil(true);
    window.setTimeout(() => setTransitionVeil(false), 380);
    setScreen('menu');
  }, []);

  const handleRetry = useCallback(
    (useNewSeed: boolean) => {
      if (!activeSong) return;
      const nextConfig: GenerationConfig = {
        ...activeConfig,
        seed: useNewSeed ? generateRandomSeed() : activeConfig.seed,
      };
      void launchSongSession(
        activeSong,
        nextConfig,
        settings.noteShape,
        settings.environmentMode,
        settings.visualsConfig?.preset ?? 'auto',
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSong, activeConfig, settings.noteShape, settings.environmentMode, settings.visualsConfig?.preset],
  );

  // Dynamic 4-8 Lane Keyboard Controls (Press, Hold, Release, Slide, Flick via Shift+Key or Arrow)
  useEffect(() => {
    const laneCount = activeLevel?.laneCount ?? settings.generationConfig.laneCount ?? 4;
    const keyCodes = getLaneKeyCodes(laneCount);

    const resolveLaneFromCode = (code: string): number | null => {
      for (let i = 0; i < keyCodes.length; i++) {
        if (keyCodes[i].includes(code)) return i;
      }
      return null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (screen === 'playing' && !gameResult) {
        if (e.code === 'Escape') {
          e.preventDefault();
          if (paused) handleResume();
          else handlePause();
          return;
        }
        if (paused) return;

        // Directional Arrow Keys trigger Flick on most recently tapped lane (or center)
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp') {
          e.preventDefault();
          const dir =
            e.code === 'ArrowLeft' ? 'left' : e.code === 'ArrowRight' ? 'right' : 'up';
          const recent = lastKeyTapRef.current;
          const targetLane =
            recent && performance.now() - recent.time < 220
              ? recent.lane
              : Math.floor(laneCount / 2);
          sceneRef.current?.handleLaneFlick(targetLane, dir);
          return;
        }

        const lane = resolveLaneFromCode(e.code);
        if (lane !== null) {
          e.preventDefault();
          lastKeyTapRef.current = { lane, time: performance.now() };
          setKeyboardPressedLanes((prev) => {
            const next = [...prev];
            next[lane] = true;
            return next;
          });
          if (e.shiftKey) {
            sceneRef.current?.handleLaneFlick(lane, 'up');
          } else {
            sceneRef.current?.handleLaneInput(lane);
            sceneRef.current?.handleLaneSlideMove(lane);
          }
        }
      } else if (screen === 'menu' && !setupSong && !tutorialOpen) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          if (selectedSong) setSetupSong(selectedSong);
          else setScreen('music');
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (screen !== 'playing' || paused || gameResult) return;
      const lane = resolveLaneFromCode(e.code);
      if (lane !== null) {
        setKeyboardPressedLanes((prev) => {
          const next = [...prev];
          next[lane] = false;
          return next;
        });
        sceneRef.current?.handleLaneRelease(lane);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    screen,
    paused,
    gameResult,
    setupSong,
    tutorialOpen,
    selectedSong,
    activeLevel,
    settings.generationConfig.laneCount,
    handlePause,
    handleResume,
  ]);

  const handleMainPlayClick = () => {
    audioEngine.playUiTick();
    if (selectedSong) {
      setSetupSong(selectedSong);
    } else {
      setScreen('music');
    }
  };

  const handleRerollTutorialScenario = () => {
    audioEngine.playUiTick();
    const nextTheme = pickRandomEnvironmentTheme(tutorialTheme);
    setTutorialTheme(nextTheme);
    sceneRef.current?.setPalette(getPresetById(getPresetForTheme(nextTheme)).palette);
    sceneRef.current?.setEnvironment(nextTheme, `TUTORIAL-${Date.now()}`);
  };

  const handleSkipTutorial = () => {
    audioEngine.playUiTick();
    saveTutorialCompleted(true);
    setTutorialOpen(false);
    if (selectedSong) {
      sceneRef.current?.setPalette(selectedSong.palette);
      const theme = resolveEffectiveEnvironment(
        settings.visualsConfig?.preset ?? 'auto',
        settings.environmentMode ?? 'auto',
        selectedSong.profile,
        selectedSong.id,
      );
      sceneRef.current?.setEnvironment(theme, selectedSong.id);
    }
  };

  const handleStartTutorial = (song: SongMetadata) => {
    audioEngine.playUiTick();
    saveTutorialCompleted(true);
    setTutorialOpen(false);
    const tutorialConfig = getPresetGenerationConfig('easy', generateRandomSeed(), 4, 999);
    const tutorialPreset = getPresetForTheme(tutorialTheme);
    void launchSongSession(song, tutorialConfig, 'auto', tutorialTheme, tutorialPreset);
  };

  const handleOpenTutorialFromSettings = () => {
    audioEngine.playUiTick();
    const nextTheme = pickRandomEnvironmentTheme();
    setTutorialTheme(nextTheme);
    setScreen('menu');
    setTutorialOpen(true);
    sceneRef.current?.setPalette(getPresetById(getPresetForTheme(nextTheme)).palette);
    sceneRef.current?.setEnvironment(nextTheme, `TUTORIAL-${Date.now()}`);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#050714] select-none">
      {/* Isolated 3D WebGL Canvas Mount */}
      <div ref={canvasMountRef} className="fixed inset-0 z-0" />

      {/* Lightweight non-blocking luminous transition veil */}
      <div
        className={`pointer-events-none fixed inset-0 z-40 bg-[#050819] transition-opacity duration-500 ${
          transitionVeil ? 'opacity-65' : 'opacity-0'
        }`}
      />

      {/* Error Toast */}
      {errorToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-rose-950/95 border border-rose-400/50 text-rose-100 text-xs sm:text-sm font-medium shadow-lg max-w-[90vw] text-center">
          {errorToast}
        </div>
      )}

      {/* Screens */}
      {screen === 'menu' && (
        <MainMenu
          bestScore={bestScore}
          selectedSong={selectedSong}
          songCount={songs.length}
          menuAmbientConfig={settings.menuAmbientConfig}
          reducedMotion={settings.cameraConfig.reducedMotion}
          onPlayClick={handleMainPlayClick}
          onToggleMenuMusic={() => {
            audioEngine.playUiTick();
            handleUpdateSettings({
              ...settings,
              menuAmbientConfig: {
                ...settings.menuAmbientConfig,
                musicEnabled: !settings.menuAmbientConfig.musicEnabled,
              },
            });
          }}
          onToggleMenuMusicPause={() => {
            audioEngine.playUiTick();
            handleUpdateSettings({
              ...settings,
              menuAmbientConfig: {
                ...settings.menuAmbientConfig,
                customPaused: !settings.menuAmbientConfig.customPaused,
              },
            });
          }}
          onParallaxChange={(nx, ny) => sceneRef.current?.setMenuParallax(nx, ny)}
          onNavigate={(s) => {
            audioEngine.playUiTick();
            setScreen(s);
          }}
        />
      )}

      {screen === 'music' && (
        <MusicLibrary
          songs={songs}
          selectedSongId={selectedSong?.id ?? null}
          importing={importing}
          importProgressText={importProgressText}
          onImportFiles={handleImportFiles}
          onSelectSong={handleSelectSong}
          onPlaySongSetup={(song) => {
            audioEngine.playUiTick();
            setSelectedSongId(song.id);
            saveSelectedSongId(song.id);
            setSetupSong(song);
          }}
          onToggleFavorite={handleToggleFavorite}
          onRemoveSong={handleRemoveSong}
          onNavigate={(s) => {
            audioEngine.playUiTick();
            setScreen(s);
          }}
        />
      )}

      {screen === 'records' && (
        <RecordsView
          onNavigate={(s) => {
            audioEngine.playUiTick();
            setScreen(s);
          }}
        />
      )}

      {screen === 'settings' && (
        <SettingsView
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onSelectCustomMenuAudio={handleSelectCustomMenuAudio}
          onClearCustomMenuAudio={handleClearCustomMenuAudio}
          onBack={() => {
            audioEngine.playUiTick();
            setScreen('menu');
          }}
          onNavigate={(s) => {
            audioEngine.playUiTick();
            setScreen(s);
          }}
          onOpenTutorial={handleOpenTutorialFromSettings}
        />
      )}

      {screen === 'creator' && (
        <BeatflowCreatorView
          initialLevel={creatorInitialLevel}
          initialLaunchPlaytest={creatorAutoPlaytest}
          deviceQuality={settings.graphicsQuality}
          onBack={() => {
            audioEngine.playUiTick();
            setCreatorInitialLevel(null);
            setCreatorAutoPlaytest(false);
            setScreen('menu');
          }}
          onOpenCommunity={() => {
            audioEngine.playUiTick();
            setScreen('community');
          }}
        />
      )}

      {screen === 'community' && (
        <CommunityHubView
          onBack={() => {
            audioEngine.playUiTick();
            setScreen('menu');
          }}
          onOpenInCreator={(level, startPlaytest = false) => {
            audioEngine.playUiTick();
            setCreatorInitialLevel(level);
            setCreatorAutoPlaytest(startPlaytest);
            setScreen('creator');
          }}
        />
      )}

      {/* Gameplay HUD */}
      {screen === 'playing' && activeSong && !gameResult && (
        <GameplayHud
          song={activeSong}
          stats={liveStats}
          twoThumbMode={Boolean(activeConfig.twoThumbMode)}
          externalPressedLanes={keyboardPressedLanes}
          onLanePress={(lane) => sceneRef.current?.handleLaneInput(lane)}
          onLaneRelease={(lane) => sceneRef.current?.handleLaneRelease(lane)}
          onLaneSlideMove={(lane) => sceneRef.current?.handleLaneSlideMove(lane)}
          onLaneFlick={(lane, dir) => sceneRef.current?.handleLaneFlick(lane, dir)}
          onPause={handlePause}
        />
      )}

      {/* Pre-Game Level Generation Modal */}
      {setupSong && (
        <LevelSetupModal
          song={setupSong}
          initialConfig={settings.generationConfig}
          initialShape={settings.noteShape}
          initialEnvironmentMode={settings.environmentMode ?? 'auto'}
          initialPreset={settings.visualsConfig?.preset ?? 'auto'}
          analyzing={analyzing}
          onClose={() => setSetupSong(null)}
          onStartGame={(cfg, shape, envMode, preset) => {
            void launchSongSession(setupSong, cfg, shape, envMode, preset);
          }}
        />
      )}

      {/* Pause Modal */}
      {screen === 'playing' && paused && !inGameSettingsOpen && activeSong && (
        <PauseModal
          songTitle={activeSong.title}
          onResume={handleResume}
          onRestart={() => handleRetry(false)}
          onOpenSettings={() => setInGameSettingsOpen(true)}
          onExitToMenu={handleExitToMenu}
        />
      )}

      {/* In-Game Settings Overlay */}
      {screen === 'playing' && paused && inGameSettingsOpen && (
        <SettingsView
          settings={settings}
          inGameOverlay
          onUpdateSettings={handleUpdateSettings}
          onBack={() => setInGameSettingsOpen(false)}
        />
      )}

      {/* Match Results Screen */}
      {screen === 'playing' && gameResult && (
        <ResultsScreen
          result={gameResult}
          onRetryNewSeed={() => handleRetry(true)}
          onRetrySameSeed={() => handleRetry(false)}
          onBackToMenu={handleExitToMenu}
        />
      )}

      {/* First-Launch Interactive Onboarding Tutorial */}
      {tutorialOpen && screen === 'menu' && (
        <OnboardingTutorialModal
          tutorialTheme={tutorialTheme}
          songs={songs}
          selectedSongId={selectedSong?.id ?? null}
          importing={importing}
          importProgressText={importProgressText}
          analyzing={analyzing}
          onSelectSong={handleSelectSong}
          onImportFiles={handleImportFiles}
          onRerollScenario={handleRerollTutorialScenario}
          onStartTutorial={handleStartTutorial}
          onSkip={handleSkipTutorial}
        />
      )}
    </div>
  );
}
