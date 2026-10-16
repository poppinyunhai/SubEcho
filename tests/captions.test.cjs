const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function harness({ nativeChinese = false, englishUI = false, noCaptions = false, navigate = false,
  retained = false, missingExpanded = false, noAuto = false, translated = false, rejectSelection = false } = {}) {
  let menu = '', lastPanel = retained ? 'tracks' : 'root', pressed = false;
  let selected = translated ? '英语 (自动生成) >> 中文 （简体）' : 'English (auto-generated)';
  const clicks = [];
  const location = { href: 'https://www.youtube.com/watch?v=1' };
  const node = (text, click, content = '') => ({
    textContent: text, click() { clicks.push(text); click(); }, scrollIntoView() {},
    getClientRects: () => [1], getAttribute: () => null,
    querySelector(selector) { return { textContent: selector === '.ytp-menuitem-label' ? text : content }; }
  });
  const settings = { getAttribute: () => missingExpanded ? null : menu ? 'true' : 'false', click() {
    if (menu) { lastPanel = menu; menu = ''; } else menu = retained ? lastPanel : 'root';
    if (navigate) location.href = 'https://www.youtube.com/watch?v=2';
  } };
  const captions = { disabled: noCaptions, getAttribute: key => key === 'aria-pressed' ? String(pressed) : null, click() { pressed = true; } };
  const player = { isConnected: true,
    querySelector(selector) {
      if (selector === '.ytp-settings-button') return settings;
      if (selector === '.ytp-subtitles-button') return captions;
      if (selector === '.ytp-settings-menu') return menu ? node('menu', () => {}) : null;
      if (selector.includes('back-button') && menu && menu !== 'root') return node('Back', () => { menu = menu === 'translate' ? 'tracks' : 'root'; });
      return null;
    },
    querySelectorAll() {
      if (menu === 'root') return [node(englishUI ? 'Subtitles/CC (1)' : '字幕', () => { menu = 'tracks'; }, selected)];
      if (menu === 'tracks') return [
        node('English (auto-generated)', () => { selected = 'English (auto-generated)'; lastPanel = 'tracks'; menu = ''; }),
        ...(nativeChinese ? [node('中文（简体）', () => { selected = '中文（简体）'; menu = ''; })] : []),
        ...(noAuto ? [] : [node(englishUI ? 'Auto-translate' : '自动翻译', () => { menu = 'translate'; })])
      ];
      if (menu === 'translate') return [node(englishUI ? 'Chinese (Simplified)' : '中文 （简体）', () => {
        if (!rejectSelection) selected = 'English (auto-generated) >> Chinese (Simplified)';
        lastPanel = 'translate'; menu = '';
      })];
      return [];
    }
  };
  const sandbox = { location, setTimeout(fn) { queueMicrotask(fn); }, document: { querySelector: () => player } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('captions.js', 'utf8'), sandbox);
  return { ...sandbox.YouTubeCaptions, clicks, selected: () => selected, menu: () => menu, pressed: () => pressed };
}
test('selects English then Chinese auto-translation in both UI languages', async () => {
  for (const englishUI of [false, true]) {
    const h = harness({ englishUI });
    assert.equal((await h.configure('zh')).ok, true);
    assert.equal(h.pressed(), true);
    assert.match(h.selected(), /English.*>>.*Chinese/);
    assert.equal(h.menu(), '');
    assert.ok(h.clicks.indexOf('English (auto-generated)') < h.clicks.indexOf(englishUI ? 'Auto-translate' : '自动翻译'));
  }
});
test('matches the requested auto-translation even if a native Chinese track exists', async () => {
  const h = harness({ nativeChinese: true }); await h.configure('zh');
  assert.ok(h.clicks.includes('自动翻译'));
  assert.equal(h.clicks.includes('中文（简体）'), false);
});
test('walks out of retained submenus and supports missing aria-expanded', async () => {
  const h = harness({ retained: true, missingExpanded: true }); await h.configure('zh');
  assert.ok(h.clicks.includes('Back'));
  assert.match(h.selected(), />>.*Chinese/);
  assert.equal(h.menu(), '');
});
test('already translated track is not toggled off or reselected', async () => {
  const h = harness({ translated: true }); await h.configure('zh');
  assert.equal(h.clicks.includes('自动翻译'), false);
  assert.equal(h.pressed(), true);
});
test('English shortcut clears existing Chinese translation', async () => {
  const h = harness({ translated: true, retained: true }); await h.configure('en');
  assert.equal(h.selected(), 'English (auto-generated)');
});
test('missing captions, missing translation, navigation and rejected selection fail clearly', async () => {
  await assert.rejects(harness({ noCaptions: true }).configure('zh'), /未提供可用字幕/);
  await assert.rejects(harness({ navigate: true }).configure('zh'), /视频已切换/);
  await assert.rejects(harness({ noAuto: true }).configure('zh'), /未提供.*自动翻译/);
  await assert.rejects(harness({ rejectSelection: true }).configure('zh'), /未能确认/);
});
