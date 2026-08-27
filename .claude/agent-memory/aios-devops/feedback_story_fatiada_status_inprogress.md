---
name: feedback-story-fatiada-status-inprogress
description: Story dividida em 2 PRs fica InProgress no PR da primeira fatia — a autorização de push é o next_action do gate do @qa, não o status da story
metadata:
  type: feedback
---

O `pre-push-checklist.md` exige story com status `Done` ou `Ready for Review`. Em story **fatiada em
mais de um PR** esse item não se aplica: a story continua `InProgress` porque a fatia seguinte não
começou. Não bloqueie o push por isso e não "conserte" o status.

**Prova de autorização, nessa ordem:**
1. existe `docs/qa/gates/<story>-fatia<N>-….yml` com `gate: PASS|CONCERNS` e **`must_fix: []`**;
2. o campo **`next_action`** do gate diz `@devops *push`;
3. o `escopo_do_gate` nomeia quais ACs entraram e quais **não reprovam** esta fatia.

Sem esses três, o status `InProgress` volta a ser bloqueio de verdade.

**Why:** Story 87-17 (2026-08-27) tem duas fatias com dois PRs, na ordem A → B, e a Fatia 2 só pode
começar **depois da Fatia 1 em produção** (arbitragem do @po). O status da story mede a story
inteira; o gate mede a fatia. Ler o status como gate reprova um PR que o @qa aprovou.

**How to apply:** no corpo do PR, escreva explicitamente **o que a fatia NÃO conserta** — em 87-17, a
negativa falsa continuava possível até a Fatia 2. Quem revisa precisa saber que o defeito não fecha
com este merge, senão o PR promete mais do que entrega. Ver também
[[feedback_status_story_via_branch_pr]] para a virada de status em si.
