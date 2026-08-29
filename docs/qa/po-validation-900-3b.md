# Validação PO — Linhagem 900-3b

> **Este arquivo tem duas rodadas.**
> **Rodada 1** (abaixo) validou a story única `900-3b` v0.2 — veredito **NO-GO 6/10**, 9 correções
> obrigatórias e a proposta de split. É o documento que as duas stories citam como `[Source:]`.
> **Rodada 2** (no fim do arquivo) revalida a **Fatia A** (`900-3b` v1.0) — veredito
> **GO condicional 8/10**. A Fatia B tem parecer próprio: `docs/qa/po-validation-900-3c.md`.

---

# Rodada 1 — Story 900-3b v0.2 (arquivo único, antes do split)

- **Story:** `docs/stories/900-3b-ambiente-teste-e-promocao.story.md` (v0.2)
- **Plano de origem:** plano de 3 ondas aprovado pelo dono do produto — Onda 1, Passos 0 a 9
- **Branch:** `story/900-3b-ambiente-teste-e-promocao` (a partir de `origin/main` `563e639f`)
- **Validador:** @po (Pax) · **Data:** 2026-08-29
- **Modo:** YOLO, com execução real de toda AC-comando contra `HEAD`

---

## Veredito

> ## ❌ NO-GO — Implementation Readiness 6/10 — Confiança: Média-Alta
>
> O **conteúdo** da story está entre os melhores do epic: rastreabilidade por `[Source:]` em
> todas as ACs, baselines remedidos e datados, divergências contra o plano documentadas em vez de
> escondidas, disciplina de segredo verificada, seção de deferidos nomeada, e a autocorreção do
> número da migration pega ainda no draft.
>
> O que reprova são **réguas**, não fatos. Rodei toda AC-comando contra `HEAD` e encontrei **8
> defeitos bloqueantes**: duas réguas que já nascem vermelhas por motivo fora do escopo, uma que é
> impossível de ficar verde por construção do Next.js, uma asserção que **falha numa execução
> saudável**, um par de ACs que se contradizem sobre exit code, um "controle positivo" que executa
> um script **destrutivo contra produção**, uma régua sem carrasco nenhum, e uma varredura que lê
> um índice possivelmente velho.
>
> Todas as correções são **reescrita de AC pelo @sm** — nenhuma exige redesenho. Some-se a isso o
> fatiamento autorizado pelo dono do produto, que devolve a story ao @sm de qualquer forma.

---

## 1. Fatiamento — recomendado, mas **não no ponto proposto**

O @sm marcou XL e a marcação está correta: 10 ACs, 10 tasks, ~30 arquivos tocados, uma migration,
DDL em produção, um job de CI. **Recomendo fatiar.** Mas o corte natural não é "0-3 / 4-8".

### 1.1 O corte proposto tem uma dependência na direção errada

**Achado:** a AC10 está inteira na Fatia A, e um dos seus itens depende da Fatia B.

A AC10 manda reescrever `docs/deploy-flow.md` com *"comando de promoção = `pnpm db:status`/`pnpm
db:apply` (Task 6)"* — comandos que só nascem na Fatia B — e **deletar `scripts/sync-schema.sh`**,
que é hoje a única coisa no repo que se parece com ferramenta de promoção. Se A fechar sozinha:

- `deploy-flow.md` passa a documentar dois comandos que não existem;
- o repo fica sem nenhuma ferramenta de promoção, documentada ou não.

Isto é **literalmente o modo de falha que a própria story nomeia** para justificar puxar
`scripts/README.md` para dentro da AC2: *"se este item ficar para um PR seguinte, é o documento
novo que vira a mentira"*. A regra vale nos dois sentidos.

### 1.2 O corte proposto deixa o risco aceito D6 sem a mitigação dele

A Fatia A faz `pnpm dev` apontar para o `trifold-crm-dev`. O endurecimento do reset (dry-run por
padrão, confirmação que carrega informação, allowlist no lugar da denylist) está no Passo 6, isto é,
na Fatia B. **Entre A e B, o banco onde todo mundo passa a desenvolver é destruível por um
`npx tsx scripts/reset-tenancy-testdb.ts` sem flag nenhuma** — porque o script hoje não tem
dry-run. A decisão travada D6 ("compartilhar o `trifold-crm-dev` entre dev local e reset") aceita
esse risco *com* as mitigações do Passo 6; o corte 0-3/4-8 entrega o risco e adia a mitigação.

Repare que a dependência da AC7 é a **AC3** (a allowlist), que já está na Fatia A. Não há nada no
endurecimento do reset que precise do ledger, exceto o item "popular `trifold_migrations_aplicadas`
ao final".

### 1.3 O corte que recomendo — a fronteira é **quem escreve DDL em produção**

| | **Fatia A — `900-3b` · Ambiente** | **Fatia B — `900-3c` · Promoção** |
|---|---|---|
| **ACs** | AC1, AC2, AC3, AC4, **AC7 (itens 1-3 e 5)**, **AC8**, **AC10 parcial** | **AC5, AC6, AC7 (item 4), AC9, AC10 parcial** |
| **Tasks** | 1, 2, 3, 4, **7.1/7.2/7.3/7.5/7.6**, **8**, **10.2/10.3** | **5, 6, 7.4, 9, 10.1/10.4** |
| **Cria migration?** | **Não** — zero disputa de número com o PR #522 | Sim (`245`, remedido depois do merge do #522) |
| **Toca produção?** | **Não** | Sim — DDL + backfill do ledger |
| **Executor** | @devops | @devops, com Task 5.1 (o arquivo `.sql`) no @dev |

**Repartição explícita da AC10** (é o único item que precisa de bisturi):

| Item da AC10 | Fatia | Por quê |
|---|---|---|
| `.claude/CLAUDE.md` linhas 385-387 | **A** | A linha 385 vira **falsa no instante** em que a Task 2 renomeia o arquivo. Não pode esperar. |
| `reference_ci_surface_trifold.md` (manchete) | **A** | Independente das duas fatias; barato, e já está pago. |
| `scripts/README.md` | **A** (já está dentro da AC2) | Mesmo argumento da 385. |
| `docs/deploy-flow.md` (reescrita) | **B** | Documenta `db:status`/`db:apply`, que só existem em B. |
| deletar `scripts/sync-schema.sh` | **B** | Só se apaga a ferramenta velha quando a nova existe. |

**Critério de saída da Fatia A:**
`pnpm dev` sobe contra `xnxvygyfyyyzwhiuoehz` (banner) · `pnpm dev:prod` sobe contra produção com
banner vermelho · os 7 scripts destrutivos recusam `producao` sem `TRIFOLD_ALLOW_PROD=1` · um ref
de produção **fictício** também é recusado (a diferença observável entre allowlist e denylist) ·
`supabase <cmd>` sem flag resolve para teste · `pnpm reset:testdb` sem flag **não apaga nada** ·
o banco de teste é reconstruído até o head atual pelo reset **que já existe** (900-3), e o
resultado real de `236`/`237` fica registrado no Dev Agent Record.

**Critério de saída da Fatia B:**
`trifold_migrations_aplicadas` existe e está populada nos dois ambientes, com runbook executado ·
`pnpm db:status` sai limpo contra teste e acusa `ALTERADA-APÓS-APLICAR` quando um byte muda ·
`pnpm db:apply` recusa `--yes` em produção e bloqueia em arquivo alterado · o job de CI comenta no
PR · `deploy-flow.md` descreve o fluxo que de fato existe e `sync-schema.sh` não existe mais.

### 1.4 Órfãs — verificação explícita, AC por AC

Percorri cada AC perguntando "ela mede algo que só existe na outra fatia?":

- AC1 → AC2: dependência **dentro de A**, direção certa (o `.example` só é rastreável depois do
  conserto do `.gitignore`). ✓
- AC3 → AC7: dependência **A → A** no corte recomendado. No corte proposto seria A → B, direção
  certa mas deixando o risco descoberto (§1.2). ✓
- AC5 → AC6 → AC9: cadeia inteira **dentro de B**. ✓
- AC7 item 4 (popular o ledger) → AC5: **é a única linha da AC7 que atravessa**. Por isso ela vai
  para B, e não a AC7 inteira. ✓
- AC8 → AC7: **dentro de A** no corte recomendado. A AC8 não toca o ledger; ela só precisa que o
  reset rode até o fim — e A precisa rodar o reset uma vez de qualquer jeito, para trazer o banco
  de teste ao head. As duas pegam carona na mesma execução. ✓
- AC10 → AC6: **a única na direção errada**, resolvida pela repartição da tabela acima. ✗→✓

**Uma consequência do corte que precisa estar escrita, não subentendida:** entre A e B não há
`db:apply`. Trazer o banco de teste ao head se faz rodando o `reset-tenancy-testdb.ts` que já
existe. Isso **precisa** entrar no `scripts/README.md` que a Fatia A já edita — senão o primeiro
desenvolvedor que pegar o novo default vai bater em erro de schema faltando e diagnosticar como
bug de código.

### 1.5 Se A ainda ficar grande

Ponto de corte adicional, **em terceira fatia e com handoff nomeado**, se o @devops medir que A não
cabe: a **Task 3.4** (segunda leva, 19 scripts que leem env de Supabase direto). O critério de saída
de A fala de segurança, e a segurança está toda na **primeira** leva (os 7 destrutivos). A segunda
leva é higiene. Não estou cortando aqui preventivamente — estou nomeando onde cortar se precisar.

---

## 2. Poder discriminante — AC por AC, com o comando rodado

Tudo abaixo foi **executado** contra `HEAD` em 2026-08-29, não lido.

### 🔴 C1 — AC2: a verificação do bundle é **impossível de ficar verde** (BLOQUEANTE)

A AC2 exige: *"`pnpm build` dentro de `packages/web` seguido de `grep -r xnxvy .next/static`
encontra o ref de **teste**"*.

**Isso não pode acontecer.** `next build` roda com `NODE_ENV=production`, e o Next carrega, nessa
ordem: `.env.production.local` → `.env.local` → `.env.production` → `.env`. **`.env.development`
não está nessa lista** — ele só é lido em modo development. Depois dos renames da própria AC2:

```
packages/web/.env.production.local  → mesclado em .env.producao.local   (fora da lista)
packages/web/.env.local             → renomeado para .env.producao.local (fora da lista)
packages/web/.env.production        → não existe
packages/web/.env                   → não existe (medido: só existe .env na raiz, que o Next não lê)
```

Resultado: o build fica **sem nenhuma variável de Supabase**. E não falha — medido:
`packages/web/src/lib/supabase/client.ts:5` usa `process.env.NEXT_PUBLIC_SUPABASE_URL!`
(non-null assertion, não o getter de `lib/env.ts` que lançaria). O build passa e **assa `undefined`
no bundle**. O `grep` por `xnxvy` não acha nada, e a AC fica vermelha numa implementação correta.

Note que o objetivo do plano — *"hoje um `pnpm build` local assa a URL de prod no bundle"* — **é
atingido**. O que está errado é o resultado esperado da régua.

**Correção obrigatória, com as duas metades:**
1. A régua que de fato mede o objetivo é o **controle negativo**:
   `grep -rc "dsopqkqjkmhytudaaolv" packages/web/.next/static` → **0**. Essa é executável e tem
   poder discriminante real (se o rename for esquecido, ela acende).
2. A story precisa **decidir** como o `pnpm build` local passa a ver o ambiente de teste, em vez de
   deixar o @dev descobrir na hora. Duas opções, ambas medidas:
   - criar `packages/web/.env` com os valores de **teste** (o Next carrega `.env` em **todos** os
     modos, na menor precedência — cobre dev e build de uma vez); ou
   - um script `"build:teste": "node --env-file=.env.teste ./node_modules/next/dist/bin/next build"`,
     mesmo mecanismo já escolhido para o `dev:prod`.

### 🔴 C2 — AC3: o "controle positivo" executa um script **destrutivo contra produção** (BLOQUEANTE)

A AC3 pede, como controle positivo:

```
TRIFOLD_ENV=producao TRIFOLD_ALLOW_PROD=1 npx tsx scripts/cleanup-duplicate-leads.ts
```

*"contra o ref real de produção deve **passar** da checagem de ambiente"*.

O script **não para na checagem de ambiente**. Ele passa dela e segue para o `DELETE`/`UPDATE` em
`leads` — a própria AC3 o classifica como destrutivo, na primeira linha da tabela dela. O controle
positivo, como escrito, é a instrução literal para rodar um script destrutivo em produção, dentro de
uma story cujo Scope OUT diz *"Qualquer alteração de comportamento em produção"*.

Este é o padrão `controle-positivo-engolido-por-precondição` na forma mais cara: o controle é
necessário (sem ele a AC só prova que a allowlist recusa tudo), mas o veículo escolhido é o errado.

**Correção obrigatória:** o controle positivo vive em `scripts/db-env.test.ts`, chamando
`resolverAmbiente({ escreve: true })` diretamente e afirmando que ela **retorna** o ref de produção
sob `TRIFOLD_ENV=producao TRIFOLD_ALLOW_PROD=1`. Se ainda se quiser um controle positivo em nível
de script, use um **somente-leitura** (`scripts/generate-schema-snapshot.ts`), nunca um da tabela
de destrutivos.

### 🔴 C3 — AC8: a asserção **reprova uma execução saudável** de `236` e é colinear em `237` (BLOQUEANTE)

A AC8 propõe **um** predicado para os **dois** arquivos:

```sql
EXISTS (SELECT 1 FROM kanban_stages WHERE slug = 'no-show'
        AND org_id = '00000000-0000-0000-0000-000000000001')
```

Li os três arquivos e tracei a sequência num banco reconstruído do zero:

1. `011_noshow_stage.sql` insere `…0009` com `slug='no-show'`, `name='No-Show'`, `type='no_show'`.
2. `236_noshow_etapa_propria.sql` §2.1 faz
   `update … set slug='atendimento' where id='…0009' and slug='no-show'` — num banco novo essa
   guarda **casa**, e o update **dispara**. §2.2 insere `…0011` com `slug='no-show-real'`.
3. Logo depois de `236`, **nenhuma linha tem `slug='no-show'`.** O predicato proposto é **FALSO**.
4. `237_slug_noshow_limpo.sql` renomeia `…0011` de `no-show-real` para `no-show` (o `NOT EXISTS`
   dele é verdadeiro justamente porque o `236` liberou o slug). Só **aí** o predicado vira verdadeiro.

**Consequência:** a asserção de `236` acende vermelho numa execução perfeitamente correta —
falso positivo garantido, e a saída provável é o @dev remover a asserção para o reset fechar.
E a asserção de `237`, além de correta, é **fraca**: ela não olha *qual* linha carrega o slug. Se o
`236` §2.1 não disparasse, `…0009` continuaria com `slug='no-show'` e o predicado passaria **sem que
o `237` tivesse feito nada**. Colinearidade com o `011`.

**Correção obrigatória — dois predicados, ancorados por `id`:**

```sql
-- após 236_noshow_etapa_propria.sql
EXISTS (SELECT 1 FROM kanban_stages WHERE id='00000000-0000-0000-0001-000000000011'
        AND slug='no-show-real' AND type='no_show')
AND EXISTS (SELECT 1 FROM kanban_stages WHERE id='00000000-0000-0000-0001-000000000009'
        AND slug='atendimento')

-- após 237_slug_noshow_limpo.sql
EXISTS (SELECT 1 FROM kanban_stages WHERE id='00000000-0000-0000-0001-000000000011'
        AND slug='no-show')
```

**Nota de fundo, que não muda a conclusão da AC8:** a premissa do plano — *"`236`/`237` são no-ops
guardados"* — é **falsa para um banco reconstruído do zero**: as guardas das duas casam e as duas
fazem trabalho. A premissa vale para uma *reexecução*, não para a primeira aplicação. A story deve
parar de reproduzir essa frase como fato de contexto. Mas a **conclusão da AC8 continua de pé**, e
por um motivo mais forte do que o que a story dá: a classificação depende do estado que `011` deixa,
e `011` está listado no `scripts/README.md` como um dos que falham por violação de FK sem a org
default semeada. Ou seja: continua sendo **medir, nunca pré-adicionar**.

### 🟢 AC8 — a proibição de pré-adicionar **é** detectável (o @sm acertou)

A pergunta do briefing: o AC torna o pré-adicionar detectável?

**Sim, e o mecanismo é a própria "verificação nos dois sentidos" da AC8.** Se alguém pré-adicionar
`236`/`237` ao `FALHAS_CONHECIDAS` e elas **rodarem com sucesso**, a regra "conhecida que parou de
falhar também sai `1`" faz o `reset:testdb` sair `1` **nomeando as duas**. O pré-adicionar não é
uma violação de processo torcendo para ser notada; é um estado que a máquina acusa.

Duas condições para isso valer, e as duas estão satisfeitas na ordem das tasks: a verificação nos
dois sentidos (8.2) é implementada **antes** da medição (8.4); e o teto de 6 entradas dá o segundo
carrasco. Registro isto como o ponto mais bem desenhado da story.

### 🔴 C4 — AC9/Task 9.3 citam uma AC **superada e já vermelha** (BLOQUEANTE)

A AC9 afirma: *"a `900-1` tem uma AC (AC8) que confere isso por `grep`; esta story precisa continuar
passando nela"*, e a Task 9.3 manda *"confirmar que a AC8 da `900-1` (grep de não-reescrita)
continua passando"*.

Medido:

```
$ grep -c "gate:tenancy\|tenancy" .github/workflows/ci.yml
6
```

A AC8 da `900-1` é, literalmente: *"`grep -c "gate:tenancy\|tenancy" .github/workflows/ci.yml`
retorna **0**"*. Ela **já está vermelha em `HEAD`** — e corretamente, porque a `900-2c` acrescentou o
job `tenancy-gate` depois, por desenho. A `900-1` está `InReview` com outra AC (a AC9) já
*"dispensada por obsolescência"*. Além disso, ela **não é** uma "AC de não-reescrita": ela verifica
ausência de referência a tenancy, não preservação do arquivo.

Uma task cujo enunciado é "confirmar que X continua passando" quando X está vermelho há semanas não
tem desfecho definido — e o desfecho barato é o @dev declarar que passou.

**Correção obrigatória:** trocar por uma régua de não-reescrita que seja **verde em `HEAD` e
vermelha se o arquivo for reescrito**:

```bash
git diff --numstat origin/main...HEAD -- .github/workflows/ci.yml   # 3ª coluna = arquivo; deletions == 0
grep -c "^  static:\|^  tenancy-gate:" .github/workflows/ci.yml      # continua 2
```

A primeira acende se qualquer linha existente for removida; a segunda acende se um job existente
sumir. Nenhuma das duas depende de uma AC de outra story que o repo já superou.

### 🔴 C5 — AC6: o `grep` de `runSql` é vermelho em `HEAD` por motivo fora do escopo (BLOQUEANTE)

A AC6 declara como mutação que a reprova: *"um `grep` por `function runSql` ou
`function splitStatements` fora de `scripts/lib/management-api.ts` deve retornar **zero**
ocorrências"*.

Rodado em `HEAD`:

```
scripts/reset-tenancy-testdb.ts:126:async function runSql(ref, pat, sql): …    ← vai ser extraída
scripts/reset-tenancy-testdb.ts:142:export function splitStatements(sql): …    ← vai ser extraída
scripts/gate-tenancy.ts:215:async function runSql<T>(sql, pat): Promise<T[]>   ← OUTRA função
```

O `runSql<T>` do `gate-tenancy.ts` tem **assinatura diferente** (`(sql, pat)` contra
`(ref, pat, sql)`) e é outro transporte. Ele está fora do escopo desta story. Como a régua está
escrita, ela **nunca** pode ficar verde, e a saída barata é o @dev afrouxar o `grep` — matando a
prova de "extraiu, não duplicou", que é o ponto inteiro da AC.

**Correção obrigatória:** ancorar a régua nos arquivos sob extração e **declarar a exclusão com o
número medido**, para ela ser auditável:

```bash
# esperado: 0
grep -c "function runSql\|function splitStatements" scripts/reset-tenancy-testdb.ts scripts/db-status.ts scripts/db-apply.ts
# exclusão declarada: scripts/gate-tenancy.ts tem 1 `runSql<T>` de outro transporte, fora do escopo
```

### 🔴 C6 — AC5 e AC6 se contradizem sobre o exit code de `db:status` (BLOQUEANTE)

- **AC6:** *"`pnpm db:status` … **Sempre sai `0`** — é relatório, não gate."*
- **AC5 (verificação):** *"Sem a migration aplicada manualmente, `pnpm db:status` deve **falhar**
  com mensagem nomeando a tabela ausente — não … silenciosamente reportar 'tudo pendente'."*

"Falhar" com exit 0 obrigatório não é um estado observável. Ou o @dev implementa "sempre 0" e a
mutação da AC5 não pode acender, ou implementa "falha" e viola a AC6. É uma AC reprovando a irmã.

**Correção obrigatória:** *"`db:status` sai `0` sempre **que a tabela do ledger existir**, qualquer
que seja o veredito por arquivo. Se a tabela não existir, sai `1` nomeando
`trifold_migrations_aplicadas` e apontando o runbook."*

### 🔴 C7 — AC1: a régua não tem carrasco. E o carrasco é barato (BLOQUEANTE)

O briefing acertou o alvo: `git check-ignore --no-index` é **comando**, não teste. O que garante que
rode? Hoje, nada — só o @dev colar a saída no Dev Agent Record. O que o faria falhar depois? Nada:
se um merge futuro reintroduzir `.env*` em `packages/web/.gitignore`, o conserto regride em silêncio
e o `.env.development.example` volta a ser inaddable, sem nenhum sinal.

A AC está **certa** ao recusar um `.test.ts` que reimplemente a lógica do `.gitignore` — isso seria
uma segunda fonte de verdade. Mas há uma terceira opção que a AC não considerou: **um teste que
invoca o mesmo instrumento**. Não é reimplementação; é o `git check-ignore` rodando dentro do
`pnpm test`.

**Correção obrigatória:** `scripts/gitignore-env.test.ts`, ~15 linhas, `execFileSync("git",
["check-ignore","--no-index", caminho])`, quatro casos:

| Caminho | Esperado |
|---|---|
| `.env.example` | **não** ignorado (exit 1) |
| `packages/web/.env.development.example` | **não** ignorado (exit 1) |
| `packages/web/.env.development` | ignorado (exit 0) — controle negativo |
| `packages/web/.env.producao.local` | ignorado (exit 0) — controle negativo |

Custo zero de infraestrutura: o `vitest.config.ts` **já inclui** `scripts/**/*.test.ts` (medido,
linha do comentário da Story 900-2a), e o job `static` do `ci.yml` já roda `pnpm test` em todo PR —
então a régua passa a ter carrasco em CI, não só no dia da implementação.

**Detalhe que torna isso viável e que confirmei rodando:** `git check-ignore --no-index` responde
sobre **caminhos**, não sobre arquivos existentes. Testei em `packages/web/.env.development`, que
não existe no disco, e obtive `exit 0` com a linha-fonte
(`packages/web/.gitignore:34:.env*`). Ou seja, o teste roda em CI mesmo sem nenhum arquivo de valor
presente — que é exatamente o caso do runner.

### 🔴 C8 — AC5: a varredura de refs nunca faz `fetch` (BLOQUEANTE, menor)

A régua nova está **certa no conceito** e resolve o defeito real (medir só a `main` não vê PR
aberto). Rodei o comando literal da AC5, e ele funciona. Duas falhas:

1. **Ele lê `refs/remotes/origin/*`, que só é tão fresco quanto o último `git fetch`.** Um PR
   aberto depois do último fetch é invisível — o mesmíssimo modo de falha que a régua existe para
   fechar, só que deslocado do `main` para o índice local. Precisa de `git fetch --prune origin`
   como primeira linha do bloco.
2. **`grep -oE "^2[0-9]{2}_"` está preso à faixa 2xx.** Quando o repo chegar em `300_`, a régua fica
   cega e devolve o máximo 2xx. Trocar por `^[0-9]{3}_`.

**Medição de hoje, depois de `git fetch`, que responde às três perguntas do briefing:**

- (a) **`245` está livre em todas as refs.** Varredura completa: maior prefixo = `244`.
- (b) **A régua de fato varre todas as refs**, não só a `main` — confirmado: ela encontra
  `supabase/migrations/244_org_admin_invite_email.sql` em
  `refs/remotes/origin/story/900-22b-convite-admin` (e no head local homônimo), que é invisível
  contra a `main`. `gh pr list` confirma o PR **#522**, `OPEN`. Nenhum outro PR aberto (523, 518,
  445, 431, 429, 428, 344, 343, 339, 306, 301, 148) carrega migration na faixa.
- (c) **É executável, não prosa** — é um bloco `bash` copiável, e eu o executei. Com os dois
  reparos acima ele fica correto.

### 🟢 AC5 — a recursão do Passo 4 **tem dono nomeado** (o @sm acertou)

A pergunta do briefing: é AC com dono, ou frase de runbook?

**É AC com dono, e em três lugares.** (1) O corpo da AC5 diz *"não é aplicado por esta story
automaticamente; é um runbook, escrito nesta story e **executado pelo @devops**"*. (2) A **Task
5.4** é atribuída explicitamente `(@devops)` e diz *"escrever … **e executar** a aplicação manual …
em teste e em produção"*, com *"colar a saída de conferência (contagem de linhas) no Dev Agent
Record"*. (3) A verificação da AC5 diz que **arquivo de runbook ausente reprova a AC por inteiro**,
e que sem a aplicação manual o `db:status` tem de falhar nomeando a tabela.

Passa. A única ressalva é o exit code indefinido — que é o C6, já listado.

### 🟡 AC2 — o banner mede o que diz medir, mas o único juiz é um humano lendo log

A pergunta do briefing: como se prova "o `pnpm dev` aponta para teste" sem rodar?

**Não se prova — e está certo que não se prove**, porque a propriedade é de runtime e depende da
precedência de dotenv do Next, que é justamente o que nenhuma régua estática enxerga. O banner no
`instrumentation.ts` é o ponto correto: confirmei que o arquivo já existe, já roda no boot, e que a
extensão é aditiva dentro do mesmo `register()`. A mutação nomeada pelo @sm ("esquecer o rename ⇒
`pnpm dev` sobe contra produção sem erro; só o banner denuncia") **é verdadeira** — `.env.local`
vence `.env.development` e o banner acenderia vermelho.

O que falta é **decompor a régua**. Como está, a única prova é um humano lendo stdout, o que a torna
irrepetível. Ver **S4**.

---

## 3. Os outros pontos do briefing

### ✅ Irreversibilidade do Passo 1 — confirmada, com uma ressalva

O comando de reversão **está escrito literalmente** na AC2, em bloco `bash`, e a Task 2.6 manda
documentá-lo no `scripts/README.md`:

```bash
mv packages/web/.env.producao.local packages/web/.env.local
mv .env.producao .env.local
```

Verifiquei o resto do passo item a item: os 3 renames são de arquivos **gitignored** (confirmado
por `git ls-files`: o único `.env*` rastreado no repo é o `.env.example` da raiz) — invisíveis ao
git e reversíveis. As 3 criações (`.env.development`, `.env.teste`, `.env.development.example`) são
aditivas. `dev:prod` é adição pura ao `package.json` (medido: os 7 scripts atuais não colidem). O
banner é aditivo dentro de um `register()` existente.

**Uma ressalva:** a mescla de `packages/web/.env.production.local` **dentro** de
`.env.producao.local` é a única operação **não reversível por `mv`** — é uma fusão de dois arquivos
em um. Medi que os dois apontam para o mesmo ref de produção, então a fusão é plausível, mas a AC2
deve mandar **preservar o original renomeado** (`.env.production.local.bak`) em vez de consumi-lo,
para que a reversão seja simétrica. Item **S7**.

### ✅ Segredos — nenhum valor vazou

Varri a story com `grep -nE "eyJ[A-Za-z0-9_-]{10,}|sbp_[A-Za-z0-9]{10,}|service_role.*=.*[A-Za-z0-9]{20}"`:
**zero ocorrências**. Só aparecem *refs de projeto* (`dsopqkqjkmhytudaaolv`, `xnxvygyfyyyzwhiuoehz`),
que são identificadores públicos, já presentes no `.claude/CLAUDE.md` e no `deploy-flow.md` versionados.

O `.env.development.example` que a story manda criar **tracked** é derivado por um comando que
extrai **só nomes**:

```
grep -o '^[A-Z_][A-Z0-9_]*=' packages/web/.env.local | sed 's/=$//' | sort -u
```

Li o comando: a âncora `^[A-Z_][A-Z0-9_]*=` casa até o `=` e o `sed` remove o `=` final — o valor
nunca entra na captura. Correto. A story também é explícita ao dizer que os valores de teste vêm do
painel do Supabase e *"nunca reproduzidos nesta story nem em nenhum artefato versionado"*, e a Task
2.2 acrescenta *"nunca copiados de secret do GitHub, que é write-only"*. E a DoD tem o `grep` final
de padrões de chave. Aprovado sem ressalva.

### ✅ O achado do @sm sobre o `.gitignore` — **procede**, e muda a natureza do Passo 0

Reproduzi as duas medições:

```
$ git check-ignore --no-index -v .env.example
.gitignore:53:.env*      .env.example            # exit 0 → IGNORADO

$ git check-ignore --no-index -v packages/web/.env.development.example
packages/web/.gitignore:34:.env*   packages/web/.env.development.example   # exit 0 → IGNORADO

$ git ls-files | grep '\.env'
.env.example                                     # rastreado
```

A negação `!.env.example` está na **linha 4** e a regra ampla `.env*` na **linha 53** — a última
regra que casa vence, então a negação é anulada. O `.env.example` só sobrevive porque foi commitado
**antes** da linha 53 existir, e `.gitignore` não remove arquivo já rastreado.

**Confirmo a leitura do @sm e a consequência que ele tirou:** o Passo 0 não é preparação para um
arquivo futuro, é **conserto de um defeito ativo**. Um `.env.example` novo, hoje, não conseguiria
ser adicionado ao repo. Isso reforça o C7 — um defeito que já existe e que ninguém percebeu por
meses é exatamente o que precisa de carrasco em CI, não de um comando rodado uma vez.

---

## 4. Correções obrigatórias (bloqueiam o GO)

| # | AC | Correção |
|---|---|---|
| **C1** | AC2 | Resultado esperado do `grep` no bundle está invertido: `.env.development` não é lido por `next build`. Trocar pelo controle negativo (`grep -rc dsopqkqjkmhytudaaolv .next/static` → 0) **e decidir na story** como o build local vê o teste (`packages/web/.env` com valores de teste, ou `build:teste` com `--env-file`). |
| **C2** | AC3 | O controle positivo executa `cleanup-duplicate-leads.ts` **contra produção**, e o script não para na checagem de ambiente. Mover para `scripts/db-env.test.ts`, chamando `resolverAmbiente()` direto. Nunca um script da tabela de destrutivos. |
| **C3** | AC8 | Predicado único falha em `236` numa execução saudável e é colinear em `237`. Dois predicados, ancorados por `id` (SQL na §2 deste parecer). Remover do texto a premissa "`236`/`237` são no-ops guardados" — falsa para banco reconstruído do zero. |
| **C4** | AC9 / T9.3 | A AC8 da `900-1` está **vermelha em HEAD** (`grep -c "gate:tenancy\|tenancy"` = **6**, exige 0) e foi superada pela `900-2c`; além disso não é "AC de não-reescrita". Trocar por `git diff --numstat` com 0 deletions + contagem de jobs = 2. |
| **C5** | AC6 | `grep "function runSql"` fora de `management-api.ts` **nunca** pode dar 0: `scripts/gate-tenancy.ts:215` tem um `runSql<T>` de outro transporte. Ancorar a régua nos arquivos sob extração e declarar a exclusão com a contagem medida (1). |
| **C6** | AC5 × AC6 | Contradição de exit code do `db:status` ("sempre 0" × "deve falhar"). Redigir: `0` sempre que a tabela existir; `1` nomeando `trifold_migrations_aplicadas` quando não existir. |
| **C7** | AC1 | Régua sem carrasco. Acrescentar `scripts/gitignore-env.test.ts` invocando `git check-ignore --no-index` via `execFileSync` (4 casos, 2 positivos + 2 controles negativos). Custo zero: `vitest.config.ts` já inclui `scripts/**/*.test.ts` e o job `static` já roda `pnpm test`. |
| **C8** | AC5 | A varredura de refs precisa de `git fetch --prune origin` na primeira linha (senão lê índice velho) e de `^[0-9]{3}_` no lugar de `^2[0-9]{2}_`. Medição de hoje registrada: `245` livre; `244` tomado pelo PR #522. |
| **C9** | Fatiamento | Aplicar o corte da §1.3 (duas stories) com a repartição explícita da AC10, e escrever no `scripts/README.md` da Fatia A que, até a Fatia B, o banco de teste se traz ao head pelo `reset-tenancy-testdb.ts` existente. |

## 5. Correções recomendadas (não bloqueiam)

| # | AC | Correção |
|---|---|---|
| **S1** | AC10 | A **linha 387** do `.claude/CLAUDE.md` (*"Nunca deixar `.env.local` apontando para o projeto dev após testes"*) também fica sem sentido — a AC nomeia só 385-386, mas a verificação lê `385,387p`. Nomear as três. E trocar a régua de número de linha por régua de conteúdo (`grep -c 'Produção:.*\.env\.local'` → 0): ponteiro de linha envelhece a cada linha inserida acima. |
| **S2** | AC10 | Deletar `scripts/sync-schema.sh` contradiz o **epic-900 §461** (*"`sync-schema.sh` **é** corretamente reaproveitável em `900-3`"*). Ou a AC10 corrige §461, ou reporta ao @pm/@architect — a `900-2c` já registrou que editar o epic está **fora da autoridade** do @sm e do executor. Com o corte da §1.3, a deleção vai para a Fatia B, o que dá tempo para essa correção. |
| **S3** | AC1 / T1.1 | A Task 1.1 põe `!packages/web/.env.development.example` no `.gitignore` **da raiz**. Um `.gitignore` mais profundo **vence** para arquivos abaixo dele, então essa negação nunca bate `packages/web/.gitignore:34`. A negação tem de morar em `packages/web/.gitignore`, depois da regra ampla. E na raiz o conserto é **remover a linha 53**: a linha 3 (`.env.*`) já cobre `.env.producao`/`.env.teste`, e a linha 4 (`!.env.example`) volta a valer sozinha. |
| **S4** | AC2 | Decompor a régua do banner: extrair a decisão como função pura (`avaliarRefDoAmbiente(url, nodeEnv) → 'ok' \| 'alerta'`), testada em unidade, e manter o `pnpm dev` como evidência de integração. Como está, a única prova é um humano lendo stdout. |
| **S5** | AC5 | `docs/audits/migrations-aplicadas.json` é **um** arquivo rastreado para **dois** ambientes: um `db:status` contra teste sobrescreve o retrato de produção no diff. Declarar a estrutura chaveada por ambiente e que cada execução só reescreve a própria chave. |
| **S6** | AC7 | O `docs/audits/reset-testdb-duracao.json` é regravado a cada reset e vai gerar diff em todo PR que rodar o reset. Definir se ele é rastreado (e aceita o churn) ou gitignored com publicação só no comentário do CI. |
| **S7** | AC2 | A mescla de `.env.production.local` dentro de `.env.producao.local` é a **única** operação do Passo 1 não reversível por `mv`. Mandar preservar o original como `.env.production.local.bak` para a reversão ficar simétrica. |

---

## 6. Checklist de 10 pontos

| # | Critério | Nota | Observação |
|---|---|---|---|
| 1 | Template / estrutura | ✅ | Todas as seções do `story-tmpl.yaml` presentes; sem placeholder pendente; skip notice do CodeRabbit correto (medido: `coderabbit` ausente do `core-config.yaml`). |
| 2 | Executor assignment | ✅ | `executor` (@devops) ≠ `quality_gate` (@architect); tipo infra→@devops bate com a matriz; exceção da Task 5.1 para @dev justificada e rastreada. |
| 3 | Caminhos e árvore de arquivos | ✅ | Todos os caminhos citados foram verificados no disco. `supabase/config.toml` de fato não existe; `sync-schema.sh` existe; `instrumentation.ts` é como transcrito. |
| 4 | Cobertura AC ↔ Task | ✅ | Mapeamento 1:1 explícito; ordem de dependência declarada (0→tudo; 4→5; 5,6→7) e correta. |
| 5 | **Testabilidade / poder discriminante** | ❌ | **C1, C3, C4, C5, C6, C7** — 5 réguas sem desfecho definido e 1 sem carrasco. É o eixo que reprova. |
| 6 | Testing standards | 🟡 | Honesta ao dizer que é infra validada por execução. Falta o carrasco do C7 e a decomposição do S4. |
| 7 | **Segurança** | ❌ | Conteúdo impecável (zero segredo, `.example` só com nomes, guard de fork, allowlist fecha-fechado). Reprova só por **C2**: controle positivo executando script destrutivo em produção. |
| 8 | Sequência de tasks | ✅ | Correta. O único cruzamento na direção errada é a AC10, resolvido pelo fatiamento. |
| 9 | Anti-alucinação | ✅ | Reproduzi 14 alegações medidas (gitignore, refs de migration, `ci.yml`, `deploy-flow.md`, `env.ts`, `vitest.config.ts`, `instrumentation.ts`, `package.json`, `.env*`, `runSql`, `FALHAS_CONHECIDAS`, `CLAUDE.md`, `schema_migrations`, PRs abertos) — **todas conferem**. Uma imprecisão herdada do plano ("`236`/`237` são no-ops"), corrigida em C3. |
| 10 | Prontidão para o @dev | 🟡 | Autocontida e rica em contexto. Trava em duas decisões não tomadas: como o build local vê o teste (C1) e o exit code do `db:status` (C6). |

**Score: 6/10 · NO-GO**

---

## 7. Caminho para o GO

1. @sm aplica **C1–C8** na `900-3b`.
2. @sm executa o **corte da §1.3**: `900-3b` (ambiente, sem migration, sem produção) e `900-3c`
   (promoção, com a migration `245` remedida **depois** do merge do PR #522).
3. @po revalida as duas — espero **GO** em ambas, porque nenhuma correção é de desenho.
4. A `900-3b` (Fatia A) pode entrar em desenvolvimento **em paralelo** ao PR #522: ela não cria
   migration nenhuma, então não disputa número.

**Ação de follow-up já registrada pelo @sm e que endosso:** ao fechar, atualizar a seção "Estado
real do PRE-1" da `900-3` apontando para a story que resolveu a condição de reabertura.

---

*— Pax, equilibrando prioridades 🎯*

---
---

# RODADA 2 — Revalidação da Fatia A (`900-3b — Ambiente de Teste`)

- **Story:** `docs/stories/900-3b-ambiente-de-teste.story.md` (v1.0 — reescrita como Fatia A)
- **Irmã:** `900-3c` — parecer próprio em `docs/qa/po-validation-900-3c.md`
- **Data:** 2026-08-29 · **Validador:** @po (Pax)
- **Método:** cada correção alegada foi **executada**, não lida. O `.gitignore` foi simulado em
  repositório git de rascunho, com as mutações rodadas de verdade.

## Veredito — Fatia A

> ## ✅ GO CONDICIONAL — Readiness 8/10 — Confiança: Alta
>
> As 4 correções bloqueantes desta fatia (C1, C2, C3, C7) foram aplicadas, e **três delas eu
> reproduzi empiricamente**. A C7 em particular deixou de ser régua de papel: simulei o
> `.gitignore` corrigido e as três mutações, e a régua **acende em todas**.
>
> **Um buraco substantivo restou**, e é consequência direta da decisão nova do C1 — a única
> correção que mudou comportamento em vez de só reescrever régua. **D1 abaixo.** É emenda de uma
> frase e um caso de teste; não exige revalidação minha.
>
> **Libera para desenvolvimento assim que a D1 entrar no texto da AC2.** A Task 1 (`.gitignore`)
> pode começar imediatamente — não depende da D1 nem do PR #522.

---

## 1. C7 — a régua nova, rodada de verdade (o ponto mais importante)

Montei um repositório git de rascunho reproduzindo exatamente a estrutura que a AC1 manda criar
(raiz **sem** a linha `.env*`; `packages/web/.gitignore` **com** `.env*` seguido de
`!.env.development.example`) e rodei os 4 casos mais 3 mutações.

| Cenário | `.env.example` | `pw/.env.development.example` | `pw/.env.development` | `pw/.env.producao.local` |
|---|---|---|---|---|
| **Corrigido (AC1)** | `1` ✅ | `1` ✅ | `0` ✅ | `0` ✅ |
| **Mut. A** — reintroduzem `.env*` na raiz | **`0` ❌ acende** | `1` | `0` | `0` |
| **Mut. B** — removem a negação de `packages/web` | `1` | **`0` ❌ acende** | `0` | `0` |
| **Mut. C** — negação posta na raiz (o erro do S3) | — | **`0` ❌ acende** | — | — |

**Três conclusões, todas medidas:**

1. **O estado corrigido dá exatamente `1,1,0,0`** — a AC1 não está pedindo algo que o git não faça.
2. **Cada caso positivo guarda um arquivo diferente e não é redundante com o outro.** A Mutação A
   derruba só o caso 1; a Mutação B derruba só o caso 2. Não há colinearidade entre eles — os dois
   precisam existir.
3. **O S3 estava certo e foi aplicado certo.** Com a negação no `.gitignore` da raiz, o
   `packages/web/.env.development.example` continua ignorado (`exit 0`). A AC1 agora manda pôr a
   negação no `packages/web/.gitignore`, depois da regra ampla — que é a única posição que funciona.

### Um detalhe de implementação que decide se a régua vive ou morre (→ S8)

`git check-ignore` tem **três** saídas: `0` (ignorado), `1` (não ignorado) e **`128` (erro fatal)**
— medido rodando fora de um repositório git. Como `execFileSync` **lança** em qualquer status ≠ 0,
a implementação ingênua (`try { ... return true } catch { return false }`) trata `128` como "não
ignorado". Simulei:

```
-- cwd ERRADO (instrumento quebrado) --
naive  .env.example ignorado?            false   ← os dois casos POSITIVOS passariam
naive  pw/.env.development ignorado?     false   ← o CONTROLE NEGATIVO pega (false != true)
strict (status===1)                      "instrumento falhou: status=128"
```

**Os dois controles negativos são, por acidente feliz, a guarda de vivacidade do instrumento** — se
o `git` falhar, eles acusam. Isso é uma propriedade real e vale registrá-la na AC para ninguém os
remover achando que só servem contra vazamento de segredo. Ainda assim, a asserção correta é
`status === 1` explícito, não "lançou". Ver **S8**.

---

## 2. D1 — a decisão do C1 é aceitável, mas recria o defeito silencioso numa forma nova (OBRIGATÓRIA)

**A decisão em si é boa e eu a endosso.** `pnpm build` sem env de Supabase é mais seguro que
`pnpm build` assando produção, e reflete o comportamento real do Next em vez de fingi-lo. Verifiquei
o raio de impacto e ele é pequeno:

- **Vercel:** injeta env do dashboard — não lê arquivo do repo. Intacto.
- **CI:** o job `static` roda `type-check`, `lint`, `test` — **não roda `build`**. Intacto.
- **Local:** único afetado.
- `build:teste` é executável: `packages/web/node_modules/next/dist/bin/next` **existe**, Node é
  `v25.6.1` (suporta `--env-file` desde a v20.6), o caminho relativo `.env.development` resolve
  contra o cwd de `packages/web`, e o `@next/env` não sobrescreve chave já presente em
  `process.env` — então o `--env-file` vence a precedência, mesmo mecanismo já validado para o
  `dev:prod`. `packages/web/.next/` é gitignored (`packages/web/.gitignore:17:/.next/`), o que
  fecha o risco R5.

**O problema é o que sobra.** A própria story registra, em Dev Notes, que um build sem env
**passa** e assa `undefined` (`client.ts` usa `!`, não o getter que lançaria). O defeito que eu
achei na rodada 1 era *"assa produção em silêncio"*; o estado novo é *"assa `undefined` em
silêncio"*. Menos perigoso — igualmente mudo.

O único instrumento capaz de tornar isso audível é o banner, que roda no boot também em
`next start`. E a AC2 o deixa cego para exatamente esse caso:

```
`avaliarRefDoAmbiente(url: string | undefined, nodeEnv: string | undefined): "ok" | "alerta"`
...
`avaliarRefDoAmbiente(undefined, "development")` → não lança.
```

O tipo tem **dois** estados e o caso `undefined` só exige "não lança" — **o valor de retorno não é
especificado**. Com um tipo binário, a implementação natural é `undefined → "ok"` (não é o ref de
produção, logo não alerta). Aí o build vazio sobe calado.

**Correção obrigatória (D1):** terceiro estado e asserção explícita.
- Assinatura: `avaliarRefDoAmbiente(url, nodeEnv): "ok" | "alerta" | "ausente"`.
- `undefined`, string vazia ou URL de onde não se extrai ref ⇒ `"ausente"`.
- O banner imprime aviso distinto para `"ausente"` ("nenhum Supabase configurado — este build/boot
  não fala com banco nenhum"), não silêncio.
- Caso de teste na AC2: `avaliarRefDoAmbiente(undefined, "development") === "ausente"` (em vez de
  "não lança").

Sem isso, a decisão do C1 troca um defeito mudo por outro, e a story fica sem carrasco para o
próprio estado que ela criou de propósito.

---

## 3. C2 e C3 — aplicadas corretamente

### C2 — o controle positivo exercita a guarda, sim

A pergunta era se ele exercita a guarda ou só chama uma função inócua. **Exercita.**
`resolverAmbiente()` **é** a guarda — não há camada entre ela e a decisão. E o trio de casos pinça
as duas variáveis independentes:

| Caso | `TRIFOLD_ENV` | `TRIFOLD_ALLOW_PROD` | ref | Esperado | O que isola |
|---|---|---|---|---|---|
| negativo | `producao` | — | **fictício** | recusa | pertinência à allowlist |
| positivo | `producao` | `1` | **real** | retorna o ref | o caminho liberado existe |
| flag | `producao` | — | real | sai `1` nomeando a var | a flag é load-bearing |

Trocar a allowlist pela denylist antiga faz o caso do ref fictício passar a ser aceito — a AC nomeia
essa mutação, e ela de fato discrimina as duas implementações. E o veículo destrutivo sumiu: nenhum
script da tabela de destrutivos é invocado por teste nenhum. **C2 fechada.**

Fica um gap de execução, não de desenho → **S9**: a story não diz **de onde** `resolverAmbiente()`
tira o ref. Se for de `.env.teste`/`.env.producao` (gitignored, ausentes no runner), o
`db-env.test.ts` — que é o carrasco desta correção — não roda em CI, ou o @dev o faz pular quando o
arquivo falta, e um teste que pula é verde sem juiz.

### C3 — os dois predicados sobrevivem ao traço e discriminam

Refiz o traço `011`→`236`→`237` contra os predicados novos:

| Momento | Estado | `EXISTS(…0011, 'no-show-real', 'no_show') AND EXISTS(…0009,'atendimento')` | `EXISTS(…0011,'no-show')` |
|---|---|---|---|
| após `011` | `…0009` = `no-show` | — | — |
| **após `236`** | `…0009`→`atendimento`; `…0011` nasce `no-show-real` | **VERDADEIRO** ✅ | — |
| **após `237`** | `…0011`→`no-show` | — | **VERDADEIRO** ✅ |

**Poder discriminante, metade a metade:** se o `§2.1` do `236` não disparar, o segundo `EXISTS` cai;
se o `§2.2` não inserir, o primeiro cai — os dois ramos têm modo de falha próprio. E a âncora por
`id` no predicado do `237` **mata a colinearidade** que eu havia apontado: com `…0011` no `WHERE`,
a linha `…0009` não pode mais satisfazer o predicado no lugar do `237`. **C3 fechada.**

A premissa "`236`/`237` são no-ops guardados" saiu do texto e foi substituída pelo traço correto,
com a ressalva certa (*"leitura de sequência, não execução"*) e a conclusão preservada: mede-se na
Task 6.4, não se pré-adiciona. Ressalva menor → **S10**: se o `011` falhar por FK (cenário que o
`scripts/README.md` documenta), `…0009` não existe e o predicado do `236` fica vermelho **sem que o
`236` tenha errado**. A AC deve dizer que esse desfecho é *informação para a Task 6.4*, não defeito
automático.

---

## 4. O split, item a item

**A repartição da AC10 ficou coerente — conferi os 5 itens:**

| Item da AC10 original | Foi para | Confere? |
|---|---|---|
| `scripts/README.md` | `900-3b` AC2 / Task 2.6 | ✅ |
| `.claude/CLAUDE.md` 385-**387** | `900-3b` AC2 / Task 2.7 | ✅ (as três linhas, régua por conteúdo — S1 aplicado) |
| `reference_ci_surface_trifold.md` | `900-3b` AC7 | ✅ |
| `docs/deploy-flow.md` | `900-3c` AC5 | ✅ |
| deletar `scripts/sync-schema.sh` | `900-3c` AC5 | ✅ |

Nenhum item perdido, nenhum duplicado nas duas fatias.

**A pergunta específica do coordenador — a nota do `reset-tenancy-testdb.ts` está no
`scripts/README.md`? SIM.** Está na AC2 (linhas 209-210 da story) e na Task 2.6, com o texto
literal: *"até a `900-3c` mergear, não existe `pnpm db:apply`; para trazer o banco de teste ao
`HEAD` atual, use `npx tsx scripts/reset-tenancy-testdb.ts --confirmar`"*. E a Task 6.4 aproveita
essa mesma execução para medir `236`/`237` — as duas necessidades pagam uma corrida só.

**Órfãs: nenhuma.** A AC5 desta fatia exclui explicitamente popular o ledger e declara que o
`delete from supabase_migrations.schema_migrations;` **permanece** (não é regressão desta fatia, é
estado que a `900-3c` corrige) — a `900-3c` AC3 recolhe exatamente esse item. A `900-3b` declara
não depender da `900-3c` nem do PR #522; a `900-3c` declara depender da `900-3b` mergeada. Direção
correta nas duas pontas.

---

## 5. Achado novo — uma régua que eu deixei passar na rodada 1 (S11)

A AC5 exige, e a DoD repete: *"`pnpm reset:testdb --confirmar` produz SHA-256 idêntico em duas
execuções consecutivas"*. Medido:

```
$ grep -n "sha256\|createHash" scripts/reset-tenancy-testdb.ts     → (nada)
$ grep -rln "createHash" scripts/                                   → (nada)
```

**Não existe mecanismo no repositório que calcule esse hash**, e nenhuma Task desta fatia o cria (a
Task 5.4 cobre só a medição de duração). Na `900-3` a comparação foi feita **ad hoc** — a story
registra os dois digests idênticos e o método (*"SHA-256 sobre colunas + policies + índices +
funções"*), mas não deixou ferramenta.

Isto é um item de DoD sem instrumento: o @dev inventa ou pula. **Não é bloqueante** (o método está
descrito e `scripts/generate-schema-snapshot.ts` já faz a introspecção — hashear a saída dele é o
caminho natural), mas a AC precisa nomear o comando. **E registro que este defeito estava na v0.2 e
eu não o peguei na rodada 1** — meu parecer também é alegação.

---

## 6. Correções — Fatia A

### Obrigatória (emendar antes de a Task 2.5 fechar; não exige revalidação)

| # | Onde | Correção |
|---|---|---|
| **D1** | AC2 | `avaliarRefDoAmbiente` ganha terceiro estado `"ausente"`; `undefined`/vazio/ref não extraível ⇒ `"ausente"`; banner imprime aviso próprio; caso de teste vira `avaliarRefDoAmbiente(undefined, "development") === "ausente"`. **Sem isso a decisão do C1 troca "assa produção em silêncio" por "assa `undefined` em silêncio"**, e a story fica sem carrasco para o estado que ela criou de propósito. |

### Recomendadas

| # | Onde | Correção |
|---|---|---|
| **S8** | AC1 | O teste deve afirmar `status === 1`, não apenas "lançou" — `git check-ignore` sai `128` em erro fatal (medido) e um `catch` cego o converte em "não ignorado". Registrar na AC que **os dois controles negativos são a guarda de vivacidade do instrumento**, para ninguém removê-los. |
| **S9** | AC3 | Declarar a precedência de onde `resolverAmbiente()` lê o ref: **`process.env` vence o arquivo dotenv; o arquivo é fallback** — e que `db-env.test.ts` injeta por `process.env`, nunca depende de `.env.teste`/`.env.producao` (gitignored, ausentes no runner). Sem isso o carrasco do C2 não roda em CI, ou pula — e teste que pula é verde sem juiz. |
| **S10** | AC6 | Dizer que o predicado do `236` vermelho **por ausência de `…0009`** (se o `011` falhar por FK, cenário que o `scripts/README.md` documenta) é *informação para a Task 6.4*, não defeito automático. |
| **S11** | AC5 / DoD | Nomear o comando do SHA-256 de schema — não existe `createHash` em `scripts/` hoje (medido). Sugestão: `pnpm gate:tenancy:snapshot` + hash de `docs/audits/schema-snapshot.json`, antes e depois. |
| **S12** | AC2 | `grep -rc PADRÃO diretório` **nunca imprime um número solo** — imprime `arquivo:contagem` por arquivo (medido). Os esperados "→ 0" e "→ ≥1" não batem com a saída real. Trocar por `grep -rl` (exit 1 = não achou, inequívoco) nos dois casos do bundle. |
| **S13** | AC5 | Nomear o **default** do `reset-testdb-duracao.json` em vez de deixar a escolha em aberto (ver §7). |

---

## 7. Julgamento do S6 — deixar a decisão em aberto é aceitável, **desde que o default seja nomeado**

Deferir a escolha "rastreado com churn × gitignored com publicação via CI" é legítimo: é reversível,
de baixo risco, e o dado que decide (o tamanho do churn) só existe depois da primeira execução.

**O que não é aceitável é deixá-la sem default.** `docs/audits/` é diretório rastreado e a
precedência da casa é rastrear (`gate-tenancy-report.json`, `rls-gate-baseline.json` estão os dois
versionados). Logo, **a não-decisão já é uma decisão**: o arquivo nasce rastreado e o churn começa.
Uma "decisão em aberto" cujo caminho de menor esforço é uma das opções não é uma decisão em aberto —
é a opção escolhida sem ser discutida.

**Recomendação:** a AC5 declara *default: gitignored*; rastrear exige decisão explícita registrada
no Dev Agent Record com o tamanho do diff medido. Isso converte inércia em opt-in.

---

## 8. Checklist — Fatia A

| # | Critério | Nota | Observação |
|---|---|---|---|
| 1 | Template / estrutura | ✅ | Seções completas; skip notice do CodeRabbit correto (`coderabbit` segue ausente do `core-config.yaml`). |
| 2 | Executor assignment | ✅ | @devops ≠ @architect; sem exceção de @dev (coerente — esta fatia não cria migration). |
| 3 | Caminhos / árvore | ✅ | Verifiquei os caminhos novos: `next/dist/bin/next` existe; `.next/` gitignored; `vitest.config.ts` cobre `scripts/**` e `packages/web/src/**`. |
| 4 | Cobertura AC ↔ Task | ✅ | 7 ACs ↔ 7 Tasks, 1:1, com ordem de dependência declarada e correta. |
| 5 | Testabilidade / poder discriminante | 🟡 | C7 e C3 **verificados empiricamente** e discriminantes. Pendências: D1 (banner cego para `undefined`), S8, S11, S12. |
| 6 | Testing standards | ✅ | 3 suítes novas, todas em globs já cobertos; nenhuma reimplementa regra externa. |
| 7 | Segurança | ✅ | Controle destrutivo eliminado (C2). Nenhum valor de segredo. Controles negativos do `.gitignore` no lugar. |
| 8 | Sequência de tasks | ✅ | 1→2, 3→5, 5→6. Sem cruzamento para a `900-3c`. |
| 9 | Anti-alucinação | ✅ | Reproduzi as afirmações novas: `.gitignore` (4 casos + 3 mutações), `next` bin, `.next` ignorado, `grep -rc`, `createHash` ausente, `check-ignore` status 128. Uma afirmação **não** sustentada: o SHA-256 do reset (S11). |
| 10 | Prontidão para o @dev | ✅ | Autocontida. As decisões que faltavam na v0.2 (build local, exit code) estão tomadas. |

**Score: 8/10 · GO condicional (emenda D1)**

---

## 9. Ordem recomendada

1. @sm aplica **D1** (e, de preferência, S8-S13 na mesma passada — são todas de uma linha).
2. `900-3b` vai a **Ready**. A Task 1 pode começar já; **não depende do PR #522**.
3. `900-3c` só depois do merge da `900-3b` — ver `docs/qa/po-validation-900-3c.md`.

*— Pax, equilibrando prioridades 🎯*

---
---

# RODADA 3 — Arbitragem da AC4 (pós-implementação, commit `9d104e73`)

- **Data:** 2026-08-29 · **Validador:** @po (Pax)
- **Pedido:** o dono do produto delegou a mim a decisão sobre o destino da AC4.
- **Método:** as três opções foram **testadas**, não julgadas no papel. Uma delas se comporta de
  forma diferente do que o enunciado supunha.

---

## 🔴 ANTES DA DECISÃO — achado de segurança encontrado ao reproduzir a medição

Rodei o comando que a própria AC4 manda rodar. **Ele imprime a senha do banco de produção em texto
claro, no stdout:**

> Saída **não reproduzida** (R6/E3): `supabase db dump --dry-run`, sem flag nenhuma, imprime
> um bloco `export` com `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE` do banco de **produção** e
> `PGPASSWORD` com a senha **em texto claro**. Nem o bloco nem a linha de host truncada
> entram em arquivo rastreado — truncar não é mitigação. Instrumento de evidência correto
> para "para onde a CLI aponta": `pnpm supabase:check`, que imprime só o project ref.



**Contenção — verificada, e está limpa:**

| Verificação | Resultado |
|---|---|
| `git grep -l -F '<senha>'` em arquivos rastreados | **nenhum** |
| `git log -S'<senha>' --all` | **nenhum commit** |
| `grep -rl` no repo inteiro (fora `.git`/`node_modules`) | **nenhum arquivo** |
| `supabase/.temp/pooler-url` contém a senha? | **não** (vem do credential store da CLI, não do repo) |
| O `@dev` colou essa saída na story? | **truncou em `PGHOST`** — a senha não entrou |

**O `@dev` acertou por disciplina. A AC pede por regra o comportamento perigoso.** A AC4 diz
*"confirmar por `supabase status` (ou qualquer subcomando que resolva o projeto-alvo)"*, e o padrão
de evidência desta story — repetido em 7 ACs e na DoD — é *"colar a saída no Dev Agent Record"*, que
é **arquivo rastreado**. Um subcomando que resolve o projeto-alvo é exatamente um subcomando remoto,
e subcomando remoto imprime a senha. A distância entre esta story e um segredo de produção commitado
foi **uma decisão de bom senso de um agente**, não uma regra.

Isso, sozinho, já desqualifica a forma atual da AC4 — independentemente de ela ser falsa por
construção. Registrei item de segurança em `docs/backlog.md`.

---

## 1. As três opções, testadas

### ❌ Opção 1 — apagar `supabase/.temp/project-ref`: **não faz o que o enunciado supõe**

Testei (com backup e restauração garantida — a máquina voltou ao estado original):

```
$ rm supabase/.temp/project-ref && supabase db dump --dry-run
Cannot find project ref. Have you run supabase link?
```

**O `project_id` do `config.toml` não é fallback para comandos remotos.** Sem o
`.temp/project-ref`, a CLI **não cai no projeto de teste — ela erra**. Então a Opção 1 não torna a
AC4 verdadeira; ela troca "resolve para produção" por "não resolve para nada".

Isso é uma melhora real de segurança (**falha fechada** em vez de falha aberta em produção), e vou
recomendá-la como **ação de operador** — mas com a expectativa correta, que é o oposto da que o
enunciado da opção carregava. Como resposta à AC4, não serve: continua sendo estado de máquina, some
no primeiro `supabase link`, e não protege a próxima máquina. O `@dev` fez certo em não tocar nisso
por conta própria.

### ❌ Opção 2 — reescrever a AC para exigir a instrução de `supabase link` documentada

Vira uma AC que mede **o documento**, não o comportamento. É a régua que este repositório já aprendeu
a desconfiar: *"existe um parágrafo"* fica verde para sempre, inclusive no dia em que a máquina
estiver linkada em produção. Necessária como parte, insuficiente como resposta.

### ❌ Opção 3 — mover a AC4 para a `900-3c`

Mover uma AC falsa não a torna verdadeira. A CLI é igualmente ingovernável lá, e a `900-3c` está
**bloqueada por dependência** (precisa da `900-3b` mergeada) — o que adiaria por dias um conserto que
custa ~10 linhas. Além disso, o problema não é "tema de CLI"; é "propriedade de máquina que o repo
não governa", que é assunto de ambiente — ou seja, **desta** fatia.

---

## 2. ✅ DECISÃO — nenhuma das três: a AC4 é reescrita no padrão que a AC2 já estabeleceu

**O critério (a) do coordenador está certo, e eu o endureço:** uma AC que o repositório não pode
garantir não deveria ser marcável — nem por acaso, nem por estado de máquina. **O critério (b)
também está certo:** o `config.toml` tem valor sem a AC, e o valor não é pequeno — o aviso de
`db push` proibido mora no lugar exato onde a pessoa erraria.

Mas há uma quarta saída, e ela não é invenção minha: **esta story já resolveu este mesmo problema,
uma vez, na AC2.** `pnpm dev` apontar para produção também é estado de máquina (`.env.local`) que o
repositório não pode garantir. A resposta da AC2 não foi "afirmar que o repo garante" nem "apagar a
AC" — foi **tornar o estado errado audível no momento do uso**: o banner. A AC4 sofre do mesmo mal e
merece o mesmo remédio.

### AC4 passa a ter três partes, e cada uma mede o que é medível

**AC4a — o que o repositório de fato governa (estático, em `pnpm test`).**
- `supabase/config.toml` existe, versionado, com `project_id` = ref de **teste**, e carrega o aviso
  de `db push` proibido. Régua: `grep` do `project_id` — ela protege contra alguém "consertar" o
  arquivo apontando para produção depois.
- **Nenhum `package.json` nem workflow do repositório invoca subcomando remoto do `supabase`.**
  Medido hoje: **zero ocorrências** em 12 `package.json` + 1 workflow — a régua nasce verde,
  é barata e significa algo real (o repositório nunca **roteia** ninguém para a superfície
  ingovernada; quem for, foi a pé).
  *Nota de escopo, medida:* a régua tem de ficar restrita a `*package.json` + `.github/workflows/*`.
  Varrer o repo inteiro traz `.aios-core/` (templates do framework), `.claude/hooks/`, `.coderabbit.yaml`
  e **comentários** dentro de `scripts/*.ts` — população grande e ruidosa, pela qual esta story não
  responde.

**AC4b — tornar audível o que o repositório não governa (o padrão do banner).**
`pnpm supabase:check`: lê `supabase/.temp/project-ref`, classifica o ref pela **mesma allowlist de
`scripts/lib/db-env.ts`** (reuso obrigatório — não pode haver duas definições de "o que é produção"
no repositório, que é o defeito que a AC3 existiu para matar), e:
- ref de teste → sai `0`;
- ref de produção → sai **`1`**, nomeando o ref e imprimindo `supabase link --project-ref xnxvygyfyyyzwhiuoehz`;
- arquivo ausente → sai `0` com aviso "não linkado — comandos remotos vão falhar", que é o estado
  **seguro** (medido na Opção 1).

Documentado em `scripts/README.md`, ao lado da nota do `reset-tenancy-testdb.ts`. É a Opção 2 com
dentes: o comando é o documento, e ele acende.

**AC4c — a afirmação falsa sai de todo lugar onde está escrita.**
"`supabase <cmd>` sem flag resolve para teste" precisa sumir da AC4, da seção Testing (item 4) e da
DoD. **E de mais um lugar, que é o que me preocupa:** ela também é parte do **critério de saída da
Onda 1** do plano aprovado. O plano afirma algo que a ferramenta não permite. Isso não é conserto de
story — é correção de plano/épico, e vai junto do item de épico que já abri.

**Regra de evidência, obrigatória nas três partes:** **é proibido colar em arquivo rastreado a saída
de qualquer subcomando remoto do `supabase`.** A evidência da AC4b é a saída do `pnpm supabase:check`
(que imprime só o ref — identificador público), nunca a do `db dump`/`status`.

### Por que não simplesmente apagar a AC4

Porque o achado é bom demais para virar silêncio. O que o `@dev` descobriu — *"o repositório não
consegue garantir isto; só a máquina consegue"* — é exatamente o tipo de fato que some quando não
tem uma régua para segurá-lo. O `config.toml` que ele escreveu já documenta o achado dentro do
próprio arquivo, e isso é excelente. Falta o carrasco.

---

## 3. O que o @sm precisa reescrever

| # | Onde | O quê |
|---|---|---|
| **E1** | `900-3b` AC4 | Substituir a AC inteira pelas partes **AC4a / AC4b / AC4c** acima, com a régua de evidência ("nunca colar saída de subcomando remoto do `supabase`"). Acrescentar Task 4.3 (`pnpm supabase:check` + teste) e Task 4.4 (`scripts/README.md`). |
| **E2** | `900-3b` Testing (item 4) e DoD | Trocar "`supabase status` resolve para teste sem flag" pelas duas réguas novas. |
| **E3** | `900-3b` Riscos | Risco novo: *"comando remoto do `supabase` imprime a senha de produção em stdout; qualquer paste de evidência pode vazar segredo"* — severidade **Alta**, mitigação = a regra de evidência da E1. |
| **E4** | plano/épico | O critério de saída da Onda 1 afirma "`supabase <cmd>` sem flag resolve para teste", que é **inalcançável**. Encaminhado por mim junto do item `[EPIC-900]` já aberto em `docs/backlog.md`. Fora da autoridade do @sm. |
| **E5** | `900-3c` | Nada a mover. A AC4 **fica** na `900-3b`. |

**Ação de operador, separada da story (não é AC):** rodar `supabase link --project-ref xnxvygyfyyyzwhiuoehz`
nesta máquina. Se não for rodar, apagar `supabase/.temp/project-ref` deixa a CLI **falhando fechada**
— pior ergonomia, melhor segurança. Decisão do dono do produto; nenhuma das duas é responsabilidade
desta story.

---

## 4. Três correções ao meu próprio parecer — aceitas, e uma delas eu reproduzi

Registro as três, porque parecer de `@po` também é alegação e este errou.

**4.1 — `node --env-file` não funciona com o Next. Eu afirmei que funcionava sem rodar.**
Reproduzi a causa que o `@dev` apontou:

```
$ NODE_OPTIONS="--env-file=/tmp/pax.env" node -e "console.log('passou')"
node: --env-file= is not allowed in NODE_OPTIONS
```

O Next re-spawna a si mesmo e propaga `execArgv` via `NODE_OPTIONS`, onde a flag é proibida. **Eu
classifiquei o mecanismo como "executável" a partir da existência do binário, da versão do Node e do
comportamento do `@next/env` — três fatos verdadeiros que não se somam na conclusão.** Era uma
inferência apresentada como medição, e atingia `dev:prod` **e** `build:teste`, os dois mecanismos
que a AC2 prescrevia. É exatamente o defeito que eu cobro dos outros: *rodar a AC, não raciocinar
sobre ela*. A substituição do `@dev` (`packages/web/scripts/next-com-env.mjs` com `util.parseEnv`,
sem dependência nova) preserva a propriedade que importava — gravar em `process.env` antes do Next
subir — sem a flag proibida.

**4.2 — o controle negativo da AC3 era colinear. Procede.**
A tabela que eu escrevi na Rodada 2 (§3, "C2 — o controle positivo exercita a guarda") pedia o caso
negativo **sem** `TRIFOLD_ALLOW_PROD`. Com a flag ausente, a guarda de flag barra a chamada **antes**
de a allowlist ser consultada — o caso passava sem exercitar a allowlist, que era o que ele dizia
exercitar. O `@dev` provou empiricamente (sob a mutação que reverte allowlist→denylist, o caso
original continuava verde) e corrigiu rodando **com** a flag, isolando a allowlist como única
variável. **Eu montei a tabela para separar duas variáveis e deixei as duas ligadas na mesma linha.**

**4.3 — a régua de hash do S11 é insatisfazível como escrita. Procede.**
Eu sugeri hashear `docs/audits/schema-snapshot.json`. O arquivo tem `capturedAt` e um array
`functions` de ordenação instável — dois digests nunca baterão. A sugestão nasceu do meu achado
correto (não existe `createHash` em `scripts/`) e morreu na implementação que eu não testei. O
`@dev` provou a idempotência por **hash normalizado**, idêntico em duas execuções — que é a
propriedade que a AC queria. A AC deve adotar a normalização explicitamente, não o arquivo cru.

**Padrão comum aos três:** todos são eu **inferindo em vez de executar**, no mesmo parecer em que
cobrei exatamente isso. Vale como calibragem: minha taxa de acerto é alta quando eu rodo o comando
(as réguas do `.gitignore`, do `ci.yml`, da varredura de refs, do `grep -rc`) e cai quando eu
raciocino sobre APIs de terceiros (Node, Next, formato de snapshot).

---

## 5. Duas medições do @dev que fecham questões abertas — e duas correções de número

**Fecham:**
- **`236`/`237` aplicam com sucesso** num banco do zero — não são no-op nem falha. Portanto **não**
  entram em `FALHAS_CONHECIDAS`, que é o desfecho que a AC6 previa como possível. A `011` aplicou, o
  que **afasta o confundidor do S10** (o predicado do `236` vermelho por ausência de `…0009`). O
  S10 fica registrado como cenário não materializado, não como pendência.
- **Reset em 456,6s, `REGRESSÕES: 0`** entre a `237` e a `244`. A previsão do plano ("a onda de
  falhas novas provavelmente não vem") se confirmou.

**Corrigem números que eu deixei passar:**
- **Prefixos duplicados são 22, não 21.** Medi: `021 024 025 027 028 029 031 032 033 034 036 044
  048 063 066 075 102 104 164 170 230 240` = **22**. A lista já estava na story v0.2 com 22 itens
  sob o rótulo "21", e eu a reproduzi na Rodada 1 sem contar. Contagem bamba que atravessou duas
  validações minhas.
- **Dos 11 `_remote_only.sql`, apenas 4 usam `CREATE INDEX CONCURRENTLY`.** Medi: 11 arquivos
  `_remote_only`; 6 mencionam `CONCURRENTLY`; **4** na forma `CREATE INDEX CONCURRENTLY` (`031`,
  `032`, `033`, `034`). A story dizia "os 11 `_remote_only` com `CREATE INDEX CONCURRENTLY`",
  confundindo "quantos existem" com "quantos usam". O `config.toml` do `@dev` já traz o número certo
  e a explicação da confusão.

---

## 6. Situação da fatia após esta rodada

| AC | Estado |
|---|---|
| AC1, AC3, AC5, AC6, AC7 | ✅ cumpridas pelo `@dev`, com mutação executada e vermelho medido |
| AC2 | 🟡 bloqueada na Task 2.7 (`.claude/CLAUDE.md`) — autorização do dono do produto, já concedida; sem objeção minha |
| **AC4** | 🔴 **reescrita determinada nesta rodada (E1-E5).** Não é "não cumprida" — o alvo é que estava errado |

**Veredito da Rodada 3:** a story **não volta a NO-GO**. O `@dev` fez a coisa certa duas vezes — não
marcou uma AC que não podia cumprir, e não mexeu na máquina do dono do produto por conta própria. O
que falta é o `@sm` aplicar E1-E3; E4 é meu. A AC4 reescrita é ~10 linhas de script mais duas
réguas que já sei serem verdes no baseline, porque as medi.

*— Pax, equilibrando prioridades 🎯*
