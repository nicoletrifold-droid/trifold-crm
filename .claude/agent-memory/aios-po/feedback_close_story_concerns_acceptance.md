---
name: close-story-concerns-acceptance
description: How to close a story whose QA gate is CONCERNS when the stakeholder explicitly accepts the open gap
metadata:
  type: feedback
---

When `*close-story` is run on a story whose QA gate verdict is CONCERNS (not PASS), it is legitimate to transition InReview → Done **only when the stakeholder explicitly accepts the open gap**. Record the acceptance in the Change Log with the gap, the reason, and who accepted it.

**Why:** In this project, runtime/E2E gaps (e.g. "migration not run in DEV", "no app-level E2E") are routinely accepted when DB-level validation passed and code is already in production. Story 52-6 was closed this way after lucas@trifold.eng.br accepted CONCERNS — same acceptance pattern as Story 52-2, which shipped to prod without issues.

**How to apply:** On a CONCERNS close, the closure Change Log entry must capture: (1) the specific open issue id + severity (e.g. TEST-001 medium = E2E not run); (2) what compensating validation *was* done (e.g. DB-level: authorized roles see rows, unauthorized get 0 rows via RLS); (3) prod deployment evidence (migration applied, commit sha); (4) explicit stakeholder acceptance. Low-severity gate issues (PERF/MNT/SEC) stay as monitored observations, no action. Do NOT silently flip the gate to PASS — the gate file stays CONCERNS; acceptance lives in the story Change Log.

Related: [[validation-post-pm-review]].
