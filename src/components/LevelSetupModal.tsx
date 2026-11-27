import React, { useState } from 'react';
import { Disc3, Eye, Globe, Layers, Play, RefreshCw, Shield, Sliders, Sparkles, X } from 'lucide-react';
import { EnvironmentPreviewModal } from './EnvironmentPreviewModal';
import type {
  AudiovisualPresetId,
  DifficultyLevel,
  EnvironmentPreference,
  GenerationConfig,
  LaneCount,
  MechanicsConfig,
  MusicalFocus,
  NoteShape,
  SongMetadata,
} from '../types/game';
import { generateRandomSeed, getPresetGenerationConfig } from '../services/recordsStorage';
import { ENVIRONMENT_OPTIONS } from '../game/environments/environmentSelector';
import { AUDIOVISUAL_PRESETS, NOTE_SHAPE_OPTIONS } from '../game/presets';

interface LevelSetupModalProps {
  song: SongMetadata;
  initialConfig: GenerationConfig;
  initialShape: NoteShape;
  initialEnvironmentMode: EnvironmentPreference;
  initialPreset: AudiovisualPresetId;
  analyzing: boolean;
  onClose: () => void;
  onStartGame: (
    config: GenerationConfig,
    shape: NoteShape,
    environmentMode: EnvironmentPreference,
    preset: AudiovisualPresetId,
  ) => void;
}

const DIFFICULTIES: Array<{ id: DifficultyLevel; label: string }> = [
  { id: 'easy', label: 'Fácil' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Difícil' },
  { id: 'expert', label: 'Experto' },
  { id: 'master', label: 'Maestro' },
  { id: 'custom', label: 'Personalizado' },
];

const LANE_COUNTS: LaneCount[] = [4, 5, 6, 7, 8];

const MAX_MISS_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: '1 Fallo' },
  { value: 3, label: '3 (Estándar)' },
  { value: 5, label: '5 Fallos' },
  { value: 10, label: '10 Fallos' },
  { value: 999, label: 'Sin derrota' },
];

export const LevelSetupModal: React.FC<LevelSetupModalProps> = ({
  song,
  initialConfig,
  initialShape,
  initialEnvironmentMode,
  initialPreset,
  analyzing,
  onClose,
  onStartGame,
}) => {
  const [config, setConfig] = useState<GenerationConfig>(() => ({
    ...initialConfig,
    seed: generateRandomSeed(),
    mechanics: structuredClone(initialConfig.mechanics),
  }));
  const [shape, setShape] = useState<NoteShape>(initialShape);
  const [environmentMode, setEnvironmentMode] = useState<EnvironmentPreference>(
    initialEnvironmentMode,
  );
  const [preset, setPreset] = useState<AudiovisualPresetId>(initialPreset);
  const [showAdvanced, setShowAdvanced] = useState(initialConfig.difficulty === 'custom');
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  const handleSelectDifficulty = (diff: DifficultyLevel) => {
    if (diff === 'custom') {
      setConfig((prev) => ({ ...prev, difficulty: 'custom' }));
      setShowAdvanced(true);
    } else {
      const next = getPresetGenerationConfig(
        diff,
        config.seed,
        config.laneCount,
        config.maxMisses,
      );
      setConfig({
        ...next,
        musicalFocus: config.musicalFocus ?? 'balanced',
        twoThumbMode: Boolean(config.twoThumbMode),
      });
    }
  };

  const updateField = <K extends keyof GenerationConfig>(key: K, value: GenerationConfig[K]) => {
    setConfig((prev) => ({
      ...prev,
      difficulty:
        key === 'seed' ||
        key === 'laneCount' ||
        key === 'maxMisses' ||
        key === 'musicalFocus' ||
        key === 'twoThumbMode'
          ? prev.difficulty
          : 'custom',
      [key]: value,
    }));
  };

  const toggleMechanic = (
    key:
      | 'holdNotes'
      | 'doubleNotes'
      | 'streams'
      | 'trills'
      | 'flickNotes'
      | 'slideNotes'
      | 'feverMode'
      | 'perfectChain'
      | 'rhythmBurst'
      | 'precisionChallenge',
  ) => {
    setConfig((prev) => {
      const nextMech: MechanicsConfig = structuredClone(prev.mechanics);
      nextMech[key].enabled = !nextMech[key].enabled;
      return { ...prev, mechanics: nextMech };
    });
  };

  const mechanicPills: Array<{
    key:
      | 'holdNotes'
      | 'doubleNotes'
      | 'streams'
      | 'trills'
      | 'flickNotes'
      | 'slideNotes'
      | 'feverMode'
      | 'perfectChain'
      | 'rhythmBurst'
      | 'precisionChallenge';
    label: string;
  }> = [
    { key: 'holdNotes', label: 'Hold' },
    { key: 'doubleNotes', label: 'Acordes' },
    { key: 'streams', label: 'Streams' },
    { key: 'trills', label: 'Trills' },
    { key: 'flickNotes', label: 'Flick' },
    { key: 'slideNotes', label: 'Slide' },
    { key: 'feverMode', label: 'Fever' },
    { key: 'perfectChain', label: 'Perfect Chain' },
    { key: 'rhythmBurst', label: 'Rhythm Burst' },
    { key: 'precisionChallenge', label: 'Precisión' },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/78 p-0 sm:p-4">
      <div className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#090e24] border border-cyan-400/35 shadow-[0_0_40px_rgba(34,211,238,0.2)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {song.coverArtDataUrl ? (
              <img
                src={song.coverArtDataUrl}
                alt={song.title}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-xl object-cover shrink-0 border border-white/15"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/30 to-fuchsia-500/30 border border-white/15 flex items-center justify-center shrink-0">
                <Disc3 className="w-6 h-6 text-cyan-300" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="font-display font-bold text-base sm:text-lg text-white truncate">
                {song.title}
              </h2>
              <p className="text-xs text-slate-300 truncate">
                {song.artist}
                {song.profile && (song.profile.analysisVersion ?? 1) >= 2
                  ? ` · ${song.profile.bpm} BPM · ${song.profile.timeSignature ?? '4/4'}`
                  : ' · Análisis multicapa listo'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={analyzing}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer disabled:opacity-40"
            aria-label="Cerrar configuración de partida"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto beatflow-scroll p-5 space-y-5">
          {/* Lanes Selector (4-8) */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2">
              <Layers className="w-3.5 h-3.5 text-cyan-300" />
              <span>Número de carriles (4 a 8)</span>
            </label>
            <div className="grid grid-cols-5 gap-2">
              {LANE_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => updateField('laneCount', count)}
                  className={`min-h-[42px] rounded-xl font-mono-num text-sm font-bold transition-all cursor-pointer ${
                    config.laneCount === count
                      ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white border border-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.35)]'
                      : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {count}K
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Dificultad modular
            </label>
            <div className="grid grid-cols-3 gap-2">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => handleSelectDifficulty(d.id)}
                  className={`min-h-[40px] px-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    config.difficulty === d.id
                      ? 'bg-gradient-to-r from-cyan-500 to-fuchsia-600 text-white shadow-[0_0_12px_rgba(34,211,238,0.4)]'
                      : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Two-Thumb Mode */}
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-900/85 border border-cyan-500/25 px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-semibold text-white">
                Modo de Dos Pulgares
              </div>
              <div className="text-[11px] text-slate-400">
                Máximo 2 notas simultáneas y carriles adaptados para jugar con ambos pulgares
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(config.twoThumbMode)}
              onClick={() => updateField('twoThumbMode', !config.twoThumbMode)}
              className={`relative w-12 h-7 rounded-full transition-colors cursor-pointer shrink-0 ${
                config.twoThumbMode
                  ? 'bg-gradient-to-r from-cyan-500 to-fuchsia-500'
                  : 'bg-slate-700'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                  config.twoThumbMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Max Misses */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2">
              <Shield className="w-3.5 h-3.5 text-rose-300" />
              <span>Fallos permitidos antes de derrota</span>
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {MAX_MISS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateField('maxMisses', opt.value)}
                  className={`min-h-[38px] px-2 rounded-xl text-[11px] font-semibold transition-all cursor-pointer ${
                    config.maxMisses === opt.value
                      ? 'bg-rose-600/80 text-white border border-rose-300'
                      : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Audiovisual Preset */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-fuchsia-300" />
              <span>Preset audiovisual</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {AUDIOVISUAL_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id)}
                  className={`min-h-[38px] px-2 rounded-xl text-[11px] font-semibold transition-all cursor-pointer truncate ${
                    preset === p.id
                      ? 'bg-fuchsia-600/80 text-white border border-fuchsia-300'
                      : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Mechanics Toggles */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300">
                Mecánicas musicales activas
              </label>
              <button
                type="button"
                onClick={() =>
                  setConfig((prev) => ({
                    ...prev,
                    mechanics: {
                      ...prev.mechanics,
                      dynamicSections: !prev.mechanics.dynamicSections,
                    },
                  }))
                }
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border cursor-pointer ${
                  config.mechanics.dynamicSections
                    ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                    : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}
              >
                Secciones: {config.mechanics.dynamicSections ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {mechanicPills.map((m) => {
                const active = config.mechanics[m.key].enabled;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => toggleMechanic(m.key)}
                    className={`min-h-[36px] px-2 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer ${
                      active
                        ? 'bg-cyan-500/20 border-cyan-400/70 text-cyan-100'
                        : 'bg-slate-900/70 border-slate-800 text-slate-500'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Note Geometry Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Forma de las notas 2.5D
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {NOTE_SHAPE_OPTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setShape(s.id)}
                  className={`min-h-[38px] px-2 rounded-xl text-[11px] font-semibold transition-all cursor-pointer ${
                    shape === s.id
                      ? 'bg-indigo-600 text-white border border-cyan-300'
                      : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Environment World Selector */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Globe className="w-3.5 h-3.5 text-cyan-300" />
                <span>Escenario 2.5D</span>
              </label>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(true)}
                className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Vista previa 2.5D</span>
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {ENVIRONMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setEnvironmentMode(opt.id)}
                  className={`min-h-[36px] px-2 rounded-xl text-[11px] font-semibold transition-all cursor-pointer ${
                    environmentMode === opt.id
                      ? 'bg-cyan-600/80 text-white border border-cyan-300'
                      : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {previewModalOpen && (
            <EnvironmentPreviewModal
              currentMode={environmentMode}
              onSelect={(m) => setEnvironmentMode(m)}
              onClose={() => setPreviewModalOpen(false)}
            />
          )}

          {/* Seed Control */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">Semilla procedural</label>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 flex items-center gap-1 cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{showAdvanced ? 'Ocultar ajuste fino' : 'Ajuste fino'}</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={config.seed}
                onChange={(e) => updateField('seed', e.target.value.toUpperCase())}
                className="flex-1 h-11 px-3.5 rounded-xl bg-slate-900 border border-slate-700 font-mono-num text-sm text-white focus:outline-none focus:border-cyan-400"
                placeholder="BF-XXXXXX"
              />
              <button
                type="button"
                onClick={() => updateField('seed', generateRandomSeed())}
                className="min-h-[44px] px-3.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-400 text-slate-200 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 text-cyan-300" />
                <span>Nueva</span>
              </button>
            </div>
          </div>

          {/* Advanced Sliders & Musical Focus */}
          {showAdvanced && (
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div>
                <div className="text-xs text-slate-300 mb-1.5">Enfoque musical del nivel</div>
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
                      onClick={() => updateField('musicalFocus', id)}
                      className={`min-h-[38px] px-2 rounded-xl text-[11px] font-semibold cursor-pointer transition-colors ${
                        (config.musicalFocus ?? 'balanced') === id
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Densidad de notas</span>
                  <span className="font-mono-num text-cyan-300">
                    {Math.round(config.noteDensity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.4}
                  max={1.7}
                  step={0.05}
                  value={config.noteDensity}
                  onChange={(e) => updateField('noteDensity', Number(e.target.value))}
                  className="w-full beatflow-slider"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Velocidad de aproximación</span>
                  <span className="font-mono-num text-cyan-300">
                    {config.approachSpeed.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.65}
                  max={1.85}
                  step={0.05}
                  value={config.approachSpeed}
                  onChange={(e) => updateField('approachSpeed', Number(e.target.value))}
                  className="w-full beatflow-slider"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Complejidad de patrones</span>
                  <span className="font-mono-num text-fuchsia-300">
                    {Math.round(config.patternComplexity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={config.patternComplexity}
                  onChange={(e) => updateField('patternComplexity', Number(e.target.value))}
                  className="w-full beatflow-slider"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Ventana de pulsación</span>
                  <span className="font-mono-num text-cyan-300">±{config.hitWindowMs} ms</span>
                </div>
                <input
                  type="range"
                  min={75}
                  max={210}
                  step={5}
                  value={config.hitWindowMs}
                  onChange={(e) => updateField('hitWindowMs', Number(e.target.value))}
                  className="w-full beatflow-slider"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/95 shrink-0">
          <button
            type="button"
            disabled={analyzing}
            onClick={() => onStartGame(config, shape, environmentMode, preset)}
            className="w-full min-h-[52px] rounded-2xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-fuchsia-600 text-white font-display font-bold text-lg tracking-wide flex items-center justify-center gap-2.5 hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_0_24px_rgba(34,211,238,0.4)] cursor-pointer disabled:opacity-60"
          >
            <Play className="w-5 h-5 fill-white" />
            <span>{analyzing ? 'Analizando música y generando nivel...' : 'COMENZAR PARTIDA'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
