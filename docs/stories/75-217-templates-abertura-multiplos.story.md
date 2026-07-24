# Story 75-217 — "Iniciar atendimento" com menu de templates de abertura por contexto

**Status:** Done
**Tipo:** Feature
**Epic:** Atendimento WhatsApp
**Complexidade:** M

## Contexto
Pedido do Marcos (24/07): o botão "Iniciar atendimento" enviava UMA mensagem fixa
(`abertura_atendimento_corretor`). Cada contexto de lead pede abordagem diferente →
ao clicar, abrir um **menu com os templates aprovados na Meta**, com preview já com o
nome do lead. O corretor não precisa aparecer no texto: a assinatura do remetente
humano já mostra quem fala (ver [[project-assinatura-remetente-humano]]).

## Arquitetura
**A Meta é a fonte da verdade.** O menu lista `message_templates` da WABA com status
`APPROVED`, prefixo `abertura_` e variáveis conhecidas pelo mapa
`OPENING_TEMPLATE_PARAMS` (`lib/whatsapp/opening-templates.ts`). Template novo =
criar na Meta com prefixo `abertura_` + registrar 1 linha no mapa; aparece no menu
sozinho quando aprovar. Deploy é seguro antes da aprovação (PENDING não lista).

## Templates submetidos à Meta (24/07, PENDING)
| Nome | Variáveis | Corpo |
|------|-----------|-------|
| `abertura_interesse_prioridades` | {{1}}=nome | "Oi {{1}}! Tudo bem?\n\nVi que você demonstrou interesse em buscar um imóvel recentemente. Passei para saber o que é mais importante para você no momento: localização, tamanho da planta ou facilidade no pagamento?" |
| `abertura_interesse_status` | {{1}}=nome | "Oi {{1}}! Tudo bem?\n\nVi que você deixou seu contato demonstrando interesse em imóveis. Conseguiu dar uma olhada em algo ou ainda está buscando?" |

IDs Meta: 1342431698071342 / 2303552867052688 · categoria MARKETING · pt_BR.

## Acceptance Criteria
1. **AC1** — Clicar em "Iniciar atendimento" abre menu com os templates de abertura
   APROVADOS, preview renderizado com o **primeiro nome** do lead (sem nome → "👋").
2. **AC2** — Escolher um item envia AQUELE template; histórico espelha o corpo REAL
   vindo da Meta (fim da cópia hardcoded que desatualizava — lição da 75-166).
3. **AC3** — `POST start-whatsapp` sem body segue enviando o template original
   (backward compat); template desconhecido → 400; não aprovado → 400 com mensagem.
4. **AC4** — Handoff/log/conversa preservados (75-142): Nicole pausa, envio logado,
   role=broker no histórico.
5. **AC5** — Mesmo comportamento nas telas que reusam `BrokerMessageInput`
   (/broker, /dashboard/leads, /dashboard/conversas, /dashboard/chat).

## Tasks
- [x] `lib/whatsapp/opening-templates.ts` — mapa de variáveis, listagem/filtro da Meta, render.
- [x] `lib/whatsapp/opening-context.ts` — contexto compartilhado (lead+acesso+variáveis+credenciais).
- [x] `GET /api/leads/[id]/opening-templates` — menu com previews.
- [x] `POST /api/leads/[id]/start-whatsapp` — aceita `{ template }`, valida contra a Meta, espelho real.
- [x] UI: menu expansível no `BrokerMessageInput` (cards com preview, envio por toque).
- [x] Submeter os 2 templates na Meta via Graph API (PENDING).
- [x] Testes (7 novos) · suíte 1214 pass · tsc/eslint/build limpos.

## Pendências (fora do código)
- ⏳ **Aguardar aprovação da Meta** dos 2 templates — até lá o menu mostra só o original.
- Mudança de fallback: saudação usa primeiro nome; sem nome → "👋" (antes: "tudo bem").

## Dev Agent Record
### File List
- `packages/web/src/lib/whatsapp/opening-templates.ts` (novo)
- `packages/web/src/lib/whatsapp/opening-templates.test.ts` (novo)
- `packages/web/src/lib/whatsapp/opening-context.ts` (novo)
- `packages/web/src/app/api/leads/[id]/opening-templates/route.ts` (novo)
- `packages/web/src/app/api/leads/[id]/start-whatsapp/route.ts`
- `packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx`
- `docs/stories/75-217-templates-abertura-multiplos.story.md` (novo)

## QA Results
### Review Date: 2026-07-24 — Reviewed By: Quinn
| Check | Veredito | Evidência |
|-------|----------|-----------|
| AC1 menu + preview | PASS | Listagem filtra APPROVED+prefixo+mapa+pt_BR (teste); preview via renderOpeningBody. |
| AC2 espelho real | PASS | Corpo vem da listagem da Meta na hora do envio; sem cópia hardcoded. |
| AC3 backward compat | PASS | Sem body → DEFAULT_OPENING_TEMPLATE; UNKNOWN_TEMPLATE/TEMPLATE_NOT_APPROVED → 400. |
| AC4 handoff/log | PASS | Fluxo 75-142 preservado (handoff, logWhatsappSend, role=broker). |
| Segurança | PASS | Mesmas regras de acesso do endpoint original (privilegiados ou dono do lead); token nunca vai ao client. |
| Testes/Build | PASS | 7 testes novos; 1214 na suíte; tsc/eslint/build limpos. |

Gate: PASS
— Quinn 🛡️

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-24 | 1.0 | Menu de templates por contexto + 2 templates submetidos à Meta. QA PASS. | @dev (Dex) + @qa (Quinn) |
