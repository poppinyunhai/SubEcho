const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
async function run(fetcher, consent = true) {
  let connect;
  const messages = [];
  const port = { name: 'mimo-tts', sender: { tab: { id: 1 }, url: 'https://www.youtube.com/watch?v=test' },
    onDisconnect: { addListener(fn) { port.close = fn; } },
    onMessage: { addListener(fn) { port.request = fn; } },
    postMessage(message) { messages.push(message); } };
  const sandbox = { AbortController, TextDecoder, TypeError, setTimeout(fn, ms) {
    if (ms !== 25000) queueMicrotask(fn); return 1;
  }, clearTimeout() {}, fetch: fetcher,
    chrome: { storage: { local: {
      async setAccessLevel() {}, async get() { return { apiKey: 'test-key', voice: '冰糖', consent }; }
    } }, runtime: { onConnect: { addListener(fn) { connect = fn; } }, onMessage: { addListener() {} } } }
  };
  vm.createContext(sandbox);
  sandbox.importScripts = () => vm.runInContext(fs.readFileSync('core.js', 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync('background.js', 'utf8'), sandbox);
  connect(port);
  await port.request({ type: 'synthesize', text: '你好。' });
  return messages;
}
function audioResponse(partialFailure = false) {
  let index = 0;
  return { ok: true, body: { getReader() { return {
    async read() {
      if (index++ === 0) return { done: false, value: new TextEncoder().encode('data: {"choices":[{"delta":{"audio":{"data":"AAA="}}}]}\n\n') };
      if (partialFailure) throw new TypeError('connection reset');
      return { done: true };
    }, async cancel() {}
  }; } } };
}
test('rate limiting retries before audio and eventually completes', async () => {
  let calls = 0;
  const messages = await run(async () => ++calls === 1
    ? { ok: false, status: 429, headers: { get: () => '2' }, body: { async cancel() {} } }
    : audioResponse());
  assert.equal(calls, 2);
  assert.equal(messages[0].type, 'retry');
  assert.equal(messages[0].delay, 2000);
  assert.equal(messages.at(-1).type, 'done');
});
test('network failures have a bounded retry count', async () => {
  let calls = 0;
  const messages = await run(async () => { calls++; throw new TypeError('network'); });
  assert.equal(calls, 3);
  assert.equal(messages.filter(m => m.type === 'retry').length, 2);
  assert.equal(messages.at(-1).recoverable, true);
});
test('partial speech is never synthesized again on stream failure', async () => {
  let calls = 0;
  const messages = await run(async () => { calls++; return audioResponse(true); });
  assert.equal(calls, 1);
  assert.equal(messages[0].type, 'audio');
  assert.equal(messages.at(-1).type, 'error');
});
test('no data is sent without explicit consent', async () => {
  let calls = 0;
  const messages = await run(async () => { calls++; return audioResponse(); }, false);
  assert.equal(calls, 0);
  assert.equal(messages.at(-1).recoverable, false);
});
