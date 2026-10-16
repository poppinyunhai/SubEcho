/* Configure YouTube's own caption menus without changing subtitle rendering. */
(() => {
  const compact = value => value.normalize('NFKC').replace(/[\s\u200b]+/g, '').toLowerCase();
  const autoTranslate = value => /^(auto-translate|自动翻译|自動翻譯)$/.test(compact(value));
  const simplified = value => /^(chinese\(simplified\)|中文\(简体\)|中文\(簡體\)|简体中文|簡體中文)(?:\(.*\))?$/.test(compact(value));
  const english = value => !/[>»→]/.test(value) && /^(english|英语|英語)(?:\(.*\))?$/.test(compact(value));
  const captionLabel = value => /^(subtitles(?:\/cc)?|captions|字幕(?:\/cc)?|字幕設定)(?:\(\d+\))?$/.test(compact(value));
  let running = false;
  async function configure(language) {
    if (running) throw new Error('正在设置字幕，请稍候');
    if (!['zh', 'en'].includes(language)) throw new Error('不支持的字幕语言');
    const player = document.querySelector('#movie_player');
    const settings = player?.querySelector('.ytp-settings-button');
    const captions = player?.querySelector('.ytp-subtitles-button');
    if (!settings || !captions || captions.disabled || captions.getAttribute('aria-disabled') === 'true') throw new Error('当前视频未提供可用字幕，或播放器尚未加载');
    const page = location.href;
    const guard = () => { if (location.href !== page || !player.isConnected) throw new Error('视频已切换，请重新点击'); };
    const visible = node => node && node.getClientRects().length && node.getAttribute('aria-hidden') !== 'true';
    const items = () => [...player.querySelectorAll('.ytp-settings-menu .ytp-menuitem')].filter(visible);
    const label = node => (node.querySelector('.ytp-menuitem-label')?.textContent || node.textContent || '').trim();
    const captionRow = () => items().find(item => captionLabel(label(item)));
    const summary = row => row?.querySelector('.ytp-menuitem-content')?.textContent || '';
    const choose = node => { guard(); node.scrollIntoView({ block: 'nearest' }); node.click(); };
    const isOpen = () => settings.getAttribute('aria-expanded') === 'true' || visible(player.querySelector('.ytp-settings-menu'));
    const close = () => { if (isOpen()) settings.click(); };
    const pause = () => new Promise(resolve => setTimeout(resolve, 100));
    async function wait(read, error) {
      for (let i = 0; i < 40; i++) { guard(); const value = read(); if (value) return value; await pause(); }
      throw new Error(error);
    }
    async function root() {
      guard();
      if (!isOpen()) settings.click();
      // YouTube can retain the last submenu when reopened. Walk back explicitly.
      for (let i = 0; i < 40; i++) {
        guard(); const row = captionRow(); if (row) return row;
        const back = player.querySelector('.ytp-settings-menu .ytp-panel-back-button');
        if (visible(back)) choose(back);
        await pause();
      }
      throw new Error('找不到字幕设置入口，请确认 YouTube 界面为中文或英文');
    }
    async function tracks() { choose(await root()); await wait(() => items().some(item => english(label(item)) || autoTranslate(label(item))), '没有找到英文字幕或自动翻译选项'); }
    const translatedChinese = text => /(?:>>|»|→)/.test(text) && /简体|簡體|chinese\s*\(simplified\)/i.test(text) && /english|英语|英語/i.test(text);
    running = true;
    try {
      if (captions.getAttribute('aria-pressed') !== 'true') captions.click();
      await wait(() => captions.getAttribute('aria-pressed') === 'true', '字幕未能开启，请确认视频有字幕');
      let row = await root();
      const already = summary(row);
      if (!(language === 'zh' && translatedChinese(already)) && !(language === 'en' && english(already))) {
        await tracks();
        const source = await wait(() => {
          const candidates = items().filter(item => english(label(item)));
          return candidates.find(item => /auto.generated|自动生成|自動產生|自動生成/i.test(label(item))) || candidates[0];
        }, '当前视频没有英文字幕，无法设置英语字幕自动翻译');
        choose(source);
        if (language === 'zh') {
          // Selecting the source track first makes Auto-translate available.
          await tracks();
          const auto = await wait(() => items().find(item => autoTranslate(label(item))), '当前英文字幕未提供 YouTube 自动翻译');
          choose(auto);
          const chinese = await wait(() => items().find(item => simplified(label(item))), '自动翻译菜单中未找到中文（简体）');
          choose(chinese);
        }
      }
      await pause();
      row = await root();
      const selected = summary(row);
      if (language === 'zh' ? !translatedChinese(selected) : !english(selected)) throw new Error(`未能确认字幕设置${selected ? `：${selected}` : ''}，请重试`);
      return { ok: true, message: language === 'zh' ? '已开启 YouTube 英语 → 中文（简体）自动翻译' : '已开启英文字幕，可使用 AI 中文翻译配音' };
    } finally { close(); running = false; }
  }
  globalThis.YouTubeCaptions = { configure, simplified, english, autoTranslate };
})();
