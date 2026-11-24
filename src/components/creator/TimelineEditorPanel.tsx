import React, { useEffect, useRef, useState } from 'react';
import {
  BookmarkPlus,
  CopyPlus,
  Play,
  Plus,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  BeatflowLevelDocument,
  EasingType,
  TimelineKeyframe,
  TimelineMarker,
} from '../../types/creator';
import {
  type BeatSnapDivision,
  createTimelineMarker,
  secondsToBarBeat,
} from '../../creator/TimelineEditor';

interface TimelineEditorPanelProps {
  level: BeatflowLevelDocument;
  cursorTime: number;
  snapDivision: BeatSnapDivision;
  waveformPeaks: number[];
  selectedIds: string[];
  onSeekTime: (timeSec: number) => void;
  onChangeSnap: (div: BeatSnapDivision) => void;
  onSelectObjectId: (id: string, additive: boolean) => void;
  onAddMarker: (marker: TimelineMarker) => void;
  onRemoveMarker: (markerId: string) => void;
  onAddKeyframe: (kf: TimelineKeyframe) => void;
  onDuplicateSelected: () => void;
  onPlaytestFromCursor: () => void;
}

const SNAP_OPTIONS: Array<{ id: BeatSnapDivision; label: string }> = [
  { id: '1/1', label: '1/1' },
  { id: '1/2', label: '1/2' },
  { id: '1/4', label: '1/4' },
  { id: '1/8', label: '1/8' },
  { id: 'free', label: 'Libre' },
];

export const TimelineEditorPanel: React.FC<TimelineEditorPanelProps> = ({
  level,
  cursorTime,
  snapDivision,
  waveformPeaks,
  selectedIds,
  onSeekTime,
  onChangeSnap,
  onSelectObjectId,
  onAddMarker,
  onRemoveMarker,
  onAddKeyframe,
  onDuplicateSelected,
  onPlaytestFromCursor,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pxPerSec, setPxPerSec] = useState(46);
  const [kfOpen, setKfOpen] = useState(false);
  const [kfProperty, setKfProperty] = useState<TimelineKeyframe['property']>('posY');
  const [kfEasing, setKfEasing] = useState<EasingType>('easeInOut');
  const [kfFrom, setKfFrom] = useState('0');
  const [kfTo, setKfTo] = useState('1.5');
  const [kfGroupId, setKfGroupId] = useState(1);

  const duration = Math.max(15, level.audio.durationSec);
  const barBeat = secondsToBarBeat(cursorTime, level.audio.bpm, level.audio.offsetMs);

  // Render Canvas2D Waveform + Beat/Bar Grid + Multi-Track Timeline
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(110, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#050817';
    ctx.fillRect(0, 0, width, height);

    const centerX = width * 0.28;
    const timeToX = (t: number) => centerX + (t - cursorTime) * pxPerSec;

    // Track lane bands
    const tracks = [
      { label: 'AUDIO', y: 18, h: 24, col: 'rgba(34,211,238,0.08)' },
      { label: 'NOTAS', y: 44, h: 22, col: 'rgba(56,189,248,0.06)' },
      { label: 'TRIGGERS', y: 68, h: 20, col: 'rgba(245,158,11,0.06)' },
      { label: 'ANIM/FX', y: 90, h: 20, col: 'rgba(236,72,153,0.06)' },
    ];
    for (const tr of tracks) {
      ctx.fillStyle = tr.col;
      ctx.fillRect(0, tr.y, width, tr.h);
      ctx.fillStyle = 'rgba(148,163,184,0.65)';
      ctx.font = '600 9px monospace';
      ctx.fillText(tr.label, 6, tr.y + 13);
    }

    // Beat / Bar Ruler
    const beatDur = 60 / Math.max(40, level.audio.bpm);
    const offsetSec = level.audio.offsetMs / 1000;
    const minVisibleT = Math.max(0, cursorTime - centerX / pxPerSec);
    const maxVisibleT = Math.min(duration, cursorTime + (width - centerX) / pxPerSec);
    const startBeat = Math.max(0, Math.floor((minVisibleT - offsetSec) / beatDur));
    const endBeat = Math.ceil((maxVisibleT - offsetSec) / beatDur);

    for (let b = startBeat; b <= endBeat; b++) {
      const t = offsetSec + b * beatDur;
      const x = timeToX(t);
      const isBar = b % 4 === 0;
      ctx.strokeStyle = isBar ? 'rgba(34,211,238,0.35)' : 'rgba(148,163,184,0.14)';
      ctx.lineWidth = isBar ? 1.2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      if (isBar) {
        ctx.fillStyle = '#67e8f9';
        ctx.font = '600 9px monospace';
        ctx.fillText(`${Math.floor(b / 4) + 1}:1`, x + 3, 11);
      }
    }

    // Waveform peaks in AUDIO band
    if (waveformPeaks.length > 0) {
      const n = waveformPeaks.length;
      ctx.fillStyle = 'rgba(34,211,238,0.55)';
      for (let i = 0; i < n; i++) {
        const t = (i / n) * duration;
        const x = timeToX(t);
        if (x < 48 || x > width) continue;
        const amp = Math.max(2, waveformPeaks[i] * 20);
        ctx.fillRect(x, 30 - amp * 0.5, Math.max(1.5, (duration * pxPerSec) / n - 1), amp);
      }
    }

    // Objects on NOTAS / TRIGGERS / ANIM tracks
    const selSet = new Set(selectedIds);
    for (const obj of level.objects) {
      const x = timeToX(obj.timeSec);
      if (x < -20 || x > width + 20) continue;
      const isSel = selSet.has(obj.id);
      const y =
        obj.category === 'gameplay' ? 50 : obj.trigger ? 73 : 95;
      const w = obj.noteData && obj.noteData.durationSec > 0 ? Math.max(8, obj.noteData.durationSec * pxPerSec) : 7;
      ctx.fillStyle = isSel ? '#ffffff' : obj.material.color;
      ctx.fillRect(x, y, w, 10);
      if (isSel) {
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 1, y - 1, w + 2, 12);
      }
    }

    // Keyframes in ANIM/FX track
    for (const kf of level.timelineKeyframes) {
      const x = timeToX(kf.timeSec);
      if (x < -20 || x > width + 20) continue;
      const w = Math.max(6, kf.durationSec * pxPerSec);
      ctx.fillStyle = 'rgba(236,72,153,0.75)';
      ctx.fillRect(x, 96, w, 6);
    }

    // Markers
    for (const m of level.markers) {
      const x = timeToX(m.timeSec);
      if (x < 0 || x > width) continue;
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillStyle = m.color;
      ctx.font = '700 9px sans-serif';
      ctx.fillText(m.label, x + 3, height - 4);
    }

    // Playhead cursor line
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.stroke();
  }, [level, cursorTime, pxPerSec, waveformPeaks, selectedIds, duration]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const centerX = rect.width * 0.28;
    const clickedTime = Math.max(0, Math.min(duration, cursorTime + (clickX - centerX) / pxPerSec));

    // Check if user clicked near an object block
    for (const obj of level.objects) {
      const ox = centerX + (obj.timeSec - cursorTime) * pxPerSec;
      const oy = obj.category === 'gameplay' ? 50 : obj.trigger ? 73 : 95;
      if (Math.abs(clickX - ox) <= 10 && Math.abs(clickY - oy) <= 12) {
        onSelectObjectId(obj.id, e.shiftKey);
        return;
      }
    }

    onSeekTime(Number(clickedTime.toFixed(3)));
  };

  return (
    <div className="flex flex-col bg-[#06091b]/96 border-t border-cyan-400/25 text-slate-100 text-xs select-none">
      {/* Timeline Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="font-mono-num text-amber-300 font-bold">
            {cursorTime.toFixed(2)}s
          </span>
          <span className="font-mono-num text-cyan-300">
            Compás {barBeat.formatted}
          </span>
          <div className="flex items-center gap-1 ml-1">
            {SNAP_OPTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onChangeSnap(s.id)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${
                  snapDivision === s.id
                    ? 'bg-cyan-500/25 border-cyan-400 text-cyan-100'
                    : 'bg-black/30 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              onAddMarker(
                createTimelineMarker(cursorTime, `M ${barBeat.formatted}`, 'playtest'),
              )
            }
            className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/30 cursor-pointer"
            title="Añadir marcador de Playtest aquí"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Marcador</span>
          </button>

          <button
            type="button"
            onClick={() => setKfOpen((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-fuchsia-500/20 border border-fuchsia-400/40 text-fuchsia-200 hover:bg-fuchsia-500/30 cursor-pointer"
            title="Añadir Keyframe de animación en el timeline"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Keyframe</span>
          </button>

          <button
            type="button"
            onClick={onDuplicateSelected}
            disabled={selectedIds.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 border border-white/15 text-slate-200 disabled:opacity-40 cursor-pointer"
            title="Duplicar secuencia seleccionada al siguiente beat"
          >
            <CopyPlus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onPlaytestFromCursor}
            className="flex items-center gap-1 px-2 py-1 rounded bg-cyan-500/25 border border-cyan-400/50 text-cyan-100 hover:bg-cyan-500/35 font-semibold cursor-pointer"
            title="Iniciar Playtest desde el cursor actual"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span className="hidden sm:inline">Probar aquí</span>
          </button>

          <button
            type="button"
            onClick={() => setPxPerSec((p) => Math.max(18, p - 12))}
            className="p-1 rounded bg-white/5 border border-white/10 text-slate-300 hover:text-white cursor-pointer"
            aria-label="Alejar timeline"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setPxPerSec((p) => Math.min(140, p + 12))}
            className="p-1 rounded bg-white/5 border border-white/10 text-slate-300 hover:text-white cursor-pointer"
            aria-label="Acercar timeline"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Quick Keyframe Creator Strip */}
      {kfOpen && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 bg-fuchsia-950/35 border-b border-fuchsia-400/25 text-[11px]">
          <span>Grupo:</span>
          <select
            value={kfGroupId}
            onChange={(e) => setKfGroupId(Number(e.target.value))}
            className="bg-black/50 border border-white/15 rounded px-1.5 py-0.5"
          >
            {level.groups.map((g) => (
              <option key={g.id} value={g.id}>G{g.id}</option>
            ))}
          </select>
          <select
            value={kfProperty}
            onChange={(e) => setKfProperty(e.target.value as TimelineKeyframe['property'])}
            className="bg-black/50 border border-white/15 rounded px-1.5 py-0.5"
          >
            <option value="posX">posX</option>
            <option value="posY">posY</option>
            <option value="posZ">posZ</option>
            <option value="rotY">rotY</option>
            <option value="rotZ">rotZ</option>
            <option value="scale">scale</option>
            <option value="opacity">opacity</option>
            <option value="glow">glow</option>
            <option value="color">color</option>
          </select>
          <input
            type="text"
            value={kfFrom}
            onChange={(e) => setKfFrom(e.target.value)}
            placeholder="Desde"
            className="w-16 bg-black/40 border border-white/15 rounded px-1.5 py-0.5 font-mono-num"
          />
          <span>→</span>
          <input
            type="text"
            value={kfTo}
            onChange={(e) => setKfTo(e.target.value)}
            placeholder="Hasta"
            className="w-16 bg-black/40 border border-white/15 rounded px-1.5 py-0.5 font-mono-num"
          />
          <select
            value={kfEasing}
            onChange={(e) => setKfEasing(e.target.value as EasingType)}
            className="bg-black/50 border border-white/15 rounded px-1.5 py-0.5"
          >
            {(['linear', 'easeIn', 'easeOut', 'easeInOut', 'cubic', 'quintic', 'bounce', 'elastic', 'back'] as EasingType[]).map(
              (ea) => (
                <option key={ea} value={ea}>{ea}</option>
              ),
            )}
          </select>
          <button
            type="button"
            onClick={() => {
              onAddKeyframe({
                id: `kf-${Date.now().toString(36)}`,
                track: 'animation',
                timeSec: cursorTime,
                durationSec: 1.0,
                targetGroupId: kfGroupId,
                property: kfProperty,
                fromValue: kfProperty === 'color' ? kfFrom : Number(kfFrom) || 0,
                toValue: kfProperty === 'color' ? kfTo : Number(kfTo) || 1,
                easing: kfEasing,
              });
              setKfOpen(false);
            }}
            className="px-2 py-0.5 rounded bg-fuchsia-600 text-white font-semibold cursor-pointer"
          >
            Insertar
          </button>
        </div>
      )}

      {/* Markers Quick Bar */}
      {level.markers.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1 border-b border-white/10 overflow-x-auto">
          {level.markers.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-white/10 bg-white/[0.04] shrink-0"
            >
              <button
                type="button"
                onClick={() => onSeekTime(m.timeSec)}
                className="flex items-center gap-1 text-[10px] font-semibold cursor-pointer hover:text-cyan-300"
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                <span>{m.label}</span>
                <span className="text-slate-400 font-mono-num">{m.timeSec.toFixed(1)}s</span>
              </button>
              {m.id !== 'm-start' && (
                <button
                  type="button"
                  onClick={() => onRemoveMarker(m.id)}
                  className="text-slate-500 hover:text-rose-400 ml-0.5 cursor-pointer"
                  aria-label="Eliminar marcador"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Waveform & Tracks Canvas */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="w-full h-[112px] cursor-crosshair block"
      />
    </div>
  );
};
