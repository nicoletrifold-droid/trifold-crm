# Story 75-310 — Perfis de Acesso 2.0 · F3-9: Conversas & Chat via capabilities

**Story ID:** 75-310 · **Status:** InReview · **Estimativa:** S (~3 pts)
**Fluxo:** @sm → @po GO(9/10) → @dev → @qa → @devops (esteira contínua autorizada pelo Marcos 13/08)

## Resumo

6 capabilities enforced (53 no total): `conversas.enviar` [COR,A,S,GC,SDR] (composers das telas
de lead — a dupla CAN_SEND_ROLES divergente MORREU), `conversas.enviar_qualquer` [A,S,GC,SDR,GR]
(send-message/send-file/resend/media-retry + composer do /dashboard/conversas),
`conversas.abrir_template` (gate REAL no opening-context/start-whatsapp; a
OPENING_PRIVILEGED_ROLES vira DICA de UI client-side CONGELADA ao seed por teste),
`conversas.transferir` [A,S], `chat.responder` e `chat.gerenciar_participantes` [A,S,GR,GC].

**Zero delta real.** Duas ampliações NOMINAIS documentadas e provadas inalcançáveis por prod:
GR no composer de /dashboard/conversas (não tem o módulo conversas) e GC no listar do Chat
(não tem o módulo chat). Consultoria segue fora do Chat (tem o módulo, não o seed — como hoje).
`conversas.ver_qualquer` segue NÃO-enforced (gate é RLS — F4; inclui o furo do obras no
god-gate, também F4). STAFF_ROLES sobrevive SÓ como seleção de participantes (.in) — congelada
ao seed por teste.

## Evidências

Diff seed×gate ×6 congelado · smoke 8/8 (API chat 200; conversas abre; 6 ações na matriz) ·
suíte **2346 passed** · tsc 0 · eslint base 24 · build 0 · 1 teste de rota adaptado (resend).

## QA — PASS (95)

Padrão novo consolidado: constante client-safe que sobrevive como dica de UI = congelada ao
seed por teste (opening-roles, STAFF_ROLES). Ampliações nominais verificadas contra os módulos
REAIS de prod antes de aceitar. Sem concerns.
