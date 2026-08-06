# Story — Nicole reconhece, mas NÃO oferece, empreendimento em planejamento

**Status:** Done
**Tipo:** Guardrail de IA (contexto dinâmico)
**Epic:** Nicole / Agente comercial
**Story ID:** 75-281
**Complexidade:** XS (1 função, 2 condições; sem migration, sem mudança de contrato)

## Contexto

Em 06/08/2026 o diretor pediu o cadastro de **dois empreendimentos novos em planejamento** — Solun e Japura
— só para que leads da IMOB ou da HOUSE já pudessem ser vinculados a eles. Foram criados em produção com o
mínimo: `status = planning`, `address = "A definir"`, sem conceito, descrição, tipologias ou unidades.

O efeito colateral foi identificado na hora: **`loadProperties` (`pipeline.ts:1612`) filtra apenas por
`org_id` e `is_active`, sem olhar `status`.** Ou seja, os dois entraram no contexto da Nicole no mesmo
instante em que foram criados, e ela poderia passar a oferecê-los a qualquer lead — com endereço
"A definir" e nenhum dado concreto. É o risco já registrado como "property oca a Nicole vende".

### Por que NÃO se resolve filtrando `planning` da query

Foi a primeira ideia e ela tem um custo alto: **a lista devolvida por `loadProperties` é a mesma que
alimenta `identify-property`** (uma única chamada, `pipeline.ts:539`, passada adiante). Filtrar na origem
faria a Nicole **parar de reconhecer o nome**: o lead escreve "quero saber do Solun", nada casa, o
`property_interest` não é preenchido e ela responde como se o empreendimento não existisse — exatamente na
fase em que se capta interesse.

**Decisão do diretor:** manter no contexto para reconhecer e vincular, e marcar o bloco com instrução
explícita de não ofertar. O vínculo manual pela tela nunca dependeu disso e segue igual.

### Segundo defeito, encontrado no mesmo trecho

`pipeline.ts:1899` — `if (totalU > 0 && availU === 0)` empurra
*"Estoque: ESGOTADO (sem unidades disponiveis)"*. Um empreendimento em planejamento com `total_units`
preenchido mas **sem unidades cadastradas** cai exatamente aí: a Nicole diria que **Solun está esgotado**.
É o próximo passo natural do diretor (preencher o total de unidades), então entra nesta story.
Não afeta Vind nem Yarden (ambos `selling`, com unidades cadastradas).

## Acceptance Criteria

1. **AC1** — Empreendimento com `status = planning` continua no contexto (a Nicole **reconhece** o nome e o
   `identify-property` segue funcionando).
2. **AC2** — O bloco desse empreendimento traz instrução explícita de **não ofertar por iniciativa
   própria**, e de, quando perguntado, dizer que as informações ainda não foram liberadas, registrar o
   interesse e oferecer avisar no lançamento.
3. **AC3** — A instrução proíbe **inventar** plantas, preços, metragens e previsão de entrega.
4. **AC4** — `status = planning` **nunca** produz a linha "Estoque: ESGOTADO", mesmo com `total_units`
   preenchido e zero unidades cadastradas. Idem para `launching` (pré-lançamento sem unidades não está
   esgotado).
5. **AC5** — Nenhuma mudança para `selling`, `delivered` ou `sold_out`: os blocos desses continuam idênticos.
6. **AC6** — Sem migration, sem mudança de assinatura de função, sem alteração no prompt estático.
7. **AC7** — Testes cobrindo AC1–AC5.

## Tasks

- [x] `pipeline.ts` — `buildPropertyDataContext`: bloco de instrução para `status = planning`.
- [x] `pipeline.ts` — guard de ESGOTADO: exige `!isPreLaunch`.
- [x] `property-data-context.test.ts` — 6 testes novos.
- [x] Suíte completa + type-check + lint.

## Out of Scope

- **Não** filtrar `planning` em `loadProperties` (custo explicado acima).
- **Não** mexer no prompt estático (`PROPERTY_PRESENTATION_PROMPT`) nem em `agent_prompts` no banco — a
  instrução entra no contexto dinâmico, que é montado por empreendimento. Ver
  [[project-nicole-guardrails-db]] para o caso em que a mudança precisa ir ao banco também.
- **Não** mexer na biblioteca de mídia (`send-library-media.ts` tem query própria de properties).
- **Não** alterar o cadastro de Solun/Japura em produção.

## Dev Notes

- `buildPropertyDataContext` é exportada e já tem teste próprio (`property-data-context.test.ts`,
  Stories 75-64/75-65) — o padrão de teste é chamar a função e asseverar sobre o texto gerado.
- O arquivo escreve **sem acentos** no texto de contexto (ex.: "comercializacao", "lancamento"). Mantido.
- A instrução é guardrail de prompt, não filtro determinístico: depende do modelo obedecer. Foi a escolha
  consciente do diretor, para preservar o reconhecimento do nome.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-06 | 0.1 | Story criada após o cadastro de Solun/Japura expor que `loadProperties` ignora `status`. | @sm (River) |
| 2026-08-06 | 0.2 | Validada: alternativa mais barata (filtrar na query) avaliada e recusada com motivo técnico registrado. **GO**. | @po (Pax) |
| 2026-08-06 | 1.0 | Implementado: bloco de instrução para `planning` + guard de ESGOTADO exigindo `!isPreLaunch`. 6 testes novos. | @dev (Dex) |
| 2026-08-06 | 1.1 | Gate **PASS** (8/10). Concern principal: guardrail de prompt, não filtro — conferir no primeiro lead que mencionar Solun/Japura. | @qa (Quinn) |
| 2026-08-06 | 1.2 | PR #371 squash-merged em `main` pelo diretor. Deploy de produção disparado. **Done**. | @devops (Gage) |

## Dev Agent Record

### File List
- `packages/ai/src/chat/pipeline.ts`
- `packages/ai/src/chat/property-data-context.test.ts`
- `docs/stories/nicole-nao-oferece-empreendimento-planejamento.story.md` (novo)
- `docs/qa/gates/nicole-nao-oferece-empreendimento-planejamento.yml` (novo)

## QA Results

_(preenchido pelo @qa abaixo)_

### Review Date: 2026-08-06 — Reviewed By: Quinn

| Check | Veredito | Evidência |
|-------|----------|-----------|
| Code review | PASS | 2 mudanças cirúrgicas em `buildPropertyDataContext`; nenhuma assinatura alterada. |
| Unit tests | PASS | 144 files / 1782 tests. 6 novos. |
| Acceptance criteria | PASS | AC1–AC7. |
| No regressions | PASS | AC5 prova que `selling` não muda; `loadProperties` intocado → `identify-property` intacto. |
| Security | PASS | n/a. |
| Documentation | PASS | Story + gate + comentários citando a story no código. |

Build: `next build` Compiled successfully in 16.5s · `vitest` 1782 pass · `tsc --noEmit` limpo em `packages/ai` e `packages/web`.

**Concerns (não bloqueiam):**
1. É guardrail de **prompt**, não filtro determinístico — depende do modelo obedecer. Escolha consciente para preservar o reconhecimento do nome.
2. Conferir no primeiro lead real que mencionar Solun ou Japura. Se ela ofertar mesmo assim, a saída é separar catálogo ofertável de lista de reconhecimento.
3. `packages/ai` fica fora do escopo do eslint do projeto ("outside of base path") — validado só por `tsc`.

Gate: PASS → `docs/qa/gates/nicole-nao-oferece-empreendimento-planejamento.yml`
— Quinn 🛡️
