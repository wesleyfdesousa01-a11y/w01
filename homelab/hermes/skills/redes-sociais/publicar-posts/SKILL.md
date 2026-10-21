---
name: publicar-posts
description: Mostra, reagenda, cancela e acompanha os posts da fila de publicação (Instagram, Facebook, Threads) e explica erros de publicação.
version: 1.0.0
platforms: [linux]
required_environment_variables:
  - name: META_API_CHAVE
    prompt: Chave da API do meta-publicar (META_API_CHAVE do .env do homelab)
    required_for: publicar posts
metadata:
  hermes:
    tags: [redes-sociais, agendamento]
    category: redes-sociais
    requires_toolsets: [terminal]
---

# Publicar e acompanhar posts

## When to Use
Quando perguntarem o que está agendado ou o que já saiu, ou pedirem para
mudar a data, cancelar, publicar agora ou entender um erro de publicação.

## Procedure
1. Ver tudo: `python3 /opt/data/scripts/posts.py listar`, ou só uma pasta:
   `listar fila`, `listar publicados`, `listar erros`.
2. **Reagendar:** edite `"quando"` no JSON da `fila/`. Ele sai na nova hora sem
   precisar aprovar de novo.
3. **Cancelar:** `posts.py cancelar ID` devolve o post para `rascunhos/`.
4. **Publicar agora:** só com pedido explícito. Ponha `"quando"` no horário
   atual e rode `python3 /opt/data/scripts/posts.py publicar`.
5. **Erro:** leia `"resultado"` no JSON em `erros/` e explique em linguagem
   simples, consultando a tabela de erros comuns abaixo. Depois de corrigir,
   peça aprovação de novo e rode `posts.py aprovar ID`.
6. O cron `publicar-agendados`, a cada 5 min, publica sozinho o que venceu e
   avisa no chat. Se você suspeitar que ele parou, confira com `/cron list`.

## Pitfalls
- Um post que ficou em `enviando/` significa que a publicação foi interrompida.
  Antes de mover de volta para `fila/`, confira nas redes se ele não saiu, para
  não duplicar.
- Erros comuns vindos da Meta:
  - **código 190:** token vencido; a conta precisa ser ligada de novo no meta-publicar.
  - **código 9004 ou 2207052:** a Meta não conseguiu baixar a mídia; o link não é público.
  - **ERROR no container:** o vídeo está fora do formato aceito.

## Verification
`posts.py listar` mostra o post na pasta esperada, e, depois de sair, ele está
em `publicados/` com o link de cada rede em `"resultado"`.
