import { ApprovalPrompt, Button, Icon, MetricTile, RunCard, SectionHeader, StatusPill } from '../components';
import { dataPorExtenso, hora, relativo } from '../format';
import type { Agent, Run } from '../types';
import { caminhoDaArea } from '../types';

interface Props {
  agents: Agent[];
  runs: Run[];
  agent: Agent | null;
  atualizado: string | null;
  ocupado: Set<string>;
  onApprove: (run: Run) => void;
  onReject: (run: Run) => void;
  onRetry: (run: Run) => void;
  onHome: () => void;
  onOpenLeft: () => void;
  onOpenRight: () => void;
  onOpenTemplates: () => void;
}

const porInicio = (a: Run, b: Run) => a.startedAt.localeCompare(b.startedAt);
const porFim = (a: Run, b: Run) => (a.finishedAt || a.startedAt).localeCompare(b.finishedAt || b.startedAt);

function passo(run: Run): string | undefined {
  if (run.status === 'failed') return run.error || 'Falhou sem motivo informado';
  if (run.step && run.steps) return `Passo ${run.step} de ${run.steps}${run.stepLabel ? ` · ${run.stepLabel}` : ''}`;
  return run.stepLabel;
}

export function DayPanel({ agents, runs, agent, atualizado, ocupado, onApprove, onReject, onRetry, onHome, onOpenLeft, onOpenRight, onOpenTemplates }: Props) {
  const nome = (id: string) => agents.find((a) => a.id === id)?.name || id;
  const aguardando = runs.filter((r) => r.status === 'waiting').sort(porInicio);
  const falhas = runs.filter((r) => r.status === 'failed').sort(porInicio);
  const rodando = runs.filter((r) => r.status === 'running' || r.status === 'paused').sort(porInicio);
  const concluidos = runs.filter((r) => r.status === 'done').sort(porFim);
  const agendados = runs.filter((r) => r.status === 'scheduled').sort(porInicio);
  const feitas = concluidos.length + falhas.length;
  const ativos = new Set(runs.filter((r) => r.status !== 'scheduled').map((r) => r.agentId)).size;
  const titulo = agent ? agent.name : dataPorExtenso();

  return (
    <main className="center" aria-labelledby="titulo-painel">
      <div className="center-inner">
        <div className="center-bar">
          <button type="button" className="hm-btn hm-btn-ghost hm-btn-sm only-narrow" onClick={onOpenLeft} aria-label="Abrir agentes">
            <Icon name="menu" />Agentes
          </button>
          <button type="button" className="hm-btn hm-btn-ghost hm-btn-sm only-medium" onClick={onOpenRight}>
            <Icon name="panel" />Modelos .md
          </button>
        </div>

        <header className="day-header">
          <div className="day-header-text">
            <nav className="breadcrumb" aria-label="Você está em">
              {agent ? (
                <>
                  <button type="button" className="crumb-link" onClick={onHome}>Painel do dia</button>
                  {caminhoDaArea(agent.area).map((p) => <span key={p}> › {p}</span>)}
                  <span> › {agent.name}</span>
                </>
              ) : <span>Painel do dia</span>}
            </nav>
            <h1 className="hm-display day-title" id="titulo-painel">{titulo}</h1>
          </div>
          {atualizado && <span className="hm-time day-updated">atualizado {hora(atualizado)}</span>}
        </header>

        <section className="hm-metrics" aria-label="Resumo do dia">
          <MetricTile label="Execuções hoje" value={<>{feitas}<span className="metric-total">/{runs.length}</span></>} hint="feitas / planejadas" />
          <MetricTile label="Aguardando você" value={aguardando.length} tone={aguardando.length ? 'waiting' : undefined} />
          <MetricTile label="Falhas" value={falhas.length} tone={falhas.length ? 'failed' : undefined} />
          <MetricTile label="Agentes ativos" value={agent ? (ativos ? 1 : 0) : ativos} hint={agent ? undefined : `de ${agents.length}`} />
        </section>

        {agent && runs.length === 0 ? (
          <section className="zone" aria-labelledby="zona-vazia">
            <SectionHeader id="zona-vazia" title="Ainda sem execuções" />
            <div className="hm-card empty-guide">
              <p className="hm-body">{agent.name} ainda não rodou.</p>
              <ol className="hm-small hm-muted guide-steps">
                <li>Vincule um modelo .md a este agente, em Modelos .md, campo “Usado por”.</li>
                <li>Defina quando ele roda (agenda do executor).</li>
                <li>A primeira execução aparece aqui, em Em andamento.</li>
              </ol>
              <div><Button variant="quiet" size="sm" onClick={onOpenTemplates}>Abrir Modelos .md</Button></div>
            </div>
          </section>
        ) : (
          <>
            <section className="zone" aria-labelledby="zona-voce">
              <SectionHeader id="zona-voce" title="Precisa de você" count={aguardando.length + falhas.length} tone="waiting" />
              {aguardando.length + falhas.length === 0 ? (
                <p className="zone-empty">Nada esperando você.</p>
              ) : (
                <div className="stack">
                  {aguardando.map((r, i) => (
                    <ApprovalPrompt
                      key={r.id}
                      title={r.approval?.question || r.title}
                      agent={nome(r.agentId)}
                      detail={r.approval?.detail || r.stepLabel || ''}
                      context={r.approval?.context}
                      since={relativo(r.startedAt)}
                      approveLabel={r.approval?.approveLabel}
                      rejectLabel={r.approval?.rejectLabel}
                      shortcuts={i === 0}
                      busy={ocupado.has(r.id)}
                      onApprove={() => onApprove(r)}
                      onReject={() => onReject(r)}
                    />
                  ))}
                  {falhas.map((r) => (
                    <RunCard key={r.id} title={r.title} status="failed" agent={nome(r.agentId)} step={passo(r)} time={hora(r.finishedAt || r.startedAt)}>
                      <Button variant="quiet" size="sm" disabled={ocupado.has(r.id)} onClick={() => onRetry(r)}>
                        <Icon name="retry" size={14} />Tentar de novo
                      </Button>
                    </RunCard>
                  ))}
                </div>
              )}
            </section>

            <section className="zone" aria-labelledby="zona-rodando">
              <SectionHeader id="zona-rodando" title="Em andamento" count={rodando.length} tone="running" />
              {rodando.length === 0 ? (
                <p className="zone-empty">Nada rodando agora.</p>
              ) : (
                <div className="run-grid">
                  {rodando.map((r) => (
                    <RunCard key={r.id} title={r.title} status={r.status} agent={nome(r.agentId)} step={passo(r)} time={hora(r.startedAt)} progress={r.progress} />
                  ))}
                </div>
              )}
            </section>

            <section className="zone" aria-labelledby="zona-feito">
              <SectionHeader id="zona-feito" title="Concluído hoje" count={concluidos.length} />
              {concluidos.length === 0 && agendados.length === 0 ? (
                <p className="zone-empty">Nada concluído ainda hoje.</p>
              ) : (
                <ul className="done-list">
                  {concluidos.map((r) => (
                    <li key={r.id} className="done-row">
                      <StatusPill status="done" label="" />
                      <span className="done-title">{r.title}<span className="hm-faint"> · {nome(r.agentId)}</span></span>
                      <span className="hm-time">{hora(r.finishedAt || r.startedAt)}</span>
                    </li>
                  ))}
                  {agendados.map((r) => (
                    <li key={r.id} className="done-row is-scheduled">
                      <StatusPill status="scheduled" label="" />
                      <span className="done-title">{r.title}<span className="hm-faint"> · {nome(r.agentId)}</span></span>
                      <span className="hm-time">{hora(r.startedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
