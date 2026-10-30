import type { RunStatus } from '../types';
import { Icon } from './Icon';
import { ROTULO } from './StatusPill';

export interface Step {
  label: string;
  status: RunStatus;
  time?: string;
  detail?: string;
}

export function StepTimeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="hm-timeline">
      {steps.map((s, i) => (
        <li key={i} className={`hm-step hm-step-${s.status}`}>
          <span className="hm-step-icon" title={ROTULO[s.status]}>
            <Icon name={s.status} title={ROTULO[s.status]} />
          </span>
          <div className="hm-step-body">
            <div className="hm-step-row">
              <span className="hm-step-label">{s.label}</span>
              {s.time && <span className="hm-time">{s.time}</span>}
            </div>
            {s.detail && <div className="hm-step-detail">{s.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
