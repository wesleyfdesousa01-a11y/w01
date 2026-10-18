# Smart TV: monitor + Dell + Moto G8 Plus

```
 Moto G8 Plus  ──Wi-Fi──►  Dell E5450  ──HDMI/VGA──►  Monitor
 (controle: Kore,          (Kodi em tela cheia,        (+ caixinha de som
  Jellyfin, YouTube)        Jellyfin do homelab)        se o monitor não tiver)
```

## Por que o celular não liga direto no monitor

O Moto G8 Plus **não tem saída de vídeo pelo USB-C**: um adaptador USB-C →
HDMI não funciona nele. Por isso quem desenha a tela é o Dell, que já fica
ligado 24 h como servidor e tem saída **HDMI e VGA**. O celular vira o
controle remoto e a "fonte" do que assistir.

Se um dia quiser o celular sozinho na TV, só com um Chromecast ou TV box no
monitor (aí o espelhamento de tela funciona).

## Montagem

1. Ligue o Dell no monitor pelo **HDMI** (leva áudio também, se o monitor
   tiver alto-falante). Pelo VGA só vai imagem; use a saída de fone do Dell
   numa caixinha de som.
2. A tampa do Dell pode ficar fechada: o `install.sh` já desligou a suspensão.
3. No Dell: `sudo ./tv/instalar-tv.sh`
4. No Kodi, ative o controle remoto (o script mostra onde) e instale os
   add-ons **Jellyfin** e **YouTube**.
5. No Moto G8 Plus, instale **Kore** e **Jellyfin**.

## O que dá para assistir

| Conteúdo | Como |
|---|---|
| Filmes e séries seus | Jellyfin do homelab (perfil `midia`), pelo add-on no Kodi |
| YouTube | Add-on YouTube do Kodi (pede uma chave de API do Google na configuração) |
| Fotos e vídeos do celular | Syncthing manda para `media/`, o Jellyfin mostra |
| IPTV / canais abertos | Add-on "PVR IPTV Simple Client" com uma lista M3U |
| Netflix, Globoplay, Prime | **Não funciona bem** no Kodi/Linux. Melhor um Chromecast/TV box |

## Espelhar a tela do celular (plano B)

Sem instalar o Kodi, dá para mostrar a tela do Moto no monitor com o `scrcpy`
rodando no Dell (precisa de interface gráfica). Limitações: sem áudio no
Android 10, e apps com DRM (Netflix etc.) aparecem pretos.

## O servidor continua funcionando?

Sim. O Kodi usa pouca CPU parado e a stack Docker segue rodando. Durante um
vídeo pesado, IA local (perfil `ia`) e transcodificação do Jellyfin ficam
lentas; se o Dell tiver 4 GB, evite usar os dois ao mesmo tempo.
