import type { RunStatus } from '../types';
import { Icon } from './Icon';

export const ROTULO: Record<RunStatus, string> = {
  waiting: 'Aguardando você',
  running: 'Rodando',
  failed: 'Falhou',
  done: 'Concluído',
  scheduled: 'Agendado',
  paused: 'Pausado',
};

// Estado = ícone + palavra + cor. Sem fundo. label="" é para listas compactas, onde a
// coluna inteira tem o mesmo estado: a palavra fica só para leitor de tela.
export function StatusPill({ status, label }: { status: RunStatus; label?: string }) {
  return (
    <span className={`hm-pill hm-pill-${status}`}>
      <Icon name={status} />
      {label === '' ? <span className="sr-only">{ROTULO[status]}</span> : label ?? ROTULO[status]}
    </span>
  );
}
