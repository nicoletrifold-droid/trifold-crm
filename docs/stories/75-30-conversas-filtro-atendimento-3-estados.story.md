# Story 75-30 — Filtro Atendimento com 3 estados (Apenas IA / Humano + IA / Humano)

## Metadata
- **Status:** Done
- **Epic:** 75 · **Branch:** main · **Complexidade:** S (2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** gestor, **I want** o filtro de Atendimento das Conversas com 3 estados claros,
**so that** eu separe conversas só-IA, IA→corretor e humano-puro.

## Contexto
Refina o filtro da 75-28 (que tinha IA/Humano). Definição do usuário (2026-06-23):
- **Apenas IA**: falou só com a Nicole, nunca repassado ao corretor (vaga, fornecedor).
- **Humano + IA**: Nicole começou e passou pro corretor, que conversou.
- **Humano**: humano falou sem a Nicole (lead manual) — hoje VAZIO, sem projeto futuro.
Distinção humano_ia × humano = se há mensagem da Nicole (role='assistant') na conversa.

## Escopo
**IN:**
- `conversas/page.tsx`: fetch de mensagens de TODAS as conversas movido p/ antes do
  filtro; helper `atendimentoDe(conv)` → 'ia' | 'humano_ia' | 'humano' (ia = is_ai_active;
  senão humano_ia se a Nicole participou, humano caso contrário). Filtro `ia` usa os 3 valores.
- Selo do card com 3 estados: "🤖 Apenas IA" / "🤖 Humano + IA" / "Atendimento humano".
- `lead-filters.tsx`: opções Apenas IA / Humano + IA / Humano.

**OUT:** broker chat (sem esse filtro); criar tracking de "humano puro" (placeholder vazio).

## Acceptance Criteria
1. Filtro com Todos / Apenas IA / Humano + IA / Humano.
2. Apenas IA = is_ai_active; Humano + IA = handoff + Nicole participou; Humano = handoff + sem Nicole.
3. Selo do card reflete os 3 estados.
4. Conferido em prod: 65 / 6 / 0 (apenas IA / humano+IA / humano).
5. typecheck e lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.30-...yml`, quality_score 93)
- **typecheck/lint:** limpos.
- **Validação prod:** 65 Apenas IA, 6 Humano + IA, 0 Humano (bate com a descrição).

## File List
- `packages/web/src/app/dashboard/conversas/page.tsx`
- `packages/web/src/components/lead-filters.tsx`
