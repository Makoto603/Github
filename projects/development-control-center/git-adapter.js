(() => {
  const OWNER = 'Makoto603';
  const REPO = 'Github';
  const BRANCH = 'master';
  const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;
  const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`;

  async function getJson(url) {
    const res = await fetch(url, {headers:{Accept:'application/vnd.github+json'}, cache:'no-store'});
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
    return res.json();
  }

  async function getText(path) {
    const res = await fetch(`${RAW_BASE}/${path.replace(/^\/+/, '')}`, {cache:'no-store'});
    if (!res.ok) throw new Error(`Git raw HTTP ${res.status}: ${path}`);
    return res.text();
  }

  function repoPathOf(project) {
    const note = String(project?.notes || '');
    const match = note.match(/Repository path:\s*([^\s/][^\r\n]*)/i);
    if (!match) return '';
    return match[1].trim().replace(/[.,;]+$/, '');
  }

  async function status() {
    const [repo, commit, registry] = await Promise.all([
      getJson(API_BASE),
      getJson(`${API_BASE}/commits/${encodeURIComponent(BRANCH)}`),
      getJson(`${RAW_BASE}/projects/registry.json`)
    ]);
    return {
      connected: true,
      repository: repo.full_name,
      branch: repo.default_branch || BRANCH,
      latestCommit: commit.sha,
      latestCommitAt: commit.commit?.committer?.date || commit.commit?.author?.date || null,
      registryProjects: Array.isArray(registry.projects) ? registry.projects.length : 0,
      registry
    };
  }

  async function verifyProject(project) {
    const path = repoPathOf(project);
    if (!project?.gitRepository || !path) return {status:'UNCONFIGURED', path};
    try {
      await getText(`${path}/project.yaml`);
      await getText(`${path}/CURRENT_STATE.md`);
      return {status:'CONNECTED', path};
    } catch (error) {
      return {status:'ERROR', path, error:String(error?.message || error)};
    }
  }

  async function readProjectDocuments(project) {
    const path = repoPathOf(project);
    if (!path) throw new Error('Repository path が案件に設定されていません');
    const files = ['project.yaml','CURRENT_STATE.md','docs/HANDOFF.md','docs/CHANGELOG.md'];
    const entries = await Promise.all(files.map(async file => {
      try { return [file, await getText(`${path}/${file}`)]; }
      catch { return [file, null]; }
    }));
    return Object.fromEntries(entries);
  }

  window.GitAdapter = {
    OWNER, REPO, BRANCH, API_BASE, RAW_BASE,
    status, verifyProject, readProjectDocuments, repoPathOf
  };
})();