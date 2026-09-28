# CURRENT STATE

## 状態
MAINTENANCE

## Version
v0.2.0

## 完了
- WordPress Draft作成・更新
- Draft一覧・取得
- 画像アップロード
- カテゴリ・タグ取得
- 専用APIキー認証
- Windows PowerShellクライアント
- APIキーのDPAPI暗号化保存
- WordPress側はAPIキーのハッシュのみ保存
- 公開・削除APIを持たない安全側設計

## Git管理
元の配布パッケージを `source-packages/` に保持する。
実APIキー、DPAPI設定、WordPress認証情報はGitへ保存しない。
