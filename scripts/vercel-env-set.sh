#!/usr/bin/env bash
set -euo pipefail

# Story 75-66 — Set/atualiza uma variável de ambiente no Vercel via REST API.
#
# POR QUE EXISTE: `vercel env add` via stdin grava VALOR VAZIO silenciosamente (bug do CLI; já
# causou 2 incidentes — VAPID 75-40 e PORTAL_NOTIF_PAUSED 75-66). Este script usa a REST API,
# que grava o valor corretamente, e CONFIRMA o resultado.
#
# Uso:
#   scripts/vercel-env-set.sh <KEY> <VALUE> [environment]
#   environment: production (default) | preview | development
#
# Exemplo:
#   scripts/vercel-env-set.sh PORTAL_NOTIF_PAUSED 1 production
#
# Depois rode:  vercel redeploy <último deploy prod>   (env só vale em deployment novo)
#
# Requisitos: jq, curl, e estar logado no `vercel` CLI (token lido do auth.json).

KEY="${1:?uso: vercel-env-set.sh <KEY> <VALUE> [environment]}"
VALUE="${2:?faltou o VALUE}"
TARGET="${3:-production}"

AUTH_JSON="$HOME/Library/Application Support/com.vercel.cli/auth.json"
PROJECT_JSON=".vercel/project.json"

[ -f "$AUTH_JSON" ] || { echo "erro: $AUTH_JSON não encontrado — faça 'vercel login'"; exit 1; }
[ -f "$PROJECT_JSON" ] || { echo "erro: $PROJECT_JSON não encontrado — rode na raiz do repo (vercel link)"; exit 1; }

TOKEN="$(jq -r .token "$AUTH_JSON")"
PID="$(jq -r .projectId "$PROJECT_JSON")"
TEAM="$(jq -r .orgId "$PROJECT_JSON")"
API="https://api.vercel.com"

# Procura env existente com essa key + target (para decidir entre PATCH e POST).
EID="$(curl -s "$API/v9/projects/$PID/env?teamId=$TEAM" -H "Authorization: Bearer $TOKEN" \
  | jq -r --arg k "$KEY" --arg t "$TARGET" \
    '.envs[] | select(.key==$k and (.target|index($t))) | .id' | head -n1)"

if [ -n "$EID" ] && [ "$EID" != "null" ]; then
  echo "Atualizando $KEY ($TARGET) [id=$EID] via PATCH…"
  curl -s -X PATCH "$API/v9/projects/$PID/env/$EID?teamId=$TEAM" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "$(jq -nc --arg v "$VALUE" '{value:$v}')" >/dev/null
else
  echo "Criando $KEY ($TARGET) via POST (type=encrypted)…"
  curl -s -X POST "$API/v10/projects/$PID/env?teamId=$TEAM" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "$(jq -nc --arg k "$KEY" --arg v "$VALUE" --arg t "$TARGET" \
      '{key:$k, value:$v, type:"encrypted", target:[$t]}')" >/dev/null
fi

# Confirma lendo de volta (vercel env pull → arquivo temporário).
TMP="$(mktemp)"
vercel env pull "$TMP" --environment="$TARGET" --yes >/dev/null 2>&1 || true
echo -n "Valor agora: "
grep -E "^$KEY=" "$TMP" || echo "(não encontrado no pull)"
rm -f "$TMP"
echo "OK. Lembre de: vercel redeploy <último deploy $TARGET>"
