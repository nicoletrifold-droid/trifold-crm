# Story 82-5 — BUG UX: Análise IA invisível para o corretor (ficava abaixo do chat)

## Metadata
- **Status:** Done (QA PASS)
- **Epic:** 82 — Análise de Comportamento IA do lead
- **Branch:** fix/82-5-broker-analise-descobrivel
- **Tipo:** Bug UX — reportado pelo Marcos (prints, 2026-07-21): "o corretor não tem
  como acessar o botão de analisar" — a tela do corretor é chat-first e o painel
  (82-3) ficou ABAIXO do chat full-height; sem rolar, parece que não existe.

## Acceptance Criteria
- [x] AC1: painel ganha modo `collapsible` — inicia fechado (1 linha: título +
  botão "Analisar comportamento" + teaser), expande ao clicar; gerar análise
  sempre expande o resultado.
- [x] AC2: fechado com análise existente mostra a "Próxima ação" truncada
  (clicável); fechado e desatualizado mostra badge "desatualizada".
- [x] AC3: /broker/leads/[id] renderiza o painel colapsável ACIMA do chat
  (visível sem rolar, sem empurrar o composer); versão abaixo do chat removida.
- [x] AC4: dashboard (aba Análise IA) inalterado — sempre expandido.
- [x] AC5: tsc/eslint limpos, suíte 1107/1107, next build OK.

## File List
- `docs/stories/82-5-broker-analise-descobrivel.story.md` (this file)
- `packages/web/src/components/leads/behavior-analysis-panel.tsx` (prop collapsible)
- `packages/web/src/app/broker/leads/[id]/page.tsx` (painel movido p/ cima do chat)

## Change Log
- @sm/@po: fluxo mínimo de bug UX; GO.
- @dev (Dex): modo colapsável no painel compartilhado + reposicionamento no broker.
- @qa (Quinn): PASS — dashboard preservado (collapsible default false); checks verdes.
- @devops (Gage): PR + squash-merge + verificação pós-deploy.
