// Converte a fila de posts do agente social media (data/hermes/posts) em execuções
// do painel. Cada arquivo .json é uma execução; a pasta diz o estado.
//
//   rascunhos/  → waiting    (espera o seu "aprovo")
//   fila/       → scheduled  (sai na hora marcada)
//   enviando/   → running
//   publicados/ → done
//   erros/      → failed
//   recusados/  → done       (recusado no painel; o posts.py ignora esta pasta)

import { execFile } from 'node:child_process';
import { readdir, readFile, rename, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

export const AGENTE_POSTS = 'social-media';

const ESTADO = {
  rascunhos: 'waiting',
  fila: 'scheduled',
  enviando: 'running',
  publicados: 'done',
  erros: 'failed',
  recusados: 'done',
};
const TIPO = { texto: 'Texto', foto: 'Foto', video: 'Vídeo', reels: 'Reels', story: 'Story', carrossel: 'Carrossel' };
const REDE = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads' };
const NOME_SEGURO = /^[a-z0-9][a-z0-9_-]{0,120}$/;

function juntar(lista) {
  if (lista.length < 2) return lista.join('');
  return `${lista.slice(0, -1).join(', ')} e ${lista.at(-1)}`;
}

// "2026-10-25-1830-carrossel-graos" → "Carrossel graos"
function tema(stem) {
  const t = stem.replace(/^\d{4}-\d{2}-\d{2}-\d{4}-?/, '').replace(/[-_]+/g, ' ').trim() || stem;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function dataHora(iso, fuso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const f = new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} às ${p.hour}:${p.minute}`;
}

// "quando" sem fuso é horário de Brasília (mesma regra do posts.py).
export function isoComFuso(valor, fuso) {
  const s = String(valor || '');
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s).toISOString();
  const base = new Date(`${s}Z`);
  if (Number.isNaN(base.getTime())) return null;
  const f = new Intl.DateTimeFormat('en-US', { timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(base).map((x) => [x.type, x.value]));
  const comoLocal = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return new Date(base.getTime() - (comoLocal - base.getTime())).toISOString();
}

function primeiroTexto(post) {
  const t = post.texto || Object.values(post.textos || {}).find(Boolean) || '';
  return t.length > 280 ? `${t.slice(0, 277)}…` : t;
}

export function postParaRun(pastaNome, stem, post, mtime, fuso) {
  const status = ESTADO[pastaNome];
  const destinos = (post.destinos || []).map((d) => REDE[d] || d);
  const tipo = TIPO[post.tipo] || post.tipo || 'Post';
  const quando = isoComFuso(post.quando, fuso);
  const run = {
    id: `post:${stem}`,
    agentId: AGENTE_POSTS,
    title: `Post — ${tema(stem)}`,
    status,
    startedAt: quando || mtime,
    stepLabel: `${tipo} · ${juntar(destinos)}${quando ? ` · ${dataHora(quando, fuso)}` : ''}`,
    source: 'posts',
  };
  if (status === 'waiting') {
    run.startedAt = mtime;
    run.approval = {
      question: `Agendar o post “${tema(stem)}” para ${quando ? dataHora(quando, fuso) : 'a data marcada'}?`,
      detail: `Preparei ${tipo.toLowerCase()} para ${juntar(destinos) || 'nenhuma rede'}. Se aprovar, entra na fila e sai na hora marcada.`,
      context: primeiroTexto(post) || undefined,
      approveLabel: 'Aprovar',
      rejectLabel: 'Recusar',
    };
  }
  if (status === 'running') run.progress = 0.5;
  if (pastaNome === 'publicados') {
    run.finishedAt = isoComFuso(post.publicado_em, fuso) || mtime;
    const falhas = Object.entries(post.resultado || {}).filter(([, r]) => !r.ok);
    if (falhas.length) run.stepLabel += ` · falhou em ${juntar(falhas.map(([d]) => REDE[d] || d))}`;
  }
  if (pastaNome === 'recusados') {
    run.finishedAt = mtime;
    run.stepLabel = `Recusado por você · ${run.stepLabel}`;
  }
  if (status === 'failed') {
    run.finishedAt = mtime;
    const erros = Object.entries(post.resultado || {}).filter(([, r]) => !r.ok).map(([d, r]) => `${REDE[d] || d}: ${r.erro || 'erro'}`);
    run.error = erros.join('; ') || 'A publicação não saiu';
  }
  return run;
}

export async function lerPosts(base, fuso) {
  const runs = [];
  for (const nome of Object.keys(ESTADO)) {
    let arquivos;
    try {
      arquivos = await readdir(path.join(base, nome));
    } catch {
      continue;
    }
    for (const arquivo of arquivos.filter((a) => a.endsWith('.json')).sort()) {
      const caminho = path.join(base, nome, arquivo);
      const stem = arquivo.slice(0, -5);
      try {
        const [texto, info] = await Promise.all([readFile(caminho, 'utf8'), stat(caminho)]);
        runs.push(postParaRun(nome, stem, JSON.parse(texto), info.mtime.toISOString(), fuso));
      } catch {
        runs.push({ id: `post:${stem}`, agentId: AGENTE_POSTS, title: `Post — ${tema(stem)}`, status: 'failed', startedAt: new Date().toISOString(), error: 'JSON inválido', source: 'posts' });
      }
    }
  }
  return runs;
}

function stemDe(runId) {
  const stem = runId.replace(/^post:/, '');
  if (!NOME_SEGURO.test(stem)) throw Object.assign(new Error('ID inválido'), { status: 400 });
  return stem;
}

// Aprovar e "tentar de novo" passam pelo posts.py, que valida o post antes de pôr na fila.
export function aprovarPost(base, script, runId) {
  const stem = stemDe(runId);
  return new Promise((resolve, reject) => {
    execFile('python3', [script, 'aprovar', stem], { env: { ...process.env, HERMES_POSTS_DIR: base }, timeout: 30000 }, (erro, saida, saidaErro) => {
      const texto = `${saida}${saidaErro}`.trim();
      if (erro) reject(Object.assign(new Error(texto || erro.message), { status: 422 }));
      else resolve(texto);
    });
  });
}

export async function recusarPost(base, runId) {
  const stem = stemDe(runId);
  await mkdir(path.join(base, 'recusados'), { recursive: true });
  try {
    await rename(path.join(base, 'rascunhos', `${stem}.json`), path.join(base, 'recusados', `${stem}.json`));
  } catch {
    throw Object.assign(new Error('Esse post não está mais esperando aprovação'), { status: 409 });
  }
}
