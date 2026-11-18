#!/usr/bin/env bash
# Abre ou fecha um aviso na aba "Issues" do repositório (o GitHub manda e-mail para quem acompanha o repositório).
#   alerta.sh abrir  "<título>" "<texto>"   → cria o aviso, se ainda não houver um aberto com o mesmo título
#   alerta.sh fechar "<título>" "<texto>"   → fecha o aviso aberto com esse título (se houver), com o texto como comentário
# Precisa de GH_TOKEN e GH_REPO no ambiente (o próprio workflow fornece).
set -euo pipefail
acao=${1:?abrir ou fechar}
titulo=${2:?título}
texto=${3:-}

num=$(gh issue list --state open --limit 100 --json number,title | jq -r --arg t "$titulo" '[.[] | select(.title == $t)][0].number // empty')

case "$acao" in
  abrir)
    if [ -n "$num" ]; then
      echo "O aviso #$num já está aberto; não abro outro (evita e-mails repetidos)."
    else
      gh issue create --title "$titulo" --body "$texto"
    fi
    ;;
  fechar)
    if [ -n "$num" ]; then
      gh issue close "$num" --comment "$texto"
      echo "Aviso #$num fechado."
    fi
    ;;
  *)
    echo "uso: alerta.sh abrir|fechar <título> <texto>" >&2
    exit 2
    ;;
esac
