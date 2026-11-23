import type {
  EnergyFrame,
  FusionWeights,
  MusicProfile,
  MusicalEvent,
  MusicalEventType,
  MusicalRole,
  SpectralBand6,
} from '../types/game';

export const DEFAULT_FUSION_WEIGHTS: FusionWeights = {
  beat: 1.0,
  percussion: 0.9,
  melodic: 0.96,
  harmonic: 0.86,
  vocal: 0.94,
  drop: 1.28,
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function isInSilence(time: number, profile: MusicProfile): boolean {
  for (const r of profile.silenceRanges) {
    if (time >= r.start - 0.04 && time <= r.end + 0.04) return true;
  }
  return false;
}

function getEnergyFrameAt(time: number, timeline: EnergyFrame[]): EnergyFrame | null {
  if (timeline.length === 0) return null;
  const idx = Math.min(timeline.length - 1, Math.max(0, Math.round(time / 0.05)));
  return timeline[idx];
}

function computeBeatAlignment(time: number, beats: number[]): number {
  if (beats.length === 0) return 0.5;
  let lo = 0;
  let hi = beats.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  let minDist = Math.abs(beats[lo] - time);
  if (lo > 0) minDist = Math.min(minDist, Math.abs(beats[lo - 1] - time));

  if (minDist <= 0.045) return 1.0 - minDist / 0.09;
  if (lo > 0) {
    const midBeat = (beats[lo - 1] + beats[lo]) * 0.5;
    const halfDist = Math.abs(midBeat - time);
    if (halfDist <= 0.045) return 0.74;
  }
  return clamp01(0.55 - minDist * 1.15);
}

function signedPitchDelta(prevPitch: number, curPitch: number): number {
  let d = curPitch - prevPitch;
  if (d > 6) d -= 12;
  if (d < -6) d += 12;
  return d;
}

interface RawCandidateEvent {
  time: number;
  type: MusicalEventType;
  role: MusicalRole;
  confidence: number;
  intensity: number;
  weight: number;
  band: SpectralBand6;
  beatAlignment: number;
  pitchClass?: number;
  spectralCentroid?: number;
  duration?: number;
  harmonicIntensity: number;
  percussiveIntensity: number;
  pitchConfidence: number;
}

/**
 * Balanced musical priority:
 * Expressive leads (drop, vocal, melody) compete fairly with beats & percussion
 * instead of collapsing every on-beat note into a generic percussive beat.
 */
const ROLE_BASE_BONUS: Record<MusicalRole, number> = {
  drop: 0.24,
  vocal: 0.16,
  melody: 0.14,
  harmony: 0.1,
  kick: 0.11,
  snare: 0.1,
  bassline: 0.09,
  beat: 0.08,
  synth_seq: 0.07,
  hihat: 0.03,
};

/**
 * Multi-Layer Musical Event Fusion Engine v3.
 * Preserves HPSS-separated musical roles (kick, snare, hihat, bassline, vocal, melody, harmony, synth_seq, drop, beat),
 * melodic pitch contours, and sustained phrase durations alongside tracked beats.
 */
export function fuseMusicalEvents(
  profile: MusicProfile,
  dominantPitchByFrame?: Uint8Array,
  pitchSalienceByFrame?: Float32Array,
  frameDt = 0.0116,
  halfWindowSec = 0.0232,
  weights: FusionWeights = DEFAULT_FUSION_WEIGHTS,
): MusicalEvent[] {
  const candidates: RawCandidateEvent[] = [];
  const timeline = profile.energyTimeline;
  const beats = profile.beats;

  const getFrameIndex = (time: number, len: number): number =>
    Math.min(len - 1, Math.max(0, Math.round((time - halfWindowSec) / frameDt)));

  const getPitch = (time: number): number | undefined => {
    if (!dominantPitchByFrame || dominantPitchByFrame.length === 0) return undefined;
    return dominantPitchByFrame[getFrameIndex(time, dominantPitchByFrame.length)];
  };

  const getPitchConf = (time: number, ef: EnergyFrame | null): number => {
    if (pitchSalienceByFrame && pitchSalienceByFrame.length > 0) {
      return pitchSalienceByFrame[getFrameIndex(time, pitchSalienceByFrame.length)];
    }
    return ef?.pitchSalience ?? ef?.harmonicStrength ?? 0.4;
  };

  // 1. Structural Drop anchors
  for (const dropTime of profile.drops ?? []) {
    if (isInSilence(dropTime, profile)) continue;
    const ef = getEnergyFrameAt(dropTime, timeline);
    candidates.push({
      time: dropTime,
      type: 'drop',
      role: 'drop',
      confidence: 0.96,
      intensity: clamp01((ef?.total ?? 0.85) * 1.15),
      weight: weights.drop,
      band: 'sub_bass',
      beatAlignment: computeBeatAlignment(dropTime, beats),
      pitchClass: getPitch(dropTime),
      spectralCentroid: ef?.centroid,
      harmonicIntensity: ef?.harmonicStrength ?? 0.45,
      percussiveIntensity: ef?.percussiveRatio ?? 0.7,
      pitchConfidence: getPitchConf(dropTime, ef),
    });
  }

  // 2. Dynamic Tracked Beats
  for (let i = 0; i < beats.length; i++) {
    const bt = beats[i];
    if (isInSilence(bt, profile)) continue;
    const ef = getEnergyFrameAt(bt, timeline);
    const totalE = ef?.total ?? 0.5;
    const bassE = ef?.bass ?? 0.4;
    const midE = ef?.mid ?? 0.4;
    const isDownbeat = i % (profile.timeSignature === '3/4' ? 3 : 4) === 0;
    const tempoConf = profile.tempoConfidence ?? 0.65;

    candidates.push({
      time: bt,
      type: 'beat',
      role: 'beat',
      confidence: clamp01(0.45 + tempoConf * 0.4 + totalE * 0.25 + (isDownbeat ? 0.1 : 0)),
      intensity: clamp01(totalE * 0.72 + bassE * 0.35 + (isDownbeat ? 0.12 : 0)),
      weight: weights.beat * (isDownbeat ? 1.16 : 0.96),
      band: bassE > midE * 1.1 ? 'bass' : 'full',
      beatAlignment: 1.0,
      pitchClass: getPitch(bt),
      spectralCentroid: ef?.centroid,
      harmonicIntensity: ef?.harmonicStrength ?? 0.4,
      percussiveIntensity: ef?.percussiveRatio ?? 0.5,
      pitchConfidence: getPitchConf(bt, ef),
    });
  }

  // 3. Separated HPSS Onsets (Kick, Snare, Hi-Hat, Bassline, Vocal, Melody, Harmony, Synth Seq)
  let lastVocalAnchorTime = -10;
  for (const onset of profile.onsets) {
    if (isInSilence(onset.time, profile)) continue;
    const ef = getEnergyFrameAt(onset.time, timeline);
    const beatAlign = computeBeatAlignment(onset.time, beats);
    const band6: SpectralBand6 =
      onset.band6 ??
      (onset.band === 'bass' ? 'bass' : onset.band === 'high' ? 'treble' : 'mid');
    const pitchConf = getPitchConf(onset.time, ef);
    const harmInt = ef?.harmonicStrength ?? 0.45;
    const percInt = ef?.percussiveRatio ?? 0.5;
    const vocalEst = ef?.vocalPresence ?? 0;

    let role: MusicalRole = onset.role ?? 'melody';
    let type: MusicalEventType = 'percussion';
    let weight = weights.percussion;
    let duration = onset.duration;

    if (onset.layer === 'harmonic') {
      if (role === 'vocal' || (vocalEst > 0.46 && pitchConf > 0.28 && onset.time - lastVocalAnchorTime >= 0.28)) {
        role = 'vocal';
        type = 'vocal_phrase';
        weight = weights.vocal * (0.9 + vocalEst * 0.25);
        lastVocalAnchorTime = onset.time;
        if (!duration && vocalEst > 0.52) duration = 0.36;
      } else if (role === 'harmony') {
        type = 'harmonic';
        weight = weights.harmonic * (0.9 + harmInt * 0.2);
      } else if (role === 'synth_seq') {
        type = 'melodic';
        weight = weights.melodic * 0.94;
      } else {
        role = 'melody';
        type = 'melodic';
        weight = weights.melodic * (0.88 + pitchConf * 0.28);
      }

      candidates.push({
        time: onset.time,
        type,
        role,
        confidence: clamp01(0.4 + onset.strength * 0.38 + pitchConf * 0.24),
        intensity: clamp01(onset.strength * 0.7 + (ef?.mid ?? 0.42) * 0.3),
        weight,
        band: band6,
        beatAlignment: beatAlign,
        pitchClass: getPitch(onset.time),
        spectralCentroid: ef?.centroid,
        duration,
        harmonicIntensity: clamp01(harmInt * 0.7 + (ef?.harmonicFlux ?? onset.strength) * 0.3),
        percussiveIntensity: percInt,
        pitchConfidence: pitchConf,
      });
    } else if (onset.layer === 'bassline') {
      candidates.push({
        time: onset.time,
        type: 'melodic',
        role: 'bassline',
        confidence: clamp01(0.42 + onset.strength * 0.4 + (ef?.basslineActivity ?? 0.3) * 0.2),
        intensity: clamp01(onset.strength * 0.72 + (ef?.bass ?? 0.45) * 0.28),
        weight: weights.harmonic * 0.95,
        band: 'bass',
        beatAlignment: beatAlign,
        pitchClass: getPitch(onset.time),
        spectralCentroid: ef?.centroid,
        duration,
        harmonicIntensity: clamp01(harmInt * 0.8),
        percussiveIntensity: percInt * 0.65,
        pitchConfidence: pitchConf,
      });
    } else {
      // Percussive layers (kick, snare, hihat)
      role =
        onset.role ??
        (onset.layer === 'percussive_low'
          ? 'kick'
          : onset.layer === 'percussive_high'
            ? 'hihat'
            : 'snare');

      // In low-percussive acoustic/vocal tracks, mid transients with strong pitch clarity are melodic attacks
      const isAcousticLead =
        role === 'snare' && percInt < 0.36 && (harmInt > 0.5 || pitchConf > 0.48);

      if (isAcousticLead) {
        type = 'melodic';
        role = 'melody';
        weight = weights.melodic * 0.92;
      } else {
        type = 'percussion';
        weight =
          role === 'kick'
            ? weights.percussion * 1.04
            : role === 'snare'
              ? weights.percussion * 1.0
              : weights.percussion * 0.76;
      }

      candidates.push({
        time: onset.time,
        type,
        role,
        confidence: clamp01(0.42 + onset.strength * 0.48 + beatAlign * 0.14),
        intensity: clamp01(onset.strength * 0.8 + (ef?.total ?? 0.4) * 0.22),
        weight,
        band: band6,
        beatAlignment: beatAlign,
        pitchClass: getPitch(onset.time),
        spectralCentroid: ef?.centroid,
        harmonicIntensity: harmInt,
        percussiveIntensity: clamp01(Math.max(percInt, onset.strength * 0.7)),
        pitchConfidence: pitchConf,
      });
    }
  }

  // 4. Metric Subdivisions
  for (const sub of profile.subdivisions ?? []) {
    if (isInSilence(sub.time, profile)) continue;
    const ef = getEnergyFrameAt(sub.time, timeline);
    if (!ef || ef.total < profile.averageEnergy * 0.52) continue;
    const subFlux = Math.max(ef.flux ?? 0, ef.harmonicFlux ?? 0, ef.percussiveFlux ?? 0);
    if (sub.strength < 0.16 && subFlux < 0.14) continue;

    const isHarmSub = (ef.harmonicFlux ?? 0) > (ef.percussiveFlux ?? 0) * 1.15;
    candidates.push({
      time: sub.time,
      type: 'subdivision',
      role: isHarmSub ? 'synth_seq' : 'hihat',
      confidence: clamp01(0.35 + sub.strength * 0.5),
      intensity: clamp01(sub.strength * 0.7 + ef.total * 0.3),
      weight: weights.percussion * (sub.division === 4 ? 0.68 : 0.78),
      band: ef.high > ef.mid ? 'high_mid' : 'mid',
      beatAlignment: sub.division === 2 ? 0.75 : 0.62,
      pitchClass: getPitch(sub.time),
      spectralCentroid: ef?.centroid,
      harmonicIntensity: ef.harmonicStrength ?? 0.35,
      percussiveIntensity: ef.percussiveRatio ?? 0.5,
      pitchConfidence: getPitchConf(sub.time, ef),
    });
  }

  // Sort chronologically and fuse coincident events within 46ms window
  candidates.sort((a, b) => a.time - b.time);

  const fused: MusicalEvent[] = [];
  const coincidenceWindowSec = 0.046;
  let lastMelodicPitch: number | undefined;

  let i = 0;
  while (i < candidates.length) {
    const cluster: RawCandidateEvent[] = [candidates[i]];
    let j = i + 1;
    while (j < candidates.length && candidates[j].time - cluster[0].time <= coincidenceWindowSec) {
      cluster.push(candidates[j]);
      j++;
    }

    let bestAnchor = cluster[0];
    let bestAnchorScore = -1;
    let maxIntensity = 0;
    let maxConf = 0;
    let totalWeightedConf = 0;
    let maxBeatAlign = 0;
    let maxHarm = 0;
    let maxPerc = 0;
    let maxPitchConf = 0;
    let bestDuration: number | undefined;
    const uniqueRoles = new Set<MusicalRole>();

    for (const c of cluster) {
      uniqueRoles.add(c.role);
      const roleBonus = ROLE_BASE_BONUS[c.role] ?? 0.05;
      // If a vocal/melody onset sits on a beat and has genuine harmonic sustain/pitch clarity, let it keep its expressive identity
      const melodicSustainBoost =
        (c.role === 'vocal' || c.role === 'melody' || c.role === 'harmony') &&
        ((c.duration ?? 0) >= 0.3 || c.pitchConfidence > 0.38)
          ? 0.14
          : 0;
      const anchorScore = c.confidence * c.weight + roleBonus + melodicSustainBoost;
      if (anchorScore > bestAnchorScore) {
        bestAnchorScore = anchorScore;
        bestAnchor = c;
      }
      if (c.intensity > maxIntensity) maxIntensity = c.intensity;
      if (c.confidence > maxConf) maxConf = c.confidence;
      if (c.harmonicIntensity > maxHarm) maxHarm = c.harmonicIntensity;
      if (c.percussiveIntensity > maxPerc) maxPerc = c.percussiveIntensity;
      if (c.pitchConfidence > maxPitchConf) maxPitchConf = c.pitchConfidence;
      if (c.duration && (!bestDuration || c.duration > bestDuration)) {
        bestDuration = c.duration;
      }
      totalWeightedConf += c.confidence * c.weight;
      if (c.beatAlignment > maxBeatAlign) maxBeatAlign = c.beatAlignment;
    }

    const layerSynergy = Math.min(0.28, (uniqueRoles.size - 1) * 0.11);
    const avgWeightedConf = totalWeightedConf / cluster.length;
    const combinedConfidence = clamp01(maxConf * 0.62 + avgWeightedConf * 0.25 + layerSynergy);
    const relevance = clamp01(
      (bestAnchor.weight * 0.36 +
        maxIntensity * 0.32 +
        combinedConfidence * 0.28 +
        maxBeatAlign * 0.12 +
        layerSynergy) /
        1.14,
    );

    // Lock timestamp tightly to beat/drop if one coincides inside the cluster, while retaining expressive role!
    const beatMember = cluster.find((c) => c.type === 'drop' || c.type === 'beat');
    const chosenTime = beatMember ? beatMember.time : bestAnchor.time;

    let melodicStep: number | undefined;
    const isMelodicLike =
      bestAnchor.type === 'melodic' ||
      bestAnchor.type === 'vocal_phrase' ||
      bestAnchor.type === 'harmonic' ||
      bestAnchor.role === 'bassline';
    if (bestAnchor.pitchClass !== undefined && isMelodicLike) {
      if (lastMelodicPitch !== undefined) {
        melodicStep = signedPitchDelta(lastMelodicPitch, bestAnchor.pitchClass);
      }
      lastMelodicPitch = bestAnchor.pitchClass;
    }

    fused.push({
      time: Number(chosenTime.toFixed(3)),
      type: bestAnchor.type,
      role: bestAnchor.role,
      confidence: Number(combinedConfidence.toFixed(3)),
      intensity: Number(maxIntensity.toFixed(3)),
      relevance: Number(relevance.toFixed(3)),
      band: bestAnchor.band,
      beatAlignment: Number(maxBeatAlign.toFixed(3)),
      duration: bestDuration,
      pitchClass: bestAnchor.pitchClass,
      spectralCentroid: bestAnchor.spectralCentroid,
      harmonicIntensity: Number(maxHarm.toFixed(3)),
      percussiveIntensity: Number(maxPerc.toFixed(3)),
      pitchConfidence: Number(maxPitchConf.toFixed(3)),
      melodicStep,
    });

    i = j;
  }

  return fused;
}
