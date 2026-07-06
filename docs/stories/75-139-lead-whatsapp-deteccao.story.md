# Story 75-139 — Fundação: detecção de WhatsApp do lead (celular válido + WhatsApp comprovado)

## Metadata
- **Status:** Done · **Epic:** Atendimento WhatsApp do corretor · **PR:** #136 · **Complexidade:** S (2 pontos) · **Branch:** feat/75-139-lead-whatsapp-deteccao
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Primeira story do epic "corretor atende o lead de WhatsApp pelo número da empresa". Precisamos de uma regra única/testável para decidir **quando mostrar o ícone de WhatsApp** num lead e **quão confiante** estamos de que o número é WhatsApp — já que a Meta não oferece validação prévia confiável (endpoint de contacts descontinuado). Decisão do diretor: mostrar o ícone em **todo celular válido**; quando o número não tiver WhatsApp, o aviso vem no envio (Story 75-141). Ver contexto de WhatsApp em [[project-roleta]]/webhook e integração Meta.

## Regra
- **Celular BR válido:** após remover não-dígitos, é um celular (DDD de 2 + 9 dígitos iniciando em 9; aceita com/sem DDI 55). Telefone `tg:` (Telegram) ⇒ não é WhatsApp.
- **WhatsApp comprovado:** `source` do lead indica WhatsApp/clique-no-anúncio (ex.: `whatsapp*`, `whatsapp_click_to_ad`, `ctwa`) **ou** o lead já tem conversa de WhatsApp.
- **Estado retornado:** `"confirmed"` (comprovado), `"likely"` (celular válido, não comprovado), `"none"` (não parece celular / telegram).

## Escopo
**IN:** `lib/leads/whatsapp.ts` (novo + teste):
- `isLikelyMobileBR(phone: string | null): boolean`
- `isWhatsAppConfirmed(input: { source?: string | null; hasWhatsappConversation?: boolean }): boolean`
- `whatsAppState(input: { phone: string | null; source?: string | null; hasWhatsappConversation?: boolean }): "confirmed" | "likely" | "none"`

**OUT:** UI (Story 75-140); aviso de envio (Story 75-141); validação online via Meta (não existe).

## Acceptance Criteria
1. `isLikelyMobileBR`: aceita `"44999114326"`, `"+5544999114326"`, `"(44) 99911-4326"`; rejeita fixo `"4433334444"` (8 díg. sem 9), vazio/null, e `"tg:123"`.
2. `isWhatsAppConfirmed`: true para `source` `whatsapp_click_to_ad`/`whatsapp`/`ctwa` (case-insensitive) ou `hasWhatsappConversation:true`; false caso contrário.
3. `whatsAppState`: `"confirmed"` se comprovado; senão `"likely"` se celular válido; senão `"none"`.
4. Testes cobrindo os 3 estados e as bordas. tsc/lint/vitest limpos.

## Tasks (@dev)
- [ ] `lib/leads/whatsapp.ts` + `whatsapp.test.ts`.
- [ ] tsc/eslint/vitest.

## Riscos
- **Baixo.** Função pura, sem I/O. Cuidar de DDI 55, 9º dígito e do prefixo `tg:`.

## Dev Agent Record (@dev — 2026-07-06)
- **`lib/leads/whatsapp.ts`** (+7 testes): `isLikelyMobileBR` (celular BR, com/sem DDI 55, máscara, 9º dígito; `tg:`→false), `isWhatsAppConfirmed` (origem whatsapp/ctwa/click_to_ad ou conversa existente), `whatsAppState` (confirmed>likely>none; comprovado vence, exceto Telegram).
- **Checks:** tsc 0 · eslint 0 · vitest (7 novos).
- **Files:** `lib/leads/whatsapp.ts` (+test).

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1-4 cobertos por 7 testes (celulares válidos/ inválidos, origens, 3 estados, Telegram). Função pura, sem I/O. tsc/eslint limpos.

## Change Log
- 2026-07-06 — @devops — PR #136 (com 75-140) + merge. Status → Done.
- 2026-07-06 — @qa — **QA GATE: PASS**. 7 testes.
- 2026-07-06 — @dev — Implementado (helper de detecção). Status → InReview.
- 2026-07-06 — @po — **GO (10/10)**. Status Draft → Ready.
- 2026-07-06 — @sm — Story criada (Draft).
