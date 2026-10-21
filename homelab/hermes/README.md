# Agente social media (Hermes)

Um agente [Hermes](https://github.com/NousResearch/hermes-agent) (Nous Research,
open-source) que conversa com você pelo **Telegram**. Ele planeja o calendário,
escreve as legendas, prepara as imagens e agenda os posts. A publicação passa
pelo [`meta-publicar`](../meta/README.md).

```
Você (Telegram) ──► Hermes ── skills: planejar-calendario · criar-posts · publicar-posts
                      │
                      ├─ rascunhos/ ──"aprovo"──► fila/            (data/hermes/posts/)
                      │
                      └─ cron a cada 5 min (sem LLM) ─► posts.py publicar ─► meta-publicar ─► Instagram/Facebook/Threads
                                                               └─► resumo no Telegram
```

**Nada vai ao ar sem aprovação.** O agente cria rascunhos e só move um post
para a fila depois de um "aprovo" seu. O que está na fila sai sozinho na hora
marcada.

## Como fica o dia a dia

> **Você:** Planeje os posts da próxima semana. A loja vende café especial, público 25–40, tom descontraído.
> **Hermes:** *(tabela com 4 posts: datas, redes, formatos, temas)* Quer mudar algo?
> **Você:** Troca o de quinta por um carrossel. Pode criar.
> **Hermes:** *(mostra cada post com a imagem e as legendas por rede)*
> **Você:** Aprovo todos, menos o 3: deixa a legenda mais curta.
> **Hermes:** ✓ 3 posts na fila. *(ajusta o 3 e mostra de novo)*
> …na quinta, às 18h30: **✅ 2026-10-29-1830-carrossel-graos — instagram: https://instagram.com/p/…**

Outros pedidos que funcionam: "o que está agendado?", "muda o post de sexta
para 12h", "cancela o de sábado", "por que o post de ontem deu erro?".

## Instalação

Pré-requisitos:
- o `meta-publicar` rodando, com as contas ligadas: perfil `automacao`, veja [meta/README.md](../meta/README.md);
- um bot do Telegram;
- um provedor de modelo.

1. **Bot do Telegram:** fale com o [@BotFather](https://t.me/BotFather), mande
   `/newbot` e guarde o token. Pegue o seu ID numérico com o [@userinfobot](https://t.me/userinfobot).
2. **Modelo:** o Hermes precisa de um LLM com chave de API. Opções:
   - **OpenRouter** (`OPENROUTER_API_KEY`): acesso a vários modelos, inclusive Claude, pago por uso.
   - **Anthropic** (`ANTHROPIC_API_KEY`): Claude direto, pago por uso. Uma
     assinatura Claude Pro ou Max **não** cobre o Hermes.
   - **Nous Portal** (`hermes setup --portal`): uma assinatura cobre modelo e
     geração de imagem, sem coletar várias chaves.
   - **Ollama local** (perfil `ia`): grátis, mas modelos que cabem em 8–16 GB
     de RAM erram bastante em tarefas com ferramentas. Serve para testar, não
     para publicar.
3. **Imagens (opcional):** para gerar imagens, crie uma chave em [fal.ai](https://fal.ai)
   (`FAL_KEY`, custa centavos por imagem) ou use o Nous Portal.
4. Rode, na pasta `homelab/`:

   ```bash
   docker compose run --rm hermes setup   # assistente: modelo, chaves e Telegram
   ./hermes/instalar.sh                   # persona, skills, scripts e cron
   ```

   No assistente, escolha **Telegram** como plataforma e coloque o seu ID na
   lista de usuários permitidos, para que só você converse com o bot.
5. No Telegram, mande `/sethome` para o bot (é para onde vão os avisos de
   publicação). Depois, mande "planeje os posts da próxima semana".

Para manter o Hermes ligado com a stack, acrescente `agente` em
`COMPOSE_PROFILES` no `.env` (ex.: `COMPOSE_PROFILES=automacao,agente`).
Ele usa até 2 GB de RAM.

Depois de mudar algo em `hermes/` no repositório, rode `./hermes/instalar.sh`
de novo. A persona anterior fica salva como `SOUL.md.antes-*`.

## Hospedagem das mídias

A Meta **baixa** a imagem ou o vídeo de uma URL pública na hora de publicar.
Por isso:

- **URLs `https://` próprias funcionam direto:** o seu site, um CDN ou um
  bucket público. Basta mandar o link para o agente.
- **Imagens geradas pelo agente ou fotos que você manda pelo Telegram** ficam
  em `data/hermes/posts/midias/`. A URL do gerador de imagens **expira** em
  horas ou dias, então não serve para um post agendado. Para essas mídias
  saírem, a pasta precisa estar acessível em uma URL pública, que você informa
  em `MIDIAS_URL_PUBLICA` no `.env` do homelab. Por exemplo,
  `https://notebook.seu-tailnet.ts.net` para `…/foto.jpg`.

Expor essa pasta na internet é uma decisão sua. Os caminhos possíveis são:
- **Tailscale Funnel:** publica uma porta do notebook com HTTPS, sem abrir o roteador;
- sincronizar a pasta com um bucket ou CDN;
- subir as mídias no seu site.

Enquanto isso não estiver definido, o `posts.py validar` recusa posts com
mídia local, e o agente avisa.

## Arquivos

| Caminho                                  | O que é                                                  |
|------------------------------------------|----------------------------------------------------------|
| `SOUL.md`                                | Persona: regras de aprovação, tom por rede, limites      |
| `skills/redes-sociais/*/SKILL.md`        | Procedimentos: planejar, criar, publicar/acompanhar      |
| `scripts/posts.py`                       | Fila de posts: `validar`, `listar`, `aprovar`, `cancelar`, `midia`, `publicar` |
| `scripts/publicar-agendados.py`          | Chamado pelo cron do Hermes a cada 5 min (modo sem agente: não gasta tokens) |
| `instalar.sh`                            | Copia tudo para `data/hermes/` e configura o Hermes      |

Formato de um post (`data/hermes/posts/fila/2026-10-25-1830-tema.json`):

```json
{
  "quando": "2026-10-25T18:30",
  "destinos": ["instagram", "facebook", "threads"],
  "tipo": "foto",
  "textos": {"instagram": "Legenda com #hashtags", "facebook": "Texto", "threads": "Curto"},
  "midias": ["grao-do-mes.jpg"],
  "link": null
}
```

Cada rede recebe o seu texto: o `posts.py` faz uma chamada ao meta-publicar
para cada texto diferente.

## Segurança

- O container do Hermes **não** recebe o `.env` da stack. Dele, só vão o
  `META_API_CHAVE` e o `MIDIAS_URL_PUBLICA`.
- O Hermes não publica porta nenhuma. Ele fala com o Telegram por conexão de
  saída e com o meta-publicar pela rede interna do Docker.
- Deixe a lista de usuários permitidos do Telegram só com você. Qualquer
  pessoa que fale com o bot pode pedir posts. A aprovação também é feita pelo
  chat.

## Testes

```bash
cd hermes/scripts && python3 -m unittest -v test_posts   # fila, aprovação, publicação, conversão para JPEG
```

Os testes simulam o meta-publicar. O Hermes em si ainda não foi rodado neste
repositório: o primeiro teste de ponta a ponta é o passo 5 da instalação.
