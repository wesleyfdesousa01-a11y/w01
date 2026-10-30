// Agentes, execuções reportadas pelos executores e modelos .md, em arquivos JSON
// dentro de $PAINEL_DADOS. Gravação atômica: escreve num .tmp e renomeia.

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const AREAS = ['geral', 'financeiro', 'comercial', 'pcp', 'compras'];
export const STATUS = ['waiting', 'running', 'done', 'failed', 'scheduled', 'paused'];
const PRESENCA = ['using', 'editing', 'idle'];

function erro(status, mensagem) {
  return Object.assign(new Error(mensagem), { status });
}

function texto(valor, campo, max = 200) {
  const s = typeof valor === 'string' ? valor.trim() : '';
  if (!s) throw erro(400, `"${campo}" é obrigatório`);
  if (s.length > max) throw erro(400, `"${campo}" passa de ${max} caracteres`);
  return s;
}

function slug(nome) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agente';
}

export class Store {
  constructor(dir, sementes = {}) {
    this.dir = dir;
    this.sementes = sementes;
    this.dados = { agents: [], runs: [], templates: [] };
  }

  async abrir() {
    await mkdir(this.dir, { recursive: true });
    for (const chave of Object.keys(this.dados)) {
      try {
        this.dados[chave] = JSON.parse(await readFile(path.join(this.dir, `${chave}.json`), 'utf8'));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        this.dados[chave] = structuredClone(this.sementes[chave] || []);
        if (this.dados[chave].length) await this.salvar(chave);
      }
    }
    return this;
  }

  async salvar(chave) {
    const destino = path.join(this.dir, `${chave}.json`);
    await writeFile(`${destino}.tmp`, `${JSON.stringify(this.dados[chave], null, 2)}\n`);
    await rename(`${destino}.tmp`, destino);
  }

  // ------------------------------------------------------------ agentes
  get agents() {
    return this.dados.agents;
  }

  async criarAgente({ name, area }) {
    name = texto(name, 'name', 60);
    if (!AREAS.includes(area)) throw erro(400, `"area" deve ser uma de: ${AREAS.join(', ')}`);
    if (this.agents.some((a) => a.name.toLowerCase() === name.toLowerCase())) throw erro(409, `Já existe um agente "${name}"`);
    let id = slug(name);
    while (this.agents.some((a) => a.id === id)) id = `${slug(name)}-${randomUUID().slice(0, 4)}`;
    const agente = { id, name, area, createdAt: new Date().toISOString(), templateIds: [] };
    this.agents.push(agente);
    await this.salvar('agents');
    return agente;
  }

  agente(id) {
    return this.agents.find((a) => a.id === id);
  }

  // --------------------------------------------- execuções dos executores
  get runs() {
    return this.dados.runs;
  }

  run(id) {
    return this.runs.find((r) => r.id === id);
  }

  async criarRun(corpo) {
    if (!this.agente(corpo.agentId)) throw erro(400, 'agentId desconhecido');
    const run = this.limparRun({ status: 'running', startedAt: new Date().toISOString(), ...corpo });
    run.id = `run:${randomUUID()}`;
    texto(run.title, 'title');
    this.runs.push(run);
    await this.salvar('runs');
    return run;
  }

  async atualizarRun(id, corpo) {
    const run = this.run(id);
    if (!run) throw erro(404, 'Execução não encontrada');
    Object.assign(run, this.limparRun(corpo));
    if (['done', 'failed'].includes(run.status) && !run.finishedAt) run.finishedAt = new Date().toISOString();
    await this.salvar('runs');
    return run;
  }

  limparRun(corpo) {
    const campos = ['agentId', 'title', 'status', 'startedAt', 'finishedAt', 'step', 'steps', 'stepLabel', 'progress', 'error', 'approval', 'decision'];
    const run = Object.fromEntries(campos.filter((c) => corpo[c] !== undefined).map((c) => [c, corpo[c]]));
    if (run.status && !STATUS.includes(run.status)) throw erro(400, `"status" deve ser um de: ${STATUS.join(', ')}`);
    if (run.progress !== undefined && !(run.progress >= 0 && run.progress <= 1)) throw erro(400, '"progress" vai de 0 a 1');
    if (run.status === 'waiting' && !(run.approval?.question || corpo.approval === undefined)) throw erro(400, 'aprovação sem "question"');
    return run;
  }

  // A decisão fica gravada na execução; o executor lê com GET /runs/:id.
  async decidir(id, decisao) {
    const run = this.run(id);
    if (!run) throw erro(404, 'Execução não encontrada');
    if (decisao === 'retry') {
      if (run.status !== 'failed') throw erro(409, 'Só dá para tentar de novo uma execução que falhou');
      return this.atualizarRun(id, { status: 'scheduled', decision: 'retry', error: null, finishedAt: null });
    }
    if (run.status !== 'waiting') throw erro(409, 'Essa execução não está esperando você');
    return decisao === 'approved'
      ? this.atualizarRun(id, { status: 'running', decision: 'approved' })
      : this.atualizarRun(id, { status: 'done', decision: 'rejected', stepLabel: 'Recusado por você', finishedAt: new Date().toISOString() });
  }

  // ----------------------------------------------------------- modelos .md
  get templates() {
    return this.dados.templates;
  }

  template(id) {
    return this.templates.find((t) => t.id === id);
  }

  async salvarTemplate({ name, area, content, agentId = null }) {
    name = texto(name, 'name', 120);
    if (!/\.(md|markdown)$/i.test(name) || /[\\/]/.test(name)) throw erro(400, 'O arquivo precisa ser .md ou .markdown');
    if (!AREAS.includes(area)) throw erro(400, `"area" deve ser uma de: ${AREAS.join(', ')}`);
    if (typeof content !== 'string') throw erro(400, '"content" é obrigatório');
    if (agentId && !this.agente(agentId)) throw erro(400, 'agentId desconhecido');
    const agora = new Date().toISOString();
    const existente = this.templates.find((t) => t.name === name);
    const presence = { state: 'idle', by: 'você', at: agora };
    if (existente) {
      Object.assign(existente, { area, content, updatedAt: agora, presence });
      if (agentId) existente.agentId = agentId;
      await this.salvar('templates');
      return { template: existente, substituido: true };
    }
    const template = { id: randomUUID(), name, area, agentId: agentId || null, content, presence, updatedAt: agora };
    this.templates.push(template);
    await this.salvar('templates');
    return { template, substituido: false };
  }

  async atualizarTemplate(id, { agentId, area }) {
    const t = this.template(id);
    if (!t) throw erro(404, 'Modelo não encontrado');
    if (agentId !== undefined) {
      if (agentId !== null && !this.agente(agentId)) throw erro(400, 'agentId desconhecido');
      t.agentId = agentId;
    }
    if (area !== undefined) {
      if (!AREAS.includes(area)) throw erro(400, 'área inválida');
      t.area = area;
    }
    t.updatedAt = new Date().toISOString();
    await this.salvar('templates');
    return t;
  }

  async removerTemplate(id) {
    const i = this.templates.findIndex((t) => t.id === id);
    if (i < 0) throw erro(404, 'Modelo não encontrado');
    this.templates.splice(i, 1);
    await this.salvar('templates');
  }

  async presenca(id, { state, by }) {
    const t = this.template(id);
    if (!t) throw erro(404, 'Modelo não encontrado');
    if (!PRESENCA.includes(state)) throw erro(400, `"state" deve ser um de: ${PRESENCA.join(', ')}`);
    t.presence = { state, by: texto(by || (t.agentId && this.agente(t.agentId)?.name) || 'você', 'by', 80), at: new Date().toISOString() };
    await this.salvar('templates');
    return t;
  }
}
