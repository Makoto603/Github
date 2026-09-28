# CURRENT STATE

## Site
https://x-topic-editor.neconini.chatgpt.site

## Site metadata
- Project ID: appgprj_6ab5cfc1112881919cf0543a8711759d
- Source version: 15
- Projection revision: 30
- Status: active

## 現在工程
実装

## 現在
- Webベースの個人用編集デスクとして稼働
- AI調査依頼を生成し、候補を人間が確認する
- RSS取得を基本経路として追加中
- 記事本文を横断して比較・評価する処理を追加対象
- 候補確定後に予約投稿へ回すHuman-in-the-loop運用

## 方針
- APIの暴走・従量課金リスクを避けるため、人間が最終判断する
- ネイティブiPhoneアプリではなくWeb/PWA前提
- 一次情報を優先し、推測は明示する
- 同一ニュースは重複排除する

## Blocker
Libraryから取得できるSite情報は投影テキストとmetadataのみで、内部ソースは直接取得できない。

## 次
Siteソース取得経路が提供されたら、Git上の本ディレクトリへ現行ソースを追加する。
