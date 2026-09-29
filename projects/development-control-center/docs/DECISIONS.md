# Decisions

## ADR-001 Gitを正式情報源とする

Siteは案件の運用状態を管理するが、正式な仕様・コード・MarkdownはGit Repositoryを基準とする。

## ADR-002 完了工程を巻き戻さない

後工程の問題はChange Requestとして履歴を追加し、設計修正・実装修正・再テストを追跡する。

## ADR-003 NASには参照だけを保持する

大容量成果物はSite DBへ保存せず、NAS Pathと必要なメタデータのみ保持する。

## ADR-004 外部Bridgeの読み取り経路を分離する（2026-09-29）

外部MCP Bridge用にSite DBの読み取り専用APIを設け、既存の/mcpとWebMCPは維持する。サーバー間認証にはSite所有者認証と別のBearer Tokenを使用し、DCC_MCP_READ_TOKENをサーバー側Secretに置く。APIはSELECT相当の処理だけを使用し、Git同期・DB更新を起動しない。理由は外部Bridgeから現在のSite運用状態を参照しつつ、既存の更新経路と15案件を保護するため。
