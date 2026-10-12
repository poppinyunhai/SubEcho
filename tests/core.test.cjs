const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../core.js');
const { addedText, SSEParser, pcmSamples } = global.MimoCore;
test('rolling subtitles only read newly appended words', () => {
  assert.equal(addedText('你好', '你好 世界'), '世界');
  assert.equal(addedText('你好 世界', '你好 世界'), '');
  assert.equal(addedText('第一行 第二行', '第二行 第三行'), '第三行');
  assert.equal(addedText('旧字幕', '全新一句'), '全新一句');
  assert.equal(addedText('', '  你好\n世界 '), '你好 世界');
});
test('SSE survives network chunk boundaries and CRLF', () => {
  const events = [];
  const parser = new SSEParser(data => events.push(data));
  parser.push('data: {"choices":[{"delta":{"audio":{"data":"YW');
  parser.push('Jj"}}}]}\r');
  parser.push('\n\r\ndata: [DONE]\r\n\r\n');
  parser.push('data: {"usage":1}', true);
  assert.equal(events.length, 2);
  assert.equal(events[0].choices[0].delta.audio.data, 'YWJj');
});
test('PCM16 is little endian and signed at 24kHz', () => {
  assert.deepEqual([...pcmSamples(Uint8Array.from([0, 128, 0, 0, 255, 127]))], [-1, 0, 32767 / 32768]);
});
test('retry backoff respects Retry-After but has a finite cap', () => {
  assert.equal(MimoCore.retryDelay(0), 1000);
  assert.equal(MimoCore.retryDelay(1), 2000);
  assert.equal(MimoCore.retryDelay(0, '5'), 5000);
  assert.equal(MimoCore.retryDelay(0, '999'), 10000);
  assert.equal(MimoCore.retryDelay(0, 'invalid'), 1000);
});
