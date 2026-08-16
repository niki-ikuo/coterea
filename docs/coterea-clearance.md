# Coterea 空き確認（ノックアウト調査）

調査日: 2026-08-16  
対象: Coterea / COTEREA / coterea、類似表記（Coteria、Coterie、Cotera、Coterea AI）、称呼「コテリア」

**これは法的意見ではない。** 出願可否・侵害リスクの断定は弁理士・弁護士のクリアランスに委ねる。公式の J-PlatPat / USPTO Trademark Search / EUIPO eSearch はボット制限があり、本調査は公開ミラー・RDAP・DNS・レジストリ API・TTABVUE・Web 公開情報によるノックアウト（明らかな衝突の洗い出し）である。未公開出願・州商標・コモン・ロー使用は完全には拾えない。

想定区分（ソフトウェア製品）: **第9類**（ダウンロード可能なソフト） / **第42類**（SaaS・開発）

---

## 結論（実務向け）

| 観点 | 今回の所見 |
|------|------------|
| **Coterea 完全一致の登録** | 日・米・EU の公開情報では、**文字商標 COTEREA のヒットは見つからなかった** |
| **使う上での最大リスク** | 綴り・発音が近い **COTERIE（コテリエ）** と、称呼が近い **KOTOLIA（コトリア）**。加えて商号・ドメインで動いている **Cotera**（AI エージェント、cotera.co） |
| **ドメイン coterea.*** | `.com` `.net` `.org` `.ai` `.app` `.dev` は RDAP 404（未登録の強い兆候）。DNS も未設定。**先に確保するのがよい** |
| **パッケージ** | npm `coterea`、PyPI、crates.io、Docker Hub は未使用。**`coterie`（npm）と `@cotera/*` は使用中** |
| **SNS** | X / LinkedIn Company / YouTube は 404。Instagram 等はログイン壁のため断定不可 |

**安全とは言えない。** 完全一致は空に見えるが、類似（COTERIE / COTERA / コトリア）が本命の障害候補。公開・出願前に公式DBでの再検索と専門家レビューが必要。

---

## 1. 日本（J-PlatPat 相当）

出典: 特許庁公報を集計した [ブランドテラス / patent-i.com](https://patent-i.com/tm/)（更新表示 2026-08-01）、法人公開情報。

### 1.1 完全一致

| 検索語 | 結果 |
|--------|------|
| 文字 COTEREA / Coterea | 公開ミラー・Web で **該当なし** |
| 称呼「コテリア」 | 当該称呼の専用ページは見つからず（「コテリエ」「コトリア」は別ページあり） |

J-PlatPat 本体の画面操作結果ではない。公開前に公式で「商標（検索用）= COTEREA」「称呼（類似）= コテリア」を再実行すること。

### 1.2 類似として残るもの

**COTERIE（称呼: コテリエ / コーテリー 等）** — 文字は1字違い、称呼はコテリアと近い。

| 登録 | 権利者 | 区分 | 備考 |
|------|--------|------|------|
| 6874503（2024 登録） | コーテリー・ベビー・インコーポレーテッド | **42** | ソフトウェア役務と重なりうる |
| 6802560（2024 登録） | コーテリー・ベイビー・インコーポレイテッド | **5, 9, 11, 21, 42, 45** | **第9・42類を含む** |
| 6747207, 6429117 | 同上 | 3, 5 | ベビー用品中心 |
| 5188430, 5072635, 4549932 | 有限会社リガーズ | 14, 18, 25, 35 | 服飾・小売など |

指定商品の中心はおむつ・化粧品など。ただし **第9類・第42類の指定がある以上、ソフトウェアでの類似判断は専門家確認が必要**。

**KOTOLIA（称呼: コトリア）** — 三菱電機。コテリアと1音差。

| 登録 | 区分 |
|------|------|
| 6728320, 6676769 | **7, 9, 11, 35, 37, 42** |

**商号:** 株式会社コトレア（東京都港区、法人番号 3010401162006）。読みはコトレアで Coterea とは綴り・称呼が異なるが、口頭では紛れうる。

---

## 2. 米国（USPTO）

出典: [TTABVUE](https://ttabvue.uspto.gov/)、公開商標レコード、企業サイト。USPTO 新 Trademark Search（tmsearch.uspto.gov）は API 非公開のため画面の全件検索は未実施。

### 2.1 COTEREA

公開 Web・TTAB 検索で **COTEREA のシリアル／登録は見つからなかった**。

### 2.2 類似

**COTERA**（1字短い）

- 出願 Serial **85853544**（Cotera, Inc.）: **放棄**（当事者系審理後）。CUTERA（Reg. 2911807）が異議。
- 現在の **Cotera** は [cotera.co](https://cotera.co/) の企業向け AI エージェント基盤（YC）。連邦登録の有無は今回未確認だが、**使用に基づくコモン・ローとドメイン衝突**は残る。

**COTERIE**（多数・生存あり）

- Coterie Baby, Inc.: おむつ等で登録（例: S 87983018 / R 6075539）。ソフト関連の一部出願（例: S 97417644 Class 42）は **Abandoned – No Statement of Use** との公開情報あり。
- Coterie Insurance ほか、保険・ブティック等の COTERIE も存在。
- ソフト Class 9/42 の生存登録は、今回拾った範囲ではベビー／保険系の放棄例が多く、**「ソフトで COTERIE が空」とは言えない**（生存件の全件突合が未了）。

**CUTERA:** 医療機器等。COTERA 出願を潰した先例あり。Coterea との距離は COTERA より大きいが、審査・異議の参考になる。

---

## 3. 欧州（EUIPO / TMview）

出典: EUIPO eSearch 案内、TMview、公開 EUTM レコード。TMview REST は空応答。eSearch 画面の全件検索は未実施。

| 標章 | 今回の所見 |
|------|------------|
| COTEREA | EUTM としての公開ヒット **なし** |
| COTTONERA | EUTM 010962017（繊維関連、Registered）— 綴りは遠い |
| ETERREA | EUTM 019319363（宿泊等、Registered）— 語尾 REA のみ共通 |
| COTERIE | 米国・日本と同様、欧州でも先行の可能性。**TMview の fuzzy 検索が未了** |

EU 加盟国の国内商標は TMview 横断が本筋。今回は未了。

---

## 4. ドメイン

方法: DNS（Resolve-DnsName）、RDAP（Verisign / Identity Digital / Google pubapi / rdap.org）。RDAP **404 = ゾーンにレコードなし（未登録の強い兆候）**。プレミアム予約やレジストラ在庫は別途購入画面で確認すること。

| ドメイン | DNS | RDAP | 所見 |
|----------|-----|------|------|
| coterea.com | なし | 404 | 取得候補 |
| coterea.net | なし | 404 | 取得候補 |
| coterea.org | なし | 404 | 取得候補 |
| coterea.ai | なし | 404 | 取得候補 |
| coterea.app | なし | 404 | 取得候補 |
| coterea.dev | なし | 404 | 取得候補 |
| coterea.jp | なし | JPRS ページ 404 | 未登録の可能性。JPRS で再確認 |
| coterea.io / .co | なし | RDAP ホスト不通 | DNS なし。購入画面で確認 |
| **coterie.com** | あり | — | **使用中** |
| **cotera.com** | あり | — | **使用中** |
| **cotera.co / cotera.ai** | あり | — | **Cotera（AI）側** |

推奨: `coterea.com` と `coterea.ai`（または `.app`）を先に押さえる。`cotera.*` は取れない前提でブランドを Coterea に固定する。

---

## 5. SNS

HTTP ステータスはログイン壁で偽陽性になりやすい。404 のみ「空き寄り」。

| サービス | 結果 | 解釈 |
|----------|------|------|
| X (x.com/coterea, twitter.com/coterea) | 404 | ハンドル空きの可能性が高い |
| LinkedIn /company/coterea | 404 | ページ未作成の可能性 |
| YouTube @coterea | 404 | ハンドル空きの可能性 |
| Hugging Face /coterea | 404 | 空きの可能性 |
| Instagram /coterea | 200（ログイン画面） | **不明**。アプリで直接確認 |
| Facebook /coterea | 200（タイトル Facebook のみ） | **不明** |
| TikTok @coterea | 200（汎用タイトル） | **不明** |
| Reddit user / r/coterea | 200（汎用タイトル） | **不明** |
| Discord invite/coterea | 200 | 招待の有無は不明 |
| Threads @coterea | 200 | **不明** |

---

## 6. パッケージ・開発者アカウント

| レジストリ | coterea | 類似 |
|------------|---------|------|
| npm | **未登録**（404） | `coterie` **0.6.0**（ターミナル上のマルチエージェント）。スコープ `@cotera/*` は cotera.co が使用 |
| PyPI | パッケージ JSON 404 | — |
| crates.io | 検索ヒット 0 | — |
| Docker Hub | 検索 0 / library 404 | — |
| Snap | 404 | — |
| GitHub user / org `coterea` | API 上存在せず。リポジトリ名の部分一致は `coteready` 等のみ | org `cotera` は要別確認 |

npm は `coterea` を早めに予約してよい。`coterie` とは別パッケージ名。

---

## 7. 残作業（公式・専門家）

1. [J-PlatPat 商標検索](https://www.j-platpat.inpit.go.jp/) — 商標 COTEREA、称呼 コテリア、類似群は第9・42類
2. [USPTO Trademark Search](https://tmsearch.uspto.gov/) — COTEREA / COTERIA / COTERA / COTERIE、Class 9・42、Live
3. [EUIPO eSearch](https://euipo.europa.eu/eSearch/) と [TMview](https://www.tmdn.org/tmview/welcome) — 同一＋ fuzzy、加盟国国内標も含む
4. ドメインレジストラで coterea.com / .ai / .app / .jp の在庫・価格
5. Instagram / TikTok / Facebook をログインしてハンドル確認
6. 弁理士による類似判断（特に COTERIE 第9・42類、KOTOLIA、Cotera の使用）

---

## 出典（主要）

- https://patent-i.com/tm/mark/0009194/ （COTERIE 日本）
- https://patent-i.com/tm/pron/0102264/ （コトリア / KOTOLIA）
- https://ttabvue.uspto.gov/ （COTERA 85853544、COTERIE 当事者）
- https://cotera.co/
- RDAP: rdap.verisign.com、rdap.identitydigital.services、pubapi.registry.google、rdap.org
- npm registry / crates.io / PyPI / Docker Hub API
