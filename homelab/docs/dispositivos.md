# Inventário de dispositivos

Identificados pela foto de 18/10/2026. Confirme os celulares em
**Configurações → Sobre o telefone** e corrija aqui se algum estiver errado.

| Aparelho | Identificação | Confiança | Papel na stack |
|---|---|---|---|
| Dell Latitude E5450 | Escrito no teclado | Alta | **Servidor** (Docker, toda a stack) |
| Xiaomi Mi A2 (ou Mi 6X) | Logo MI, câmera dupla com flash no meio, corpo fosco. **Liga, mas a tela está com defeito** | Média | **Nó Termux sem tela**, controlado pelo notebook com scrcpy |
| Motorola One Hyper | Câmera frontal pop-up, câmera dupla, "motorola one" na traseira | Média | **Painel fixo**: Homepage/Grafana na parede |
| Motorola Moto G8 Plus | "48MP", câmera de ação separada + laser | Média | **Controle da smart TV** (Kore, Jellyfin); ver `tv/README.md` |

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

### Xiaomi Mi A2: nó Termux sem tela

O aparelho liga, mas a tela está com defeito. Para nó Termux isso não
atrapalha: depois de configurado ele não precisa de tela. O problema é só
configurar. A saída é o **scrcpy**, que mostra e controla a tela do celular
numa janela do notebook (o `install.sh` instala o `scrcpy` junto com o `adb`).

O caminho depende do que a tela ainda faz:

| Situação da tela | O que fazer |
|---|---|
| Mostra imagem, mas o toque não funciona | Cabo **OTG + mouse USB**: liga a depuração USB com o mouse e depois usa o scrcpy |
| Toque funciona, mas a imagem não aparece | Ligar a depuração "no escuro" é difícil; teste o scrcpy primeiro, a depuração pode já estar ligada |
| Nem imagem, nem toque | Se a depuração USB já estava ligada antes, o scrcpy funciona direto. Se não, troque a tela (peça barata para o Mi A2) ou deixe ele de reserva |

Com a depuração ligada, no notebook (precisa de interface gráfica ou de outro
PC com scrcpy):

```bash
adb devices      # aceite a chave: ela aparece na janela do scrcpy
scrcpy           # a tela do Mi abre no notebook, use mouse e teclado
```

Pelo scrcpy, instale o Termux, Termux:API e Termux:Boot (F-Droid) e rode:

```bash
bash termux-setup.sh IP_DO_NOTEBOOK
```

Depois disso ele fica sem tela de vez: SSH na porta 8022, Syncthing e
telemetria no tópico `homelab/celular/<modelo>/estado`. Ative também
`adb tcpip 5555` para o Claude Code alcançar o celular sem cabo.

Se o Ubuntu Server do notebook não tiver interface gráfica, rode o scrcpy em
outro computador (existe para Windows, Mac e Linux) só para essa configuração.

### Motorola One Hyper: painel na parede

- Instale o **Fully Kiosk Browser** (ou use o Chrome em tela cheia) e abra
  `http://IP_DO_NOTEBOOK:3000` ou um painel do Grafana.
- Pelo ADB, mantenha a tela ligada na tomada:
  `adb shell settings put global stay_on_while_plugged_in 3`
- A traseira está trincada: não importa na parede, mas veja o aviso de bateria
  abaixo.

### Moto G8 Plus: controle da smart TV

- Vira o controle remoto do monitor transformado em TV: o Dell roda o Kodi e
  manda a imagem pelo HDMI. Passo a passo em [../tv/README.md](../tv/README.md).
- Ele não tem saída de vídeo pelo USB-C, por isso não liga direto no monitor.
- A câmera da produção pode ir para o One Hyper (IP Webcam) se precisar.

## Aviso: bateria de celular ligado na tomada o tempo todo

Celular velho 24 h na tomada pode **estufar a bateria**. Faça assim:

- Antes de começar, olhe se a traseira ou a tela estão levantando. O One Hyper
  com a traseira trincada merece atenção extra. Se estufou, não use: leve
  para descarte.
- Use uma **tomada inteligente** ligando 1 h e desligando 3 h, ou automatize
  pelo n8n lendo a bateria que o celular manda no MQTT (liga abaixo de 30%,
  desliga acima de 80%).
- Deixe em lugar ventilado, longe de papel e longe das máquinas.
