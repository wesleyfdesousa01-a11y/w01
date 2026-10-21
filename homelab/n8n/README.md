# n8n: agendar posts nas redes da Meta

O workflow `agendar-posts.json` publica no Instagram, no Facebook e no Threads
os posts de uma planilha do Google Sheets, na data e hora marcadas. Ele usa o
serviço [`meta-publicar`](../meta/README.md), que precisa estar configurado e
com as contas ligadas.

```
a cada 5 min ─► lê linhas "agendado" ─► já é hora? ─► marca "publicando" ─► meta-publicar ─► grava resultado
                                            └─ data inválida ─────────────────────────────────► grava "erro"
```

## 1. Planilha

1. Importe `posts-modelo.csv` no Google Sheets (**Arquivo → Importar**) e dê à
   aba o nome **Posts**.
2. Copie o ID da planilha, que é o trecho da URL entre `/d/` e `/edit`.

| Coluna         | O que pôr                                                                 |
|----------------|---------------------------------------------------------------------------|
| `data_hora`    | `25/10/2026 18:00` (horário de Brasília). Pode ser célula de data.        |
| `destinos`     | `instagram`, `facebook`, `threads`, separados por vírgula                 |
| `tipo`         | `foto`, `video`, `reels`, `story`, `carrossel` ou `texto`                 |
| `texto`        | Legenda. No Threads, até 500 caracteres.                                  |
| `midias`       | URLs públicas, uma por linha (ou separadas por vírgula) no carrossel      |
| `link`         | Opcional                                                                  |
| `status`       | `agendado` para entrar na fila. Qualquer outro valor (ex.: `rascunho`) é ignorado. |
| `resultado`, `publicado_em` | Deixe em branco: o n8n preenche                              |

Depois de cada tentativa, o n8n troca o `status` para:

- **`publicado`:** saiu em todos os destinos. O `resultado` traz os links.
- **`parcial`:** saiu em parte dos destinos. O `resultado` diz o que falhou em cada um.
- **`erro`:** não saiu em nenhum destino. Corrija a linha e volte o status para `agendado`.
- **`publicando`:** está em andamento. Se ficar parado assim (por exemplo, se o
  n8n reiniciar no meio), confira nas redes se o post saiu antes de voltar para
  `agendado`.

O fluxo nunca tenta de novo sozinho, para não publicar a mesma coisa duas vezes.

**Mídias:** a Meta baixa os arquivos da URL. Um link de compartilhamento do
Google Drive não serve, porque abre uma página e não o arquivo. Use um link
direto: o seu site, um bucket público ou um CDN.

## 2. Importar no n8n

1. Abra o n8n (`http://IP_DO_NOTEBOOK:5678`) → **Workflows → Import from File**
   e escolha `agendar-posts.json`.
2. Nos três nós do Google Sheets (**Ler agendados**, **Marcar publicando**,
   **Atualizar planilha**), troque `COLE_AQUI_O_ID_DA_PLANILHA` pelo ID e
   selecione a credencial do Google Sheets. Para criar essa credencial, use
   **Credentials → Google Sheets OAuth2 API** e siga o assistente do n8n.
3. No nó **Publicar na Meta**, crie a credencial **Header Auth** com o nome
   `meta-publicar`:
   - **Name:** `Authorization`
   - **Value:** `Bearer ` seguido do `META_API_CHAVE` do `.env` (`grep META_API_CHAVE .env`)
4. Teste com uma linha de data passada e status `agendado`: clique em
   **Execute workflow** e confira a planilha.
5. Ative o workflow (chave **Active** no canto superior direito).

O n8n e o `meta-publicar` sobem juntos no perfil `automacao`. O n8n chama o
`meta-publicar` pelo nome do container, então nada fica exposto fora do servidor.

## Ajustes comuns

- **Intervalo:** no nó **A cada 5 minutos**. Um post sai até 5 min depois da hora marcada.
- **Outra aba ou fuso:** troque `Posts` nos nós do Sheets e `America/Sao_Paulo`
  no nó **Preparar** e nas configurações do workflow.
- **Aviso de erro:** ligue um nó do Telegram ou de e-mail depois de **Resultado**,
  com um filtro `status != publicado`.
