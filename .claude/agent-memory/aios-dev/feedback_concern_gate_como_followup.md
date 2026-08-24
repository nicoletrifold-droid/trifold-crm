---
name: concern-gate-como-followup
description: QA gate concerns approved for implementation after the gate go in as follow-up (Change Log + Dev Agent Record), never as a retroactively invented AC
metadata:
  type: feedback
---

When the user approves implementing a **concern** that @qa raised in a gate (not a blocking finding — a LOW/CONCERNS item), register it in the story as a **follow-up do gate**: an entry in the Change Log and a subsection in the Dev Agent Record. Do **not** write a new Acceptance Criterion after the fact, and do not edit the QA Results section.

**Why:** The user said it directly on Story 75-367 C1: *"Não invente AC novo retroativo — registre como follow-up do gate, que é o que é."* An AC created after the gate rewrites history — it makes the story look like it always required the thing, which destroys the record of what was actually validated by @po and what was decided later. The QA Results section belongs to @qa; @dev's authorized sections are Tasks/Subtasks, Dev Agent Record, File List, Change Log, Status.

**How to apply:**
- Say explicitly in the story that it is a follow-up and not an AC ("Não é AC desta story").
- List which concerns stay open, so the record does not imply the whole gate was cleared.
- These tasks come with **minimum scope as an explicit demand** — the user spells out what not to touch (adjacent constants, existing guards, the loop, sibling modules). Treat that list as hard boundary, not as a suggestion; when a nice-to-have (e.g. richer error detail in metadata) would require touching a forbidden area, drop it and say in the story that you dropped it and why.
- If the gate's own recommendation is wrong or weaker than an alternative, diverging is fine — but name the divergence in the story and give the criterion, including what **weakens** your argument. See [[feedback_corte_de_escopo_comentarios]] for the same rule applied to code comments.

Related: [[project_cron_gatilho_duplicado]]
