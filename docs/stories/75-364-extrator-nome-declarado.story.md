# Story 75-364 — "Meu nome é Diana" perdeu para "prazer receber sua carta"

**Status:** InReview — implementada · testes/lint/type-check verdes · sem migration
**Tipo:** Fix do extrator de nome declarado (`extractCollectedData`)
**Epic:** 75 — CRM Trifold
**Complexidade:** XS (~1 pt — 1 arquivo de produção, testes)
**Fluxo:** @sm → @po → @dev → @qa → @devops

## De onde veio

O rastro `LEAD_NAME_REPLACED` criado na 75-360 pagou o investimento em ~20h de produção: a única
troca de nome desde o deploy foi **"diana" → "Receber Sua Carta"**, com origem `declarado`. A
mensagem real da lead (20/08, conv `b93305b2`):

> "Olá. **Meu nome é Diana.** É um **prazer receber sua carta**. Sou de Hong Kong, na China. […]"

O nome declarado estava LÁ — e o extrator capturou a frase errada. O CRM só mostra "Diana" hoje
por **sorte**: a 2ª mensagem dela chegou 9s depois (fora da janela anti-rajada de 6s), o pipeline
concorrente leu "diana" antes do clobber, extraiu "Diana" e gravou por último ("diana"→"Diana"
não loga — mesmo nome sem caixa, por desenho).

## As 3 causas, no `qualification.ts`

1. **Ordem**: o padrão de cortesia (`prazer|olá|obrigado`) vem ANTES de `meu nome é` na lista —
   cortesia vencia declaração explícita presente na MESMA mensagem.
2. **Vírgula opcional** no padrão de cortesia: ele foi desenhado para "Prazer, Maria", mas sem a
   vírgula obrigatória casa "prazer **receber sua carta**", "prazer **em conhecer**", etc.
3. **Autoridade errada**: cortesia carimbava `name_origin='declarado'` — ou seja, com poder de
   SUBSTITUIR nome existente (a regra da 75-360). "Prazer, X" é a Nicole confirmando um nome, não
   a pessoa declarando; é inferência.

Bônus achado na revisão: `sou (?:o |a )?` com artigo opcional fazia "**Sou de** Hong Kong" /
"sou corretor" / "sou casado" virarem candidatos a nome **declarado**. Na conversa da Diana só não
aconteceu porque a cortesia casou primeiro.

## ACs

**AC1 — Declaração vence cortesia.** A mensagem real da Diana extrai `name="Diana"`,
`name_origin="declarado"`. Padrões de declaração explícita ("meu nome é", "me chamo", "pode me
chamar de", "me chamam de", "sou o/a", "aqui é") são tentados ANTES dos de cortesia.

**AC2 — Cortesia exige vírgula e vira inferência.** "Prazer, Maria" / "Olá, João" / "Certo,
Carlos" continuam extraindo (comportamento dos testes existentes), mas com
`name_origin="inferido"` — preenchem lead sem nome, **não substituem** nome existente
(`podeGravarNomeDoLead` já barra). "É um prazer receber sua carta" (sem vírgula) não extrai nada.

**AC3 — "sou" exige artigo.** "Sou o João" / "sou a Maria" = declaração. "Sou de Hong Kong",
"sou corretor" deixam de ser candidatos a nome. Perda assumida: "Sou Ana" (sem artigo) não é mais
capturado — se o lead está sem nome, a Nicole pergunta e o fallback de resposta curta pega.

**AC4 — Stopwords valem para os padrões também.** A guarda `ehStopword` (hoje só no fallback de
mensagem curta) passa a filtrar as capturas dos padrões: "Olá, tudo bem" não vira nome "Tudo Bem"
nem como inferência.

**AC5 — Testes existentes intactos.** Os casos de `qualification.test.ts` ("Prazer, Maria
Silva!", "Olá, João!", "Certo, Carlos") e de `nome-do-lead.test.ts` ("meu nome é Amauri Souza" =
declarado) continuam passando sem edição.

## Fora de escopo

- Mexer no fallback de mensagem curta (1–3 palavras) — intocado, já é `inferido`.
- Alargar `PRICE_SIMULATION_PATTERNS` ou qualquer coisa da 75-361.
- Corrida entre pipelines da mesma conversa (a "sorte" da Diana) — a janela anti-rajada de 6s da
  75-359 é a mitigação existente; mensagens >6s são turnos legítimos.

## Dev Agent Record

**Branch:** `75-364-extrator-nome` (worktree `~/tmp_claude/wt-75-364`)

| arquivo | o quê |
|---|---|
| `packages/ai/src/flows/qualification.ts` | padrões com origem por grupo (declaração/cortesia), ordem invertida, vírgula obrigatória na cortesia, artigo obrigatório no "sou", stopwords nas capturas |
| `packages/ai/src/chat/pipeline.ts` | só comentário — "prazer, X" sai dos exemplos de declarado |
| `packages/ai/src/flows/nome-do-lead.test.ts` | casos novos com a mensagem real da Diana |

**Como conferir depois do deploy**

```sql
select created_at at time zone 'America/Sao_Paulo' as quando, message, metadata->>'origem' as origem
from system_events where event_type = 'LEAD_NAME_REPLACED' order by created_at desc;
```

Trocas com `origem='declarado'` devem ser sempre nome de gente. Qualquer "Receber Sua Carta" novo
= regressão.

## QA Results

**Verdict: PASS**

1. Code review ✓ — mudança contida no bloco de extração de nome; origem tipada por padrão.
2. Testes ✓ — 6 casos novos (mensagem REAL da Diana inclusa); suíte completa 2891 passando.
3. ACs ✓ — os 5 cobertos, incluindo AC5 (testes pré-existentes intactos, sem edição).
4. Regressões ✓ — "Prazer, Maria"/"Olá, João"/"Certo, Carlos" seguem extraindo (agora inferido);
   fallback de mensagem curta intocado. Perda assumida e documentada: "Sou Ana" sem artigo.
5. Performance ✓ — mesmos regex por chamada, ordem trocada.
6. Segurança ✓ — n/a.
7. Docs ✓ — docstring do `podeGravarNomeDoLead` corrigida ("prazer, X" saiu dos exemplos de declaração).

## Change Log

- 21/08 @sm: draft a partir do achado do rastro da 75-360 (conferência pós-deploy).
- 21/08 @po: GO (10/10).
- 21/08 @dev: implementada + testes; vitest 2891 ✓ · type-check 13/13 ✓ · lint ✓.
- 21/08 @qa: PASS.
