(() => {
  let enabled = false, video, context, port, epoch = 0, busy = false;
  let rate = 1.15, originalVolume = .15, savedVolume;
  let queue = [], sources = new Set(), nextTime = 0, streamDone = false, oddByte = null;
  let observed = '', accepted = '', changedAt = 0, firstChangeAt = 0;
  let pending = '', pendingAt = 0, emptyAt = 0, ignoreUntil = 0;
  let route = '', ad = false, lastError = '', statusText = '配音未开启';
  let retryAt = 0;
  const button = document.createElement('button');
  button.textContent = '点击启用配音声音';
  Object.assign(button.style, {
    position: 'fixed', right: '24px', bottom: '80px', zIndex: '2147483647',
    padding: '12px 18px', border: '0', borderRadius: '10px', background: '#8cd6c1',
    color: '#10251f', font: '600 14px system-ui', cursor: 'pointer', display: 'none'
  });
  document.documentElement.append(button);
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', right: '24px', bottom: '24px', zIndex: '2147483647',
    maxWidth: '340px', padding: '10px 14px', borderRadius: '10px',
    background: '#10151ef2', color: '#dfe8f5', font: '13px/1.5 system-ui',
    boxShadow: '0 4px 20px #0004', display: 'none'
  });
  const label = document.createElement('span');
  const stop = document.createElement('button');
  stop.textContent = '停止';
  Object.assign(stop.style, { marginLeft: '12px', border: '0', borderRadius: '5px',
    padding: '3px 8px', background: '#253247', color: '#8cd6c1', cursor: 'pointer' });
  stop.addEventListener('click', () => { void toggle(false); });
  panel.append(label, stop);
  document.documentElement.append(panel);
  const state = () => ({ enabled, status: statusText });
  const setStatus = text => {
    statusText = text; button.title = text;
    label.textContent = `MiMo · ${text}`;
    panel.style.display = enabled ? 'block' : 'none';
  };
  async function settings() {
    const data = await chrome.runtime.sendMessage({ type: 'playback-settings' });
    rate = Math.min(1.5, Math.max(1, Number(data?.rate) || 1.15));
    originalVolume = Math.min(1, Math.max(0, Number(data?.originalVolume) || 0));
    if (enabled && video) video.volume = originalVolume;
    for (const source of sources) source.playbackRate.value = rate * (video?.playbackRate || 1);
  }
  function clearAudio() {
    epoch++;
    const oldPort = port; port = null;
    oldPort?.disconnect();
    for (const source of sources) { source.onended = null; try { source.stop(); } catch {} }
    sources.clear(); queue = []; busy = false; oddByte = null;
    streamDone = false; nextTime = context?.currentTime || 0;
  }
  function clearCaptions() {
    observed = accepted = pending = '';
    changedAt = firstChangeAt = pendingAt = emptyAt = 0;
  }
  function reset() { clearAudio(); clearCaptions(); retryAt = 0; ignoreUntil = performance.now() + 500; }
  function suspend() { if (context?.state === 'running') void context.suspend(); }
  async function resume() {
    if (!enabled || !video || video.paused || video.seeking) return;
    try {
      context ||= new AudioContext();
      if (context.state !== 'running') button.style.display = 'block';
      await context.resume();
      button.style.display = context.state === 'running' ? 'none' : 'block';
      pump();
    } catch { button.style.display = 'block'; setStatus('请点击页面上的按钮启用声音'); }
  }
  button.addEventListener('click', async () => {
    context ||= new AudioContext();
    await context.resume();
    button.style.display = 'none';
    if (video?.paused) suspend(); else pump();
  });
  function onPause() { suspend(); if (enabled) setStatus('视频暂停，配音已暂停'); }
  function onPlay() { if (enabled) { setStatus('正在等待字幕'); void resume(); } }
  function onSeeking() { if (enabled) { reset(); suspend(); setStatus('正在重新同步字幕'); } }
  function onSeeked() { ignoreUntil = performance.now() + 350; if (enabled) void resume(); }
  function onRateChange() {
    // Re-schedule future PCM chunks at the video's new speed.
    if (enabled) { reset(); void resume(); }
  }
  const events = { pause: onPause, play: onPlay, seeking: onSeeking, seeked: onSeeked,
    ratechange: onRateChange, ended: onSeeking };
  function bindVideo(next) {
    if (video === next) return;
    reset();
    if (video) {
      for (const [event, handler] of Object.entries(events)) video.removeEventListener(event, handler);
      if (savedVolume !== undefined) video.volume = savedVolume;
    }
    video = next; savedVolume = undefined;
    if (video) {
      for (const [event, handler] of Object.entries(events)) video.addEventListener(event, handler);
      if (enabled) { savedVolume = video.volume; video.volume = originalVolume; void resume(); }
    }
  }
  function accept(text, now) {
    const delta = MimoCore.addedText(accepted, text);
    accepted = text;
    if (!delta) return;
    pending = MimoCore.normalize(`${pending} ${delta}`);
    pendingAt ||= now;
    if (/[。！？.!?]$/.test(pending) || pending.length >= 90) flush();
  }
  function flush() {
    if (!pending) return;
    // Bound the queue: prefer recent subtitles over an ever-growing delay.
    for (let start = 0; start < pending.length; start += 300) {
      queue.push({ text: pending.slice(start, start + 300), time: video.currentTime });
    }
    pending = ''; pendingAt = 0;
    if (queue.length > 3) queue = queue.slice(-3);
    pump();
  }
  function audioChunk(base64) {
    const binary = atob(base64);
    let bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (oddByte !== null) { const joined = new Uint8Array(bytes.length + 1); joined[0] = oddByte; joined.set(bytes, 1); bytes = joined; }
    oddByte = bytes.length % 2 ? bytes[bytes.length - 1] : null;
    const samples = MimoCore.pcmSamples(bytes.subarray(0, bytes.length - (bytes.length % 2)));
    if (!samples.length) return;
    const buffer = context.createBuffer(1, samples.length, 24000);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const speed = rate * (video?.playbackRate || 1);
    source.playbackRate.value = speed;
    source.connect(context.destination);
    const start = Math.max(context.currentTime + .06, nextTime);
    nextTime = start + buffer.duration / speed;
    sources.add(source);
    source.onended = () => { sources.delete(source); source.disconnect(); finish(); };
    source.start(start);
    setStatus('正在朗读字幕');
  }
  function finish() {
    if (!streamDone || sources.size) return;
    busy = false; streamDone = false;
    setStatus(queue.length ? '准备下一句…' : '等待下一句字幕');
    pump();
  }
  function fail(message, recoverable = false) {
    const remaining = queue;
    clearAudio();
    if (recoverable) {
      queue = remaining;
      retryAt = performance.now() + 10000;
      lastError = '';
      setStatus(`${message}，10 秒后自动恢复`);
    } else { lastError = message; setStatus(message); }
  }
  function pump() {
    if (!enabled || busy || !video || video.paused || video.seeking || ad || lastError || performance.now() < retryAt) return;
    if (!context || context.state !== 'running') {
      button.style.display = 'block'; setStatus('请点击页面上的按钮启用声音'); return;
    }
    queue = queue.filter(item => video.currentTime - item.time <= 12);
    const item = queue.shift();
    if (!item) return;
    busy = true; streamDone = false; oddByte = null;
    const generation = epoch;
    setStatus('MiMo 正在合成语音…');
    const connection = chrome.runtime.connect({ name: 'mimo-tts' }); port = connection;
    let completed = false;
    connection.onMessage.addListener(message => {
      if (epoch !== generation) return;
      if (message.type === 'audio') {
        try { audioChunk(message.data); } catch { fail('音频解码失败，请停止后重试'); }
      } else if (message.type === 'done') {
        completed = true; streamDone = true; port = null; connection.disconnect(); finish();
      } else if (message.type === 'retry') {
        setStatus(`连接暂时失败，${Math.ceil(message.delay / 1000)} 秒后重试（${message.attempt}/2）`);
      } else if (message.type === 'error') { fail(message.message, message.recoverable); }
    });
    connection.onDisconnect.addListener(() => {
      if (epoch === generation && !completed) fail('配音连接中断', true);
    });
    connection.postMessage({ type: 'synthesize', text: item.text });
  }
  async function toggle(value) {
    if (!value) {
      enabled = false; reset(); suspend(); button.style.display = 'none';
      if (video && savedVolume !== undefined) video.volume = savedVolume;
      savedVolume = undefined; setStatus('配音已停止'); return state();
    }
    bindVideo(document.querySelector('video.html5-main-video'));
    if (!video) throw new Error('请打开一个 YouTube 视频');
    await settings();
    enabled = true; lastError = ''; reset();
    savedVolume = video.volume; video.volume = originalVolume;
    setStatus('已开启，请播放视频并打开中文字幕');
    void resume(); return state();
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type === 'state') { respond(state()); return; }
    if (message.type === 'toggle') {
      toggle(Boolean(message.enabled)).then(respond).catch(error => respond({ ...state(), status: error.message }));
      return true;
    }
    if (message.type === 'settings') {
      settings().then(() => { lastError = ''; reset(); respond(state()); }).catch(error => respond({ ...state(), status: error.message }));
      return true;
    }
  });
  setInterval(() => {
    const url = new URL(location.href);
    const key = `${url.pathname}:${url.searchParams.get('v') || ''}`;
    if (key !== route) { route = key; reset(); lastError = ''; }
    bindVideo(document.querySelector('video.html5-main-video'));
    const isAd = Boolean(document.querySelector('#movie_player.ad-showing'));
    if (ad !== isAd) { ad = isAd; reset(); if (ad) suspend(); else void resume(); }
    if (!enabled || !video || video.paused || video.seeking || ad || lastError) return;
    const now = performance.now();
    if (now < ignoreUntil) return;
    if (retryAt && now >= retryAt) { retryAt = 0; setStatus('正在恢复连接，等待字幕'); }
    if (retryAt) setStatus(`网络暂时不可用，${Math.ceil((retryAt - now) / 1000)} 秒后自动恢复`);
    const container = document.querySelector('.ytp-caption-window-container');
    const text = container && container.getClientRects().length
      ? MimoCore.normalize([...container.querySelectorAll('.ytp-caption-segment')].map(node => node.textContent).join(' ')) : '';
    if (text !== observed) {
      if (observed && !text) accept(observed, now);
      observed = text; changedAt = now; firstChangeAt ||= now;
    }
    if (text && (now - changedAt >= 350 || now - firstChangeAt >= 1400)) {
      accept(text, now); firstChangeAt = now;
    }
    if (!text) {
      emptyAt ||= now;
      if (now - emptyAt >= 1000) accepted = '';
      if (!busy && !pending && !queue.length && !retryAt) setStatus('等待字幕，请确认 YouTube 已开启中文字幕');
    } else emptyAt = 0;
    if (pending && now - pendingAt >= 1000) flush();
    pump();
  }, 200);
  window.addEventListener('pagehide', () => { enabled = false; clearAudio(); void context?.close(); });
})();
