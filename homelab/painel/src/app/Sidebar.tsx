import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, Kbd } from '../components';
import { hora, dia, dataCompleta } from '../format';
import type { Agent, AreaId, AreaNode, Run } from '../types';
import { AREAS } from '../types';

interface Props {
  agents: Agent[];
  runs: Run[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (name: string, area: AreaId) => Promise<boolean>;
  onSearch: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  usuario: string;
  empresa: string;
}

type Estado = { tipo: 'waiting'; n: number } | { tipo: 'failed' } | { tipo: 'running' } | { tipo: 'done'; quando: string } | { tipo: 'new' };

// Prioridade: aprovação pendente > falhou > rodando > já rodou > nunca rodou.
export function estadoDoAgente(agent: Agent, runs: Run[]): Estado {
  const meus = runs.filter((r) => r.agentId === agent.id);
  const pendentes = meus.filter((r) => r.status === 'waiting').length;
  if (pendentes) return { tipo: 'waiting', n: pendentes };
  if (agent.lastStatus === 'failed') return { tipo: 'failed' };
  if (meus.some((r) => r.status === 'running')) return { tipo: 'running' };
  if (agent.lastRunAt) {
    const hoje = dia(agent.lastRunAt) === dia(new Date().toISOString());
    return { tipo: 'done', quando: hoje ? hora(agent.lastRunAt) : dataCompleta(agent.lastRunAt).slice(0, 5) };
  }
  return { tipo: 'new' };
}

function ItemAgente({ agent, runs, selected, onSelect }: { agent: Agent; runs: Run[]; selected: boolean; onSelect: () => void }) {
  const e = estadoDoAgente(agent, runs);
  return (
    <li>
      <button type="button" className={`side-item${selected ? ' is-selected' : ''}`} aria-current={selected ? 'page' : undefined} onClick={onSelect}>
        <span className={`agent-dot agent-dot-${e.tipo}`} aria-hidden="true" />
        <span className="side-item-name">{agent.name}</span>
        {e.tipo === 'waiting' && <span className="side-badge" aria-label={`${e.n} esperando você`}>{e.n}</span>}
        {e.tipo === 'failed' && <span className="side-meta side-meta-fail">falhou</span>}
        {e.tipo === 'running' && <span className="side-meta side-meta-run">rodando</span>}
        {e.tipo === 'done' && <span className="side-meta">{e.quando}</span>}
        {e.tipo === 'new' && <span className="side-meta">novo</span>}
      </button>
    </li>
  );
}

function CriarAgente({ area, nomeArea, onCreate }: { area: AreaId; nomeArea: string; onCreate: Props['onCreate'] }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState('');
  const [enviando, setEnviando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editando) campo.current?.focus(); }, [editando]);

  const cancelar = () => { setEditando(false); setNome(''); };
  const criar = async () => {
    if (!nome.trim() || enviando) return;
    setEnviando(true);
    const ok = await onCreate(nome.trim(), area);
    setEnviando(false);
    if (ok) cancelar();
    else campo.current?.focus();
  };

  if (!editando) {
    return (
      <li>
        <button type="button" className="create-slot" onClick={() => setEditando(true)}>
          <Icon name="plus" size={14} />Criar agente
        </button>
      </li>
    );
  }
  return (
    <li>
      <form className="create-form" onSubmit={(ev) => { ev.preventDefault(); criar(); }}>
        <label className="sr-only" htmlFor={`novo-${area}`}>Nome do agente em {nomeArea}</label>
        <input
          id={`novo-${area}`}
          ref={campo}
          className="create-input"
          value={nome}
          maxLength={60}
          placeholder="Nome do agente"
          onChange={(ev) => setNome(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); cancelar(); } }}
          onBlur={(ev) => { if (!nome.trim() && !ev.currentTarget.form?.contains(ev.relatedTarget as Node)) cancelar(); }}
        />
        <button type="submit" className="hm-btn hm-btn-quiet hm-btn-sm" disabled={!nome.trim() || enviando}>Criar</button>
      </form>
    </li>
  );
}

function Pasta({ node, agents, nivel, abertas, alternar, children }: {
  node: { id: string; name: string };
  agents: number;
  nivel: number;
  abertas: Set<string>;
  alternar: (id: string) => void;
  children: ReactNode;
}) {
  const aberta = abertas.has(node.id);
  return (
    <li>
      <button type="button" className="side-item side-folder" aria-expanded={aberta} aria-controls={`pasta-${node.id}`} onClick={() => alternar(node.id)}>
        <Icon name="chevron" size={14} className="folder-chevron" />
        <span className="side-item-name">{node.name}</span>
        {agents > 0 && <span className="side-meta">{agents}</span>}
      </button>
      {aberta && <ul id={`pasta-${node.id}`} className={`side-children side-level-${nivel}`}>{children}</ul>}
    </li>
  );
}

function lerAbertas(): Set<string> {
  try {
    const salvo = localStorage.getItem('hermes-pastas');
    if (salvo) return new Set(JSON.parse(salvo));
  } catch { /* sem armazenamento */ }
  return new Set(['financeiro', 'comercial', 'producao', 'pcp', 'compras']);
}

export function Sidebar({ agents, runs, selected, onSelect, onCreate, onSearch, theme, onToggleTheme, usuario, empresa }: Props) {
  const [abertas, setAbertas] = useState(lerAbertas);
  const alternar = (id: string) => setAbertas((atual) => {
    const nova = new Set(atual);
    if (nova.has(id)) nova.delete(id); else nova.add(id);
    try { localStorage.setItem('hermes-pastas', JSON.stringify([...nova])); } catch { /* sem armazenamento */ }
    return nova;
  });

  const daArea = (area: string) => agents.filter((a) => a.area === area).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const pendentes = runs.filter((r) => r.status === 'waiting').length;
  const item = (a: Agent) => <ItemAgente key={a.id} agent={a} runs={runs} selected={selected === a.id} onSelect={() => onSelect(a.id)} />;
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  const area = (node: AreaNode, nivel: number): JSX.Element => {
    if (node.children) {
      const total = node.children.reduce((s, c) => s + daArea(c.id).length, 0);
      return (
        <Pasta key={node.id} node={node} agents={total} nivel={nivel} abertas={abertas} alternar={alternar}>
          {node.children.map((c) => area(c, nivel + 1))}
        </Pasta>
      );
    }
    const lista = daArea(node.id);
    return (
      <Pasta key={node.id} node={node} agents={lista.length} nivel={nivel} abertas={abertas} alternar={alternar}>
        {lista.map(item)}
        <CriarAgente area={node.id as AreaId} nomeArea={node.name} onCreate={onCreate} />
      </Pasta>
    );
  };

  return (
    <nav className="sidebar" aria-label="Agentes">
      <div className="side-top">
        <div className="brand">
          <span className="brand-dot" aria-hidden="true" />
          <span className="brand-name">Hermes</span>
          <button type="button" className="hm-btn hm-btn-ghost hm-btn-sm theme-toggle" onClick={onToggleTheme} title="Alternar tema (T)">
            {theme === 'dark' ? 'Claro' : 'Escuro'}
          </button>
        </div>
        <button type="button" className="search-button" onClick={onSearch}>
          <Icon name="search" size={14} />
          <span>Buscar…</span>
          <Kbd>{mac ? '⌘K' : 'Ctrl K'}</Kbd>
        </button>
        <button type="button" className={`side-item side-home${selected === null ? ' is-selected' : ''}`} aria-current={selected === null ? 'page' : undefined} onClick={() => onSelect(null)}>
          <Icon name="done" size={14} />
          <span className="side-item-name">Painel do dia</span>
          {pendentes > 0 && <span className="side-badge" aria-label={`${pendentes} esperando você`}>{pendentes}</span>}
        </button>
      </div>

      <div className="side-scroll">
        <div className="side-heading">
          <span>AGENTES</span>
          <span className="side-meta">{agents.length}</span>
        </div>
        <ul className="side-list">
          {daArea('geral').map(item)}
          {AREAS.filter((a) => a.id !== 'geral').map((a) => area(a, 1))}
        </ul>
      </div>

      <div className="side-foot">
        <span className="avatar" aria-hidden="true">{usuario.charAt(0).toUpperCase()}</span>
        <span className="hm-small">{usuario}<span className="hm-faint"> · {empresa}</span></span>
      </div>
    </nav>
  );
}
