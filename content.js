// TubeTunes — YouTubeのライブラリ/再生リストを使う音楽プレーヤー
(() => {
  'use strict';
  if (window.top !== window) return;
  if (window.__tubeTunesLoaded) return;
  window.__tubeTunesLoaded = true;

  const IS_MOBILE = location.hostname === 'm.youtube.com';
  const EMBED_ORIGIN = 'https://www.youtube.com';
  const STORE_KEY = 'tubetunes_state_v1';
  const RELAY_ORIGIN = 'https://m.youtube.com';
  const PLAYER_ORIGIN = IS_MOBILE ? EMBED_ORIGIN : RELAY_ORIGIN; // postMessage の送り先
  const WIN = 200; // プレーヤーに一度に渡す曲数（埋め込みの再生リスト上限）

  // =========================================================
  // DOM ヘルパー（innerHTMLは使わない：Trusted Types対策）
  // =========================================================
  const SVGNS = 'http://www.w3.org/2000/svg';
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const ICONS = {
    play: 'M8 5v14l11-7z',
    pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
    next: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z',
    prev: 'M6 6h2v12H6zm3.5 6l8.5 6V6z',
    shuffle: 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z',
    repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
    close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    down: 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z',
    music: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z',
    eye: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
    eyeoff: 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.804 11.804 0 001 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z',
    refresh: 'M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
    video: 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z',
    volume: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
    add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    open: 'M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
    list: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
    clear: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  };
  function icon(name, size = 24) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size);
    s.setAttribute('height', size);
    s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', ICONS[name]);
    p.setAttribute('fill', 'currentColor');
    s.append(p);
    return s;
  }
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
  }
  function parseLen(t) {
    if (!t) return 0;
    const m = String(t).match(/(\d+:)?\d+:\d+/);
    if (!m) return 0;
    return m[0].split(':').reduce((a, x) => a * 60 + (+x), 0);
  }
  const thumb = (id, q = 'mqdefault') => `https://i.ytimg.com/vi/${id}/${q}.jpg`;

  // =========================================================
  // 状態
  // =========================================================
  const S = {
    queue: [],          // {id, title, author, len}
    order: [],          // queue のインデックス（再生順）
    pos: -1,            // order 内の位置
    shuffle: false,
    repeat: 'off',      // off | all | one
    playing: false,
    buffering: false,
    time: 0,
    duration: 0,
    volume: 100,
    sourceTitle: '',
    sourceId: '',
    showVideo: false,
    sleepAt: 0,
    sleepEnd: false,
    miniClosed: false,
    quality: 'auto',    // auto | hd720 | hd1080 | hd1440
    miniHide: 60,       // デスクトップ：停止中のミニプレーヤーを隠すまでの秒数（0=しない）
    uiScale: 100,       // 動画内の UI（タイトル・ボタンなど）の大きさ（%・0.01〜100）。小さいほど UI が小さくなる
    adFast: true,       // 広告を 16倍速・ミュートで早送り（ads.js が読む）
  };
  function clampScale(v) { const n = +v; return Number.isFinite(n) && n > 0 ? Math.min(100, Math.max(0.01, n)) : 100; }
  const cur = () => (S.pos >= 0 && S.pos < S.order.length ? S.queue[S.order[S.pos]] : null);

  // 保存
  let saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try {
        chrome.storage.local.set({
          [STORE_KEY]: {
            queue: S.queue, order: S.order, pos: S.pos, shuffle: S.shuffle, repeat: S.repeat,
            time: S.time, volume: S.volume, sourceTitle: S.sourceTitle, sourceId: S.sourceId, showVideo: S.showVideo,
            quality: S.quality, miniHide: S.miniHide, uiScale: S.uiScale, adFast: S.adFast,
          },
        });
      } catch { /* 拡張の再読み込み後など */ }
    }, 400);
  }
  async function restore() {
    try {
      const r = await chrome.storage.local.get(STORE_KEY);
      const d = r && r[STORE_KEY];
      if (!d || !Array.isArray(d.queue)) return;
      Object.assign(S, {
        queue: d.queue, order: d.order || d.queue.map((_, i) => i), pos: d.pos ?? -1,
        shuffle: !!d.shuffle, repeat: d.repeat || 'off', time: d.time || 0, volume: d.volume ?? 100,
        sourceTitle: d.sourceTitle || '', sourceId: d.sourceId || '', showVideo: !!d.showVideo,
        quality: d.quality || 'auto', miniHide: d.miniHide ?? 60,
        uiScale: clampScale(d.uiScale), adFast: d.adFast !== false,
      });
      if (S.pos >= S.order.length) S.pos = S.order.length ? 0 : -1;
      const c = cur();
      S.duration = c ? c.len || 0 : 0;
    } catch { /* noop */ }
  }

  // =========================================================
  // YouTube 内部API (youtubei)
  // =========================================================
  let cfgCache = null;
  function getCfg() {
    return new Promise((res) => {
      const onMsg = (e) => {
        if (e.source !== window || !e.data || e.data.__tt !== 'cfg') return;
        window.removeEventListener('message', onMsg);
        res(e.data.cfg);
      };
      window.addEventListener('message', onMsg);
      window.postMessage({ __tt: 'getcfg' }, '*');
      setTimeout(() => { window.removeEventListener('message', onMsg); res(null); }, 3000);
    });
  }
  async function ensureCfg() {
    if (cfgCache && cfgCache.context) return cfgCache;
    for (let i = 0; i < 5; i++) {
      const c = await getCfg();
      if (c && c.context) { cfgCache = c; return c; }
      await new Promise((r) => setTimeout(r, 600));
    }
    throw new Error('YouTubeの設定情報を取得できませんでした（ページを再読み込みしてください）');
  }
  async function sha1(s) {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/[-.]/g, '\\$&') + '=([^;]+)'));
    return m ? m[1] : null;
  }
  async function authHeader() {
    const sid = getCookie('SAPISID') || getCookie('__Secure-3PAPISID');
    if (!sid) return null;
    const ts = Math.floor(Date.now() / 1000);
    const hash = await sha1(`${ts} ${sid} ${location.origin}`);
    return `SAPISIDHASH ${ts}_${hash}`;
  }
  async function innertube(endpoint, body) {
    const cfg = await ensureCfg();
    const headers = {
      'Content-Type': 'application/json',
      'X-Origin': location.origin,
      'X-Goog-AuthUser': String(cfg.sessionIndex ?? 0),
    };
    // モバイル(MWEB)の応答には再生リストの作成者情報がないため、PC版(WEB)の形式で問い合わせる
    let context = cfg.context;
    if (IS_MOBILE) {
      context = JSON.parse(JSON.stringify(cfg.context));
      context.client = { ...(context.client || {}), clientName: 'WEB' };
      headers['X-Youtube-Client-Name'] = '1';
    } else if (cfg.clientName) headers['X-Youtube-Client-Name'] = String(cfg.clientName);
    if (cfg.clientVersion) headers['X-Youtube-Client-Version'] = String(cfg.clientVersion);
    if (cfg.delegated) headers['X-Goog-PageId'] = String(cfg.delegated);
    const auth = await authHeader();
    if (auth) headers.Authorization = auth;
    const url = `/youtubei/v1/${endpoint}?prettyPrint=false` + (cfg.key ? `&key=${cfg.key}` : '');
    const r = await fetch(url, {
      method: 'POST', credentials: 'include', headers,
      body: JSON.stringify({ context, ...body }),
    });
    if (!r.ok) throw new Error('通信エラー HTTP ' + r.status);
    return r.json();
  }

  // ---- JSON解析 ----
  function walk(o, fn, depth = 0) {
    if (!o || typeof o !== 'object' || depth > 80) return;
    if (fn(o) === false) return;
    if (Array.isArray(o)) { for (const v of o) walk(v, fn, depth + 1); return; }
    for (const k in o) {
      const v = o[k];
      if (v && typeof v === 'object') walk(v, fn, depth + 1);
    }
  }
  function txt(t) {
    if (!t) return '';
    if (typeof t === 'string') return t;
    if (t.simpleText) return t.simpleText;
    if (Array.isArray(t.runs)) return t.runs.map((r) => r.text).join('');
    if (typeof t.content === 'string') return t.content;
    return '';
  }
  function firstThumb(o) {
    let url = '';
    walk(o, (x) => {
      if (url) return false;
      if (typeof x.url === 'string' && /ytimg|ggpht|googleusercontent/.test(x.url)) url = x.url;
    });
    if (url.startsWith('//')) url = 'https:' + url;
    return url;
  }
  function badgeText(o) {
    let t = '';
    walk(o, (x) => {
      if (t) return false;
      if (x.thumbnailBadgeViewModel && x.thumbnailBadgeViewModel.text) t = x.thumbnailBadgeViewModel.text;
    });
    return t;
  }
  function findContinuation(json) {
    let tok = null;
    walk(json, (x) => {
      if (x.continuationItemRenderer) {
        walk(x.continuationItemRenderer, (y) => {
          if (!tok && y.continuationCommand && y.continuationCommand.token) tok = y.continuationCommand.token;
        });
        return false;
      }
      if (!tok && x.nextContinuationData && x.nextContinuationData.continuation) tok = x.nextContinuationData.continuation;
    });
    return tok;
  }

  // 再生リストが「自分で作ったもの」か「ライブラリに保存した他人のもの」かを判定
  const VISIBILITY_RE = /^(公開|非公開|限定公開|Public|Private|Unlisted)$/;
  function ownerInfo(node) {
    let ownerId = null, hasVisibility = false;
    walk(node, (x) => {
      const be = x.browseEndpoint;
      if (!ownerId && be && typeof be.browseId === 'string' && /^UC/.test(be.browseId)) ownerId = be.browseId;
      for (const v of [x.content, x.simpleText, x.text]) {
        if (typeof v === 'string' && VISIBILITY_RE.test(v.trim())) hasVisibility = true;
      }
    });
    return { ownerId, hasVisibility };
  }
  function isOwnPlaylist(id, node, myId) {
    if (/^OLAK5uy_/.test(id)) return false; // アルバム
    const { ownerId, hasVisibility } = ownerInfo(node);
    if (hasVisibility) return true;
    if (ownerId && myId) return ownerId === myId;
    return !ownerId;
  }
  function parsePlaylists(json, out, seen, myId) {
    const add = (id, title, img, count, node) => {
      if (!id || seen.has(id) || id === 'WL' || id === 'LL' || /^RD/.test(id)) return;
      seen.add(id);
      out.push({ id, title: title || '(無題の再生リスト)', img, count: count || '', own: isOwnPlaylist(id, node, myId) });
    };
    walk(json, (x) => {
      const lv = x.lockupViewModel;
      if (lv && lv.contentId && /PLAYLIST|ALBUM|PODCAST/.test(lv.contentType || '')) {
        add(lv.contentId, txt(lv.metadata?.lockupMetadataViewModel?.title), firstThumb(lv.contentImage), badgeText(lv.contentImage), lv.metadata);
        return false;
      }
      for (const key of ['gridPlaylistRenderer', 'playlistRenderer', 'compactPlaylistRenderer', 'playlistCardRenderer']) {
        const r = x[key];
        if (r && r.playlistId) {
          add(r.playlistId, txt(r.title) || txt(r.headline), firstThumb(r.thumbnail || r.thumbnailRenderer || r.thumbnails),
            txt(r.videoCountShortText) || txt(r.videoCountText) || txt(r.thumbnailText),
            { a: r.shortBylineText, b: r.longBylineText, c: r.ownerText, d: r.publishedTimeText, e: r.privacy, f: r.badges });
          return false;
        }
      }
    });
  }
  let myChannelId;
  async function fetchMyChannelId() {
    if (myChannelId !== undefined) return myChannelId;
    myChannelId = null;
    try {
      const json = await innertube('account/account_menu', {});
      walk(json, (x) => {
        if (myChannelId) return false;
        const be = x.browseEndpoint;
        if (be && typeof be.browseId === 'string' && /^UC/.test(be.browseId)) myChannelId = be.browseId;
      });
    } catch { /* チャンネル未作成など */ }
    return myChannelId;
  }
  function parseVideos(json, out, seen) {
    const push = (id, title, author, len) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push({ id, title: title || id, author: author || '', len: len || 0 });
    };
    walk(json, (x) => {
      const r = x.playlistVideoRenderer || x.playlistPanelVideoRenderer;
      if (r && r.videoId) {
        if (r.isPlayable === false) return false;
        push(r.videoId, txt(r.title), txt(r.shortBylineText) || txt(r.longBylineText),
          +r.lengthSeconds || parseLen(txt(r.lengthText)));
        return false;
      }
      const lv = x.lockupViewModel;
      if (lv && lv.contentId && lv.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
        const md = lv.metadata?.lockupMetadataViewModel;
        let author = '';
        walk(md?.metadata, (y) => {
          if (author) return false;
          if (y.metadataParts && y.metadataParts[0]) author = txt(y.metadataParts[0].text);
        });
        push(lv.contentId, txt(md?.title), author, parseLen(badgeText(lv.contentImage)));
        return false;
      }
    });
  }

  async function fetchLibrary() {
    const out = [], seen = new Set();
    let anyOk = false, lastErr = null;
    const myId = await fetchMyChannelId();
    for (const browseId of ['FEplaylist_aggregation', 'FElibrary', 'FEyou']) {
      try {
        const json = await innertube('browse', { browseId });
        anyOk = true;
        parsePlaylists(json, out, seen, myId);
        let tok = findContinuation(json), n = 0;
        while (tok && n++ < 10) {
          const more = await innertube('browse', { continuation: tok });
          parsePlaylists(more, out, seen, myId);
          tok = findContinuation(more);
        }
      } catch (e) { lastErr = e; }
    }
    if (!anyOk && lastErr) throw lastErr;
    return out;
  }
  const trackCache = new Map();
  async function fetchPlaylistTracks(id, force) {
    if (!force && trackCache.has(id)) return trackCache.get(id);
    const out = [], seen = new Set();
    let json = await innertube('browse', { browseId: 'VL' + id });
    parseVideos(json, out, seen);
    let tok = findContinuation(json), n = 0;
    while (tok && n++ < 100) {
      json = await innertube('browse', { continuation: tok });
      const before = out.length;
      parseVideos(json, out, seen);
      tok = findContinuation(json);
      if (out.length === before && !tok) break;
    }
    trackCache.set(id, out);
    return out;
  }

  // =========================================================
  // 埋め込みプレーヤー（IFrame API を postMessage で直接操作）
  //  - モバイル: m.youtube.com に直接 youtube.com/embed を置く
  //  - デスクトップ: www.youtube.com 上の埋め込みはYouTubeに拒否される(エラー152)ため、
  //    m.youtube.com の中継フレーム(relay.js)の中に埋め込みを置いて転送する
  //  - 曲送りはプレーヤー内蔵の再生リスト機能(loadPlaylist)に任せる
  //    → 画面オフ/バックグラウンドでも次の曲へ進みやすい
  // =========================================================
  let iframe = null, ready = false, listenTimer = null, pending = [];
  let endedFor = null, errorFor = null, errorStreak = 0;
  let winStart = -1, winLen = 0, winOne = false, loadAt = 0;

  function post(obj) {
    try { iframe && iframe.contentWindow && iframe.contentWindow.postMessage(JSON.stringify(obj), PLAYER_ORIGIN); } catch { /* noop */ }
  }
  function cmd(func, ...args) {
    if (!iframe) return;
    if (!ready) { pending.push([func, args]); return; }
    post({ event: 'command', func, args, id: 1, channel: 'widget' });
  }
  function startListening() {
    ready = false;
    clearInterval(listenTimer);
    let n = 0;
    const ping = () => {
      post({ event: 'listening', id: 1, channel: 'widget' });
      if (++n > 80) clearInterval(listenTimer);
    };
    ping();
    listenTimer = setInterval(ping, 250);
  }
  function createPlayer(videoId) {
    let src;
    if (IS_MOBILE) {
      const params = new URLSearchParams({
        enablejsapi: '1', autoplay: '0', playsinline: '1', rel: '0', iv_load_policy: '3', origin: location.origin,
      });
      src = `${EMBED_ORIGIN}/embed/${videoId}?${params}`;
    } else {
      src = `${RELAY_ORIGIN}/robots.txt?tubetunes=1#` + new URLSearchParams({ v: videoId, po: location.origin });
    }
    iframe = h('iframe', {
      src,
      allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
      title: 'TubeTunes Player',
    });
    adOn = false; adGrace = 0;
    iframe.addEventListener('load', startListening);
    videoBox.append(iframe);
  }
  window.addEventListener('message', (e) => {
    if (!iframe || e.source !== iframe.contentWindow) return;
    let d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
    if (!d || !d.event) return;
    if (d.event === 'tt-relay-load') { startListening(); return; }
    if (d.event === 'tt-ad') { // ads.js（埋め込み内）からの「広告中」の通知
      adOn = !!d.on;
      if (!adOn) adGrace = Date.now() + 1500; // 広告が終わった直後の終了通知も無視
      return;
    }
    if (!ready) {
      ready = true;
      clearInterval(listenTimer);
      for (const ev of ['onReady', 'onStateChange', 'onError']) post({ event: 'command', func: 'addEventListener', args: [ev], id: 1, channel: 'widget' });
      post({ event: 'command', func: 'setVolume', args: [S.volume], id: 1, channel: 'widget' });
      post({ event: 'command', func: 'unMute', args: [], id: 1, channel: 'widget' });
      const q = pending; pending = [];
      for (const [f, a] of q) post({ event: 'command', func: f, args: a, id: 1, channel: 'widget' });
    }
    if (d.event === 'infoDelivery' || d.event === 'initialDelivery') handleInfo(d.info || {});
    else if (d.event === 'onStateChange') handleState(d.info);
    else if (d.event === 'onError') handleError(d.info);
  });

  // 広告中は、時間・長さ・状態（特に「終了」）が広告のものなので曲の状態に反映しない
  let adOn = false, adGrace = 0;
  const inAd = () => adOn || Date.now() < adGrace;
  function handleInfo(info) {
    // プレーヤー側で曲が進んだら、こちらの位置も合わせる
    if (typeof info.playlistIndex === 'number' && winStart >= 0 && Date.now() - loadAt > 1500) {
      const np = winOne ? winStart : winStart + info.playlistIndex;
      const vid = info.videoData && info.videoData.video_id;
      const t = np < S.order.length ? S.queue[S.order[np]] : null;
      if (np !== S.pos && t && (!vid || vid === t.id)) onTrackAdvanced(np);
    }
    const ad = inAd();
    if (!ad && typeof info.currentTime === 'number') S.time = info.currentTime;
    if (!ad && typeof info.duration === 'number' && info.duration > 0) S.duration = info.duration;
    const c = cur();
    if (c && info.videoData && info.videoData.video_id === c.id) {
      let changed = false;
      if (info.videoData.title && (!c.title || c.title === c.id)) { c.title = info.videoData.title; changed = true; }
      if (info.videoData.author && !c.author) { c.author = info.videoData.author; changed = true; }
      if (changed) { renderNow(); renderMini(); updateMediaSession(); }
    }
    if (typeof info.playerState === 'number' && !(ad && info.playerState === 0)) handleState(info.playerState);
    else renderTime();
  }
  function onTrackAdvanced(np) {
    S.pos = np;
    S.time = 0;
    S.duration = cur().len || 0;
    endedFor = null;
    errorFor = null;
    if (S.sleepEnd) {
      S.sleepEnd = false;
      cmd('pauseVideo');
      cmd('seekTo', 0, true);
      S.playing = false;
      renderSleep();
      toast('スリープタイマーで停止しました');
    }
    save();
    renderAll();
    updateMediaSession();
    scrollQueueToCurrent();
  }
  function handleState(st) {
    if (st === 0 && inAd()) return; // 広告の終了で次の曲へ飛ばない
    const wasPlaying = S.playing;
    S.playing = st === 1 || st === 3;
    S.buffering = st === 3;
    if (st === 1) { errorStreak = 0; S.miniClosed = false; pausePageVideos(); renderMini(); }
    if (wasPlaying && !S.playing) touchMini();
    if (st === 0) onEnded();
    if (wasPlaying !== S.playing) { renderControls(); updateMediaSession(); }
    renderTime();
  }
  function handleError(code) {
    const c = cur();
    if (!c || errorFor === c.id) return;
    errorFor = c.id;
    errorStreak++;
    const why = (code === 101 || code === 150) ? '埋め込み再生が許可されていない動画'
      : (code === 152 || code === 153) ? 'この環境では再生できない動画' : '再生できない動画';
    toast(`${why}をスキップしました（エラー${code}）：${c.title}`);
    if (errorStreak >= Math.min(S.order.length, 15)) {
      S.playing = false; renderControls();
      toast(`再生できる動画が見つかりませんでした（エラー${code}）`);
      return;
    }
    setTimeout(() => next(true), 700);
  }
  function onEnded() {
    const c = cur();
    if (!c || endedFor === c.id) return;
    // 再生リストの途中ならプレーヤーが自動で次へ進むので何もしない
    if (!winOne && winStart >= 0 && S.pos < winStart + winLen - 1) return;
    endedFor = c.id;
    if (S.sleepEnd) { S.sleepEnd = false; S.playing = false; renderSleep(); renderControls(); return; }
    next(true);
  }

  // ---- 再生操作 ----
  // 現在位置 p を含む「再生リストの窓」をプレーヤーに読み込む
  function loadWindow(p, start = 0, autoplay = true) {
    const n = S.order.length;
    if (S.repeat === 'one') {
      winOne = true; winStart = p; winLen = 1;
    } else {
      winOne = false;
      winStart = n <= WIN ? 0 : p;
      winLen = Math.min(WIN, n - winStart);
    }
    const ids = S.order.slice(winStart, winStart + winLen).map((i) => S.queue[i].id);
    const idx = winOne ? 0 : p - winStart;
    loadAt = Date.now();
    if (!iframe) createPlayer(ids[idx]);
    cmd(autoplay ? 'loadPlaylist' : 'cuePlaylist', ids, idx, Math.floor(start || 0));
    cmd('setLoop', winOne || (S.repeat === 'all' && n <= WIN));
  }
  // キューや並びが変わったとき、今の曲・位置のまま窓を作り直す
  function reloadWindow() {
    if (!iframe || S.pos < 0 || !S.order.length) return;
    loadWindow(S.pos, S.time, S.playing);
  }
  function playPos(p, start = 0) {
    if (p < 0 || p >= S.order.length) return;
    const inWin = iframe && !winOne && winStart >= 0 && p >= winStart && p < winStart + winLen && !start;
    S.pos = p;
    S.time = start;
    endedFor = null;
    errorFor = null;
    S.miniClosed = false;
    const c = cur();
    S.duration = c.len || 0;
    if (inWin) { loadAt = Date.now(); cmd('playVideoAt', p - winStart); }
    else loadWindow(p, start, true);
    S.playing = true;
    save();
    renderAll();
    updateMediaSession();
    scrollQueueToCurrent();
  }
  function togglePlay() {
    const c = cur();
    if (!c) { openSheet('lib'); return; }
    if (!iframe) { playPos(S.pos, S.time); return; }
    if (S.playing) { cmd('pauseVideo'); S.playing = false; }
    else { cmd('playVideo'); S.playing = true; S.miniClosed = false; }
    renderControls();
    renderMini();
  }
  function next(auto) {
    if (!S.order.length) return;
    if (S.pos < S.order.length - 1) { playPos(S.pos + 1); return; }
    if (S.repeat !== 'off' || !auto) {
      if (S.shuffle) { const n = S.order.length; S.order = shuffled([...Array(n).keys()]); winStart = -1; }
      playPos(0);
      return;
    }
    S.playing = false;
    cmd('pauseVideo');
    renderControls();
  }
  function prev() {
    if (!S.order.length) return;
    if (S.time > 3) { seekTo(0); return; }
    if (S.pos > 0) playPos(S.pos - 1);
    else if (S.repeat === 'all') playPos(S.order.length - 1);
    else seekTo(0);
  }
  function seekTo(t) {
    S.time = t;
    cmd('seekTo', t, true);
    renderTime();
    save();
  }
  function shuffled(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function buildOrder(startIdx) {
    const n = S.queue.length;
    if (S.shuffle) {
      const rest = shuffled([...Array(n).keys()].filter((i) => i !== startIdx));
      S.order = startIdx >= 0 ? [startIdx, ...rest] : rest;
      return 0;
    }
    S.order = [...Array(n).keys()];
    return Math.max(0, startIdx);
  }
  function setQueue(tracks, startIdx, opts = {}) {
    if (!tracks.length) { toast('再生できる動画がありません'); return; }
    S.queue = tracks.map((t) => ({ ...t }));
    if (opts.shuffle != null) S.shuffle = opts.shuffle;
    S.sourceTitle = opts.title || '';
    S.sourceId = opts.id || '';
    const start = startIdx == null ? (S.shuffle ? Math.floor(Math.random() * tracks.length) : 0) : startIdx;
    const p = buildOrder(start);
    errorStreak = 0;
    winStart = -1;
    playPos(p);
    renderQueue();
  }
  function toggleShuffle() {
    const curIdx = S.pos >= 0 ? S.order[S.pos] : -1;
    S.shuffle = !S.shuffle;
    if (S.queue.length) S.pos = buildOrder(curIdx);
    if (S.pos < 0 || !S.queue.length) S.pos = S.queue.length ? 0 : -1;
    reloadWindow();
    toast(S.shuffle ? 'シャッフル：オン' : 'シャッフル：オフ');
    save(); renderControls(); renderQueue(); renderNow();
    settingsChanged();
  }
  function cycleRepeat() {
    const prevMode = S.repeat;
    S.repeat = S.repeat === 'off' ? 'all' : S.repeat === 'all' ? 'one' : 'off';
    if (iframe) {
      if (prevMode === 'one' || S.repeat === 'one') reloadWindow();
      else cmd('setLoop', S.repeat === 'all' && S.order.length <= WIN);
    }
    toast({ off: 'リピート：オフ', all: 'リピート：すべて', one: 'リピート：1曲' }[S.repeat]);
    save(); renderControls();
    settingsChanged();
  }
  function setVolume(v) {
    S.volume = v;
    cmd('setVolume', v);
    if (v > 0) cmd('unMute');
    save();
    settingsChanged();
  }
  function removeFromQueue(i) {
    if (i < 0 || i >= S.order.length) return;
    const wasCurrent = i === S.pos;
    S.order.splice(i, 1);
    if (i < S.pos) S.pos--;
    if (wasCurrent) {
      if (S.order.length === 0) { S.pos = -1; cmd('stopVideo'); S.playing = false; winStart = -1; }
      else {
        if (S.pos >= S.order.length) S.pos = 0;
        if (S.playing) { winStart = -1; playPos(S.pos); }
        else { S.time = 0; reloadWindow(); }
      }
    } else reloadWindow();
    save(); renderAll();
  }
  function clearQueue() {
    cmd('stopVideo');
    S.queue = []; S.order = []; S.pos = -1; S.playing = false; S.time = 0; S.duration = 0;
    S.sourceTitle = ''; S.sourceId = '';
    winStart = -1;
    save(); renderAll();
  }
  function currentPageVideo() {
    const u = new URL(location.href);
    let id = u.searchParams.get('v');
    if (!id) { const m = u.pathname.match(/^\/shorts\/([\w-]{6,})/); if (m) id = m[1]; }
    if (!id) return null;
    const title = document.title.replace(/\s*-\s*YouTube\s*$/, '').replace(/^\(\d+\)\s*/, '');
    return { id, title: title || id, author: '', len: 0 };
  }
  function playNextPageVideo() {
    const v = currentPageVideo();
    if (!v) { toast('動画ページを開いているときに使えます'); return; }
    S.queue.push(v);
    const qi = S.queue.length - 1;
    if (S.pos < 0) { S.order = [qi]; winStart = -1; playPos(0); }
    else { S.order.splice(S.pos + 1, 0, qi); reloadWindow(); save(); renderQueue(); }
    toast('次に再生：' + v.title);
  }
  function openOnYouTube() {
    const c = cur();
    if (!c) return;
    cmd('pauseVideo');
    S.playing = false;
    closeSheet();
    location.href = `/watch?v=${c.id}&t=${Math.floor(S.time)}s`;
  }
  // ミニプレーヤーの×：停止して隠す（次に再生したら再表示）
  function closeMini() {
    if (S.playing) cmd('pauseVideo');
    S.playing = false;
    S.miniClosed = true;
    renderControls();
    renderMini();
    updateMediaSession();
  }
  // ページ側の動画との競合
  let selfPausing = false;
  function pausePageVideos() {
    selfPausing = true;
    document.querySelectorAll('video').forEach((v) => { try { if (!v.paused && !v.muted) v.pause(); } catch { /* noop */ } });
    setTimeout(() => { selfPausing = false; }, 300);
  }
  document.addEventListener('play', (e) => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement) || v.muted || selfPausing) return;
    if (S.playing) { cmd('pauseVideo'); S.playing = false; renderControls(); }
  }, true);

  // スリープタイマー
  function setSleep(val) {
    S.sleepAt = 0; S.sleepEnd = false;
    if (val === 'end') { S.sleepEnd = true; toast('この曲の終わりで停止します'); }
    else if (+val > 0) { S.sleepAt = Date.now() + (+val) * 60000; toast(`${val}分後に停止します`); }
    renderSleep();
  }
  setInterval(() => {
    if (S.sleepAt && Date.now() >= S.sleepAt) {
      S.sleepAt = 0;
      cmd('pauseVideo'); S.playing = false;
      renderControls(); toast('スリープタイマーで停止しました');
    }
    if (S.sleepAt || S.sleepEnd) renderSleep();
    if (S.playing) save();
    // デスクトップ：停止中のミニプレーヤーを一定時間後に隠す
    if (!IS_MOBILE && S.miniHide > 0 && !S.playing && !sheetOpen && !miniHover && !S.miniClosed && cur()
        && Date.now() - miniIdleSince > S.miniHide * 1000) {
      S.miniClosed = true;
      renderMini();
    }
  }, 1000);
  let miniIdleSince = Date.now(), miniHover = false;
  function touchMini() { miniIdleSince = Date.now(); }

  // Media Session（ロック画面・通知の操作用。環境によっては効かない場合あり）
  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const c = cur();
    try {
      if (c) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: c.title, artist: c.author, album: S.sourceTitle || 'TubeTunes',
          artwork: [{ src: thumb(c.id, 'hqdefault'), sizes: '480x360', type: 'image/jpeg' }],
        });
      }
      navigator.mediaSession.playbackState = S.playing ? 'playing' : 'paused';
    } catch { /* noop */ }
  }
  try {
    navigator.mediaSession.setActionHandler('play', () => { if (!S.playing) togglePlay(); });
    navigator.mediaSession.setActionHandler('pause', () => { if (S.playing) togglePlay(); });
    navigator.mediaSession.setActionHandler('nexttrack', () => next(false));
    navigator.mediaSession.setActionHandler('previoustrack', () => prev());
  } catch { /* noop */ }

  // =========================================================
  // UI
  // =========================================================
  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .wrap { font-family: Roboto, "Noto Sans JP", Arial, sans-serif; color: #f1f1f1; -webkit-tap-highlight-color: transparent; }
  button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
  .ib { width: 44px; height: 44px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex: none; position: relative; }
  .ib:hover { background: rgba(255,255,255,.08); }
  .ib.on { color: #ff4e6a; }
  .ib.big { width: 56px; height: 56px; }
  .badge { position: absolute; right: 7px; bottom: 7px; font-size: 10px; font-weight: 700; background: #ff4e6a; color: #fff; border-radius: 6px; padding: 0 3px; line-height: 13px; display: none; }
  .rep.one .badge { display: block; }
  .hidden { display: none !important; }

  /* ミニプレーヤー */
  .mini { position: fixed; left: 0; right: 0; bottom: 0; height: 60px; z-index: 2147482000;
    display: flex; align-items: center; gap: 10px; padding: 0 6px 0 10px; background: #212121;
    border-top: 1px solid rgba(255,255,255,.08); box-shadow: 0 -4px 16px rgba(0,0,0,.4); cursor: pointer; }
  .mini.desk { left: auto; right: 16px; bottom: 16px; width: 380px; border-radius: 12px; border: 1px solid rgba(255,255,255,.1); overflow: hidden; }
  .mini-prog { position: absolute; left: 0; right: 0; top: 0; height: 2px; background: rgba(255,255,255,.15); }
  .mini-prog > div { height: 100%; width: 0; background: #ff0033; }
  .mini-art { width: 44px; height: 44px; border-radius: 6px; object-fit: cover; background: #333; flex: none; }
  .mini-text { flex: 1; min-width: 0; }
  .mini-title { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mini .ib.mini-x { width: 36px; height: 36px; color: #aaa; }
  .mini-sub { font-size: 12px; color: #aaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }

  /* シート */
  .sheet { position: fixed; z-index: 2147482500; background: #0f0f0f; display: flex; flex-direction: column;
    transition: transform .25s ease, opacity .25s ease; }
  .sheet.mob { inset: 0; }
  .sheet.desk { top: 0; right: 0; bottom: 0; width: 440px; border-left: 1px solid rgba(255,255,255,.1); box-shadow: -8px 0 24px rgba(0,0,0,.5); }
  .sheet.closed { pointer-events: none; opacity: 0; }
  .sheet.mob.closed { transform: translateY(100%); }
  .sheet.desk.closed { transform: translateX(100%); }
  .head { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,.08); flex: none; }
  .tabs { display: flex; flex: 1; gap: 4px; justify-content: center; }
  .tab { padding: 8px 14px; border-radius: 18px; font-size: 14px; color: #aaa; }
  .tab.on { background: #f1f1f1; color: #0f0f0f; font-weight: 500; }
  .pages { flex: 1; min-height: 0; position: relative; }
  .page { position: absolute; inset: 0; overflow-y: auto; overscroll-behavior: contain; }

  /* 再生中 */
  .now { padding: 16px 20px 28px; max-width: 520px; margin: 0 auto; }
  .art { width: 100%; aspect-ratio: 1 / 1; border-radius: 12px; overflow: hidden; background: #212121; position: relative;
    box-shadow: 0 8px 28px rgba(0,0,0,.5); }
  .art.wide { aspect-ratio: 16 / 9; background: #000; }
  .art img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .art .empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #555; }
  .np-title { font-size: 20px; font-weight: 600; margin-top: 20px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .np-sub { font-size: 14px; color: #aaa; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .np-src { font-size: 12px; color: #777; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .seek { width: 100%; margin: 18px 0 2px; accent-color: #ff0033; height: 20px; }
  .times { display: flex; justify-content: space-between; font-size: 12px; color: #aaa; font-variant-numeric: tabular-nums; }
  .ctrls { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
  .playbtn { width: 68px; height: 68px; border-radius: 50%; background: #f1f1f1; color: #0f0f0f; display: inline-flex; align-items: center; justify-content: center; }
  .extras { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 18px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border-radius: 17px; background: #272727; font-size: 13px; }
  .chip.on { background: #f1f1f1; color: #0f0f0f; }
  select.chip { appearance: none; -webkit-appearance: none; border: 0; color: #f1f1f1; font: inherit; font-size: 13px; padding: 0 14px; }
  .vol { display: flex; align-items: center; gap: 8px; margin-top: 14px; color: #aaa; }
  .vol input { flex: 1; accent-color: #f1f1f1; }

  /* リスト共通 */
  .lhead { display: flex; align-items: center; gap: 6px; padding: 10px 12px 6px; position: sticky; top: 0; background: #0f0f0f; z-index: 1; }
  .lhead .t { flex: 1; min-width: 0; font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lhead .s { font-size: 12px; color: #aaa; font-weight: 400; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 4px 12px 10px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 18px; background: #272727; font-size: 13px; }
  .btn.pri { background: #f1f1f1; color: #0f0f0f; font-weight: 500; }
  .filter { margin: 0 12px 8px; width: calc(100% - 24px); height: 36px; border-radius: 18px; border: 1px solid #333; background: #121212; color: #f1f1f1; padding: 0 14px; font: inherit; font-size: 14px; outline: none; }
  .filter:focus { border-color: #3ea6ff; }
  .row { display: flex; align-items: center; gap: 10px; padding: 6px 8px 6px 12px; cursor: pointer; }
  .row:hover { background: rgba(255,255,255,.05); }
  .row.cur { background: rgba(255,0,51,.12); }
  .row.cur .rt { color: #ff6b81; }
  .row .ix { width: 22px; text-align: center; font-size: 12px; color: #777; flex: none; font-variant-numeric: tabular-nums; }
  .row img { width: 64px; height: 36px; border-radius: 4px; object-fit: cover; background: #222; flex: none; }
  .row .rx { flex: 1; min-width: 0; }
  .rt { font-size: 14px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .rs { font-size: 12px; color: #aaa; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row .ib { width: 36px; height: 36px; color: #aaa; }
  .pl { display: flex; align-items: center; gap: 12px; padding: 8px 12px; cursor: pointer; }
  .pl:hover { background: rgba(255,255,255,.05); }
  .pl .pi { width: 96px; height: 54px; border-radius: 6px; background: #272727; flex: none; overflow: hidden; display: flex; align-items: center; justify-content: center; color: #888; }
  .pl .pi img { width: 100%; height: 100%; object-fit: cover; }
  /* ライブラリ（フォルダ＋サムネ一覧） */
  .tree { padding: 0 8px 24px; }
  .fh { display: flex; align-items: center; gap: 10px; padding: 14px 8px 10px; margin-top: 6px; cursor: pointer; user-select: none;
    border-bottom: 1px solid rgba(255,255,255,.1); position: sticky; top: 60px; background: #0f0f0f; z-index: 1; }
  .fh .car { width: 12px; color: #aaa; font-size: 12px; transition: transform .15s; }
  .fh.open .car { transform: rotate(90deg); }
  .fh .fn { font-size: 17px; font-weight: 700; }
  .fh .fc { font-size: 12px; color: #0f0f0f; background: #aaa; border-radius: 10px; padding: 1px 8px; font-weight: 600; }
  .tree .pl { padding: 8px 8px 8px 30px; }
  .pl .rx { flex: 1; min-width: 0; }
  .pl .rt { font-weight: 500; }
  .pl .ib.hb { width: 36px; height: 36px; color: #888; }
  .pl .car2 { color: #777; font-size: 11px; flex: none; transition: transform .15s; }
  .pl.open .car2 { transform: rotate(90deg); }
  .pl.open { background: rgba(255,255,255,.05); }
  .tbody { padding: 4px 0 12px 30px; border-bottom: 1px solid rgba(255,255,255,.06); }
  .tbody .actions { padding: 2px 0 8px; }
  .msg.sm { padding: 10px 28px 16px; text-align: left; font-size: 13px; }
  .setbox { margin-top: 18px; border-top: 1px solid rgba(255,255,255,.1); padding-top: 6px; }
  .setbox > summary { cursor: pointer; font-size: 14px; font-weight: 600; padding: 10px 4px; user-select: none; }
  .setbox .sec { text-align: center; padding: 14px 0 0; }
  .uirow { display: flex; align-items: center; gap: 8px; margin-top: 8px; color: #ccc; font-size: 13px; }
  .uirow input[type=range] { flex: 1; accent-color: #f1f1f1; }
  .uirow .num { width: 84px; height: 32px; border-radius: 8px; border: 1px solid #333; background: #121212; color: #f1f1f1; padding: 0 8px; font: inherit; }
  .sy { margin-top: 8px; }
  .sy-st { font-size: 12px; color: #aaa; text-align: center; margin: 4px 0 2px; line-height: 1.5; }
  .sy-auto { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; color: #ccc; margin-top: 12px; }
  .sy-auto input { accent-color: #ff0033; }
  .sy-det { margin-top: 12px; font-size: 12px; color: #aaa; }
  .sy-det summary { cursor: pointer; text-align: center; }
  .sy-help { margin: 8px 0 4px; line-height: 1.6; }
  .sy-code { display: block; background: #212121; padding: 8px; border-radius: 6px; word-break: break-all; user-select: all; color: #f1f1f1; }
  .sy-row { display: flex; gap: 6px; align-items: center; }
  .sy-row .sy-cid { margin: 0; flex: 1; width: auto; }
  .msg { padding: 28px 20px; text-align: center; color: #aaa; font-size: 14px; line-height: 1.6; }
  .sec { padding: 14px 12px 4px; font-size: 12px; color: #888; }

  /* 動画枠（iframeは常にここ。表示/非表示はCSSだけで切替え → 再読込させない） */
  .videobox { position: fixed; z-index: 2147482600; overflow: hidden; border-radius: 12px; background: #000; }
  .videobox iframe { width: 100%; height: 100%; border: 0; display: block; }

  .toast { position: fixed; left: 50%; bottom: 90px; transform: translateX(-50%) translateY(20px); opacity: 0; z-index: 2147483000;
    background: #f1f1f1; color: #0f0f0f; font-size: 13px; padding: 10px 16px; border-radius: 8px; max-width: 86vw;
    transition: opacity .2s, transform .2s; pointer-events: none; text-align: center; }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  `;

  const host = h('div', { id: 'tubetunes-host', style: 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147482000;' });
  const root = host.attachShadow({ mode: 'open' });
  root.append(h('style', { text: CSS }));
  const wrap = h('div', { class: 'wrap' });
  root.append(wrap);

  // ---- ミニプレーヤー ----
  const mini = {};
  mini.fill = h('div');
  mini.img = h('img', { class: 'mini-art', alt: '' });
  mini.title = h('div', { class: 'mini-title' });
  mini.sub = h('div', { class: 'mini-sub' });
  mini.play = h('button', { class: 'ib', title: '再生/一時停止', onclick: (e) => { e.stopPropagation(); togglePlay(); } });
  mini.next = h('button', { class: 'ib', title: '次へ', onclick: (e) => { e.stopPropagation(); next(false); } }, icon('next'));
  mini.close = h('button', { class: 'ib mini-x', title: '停止して閉じる', onclick: (e) => { e.stopPropagation(); closeMini(); } }, icon('close', 20));
  mini.el = h('div', { class: 'mini hidden' + (IS_MOBILE ? '' : ' desk'), onclick: () => openSheet('now') },
    h('div', { class: 'mini-prog' }, mini.fill), mini.img, h('div', { class: 'mini-text' }, mini.title, mini.sub), mini.play, mini.next, mini.close);
  mini.el.addEventListener('mouseenter', () => { miniHover = true; });
  mini.el.addEventListener('mouseleave', () => { miniHover = false; touchMini(); });
  mini.el.addEventListener('pointerdown', () => touchMini());

  // ---- シート ----
  let sheetOpen = false, tab = 'now';
  const tabs = {};
  const pages = {
    now: h('div', { class: 'page' }),
    queue: h('div', { class: 'page hidden' }),
    lib: h('div', { class: 'page hidden' }),
  };
  const tabBar = h('div', { class: 'tabs' },
    [['now', '再生中'], ['queue', 'キュー'], ['lib', 'ライブラリ']].map(([k, l]) => (tabs[k] = h('button', { class: 'tab', onclick: () => setTab(k) }, l))));
  const sheet = h('div', { class: 'sheet closed ' + (IS_MOBILE ? 'mob' : 'desk') },
    h('div', { class: 'head' },
      h('button', { class: 'ib', title: '閉じる', onclick: closeSheet }, icon(IS_MOBILE ? 'down' : 'close')),
      tabBar,
      h('div', { style: 'width:44px' })),
    h('div', { class: 'pages' }, pages.now, pages.queue, pages.lib));
  const videoBox = h('div', { class: 'videobox' });
  const toastEl = h('div', { class: 'toast' });
  wrap.append(mini.el, sheet, videoBox, toastEl);

  // ---- 再生中ページ ----
  const now = {};
  now.img = h('img', { alt: '' });
  now.empty = h('div', { class: 'empty' }, icon('music', 72));
  now.art = h('div', { class: 'art' }, now.img, now.empty);
  now.title = h('div', { class: 'np-title' });
  now.sub = h('div', { class: 'np-sub' });
  now.src = h('div', { class: 'np-src' });
  now.seek = h('input', { type: 'range', min: '0', max: '1000', value: '0', class: 'seek' });
  now.tCur = h('span', { text: '0:00' });
  now.tDur = h('span', { text: '0:00' });
  now.shuf = h('button', { class: 'ib', title: 'シャッフル', onclick: toggleShuffle }, icon('shuffle'));
  now.prev = h('button', { class: 'ib big', title: '前へ', onclick: prev }, icon('prev', 34));
  now.play = h('button', { class: 'playbtn', title: '再生/一時停止', onclick: togglePlay });
  now.next = h('button', { class: 'ib big', title: '次へ', onclick: () => next(false) }, icon('next', 34));
  now.rep = h('button', { class: 'ib rep', title: 'リピート', onclick: cycleRepeat }, icon('repeat'), h('span', { class: 'badge', text: '1' }));
  now.vid = h('button', { class: 'chip', onclick: toggleVideo }, icon('video', 18), h('span', { text: '動画を表示' }));
  now.sleep = h('select', { class: 'chip', title: 'スリープタイマー', onchange: (e) => setSleep(e.target.value) },
    [['0', '⏾ スリープ：オフ'], ['15', '⏾ 15分'], ['30', '⏾ 30分'], ['45', '⏾ 45分'], ['60', '⏾ 60分'], ['90', '⏾ 90分'], ['end', '⏾ この曲の終わり']]
      .map(([v, l]) => h('option', { value: v }, l)));
  now.yt = h('button', { class: 'chip', onclick: openOnYouTube }, icon('open', 18), h('span', { text: 'YouTubeで開く' }));
  // 設定：画質 / ミニプレーヤーの自動非表示
  now.quality = h('select', { class: 'chip', title: '画質', onchange: (e) => setQuality(e.target.value) },
    [['auto', '画質：自動（省データ）'], ['hd720', '画質：720p'], ['hd1080', '画質：1080p'], ['hd1440', '画質：1440p']]
      .map(([v, l]) => h('option', { value: v }, l)));
  now.miniHide = h('select', { class: 'chip', title: '停止中のミニプレーヤーを隠すまでの時間',
    onchange: (e) => { S.miniHide = +e.target.value; touchMini(); save(); settingsChanged(); } },
    [[0, 'ミニ自動非表示：しない'], [30, 'ミニ自動非表示：30秒'], [60, 'ミニ自動非表示：1分'], [180, 'ミニ自動非表示：3分'],
      [300, 'ミニ自動非表示：5分'], [600, 'ミニ自動非表示：10分'], [1800, 'ミニ自動非表示：30分']]
      .map(([v, l]) => h('option', { value: String(v) }, l)));
  // 動画内の UI の大きさ（TubeFolio の「新プレビューの UI の大きさ」と同じ方式）
  now.uiR = h('input', { type: 'range', min: '1', max: '100', step: '1', value: '100' });
  now.uiN = h('input', { type: 'number', class: 'num', min: '0.01', max: '100', step: '0.01', value: '100' });
  now.uiR.addEventListener('input', () => setUiScale(+now.uiR.value));
  now.uiN.addEventListener('change', () => setUiScale(+now.uiN.value));
  now.ad = h('input', { type: 'checkbox' });
  now.ad.addEventListener('change', () => { S.adFast = now.ad.checked; save(); settingsChanged(); toast(S.adFast ? '広告を16倍速で早送りします' : '広告の早送りをオフにしました'); });
  now.vol = h('input', { type: 'range', min: '0', max: '100', value: String(S.volume) });
  now.vol.addEventListener('input', () => setVolume(+now.vol.value));
  let seeking = false;
  now.seek.addEventListener('input', () => {
    seeking = true;
    now.tCur.textContent = fmt((+now.seek.value / 1000) * S.duration);
  });
  now.seek.addEventListener('change', () => {
    seeking = false;
    if (S.duration) seekTo((+now.seek.value / 1000) * S.duration);
  });
  // =========================================================
  // Google Drive 同期（設定の保存・共有）
  //  対象：シャッフル/リピート/音量/画質/ミニ自動非表示/動画表示、フォルダの開閉、非表示にした再生リスト
  //  ・設定を変えると約5秒後に自動保存（自動同期オン時）
  //  ・YouTubeを開いたとき、Driveの方が新しければ取り込む
  // =========================================================
  const SYNC_META_KEY = 'tubetunes_sync_meta_v1';
  const syncMeta = { savedAt: 0, syncedAt: 0 }; // savedAt: この端末で設定を変えた時刻 / syncedAt: Driveと揃えた時の savedAt
  let syncState = {}, syncPushT = null, syncBusy = false;

  function driveMsg(op, extra) {
    return new Promise((res) => {
      try {
        chrome.runtime.sendMessage({ type: 'tt-drive', op, mobile: IS_MOBILE, ...(extra || {}) }, (r) => {
          if (chrome.runtime.lastError) res({ ok: false, error: chrome.runtime.lastError.message });
          else res(r || { ok: false, error: '応答がありません' });
        });
      } catch (e) { res({ ok: false, error: '拡張機能が更新されました。ページを再読み込みしてください' }); }
    });
  }
  function collectSettings() {
    return {
      app: 'TubeTunes', v: 1, savedAt: syncMeta.savedAt || Date.now(),
      player: { shuffle: S.shuffle, repeat: S.repeat, volume: S.volume, quality: S.quality, miniHide: S.miniHide, showVideo: S.showVideo, uiScale: S.uiScale, adFast: S.adFast },
      folders: { ...folders },
      hidden: [...hiddenIds],
    };
  }
  function applySettings(d) {
    const p = d.player || {};
    const prevShuffle = S.shuffle, prevRepeat = S.repeat;
    if (typeof p.repeat === 'string') S.repeat = p.repeat;
    if (typeof p.volume === 'number') { S.volume = p.volume; cmd('setVolume', S.volume); }
    if (typeof p.quality === 'string') S.quality = p.quality;
    if (typeof p.miniHide === 'number') S.miniHide = p.miniHide;
    if (typeof p.showVideo === 'boolean') S.showVideo = p.showVideo;
    if (typeof p.uiScale === 'number') S.uiScale = clampScale(p.uiScale);
    if (typeof p.adFast === 'boolean') S.adFast = p.adFast;
    if (typeof p.shuffle === 'boolean' && p.shuffle !== prevShuffle) {
      const curIdx = S.pos >= 0 ? S.order[S.pos] : -1;
      S.shuffle = p.shuffle;
      if (S.queue.length) S.pos = buildOrder(curIdx);
      reloadWindow();
    } else if (S.repeat !== prevRepeat) reloadWindow();
    if (d.folders) Object.assign(folders, d.folders);
    if (Array.isArray(d.hidden)) { hiddenIds.clear(); d.hidden.forEach((id) => hiddenIds.add(id)); }
    try { chrome.storage.local.set({ [FOLDER_KEY]: { ...folders }, [HIDDEN_KEY]: [...hiddenIds] }); } catch { /* noop */ }
    save();
    renderAll();
    if (tab === 'lib') renderLib();
  }
  function saveMeta() { try { chrome.storage.local.set({ [SYNC_META_KEY]: { ...syncMeta } }); } catch { /* noop */ } }
  function settingsChanged() {
    syncMeta.savedAt = Date.now();
    saveMeta();
    if (syncState.connected && syncState.auto) {
      clearTimeout(syncPushT);
      syncPushT = setTimeout(() => syncPush(false), 5000);
    }
    renderSync();
  }
  async function syncPush(interactive) {
    if (syncBusy) { clearTimeout(syncPushT); syncPushT = setTimeout(() => syncPush(interactive), 3000); return; }
    syncBusy = true; renderSync('保存中…');
    if (!syncMeta.savedAt) syncMeta.savedAt = Date.now();
    const data = collectSettings();
    const r = await driveMsg('push', { data, interactive });
    syncBusy = false;
    if (r.ok) { syncMeta.syncedAt = data.savedAt; saveMeta(); if (interactive) toast('Google Drive に保存しました'); }
    else if (interactive) toast('保存できませんでした：' + r.error);
    await refreshSyncState();
  }
  async function syncPull(interactive) {
    if (syncBusy) return;
    syncBusy = true; renderSync('読み込み中…');
    const r = await driveMsg('pull', { interactive });
    syncBusy = false;
    if (!r.ok) { if (interactive) toast('読み込めませんでした：' + r.error); await refreshSyncState(); return; }
    const d = r.data;
    if (!d || d.app !== 'TubeTunes') {
      if (interactive) toast('Drive にはまだ保存されていません');
      else if (syncMeta.savedAt) await syncPush(false); // 初回：この端末の設定を保存
      await refreshSyncState();
      return;
    }
    const localNewer = syncMeta.savedAt > (d.savedAt || 0) && syncMeta.savedAt !== syncMeta.syncedAt;
    if (!interactive && localNewer) {
      await syncPush(false); // この端末の方が新しい未保存の変更 → Driveへ
    } else if (interactive || (d.savedAt || 0) > (syncMeta.syncedAt || 0)) {
      applySettings(d);
      syncMeta.savedAt = syncMeta.syncedAt = d.savedAt || Date.now();
      saveMeta();
      toast('Google Drive の設定を読み込みました');
    }
    await refreshSyncState();
  }
  async function refreshSyncState() {
    const r = await driveMsg('status');
    if (r.ok) syncState = r;
    renderSync();
  }
  async function syncConnect() {
    renderSync('接続中…');
    const r = await driveMsg('connect');
    if (r.ok && r.pending) toast('開いたタブでGoogleにログインしてください。終わるとタブは自動で閉じます');
    else if (r.ok) { toast('Google Drive に接続しました'); await syncPull(false); }
    else toast('接続できませんでした：' + r.error);
    await refreshSyncState();
  }
  async function syncDisconnect() {
    if (!confirm('Google Drive との接続を解除しますか？（Drive上のファイルは残ります）')) return;
    await driveMsg('disconnect');
    await refreshSyncState();
  }
  async function syncInit() {
    try {
      const r = await chrome.storage.local.get(SYNC_META_KEY);
      if (r && r[SYNC_META_KEY]) Object.assign(syncMeta, r[SYNC_META_KEY]);
    } catch { /* noop */ }
    await refreshSyncState();
    if (syncState.connected && syncState.auto) await syncPull(false);
    // モバイルのタブ認証が終わったら（バックグラウンドが ttSync を更新）取り込み
    try {
      chrome.storage.onChanged.addListener((ch, area) => {
        if (area !== 'local' || !ch.ttSync) return;
        const was = syncState.connected && !syncState.needReauth;
        refreshSyncState().then(() => {
          if (!was && syncState.connected && !syncState.needReauth && syncState.hasToken && !syncState.pendingAuth) syncPull(false);
        });
      });
    } catch { /* noop */ }
  }
  function fmtTime(t) {
    if (!t) return '—';
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const syncUI = {};
  syncUI.status = h('div', { class: 'sy-st' });
  syncUI.connect = h('button', { class: 'chip', onclick: syncConnect }, icon('open', 18), h('span', { text: 'Google Drive に接続' }));
  syncUI.push = h('button', { class: 'chip', onclick: () => syncPush(true) }, h('span', { text: '⬆ Driveに保存' }));
  syncUI.pull = h('button', { class: 'chip', onclick: () => { if (confirm('Drive の設定でこの端末の設定を置き換えますか？')) syncPull(true); } }, h('span', { text: '⬇ Driveから読み込み' }));
  syncUI.disc = h('button', { class: 'chip', onclick: syncDisconnect }, h('span', { text: '接続を解除' }));
  syncUI.auto = h('input', { type: 'checkbox' });
  syncUI.auto.addEventListener('change', async () => {
    await driveMsg('setOpt', { patch: { auto: syncUI.auto.checked, autoUserOff: !syncUI.auto.checked } });
    await refreshSyncState();
    if (syncUI.auto.checked) syncPull(false);
  });
  syncUI.redirect = h('code', { class: 'sy-code' });
  syncUI.cid = h('input', { class: 'filter sy-cid', placeholder: 'OAuthクライアントID（空欄＝TubeFolioと同じID）' });
  syncUI.el = h('div', { class: 'sy' },
    h('div', { class: 'sec', text: 'Google Drive 同期' }),
    syncUI.status,
    h('div', { class: 'extras' }, syncUI.connect, syncUI.push, syncUI.pull, syncUI.disc),
    h('label', { class: 'sy-auto' }, syncUI.auto, h('span', { text: '自動同期（設定を変えたら保存・開いたときにDriveが新しければ読み込み）' })),
    h('details', { class: 'sy-det' },
      h('summary', { text: '初回の準備（Google Cloud の設定）' }),
      h('div', { class: 'sy-help', text: 'Google Cloud コンソール →「APIとサービス」→「認証情報」で、TubeFolio に使っている OAuthクライアントID（ウェブアプリケーション）を開き、「承認済みのリダイレクトURI」に次のURIを追加して保存してください。' }),
      syncUI.redirect,
      h('div', { class: 'sy-help', text: '別のクライアントIDを使う場合はここに入力して保存：' }),
      h('div', { class: 'sy-row' }, syncUI.cid,
        h('button', { class: 'chip', onclick: async () => { await driveMsg('setOpt', { patch: { clientId: syncUI.cid.value.trim() } }); toast('クライアントIDを保存しました'); refreshSyncState(); } }, h('span', { text: '保存' })))));
  function renderSync(busyText) {
    const s = syncState || {};
    let st;
    if (busyText) st = busyText;
    else if (s.pendingAuth) st = 'タブでGoogleにログインしてください…';
    else if (!s.connected) st = '未接続（設定はこの端末だけに保存されています）';
    else if (s.needReauth || (IS_MOBILE && !s.hasToken)) st = `再接続が必要です（${s.email || ''}）— 「Google Drive に接続」を押してください`;
    else if (s.lastError) st = `エラー：${s.lastError}`;
    else {
      const unsaved = syncMeta.savedAt && syncMeta.savedAt !== syncMeta.syncedAt;
      st = `接続中：${s.email || 'Google アカウント'}　最終保存 ${fmtTime(s.lastPush)}・最終読み込み ${fmtTime(s.lastPull)}${unsaved ? '　（未保存の変更あり）' : ''}`;
    }
    syncUI.status.textContent = st;
    const needConnect = !s.connected || s.needReauth || (IS_MOBILE && !s.hasToken);
    syncUI.connect.classList.toggle('hidden', !needConnect);
    syncUI.connect.lastChild.textContent = s.connected ? 'Google Drive に再接続' : 'Google Drive に接続';
    syncUI.push.classList.toggle('hidden', !s.connected);
    syncUI.pull.classList.toggle('hidden', !s.connected);
    syncUI.disc.classList.toggle('hidden', !s.connected);
    syncUI.auto.checked = !!s.auto;
    syncUI.auto.disabled = !s.connected;
    syncUI.redirect.textContent = s.redirect || '';
    if (document.activeElement !== syncUI.cid && s.clientId && !s.builtin) syncUI.cid.value = s.clientId;
  }
  pages.now.append(h('div', { class: 'now' },
    now.art, now.title, now.sub, now.src, now.seek,
    h('div', { class: 'times' }, now.tCur, now.tDur),
    h('div', { class: 'ctrls' }, now.shuf, now.prev, now.play, now.next, now.rep),
    IS_MOBILE ? null : h('div', { class: 'vol' }, icon('volume', 20), now.vol),
    // プレーヤーの操作以外（ツール類・新機能・Drive 同期）は「設定」にまとめる
    h('details', { class: 'setbox' },
      h('summary', { text: '⚙ 設定' }),
      h('div', { class: 'sec', text: 'ツール' }),
      h('div', { class: 'extras' }, now.vid, now.sleep, now.yt),
      h('div', { class: 'sec', text: '表示' }),
      h('div', { class: 'extras' }, now.quality, IS_MOBILE ? null : now.miniHide),
      h('div', { class: 'sec', text: '動画内の UI の大きさ（100%＝そのまま／小さいほどタイトルやボタンが小さくなる）' }),
      h('div', { class: 'uirow' }, now.uiR, now.uiN, h('span', { text: '%' })),
      h('div', { class: 'sec', text: '広告' }),
      h('label', { class: 'sy-auto' }, now.ad, h('span', { text: '広告を16倍速・ミュートで早送りし、スキップできれば自動で押す' })),
      syncUI.el)));
  pages.now.addEventListener('scroll', placeVideo, { passive: true });

  // ---- キューページ ----
  const qv = {};
  qv.title = h('div', { class: 't' });
  qv.list = h('div');
  pages.queue.append(
    h('div', { class: 'lhead' }, qv.title),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: playNextPageVideo }, icon('add', 18), '表示中の動画を次に再生'),
      h('button', { class: 'btn', onclick: () => { if (confirm('キューをクリアしますか？')) clearQueue(); } }, icon('clear', 18), 'クリア')),
    qv.list);

  // ---- ライブラリページ ----
  const lib = { playlists: null, loading: false, error: '', open: new Set(), tracks: new Map() };

  // ---- 描画 ----
  function renderControls() {
    const ic = S.playing ? 'pause' : 'play';
    mini.play.replaceChildren(icon(ic));
    now.play.replaceChildren(icon(ic, 38));
    now.shuf.classList.toggle('on', S.shuffle);
    now.rep.classList.toggle('on', S.repeat !== 'off');
    now.rep.classList.toggle('one', S.repeat === 'one');
    now.vid.classList.toggle('on', S.showVideo);
    now.vol.value = String(S.volume);
    now.quality.value = S.quality;
    now.miniHide.value = String(S.miniHide);
    now.uiR.value = String(Math.max(1, Math.round(S.uiScale)));
    if (document.activeElement !== now.uiN) now.uiN.value = String(+S.uiScale.toFixed(2));
    now.ad.checked = S.adFast;
    document.querySelectorAll('.tt-pivot').forEach((b) => b.classList.toggle('tt-active', S.playing));
  }
  function renderTime() {
    const d = S.duration || 0;
    const r = d ? Math.min(1, S.time / d) : 0;
    mini.fill.style.width = (r * 100).toFixed(2) + '%';
    if (!seeking) {
      now.seek.value = String(Math.round(r * 1000));
      now.tCur.textContent = fmt(S.time);
    }
    now.tDur.textContent = fmt(d);
    try {
      if (d && 'mediaSession' in navigator && navigator.mediaSession.setPositionState) {
        navigator.mediaSession.setPositionState({ duration: d, position: Math.min(S.time, d), playbackRate: 1 });
      }
    } catch { /* noop */ }
  }
  function renderMini() {
    const c = cur();
    mini.el.classList.toggle('hidden', !c || sheetOpen || S.miniClosed);
    if (!c) return;
    if (mini.img.dataset.id !== c.id) { mini.img.src = thumb(c.id, 'default'); mini.img.dataset.id = c.id; }
    mini.title.textContent = c.title;
    mini.sub.textContent = c.author || S.sourceTitle;
    layoutMini();
  }
  function renderNow() {
    const c = cur();
    now.empty.classList.toggle('hidden', !!c);
    now.img.classList.toggle('hidden', !c);
    if (c && now.img.dataset.id !== c.id) {
      now.img.dataset.id = c.id;
      now.img.onerror = () => { if (!now.img.src.includes('hqdefault')) now.img.src = thumb(c.id, 'hqdefault'); };
      now.img.src = thumb(c.id, 'maxresdefault');
    }
    now.title.textContent = c ? c.title : '再生していません';
    now.sub.textContent = c ? c.author : '「ライブラリ」から再生リストを選んでください';
    now.src.textContent = c && S.sourceTitle ? `再生元：${S.sourceTitle}（${S.pos + 1} / ${S.order.length}）` : '';
    now.art.classList.toggle('wide', S.showVideo && !!iframe);
  }
  function trackRow(t, idx, label, isCur, onClick, onRemove) {
    return h('div', { class: 'row' + (isCur ? ' cur' : ''), onclick: onClick },
      h('div', { class: 'ix', text: label }),
      h('img', { src: thumb(t.id, 'default'), loading: 'lazy', alt: '' }),
      h('div', { class: 'rx' },
        h('div', { class: 'rt', text: t.title }),
        h('div', { class: 'rs', text: [t.author, t.len ? fmt(t.len) : ''].filter(Boolean).join(' ・ ') })),
      onRemove ? h('button', { class: 'ib', title: 'キューから削除', onclick: (e) => { e.stopPropagation(); onRemove(); } }, icon('close', 18)) : null);
  }
  function renderQueue() {
    qv.title.replaceChildren(document.createTextNode(S.sourceTitle || '再生キュー'), h('span', { class: 's', text: `  ${S.order.length}曲` }));
    if (tab !== 'queue') return;
    if (!S.order.length) {
      qv.list.replaceChildren(h('div', { class: 'msg', text: 'キューは空です。「ライブラリ」から再生リストを選んでください。' }));
      return;
    }
    const frag = document.createDocumentFragment();
    S.order.forEach((qi, i) => {
      const t = S.queue[qi];
      if (!t) return;
      frag.append(trackRow(t, i, i === S.pos ? '▶' : String(i + 1), i === S.pos, () => playPos(i), () => removeFromQueue(i)));
    });
    qv.list.replaceChildren(frag);
  }
  function scrollQueueToCurrent() {
    if (tab !== 'queue') return;
    requestAnimationFrame(() => {
      const el = qv.list.querySelector('.row.cur');
      if (el) el.scrollIntoView({ block: 'center' });
    });
  }

  // ---- ライブラリ画面 ----
  //  ▾ ライブラリ（N）       … 「ライブラリに保存」した他人の再生リスト
  //      [サムネ] タイトル
  //  ▾ 再生リスト（N）       … 自分で作った再生リスト
  //      [サムネ] タイトル
  //  フォルダ見出しをタップで表示/非表示（状態は保存）。再生リストをタップで曲一覧を開閉。
  const FOLDER_KEY = 'tubetunes_folders_v1';
  const HIDDEN_KEY = 'tubetunes_hidden_v1';
  const folders = { saved: true, own: true, hidden: false };
  const hiddenIds = new Set();
  try {
    chrome.storage.local.get([FOLDER_KEY, HIDDEN_KEY]).then((r) => {
      if (r && r[FOLDER_KEY]) Object.assign(folders, r[FOLDER_KEY]);
      if (r && Array.isArray(r[HIDDEN_KEY])) r[HIDDEN_KEY].forEach((id) => hiddenIds.add(id));
      if (tab === 'lib') renderLib();
    }).catch(() => {});
  } catch { /* noop */ }
  // 非表示にした再生リストは「非表示」フォルダへ。解除すると元のフォルダ（ライブラリ/再生リスト）に戻る
  function toggleHidden(pl) {
    if (hiddenIds.has(pl.id)) { hiddenIds.delete(pl.id); toast(`表示に戻しました：${pl.title}`); }
    else { hiddenIds.add(pl.id); toast(`非表示にしました：${pl.title}`); }
    try { chrome.storage.local.set({ [HIDDEN_KEY]: [...hiddenIds] }); } catch { /* noop */ }
    renderLib();
    settingsChanged();
  }
  function toggleFolder(k) {
    folders[k] = !folders[k];
    try { chrome.storage.local.set({ [FOLDER_KEY]: { ...folders } }); } catch { /* noop */ }
    renderLib();
    settingsChanged();
  }
  function libKey(id) { return 'pl:' + id; }
  function toggleOpen(key) {
    if (lib.open.has(key)) lib.open.delete(key); else lib.open.add(key);
    renderLib();
  }
  async function ensureTracks(pl, force) {
    const cur0 = lib.tracks.get(pl.id);
    if (cur0 && cur0.loading) return;
    if (cur0 && cur0.tracks && !force) return;
    const st = { loading: true, tracks: null, error: '' };
    lib.tracks.set(pl.id, st);
    renderLib();
    try {
      st.tracks = await fetchPlaylistTracks(pl.id, force);
    } catch (e) {
      st.error = '読み込みに失敗しました：' + (e && e.message ? e.message : e);
    }
    st.loading = false;
    if (lib.tracks.get(pl.id) === st) renderLib();
  }
  function countLabel(pl) {
    const st = lib.tracks.get(pl.id);
    if (st && st.tracks) return `${st.tracks.length} 本`;
    const n = parseInt(String(pl.count || '').replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? `${n} 本` : '';
  }
  function folderHead(k, name, n) {
    return h('div', { class: 'fh' + (folders[k] ? ' open' : ''), role: 'button', onclick: () => toggleFolder(k) },
      h('span', { class: 'car', text: '▸' }),
      h('span', { class: 'fn', text: name }),
      h('span', { class: 'fc', text: `${n}` }));
  }
  function playlistBlock(pl) {
    const key = libKey(pl.id);
    const open = lib.open.has(key);
    const st = lib.tracks.get(pl.id);
    const img = pl.img || (st && st.tracks && st.tracks[0] ? thumb(st.tracks[0].id) : '');
    const isHidden = hiddenIds.has(pl.id);
    const sub = [countLabel(pl), isHidden ? `元のフォルダ：${pl.own ? '再生リスト' : 'ライブラリ'}` : ''].filter(Boolean).join(' ・ ');
    const frag = document.createDocumentFragment();
    frag.append(h('div', { class: 'pl' + (open ? ' open' : ''), onclick: () => { toggleOpen(key); if (lib.open.has(key)) ensureTracks(pl); } },
      h('div', { class: 'pi' }, img ? h('img', { src: img, loading: 'lazy', alt: '' }) : icon('list', 28)),
      h('div', { class: 'rx' },
        h('div', { class: 'rt', text: pl.title }),
        sub ? h('div', { class: 'rs', text: sub }) : null),
      h('button', { class: 'ib hb', title: isHidden ? '表示に戻す' : '非表示にする',
        onclick: (e) => { e.stopPropagation(); toggleHidden(pl); } }, icon(isHidden ? 'eye' : 'eyeoff', 20)),
      h('span', { class: 'car2', text: '▸' })));
    if (!open) return frag;
    const box = h('div', { class: 'tbody' });
    if (!st || st.loading) box.append(h('div', { class: 'msg sm', text: '読み込み中…' }));
    else if (st.error) box.append(h('div', { class: 'msg sm', text: st.error }));
    else if (!st.tracks.length) box.append(h('div', { class: 'msg sm', text: 'この再生リストは空です' }));
    else {
      const opts = { title: pl.title, id: pl.id };
      box.append(h('div', { class: 'actions' },
        h('button', { class: 'btn pri', onclick: () => { setQueue(st.tracks, 0, { ...opts, shuffle: false }); setTab('now'); } }, icon('play', 18), 'すべて再生'),
        h('button', { class: 'btn', onclick: () => { setQueue(st.tracks, null, { ...opts, shuffle: true }); setTab('now'); } }, icon('shuffle', 18), 'シャッフル'),
        h('button', { class: 'btn', title: '再読み込み', onclick: () => ensureTracks(pl, true) }, icon('refresh', 18))));
      const curId = cur() && S.sourceId === pl.id ? cur().id : null;
      st.tracks.forEach((t, i) => box.append(trackRow(t, i, String(i + 1), t.id === curId, () => {
        setQueue(st.tracks, i, opts);
        setTab('now');
      })));
    }
    frag.append(box);
    return frag;
  }
  function renderLib() {
    const p = pages.lib;
    const keepScroll = p.scrollTop;
    const head = h('div', { class: 'lhead' },
      h('div', { class: 't', text: 'ライブラリ' }),
      h('button', { class: 'ib', title: '再読み込み', onclick: () => loadLibrary(true) }, icon('refresh')));
    const body = h('div', { class: 'tree' });
    if (lib.loading && !lib.playlists) body.append(h('div', { class: 'msg', text: '読み込み中…' }));
    else if (lib.error && !lib.playlists) body.append(h('div', { class: 'msg', text: lib.error }));
    else if (lib.playlists) {
      const saved = lib.playlists.filter((pl) => !pl.own && !hiddenIds.has(pl.id));
      const own = lib.playlists.filter((pl) => pl.own && !hiddenIds.has(pl.id));
      const hidden = lib.playlists.filter((pl) => hiddenIds.has(pl.id));
      body.append(folderHead('saved', 'ライブラリ', saved.length));
      if (folders.saved) {
        if (saved.length) saved.forEach((pl) => body.append(playlistBlock(pl)));
        else body.append(h('div', { class: 'msg sm', text: '「ライブラリに保存」した再生リストはありません' }));
      }
      body.append(folderHead('own', '再生リスト', own.length));
      if (folders.own) {
        if (own.length) own.forEach((pl) => body.append(playlistBlock(pl)));
        else body.append(h('div', { class: 'msg sm', text: '自分で作った再生リストはありません' }));
      }
      body.append(folderHead('hidden', '非表示', hidden.length));
      if (folders.hidden) {
        if (hidden.length) hidden.forEach((pl) => body.append(playlistBlock(pl)));
        else body.append(h('div', { class: 'msg sm', text: '非表示にした再生リストはありません（各行の目のアイコンで非表示にできます）' }));
      }
    }
    p.replaceChildren(head, body);
    p.scrollTop = keepScroll;
  }
  async function loadLibrary(force) {
    if (lib.loading) return;
    if (lib.playlists && !force) { renderLib(); return; }
    lib.loading = true; lib.error = '';
    if (force) { lib.tracks.clear(); trackCache.clear(); }
    renderLib();
    try {
      lib.playlists = await fetchLibrary();
    } catch (e) {
      lib.error = '読み込みに失敗しました：' + (e && e.message ? e.message : e);
    }
    lib.loading = false;
    renderLib();
  }

  function renderAll() {
    renderControls(); renderTime(); renderMini(); renderNow(); renderQueue(); placeVideo();
  }
  function renderSleep() {
    if (S.sleepAt) {
      const left = Math.max(0, S.sleepAt - Date.now());
      const opt = now.sleep.options[now.sleep.selectedIndex];
      if (opt) opt.textContent = `⏾ 残り ${fmt(left / 1000)}`;
    } else {
      [...now.sleep.options].forEach((o) => {
        const base = { 0: '⏾ スリープ：オフ', 15: '⏾ 15分', 30: '⏾ 30分', 45: '⏾ 45分', 60: '⏾ 60分', 90: '⏾ 90分', end: '⏾ この曲の終わり' }[o.value];
        if (base) o.textContent = base;
      });
      if (!S.sleepEnd) now.sleep.value = '0';
    }
  }

  // ---- シート開閉/タブ ----
  function openSheet(t) {
    if (t) setTab(t, true);
    sheetOpen = true;
    sheet.classList.remove('closed');
    renderMini();
    if (tab === 'lib' && !lib.playlists) loadLibrary();
    setTimeout(placeVideo, 0);
    setTimeout(placeVideo, 300);
  }
  function closeSheet() {
    sheetOpen = false;
    S.miniClosed = false;
    touchMini();
    sheet.classList.add('closed');
    renderMini();
    placeVideo();
  }
  function setTab(t, silent) {
    tab = t;
    for (const k in pages) {
      pages[k].classList.toggle('hidden', k !== t);
      tabs[k].classList.toggle('on', k === t);
    }
    if (t === 'queue') { renderQueue(); scrollQueueToCurrent(); }
    if (t === 'lib') loadLibrary();
    if (t === 'now') renderNow();
    if (!silent) setTimeout(placeVideo, 0);
    else placeVideo();
  }
  function toggleVideo() {
    S.showVideo = !S.showVideo;
    if (S.showVideo && !iframe) toast('再生を開始すると動画が表示されます');
    save(); renderControls(); renderNow();
    setTimeout(placeVideo, 0);
    settingsChanged();
  }
  // 画質：YouTube埋め込みは画質指定のコマンドを無視し、プレーヤーの大きさで画質を決める。
  // そこでプレーヤーを指定画質の大きさで描画し、transform で縮めて表示する（480p未満には下げられない）
  const QUALITY_DIMS = { hd720: [1280, 720], hd1080: [1920, 1080], hd1440: [2560, 1440] };
  function setQuality(q) {
    S.quality = q;
    save();
    placeVideo();
    settingsChanged();
    toast(q === 'auto' ? '画質：自動（動画非表示中は480p前後）' : `画質：${q.replace('hd', '')}p（回線状況で下がることがあります）`);
  }
  const MAX_RENDER = 16384; // 描画サイズの上限（px）。これを超える分は UI の大きさが指定より大きくなる
  function setUiScale(v) {
    S.uiScale = clampScale(v);
    renderControls();
    placeVideo();
    save();
    settingsChanged();
  }
  function placeVideo() {
    const vis = sheetOpen && tab === 'now' && S.showVideo && iframe;
    const st = videoBox.style;
    const dims = QUALITY_DIMS[S.quality];
    const dpr = window.devicePixelRatio || 1;
    st.transformOrigin = '0 0';
    if (vis) {
      const r = now.art.getBoundingClientRect();
      st.left = r.left + 'px'; st.top = r.top + 'px';
      if ((dims || S.uiScale < 100) && r.width > 0 && r.height > 0) {
        // 大きく描いてから縮める：UI の大きさ（uiScale）と画質（dims）の大きい方に合わせる
        let k = Math.max(1, 100 / S.uiScale);
        if (dims) k = Math.max(k, dims[0] / dpr / r.width);
        k = Math.min(k, MAX_RENDER / r.width, MAX_RENDER / r.height); // 描画サイズの上限
        const w = r.width * k, hgt = r.height * k;
        st.width = w + 'px'; st.height = hgt + 'px';
        st.transform = `scale(${1 / k})`;
        st.borderRadius = (12 * k) + 'px';
      } else {
        st.width = r.width + 'px'; st.height = r.height + 'px';
        st.transform = 'none';
        st.borderRadius = '12px';
      }
      st.opacity = '1'; st.pointerEvents = 'auto';
    } else {
      // 画面内にほぼ1pxで残す（DOM移動するとiframeが再読み込みされるため）
      st.left = '0px'; st.top = (window.innerHeight - 1) + 'px';
      if (dims) {
        const w = dims[0] / dpr, hgt = dims[1] / dpr;
        st.width = w + 'px'; st.height = hgt + 'px';
        st.transform = `scale(${1 / w}, ${1 / hgt})`;
      } else {
        st.width = '1px'; st.height = '1px';
        st.transform = 'none';
      }
      st.borderRadius = '0';
      st.opacity = '0.01'; st.pointerEvents = 'none';
    }
  }
  window.addEventListener('resize', () => { placeVideo(); layoutMini(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen) closeSheet(); });

  // ミニプレーヤーの位置（モバイルは下部タブの上）
  function layoutMini() {
    if (!IS_MOBILE) return;
    let bottom = 0;
    const bar = document.querySelector('ytm-pivot-bar-renderer');
    if (bar) {
      const r = bar.getBoundingClientRect();
      if (r.height > 0 && r.top < window.innerHeight) bottom = Math.max(0, window.innerHeight - r.top);
    }
    mini.el.style.bottom = bottom + 'px';
  }
  setInterval(layoutMini, 1000);
  window.addEventListener('scroll', layoutMini, { passive: true });

  let toastT = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  // =========================================================
  // YouTube のナビにボタンを差し込む
  // =========================================================
  function navOpen(e) {
    e.preventDefault();
    e.stopPropagation();
    if (sheetOpen) closeSheet();
    else openSheet(cur() ? 'now' : 'lib');
  }
  function injectMobileNav() {
    const bar = document.querySelector('ytm-pivot-bar-renderer');
    if (!bar || bar.querySelector('.tt-pivot')) return;
    const btn = h('div', { class: 'tt-pivot' + (S.playing ? ' tt-active' : ''), role: 'button', 'aria-label': 'プレイヤー', onclick: navOpen },
      h('div', { class: 'tt-ic' }, icon('music', 24)), h('div', { class: 'tt-lb', text: 'プレイヤー' }));
    const items = [...bar.querySelectorAll(':scope > ytm-pivot-bar-item-renderer')];
    const shorts = items.find((el) => /ショート|Shorts/i.test(el.textContent)) || items[1];
    if (shorts) shorts.after(btn);
    else bar.append(btn);
  }
  function injectDesktopNav() {
    const items = document.querySelector('ytd-guide-renderer #sections > ytd-guide-section-renderer #items');
    if (items && !items.querySelector('.tt-guide')) {
      const entries = [...items.querySelectorAll(':scope > ytd-guide-entry-renderer')];
      const shorts = entries.find((el) => /ショート|Shorts/i.test(el.textContent)) || entries[1] || entries[0];
      const btn = h('div', { class: 'tt-guide', role: 'button', title: 'プレイヤー', onclick: navOpen },
        h('span', { class: 'tt-ic' }, icon('music', 24)), h('span', { text: 'プレイヤー' }));
      if (shorts) shorts.after(btn); else items.append(btn);
    }
    const mitems = document.querySelector('ytd-mini-guide-renderer #items');
    if (mitems && !mitems.querySelector('.tt-mini-guide')) {
      const entries = [...mitems.querySelectorAll(':scope > ytd-mini-guide-entry-renderer')];
      const shorts = entries.find((el) => /ショート|Shorts/i.test(el.textContent)) || entries[1] || entries[0];
      const btn = h('div', { class: 'tt-mini-guide', role: 'button', title: 'プレイヤー', onclick: navOpen },
        h('span', { class: 'tt-ic' }, icon('music', 24)), h('span', { text: 'プレイヤー' }));
      if (shorts) shorts.after(btn); else mitems.append(btn);
    }
  }
  const injectNav = IS_MOBILE ? injectMobileNav : injectDesktopNav;
  let navT = null;
  new MutationObserver(() => {
    if (navT) return;
    navT = setTimeout(() => { navT = null; injectNav(); if (!host.isConnected) document.documentElement.append(host); }, 300);
  }).observe(document.documentElement, { childList: true, subtree: true });

  // =========================================================
  // 起動
  // =========================================================
  (async () => {
    document.documentElement.append(host);
    await restore();
    S.miniClosed = true; // リロード直後はミニプレーヤーを出さない（再生するかプレイヤーを開くと表示）
    setTab('now', true);
    renderAll();
    renderSleep();
    injectNav();
    syncInit();
  })();
})();
