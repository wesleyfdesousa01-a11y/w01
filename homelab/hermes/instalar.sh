#!/usr/bin/env bash
# Instala o agente social media no Hermes: persona, skills, scripts e o cron
# que publica a fila. Rode da pasta homelab/, depois do "hermes setup":
#
#   docker compose run --rm hermes setup     # 1x: modelo, chave e Telegram
#   ./hermes/instalar.sh                     # pode rodar de novo para atualizar
#
# Lê META_API_CHAVE (e MIDIAS_URL_PUBLICA, se houver) do .env do homelab e
# grava só essas no .env do Hermes. As outras senhas da stack não vão para o agente.

set -euo pipefail
cd "$(dirname "$0")/.."

DADOS=data/hermes
ORIGEM=hermes
[[ -f .env ]] || { echo "Rode da pasta homelab/ (não achei o .env)" >&2; exit 1; }
[[ -f $DADOS/config.yaml ]] || { echo "Rode antes: docker compose run --rm hermes setup" >&2; exit 1; }

valor() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
CHAVE=$(valor META_API_CHAVE)
[[ -n "$CHAVE" ]] || { echo "META_API_CHAVE vazio no .env (veja meta/README.md)" >&2; exit 1; }
MIDIAS_URL=$(valor MIDIAS_URL_PUBLICA)
DONO=$(valor PUID):$(valor PGID)
[[ "$DONO" == ":" ]] && DONO=1000:1000

echo "==> Persona, skills e scripts"
[[ -f $DADOS/SOUL.md ]] && ! cmp -s $ORIGEM/SOUL.md $DADOS/SOUL.md && cp $DADOS/SOUL.md "$DADOS/SOUL.md.antes-$(date +%Y%m%d%H%M%S)"
cp $ORIGEM/SOUL.md $DADOS/SOUL.md
mkdir -p $DADOS/skills $DADOS/scripts
rm -rf $DADOS/skills/redes-sociais
cp -r $ORIGEM/skills/redes-sociais $DADOS/skills/
cp $ORIGEM/scripts/posts.py $ORIGEM/scripts/publicar-agendados.py $DADOS/scripts/
mkdir -p $DADOS/posts/{calendario,rascunhos,fila,enviando,publicados,erros,midias}
chown -R "$DONO" $DADOS/SOUL.md $DADOS/skills/redes-sociais $DADOS/scripts $DADOS/posts

docker compose --profile agente up -d hermes
h() { docker compose exec -T hermes hermes "$@"; }
for _ in $(seq 30); do h config get timezone >/dev/null 2>&1 && break; sleep 2; done

echo "==> Configuração do Hermes"
h config set HERMES_TIMEZONE America/Sao_Paulo
h config set META_API_CHAVE "$CHAVE" >/dev/null
h config set META_PUBLICAR_URL http://meta-publicar:8787
[[ -n "$MIDIAS_URL" ]] && h config set MIDIAS_URL_PUBLICA "$MIDIAS_URL"
# Os scripts do cron só recebem as variáveis listadas aqui.
docker compose exec -T hermes /opt/hermes/.venv/bin/python - <<'PY'
import yaml
caminho = "/opt/data/config.yaml"
with open(caminho) as f:
    cfg = yaml.safe_load(f) or {}
lista = cfg.setdefault("terminal", {}).setdefault("env_passthrough", []) or []
for nome in ("META_API_CHAVE", "META_PUBLICAR_URL", "MIDIAS_URL_PUBLICA", "HERMES_TIMEZONE"):
    if nome not in lista:
        lista.append(nome)
cfg["terminal"]["env_passthrough"] = lista
with open(caminho, "w") as f:
    yaml.safe_dump(cfg, f, allow_unicode=True, sort_keys=False)
PY

echo "==> Cron que publica a fila (a cada 5 min, sem gastar tokens)"
if h cron list 2>/dev/null | grep -q publicar-agendados; then
  echo "   já existe"
else
  h cron create "every 5m" --no-agent --script publicar-agendados.py \
    --deliver telegram --name publicar-agendados
fi

docker compose restart hermes >/dev/null
echo
echo "Pronto. No Telegram, mande /sethome para o bot (é para onde vão os avisos)"
echo "e depois: \"planeje os posts da próxima semana\"."
[[ -z "$MIDIAS_URL" ]] && echo "Aviso: sem MIDIAS_URL_PUBLICA, só funcionam mídias com URL https:// própria (veja hermes/README.md)."
exit 0
