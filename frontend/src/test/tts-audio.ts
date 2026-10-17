import { vi } from 'vitest';

/** Models pause/ended ordering and asynchronous media events, without a decoder. */
export class TestAudio {
  static instances: TestAudio[] = [];
  paused = true;
  ended = false;
  error: MediaError | null = null;
  currentTime = 0;
  duration = 30;
  preload = '';
  autoplay = false;
  crossOrigin = '';
  playCalls = 0;
  loadCalls = 0;
  sources: string[] = [];
  playError: Error | null = null;
  onplay: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  private source = '';

  constructor() { TestAudio.instances.push(this); }
  get src() { return this.source; }
  set src(value: string) {
    this.pause();
    this.source = value;
    this.sources.push(value);
    this.currentTime = 0;
    this.ended = false;
  }
  setAttribute() {}
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  load() { this.loadCalls += 1; }
  async play() {
    this.playCalls += 1;
    if (this.playError) throw this.playError;
    this.paused = false;
    queueMicrotask(() => this.onplay?.());
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    queueMicrotask(() => this.onpause?.());
  }
  finish() {
    this.currentTime = this.duration;
    this.ended = true;
    this.pause();
    queueMicrotask(() => this.onended?.());
  }
  tick(seconds: number) {
    this.currentTime = seconds;
    this.ontimeupdate?.();
  }
}

export function installTestAudio() {
  vi.stubGlobal('Audio', TestAudio);
  let id = 0;
  const NativeURL = URL;
  vi.stubGlobal('URL', class extends NativeURL {
    static createObjectURL = vi.fn(() => `blob:tts-test-${++id}`);
    static revokeObjectURL = vi.fn();
  });
}

export function audioResponse() {
  return { ok: true, status: 200, blob: async () => new Blob(['mp3']) } as Response;
}

export async function flushMediaEvents() {
  await Promise.resolve();
  await Promise.resolve();
}
