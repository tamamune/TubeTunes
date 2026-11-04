// TubeTunes: Google Drive 同期（バックグラウンド）
// 保存先: マイドライブ直下の TubeTunes-sync.json（drive.file 権限＝この拡張が作ったファイルだけ触れる）
// 認証:
//   デスクトップ … chrome.identity.launchWebAuthFlow（1時間ごとの取り直しも裏で自動）
//   モバイル     … タブでGoogleにログイン → リダイレクト先URL(#access_token=…)をここで受け取ってタブを閉じる
//                  （Android版Vivaldiでは identity API が使えるとは限らないため）

const FILE = 'TubeTunes-sync.json';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
// TubeFolio と同じ OAuthクライアントID（同じGoogle Cloudプロジェクト）。設定画面で変更も可
const BUILTIN_CLIENT_ID = '553603750505-7g02mobn8i1f8sjh3l713bvdvbktrtn5.apps.googleusercontent.com';
const REDIRECT = (chrome.identity && chrome.identity.getRedirectURL)
  ? chrome.identity.getRedirectURL()
  : `https://${chrome.runtime.id}.chromiumapp.org/`;

const tokStore = chrome.storage.session || chrome.storage.local;

async function getSync() {
  const { ttSync = {} } = await chrome.storage.local.get('ttSync');
  return { ...ttSync, clientId: ttSync.clientId || BUILTIN_CLIENT_ID };
}
async function setSync(patch) {
  const { ttSync = {} } = await chrome.storage.local.get('ttSync');
  const s = { ...ttSync, ...patch };
  await chrome.storage.local.set({ ttSync: s });
  return { ...s, clientId: s.clientId || BUILTIN_CLIENT_ID };
}
async function saveToken(hash) {
  const h = new URLSearchParams(hash);
  const value = h.get('access_token');
  if (!value) throw new Error('認証に失敗しました：' + (h.get('error') || '不明なエラー'));
  await tokStore.set({ ttTok: { value, exp: Date.now() + (+h.get('expires_in') || 3600) * 1000 } });
  return value;
}
async function cachedToken() {
  const { ttTok } = await tokStore.get('ttTok');
  return ttTok && ttTok.exp > Date.now() + 60e3 ? ttTok.value : null;
}
function authUrl(s, interactive) {
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: s.clientId,
    response_type: 'token',
    redirect_uri: REDIRECT,
    scope: SCOPE,
    state: 'tubetunes',
    ...(s.email ? { login_hint: s.email } : {}),
    ...(interactive ? (s.email ? {} : { prompt: 'select_account' }) : { prompt: 'none' }),
  });
}

// ---------- モバイル用：タブでの認証 ----------
// リダイレクト先（chromiumapp.org）への移動をここで捕まえる。サービスワーカーが止まっても拾えるよう最上位で登録
let lastHandled = '';
async function catchRedirect(tabId, url) {
  if (!url || !url.startsWith(REDIRECT) || url === lastHandled) return;
  lastHandled = url;
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : new URL(url).search.slice(1);
  try { chrome.tabs.remove(tabId); } catch { /* noop */ }
  try {
    const t = await saveToken(hash);
    const email = await fetchEmail(t);
    await setSync({ connected: true, needReauth: false, pendingAuth: false, lastError: '', ...(email ? { email } : {}), auto: (await getSync()).autoUserOff ? false : true });
  } catch (e) {
    await setSync({ pendingAuth: false, lastError: e.message });
  }
}
if (chrome.webNavigation && chrome.webNavigation.onBeforeNavigate) {
  chrome.webNavigation.onBeforeNavigate.addListener((d) => catchRedirect(d.tabId, d.url), { url: [{ urlPrefix: REDIRECT }] });
}
chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.url) catchRedirect(tabId, info.url); });

// ---------- トークン ----------
async function token(interactive, mobile) {
  const s = await getSync();
  const c = await cachedToken();
  if (c) return c;
  if (mobile || !(chrome.identity && chrome.identity.launchWebAuthFlow)) {
    if (interactive) {
      await setSync({ pendingAuth: true, lastError: '' });
      await chrome.tabs.create({ url: authUrl(s, true) });
      const e = new Error('ブラウザのタブでGoogleにログインしてください');
      e.pending = true;
      throw e;
    }
    await setSync({ needReauth: true });
    throw new Error('再接続が必要です（「Google Drive に接続」を押してください）');
  }
  let res;
  try {
    res = await chrome.identity.launchWebAuthFlow({
      url: authUrl(s, interactive), interactive,
      ...(interactive ? {} : { abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: 15000 }),
    });
  } catch {
    if (!interactive) await setSync({ needReauth: true });
    throw new Error(interactive ? '認証がキャンセルされたか失敗しました' : '再接続が必要です（「Google Drive に接続」を押してください）');
  }
  const t = await saveToken(new URL(res).hash.slice(1));
  if (s.needReauth) await setSync({ needReauth: false });
  return t;
}
async function fetchEmail(t) {
  try {
    const r = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: 'Bearer ' + t } });
    return (await r.json())?.user?.emailAddress || '';
  } catch { return ''; }
}
async function api(path, opt, interactive, mobile) {
  for (let i = 0; i < 2; i++) {
    const t = await token(interactive, mobile);
    const r = await fetch('https://www.googleapis.com' + path, { ...(opt || {}), headers: { ...((opt && opt.headers) || {}), Authorization: 'Bearer ' + t } });
    if (r.status === 401 && i === 0) { await tokStore.remove('ttTok'); continue; }
    if (!r.ok) throw new Error(`Google Drive エラー (${r.status})`);
    return r;
  }
  throw new Error('Google Drive の認証に失敗しました');
}

// ---------- ファイル ----------
async function findFile(interactive, mobile) {
  const q = encodeURIComponent(`name='${FILE}' and trashed=false`);
  const r = await api(`/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&spaces=drive`, {}, interactive, mobile);
  return (await r.json()).files?.[0] || null;
}
async function upload(data, interactive, mobile) {
  const body = JSON.stringify(data);
  const f = await findFile(interactive, mobile);
  if (f) {
    await api(`/upload/drive/v3/files/${f.id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }, interactive, mobile);
  } else {
    const b = 'ttb' + Date.now();
    const mp = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: FILE, mimeType: 'application/json' })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
    await api('/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body: mp }, interactive, mobile);
  }
}
async function download(interactive, mobile) {
  const f = await findFile(interactive, mobile);
  if (!f) return null;
  const r = await api(`/drive/v3/files/${f.id}?alt=media`, {}, interactive, mobile);
  return r.json();
}

// ---------- メッセージ ----------
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== 'tt-drive') return;
  const mobile = !!msg.mobile;
  const interactive = !!msg.interactive;
  (async () => {
    switch (msg.op) {
      case 'status': {
        const s = await getSync();
        return { ...s, hasToken: !!(await cachedToken()), redirect: REDIRECT, builtin: s.clientId === BUILTIN_CLIENT_ID };
      }
      case 'setOpt': return setSync(msg.patch || {});
      case 'connect': {
        await tokStore.remove('ttTok');
        let t;
        try { t = await token(true, mobile); }
        catch (e) { if (e.pending) return { pending: true }; throw e; }
        const email = await fetchEmail(t);
        const cur = await getSync();
        await setSync({ connected: true, needReauth: false, lastError: '', ...(email ? { email } : {}), auto: cur.autoUserOff ? false : true });
        return { connected: true };
      }
      case 'disconnect': {
        const { ttTok } = await tokStore.get('ttTok');
        if (ttTok && ttTok.value) fetch('https://oauth2.googleapis.com/revoke?token=' + ttTok.value, { method: 'POST' }).catch(() => {});
        await tokStore.remove('ttTok');
        return setSync({ connected: false, auto: false, needReauth: false, pendingAuth: false });
      }
      case 'push': {
        await upload(msg.data, interactive, mobile);
        return setSync({ lastPush: Date.now(), lastError: '' });
      }
      case 'pull': {
        const data = await download(interactive, mobile);
        await setSync({ lastPull: Date.now(), lastError: '' });
        return { data };
      }
    }
    return {};
  })().then((r) => reply({ ok: true, ...(r || {}) }), async (e) => {
    try { await setSync({ lastError: e.message }); } catch { /* noop */ }
    reply({ ok: false, error: e.message, pending: !!e.pending });
  });
  return true;
});
