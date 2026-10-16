const $ = id => document.getElementById(id);
let tabId, enabled = false, configuringCaptions = false, statusUntil = 0;
const status = (text, hold = 0) => { $('status').textContent = text; statusUntil = Date.now() + hold; };
async function save() {
  const apiKey = $('apiKey').value.trim();
  if (!apiKey) throw new Error('请填写 MiMo API Key');
  await chrome.storage.local.set({ apiKey, voice: $('voice').value,
    consent: $('consent').checked, mode: $('mode').value, translationModel: $('translationModel').value, translationConsent: $('translationConsent').checked, rate: Number($('rate').value), originalVolume: Number($('originalVolume').value) / 100 });
}
async function query(message) {
  if (!tabId) throw new Error('请打开 YouTube 视频页面');
  try { return await chrome.tabs.sendMessage(tabId, message); }
  catch { throw new Error('请刷新 YouTube 视频页面后重试'); }
}
function render(state) {
  enabled = state.enabled;
  $('toggle').textContent = enabled ? '停止配音' : '开始配音';
  if (Date.now() >= statusUntil) status(state.status);
}
$('originalVolume').addEventListener('input', () => {
  $('volumeValue').textContent = `${$('originalVolume').value}%`;
});
$('settings').addEventListener('submit', async event => {
  event.preventDefault();
  try { await save(); if (tabId) await query({ type: 'settings' }); status('设置已保存'); }
  catch (error) { status(error.message); }
});
$('toggle').addEventListener('click', async () => {
  $('toggle').disabled = true;
  try {
    if (!enabled) {
      if (!$('consent').checked) throw new Error('请先同意将字幕发送至 MiMo');
      if ($('mode').value === 'translate' && !$('translationConsent').checked) throw new Error('请同意将字幕及上下文发送给翻译模型');
      await save();
    }
    render(await query({ type: 'toggle', enabled: !enabled }));
  } catch (error) { status(error.message); }
  finally { $('toggle').disabled = !tabId; }
});
(async () => {
  const settings = await chrome.storage.local.get({ apiKey: '', voice: '冰糖', rate: 1.15, originalVolume: .15, consent: false, mode: 'direct', translationModel: 'mimo-v2.6-flash', translationConsent: false });
  for (const key of ['apiKey', 'voice', 'rate', 'mode', 'translationModel']) $(key).value = settings[key];
  $('consent').checked = settings.consent;
  $('translationConsent').checked = settings.translationConsent;
  $('translationSettings').hidden = settings.mode !== 'translate';
  $('originalVolume').value = Math.round(settings.originalVolume * 100);
  $('volumeValue').textContent = `${$('originalVolume').value}%`;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.startsWith('https://www.youtube.com/')) tabId = tab.id;
  $('toggle').disabled = !tabId;
  $('chineseCaptions').disabled = !tabId; $('englishCaptions').disabled = !tabId;
  try { render(await query({ type: 'state' })); }
  catch (error) { status(error.message); }
})();

$('deleteKey').addEventListener('click', async () => {
  try {
    if (tabId) { try { render(await query({ type: 'toggle', enabled: false })); } catch {} }
    await chrome.storage.local.remove(['apiKey', 'consent', 'translationConsent']);
    $('apiKey').value = ''; $('consent').checked = false; $('translationConsent').checked = false;
    status('已删除保存的 Key');
  } catch (error) { status(error.message); }
});
setInterval(async () => {
  if (!tabId || configuringCaptions || $('toggle').disabled) return;
  try { render(await query({ type: 'state' })); } catch {}
}, 1000);

$('mode').addEventListener('change', () => { $('translationSettings').hidden = $('mode').value !== 'translate'; });

async function configureCaptions(language) {
  if (configuringCaptions) return;
  configuringCaptions = true;
  $('chineseCaptions').disabled = $('englishCaptions').disabled = $('toggle').disabled = true;
  status('正在设置 YouTube 字幕…');
  try {
    const result = await query({ type: 'configure-captions', language });
    if (!result.ok) throw new Error(result.message);
    const mode = language === 'zh' ? 'direct' : 'translate';
    await chrome.storage.local.set({ mode });
    $('mode').value = mode;
    $('translationSettings').hidden = mode !== 'translate';
    await query({ type: 'settings' });
    status(result.message, 10000);
  } catch (error) { status(error.message, 10000); }
  finally {
    configuringCaptions = false;
    $('chineseCaptions').disabled = $('englishCaptions').disabled = $('toggle').disabled = !tabId;
  }
}
$('chineseCaptions').addEventListener('click', () => { void configureCaptions('zh'); });
$('englishCaptions').addEventListener('click', () => { void configureCaptions('en'); });
