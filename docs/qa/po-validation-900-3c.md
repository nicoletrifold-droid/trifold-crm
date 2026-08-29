# Validação PO — Story 900-3c (Registro de Migrations e Fluxo de Promoção — Fatia B)

- **Story:** `docs/stories/900-3c-registro-de-migrations-e-promocao.story.md` (v0.1)
- **Irmã:** `900-3b` (Fatia A) — parecer em `docs/qa/po-validation-900-3b.md` (Rodada 2)
- **Origem:** split da story única `900-3b` v0.2, reprovada com NO-GO 6/10 na Rodada 1
- **Data:** 2026-08-29 · **Validador:** @po (Pax)
- **Método:** cada régua alegada foi **executada** contra `HEAD`, não lida.

---

## Veredito — Fatia B

> ## ✅ GO — Readiness 8/10 — Confiança: Alta
>
> As 4 correções bloqueantes desta fatia (C4, C5, C6, C8) foram aplicadas e **as quatro verificam**.
> Rodei as réguas novas contra `HEAD`: as duas do C4 estão verdes e discriminam; a do C8 devolve o
> mesmo resultado da minha medição independente; o contrato de exit code do C6 não tem mais
> contradição com a AC irmã; a exclusão declarada do C5 corresponde à função que eu havia medido.
>
> **Nenhum defeito bloqueante.** As 4 pendências são de **forma de saída** de comando e de cobertura
> de regex — nenhuma muda o desenho.
>
> **Esta fatia está bloqueada por dependência, não por qualidade:** precisa da `900-3b` mergeada
> (Task 2 mexe no mesmo arquivo) e, de preferência, do merge do PR #522 antes de fixar o número da
> migration. As duas dependências estão declaradas corretamente na story.

---

## 1. As quatro correções, executadas

### ✅ C4 — a régua de não-reescrita agora é verde em `HEAD` e discrimina

A v0.2 citava a AC8 da `900-1` (`grep -c "gate:tenancy\|tenancy" ci.yml` → 0), que eu medi em **6**.
A story trocou por duas réguas. Rodei as duas:

```
$ git diff --numstat origin/main...HEAD -- .github/workflows/ci.yml
(saída vazia — nenhuma alteração ainda no branch)

$ grep -c "^  static:\|^  tenancy-gate:" .github/workflows/ci.yml
2
```

Ambas verdes no baseline, ambas com vermelho alcançável: a primeira acende se qualquer linha
existente for **removida** (é exatamente "reescrever o arquivo"); a segunda acende se um job
existente sumir. A story ainda fez a coisa certa a mais: registrou em Dev Notes que a AC8 da `900-1`
*"não usá-la como referência de não-reescrita em nenhuma story futura que toque este arquivo"* — o
achado deixa de morrer neste parecer e passa a viver no repositório.

Ressalva de forma → **T1**: a régua diz *"3ª coluna (deletions) == 0"*, mas **hoje a saída é
vazia** (nenhuma linha). "Vazio" e "0 deleções" são estados diferentes, e vazio não deve ser lido
como falha. A AC precisa dizer: *saída vazia (arquivo intocado) ou 3ª coluna = 0*.

### ✅ C5 — exclusão declarada, e ela corresponde ao que medi

A régua ficou ancorada nos 3 arquivos sob extração, com a exclusão de `scripts/gate-tenancy.ts:215`
escrita **dentro do bloco**, com a razão (assinatura `(sql, pat)` contra `(ref, pat, sql)`, outro
transporte, outra story). Confirmei que a função é essa mesma, e a Dev Note reproduz a assinatura
correta. Isto resolve o defeito da v0.2 — a régua deixa de ser impossível de fechar.

Ressalva de forma → **T2**: rodei a régua literal contra `HEAD`:

```
$ grep -c "function runSql\|function splitStatements" scripts/reset-tenancy-testdb.ts scripts/db-status.ts scripts/db-apply.ts
ugrep: warning: scripts/db-status.ts: No such file or directory
ugrep: warning: scripts/db-apply.ts: No such file or directory
2
```

Dois problemas de forma: (a) `grep -c` com **vários** arquivos imprime `arquivo:contagem` por
arquivo no GNU grep (o runner é `ubuntu-latest`), enquanto o `ugrep` desta máquina agregou num
número solo — o "esperado: 0" é ambíguo e depende da implementação de `grep`; (b) hoje devolve `2`
(correto: a extração ainda não aconteceu), o que é bom como baseline, mas a AC não diz isso.
Trocar por `grep -l` (esperado: **nenhum arquivo listado**, exit 1) elimina as duas ambiguidades.

### ✅ C6 — a contradição de exit code acabou

A AC2 agora declara o contrato inteiro num só lugar: `db:status` sai **`0` sempre que a tabela
existir**, qualquer que seja o veredito por arquivo; sai **`1`, nomeando `trifold_migrations_aplicadas`
e apontando o runbook, apenas quando a tabela não existir**. A AC1 deixou de reescrever o contrato e
passou a **referenciá-lo** (*"deve falhar (ver contrato de exit code na AC2 — C6)"*). Não há mais
duas ACs dizendo coisas diferentes sobre o mesmo comando, e a distinção escolhida — pré-condição de
infraestrutura × veredito de conteúdo — é a certa: preserva "relatório, não gate" sem tornar a
mutação inobservável. As duas verificações da AC2 exercitam os dois lados (`antes` → 1, `depois com
PENDENTE de verdade` → 0), o que impede a implementação preguiçosa de "sempre 1".

Ressalva de execução → **T3**: a mutação *"rodar `db:status` **antes** da AC1 estar aplicada"* não
tem janela óbvia, porque a Task 1.4 aplica a migration **antes** de a Task 2 criar o `db:status`.
Existe uma janela natural e a AC deve nomeá-la: a Task 1.4 aplica em **teste** primeiro; rodar
`db:status` apontado para **produção** nesse intervalo dá o `exit 1` de graça, sem precisar
derrubar tabela nenhuma.

### ✅ C8 — a varredura com `fetch` devolve o mesmo que a minha medição independente

```
$ git fetch --prune origin && for r in $(git for-each-ref --format='%(refname)' refs/heads refs/remotes/origin); do
    git ls-tree --name-only "$r" -- supabase/migrations/ 2>/dev/null | sed 's|.*/||'
  done | grep -oE "^[0-9]{3}_" | sort -u | tail -4
241_  242_  243_  244_
```

Maior prefixo em **todas** as refs = `244` (só em `origin/story/900-22b-convite-admin`, PR #522
`OPEN`); **`245` livre**. Os dois reparos que eu pedi estão lá: `git fetch --prune origin` como
primeira linha, e `^[0-9]{3}_` no lugar de `^2[0-9]{2}_`. A story ainda acrescentou, por conta
própria, uma verificação que eu não havia pedido e que é boa: *"rodar a régua **sem** `git fetch`
primeiro, num ambiente com índice desatualizado — deve ser possível demonstrar que ela lê um estado
velho"* — é um controle positivo para o próprio `fetch`, provando que ele não é decorativo.

Ressalva medida → **T4**: `^[0-9]{3}_` é **cego para variantes com sufixo de letra**, e elas existem
no repositório:

```
$ ls supabase/migrations/ | grep -E "^[0-9]{3}[a-z]_"
024b_mensagens_sender_display_name.sql
028a_fix_v_mensagens_admin_grant.sql
028b_meta_campaign_actions.sql
```

O próprio épico usa o `024b_` como exemplo da armadilha de ordenação lexicográfica. Um `245a_`
criado por outro PR seria invisível para esta régua. Custo do conserto: `^[0-9]{3}[a-z]?_`.

### ✅ S5 — o espelho por ambiente ficou chaveado

`docs/audits/migrations-aplicadas.json` passou a ter estrutura `{ "teste": [...], "producao": [...] }`
com a regra explícita de que cada execução só reescreve a própria chave. Isso fecha o caso que eu
levantei: um `db:status` contra teste sobrescrevendo o retrato de produção no diff do PR.

---

## 2. Julgamento do S2 — **não é esquiva, mas o canal escolhido não entrega**

### A parte em que o @sm está certo

Ele não pode editar o épico. A matriz de autoridade dá a propriedade do épico ao `@pm`, e a própria
`900-2c` já registrou por escrito o mesmo entendimento para o documento de arquitetura: *"devem ser
reportadas ao @architect/@pm, não corrigidas pelo @sm ou pelo executor desta story (fora da
autoridade destes agentes)"*. Reportar em vez de editar é o comportamento correto, e registrar a
contradição em vez de fingir que ela não existe é melhor do que a alternativa silenciosa.

### A parte em que o mérito já está resolvido — e ele podia ter dito isso

Fui verificar se o §461 do épico ainda se sustenta. **Não se sustenta, e a prova está na própria
`900-3`:**

- A `900-3` está `InReview` com *"os 6 ACs cumpridos"*, mas as tarefas **T1.1 a T1.4 estão todas
  desmarcadas** (`[ ]`) — e T1.3 era literalmente *"rodar `supabase db push --db-url ...` (reusar o
  padrão de `scripts/sync-schema.sh`, adaptado)"*.
- A story registra que *"a decisão de ambiente mudou em relação ao draft"*, e o que existe hoje é o
  `reset-tenancy-testdb.ts` via Management API — construído justamente porque `db push` é
  inutilizável aqui (prefixos duplicados + `CREATE INDEX CONCURRENTLY`).

Ou seja: o §461 (*"`sync-schema.sh` **é** corretamente reaproveitável em `900-3`"*) era verdadeiro
como **plano** e foi **superado pelo resultado da própria `900-3`**. O script nunca foi usado.
**Deletá-lo na AC5 é seguro e correto**, e a contradição com o épico é obsolescência do épico, não
risco desta story.

### A parte que falta

*"Registrar no Dev Agent Record e reportar ao @pm/@architect"* é um canal que ninguém monitora — a
nota morre junto com a story. **Gestão de contexto de épico é autoridade minha (@po), então eu
assumo o item:** vou registrar em `docs/backlog.md`, que é artefato monitorado em sprint planning,
com a evidência acima (T1.1-T1.4 desmarcadas + mudança de decisão registrada na `900-3`).

**Recomendação → T5:** a AC5 troca *"registrar no Dev Agent Record"* por *"abrir item em
`docs/backlog.md` endereçado ao @pm, citando a evidência da `900-3`"*. O Dev Agent Record continua
recebendo a nota, mas deixa de ser o único canal.

---

## 3. Coerência do split, vista deste lado

- **Escopo IN/OUT casa com a irmã.** O OUT da `900-3c` lista exatamente o IN da `900-3b`, e
  vice-versa. Nenhum item da AC10 original ficou órfão ou duplicado (tabela conferida no parecer da
  Fatia A, §4).
- **A entrega interrompida foi costurada.** A `900-3b` AC5 declara que `delete from
  supabase_migrations.schema_migrations;` **permanece** e que popular o ledger fica de fora; a
  `900-3c` AC3 recolhe exatamente esse item. Não há janela em que o comportamento fique indefinido.
- **A dependência aponta na direção certa** e a story a torna operacional: a `900-3c` depende da
  `900-3b` **mergeada** (não só draftada), e o R4 nomeia o conflito de arquivo concreto
  (`reset-tenancy-testdb.ts`, tocado pelas duas).
- **O "Deferido da Onda 1" mora numa fatia só** (aqui), com a razão declarada — não duplicado nos
  dois documentos. Correto.
- **A AC5 não pode preceder a AC2**, e a story diz isso literalmente (*"estes comandos só existem
  depois que esta AC roda, então a reescrita só pode ser feita depois da AC2"*) — a dependência que
  quebrava o corte original está fechada.

---

## 4. Correções — Fatia B (todas recomendadas, nenhuma bloqueante)

| # | Onde | Correção |
|---|---|---|
| **T1** | AC4 | A régua `git diff --numstat` precisa aceitar **saída vazia** (arquivo intocado) além de "3ª coluna = 0" — hoje o baseline é vazio, e vazio não é falha. |
| **T2** | AC2 | `grep -c` com múltiplos arquivos imprime `arquivo:contagem` por arquivo no GNU grep do runner (o `ugrep` local agrega — medido, formas diferentes). Trocar por `grep -l` com esperado "nenhum arquivo listado". Registrar o baseline de hoje (`2` em `reset-tenancy-testdb.ts`) como o vermelho de partida. |
| **T3** | AC2 | Nomear a janela da mutação "`db:status` antes da tabela existir": aplicar a Task 1.4 em **teste** primeiro e rodar `db:status` contra **produção** no intervalo. Sem isso a mutação não tem como ser exercida na ordem das Tasks. |
| **T4** | AC1 | `^[0-9]{3}_` é cego para `024b_`/`028a_`/`028b_` (medido, existem no repo; o épico usa o `024b_` como exemplo de armadilha). Usar `^[0-9]{3}[a-z]?_`. |
| **T5** | AC5 | Trocar "registrar no Dev Agent Record" por "abrir item em `docs/backlog.md` endereçado ao @pm", citando a evidência de que a `900-3` nunca usou o script (T1.1-T1.4 desmarcadas). O @po assume o encaminhamento. |

---

## 5. Checklist — Fatia B

| # | Critério | Nota | Observação |
|---|---|---|---|
| 1 | Template / estrutura | ✅ | Seções completas; skip notice do CodeRabbit correto. |
| 2 | Executor assignment | ✅ | @devops ≠ @architect; exceção da Task 1.1 (@dev escreve o `.sql`) preservada e justificada. |
| 3 | Caminhos / árvore | ✅ | `ci.yml` (2 jobs), `gate-tenancy.ts:215`, convenções de `docs/runbooks/` e `docs/audits/` — todos conferidos. |
| 4 | Cobertura AC ↔ Task | ✅ | 5 ACs ↔ 5 Tasks, 1:1, ordem declarada e correta (1→2→{3,4,5}). |
| 5 | Testabilidade / poder discriminante | ✅ | C4/C5/C6/C8 executadas. Pendências T1-T4 são forma de saída e cobertura de regex, não poder discriminante. |
| 6 | Testing standards | 🟡 | Honesta ao declarar "sem suíte Vitest nova". Mas a frase *"reusa os testes que a `900-3b` já cobre indiretamente ... caso contrário, validação manual documentada"* é uma alternativa em aberto: `db-env.test.ts` **não** cobre `runSql`/`splitStatements`. Assumir validação manual e dizer isso direto. |
| 7 | Segurança | ✅ | Guard de fork obrigatório e verificado por mutação; PAT nomeado; RLS na tabela nova com deny por padrão; nenhum valor de segredo. |
| 8 | Sequência de tasks | ✅ | Correta, incluindo a ordem "AC2 antes de AC5" que quebrava o corte original. |
| 9 | Anti-alucinação | ✅ | Reproduzi as afirmações novas: contagem de jobs (2), `git diff --numstat` vazio, `grep -c` (2 + warnings), varredura de refs (`244` máximo, `245` livre), `gate-tenancy.ts:215`, variantes `NNNx_`. Todas conferem. |
| 10 | Prontidão para o @dev | ✅ | Autocontida; o contrato de exit code e o número da migration têm procedimento de remedição, não valor herdado. |

**Score: 8/10 · GO**

---

## 6. Ordem de execução das duas fatias

1. **`900-3b`** — emenda D1 aplicada pelo @sm → `Ready` → desenvolvimento. **Não depende do
   PR #522.** Pode começar hoje.
2. **PR #522** mergeia quando estiver pronto (fluxo próprio, sem relação com estas stories).
3. **`900-3b`** mergeia.
4. **`900-3c`** — Task 1.1 remede o número da migration **depois** dos dois merges acima, pela
   régua da AC1 (com `fetch`). O `245` deste documento é medição datada, não valor a herdar.

**Risco de sequência que vale vigiar:** se a `900-3c` demorar, o repositório fica num estado em que
o reset endurecido existe mas não popula ledger nenhum, e o `delete from
supabase_migrations.schema_migrations` continua lá. Isso é **igual ao estado de hoje**, não uma
regressão — a `900-3b` foi escrita com esse cuidado. A janela é segura.

*— Pax, equilibrando prioridades 🎯*

---
---

# RODADA 2 — GO focado nas duas correções (`900-3c` v0.3, pós-merge da Fatia A)

- **Story:** v0.3 · 654 linhas · 5 ACs / 5 Tasks preservados
- **Branch:** `story/900-3c-registro-migrations`, de `origin/main` (`77f225d1`)
- **Escopo:** só as duas correções, as remedições e a lição da Fatia A. O GO de conteúdo 8/10
  da Rodada 1 permanece de pé.
- **Data:** 2026-08-29 · **Validador:** @po (Pax)

## Veredito

> ## ❌ NO-GO — estreito, num ponto só: o desenho da Correção 2
>
> **A Correção 1 passa, e eu a verifiquei rodando.** As remedições conferem, todas. A lição da
> Fatia A foi incorporada — com uma ressalva de posicionamento.
>
> **A Correção 2 identificou o defeito certo e escolheu o mecanismo certo para ele — mas o
> mecanismo tem um efeito colateral que a tabela de 4 opções não nomeia: ele agenda a destruição
> automática do banco em que os desenvolvedores rodam `pnpm dev`, 16 a 24 vezes por dia.** Isso
> materializa o risco D6 que o próprio épico aceitou sob outras premissas, e a mitigação desenhada
> para exatamente esse caso (o lock com TTL) continua deferida — **na mesma story**, na linha 423,
> com a condição *"se o risco D6 se materializar"*.
>
> Não é erro de raciocínio do `@sm`: é uma consequência que fica fora de campo quando se olha o
> problema pelo eixo "PR-A contamina PR-B". Mas é decisão de dono do produto, não `[AUTO-DECISION]`
> de story — porque muda o perfil de risco de uma decisão travada do épico.
>
> **Some-se um bloqueio de executabilidade barato: o desenho não roda como escrito** (falta
> `fetch-depth: 0`).

---

## 1. Correção 1 — verificada rodando. Passa.

Ordem real das colunas, medida no próprio repositório:

```
$ git diff --numstat HEAD~1 HEAD
27      3       .claude/CLAUDE.md          ← campo1=adições  campo2=deleções  campo3=caminho
```

Régua velha (`$3`) contra régua nova (`$2`), nas três condições:

| Entrada | Significado | **VELHA `$3 != 0`** | **NOVA `$2 != 0`** |
|---|---|---|---|
| `12⇥0⇥.github/workflows/ci.yml` | tocou, **sem** deletar → deve ficar verde | **exit 1** ❌ | **exit 0** ✅ |
| `12⇥7⇥.github/workflows/ci.yml` | deletou 7 linhas → deve acender | exit 1 | **exit 1** ✅ |
| *(saída vazia)* | arquivo intocado → deve ficar verde | exit 0 | **exit 0** ✅ |

A régua nova está correta nos três estados, **incluindo o caso de saída vazia** — que era o meu
achado T1 da Rodada 1, agora resolvido e com o motivo explicado no comentário (`awk` sem linhas de
entrada nunca executa o corpo do padrão). Mutação nomeada e correta.

### Uma correção à caracterização, que muda o tipo do defeito (→ F2)

A story diz, em dois lugares (Change Log e o texto da Correção 1), que é *"a terceira régua desta
série que **ficaria verde** sem medir"*. **Medido: a régua velha ficava VERMELHA, não verde** — ela
sai `1` sempre que o arquivo é tocado, inclusive quando nada foi deletado. O próprio texto da
correção diz isso corretamente logo abaixo (*"a v1.0 nunca teria ficado verde nem no caso
correto"*), então a story se contradiz.

A distinção não é cosmética, porque o modo de falha é outro: régua sempre-verde **absolve em
silêncio**; régua sempre-vermelha **é descartada por quem a roda** — e o descarte ("essa aí sempre
falha, ignora") é a falha. Remédio diferente, instinto diferente. Corrigir a frase.

### E a origem do bug é minha

`git diff --numstat` emite `<adições> <deleções> <caminho>`. **Eu escrevi "3ª coluna (deletions)"**
na correção C4 da Rodada 1 deste parecer e repeti em duas rodadas seguintes. O `@sm` implementou a
minha especificação. **Quarto erro meu nesta série, mesma família:** eu prescrevi uma régua sem
rodá-la. O CodeRabbit pegou; o `@sm` foi além no diagnóstico. Registrado.

---

## 2. Correção 2 — o defeito e o mecanismo estão certos. O efeito colateral é que não foi pesado.

### O que a correção acerta

Os dois modos de falha estão bem nomeados (falso-verde por PR abandonado; falso-vermelho por
deriva), e o reset-ao-estado-da-base **fecha os dois**. Tracei a mecânica e ela é sólida:

1. checkout de `origin/<base_ref>` + `reset:testdb --confirmar` → banco só com migrations da base,
   ledger populado com `via='reset'`;
2. checkout do `HEAD` do PR por cima → a árvore ganha as migrations novas da branch;
3. `db:apply` → encontra exatamente as novas como `PENDENTE`.

**Propriedade emergente que ninguém nomeou e vale documentar:** se o PR **editar** uma migration já
existente, o `sha256` do arquivo diverge do que o reset gravou a partir da base ⇒ `db:status` marca
`ALTERADA-APÓS-APLICAR` ⇒ `db:apply` sai `1`. Isto é **acerto**, não falso-vermelho — é literalmente
o caso que o ledger existe para pegar. Mas alguém vai bater nisso e achar que é bug; merece uma
linha na AC4.

### 🔴 B1 — o efeito colateral: o job destrói o banco de `pnpm dev`, várias vezes por dia

O banco de teste é **um só** (`trifold-crm-dev`), e a decisão travada **D6 do épico** é, textualmente,
*"compartilhar o `trifold-crm-dev` entre dev local e reset"*. A story usa D6 corretamente para
**descartar** a opção "banco por PR" (linha 291). Mas não aplica a mesma lente à opção escolhida:

**`pnpm reset:testdb --confirmar` faz `DROP SCHEMA public CASCADE`.** Rodá-lo no CI, no início de
cada execução do job, significa **destruir automaticamente o banco em que os desenvolvedores estão
rodando `pnpm dev`** — que é exatamente o default que a Fatia A acabou de instituir.

Frequência, medida neste repositório:

```
merges na main analisados: 23  |  tocaram supabase/migrations/: 16   (70%)
PRs abertos simultâneos em 2026-08-29: 12+
```

Com o job rodando em todo `pull_request` (e a cada push no PR), são **dezenas de destruições por
dia** do banco de desenvolvimento compartilhado.

**O que torna isto bloqueante, e não uma ressalva:** a mitigação desenhada para exatamente este
cenário — *"lock com TTL: recusa se `.tmp/testdb-em-uso` foi tocado nos últimos 30 min; `pnpm dev`
toca no boot"* — **continua deferida nesta mesma story**, linha 423, com a condição literal
*"se o risco D6 se materializar"*. A Correção 2 **é** o evento que materializa o risco. A story
defere a mitigação e institui a causa, no mesmo documento.

D6 foi aceita contemplando **um humano** rodando o reset conscientemente, com as mitigações da
Fatia A (dry-run por padrão, confirmação informativa) — que são todas anti-acidente-humano e
**nenhuma delas alcança um bot com `--confirmar` no YAML**. Mudar isso para "um bot reseta 16-24×
por dia" é alteração material do perfil de risco de uma decisão travada do épico. **Isso é decisão
do dono do produto, não `[AUTO-DECISION]` de story** — e é a mesma régua de autoridade que o `@sm`
aplicou corretamente ao rejeitar "banco por PR".

**Caminhos possíveis (a escolha é do dono do produto, não minha):**

| | Caminho | Custo | Fecha B1? |
|---|---|---|---|
| a | **Des-deferir o lock com TTL** (item 5 do Passo 6) e o CI o respeita | pequeno; já desenhado no plano | Sim, mas cria buraco de cobertura: o job **pula** quando há dev ativo — e pular precisa ser audível |
| b | **Um segundo projeto Supabase só para CI** | reabre D6 explicitamente, com o dono do produto | Sim, integralmente — é o que a `900-3` original previa como "terceiro projeto" |
| c | **Opção 5 abaixo** (aplicar em transação e sempre `ROLLBACK`) | quase zero | Sim — nada é destruído nem persistido |
| d | **Aceitar**, com D6 reaberta e re-registrada pelo dono do produto | zero técnico | Não fecha; assume conscientemente |

### 🔴 B2 — o desenho não é executável como escrito: falta `fetch-depth: 0`

Duas partes da AC4 exigem histórico que um checkout raso não tem:

- `git diff --numstat origin/main...HEAD` (precisa do merge-base);
- `checkout de origin/<base_ref>` (precisa da ref base fetchada).

`actions/checkout@v4` usa **`fetch-depth: 1`** por padrão. A story especifica os passos (Task 4.2)
mas **não declara `fetch-depth: 0`** em lugar nenhum — `grep` por `fetch-depth` na story: zero
ocorrências.

**O precedente está no mesmo arquivo que a AC4 manda editar**, com um comentário que descreve este
exato modo de falha:

```yaml
# .github/workflows/ci.yml:115-119  (job tenancy-gate)
- uses: actions/checkout@v4
  with:
    # R9 compara as migrations deste PR com a base — precisa do histórico, não de um
    # checkout raso, senão a regra se abstém em silêncio e ninguém nota.
    fetch-depth: 0
```

*"Se abstém em silêncio e ninguém nota"* — é literalmente o desfecho aqui. Correção de uma linha,
mas sem ela o desenho não roda.

### A quinta opção que faltou — e uma ideia minha que a minha própria medição derrubou

**Opção 5 — aplicar dentro de transação explícita, com `ROLLBACK` sempre.** Em vez de reconstruir o
banco, envolver as migrations novas do PR em `BEGIN; … ; ROLLBACK;` num único POST à Management API.
Propriedades: valida o SQL **contra o schema real**; **nada persiste**, então os dois modos de falha
da Correção 2 ficam fechados *por construção* (não há estado a herdar); **não destrói o banco de
dev** (fecha B1); custa segundos em vez de 456,6s; e dispensa o `concurrency`, porque não há escrita
a serializar.
*Limitações honestas:* não exercita o caminho de **escrita no ledger** do `db:apply` — que é
justamente o código que a AC2 cria e que este job deveria exercitar; e `CREATE INDEX CONCURRENTLY`
não roda em transação (hoje: 4 arquivos `_remote_only`, todos pré-existentes — uma migration **nova**
de PR com `CONCURRENTLY` falharia, o que aliás é o sinal correto neste repositório).
Não digo que supera a escolhida; digo que **pertencia à tabela**, e é a saída natural se B1 for
resolvido por (c).

**E uma que eu ia recomendar e não vou, porque medi:** filtro `paths: supabase/migrations/**` para
não pagar 456,6s em PR que não mexe em migration. Medição: **16 de 23 merges (70%) tocam
`supabase/migrations/`**. O filtro pouparia ~30% das execuções — economia real, mas longe de
resolver o custo. Registro como melhoria menor, não como resposta.

### 🟡 F4 — um desconhecido que eu **não** vou afirmar

A semântica do `concurrency` do GitHub Actions com `cancel-in-progress: false` quando **três ou
mais** execuções entram no mesmo grupo (a pendente é cancelada pela mais nova? a fila cresce?)
decide se, sob carga, o job **roda para todos os PRs ou silenciosamente deixa de rodar para a
maioria**. Com 12+ PRs abertos e 7,6 min por execução, isso não é hipotético.

**Depois de quatro erros meus nesta série, todos por inferir comportamento de ferramenta de
terceiro, não vou afirmar como isso funciona.** Precisa ser verificado antes do merge.

Independentemente da resposta, há uma mitigação **correta sob qualquer semântica**, e essa eu
recomendo: o passo de comentário no PR roda com `if: always()` e, quando o passo de apply não
executou, comenta **"não executou"** em vez de silêncio. Job não-bloqueante que some sem avisar é o
pior dos mundos — e o cabeçalho do próprio `ci.yml` já diz isso por escrito.

---

## 3. Remedições — todas conferidas

| Alegação | Medido por mim | ✓ |
|---|---|---|
| `245` livre (varredura de todas as refs, com `fetch --prune`) | maior prefixo = `244` | ✅ |
| **267** arquivos de migration | `ls supabase/migrations/*.sql \| wc -l` → **267** | ✅ |
| **22** prefixos duplicados | `uniq -d` → **22** | ✅ |
| Reset em **456,6s** | herdado do Dev Agent Record da Fatia A (não re-executado) | ✅ (fonte citada) |
| `FALHAS_CONHECIDAS` com **4** entradas | **4** em `reset-tenancy-testdb.ts` | ✅ |
| `236`/`237` aplicam e **não** entram em `FALHAS_CONHECIDAS` | as duas estão em **`ASSERCOES`**, não em `FALHAS_CONHECIDAS` | ✅ |

Bônus verificado: o código do `ASSERCOES` traz os **dois predicados ancorados por `id`** exatamente
como a C3 pedia, **e** carrega a ressalva do S10 no comentário (*"vermelho aqui pode ser efeito
UPSTREAM… cheque primeiro se a `011` aplicou"*). O achado sobreviveu da prosa até o código.

---

## 4. A lição da Fatia A — incorporada, mas no lugar errado (→ F3)

A instrução existe e está **certa**:

> *"Qualquer teste desta fatia que reuse `db-env.ts`/`supabase-refs.ts` deve usar âncoras literais
> escritas à mão (o ref de produção como string literal no teste, não importado…)"*

E `packages/shared/src/constants/supabase-refs.ts` existe mesmo (entregue pela Fatia A), com um
cabeçalho que explica por que a fonte única foi necessária — e que a fonte única foi justamente o
que tirou o teste da posição de independência.

**Mas ela mora só em Dev Notes** (linhas 467-477). Não está em nenhuma AC, nem em nenhuma Task. A
fatia declara "sem suíte Vitest nova", então a regra é condicional — e o `@dev` provavelmente
escreverá algum teste para `db-status.ts`/`db-apply.ts`, que importam `db-env.ts`. Aí nada a prende.

Dev Notes é onde o `@dev` lê contexto, então **não é "só prosa"** — mas não é verificável no gate.
**Promover para uma linha na AC2** (onde `db:status`/`db:apply` são especificados) ou um checkbox na
Task 2.3. Custo: uma linha.

---

## 5. Correções

### Bloqueantes

| # | Onde | O quê |
|---|---|---|
| **B1** | AC4 (desenho) | O reset no CI destrói o banco de `pnpm dev`, 16-24×/dia, materializando o risco D6 cuja mitigação (lock com TTL) a própria story defere na linha 423. **Escalar ao dono do produto** com os 4 caminhos da §2. Não é `[AUTO-DECISION]`. |
| **B2** | AC4 / Task 4.2 | Declarar **`fetch-depth: 0`** no checkout do job novo — sem isso, nem a régua `origin/main...HEAD` nem o `checkout origin/<base_ref>` funcionam. Precedente e comentário já existem no mesmo arquivo (job `tenancy-gate`, linhas 115-119). |

### Recomendadas

| # | Onde | O quê |
|---|---|---|
| **F1** | AC4 | O bloco ```bash``` da linha ~235 ainda traz a régua **errada** sob o rótulo *"Substituída por:"*, e só o bullet seguinte a desmente. Quem copiar o primeiro bloco copia o bug. Marcar como `❌ VERSÃO ERRADA — não copiar` ou remover. |
| **F2** | AC4 / Change Log | Trocar *"ficaria verde sem medir"* por *"ficava vermelha sempre que o arquivo era tocado"* — medido. O modo de falha é o descarte, não a absolvição. |
| **F3** | AC2 / Task 2.3 | Promover a regra das âncoras literais de Dev Notes para AC/Task. |
| **F4** | AC4 | Verificar a semântica do `concurrency` sob 3+ execuções **antes do merge**; independente do resultado, exigir comentário no PR com `if: always()` dizendo "não executou" quando for o caso. |
| **F5** | AC4 | Documentar que PR que **edita** migration existente cai em `ALTERADA-APÓS-APLICAR` e derruba o job — é acerto, e alguém vai achar que é bug. |
| **F6** | AC4 | Registrar a **quinta opção** (transação + `ROLLBACK` sempre) na tabela, com a limitação nomeada (não exercita a escrita no ledger). É a saída natural se B1 for resolvido por (c). |

---

## 6. Situação

| Item | Estado |
|---|---|
| Correção 1 (régua `--numstat`) | ✅ **verificada rodando** — correta nos três estados |
| Remedições (245 / 267 / 22 / 456,6s / `FALHAS_CONHECIDAS`) | ✅ **todas conferidas** |
| Lição da Fatia A (âncoras literais) | 🟡 incorporada, promover para AC (F3) |
| Correção 2 (desenho do job) | 🔴 **B1 + B2** — mecanismo certo, efeito colateral não pesado e não executável como escrito |
| Conteúdo (ACs 1, 2, 3, 5) | ✅ GO 8/10 da Rodada 1, de pé |

**A story não volta para o começo.** B2 é uma linha. B1 é uma pergunta ao dono do produto que já
está formulada, com quatro caminhos e o custo de cada um. Feitas as duas, é GO — e não preciso
revalidar o conteúdo de novo.

*— Pax, equilibrando prioridades 🎯*

---
---

# RODADA 3 — GO focado no redesenho da AC4 (`900-3c` v0.4)

- **Story:** v0.4 · 694 linhas · 5 ACs / 5 Tasks
- **Escopo:** só o desenho novo do job de CI e os 7 pontos levantados. O GO de conteúdo 8/10 da
  Rodada 1 e a verificação da régua `--numstat` da Rodada 2 permanecem de pé.
- **Data:** 2026-08-29 · **Validador:** @po (Pax)

## Veredito

> ## ✅ GO CONDICIONAL — 2 bullets a acrescentar, sem revalidação
>
> **O redesenho está certo, e é melhor do que qualquer uma das quatro opções da tabela anterior —
> inclusive melhor do que a quinta que eu propus.** Tirar a escrita não mitigou o B1: **dissolveu**
> o problema. Mesma coisa com o F4. Isso é a forma boa de fechar um achado.
>
> Restam duas lacunas, e as duas são de **poder discriminante do job novo** — nenhuma delas
> reintroduz escrita, nenhuma exige redesenho. São dois bullets na AC4. Feitos, vai direto ao @dev.

---

## 1. B1 morreu? **Sim, no que importa — com um qualificador que a AC deve escrever**

Percorri os caminhos de escrita, inclusive os indiretos:

| Caminho | No desenho novo |
|---|---|
| `pnpm db:apply` | **removido** do job |
| `pnpm reset:testdb --confirmar` (`DROP SCHEMA CASCADE`) | **removido** do job |
| `--confirmar` em qualquer forma | **ausente** |
| `db:status` → banco | **`SELECT` apenas** — usa o `runSql` extraído (POST à Management API), e o SQL é leitura |
| `concurrency` de grupo fixo | **removido** |

**Nenhuma escrita e nenhuma destruição no banco. O B1 está morto.**

**Um qualificador, medido (→ G1):** "leitura pura" é verdade sobre o **banco**, não sobre a árvore.
A AC1 especifica, na linha 145, que `docs/audits/migrations-aplicadas.json` é *"regenerado por
`pnpm db:status`"* — arquivo **rastreado**. Rodar `db:status` no CI suja a working tree do runner.
Inofensivo hoje (o job não commita, e nada checa árvore limpa), mas é uma afirmação imprecisa numa
AC cuja premissa inteira é "só lê". A AC deve dizer: *o job não commita nem falha por causa da
árvore suja*, ou `db:status` ganha um modo que não regenera o espelho. Uma linha.

## 2. F4 e o `concurrency` — confere, e ele **dissolveu** em vez de ser mitigado

Sem escrita, não há estado compartilhado a corromper; sem estado a proteger, não há grupo de
concorrência; sem grupo, a semântica de cancelamento de execução pendente — o desconhecido que eu me
recusei a afirmar na Rodada 2 — **deixa de existir como pergunta**. Não é que a resposta seja
favorável: a pergunta não se aplica mais.

Confirmo também que não sobrou recurso compartilhado escondido: `db:status` são poucas queries à
Management API por execução, muito abaixo do que o reset (267 POSTs) impunha.

## 3. B2 (`fetch-depth: 0`) — **ainda necessário**, e por dois comandos, não um

Confirmado. As duas travessias precisam de histórico:

```bash
git diff --numstat  origin/main...HEAD          -- .github/workflows/ci.yml     # régua de não-reescrita
git diff --name-only origin/<base_ref>...HEAD   -- supabase/migrations/         # migrations do PR
```

Testei a segunda contra merges reais:

```
$ git diff --name-only 563e639f...eb1e45de -- supabase/migrations/     # PR #522
supabase/migrations/244_org_admin_invite_email.sql                     ← acha

$ git diff --name-only eb1e45de...77f225d1 -- supabase/migrations/     # PR #524 (Fatia A)
(vazio)                                                                ← corretamente vazio
```

Está explícito na AC4 e na Task 4.1, citando o precedente do `tenancy-gate` (`ci.yml:115-119`) com o
mesmo comentário de justificativa. Bem resolvido.

**E repare no que o teste acima também mostra — é a raiz do §6:** saída vazia com `exit 0`. "Este PR
não traz migration" e "não consegui resolver as refs" produzem **exatamente o mesmo resultado**.

## 4. Caracterização da régua — corrigida, e do jeito certo

O texto vivo (linhas 293 e 300) diz agora o que eu medi: *"não ficava verde sem medir — ficava
vermelha sempre que o arquivo era tocado"*, com a distinção escrita por extenso: *"uma régua sempre
vermelha não absolve nada em silêncio, ela é descartada por quem a roda, e é esse descarte que é a
falha real"*.

A frase errada sobrevive **só** na entrada `0.3` do Change Log (linha 671) — e isso está **certo**:
Change Log é registro histórico, não se reescreve; a entrada `0.4` o corrige nominalmente
(*"como o Change Log 0.3 registrou, incorretamente"*). É a forma correta de tratar um erro
registrado. Sem contradição interna viva.

A atribuição também está honesta: a v0.4 registra que o erro veio da minha especificação, repetida
sem correção em duas rodadas. Confirmo — foi minha.

**Fica um resíduo (→ G4, já era o F1 da Rodada 2, não aplicado):** o bloco ```bash``` da linha ~283
ainda traz o comando **errado** (`# 3ª coluna (deletions) == 0`) sob o rótulo *"Substituída por:"*,
e só o bullet seguinte o desmente. Quem copiar o primeiro bloco copia o bug — que é literalmente
como o bug entrou da primeira vez. Marcar `❌ VERSÃO ERRADA — não copiar` ou remover.

## 5. Âncoras literais — agora prendem

Saiu do Dev Notes e virou:
- **bullet na AC2** (linhas 203-209), com o raciocínio: *"de-duplicar a âncora do teste junto tira
  do teste a independência de errar diferente do código — foi assim que o teste do banner ficou
  mudo exatamente sobre o ref de produção"*;
- **checkbox na Task 2.3** (linhas 412-415).

E a redação da AC2 vai além do que eu pedi: estende a regra à *"lógica de comparação de migrations
da AC4"*, que é justamente o código novo deste redesenho. Fechado.

---

## 6. 🔴 G2 — o job pode nunca acender, e "não acendeu" é indistinguível de "não rodou"

Esta era a preocupação do coordenador, e ela procede. A verificação da AC4 nomeia **os dois
sentidos** (PR com migration pendente → comenta; PR limpo → sem aviso), o que é melhor do que eu
esperava. O problema está na cláusula final do caso limpo:

> *"sem aviso (comentário atualizado para o estado limpo, **ou nenhum comentário** — decisão de
> implementação, desde que não acumule ruído)"*

Se o `@dev` escolher "nenhum comentário", estes cinco estados ficam **visualmente idênticos**:

| Estado | Comentário |
|---|---|
| PR limpo (migration já aplicada no teste) | nenhum |
| PR sem migration nenhuma | nenhum |
| `fetch-depth` errado ⇒ `git diff --name-only` vazio | nenhum |
| `db:status` saiu `1` (tabela do ledger ausente no teste) + `continue-on-error` | nenhum |
| Parsing do relatório mudou de formato ⇒ zero casamentos | nenhum |

Os três últimos são falhas. **Um aviso que nunca aparece é indistinguível de um aviso que não era
necessário** — a formulação do coordenador é exata, e o próprio `ci.yml` já tem essa lição escrita
no comentário do `tenancy-gate` (*"senão a regra se abstém em silêncio e ninguém nota"*).

**G2 (obrigatória):** remover a alternativa. O job **sempre** comenta, atualizando o comentário
existente in-place (padrão do `tenancy-gate`, que a AC já manda reusar), com estado explícito:

- `⚠️ Este PR traz N migration(s) não aplicada(s) no teste: …`
- `✅ Nenhuma migration deste PR está pendente no banco de teste.`
- `⛔ Não foi possível verificar (motivo).` ← para os três casos de falha

Com isso, **ausência de comentário passa a significar uma coisa só: o job não rodou** — e isso é
visível. Custo: um `else`. O passo de comentário roda com `if: always()`.

### G3 — o controle positivo não tem janela nomeada (obrigatória)

A verificação diz *"PR que adiciona `246_algo.sql` e não aplica no teste → comentário"*. É um PR
hipotético. **O controle positivo real está de graça nesta própria story:** ela adiciona a migration
`245`. Se o job rodar no PR desta story **antes** da Task 1.4 aplicá-la no teste, o comentário deve
nascer nomeando `245_registro_de_migrations.sql`.

Mas a ordem das Tasks fecha a janela: a Task 1.4 aplica a `245` em teste **e** em produção, e a
Task 4 vem depois. Quando o job existir, a `245` já estará aplicada ⇒ caso limpo ⇒ **o caso positivo
nunca é exercido nesta story**, e a primeira vez que alguém descobre se o job funciona é num PR
futuro qualquer.

**Nomear a janela** (mesma classe do meu T3 da Rodada 1): capturar o comentário do job **antes** da
aplicação da Task 1.4, ou criar um arquivo de migration descartável só para a prova e removê-lo.
Colar o comentário produzido no Dev Agent Record.

---

## 7. 🔴 G5 — algo se perdeu no encolhimento, e não era coisa que dependia da escrita

Comparei v0.3 → v0.4. O que saiu foi: reset-antes, tabela de 4 opções, `concurrency`, 456,6s, e a
mutação dos dois PRs em sequência (substituída pela dos dois PRs em paralelo). **Tudo isso dependia
da escrita — a poda está correta.**

**Exceto uma coisa.** O `db:status` classifica cada arquivo em quatro estados (AC2, linha 188):

```
aplicada · PENDENTE · ALTERADA-APÓS-APLICAR · ÓRFÃ-no-banco
```

O job novo comenta **só sobre `PENDENTE`** (AC4: *"Se algum desses arquivos aparecer como `PENDENTE`…"*).

Consequência: **um PR que EDITA uma migration já aplicada não gera aviso nenhum.** Esse arquivo sai
como `ALTERADA-APÓS-APLICAR`, não como `PENDENTE` — o job fica mudo. E essa é a classe de PR mais
perigosa das quatro: alterar migration que já rodou em produção é exatamente o caso que o `sha256`
do ledger existe para pegar, e que a AC2 trata com severidade máxima (bloqueia o `db:apply` inteiro,
exit 1).

No desenho v0.3, esse PR derrubava o job (via `db:apply`). No v0.4, passa em silêncio. **E detectar
`ALTERADA-APÓS-APLICAR` é leitura pura** — não é algo que precisou sair junto com a escrita; saiu
por arrasto.

**G5 (obrigatória):** o job comenta sobre os arquivos do PR que aparecerem como **`PENDENTE` ou
`ALTERADA-APÓS-APLICAR`**, com textos distintos — o segundo mais severo (*"este PR altera uma
migration já aplicada no teste; o `db:apply` vai recusar"*). Uma condição a mais no mesmo cruzamento
de listas.

*(`ÓRFÃ-no-banco` fica de fora com razão: é registro sem arquivo, não tem como ser um arquivo que o
PR traz.)*

---

## 8. A decisão em si — endosso, e ela é melhor que a minha quinta opção

Registro o que o coordenador pediu, e mais uma coisa.

**O B1 provocou esta correção.** A medição — 16 de 23 merges tocando `supabase/migrations/`, 12+ PRs
abertos, dezenas de destruições diárias do banco de dev — foi o que mostrou que o custo não pagava a
garantia. Mas o mérito da resposta **não é meu**: eu apresentei quatro caminhos de mitigação e o
dono do produto não escolheu nenhum. Ele reenquadrou o problema e perguntou por que o job escrevia,
e a resposta era "por nada que o fluxo manual já não desse".

Vale contrastar com a **quinta opção que eu propus** (aplicar em transação com `ROLLBACK` sempre).
Ela também eliminava a destruição — mas mantinha o job escrevendo (e revertendo), mantinha a
complexidade, e comprava uma garantia que, como agora ficou claro, ninguém tinha pedido. **Eu estava
otimizando o mecanismo errado.** A decisão do dono do produto é estritamente melhor, e a lição que
ele registrou no Change Log é a certa:

> *um job automático de escrita foi acrescentado para reforçar uma garantia que o processo manual já
> dava, e pagou por isso com um efeito colateral que quase custou o banco de desenvolvimento de
> todos.*

Acrescento o corolário que vale para as próximas: **quando um achado gera uma tabela de mitigações,
vale uma passada perguntando se o mecanismo que exige mitigação era necessário.** Quatro opções de
mitigação são um sinal de que o problema está no mecanismo, não na escolha entre elas.

---

## 9. Correções

### Obrigatórias — 2 bullets, sem revalidação minha

| # | Onde | O quê |
|---|---|---|
| **G2** | AC4 (verificação) + Task 4.3 | Remover a alternativa "ou nenhum comentário". O job **sempre** comenta (update in-place, `if: always()`) com três estados explícitos: pendente / limpo / **não foi possível verificar**. Sem isso, cinco estados — três deles falhas — são visualmente idênticos, e ausência de comentário não significa nada. |
| **G5** | AC4 + Task 4.2 | O aviso cobre `PENDENTE` **e `ALTERADA-APÓS-APLICAR`**, com textos distintos. Editar migration já aplicada é a classe de PR mais perigosa, é detectável só com leitura, e hoje sai em silêncio — perdida por arrasto no encolhimento, não por depender da escrita. |

### Recomendadas

| # | Onde | O quê |
|---|---|---|
| **G1** | AC4 | Qualificar "leitura pura": vale para o **banco**. `db:status` regenera `docs/audits/migrations-aplicadas.json` (AC1, linha 145), arquivo rastreado — dizer que o job não commita nem falha por árvore suja. |
| **G3** | AC4 / Task 4 | Nomear a janela do controle positivo: capturar o comentário sobre a `245` **antes** da Task 1.4 aplicá-la, ou usar migration descartável. Colar o comentário no Dev Agent Record. Hoje o caso positivo não é exercido nesta story. |
| **G4** | AC4 (~linha 283) | O bloco ```bash``` com a régua **errada** segue vivo sob *"Substituída por:"*. Marcar `❌ VERSÃO ERRADA — não copiar` ou remover — foi assim que o bug entrou da primeira vez. |

---

## 10. Situação

| Ponto | Estado |
|---|---|
| 1. B1 morreu (escrita/destruição no banco) | ✅ **sim** — nenhum caminho, nem indireto · qualificador G1 |
| 2. F4 / `concurrency` saem | ✅ **confere** — dissolveu, não foi mitigado |
| 3. B2 (`fetch-depth: 0`) ainda necessário | ✅ **sim**, por dois comandos — explícito na AC e na Task |
| 4. Caracterização da régua corrigida | ✅ **sim**, sem contradição viva · resíduo G4 |
| 5. Âncoras literais prendem o @dev | ✅ **sim** — AC2 + Task 2.3, com escopo estendido à AC4 |
| 6. Poder discriminante do job | 🔴 **G2 + G3** |
| 7. Nada se perdeu no encolhimento | 🔴 **G5** — `ALTERADA-APÓS-APLICAR` saiu por arrasto |
| Conteúdo (ACs 1, 2, 3, 5) | ✅ GO 8/10 da Rodada 1, de pé |

**GO condicional.** G2 e G5 são dois bullets na AC4 e duas linhas nas Tasks 4.2/4.3. Nenhum
reintroduz escrita. Feitos, a story vai ao @dev sem passar por mim de novo.

*— Pax, equilibrando prioridades 🎯*
