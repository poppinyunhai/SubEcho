/* Operates YouTube's visible player menus; no private API or extra permissions. */
(() => {
  const compact = value => value.replace(/[\s\u200b]+/g, '').toLowerCase();
  const autoTranslate = value => /^(auto-translate|自动翻译|自動翻譯)$/i.test(value.trim());
  const simplified = value => /^(chinese\s*\(simplified\)|中文[（(]简体[）)]|中文[（(]簡體[）)]|简体中文|簡體中文)(?:\s*[-—].*)?$/i.test(value.trim());
  const english = value => /^(english|英语|英語)(?:\s*[（(].*[）)])?$/i.test(value.trim());
  let running = false;
  async function configure(language) {
    if (running) throw new Error('正在设置字幕，请稍候');
    if (!['zh', 'en'].includes(language)) throw new Error('不支持的字幕语言');
    const player = document.querySelector('#movie_player');
    const settings = player?.querySelector('.ytp-settings-button');
    const captions = player?.querySelector('.ytp-subtitles-button');
    if (!settings || !captions || captions.disabled || captions.getAttribute('aria-disabled') === 'true') {
      throw new Error('当前视频未提供可用字幕，或播放器尚未加载');
    }
    const page = location.href;
    const guard = () => { if (location.href !== page || !player.isConnected) throw new Error('视频已切换，请重新点击'); };
    const visible = node => node && node.getClientRects().length && node.getAttribute('aria-hidden') !== 'true';
    const items = () => [...player.querySelectorAll('.ytp-settings-menu .ytp-menuitem')].filter(visible);
    const label = node => (node.querySelector('.ytp-menuitem-label')?.textContent || node.textContent || '').trim();
    async function wait(read, error) {
      for (let i = 0; i < 40; i++) {
        guard(); const result = read(); if (result) return result;
        await new Promise(resolve => setTimeout(resolve, 75));
      }
      throw new Error(error);
    }
    const choose = node => { guard(); node.scrollIntoView({ block: 'nearest' }); node.click(); };
    const close = () => { if (settings.getAttribute('aria-expanded') === 'true') settings.click(); };
    running = true;
    try {
      // Open from the root even if the user left a submenu open.
      close();
      if (captions.getAttribute('aria-pressed') !== 'true') captions.click();
      await wait(() => captions.getAttribute('aria-pressed') === 'true', '字幕未能开启，请确认视频有字幕');
      settings.click();
      const row = await wait(() => items().find(item => /^(subtitles(?:\/cc)?|captions|字幕(?:\/cc)?|字幕設定)$/i.test(compact(label(item)))), '找不到字幕菜单；目前支持中文或英文的 YouTube 界面');
      choose(row);
      const direct = await wait(() => {
        const list = items();
        if (language === 'en') return list.find(item => english(label(item)));
        return list.find(item => simplified(label(item))) || list.find(item => autoTranslate(label(item)));
      }, language === 'en' ? '当前视频没有可选的英文字幕' : '当前视频没有简体中文字幕，也未提供自动翻译');
      if (language === 'en' || !autoTranslate(label(direct))) {
        choose(direct);
      } else {
        choose(direct);
        const chinese = await wait(() => items().find(item => simplified(label(item))), '自动翻译菜单中未找到简体中文');
        choose(chinese);
      }
      // Verify the setting in the player, instead of reporting success after a click.
      close(); settings.click();
      const selected = await wait(() => {
        const current = items().find(item => /^(subtitles(?:\/cc)?|captions|字幕(?:\/cc)?|字幕設定)$/i.test(compact(label(item))));
        const text = current?.querySelector('.ytp-menuitem-content')?.textContent || '';
        return language === 'zh' ? /简体|簡體|chinese\s*\(simplified\)/i.test(text) : /english|英语|英語/i.test(text);
      }, '字幕选择未能确认，请检查播放器字幕设置');
      return { ok: Boolean(selected), message: language === 'zh' ? '已开启简体中文字幕，可直接朗读' : '已开启英文字幕，可使用 AI 中文翻译配音' };
    } finally { close(); running = false; }
  }
  globalThis.YouTubeCaptions = { configure, simplified, english, autoTranslate };
})();
