# Decisions

## ADR-001 Gitを正式情報源とする

Siteは案件の運用状態を管理するが、正式な仕様・コード・MarkdownはGit Repositoryを基準とする。

## ADR-002 完了工程を巻き戻さない

後工程の問題はChange Requestとして履歴を追加し、設計修正・実装修正・再テストを追跡する。

## ADR-003 NASには参照だけを保持する

大容量成果物はSite DBへ保存せず、NAS Pathと必要なメタデータのみ保持する。

## ADR-004 外部Bridgeの読み取り経路を分離する（2026-09-29）

外部MCP Bridge用にSite DBの読み取り専用APIを設け、既存の/mcpとWebMCPは維持する。サーバー間認証にはSite所有者認証と別のBearer Tokenを使用し、DCC_MCP_READ_TOKENをサーバー側Secretに置く。APIはSELECT相当の処理だけを使用し、Git同期・DB更新を起動しない。理由は外部Bridgeから現在のSite運用状態を参照しつつ、既存の更新経路と15案件を保護するため。

## ADR-005 定期差分点検と更新を分ける（2026-09-30）

定期処理はGit正式文書・RegistryとSite DBを読み、ID・status・更新版・接続状態・差分を報告する。案件本体、PASS済み工程、履歴、CR、Decision、Handoffを定期処理から自動上書きしない。根拠が一致するDEV-001の管理記録更新は版付き操作と再読で検証し、その他の同期候補は個別に判断する。Gitに存在しない5案件は維持する。理由はGit正式情報とSite運用状態の誤上書き・削除を防ぐため。

## ADR-006 1案件更新と開発チャットリンク（2026-09-30）

Bridge書き込みはOAuth dcc.writeと別Site Secretを必須とし、対象既存案件IDとsyncVersionで版を固定する。1案件Git同期は確認済みcommit SHAを必須とし、一括同期・作成・削除をBridgeへ公開しない。PASS/COMPLETEには根拠を要求する。開発チャットURLは明示された会話を案件ごとに保持し、一括Skill更新・日次点検では更新しない。理由は15件とGit未登録5件を維持しながら開発記録をチャットから更新し、Handoffから直近の開発会話へ戻るため。
