const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function harness(mode = 'direct') {
  const events = {}, listeners = [], connections = [];
  let tick, text = '', time = 0;
  const button = { style: {}, append() {}, addEventListener() {} };
  const video = { volume: .8, currentTime: 10, playbackRate: 1, paused: false, seeking: false,
    addEventListener(event, fn) { events[event] = fn; }, removeEventListener() {} };
  const container = { getClientRects: () => [1], querySelectorAll: () => text ? [{ textContent: text }] : [] };
  class AudioContext {
    constructor() { this.state = 'running'; this.currentTime = 0; }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    close() {}
  }
  const sandbox = { URL, Uint8Array, Float32Array, DataView, AudioContext,
    performance: { now: () => time }, location: { href: 'https://www.youtube.com/watch?v=test' },
    window: { addEventListener() {} }, setInterval(fn) { tick = fn; },
    document: { createElement: () => button, documentElement: { append() {} },
      querySelector: selector => selector.includes('video') ? video : selector.includes('caption') ? container : null },
    chrome: { runtime: {
      onMessage: { addListener(fn) { listeners.push(fn); } },
      async sendMessage() { return { rate: 1.15, originalVolume: .15, mode }; },
      connect() { const p = { messages: [], disconnected: false,
        onMessage: { addListener(fn) { p.receive = fn; } },
        onDisconnect: { addListener(fn) { p.onClose = fn; } },
        postMessage(m) { p.messages.push(m); },
        disconnect() { p.disconnected = true; p.onClose?.(); } }; connections.push(p); return p; }
    } }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('core.js', 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync('content.js', 'utf8'), sandbox);
  return { video, events, connections, async message(m) { return await new Promise(resolve => listeners[0](m, {}, resolve)); },
    tick(ms, caption = text) { time = ms; text = caption; tick(); } };
}
test('seek cancels pending synthesis and stop restores volume', async () => {
  const h = harness();
  h.tick(0);
  assert.equal((await h.message({ type: 'toggle', enabled: true })).enabled, true);
  assert.equal(h.video.volume, .15);
  await Promise.resolve();
  h.tick(600, '你好世界。'); h.tick(1000);
  assert.equal(h.connections.length, 1);
  const port = h.connections[0];
  assert.equal(port.messages[0].text, '你好世界。');
  h.video.seeking = true; h.events.seeking();
  assert.equal(port.disconnected, true);
  // A late response from the cancelled generation must be ignored.
  port.receive({ type: 'audio', data: 'AAAA' });
  await h.message({ type: 'toggle', enabled: false });
  assert.equal(h.video.volume, .8);
});
test('paused video never sends subtitles until resumed', async () => {
  const h = harness(); h.tick(0);
  h.video.paused = true;
  await h.message({ type: 'toggle', enabled: true });
  h.tick(600, '暂停中的字幕。'); h.tick(1100);
  assert.equal(h.connections.length, 0);
  h.video.paused = false; h.events.play(); await Promise.resolve();
  h.tick(1400, '播放后的字幕。'); h.tick(1800);
  assert.equal(h.connections.length, 1);
  assert.equal(h.connections[0].messages[0].text, '播放后的字幕。');
});
test('transient failure recovers after cooldown without replaying the failed sentence', async () => {
  const h = harness(); h.tick(0);
  await h.message({ type: 'toggle', enabled: true }); await Promise.resolve();
  h.tick(600, '第一句。'); h.tick(1000);
  h.connections[0].receive({ type: 'error', message: '网络连接失败', recoverable: true });
  h.tick(2000, '第二句。'); h.tick(2400);
  assert.equal(h.connections.length, 1);
  h.tick(11200);
  assert.equal(h.connections.length, 2);
  assert.equal(h.connections[1].messages[0].text, '第二句。');
});
test('credential failure requires a settings correction rather than endless retries', async () => {
  const h = harness(); h.tick(0);
  await h.message({ type: 'toggle', enabled: true }); await Promise.resolve();
  h.tick(600, '第一句。'); h.tick(1000);
  h.connections[0].receive({ type: 'error', message: 'API Key 无效', recoverable: false });
  h.tick(20000, '第二句。'); h.tick(20500);
  assert.equal(h.connections.length, 1);
  assert.equal((await h.message({ type: 'state' })).status, 'API Key 无效');
});

test('translation receives prior caption context and ignores results after a seek', async () => {
  const h = harness('translate'); h.tick(0);
  await h.message({ type: 'toggle', enabled: true }); await Promise.resolve();
  h.tick(600, 'We use a cache.'); h.tick(1000);
  h.connections[0].receive({ type: 'translated', original: 'We use a cache.', translation: '我们使用缓存。' });
  h.connections[0].receive({ type: 'done' });
  h.tick(1400, 'It is fast.'); h.tick(1800);
  assert.deepEqual(Array.from(h.connections[1].messages[0].context), ['We use a cache.']);
  h.video.seeking = true; h.events.seeking();
  assert.equal(h.connections[1].disconnected, true);
  const before = (await h.message({ type: 'state' })).status;
  h.connections[1].receive({ type: 'translated', original: 'It is fast.', translation: '它很快。' });
  assert.equal((await h.message({ type: 'state' })).status, before);
});
