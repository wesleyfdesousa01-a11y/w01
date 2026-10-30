import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Kbd } from '../components';
import type { IconName } from '../components';

export interface Comando {
  id: string;
  label: string;
  hint?: string;
  icon: IconName;
  run: () => void;
}

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function CommandPalette({ comandos, onClose }: { comandos: Comando[]; onClose: () => void }) {
  const [busca, setBusca] = useState('');
  const [ativo, setAtivo] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useMemo(() => {
    const q = normalizar(busca.trim());
    return q ? comandos.filter((c) => normalizar(`${c.label} ${c.hint || ''}`).includes(q)) : comandos;
  }, [busca, comandos]);

  useEffect(() => { campo.current?.focus(); }, []);
  useEffect(() => { setAtivo(0); }, [busca]);

  const executar = (c?: Comando) => {
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <div className="scrim scrim-top" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Buscar">
        <div className="palette-input">
          <Icon name="search" />
          <input
            ref={campo}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-lista"
            aria-activedescendant={lista[ativo] ? `cmd-${lista[ativo].id}` : undefined}
            placeholder="Buscar agente, modelo ou ação…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((i) => Math.min(i + 1, lista.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); executar(lista[ativo]); }
              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
            }}
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul className="palette-list" id="palette-lista" role="listbox" aria-label="Resultados">
          {lista.length === 0 && <li className="palette-empty">Nada encontrado.</li>}
          {lista.map((c, i) => (
            <li
              key={c.id}
              id={`cmd-${c.id}`}
              role="option"
              aria-selected={i === ativo}
              className="palette-item"
              onMouseEnter={() => setAtivo(i)}
              onMouseDown={(e) => { e.preventDefault(); executar(c); }}
            >
              <Icon name={c.icon} size={14} />
              <span className="palette-label">{c.label}</span>
              {c.hint && <span className="palette-hint">{c.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
