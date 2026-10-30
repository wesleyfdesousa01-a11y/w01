import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isoComFuso, postParaRun } from './hermes.js';
import { criarApp, eDeHoje } from './index.js';

const FUSO = 'America/Sao_Paulo';
const POSTS_PY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../hermes/scripts/posts.py');

const post = (extra = {}) => ({
  quando: '2026-10-25T18:30',
  destinos: ['instagram', 'facebook'],
  tipo: 'foto',
  textos: { instagram: 'Grão do mês #cafe', facebook: 'Grão do mês' },
  midias: ['https://exemplo.com/grao.jpg'],
  ...extra,
});

describe('posts → execuções', () => {
  test('"quando" sem fuso é horário de Brasília', () => {
    assert.equal(isoComFuso('2026-10-25T18:30', FUSO), '2026-10-25T21:30:00.000Z');
    assert.equal(isoComFuso('2026-10-25T18:30-03:00', FUSO), '2026-10-25T21:30:00.000Z');
    assert.equal(isoComFuso('', FUSO), null);
  });

  test('rascunho vira pedido de aprovação com pergunta-ação', () => {
    const run = postParaRun('rascunhos', '2026-10-25-1830-grao-do-mes', post(), '2026-10-24T12:00:00.000Z', FUSO);
    assert.equal(run.status, 'waiting');
    assert.equal(run.title, 'Post — Grao do mes');
    assert.equal(run.approval.question, 'Agendar o post “Grao do mes” para 25/10 às 18:30?');
    assert.match(run.approval.detail, /^Preparei foto para Instagram e Facebook\./);
    assert.equal(run.approval.context, 'Grão do mês #cafe');
  });

  test('erro guarda o motivo legível por rede', () => {
    const run = postParaRun('erros', 'x', post({ resultado: { instagram: { ok: false, erro: 'Token expirou' }, facebook: { ok: true } } }), '2026-10-25T21:31:00.000Z', FUSO);
    assert.equal(run.status, 'failed');
    assert.equal(run.error, 'Instagram: Token expirou');
  });

  test('o painel do dia mostra pendências de qualquer data e o feito só de hoje', () => {
    assert.ok(eDeHoje({ status: 'waiting', startedAt: '2020-01-01T00:00:00Z' }, '2026-10-30', FUSO));
    assert.ok(eDeHoje({ status: 'done', startedAt: '2026-10-29T10:00:00Z', finishedAt: '2026-10-30T12:00:00Z' }, '2026-10-30', FUSO));
    assert.ok(!eDeHoje({ status: 'done', startedAt: '2026-10-29T10:00:00Z', finishedAt: '2026-10-29T12:00:00Z' }, '2026-10-30', FUSO));
    // 23:30 em Brasília de 29/10 já é 30/10 em UTC: continua sendo "ontem".
    assert.ok(!eDeHoje({ status: 'scheduled', startedAt: '2026-10-30T02:30:00Z' }, '2026-10-30', FUSO));
  });
});

describe('API', () => {
  let dir, posts, servidor, base;

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'painel-'));
    posts = path.join(dir, 'posts');
    for (const p of ['rascunhos', 'fila', 'erros']) await mkdir(path.join(posts, p), { recursive: true });
    await writeFile(path.join(posts, 'rascunhos', '2026-12-01-1830-bom.json'), JSON.stringify(post({ quando: '2026-12-01T18:30' })));
    await writeFile(path.join(posts, 'rascunhos', '2026-12-02-1830-ruim.json'), JSON.stringify(post({ tipo: 'texto', destinos: ['instagram'], midias: [] })));
    await writeFile(path.join(posts, 'rascunhos', '2026-12-03-1830-recusar.json'), JSON.stringify(post()));
    ({ servidor } = await criarApp({ dados: path.join(dir, 'dados'), posts, postsPy: POSTS_PY, fuso: FUSO, dist: path.join(dir, 'dist') }));
    await new Promise((ok) => servidor.listen(0, ok));
    base = `http://127.0.0.1:${servidor.address().port}/api`;
  });

  after(async () => {
    await new Promise((ok) => servidor.close(ok));
    await rm(dir, { recursive: true, force: true });
  });

  const pedir = async (metodo, rota, corpo) => {
    const res = await fetch(base + rota, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo && JSON.stringify(corpo) });
    return { status: res.status, dados: res.status === 204 ? null : await res.json() };
  };

  test('o agente social media já vem cadastrado e um novo entra na área', async () => {
    const { dados } = await pedir('GET', '/agents');
    assert.deepEqual(dados.map((a) => a.id), ['social-media']);
    const novo = await pedir('POST', '/agents', { name: 'Cobrança de boletos', area: 'financeiro' });
    assert.equal(novo.status, 201);
    assert.equal(novo.dados.id, 'cobranca-de-boletos');
    assert.equal((await pedir('POST', '/agents', { name: 'cobrança de boletos', area: 'financeiro' })).status, 409);
    assert.equal((await pedir('POST', '/agents', { name: 'X', area: 'producao' })).status, 400);
  });

  test('aprovar passa pelo posts.py e o post vai para a fila', async () => {
    const r = await pedir('POST', '/runs/post%3A2026-12-01-1830-bom/approve');
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.status, 'scheduled');
    assert.deepEqual(await readdir(path.join(posts, 'fila')), ['2026-12-01-1830-bom.json']);
  });

  test('post inválido não é aprovado e o motivo volta', async () => {
    const r = await pedir('POST', '/runs/post%3A2026-12-02-1830-ruim/approve');
    assert.equal(r.status, 422);
    assert.match(r.dados.erro, /Instagram não aceita post só de texto/);
  });

  test('recusar tira o post de rascunhos sem apagar', async () => {
    assert.equal((await pedir('POST', '/runs/post%3A2026-12-03-1830-recusar/reject')).status, 200);
    assert.deepEqual(await readdir(path.join(posts, 'recusados')), ['2026-12-03-1830-recusar.json']);
    assert.equal((await pedir('POST', '/runs/post%3A2026-12-03-1830-recusar/reject')).status, 409);
    assert.equal((await pedir('POST', '/runs/post%3A..%2Fx/reject')).status, 400);
  });

  test('execução reportada por um executor recebe a decisão', async () => {
    const criada = await pedir('POST', '/runs', {
      agentId: 'cobranca-de-boletos', title: 'Cobrança de boletos — Bling', status: 'waiting',
      approval: { question: 'Enviar 3 lembretes?', detail: 'Encontrei 3 boletos vencidos.' },
    });
    assert.equal(criada.status, 201);
    const id = encodeURIComponent(criada.dados.id);
    const aprovada = await pedir('POST', `/runs/${id}/approve`);
    assert.equal(aprovada.dados.decision, 'approved');
    assert.equal(aprovada.dados.status, 'running');
    assert.equal((await pedir('POST', `/runs/${id}/approve`)).status, 409);
    const falhou = await pedir('PATCH', `/runs/${id}`, { status: 'failed', error: 'Token da API expirou' });
    assert.ok(falhou.dados.finishedAt);
    const agentes = (await pedir('GET', '/agents')).dados;
    assert.equal(agentes.find((a) => a.id === 'cobranca-de-boletos').lastStatus, 'failed');
    assert.equal((await pedir('POST', `/runs/${id}/retry`)).dados.status, 'scheduled');
  });

  test('modelos .md: mesmo nome substitui, vínculo e presença', async () => {
    const um = await pedir('POST', '/templates', { name: 'briefing-diario.md', area: 'geral', content: '# Oi {{nome}}' });
    assert.equal(um.status, 201);
    const dois = await pedir('POST', '/templates', { name: 'briefing-diario.md', area: 'geral', content: '# Olá {{nome}}' });
    assert.equal(dois.status, 200);
    assert.equal(dois.dados.id, um.dados.id);
    assert.equal((await pedir('GET', '/templates')).dados.length, 1);
    assert.equal((await pedir('POST', '/templates', { name: 'x.txt', area: 'geral', content: '' })).status, 400);
    const vinculado = await pedir('PATCH', `/templates/${um.dados.id}`, { agentId: 'social-media' });
    assert.equal(vinculado.dados.agentId, 'social-media');
    const usando = await pedir('POST', `/templates/${um.dados.id}/presence`, { state: 'using' });
    assert.deepEqual([usando.dados.presence.state, usando.dados.presence.by], ['using', 'Social media']);
    assert.equal((await pedir('DELETE', `/templates/${um.dados.id}`)).status, 204);
  });
});

describe('senha', () => {
  test('com PAINEL_SENHA, sem credencial recebe 401', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'painel-'));
    const { servidor } = await criarApp({ dados: dir, senha: 'segredo', dist: dir });
    await new Promise((ok) => servidor.listen(0, ok));
    const url = `http://127.0.0.1:${servidor.address().port}/api/agents`;
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { Authorization: `Basic ${Buffer.from('eu:errada').toString('base64')}` } })).status, 401);
    assert.equal((await fetch(url, { headers: { Authorization: `Basic ${Buffer.from('eu:segredo').toString('base64')}` } })).status, 200);
    await new Promise((ok) => servidor.close(ok));
    await rm(dir, { recursive: true, force: true });
  });
});
