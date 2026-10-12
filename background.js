importScripts('core.js');

// Keep credentials in trusted extension contexts, never the YouTube page.
const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'mimo-tts' || !port.sender?.tab ||
      !port.sender.url?.startsWith('https://www.youtube.com/')) return;
  const controller = new AbortController();
  let started = false, closed = false;
  const send = message => { if (!closed) port.postMessage(message); };
  port.onDisconnect.addListener(() => { closed = true; controller.abort(); });
  port.onMessage.addListener(async message => {
    if (message.type !== 'synthesize' || started) return;
    started = true;
    let audioSent = false;
    try {
      await storageReady;
      const text = typeof message.text === 'string' ? message.text.trim() : '';
      if (!text || text.length > 500) throw new Error('字幕长度无效');
      const { apiKey, voice = '冰糖', consent = false } = await chrome.storage.local.get(['apiKey', 'voice', 'consent']);
      if (!apiKey) throw new Error('请先在插件中填写 MiMo API Key');
      if (!consent) throw new Error('请在插件中同意将字幕发送给 MiMo');
      const voices = ['冰糖', '茉莉', '苏打', '白桦', 'mimo_default'];
      const body = JSON.stringify({ model: 'mimo-v2.5-tts', stream: true,
        messages: [
          { role: 'user', content: '像日常交谈一样自然地朗读字幕，语气平和、放松，停顿顺畅。避免播音腔、夸张的情绪和刻意的重音，不要刻意加快语速，只朗读提供的文本，不添加额外内容。' },
          { role: 'assistant', content: text }
        ], audio: { format: 'pcm16', voice: voices.includes(voice) ? voice : '冰糖' }
      });
      for (let attempt = 0; attempt < 3; attempt++) {
        if (controller.signal.aborted) return;
        const requestController = new AbortController();
        const abort = () => requestController.abort();
        controller.signal.addEventListener('abort', abort, { once: true });
        const timeout = setTimeout(abort, 25000);
        let reader;
        let retryMs;
        try {
          const response = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
            method: 'POST', signal: requestController.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body
          });
          if (!response.ok) {
            const reasons = { 401: 'API Key 无效，请修改设置', 403: '没有模型访问权限', 429: 'MiMo 请求限流' };
            const error = new Error(reasons[response.status] || `MiMo 请求失败（${response.status}）`);
            error.recoverable = [408, 429, 500, 502, 503, 504].includes(response.status);
            retryMs = MimoCore.retryDelay(attempt, response.headers.get('Retry-After'));
            await response.body?.cancel();
            throw error;
          }
          if (!response.body) throw new Error('MiMo 没有返回音频流');
          let count = 0;
          const parser = new MimoCore.SSEParser(data => {
            if (data.error) throw new Error('MiMo 返回接口错误');
            const audio = data.choices?.[0]?.delta?.audio?.data;
            if (audio) { count++; audioSent = true; send({ type: 'audio', data: audio }); }
          });
          reader = response.body.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            parser.push(decoder.decode(value, { stream: true }));
          }
          parser.push(decoder.decode(), true);
          if (!count) throw new Error('MiMo 未返回音频，请检查模型权限');
          send({ type: 'done' }); return;
        } catch (error) {
          if (controller.signal.aborted) return;
          const recoverable = error.recoverable === true || error.name === 'AbortError' || error instanceof TypeError;
          if (audioSent || !recoverable || attempt === 2) {
            send({ type: 'error', recoverable,
              message: error.name === 'AbortError' ? '语音请求超时' : error instanceof TypeError ? '网络连接失败' : error.message });
            return;
          }
          retryMs ??= MimoCore.retryDelay(attempt);
        } finally {
          clearTimeout(timeout);
          controller.signal.removeEventListener('abort', abort);
          if (reader) { try { await reader.cancel(); } catch {} }
        }
        send({ type: 'retry', delay: retryMs, attempt: attempt + 1 });
        await new Promise(resolve => {
          const cancel = () => { clearTimeout(timer); resolve(); };
          const timer = setTimeout(() => { controller.signal.removeEventListener('abort', cancel); resolve(); }, retryMs);
          controller.signal.addEventListener('abort', cancel, { once: true });
          if (controller.signal.aborted) cancel();
        });
      }
    } catch (error) { send({ type: 'error', message: error.message, recoverable: false }); }
  });
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type !== 'playback-settings' || !sender.tab ||
      !sender.url?.startsWith('https://www.youtube.com/')) return;
  storageReady.then(() => chrome.storage.local.get({ rate: 1.15, originalVolume: .15 })).then(respond);
  return true;
});
