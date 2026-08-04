# Story 75-273 — Fechamento das pendências dos gates de 04/08

**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** S (~3 pts)

---

## Story

Como **quem mantém o CRM**, quero as pendências que os gates de 04/08 registraram **fechadas ou
descartadas com número** — para o backlog de qualidade não virar uma lista que ninguém volta a ler.

---

## Context

O dia 04/08 entregou 5 stories (75-266, 267, 269, 271, 272) e cada gate deixou observações. Esta
story fecha as que valem código e **descarta com medição** as que não valem — porque "risco
latente" registrado e nunca revisitado é dívida que só cresce.

**O princípio aplicado em cada item: medir antes de trabalhar.** Foi o que já pagou duas vezes hoje
(a premissa falsa da 75-269 e a severidade do `nullsFirst` na 75-267).

---

## Os itens

### Item 1 — Guard-rail da whitelist do PATCH (QA-002 das 75-267/75-269)

A 75-269 tirou `lost_reason` da whitelist do `PATCH /api/leads/[id]` (aceitava texto livre sem grupo
e recriava motivo não classificado, desfazendo a 75-264 um lead por vez). Mas a lista era uma
`const` local dentro do handler: **nada impedia alguém de reintroduzir o campo numa story futura** e
a suíte seguir verde. Guard-rail que não é testado é intenção, não regra.

→ `lib/leads/patch-allowed-fields.ts` com `LEAD_PATCH_FORBIDDEN_FIELDS` (campo + **motivo escrito**)
e teste que falha citando o motivo na mensagem.

### Item 2 — Paginar a query de ativos do PDF (QA-003 da 75-271)

O recorte mede **612 leads em toda a base**, longe do teto de 1000 — mas o PDF aceita
`range=custom` com janela arbitrária, a base cresce, e o corte do PostgREST é **silencioso**: o
funil do PDF sairia menor que o da tela sem ninguém saber. Correto por construção custa uma linha,
agora que o `fetchAllLeads` (75-269) está na main.

### Item 3 — O cabeçalho do PDF diz QUEM (QA-004 da 75-271)

Antes anunciava só "Corretor"/"Empreendimento", porque o valor é uuid. Relatório que anuncia o
recorte pela metade ainda obriga a perguntar de quem é. → resolve o nome (uma query por dimensão,
só quando filtrada). Id não resolvido cai no rótulo pelado: **imprimir uuid num relatório que alguém
vai ler é pior que não dizer**.

### Item 4 — Descartar com medição o que não vale (OBS-001 da 75-269)

`executive/route.ts` usa `.limit(1000)` em `appointments` — teto, não paginação. **Medi em prod: a
org tem 59 agendamentos no total** (55 `team=house`). Está a ordens de magnitude de importar.
Corrigir seria churn sem risco eliminado. **Fica registrado no gate com o número**, para quando o
volume mudar.

---

## Acceptance Criteria

- [x] **AC1** — reintroduzir `lost_reason` na whitelist do PATCH **quebra a suíte**, com mensagem
      que explica o motivo (não só "esperava não conter").
- [x] **AC2** — o teste também protege contra o oposto: remover `lost_reason_grupo` por engano ao
      tentar consertar o outro campo.
- [x] **AC3** — a query de ativos do PDF é paginada; nenhum comportamento muda hoje (612 < 1000).
- [x] **AC4** — com filtro de corretor/empreendimento, o cabeçalho do PDF mostra o **nome**; id não
      resolvido mostra só a dimensão, nunca um uuid.
- [x] **AC5** — os 3 gates de 04/08 ficam com `outcome` em cada item: corrigido, ou **descartado com
      o número que justifica**.
- [x] **AC6** — zero migration; nenhuma mudança de comportamento visível fora do cabeçalho do PDF.

---

## Dev Notes

- A whitelist virou `string[]` (não `readonly`) porque `buildUpdatePayload` recebe `string[]`.
  Tornar readonly exigiria mudar a assinatura dele e todos os callers — custo desproporcional para
  um ganho que o teste já garante.
- A rejeição explícita de `lost_reason` no corpo (fix QA-001 da 75-269) **continua**: os dois juntos
  significam que o campo não é gravável **e** quem tenta é avisado. Tirar da lista não bastava,
  porque `buildUpdatePayload` ignora campo não permitido em silêncio.

---

## Dev Agent Record

**Agente:** @dev (Dex) · **Data:** 2026-08-04 · **Modo:** YOLO

⚠️ **Desvio declarado:** @dev direto, sem @sm/@po — como na 75-271. São itens já especificados nos
gates (problema, causa e caminho), sem decisão de produto nova. Registrado para não normalizar.

### Decisões
1. **Motivo escrito junto da proibição.** `LEAD_PATCH_FORBIDDEN_FIELDS` é `campo → motivo`, e um
   teste exige que o motivo tenha substância e cite a story. Regra sem porquê é revertida pelo
   primeiro dev que a achar inconveniente.
2. **Item 4 é entrega, não omissão.** Medir 59 agendamentos e decidir não mexer é resultado: o gate
   passa a ter o número, e a próxima pessoa não precisa reinvestigar para concluir o mesmo.
3. O teste da whitelist também assere `length > 25` e a presença de campos de cada época
   (cadastro, perfil 75-112, marketing 75-181) — protege contra esvaziar a lista por acidente,
   que seria pior que reintroduzir um campo.

### Validações
- `type-check` 8/8, **0 erros** · `vitest` **132 arquivos / 1676 testes** (+6) · `eslint` **0 erros**
  (os 2 warnings do `distributor.test.ts` são pré-existentes)

### File List
| Arquivo | Mudança |
|---|---|
| `lib/leads/patch-allowed-fields.ts` | **NOVO** — whitelist + proibidos com motivo |
| `lib/leads/patch-allowed-fields.test.ts` | **NOVO** — 6 casos (o guard-rail) |
| `app/api/leads/[id]/route.ts` | consome o módulo |
| `lib/analytics-report-data.ts` | ativos paginado; nomes no cabeçalho |
| `docs/qa/gates/75.269-*.yml` · `75.271-*.yml` · `75.272-*.yml` | `outcome` em cada item |

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-04 | 0.1 | Story criada e implementada. Fecha QA-002 (75-267/269), QA-003 e QA-004 (75-271); descarta OBS-001 (75-269) **com medição** (59 agendamentos em prod contra teto de 1000 — churn sem risco eliminado); e marca QA-001 da 75-272 como resolvido pela 75-271. tsc 0 · vitest 132/1676 (+6) · eslint 0. | @dev (Dex) |
