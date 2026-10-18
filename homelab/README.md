# Homelab: notebook e celular antigos

O notebook vira o servidor (Docker), o celular Android vira um nó auxiliar
(Termux). O Tailscale liga os dois e dá acesso de fora de casa sem abrir portas
no roteador.

```
             Tailscale (VPN)
  celular ───────────────────── notebook (Docker)
  Termux                         ├─ núcleo: painel, Uptime Kuma, Syncthing, AdGuard
  ├─ SSH :8022                   ├─ industria: MQTT, Node-RED, InfluxDB, Grafana
  ├─ Syncthing (fotos, vault)    ├─ automacao: n8n
  └─ telemetria ──MQTT──────────►├─ midia: Jellyfin, File Browser
                                 ├─ dev: Gitea
  máquinas (Modbus/OPC-UA/S7) ──►└─ ia: Ollama + Open WebUI
```

## 0. Tem outro aparelho? Mande a foto

Tire uma foto do dispositivo (de preferência da etiqueta de modelo e das
portas), mande para o Claude e escreva **"conectar ao homelab"**. Ele
identifica o aparelho e devolve o passo a passo para ligá-lo à stack e ao
próprio Claude. Detalhes em [docs/conectar-claude.md](docs/conectar-claude.md).

Aparelhos já identificados e o papel de cada um: [docs/dispositivos.md](docs/dispositivos.md).

## 1. Notebook

1. Instale **Debian 12** ou **Ubuntu Server 24.04** (sem interface gráfica
   sobra mais RAM). Prefira cabo de rede a Wi-Fi.
2. Copie esta pasta para o notebook e rode:

```bash
sudo ./install.sh --so-detectar   # vê o hardware e os perfis sugeridos
sudo ./install.sh                 # instala e sobe
```

O script instala Docker e Tailscale, gera o `.env` com senhas aleatórias, cria o
usuário do MQTT e, se for notebook, desliga a suspensão ao fechar a tampa e
limita a carga da bateria em 80% (a bateria vira um nobreak).

Perfis escolhidos pela RAM:

| RAM      | Perfis além do núcleo              |
|----------|------------------------------------|
| < 3 GB   | industria (+ zram)                 |
| 3–6 GB   | industria, automacao, midia (+ zram) |
| 6–12 GB  | + dev                              |
| 12 GB+   | + ia                               |

Para trocar depois: edite `COMPOSE_PROFILES` no `.env` e rode
`docker compose up -d`. Ou force na instalação: `--perfis industria,ia`.

## 2. Celular Android

1. Instale pelo **F-Droid**: Termux, Termux:API e Termux:Boot. Abra o
   Termux:Boot uma vez.
2. Leve `celular/termux-setup.sh` para o celular (cabo USB ou
   `pkg install git && git clone` deste repo) e rode no Termux:

```bash
bash termux-setup.sh IP_DO_NOTEBOOK
```

3. Tire o Termux da otimização de bateria do Android.
4. Instale o app Tailscale no celular e entre na mesma conta.

O celular publica bateria, temperatura e Wi-Fi em
`homelab/celular/<modelo>/estado` a cada minuto. No Uptime Kuma, crie um monitor
MQTT nesse tópico para ser avisado se o celular cair.

Outros usos do celular: câmera de segurança ou de linha de produção com o app
**IP Webcam** (o stream entra no Node-RED ou no Home Assistant), e painel fixo
na parede abrindo o Grafana em tela cheia.

## 3. Máquinas de produção

O caminho dos dados: **máquina → Node-RED → MQTT → InfluxDB → Grafana**.

1. No Node-RED (`:1880`), menu → *Manage palette* → instale conforme o
   protocolo da máquina:
   - `node-red-contrib-modbus` (Modbus TCP/RTU, a maioria dos CLPs e inversores)
   - `node-red-contrib-opcua` (OPC-UA)
   - `node-red-contrib-s7` (Siemens S7)
   - `node-red-contrib-influxdb` (gravar no InfluxDB)
2. Monte o fluxo: leitura a cada N segundos → publica em
   `producao/<linha>/<maquina>/<variavel>` → grava no bucket `producao`
   (token `INFLUX_TOKEN` do `.env`).
3. No Grafana (`:3002`) o InfluxDB já vem configurado. Monte os painéis de
   OEE, ciclos, paradas e temperatura.
4. Alertas: Grafana alerting ou n8n mandando mensagem no Telegram/WhatsApp
   quando uma máquina parar.

**Segurança:** comece **só lendo** dados. Escrever em CLP a partir do Node-RED
pode ligar ou mover uma máquina; isso exige intertravamento no próprio CLP e
aval de quem responde pela máquina. Mantenha a rede das máquinas separada da
rede de casa/escritório (VLAN ou segunda placa de rede) e não exponha o MQTT
na internet; use o Tailscale.

## Portas

| Serviço      | Porta | Perfil    |
|--------------|-------|-----------|
| Homepage     | 3000  | núcleo    |
| Uptime Kuma  | 3001  | núcleo    |
| Syncthing    | 8384  | núcleo    |
| AdGuard      | 3080 (instalação), 8053, 53 | núcleo |
| Mosquitto    | 1883  | industria |
| Node-RED     | 1880  | industria |
| InfluxDB     | 8086  | industria |
| Grafana      | 3002  | industria |
| n8n          | 5678  | automacao |
| Jellyfin     | 8096  | midia     |
| File Browser | 8080  | midia     |
| Gitea        | 3003, SSH 2222 | dev |
| Open WebUI   | 3004  | ia        |
| Ollama       | 11434 | ia        |

## Dia a dia

```bash
docker compose ps                 # o que está rodando
docker compose logs -f node-red   # logs de um serviço
docker compose pull && docker compose up -d   # atualizar tudo
```

Backup: tudo que importa está em `data/` e no `.env`. Use o Syncthing para
mandar uma cópia de `data/` para outro aparelho, ou um `rsync` agendado.

O `organizar-downloads.sh` da raiz do repo pode rodar no notebook sobre a pasta
que o Syncthing recebe do celular, agendado pelo cron ou pelo n8n.
