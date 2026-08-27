---
name: bot-changes-requested-nao-bloqueia
description: reviewDecision CHANGES_REQUESTED do coderabbitai não segura PR no trifold-crm; o sinal que vale é mergeStateStatus CLEAN — checar o author de cada review antes de parar
metadata:
  type: feedback
---

No `trifold-crm`, `gh pr view --json reviewDecision` devolvendo **`CHANGES_REQUESTED`**
**não** é motivo para parar o merge se todas as reviews forem do bot. Antes de decidir,
olhe o **autor** de cada uma:

```bash
gh pr view <N> --json mergeable,mergeStateStatus,reviewDecision,reviews \
  -q '{mergeable, mergeStateStatus, reviewDecision, reviews: [.reviews[] | {author: .author.login, state}]}'
```

Se os autores forem só `coderabbitai`, o `reviewDecision` é ruído. O par de campos que
manda é **`mergeable: MERGEABLE` + `mergeStateStatus: CLEAN`** — se a branch protection
estivesse realmente segurando, viria `BLOCKED`/`BEHIND`/`DIRTY`, e o `gh pr merge`
falharia. Em 2026-08-27 (PR #517) havia **3** reviews `CHANGES_REQUESTED` do
`coderabbitai` com `mergeStateStatus: CLEAN` e o squash merge passou de primeira.

**Why:** decisão explícita do Marcos em 27/08/2026 — **achado de bot não é insumo** neste
fluxo e `CHANGES_REQUESTED` de bot **não segura PR**. A autorização de merge vem do gate
do @qa (`must_fix: []`), não do bot. O CodeRabbit ainda aparece como **check** no rollup
(e como `SUCCESS`, o que é independente da review) — não confunda os dois: o check pode
estar `PENDING` por ~5 min depois do push e não impede nada.

**How to apply:**
- Ao esperar checks, trate `CodeRabbit` como informativo; os bloqueantes de verdade são
  `type-check · lint · test` e `Vercel – trifold-crm` (o `gate de tenancy` é
  explicitamente não-bloqueante no nome).
- Não abra, não leia e não responda achado de bot no PR — e **não** os cite no relatório.
- As release notes automáticas do CodeRabbit ficam colocadas **dentro do corpo do PR**
  (bloco `<!-- ... release notes by coderabbit.ai -->`). Ao reescrever o corpo, elas
  descrevem só o estado antigo: remova em vez de manter desatualizado.
- Relaciona com [[quality-gate-signals]] e [[story-fatiada-status-inprogress]].
