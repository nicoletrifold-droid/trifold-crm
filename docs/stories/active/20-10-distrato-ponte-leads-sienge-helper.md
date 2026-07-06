# Story 20.10: Ponte leads↔Sienge + Helper central de distrato

## Status
Ready for Review

## Dependencies
- **Story 20.9** (`docs/stories/active/20-9-fix-distrato-contrato-cancelado-sienge.md`) — DONE: migrations 116 (colunas `sienge_contract_situations` + `distrato` em `clientes_obras_vinculos`) + 118 (índice parcial corrigido) aplicadas; `computeDistrato()` + `reconcileDistratosForObra()` em `sync.ts`; padrão de ponte via `sienge_customer_id` estabelecido em `notificacoes.ts`.
- **Migration 161** — nova (esta story). Renumerada 129→130→161 por colisões sucessivas de slot em `origin/main` (draft assumia 129 livre → 129 ocupado por `129_imob_kanban.sql` na implementação → 130 ocupado por `130_roleta_pick_no_bolsao.sql` após integração com main). Slot 161 confirmado livre (máx. migration em `origin/main` = 160). Histórico completo no Change Log.
- **BRANCH:** implementar a partir de um branch novo criado de `origin/main` atualizado — NÃO do branch `feat/epic-76`, que está desatualizado e não contém as migrations 116–128 (incluindo as dependências 116+118 desta story). Usar `feat/epic-76` reintroduziria o bug da 20-9.

## Scope
**IN:**
- Nova coluna `leads.distrato BOOLEAN NOT NULL DEFAULT FALSE` via migration 161 — denormalização para filtragem performática nos canais de lote.
- Índice parcial: `CREATE INDEX idx_leads_distrato ON leads(org_id) WHERE distrato = TRUE` — cobre o hot-path das queries de canais (filtrar distratados por org).
- Novo arquivo server-side `packages/web/src/lib/distrato/is-contato-distratado.ts` com:
  - `isContatoDistratado(params: DistratoCheckParams): Promise<boolean>` — fonte única de verdade; verifica `clientes_obras_vinculos.distrato` em tempo real via telefone/email normalizado. Usado por canais real-time (webhook Nicole).
  - `propagateDistratosToLeads(orgId: string): Promise<{ updated: number; cleared: number }>` — batch update de `leads.distrato` para um org; chamado pelo cron da Story 20-11.
- Adicionar `import 'server-only'` no topo do arquivo (evitar importação acidental em Client Components).
- `@data-engineer` deve aprovar design da migration 161 antes de @dev implementar Tasks 2-3.

**OUT:**
- Modificar qualquer canal de comunicação — escopo da Story 20-12.
- Criar cron de sync automático — escopo da Story 20-11.
- Suporte a múltiplas orgs simultâneas em `propagateDistratosToLeads` (chamada é por org, passado como argumento).
- Adicionar `distrato` a `campaign_entries` ou outras tabelas — escopo futuro se necessário.
- IU admin para visualizar leads distratados — escopo futuro.

## Complexity
**Estimativa:** S-M — 1 migration simples (coluna + índice), 1 arquivo TS novo com 2 funções (~80-120 LOC). Zero mudança em fluxos existentes. Impacto médio (base para as Stories 20-11 e 20-12).

## Risks
| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Phone normalization divergente entre `leads.phone_normalized` e `clientes.telefone`/`whatsapp` | Médio | Alto | Usar `normalizePhoneBR()` de `@trifold/shared` sobre os phones de `clientes` ao fazer o match; `leads.phone_normalized` já está normalizado pela migration 021 |
| `leads.distrato` desatualizado entre runs de cron (Story 20-11) | Baixo | Médio | Para canais real-time (webhook), usar `isContatoDistratado()` diretamente; `leads.distrato` é apenas cache para lote |
| Cliente com `clientes.sienge_customer_id = NULL` não detectado como distratado | Baixo | Médio | O match por telefone/email é o fallback — `clientes` tem `telefone`, `whatsapp` e `email`; documentar como limitação conhecida em Dev Notes |
| Migration 161 aplicada antes das migrations 116+118 estarem ativas | Baixo | Alto | Dependência explícita documentada; `clientes_obras_vinculos.distrato` (116) + índice corrigido (118) devem existir antes do deploy. Implementar a partir de branch criado de `origin/main` (que já contém 116+118) mitiga este risco. |

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["typecheck", "lint", "build", "manual-smoke"]
nota: "@data-engineer deve revisar e aprovar o design da migration 161 antes de @dev implementar Tasks 2-3"

---

## Story

**As a** sistema CRM Trifold,
**I want** uma coluna `leads.distrato` como cache denormalizado e um helper central `isContatoDistratado()` que verifica em tempo real o status de distrato via `clientes_obras_vinculos`,
**so that** as Stories 20-11 e 20-12 tenham uma fonte única e confiável de verdade para bloquear comunicações automáticas com leads cujos contratos Sienge estão todos "Cancelados", sem duplicar a lógica de detecção em cada canal.

---

## Acceptance Criteria

### Frente 1 — Migration 161: `leads.distrato`

**AC 1 — Coluna `distrato` adicionada à tabela `leads`**
Dado que a tabela `leads` existe com a coluna `phone_normalized` (migration 021),
quando a migration 161 é aplicada,
então:
- `leads.distrato BOOLEAN NOT NULL DEFAULT FALSE` existe na tabela.
- Linhas existentes assumem o valor padrão `false` sem erro.
- A migration é idempotente (`ADD COLUMN IF NOT EXISTS`).

**AC 2 — Índice parcial criado corretamente**
Dado que a migration 161 foi aplicada,
quando uma query filtra `WHERE org_id = $1 AND distrato = TRUE` na tabela `leads`,
então o planner do PostgreSQL usa o índice `idx_leads_distrato` (verificável via `EXPLAIN`).
O índice é parcial (`WHERE distrato = TRUE`) — cobre o conjunto menor (distratados), não o conjunto total.

### Frente 2 — Helper `isContatoDistratado`

**AC 3 — `isContatoDistratado({ phone })` retorna `true` quando lead tem contato totalmente distratado**
Dado que existe um `clientes` com `telefone = "+55 44 99123-4567"` ou `whatsapp = "5544991234567"`,
e TODOS os vínculos desse cliente em `clientes_obras_vinculos` têm `distrato = true` (sem nenhuma obra com contrato ativo restante),
quando `isContatoDistratado({ phone: "5544991234567" })` é chamado,
então a função retorna `true`.

**AC 4 — `isContatoDistratado({ email })` retorna `true` via email**
Dado que existe um `clientes` com `email = "joao@exemplo.com"`,
e TODOS os vínculos desse cliente em `clientes_obras_vinculos` têm `distrato = true` (sem nenhuma obra ativa restante) E existe ao menos um vínculo,
quando `isContatoDistratado({ email: "joao@exemplo.com" })` é chamado,
então a função retorna `true`.

**AC 5 — `isContatoDistratado` retorna `false` para contatos ativos**
Dado que um contato (phone ou email) não tem nenhum `clientes_obras_vinculos.distrato = true` correspondente (ou não existe em `clientes`),
quando `isContatoDistratado` é chamado com esse contato,
então a função retorna `false`.

**AC 5a — Multi-obra: cliente com vínculo ativo não é bloqueado (active-contract-wins no nível do contato)**
Dado que existe um `clientes` com dois vínculos em `clientes_obras_vinculos`:
- Obra A: `distrato = true` (contrato Cancelado)
- Obra B: `distrato = false` (contrato ativo)
quando `isContatoDistratado({ phone: <phone do cliente> })` é chamado,
então a função retorna `false` — o cliente tem ao menos um contrato ativo, portanto NÃO é totalmente distratado e NÃO deve ser bloqueado de nenhum canal de comunicação.
[DECISÃO DE STAKEHOLDER 2026-06-30] A regra é "active-contract-wins" no nível do CONTATO: um cliente só é considerado distratado quando TODOS os seus vínculos em `clientes_obras_vinculos` têm `distrato = true` E existe ao menos um vínculo. Basta 1 contrato ativo para o contato continuar recebendo comunicações normalmente.

**AC 6 — `isContatoDistratado` com `leadId` verifica `leads.distrato` diretamente (fast path)**
Dado que uma `leads.distrato = true` existe para um `leadId` específico,
quando `isContatoDistratado({ leadId: "uuid-do-lead" })` é chamado,
então a função retorna `true` consultando `leads.distrato` diretamente (sem percorrer `clientes_obras_vinculos`).
Este fast path é o caminho primário após a Story 20-11 popular `leads.distrato` via cron.

**AC 7 — `isContatoDistratado` é tolerante a parâmetros ausentes/nulos**
Dado que `isContatoDistratado({})` ou `isContatoDistratado({ phone: null })` é chamado,
quando nenhum parâmetro válido é fornecido,
então a função retorna `false` sem lançar exceção.

**AC 8 — Arquivo tem `import 'server-only'`**
Dado que o arquivo `packages/web/src/lib/distrato/is-contato-distratado.ts` existe,
quando qualquer Client Component tenta importá-lo (direta ou indiretamente),
então o bundler do Next.js lança erro em build time — prevenindo vazamento de `createAdminClient()` no bundle do cliente.

### Frente 3 — `propagateDistratosToLeads`

**AC 9 — `propagateDistratosToLeads(orgId)` marca `leads.distrato = true` para leads com contato distratado**
Dado que existem leads na org com `phone_normalized` ou `email` que coincidem com `clientes` distratados (via `clientes_obras_vinculos.distrato = true`),
quando `propagateDistratosToLeads(orgId)` é chamado,
então esses leads têm `distrato` atualizado para `true`, e a função retorna `{ updated: N, cleared: M }` onde:
- `updated`: número de leads marcados `distrato = true`
- `cleared`: número de leads revertidos de `true` para `false` (contatos cujo distrato foi revertido)

**AC 10 — Idempotência de `propagateDistratosToLeads`**
Dado que `propagateDistratosToLeads(orgId)` foi chamado e resultou em N leads com `distrato = true`,
quando a mesma função é chamada novamente sem mudanças no Sienge,
então o resultado é `{ updated: N, cleared: 0 }` (ou `{ updated: 0, cleared: 0 }` se implementado como "no-op quando estado já correto") — sem efeitos colaterais adicionais.

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Validação de qualidade via processo manual: typecheck + lint + smoke test.

**Story Type Analysis:**
- **Primary Type:** Database (migration 161) + Architecture (helper central)
- **Secondary Type(s):** Integration (bridge Sienge ↔ leads)
- **Complexity:** S-M — 1 migration simples, 1 arquivo TS novo, zero mudança em fluxos existentes

**Specialized Agent Assignment:**
- Primary Agents:
  - @dev (implementação do helper + propagateDistratosToLeads)
  - @data-engineer (design e review da migration 161)
- Supporting Agents:
  - @qa (quality gate + smoke test de bridge telefone/email)

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): `npm run typecheck` e `npm run build` — zero erros
- [ ] Smoke (@qa): testar `isContatoDistratado` com um phone real de distratado existente + verificar que `false` é retornado para lead ativo

---

## Tasks / Subtasks

### Task 1 — @data-engineer: Migration 161 (AC: 1, 2)
- [x] Criar `supabase/migrations/161_leads_distrato.sql` — **renumerada 129→130→161** (129 ocupado por `129_imob_kanban.sql`; 130 ocupado por `130_roleta_pick_no_bolsao.sql` após integração com main; ver Completion Notes + Change Log)
- [x] `ALTER TABLE leads ADD COLUMN IF NOT EXISTS distrato BOOLEAN NOT NULL DEFAULT FALSE`
- [x] `CREATE INDEX IF NOT EXISTS idx_leads_distrato ON leads(org_id) WHERE distrato = TRUE`
- [x] Adicionar `COMMENT ON COLUMN leads.distrato` explicando que é denormalização de `clientes_obras_vinculos.distrato`, populado por `propagateDistratosToLeads` (Story 20-11 cron)
- [x] Verificar que migration é não-breaking (DEFAULT seguro, ADD COLUMN IF NOT EXISTS)
- [ ] Aplicação: pendente @devops via Supabase Management API (aplicar ANTES do deploy do código da Story 20-12)

### Task 2 — @dev: Criar helper `is-contato-distratado.ts` (AC: 3-8)
- [x] Criar `packages/web/src/lib/distrato/is-contato-distratado.ts`
- [x] Adicionar `import 'server-only'` na primeira linha
- [x] Importar `createAdminClient` de `@web/lib/supabase/admin`
- [x] Importar `normalizePhoneBR` de `@trifold/shared`
- [x] Definir interface `DistratoCheckParams { leadId?: string | null; phone?: string | null; email?: string | null }`
- [x] Implementar `isContatoDistratado(params)`:
  - Fast path: se `leadId` fornecido → `SELECT distrato FROM leads WHERE id = $1` → retornar diretamente
  - Phone path: normalizar com `normalizePhoneBR(phone)` → buscar `clientes` WHERE `normalizePhoneBR(telefone) = normalized OR normalizePhoneBR(whatsapp) = normalized` → checar "todos-os-vínculos-distratados": (1) se existe qualquer `clientes_obras_vinculos.distrato = false` para esses `cliente_id` → return `false` (tem contrato ativo); (2) se existe qualquer `clientes_obras_vinculos.distrato = true` E step 1 foi vazio → return `true`. Implementar como 2 queries separadas para evitar cardinalidade ambígua com joins Supabase.
  - Email path: buscar `clientes WHERE email = $1` → mesma lógica de 2 queries "todos-os-vínculos-distratados": sem vínculo ativo (distrato=false) + ao menos um vínculo distratado (distrato=true) → `true`; qualquer vínculo ativo → `false`
  - Return `false` se nenhum parâmetro válido
  - Nunca lança exceção: erros de DB → `console.error` + return `false` (fail-open para não bloquear leads legítimos por bug)
- [x] Exportar `isContatoDistratado` como named export

### Task 3 — @dev: Implementar `propagateDistratosToLeads` (AC: 9, 10)
- [x] No mesmo arquivo `is-contato-distratado.ts`, implementar e exportar `propagateDistratosToLeads(orgId: string)`
- [x] Passo 1: buscar `clientes` na org que têm TODOS os vínculos distratados (active-contract-wins — qualquer vínculo ativo exclui o cliente do bloqueio):
  ```typescript
  // Passo 1a: cliente_ids com ao menos um vínculo ATIVO (distrato=false) na org
  const { data: activosVinculos } = await admin
    .from('clientes_obras_vinculos')
    .select('cliente_id, clientes!inner(org_id)')
    .eq('clientes.org_id', orgId)
    .eq('distrato', false)
  const activoIds = new Set((activosVinculos ?? []).map(v => v.cliente_id as string))

  // Passo 1b: cliente_ids com ao menos um vínculo distratado na org
  const { data: distratadosVinculos } = await admin
    .from('clientes_obras_vinculos')
    .select('cliente_id, clientes!inner(id, telefone, whatsapp, email, org_id)')
    .eq('clientes.org_id', orgId)
    .eq('distrato', true)

  // Clientes TOTALMENTE distratados = têm ao menos 1 distrato=true E NENHUM vínculo ativo
  const totalmenteDistratadosVinculos = (distratadosVinculos ?? [])
    .filter(v => !activoIds.has(v.cliente_id as string))
  ```
  Usar `totalmenteDistratadosVinculos` no lugar de `distratadosVinculos` nos Passos 2–4.
- [x] Passo 2: coletar phones normalizados e emails dos clientes distratados
- [x] Passo 3: `UPDATE leads SET distrato = true WHERE org_id = $1 AND (phone_normalized IN [...phones] OR email IN [...emails])` — contar `updated`
- [x] Passo 4: `UPDATE leads SET distrato = false WHERE org_id = $1 AND distrato = true AND phone_normalized NOT IN [...phones] AND (email IS NULL OR email NOT IN [...emails])` — contar `cleared` (reverter leads cujos contatos não são mais distratados)
- [x] Retornar `{ updated: number, cleared: number }`
- [x] Idempotente: re-execução sem mudanças no Sienge resulta em no-op (0 rows afetadas nas UPDATEs)
- [x] Edge case: se arrays de phones/emails estiverem vazios (nenhum distratado na org), executar o Passo 4 sem array (update todos de true para false, caso fossem distratados antes)

### Task 4 — QA Smoke (AC: 3-10)
- [ ] Verificar que `isContatoDistratado({ phone: <phone de distratado real> })` retorna `true` em prod (read-only)
- [ ] Verificar que `isContatoDistratado({ phone: <phone de lead ativo> })` retorna `false`
- [ ] Verificar `propagateDistratosToLeads(orgId)` resulta em `leads.distrato = true` para os leads distratados e `false` para os demais
- [ ] `npm run typecheck && npm run build` — zero erros relacionados à story

---

## Dev Notes

### CRITICO — Branch de implementação
**Implementar a partir de um branch novo criado de `origin/main` atualizado**, não de `feat/epic-76` (branch desatualizado que não contém as migrations 116–128). Passos:
```bash
git fetch origin
git checkout -b feat/epic-20-distrato-bridge origin/main
```
As migrations de dependência 116 (`116_distrato_sienge_contrato_cancelado.sql`) e 118 (`118_fix_idx_cov_distrato_predicate.sql`) existem apenas em `origin/main`. Iniciar de `feat/epic-76` reintroduziria o bug que a 20-9 corrigiu.

### Semântica active-contract-wins (nível do contato)
[DECISÃO DE STAKEHOLDER 2026-06-30] Um contato só é considerado totalmente distratado quando TODOS os seus vínculos em `clientes_obras_vinculos` têm `distrato = true` E existe ao menos um vínculo. Se o cliente tem obra A distratada + obra B ativa (distrato=false), ele NÃO é bloqueado — continua recebendo comunicações normalmente. Ver AC 5a.

### Contexto: por que `leads.distrato` e não apenas `isContatoDistratado()`

A tabela `leads` está desconectada do Sienge. A Nicole conversa com `leads`; o Sienge alimenta `clientes_obras_vinculos`. A ponte é telefone/email normalizado. Dois mecanismos complementares:

1. **`isContatoDistratado()`** — fonte de verdade em tempo real; consulta `clientes_obras_vinculos` diretamente. Usado pelo webhook da Nicole (Story 20-12), onde latência é tolerável (~1 query extra) mas precisão é crítica.

2. **`leads.distrato`** — cache denormalizado; atualizado pelo cron da Story 20-11. Usado por crons em lote (followup, reminders, email-automations) onde filtrar na própria query SQL é mais eficiente que N calls ao helper.

A Story 20-12 usa ambos os mecanismos dependendo do canal.

### Tabela `leads` — campos relevantes (origin/main)

```typescript
// Campos que existem em leads (selecionados de queries existentes):
id: string              // UUID
org_id: string          // UUID
phone: string           // raw
phone_normalized: string // normalizado via migration 021 (normalizePhoneBR)
email: string | null
name: string | null
is_active: boolean
stage_id: string        // UUID (kanban_stages)
distrato: boolean       // NEW — migration 161, DEFAULT false
```

`phone_normalized` já está normalizado (`normalizePhoneBR`) desde a migration 021. Portanto: ao buscar `clientes` pelo telefone do lead, normalize os phones de `clientes.telefone` e `clientes.whatsapp` com a mesma função.

### Tabela `clientes` — campos relevantes

```typescript
// origem: migration 041
id: string
org_id: string
sienge_customer_id: INTEGER | null
telefone: string | null
whatsapp: string | null
email: string | null
nome: string | null
```

Os phones de `clientes` podem NÃO estar normalizados — `normalizePhoneBR` deve ser aplicado antes do match com `leads.phone_normalized`.

### Bridge architecture (pattern estabelecido pela Story 20-9)

```
leads.phone_normalized
    ↕ (normalizePhoneBR)
clientes.telefone | clientes.whatsapp
    → clientes.id
    → clientes_obras_vinculos (WHERE cliente_id = clientes.id AND distrato = true)
```

Referência: `packages/web/src/lib/notificacoes.ts` L86-L120 — pattern 2-passos (cliente_ids distratados → sienge_customer_ids → filtra no loop de disparo).

### `normalizePhoneBR` — como usar

```typescript
import { normalizePhoneBR } from '@trifold/shared'
// packages/shared/src/utils/phone.ts

const normalized = normalizePhoneBR(rawPhone)
// Ex: "+55 (44) 9 9123-4567" → "5544991234567"
// Retorna null se unparseable
```

Fonte: `packages/shared/src/utils/phone.ts`

### `createAdminClient` — padrão de uso

```typescript
import { createAdminClient } from '@web/lib/supabase/admin'
// Usado em: sync.ts, notificacoes.ts, reconcile-distratos/route.ts
// Sempre usar service_role para queries em clientes_obras_vinculos (RLS filtra por org via policies)
```

### Pattern da bridge em 2-passos (replicar de notificacoes.ts)

```typescript
// Passo 1: cliente_ids com distrato=true na org
const { data: distVinculos } = await admin
  .from('clientes_obras_vinculos')
  .select('cliente_id')
  .eq('distrato', true)
// Precisamos também do org_id → join com clientes

// Passo 2: phones/emails dos clientes distratados
const clienteIds = distVinculos?.map(v => v.cliente_id) ?? []
const { data: distClientes } = await admin
  .from('clientes')
  .select('telefone, whatsapp, email')
  .in('id', clienteIds)
  .eq('org_id', orgId)
```

O embed Supabase (`clientes!inner(...)`) causa cardinalidade ambígua no TypeScript — usar 2-passos como padrão da Story 20-9 (ver `notificacoes.ts` L120-L140).

### Arquivo a criar

```
packages/web/src/lib/distrato/
└── is-contato-distratado.ts    (novo)
```

Não existe nenhum arquivo em `packages/web/src/lib/distrato/` — criar o diretório junto com o arquivo.

### Testing

**Abordagem:** typecheck + build + smoke manual com dados reais de prod.

Não há testes unitários automatizados (integração com Supabase admin; padrão da Story 20-9). Se @qa quiser cobertura da `isContatoDistratado`, a função tem branches testáveis isoladamente (cada parâmetro independente).

---

## PO Validation (Pax) — 2026-06-30

**Veredito: NO-GO (Conditional)** · **Readiness Score: 7/10** · **Confiança: Média**

Story bem estruturada (escopo IN/OUT claro, 10 ACs testáveis em Given/When/Then, riscos mapeados, valor de negócio explícito). Bloqueada por 2 itens antes de ir ao @dev.

### Critical Issues (Must Fix — Story Blocked)

1. **Número de migration `121` VAI COLIDIR.** A story afirma "última migration em origin/main = 120, slot 121 livre". Isso é **factualmente incorreto** — reflete o branch local desatualizado (`feat/epic-76`, que só tem até 120 e está sem as migrations 116-128 de main). Verificação contra `origin/main`:
   - Última migration real em `origin/main` = **128** (`128_pegar_lead_bolsao.sql`).
   - O slot **121 JÁ ESTÁ OCUPADO** por `121_nicole_copy_escassez_property_presentation.sql` (e 122-128 também existem).
   - **Fix:** NÃO fixar `121`. Renumerar para **`129`** (próximo slot livre partindo de `origin/main`) OU remover o número rígido e instruir `@data-engineer`/`@devops` a escolher o próximo slot livre verificado contra `origin/main` no momento da aplicação. Atualizar consistentemente: Dependencies, AC 1, AC 2, Task 1, File List e Risks (linha "Migration 121 aplicada antes de 116"). _(correção de AC/escopo é autoridade do @sm — apenas registro a recomendação)._
   - **Nota de branch:** as migrations de dependência **116 + 118** (colunas `clientes_obras_vinculos.distrato` + `sienge_contract_situations`) existem **apenas em `origin/main`**, não no working tree atual. A implementação DEVE partir de `main` (branch nova a partir de main), não do `feat/epic-76` atual.

### Should-Fix Issues (Important)

2. **Semântica "active-contract-wins" no nível do cliente não está coberta (atenção crítica #5).** `computeDistrato()` (verificado em `sync.ts` origin/main: `values.length > 0 && values.every(s => s === "Cancelado")`) preserva a regra **por vínculo (cliente×obra)**. Porém `isContatoDistratado` (AC 3) e `propagateDistratosToLeads` marcam distrato quando **"qualquer" `clientes_obras_vinculos.distrato = true`**. Para um cliente com obra A distratada + obra B com contrato ativo, isso resultaria em **bloqueio de TODA comunicação de um cliente ainda ativo** (falso-positivo que silencia a Nicole para cliente legítimo). A regra original protegia notificações *por obra*; aqui a semântica muda para *por cliente*.
   - **Fix:** O @sm/@po deve decidir e documentar a semântica intencional: (a) "qualquer vínculo cancelado bloqueia tudo" (conservador, bloqueia ativos) ou (b) "só bloqueia se TODOS os vínculos do cliente estão distratados" (preserva active-contract-wins no nível cliente). Adicionar 1 AC cobrindo o caso multi-obra (1 cancelado + 1 ativo) explicitando o comportamento esperado.

### Nice-to-Have

3. Sem testes unitários automatizados (aceitável — segue o padrão estabelecido na Story 20-9; `isContatoDistratado` tem branches isoláveis se o @qa quiser cobertura).

**Verificações OK:** `normalizePhoneBR` existe em `packages/shared/src/utils/phone.ts` (L24) · migration 116 confirma colunas `distrato`/`sienge_contract_situations` em `clientes_obras_vinculos` · `createAdminClient` e padrão bridge 2-passos de `notificacoes.ts` válidos · CodeRabbit corretamente marcado Disabled (core-config `enabled: false`) · Executor assignment válido (executor `@dev` ≠ quality_gate `@qa`).

**Transição de status:** mantida em `Draft` (NO-GO). Após o @sm aplicar os fixes 1 e 2, re-submeter para re-validação → então `Ready`.

---

## PO Re-Validation (Pax) — 2026-06-30 (pós required-fixes)

**Veredito: GO** · **Readiness Score: 9/10** · **Confiança: Alta** · **Status: Draft → Ready**

Os 2 bloqueadores da validação anterior (v1.1) foram **resolvidos e verificados contra `origin/main`**:

### FIX 1 — Migration 129 (RESOLVIDO ✓)
Confirmado via `git ls-tree origin/main supabase/migrations/`: última migration = `128_pegar_lead_bolsao.sql`; slot **129 LIVRE**; slots 121–128 ocupados. A renumeração 121→129 está **consistente em toda a story** (Dependencies, Scope, AC 1, AC 2, Task 1, filename `129_leads_distrato.sql`, File List, Risks) — 17 ocorrências de "129". As ocorrências remanescentes de "121" estão **apenas** no texto histórico (PO Validation v1.1 + Change Log), o que é correto. NOTA reforçada na story: reconfirmar contra `origin/main` no momento do apply (histórico de colisões neste projeto).

### FIX 3 — Semântica active-contract-wins / multi-obra (RESOLVIDO ✓)
Decisão de stakeholder (2026-06-30) corretamente capturada: contato só é distratado quando **TODOS** os vínculos têm `distrato = true` E existe ao menos 1 vínculo.
- AC 3 e AC 4 dizem "TODOS os vínculos... (sem nenhuma obra ativa restante)". ✓
- **AC 5a novo** cobre explicitamente o caso multi-obra (obra A distratada + obra B ativa → `false`, NÃO bloqueia). ✓
- Tasks 2 e 3 implementam a lógica de **2 queries** (existe vínculo `distrato=true` E NÃO existe vínculo `distrato=false`), evitando a cardinalidade ambígua de joins Supabase. ✓
- `computeDistrato()` em `sync.ts` (origin/main L47-49: `values.length > 0 && values.every(s => s === SITUACAO_DISTRATO)`) permanece por-vínculo; a agregação por-contato é feita corretamente no helper. ✓

### Branch note (FIX 2 ✓)
Nota CRÍTICA de implementar a partir de branch novo de `origin/main` (não `feat/epic-76`) presente em Dependencies + Dev Notes.

**Nice-to-have (não bloqueia):** sem testes unitários automatizados — aceitável, segue padrão da Story 20-9; branches de `isContatoDistratado` são isoláveis se o @qa quiser cobertura.

**Verificações anti-hallucination OK:** `normalizePhoneBR` em `packages/shared/src/utils/phone.ts` · migrations 116+118 em origin/main · `createAdminClient` + padrão bridge 2-passos de `notificacoes.ts` válidos · CodeRabbit Disabled correto · Executor `@dev` ≠ quality_gate `@qa`.

**Transição:** `Draft → Ready`. Story liberada para o @dev — **primeira da cadeia** (20-10 → 20-11 → 20-12).

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-30 | 1.0 | Story criada — bridge leads↔Sienge + helper central de distrato | River (@sm) |
| 2026-06-30 | 1.1 | Validação PO: NO-GO (7/10) — migration 121 colide (real free=129), semântica active-contract-wins a esclarecer | Pax (@po) |
| 2026-06-30 | 1.2 | @sm required-fixes: migration 121→129 consistente em toda a story (FIX 1); nota CRITICO branch origin/main em Deps+DevNotes (FIX 2); semântica active-contract-wins todos-os-vínculos com AC 5a novo + ACs 3/4 corrigidos + Tasks 2-3 atualizadas para lógica 2-queries (FIX 3) | River (@sm) |
| 2026-06-30 | 1.3 | Re-validação PO pós-fixes: **GO (9/10)** — FIX 1 (slot 129 livre confirmado em origin/main) e FIX 3 (active-contract-wins/multi-obra com AC 5a) verificados. **Status Draft → Ready**. Primeira da cadeia 20-10→20-11→20-12 | Pax (@po) |
| 2026-06-30 | 1.4 | Implementação @dev: migration `130_leads_distrato.sql` (renumerada 129→130, slot 129 ocupado por `129_imob_kanban.sql` em origin/main) + helper `is-contato-distratado.ts` com `isContatoDistratado()` (3-pass active-contract-wins) e `propagateDistratosToLeads()` (diff em JS, idempotente). Branch `fix/distrato-bloqueio-canais-20-10` de origin/main. typecheck+lint limpos no arquivo; build full bloqueado por pré-existente `react-email-editor` (fora de escopo). **Status Ready → Ready for Review** | Dex (@dev) |
| 2026-07-06 | 1.6 | @dev integração com `origin/main` (worktree isolado): migration renumerada `130_leads_distrato.sql` → `161_leads_distrato.sql` (slot 130 passou a colidir com `130_roleta_pick_no_bolsao.sql` em main; decisão de stakeholder: distrato = 161). Referências operativas (Dependencies, Scope, ACs, Risks, Tasks, File List, passos de deploy) atualizadas 129/130 → 161. Entradas datadas de auditoria (Change Log 1.0–1.5, AUTO-DECISION, PO Re-Validation, QA Results) preservadas como registro histórico. Rebase sobre origin/main sem conflitos de código. | Dex (@dev) |
| 2026-06-30 | 1.5 | @dev QA-fixes (gate CONCERNS 20.10): **SEC-001** resolvido — `orgId?` opcional em `DistratoCheckParams` escopa o lookup real-time de `clientes` por org (alinha com `propagateDistratosToLeads`), elimina falso-positivo cross-org; também mitiga PERF-001 quando `orgId` é passado. **REL-001** resolvido — match de email case-insensitive em `propagateDistratosToLeads` (compare `lower(email)` em JS, query em lote única, sem N+1). Semântica todos-os-vínculos inalterada (4 cenários do QA mantidos). typecheck+lint limpos no arquivo. Call-sites intactos (a 20-12 passará `org_id`). | Dex (@dev) |

---

## Dev Agent Record

### Agent Model Used
Dex (@dev) — Claude Opus 4.8 (1M context)

### Debug Log References
- **Git protocol:** working tree do branch `feat/epic-76` (157 mudanças não relacionadas) preservado via `git stash push -u -m "wip-epic-76-antes-distrato"` (stash@{0}). Branch limpo `fix/distrato-bloqueio-canais-20-10` criado de `origin/main` (fetch `0c47410c..fe0aff05`). As 3 stories de distrato (20-10/11/12) restauradas no branch novo a partir do backup em scratchpad.
- **Base verificada:** migrations `116_distrato_sienge_contrato_cancelado.sql` + `118_fix_idx_cov_distrato_predicate.sql` presentes; helper da 20-9 (`computeDistrato` em `sienge/sync.ts`) presente. Confirma que a implementação está sobre a base correta (não reintroduz o bug da 20-9).
- **Quality gates:** `tsc --noEmit` (web) → 0 erros no arquivo da story (únicos erros pré-existentes: `react-email-editor` ausente em `visual-editor.tsx`, presente em origin/main, fora do escopo). `eslint` no arquivo novo → exit 0 (limpo). `next build` → falha SÓ no blocker pré-existente `react-email-editor` (módulo declarado em package.json mas não instalado neste ambiente); nenhum dos arquivos da story aparece no trace de falha.

### Completion Notes
- **[AUTO-DECISION] Slot de migration 129 → 130.** A story fixava `129_leads_distrato.sql`, mas após `git fetch` o `origin/main` avançou e o slot 129 passou a ser ocupado por `129_imob_kanban.sql`. A própria story instrui reconfirmar a numeração contra `origin/main` no apply (histórico de colisões). Migration criada como `130_leads_distrato.sql` (próximo slot livre confirmado: maior número atual = 129). O conteúdo/semântica permanece idêntico ao especificado em AC 1/AC 2.
- **Semântica active-contract-wins (AC 5a) implementada via 2 passos** (padrão da Story 20-9, `notificacoes.ts`), evitando embeds `clientes!inner(...)` com cardinalidade ambígua. `isContatoDistratado`: (1) cliente_ids com vínculo `distrato=true` (conjunto bounded) → (2) filtra os que batem com o contato (phone normalizado via `normalizePhoneBR`, ou email case-insensitive) → (3) se algum cliente que bateu tem vínculo `distrato=false`, retorna `false` (active-contract-wins). Caso AC 5a (1 cliente, obra A distratada + obra B ativa) → o cliente entra no passo 3 com vínculo ativo → retorna `false`. ✓
- **`propagateDistratosToLeads` implementado com diff em JS** em vez de 2 UPDATEs SQL literais (Passos 3/4 da Task 3). Computa `shouldBeDistratado` (leads que batem com contato totalmente distratado) e `currentlyDistratado` (leads com `distrato=true`), aplica só os diffs (`toSetTrue`/`toSetFalse`) por `id`. Resultado idêntico ao especificado, com contagem `{updated, cleared}` precisa e idempotência forte (AC 10): re-execução sem mudanças → `{updated:0, cleared:0}`. Edge case de arrays vazios coberto: sem distratados → `shouldBeDistratado` vazio → todos os atuais `distrato=true` são revertidos (`cleared`).
- **Fail-open:** todos os caminhos com erro de DB → `console.error` + retorno seguro (`false` / `{0,0}`), para nunca bloquear leads legítimos por bug de infra.
- **Limitação conhecida (documentada):** match por email é case-insensitive no helper; em `propagateDistratosToLeads` o filtro de email usa `.in('email', [...emails lowercased])` (telefone é a ponte canônica, email é fallback — alinhado ao Risk da story). Clientes com `sienge_customer_id = NULL` continuam detectáveis pela ponte telefone/email.
- **Build full não validado de ponta a ponta** por blocker pré-existente e fora de escopo (`react-email-editor`). O helper ainda não é importado por nenhum módulo (Story 20-12 o consumirá), portanto não tem impacto no grafo de build. `import "server-only"` (AC 8) presente na 1ª linha — a proteção de bundle será exercida em build time quando um Client Component o importar (20-12).

### QA Fixes aplicados (@dev, pós-gate CONCERNS) — 2026-06-30

Os 2 findings LOW do gate (`docs/qa/gates/20.10-distrato-ponte-leads-sienge-helper.yml`) foram endereçados no helper antes da 20-12 cablar nos canais. Semântica active-contract-wins (todos-os-vínculos) NÃO foi alterada — os 4 cenários do QA permanecem válidos (só-distratado→true, só-ativo→false, misto→false, sem-match→false).

- **SEC-001 (RESOLVIDO)** — escopo de org no caminho real-time. Adicionado campo opcional `orgId?: string | null` em `DistratoCheckParams`. Quando fornecido, o Passo 2 (`isContatoDistratado`) escopa o lookup de `clientes` por `.eq("org_id", orgId)` — mesmo padrão já usado em `propagateDistratosToLeads` — eliminando o falso-positivo cross-org (cliente distratado da org A bloqueando lead de mesmo telefone/email na org B). Como o match é restringido aos clientes da org, os `matchedClienteIds` e o Passo 3 (vínculos ativos) já ficam org-scoped por transitividade. Compatibilidade preservada: sem `orgId`, comportamento legado single-tenant (premissa documentada na interface). Call-sites NÃO alterados — a 20-12 passará o `org_id` do lead (param pronto e documentado). PERF-001 é mitigado pelo mesmo escopo quando `orgId` é passado.
- **REL-001 (RESOLVIDO)** — match de email case-insensitive consistente. `propagateDistratosToLeads` já lowercaseia os emails-alvo (`targetEmails`), mas o filtro `.in("email", emailsArr)` fazia match exato no DB → falso-negativo com case divergente. Alinhado ao compare case-insensitive de `isContatoDistratado`: agora busca os leads da org com email (`.not("email","is",null)`) numa query em lote única e compara `lower(email)` em JS contra o `Set` de emails-alvo. Sem N+1 (continua 1 query), sem risco de wildcard (evita `ilike`), telefone mantido como match primário (email é fallback).
- **Gates locais (arquivo da story):** `tsc --noEmit` → 0 erros no arquivo (só os pré-existentes de `react-email-editor` em `visual-editor.tsx`, fora de escopo); `eslint src/lib/distrato/is-contato-distratado.ts` → exit 0.

### File List
- `supabase/migrations/161_leads_distrato.sql` (criado — Task 1; renumerado 129 → 130 → 161; 129 ocupado por `129_imob_kanban.sql`, 130 ocupado por `130_roleta_pick_no_bolsao.sql` após integração com main)
- `packages/web/src/lib/distrato/is-contato-distratado.ts` (criado — @dev, Tasks 2-3)

---

## QA Results

### Review Date: 2026-06-30

### Reviewed By: Quinn (Test Architect)

**Gate: CONCERNS** → `docs/qa/gates/20.10-distrato-ponte-leads-sienge-helper.yml`
**Decisão da cadeia: LIBERADA para 20-11.** Volta ao @dev NÃO é exigida; concerns são não-bloqueantes e rastreados.

#### Foco crítico — semântica todos-os-vínculos (active-contract-wins): VERIFICADA CORRETA ✓
Reconstruí a lógica de `isContatoDistratado` por código contra os 4 cenários:
- (a) só distratado → cliente entra no Passo 1, bate no Passo 2, Passo 3 não acha vínculo ativo → **true** ✓
- (b) só ativo → cliente NÃO tem vínculo `distrato=true`, não entra em `distClienteIds` → `matchedClienteIds` vazio → **false** ✓
- (c) misto (distratado + ativo) → cliente entra no Passo 1 e bate no Passo 2, mas Passo 3 (`distrato=false IN matchedClienteIds`) acha o vínculo ativo → **false (NÃO bloqueia)** ✓ — esta é a regra de stakeholder que não pode regredir
- (d) sem vínculo / phone sem match → **false** (fail-open) ✓

`propagateDistratosToLeads` aplica a mesma agregação: `totalmenteDistratado = hasDistrato AND NOT hasActive` (L210-212). Consistente com o helper e com AC 3/4/5/5a.

#### Quality gates executados
- `tsc --noEmit` (packages/web): **0 erros no arquivo da story**. Os 3 erros tsc totais são todos em `visual-editor.tsx` (`react-email-editor` — dep não instalada), **pré-existentes e fora de escopo → WAIVED** (nenhum arquivo da 20-10 no trace).
- `eslint src/lib/distrato/is-contato-distratado.ts`: **exit 0**.
- Migration slot **130 livre e único** (129 ocupado por `129_imob_kanban.sql`; renumeração 129→130 do @dev está correta).
- Schema/imports validados — zero referência hallucinada: `clientes_obras_vinculos.distrato` (mig 116), `clientes.{org_id,email,telefone,whatsapp}` (mig 041), `createAdminClient` (admin.ts L6), `normalizePhoneBR` (@trifold/shared via index.ts L7).

#### Migration 130 — não-breaking confirmado
`ADD COLUMN IF NOT EXISTS distrato BOOLEAN NOT NULL DEFAULT FALSE` é metadata-only no PG11+ (DEFAULT não-volátil, sem table rewrite). Índice parcial `WHERE distrato=TRUE` é construído como índice plano mas, como toda linha nasce `FALSE`, o predicado casa **zero linhas no momento da criação** → build efetivamente instantâneo e não-bloqueante. Idempotência via `IF NOT EXISTS`. Sem DOWN migration — alinhado à convenção forward-only do projeto.

#### Findings (todos LOW, não-bloqueantes)
| ID | Sev | Arquivo:linha | Achado | Ação |
|----|-----|---------------|--------|------|
| SEC-001 | low | `is-contato-distratado.ts:79-99` | Helper sem `orgId` — Passos 1/2 consultam `clientes_obras_vinculos`/`clientes` sem filtro de org → risco de falso-positivo cross-org em multi-tenant. `propagateDistratosToLeads` ESTÁ escopado por org. | Antes de 20-12 cablar nos canais: adicionar `orgId?` opcional para escopar, ou documentar premissa single-tenant. Impacto real baixo (Trifold ≈ org única). |
| REL-001 | low | `is-contato-distratado.ts:219-246` | `propagate` lowercaseia emails-alvo mas filtra `leads` via `.in("email", ...)` (match exato no DB) → leads com email em case diferente são perdidos (falso-negativo). Helper real-time faz compare case-insensitive em JS (sem o gap). | Email é fallback (telefone é a ponte canônica). Documentar limitação ou normalizar `leads.email`. Acompanhar em 20-11/20-12. |
| PERF-001 | low | `is-contato-distratado.ts:79-82` | Passo 1 sem bound de org a cada chamada real-time; coberto pelo índice parcial (mig 118) mas a lista IN do Passo 2 cresce com o nº de distratados. | Aceitável no volume atual; resolver junto com SEC-001 escopando por org. |
| TEST-001 | low | — | Smoke (Task 4) não executado contra prod do QA (read-only seguro indisponível). ACs validados por código + schema; sem testes unitários (padrão 20-9). | Smoke deferido ao @devops pós-deploy (passos no gate file). Aplicar migration 161 ANTES do código da 20-12. |

#### AC → evidência (10/10 cobertos)
AC1 (mig L30-31), AC2 (mig L40-42), AC3 (helper L75-136), AC4 (L116-118), AC5 (L92/L122), AC5a (L124-136 — Passo 3), AC6 (L50-66 fast path), AC7 (L46+L73), AC8 (L1 `server-only`), AC9 (L227-295), AC10 (L268-270 diff). Detalhe completo no gate file.

#### Smoke deferido (@devops pós-deploy)
1. `isContatoDistratado({ phone: <distratado real> })` → esperar `true`.
2. `isContatoDistratado({ phone: <lead ativo> })` → esperar `false`.
3. `propagateDistratosToLeads(orgId)` → `leads.distrato=true` apenas para contatos totalmente distratados; re-run → `{updated:0, cleared:0}`.
Pré-requisito: aplicar `supabase/migrations/161_leads_distrato.sql` via Management API ANTES do deploy do código da Story 20-12.

### Gate Status

Gate: CONCERNS → docs/qa/gates/20.10-distrato-ponte-leads-sienge-helper.yml
