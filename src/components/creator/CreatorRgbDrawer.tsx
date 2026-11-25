import React from 'react';
import { Palette, RotateCcw, Trash2, X } from 'lucide-react';
import type { EnvironmentTheme, FlickDirection, LaneCount } from '../../types/game';
import type {
  AudioReactiveBand,
  BackgroundTriggerParams,
  BlendModeType,
  CameraFxKind,
  CameraFxTriggerParams,
  CasillaShape,
  ColorComboMode,
  CreatorObject,
  EasingType,
  HitExplosionStyle,
  PulseKind,
  ScreenPulseTriggerParams,
} from '../../types/creator';
import { ALL_ENVIRONMENT_THEMES } from '../../game/environments/environmentSelector';
import { ENVIRONMENT_DEFINITIONS } from '../../game/environments/environmentDefinitions';
import { casillaShapeToConcreteShape, isCasillaObject } from '../../creator/ObjectLibrary';

interface CreatorRgbDrawerProps {
  open: boolean;
  selectedObjects: CreatorObject[];
  laneCount: LaneCount;
  bpm: number;
  songPaletteColors: string[];
  onClose: () => void;
  onUpdateCasillaMaterial: (patch: {
    color?: string;
    secondaryColor?: string;
    colorComboMode?: ColorComboMode;
    blendMode?: BlendModeType;
    hitExplosion?: HitExplosionStyle;
  }) => void;
  onMutateSelectedObjects: (updater: (obj: CreatorObject) => CreatorObject) => void;
  onDeleteSelected: () => void;
}

const QUICK_COLORS = [
  '#22d3ee',
  '#38bdf8',
  '#ec4899',
  '#a855f7',
  '#f59e0b',
  '#fde047',
  '#34d399',
  '#fb7185',
  '#ffffff',
];

const HIT_EXPLOSION_OPTIONS: Array<{ id: HitExplosionStyle; label: string }> = [
  { id: 'sparks', label: 'Chispas' },
  { id: 'shockwave', label: 'Shockwave' },
  { id: 'ring', label: 'Anillo' },
  { id: 'burst', label: 'Explosión' },
  { id: 'neon_flame', label: 'Llama Neón' },
  { id: 'none', label: 'Sin efecto' },
];

const CASILLA_SHAPES: Array<{ id: CasillaShape; label: string }> = [
  { id: 'square', label: 'Cuadrado' },
  { id: 'circle', label: 'Círculo' },
  { id: 'triangle', label: 'Triángulo' },
  { id: 'diamond', label: 'Diamante' },
  { id: 'long', label: 'Larga' },
];

const CAMERA_FX_LABELS: Record<CameraFxKind, string> = {
  shake: 'Shake',
  border_lights: 'Border Lights',
  zoom: 'Zoom',
  chromatic: 'Chromatic',
  glitch: 'Glitch',
  invert_colors: 'Invert Colors',
  flash: 'Flash',
  rotation: 'Rotation',
  blur: 'Blur',
  focus: 'Focus',
  distortion: 'Distortion',
  vignette: 'Vignette',
  motion_blur: 'Motion Blur',
  color_grading: 'Color Grading',
};

const PULSE_KIND_LABELS: Record<PulseKind, string> = {
  borders_4: '4 Bordes',
  border_top: 'Borde Superior',
  border_bottom: 'Borde Inferior',
  borders_side: 'Bordes Laterales',
  full_flash: 'Flash Completo',
  radial_pulse: 'Pulso Radial',
  color_pulse: 'Pulso de Color',
  progressive_glow: 'Glow Progresivo',
};

export const CreatorRgbDrawer: React.FC<CreatorRgbDrawerProps> = ({
  open,
  selectedObjects,
  laneCount,
  bpm,
  songPaletteColors,
  onClose,
  onUpdateCasillaMaterial,
  onMutateSelectedObjects,
  onDeleteSelected,
}) => {
  if (!open) return null;

  const first = selectedObjects[0];
  const allCasillas = selectedObjects.length > 0 && selectedObjects.every(isCasillaObject);
  const singleTrigger =
    selectedObjects.length === 1 && !isCasillaObject(first) ? first : null;

  const swatches = Array.from(new Set([...songPaletteColors, ...QUICK_COLORS])).slice(0, 9);
  const beatDur = 60 / Math.max(40, bpm);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 flex items-end sm:items-center sm:justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:w-96 max-h-[82vh] sm:h-full sm:max-h-full flex flex-col rounded-t-2xl sm:rounded-none sm:rounded-l-2xl bg-[#070b1e] border-t sm:border-t-0 sm:border-l border-cyan-400/35 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Palette className="w-4 h-4 text-cyan-300 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display font-bold text-sm text-white truncate">
                {selectedObjects.length === 0
                  ? 'RGB e Inspector'
                  : selectedObjects.length > 1
                    ? `Edición Lote (${selectedObjects.length} elem.)`
                    : isCasillaObject(first)
                      ? `RGB Casilla · ${first.noteData?.casillaShape ?? 'square'}`
                      : first.trigger?.type === 'camera_fx'
                        ? `Camera FX · ${CAMERA_FX_LABELS[first.trigger.params.fxKind]}`
                        : first.trigger?.type === 'screen_pulse'
                          ? `Pulse · ${PULSE_KIND_LABELS[first.trigger.params.pulseKind]}`
                          : first.trigger?.type === 'background'
                            ? 'Trigger Background'
                            : `Objeto Legacy (${first.type})`}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {selectedObjects.length > 0 && (
              <button
                type="button"
                onClick={onDeleteSelected}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-rose-500/15 text-rose-300 hover:text-white cursor-pointer"
                aria-label="Eliminar seleccionado"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 text-slate-200 cursor-pointer"
              aria-label="Cerrar panel RGB"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {selectedObjects.length === 0 && (
            <div className="py-10 text-center space-y-2 text-slate-400">
              <p className="text-sm font-semibold text-slate-200">Nada seleccionado</p>
              <p>Toca una casilla o una línea verde de trigger en la cuadrícula para editar su color RGB o parámetros.</p>
            </div>
          )}

          {/* CASILLAS RGB & SHAPE EDITOR (Single or Batch) */}
          {allCasillas && first && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Color Principal</span>
                  <span className="font-mono text-[11px] text-cyan-300 uppercase">
                    {first.material.color}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="color"
                    value={first.material.color}
                    onChange={(e) => onUpdateCasillaMaterial({ color: e.target.value })}
                    className="w-11 h-11 rounded-xl bg-transparent border border-white/20 cursor-pointer"
                  />
                  {swatches.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => onUpdateCasillaMaterial({ color: hex })}
                      className={`w-9 h-9 rounded-lg border cursor-pointer ${
                        first.material.color.toLowerCase() === hex.toLowerCase()
                          ? 'border-white scale-105'
                          : 'border-white/20'
                      }`}
                      style={{ backgroundColor: hex }}
                      aria-label={`Color ${hex}`}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="font-bold text-slate-200 block">Combo de Color</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      { id: 'solid', label: 'Sólido' },
                      { id: 'gradient', label: 'Gradiente' },
                      { id: 'alternating', label: 'Alternado' },
                      { id: 'split', label: 'Split' },
                    ] as Array<{ id: ColorComboMode; label: string }>
                  ).map((mode) => {
                    const active = (first.material.colorComboMode ?? 'solid') === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => onUpdateCasillaMaterial({ colorComboMode: mode.id })}
                        className={`min-h-[40px] rounded-xl border text-[11px] font-bold cursor-pointer ${
                          active
                            ? 'bg-cyan-500/25 border-cyan-400 text-white'
                            : 'bg-[#0b122b] border-white/10 text-slate-300'
                        }`}
                      >
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {(first.material.colorComboMode ?? 'solid') !== 'solid' && (
                <div className="space-y-1.5">
                  <span className="font-bold text-slate-200 block">Color Secundario</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="color"
                      value={first.material.secondaryColor ?? '#ec4899'}
                      onChange={(e) => onUpdateCasillaMaterial({ secondaryColor: e.target.value })}
                      className="w-11 h-11 rounded-xl bg-transparent border border-white/20 cursor-pointer"
                    />
                    {swatches.slice(0, 6).map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => onUpdateCasillaMaterial({ secondaryColor: hex })}
                        className="w-9 h-9 rounded-lg border border-white/20 cursor-pointer"
                        style={{ backgroundColor: hex }}
                        aria-label={`Secundario ${hex}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-300">Blending</span>
                  <select
                    value={first.material.blendMode}
                    onChange={(e) =>
                      onUpdateCasillaMaterial({ blendMode: e.target.value as BlendModeType })
                    }
                    className="w-full min-h-[44px] bg-[#0b122b] border border-white/15 rounded-xl px-2.5 text-white"
                  >
                    <option value="normal">Normal</option>
                    <option value="additive">Additive</option>
                    <option value="screen">Screen</option>
                    <option value="multiply">Multiply</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-300">Efecto al Pulsar</span>
                  <select
                    value={first.material.hitExplosion ?? 'sparks'}
                    onChange={(e) =>
                      onUpdateCasillaMaterial({
                        hitExplosion: e.target.value as HitExplosionStyle,
                      })
                    }
                    className="w-full min-h-[44px] bg-[#0b122b] border border-white/15 rounded-xl px-2.5 text-white"
                  >
                    {HIT_EXPLOSION_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Shape switch */}
              <div className="space-y-1.5">
                <span className="font-bold text-slate-200 block">Forma de Casilla</span>
                <div className="grid grid-cols-5 gap-1">
                  {CASILLA_SHAPES.map((s) => {
                    const active = (first.noteData?.casillaShape ?? 'square') === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() =>
                          onMutateSelectedObjects((obj) => ({
                            ...obj,
                            type: s.id === 'long' ? 'note_hold' : obj.type === 'note_hold' ? 'note_tap' : obj.type,
                            material: {
                              ...obj.material,
                              shape: casillaShapeToConcreteShape(s.id),
                            },
                            noteData: obj.noteData
                              ? {
                                  ...obj.noteData,
                                  casillaShape: s.id,
                                  kind:
                                    s.id === 'long'
                                      ? obj.noteData.kind === 'slide'
                                        ? 'slide'
                                        : 'hold'
                                      : obj.noteData.kind === 'hold'
                                        ? 'tap'
                                        : obj.noteData.kind,
                                  durationSec:
                                    s.id === 'long'
                                      ? Math.max(0.25, obj.noteData.durationSec || beatDur)
                                      : obj.noteData.kind === 'slide'
                                        ? obj.noteData.durationSec
                                        : 0,
                                }
                              : undefined,
                          }))
                        }
                        className={`min-h-[40px] rounded-lg border text-[10px] font-bold cursor-pointer ${
                          active
                            ? 'bg-cyan-500/25 border-cyan-400 text-white'
                            : 'bg-[#0b122b] border-white/10 text-slate-300'
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Long duration / Flick / Slide extras when single casilla */}
              {selectedObjects.length === 1 &&
                (first.noteData?.kind === 'hold' || first.noteData?.kind === 'slide') && (
                  <div className="rounded-xl bg-[#0b122b] border border-white/10 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200">Duración Casilla Larga</span>
                      <span className="font-mono text-cyan-300 tabular-nums">
                        {(first.noteData.durationSec ?? beatDur).toFixed(2)}s
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[-0.25, -0.1, 0.1, 0.25].map((delta) => (
                        <button
                          key={delta}
                          type="button"
                          onClick={() =>
                            onMutateSelectedObjects((obj) => ({
                              ...obj,
                              noteData: obj.noteData
                                ? {
                                    ...obj.noteData,
                                    durationSec: Math.max(
                                      0.15,
                                      Math.min(10, Number(((obj.noteData.durationSec ?? beatDur) + delta).toFixed(3))),
                                    ),
                                  }
                                : undefined,
                            }))
                          }
                          className="min-h-[40px] rounded-lg bg-black/40 border border-white/15 font-bold text-white cursor-pointer tabular-nums"
                        >
                          {delta > 0 ? `+${delta}s` : `${delta}s`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              {selectedObjects.length === 1 && first.noteData?.kind === 'flick' && (
                <div className="space-y-1.5">
                  <span className="font-bold text-slate-200 block">Dirección Flick</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['left', 'up', 'right'] as FlickDirection[]).map((dir) => (
                      <button
                        key={dir}
                        type="button"
                        onClick={() =>
                          onMutateSelectedObjects((obj) => ({
                            ...obj,
                            noteData: obj.noteData ? { ...obj.noteData, flickDirection: dir } : undefined,
                          }))
                        }
                        className={`min-h-[42px] rounded-xl border font-bold uppercase cursor-pointer ${
                          (first.noteData?.flickDirection ?? 'up') === dir
                            ? 'bg-amber-500/25 border-amber-400 text-amber-100'
                            : 'bg-[#0b122b] border-white/10 text-slate-300'
                        }`}
                      >
                        {dir}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedObjects.length === 1 && first.noteData?.kind === 'slide' && (
                <label className="block space-y-1">
                  <span className="font-bold text-slate-200">Carril destino Slide</span>
                  <select
                    value={first.noteData.slideTargetLane ?? Math.min(laneCount - 1, first.lane + 1)}
                    onChange={(e) => {
                      const nextLane = Number(e.target.value);
                      onMutateSelectedObjects((obj) => ({
                        ...obj,
                        noteData: obj.noteData ? { ...obj.noteData, slideTargetLane: nextLane } : undefined,
                      }));
                    }}
                    className="w-full min-h-[44px] bg-[#0b122b] border border-white/15 rounded-xl px-3 text-white tabular-nums"
                  >
                    {Array.from({ length: laneCount }, (_, idx) => (
                      <option key={idx} value={idx}>
                        Carril {idx + 1}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <button
                type="button"
                onClick={() =>
                  onUpdateCasillaMaterial({
                    color: '#22d3ee',
                    secondaryColor: '#ec4899',
                    colorComboMode: 'solid',
                    blendMode: 'normal',
                    hitExplosion: 'sparks',
                  })
                }
                className="w-full min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl bg-white/5 border border-white/15 text-slate-300 font-semibold cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restaurar Default</span>
              </button>
            </>
          )}

          {/* CAMERA FX TRIGGER INSPECTOR */}
          {singleTrigger?.trigger?.type === 'camera_fx' && (
            <CameraFxEditor
              params={singleTrigger.trigger.params}
              onChange={(patch) =>
                onMutateSelectedObjects((obj) => ({
                  ...obj,
                  material: patch.color ? { ...obj.material, color: patch.color } : obj.material,
                  trigger:
                    obj.trigger?.type === 'camera_fx'
                      ? {
                          type: 'camera_fx',
                          params: {
                            ...obj.trigger.params,
                            ...patch,
                          },
                        }
                      : obj.trigger,
                }))
              }
            />
          )}

          {/* SCREEN PULSE TRIGGER INSPECTOR */}
          {singleTrigger?.trigger?.type === 'screen_pulse' && (
            <ScreenPulseEditor
              params={singleTrigger.trigger.params}
              onChange={(patch) =>
                onMutateSelectedObjects((obj) => ({
                  ...obj,
                  material: patch.color ? { ...obj.material, color: patch.color } : obj.material,
                  trigger:
                    obj.trigger?.type === 'screen_pulse'
                      ? {
                          type: 'screen_pulse',
                          params: {
                            ...obj.trigger.params,
                            ...patch,
                          },
                        }
                      : obj.trigger,
                }))
              }
            />
          )}

          {/* BACKGROUND TRIGGER INSPECTOR */}
          {singleTrigger?.trigger?.type === 'background' && (
            <BackgroundTriggerEditor
              params={singleTrigger.trigger.params}
              onChange={(patch) =>
                onMutateSelectedObjects((obj) => ({
                  ...obj,
                  material: patch.primaryColor
                    ? { ...obj.material, color: patch.primaryColor }
                    : obj.material,
                  trigger:
                    obj.trigger?.type === 'background'
                      ? {
                          type: 'background',
                          params: {
                            ...obj.trigger.params,
                            ...patch,
                          },
                        }
                      : obj.trigger,
                }))
              }
            />
          )}

          {/* MIXED SELECTION OR LEGACY OBJECT FALLBACK */}
          {!allCasillas &&
            !(singleTrigger?.trigger?.type === 'camera_fx') &&
            !(singleTrigger?.trigger?.type === 'screen_pulse') &&
            !(singleTrigger?.trigger?.type === 'background') &&
            selectedObjects.length > 0 && (
              <div className="space-y-3 rounded-xl bg-[#0b122b] border border-white/10 p-3">
                <div className="font-bold text-amber-200">
                  {selectedObjects.length > 1
                    ? 'Selección mixta (Casillas + Triggers)'
                    : `Elemento ${first.type}`}
                </div>
                <p className="text-slate-300 leading-relaxed">
                  {selectedObjects.length > 1
                    ? 'Selecciona solo casillas para editar su RGB en lote, o un trigger individual para ajustar sus parámetros.'
                    : 'Este elemento legacy o trigger avanzado conserva compatibilidad de lectura y reproducción en v3.'}
                </p>
                {selectedObjects.length === 1 && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-[11px] text-slate-400">Tiempo (s)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.05}
                        value={Number(first.timeSec.toFixed(3))}
                        onChange={(e) => {
                          const nextT = Math.max(0, Number(e.target.value) || 0);
                          onMutateSelectedObjects((obj) => ({ ...obj, timeSec: nextT }));
                        }}
                        className="w-full min-h-[40px] bg-black/40 border border-white/15 rounded-lg px-2 text-white tabular-nums"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] text-slate-400">Color</span>
                      <input
                        type="color"
                        value={first.material.color}
                        onChange={(e) =>
                          onMutateSelectedObjects((obj) => ({
                            ...obj,
                            material: { ...obj.material, color: e.target.value },
                          }))
                        }
                        className="w-full h-[40px] rounded-lg bg-transparent border border-white/15 cursor-pointer"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

const CameraFxEditor: React.FC<{
  params: CameraFxTriggerParams;
  onChange: (patch: Partial<CameraFxTriggerParams>) => void;
}> = ({ params, onChange }) => {
  const showColor =
    params.fxKind === 'border_lights' ||
    params.fxKind === 'flash' ||
    params.fxKind === 'color_grading';
  const showZoomFov = params.fxKind === 'zoom' || params.fxKind === 'focus';
  const showRotDeg = params.fxKind === 'rotation';
  const showFreq =
    params.fxKind === 'shake' || params.fxKind === 'glitch' || params.fxKind === 'distortion';

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-[11px] font-semibold text-slate-300">Tipo de Camera FX</span>
        <select
          value={params.fxKind}
          onChange={(e) => onChange({ fxKind: e.target.value as CameraFxKind })}
          className="w-full min-h-[44px] bg-[#0b122b] border border-white/15 rounded-xl px-3 text-white"
        >
          {(Object.keys(CAMERA_FX_LABELS) as CameraFxKind[]).map((k) => (
            <option key={k} value={k}>
              {CAMERA_FX_LABELS[k]}
            </option>
          ))}
        </select>
      </label>

      <SliderRow
        label="Intensidad"
        value={params.intensity}
        min={0.1}
        max={1.6}
        step={0.05}
        onChange={(v) => onChange({ intensity: v })}
      />

      <div className="grid grid-cols-3 gap-2">
        <NumberField
          label="Duración (s)"
          value={params.duration}
          min={0.05}
          max={16}
          step={0.05}
          onChange={(v) => onChange({ duration: v })}
        />
        <NumberField
          label="Fade In (s)"
          value={params.fadeIn}
          min={0}
          max={4}
          step={0.05}
          onChange={(v) => onChange({ fadeIn: v })}
        />
        <NumberField
          label="Fade Out (s)"
          value={params.fadeOut}
          min={0}
          max={4}
          step={0.05}
          onChange={(v) => onChange({ fadeOut: v })}
        />
      </div>

      {showColor && (
        <label className="flex items-center justify-between gap-2 min-h-[44px] px-3 rounded-xl bg-[#0b122b] border border-white/10">
          <span className="text-slate-200 font-semibold">Color del efecto</span>
          <input
            type="color"
            value={params.color ?? '#22d3ee'}
            onChange={(e) => onChange({ color: e.target.value })}
            className="w-10 h-9 rounded-lg bg-transparent border border-white/20 cursor-pointer"
          />
        </label>
      )}

      {showZoomFov && (
        <SliderRow
          label="Zoom FOV Delta"
          value={params.zoomFovDelta ?? -10}
          min={-24}
          max={24}
          step={1}
          suffix="°"
          onChange={(v) => onChange({ zoomFovDelta: v })}
        />
      )}

      {showRotDeg && (
        <SliderRow
          label="Ángulo Rotación"
          value={params.rotationDeg ?? 8}
          min={-30}
          max={30}
          step={1}
          suffix="°"
          onChange={(v) => onChange({ rotationDeg: v })}
        />
      )}

      {showFreq && (
        <SliderRow
          label="Frecuencia"
          value={params.frequency ?? 12}
          min={1}
          max={40}
          step={1}
          suffix=" Hz"
          onChange={(v) => onChange({ frequency: v })}
        />
      )}

      <label className="block space-y-1">
        <span className="text-[11px] font-semibold text-slate-300">Easing</span>
        <select
          value={params.easing}
          onChange={(e) => onChange({ easing: e.target.value as EasingType })}
          className="w-full min-h-[44px] bg-[#0b122b] border border-white/15 rounded-xl px-3 text-white"
        >
          <option value="easeInOut">Ease In-Out</option>
          <option value="easeOut">Ease Out</option>
          <option value="easeIn">Ease In</option>
          <option value="linear">Linear</option>
          <option value="elastic">Elastic</option>
        </select>
      </label>

      <label className="flex items-center gap-2.5 min-h-[44px] px-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
        <input
          type="checkbox"
          checked={params.syncWithBpm}
          onChange={(e) => onChange({ syncWithBpm: e.target.checked })}
          className="w-4 h-4 accent-cyan-400"
        />
        <span className="text-slate-200 font-semibold">Sincronizar con BPM</span>
      </label>
    </div>
  );
};

const ScreenPulseEditor: React.FC<{
  params: ScreenPulseTriggerParams;
  onChange: (patch: Partial<ScreenPulseTriggerParams>) => void;
}> = ({ params, onChange }) => {
  const showEdges =
    params.pulseKind === 'borders_4' ||
    params.pulseKind === 'border_top' ||
    params.pulseKind === 'border_bottom' ||
    params.pulseKind === 'borders_side';

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-[11px] font-semibold text-slate-300">Modo Pulse</span>
        <select
          value={params.pulseKind}
          onChange={(e) => onChange({ pulseKind: e.target.value as PulseKind })}
          className="w-full min-h-[44px] bg-[#0b122b] border border-white/15 rounded-xl px-3 text-white"
        >
          {(Object.keys(PULSE_KIND_LABELS) as PulseKind[]).map((k) => (
            <option key={k} value={k}>
              {PULSE_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex items-center justify-between gap-2 min-h-[44px] px-3 rounded-xl bg-[#0b122b] border border-white/10">
          <span className="text-slate-200">Color 1</span>
          <input
            type="color"
            value={params.color}
            onChange={(e) => onChange({ color: e.target.value })}
            className="w-9 h-9 rounded bg-transparent border border-white/20 cursor-pointer"
          />
        </label>
        <label className="flex items-center justify-between gap-2 min-h-[44px] px-3 rounded-xl bg-[#0b122b] border border-white/10">
          <span className="text-slate-200">Color 2</span>
          <input
            type="color"
            value={params.secondaryColor ?? params.color}
            onChange={(e) => onChange({ secondaryColor: e.target.value })}
            className="w-9 h-9 rounded bg-transparent border border-white/20 cursor-pointer"
          />
        </label>
      </div>

      {showEdges && (
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-300 block">Bordes activos</span>
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                { key: 'top', label: 'Sup.' },
                { key: 'bottom', label: 'Inf.' },
                { key: 'left', label: 'Izq.' },
                { key: 'right', label: 'Der.' },
              ] as const
            ).map((edge) => {
              const active = params.edgeMask[edge.key];
              return (
                <button
                  key={edge.key}
                  type="button"
                  onClick={() =>
                    onChange({
                      edgeMask: { ...params.edgeMask, [edge.key]: !active },
                    })
                  }
                  className={`min-h-[40px] rounded-xl border font-bold cursor-pointer ${
                    active
                      ? 'bg-cyan-500/25 border-cyan-400 text-white'
                      : 'bg-[#0b122b] border-white/10 text-slate-400'
                  }`}
                >
                  {edge.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <SliderRow
        label="Intensidad"
        value={params.intensity}
        min={0.1}
        max={1.5}
        step={0.05}
        onChange={(v) => onChange({ intensity: v })}
      />

      <div className="grid grid-cols-3 gap-2">
        <NumberField
          label="Duración (s)"
          value={params.duration}
          min={0.05}
          max={16}
          step={0.05}
          onChange={(v) => onChange({ duration: v })}
        />
        <NumberField
          label="Fade In (s)"
          value={params.fadeIn}
          min={0}
          max={4}
          step={0.05}
          onChange={(v) => onChange({ fadeIn: v })}
        />
        <NumberField
          label="Fade Out (s)"
          value={params.fadeOut}
          min={0}
          max={4}
          step={0.05}
          onChange={(v) => onChange({ fadeOut: v })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-300">Audio Reactive Band</span>
          <select
            value={params.audioReactiveBand}
            onChange={(e) => onChange({ audioReactiveBand: e.target.value as AudioReactiveBand })}
            className="w-full min-h-[44px] bg-[#0b122b] border border-white/15 rounded-xl px-2.5 text-white"
          >
            <option value="none">Manual / Fijo</option>
            <option value="low">Graves / Kick</option>
            <option value="mid">Medios / Snare</option>
            <option value="high">Agudos / Hi-Hat</option>
            <option value="energy">Energía Global</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-300">Blending</span>
          <select
            value={params.blendMode}
            onChange={(e) => onChange({ blendMode: e.target.value as BlendModeType })}
            className="w-full min-h-[44px] bg-[#0b122b] border border-white/15 rounded-xl px-2.5 text-white"
          >
            <option value="additive">Additive</option>
            <option value="screen">Screen</option>
            <option value="normal">Normal</option>
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2.5 min-h-[44px] px-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
        <input
          type="checkbox"
          checked={params.syncWithBpm}
          onChange={(e) => onChange({ syncWithBpm: e.target.checked })}
          className="w-4 h-4 accent-cyan-400"
        />
        <span className="text-slate-200 font-semibold">Sincronizar pulso con BPM</span>
      </label>
    </div>
  );
};

const BackgroundTriggerEditor: React.FC<{
  params: BackgroundTriggerParams;
  onChange: (patch: Partial<BackgroundTriggerParams>) => void;
}> = ({ params, onChange }) => (
  <div className="space-y-3">
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold text-slate-300">Escenario 3D Destino</span>
      <select
        value={params.theme ?? ''}
        onChange={(e) =>
          onChange({ theme: (e.target.value || undefined) as EnvironmentTheme | undefined })
        }
        className="w-full min-h-[44px] bg-[#0b122b] border border-white/15 rounded-xl px-3 text-white"
      >
        <option value="">Mantener escenario actual</option>
        {ALL_ENVIRONMENT_THEMES.map((t) => (
          <option key={t} value={t}>
            {ENVIRONMENT_DEFINITIONS[t].displayName}
          </option>
        ))}
      </select>
    </label>

    <div className="grid grid-cols-2 gap-2.5">
      <label className="flex items-center justify-between gap-2 min-h-[44px] px-3 rounded-xl bg-[#0b122b] border border-white/10">
        <span className="text-slate-200">Color 1</span>
        <input
          type="color"
          value={params.primaryColor ?? '#22d3ee'}
          onChange={(e) => onChange({ primaryColor: e.target.value })}
          className="w-9 h-9 rounded bg-transparent border border-white/20 cursor-pointer"
        />
      </label>
      <label className="flex items-center justify-between gap-2 min-h-[44px] px-3 rounded-xl bg-[#0b122b] border border-white/10">
        <span className="text-slate-200">Color 2</span>
        <input
          type="color"
          value={params.secondaryColor ?? '#ec4899'}
          onChange={(e) => onChange({ secondaryColor: e.target.value })}
          className="w-9 h-9 rounded bg-transparent border border-white/20 cursor-pointer"
        />
      </label>
    </div>

    <SliderRow
      label="Brillo"
      value={params.brightness}
      min={0.4}
      max={1.6}
      step={0.05}
      onChange={(v) => onChange({ brightness: v })}
    />
    <SliderRow
      label="Parallax Speed"
      value={params.parallaxSpeed}
      min={0}
      max={2.5}
      step={0.1}
      onChange={(v) => onChange({ parallaxSpeed: v })}
    />
    <SliderRow
      label="Partículas Fondo"
      value={params.particleDensity}
      min={0}
      max={2.5}
      step={0.1}
      onChange={(v) => onChange({ particleDensity: v })}
    />
    <NumberField
      label="Duración Transición (s)"
      value={params.transitionDuration}
      min={0.05}
      max={6}
      step={0.1}
      onChange={(v) => onChange({ transitionDuration: v })}
    />
  </div>
);

const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (val: number) => void;
}> = ({ label, value, min, max, step, suffix = '', onChange }) => (
  <label className="block space-y-1">
    <div className="flex items-center justify-between text-[11px]">
      <span className="font-semibold text-slate-300">{label}</span>
      <span className="font-mono text-cyan-300 tabular-nums">
        {Number(value.toFixed(2))}
        {suffix}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-7 accent-cyan-400"
    />
  </label>
);

const NumberField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
}> = ({ label, value, min, max, step, onChange }) => (
  <label className="block space-y-1">
    <span className="text-[11px] font-semibold text-slate-300">{label}</span>
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={Number(value.toFixed(2))}
      onChange={(e) => {
        const parsed = Number(e.target.value);
        if (Number.isFinite(parsed)) {
          onChange(Math.max(min, Math.min(max, parsed)));
        }
      }}
      className="w-full min-h-[42px] bg-black/40 border border-white/15 rounded-xl px-2.5 text-white tabular-nums"
    />
  </label>
);
