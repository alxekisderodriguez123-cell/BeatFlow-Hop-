import { analyzePcmData } from './dspCore';

interface WorkerAnalyzeRequest {
  id: number;
  mono: Float32Array;
  sampleRate: number;
  duration: number;
}

self.onmessage = (event: MessageEvent<WorkerAnalyzeRequest>) => {
  const { id, mono, sampleRate, duration } = event.data;
  try {
    const profile = analyzePcmData(mono, sampleRate, duration);
    self.postMessage({ id, ok: true, profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'DSP analysis failed';
    self.postMessage({ id, ok: false, error: message });
  }
};
