#!/usr/bin/env bash
# Organiza ~/Downloads movendo os arquivos para o vault do Obsidian, em subpastas por tipo.
#
# Uso:
#   ./organizar-downloads.sh -v ~/Documents/Obsidian/MeuVault          # simulação (padrão)
#   ./organizar-downloads.sh -v ~/Documents/Obsidian/MeuVault --apply  # move de verdade
#
# Opções:
#   -v, --vault DIR   Vault do Obsidian (ou defina OBSIDIAN_VAULT)
#   -s, --src DIR     Pasta de origem (padrão: ~/Downloads)
#   -d, --dest NAME   Subpasta dentro do vault (padrão: Downloads)
#   --apply           Executa as movimentações (sem isso, só mostra o que faria)
#   -h, --help        Ajuda

set -euo pipefail

VAULT="${OBSIDIAN_VAULT:-}"
SRC="$HOME/Downloads"
DEST_NAME="Downloads"
APPLY=0

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -v|--vault) VAULT="$2"; shift 2 ;;
    -s|--src)   SRC="$2"; shift 2 ;;
    -d|--dest)  DEST_NAME="$2"; shift 2 ;;
    --apply)    APPLY=1; shift ;;
    -h|--help)  usage 0 ;;
    *) echo "Opção desconhecida: $1" >&2; usage 1 ;;
  esac
done

[[ -n "$VAULT" ]] || { echo "Informe o vault com -v ou OBSIDIAN_VAULT." >&2; exit 1; }
VAULT="${VAULT/#\~/$HOME}"; SRC="${SRC/#\~/$HOME}"
[[ -d "$SRC" ]] || { echo "Origem não existe: $SRC" >&2; exit 1; }
[[ -d "$VAULT" ]] || { echo "Vault não existe: $VAULT" >&2; exit 1; }
DEST="$VAULT/$DEST_NAME"

categoria() {
  local ext="${1,,}"
  case "$ext" in
    pdf)                                         echo "PDFs" ;;
    md|markdown)                                 echo "Notas" ;;
    png|jpg|jpeg|gif|webp|svg|bmp|avif|heic|tiff) echo "Imagens" ;;
    mp4|mkv|webm|mov|avi|m4v)                    echo "Videos" ;;
    mp3|flac|wav|ogg|m4a|opus|aac)               echo "Audio" ;;
    doc|docx|odt|rtf|txt|epub|mobi)              echo "Documentos" ;;
    xls|xlsx|ods|csv|tsv)                        echo "Planilhas" ;;
    ppt|pptx|odp|key)                            echo "Apresentacoes" ;;
    zip|tar|gz|tgz|bz2|xz|zst|7z|rar)            echo "Compactados" ;;
    iso|img)                                     echo "Imagens-de-disco" ;;
    deb|rpm|AppImage|appimage|pkg|flatpakref)    echo "Instaladores" ;;
    json|yaml|yml|toml|xml|sh|py|js|ts|html|css) echo "Codigo-e-dados" ;;
    *)                                           echo "Outros" ;;
  esac
}

# nome livre: evita sobrescrever (arquivo.ext -> arquivo (1).ext)
destino_livre() {
  local dir="$1" nome="$2" base ext cand n=1
  cand="$dir/$nome"
  if [[ "$nome" == *.* && "$nome" != .* ]]; then base="${nome%.*}"; ext=".${nome##*.}"; else base="$nome"; ext=""; fi
  while [[ -e "$cand" ]]; do cand="$dir/$base ($n)$ext"; ((n++)); done
  echo "$cand"
}

[[ $APPLY -eq 1 ]] && echo "MODO: mover de verdade" || echo "MODO: simulação (use --apply para mover)"
echo "Origem:  $SRC"
echo "Destino: $DEST"
echo

total=0
shopt -s nullglob dotglob
for item in "$SRC"/*; do
  nome="$(basename "$item")"
  # ignora downloads incompletos e arquivos ocultos
  case "$nome" in
    *.part|*.crdownload|*.tmp|*.aria2|.*) echo "pulando: $nome"; continue ;;
  esac

  if [[ -d "$item" ]]; then
    cat="Pastas"
  elif [[ "$nome" == *.* ]]; then
    cat="$(categoria "${nome##*.}")"
  else
    cat="Outros"
  fi

  alvo_dir="$DEST/$cat"
  alvo="$(destino_livre "$alvo_dir" "$nome")"
  echo "$nome  ->  $cat/$(basename "$alvo")"

  if [[ $APPLY -eq 1 ]]; then
    mkdir -p "$alvo_dir"
    mv -n -- "$item" "$alvo"
  fi
  ((total++)) || true
done

echo
if [[ $APPLY -eq 1 ]]; then echo "$total item(ns) movido(s)."; else echo "$total item(ns) seriam movidos."; fi
