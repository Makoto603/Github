export type FlowNodeType =
  | 'start' | 'end' | 'process' | 'decision' | 'input' | 'output'
  | 'data' | 'error' | 'external' | 'user_action' | 'subflow';

export interface FlowSpecNode {
  id: string;
  type: FlowNodeType;
  label: string;
  description?: string | null;
  inputs?: string[];
  outputs?: string[];
  position?: { x: number; y: number };
  metadata?: Record<string, unknown>;
}

export interface FlowSpecEdge {
  id: string;
  from: string;
  to: string;
  label?: string | null;
  condition?: string | null;
}

export interface FlowSpecFlow {
  id: string;
  name: string;
  start_node?: string | null;
  nodes: FlowSpecNode[];
  edges: FlowSpecEdge[];
}

export interface FlowSpec {
  flowspec_version: '1.0';
  project: {
    title: string | null;
    title_mode: 'manual' | 'ai_generate';
    description: string;
    target?: string | null;
    notes?: string | null;
  };
  flows: FlowSpecFlow[];
}
