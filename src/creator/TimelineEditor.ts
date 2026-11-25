import type { CreatorObject, TimelineKeyframe, TimelineMarker } from '../types/creator';
import { generateCreatorObjectId } from './ObjectLibrary';

export type BeatSnapDivision = 'free' | '1/1' | '1/2' | '1/4' | '1/8' | '1/16';

export interface BarBeatPosition {
  bar: number; // 1-indexed
  beat: number; // 1-indexed
  subdivisionPct: number; // 0..99
  formatted: string; // e.g. "004:2"
}

export function secondsToBarBeat(
  timeSec: number,
  bpm: number,
  offsetMs = 0,
  beatsPerBar = 4,
): BarBeatPosition {
  const safeBpm = Math.max(40, bpm);
  const beatDur = 60 / safeBpm;
  const shifted = Math.max(0, timeSec - offsetMs / 1000);
  const totalBeats = shifted / beatDur;
  const beatFloor = Math.floor(totalBeats + 1e-4);
  const bar = Math.floor(beatFloor / beatsPerBar) + 1;
  const beat = (beatFloor % beatsPerBar) + 1;
  const sub = Math.round((totalBeats - Math.floor(totalBeats)) * 100);
  return {
    bar,
    beat,
    subdivisionPct: Math.min(99, Math.max(0, sub)),
    formatted: `${String(bar).padStart(3, '0')}:${beat}`,
  };
}

export function barBeatToSeconds(
  bar: number,
  beat: number,
  bpm: number,
  offsetMs = 0,
  beatsPerBar = 4,
): number {
  const beatDur = 60 / Math.max(40, bpm);
  const totalBeats = Math.max(0, (bar - 1) * beatsPerBar + (beat - 1));
  return Math.max(0, totalBeats * beatDur + offsetMs / 1000);
}

export function getSnapStepSec(bpm: number, division: BeatSnapDivision): number {
  if (division === 'free') return 0;
  const beatDur = 60 / Math.max(40, bpm);
  switch (division) {
    case '1/1':
      return beatDur;
    case '1/2':
      return beatDur / 2;
    case '1/4':
      return beatDur / 4;
    case '1/8':
      return beatDur / 8;
    case '1/16':
      return beatDur / 16;
  }
}

export function snapTimeToBeat(
  timeSec: number,
  bpm: number,
  offsetMs: number,
  division: BeatSnapDivision,
): number {
  if (division === 'free') return Math.max(0, Number(timeSec.toFixed(3)));
  const step = getSnapStepSec(bpm, division);
  const offsetSec = offsetMs / 1000;
  const relative = Math.max(0, timeSec - offsetSec);
  const snapped = Math.round(relative / step) * step + offsetSec;
  return Math.max(0, Number(snapped.toFixed(3)));
}

export function extractWaveformPeaks(audioBuffer: AudioBuffer, binCount = 240): number[] {
  const channel = audioBuffer.getChannelData(0);
  const totalSamples = channel.length;
  if (totalSamples === 0 || binCount <= 0) return [];
  const step = Math.max(1, Math.floor(totalSamples / binCount));
  const peaks: number[] = new Array(binCount).fill(0);
  let globalMax = 0.001;

  for (let i = 0; i < binCount; i++) {
    const start = i * step;
    const end = Math.min(totalSamples, start + step);
    let maxAmp = 0;
    const stride = Math.max(1, Math.floor((end - start) / 28));
    for (let s = start; s < end; s += stride) {
      const a = Math.abs(channel[s]);
      if (a > maxAmp) maxAmp = a;
    }
    peaks[i] = maxAmp;
    if (maxAmp > globalMax) globalMax = maxAmp;
  }

  return peaks.map((p) => Number((p / globalMax).toFixed(3)));
}

export function createTimelineMarker(
  timeSec: number,
  label: string,
  kind: TimelineMarker['kind'] = 'bookmark',
): TimelineMarker {
  const color =
    kind === 'drop'
      ? '#ec4899'
      : kind === 'playtest'
        ? '#34d399'
        : kind === 'section'
          ? '#22d3ee'
          : '#fbbf24';
  return {
    id: `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    timeSec: Math.max(0, Number(timeSec.toFixed(3))),
    label: label.trim() || 'Marcador',
    color,
    kind,
  };
}

export function duplicateObjectsSequence(
  objects: CreatorObject[],
  selectedIds: Set<string>,
  offsetSec: number,
): { created: CreatorObject[]; all: CreatorObject[] } {
  const created: CreatorObject[] = [];
  for (const obj of objects) {
    if (!selectedIds.has(obj.id)) continue;
    const copy: CreatorObject = {
      ...structuredClone(obj),
      id: generateCreatorObjectId(obj.category.slice(0, 3)),
      timeSec: Math.max(0, Number((obj.timeSec + offsetSec).toFixed(3))),
    };
    created.push(copy);
  }
  return {
    created,
    all: [...objects, ...created].sort((a, b) => a.timeSec - b.timeSec),
  };
}

export function duplicateKeyframesSequence(
  keyframes: TimelineKeyframe[],
  fromSec: number,
  toSec: number,
  shiftSec: number,
): TimelineKeyframe[] {
  const clones: TimelineKeyframe[] = [];
  for (const kf of keyframes) {
    if (kf.timeSec >= fromSec && kf.timeSec <= toSec) {
      clones.push({
        ...kf,
        id: `kf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        timeSec: Math.max(0, Number((kf.timeSec + shiftSec).toFixed(3))),
      });
    }
  }
  return [...keyframes, ...clones].sort((a, b) => a.timeSec - b.timeSec);
}
