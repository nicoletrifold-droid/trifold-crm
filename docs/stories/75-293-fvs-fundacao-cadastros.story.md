# Story 75-293 — FVS (Controle de serviços no canteiro): fundação + cadastros

**Story ID:** 75-293
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** L (~8 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Tipo:** feature (SDC) — etapa 1 de 5 do desenho "Controle de serviços no canteiro" (06/08/2026)

---

## Story

Como **engenheiro ou coordenador de obras**, quero **cadastrar os locais da obra, os serviços e
suas fichas-modelo de verificação**, para que a fila de vistorias (etapa 2) tenha sobre o que
existir — e para que os próximos 23 serviços entrem **por cadastro, não por desenvolvimento**.

---

## Context

Primeiro código do módulo FVS. Fonte: desenho da v1 (06/08, a partir de 2 rodadas de respostas
do Jonathan) — piloto na obra **Vind** (1 torre, 14 pav., 48 unidades + halls/áreas comuns),
2 serviços de 10 (revestimento cerâmico e hidráulica), vistoriador Vinicius, **celular, dentro
do local, com sinal** (offline está fora, decidido).

Das **6 definições ainda pendentes** com o Jonathan, **nenhuma trava esta etapa**: a única
estrutural ("de onde nasce a fila") mexe na etapa 2+, e as de detalhe (foto, assinaturas, 48h,
cancelamento) entram aqui só como **configuração parametrizada** — a resposta dele vira valor de
config, não retrabalho.

### Decisões já travadas (não rediscutir)

1. **Unidade = LOCAL, não apartamento** — "cadastraremos os aptos e as áreas comuns com halls,
   então fica por local". Régua de tudo.
2. **Tabelas `fvs_*` próprias.** Não tocar `units` (mundo comercial) nem alterar `obras` —
   `fvs_locais` apenas **referencia** `obras(id)` (migs 020/041).
3. **Item de ficha tem 2 tipos**: `botao` (conforme / não conforme / não se aplica) e `medida`
   (valor numérico + **tolerância escrita como texto na ficha**, nunca embutida em código).
4. **Ficha-modelo é dado, não código** — é o que faz os outros 23 serviços entrarem por cadastro.

### O que esta etapa NÃO é

Só cadastro (tela de escritório, usada uma vez por obra). Solicitação, fila do celular, ficha
preenchida, assinatura, pendência, painel e indicadores são as etapas 2-5 (stories futuras).

---

## Schema proposto (novas tabelas, todas com `org_id`)

| Tabela | Colunas essenciais |
|---|---|
| `fvs_locais` | `obra_id → obras(id)`, `nome`, `tipo` (`apartamento`\|`hall`\|`area_comum`), `torre`, `pavimento` (int, null p/ área comum), `ativo`. Unique `(obra_id, nome)`. |
| `fvs_servicos` | `nome`, `ativo`. Unique `(org_id, nome)`. |
| `fvs_fichas_modelo` | `servico_id → fvs_servicos`, `titulo`, `ativa` (1 ativa por serviço), `foto_config` (`por_ficha`\|`por_item`\|`apenas_reprova`, default `por_ficha`) — parametriza a definição pendente nº 3. |
| `fvs_ficha_modelo_itens` | `ficha_modelo_id`, `ordem`, `descricao`, `tipo` (`botao`\|`medida`), `unidade` (texto, ex.: mm/m), `tolerancia` (texto livre), `ativo`. |
| `fvs_equipes` | `nome`, `tipo` (`interna`\|`empreiteiro`), `ativo`. |

Padrão de acesso: o mesmo do módulo Lançamentos (mig 145) — **sem CREATE POLICY de propósito**,
acesso só via rotas API com `requireAuth` + `canAccess("fvs")` e cliente admin com `org_id`
explícito em todo filtro. Registrar isso em comentário na migration, como a 145 faz.

---

## Acceptance Criteria

- [x] **AC1 — migration única e idempotente** cria as 5 tabelas acima (+ índices por `org_id` e
      FKs com `ON DELETE`), **numeração conferida contra PROD antes** (218 é a última local;
      ver [[project-migrations]] — aplicar via Management API, **nunca** `db push`). Nenhuma
      tabela existente é alterada.
- [x] **AC2 — módulo `fvs` de verdade**: seed em `role_permissions` no padrão da mig 144
      (acesso `admin`, `supervisor`, `obras` — mesmos perfis de Obras/Lançamentos, ON CONFLICT
      DO NOTHING), entrada em `ALL_MODULES` + `MODULE_LABELS` (`permissions-modules.ts`),
      item no menu em `app/dashboard/layout.tsx` no padrão Lançamentos — `NAV_ITEM_*` (linha 58),
      mapa rota→módulo (linha 84) e spread condicional por permissão (linha 274).
      Rótulo: **"Vistorias"**.
- [x] **AC3 — tela de locais** (`/dashboard/fvs/locais` ou aba equivalente): listar por obra
      (seletor de obra), criar/editar/inativar, e **criação em lote** (colar uma lista de nomes,
      um por linha, com tipo/torre/pavimento aplicados ao lote) — a lista do Vind chega em
      planilha e são ~60 locais; cadastrar um a um mataria a adoção no primeiro dia.
- [x] **AC4 — tela de serviços + editor de ficha-modelo**: CRUD de serviço; dentro dele, a
      ficha-modelo com itens **ordenáveis** (campo `ordem`), cada item com tipo `botao` ou
      `medida` (+ unidade e tolerância em texto). Trocar a ficha ativa não apaga a anterior
      (`ativa=false`), para não órfãar fichas preenchidas no futuro.
- [x] **AC5 — tela de equipes**: CRUD simples (`nome`, `interna`/`empreiteiro`, ativo).
- [x] **AC6 — segurança**: todas as rotas novas com `requireAuth` + `canAccess("fvs")`;
      anônimo = **401** (teste); usuário sem o módulo (ex.: corretor) = **403** (teste);
      `org_id` explícito em cada query (admin client passa por cima da RLS).
- [x] **AC7 — tema**: telas em `/dashboard` com variantes `dark:` ([[feedback-theme-convention]]).
- [x] **AC8 — testes (vitest)**: núcleo puro extraído (parse do lote de locais; validação de
      item medida×tolerância; regra "1 ficha ativa por serviço") testado sem DOM
      ([[feedback-projeto-sem-teste-de-componente]]); rotas com 401/403/CRUD; lint, typecheck
      e `next build` verdes.

---

## Fora do escopo (etapas 2-5 — não antecipar)

Solicitação de vistoria · fila no celular · ficha preenchida/assinatura · pendências/48h/
escalonamento · painel e indicadores · peça "esperado no período" (aguarda definição nº 1) ·
offline · acesso de empreiteiro · integração Sienge.

## Dependências / em paralelo (Marcos cobrando o Jonathan)

- Fichas Word de **cerâmica** e **hidráulica** — viram o primeiro cadastro real, não travam o código.
- **Lista de locais do Vind** — entra pela criação em lote do AC3.
- Respostas das 6 definições — destravam as etapas 2-3.

## Dev Notes — gotchas conhecidas

1. Numeração de migration tem histórico de conflito (074/075) e DEV tem drift — conferir a
   última aplicada **em prod** antes de nomear a 219.
2. PostgREST corta em 1000 linhas por default — irrelevante para ~60 locais do piloto, mas a
   listagem de locais deve ordenar e paginar desde já (600 fichas possíveis na obra inteira).
3. `.order()` DESC em coluna nullable = NULLS FIRST ([[feedback-order-desc-nulls-first]]).
4. Não duplicar constantes de rótulos/tipos — uma fonte só em `lib/fvs/`
   ([[feedback-consultar-fonte-nao-duplicar-constante]]).

## Dev Notes — desvios e decisões da implementação (@dev)

1. **POST `/api/fvs/locais` é sempre LOTE** (1..N): a criação unitária da UI é um lote de 1.
   Uma rota só, uma validação só — o AC3 pedia as duas formas e elas viraram o mesmo caminho.
2. **Regra "1 ficha ativa por serviço" também no BANCO**: índice parcial
   `uq_fvs_ficha_ativa_por_servico (servico_id) WHERE ativa` — a rota desativa a anterior antes
   de inserir (ordem provada por teste), e o banco impede corrida de duas ativas.
3. **PATCH da ficha substitui itens in-place** — seguro na etapa 1 (não existem fichas
   preenchidas). Quando a etapa 2 entrar, edição de ficha usada vira "nova versão" (POST), que
   já desativa a anterior sem apagar. **Não existe DELETE de ficha** de propósito: arquivar =
   `ativa=false`.
4. **Desvio pequeno do schema proposto:** `fvs_ficha_modelo_itens` ficou **sem** coluna `ativo`
   (a proposta listava) — itens são substituídos na edição, não inativados; um flag `ativo` ali
   seria estado morto.
5. **AC1, parte "numeração conferida contra PROD":** é passo do apply (@devops via Management
   API) — o arquivo nasceu como 219 (218 é a última local); conferir na hora de aplicar.
6. **Sem teste de componente** (projeto sem jsdom): a decisão de UI testável (parse do lote com
   preview de duplicados/inválidos) vive em `parseLocaisLote()` no núcleo puro, com 4 testes.
7. **O que NÃO foi visto rodando:** as 4 telas no navegador, o tema escuro e o fluxo real de
   colar a planilha — herdado para o smoke pós-deploy.

## File List

- `supabase/migrations/219_fvs_fundacao.sql` (novo — 5 tabelas + RLS sem policy + seed módulo)
- `packages/web/src/lib/fvs/fvs.ts` (novo — tipos, constantes, validações, parseLocaisLote)
- `packages/web/src/lib/fvs/fvs.test.ts` (novo — 17 testes do núcleo puro)
- `packages/web/src/lib/fvs/guard.ts` (novo — fvsGuard, espelha lancamentosGuard)
- `packages/web/src/app/api/fvs/locais/route.ts` (novo — POST lote)
- `packages/web/src/app/api/fvs/locais/route.test.ts` (novo — 8 testes: 401/403/400/404/409/lote)
- `packages/web/src/app/api/fvs/locais/[id]/route.ts` (novo — PATCH/DELETE)
- `packages/web/src/app/api/fvs/servicos/route.ts` + `[id]/route.ts` (novos — POST/PATCH/DELETE)
- `packages/web/src/app/api/fvs/fichas-modelo/route.ts` (novo — POST ficha+itens, 1-ativa)
- `packages/web/src/app/api/fvs/fichas-modelo/route.test.ts` (novo — 5 testes: 1-ativa, cleanup)
- `packages/web/src/app/api/fvs/fichas-modelo/[id]/route.ts` (novo — PATCH header+itens)
- `packages/web/src/app/api/fvs/equipes/route.ts` + `[id]/route.ts` (novos — POST/PATCH/DELETE)
- `packages/web/src/app/dashboard/fvs/page.tsx` (novo — landing com contadores)
- `packages/web/src/app/dashboard/fvs/locais/page.tsx` + `_components/locais-manager.tsx` (novos)
- `packages/web/src/app/dashboard/fvs/servicos/page.tsx` + `_components/servicos-manager.tsx` (novos)
- `packages/web/src/app/dashboard/fvs/equipes/page.tsx` + `_components/equipes-manager.tsx` (novos)
- `packages/web/src/lib/permissions-modules.ts` (módulo `fvs` em ALL_MODULES/LABELS/DESCRIPTIONS)
- `packages/web/src/lib/permissions.ts` (fallback hardcoded do role `obras` ganha `fvs`)
- `packages/web/src/app/dashboard/layout.tsx` (NAV_ITEM_FVS + mapa rota→módulo + spread)
- `docs/stories/75-293-fvs-fundacao-cadastros.story.md`

## Change Log

- 2026-08-11 — @sm: story criada a partir do desenho v1 de 06/08 (etapa 1 de 5). Definições
  pendentes do Jonathan não travam esta etapa; foto parametrizada em `foto_config`. Rótulo do
  módulo ("Vistorias") e chave `fvs` propostos — validar com @po/Marcos.
- 2026-08-11 — @po: validada **10/10 → GO**. Draft → **Ready**. Duas correções: (1) estimativa
  M→**L (~8 pts)** — migration de 5 tabelas + seed + 3 telas (uma com editor ordenável e criação
  em lote) + rotas + testes é maior que a régua de M usada nas últimas stories; (2) AC2 ganhou os
  pontos exatos do menu (`dashboard/layout.tsx:58/84/274`, padrão Lançamentos) — verificado no
  código, junto com `obras.org_id` (mig 020) e o padrão de seed da mig 144. Chave `fvs` + rótulo
  "Vistorias" mantidos como default; renomear depois é 1 linha em `MODULE_LABELS` + `NAV_ITEM`.
- 2026-08-11 — @dev: implementada em modo YOLO (1 commit). Gate local: 2182 testes verdes
  (30 novos), type-check OK, `next build` OK, lint 0 erros / 0 avisos nos arquivos novos.
  Desvios documentados em Dev Notes (POST de locais sempre lote; 1-ativa garantida por índice
  parcial; itens sem coluna `ativo`; sem DELETE de ficha). Ready → **InReview**.
