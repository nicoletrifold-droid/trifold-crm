---
name: cron-gatilho-duplicado-epic75
description: Vercel crons in this project get invoked twice per schedule by a trigger external to the repo; the accepted fix is a DB run-lock, never an investigation
metadata:
  type: project
---

Several `/api/cron/*` routes in packages/web are invoked **twice per schedule** in production by a trigger that does not exist anywhere in the repo (`vercel.json` lists each route once, no `.github/workflows/`, no `pg_cron`). Confirmed twice: `/api/cron/followup` (Story 75-352, two `FOLLOWUP_EXECUTED` receipts in the same second) and `/api/cron/analytics-report` (Story 75-367, two distinct Resend `emailId`s ~57s apart, duplicate weekly report email).

**Why:** The duplicate trigger was hunted exhaustively in 75-352 and never found — it is external to what the repo shows. The team's standing decision is to fix the *effect* without depending on identifying the cause: an atomic DB run-lock (migration 234 — `cron_locks` table + `claim_cron_run`/`finish_cron_run` RPCs, wrapped by `packages/web/src/lib/cron/claim-run.ts`).

**How to apply:**
- Any new or edited cron route that has a user-visible side effect (sends email/WhatsApp, writes money-adjacent rows) should claim a run lock. Do not re-investigate the duplicate trigger — that is explicitly out of scope in this story family.
- The shared helper `claimCronRun` is **fail-OPEN on purpose** (returns `{ runId: null, claimed: true }` when the RPC errors) because `followup` has a second per-lead lock behind it. A caller that has no second lock must implement fail-CLOSED **in the caller**, discriminating `claimed === false` (lost the race) from `claimed === true && runId === null` (RPC failed). Never "fix" the asymmetry inside the helper — `claim-run.test.ts` pins the fail-open behavior and `followup` depends on it.
- The lock's min-interval is a per-job constant in `claim-run.ts`. The real observed gap between duplicate invocations is ~60s, so any interval of minutes suffices; the generous values (90min for the 2h cron, 144h for the weekly one) exist for schedule-delay slack. Cost of a long interval: a winning run that fails cannot retry until the interval expires — release manually with `update cron_locks set started_at = now() - interval 'N hours' where job_name = '...'`.
- Skip paths must log via `logEventOnce` (awaited), not `logEvent` (fire-and-forget dies when the lambda freezes, Story 87-6). Without that row, "only one email arrived" cannot distinguish "the lock worked" from "the duplicate trigger stopped" — the fix becomes unverifiable in production.

Related: [[project_trifold_crm]]
