# Story 82-3 — Análise IA para corretor e gerente-comercial (rota + /broker)

## Metadata
- **Status:** Approved
- **Epic:** 82 — Análise de Comportamento IA do lead
- **Branch:** feat/82-3-analise-comportamento-acesso-corretor
- **Tipo:** Feature (permissões + frontend broker)
- **Complexidade:** Média
- **Prioridade:** P1
- **Depende de:** 82-1 (rota) e 82-2 (componente compartilhado)

## Story
**As a** corretor (ou gerente-comercial), **I want** ver e gerar a Análise IA dos MEUS leads
direto na minha tela, **so that** eu saiba como abordar cada lead na hora de agir — a análise
vale mais pra quem aborda do que pra quem supervisiona.

## Contexto
A 82-1 nasce gateada em admin/supervisor (paridade com o /summary atual). Decisão do Marcos:
liberar também para **gerente-comercial** e **corretor**. Atenção à convenção do repo: acesso
é por NOME de role hardcoded e os perfis comerciais são cumulativos por convenção (corretor ⊂
gerente-comercial ⊂ supervisor ⊂ admin) — cada check precisa listar os roles explicitamente.
Corretor só pode analisar lead atribuído a ele (`assigned_broker_id`).

## Escopo
**IN:**
- Rota `POST /api/leads/[id]/behavior-analysis`: aceitar admin, supervisor, gerente-comercial
  e corretor; para corretor, validar `assigned_broker_id = usuário` (403 caso contrário).
  Gerente-comercial: mesmo alcance de leads que ele já enxerga hoje nas telas dele.
- `/broker/leads/[id]`: nova aba/seção "Análise IA" reutilizando `behavior-analysis-panel.tsx`
  (82-2), incluindo staleness e `dados_faltando` — o checklist é o incentivo para o corretor
  registrar mais.
- Tema: /broker é sempre dark hardcoded (convenção do repo) — conferir que o painel compartilhado
  respeita os dois contextos.
- Dashboard (gerente-comercial navegando em /dashboard/leads/[id]): garantir que a aba renderiza
  para o role (a página hoje pode estar gateada mais restrita — verificar e ajustar).

**OUT:**
- Analytics agregado de análises; notificações; qualquer mudança no prompt/flow; ACERVO e regras
  de contagem do corretor (outro épico).

## Acceptance Criteria
1. **Given** corretor autenticado dono do lead, **when** abre `/broker/leads/[id]` na seção
   Análise IA e clica em analisar, **then** gera e vê a análise completa.
2. **Given** corretor NÃO dono do lead, **when** chama a rota (direto ou via UI), **then** 403
   e nada é gerado/persistido.
3. **Given** gerente-comercial, **then** vê e gera análise nos leads do alcance atual dele,
   tanto no /broker quanto no /dashboard (onde tiver acesso à página).
4. **Given** usuário inativo (`is_active=false`), **then** nenhum acesso (convenção vigente
   middleware+requireAuth — cobrir com teste da rota).
5. Painel renderiza corretamente no dark do /broker e no light/dark do /dashboard.
6. Type-check/lint/suíte verdes; testes de permissão da rota cobrindo a matriz dos 4 roles + não-dono.

## Dev Notes
- Padrão de gate por role: seguir os checks existentes das rotas de leads do broker (ex.:
  `/api/leads/[id]/tasks`, notes) — listar roles explicitamente, sem inventar hierarquia.
- A tela `/broker/leads/[id]` já tem `conversation-thread` compartilhado com o dashboard
  (Story 75-155) — seguir o mesmo padrão de reuso para o painel.
- Lembrete de produto: análise NUNCA oferece mover etapa — no /broker a tentação de "aplicar
  sugestão" é maior; não criar atalho de mudança de etapa a partir da análise.

## File List (planejado)
- `docs/stories/82-3-analise-comportamento-acesso-corretor.story.md` (this file)
- `packages/web/src/app/api/leads/[id]/behavior-analysis/route.ts` (matriz de roles + guard dono)
- `packages/web/src/app/broker/leads/[id]/page.tsx` (+ componente de aba/seção local se necessário)
- `packages/web/src/app/dashboard/leads/[id]/page.tsx` (gate do gerente-comercial, se necessário)

## PO Validation (@po Pax — 2026-07-21)
**GO (9/10).** Matriz de permissões explícita e testável; risco do gate por nome de role coberto nos
Dev Notes. Condição (não bloqueia): AC3 do gerente-comercial no /dashboard depende do gate atual da
página — se a página for admin/supervisor-only hoje, ajustar vira parte do escopo desta story mesmo.
Status: Draft → Approved.

## Change Log
- 2026-07-21 @sm (River): story criada a partir do Epic 82. Status: Draft.
- 2026-07-21 @po (Pax): validação GO 9/10. Status: Approved.
