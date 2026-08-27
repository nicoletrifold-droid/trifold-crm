---
name: prove-prod-deploy-matches-merge-commit
description: Provar que o deploy de produção do trifold-crm é o commit de merge exige vercel inspect ou a REST v13 (meta.githubCommitSha) — vercel ls piped em grep perde a coluna de status
metadata:
  type: feedback
---

Depois de mergear um PR do `trifold-crm`, **não** basta ver um deploy novo em
`vercel ls --prod`: prove que ele é **o commit de merge** e que ficou `READY`.

```bash
# 1) achar o deployment mais recente de produção
npx vercel ls trifold-crm --prod | head -5

# 2) status + aliases (não filtre com grep — ver armadilha abaixo)
npx vercel inspect https://trifold-XXXXXXX-trifold-s-projects.vercel.app

# 3) prova de que é o commit de merge (o que realmente fecha o deploy)
TOKEN=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/Library/Application Support/com.vercel.cli/auth.json')))['token'])")
TEAM=$(python3 -c "import json;print(json.load(open('/Users/marcos/trifold-crm/.vercel/project.json'))['orgId'])")
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.vercel.com/v13/deployments/<dpl_id>?teamId=$TEAM" | python3 -c "..."
# ler: readyState, target, meta.githubCommitSha, meta.githubCommitRef, errorMessage
```

O sinal que fecha é `readyState: READY` + `target: production` +
`meta.githubCommitSha == <SHA do merge>` + `meta.githubCommitRef == main`.
Confirmar o alias `crm.trifold.eng.br` na lista de aliases do `inspect`
(canônico — ver [[trifold-crm-domains]]) e um smoke `curl -o /dev/null -w '%{http_code}'`
na raiz: **307 → `/login` é o esperado**, não erro (200 na raiz seria suspeito).

**Why (armadilha que me custou 10 minutos em 2026-08-27, PR #517):** montei um loop de
polling com `npx vercel ls trifold-crm --prod | grep -E "trifold-[a-z0-9]+-trifold" | head -1`
e o `grep` devolveu **só a URL, sem a coluna de status**. O `grep -qE "Ready|Error"`
nunca casou, o loop rodou 22 vezes e estourou o timeout de 10 min — enquanto o deploy
tinha ficado `READY` em **2m14s**. O `vercel inspect` mostrou `● Ready` na primeira
tentativa. Mesma classe do erro de [[vercel-static-deploy-concurrency]]: filtro
apertado demais transforma "não medi" em "não está pronto".

**How to apply:** para status de deploy, use `vercel inspect` ou a REST API — nunca
`vercel ls` filtrado por `grep` de URL. Se precisar de polling, faça o loop em cima do
campo `readyState` da REST API, que é um valor único e estável (`BUILDING`, `READY`,
`ERROR`, `CANCELED`), não de uma tabela formatada para humanos. E o `git log` de
`origin/main` não prova deploy: o build da Vercel pode falhar depois do merge
([[incidente-deploy-900-14b]]).
