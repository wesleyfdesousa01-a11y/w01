#!/usr/bin/env bash
# Prepara o notebook antigo como servidor e sobe a stack.
#
# Uso (no notebook, com Debian/Ubuntu já instalado):
#   sudo ./install.sh                 # detecta o hardware e escolhe os perfis
#   sudo ./install.sh --perfis industria,automacao   # força os perfis
#   sudo ./install.sh --so-detectar   # só mostra o hardware e a sugestão
#
# Opções:
#   --perfis LISTA   Perfis separados por vírgula (industria,automacao,midia,dev,ia,agente)
#   --so-detectar    Não instala nada
#   --sem-tailscale  Pula a instalação do Tailscale
#   -h, --help       Ajuda

set -euo pipefail
cd "$(dirname "$0")"

PERFIS=""
SO_DETECTAR=0
TAILSCALE=1

usage() { sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --perfis)        PERFIS="$2"; shift 2 ;;
    --so-detectar)   SO_DETECTAR=1; shift ;;
    --sem-tailscale) TAILSCALE=0; shift ;;
    -h|--help)       usage 0 ;;
    *) echo "Opção desconhecida: $1" >&2; usage 1 ;;
  esac
done

# ------------------------------------------------------------ detecção
RAM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
CPUS=$(nproc)
DISCO_GB=$(df -BG --output=avail . | tail -1 | tr -dc '0-9')
ARCH=$(uname -m)
BATERIA=0; compgen -G "/sys/class/power_supply/BAT*" >/dev/null && BATERIA=1

# Perfis por faixa de RAM. "industria" vem primeiro: é leve e é a prioridade.
sugerir_perfis() {
  if   (( RAM_MB < 3000 ));  then echo "industria"
  elif (( RAM_MB < 6000 ));  then echo "industria,automacao,midia"
  elif (( RAM_MB < 12000 )); then echo "industria,automacao,midia,dev"
  else                            echo "industria,automacao,midia,dev,ia"
  fi
}
[[ -n "$PERFIS" ]] || PERFIS="$(sugerir_perfis)"

echo "Hardware detectado"
echo "  RAM:     ${RAM_MB} MB"
echo "  CPUs:    ${CPUS} (${ARCH})"
echo "  Disco:   ${DISCO_GB} GB livres"
echo "  Bateria: $([[ $BATERIA -eq 1 ]] && echo sim || echo não)"
echo "  Perfis:  núcleo + ${PERFIS}"
(( RAM_MB < 3000 )) && echo "  Aviso: pouca RAM, vou ativar zram para dar fôlego."
[[ ",$PERFIS," == *",ia,"* ]] && (( RAM_MB < 8000 )) && \
  echo "  Aviso: perfil ia com menos de 8GB vai ficar lento; use modelos de 1-3B."
[[ $SO_DETECTAR -eq 1 ]] && exit 0

[[ $EUID -eq 0 ]] || { echo "Rode com sudo." >&2; exit 1; }
command -v apt-get >/dev/null || { echo "Este script espera Debian/Ubuntu." >&2; exit 1; }
DONO="${SUDO_USER:-root}"

# ------------------------------------------------------------ sistema
echo; echo "==> Pacotes base"
apt-get update -qq
apt-get install -y -qq curl ca-certificates openssl tlp adb scrcpy >/dev/null

if ! command -v docker >/dev/null; then
  echo "==> Docker"
  curl -fsSL https://get.docker.com | sh
fi
[[ "$DONO" != root ]] && usermod -aG docker "$DONO"

if (( RAM_MB < 6000 )) && ! swapon --show | grep -q zram; then
  echo "==> zram (swap comprimida em RAM)"
  apt-get install -y -qq zram-tools >/dev/null
  printf 'ALGO=zstd\nPERCENT=50\n' > /etc/default/zramswap
  systemctl restart zramswap || true
fi

if [[ $BATERIA -eq 1 ]]; then
  echo "==> Notebook: não suspender ao fechar a tampa"
  mkdir -p /etc/systemd/logind.conf.d
  cat > /etc/systemd/logind.conf.d/homelab.conf <<'EOF'
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
EOF
  systemctl restart systemd-logind || true
  systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null
  # Bateria sempre na tomada estufa: limita a carga quando o hardware deixa.
  cat > /etc/tlp.d/90-homelab.conf <<'EOF'
START_CHARGE_THRESH_BAT0=40
STOP_CHARGE_THRESH_BAT0=80
EOF
  systemctl enable --now tlp >/dev/null 2>&1 || true
fi

# AdGuard precisa da porta 53, que o systemd-resolved ocupa no Ubuntu.
if systemctl is-active -q systemd-resolved; then
  echo "==> Liberando a porta 53 para o AdGuard"
  mkdir -p /etc/systemd/resolved.conf.d
  printf '[Resolve]\nDNSStubListener=no\nDNS=1.1.1.1\n' > /etc/systemd/resolved.conf.d/adguard.conf
  ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
  systemctl restart systemd-resolved
fi

if [[ $TAILSCALE -eq 1 ]] && ! command -v tailscale >/dev/null; then
  echo "==> Tailscale (acesso de fora de casa sem abrir portas)"
  curl -fsSL https://tailscale.com/install.sh | sh
fi

# ------------------------------------------------------------ .env
IP=$(hostname -I | awk '{print $1}')
if [[ ! -f .env ]]; then
  echo "==> Gerando .env com senhas aleatórias"
  segredo() { openssl rand -hex "${1:-16}"; }
  cat > .env <<EOF
COMPOSE_PROFILES=${PERFIS}
TZ=America/Sao_Paulo
PUID=$(id -u "$DONO")
PGID=$(id -g "$DONO")
HOMEPAGE_VAR_HOST=${IP}
MEDIA_DIR=./media
MQTT_USER=homelab
MQTT_PASSWORD=$(segredo)
INFLUX_PASSWORD=$(segredo)
INFLUX_TOKEN=$(segredo 32)
GRAFANA_PASSWORD=$(segredo 8)
# Meta (Instagram/Facebook/Threads): preencha os IDs dos apps, veja meta/README.md
META_API_CHAVE=$(segredo 24)
META_APP_ID=
META_APP_SECRET=
META_IG_APP_ID=
META_IG_APP_SECRET=
META_THREADS_APP_ID=
META_THREADS_APP_SECRET=
META_REDIRECT_URI=https://localhost/
EOF
  chmod 600 .env
else
  sed -i "s/^COMPOSE_PROFILES=.*/COMPOSE_PROFILES=${PERFIS}/" .env
  if ! grep -q '^META_API_CHAVE=' .env; then
    echo "==> Acrescentando META_API_CHAVE ao .env (API do meta-publicar)"
    echo "META_API_CHAVE=$(openssl rand -hex 24)" >> .env
  fi
fi
set -a; . ./.env; set +a

mkdir -p data/filebrowser media
touch data/filebrowser/database.db

if [[ ! -s config/mosquitto/passwd ]]; then
  echo "==> Usuário do MQTT"
  docker run --rm -v "$PWD/config/mosquitto:/mosquitto/config" eclipse-mosquitto:2 \
    sh -c "mosquitto_passwd -b -c /mosquitto/config/passwd '$MQTT_USER' '$MQTT_PASSWORD' \
           && chown mosquitto:mosquitto /mosquitto/config/passwd && chmod 0700 /mosquitto/config/passwd"
fi

# Node-RED roda como uid 1000 dentro do container.
mkdir -p data/node-red && chown -R 1000:1000 data/node-red
# meta-publicar também (guarda os tokens em data/meta/tokens.json).
mkdir -p data/meta && chown -R 1000:1000 data/meta && chmod 700 data/meta
chown "$DONO": .env

# ------------------------------------------------------------ sobe
echo "==> Subindo a stack"
docker compose pull -q --ignore-buildable
docker compose up -d

cat <<EOF

Pronto. Painel: http://${IP}:3000

  Uptime Kuma  http://${IP}:3001     Syncthing  http://${IP}:8384
  AdGuard      http://${IP}:3080 (instalação) -> depois http://${IP}:8053
  Node-RED     http://${IP}:1880     Grafana    http://${IP}:3002  (admin / ${GRAFANA_PASSWORD})
  MQTT         ${IP}:1883  usuário ${MQTT_USER}, senha no .env

Próximos passos:
  1. sudo tailscale up            (e instale o Tailscale no celular)
  2. No celular: bash celular/termux-setup.sh ${IP}
  3. Aponte o DNS do roteador para ${IP} se quiser o AdGuard na casa toda
EOF
