# Development Control Center API Contract (Ver.1)

## Source of Truth

- 正式な仕様・コード・Markdown: Git Repository
- 大容量成果物: NAS
- Site DB: 現在状態、工程、履歴、変更要求、Handoff、参照情報

## Project API

### GET /api/projects
案件一覧。フィルター: `status`, `phase`, `priority`, `q`。

### POST /api/projects
案件を作成。

### GET /api/projects/:id
案件詳細を取得。

### PATCH /api/projects/:id
現在工程、案件状態、現在作業、次作業、Pending/Hold理由、Blocker等を更新。

## Phase API

### PUT /api/projects/:id/phases/:phase
工程状態を更新。

制約:
- `PASS -> NOT_STARTED/IN_PROGRESS/FAILED/SKIPPED` は拒否。
- 修正が必要な場合はChange Requestを作成する。

## Change Request API

### POST /api/projects/:id/change-requests
変更要求を追加。

### PATCH /api/projects/:id/change-requests/:crId
OPEN / IN_PROGRESS / DONE / REJECTED を更新。

## Decision API

### POST /api/projects/:id/decisions
設計判断と理由を記録。

## Handoff API

### POST /api/projects/:id/handoff
現在のSite DB状態とGit参照情報からCodex再開プロンプトを生成する。

## Git API Adapter

Ver.1で取得する候補:
- Repository存在確認
- default branch
- latest commit SHA / timestamp
- latest release / tag
- `AGENTS.md`
- `project.yaml`
- `CURRENT_STATE.md`
- `docs/HANDOFF.md`
- `docs/CHANGELOG.md`

原則:
- ブラウザへPersonal Access Tokenを保存しない。
- 認証が必要なGit APIはSiteバックエンド側で保持する。
- Site DB側の内容とRepository内正式文書が競合した場合はGitを基準とし、差分を警告する。

## Future Sync Fields

各案件に以下を持たせ、Ver.2/Ver.3へ拡張可能にする。

- `git_provider`
- `git_repository_id`
- `sync_version`
- `last_git_sync_at`
- `last_nas_sync_at`
- `last_codex_sync_at`
- `sync_status`
- `sync_error`

## Git Read-Only Public Adapter (Ver.1.1)

個人開発用の公開Repository `Makoto603/Github` は、ブラウザへCredentialを置かずに読み取り可能とする。

### GET equivalent / Repository status
Frontend adapter:
- `GET https://api.github.com/repos/Makoto603/Github`
- `GET https://api.github.com/repos/Makoto603/Github/commits/master`

### Registry
- `GET https://raw.githubusercontent.com/Makoto603/Github/master/projects/registry.json`

### Project documents
`notes` 内の `Repository path: projects/<slug>` を参照し、以下を読み取る。
- `project.yaml`
- `CURRENT_STATE.md`
- `docs/HANDOFF.md`
- `docs/CHANGELOG.md`

### Sync rule
- Git同期は明示操作「Gitから同期」で行う。
- Gitから同期する正式項目: name, summary, currentPhase, status, priority, startDate, updatedAt, currentWork, nextWork, pendingReason, holdReason, blocker, gitRepository, nasPath, latestRelease, owner, notes, phases。
- Site側のChange Request / Decision / activityは既存案件では保持する。
- Git registryに存在しないSite案件は削除しない。
- private業務Repositoryはこの公開read-only adapterでは扱わない。

### Security
- PAT / GitHub tokenをブラウザに保存しない。
- private Repository対応時はSite backend側の認証済みadapterを追加する。
