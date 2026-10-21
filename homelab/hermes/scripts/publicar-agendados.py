#!/usr/bin/env python3
"""Script do cron do Hermes (modo sem agente): publica os posts da fila que venceram.

Saída vazia = nada a avisar. Com posts publicados, o Hermes manda o resumo no Telegram.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import posts  # noqa: E402

posts.main(["publicar"])
