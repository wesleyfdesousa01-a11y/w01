# meta-publicar: Instagram, Facebook e Threads pela API oficial

Publica fotos, vídeos/Reels, Stories, carrosséis e textos usando a Graph API
da Meta. Só Python padrão, sem dependências. Roda como:

- **serviço da stack** (perfil `automacao`, porta `8787`), chamado pelo n8n;
- **CLI** (`python3 meta_publicar.py ...`);
- **módulo** (`from meta_publicar import Meta, Post`).

```
n8n / CLI ──► meta-publicar :8787 ──► graph.facebook.com   (Página + Instagram ligado)
                                 ├──► graph.instagram.com  (Instagram com login próprio)
                                 └──► graph.threads.net    (Threads)
```

## 1. Criar o app na Meta (uma vez)

1. Em **developers.facebook.com → Meus apps → Criar app**, escolha o tipo
   **Empresa** (Business) e ligue a um Portfólio Empresarial.
2. Adicione os casos de uso que vai usar:
   - **Gerenciar tudo na sua Página** (Facebook Login): publica na Página e no
     Instagram ligado a ela.
   - **Gerenciar mensagens e conteúdo no Instagram** (API com Login do
     Instagram): só se o Instagram **não** estiver ligado a uma Página.
   - **Acessar a API do Threads**: para o Threads.
3. Em cada caso de uso, cadastre a URI de redirecionamento
   `https://localhost/` (ou a que puser em `META_REDIRECT_URI`).
4. Copie os IDs e chaves secretas para o `.env` do homelab. Cada produto tem
   o seu par:

| Variável                          | Onde achar                                              |
|-----------------------------------|---------------------------------------------------------|
| `META_APP_ID` / `META_APP_SECRET` | Configurações do app → Básico                           |
| `META_IG_APP_ID` / `..._SECRET`   | Caso de uso do Instagram → Configuração da API          |
| `META_THREADS_APP_ID` / `..._SECRET` | Caso de uso do Threads → Configurações               |
| `META_API_CHAVE`                  | Gerada pelo `install.sh`; o n8n usa para chamar a API   |

O Instagram precisa ser conta **profissional** (Empresa ou Criador). No
Facebook, o destino é uma **Página**, não o perfil pessoal.

**Modo de desenvolvimento** basta para publicar nas suas próprias contas,
desde que elas tenham papel no app (Funções do app → administrador ou
testador; no Threads e no Instagram, aceite o convite de testador nas
configurações da conta). Para contas de terceiros, o app precisa passar pela
**Análise do app** da Meta.

## 2. Ligar as contas

```bash
docker compose up -d --build meta-publicar
docker compose run --rm meta-publicar autorizar facebook    # Página (+ Instagram ligado)
docker compose run --rm meta-publicar autorizar threads
docker compose run --rm meta-publicar autorizar instagram   # só sem Página
docker compose run --rm meta-publicar status
```

O comando mostra um link. Abra, autorize (marque a Página e o Instagram) e
cole a URL para onde o navegador foi levado, mesmo que a página dê erro. Os
tokens ficam em `data/meta/tokens.json` (fora do git, permissão 600).

- O token da **Página** não expira.
- Os tokens de **Instagram (login próprio)** e de **Threads** valem 60 dias.
  O serviço renova sozinho uma vez por dia quando faltam 15 dias. Para
  renovar na mão: `meta_publicar.py renovar --forcar`.

Também dá para não usar o `autorizar` e definir direto no `.env`:
`META_FB_PAGE_ID`, `META_FB_PAGE_TOKEN`, `META_FB_IG_ID`, `META_IG_USER_ID`,
`META_IG_TOKEN`, `META_THREADS_USER_ID`, `META_THREADS_TOKEN`. Isso serve,
por exemplo, para um token de **usuário do sistema** do Gerenciador de
Negócios. O arquivo de tokens tem prioridade sobre o `.env`.

## 3. Publicar

As mídias precisam estar numa **URL pública HTTPS**: a Meta baixa o arquivo
de lá. Formatos: foto em JPEG; vídeo em MP4 (H.264/AAC). Um vídeo é
reconhecido pela extensão (`.mp4`, `.mov`, `.m4v`) ou por `{"url": ..., "tipo": "video"}`.

### CLI

```bash
M="docker compose run --rm meta-publicar"
$M publicar -d instagram,facebook,threads -t foto -m https://site/foto.jpg -l "Legenda #tag"
$M publicar -d instagram,threads -t carrossel -m https://site/1.jpg -m https://site/2.mp4 -l "Vários"
$M publicar -d instagram -t reels -m https://site/video.mp4 --capa https://site/capa.jpg -l "Reels"
$M publicar -d instagram -t story -m https://site/story.jpg
$M publicar -d facebook,threads -t texto -l "Novidade no site" --link https://site/post
$M limites
```

### API (n8n)

Para agendar por planilha, há um workflow pronto em [../n8n/README.md](../n8n/README.md).
Para montar o seu, use um nó **HTTP Request**:

- **Method:** POST
- **URL:** `http://meta-publicar:8787/publicar`
- **Header:** `Authorization: Bearer <META_API_CHAVE>`
- **Body (JSON):**

```json
{
  "destinos": ["instagram", "facebook", "threads"],
  "tipo": "carrossel",
  "texto": "Legenda do post",
  "midias": ["https://site/1.jpg", {"url": "https://site/2", "tipo": "video"}],
  "link": "https://site/opcional"
}
```

A resposta traz o resultado por destino. Se um destino falhar, os outros
seguem e a API devolve `207`:

```json
{"instagram": {"ok": true, "id": "1789...", "url": "https://www.instagram.com/p/..."},
 "threads":   {"ok": false, "erro": "HTTP 400 (código 100): ..."}}
```

Outras rotas: `GET /saude` (sem chave) e `GET /limites`. Vídeos levam alguns
minutos para a Meta processar, e a chamada só volta quando o post sai. No n8n,
aumente o *Timeout* do nó para 600000 ms.

O que cada destino aceita:

| tipo        | Instagram          | Facebook (Página)       | Threads           |
|-------------|--------------------|-------------------------|-------------------|
| `texto`     | não                | sim (+ link)            | sim (+ link)      |
| `foto`      | sim                | sim                     | sim               |
| `video`/`reels` | Reels          | vídeo da Página         | vídeo             |
| `story`     | foto ou vídeo      | não                     | não               |
| `carrossel` | 2–10 fotos/vídeos  | 2–10 fotos              | 2–10 fotos/vídeos |
| limite de texto | 2.200          | 63.206                  | 500               |

No Instagram, o `link` vai no fim da legenda, porque lá links não são clicáveis.
Existe também um teto de posts por conta a cada 24h (`limites` mostra o uso).

## Erros comuns

| Mensagem                                    | O que fazer                                               |
|---------------------------------------------|-----------------------------------------------------------|
| `falta 'ig_id'`                             | O Instagram não está ligado à Página, ou não foi marcado ao autorizar |
| `código 190`                                | Token inválido ou expirado: rode `autorizar` de novo      |
| `código 10` / `200`                         | Falta permissão: refaça `autorizar` marcando tudo; confira o papel no app |
| `código 9004` / `2207052`                   | A Meta não conseguiu baixar a mídia: a URL precisa ser pública e de formato aceito |
| `Mídia rejeitada (ERROR)`                   | Vídeo fora das especificações (proporção, duração, codec) |

A versão da Graph API é `v24.0` por padrão. Para trocar quando a Meta
descontinuar, defina `META_API_VERSION` no `.env`.

## Testes

```bash
cd meta && python3 -m unittest -v test_meta_publicar   # sem rede, a API é simulada
```
