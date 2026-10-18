#!/usr/bin/env bash
# Transforma o monitor numa smart TV: o Dell manda a imagem pelo HDMI (ou VGA)
# rodando o Kodi em tela cheia, e o Moto G8 Plus vira o controle remoto.
#
# O Moto G8 Plus não tem saída de vídeo pelo USB-C, por isso quem liga no
# monitor é o notebook. O celular controla tudo pela rede.
#
# Uso (no Dell, depois do install.sh):
#   sudo ./tv/instalar-tv.sh
#
# Desfazer:
#   sudo systemctl disable --now kodi

set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Rode com sudo." >&2; exit 1; }
command -v apt-get >/dev/null || { echo "Este script espera Debian/Ubuntu." >&2; exit 1; }

echo "==> Pacotes (Xorg mínimo + Kodi, sem desktop completo)"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
  xserver-xorg xinit kodi pulseaudio alsa-utils dbus-x11 >/dev/null

echo "==> Usuário 'kodi'"
id kodi >/dev/null 2>&1 || useradd -m -s /usr/sbin/nologin kodi
for g in audio video input render tty plugdev; do
  getent group "$g" >/dev/null && usermod -aG "$g" kodi
done

# Deixa um usuário de serviço abrir o X sem login no console.
cat > /etc/X11/Xwrapper.config <<'EOF'
allowed_users=anybody
needs_root_rights=yes
EOF

echo "==> Serviço que abre o Kodi no boot"
cat > /etc/systemd/system/kodi.service <<'EOF'
[Unit]
Description=Kodi em tela cheia (smart TV)
After=network-online.target sound.target systemd-user-sessions.service
Wants=network-online.target

[Service]
User=kodi
Group=kodi
PAMName=login
TTYPath=/dev/tty7
ExecStart=/usr/bin/xinit /usr/bin/kodi-standalone -- :0 -nolisten tcp vt7
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now kodi

IP=$(hostname -I | awk '{print $1}')
cat <<EOF

Pronto. O Kodi deve aparecer no monitor em alguns segundos.

No Kodi (uma vez, com teclado/mouse no Dell):
  Configurações > Serviços > Controle:
    - Permitir controle remoto via HTTP   (porta 8080 -> mude para 8081,
      a 8080 já é do File Browser)
    - Permitir controle remoto por aplicativos neste e em outros sistemas

No Moto G8 Plus:
  - App "Kore" (controle oficial do Kodi): adicionar mídia center ${IP}, porta 8081
  - App "Jellyfin": assistir no celular ou mandar para o Kodi

Add-ons recomendados no Kodi: "Jellyfin" (sua biblioteca do homelab) e "YouTube".
EOF
