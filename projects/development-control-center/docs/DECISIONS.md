# Decisions

## ADR-001 Gitを正式情報源とする

Siteは案件の運用状態を管理するが、正式な仕様・コード・MarkdownはGit Repositoryを基準とする。

## ADR-002 完了工程を巻き戻さない

後工程の問題はChange Requestとして履歴を追加し、設計修正・実装修正・再テストを追跡する。

## ADR-003 NASには参照だけを保持する

大容量成果物はSite DBへ保存せず、NAS Pathと必要なメタデータのみ保持する。