# Story 75-114 — Auto-preencher Finalidade a partir do form do Meta

## Metadata
- **Status:** InReview — @dev + @qa · pronto p/ @devops (sem migration) · **Epic:** Leads/Captação · **Branch:** feat/75-114-meta-finalidade-autofill · **Complexidade:** S (1 ponto)
- **quality_gate_tools:** [validação do mapeamento (8 casos), typecheck, lint]

## Story
O Lead Form do Meta já pergunta o objetivo da aquisição (ex.: "ambos_(uso_e_valorização_futura)"). Mapear essa resposta para `leads.finalidade` na captação, pra o sistema já entregar parte do perfil pronto (o corretor complementa o resto — Story 75-112/113).

## Escopo
**IN:** `api/webhooks/meta-ads/route.ts` — helper `deriveFinalidade(fieldData)` detecta o campo pelo nome (objetivo/finalidade/aquisição) e mapeia por palavras-chave → `moradia` | `investimento` | `ambos` (senão null). Preenche `finalidade` no lead NOVO; e no lead EXISTENTE só se ainda estiver vazia (não sobrescreve manual — mesmo padrão do utm/empreendimento).

**OUT:** WhatsApp/outros canais; não altera nada de banco (coluna `finalidade` já existe — migration 154).

## Acceptance Criteria
1. Lead novo do Meta com resposta de objetivo → `finalidade` preenchida (ambos/moradia/investimento).
2. "ambos" tem prioridade; "uso + valorização" → ambos; sem match → null (não inventa).
3. Lead existente: só preenche se `finalidade` estiver null.
4. Mapeamento coberto por casos representativos; tsc/lint limpos.

## File List
- `packages/web/src/app/api/webhooks/meta-ads/route.ts`

## Change Log
- 2026-07-02 — @dev/@qa — Auto-fill de Finalidade pelo objetivo do form do Meta (new + existing sem sobrescrever). 8/8 casos, tsc 0, lint 0. Sem migration. Handoff @devops.
