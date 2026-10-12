/* Shared by the content script, service worker and Node verification. */
(() => {
  const normalize = text => text.replace(/\s+/g, ' ').trim();
  function addedText(previous, current) {
    previous = normalize(previous); current = normalize(current);
    if (!current || previous === current) return '';
    if (current.startsWith(previous)) return current.slice(previous.length).trim();
    for (let n = Math.min(previous.length, current.length); n >= 2; n--) {
      if (previous.slice(-n) === current.slice(0, n)) return current.slice(n).trim();
    }
    return current;
  }
  class SSEParser {
    constructor(onData) { this.buffer = ''; this.onData = onData; }
    push(text, final = false) {
      this.buffer += text;
      let match;
      while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
        this.dispatch(this.buffer.slice(0, match.index));
        this.buffer = this.buffer.slice(match.index + match[0].length);
      }
      if (final && this.buffer.trim()) { this.dispatch(this.buffer); this.buffer = ''; }
    }
    dispatch(event) {
      const data = event.split(/\r?\n/).filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart()).join('\n');
      if (data && data !== '[DONE]') this.onData(JSON.parse(data));
    }
  }
  function pcmSamples(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const samples = new Float32Array(Math.floor(bytes.length / 2));
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    return samples;
  }
  function retryDelay(attempt, retryAfter) {
    let hinted = Number(retryAfter) * 1000;
    if (retryAfter && !Number.isFinite(hinted)) hinted = Date.parse(retryAfter) - Date.now();
    return Math.min(10000, Math.max(1000 * (2 ** attempt), Number.isFinite(hinted) ? hinted : 0));
  }
  globalThis.MimoCore = { normalize, addedText, SSEParser, pcmSamples, retryDelay };
})();
