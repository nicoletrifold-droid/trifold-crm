#!/usr/bin/env bash
# Story 75-329 — produção está servindo o mesmo commit que a `main`?
#
# POR QUE ISTO EXISTE. Em 17/08/2026 três merges (#432, #433, #434) não geraram
# deploy de produção: o GitHub estava em incidente com "Webhooks: partial_outage",
# então parte das entregas para a Vercel se perdeu. Nada falhou de forma visível —
# nenhum erro, nenhum build vermelho. O CRM simplesmente continuou servindo o código
# da véspera, e só se descobriu porque alguém estranhou um número na tela.
#
# Esse é o modo de falha que este script fecha: silêncio. Ele compara o commit que
# a produção está servindo com o `HEAD` da `main` e grita quando divergem.
#
# NÃO DEPENDE DA API DO GITHUB de propósito — justamente porque o cenário que ele
# precisa detectar é o GitHub indisponível. O lado do git vem do `git fetch` (que usa
# o remoto, não a API REST) e o lado da produção vem da API da Vercel.
#
# USO
#   ./scripts/check-deploy-drift.sh          # confere e sai 0 (ok) ou 1 (divergiu)
#   ./scripts/check-deploy-drift.sh --fix    # confere e, se divergiu, dispara o deploy
#
# Credenciais: $VERCEL_TOKEN ou o login do CLI
# (~/Library/Application Support/com.vercel.cli/auth.json). Ids: .vercel/project.json.

set -euo pipefail

cd "$(dirname "$0")/.."

FIX=0
[[ "${1:-}" == "--fix" ]] && FIX=1

if [[ ! -f .vercel/project.json ]]; then
  echo "✖ .vercel/project.json não encontrado — rode a partir do repo (vercel link já feito)." >&2
  exit 2
fi

export VERCEL_TOKEN="${VERCEL_TOKEN:-}"
export DRIFT_FIX="$FIX"

# `git fetch` fala com o remoto por git-over-https, que sobrevive a queda da API REST
# do GitHub. Se nem isso responder, avisamos e saímos sem fingir um veredito.
if ! git fetch --quiet origin main 2>/dev/null; then
  echo "⚠ Não consegui falar com o remoto (GitHub fora do ar?). Sem veredito." >&2
  exit 2
fi
MAIN_SHA="$(git rev-parse origin/main)"
export MAIN_SHA

python3 - <<'PY'
import json, os, subprocess, sys, urllib.request

proj = json.load(open(".vercel/project.json"))
team = proj.get("orgId")
token = os.environ.get("VERCEL_TOKEN") or ""
if not token:
    auth_path = os.path.expanduser(
        "~/Library/Application Support/com.vercel.cli/auth.json"
    )
    try:
        token = json.load(open(auth_path))["token"]
    except Exception:
        print("✖ Sem credencial da Vercel: defina $VERCEL_TOKEN ou rode `vercel login`.", file=sys.stderr)
        sys.exit(2)

def api(path, method="GET", body=None):
    req = urllib.request.Request(
        f"https://api.vercel.com{path}",
        data=json.dumps(body).encode() if body else None,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

main_sha = os.environ["MAIN_SHA"]

# O deploy que REALMENTE serve produção é o que está pronto e é o mais recente com
# target=production — não basta olhar o último deployment criado (pode estar buildando
# ou ter falhado, e nesse caso quem responde ao usuário ainda é o anterior).
deps = api(
    f"/v6/deployments?projectId={proj['projectId']}&teamId={team}"
    f"&target=production&state=READY&limit=1"
)["deployments"]

if not deps:
    print("✖ Nenhum deploy de produção encontrado.", file=sys.stderr)
    sys.exit(2)

live = deps[0]
live_sha = (live.get("meta") or {}).get("githubCommitSha", "") or "?"

if live_sha.startswith(main_sha[:12]) or main_sha.startswith(live_sha[:12]):
    print(f"✓ Produção em dia — servindo {main_sha[:8]} (main)")
    sys.exit(0)

# Quantos commits a produção está atrás? Só informativo: se o objeto não estiver no
# clone local (fetch raso, deploy de outra branch), seguimos sem o número.
try:
    atras = subprocess.check_output(
        ["git", "rev-list", "--count", f"{live_sha}..{main_sha}"],
        stderr=subprocess.DEVNULL,
    ).decode().strip()
    atraso = f" ({atras} commit(s) atrás)"
except Exception:
    atraso = ""

# Divergência só de documentação NÃO é problema: story marcada como Done, memória,
# script SQL de correção de dado — nada disso muda o que a Vercel serve. Alertar
# nesses casos treinaria o leitor a ignorar o alerta, que é como um alarme morre.
SEM_IMPACTO = ("docs/", ".claude/", "scripts/")
def afeta_app(path: str) -> bool:
    if path.endswith(".md") or path.endswith(".sql"):
        return False
    return not path.startswith(SEM_IMPACTO)

try:
    mudados = subprocess.check_output(
        ["git", "diff", "--name-only", f"{live_sha}..{main_sha}"],
        stderr=subprocess.DEVNULL,
    ).decode().split()
except Exception:
    mudados = []  # sem o diff local, tratamos como se afetasse (conservador)

if mudados and not any(afeta_app(p) for p in mudados):
    print(f"✓ Produção serve {live_sha[:8]}; main está em {main_sha[:8]}{atraso},")
    print(f"  mas a diferença é só documentação/script ({len(mudados)} arquivo(s)) — sem impacto no app.")
    sys.exit(0)

print(f"✖ DIVERGÊNCIA: produção serve {live_sha[:8]}, main está em {main_sha[:8]}{atraso}")
print("  A tela pode estar mostrando dados/código antigos sem nenhum erro aparecer.")
if mudados:
    afetados = [p for p in mudados if afeta_app(p)]
    print(f"  {len(afetados)} arquivo(s) de app não estão no ar, ex.: {', '.join(afetados[:3])}")

if os.environ.get("DRIFT_FIX") != "1":
    print("  Para corrigir: ./scripts/check-deploy-drift.sh --fix")
    sys.exit(1)

link = api(f"/v9/projects/{proj['projectId']}?teamId={team}").get("link") or {}
if link.get("type") != "github":
    print("✖ Projeto não está ligado ao GitHub — deploy manual não suportado aqui.", file=sys.stderr)
    sys.exit(2)

novo = api(
    f"/v13/deployments?teamId={team}&skipAutoDetectionConfirmation=1",
    method="POST",
    body={
        "name": link.get("repo", "trifold-crm"),
        "project": proj["projectId"],
        "target": "production",
        "gitSource": {
            "type": "github",
            "repoId": link["repoId"],
            "ref": link.get("productionBranch", "main"),
            "sha": main_sha,
        },
    },
)
print(f"→ Deploy de produção disparado: {novo['id']} ({main_sha[:8]})")
print("  Acompanhe com: npx vercel ls")
sys.exit(1)
PY
