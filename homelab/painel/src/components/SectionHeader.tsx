import type { ReactNode } from 'react';

interface Props {
  title: string;
  count?: number;
  tone?: 'waiting' | 'running';
  action?: ReactNode;
  id?: string;
}

// O ponto limão no contador só aparece em "waiting" com algo pendente.
export function SectionHeader({ title, count, tone, action, id }: Props) {
  return (
    <div className="hm-section-header">
      <h2 className="hm-title" id={id}>{title}</h2>
      {count !== undefined && (
        <span className={`hm-count${tone === 'waiting' && count > 0 ? ' hm-count-waiting' : ''}`}>
          {tone === 'waiting' && count > 0 && <span className="hm-dot" aria-hidden="true" />}
          {count}
        </span>
      )}
      {action && <div className="hm-section-action">{action}</div>}
    </div>
  );
}
