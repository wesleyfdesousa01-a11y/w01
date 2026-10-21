#!/usr/bin/env python3
"""Fila de posts do agente Hermes. Só biblioteca padrão.

Pastas (dentro de $HERMES_HOME/posts):
  rascunhos/   posts criados pelo agente, esperando aprovação
  fila/        aprovados; saem na hora marcada em "quando"
  enviando/    sendo publicados agora
  publicados/  saíram (o JSON ganha "resultado")
  erros/       não saíram; corrija e aprove de novo
  midias/      imagens e vídeos; precisam estar acessíveis em $MIDIAS_URL_PUBLICA

Uso:
  posts.py midia ORIGEM NOME         guarda uma mídia (arquivo ou URL) em midias/; foto vira JPEG
  posts.py validar ARQUIVO.json      confere um post antes de salvar
  posts.py listar [pasta]            resumo do que há em cada pasta
  posts.py aprovar ID|todos          move de rascunhos/ (ou erros/) para fila/
  posts.py cancelar ID               devolve da fila/ para rascunhos/
  posts.py publicar                  publica o que venceu (o cron chama a cada 5 min)
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ZONA = ZoneInfo(os.environ.get("HERMES_TIMEZONE") or "America/Sao_Paulo")
BASE = Path(os.environ.get("HERMES_POSTS_DIR") or Path(os.environ.get("HERMES_HOME", "/opt/data")) / "posts")
API = os.environ.get("META_PUBLICAR_URL", "http://meta-publicar:8787").rstrip("/")
MIDIAS_URL = (os.environ.get("MIDIAS_URL_PUBLICA") or "").rstrip("/")
EXT_VIDEO = (".mp4", ".mov", ".m4v")
NOME_SEGURO = re.compile(r"^[a-z0-9][a-z0-9_-]{0,100}$")
PASTAS = ("rascunhos", "fila", "enviando", "publicados", "erros")
DESTINOS = {"instagram", "facebook", "threads"}
TIPOS = {"texto", "foto", "video", "reels", "story", "carrossel"}
LIMITE = {"instagram": 2200, "threads": 500}


def pasta(nome: str) -> Path:
    p = BASE / nome
    p.mkdir(parents=True, exist_ok=True)
    return p


def quando(post: dict) -> datetime:
    d = datetime.fromisoformat(str(post["quando"]).replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=ZONA)


def textos(post: dict) -> dict:
    """Texto final de cada destino: "textos" por rede sobrepõe "texto"."""
    por_rede = post.get("textos") or {}
    return {d: por_rede.get(d) or post.get("texto") or "" for d in post["destinos"]}


def url_midia(m) -> str:
    """URL https:// fica como está; nome de arquivo vira link público de midias/."""
    valor = str(m.get("url") if isinstance(m, dict) else m)
    if valor.startswith("https://"):
        return valor
    nome = Path(valor).name
    if not (BASE / "midias" / nome).is_file():
        raise ValueError(f"mídia '{nome}' não está em midias/ (use posts.py midia)")
    if not MIDIAS_URL.startswith("https://"):
        raise ValueError("MIDIAS_URL_PUBLICA não definida; use URL https:// ou veja o README (hospedagem de mídias)")
    return f"{MIDIAS_URL}/{urllib.parse.quote(nome)}"


def midias_publicas(post: dict) -> list:
    saida = []
    for m in post.get("midias") or []:
        url = url_midia(m)
        saida.append({**m, "url": url} if isinstance(m, dict) else url)
    return saida


def validar(post: dict) -> list[str]:
    erros = []
    try:
        quando(post)
    except (KeyError, ValueError):
        erros.append('"quando" ausente ou inválido; use 2026-10-25T18:00')
    destinos = post.get("destinos")
    if not destinos or not isinstance(destinos, list) or set(destinos) - DESTINOS:
        erros.append(f'"destinos" deve ser lista com: {", ".join(sorted(DESTINOS))}')
        return erros
    tipo = post.get("tipo")
    if tipo not in TIPOS:
        erros.append(f'"tipo" deve ser um de: {", ".join(sorted(TIPOS))}')
    midias = post.get("midias") or []
    for m in midias:
        try:
            url_midia(m)
        except ValueError as e:
            erros.append(str(e))
    precisa = {"texto": (0, 0), "carrossel": (2, 10)}.get(tipo, (1, 1))
    if tipo in TIPOS and not precisa[0] <= len(midias) <= precisa[1]:
        erros.append(f'"{tipo}" precisa de {precisa[0]}-{precisa[1]} mídia(s), tem {len(midias)}')
    if tipo == "texto" and "instagram" in destinos:
        erros.append("Instagram não aceita post só de texto")
    if tipo == "story" and set(destinos) - {"instagram"}:
        erros.append("story só existe no Instagram")
    for d, t in textos(post).items():
        if d in LIMITE and len(t) > LIMITE[d]:
            erros.append(f"{d}: texto com {len(t)} caracteres, máximo {LIMITE[d]}")
        if tipo == "texto" and not t and not post.get("link"):
            erros.append(f"{d}: post de texto sem texto")
    return erros


def ler(arquivo: Path) -> dict:
    return json.loads(arquivo.read_text(encoding="utf-8"))


def gravar(arquivo: Path, post: dict) -> None:
    arquivo.write_text(json.dumps(post, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def achar(ident: str, onde: tuple[str, ...]) -> list[Path]:
    achados = []
    for nome in onde:
        for f in sorted(pasta(nome).glob("*.json")):
            if ident == "todos" or f.stem == ident or f.name == ident:
                achados.append(f)
    return achados


def chamar_api(corpo: dict) -> tuple[int, dict]:
    chave = os.environ.get("META_API_CHAVE")
    if not chave:
        raise SystemExit("META_API_CHAVE não chegou ao script (veja terminal.env_passthrough no README)")
    req = urllib.request.Request(f"{API}/publicar", data=json.dumps(corpo).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {chave}"})
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except ValueError:
            return e.code, {"erro": f"HTTP {e.code}"}
    except urllib.error.URLError as e:
        return 0, {"erro": f"meta-publicar fora do ar: {e.reason}"}


def publicar_um(post: dict) -> dict:
    """Uma chamada por texto diferente, para cada rede receber a sua legenda."""
    grupos: dict[str, list[str]] = {}
    for destino, texto in textos(post).items():
        grupos.setdefault(texto, []).append(destino)
    resultado = {}
    for texto, destinos in grupos.items():
        corpo = {"destinos": destinos, "tipo": post["tipo"], "texto": texto,
                 "midias": midias_publicas(post), "link": post.get("link"), "capa": post.get("capa")}
        status, resp = chamar_api({k: v for k, v in corpo.items() if v not in (None, "")})
        if status in (200, 207):
            resultado.update(resp)
        else:
            for d in destinos:
                resultado[d] = {"ok": False, "erro": resp.get("erro") or f"HTTP {status}"}
    return resultado


def cmd_publicar() -> None:
    agora = datetime.now(ZONA)
    linhas = []
    for arquivo in sorted(pasta("fila").glob("*.json")):
        try:
            post = ler(arquivo)
            vence = quando(post)
        except (ValueError, KeyError) as e:
            arquivo.rename(pasta("erros") / arquivo.name)
            linhas.append(f"❌ {arquivo.stem}: JSON inválido ({e})")
            continue
        if vence > agora:
            continue
        enviando = pasta("enviando") / arquivo.name
        try:
            arquivo.rename(enviando)  # rename é atômico: duas rodadas não pegam o mesmo post
        except FileNotFoundError:
            continue
        problemas = validar(post)
        resultado = ({d: {"ok": False, "erro": "; ".join(problemas)} for d in post.get("destinos") or ["?"]}
                     if problemas else publicar_um(post))
        certos = [d for d, r in resultado.items() if r.get("ok")]
        post["resultado"] = resultado
        post["publicado_em"] = agora.isoformat(timespec="minutes") if certos else None
        gravar(enviando, post)
        enviando.rename(pasta("publicados" if certos else "erros") / arquivo.name)
        icone = "✅" if len(certos) == len(resultado) else "⚠️" if certos else "❌"
        detalhes = "; ".join(f"{d}: {r.get('url') or r.get('id')}" if r.get("ok") else f"{d}: {r.get('erro')}"
                             for d, r in resultado.items())
        linhas.append(f"{icone} {arquivo.stem} — {detalhes}")
    if linhas:  # saída vazia = rodada silenciosa no cron do Hermes
        print("Posts publicados agora:\n" + "\n".join(linhas))


def converter_jpeg(origem: Path, destino: Path) -> None:
    try:
        from PIL import Image
    except ImportError:
        if not shutil.which("ffmpeg"):
            raise RuntimeError("sem Pillow nem ffmpeg no container") from None
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(origem), "-q:v", "2", str(destino)],
                       check=True)
        return
    with Image.open(origem) as img:
        img.convert("RGB").save(destino, "JPEG", quality=92)


def cmd_midia(origem: str, nome: str) -> int:
    nome = Path(nome.lower()).stem
    if not NOME_SEGURO.match(nome):
        print("Nome só com letras minúsculas, números, ponto, hífen e sublinhado")
        return 1
    with tempfile.TemporaryDirectory() as tmp:
        bruto = Path(tmp) / "original"
        if origem.startswith(("http://", "https://")):
            with urllib.request.urlopen(origem, timeout=120) as r, open(bruto, "wb") as f:
                shutil.copyfileobj(r, f)
        else:
            shutil.copyfile(Path(origem).expanduser(), bruto)
        cabeca = bruto.read_bytes()[:12]
        video = origem.lower().split("?")[0].endswith(EXT_VIDEO) or cabeca[4:8] == b"ftyp"
        if video:
            final = pasta("midias") / (nome + ".mp4")
            shutil.copyfile(bruto, final)
        else:
            final = pasta("midias") / (nome + ".jpg")
            if cabeca[:3] == b"\xff\xd8\xff":
                shutil.copyfile(bruto, final)
            else:  # Instagram só aceita JPEG
                try:
                    converter_jpeg(bruto, final)
                except (OSError, subprocess.CalledProcessError, RuntimeError) as e:
                    final.unlink(missing_ok=True)
                    print(f"Não consegui converter para JPEG: {e}")
                    return 1
    print(f"✓ {final.name}" + (f"  →  {MIDIAS_URL}/{final.name}" if MIDIAS_URL else ""))
    return 0


def cmd_listar(nome: str | None) -> None:
    for p in ([nome] if nome else PASTAS):
        arquivos = sorted(pasta(p).glob("*.json"))
        print(f"{p}/ ({len(arquivos)})")
        for f in arquivos:
            try:
                post = ler(f)
                resumo = (post.get("texto") or next(iter((post.get("textos") or {}).values()), "")).replace("\n", " ")
                print(f"  {f.stem}  {post.get('quando')}  {','.join(post.get('destinos') or [])}  "
                      f"{post.get('tipo')}  {resumo[:60]}")
            except (ValueError, KeyError):
                print(f"  {f.stem}  (JSON inválido)")


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd, args = argv[0], argv[1:]
    if cmd == "publicar":
        cmd_publicar()
    elif cmd == "listar":
        cmd_listar(args[0] if args else None)
    elif cmd == "midia" and len(args) == 2:
        return cmd_midia(*args)
    elif cmd == "validar" and args:
        problemas = validar(ler(Path(args[0])))
        print("ok" if not problemas else "\n".join(f"- {p}" for p in problemas))
        return 1 if problemas else 0
    elif cmd in ("aprovar", "cancelar") and args:
        origem = ("rascunhos", "erros") if cmd == "aprovar" else ("fila",)
        destino = pasta("fila" if cmd == "aprovar" else "rascunhos")
        arquivos = achar(args[0], origem)
        if not arquivos:
            print(f"Nada encontrado para '{args[0]}' em {', '.join(origem)}/")
            return 1
        falhas = 0
        for f in arquivos:
            post = ler(f)
            problemas = validar(post) if cmd == "aprovar" else []
            if problemas:
                falhas += 1
                print(f"✗ {f.stem} não aprovado:\n" + "\n".join(f"  - {p}" for p in problemas))
                continue
            post.pop("resultado", None)
            gravar(f, post)
            f.rename(destino / f.name)
            print(f"✓ {f.stem} → {destino.name}/ ({post['quando']})")
        return 1 if falhas else 0
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
