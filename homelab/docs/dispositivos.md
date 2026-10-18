# Inventário de dispositivos

Identificados pela foto de 18/10/2026. Confirme os celulares em
**Configurações → Sobre o telefone** e corrija aqui se algum estiver errado.

| Aparelho | Identificação | Confiança | Papel na stack |
|---|---|---|---|
| Dell Latitude E5450 | Escrito no teclado | Alta | **Servidor** (Docker, toda a stack) |
| Xiaomi Mi A2 (ou Mi 6X) | Logo MI, câmera dupla com flash no meio, corpo fosco | Média | **Nó Termux**: SSH, Syncthing, telemetria |
| Motorola One Hyper | Câmera frontal pop-up, câmera dupla, "motorola one" na traseira | Média | **Painel fixo**: Homepage/Grafana na parede |
| Motorola Moto G8 Plus | "48MP", câmera de ação separada + laser | Média | **Câmera** da produção/segurança (IP Webcam) |

## Dell Latitude E5450 (servidor)

- Intel Core de 5ª geração (i3/i5/i7 dual-core), RAM DDR3L em 2 slots
  (máx. 16 GB), disco SATA 2,5", porta de rede gigabit, bateria removível.
- Melhorias baratas que valem a pena, nesta ordem:
  1. **SSD SATA** no lugar do HD, se ainda for HD.
  2. **16 GB de RAM** (2× 8 GB DDR3L 1600 SODIMM, usados custam pouco).
- Instale **Ubuntu Server 24.04** ou **Debian 12** por cima do Windows, ligue
  pelo **cabo de rede** e rode `sudo ./install.sh`.
- Perfis esperados: com 8 GB, `industria,automacao,midia,dev`; com 16 GB,
  entra `ia`, mas a CPU dual-core só aguenta modelos de 1–3B.
- O Claude entra pelo Claude Code instalado nele (veja `conectar-claude.md`).

## Os três celulares

Os três rodam Android quase puro (Android One / Motorola), o que ajuda: o
sistema mata menos processos em segundo plano do que a MIUI.

O Claude Code do notebook controla os celulares por **ADB pela rede** (o
`install.sh` instala o `adb`). Uma vez em cada celular:

1. Configurações → Sobre o telefone → toque 7× em **Número da versão**.
2. Opções do desenvolvedor → ligue **Depuração USB**.
3. Ligue no notebook pelo cabo e rode:

```bash
adb devices            # aceite a chave na tela do celular
adb tcpip 5555         # libera o ADB pela rede
adb connect IP_DO_CELULAR:5555
```

Daí o Claude Code consegue tirar print da tela, instalar apps, manter a tela
ligada e reiniciar apps travados, sem você pegar no celular.

### Xiaomi Mi A2: nó Termux

```bash
bash termux-setup.sh IP_DO_NOTEBOOK
```

SSH na porta 8022, Syncthing e telemetria no tópico
`homelab/celular/<modelo>/estado`.

### Motorola One Hyper: painel na parede

- Instale o **Fully Kiosk Browser** (ou use o Chrome em tela cheia) e abra
  `http://IP_DO_NOTEBOOK:3000` ou um painel do Grafana.
- Pelo ADB, mantenha a tela ligada na tomada:
  `adb shell settings put global stay_on_while_plugged_in 3`
- A traseira está trincada: não importa na parede, mas veja o aviso de bateria
  abaixo.

### Moto G8 Plus: câmera

- Instale o **IP Webcam**, inicie o servidor e use
  `http://IP_DO_CELULAR:8080/video` no Node-RED, no Grafana ou num NVR.
- A câmera de ação (ultra-wide) é boa para filmar uma linha de produção
  inteira com o celular na vertical.
- Deixe na tomada; ele já estava carregando na foto.

## Aviso: bateria de celular ligado na tomada o tempo todo

Celular velho 24 h na tomada pode **estufar a bateria**. Faça assim:

- Antes de começar, olhe se a traseira ou a tela estão levantando. O One Hyper
  com a traseira trincada merece atenção extra. Se estufou, não use: leve
  para descarte.
- Use uma **tomada inteligente** ligando 1 h e desligando 3 h, ou automatize
  pelo n8n lendo a bateria que o celular manda no MQTT (liga abaixo de 30%,
  desliga acima de 80%).
- Deixe em lugar ventilado, longe de papel e longe das máquinas.
