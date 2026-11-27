import type {
  EnergyFrame,
  FlickDirection,
  GeneratedLevel,
  GenerationConfig,
  LaneCount,
  LevelNote,
  MusicProfile,
  MusicalEvent,
  MusicalFocus,
  MusicalRole,
  MusicalSection,
  MusicalSectionType,
  SlideWaypoint,
} from '../types/game';
import { fuseMusicalEvents } from './eventFusion';

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRng(seed: string): () => number {
  let state = hashSeed(seed) || 123456789;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isInSilence(time: number, profile: MusicProfile): boolean {
  for (const r of profile.silenceRanges) {
    if (time >= r.start - 0.04 && time <= r.end + 0.04) return true;
  }
  return false;
}

function getEnergyAt(time: number, timeline: EnergyFrame[]): EnergyFrame {
  if (timeline.length === 0) {
    return { time, bass: 0.5, mid: 0.5, high: 0.5, total: 0.5 };
  }
  const idx = Math.min(timeline.length - 1, Math.max(0, Math.round(time / 0.05)));
  return timeline[idx];
}

function getSectionAt(time: number, sections?: MusicalSection[]): MusicalSection | null {
  if (!sections || sections.length === 0) return null;
  for (const sec of sections) {
    if (time >= sec.start && time <= sec.end) return sec;
  }
  return null;
}

function getLocalBpmAt(time: number, profile: MusicProfile): number {
  if (profile.tempoSegments && profile.tempoSegments.length > 0) {
    for (const seg of profile.tempoSegments) {
      if (time >= seg.start && time <= seg.end) return seg.bpm;
    }
  }
  return profile.bpm;
}

function signedPitchDelta(prevPitch: number, curPitch: number): number {
  let d = curPitch - prevPitch;
  if (d > 6) d -= 12;
  if (d < -6) d += 12;
  return d;
}

function inferRole(ev: MusicalEvent): MusicalRole {
  if (ev.role) return ev.role;
  if (ev.type === 'drop') return 'drop';
  if (ev.type === 'vocal_phrase') return 'vocal';
  if (ev.type === 'melodic') return 'melody';
  if (ev.type === 'harmonic') return 'harmony';
  if (ev.type === 'subdivision') return 'hihat';
  if (ev.type === 'percussion') {
    if (ev.band === 'sub_bass' || ev.band === 'bass') return 'kick';
    if (ev.band === 'treble' || ev.band === 'high_mid') return 'hihat';
    return 'snare';
  }
  return 'beat';
}

function getFocusMultiplier(role: MusicalRole, focus: MusicalFocus): number {
  if (focus === 'melody_vocal') {
    if (role === 'vocal') return 1.32;
    if (role === 'melody' || role === 'synth_seq') return 1.24;
    if (role === 'harmony') return 1.08;
    if (role === 'hihat' || role === 'snare') return 0.78;
    if (role === 'kick' || role === 'beat') return 0.9;
    return 1.0;
  }
  if (focus === 'rhythm_bass') {
    if (role === 'kick' || role === 'bassline' || role === 'beat') return 1.22;
    if (role === 'snare' || role === 'drop') return 1.18;
    if (role === 'hihat') return 1.06;
    if (role === 'vocal' || role === 'harmony') return 0.82;
    return 0.92;
  }
  if (focus === 'harmonic') {
    if (role === 'harmony') return 1.3;
    if (role === 'melody' || role === 'vocal') return 1.14;
    if (role === 'bassline') return 1.1;
    if (role === 'hihat') return 0.76;
    return 0.94;
  }
  // 'balanced'
  if (role === 'vocal' || role === 'melody') return 1.12;
  if (role === 'harmony' || role === 'bassline') return 1.04;
  if (role === 'drop') return 1.18;
  return 1.0;
}

function getBaseMinGap(diff: GenerationConfig['difficulty']): number {
  switch (diff) {
    case 'easy':
      return 0.34;
    case 'normal':
      return 0.21;
    case 'hard':
      return 0.145;
    case 'expert':
      return 0.11;
    case 'master':
      return 0.088;
    case 'custom':
    default:
      return 0.17;
  }
}

function getThreshold(diff: GenerationConfig['difficulty']): number {
  switch (diff) {
    case 'easy':
      return 0.74;
    case 'normal':
      return 0.59;
    case 'hard':
      return 0.49;
    case 'expert':
      return 0.42;
    case 'master':
      return 0.37;
    case 'custom':
    default:
      return 0.54;
  }
}

export function generateProceduralLevel(
  profile: MusicProfile,
  config: GenerationConfig,
): GeneratedLevel {
  const rng = createRng(config.seed);
  const duration = profile.duration;
  const laneCount: LaneCount = ([4, 5, 6, 7, 8].includes(config.laneCount)
    ? config.laneCount
    : 4) as LaneCount;
  const mech = config.mechanics;
  const maxMisses = Math.max(1, config.maxMisses || 3);
  const musicalFocus: MusicalFocus = config.musicalFocus ?? 'balanced';
  const twoThumbMode = Boolean(config.twoThumbMode);
  const leftZoneMax = Math.floor(laneCount / 2) - 1;
  const rightZoneMin = Math.ceil(laneCount / 2);
  const isLeftThumb = (l: number) => l <= leftZoneMax;
  const isRightThumb = (l: number) => l >= rightZoneMin;

  // Base speed in 3D world units/sec (spawn at z = -48, hit line at z = 1.6)
  const baseSpeed = 16.5;
  const noteSpeed = baseSpeed * Math.max(0.6, Math.min(2.0, config.approachSpeed));

  const minStartTime = Math.max(1.35, Math.min(2.4, 24 / noteSpeed));
  const maxEndTime = Math.max(minStartTime + 1, duration - 0.55);

  const density = Math.max(0.35, Math.min(1.75, config.noteDensity));
  const complexity = Math.max(0, Math.min(1, config.patternComplexity));
  const variation = Math.max(0, Math.min(1, config.proceduralVariation));
  const randomness = Math.max(0, Math.min(1, config.randomness));

  const rawEvents: MusicalEvent[] =
    profile.fusedEvents && profile.fusedEvents.length > 0
      ? profile.fusedEvents
      : fuseMusicalEvents(profile);

  const tempoFactor = Math.max(0.84, Math.min(1.22, 120 / Math.max(70, profile.bpm)));
  const baseMinGap = getBaseMinGap(config.difficulty);
  const minGlobalGap = (baseMinGap / Math.sqrt(density)) * Math.sqrt(tempoFactor);
  const minLaneCooldown = Math.max(0.115, minGlobalGap * 1.3);

  // Step 1: Select musically significant candidate events with Difficulty Personality & Musical Focus
  const selectedEvents: MusicalEvent[] = [];
  let lastSelectedTime = -10;

  for (const ev of rawEvents) {
    if (ev.time < minStartTime || ev.time > maxEndTime) continue;
    if (isInSilence(ev.time, profile)) continue;

    const section = mech.dynamicSections ? getSectionAt(ev.time, profile.sections) : null;
    const secType: MusicalSectionType = section?.type ?? 'groove';
    if (secType === 'silence') continue;

    const role = inferRole(ev);
    const localBpm = getLocalBpmAt(ev.time, profile);
    const localBeatPeriod = 60 / Math.max(60, localBpm);

    const adaptiveGap =
      ev.type === 'subdivision' || role === 'hihat' || role === 'synth_seq'
        ? Math.max(
            minGlobalGap,
            localBeatPeriod *
              (config.difficulty === 'master'
                ? 0.21
                : config.difficulty === 'expert'
                  ? 0.24
                  : 0.38),
          )
        : minGlobalGap;

    if (ev.time - lastSelectedTime < adaptiveGap) continue;

    // Distinct difficulty personalities (not just density scaling!)
    if (config.difficulty === 'easy') {
      // Easy highlights core beats, main vocal hooks, primary basslines & drops; omits hihat chatter
      if (ev.type === 'subdivision' || role === 'hihat') continue;
      if (role === 'synth_seq' && ev.intensity < 0.65) continue;
      if (ev.confidence < 0.43 && ev.type !== 'beat' && ev.type !== 'drop' && role !== 'vocal') {
        continue;
      }
    } else if (config.difficulty === 'normal') {
      // Normal brings full vocals, melodies & harmonic chorus hits + crisp percussion, filters light noise
      if (ev.type === 'subdivision' && ev.confidence < 0.52 && role !== 'synth_seq') continue;
      if (role === 'hihat' && ev.intensity < 0.56 && musicalFocus !== 'rhythm_bass') continue;
    }

    let sectionBoost = 1.0;
    if (mech.dynamicSections) {
      if (secType === 'drop') sectionBoost = 1.22;
      else if (secType === 'chorus') sectionBoost = 1.14;
      else if (secType === 'buildup') sectionBoost = 1.08;
      else if (secType === 'calm' || secType === 'breakdown') {
        // In calm/breakdown sections, vocals, melodies & harmonies shine while heavy percussion yields space
        sectionBoost =
          role === 'vocal' || role === 'melody' || role === 'harmony' || role === 'bassline'
            ? 1.18
            : 0.66;
      }
    }

    let roleWeight = 1.0;
    switch (role) {
      case 'drop':
        roleWeight = 1.38;
        break;
      case 'vocal':
        roleWeight =
          config.difficulty === 'easy'
            ? 1.12
            : secType === 'calm' || secType === 'breakdown'
              ? 1.24
              : 1.14;
        break;
      case 'melody':
        roleWeight =
          secType === 'calm' || secType === 'breakdown'
            ? 1.22
            : 1.1;
        break;
      case 'harmony':
        roleWeight =
          secType === 'calm' || secType === 'chorus' ? 1.12 : 0.94;
        break;
      case 'bassline':
        roleWeight = config.difficulty === 'easy' ? 0.92 : 1.06;
        break;
      case 'kick':
        roleWeight = 1.08;
        break;
      case 'clap':
        roleWeight = config.difficulty === 'easy' ? 0.85 : 1.06;
        break;
      case 'snare':
        roleWeight = config.difficulty === 'easy' ? 0.8 : 1.04;
        break;
      case 'synth_seq':
        roleWeight =
          config.difficulty === 'master' || config.difficulty === 'expert'
            ? 1.08
            : config.difficulty === 'hard'
              ? 0.96
              : 0.72;
        break;
      case 'hihat':
        roleWeight =
          config.difficulty === 'master'
            ? 0.94
            : config.difficulty === 'expert'
              ? 0.86
              : config.difficulty === 'hard'
                ? 0.74
                : 0.48;
        break;
      case 'beat':
      default:
        roleWeight = 1.06;
        break;
    }

    const focusMult = getFocusMultiplier(role, musicalFocus);
    const energy = getEnergyAt(ev.time, profile.energyTimeline);
    const relEnergy = energy.total / Math.max(0.14, profile.averageEnergy);
    const energyFactor = Math.max(0.68, Math.min(1.24, 0.78 + relEnergy * 0.28));

    const pitchBoost = (ev.pitchConfidence ?? 0) * (role === 'vocal' || role === 'melody' ? 0.12 : 0.04);

    const score =
      (ev.relevance * 0.54 + ev.confidence * 0.28 + ev.beatAlignment * 0.14 + pitchBoost) *
      sectionBoost *
      roleWeight *
      focusMult *
      energyFactor *
      (0.55 + density * 0.48);

    const jitter = (rng() - 0.5) * 0.24 * variation;
    const threshold = getThreshold(config.difficulty);

    if (score + jitter >= threshold) {
      selectedEvents.push(ev);
      lastSelectedTime = ev.time;
    }
  }

  // Fallback for ultra-ambient songs so tracks always remain playable
  if (selectedEvents.length < Math.max(6, Math.floor(duration / 4.5))) {
    for (const beatTime of profile.beats) {
      if (beatTime < minStartTime || beatTime > maxEndTime) continue;
      if (isInSilence(beatTime, profile)) continue;
      if (!selectedEvents.some((s) => Math.abs(s.time - beatTime) < 0.28)) {
        const ef = getEnergyAt(beatTime, profile.energyTimeline);
        selectedEvents.push({
          time: beatTime,
          type: 'beat',
          role: 'beat',
          confidence: 0.65,
          intensity: Math.max(0.35, ef.total),
          relevance: 0.65,
          band: 'full',
          beatAlignment: 1,
        });
      }
    }
    selectedEvents.sort((a, b) => a.time - b.time);
  }

  // Step 2: Assign ergonomically playable lanes & expressive mechanics driven by musical roles
  const rawNotes: LevelNote[] = [];
  const approachDurationSec = Number((49.6 / noteSpeed).toFixed(3));
  let noteId = 1;
  let currentLane = Math.floor(rng() * laneCount);
  let stepDir: 1 | -1 = rng() < 0.5 ? 1 : -1;
  let patternMode: 'walk' | 'zigzag' | 'anchor' | 'burst' = 'walk';
  let patternStepsLeft = 4;

  const laneBusyUntil = new Array<number>(laneCount).fill(-10);
  const laneLastUsed = new Array<number>(laneCount).fill(-10);

  let lastChordTime = -10;
  let lastFlickTime = -10;
  let lastHoldTime = -10;
  let lastSlideTime = -10;
  let lastPitchClass: number | undefined;

  let trillRemaining = 0;
  let trillLanes: [number, number] = [0, 1];
  let trillFlip = 0;

  let streamRemaining = 0;
  let streamDir: 1 | -1 = 1;

  let burstRemaining = 0;

  const isLaneFreeAt = (lane: number, time: number): boolean => {
    if (lane < 0 || lane >= laneCount) return false;
    if (time < laneBusyUntil[lane]) return false;
    if (time - laneLastUsed[lane] < minLaneCooldown) return false;
    return true;
  };

  for (let i = 0; i < selectedEvents.length; i++) {
    const ev = selectedEvents[i];
    const nextEv = i + 1 < selectedEvents.length ? selectedEvents[i + 1] : null;
    const dtFromPrev = i > 0 ? ev.time - selectedEvents[i - 1].time : 1.0;
    const dtToNext = nextEv ? nextEv.time - ev.time : 2.0;

    const role = inferRole(ev);
    const section = mech.dynamicSections ? getSectionAt(ev.time, profile.sections) : null;
    const secType: MusicalSectionType = section?.type ?? 'groove';
    const localBpm = getLocalBpmAt(ev.time, profile);
    const beatPeriod = 60 / Math.max(60, localBpm);

    const isChallengeSection =
      mech.precisionChallenge.enabled &&
      (secType === 'drop' || (secType === 'chorus' && (section?.energy ?? 0) > 0.65));

    // Macro patterns: Rhythm Burst, Trill, Stream aligned to musical role
    if (burstRemaining === 0 && trillRemaining === 0 && streamRemaining === 0) {
      if (
        mech.rhythmBurst.enabled &&
        (secType === 'drop' || (secType === 'buildup' && ev.intensity > 0.72)) &&
        dtToNext < beatPeriod * 0.65 &&
        rng() < 0.22 * mech.rhythmBurst.frequency
      ) {
        burstRemaining = 4 + Math.floor(rng() * 4);
      } else if (
        mech.trills.enabled &&
        dtToNext < Math.max(0.24, beatPeriod * 0.52) &&
        (role === 'synth_seq' || role === 'hihat' || ev.intensity > 0.52) &&
        rng() < 0.15 * mech.trills.frequency * (0.5 + complexity * 0.7)
      ) {
        trillRemaining = 4 + Math.floor(rng() * 3);
        const oppositeAnchor = twoThumbMode
          ? isLeftThumb(currentLane)
            ? rightZoneMin
            : leftZoneMax
          : -1;
        const alt =
          twoThumbMode && oppositeAnchor >= 0 && isLaneFreeAt(oppositeAnchor, ev.time)
            ? oppositeAnchor
            : currentLane + 1 < laneCount && isLaneFreeAt(currentLane + 1, ev.time)
              ? currentLane + 1
              : currentLane - 1 >= 0
                ? currentLane - 1
                : (currentLane + 2) % laneCount;
        trillLanes = [currentLane, alt];
        trillFlip = 0;
      } else if (
        mech.streams.enabled &&
        dtToNext < Math.max(0.29, beatPeriod * 0.62) &&
        (role === 'melody' ||
          role === 'synth_seq' ||
          secType === 'chorus' ||
          secType === 'drop' ||
          secType === 'buildup') &&
        rng() < (role === 'synth_seq' || role === 'melody' ? 0.22 : 0.15) * mech.streams.frequency
      ) {
        streamRemaining = Math.min(laneCount + 2, 4 + Math.floor(rng() * 4));
        const pDeltaHint = ev.melodicStep ?? 0;
        streamDir =
          pDeltaHint > 0 && currentLane < laneCount - 1
            ? 1
            : pDeltaHint < 0 && currentLane > 0
              ? -1
              : currentLane <= 1
                ? 1
                : currentLane >= laneCount - 2
                  ? -1
                  : rng() < 0.5
                    ? 1
                    : -1;
      }
    }

    if (patternStepsLeft <= 0) {
      const r = rng();
      if (secType === 'calm' || secType === 'breakdown' || config.difficulty === 'easy') {
        patternMode = r < 0.72 ? 'walk' : 'anchor';
        patternStepsLeft = 4 + Math.floor(rng() * 4);
      } else if (secType === 'drop' || secType === 'chorus') {
        if (r < 0.24) patternMode = 'walk';
        else if (r < 0.56) patternMode = 'zigzag';
        else if (r < 0.78) patternMode = 'burst';
        else patternMode = 'anchor';
        patternStepsLeft = 3 + Math.floor(rng() * 5);
      } else {
        if (r < 0.42) patternMode = 'walk';
        else if (r < 0.72) patternMode = 'zigzag';
        else if (r < 0.88) patternMode = 'anchor';
        else patternMode = 'burst';
        patternStepsLeft = 3 + Math.floor(rng() * 5);
      }
      if (rng() < 0.45) stepDir = stepDir === 1 ? -1 : 1;
    }
    patternStepsLeft--;

    let nextLane = currentLane;
    let patternTag: LevelNote['patternTag'] = 'normal';

    if (trillRemaining > 0) {
      nextLane = trillLanes[trillFlip % 2];
      trillFlip++;
      trillRemaining--;
      patternTag = 'trill';
    } else if (streamRemaining > 0) {
      let cand = currentLane + streamDir;
      if (cand >= laneCount || cand < 0) {
        streamDir = streamDir === 1 ? -1 : 1;
        cand = currentLane + streamDir;
      }
      nextLane = Math.max(0, Math.min(laneCount - 1, cand));
      streamRemaining--;
      patternTag = 'stream';
    } else if (burstRemaining > 0) {
      const half = Math.floor(laneCount / 2);
      nextLane =
        currentLane < half
          ? half + Math.floor(rng() * (laneCount - half))
          : Math.floor(rng() * half);
      burstRemaining--;
      patternTag = 'burst';
    } else {
      const isExpressiveMelodic =
        role === 'vocal' ||
        role === 'melody' ||
        role === 'harmony' ||
        role === 'synth_seq' ||
        role === 'bassline';

      const pDelta =
        ev.melodicStep ??
        (ev.pitchClass !== undefined && lastPitchClass !== undefined
          ? signedPitchDelta(lastPitchClass, ev.pitchClass)
          : undefined);

      // Pitch-contour driven lane placement for vocal, melody, harmony & synth sequences
      if (isExpressiveMelodic && pDelta !== undefined && rng() > randomness * 0.3) {
        if (pDelta >= 1) {
          stepDir = 1;
          const jump = pDelta >= 5 && complexity > 0.5 && config.difficulty !== 'easy' ? 2 : 1;
          nextLane = Math.min(laneCount - 1, currentLane + jump);
          if (nextLane === currentLane) nextLane = Math.max(0, currentLane - 1);
        } else if (pDelta <= -1) {
          stepDir = -1;
          const jump = pDelta <= -5 && complexity > 0.5 && config.difficulty !== 'easy' ? 2 : 1;
          nextLane = Math.max(0, currentLane - jump);
          if (nextLane === currentLane) nextLane = Math.min(laneCount - 1, currentLane + 1);
        } else if (role === 'vocal') {
          // Repeated pitch on vocal phrase: gently anchor or alternate adjacent center lane
          const midLow = Math.max(0, Math.floor(laneCount / 2) - 1);
          const midHigh = Math.min(laneCount - 1, midLow + 1);
          nextLane = dtFromPrev < minLaneCooldown * 1.4
            ? currentLane === midLow ? midHigh : midLow
            : currentLane;
        } else {
          nextLane = (currentLane + stepDir + laneCount) % laneCount;
        }
      } else if (role === 'kick' || role === 'bassline') {
        // Kicks & Basslines ground in inner lanes for rhythmic physical weight
        const midLeft = Math.max(0, Math.floor(laneCount / 2) - 1);
        const midRight = Math.min(laneCount - 1, midLeft + 1);
        nextLane = currentLane === midLeft ? midRight : midLeft;
      } else if (role === 'hihat') {
        // Hi-hats sparkle along outer lanes
        nextLane = currentLane < laneCount / 2 ? laneCount - 1 : 0;
      } else if (role === 'snare' || role === 'clap') {
        nextLane = (currentLane + stepDir + laneCount) % laneCount;
      } else if (rng() < randomness * 0.55) {
        const maxJump =
          config.difficulty === 'easy'
            ? 1
            : dtFromPrev < 0.22 && complexity < 0.65
              ? 2
              : Math.max(3, Math.ceil(laneCount / 2));
        const validChoices: number[] = [];
        for (let l = 0; l < laneCount; l++) {
          if (l === currentLane && dtFromPrev < minLaneCooldown * 1.15) continue;
          if (Math.abs(l - currentLane) <= maxJump && isLaneFreeAt(l, ev.time)) {
            validChoices.push(l);
          }
        }
        if (validChoices.length > 0) {
          nextLane = validChoices[Math.floor(rng() * validChoices.length)];
        } else {
          nextLane = (currentLane + 1) % laneCount;
        }
      } else {
        if (patternMode === 'walk') {
          let cand = currentLane + stepDir;
          if (cand >= laneCount || cand < 0) {
            stepDir = stepDir === 1 ? -1 : 1;
            cand = currentLane + stepDir;
          }
          nextLane = Math.max(0, Math.min(laneCount - 1, cand));
        } else if (patternMode === 'zigzag') {
          const step = Math.max(2, Math.floor(laneCount / 2));
          nextLane = (currentLane + step) % laneCount;
        } else if (patternMode === 'anchor') {
          nextLane = i % 2 === 0 ? currentLane : (currentLane + stepDir + laneCount) % laneCount;
        } else {
          const half = Math.floor(laneCount / 2);
          nextLane =
            currentLane < half
              ? half + Math.floor(rng() * (laneCount - half))
              : Math.floor(rng() * half);
        }
      }
    }

    if (ev.pitchClass !== undefined) {
      lastPitchClass = ev.pitchClass;
    }

    if (twoThumbMode && dtFromPrev < 0.24) {
      // Avoid uncomfortable wide same-thumb jumps during rapid passages
      const sameSideLeft = isLeftThumb(currentLane) && isLeftThumb(nextLane);
      const sameSideRight = isRightThumb(currentLane) && isRightThumb(nextLane);
      if ((sameSideLeft || sameSideRight) && Math.abs(nextLane - currentLane) >= 2) {
        const oppStart = isLeftThumb(currentLane) ? rightZoneMin : 0;
        const oppEnd = isLeftThumb(currentLane) ? laneCount - 1 : leftZoneMax;
        let switched = -1;
        for (let l = oppStart; l <= oppEnd; l++) {
          if (isLaneFreeAt(l, ev.time)) {
            switched = l;
            break;
          }
        }
        if (switched >= 0) {
          nextLane = switched;
        } else {
          const stepCloser = currentLane + Math.sign(nextLane - currentLane);
          if (isLaneFreeAt(stepCloser, ev.time)) nextLane = stepCloser;
        }
      }
    }

    if (!isLaneFreeAt(nextLane, ev.time)) {
      let foundAlt = -1;
      for (let offset = 1; offset < laneCount; offset++) {
        const alt = (nextLane + offset) % laneCount;
        if (isLaneFreeAt(alt, ev.time)) {
          foundAlt = alt;
          break;
        }
      }
      if (foundAlt === -1) continue;
      nextLane = foundAlt;
    }

    const chosenLane = nextLane;
    currentLane = chosenLane;

    // Decide expressive NoteKind (Slide, Hold, Flick, Tap) aligned to musical content
    const energyFrame = getEnergyAt(ev.time, profile.energyTimeline);
    let noteKind: LevelNote['kind'] = 'tap';
    let durationSec: number | undefined;
    let flickDir: FlickDirection | undefined;
    let slidePath: SlideWaypoint[] | undefined;

    const isMelodicOrVocal =
      role === 'vocal' || role === 'melody' || role === 'harmony' || role === 'bassline';
    const hasMeasuredSustain = (ev.duration ?? 0) >= 0.34;
    const freeSpaceAhead = Math.min(2.2, dtToNext * 1.65);

    // 1. Slide Notes: follow legato pitch contour transitions or sweeping chorus/melodic glides
    const canSlide =
      mech.slideNotes.enabled &&
      patternTag === 'normal' &&
      ev.time - lastSlideTime > Math.max(1.2, beatPeriod * 2.0) &&
      maxEndTime - ev.time > 0.9;

    const pitchMoveSlideHint =
      isMelodicOrVocal && ev.melodicStep !== undefined && Math.abs(ev.melodicStep) >= 3;

    if (
      canSlide &&
      (pitchMoveSlideHint || isMelodicOrVocal || secType === 'chorus') &&
      rng() <
        0.16 *
          mech.slideNotes.frequency *
          (pitchMoveSlideHint ? 1.75 : isMelodicOrVocal ? 1.3 : 0.85)
    ) {
      const maxSlideSpan = twoThumbMode
        ? Math.max(1, Math.floor(laneCount / 2) - 1)
        : laneCount >= 6
          ? 3
          : 2;
      const span = Math.min(
        maxSlideSpan,
        Math.max(1, 1 + Math.floor(rng() * (complexity > 0.55 ? 2.4 : 1.4))),
      );
      const contourDir =
        ev.melodicStep && ev.melodicStep !== 0 ? Math.sign(ev.melodicStep) : 0;
      const dir =
        contourDir > 0 && chosenLane + span < laneCount
          ? 1
          : contourDir < 0 && chosenLane - span >= 0
            ? -1
            : chosenLane + span < laneCount
              ? 1
              : chosenLane - span >= 0
                ? -1
                : chosenLane < laneCount - 1
                  ? 1
                  : -1;
      let actualEnd = Math.max(0, Math.min(laneCount - 1, chosenLane + dir * span));
      if (twoThumbMode) {
        // Keep slide strictly inside ergonomic single-thumb reach (never force a full crossover)
        if (isLeftThumb(chosenLane) && actualEnd > Math.floor(laneCount / 2)) {
          actualEnd = Math.max(0, leftZoneMax);
        } else if (isRightThumb(chosenLane) && actualEnd < Math.floor((laneCount - 1) / 2)) {
          actualEnd = Math.min(laneCount - 1, rightZoneMin);
        }
      }
      if (actualEnd !== chosenLane) {
        const targetSlideDur = ev.duration
          ? clampRange(ev.duration * 0.85, 0.4, 1.05)
          : clampRange(beatPeriod * (rng() < 0.5 ? 0.85 : 1.15), 0.38, 1.05);
        const minL = Math.min(chosenLane, actualEnd);
        const maxL = Math.max(chosenLane, actualEnd);
        let pathClear = true;
        for (let l = minL; l <= maxL; l++) {
          if (ev.time < laneBusyUntil[l]) {
            pathClear = false;
            break;
          }
        }
        if (pathClear) {
          noteKind = 'slide';
          durationSec = targetSlideDur;
          const waypoints: SlideWaypoint[] = [{ timeOffset: 0, lane: chosenLane }];
          const steps = Math.abs(actualEnd - chosenLane);
          if (steps >= 2) {
            const midLane = chosenLane + Math.sign(actualEnd - chosenLane);
            waypoints.push({ timeOffset: targetSlideDur * 0.5, lane: midLane });
          }
          waypoints.push({ timeOffset: targetSlideDur, lane: actualEnd });
          slidePath = waypoints;
          for (let l = minL; l <= maxL; l++) {
            laneBusyUntil[l] = ev.time + targetSlideDur + 0.14;
            laneLastUsed[l] = ev.time + targetSlideDur;
          }
          lastSlideTime = ev.time;
          currentLane = actualEnd;
        }
      }
    }

    // 2. Hold Notes: strongly driven by actual measured vocal/harmonic/bassline sustain duration!
    if (
      noteKind === 'tap' &&
      mech.holdNotes.enabled &&
      patternTag === 'normal' &&
      ev.time - lastHoldTime > Math.max(0.85, beatPeriod * 1.4) &&
      maxEndTime - ev.time > 0.85
    ) {
      const sustainedHint =
        hasMeasuredSustain ||
        role === 'vocal' ||
        role === 'harmony' ||
        (energyFrame.harmonicStrength ?? 0.45) > 0.5 ||
        secType === 'calm' ||
        secType === 'buildup';
      const holdChance =
        (hasMeasuredSustain ? 0.58 : 0.16) *
        mech.holdNotes.frequency *
        (sustainedHint ? 1.25 : 0.78) *
        (0.75 + 0.25 * density);

      if (rng() < holdChance) {
        const rawHoldDur = ev.duration
          ? Math.min(ev.duration, Math.max(0.42, freeSpaceAhead + 0.35))
          : beatPeriod * (rng() < 0.65 ? 1.0 : 1.5);
        const holdDur = clampRange(
          rawHoldDur,
          0.38,
          Math.max(0.65, Math.min(1.5, freeSpaceAhead + 0.45)),
        );
        if (holdDur >= 0.38) {
          noteKind = 'hold';
          durationSec = holdDur;
          laneBusyUntil[chosenLane] = ev.time + holdDur + 0.14;
          laneLastUsed[chosenLane] = ev.time + holdDur;
          lastHoldTime = ev.time;
        }
      }
    }

    // 3. Flick Notes: crisp snares, drops, sharp high-energy accents
    if (
      noteKind === 'tap' &&
      mech.flickNotes.enabled &&
      patternTag !== 'trill' &&
      ev.time - lastFlickTime > Math.max(0.65, beatPeriod * 1.15) &&
      (role === 'drop' ||
        role === 'clap' ||
        role === 'snare' ||
        role === 'hihat' ||
        ev.intensity > 0.62)
    ) {
      const flickChance =
        0.16 *
        mech.flickNotes.frequency *
        (role === 'drop'
          ? 1.65
          : role === 'clap'
            ? 1.32
            : role === 'snare'
              ? 1.28
              : secType === 'drop' || secType === 'chorus'
                ? 1.22
                : 0.8);
      if (rng() < flickChance) {
        noteKind = 'flick';
        if (chosenLane === 0) flickDir = rng() < 0.5 ? 'right' : 'up';
        else if (chosenLane === laneCount - 1) flickDir = rng() < 0.5 ? 'left' : 'up';
        else {
          const rDir = rng();
          flickDir = rDir < 0.36 ? 'left' : rDir < 0.72 ? 'right' : 'up';
        }
        lastFlickTime = ev.time;
      }
    }

    if (noteKind === 'tap' || noteKind === 'flick') {
      laneLastUsed[chosenLane] = ev.time;
    }

    // 4. Double Notes / Chords: harmonic progression impacts, drops & strong downbeats
    const allowChords = mech.doubleNotes.enabled && complexity >= 0.28;
    const isChordEligible =
      noteKind !== 'slide' &&
      (role === 'drop' ||
        role === 'harmony' ||
        ((role === 'beat' || role === 'kick' || role === 'snare') &&
          ev.intensity > 0.64 &&
          ev.confidence > 0.58));

    const diffChordMult =
      config.difficulty === 'easy'
        ? 0.22
        : config.difficulty === 'normal'
          ? 0.58
          : config.difficulty === 'hard'
            ? 0.92
            : config.difficulty === 'expert'
              ? 1.18
              : config.difficulty === 'master'
                ? 1.38
                : 0.85;

    const chordRoll =
      role === 'drop'
        ? 0.92
        : (role === 'harmony' ? 0.26 : 0.16) *
          mech.doubleNotes.frequency *
          diffChordMult *
          (secType === 'drop' || secType === 'chorus' ? 1.35 : 0.85);

    const shouldChord =
      allowChords &&
      isChordEligible &&
      ev.time - lastChordTime > 0.5 &&
      dtFromPrev > minGlobalGap * 1.25 &&
      rng() < chordRoll;

    const physicalMax = twoThumbMode
      ? 2
      : laneCount <= 4
        ? 2
        : Math.min(mech.doubleNotes.maxSimultaneous, laneCount >= 6 ? 4 : 3);
    let targetChordSize = 1;
    if (shouldChord) {
      if (physicalMax >= 4 && role === 'drop' && ev.intensity > 0.84 && rng() < 0.45) {
        targetChordSize = 4;
      } else if (physicalMax >= 3 && (role === 'drop' || ev.intensity > 0.76) && rng() < 0.55) {
        targetChordSize = 3;
      } else {
        targetChordSize = 2;
      }
      lastChordTime = ev.time;
    }

    rawNotes.push({
      id: noteId++,
      time: ev.time,
      lane: chosenLane,
      kind: noteKind,
      durationSec,
      flickDir,
      slidePath,
      intensity: ev.intensity,
      isChord: targetChordSize > 1,
      chordGroupSize: targetChordSize > 1 ? targetChordSize : undefined,
      patternTag: targetChordSize > 1 ? 'chord' : patternTag,
      sectionType: secType,
      challengeSection: isChallengeSection,
      eventType: ev.type,
      musicalRole: role,
      approachDurationSec,
      pitchClass: ev.pitchClass,
      hit: false,
      missed: false,
    });

    if (targetChordSize > 1) {
      const usedInChord = new Set<number>([chosenLane]);
      const half = Math.floor(laneCount / 2);
      const candidateOrder: number[] = [];
      for (let l = 0; l < laneCount; l++) {
        if (l === chosenLane) continue;
        if (twoThumbMode) {
          // Ensure chord partner is playable with the opposite thumb
          if (isLeftThumb(chosenLane) && !isRightThumb(l)) continue;
          if (isRightThumb(chosenLane) && !isLeftThumb(l)) continue;
        }
        candidateOrder.push(l);
      }
      candidateOrder.sort((a, b) => {
        const aOpp = (chosenLane < half) !== (a < half) ? 0 : 1;
        const bOpp = (chosenLane < half) !== (b < half) ? 0 : 1;
        if (aOpp !== bOpp) return aOpp - bOpp;
        return rng() - 0.5;
      });

      for (const partner of candidateOrder) {
        if (usedInChord.size >= targetChordSize) break;
        if (!isLaneFreeAt(partner, ev.time)) continue;
        if (targetChordSize <= 2 && Math.abs(partner - chosenLane) === 1 && laneCount >= 4) continue;
        usedInChord.add(partner);
        laneLastUsed[partner] = ev.time;
        rawNotes.push({
          id: noteId++,
          time: ev.time,
          lane: partner,
          kind: 'tap',
          intensity: ev.intensity,
          isChord: true,
          chordGroupSize: targetChordSize,
          patternTag: 'chord',
          sectionType: secType,
          challengeSection: isChallengeSection,
          eventType: ev.type,
          musicalRole: role,
          approachDurationSec,
          pitchClass: ev.pitchClass,
          hit: false,
          missed: false,
        });
      }
    }
  }

  // Step 3: Strict Final Ergonomic Validation Pass (sorted, no silences, valid lanes, zero overlaps)
  const validatedNotes: LevelNote[] = [];
  rawNotes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  const lastTimePerLane = new Array<number>(laneCount).fill(-10);
  const busyUntilPerLane = new Array<number>(laneCount).fill(-10);
  let leftThumbBusyUntil = -10;
  let rightThumbBusyUntil = -10;
  const maxSimultaneousAllowed = twoThumbMode ? 2 : Math.min(4, laneCount);

  for (const n of rawNotes) {
    if (n.lane < 0 || n.lane >= laneCount) continue;
    if (isInSilence(n.time, profile)) continue;
    if (n.time - lastTimePerLane[n.lane] < 0.095) continue;
    if (n.time < busyUntilPerLane[n.lane]) continue;

    if (twoThumbMode) {
      if (isLeftThumb(n.lane) && n.time < leftThumbBusyUntil) continue;
      if (isRightThumb(n.lane) && n.time < rightThumbBusyUntil) continue;
    }

    const simultaneous = validatedNotes.filter((v) => Math.abs(v.time - n.time) < 0.04);
    if (simultaneous.length >= maxSimultaneousAllowed) continue;

    if (twoThumbMode && simultaneous.length === 1) {
      const existing = simultaneous[0];
      const bothLeft = isLeftThumb(existing.lane) && isLeftThumb(n.lane);
      const bothRight = isRightThumb(existing.lane) && isRightThumb(n.lane);
      if (bothLeft || bothRight || existing.lane === n.lane) continue;
    }

    const endDur = n.durationSec ?? 0;
    lastTimePerLane[n.lane] = n.time + endDur;
    busyUntilPerLane[n.lane] = n.time + endDur + (endDur > 0 ? 0.1 : 0);
    if (twoThumbMode && endDur > 0) {
      if (isLeftThumb(n.lane)) leftThumbBusyUntil = Math.max(leftThumbBusyUntil, n.time + endDur + 0.06);
      else if (isRightThumb(n.lane)) rightThumbBusyUntil = Math.max(rightThumbBusyUntil, n.time + endDur + 0.06);
    }
    if (n.kind === 'slide' && n.slidePath) {
      for (const wp of n.slidePath) {
        lastTimePerLane[wp.lane] = Math.max(lastTimePerLane[wp.lane], n.time + endDur);
        busyUntilPerLane[wp.lane] = Math.max(busyUntilPerLane[wp.lane], n.time + endDur + 0.1);
        if (twoThumbMode && endDur > 0) {
          if (isLeftThumb(wp.lane)) leftThumbBusyUntil = Math.max(leftThumbBusyUntil, n.time + endDur + 0.06);
          else if (isRightThumb(wp.lane)) rightThumbBusyUntil = Math.max(rightThumbBusyUntil, n.time + endDur + 0.06);
        }
      }
    }
    validatedNotes.push(n);
  }

  const holdsCount = validatedNotes.filter((n) => n.kind === 'hold').length;
  const flicksCount = validatedNotes.filter((n) => n.kind === 'flick').length;
  const slidesCount = validatedNotes.filter((n) => n.kind === 'slide').length;
  const streamsCount = validatedNotes.filter((n) => n.patternTag === 'stream').length;
  const trillsCount = validatedNotes.filter((n) => n.patternTag === 'trill').length;
  const burstsCount = validatedNotes.filter((n) => n.patternTag === 'burst').length;
  const challengeNotesCount = validatedNotes.filter((n) => n.challengeSection).length;

  let chordsCount = 0;
  let lastC = -10;
  for (const n of validatedNotes) {
    if (n.isChord && Math.abs(n.time - lastC) > 0.04) {
      chordsCount++;
      lastC = n.time;
    }
  }

  const averageNps =
    duration > 0 ? Number((validatedNotes.length / Math.max(1, duration)).toFixed(2)) : 0;

  return {
    seed: config.seed,
    difficulty: config.difficulty,
    laneCount,
    maxMisses,
    bpm: profile.bpm,
    notes: validatedNotes,
    noteSpeed,
    hitWindowSec: Math.max(0.055, Math.min(0.24, config.hitWindowMs / 1000)),
    precisionStrictness: mech.precisionChallenge.strictness,
    stats: {
      totalNotes: validatedNotes.length,
      chordsCount,
      holdsCount,
      flicksCount,
      slidesCount,
      streamsCount,
      trillsCount,
      burstsCount,
      challengeNotesCount,
      averageNps,
    },
  };
}

function clampRange(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
