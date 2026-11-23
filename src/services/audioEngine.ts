export interface RealtimeAudioBands {
  currentTime: number;
  subBass: number;
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  treble: number;
  high: number;
  energy: number;
  isPlaying: boolean;
}

/**
 * Web Audio Engine for Beatflow Hop.
 * - Routes source -> analyser -> musicGain -> destination so real-time 6-band FFT analysis
 *   always inspects full-scale song audio independent of music/SFX volume sliders.
 * - Separates independent buses for Music, Ambient Effects, Impact Effects, and UI Sounds.
 * - Never emits artificial click/beep tones when touching lanes or hitting notes.
 */
class BeatflowAudioEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private impactGain: GainNode | null = null;
  private uiGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;

  private activeBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;

  private musicVolume = 0.85;
  private ambientVolume = 0.7;
  private impactVolume = 0.6;
  private uiVolume = 0.55;
  private uiSoundsEnabled = true;
  private userOffsetSec = 0;

  private isPlayingState = false;
  private startContextTime = 0;
  private pausedOffset = 0;
  private playbackGeneration = 0;
  private onEndedCallback: (() => void) | null = null;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = this.ambientVolume;

      this.impactGain = this.ctx.createGain();
      this.impactGain.gain.value = this.impactVolume;

      this.uiGain = this.ctx.createGain();
      this.uiGain.gain.value = this.uiSoundsEnabled ? this.uiVolume : 0;

      // 512 FFT (~86 Hz per bin at 44.1 kHz) for clean real-time 6-band visualizers
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.72;
      this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

      // Analyser taps full-scale signal before musicGain so volume changes never mute DSP visuals
      this.analyser.connect(this.musicGain);
      this.musicGain.connect(this.ctx.destination);
      this.ambientGain.connect(this.ctx.destination);
      this.impactGain.connect(this.ctx.destination);
      this.uiGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private getHardwareOutputLatency(): number {
    if (!this.ctx) return 0;
    const base = Number.isFinite(this.ctx.baseLatency) ? this.ctx.baseLatency : 0;
    const out = Number.isFinite((this.ctx as AudioContext & { outputLatency?: number }).outputLatency)
      ? ((this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0)
      : 0;
    return Math.max(0, Math.min(0.12, base + out));
  }

  async decodeBlob(blob: Blob): Promise<AudioBuffer> {
    const ctx = this.ensureContext();
    const arrayBuf = await blob.arrayBuffer();
    return ctx.decodeAudioData(arrayBuf.slice(0));
  }

  setBuffer(buffer: AudioBuffer): void {
    this.stopMusic();
    this.activeBuffer = buffer;
    this.pausedOffset = 0;
  }

  setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.02);
    }
  }

  setAmbientVolume(v: number): void {
    this.ambientVolume = Math.max(0, Math.min(1, v));
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(this.ambientVolume, this.ctx.currentTime, 0.02);
    }
  }

  setImpactVolume(v: number): void {
    this.impactVolume = Math.max(0, Math.min(1, v));
    if (this.impactGain && this.ctx) {
      this.impactGain.gain.setTargetAtTime(this.impactVolume, this.ctx.currentTime, 0.02);
    }
  }

  setUiVolume(v: number, enabled = this.uiSoundsEnabled): void {
    this.uiVolume = Math.max(0, Math.min(1, v));
    this.uiSoundsEnabled = enabled;
    if (this.uiGain && this.ctx) {
      this.uiGain.gain.setTargetAtTime(
        this.uiSoundsEnabled ? this.uiVolume : 0,
        this.ctx.currentTime,
        0.02,
      );
    }
  }

  setSfxVolume(v: number): void {
    // Legacy helper preserved for backwards compatibility
    const clamped = Math.max(0, Math.min(1, v));
    this.setAmbientVolume(clamped);
    this.setImpactVolume(clamped);
  }

  setAudioOffsetMs(ms: number): void {
    const clamped = Math.max(-150, Math.min(150, ms));
    this.userOffsetSec = clamped / 1000;
  }

  playMusic(offsetSeconds = 0, onEnded?: () => void): void {
    if (!this.activeBuffer) return;
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    this.playbackGeneration++;
    const gen = this.playbackGeneration;
    this.stopSourceOnly();

    const duration = this.activeBuffer.duration;
    const safeOffset = Math.max(0, Math.min(offsetSeconds, Math.max(0, duration - 0.04)));
    const source = ctx.createBufferSource();
    source.buffer = this.activeBuffer;
    source.connect(this.analyser!);

    this.onEndedCallback = onEnded ?? null;
    source.onended = () => {
      if (gen === this.playbackGeneration && this.sourceNode === source && this.isPlayingState) {
        this.isPlayingState = false;
        this.pausedOffset = this.activeBuffer?.duration ?? 0;
        const cb = this.onEndedCallback;
        this.onEndedCallback = null;
        cb?.();
      }
    };

    const scheduleAt = ctx.currentTime + 0.018;
    this.sourceNode = source;
    this.pausedOffset = safeOffset;
    this.startContextTime = scheduleAt - safeOffset;
    this.isPlayingState = true;
    source.start(scheduleAt, safeOffset);
  }

  seek(offsetSeconds: number): void {
    if (!this.activeBuffer) return;
    const clamped = Math.max(0, Math.min(offsetSeconds, Math.max(0, this.activeBuffer.duration - 0.04)));
    if (this.isPlayingState) {
      const cb = this.onEndedCallback ?? undefined;
      this.playMusic(clamped, cb);
    } else {
      this.pausedOffset = clamped;
    }
  }

  pauseMusic(): void {
    if (!this.isPlayingState || !this.ctx) return;
    this.pausedOffset = this.getCurrentTimeRaw();
    this.isPlayingState = false;
    this.playbackGeneration++;
    this.stopSourceOnly();
  }

  resumeMusic(onEnded?: () => void): void {
    if (this.isPlayingState || !this.activeBuffer) return;
    this.playMusic(this.pausedOffset, onEnded ?? this.onEndedCallback ?? undefined);
  }

  stopMusic(): void {
    this.isPlayingState = false;
    this.pausedOffset = 0;
    this.playbackGeneration++;
    this.onEndedCallback = null;
    this.stopSourceOnly();
  }

  private stopSourceOnly(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null;
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {
        // Already stopped
      }
      this.sourceNode = null;
    }
  }

  private getCurrentTimeRaw(): number {
    if (!this.ctx || !this.isPlayingState) return this.pausedOffset;
    const raw = this.ctx.currentTime - this.startContextTime;
    const duration = this.activeBuffer?.duration ?? raw;
    return Math.max(0, Math.min(duration, raw));
  }

  getCurrentTime(): number {
    if (!this.ctx || !this.isPlayingState) return this.pausedOffset;
    const compensated =
      this.ctx.currentTime -
      this.startContextTime -
      this.getHardwareOutputLatency() +
      this.userOffsetSec;
    const duration = this.activeBuffer?.duration ?? compensated;
    return Math.max(0, Math.min(duration, compensated));
  }

  getDuration(): number {
    return this.activeBuffer?.duration ?? 0;
  }

  getRealtimeAudioState(sensitivity = 1.0): RealtimeAudioBands {
    const currentTime = this.getCurrentTime();
    if (!this.analyser || !this.freqData || !this.isPlayingState) {
      return {
        currentTime,
        subBass: 0.06,
        bass: 0.08,
        lowMid: 0.07,
        mid: 0.06,
        highMid: 0.05,
        treble: 0.04,
        high: 0.05,
        energy: 0.07,
        isPlaying: this.isPlayingState,
      };
    }

    this.analyser.getByteFrequencyData(this.freqData);
    const len = this.freqData.length;
    const sens = Math.max(0.4, Math.min(2.0, sensitivity));

    const avgRange = (start: number, end: number): number => {
      const a = Math.max(0, Math.min(len - 1, start));
      const b = Math.max(a + 1, Math.min(len, end));
      let sum = 0;
      for (let i = a; i < b; i++) sum += this.freqData![i];
      return Math.min(1.35, (sum / ((b - a) * 255)) * sens);
    };

    const subBass = avgRange(0, 1);
    const bass = avgRange(1, 3);
    const lowMid = avgRange(3, 6);
    const mid = avgRange(6, 23);
    const highMid = avgRange(23, 64);
    const treble = avgRange(64, 150);
    const high = highMid * 0.58 + treble * 0.42;
    const energy = Math.min(
      1.3,
      subBass * 0.16 + bass * 0.28 + lowMid * 0.18 + mid * 0.22 + high * 0.16,
    );

    return {
      currentTime,
      subBass,
      bass,
      lowMid,
      mid,
      highMid,
      treble,
      high,
      energy,
      isPlaying: this.isPlayingState,
    };
  }

  // ---- Non-intrusive Ambient, Impact & Optional UI Audio ----
  // Note: Lane touch & tile hits intentionally produce NO artificial clicks/beeps.

  /** Warm harmonic shimmer swell when Fever Mode triggers (Ambient bus) */
  playFeverActivateSound(): void {
    if (this.ambientVolume <= 0.01) return;
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1100, now);
    filter.frequency.exponentialRampToValueAtTime(2600, now + 0.35);
    filter.connect(this.ambientGain!);

    const chord = [261.63, 392.0, 523.25, 659.25];
    chord.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.025;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.09);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.62);
      osc.connect(gain);
      gain.connect(filter);
      osc.start(t);
      osc.stop(t + 0.64);
    });
  }

  /** Subtle low sub-boom impact for cinematic drops (Impact bus) */
  playDropImpactSound(): void {
    if (this.impactVolume <= 0.01) return;
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.28);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.32);

    osc.connect(gain);
    gain.connect(this.impactGain!);
    osc.start(now);
    osc.stop(now + 0.34);
  }

  /** Subtle low thud on note miss (Impact bus) */
  playMissSound(): void {
    if (this.impactVolume <= 0.01) return;
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(360, now);
    filter.connect(this.impactGain!);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.16);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.18);

    osc.connect(gain);
    gain.connect(filter);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /** Gentle ambient descent on match defeat (Ambient bus) */
  playGameOverSound(): void {
    if (this.ambientVolume <= 0.01) return;
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    const notes = [261.63, 220.0, 174.61, 130.81];
    notes.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.12;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.28);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.34);

      osc.connect(gain);
      gain.connect(this.ambientGain!);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  /** Warm harmonic resolution chord on song completion (Ambient bus) */
  playVictorySound(): void {
    if (this.ambientVolume <= 0.01) return;
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    const notes = [392.0, 493.88, 587.33, 783.99];
    notes.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.085;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.48);

      osc.connect(gain);
      gain.connect(this.ambientGain!);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  /** Optional UI navigation sound (UI bus; completely mutable without affecting music or DSP) */
  playUiTick(): void {
    if (!this.uiSoundsEnabled || this.uiVolume <= 0.01) return;
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(740, now);
    osc.frequency.exponentialRampToValueAtTime(560, now + 0.032);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.042);

    osc.connect(gain);
    gain.connect(this.uiGain!);
    osc.start(now);
    osc.stop(now + 0.048);
  }
}

export const audioEngine = new BeatflowAudioEngine();
