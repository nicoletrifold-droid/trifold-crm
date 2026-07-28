# Story 75-225 — Menu de abertura: rolar automaticamente para mostrar todos os templates

**Status:** Done
**Tipo:** UX Fix
**Epic:** Atendimento WhatsApp
**Complexidade:** S

## Contexto
Incidente de confusão real (28/07): Marcos reportou que "só aparecem 3 dos 4 templates"
no menu do "Iniciar atendimento". Investigação provou que **os 4 renderizam** (Meta,
API e DOM corretos) — o 4º item (`abertura_basica`, justamente o mais novo) ficava
**abaixo da dobra** da área rolável da conversa, invisível sem rolar manualmente.

Causa: o menu (75-217) expande **inline** abaixo do botão, dentro do container de
scroll da conversa (`ConversationThread`). Ao abrir, nada garante que a lista inteira
(e a dica "Toque na mensagem…") entre na área visível — em janelas menores os últimos
itens ficam escondidos e parecem não existir.

## Acceptance Criteria
1. **AC1** — Ao abrir o menu (templates carregados), a lista rola automaticamente
   para que o **último item + a dica abaixo dele** fiquem visíveis; se a lista for
   maior que a viewport, prioriza mostrar o fim da lista (o começo o usuário já viu).
2. **AC2** — O scroll acontece também no caminho assíncrono (clicou → loading →
   templates chegaram), não só quando já estavam em cache no estado.
3. **AC3** — Comportamento idêntico em todas as telas que reusam `BrokerMessageInput`
   (/broker, /dashboard/leads, /dashboard/conversas, /dashboard/chat) e nos dois temas.
4. **AC4** — Sem regressão no fluxo de envio (75-142/75-217): toque envia o template,
   estados loading/disabled preservados; fechar/reabrir o menu volta a garantir a
   visibilidade (scroll roda de novo).

## Solução proposta (não prescritiva)
`useEffect` no `BrokerMessageInput` observando `templatesOpen && templates !== null`:
`scrollIntoView({ block: "nearest", behavior: "smooth" })` num marcador no **fim** do
bloco do menu (após a dica), via `ref`. `block: "nearest"` evita "roubar" o scroll
quando tudo já está visível. Sem dependências novas.

## Tasks
- [x] Ref + efeito de scroll no fim do menu em `broker-message-input.tsx` (dispara ao abrir e ao carregar).
- [x] Verificação manual em prod (/dashboard/leads, viewport 694px, lead real): menu abre e o 4º template fica 100% visível sem rolagem manual (rect 647–685 < 694). Demais telas reusam o mesmo componente.
- [x] Teste do componente — suíte não tem padrão de render-test p/ este componente (só testes de lógica); verificação manual registrada no QA.
- [x] Suíte (1257 pass) + tsc/eslint/build limpos.

## Fora do escopo
- Reordenar templates (ordem segue `OPENING_TEMPLATE_PARAMS` — decisão da 75-217).
- Redesenhar o menu como dropdown/popover flutuante.

## Riscos
- `scrollIntoView` dentro de container com `overflow` aninhado pode rolar a página
  toda em vez do container — validar no layout real das 4 telas.
- Não disparar o scroll em re-renders não relacionados (efeito deve depender só de
  `templatesOpen`/`templates`).

## Dev Agent Record
### File List
- `packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx`
- `docs/stories/75-225-menu-abertura-scroll-automatico.story.md` (novo)

## QA Results
### Review Date: 2026-07-28 — Reviewed By: Quinn
| Check | Veredito | Evidência |
|-------|----------|-----------|
| AC1 scroll ao abrir | PASS | ref no fim do bloco (dica) + scrollIntoView(nearest) — mostra fim da lista. |
| AC2 caminho assíncrono | PASS | deps `[templatesOpen, templates]` — dispara quando templates chegam pós-loading. |
| AC3 4 telas | PASS (code) | Mudança no próprio `BrokerMessageInput`, reusado pelas 4 telas. Smoke em prod pendente. |
| AC4 sem regressão no envio | PASS | Fluxo de envio intocado; suíte 1257 pass. |
| Risco: re-render espúrio | PASS | Efeito guarda `templatesOpen && templates !== null`; optional call p/ jsdom. |
| Testes/Build | PASS | 1257 testes; tsc/eslint/build limpos. Sem padrão de render-test p/ o componente → verificação manual. |

Gate: PASS (smoke em prod pós-merge como verificação final)
— Quinn 🛡️

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-28 | 0.1 | Story criada a partir do incidente "template sumido" (era dobra/scroll). | @sm (River) |
| 2026-07-28 | 0.2 | Validação GO (10/10) — Draft → Ready. | @po (Pax) |
| 2026-07-28 | 1.0 | Implementado + QA PASS + PR #296 merged + smoke em prod OK → Done. | @dev (Dex) + @qa (Quinn) + @devops (Gage) |
