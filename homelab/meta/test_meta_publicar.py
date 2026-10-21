"""Testes sem rede: a Graph API é simulada.  python3 -m unittest -v test_meta_publicar"""
import json
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path
from unittest import mock

import meta_publicar as mp


class FakeGraph:
    """Responde como a Graph API e registra as chamadas."""

    def __init__(self):
        self.chamadas = []
        self.n = 0

    def __call__(self, metodo, url, params=None, tentativas=3):
        params = params or {}
        self.chamadas.append((metodo, url, params))
        if url.endswith("/media") or url.endswith("/threads"):
            self.n += 1
            return {"id": f"c{self.n}"}
        if url.endswith("/media_publish") or url.endswith("/threads_publish"):
            return {"id": "post1"}
        if url.endswith("/photos"):
            self.n += 1
            return {"id": f"foto{self.n}", "post_id": "pag_foto"}
        if url.endswith("/feed") or url.endswith("/videos"):
            return {"id": "pag_post"}
        if "fields" in params and "status" in params["fields"]:
            return {"status_code": "FINISHED", "status": "FINISHED"}
        if params.get("fields") == "permalink":
            return {"permalink": "https://exemplo/p/1"}
        if url.endswith("refresh_access_token"):
            return {"access_token": "novo", "expires_in": 5184000}
        raise AssertionError(f"chamada inesperada {metodo} {url}")

    def urls(self, metodo="POST"):
        return [u for m, u, _ in self.chamadas if m == metodo]

    def params(self, sufixo):
        return [p for _, u, p in self.chamadas if u.endswith(sufixo)]


def estado_tmp(dados):
    d = tempfile.mkdtemp()
    caminho = Path(d) / "tokens.json"
    caminho.write_text(json.dumps(dados))
    return mp.Estado(caminho)


CONTAS = {
    "facebook": {"page_id": "PAG", "page_token": "tp", "ig_id": "IGFB"},
    "threads": {"user_id": "TH", "token": "tt"},
}


class TestPost(unittest.TestCase):
    def test_validacoes(self):
        with self.assertRaises(mp.ErroMeta):
            mp.Post("foto")
        with self.assertRaises(mp.ErroMeta):
            mp.Post("carrossel", midias=["https://x/a.jpg"])
        with self.assertRaises(mp.ErroMeta):
            mp.Post("foto", midias=["https://x/a.mp4"])
        with self.assertRaises(mp.ErroMeta):
            mp.Post("gif", midias=["https://x/a.gif"])

    def test_deduz_video(self):
        p = mp.Post("carrossel", midias=["https://x/a.jpg", "https://x/b.MP4?v=1", {"url": "https://x/c", "tipo": "video"}])
        self.assertEqual([m.video for m in p.midias], [False, True, True])

    def test_extrair_codigo(self):
        self.assertEqual(mp.extrair_codigo("https://localhost/?code=ABC#_&state=s"), "ABC")
        self.assertEqual(mp.extrair_codigo("https://localhost/?code=ABC&state=s#_", "s"), "ABC")
        with self.assertRaises(mp.ErroMeta):
            mp.extrair_codigo("https://localhost/?code=ABC&state=x", "s")
        self.assertEqual(mp.extrair_codigo(" XYZ#_ "), "XYZ")


class TestPublicar(unittest.TestCase):
    def setUp(self):
        self.g = FakeGraph()
        mock.patch.object(mp, "chamar", self.g).start()
        self.addCleanup(mock.patch.stopall)
        self.meta = mp.Meta(estado_tmp(CONTAS), intervalo=0)

    def test_instagram_via_pagina(self):
        r = self.meta.publicar(mp.Post("foto", "Oi", ["https://x/a.jpg"]), ["instagram"])
        self.assertTrue(r["instagram"]["ok"])
        self.assertIn(f"{mp.FB_HOST}/{mp.VERSAO}/IGFB/media", self.g.urls())
        self.assertEqual(self.g.params("/media")[0]["access_token"], "tp")

    def test_instagram_login_proprio_tem_prioridade(self):
        meta = mp.Meta(estado_tmp({**CONTAS, "instagram": {"user_id": "IG", "token": "ti"}}), intervalo=0)
        meta.publicar(mp.Post("reels", "R", ["https://x/v.mp4"]), ["instagram"])
        p = self.g.params("/media")[0]
        self.assertEqual((p["media_type"], p["access_token"]), ("REELS", "ti"))
        self.assertIn(f"{mp.IG_HOST}/{mp.VERSAO}/IG/media", self.g.urls())

    def test_instagram_carrossel(self):
        self.meta.publicar(mp.Post("carrossel", "C", ["https://x/a.jpg", "https://x/b.mp4"]), ["instagram"])
        itens = self.g.params("/media")
        self.assertEqual(itens[0]["is_carousel_item"], "true")
        self.assertEqual(itens[1]["media_type"], "VIDEO")
        self.assertEqual(itens[2]["media_type"], "CAROUSEL")
        self.assertEqual(itens[2]["children"], "c1,c2")
        self.assertEqual(self.g.params("/media_publish")[0]["creation_id"], "c3")

    def test_facebook_carrossel_e_texto(self):
        r = self.meta.publicar(mp.Post("carrossel", "F", ["https://x/a.jpg", "https://x/b.jpg"]), ["facebook"])
        feed = self.g.params("/feed")[0]
        self.assertEqual(json.loads(feed["attached_media[1]"]), {"media_fbid": "foto2"})
        self.assertEqual(r["facebook"]["id"], "pag_post")
        self.meta.publicar(mp.Post("texto", "Só texto", link="https://site"), ["facebook"])
        self.assertEqual(self.g.params("/feed")[1]["link"], "https://site")

    def test_threads_e_falha_isolada(self):
        r = self.meta.publicar(mp.Post("texto", "Olá"), ["threads", "instagram"])
        self.assertTrue(r["threads"]["ok"])
        self.assertFalse(r["instagram"]["ok"])  # Instagram não aceita só texto
        self.assertEqual(self.g.params("/threads")[0]["media_type"], "TEXT")

    def test_limite_texto_threads(self):
        with self.assertRaises(mp.ErroMeta):
            self.meta.publicar(mp.Post("texto", "x" * 501), ["threads"])

    def test_container_com_erro(self):
        def com_erro(metodo, url, params=None, tentativas=3):
            if params and params.get("fields", "").startswith("status"):
                return {"status_code": "ERROR"}
            return self.g(metodo, url, params)
        with mock.patch.object(mp, "chamar", com_erro):
            r = self.meta.publicar(mp.Post("foto", midias=["https://x/a.jpg"]), ["instagram"])
        self.assertIn("ERROR", r["instagram"]["erro"])


class TestRenovar(unittest.TestCase):
    def test_renova_so_perto_de_expirar(self):
        g = FakeGraph()
        agora = mp.time.time()
        estado = estado_tmp({"instagram": {"token": "a", "expira_em": agora + 86400},
                             "threads": {"token": "b", "expira_em": agora + 40 * 86400}})
        with mock.patch.object(mp, "chamar", g):
            r = mp.renovar(estado)
        self.assertEqual(r["instagram"], "renovado")
        self.assertTrue(r["threads"].startswith("ok"))
        self.assertEqual(json.loads(estado.caminho.read_text())["instagram"]["token"], "novo")


class TestServidor(unittest.TestCase):
    def setUp(self):
        self.g = FakeGraph()
        mock.patch.object(mp, "chamar", self.g).start()
        self.addCleanup(mock.patch.stopall)
        self.srv = mp.criar_servidor(mp.Meta(estado_tmp(CONTAS), intervalo=0), "segredo", "127.0.0.1", 0)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.addCleanup(self.srv.server_close)
        self.addCleanup(self.srv.shutdown)
        self.base = f"http://127.0.0.1:{self.srv.server_address[1]}"

    def req(self, caminho, corpo=None, chave="segredo"):
        r = urllib.request.Request(self.base + caminho, method="POST" if corpo is not None else "GET",
                                   data=json.dumps(corpo).encode() if corpo is not None else None,
                                   headers={"Authorization": f"Bearer {chave}"})
        try:
            with urllib.request.urlopen(r) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_publicar(self):
        codigo, r = self.req("/publicar", {"destinos": "instagram,facebook,threads", "tipo": "foto",
                                           "legenda": "Oi", "midias": ["https://x/a.jpg"]})
        self.assertEqual(codigo, 200, r)
        self.assertTrue(all(v["ok"] for v in r.values()))

    def test_parcial_e_auth(self):
        codigo, _ = self.req("/publicar", {"destinos": ["threads", "instagram"], "tipo": "texto", "texto": "Oi"})
        self.assertEqual(codigo, 207)
        self.assertEqual(self.req("/publicar", {}, chave="errada")[0], 401)
        self.assertEqual(self.req("/publicar", {"tipo": "foto"})[0], 400)
        self.assertEqual(self.req("/saude", chave="")[0], 200)


if __name__ == "__main__":
    unittest.main()
