---
name: mutacao-prova-teste-real
description: Ao revisar testes novos, rodar mutação no código (não só ler o teste); mock síncrono NUNCA prova `await`; e "tautologia?" se responde DESMIGRANDO a chamada, não lendo a asserção
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

## AC de concorrência/latência: mutar a FORMA, não a contagem

Quando a AC mede custo ("≤ N idas ao banco", "profundidade sequencial = 1"), a asserção de
**contagem** é quase sempre tautológica — ela repete o número que o código produz. A mutação que
vale é a que **troca a forma mantendo a contagem**: `Promise.all(xs.map(f))` → `for (const x of xs)
{ await f(x) }`. Mesmas N queries, profundidade N. Se o teste continuar verde, ele nunca mediu
profundidade.

No gate da 87-17 essa mutação foi a única das quatro que o @dev não tinha feito, e foi ela que
provou que a `AC4` não era decorativa (`expected false to be true`). O padrão do teste que
sobrevive: instrumentar o fake com `onEmit`/`onResolve` e assertar
`log.indexOf("resolve") === totalDeEmissoes`.

Nuance de fidelidade que vale registrar no gate: um fake que chama `onEmit()` dentro de
`maybeSingle()` emite **sincronamente**, enquanto o `PostgrestBuilder` real (thenable não-nativo)
emite num **microtask**. A conclusão de profundidade 1 não muda — microtasks drenam antes de
qualquer macrotask de rede — mas dizer isso no gate é a diferença entre prova e otimismo.

Relacionado: [[epic-87-qa-patterns]]

## "O teste virou tautologia?" — o experimento é DESMIGRAR a chamada, não ler a asserção

Quando uma função muda o **shape** do retorno (`Date[]` → `{ slots, houveIncerteza }`), o `tsc` pega
quase todos os chamadores de teste — mas **não** os que assertam com `toEqual`/`toContain` sobre
`unknown`-ish. Ex. real (87-18): `const slots = await f(...); expect(slots).toEqual([])` compila
limpo com o objeto novo, porque `toEqual` aceita qualquer tipo.

A tentação é chamar isso de buraco de cobertura. **Não é** — e a forma de saber não é raciocinar,
é o experimento de 2 minutos: **desfazer a migração naquela linha** (`const { slots }` → `const
slots`) e medir as duas coisas juntas:

- `tsc --noEmit` → EXIT=0, silêncio (o compilador é a rede com buraco);
- `vitest run` do arquivo → **1 vermelho**, e é exatamente aquele teste.

Se o teste fica vermelho, ele nunca virou tautologia: o buraco é do compilador, e a rede é a suíte.
Se ficasse verde, aí sim é achado.

**Why:** no gate da 87-18 essa era a pergunta mais forte do lote e o @dev tinha sido honesto sobre o
fato sem tirar a conclusão. Sem o experimento eu teria registrado um achado que não existe.

**How to apply:** vale para toda story que muda tipo de retorno de função com muitos chamadores de
teste. E o corolário para o gate: quando `tsc` dá EXIT=0 numa árvore mutada, **prove que a invocação
é capaz de reprovar** (injete um erro de tipo deliberado e veja o `TS…`) antes de escrever "verde
real" no gate.

Relacionado: [[epic-87-qa-patterns]], [[reverificacao-focada]]
