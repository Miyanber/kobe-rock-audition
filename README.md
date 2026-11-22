# kobe-rock-audition

軽音サークル向けオーディション採点・集計・バンドエントリー管理Webアプリケーション。  
採点入力から自バンド自動除外（複数掛け持ち対応）、全体講評、Min-Max正規化（既定定数 `100`）／Zスコア正規化／単純平均方式の集計、非破壊ペナルティ減点、提出状況モニタリング、2種類のExcel/CSVエクスポートまでを一元化します。

詳細は [プロダクト要件定義書 (docs/PRD.md)](./docs/PRD.md) および [非エンジニア向け運営マニュアル (docs/OPERATIONS.md)](./docs/OPERATIONS.md) を参照してください。

---

## 技術スタック

- **フロントエンド**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons
- **バックエンド / API**: Hono（`/api/*`、Hono RPC 型共有、Zod バリデーション）
- **認証**: Google OAuth 2.0（`@hono/oauth-providers/google` + 学内ドメイン制限 + 学籍番号 HMAC-SHA256 ハッシュ照合 + HTTPOnly JWT Cookie）＆ ローカル開発用ダミーログイン
- **データベース / ORM**: Cloudflare D1 (SQLite) / Drizzle ORM（ローカル開発時は `better-sqlite3` を自動使用）
- **Excel / CSV 入出力**: SheetJS (`xlsx`)（結果エクスポートおよび大学提出用部員名簿のクライアント側読み込み）
- **ホスティング**: Cloudflare Workers（Workers Static Assets による単一デプロイ）

---

## ディレクトリ構成

```text
├── docs/
│   ├── PRD.md                   # プロダクト要件定義書
│   └── OPERATIONS.md            # 非エンジニア向け運営・トラブル対応マニュアル
├── drizzle/                     # Cloudflare D1 マイグレーション SQL
├── src/
│   ├── shared/
│   │   ├── aggregation.ts       # Min-Max正規化・Zスコア・単純平均・技術魅力按分・順位算出エンジン
│   │   ├── audition-status.ts   # 4段階進行ステータス定義・ラベル
│   │   ├── deadline.ts          # JST基準の締切判定・残り時間表示ユーティリティ
│   │   ├── grade.ts             # 入部年度からの動的回生算出・現役(1〜3回生)判定ロジック
│   │   ├── name.ts              # 氏名正規化・バリデーション
│   │   └── schema/index.ts      # フロント・バック共通 Zod スキーマ
│   ├── server/
│   │   ├── app.ts               # Hono アプリ本体 & AppType エクスポート
│   │   ├── dev-entry.ts         # Vite ローカル開発用エントリポイント
│   │   ├── db/
│   │   │   ├── schema.ts        # Drizzle ORM テーブル定義 (6テーブル)
│   │   │   ├── local.ts         # ローカル SQLite アダプタ (自動テーブル作成)
│   │   │   ├── seed.ts          # 初期デモデータシード
│   │   │   └── seed-data.ts     # テストデータ定義（架空部員＋採点分布データ）
│   │   ├── lib/
│   │   │   ├── audition-loader.ts
│   │   │   ├── csv.ts           # CSV/TSV パーサー
│   │   │   ├── export.ts        # 2ファイルExcel/CSV生成ロジック
│   │   │   ├── session.ts       # JWT Cookie & Google OIDC 検証
│   │   │   └── student-id.ts    # 学籍番号正規化・HMAC-SHA256ハッシュ化・入部年度推定
│   │   ├── middleware/auth.ts   # 最新DBロール参照・RBACミドルウェア
│   │   └── routes/              # auth.ts / auditions.ts / admin.ts
│   ├── client/                  # React SPA（/auditions/:id/* ルーティング対応）
│   └── worker.ts                # Cloudflare Workers エントリポイント
├── wrangler.jsonc               # Cloudflare Workers + D1 + Assets 設定
└── vite.config.ts
```

---

## ローカル開発の起動方法

### 1. 依存パッケージのインストール
```bash
npm install
```

### 2. 環境変数ファイルの作成（任意）
ローカル開発では `.dev.vars` が未設定でもダミーログイン（`ENABLE_DEV_LOGIN=true`）とローカル SQLite（`.local-dev.sqlite`）＋初期シードデータで即座に起動・検証できます。Google OAuth をローカルで試す場合は `.dev.vars.example` をコピーしてください。
```bash
cp .dev.vars.example .dev.vars
```

### 3. 開発サーバーの起動
```bash
npm run dev
```
ブラウザで `http://localhost:5173` を開くと、ログイン画面の「ローカル開発・検証用ダミーログイン」から管理者（`ADMIN`）・掛け持ち部員・一般部員・コメントのみ部員等をワンクリックで切り替えて全機能を試せます。

### 4. テストデータの共有・リセット（別PCでの再現手順）
ローカル開発用のテストデータは [src/server/db/seed-data.ts](./src/server/db/seed-data.ts) としてリポジトリに含まれています。
- **プライバシー・セキュリティ**: 部員名・学籍番号はすべて架空のダミーデータ（1〜3回生）で構成されており、**実名や個人のメールアドレスは含まれていません**（採点分布のみ実測モデルを使用）。
- **別PCでの利用方法**: 他の PC で `git clone`（または `git pull`）後に `npm install` → `npm run dev` を実行すると、`.local-dev.sqlite` が自動生成され同じテストデータが即座に投入されます（`.local-dev.sqlite` 本体は `.gitignore` 対象です）。
- **テストデータの再生成**: すでに古い `.local-dev.sqlite` がある環境で最新のテストデータへ入れ替える場合は、`.local-dev.sqlite` を削除して `npm run dev` を再起動してください。

### 5. テスト・型チェック・ビルド
```bash
npm test       # Vitest（集計・締切・回生・ルーティング単体テスト＋API/RBAC/Excel結合テスト）
npm run build  # Vite 本番ビルド + TypeScript 型チェック
```

---

## 環境変数一覧（Cloudflare Workers / `.dev.vars`）

| 変数名 | 必須 | 説明 |
| :--- | :---: | :--- |
| `GOOGLE_CLIENT_ID` | 本番必須 | Google Cloud Console の OAuth 2.0 クライアント ID |
| `GOOGLE_CLIENT_SECRET` | 本番必須 | Google Cloud Console の OAuth 2.0 クライアントシークレット |
| `SESSION_SECRET` | 本番必須 | セッション Cookie (JWT) 署名用のランダム文字列（32文字以上推奨） |
| `STUDENT_ID_HASH_SECRET` | 本番必須 | 学籍番号の HMAC-SHA256 ハッシュ化用シークレット（32文字以上推奨） |
| `ALLOWED_GOOGLE_DOMAIN` | 推奨 | 許可する学内ドメイン（カンマ区切り可。例: `stu.kobe-u.ac.jp`） |
| `INITIAL_ADMIN_EMAILS` | 推奨 | 初回ログイン時に自動で `ADMIN` ロールにするメールアドレス（カンマ区切り） |
| `ALLOW_UNREGISTERED_DOMAIN_USERS` | 任意 | `false`（既定）: 事前登録された部員（ハッシュ一致）のみ許可 / `true`: 学内ドメインなら自動作成 |
| `ENABLE_DEV_LOGIN` | 任意 | 本番デプロイ時は必ず `"false"` に設定すること（開発用ダミーログインの有効/無効） |

Google Cloud Console 側の「承認済みリダイレクト URI」には以下を登録してください：
- ローカル開発：`http://localhost:5173/api/auth/google/callback`
- 本番：`https://<your-worker-domain>/api/auth/google/callback`

---

## Cloudflare Workers & D1 へのデプロイ手順

1. **D1 データベースを作成**
   ```bash
   npx wrangler d1 create kobe-rock-audition-db
   ```
   出力された `database_id` を `wrangler.jsonc` の `d1_databases[0].database_id` に設定します。

2. **D1 マイグレーションを適用**
   ```bash
   npm run db:migrate:remote
   ```

3. **本番用シークレットを登録**
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put STUDENT_ID_HASH_SECRET
   ```
   ※ 本番デプロイ前に `wrangler.jsonc`（または Workers の環境変数設定）で `ENABLE_DEV_LOGIN` が `"false"` になっていることを確認してください。

4. **ビルド＆デプロイ**
   ```bash
   npm run deploy
   ```

---

## 集計およびエクスポート仕様

- **Min-Max正規化（標準・既定定数 `100`）**: 審査員ごとに有効投票（自バンド・`COMMENT_ONLY`・`NULL` を除外）の最高点（`MAX`）・最低点（`MIN`）・点差（`Diff = MAX - MIN`）を求め、`(素点合計 - MIN) × (standardDiff / Diff)` で正規化（`Diff = 0` または有効採点1件以下時は補正係数 `1.0`）。定数 `standardDiff` は既定 `100` で、管理画面の「詳細設定」から `1`〜`100` で変更可能。
- **Zスコア正規化（偏差値方式）**: $T = 50 + 10 \times \frac{x - \mu}{\sigma}$（$\sigma = 0$ 時は `50`）。
- **単純平均方式**: 素点合計（技術点＋魅力点）をそのまま平均。
- **正規化後の技術点・魅力点按分**: 素点割合（`tech / rawTotal`, `charm / rawTotal`、素点合計0時は均等割）をもとに合計点の正規化後点数から算出。
- **ペナルティ非破壊減点**: ペナルティ有効時のみ、正規化計算後の最終スコアからバンドごとの減点値を差し引く。
- **2ファイル構成のExcel/CSV出力**:
  1. **集計結果＆全採点データ＆全体講評ブック**: ①「総合ランキング集計」シート ＋ ②「全採点データ_補正過程」シート ＋ ③「全体講評」シート（Excel 3シート構成）
  2. **バンド別講評シート**: 出演バンドごとに1シート作成し、正規化後点数（魅力・技術・合計）とコメントを掲載 ＋ 末尾に「全体講評」シート
