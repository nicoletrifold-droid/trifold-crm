# Story 75-297 — IMOB: aba "Perdidos" + reativar lead

**Story ID:** 75-297
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** M (~3 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Tipo:** feature (paridade com a house no mundo IMOB)

---

## Story

Como **usuária do perfil imob (Daiana)**, quero **ver os leads perdidos do mundo IMOB numa aba
própria e poder reativá-los** — igual à house —, porque hoje os perdidos ficam misturados na
lista única e não há caminho de volta quando o cliente retorna.

Pedido do Marcos em 11/08 com print da tela `/dashboard/imob/leads` logada como Daiana:
"precisamos habilitar para este perfil a aba de leads perdidos e já colocar a opção de reativar
o lead igual temos na house".

---

## Context

- **IMOB usa as MESMAS `kanban_stages` da house** (`imob/pipeline/page.tsx`: "mesmas etapas, só
  leads segmento='imob'"). Logo "perdido" no IMOB = `PERDIDO_STAGE_IDS`
  (`lib/leads/stage-filters.ts`: Perdido + Não Qualificado) — mesma régua de
  [[project-corretor-contagens-perdidos]] ("perdido" = ETAPA, nunca `lost_reason`).
- **Hoje a lista IMOB mostra TUDO junto**: `imob/leads/page.tsx` filtra só
  `segmento='imob' + is_active`, sem view. No print, "Não Qualificado" aparece no meio dos ativos.
- **A reativação da house NÃO serve para o IMOB**: `/api/leads/[id]/reativar` exige
  `MANAGER_ROLES` (perfil `imob` não passa), mexe em roleta/SLA/broker_assignments/conversas da
  Nicole — nada disso existe no mundo IMOB (leads manuais, fora da roleta por definição da 75-99,
  responsável = qualquer usuário interno). O caminho é um endpoint irmão no padrão IMOB:
  `imobGuard()` + admin client + trava `segmento='imob'` (mesmo desenho do `assign`, ovo-e-galinha
  da RLS documentado lá).
- **Fronteira que não se alarga:** [[project-imob-mundo-isolado]] — o gate é `canAccess("imob")`,
  nunca `is_admin_or_supervisor`. Quem tem o módulo IMOB gerencia os leads do IMOB (o `assign` já
  permite trocar responsável sem restrição de role).

### Decisão de desenho

1. **Sub-abas na tela Leads** (dentro da aba "Leads" do `ImobTabs`, não uma 4ª aba de topo):
   `Em atendimento (n)` · `Perdidos (n)` via `?view=perdidos`, server-side como na house.
   "Em atendimento" passa a EXCLUIR `PERDIDO_STAGE_IDS`; "Perdidos" só os inclui. Não há "acervo"
   no IMOB (etapas de acervo são artefato house; se um lead imob cair nelas, continua em ativos).
2. **Reativar = voltar para "Aguardando atendimento"** (`AGUARDANDO_STAGE_ID`, a mesma etapa de
   entrada do `POST /api/imob/leads`), limpar `lost_reason` + `lost_reason_grupo`
   ([[project-analytics-motivos-perda-grupo]]: grupo nunca fica residual) e definir o responsável
   escolhido no modal (default = responsável atual). Motivo obrigatório, como na house.
3. **Sem roleta, sem SLA, sem push, sem conversas** — nada disso participa do mundo IMOB.
   Registrar `activities` tipo `lead_reactivated` (o timeline já renderiza "Lead reativado" +
   motivo) e `logAudit("lead.reactivate")` para o rastro de auditoria, com `imob: true` no
   metadata.

---

## Acceptance Criteria

- [ ] **AC1 — aba Perdidos.** Em `/dashboard/imob/leads`, logado com perfil que tem
      `canAccess("imob")`, existem as sub-abas "Em atendimento" e "Perdidos" com contagem; a de
      perdidos lista SÓ leads `segmento='imob'` cujas etapas estão em `PERDIDO_STAGE_IDS`.
- [ ] **AC2 — ativos limpos.** A view padrão deixa de mostrar leads perdidos (Talita e Valmir do
      print saem de "Em atendimento" e aparecem em "Perdidos").
- [ ] **AC3 — reativar.** Na view Perdidos, cada linha tem ação "Reativar" que abre modal com
      responsável (default o atual) + motivo obrigatório; ao confirmar, o lead volta para
      "Aguardando atendimento", zera `lost_reason`/`lost_reason_grupo` e some da aba Perdidos.
- [ ] **AC4 — fronteira IMOB.** O endpoint recusa lead que não seja `segmento='imob'` (404) e lead
      que não esteja em etapa perdida (422); sem `canAccess("imob")` → guard do `imobGuard`.
- [ ] **AC5 — rastro.** A reativação grava activity `lead_reactivated` (visível no
      timeline/drawer com o motivo) e audit log `lead.reactivate`.
- [ ] **AC6 — house intacta.** Nada muda em `/dashboard/leads`, no endpoint house de reativar,
      na roleta ou no funil principal (raio de impacto: só arquivos do mundo IMOB).

## Escopo

**IN:** sub-abas + contagens na tela IMOB Leads; endpoint `POST /api/imob/leads/[id]/reativar`
(e GET não é necessário — a lista de usuários já vem da página); modal de reativação; testes de
rota; drawer continua abrindo nas duas views.
**OUT:** push notification ao responsável; reativação em massa; mudanças no pipeline kanban IMOB;
tela do broker; qualquer coisa do funil principal.

## Dependencies

- `PERDIDO_STAGE_IDS` (`@web/lib/leads/stage-filters`) — fonte única, importar, nunca duplicar
  ([[feedback-consultar-fonte-nao-duplicar-constante]]).
- `imobGuard` (`@web/lib/imob/guard`), `AGUARDANDO_STAGE_ID` (hoje constante local do
  `api/imob/leads/route.ts` — exportar de lá ou mover para fonte única).
- `logAudit` (`@web/lib/audit`).

## Riscos

- Mudar a view padrão remove perdidos da lista que a Daiana vê hoje — é o comportamento pedido,
  mas a contagem na sub-aba precisa denunciar onde eles foram parar.
- `fakeDb` dos testes ignora `.eq()` ([[project-nicole-envio-midia-proativo]]) — testes de rota
  devem validar por chamadas/payload, não por filtro simulado.

## Tasks

- [x] Fonte única do stage de entrada: a rota de criação IMOB trocou a constante local
      `AGUARDANDO_STAGE_ID` (UUID duplicado) por `STAGE_IDS.novo` do `@trifold/shared` —
      mesmo valor, já era a fonte que a house usa
- [x] `api/imob/leads/[id]/reativar/route.ts` — POST no padrão `imobGuard` (validações AC4,
      update AC3, rastro AC5)
- [x] `imob/leads/page.tsx` — ler `searchParams.view`, lista filtrada + 2 contagens
      (`in`/`not.in` `PERDIDO_STAGE_IDS`), passar view + counts ao manager
- [x] `imob-leads-manager.tsx` — sub-abas com contagem (links `?view=`), coluna/ação Reativar na
      view perdidos, modal responsável+motivo (reuso da lista `users` já carregada)
- [x] Testes de rota do reativar (7 casos: 403 guard, 400 sem motivo/responsável/inválido,
      404 não-imob, 422 não-perdido, sucesso com update+activity+audit)
- [x] lint + typecheck + suíte + `next build`
- [ ] Smoke pós-deploy: logar como Daiana, ver Talita/Valmir na aba Perdidos e reativar um

## Dev Notes

1. **Responsável obrigatório no modal** (default = o atual do lead): paridade com a house, e
   evita lead reativado sem dono — a RLS do IMOB é por atribuição
   ([[project-imob-lead-responsavel]]), lead sem responsável ficaria intocável para o perfil imob.
2. **Sem GET no endpoint** (a house tem GET para corretores elegíveis via `broker_assignments`):
   no IMOB o universo de responsáveis é "qualquer usuário interno ativo", lista que a página já
   carrega para o seletor de responsável — o modal reusa a prop `users`.
3. O drawer (`LeadDetailDrawer`) continua abrindo nas DUAS views pelo clique na linha; os botões
   de ação usam `stopPropagation` (mesmo padrão do select de responsável).
4. "Acervo" (Corretores Antigos/Represamento) não entra na régua do IMOB: a view ativos exclui
   SÓ `PERDIDO_STAGE_IDS` — decisão registrada no Context.

## File List

- `packages/web/src/app/api/imob/leads/route.ts` (constante local → `STAGE_IDS.novo`)
- `packages/web/src/app/api/imob/leads/[id]/reativar/route.ts` (novo)
- `packages/web/src/app/api/imob/leads/[id]/reativar/route.test.ts` (novo)
- `packages/web/src/app/dashboard/imob/leads/page.tsx` (views + contagens)
- `packages/web/src/app/dashboard/imob/leads/_components/imob-leads-manager.tsx` (sub-abas, botão e modal Reativar)
- `docs/stories/75-297-imob-leads-perdidos-reativar.story.md`

## QA Results (@qa)

_(pendente)_

## Change Log

- 2026-08-11 — @sm: criada a partir do pedido do Marcos (print da Daiana em
  `/dashboard/imob/leads` mostrando Não Qualificado misturado nos ativos, sem caminho de volta).
- 2026-08-11 — @po: validada (GO 10/10) — Draft → Ready.
