# Markdown Vault Desktop Design

## Goal
iPhone版MarkdownアプリとWindowsデスクトップ版で、同じDropbox上のVaultを安全に編集する。

## Storage
- Dropbox APIを直接使用
- PCローカルDropboxクライアント非依存
- Vault/DB用フォルダをDropbox上に設ける
- revisionを使って競合更新を検出する
- 競合時は黙って上書きしない

## Editor UX
- 通常はレンダリング済みMarkdownを表示
- 選択行のみソースMarkdownへ切替
- 編集完了後にプレビューへ戻す
- ファイル一覧/フォルダ構造はVault基準

## Sync
1. Dropboxからrevision付きで取得
2. ローカル編集
3. 保存時に元revisionを照合
4. 一致すれば更新
5. 不一致なら競合として扱う

## Non-goals
- Dropboxデスクトップクライアントの同期フォルダを直接編集しない
- 競合をLast Write Winsだけで隠さない
