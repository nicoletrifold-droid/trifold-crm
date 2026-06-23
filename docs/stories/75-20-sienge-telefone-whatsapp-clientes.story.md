# Story 75-20 — Sincronizar telefone/WhatsApp do Sienge no cadastro de clientes

## Metadata
- **Status:** Done
- **Epic:** 75 (ajustes operacionais)
- **Branch:** main (mudança incremental, padrão do repo)
- **Complexidade:** M (3 pontos)

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck, lint]

## Story

**As a** time que vai enviar mensagens/notificações via WhatsApp aos clientes,
**I want** que a sincronização do Sienge grave o telefone do cliente nos campos
   corretos (`telefone` e `whatsapp`), normalizado,
**so that** os disparos de WhatsApp tenham o número mapeado e funcionem.

## Contexto

Pedido do usuário (conversa 2026-06-23). Investigação encontrou **dois bugs**
somados na sync do Sienge (`packages/web/src/lib/integrations/sienge`):

1. **Coluna errada:** `sync.ts` grava `phone: customer.phone`, mas a tabela
   `clientes` não tem coluna `phone` — tem `telefone` e `whatsapp`. O insert de
   cliente novo (que só existe no Sienge) **falha** por coluna inexistente
   (PostgREST PGRST204 → `"Falha ao criar cliente CRM"`); no caminho de vínculo
   (CPF/email já no CRM) o telefone **nunca** é gravado.
2. **Campo errado na origem:** a API do Sienge devolve telefone em **`phones[]`**
   (array de `{type, number, main}`), não num `phone` plano. Confirmado em chamada
   real: `phones=[{type:'Celular', number:'(44)997679415', main:true}]`. Logo
   `customer.phone` é sempre `undefined`.

Estado em prod: 77 clientes (70 do Sienge), só 11 com `telefone` e 8 com
`whatsapp` (preenchidos à mão). Decisão do usuário: gravar o número **em ambos**
(`telefone` e `whatsapp`); confirmar API antes (feito).

## Escopo

**IN:**
- `types.ts`: `SiengeCustomer.phone` → `phones?: SiengePhone[]`; novo tipo `SiengePhone`.
- `sync.ts`: helper `extractCustomerPhone()` que escolhe o telefone (prioriza
  `main`, depois `Celular`, depois o primeiro) e normaliza via `normalizePhoneBR`.
- `sync.ts` (`findOrCreateCliente`): grava `telefone` e `whatsapp` no insert; e
  preenche `telefone`/`whatsapp` nos caminhos de vínculo (CPF e email) **somente
  quando vazios** (não sobrescreve preenchimento manual).
- Backfill dos 70 clientes já vinculados: para cada um com campos vazios, buscar
  no Sienge por `sienge_customer_id` e gravar o número normalizado.

**OUT:**
- Mudança nos disparos de WhatsApp em si (já leem o campo do cliente).
- Telefone do cônjuge / contatos adicionais (`spouse`, `contacts`).
- Sobrescrever telefone/whatsapp já preenchidos manualmente.

## Acceptance Criteria
1. `extractCustomerPhone` retorna o número normalizado (`55DDD9XXXXXXXX`) a partir de `phones[]`, ou `null` se não houver.
2. Insert de cliente novo do Sienge grava `telefone` e `whatsapp` (não mais `phone`) e não falha por coluna inexistente.
3. No vínculo de cliente já existente (CPF ou email), se `telefone`/`whatsapp` estiverem vazios, passam a ser preenchidos com o número do Sienge.
4. Campos já preenchidos manualmente NÃO são sobrescritos.
5. Backfill executado: clientes vinculados com número no Sienge passam a ter `telefone`/`whatsapp` preenchidos.
6. typecheck e lint limpos nos arquivos da story.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.20-...yml`, quality_score 95)
- **typecheck/lint:** limpos nos 2 arquivos.
- **API Sienge:** confirmado `phones[]` (chamada real em 3 clientes).
- **Backfill em prod:** 59 atualizados, 0 erros; cobertura 11→67 (telefone) e 8→67 (whatsapp) dos 70 vinculados.

## File List
- `packages/web/src/lib/integrations/sienge/types.ts`
- `packages/web/src/lib/integrations/sienge/sync.ts`
