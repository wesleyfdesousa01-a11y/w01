import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Icon, Kbd, StepTimeline } from '../components';
import type { Step } from '../components';
import { contarCampos, hora, relativo } from '../format';
import type { Agent, AreaId, Run, Template } from '../types';
import { AREA_NOME, caminhoDaArea } from '../types';

export type Aba = 'modelos' | 'linha';
type Filtro = 'todas' | 'geral' | 'financeiro' | 'comercial' | 'producao';

interface Props {
  aba: Aba;
  onAba: (a: Aba) => void;
  agents: Agent[];
  runs: Run[];
  templates: Template[];
  destino: AreaId;
  filtro: Filtro;
  onFiltro: (f: Filtro) => void;
  aberto: string | null;
  onAbrir: (id: string | null) => void;
  onUpload: (arquivos: File[]) => void;
  onVincular: (t: Template, agentId: string | null) => void;
  onRemover: (t: Template) => void;
  onFechar?: () => void;
}

const FILTROS: { id: Filtro; nome: string }[] = [
  { id: 'todas', nome: 'Todas' },
  { id: 'geral', nome: 'Geral' },
  { id: 'financeiro', nome: 'Financeiro' },
  { id: 'comercial', nome: 'Comercial' },
  { id: 'producao', nome: 'Produção' },
];

export function noFiltro(t: Template, f: Filtro) {
  if (f === 'todas') return true;
  if (f === 'producao') return t.area === 'pcp' || t.area === 'compras';
  return t.area === f;
}

export function eMarkdown(f: File) {
  return /\.(md|markdown)$/i.test(f.name) || f.type === 'text/markdown';
}

function Presenca({ t, agents }: { t: Template; agents: Agent[] }) {
  const p = t.presence;
  const quem = p.by === 'você' ? 'Você' : p.by;
  if (p.state === 'using') {
    return <span className="presence presence-using"><Icon name="running" size={14} />{quem} está usando agora</span>;
  }
  if (p.state === 'editing') {
    return <span className="presence presence-editing"><span className="hm-dot" aria-hidden="true" />{quem} editando · {relativo(p.at)}</span>;
  }
  const agente = agents.find((a) => a.id === t.agentId);
  const por = p.by === 'você' ? 'você' : p.by;
  return <span className="presence">{agente ? `Agente ${agente.name}` : 'Sem agente'} · editado por {por} {relativo(p.at)}</span>;
}

function IconeMd() {
  return (
    <span className="md-icon" aria-hidden="true">
      <Icon name="doc" size={20} />
      <span>md</span>
    </span>
  );
}

// Prévia sanitizada; os campos {{ }} ganham destaque percorrendo os nós de texto.
function Previa({ conteudo }: { conteudo: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(conteudo, { async: false }) as string), [conteudo]);
  useEffect(() => {
    const raiz = ref.current;
    if (!raiz) return;
    const andador = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    const nos: Text[] = [];
    while (andador.nextNode()) nos.push(andador.currentNode as Text);
    for (const no of nos) {
      const partes = no.data.split(/(\{\{\s*[a-z0-9_]+\s*\}\})/g);
      if (partes.length < 2) continue;
      const frag = document.createDocumentFragment();
      partes.forEach((p, i) => {
        if (i % 2) {
          const m = document.createElement('mark');
          m.className = 'md-field';
          m.textContent = p;
          frag.append(m);
        } else if (p) frag.append(p);
      });
      no.replaceWith(frag);
    }
  }, [html]);
  return <div ref={ref} className="md-preview" dangerouslySetInnerHTML={{ __html: html }} />;
}

function Detalhe({ t, agents, onVoltar, onVincular, onRemover }: { t: Template; agents: Agent[]; onVoltar: () => void; onVincular: Props['onVincular']; onRemover: Props['onRemover'] }) {
  const [confirmar, setConfirmar] = useState(false);
  const linhas = t.content.split('\n').length;
  const campos = contarCampos(t.content);
  const baixar = () => {
    const url = URL.createObjectURL(new Blob([t.content], { type: 'text/markdown;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: t.name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="tpl-detail">
      <button type="button" className="back-link" onClick={onVoltar}><Icon name="chevron-left" size={14} />Modelos</button>
      <h2 className="tpl-detail-name">{t.name}</h2>
      <Presenca t={t} agents={agents} />
      <dl className="props">
        <dt>Área</dt>
        <dd>{caminhoDaArea(t.area).join(' › ')}</dd>
        <dt><label htmlFor="usado-por">Usado por</label></dt>
        <dd>
          <select id="usado-por" className="select" value={t.agentId || ''} onChange={(e) => onVincular(t, e.target.value || null)}>
            <option value="">Nenhum agente</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name} · {AREA_NOME[a.area]}</option>)}
          </select>
        </dd>
        <dt>Tamanho</dt>
        <dd className="hm-code">{linhas} {linhas === 1 ? 'linha' : 'linhas'} · {campos} {campos === 1 ? 'campo' : 'campos'} {'{{ }}'}</dd>
      </dl>
      <div className="tpl-actions">
        <Button variant="quiet" size="sm" onClick={baixar}><Icon name="download" size={14} />Baixar .md</Button>
        {confirmar ? (
          <>
            <Button variant="danger" size="sm" onClick={() => onRemover(t)}>Confirmar remoção</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmar(false)}>Cancelar</Button>
          </>
        ) : (
          <Button variant="danger" size="sm" onClick={() => setConfirmar(true)}>Remover</Button>
        )}
      </div>
      <Previa conteudo={t.content} />
    </div>
  );
}

const ORDEM: Run['status'][] = ['done', 'failed', 'waiting', 'running', 'paused', 'scheduled'];

export function passosDoDia(runs: Run[], agents: Agent[]): Step[] {
  const nome = (id: string) => agents.find((a) => a.id === id)?.name || id;
  return [...runs]
    .sort((a, b) => ORDEM.indexOf(a.status) - ORDEM.indexOf(b.status) || (a.finishedAt || a.startedAt).localeCompare(b.finishedAt || b.startedAt))
    .map((r) => ({
      label: r.title,
      status: r.status,
      time: hora(r.status === 'done' || r.status === 'failed' ? r.finishedAt || r.startedAt : r.startedAt),
      detail: r.status === 'failed' ? `${nome(r.agentId)} · ${r.error || 'falhou'}` : nome(r.agentId),
    }));
}

export function RightPanel(p: Props) {
  const [arrastando, setArrastando] = useState(false);
  const escolher = useRef<HTMLInputElement>(null);
  const lista = p.templates.filter((t) => noFiltro(t, p.filtro)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const atual = p.templates.find((t) => t.id === p.aberto) || null;
  const passos = passosDoDia(p.runs, p.agents);
  const destinoNome = caminhoDaArea(p.destino).join(' › ');

  const soltar = (arquivos: FileList | null) => {
    setArrastando(false);
    if (arquivos?.length) p.onUpload([...arquivos]);
  };

  return (
    <aside className="right" aria-label="Modelos e linha do dia">
      <div className="tabs" role="tablist" aria-label="Painel direito">
        <button type="button" role="tab" id="aba-modelos" aria-selected={p.aba === 'modelos'} aria-controls="painel-modelos" className="tab" onClick={() => p.onAba('modelos')}>
          Modelos .md <span className="tab-count">({p.templates.length})</span>
        </button>
        <button type="button" role="tab" id="aba-linha" aria-selected={p.aba === 'linha'} aria-controls="painel-linha" className="tab" onClick={() => p.onAba('linha')}>
          Linha do dia
        </button>
        {p.onFechar && (
          <button type="button" className="hm-btn hm-btn-ghost hm-btn-sm drawer-close" onClick={p.onFechar} aria-label="Fechar painel">
            <Icon name="close" />
          </button>
        )}
      </div>

      {p.aba === 'modelos' ? (
        <div className="right-body" role="tabpanel" id="painel-modelos" aria-labelledby="aba-modelos">
          {atual ? (
            <Detalhe t={atual} agents={p.agents} onVoltar={() => p.onAbrir(null)} onVincular={p.onVincular} onRemover={p.onRemover} />
          ) : (
            <>
              <button
                type="button"
                className={`dropzone${arrastando ? ' is-over' : ''}`}
                onClick={() => escolher.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => { e.preventDefault(); soltar(e.dataTransfer.files); }}
              >
                <Icon name="upload" />
                <span className="hm-small">Solte arquivos .md aqui ou clique para escolher</span>
                <span className="hm-label">Vão para {destinoNome}</span>
              </button>
              <input ref={escolher} type="file" accept=".md,.markdown,text/markdown" multiple hidden onChange={(e) => { soltar(e.target.files); e.target.value = ''; }} />

              <div className="chips" role="group" aria-label="Filtrar por área">
                {FILTROS.map((f) => (
                  <button key={f.id} type="button" className="chip" aria-pressed={p.filtro === f.id} onClick={() => p.onFiltro(f.id)}>{f.nome}</button>
                ))}
              </div>

              {lista.length === 0 ? (
                <p className="zone-empty">{p.templates.length ? 'Nenhum modelo nesta área.' : 'Nenhum modelo ainda. Solte o primeiro .md acima.'}</p>
              ) : (
                <ul className="tpl-list">
                  {lista.map((t) => (
                    <li key={t.id}>
                      <button type="button" className="tpl-row" onClick={() => p.onAbrir(t.id)}>
                        <IconeMd />
                        <span className="tpl-text">
                          <span className="tpl-name">{t.name}</span>
                          <Presenca t={t} agents={p.agents} />
                          <span className="tpl-area">{caminhoDaArea(t.area).join(' › ')}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="right-body" role="tabpanel" id="painel-linha" aria-labelledby="aba-linha">
          {passos.length ? <StepTimeline steps={passos} /> : <p className="zone-empty">Nada aconteceu hoje ainda.</p>}
          <div className="legend">
            <span><Kbd>A</Kbd> aprovar</span>
            <span><Kbd>R</Kbd> recusar</span>
            <span><Kbd>T</Kbd> tema</span>
            <span><Kbd>⌘K</Kbd> buscar</span>
            <span><Kbd>Esc</Kbd> fechar</span>
          </div>
        </div>
      )}
    </aside>
  );
}

export type { Filtro };
