# Story 75-108 — Engajamento da imobiliária: categórico → nota 0–10 com cores

## Metadata
- **Status:** InReview — @dev + @qa · pronto p/ @devops (migration 151) · **Epic:** IMOB · **Branch:** feat/75-108-imob-engajamento-nota · **Complexidade:** S (1 ponto)
- **quality_gate_tools:** [teste unit da validação, typecheck, lint, verificação da coluna no banco]

## Story
**As a** gestor, **I want** avaliar o engajamento da imobiliária numa **nota de 0 a 10 (com cores)** em vez de Alta/Média/Baixa, **so that** a avaliação seja mais granular. (Pedido do dono; substitui a Story 75-97.)

## Escopo
**IN:**
1. Migration 151 — `imobiliarias.engajamento` passa de `text` (alta/media/baixa) para `integer` 0–10 (CHECK 0..10, null=não avaliado). Mapa: alta→9, media→6, baixa→3.
2. `lib/imob/imobiliarias.ts` — remove ENGAJAMENTO/labels/tone categóricos; adiciona `ENGAJAMENTO_NOTAS` [0..10] + `engajamentoTone(nota)` (0–3 vermelho, 4–6 âmbar, 7–8 lima, 9–10 verde, null cinza); tipo `engajamento: number|null`; validação nota 0–10.
3. `imobiliarias-manager.tsx` — célula inline vira dot colorido + select 0–10 (0..10 + "Não avaliado"); `setEngajamento` envia number|null.
4. Testes atualizados.

**OUT:** histórico/analytics de engajamento; não mexe em outras colunas.

## Acceptance Criteria
1. Célula "Engaj." mostra select 0–10 + "Não avaliado", com pontinho colorido pela faixa; salva inline.
2. Nota fora de 0–10 ou não inteira → API rejeita.
3. Dados antigos (alta/media/baixa) migram para 9/6/3.
4. teste/typecheck/lint limpos.

## File List
- `supabase/migrations/151_imobiliarias_engajamento_nota.sql`
- `packages/web/src/lib/imob/imobiliarias.ts` · `imobiliarias.test.ts`
- `packages/web/src/app/dashboard/imob/imobiliarias/_components/imobiliarias-manager.tsx`

## Change Log
- 2026-07-02 — @sm/@po/@dev/@qa — Engajamento vira nota 0–10 com cores. 10/10 testes, tsc 0, lint 0. Handoff @devops (migration 151).
