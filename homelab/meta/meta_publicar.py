#!/usr/bin/env python3
"""Publica no Instagram, Facebook (Página) e Threads pela API oficial da Meta.

Só biblioteca padrão do Python 3.9+. Três jeitos de usar:

  CLI     python3 meta_publicar.py publicar -d instagram,facebook -t foto -m URL -l "Legenda"
  API     python3 meta_publicar.py servir   (POST /publicar, usado pelo n8n)
  Módulo  from meta_publicar import Meta, Post

Primeiro configure as contas:  python3 meta_publicar.py autorizar facebook|instagram|threads
Detalhes e variáveis de ambiente: README.md desta pasta.
"""
from __future__ import annotations

import argparse
import hmac
import json
import os
import secrets
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSAO = os.environ.get("META_API_VERSION", "v24.0")
THREADS_VERSAO = os.environ.get("META_THREADS_VERSION", "v1.0")
FB_HOST = "https://graph.facebook.com"
IG_HOST = "https://graph.instagram.com"
THREADS_HOST = "https://graph.threads.net"

ESCOPOS = {
    "facebook": "pages_show_list,pages_read_engagement,pages_manage_posts,"
                "instagram_basic,instagram_content_publish,business_management",
    "instagram": "instagram_business_basic,instagram_business_content_publish",
    "threads": "threads_basic,threads_content_publish",
}
EXT_VIDEO = (".mp4", ".mov", ".m4v")
LIMITE_TEXTO = {"instagram": 2200, "threads": 500, "facebook": 63206}
RENOVAR_ANTES = 15 * 86400  # renova tokens de 60 dias quando faltam 15


class ErroMeta(Exception):
    """Erro devolvido pela Graph API ou por validação local."""


# ------------------------------------------------------------------ estado

class Estado:
    """Tokens e IDs. Lê do arquivo JSON (gravado por `autorizar`/`renovar`)
    e, se faltar, das variáveis de ambiente."""

    ENV = {
        ("facebook", "page_id"): "META_FB_PAGE_ID",
        ("facebook", "page_token"): "META_FB_PAGE_TOKEN",
        ("facebook", "ig_id"): "META_FB_IG_ID",
        ("instagram", "user_id"): "META_IG_USER_ID",
        ("instagram", "token"): "META_IG_TOKEN",
        ("threads", "user_id"): "META_THREADS_USER_ID",
        ("threads", "token"): "META_THREADS_TOKEN",
    }

    def __init__(self, caminho: str | os.PathLike | None = None):
        padrao = Path(__file__).resolve().parent.parent / "data" / "meta" / "tokens.json"
        self.caminho = Path(caminho or os.environ.get("META_ESTADO") or padrao)
        self._trava = threading.Lock()
        try:
            self.dados = json.loads(self.caminho.read_text())
        except FileNotFoundError:
            self.dados = {}

    def get(self, plataforma: str, chave: str, obrigatorio: bool = True):
        valor = self.dados.get(plataforma, {}).get(chave)
        if valor is None and (plataforma, chave) in self.ENV:
            valor = os.environ.get(self.ENV[(plataforma, chave)]) or None
        if valor is None and obrigatorio:
            raise ErroMeta(f"{plataforma}: falta '{chave}'. Rode: meta_publicar.py autorizar {plataforma}")
        return valor

    def configurado(self, plataforma: str) -> bool:
        if plataforma == "instagram" and self.get("facebook", "ig_id", obrigatorio=False):
            return self.get("facebook", "page_token", obrigatorio=False) is not None
        chave = "page_token" if plataforma == "facebook" else "token"
        return self.get(plataforma, chave, obrigatorio=False) is not None

    def salvar(self, plataforma: str, **valores):
        with self._trava:
            self.dados.setdefault(plataforma, {}).update(valores)
            self.caminho.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.caminho.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.dados, indent=2, ensure_ascii=False))
            os.chmod(tmp, 0o600)
            tmp.replace(self.caminho)


# ------------------------------------------------------------------ HTTP

def chamar(metodo: str, url: str, params: dict | None = None, tentativas: int = 3) -> dict:
    """Chama a Graph API. GET manda params na URL, POST no corpo (form)."""
    params = {k: v for k, v in (params or {}).items() if v is not None}
    dados = None
    if metodo == "GET":
        if params:
            url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    else:
        dados = urllib.parse.urlencode(params).encode()
    for tentativa in range(tentativas):
        req = urllib.request.Request(url, data=dados, method=metodo)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as e:
            corpo = e.read().decode(errors="replace")
            try:
                erro = json.loads(corpo).get("error", {})
            except ValueError:
                erro = {"message": corpo[:300]}
            # 5xx e erros marcados como temporários valem nova tentativa
            if (e.code >= 500 or erro.get("is_transient")) and tentativa < tentativas - 1:
                time.sleep(2 ** tentativa)
                continue
            msg = erro.get("error_user_msg") or erro.get("message") or corpo[:300]
            raise ErroMeta(f"HTTP {e.code} (código {erro.get('code')}): {msg}") from None
        except urllib.error.URLError as e:
            if tentativa < tentativas - 1:
                time.sleep(2 ** tentativa)
                continue
            raise ErroMeta(f"Sem conexão com a Meta: {e.reason}") from None
    raise AssertionError("inalcançável")


def eh_video(url: str) -> bool:
    return urllib.parse.urlparse(url).path.lower().endswith(EXT_VIDEO)


# ------------------------------------------------------------------ post

TIPOS = ("texto", "foto", "video", "reels", "story", "carrossel")


@dataclass
class Midia:
    url: str
    video: bool | None = None  # None = deduz pela extensão

    def __post_init__(self):
        if self.video is None:
            self.video = eh_video(self.url)

    @classmethod
    def de(cls, item) -> "Midia":
        if isinstance(item, Midia):
            return item
        if isinstance(item, str):
            return cls(item)
        if isinstance(item, dict) and item.get("url"):
            tipo = item.get("tipo")
            return cls(item["url"], None if tipo is None else tipo == "video")
        raise ErroMeta(f"Mídia inválida: {item!r}")


@dataclass
class Post:
    tipo: str
    texto: str = ""
    midias: list = field(default_factory=list)
    link: str | None = None
    capa: str | None = None  # URL da capa do Reels (opcional)

    def __post_init__(self):
        if self.tipo not in TIPOS:
            raise ErroMeta(f"Tipo '{self.tipo}' inválido. Use: {', '.join(TIPOS)}")
        self.midias = [Midia.de(m) for m in self.midias]
        precisa = {"texto": (0, 0), "foto": (1, 1), "video": (1, 1), "reels": (1, 1),
                   "story": (1, 1), "carrossel": (2, 10)}[self.tipo]
        if not precisa[0] <= len(self.midias) <= precisa[1]:
            faixa = precisa[0] if precisa[0] == precisa[1] else f"{precisa[0]} a {precisa[1]}"
            raise ErroMeta(f"'{self.tipo}' precisa de {faixa} mídia(s), veio {len(self.midias)}")
        if self.tipo == "texto" and not (self.texto or self.link):
            raise ErroMeta("Post de texto sem texto")
        if self.tipo in ("video", "reels") and not self.midias[0].video:
            self.midias[0].video = True
        if self.tipo == "foto" and self.midias[0].video:
            raise ErroMeta("Tipo 'foto' com URL de vídeo; use 'video' ou 'reels'")

    @classmethod
    def de_dict(cls, d: dict) -> "Post":
        return cls(tipo=d.get("tipo", ""), texto=d.get("texto") or d.get("legenda") or "",
                   midias=d.get("midias") or [], link=d.get("link"), capa=d.get("capa"))


# ------------------------------------------------------------------ plataformas

def esperar_container(host: str, container_id: str, token: str, campo: str,
                      espera_max: int = 600, intervalo: float = 5) -> None:
    """Containers de mídia são processados de forma assíncrona; publica só quando FINISHED."""
    limite = time.monotonic() + espera_max
    while True:
        r = chamar("GET", f"{host}/{container_id}",
                   {"fields": f"{campo},error_message" if campo == "status" else campo,
                    "access_token": token})
        status = r.get(campo, "")
        if status == "FINISHED":
            return
        if status in ("ERROR", "EXPIRED"):
            raise ErroMeta(f"Mídia rejeitada pela Meta ({status}): {r.get('error_message') or r}")
        if time.monotonic() > limite:
            raise ErroMeta(f"Mídia ainda em processamento após {espera_max}s (container {container_id})")
        time.sleep(intervalo)


class Instagram:
    """Conta profissional. Via Página do Facebook (graph.facebook.com) ou via
    Login do Instagram (graph.instagram.com), o que estiver configurado."""

    def __init__(self, estado: Estado, intervalo: float = 5):
        self.intervalo = intervalo
        if estado.get("instagram", "token", obrigatorio=False):
            self.host = f"{IG_HOST}/{VERSAO}"
            self.ig_id = estado.get("instagram", "user_id")
            self.token = estado.get("instagram", "token")
        else:
            self.host = f"{FB_HOST}/{VERSAO}"
            self.ig_id = estado.get("facebook", "ig_id")
            self.token = estado.get("facebook", "page_token")

    def _container(self, **params) -> str:
        r = chamar("POST", f"{self.host}/{self.ig_id}/media", {**params, "access_token": self.token})
        return r["id"]

    def _midia(self, m: Midia, **extra) -> dict:
        return {"video_url": m.url} if m.video else {"image_url": m.url, **extra}

    def publicar(self, post: Post) -> dict:
        legenda = post.texto + (f"\n\n{post.link}" if post.link else "")
        if post.tipo == "texto":
            raise ErroMeta("Instagram não aceita post só de texto")
        if post.tipo == "foto":
            cid = self._container(image_url=post.midias[0].url, caption=legenda)
        elif post.tipo in ("video", "reels"):
            cid = self._container(media_type="REELS", video_url=post.midias[0].url, caption=legenda,
                                  cover_url=post.capa, share_to_feed="true")
        elif post.tipo == "story":
            cid = self._container(media_type="STORIES", **self._midia(post.midias[0]))
        else:
            filhos = []
            for m in post.midias:
                extra = {"media_type": "VIDEO"} if m.video else {}
                filhos.append(self._container(is_carousel_item="true", **extra, **self._midia(m)))
            for f in filhos:
                esperar_container(self.host, f, self.token, "status_code", intervalo=self.intervalo)
            cid = self._container(media_type="CAROUSEL", children=",".join(filhos), caption=legenda)
        esperar_container(self.host, cid, self.token, "status_code", intervalo=self.intervalo)
        r = chamar("POST", f"{self.host}/{self.ig_id}/media_publish",
                   {"creation_id": cid, "access_token": self.token})
        link = chamar("GET", f"{self.host}/{r['id']}", {"fields": "permalink", "access_token": self.token})
        return {"id": r["id"], "url": link.get("permalink")}

    def limite(self) -> dict:
        r = chamar("GET", f"{self.host}/{self.ig_id}/content_publishing_limit",
                   {"fields": "quota_usage,config", "access_token": self.token})
        d = (r.get("data") or [{}])[0]
        return {"usados_24h": d.get("quota_usage"), "maximo": d.get("config", {}).get("quota_total")}


class Facebook:
    def __init__(self, estado: Estado):
        self.host = f"{FB_HOST}/{VERSAO}"
        self.page_id = estado.get("facebook", "page_id")
        self.token = estado.get("facebook", "page_token")

    def _post(self, caminho: str, **params) -> dict:
        return chamar("POST", f"{self.host}/{self.page_id}/{caminho}", {**params, "access_token": self.token})

    def publicar(self, post: Post) -> dict:
        if post.tipo == "story":
            raise ErroMeta("Story de Página não é suportado por esta integração")
        if post.tipo == "texto":
            r = self._post("feed", message=post.texto, link=post.link)
        elif post.tipo in ("video", "reels"):
            r = self._post("videos", file_url=post.midias[0].url,
                           description=post.texto + (f"\n\n{post.link}" if post.link else ""))
        elif post.tipo == "foto":
            r = self._post("photos", url=post.midias[0].url,
                           message=post.texto + (f"\n\n{post.link}" if post.link else ""))
        else:
            if any(m.video for m in post.midias):
                raise ErroMeta("Carrossel do Facebook aceita só fotos nesta integração")
            fotos = [self._post("photos", url=m.url, published="false")["id"] for m in post.midias]
            anexos = {f"attached_media[{i}]": json.dumps({"media_fbid": f}) for i, f in enumerate(fotos)}
            r = self._post("feed", message=post.texto, link=post.link, **anexos)
        pid = r.get("post_id") or r["id"]
        return {"id": pid, "url": f"https://www.facebook.com/{pid}"}


class Threads:
    def __init__(self, estado: Estado, intervalo: float = 5):
        self.intervalo = intervalo
        self.host = f"{THREADS_HOST}/{THREADS_VERSAO}"
        self.user_id = estado.get("threads", "user_id")
        self.token = estado.get("threads", "token")

    def _container(self, **params) -> str:
        r = chamar("POST", f"{self.host}/{self.user_id}/threads", {**params, "access_token": self.token})
        return r["id"]

    def _midia(self, m: Midia) -> dict:
        return {"media_type": "VIDEO", "video_url": m.url} if m.video else {"media_type": "IMAGE", "image_url": m.url}

    def publicar(self, post: Post) -> dict:
        if post.tipo == "story":
            raise ErroMeta("Threads não tem story")
        if post.tipo == "texto":
            cid = self._container(media_type="TEXT", text=post.texto, link_attachment=post.link)
        elif post.tipo == "carrossel":
            filhos = [self._container(is_carousel_item="true", **self._midia(m)) for m in post.midias]
            for f in filhos:
                esperar_container(self.host, f, self.token, "status", intervalo=self.intervalo)
            cid = self._container(media_type="CAROUSEL", children=",".join(filhos), text=post.texto)
        else:
            cid = self._container(text=post.texto, **self._midia(post.midias[0]))
        esperar_container(self.host, cid, self.token, "status", intervalo=self.intervalo)
        r = chamar("POST", f"{self.host}/{self.user_id}/threads_publish",
                   {"creation_id": cid, "access_token": self.token})
        link = chamar("GET", f"{self.host}/{r['id']}", {"fields": "permalink", "access_token": self.token})
        return {"id": r["id"], "url": link.get("permalink")}

    def limite(self) -> dict:
        r = chamar("GET", f"{self.host}/{self.user_id}/threads_publishing_limit",
                   {"fields": "quota_usage,config", "access_token": self.token})
        d = (r.get("data") or [{}])[0]
        return {"usados_24h": d.get("quota_usage"), "maximo": d.get("config", {}).get("quota_total")}


PLATAFORMAS = {"instagram": Instagram, "facebook": Facebook, "threads": Threads}


class Meta:
    """Fachada: publica o mesmo post em vários destinos e junta os resultados."""

    def __init__(self, estado: Estado | None = None, intervalo: float = 5):
        self.estado = estado or Estado()
        self.intervalo = intervalo

    def _cliente(self, nome: str):
        if nome not in PLATAFORMAS:
            raise ErroMeta(f"Destino '{nome}' desconhecido. Use: {', '.join(PLATAFORMAS)}")
        cls = PLATAFORMAS[nome]
        return cls(self.estado) if cls is Facebook else cls(self.estado, intervalo=self.intervalo)

    def publicar(self, post: Post, destinos: list[str]) -> dict:
        for d in destinos:
            if len(post.texto) > LIMITE_TEXTO.get(d, 10**9):
                raise ErroMeta(f"{d}: texto com {len(post.texto)} caracteres, máximo {LIMITE_TEXTO[d]}")
        resultado = {}
        for d in destinos:  # um destino falhar não impede os outros
            try:
                resultado[d] = {"ok": True, **self._cliente(d).publicar(post)}
            except ErroMeta as e:
                resultado[d] = {"ok": False, "erro": str(e)}
        return resultado

    def limites(self) -> dict:
        saida = {}
        for nome in ("instagram", "threads"):
            try:
                saida[nome] = self._cliente(nome).limite()
            except ErroMeta as e:
                saida[nome] = {"erro": str(e)}
        return saida


# ------------------------------------------------------------------ tokens

def _app(plataforma: str) -> tuple[str, str]:
    prefixo = {"facebook": "META_APP", "instagram": "META_IG_APP", "threads": "META_THREADS_APP"}[plataforma]
    app_id, segredo = os.environ.get(f"{prefixo}_ID"), os.environ.get(f"{prefixo}_SECRET")
    if not (app_id and segredo):
        raise ErroMeta(f"Defina {prefixo}_ID e {prefixo}_SECRET (painel do app em developers.facebook.com)")
    return app_id, segredo


def redirect_uri() -> str:
    return os.environ.get("META_REDIRECT_URI", "https://localhost/")


def url_autorizacao(plataforma: str, estado_csrf: str) -> str:
    app_id, _ = _app(plataforma)
    base = {"facebook": f"https://www.facebook.com/{VERSAO}/dialog/oauth",
            "instagram": "https://www.instagram.com/oauth/authorize",
            "threads": "https://threads.net/oauth/authorize"}[plataforma]
    return base + "?" + urllib.parse.urlencode({
        "client_id": app_id, "redirect_uri": redirect_uri(), "scope": ESCOPOS[plataforma],
        "response_type": "code", "state": estado_csrf})


def extrair_codigo(colado: str, estado_csrf: str | None = None) -> str:
    """Aceita a URL inteira para onde a Meta redirecionou, ou só o código."""
    colado = colado.strip()
    if "code=" not in colado:
        return colado.removesuffix("#_")
    q = urllib.parse.parse_qs(urllib.parse.urlparse(colado).query)
    if estado_csrf and q.get("state", [None])[0] != estado_csrf:
        raise ErroMeta("O 'state' da URL não confere; recomece a autorização")
    return q["code"][0].removesuffix("#_")


def configurar_facebook(estado: Estado, codigo: str, escolher=None) -> dict:
    app_id, segredo = _app("facebook")
    base = f"{FB_HOST}/{VERSAO}"
    curto = chamar("GET", f"{base}/oauth/access_token", {
        "client_id": app_id, "client_secret": segredo, "redirect_uri": redirect_uri(), "code": codigo})
    longo = chamar("GET", f"{base}/oauth/access_token", {
        "grant_type": "fb_exchange_token", "client_id": app_id, "client_secret": segredo,
        "fb_exchange_token": curto["access_token"]})
    # Token de Página obtido de um token de usuário longo não expira.
    paginas = chamar("GET", f"{base}/me/accounts", {
        "fields": "id,name,access_token,instagram_business_account{id,username}",
        "access_token": longo["access_token"]}).get("data", [])
    if not paginas:
        raise ErroMeta("Nenhuma Página encontrada. Selecione a Página ao autorizar o app.")
    pagina = (escolher or (lambda ps: ps[0]))(paginas)
    ig = pagina.get("instagram_business_account") or {}
    estado.salvar("facebook", page_id=pagina["id"], page_nome=pagina["name"],
                  page_token=pagina["access_token"], ig_id=ig.get("id"), ig_usuario=ig.get("username"))
    return {"pagina": pagina["name"], "instagram": ig.get("username")}


def configurar_instagram(estado: Estado, codigo: str) -> dict:
    app_id, segredo = _app("instagram")
    curto = chamar("POST", "https://api.instagram.com/oauth/access_token", {
        "client_id": app_id, "client_secret": segredo, "grant_type": "authorization_code",
        "redirect_uri": redirect_uri(), "code": codigo})
    longo = chamar("GET", f"{IG_HOST}/access_token", {
        "grant_type": "ig_exchange_token", "client_secret": segredo, "access_token": curto["access_token"]})
    eu = chamar("GET", f"{IG_HOST}/{VERSAO}/me", {"fields": "user_id,username", "access_token": longo["access_token"]})
    estado.salvar("instagram", user_id=str(eu.get("user_id") or curto.get("user_id")), usuario=eu.get("username"),
                  token=longo["access_token"], expira_em=int(time.time()) + int(longo.get("expires_in", 5184000)))
    return {"instagram": eu.get("username")}


def configurar_threads(estado: Estado, codigo: str) -> dict:
    app_id, segredo = _app("threads")
    curto = chamar("POST", f"{THREADS_HOST}/oauth/access_token", {
        "client_id": app_id, "client_secret": segredo, "grant_type": "authorization_code",
        "redirect_uri": redirect_uri(), "code": codigo})
    longo = chamar("GET", f"{THREADS_HOST}/access_token", {
        "grant_type": "th_exchange_token", "client_secret": segredo, "access_token": curto["access_token"]})
    eu = chamar("GET", f"{THREADS_HOST}/{THREADS_VERSAO}/me", {"fields": "id,username", "access_token": longo["access_token"]})
    estado.salvar("threads", user_id=str(eu["id"]), usuario=eu.get("username"), token=longo["access_token"],
                  expira_em=int(time.time()) + int(longo.get("expires_in", 5184000)))
    return {"threads": eu.get("username")}


CONFIGURAR = {"facebook": configurar_facebook, "instagram": configurar_instagram, "threads": configurar_threads}


def renovar(estado: Estado, forcar: bool = False) -> dict:
    """Renova os tokens de 60 dias do Instagram (login próprio) e do Threads.
    O token de Página do Facebook não expira e não precisa disso."""
    urls = {"instagram": (f"{IG_HOST}/refresh_access_token", "ig_refresh_token"),
            "threads": (f"{THREADS_HOST}/refresh_access_token", "th_refresh_token")}
    saida = {}
    for nome, (url, grant) in urls.items():
        dados = estado.dados.get(nome, {})
        if not dados.get("token"):
            continue
        falta = dados.get("expira_em", 0) - time.time()
        if not forcar and falta > RENOVAR_ANTES:
            saida[nome] = f"ok, expira em {int(falta // 86400)} dias"
            continue
        try:
            r = chamar("GET", url, {"grant_type": grant, "access_token": dados["token"]})
            estado.salvar(nome, token=r["access_token"], expira_em=int(time.time()) + int(r.get("expires_in", 5184000)))
            saida[nome] = "renovado"
        except ErroMeta as e:
            saida[nome] = f"falhou: {e}"
    return saida


# ------------------------------------------------------------------ API HTTP

def criar_servidor(meta: Meta, chave: str, host: str = "0.0.0.0", porta: int = 8787) -> ThreadingHTTPServer:
    class Handler(BaseHTTPRequestHandler):
        def _responder(self, codigo: int, corpo: dict):
            dados = json.dumps(corpo, ensure_ascii=False).encode()
            self.send_response(codigo)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)

        def _autorizado(self) -> bool:
            enviado = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
            if hmac.compare_digest(enviado.encode(), chave.encode()):
                return True
            self._responder(401, {"erro": "Authorization: Bearer <META_API_CHAVE> ausente ou errado"})
            return False

        def do_GET(self):
            if self.path == "/saude":
                return self._responder(200, {"ok": True, "configurado": {
                    p: meta.estado.configurado(p) for p in PLATAFORMAS}})
            if not self._autorizado():
                return
            if self.path == "/limites":
                return self._responder(200, meta.limites())
            self._responder(404, {"erro": "rota inexistente"})

        def do_POST(self):
            if not self._autorizado():
                return
            if self.path != "/publicar":
                return self._responder(404, {"erro": "rota inexistente"})
            try:
                tamanho = int(self.headers.get("Content-Length") or 0)
                corpo = json.loads(self.rfile.read(tamanho) or b"{}")
                destinos = corpo.get("destinos") or []
                if isinstance(destinos, str):
                    destinos = [d.strip() for d in destinos.split(",") if d.strip()]
                if not destinos:
                    raise ErroMeta("Informe 'destinos': instagram, facebook e/ou threads")
                resultado = meta.publicar(Post.de_dict(corpo), destinos)
            except (ErroMeta, ValueError) as e:
                return self._responder(400, {"erro": str(e)})
            todos_ok = all(r["ok"] for r in resultado.values())
            self._responder(200 if todos_ok else 207, resultado)

        def log_message(self, fmt, *args):
            sys.stderr.write("[meta] %s %s\n" % (self.address_string(), fmt % args))

    return ThreadingHTTPServer((host, porta), Handler)


def _renovador(estado: Estado):
    while True:
        r = renovar(estado)
        if r:
            print(f"[meta] tokens: {r}", file=sys.stderr, flush=True)
        time.sleep(86400)


# ------------------------------------------------------------------ CLI

def _imprimir(obj):
    print(json.dumps(obj, indent=2, ensure_ascii=False))


def _cmd_autorizar(args, estado: Estado):
    csrf = secrets.token_urlsafe(16)
    print(f"1. Abra no navegador e autorize:\n\n   {url_autorizacao(args.plataforma, csrf)}\n")
    print(f"2. Você será levado para {redirect_uri()}... (a página pode dar erro, tudo bem).")
    colado = input("3. Cole aqui a URL completa da barra de endereço: ")
    codigo = extrair_codigo(colado, csrf)
    if args.plataforma == "facebook":
        def escolher(paginas):
            if len(paginas) == 1:
                return paginas[0]
            for i, p in enumerate(paginas):
                ig = (p.get("instagram_business_account") or {}).get("username")
                print(f"  [{i}] {p['name']}" + (f"  (Instagram @{ig})" if ig else ""))
            return paginas[int(input("Número da Página: "))]
        r = configurar_facebook(estado, codigo, escolher)
    else:
        r = CONFIGURAR[args.plataforma](estado, codigo)
    print(f"\nPronto. Gravado em {estado.caminho}")
    _imprimir(r)


def _cmd_publicar(args, estado: Estado):
    post = Post(tipo=args.tipo, texto=args.legenda or "", midias=args.midia or [], link=args.link, capa=args.capa)
    destinos = [d.strip() for d in args.destinos.split(",") if d.strip()]
    resultado = Meta(estado).publicar(post, destinos)
    _imprimir(resultado)
    return 0 if all(r["ok"] for r in resultado.values()) else 1


def _cmd_servir(args, estado: Estado):
    chave = os.environ.get("META_API_CHAVE")
    if not chave:
        raise ErroMeta("Defina META_API_CHAVE (o n8n manda no header Authorization: Bearer ...)")
    threading.Thread(target=_renovador, args=(estado,), daemon=True).start()
    srv = criar_servidor(Meta(estado), chave, args.host, args.porta)
    print(f"[meta] API em http://{args.host}:{args.porta}  (estado: {estado.caminho})", file=sys.stderr, flush=True)
    srv.serve_forever()


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Publica no Instagram, Facebook e Threads pela API oficial da Meta.")
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("autorizar", help="liga uma conta (OAuth) e grava os tokens")
    a.add_argument("plataforma", choices=list(CONFIGURAR))

    pb = sub.add_parser("publicar", help="publica um post")
    pb.add_argument("-d", "--destinos", required=True, help="instagram,facebook,threads")
    pb.add_argument("-t", "--tipo", required=True, choices=TIPOS)
    pb.add_argument("-m", "--midia", action="append", help="URL pública da mídia (repita para carrossel)")
    pb.add_argument("-l", "--legenda", help="texto do post")
    pb.add_argument("--link", help="link (Facebook/Threads anexam; Instagram põe no fim da legenda)")
    pb.add_argument("--capa", help="URL da capa do Reels")

    sub.add_parser("limites", help="quantos posts ainda cabem nas últimas 24h")
    r = sub.add_parser("renovar", help="renova tokens do Instagram/Threads que estão perto de expirar")
    r.add_argument("--forcar", action="store_true")
    sub.add_parser("status", help="mostra o que está configurado (sem tokens)")

    s = sub.add_parser("servir", help="sobe a API HTTP para o n8n")
    s.add_argument("--host", default=os.environ.get("META_HOST", "0.0.0.0"))
    s.add_argument("--porta", type=int, default=int(os.environ.get("META_PORTA", "8787")))

    args = p.parse_args(argv)
    estado = Estado()
    try:
        if args.cmd == "autorizar":
            _cmd_autorizar(args, estado)
        elif args.cmd == "publicar":
            return _cmd_publicar(args, estado)
        elif args.cmd == "limites":
            _imprimir(Meta(estado).limites())
        elif args.cmd == "renovar":
            _imprimir(renovar(estado, args.forcar))
        elif args.cmd == "status":
            _imprimir({p: {k: v for k, v in estado.dados.get(p, {}).items() if "token" not in k}
                       | {"configurado": estado.configurado(p)} for p in PLATAFORMAS})
        elif args.cmd == "servir":
            _cmd_servir(args, estado)
    except ErroMeta as e:
        print(f"Erro: {e}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
