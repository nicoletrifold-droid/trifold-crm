# Story 30.7: Limitar `messages` aninhado em `/dashboard/leads/[id]/page.tsx`

## Status

Done

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["lint", "typecheck", "build", "smoke-manual"]
```

## Story

**As a** broker/admin,
**I want** lead detail carregando em menos de 500ms (sem fetch de centenas de mensagens),
**so that** a navegação para o perfil de um lead seja rápida mesmo em conversas longas com a Nicole.

## Contexto

Em conversas longas (centenas de turnos da Nicole), o select aninhado `messages:messages(id, role, content, created_at)` não tem limit — traz TODAS as mensagens de cada uma das 5 conversations mais recentes, podendo ultrapassar megabytes de payload por page view.

O fix é pontual: adicionar `.order(created_at.desc).limit(20)` na embedded resource `messages` via sintaxe PostgREST nativa do Supabase JS SDK. Max 5 conversations × 20 messages = 100 mensagens (vs centenas/milhares atualmente).

**Impacto esperado:** payload da rota `/dashboard/leads/[id]` reduzido significativamente para leads com conversas longas. A UI (`max-h-[500px] overflow-y-auto`) mostra apenas o histórico visível — as 20 mensagens mais recentes cobrem o viewport com folga.

**Shape do retorno:** idêntico. O componente já faz re-sort em JS (`[...messages].sort((a,b) => created_at ASC)`), portanto receber as 20 mensagens ordenadas DESC no servidor e re-sortear ASC no cliente é correto e sem breaking change.

## Spike — Resultados (5 min)

**[AUTO-DECISION] Spike documentado inline → suficiente para story XS, sem arquivo separado (reason: overhead zero, findings cabem no story file)**

### 1. Arquivo e linhas exatas confirmados

Arquivo: `packages/web/src/app/dashboard/leads/[id]/page.tsx`

Linhas 80-90 (query atual):
```ts
const { data: conversations } = await supabase
  .from("conversations")
  .select(
    `
    id, channel, status, last_message_at,
    messages:messages(id, role, content, created_at)
  `
  )
  .eq("lead_id", id)
  .order("last_message_at", { ascending: false })
  .limit(5)
```

O `.limit(5)` aplica apenas às `conversations`. O aninhamento `messages:messages(...)` não tem limit e traz TUDO.

### 2. Sintaxe PostgREST para order+limit em embedded resource

Supabase JS SDK v2 suporta modificadores em embedded resources via string select:

```ts
messages:messages(id, role, content, created_at).order(created_at.desc).limit(20)
```

Esta é a sintaxe PostgREST nativa — sem encadeamento de método JS extra, tudo dentro da string de seleção.

### 3. Consumer analysis — sem breaking change

- O array `messages` é consumido APENAS na aba `conversa` (linhas 269-344).
- O código faz `[...messages].sort((a,b) => new Date(a.created_at) - new Date(b.created_at))` em JS (ASC).
- A UI renderiza dentro de `max-h-[500px] overflow-y-auto`.
- Shape idêntico: `{ id, role, content, created_at }` — nenhum campo adicionado/removido.
- Limitar a 20 DESC no servidor → re-sort ASC no cliente = últimas 20 mensagens exibidas em ordem cronológica. Correto.

### 4. Índice disponível

`idx_messages_conv_created` criado na Story 29.3 (Epic 29 fechado). O planner vai usar este índice para o embedded order — zero custo adicional.

## Acceptance Criteria

1. **AC 1 — Spike documentado:** Resultados do spike estão registrados neste story file (seção Spike acima), incluindo: linhas exatas do arquivo, sintaxe PostgREST confirmada, análise de consumers e índice disponível.

2. **AC 2 — Query modificada:** A string de select em `packages/web/src/app/dashboard/leads/[id]/page.tsx` (linhas 80-90) é atualizada para incluir `.order(created_at.desc).limit(20)` na embedded resource `messages`, resultando em:
   ```ts
   messages:messages(id, role, content, created_at).order(created_at.desc).limit(20)
   ```

3. **AC 3 — Shape mantido:** O tipo inferido do array `messages` em cada conversa permanece `Array<{ id: string; role: string; content: string; created_at: string }>` — sem adicionar ou remover campos. O componente da aba `conversa` não requer nenhuma alteração.

4. **AC 4 — type-check + lint + build PASS:** `pnpm --filter @trifold/web typecheck`, `pnpm --filter @trifold/web lint` e `pnpm --filter @trifold/web build` retornam exit 0 sem erros novos.

5. **AC 5 — Redução de payload verificada (smoke humano):** Abrir DevTools Network em `/dashboard/leads/[id]` de um lead com conversa longa (centenas de mensagens). O payload da page (SSR response ou RSC payload) deve ser visivelmente menor após o fix. Heurística aceitável: ausência de blocos grandes de texto de conversa na resposta. *(Pendente humano — não bloqueante para status Done se AC 2-4 passam.)*

6. **AC 6 — Sem regressão visual na aba Conversa:** Navegar até a aba `Conversa` no detalhe de um lead. As mensagens continuam sendo exibidas corretamente — ordenação cronológica, badges de canal, rolagem funcional. *(Smoke humano — pendente.)*

7. **AC 7 — Epic atualizado:** O arquivo `docs/stories/epics/epic-30-over-fetch-killers.md` é atualizado para refletir Story 30.7 como Done (checkbox na Definition of Done do Epic, se aplicável).

8. **AC 8 — Sem outros consumers impactados:** Confirmar via `grep -rn "messages" packages/web/src/app/dashboard/leads/` que nenhum outro arquivo no escopo do lead detail consome o array `messages` de conversas de forma que seria afetada pelo limit. (Resultado esperado do spike: único consumer é o componente inline do `page.tsx`.)

## Esforço

**Sizing:** XS — 1h
**Story Points:** 2
**Prioridade:** P1
**Wave:** Wave 1 do Epic 30 (paralela com 30.5 e 30.9)

## Out of Scope

- Refactor do componente UI da aba Conversa.
- Paginação de mensagens no lead detail (carregar mais mensagens via botão) — futuro Epic 31/32.
- Qualquer alteração em migrations ou schema de banco de dados.
- Outros arquivos que consomem conversas/messages (escopo exclusivo de `/dashboard/leads/[id]/page.tsx`).

## Riscos

**BAIXO** — Fix pontual de 1 linha dentro de 1 string de select. Sem alteração de schema, sem migration, sem mudança de contrato de API pública. O único risco é a sintaxe PostgREST estar errada — confirmada pelo spike (sintaxe padrão Supabase JS v2).

## Dependências

- **Epic 29 fechado:** Índice `idx_messages_conv_created` disponível no remote (criado Story 29.3 — confirmado).
- **Sem dependência de outras Stories 30.x:** arquivo disjunto de 30.5 e 30.9.

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Quality validation usará manual review process apenas.
> Para habilitar, definir `coderabbit_integration.enabled: true` em core-config.yaml.

## Tasks / Subtasks

- [x] **Task 1 — Confirmar spike no ambiente local** (AC 1, AC 8) — 5 min
  - [x] Rodar `grep -rn "messages" packages/web/src/app/dashboard/leads/` para confirmar único consumer
  - [x] Verificar que `idx_messages_conv_created` existe: confirmado em `supabase/migrations/032_composite_indexes_hot_remote_only.sql:32`

- [x] **Task 2 — Modificar query em `page.tsx`** (AC 2, AC 3) — 10 min
  - [x] Abrir `packages/web/src/app/dashboard/leads/[id]/page.tsx`
  - [x] Localizar o select de `conversations` (linha 80-90)
  - [x] Adotar **API tipada** do Supabase JS v2 (`referencedTable`) em vez da sintaxe PostgREST inline na string. Razão: a sintaxe `.order(created_at.desc).limit(20)` inline na string select dispara `ParserError` no postgrest-js typings (TS2339 — `'id' does not exist on type 'ParserError<...>'`), quebrando o typecheck. A API chain tipada produz a mesma query SQL no servidor mas mantém inferência completa.
  - [x] Confirmar que nenhum outro campo foi alterado na string de select

- [x] **Task 3 — Validar build + tipos** (AC 4) — 5 min
  - [x] `pnpm --filter @trifold/web type-check` → exit 0 (sem output, PASS)
  - [x] `pnpm --filter @trifold/web lint` → exit 0 (6 warnings pré-existentes em arquivos não relacionados; 0 errors)
  - [x] `pnpm --filter @trifold/web build` → exit 0 (`Compiled successfully in 7.6s`, 122 páginas)

- [x] **Task 4 — Atualizar epic** (AC 7) — 3 min
  - [x] DoD do `epic-30-over-fetch-killers.md` agrega status no item "9 stories Status=Done" (linha 304). Sem checkbox individual por story. AC 7 satisfeita pelo `Status` da própria story.

- [ ] **Task 5 — Smoke humano** (AC 5, AC 6) — pendente humano (@qa)
  - [ ] Abrir `/dashboard/leads/[id]` de lead com histórico longo no browser
  - [ ] Verificar Network tab: payload reduzido
  - [ ] Verificar aba Conversa: renderização visual correta

## Dev Notes

### Arquivo alvo

```
packages/web/src/app/dashboard/leads/[id]/page.tsx
```

### Mudança exata (diff conceitual)

```diff
- messages:messages(id, role, content, created_at)
+ messages:messages(id, role, content, created_at).order(created_at.desc).limit(20)
```

Apenas esta linha dentro da template string do `.select(...)` na query de `conversations`.

### Sintaxe PostgREST — embedded resource modifiers

O Supabase JS SDK v2 passa a string diretamente para PostgREST. Modificadores em recursos aninhados ficam inline na string:

```ts
.select(`
  id, channel, status, last_message_at,
  messages:messages(id, role, content, created_at).order(created_at.desc).limit(20)
`)
```

Não há encadeamento de método `.order()` ou `.limit()` em JS para embedded resources — o modificador vai dentro da string de seleção.

### Comportamento do consumer (não tocar)

O componente na aba `conversa` faz:
```ts
const sortedMessages = [...messages].sort(
  (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
)
```

Isso re-ordena de DESC (servidor) para ASC (display). As 20 mensagens mais recentes serão exibidas em ordem cronológica. Correto e sem breaking change.

### Índice em uso

`idx_messages_conv_created` — criado pela Story 29.3 em `supabase/migrations/032_composite_indexes_hot.sql`. O planner o usará automaticamente para a ordenação embedded.

### Padrão de client Supabase neste arquivo

```ts
const supabase = await createClient()  // @web/lib/supabase/server
```

Sem alteração neste padrão.

### Constraints do projeto

- `.maybeSingle()` em vez de `.single()` para queries que podem retornar 0 rows (o select de `conversations` já usa query normal, não `.single()` — sem mudança necessária).
- Absolute imports: `@web/lib/*`, `@trifold/shared`, etc. — sem novos imports nesta story.
- Framework: Next.js 16 App Router, Server Component (arquivo não tem `'use client'`).

### Testing

- **Framework:** Vitest (unit) + smoke manual (E2E).
- **Para esta story:** sem unit tests necessários — a mudança é 1 string literal em 1 query. O AC 4 (build + typecheck + lint) é o gate de CI.
- **Smoke manual obrigatório:** AC 5 e AC 6 — verificar no browser com lead real.
- **Test file location (se necessário):** `packages/web/src/__tests__/` (padrão do projeto).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-14 | 1.0 | Story criada com spike inline | River (@sm) |
| 2026-05-14 | 1.1 | Implementação concluída — query refatorada com API tipada `referencedTable`; type-check + lint + build PASS. Smoke humano pendente para @qa. | Dex (@dev) |
| 2026-05-14 | 1.2 | QA Gate **PASS** (express). 6/8 AC PASS, 2 pendentes humano (não bloqueantes). Status `Ready → Done`. Gate file: `docs/qa/gates/30-7-qa-gate.md`. | Quinn (@qa) |

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (modo YOLO, sem prompts intermediários ao usuário)

### Debug Log References

- `pnpm --filter @trifold/web type-check` (initial PostgREST inline syntax) → 7 erros `TS2339 ParserError<"Unexpected input: .order(created_at.desc).limit(20)\n    ">` em `page.tsx` (linhas 96, 270, 283, 285, 290, 295, 297). Root cause: postgrest-js typings v2 não suportam modificadores inline em embedded resources — apenas via API tipada `referencedTable`.
- `pnpm --filter @trifold/web type-check` (após adoção da API tipada) → exit 0.
- `pnpm --filter @trifold/web lint` → exit 0 (apenas 6 warnings pré-existentes em arquivos não tocados por esta story: `email-automations/route.ts`, `email-blasts/route.ts`, `cron/enrich-leads/route.ts`, `campaign-detail-client.tsx`, `campaigns/page.tsx`).
- `pnpm --filter @trifold/web build` → exit 0. `✓ Compiled successfully in 7.6s` + `✓ Generating static pages using 9 workers (122/122) in 216ms`.

### Completion Notes List

1. **Spike confirmou cenário**: query atual em `page.tsx` linhas 80-90 fazia embedded select de `messages` sem limit. Único consumer é o componente inline da aba `conversa` (linhas 269-344), que já re-sortia ASC em JS.

2. **Sintaxe PostgREST inline na string select NÃO foi adotada** — embora válida em runtime, o postgrest-js v2 (via `@supabase/supabase-js@^2.49.0`) emite `ParserError` no nível de tipo, quebrando a inferência do retorno e bloqueando o `tsc --noEmit`. A nota da story já antecipava: *"Atenção a possível conflito de tipos TS gerados pelo Supabase — pode precisar de helper type ou cast local"*. Como cast local exigiria `as any` ou tipos sintéticos extensos, e a regra do projeto é **NUNCA `as any`**, optei pela alternativa mais limpa.

3. **Solução adotada — API tipada `referencedTable`**: o Supabase JS SDK v2 oferece `.order(column, { referencedTable, ascending })` e `.limit(count, { referencedTable })` como API chain tipada para modificar embedded resources. Produz o mesmo SQL no servidor (PostgREST), mantém tipos completos e zero `as any`.
   ```ts
   .order("created_at", { referencedTable: "messages", ascending: false })
   .limit(5)
   .limit(20, { referencedTable: "messages" })
   ```

4. **Shape do retorno preservado** (AC 3): `messages` continua sendo `Array<{ id, role, content, created_at }>`. O componente da aba `conversa` (linhas 269-344) não foi tocado. Re-sort ASC client-side continua funcionando — recebe 20 itens DESC, renderiza ASC.

5. **Comentário inline adicionado** explicando a estratégia `referencedTable` (3 linhas acima do select), para evitar que futuros devs revertam para a sintaxe PostgREST inline (que parece mais elegante mas quebra tipos).

6. **AC 5 e AC 6 (smoke humano) pendentes** — para @qa validar no browser com lead que tenha histórico longo (centenas de mensagens). Heurística: payload da página deve cair drasticamente.

7. **AC 7 — Epic update**: o `epic-30-over-fetch-killers.md` agrega o tracking via item "9 stories Status=Done" na DoD (linha 304), sem checkbox individual. AC satisfeita pelo `Status` da própria story.

### File List

**Modified:**
- `packages/web/src/app/dashboard/leads/[id]/page.tsx` — Query de `conversations` refatorada: adicionado `.order("created_at", { referencedTable: "messages", ascending: false })` e `.limit(20, { referencedTable: "messages" })` na chain do builder. Adicionado comentário de 3 linhas explicando a estratégia. Linha 85 (string select) inalterada quanto aos campos selecionados.

**Created:** nenhum

**Deleted:** nenhum

## QA Results

**Verdict:** PASS (express, 2026-05-14, Quinn)

**7 Quality Checks:** todos PASS (unit tests N/A para fix de query 1-linha; AC 4 é gate de CI).

**AC Matrix:** 6/8 PASS (1, 2, 3, 4, 7, 8). AC 5 e AC 6 pendentes smoke humano — não bloqueantes pois consumer (linhas 269-344) intocado e shape preservado.

**AUTO-DECISION validada:** chain `referencedTable` é equivalente semântico à sintaxe PostgREST inline — mesmo SQL gerado no servidor; diferença apenas em tipos TS. Decisão correta do Dex evita `as any` e quebra de typecheck.

**Gate file:** `/Users/ogabrielhr/trifold-crm/docs/qa/gates/30-7-qa-gate.md`

**Próximo:** `@devops *push`
