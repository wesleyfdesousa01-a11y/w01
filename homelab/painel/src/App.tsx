import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { api, ouvirEventos, type Evento } from './api';
import { CommandPalette, type Comando } from './app/CommandPalette';
import { DayPanel } from './app/DayPanel';
import { eMarkdown, RightPanel, type Aba, type Filtro } from './app/RightPanel';
import { Sidebar } from './app/Sidebar';
import { Toast } from './app/Toast';
import type { Agent, AreaId, Run, Template } from './types';
import { AREA_NOME, caminhoDaArea } from './types';

type Tema = 'dark' | 'light';

const USUARIO = import.meta.env.VITE_USUARIO || 'Wesley';
const EMPRESA = import.meta.env.VITE_EMPRESA || 'Grupo Prado';

function useLargura(consulta: string) {
  const [bate, setBate] = useState(() => window.matchMedia(consulta).matches);
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const mudar = () => setBate(mq.matches);
    mq.addEventListener('change', mudar);
    return () => mq.removeEventListener('change', mudar);
  }, [consulta]);
  return bate;
}

// Gaveta fechada sai da ordem do Tab e do leitor de tela.
function useInert(ref: RefObject<HTMLElement>, inerte: boolean) {
  useEffect(() => {
    if (!ref.current) return;
    if (inerte) ref.current.setAttribute('inert', '');
    else ref.current.removeAttribute('inert');
  }, [ref, inerte]);
}

function digitando(alvo: EventTarget | null) {
  const el = alvo as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)));
}

function lerTema(): Tema {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function trocar<T extends { id: string }>(lista: T[], item: T): T[] {
  return lista.some((x) => x.id === item.id) ? lista.map((x) => (x.id === item.id ? item : x)) : [...lista, item];
}

export function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [atualizado, setAtualizado] = useState<string | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [tema, setTema] = useState<Tema>(lerTema);
  const [aba, setAba] = useState<Aba>('modelos');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [modeloAberto, setModeloAberto] = useState<string | null>(null);
  const [esquerdaAberta, setEsquerdaAberta] = useState(false);
  const [direitaAberta, setDireitaAberta] = useState(false);
  const [paleta, setPaleta] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<Set<string>>(new Set());
  const timerToast = useRef<number>();
  const refEsquerda = useRef<HTMLDivElement>(null);
  const refDireita = useRef<HTMLDivElement>(null);

  const direitaGaveta = useLargura('(max-width: 1179px)');
  const esquerdaGaveta = useLargura('(max-width: 779px)');
  useInert(refEsquerda, esquerdaGaveta && !esquerdaAberta);
  useInert(refDireita, direitaGaveta && !direitaAberta);

  const avisar = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(timerToast.current);
    timerToast.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  const carregar = useCallback(async () => {
    try {
      const [a, r, t] = await Promise.all([api.agentes(), api.runsDeHoje(), api.modelos()]);
      setAgents(a);
      setRuns(r);
      setTemplates(t);
      setAtualizado(new Date().toISOString());
      setErroCarga(null);
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : 'Sem conexão com o servidor');
    }
  }, []);

  useEffect(() => {
    const aoReceber = (e: Evento) => {
      setAtualizado(new Date().toISOString());
      if (e.type === 'run.created' || e.type === 'run.updated') setRuns((l) => trocar(l, e.run));
      else if (e.type === 'run.removed') setRuns((l) => l.filter((r) => r.id !== e.id));
      else if (e.type === 'agents.updated') setAgents(e.agents);
      else if (e.type === 'template.updated') setTemplates((l) => trocar(l, e.template));
      else if (e.type === 'template.removed') setTemplates((l) => l.filter((t) => t.id !== e.id));
      else if (e.type === 'template.presence') setTemplates((l) => l.map((t) => (t.id === e.id ? { ...t, presence: e.presence } : t)));
    };
    // "run.created" chega para execuções de qualquer data; recarregar ao reconectar mantém o filtro de hoje.
    return ouvirEventos(aoReceber, carregar);
  }, [carregar]);

  useEffect(() => {
    document.documentElement.dataset.theme = tema;
    try { localStorage.setItem('hermes-tema', tema); } catch { /* sem armazenamento */ }
  }, [tema]);

  const agente = agents.find((a) => a.id === selecionado) || null;
  const runsVisiveis = useMemo(() => (agente ? runs.filter((r) => r.agentId === agente.id) : runs), [runs, agente]);
  const destino: AreaId = agente ? agente.area : filtro === 'producao' ? 'pcp' : filtro === 'todas' ? 'geral' : filtro;
  const fila = useMemo(() => runsVisiveis.filter((r) => r.status === 'waiting').sort((a, b) => a.startedAt.localeCompare(b.startedAt)), [runsVisiveis]);

  const marcar = (id: string, ligado: boolean) => setOcupado((s) => {
    const n = new Set(s);
    if (ligado) n.add(id); else n.delete(id);
    return n;
  });

  const decidir = useCallback(async (run: Run, acao: 'aprovar' | 'recusar' | 'tentarDeNovo') => {
    if (ocupado.has(run.id)) return;
    marcar(run.id, true);
    try {
      const novo = await api[acao](run.id);
      if (novo?.status) setRuns((l) => trocar(l, novo));
      const rotulo = acao === 'aprovar' ? run.approval?.approveLabel || 'Aprovar' : acao === 'recusar' ? run.approval?.rejectLabel || 'Recusar' : 'Tentar de novo';
      avisar(acao === 'recusar' ? `${rotulo} — feito. O Hermes não vai seguir com isso.` : `${rotulo} — feito. O Hermes seguiu com a tarefa.`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não deu certo. Tente de novo.');
    } finally {
      marcar(run.id, false);
    }
  }, [ocupado, avisar]);

  const criarAgente = useCallback(async (nome: string, area: AreaId) => {
    try {
      const novo = await api.criarAgente(nome, area);
      setAgents((l) => trocar(l, { ...novo, lastRunAt: null, lastStatus: null }));
      setSelecionado(novo.id);
      avisar(`Agente "${novo.name}" criado em ${caminhoDaArea(area).join(' › ')}.`);
      return true;
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui criar o agente.');
      return false;
    }
  }, [avisar]);

  const enviarModelos = useCallback(async (arquivos: File[]) => {
    const validos = arquivos.filter(eMarkdown);
    const ignorados = arquivos.length - validos.length;
    let enviados = 0;
    let substituidos = 0;
    for (const f of validos) {
      try {
        const existia = templates.some((t) => t.name === f.name);
        const t = await api.enviarModelo({ name: f.name, area: destino, content: await f.text() });
        setTemplates((l) => trocar(l, t));
        if (existia) substituidos += 1; else enviados += 1;
      } catch (e) {
        avisar(`${f.name}: ${e instanceof Error ? e.message : 'não enviado'}`);
        return;
      }
    }
    const partes = [];
    if (enviados) partes.push(`${enviados} ${enviados === 1 ? 'modelo enviado' : 'modelos enviados'} para ${caminhoDaArea(destino).join(' › ')}`);
    if (substituidos) partes.push(`${substituidos} ${substituidos === 1 ? 'substituído' : 'substituídos'}`);
    if (ignorados) partes.push(`${ignorados} ignorado${ignorados === 1 ? '' : 's'} (só .md)`);
    avisar(`${partes.join(' · ')}.`);
  }, [templates, destino, avisar]);

  const vincular = useCallback(async (t: Template, agentId: string | null) => {
    try {
      const novo = await api.atualizarModelo(t.id, { agentId });
      setTemplates((l) => trocar(l, novo));
      const nome = agents.find((a) => a.id === agentId)?.name;
      avisar(nome ? `${t.name} agora é usado por ${nome}.` : `${t.name} sem agente.`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui vincular.');
    }
  }, [agents, avisar]);

  const remover = useCallback(async (t: Template) => {
    try {
      await api.removerModelo(t.id);
      setTemplates((l) => l.filter((x) => x.id !== t.id));
      setModeloAberto(null);
      avisar(`${t.name} removido.`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui remover.');
    }
  }, [avisar]);

  const selecionar = useCallback((id: string | null) => {
    setSelecionado(id);
    setEsquerdaAberta(false);
  }, []);

  const abrirModelos = useCallback(() => {
    setAba('modelos');
    setModeloAberto(null);
    if (direitaGaveta) setDireitaAberta(true);
  }, [direitaGaveta]);

  const alternarTema = useCallback(() => setTema((t) => (t === 'dark' ? 'light' : 'dark')), []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaleta((p) => !p);
        return;
      }
      if (e.key === 'Escape') {
        if (paleta) setPaleta(false);
        else if (esquerdaAberta || direitaAberta) { setEsquerdaAberta(false); setDireitaAberta(false); }
        else if (modeloAberto) setModeloAberto(null);
        return;
      }
      if (paleta || e.metaKey || e.ctrlKey || e.altKey || digitando(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 't') alternarTema();
      else if (k === 'a' && fila[0]) decidir(fila[0], 'aprovar');
      else if (k === 'r' && fila[0]) decidir(fila[0], 'recusar');
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [paleta, esquerdaAberta, direitaAberta, modeloAberto, fila, decidir, alternarTema]);

  const comandos: Comando[] = useMemo(() => [
    { id: 'home', label: 'Painel do dia', icon: 'done', run: () => selecionar(null) },
    ...agents.map((a): Comando => ({ id: `ag-${a.id}`, label: a.name, hint: caminhoDaArea(a.area).join(' › '), icon: 'chevron', run: () => selecionar(a.id) })),
    ...templates.map((t): Comando => ({ id: `md-${t.id}`, label: t.name, hint: `Modelo · ${AREA_NOME[t.area]}`, icon: 'doc', run: () => { setAba('modelos'); setModeloAberto(t.id); if (direitaGaveta) setDireitaAberta(true); } })),
    { id: 'linha', label: 'Abrir linha do dia', icon: 'scheduled', run: () => { setAba('linha'); if (direitaGaveta) setDireitaAberta(true); } },
    { id: 'tema', label: tema === 'dark' ? 'Usar tema claro' : 'Usar tema escuro', hint: 'T', icon: 'command', run: alternarTema },
  ], [agents, templates, tema, selecionar, alternarTema, direitaGaveta]);

  const gavetaAberta = (esquerdaGaveta && esquerdaAberta) || (direitaGaveta && direitaAberta);

  return (
    <div className="app">
      <div ref={refEsquerda} className={`left${esquerdaAberta ? ' is-open' : ''}`}>
        <Sidebar
          agents={agents}
          runs={runs}
          selected={selecionado}
          onSelect={selecionar}
          onCreate={criarAgente}
          onSearch={() => { setEsquerdaAberta(false); setPaleta(true); }}
          theme={tema}
          onToggleTheme={alternarTema}
          usuario={USUARIO}
          empresa={EMPRESA}
        />
      </div>

      <div className="middle">
        {erroCarga && <div className="banner" role="alert">Sem conexão com o servidor: {erroCarga}. Tentando de novo…</div>}
        <DayPanel
          agents={agents}
          runs={runsVisiveis}
          agent={agente}
          atualizado={atualizado}
          ocupado={ocupado}
          onApprove={(r) => decidir(r, 'aprovar')}
          onReject={(r) => decidir(r, 'recusar')}
          onRetry={(r) => decidir(r, 'tentarDeNovo')}
          onHome={() => selecionar(null)}
          onOpenLeft={() => setEsquerdaAberta(true)}
          onOpenRight={() => setDireitaAberta(true)}
          onOpenTemplates={abrirModelos}
        />
      </div>

      <div ref={refDireita} className={`right-wrap${direitaAberta ? ' is-open' : ''}`}>
        <RightPanel
          aba={aba}
          onAba={setAba}
          agents={agents}
          runs={runsVisiveis}
          templates={templates}
          destino={destino}
          filtro={filtro}
          onFiltro={setFiltro}
          aberto={modeloAberto}
          onAbrir={setModeloAberto}
          onUpload={enviarModelos}
          onVincular={vincular}
          onRemover={remover}
          onFechar={direitaGaveta ? () => setDireitaAberta(false) : undefined}
        />
      </div>

      {gavetaAberta && <div className="scrim" onClick={() => { setEsquerdaAberta(false); setDireitaAberta(false); }} aria-hidden="true" />}
      {paleta && <CommandPalette comandos={comandos} onClose={() => setPaleta(false)} />}
      <Toast mensagem={toast} />
    </div>
  );
}
