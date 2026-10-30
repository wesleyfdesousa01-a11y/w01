import { Button } from './Button';
import { Icon } from './Icon';

interface Props {
  title: string;
  agent: string;
  detail: string;
  context?: string;
  since?: string;
  approveLabel?: string;
  rejectLabel?: string;
  onApprove: () => void;
  onReject: () => void;
  onDetails?: () => void;
  shortcuts?: boolean;
  busy?: boolean;
}

// "title" é a pergunta-ação ("Remarcar a reunião das 15h?"); "context" é o dado exato, em mono.
export function ApprovalPrompt({ title, agent, detail, context, since, approveLabel = 'Aprovar', rejectLabel = 'Recusar', onApprove, onReject, onDetails, shortcuts, busy }: Props) {
  return (
    <article className="hm-approval" aria-busy={busy || undefined}>
      <div className="hm-approval-top">
        <span className="hm-pill hm-pill-waiting"><Icon name="waiting" />Aguardando você</span>
        <span className="hm-small hm-muted">{agent}</span>
        {since && <span className="hm-time">{since}</span>}
      </div>
      <h3 className="hm-heading">{title}</h3>
      <p className="hm-body hm-muted">{detail}</p>
      {context && <pre className="hm-context">{context}</pre>}
      <div className="hm-approval-actions">
        <Button variant="primary" onClick={onApprove} disabled={busy} kbd={shortcuts ? 'A' : undefined}>{approveLabel}</Button>
        <Button variant="quiet" onClick={onReject} disabled={busy} kbd={shortcuts ? 'R' : undefined}>{rejectLabel}</Button>
        {onDetails && <Button variant="ghost" onClick={onDetails}>Detalhes</Button>}
      </div>
    </article>
  );
}
