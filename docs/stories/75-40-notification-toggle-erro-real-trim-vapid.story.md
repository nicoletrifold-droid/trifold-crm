# Story 75-40 — Expor erro real no toggle de notificações + sanitizar VAPID key

## Metadata
- **Status:** InReview · **Epic:** 75 · **Branch:** main · **Complexidade:** S (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [type-check, lint, build]

## Story
**As a** administrador do CRM,
**I want** que o botão "Ativar notificações" mostre o erro real quando falhar (em vez da mensagem genérica),
**so that** um problema de push possa ser diagnosticado na hora, sem precisar inspecionar o build.

## Contexto
Em 2026-06-23 o push quebrou em produção (todas as plataformas; reportado por usuário iOS PWA).
Causa raiz: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` no Vercel tinha um `\n` literal no fim → base64 inválido
→ `window.atob()` lançava dentro de `urlBase64ToUint8Array` → o `catch {}` cego de `enable()` em
`notification-toggle.tsx` transformava tudo em "Não foi possível ativar. Tente novamente.".
O env já foi corrigido (infra, sem código). Esta story é a **blindagem** pra que o mesmo tipo de
falha seja autodiagnosticável e mais resistente.

> NOTA: `.trim()` sozinho NÃO teria evitado a falha original (o lixo era `\n` literal — barra + a
> letra `n` — e `n` é caractere base64 válido). O valor correto tem que vir limpo do env. O ganho
> real desta story é **expor o erro real**; o trim/guard é higiene defensiva contra espaços/quebras.

> NOTA DE NUMERAÇÃO: criada originalmente como 75-38, renumerada para 75-40 por colisão com outra
> sessão AIOS que rodava em paralelo (kill switch do portal, que ficou com 75-39).

## Escopo
**IN:**
- `notification-toggle.tsx`: no `catch` de `enable()` (e `disable()`), `console.error` do erro real
  e incluir `name: message` curto na mensagem mostrada ao usuário.
- Sanitizar a leitura da VAPID key: `(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim()` com
  guard que lança erro claro ("Chave VAPID ausente") se vazia.
**OUT:**
- `broker-push-prompt.tsx` e `portal/push-prompt.tsx` (mesmo padrão; ficam pra follow-up se preciso).
- Qualquer mudança de infra/env (já feita fora desta story).

## Acceptance Criteria
1. Quando `enable()` falha, o `console` registra o erro real (objeto Error completo).
2. A mensagem na UI inclui um detalhe curto do erro (`name: message`), mantendo o prefixo amigável.
3. A VAPID key é lida com `.trim()`; se vazia, lança erro explícito antes do `subscribe`.
4. Caminho de sucesso inalterado (subscribe + POST /api/push/subscribe).
5. type-check, lint e build limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.40-notification-toggle-erro-real.yml`)
- **type-check:** limpo (`tsc --noEmit`). **lint (arquivo):** 0 problemas. **build:** OK.
- **ACs:** 1–4 verificados por leitura do diff; 5 verificado por execução.
- **Ressalva:** comportamento de permissão/registro depende do navegador → confirmação final no device.

## File List
- `packages/web/src/components/notification-toggle.tsx` — sanitiza VAPID key (`.trim()` + guard se vazia); `catch` de `enable()` e `disable()` agora faz `console.error` do erro real e mostra `name: message` na UI; `!res.ok` agora lança com o HTTP status.

## Change Log
- 2026-06-23 — @sm — Story criada (Draft) como 75-38.
- 2026-06-23 — @po — Validação GO (10/10). Status Draft → Ready.
- 2026-06-23 — @dev — Implementado; type-check/lint/build OK.
- 2026-06-23 — coordenação — sessão AIOS paralela colidiu no número 75-38 e na árvore de trabalho; meu código foi preservado (backup) e re-aplicado limpo sobre a main; renumerado para 75-40.
- 2026-06-23 — @qa — Gate PASS. Status → InReview.
