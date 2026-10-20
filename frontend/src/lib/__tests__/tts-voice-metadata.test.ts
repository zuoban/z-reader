import { expect, it } from 'vitest';
import { mergeVoicesWithFallback } from '@/lib/tts';

it('uses provider metadata and stable short voice names before filling fallback gaps', () => {
  const shortName = 'zh-CN-XiaoxiaoMultilingualNeural';
  const voices = mergeVoicesWithFallback([{
    Name: 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaoxiaoMultilingualNeural)',
    ShortName: shortName, DisplayName: 'live', LocalName: '实时晓晓', Gender: 'Female',
    Locale: 'zh-CN', StyleList: ['new-style'],
  }]);
  expect(voices.filter(voice => voice.ShortName === shortName)).toHaveLength(1);
  expect(voices.find(voice => voice.Name === shortName)?.StyleList).toEqual(['new-style']);
  expect(voices.find(voice => voice.Name === shortName)?.LocalName).toBe('实时晓晓');
});
