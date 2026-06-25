# Story 20.9: Fix Distrato — Bloquear Notificações para Contratos Cancelados no Sienge

## Status
Done

## Dependencies
- **Story 20.8** (`docs/stories/20-8-sienge-enterprise-link-auto-sync.md`) — PREREQUISITE DONE: `syncContract()` em `sync.ts`, `clientes_obras_vinculos` com `sienge_contract_numbers TEXT[]`, `SiengeContract` com campo `situation` em `types.ts`, migration 066 aplicada.
- **Migration 109** — nova (esta story). Requer slot 109 livre (confirmado; última migration aplicada: 108).

## Scope
**IN:**
- Nova coluna `sienge_contract_situations JSONB DEFAULT '{}'` em `clientes_obras_vinculos` — mapa por contrato (`{contract_number: situation}`)
- Nova coluna `distrato BOOLEAN NOT NULL DEFAULT FALSE` em `clientes_obras_vinculos` — flag derivada, reversível
- `syncContract()` em `sync.ts`: persiste situation por contrato + calcula `distrato` + pula convite quando `distrato = true`
- `notifyClientes()` em `notificacoes.ts`: filtra `distrato = true` antes de disparar WhatsApp/email/push
- Função `reconcileDistratosForObra(obraId)` para remediação dos 39 contratos cancelados já existentes em prod
- Rota `POST /api/admin/obras/[obra_id]/sienge/reconcile-distratos` (admin-only) para acionar remediação
- Rota `PATCH /api/admin/obras/[obra_id]/vinculos/[vinculo_id]/distrato` para reversão manual (admin-only)

**OUT:**
- Deletar, revogar acesso ou remover `cliente_obras`/`users` de distratados — flag reversível apenas
- Sync automático agendado — escopo futuro
- Notificação proativa ao admin quando distrato detectado — escopo futuro
- Suporte a múltiplos tenants Sienge

## Complexity
**Estimativa:** M (Medium) — 3 camadas de mudança (DB schema, sync logic, notification filter) + 1 endpoint de remediação + 1 endpoint de reversão. Impacto crítico (bug de produção) mas escopo bem delimitado. Nenhum novo padrão arquitectural.

## Risks
| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| JOIN complexo em `notifyClientes` quebrando pipeline de notificação | Médio | Alto | Testar com obra que tem clientes ativos + distratados antes de deploy |
| `reconcileDistratosForObra` chamando API Sienge em prod via endpoint | Médio | Médio | Rate limit com sleep(300ms) já existente em `getAllSalesContracts()`; endpoint admin-only |
| Migration 109 aplicada sem migration 066 estar ativa | Baixo | Alto | Dependência explícita documentada; verificar `sienge_contract_numbers` existe antes de ALTER TABLE |
| Cliente com 2 contratos: 1 Cancelado + 1 Emitido tratado incorretamente como distrato | Médio | Alto | Regra "active-contract-wins" implementada com `Object.values().every(s => s === 'Cancelado')` |
| `distrato = true` sendo irreversível em falha de sync | Baixo | Alto | Flag explicitamente reversível via endpoint PATCH; sync subsequente recalcula |

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["typecheck", "lint", "build", "manual-smoke"]
nota: "@data-engineer deve revisar e aprovar o design da migration 109 antes de @dev implementar Tasks 2-5"

---

## Story

**As a** sistema CRM Trifold,
**I want** detectar quando todos os contratos de um cliente em uma obra possuem `situation === "Cancelado"` no Sienge e bloquear o envio de notificações (WhatsApp, email, push) para esse cliente,
**so that** clientes que fizeram distrato não recebam mensagens sobre uma obra que não lhes pertencem mais, evitando constrangimento e violação de privacidade — como o incidente de produção de 2026-06-25.

---

## Acceptance Criteria

### Frente 1 — Schema / Persistência

**AC 1 — Migration 109: colunas de situação e distrato**
Dado que a tabela `clientes_obras_vinculos` já existe com `sienge_contract_numbers TEXT[]`,
quando a migration 109 é aplicada,
então a tabela passa a ter:
- `sienge_contract_situations JSONB NOT NULL DEFAULT '{}'` — mapa de `{contract_number: situation}` (ex: `{"VIND-703": "Emitido", "VIND-704": "Cancelado"}`)
- `distrato BOOLEAN NOT NULL DEFAULT FALSE` — flag derivada: `true` quando todo contrato do mapa está "Cancelado"

E as linhas existentes assumem os valores padrão (`'{}'` e `false`) sem erro.

**AC 2 — `syncContract()` persiste `situation` por contrato**
Dado que `getAllSalesContracts()` retorna contratos com o campo `situation` (já presente na interface `SiengeContract` em `types.ts`),
quando `syncContract()` processa um contrato específico para um cliente+obra,
então `sienge_contract_situations` é atualizado com `{[contract.documentId]: contract.situation}` via merge JSONB (não substituição), preservando situações de contratos anteriores.

### Frente 2 — Prevenção no Sync (regra de distrato)

**AC 3 — Distrato calculado após merge**
Dado que `sienge_contract_situations` de um cliente+obra contém o mapa completo de todos os seus contratos naquela obra,
quando `syncContract()` é invocado para um novo ou existente contrato,
então `distrato` é computado como:
```
distrato = Object.values(sienge_contract_situations).every(s => s === 'Cancelado')
```
E o valor calculado é persistido em `clientes_obras_vinculos.distrato`.

**AC 4 — Convite portal suprimido quando `distrato = true`**
Dado que `syncContract()` calculou `distrato = true` para um cliente+obra,
quando a lógica de invite seria acionada (i.e., bloco `if (email && vinculoId)` em `sync.ts` L191),
então `maybeInviteCliente()` (sync.ts L368) NÃO é chamado e nenhum convite é enviado.
O registro em `clientes_obras_vinculos` é atualizado com `distrato = true` mas `sienge_invite_sent_at` permanece NULL.

**AC 5 — Edge case: cliente com contratos mistos permanece ativo**
Dado que um mesmo cliente (mesmo `sienge_customer_id`) tem na mesma obra:
- Contrato A: `situation = "Cancelado"`
- Contrato B: `situation = "Emitido"` (ou "Autorizado" ou "Solicitado")
quando `syncContract()` processa ambos os contratos,
então `distrato = false` (pois há ao menos um contrato não-Cancelado) e o cliente recebe notificações normalmente.

**AC 6 — Deny-list: novos valores de situation não bloqueiam por padrão**
Dado que a API Sienge introduza um novo valor de situation nunca antes visto (ex: `"Rescindido"`),
quando `syncContract()` processa esse contrato,
então `distrato = false` (novo valor não está na deny-list "Cancelado") e o cliente permanece ativo até revisão explícita.

### Frente 3 — Defesa no Disparo

**AC 7 — `notifyClientes()` filtra vínculos com `distrato = true`**
Dado que `clientes_obras_vinculos` contém vínculos com `distrato = true` para alguns clientes de uma obra,
quando `notifyClientes(obraId, ...)` é chamado para aquela obra,
então os clientes cujo `distrato = true` em `clientes_obras_vinculos` NÃO recebem notificação via WhatsApp, email ou push.
Clientes com `distrato = false` ou sem vínculo em `clientes_obras_vinculos` (se caso existir) recebem normalmente.

> **Nota de implementação:** `notifyClientes()` lê de `cliente_obras` (portal-side). O filtro requer JOIN:
> `cliente_obras → users (via user_id) → clientes (via sienge_customer_id) → clientes_obras_vinculos (via cliente_id + obra_id)`.
> Usar LEFT JOIN + `WHERE clientes_obras_vinculos.distrato IS NOT TRUE` (tolera cliente_obras sem vínculo CRM correspondente).

### Frente 4 — Remediação dos 39 Contratos Cancelados Existentes

**AC 8 — `reconcileDistratosForObra(obraId)` recalcula distrato para todos os vínculos existentes**
Dado que uma obra tem `sienge_enterprise_id` configurado e vínculos em `clientes_obras_vinculos` com `sienge_contract_situations = '{}'` (coluna recém-criada sem dados históricos),
quando `reconcileDistratosForObra(obraId)` é executado,
então a função:
1. Busca todos os contratos atuais da obra via Sienge API (reaproveitando `getAllSalesContracts()` + filtro por `unitId`)
2. Para cada `clientes_obras_vinculos` da obra, reconstrói `sienge_contract_situations` com os dados atuais do Sienge
3. Recalcula e persiste `distrato` de acordo com AC 3
4. Retorna `{ reconciled: N, distratados: M, errors: [] }` com o resultado

**AC 9 — Endpoint de remediação acessível pelo admin**
Dado que o admin está na seção Sienge de uma obra no dashboard,
quando aciona `POST /api/admin/obras/[obra_id]/sienge/reconcile-distratos`,
então o sistema executa `reconcileDistratosForObra(obraId)` e retorna o resultado `{ reconciled, distratados, errors }` com HTTP 200.
A rota é restrita a `admin` e `supervisor`.

### Frente 5 — Reversibilidade

**AC 10 — Flag `distrato` pode ser revertida manualmente pelo admin**
Dado que um vínculo em `clientes_obras_vinculos` tem `distrato = true` por engano (ex: equipe Sienge lançou cancelamento indevido),
quando o admin chama `PATCH /api/admin/obras/[obra_id]/vinculos/[vinculo_id]/distrato` com `{ distrato: false }`,
então `clientes_obras_vinculos.distrato` é atualizado para `false` e o cliente volta a receber notificações no próximo disparo.
A rota é restrita a `admin`.

**AC 11 — Reversão não altera dados relacionados**
Dado que o admin reverte `distrato = false` para um vínculo,
então `clientes_obras_vinculos`, `cliente_obras`, `clientes` e `users` permanecem intactos (nenhuma linha é deletada ou criada).

---

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- **Primary Type:** Integration (Sienge sync) + Database (migration 109)
- **Secondary Type(s):** API (novos endpoints admin), Bug Fix (notificacoes.ts)
- **Complexity:** Medium-High — 3 camadas de change (DB, sync, notification), impacto de produção crítico

**Specialized Agent Assignment:**
- Primary Agents:
  - @dev (implementação sync.ts, notificacoes.ts, rotas API)
  - @data-engineer (design e review da migration 109)
- Supporting Agents:
  - @qa (quality gate com smoke test em obra real com Sienge enterprise configurado)

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): `npm run typecheck` e `npm run build` — zero erros
- [ ] Pre-PR (@devops): Revisar migration 109 não conflita com migrations existentes; smoke em dev apontando para prod antes de deploy
- [ ] Pre-Deploy (manual): Executar `reconcileDistratosForObra` para todas as obras com Sienge configurado imediatamente após deploy

**CodeRabbit Focus Areas:**
- `syncContract()`: Merge JSONB idempotente — garantir que sync repetido não duplica entradas no mapa
- `notifyClientes()`: LEFT JOIN + `IS NOT TRUE` (não `= false`) para tolerar registros sem vínculo CRM
- `reconcileDistratosForObra()`: Rate limit Sienge — sleep(300ms) entre páginas (padrão existente em `getAllSalesContracts()`)
- Migration 109: DEFAULT não-BREAKING nas colunas novas (`DEFAULT '{}'` e `DEFAULT false`) — sem dados perdidos

---

## Tasks / Subtasks

### Task 1 — @data-engineer: Migration 109 (AC: 1)
- [x] Criar `supabase/migrations/109_distrato_sienge_contrato_cancelado.sql`
- [x] `ALTER TABLE clientes_obras_vinculos ADD COLUMN sienge_contract_situations JSONB NOT NULL DEFAULT '{}'`
- [x] `ALTER TABLE clientes_obras_vinculos ADD COLUMN distrato BOOLEAN NOT NULL DEFAULT FALSE`
- [x] Criar índice parcial para `notifyClientes()` hot-path: `idx_cov_distrato ON clientes_obras_vinculos(obra_id) WHERE distrato = false` — **NOTA @data-engineer:** usado `CREATE INDEX` plano (não `CONCURRENTLY`). CONCURRENTLY não roda em transação e não pode indexar coluna criada na mesma migration; a tabela é pequena, então o lock é desprezível e a migration permanece atômica/idempotente.
- [x] Verificar que migration pode ser aplicada sem lock em prod (ambas as colunas têm DEFAULT — sem table scan)
- [ ] Aplicar via Supabase Management API (PAT) — confirmar com @devops (ver `reference_supabase_management_api.md`) — **PENDENTE: apply no deploy pelo @devops (não aplicar agora)**

> **Review da migration (@data-engineer, 2026-06-25):** Numeração 109 re-confirmada livre (maior committed/working tree = 108; migrations untracked 044/063/065 são todas < 108). RLS não afetada: policies `clientes_obras_vinculos_select` / `_manage` (migration 041) filtram apenas por `cliente_id` via `clientes.org_id`; as colunas novas herdam a RLS da tabela. Não-breaking: ambas as colunas têm DEFAULT seguro + `ADD COLUMN IF NOT EXISTS`. Design aprovado para @dev implementar Tasks 2-5.

### Task 2 — @dev: Atualizar `syncContract()` em `sync.ts` (AC: 2, 3, 4, 5, 6)
- [x] Localizar `syncContract()` em `packages/web/src/lib/integrations/sienge/sync.ts` (aprox. L154)
- [x] Ler `contract.situation` do `SiengeContract` (campo já existe em `types.ts` conforme interface definida na Story 20.8)
- [x] Antes do upsert de `clientes_obras_vinculos`, buscar o `sienge_contract_situations` atual da linha (se existir)
- [x] Fazer merge JSONB: `{ ...existingMap, [contract.number]: contract.situation }` — **NOTA @dev:** usado `contract.number`, NÃO `contract.documentId` (esse campo não existe em `SiengeContract`; só `number`). `number` é a chave canônica já usada em `sienge_contract_numbers` e bate com o exemplo das Dev Notes (`{"VIND-703": "Emitido"}`).
- [x] Calcular `distrato` via helper `computeDistrato(map)` = `vals.length > 0 && vals.every(s => s === 'Cancelado')` (mapa vazio ⇒ false)
- [x] Incluir `sienge_contract_situations` e `distrato` no payload do upsert (assinatura de `upsertVinculo()` estendida para aceitar `situation` e retornar `{ id, distrato }`)
- [x] Adicionar guard antes do bloco de invite (`if (email && vinculoId)`): agora `if (email && vinculoId && !distrato)` — `maybeInviteCliente()` não é chamado em distrato

### Task 3 — @dev: Atualizar `notifyClientes()` em `notificacoes.ts` (AC: 7)
- [x] Localizar `notifyClientes()` em `packages/web/src/lib/notificacoes.ts` (aprox. L57)
- [x] Analisar como a função seleciona os destinatários (atualmente: todos os `cliente_obras` da obra)
- [x] Implementado JOIN lógico via `sienge_customer_id` (2 passos, ver Completion Notes) em vez de embed Supabase com cardinalidade ambígua:
  `cliente_obras.user_id → users.sienge_customer_id` cruzado com `clientes.sienge_customer_id` (de `clientes_obras_vinculos.cliente_id` onde `distrato=true` na obra)
- [x] Filtra excluindo `sienge_customer_id` distratados (tolerante: user sem vínculo CRM ou `sienge_customer_id` null recebe)
- [x] Filtro aplicado a TODOS os canais: `continue` antes de qualquer envio (WhatsApp, email, push)

### Task 4 — @dev: Implementar `reconcileDistratosForObra()` e endpoint de remediação (AC: 8, 9)
- [x] Adicionar função `reconcileDistratosForObra(obraId: string): Promise<ReconcileResult>` em `sync.ts`
  - Busca `sienge_enterprise_id` da obra (lança erro descritivo se ausente)
  - Reutiliza `getAllSalesContracts(enterpriseId)` (já rate-limited com sleep entre páginas)
  - Para cada `clientes_obras_vinculos` da obra, reconstrói `sienge_contract_situations` a partir de `sienge_contract_numbers` × situação atual e recalcula `distrato`
  - Retorna `{ reconciled, distratados, errors[] }` (erros por vínculo são não-bloqueantes)
- [x] Criada rota `packages/web/src/app/api/admin/obras/[obra_id]/sienge/reconcile-distratos/route.ts`
  - Method: POST, sem body; valida obra na org + enterprise_id (padrão da rota `sienge/sync`)
  - Auth: `requireRole(appUser, ['admin', 'supervisor'])`
  - `maxDuration = 300`

### Task 5 — @dev: Endpoint de reversão manual (AC: 10, 11)
- [x] Criada rota `packages/web/src/app/api/admin/obras/[obra_id]/vinculos/[vinculo_id]/distrato/route.ts`
  - Method: PATCH, body: `{ distrato: boolean }` (valida tipo boolean)
  - Auth: `requireRole(appUser, ['admin'])`
  - Valida obra pertence à org; atualiza `clientes_obras_vinculos.distrato` WHERE `id = vinculo_id AND obra_id = obra_id` (apenas o boolean — nada é deletado/criado)
  - Retorna `{ success: true, distrato }`; 404 se vínculo não encontrado

### Task 6 — Remediação manual pós-deploy (não-código)
- [ ] Após deploy em prod, admin executa `POST /api/admin/obras/[obra_id]/sienge/reconcile-distratos` para cada obra com Sienge enterprise configurado
- [ ] Verificar que os 39 contratos `situation = "Cancelado"` resultaram em vínculos com `distrato = true`
- [ ] Confirmar que próxima notificação de obra não inclui os clientes distratados (smoke test manual)

---

## Dev Notes

### Contexto do Bug

Incidente confirmado em 2026-06-25: cliente com `situation = "Cancelado"` no Sienge recebeu notificação de obra. Root cause: `syncContract()` ignora o campo `situation` (presente na interface mas nunca lido), e `notifyClientes()` envia para TODOS os `cliente_obras` sem filtro de distrato.

Dados reais de produção (query read-only via API Sienge, 2026-06-25):
- Total de contratos: 842
- `situation = "Emitido"`: 777 (ativo)
- `situation = "Cancelado"`: 39 (**distrato**)
- `situation = "Solicitado"`: 16
- `situation = "Autorizado"`: 10

**IMPORTANTE:** Não existe string `"Distrato"` na API Sienge. O distrato aparece como `situation: "Cancelado"`.

### Decisões de Produto (Gabriel, 2026-06-25)
1. **Deny-list:** bloquear APENAS `situation === "Cancelado"`. Outros valores (`Emitido`, `Autorizado`, `Solicitado`) e valores futuros desconhecidos ficam ativos por padrão.
2. **Reversível:** usar flag `distrato boolean`, NÃO deletar registros. Admin pode reverter manualmente.
3. **Múltiplos contratos:** se cliente+obra tem ao menos 1 contrato não-Cancelado, o cliente permanece ativo.

### Arquivos-Chave (não reinvestigar)

| Arquivo | Responsabilidade | Ponto de mudança |
|---------|-----------------|-----------------|
| `packages/web/src/lib/integrations/sienge/sync.ts` | Sync Sienge → CRM | `syncContract()` aprox. L154; adicionar leitura de `situation`, merge JSONB, cálculo de `distrato`, guard de invite |
| `packages/web/src/lib/integrations/sienge/client.ts` | Cliente API Sienge | `getAllSalesContracts()` aprox. L312 — NÃO modificar; o campo `situation` já vem da API |
| `packages/web/src/lib/integrations/sienge/types.ts` | Tipos Sienge | `SiengeContract` aprox. L190 — campo `situation: string` já existe; NÃO modificar |
| `packages/web/src/lib/notificacoes.ts` | Disparo notificações | `notifyClientes()` aprox. L57 — adicionar filtro `distrato IS NOT TRUE` via JOIN |
| `supabase/migrations/109_distrato_sienge_contrato_cancelado.sql` | Schema | Criar — duas colunas novas em `clientes_obras_vinculos` |

### Estrutura das Tabelas Relevantes

```sql
-- clientes_obras_vinculos (CRM-side)
-- Colunas existentes (Migration 066):
cliente_id          UUID REFERENCES clientes(id)
obra_id             UUID REFERENCES obras(id)
sienge_contract_numbers  TEXT[]   -- ex: ['VIND-703', 'VIND-704']
sienge_invite_sent_at    TIMESTAMPTZ

-- Colunas NOVAS (Migration 109):
sienge_contract_situations  JSONB NOT NULL DEFAULT '{}'
-- ex: {"VIND-703": "Emitido", "VIND-704": "Cancelado"}
distrato                    BOOLEAN NOT NULL DEFAULT FALSE

-- cliente_obras (portal-side — lida por notifyClientes)
user_id   UUID REFERENCES users(id)
obra_id   UUID REFERENCES obras(id)
is_primary BOOLEAN

-- clientes (CRM-side)
id                  UUID
sienge_customer_id  INTEGER   -- FK lógica para clientes no Sienge

-- users (portal-side)
id                  UUID
sienge_customer_id  INTEGER   -- espelho de clientes.sienge_customer_id (adicionado na Story 20.7 migration 064)
```

### JOIN para `notifyClientes()` (implementação sugerida)

```typescript
// Padrão atual (ALL clientes):
const { data: clienteObras } = await supabase
  .from('cliente_obras')
  .select('user_id, ...')
  .eq('obra_id', obraId)

// Padrão proposto (com filtro distrato):
const { data: clienteObras } = await supabase
  .from('cliente_obras')
  .select(`
    user_id,
    users!inner(sienge_customer_id,
      clientes!inner(
        clientes_obras_vinculos(distrato, obra_id)
      )
    )
  `)
  .eq('obra_id', obraId)
  // filtrar após: excluir onde distrato = true

// ALTERNATIVA mais simples (subquery):
// Buscar user_ids dos distratados primeiro, depois excluir
const { data: distratadosVinculos } = await supabaseAdmin
  .from('clientes_obras_vinculos')
  .select('cliente_id, clientes(id, sienge_customer_id, users(id))')
  .eq('obra_id', obraId)
  .eq('distrato', true)
// Coletar user_ids e excluir da query de notificação
```

> **Nota para @dev:** O JOIN via Supabase JS pode ser complexo dependendo de como as FK's estão configuradas. Avaliar se uma RPC ou query direta com `.not('user_id', 'in', distratadosUserIds)` é mais simples e legível. O que importa é o comportamento do AC 7: nenhum distratado recebe notificação.

### Padrões Importantes a Seguir

- **Admin client:** usar `createAdminClient()` (service role) em `sync.ts` e nas rotas de remediação/reversão — mesmo padrão da Story 20.8.
- **Auth em rotas:** restringir sync/remediação a `['admin', 'supervisor']` e reversão manual a `['admin']`. NOTA: a assinatura real é `requireRole(appUser, allowedRoles)` em `packages/web/src/lib/api-auth.ts` L51 (retorna `NextResponse | null`) — obter o `appUser` primeiro (mesmo padrão das demais rotas admin) e passar como 1º argumento; NÃO existe a forma `requireRole(['admin'])`.
- **Idempotência:** `syncContract()` deve continuar idempotente — sync repetido não duplica entradas nem muda `distrato` desnecessariamente.
- **Merge JSONB:** não substituir `sienge_contract_situations` — fazer merge para preservar situações de contratos anteriores que podem não estar no sync atual.
- **`maxDuration = 300`** em rota de reconciliação (mesmo padrão da rota de sync existente).

### Testing

**Abordagem:** manual smoke em prod + typecheck/build. Sem testes unitários obrigatórios (integração externa).

**Cenários de teste manuais:**

1. **Distrato isolado:** Obra X tem cliente A com 1 contrato `situation = "Cancelado"`. Após sync ou reconcile:
   - `clientes_obras_vinculos`: `sienge_contract_situations = {"VIND-999": "Cancelado"}`, `distrato = true`
   - `notifyClientes(obraX)` retorna lista SEM cliente A
   - Cliente A NÃO recebe WhatsApp, email ou push

2. **Cliente com múltiplos contratos:** Obra X tem cliente B com `VIND-700 Emitido` + `VIND-701 Cancelado`. Após sync:
   - `sienge_contract_situations = {"VIND-700": "Emitido", "VIND-701": "Cancelado"}`, `distrato = false`
   - Cliente B RECEBE notificações normalmente

3. **Reversão manual:** Admin faz PATCH `distrato = false` para cliente A. Próximo `notifyClientes` inclui cliente A.

4. **Reconciliação pós-deploy:** Executar `POST reconcile-distratos` em cada obra com Sienge enterprise. Verificar que os 39 contratos `Cancelado` conhecidos resultaram em `distrato = true`.

5. **Sync subsequente mantém distrato correto:** Rodar sync manual em obra X depois de reconciliação. Verificar que `distrato` não é revertido incorretamente.

**Typecheck e build:**
```bash
cd packages/web && npm run typecheck   # zero erros
cd packages/web && npm run build       # zero erros
```

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-25 | 1.4 | Deploy por Gage (@devops). Fix extraído do branch poluído `feat/epic-76-*` (46 commits atrás de main) para branch limpo `fix/20-9-distrato-sienge` a partir de origin/main. **Migration renumerada 109 → 116**: main avançou até 115 enquanto o fix era desenvolvido, e `109_get_analytics_summary_ranged.sql` já ocupava 109. Patch de `notificacoes.ts` mergeado 3-way com o kill-switch `PORTAL_NOTIF_PAUSED` (Story 75-39) que main adicionou no mesmo arquivo — sem conflito. File List e referências de código (sync.ts L622) atualizadas para 116. | Gage (@devops) |
| 2026-06-25 | 1.0 | Story criada para corrigir bug de produção: clientes distratados recebendo notificações de obra | River (@sm) |
| 2026-06-25 | 1.3 | Tasks 2-5 implementadas por Dex (@dev). `sync.ts`: persistência de `sienge_contract_situations` (merge JSONB) + cálculo de `distrato` via `computeDistrato()` (deny-list `SITUACAO_DISTRATO="Cancelado"`, active-contract-wins), guard de invite em distrato, `reconcileDistratosForObra()`. `notificacoes.ts`: filtro de distratados nos 3 canais via ponte `sienge_customer_id` (2-passos). 2 endpoints admin novos: POST `reconcile-distratos` (admin/supervisor) e PATCH `vinculos/[id]/distrato` (admin). type-check + eslint limpos nos arquivos da story; `next build` bloqueado só por dep pré-existente ausente (`react-email-editor`). Migration 109 ainda não aplicada — aplicar ANTES do deploy do código. | Dex (@dev) |
| 2026-06-25 | 1.2 | Task 1 executada por Dara (@data-engineer): migration `109_distrato_sienge_contrato_cancelado.sql` criada (2 colunas + índice parcial + COMMENTs). Numeração 109 re-confirmada livre. RLS não afetada (policies filtram só por cliente_id). Não aplicada em prod — apply no deploy via @devops. Decisão: índice plano em vez de CONCURRENTLY (atomicidade + tabela pequena). | Dara (@data-engineer) |
| 2026-06-25 | 1.1 | Validação PO (10/10 pts → GO, score 9/10). Status Draft → Ready. Correções aplicadas: (a) AC 4 e Task 2 referenciavam `inviteUserByEmail` inexistente → corrigido para `maybeInviteCliente()` (sync.ts L368, chamada L192); (b) nota sobre assinatura real `requireRole(appUser, allowedRoles)` em api-auth.ts L51. Verificado por evidência: migration 109 LIVRE (maior existente = 108); 20.8/066/064 existem; campo `situation` em types.ts L190; `notifyClientes` L57 lê `cliente_obras`. Notas não-bloqueantes ao @dev/@qa: quality_gate=@qa (convenção do projeto, não @architect do template genérico); executor misto Task 1=@data-engineer; janela transitória de `distrato` durante sync multi-contrato (estado final correto). | Pax (@po) |

---

## Dev Agent Record

### Agent Model Used
Dex (@dev) — Opus 4.8 (1M)

### Debug Log References
- `cd packages/web && npm run type-check` → limpo para todos os arquivos da story. Único erro remanescente: `react-email-editor` (TS2307 em `email-templates/_components/visual-editor.tsx`) — **pré-existente**, dependência declarada em `package.json` (`^1.8.0`) mas não instalada neste ambiente; sem relação com a story.
- `npx eslint` nos 4 arquivos alterados/criados → limpo (0 erros, 0 warnings).
- `npm run build` (`next build`, `ignoreBuildErrors: false`) → falha **apenas** no `react-email-editor` ausente (módulo de email-templates/campaigns). Compilou além de todos os arquivos da story; o único bloqueio é a dependência não instalada. Correção = `pnpm install` (concern de @devops/ambiente, fora do escopo).

### Completion Notes

**Decisão-chave — chave do mapa de situações (AC 2):** usado `contract.number` (não `contract.documentId`). `SiengeContract` (`types.ts` L185-194) não tem `documentId`; só `number`. `number` já é a chave de `sienge_contract_numbers` e bate com o exemplo das Dev Notes.

**Decisão-chave — JOIN do filtro de distrato em `notifyClientes` (AC 7):** o dado de distrato vive no lado CRM (`clientes_obras_vinculos.distrato`), mas o disparo lê do lado portal (`cliente_obras → users`). A ponte é `sienge_customer_id`:
```
cliente_obras.user_id → users.sienge_customer_id
   == clientes.sienge_customer_id  (de clientes_obras_vinculos.cliente_id → clientes, WHERE obra_id + distrato=true)
```
Implementado em **2 passos** em vez de embed Supabase (`clientes!inner(...)`): (1) buscar `cliente_id` dos vínculos distratados da obra; (2) resolver `sienge_customer_id` em `clientes`. Motivo: o embed Supabase infere cardinalidade ambígua (`clientes` como array) e o `tsc` rejeita o cast; o 2-passos é determinístico e só consulta `clientes` quando há distrato. No loop, qualquer portal user cujo `sienge_customer_id ∈ conjunto distratado` é pulado via `continue` ANTES de qualquer envio → cobre os 3 canais (email, WhatsApp, push) de uma vez. Tolerante: user sem `sienge_customer_id` ou sem vínculo CRM recebe normalmente.

**Idempotência (AC 2/3):** `upsertVinculo` agora sempre faz merge JSONB e regrava `distrato` (antes só escrevia quando o número era novo). Isso garante propagação de transição Emitido → Cancelado. Mesmos inputs → mesmo estado final.

**Débitos técnicos / edge cases para @qa revisar:**
1. **Reconcile com contrato órfão:** se um `sienge_contract_numbers` de um vínculo não é mais retornado por `getAllSalesContracts()`, ele é omitido do mapa reconstruído (não inferimos situação). Se TODOS os contratos do vínculo sumirem do Sienge, o mapa fica `{}` ⇒ `distrato=false` (conservador, não bloqueia). Validar se esse comportamento é aceitável no smoke pós-deploy.
2. **Janela transitória durante sync multi-contrato:** ao sincronizar um cliente com 2 contratos, após o 1º contrato (Cancelado) o vínculo fica momentaneamente `distrato=true` até o 2º contrato (Emitido) ser processado, virando `false`. Estado FINAL correto (já apontado pela @po). Só relevante se uma notificação disparar no meio de um sync — improvável.
3. **`react-email-editor` ausente bloqueia `next build`** — pré-existente, precisa de `pnpm install` antes do build/deploy (@devops).
4. **Migration 109 não aplicada** — colunas referenciadas (`sienge_contract_situations`, `distrato`) só existem após apply (Task 1, pendente @devops). Código falha em runtime contra schema sem a migration. Aplicar migration ANTES de deployar o código.
5. Sem testes unitários (integração externa Sienge; abordagem definida na story = smoke manual). `computeDistrato()` é função pura e seria facilmente testável caso @qa queira cobertura.

### File List
- `supabase/migrations/116_distrato_sienge_contrato_cancelado.sql` (criado — renumerada de 109 por @devops no deploy, ver changelog — @data-engineer, Task 1; apply pendente no deploy via @devops)
- `packages/web/src/lib/integrations/sienge/sync.ts` (modificado — @dev: `SITUACAO_DISTRATO` + `computeDistrato()`, `upsertVinculo()` com merge de situações + `distrato`, guard de invite, `reconcileDistratosForObra()` + `ReconcileResult`)
- `packages/web/src/lib/notificacoes.ts` (modificado — @dev: filtro de distrato via `sienge_customer_id` nos 3 canais)
- `packages/web/src/app/api/admin/obras/[obra_id]/sienge/reconcile-distratos/route.ts` (criado — @dev: POST remediação, admin/supervisor)
- `packages/web/src/app/api/admin/obras/[obra_id]/vinculos/[vinculo_id]/distrato/route.ts` (criado — @dev: PATCH reversão manual, admin)

---

## QA Results

### Review Date: 2026-06-25

### Reviewed By: Quinn (Test Architect)

### Veredicto: CONCERNS (não-bloqueante — proceder com awareness + smoke pós-deploy obrigatório)

Revisão de código real dos 5 arquivos da story + typecheck. Todos os 11 ACs estão
implementados e corretos no código. Typecheck limpo (3 erros, todos em
`visual-editor.tsx` por `react-email-editor` ausente — pré-existente e
não-relacionado à story; confirmado como único erro fora do escopo).

#### Rastreabilidade aos ACs
| AC | Resultado | Evidência |
|----|-----------|-----------|
| AC 1 — migration colunas | PASS | `JSONB DEFAULT '{}'` + `BOOLEAN DEFAULT FALSE`, `ADD COLUMN IF NOT EXISTS`, não-breaking/idempotente |
| AC 2 — merge JSONB por contrato | PASS | `{ ...existing, [contractNumber]: situation }` preserva outros contratos; chave `contract.number` (campo `documentId` não existe em `SiengeContract`) |
| AC 3 — distrato calculado | PASS | `computeDistrato`: `values.length > 0 && values.every(s => s === 'Cancelado')` |
| AC 4 — invite suprimido | PASS | guard `if (email && vinculoId && !distrato)`; `sienge_invite_sent_at` permanece NULL |
| AC 5 — contratos mistos ativo | PASS | 1 Emitido + 1 Cancelado → `every()` false → `distrato=false`; mapa vazio `{}` → false |
| AC 6 — deny-list (valores novos) | PASS | só `"Cancelado"` bloqueia; `"Rescindido"`/desconhecidos → false |
| AC 7 — notifyClientes filtra distratados | **CONCERNS** | correto no código (3 canais via `continue` antes de qualquer envio), mas eficácia depende de `users.sienge_customer_id` populado em runtime — ver DATA-001 |
| AC 8 — reconcile recalcula | PASS | reconstrói `situations` de `sienge_contract_numbers` × Sienge atual; retorna `{reconciled, distratados, errors}` |
| AC 9 — endpoint remediação | PASS | `requireAuth` + `requireRole(['admin','supervisor'])` + check `org_id` na obra |
| AC 10 — reversão admin | PASS | `requireAuth` + `requireRole(['admin'])` + `org_id` + validação `typeof distrato !== "boolean"` |
| AC 11 — reversão não altera dados | PASS | update só do boolean, escopo `id + obra_id`; nada deletado/criado |

#### Findings por severidade

**MEDIUM (não-bloqueante para o gate, mas crítico para o smoke pós-deploy):**
- **DATA-001 (AC 7):** O filtro de privacidade só bloqueia um portal user se
  `users.sienge_customer_id` estiver populado e coincidir com um cliente distratado.
  A ponte CRM→portal é exclusivamente `sienge_customer_id` (não há FK direta). Se
  algum dos 39 distratados existentes tiver `users.sienge_customer_id = NULL`, ele
  CONTINUARÁ recebendo notificações (falso-negativo — o exato bug que a story
  corrige). **Ação:** tornar a Task 6 bloqueante — após `reconcile-distratos`,
  asseverar que cada vínculo `distrato=true` tem o `sienge_customer_id` espelhado no
  `users` do portal e confirmar por teste real que esses clientes NÃO recebem.

**LOW (não-bloqueante):**
- **PERF-001 (AC 1/7):** `idx_cov_distrato WHERE distrato = FALSE` (vínculos ativos)
  não serve à query implementada `WHERE obra_id AND distrato = true` (distratados).
  Intenção divergiu entre @data-engineer e @dev. Tabela pequena → impacto
  desprezível. Sugestão: índice `WHERE distrato = TRUE` ou composto `(obra_id, distrato)`.
- **MNT-001 (AC 8):** `reconcileDistratosForObra()` carrega obra só por `id`, sem
  `org_id`; isolação de tenant garantida apenas pela rota chamadora. Risco latente se
  a função for reusada fora da rota. Sugestão: parâmetro `org_id` ou documentar contrato.
- **DOC-001 (AC 7):** comentário da migration diz `distrato IS NOT TRUE`, mas a
  implementação consulta `distrato = true`. Drift de documentação (ligado a PERF-001).

**INFO (reconhecido por @dev/@po, sem ação):**
- Janela transitória durante sync multi-contrato (estado final correto).
- Reconcile com contrato órfão → mapa `{}` → `distrato=false` (conservador).

#### Regressão (clientes não-Sienge)
PASS — portal user com `sienge_customer_id = null` → `sid == null` → `if (sid != null && ...)`
é falso → NÃO é pulado → recebe normalmente. Sem regressão para clientes que não vêm do Sienge.

#### Segurança
PASS — ambos os endpoints têm `requireAuth` + `requireRole` corretos, validação de
`org_id` na obra e (no PATCH) validação de input boolean + escopo `id + obra_id` (sem
cross-obra/cross-tenant). Migration não-breaking e idempotente.

#### Itens de deploy conhecidos (fora do escopo do código, @devops)
- Migration 109 PENDENTE de aplicação — aplicar ANTES de deployar o código (senão runtime falha).
- `next build` bloqueado só por `react-email-editor` ausente → `pnpm install` (ambiente).

### Gate Status

Gate: CONCERNS → docs/qa/gates/20.9-fix-distrato-contrato-cancelado-sienge.yml

### Change Log (QA)
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-25 | 1.4 | Quality gate executado. Veredicto CONCERNS (não-bloqueante): 11/11 ACs corretos no código, typecheck limpo. 1 finding MEDIUM (DATA-001: AC7 depende de `users.sienge_customer_id` populado → smoke pós-deploy obrigatório) + 3 LOW (PERF/MNT/DOC). Status InProgress → InReview. | Quinn (@qa) |
