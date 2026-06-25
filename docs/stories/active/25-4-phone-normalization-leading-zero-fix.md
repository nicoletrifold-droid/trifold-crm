---
id: "25-4"
epic: 25
title: "Phone Normalization — Fix zero de discagem e prefixo 55 ambíguo"
status: QA PASS — awaiting @devops push
priority: P2
points: 2
created_at: 2026-05-26
created_by: River (@sm)
validated_by: Pax (@po)
validated_at: 2026-05-26
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [migration_safety, dedup_correctness, regression_check]
depends_on:
  - Story 25-3 (recomendado, não bloqueante — migrations são independentes)
---

# Story 25-4 — Phone Normalization: zero de discagem e prefixo 55 ambíguo

## Contexto

Análise dos 3.176 leads em produção identificou 2 duplicatas reais causadas por
formatação incorreta de telefone na importação do Supremo CRM. A função
`normalize_phone_br()` (SQL) e `normalizePhoneBR()` (TS shared) não tratam dois
edge cases do formato brasileiro:

1. **Zero de discagem (trunk prefix):** `04399873661` deveria ser `5543999873661`
   (DDD 43), mas o `0` inicial faz a função retornar `5504399873661` (DDD `04`
   inexistente). Resultado: duas entradas para `José Edson Biraia`.

2. **Prefixo `55` mal digitado como parte do número:** `55998041130` (11 dígitos
   iniciando com `55`) é retornado como-está, mas deveria ser tratado como DDD
   ambíguo — pode ser DDI `55` + DDD `9` + número ou simplesmente um número
   mal formatado. Resultado: duas entradas para `Anezio Ribeiro`.

Ambos os casos vieram do Supremo. Novos leads via Meta Ads webhook ou formulários
não geram esse padrão, mas a normalização deve ser robusta para qualquer entrada.

## Objetivo

1. Corrigir a função SQL `normalize_phone_br()` para remover zero de discagem inicial
2. Corrigir o equivalente TypeScript em `packages/shared/src/utils/phone.ts`
3. Mesclar as 2 duplicatas reais existentes
4. Atualizar `phone_normalized` dos registros afetados via migration

---

## Acceptance Criteria

### AC1 — Normalização do zero de discagem
- [ ] `normalize_phone_br('04399873661')` → `'5543999873661'` (DDD 43)
- [ ] `normalizePhoneBR('04399873661')` → `'5543999873661'` (TS idêntico)
- [ ] Zero de discagem só é removido quando está antes de um DDD válido (2 dígitos, 11-12 dígitos total após remoção)

### AC2 — Prefixo 55 de 11 dígitos (DDI sem DDD)
- [ ] `normalize_phone_br('55998041130')` → `null` (55 é DDI do Brasil, sobram 9 dígitos sem DDD — não normalizável)
- [ ] Regra: 11 dígitos iniciando com `55` → strip `55` → 9 dígitos sem DDD → `null`
- [ ] TS e SQL produzem o mesmo output (`null`) para esse input

### AC3 — Merge das duplicatas existentes
- [ ] `José Edson Biraia` (`04399873661`) mesclado com `José Edson Biraia` (`43999873661`) — manter o com `supremo_id`; lead secundário deletado ou desativado
- [ ] `Anezio Ribeiro` (`55998041130`) mesclado com `Anezio Ribeiro` (`44998041130`) — manter o com dados mais completos
- [ ] Atividades dos leads descartados transferidas para o lead mantido (ou registradas como nota)

### AC4 — Sem regressão
- [ ] `phone_normalized` recalculado para todos os registros após update da função SQL (via `UPDATE leads SET phone = phone`)
- [ ] Nenhum lead válido com `phone_normalized` existente tem seu valor alterado por essa mudança
- [ ] Testes unitários adicionados em `packages/shared/src/utils/phone.ts` para os dois edge cases

---

## Tarefas

### Fase 1 — Fix das funções

- [x] **T1.1** Atualizar `normalize_phone_br()` em migration nova (`120_phone_normalization_zero_fix.sql`):
  - Adicionar regra: se `digits` começa com `0` e tem 11-12 dígitos → strip leading `0`, reprocessar
  - Exemplo: `04399873661` → strip `0` → `4399873661` (10 dígitos) → insert 9 após DDD → `43999873661` → prepend 55 → `5543999873661`

- [x] **T1.2** Espelhar fix em `packages/shared/src/utils/phone.ts`:
  - Adicionado antes das regras existentes: zero-strip para 11-12d + inserção de 9 para 10d
  - Adicionado: 11 dígitos iniciando com `55` → `null` (DDI sem DDD)
  - Output idêntico ao SQL verificado via testes

- [x] **T1.3** Adicionar testes unitários em `packages/shared/src/utils/__tests__/phone.test.ts` (já existia):
  ```typescript
  // Zero de discagem
  expect(normalizePhoneBR('04399873661')).toBe('5543999873661')
  expect(normalizePhoneBR('043999873661')).toBe('5543999873661') // 12 dígitos com 0
  // Prefixo 55 ambíguo (11 dígitos)
  expect(normalizePhoneBR('55998041130')).toBe(null) // ou decisão documentada
  // Regressão: casos existentes não afetados
  expect(normalizePhoneBR('44997382536')).toBe('5544997382536')
  expect(normalizePhoneBR('+5544997382536')).toBe('5544997382536')
  ```

### Fase 2 — Migration e merge de dados

- [x] **T2.1** Criar `supabase/migrations/120_phone_normalization_zero_fix.sql` (renumerada de 065):
  - `CREATE OR REPLACE FUNCTION normalize_phone_br(...)` com as novas regras
  - Recálculo colisão-seguro: `UPDATE leads SET phone = phone WHERE phone IS NOT NULL AND normalize_phone_br(phone) IS DISTINCT FROM phone_normalized AND NOT EXISTS (colisão no UNIQUE (org_id, phone_normalized))` — força recálculo da coluna gerada apenas onde muda e sem violar o índice UNIQUE

- [x] **T2.2** Merge das duplicatas REMOVIDO da migration → passo manual supervisado:
  - Motivo (auditoria @data-engineer 2026-06-25): `DELETE FROM leads` dispara `ON DELETE CASCADE` em 9 tabelas-filhas (conversations→messages, appointments, lead_facts, lead_memories, follow_up_rules, lead_tasks, lead_property_interest, visit_feedback, lead_distribution_log) — a migration original só reatribuía `activities`, causando perda silenciosa de histórico de conversa/dados Nicole; além de `unit_sales`/`properties.reserved_by_lead_id` (NO ACTION) que BLOQUEARIAM o delete
  - Par Anezio Ribeiro: NÃO precisa de merge — `55998041130` recomputa p/ NULL (não colide), recalc da T2.1 já resolve
  - Par José Edson Biraia: precisa merge manual (ambos → `5543999873661`, colidem no UNIQUE); template completo de reatribuição de TODAS as FKs está no bloco `MANUAL MERGE` (comentado) ao final da migration 120 + ver Riscos

- [ ] **T2.3** Validar após migration: `SELECT COUNT(*) FROM leads WHERE phone_normalized IS NULL AND phone IS NOT NULL` deve retornar apenas o `tg:123456` existente

---

## Contexto Técnico

### Duplicatas identificadas (query de 2026-05-26)

```
Jose Edson Biraia / José Edson Biraia
  phone: 04399873661  → norm atual: 5504399873661 (DDD 04 inexistente)
  phone: 43999873661  → norm atual: 5543999873661 (correto)

anezioribeiro333@gmail.com / Anezio Ribeiro
  phone: 55998041130  → norm atual: 55998041130 (11 dígitos, ambíguo)
  phone: 44998041130  → norm atual: 5544998041130 (correto)
```

### Regra de normalização atual (SQL e TS shared)

```
11 dígitos sem prefixo 55 → prepend '55'
12 dígitos com prefixo 55 → insert '9' na posição 4
13+ dígitos → retorna como-está
10 dígitos → retorna como-está (improbable)
< 10 → null
```

### Regra proposta (adição)

```
ANTES de todas as outras regras:
  Se digits começa com '0' AND length ∈ [11, 12]:
    digits = digits.slice(1)  // remove zero de discagem
    // continua com as regras normais
```

### Função SQL a atualizar
- `supabase/migrations/021_phone_normalization_part1.sql` — referência (NÃO modificar)
- Criar nova migration `120` com `CREATE OR REPLACE FUNCTION`

### Arquivos TS a atualizar
- `packages/shared/src/utils/phone.ts` — função principal
- `packages/shared/src/utils/phone.test.ts` — testes (criar se não existir)

---

## Out of Scope

- Outros formatos internacionais não-BR
- Normalização de números sem DDD (8 dígitos puros) — já tratado com DDD padrão 44 nos scripts de backfill
- Interface visual para exibir duplicatas no CRM

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| UPDATE de phone_normalized quebra leads válidos | Baixa | `CREATE OR REPLACE` é idempotente; recálculo só afeta quem tem `0` inicial |
| Merge de dados perde histórico (conversas/mensagens/facts) por CASCADE | **Alta** (mitigada) | Merge REMOVIDO da migration automática; vira passo manual supervisado que reatribui TODAS as 13 FKs-filhas antes do DELETE (template no fim da migration 120). Apenas o par José Edson exige merge; Anezio é resolvido pelo recalc |
| Recalc viola índice UNIQUE (org_id, phone_normalized) nas duplicatas | Média | Recalc guardado por `NOT EXISTS` de colisão — pula linhas que colidiriam, deixa-as para merge manual; idempotente |
| TS e SQL divergem após fix | Baixa | Testes unitários cobrem ambos os edge cases |

## Definition of Done

- [x] `normalize_phone_br('04399873661')` → `'5543999873661'` em SQL e TS
- [x] Testes unitários passando (28/28)
- [ ] Migration `120` aplicada em prod sem erro (apply via Management API, fora desta sessão)
- [ ] Recalc colisão-seguro executado; par Anezio resolvido automaticamente
- [ ] Par José Edson mesclado manualmente (passo supervisado, reatribuindo todas as FKs)
- [x] @qa gate: PASS
- [ ] @devops push

## Backlog

| ID | Tipo | Prioridade | Título | Status |
|----|------|-----------|--------|--------|
| BL-25-4-01 | validação | P3 | T2.3 pós-deploy: verificar `SELECT COUNT(*) FROM leads WHERE phone_normalized IS NULL AND phone IS NOT NULL` retorna apenas o lead `tg:123456` | pendente |
| BL-25-4-02 | dados | P2 | Merge manual supervisado do par José Edson Biraia (reatribuir 13 FKs → DELETE), usando template no fim da migration 120 | pendente |

---

## File List

### Criados
- `supabase/migrations/120_phone_normalization_zero_fix.sql` (renumerada de 065 — slot 065 e 119 já ocupados em main)

### Modificados
- `packages/shared/src/utils/phone.ts`
- `packages/shared/src/utils/__tests__/phone.test.ts` (existia; novos describes adicionados)

---

## QA Results

**Gate: PASS** — Quinn (@qa), 2026-06-25
**Gate file:** `docs/qa/gates/25.4-phone-normalization-leading-zero-fix.yml`

### Verificações
- **Paridade SQL↔TS (rigor):** trace manual ramo a ramo (não só testes) confirma equivalência total entre `normalizePhoneBR` (phone.ts:41-64) e `normalize_phone_br()` (migration 120:72-96) para `04399873661→5543999873661`, `043999873661→5543999873661`, `55998041130→NULL` e todas as regressões (`44999689446`, `554499689446`, 13d/10d passthrough). Ordem dos guards idêntica.
- **Migration não-breaking + idempotente:** premissa GENERATED confirmada contra schema real — `leads.phone_normalized` é `GENERATED ALWAYS AS (normalize_phone_br(phone)) STORED` (migration 021:84-86). Logo `CREATE OR REPLACE FUNCTION` não recomputa linhas existentes, e `UPDATE leads SET phone = phone` é o mecanismo correto/necessário. Guard `IS DISTINCT FROM` torna o recalc idempotente (0 linhas na 2ª run).
- **Colisão-segura:** guard `NOT EXISTS` contra o UNIQUE FULL `idx_leads_org_phone_normalized_unique` (migration 025:54, sem WHERE → múltiplos NULL permitidos). Par Anezio (`55998041130`→NULL) resolvido sem colisão; par José Edson tem a linha ruim pulada (sobrevivente já segura o valor-alvo) → banco consistente.
- **Decisão de separar o merge: CORRETA.** A 120 sozinha deixa o banco consistente. `DELETE FROM leads` dispara CASCADE em 9 FKs-filhas + 2 NO ACTION bloqueantes; a versão original só reatribuía `activities` → perda silenciosa de histórico/Nicole. Merge agora é passo manual supervisado.
- **Sem regressão:** números válidos normalizam idênticos; recalc só toca linhas que mudam.
- **Testes:** `npx vitest run phone` → **28/28 passed** (re-executado pelo @qa).

### Concern documentado (LOW, não-bloqueante)
- **REL-001:** o guard `NOT EXISTS` protege contra colisão com linha que já segura o valor-alvo, mas não contra duas candidatas distintas recomputando para o mesmo valor não-nulo no mesmo UPDATE. **Não-triggerable** no dataset auditado (só existe `04399873661`, gêmeo já correto). Nota de operação para re-runs contra dados drifted.

### Ações de follow-up
- **BL-25-4-02 (OBRIGATÓRIO, pós-deploy supervisado):** merge manual do par José Edson Biraia via Management API — descomentar/executar o bloco `MANUAL MERGE` da migration 120 (`bad=04399873661`, `good=43999873661`), reatribuindo as 13 FKs antes do `DELETE`, depois `UPDATE leads SET phone=phone` no sobrevivente. NÃO rodar via `db push`.
- **BL-25-4-01 (validação pós-deploy):** `SELECT COUNT(*) FROM leads WHERE phone_normalized IS NULL AND phone IS NOT NULL` (esperado: só `tg:123456`).

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-05-26 | @sm/@po/@dev | Criação, validação e implementação inicial (migration 065) |
| 2026-06-25 | Quinn (@qa) | **Quality gate: PASS.** Paridade SQL↔TS verificada por trace ramo a ramo; premissa GENERATED STORED confirmada contra migration 021; recalc idempotente + colisão-seguro validado contra UNIQUE FULL; decisão de separar o merge confirmada correta (banco consistente). 28/28 vitest. 1 concern LOW (REL-001, não-triggerable). Status → QA PASS — awaiting @devops push. Follow-up obrigatório: merge manual José Edson (BL-25-4-02). |
| 2026-06-25 | Dara (@data-engineer) | **Renumeração 065 → 120** (065 colide com `065_create_chamados.sql`; 119 já ocupado por `119_whatsapp_send_log.sql` em main → 120 é o próximo slot livre). **Segurança do merge:** removido o merge destrutivo da migration — auditoria revelou 9 FKs `ON DELETE CASCADE` e 2 `NO ACTION` não tratadas (só `activities` era reatribuída) → risco de perda de histórico de conversas/Nicole. Migration agora = fix da função + recalc colisão-seguro idempotente; merge do par José Edson vira passo manual supervisado (template no fim do arquivo). Paridade SQL↔TS reconfirmada (`04399873661`→`5543999873661`, `55998041130`→NULL). |
