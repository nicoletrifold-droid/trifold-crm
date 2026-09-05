---
name: ci-wait-coderabbit-commit-status
description: Esperar CI no trifold-crm exige tratar o check "CodeRabbit" como commit status (state PENDING, sem campo .status) — loop ingenuo sai cedo e da falso "tudo verde"
metadata:
  type: feedback
---

Ao esperar o CI de um PR, **não** feche o loop só em `.status != "COMPLETED"`.
No `statusCheckRollup` deste repo convivem dois formatos: os checks do GitHub
Actions (`CheckRun`, tem `.status`/`.conclusion`) e o **`CodeRabbit`, que é um
commit status** (`StatusContext`: tem `.state`, **não tem `.status``). Um
`select((.status // "COMPLETED") != "COMPLETED")` trata o CodeRabbit como
concluído e o loop retorna com ele em `PENDING`.

Condição que funciona:

```
select((.status // "COMPLETED") != "COMPLETED" or (.conclusion // .state) == "PENDING")
```

**Why:** perdi um round-trip reportando "CI todo verde" quando o CodeRabbit
ainda nem tinha revisado — e o review dele voltou `CHANGES_REQUESTED`. O
`mergeStateStatus` denunciava (`UNSTABLE`, não `CLEAN`), mas eu tinha olhado a
lista de checks primeiro.

**How to apply:** em qualquer `until`-loop de espera de CI aqui, use a condição
acima E confirme o fecho com `mergeStateStatus == "CLEAN"` +
`reviewDecision == "APPROVED"`, não com a lista de checks. Depois do review,
confira as threads por GraphQL (`reviewThreads { isResolved isOutdated }`) —
o CodeRabbit resolve as próprias threads sozinho quando o commit de correção
sobe, e `reviews[]` passa a ter os dois vereditos em ordem
(`CHANGES_REQUESTED` e depois `APPROVED`); o último é o que vale.

Relacionado: [[feedback_quality_gate_signals]].
