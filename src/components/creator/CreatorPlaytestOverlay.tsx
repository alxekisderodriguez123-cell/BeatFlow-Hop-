import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Eye, Gamepad2, Pause, Play, RotateCcw } from 'lucide-react';
import type { BeatflowScene, GameplaySnapshot } from '../../game/BeatflowScene';
import type {
  FlickDirection,
  GameSettings,
  LaneCount,
  LiveGameplayStats,
  QualityLevel,
} from '../../types/game';
import type { BeatflowLevelDocument, ViewLayerVisibility } from '../../types/creator';
import { getLaneKeyCodes } from '../../game/presets';
import { audioEngine } from '../../services/audioEngine';
import { TriggerSystem } from '../../creator/TriggerSystem';
import { AnimationController } from '../../creator/AnimationController';
import { CameraController } from '../../creator/CameraController';
import { EffectController, type ResolvedScreenEffectsState } from '../../creator/EffectController';
import { MusicReactiveLighting } from '../../game/MusicReactiveLighting';
import {
  adaptCreatorLevelForScene,
  ensureCreatorAudioDecoded,
} from '../../creator/CreatorPlaytestAdapter';
import { GameplayHud } from '../GameplayHud';
import { useGameplayControlMode } from '../../utils/deviceControls';

interface CreatorPlaytestOverlayProps {
  scene: BeatflowScene | null;
  level: BeatflowLevelDocument;
  viewSettings: ViewLayerVisibility;
  deviceQuality: QualityLevel;
  gameSettings: GameSettings;
  startTimeSec: number;
  initialVisualOnly: boolean;
  onExit: () => void;
}

function buildInitialLiveStats(laneCount: LaneCount, bpm: number, durationSec: number): LiveGameplayStats {
  return {
    score: 0,
    combo: 0,
    maxCombo: 0,
    hits: 0,
    misses: 0,
    maxMisses: 999,
    accuracy: 100,
    currentTime: 0,
    duration: durationSec,
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
  };
  void bpm;
}

export const CreatorPlaytestOverlay: React.FC<CreatorPlaytestOverlayProps> = ({
  scene,
  level,
  viewSettings,
  deviceQuality,
  gameSettings,
  startTimeSec,
  initialVisualOnly,
  onExit,
}) => {
  const [visualOnly, setVisualOnly] = useState(initialVisualOnly);
  const [paused, setPaused] = useState(false);
  const [speedScale, setSpeedScale] = useState(1.0);
  const [hasAudio, setHasAudio] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(true);
  const [restartToken, setRestartToken] = useState(0);
  const [launchStartSec, setLaunchStartSec] = useState(startTimeSec);
  const [fxState, setFxState] = useState<ResolvedScreenEffectsState | null>(null);
  const [keyboardPressedLanes, setKeyboardPressedLanes] = useState<boolean[]>(() =>
    new Array(8).fill(false),
  );
  const [liveStats, setLiveStats] = useState<LiveGameplayStats>(() =>
    buildInitialLiveStats(
      level.gameplayRules.laneCount,
      level.audio.bpm,
      level.audio.durationSec,
    ),
  );

  const visualOnlyRef = useRef(visualOnly);
  visualOnlyRef.current = visualOnly;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const speedRef = useRef(speedScale);
  speedRef.current = speedScale;
  const viewSettingsRef = useRef(viewSettings);
  viewSettingsRef.current = viewSettings;

  const triggerSysRef = useRef(new TriggerSystem());
  const cameraCtrlRef = useRef(new CameraController(level.camera));
  const effectCtrlRef = useRef(new EffectController());
  const lightingRef = useRef(new MusicReactiveLighting());
  const virtualClockRef = useRef(startTimeSec);
  const judgmentCounterRef = useRef(0);
  const lastKeyTapRef = useRef<{ lane: number; time: number } | null>(null);

  const controlMode = useGameplayControlMode();

  // Sync visualOnly & speedScale into BeatflowScene
  useEffect(() => {
    scene?.setCreatorPlaytestRuntime({
      visualOnly,
      speedScale,
    });
  }, [scene, visualOnly, speedScale]);

  // Sync direct 3D touch state during Creator Playtest
  useEffect(() => {
    const enableDirectTouch = !paused && !visualOnly && !controlMode.showVisualPanels;
    scene?.setDirectTouchEnabled(enableDirectTouch);
    return () => {
      scene?.setDirectTouchEnabled(false);
    };
  }, [scene, paused, visualOnly, controlMode.showVisualPanels]);

  // Launch Playtest / 2.5D Preview on BeatflowScene
  useEffect(() => {
    let cancelled = false;
    let rafId = 0;

    const boot = async () => {
      setLoadingAudio(true);
      const adapted = adaptCreatorLevelForScene(level);
      const decodedOk = await ensureCreatorAudioDecoded(level);
      if (cancelled) return;

      setHasAudio(decodedOk);
      setLoadingAudio(false);
      virtualClockRef.current = launchStartSec;
      setLiveStats({
        ...buildInitialLiveStats(
          adapted.generatedLevel.laneCount,
          adapted.generatedLevel.bpm,
          adapted.durationSec,
        ),
        currentTime: launchStartSec,
      });

      const triggerSys = new TriggerSystem();
      const animCtrl = new AnimationController();
      const cameraCtrl = new CameraController(level.camera);
      const effectCtrl = new EffectController();
      const lighting = new MusicReactiveLighting();
      triggerSys.reset(level.variables);
      animCtrl.reset(level.groups);
      cameraCtrl.reset();
      effectCtrl.configure(deviceQuality, true);
      effectCtrl.reset();
      lighting.reset();

      triggerSysRef.current = triggerSys;
      cameraCtrlRef.current = cameraCtrl;
      effectCtrlRef.current = effectCtrl;
      lightingRef.current = lighting;

      if (scene) {
        scene.startCreatorPlaytest(
          adapted.generatedLevel,
          adapted.palette,
          {
            onJudgment: (_note, judgment, combo, _scoreDelta, label) => {
              if (visualOnlyRef.current) return;
              const jId = ++judgmentCounterRef.current;
              setLiveStats((prev) => ({
                ...prev,
                combo,
                lastJudgment: {
                  judgment,
                  lane: _note.lane,
                  points: _scoreDelta,
                  label,
                  id: jId,
                },
              }));
            },
            onMiss: (note, missesTotal, reasonLabel) => {
              if (visualOnlyRef.current) return;
              const jId = ++judgmentCounterRef.current;
              setLiveStats((prev) => ({
                ...prev,
                misses: missesTotal,
                combo: 0,
                lastJudgment: {
                  judgment: 'miss',
                  lane: note.lane,
                  points: 0,
                  label: reasonLabel ?? 'MISS',
                  id: jId,
                },
              }));
            },
            onDefeat: () => {},
            onProgress: (snap: GameplaySnapshot) => {
              const totalJudged = snap.hits + snap.misses;
              const accuracy =
                totalJudged > 0 ? Math.min(100, (snap.hits / totalJudged) * 100) : 100;
              setLiveStats((prev) => ({
                ...prev,
                score: snap.score,
                combo: snap.combo,
                maxCombo: snap.maxCombo,
                hits: snap.hits,
                misses: snap.misses,
                accuracy,
                currentTime: snap.currentTime,
                duration: snap.duration || adapted.durationSec,
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
          {
            profile: adapted.profile,
            environmentOverride: level.environmentTheme,
            useVirtualClock: !decodedOk,
            startTimeSec: launchStartSec,
            durationSec: adapted.durationSec,
            speedScale: speedRef.current,
            visualOnly: visualOnlyRef.current,
          },
        );
      }

      if (decodedOk) {
        audioEngine.playMusic(launchStartSec, () => {
          setPaused(true);
          scene?.setMode('paused');
        });
      }

      let lastPerf = performance.now();
      let lastBeatIdx = -1;
      const tickTriggers = (now: number) => {
        if (cancelled) return;
        const rawDt = Math.min(0.05, Math.max(0.001, (now - lastPerf) / 1000));
        lastPerf = now;

        if (!pausedRef.current) {
          const dt = rawDt * speedRef.current;
          if (decodedOk && audioEngine.getDuration() > 0) {
            virtualClockRef.current = audioEngine.getCurrentTime();
          } else {
            virtualClockRef.current += dt;
          }
          const t = virtualClockRef.current;
          const bands = decodedOk
            ? audioEngine.getRealtimeAudioState(1.0)
            : {
                currentTime: t,
                subBass: 0.45,
                bass: 0.48,
                lowMid: 0.3,
                mid: 0.35,
                highMid: 0.3,
                treble: 0.25,
                high: 0.3,
                energy: 0.45,
                isPlaying: true,
              };

          const lightOut = lighting.step(dt, bands, 'groove', false, true);
          const beatDur = 60 / Math.max(40, level.audio.bpm);
          const beatIdx = Math.floor(t / beatDur);
          const beatTriggered = beatIdx !== lastBeatIdx;
          lastBeatIdx = beatIdx;

          triggerSys.step(
            adapted.sortedTriggers,
            level.groups,
            {
              currentTime: t,
              dt,
              bpm: level.audio.bpm,
              section: 'groove',
              beatTriggered,
              onsetTriggered: false,
              lighting: lightOut,
              inPlaytest: true,
            },
            animCtrl,
            cameraCtrl,
            effectCtrl,
          );

          const camState = cameraCtrl.evaluate(t);
          const fx = effectCtrl.evaluate(t, level.audio.bpm, lightOut);
          const vs = viewSettingsRef.current;

          const baseFov = level.camera.baseFov || 62;
          scene?.setCreatorPlaytestRuntime({
            cameraOverride: vs.cameraFx
              ? {
                  fovDelta: camState.fov - baseFov,
                  offsetX: camState.offsetX,
                  offsetY: camState.offsetY,
                  offsetZ: camState.offsetZ,
                  rollRad: (camState.rollDeg * Math.PI) / 180,
                  shake: Math.max(camState.shake, fx.screenShake),
                }
              : null,
            effectsOverride: {
              bloomDelta: vs.cameraFx ? fx.bloom : 0,
              exposureDelta: vs.cameraFx ? fx.exposureDelta : 0,
              bgTheme: fx.background.overrideActive ? fx.background.theme : undefined,
              bgPrimary: fx.background.overrideActive ? fx.background.primaryColor : undefined,
              bgSecondary: fx.background.overrideActive ? fx.background.secondaryColor : undefined,
              bgBrightness: fx.background.overrideActive ? fx.background.brightness : 1,
            },
          });

          setFxState(fx);
        }

        rafId = requestAnimationFrame(tickTriggers);
      };

      rafId = requestAnimationFrame(tickTriggers);
    };

    void boot();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      audioEngine.stopMusic();
      scene?.setMode('idle');
    };
  }, [scene, level, deviceQuality, launchStartSec, restartToken]);

  // Keyboard support in Playtest mode (D/F/J/K + Arrow flicks + Escape to pause)
  useEffect(() => {
    const laneCount = level.gameplayRules.laneCount ?? 4;
    const keyCodes = getLaneKeyCodes(laneCount);

    const resolveLane = (code: string): number | null => {
      for (let i = 0; i < keyCodes.length; i++) {
        if (keyCodes[i].includes(code)) return i;
      }
      return null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        onExit();
        return;
      }
      if (pausedRef.current || visualOnlyRef.current) return;

      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp') {
        e.preventDefault();
        const dir: FlickDirection =
          e.code === 'ArrowLeft' ? 'left' : e.code === 'ArrowRight' ? 'right' : 'up';
        const recent = lastKeyTapRef.current;
        const lane =
          recent && performance.now() - recent.time < 220
            ? recent.lane
            : Math.floor(laneCount / 2);
        scene?.handleLaneFlick(lane, dir);
        return;
      }

      const lane = resolveLane(e.code);
      if (lane !== null) {
        e.preventDefault();
        lastKeyTapRef.current = { lane, time: performance.now() };
        setKeyboardPressedLanes((prev) => {
          const next = [...prev];
          next[lane] = true;
          return next;
        });
        if (e.shiftKey) {
          scene?.handleLaneFlick(lane, 'up');
        } else {
          scene?.handleLaneInput(lane);
          scene?.handleLaneSlideMove(lane);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (pausedRef.current || visualOnlyRef.current) return;
      const lane = resolveLane(e.code);
      if (lane !== null) {
        setKeyboardPressedLanes((prev) => {
          const next = [...prev];
          next[lane] = false;
          return next;
        });
        scene?.handleLaneRelease(lane);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [scene, level.gameplayRules.laneCount, onExit]);

  const togglePause = useCallback(() => {
    setPaused((prev) => {
      const next = !prev;
      if (next) {
        if (hasAudio) audioEngine.pauseMusic();
        scene?.setMode('paused');
      } else {
        scene?.setMode('playing');
        if (hasAudio) audioEngine.resumeMusic();
      }
      return next;
    });
  }, [hasAudio, scene]);

  const restartFrom = (tSec: number) => {
    setPaused(false);
    setLaunchStartSec(tSec);
    setRestartToken((n) => n + 1);
  };

  // Compute CSS post-FX filter string from active Camera FX
  const showFx = viewSettings.cameraFx && fxState;
  const showPulses = viewSettings.pulses && fxState;

  const backdropFilterParts: string[] = [];
  if (showFx && fxState.blur > 0.02) {
    backdropFilterParts.push(`blur(${(fxState.blur * 6).toFixed(1)}px)`);
  }
  if (showFx && fxState.invertColors > 0.05) {
    backdropFilterParts.push(`invert(${Math.min(100, Math.round(fxState.invertColors * 100))}%)`);
  }
  if (showFx && fxState.colorGrading > 0.05) {
    backdropFilterParts.push(
      `saturate(${(1 + fxState.colorGrading * 0.7).toFixed(2)}) contrast(${(1 + fxState.colorGrading * 0.25).toFixed(2)})`,
    );
  }
  if (showFx && fxState.motionBlur > 0.05) {
    backdropFilterParts.push(`blur(${(fxState.motionBlur * 2.2).toFixed(1)}px)`);
  }

  return (
    <div className="fixed inset-0 z-20 pointer-events-none select-none overflow-hidden">
      {/* Camera FX Fullscreen Backdrop Filter Layer */}
      {backdropFilterParts.length > 0 && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{ backdropFilter: backdropFilterParts.join(' ') }}
        />
      )}

      {/* Camera FX Vignette / Focus Layer */}
      {showFx && (fxState.vignette > 0.02 || fxState.focus > 0.02) && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, transparent ${Math.max(24, 60 - fxState.focus * 28)}%, rgba(2, 4, 14, ${Math.min(0.88, Math.max(fxState.vignette, fxState.focus) * 0.78)}) 100%)`,
          }}
        />
      )}

      {/* Camera FX Chromatic / Glitch Overlay */}
      {showFx && (fxState.chromaticAberration > 0.04 || fxState.glitch > 0.04) && (
        <div
          className="fixed inset-0 pointer-events-none mix-blend-screen"
          style={{
            boxShadow: `inset ${(6 + fxState.glitch * 14).toFixed(1)}px 0 18px rgba(34,211,238,${Math.min(0.65, (fxState.chromaticAberration + fxState.glitch) * 0.45)}), inset -${(6 + fxState.glitch * 14).toFixed(1)}px 0 18px rgba(236,72,153,${Math.min(0.65, (fxState.chromaticAberration + fxState.glitch) * 0.45)})`,
            transform:
              fxState.glitch > 0.05
                ? `translateX(${(Math.sin(performance.now() * 0.08) * fxState.glitch * 6).toFixed(1)}px)`
                : undefined,
          }}
        />
      )}

      {/* Camera FX Border Lights */}
      {showFx && fxState.borderLightsAlpha > 0.02 && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            boxShadow: `inset 0 0 60px ${fxState.borderLightsColor}`,
            opacity: fxState.borderLightsAlpha,
          }}
        />
      )}

      {/* Camera FX Screen Flash */}
      {showFx && fxState.screenFlash > 0.02 && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundColor: fxState.flashColor,
            opacity: Math.min(0.65, fxState.screenFlash * 0.55),
          }}
        />
      )}

      {/* Active Screen Pulses (8 Modes) */}
      {showPulses &&
        fxState.activePulses.map((pulse, idx) => {
          const blendClass =
            pulse.blendMode === 'screen'
              ? 'mix-blend-screen'
              : pulse.blendMode === 'additive'
                ? 'mix-blend-plus-lighter'
                : '';

          if (pulse.pulseKind === 'full_flash') {
            return (
              <div
                key={idx}
                className={`fixed inset-0 pointer-events-none ${blendClass}`}
                style={{ backgroundColor: pulse.color, opacity: pulse.alpha * 0.42 }}
              />
            );
          }

          if (pulse.pulseKind === 'radial_pulse') {
            return (
              <div
                key={idx}
                className={`fixed inset-0 pointer-events-none ${blendClass}`}
                style={{
                  background: `radial-gradient(circle at center, transparent 35%, ${pulse.color} 72%, ${pulse.secondaryColor} 100%)`,
                  opacity: pulse.alpha * 0.65,
                }}
              />
            );
          }

          if (pulse.pulseKind === 'color_pulse' || pulse.pulseKind === 'progressive_glow') {
            return (
              <div
                key={idx}
                className={`fixed inset-0 pointer-events-none ${blendClass}`}
                style={{
                  background:
                    pulse.pulseKind === 'color_pulse'
                      ? `linear-gradient(135deg, ${pulse.color}, ${pulse.secondaryColor})`
                      : undefined,
                  boxShadow:
                    pulse.pulseKind === 'progressive_glow'
                      ? `inset 0 0 110px ${pulse.color}, inset 0 0 42px ${pulse.secondaryColor}`
                      : undefined,
                  opacity: pulse.alpha * (pulse.pulseKind === 'color_pulse' ? 0.28 : 0.78),
                }}
              />
            );
          }

          // Edge-based pulses: borders_4, border_top, border_bottom, borders_side
          const shadows: string[] = [];
          if (pulse.edgeMask.top) shadows.push(`inset 0 44px 48px -20px ${pulse.color}`);
          if (pulse.edgeMask.bottom) shadows.push(`inset 0 -44px 48px -20px ${pulse.secondaryColor}`);
          if (pulse.edgeMask.left) shadows.push(`inset 44px 0 48px -20px ${pulse.color}`);
          if (pulse.edgeMask.right) shadows.push(`inset -44px 0 48px -20px ${pulse.secondaryColor}`);

          return (
            <div
              key={idx}
              className={`fixed inset-0 pointer-events-none ${blendClass}`}
              style={{
                boxShadow: shadows.join(', '),
                opacity: pulse.alpha * 0.9,
              }}
            />
          );
        })}

      {/* Gameplay HUD when Playable */}
      {!visualOnly && (
        <GameplayHud
          song={{
            id: level.levelId,
            title: level.levelName,
            artist: level.authorName,
            album: 'Creator Playtest',
            fileName: `${level.levelId}.bfn`,
            fileSize: 0,
            duration: level.audio.durationSec,
            palette: level.audio.palette,
            addedAt: Date.parse(level.creationDate) || Date.now(),
            isFavorite: false,
          }}
          stats={liveStats}
          showVisualPanels={controlMode.showVisualPanels}
          externalPressedLanes={keyboardPressedLanes}
          onLanePress={(lane) => scene?.handleLaneInput(lane)}
          onLaneRelease={(lane) => scene?.handleLaneRelease(lane)}
          onLaneSlideMove={(lane) => scene?.handleLaneSlideMove(lane)}
          onLaneFlick={(lane, dir) => scene?.handleLaneFlick(lane, dir)}
          onPause={togglePause}
        />
      )}

      {/* Top Creator Playtest Control Strip */}
      <div className="fixed top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-[#050818]/92 border border-cyan-400/45 shadow-2xl max-w-[96vw] overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={onExit}
          className="min-h-[40px] px-3 rounded-xl bg-rose-500/20 border border-rose-400/45 text-rose-100 text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Editor</span>
        </button>

        <button
          type="button"
          onClick={togglePause}
          className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl bg-white/10 border border-white/15 text-white text-xs font-bold flex items-center justify-center gap-1 shrink-0 cursor-pointer"
          aria-label={paused ? 'Reanudar' : 'Pausar'}
        >
          {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={() => restartFrom(0)}
          className="min-h-[40px] px-2.5 rounded-xl bg-white/10 border border-white/15 text-slate-200 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
          title="Reiniciar desde 0:00"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">0:00</span>
        </button>

        <button
          type="button"
          onClick={() => setVisualOnly((v) => !v)}
          className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer ${
            visualOnly
              ? 'bg-indigo-500/30 border-indigo-400 text-indigo-100'
              : 'bg-emerald-500/25 border-emerald-400/50 text-emerald-100'
          }`}
        >
          {visualOnly ? <Eye className="w-3.5 h-3.5" /> : <Gamepad2 className="w-3.5 h-3.5" />}
          <span>{visualOnly ? 'Vista 2.5D/3D' : 'Playtest'}</span>
        </button>

        {!hasAudio && (
          <div className="flex items-center gap-1 shrink-0">
            {[0.5, 1, 1.5].map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => setSpeedScale(sp)}
                className={`min-h-[36px] px-2 rounded-lg text-[11px] font-bold tabular-nums cursor-pointer ${
                  Math.abs(speedScale - sp) < 0.05
                    ? 'bg-cyan-500/30 border border-cyan-400 text-white'
                    : 'bg-black/30 text-slate-300'
                }`}
              >
                {sp}x
              </button>
            ))}
          </div>
        )}

        <span className="font-mono text-[11px] font-bold text-cyan-200 px-1.5 tabular-nums shrink-0">
          {loadingAudio ? 'Cargando...' : `${liveStats.currentTime.toFixed(1)}s`}
        </span>
      </div>
    </div>
  );
  void gameSettings;
};
