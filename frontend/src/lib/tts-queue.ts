import {
  getTextFromSSML,
  isSkippableTTSText,
} from '@/lib/tts';
import {
  TTS_LOOKAHEAD_SENTENCE_COUNT,
  createTTSQueueSegmentId,
  type TTSQueueSegment,
  type TTSQueueSegmentState,
} from '@/lib/tts-helpers';

export function isSpeakableSSML(ssml: string | null | undefined): ssml is string {
  if (!ssml) return false;
  const text = getTextFromSSML(ssml);
  return Boolean(text && !isSkippableTTSText(text));
}

export function createTTSQueueSegment(
  ssml: string,
  index: number,
  source: TTSQueueSegment['source'],
  buildSSML: (content: string) => string
): TTSQueueSegment | null {
  const text = getTextFromSSML(ssml);
  if (!text || isSkippableTTSText(text)) return null;

  const enhancedSSML = buildSSML(ssml);
  const fallbackSSML = buildSSML(text);
  return {
    id: createTTSQueueSegmentId(enhancedSSML, index),
    index,
    source,
    ssml,
    enhancedSSML,
    fallbackSSML,
    text,
    state: source === 'current' ? 'idle' : 'queued',
    createdAt: Date.now(),
  };
}

export function updateTTSQueueSegmentState(
  queue: TTSQueueSegment[],
  segmentId: string,
  nextState: TTSQueueSegmentState
): TTSQueueSegment[] {
  return queue.map((segment) => {
    if (segment.id !== segmentId) return segment;
    return { ...segment, state: nextState };
  });
}

export function getRelevantQueueSSMLs(queue: TTSQueueSegment[]): string[] {
  return queue
    .filter((segment) => segment.state !== 'failed' && segment.state !== 'skipped')
    .map((segment) => segment.enhancedSSML);
}

export function countReadyQueueSegments(queue: TTSQueueSegment[]): number {
  return queue.filter((segment) => segment.state === 'ready').length;
}

/**
 * Build a speak queue from the current SSML + lookahead list.
 * Deduplicates by enhanced SSML content.
 */
export function rebuildTTSSpeechQueue(
  currentSSML: string | undefined,
  lookaheadSSMLs: string[],
  buildSSML: (content: string) => string
): TTSQueueSegment[] {
  const rawSegments = [
    ...(currentSSML ? [{ ssml: currentSSML, source: 'current' as const }] : []),
    ...lookaheadSSMLs.slice(0, TTS_LOOKAHEAD_SENTENCE_COUNT).map((ssml) => ({
      ssml,
      source: 'lookahead' as const,
    })),
  ];

  const seen = new Set<string>();
  const queue: TTSQueueSegment[] = [];

  rawSegments.forEach((rawSegment) => {
    const segment = createTTSQueueSegment(
      rawSegment.ssml,
      queue.length,
      rawSegment.source,
      buildSSML
    );
    if (!segment || seen.has(segment.enhancedSSML)) return;
    seen.add(segment.enhancedSSML);
    queue.push(segment);
  });

  return queue;
}
