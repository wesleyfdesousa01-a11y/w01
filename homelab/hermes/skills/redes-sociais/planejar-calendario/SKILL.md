---
name: planejar-calendario
description: Monta o calendário editorial de redes sociais (Instagram, Facebook, Threads) para um período, com datas, temas, formatos e objetivos, e salva para aprovação.
version: 1.0.0
platforms: [linux]
metadata:
  hermes:
    tags: [redes-sociais, marketing, calendario]
    category: redes-sociais
---

# Planejar calendário de posts

## When to Use
Quando pedirem para planejar posts, montar a programação ou o calendário
editorial, ou "o que vamos postar" numa semana ou num mês.

## Procedure
1. Confira na memória o que você já sabe do negócio: o que vende, o público, o
   tom de voz, as redes usadas, a frequência combinada e as datas importantes.
   Se faltar o essencial (negócio, público ou redes), pergunte numa mensagem só
   antes de seguir.
2. Veja o que já existe para não repetir:
   `python3 /opt/data/scripts/posts.py listar`.
3. Monte o calendário do período pedido. Se ninguém disse a frequência, use 3
   posts por semana. Para cada post, defina:
   - data e hora: prefira 12h00 ou 18h30 em dia útil e 10h00 no sábado;
   - redes;
   - formato: `foto`, `carrossel`, `reels`, `story` ou `texto`;
   - tema;
   - objetivo: atrair, engajar, educar ou vender.
4. Equilibre o calendário. Use no máximo 1 post de venda a cada 3. Varie os
   formatos e inclua as datas comemorativas que façam sentido para o negócio.
5. Salve em `/opt/data/posts/calendario/AAAA-MM-DD_a_AAAA-MM-DD.md` como tabela
   Markdown com as colunas `# | quando | redes | formato | tema | objetivo`.
6. Mostre a tabela e pergunte o que mudar. Ajuste até a pessoa aprovar o
   calendário.
7. Guarde na memória as decisões que valem para os próximos planejamentos,
   como frequência, horários preferidos e temas proibidos.

## Pitfalls
- Planejar não cria nem agenda post. Depois do calendário aprovado, use a
  skill `criar-posts`.
- Story só existe no Instagram. Post só de texto não vai para o Instagram.
- Não ponha dois posts na mesma rede com menos de 3 horas de intervalo.

## Verification
O arquivo do calendário existe em `/opt/data/posts/calendario/`, e a pessoa
disse que o calendário está aprovado.
