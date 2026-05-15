# Nicole Data Layer Refactor — Architecture Design

> **Authors:** @architect (Aria)
> **Date:** 2026-05-15
> **Status:** Draft → consumível por `@sm *draft`
> **Risk class:** HIGH (Nicole é a face do produto em produção)
> **Branch policy:** SDC completo, sem atalho

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Análise de Impacto (Inventário de Arquivos)](#2-análise-de-impacto-inventário-de-arquivos)
3. [Design da Nova Camada de Dados](#3-design-da-nova-camada-de-dados)
4. [Design dos Prompts Refatorados](#4-design-dos-prompts-refatorados)
5. [Design da UI do Painel](#5-design-da-ui-do-painel)
6. [Yarden Gate — Flexibilização](#6-yarden-gate--flexibilização)
7. [Plano de Migração](#7-plano-de-migração-zero-downtime-nicole)
8. [Proposta de Epic + Breakdown em Stories](#8-proposta-de-epic--breakdown-em-stories)
9. [Riscos e Mitigações](#9-riscos-e-mitigações)
10. [Apêndice A — Inconsistências Encontradas](#10-apêndice-a--inconsistências-encontradas-fora-do-escopo-original)
11. [Apêndice B — Perguntas ao Produto](#11-apêndice-b--perguntas-ao-produto)

---

## 1. Executive Summary

A Nicole tem hoje **três fontes de verdade** para regras de negócio dos empreendimentos (código hardcoded em prompts, tabela `properties`, tabela `knowledge_base`), e essa divergência já está visível em produção: um briefing simples de mudar status, amenidade ("Fire Pit" → "Fireplace") e política de entrada (20% → 10%, "80 mil" → "40 mil") exige editar arquivos `.ts`, abrir PR, esperar deploy e ainda assim a Nicole pode falar coisas diferentes do que está no painel admin.

O refactor proposto consolida **regras de negócio editáveis** em `properties.commercial_rules` (jsonb com sub-schema definido), refatora `property-presentation.ts` e `qualification.ts` para serem **templates instrucionais** (COMO falar) e move 100% dos **valores** (% entrada, exemplos, opções de financiamento, status, amenidades) para o DB via injeção em `buildPropertyDataContext()` no pipeline.

A flexibilização do **Yarden Gate** transforma um bloqueio duro (`blocked: true` → "vai pro Vind") em um **sinalizador de contexto** que enriquece o prompt mas não fecha a porta: Nicole oferece consórcio contemplado, sugere Vind como alternativa mais imediata, e continua qualificando o lead para Yarden se ele insistir.

O risco operacional é dominado por três frentes: **(a)** o bloco estático do prompt cacheável (que hoje hospeda os dados hardcoded) precisa permanecer ≥ 1024 tokens para preservar o cache hit ratio do Anthropic ephemeral cache (caso contrário custo sobe ~10×); **(b)** os testes determinísticos em `qualification.test.ts`, `yarden-gate.test.ts`, `pipeline.test.ts` e `index.test.ts` foram escritos contra strings exatas e precisam ser atualizados com cuidado; **(c)** o backfill de `commercial_rules` precisa rodar **antes** da remoção do hardcoded — qualquer ordem invertida cria uma janela em que Nicole "esquece" regras críticas.

A proposta é um Epic com **9 stories** sequenciais, behind feature flag `NICOLE_RULES_FROM_DB`, com rollback de uma linha (`vercel env set NICOLE_RULES_FROM_DB false` + redeploy).

---

## 2. Análise de Impacto (Inventário de Arquivos)

Mapa exaustivo do que toca dados de empreendimento ou regras de negócio da Nicole. Cada item classificado por **camada** (DB / pipeline / prompts / flows / UI / scripts / testes) e **tipo de risco**.

### 2.1 Camada DB (Supabase)

| Path | Tipo | Risco | Mudança esperada |
|------|------|-------|------------------|
| `supabase/migrations/002_property_schema.sql` | DDL | NONE (read-only histórico) | — |
| `supabase/migrations/004_rls_policies.sql` | RLS | LOW (validar reuso das políticas existentes) | — (já há `properties_select` por org_id e `properties_manage` por admin/supervisor — adequado) |
| `supabase/migrations/043_property_commercial_rules_v2.sql` | **NOVA** | MEDIUM | Adiciona CHECK constraint validando sub-schema do jsonb. Ver Seção 3. Slots 040-042 ocupados por Epic 33 (Módulo CRM Clientes — Lucas, 2026-05-15). |
| `supabase/migrations/044_backfill_commercial_rules.sql` | **NOVA** | HIGH | UPDATE em Vind + Yarden com os novos campos. Idempotente via JSONB merge (`||`). |

**Estado atual da `properties.commercial_rules` em produção (lido via Management API em 2026-05-15):**
- Vind: `{ requires_down_payment: true, min_down_payment: 68000, mcmv_eligible: false }`
- Yarden: `{ requires_down_payment: true, mcmv_eligible: false }`

**Note**: Existe um campo `min_down_payment` (valor absoluto BRL, 68000) só no Vind — o seed-properties.ts (`packages/scripts/seed-properties.ts:36`) diverge do que está em produção (que aparentemente foi editado manualmente). Isso precisa ser resolvido no backfill.

### 2.2 Camada Pipeline (packages/ai/src/chat/)

| Path | Linhas-chave | Risco | Mudança esperada |
|------|--------------|-------|------------------|
| `packages/ai/src/chat/pipeline.ts` | 83-113 (interface Property) | LOW | Estender `commercial_rules` com tipo forte |
| `packages/ai/src/chat/pipeline.ts` | 849-880 (`loadProperties`) | LOW | Já carrega `commercial_rules` — sem mudança |
| `packages/ai/src/chat/pipeline.ts` | 1072-1142 (`buildPropertyDataContext`) | **HIGH** | Substituir bloco trivial `if (rules.requires_down_payment)` por seção completa "REGRAS COMERCIAIS" |
| `packages/ai/src/chat/pipeline.ts` | 238-248 (Yarden gate plug-in) | MEDIUM | Mudar contrato: `blocked` → `flag` (ver Seção 6) |
| `packages/ai/src/chat/pipeline.test.ts` | 89 linhas, testa `hasConfirmedDay` apenas | LOW | Sem alteração — não toca prompts |

### 2.3 Camada Prompts (packages/ai/src/prompts/)

| Path | Conteúdo hardcoded | Risco | Mudança esperada |
|------|---------------------|-------|------------------|
| `packages/ai/src/prompts/property-presentation.ts` | Status Vind/Yarden, endereços, tipologias, diferenciais, **política de pagamento (20%, "80 mil")** | **CRITICAL** | Refactor completo: virar template puramente instrucional sobre tom/formato. Dados saem 100% pro DB. Ver Seção 4. |
| `packages/ai/src/prompts/qualification.ts` | Linha 33 ("entrada mínima 20%"), linha 35 ("80 mil"), linha 39 (regra Yarden) | **CRITICAL** | Linhas 33/35/39 viram referência ao DADO DINÂMICO. Texto explicativo do passo "entrada" simplificado. |
| `packages/ai/src/prompts/personality.ts` | "Vind e Yarden" em pelo menos 4 trechos (linhas 25, 75, 80, 83, 89) | MEDIUM | Substituir nomes por placeholder lógico: "nossos empreendimentos". O nome real vem injetado em `buildPropertyDataContext`. **MAS ATENÇÃO**: o exemplo de linguagem coloquial na linha 25 ("O Yarden é incrível") tem valor pedagógico para o tom — manter como exemplo, removendo a relevância semântica do nome. |
| `packages/ai/src/prompts/index.ts` | Orquestração + `buildStaticSystemContent()` | MEDIUM | Garantir que o bloco estático continue ≥ 1024 tokens pós-remoção dos dados. Ver Seção 9 (Risco 1). |
| `packages/ai/src/prompts/handoff-summary.ts` | Linha 18: "Empreendimento: [Vind / Yarden / Ambos / Indefinido]" | LOW | Genericizar: "Empreendimento: [nome / múltiplos / indefinido]" |
| `packages/ai/src/prompts/guardrails.ts`, `visit-scheduling.ts`, `off-hours.ts` | Sem dados de empreendimento | NONE | — |
| `packages/ai/src/prompts/index.test.ts` | 124 linhas, valida estrutura dos blocos + cache_control | MEDIUM | Os asserts em linhas 38-50 fazem `expect(text).toContain(SEDE_ADDRESS)` etc. Continuam válidos. Mas `expect(text.toLowerCase()).toContain("nicole")` permanece. Não vai quebrar. |

### 2.4 Camada Flows (packages/ai/src/flows/)

| Path | Hardcoded | Risco | Mudança esperada |
|------|-----------|-------|------------------|
| `packages/ai/src/flows/yarden-gate.ts` | Toda a função | **HIGH** | Refactor para `evaluateDownPaymentFlag` (genérico) — ver Seção 6 |
| `packages/ai/src/flows/identify-property.ts` | PROPERTY_KEYWORDS hardcoded por slug `vind`/`yarden` (linhas 13-26) | MEDIUM | Mover keywords pro DB: campo novo `properties.identification_keywords jsonb` (ou aproveitar o `concept`/`description` via similarity)? **DECISÃO**: adicionar `keywords` no `commercial_rules` (parte do mesmo bloco editável). Fallback: auto-gera por slug+nome (lógica já existe nas linhas 46-53). |
| `packages/ai/src/flows/qualification.ts` | Linha 133-142 — palavras "vind"/"yarden" hardcoded em `extractCollectedData` | MEDIUM | Refactor: receber `properties: Property[]` como param opcional. Loop sobre slugs. **Cuidado de compat**: a função é exportada e usada em vários lugares; sobrecarga via param opcional preserva contrato. |
| `packages/ai/src/flows/memory-extraction.ts` | Linhas 46-47, 148-153 — regex hardcoded "vind"/"yarden" e predicates `interested_in` | MEDIUM | Mesma estratégia: receber properties como param. Predicates `interested_in: <slug>` permanecem (já genéricos). |
| `packages/ai/src/memory/loader.ts` | Linhas 131-132 — `/vind/i`, `/yarden/i` retornam "room" `property_<slug>` | LOW | Loop sobre properties. |
| `packages/ai/src/memory/writer.ts` | Linha 39 — string literal "Rooms: visit_scheduling\|negotiation\|property_vind\|property_yarden\|qualification\|general" | LOW | Gerar dinamicamente. |
| `packages/ai/src/flows/haiku-enrichment.ts` | Linha 23 — `property_interest: "vind" \| "yarden"` no prompt | LOW | Gerar lista de slugs do DB no prompt builder (consumer já passa `properties` indiretamente via pipeline). |

### 2.5 Camada UI (packages/web/)

| Path | Risco | Mudança esperada |
|------|-------|------------------|
| `packages/web/src/app/dashboard/properties/[id]/edit/page.tsx` | **HIGH** | Substituir `<textarea>` de Regras Comerciais (linhas 391-397) por **formulário estruturado**: input numérico % entrada, input numérico valor exemplo, multi-select financing_options, checkboxes booleanos. Ver Seção 5. |
| `packages/web/src/app/api/properties/[id]/route.ts` | LOW (linha 78 já aceita `commercial_rules`) | Adicionar validação Zod do sub-schema (ver Seção 5) |
| `packages/web/src/app/api/properties/route.ts` | LOW | — |
| `packages/web/src/app/dashboard/treinamento/page.tsx` | NONE | Sem alteração necessária para o refactor. Knowledge base continua sendo um canal complementar (RAG). |
| `packages/web/src/components/pipeline/lead-card.tsx` | LOW (linhas 33-37, 86-87 — badges "vind"/"yarden") | DEFER (não-bloqueante) — quando 3º empreendimento aparecer, melhor virar `PROPERTY_BADGE` data-driven |
| `packages/shared/src/constants/lead-fields.ts` | LOW (linha 12 — `options: ["vind", "yarden", "both", "unknown"]`) | DEFER (não-bloqueante) — UI de edição de lead. |

### 2.6 Scripts (scripts/)

| Path | Risco | Mudança esperada |
|------|-------|------------------|
| `scripts/seed-properties.ts` | MEDIUM | Atualizar para popular o novo schema `commercial_rules` completo com os valores corretos. **Inconsistência detectada**: linha 36 diz `requires_down_payment: false` para Vind, mas o DB em produção tem `true`. Verdade no DB. Corrigir script para alinhar com produção. |
| `scripts/seed-knowledge-base.ts` | LOW | Sem alteração necessária. Entradas como "Valor da entrada" continuam genéricas. |

### 2.7 Testes (packages/ai/src/)

| Path | LOC | Risco | Mudança esperada |
|------|-----|-------|------------------|
| `packages/ai/src/prompts/index.test.ts` | 124 | MEDIUM | Asserts atuais (`text.toLowerCase()).toContain("nicole")`, `text).toContain(SEDE_ADDRESS)`) **sobrevivem**. Adicionar teste: bloco estático ≥ PROMPT_CACHE_MIN_TOKENS pós-refactor. |
| `packages/ai/src/flows/yarden-gate.test.ts` | 52 | **HIGH** | Função muda contrato. Renomear arquivo para `down-payment-flag.test.ts`. Substituir todos os asserts. Ver Seção 6. |
| `packages/ai/src/flows/qualification.test.ts` | 374 | MEDIUM | Testes 174-187 (`extractCollectedData` extraindo "vind"/"yarden") **continuam válidos** porque os slugs reais são `vind-residence` e `yarden` — mas o teste verifica strings curtas. Se `extractCollectedData` receber `properties[]` como param novo (default = legacy hardcoded), tests passam sem alteração. |
| `packages/ai/src/flows/identify-property.test.ts` | 98 | LOW | Tests usam mocks de properties — independentes do refactor de keywords. |
| `packages/ai/src/flows/haiku-enrichment.test.ts` | 106 | LOW | Mocks de Claude — independentes. |
| `packages/ai/src/flows/memory-extraction.test.ts` | — | MEDIUM | Linhas 173-180 testam predicates `interested_in: vind`/`yarden`. Permanecem se mantivermos compat. |
| `packages/ai/src/memory/loader.test.ts` | — | LOW | Mock de "rooms" — mock deve passar a usar properties da fixture. |
| `packages/ai/src/chat/pipeline.test.ts` | 89 | NONE | Só testa `hasConfirmedDay` — não toca prompts/properties. |

### 2.8 Dependências cruzadas e ordem de execução

```
Migration 043 (DDL) ──► Migration 044 (Backfill) ──► UI estruturada (Story 5)
                            │                                  │
                            └──► pipeline buildPropertyDataContext expansion (Story 4)
                                              │
                                              └──► prompts refactor (Story 6)
                                                              │
                                                              └──► Yarden Gate flex (Story 7)
                                                                              │
                                                                              └──► Tests + Cache audit (Story 8 + 9)
```

---

## 3. Design da Nova Camada de Dados

### 3.1 Decisão: jsonb estendido ou tabela própria?

**Avaliados:**

| Opção | Prós | Contras |
|-------|------|---------|
| **A. Estender `commercial_rules` jsonb** | Zero migration de schema (já existe). Backward compat. Diff de PR pequeno. | Sem validação forte. UI precisa Zod schema. Não tem RLS granular por campo. |
| **B. Criar `property_business_rules` table 1:1** | Validação forte por coluna. RLS granular possível. Auditoria por coluna via triggers. | +1 join em todo `loadProperties`. Migration de schema + backfill. Não escalável se cada empreendimento tem campos diferentes (extensibilidade ruim). |
| **C. Híbrido: jsonb com CHECK constraint** | Backward compat + validação no DB. UI valida no client. Sem join extra. | CHECK constraint complexa de manter. Requer função jsonb_typeof. |

**Decisão: Opção C (Híbrido)** — jsonb estendido com `CHECK constraint` validando keys obrigatórias + tipos. Justificativa:

- 90% dos consumidores já estão preparados para `commercial_rules` jsonb (interface no pipeline, edit page lê como JSON).
- Adicionar uma tabela 1:1 introduz join e divergência (parte das regras em jsonb, parte em colunas), criando duas fontes de verdade no DB — exatamente o anti-padrão que estamos eliminando do código.
- Validação via CHECK constraint mantém o contrato cumprível no nível do DB. UI valida no client + API valida no server (Zod). Triple defense.
- Escalabilidade: se algum empreendimento futuro tiver regras específicas (ex: condições de incorporação especial para imóvel comercial), basta adicionar campos opcionais ao jsonb sem migration.

### 3.2 Schema final proposto para `commercial_rules`

```typescript
// Tipo TypeScript canônico (extraído para packages/shared/src/types/commercial-rules.ts)
export interface CommercialRules {
  // Política de entrada (CRÍTICA — substitui hardcoded em prompts)
  requires_down_payment: boolean              // já existe
  min_down_payment_pct: number                // NOVO — 0..100, ex: 10
  example_down_payment_brl: number | null     // NOVO — valor aproximado para fala de Nicole (ex: 40000)
  down_payment_flexible: boolean              // NOVO — true se aceita consórcio/alternativas

  // Opções de financiamento (CRÍTICA — substitui texto fixo "bancario, direto, etc")
  financing_options: FinancingOption[]        // NOVO — array enum-like

  // Programas governamentais
  mcmv_eligible: boolean                      // já existe

  // Argumentos de venda estruturados (para Nicole usar em pitches)
  key_selling_points: string[]                // NOVO — bullets curtos para presentations
  ideal_buyer_profile: string | null          // NOVO — texto curto: "quem busca rooftop completo"

  // Identificação (substitui PROPERTY_KEYWORDS em identify-property.ts)
  identification_keywords: string[]           // NOVO — ["vind", "67m2", "churrasqueira"] etc

  // Status descritivo (substitui mapeamento hardcoded no statusMap do pipeline)
  status_label: string | null                 // NOVO — texto que sobrescreve o default ("lançamento mais recente, sucesso de vendas" vs "Pre-lancamento")

  // Reserva — campo livre opcional para regras não-modeladas
  notes: string | null                        // NOVO — escape hatch (visível para Nicole)
}

export type FinancingOption =
  | "banco"
  | "construtora_direto"
  | "consorcio_contemplado"
  | "fgts"
  | "mcmv"
```

### 3.3 Migration 043 (DDL + CHECK constraint)

```sql
-- 043_property_commercial_rules_v2.sql
-- Adiciona CHECK constraint validando sub-schema de commercial_rules

-- Default jsonb com todos os novos campos (idempotente)
ALTER TABLE properties
  ALTER COLUMN commercial_rules SET DEFAULT
  jsonb_build_object(
    'requires_down_payment', false,
    'min_down_payment_pct', 0,
    'example_down_payment_brl', null,
    'down_payment_flexible', false,
    'financing_options', '[]'::jsonb,
    'mcmv_eligible', false,
    'key_selling_points', '[]'::jsonb,
    'ideal_buyer_profile', null,
    'identification_keywords', '[]'::jsonb,
    'status_label', null,
    'notes', null
  );

-- CHECK constraint: validar shape mínimo
ALTER TABLE properties
  ADD CONSTRAINT commercial_rules_shape_check CHECK (
    commercial_rules IS NULL
    OR (
      jsonb_typeof(commercial_rules) = 'object'
      AND (NOT (commercial_rules ? 'min_down_payment_pct')
           OR (
             jsonb_typeof(commercial_rules->'min_down_payment_pct') = 'number'
             AND (commercial_rules->>'min_down_payment_pct')::numeric BETWEEN 0 AND 100
           ))
      AND (NOT (commercial_rules ? 'example_down_payment_brl')
           OR commercial_rules->'example_down_payment_brl' = 'null'::jsonb
           OR (
             jsonb_typeof(commercial_rules->'example_down_payment_brl') = 'number'
             AND (commercial_rules->>'example_down_payment_brl')::numeric >= 0
           ))
      AND (NOT (commercial_rules ? 'financing_options')
           OR jsonb_typeof(commercial_rules->'financing_options') = 'array')
      AND (NOT (commercial_rules ? 'identification_keywords')
           OR jsonb_typeof(commercial_rules->'identification_keywords') = 'array')
      AND (NOT (commercial_rules ? 'key_selling_points')
           OR jsonb_typeof(commercial_rules->'key_selling_points') = 'array')
    )
  );

-- Comentário explicativo (visível em pgAdmin/DBeaver)
COMMENT ON COLUMN properties.commercial_rules IS
  'Sub-schema definido em packages/shared/src/types/commercial-rules.ts. '
  'Campos: requires_down_payment, min_down_payment_pct (0-100), '
  'example_down_payment_brl, down_payment_flexible, financing_options, '
  'mcmv_eligible, key_selling_points, ideal_buyer_profile, '
  'identification_keywords, status_label, notes.';
```

### 3.4 Migration 044 (Backfill Vind + Yarden)

```sql
-- 044_backfill_commercial_rules.sql
-- Popula commercial_rules com valores corretos para Vind e Yarden
-- ANTES de qualquer remoção do hardcoded nos prompts (ordem garantida).
-- Idempotente: usa UPDATE com merge de jsonb (||).

-- VIND RESIDENCE
UPDATE properties
SET commercial_rules = commercial_rules || jsonb_build_object(
  'requires_down_payment', true,
  'min_down_payment_pct', 10,
  'example_down_payment_brl', 40000,
  'down_payment_flexible', true,
  'financing_options', jsonb_build_array('banco', 'construtora_direto', 'consorcio_contemplado'),
  'mcmv_eligible', false,
  'key_selling_points', jsonb_build_array(
    'Churrasqueira a carvão na sacada (raro em apartamentos)',
    '2 suítes em 67m² (compacto otimizado)',
    'Entrega próxima (2027)',
    'Localização privilegiada perto da Cerro Azul'
  ),
  'ideal_buyer_profile', 'Quem busca praticidade com diferencial pessoal e entrega mais próxima',
  'identification_keywords', jsonb_build_array('vind', '67m2', '67 m2', 'churrasqueira', 'jose pereira'),
  'status_label', 'próximo da entrega',
  'notes', null
)
WHERE slug = 'vind-residence';

-- YARDEN
UPDATE properties
SET
  status = 'selling',  -- mudança de status conforme decisão do produto
  commercial_rules = commercial_rules || jsonb_build_object(
    'requires_down_payment', true,
    'min_down_payment_pct', 10,
    'example_down_payment_brl', 40000,
    'down_payment_flexible', true,
    'financing_options', jsonb_build_array('banco', 'construtora_direto', 'consorcio_contemplado'),
    'mcmv_eligible', false,
    'key_selling_points', jsonb_build_array(
      'Rooftop exclusivo com sport bar, coworking, mirante panorâmico',
      '2 pavimentos de lazer completos',
      'Tipologias maiores (80m²+) com 2 vagas a partir do 10º andar',
      'Sucesso de vendas (lançamento mais recente)'
    ),
    'ideal_buyer_profile', 'Quem busca alto padrão, áreas de lazer completas e valorização',
    'identification_keywords', jsonb_build_array('yarden', '83m2', '83 m2', 'gleba itororo', 'rooftop', 'sport bar', 'mirante'),
    'status_label', 'lançamento mais recente, sucesso de vendas',
    'notes', null
  ),
  -- FIX: "Fire pit" → "Fireplace" (também resolvido nesta migration para atomicidade)
  amenities = (
    SELECT jsonb_agg(
      CASE
        WHEN value::text ILIKE '%fire pit%' THEN to_jsonb(replace(replace(value::text, 'Fire pit', 'Fireplace'), 'fire pit', 'Fireplace'))
        ELSE value
      END
    )
    FROM jsonb_array_elements(amenities) AS value
  )
WHERE slug = 'yarden';

-- Fix complementar em knowledge_base (1 entry contém "fire pit")
UPDATE knowledge_base
SET content = regexp_replace(content, 'fire pit', 'Fireplace', 'gi')
WHERE content ~* 'fire pit';
```

### 3.5 Tipo compartilhado em packages/shared

Criar `packages/shared/src/types/commercial-rules.ts` com a interface acima + schema Zod para validação na API:

```typescript
// packages/shared/src/types/commercial-rules.ts
import { z } from "zod"

export const FinancingOptionSchema = z.enum([
  "banco",
  "construtora_direto",
  "consorcio_contemplado",
  "fgts",
  "mcmv",
])

export const CommercialRulesSchema = z.object({
  requires_down_payment: z.boolean(),
  min_down_payment_pct: z.number().min(0).max(100),
  example_down_payment_brl: z.number().nonnegative().nullable(),
  down_payment_flexible: z.boolean(),
  financing_options: z.array(FinancingOptionSchema),
  mcmv_eligible: z.boolean(),
  key_selling_points: z.array(z.string()),
  ideal_buyer_profile: z.string().nullable(),
  identification_keywords: z.array(z.string()),
  status_label: z.string().nullable(),
  notes: z.string().nullable(),
}).partial()  // tudo opcional na escrita (para empreendimentos sem todas as regras)

export type CommercialRules = z.infer<typeof CommercialRulesSchema>
export type FinancingOption = z.infer<typeof FinancingOptionSchema>
```

---

## 4. Design dos Prompts Refatorados

### 4.1 Princípio

**Templates (`prompts/*.ts`) só falam de COMO falar.** Dados sobre O QUE falar vivem no DB e chegam ao modelo via `buildPropertyDataContext()` no pipeline.

A separação fica:

| Categoria | Onde vive | Cacheável? |
|-----------|-----------|------------|
| Persona, tom de voz, regras de formatação | `prompts/personality.ts` | YES (estático) |
| Como apresentar empreendimentos (técnica) | `prompts/property-presentation.ts` | YES (estático) |
| Como qualificar (técnica de coleta) | `prompts/qualification.ts` | YES (estático) |
| Guardrails | `prompts/guardrails.ts` | YES (estático) |
| **Dados do empreendimento (Vind, Yarden, status, amenidades, regras)** | DB → `buildPropertyDataContext` | NO (dinâmico) |
| Memória do lead, datetime, no-show, flow | Pipeline runtime | NO (dinâmico) |

### 4.2 Exemplo concreto — Antes vs Depois (`property-presentation.ts`)

**ANTES** (linhas 47-56, hardcoded):

```typescript
### CONDICOES DE PAGAMENTO (regra geral para AMBOS)
- A Trifold trabalha com entrada minima de 20% do valor do imovel
- NAO vendemos sem entrada — isso e inegociavel
- O restante pode ser financiado (bancario, direto com construtora, diversas opcoes)
- Quando falar de valores, use APROXIMACOES e seja positiva:
  - "A entrada fica em torno de 80 mil reais, um valor muito competitivo quando falamos da qualidade que entregamos"
  - "Com cerca de 80 mil voce ja garante sua unidade"
  - NUNCA diga o valor exato — use "em torno de", "por volta de", "na faixa de"
- Se o lead achar caro, destaque o que esta incluido e sugira visita para ver pessoalmente
- Se o lead nao tem entrada, seja empatica e sugira planejamento
```

**DEPOIS** (estático, sem números nem nomes):

```typescript
### CONDICOES DE PAGAMENTO (técnica de comunicação)
As regras comerciais específicas de cada empreendimento — percentual de entrada, valor exemplo, opções de financiamento — chegam no contexto dinâmico abaixo (DADOS ATUALIZADOS DOS EMPREENDIMENTOS). Use-as como fonte da verdade.

REGRAS DE COMO FALAR DE VALORES:
- Use sempre VALORES APROXIMADOS, nunca exatos. Diga "em torno de X mil", "por volta de X mil", "na faixa de".
- Contextualize positivamente: "um valor competitivo quando falamos da qualidade que entregamos".
- Se o lead achar caro, destaque o que está incluído e sugira visita presencial.
- Se o lead disser que não tem entrada, NÃO bloqueie a conversa — apresente as opções de financiamento listadas em "financing_options" do empreendimento (consórcio contemplado, direto com construtora, banco etc) e mostre que existe um caminho.
- Para empreendimentos onde requires_down_payment = false: trabalhe a flexibilidade como vantagem.
- Para empreendimentos onde down_payment_flexible = true: enfatize que a entrada pode ser viabilizada de várias formas, mesmo se o lead disse que não tem.
```

E em `buildPropertyDataContext()` o pipeline passa a injetar (pra cada propriedade carregada):

```
Vind Residence (próximo da entrega)
Endereco: Rua Jose Pereira da Costa, 547, - Maringa/PR
...
Regras comerciais:
  - Exige entrada: sim
  - Entrada mínima: 10% (em torno de 40 mil reais)
  - Entrada flexível: sim (pode ser viabilizada via consórcio, banco, direto com construtora)
  - Opções de financiamento: banco, construtora_direto, consorcio_contemplado
  - MCMV: não elegível
Argumentos-chave:
  - Churrasqueira a carvão na sacada (raro em apartamentos)
  - 2 suítes em 67m² (compacto otimizado)
  - Entrega próxima (2027)
  - Localização privilegiada perto da Cerro Azul
Perfil ideal: Quem busca praticidade com diferencial pessoal e entrega mais próxima
```

### 4.3 Exemplo concreto — Antes vs Depois (`qualification.ts`)

**ANTES** (linhas 32-40):

```typescript
7. **Entrada disponivel** — CRITICO (regra de negocio da Trifold)
   - A Trifold NAO vende sem entrada. A entrada minima e 20% do valor do imovel
   - Fale de forma natural e positiva sobre a entrada, sem assustar
   - Use valores APROXIMADOS, nunca exatos: "a entrada fica em torno de 80 mil reais" (nao "79.600")
   - Contextualize o valor: "um valor muito competitivo quando falamos da qualidade que entregamos"
   - O restante o cliente consegue financiar de diversas formas (bancario, direto com construtora)
   - Se o lead nao tem entrada, seja empatica: "Entendo! Se quiser, a gente pode conversar sobre opcoes de planejamento pra voce se programar"
   - Para Yarden especificamente, a entrada e ainda mais importante por ser alto padrao
```

**DEPOIS**:

```typescript
7. **Entrada disponivel** — qualificador importante
   - Pergunte de forma NATURAL e POSITIVA, sem assustar.
   - Os valores de entrada (percentual, exemplo em reais, opções de financiamento) estão nos DADOS ATUALIZADOS DOS EMPREENDIMENTOS abaixo. NÃO invente números.
   - Use sempre valores APROXIMADOS (ex: "em torno de 40 mil") e contextualize positivamente.
   - Se o lead disser que não tem entrada, NÃO encerre a conversa: apresente as opções de financiamento listadas para o empreendimento de interesse, especialmente consórcio contemplado se estiver disponível.
   - Continue qualificando — entrada é um qualificador, não uma barreira intransponível.
```

### 4.4 Estimativa de tokens pós-refactor

Bloco estático atual (medido aprox.): ~2300 tokens (acima dos 1024 mínimo do Anthropic cache).

Após remover dados hardcoded (estimativa de 400 tokens removidos):
- Bloco estático pós: ~1900 tokens → **AINDA ACIMA do threshold de 1024**. ✅ Cache continua elegível.

Mitigação se o bloco ficar perto do threshold: adicionar exemplos pedagógicos genéricos para preencher (vide Risco 1 na Seção 9).

---

## 5. Design da UI do Painel

### 5.1 Página `/dashboard/properties/[id]/edit/page.tsx`

**Hoje:**
- Campo "Regras comerciais (JSON)" é `<textarea>` recebendo JSON cru (linhas 391-397).
- Não-técnico cola JSON, valida com `JSON.parse` (linhas 116-123). Se errar uma vírgula, salva quebra.

**Refactor — abordagem:**
1. **Manter** a textarea como modo "avançado" (escondido por trás de um botão "Avançado") — escape hatch para Gabriel ou outro power user que precise editar `notes` ou campos novos antes da UI cobrir.
2. **Adicionar** seção "Regras comerciais" estruturada acima:

```tsx
<div className="sm:col-span-2 rounded-lg border border-stone-200 p-4">
  <h2 className="text-base font-semibold mb-3">Regras Comerciais</h2>

  {/* Linha 1: Política de entrada */}
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <div>
      <label>Exige entrada?</label>
      <select value={requiresDownPayment ? "yes" : "no"} ...>
        <option value="yes">Sim</option>
        <option value="no">Não</option>
      </select>
    </div>
    <div>
      <label>% mínima de entrada</label>
      <input type="number" min="0" max="100" value={minDownPaymentPct} ... />
      <p className="text-xs text-stone-500">Ex: 10 para 10%</p>
    </div>
    <div>
      <label>Valor exemplo (R$)</label>
      <input type="number" min="0" step="1000" value={exampleDownPaymentBrl} ... />
      <p className="text-xs text-stone-500">Ex: 40000 (Nicole dirá "em torno de 40 mil")</p>
    </div>
  </div>

  {/* Linha 2: Entrada flexível */}
  <div className="mt-4">
    <label>
      <input type="checkbox" checked={downPaymentFlexible} ... />
      Entrada é flexível (pode ser viabilizada via consórcio, financiamento alternativo)
    </label>
  </div>

  {/* Linha 3: Opções de financiamento (multi-select) */}
  <div className="mt-4">
    <label>Opções de financiamento aceitas</label>
    <div className="grid grid-cols-2 gap-2 mt-1">
      {(["banco", "construtora_direto", "consorcio_contemplado", "fgts", "mcmv"] as const).map(opt => (
        <label key={opt}>
          <input
            type="checkbox"
            checked={financingOptions.includes(opt)}
            onChange={(e) => toggleFinancing(opt, e.target.checked)}
          />
          {financingOptionLabel(opt)}
        </label>
      ))}
    </div>
  </div>

  {/* Linha 4: MCMV (já existe no jsonb) */}
  <div className="mt-4">
    <label>
      <input type="checkbox" checked={mcmvEligible} ... />
      Elegível para Minha Casa Minha Vida
    </label>
  </div>

  {/* Linha 5: Status label custom */}
  <div className="mt-4">
    <label>Status descritivo (opcional)</label>
    <input type="text" value={statusLabel} ... placeholder="Ex: lançamento mais recente, sucesso de vendas" />
    <p className="text-xs text-stone-500">Sobrescreve o status técnico (selling/launching) na fala da Nicole.</p>
  </div>

  {/* Linha 6: Perfil ideal de comprador */}
  <div className="mt-4">
    <label>Perfil ideal do comprador (opcional)</label>
    <input type="text" value={idealBuyerProfile} ... placeholder="Ex: Quem busca rooftop e áreas de lazer completas" />
  </div>

  {/* Linha 7: Argumentos-chave (lista editável) */}
  <ArgumentsListEditor
    items={keySellingPoints}
    onChange={setKeySellingPoints}
    label="Argumentos-chave de venda"
    placeholder="Ex: Rooftop exclusivo com sport bar"
  />

  {/* Linha 8: Palavras-chave de identificação */}
  <ArgumentsListEditor
    items={identificationKeywords}
    onChange={setIdentificationKeywords}
    label="Palavras-chave para identificar este empreendimento na conversa"
    placeholder="Ex: rooftop, 83m2, gleba itororo"
  />

  {/* Modo avançado: JSON cru */}
  <details className="mt-4">
    <summary className="cursor-pointer text-sm text-stone-500">Modo avançado (JSON cru)</summary>
    <textarea value={commercialRulesRaw} onChange={...} rows={6} />
  </details>
</div>
```

### 5.2 Validações no cliente

- `min_down_payment_pct` ∈ [0, 100]
- `example_down_payment_brl` ≥ 0 ou null
- `financing_options` ⊆ enum válido (CheckboxList garante)
- Antes de salvar: validar com `CommercialRulesSchema.partial().parse()` (Zod) e mostrar inline errors.
- O modo avançado (textarea JSON) **também** valida com Zod schema antes de salvar — não só `JSON.parse`.

### 5.3 Validação no server (`/api/properties/[id]/route.ts`)

Atualmente a route aceita `body.commercial_rules` sem validação tipada (linha 78). Adicionar:

```typescript
import { CommercialRulesSchema } from "@trifold/shared/types/commercial-rules"

// dentro do PATCH:
if (body.commercial_rules !== undefined) {
  const parsed = CommercialRulesSchema.partial().safeParse(body.commercial_rules)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "commercial_rules inválido", details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  updateFields.commercial_rules = parsed.data
}
```

### 5.4 Outros campos JSON

`differentials`, `faq`, `restrictions` **permanecem** como textarea JSON. Não estão no escopo crítico do refactor (não afetam regras de negócio nas falas). Podem ser estruturados em uma futura iteração (story OUT do epic).

---

## 6. Yarden Gate — Flexibilização

### 6.1 Mudança de contrato

**Antes** (`yarden-gate.ts`):
```typescript
checkYardenGate(slug, data) → { blocked: boolean, reason?, suggestion? }
```

**Depois** (renomeado para `down-payment-flag.ts`):
```typescript
evaluateDownPaymentFlag(property, data) → {
  flag: "no_concern" | "soft_signal" | "needs_attention"
  hints: string[]      // pistas pra Nicole, ex: "lead disse que não tem entrada, mas consórcio contemplado é uma alternativa"
  suggest_alternative_property_slugs?: string[]  // opcional — empreendimentos sugeridos como alternativa
}
```

### 6.2 Lógica

```typescript
export function evaluateDownPaymentFlag(
  property: Property,
  collectedData: Record<string, unknown>,
  allProperties: Property[]
): DownPaymentFlagResult {
  const rules = (property.commercial_rules ?? {}) as CommercialRules
  const requiresDp = rules.requires_down_payment === true
  const hasDp = collectedData.has_down_payment === true
  const declaredNoDp = collectedData.has_down_payment === false

  // Caso 1: empreendimento não exige entrada → no_concern
  if (!requiresDp) return { flag: "no_concern", hints: [] }

  // Caso 2: lead tem entrada → no_concern
  if (hasDp) return { flag: "no_concern", hints: [] }

  // Caso 3: lead declarou que NÃO tem entrada
  if (declaredNoDp) {
    const hints: string[] = []

    // Se for flexível, oferecer caminho
    if (rules.down_payment_flexible) {
      hints.push(
        `O lead disse que não tem entrada, mas o ${property.name} aceita entrada flexível. ` +
        `Apresente as opções de financiamento disponíveis (especialmente consórcio contemplado se estiver na lista) ` +
        `e NÃO encerre a conversa. Continue qualificando.`
      )
    } else {
      hints.push(
        `O lead disse que não tem entrada e o ${property.name} exige entrada. ` +
        `Seja empática, explore se ele tem como se planejar, e considere sugerir outro empreendimento mais flexível como alternativa COMPLEMENTAR (sem fechar a porta deste).`
      )
    }

    // Sugerir alternativas (empreendimentos mais flexíveis na mesma org)
    const alternatives = allProperties
      .filter(p =>
        p.id !== property.id &&
        ((p.commercial_rules as CommercialRules | undefined)?.down_payment_flexible === true ||
         (p.commercial_rules as CommercialRules | undefined)?.requires_down_payment === false)
      )
      .map(p => p.slug)

    return {
      flag: rules.down_payment_flexible ? "soft_signal" : "needs_attention",
      hints,
      suggest_alternative_property_slugs: alternatives.length > 0 ? alternatives : undefined,
    }
  }

  // Caso 4: não declarado ainda → soft_signal genérico para a Nicole pedir
  return {
    flag: "soft_signal",
    hints: [`Ainda não foi confirmado se o lead tem entrada disponível para o ${property.name}. Pergunte de forma natural.`],
  }
}
```

### 6.3 Plug-in no pipeline (Mudança em `pipeline.ts:238-248`)

```typescript
// 6. Evaluate down payment flag (substituí check yarden gate)
let downPaymentContext = ""
if (identifiedPropertyId) {
  const property = properties.find((p) => p.id === identifiedPropertyId)
  if (property) {
    const flagResult = evaluateDownPaymentFlag(property, collectedData, properties)
    if (flagResult.hints.length > 0) {
      const altText = flagResult.suggest_alternative_property_slugs?.length
        ? `\nAlternativas sugeridas (apenas como complemento, NÃO fechar a porta do empreendimento atual): ${flagResult.suggest_alternative_property_slugs.join(", ")}`
        : ""
      downPaymentContext = `\n\n=== DOWN PAYMENT FLAG (${flagResult.flag}) ===\n${flagResult.hints.join("\n")}${altText}\n=== END DOWN PAYMENT FLAG ===`
    }
  }
}
```

### 6.4 Testes (yarden-gate.test.ts → down-payment-flag.test.ts)

Substituir os 8 asserts existentes por:

```typescript
import { evaluateDownPaymentFlag } from "./down-payment-flag"

const VIND = { id: "v", name: "Vind", slug: "vind-residence", commercial_rules: {
  requires_down_payment: true, down_payment_flexible: true,
  financing_options: ["banco", "construtora_direto", "consorcio_contemplado"]
}} as any

const YARDEN_STRICT = { id: "y", name: "Yarden", slug: "yarden", commercial_rules: {
  requires_down_payment: true, down_payment_flexible: false,
  financing_options: ["banco"]
}} as any

const ALL = [VIND, YARDEN_STRICT]

describe("evaluateDownPaymentFlag", () => {
  it("returns no_concern when property doesn't require down payment", () => {
    const prop = { ...VIND, commercial_rules: { requires_down_payment: false } } as any
    expect(evaluateDownPaymentFlag(prop, {}, [prop]).flag).toBe("no_concern")
  })

  it("returns no_concern when lead has down payment", () => {
    expect(evaluateDownPaymentFlag(VIND, { has_down_payment: true }, ALL).flag).toBe("no_concern")
  })

  it("returns soft_signal when lead declared no_dp and property is flexible", () => {
    const result = evaluateDownPaymentFlag(VIND, { has_down_payment: false }, ALL)
    expect(result.flag).toBe("soft_signal")
    expect(result.hints[0]).toContain("consórcio")
    expect(result.hints[0]).toContain("NÃO encerre")
  })

  it("returns needs_attention when property is strict and lead has no dp", () => {
    const result = evaluateDownPaymentFlag(YARDEN_STRICT, { has_down_payment: false }, ALL)
    expect(result.flag).toBe("needs_attention")
    expect(result.suggest_alternative_property_slugs).toEqual(["vind-residence"])
  })

  it("does NOT block (no longer returns blocked=true)", () => {
    const result = evaluateDownPaymentFlag(YARDEN_STRICT, { has_down_payment: false }, ALL) as any
    expect(result.blocked).toBeUndefined()
  })

  it("returns soft_signal when down payment not yet declared", () => {
    expect(evaluateDownPaymentFlag(VIND, {}, ALL).flag).toBe("soft_signal")
  })
})
```

### 6.5 Compat layer (Deprecation gradual)

Para evitar quebrar o `pipeline.ts:23` durante o refactor:
1. Manter `checkYardenGate` como **deprecation shim** que internamente chama `evaluateDownPaymentFlag` e mapeia para o contrato antigo (com `blocked: false` sempre). Adicionar `@deprecated` no JSDoc.
2. Remover `checkYardenGate` na última story do epic (Story 9: Cleanup).

---

## 7. Plano de Migração (zero-downtime Nicole)

### 7.1 Feature flag

```
NICOLE_RULES_FROM_DB=true   # default: false (rollback seguro)
```

Set via `vercel env add NICOLE_RULES_FROM_DB production` antes do deploy da story 6.

### 7.2 Ordem absoluta (não pode inverter)

```
Story 1: Tipos + Zod schema (packages/shared)        [NÃO toca runtime]
   ↓
Story 2: Migration 043 (DDL + CHECK)                  [DDL aditivo, nada quebra]
   ↓
Story 3: Migration 044 (Backfill Vind + Yarden + fix Fire Pit + status Yarden)
                                                       [DB tem dados corretos AGORA]
   ↓
Story 4: buildPropertyDataContext expansion           [pipeline lê e injeta; prompts AINDA têm hardcoded → ✅ não regride]
   ↓
Story 5: UI estruturada (form de regras)              [admin pode editar; nenhuma regressão de comportamento da Nicole]
   ↓
Story 6: Refactor prompts (property-presentation, qualification, personality)
         BEHIND FLAG NICOLE_RULES_FROM_DB=true        [se a flag estiver off, prompts antigos continuam — rollback trivial]
   ↓
Story 7: Yarden Gate flex (evaluateDownPaymentFlag + shim)
                                                       [pipeline já usa novo; testes atualizados; compat shim mantém API]
   ↓
Story 8: Genericizar identify-property + qualification + memory (slugs hardcoded → properties[] dinâmicos)
                                                       [opcional para epic, mas alinhado]
   ↓
Story 9: Cleanup + remoção de shims + flag flip permanente + tests cache audit
                                                       [após 1 semana de produção estável]
```

### 7.3 Rollback plan

**Cenário A — Nicole começa a falar coisas erradas após deploy da story 6:**
```bash
vercel env rm NICOLE_RULES_FROM_DB production
vercel env add NICOLE_RULES_FROM_DB production
# (valor: false)
# Trigger redeploy (vercel --prod) → prompts voltam ao hardcoded antigo
```
Tempo de recuperação: ~3-5 min (vercel redeploy).

**Cenário B — Schema do DB inválido após Story 2:**
A migration 043 só **adiciona** CHECK constraint e default. Não é destrutiva.
Rollback: `ALTER TABLE properties DROP CONSTRAINT commercial_rules_shape_check;` via Management API.

**Cenário C — Backfill (Story 3) populou valores errados:**
A migration usa `||` merge. Para reverter um campo específico:
```sql
UPDATE properties SET commercial_rules = commercial_rules - 'example_down_payment_brl' WHERE slug = 'vind-residence';
```
Ou substituir tudo via UI admin.

**Cenário D — UI form quebra:**
A página `/dashboard/properties/[id]/edit` continua funcionando porque o modo avançado JSON é o fallback (textarea raw permanece visível atrás de `<details>`).

### 7.4 Janelas-zero garantidas

- **Após Story 3 (backfill):** DB tem dados corretos. Hardcoded ainda existe. Nicole tem **2 fontes consistentes** (ambas dizem o mesmo após o backfill ser cuidadosamente alinhado com o hardcoded atual EXCETO os 3 pontos do briefing — status, fire pit, política de entrada — que o backfill **corrige primeiro**). Por isso a Story 3 inclui o backfill com os **novos valores** (10%, 40k, Fireplace, status Yarden=selling), e a Story 6 (que troca o hardcoded) vem depois.
- **Conflito temporário (entre Story 3 e Story 6):** durante essa janela, o `buildPropertyDataContext` já injeta os novos valores no prompt **junto** com os valores antigos do hardcoded. **MITIGAÇÃO**: Story 4 já expande `buildPropertyDataContext` colocando os dados DB-driven com prioridade visual ("DADOS ATUALIZADOS — use estas informações"). Como o modelo prioriza informação mais recente e mais específica, deve preferir os números do DB. **VERIFICAÇÃO**: Story 4 adiciona uma rodada de smoke test manual com Nicole respondendo "qual a entrada?" e validando que diz 40k.
- **Após Story 9 (cleanup):** Hardcoded removido. Apenas DB.

---

## 8. Proposta de Epic + Breakdown em Stories

### Epic: `epic-31-nicole-data-layer-refactor`

**Goal:** Mover 100% das regras de negócio editáveis pelo time comercial para o DB, eliminando hardcoded em prompts e oferecendo UI estruturada no painel admin.

**Success metrics:**
1. Time comercial consegue alterar % entrada / valor exemplo / status sem deploy de código.
2. Zero regressão em qualquer dos ~190 testes existentes da Nicole.
3. Cache hit ratio do Anthropic ephemeral cache mantém-se ≥ 80% do baseline pré-refactor.
4. Tempo de aplicar correção de "fire pit → fireplace" cai de "deploy + horas" para "5 cliques no painel".

**Total estimado:** ~38h dev + ~12h QA = **~50h**, 9 stories.

| # | Story | Estimativa | Definition of Done | Depende de |
|---|-------|-----------|--------------------|--|
| 31.1 | **Tipos e Zod schema compartilhados** — criar `packages/shared/src/types/commercial-rules.ts` com interface `CommercialRules`, enum `FinancingOption`, schema Zod `CommercialRulesSchema`. Exportar via `packages/shared/src/index.ts`. | 2h | Tipos compilam em todos os pacotes que consomem `@trifold/shared`. Lint + typecheck clean. Story de prep — não muda runtime. | — |
| 31.2 | **Migration 043 — DDL CommercialRules v2** — criar `supabase/migrations/043_property_commercial_rules_v2.sql` com default jsonb + CHECK constraint. Aplicar via CLI ou Management API conforme convenção Epic 29. | 3h | Migration aplicada em produção. `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '043'` retorna 1 linha. INSERT/UPDATE com jsonb inválido retorna erro de CHECK. | 31.1 |
| 31.3 | **Migration 044 — Backfill + Fire Pit + Yarden status** — criar `supabase/migrations/044_backfill_commercial_rules.sql` com UPDATE de Vind/Yarden com novos campos, mudança de status Yarden para `selling`, fix de "Fire pit" → "Fireplace" em amenities + knowledge_base. | 4h | Após aplicar: query `SELECT commercial_rules->>'min_down_payment_pct' FROM properties WHERE slug='vind-residence'` retorna `10`. `amenities` do Yarden contém "Fireplace" e não "Fire pit". `status` do Yarden é `selling`. Knowledge_base sem ocorrências de "fire pit". | 31.2 |
| 31.4 | **Pipeline — buildPropertyDataContext expansion** — expandir a função em `packages/ai/src/chat/pipeline.ts:1072-1142` para injetar todos os campos novos de `commercial_rules` (% entrada, valor exemplo, financing_options, key_selling_points, status_label, etc) com formatação humana e ênfase ("DADOS ATUALIZADOS — USE COMO FONTE DA VERDADE"). | 5h | Unit test do builder (puro) cobrindo: empreendimento com rules completas, com rules vazias, com financing_options=[], etc. Smoke test manual: Nicole diz "em torno de 40 mil" e cita "consórcio contemplado" como opção. | 31.3 |
| 31.5 | **UI — Form estruturado de Regras Comerciais** — refatorar `packages/web/src/app/dashboard/properties/[id]/edit/page.tsx` adicionando seção estruturada (% entrada, valor exemplo, multi-select financing_options, status_label, ideal_buyer_profile, listas editáveis). Adicionar validação Zod no `/api/properties/[id]/route.ts`. Modo avançado (JSON raw) preservado em `<details>`. | 8h | Admin/supervisor consegue salvar Vind com `min_down_payment_pct=10` via form (não JSON). Erros de validação aparecem inline (% inválido, etc). Page test no Playwright cobrindo fluxo. RLS continua funcionando (lead/broker não acessa edit). | 31.4 |
| 31.6 | **Prompts refactor — property-presentation + qualification + personality** — implementar feature flag `NICOLE_RULES_FROM_DB`. Quando ativa: remover blocos de dados hardcoded (CONDICOES DE PAGAMENTO em property-presentation, item 7 entrada em qualification, exemplos com nomes em personality) substituindo por instruções genéricas referenciando DADOS ATUALIZADOS. Quando inativa: comportamento atual. | 6h | Token count do bloco estático ≥ 1024 (test `index.test.ts` atualizado). Cache hit ratio em smoke test ≥ baseline. Smoke test manual: Nicole responde "entrada minima de 10%" e "em torno de 40 mil" sem invenção. Test que valida `cache_control: ephemeral` presente continua passando. | 31.5 |
| 31.7 | **Yarden Gate flexibilização** — renomear `yarden-gate.ts` → `down-payment-flag.ts`. Implementar `evaluateDownPaymentFlag(property, data, allProperties)`. Manter shim `checkYardenGate` chamando a nova função e mapeando para `{ blocked: false }` (deprecation marker). Refatorar pipeline para usar o novo flow. Atualizar testes. | 5h | Tests atualizados (renomeados + 6 cenários cobertos). Nicole, ao receber "não tenho entrada" sobre Yarden, oferece consórcio contemplado e mantém a conversa sobre Yarden, opcionalmente mencionando Vind como complemento. Não diz "vou te direcionar para o Vind". | 31.6 |
| 31.8 | **Genericização de keywords e memory hooks** — mover `PROPERTY_KEYWORDS` de `identify-property.ts` para ler de `commercial_rules.identification_keywords`. Parametrizar `extractCollectedData` em `qualification.ts` para receber `properties[]`. Idem para `memory/loader.ts` e `memory/writer.ts` (gerar lista de rooms dinamicamente). | 4h | Adicionar uma 3ª property mock nos testes e validar que keywords funcionam sem mudar código. Testes existentes continuam passando. | 31.7 |
| 31.9 | **Cleanup + Cache Audit + Flag flip permanente** — após 1 semana de produção estável: remover shim `checkYardenGate`, remover blocos comentados nos prompts antigos, fixar `NICOLE_RULES_FROM_DB=true` como default no código (remover branches if-else), atualizar `seed-properties.ts` para já popular o novo schema. Auditar cache_hit_ratio em produção 7 dias antes/depois. | 3h | `git grep "checkYardenGate"` retorna 0. `vercel env ls` mostra que `NICOLE_RULES_FROM_DB` foi removida (não mais necessária). Relatório de cache hit ratio anexado ao QA gate. | 31.8 + 1 semana prod |

---

## 9. Riscos e Mitigações

### Risco 1 — Prompt cache miss aumenta custo Anthropic

**Severidade:** HIGH
**Probabilidade:** MEDIUM

**Por quê:** o bloco estático cacheável precisa ≥ 1024 tokens (`PROMPT_CACHE_MIN_TOKENS` em `prompts/index.ts:29`). Hoje o bloco tem ~2300 tokens. Após remover ~400 tokens de dados hardcoded, fica ~1900 — ainda acima. Mas se em uma iteração futura alguém remover mais conteúdo (ex: simplificar personality), pode cair abaixo. Resultado: cache desativado, custo sobe ~10× por mensagem.

**Mitigação:**
1. Adicionar **regression test** em `prompts/index.test.ts`:
   ```typescript
   it("static block stays above PROMPT_CACHE_MIN_TOKENS after refactor", () => {
     const blocks = buildSystemPrompt()
     expect(estimateTokens(blocks[0].text)).toBeGreaterThanOrEqual(PROMPT_CACHE_MIN_TOKENS + 200) // 200 buffer
   })
   ```
2. **Monitorar** o telemetry event `prompt_cache_stats` em `pipeline.ts:457-476` por 7 dias após Story 6. Se `cache_hit_ratio` cair abaixo de 0.75 (vs baseline atual a confirmar), abrir incident e considerar adicionar conteúdo pedagógico ao bloco estático (exemplos de diálogo genéricos).
3. **Tradeoff documentado:** se alguma vez forçar a colocar valores no bloco estático (para preservar cache size), aceitar que muda apenas a cada deploy — não a cada edição no painel.

### Risco 2 — Testes determinísticos quebram silenciosamente

**Severidade:** MEDIUM
**Probabilidade:** HIGH

**Por quê:** ~190 LOC de testes em `prompts/index.test.ts`, `yarden-gate.test.ts`, `qualification.test.ts`, `pipeline.test.ts` foram escritos contra strings exatas ("yarden", "20%", "blocked: true", etc). Os 5 cenários mais frágeis foram mapeados na Seção 2.7.

**Mitigação:**
1. Cada story que toca código com tests **deve** rodar `pnpm test --filter @trifold/ai` localmente antes do commit.
2. Story 31.6 inclui passo explícito de atualizar `prompts/index.test.ts` line-by-line — não pode ser deixado para depois.
3. Story 31.7 inclui o **rename** de `yarden-gate.test.ts → down-payment-flag.test.ts` com substituição completa dos 8 asserts (Seção 6.4).
4. CI passa a rodar com `--reporter=verbose` para deixar regressão visível.

### Risco 3 — Multi-tenancy isolation quebra

**Severidade:** HIGH
**Probabilidade:** LOW

**Por quê:** Toda lógica de `commercial_rules` precisa respeitar `org_id`. Se um payload de PATCH /api/properties incluir `org_id`, isso vazaria. Hoje a route não trata `org_id` no body (linhas 55-82 do route.ts), mas é uma boa prática validar.

**Mitigação:**
1. **Confirmado:** RLS `properties_select` (linha 238 do `004_rls_policies.sql`) filtra por `org_id = public.user_org_id()`. ✅
2. **Confirmado:** API route `PATCH /api/properties/[id]/route.ts` linha 92-95 já usa `.eq("org_id", appUser.org_id)` no UPDATE — duplo defense ✅.
3. **Adicionar** test E2E: usuário da org A tenta editar property da org B → recebe 404 (esperado pela combinação RLS + filtro do route).
4. **Story 31.5 inclui** validação explícita: `body.org_id` é ignorado no PATCH (já é hoje, mas documentar).
5. Backfill (migration 044) é **multi-org-aware**: filtra por `slug`, que é UNIQUE GLOBAL (linha 45 do `002_property_schema.sql`). Se houver outra org com slug "yarden" (improvável dado UNIQUE), o UPDATE atinge ambas. **OK para MVP single-org Trifold.** Se Trifold um dia onboardar outra construtora, revisitar.

### Risco 4 — Nicole alucina sobre regras durante a janela de inconsistência

**Severidade:** MEDIUM
**Probabilidade:** LOW

**Por quê:** Entre Story 3 (backfill) e Story 6 (refactor prompts), Nicole vê **duas fontes**: o bloco estático ainda diz "20% / 80 mil" e o bloco dinâmico (`buildPropertyDataContext`) diz "10% / 40 mil". Modelos LLM podem misturar.

**Mitigação:**
1. Story 4 garante que `buildPropertyDataContext` injeta os dados com header forte: `"DADOS ATUALIZADOS DOS EMPREENDIMENTOS — USE COMO FONTE DE VERDADE"` (texto já existe na linha 1078, reforçar).
2. **Smoke test manual obrigatório no QA gate da Story 4**: enviar 10 mensagens via canal staging Telegram pedindo entrada/preço, confirmar que Nicole responde 10% / 40k.
3. Se houver alucinação em smoke test: **bloquear Story 4**, voltar e ajustar (reforçar com `"IGNORE QUALQUER NÚMERO MENCIONADO ACIMA QUE CONFLITE COM ESTA SEÇÃO"`).
4. Janela é curta — entre Story 4 e Story 6, ~1-2 dias úteis no máximo.

### Risco 5 — Identificação de empreendimento quebra (Story 31.8)

**Severidade:** MEDIUM
**Probabilidade:** MEDIUM

**Por quê:** `identify-property.ts` hoje tem keywords hardcoded por slug. Quando movermos pro DB (`identification_keywords` em `commercial_rules`), se o backfill não popular corretamente os arrays, leads que mencionarem "67m2" ou "rooftop" deixam de ser auto-identificados.

**Mitigação:**
1. Migration 044 (Story 3) **já popula** `identification_keywords` com os arrays exatos hoje hardcoded — sem regressão.
2. Story 31.8 mantém a função `identifyProperty` com **fallback automático**: se `commercial_rules.identification_keywords` for vazio/null, usa lógica auto-gen existente (linhas 46-53 de `identify-property.ts`).
3. Tests existentes (`identify-property.test.ts`) continuam usando mocks com slugs `vind` e `yarden` e devem passar sem alteração (após Story 8 ler `commercial_rules.identification_keywords` dos mocks).

### Top 5 ranking final por impacto × probabilidade

1. **Risco 2 (testes quebram)** — HIGH × HIGH → mitigado por Stories 6+7 incluírem rename/update explícitos.
2. **Risco 1 (cache miss)** — HIGH × MEDIUM → mitigado por regression test + monitoring.
3. **Risco 4 (alucinação na janela)** — MEDIUM × LOW → mitigado por smoke test obrigatório no QA gate da Story 4.
4. **Risco 5 (identificação quebra)** — MEDIUM × MEDIUM → mitigado por backfill prévio + fallback automático.
5. **Risco 3 (multi-tenancy)** — HIGH × LOW → RLS já presente, double-checked.

---

## 10. Apêndice A — Inconsistências encontradas (fora do escopo original)

Durante a análise descobri 4 coisas que o usuário não mencionou e que merecem decisão:

### A.1 — Vind tem `min_down_payment: 68000` no DB; seed.ts diz `requires_down_payment: false`

`scripts/seed-properties.ts:36` diz `commercial_rules: { requires_down_payment: false, mcmv_eligible: false }`. Mas o DB em produção tem `{ requires_down_payment: true, min_down_payment: 68000, mcmv_eligible: false }`.

Algum admin editou em produção e o seed nunca foi atualizado. O seed-properties.ts está desincronizado. **Recomendação:** Story 31.9 atualiza o seed para refletir o novo schema completo, evitando que futuros `pnpm seed:properties` regridam dados de produção.

### A.2 — Vind: o `min_down_payment: 68000` é "60% de 80 mil" ou "80% de 85k" ou outra coisa?

Hoje o prompt hardcoded diz "20% = 80 mil" (implicando preço ~400k). O DB diz `min_down_payment: 68000`. **Não está claro qual era o significado pretendido.** No refactor proposto, esse campo será substituído por `min_down_payment_pct: 10` + `example_down_payment_brl: 40000`, então o número 68000 deixa de existir.

**PERGUNTA AO PRODUTO**: confirmar que estamos OK em descartar o `68000` e usar o novo modelo. (Provavelmente sim — era resíduo.)

### A.3 — Slugs inconsistentes entre seed e DB

`seed-properties.ts:24` e `seed-properties.ts:96` setam slugs `vind-residence` e `yarden-residence`. Mas o DB em produção tem `vind-residence` e **`yarden`** (sem `-residence`). Provavelmente alguém editou via admin UI depois do seed original.

Isso afeta `yarden-gate.ts:25` (`slug.toLowerCase() === "yarden"` — funcionaria com `yarden` exato, falharia com `yarden-residence`). Confirmado que a regra `=== "yarden"` está alinhada com o DB.

**Recomendação:** padronizar para `yarden` em todos os lugares (seed, lead-fields constants, badges). Esse fix vem em Story 31.8 (genericização) ou Story 31.9 (cleanup).

### A.4 — Knowledge base de "valor da entrada" diz "condicoes flexiveis"

`scripts/seed-knowledge-base.ts:19` tem entry "Valor da entrada" com content "As condicoes de pagamento sao flexiveis...". Isso já está alinhado com a nova política. Mas existem outras entries ("Minha Casa Minha Vida", "Não tenho entrada") que mantêm tom "exige entrada".

**Recomendação:** No QA gate da Story 31.3, revisar todas as ~33 entries de knowledge_base e atualizar as que falam de "entrada" para alinhar com a nova política de flexibilidade. Talvez seja sub-task na Story 31.3 ou stand-alone fora do epic.

---

## 11. Apêndice B — Perguntas ao Produto (RESPONDIDAS — 2026-05-15)

### Q1 — Status Yarden — **RESPONDIDO: Sim**

Vamos usar `status_label` (texto custom) com "lançamento mais recente, sucesso de vendas" e `status` técnico = `selling`. Campo `status_label` entra no schema como `string` opcional dentro de `commercial_rules`.

### Q2 — `example_down_payment_brl` — **RESPONDIDO: Por empreendimento, configurável no painel**

Cada empreendimento tem SEU exemplo conforme o preço comercializado. **NÃO usar 40k pra ambos.** O campo `example_down_payment_brl` é por property, editável no painel. Initial backfill (migration 044):
- Vind: `40000` (briefing original)
- Yarden: `60000` (preço maior — admin ajusta no painel se necessário)

**Implicação:** Story 31.5 (UI) precisa ter campo dedicado `Valor exemplo de entrada (R$)` por empreendimento.

### Q3 — `financing_options` ordering — **RESPONDIDO: Manter ordem proposta**

Ordem: `["banco", "construtora_direto", "consorcio_contemplado"]`. Sem mudança.

### Q4 — Yarden Gate flexibilizado — **RESPONDIDO: Middle ground OK**

Nicole continua falando do Yarden, oferece consórcio, menciona Vind como complemento sem redirecionar. Mantém comportamento proposto na Seção 6.

### Q5 — Fire pit → Fireplace — **RESPONDIDO: Apenas onde afeta a Nicole**

Manter migration 044 com UPDATE em `properties.amenities` (Yarden) e `knowledge_base.content`. **Não criar ticket separado** para material visual de marketing (fotos/renders/PDFs ficam fora do escopo deste refactor).

### Q6 — `min_down_payment_pct` por empreendimento — **RESPONDIDO: Configurável por property**

Campo `min_down_payment_pct` é POR property (não global), editável no painel. Initial backfill (migration 044):
- Vind: `10`
- Yarden: `10`

Admin pode ajustar separadamente no painel se a política mudar para algum empreendimento específico.

### Q-Apêndice A.2 — Descartar `min_down_payment: 68000` do DB Vind — **RESPONDIDO: Descartar**

O resíduo `68000` é substituído pelos novos campos `min_down_payment_pct: 10` + `example_down_payment_brl: 40000`. Migration 044 sobrescreve o jsonb inteiro de `commercial_rules`.

### Q-Apêndice A.3 — Slug Yarden em produção é `yarden` — **RESPONDIDO: Manter `yarden`**

Migration 044 usa filtro por slug = 'yarden' (não 'yarden-residence'). Story 31.9 atualiza `seed-properties.ts` para sincronizar com produção (`slug: "yarden"`).

---

### Mudanças no schema final pós-decisões (Q2 + Q6)

Confirmado que ambos `min_down_payment_pct` e `example_down_payment_brl` são **por empreendimento**, editáveis no painel via campos individuais (não JSON cru). Schema da Seção 3.2 já reflete isso — sem mudança estrutural necessária.

### Mudanças no backfill (migration 044)

```sql
-- Vind
UPDATE properties
SET commercial_rules = jsonb_build_object(
  'min_down_payment_pct', 10,
  'example_down_payment_brl', 40000,
  'financing_options', jsonb_build_array('banco', 'construtora_direto', 'consorcio_contemplado'),
  'down_payment_flexible', true,
  'requires_down_payment', true,
  'status_label', 'em comercialização, próximo da entrega',
  ...
)
WHERE slug = 'vind-residence';

-- Yarden (exemplo de entrada MAIOR + status_label diferente)
UPDATE properties
SET status = 'selling',
    commercial_rules = jsonb_build_object(
  'min_down_payment_pct', 10,
  'example_down_payment_brl', 60000,
  'financing_options', jsonb_build_array('banco', 'construtora_direto', 'consorcio_contemplado'),
  'down_payment_flexible', true,
  'requires_down_payment', true,
  'status_label', 'lançamento mais recente, sucesso de vendas',
  ...
)
WHERE slug = 'yarden';
```

---

## Final Notes

- Documento navegável: TOC no topo, seções numeradas, exemplos antes/depois concretos.
- Estimativa total ~38h dev + 12h QA → recomendado distribuir em 2-3 sprints de 1 semana.
- **Próximo passo:** @sm cria Stories 31.1 → 31.9 com base nas linhas da tabela na Seção 8. Cada story tem AC, scope IN/OUT, dependências, estimativa.
- Pontos de bloqueio que requerem decisão de produto: marcados como "PERGUNTA AO PRODUTO" em Apêndice B (6 perguntas, todas verticais ao escopo).
- Pontos de bloqueio técnicos: nenhum — todas as decisões fechadas.

---

## Change Log do Documento

| Data | Versão | Mudança | Autor |
|------|--------|---------|-------|
| 2026-05-15 | 1.0 | Doc inicial criado a partir do briefing do usuário (Caminho B). 9 stories propostas, 6 perguntas ao Produto no Apêndice B. | Aria (@architect) |
| 2026-05-15 | 1.1 | Apêndice B respondido pelo Produto. Mudanças no schema final pós-decisões Q2 + Q6 (campos `min_down_payment_pct` e `example_down_payment_brl` configuráveis por property). Backfill ajustado: Vind=10%/40k, Yarden=10%/60k. | Claude (orquestração) |
| 2026-05-15 | 1.2 | **Migrations renumeradas 040→043 e 041→044** devido a colisão com Epic 33 (Módulo CRM Clientes — Lucas mergeou enquanto Story 31.1 estava em InReview). Slots 040-042 ocupados em produção. Todas as referências do doc atualizadas (Seções 2.1, 2.8, 3.3, 3.4, 7.2, 8). | Claude (orquestração) |
