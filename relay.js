// TubeTunes relay: デスクトップ版用の中継フレーム
// www.youtube.com のページ上に youtube.com/embed を直接置くと再生を拒否される(エラー152)ため、
// m.youtube.com/robots.txt?tubetunes=1 をフレームとして読み込み、その中に埋め込みプレーヤーを置いて
// 親ページ ⇔ 埋め込みプレーヤー間の postMessage をそのまま転送する。
(() => {
  if (window.top === window) return;
  if (!/[?&]tubetunes=1(&|$)/.test(location.search)) return;

  const EMBED = 'https://www.youtube.com';
  const P = new URLSearchParams(location.hash.slice(1));
  const parentOrigin = P.get('po');
  const videoId = P.get('v');
  if (!parentOrigin || !/^https:\/\/(www|m)\.youtube\.com$/.test(parentOrigin) || !videoId) return;

  const params = new URLSearchParams({
    enablejsapi: '1', autoplay: '0', playsinline: '1', rel: '0', iv_load_policy: '3', origin: location.origin,
  });
  const f = document.createElement('iframe');
  f.src = `${EMBED}/embed/${encodeURIComponent(videoId)}?${params}`;
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  f.setAttribute('allowfullscreen', '');
  f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;display:block;';

  const body = document.createElement('body');
  body.style.cssText = 'margin:0;background:#000;overflow:hidden;';
  body.append(f);
  document.documentElement.replaceChildren(body);

  window.addEventListener('message', (e) => {
    if (e.source === window.parent && e.origin === parentOrigin) {
      try { f.contentWindow && f.contentWindow.postMessage(e.data, EMBED); } catch { /* noop */ }
    } else if (e.source === f.contentWindow && e.origin === EMBED) {
      window.parent.postMessage(e.data, parentOrigin);
    }
  });
  f.addEventListener('load', () => {
    window.parent.postMessage(JSON.stringify({ event: 'tt-relay-load' }), parentOrigin);
  });
})();
