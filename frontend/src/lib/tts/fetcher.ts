import { API_BASE, createAbortController } from '@/lib/config';
import { handleAuthResponse } from '@/lib/api';
import { getAccessGeneration } from '@/lib/library-access';
import { parseTTSRetryAfter, TTSRequestError } from '@/lib/tts-request';
import { TTS_REQUEST_TIMEOUT_MS } from './types';

export class TTSAudioFetcher {
  private activeAbortController: AbortController | null = null;
  private providerRetryNotBefore = 0;
  private providerRetryError: TTSRequestError | null = null;

  abortActive(): void {
    this.activeAbortController?.abort();
    this.activeAbortController = null;
  }

  async fetchActive(ssml: string, refreshAudio: boolean): Promise<Blob> {
    const { controller, timeoutId } = createAbortController(TTS_REQUEST_TIMEOUT_MS);
    this.activeAbortController = controller;
    try {
      return await this.fetchWithController(ssml, controller, refreshAudio);
    } finally {
      clearTimeout(timeoutId);
      if (this.activeAbortController === controller) {
        this.activeAbortController = null;
      }
    }
  }

  async fetchWithController(
    ssml: string,
    controller: AbortController,
    refreshAudio = false,
  ): Promise<Blob> {
    if (this.providerRetryError && Date.now() < this.providerRetryNotBefore) {
      throw new TTSRequestError(
        this.providerRetryError.status,
        this.providerRetryError.code,
        this.providerRetryNotBefore - Date.now(),
      );
    }

    const generation = getAccessGeneration();
    const response = await fetch(`${API_BASE}/api/ssml`, {
      credentials: 'include',
      cache: 'no-store',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ssml,
        output_format: 'audio-24khz-48kbitrate-mono-mp3',
        refresh_audio: refreshAudio || undefined,
      }),
      signal: controller.signal,
    });

    if (generation !== getAccessGeneration()) {
      throw new DOMException('登录状态已变更', 'AbortError');
    }
    handleAuthResponse(response, generation);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: string } | null;
      const error = new TTSRequestError(
        response.status,
        body?.code,
        parseTTSRetryAfter(response.headers.get('Retry-After')),
      );
      // A failed background prefetch must not discard a provider's cooldown.
      // It applies to every following chunk, including a different SSML key.
      if ([429, 503].includes(response.status) && error.retryAfterMs > 0) {
        const retryNotBefore = Date.now() + error.retryAfterMs;
        if (retryNotBefore > this.providerRetryNotBefore) {
          this.providerRetryNotBefore = retryNotBefore;
          this.providerRetryError = error;
        }
      }
      throw error;
    }

    const audio = await response.blob();
    if (generation !== getAccessGeneration()) {
      throw new DOMException('登录状态已变更', 'AbortError');
    }
    return audio;
  }
}
