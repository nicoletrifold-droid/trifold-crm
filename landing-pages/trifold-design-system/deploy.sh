#!/usr/bin/env bash
# Story 90-1 — publicação do site institucional (trifold.eng.br).
#
# POR QUE ESTE SCRIPT EXISTE. Até a Story 90-1 o deploy era um processo em prosa
# no README: "monte a pasta completa, baixe assets/uploads, rode vercel deploy".
# A partir da 90-1 a pasta que sobe não é mais a pasta-fonte — é um `dist/`
# montado, com as 5 páginas institucionais pré-renderizadas. Documentar isso em
# prosa convidaria dois processos (manual + script) a divergirem, e o modo de
# falha seria silencioso: um deploy feito "à mão da pasta-fonte" publica o site
# sem a pré-renderização, sem ninguém perceber.
#
# ATENÇÃO — o que sobe NÃO é o que está no git. Os `.dc.html` versionados são a
# fonte editável; `dist/` é o build-output (não versionado). Editar `dist/` à mão
# é sempre erro: ele é apagado e regerado a cada execução.
#
# USO
#   ./deploy.sh              # monta, valida e PUBLICA em produção
#   ./deploy.sh --dry-run    # monta e valida, mas NÃO publica (passos 1-3)
#
# Cada passo falha alto: `set -euo pipefail` + verificação explícita. Nenhum
# passo segue silencioso se o anterior falhou.

set -euo pipefail

cd "$(dirname "$0")"

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

PROD_URL="${PROD_URL:-https://trifold.eng.br}"
SCOPE="${VERCEL_SCOPE:-trifold-s-projects}"

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
fail() { printf '\033[31m✖ %s\033[0m\n' "$1" >&2; exit 1; }

# ─────────────────────────────────────────────────────────────────────────────
step "[1/5] Verificando assets/ e uploads/ locais"
# Estes ~77 MB não estão no git (ver .gitignore). Sem eles o headless browser
# tira o snapshot de uma página com imagem quebrada, e esse snapshot vai para
# produção — falha silenciosa e cara. Por isso é a PRIMEIRA barreira.
for dir in assets uploads; do
  [[ -d "$dir" ]] || fail "'$dir/' não existe. Baixe assets/ e uploads/ do deployment de produção atual antes de publicar (ver README.md)."
  count=$(find "$dir" -type f | wc -l | tr -d ' ')
  [[ "$count" -gt 0 ]] || fail "'$dir/' está vazio. Baixe-o do deployment de produção atual (ver README.md)."
  printf '  ✓ %s/ (%s arquivos)\n' "$dir" "$count"
done
[[ -f assets/vendor/react.production.min.js ]] || fail "assets/vendor/react.production.min.js ausente — o site não monta sem o vendor local do React."
printf '  ✓ vendor local do React presente\n'

# Vínculo com o projeto Vercel (achado QA-1). O deploy roda de dentro do `dist/`,
# e a CLI resolve o projeto pelo `.vercel/project.json` do diretório onde roda.
# Sem o vínculo, `vercel deploy` não falha de forma óbvia — ele CRIA UM PROJETO
# NOVO com o nome da pasta. O passo 2 copia o vínculo para o `dist/`; aqui só
# confirmamos que existe algo para copiar, antes de gastar o build inteiro.
[[ -f .vercel/project.json ]] || fail ".vercel/project.json ausente — rode: vercel link --yes --scope $SCOPE --project trifold-design-system"
printf '  ✓ vínculo do projeto Vercel presente (%s)\n' "$(node -e 'process.stdout.write(require("./.vercel/project.json").projectName)')"

# ─────────────────────────────────────────────────────────────────────────────
step "[2/5] Montando dist/ (assembly + pré-renderização)"
# Se o prerender de UMA página falhar, o build aplica o fallback do AC5 (aquela
# página fica com o .dc.html-fonte original) e SEGUE — uma página não derruba o
# deploy das outras quatro.
node scripts/build-dist.mjs || fail "montagem do dist/ falhou"

# ─────────────────────────────────────────────────────────────────────────────
step "[3/5] Gate pré-deploy"
# Procura template cru (`{{`, `<sc-for>`) DENTRO de #dc-prerender. O grep tem de
# ser escopado: o `<x-dc>` sempre tem `{{ }}` — é o template-fonte, e isso é
# correto. Uma página em fallback do AC5 (sem #dc-prerender) passa de propósito.
# Também é aqui que a AC7 é cobrada: <form>/<input>/<button> no bloco = ABORTA.
node scripts/check-dist.mjs dist --src . || fail "gate pré-deploy reprovou — NADA foi publicado"

if [[ "$DRY_RUN" == "1" ]]; then
  printf '\n\033[33m▸ --dry-run: parando antes de publicar. dist/ está montado e validado.\033[0m\n'
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
step "[4/5] Publicando em produção"
command -v vercel >/dev/null 2>&1 || fail "CLI da Vercel não encontrada no PATH."
( cd dist && vercel deploy --prod --yes --scope "$SCOPE" ) || fail "vercel deploy falhou"

# ─────────────────────────────────────────────────────────────────────────────
step "[5/5] Verificação pós-deploy"
# A propagação do alias de produção não é instantânea; algumas tentativas.
for attempt in 1 2 3 4 5; do
  if node scripts/check-live.mjs "$PROD_URL"; then
    printf '\n\033[32m✓ Deploy concluído e verificado em %s\033[0m\n' "$PROD_URL"
    exit 0
  fi
  printf '  … tentativa %s/5 falhou, aguardando propagação\n' "$attempt"
  sleep 6
done
fail "o deploy subiu mas a verificação pós-deploy não passou em $PROD_URL — investigue ANTES de considerar publicado"
