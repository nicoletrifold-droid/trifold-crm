# ADR-007: Medição de Consumo de IA — Ponto de Interceptação e Unidade de Cota

- **Status:** **Proposed** — a unidade de cota e a política de 100% precisam de sign-off do dono do produto (questões Q1, Q2, Q2b de `saas-multi-tenant.md` §11.3)
- **Data:** 2026-07-29
- **Decisor técnico:** @architect (Aria)
- **Documento pai:** `docs/architecture/saas-multi-tenant.md` §5
- **Código afetado:** `packages/ai/src/client/anthropic.ts`, `packages/ai/src/usage/**` (novo), `packages/web/src/lib/revenue/**` (novo), 12 call sites

---

## Contexto

Decisão de produto: as chaves de IA são da Trifold e o cliente paga pelo uso. Cada plano inclui uma cota mensal; ao passar, gera excedente por faixa. Requisitos: medição por org (tokens/custo real por chamada), alerta em 80%, política de corte/degradação em 100%.

Estado atual:

- **Nenhuma tabela em 192 migrations tem `input_tokens`/`output_tokens`/custo por chamada.** Consumo de IA hoje não é medido por org de forma alguma.
- O único dado de custo existente é agregado da conta inteira, coletado pelo `api/cron/billing-collect-anthropic` do Epic 78 (`ANTHROPIC_ADMIN_KEY`).
- Existe **um único ponto de criação de client Anthropic**: `createAnthropicClient()` em `packages/ai/src/client/anthropic.ts`. Verificado: `new Anthropic(` não aparece em nenhum outro arquivo-fonte. Os 12 consumidores reais (4 rotas de lead/mensagem, 2 webhooks, 3 crons, `agent/chat`, `visit-feedback-core`, `pastas/termo/extract`) passam todos por essa fábrica, e os 9 arquivos de `packages/ai` que chamam `messages.create` recebem o client de fora.
- As strings de modelo já foram centralizadas em `ANTHROPIC_MODELS` pela Story 82-1.
- Prompt cache é opcional via `ANTHROPIC_PROMPT_CACHE_ENABLED` (7 usos) — cache hit é ~10× mais barato.
- A Nicole roda em produção real, atendendo leads. Não existe staging.

## Decisão

### 1. Interceptação na fábrica do client

```ts
export function createAnthropicClient(ctx?: AiUsageContext): Anthropic {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  if (!ctx) return client
  return withUsageMetering(client, ctx)   // Proxy sobre messages.create
}
```

`withUsageMetering` embrulha `messages.create`, lê `response.usage` (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`) e `response.id`, e chama o sink. Em `stream: true`, acumula o `usage` do `message_delta`/`message_stop` e registra no fim do stream.

Como `packages/ai` não pode depender de `packages/web` nem do Supabase, a persistência entra por **sink injetado** (`setAiUsageSink`), com no-op como default. `packages/web` registra o sink Supabase no boot.

`ctx` é **opcional de propósito**: permite migrar os 12 call sites incrementalmente e garante que esquecer um não quebra nada (só perde métrica). A lacuna é coberta pela regra **R7** do gate de CI — nenhum arquivo em `app/api/**` pode chamar `createAnthropicClient()` sem contexto.

Equivalente para OpenAI (`createOpenAIClient(ctx)`) cobrindo os embeddings do RAG (`packages/ai/src/rag/embeddings.ts`).

### 2. Unidade de cota: crédito = custo real

**`1 crédito = US$ 0,001 de custo real do provider`**, ou seja `billable_credits = cost_micro_usd / 1000`, calculado por price table versionada por data de vigência (`packages/web/src/lib/revenue/ai-price-table.ts`).

| Alternativa | Por que não |
|---|---|
| **Tokens** | não são comparáveis entre modelos (Sonnet ≈ 15× Haiku por token). Um cliente que usa mais análise de comportamento consumiria "menos tokens" e custaria mais. E qualquer troca de modelo quebraria a cota vendida |
| **Interações/mensagens** | esconde variância enorme (conversa longa com contexto grande custa ~20× uma curta) e não protege a Trifold |
| **Custo em BRL** | amarra a cota à variação do dólar dentro do ciclo |

Crédito-sobre-custo é estável quando trocamos de modelo, quando ligamos prompt cache (e aí o **cliente se beneficia automaticamente**, o que é o incentivo certo) e quando entra provider novo. Na UI o número é traduzido para "≈ N atendimentos", derivado da média móvel de créditos por conversa dos últimos 30 dias **da própria org** — número honesto, não inventado.

### 3. Três níveis de agregação

`ai_usage_events` (append-only, particionada por mês, retenção de 13 meses) → `ai_usage_daily` (rollup, é o que a UI lê) → `org_billing_periods` (**1 linha por org por ciclo**, é o contador quente).

A RPC `record_ai_usage()` faz as três escritas na mesma transação, e marca os cruzamentos de limiar de forma idempotente com `COALESCE(alert_80_at, CASE WHEN … THEN now() END)` — sem trigger extra e sem race (o `UPDATE` pega row lock).

O motivo dos três níveis: o caminho quente da Nicole precisa ler **exatamente uma linha** para decidir se pode chamar o modelo. Sem `org_billing_periods`, cada mensagem viraria um `SUM()` sobre a partição do mês.

A RPC **não** notifica (banco não faz I/O externo). O cron `api/cron/ai-quota-notify` varre a cada 15 min e dispara — mesmo padrão dos lembretes do Epic 78 (`service_billing_reminders_last_alerted`).

### 4. Política no 100%

Default **`overage`** para `active`; **`hard_stop`** para `trial`; `degrade` disponível como opção de plano.

| Veredito | Nicole (chat) | Flows opcionais (behavior-analysis, memory-extraction, post-visit-followup, enrich) | Modelo |
|---|---|---|---|
| `normal` / `warn` (≥80%) | responde | rodam | como hoje |
| `overage` (≥100%) | responde | rodam | como hoje; excedente vai para a fatura |
| `degrade` (≥100%) | responde | **desligados** | Sonnet → Haiku |
| `blocked` (`hard_stop`/`hard_cap`/`suspended`) | **não chama LLM**; mensagem estática de handoff + alerta ao corretor | desligados | — |

Racional do default `overage`: cortar a Nicole no meio de uma conversa custa uma venda ao cliente por causa de dezenas de reais, e a culpa recai sobre a Trifold. Excedente é a política saudável para cliente pagante. Em trial o corte é o mecanismo de conversão, então lá `hard_stop` faz sentido.

A degradação Sonnet→Haiku só é viável porque as strings de modelo já estão centralizadas (Story 82-1): o seletor passa a ser `pickModel(tier, verdict)`.

**Válvula independente da política comercial:** `plans.ai_hard_cap_multiplier` (default 3×). Ao atingir 3× a cota no ciclo, bloqueia mesmo em `overage` e alerta a Trifold com urgência. Isso não é regra de venda, é proteção contra loop de bug — a chave é da Trifold e a fatura também.

### 5. Falha aberta, sempre

O sink nunca relança. Qualquer erro de medição é `console.error` e segue. Métrica perdida é prejuízo pequeno; conversa perdida é prejuízo grande.

**Gotcha de serverless:** promise soltas com `void` morrem quando a Vercel encerra a função após a resposta (já mordeu o projeto na Story 75-139). Portanto: rotas request-scoped usam `after()` do `next/server`; webhooks e crons dão `await` no insert (custo desprezível ao lado da chamada de LLM).

### 6. Rollout: shadow → reconciliação → enforcement

`AI_QUOTA_ENFORCEMENT ∈ {off, shadow, on}`, default inicial `shadow`. Em `shadow` o sink grava tudo e `checkAiQuota` calcula e loga o veredito, mas sempre retorna `normal`. Qualquer valor não reconhecido é tratado como `off` (fail-safe explícito — a env var precisa ser gravada por `scripts/vercel-env-set.sh`, nunca por `vercel env add` via stdin, que grava vazio em silêncio).

**Critério de aceite para sair de `shadow`:** por 14 dias consecutivos, `SUM(ai_usage_events.cost_micro_usd)` do período fica dentro de **±5%** do valor coletado por `api/cron/billing-collect-anthropic`. Divergência maior significa consumo não instrumentado (call site sem `ctx`) ou price table errada — nos dois casos, cobrar seria errado.

Essa reconciliação é o achado mais valioso deste ADR: o Epic 78 já coleta o gasto real da conta Anthropic, o que dá um **oráculo gratuito** para validar a medição contra tráfego de produção real — exatamente o que a ausência de staging tornava impossível de outra forma.

Ordem de ativação: Trifold Sandbox → clientes → Trifold por último. A Trifold entra com plano `is_internal = true`, cota alta e hard cap generoso: se o gate tiver bug de cálculo, a operação da empresa não para.

## Alternativas consideradas para o ponto de interceptação

| Alternativa | Por que não |
|---|---|
| Instrumentar os 9 arquivos de `packages/ai` que chamam `messages.create` | 9 pontos em vez de 1, e cada flow novo precisa lembrar. A fábrica é o gargalo natural |
| Proxy HTTP / gateway de LLM próprio | infra nova para operar, latência extra no caminho da Nicole, e não resolve atribuição de org (que é contexto de aplicação, não de rede) |
| Só o coletor do Epic 78 (rateio por proporção de mensagens) | não atribui custo real por org; um cliente com prompts grandes subsidiaria os outros; sem granularidade por feature; sem base para cobrar excedente |
| Middleware do SDK Anthropic | o SDK não expõe hook de middleware estável; `Proxy` sobre a instância é mais simples e testável |

## Consequências

**Positivas:** um ponto de interceptação cobre 100% do consumo Anthropic; atribuição por org, feature, modelo, lead e usuário permite o cliente auditar a própria conta e a Trifold ver margem por org (`org_billing_periods.cost_micro_usd` ao lado de `overage_amount_cents`); prompt cache e troca de modelo beneficiam o cliente sem renegociar cota; o rollout em shadow com reconciliação valida a medição contra produção real sem staging.

**Negativas e aceitas:**
- `packages/ai/src/client/anthropic.ts` passa a ser um dos três arquivos mais críticos do sistema: se o proxy lançar, a Nicole para. `try/catch` em volta de tudo e teste do caminho de falha são obrigatórios.
- Um INSERT a mais por chamada de LLM (irrelevante ao lado de ~1-3s de latência do modelo).
- `org_billing_periods` é 1 linha por org por mês com ~1 UPDATE por chamada. Contenção só apareceria com dezenas de req/s por tenant; a mitigação (buffer de 10s no processo antes de tocar o contador) fica **diferida** e documentada.
- Créditos são menos intuitivos comercialmente que "atendimentos" — resolvido na UI, não no modelo.
- Ainda faltam os números comerciais (Q2b): preço por 1.000 créditos excedentes e faixas. Sem eles a medição funciona mas o excedente não é faturável.
