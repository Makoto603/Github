(() => {
  const PHASES = [
    '企画','要件定義','基本設計','詳細設計','実装','単体テスト','結合テスト','受入テスト','リリース','保守・改修'
  ];
  const PHASE_STATUS = ['NOT_STARTED','IN_PROGRESS','PASS','FAILED','SKIPPED'];
  const PROJECT_STATUS = ['ACTIVE','PENDING','HOLD','MAINTENANCE','COMPLETE','ARCHIVED'];
  const STORAGE_KEY = 'dev-management-center-v1';

  const now = () => new Date().toISOString();
  const dateOnly = iso => iso ? new Date(iso).toLocaleDateString('ja-JP') : '-';
  const dateTime = iso => iso ? new Date(iso).toLocaleString('ja-JP', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-';
  const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  const uid = prefix => `${prefix}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;

  const defaultPhaseMap = (passUntil = -1, inProgress = null) => Object.fromEntries(PHASES.map((p, i) => [p, i <= passUntil ? 'PASS' : (i === inProgress ? 'IN_PROGRESS' : 'NOT_STARTED')]));

  const demoProjects = [
    {
      id:'DEMO-001', name:'FlowSpec Refiner', summary:'フロー仕様をレビューし、Codex開発開始用Handoffを生成する開発支援ツール。',
      currentPhase:'保守・改修', status:'MAINTENANCE', priority:'HIGH', startDate:'2026-09-20', updatedAt:now(),
      currentWork:'レビュー結果からCodex初期プロンプト生成機能を追加済み。運用時の改善点を整理中。',
      nextWork:'実案件でHandoff品質を検証し、曖昧仕様の検出ルールを追加する。', pendingReason:'', holdReason:'', blocker:'',
      gitRepository:'https://github.com/example/flowspec-refiner', nasPath:'NAS:/Development/FlowSpecRefiner', latestRelease:'v0.3', owner:'Makoto', notes:'DEMOデータ。実Repositoryへ置換してください。',
      phases:{...defaultPhaseMap(8,9)},
      changeRequests:[{id:'CR-001', title:'Codex初期プロンプト生成を追加', status:'DONE', createdAt:'2026-09-20T14:00:00+09:00'}],
      decisions:[{id:'ADR-001', text:'正式仕様はRepository内Markdownを基準とし、チャット履歴を基準にしない。', createdAt:'2026-09-20T12:00:00+09:00'}],
      activity:[{type:'MAINTENANCE', message:'初期開発完了後、保守・改修フェーズへ移行', at:now()}]
    },
    {
      id:'DEMO-002', name:'3D MAP Production Pipeline', summary:'図面・参考画像からBlender経由で3D MAPを生成しUnityで検証するパイプライン。',
      currentPhase:'結合テスト', status:'ACTIVE', priority:'HIGH', startDate:'2026-09-15', updatedAt:now(),
      currentWork:'Blender Finalizer / FBX Export / Unity Importの実パイプライン検証。',
      nextWork:'実Hunyuan生成を接続し、同じ検証ゲートを通す。', pendingReason:'', holdReason:'', blocker:'実Hunyuan生成は未接続',
      gitRepository:'https://github.com/example/map-production', nasPath:'NAS:/Development/3D-MAP', latestRelease:'v0.2b', owner:'Makoto', notes:'DEMOデータ。',
      phases:{...defaultPhaseMap(5,6)}, changeRequests:[],
      decisions:[{id:'ADR-001', text:'CONFIRMED / INFERRED / GENERATEDを分離し、工程検証結果を保存する。', createdAt:'2026-09-18T16:00:00+09:00'}],
      activity:[{type:'TEST', message:'Unity ImportまでのREAL DOWNSTREAM PIPELINEを検証', at:now()}]
    },
    {
      id:'DEMO-003', name:'Markdown Vault Desktop', summary:'Dropbox APIを直接利用する、iPhone版と共通Vaultを編集できるデスクトップMarkdownアプリ。',
      currentPhase:'基本設計', status:'HOLD', priority:'MEDIUM', startDate:'2026-09-21', updatedAt:now(),
      currentWork:'Dropbox API前提の競合管理とUI構成まで設計。', nextWork:'デスクトップ版の実装を開始する。', pendingReason:'', holdReason:'他案件を優先するため一時停止', blocker:'',
      gitRepository:'', nasPath:'NAS:/Development/MarkdownVault', latestRelease:'-', owner:'Makoto', notes:'DEMOデータ。',
      phases:{...defaultPhaseMap(1,2)}, changeRequests:[], decisions:[], activity:[{type:'HOLD', message:'優先案件対応のためHOLD', at:now()}]
    },
    {
      id:'DEMO-004', name:'X Topic Editor', summary:'複数ニュースソースを横断し、記事候補を比較・整理する投稿候補管理ツール。',
      currentPhase:'実装', status:'PENDING', priority:'MEDIUM', startDate:'2026-09-24', updatedAt:now(),
      currentWork:'本文比較・評価ロジックとRSS登録機能を追加中。', nextWork:'RSS登録画面と候補重複排除を確認する。', pendingReason:'外部ニュースソースの取得方式を確認中', holdReason:'', blocker:'一部ニュースサイトは取得制約あり',
      gitRepository:'', nasPath:'NAS:/Development/XTopicEditor', latestRelease:'v0.1', owner:'Makoto', notes:'DEMOデータ。',
      phases:{...defaultPhaseMap(2,4)}, changeRequests:[], decisions:[], activity:[{type:'PENDING', message:'取得制約のあるニュース元を切り分け', at:now()}]
    }
  ];

  let state = loadState();
  let currentProjectId = null;
  let activeView = 'dashboard';

  function loadState(){
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return {version:1, projects: demoProjects, settings:{sourceOfTruth:'GIT'}};
    try { return JSON.parse(raw); } catch { return {version:1, projects: demoProjects, settings:{sourceOfTruth:'GIT'}}; }
  }
  function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); renderAll(); }
  function getProject(id){ return state.projects.find(p => p.id === id); }
  function addActivity(project, type, message){ project.activity = project.activity || []; project.activity.unshift({type, message, at:now()}); project.updatedAt = now(); }

  function progressOf(project){
    const done = PHASES.filter(p => ['PASS','SKIPPED'].includes(project.phases?.[p])).length;
    return Math.round((done / PHASES.length) * 100);
  }

  function statusBadge(status){ return `<span class="badge badge-${status.toLowerCase()}">${esc(status)}</span>`; }
  function priorityBadge(priority){ return `<span class="badge badge-${priority.toLowerCase()}">${esc(priority)}</span>`; }
  function phaseIcon(status){
    const map = {PASS:['✓','phase-pass'],IN_PROGRESS:['●','phase-progress'],NOT_STARTED:['○','phase-not'],FAILED:['!','phase-failed'],SKIPPED:['–','phase-skipped']};
    const [txt, cls] = map[status] || map.NOT_STARTED;
    return `<span class="phase-dot ${cls}" title="${esc(status)}">${txt}</span>`;
  }

  function renderKpis(){
    const defs = [
      ['ACTIVE','現在作業中'],['PENDING','外部待ち・確認待ち'],['HOLD','意図的に停止'],['MAINTENANCE','初期開発完了'],['COMPLETE','完了']
    ];
    document.getElementById('kpiGrid').innerHTML = defs.map(([s,foot]) => {
      const count = state.projects.filter(p=>p.status===s).length;
      return `<div class="kpi"><div class="kpi-label">${s}</div><div class="kpi-value">${count}</div><div class="kpi-foot">${foot}</div></div>`;
    }).join('');
  }

  function renderFilters(){
    const statusSel = document.getElementById('statusFilter');
    const phaseSel = document.getElementById('phaseFilter');
    if(statusSel.options.length===1) PROJECT_STATUS.forEach(s=>statusSel.insertAdjacentHTML('beforeend', `<option value="${s}">${s}</option>`));
    if(phaseSel.options.length===1) PHASES.forEach(p=>phaseSel.insertAdjacentHTML('beforeend', `<option value="${esc(p)}">${esc(p)}</option>`));
  }

  function filteredProjects(){
    const q = document.getElementById('searchInput')?.value?.trim().toLowerCase() || '';
    const status = document.getElementById('statusFilter')?.value || '';
    const phase = document.getElementById('phaseFilter')?.value || '';
    const priority = document.getElementById('priorityFilter')?.value || '';
    return state.projects.filter(p => {
      const hay = `${p.id} ${p.name} ${p.summary} ${p.currentWork} ${p.nextWork}`.toLowerCase();
      return (!q || hay.includes(q)) && (!status || p.status===status) && (!phase || p.currentPhase===phase) && (!priority || p.priority===priority);
    });
  }

  function renderProjectTable(){
    const projects = filteredProjects();
    document.getElementById('resultCount').textContent = `${projects.length} 件`;
    document.getElementById('projectTableBody').innerHTML = projects.map(p => {
      const prog = progressOf(p);
      return `<tr>
        <td class="project-cell" data-project-id="${esc(p.id)}"><div class="project-name">${esc(p.name)}</div><div class="project-id">${esc(p.id)}</div></td>
        <td>${esc(p.currentPhase)}</td>
        <td>${statusBadge(p.status)}</td>
        <td><div class="progress-wrap"><div class="progress-meta"><span>${prog}%</span><span>${PHASES.filter(x=>['PASS','SKIPPED'].includes(p.phases?.[x])).length}/${PHASES.length}</span></div><div class="progress"><span style="width:${prog}%"></span></div></div></td>
        <td>${priorityBadge(p.priority)}</td>
        <td>${p.gitRepository?'<span class="badge badge-complete">LINK</span>':'<span class="muted">-</span>'}</td>
        <td>${dateOnly(p.updatedAt)}</td>
        <td class="next-action">${esc(p.nextWork || '-')}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" class="muted">該当案件はありません。</td></tr>`;
  }

  function renderAttentionQueue(){
    const items = state.projects.filter(p=>['PENDING','HOLD'].includes(p.status) || p.blocker).sort((a,b)=> (a.priority==='HIGH'?-1:1));
    document.getElementById('attentionQueue').innerHTML = items.map(p=>{
      const reason = p.blocker || p.pendingReason || p.holdReason || '要確認';
      return `<div class="queue-item project-cell" data-project-id="${esc(p.id)}"><div class="queue-title"><span>${esc(p.name)}</span>${statusBadge(p.status)}</div><div class="queue-body">${esc(reason)}</div></div>`;
    }).join('') || `<div class="muted">現在、要対応案件はありません。</div>`;
  }

  function renderRecentActivity(){
    const events = state.projects.flatMap(p => (p.activity||[]).map(a=>({...a, projectId:p.id, projectName:p.name}))).sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,8);
    document.getElementById('recentActivity').innerHTML = events.map(a=>`<div class="activity-item"><div><strong>${esc(a.projectName)}</strong> <span class="activity-time">${dateTime(a.at)}</span></div><div class="activity-body">${esc(a.message)}</div></div>`).join('') || '<div class="muted">履歴はありません。</div>';
  }

  function renderMatrix(){
    const head = PHASES.map(p=>`<th>${esc(p)}</th>`).join('');
    const body = state.projects.map(p=>`<tr><td class="project-cell" data-project-id="${esc(p.id)}"><strong>${esc(p.name)}</strong><div class="project-id">${esc(p.id)}</div></td>${PHASES.map(ph=>`<td>${phaseIcon(p.phases?.[ph])}</td>`).join('')}</tr>`).join('');
    document.getElementById('matrix').innerHTML = `<table class="matrix-table"><thead><tr><th>案件</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function renderAllChanges(){
    const rows = state.projects.flatMap(p=>(p.changeRequests||[]).map(cr=>({...cr, project:p}))).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    document.getElementById('allChanges').innerHTML = rows.map(cr=>`<div class="card-row"><div class="card-id">${esc(cr.id)}</div><div><div class="card-title">${esc(cr.title)}</div><div class="card-desc">${esc(cr.project.name)} / ${dateOnly(cr.createdAt)}</div></div><span class="badge badge-${cr.status==='DONE'?'complete':'pending'}">${esc(cr.status)}</span></div>`).join('') || '<div class="muted">変更要求はありません。</div>';
  }

  function renderHandoffCards(){
    document.getElementById('handoffCards').innerHTML = state.projects.filter(p=>!['ARCHIVED','COMPLETE'].includes(p.status)).map(p=>`<div class="card-row"><div class="card-id">${esc(p.id)}</div><div><div class="card-title">${esc(p.name)}</div><div class="card-desc">${esc(p.currentPhase)} / ${esc(p.status)}<br>次: ${esc(p.nextWork || '-')}</div></div><button class="ghost handoff-btn" data-project-id="${esc(p.id)}">Codexで続きをする</button></div>`).join('');
  }

  function renderAll(){
    renderKpis(); renderFilters(); renderProjectTable(); renderAttentionQueue(); renderRecentActivity(); renderMatrix(); renderAllChanges(); renderHandoffCards();
    bindProjectLinks();
  }

  function bindProjectLinks(){
    document.querySelectorAll('[data-project-id].project-cell').forEach(el => el.onclick = () => openProject(el.dataset.projectId));
    document.querySelectorAll('.handoff-btn').forEach(el => el.onclick = () => showHandoff(el.dataset.projectId));
  }

  function openProject(id){
    currentProjectId = id;
    const p = getProject(id); if(!p) return;
    document.getElementById('drawerProjectId').textContent = p.id;
    document.getElementById('drawerTitle').textContent = p.name;
    renderDrawer(p);
    document.getElementById('drawerBackdrop').classList.remove('hidden');
    document.getElementById('projectDrawer').classList.remove('hidden');
    document.getElementById('projectDrawer').setAttribute('aria-hidden','false');
  }

  function closeProject(){
    document.getElementById('drawerBackdrop').classList.add('hidden');
    document.getElementById('projectDrawer').classList.add('hidden');
    document.getElementById('projectDrawer').setAttribute('aria-hidden','true');
    currentProjectId = null;
  }

  function renderDrawer(p){
    const phaseRows = PHASES.map(ph=>{
      const st = p.phases?.[ph] || 'NOT_STARTED';
      const locked = st === 'PASS';
      return `<div class="phase-line">
        <div class="phase-name">${phaseIcon(st)} ${esc(ph)}</div>
        <select class="control phase-select" data-phase="${esc(ph)}" ${locked?'disabled':''}>${PHASE_STATUS.map(x=>`<option ${x===st?'selected':''}>${x}</option>`).join('')}</select>
        <span class="${locked?'lock-note':'muted'}">${locked?'PASS固定 / 修正はCRで管理':'変更可'}</span>
      </div>`;
    }).join('');

    const changes = (p.changeRequests||[]).map(cr=>`<div class="small-item"><strong>${esc(cr.id)} / ${esc(cr.status)}</strong><p>${esc(cr.title)}</p></div>`).join('') || '<div class="muted">変更要求なし</div>';
    const decisions = (p.decisions||[]).map(d=>`<div class="small-item"><strong>${esc(d.id)} / ${dateOnly(d.createdAt)}</strong><p>${esc(d.text)}</p></div>`).join('') || '<div class="muted">設計判断の記録なし</div>';
    const activity = (p.activity||[]).slice(0,12).map(a=>`<div class="activity-item"><div><strong>${esc(a.type)}</strong> <span class="activity-time">${dateTime(a.at)}</span></div><div class="activity-body">${esc(a.message)}</div></div>`).join('') || '<div class="muted">履歴なし</div>';

    document.getElementById('drawerBody').innerHTML = `
      <div class="detail-grid">
        <div class="detail-field"><label>案件状態</label>${statusBadge(p.status)}</div>
        <div class="detail-field"><label>現在工程</label><strong>${esc(p.currentPhase)}</strong></div>
        <div class="detail-field"><label>優先度</label>${priorityBadge(p.priority)}</div>
        <div class="detail-field"><label>最終更新</label><strong>${dateTime(p.updatedAt)}</strong></div>
        <div class="detail-field"><label>Git Repository</label>${p.gitRepository?`<a href="${esc(p.gitRepository)}" target="_blank" rel="noopener">${esc(p.gitRepository)}</a>`:'<strong>-</strong>'}</div>
        <div class="detail-field"><label>NAS Path</label><strong>${esc(p.nasPath || '-')}</strong></div>
        <div class="detail-field"><label>最新Release</label><strong>${esc(p.latestRelease || '-')}</strong></div>
        <div class="detail-field"><label>担当</label><strong>${esc(p.owner || '-')}</strong></div>
      </div>

      <div class="detail-section"><h3>概要</h3><div class="small-item"><p>${esc(p.summary)}</p></div></div>

      <div class="detail-section"><h3>現在作業 / 次アクション / Blocker</h3>
        <div class="inline-editor">
          <label class="muted">現在作業</label><textarea id="editCurrentWork" class="control">${esc(p.currentWork||'')}</textarea>
          <label class="muted">次アクション</label><textarea id="editNextWork" class="control">${esc(p.nextWork||'')}</textarea>
          <label class="muted">Blocker</label><textarea id="editBlocker" class="control">${esc(p.blocker||'')}</textarea>
          <div class="detail-grid">
            <div><label class="muted">状態</label><select id="editStatus" class="control">${PROJECT_STATUS.map(x=>`<option ${x===p.status?'selected':''}>${x}</option>`).join('')}</select></div>
            <div><label class="muted">現在工程</label><select id="editCurrentPhase" class="control">${PHASES.map(x=>`<option ${x===p.currentPhase?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
            <div><label class="muted">Pending理由</label><input id="editPendingReason" class="control" value="${esc(p.pendingReason||'')}" /></div>
            <div><label class="muted">Hold理由</label><input id="editHoldReason" class="control" value="${esc(p.holdReason||'')}" /></div>
          </div>
          <div class="inline-actions"><button id="saveProjectStateBtn" class="primary">状態を保存</button><button id="editProjectBtn" class="ghost">案件情報を編集</button></div>
        </div>
      </div>

      <div class="detail-section"><h3>工程進捗</h3><div class="phase-list">${phaseRows}</div><div class="inline-actions" style="margin-top:8px"><button id="savePhasesBtn" class="primary">工程状態を保存</button></div></div>

      <div class="detail-section"><h3>変更要求</h3><div class="small-list">${changes}</div><div class="add-row"><input id="newCrText" class="control" placeholder="変更要求の内容"><button id="addCrBtn" class="ghost">CR追加</button></div></div>

      <div class="detail-section"><h3>設計判断 / Decision Log</h3><div class="small-list">${decisions}</div><div class="add-row"><input id="newDecisionText" class="control" placeholder="なぜこの設計にしたかを記録"><button id="addDecisionBtn" class="ghost">判断追加</button></div></div>

      <div class="detail-section"><h3>ドキュメント</h3><div class="repo-structure">AGENTS.md\nproject.yaml\nCURRENT_STATE.md\ndocs/00_案件概要.md\ndocs/01_要件定義.md\ndocs/02_基本設計.md\ndocs/03_詳細設計.md\ndocs/04_実装記録.md\ndocs/05_単体テスト.md\ndocs/06_結合テスト.md\ndocs/07_受入テスト.md\ndocs/08_保守運用.md\ndocs/DECISIONS.md\ndocs/CHANGELOG.md\ndocs/HANDOFF.md</div></div>

      <div class="detail-section"><h3>Codex Handoff</h3><button id="drawerHandoffBtn" class="primary">Codexで続きをする</button></div>

      <div class="detail-section"><h3>最近の変更</h3><div class="activity-list">${activity}</div></div>
    `;

    document.getElementById('saveProjectStateBtn').onclick = saveProjectStateFromDrawer;
    document.getElementById('savePhasesBtn').onclick = savePhasesFromDrawer;
    document.getElementById('addCrBtn').onclick = addChangeRequest;
    document.getElementById('addDecisionBtn').onclick = addDecision;
    document.getElementById('drawerHandoffBtn').onclick = () => showHandoff(p.id);
    document.getElementById('editProjectBtn').onclick = () => openProjectModal(p.id);
  }

  function saveProjectStateFromDrawer(){
    const p = getProject(currentProjectId); if(!p) return;
    const oldStatus = p.status;
    p.currentWork = document.getElementById('editCurrentWork').value.trim();
    p.nextWork = document.getElementById('editNextWork').value.trim();
    p.blocker = document.getElementById('editBlocker').value.trim();
    p.status = document.getElementById('editStatus').value;
    p.currentPhase = document.getElementById('editCurrentPhase').value;
    p.pendingReason = document.getElementById('editPendingReason').value.trim();
    p.holdReason = document.getElementById('editHoldReason').value.trim();
    addActivity(p, 'STATE', `状態更新: ${oldStatus} → ${p.status} / 現在工程: ${p.currentPhase}`);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); renderAll(); renderDrawer(p); toast('案件状態を更新しました');
  }

  function savePhasesFromDrawer(){
    const p = getProject(currentProjectId); if(!p) return;
    let changed = [];
    document.querySelectorAll('.phase-select').forEach(sel=>{
      const ph = sel.dataset.phase;
      const old = p.phases[ph];
      const next = sel.value;
      if(old==='PASS' && next!=='PASS') return;
      if(old!==next){ p.phases[ph]=next; changed.push(`${ph}: ${old} → ${next}`); }
    });
    if(changed.length){ addActivity(p, 'PHASE', changed.join(' / ')); localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); renderAll(); renderDrawer(p); toast('工程状態を更新しました'); }
    else toast('変更はありません');
  }

  function nextCrId(p){
    const nums = (p.changeRequests||[]).map(x=>Number(String(x.id).replace(/\D/g,''))).filter(Number.isFinite);
    return `CR-${String((Math.max(0,...nums)+1)).padStart(3,'0')}`;
  }
  function nextAdrId(p){
    const nums = (p.decisions||[]).map(x=>Number(String(x.id).replace(/\D/g,''))).filter(Number.isFinite);
    return `ADR-${String((Math.max(0,...nums)+1)).padStart(3,'0')}`;
  }
  function addChangeRequest(){
    const p = getProject(currentProjectId); const input = document.getElementById('newCrText'); if(!p || !input.value.trim()) return;
    const cr = {id:nextCrId(p), title:input.value.trim(), status:'OPEN', createdAt:now()};
    p.changeRequests = p.changeRequests || []; p.changeRequests.unshift(cr); addActivity(p,'CHANGE_REQUEST',`${cr.id} ${cr.title}`);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); renderAll(); renderDrawer(p); toast(`${cr.id} を追加しました`);
  }
  function addDecision(){
    const p = getProject(currentProjectId); const input = document.getElementById('newDecisionText'); if(!p || !input.value.trim()) return;
    const d = {id:nextAdrId(p), text:input.value.trim(), createdAt:now()};
    p.decisions = p.decisions || []; p.decisions.unshift(d); addActivity(p,'DECISION',`${d.id} を追加`);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); renderAll(); renderDrawer(p); toast(`${d.id} を追加しました`);
  }

  function openProjectModal(editId=null){
    const p = editId ? getProject(editId) : null;
    document.getElementById('projectModalTitle').textContent = p ? '案件情報を編集' : '新規案件';
    const form = document.getElementById('projectForm');
    form.innerHTML = `
      <div class="form-field"><label>案件ID</label><input name="id" required value="${esc(p?.id||'')}" ${p?'readonly':''}></div>
      <div class="form-field"><label>案件名</label><input name="name" required value="${esc(p?.name||'')}"></div>
      <div class="form-field full-span"><label>概要</label><textarea name="summary">${esc(p?.summary||'')}</textarea></div>
      <div class="form-field"><label>現在工程</label><select name="currentPhase">${PHASES.map(x=>`<option ${x===(p?.currentPhase||'企画')?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="form-field"><label>案件状態</label><select name="status">${PROJECT_STATUS.map(x=>`<option ${x===(p?.status||'ACTIVE')?'selected':''}>${x}</option>`).join('')}</select></div>
      <div class="form-field"><label>優先度</label><select name="priority">${['HIGH','MEDIUM','LOW'].map(x=>`<option ${x===(p?.priority||'MEDIUM')?'selected':''}>${x}</option>`).join('')}</select></div>
      <div class="form-field"><label>開始日</label><input type="date" name="startDate" value="${esc(p?.startDate||new Date().toISOString().slice(0,10))}"></div>
      <div class="form-field full-span"><label>現在作業</label><textarea name="currentWork">${esc(p?.currentWork||'')}</textarea></div>
      <div class="form-field full-span"><label>次の作業</label><textarea name="nextWork">${esc(p?.nextWork||'')}</textarea></div>
      <div class="form-field"><label>Pending理由</label><input name="pendingReason" value="${esc(p?.pendingReason||'')}"></div>
      <div class="form-field"><label>Hold理由</label><input name="holdReason" value="${esc(p?.holdReason||'')}"></div>
      <div class="form-field full-span"><label>Blocker</label><input name="blocker" value="${esc(p?.blocker||'')}"></div>
      <div class="form-field"><label>Git Repository</label><input name="gitRepository" value="${esc(p?.gitRepository||'')}"></div>
      <div class="form-field"><label>NAS Path</label><input name="nasPath" value="${esc(p?.nasPath||'')}"></div>
      <div class="form-field"><label>最新Release</label><input name="latestRelease" value="${esc(p?.latestRelease||'')}"></div>
      <div class="form-field"><label>担当</label><input name="owner" value="${esc(p?.owner||'')}"></div>
      <div class="form-field full-span"><label>備考</label><textarea name="notes">${esc(p?.notes||'')}</textarea></div>
      <div class="form-actions"><button type="button" class="ghost" data-close-modal>キャンセル</button><button class="primary" type="submit">保存</button></div>
    `;
    form.dataset.editId = editId || '';
    document.getElementById('modalBackdrop').classList.remove('hidden'); document.getElementById('projectModal').classList.remove('hidden');
    bindModalClose();
  }

  function closeProjectModal(){ document.getElementById('modalBackdrop').classList.add('hidden'); document.getElementById('projectModal').classList.add('hidden'); }
  function bindModalClose(){ document.querySelectorAll('[data-close-modal]').forEach(b=>b.onclick=closeProjectModal); }

  function handleProjectSubmit(e){
    e.preventDefault();
    const fd = new FormData(e.currentTarget); const editId = e.currentTarget.dataset.editId;
    const data = Object.fromEntries(fd.entries());
    if(!editId && state.projects.some(x=>x.id===data.id)){ toast('同じ案件IDが存在します'); return; }
    if(editId){
      const p = getProject(editId); Object.assign(p, data); addActivity(p,'EDIT','案件基本情報を更新');
    } else {
      const p = {...data, updatedAt:now(), phases:defaultPhaseMap(-1,0), changeRequests:[], decisions:[], activity:[]};
      p.phases['企画']='IN_PROGRESS'; addActivity(p,'CREATE','案件を作成'); state.projects.unshift(p);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); closeProjectModal(); renderAll(); if(editId && currentProjectId) { const p=getProject(currentProjectId); document.getElementById('drawerTitle').textContent=p.name; renderDrawer(p); } toast('保存しました');
  }

  function buildHandoff(p){
    const blocker = p.blocker || 'なし';
    const done = PHASES.filter(ph=>p.phases?.[ph]==='PASS');
    const openCr = (p.changeRequests||[]).filter(x=>x.status!=='DONE');
    return `# Codex Development Handoff\n\nProject ID: ${p.id}\nProject Name: ${p.name}\n\nCurrent Phase: ${p.currentPhase}\nCurrent Status: ${p.status}\nPriority: ${p.priority}\nLatest Release: ${p.latestRelease || '-'}\n\nGit Repository: ${p.gitRepository || '-'}\nNAS Path: ${p.nasPath || '-'}\n\n## 最初に確認してください\n\n- AGENTS.md\n- project.yaml\n- CURRENT_STATE.md\n- docs/HANDOFF.md\n- docs/CHANGELOG.md\n- docs/DECISIONS.md\n\n## Repository運用ルール\n\n- 過去のChat履歴ではなく、Repository内の正式ドキュメントを基準として開発してください。\n- PASS済み工程は原則として巻き戻さないでください。\n- 後工程で問題が見つかった場合は変更要求(CR)として記録し、必要な設計修正・実装修正・再テストを履歴に追加してください。\n- 大容量成果物はNAS側に置き、Repositoryにはコード・正式Markdown・参照情報を保存してください。\n\n## 現在の作業\n\n${p.currentWork || '-'}\n\n## 次の作業\n\n${p.nextWork || '-'}\n\n## Blocker\n\n${blocker}\n\n## Pending / Hold\n\nPending理由: ${p.pendingReason || '-'}\nHold理由: ${p.holdReason || '-'}\n\n## 完了済み工程\n\n${done.length ? done.map(x=>`- ${x}: PASS`).join('\n') : '- なし'}\n\n## 未完了の変更要求\n\n${openCr.length ? openCr.map(x=>`- ${x.id}: ${x.title} [${x.status}]`).join('\n') : '- なし'}\n\n## 完了条件\n\n1. 今回の作業対象を実装または検証する。\n2. 変更内容と理由をRepositoryの正式ドキュメントに反映する。\n3. 必要なテストを実行し、結果を記録する。\n4. 次の作業・Blocker・案件状態が最新になるよう更新する。\n\n## 作業完了後、以下を更新してください\n\n- project.yaml\n- CURRENT_STATE.md\n- docs/HANDOFF.md\n- docs/CHANGELOG.md\n- 必要に応じて docs/DECISIONS.md\n\n最終回答では、実施内容・変更ファイル・テスト結果・残課題・次アクションを簡潔にまとめてください。\n`;
  }

  function showHandoff(id){
    const p = getProject(id); if(!p) return; currentProjectId = id;
    document.getElementById('handoffText').value = buildHandoff(p);
    document.getElementById('modalBackdrop').classList.remove('hidden'); document.getElementById('handoffModal').classList.remove('hidden');
  }
  function closeHandoff(){ document.getElementById('modalBackdrop').classList.add('hidden'); document.getElementById('handoffModal').classList.add('hidden'); }

  async function copyHandoff(){
    const text = document.getElementById('handoffText').value;
    try { await navigator.clipboard.writeText(text); toast('Handoffをコピーしました'); }
    catch { document.getElementById('handoffText').select(); document.execCommand('copy'); toast('Handoffをコピーしました'); }
  }
  function downloadHandoff(){
    const p = getProject(currentProjectId); const text = document.getElementById('handoffText').value;
    const blob = new Blob([text],{type:'text/markdown;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${p?.id||'project'}_HANDOFF.md`; a.click(); URL.revokeObjectURL(a.href);
  }

  function exportState(){
    const blob = new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`development-center-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  function importState(file){
    const reader = new FileReader(); reader.onload=()=>{ try{ const data=JSON.parse(reader.result); if(!Array.isArray(data.projects)) throw new Error(); state=data; localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); renderAll(); toast('インポートしました'); }catch{ toast('JSON形式が不正です'); } }; reader.readAsText(file);
  }

  function switchView(view){
    activeView=view; document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view')); document.getElementById(`${view}View`).classList.add('active-view');
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  }

  let toastTimer; function toast(msg){ clearTimeout(toastTimer); const el=document.getElementById('toast'); el.textContent=msg; el.classList.remove('hidden'); toastTimer=setTimeout(()=>el.classList.add('hidden'),2200); }

  const GIT_SYNC_FIELDS = [
    'name','summary','currentPhase','status','priority','startDate','updatedAt',
    'currentWork','nextWork','pendingReason','holdReason','blocker',
    'gitRepository','nasPath','latestRelease','owner','notes','phases'
  ];

  function setGitStatus(label, ok=null){
    const el=document.getElementById('gitStatusPill'); if(!el) return;
    el.textContent=`● ${label}`;
    el.dataset.state = ok===true ? 'connected' : (ok===false ? 'error' : 'checking');
  }

  async function refreshGitStatus(){
    if(!window.GitAdapter){ setGitStatus('Git Adapterなし', false); return null; }
    setGitStatus('Git確認中', null);
    try{
      const info=await window.GitAdapter.status();
      setGitStatus(`Git接続済み / ${info.registryProjects}件`, true);
      state.settings = {...(state.settings||{}),
        gitConnection:'CONNECTED',
        gitRepository:`https://github.com/${info.repository}`,
        gitBranch:info.branch,
        gitLatestCommit:info.latestCommit,
        gitLatestCommitAt:info.latestCommitAt,
        lastGitCheckAt:now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return info;
    }catch(error){
      setGitStatus('Git接続失敗', false);
      state.settings = {...(state.settings||{}),gitConnection:'ERROR',gitSyncError:String(error?.message||error),lastGitCheckAt:now()};
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return null;
    }
  }

  async function syncFromGit(){
    const btn=document.getElementById('gitSyncBtn');
    if(btn){ btn.disabled=true; btn.textContent='同期中…'; }
    try{
      const info=await refreshGitStatus();
      if(!info) throw new Error('Gitへ接続できません');
      const incoming=Array.isArray(info.registry?.projects) ? info.registry.projects : [];
      const localMap=new Map(state.projects.map(p=>[p.id,p]));
      for(const remote of incoming){
        const local=localMap.get(remote.id);
        if(local){
          for(const field of GIT_SYNC_FIELDS){
            if(Object.prototype.hasOwnProperty.call(remote,field)) local[field]=remote[field];
          }
          addActivity(local,'GIT_SYNC',`Git registryから同期: ${info.latestCommit.slice(0,7)}`);
        }else{
          const added=JSON.parse(JSON.stringify(remote));
          added.changeRequests=added.changeRequests||[];
          added.decisions=added.decisions||[];
          added.activity=added.activity||[];
          added.activity.unshift({type:'GIT_SYNC',message:`Git registryから新規登録: ${info.latestCommit.slice(0,7)}`,at:now()});
          state.projects.push(added);
        }
      }
      state.settings={...(state.settings||{}),lastGitSyncAt:now(),gitSyncStatus:'SYNCED',gitSyncError:''};
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      renderAll();
      toast(`Gitから${incoming.length}件を同期しました`);
    }catch(error){
      state.settings={...(state.settings||{}),gitSyncStatus:'ERROR',gitSyncError:String(error?.message||error)};
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      toast(`Git同期失敗: ${error?.message||error}`);
    }finally{
      if(btn){ btn.disabled=false; btn.textContent='Gitから同期'; }
    }
  }

  document.addEventListener('DOMContentLoaded',()=>{
    renderAll();
    document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
    ['searchInput','statusFilter','phaseFilter','priorityFilter'].forEach(id=>document.getElementById(id).addEventListener(id==='searchInput'?'input':'change',()=>{renderProjectTable(); bindProjectLinks();}));
    document.getElementById('clearFiltersBtn').onclick=()=>{['searchInput','statusFilter','phaseFilter','priorityFilter'].forEach(id=>document.getElementById(id).value=''); renderProjectTable(); bindProjectLinks();};
    document.getElementById('newProjectBtn').onclick=()=>openProjectModal();
    document.getElementById('gitSyncBtn').onclick=syncFromGit;
    refreshGitStatus();
    document.getElementById('projectForm').addEventListener('submit',handleProjectSubmit);
    document.getElementById('closeDrawerBtn').onclick=closeProject; document.getElementById('drawerBackdrop').onclick=closeProject;
    document.getElementById('modalBackdrop').onclick=()=>{ closeProjectModal(); closeHandoff(); };
    document.querySelectorAll('[data-close-handoff]').forEach(b=>b.onclick=closeHandoff);
    document.getElementById('copyHandoffBtn').onclick=copyHandoff; document.getElementById('downloadHandoffBtn').onclick=downloadHandoff;
    document.getElementById('exportBtn').onclick=exportState; document.getElementById('importInput').onchange=e=>e.target.files?.[0]&&importState(e.target.files[0]);
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeProject(); closeProjectModal(); closeHandoff(); } });
  });
})();