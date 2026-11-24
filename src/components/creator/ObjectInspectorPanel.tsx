import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  Layers,
  Lock,
  Plus,
  Sliders,
  Sparkles,
  Unlock,
  Users,
  Zap,
} from 'lucide-react';
import type {
  BeatflowLevelDocument,
  BlendModeType,
  CreatorGroup,
  CreatorObject,
  CustomGameplayMode,
  EasingType,
  LogicOpKind,
  ScreenEffectKind,
  TriggerConfigPayload,
  TriggerType,
} from '../../types/creator';
import type { DifficultyLevel, EnvironmentTheme, FlickDirection, LaneCount } from '../../types/game';
import { ENVIRONMENT_DEFINITIONS } from '../../game/environments/environmentDefinitions';
import { createDefaultTriggerPayload } from '../../creator/ObjectLibrary';
import { secondsToBarBeat } from '../../creator/TimelineEditor';
import { GroupManager } from '../../creator/GroupManager';
import {
  updateSelectedMaterial,
  updateSelectedNoteData,
  updateSelectedTransform,
  updateSelectedTrigger,
} from '../../creator/ObjectInspector';

interface ObjectInspectorPanelProps {
  level: BeatflowLevelDocument;
  selectedIds: string[];
  onMutateObjects: (updater: (objs: CreatorObject[]) => CreatorObject[]) => void;
  onMutateLevel: (updater: (doc: BeatflowLevelDocument) => BeatflowLevelDocument) => void;
  onCreateGroup: (name?: string, assignSelected?: boolean) => void;
  onAssignGroup: (groupId: number) => void;
  onRemoveGroup: (groupId: number) => void;
  onMergeGroups: (srcId: number, dstId: number) => void;
  onToggleGroupProp: (groupId: number, prop: 'locked' | 'visible' | 'active') => void;
  onSelectGroup: (groupId: number) => void;
}

const TRIGGER_LABELS: Array<{ id: TriggerType; label: string }> = [
  { id: 'color', label: 'Color' },
  { id: 'alpha', label: 'Alpha' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'move', label: 'Move' },
  { id: 'rotate', label: 'Rotate' },
  { id: 'scale', label: 'Scale' },
  { id: 'toggle', label: 'Toggle' },
  { id: 'spawn', label: 'Spawn' },
  { id: 'camera', label: 'Camera' },
  { id: 'screen_fx', label: 'Screen FX' },
  { id: 'audio', label: 'Audio' },
  { id: 'logic', label: 'Logic' },
];

const EASING_OPTIONS: EasingType[] = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'cubic',
  'quintic',
  'bounce',
  'elastic',
  'back',
];

const SCREEN_FX_OPTIONS: ScreenEffectKind[] = [
  'bloom',
  'chromaticAberration',
  'vignette',
  'motionBlur',
  'distortion',
  'colorGrading',
  'exposure',
  'screenFlash',
  'screenShake',
  'blur',
  'pixelation',
];

const LOGIC_OP_OPTIONS: LogicOpKind[] = [
  'COUNTER',
  'COMPARE',
  'AND',
  'OR',
  'NOT',
  'RANDOM',
  'TIMER',
  'EVENT_RECEIVED',
  'TRIGGER_ONCE',
];

const GAMEPLAY_MODES: Array<{ id: CustomGameplayMode; label: string }> = [
  { id: 'classic_lanes', label: 'Carriles Clásicos' },
  { id: 'two_thumb', label: 'Dos Pulgares' },
  { id: 'touch_zones', label: 'Zonas Táctiles Libres' },
  { id: 'precision_timing', label: 'Precisión Estricta' },
  { id: 'timed_survival', label: 'Supervivencia por Tiempo' },
  { id: 'sequence_memory', label: 'Secuencia / Memoria' },
  { id: 'experimental', label: 'Experimental' },
];

export const ObjectInspectorPanel: React.FC<ObjectInspectorPanelProps> = ({
  level,
  selectedIds,
  onMutateObjects,
  onMutateLevel,
  onCreateGroup,
  onAssignGroup,
  onRemoveGroup,
  onMergeGroups,
  onToggleGroupProp,
  onSelectGroup,
}) => {
  const [tab, setTab] = useState<'object' | 'groups' | 'level'>('object');
  const [newGroupName, setNewGroupName] = useState('');
  const [mergeSource, setMergeSource] = useState<number>(2);
  const [mergeTarget, setMergeTarget] = useState<number>(1);

  const selectedSet = new Set(selectedIds);
  const selectedObjects = level.objects.filter((o) => selectedSet.has(o.id));
  const primary = selectedObjects[0] ?? null;

  const patchTrigger = (nextTrigger: TriggerConfigPayload) => {
    onMutateObjects((objs) => updateSelectedTrigger(objs, selectedSet, nextTrigger));
  };

  return (
    <div className="flex flex-col h-full bg-[#070b1e]/95 border-l border-cyan-400/20 text-slate-100 text-xs">
      {/* Sub-tabs */}
      <div className="grid grid-cols-3 border-b border-white/10 shrink-0">
        <button
          type="button"
          onClick={() => setTab('object')}
          className={`flex items-center justify-center gap-1 py-2.5 font-semibold transition-colors cursor-pointer ${
            tab === 'object'
              ? 'bg-cyan-500/20 text-cyan-200 border-b-2 border-cyan-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Objeto</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('groups')}
          className={`flex items-center justify-center gap-1 py-2.5 font-semibold transition-colors cursor-pointer ${
            tab === 'groups'
              ? 'bg-fuchsia-500/20 text-fuchsia-200 border-b-2 border-fuchsia-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Grupos</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('level')}
          className={`flex items-center justify-center gap-1 py-2.5 font-semibold transition-colors cursor-pointer ${
            tab === 'level'
              ? 'bg-indigo-500/20 text-indigo-200 border-b-2 border-indigo-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Nivel</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tab === 'object' && !primary && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center text-slate-400 space-y-1">
            <p className="font-semibold text-slate-200">Sin selección</p>
            <p className="text-[11px]">
              Haz clic en un objeto en la pista 3D o usa la herramienta Colocar para editar sus
              propiedades, grupos y triggers.
            </p>
          </div>
        )}

        {tab === 'object' && primary && (
          <>
            <div className="rounded-xl border border-cyan-400/25 bg-[#0b122b] p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={primary.name}
                  onChange={(e) =>
                    onMutateObjects((objs) =>
                      updateSelectedTransform(objs, selectedSet, { name: e.target.value }),
                    )
                  }
                  className="flex-1 min-w-0 bg-black/40 border border-white/15 rounded-lg px-2 py-1 text-white font-semibold"
                />
                {selectedObjects.length > 1 && (
                  <span className="text-[10px] font-mono-num text-cyan-300 shrink-0">
                    {selectedObjects.length} sel.
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>
                  Compás:{' '}
                  <strong className="font-mono-num text-cyan-300">
                    {secondsToBarBeat(primary.timeSec, level.audio.bpm, level.audio.offsetMs).formatted}
                  </strong>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onMutateObjects((objs) =>
                        updateSelectedTransform(objs, selectedSet, { locked: !primary.locked }),
                      )
                    }
                    className={`p-1 rounded border cursor-pointer ${
                      primary.locked
                        ? 'border-amber-400/50 bg-amber-500/20 text-amber-200'
                        : 'border-white/10 text-slate-300'
                    }`}
                    title="Bloquear objeto"
                  >
                    {primary.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onMutateObjects((objs) =>
                        updateSelectedTransform(objs, selectedSet, { hidden: !primary.hidden }),
                      )
                    }
                    className={`p-1 rounded border cursor-pointer ${
                      primary.hidden
                        ? 'border-rose-400/50 bg-rose-500/20 text-rose-200'
                        : 'border-white/10 text-slate-300'
                    }`}
                    title="Ocultar objeto"
                  >
                    {primary.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Time, Lane, Layer, EventId */}
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-0.5">
                  <span className="text-[10px] text-slate-400">Tiempo (s)</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={primary.timeSec}
                    onChange={(e) =>
                      onMutateObjects((objs) =>
                        updateSelectedTransform(objs, selectedSet, {
                          timeSec: Number(e.target.value) || 0,
                        }),
                      )
                    }
                    className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] text-slate-400">Carril (-1 libre)</span>
                  <input
                    type="number"
                    min="-1"
                    max={level.gameplayRules.laneCount - 1}
                    value={primary.lane}
                    onChange={(e) => {
                      const lane = Number(e.target.value);
                      const lc = level.gameplayRules.laneCount;
                      const x = lane >= 0 && lane < lc ? Number(((lane - (lc - 1) / 2) * 1.45).toFixed(2)) : primary.position.x;
                      onMutateObjects((objs) =>
                        updateSelectedTransform(objs, selectedSet, {
                          lane,
                          position: { x },
                        }),
                      );
                    }}
                    className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] text-slate-400">Capa (0-7)</span>
                  <input
                    type="number"
                    min="0"
                    max="7"
                    value={primary.layer}
                    onChange={(e) =>
                      onMutateObjects((objs) =>
                        updateSelectedTransform(objs, selectedSet, {
                          layer: Number(e.target.value) || 0,
                        }),
                      )
                    }
                    className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] text-slate-400">Event ID (Spawn)</span>
                  <input
                    type="text"
                    placeholder="ej. evt-1"
                    value={primary.eventId ?? ''}
                    onChange={(e) =>
                      onMutateObjects((objs) =>
                        updateSelectedTransform(objs, selectedSet, {
                          eventId: e.target.value,
                        }),
                      )
                    }
                    className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                  />
                </label>
              </div>
            </div>

            {/* Transform */}
            <div className="rounded-xl border border-white/10 bg-[#0b122b] p-2.5 space-y-2">
              <div className="font-bold text-[11px] uppercase tracking-wider text-cyan-300">
                Transformación 3D
              </div>
              {(['position', 'rotation', 'scale'] as const).map((field) => (
                <div key={field} className="space-y-1">
                  <div className="text-[10px] text-slate-400 capitalize">
                    {field === 'position' ? 'Posición' : field === 'rotation' ? 'Rotación (°)' : 'Escala'}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['x', 'y', 'z'] as const).map((axis) => (
                      <input
                        key={axis}
                        type="number"
                        step={field === 'rotation' ? 5 : 0.1}
                        value={primary[field][axis]}
                        onChange={(e) =>
                          onMutateObjects((objs) =>
                            updateSelectedTransform(objs, selectedSet, {
                              [field]: { [axis]: Number(e.target.value) || 0 },
                            }),
                          )
                        }
                        className="w-full bg-black/40 border border-white/15 rounded px-1.5 py-1 font-mono-num text-[11px]"
                        aria-label={`${field}-${axis}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Material & Chromatic */}
            <div className="rounded-xl border border-white/10 bg-[#0b122b] p-2.5 space-y-2">
              <div className="font-bold text-[11px] uppercase tracking-wider text-fuchsia-300">
                Color & Material
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primary.material.color}
                  onChange={(e) =>
                    onMutateObjects((objs) =>
                      updateSelectedMaterial(objs, selectedSet, { color: e.target.value }),
                    )
                  }
                  className="w-9 h-8 rounded bg-transparent border border-white/20 cursor-pointer"
                />
                <div className="flex-1 grid grid-cols-2 gap-1.5">
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-400">Opacidad</span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={primary.material.opacity}
                      onChange={(e) =>
                        onMutateObjects((objs) =>
                          updateSelectedMaterial(objs, selectedSet, {
                            opacity: Math.max(0, Math.min(1, Number(e.target.value))),
                          }),
                        )
                      }
                      className="w-full bg-black/40 border border-white/15 rounded px-1.5 py-1 font-mono-num"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-400">Emisión</span>
                    <input
                      type="number"
                      min="0"
                      max="2.5"
                      step="0.1"
                      value={primary.material.emission}
                      onChange={(e) =>
                        onMutateObjects((objs) =>
                          updateSelectedMaterial(objs, selectedSet, {
                            emission: Math.max(0, Math.min(2.5, Number(e.target.value))),
                          }),
                        )
                      }
                      className="w-full bg-black/40 border border-white/15 rounded px-1.5 py-1 font-mono-num"
                    />
                  </label>
                </div>
              </div>
              <label className="block space-y-0.5">
                <span className="text-[10px] text-slate-400">Modo de fusión (Blending)</span>
                <select
                  value={primary.material.blendMode}
                  onChange={(e) =>
                    onMutateObjects((objs) =>
                      updateSelectedMaterial(objs, selectedSet, {
                        blendMode: e.target.value as BlendModeType,
                      }),
                    )
                  }
                  className="w-full bg-black/50 border border-white/15 rounded px-2 py-1.5"
                >
                  <option value="normal">Normal</option>
                  <option value="additive">Aditivo (Glow)</option>
                  <option value="screen">Pantalla (Screen)</option>
                  <option value="multiply">Multiplicar</option>
                </select>
              </label>
            </div>

            {/* Note / Gameplay Props */}
            {primary.noteData && (
              <div className="rounded-xl border border-white/10 bg-[#0b122b] p-2.5 space-y-2">
                <div className="font-bold text-[11px] uppercase tracking-wider text-amber-300">
                  Propiedades Gameplay
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {primary.type === 'note_hold' || primary.type === 'note_slide' ? (
                    <label className="space-y-0.5">
                      <span className="text-[10px] text-slate-400">Duración Hold (s)</span>
                      <input
                        type="number"
                        min="0.1"
                        max="12"
                        step="0.1"
                        value={primary.noteData.durationSec}
                        onChange={(e) =>
                          onMutateObjects((objs) =>
                            updateSelectedNoteData(objs, selectedSet, {
                              durationSec: Math.max(0.1, Number(e.target.value)),
                            }),
                          )
                        }
                        className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                      />
                    </label>
                  ) : null}

                  {primary.type === 'note_flick' && (
                    <label className="space-y-0.5">
                      <span className="text-[10px] text-slate-400">Dirección Flick</span>
                      <select
                        value={primary.noteData.flickDirection ?? 'up'}
                        onChange={(e) =>
                          onMutateObjects((objs) =>
                            updateSelectedNoteData(objs, selectedSet, {
                              flickDirection: e.target.value as FlickDirection,
                            }),
                          )
                        }
                        className="w-full bg-black/50 border border-white/15 rounded px-2 py-1"
                      >
                        <option value="up">Arriba</option>
                        <option value="left">Izquierda</option>
                        <option value="right">Derecha</option>
                      </select>
                    </label>
                  )}

                  {primary.type === 'note_slide' && (
                    <label className="space-y-0.5">
                      <span className="text-[10px] text-slate-400">Carril Destino</span>
                      <input
                        type="number"
                        min="0"
                        max={level.gameplayRules.laneCount - 1}
                        value={primary.noteData.slideTargetLane ?? 1}
                        onChange={(e) =>
                          onMutateObjects((objs) =>
                            updateSelectedNoteData(objs, selectedSet, {
                              slideTargetLane: Number(e.target.value),
                            }),
                          )
                        }
                        className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                      />
                    </label>
                  )}

                  {primary.type === 'speed_portal' && (
                    <label className="space-y-0.5">
                      <span className="text-[10px] text-slate-400">Velocidad x</span>
                      <input
                        type="number"
                        min="0.5"
                        max="2.2"
                        step="0.05"
                        value={primary.noteData.speedMultiplier ?? 1.25}
                        onChange={(e) =>
                          onMutateObjects((objs) =>
                            updateSelectedNoteData(objs, selectedSet, {
                              speedMultiplier: Number(e.target.value),
                            }),
                          )
                        }
                        className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                      />
                    </label>
                  )}

                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-400">Puntos base</span>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={primary.noteData.points ?? 120}
                      onChange={(e) =>
                        onMutateObjects((objs) =>
                          updateSelectedNoteData(objs, selectedSet, {
                            points: Number(e.target.value) || 0,
                          }),
                        )
                      }
                      className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Quick Group Membership */}
            <div className="rounded-xl border border-white/10 bg-[#0b122b] p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[11px] uppercase tracking-wider text-emerald-300">
                  Grupos del Objeto
                </span>
                <button
                  type="button"
                  onClick={() => onCreateGroup(undefined, true)}
                  className="flex items-center gap-1 text-[10px] text-cyan-300 hover:text-white cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Nuevo
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {level.groups.map((grp) => {
                  const member = primary.groupIds.includes(grp.id);
                  return (
                    <button
                      key={grp.id}
                      type="button"
                      onClick={() =>
                        member ? onRemoveGroup(grp.id) : onAssignGroup(grp.id)
                      }
                      className={`px-2 py-1 rounded-md border text-[11px] font-semibold transition-colors cursor-pointer ${
                        member
                          ? 'bg-cyan-500/25 border-cyan-400 text-white'
                          : 'bg-black/30 border-white/15 text-slate-400 hover:text-white'
                      }`}
                    >
                      G{grp.id} · {grp.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Trigger Editor (All 12 Types) */}
            <div className="rounded-xl border border-amber-400/25 bg-[#0b122b] p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 font-bold text-[11px] uppercase tracking-wider text-amber-300">
                  <Zap className="w-3.5 h-3.5" />
                  Configuración de Trigger
                </span>
                {!primary.trigger && (
                  <button
                    type="button"
                    onClick={() => patchTrigger(createDefaultTriggerPayload('color', 1))}
                    className="px-2 py-0.5 rounded bg-amber-500/25 border border-amber-400/50 text-amber-200 text-[10px] cursor-pointer"
                  >
                    Añadir Trigger
                  </button>
                )}
              </div>

              {primary.trigger && (
                <div className="space-y-2">
                  <select
                    value={primary.trigger.type}
                    onChange={(e) =>
                      patchTrigger(
                        createDefaultTriggerPayload(
                          e.target.value as TriggerType,
                          primary.groupIds[0] ?? 1,
                        ),
                      )
                    }
                    className="w-full bg-black/50 border border-amber-400/35 rounded px-2 py-1.5 font-semibold text-amber-100"
                  >
                    {TRIGGER_LABELS.map((t) => (
                      <option key={t.id} value={t.id}>
                        Trigger: {t.label}
                      </option>
                    ))}
                  </select>

                  {'targetGroupId' in primary.trigger.params && (
                    <label className="block space-y-0.5">
                      <span className="text-[10px] text-slate-400">Grupo Objetivo (ID)</span>
                      <select
                        value={primary.trigger.params.targetGroupId}
                        onChange={(e) => {
                          const gid = Number(e.target.value);
                          const cur = primary.trigger!;
                          if ('targetGroupId' in cur.params) {
                            patchTrigger({
                              ...cur,
                              params: { ...cur.params, targetGroupId: gid },
                            } as TriggerConfigPayload);
                          }
                        }}
                        className="w-full bg-black/50 border border-white/15 rounded px-2 py-1"
                      >
                        {level.groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            G{g.id} — {g.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {primary.trigger.type === 'color' && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Color</span>
                        <input
                          type="color"
                          value={primary.trigger.params.color}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'color',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, color: e.target.value },
                            })
                          }
                          className="w-full h-7 rounded bg-black/40 border border-white/15"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Hold (s)</span>
                        <input
                          type="number"
                          step="0.1"
                          value={primary.trigger.params.holdDuration}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'color',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, holdDuration: Number(e.target.value) || 0.2 },
                            })
                          }
                          className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Fade In (s)</span>
                        <input
                          type="number"
                          step="0.05"
                          value={primary.trigger.params.fadeIn}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'color',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, fadeIn: Number(e.target.value) || 0 },
                            })
                          }
                          className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Emisión</span>
                        <input
                          type="number"
                          step="0.1"
                          value={primary.trigger.params.emission}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'color',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, emission: Number(e.target.value) || 1 },
                            })
                          }
                          className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                        />
                      </label>
                    </div>
                  )}

                  {primary.trigger.type === 'alpha' && (
                    <div className="grid grid-cols-3 gap-1.5">
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Inicio</span>
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          value={primary.trigger.params.startValue}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'alpha',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, startValue: Number(e.target.value) },
                            })
                          }
                          className="w-full bg-black/40 border border-white/15 rounded px-1.5 py-1 font-mono-num"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Fin</span>
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          value={primary.trigger.params.endValue}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'alpha',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, endValue: Number(e.target.value) },
                            })
                          }
                          className="w-full bg-black/40 border border-white/15 rounded px-1.5 py-1 font-mono-num"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Dur (s)</span>
                        <input
                          type="number"
                          step="0.1"
                          value={primary.trigger.params.fadeDuration}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'alpha',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, fadeDuration: Number(e.target.value) || 0.2 },
                            })
                          }
                          className="w-full bg-black/40 border border-white/15 rounded px-1.5 py-1 font-mono-num"
                        />
                      </label>
                    </div>
                  )}

                  {primary.trigger.type === 'pulse' && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Color Pulso</span>
                        <input
                          type="color"
                          value={primary.trigger.params.pulseColor}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'pulse',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, pulseColor: e.target.value },
                            })
                          }
                          className="w-full h-7 rounded bg-black/40 border border-white/15"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Intensidad</span>
                        <input
                          type="number"
                          step="0.1"
                          value={primary.trigger.params.intensity}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'pulse',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, intensity: Number(e.target.value) || 1 },
                            })
                          }
                          className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                        />
                      </label>
                    </div>
                  )}

                  {primary.trigger.type === 'move' && (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-3 gap-1">
                        {(['targetX', 'targetY', 'targetZ'] as const).map((k) => (
                          <label key={k} className="space-y-0.5">
                            <span className="text-[10px] text-slate-400">{k.replace('target', 'Δ ')}</span>
                            <input
                              type="number"
                              step="0.2"
                              value={primary.trigger!.type === 'move' ? primary.trigger.params[k] : 0}
                              onChange={(e) =>
                                patchTrigger({
                                  type: 'move',
                                  params: {
                                    ...(primary.trigger!.params as typeof primary.trigger.params),
                                    [k]: Number(e.target.value) || 0,
                                  },
                                })
                              }
                              className="w-full bg-black/40 border border-white/15 rounded px-1.5 py-1 font-mono-num"
                            />
                          </label>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="space-y-0.5">
                          <span className="text-[10px] text-slate-400">Duración (s)</span>
                          <input
                            type="number"
                            step="0.1"
                            value={primary.trigger.params.duration}
                            onChange={(e) =>
                              patchTrigger({
                                type: 'move',
                                params: { ...primary.trigger!.params as typeof primary.trigger.params, duration: Number(e.target.value) || 0.2 },
                              })
                            }
                            className="w-full bg-black/40 border border-white/15 rounded px-1.5 py-1 font-mono-num"
                          />
                        </label>
                        <label className="space-y-0.5">
                          <span className="text-[10px] text-slate-400">Easing</span>
                          <select
                            value={primary.trigger.params.easing}
                            onChange={(e) =>
                              patchTrigger({
                                type: 'move',
                                params: { ...primary.trigger!.params as typeof primary.trigger.params, easing: e.target.value as EasingType },
                              })
                            }
                            className="w-full bg-black/50 border border-white/15 rounded px-1.5 py-1"
                          >
                            {EASING_OPTIONS.map((ea) => (
                              <option key={ea} value={ea}>{ea}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  )}

                  {primary.trigger.type === 'rotate' && (
                    <div className="grid grid-cols-3 gap-1">
                      {(['rotX', 'rotY', 'rotZ'] as const).map((k) => (
                        <label key={k} className="space-y-0.5">
                          <span className="text-[10px] text-slate-400">{k}°</span>
                          <input
                            type="number"
                            step="15"
                            value={primary.trigger!.type === 'rotate' ? primary.trigger.params[k] : 0}
                            onChange={(e) =>
                              patchTrigger({
                                type: 'rotate',
                                params: {
                                  ...(primary.trigger!.params as typeof primary.trigger.params),
                                  [k]: Number(e.target.value) || 0,
                                },
                              })
                            }
                            className="w-full bg-black/40 border border-white/15 rounded px-1.5 py-1 font-mono-num"
                          />
                        </label>
                      ))}
                    </div>
                  )}

                  {primary.trigger.type === 'scale' && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Escala X/Y/Z</span>
                        <input
                          type="number"
                          step="0.1"
                          value={primary.trigger.params.scaleX}
                          onChange={(e) => {
                            const s = Number(e.target.value) || 1;
                            patchTrigger({
                              type: 'scale',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, scaleX: s, scaleY: s, scaleZ: s },
                            });
                          }}
                          className="w-full bg-black/40 border border-white/15 rounded px-1.5 py-1 font-mono-num"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Duración (s)</span>
                        <input
                          type="number"
                          step="0.1"
                          value={primary.trigger.params.duration}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'scale',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, duration: Number(e.target.value) || 0.2 },
                            })
                          }
                          className="w-full bg-black/40 border border-white/15 rounded px-1.5 py-1 font-mono-num"
                        />
                      </label>
                    </div>
                  )}

                  {primary.trigger.type === 'toggle' && (
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={primary.trigger.params.activate}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'toggle',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, activate: e.target.checked, renderingEnabled: e.target.checked, collisionEnabled: e.target.checked },
                            })
                          }
                        />
                        <span>Activar grupo</span>
                      </label>
                    </div>
                  )}

                  {primary.trigger.type === 'spawn' && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Event ID Destino</span>
                        <input
                          type="text"
                          value={primary.trigger.params.targetEventId}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'spawn',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, targetEventId: e.target.value },
                            })
                          }
                          className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Delay (s)</span>
                        <input
                          type="number"
                          step="0.05"
                          value={primary.trigger.params.delay}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'spawn',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, delay: Number(e.target.value) || 0 },
                            })
                          }
                          className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                        />
                      </label>
                    </div>
                  )}

                  {primary.trigger.type === 'camera' && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Acción</span>
                        <select
                          value={primary.trigger.params.action}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'camera',
                              params: {
                                ...(primary.trigger!.params as typeof primary.trigger.params),
                                action: e.target.value as 'zoom' | 'offset' | 'rotate' | 'follow' | 'shake' | 'target' | 'lock' | 'reset',
                              },
                            })
                          }
                          className="w-full bg-black/50 border border-white/15 rounded px-1.5 py-1"
                        >
                          <option value="zoom">Zoom</option>
                          <option value="offset">Offset XYZ</option>
                          <option value="rotate">Rotar / Tilt</option>
                          <option value="shake">Shake</option>
                          <option value="follow">Seguir Grupo</option>
                          <option value="lock">Bloquear</option>
                          <option value="reset">Reset</option>
                        </select>
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Zoom Δ / Shake</span>
                        <input
                          type="number"
                          step="1"
                          value={
                            primary.trigger.params.action === 'shake'
                              ? primary.trigger.params.shakeIntensity
                              : primary.trigger.params.zoomFovDelta
                          }
                          onChange={(e) => {
                            const v = Number(e.target.value) || 0;
                            const cur = primary.trigger!.params as typeof primary.trigger.params;
                            patchTrigger({
                              type: 'camera',
                              params:
                                cur.action === 'shake'
                                  ? { ...cur, shakeIntensity: v }
                                  : { ...cur, zoomFovDelta: v },
                            });
                          }}
                          className="w-full bg-black/40 border border-white/15 rounded px-1.5 py-1 font-mono-num"
                        />
                      </label>
                    </div>
                  )}

                  {primary.trigger.type === 'screen_fx' && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Efecto</span>
                        <select
                          value={primary.trigger.params.effect}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'screen_fx',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, effect: e.target.value as ScreenEffectKind },
                            })
                          }
                          className="w-full bg-black/50 border border-white/15 rounded px-1.5 py-1"
                        >
                          {SCREEN_FX_OPTIONS.map((fx) => (
                            <option key={fx} value={fx}>{fx}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Intensidad</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="1.5"
                          value={primary.trigger.params.intensity}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'screen_fx',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, intensity: Number(e.target.value) || 0.5 },
                            })
                          }
                          className="w-full bg-black/40 border border-white/15 rounded px-1.5 py-1 font-mono-num"
                        />
                      </label>
                    </div>
                  )}

                  {primary.trigger.type === 'audio' && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Evento Musical</span>
                        <select
                          value={primary.trigger.params.eventKind}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'audio',
                              params: {
                                ...(primary.trigger!.params as typeof primary.trigger.params),
                                eventKind: e.target.value as 'beat' | 'onset' | 'kick' | 'snare' | 'bass' | 'drop' | 'section' | 'time' | 'bpm',
                              },
                            })
                          }
                          className="w-full bg-black/50 border border-white/15 rounded px-1.5 py-1"
                        >
                          <option value="kick">Kick</option>
                          <option value="snare">Snare</option>
                          <option value="bass">Bajo</option>
                          <option value="beat">Beat</option>
                          <option value="onset">Onset</option>
                          <option value="drop">Drop</option>
                          <option value="section">Sección</option>
                        </select>
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Umbral (0-1)</span>
                        <input
                          type="number"
                          step="0.05"
                          min="0.05"
                          max="1"
                          value={primary.trigger.params.threshold}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'audio',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, threshold: Number(e.target.value) || 0.45 },
                            })
                          }
                          className="w-full bg-black/40 border border-white/15 rounded px-1.5 py-1 font-mono-num"
                        />
                      </label>
                    </div>
                  )}

                  {primary.trigger.type === 'logic' && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Operación Segura</span>
                        <select
                          value={primary.trigger.params.op}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'logic',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, op: e.target.value as LogicOpKind },
                            })
                          }
                          className="w-full bg-black/50 border border-white/15 rounded px-1.5 py-1"
                        >
                          {LOGIC_OP_OPTIONS.map((op) => (
                            <option key={op} value={op}>{op}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Variable</span>
                        <input
                          type="text"
                          value={primary.trigger.params.variableA}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'logic',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, variableA: e.target.value },
                            })
                          }
                          className="w-full bg-black/40 border border-white/15 rounded px-1.5 py-1 font-mono-num"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Valor Objetivo</span>
                        <input
                          type="number"
                          value={primary.trigger.params.compareValue}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'logic',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, compareValue: Number(e.target.value) || 0 },
                            })
                          }
                          className="w-full bg-black/40 border border-white/15 rounded px-1.5 py-1 font-mono-num"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-slate-400">Event Si True</span>
                        <input
                          type="text"
                          value={primary.trigger.params.outputTrueEventId}
                          onChange={(e) =>
                            patchTrigger({
                              type: 'logic',
                              params: { ...primary.trigger!.params as typeof primary.trigger.params, outputTrueEventId: e.target.value },
                            })
                          }
                          className="w-full bg-black/40 border border-white/15 rounded px-1.5 py-1 font-mono-num"
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* GROUPS TAB */}
        {tab === 'groups' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-fuchsia-400/25 bg-[#0b122b] p-2.5 space-y-2">
              <div className="font-bold text-[11px] uppercase tracking-wider text-fuchsia-300">
                Crear Nuevo Grupo
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Nombre del grupo..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="flex-1 min-w-0 bg-black/40 border border-white/15 rounded px-2 py-1"
                />
                <button
                  type="button"
                  onClick={() => {
                    onCreateGroup(newGroupName || undefined, selectedIds.length > 0);
                    setNewGroupName('');
                  }}
                  className="px-2.5 py-1 rounded bg-fuchsia-600/80 hover:bg-fuchsia-500 text-white font-semibold cursor-pointer"
                >
                  Crear
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              {level.groups.map((grp: CreatorGroup) => {
                const count = GroupManager.getObjectIdsInGroup(level.objects, grp.id).length;
                return (
                  <div
                    key={grp.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#0b122b] px-2.5 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectGroup(grp.id)}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                      title="Seleccionar objetos del grupo"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: grp.color }}
                      />
                      <span className="font-bold text-cyan-300 font-mono-num">G{grp.id}</span>
                      <span className="truncate font-medium">{grp.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono-num">({count})</span>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleGroupProp(grp.id, 'visible')}
                        className={`p-1 rounded border cursor-pointer ${
                          grp.visible ? 'border-white/15 text-slate-200' : 'border-rose-400/40 text-rose-300'
                        }`}
                        title="Mostrar / ocultar grupo"
                      >
                        {grp.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleGroupProp(grp.id, 'locked')}
                        className={`p-1 rounded border cursor-pointer ${
                          grp.locked ? 'border-amber-400/50 text-amber-300' : 'border-white/15 text-slate-200'
                        }`}
                        title="Bloquear grupo"
                      >
                        {grp.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {level.groups.length > 1 && (
              <div className="rounded-xl border border-white/10 bg-[#0b122b] p-2.5 space-y-2">
                <div className="font-bold text-[11px] uppercase tracking-wider text-slate-300">
                  Combinar Grupos
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={mergeSource}
                    onChange={(e) => setMergeSource(Number(e.target.value))}
                    className="bg-black/50 border border-white/15 rounded px-1.5 py-1"
                  >
                    {level.groups.map((g) => (
                      <option key={g.id} value={g.id}>Origen G{g.id}</option>
                    ))}
                  </select>
                  <select
                    value={mergeTarget}
                    onChange={(e) => setMergeTarget(Number(e.target.value))}
                    className="bg-black/50 border border-white/15 rounded px-1.5 py-1"
                  >
                    {level.groups.map((g) => (
                      <option key={g.id} value={g.id}>Destino G{g.id}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => onMergeGroups(mergeSource, mergeTarget)}
                  className="w-full py-1.5 rounded bg-indigo-600/80 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
                >
                  Fusionar Origen en Destino
                </button>
              </div>
            )}
          </div>
        )}

        {/* LEVEL SETTINGS TAB */}
        {tab === 'level' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-indigo-400/25 bg-[#0b122b] p-2.5 space-y-2">
              <div className="font-bold text-[11px] uppercase tracking-wider text-indigo-300 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" />
                Escenario y Metadatos
              </div>
              <label className="block space-y-0.5">
                <span className="text-[10px] text-slate-400">Escenario 3D</span>
                <select
                  value={level.environmentTheme}
                  onChange={(e) =>
                    onMutateLevel((doc) => ({
                      ...doc,
                      environmentTheme: e.target.value as EnvironmentTheme,
                    }))
                  }
                  className="w-full bg-black/50 border border-white/15 rounded px-2 py-1.5"
                >
                  {Object.values(ENVIRONMENT_DEFINITIONS).map((env) => (
                    <option key={env.environmentId} value={env.environmentId}>
                      {env.displayName}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-1.5">
                <label className="space-y-0.5">
                  <span className="text-[10px] text-slate-400">Dificultad</span>
                  <select
                    value={level.difficulty}
                    onChange={(e) =>
                      onMutateLevel((doc) => ({
                        ...doc,
                        difficulty: e.target.value as DifficultyLevel,
                      }))
                    }
                    className="w-full bg-black/50 border border-white/15 rounded px-2 py-1"
                  >
                    <option value="easy">Fácil</option>
                    <option value="normal">Normal</option>
                    <option value="hard">Difícil</option>
                    <option value="expert">Experto</option>
                    <option value="master">Maestro</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] text-slate-400">Duración (s)</span>
                  <input
                    type="number"
                    min="10"
                    max="600"
                    value={Math.round(level.audio.durationSec)}
                    onChange={(e) =>
                      onMutateLevel((doc) => ({
                        ...doc,
                        audio: { ...doc.audio, durationSec: Math.max(10, Number(e.target.value) || 30) },
                      }))
                    }
                    className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0b122b] p-2.5 space-y-2">
              <div className="font-bold text-[11px] uppercase tracking-wider text-cyan-300">
                Reglas de Gameplay Custom
              </div>
              <label className="block space-y-0.5">
                <span className="text-[10px] text-slate-400">Modo de Juego</span>
                <select
                  value={level.gameplayRules.mode}
                  onChange={(e) => {
                    const m = e.target.value as CustomGameplayMode;
                    onMutateLevel((doc) => ({
                      ...doc,
                      gameplayRules: {
                        ...doc.gameplayRules,
                        mode: m,
                        twoThumbMode: m === 'two_thumb',
                        enableTouchZones: m === 'touch_zones' || m === 'experimental',
                      },
                    }));
                  }}
                  className="w-full bg-black/50 border border-white/15 rounded px-2 py-1.5"
                >
                  {GAMEPLAY_MODES.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-1.5">
                <label className="space-y-0.5">
                  <span className="text-[10px] text-slate-400">Carriles (4-8)</span>
                  <select
                    value={level.gameplayRules.laneCount}
                    onChange={(e) =>
                      onMutateLevel((doc) => ({
                        ...doc,
                        gameplayRules: {
                          ...doc.gameplayRules,
                          laneCount: Number(e.target.value) as LaneCount,
                        },
                      }))
                    }
                    className="w-full bg-black/50 border border-white/15 rounded px-2 py-1"
                  >
                    {[4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>{n} carriles</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] text-slate-400">Ventana Hit (ms)</span>
                  <input
                    type="number"
                    min="45"
                    max="220"
                    value={level.gameplayRules.hitWindowMs}
                    onChange={(e) =>
                      onMutateLevel((doc) => ({
                        ...doc,
                        gameplayRules: {
                          ...doc.gameplayRules,
                          hitWindowMs: Math.max(45, Math.min(220, Number(e.target.value) || 120)),
                        },
                      }))
                    }
                    className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] text-slate-400">Velocidad</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0.6"
                    max="2.2"
                    value={level.gameplayRules.approachSpeed}
                    onChange={(e) =>
                      onMutateLevel((doc) => ({
                        ...doc,
                        gameplayRules: {
                          ...doc.gameplayRules,
                          approachSpeed: Number(e.target.value) || 1.0,
                        },
                      }))
                    }
                    className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] text-slate-400">Máx. Fallos</span>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={level.gameplayRules.maxMisses}
                    onChange={(e) =>
                      onMutateLevel((doc) => ({
                        ...doc,
                        gameplayRules: {
                          ...doc.gameplayRules,
                          maxMisses: Math.max(1, Number(e.target.value) || 10),
                        },
                      }))
                    }
                    className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0b122b] p-2.5 space-y-2">
              <div className="font-bold text-[11px] uppercase tracking-wider text-amber-300">
                Iluminación Reactiva & Cámara
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="space-y-0.5">
                  <span className="text-[10px] text-slate-400">FOV Base</span>
                  <input
                    type="number"
                    min="42"
                    max="86"
                    value={level.camera.baseFov}
                    onChange={(e) =>
                      onMutateLevel((doc) => ({
                        ...doc,
                        camera: { ...doc.camera, baseFov: Number(e.target.value) || 56 },
                      }))
                    }
                    className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] text-slate-400">Kick Glow</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={level.effects.kickIntensity}
                    onChange={(e) =>
                      onMutateLevel((doc) => ({
                        ...doc,
                        effects: { ...doc.effects, kickIntensity: Number(e.target.value) || 1 },
                      }))
                    }
                    className="w-full bg-black/40 border border-white/15 rounded px-2 py-1 font-mono-num"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={level.effects.reactiveLightingEnabled}
                  onChange={(e) =>
                    onMutateLevel((doc) => ({
                      ...doc,
                      effects: { ...doc.effects, reactiveLightingEnabled: e.target.checked },
                    }))
                  }
                />
                <span>Iluminación reactiva a Kick/Snare/Hi-Hat</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
