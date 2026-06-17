---
name: feedback-validation-post-pm-review
description: When validating stories after a PM review applied action items, always audit each AI explicitly with file evidence instead of just trusting the change log
metadata:
  type: feedback
---

When @po validates stories that went through a prior `@pm` review with applied action items (e.g., AI-1, AI-2, ...), the validation must do BOTH a 10-point checklist per story AND a separate audit table tracking every AI from the PM review back to its source.

**Why:** Trusting the story Change Log entry ("AI-3/4/5/6 applied") is insufficient. Two failure modes seen in practice:
1. The @sm logs "AI-X applied" but the actual edit was incomplete or in the wrong section.
2. A non-blocking AI (like AI-14 here) gets silently dropped without being acknowledged — the parent agent then assumes it's done.

The audit table forces a per-AI grep/read with line references. Non-applied items get flagged explicitly with rationale (blocking vs non-blocking).

**How to apply:**
- After running the 10-point checklist per story, add a "Action Items Aplicados — Auditoria" section.
- One row per AI with: description, target story, applied status (✓/⚠️), file evidence (line number or grep result).
- For non-applied AIs, classify as blocking or non-blocking and reflect that in the GO/NO-GO decision per story.
- Cross-reference [[story-lifecycle-draft-to-ready]] — non-blocking gaps don't prevent GO but must be noted in the story's Change Log entry so the @dev/QA sees them.

This protects against silent regression of PM-identified issues during the @sm → @po handoff.
