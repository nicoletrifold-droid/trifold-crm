# Story 75-64 — Nicole: copy de escassez ao falar de estoque (todos os empreendimentos)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** S (2-3 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]

## Story
**As a** gestão comercial (e diretoria), **I want** que a Nicole (IA), ao falar de disponibilidade de
unidades, **gere sensação de escassez/exclusividade** em vez de apresentar o estoque como abundância,
**so that** o lead perceba urgência ("restam poucas") e não a impressão de que "ainda há muita unidade pra
vender" — aumentando a conversão para visita.

## Contexto
Em conversa real (lead "Helena", Vind), a Nicole respondeu: *"O Vind ainda tem 13 unidades disponíveis,
então tem boas opções para escolher."* O número está **CORRETO** — verificado em produção: Vind tem 13
`available` / 35 `sold` / 48 total (mesma tabela `units` que alimenta a tela de Imóveis; **não há bug de
dados**). O problema é de **copywriting**: dizer "ainda tem 13 disponíveis" passa **abundância** e mata a
urgência. O correto é ancorar no que **já foi vendido** e tratar o que sobra como **últimas oportunidades**.

A regra deve valer para **TODOS os empreendimentos** (Vind, Yarden e futuros), não só o Vind.

**Tom definido pelo usuário (2026-06-26): SUTIL** — sem pressão pesada e sem soltar número cru; foco em
procura/exclusividade ("é bem concorrido, boa parte já foi"), convite a conhecer antes que acabe.

**⚠️ Pegadinha (registrada em memória `nicole-guardrails-db`):** o prompt que roda em produção **NÃO é o
arquivo `.ts`** — é o override no banco (`agent_prompts`, slug `property-presentation`, org
`00000000-0000-0000-0000-000000000001`, hoje com 2688 chars). **Editar só o código não muda nada em prod.**
A correção precisa ir ao **banco** (via migration), e o arquivo `.ts` deve ser atualizado em paralelo para
manter paridade (orgs sem override / dev local).

## Escopo
**IN:**
1. **`packages/ai/src/chat/pipeline.ts` (linha ~1307)** — reescrever a linha de estoque do contexto dinâmico
   (`buildPropertyDataContext`) para já entregar o dado "mastigado" como escassez: calcular `% vendido`,
   priorizar o "X de Y já vendidas" e instruir o uso sutil. Aplica-se automaticamente a todo empreendimento.
   - **De:** `Unidades: ${available} disponiveis, ${reserved} reservadas, ${sold} vendidas (total: ${total})`
   - **Para:** `Estoque (use com SUTILEZA para exclusividade/escassez, NUNCA como abundancia nem numero cru): ${sold} de ${total} unidades ja vendidas (${pctSold}% vendido), restam apenas ${available} disponiveis`
   - `pctSold = total > 0 ? Math.round((sold/total)*100) : 0`. Tratar `total === 0` (sem unidades cadastradas):
     omitir a linha ou usar fallback sem `%` — não exibir "0% vendido, restam 0".
2. **`packages/ai/src/prompts/property-presentation.ts`** — adicionar a seção `### ESCASSEZ E EXCLUSIVIDADE`
   (texto abaixo, em Dev Notes) ao final do `PROPERTY_PRESENTATION_PROMPT`, mantendo paridade com o banco.
3. **`supabase/migrations/120_nicole_copy_escassez_property_presentation.sql`** — `UPDATE agent_prompts`
   idempotente que **acrescenta** a mesma seção `### ESCASSEZ E EXCLUSIVIDADE` ao `content` da linha
   `slug='property-presentation'` (org `...0001`), **sem** sobrescrever o restante e **sem** duplicar se já
   existir (guardar com `WHERE content NOT LIKE '%ESCASSEZ E EXCLUSIVIDADE%'`).
4. **`packages/ai/src/chat/pipeline.test.ts`** (ou novo `property-data-context.test.ts`) — criar teste de
   `buildPropertyDataContext` cobrindo: (a) formato novo com `% vendido` e "restam apenas N"; (b) `total=0`
   (fallback); (c) que NÃO emite mais a string antiga "disponiveis, ... reservadas, ... vendidas (total:".

**OUT:**
- **Nenhuma mudança em dados de estoque** — os números (13/35/48) estão corretos; isto é só copy/contexto.
- Não alterar `loadProperties` (a contagem ao vivo de `units.status` continua igual).
- Não mexer nos outros prompts (`guardrails`, `qualification-flow`, etc.) nesta story.
- Não tornar o tom agressivo — foi decidido **sutil** (sem "quase esgotado!", sem pressão).

## Acceptance Criteria
1. **Given** o contexto dinâmico montado por `buildPropertyDataContext`, **when** um empreendimento tem
   `total_units > 0`, **then** a linha de estoque traz "`{sold} de {total} unidades ja vendidas ({pct}% vendido),
   restam apenas {available} disponiveis`" e a instrução de usar com sutileza/escassez — e **não** contém mais
   a frase antiga "`{n} disponiveis, {n} reservadas, {n} vendidas (total: {n})`".
2. **Given** um empreendimento com `total_units = 0` (ou nulo), **when** monta o contexto, **then** não exibe
   "0% vendido, restam 0 disponiveis" (usa fallback ou omite a linha) — sem divisão por zero.
3. **Given** o prompt `property-presentation` (no banco E no `.ts`), **when** Nicole fala de disponibilidade,
   **then** ela ancora no que já foi vendido / exclusividade (tom sutil) e **nunca** apresenta as unidades
   disponíveis como abundância ("ainda temos X, tem boas opções").
4. **Given** a migration 120 aplicada, **when** consultado `agent_prompts` (slug `property-presentation`,
   org `...0001`), **then** o `content` contém a seção `### ESCASSEZ E EXCLUSIVIDADE` exatamente uma vez
   (re-rodar a migration não duplica).
5. **Given** os números reais (escassez é enquadramento, não invenção), **when** Nicole cita estoque, **then**
   usa apenas os valores do bloco "DADOS ATUALIZADOS" — sem inventar/exagerar unidades vendidas.
6. typecheck/lint/vitest limpos.

## Dev Notes
- **Onde o número nasce:** `pipeline.ts:loadProperties` (~1066) conta `units.status==='available'` ao vivo;
  `buildPropertyDataContext` (~1277-1347) formata. A linha a trocar é a **1307**.
- **Texto da nova seção** (adicionar ao fim de `PROPERTY_PRESENTATION_PROMPT` e via migration ao `content` do banco):

```
### ESCASSEZ E EXCLUSIVIDADE (vale para TODOS os empreendimentos)
A disponibilidade e um argumento de venda — use de forma SUTIL, sem pressao e sem soltar numero cru.
- NUNCA diga "ainda temos X unidades disponiveis" como se sobrasse muito: isso passa abundancia e tira o valor.
- Enquadre como procura/exclusividade, ancorando no que JA FOI VENDIDO: "o Vind e bem concorrido, boa parte das unidades ja foi", "restaram poucas opcoes especiais".
- Convide a conhecer antes que acabe, sem pressionar: "seria otimo voce conhecer antes que essas ultimas saiam".
- Use isso so quando fizer sentido na conversa — nao repita em toda mensagem.
- Se o lead perguntar o numero exato de disponiveis, pode confirmar com naturalidade, mas sempre enquadrando como procura ("ja saiu boa parte, restam algumas"), nunca como "tem bastante".
- HONESTIDADE: baseie-se SEMPRE nos numeros reais do bloco "DADOS ATUALIZADOS". Nunca invente nem exagere o quanto foi vendido.
```

- **Org alvo da migration:** `00000000-0000-0000-0000-000000000001` (mesma das demais seeds). Para aplicar em
  prod sem CLI, usar Supabase Management API com PAT (memória `project-migrations`) — responsabilidade @devops.
- **Paridade código↔banco:** o banco mascara o código (bank-with-fallback, Story 53-1). Atualizar os dois evita
  divergência se o override for removido no futuro.

### Testing
- `vitest` no pacote `packages/ai` (novo teste de `buildPropertyDataContext`) + `typecheck` + `lint`.
- Migration idempotente: re-rodar não duplica a seção (validar com o `WHERE ... NOT LIKE`).
- Verificação manual sugerida pós-deploy: nova conversa de teste perguntando disponibilidade do Vind — Nicole
  deve responder no tom sutil (procura/exclusividade), sem "ainda tem 13 disponíveis".

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.64-nicole-escassez-copy-estoque.yml`) · readiness 9/10
- 7/7 checagens OK. **317/317 testes verdes** (inclui novo `property-data-context.test.ts`, 4 casos); type-check/lint limpos.
- AC1/AC2/AC2b cobertos por teste; AC3/AC5 por inspeção do prompt (`.ts` + migration); AC4 pelo guard idempotente `NOT LIKE`.
- **Observações (low):** (1) alteração futura do texto exige nova migration (guard não regrava); (2) copy só vale em prod após aplicar a migration 120 (banco mascara código).
- **Pendente @devops:** aplicar migration 120 + deploy; Status → Done só após push.

## Riscos
- **Migration sobrescrever o prompt inteiro:** se o `UPDATE` usar `content = '...'` em vez de append, perde os
  2688 chars atuais. Mitigação: usar `content = content || '...'` (concatena) com guard `NOT LIKE`. **Médio** —
  revisar SQL no QA.
- **Divergência código↔banco:** se só um dos dois for atualizado, o comportamento em prod (banco) diverge do
  dev (código). Mitigação: AC4 + atualizar ambos na mesma story. **Baixo.**
- **Tom interpretado como agressivo pela IA:** o LLM pode exagerar a escassez. Mitigação: texto enfatiza
  "SUTIL", "sem pressao", "so quando fizer sentido". Validar na conversa de teste pós-deploy. **Baixo.**
- **Quebra de teste/snapshot existente:** não há teste atual de `buildPropertyDataContext` (confirmado por
  grep), então baixo risco de regressão silenciosa; o novo teste cobre o formato. **Baixo.**

## File List
- `packages/ai/src/chat/pipeline.ts` — `buildPropertyDataContext` (~1307): linha de estoque reescrita p/
  escassez (ancora no `% vendido` + "restam apenas N"); guard `total>0`/fallback p/ `total=0`; função
  **exportada** para teste. Comentário cita Story 75-64.
- `packages/ai/src/prompts/property-presentation.ts` — adicionada seção `### ESCASSEZ E EXCLUSIVIDADE` (paridade c/ banco).
- `supabase/migrations/120_nicole_copy_escassez_property_presentation.sql` — `UPDATE agent_prompts` idempotente
  (append c/ guard `NOT LIKE '%ESCASSEZ E EXCLUSIVIDADE%'`).
- `packages/ai/src/chat/property-data-context.test.ts` — **novo**; 4 casos (formato novo, total=0, fallback, lista vazia).

## Dev Agent Record
- **Agent Model:** Claude Opus 4.8 (1M)
- **Completion Notes:**
  - Dado de estoque confirmado correto em prod antes de implementar (Vind 13 avail / 35 sold / 48 total) — escopo é só copy.
  - `buildPropertyDataContext` exportada (era privada) p/ permitir teste unitário; nenhum call-site alterado.
  - `total=0` tratado: usa fallback "restam apenas N" se houver disponíveis, senão omite a linha (sem `NaN`/divisão por zero).
  - **Validação local:** `vitest packages/ai` → **317/317 verdes** (incl. novo `property-data-context.test.ts`, 4 casos); `type-check` e `lint` (tsc --noEmit) limpos.
  - **Migration 120 NÃO aplicada em prod** — responsabilidade @devops no deploy (Supabase Management API + PAT, memória `project-migrations`). É o que faz a copy valer em produção (banco mascara o código).

## Change Log
- 2026-06-26 — @sm — Story criada. Copy de escassez (tom SUTIL) ao falar de estoque, válida p/ todos os
  empreendimentos: reescrita da linha de contexto (`pipeline.ts:1307`) + seção no prompt (`.ts` + migration 120
  no banco `agent_prompts`). Dado verificado correto (13/35/48), problema é só copywriting. Ver memórias
  [[project-nicole-relacionamento]] e [[nicole-guardrails-db]].
- 2026-06-26 — @po — Validação (checklist 10 pontos): **GO**, score 9/10. Título claro; problema/contexto
  completos (inclui verificação de que o dado está correto); 6 ACs testáveis em Given/When/Then; escopo IN/OUT
  bem delimitado; dependência crítica mapeada (banco mascara código — `nicole-guardrails-db`); complexidade S;
  valor de negócio claro (conversão p/ visita); riscos documentados (incl. risco da migration sobrescrever);
  DoD claro; alinhado ao Epic 75/Nicole. Status Draft → Ready. Sem bloqueios.
- 2026-06-26 — @dev — Implementado: reescrita da linha de estoque (`pipeline.ts:1307`, ancora no % vendido +
  "restam apenas N", fallback p/ total=0); seção ESCASSEZ no prompt `.ts`; migration 120 (append idempotente no
  `agent_prompts`); novo teste `property-data-context.test.ts`. 317/317 verdes, type-check/lint limpos. `buildPropertyDataContext` exportada. Status Ready → Review.
- 2026-06-26 — @qa — Gate **PASS** (9/10), 7/7 checagens OK, 317/317 testes. 2 observações low (migration não
  regrava texto; copy depende de aplicar a migration em prod). Pendente @devops: migration 120 + deploy. Status segue Review até push.
- 2026-06-26 — @devops — PR #45 (squash) merged na main → deploy Vercel. **Migration 121** (era 120, renumerada
  no PR #46 por colisão com `120_phone_normalization_zero_fix.sql` da Story 25-4) **aplicada em prod** via
  Management API; verificado: seção ESCASSEZ presente 1× em `agent_prompts` (idempotência confirmada re-rodando).
  Copy da Nicole **LIVE em prod**. Status Review → **Done**.
