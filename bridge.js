// TubeTunes bridge (MAIN world): ページの ytcfg をコンテンツスクリプトに渡す
(() => {
  if (window.top !== window) return;
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__tt !== 'getcfg') return;
    const g = (k) => {
      try { return window.ytcfg && window.ytcfg.get ? window.ytcfg.get(k) : undefined; } catch { return undefined; }
    };
    let context = g('INNERTUBE_CONTEXT');
    try { context = JSON.parse(JSON.stringify(context)); } catch { context = null; }
    window.postMessage({
      __tt: 'cfg',
      cfg: {
        key: g('INNERTUBE_API_KEY'),
        context,
        clientName: g('INNERTUBE_CONTEXT_CLIENT_NAME'),
        clientVersion: g('INNERTUBE_CONTEXT_CLIENT_VERSION'),
        sessionIndex: g('SESSION_INDEX'),
        delegated: g('DELEGATED_SESSION_ID'),
        loggedIn: g('LOGGED_IN'),
      },
    }, '*');
  });
})();
