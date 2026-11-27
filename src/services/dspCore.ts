import type {
  EnergyFrame,
  FusionWeights,
  MusicProfile,
  MusicalRole,
  MusicalSection,
  MusicalSectionType,
  OnsetEvent,
  SectionTransitionEvent,
  SilenceRange,
  SpectralBand6,
  SubdivisionBeat,
  TempoSegment,
} from '../types/game';
import { fuseMusicalEvents, DEFAULT_FUSION_WEIGHTS } from './eventFusion';

export const ANALYSIS_VERSION = 4;

const HPSS_BAND_COUNT = 48;
const PITCH_MIDI_MIN = 36; // C2 (~65.4 Hz)
const PITCH_MIDI_MAX = 83; // B5 (~987.8 Hz)
const PITCH_COUNT = PITCH_MIDI_MAX - PITCH_MIDI_MIN + 1;

/**
 * In-place iterative Cooley-Tukey Radix-2 FFT.
 * `real` and `imag` must have power-of-2 length.
 */
function fftInPlace(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      const tr = real[i];
      real[i] = real[j];
      real[j] = tr;
      const ti = imag[i];
      imag[i] = imag[j];
      imag[j] = ti;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const angleStep = (-2 * Math.PI) / size;
    const wStepReal = Math.cos(angleStep);
    const wStepImag = Math.sin(angleStep);

    for (let start = 0; start < n; start += size) {
      let wReal = 1;
      let wImag = 0;
      for (let k = 0; k < half; k++) {
        const idxEven = start + k;
        const idxOdd = idxEven + half;

        const tReal = wReal * real[idxOdd] - wImag * imag[idxOdd];
        const tImag = wReal * imag[idxOdd] + wImag * real[idxOdd];

        real[idxOdd] = real[idxEven] - tReal;
        imag[idxOdd] = imag[idxEven] - tImag;
        real[idxEven] += tReal;
        imag[idxEven] += tImag;

        const nextWReal = wReal * wStepReal - wImag * wStepImag;
        wImag = wReal * wStepImag + wImag * wStepReal;
        wReal = nextWReal;
      }
    }
  }
}

function buildHannWindow(size: number): Float32Array {
  const win = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return win;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function normalizeSeriesRobust(arr: Float32Array, percentile = 0.995): number {
  const n = arr.length;
  if (n === 0) return 1;
  const stride = Math.max(1, Math.floor(n / 2048));
  const samples: number[] = [];
  for (let i = 0; i < n; i += stride) {
    samples.push(arr[i]);
  }
  samples.sort((a, b) => a - b);
  const idx = Math.min(samples.length - 1, Math.max(0, Math.floor(samples.length * percentile)));
  const ref = Math.max(1e-6, samples[idx]);
  for (let i = 0; i < n; i++) {
    arr[i] = clamp01(arr[i] / ref);
  }
  return ref;
}

function movingAverage(src: Float32Array, radius: number): Float32Array {
  const n = src.length;
  const out = new Float32Array(n);
  if (n === 0) return out;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i] + src[i];
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - radius);
    const b = Math.min(n - 1, i + radius);
    out[i] = (prefix[b + 1] - prefix[a]) / (b - a + 1);
  }
  return out;
}

/** Fast allocation-free insertion-sort median for tiny sliding windows (<= 15 items) */
function medianSmall(buf: Float32Array, len: number): number {
  for (let i = 1; i < len; i++) {
    const key = buf[i];
    let j = i - 1;
    while (j >= 0 && buf[j] > key) {
      buf[j + 1] = buf[j];
      j--;
    }
    buf[j + 1] = key;
  }
  return buf[len >> 1];
}

function pickAdaptivePeaks(
  envelope: Float32Array,
  energyGate: Float32Array,
  silenceThresh: number,
  frameDt: number,
  winSec: number,
  minGapSec: number,
  stdMult: number,
  minFloorRatio: number,
): Array<{ frame: number; strength: number }> {
  const n = envelope.length;
  const winRadius = Math.max(4, Math.round(winSec / frameDt));
  const minGapFrames = Math.max(2, Math.round(minGapSec / frameDt));

  let maxVal = 1e-6;
  for (let i = 0; i < n; i++) {
    if (envelope[i] > maxVal) maxVal = envelope[i];
  }

  const peaks: Array<{ frame: number; strength: number }> = [];
  let lastFrame = -minGapFrames;

  for (let f = 2; f < n - 2; f++) {
    const cur = envelope[f];
    if (cur <= 0) continue;
    if (
      cur < envelope[f - 1] ||
      cur < envelope[f + 1] ||
      cur < envelope[f - 2] * 0.96 ||
      cur < envelope[f + 2] * 0.96
    ) {
      continue;
    }
    if (energyGate[f] < silenceThresh) continue;

    const wStart = Math.max(0, f - winRadius);
    const wEnd = Math.min(n - 1, f + winRadius);
    const wLen = wEnd - wStart + 1;

    let sum = 0;
    for (let k = wStart; k <= wEnd; k++) sum += envelope[k];
    const mean = sum / wLen;

    let varSum = 0;
    for (let k = wStart; k <= wEnd; k++) {
      const d = envelope[k] - mean;
      varSum += d * d;
    }
    const std = Math.sqrt(varSum / wLen);

    const thresh = mean + std * stdMult + maxVal * minFloorRatio;
    if (cur <= thresh) continue;

    if (f - lastFrame < minGapFrames) {
      const prev = peaks[peaks.length - 1];
      if (prev && cur > envelope[prev.frame] * 1.18) {
        peaks[peaks.length - 1] = {
          frame: f,
          strength: clamp01(cur / (maxVal * 0.62)),
        };
        lastFrame = f;
      }
      continue;
    }

    lastFrame = f;
    peaks.push({
      frame: f,
      strength: clamp01(cur / (maxVal * 0.62)),
    });
  }

  return peaks;
}

function estimateWindowTempo(
  flux: Float32Array,
  startFrame: number,
  endFrame: number,
  frameDt: number,
  priorBpm?: number,
): { bpm: number; confidence: number } {
  const minBpm = 62;
  const maxBpm = 198;
  const minLag = Math.max(4, Math.floor(60 / maxBpm / frameDt));
  const maxLag = Math.min(endFrame - startFrame - 4, Math.ceil(60 / minBpm / frameDt));
  if (maxLag <= minLag) {
    return { bpm: priorBpm ?? 120, confidence: 0.2 };
  }

  const acf = new Float64Array(maxLag + 1);
  let meanFlux = 0;
  const len = endFrame - startFrame;
  for (let f = startFrame; f < endFrame; f++) meanFlux += flux[f];
  meanFlux /= Math.max(1, len);

  let energy0 = 0;
  for (let f = startFrame; f < endFrame; f += 2) {
    const v = Math.max(0, flux[f] - meanFlux * 0.4);
    energy0 += v * v;
  }
  if (energy0 < 1e-6) {
    return { bpm: priorBpm ?? 120, confidence: 0.1 };
  }

  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    const limit = endFrame - lag;
    for (let f = startFrame; f < limit; f += 2) {
      const a = Math.max(0, flux[f] - meanFlux * 0.4);
      const b = Math.max(0, flux[f + lag] - meanFlux * 0.4);
      score += a * b;
    }
    acf[lag] = score / energy0;
  }

  let bestLag = Math.round(60 / 120 / frameDt);
  let bestWeighted = -1;
  let secondWeighted = -1;

  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = 60 / (lag * frameDt);
    const gaussianPrior = Math.exp(-Math.pow((bpm - 118) / 58, 2) * 0.5);
    const continuityPrior = priorBpm
      ? Math.exp(-Math.pow((bpm - priorBpm) / 22, 2) * 0.5) * 0.18
      : 0;

    let comb = acf[lag];
    const doubleLag = lag * 2;
    if (doubleLag <= maxLag) comb += acf[doubleLag] * 0.36;
    const tripleLag = lag * 3;
    if (tripleLag <= maxLag) comb += acf[tripleLag] * 0.14;
    const halfLag = Math.round(lag / 2);
    if (halfLag >= minLag) comb += acf[halfLag] * 0.2;

    const weighted = comb * (0.78 + 0.22 * gaussianPrior + continuityPrior);
    if (weighted > bestWeighted) {
      secondWeighted = bestWeighted;
      bestWeighted = weighted;
      bestLag = lag;
    } else if (weighted > secondWeighted) {
      secondWeighted = weighted;
    }
  }

  // Octave / half-time vs double-time disambiguation
  let chosenLag = bestLag;
  let refinedLag = chosenLag;
  if (chosenLag > minLag && chosenLag < maxLag) {
    const y0 = acf[chosenLag - 1];
    const y1 = acf[chosenLag];
    const y2 = acf[chosenLag + 1];
    const denom = y0 - 2 * y1 + y2;
    if (denom < -1e-9) {
      const delta = Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / denom));
      refinedLag = chosenLag + delta;
    }
  }

  let candidateBpm = 60 / (refinedLag * frameDt);
  if (candidateBpm < 74 && Math.round(chosenLag / 2) >= minLag) {
    const halfLag = Math.round(chosenLag / 2);
    if (acf[halfLag] >= acf[chosenLag] * 0.72) {
      chosenLag = halfLag;
      candidateBpm = 60 / (chosenLag * frameDt);
    }
  } else if (candidateBpm > 170 && chosenLag * 2 <= maxLag) {
    const doubleLag = chosenLag * 2;
    if (acf[doubleLag] >= acf[chosenLag] * 0.78) {
      chosenLag = doubleLag;
      candidateBpm = 60 / (chosenLag * frameDt);
    }
  }

  const bpm = Number(Math.max(60, Math.min(198, candidateBpm)).toFixed(1));
  const rawConf = clamp01(acf[chosenLag] * 1.9);
  const peakContrast =
    bestWeighted > 0
      ? clamp01(((bestWeighted - Math.max(0, secondWeighted)) / bestWeighted) * 3.0)
      : 0.3;
  const confidence = Number(clamp01(rawConf * 0.72 + peakContrast * 0.28).toFixed(3));

  return { bpm, confidence };
}

/**
 * Estimate forward sustained phrase length from an onset frame using HPSS harmonic energy & pitch continuity.
 */
function measureHarmonicSustain(
  startFrame: number,
  frameDt: number,
  harmEnvelope: Float32Array,
  pitchSalience: Float32Array,
  dominantMidi: Uint8Array,
  maxDurSec = 1.65,
): number {
  const n = harmEnvelope.length;
  const maxFrames = Math.min(n - 1 - startFrame, Math.round(maxDurSec / frameDt));
  if (maxFrames < 4) return 0;

  const peakEnergy = Math.max(harmEnvelope[startFrame], harmEnvelope[Math.min(n - 1, startFrame + 1)]);
  if (peakEnergy < 0.14) return 0;
  const holdThreshold = peakEnergy * 0.44;
  const startMidi = dominantMidi[startFrame];

  let endOffset = 0;
  let softDipFrames = 0;
  for (let off = 1; off <= maxFrames; off++) {
    const idx = startFrame + off;
    const e = harmEnvelope[idx];
    const pDiff = Math.abs(dominantMidi[idx] - startMidi);
    const pitchHeld = pitchSalience[idx] < 0.2 || pDiff <= 2;

    if (e >= holdThreshold && pitchHeld) {
      endOffset = off;
      softDipFrames = 0;
    } else {
      softDipFrames++;
      if (softDipFrames >= 3) break;
    }
  }

  const dur = endOffset * frameDt;
  return dur >= 0.3 ? Number(dur.toFixed(3)) : 0;
}

/**
 * Pure TypeScript Multi-Layer DSP Analyzer v3:
 * - Window-centered STFT timestamps (eliminates ~23ms half-window early bias)
 * - 48-Band STFT-Domain 2D HPSS (Harmonic-Percussive Source Separation via temporal/spectral median + Wiener soft mask)
 * - Harmonic-Comb Pitch Salience & MIDI Contour Tracking (C2..B5, 48 semitones)
 * - Separated Percussion (Kick / Snare / HiHat) vs Harmonic (Bassline / Vocal-Formant / Melody / Harmony / Synth-Seq)
 * - Tempogram & Non-Drifting Phase-Locked Beat Grid
 */
export function analyzePcmData(
  mono: Float32Array,
  sampleRate: number,
  duration: number,
  fusionWeights: FusionWeights = DEFAULT_FUSION_WEIGHTS,
): MusicProfile {
  const length = mono.length;
  const fftSize = 2048;
  const hopSize = duration > 420 ? 1024 : 512;
  const frameCount = Math.max(1, Math.floor((length - fftSize) / hopSize));
  const frameDt = hopSize / sampleRate;
  const halfWindowSec = (fftSize * 0.5) / sampleRate;

  const frameTime = (f: number): number =>
    Math.min(duration, Math.max(0, f * frameDt + halfWindowSec));
  const timeToFrame = (t: number): number =>
    Math.min(frameCount - 1, Math.max(0, Math.round((t - halfWindowSec) / frameDt)));

  const hann = buildHannWindow(fftSize);
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);
  const halfBins = fftSize >> 1;
  const magBuf = new Float32Array(halfBins);
  const prevMag = new Float32Array(halfBins);

  const hzPerBin = sampleRate / fftSize;

  // 6-band frequency bin boundaries
  const bSub = Math.max(1, Math.round(65 / hzPerBin));
  const bBass = Math.max(bSub + 1, Math.round(250 / hzPerBin));
  const bLowMid = Math.max(bBass + 1, Math.round(500 / hzPerBin));
  const bMid = Math.max(bLowMid + 1, Math.round(2000 / hzPerBin));
  const bHighMid = Math.max(bMid + 1, Math.round(5500 / hzPerBin));
  const bTreble = Math.min(halfBins - 1, Math.max(bHighMid + 1, Math.round(16000 / hzPerBin)));

  // Precompute 48 log-spaced perceptual bands for 2D HPSS (35 Hz .. 16000 Hz)
  const bandBinStart = new Int32Array(HPSS_BAND_COUNT);
  const bandBinEnd = new Int32Array(HPSS_BAND_COUNT);
  const bandCenterHz = new Float32Array(HPSS_BAND_COUNT);
  const minBandHz = 35;
  const maxBandHz = 16000;
  let bandKickEnd = 0; // <= 220 Hz
  let bandVocalStart = 0; // >= 280 Hz
  let bandVocalEnd = 0; // <= 3400 Hz
  let bandHarmMidEnd = 0; // <= 3800 Hz
  let bandPercMidEnd = 0; // <= 2800 Hz

  for (let b = 0; b < HPSS_BAND_COUNT; b++) {
    const fLo = minBandHz * Math.pow(maxBandHz / minBandHz, b / HPSS_BAND_COUNT);
    const fHi = minBandHz * Math.pow(maxBandHz / minBandHz, (b + 1) / HPSS_BAND_COUNT);
    const fc = Math.sqrt(fLo * fHi);
    bandCenterHz[b] = fc;
    const sBin = Math.max(1, Math.min(bTreble, Math.floor(fLo / hzPerBin)));
    const eBin = Math.max(sBin, Math.min(bTreble, Math.ceil(fHi / hzPerBin)));
    bandBinStart[b] = sBin;
    bandBinEnd[b] = eBin;
    if (fc <= 220) bandKickEnd = b;
    if (fc < 280) bandVocalStart = b + 1;
    if (fc <= 3400) bandVocalEnd = b;
    if (fc <= 3800) bandHarmMidEnd = b;
    if (fc <= 2800) bandPercMidEnd = b;
  }

  // Chromagram bin->pitch-class lookup (65 Hz .. 2200 Hz)
  const chromaStartBin = Math.max(1, Math.round(65 / hzPerBin));
  const chromaEndBin = Math.min(halfBins - 1, Math.round(2200 / hzPerBin));
  const binPitchClass = new Int8Array(halfBins).fill(-1);
  for (let bin = chromaStartBin; bin <= chromaEndBin; bin++) {
    const freq = bin * hzPerBin;
    const midi = Math.round(69 + 12 * Math.log2(freq / 440));
    binPitchClass[bin] = ((midi % 12) + 12) % 12;
  }

  // Precompute Harmonic-Comb bin indices for MIDI 36..83 (4 partials per candidate f0)
  const combBins = new Int32Array(PITCH_COUNT * 4);
  for (let p = 0; p < PITCH_COUNT; p++) {
    const midi = PITCH_MIDI_MIN + p;
    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    for (let h = 1; h <= 4; h++) {
      const bin = Math.round((f0 * h) / hzPerBin);
      combBins[p * 4 + (h - 1)] = bin >= 1 && bin < bTreble - 1 ? bin : -1;
    }
  }

  // Per-frame spectral descriptors
  const specBands = new Float32Array(frameCount * HPSS_BAND_COUNT);
  const subBassSeries = new Float32Array(frameCount);
  const bassSeries = new Float32Array(frameCount);
  const lowMidSeries = new Float32Array(frameCount);
  const midSeries = new Float32Array(frameCount);
  const highMidSeries = new Float32Array(frameCount);
  const trebleSeries = new Float32Array(frameCount);
  const rmsSeries = new Float32Array(frameCount);
  const totalSeries = new Float32Array(frameCount);

  const centroidSeries = new Float32Array(frameCount);
  const bandwidthSeries = new Float32Array(frameCount);
  const rolloffSeries = new Float32Array(frameCount);
  const flatnessSeries = new Float32Array(frameCount);

  const fluxTotalRaw = new Float32Array(frameCount);
  const chromaFrames = new Float32Array(frameCount * 12);
  const dominantPitch = new Uint8Array(frameCount);
  const dominantMidi = new Uint8Array(frameCount);
  const pitchSalience = new Float32Array(frameCount);
  const harmonicStrength = new Float32Array(frameCount);
  const harmonicChange = new Float32Array(frameCount);
  const vocalPresence = new Float32Array(frameCount);
  const percussiveRatio = new Float32Array(frameCount);

  const logComp = 8.0;
  const maxLogFreq = Math.log2(16000 / 20);
  const chromaTmp = new Float32Array(12);
  const prevSmoothChroma = new Float32Array(12);
  const combWeights = [1.0, 0.72, 0.48, 0.3];

  for (let f = 0; f < frameCount; f++) {
    const start = f * hopSize;
    let sumSq = 0;
    for (let i = 0; i < fftSize; i++) {
      const s = mono[start + i];
      sumSq += s * s;
      real[i] = s * hann[i];
      imag[i] = 0;
    }
    rmsSeries[f] = Math.sqrt(sumSq / fftSize);

    fftInPlace(real, imag);

    let eSub = 0;
    let eBass = 0;
    let eLowMid = 0;
    let eMid = 0;
    let eHighMid = 0;
    let eTreble = 0;
    let fAll = 0;

    let magSumAll = 0;
    let weightedFreqSum = 0;
    let logMagSum = 0;
    let arithMagSum = 0;
    let flatnessCount = 0;

    chromaTmp.fill(0);

    for (let bin = 1; bin <= bTreble; bin++) {
      const mag = Math.sqrt(real[bin] * real[bin] + imag[bin] * imag[bin]);
      magBuf[bin] = mag;

      const curLog = Math.log1p(logComp * mag);
      const prevLog = Math.log1p(logComp * prevMag[bin]);
      if (curLog > prevLog) fAll += curLog - prevLog;
      prevMag[bin] = mag;

      const freq = bin * hzPerBin;
      magSumAll += mag;
      weightedFreqSum += mag * freq;

      if (bin >= bBass && bin <= bHighMid) {
        logMagSum += Math.log(mag + 1e-6);
        arithMagSum += mag;
        flatnessCount++;
      }

      const pc = binPitchClass[bin];
      if (pc >= 0) {
        chromaTmp[pc] += mag * mag;
      }

      if (bin <= bSub) eSub += mag;
      else if (bin <= bBass) eBass += mag;
      else if (bin <= bLowMid) eLowMid += mag;
      else if (bin <= bMid) eMid += mag;
      else if (bin <= bHighMid) eHighMid += mag;
      else eTreble += mag;
    }

    // Populate 48 perceptual spectrogram bands (RMS mag per band)
    const specOffset = f * HPSS_BAND_COUNT;
    for (let b = 0; b < HPSS_BAND_COUNT; b++) {
      const sBin = bandBinStart[b];
      const eBin = bandBinEnd[b];
      let bandSq = 0;
      for (let bin = sBin; bin <= eBin; bin++) {
        const m = magBuf[bin];
        bandSq += m * m;
      }
      specBands[specOffset + b] = Math.sqrt(bandSq / (eBin - sBin + 1));
    }

    // Harmonic-Comb Pitch Salience across C2..B5 (48 MIDI pitches)
    let bestComb = 0;
    let meanComb = 0;
    let bestMidi = 60;
    for (let p = 0; p < PITCH_COUNT; p++) {
      let score = 0;
      for (let h = 0; h < 4; h++) {
        const bCenter = combBins[p * 4 + h];
        if (bCenter < 1) continue;
        // Take local peak over ±1 bin to handle vibrato/detuning cleanly
        const localPeak = Math.max(magBuf[bCenter - 1], magBuf[bCenter], magBuf[bCenter + 1]);
        score += localPeak * combWeights[h];
      }
      meanComb += score;
      if (score > bestComb) {
        bestComb = score;
        bestMidi = PITCH_MIDI_MIN + p;
      }
    }
    meanComb /= PITCH_COUNT;
    const combContrast = meanComb > 1e-6 ? (bestComb / meanComb - 1.25) / 2.75 : 0;
    pitchSalience[f] = clamp01(combContrast);
    dominantMidi[f] = bestMidi;

    const cSub = Math.max(1, bSub);
    const cBass = Math.max(1, bBass - bSub);
    const cLowMid = Math.max(1, bLowMid - bBass);
    const cMid = Math.max(1, bMid - bLowMid);
    const cHighMid = Math.max(1, bHighMid - bMid);
    const cTreble = Math.max(1, bTreble - bHighMid);

    subBassSeries[f] = eSub / cSub;
    bassSeries[f] = eBass / cBass;
    lowMidSeries[f] = eLowMid / cLowMid;
    midSeries[f] = eMid / cMid;
    highMidSeries[f] = eHighMid / cHighMid;
    trebleSeries[f] = eTreble / cTreble;

    totalSeries[f] =
      subBassSeries[f] * 0.14 +
      bassSeries[f] * 0.24 +
      lowMidSeries[f] * 0.18 +
      midSeries[f] * 0.22 +
      highMidSeries[f] * 0.14 +
      trebleSeries[f] * 0.08;

    fluxTotalRaw[f] = fAll / Math.max(1, bTreble);

    if (magSumAll > 1e-6) {
      const centroidHz = Math.max(20, weightedFreqSum / magSumAll);
      centroidSeries[f] = clamp01(Math.log2(centroidHz / 20) / maxLogFreq);

      let bwVar = 0;
      let cumMag = 0;
      const rolloffTarget = magSumAll * 0.85;
      let rolloffHz = 16000;
      let foundRolloff = false;
      for (let bin = 1; bin <= bTreble; bin++) {
        const m = magBuf[bin];
        const freq = bin * hzPerBin;
        const df = freq - centroidHz;
        bwVar += m * df * df;
        cumMag += m;
        if (!foundRolloff && cumMag >= rolloffTarget) {
          rolloffHz = freq;
          foundRolloff = true;
        }
      }
      const bwHz = Math.sqrt(bwVar / magSumAll);
      bandwidthSeries[f] = clamp01(bwHz / 4800);
      rolloffSeries[f] = clamp01(Math.log2(Math.max(20, rolloffHz) / 20) / maxLogFreq);
    }

    let flatness = 0.5;
    if (flatnessCount > 0 && arithMagSum > 1e-6) {
      const geoMean = Math.exp(logMagSum / flatnessCount);
      const arithMean = arithMagSum / flatnessCount;
      flatness = clamp01(geoMean / (arithMean + 1e-9));
    }
    flatnessSeries[f] = flatness;

    let chromaNormSq = 0;
    for (let c = 0; c < 12; c++) chromaNormSq += chromaTmp[c] * chromaTmp[c];
    const chromaNorm = Math.sqrt(chromaNormSq);
    const frameOffset = f * 12;

    if (chromaNorm > 1e-8) {
      let maxC = -1;
      let maxIdx = 0;
      let entropy = 0;
      let chromaSum = 0;
      for (let c = 0; c < 12; c++) {
        const val = chromaTmp[c] / chromaNorm;
        chromaFrames[frameOffset + c] = val;
        chromaSum += val;
        if (val > maxC) {
          maxC = val;
          maxIdx = c;
        }
      }
      if (chromaSum > 1e-6) {
        for (let c = 0; c < 12; c++) {
          const p = chromaFrames[frameOffset + c] / chromaSum;
          if (p > 1e-6) entropy -= p * Math.log(p);
        }
      }
      const normEntropy = entropy / Math.log(12);
      dominantPitch[f] = pitchSalience[f] > 0.34 ? bestMidi % 12 : maxIdx;
      harmonicStrength[f] = clamp01(
        (1 - normEntropy) * 1.15 * (1 - flatness * 0.55) + pitchSalience[f] * 0.32,
      );
    }
  }

  // ---- STFT-Domain 2D HPSS (Harmonic-Percussive Source Separation) ----
  const radT = hopSize > 512 ? 3 : 5; // ~125ms temporal median for stationary harmonics
  const radB = 3; // 7-band spectral median for broadband percussive transients
  const scratchMed = new Float32Array(Math.max(radT * 2 + 1, radB * 2 + 1));

  const percLowFlux = new Float32Array(frameCount);
  const percMidFlux = new Float32Array(frameCount);
  const percHighFlux = new Float32Array(frameCount);
  const percussiveFlux = new Float32Array(frameCount);

  const harmBassEnv = new Float32Array(frameCount);
  const harmBassFlux = new Float32Array(frameCount);
  const harmMidEnv = new Float32Array(frameCount);
  const harmMidFlux = new Float32Array(frameCount);
  const harmSynthFlux = new Float32Array(frameCount);
  const harmonicFlux = new Float32Array(frameCount);
  const harmFormantEnv = new Float32Array(frameCount);
  const harmTotalEnv = new Float32Array(frameCount);
  const percTotalEnv = new Float32Array(frameCount);

  const prevHarmBandLog = new Float32Array(HPSS_BAND_COUNT);
  const prevPercBandLog = new Float32Array(HPSS_BAND_COUNT);
  const specWinRow = new Float32Array(HPSS_BAND_COUNT);

  for (let f = 0; f < frameCount; f++) {
    const fOffset = f * HPSS_BAND_COUNT;
    for (let b = 0; b < HPSS_BAND_COUNT; b++) {
      specWinRow[b] = specBands[fOffset + b];
    }

    let sumH = 0;
    let sumP = 0;
    let sumHBass = 0;
    let sumHMid = 0;
    let sumHFormant = 0;

    let fPLow = 0;
    let fPMid = 0;
    let fPHigh = 0;
    let fHBass = 0;
    let fHMid = 0;
    let fHSynth = 0;

    for (let b = 0; b < HPSS_BAND_COUNT; b++) {
      const cur = specWinRow[b];

      // Horizontal temporal median (harmonic sustain)
      const t0 = Math.max(0, f - radT);
      const t1 = Math.min(frameCount - 1, f + radT);
      let lenT = 0;
      for (let t = t0; t <= t1; t++) {
        scratchMed[lenT++] = specBands[t * HPSS_BAND_COUNT + b];
      }
      const hMed = medianSmall(scratchMed, lenT);

      // Vertical spectral median (percussive ridge)
      const b0 = Math.max(0, b - radB);
      const b1 = Math.min(HPSS_BAND_COUNT - 1, b + radB);
      let lenB = 0;
      for (let k = b0; k <= b1; k++) {
        scratchMed[lenB++] = specWinRow[k];
      }
      const pMed = medianSmall(scratchMed, lenB);

      // Wiener soft mask
      const h2 = hMed * hMed;
      const p2 = pMed * pMed;
      const denom = h2 + p2 + 1e-12;
      const hMag = cur * (h2 / denom);
      const pMag = cur * (p2 / denom);

      sumH += hMag;
      sumP += pMag;

      const hLog = Math.log1p(logComp * hMag);
      const pLog = Math.log1p(logComp * pMag);
      const dH = hLog > prevHarmBandLog[b] ? hLog - prevHarmBandLog[b] : 0;
      const dP = pLog > prevPercBandLog[b] ? pLog - prevPercBandLog[b] : 0;
      prevHarmBandLog[b] = hLog;
      prevPercBandLog[b] = pLog;

      if (b <= bandKickEnd) {
        sumHBass += hMag;
        fHBass += dH;
        fPLow += dP;
      } else if (b <= bandPercMidEnd) {
        fPMid += dP;
      } else {
        fPHigh += dP;
      }

      if (b > bandKickEnd && b <= bandHarmMidEnd) {
        sumHMid += hMag;
        fHMid += dH;
      }
      if (b >= bandVocalStart && b <= bandVocalEnd) {
        sumHFormant += hMag;
      }
      if (b > bandPercMidEnd && b <= HPSS_BAND_COUNT - 6) {
        fHSynth += dH;
      }
    }

    harmTotalEnv[f] = sumH;
    percTotalEnv[f] = sumP;
    harmBassEnv[f] = sumHBass / Math.max(1, bandKickEnd + 1);
    harmMidEnv[f] = sumHMid / Math.max(1, bandHarmMidEnd - bandKickEnd);
    harmFormantEnv[f] = sumHFormant / Math.max(1, bandVocalEnd - bandVocalStart + 1);

    percLowFlux[f] = fPLow / Math.max(1, bandKickEnd + 1);
    percMidFlux[f] = fPMid / Math.max(1, bandPercMidEnd - bandKickEnd);
    percHighFlux[f] = fPHigh / Math.max(1, HPSS_BAND_COUNT - 1 - bandPercMidEnd);
    percussiveFlux[f] = percLowFlux[f] * 0.38 + percMidFlux[f] * 0.4 + percHighFlux[f] * 0.22;

    harmBassFlux[f] = fHBass / Math.max(1, bandKickEnd + 1);
    harmMidFlux[f] = fHMid / Math.max(1, bandHarmMidEnd - bandKickEnd);
    harmSynthFlux[f] = fHSynth / Math.max(1, HPSS_BAND_COUNT - 6 - bandPercMidEnd);
    harmonicFlux[f] = harmBassFlux[f] * 0.25 + harmMidFlux[f] * 0.55 + harmSynthFlux[f] * 0.2;
  }

  // Normalize energy & separated HPSS flux series robustly
  normalizeSeriesRobust(subBassSeries);
  normalizeSeriesRobust(bassSeries);
  normalizeSeriesRobust(lowMidSeries);
  normalizeSeriesRobust(midSeries);
  normalizeSeriesRobust(highMidSeries);
  normalizeSeriesRobust(trebleSeries);
  normalizeSeriesRobust(rmsSeries);
  normalizeSeriesRobust(totalSeries);
  normalizeSeriesRobust(fluxTotalRaw);

  normalizeSeriesRobust(percLowFlux);
  normalizeSeriesRobust(percMidFlux);
  normalizeSeriesRobust(percHighFlux);
  normalizeSeriesRobust(percussiveFlux);

  normalizeSeriesRobust(harmBassEnv);
  normalizeSeriesRobust(harmBassFlux);
  normalizeSeriesRobust(harmMidEnv);
  normalizeSeriesRobust(harmMidFlux);
  normalizeSeriesRobust(harmSynthFlux);
  normalizeSeriesRobust(harmonicFlux);
  normalizeSeriesRobust(harmFormantEnv);

  // Harmonic progression delta + honest HPSS vocal prominence + percussive/harmonic ratio
  const lagFrames = Math.max(4, Math.round(0.11 / frameDt));
  for (let f = 0; f < frameCount; f++) {
    const fBase = f * 12;
    const prevIdx = Math.max(0, f - lagFrames);
    const pBase = prevIdx * 12;

    let distSq = 0;
    for (let c = 0; c < 12; c++) {
      const curS =
        (chromaFrames[fBase + c] +
          chromaFrames[Math.max(0, f - 1) * 12 + c] +
          chromaFrames[Math.min(frameCount - 1, f + 1) * 12 + c]) /
        3;
      const prevS = prevSmoothChroma[c] * 0.35 + chromaFrames[pBase + c] * 0.65;
      prevSmoothChroma[c] = curS;
      const d = curS - prevS;
      distSq += d * d;
    }
    const rawDelta = Math.sqrt(distSq);
    harmonicChange[f] = clamp01(rawDelta * 1.35 * totalSeries[f]);

    const hTot = harmTotalEnv[f];
    const pTot = percTotalEnv[f];
    const pRatio = clamp01(pTot / (hTot + pTot + 1e-6));
    percussiveRatio[f] = pRatio;

    // Indirect vocal prominence estimate: formant-band harmonic energy + pitch salience + low drum bleed
    const formantRatio = hTot > 1e-6 ? clamp01((harmFormantEnv[f] * 2.2) / (harmMidEnv[f] + 0.15)) : 0.4;
    const tonality = 1 - flatnessSeries[f];
    vocalPresence[f] = clamp01(
      harmFormantEnv[f] *
        (0.32 + 0.48 * pitchSalience[f] + 0.2 * tonality) *
        (1 - pRatio * 0.58) *
        (0.45 + 0.55 * formantRatio),
    );
  }
  normalizeSeriesRobust(harmonicChange, 0.99);
  normalizeSeriesRobust(vocalPresence, 0.992);

  // Average energy & Dynamic Range
  let energySum = 0;
  const activeRms: number[] = [];
  for (let f = 0; f < frameCount; f++) {
    energySum += totalSeries[f];
    if (rmsSeries[f] > 0.02) activeRms.push(rmsSeries[f]);
  }
  const averageEnergy = energySum / frameCount;
  let dynamicRangeDb = 12;
  if (activeRms.length > 20) {
    activeRms.sort((a, b) => a - b);
    const p15 = Math.max(1e-4, activeRms[Math.floor(activeRms.length * 0.15)]);
    const p95 = Math.max(p15, activeRms[Math.floor(activeRms.length * 0.95)]);
    dynamicRangeDb = Number(Math.min(48, 20 * Math.log10(p95 / p15)).toFixed(1));
  }

  // Silence detection (using window-centered frame times)
  const silenceRanges: SilenceRange[] = [];
  const silenceThresh = Math.max(0.028, Math.min(0.075, averageEnergy * 0.19));
  let silenceStart: number | null = null;
  for (let f = 0; f < frameCount; f++) {
    const t = frameTime(f);
    const eLevel = totalSeries[f] * 0.6 + rmsSeries[f] * 0.4;
    if (eLevel < silenceThresh) {
      if (silenceStart === null) silenceStart = t;
    } else if (silenceStart !== null) {
      if (t - silenceStart >= 0.55) {
        silenceRanges.push({ start: Number(silenceStart.toFixed(3)), end: Number(t.toFixed(3)) });
      }
      silenceStart = null;
    }
  }
  if (silenceStart !== null && duration - silenceStart >= 0.55) {
    silenceRanges.push({
      start: Number(silenceStart.toFixed(3)),
      end: Number(duration.toFixed(3)),
    });
  }

  // Multi-layer adaptive peak picking across 6 distinct separated musical envelopes
  const gateThresh = silenceThresh * 1.05;
  const kickPeaks = pickAdaptivePeaks(percLowFlux, totalSeries, gateThresh, frameDt, 0.18, 0.085, 0.85, 0.035);
  const snarePeaks = pickAdaptivePeaks(percMidFlux, totalSeries, gateThresh, frameDt, 0.16, 0.08, 0.88, 0.035);
  const hihatPeaks = pickAdaptivePeaks(percHighFlux, totalSeries, gateThresh, frameDt, 0.13, 0.065, 1.0, 0.04);
  const melodyPeaks = pickAdaptivePeaks(harmMidFlux, totalSeries, gateThresh, frameDt, 0.2, 0.11, 0.72, 0.03);
  const basslinePeaks = pickAdaptivePeaks(harmBassFlux, totalSeries, gateThresh, frameDt, 0.22, 0.12, 0.8, 0.04);
  const harmonyPeaks = pickAdaptivePeaks(harmonicChange, totalSeries, gateThresh, frameDt, 0.26, 0.17, 0.78, 0.04);
  const synthSeqPeaks = pickAdaptivePeaks(harmSynthFlux, totalSeries, gateThresh, frameDt, 0.15, 0.075, 0.95, 0.045);

  const onsets: OnsetEvent[] = [];

  for (const p of kickPeaks) {
    const f = p.frame;
    const band6: SpectralBand6 = subBassSeries[f] > bassSeries[f] * 1.15 ? 'sub_bass' : 'bass';
    onsets.push({
      time: Number(frameTime(f).toFixed(3)),
      strength: Number(p.strength.toFixed(3)),
      band: 'bass',
      band6,
      layer: 'percussive_low',
      role: 'kick',
    });
  }

  for (const p of snarePeaks) {
    const f = p.frame;
    const isClap = flatnessSeries[f] >= 0.34 && highMidSeries[f] >= lowMidSeries[f] * 0.92;
    let band6: SpectralBand6 = isClap ? 'high_mid' : 'mid';
    if (!isClap && lowMidSeries[f] > midSeries[f] * 1.2) band6 = 'low_mid';
    else if (highMidSeries[f] > midSeries[f] * 1.15) band6 = 'high_mid';
    onsets.push({
      time: Number(frameTime(f).toFixed(3)),
      strength: Number(p.strength.toFixed(3)),
      band: 'mid',
      band6,
      layer: 'percussive_mid',
      role: isClap ? 'clap' : 'snare',
    });
  }

  for (const p of hihatPeaks) {
    const f = p.frame;
    const band6: SpectralBand6 = trebleSeries[f] > highMidSeries[f] ? 'treble' : 'high_mid';
    onsets.push({
      time: Number(frameTime(f).toFixed(3)),
      strength: Number(p.strength.toFixed(3)),
      band: 'high',
      band6,
      layer: 'percussive_high',
      role: 'hihat',
    });
  }

  for (const p of melodyPeaks) {
    const f = p.frame;
    const isVocal = vocalPresence[f] >= 0.44 && pitchSalience[f] >= 0.28;
    const role: MusicalRole = isVocal ? 'vocal' : 'melody';
    const dur = measureHarmonicSustain(
      f,
      frameDt,
      isVocal ? harmFormantEnv : harmMidEnv,
      pitchSalience,
      dominantMidi,
      1.6,
    );
    const salienceBoost = 0.65 + pitchSalience[f] * 0.35;
    onsets.push({
      time: Number(frameTime(f).toFixed(3)),
      strength: Number(clamp01(p.strength * salienceBoost).toFixed(3)),
      band: 'mid',
      band6: vocalPresence[f] > 0.5 ? 'mid' : 'high_mid',
      layer: 'harmonic',
      role,
      duration: dur > 0 ? dur : undefined,
    });
  }

  for (const p of basslinePeaks) {
    const f = p.frame;
    if (harmBassEnv[f] < 0.2) continue;
    const dur = measureHarmonicSustain(
      f,
      frameDt,
      harmBassEnv,
      pitchSalience,
      dominantMidi,
      1.1,
    );
    onsets.push({
      time: Number(frameTime(f).toFixed(3)),
      strength: Number(clamp01(p.strength * (0.65 + harmBassEnv[f] * 0.35)).toFixed(3)),
      band: 'bass',
      band6: 'bass',
      layer: 'bassline',
      role: 'bassline',
      duration: dur > 0 ? dur : undefined,
    });
  }

  for (const p of harmonyPeaks) {
    const f = p.frame;
    if (harmonicStrength[f] < 0.2) continue;
    const dur = measureHarmonicSustain(
      f,
      frameDt,
      harmMidEnv,
      pitchSalience,
      dominantMidi,
      1.75,
    );
    onsets.push({
      time: Number(frameTime(f).toFixed(3)),
      strength: Number(clamp01(p.strength * (0.55 + harmonicStrength[f] * 0.45)).toFixed(3)),
      band: 'mid',
      band6: 'low_mid',
      layer: 'harmonic',
      role: 'harmony',
      duration: dur > 0 ? dur : undefined,
    });
  }

  for (const p of synthSeqPeaks) {
    const f = p.frame;
    if (harmonicStrength[f] < 0.24 && pitchSalience[f] < 0.24) continue;
    onsets.push({
      time: Number(frameTime(f).toFixed(3)),
      strength: Number(clamp01(p.strength * 0.92).toFixed(3)),
      band: 'high',
      band6: 'high_mid',
      layer: 'harmonic',
      role: 'synth_seq',
    });
  }

  onsets.sort((a, b) => a.time - b.time);

  // Balanced combined rhythmic onset envelope (includes harmonic melody/chord changes so drumless tracks track accurately!)
  const rhythmicEnv = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    rhythmicEnv[f] =
      percLowFlux[f] * 0.3 +
      percMidFlux[f] * 0.26 +
      percHighFlux[f] * 0.14 +
      harmMidFlux[f] * 0.18 +
      harmonicChange[f] * 0.12;
  }

  // Global tempo + sliding local tempo segments
  const globalTempo = estimateWindowTempo(rhythmicEnv, 0, frameCount, frameDt);
  const windowFrames = Math.max(60, Math.round(12 / frameDt));
  const stepFrames = Math.max(30, Math.round(6 / frameDt));
  const rawSegments: TempoSegment[] = [];

  if (frameCount <= windowFrames * 1.2) {
    rawSegments.push({
      start: 0,
      end: Number(duration.toFixed(2)),
      bpm: globalTempo.bpm,
      confidence: globalTempo.confidence,
      feel: 'normal',
    });
  } else {
    let prevBpm = globalTempo.bpm;
    for (let s = 0; s < frameCount; s += stepFrames) {
      const e = Math.min(frameCount, s + windowFrames);
      if (e - s < Math.round(4 / frameDt)) break;
      const winStartSec = frameTime(s);
      const winEndSec = Math.min(duration, frameTime(Math.min(frameCount - 1, s + stepFrames)));
      const local = estimateWindowTempo(rhythmicEnv, s, e, frameDt, prevBpm);
      let feel: TempoSegment['feel'] = 'normal';
      const ratio = local.bpm / Math.max(1, globalTempo.bpm);
      if (ratio < 0.62) feel = 'half_time';
      else if (ratio > 1.55) feel = 'double_time';

      const chosenBpm = local.confidence >= 0.24 ? local.bpm : prevBpm;
      prevBpm = chosenBpm;

      const lastSeg = rawSegments[rawSegments.length - 1];
      if (lastSeg && Math.abs(lastSeg.bpm - chosenBpm) <= 2 && lastSeg.feel === feel) {
        lastSeg.end = Number(Math.max(lastSeg.end, winEndSec).toFixed(2));
        lastSeg.confidence = Number(((lastSeg.confidence + local.confidence) * 0.5).toFixed(3));
      } else {
        rawSegments.push({
          start: Number(winStartSec.toFixed(2)),
          end: Number(Math.min(duration, winEndSec).toFixed(2)),
          bpm: chosenBpm,
          confidence: local.confidence,
          feel,
        });
      }
    }
    if (rawSegments.length > 0) {
      rawSegments[0].start = 0;
      rawSegments[rawSegments.length - 1].end = Number(duration.toFixed(2));
    }
  }

  const getLocalBpmAt = (time: number): number => {
    for (const seg of rawSegments) {
      if (time >= seg.start && time <= seg.end) return seg.bpm;
    }
    return globalTempo.bpm;
  };

  // Optimal initial phase across beats & harmonic/percussive onsets (first 16s to prevent tempo drift smearing)
  const initPeriod = 60 / globalTempo.bpm;
  let bestPhase = 0.4;
  let bestPhaseScore = -1;
  const phaseSteps = 64;
  for (let p = 0; p < phaseSteps; p++) {
    const phase = (p / phaseSteps) * initPeriod;
    let pScore = 0;
    for (const onset of onsets) {
      if (onset.time > 18) break;
      const wrapped = (((onset.time - phase) % initPeriod) + initPeriod) % initPeriod;
      const dist = Math.min(wrapped, initPeriod - wrapped);
      if (dist < 0.04) {
        const w =
          onset.layer === 'percussive_low'
            ? 1.55
            : onset.layer === 'percussive_mid'
              ? 1.3
              : onset.layer === 'percussive_high'
                ? 0.4
                : 1.0;
        pScore += onset.strength * w * (1 - dist / 0.04);
      }
    }
    if (pScore > bestPhaseScore) {
      bestPhaseScore = pScore;
      bestPhase = phase;
    }
  }

  // Non-drifting Phase-Locked Loop Beat Tracker
  const beats: number[] = [];
  let cursor = bestPhase;
  while (cursor < Math.max(0.25, halfWindowSec)) cursor += initPeriod;

  while (cursor < duration - 0.12) {
    const localPeriod = 60 / getLocalBpmAt(cursor);
    const searchRad = Math.min(0.052, localPeriod * 0.082);
    const fCenter = timeToFrame(cursor);
    const fRad = Math.max(1, Math.round(searchRad / frameDt));

    let bestFrame = fCenter;
    let bestScore = -1;
    for (let f = Math.max(0, fCenter - fRad); f <= Math.min(frameCount - 1, fCenter + fRad); f++) {
      const distNorm = Math.abs(f - fCenter) / (fRad + 1);
      const score = rhythmicEnv[f] * (1 - distNorm * 0.45);
      if (score > bestScore) {
        bestScore = score;
        bestFrame = f;
      }
    }

    const peakTime = frameTime(bestFrame);
    const hasClearPeak = bestScore > 0.1;
    const snappedTime = hasClearPeak ? cursor * 0.4 + peakTime * 0.6 : cursor;
    beats.push(Number(snappedTime.toFixed(3)));

    const phaseError = hasClearPeak ? peakTime - cursor : 0;
    cursor = cursor + phaseError * 0.28 + localPeriod;
  }

  // Time signature estimation (4/4, 3/4, 6/8)
  let timeSignature: MusicProfile['timeSignature'] = '4/4';
  if (beats.length >= 16) {
    const beatRad = Math.max(2, Math.round(0.045 / frameDt));
    const beatEnergies = beats.map((bt) => {
      const center = timeToFrame(bt);
      let maxE = 0;
      for (
        let f = Math.max(0, center - beatRad);
        f <= Math.min(frameCount - 1, center + beatRad);
        f++
      ) {
        const e = percLowFlux[f] * 0.35 + percMidFlux[f] * 0.25 + harmMidFlux[f] * 0.15 + totalSeries[f] * 0.25;
        if (e > maxE) maxE = e;
      }
      return maxE;
    });

    const barScore = (beatsPerBar: number): number => {
      let bestOffsetScore = 0;
      for (let offset = 0; offset < beatsPerBar; offset++) {
        let downbeatSum = 0;
        let otherSum = 0;
        let downCount = 0;
        let otherCount = 0;
        for (let i = 0; i < beatEnergies.length; i++) {
          if (i % beatsPerBar === offset) {
            downbeatSum += beatEnergies[i];
            downCount++;
          } else {
            otherSum += beatEnergies[i];
            otherCount++;
          }
        }
        const diff = downbeatSum / Math.max(1, downCount) - otherSum / Math.max(1, otherCount);
        if (diff > bestOffsetScore) bestOffsetScore = diff;
      }
      return bestOffsetScore;
    };

    const s2 = barScore(2);
    const s3 = barScore(3);
    const s4 = barScore(4);
    const s6 = barScore(6);
    if (s3 > Math.max(0.055, s4 * 1.38, s2 * 1.28)) timeSignature = '3/4';
    else if (s6 > Math.max(0.06, s4 * 1.42) && s3 > s4 * 1.18 && globalTempo.bpm >= 110)
      timeSignature = '6/8';
    else if (globalTempo.confidence < 0.16) timeSignature = 'irregular';
  }

  // Metric subdivisions anchored to tracked beat intervals
  const subdivisions: SubdivisionBeat[] = [];
  for (let i = 0; i < beats.length - 1; i++) {
    const t0 = beats[i];
    const t1 = beats[i + 1];
    const gap = t1 - t0;
    if (gap < 0.22 || gap > 1.25) continue;

    if (timeSignature === '6/8') {
      for (const frac of [1 / 3, 2 / 3]) {
        const st = t0 + gap * frac;
        const f = timeToFrame(st);
        subdivisions.push({
          time: Number(st.toFixed(3)),
          division: 3,
          strength: Number(clamp01(rhythmicEnv[f] * 0.8 + totalSeries[f] * 0.35).toFixed(3)),
        });
      }
    } else {
      const halfT = t0 + gap * 0.5;
      const fh = timeToFrame(halfT);
      subdivisions.push({
        time: Number(halfT.toFixed(3)),
        division: 2,
        strength: Number(clamp01(rhythmicEnv[fh] * 0.85 + totalSeries[fh] * 0.35).toFixed(3)),
      });

      if (gap >= 0.32 && totalSeries[fh] > averageEnergy * 0.82) {
        for (const frac of [0.25, 0.75]) {
          const qt = t0 + gap * frac;
          const fq = timeToFrame(qt);
          if (rhythmicEnv[fq] > 0.2) {
            subdivisions.push({
              time: Number(qt.toFixed(3)),
              division: 4,
              strength: Number(clamp01(rhythmicEnv[fq] * 0.85).toFixed(3)),
            });
          }
        }
      }
    }
  }

  // Structural segmentation: drops, crescendos, sections
  const fastRadius = Math.max(3, Math.round(0.22 / frameDt));
  const slowRadius = Math.max(12, Math.round(1.35 / frameDt));
  const envFast = movingAverage(totalSeries, fastRadius);
  const envSlow = movingAverage(totalSeries, slowRadius);

  const drops: number[] = [];
  const lookbackFrames = Math.max(16, Math.round(1.6 / frameDt));
  const dropDebounceFrames = Math.max(40, Math.round(6.0 / frameDt));
  const surgeWin = Math.max(4, Math.round(0.14 / frameDt));
  let lastDropFrame = -dropDebounceFrames;

  for (let f = lookbackFrames; f < frameCount - fastRadius * 2; f++) {
    if (f - lastDropFrame < dropDebounceFrames) continue;
    let prevMin = envFast[f - 1];
    for (let k = f - lookbackFrames; k < f - fastRadius; k += 2) {
      if (envFast[k] < prevMin) prevMin = envFast[k];
    }
    const prevRef = Math.max(0.05, Math.min(envSlow[f - fastRadius], prevMin * 1.35));
    const nowFast = envFast[f + fastRadius];
    const stepRatio = nowFast / prevRef;

    let localFluxMax = 0;
    let localBassMax = 0;
    for (let k = Math.max(0, f - surgeWin); k <= Math.min(frameCount - 1, f + surgeWin); k++) {
      const fComb = percussiveFlux[k] * 0.65 + harmonicFlux[k] * 0.35;
      if (fComb > localFluxMax) localFluxMax = fComb;
      const b = (bassSeries[k] + subBassSeries[k]) * 0.5;
      if (b > localBassMax) localBassMax = b;
    }

    if (
      nowFast > Math.max(0.18, averageEnergy * 1.12) &&
      stepRatio >= 1.58 &&
      localBassMax > 0.27 &&
      localFluxMax > 0.19
    ) {
      lastDropFrame = f;
      drops.push(Number(frameTime(f).toFixed(2)));
    }
  }

  const crescendos: Array<{ start: number; end: number; slope: number }> = [];
  const win15 = Math.max(15, Math.round(1.6 / frameDt));
  let crescStart: number | null = null;
  for (let f = win15; f < frameCount; f += Math.max(4, Math.round(0.2 / frameDt))) {
    const delta = envSlow[f] - envSlow[f - win15];
    if (delta > 0.14 && totalSeries[f] > silenceThresh * 2) {
      if (crescStart === null) crescStart = frameTime(f - win15);
    } else if (crescStart !== null) {
      const endT = frameTime(f);
      if (endT - crescStart >= 1.6) {
        crescendos.push({
          start: Number(crescStart.toFixed(2)),
          end: Number(endT.toFixed(2)),
          slope: Number((delta / Math.max(0.5, endT - crescStart)).toFixed(3)),
        });
      }
      crescStart = null;
    }
  }

  const sections: MusicalSection[] = [];
  const secStep = 4.0;
  for (let s = 0; s < duration; s += secStep) {
    const e = Math.min(duration, s + secStep);
    const f0 = timeToFrame(s);
    const f1 = Math.max(f0 + 1, timeToFrame(e));
    let eSum = 0;
    let pSum = 0;
    let hSum = 0;
    for (let f = f0; f <= f1; f++) {
      eSum += totalSeries[f];
      pSum += percussiveRatio[f];
      hSum += harmonicStrength[f];
    }
    const cnt = f1 - f0 + 1;
    const secEnergy = eSum / cnt;
    const secPerc = pSum / cnt;
    const secHarm = hSum / cnt;

    const hasDrop = drops.some((d) => d >= s - 0.5 && d <= e + 0.5);
    const hasCrescendo = crescendos.some((c) => c.start <= e && c.end >= s);
    const inSil = silenceRanges.some((sr) => sr.start <= s + 0.4 && sr.end >= e - 0.4);

    let type: MusicalSectionType = 'groove';
    if (inSil || secEnergy < silenceThresh * 1.2) type = 'silence';
    else if (hasDrop) type = 'drop';
    else if (hasCrescendo && secEnergy < averageEnergy * 1.15) type = 'buildup';
    else if (secEnergy >= averageEnergy * 1.18) type = 'chorus';
    else if (secEnergy < averageEnergy * 0.65 && secPerc < 0.35) type = 'calm';
    else if (secEnergy < averageEnergy * 0.8 && secHarm > 0.38) type = 'breakdown';

    const prev = sections[sections.length - 1];
    if (prev && prev.type === type) {
      prev.end = Number(e.toFixed(2));
      prev.energy = Number(((prev.energy + secEnergy) * 0.5).toFixed(3));
      prev.rhythmicDensity = Number(((prev.rhythmicDensity + secPerc) * 0.5).toFixed(3));
      prev.harmonicActivity = Number(((prev.harmonicActivity + secHarm) * 0.5).toFixed(3));
    } else {
      sections.push({
        start: Number(s.toFixed(2)),
        end: Number(e.toFixed(2)),
        type,
        energy: Number(secEnergy.toFixed(3)),
        rhythmicDensity: Number(secPerc.toFixed(3)),
        harmonicActivity: Number(secHarm.toFixed(3)),
      });
    }
  }

  const sectionTransitions: SectionTransitionEvent[] = [];
  for (let i = 1; i < sections.length; i++) {
    const prev = sections[i - 1];
    const cur = sections[i];
    if (prev.type !== cur.type) {
      sectionTransitions.push({
        time: cur.start,
        from: prev.type,
        to: cur.type,
        intensity: Number(
          Math.min(1, Math.abs(cur.energy - prev.energy) * 1.5 + cur.energy * 0.35).toFixed(3),
        ),
      });
    }
  }

  // Downsample multi-band energy & HPSS descriptors to 20 Hz (50ms step)
  const energyTimeline: EnergyFrame[] = [];
  for (let t = 0; t < duration; t += 0.05) {
    const f = timeToFrame(t);
    energyTimeline.push({
      time: Number(t.toFixed(2)),
      bass: Number((bassSeries[f] * 0.72 + subBassSeries[f] * 0.28).toFixed(3)),
      mid: Number((midSeries[f] * 0.65 + lowMidSeries[f] * 0.35).toFixed(3)),
      high: Number((highMidSeries[f] * 0.55 + trebleSeries[f] * 0.45).toFixed(3)),
      total: Number(totalSeries[f].toFixed(3)),
      subBass: Number(subBassSeries[f].toFixed(3)),
      lowMid: Number(lowMidSeries[f].toFixed(3)),
      highMid: Number(highMidSeries[f].toFixed(3)),
      treble: Number(trebleSeries[f].toFixed(3)),
      rms: Number(rmsSeries[f].toFixed(3)),
      centroid: Number(centroidSeries[f].toFixed(3)),
      bandwidth: Number(bandwidthSeries[f].toFixed(3)),
      rolloff: Number(rolloffSeries[f].toFixed(3)),
      flux: Number(fluxTotalRaw[f].toFixed(3)),
      harmonicStrength: Number(harmonicStrength[f].toFixed(3)),
      harmonicChange: Number(harmonicChange[f].toFixed(3)),
      vocalPresence: Number(vocalPresence[f].toFixed(3)),
      percussiveRatio: Number(percussiveRatio[f].toFixed(3)),
      harmonicFlux: Number(harmonicFlux[f].toFixed(3)),
      percussiveFlux: Number(percussiveFlux[f].toFixed(3)),
      pitchSalience: Number(pitchSalience[f].toFixed(3)),
      basslineActivity: Number(harmBassEnv[f].toFixed(3)),
    });
  }

  const activeDuration = Math.max(
    1,
    duration - silenceRanges.reduce((acc, s) => acc + (s.end - s.start), 0),
  );
  const onsetRate = onsets.length / activeDuration;
  const rhythmicComplexity = Number(clamp01(onsetRate / 7.5).toFixed(3));

  const partialProfile: MusicProfile = {
    analysisVersion: ANALYSIS_VERSION,
    bpm: Math.round(globalTempo.bpm),
    tempoConfidence: globalTempo.confidence,
    timeSignature,
    duration,
    beats,
    subdivisions,
    tempoSegments: rawSegments,
    onsets,
    sections,
    sectionTransitions,
    drops,
    crescendos,
    energyTimeline,
    silenceRanges,
    averageEnergy: Number(averageEnergy.toFixed(3)),
    dynamicRangeDb,
    rhythmicComplexity,
    analyzedAt: Date.now(),
  };

  partialProfile.fusedEvents = fuseMusicalEvents(
    partialProfile,
    dominantPitch,
    pitchSalience,
    frameDt,
    halfWindowSec,
    fusionWeights,
  );

  return partialProfile;
}
