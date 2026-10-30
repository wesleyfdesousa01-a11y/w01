# Painel do Hermes

A interface do Hermes no navegador. Ela responde, nesta ordem:

1. **O que precisa de mim agora?** Aprovações e falhas.
2. **O que está rodando?**
3. **O que já foi feito hoje?**

Segue o design system **Hermes** (`HERMES-GUIA-DE-APLICACAO.md`): tokens em
`src/styles/tokens.css`, componentes em `src/components/`, tema escuro por padrão.

```
┌ Agentes ─────┬ Painel do dia ─────────────────┬ Modelos .md │ Linha do dia ┐
│ áreas fixas, │ métricas · Precisa de você ·   │ upload, "Usado por",       │
│ criar agente │ Em andamento · Concluído hoje  │ prévia, presença           │
└──────────────┴────────────────────────────────┴────────────────────────────┘
```

## Como abrir

Ele sobe junto com o Hermes, no perfil `agente`:

```bash
docker compose up -d --build painel
```

Abra `http://IP-do-notebook:3005`. O navegador pede usuário e senha: o
usuário pode ser qualquer um, e a senha é a `PAINEL_SENHA` do `.env` (o
`install.sh` gera uma). **Sem `PAINEL_SENHA`, o painel fica aberto** para quem
estiver na rede. Como em todo o homelab, o acesso de fora de casa é pelo
Tailscale. Não publique a porta 3005 na internet: pelo painel dá para aprovar
posts.

Atalhos: `A` aprovar e `R` recusar (agem no pedido mais antigo), `T` troca o
tema, `⌘K`/`Ctrl+K` abre a busca, `Esc` fecha. Os atalhos de uma letra não
funcionam enquanto você digita em um campo.

## De onde vêm os dados

**Agente Social media (já ligado).** O painel lê a fila de posts do Hermes em
`data/hermes/posts/`:

| Pasta        | No painel                     | Ação no painel                     |
|--------------|-------------------------------|------------------------------------|
| `rascunhos/` | Aguardando você               | Aprovar → `posts.py aprovar` (valida e põe na fila) · Recusar → `recusados/` |
| `fila/`      | Agendado                      | —                                  |
| `enviando/`  | Rodando                       | —                                  |
| `publicados/`| Concluído                     | —                                  |
| `erros/`     | Falhou, com o motivo por rede | Tentar de novo → `posts.py aprovar` |

Recusar não apaga nada: o post vai para `recusados/`, que o `posts.py` ignora.

**Outros agentes** (Cobrança de boletos, PCP, Compras…). Crie o agente pelo
botão "+ Criar agente" da área e faça o executor dele reportar as execuções
pela API abaixo. Enquanto ele não reporta nada, o painel mostra "Ainda sem
execuções" com os próximos passos.

## API

Todas as rotas aceitam e devolvem JSON. Com `PAINEL_SENHA`, mande
`Authorization: Basic` (usuário qualquer).

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/agents` | Agentes, com `lastRunAt` e `lastStatus` |
| POST | `/api/agents` | `{name, area}`; área: `geral`, `financeiro`, `comercial`, `pcp`, `compras` |
| GET | `/api/runs?date=hoje&agentId=` | Execuções. `hoje` traz as pendências e falhas de qualquer data, mais o que terminou ou está agendado para hoje |
| POST | `/api/runs` | O executor abre uma execução |
| GET · PATCH | `/api/runs/:id` | Ler a decisão / atualizar passo, progresso e estado |
| POST | `/api/runs/:id/approve` · `/reject` · `/retry` | Botões e atalhos |
| GET · POST | `/api/templates` | Modelos .md (`POST {name, area, content}`; mesmo nome substitui) |
| PATCH · DELETE | `/api/templates/:id` | "Usado por" (`agentId`) e área / remover |
| POST | `/api/templates/:id/presence` | `{state: 'using'\|'idle', by?}` |
| WS | `/events` | `run.created`, `run.updated`, `run.removed`, `agents.updated`, `template.*` |

Exemplo de um executor que pede aprovação e espera a resposta:

```bash
P=http://localhost:3005/api; A="Authorization: Basic $(printf 'hermes:%s' "$PAINEL_SENHA" | base64)"
ID=$(curl -s -H "$A" -H 'Content-Type: application/json' -X POST $P/runs -d '{
  "agentId": "cobranca-de-boletos",
  "title": "Cobrança de boletos — Bling",
  "status": "waiting",
  "approval": {
    "question": "Enviar 3 lembretes de boleto vencido?",
    "detail": "Encontrei 3 boletos vencidos há mais de 5 dias.",
    "context": "Padaria Sol  R$ 1.240,00  venc. 22/10/2026",
    "approveLabel": "Enviar lembretes"
  }}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')

# Depois do "Aprovar", a execução fica com decision "approved" e status "running".
curl -s -H "$A" "$P/runs/$ID"
# Ao terminar:
curl -s -H "$A" -H 'Content-Type: application/json' -X PATCH "$P/runs/$ID" -d '{"status":"done"}'
```

Em falha, mande `{"status": "failed", "error": "Token da API expirou"}`. O
motivo aparece no card, e o botão "Tentar de novo" grava `decision: "retry"`.

Escreva o `title` como o que a execução entrega ("Conciliação de boletos —
Bling"), não como o nome técnico. O `detail` da aprovação é o Hermes falando
em 1ª pessoa ("Encontrei…", "Sugiro…").

## Desenvolvimento

```bash
npm install
npm start                     # API em :3005 (dados em ./dados)
npm run dev                   # front com recarga em :5173, usando a API acima
npm run build                 # checa os tipos e gera dist/
npm test                      # testes da API (precisa de python3 para o posts.py)
```

Para testar com a fila de posts: `HERMES_POSTS=../data/hermes/posts npm start`.

Nome e empresa no rodapé da barra: `VITE_USUARIO` e `VITE_EMPRESA` na hora do
build (padrão: Wesley · Grupo Prado).

## Ainda não feito

- Agenda (`schedule`) dos agentes: o painel mostra a execução, mas quem dispara
  é o executor de cada agente.
- Edição de modelo .md pelo painel: a presença "editando" já existe na API, mas
  a edição é fora (baixe, edite e solte de novo).
- O "Resumo da agenda" do guia não existe neste repositório. Quando existir, ele
  entra como agente da área Geral e reporta pela API acima, usando
  `briefing-diario.md`.
