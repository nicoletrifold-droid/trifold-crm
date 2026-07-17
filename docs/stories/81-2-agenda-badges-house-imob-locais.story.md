# Story 81-2 — Agenda: badge/cores HOUSE·IMOB, só decorados, seletor de equipe

## Metadata
- **Status:** InReview
- **Epic:** 81 — Agenda HOUSE × IMOB (`docs/stories/epics/epic-81-agenda-house-imob.md`)
- **Branch:** feat/81-2-agenda-badges-house-imob

## Context
Com a 81-1 em produção (coluna `team` + conflito por equipe), falta o requisito visual do
diretor: **"bater o olho e ver HOUSE/IMOB"** — cor diferente + flag no compromisso. E a
mudança 1 do épico: **tirar "Sala de Reuniões"** das opções de local (ficam só os decorados).

Pontos mapeados no código:
- **GET `/api/appointments`** (`route.ts:27`) — select NÃO retorna `team` (nota do QA da 81-1).
- **Dashboard agenda** (`dashboard/agenda/page.tsx:189`) — select direto do supabase, sem `team`;
  card do day view em `:342`; month view em `:436`. Tema: light/dark com `dark:` (convenção).
- **Broker agenda** (`broker/agenda/page.tsx:153`) — select sem `team`; card em `:305`.
  Tema: sempre dark (convenção).
- **Modal** (`components/appointments/new-appointment-modal.tsx:5-15`) — `PROPERTY_MAP` com
  "Decorado Vind", "Decorado Yarden" e "Sala de Reuniões" (remover a última).
- O POST já aceita `body.team` para admin/supervisor (Story 81-1, `resolveTeam`).

## Acceptance Criteria
- [x] AC1: `team` exposto nas leituras: GET `/api/appointments` e selects das duas páginas de
  agenda (dashboard/broker) incluem a coluna; interface `Appointment` das páginas ganha o campo.
- [x] AC2: Day view (dashboard E broker): cada card mostra **badge** `HOUSE` ou `IMOB` + **cor
  distinta por equipe** (ex.: borda/acento âmbar-violeta p/ IMOB, mantendo a paleta atual p/
  HOUSE) — identificável de relance. Respeitar convenção de tema (dashboard `dark:`; broker dark
  fixo). Helper puro de label/cor exportado e testável.
- [x] AC3: Month view (dashboard): compromissos IMOB visualmente distintos (cor do chip/dot).
- [x] AC4: "Sala de Reuniões" REMOVIDA das opções do modal (ficam Decorado Vind e Decorado
  Yarden). Compromissos antigos com esse local seguem renderizando normalmente.
- [x] AC5: Seletor "Equipe" no modal (HOUSE default · IMOB) **visível só para admin/supervisor**,
  enviando `body.team` no POST; perfil `imob` vê indicação fixa "IMOB" (sem seletor); demais
  perfis não veem nada (POST força house — 81-1).
- [x] AC6: Testes do helper de badge/cor; `npm run type-check` OK; eslint limpo nos arquivos da
  story; suíte de testes completa verde.

## Out of Scope
- Regras de edição/cancelamento por equipe — Story 81-3.
- Link público, token, desligar Google/Calendly — Story 81-4.
- Redesign geral da agenda (mexer só o necessário — [[feedback-nao-quebrar-o-que-funciona]]).

## Dependencies
- **Story 81-1 mergeada** (PR #219) — coluna `team` + `body.team` no POST.

## Complexity
- **T-shirt:** P/M (2 páginas + 1 rota + modal + helper puro com teste).

## Business Value
Requisito explícito do diretor: distinguir as equipes de relance na agenda compartilhada.
Sem isso, a regra da 81-1 é invisível para a operação e gera confusão ("por que tem 2 às 14h?").

## Risks
- Baixo. Mudanças aditivas de UI. Cuidado com a convenção de tema por área
  ([[feedback-theme-convention]]) e com o month view (célula compacta — usar cor, não texto longo).

## Definition of Done
- ACs atendidos, testes verdes, lint/typecheck OK, QA gate PASS, push via @devops.

## File List
- `docs/stories/81-2-agenda-badges-house-imob-locais.story.md` (this file)
- `packages/web/src/app/api/appointments/route.ts` (GET select += team)
- `packages/web/src/app/dashboard/agenda/page.tsx`
- `packages/web/src/app/broker/agenda/page.tsx`
- `packages/web/src/components/appointments/new-appointment-modal.tsx`
- `packages/web/src/lib/appointments/team-badge.ts` (+ `.test.ts`) — helper label/cor

## Dev Notes (@dev / Dex)
- Helper `team-badge.ts`: HOUSE = paleta atual (acento laranja, chip stone); IMOB = violeta
  (chip + borda esquerda `border-l-4`). Classes estáticas — Tailwind v4 (auto-detecção de
  conteúdo) cobre `src/lib` sem config extra (verificado pelo QA).
- Month view: mini-chip ganha `border-l-2 violet` só p/ IMOB (célula compacta — cor, não texto).
- Broker agenda usa `dark:` como o dashboard (a convenção "broker dark fixo" vale p/ o shell,
  as classes seguem o padrão do arquivo) — helper único p/ as duas páginas.
- Seletor de equipe: toggle HOUSE/IMOB no modal (admin/supervisor via prop `userRole` passada
  do server component da agenda); perfil `imob` vê chip fixo "IMOB"; demais nada. `body.team`
  só é enviado quando o seletor existe — servidor força o resto (81-1).
- Broker wrapper NÃO passa `userRole` (corretor nunca escolhe equipe).
- Testes 1044/1044 (4 novos team-badge) · type-check 8/8 · eslint limpo nos arquivos da story.

## QA Results (@qa / Quinn)
**Veredito: PASS**

| Check | Resultado |
|---|---|
| 1. Code review | ✅ Helper puro com classes estáticas; badge + acento aplicados nos 2 day views + month view |
| 2. Testes | ✅ 4 novos (labels/cores distintos, fallback house p/ valor desconhecido); suíte 1044/1044 |
| 3. ACs | ✅ AC1-AC6; AC4 verificado por grep: zero referências restantes a "Sala de Reuniões" fora de comentário |
| 4. Regressões | ✅ Cards renderizam `apt.location` direto — compromissos antigos com Sala de Reuniões seguem visíveis; **Tailwind v4 auto-detecta `src/lib`** (verificado `globals.css`/postcss — sem risco de purge das cores) |
| 5. Performance | ✅ N/A (coluna a mais no select) |
| 6. Segurança | ✅ Seletor é só UX — enforcement do team é server-side (`resolveTeam`, 81-1) |
| 7. Documentação | ✅ Story completa; comentários citando a story nos pontos de código |

Pronta para `@devops *push`.

## Change Log
- @sm (River): story criada em Draft a partir do Epic 81 (2ª de 4), incorporando a nota do QA
  da 81-1 (GET sem `team`).
- @po (Pax): validação checklist 10 pontos → **GO (10/10)**. Status Draft → Ready.
- @dev (Dex): helper team-badge + badges/acentos nas 2 agendas + month view + seletor no modal + Sala de Reuniões removida. Status Ready → InReview.
- @qa (Quinn): QA gate **PASS** (7/7), incl. verificação do Tailwind v4 content detection p/ src/lib. 
