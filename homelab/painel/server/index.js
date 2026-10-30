// Servidor do painel Hermes: API REST, WebSocket /events e os arquivos do build (dist/).
//
// Variáveis:
//   PORTA            porta HTTP (3005)
//   PAINEL_DADOS     onde ficam agents/runs/templates.json (./dados)
//   HERMES_POSTS     fila de posts do agente social media (data/hermes/posts)
//   POSTS_PY         script que aprova posts (data/hermes/scripts/posts.py)
//   PAINEL_SENHA     se definida, pede usuário/senha (HTTP Basic) em tudo
//   TZ               fuso do "hoje" (America/Sao_Paulo)

import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Store } from './store.js';
import { AGENTE_POSTS, aprovarPost, lerPosts, recusarPost } from './hermes.js';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FUSO = process.env.TZ || 'America/Sao_Paulo';
const MAX_CORPO = 1024 * 1024;
const STATUS = Symbol('status');
// Resposta com status diferente de 200.
const com = (status, corpo) => ({ [STATUS]: status, corpo });
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };

const SEMENTES = {
  agents: [{ id: AGENTE_POSTS, name: 'Social media', area: 'comercial', createdAt: new Date().toISOString(), templateIds: [] }],
};

export function diaLocal(iso, fuso = FUSO) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

// O que entra no painel do dia: tudo que pede ação ou está ativo, mais o que terminou
// ou está agendado para hoje.
export function eDeHoje(run, hoje, fuso = FUSO) {
  if (['waiting', 'running', 'failed', 'paused'].includes(run.status)) return true;
  const quando = run.status === 'done' ? run.finishedAt || run.startedAt : run.startedAt;
  return Boolean(quando) && diaLocal(quando, fuso) === hoje;
}

export async function criarApp({ dados, posts, postsPy, senha, fuso = FUSO, dist = path.join(RAIZ, 'dist') } = {}) {
  const store = await new Store(dados, SEMENTES).abrir();
  const clientes = new Set();
  let ultimo = new Map();

  async function todosRuns() {
    return [...store.runs, ...(posts ? await lerPosts(posts, fuso) : [])];
  }

  function enviar(evento) {
    const msg = JSON.stringify(evento);
    for (const ws of clientes) if (ws.readyState === 1) ws.send(msg);
  }

  // Compara com a última foto e manda só o que mudou.
  async function sincronizar() {
    const atual = new Map((await todosRuns()).map((r) => [r.id, r]));
    for (const [id, run] of atual) {
      const antes = ultimo.get(id);
      if (!antes) enviar({ type: 'run.created', run });
      else if (JSON.stringify(antes) !== JSON.stringify(run)) enviar({ type: 'run.updated', run });
    }
    for (const id of ultimo.keys()) if (!atual.has(id)) enviar({ type: 'run.removed', id });
    const mudou = atual.size !== ultimo.size || [...atual].some(([id, r]) => JSON.stringify(ultimo.get(id)) !== JSON.stringify(r));
    ultimo = atual;
    if (mudou) enviar({ type: 'agents.updated', agents: await agentesComEstado() });
  }

  async function agentesComEstado() {
    const runs = await todosRuns();
    return store.agents.map((a) => {
      const meus = runs.filter((r) => r.agentId === a.id && r.status !== 'scheduled');
      const ultimaRun = meus.sort((x, y) => (y.finishedAt || y.startedAt).localeCompare(x.finishedAt || x.startedAt))[0];
      return { ...a, lastRunAt: ultimaRun ? ultimaRun.finishedAt || ultimaRun.startedAt : null, lastStatus: ultimaRun?.status || null };
    });
  }

  function autorizado(req) {
    if (!senha) return true;
    const [tipo, valor] = (req.headers.authorization || '').split(' ');
    if (tipo !== 'Basic' || !valor) return false;
    const recebida = Buffer.from(Buffer.from(valor, 'base64').toString().split(':').slice(1).join(':'));
    const esperada = Buffer.from(senha);
    return recebida.length === esperada.length && timingSafeEqual(recebida, esperada);
  }

  async function corpo(req) {
    let tamanho = 0;
    const partes = [];
    for await (const parte of req) {
      tamanho += parte.length;
      if (tamanho > MAX_CORPO) throw Object.assign(new Error('Corpo maior que 1 MB'), { status: 413 });
      partes.push(parte);
    }
    if (!partes.length) return {};
    try {
      return JSON.parse(Buffer.concat(partes).toString('utf8'));
    } catch {
      throw Object.assign(new Error('JSON inválido'), { status: 400 });
    }
  }

  async function decidirRun(id, decisao) {
    if (id.startsWith('post:')) {
      if (!posts) throw Object.assign(new Error('Fila de posts não configurada'), { status: 404 });
      if (decisao === 'rejected') await recusarPost(posts, id);
      else await aprovarPost(posts, postsPy, id);
    } else {
      await store.decidir(id, decisao);
    }
    await sincronizar();
    return (await todosRuns()).find((r) => r.id === id) || { id };
  }

  const rotas = [
    ['GET', /^\/api\/agents$/, async () => agentesComEstado()],
    ['POST', /^\/api\/agents$/, async (req) => {
      const agente = await store.criarAgente(await corpo(req));
      enviar({ type: 'agents.updated', agents: await agentesComEstado() });
      return com(201, agente);
    }],
    ['GET', /^\/api\/runs$/, async (req, url) => {
      const agentId = url.searchParams.get('agentId');
      const data = url.searchParams.get('date');
      const hoje = diaLocal(new Date().toISOString(), fuso);
      return (await todosRuns()).filter((r) => (!agentId || r.agentId === agentId) && (!data || data !== 'hoje' || eDeHoje(r, hoje, fuso)));
    }],
    ['POST', /^\/api\/runs$/, async (req) => {
      const run = await store.criarRun(await corpo(req));
      await sincronizar();
      return com(201, run);
    }],
    ['GET', /^\/api\/runs\/([^/]+)$/, async (req, url, [id]) => {
      const run = (await todosRuns()).find((r) => r.id === id);
      if (!run) throw Object.assign(new Error('Execução não encontrada'), { status: 404 });
      return run;
    }],
    ['PATCH', /^\/api\/runs\/([^/]+)$/, async (req, url, [id]) => {
      if (id.startsWith('post:')) throw Object.assign(new Error('Posts mudam pela fila do Hermes'), { status: 409 });
      const run = await store.atualizarRun(id, await corpo(req));
      await sincronizar();
      return run;
    }],
    ['POST', /^\/api\/runs\/([^/]+)\/approve$/, (req, url, [id]) => decidirRun(id, 'approved')],
    ['POST', /^\/api\/runs\/([^/]+)\/reject$/, (req, url, [id]) => decidirRun(id, 'rejected')],
    ['POST', /^\/api\/runs\/([^/]+)\/retry$/, (req, url, [id]) => decidirRun(id, 'retry')],
    ['GET', /^\/api\/templates$/, async () => store.templates],
    ['POST', /^\/api\/templates$/, async (req) => {
      const { template, substituido } = await store.salvarTemplate(await corpo(req));
      enviar({ type: 'template.updated', template });
      return com(substituido ? 200 : 201, template);
    }],
    ['PATCH', /^\/api\/templates\/([^/]+)$/, async (req, url, [id]) => {
      const template = await store.atualizarTemplate(id, await corpo(req));
      enviar({ type: 'template.updated', template });
      return template;
    }],
    ['DELETE', /^\/api\/templates\/([^/]+)$/, async (req, url, [id]) => {
      await store.removerTemplate(id);
      enviar({ type: 'template.removed', id });
      return com(204, null);
    }],
    ['POST', /^\/api\/templates\/([^/]+)\/presence$/, async (req, url, [id]) => {
      const template = await store.presenca(id, await corpo(req));
      enviar({ type: 'template.presence', id, presence: template.presence });
      return template;
    }],
  ];

  async function estatico(res, caminho) {
    const alvo = path.normalize(path.join(dist, caminho));
    const arquivo = alvo.startsWith(dist + path.sep) && path.extname(alvo) ? alvo : path.join(dist, 'index.html');
    try {
      const conteudo = await readFile(arquivo);
      const cache = arquivo.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control': cache });
      res.end(conteudo);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(arquivo.endsWith('index.html') ? 'Rode "npm run build" antes de abrir o painel.' : 'Não encontrado');
    }
  }

  const servidor = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!autorizado(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Hermes", charset="UTF-8"' });
      return res.end();
    }
    const url = new URL(req.url, 'http://painel');
    if (!url.pathname.startsWith('/api/')) return estatico(res, decodeURIComponent(url.pathname));
    const rota = rotas.find(([metodo, padrao]) => metodo === req.method && padrao.test(url.pathname));
    if (!rota) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ erro: 'Rota não encontrada' }));
    }
    try {
      const params = url.pathname.match(rota[1]).slice(1).map(decodeURIComponent);
      let saida = await rota[2](req, url, params);
      const status = saida?.[STATUS] || 200;
      if (saida?.[STATUS]) saida = saida.corpo;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(saida === null ? undefined : JSON.stringify(saida));
    } catch (e) {
      if (!e.status) console.error(e);
      res.writeHead(e.status || 500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ erro: e.status ? e.message : 'Erro interno' }));
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  servidor.on('upgrade', (req, socket, cabeca) => {
    if (new URL(req.url, 'http://painel').pathname !== '/events' || !autorizado(req)) return socket.destroy();
    wss.handleUpgrade(req, socket, cabeca, (ws) => {
      clientes.add(ws);
      ws.on('close', () => clientes.delete(ws));
    });
  });

  // A fila muda por fora (agente, cron do posts.py): observa a pasta e confere a cada 15 s.
  let pendente;
  const agendar = () => {
    clearTimeout(pendente);
    pendente = setTimeout(() => sincronizar().catch(console.error), 300);
  };
  const vigias = [];
  if (posts) {
    await mkdir(posts, { recursive: true });
    try {
      vigias.push(watch(posts, { recursive: true }, agendar));
    } catch {
      // fs.watch recursivo não existe em todo sistema; o intervalo cobre.
    }
  }
  const intervalo = setInterval(agendar, 15000);
  await sincronizar();

  servidor.on('close', () => {
    clearInterval(intervalo);
    clearTimeout(pendente);
    vigias.forEach((v) => v.close());
    wss.close();
  });
  return { servidor, store, sincronizar };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const porta = Number(process.env.PORTA || 3005);
  const { servidor } = await criarApp({
    dados: path.resolve(process.env.PAINEL_DADOS || path.join(RAIZ, 'dados')),
    posts: process.env.HERMES_POSTS ? path.resolve(process.env.HERMES_POSTS) : null,
    postsPy: path.resolve(process.env.POSTS_PY || path.join(RAIZ, '..', 'hermes', 'scripts', 'posts.py')),
    senha: process.env.PAINEL_SENHA || null,
  });
  servidor.listen(porta, () => console.log(`Painel Hermes em http://localhost:${porta}`));
}
