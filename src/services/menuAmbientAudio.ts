import type { MenuAmbientPreset, MenuAmbientSourceMode } from '../types/game';

export interface MenuAmbientPresetInfo {
  id: MenuAmbientPreset;
  label: string;
  description: string;
}

export const MENU_AMBIENT_PRESETS: MenuAmbientPresetInfo[] = [
  {
    id: 'cyberpunk_ambient',
    label: 'Cyberpunk Ambient',
    description: 'Pads oscuros futuristas, subgraves profundos y destellos neón',
  },
  {
    id: 'synthwave',
    label: 'Synthwave',
    description: 'Acordes analógicos cálidos, pulso nocturno y atmósfera retro-futurista',
  },
  {
    id: 'electronic_chill',
    label: 'Electronic Chill',
    description: 'Armonías suaves tipo Rhodes con textura electrónica relajada',
  },
  {
    id: 'cinematic_futuristic',
    label: 'Cinematic Futuristic',
    description: 'Crescendos cinematográficos amplios con profundidad espacial',
  },
  {
    id: 'deep_space',
    label: 'Deep Space Ambient',
    description: 'Drones cósmicos evolutivos con armónicos estelares sutiles',
  },
  {
    id: 'ambient_electronic',
    label: 'Electrónica Ambiental',
    description: 'Progresión armónica orgánica y texturas cristalinas',
  },
];

interface PresetVoiceSpec {
  chords: number[][];
  chordDurationSec: number;
  padWave: OscillatorType;
  subWave: OscillatorType;
  filterCutoffHz: number;
  filterResonance: number;
  detuneCents: number;
  shimmerProb: number;
}

const PRESET_SPECS: Record<MenuAmbientPreset, PresetVoiceSpec> = {
  cyberpunk_ambient: {
    chords: [
      [73.42, 146.83, 220.0, 261.63, 329.63],
      [58.27, 116.54, 174.61, 220.0, 293.66],
      [49.0, 146.83, 196.0, 233.08, 349.23],
      [55.0, 164.81, 220.0, 293.66, 329.63],
    ],
    chordDurationSec: 6.4,
    padWave: 'sawtooth',
    subWave: 'sine',
    filterCutoffHz: 540,
    filterResonance: 1.8,
    detuneCents: 9,
    shimmerProb: 0.72,
  },
  synthwave: {
    chords: [
      [55.0, 110.0, 220.0, 261.63, 329.63],
      [43.65, 174.61, 220.0, 261.63, 329.63],
      [65.41, 130.81, 196.0, 246.94, 293.66],
      [49.0, 146.83, 196.0, 246.94, 329.63],
    ],
    chordDurationSec: 5.2,
    padWave: 'sawtooth',
    subWave: 'triangle',
    filterCutoffHz: 720,
    filterResonance: 1.4,
    detuneCents: 12,
    shimmerProb: 0.85,
  },
  electronic_chill: {
    chords: [
      [82.41, 164.81, 246.94, 293.66, 369.99],
      [65.41, 164.81, 246.94, 293.66, 392.0],
      [55.0, 164.81, 220.0, 261.63, 392.0],
      [61.74, 146.83, 220.0, 293.66, 369.99],
    ],
    chordDurationSec: 5.8,
    padWave: 'triangle',
    subWave: 'sine',
    filterCutoffHz: 620,
    filterResonance: 0.9,
    detuneCents: 6,
    shimmerProb: 0.58,
  },
  cinematic_futuristic: {
    chords: [
      [65.41, 130.81, 196.0, 293.66, 392.0],
      [51.91, 155.56, 207.65, 261.63, 392.0],
      [77.78, 155.56, 233.08, 293.66, 392.0],
      [49.0, 146.83, 196.0, 261.63, 392.0],
    ],
    chordDurationSec: 7.0,
    padWave: 'sawtooth',
    subWave: 'sine',
    filterCutoffHz: 680,
    filterResonance: 1.5,
    detuneCents: 11,
    shimmerProb: 0.65,
  },
  deep_space: {
    chords: [
      [43.65, 130.81, 196.0, 329.63, 493.88],
      [49.0, 146.83, 220.0, 349.23, 523.25],
      [55.0, 164.81, 246.94, 392.0, 587.33],
      [41.2, 123.47, 185.0, 293.66, 440.0],
    ],
    chordDurationSec: 8.4,
    padWave: 'sine',
    subWave: 'sine',
    filterCutoffHz: 460,
    filterResonance: 1.1,
    detuneCents: 8,
    shimmerProb: 0.45,
  },
  ambient_electronic: {
    chords: [
      [46.25, 138.59, 220.0, 277.18, 415.3],
      [73.42, 146.83, 220.0, 277.18, 369.99],
      [55.0, 164.81, 220.0, 277.18, 415.3],
      [41.2, 164.81, 207.65, 277.18, 329.63],
    ],
    chordDurationSec: 6.0,
    padWave: 'triangle',
    subWave: 'sine',
    filterCutoffHz: 640,
    filterResonance: 1.2,
    detuneCents: 7,
    shimmerProb: 0.78,
  },
};

export interface MenuAmbientBands {
  subBass: number;
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  treble: number;
  energy: number;
  active: boolean;
}

class MenuAmbientAudioService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private synthFilter: BiquadFilterNode | null = null;
  private customBusGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;

  private enabled = true;
  private volume = 0.45;
  private preset: MenuAmbientPreset = 'cyberpunk_ambient';
  private sourceMode: MenuAmbientSourceMode = 'preset';
  private customLoop = true;
  private customPaused = false;
  private customTrackName = '';
  private customBuffer: AudioBuffer | null = null;
  private customPausedOffset = 0;
  private customStartContextTime = 0;
  private customStartedAtOffset = 0;

  private activeInMenu = false;
  private isPlaying = false;
  private sessionGen = 0;

  private schedulerTimer: number | null = null;
  private chordIndex = 0;
  private activeNodes: Array<{ stop: () => void; disconnect: () => void }> = [];
  private bufferSource: AudioBufferSourceNode | null = null;
  private unlockListenerAttached = false;

  private ensureGraph(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx({ latencyHint: 'playback' });

      this.synthFilter = this.ctx.createBiquadFilter();
      this.synthFilter.type = 'lowpass';
      this.synthFilter.frequency.value = 1800;
      this.synthFilter.Q.value = 0.7;

      // Full-spectrum passthrough bus for user's own local audio files
      this.customBusGain = this.ctx.createGain();
      this.customBusGain.gain.value = 1.0;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.85;
      this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0;

      this.synthFilter.connect(this.analyser);
      this.customBusGain.connect(this.analyser);
      this.analyser.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private attachGestureUnlock(): void {
    if (this.unlockListenerAttached || typeof window === 'undefined') return;
    this.unlockListenerAttached = true;

    const unlock = () => {
      if (!this.activeInMenu || !this.enabled || this.isUserPausedActive()) return;
      const ctx = this.ensureGraph();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        void ctx.resume().then(() => {
          if (this.activeInMenu && this.enabled && !this.isPlaying && !this.isUserPausedActive()) {
            this.startPlaybackInternal(1.2);
          } else if (this.activeInMenu && this.enabled && this.masterGain && !this.isUserPausedActive()) {
            this.masterGain.gain.setTargetAtTime(this.volume, ctx.currentTime, 0.45);
          }
        });
      } else if (!this.isPlaying && !this.isUserPausedActive()) {
        this.startPlaybackInternal(1.2);
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      this.unlockListenerAttached = false;
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  private isUsingCustomBuffer(): boolean {
    return this.sourceMode === 'custom' && this.customBuffer !== null;
  }

  private isUserPausedActive(): boolean {
    return this.isUsingCustomBuffer() && this.customPaused;
  }

  public async decodeAndSetCustomBlob(blob: Blob, fileName: string): Promise<void> {
    const ctx = this.ensureGraph();
    if (!ctx) throw new Error('AudioContext no disponible');
    const arr = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arr.slice(0));
    this.setCustomBuffer(decoded, fileName);
  }

  public setCustomBuffer(buffer: AudioBuffer | null, fileName = ''): void {
    const sameTrack = this.customBuffer === buffer && this.customTrackName === fileName;
    if (sameTrack) return;

    this.customBuffer = buffer;
    this.customTrackName = fileName;
    this.customPausedOffset = 0;

    if (this.sourceMode === 'custom' && this.activeInMenu && this.enabled && !this.customPaused) {
      this.stopAllVoices();
      if (buffer) {
        this.startPlaybackInternal(1.0);
      } else {
        this.startPlaybackInternal(1.2);
      }
    }
  }

  public clearCustomAudio(): void {
    this.customBuffer = null;
    this.customTrackName = '';
    this.customPausedOffset = 0;
    this.customPaused = false;
    if (this.sourceMode === 'custom') {
      this.sourceMode = 'preset';
    }
    if (this.activeInMenu && this.enabled) {
      this.stopAllVoices();
      this.startPlaybackInternal(1.1);
    }
  }

  public setSourceMode(mode: MenuAmbientSourceMode): void {
    if (this.sourceMode === mode) return;
    this.captureCustomOffsetIfPlaying();
    this.sourceMode = mode;

    if (this.activeInMenu && this.enabled) {
      this.stopAllVoices();
      if (!this.isUserPausedActive()) {
        this.startPlaybackInternal(0.95);
      }
    }
  }

  public setLoop(loop: boolean): void {
    this.customLoop = loop;
    if (this.bufferSource) {
      this.bufferSource.loop = loop;
    }
  }

  public setPaused(paused: boolean): void {
    if (this.customPaused === paused) return;
    this.customPaused = paused;

    if (!this.isUsingCustomBuffer()) return;

    if (paused) {
      this.captureCustomOffsetIfPlaying();
      this.fadeOutAndStop(0.22);
    } else if (this.activeInMenu && this.enabled) {
      this.startPlaybackInternal(0.55);
    }
  }

  public restartCustomFromStart(): void {
    this.customPausedOffset = 0;
    this.customPaused = false;
    if (this.activeInMenu && this.enabled && this.isUsingCustomBuffer()) {
      this.stopAllVoices();
      this.startPlaybackInternal(0.65);
    }
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.captureCustomOffsetIfPlaying();
      this.fadeOutAndStop(0.4);
    } else if (this.activeInMenu && !this.isUserPausedActive()) {
      this.enterMenu();
    }
  }

  public setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.masterGain && this.isPlaying && this.enabled && this.activeInMenu) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.08);
    }
  }

  public setPreset(next: MenuAmbientPreset): void {
    if (this.preset === next) return;
    this.preset = next;
    if (this.sourceMode === 'preset' && this.isPlaying && this.activeInMenu && this.enabled) {
      this.stopAllVoices();
      this.chordIndex = 0;
      this.startPlaybackInternal(1.1);
    }
  }

  public getPlaybackStatus(): {
    isPlaying: boolean;
    isPaused: boolean;
    sourceMode: MenuAmbientSourceMode;
    trackName: string;
    hasCustomBuffer: boolean;
  } {
    return {
      isPlaying: this.isPlaying,
      isPaused: this.customPaused,
      sourceMode: this.sourceMode,
      trackName: this.customTrackName,
      hasCustomBuffer: this.customBuffer !== null,
    };
  }

  private captureCustomOffsetIfPlaying(): void {
    if (!this.ctx || !this.bufferSource || !this.customBuffer || !this.isPlaying) return;
    const elapsed = Math.max(0, this.ctx.currentTime - this.customStartContextTime);
    const totalOffset = this.customStartedAtOffset + elapsed;
    const dur = Math.max(0.01, this.customBuffer.duration);
    this.customPausedOffset = this.customLoop ? totalOffset % dur : Math.min(dur - 0.05, totalOffset);
  }

  public enterMenu(): void {
    this.activeInMenu = true;
    if (!this.enabled || this.isUserPausedActive()) return;

    const ctx = this.ensureGraph();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      this.attachGestureUnlock();
      void ctx
        .resume()
        .then(() => {
          if (this.activeInMenu && this.enabled && !this.isPlaying && !this.isUserPausedActive()) {
            this.startPlaybackInternal(1.4);
          }
        })
        .catch(() => {
          // Will unlock cleanly on first pointer/key gesture
        });
      return;
    }

    if (!this.isPlaying) {
      this.startPlaybackInternal(1.4);
    } else if (this.masterGain) {
      this.masterGain.gain.cancelScheduledValues(ctx.currentTime);
      this.masterGain.gain.setTargetAtTime(this.volume, ctx.currentTime, 0.4);
    }
  }

  /**
   * Immediately fades out & stops all menu audio when launching gameplay so zero overlap occurs.
   */
  public exitToGameplay(fadeSec = 0.5): void {
    this.captureCustomOffsetIfPlaying();
    this.activeInMenu = false;
    this.fadeOutAndStop(fadeSec);
  }

  private startPlaybackInternal(fadeInSec: number): void {
    const ctx = this.ensureGraph();
    if (!ctx || !this.masterGain || !this.synthFilter || !this.customBusGain) return;
    if (ctx.state === 'suspended') {
      this.attachGestureUnlock();
      return;
    }

    const gen = ++this.sessionGen;
    this.stopAllVoices();
    this.isPlaying = true;

    const now = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
    this.masterGain.gain.linearRampToValueAtTime(this.volume, now + fadeInSec);

    if (this.isUsingCustomBuffer() && this.customBuffer) {
      const dur = Math.max(0.1, this.customBuffer.duration);
      const startOff = Math.max(0, Math.min(this.customPausedOffset, dur - 0.08));
      const src = ctx.createBufferSource();
      src.buffer = this.customBuffer;
      src.loop = this.customLoop;
      src.connect(this.customBusGain);

      src.onended = () => {
        if (gen === this.sessionGen && this.bufferSource === src && !this.customLoop) {
          this.isPlaying = false;
          this.customPausedOffset = 0;
          this.bufferSource = null;
        }
      };

      this.customStartedAtOffset = startOff;
      this.customStartContextTime = now;
      src.start(now, startOff);
      this.bufferSource = src;
      return;
    }

    this.scheduleNextChord(gen);
  }

  private scheduleNextChord(gen: number): void {
    if (gen !== this.sessionGen || !this.isPlaying || !this.activeInMenu || !this.enabled) return;
    const ctx = this.ctx;
    if (!ctx || !this.synthFilter) return;

    const spec = PRESET_SPECS[this.preset];
    const chord = spec.chords[this.chordIndex % spec.chords.length];
    this.chordIndex++;

    const now = ctx.currentTime;
    const dur = spec.chordDurationSec;
    const attack = Math.min(2.2, dur * 0.34);
    const release = Math.min(2.4, dur * 0.38);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = spec.filterResonance;
    filter.frequency.setValueAtTime(spec.filterCutoffHz * 0.65, now);
    filter.frequency.linearRampToValueAtTime(spec.filterCutoffHz * 1.25, now + dur * 0.45);
    filter.frequency.linearRampToValueAtTime(spec.filterCutoffHz * 0.72, now + dur);
    filter.connect(this.synthFilter);

    chord.forEach((freq, idx) => {
      const isSub = idx === 0;
      const oscA = ctx.createOscillator();
      oscA.type = isSub ? spec.subWave : spec.padWave;
      oscA.frequency.setValueAtTime(freq, now);
      oscA.detune.setValueAtTime(isSub ? 0 : -spec.detuneCents, now);

      const voiceGain = ctx.createGain();
      const peakGain = isSub ? 0.22 : 0.058 / Math.max(1, chord.length - 1);
      voiceGain.gain.setValueAtTime(0.0001, now);
      voiceGain.gain.linearRampToValueAtTime(peakGain, now + attack);
      voiceGain.gain.setValueAtTime(peakGain, Math.max(now + attack, now + dur - release));
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.35);

      oscA.connect(voiceGain);

      let oscB: OscillatorNode | null = null;
      if (!isSub) {
        oscB = ctx.createOscillator();
        oscB.type = spec.padWave;
        oscB.frequency.setValueAtTime(freq, now);
        oscB.detune.setValueAtTime(spec.detuneCents, now);
        oscB.connect(voiceGain);
      }

      voiceGain.connect(filter);
      oscA.start(now);
      oscA.stop(now + dur + 0.4);
      this.activeNodes.push(oscA);

      if (oscB) {
        oscB.start(now);
        oscB.stop(now + dur + 0.4);
        this.activeNodes.push(oscB);
      }
    });

    if (Math.random() < spec.shimmerProb && chord.length >= 4) {
      const shimmerFreq = chord[chord.length - 1] * 2;
      const shimmerStart = now + dur * 0.28;
      const shimmerOsc = ctx.createOscillator();
      const shimmerGain = ctx.createGain();
      shimmerOsc.type = 'sine';
      shimmerOsc.frequency.setValueAtTime(shimmerFreq, shimmerStart);
      shimmerGain.gain.setValueAtTime(0.0001, shimmerStart);
      shimmerGain.gain.linearRampToValueAtTime(0.018, shimmerStart + 0.45);
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001, shimmerStart + dur * 0.55);
      shimmerOsc.connect(shimmerGain);
      shimmerGain.connect(this.synthFilter);
      shimmerOsc.start(shimmerStart);
      shimmerOsc.stop(shimmerStart + dur * 0.6);
      this.activeNodes.push(shimmerOsc);
    }

    if (this.activeNodes.length > 48) {
      this.activeNodes = this.activeNodes.slice(-24);
    }

    this.schedulerTimer = window.setTimeout(() => {
      this.scheduleNextChord(gen);
    }, (dur - 0.85) * 1000);
  }

  private fadeOutAndStop(fadeSec: number): void {
    this.sessionGen++;
    if (this.schedulerTimer !== null) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (!this.ctx || !this.masterGain || !this.isPlaying) {
      this.isPlaying = false;
      return;
    }

    const gen = this.sessionGen;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
    this.masterGain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);

    window.setTimeout(() => {
      if (gen === this.sessionGen) {
        this.stopAllVoices();
      }
    }, fadeSec * 1000 + 60);
  }

  private stopAllVoices(): void {
    this.isPlaying = false;
    if (this.schedulerTimer !== null) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.bufferSource) {
      try {
        this.bufferSource.onended = null;
        this.bufferSource.stop();
        this.bufferSource.disconnect();
      } catch {
        // Ignore already stopped
      }
      this.bufferSource = null;
    }
    for (const n of this.activeNodes) {
      try {
        n.stop();
        n.disconnect();
      } catch {
        // Ignore already stopped
      }
    }
    this.activeNodes = [];
  }

  public dispose(): void {
    this.activeInMenu = false;
    this.stopAllVoices();
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.masterGain = null;
    this.synthFilter = null;
    this.customBusGain = null;
    this.analyser = null;
  }

  public getAmbientBands(elapsedSec = performance.now() * 0.001): MenuAmbientBands {
    if (this.analyser && this.freqData && this.isPlaying && this.ctx?.state === 'running') {
      this.analyser.getByteFrequencyData(this.freqData);
      const len = this.freqData.length;
      const avg = (a: number, b: number) => {
        const s = Math.max(0, Math.min(len - 1, a));
        const e = Math.max(s + 1, Math.min(len, b));
        let sum = 0;
        for (let i = s; i < e; i++) sum += this.freqData![i];
        return Math.min(1, sum / ((e - s) * 255));
      };
      const subBass = avg(0, 2);
      const bass = avg(2, 5);
      const lowMid = avg(5, 11);
      const mid = avg(11, 26);
      const highMid = avg(26, 56);
      const treble = avg(56, 110);
      const energy = Math.min(
        1,
        subBass * 0.2 + bass * 0.25 + lowMid * 0.2 + mid * 0.2 + (highMid + treble) * 0.075,
      );
      if (energy > 0.02) {
        return { subBass, bass, lowMid, mid, highMid, treble, energy, active: true };
      }
    }

    const breath = 0.5 + 0.5 * Math.sin(elapsedSec * 0.85);
    const shimmer = 0.5 + 0.5 * Math.sin(elapsedSec * 1.45 + 1.2);
    return {
      subBass: 0.12 + breath * 0.12,
      bass: 0.14 + breath * 0.14,
      lowMid: 0.12 + shimmer * 0.1,
      mid: 0.1 + shimmer * 0.12,
      highMid: 0.08 + shimmer * 0.1,
      treble: 0.06 + shimmer * 0.1,
      energy: 0.14 + breath * 0.12,
      active: false,
    };
  }
}

export const menuAmbientAudio = new MenuAmbientAudioService();
