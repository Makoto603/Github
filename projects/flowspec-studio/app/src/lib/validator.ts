import type { FlowSpec, FlowSpecFlow } from '../types/flowspec';

export type ValidationSeverity = 'error' | 'warning' | 'info';
export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  message: string;
  flowId?: string;
  nodeId?: string;
  edgeId?: string;
}

export function validateFlowSpec(spec: FlowSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!spec.project.description.trim()) {
    issues.push({ id: 'PROJECT_DESCRIPTION_EMPTY', severity: 'error', message: 'アプリ説明は必須です。' });
  }
  for (const flow of spec.flows) issues.push(...validateFlow(flow));
  return issues;
}

function validateFlow(flow: FlowSpecFlow): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  for (const node of flow.nodes) {
    if (ids.has(node.id)) issues.push({ id: `DUP_NODE_${node.id}`, severity: 'error', message: `Node ID ${node.id} が重複しています。`, flowId: flow.id, nodeId: node.id });
    ids.add(node.id);
  }
  const starts = flow.nodes.filter(n => n.type === 'start');
  const ends = flow.nodes.filter(n => n.type === 'end');
  if (starts.length === 0) issues.push({ id: `NO_START_${flow.id}`, severity: 'error', message: '開始ノードがありません。', flowId: flow.id });
  if (starts.length > 1) issues.push({ id: `MULTI_START_${flow.id}`, severity: 'error', message: 'Ver.1では開始ノードは1つです。', flowId: flow.id });
  if (ends.length === 0) issues.push({ id: `NO_END_${flow.id}`, severity: 'warning', message: '終了ノードがありません。常駐処理なら無視できます。', flowId: flow.id });
  for (const edge of flow.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) issues.push({ id: `BROKEN_EDGE_${edge.id}`, severity: 'error', message: `接続 ${edge.id} の参照先が存在しません。`, flowId: flow.id, edgeId: edge.id });
  }
  for (const node of flow.nodes.filter(n => n.type === 'decision')) {
    const outgoing = flow.edges.filter(e => e.from === node.id);
    if (outgoing.length < 2) issues.push({ id: `DECISION_BRANCH_${node.id}`, severity: 'warning', message: '判断ノードの出口が2本未満です。', flowId: flow.id, nodeId: node.id });
    if (outgoing.some(e => !e.condition && !e.label)) issues.push({ id: `DECISION_LABEL_${node.id}`, severity: 'warning', message: '判断ノードの分岐条件が未記入です。', flowId: flow.id, nodeId: node.id });
  }
  if (starts.length === 1) {
    const reachable = new Set<string>([starts[0].id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of flow.edges) if (reachable.has(e.from) && !reachable.has(e.to)) { reachable.add(e.to); changed = true; }
    }
    for (const node of flow.nodes) if (!reachable.has(node.id)) issues.push({ id: `UNREACHABLE_${node.id}`, severity: 'warning', message: '開始地点から到達できないノードです。', flowId: flow.id, nodeId: node.id });
  }
  return issues;
}
