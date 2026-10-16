const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function harness({ nativeChinese = false, englishUI = false, noCaptions = false, navigate = false } = {}) {
  let menu = '', pressed = false, selected = 'English (auto-generated)';
  const clicks = [];
  const location = { href: 'https://www.youtube.com/watch?v=1' };
  const node = (text, click, content = '') => ({
    textContent: text, click() { clicks.push(text); click(); }, scrollIntoView() {},
    getClientRects: () => [1], getAttribute: () => null,
    querySelector(selector) { return { textContent: selector === '.ytp-menuitem-label' ? text : content }; }
  });
  const settings = { getAttribute: () => menu ? 'true' : 'false', click() {
    menu = menu ? '' : 'root';
    if (navigate) location.href = 'https://www.youtube.com/watch?v=2';
  } };
  const captions = { disabled: noCaptions, getAttribute: key => key === 'aria-pressed' ? String(pressed) : null, click() { pressed = true; } };
  const player = { isConnected: true,
    querySelector(selector) { return selector === '.ytp-settings-button' ? settings : captions; },
    querySelectorAll() {
      if (menu === 'root') return [node(englishUI ? 'Subtitles/CC' : '字幕', () => { menu = 'tracks'; }, selected)];
      if (menu === 'tracks') return [
        node('English (auto-generated)', () => { selected = 'English (auto-generated)'; menu = ''; }),
        ...(nativeChinese ? [node('中文（简体）', () => { selected = '中文（简体）'; menu = ''; })] : []),
        node(englishUI ? 'Auto-translate' : '自动翻译', () => { menu = 'translate'; })
      ];
      if (menu === 'translate') return [node(englishUI ? 'Chinese (Simplified)' : '中文（简体）', () => { selected = 'Chinese (Simplified)'; menu = ''; })];
      return [];
    }
  };
  const sandbox = { location, setTimeout(fn) { queueMicrotask(fn); }, document: { querySelector: () => player } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('captions.js', 'utf8'), sandbox);
  return { configure: sandbox.YouTubeCaptions.configure, clicks, selected: () => selected, menu: () => menu, pressed: () => pressed };
}
test('enables CC and selects Chinese auto-translation in Chinese and English menus', async () => {
  for (const englishUI of [false, true]) {
    const h = harness({ englishUI });
    assert.equal((await h.configure('zh')).ok, true);
    assert.equal(h.pressed(), true);
    assert.equal(h.selected(), 'Chinese (Simplified)');
    assert.equal(h.menu(), '');
    assert.ok(h.clicks.includes(englishUI ? 'Auto-translate' : '自动翻译'));
  }
});
test('prefers an existing Chinese track and does not enable auto-translation', async () => {
  const h = harness({ nativeChinese: true });
  await h.configure('zh');
  assert.equal(h.selected(), '中文（简体）');
  assert.equal(h.clicks.includes('自动翻译'), false);
});
test('English shortcut chooses the English track for AI mode', async () => {
  const h = harness();
  await h.configure('en');
  assert.equal(h.selected(), 'English (auto-generated)');
  assert.equal(h.clicks.includes('自动翻译'), false);
});
test('missing captions and video navigation report failure rather than success', async () => {
  await assert.rejects(harness({ noCaptions: true }).configure('zh'), /未提供可用字幕/);
  await assert.rejects(harness({ navigate: true }).configure('zh'), /视频已切换/);
});
