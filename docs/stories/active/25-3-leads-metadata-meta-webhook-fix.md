---
id: "25-3"
epic: 25
title: "Meta Webhook Lead Capture — Coluna metadata + Fix deduplicação por leadgen_id"
status: "Closed — Superseded by migration 075"
closed_at: 2026-06-25
closed_by: Pax (@po)
closed_reason: "Premissa original (coluna leads.metadata ausente) obsoleta — coluna já existe em produção via migration 075. Migration 063 proposta aqui é redundante."
priority: P0
points: 3
created_at: 2026-05-26
created_by: River (@sm)
executor: "@data-engineer (Fase 1 — migration) + @dev (Fase 2 — webhook + backfill)"
quality_gate: "@qa"
quality_gate_tools: [migration_safety, webhook_smoke_test, dedup_correctness, regression_check]
depends_on:
  - Migration 062 aplicada em prod
---

# Story 25-3 — Meta Webhook Lead Capture: metadata + deduplicação

> **⛔ STORY ENCERRADA EM 2026-06-25 — SUPERADA / OBSOLETA (não será desenvolvida)**
>
> **Status:** Closed — Superseded by migration 075. Não entra em sprint, não vai para @dev.

## Nota de Encerramento (Pax @po — 2026-06-25)

### Premissa original ficou obsoleta
A story foi escrita em 2026-05-26 partindo de um diagnóstico que **não é mais verdadeiro**:
a coluna `leads.metadata jsonb` "não existe" e por isso leads de formulário Meta falham.
Esse problema **já foi resolvido por outro caminho** desde então.

### O que de fato resolveu o problema
- A coluna `leads.metadata` **já existe em produção** — adicionada pela migration
  **`075_leads_metadata.sql`** (tracked/committed), e não pela `063` proposta nesta story.
  - 075 cria `metadata JSONB NOT NULL DEFAULT '{}'` + índice `idx_leads_metadata_ad_id`.
- **Evidência de produção (2026-06-25):**
  - `metadata_existe = true` (coluna presente na tabela `leads`).
  - **124 leads com `metadata->>leadgen_id` preenchido** → o webhook Meta Lead Forms
    está criando leads e persistindo `leadgen_id` corretamente. O fluxo funciona.

### Destino da migration 063 (untracked) — DESCARTAR
- `supabase/migrations/063_leads_metadata.sql` está **untracked** no working tree (slot baixo,
  nunca commitado). É **redundante** com a 075 (mesma coluna `leads.metadata`).
- **Decisão: DESCARTAR a 063** (não commitar). Manter as duas geraria ruído de numeração e
  uma segunda DDL para a mesma coluna.
- ⚠️ **Follow-up (não bloqueante):** a 063 era a **única** migration que criava o índice
  `idx_leads_metadata_leadgen_id` (lookup parcial por `metadata->>'leadgen_id'`). A 075 **não**
  recria esse índice — só o de `ad_id`. Ao descartar a 063, a dedup por `leadgen_id`
  (webhook + backfill) fica **sem índice dedicado**. Com 124 leads o impacto é nulo (seq scan
  barato), mas se o volume crescer convém portar **apenas o índice** para uma migration nova
  tracked. Registrado em `docs/backlog.md` como tech-debt P3, não urgente.

### Decisão sobre `scripts/meta-backfill-leads.ts` (mudança uncommitted)
- O working tree tem uma melhoria de ~20 linhas no backfill: **dedup secundária por
  `phone_normalized`** (além do `leadgen_id`) + import correto de `MetaOAuthException` e
  `normalizePhoneBR`. É exatamente o que a T2.2 desta story descrevia como CRÍTICO
  ("sem isso o backfill duplica os ~1986 leads vindos do Supremo CRM").
- **Recomendação: MANTER a mudança** (não descartar junto com a 063). É uma ferramenta de dev
  independente da migration, baixo risco e tem valor real de segurança contra duplicação.
- **Não precisa shippar agora.** Quando conveniente, rotear pelo fluxo normal
  `@dev *develop → @qa *qa-gate → @devops *push` como um fix isolado do script de backfill
  (não reabrir esta story). Enquanto não shippado, é seguro deixar uncommitted no working tree.

### Trabalho desta story que NÃO precisa ser feito
- ❌ T1.1/T1.2/T1.3 — criar/aplicar migration 063 → coberto pela 075.
- ❌ AC1 (coluna metadata) → já satisfeito em produção pela 075.
- ❌ AC2 (webhook persiste leadgen_id) → já comprovado (124 leads).
- ✅ AC3 (dedup backfill por leadgen_id + phone) → implementado na mudança uncommitted do script
  (a shippar separadamente, ver acima).

---

## Contexto

O webhook `/api/webhooks/meta-ads/route.ts` recebe notificações da Meta quando alguém
preenche um formulário Lead Ad e tenta criar o lead no CRM. O código persiste campos
críticos (`leadgen_id`, `form_id`, `ad_id`, `campaign_id`) em `leads.metadata` (jsonb),
mas **essa coluna não existe** na tabela `leads`.

Consequência: todos os leads novos vindos de formulários Meta falham silenciosamente —
nenhum lead entra no CRM, Nicole não aborda ninguém.

Diagnóstico confirmado em 2026-05-26:
- `leads.metadata` → coluna não existe (confirmado via PostgREST 42703)
- 1986 leads `source=meta_ads` no CRM vieram **todos** do Supremo CRM sync
- Webhook registrado e subscrito a `leadgen` em 2026-05-26, mas sem migration o fluxo quebra

O script `scripts/meta-backfill-leads.ts` tem o mesmo problema: deduplica por
`metadata->>leadgen_id`, que também falha sem a coluna.

## Objetivo

Adicionar a coluna `leads.metadata jsonb` via migration e garantir que webhook e backfill
funcionem corretamente, permitindo que leads de formulários Meta entrem no CRM com
deduplicação idempotente por `leadgen_id`.

---

## Acceptance Criteria

### AC1 — Migration: coluna metadata adicionada
- [ ] `leads.metadata jsonb NULL` criada via migration `063_leads_metadata.sql`
- [ ] Migration aplica sem erro em ambiente remoto
- [ ] Coluna aceita insert/update com objeto `{ leadgen_id, form_id, ad_id, campaign_id, field_data }`

### AC2 — Webhook: leads de formulário criados corretamente
- [ ] Webhook POST em `/api/webhooks/meta-ads` cria lead com `metadata.leadgen_id` persistido
- [ ] Deduplicação por `metadata->>leadgen_id` funciona (lead duplicado retorna o existente)
- [ ] Fallback de dedup por `phone` mantido (leads sem leadgen_id ainda deduplicam por phone)
- [ ] Lead criado tem `channel='meta_ads'`, `source='meta_ads'`, `stage_id` do estágio default

### AC3 — Backfill: deduplicação por leadgen_id funciona
- [ ] `scripts/meta-backfill-leads.ts` consulta `metadata->>leadgen_id` sem erro
- [ ] `--dry-run` exibe "Criaria lead" / "Skipped (já existe)" corretamente
- [ ] Leads com phone já existente no CRM são skipped (dedup secundária mantida)

### AC4 — Sem regressão
- [ ] Leads existentes com `metadata IS NULL` não são afetados
- [ ] Supremo sync continua funcionando (não usa a coluna metadata)
- [ ] Column é nullable — nenhum insert existente quebra

---

## Tarefas

### Fase 1 — @data-engineer

- [x] **T1.1** Criar `supabase/migrations/063_leads_metadata.sql`:
  ```sql
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS metadata jsonb NULL;
  COMMENT ON COLUMN leads.metadata IS 'Dados de origem externos: Meta Ads leadgen_id, form_id, ad_id, campaign_id, field_data';
  ```
- [x] **T1.2** Verificar que migration aplica sem conflito (`supabase db push` ou script de verificação)
- [ ] **T1.3** Confirmar via PostgREST que `select=metadata` retorna campo sem erro

### Fase 2 — @dev

- [x] **T2.1** Verificar `/api/webhooks/meta-ads/route.ts` — confirmar que `metadata: metaMetadata` já está no insert/update (não requer alteração de lógica, só a migration resolve)
- [x] **T2.2** Implementar deduplicação dupla em `scripts/meta-backfill-leads.ts` na função `processLead()`: após o check por `leadgen_id`, adicionar check secundário por `phone_normalized` antes de criar o lead:
  ```typescript
  // Dedup 1: leadgen_id (já existente no código)
  const { data: byLeadgenId } = await supabase
    .from("leads").select("id")
    .eq("org_id", orgId)
    .eq("metadata->>leadgen_id", lead.id)
    .maybeSingle()
  if (byLeadgenId) return "skipped"

  // Dedup 2: phone (NOVO — evita duplicar leads vindos do Supremo)
  if (phone) {
    const { data: byPhone } = await supabase
      .from("leads").select("id")
      .eq("org_id", orgId)
      .eq("phone_normalized", phone)
      .maybeSingle()
    if (byPhone) return "skipped"
  }
  ```
  **CRÍTICO:** sem isso o backfill duplica os 1986 leads que já vieram do Supremo.
- [ ] **T2.3** Verificar em produção se lead é criado após migration aplicada: monitorar `webhook_logs` no Supabase por 10 min após deploy, ou usar o endpoint de teste do Meta App (Webhooks → Test) que envia payload real assinado.
  ```sql
  -- Query de verificação pós-deploy
  SELECT id, name, phone, source, created_at
  FROM leads
  WHERE source = 'meta_ads' AND created_at > NOW() - INTERVAL '1 hour'
  ORDER BY created_at DESC LIMIT 5;
  ```
- [ ] **T2.4** Confirmar no banco que lead foi criado com `metadata.leadgen_id = 'TEST123'`
- [x] **T2.5** Executar backfill dry-run no formulário menor para validar:
  ```bash
  cd /path/to/trifold-crm
  npx tsx scripts/meta-backfill-leads.ts \
    --form-id=1311883497651909 \
    --from=2026-01-01 \
    --dry-run
  ```
  Formulário: "REMARKETING TODOS 19.01.26" (18 leads — menor, mais rápido de validar)

---

## Contexto Técnico

### Coluna a criar
```sql
-- Migration: 063_leads_metadata.sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS metadata jsonb NULL;
```

### Formulários Meta com leads para backfill (após fix)
| Form ID | Nome | Leads |
|---------|------|-------|
| `1458828689172641` | VIND RESIDENCE 02.02.26 | 269 |
| `766377732644635` | YARDEN FORMS 2 | 335 |
| `1831869930696315` | FORMULÁRIO BÁSICO 05.07.2025 | 127 |
| `1311883497651909` | REMARKETING TODOS 19.01.26 | 18 |

Total potencial: ~749 leads históricos para cross-check por phone/leadgen_id.

### Deduplicação no backfill (ordem de prioridade)
1. `metadata->>leadgen_id = lead.id` → skip (já importado via webhook ou backfill anterior)
2. `phone = normalized_phone` → skip (já existe lead com esse telefone)
3. Nenhum match → criar lead novo

### Webhook — variáveis de ambiente necessárias (já configuradas em prod)
- `META_APP_SECRET` — validação de assinatura HMAC
- `META_PAGE_ACCESS_TOKEN` — busca dados na Graph API
- `META_WHATSAPP_VERIFY_TOKEN` — verificação do endpoint

### Webhook URL registrada
- Endpoint: `https://crm.trifold.eng.br/api/webhooks/meta-ads`
- Página subscrita: Trifold (ID: `132027046650861`)
- Campo assinado: `leadgen`
- Status: ativo (confirmado via Graph API 2026-05-26)

---

## Out of Scope

- Backfill real dos 749 leads históricos (pós-story, executado manualmente após validação do dry-run)
- Alteração de lógica de negócio no webhook ou backfill (só fix da coluna ausente)
- Interface visual para exibir `metadata` no CRM

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Dedup por phone com colisão (dois leads Meta com mesmo número) | Baixa | Lead existente é atualizado com utm_data, não duplicado |
| Migration 063 conflito com migration em andamento | Baixa | `IF NOT EXISTS` na DDL garante idempotência |
| Webhook processa evento antes da migration aplicar | Média | `webhook_logs` registra tudo; leads perdidos nesse intervalo são recuperáveis pelo backfill |

## Definition of Done

- [ ] Migration `063` aplicada em produção
- [ ] Webhook cria lead com `metadata.leadgen_id` preenchido
- [ ] Backfill dry-run do formulário REMARKETING (18 leads) sem erros
- [ ] @qa gate: PASS
- [ ] @devops push

---

## File List

### Criados
- `supabase/migrations/063_leads_metadata.sql`

### Modificados
- `scripts/meta-backfill-leads.ts` — import de `normalizePhoneBR` do shared + `MetaOAuthException` do módulo correto + dedup secundária por `phone_normalized`

### Verificados (sem alteração de lógica)
- `packages/web/src/app/api/webhooks/meta-ads/route.ts`

---

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-05-26 | River (@sm) | Criação da story (premissa: coluna `leads.metadata` ausente em prod) |
| 2026-06-25 | Pax (@po) | **Encerrada como Superseded by migration 075.** Premissa original obsoleta: coluna `leads.metadata` já existe em prod (criada pela 075), webhook funcional (124 leads com `leadgen_id`). Migration 063 untracked = redundante → DESCARTAR (com follow-up P3 sobre índice `idx_leads_metadata_leadgen_id` não recriado pela 075). Mudança uncommitted em `scripts/meta-backfill-leads.ts` (dedup por phone) recomendada MANTER e shippar à parte via @dev→@qa→@devops. Status → `Closed — Superseded by migration 075`. |
