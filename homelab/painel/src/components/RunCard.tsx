import type { ReactNode } from 'react';
import type { RunStatus } from '../types';
import { StatusPill } from './StatusPill';

interface Props {
  title: string;
  status: RunStatus;
  agent: string;
  step?: string;
  time?: string;
  progress?: number;
  children?: ReactNode;
}

// Falha: contorno "fail" e o motivo em "step". Barra de progresso de 2 px.
export function RunCard({ title, status, agent, step, time, progress, children }: Props) {
  return (
    <article className={`hm-card hm-run hm-run-${status}`}>
      <div className="hm-run-top">
        <StatusPill status={status} />
        {time && <span className="hm-time">{time}</span>}
      </div>
      <h3 className="hm-heading">{title}</h3>
      <p className="hm-small hm-run-meta">
        {agent}
        {step && <> · <span className={status === 'failed' ? 'hm-fail-text' : undefined}>{step}</span></>}
      </p>
      {status === 'running' && progress !== undefined && (
        <div className="hm-progress" role="progressbar" aria-label={`Progresso de ${title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="hm-progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {children && <div className="hm-run-actions">{children}</div>}
    </article>
  );
}
