import { describe, expect, it } from 'vitest';
import {
  countReadyQueueSegments,
  createTTSQueueSegment,
  getRelevantQueueSSMLs,
  isSpeakableSSML,
  rebuildTTSSpeechQueue,
  updateTTSQueueSegmentState,
} from '@/lib/tts-queue';

const wrap = (text: string) =>
  `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">${text}</speak>`;

const identityBuild = (content: string) => content;

describe('tts-queue', () => {
  it('detects speakable SSML', () => {
    expect(isSpeakableSSML(wrap('你好世界'))).toBe(true);
    expect(isSpeakableSSML(null)).toBe(false);
    expect(isSpeakableSSML(wrap('...'))).toBe(false);
  });

  it('creates segments and updates state', () => {
    const segment = createTTSQueueSegment(wrap('第一句内容'), 0, 'current', identityBuild);
    expect(segment).not.toBeNull();
    expect(segment?.state).toBe('idle');
    expect(segment?.text).toContain('第一句');

    const next = updateTTSQueueSegmentState([segment!], segment!.id, 'playing');
    expect(next[0].state).toBe('playing');
  });

  it('rebuilds queue with lookahead and dedupes enhanced SSML', () => {
    const current = wrap('当前句子内容足够长');
    const queue = rebuildTTSSpeechQueue(
      current,
      [wrap('下一句内容足够长'), wrap('下一句内容足够长'), wrap('再下一句内容足够')],
      identityBuild
    );
    expect(queue[0]?.source).toBe('current');
    expect(queue.length).toBe(3);
    expect(getRelevantQueueSSMLs(queue)).toHaveLength(3);
  });

  it('counts ready segments', () => {
    const a = createTTSQueueSegment(wrap('句子一内容足够'), 0, 'lookahead', identityBuild)!;
    const b = createTTSQueueSegment(wrap('句子二内容足够'), 1, 'lookahead', identityBuild)!;
    const queue = updateTTSQueueSegmentState([a, b], a.id, 'ready');
    expect(countReadyQueueSegments(queue)).toBe(1);
  });
});
