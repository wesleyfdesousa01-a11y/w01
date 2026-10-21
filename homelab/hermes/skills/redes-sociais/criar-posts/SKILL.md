---
name: criar-posts
description: Cria os posts do calendário (legendas por rede e imagens), salva como rascunhos JSON validados e pede aprovação antes de agendar.
version: 1.0.0
platforms: [linux]
metadata:
  hermes:
    tags: [redes-sociais, legendas, imagens]
    category: redes-sociais
    requires_toolsets: [terminal]
---

# Criar posts

## When to Use
Quando pedirem para criar os posts, escrever as legendas ou fazer as artes de
um calendário aprovado ou de um post avulso.

## Procedure
1. Leia o calendário aprovado em `/opt/data/posts/calendario/` ou use o pedido
   avulso.
2. Para cada post, escreva o texto de cada rede seguindo o tom da memória e as
   regras do SOUL:
   - **Instagram:** até 2.200 caracteres, com gancho na 1ª linha e hashtags no fim.
   - **Threads:** até 500 caracteres.
   - **Facebook:** livre, com link se houver.
3. Mídia, se o formato pedir:
   - **Foto que a pessoa mandou:** guarde com
     `python3 /opt/data/scripts/posts.py midia CAMINHO_DO_ARQUIVO NOME`.
   - **Imagem gerada:** use `image_generate` (formato quadrado 1:1 ou vertical
     4:5 para feed, 9:16 para story e Reels) e guarde o resultado com o mesmo
     comando `posts.py midia`, passando a URL ou o arquivo gerado.

     Não use a URL do gerador direto no post, porque ela expira. Evite texto
     dentro da imagem, a não ser que peçam.
   - **Link público que a pessoa passou:** pode usar a URL `https://` direto.
   - **Vídeo:** só a partir de um arquivo ou link que a pessoa mandar. Você não gera vídeo.
4. Salve cada post em `/opt/data/posts/rascunhos/AAAA-MM-DD-HHMM-tema-curto.json`:

   ```json
   {
     "quando": "2026-10-25T18:30",
     "destinos": ["instagram", "facebook", "threads"],
     "tipo": "foto",
     "textos": {
       "instagram": "Legenda do Instagram...\n\n#tag1 #tag2",
       "facebook": "Texto do Facebook...",
       "threads": "Texto curto do Threads"
     },
     "midias": ["nome-da-midia.jpg"],
     "link": null,
     "tema": "tema do calendário"
   }
   ```

   - `midias`: nomes de arquivos de `midias/` ou URLs `https://`. Carrossel
     leva de 2 a 10 itens; texto leva `[]`.
   - `textos`: se as redes usarem o mesmo texto, pode usar `"texto": "..."`
     no lugar.
5. Valide cada arquivo com `python3 /opt/data/scripts/posts.py validar ARQUIVO`
   e corrija até dar `ok`.
6. Mostre cada post para aprovação: data, redes, texto de cada rede e a imagem.
   Para mostrar a imagem no chat, use `MEDIA:/opt/data/posts/midias/NOME.jpg`.
7. Só depois de um "aprovo" explícito, rode
   `python3 /opt/data/scripts/posts.py aprovar ID` para um post, ou `aprovar todos`.
   Para os pedidos de mudança, edite o JSON, valide de novo e mostre outra vez.

## Pitfalls
- Aprovar move o post para a fila, e ele **vai ao ar sozinho** na hora marcada.
  Na dúvida, não aprove; pergunte.
- Para desmarcar um post já aprovado: `posts.py cancelar ID`.
- Instagram só aceita foto em JPEG; o `posts.py midia` converte sozinho.
- O nome da mídia deve ter só letras minúsculas, números, `-` e `_`.

## Verification
`posts.py listar` mostra os posts aprovados em `fila/`, cada um com a data certa.
