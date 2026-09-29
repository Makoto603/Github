# Handoff

## Current Phase
実装

## Current Status
ACTIVE

## Current Work
通常チャットから対応可能なBridge側修正を実施済み。RenderへSite URLを設定し、MCP Bridge v0.1.1へ更新した。現在はToken未設定とChatGPT Sitesアクセスレイヤー401が残課題。

## Verified
- GET /api/mcp/projects: Bearer Token認証付き。Site DB由来の15案件を返す
- GET /api/mcp/projects/:projectId: Site DB由来の詳細、履歴、CR、Decision、Handoffを返す
- Site Secret: DCC_MCP_READ_TOKEN（値は文書・ブラウザ・DBへ記録しない）
- Site API単体では認証なし401、不正Token 401、正しいTokenで一覧200・15件、実在ID詳細200、存在しないID 404を確認済み
- Bridge Repository: Makoto603/development-control-center-mcp
- Render service: development-control-center-mcp
- ChatGPT通常チャット → プラグイン → MCP Bridge の ping 成功
- Renderの DCC_BACKEND_BASE_URL はSite URLへ設定済み
- MCP Bridge v0.1.1 / commit 7cfcfb9113fe0fc7e1116bfda8b24ae87487f8cc
- v0.1.1で backend.configured はURLとTokenの両方がある場合のみtrue
- 401 HTMLをそのままMCPエラーへ流さない診断を追加
- Render build成功、v0.1.1起動確認
- server_info: configured=false / baseUrlConfigured=true / tokenConfigured=false / writesEnabled=false
- URL設定後の実接続で、Site公開URLがRenderからのGETに対してChatGPT Sitesアクセスレイヤーの401 HTMLを返すことを確認

## Next Work
1. DCC_BACKEND_TOKENをRenderのSecretへ設定する。
2. Site側で外部サーバーから/api/mcp/*へ到達できるアクセス方式を設定する。通常チャットで操作できない場合はWork/Site編集へ回す。
3. Bridgeからlist_projects/get_projectを再検証し、15件とsyncVersionを確認する。
4. MCP本体の認証はBackend接続確認後に追加する。
5. 残案件のGit移行を継続する。

## Blocker
- DCC_BACKEND_TOKEN未設定
- ChatGPT SitesのアクセスレイヤーがRenderからのサーバー間リクエストを401 HTMLで拒否
- 現在の通常チャットにはSite DB更新用の書き込みツールがない

## Cautions
- Site DBを取得元とし、Gitに存在しない案件を維持する。
- 読み取りAPIからGit fetch/sync、DB更新、履歴追加を行わない。
- Siteの既存UI、Git同期、履歴、CR、Decision Log、Handoff、/mcp、WebMCPを維持する。
- TokenをGit、Site DB、ブラウザ、ログ、APIレスポンスへ記録しない。
- MCP_ALLOW_WRITES=falseを維持する。

## Completion Criteria
Bridgeのserver_infoでconfigured=true / baseUrlConfigured=true / tokenConfigured=trueとなり、ChatGPT通常チャットから15案件の一覧と詳細が取得でき、認証失敗が401、存在しないIDが404となること。
