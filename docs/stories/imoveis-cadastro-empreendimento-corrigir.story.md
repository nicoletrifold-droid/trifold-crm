# Story (Bug) — Cadastro de empreendimento: tela ilegível no dark e POST que nunca gravou

**Status:** InReview
**Tipo:** Bug fix (UI + API)
**Epic:** Imóveis
**Story ID:** 75-280
**Complexidade:** S (4 arquivos, sem migration, sem mudança de schema)

## Contexto

Relato do diretor (06/08/2026, com screenshot de `crm.trifold.eng.br/dashboard/properties/new`):
*"não to conseguindo escrever nada aqui, cadastrar um novo aqui. fico digitando, mas nada aparece"*.

A investigação mostrou que **o texto estava sendo digitado normalmente** — o estado React atualiza. O que
não dava para ver era o texto: `properties/new/page.tsx:102` define `inputClass` **sem cor de texto e sem
fundo**, então o `<input>` herda `color: var(--foreground)` do `body`, que em `.dark` é `#fafaf9`
(`globals.css:28`). Fundo branco padrão do Chrome + texto branco = campo aparentemente morto.

A mesma tela é **inteiramente light-hardcoded**: `h1` com `text-gray-900`, form com `bg-white`, labels com
`text-gray-700`, caixa de erro `bg-red-50/text-red-700` — nenhum com variante `dark:`. Por isso o título
"Novo Empreendimento" também aparece escuro sobre fundo escuro na screenshot.

🔑 **As telas irmãs já estão corretas** — `properties/[id]/edit/page.tsx:217` e
`properties/[id]/units/[unitId]/page.tsx:305` já usam
`dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500`. Só a tela `new`
ficou atrás. **O fix é copiar o padrão existente, não inventar um novo** (ver
[[feedback-consultar-fonte-nao-duplicar-constante]] e [[feedback-theme-convention]]).

### E três defeitos que o usuário só descobriria depois de conseguir digitar

Esta tela **nunca funcionou em produção** — não é uma regressão:

1. **`POST /api/properties` insere `zip_code`, coluna que não existe** em `properties` (não aparece em
   nenhuma das 238 migrations; o schema é a migration `002_property_schema.sql`). Como o supabase-js envia
   a chave mesmo valendo `null`, o Postgres recusa o INSERT inteiro → **500 em 100% das tentativas**. A tela
   nem tem campo de CEP.
2. **`address` é `NOT NULL`** no schema, mas na tela é campo opcional (sem asterisco) e o POST envia `null`
   quando vazio → violação de NOT NULL com erro cru do Postgres.
3. **O POST descarta 8 campos que a tela coleta**: `status`, `neighborhood`, `concept`, `description`,
   `delivery_date`, `total_units`, `total_floors`, `units_per_floor`. Todos existem em `properties` e todos
   são enviados pelo formulário — o INSERT simplesmente não os usa. O usuário preencheria tudo e salvaria
   um empreendimento só com nome, slug, cidade, UF e endereço.

### Defeito irmão, da mesma família (entra)

- `PATCH /api/properties/[id]/route.ts:67-68` também escreve `zip_code`. Só quando o body traz a chave —
  nenhum consumidor a envia hoje —, mas é uma mina armada: bastaria alguém mandar o campo para o UPDATE
  inteiro ser recusado. Remoção de linha morta, sem mudança de comportamento observável.

### 🛑 Defeito conhecido que NÃO entra (decisão do diretor, 06/08)

- `POST /api/properties/[id]/units/route.ts:119` insere **`area`**, coluna que não existe em `units` (as
  colunas de área são `private_area_m2` e `garage_area_m2`) → o endpoint falha sempre.
- **Foi implementado e revertido nesta story a pedido do diretor**, para não arriscar a integração de
  unidades com o **REM**: *"cuidado para não estourar a integração das unidades/apartamentos que temos com
  o REM"*.
- Verificação feita antes de reverter: o webhook do REM (`app/api/webhooks/imoveis-sync/route.ts:147`)
  **não passa por esse endpoint** — escreve direto na tabela com
  `.from("units").update({ status, updated_at }).eq("property_id", …).eq("identifier", …)` e depois recalcula
  `properties.available_units`. Ele toca **apenas `status`**, nunca área. Ou seja, o fix seria inócuo para o
  REM — mas está fora do que foi pedido, e escopo é decisão do dono.
- Nota adicional: **não existe tela de criar unidade** (só editar, em `properties/[id]/units/[unitId]`), e
  nenhuma tela chama esse POST — as telas leem direto do Supabase. Fica como dívida registrada.

## Acceptance Criteria

1. **AC1** — Em dark, todos os campos de `/dashboard/properties/new` mostram o texto digitado, o placeholder
   é legível, e o título/labels/card/caixa de erro têm contraste. O padrão usado é **idêntico** ao de
   `properties/[id]/edit`.
2. **AC2** — **Nada muda no light**: as classes existentes (`text-gray-900`, `bg-white`, `text-gray-700`,
   `border-gray-300`) são preservadas; só se acrescentam variantes `dark:`.
3. **AC3** — `POST /api/properties` **não envia `zip_code`**. O INSERT passa a ser aceito pelo Postgres.
4. **AC4** — `address` é obrigatório na tela (asterisco + `required`) e validado na API, com mensagem clara
   (`address is required`) em vez de deixar o NOT NULL estourar como 500.
5. **AC5** — `POST /api/properties` persiste os 8 campos hoje descartados: `status`, `neighborhood`,
   `concept`, `description`, `delivery_date`, `total_units`, `total_floors`, `units_per_floor`.
6. **AC6** — `status` inválido é rejeitado com 400 (o valor vai para uma coluna `property_status` enum:
   `planning`, `launching`, `selling`, `delivered`, `sold_out`).
7. **AC7** — `PATCH /api/properties/[id]` não escreve mais `zip_code`, e **nada mais muda** nesse handler
   (é a tela de edição, que funciona hoje — ver [[feedback-nao-quebrar-o-que-funciona]]).
8. **AC8** — **Nada é alterado no fluxo de unidades** (`api/properties/[id]/units`, `api/units/*`,
   `webhooks/imoveis-sync`): zero risco para a integração com o REM.
9. **AC9** — **Sem migration**: nenhuma mudança de schema. O fix é alinhar o código ao schema que já existe.
10. **AC10** — Testes automatizados cobrindo o payload do INSERT (sem `zip_code`, com os 8 campos), a
    validação de `address` e a de `status`.
11. **AC11** — A lista de status passa a ter **fonte única** (`@web/lib/property-status`), espelhando o enum
    do banco, em vez de cópia literal dentro da tela
    (ver [[feedback-consultar-fonte-nao-duplicar-constante]]).

## Tasks

- [x] `properties/new/page.tsx`: `inputClass` recebe o mesmo sufixo `dark:` da tela de edição.
- [x] `properties/new/page.tsx`: `h1`, `form` (card), labels, caixa de erro, bloco da obra e botão Cancelar
      ganham variantes `dark:`.
- [x] `properties/new/page.tsx`: Endereço passa a ser obrigatório (label com `*` + `required`).
- [x] `lib/property-status.ts` (novo): fonte única do enum + labels + options; a tela passa a importar.
- [x] `api/properties/route.ts`: remove `zip_code`; valida `address` e `status`; inclui os 8 campos no INSERT.
- [x] `api/properties/[id]/route.ts`: remove **apenas** o bloco que escreve `zip_code`.
- [x] `api/properties/route.test.ts` (novo): 9 testes cobrindo AC3, AC4, AC5, AC6 e o guard de role.
- [x] ~~`api/properties/[id]/units/route.ts`: `area` → `private_area_m2`~~ — **revertido** a pedido do
      diretor (risco percebido na integração REM). Ver seção acima.
- [x] `next build` OK · `vitest run` 1785 testes passando · `tsc --noEmit` limpo · `eslint` sem warnings.

## Out of Scope

- **Nenhuma migration.** Não criar coluna `zip_code`, não afrouxar o `NOT NULL` de `address`.
- Não adicionar campo de CEP na tela (não existe no schema; se um dia for preciso, é outra story com migration).
- Não mexer nas telas de listagem, edição ou detalhe de empreendimento — já estão corretas no dark.
- Não tocar em `available_units` (migration 060) nem em `typologies`, `lat/lng`, `amenities`, `differentials`,
  `faq`, `commercial_rules` — campos que a tela `new` não coleta.
- A dívida de dark-hardcoded em outras áreas do app (ver [[feedback-theme-convention]]) continua aberta.

## Dev Notes

- Padrão de input a copiar (de `properties/[id]/edit/page.tsx:217`):
  `dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500`
- Enum `property_status` (migration 002, linhas 7-13) bate exatamente com as `STATUS_OPTIONS` da tela —
  nenhuma tradução de valor é necessária.
- `Next 16.2.2`: `NextResponse.json` segue suportado (`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`),
  então o padrão de resposta do arquivo não muda.
- Desbloqueio imediato: o empreendimento que o diretor precisa hoje será criado direto em produção via
  Management API, em paralelo a esta story.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-06 | 0.1 | Story criada a partir do relato do diretor + investigação: 1 defeito visual (texto branco em campo branco) e 3 defeitos de gravação que tornavam a tela inutilizável desde sempre. | @sm (River) |
| 2026-08-06 | 0.2 | Validada: contexto rastreável a arquivo:linha, ACs testáveis, escopo sem migration, padrão a copiar já existente no projeto. **GO**. | @po (Pax) |
| 2026-08-06 | 1.0 | Implementado: tema da tela, `address` obrigatório, `zip_code` fora do INSERT e do PATCH, 8 campos persistidos, validação de `status`, fonte única de status. 9 testes novos. | @dev (Dex) |
| 2026-08-06 | 1.1 | **Escopo reduzido a pedido do diretor**: o fix do POST de unidades (`area` → `private_area_m2`) foi revertido para não arriscar a integração com o REM. Verificado antes de reverter que o `imoveis-sync` não usa esse endpoint. Dívida registrada. | @dev (Dex) |
| 2026-08-06 | 1.2 | Gate **PASS** (9/10) com 2 concerns: ACs visuais dependem de conferência no preview; `properties/[id]/edit` segue com cópia própria de statusOptions. | @qa (Quinn) |

## Dev Agent Record

### Implementação — o que resolveu o quê

| Sintoma | Causa | Correção |
|---------|-------|----------|
| "digito e nada aparece" | input sem `text-*`/`bg-*` herdava `--foreground` branco do `body` em `.dark` | `inputClass` com as 4 variantes `dark:` já usadas na tela de edição |
| título/labels/card invisíveis | tela 100% light-hardcoded | variantes `dark:` em `h1`, form, labels, erro, bloco da obra, botão Cancelar |
| salvar daria 500 sempre | INSERT com `zip_code`, coluna inexistente | chave removida do INSERT |
| endereço vazio → 500 | `address` é NOT NULL e a tela deixava opcional | obrigatório na tela + validado na API (400 claro) |
| 8 campos preenchidos e perdidos | INSERT não usava os campos que a tela envia | incluídos no INSERT |
| `status` inválido → 500 do enum | sem validação | validado contra a fonte única, 400 |

### File List
- `packages/web/src/app/dashboard/properties/new/page.tsx`
- `packages/web/src/app/api/properties/route.ts`
- `packages/web/src/app/api/properties/[id]/route.ts` (apenas remoção do `zip_code`)
- `packages/web/src/lib/property-status.ts` (novo)
- `packages/web/src/app/api/properties/route.test.ts` (novo, 9 testes)
- `docs/stories/imoveis-cadastro-empreendimento-corrigir.story.md` (novo)
- `docs/qa/gates/imoveis-cadastro-empreendimento-corrigir.yml` (novo)

**Não alterado, de propósito:** `api/properties/[id]/units/route.ts`, `api/units/*`,
`webhooks/imoveis-sync/route.ts`, telas de listagem/edição/detalhe de empreendimento.

## QA Results

### Review Date: 2026-08-06 — Reviewed By: Quinn

| Check | Veredito | Evidência |
|-------|----------|-----------|
| Code review | PASS | Padrão `dark:` copiado de `properties/[id]/edit:217`, não inventado. Light preservado (só variantes acrescentadas). PATCH reduzido a remoção de linha morta. |
| Unit tests | PASS | 145 files / 1785 tests. 9 novos cobrindo INSERT, `address`, `status` e guard de role. |
| Acceptance criteria | PASS | AC1–AC11. AC1/AC2 exigem conferência visual no preview. |
| No regressions | PASS | `git status` confirma zero mudanças em `units/*` e `webhooks/imoveis-sync`. Suíte completa sem quebra. |
| Security | PASS | `IMOVEIS_CREATE_ROLES` intacto e agora coberto por teste (corretor → 403). |
| Documentation | PASS | Story + gate + comentários no código explicando cada remoção. |

Build: `next build` Compiled successfully in 19.8s · `vitest` 1785 pass · `tsc --noEmit` limpo · `eslint` sem warnings.

**Concerns (não bloqueiam):**
1. AC1/AC2 são visuais — nenhum teste automatizado cobre contraste. Conferir no preview antes do merge.
2. `properties/[id]/edit` mantém cópia própria de `statusOptions`; a fonte única não foi propagada (fora de escopo).

Gate: PASS → `docs/qa/gates/imoveis-cadastro-empreendimento-corrigir.yml`
— Quinn 🛡️
