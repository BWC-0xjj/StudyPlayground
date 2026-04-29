# 単位換算トレーニング

日本の小学生向けの単位換算ゲームです。純静的サイトなので、そのまま GitHub Pages に公開できます。

## ローカルプレビュー

ブラウザで `index.html` を開けば表示できます。

ローカルサーバーで見る場合は、プロジェクトフォルダで次を実行します。

```powershell
python -m http.server 8080
```

そのあと `http://localhost:8080` にアクセスします。

## GitHub Pages に公開

1. このフォルダを GitHub リポジトリに push します。
2. リポジトリの `Settings` を開きます。
3. `Pages` に入ります。
4. Source は `Deploy from a branch` を選びます。
5. Branch は `main`、フォルダは `/root` を選びます。
6. 保存後、GitHub Pages の URL が作られるまで待ちます。

## 題材を増やす

題材データは `content/units.js` の `window.LEARNING_TOPICS` にあります。

```js
["1 m", "100 cm", "メートルをセンチメートルにするときは 100 をかける"]
```

別の学習内容を増やすときは、この形式でテーマと問題を追加します。
