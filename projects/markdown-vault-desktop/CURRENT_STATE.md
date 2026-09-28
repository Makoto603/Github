# CURRENT STATE

## 現在工程
基本設計

## 状態
ACTIVE

## 現在
既存のiPhone Markdownアプリと同じDropbox VaultをWindowsデスクトップから直接編集する構成を設計済み。

## 実装方針
- PCのDropboxローカルクライアントには依存しない
- Dropbox APIでクラウド上のVaultを直接操作する
- 競合管理はDropbox側のrevision/DB管理を利用する
- 基本表示はプレビュー
- 選択中の行だけMarkdown編集状態にする
- Obsidianに近い操作感を目指す

## 次
デスクトップ版の実装を開始する。

## Blocker
現時点で実装ソースは確認できていない。
