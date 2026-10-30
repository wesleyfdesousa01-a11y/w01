import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'waiting' | 'failed';
}

// Sempre dentro de .hm-metrics.
export function MetricTile({ label, value, hint, tone }: Props) {
  return (
    <div className={`hm-metric${tone ? ` hm-metric-${tone}` : ''}`}>
      <div className="hm-label">{label}</div>
      <div className="hm-metric-value">{value}</div>
      {hint && <div className="hm-metric-hint">{hint}</div>}
    </div>
  );
}
