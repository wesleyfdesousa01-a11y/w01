import type { Agent, AreaId, Run, Template } from './types';

async function pedir<T>(metodo: string, rota: string, corpo?: unknown): Promise<T> {
  const res = await fetch(`/api${rota}`, {
    method: metodo,
    headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (res.status === 204) return undefined as T;
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(dados.erro || `Erro ${res.status}`);
  return dados as T;
}

export const api = {
  agentes: () => pedir<Agent[]>('GET', '/agents'),
  criarAgente: (name: string, area: AreaId) => pedir<Agent>('POST', '/agents', { name, area }),
  runsDeHoje: () => pedir<Run[]>('GET', '/runs?date=hoje'),
  aprovar: (id: string) => pedir<Run>('POST', `/runs/${encodeURIComponent(id)}/approve`),
  recusar: (id: string) => pedir<Run>('POST', `/runs/${encodeURIComponent(id)}/reject`),
  tentarDeNovo: (id: string) => pedir<Run>('POST', `/runs/${encodeURIComponent(id)}/retry`),
  modelos: () => pedir<Template[]>('GET', '/templates'),
  enviarModelo: (t: { name: string; area: AreaId; content: string; agentId?: string | null }) => pedir<Template>('POST', '/templates', t),
  atualizarModelo: (id: string, mudancas: { agentId?: string | null; area?: AreaId }) => pedir<Template>('PATCH', `/templates/${id}`, mudancas),
  removerModelo: (id: string) => pedir<void>('DELETE', `/templates/${id}`),
};

export type Evento =
  | { type: 'run.created' | 'run.updated'; run: Run }
  | { type: 'run.removed'; id: string }
  | { type: 'agents.updated'; agents: Agent[] }
  | { type: 'template.updated'; template: Template }
  | { type: 'template.removed'; id: string }
  | { type: 'template.presence'; id: string; presence: Template['presence'] };

// Reconecta sozinho (1 s, 2 s, 4 s… até 30 s). "aberto" avisa para recarregar tudo.
export function ouvirEventos(aoReceber: (e: Evento) => void, aberto: () => void): () => void {
  let ws: WebSocket | null = null;
  let espera = 1000;
  let parado = false;
  let timer: number | undefined;
  const conectar = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/events`);
    ws.onopen = () => { espera = 1000; aberto(); };
    ws.onmessage = (m) => { try { aoReceber(JSON.parse(m.data)); } catch { /* ignora mensagem quebrada */ } };
    ws.onclose = () => {
      if (parado) return;
      timer = window.setTimeout(conectar, espera);
      espera = Math.min(espera * 2, 30000);
    };
  };
  conectar();
  return () => { parado = true; clearTimeout(timer); ws?.close(); };
}
