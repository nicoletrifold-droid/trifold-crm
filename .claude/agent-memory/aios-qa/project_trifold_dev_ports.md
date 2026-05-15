---
name: Trifold local dev server confusion with Markuva on port 3000
description: When validating Trifold features locally, never assume port 3000 = Trifold. Multiple Next.js projects on this machine bind to 3000.
type: project
---

When running QA validations locally on this machine, **port 3000 is frequently NOT the Trifold CRM** — it is often Markuva (or another `next dev` project). The user has multiple Next.js apps that all default to `--port 3000`.

**Why:** During the logout hotfix QA gate (May 2026), a brief told me to test on port 3000 with credentials that happened to exist in BOTH apps. I logged into Markuva successfully without realizing it, and started clicking buttons that didn't match Trifold's DOM — wasted time and almost reported false failures.

**How to apply:**
- Before driving a browser at `localhost:3000`, verify identity: `curl -s http://localhost:3000/login | grep -oE '<title>[^<]+</title>'` — Trifold has no explicit `<title>` on login (or it should say Trifold).
- Safer: start a fresh Trifold dev server on an alternate port with `cd packages/web && pnpm exec next dev --port 3100`. The proxy and server actions work identically on any port.
- Verify proxy: `curl -I http://localhost:<port>/dashboard` must return 307 → /login (Trifold) or `?redirectTo=...` (Markuva sometimes adds it).
- Trifold's proxy does NOT add `?redirectTo=` query param on auth-redirect — it just goes to `/login`. The brief was wrong about that detail.
