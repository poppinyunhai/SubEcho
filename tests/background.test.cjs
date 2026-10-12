const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
async function run(fetcher, consent = true, settings = {}, request = {}, onPort = () => {}) {
  let connect;
  const messages = [];
  const port = { name: 'mimo-tts', sender: { tab: { id: 1 }, url: 'https://www.youtube.com/watch?v=test' },
    onDisconnect: { addListener(fn) { port.close = fn; } },
    onMessage: { addListener(fn) { port.request = fn; } },
    postMessage(message) { messages.push(message); } };
  const sandbox = { AbortController, DOMException, TextDecoder, TypeError, setTimeout(fn, ms) {
    if (ms !== 25000) queueMicrotask(fn); return 1;
  }, clearTimeout() {}, fetch: fetcher,
    chrome: { storage: { local: {
      async setAccessLevel() {}, async get() { return { apiKey: 'test-key', voice: '冰糖', consent, ...settings }; }
    } }, runtime: { onConnect: { addListener(fn) { connect = fn; } }, onMessage: { addListener() {} } } }
  };
  vm.createContext(sandbox);
  sandbox.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox));
  vm.runInContext(fs.readFileSync('background.js', 'utf8'), sandbox);
  connect(port); onPort(port);
  await port.request({ type: 'synthesize', text: '你好。', ...request });
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

test('AI mode translates with context, then sends only the Chinese result to TTS', async () => {
  const bodies = [];
  const messages = await run(async (url, options) => {
    const body = JSON.parse(options.body); bodies.push(body);
    if (bodies.length === 1) return { ok: true, async json() { return { choices: [{ finish_reason: 'stop', message: { content: '它不会改变结果。' } }] }; } };
    return audioResponse();
  }, true, { mode: 'translate', translationConsent: true, translationModel: 'mimo-v2.6-pro' },
  { text: 'It does not change the result.', context: ['We use a cache.'] });
  assert.equal(bodies[0].model, 'mimo-v2.6-pro');
  assert.equal(bodies[0].thinking.type, 'disabled');
  assert.deepEqual(JSON.parse(bodies[0].messages[1].content), { previous: ['We use a cache.'], current: 'It does not change the result.' });
  assert.equal(bodies[1].model, 'mimo-v2.5-tts');
  assert.equal(bodies[1].messages[1].content, '它不会改变结果。');
  assert.equal(messages.find(m => m.type === 'translated').original, 'It does not change the result.');
  assert.equal(messages.at(-1).type, 'done');
});
test('translation mode requires its own consent', async () => {
  let calls = 0;
  const messages = await run(async () => { calls++; return audioResponse(); }, true, { mode: 'translate' });
  assert.equal(calls, 0);
  assert.equal(messages.at(-1).type, 'error');
});
test('empty or truncated translation is never spoken as original English', async () => {
  for (const result of [ { finish_reason: 'stop', message: { content: '' } }, { finish_reason: 'length', message: { content: '部分译文' } } ]) {
    let calls = 0;
    const messages = await run(async () => { calls++; return { ok: true, async json() { return { choices: [result] }; } }; }, true, { mode: 'translate', translationConsent: true });
    assert.equal(calls, 1);
    assert.equal(messages.at(-1).type, 'error');
  }
});
test('translation failure retries but does not request TTS until translation succeeds', async () => {
  let calls = 0;
  const messages = await run(async () => {
    calls++;
    if (calls === 1) throw new TypeError('network');
    if (calls === 2) return { ok: true, async json() { return { choices: [{ message: { content: '你好。' } }] }; } };
    return audioResponse();
  }, true, { mode: 'translate', translationConsent: true });
  assert.equal(calls, 3);
  assert.equal(messages[1].stage, 'translation');
  assert.equal(messages.at(-1).type, 'done');
});

test('cancelling during translation prevents late translated text and TTS requests', async () => {
  let port, calls = 0;
  const messages = await run(async () => {
    calls++;
    return { ok: true, async json() {
      port.close();
      return { choices: [{ message: { content: '旧译文。' } }] };
    } };
  }, true, { mode: 'translate', translationConsent: true }, {}, value => { port = value; });
  assert.equal(calls, 1);
  assert.equal(messages.some(m => m.type === 'translated' || m.type === 'audio'), false);
});
test('402 identifies the failing stage and is not retried', async () => {
  for (const mode of ['direct', 'translate']) {
    let calls = 0;
    const messages = await run(async () => {
      calls++;
      return { ok: false, status: 402, headers: { get: () => null }, body: { async cancel() {} } };
    }, true, { mode, translationConsent: true });
    assert.equal(calls, 1);
    assert.equal(messages.at(-1).recoverable, false);
    assert.match(messages.at(-1).message, /余额不足/);
    assert.match(messages.at(-1).message, mode === 'direct' ? /配音/ : /翻译/);
  }
});
