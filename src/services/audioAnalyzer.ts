import type { MusicProfile } from '../types/game';
import { ANALYSIS_VERSION, analyzePcmData } from './dspCore';

export { ANALYSIS_VERSION };

let workerJobId = 1;

function downmixToMono(audioBuffer: AudioBuffer): Float32Array {
  const length = audioBuffer.length;
  const channels = audioBuffer.numberOfChannels;
  const mono = new Float32Array(length);
  const gain = 1 / Math.max(1, channels);

  for (let ch = 0; ch < channels; ch++) {
    const chData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += chData[i] * gain;
    }
  }
  return mono;
}

async function runInWorker(
  mono: Float32Array,
  sampleRate: number,
  duration: number,
): Promise<MusicProfile> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./audioAnalysis.worker.ts', import.meta.url), {
      type: 'module',
    });
    const jobId = workerJobId++;

    const cleanup = () => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };

    worker.onmessage = (
      event: MessageEvent<{ id: number; ok: boolean; profile?: MusicProfile; error?: string }>,
    ) => {
      if (event.data.id !== jobId) return;
      cleanup();
      if (event.data.ok && event.data.profile) {
        resolve(event.data.profile);
      } else {
        reject(new Error(event.data.error ?? 'Worker audio analysis failed'));
      }
    };

    worker.onerror = (err) => {
      cleanup();
      reject(err instanceof Error ? err : new Error('Audio worker execution error'));
    };

    // Zero-copy transfer of PCM buffer to background worker thread
    worker.postMessage({ id: jobId, mono, sampleRate, duration }, [mono.buffer]);
  });
}

export async function analyzeAudioBuffer(audioBuffer: AudioBuffer): Promise<MusicProfile> {
  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;
  const mono = downmixToMono(audioBuffer);

  if (typeof Worker !== 'undefined') {
    try {
      // Keep a fallback copy only if worker instantiation throws synchronously;
      // if transfer happens and fails mid-run, fallback decodes again from audioBuffer.
      return await runInWorker(mono, sampleRate, duration);
    } catch {
      // Fallback to main thread DSP using freshly extracted mono PCM
      const fallbackMono = downmixToMono(audioBuffer);
      return analyzePcmData(fallbackMono, sampleRate, duration);
    }
  }

  return analyzePcmData(mono, sampleRate, duration);
}
