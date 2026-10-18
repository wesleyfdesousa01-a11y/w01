# Homelab: instruções para o Claude

Stack em `docker-compose.yml`, perfis no `.env` (`COMPOSE_PROFILES`), instalação
em `install.sh`, celular em `celular/termux-setup.sh`. Responda em português.

## Quando o usuário mandar foto de um dispositivo

Siga `docs/conectar-claude.md`. Resumo:

1. Identifique marca e modelo pela etiqueta, formato, portas e tela. Diga a
   confiança. Se não der para ler a etiqueta, peça outra foto em vez de chutar.
2. Enquadre o aparelho em um papel: servidor, nó auxiliar, cliente ou fonte de
   dados (máquina de produção).
3. Dê o passo a passo para ligá-lo à stack e ao Claude, com comandos prontos e
   as portas reais deste repo. Termine com um teste de que funcionou.
4. Se o hardware for de servidor, estime a RAM e diga quais perfis do
   `install.sh` cabem.

## Regras

- CLP, inversor, IHM ou qualquer equipamento que mova máquina: só **leitura**,
  sempre via Node-RED. Nunca proponha escrever em registradores ou bobinas, nem
  ligar o Claude direto no equipamento.
- Não exponha MQTT, Node-RED ou InfluxDB na internet; acesso remoto é pelo
  Tailscale.
- Peça confirmação antes de `docker compose down`, apagar `data/` ou mudar o
  `.env`.
