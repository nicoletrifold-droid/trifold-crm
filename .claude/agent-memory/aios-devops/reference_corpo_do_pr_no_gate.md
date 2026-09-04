---
name: corpo-do-pr-no-gate
description: O @qa às vezes escreve o corpo do PR pronto no campo `corpo_do_pr` do arquivo de gate — mas nem todo gate tem; confira antes de compor um do zero
metadata:
  type: reference
---

Quando o spawn diz "o corpo do PR já está escrito pelo @qa, no campo do gate", o campo é
`corpo_do_pr:` (bloco literal `|`) no fim de `docs/qa/gates/<story>.yml`, tipicamente depois
de `recommended_status`. Exemplo real: `docs/qa/gates/900.68-declara-papel-do-host-no-residual-ac10.yml:205`
(a própria story cita o campo pelo nome no fim do QA Results).

**Why:** economiza retrabalho e evita divergência entre o que o gate mediu e o que o PR
afirma — o corpo do @qa já vem com os exit codes, as mutações e os residuais nomeados.

**How to apply:**
- `grep -n "corpo_do_pr" docs/qa/gates/<story>.yml` **antes** de escrever qualquer corpo.
  Se existir, use como está (é a instrução) — não reescreva.
- **Nem todo gate tem o campo, mesmo quando o spawn afirma que tem.** Medido em 2026-09-04:
  o gate da 75-373 (PASS, 152 linhas) **não** tinha `corpo_do_pr` nem nada equivalente na
  story. Nesse caso, componha a partir de `status_reason` + `gates_reexecutados_sem_cache` +
  `mutacoes_do_qa` + `evidencias_independentes` + `top_issues` (que é onde os residuais já
  estão nomeados e classificados), e **diga no relatório que o campo não existia** em vez de
  fingir que copiou.
- Note a diferença de numeração dos gates: stories do Epic 900 usam ponto
  (`900.68-…yml`), as do 75 usam hífen (`75-373-…yml`). `ls docs/qa/gates/ | grep` com os
  dois formatos.

Relacionado: [[status-story-via-branch-pr]], [[story-fatiada-status-inprogress]].
