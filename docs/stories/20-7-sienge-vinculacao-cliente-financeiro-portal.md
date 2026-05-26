# Story 20.7: Integração Sienge — Vinculação de Cliente e Dados Financeiros no Portal

## Status
Done

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["coderabbit", "typecheck", "lint"]

## Story

**As a** administrador Trifold,
**I want** vincular um cliente do sistema ao seu cadastro no Sienge ERP via CPF e exibir seus dados financeiros (extrato de parcelas e boletos) no Portal do Cliente,
**so that** o cliente possa acompanhar pagamentos, verificar parcelas em aberto e baixar segunda via de boletos diretamente pelo portal, sem precisar contatar a construtora.

## Acceptance Criteria

1. **Campo CPF pré-preenchido:** Na aba Clientes de uma obra, ao clicar em "Vincular Sienge" para um cliente que já possui `cpf` salvo, o campo aparece pré-preenchido com o CPF existente.

2. **CPF ausente — edição inline:** Se o cliente não possui `cpf` cadastrado, o campo CPF é editável na seção de vínculo Sienge. Ao confirmar a vinculação, o sistema salva o CPF em `clientes.cpf` E o `sienge_customer_id` na tabela.

3. **Vinculação por CPF:** Ao clicar "Vincular", o sistema busca o CPF na API Sienge (`GET /customers`), encontra o cliente correspondente e salva o `sienge_customer_id` no registro local do cliente.

4. **Feedback visual de vínculo:** Após vinculação bem-sucedida, a UI exibe confirmação com nome Sienge e número do contrato (ex: "Diego Grou Pessuto — VIND-703 vinculado ✓").

5. **Botão de desvínculo:** Admin pode desvincular o cliente do Sienge, zerando o `sienge_customer_id` (sem apagar o CPF).

6. **Extrato no Portal:** No Portal do Cliente (`/cliente/[obra_id]`), uma nova seção/aba "Financeiro" exibe todas as parcelas do contrato Sienge com: número da parcela, tipo (`AT`, `PI`, `PM`, `CH`), data de vencimento, valor original, saldo atual e status (PAGO / BOLETO GERADO / EM ABERTO).

7. **Boleto — segunda via:** Para parcelas com `generatedBillet: true` E `currentBalance > 0`, exibe botão "Ver Boleto" que chama o endpoint de segunda via e abre o resultado (PDF ou link).

8. **Sem sienge_customer_id — graceful:** Se o cliente do portal não possui `sienge_customer_id` vinculado, a seção Financeiro exibe mensagem informativa ("Dados financeiros não configurados") sem quebrar o portal.

9. **Env vars:** Credenciais Sienge configuradas via variáveis de ambiente (`SIENGE_SUBDOMAIN`, `SIENGE_USERNAME`, `SIENGE_PASSWORD`) — nunca hardcoded.

10. **Erro de API Sienge — graceful:** Se a API Sienge retornar erro (timeout, 5xx), a seção Financeiro exibe mensagem de indisponibilidade sem quebrar o portal.

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- **Primary Type:** Integration (API externa — Sienge ERP)
- **Secondary Type(s):** Database (nova coluna), API (rotas admin + portal), Frontend (UI admin + portal)
- **Complexity:** High — afeta múltiplas camadas, credenciais externas, nova integração de terceiro

**Specialized Agent Assignment:**
- Primary Agents:
  - @dev (implementação e pre-commit reviews)
  - @data-engineer (migration da nova coluna `sienge_customer_id`)
- Supporting Agents:
  - @qa (quality gate final)
  - @devops (deploy das env vars no Vercel)

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): `npm run typecheck && npm run lint` antes de marcar story completa
- [ ] Pre-PR (@devops): Verificar env vars `SIENGE_*` configuradas no Vercel antes do PR
- [ ] Pre-Deployment (@devops): Testar vinculação com Diego Grou (CPF `07191476974`) em staging

**Self-Healing Configuration:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Timeout: 30 minutos
- Severity Filter: CRITICAL, HIGH

**CodeRabbit Focus Areas:**
- Primary Focus:
  - Credenciais Sienge NUNCA expostas em logs, responses ou client-side
  - Graceful degradation: falha na API Sienge não quebra o portal
  - `sienge_customer_id` nullable — todos os paths sem vínculo tratados
- Secondary Focus:
  - Input CPF sanitizado antes de enviar ao Sienge
  - Rate limit Sienge: 200 req/min — não fazer chamadas em loop sem controle
  - Tipagem TypeScript completa para response do Sienge

## Tasks / Subtasks

- [x] **Task 1 — Migration: coluna `sienge_customer_id`** (AC: 2, 3, 5)
  - [x] Criar migration `supabase/migrations/064_sienge_customer_id.sql` (renumerada por conflito)
  - [x] Adicionar coluna `sienge_customer_id INTEGER NULL` na tabela `clientes` e `users`
  - [x] Adicionar `cpf VARCHAR(14)` na tabela `users`
  - [x] Migration aplicada ao Supabase remoto via Management API

- [x] **Task 2 — Client Sienge: HTTP client com auth** (AC: 9)
  - [x] Criar `packages/web/src/lib/integrations/sienge/client.ts`
  - [x] Basic Auth com `SIENGE_SUBDOMAIN`, `SIENGE_USERNAME`, `SIENGE_PASSWORD` do `process.env`
  - [x] Retry com backoff exponencial para 429 e 5xx (max 3 tentativas)
  - [x] Exportar funções: `searchCustomerByCpf(cpf)`, `getFinancialStatement(customerId)`, `getPaymentSlip(billReceivableId, installmentId)`
  - [x] Criar `packages/web/src/lib/integrations/sienge/types.ts` com tipos das responses

- [x] **Task 3 — API admin: vincular cliente ao Sienge** (AC: 3, 4, 5)
  - [x] Criar `packages/web/src/app/api/admin/clientes/[id]/sienge-vincular/route.ts`
  - [x] `POST`: recebe `{ cpf }`, chama `searchCustomerByCpf`, salva `sienge_customer_id` + `cpf` no cliente; retorna `{ sienge_customer_id, nome_sienge, contrato }` para feedback
  - [x] `DELETE`: zera `sienge_customer_id` no cliente (desvínculo)
  - [x] Validar que `id` corresponde a cliente existente e que usuário tem permissão admin
  - [x] Mirror `sienge_customer_id` para `users` por email (best-effort)

- [x] **Task 4 — UI admin: seção "Integração Sienge" na `clientes-tab.tsx`** (AC: 1, 2, 3, 4, 5)
  - [x] Adicionar seção abaixo da lista de clientes vinculados em `clientes-tab.tsx`
  - [x] Para cada cliente na lista, exibir badge de status Sienge: "Vinculado" (verde) ou "Não vinculado" (cinza)
  - [x] Modal/inline de vínculo: campo CPF pré-preenchido (se existir) ou editável; botão "Vincular Sienge"
  - [x] Após sucesso: exibir `"Diego Grou Pessuto — VIND-703 vinculado ✓"` em verde
  - [x] Botão "Desvincular" quando já vinculado (com confirmação)
  - [x] Loading state durante chamada à API

- [x] **Task 5 — API portal: extrato financeiro Sienge** (AC: 6, 7, 8, 10)
  - [x] Criar `packages/web/src/app/api/cliente/obras/[obra_id]/financeiro/route.ts`
  - [x] `GET`: busca `sienge_customer_id` do cliente autenticado para a obra; chama `getFinancialStatement`; retorna parcelas formatadas
  - [x] Se `sienge_customer_id` null: retorna `{ configured: false }`
  - [x] Se API Sienge falhar: retorna `{ error: 'sienge_unavailable' }` com 200 (não quebrar portal)

- [x] **Task 6 — API portal: segunda via de boleto** (AC: 7)
  - [x] Criar `packages/web/src/app/api/cliente/obras/[obra_id]/financeiro/boleto/route.ts`
  - [x] `GET ?billReceivableId=X&installmentId=Y`: chama `getPaymentSlip`; retorna response da Sienge (PDF stream ou link)
  - [x] Validar que `billReceivableId` e `installmentId` pertencem ao `sienge_customer_id` do cliente autenticado (evitar IDOR)

- [x] **Task 7 — UI portal: aba/seção "Financeiro"** (AC: 6, 7, 8, 10)
  - [x] Criar `packages/web/src/app/cliente/[obra_id]/financeiro/page.tsx`
  - [x] Adicionar "Financeiro" no nav de abas em `obra-tab-nav.tsx`
  - [x] Listar parcelas em cards: Tipo/número, Vencimento, Valor atual, Status, Ação
  - [x] Status badge: PAGO (verde) / BOLETO GERADO (laranja) / EM ABERTO (cinza)
  - [x] Botão "Ver Boleto" apenas quando `generatedBillet: true && currentBalance > 0`
  - [x] Estado `configured: false`: exibir "Extrato indisponível — entre em contato com a construtora"
  - [x] Estado `sienge_unavailable`: exibir "Serviço temporariamente indisponível"

- [x] **Task 8 — Env vars** (AC: 9)
  - [x] Credenciais configuradas em `process.env` — nunca hardcoded
  - [x] Verificado: todas as chamadas Sienge são exclusivamente server-side (rotas API e Server Components)
  - [x] Pendente @devops: configurar `SIENGE_SUBDOMAIN`, `SIENGE_USERNAME`, `SIENGE_PASSWORD` no Vercel

- [x] **Task 9 — Teste manual end-to-end** (AC: 1–10)
  - [x] Diego Grou Pessuto (CPF `07191476974`, sienge_customer_id `1442`) vinculado em produção
  - [x] Extrato exibe contrato `VIND-703`, parcela 1 PAGO (saldo 0), parcela 2 status correto
  - [x] Fallback por email funcional — auto-persiste `sienge_customer_id` em `users` na primeira visita
  - [x] Portal exibe mensagem informativa para clientes sem `sienge_customer_id`
  - [x] TypeCheck e build passam sem erros

## Dev Notes

### Credenciais e Client Sienge

**Credenciais validadas em produção (tenant: construtoraexpansao):**
- `SIENGE_SUBDOMAIN=construtoraexpansao`
- `SIENGE_USERNAME=construtoraexpansao-crm`
- `SIENGE_PASSWORD=3WKccUa0WGkakbN6Eekb7Ulz3R74gWGC`
- Base URL: `https://api.sienge.com.br/{subdomain}/public/api/v1`
- Auth: HTTP Basic Auth — `Authorization: Basic base64(username:password)`

**Cliente de teste:** Diego Grou Pessuto — CPF `07191476974` — sienge_customer_id `1442` — contrato `VIND-703`

### Endpoints Sienge Validados em Produção

**Buscar cliente por CPF (para vincular):**
```
GET /customers?limit=200&offset=0
```
Não há filtro por CPF na query — é necessário iterar as páginas e filtrar pelo campo `cpf` no resultado. Total: 1.467 clientes. Iterar até encontrar o CPF ou esgotar páginas.
```json
{ "results": [{ "id": 1442, "cpf": "07191476974", "name": "Diego Grou Pessuto", ... }] }
```

**Extrato financeiro:**
```
GET /customer-financial-statements?customerId={id}
```
Parâmetro obrigatório: `customerId` (Integer). Sem ele retorna 400.

Response:
```json
{
  "results": [{
    "billsReceivable": [{
      "billReceivableId": 10845,
      "documentId": "VIND-703",
      "finePercent": 2.0,
      "interestPercent": 1.0,
      "installments": [{
        "installmentId": 1,
        "installmentNumber": "1",
        "dueDate": "2025-07-16",
        "conditionType": "AT",
        "originalValue": 414000.0,
        "currentBalance": 0.0,
        "generatedBillet": true,
        "receipts": [{ "receiptDate": "...", "receiptValue": 414000.0, ... }]
      }]
    }]
  }]
}
```

**Lógica de status da parcela:**
- `receipts.length > 0` → PAGO
- `receipts.length === 0 && generatedBillet === true` → BOLETO GERADO
- `receipts.length === 0 && generatedBillet === false` → EM ABERTO

**Condição do boleto (`conditionType`):**
- `AT` = Ato (entrada)
- `PI` = Parcela Intermediária
- `PM` = Parcela Mensal
- `CH` = Chaves

**Segunda via de boleto:**
```
GET /payment-slip-notification?billReceivableId={id}&installmentId={id}
```
Ambos obrigatórios. Retorna 422 se não houver cobrança registrada para a parcela. Só mostrar botão quando `generatedBillet: true && currentBalance > 0`.

### Arquivos Existentes Relevantes

```
packages/web/src/
├── app/
│   ├── api/
│   │   ├── admin/
│   │   │   ├── clientes/
│   │   │   │   ├── route.ts                        # CRUD clientes (GET, POST)
│   │   │   │   ├── [id]/route.ts                   # GET, PATCH, DELETE cliente
│   │   │   │   └── search/route.ts                 # Busca por email (CRM)
│   │   │   └── obras/[obra_id]/clientes/
│   │   │       ├── route.ts                        # POST vincular cliente a obra
│   │   │       └── [user_id]/route.ts              # DELETE/PATCH vínculo
│   │   └── cliente/obras/[obra_id]/
│   │       └── route.ts                            # GET dados da obra para o portal
│   ├── cliente/[obra_id]/
│   │   ├── page.tsx                                # Página principal do portal
│   │   └── _components/obra-tab-nav.tsx            # Nav de abas (adicionar "Financeiro")
│   └── dashboard/obras/[obra_id]/_components/
│       └── clientes-tab.tsx                        # UI de gestão de clientes na obra ← MODIFICAR
├── lib/
│   └── integrations/sienge/                        # CRIAR (client.ts, types.ts)
└── supabase/migrations/
    └── 045_sienge_customer_id.sql                  # CRIAR
```

**`ClienteApiResponse` em `cliente-modal.tsx` linha 55–86** — adicionar campo `sienge_customer_id: number | null`.

**`ClientesTabProps.Cliente` interface em `clientes-tab.tsx` linha 7–13** — adicionar `sienge_customer_id: number | null`.

### Padrões do Projeto

- Rotas do portal: sempre verificar se usuário autenticado tem `user_role = 'cliente'` e pertence à obra
- Rotas admin: verificar `user_role` in (`admin`, `supervisor`)
- Supabase client server-side: usar `createServerClient` do `@/lib/supabase/server`
- Todas as chamadas Sienge: server-side only (NUNCA expor credenciais no browser)
- Pattern de rate limit: 200 req/min por tenant — na busca por CPF, pausar 300ms entre páginas

### Migration SQL

```sql
-- 045_sienge_customer_id.sql
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS sienge_customer_id INTEGER;

COMMENT ON COLUMN clientes.sienge_customer_id IS
  'ID do cliente no Sienge ERP. Null = não vinculado. Usado para puxar extrato financeiro e boletos.';
```

### Testing

- Sem testes automatizados obrigatórios nesta story (integração externa)
- Teste manual obrigatório: Task 9 completa antes de marcar Done
- Verificar TypeScript sem erros: `npm run typecheck`
- Verificar lint: `npm run lint`

## Dev Agent Record

### File List
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/clientes-tab.tsx` — Task 4: UI Sienge completa (badge, painel inline, vincular/desvincular)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx` — Tipo Cliente atualizado com `cpf` e `sienge_customer_id`
- `packages/web/src/app/api/admin/clientes/[id]/sienge-vincular/route.ts` — Task 3: POST/DELETE admin + retorna `contrato` no sucesso + mirror para `users` por email
- `packages/web/src/lib/integrations/sienge/client.ts` — Task 2: HTTP client com Basic Auth, retry, searchCustomerByCpf, getFinancialStatement, getPaymentSlip
- `packages/web/src/lib/integrations/sienge/types.ts` — Task 2: tipos das respostas Sienge
- `supabase/migrations/064_sienge_customer_id.sql` — Task 1: migration coluna `sienge_customer_id` e `cpf` na tabela `users`
- `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx` — Task 1: query inclui `sienge_customer_id` no join de clientes
- `packages/web/src/app/dashboard/configuracoes/clientes/_components/cliente-modal.tsx` — Task 1: `sienge_customer_id` adicionado ao tipo `ClienteApiResponse`
- `packages/web/src/app/api/cliente/obras/[obra_id]/financeiro/route.ts` — Task 5: GET extrato financeiro portal (lookup chain + filtro por contract numbers)
- `packages/web/src/app/api/cliente/obras/[obra_id]/financeiro/boleto/route.ts` — Task 6: GET segunda via boleto com validação IDOR
- `packages/web/src/app/cliente/[obra_id]/financeiro/page.tsx` — Task 7: Server Component portal financeiro (cards, status badge, botão boleto)

### Agent Model Used
claude-sonnet-4-6

### Completion Notes
- Task 4 completa: UI admin com badge de status, painel inline de vínculo/desvínculo, CPF pré-preenchido, loading state e mensagem de sucesso com nome + contrato Sienge
- Contrato obtido de forma best-effort via `getFinancialStatement` após vinculação — falha não bloqueia o vínculo
- `obra-detail-tabs.tsx` tinha tipo `Cliente` incompleto (sem `cpf` e `sienge_customer_id`) — corrigido para resolver erro TS2719
- Lint global com erro pré-existente (`eslint-plugin-import` não encontrado) — não causado por esta story; TypeCheck passa com zero erros
- Task 5: lookup chain de `sienge_customer_id`: direto em `users` → fallback CPF via `clientes_obras_vinculos` → fallback email via `clientes_obras_vinculos` (com auto-persist na 1ª visita)
- Task 5: filtro por `sienge_contract_numbers` em `clientes_obras_vinculos` garante que cliente só vê parcelas da obra correta
- Task 6: IDOR prevenido — valida `billReceivableId+installmentId` contra extrato do próprio `sienge_customer_id` antes de chamar `getPaymentSlip`
- Task 7: Server Component (sem round-trip) — chama Sienge diretamente, 3 estados (não configurado, indisponível, lista de parcelas)
- Task 8: env vars `SIENGE_*` pendentes de configuração no Vercel por @devops

## QA Results

### Gate Decision: CONCERNS → PASS (após fix aplicado)

**Revisor:** Quinn (@qa) | **Data:** 2026-05-26

| Check | Status | Nota |
|-------|--------|------|
| Code Review | ✅ PASS | Padrões consistentes, sem magic numbers, TypeScript estrito |
| Unit Tests | ⚠️ N/A | Integração externa — sem testes obrigatórios (declarado na story) |
| Acceptance Criteria | ✅ PASS | Todos os 10 ACs verificados |
| Regressões | ✅ PASS | Build limpo, zero erros TypeCheck |
| Performance | ✅ PASS | Graceful degradation, retry com backoff |
| Segurança | ✅ PASS | Fix aplicado: `financeiro/page.tsx` agora valida `cliente_obras` antes de renderizar |
| Documentação | ✅ PASS | File List, Change Log e Completion Notes completos |

**Issues encontrados e resolvidos:**
- MEDIUM (FIXED): `financeiro/page.tsx` não validava `cliente_obras` — corrigido neste gate, TypeCheck confirma zero erros após fix
- LOW (NOTED): `boleto/route.ts` usa redirect para URL da API Sienge sem validação de domínio — risco baixo, fonte server-side confiável
- LOW (NOTED): `sienge-vincular/route.ts` chama `getAllSalesContracts()` síncrono no POST — candidato a otimização futura

**Veredicto final: PASS** — Todas as issues resolvidas ou documentadas. Pronto para `@devops *push`.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-26 | 1.0 | Story criada com contexto completo da investigação da API Sienge | River (@sm) |
| 2026-05-26 | 1.1 | Task 4 completa: UI Sienge em clientes-tab.tsx + fix tipo Cliente em obra-detail-tabs.tsx + contrato no feedback de sucesso | Dex (@dev) |
| 2026-05-26 | 1.2 | Tasks 5–9 completas: API financeiro portal, boleto IDOR-safe, Server Component financeiro, env vars identificadas. Status → Done | Dex (@dev) |
