#!/bin/sh
# Acompanhamento Diário: rode este arquivo para abrir o aplicativo (no macOS, renomeie a cópia para
# iniciar.command para abrir com dois cliques). Ctrl+C ou fechar o terminal para o servidor.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale a versão atual em https://nodejs.org e tente de novo."
  exit 1
fi
exec node scripts/start-local.mjs
