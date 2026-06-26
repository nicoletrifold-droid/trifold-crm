# Story 75-65 — Nicole: copy de lançamento p/ empreendimento com poucas vendas

## Metadata
- **Status:** Review · **Epic:** 75 · **Branch:** main · **Complexidade:** S (2-3 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]

## Story
**As a** gestão comercial, **I want** que, para um empreendimento **em lançamento / com poucas vendas**, a
Nicole **não** use o argumento "X% vendido / restam N unidades" (que sinalizaria **abundância**), e sim um
enquadramento de **oportunidade de lançamento**, **so that** a copy de escassez (Story 75-64) não se inverta
quando um empreendimento novo (3º, 4º…) entrar com estoque cheio.

## Contexto
A Story 75-64 fez a Nicole ancorar a escassez no que **já foi vendido** ("35 de 48 já vendidas, restam apenas
13"). Isso funciona porque os 2 empreendimentos atuais estão muito vendidos (Vind 73%, Yarden 85%). **Mas** num
**lançamento novo com pouca venda** (ex.: 60 unidades, 0 vendidas) a mesma lógica geraria *"0% vendido, restam
apenas 60 disponíveis"* — exatamente a **abundância** que queremos evitar.

O sistema já carrega e formata **todos** os empreendimentos da org automaticamente (`loadProperties` por
`org_id`; `buildPropertyDataContext` em loop) — confirmado na 75-64. Falta só **adaptar o enquadramento ao
estágio de vendas** do empreendimento, de forma genérica (vale p/ futuros).

**Tom:** segue **SUTIL** (decisão 75-64). Esta story NÃO muda dados; é continuação da copy de escassez.

**⚠️ Banco mascara o código** (bank-with-fallback / Story 53-1): a copy efetiva em prod é o `agent_prompts`;
exige migration além do `.ts`. Ver [[nicole-guardrails-db]] e [[project-nicole-escassez-copy]].

## Escopo
**IN:**
1. **`packages/ai/src/chat/pipeline.ts`** (`buildPropertyDataContext`, linha de estoque) — ramificar o
   enquadramento por estágio de vendas, com constante nomeada `SCARCITY_SOLD_THRESHOLD = 40` (% vendido):
   - **Esgotado** (`available === 0` e `total > 0`): sinalizar esgotado / lista de espera.
   - **Maduro/bem vendido** (`pctSold >= 40` e não pré-lançamento): mantém a linha da 75-64
     ("`{sold} de {total} já vendidas ({pct}% vendido), restam apenas {available}`").
   - **Lançamento / poucas vendas** (`pctSold < 40` **ou** status `planning`/`launching`): **NÃO** citar
     `% vendido` baixo nem o número de disponíveis; instruir enquadramento de **oportunidade de lançamento**
     (entrar cedo, melhores plantas/andares, condições de lançamento, exclusividade, valorização).
   - `total === 0` com `available > 0`: fallback "restam apenas {N}".
2. **`packages/ai/src/prompts/property-presentation.ts`** — na seção `### ESCASSEZ E EXCLUSIVIDADE`, acrescentar
   um bullet para o caso **lançamento/poucas vendas** (não usar "já vendemos X", não citar quantas restam;
   enquadrar como oportunidade de lançamento/fase inicial).
3. **`supabase/migrations/122_nicole_copy_lancamento.sql`** — `UPDATE agent_prompts` idempotente que
   **acrescenta** o mesmo bullet ao `content` do slug `property-presentation` (guard `NOT LIKE` do trecho novo).
4. **`packages/ai/src/chat/property-data-context.test.ts`** — novos casos: (a) `pctSold` baixo → enquadramento
   de lançamento, **sem** "% vendido" e **sem** "restam apenas N"; (b) `available=0` → esgotado; (c) caso maduro
   (75-64) **mantém** o formato atual (regressão).

**OUT:**
- Não mudar dados/estoque (segue contagem ao vivo de `units`).
- Não tornar o tom agressivo (segue sutil).
- Não criar UI para configurar o threshold (constante em código por ora).
- Não mexer no `loadProperties` (já é org-wide).

## Acceptance Criteria
1. **Given** um empreendimento com `pctSold >= 40` e não pré-lançamento, **when** monta o contexto, **then** a
   linha de estoque é a da 75-64 (ancora no vendido) — **sem regressão** (Vind 73% e Yarden 85% inalterados).
2. **Given** um empreendimento com `pctSold < 40` **ou** status `planning`/`launching` (e `available > 0`),
   **when** monta o contexto, **then** a linha **não** contém "% vendido" nem "restam apenas {N}", e instrui
   enquadramento de **oportunidade de lançamento**.
3. **Given** `available === 0` e `total > 0`, **when** monta o contexto, **then** a linha sinaliza **esgotado**
   (sem "restam apenas 0").
4. **Given** o prompt `property-presentation` (banco E `.ts`), **when** Nicole fala de um lançamento/poucas
   vendas, **then** ela **não** usa "já vendemos X" nem cita quantas restam — enquadra como oportunidade de
   lançamento (tom sutil).
5. **Given** a migration 122 aplicada, **when** consultado `agent_prompts`, **then** o trecho de lançamento
   aparece exatamente uma vez (re-rodar não duplica).
6. typecheck/lint/vitest limpos (incl. caso de regressão do empreendimento maduro).

## Dev Notes
- **Constante:** `SCARCITY_SOLD_THRESHOLD = 40` no topo da função/módulo, comentada ("abaixo disso, 'vendido' não
  gera escassez — usar enquadramento de lançamento"). Escolha conservadora; ajustável depois.
- **Detecção de pré-lançamento:** `status === "planning" || status === "launching"`. Atenção: hoje Vind e Yarden
  estão como `selling` (mesmo o Yarden recém-lançado) — por isso o **threshold de % vendido** é o sinal primário,
  e o status pré-lançamento é um override adicional.
- **Texto do bullet** (adicionar à seção ESCASSEZ E EXCLUSIVIDADE, no `.ts` e via migration):

```
- EMPREENDIMENTO EM LANCAMENTO / POUCAS VENDAS: NAO use "ja vendemos X" (nao faz sentido) nem cite quantas unidades restam (soa abundancia). Enquadre como OPORTUNIDADE DE LANCAMENTO: entrar cedo, escolher as melhores plantas/andares, condicoes especiais de lancamento, exclusividade e potencial de valorizacao.
```

- **Texto sugerido da linha de contexto (lançamento):**
  `Estoque (LANCAMENTO/fase inicial — NUNCA cite quantas restam nem o % vendido baixo, soa abundancia): enquadre como oportunidade de entrar cedo (melhores plantas/andares/condicoes de lancamento), exclusividade e valorizacao.`
- **Esgotado:** `Estoque: ESGOTADO (sem unidades disponiveis) — ofereca lista de espera / proximos lancamentos.`
- Reuso: estende [[project-nicole-escassez-copy]] (75-64). Migration via Management API + PAT no deploy (@devops).

### Testing
- `vitest packages/ai` (estender `property-data-context.test.ts`) + `type-check` + `lint`.
- Migration idempotente (guard `NOT LIKE`).
- Verificação manual pós-deploy: simular/checar um empreendimento de baixa venda (quando houver) → Nicole não cita
  "restam N"; usa enquadramento de lançamento.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.65-nicole-copy-lancamento-baixa-venda.yml`) · readiness 9/10
- 7/7 checagens OK. **321/321 testes verdes** (+4 casos novos, incl. regressão do caso maduro); type-check/lint limpos.
- 2 observações low: threshold heurístico (40%) — lado seguro do erro; regra preventiva (não dispara hoje, ativa em lançamento futuro).
- **Pendente @devops:** aplicar migration 122 + deploy; Status → Done só após push.

## Riscos
- **Threshold arbitrário (40%):** empreendimento maduro mas só 30% vendido cairia no enquadramento de lançamento.
  É o lado **seguro** do erro (evita sinalizar abundância). Mitigação: constante nomeada, fácil de ajustar. **Baixo.**
- **Migration sobrescrever prompt:** usar `content = content || '...'` com guard `NOT LIKE`. **Médio** — revisar no QA.
- **Divergência código↔banco:** atualizar ambos na mesma story (AC5). **Baixo.**
- **Regressão na linha madura (75-64):** coberto por teste de regressão (AC1/AC6). **Baixo.**

## File List
- `packages/ai/src/chat/pipeline.ts` — constante `SCARCITY_SOLD_THRESHOLD = 40`; linha de estoque ramificada em
  4 casos (esgotado / maduro≥40% / lançamento<40% ou pré-lançamento / fallback total=0).
- `packages/ai/src/prompts/property-presentation.ts` — bullet "EMPREENDIMENTO EM LANCAMENTO / POUCAS VENDAS" na seção ESCASSEZ.
- `supabase/migrations/122_nicole_copy_lancamento.sql` — append idempotente do bullet (guard `NOT LIKE '%EMPREENDIMENTO EM LANCAMENTO%'`).
- `packages/ai/src/chat/property-data-context.test.ts` — +4 casos (regressão maduro, lançamento <40%, status pré-lançamento, esgotado).

## Dev Agent Record
- **Agent Model:** Claude Opus 4.8 (1M)
- **Completion Notes:**
  - Threshold primário = `% vendido < 40`; `status` `planning`/`launching` é override adicional (Vind/Yarden hoje são `selling`).
  - Regressão garantida: Vind (73%) e Yarden (85%) seguem na linha 75-64 (teste AC1).
  - Falso-positivo de teste corrigido: a instrução de lançamento contém a frase "% vendido baixo"; a asserção passou a checar percentual **numérico** (`/\d+% vendido/`), não o substring.
  - **Validação local:** `vitest packages/ai` → **321/321 verdes**; `type-check`/`lint` limpos.
  - **Migration 122 NÃO aplicada em prod** — @devops no deploy. Não há empreendimento de baixa venda hoje, então é regra preventiva (ativa sozinha quando um entrar).

## Change Log
- 2026-06-26 — @sm — Story criada. Continuação da 75-64: enquadramento por estágio de vendas
  (maduro→vendido / lançamento→oportunidade / esgotado). Genérico p/ futuros empreendimentos. Ver
  [[project-nicole-escassez-copy]] e [[nicole-guardrails-db]].
- 2026-06-26 — @po — Validação (checklist 10 pontos): **GO**, 9/10. Título/contexto claros; 6 ACs Given/When/Then
  testáveis (inclui regressão do caso maduro); escopo IN/OUT bem delimitado; dependência mapeada (estende 75-64,
  banco mascara código); complexidade S; valor claro (evita inverter escassez em lançamento); riscos documentados
  (threshold, migration, divergência, regressão); DoD claro; alinhado ao Epic 75. Status Draft → Ready.
- 2026-06-26 — @dev — Implementado: `SCARCITY_SOLD_THRESHOLD=40` + linha de estoque em 4 ramos (esgotado/maduro/
  lançamento/fallback); bullet de lançamento no prompt; migration 122; +4 testes. 321/321 verdes. Status Ready → Review.
- 2026-06-26 — @qa — Gate **PASS** (9/10), 7/7 OK, 321/321 testes. 2 obs low (threshold heurístico; regra
  preventiva). Pendente @devops: migration 122 + deploy. Status segue Review até push.
