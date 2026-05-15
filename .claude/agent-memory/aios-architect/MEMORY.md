# Architect Agent Memory

## Project Memory

- [project_epic_29_migration_convention.md](project_epic_29_migration_convention.md) — Convention from Story 29.1 PASS (3-digit prefix, ghost `_remote_only.sql` for CONCURRENTLY, validation via Management API). Required for Stories 29.2-29.7 gates.
- [project_story_29_8_env_var_pattern.md](project_story_29_8_env_var_pattern.md) — Vercel env var failure pattern: `vercel env ls` confirms existence but NOT value; pull to /tmp to detect empty values. Story 29.8 fixed 40d-old empty NEXT_PUBLIC_SUPABASE_URL.
- [project_epic_29_closure.md](project_epic_29_closure.md) — Epic 29 closed 2026-05-14 (8/8 PASS). Smoke runtime validável via Management API (cron.job_run_details). Epic closure pattern: status Done + summary table in epic file, no separate doc.
- [project_epic_30_analytics_rpc_pattern.md](project_epic_30_analytics_rpc_pattern.md) — Pattern Story 30.1 PASS: RPC JSONB com 6 CTEs (anti-IDOR explícito em todas), SECURITY INVOKER, COALESCE defensivo, enum→text, `toCount()` helper. EXPLAIN 3.8ms (13x abaixo de 50ms).
- [project_story_30_8_count_filter_pattern.md](project_story_30_8_count_filter_pattern.md) — Pattern Story 30.8 PASS: COUNT(*) FILTER sobre scan único quando todas agregações são na mesma tabela. Alternativa ao multi-CTE da 30.1 (quando há JOINs/tabelas diferentes).
- [project_epic_30_closure.md](project_epic_30_closure.md) — Epic 30 closed 2026-05-14 (9/9 stories Done). 2 migrations, 3 RPCs, 1 trigger. Composição multiplicativa com Epic 29. Padrão de closure: status Done + closed_at + sumário com ganhos no epic file (sem doc separado).

## EPIC-ACT Wave 2 Quality Gate Review (2026-02-06)
- Reviewed: ACT-6 (Unified Activation Pipeline, 67 tests, APPROVED)
- Total EPIC-ACT: 255 tests pass across 4 test suites (0 regressions)
- UnifiedActivationPipeline: single entry point, 5-way parallel load, 3-phase sequential, GreetingBuilder final
- Timeout architecture: 150ms per-loader, 200ms total pipeline, fallback greeting on failure
- Timer leak concern: _timeoutFallback setTimeout not cancelled when pipeline wins the race (advisory, not blocking)
- generate-greeting.js refactored to thin wrapper; backward compatible
- All 12 agent .md files updated with unified STEP 3 reference
- *validate-agents command added to aios-master (validate-agents.md task file)

## EPIC-ACT Wave 1 Quality Gate Review (2026-02-06)
- Reviewed: ACT-1 (config fix, merged), ACT-2 (user_profile audit, 31 tests), ACT-3 (ProjectStatusLoader, 90 tests), ACT-4 (PermissionMode, 67 tests)
- All 188 tests pass across 3 test suites
- Key patterns: fingerprint-based cache invalidation, file locking with wx flag, mode cycling (ask>auto>explore)
- PermissionMode reads from `.aios/config.yaml`, NOT from `.aios-core/core-config.yaml` - different config hierarchy
- GreetingPreferenceManager reads from `.aios-core/core-config.yaml` (agentIdentity.greeting.preference)
- The *yolo command cycles PermissionMode; it does NOT directly change greeting preference

## Architecture Patterns to Track
- Agent activation: UnifiedActivationPipeline is now THE single entry point for all 12 agents (ACT-6)
- Previous two paths (Direct 9 agents + CLI wrapper 3 agents) are now unified
- generate-greeting.js is thin wrapper around UnifiedActivationPipeline (backward compat)
- user_profile cascades: config-resolver > validate-user-profile > greeting-preference-manager > greeting-builder
- Permission system: permission-mode.js + operation-guard.js + index.js (facade)
- ProjectStatusLoader: .aios/project-status.yaml (runtime cache), separate from .aios-core/ (framework config)
- PM agent bypasses bob mode restriction in _resolvePreference()

## Key File Locations
- Unified Pipeline: `.aios-core/development/scripts/unified-activation-pipeline.js`
- Permissions: `.aios-core/core/permissions/`
- Greeting system: `.aios-core/development/scripts/greeting-builder.js`, `greeting-preference-manager.js`
- Project status: `.aios-core/infrastructure/scripts/project-status-loader.js`
- User profile validation: `.aios-core/infrastructure/scripts/validate-user-profile.js`
- Post-commit hook: `.aios-core/infrastructure/scripts/git-hooks/post-commit.js` + `.husky/post-commit`
- Validate agents task: `.aios-core/development/tasks/validate-agents.md`

## Pre-existing Test Failures (not EPIC-ACT related)
- squads/mmos-squad/ (6 suites): missing clickup module
- tests/core/orchestration/ (2 suites): greenfield-handler, terminal-spawner
