# Story 75-373 — O relatório impresso de brindes escapa HTML: 9 sítios, não 6, e uma régua que pega o próximo

## Metadata
- **Epic:** 75 — CRM core (módulo Brindes)
- **Story:** 75-373 — número livre confirmado em 2026-09-04 (`ls docs/stories/` mais alta da
  família 75 é `75-372`; nenhuma referência a `75-373` em branches, refs remotos ou PRs abertos).
- **Status:** Ready for Review
- **Priority:** P2 — dívida de segurança MEDIUM aceita e nomeada no gate da 75-372 (achado
  SEC-001), não bloqueante para produção porque exige usuário **autenticado da mesma org** com
  **permissão de escrita em brindes** — não há caminho anônimo nem externo.
- **Complexity:** S — um helper novo + **9** call sites, todos dentro de um único arquivo já
  conhecido. O trabalho não-trivial é o teste (AC5/AC6), não a correção em si.
- **Depende de / branch base:** esta story **NÃO** parte de `main`. Parte de
  `story/75-372-brindes-tamanho-relatorio` (PR **#570**, aberto contra `main`, ainda não
  mergeado), porque a 75-372 já editou `print-modal.tsx` e é a origem deste achado — abrir contra
  `main` hoje geraria conflito de merge quase garantido no mesmo arquivo. PR desta story é
  **empilhado** sobre o #570: nasce com base `story/75-372-brindes-tamanho-relatorio`, e o
  `@devops` deve retargetar para `main` (ou simplesmente mergear depois) quando o #570 fechar.

### Executor Assignment
- **Executor:** @dev (Dex).
- **Quality Gate:** @dev (Dex), pré-commit. Foco em segurança (injeção de HTML) além do padrão de
  código.
- **Quality Gate Tools:** `[code_review, security_review]`.

---

## User Story
**Como** usuário que gera e imprime o relatório de brindes,
**eu quero** que os campos de texto interpolados no HTML do relatório sejam escapados,
**para que** um valor hostil gravado por outro usuário da mesma organização (nome, cargo,
observação, endereço, nome do brinde, nome da data comemorativa) não vire um `<script>` executado
na origem da aplicação quando eu abro a janela de impressão.

---

## O achado (SEC-001, MEDIUM, gate da Story 75-372)

`buildPrintHtml`, em
`packages/web/src/app/dashboard/brindes/_components/print-modal.tsx`, interpola campos de texto
crus dentro de um template literal que vira HTML de verdade: o resultado vai para
`window.open("", "_blank")` (`:202`) + `win.document.write(html)` (`:204`). Uma janela
`about:blank` aberta por script **herda a origem do opener** — um `<script>` injetado ali executa
**na origem da aplicação**, não num contexto neutro. Não há `httpOnly` em nenhum ponto de
`packages/web/src` (é o default do Supabase SSR — medido: 0 ocorrências), então o cookie
`sb-*-auth-token` é legível por JS. **Consequência concreta: roubo da sessão de quem imprime o
relatório.**

**Pré-condições que limitam a severidade** (por isso é dívida aceita, não bloqueio): exige usuário
**autenticado da mesma org**, com **permissão de escrita em brindes**, para gravar o payload num
dos campos abaixo. **Não há caminho anônimo nem externo.**

Leia a íntegra do achado antes de implementar — não reinvestigar, só aplicar:
- `docs/stories/75-372-brindes-tamanho-relatorio-impresso.story.md`, seção **"Dívida técnica
  anotada — SEC-001"** (Dev Agent Record) — a versão final, reescrita como follow-up do gate, com
  o alcance real medido.
- Mesmo arquivo, seção **"QA Results" → "Achados" → "SEC-001"** — o parecer do @qa sobre por que a
  alternativa (escapar) não estava fora de alcance.

### Alcance medido — são 9 sítios, não 6 (nem 8)

Numeração de linha contra `packages/web/src/app/dashboard/brindes/_components/print-modal.tsx` no
estado atual (pós-merge da 75-372 na branch-base desta story):

**Os 6 campos da linha da tabela**, dentro de `buildPrintHtml` → `rows = records.map(...)`:

| # | Linha | Expressão | Origem do dado |
|---|---|---|---|
| 1 | `:65` | `d.observacao` (dentro de `<span class="obs">`) | `brindes_destinatarios.observacao`, texto livre |
| 2 | `:67` | `d.cargo` (dentro de `<span class="cargo">`) | `brindes_destinatarios.cargo`, texto livre |
| 3 | `:72` | `d.obra_nome` | `brindes_destinatarios.obra_nome`, texto livre |
| 4 | `:74` | `d.nome` | `brindes_destinatarios.nome`, texto livre |
| 5 | `:75` | `buildEndereco(d)` | monta a partir de 6 campos de endereço, todos texto livre |
| 6 | `:76` | `buildBrinde(d)` | `t.nome`/`t.tamanho` do embed `brindes_tipos`, gravável por outro usuário (cadastro de tipos de brinde) |

**Um sítio a mais, mesma severidade dos 6 — `${titulo}`:**

| # | Linhas | Expressão | Origem do dado |
|---|---|---|---|
| 7 | `:57` (define) / `:96` e `:130` (usa, **duas vezes**) | `titulo` (via `dataNome` = `selectedData?.nome`) | `datas_comemorativas.nome`, gravável por outro usuário da org |

`${titulo}` aparece em **dois contextos de escape**: dentro de `<title>${titulo}</title>` (`:96`)
e dentro de `<h1>${titulo}</h1>` (`:130`). São o mesmo valor, duas interpolações — escapar a
variável **antes** de qualquer uma das duas interpolações (uma vez só, na origem) cobre as duas,
mas confirme que a régua de teste (AC6) exercita **ambos** os sítios de uso, não só a definição.
`<title>` é um elemento "escapable raw text" em HTML — a única sequência que quebra o parsing
antecipadamente é `</title`; escapar `<` (padrão em qualquer `escapeHtml`) já neutraliza isso, não
precisa de uma segunda função de escape para esse contexto. Registre essa verificação no
Completion Notes.

**Um oitavo sítio — rótulos de filtro** (o draft o chamava de "severidade menor"; ver correção abaixo):

| # | Linha | Expressão | Origem do dado |
|---|---|---|---|
| 8 | `:82` | `activeFilters.join(" | ")`, via `describeFilters()` (`:165-174`) | **mista** — ver a correção abaixo |

⚠️ **CORREÇÃO DO @PO (medida em `brindes-filter-bar.tsx` e `brindes/page.tsx`, 2026-09-04).** O
draft classificava o sítio 8 como self-XSS puro, com a justificativa "`filters.obra_nome`,
`filters.nome`, `filters.cidade` são texto livre; `filters.tipo`/`filters.estado`/`filters.tamanho`
vêm de `<select>`, sem risco". **Duas metades dessa frase estão trocadas:**

| Campo do filtro | O que é de verdade | Vetor |
|---|---|---|
| `filters.obra_nome` | **`<select>`** (`brindes-filter-bar.tsx:62-71`), opções = `obraOptions` = `uniqueObras` = valores distintos de `brindes_destinatarios.obra_nome` do banco (`brindes/page.tsx:35`) | **Cruzado** — dado de OUTRO usuário da org, mesmo vetor do `buildBrinde`. Não é texto digitado por quem imprime. |
| `filters.tamanho` | `<select>`, mas as opções vêm de `buildTamanhoOptions(tipos)` = valores distintos de `brindes_tipos.tamanho`, **texto livre do catálogo** | **Cruzado** — "vem de `<select>`" não é o mesmo que "é seguro": o `<select>` só reflete o que o catálogo tem. |
| `filters.nome`, `filters.cidade` | `<input type="text">` (`:88-98`, `:101-111`) | Self-XSS (o operador digita e o operador sofre). |
| `filters.tipo`, `filters.estado` | `<select>` com literais fixos / `UF_OPTIONS` | Seguro por construção. |

**Consequência para a prioridade da AC4:** o sítio 8 **não** é de severidade menor. Duas das seis
labels carregam dado gravável por outro usuário da org — mesma severidade dos sítios 1–7. A
correção continua sendo a mesma (escapar o texto que entra no HTML), mas o **motivo** muda, e com
ele o risco de alguém no gate aceitar deixar a AC4 para depois "porque é só self-XSS". Não é.

**O 9º sítio — `${resumo}` (`:88`). CONFIRMADO, não "a conferir".**

O draft deixou isto como uma dúvida na Dev Notes ("não foi lido nesta story… confirmar ao
implementar"). O @po leu e mediu: **é um sítio de verdade, mesmo vetor do `buildBrinde`.**

| # | Linha | Expressão | Origem do dado |
|---|---|---|---|
| 9 | `:87` (define) / `:88` (interpola em `<p class="resumo">Resumo: ${resumo}</p>`) | `resumo` = `formatResumoBrindes(records)` | `brinde-tamanho.ts:83-87` → `buildResumoBrindes` → o `label` é montado em **`brinde-tamanho.ts:69`** como `` `${t.nome} ${t.tamanho}` ``, ou seja `brindes_tipos.nome` e `brindes_tipos.tamanho` — catálogo, gravável por qualquer usuário da org com escrita em brindes |

Cadeia completa, sem elo presumido: `print-modal.tsx:87` → `formatResumoBrindes(records)` →
`buildResumoBrindes(records)` (`brinde-tamanho.ts:60-81`), cujo `label` sai de `:69`:

```ts
const label = t.tamanho ? `${t.nome} ${t.tamanho}` : t.nome   // brinde-tamanho.ts:69
// e depois, em formatResumoBrindes (:83-87):
return buildResumoBrindes(records).map((e) => `${e.label}: ${e.count}`).join(" | ")
```

→ volta como string e
entra cru no HTML em `:88`. **É literalmente o mesmo par de colunas que o `buildBrinde` usa.**
Onde o escape entra está decidido no **AC9** — e a decisão é: no consumidor, não no módulo puro.

**Verificado e EXCLUÍDO do escopo (não é um 10º sítio):** `TIPO_LABEL[d.tipo] ?? d.tipo` (`:73`)
tem um fallback para o valor cru de `d.tipo` se ele não bater com nenhuma chave do dicionário. Não
é um vetor de verdade: `brindes_destinatarios.tipo` tem `CHECK (tipo IN ('mae', 'pai', 'outro'))`
no banco (`supabase/migrations/031_controle_brindes.sql:36`) e o mesmo union type em
`types.ts:12`. O ramo `?? d.tipo` é código defensivo mais-nunca-alcançado, mesma classe do achado
TEST-001 já registrado no gate da 75-372 (`!t.nome` morto por `NOT NULL`). **Não escale este
ramo** — é ruído, e escapar um valor que nunca chega lá não muda a superfície de ataque real.

> **@po concorda com a exclusão, com verificação própria.** O `CHECK (tipo IN ('mae', 'pai',
> 'outro'))` está na `031_controle_brindes.sql:36` e **nenhuma das 6 migrations posteriores que
> tocam `brindes_destinatarios`** (040, 042, 166, 196, 229, 230) faz `DROP CONSTRAINT` nem
> `ALTER … tipo`. O único `DROP CONSTRAINT` da família é na `165`, sobre `brindes_tipos_org_id_nome_key`
> — outra tabela, outra coluna. O ramo é morto de fato, e continua morto. A AC6 o declara
> "seguro por natureza" **com o motivo escrito ao lado**, que é o tratamento certo: registrar o
> perdão e a razão, não fingir que o `??` não existe.

### Medições já feitas (não repetir, mas confirme se a implementação depender delas)

Medido em `packages/web/src` em 2026-09-04:
- `escapeHtml` → **0** ocorrências. O helper não existe na app hoje.
- `document.write(` → **1** arquivo (`print-modal.tsx`, único da aplicação).
- `window.open(` → **7** ocorrências totais, em 4 arquivos
  (`print-modal.tsx`, `obras/[obra_id]/_components/aprovacoes-tab.tsx`,
  `obras/[obra_id]/_components/obra-detail-tabs.tsx`,
  `lancamentos/_components/lancamento-card-modal.tsx`). Das 7, **1** é a de `print-modal.tsx` com
  URL vazia (`window.open("", "_blank", ...)`, `:202`) — as outras 6 recebem uma URL real (não
  escrevem HTML por `document.write`, então estão fora do escopo desta story).
- `httpOnly` → **0** ocorrências em `packages/web/src` (cookie de sessão do Supabase SSR é
  legível por JS — é o que dá gravidade ao achado, mas mudar isso é decisão de infra, fora desta
  story).

---

## Acceptance Criteria

> **Nota do @po sobre "decisão do @dev".** O draft desta story deixava **seis** decisões de
> desenho em aberto ("decisão do @dev, desde que documentada") — nome do helper, onde ele mora,
> escapar dentro ou no call site, exportar ou extrair, e qual das duas abordagens de régua. AC com
> decisão em aberto não é AC testável: o gate não tem contra o que medir, e a story pode fechar
> "verde" com a metade mais fácil de cada escolha. **Todas foram decididas pelo @po e estão
> cravadas abaixo, com o motivo.** Divergir de qualquer uma exige voltar ao @po, não uma nota no
> Completion Notes.

**AC1 — Helper de escape existe, com nome e casa CRAVADOS.**
Uma função **`escapeHtml(value: string): string`** (este nome, não outro) escapa os 5 caracteres
clássicos: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`, `'` → `&#39;`, **nesta
ordem** (o `&` primeiro, senão o escape se come a si mesmo e `<` vira `&amp;lt;`).

**Casa cravada: local a `print-modal.tsx`**, no topo do arquivo, `export`ada (o `export` é
exigido pelo teste unitário da Task 2). **Não** promover para `packages/web/src/lib/`. Motivo
medido: `document.write(` existe em **1** arquivo de toda a app e `escapeHtml` em **0** — um util
compartilhado com um único consumidor é abstração sem segundo caso, e o custo de mover depois
(quando houver o segundo) é um `git mv`. O `escapeHtml` **também** aceita `null`/`undefined`
devolvendo `""`? **Não** — a assinatura é `(value: string): string` e os call sites já guardam
nulos hoje (`d.observacao ? … : ""`, `d.cargo ? … : ""`, `buildEndereco` devolve `"—"`); aceitar
nulo silenciosamente esconderia um campo novo não-guardado. Onde o valor pode ser `undefined`
(`dataNome`), o guard já existe no ternário do `titulo`.

**AC2 — Os 6 campos da linha são escapados, NO PONTO DE INTERPOLAÇÃO.**
`d.observacao` (`:65`), `d.cargo` (`:67`), `d.obra_nome` (`:72`), `d.nome` (`:74`),
`buildEndereco(d)` (`:75`) e `buildBrinde(d)` (`:76`) passam pelo `escapeHtml` antes de entrar no
template literal.

**Regra única, cravada: o escape acontece no `${…}`, nunca dentro da função que monta a string.**
Ou seja `${escapeHtml(buildEndereco(d))}` e `${escapeHtml(buildBrinde(d))}` — `buildEndereco` e
`buildBrinde` **continuam sem saber que HTML existe** e permanecem byte a byte como estão. Três
motivos:
1. **Uma regra só é auditável; duas não.** Com "às vezes dentro, às vezes fora", ninguém — nem a
   régua da AC6 — sabe onde olhar. Com a regra única, "todo `${}` de dado é `${escapeHtml(…)}`" é
   uma afirmação verificável por varredura.
2. **Escape é responsabilidade do contexto de saída, não da origem do dado.** `buildBrinde` monta
   `"Camiseta · G"` — um texto. Quem sabe que aquele texto vai virar HTML é o template.
3. **Escapar na origem produz duplo-escape assim que a função ganhar um segundo consumidor** (um
   `<td>` React, um CSV, um `title=`), e duplo-escape é bug visível ao usuário (`&amp;` na tela)
   que nenhum teste de injeção pega.

**AC3 — `${titulo}` é escapado na ORIGEM, cobrindo os dois usos.**
Cravado: o escape entra em `:57`, dentro do ternário, sobre o **único dado** que a expressão tem —
`${escapeHtml(dataNome)}`:

```ts
const titulo = dataNome
  ? `Controle de Brindes — ${escapeHtml(dataNome)}`
  : "Controle de Brindes — Lista de Destinatários"
```

Assim `<title>${titulo}</title>` (`:96`) e `<h1>${titulo}</h1>` (`:130`) recebem a versão escapada
sem repetição, e `${titulo}` entra na lista de "seguros declarados" da AC6 **com o motivo
`escapado na origem em :57`**. Escapar nos dois call sites em vez da origem é **proibido**: duas
verdades para manter, e o próximo uso de `titulo` nasce cru.

⚠️ **Não** aplicar `escapeHtml` sobre a `titulo` já montada (`escapeHtml(titulo)` em `:96`/`:130`):
isso escaparia o travessão e, pior, produziria duplo-escape do `dataNome` se o AC3 for cumprido na
origem. Uma vez, no dado, na origem.

O teste (AC5) exercita os **dois** sítios de uso — asserção separada para o `<title>` e para o
`<h1>` — não só "a variável foi transformada".

**AC4 — Rótulos de filtro são escapados, no ponto de interpolação.**
Cravado, pela mesma regra única do AC2: `${escapeHtml(activeFilters.join(" | "))}` em `:82`.
`describeFilters()` (`:165-174`) **não** muda — ela devolve texto, e continua devolvendo texto.
Escapar o texto final concatenado é seguro porque os separadores (`" | "`, `": "`) e os prefixos
(`"Obra: "`, `"Tamanho: "`) são literais fixos sem nenhum caractere que o escape altere.

Lembrete de severidade (ver a correção do @po acima): `filters.obra_nome` e `filters.tamanho` são
`<select>`s alimentados por dado do BANCO/catálogo — vetor **cruzado**, não self-XSS. Esta AC tem
a mesma prioridade das AC2/AC3 e **não pode ser adiada** como "risco menor".

**AC5 — Teste de injeção que reprova de verdade, nos 9 sítios.**
Um teste **parametrizado por sítio** (um caso por sítio, não um único registro com todos os campos
hostis de uma vez — com todos juntos, um sítio esquecido continua verde porque outro sítio já
falhou a asserção) que injeta `<script>alert(1)</script>` em cada um dos **9** sítios das AC2, AC3,
AC4 e AC9 e afirma que o HTML resultado de `buildPrintHtml` **não contém a tag crua** — a asserção certa é `not.toContain("<script>")` (ou
`toContain` da forma escapada, `&lt;script&gt;`), nunca um teste que só verifica "a função
`escapeHtml` foi importada" ou "o texto mudou". A regra do repositório é exit code: um teste capaz
de passar mesmo com um sítio esquecido é falso verde e não cumpre esta AC.

**Testabilidade — cravado: `export` no lugar, SEM extrair para módulo novo.**
`buildPrintHtml`, `buildEndereco` e `buildBrinde` recebem a palavra `export` onde já estão, dentro
de `print-modal.tsx`. **Não** extrair para um `print-html.ts` companheiro. O draft deixava a
escolha ao @dev; o @po decide por `export` in place, por dois motivos, um deles medido:

1. **Risco de rebase, medido.** `gh pr view 570` em 2026-09-04: `state: OPEN`,
   `reviewDecision: **CHANGES_REQUESTED**`, `baseRefName: main`, 3 commits. O #570 **vai** receber
   mais commits, e em `print-modal.tsx` — é o arquivo central dele. Mover ~110 linhas para fora
   desse arquivo numa branch empilhada transforma qualquer commit de revisão do #570 num conflito
   manual; acrescentar 3 palavras `export` não conflita com quase nada.
2. **Precedente MEDIDO de que funciona.** O @po escreveu um teste-sonda temporário importando
   `print-modal.tsx` (que tem `"use client"`, `useState` de `react` e ícones de `lucide-react`)
   dentro do Vitest deste repositório, pelo alias `@web`, em ambiente node:
   `Test Files 1 passed (1) / Tests 1 passed (1)`, exit 0, `transform 138ms / import 327ms`. A
   sonda foi removida. Ou seja: `"use client"` de fato não impede o import — e isso agora é
   **medição**, não inferência. Precedente já no repo, com import de runtime (não `import type`):
   `packages/web/src/components/conversas/message-media.test.ts` → `message-media.tsx` (Story
   75-85). *Cuidado:* `conversation-thread-merge.test.ts` → `broker-message-input.tsx` **não**
   serve de precedente — lá é `import type`, apagado na compilação.

O teste mora em `packages/web/src/app/dashboard/brindes/_components/print-modal.test.ts` e importa
de `./print-modal`. Nada de `jsdom`: nenhuma das três funções toca DOM.

**AC6 — Régua de alcance: pega sítio novo, não só os 9 de hoje.**

**Cravado: a abordagem é a lista declarada + varredura de código-fonte (a da AC10).** A segunda
opção do draft — "teste de injeção parametrizado por campo, e a AC6 fica satisfeita por disciplina
de revisão futura" — está **descartada**, e o "discutir com o @po antes de fechar" fica sem efeito:
o @po já decidiu, agora. Motivo: aquela opção não cumpre o objetivo declarado da própria AC
("quem adicionar uma 9ª coluna daqui a três meses deve ver o teste vermelho"). Um teste por campo
existente nunca fica vermelho por causa de um campo que ainda não existe — ele é a AC5, não a AC6.
Contar a AC5 duas vezes e chamar a segunda de "régua de alcance" é exatamente a armadilha que o
cabeçalho da AC10 descreve: "régua que prende presença mas não alcance".

**O desenho, já medido e prototipado pelo @po** (não é hipótese — o script rodou):

1. **Recorte, fail-closed.** Ler o texto-fonte do arquivo que hospeda `buildPrintHtml` e recortar
   de `"function buildPrintHtml"` até o `"</html>`"` que fecha o `return`. Recorte que não achar
   as duas pontas devolve `""` — e `""` tem **zero** interpolações, o que aprovaria tudo. Daí o
   item 4.
2. **Extração das interpolações com balanceamento de chaves**, não regex ingênua: `${i % 2 === 0 ?
   "par" : "impar"}` e `${TIPO_LABEL[d.tipo] ?? d.tipo}` têm chaves e ternários dentro. Uma regex
   `\$\{[^}]*\}` corta a primeira `}` e produz expressões truncadas — falso verde silencioso.
   Um contador de profundidade de `{`/`}` resolve em ~15 linhas.
3. **`.toEqual` sobre o conjunto ordenado**, nunca `.has`, `.some`, `.includes` nem `toContain`:
   `expect(expressõesNãoCobertas).toEqual([])`, onde "coberta" = está em `SEGURAS_DECLARADAS`
   **ou** o texto da expressão começa com `escapeHtml(`. Uma interpolação nova que não seja
   nenhuma das duas coisas aparece na lista e o teste fica vermelho **nomeando a expressão**.
4. **Sinal de vida obrigatório** (o análogo do `expect(arquivos.length).toBeGreaterThan(100)` da
   AC10): `expect(total).toBeGreaterThanOrEqual(25)` e
   `expect(únicas.length).toBeGreaterThanOrEqual(23)`. **Medido hoje pelo @po: 25 interpolações,
   23 expressões únicas.** Sem essa asserção, um recorte que erra a ponta devolve 0 e a régua
   aprova qualquer coisa — é a cegueira nº 3 do `trechoDelimitado` do `fonte-scan.ts`, que devolve
   `""` de propósito porque lá `""` reprova um `toContain`; **aqui `""` aprovaria**, e por isso o
   sinal de vida não é opcional.
5. **O perdão é da EXPRESSÃO, nunca da variável.** `${cargo}` pode ser declarado seguro (é um
   fragmento de HTML já montado), mas `${d.cargo}` — que vive **dentro** da construção daquele
   fragmento, na linha `:67`, e portanto **dentro do recorte** — é medido separadamente e tem que
   carregar `escapeHtml(`. É a cegueira nº 3 do cabeçalho da AC10 ("o nome do arquivo perdoando o
   sítio que mora nele") traduzida para dentro de uma função. Se alguém tirar o `escapeHtml` de
   `:67` amanhã, `${d.cargo}` reaparece na lista de não-cobertas e o teste fica vermelho — mesmo
   com `${cargo}` declarado seguro.
6. **Reaproveitar `linhasDeCodigo()` de `@web/lib/tenancy/fonte-scan`** antes de extrair, para que
   um `${…}` citado em comentário dentro de `buildPrintHtml` não conte. Hoje não há nenhum; é
   seguro de graça e mantém a régua alinhada com a AC10. **Atenção medida:** `linhasDeCodigo`
   descarta linha que começa com `*`, e o CSS do relatório tem `* { box-sizing: … }` — a linha
   some, o que é inofensivo (não tem `${`), mas não estranhe a diferença de contagem de linhas.

**Inventário completo, medido pelo @po (25 interpolações, 23 expressões únicas). A soma fecha:
9 + 14 = 23.**

*As 9 que PRECISAM de `escapeHtml(` — e são exatamente os 9 sítios das AC2/AC3/AC4/AC9:*

| Expressão | Linha | AC |
|---|---|---|
| `${dataNome}` | `:57` | AC3 |
| `${d.observacao}` | `:65` | AC2 |
| `${d.cargo}` | `:67` | AC2 |
| `${d.obra_nome}` | `:72` | AC2 |
| `${d.nome}` | `:74` | AC2 |
| `${buildEndereco(d)}` | `:75` | AC2 |
| `${buildBrinde(d)}` | `:76` | AC2 |
| `${activeFilters.join(" | ")}` | `:82` | AC4 |
| `${resumo}` | `:88` | AC9 |

*As 14 `SEGURAS_DECLARADAS`, cada uma com o motivo ao lado no código (o motivo escrito é o que dá
valor à lista — sem ele é um mapa de nomes, e a AC10 já provou que mapa de nomes cega):*

| Expressão | Por que é segura |
|---|---|
| `${titulo}` | escapada na origem, em `:57` (AC3) |
| `${cargo}` | fragmento de HTML já montado; o dado cru dentro dele (`${d.cargo}`) é medido à parte |
| `${observacao}` | idem, `${d.observacao}` medido à parte |
| `${rows}` | fragmento montado pelo `map`; cada dado dentro dele é medido à parte |
| `${statusCell}` | fragmento montado só de `STATUS_LABEL` + literais |
| `${filtrosInfo}` | fragmento; o dado dentro (`activeFilters.join`) é medido à parte |
| `${resumoInfo}` | fragmento; o dado dentro (`resumo`) é medido à parte |
| `${TIPO_LABEL[d.tipo] ?? d.tipo}` | dicionário fechado; o `??` é ramo morto por `CHECK (tipo IN ('mae','pai','outro'))` (`031:36`), confirmado intacto pelo @po nas 6 migrations posteriores |
| `${entrega ? STATUS_LABEL[entrega.status] : "Pendente"}` | dicionário fechado + literal |
| `${statusHeader}` | um de dois literais fixos |
| `${hoje}` | `new Date().toLocaleDateString("pt-BR", …)` |
| `${records.length}` | número |
| `${i + 1}` | número |
| `${i % 2 === 0 ? "par" : "impar"}` | dois literais fixos |

**Mutação de controle (obrigatória, não opcional).** Antes de commitar: remover o `escapeHtml` de
**um** sítio qualquer e confirmar que a régua da AC6 fica **vermelha nomeando aquela expressão**;
e, separadamente, sabotar o recorte do item 1 (trocar a ponta por um texto que não existe) e
confirmar que o sinal de vida do item 4 fica **vermelho**. Registrar os dois exit codes no
Completion Notes. Uma régua de alcance que nunca foi vista reprovando é uma régua não medida.

**AC7 — Nenhuma regressão funcional da Story 75-372.**
Para dados sem caracteres especiais (o caso comum), o HTML gerado é **visualmente idêntico** ao
de antes desta story — mesmas colunas, mesmo resumo, mesmos filtros, mesma ordem de brinde por
cadastro (não por entrega). Os testes já existentes de `brinde-tamanho.test.ts` e
`destinatarios/route.test.ts` continuam passando sem alteração.

**AC8 — Branch e PR corretos.**
A branch desta story parte de `story/75-372-brindes-tamanho-relatorio` (checkout local a partir
dela, não de `main`), e o PR — quando o @devops abrir — é empilhado sobre o **#570**. Se o #570 já
tiver sido mergeado em `main` no momento da implementação, a branch-base passa a ser `main`
diretamente e esta seção fica sem efeito — confirmar o estado do #570 antes de abrir a branch
(`gh pr view 570 --json state`).

**Estado medido pelo @po em 2026-09-04:** `state: OPEN`, `reviewDecision: CHANGES_REQUESTED`,
`baseRefName: main`, `headRefName: story/75-372-brindes-tamanho-relatorio`, `mergeable: MERGEABLE`,
3 commits. **Traduzindo: o #570 ainda vai receber commits, e neles `print-modal.tsx`.** Por isso o
AC5 crava `export` in place em vez de extração, e por isso o @dev deve rebasear a branch desta
story sobre a base **imediatamente antes** de abrir o PR, não só ao criá-la.

**AC9 — O 9º sítio (`${resumo}`) é escapado NO CONSUMIDOR; `brinde-tamanho.ts` não é tocado.**
`${resumo}` (`:88`) passa a ser `${escapeHtml(resumo)}` em `print-modal.tsx`.
**`packages/web/src/app/dashboard/brindes/_components/brinde-tamanho.ts` permanece byte a byte como
está** — `buildResumoBrindes`, `formatResumoBrindes` e `buildTamanhoOptions` seguem sem qualquer
noção de HTML. Escapar dentro do módulo puro é **proibido**, por três motivos, o terceiro medido:

1. **Contaminaria os 10 testes que já existem** em `brinde-tamanho.test.ts`, que comparam texto
   limpo (`expect(formatResumoBrindes(records)).toBe("…")`, `toEqual({label: "Sem brinde definido",
   …})`). A AC7 desta story exige que eles passem **sem alteração** — as duas coisas não cabem
   juntas, e reescrever teste alheio para acomodar um escape é o caminho errado da bifurcação.
2. **O módulo tem contrato documentado de "valor preservado exatamente como cadastrado"**, e o
   motivo está escrito no próprio JSDoc de `buildTamanhoOptions`: *"O valor é preservado exatamente
   como está cadastrado (sem trim) porque o filtro da API compara por igualdade exata —
   normalizar aqui faria a opção deixar de casar com a linha do banco."* Escape é normalização.
3. **Medido: o módulo tem consumidor React.** `brindes-table.tsx:14,54` importa
   `buildTamanhoOptions` e usa o resultado como `value` de `<option>` (`brindes-filter-bar.tsx:127-134`),
   que depois vai para `params.set("tamanho", …)` na query da API (`print-modal.tsx:186`). Um
   `escapeHtml` dentro do módulo transformaria um tamanho com `&` em `&amp;` e **quebraria o filtro
   por igualdade exata contra o banco** — um defeito funcional silencioso, causado por uma correção
   de segurança. `buildResumoBrindes` (o irmão exportado, que devolve entradas estruturadas) tem o
   mesmo destino no dia em que alguém renderizar o resumo em JSX: veria `&amp;` na tela.

Regra geral que fica registrada: **escape de HTML mora na fronteira de saída HTML.** Módulo puro de
domínio não escapa nada.

---

## Riscos

| # | Risco | Probabilidade | Mitigação (já embutida em AC) |
|---|---|---|---|
| R1 | AC6 ser "cumprida" com um teste de injeção por campo, que não pega sítio novo — a própria segunda opção que o draft oferecia | **Alta** se a escolha ficar aberta | **AC6** crava a abordagem de varredura e descarta explicitamente a outra; a mutação de controle obrigatória prova a régua reprovando |
| R2 | A régua da AC6 nascer vazia (recorte errado ⇒ 0 interpolações ⇒ verde contra tudo) | Média — é o modo de falha natural de recorte de texto | **AC6 item 4**: sinal de vida `>= 25` / `>= 23`, medido; + a segunda mutação de controle (sabotar o recorte) |
| R3 | Conflito de rebase com o #570, que está `CHANGES_REQUESTED` e vai receber mais commits no MESMO arquivo | **Alta** | **AC5** troca extração por `export` in place (diff mínimo); **AC8** manda rebasear imediatamente antes de abrir o PR |
| R4 | Duplo-escape visível ao usuário (`&amp;` na tela, `Alfa &amp; Beta` numa obra) por escapar na origem **e** no call site | Média — dois ACs falam de `titulo` | **AC2/AC3/AC4/AC9** cravam a regra única "escapa no `${}`"; **AC7** exige HTML visualmente idêntico para dado sem caractere especial, e `&` em nome de obra é caso comum o suficiente para virar caso de teste |
| R5 | @dev escapar dentro de `brinde-tamanho.ts` (é o caminho mais curto para o 9º sítio) e quebrar o filtro por igualdade exata do tamanho | Média | **AC9**, com o motivo medido e o "byte a byte" explícito |
| R6 | O gate aceitar a AC4 como "só self-XSS, fica para depois" | Média — o draft dizia isso | Correção do @po na seção de alcance + lembrete dentro da própria AC4 |
| R7 | O relatório impresso ficar com a saída correta e o `escapeHtml` não escapar `&` primeiro, gerando `&amp;lt;` | Baixa | **AC1** crava a ordem (`&` primeiro) e o teste unitário da Task 2 cobre |

---

## Tasks / Subtasks

- [x] Task 1 — Preparar a branch (AC: 8)
  - [x] Confirmar estado do PR #570 (`gh pr view 570 --json state`).
  - [x] Checkout a partir de `story/75-372-brindes-tamanho-relatorio` (ou `main`, se #570 já
    tiver mergeado).
- [x] Task 2 — Helper de escape (AC: 1)
  - [x] Criar `export function escapeHtml(value: string): string` **local a `print-modal.tsx`**
    (casa cravada no AC1 — não criar util compartilhado).
  - [x] Teste unitário do helper isolado: `&`, `<`, `>`, `"`, `'`, string vazia, string sem
    caracteres especiais (idempotência visual), e **`&` antes dos outros** (entrada `<a & b>` tem
    que sair `&lt;a &amp; b&gt;`, nunca `&amp;lt;a &amp; b&amp;gt;`).
- [x] Task 3 — Aplicar aos 6 campos de linha (AC: 2)
- [x] Task 4 — Aplicar a `titulo` nos dois usos (AC: 3)
- [x] Task 5 — Aplicar aos rótulos de filtro (AC: 4)
- [x] Task 5b — Aplicar ao 9º sítio, `${resumo}` (AC: 9)
  - [x] `${escapeHtml(resumo)}` em `print-modal.tsx:88`.
  - [x] Confirmar por `git diff` que `brinde-tamanho.ts` **não** aparece no diff.
- [x] Task 6 — Exportar para testabilidade (AC: 5)
  - [x] Acrescentar `export` a `buildPrintHtml`, `buildEndereco` e `buildBrinde` **onde estão**,
    em `print-modal.tsx`. **Não extrair para módulo novo** (decisão cravada no AC5 — risco de
    rebase com o #570, que está `CHANGES_REQUESTED`).
- [x] Task 7 — Teste de injeção, parametrizado por sítio, 9 casos (AC: 5)
- [x] Task 8 — Régua de alcance: lista declarada + varredura (AC: 6)
  - [x] Recorte fail-closed + extração com balanceamento de chaves + `.toEqual([])` sobre as
    não-cobertas + sinal de vida (`>= 25` interpolações, `>= 23` únicas).
  - [x] `SEGURAS_DECLARADAS` com as 14 expressões e **o motivo escrito ao lado de cada uma**.
  - [x] **Mutação de controle dupla:** (a) tirar o `escapeHtml` de um sítio ⇒ régua vermelha
    nomeando a expressão; (b) sabotar o recorte ⇒ sinal de vida vermelho. Registrar os dois.
- [x] Task 9 — Confirmar paridade funcional (AC: 7)
  - [x] Rodar `brinde-tamanho.test.ts` (10 testes) e `destinatarios/route.test.ts` sem alteração e
    verdes. **Se algum deles precisar ser editado, a implementação divergiu do AC9 — pare.**
  - [x] Caso de duplo-escape: um registro com `&` no nome da obra (`Alfa & Beta`) sai como
    `Alfa &amp; Beta` no HTML (que o navegador renderiza `Alfa & Beta`), **nunca** `Alfa &amp;amp; Beta`.
- [x] Task 10 — `type-check`, `lint`, `test` completos, exit code conferido (não `grep -c`).

---

## Dev Notes

### Arquivo único, código completo já lido
`packages/web/src/app/dashboard/brindes/_components/print-modal.tsx` (300 linhas no estado desta
story). As funções relevantes:
- `buildEndereco(d: Destinatario): string` — `:20-32`.
- `buildBrinde(d: Destinatario): string` — `:43-47`, comentário de proveniência da Story 75-372
  logo acima (`:34-42`) explicando por que a fonte é sempre o cadastro, nunca a entrega.
- `buildPrintHtml(...)` — `:49-155`, monta `rows` (`:59-79`), `filtrosInfo`/`resumoInfo`
  (`:81-88`) e o documento completo (`:92-154`).
- `describeFilters()` — `:165-174`, dentro do componente `PrintModal`.
- `handleGenerate()` — `:178-211`, onde `window.open`/`document.write` acontecem (`:202-205`).

### Todas as interpolações `${...}` dentro de `buildPrintHtml` (levantamento completo, para a AC6)
```
titulo         (definição, :57 — dataNome de datas_comemorativas.nome)
entrega/STATUS_LABEL  (:62 — dicionário fechado, seguro)
i % 2 / i + 1  (:70, :71 — numérico, seguro)
d.obra_nome    (:72 — PRECISA escapar)
TIPO_LABEL[d.tipo] ?? d.tipo  (:73 — verificado seguro, CHECK constraint no banco; não escalar)
d.nome / cargo / observacao  (:74 — d.nome PRECISA escapar; cargo/observacao já vêm com HTML
                               próprio construído em :65/:67, que também PRECISAM escapar o dado
                               bruto antes de montar a `<span>`)
buildEndereco(d)  (:75 — PRECISA escapar)
buildBrinde(d)    (:76 — PRECISA escapar)
statusCell     (:77 — já é HTML montado a partir de STATUS_LABEL/literal fixo, seguro)
activeFilters.join(" | ")  (:82 — PRECISA escapar)
resumo         (:87-88 — formatResumoBrindes(records), agregado numérico/rótulos fixos de
                tamanho vindos do catálogo — confirmar se `t.tamanho` do catálogo entra aqui
                sem escapar; se entrar, é o mesmo vetor de buildBrinde e precisa do mesmo
                tratamento)
titulo (uso)   (:96, :130 — PRECISA que a origem em :57 já esteja escapada)
hoje / records.length / statusHeader  (:131, :144 — seguro: Date formatada, número, dicionário
                               fechado)
```
**RESOLVIDO pelo @po — o `resumo` É um sítio.** O draft deixava isto como "não foi lido nesta
story… confirmar ao implementar". Foi lido e medido: `formatResumoBrindes` → `buildResumoBrindes`
→ `label` em `brinde-tamanho.ts:69` = `brindes_tipos.nome` + `.tamanho`, mesmo vetor do
`buildBrinde`. É o **9º sítio**, tem AC própria (**AC9**), e o escape entra no **consumidor**
(`print-modal.tsx:88`), não no módulo puro. Nada a "confirmar ao implementar" aqui.

**O inventário de interpolações desta seção foi remedido pelo @po:** 25 interpolações, 23
expressões únicas, 9 que precisam de escape + 14 seguras declaradas. A tabela completa, com o
motivo de cada uma das 14, está no **AC6** — é ela que vale para a implementação.

### Testing
- Vitest, ambiente **node** (nenhuma das funções toca DOM; não pedir `jsdom`).
- Local do teste, cravado: `packages/web/src/app/dashboard/brindes/_components/print-modal.test.ts`,
  importando de `./print-modal`. **Não** há módulo extraído — ver AC5.
- `"use client"` no topo do arquivo-fonte **não** impede importar as funções puras: **medido** pelo
  @po com teste-sonda temporário (`1 passed`, exit 0, `import 327ms`), e há precedente de runtime
  no repo (`components/conversas/message-media.test.ts` → `message-media.tsx`, Story 75-85).
  O precedente de `broker-message-input.tsx` **não** vale — lá é `import type`, apagado na
  compilação.
- O `include` do `vitest.config.ts` da raiz casa `packages/web/src/**/*.test.ts` — o arquivo novo
  entra na suíte sem mexer em config.
- Testes existentes que precisam continuar verdes, sem alteração:
  `packages/web/src/app/dashboard/brindes/_components/brinde-tamanho.test.ts` e
  `packages/web/src/app/api/brindes/destinatarios/route.test.ts`.

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> A chave `coderabbit_integration.enabled` não existe em `.aios-core/core-config.yaml` (conferido
> nesta sessão). Quality validation via revisão manual apenas. O review automático real deste
> repositório é o GitHub App do CodeRabbit (`.coderabbit.yaml`), independente desta seção. Nota
> herdada da 75-372: quando o CLI local for usado, achado de bot não bloqueia merge neste
> repositório salvo defeito vital verificado no código.

---

## Change Log

| Data | Autor | Mudança |
|---|---|---|
| 2026-09-04 | Dex (@dev) | **Implementada — Status Ready → Ready for Review.** Branch `story/75-373-escapar-html-relatorio-brindes` a partir de `origin/main` em `3b809946` (o PR #570 mergeou como squash `3b809946` junto com `66b083f5` da 900-68, então valeu a base alternativa que a AC8 já previa — sem empilhamento). `escapeHtml` criado local a `print-modal.tsx` e exportado (`&` primeiro, assinatura `(value: string)` sem tolerância a nulo); os **9** sítios escapados no `${…}`, exceto `titulo`, escapado na origem cobrindo os dois usos (`<title>` `:158` e `<h1>` `:192`); `export` in place em `buildEndereco`/`buildBrinde`/`buildPrintHtml`, sem extração. `brinde-tamanho.ts` **intocado, provado por sha256 idêntico** (`4725a294…`) e ausência no `git diff`. `print-modal.test.ts` novo, 22 testes: régua de PRESENÇA (10 casos de injeção, um por sítio, com asserção no fragmento onde o sítio mora) + régua de ALCANCE (recorte fail-closed via `trechoDelimitado`, extração com balanceamento de chaves, `.toEqual([])` sobre as não-cobertas, `SEGURAS_DECLARADAS` com 14 motivos escritos, sinal de vida `>= 25`/`>= 23`). Contagem remedida e batendo: **25 interpolações, 23 únicas, 9 + 14**. **4 mutações de controle**, todas exit 1 e revertidas: (a) escape fora de um sítio ⇒ régua vermelha **nomeando `d.cargo`**; (b) e (b2) recorte sabotado nas duas pontas ⇒ sinal de vida vermelho **enquanto o `.toEqual([])` ficava VERDE**, que é a prova de que o sinal de vida não é opcional; (c) os 9 escapes removidos de uma vez ⇒ os 10 casos de injeção reprovam (nenhum vacuoso). AC7 provada por **bytes**: sonda temporária (criada, medida, removida) gerou o mesmo `sha256` `968bf963…` antes e depois do escape para dado sem caractere especial, `diff` exit 0. Duplo-escape (R4) coberto em obra/`titulo`/resumo/filtros. Gates: `TURBO_FORCE=true pnpm type-check` exit 0 (`0 cached`), `TURBO_FORCE=true pnpm lint` exit 0 (0 erros / 30 warnings de baseline, nenhum nos arquivos da story), `pnpm test` exit 0 (`327 files`, `4633 passed \| 6 expected fail`). Residual nomeado no Completion Notes: escape de HTML não cobre atributo sem aspas nem contexto de URL, a régua varre só `buildPrintHtml`, `startsWith("escapeHtml(")` é driblável por concatenação, e `next build` **não** foi rodado. |
| 2026-09-04 | Pax (@po) | **Validada — GO condicional cumprido, 9/10, Status Draft → Ready.** O draft entrou com **6/10** (reprovava nos pontos 3, 4, 8 e 9 do checklist) e subiu para 9/10 depois destas correções, todas de alçada do @po (AC, escopo, título): **(1) 9º sítio confirmado como fato e virou AC9** — `${resumo}` (`:88`) → `formatResumoBrindes` → `buildResumoBrindes` → `label` em `brinde-tamanho.ts:69` = `brindes_tipos.nome`+`.tamanho`, mesmo vetor do `buildBrinde`; escape cravado **no consumidor**, com `brinde-tamanho.ts` intocado — motivo medido: `buildTamanhoOptions` do mesmo módulo alimenta `<option value>` que vira `params.set("tamanho", …)` comparado por **igualdade exata** contra o banco, então escapar lá dentro quebraria o filtro; além de contaminar os 10 testes que a AC7 exige intactos. **(2) As 6 "decisões do @dev" foram decididas** — nome e casa do `escapeHtml` (local a `print-modal.tsx`, `export`ado, `&` escapado primeiro); regra única "escapa no `${}`, nunca dentro da função que monta a string"; `titulo` escapado na origem (`escapeHtml(dataNome)` em `:57`); `export` in place em vez de extração. **(3) AC6 cravada na abordagem de varredura** e a alternativa "satisfeita por disciplina de revisão futura" **descartada** (não cumpre o próprio objetivo da AC), com desenho prototipado pelo @po: recorte fail-closed, extração com balanceamento de chaves (regex ingênua trunca `${i % 2 === 0 ? "par" : "impar"}`), `.toEqual([])` sobre as não-cobertas, **sinal de vida `>= 25` interpolações / `>= 23` únicas** (medido) e mutação de controle dupla obrigatória; + a regra "o perdão é da expressão, nunca da variável" (`${cargo}` pode ser declarado seguro, `${d.cargo}` não). Inventário medido: 25/23 = 9 a escapar + 14 seguras, cada uma com motivo. **(4) Corrigida a caracterização do sítio 8:** o draft trocou as metades — `filters.obra_nome` é `<select>` alimentado por `uniqueObras` do banco e `filters.tamanho` é `<select>` alimentado por `brindes_tipos.tamanho` (texto livre do catálogo), ambos vetor **cruzado**; `filters.nome`/`filters.cidade` são os `<input>` de texto (self-XSS). O sítio 8 **não** é de severidade menor. **(5) Medições novas:** `gh pr view 570` = OPEN + **CHANGES_REQUESTED** + 3 commits ⇒ risco de rebase real no mesmo arquivo, o que decide o AC5; teste-sonda temporário provou que o Vitest importa `print-modal.tsx` (`"use client"` + `react` + `lucide-react`) em ambiente node (1 passed, exit 0, sonda removida) — o único precedente de runtime no repo é `message-media.test.ts` → `message-media.tsx`, pois o de `broker-message-input.tsx` é `import type`. **(6) Exclusão do `TIPO_LABEL[d.tipo] ?? d.tipo` CONFIRMADA** — `CHECK` da `031:36` intacto, nenhuma das 6 migrations posteriores de `brindes_destinatarios` (040/042/166/196/229/230) faz `DROP CONSTRAINT`. **(7) Seção Riscos (R1–R7)** adicionada; título e Complexity de 8 → 9 sítios. |
| 2026-09-04 | River (@sm) | Draft criado a partir do achado SEC-001 do gate da Story 75-372 (docs/stories/75-372-brindes-tamanho-relatorio-impresso.story.md, QA Results + nota de dívida no Dev Agent Record). Alcance remedido contra o código atual: 8 sítios (não 6) — os 6 campos de linha + `${titulo}` (2 usos, mesma severidade) + rótulos de filtro (self-XSS). Verificado e excluído: fallback `TIPO_LABEL[d.tipo] ?? d.tipo`, morto por `CHECK` constraint no banco. Medições reconfirmadas: `escapeHtml` 0 ocorrências, `document.write` em 1 arquivo, `window.open(` 7 ocorrências (1 com URL vazia), `httpOnly` 0. Branch-base definida como `story/75-372-brindes-tamanho-relatorio` (PR #570, aberto, não mergeado) — PR empilhado, não contra `main`. |

---

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context) — `claude-opus-5[1m]`, via @dev (Dex), modo YOLO.

### Debug Log References

Branch: `story/75-373-escapar-html-relatorio-brindes`, criada de `origin/main` em `3b809946`.

| Gate | Comando | Exit code | Saída |
|---|---|---|---|
| type-check | `TURBO_FORCE=true pnpm type-check` | **0** | `8 successful, 8 total` / `Cached: 0 cached, 8 total` (25.34s) |
| lint | `TURBO_FORCE=true pnpm lint` | **0** | `0 errors, 30 warnings` (baseline pré-existente) / `Cached: 0 cached, 8 total`; `grep print-modal` na saída = **exit 1** (nenhum achado nos arquivos desta story) |
| test (suíte inteira) | `pnpm test` | **0** | `Test Files 327 passed (327)` / `Tests 4633 passed \| 6 expected fail (4639)` (78.91s) |
| test (arquivo novo) | `npx vitest run …/print-modal.test.ts` | **0** | `Tests 22 passed (22)` |
| test (AC7, intocados) | `npx vitest run …/brinde-tamanho.test.ts …/destinatarios/route.test.ts` | **0** | `Test Files 2 passed (2)` / `Tests 12 passed (12)` |

`TURBO_FORCE=true` e não `--force`: `pnpm test --force` sai `CACError: Unknown option --force`
(o `test` da raiz é `vitest run` direto, sem turbo) e `pnpm type-check -- --force` sai
`error TS5093` (o `--` entrega a flag ao `tsc`). Nenhum dos dois é reprovação. Exit code capturado
com `$?` isolado por comando, nunca por `grep -c` nem por `timeout` (que não existe no macOS).

### Completion Notes

**Base da branch — divergiu da story, pela alternativa que a própria AC8 previa.** A story mandava
empilhar sobre `story/75-372-brindes-tamanho-relatorio` porque o PR #570 estava `OPEN`. Ele já
mergeou: squash `3b809946`, hoje em `origin/main`, junto com `66b083f5` (Story 900-68). A branch
saiu de `origin/main` atualizada — sem empilhamento, sem rebase contra alvo móvel. A decisão de
`export` in place (AC5) **continua valendo mesmo sem o risco de rebase**, pelo segundo motivo do
@po (diff mínimo) e por um terceiro, medido nesta sessão: o arranjo já existe em produção neste
repositório — `lancamentos/_components/lancamento-board.tsx`, que tem `"use client"`, exporta
`initials`, `avatarBg` e `formatDue` (helpers puros minúsculos). Não é padrão novo.

**Os 9 sítios, um a um.** Todos escapados **no `${…}`** (regra única do AC2), exceto o `titulo`,
escapado **na origem** (AC3). Linhas no estado final do arquivo:

| # | Linha | Antes | Depois | AC |
|---|---|---|---|---|
| 1 | `:109` | `${d.observacao}` | `${escapeHtml(d.observacao)}` | AC2 |
| 2 | `:111` | `${d.cargo}` | `${escapeHtml(d.cargo)}` | AC2 |
| 3 | `:121` | `${d.obra_nome}` | `${escapeHtml(d.obra_nome)}` | AC2 |
| 4 | `:123` | `${d.nome}` | `${escapeHtml(d.nome)}` | AC2 |
| 5 | `:124` | `${buildEndereco(d)}` | `${escapeHtml(buildEndereco(d))}` | AC2 |
| 6 | `:125` | `${buildBrinde(d)}` | `${escapeHtml(buildBrinde(d))}` | AC2 |
| 7 | `:101` (origem) → `:158` `<title>` e `:192` `<h1>` | `${dataNome}` | `${escapeHtml(dataNome)}` | AC3 |
| 8 | `:138` | `${activeFilters.join(" \| ")}` | `${escapeHtml(activeFilters.join(" \| "))}` | AC4 |
| 9 | `:150` | `${resumo}` | `${escapeHtml(resumo)}` | AC9 |

`buildEndereco` e `buildBrinde` continuam **byte a byte** como estavam (só ganharam `export`) — o
teste afirma isso diretamente: `expect(buildEndereco(d)).toBe(PAYLOAD)` e
`expect(buildBrinde(d)).toBe(PAYLOAD)` provam que as funções seguem devolvendo texto CRU e que
quem escapa é o template. `describeFilters()` idem, intocada.

**`<title>` conferido, como o AC3 pediu.** É um elemento *escapable raw text*: a única sequência
que fecha o parsing antes da hora é `</title`, e escapar `<` (que qualquer `escapeHtml` faz) já a
neutraliza. **Não** foi criada uma segunda função de escape para esse contexto. Os dois sítios de
uso do `titulo` têm asserção separada (`sítio 7a` no `<title>`, `sítio 7b` no `<h1>`), não uma
asserção só sobre "a variável foi transformada".

**AC9 — `brinde-tamanho.ts` intocado, provado por bytes.** `sha256` antes e depois:
`4725a29411efa123b1b7bafaf0efa44258161f738e77a2a645f4fcaa359951df` (idêntico), e o arquivo **não
aparece** em `git diff --name-only`. Os 10 testes de `brinde-tamanho.test.ts` passam sem uma linha
editada.

**AC6 — a régua de alcance, medida.** `print-modal.test.ts` recorta o texto-fonte de
`buildPrintHtml` com `trechoDelimitado(fonte, "function buildPrintHtml", "</html>\`")` — que já
aplica `codigoDe`/`linhasDeCodigo` de `@web/lib/tenancy/fonte-scan`, reaproveitado como o AC6 item
6 manda — extrai as interpolações **contando profundidade de chaves** (não regex) e exige que cada
expressão única esteja em `SEGURAS_DECLARADAS` (14 entradas, cada uma com o motivo escrito ao
lado) **ou** comece com `escapeHtml(`. `expect(naoCobertas).toEqual([])` sobre o conjunto
ordenado.

Contagem **remedida nesta sessão e batendo com o @po**: `25` interpolações, `23` expressões
únicas, `9` com `escapeHtml(` + `14` declaradas seguras. A lista das 25 foi impressa por uma
asserção exata temporária (revertida em seguida) e conferida item a item.

O filtro de comentário **não é decorativo aqui**: o comentário do AC9 que acrescentei dentro de
`buildPrintHtml` cita `brinde-tamanho.ts:69` escrevendo a interpolação do `label` em prosa. Sem
`linhasDeCodigo` a régua contaria 27/25 e reprovaria com duas expressões fantasma. A armadilha
saiu de hipotética para real, e está fechada.

**As três mutações de controle (as duas obrigatórias + uma terceira).** Todas rodadas, revertidas
por `diff` de volta a exit 0, com a suíte reconfirmada verde depois:

| Mutação | O que foi sabotado | Exit | O que ficou vermelho |
|---|---|---|---|
| **(a)** obrigatória | `${escapeHtml(d.cargo)}` → `${d.cargo}` no sítio 2 | **1** | régua da AC6: `AssertionError: expected [ 'd.cargo' ] to deeply equal []` — **vermelha NOMEANDO a expressão**; + `sítio 2` da AC5. `2 failed \| 20 passed` |
| **(b)** obrigatória | `ABERTURA` do recorte → `"function buildPrintHtmlQueNaoExiste"` | **1** | sinal de vida: `expected 0 to be greater than or equal to 25`. `2 failed \| 20 passed` |
| **(b2)** extra | `FECHAMENTO` do recorte → `"</htmlQueNaoExiste>\`"` | **1** | mesmo sinal de vida, pela outra ponta do `trechoDelimitado`. `2 failed \| 20 passed` |
| **(c)** extra | os **9** `escapeHtml(…)` removidos de uma vez (regex) | **1** | **todos os 10 casos de injeção** (9 sítios, `titulo` contado 2×) + os 3 casos de duplo-escape + a régua da AC6. `14 failed \| 8 passed` |

A mutação **(b)** é a que justifica o sinal de vida existir, e o resultado é explícito: com o
recorte sabotado, a asserção `expect(naoCobertas).toEqual([])` ficou **VERDE** — recorte vazio tem
zero interpolações e aprova tudo. Só o sinal de vida reprovou. Sem ele a régua da AC6 seria uma
farsa silenciosa, exatamente como o AC6 item 4 previu.

A mutação **(c)** existe porque "um caso por sítio" só vale se nenhum dos 9 for vacuoso: com os 9
escapes fora, os 9 casos reprovam. Nenhuma asserção da AC5 passa por acidente. Os 8 que
permaneceram verdes são os 4 unitários do `escapeHtml` (o helper não foi tocado), o caso "dado sem
caractere especial atravessa intacto" (que **deve** ficar verde — dado limpo não muda) e as 3
asserções auxiliares da régua.

**AC7 — paridade provada por BYTES, não por leitura.** Uma sonda temporária
(`__baseline-probe.test.ts`, criada, medida e **removida**) gravou o HTML de `buildPrintHtml` para
um conjunto de dados sem nenhum caractere especial **antes** de aplicar os escapes e **depois**.
Mesmo `sha256`: `968bf963fe1a18eb7541344fc500d833e3f808ceb0d75e016b369df6ce68bb94`, 3286 bytes,
`diff` com **exit 0**. O escape é no-op para o caso comum — mesmas colunas, mesmo resumo, mesmos
filtros. O teste que ficou no repo cobre a mesma propriedade por asserção
(`toContain('<td class="obra">Residencial Alfa</td>')` etc.); a igualdade de bytes é a medição
desta sessão, registrada aqui.

**R4 (duplo-escape) — caso de teste, como a story exigiu.** `Alfa & Beta` numa obra sai
`Alfa &amp; Beta` e a célula é afirmada `not.toContain("&amp;amp;")`. Coberto também no sítio de
maior risco (o `titulo`, escapado na origem e interpolado 2×) e no `resumo`/`filtros`. Há ainda um
teste que afirma que `escapeHtml` **não** é idempotente
(`escapeHtml(escapeHtml("Alfa & Beta")) === "Alfa &amp;amp; Beta"`) — não como defeito, mas para
que a regra "uma vez só, no `${}`" tenha consequência visível se alguém a violar.

**`TIPO_LABEL[d.tipo] ?? d.tipo` fica de fora, com o motivo NO CÓDIGO.** Não foi só omitido: está
declarado em `SEGURAS_DECLARADAS` com a razão ao lado (`CHECK (tipo IN ('mae','pai','outro'))` da
`031_controle_brindes.sql:36`, intacto nas 6 migrations posteriores) e há um comentário na própria
linha. Registrar o perdão e a razão, em vez de fingir que o `??` não existe.

**Régua extra que não estava na AC, e por que entrou.** Dois `it` a mais na AC6: (1) nenhum perdão
declarado está morto (expressão em `SEGURAS_DECLARADAS` que não existe mais na fonte reprova) e
(2) todo perdão tem motivo não-vazio. Custo: 8 linhas. Motivo: sem (1) a lista apodrece e a
próxima expressão que reusar aquele nome nasce perdoada — é a cegueira "o nome perdoando o sítio"
na escala de uma função. Se o gate considerar escopo excedido, remover os dois `it` não afeta
nenhuma AC.

#### Residual conhecido — nomeado, não escondido

1. **A régua da AC6 prende `escapeHtml(`, não suficiência de contexto.** Hoje nenhum dos 9 sítios
   está dentro de atributo HTML — o único atributo interpolado é
   `class="${i % 2 === 0 ? "par" : "impar"}"`, dois literais fixos. `escapeHtml` cobre `"` e `'`,
   então **atributo com aspas** fica seguro; **atributo sem aspas** e **contexto de URL**
   (`href="javascript:…"`) **não** são cobertos por escape de HTML, e a régua ficaria **verde**
   para um sítio novo desses. Fechar isso exigiria escape por contexto (atributo/URL/JS),
   que é outra story.
2. **A régua varre só `buildPrintHtml`.** Se alguém montar HTML em outra função do arquivo e
   passar para `document.write`, a varredura não vê. Hoje `win.document.write(html)` recebe
   exclusivamente a saída de `buildPrintHtml` (medido: `document.write(` existe em **1** arquivo
   de toda a app).
3. **`startsWith("escapeHtml(")` é driblável por concatenação** — `${escapeHtml(a) + b}` passaria.
   É o desenho literal cravado no AC6 item 3; anotado por honestidade, não como divergência.
4. **Não provado: `next build`.** Os três gates da CI (`type-check`, `lint`, `test`) passaram, e
   nenhum deles é `next build` — não rodei o build do Next. O risco do `export` num módulo
   `"use client"` é coberto pelo precedente em produção (`lancamento-board.tsx`), não por medição
   de build nesta sessão.
5. **`httpOnly` continua 0 em `packages/web/src`.** É o que dá gravidade ao achado; mudar isso é
   decisão de infra e está fora desta story, como a própria story registra.

### File List

| Arquivo | Ação |
|---|---|
| `packages/web/src/app/dashboard/brindes/_components/print-modal.tsx` | modificado — `escapeHtml` novo e exportado; `export` em `buildEndereco`/`buildBrinde`/`buildPrintHtml`; escape nos 9 sítios |
| `packages/web/src/app/dashboard/brindes/_components/print-modal.test.ts` | **criado** — 22 testes: 4 do helper (AC1), 10 de injeção por sítio (AC5), 4 de duplo-escape/paridade (AC7/R4), 4 da régua de alcance (AC6) |
| `docs/stories/75-373-escapar-html-relatorio-brindes.story.md` | modificado — Tasks, Dev Agent Record, Change Log, Status |

**Não tocados, de propósito e verificado:**
`packages/web/src/app/dashboard/brindes/_components/brinde-tamanho.ts` (sha256 idêntico),
`brinde-tamanho.test.ts`, `packages/web/src/app/api/brindes/destinatarios/route.test.ts`,
`brindes-filter-bar.tsx`, `brindes-table.tsx`, `types.ts`,
`packages/web/src/lib/tenancy/fonte-scan.ts` (reaproveitado, não alterado).

---

## QA Results

### Review Date: 2026-09-04

### Reviewed By: Quinn (Test Architect & Quality Advisor)

**Escopo revisado:** `git diff origin/main...HEAD` = 3 arquivos (`print-modal.tsx` modificado,
`print-modal.test.ts` criado, esta story). Commit `4a25e17c`, pai `3b809946` = `origin/main` =
merge commit do PR #570 (`MERGED` em 2026-09-04T13:18:29Z, confirmado por `gh pr view 570`).
**AC8 satisfeita pela alternativa que ela mesma previa** — sem empilhamento, sem rebase contra
alvo móvel, um único commit na branch.

### Placar dos 7 checks

| # | Check | Resultado | Base |
|---|---|---|---|
| 1 | Code review | **PASS** | Regra única "escapa no `${}`" cumprida em 8 dos 9 sítios; o 9º (`titulo`) na origem, como o AC3 crava. `buildEndereco`/`buildBrinde`/`describeFilters` byte a byte, só ganharam `export`. `escapeHtml` local ao arquivo (0 ocorrências fora dele), `&` primeiro, assinatura sem tolerância a nulo |
| 2 | Testes unitários | **PASS** | 22 testes, exit 0. **6 mutações do @qa**: 4 exit 1 (vermelho correto, uma delas nomeando a expressão), 2 exit 0 que confirmam residuais declarados. Nenhuma asserção vacuosa |
| 3 | Acceptance criteria | **PASS (9/9)** | AC1–AC9 verificadas uma a uma contra o código, não contra a narrativa |
| 4 | Sem regressão | **PASS** | `327 files / 4633 passed \| 6 expected fail`, exit 0, `TURBO_FORCE=true`. Paridade de bytes contra `origin/main` **remedida pelo @qa** com contraprova |
| 5 | Performance | **PASS** | 5 `.replace()` por chamada, ~10 chamadas por linha, dentro de um handler de clique. Zero query nova, zero mudança de fluxo |
| 6 | Segurança | **PASS** | **SEC-001 fechado** — era o único não-PASS do gate da 75-372. Ver "SEC-001" abaixo |
| 7 | Documentação | **PASS** | Os 5 não-provados declarados sem maquiagem; o motivo de cada perdão está **no código**, não só na story. Um deles (`TIPO_LABEL[d.tipo] ?? d.tipo`) tem uma segunda tranca que a story não citou — ver abaixo |

### Gates re-executados pelo @qa, sem cache

```
TURBO_FORCE=true pnpm type-check → 8 successful, 8 total / Cached: 0 cached, 8 total   EXIT=0
TURBO_FORCE=true pnpm lint       → 30 problems (0 errors, 30 warnings) / 0 cached      EXIT=0
                                   grep print-modal na saída                          EXIT=1
TURBO_FORCE=true pnpm test       → 327 files passed / 4633 passed | 6 expected fail    EXIT=0
npx vitest run print-modal.test.ts → 22 passed (22)                                    EXIT=0
```

`0 cached, 8 total` nos dois: cache hit não é evidência. Os três números do @dev conferem.

### As 6 mutações do @qa (árvore restaurada e provada: `git status --short -- packages/` vazio, sha256 de volta ao original)

| # | O que sabotei | Exit | O que ficou vermelho |
|---|---|---|---|
| **QM1** | `${escapeHtml(resumo)}` → `${resumo}` — **sítio 9, diferente do que o @dev mutou** | **1** | régua da AC6 **nomeando**: `expected [ 'resumo' ] to deeply equal []`; + sítio 9, sítio 6 e o caso de duplo-escape. `4 failed \| 18 passed` |
| **QM2** | `ABERTURA` → `"function buildPrintHtmlQueNaoExiste"` (reprodução da mutação (b)) | **1** | sinal de vida: `expected 0 to be greater than or equal to 25`. **E o `expect(naoCobertas).toEqual([])` ficou VERDE** — reproduzido, a propriedade se sustenta |
| **QM3** | **sítio NOVO de dado cru**: `<td class="cep">${d.endereco_cep}</td>` | **1** | régua da AC6: `expected [ 'd.endereco_cep' ] to deeply equal []`. **É a promessa central da AC6 e nenhuma mutação do @dev a havia provado** — as dele removiam escape de sítio existente, esta acrescenta o sítio que "ainda não existe" |
| **QM4** | sítio novo **escapado** em atributo **sem aspas**: `data-x=${escapeHtml(d.nome)}` | **0** | nada — régua VERDE (22/22) com o HTML emitindo `onmouseover=alert(1)` vivo. **Residual 1 do @dev confirmado por medição** |
| **QM5** | drible por concatenação: `${escapeHtml(d.obra_nome) + (d.endereco_cep ?? "")}` | **0** | nada — régua VERDE com `d.endereco_cep` cru. **Residual 3 confirmado** |
| **QM6** | sinal de vida declarado `25→26` e `23→24` | **1** | `expected 25 to be greater than or equal to 26` e `expected 23 to be greater than or equal to 24` — contagem **cravada em exatamente 25/23**, medida mutando o DECLARADO em vez de replicar o scanner |

**QM2 é a mais importante e foi reproduzida como o @dev descreveu:** com o recorte sabotado, a
asserção de cobertura fica **verde** porque recorte vazio tem zero interpolações. Só o sinal de
vida reprova — e, achado meu, o `it` extra "nenhum perdão declarado está morto" **também**
reprova, por mecanismo independente. A régua da AC6 **não** é falso verde; o veredito não muda.

### Verificações independentes (não confiei nos números do @dev)

**AC7 — paridade por bytes, remedida pelo @qa com contraprova.** Não aceitei o `sha256`
`968bf963…` de palavra. Escrevi uma sonda temporária (criada, medida, **removida**) que compilou
o `buildPrintHtml` de `origin/main` — cópia temporária com apenas `export` acrescentado, corpo
intocado — ao lado do de `HEAD`, e comparou o `sha256` do HTML para dado limpo em **dois**
cenários (sem data/sem filtros; com data + 2 filtros): **idêntico nos dois**. E a contraprova no
mesmo arquivo: dado com `&`/`<` **diverge**, então a sonda é capaz de reprovar. `EXIT=0`.

**AC9 — `brinde-tamanho.ts` intocado, por bytes.** `sha256` da árvore == `sha256` do blob de
`origin/main` (`4725a29411efa123b1b7bafaf0efa44258161f738e77a2a645f4fcaa359951df`), e o
`git diff origin/main...HEAD` dos 4 arquivos declarados intocados (`brinde-tamanho.ts`,
`brinde-tamanho.test.ts`, `destinatarios/route.test.ts`, `fonte-scan.ts`) tem **0 bytes**.

**Os 14 perdões auditados um a um.** O teste só exige motivo **não-vazio**, não motivo
**correto** — então um perdão errado seria invisível. A única entrada que perdoa **dado cru** é
`TIPO_LABEL[d.tipo] ?? d.tipo`, e ela está **dupla-trancada**: o `CHECK (tipo IN
('mae','pai','outro'))` de `031_controle_brindes.sql:36` está intacto (o único `DROP CONSTRAINT`
da família, `165:13`, é de `brindes_tipos`), **mais** validação de aplicação nos três endpoints
de escrita (`destinatarios/route.ts:87`, `destinatarios/[id]/route.ts:31`,
`import/route.ts:49`) — defesa que a story não citou. As outras 13 são fragmento já escapado
(o dado dentro é medido à parte, e QM1 provou isso), dicionário de literais (`STATUS_LABEL` em
`types.ts:61`, `TIPO_LABEL` em `print-modal.tsx:18`), número ou `Date` formatada.

**Superfície de saída reconfirmada.** `document.write(` tem **1** sítio de código em toda a app
(`print-modal.tsx:266`) e recebe **exclusivamente** a saída de `buildPrintHtml`. `escapeHtml`
não existe fora deste arquivo. Nenhum `httpOnly` é imposto em `packages/web/src` — as 3
ocorrências que o `grep` acha hoje são a **prosa dos comentários novos** desta story, não código;
o `@supabase/ssr` não sobrepõe flags em `server.ts`/`middleware.ts`, então o cookie de sessão
segue legível por JS. O modelo de ameaça da story está correto.

### SEC-001 — pode ser considerado FECHADO

**Sim, para a superfície de ataque que existe hoje**, e a afirmação está apoiada em três coisas
distintas, não em "os testes passaram":

1. **Cobertura completa do recorte**, provada por `.toEqual([])` sobre 23 expressões únicas com
   sinal de vida cravado em 25/23 (QM6) — não sobra interpolação de dado sem escape.
2. **A régua reprova sítio NOVO** (QM3), que é o que separa "consertei 9 lugares" de "fechei a
   classe de defeito".
3. **O caminho de saída é único e auditado** — um `document.write`, um produtor de HTML.

**O que NÃO está fechado, e é honesto dizer:** escape de HTML não cobre atributo sem aspas nem
contexto de URL. Isso está registrado como `SEC-002` (severidade **low**) porque **nenhum sítio
de hoje está em atributo** — é falso-verde para o próximo autor, não vulnerabilidade viva. Não
bloqueia, e nunca bloquearia esta story: exigir escape por contexto aqui seria trocar o escopo
depois da entrega.

### Parecer sobre os 5 não-provados do @dev

1. **`next build` não rodado — ACEITO, com evidência que eu mesmo levantei.** Tentei rodar:
   `pnpm --filter @trifold/web build:teste` sai **exit 1** porque `packages/web/.env.development`
   não existe nesta máquina, e recusei um `next build` nu porque ele resolveria
   `packages/web/.env.local`, que nesta máquina aponta para **produção** (ver ENV-001). No lugar,
   duas medições: (a) o precedente está em `origin/main` e em produção —
   `lancamentos/_components/lancamento-board.tsx:1` é `"use client"` e exporta `initials` (`:38`),
   `avatarBg` (`:41`) e `formatDue` (`:59`); (b) **nenhuma aresta nova para código de servidor** —
   o único importador de `print-modal` é `brindes-table.tsx:13`, ele mesmo `"use client"`, e os 4
   exports novos têm **zero** consumidores fora do teste. O modo de falha que se teme (Server
   Component importando função de módulo cliente e recebendo um client-reference proxy) é
   **estruturalmente ausente**, não improvável. Suficiente.
2. **Nada verificado em navegador — ACEITO, e a substituição é mais forte que o original.**
   Paridade de bytes diz que a string entregue ao DOM é a mesma; um olhar em tela diria menos.
   Remedi por conta própria, com contraprova (acima). Para o caso escapado, a propriedade
   ("`&lt;script&gt;` renderiza como texto") é a especificação do HTML, não comportamento da app.
3. **A régua prende presença, não suficiência de contexto — LIMITAÇÃO ACEITÁVEL, e virou
   `SEC-002` (low).** Não é lacuna que precise de AC nesta story, por dois motivos: nenhum sítio
   atual está em atributo, e a AC6 foi escrita e cravada pelo @po com este desenho. Mas eu
   **medi** o furo (QM4: régua verde emitindo `onmouseover=alert(1)`), então ele vai para o
   backlog como item com evidência, não como parágrafo numa story que será arquivada.
4. **`startsWith("escapeHtml(")` driblável por concatenação — ACEITO como desenho, `TEST-002`
   (low).** É a letra do AC6 item 3. Medido (QM5). Mesmo backlog do `SEC-002`: as duas se fecham
   com a mesma mudança (exigir que a expressão **inteira** seja uma chamada de escape).
5. **CodeRabbit CLI não executado — CORRETO.** O gatilho deste repositório é o GitHub App via
   `.coderabbit.yaml`, que dispara no PR. Não rodei o CLI (instruído a não rodar, e é a política
   certa: nesta máquina um review retroativo já morreu com `WebSocket closed`).

### Os 2 `it` além das ACs — MANTER

Não é escopo excedido, e agora tenho medição para dizer isso: em **QM2** o `it` "nenhum perdão
declarado está morto" ficou **vermelho junto** com o sinal de vida, por mecanismo **independente**
(os 14 perdões desapareceram do conjunto único). Ou seja, ele é um **segundo detector do recorte
sabotado** — o modo de falha nº 1 dessa régua, o único que aprova tudo em silêncio. O outro `it`
guarda a única propriedade que `Record<string, string>` não guarda (ele aceita `""`). 8 linhas por
um detector redundante do pior modo de falha é preço bom. Não remover.

### Achado FORA do escopo desta story — ENV-001 (alto, ambiente, não é defeito da 75-373)

Encontrado por acidente ao tentar rodar o `next build`: **`packages/web/.env.local` existe nesta
máquina** (807 bytes, 30/07 — anterior à Story 900-3b), aponta para o Supabase de **produção**
(`dsopqkqjkmhytudaaolv`) e carrega `SUPABASE_SERVICE_ROLE_KEY`. `.env.local` **vence qualquer
outro arquivo de env no Next**, e `packages/web/.env.development` **não existe** — então
`pnpm dev` nesta máquina roda contra **produção**, exatamente o risco que o `CLAUDE.md` declara
eliminado ("`.env.local` não existe mais"). **Nada a ver com esta story**; para o @devops.

### Status recomendado

`Ready for Review` → **Done** (transição de Status é do @dev/@devops; o @qa só escreve aqui).
Liberado para `@devops *push` / PR contra `main`.

### Gate Status

Gate: PASS → docs/qa/gates/75-373-escapar-html-relatorio-brindes.yml
