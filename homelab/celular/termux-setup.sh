#!/data/data/com.termux/files/usr/bin/bash
# Transforma o Android antigo em nó do homelab, via Termux.
#
# Pré-requisitos (instale pelo F-Droid, não pela Play Store):
#   Termux, Termux:API e Termux:Boot
#
# Uso, dentro do Termux:
#   bash termux-setup.sh IP_DO_NOTEBOOK
#
# O que ele faz:
#   - SSH na porta 8022 (para administrar o celular pelo notebook)
#   - Syncthing (fotos e vault Obsidian vão para o notebook)
#   - Agente que publica bateria, temperatura e Wi-Fi no MQTT a cada minuto
#   - Tudo sobe sozinho no boot (Termux:Boot) e mantém wake-lock

set -euo pipefail

SERVIDOR="${1:-}"
[[ -n "$SERVIDOR" ]] || { echo "Uso: bash termux-setup.sh IP_DO_NOTEBOOK" >&2; exit 1; }

read -rp "Usuário MQTT [homelab]: " MQTT_USER; MQTT_USER="${MQTT_USER:-homelab}"
read -rsp "Senha MQTT (está no .env do notebook): " MQTT_PASSWORD; echo

pkg update -y
pkg install -y openssh syncthing termux-api mosquitto jq termux-services

termux-setup-storage || true   # acesso a DCIM e Download

echo "Defina uma senha para o SSH do celular:"
passwd

CONF="$HOME/.config/homelab"
mkdir -p "$CONF" "$HOME/.termux/boot"
cat > "$CONF/env" <<EOF
SERVIDOR=$SERVIDOR
MQTT_USER=$MQTT_USER
MQTT_PASSWORD=$MQTT_PASSWORD
NODO=$(getprop ro.product.model | tr ' ' '-')
EOF
chmod 600 "$CONF/env"

# Agente de telemetria: tópico homelab/celular/<modelo>/estado
cat > "$HOME/homelab-agente.sh" <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash
. "$HOME/.config/homelab/env"
while true; do
  bat=$(termux-battery-status 2>/dev/null || echo '{}')
  wifi=$(termux-wifi-connectioninfo 2>/dev/null || echo '{}')
  msg=$(jq -cn --argjson b "$bat" --argjson w "$wifi" \
    '{bateria: $b.percentage, carregando: $b.status, temperatura: $b.temperature,
      wifi: $w.ssid, sinal: $w.rssi, ts: now | floor}')
  mosquitto_pub -h "$SERVIDOR" -u "$MQTT_USER" -P "$MQTT_PASSWORD" \
    -t "homelab/celular/$NODO/estado" -r -m "$msg" || true
  sleep 60
done
EOF
chmod +x "$HOME/homelab-agente.sh"

cat > "$HOME/.termux/boot/homelab" <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
sshd
pgrep -x syncthing >/dev/null || syncthing --no-browser >/dev/null 2>&1 &
pgrep -f homelab-agente.sh >/dev/null || "$HOME/homelab-agente.sh" >/dev/null 2>&1 &
EOF
chmod +x "$HOME/.termux/boot/homelab"
"$HOME/.termux/boot/homelab"

IP=$(ip -4 addr show wlan0 2>/dev/null | awk '/inet / {print $2}' | cut -d/ -f1)
cat <<EOF

Pronto.
  SSH:        ssh -p 8022 $(whoami)@${IP:-IP_DO_CELULAR}
  Syncthing:  http://127.0.0.1:8384 (no navegador do celular)
  Telemetria: homelab/celular/<modelo>/estado em $SERVIDOR:1883

Nas configurações do Android, tire o Termux da otimização de bateria,
senão o sistema mata os processos.
EOF
