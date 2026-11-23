import React, { useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Camera,
  Cpu,
  FolderOpen,
  Gamepad2,
  Home,
  Music,
  Pause,
  Play,
  Settings as SettingsIcon,
  Sparkles,
  Trash2,
  Trophy,
  Volume2,
  Zap,
} from 'lucide-react';
import type {
  AudiovisualPresetId,
  CameraConfig,
  DifficultyLevel,
  EnvironmentPreference,
  GameSettings,
  LaneCount,
  MechanicsConfig,
  MenuAmbientPreset,
  MusicalFocus,
  NoteShape,
  QualityLevel,
} from '../types/game';
import { getPresetGenerationConfig } from '../services/recordsStorage';
import { MENU_AMBIENT_PRESETS } from '../services/menuAmbientAudio';
import { ENVIRONMENT_OPTIONS } from '../game/environments/environmentSelector';
import { AUDIOVISUAL_PRESETS, DIFFICULTY_LABELS, NOTE_SHAPE_OPTIONS } from '../game/presets';

interface SettingsViewProps {
  settings: GameSettings;
  inGameOverlay?: boolean;
  onUpdateSettings: (next: GameSettings) => void;
  onSelectCustomMenuAudio?: (file: File) => Promise<void>;
  onClearCustomMenuAudio?: () => Promise<void>;
  onBack: () => void;
  onNavigate?: (screen: 'menu' | 'music' | 'records' | 'settings') => void;
  onOpenTutorial?: () => void;
}

type SettingsTab = 'gameplay' | 'mechanics' | 'camera' | 'visuals' | 'audio' | 'performance';

const TABS: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
  { id: 'gameplay', label: 'Gameplay', icon: <Gamepad2 className="w-4 h-4" /> },
  { id: 'mechanics', label: 'Mecánicas', icon: <Zap className="w-4 h-4" /> },
  { id: 'camera', label: 'Cámara', icon: <Camera className="w-4 h-4" /> },
  { id: 'visuals', label: 'Visuales', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'audio', label: 'Audio', icon: <Volume2 className="w-4 h-4" /> },
  { id: 'performance', label: 'Rendim.', icon: <Cpu className="w-4 h-4" /> },
];

const ToggleRow: React.FC<{
  label: string;
  subtitle?: string;
  checked: boolean;
  onChange: () => void;
}> = ({ label, subtitle, checked, onChange }) => (
  <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-800/70 last:border-b-0">
    <div className="min-w-0">
      <div className="text-sm font-medium text-slate-200">{label}</div>
      {subtitle && <div className="text-xs text-slate-400">{subtitle}</div>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative w-12 h-7 rounded-full transition-colors cursor-pointer shrink-0 ${
        checked ? 'bg-gradient-to-r from-cyan-500 to-fuchsia-500' : 'bg-slate-700'
      }`}
    >
      <span
        className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
);

const SliderRow: React.FC<{
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}> = ({ label, valueLabel, min, max, step, value, onChange }) => (
  <div>
    <div className="flex items-center justify-between text-xs sm:text-sm mb-1.5">
      <span className="text-slate-200">{label}</span>
      <span className="font-mono-num text-xs text-cyan-300">{valueLabel}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full beatflow-slider"
    />
  </div>
);

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  inGameOverlay = false,
  onUpdateSettings,
  onSelectCustomMenuAudio,
  onClearCustomMenuAudio,
  onBack,
  onNavigate,
  onOpenTutorial,
}) => {
  const [tab, setTab] = useState<SettingsTab>('gameplay');
  const [loadingCustomAudio, setLoadingCustomAudio] = useState(false);
  const customAudioInputRef = useRef<HTMLInputElement | null>(null);

  const update = (patch: Partial<GameSettings>) => {
    onUpdateSettings({ ...settings, ...patch });
  };

  const updateGen = (patch: Partial<GameSettings['generationConfig']>) => {
    onUpdateSettings({
      ...settings,
      generationConfig: { ...settings.generationConfig, ...patch },
    });
  };

  const updateMech = (updater: (m: MechanicsConfig) => MechanicsConfig) => {
    onUpdateSettings({
      ...settings,
      generationConfig: {
        ...settings.generationConfig,
        mechanics: updater(structuredClone(settings.generationConfig.mechanics)),
      },
    });
  };

  const updateCam = (updater: (c: CameraConfig) => CameraConfig) => {
    onUpdateSettings({
      ...settings,
      cameraConfig: updater(structuredClone(settings.cameraConfig)),
    });
  };

  const updateVis = (patch: Partial<GameSettings['visualsConfig']>) => {
    onUpdateSettings({
      ...settings,
      visualsConfig: { ...settings.visualsConfig, ...patch },
      brightness: patch.sceneBrightness ?? settings.brightness,
    });
  };

  const updateAudioReact = (patch: Partial<GameSettings['audioReactionConfig']>) => {
    onUpdateSettings({
      ...settings,
      audioReactionConfig: { ...settings.audioReactionConfig, ...patch },
    });
  };

  const updateMenuAmbient = (patch: Partial<GameSettings['menuAmbientConfig']>) => {
    onUpdateSettings({
      ...settings,
      menuAmbientConfig: { ...settings.menuAmbientConfig, ...patch },
    });
  };

  const updatePerf = (patch: Partial<GameSettings['performanceConfig']>) => {
    const nextPerf = { ...settings.performanceConfig, ...patch };
    const nextGfx: QualityLevel =
      nextPerf.performanceMode === 'battery'
        ? 'low'
        : nextPerf.performanceMode === 'balanced'
          ? 'medium'
          : nextPerf.performanceMode === 'auto'
            ? 'high'
            : settings.graphicsQuality;
    onUpdateSettings({
      ...settings,
      performanceConfig: nextPerf,
      graphicsQuality: nextGfx,
    });
  };

  const mech = settings.generationConfig.mechanics;
  const cam = settings.cameraConfig;
  const vis = settings.visualsConfig;
  const audioReact = settings.audioReactionConfig;
  const menuAmbient = settings.menuAmbientConfig;
  const perf = settings.performanceConfig;

  return (
    <div className="fixed inset-0 z-50 flex flex-col w-full h-full bg-[#040715]/97">
      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-cyan-500/25 bg-[#050818]/95 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-200 hover:text-cyan-300 hover:bg-slate-800/70 cursor-pointer"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-lg sm:text-xl text-white tracking-wide">
            Configuración Avanzada
          </h1>
        </div>

        {!inGameOverlay && (
          <button
            type="button"
            onClick={() => onNavigate?.('menu')}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/70 cursor-pointer"
            aria-label="Menú principal"
          >
            <Home className="w-5 h-5" />
          </button>
        )}
      </header>

      {/* Categorized Tab Bar */}
      <div className="flex items-center gap-1.5 px-3 sm:px-6 py-2.5 border-b border-slate-800 bg-[#05091a] overflow-x-auto shrink-0">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                active
                  ? 'bg-gradient-to-r from-cyan-500/90 to-indigo-600/90 text-white shadow-[0_0_12px_rgba(34,211,238,0.3)]'
                  : 'bg-slate-900/80 text-slate-300 border border-slate-800 hover:border-cyan-400/40'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto beatflow-scroll px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto space-y-5 pb-6">
          {/* 1. GAMEPLAY */}
          {tab === 'gameplay' && (
            <>
              <section className="rounded-2xl bg-[#060a1c]/95 border border-cyan-400/30 p-4 space-y-4">
                <h2 className="text-xs font-bold tracking-[0.14em] text-cyan-300">
                  CARRILES Y DIFICULTAD MODULAR
                </h2>

                <div>
                  <div className="text-xs text-slate-300 mb-2">Carriles por defecto</div>
                  <div className="grid grid-cols-5 gap-2">
                    {([4, 5, 6, 7, 8] as LaneCount[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateGen({ laneCount: c })}
                        className={`min-h-[40px] rounded-xl font-mono-num text-sm font-bold cursor-pointer ${
                          settings.generationConfig.laneCount === c
                            ? 'bg-cyan-500 text-slate-950'
                            : 'bg-slate-900 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {c}K
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-300 mb-2">Dificultad por defecto</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['easy', 'normal', 'hard', 'expert', 'master', 'custom'] as DifficultyLevel[]).map(
                      (d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            const preset = getPresetGenerationConfig(
                              d,
                              settings.generationConfig.seed,
                              settings.generationConfig.laneCount,
                              settings.generationConfig.maxMisses,
                            );
                            onUpdateSettings({
                              ...settings,
                              defaultDifficulty: d,
                              generationConfig: preset,
                            });
                          }}
                          className={`min-h-[38px] rounded-xl text-xs font-semibold cursor-pointer ${
                            settings.defaultDifficulty === d
                              ? 'bg-gradient-to-r from-cyan-500 to-fuchsia-600 text-white'
                              : 'bg-slate-900 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {DIFFICULTY_LABELS[d]}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-300">Límite de fallos permitidos</span>
                    <span className="font-mono-num text-cyan-300">
                      {settings.generationConfig.maxMisses >= 999
                        ? 'Sin derrota (∞)'
                        : `${settings.generationConfig.maxMisses} fallo(s)`}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 mb-3">
                    {([1, 3, 5, 10, 999] as const).map((limit) => (
                      <button
                        key={limit}
                        type="button"
                        onClick={() => updateGen({ maxMisses: limit })}
                        className={`min-h-[38px] rounded-xl text-xs font-semibold cursor-pointer ${
                          settings.generationConfig.maxMisses === limit
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'bg-slate-900 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {limit >= 999 ? '∞' : limit}
                      </button>
                    ))}
                  </div>
                  <SliderRow
                    label="Ajuste fino de fallos (1–15)"
                    valueLabel={
                      settings.generationConfig.maxMisses >= 999
                        ? 'Sin derrota'
                        : `${settings.generationConfig.maxMisses}`
                    }
                    min={1}
                    max={15}
                    step={1}
                    value={Math.min(15, settings.generationConfig.maxMisses)}
                    onChange={(v) => updateGen({ maxMisses: v })}
                  />
                </div>

                <div>
                  <div className="text-xs text-slate-300 mb-2">
                    Enfoque musical del generador
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(
                      [
                        ['balanced', 'Equilibrado'],
                        ['melody_vocal', 'Melodía y Voz'],
                        ['rhythm_bass', 'Ritmo y Bajo'],
                        ['harmonic', 'Armónico'],
                      ] as Array<[MusicalFocus, string]>
                    ).map(([id, lbl]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => updateGen({ musicalFocus: id })}
                        className={`min-h-[38px] px-2 rounded-xl text-xs font-semibold cursor-pointer ${
                          (settings.generationConfig.musicalFocus ?? 'balanced') === id
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'bg-slate-900 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                <SliderRow
                  label="Densidad de notas"
                  valueLabel={`${Math.round(settings.generationConfig.noteDensity * 100)}%`}
                  min={0.4}
                  max={1.7}
                  step={0.05}
                  value={settings.generationConfig.noteDensity}
                  onChange={(v) => updateGen({ noteDensity: v, difficulty: 'custom' })}
                />

                <SliderRow
                  label="Velocidad de aproximación"
                  valueLabel={`${settings.generationConfig.approachSpeed.toFixed(2)}x`}
                  min={0.65}
                  max={1.85}
                  step={0.05}
                  value={settings.generationConfig.approachSpeed}
                  onChange={(v) => updateGen({ approachSpeed: v, difficulty: 'custom' })}
                />

                <SliderRow
                  label="Ventana de juicio (Hit Window)"
                  valueLabel={`±${settings.generationConfig.hitWindowMs} ms`}
                  min={75}
                  max={210}
                  step={5}
                  value={settings.generationConfig.hitWindowMs}
                  onChange={(v) => updateGen({ hitWindowMs: v, difficulty: 'custom' })}
                />

                <SliderRow
                  label="Sensibilidad táctil"
                  valueLabel={`${settings.touchSensitivity.toFixed(2)}x`}
                  min={0.75}
                  max={1.35}
                  step={0.05}
                  value={settings.touchSensitivity}
                  onChange={(v) => update({ touchSensitivity: v })}
                />

                <ToggleRow
                  label="Vibración háptica"
                  subtitle="Pulso táctil en aciertos y fallos"
                  checked={settings.vibration}
                  onChange={() => update({ vibration: !settings.vibration })}
                />

                {!inGameOverlay && onOpenTutorial && (
                  <div className="pt-2 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={onOpenTutorial}
                      className="w-full min-h-[44px] rounded-xl bg-indigo-950/90 border border-cyan-400/40 text-cyan-200 text-xs sm:text-sm font-semibold hover:border-cyan-300 transition-colors cursor-pointer"
                    >
                      Abrir tutorial interactivo inicial
                    </button>
                  </div>
                )}
              </section>
            </>
          )}

          {/* 2. MECHANICS */}
          {tab === 'mechanics' && (
            <>
              <section className="rounded-2xl bg-[#060a1c]/95 border border-cyan-400/30 p-4 space-y-4">
                <h2 className="text-xs font-bold tracking-[0.14em] text-cyan-300">
                  MECÁNICAS DE JUEGO ACTIVAS Y FRECUENCIA
                </h2>

                {(
                  [
                    ['holdNotes', 'Hold Notes (Notas sostenidas)', 'Cinta luminosa continua hasta el final'],
                    ['streams', 'Streams', 'Escaleras rápidas sincronizadas al BPM'],
                    ['trills', 'Trills', 'Alternancia veloz entre 2 carriles'],
                    ['flickNotes', 'Flick Notes', 'Notas con gesto direccional de deslizamiento'],
                    ['slideNotes', 'Slide Notes', 'Trayectoria conectada deslizable entre carriles'],
                    ['rhythmBurst', 'Rhythm Burst', 'Ráfagas energéticas en drops y clímax'],
                  ] as const
                ).map(([key, title, sub]) => (
                  <div key={key} className="pb-3 border-b border-slate-800/80 space-y-2">
                    <ToggleRow
                      label={title}
                      subtitle={sub}
                      checked={mech[key].enabled}
                      onChange={() =>
                        updateMech((m) => {
                          m[key].enabled = !m[key].enabled;
                          return m;
                        })
                      }
                    />
                    {mech[key].enabled && (
                      <SliderRow
                        label={`Frecuencia de ${title.split(' ')[0]}`}
                        valueLabel={`${Math.round(mech[key].frequency * 100)}%`}
                        min={0.25}
                        max={1.5}
                        step={0.05}
                        value={mech[key].frequency}
                        onChange={(v) =>
                          updateMech((m) => {
                            m[key].frequency = v;
                            return m;
                          })
                        }
                      />
                    )}
                  </div>
                ))}

                {/* Chords */}
                <div className="pb-3 border-b border-slate-800/80 space-y-2">
                  <ToggleRow
                    label="Double Notes / Acordes (2–4 notas)"
                    subtitle="Notas simultáneas en golpes fuertes y drops"
                    checked={mech.doubleNotes.enabled}
                    onChange={() =>
                      updateMech((m) => {
                        m.doubleNotes.enabled = !m.doubleNotes.enabled;
                        return m;
                      })
                    }
                  />
                  {mech.doubleNotes.enabled && (
                    <div className="grid grid-cols-3 gap-2">
                      {([2, 3, 4] as const).map((maxN) => (
                        <button
                          key={maxN}
                          type="button"
                          onClick={() =>
                            updateMech((m) => {
                              m.doubleNotes.maxSimultaneous = maxN;
                              return m;
                            })
                          }
                          className={`min-h-[36px] rounded-xl text-xs font-semibold cursor-pointer ${
                            mech.doubleNotes.maxSimultaneous === maxN
                              ? 'bg-cyan-500 text-slate-950'
                              : 'bg-slate-900 text-slate-300 border border-slate-700'
                          }`}
                        >
                          Máx {maxN} notas
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Fever & Perfect Chain & Precision & Dynamic Sections */}
                <ToggleRow
                  label="Fever Mode"
                  subtitle={`Multiplicador x${mech.feverMode.multiplierBoost.toFixed(1)} al llenar la barra`}
                  checked={mech.feverMode.enabled}
                  onChange={() =>
                    updateMech((m) => {
                      m.feverMode.enabled = !m.feverMode.enabled;
                      return m;
                    })
                  }
                />

                <ToggleRow
                  label="Perfect Chain"
                  subtitle="Bonificación por rachas consecutivas de PERFECT"
                  checked={mech.perfectChain.enabled}
                  onChange={() =>
                    updateMech((m) => {
                      m.perfectChain.enabled = !m.perfectChain.enabled;
                      return m;
                    })
                  }
                />

                <ToggleRow
                  label="Precision Challenge"
                  subtitle="Ventana de precisión más exigente en drops y clímax"
                  checked={mech.precisionChallenge.enabled}
                  onChange={() =>
                    updateMech((m) => {
                      m.precisionChallenge.enabled = !m.precisionChallenge.enabled;
                      return m;
                    })
                  }
                />

                <ToggleRow
                  label="Secciones Dinámicas"
                  subtitle="Adapta intensidad según Intro, Groove, Buildup, Drop y Chorus"
                  checked={mech.dynamicSections}
                  onChange={() =>
                    updateMech((m) => {
                      m.dynamicSections = !m.dynamicSections;
                      return m;
                    })
                  }
                />

                <div className="pt-2">
                  <div className="text-xs text-slate-300 mb-2">
                    Penalización por soltar Hold anticipadamente
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ['proportional', 'Proporcional (justa)'],
                        ['miss', 'Fallo completo'],
                      ] as const
                    ).map(([id, lbl]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() =>
                          updateMech((m) => {
                            m.earlyReleasePenalty = id;
                            return m;
                          })
                        }
                        className={`min-h-[38px] rounded-xl text-xs font-semibold cursor-pointer ${
                          mech.earlyReleasePenalty === id
                            ? 'bg-indigo-600 text-white border border-cyan-300'
                            : 'bg-slate-900 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}

          {/* 3. CAMERA */}
          {tab === 'camera' && (
            <section className="rounded-2xl bg-[#060a1c]/95 border border-indigo-400/30 p-4 space-y-4">
              <h2 className="text-xs font-bold tracking-[0.14em] text-indigo-300">
                SISTEMA DE CÁMARA 3D CINEMATOGRÁFICA
              </h2>

              <ToggleRow
                label="Cámara dinámica activa"
                subtitle="Activa zoom, desplazamientos, inclinación y pulsos 3D en la perspectiva"
                checked={cam.enabled}
                onChange={() =>
                  updateCam((c) => {
                    c.enabled = !c.enabled;
                    return c;
                  })
                }
              />

              <ToggleRow
                label="Vista completamente estática"
                subtitle="Mantiene la cámara 3D fija sin zoom, balanceo, inclinación ni vibración"
                checked={cam.staticView}
                onChange={() =>
                  updateCam((c) => {
                    c.staticView = !c.staticView;
                    return c;
                  })
                }
              />

              <ToggleRow
                label="Movimiento reducido (Accesibilidad)"
                subtitle="Suaviza movimientos y desactiva inclinación y vibración de cámara"
                checked={cam.reducedMotion}
                onChange={() =>
                  updateCam((c) => {
                    c.reducedMotion = !c.reducedMotion;
                    return c;
                  })
                }
              />

              {cam.staticView && (
                <div className="px-3 py-2 rounded-xl bg-indigo-950/80 border border-indigo-400/40 text-xs text-indigo-200">
                  Vista estática activa: la cámara permanecerá fija centrando los carriles y la zona de pulsación.
                </div>
              )}

              <div className={cam.staticView || !cam.enabled ? 'opacity-50 space-y-4' : 'space-y-4'}>
                <SliderRow
                  label="Intensidad global de cámara"
                  valueLabel={`${Math.round(cam.overallIntensity * 100)}%`}
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={cam.overallIntensity}
                  onChange={(v) =>
                    updateCam((c) => {
                      c.overallIntensity = v;
                      return c;
                    })
                  }
                />

                {(
                  [
                    [
                      'dynamicZoom',
                      'Intensidad del zoom (Zoom In / Impacto)',
                      'Acercamiento progresivo en buildups y golpes en drops',
                    ],
                    [
                      'pullBack',
                      'Zoom Out (Alejamiento en secciones calmas)',
                      'Amplía el ángulo de visión en intros, breakdowns y pausas',
                    ],
                    [
                      'horizontalOffset',
                      'Desplazamiento horizontal',
                      'Traslación lateral de la cámara 3D con retorno automático',
                    ],
                    [
                      'verticalOffset',
                      'Desplazamiento vertical',
                      'Elevación y descenso suave de altura al ritmo musical',
                    ],
                    [
                      'tilt',
                      'Inclinación de cámara (Tilt)',
                      'Ladeo cinematográfico moderado en acentos y transiciones',
                    ],
                    [
                      'cameraShake',
                      'Vibración de cámara (Shake)',
                      'Sacudida controlada en drops intensos y fallos',
                    ],
                  ] as const
                ).map(([key, title, sub]) => (
                  <div key={key} className="pt-2 border-t border-slate-800/80 space-y-2">
                    <ToggleRow
                      label={title}
                      subtitle={sub}
                      checked={cam[key].enabled}
                      onChange={() =>
                        updateCam((c) => {
                          c[key].enabled = !c[key].enabled;
                          return c;
                        })
                      }
                    />
                    {cam[key].enabled && (
                      <SliderRow
                        label={`Intensidad: ${title.split(' (')[0]}`}
                        valueLabel={`${Math.round(cam[key].intensity * 100)}%`}
                        min={0}
                        max={1.5}
                        step={0.05}
                        value={cam[key].intensity}
                        onChange={(v) =>
                          updateCam((c) => {
                            c[key].intensity = v;
                            return c;
                          })
                        }
                      />
                    )}
                  </div>
                ))}

                <ToggleRow
                  label="Transiciones suaves"
                  subtitle="Interpolación cinematográfica entre secciones musicales"
                  checked={cam.smoothTransitions}
                  onChange={() =>
                    updateCam((c) => {
                      c.smoothTransitions = !c.smoothTransitions;
                      return c;
                    })
                  }
                />
              </div>
            </section>
          )}

          {/* 4. VISUALS */}
          {tab === 'visuals' && (
            <section className="rounded-2xl bg-[#060a1c]/95 border border-fuchsia-400/30 p-4 space-y-4">
              <h2 className="text-xs font-bold tracking-[0.14em] text-fuchsia-300">
                PRESETS, FORMAS DE NOTA E ILUMINACIÓN
              </h2>

              <div>
                <div className="text-xs text-slate-300 mb-2">Preset Audiovisual</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AUDIOVISUAL_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => updateVis({ preset: p.id as AudiovisualPresetId })}
                      className={`min-h-[40px] px-2.5 rounded-xl text-xs font-semibold text-left cursor-pointer border ${
                        vis.preset === p.id
                          ? 'bg-fuchsia-600/80 border-fuchsia-300 text-white'
                          : 'bg-slate-900 border-slate-700 text-slate-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-300 mb-2">Forma de las notas 3D</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {NOTE_SHAPE_OPTIONS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => update({ noteShape: s.id as NoteShape })}
                      className={`min-h-[38px] rounded-xl text-xs font-semibold cursor-pointer ${
                        settings.noteShape === s.id
                          ? 'bg-indigo-600 text-white border border-cyan-300'
                          : 'bg-slate-900 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-300 mb-2">Mundo 3D</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {ENVIRONMENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => update({ environmentMode: opt.id as EnvironmentPreference })}
                      className={`min-h-[36px] px-2 rounded-xl text-[11px] font-semibold cursor-pointer ${
                        settings.environmentMode === opt.id
                          ? 'bg-cyan-600 text-white border border-cyan-300'
                          : 'bg-slate-900 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <ToggleRow
                label="Colores personalizados de pista y notas"
                checked={vis.useCustomColors}
                onChange={() => updateVis({ useCustomColors: !vis.useCustomColors })}
              />

              {vis.useCustomColors && (
                <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  {(
                    [
                      ['primary', 'Carril A'],
                      ['secondary', 'Carril B'],
                      ['accent', 'Acento'],
                    ] as const
                  ).map(([field, lbl]) => (
                    <label key={field} className="flex flex-col items-center gap-1.5 text-xs text-slate-300">
                      <span>{lbl}</span>
                      <input
                        type="color"
                        value={vis.customPalette[field]}
                        onChange={(e) =>
                          updateVis({
                            customPalette: { ...vis.customPalette, [field]: e.target.value },
                          })
                        }
                        className="w-10 h-8 rounded cursor-pointer bg-transparent border-0"
                      />
                    </label>
                  ))}
                </div>
              )}

              <SliderRow
                label="Brillo general del escenario"
                valueLabel={`${Math.round(vis.sceneBrightness * 100)}%`}
                min={0.6}
                max={1.35}
                step={0.05}
                value={vis.sceneBrightness}
                onChange={(v) => updateVis({ sceneBrightness: v })}
              />

              <SliderRow
                label="Brillo lateral y entorno"
                valueLabel={`${Math.round(vis.sideBrightness * 100)}%`}
                min={0.35}
                max={1.3}
                step={0.05}
                value={vis.sideBrightness}
                onChange={(v) => updateVis({ sideBrightness: v })}
              />

              <SliderRow
                label="Intensidad de Bloom"
                valueLabel={`${Math.round(vis.bloomIntensity * 100)}%`}
                min={0.25}
                max={1.5}
                step={0.05}
                value={vis.bloomIntensity}
                onChange={(v) => updateVis({ bloomIntensity: v })}
              />

              <SliderRow
                label="Intensidad de Glow en notas y raíles"
                valueLabel={`${Math.round(vis.glowIntensity * 100)}%`}
                min={0.35}
                max={1.5}
                step={0.05}
                value={vis.glowIntensity}
                onChange={(v) => updateVis({ glowIntensity: v })}
              />

              <SliderRow
                label="Cantidad e intensidad de partículas"
                valueLabel={`${Math.round(vis.particleIntensityValue * 100)}%`}
                min={0.25}
                max={1.5}
                step={0.05}
                value={vis.particleIntensityValue}
                onChange={(v) => updateVis({ particleIntensityValue: v })}
              />

              <SliderRow
                label="Intensidad de efectos de luz en pantalla"
                valueLabel={`${Math.round(vis.flashIntensity * 100)}%`}
                min={0}
                max={1.1}
                step={0.05}
                value={vis.flashIntensity}
                onChange={(v) => updateVis({ flashIntensity: v })}
              />

              <ToggleRow
                label="Efectos de luz en bordes de pantalla"
                checked={vis.screenEffects}
                onChange={() => updateVis({ screenEffects: !vis.screenEffects })}
              />

              <ToggleRow
                label="Destellos reducidos (Accesibilidad)"
                subtitle="Suaviza destellos y picos luminosos intensos"
                checked={vis.reducedFlash}
                onChange={() => updateVis({ reducedFlash: !vis.reducedFlash })}
              />
            </section>
          )}

          {/* 5. AUDIO, MENU AMBIENT & 6-BAND REACTION */}
          {tab === 'audio' && (
            <>
              <section className="rounded-2xl bg-[#060a1c]/95 border border-fuchsia-400/35 p-4 space-y-4">
                <h2 className="text-xs font-bold tracking-[0.14em] text-fuchsia-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  MÚSICA Y AMBIENTACIÓN DEL MENÚ
                </h2>

                <ToggleRow
                  label="Música ambiental del menú"
                  subtitle="Sistema musical atmosférico exclusivo del menú (se apaga al iniciar una canción)"
                  checked={menuAmbient.musicEnabled}
                  onChange={() => updateMenuAmbient({ musicEnabled: !menuAmbient.musicEnabled })}
                />

                {menuAmbient.musicEnabled && (
                  <SliderRow
                    label="Volumen de música del menú"
                    valueLabel={`${Math.round(menuAmbient.musicVolume * 100)}%`}
                    min={0}
                    max={1}
                    step={0.02}
                    value={menuAmbient.musicVolume}
                    onChange={(v) => updateMenuAmbient({ musicVolume: v })}
                  />
                )}

                <div>
                  <div className="text-xs text-slate-300 mb-2">Fuente musical del menú</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => updateMenuAmbient({ sourceMode: 'preset' })}
                      className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold cursor-pointer border transition-colors ${
                        (menuAmbient.sourceMode ?? 'preset') === 'preset'
                          ? 'bg-cyan-500/90 border-cyan-300 text-slate-950 font-bold'
                          : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-400/45'
                      }`}
                    >
                      Ambientes Integrados
                    </button>
                    <button
                      type="button"
                      onClick={() => updateMenuAmbient({ sourceMode: 'custom' })}
                      className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold cursor-pointer border transition-colors ${
                        menuAmbient.sourceMode === 'custom'
                          ? 'bg-fuchsia-600/85 border-fuchsia-300 text-white font-bold'
                          : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-fuchsia-400/45'
                      }`}
                    >
                      Archivo Local Propio
                    </button>
                  </div>
                </div>

                {menuAmbient.sourceMode === 'custom' ? (
                  <div className="rounded-xl bg-slate-900/85 border border-fuchsia-400/30 p-3.5 space-y-3">
                    <input
                      ref={customAudioInputRef}
                      type="file"
                      accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm,.opus"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file || !onSelectCustomMenuAudio) return;
                        setLoadingCustomAudio(true);
                        try {
                          await onSelectCustomMenuAudio(file);
                        } finally {
                          setLoadingCustomAudio(false);
                        }
                      }}
                    />

                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold tracking-wider text-fuchsia-300">
                          PISTA AMBIENTAL LOCAL
                        </div>
                        <div className="text-sm font-semibold text-white truncate">
                          {menuAmbient.customTrackName
                            ? menuAmbient.customTrackName
                            : 'Ningún archivo seleccionado'}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={loadingCustomAudio}
                        onClick={() => customAudioInputRef.current?.click()}
                        className="min-h-[44px] px-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-fuchsia-600 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer hover:brightness-110 disabled:opacity-50"
                      >
                        <FolderOpen className="w-4 h-4" />
                        <span>
                          {loadingCustomAudio
                            ? 'Cargando...'
                            : menuAmbient.customTrackName
                              ? 'Cambiar'
                              : 'Elegir archivo'}
                        </span>
                      </button>
                    </div>

                    {menuAmbient.customTrackName ? (
                      <div className="space-y-3 pt-2 border-t border-slate-800/80">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateMenuAmbient({ customPaused: !menuAmbient.customPaused })
                            }
                            className="min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-cyan-400/40 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {menuAmbient.customPaused ? (
                              <>
                                <Play className="w-4 h-4 text-cyan-300 fill-cyan-300" />
                                <span>Reproducir</span>
                              </>
                            ) : (
                              <>
                                <Pause className="w-4 h-4 text-fuchsia-300" />
                                <span>Pausar</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              if (onClearCustomMenuAudio) {
                                await onClearCustomMenuAudio();
                              } else {
                                updateMenuAmbient({
                                  sourceMode: 'preset',
                                  customTrackName: '',
                                  customPaused: false,
                                });
                              }
                            }}
                            className="min-h-[44px] px-3 rounded-xl bg-slate-900 hover:bg-rose-950/70 border border-slate-700 hover:border-rose-400/50 text-xs font-semibold text-slate-300 hover:text-rose-200 flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Volver a ambiente</span>
                          </button>
                        </div>

                        <ToggleRow
                          label="Reproducción en bucle (Loop)"
                          subtitle="Repite automáticamente la pista seleccionada mientras estés en el menú"
                          checked={menuAmbient.customLoop ?? true}
                          onChange={() =>
                            updateMenuAmbient({ customLoop: !(menuAmbient.customLoop ?? true) })
                          }
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        Compatible con MP3, WAV, OGG, M4A, AAC o FLAC almacenados localmente en tu dispositivo.
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="text-xs text-slate-300 mb-2">Estilo ambiental integrado</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {MENU_AMBIENT_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => updateMenuAmbient({ preset: preset.id as MenuAmbientPreset })}
                          className={`min-h-[46px] px-3 py-2 rounded-xl text-left transition-all cursor-pointer border ${
                            menuAmbient.preset === preset.id
                              ? 'bg-fuchsia-600/80 border-fuchsia-300 text-white shadow-[0_0_12px_rgba(217,70,239,0.28)]'
                              : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-400/45'
                          }`}
                        >
                          <div className="text-xs font-bold">{preset.label}</div>
                          <div className="text-[11px] opacity-80 truncate">{preset.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <ToggleRow
                  label="Efectos ambientales del escenario en menú"
                  subtitle="Luces reactivas, portal de energía, vehículos y partículas en el fondo 3D"
                  checked={menuAmbient.ambientEffectsEnabled}
                  onChange={() =>
                    updateMenuAmbient({ ambientEffectsEnabled: !menuAmbient.ambientEffectsEnabled })
                  }
                />

                <ToggleRow
                  label="Animaciones y parallax del menú"
                  subtitle="Movimiento panorámico 3D, parallax interactivo y brillo dinámico del HUD"
                  checked={menuAmbient.menuAnimationsEnabled}
                  onChange={() =>
                    updateMenuAmbient({ menuAnimationsEnabled: !menuAmbient.menuAnimationsEnabled })
                  }
                />

                <div>
                  <div className="text-xs text-slate-300 mb-2">
                    Intensidad visual del escenario del menú
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ['low', 'Suave'],
                        ['medium', 'Equilibrada'],
                        ['high', 'Intensa'],
                      ] as const
                    ).map(([id, lbl]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => updateMenuAmbient({ visualIntensity: id })}
                        className={`min-h-[38px] rounded-xl text-xs font-semibold cursor-pointer ${
                          menuAmbient.visualIntensity === id
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'bg-slate-900 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl bg-[#060a1c]/95 border border-cyan-400/30 p-4 space-y-4">
                <h2 className="text-xs font-bold tracking-[0.14em] text-cyan-300 flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  AUDIO, LATENCIA Y REACCIÓN ESPECTRAL 6 BANDAS
                </h2>

              <SliderRow
                label="Música"
                valueLabel={`${Math.round(settings.musicVolume * 100)}%`}
                min={0}
                max={1}
                step={0.02}
                value={settings.musicVolume}
                onChange={(v) => update({ musicVolume: v })}
              />

              <SliderRow
                label="Efectos ambientales (Fever / Transiciones)"
                valueLabel={`${Math.round((settings.ambientVolume ?? 0.6) * 100)}%`}
                min={0}
                max={1}
                step={0.02}
                value={settings.ambientVolume ?? 0.6}
                onChange={(v) => update({ ambientVolume: v })}
              />

              <SliderRow
                label="Efectos de impacto (Drops / Alertas)"
                valueLabel={`${Math.round((settings.impactVolume ?? 0.65) * 100)}%`}
                min={0}
                max={1}
                step={0.02}
                value={settings.impactVolume ?? 0.65}
                onChange={(v) => update({ impactVolume: v, sfxVolume: v })}
              />

              <div className="pt-1 border-t border-slate-800/80 space-y-3">
                <ToggleRow
                  label="Sonidos de interfaz"
                  subtitle="Desactívalos sin afectar la música ni el análisis DSP en tiempo real"
                  checked={settings.uiSoundsEnabled ?? true}
                  onChange={() => update({ uiSoundsEnabled: !(settings.uiSoundsEnabled ?? true) })}
                />
                {(settings.uiSoundsEnabled ?? true) && (
                  <SliderRow
                    label="Volumen de sonidos de interfaz"
                    valueLabel={`${Math.round((settings.uiVolume ?? 0.45) * 100)}%`}
                    min={0}
                    max={1}
                    step={0.02}
                    value={settings.uiVolume ?? 0.45}
                    onChange={(v) => update({ uiVolume: v })}
                  />
                )}
              </div>

              <SliderRow
                label="Calibración de latencia (Offset)"
                valueLabel={`${settings.audioOffsetMs >= 0 ? `+${settings.audioOffsetMs}` : settings.audioOffsetMs} ms`}
                min={-150}
                max={150}
                step={5}
                value={settings.audioOffsetMs}
                onChange={(v) => update({ audioOffsetMs: v })}
              />

              <ToggleRow
                label="Visualización reactiva en tiempo real"
                checked={settings.reactiveVisuals}
                onChange={() => update({ reactiveVisuals: !settings.reactiveVisuals })}
              />

              <ToggleRow
                label="Reacción al pulso y BPM detectado"
                checked={audioReact.beatDetectionEnabled}
                onChange={() =>
                  updateAudioReact({ beatDetectionEnabled: !audioReact.beatDetectionEnabled })
                }
              />

              <SliderRow
                label="Sensibilidad de frecuencias (FFT)"
                valueLabel={`${Math.round(audioReact.frequencySensitivity * 100)}%`}
                min={0.5}
                max={1.8}
                step={0.05}
                value={audioReact.frequencySensitivity}
                onChange={(v) => updateAudioReact({ frequencySensitivity: v })}
              />

              <SliderRow
                label="Peso Sub-Bass (Atmósfera / Niebla)"
                valueLabel={`${Math.round(audioReact.subBassWeight * 100)}%`}
                min={0}
                max={1.6}
                step={0.05}
                value={audioReact.subBassWeight}
                onChange={(v) => updateAudioReact({ subBassWeight: v })}
              />

              <SliderRow
                label="Peso Bass (Raíles y Pulso)"
                valueLabel={`${Math.round(audioReact.bassWeight * 100)}%`}
                min={0}
                max={1.6}
                step={0.05}
                value={audioReact.bassWeight}
                onChange={(v) => updateAudioReact({ bassWeight: v })}
              />

              <SliderRow
                label="Peso Mid (Escenario y Arquitectura)"
                valueLabel={`${Math.round(audioReact.midWeight * 100)}%`}
                min={0}
                max={1.6}
                step={0.05}
                value={audioReact.midWeight}
                onChange={(v) => updateAudioReact({ midWeight: v })}
              />

              <SliderRow
                label="Peso High-Mid / Treble (Destellos y Líneas)"
                valueLabel={`${Math.round(audioReact.trebleWeight * 100)}%`}
                min={0}
                max={1.6}
                step={0.05}
                value={audioReact.trebleWeight}
                onChange={(v) => updateAudioReact({ trebleWeight: v, highMidWeight: v })}
              />
              </section>
            </>
          )}

          {/* 6. PERFORMANCE */}
          {tab === 'performance' && (
            <section className="rounded-2xl bg-[#060a1c]/95 border border-emerald-400/30 p-4 space-y-4">
              <h2 className="text-xs font-bold tracking-[0.14em] text-emerald-300">
                RENDIMIENTO MÓVIL Y CALIDAD GRÁFICA
              </h2>

              <div>
                <div className="text-xs text-slate-300 mb-2">Perfil de rendimiento</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      ['auto', 'Automático'],
                      ['quality', 'Máxima Calidad'],
                      ['balanced', 'Equilibrado'],
                      ['battery', 'Ahorro Batería'],
                    ] as const
                  ).map(([id, lbl]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => updatePerf({ performanceMode: id })}
                      className={`min-h-[42px] px-2 rounded-xl text-xs font-semibold cursor-pointer ${
                        perf.performanceMode === id
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-slate-900 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-300 mb-2">Calidad gráfica 3D</div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['low', 'Baja'],
                      ['medium', 'Media'],
                      ['high', 'Alta'],
                    ] as const
                  ).map(([id, lbl]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => update({ graphicsQuality: id })}
                      className={`min-h-[40px] rounded-xl text-xs font-semibold cursor-pointer ${
                        settings.graphicsQuality === id
                          ? 'bg-cyan-500 text-slate-950'
                          : 'bg-slate-900 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-300 mb-2">Calidad de reflejos</div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['low', 'Baja'],
                      ['medium', 'Media'],
                      ['high', 'Alta'],
                    ] as const
                  ).map(([id, lbl]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => update({ reflectionQuality: id })}
                      className={`min-h-[40px] rounded-xl text-xs font-semibold cursor-pointer ${
                        settings.reflectionQuality === id
                          ? 'bg-cyan-500 text-slate-950'
                          : 'bg-slate-900 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-300 mb-2">Densidad de partículas</div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['low', 'Suave'],
                      ['medium', 'Media'],
                      ['high', 'Intensa'],
                    ] as const
                  ).map(([id, lbl]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => update({ particleIntensity: id })}
                      className={`min-h-[40px] rounded-xl text-xs font-semibold cursor-pointer ${
                        settings.particleIntensity === id
                          ? 'bg-fuchsia-500 text-white'
                          : 'bg-slate-900 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Bottom Tab Navigation */}
      {!inGameOverlay && onNavigate && (
        <nav className="grid grid-cols-4 h-16 bg-slate-950/95 border-t border-cyan-500/20 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('menu')}
            className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-100 cursor-pointer"
          >
            <Home className="w-5 h-5" />
            <span className="text-[11px] font-medium">Inicio</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('music')}
            className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-100 cursor-pointer"
          >
            <Music className="w-5 h-5" />
            <span className="text-[11px] font-medium">Música</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('records')}
            className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-100 cursor-pointer"
          >
            <Trophy className="w-5 h-5" />
            <span className="text-[11px] font-medium">Récords</span>
          </button>
          <button
            type="button"
            className="flex flex-col items-center justify-center gap-1 text-cyan-300 cursor-pointer"
          >
            <SettingsIcon className="w-5 h-5" />
            <span className="text-[11px] font-semibold">Config.</span>
          </button>
        </nav>
      )}
    </div>
  );
};
