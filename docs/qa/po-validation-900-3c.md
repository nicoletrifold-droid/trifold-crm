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
