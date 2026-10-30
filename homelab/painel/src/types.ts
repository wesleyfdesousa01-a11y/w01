export type AreaId = 'geral' | 'financeiro' | 'comercial' | 'pcp' | 'compras';
export type RunStatus = 'waiting' | 'running' | 'done' | 'failed' | 'scheduled' | 'paused';

export interface Agent {
  id: string;
  name: string;
  area: AreaId;
  createdAt: string;
  templateIds?: string[];
  schedule?: string;
  lastRunAt?: string | null;
  lastStatus?: RunStatus | null;
}

export interface Approval {
  question: string;
  detail: string;
  context?: string;
  approveLabel?: string;
  rejectLabel?: string;
}

export interface Run {
  id: string;
  agentId: string;
  title: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  step?: number;
  steps?: number;
  stepLabel?: string;
  progress?: number;
  error?: string;
  approval?: Approval;
}

export interface Presence {
  state: 'using' | 'editing' | 'idle';
  by: string;
  at: string;
}

export interface Template {
  id: string;
  name: string;
  area: AreaId;
  agentId: string | null;
  content: string;
  presence: Presence;
  updatedAt: string;
}

export interface AreaNode {
  id: AreaId | 'producao';
  name: string;
  children?: { id: AreaId; name: string }[];
}

// Áreas fixas nesta versão (não editáveis pela interface).
export const AREAS: AreaNode[] = [
  { id: 'geral', name: 'Geral' },
  { id: 'financeiro', name: 'Financeiro' },
  { id: 'comercial', name: 'Comercial' },
  { id: 'producao', name: 'Produção', children: [
    { id: 'pcp', name: 'PCP' },
    { id: 'compras', name: 'Compras' },
  ] },
];

export const AREA_NOME: Record<AreaId, string> = {
  geral: 'Geral', financeiro: 'Financeiro', comercial: 'Comercial', pcp: 'PCP', compras: 'Compras',
};

export function caminhoDaArea(area: AreaId): string[] {
  return area === 'pcp' || area === 'compras' ? ['Produção', AREA_NOME[area]] : [AREA_NOME[area]];
}
