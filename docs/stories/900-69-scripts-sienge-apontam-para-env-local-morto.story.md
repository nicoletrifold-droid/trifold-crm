# Story 900-69 — Scripts do Sienge apontam para `packages/web/.env.local`, que não existe mais

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular (continuação direta da
  Story `900-3b`, que renomeou `packages/web/.env.local` → `packages/web/.env.producao.local` e
  migrou 12 carregadores dotenv ad hoc para `scripts/lib/db-env.ts`).
- **Story:** 900-69 — próximo número livre da faixa 900 (confirmado via `ls docs/stories/`;
  último era `900-68`, Done).
- **Status:** Ready for Review
- **Tipo:** Bug fix (dívida técnica, dois scripts sobraram fora da migração da `900-3b` porque
  nasceram depois dela, na Story `75-370`).
- **Priority:** P3 — não bloqueia ninguém. Os dois scripts são de uso manual (conciliação
  financeira do Sienge) e falham fechado (erro visível na primeira linha), não silenciosamente.
- **Complexity:** XS — troca de um literal de caminho em 2 arquivos + 1 comentário de uso em um
  terceiro; zero migration, zero lógica nova.
- **Depends on:** nenhuma. Não bloqueia nem é bloqueada por outra story em andamento.

### Executor Assignment
- **Executor:** @dev (Dex).
- **Quality Gate:** @dev (Dex), pré-commit.
- **Quality Gate Tools:** `[code_review]`. Sem `migration_review` (não há migration). Sem suíte de
  testes automatizados aplicável — os três arquivos não têm teste hoje e a verificação é
  operacional (rodar e ler a saída), não asserção de código.

---

## Contexto

Em 04/09/2026, `packages/web/.env.local` foi renomeado para `packages/web/.env.producao.local`
nesta máquina, completando na prática o desenho que a Story `900-3b` já tinha estabelecido no
código (default do repositório é TESTE; `.env.local`, que vencia qualquer outro arquivo de env no
Next, apontava para PRODUÇÃO — o risco que a `900-3b` existe para eliminar). A `900-3b` também
substituiu **12 carregadores dotenv ad hoc** que liam esse arquivo por caminho literal por
`resolverAmbiente()` (`scripts/lib/db-env.ts`) — verificado nesta story: os 12 (`dump-agent-
prompts.ts`, `meta-backfill-leads.ts`, `backfill-yarden-portal-invites.ts`, `backfill-vind-portal-
invites.ts`, `backfill-campaign-entries.ts`, `sync-obra-sienge.ts`, `cleanup-duplicate-leads.ts`,
`backfill-criar-obras.ts` e outros) já usam `resolverAmbiente()` de fato; as menções a
`.env.local` que ainda existem neles são só comentário histórico explicando a migração, não
código vivo.

**Dois scripts nasceram depois da `900-3b` (Story `75-370`, ~31/08–04/09/2026) e não entraram
nessa migração** — continuam com o carregador ad hoc apontando, por caminho literal, para o
arquivo que não existe mais:

- `scripts/sienge-recto-liquido-check.ts:72` — `loadEnv(resolve(__dirname,
  "../packages/web/.env.local"))`
- `scripts/sienge-conciliar-extrato-pdf.ts:71` — mesma chamada

Medido nesta story (`npx tsx scripts/sienge-recto-liquido-check.ts`, sem `--env-file`, nesta
máquina já migrada): o `loadEnv()` engole o `ENOENT` (`try { readFileSync } catch { return
false }`) e o script segue em frente sem nenhuma das variáveis do arquivo — **falha fechado**, uma
linha abaixo, com:

```
Faltam variáveis de ambiente: SIENGE_SUBDOMAIN, SIENGE_USERNAME, SIENGE_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
```

Não há risco silencioso — mas os dois scripts não funcionam, e quem for rodá-los vai bater nesse
erro sem saber por quê, porque a mensagem não menciona arquivo nenhum.

### O que cada script faz, e por que isso importa para a decisão

Os dois nasceram na Story `75-370` (conciliação financeira do portal × Sienge, Vind + Yarden) e os
dois são **só leitura, contra a API de PRODUÇÃO do Sienge** — não existe ambiente de teste do
Sienge (não há `SIENGE_SUBDOMAIN`/`SIENGE_USERNAME`/`SIENGE_PASSWORD` em `.env.teste`,
`packages/web/.env.development` nem `packages/web/.env.development.example` preenchido —
conferido nesta story; `.env.development` tem inclusive um comentário explícito: *"Tokens de
integração externa (Meta/WhatsApp, Sienge, Resend) ficam FORA de propósito: em dev eles
disparariam efeito real no mundo"*). Ou seja: **estes dois scripts só fazem sentido contra
produção**, por desenho, e continuarão assim.

| Script | Faz | Toca Supabase? | `REQUIRED` |
|---|---|---|---|
| `sienge-recto-liquido-check.ts` | GET no Sienge + SELECT no Supabase (produção) | **Sim** — `createClient` na linha 165, usa `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | `SIENGE_SUBDOMAIN`, `SIENGE_USERNAME`, `SIENGE_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `sienge-conciliar-extrato-pdf.ts` | GET no Sienge + parse de PDF local | **Não** — achado desta story: apesar do cabeçalho do arquivo dizer "Só faz GET no Sienge e SELECT no Supabase" (linha 24) e o comentário da linha 70 falar da mesma variável "sensitive", **não há nenhum `createClient` nem uso de `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` no arquivo** (grep confirmado) — o cabeçalho está desatualizado/copiado do script irmão | `SIENGE_SUBDOMAIN`, `SIENGE_USERNAME`, `SIENGE_PASSWORD` |

Nenhum dos dois **escreve** em lugar nenhum — o próprio `sienge-recto-liquido-check.ts` declara
isso no cabeçalho ("Só faz GET no Sienge e SELECT no Supabase — não escreve em lugar nenhum").

### Por que o carregador de `.env.local` existia (linha 69-71 de `sienge-recto-liquido-check.ts`)

> "Sempre complementa com o .env.local: variáveis marcadas como 'sensitive' na Vercel voltam
> vazias no `env pull` (é o caso da service role key), e o que já veio do --env-file não é
> sobrescrito."

Isso é a mesma armadilha já registrada no `CLAUDE.md` deste projeto: `vercel env pull` traz
variável `sensitive` com **valor vazio, sem erro**. O fluxo de uso pretendido é `vercel env pull
<tmp> && npx tsx scripts/sienge-recto-liquido-check.ts --env-file <tmp>` — o `--env-file` traz
`SIENGE_*` normalmente, mas `SUPABASE_SERVICE_ROLE_KEY` volta vazia (é `sensitive`); o
`packages/web/.env.local` complementava essa lacuna com o valor real, guardado localmente.

Essa razão de ser **continua válida** — só o arquivo mudou de nome. Para
`sienge-conciliar-extrato-pdf.ts`, como a tabela acima mostra, essa razão nunca se aplicou de fato
(o script não usa Supabase), mas o carregador foi copiado do script irmão mesmo assim.

---

## Decisão — trocar o caminho literal (Opção 1), NÃO migrar para `resolverAmbiente()`

Registrada aqui, tomada pelo `@sm`, não delegada ao `@dev`:

**Escolha: trocar `../packages/web/.env.local` por `../packages/web/.env.producao.local`** nos
dois scripts, mantendo o mecanismo de carregamento ad hoc como está.

**Por quê não migrar para `resolverAmbiente()` (Opção 2), apesar de ser o padrão que a `900-3b`
criou para matar exatamente esta classe de problema:**

1. **Os dois scripts só têm um ambiente-alvo possível — produção — por desenho, não por
   descuido.** `resolverAmbiente()` existe para decidir *qual* ambiente usar (`TRIFOLD_ENV=teste`
   vs `producao`) e para impedir que um script destrutivo rode no ambiente errado. Nenhum dos dois
   riscos existe aqui: não há credencial de Sienge de teste para alternar, e nenhum dos dois
   scripts escreve em banco nenhum. A guarda mais forte do `resolverAmbiente()`
   (`TRIFOLD_ALLOW_PROD=1`) só é exigida quando `escreve: true` — não seria nem acionada.
2. **A migração seria parcial de qualquer forma.** `resolverAmbiente()` resolve `SUPABASE_URL` /
   `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` — nada sobre `SIENGE_SUBDOMAIN` /
   `SIENGE_USERNAME` / `SIENGE_PASSWORD`, que continuariam vindo de `--env-file` (`vercel env
   pull`) exatamente como hoje. O mecanismo ad hoc de `--env-file` não seria eliminado por essa
   migração — só o complemento final do Supabase mudaria de lugar.
3. **A troca de 1 linha já resolve o problema real com o mesmo comportamento de sempre.** O
   `packages/web/.env.producao.local` é o arquivo que herdou literalmente o conteúdo do antigo
   `.env.local` (mesmo Supabase de produção, mesma service role key) — reapontar para ele preserva
   a semântica exata que o script já tinha, sem reinterpretar nada.
4. **Gatilho para reabrir esta decisão, registrado para não virar dívida silenciosa:** se algum
   dia um destes dois scripts ganhar um caminho de **escrita** no Supabase, a Opção 1 deixa de ser
   suficiente — nesse momento a migração para `resolverAmbiente({ escreve: true })` passa a valer
   a pena pelo `TRIFOLD_ALLOW_PROD=1` como freio deliberado. Até lá, não.

**Consequência aceita:** estes dois scripts continuam fora da unificação de `scripts/lib/db-env.ts`
e do "allowlist falha fechada" que ela garante para quem lê `SUPABASE_URL`. Aceitável porque nunca
tiveram ambiguidade de ambiente para começar.

---

## Acceptance Criteria

1. **AC1** — Em `scripts/sienge-recto-liquido-check.ts:72` e
   `scripts/sienge-conciliar-extrato-pdf.ts:71`, a chamada `loadEnv(resolve(__dirname,
   "../packages/web/.env.local"))` passa a apontar para
   `resolve(__dirname, "../packages/web/.env.producao.local")`. Nenhuma outra linha de código
   muda nos dois arquivos (mesma assinatura de `loadEnv`, mesma posição da chamada, mesmo `REQUIRED`).

2. **AC2 (testável, `sienge-recto-liquido-check.ts`)** — Rodando `npx tsx
   scripts/sienge-recto-liquido-check.ts` sem `--env-file`, numa máquina com
   `packages/web/.env.producao.local` populado (como esta), a saída de erro passa a ser
   **exatamente**:
   ```
   Faltam variáveis de ambiente: SIENGE_SUBDOMAIN, SIENGE_USERNAME, SIENGE_PASSWORD
   ```
   — **sem** `NEXT_PUBLIC_SUPABASE_URL` nem `SUPABASE_SERVICE_ROLE_KEY` na lista (prova de que o
   arquivo foi encontrado e as duas variáveis do Supabase carregaram). **Linha de base medida
   nesta story, antes do fix:** as 5 variáveis aparecem todas, porque o `ENOENT` é engolido em
   silêncio e nada carrega.

3. **AC3 (verificação estrutural, `sienge-conciliar-extrato-pdf.ts`)** — Como este script não usa
   nenhuma variável do Supabase (achado desta story, ver tabela em Contexto), a saída de "Faltam
   variáveis" não muda por este fix — a prova aqui é que `packages/web/.env.producao.local` existe
   e é legível (`test -r packages/web/.env.producao.local`) e que a chamada de `loadEnv()` no
   arquivo foi atualizada para esse caminho (revisão de código). Não é necessário instrumentar o
   script para provar isto.

4. **AC4** — O comentário nas linhas 69-71 de `sienge-recto-liquido-check.ts` (que cita
   `.env.local`) é reescrito citando `.env.producao.local`, preservando a explicação da causa raiz
   (variável `sensitive` da Vercel volta vazia no `env pull`). Não remover a explicação — só trocar
   o nome do arquivo.

5. **AC5 (achado incluído por ser o mesmo defeito e correção trivial)** — O comentário de uso na
   linha 2 de `packages/web/scripts/pipeline-diag.mjs` (`// Run with: node
   --env-file=packages/web/.env.local packages/web/scripts/pipeline-diag.mjs`) hoje **quebra o
   processo** se seguido ao pé da letra — medido nesta story:
   ```
   $ node --env-file=packages/web/.env.local -e "console.log('ok')"
   node: packages/web/.env.local: not found
   ```
   (Node recusa iniciar quando `--env-file` aponta para um caminho inexistente — não é apenas
   comentário morto, é comando que falha.) O comentário passa a citar
   `packages/web/.env.producao.local` (produção) e, como o script não é exclusivo do Sienge e não
   tem dependência de ambiente única, menciona `packages/web/.env.development` como alternativa
   para rodar contra teste.

6. **AC6 (sem regressão / sem invenção)** — Nenhuma outra linha muda nos três arquivos além das
   citadas nos ACs acima. Sem migration. Sem migração para `resolverAmbiente()` nesta story
   (decisão registrada acima). Nenhuma variável de ambiente nova é criada ou exigida.

---

## Fora do escopo

- **Migrar os dois scripts do Sienge para `resolverAmbiente()`** — decisão tomada acima (Opção 1),
  não é dívida esquecida.
- **Corrigir o cabeçalho desatualizado de `sienge-conciliar-extrato-pdf.ts`** ("Só faz GET no
  Sienge e SELECT no Supabase", linha 24) para remover a menção a Supabase que não existe no
  arquivo — achado catalogado nesta story (ver tabela em Contexto), mas é prosa, não caminho
  quebrado; não é o defeito que esta story resolve. Fica para quem tocar o arquivo por outro
  motivo.
- **Comentários de `dump-agent-prompts.ts`** (linhas 29, 81, 86) que ainda mencionam
  `packages/web/.env.local` — achado durante a investigação desta story: são só prosa
  desatualizada, o código (`loadCredentials()`) já usa `resolverAmbiente()` de fato (migrado na
  `900-3b`). Não quebra nada, não está no caminho de execução. Não entra nesta story.
- **Qualquer credencial de Sienge em `.env.teste` ou `packages/web/.env.development`** — não
  existem hoje, por decisão deliberada (comentário do próprio arquivo), e criar isso não é o
  objetivo aqui.

---

## Tasks / Subtasks

- [x] **T1** — Trocar o literal `../packages/web/.env.local` por
  `../packages/web/.env.producao.local` em `scripts/sienge-recto-liquido-check.ts:72`. (AC1)
- [x] **T2** — Mesma troca em `scripts/sienge-conciliar-extrato-pdf.ts:71`. (AC1)
- [x] **T3** — Atualizar o comentário das linhas 69-71 de `sienge-recto-liquido-check.ts` para
  citar `.env.producao.local`. (AC4)
- [x] **T4** — Atualizar o comentário de uso na linha 2 de
  `packages/web/scripts/pipeline-diag.mjs`. (AC5)
- [x] **T5** — Rodar `npx tsx scripts/sienge-recto-liquido-check.ts` sem `--env-file` e colar a
  saída no Dev Agent Record, confirmando o AC2 (lista de variáveis faltando SEM as duas do
  Supabase). (AC2)
- [x] **T6** — Confirmar `test -r packages/web/.env.producao.local` (exit 0) e revisar a chamada
  atualizada em `sienge-conciliar-extrato-pdf.ts`. (AC3)
- [x] **T7** — Rodar `node --env-file=packages/web/.env.producao.local -e "console.log('ok')"`
  para confirmar que o novo caminho citado no comentário do `pipeline-diag.mjs` não quebra (exit
  0, sem "not found"). (AC5)

---

## Dev Notes

**Paths e linhas exatas (conferidos nesta story, podem ter deslocado ±1-2 linhas se o arquivo for
tocado por outra story antes):**
- `scripts/sienge-recto-liquido-check.ts:69-72` (comentário + chamada)
- `scripts/sienge-conciliar-extrato-pdf.ts:70-71` (comentário + chamada)
- `packages/web/scripts/pipeline-diag.mjs:2` (comentário de uso, único lugar do arquivo que cita
  `.env.local` — o resto do script lê `process.env` direto, sem loader próprio)

**`loadEnv()` é idêntica nos dois scripts do Sienge** (parser de dotenv minimalista, sem
dependência nova) — não há função compartilhada para extrair; cada arquivo tem sua cópia. Fora de
escopo desatrelar essa duplicação nesta story (seria refactor, não fix).

**Por que não usar `scripts/lib/db-env.ts` nem para só o Supabase:** `resolverAmbiente()` lê
`.env.teste`/`.env.producao` **na raiz do repo**, não em `packages/web/`. Adotar só o pedaço do
Supabase criaria uma terceira convenção de onde a service role key de produção pode vir
(`packages/web/.env.producao.local` **e** `.env.producao` da raiz), o que é pior que manter os
dois scripts com a mesma convenção um do outro. A decisão foi tudo-ou-nada; ficou "nada" pelos
motivos na seção Decisão.

**Evidência já coletada nesta story (reaproveitar no Dev Agent Record, não precisa remedir):**
```
$ npx tsx scripts/sienge-recto-liquido-check.ts
Faltam variáveis de ambiente: SIENGE_SUBDOMAIN, SIENGE_USERNAME, SIENGE_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
Passe --env-file com um arquivo que as tenha (ex: vercel env pull).

$ node --env-file=packages/web/.env.local -e "console.log('ok')"
node: packages/web/.env.local: not found
```

**`packages/web/.env.producao.local` já existe nesta máquina e já contém `NEXT_PUBLIC_SUPABASE_URL`
e `SUPABASE_SERVICE_ROLE_KEY`** (conferido via `grep -o "^[A-Z_]*=" packages/web/.env.producao.local`)
— não é necessário criar nem popular nada para validar o AC2 nesta máquina. Não tem
`SIENGE_SUBDOMAIN`/`SIENGE_USERNAME`/`SIENGE_PASSWORD` — por isso o AC2 espera exatamente essas 3
na mensagem residual, não uma lista vazia.

---

## Testing

- Sem suíte automatizada aplicável (scripts sem teste hoje, mesma situação de outros scripts em
  `scripts/`). Verificação é operacional: rodar os comandos do AC2 e AC5 e colar a saída real no
  Dev Agent Record — **não** descrever como "deveria funcionar", executar de fato (mesmo princípio
  de `feedback_validacao_exit_code`: o teste tem que ser capaz de reprovar, e a evidência é a saída
  real do comando, não uma suposição).
- Não requer credenciais reais do Sienge para validar esta story — o próprio ponto do AC2 é que a
  mensagem de erro *muda de forma* (5 variáveis → 3 variáveis) sem precisar ter Sienge configurado.

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> Não há chave `coderabbit_integration` em `.aios-core/core-config.yaml` neste projeto. Validação
> de qualidade via revisão manual (`@dev` pré-commit) apenas. O review automatizado real deste
> repositório é o GitHub App do CodeRabbit, disparado no PR (`.claude/rules/coderabbit-integration.md`).

---

## Dev Agent Record

### Agent Model Used
claude-opus-5[1m] — @dev (Dex), modo YOLO. Branch: `fix/900-69-scripts-sienge-env-producao-local`
(criada de `origin/main` = `a839de64`).

### Debug Log References

**AC2 — `sienge-recto-liquido-check.ts`, medido nesta máquina (a lista de variáveis é a prova; o
script sai antes de qualquer chamada HTTP, então nenhuma cota da API do Sienge foi consumida).**

ANTES do fix (5 variáveis — o `ENOENT` de `.env.local` é engolido e nada carrega):
```
$ npx tsx scripts/sienge-recto-liquido-check.ts
Faltam variáveis de ambiente: SIENGE_SUBDOMAIN, SIENGE_USERNAME, SIENGE_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
Passe --env-file com um arquivo que as tenha (ex: vercel env pull).
EXIT=1
```

DEPOIS do fix (3 variáveis — as duas do Supabase carregaram, prova de que o arquivo foi encontrado):
```
$ npx tsx scripts/sienge-recto-liquido-check.ts
Faltam variáveis de ambiente: SIENGE_SUBDOMAIN, SIENGE_USERNAME, SIENGE_PASSWORD
Passe --env-file com um arquivo que as tenha (ex: vercel env pull).
EXIT=1
```
Bate **exatamente** com a linha exigida pelo AC2. O `exit 1` residual é o comportamento correto e
esperado: não há credencial de Sienge nesta máquina (nem deve haver — `.env.producao.local` não tem
`SIENGE_*`, conferido antes de rodar justamente para garantir que o script pararia antes da rede).

**AC3 — `sienge-conciliar-extrato-pdf.ts`.** Além da revisão de código e do `test -r`, a chamada foi
provada por sonda temporária montada **byte a byte** a partir do próprio arquivo (bloco `loadEnv` +
a linha `loadEnv(resolve(__dirname, ...))` extraídos por script, não redigitados), rodada de
`scripts/` para ter o mesmo `__dirname`, com controle negativo no caminho antigo:
```
$ test -r packages/web/.env.producao.local ; echo $?
0

$ npx tsx scripts/__sonda-900-69.ts          # caminho novo
loadEnv encontrou o arquivo: true
NEXT_PUBLIC_SUPABASE_URL carregada: true
EXIT=0

$ npx tsx scripts/__sonda-900-69-neg.ts      # mesma sonda, caminho antigo (controle negativo)
loadEnv encontrou o arquivo: false
NEXT_PUBLIC_SUPABASE_URL carregada: false
EXIT=1
```
As duas sondas foram removidas em seguida (`git status` limpo dos dois arquivos, confirmado).

Não-regressão da mensagem do script (não muda com este fix, como o AC3 prevê):
```
$ npx tsx scripts/sienge-conciliar-extrato-pdf.ts
Faltam variáveis de ambiente: SIENGE_SUBDOMAIN, SIENGE_USERNAME, SIENGE_PASSWORD
EXIT=1
```

**AC5 — `pipeline-diag.mjs`.** Os dois caminhos citados no comentário novo bootam; o antigo continua
recusando iniciar (controle negativo, `node v22.22.2`):
```
$ node --env-file=packages/web/.env.producao.local -e "console.log('ok')"
ok                      EXIT=0
$ node --env-file=packages/web/.env.development -e "console.log('ok')"
ok                      EXIT=0
$ node --env-file=packages/web/.env.local -e "console.log('ok')"
node: packages/web/.env.local: not found     EXIT=9
```
E a alternativa de teste que o comentário passou a documentar foi rodada **de ponta a ponta**, não só
no boot (o script é só-leitura; 99 linhas de saída, banco de teste):
```
$ node --env-file=packages/web/.env.development packages/web/scripts/pipeline-diag.mjs
ADMINS: [ { ... name: 'Admin da Empresa A', role: 'admin' ... } ]
EXIT=0
```

**Gates (exit code, nunca `grep -c`; cache furado com `TURBO_FORCE=true`):**
```
TURBO_FORCE=true pnpm lint        → EXIT=0   (8/8 tasks; 0 errors, 30 warnings pré-existentes)
TURBO_FORCE=true pnpm type-check  → EXIT=0   (8/8 tasks)
pnpm test                         → EXIT=0   (327 arquivos, 4633 passed | 6 expected fail)
TURBO_FORCE=true pnpm build       → EXIT=0   (5/5 tasks; @trifold/web compiled successfully)
```

### Completion Notes List

- **AC1** — literal trocado nos dois scripts, e só isso: `scripts/sienge-recto-liquido-check.ts:72`
  e `scripts/sienge-conciliar-extrato-pdf.ts:71`. Mesma assinatura de `loadEnv`, mesma posição da
  chamada, `REQUIRED` intocado nos dois.
- **AC2** — provado por medição real, antes e depois: 5 variáveis → 3, com a linha idêntica à
  exigida. Confirmado antes de rodar que `packages/web/.env.producao.local` **não** tem `SIENGE_*`
  (`grep -c '^SIENGE' → 0`), então o script para na checagem de variáveis e **não gasta cota da API
  do Sienge** — decisão deliberada, dado que a conta já esteve em 84% do limite diário.
- **AC3** — `test -r` exit 0 + sonda byte a byte com controle negativo (ver Debug Log). Confirmado
  por `grep` que o arquivo segue sem `createClient` e sem uso de `NEXT_PUBLIC_SUPABASE_URL` /
  `SUPABASE_SERVICE_ROLE_KEY`, como a story apurou — daí a saída não mudar.
- **AC4** — comentário reescrito citando `.env.producao.local` **com a explicação da causa raiz
  preservada** ("variáveis marcadas como 'sensitive' na Vercel voltam vazias no `env pull` (é o caso
  da service role key), e o que já veio do --env-file não é sobrescrito"). Só o nome do arquivo mudou;
  a quebra de linha do bloco foi reajustada porque o nome novo é mais longo. Segue com 3 linhas.
- **AC5** — comentário do `pipeline-diag.mjs` passou a citar `.env.producao.local` (marcado como
  produção) e ganhou uma segunda linha com `.env.development` como alternativa de teste. Antes de
  documentar a alternativa, conferi que `.env.development` tem as duas variáveis que o script exige,
  com valor não-vazio — e depois rodei o script inteiro contra teste (exit 0). O comentário não
  aponta para comando que falha, que era exatamente o defeito do AC5.
- **AC6** — o diff tem 5 linhas removidas e 6 adicionadas, todas nos três arquivos e todas cobertas
  pelos ACs acima. Sem migration, sem `resolverAmbiente()` (decisão da story mantida, não reaberta),
  sem variável de ambiente nova.
- **IDS** — SEARCH: `grep -rn "env\.local"` em `scripts/`, `packages/web/scripts/`, `packages/web/src`
  e `package.json` → só 3 ocorrências em caminho de execução (as três desta story); as demais
  (`meta-backfill-leads.ts`, `dump-agent-prompts.ts`, `backfill-*`, `db-env.ts`, `run-seed.ts` etc.)
  são comentário histórico sobre a migração da 900-3b, fora de escopo por decisão da story.
  DECIDE: **ADAPT** — reaproveitar o carregador ad hoc que já existe em cada arquivo, trocando só o
  literal; nenhum arquivo novo criado, nenhum utilitário novo.
- **Nada tocado fora do escopo:** `packages/web/.env.development`, `.env.producao.local`, `.env.teste`
  e `.env.producao` não foram lidos além de `grep` de **nomes** de chave (nunca valores) e não entram
  no commit — o teste `scripts/gitignore-env.test.ts` já guarda isso, e `git status` confirma que
  nenhum deles aparece.
- **@po pulado deliberadamente** por instrução do fluxo mínimo do repositório para correção pequena
  (`@dev → @qa → @devops`); a decisão de desenho veio pronta e justificada do @sm e não foi reaberta.
- **Não provado / limites:** (a) `scripts/` não é coberto por `pnpm type-check` (nenhuma task do turbo
  o inclui) — a garantia dos dois scripts do Sienge vem da execução real, não de `tsc`; (b) o caminho
  feliz dos dois scripts do Sienge (com `SIENGE_*` de verdade, via `vercel env pull --env-file`) **não
  foi exercitado**, por não haver credencial nesta máquina e para não consumir cota da API — o que
  este fix garante é que a lacuna que restava era só do Sienge, não mais do Supabase; (c) não rodei
  `pipeline-diag.mjs` contra produção (só contra teste), por ser leitura de dados reais sem necessidade
  para o AC.

### File List
| Arquivo | Mudança |
|---|---|
| `scripts/sienge-recto-liquido-check.ts` | linha 72: caminho do `loadEnv` → `.env.producao.local` (AC1); linhas 69-71: comentário reescrito, explicação do `sensitive` preservada (AC4) |
| `scripts/sienge-conciliar-extrato-pdf.ts` | linha 71: caminho do `loadEnv` → `.env.producao.local` (AC1). Comentário da linha 70 intocado (não cita o arquivo pelo nome) |
| `packages/web/scripts/pipeline-diag.mjs` | linha 2: comentário de uso → `.env.producao.local`; linha 3 nova: `.env.development` como alternativa de teste (AC5) |

Nenhum arquivo criado ou removido. Duas sondas temporárias (`scripts/__sonda-900-69.ts`,
`scripts/__sonda-900-69-neg.ts`) foram criadas para a prova do AC3 e **removidas** — não estão no
commit.

---

## Change Log
| Data | Autor | Mudança |
|---|---|---|
| 2026-09-04 | @sm (River) | Criação da story — Draft |
| 2026-09-04 | @dev (Dex) | Implementação dos ACs 1-6 (troca do literal em 2 scripts + 2 comentários). AC2 medido antes/depois (5 → 3 variáveis). Gates: lint, type-check e `pnpm test` em exit 0. Status Draft → Ready for Review. |

---

## QA Results

### Review Date: 2026-09-04

### Reviewed By: Quinn (Test Architect)

**Veredito: PASS** — rodada 1. Branch `fix/900-69-scripts-sienge-env-producao-local`, base
`a839de64`, commits `8f2b4b2b` (fix + story) e `11cefc9d` (só memória). Escopo medido:
**3 arquivos, +7 −6** (`git diff origin/main...HEAD --shortstat -- scripts packages`), nenhuma
linha de lógica.

**Restrição de custo respeitada:** zero chamada à API do Sienge. Conferi
`grep -c '^SIENGE' packages/web/.env.producao.local` → `0` e
`env | grep -cE '^(SIENGE_|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)'` → `0` antes de
rodar qualquer coisa; com `SIENGE_*` ausente os dois scripts saem no filtro de `REQUIRED`, que é
anterior ao `baseUrl` e a qualquer `fetch`. Nada escrito em produção; o único banco lido de ponta a
ponta foi o de **teste**.

### Os 7 checks

| # | Check | Resultado |
|---|---|---|
| 1 | Code review | PASS — `loadEnv` e `REQUIRED` intocados, chamada na mesma linha, arquivos com o mesmo tamanho |
| 2 | Testes | PASS — `pnpm test` fresco: **EXIT=0**, 327 arquivos, 4633 passed \| 6 expected fail; `vitest run scripts/`: EXIT=0, 144 testes |
| 3 | Acceptance criteria | PASS — AC1 a AC6 medidos um a um |
| 4 | Sem regressões | PASS — ninguém importa os 3 arquivos; mensagem do `conciliar` inalterada; `pipeline-diag` roda de ponta a ponta |
| 5 | Performance | N/A |
| 6 | Segurança | PASS — nenhum env rastreado além dos `.example`; 5 envs confirmados ignorados por `git check-ignore --no-index` |
| 7 | Documentação | PASS — com 2 ressalvas `low` de registro |

### Medições (exit codes)

**AC1** — chamada em 72 (recto) e 71 (conciliar) **antes e depois**; arquivos com 376 e 465 linhas
antes e depois; `diff` do bloco `const REQUIRED` antes/depois → **EXIT=0** nos dois.

**AC2 — a prova central, confirmada com controle negativo próprio:**
```
DEPOIS (HEAD)                    Faltam variáveis de ambiente: SIENGE_SUBDOMAIN, SIENGE_USERNAME, SIENGE_PASSWORD                                              EXIT=1
ANTES (origin/main, mesmo __dirname)  Faltam variáveis de ambiente: SIENGE_SUBDOMAIN, SIENGE_USERNAME, SIENGE_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   EXIT=1
```
O "antes" não é relato reaproveitado: rodei `git show origin/main:scripts/sienge-recto-liquido-check.ts`
gravado dentro de `scripts/` (mesmo `__dirname` — única forma de o caminho relativo significar a
mesma coisa), conferindo que a linha 72 do temporário dizia `.env.local`. É mudança de **forma** da
saída: as duas variáveis do Supabase só saem da lista de faltantes se o arquivo foi encontrado **e**
as chaves têm valor não-vazio (o filtro é `!process.env[k]`). Contaminação de shell descartada
antes de medir.

**AC3 — duas provas independentes, nenhuma delas redigitando código:**
1. Corpo do `loadEnv` byte-idêntico entre os dois scripts (sha256 `c39f38dc…`, normalizando apenas
   a anotação `: boolean`) e linha de chamada byte-idêntica (sha256 `036aa258…`), ambos em
   `scripts/` ⇒ a medição do AC2 transfere sem hipótese adicional.
2. Runtime **contra o arquivo real**, sem cópia: sentinela `process.on('exit', …)` injetada por
   `NODE_OPTIONS="--import …"` → `SUPA_URL_SET=true SRK_SET=true`; mesma sentinela na versão de
   `origin/main` → `false/false`. (Armadilha: o `tsx` gera processos filhos e a sentinela imprime
   3 linhas — só uma é do processo que rodou o script.)
   `test -r packages/web/.env.producao.local` → **EXIT=0**.

**AC4 — preservação provada byte a byte:** desdobrando as quebras de linha e mascarando o nome do
arquivo, o comentário antes e depois é a **mesma string**. A explicação da causa raiz (`vercel env
pull` devolve variável `sensitive` **vazia, sem erro**) está preservada palavra por palavra.

**AC5** — `--env-file` com `.env.producao.local` → **EXIT=0**; com `.env.development` → **EXIT=0**;
com o caminho antigo → **EXIT=9** (`node: packages/web/.env.local: not found`). A alternativa de
teste documentada é real: `.env.development` tem as duas variáveis exigidas, não-vazias
(`URL_SET=true SRK_SET=true`), e o script rodou de ponta a ponta contra teste (EXIT=0, 99 linhas).

**AC6** — nenhuma outra linha; `--name-only | grep env` devolve só 2 `.md` (story + memória), zero
arquivo de env; `git ls-files` só rastreia os `.example`. **Varredura de completude:** `grep -rn
'env\.local'` no repositório inteiro → **zero leitor vivo** de `packages/web/.env.local` sobrando;
o que resta é `.gitignore`, o gerador do framework, as instruções de reversão do `scripts/README.md`
(de propósito), a mensagem de `env.ts` (DOC-002) e comentários históricos da 900-3b.

**Árvore limpa:** nenhuma sonda do @dev sobrou em `scripts/`; os 3 temporários que **eu** criei
(2 baselines + 1 sonda de lint) foram removidos e `git status --porcelain -uall -- scripts
packages/web/scripts` sai **vazio**.

**Gates não reexecutados, com justificativa de alcance medida:** `turbo lint`, `turbo type-check` e
`turbo build`. `pnpm type-check`/`pnpm lint` são `turbo <task>` e a task só existe em `packages/*`
— a raiz não é workspace, então **`scripts/*.ts` não passa por `tsc` nem por eslint em gate
nenhum** (confirma a limitação (a) do @dev); e o `include` do `packages/web/tsconfig.json` lista
`**/*.ts|tsx|mts`, **sem `.mjs`**. Somado a "ninguém importa os 3 arquivos", nenhuma das mudanças é
alcançável por esses gates. O que as cobre é execução real — feita. Rodei ainda `eslint` no `.mjs`
alterado (**EXIT=0**, 0 errors/0 warnings, 1 entrada no relatório JSON) com o **alcance do linter
provado** por sonda com erro real no mesmo diretório.

### Ressalvas (todas `low`, nenhuma bloqueante)

- **DOC-001** (docs) — a nota do AC6 acima diz "5 linhas removidas e 6 adicionadas"; o medido é
  **6 removidas e 7 adicionadas**. Erro de contagem no registro, não no código: a afirmação
  substantiva confere linha por linha. @devops: o corpo do PR no gate já usa os números certos.
- **MNT-001** (code) — dívida **pré-existente** confirmada: `scripts/` na raiz não tem gate
  estático algum (nem `tsc`, nem eslint). São ~40 scripts operacionais, vários com service-role de
  produção. Backlog, não desta story.
- **DOC-002** (docs) — `packages/web/src/lib/env.ts:11` ainda manda "Check your .env.local file.".
  Mesma família do AC5, mas não quebra processo (é texto de erro). Backlog.

### Sobre a nota do `.env.local` da RAIZ

Medi: o arquivo existe, tem **exatamente 1 variável** (`VERCEL_OIDC_TOKEN`, gerada pela CLI da
Vercel) e `grep -ci supabase` → **0**. Dizer que ele "aponta para o Supabase de teste" seria falso —
mas essa frase **não está em nenhum artefato commitado**: a memória do @dev
(`project_env_sem_ambiente_de_teste.md`) afirma apenas "arquivo diferente, não é o que os scripts
antigos liam", que é exatamente verdade, e o alerta útil (`ls -a | grep env` responde outra pergunta
que `ls -a packages/web | grep env`) está no lugar certo. **A memória do @dev não precisa de
correção**; a única melhoria opcional seria registrar o que o arquivo da raiz contém. Os links
`[[…]]` seguem íntegros apesar do `name:` ter mudado de slug (zero referência ao slug antigo).

### Sobre as limitações declaradas pelo @dev

Caminho feliz dos scripts do Sienge não exercitado e `pipeline-diag` não rodado contra produção:
**aceito, e foi a decisão certa** nos dois casos — custaria cota de API/leitura de dados reais e não
provaria nada sobre esta mudança, cuja lacuna fechada (Supabase) é observável na lista de `REQUIRED`
que muda de forma. A falta de cobertura estática de `scripts/` está registrada como MNT-001.

### Gate Status

Gate: PASS → `docs/qa/gates/900.69-scripts-sienge-env-producao-local.yml`

**Recomendação:** mergear. Não há empilhamento (base = `origin/main` no início da revisão);
@devops reconferir `git merge-base origin/main HEAD` antes do push. Status recomendado após o
merge: **Done**.

— Quinn, guardião da qualidade 🛡️
