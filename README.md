# kobe-rock-audition

軽音サークル向けオーディション採点・集計・バンドエントリー管理Webアプリケーション。  
採点入力から自バンド自動除外（複数掛け持ち対応）、点差補正（定数 `10`）／Zスコア（偏差値）集計、非破壊ペナルティ減点、2種類のExcel/CSVエクスポートまでを一元化します。

詳細は [プロダクト要件定義書 (docs/PRD.md)](./docs/PRD.md) および [非エンジニア向け運営マニュアル (docs/OPERATIONS.md)](./docs/OPERATIONS.md) を参照してください。

---

## 技術スタック

- **フロントエンド**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons
- **バックエンド / API**: Hono（`/api/*`、Hono RPC 型共有、Zod バリデーション）
- **認証**: Google OAuth 2.0（`@hono/oauth-providers/google` + 学内ドメイン制限 + HTTPOnly JWT Cookie）＆ ローカル開発用ダミーログイン
- **データベース / ORM**: Cloudflare D1 (SQLite) / Drizzle ORM（ローカル開発時は `better-sqlite3` を自動使用）
- **Excel / CSV エクスポート**: SheetJS (`xlsx`)
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
│   │   ├── aggregation.ts       # 点差補正(定数10)・Zスコア・技術魅力按分・順位算出エンジン
│   │   ├── grade.ts             # 入部年度からの動的回生算出ロジック
│   │   └── schema/index.ts      # フロント・バック共通 Zod スキーマ
│   ├── server/
│   │   ├── app.ts               # Hono アプリ本体 & AppType エクスポート
│   │   ├── dev-entry.ts         # Vite ローカル開発用エントリポイント
│   │   ├── db/
│   │   │   ├── schema.ts        # Drizzle ORM テーブル定義 (6テーブル)
│   │   │   ├── local.ts         # ローカル SQLite アダプタ (自動テーブル作成)
│   │   │   └── seed.ts          # 初期デモデータシード
│   │   ├── lib/
│   │   │   ├── csv.ts           # CSV/TSV パーサー
│   │   │   ├── export.ts        # 2ファイルExcel/CSV生成ロジック
│   │   │   ├── session.ts       # JWT Cookie & Google OIDC 検証
│   │   │   └── audition-loader.ts
│   │   ├── middleware/auth.ts   # 最新DBロール参照・RBACミドルウェア
│   │   └── routes/              # auth.ts / auditions.ts / admin.ts
│   ├── client/                  # React SPA
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
ブラウザで `http://localhost:5173` を開くと、ログイン画面の「開発・検証用ダミーログイン」から運営委員長（ADMIN）・掛け持ち部員・一般部員・コメントのみ部員等をワンクリックで切り替えて全機能を試せます。

### 4. テスト・型チェック・ビルド
```bash
npm test       # Vitest（集計ロジック単体テスト＋API/RBAC/Excel結合テスト）
npm run build  # Vite 本番ビルド + TypeScript 型チェック
```

---

## 環境変数一覧（Cloudflare Workers / `.dev.vars`）

| 変数名 | 必須 | 説明 |
| :--- | :---: | :--- |
| `GOOGLE_CLIENT_ID` | 本番必須 | Google Cloud Console の OAuth 2.0 クライアント ID |
| `GOOGLE_CLIENT_SECRET` | 本番必須 | Google Cloud Console の OAuth 2.0 クライアントシークレット |
| `SESSION_SECRET` | 本番必須 | セッション Cookie (JWT) 署名用のランダム文字列（32文字以上推奨） |
| `ALLOWED_GOOGLE_DOMAIN` | 推奨 | 許可する学内ドメイン（カンマ区切り可。例: `stu.kobe-u.ac.jp`） |
| `INITIAL_ADMIN_EMAILS` | 推奨 | 初回ログイン時に自動で `ADMIN` ロールにするメールアドレス（カンマ区切り） |
| `ALLOW_UNREGISTERED_DOMAIN_USERS` | 任意 | `true`: マスタ未登録でも学内ドメインなら `VOTER` 作成 / `false`: 事前登録者のみ許可 |
| `ENABLE_DEV_LOGIN` | 任意 | 本番環境では必ず `false`（`wrangler.jsonc` の既定値）にする |

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
   ```

4. **ビルド＆デプロイ**
   ```bash
   npm run deploy
   ```

---

## 集計およびエクスポート仕様

- **点差補正方式（標準）**: 審査員ごとに有効投票（自バンド・`COMMENT_ONLY`・`NULL` を除外）の `MAX - MIN`（点差 `Diff`）を求め、補正係数 $k = 10 / \text{Diff}$（`Diff = 0` または有効採点1件以下時は `1.0`）を素点合計に乗算。
- **Zスコア（偏差値）方式**: $T = 50 + 10 \times \frac{x - \mu}{\sigma}$（$\sigma = 0$ 時は `50`）。
- **正規化後の技術点・魅力点按分**: 素点割合（`tech / rawTotal`, `charm / rawTotal`）をもとに合計点の正規化後点数から算出。
- **2ファイル構成のExcel/CSV出力**:
  1. **集計結果＆生データブック**: ①「総合ランキング集計」シート ＋ ②「全採点Rawデータ_補正過程」シート
  2. **バンド別講評ブック**: 出演バンドごとに1シート作成し、正規化後点数（魅力・技術・合計）とコメントを掲載
