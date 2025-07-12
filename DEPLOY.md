# デプロイメントガイド

## デプロイ方法の選択肢

### 1. Heroku (無料枠あり)

#### 必要なファイル作成

1. Procfileを作成:
```
web: node server/app.js
```

2. package.jsonのenginesセクションを追加:
```json
"engines": {
  "node": ">=14.x",
  "npm": ">=6.x"
}
```

#### デプロイ手順
```bash
# Heroku CLIをインストール
# https://devcenter.heroku.com/articles/heroku-cli

# ログイン
heroku login

# Herokuアプリ作成
heroku create your-oni-game-name

# Gitリポジトリ初期化（まだの場合）
git init
git add .
git commit -m "Initial commit"

# Herokuにデプロイ
git push heroku main

# アプリを開く
heroku open
```

### 2. Railway (簡単・無料枠あり)

1. https://railway.app にアクセス
2. GitHubでログイン
3. "New Project" → "Deploy from GitHub repo"
4. リポジトリを選択
5. 自動的にデプロイされます

### 3. Render (無料枠あり)

1. https://render.com にアクセス
2. "New +" → "Web Service"
3. GitHubリポジトリを接続
4. 以下の設定:
   - Name: oni-game
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `node server/app.js`

### 4. Vercel (静的サイト向け、Socket.ioには向かない)

Socket.ioを使用しているため、Vercelは推奨しません。

### 5. DigitalOcean App Platform

1. https://www.digitalocean.com/products/app-platform
2. GitHubリポジトリを接続
3. 自動検出された設定を確認
4. デプロイ

## 環境変数の設定

本番環境では以下の環境変数を設定してください:

```
NODE_ENV=production
PORT=8080
```

## 重要な注意事項

1. **ポート設定**: 多くのホスティングサービスは`process.env.PORT`を使用します。app.jsで既に対応済みです。

2. **静的ファイル**: publicフォルダ内の画像やCSSが正しく配信されることを確認してください。

3. **WebSocket対応**: Socket.ioを使用しているため、WebSocketをサポートするホスティングサービスを選んでください。

4. **SSL/HTTPS**: 本番環境ではHTTPSを使用することを推奨します。多くのホスティングサービスは自動的にSSLを提供します。

## 推奨: Railway または Render

最も簡単なのはRailwayまたはRenderです。GitHubリポジトリを接続するだけで自動的にデプロイされます。

## ローカルでの本番環境テスト

デプロイ前に本番環境をローカルでテスト:

```bash
NODE_ENV=production npm start
```

## トラブルシューティング

1. **ポートエラー**: `process.env.PORT`が正しく使用されているか確認
2. **静的ファイル404**: publicフォルダのパスが正しいか確認
3. **WebSocketエラー**: CORSやプロキシ設定を確認