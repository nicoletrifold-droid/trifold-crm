---
name: epic86-capi-prod-state
description: Migration 215 (Meta CAPI outbox) JA aplicada em prod com public_user_id (nao auth.uid do arquivo repo); so falta env var do token
metadata:
  type: project
---

Verificacao read-only do estado de prod (Supabase `dsopqkqjkmhytudaaolv`) para Epic 86 P0 (Meta CAPI), feita 2026-08-10:

**A migration 215 JA foi aplicada em prod** — nao e "aplicar agora". Achados:
- Tabela `meta_capi_outbox` existe com schema/constraints/indice batendo 100% com o arquivo 215 (uniq lead_event, FKs org/lead, status check). RLS habilitada, GRANTs de authenticated/anon = vazio (REVOKE efetivo).
- Funcao `log_lead_stage_change()` em prod JA tem o bloco de enqueue da outbox (Story 86-2) E preserva `public_user_id()` no INSERT em activities.
- Trigger `trg_log_lead_stage_change` em leads ativo (tgenabled='O').
- Cron `meta-capi-dispatch` (*/3) esta em `packages/web/vercel.json` (raiz do deploy) e rota existe — JA rodando: 2 linhas na outbox com status `failed`, attempts=3, last_error `META_CAPI_ACCESS_TOKEN is not configured` (criadas 2026-08-07).

**DIVERGENCIA CRITICA arquivo-vs-prod:** o arquivo `supabase/migrations/215_meta_capi_outbox.sql` no main/working-tree usa `auth.uid()` na linha 109 (NAO tem guarda de public_user_id). A funcao EM PROD usa `public_user_id()`. Ou seja, quem aplicou em prod editou a versao a mao (corretamente) — o arquivo do repo esta ERRADO e regrediria a 125 se reaplicado literalmente. NUNCA reaplicar o arquivo 215 as-is em prod. Ver [[epic86-migration-200-collision]].

**Registro de migrations de prod usa timestamps** (`supabase_migrations.schema_migrations` = `20260710...`), NAO os numeros sequenciais 074/125/215 dos arquivos. Nao da pra confirmar "125 aplicada" por numero — confirma-se pelo corpo da funcao (usa public_user_id => 125 esta materializada).

**Unico gap para ativar:** gravar `META_CAPI_ACCESS_TOKEN` e `META_CAPI_DATASET_ID` no Vercel prod + redeploy. Nenhuma migration pendente.

**Why:** evita reaplicar migration ja aplicada (destrutivo p/ funcao via CREATE OR REPLACE com auth.uid errado).
**How to apply:** ao ativar CAPI, pular etapa de migration; ir direto para env vars + redeploy. Reconciliar arquivo 215 (trocar auth.uid->public_user_id) em PR separado para o repo bater com prod.

**PENDENCIA ABERTA — `META_CAPI_TEST_EVENT_CODE=TEST15571` esta LIGADA em prod desde 2026-08-26** (projeto `trifold-crm` apenas, target production, `type:encrypted`, env id `13373QogX5wtHIa7`; dataset `1337310707164669`, conta "TRIFOLD - VIND"). Foi setada para fechar o T12/AC11 da Story 86-11 (observar 5 eventos no painel Test Events com browser real).
**Why:** enquanto ela existe, TODO evento CAPI de prod vai marcado como teste no Meta — o Events Manager pode nao contabilizar/otimizar sobre esses eventos. Nao e um flag inofensivo de deixar ligado.
**How to apply:** assim que o Lucas confirmar visualmente os 5 eventos, REMOVER a env (`vercel env rm META_CAPI_TEST_EVENT_CODE production` funciona; `rm` nao tem o bug do `add`) e redeployar. Se retomar o Epic 86 e essa env ainda estiver la, tratar como esquecida e perguntar antes de qualquer analise de volume de eventos.

**Nota:** token da Vercel CLI (`~/Library/.../com.vercel.cli/auth.json`) estava `invalidToken` (403) em 2026-08-10 — nao consegui listar env vars via API. Confirmacao de ausencia veio pelo last_error do dispatcher em prod. Renovar login Vercel antes de gravar env.
