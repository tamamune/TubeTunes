// TubeTunes ads: 埋め込みプレーヤー（youtube.com/embed）の中で動く広告の早送り
// 広告が流れたら 16倍速・ミュートにし、スキップできるときは押す（TubeFolio と同じ方式）。
// 設定は content.js が保存する tubetunes_state_v1.adFast（既定はオン）
(() => {
  if (window.top === window) return; // 埋め込みフレームの中だけ
  const STORE_KEY = 'tubetunes_state_v1';
  let enabled = true;
  let saved = null;

  const readSetting = (d) => { enabled = !(d && d.adFast === false); };
  try {
    chrome.storage.local.get(STORE_KEY).then((r) => readSetting(r && r[STORE_KEY])).catch(() => {});
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'local' && ch[STORE_KEY]) readSetting(ch[STORE_KEY].newValue);
    });
  } catch { /* noop */ }

  const player = () => document.querySelector('#movie_player, .html5-video-player');
  const video = () => document.querySelector('video.html5-main-video, video');
  const isAd = (p) => p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting');
  const SKIP = '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-container button, button[id^="skip-button"]';

  function tick() {
    const p = player(), v = video();
    if (!p || !v) return;
    if (enabled && isAd(p)) {
      if (!saved) saved = { muted: v.muted, rate: v.playbackRate || 1 };
      if (!v.muted) v.muted = true;
      if (v.playbackRate !== 16) { try { v.playbackRate = 16; } catch { /* noop */ } }
      const sk = p.querySelector(SKIP);
      if (sk) sk.click();
    } else if (saved) {
      v.muted = saved.muted;
      v.playbackRate = saved.rate;
      saved = null;
    }
  }
  document.addEventListener('playing', tick, true);
  document.addEventListener('ratechange', () => { if (saved) tick(); }, true);
  // 16倍速だとスキップボタンを逃しやすいので 150ms ごとに見回る
  setInterval(tick, 150);
})();
