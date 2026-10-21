"""Testes da fila de posts, sem rede: o meta-publicar é simulado.  python3 -m unittest -v test_posts"""
import importlib
import io
import json
import os
import struct
import tempfile
import threading
import unittest
import zlib
from contextlib import redirect_stdout
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def png_1x1() -> bytes:
    def bloco(tipo, dados):
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados))
    return (b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + bloco(b"IDAT", zlib.compress(b"\x00\xff\x00\x00")) + bloco(b"IEND", b""))


class FalsoMetaPublicar(BaseHTTPRequestHandler):
    recebidos = []

    def do_POST(self):
        corpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        FalsoMetaPublicar.recebidos.append((self.headers["Authorization"], corpo))
        if corpo["tipo"] == "gif":
            codigo, resp = 400, {"erro": "tipo inválido"}
        else:
            resp = {d: ({"ok": False, "erro": "falhou"} if "ERRO" in corpo["texto"] else
                        {"ok": True, "id": "1", "url": f"https://{d}/p/1"}) for d in corpo["destinos"]}
            codigo = 207 if any(not r["ok"] for r in resp.values()) else 200
        dados = json.dumps(resp).encode()
        self.send_response(codigo)
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def log_message(self, *a):
        pass


class TestPosts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), FalsoMetaPublicar)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()

    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        os.environ.update(HERMES_POSTS_DIR=str(self.dir), META_API_CHAVE="k",
                          META_PUBLICAR_URL=f"http://127.0.0.1:{self.srv.server_address[1]}",
                          MIDIAS_URL_PUBLICA="https://midias.exemplo")
        import posts
        self.p = importlib.reload(posts)
        FalsoMetaPublicar.recebidos.clear()

    def rodar(self, *args):
        saida = io.StringIO()
        with redirect_stdout(saida):
            codigo = self.p.main(list(args))
        return codigo, saida.getvalue()

    def post(self, nome, pasta="rascunhos", **campos):
        base = {"quando": (datetime.now(self.p.ZONA) - timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M"),
                "destinos": ["instagram", "threads"], "tipo": "foto", "texto": "Oi",
                "midias": ["https://site/a.jpg"]}
        base.update(campos)
        arq = self.p.pasta(pasta) / f"{nome}.json"
        self.p.gravar(arq, base)
        return arq

    def test_validar(self):
        v = self.p.validar
        self.assertEqual(v({"quando": "2026-10-25T18:00", "destinos": ["threads"], "tipo": "texto", "texto": "x"}), [])
        self.assertTrue(v({"quando": "amanhã", "destinos": ["threads"], "tipo": "texto", "texto": "x"}))
        self.assertTrue(v({"quando": "2026-10-25T18:00", "destinos": ["instagram"], "tipo": "texto", "texto": "x"}))
        self.assertTrue(v({"quando": "2026-10-25T18:00", "destinos": ["threads"], "tipo": "texto",
                           "textos": {"threads": "x" * 501}}))
        self.assertTrue(v({"quando": "2026-10-25T18:00", "destinos": ["facebook"], "tipo": "foto",
                           "midias": ["nao-existe.jpg"]}))
        self.assertTrue(v({"quando": "2026-10-25T18:00", "destinos": ["tiktok"], "tipo": "foto"}))

    def test_aprovar_publica_e_textos_por_rede(self):
        (self.p.pasta("midias") / "arte.jpg").write_bytes(b"\xff\xd8\xff")
        self.post("p1", textos={"instagram": "IG #tag", "threads": "curto"}, midias=["arte.jpg"])
        self.assertEqual(self.rodar("aprovar", "p1")[0], 0)
        self.assertTrue((self.dir / "fila/p1.json").exists())
        codigo, saida = self.rodar("publicar")
        self.assertIn("✅ p1", saida)
        enviados = {tuple(c["destinos"]): c for _, c in FalsoMetaPublicar.recebidos}
        self.assertEqual(enviados[("instagram",)]["texto"], "IG #tag")
        self.assertEqual(enviados[("threads",)]["midias"], ["https://midias.exemplo/arte.jpg"])
        self.assertEqual(FalsoMetaPublicar.recebidos[0][0], "Bearer k")
        final = json.loads((self.dir / "publicados/p1.json").read_text())
        self.assertEqual(final["resultado"]["threads"]["url"], "https://threads/p/1")

    def test_futuro_nao_sai_e_silencio(self):
        futuro = (datetime.now(self.p.ZONA) + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M")
        self.post("p2", pasta="fila", quando=futuro)
        self.assertEqual(self.rodar("publicar"), (0, ""))
        self.assertTrue((self.dir / "fila/p2.json").exists())

    def test_parcial_erro_e_invalido(self):
        self.post("ok-parcial", pasta="fila", textos={"instagram": "bom", "threads": "ERRO"})
        self.post("todo-erro", pasta="fila", texto="ERRO")
        self.post("invalido", pasta="fila", destinos=["instagram"], tipo="texto", midias=[])
        _, saida = self.rodar("publicar")
        self.assertIn("⚠️ ok-parcial", saida)
        self.assertIn("❌ todo-erro", saida)
        self.assertIn("❌ invalido", saida)
        self.assertTrue((self.dir / "publicados/ok-parcial.json").exists())
        self.assertTrue((self.dir / "erros/todo-erro.json").exists())
        self.assertEqual(len(FalsoMetaPublicar.recebidos), 3)  # o inválido não chega na API

    def test_aprovar_recusa_invalido_e_cancelar(self):
        self.post("ruim", tipo="carrossel")
        self.assertEqual(self.rodar("aprovar", "todos")[0], 1)
        self.assertTrue((self.dir / "rascunhos/ruim.json").exists())
        self.post("bom")
        self.rodar("aprovar", "bom")
        self.rodar("cancelar", "bom")
        self.assertTrue((self.dir / "rascunhos/bom.json").exists())

    def test_midia_converte_para_jpeg(self):
        png = self.dir / "x.png"
        png.write_bytes(png_1x1())
        codigo, saida = self.rodar("midia", str(png), "Minha_Arte")
        self.assertEqual(codigo, 0, saida)
        self.assertEqual((self.dir / "midias/minha_arte.jpg").read_bytes()[:3], b"\xff\xd8\xff")
        self.rodar("midia", str(png), "../fora")  # caminho é descartado: fica dentro de midias/
        self.assertTrue((self.dir / "midias/fora.jpg").exists())
        self.assertFalse((self.dir / "fora.jpg").exists())
        self.assertEqual(self.rodar("midia", str(png), "nome com espaço")[0], 1)


if __name__ == "__main__":
    unittest.main()
