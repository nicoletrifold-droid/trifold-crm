# Story 75-357 — As opções do formulário "viraram números": o campo do rótulo estava esmagado

**Status:** InReview — gate PASS · sem migration
**Tipo:** Regressão de layout que impedia editar conteúdo (3ª reincidência da mesma classe)
**Epic:** 89 — formulário de qualificação (relatado durante o Epic 75)
**Complexidade:** XS (~1 pt — uma classe-base, 12 usos, 1 teste de guarda)
**Fluxo:** @sm → @po → @dev → @qa → @devops

## O sintoma relatado

Na tela **Campanhas → Formulários**, as opções de uma pergunta de múltipla escolha apareciam como
`10`, `10`, `8` — números, não texto. O Marcos: *"não consigo nem editar, quanto mais preencher mais
alguma"*.

## O que realmente estava acontecendo

O dado **nunca** foi perdido. Conferido no banco (`lead_forms.schema`, formulário "Investimento
Maringá — Agosto"):

```json
{"peso": 10, "valor": "protecao_valorizacao", "rotulo": "Proteção e valorização patrimonial"}
{"peso": 10, "valor": "renda_passiva",        "rotulo": "Obter renda passiva (locação/Airbnb)"}
{"peso":  8, "valor": "compra_venda",         "rotulo": "Obter resultado comprando e vendendo"}
```

O formulário público continuou mostrando os textos certos para o lead o tempo todo. O defeito era só na
tela de edição:

```tsx
const inputCls = "w-full rounded-lg ..."                        // ← a base tem largura

<input value={o.rotulo} className={`${inputCls} flex-1`} />     // rótulo
<input value={o.peso}   className={`${inputCls} w-20`}   />     // peso
```

**No Tailwind, `w-20` não vence `w-full` por estar depois na string** — quem decide é a ordem no CSS
gerado. O campo do peso ficava com largura cheia, o do rótulo era comprimido a ~30px, e o que sobrava na
tela era: uma caixinha vazia (o rótulo, com o texto invisível) e uma caixa larga com o número (o peso).

O `+ Opção` tinha o mesmo sintoma pelo mesmo motivo — a linha nova nascia igualmente esmagada.

## AC1 — A largura sai da base e vai para quem usa

`inputCls` não carrega mais `w-*`. Cada uso declara a sua:

| Uso | Classe |
|---|---|
| campo que ocupa a linha | `w-full` |
| campo elástico em flex | `min-w-0 flex-1` |
| campo de largura fixa | `w-20 shrink-0` / `w-auto shrink-0` |

O `min-w-0` não é enfeite: sem ele um input em flex não encolhe abaixo do conteúdo e volta a empurrar o
vizinho — o mesmo sintoma por outro caminho.

**O defeito estava em 5 inputs, não em 1.** Além das opções, o `w-auto` de dois selects (condição e
tipo da pergunta nova) também perdia para o `w-full` da base. Corrigidos todos os 12 usos do arquivo.

## AC2 — Guarda contra a quarta vez

Esta é a **terceira** ocorrência desta classe de bug no projeto (registro em
`feedback-tailwind-ordem-utilitarios`). Como não há jsdom aqui para testar layout, o teste lê o
**fonte** e trava duas regras:

1. `inputCls` não pode voltar a ter classe `w-*`;
2. todo input com `flex-1` precisa de `min-w-0` (ou `min-w-[...]`).

Teste que lê arquivo é feio. Mais feio é a mesma pegadinha voltar uma quarta vez.

## Dev Agent Record

- [x] AC1 — base sem largura; 12 usos ajustados.
- [x] AC2 — 2 testes de guarda lendo o fonte.

### Decisões de implementação

- **Não mexi no schema nem nos dados.** O diagnóstico começou justamente por conferir se `rotulo` existia
  no banco: existia, íntegro, e o formulário público sempre o exibiu. Qualquer "correção de dados" aqui
  teria sido estrago.
- **Corrigi os 5 inputs, não só o relatado.** Os outros dois `w-auto` estavam com o mesmo defeito
  latente; deixar para depois é garantir um segundo relato.

### Validações

`npx vitest run` 234 arquivos / **2.835 testes** ✅ (2 novos) · `type-check` 8/8 ✅ · `eslint` 0 erros.

⚠️ **Layout não tem teste automatizado neste projeto.** A prova final é abrir Campanhas → Formulários e
ver o texto da opção no campo largo, com o peso no campo estreito ao lado.

## File List

- `packages/web/src/app/dashboard/campaigns/formularios/construtor-perguntas.tsx` — AC1
- `packages/web/src/app/dashboard/campaigns/formularios/construtor-estilos.test.ts` *(novo)* — AC2
- `docs/qa/gates/75-357-construtor-opcoes-esmagadas.yml` *(novo)*
