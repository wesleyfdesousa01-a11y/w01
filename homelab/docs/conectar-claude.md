# Conectar o Claude a um dispositivo pela foto

Mande uma foto do aparelho numa conversa com o Claude (app, claude.ai ou
Claude Code) e escreva: **"conectar ao homelab"**. O Claude identifica o
aparelho e responde com o passo a passo para ligá-lo à stack e ao próprio
Claude. As regras que ele segue estão em [`../CLAUDE.md`](../CLAUDE.md).

## Como tirar a foto

Uma foto boa poupa perguntas. Se der, mande duas:

1. **Etiqueta** com marca, modelo e número de série (embaixo do notebook, atrás
   da bateria do celular, na lateral do CLP ou do painel).
2. **Portas e conectores** (USB, rede RJ45, serial RS-485/RS-232, bornes) ou a
   **tela** ligada, se tiver.

Escreva junto o que souber: sistema instalado, para que o aparelho serve e se
ele está ligado a alguma máquina.

## Os caminhos de conexão

O Claude escolhe um destes conforme o que aparecer na foto.

| Aparelho                          | Como o Claude entra                                   |
|-----------------------------------|-------------------------------------------------------|
| Notebook ou PC com Linux          | Claude Code instalado nele, rodando na pasta `homelab/` |
| Notebook com Windows              | Trocar por Linux (servidor) ou Claude Code no WSL      |
| Android                           | App Claude no celular; SSH pelo Termux a partir do notebook |
| iPhone / iPad                     | App Claude; o aparelho vira cliente (painel, Tailscale) |
| Raspberry Pi / mini PC            | Igual ao notebook Linux                                |
| CLP, inversor, IHM, sensor        | **Nunca direto.** Node-RED lê a máquina; o Claude lê os dados no InfluxDB/MQTT |
| Roteador, câmera IP, smart TV     | Pelo painel web ou pela integração no Node-RED/n8n      |

### Notebook ou PC Linux

```bash
curl -fsSL https://claude.ai/install.sh | bash
cd ~/homelab && claude
```

Dentro da pasta `homelab/`, o Claude Code lê o `CLAUDE.md` e já conhece a
stack: pode ver `docker compose ps`, ler logs e ajustar o `.env` (sempre
pedindo sua permissão antes de mudar algo).

### Android antigo

- O jeito simples é o **app Claude** da Play Store: serve para conversar e
  mandar fotos dos outros aparelhos.
- Para o Claude **administrar** o celular, rode o `celular/termux-setup.sh` e
  deixe o Claude Code do notebook entrar por SSH:
  `ssh -p 8022 usuario@IP_DO_CELULAR`.

### Máquinas de produção

O Claude não fala com o CLP. O caminho é:

```
máquina ──Modbus/OPC-UA/S7──► Node-RED ──► MQTT / InfluxDB ◄── Claude (só leitura)
```

Pela foto da etiqueta, o Claude diz qual protocolo a máquina usa, qual pacote
do Node-RED instalar e quais registradores/endereços procurar no manual. Depois
ele pode consultar os dados gravados, montar painéis no Grafana e propor
alertas. Comandos que **escrevem** na máquina ficam fora: isso é decisão de
quem responde por ela, com intertravamento no próprio CLP.

## O que o Claude devolve

1. **O que é:** marca, modelo, ano aproximado e a confiança da identificação.
2. **Papel na stack:** servidor, nó auxiliar, cliente ou fonte de dados.
3. **Passo a passo** com os comandos prontos, usando os IPs e portas do homelab.
4. **Como testar** que ficou conectado.
5. **Riscos** e o que não fazer com aquele aparelho.
