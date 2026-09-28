import { useMemo, useState } from 'react';
import type { FlowSpec } from './types/flowspec';
import { validateFlowSpec } from './lib/validator';
import './app.css';

const initialSpec: FlowSpec = {
  flowspec_version: '1.0',
  project: { title: null, title_mode: 'ai_generate', description: '' },
  flows: [{ id: 'main', name: 'メインフロー', start_node: null, nodes: [], edges: [] }],
};

export default function App() {
  const [spec, setSpec] = useState<FlowSpec>(initialSpec);
  const issues = useMemo(() => validateFlowSpec(spec), [spec]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'flow.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="shell">
      <header>
        <div><strong>FlowSpec Studio</strong><span className="tag">Ver.1 starter</span></div>
        <button onClick={exportJson}>JSON出力</button>
      </header>
      <section className="project">
        <label>アプリ名（空欄ならAIが決定）
          <input value={spec.project.title ?? ''} onChange={e => setSpec(s => ({...s, project:{...s.project, title:e.target.value || null, title_mode:e.target.value ? 'manual':'ai_generate'}}))}/>
        </label>
        <label>どんなアプリですか？
          <textarea value={spec.project.description} onChange={e => setSpec(s => ({...s, project:{...s.project, description:e.target.value}}))}/>
        </label>
      </section>
      <section className="workspace">
        <aside><h3>部品</h3><p>開始</p><p>終了</p><p>処理</p><p>判断</p><p>入力</p><p>出力</p><p>データ</p><p>エラー</p><p>外部処理</p><p>ユーザー操作</p></aside>
        <article className="canvas"><h2>Canvas</h2><p>M1でReact Flowキャンバスを実装します。</p></article>
        <aside className="issues"><h3>検査</h3>{issues.map(i => <div key={i.id} className={`issue ${i.severity}`}>{i.severity}: {i.message}</div>)}</aside>
      </section>
    </main>
  );
}
