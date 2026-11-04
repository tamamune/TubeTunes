# TubeTunes — Claude Code 向けメモ

YouTube のライブラリ・再生リストを音楽プレーヤーとして再生する拡張機能（Manifest V3）。
主な利用環境は **Android 版 Vivaldi（m.youtube.com）**。デスクトップ（www.youtube.com、Chrome / Vivaldi）にも対応。
利用者向けの説明は README.md。ここには開発の前提・経緯・注意点をまとめる。

## 進め方のルール
- 返答・コメント・UI の文言は日本語
- GitHub へのコミット・push は頼まれたときだけ
- 渡す zip の名前はバージョンを付けず `TubeTunes.zip`（中身は `TubeTunes/` フォルダ）
- 変更したら `manifest.json` の `version` を上げる。main に push すると Actions が `v<version>` の Release を自動作成（同じ版が既にあればスキップ）
- ビルド手順はない（素の JS）。確認は `node --check *.js`

## ファイル構成
| ファイル | 役割 |
|---|---|
| `manifest.json` | MV3。`key` で拡張機能IDを `foogjnjpclbidngnjhbbidfclkpoilhj` に固定（Drive のリダイレクトURIがIDに依存するため。**消さない**） |
| `bridge.js` | MAIN world。`window.ytcfg`（APIキー・INNERTUBE_CONTEXT など）を postMessage でコンテンツスクリプトへ渡す |
| `content.js` | 本体（約1500行の IIFE）。状態 `S`、youtubei API、埋め込みプレーヤー操作、UI（Shadow DOM）、ライブラリ、Drive 同期の画面側 |
| `ads.js` | 埋め込み（youtube.com/embed/*）の全フレームで動く。広告中は16倍速・ミュート＋スキップ押下。設定は `tubetunes_state_v1.adFast` を読む |
| `relay.js` | デスクトップ用の中継フレーム。`m.youtube.com/robots.txt?tubetunes=1#v=…&po=…` で動き、中に youtube.com/embed を置いて postMessage を転送 |
| `background.js` | Service Worker。Google Drive の OAuth・保存・読み込み |
| `nav.css` | YouTube 本体のナビに差し込むボタンの CSS（Shadow DOM の外） |
| `.github/workflows/release.yml` | main への push で Release を作成し `TubeTunes.zip` を添付 |

`content.js` の主なまとまり（上から順）：DOM ヘルパー（`innerHTML` は使わない＝Trusted Types 対策）→ 状態 `S` と保存/復元 → youtubei API（`innertube()`、SAPISIDHASH 認証）→ 再生リスト/曲の解析 → 埋め込みプレーヤー → 再生操作 → CSS → ミニプレーヤー/シート/各ページ → Drive 同期 UI → ライブラリ描画 → ナビへのボタン差し込み → 起動。

## 分かっている YouTube 側の制約（実測済み）
- **www.youtube.com の上に置いた埋め込みは再生を拒否される（エラー152）**。m.youtube.com や他サイトの上なら再生できる → デスクトップは `relay.js` 経由
- **画質指定は効かない**：`setPlaybackQuality`、URL の `vq=` はどちらも無視される。画質はプレーヤーの描画サイズで決まる
  - 1px でも 480p（large）が下限。1280×720 で hd720、1920×1080（DPR1.25）で hd1440
  - そのため指定画質の大きさで描画し、`transform: scale()` で縮めて表示（`placeVideo()` / `QUALITY_DIMS`）。480p 未満は不可
- **曲送りは埋め込みの再生リスト機能に任せる**：`loadPlaylist(ids, index, start)`（最大 `WIN=200` 曲ずつ）。曲ごとに `loadVideoById` するとバックグラウンドで止まりやすいため。プレーヤーが進んだら `infoDelivery.playlistIndex` で `S.pos` を合わせる（`onTrackAdvanced`）
- **モバイル(MWEB)の youtubei 応答には再生リストの作成者情報がない** → モバイルでも `clientName: 'WEB'`（`X-Youtube-Client-Name: 1`、バージョンは MWEB のものを流用）で問い合わせる。m.youtube.com の `/youtubei/v1/browse` で WEB 形式の応答が返ることを確認済み
- 自分の再生リストかどうか：`isOwnPlaylist()`。「公開/非公開/限定公開」の表示があれば自分のもの、なければ作成者チャンネルIDと `account/account_menu` で取った自分のIDを比較。`OLAK5uy_`（アルバム）は保存扱い
- ライブラリの取得元：`FEplaylist_aggregation` → `FElibrary` → `FEyou` の順に全部読む。`WL`・`LL`・`RD…`（ミックス）は除外

## 保存データ（chrome.storage.local）
- `tubetunes_state_v1`：キュー・再生位置・シャッフル/リピート・音量・画質・ミニ自動非表示・動画表示
- `tubetunes_folders_v1`：フォルダ（saved / own / hidden）の開閉
- `tubetunes_hidden_v1`：非表示にした再生リストのID
- `tubetunes_sync_meta_v1`：`savedAt`（この端末で設定を変えた時刻）/ `syncedAt`（Drive と揃えた時の savedAt）
- `ttSync`（background）：接続状態・email・自動同期・クライアントID・エラー。トークンは `chrome.storage.session` の `ttTok`

## Google Drive 同期
- 保存先：マイドライブ直下 `TubeTunes-sync.json`、スコープ `drive.file`
- OAuth クライアントIDは TubeFolio（同じ作者の別拡張）と同じ `553603750505-7g02…`（ウェブアプリケーション型）
- リダイレクトURI `https://foogjnjpclbidngnjhbbidfclkpoilhj.chromiumapp.org/` を Google Cloud の「承認済みのリダイレクトURI」に登録する必要あり（未登録だと `redirect_uri_mismatch`）
- デスクトップ：`chrome.identity.launchWebAuthFlow`（非対話の取り直しは `prompt=none` + `login_hint`）
- モバイル：Android 版 Vivaldi で identity API が使える保証がないため、`chrome.tabs.create` で認証タブを開き、`webNavigation.onBeforeNavigate`（予備に `tabs.onUpdated`）でリダイレクトURLを捕まえて `#access_token` を保存しタブを閉じる。トークンは約1時間で切れ、裏では取り直せない（「再接続」ボタン）
- 同期の対象は設定類のみ（キュー・再生位置は端末ごと）。設定を変える関数は最後に `settingsChanged()` を呼ぶ（5秒後に自動保存）

## 経緯（主な要望と対応）
1. v1.0 初版：下部タブ（モバイル）/ ガイド（デスクトップ）にプレイヤーボタン、ライブラリ・キュー・基本操作・スリープタイマー
2. v1.1：デスクトップで曲が飛ぶ → エラー152 と判明し relay 方式に。バックグラウンドで止まる → loadPlaylist 方式に。ミニプレーヤーに ×。保存した再生リストを分離
3. v1.2〜1.3：ライブラリを「ライブラリ（保存）」「再生リスト（自作）」のフォルダ＋サムネ一覧に。フォルダ開閉
4. v1.4：画質選択、デスクトップのミニプレーヤー自動非表示（時間は設定）、モバイルの振り分け修正（WEB クライアント化）、「非表示」フォルダ
5. v1.5：リロード直後はミニプレーヤーを出さない、Google Drive 同期、拡張IDの固定

6. v1.6：動画内UIの大きさ（`S.uiScale` 0.01〜100%、`placeVideo()` で画質と合わせて大きく描いて縮める）、広告の16倍速、ツール類を「⚙ 設定」に集約

## 未確認・宿題
- v1.6 の変更（UI縮小・広告早送り・設定の再配置）も実機未確認。広告は埋め込み内で `ad-showing` が付くかの確認が必要
- v1.4 以降の変更は構文チェックのみで、ログインした実機ではまだ動かしていない（特に：Drive 接続、モバイルのタブ認証、画質の transform 表示、非表示フォルダ）
- Drive 接続は利用者側で `redirect_uri_mismatch` が出た段階。リダイレクトURIの登録待ち
- Android 版 Vivaldi のバックグラウンド再生：Vivaldi の「バックグラウンドでの音声再生を許可」と Android の電池「制限なし」が前提。Vivaldi 側にも再生リストが途中で止まる報告がある（forum.vivaldi.net/post/917575）。拡張だけでは完全には直せない
- Vivaldi Android の拡張対応は 8.2（2026年9月）から。`webNavigation` / `identity` / `offscreen` がどこまで動くかは未確認

## 動作確認のしかた
- デスクトップ：`chrome://extensions` →「パッケージ化されていない拡張機能を読み込む」でこのフォルダ。変更後は拡張機能の再読み込み＋YouTube のタブを再読み込み
- 埋め込みの挙動はログイン不要で試せる（例：m.youtube.com のコンソールで `https://www.youtube.com/embed/<id>?enablejsapi=1` の iframe を作り、`{"event":"listening"}` を postMessage して `infoDelivery` を見る）
- ライブラリ取得はログインが必要
