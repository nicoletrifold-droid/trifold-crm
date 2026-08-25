---
name: mutacao-prova-teste-real
description: Ao revisar testes novos, rodar mutação no código (não só ler o teste) — e saber que mock síncrono NUNCA prova `await`
metadata:
  type: feedback
---

Ao validar testes novos, **rode mutações no código de produção** em vez de só ler as asserções.
Uma mutação por afirmação que o teste faz — não uma só. Restaure com backup antes de cada rodada
(`cp` para o scratchpad, `cp` de volta).

**Why:** o usuário pede explicitamente "confirme, é o que separa teste real de teste decorativo"
(follow-up da Story 75-367). Rodar as 3 mutações naquele caso revelou uma lacuna que a leitura do
teste não revelava: a asserção de ordem era load-bearing (bom), mas o `await` não era guardado por
nada (lacuna real).

**How to apply:** para cada teste novo, mutar (a) a **guarda** (`if (x > 0)` → `if (false)`),
(b) a **ordem** (mover o bloco), (c) o **`await`** (→ `void`). Se a mutação não derruba nenhum
teste, a asserção correspondente é decorativa — reporte como concern LOW, não como bloqueio, quando
a lacuna for pré-existente no arquivo.

## Armadilha específica deste repo: mock de `logEventOnce`

Nos testes de cron (`packages/web/src/app/api/cron/*/route.test.ts`) o mock de `logEventOnce` faz
`push` **síncrono** no array observado, na chamada. Consequência: **nenhuma** asserção sobre esse
array distingue `await logEventOnce(...)` de `void logEventOnce(...)`. Trocar por `void` deixa a
suíte 100% verde.

Isso importa porque o padrão do projeto (Story 87-6) é exatamente "usar `logEventOnce` aguardado
porque o fire-and-forget morre no congelamento da lambda". O teste que supostamente protege o padrão
não protege. Também não há `@typescript-eslint/no-floating-promises` configurado para pegar.

Fecha em ~3 linhas: o mock empurra dentro de uma continuação diferida
(`await Promise.resolve()` antes do `push`).

Relacionado: [[cron-lock-recibo-vs-evento]]
