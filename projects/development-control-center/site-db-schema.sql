-- Development Control Center / Ver.1
-- Site DB向けの論理スキーマ例。正式なソースコード・MarkdownはGit Repositoryを基準とする。

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT,
  current_phase TEXT NOT NULL,
  project_status TEXT NOT NULL,
  priority TEXT NOT NULL,
  start_date TEXT,
  updated_at TEXT NOT NULL,
  current_work TEXT,
  next_work TEXT,
  pending_reason TEXT,
  hold_reason TEXT,
  blocker TEXT,
  git_repository TEXT,
  nas_path TEXT,
  latest_release TEXT,
  owner TEXT,
  notes TEXT,
  git_provider TEXT DEFAULT 'github',
  git_repository_id TEXT,
  sync_version INTEGER DEFAULT 1
);

CREATE TABLE project_phases (
  project_id TEXT NOT NULL,
  phase_order INTEGER NOT NULL,
  phase_name TEXT NOT NULL,
  phase_status TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  PRIMARY KEY (project_id, phase_name),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE change_requests (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  source_phase TEXT,
  target_scope TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE decisions (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  decision_text TEXT NOT NULL,
  rationale TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE activity_log (
  activity_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  source TEXT DEFAULT 'SITE',
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE document_refs (
  document_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  repository_path TEXT,
  external_url TEXT,
  is_source_of_truth INTEGER DEFAULT 1,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE handoff_snapshots (
  handoff_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  source_version INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- 重要ルール:
-- 1. project_phases.phase_status='PASS' から別状態への直接更新は禁止する。
-- 2. 後工程で問題が出た場合は change_requests を追加する。
-- 3. Git側の正式文書とSite DBの状態が競合した場合はGitを優先する。
-- 4. NASには大容量成果物を置き、Siteにはパス/参照のみ保存する。