# Story 81-6 — Agenda: visibilidade IMOB na visão SEMANA + painel de detalhes

## Metadata
- **Status:** Done
- **Epic:** 81 — Agenda HOUSE × IMOB (`docs/stories/epics/epic-81-agenda-house-imob.md`)
- **Branch:** fix/81-6-agenda-semana-visibilidade-imob

## Context
Achado do Marcos no teste real (2026-07-17): a Story 81-2 aplicou badge/cor no day view e
month view, mas a agenda ABRE na visão **SEMANA** — que tem chips próprios sem tratamento —
e o painel "Detalhes do Agendamento" não mostrava equipe/imobiliária. Furo de cobertura da
81-2 (QA não listou a semana). Vale também para a agenda do corretor (semana + month + painel).

**Design (@ux Uma):** em visão densa marca-se a EXCEÇÃO — IMOB (minoria) ganha borda esquerda
violeta + flag "IMOB" na linha do horário + NOME DA IMOBILIÁRIA na 3ª linha (vaga, pois IMOB
não tem corretor house); HOUSE fica como está (ausência de marca = house; Dia e Detalhes
mostram os dois badges explícitos). Marcar todos os chips geraria ruído.

## Acceptance Criteria
- [x] AC1: Chips da visão SEMANA (dashboard E broker): compromisso IMOB com borda esquerda
  violeta + "IMOB" em violeta na linha do horário + nome da imobiliária em violeta.
- [x] AC2: Painel "Detalhes do Agendamento" (dashboard E broker): badge da EQUIPE no título
  (HOUSE/IMOB via teamBadge) + campos "Imobiliária" e "Corretor parceiro" (nome/telefone,
  de metadata — 81-4/81-5) quando presentes.
- [x] AC3: Month view do BROKER ganha a borda violeta nos mini-chips (81-2 só fez o dashboard).
- [x] AC4: Selects das duas páginas incluem `metadata`; type-check/lint/suíte verdes.

## File List
- `docs/stories/81-6-agenda-semana-visibilidade-imob.story.md` (this file)
- `packages/web/src/app/dashboard/agenda/page.tsx`
- `packages/web/src/app/broker/agenda/page.tsx`

## Change Log
- @ux (Uma): tratamento visual p/ chips densos (marcar exceção IMOB; house sem marca na semana).
- @dev (Dex): semana+detalhes nas 2 agendas + month do broker + metadata nos selects. 1059/1059.
- @qa (Quinn): PASS — cobertura agora fecha TODAS as visões (dia/semana/mês × dashboard/broker + 2 painéis).
- @devops (Gage): CI verde, squash-merge PR #225, deploy prod automático. Status InReview → Done.
