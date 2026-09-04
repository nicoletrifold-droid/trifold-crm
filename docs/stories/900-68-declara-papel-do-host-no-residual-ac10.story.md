# Story 900-68 — A régua da AC10 volta a ficar verde: `papel-do-host.ts` entra no `RESIDUAL_DECLARADO`

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Story:** 900-68 — número reconfirmado livre em 2026-09-04 (maior story existente em
  `docs/stories/` é `900-67`; nenhuma referência a `900-68` em branches, refs remotos ou PRs
  abertos nesta data).
- **Status:** Ready for Review
- **Priority:** P0 — `main` está vermelha. O check bloqueante `type-check · lint · test`
  reprova em `origin/main` e bloqueia **todo** merge no repositório até esta story fechar.
- **Complexity:** XS — uma linha de dados (entrada no mapa) + duas asserções ajustadas no mesmo
  arquivo de teste. Nenhum arquivo de produção é tocado.

### Executor Assignment
- **Executor:** @dev (Dex).
- **Quality Gate:** @dev (Dex), pré-commit.
- **Quality Gate Tools:** `[code_review]`. Sem `migration_review` (nenhuma migration; a mudança é
  só no arquivo de teste `app-url-fallback.test.ts`).

---

## User Story
**Como** qualquer agente ou pessoa que precise abrir PR neste repositório,
**eu quero** que o check `type-check · lint · test` volte a passar em `main`,
**para que** o repositório pare de estar bloqueado para merge por uma régua que está correta e
só não foi atualizada depois que um PR seguinte introduziu o arquivo que ela deveria vigiar.

---

## O defeito, a causa, e por que a régua está certa

O teste `packages/web/src/lib/tenancy/app-url-fallback.test.ts`, describe `"AC10 — nenhum sítio
de fallback ficou para trás"`, reprova em `origin/main` com:

```
AssertionError: expected { …(7) } to deeply equal { …(6) }
+   "lib/tenancy/papel-do-host.ts": 1,
```

**Contraprova já feita (não repetir):** worktree destacado em `origin/main` puro, sem nenhuma
branch de feature, reproduz `EXIT=1` com a assertion idêntica. É defeito de `main`, não de PR.

### A colisão entre dois PRs já mergeados

- **#565 (Story 900-66)** criou a régua AC10: um mapa `RESIDUAL_DECLARADO: Record<string,
  number>` (arquivo → contagem de ocorrências do literal `crm.trifold.eng.br` em **código**,
  comentários excluídos por `linhasDeCodigo()` de `fonte-scan.ts`) comparado com `.toEqual` contra
  a varredura de `packages/web/src`. É `.toEqual` sobre o mapa **inteiro**, nunca `.has()` — o
  cabeçalho do próprio arquivo explica que `.has` ficaria verde com arquivos a mais que ninguém
  migrou. Hoje a lista declara **6** arquivos.
- **#569 (Story 900-65)**, mergeado depois, trouxe o arquivo novo
  `packages/web/src/lib/tenancy/papel-do-host.ts`, que contém o literal `crm.trifold.eng.br`
  **1 vez em código** (confirmado por leitura nesta story — ver "Contagem medida" abaixo).

A régua funcionou exatamente como projetada: ela existe para pegar todo arquivo novo que passe a
conter o host nu, e pegou. **O que falta é declarar o arquivo novo — a régua não está errada, e
não deve ser enfraquecida.**

### Contagem medida (não presumida)

`git show origin/main:packages/web/src/lib/tenancy/papel-do-host.ts | grep -n
'crm.trifold.eng.br'` devolve **4 linhas** — 42, 78, 104 e 105. **Três** estão dentro de
comentário de bloco JSDoc (42, 104 e 105: prosa explicando a decisão) e **uma** está dentro do
array de código (78):

```ts
export const HOSTS_DE_TENANT: readonly string[] = [
  "crm.trifold.eng.br",              // ← única ocorrência EM CÓDIGO
  "trifold-crm.vercel.app",
  "trifold-crm-teste.vercel.app",
  "trifold-crm-teste-three.vercel.app",
]
```

`ocorrenciasNoCodigo()` (de `fonte-scan.ts`) descarta as três ocorrências em comentário e conta
**1** na linha do array. **Confirma o `1` que o CI já vinha acusando.** Se, no momento da
implementação, uma nova medição contra `origin/main` divergir disso (por exemplo se outro PR
tiver mexido no arquivo nesse meio-tempo), **o número medido manda** — declare o valor real no
`RESIDUAL_DECLARADO`, não o `1` desta story.

### Medição independente do @po (validação de 2026-09-04) — a entrada do AC1 é NECESSÁRIA e SUFICIENTE

O @po replicou `arquivosDeProducao()` + `linhasDeCodigo()` + `ocorrenciasNoCodigo()` de
`fonte-scan.ts` num script isolado e rodou a mesma varredura da AC10 contra a árvore de
`origin/main` (`git archive origin/main packages/web/src`). Resultado literal:

```
arquivos varridos: 1035
RESIDUAL MEDIDO: {
  "app/api/cron/billing-reminders/route.ts": 1,
  "app/broker/instalar/page.tsx": 3,
  "app/dashboard/configuracoes/corretores/novo/page.tsx": 1,
  "lib/email-layout/components/header.ts": 1,
  "lib/notificacoes.ts": 1,
  "lib/tenancy/app-url-fallback.ts": 1,
  "lib/tenancy/papel-do-host.ts": 1        ← a única divergência
}
papel-do-host raw occurrences: 4
papel-do-host code occurrences: 1
única linha de CÓDIGO que contém o host:  "crm.trifold.eng.br",
PRESENCA MEDIDA: {"arquivosComChamada":24,"chamadas":30}
```

Três consequências que fecham a story:

1. **A contagem `1` é a medida certa** — confirmada pelo filtro real, não por `grep` cru.
2. **`papel-do-host.ts` é a ÚNICA divergência.** As outras 6 entradas batem byte a byte com o
   declarado hoje: nenhum outro arquivo derivou entre #565 e #569. A entrada do AC1 é, portanto,
   **suficiente** — não há um oitavo arquivo escondido esperando o próximo vermelho.
3. **O `it` irmão (régua de PRESENÇA) não é afetado**: a medição devolve exatamente
   `{arquivosComChamada: 24, chamadas: 30}`, os mesmos números já declarados no arquivo. Ou seja,
   `papel-do-host.ts` **não** chama `tentarAppUrl` — coerente com a decisão de desenho abaixo — e
   nenhum sítio migrado se desmigrou. **Não mexer nesses dois números.**

### Por que a saída é declarar o arquivo, não migrar `papel-do-host.ts` para `tentarAppUrl`

Há duas saídas possíveis, e **não são equivalentes**:

1. ✅ **Declarar `"lib/tenancy/papel-do-host.ts": 1` em `RESIDUAL_DECLARADO`**, com comentário de
   justificativa no padrão das outras 6 entradas.
2. ❌ Fazer `papel-do-host.ts` consumir o helper `tentarAppUrl`/`resolveAppUrlFallback` de
   `app-url-fallback.ts` (Story 900-66).

A (1) é a correta, e o motivo é semântico, não de conveniência: em `papel-do-host.ts` o literal
está dentro de `HOSTS_DE_TENANT`, uma **denylist de segurança** — hosts de inquilino que **nunca**
podem ser promovidos a host de console admin, nem que `PLATFORM_ADMIN_HOSTS` mande (ver o
comentário da própria constante, que nomeia o desfecho catastrófico: uma variável de ambiente
digitada errada faria o CRM inteiro da Trifold responder 404).

`tentarAppUrl`/`resolveAppUrlFallback` respondem a uma pergunta oposta: *"para onde mando o
usuário quando **não sei** a URL desta org?"* (um fallback de **ausência de dado**, resolvido em
tempo de execução, por org). `HOSTS_DE_TENANT` responde: *"quais hosts **nunca** podem virar
admin, independente de qualquer configuração"* (uma exceção nomeada, estática, de **segurança**).
Roteá-lo pelo resolver de fallback misturaria duas responsabilidades que a própria Story 900-65
separa com cuidado no comentário da constante — e criaria uma dependência de runtime (leitura de
env, possível exceção `AppUrlIndisponivelError`) dentro de uma função que hoje é uma lista
estática avaliada em import-time, exigida por `hostsAdminDeclarados()` a cada requisição.

**A story não reabre essa decisão.** O trabalho aqui é exclusivamente declarar o residual.

---

## Acceptance Criteria

**AC1 — `RESIDUAL_DECLARADO` ganha a sétima entrada.**
Em `packages/web/src/lib/tenancy/app-url-fallback.test.ts`, o mapa `RESIDUAL_DECLARADO` passa a
ter a entrada `"lib/tenancy/papel-do-host.ts": 1` (ou o valor medido no momento da implementação,
se divergir de 1 — ver "Contagem medida"), com um comentário de justificativa no mesmo padrão das
6 entradas existentes (uma linha explicando **por que** o arquivo pode conter o literal, citando a
Story 900-65 e a natureza de denylist de segurança de `HOSTS_DE_TENANT`).

**AC1.1 — O JSDoc do próprio mapa deixa de mentir.**
O bloco de documentação imediatamente acima de `RESIDUAL_DECLARADO` afirma hoje, em prosa:
*"Cinco vêm da tabela 'O que fica FORA' da story, um por linha dela. O sexto é o módulo criado por
esta story"* e *"⚠️ A AC10.4 listou cinco, porque foi escrita antes de o resolver existir. O sexto
não é uma exclusão a mais"*. Com sete entradas, essa contagem passa a ser falsa. O JSDoc é
atualizado para descrever o sétimo com a mesma honestidade das outras duas famílias — cinco da
tabela "O que fica FORA", um é o módulo dono do literal, e o sétimo é a denylist de segurança da
Story 900-65, que não é candidata a migrar. **Este AC não é cosmético:** todo o valor da AC10 vem
de a prosa do cabeçalho explicar por que cada perdão existe; um cabeçalho que conta errado é o
primeiro passo para alguém "arrumar" o mapa apagando uma entrada.

**AC2 — Os dois `it`s que contam "seis" passam a contar "sete".**
- O `it("a lista declarada tem exatamente os seis arquivos autorizados")` é renomeado para citar
  "sete" e sua asserção `expect(Object.keys(RESIDUAL_DECLARADO)).toHaveLength(6)` vira
  `toHaveLength(7)`.
- O `it("o residual é EXATAMENTE o declarado — arquivo E contagem")` **não muda de forma** —
  continua `.toEqual(RESIDUAL_DECLARADO)` sobre o mapa inteiro — e passa a bater porque
  `RESIDUAL_DECLARADO` (AC1) agora inclui a sétima entrada.

**AC3 — A régua não pode ser enfraquecida.**
Nenhuma mudança nesta story pode trocar `.toEqual` por `.has()`, remover a contagem por nome de
arquivo, adicionar uma exceção genérica ("perdoar" um arquivo sem contagem), ou de qualquer outra
forma reduzir o poder de alcance da AC10 original (Story 900-66). A única mudança de dado
permitida é a adição da entrada do AC1; a única mudança de asserção permitida é o `toHaveLength`
do AC2.

Explicitamente **proibido** nesta story, cada item já medido como desnecessário:
- Tocar em `{arquivosComChamada: 24, chamadas: 30}` do `it` de PRESENÇA — a medição do @po devolve
  exatamente esses dois números em `origin/main`. Se o @dev sentir necessidade de alterá-los, algo
  além desta story mudou: **PARE e reporte**, não ajuste o número para o teste ficar verde.
- Tocar em `expect(arquivos.length).toBeGreaterThan(100)` (o sinal de vida; medido: 1035).
- Remover ou relaxar qualquer um dos 6 `it`s do segundo `describe` ("o detector, contra as formas
  que já driblaram uma régua neste repositório") — são a prova das três cegueiras do cabeçalho.
- Ajustar `ocorrenciasNoCodigo()`/`linhasDeCodigo()` em `fonte-scan.ts` para "não contar" o
  literal do array. Isso perdoaria o arquivo em vez do literal declarado — a cegueira 3 do
  cabeçalho da AC10 — e cegaria a régua para os outros 6 declarados de uma vez.

**AC4 — Nenhum arquivo de produção é tocado.**
`papel-do-host.ts` permanece byte a byte como está em `origin/main`. Esta story é uma correção de
teste, não uma migração de código — `git diff --stat` ao final mostra alteração em exatamente
`app-url-fallback.test.ts` (mais este arquivo de story).

**AC5 — O CI completo volta a fechar.**
O comando equivalente ao check bloqueante do CI (`type-check · lint · test` — confirmar o comando
exato em `.github/workflows/` ou rodar `pnpm --filter web test`, `pnpm --filter web lint`,
`pnpm --filter web type-check` isoladamente, cada um pelo seu exit code, não por contagem de
linhas de saída — ver gotcha de `timeout`/`grep -c` do repositório) é reexecutado localmente
contra a branch desta story e termina com exit code 0 nos três. Reportar o total de testes
passando (referência: 4617 no relato do bug, todos verdes exceto o único descrito aqui).

---

## Tasks / Subtasks

- [x] Task 1 — Remedir a contagem (AC: 1)
  - [x] Ler `papel-do-host.ts` em `origin/main` (ou na branch local, se já sincronizada) e contar
    as ocorrências do literal `crm.trifold.eng.br` **em código**, não em comentário, com o mesmo
    critério de `ocorrenciasNoCodigo()`.
  - [x] Confirmar que o número bate com o `1` desta story; se divergir, usar o número medido.
- [x] Task 2 — Declarar a entrada (AC: 1, 3)
  - [x] Adicionar `"lib/tenancy/papel-do-host.ts": <N>` a `RESIDUAL_DECLARADO`, com comentário de
    justificativa (citar Story 900-65 e a natureza de denylist de segurança de
    `HOSTS_DE_TENANT`).
- [x] Task 3 — Ajustar a contagem declarada (AC: 2)
  - [x] Renomear o `it` de "seis" para "sete" arquivos e trocar `toHaveLength(6)` por
    `toHaveLength(7)`.
- [x] Task 4 — Rodar a suíte de `lib/tenancy/` inteira, não só o arquivo novo (AC: 5)
  - [x] `pnpm --filter web test -- lib/tenancy` (ou equivalente) e confirmar que o `it` de
    `.toEqual` (AC10) fica verde, e que nenhum outro teste da pasta quebrou.
- [x] Task 5 — Rodar o check completo do CI (AC: 5)
  - [x] `type-check`, `lint`, `test` isolados, cada um com o exit code conferido (não `grep -c`).
  - [x] Registrar no Dev Agent Record os três exit codes e a contagem total de testes.
- [x] Task 6 — Mutação de controle (recomendado, não bloqueante)
  - [x] Reverter temporariamente a entrada nova (ou zerar a contagem) e confirmar que o `it` de
    `.toEqual` fica **vermelho** — prova de que a régua ainda pega o defeito que motivou esta
    story, e não apenas "ficou verde porque os números batem por acidente". Desfazer antes de
    commitar.

---

## Riscos

| # | Risco | Probabilidade | Mitigação (já embutida em AC) |
|---|---|---|---|
| R1 | @dev "resolve" o vermelho enfraquecendo a régua (`.has()`, remover contagem, perdoar o arquivo) — é o caminho mais curto e o mais destrutivo | Média (a pressão de `main` vermelha empurra para o atalho) | **AC3**, com a lista explícita do que é proibido, e **Task 6** (mutação de controle: reverter a entrada tem que deixar o `it` vermelho) |
| R2 | A contagem declarada divergir da real no momento da implementação (outro PR mexer em `papel-do-host.ts`) | Baixa | **AC1** manda o número **medido** vencer o `1` desta story; e o próprio `.toEqual` do AC2 reprova um número inventado — a régua é autoverificável |
| R3 | @dev "consertar" também os números da régua irmã (`24`/`30`) por reflexo, cegando a régua de PRESENÇA | Baixa | **AC3** proíbe nominalmente e manda PARAR e reportar; a medição do @po registra os dois números como corretos em `origin/main` |
| R4 | O JSDoc do mapa continuar dizendo "cinco/sexto" e alguém, meses adiante, "arrumar" o mapa apagando a entrada que sobra da conta | Média (é o tipo de dívida que ninguém vê) | **AC1.1** |
| R5 | Outro PR mergear em `main` durante a implementação e trazer um oitavo arquivo com o literal | Baixa | Medição do @po mostra que hoje há exatamente uma divergência; **AC5** reroda a suíte completa contra a branch, então um oitavo apareceria como vermelho antes do merge, não depois |

---

## Dev Notes

### Onde mexer
- **Único arquivo de produção-de-teste tocado:** `packages/web/src/lib/tenancy/app-url-fallback.test.ts`.
  - `RESIDUAL_DECLARADO` (a constante — ver trecho completo já citado no corpo desta story).
  - O `it("a lista declarada tem exatamente os seis arquivos autorizados", ...)`.
  - O `it("o residual é EXATAMENTE o declarado — arquivo E contagem", ...)` — **não precisa de
    mudança de código**, só passa a bater porque o mapa mudou.
- **Não tocar:** `packages/web/src/lib/tenancy/papel-do-host.ts`,
  `packages/web/src/lib/tenancy/fonte-scan.ts`, `packages/web/src/lib/tenancy/app-url-fallback.ts`.

### O padrão de comentário das 6 entradas existentes (para a sétima seguir o mesmo)
Cada entrada de `RESIDUAL_DECLARADO` tem, imediatamente acima, um comentário de uma ou duas linhas
dizendo **por que aquele arquivo pode conter o literal sem ser migrado**. Exemplos já no arquivo:
`header.ts` → "alvo EXCLUSIVO da Story 900-67"; `notificacoes.ts` → "constante INCONDICIONAL (sem
`??`, sem env)". A entrada nova segue o mesmo formato: uma frase dizendo que `HOSTS_DE_TENANT` é
denylist de segurança, não fallback de ausência de dado, e por isso não é candidata a consumir
`tentarAppUrl`.

### `ocorrenciasNoCodigo()` — por que a contagem é 1 e não 4
`fonte-scan.ts` (`linhasDeCodigo()`) descarta comentário de linha, de bloco e a CONTINUAÇÃO do
bloco antes de contar. `papel-do-host.ts` tem o literal **4** vezes no arquivo cru, e **3** delas
estão dentro de comentários JSDoc (linhas 42, 104 e 105 da versão em `origin/main`) — só a
ocorrência da linha 78, dentro do array `HOSTS_DE_TENANT`, sobrevive ao filtro e conta.
(A redação original desta story dizia "3 no cru, 2 em comentário": a conclusão — 1 em código —
estava certa, a aritmética não. Corrigido pelo @po na validação, com medição abaixo.)

### Testing
- Vitest, `packages/web/src/lib/tenancy/app-url-fallback.test.ts`.
- Rodar a suíte inteira de `lib/tenancy/`, não só o arquivo alterado — o arquivo irmão
  `trifold-org-literal.test.ts` (Story 900-23) roda na mesma pasta e não deve ser afetado por esta
  mudança, mas confirmar mesmo assim.
- Confirmar o exit code de `type-check`, `lint` e `test` isoladamente. `timeout` não existe por
  padrão no macOS (gotcha já registrado no repositório) — não usar `timeout <cmd> | grep -c erro`
  como prova de sucesso; o comando pode nem executar e ainda assim devolver `0` linhas.

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> A chave `coderabbit_integration.enabled` não existe em `.aios-core/core-config.yaml` (conferido
> nesta sessão). Quality validation via revisão manual apenas. O review automático real deste
> repositório é o GitHub App do CodeRabbit (`.coderabbit.yaml`), independente desta seção.

---

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-09-04 | 1.0 | **Implementada — Status Ready → Ready for Review.** Branch `fix/900-68-residual-declarado-papel-do-host`, criada de `origin/main` (`19843658`). Defeito reproduzido na base ANTES de editar: `pnpm vitest run app-url-fallback.test.ts` = **exit 1**, `expected { …(7) } to deeply equal { …(6) }`, `+ "lib/tenancy/papel-do-host.ts": 1`. Contagem remedida pelo próprio scanner (não por `grep`): **1**, idêntica ao declarado pelo @sm/@po — nenhum número da story precisou ser alterado. Aplicados AC1 (a sétima entrada, com o motivo: `HOSTS_DE_TENANT` é denylist de segurança avaliada em import-time, semântica oposta ao resolver de fallback), AC1.1 (o JSDoc passa a contar sete em três famílias, e explica que o sétimo entrou por #569 depois da régua de #565) e AC2 (`toHaveLength(6)`→`(7)`, `it` renomeado para "sete"). `.toEqual` intacto; `24`/`30` intactos; `toBeGreaterThan(100)` intacto; os 6 `it`s do detector intactos; `fonte-scan.ts` intacto (AC3). AC4 provado por `git diff --exit-code` em `papel-do-host.ts` + `fonte-scan.ts` + `app-url-fallback.ts` = **0**. Gates (AC5): `pnpm test` **exit 0** (324 arquivos, 4599 passed + 6 expected fail), `TURBO_FORCE=true pnpm type-check` **exit 0** (8/8, 0 cached), `TURBO_FORCE=true pnpm lint` **exit 0** (0 errors, 30 warnings pré-existentes). 4 mutações de controle, todas **exit 1** e todas restauradas por `shasum -c` — ver Debug Log. | Dex (@dev) |
| 2026-09-04 | 0.2 | **Validada pelo @po — GO, 9/10, Status Draft → Ready.** Medição independente: replicado `arquivosDeProducao`+`linhasDeCodigo`+`ocorrenciasNoCodigo` contra `git archive origin/main`, 1035 arquivos varridos — residual medido = os 6 declarados **+ `lib/tenancy/papel-do-host.ts": 1`**, única divergência; régua de PRESENÇA medida em `{arquivosComChamada:24, chamadas:30}`, idêntica ao declarado (a entrada do AC1 é necessária **e** suficiente). Corrigido pelo @po: (a) a aritmética da contagem crua — são **4** ocorrências no arquivo cru (linhas 42/78/104/105), **3** em comentário JSDoc e **1** em código, não "3 e 2" como dizia o draft (a conclusão `1` estava certa); (b) **AC1.1** novo — o JSDoc acima de `RESIDUAL_DECLARADO` afirma "Cinco… O sexto…" e passa a mentir com sete entradas; (c) **AC3** ganhou a lista nominal do que é proibido, incluindo não tocar em `24`/`30`, no `toBeGreaterThan(100)`, nos 6 `it`s do detector, nem em `fonte-scan.ts`; (d) seção **Riscos** (R1–R5) — o checklist exigia e o draft não tinha. Confirmada a decisão de desenho (declarar, não migrar) contra o código: `HOSTS_DE_TENANT` é denylist de segurança avaliada em import-time, semântica oposta ao resolver de fallback. | Pax (@po) |
| 2026-09-04 | 0.1 | Draft inicial. `main` vermelha por 1 teste de 4617 (`app-url-fallback.test.ts`, AC10 da Story 900-66) desde que a Story 900-65 (#569) introduziu `papel-do-host.ts` sem atualizar o `RESIDUAL_DECLARADO` que a 900-66 (#565) havia fechado com 6 entradas. Contagem remedida contra `origin/main`: 1 ocorrência em código (2 outras estão em comentário JSDoc, descartadas por `linhasDeCodigo()`). Número de story reconfirmado livre: `900-67` já existe (PR #566, Story "isTrifold por org_id no e-mail") — não é o alvo desta story, é apenas a story vizinha cujo comentário no teste a nomeia como dona exclusiva de `header.ts`. Decisão de desenho cravada: declarar o residual, não migrar `papel-do-host.ts` para o resolver de fallback (são responsabilidades opostas — denylist de segurança vs. fallback de ausência de dado). | River (@sm) |

---

## Dev Agent Record

### Agent Model Used
Claude Opus 5 (1M context) — `claude-opus-5[1m]`, @dev (Dex), modo YOLO.

### Debug Log References

**Base.** Branch `fix/900-68-residual-declarado-papel-do-host` criada de `origin/main` recém-buscado
(`git fetch origin`; `origin/main` = `19843658 6602701a0723787049595332aa88df4c`). A `main` local
estava 16 commits atrasada, como avisado — a branch NÃO saiu dela.

**Reprodução do defeito na base, antes de qualquer edição** (o vermelho tem que existir para o
verde valer):

```
$ pnpm vitest run packages/web/src/lib/tenancy/app-url-fallback.test.ts
 ❯ app-url-fallback.test.ts (24 tests | 1 failed)
     × o residual é EXATAMENTE o declarado — arquivo E contagem
AssertionError: expected { …(7) } to deeply equal { …(6) }
+   "lib/tenancy/papel-do-host.ts": 1,
      Tests  1 failed | 23 passed (24)
EXIT=1
```

**Contagem remedida (Task 1).** Duas medidas independentes, e elas concordam:
- `grep -n 'crm.trifold.eng.br' papel-do-host.ts` → **4** linhas: 42, 78, 104, 105. Três em JSDoc
  (42/104/105), uma em código (78, dentro do array `HOSTS_DE_TENANT`).
- O próprio `ocorrenciasNoCodigo()` — via a saída da assertion acima, que é o scanner real e não uma
  réplica — reporta **1**. **Bate com o `1` da story; nenhum número da story precisou ser corrigido.**
- A régua irmã de PRESENÇA passou verde na base e no final, sem ser tocada: `{arquivosComChamada: 24,
  chamadas: 30}` seguem como estavam. **Não houve necessidade de mexer nelas, então não mexi.**

**Gates (Task 5) — exit code de cada comando, capturado em `$?` isoladamente, nunca contagem de
linha.** O `timeout` do GNU não existe no macOS e `grep -c` dá falso verde; nenhum dos dois foi
usado como prova.

| Comando | Exit | Saída |
|---|---|---|
| `pnpm test` (= `vitest run`) | **0** | `Test Files 324 passed (324)` / `Tests 4599 passed \| 6 expected fail (4605)` — 106.6s |
| `TURBO_FORCE=true pnpm type-check` | **0** | `Tasks: 8 successful, 8 total` / `Cached: 0 cached, 8 total` — 50.2s |
| `TURBO_FORCE=true pnpm lint` | **0** | `Tasks: 8 successful, 8 total` / `Cached: 0 cached, 8 total`; `@trifold/web:lint ✖ 30 problems (0 errors, 30 warnings)` — 85.1s |
| `pnpm vitest run packages/web/src/lib/tenancy` (Task 4) | **0** | `Test Files 18 passed (18)` / `Tests 510 passed (510)` |

Cache do turbo forçado por `TURBO_FORCE=true` (`Cached: 0 cached` nos dois casos). Duas tentativas
descartadas por erro de flag, registradas para quem repetir: `pnpm test --force` sai 1 com
`CACError: Unknown option --force` (o `test` da raiz é `vitest run` direto, sem turbo), e
`pnpm type-check -- --force` sai 1 com `TS5093` (o `--force` chega no `tsc`, não no turbo). Nenhuma
das duas é reprovação de código — são exatamente o tipo de exit 1 que se confundiria com defeito.

**Mutações de controle (Task 6) — a régua continua CAPAZ de reprovar.** Quatro mutações, cada uma
rodada de verdade, cada uma vermelha, cada uma restaurada e conferida:

| # | Mutação | Exit | O que ficou vermelho | Restauração conferida por |
|---|---|---|---|---|
| A | Removi a entrada nova de `RESIDUAL_DECLARADO` (volta ao estado de `origin/main`) | **1** | **2** `it`s: `expected [ …(6) ] to have a length of 7` **e** `expected { …(7) } to deeply equal { …(6) }` com `+ "lib/tenancy/papel-do-host.ts": 1` | `cp` do backup + `git diff --stat` de volta a `20 insertions(+), 4 deletions(-)` |
| B | Subi a contagem declarada de `1` para `2` | **1** | `- "lib/tenancy/papel-do-host.ts": 2` / `+ … : 1` | idem A |
| C1 | Injetei o host nu **em código** num arquivo de produção **não declarado** (`lib/tenancy/trifold-org.ts`) | **1** | `expected { …(8) } to deeply equal { …(7) }`, `+ "lib/tenancy/trifold-org.ts": 1` | `git checkout --` + `shasum -c` → `OK`, `git status --short` vazio |
| C2 | Injetei uma **segunda** ocorrência em código num arquivo **já declarado** (`lib/notificacoes.ts`, declarado `1`) | **1** | `- "lib/notificacoes.ts": 1` / `+ … : 2` | `git checkout --` + `shasum -c` → `OK`, `git status --short` vazio |

C2 é a que importa mais: prova que o perdão é **do literal declarado, não do arquivo** — a cegueira
3 do cabeçalho continua fechada depois desta story. Depois das quatro restaurações, o arquivo voltou
a **exit 0** com `Tests 24 passed (24)`.

**AC4 provado, não afirmado.** `git diff --exit-code -- papel-do-host.ts fonte-scan.ts
app-url-fallback.ts` → **0** (idênticos a `origin/main`), e `git diff --stat -- packages/ supabase/
scripts/` lista **um único arquivo**: `app-url-fallback.test.ts`. Zero migration.

### Completion Notes

- **AC1 ✅** Sétima entrada `"lib/tenancy/papel-do-host.ts": 1` (valor **medido**, não presumido),
  com comentário no padrão das outras 6: o literal ali está dentro de `HOSTS_DE_TENANT`, uma
  **denylist de segurança** (hosts de inquilino que nunca podem ser promovidos a host de console
  admin, nem que `PLATFORM_ADMIN_HOSTS` mande), lista estática avaliada em import-time, que responde
  à pergunta **oposta** à do resolver — e por isso não é candidata a consumir `tentarAppUrl`. O
  comentário também registra que as outras 3 ocorrências do arquivo estão em JSDoc e são descartadas
  por `linhasDeCodigo()`, "por isso 1, e não 'o arquivo está perdoado'".
- **AC1.1 ✅** O JSDoc acima do mapa não conta mais "cinco/sexto": passa a declarar **sete em três
  famílias** (cinco da tabela "O que fica FORA" da 900-66, o sexto é o módulo dono do literal, o
  sétimo é a denylist da 900-65), e ganhou um parágrafo dizendo que o sétimo entrou por **#569**,
  mergeado depois da régua de **#565** — a régua estava certa, faltava declarar o arquivo novo — e
  que se um oitavo aparecer o caminho é declarar com o motivo, nunca afrouxar a asserção.
- **AC2 ✅** `it("a lista declarada tem exatamente os sete arquivos autorizados")` +
  `toHaveLength(7)`. O `it` do `.toEqual` **não mudou uma letra** — ficou verde só porque o mapa
  mudou, que é o desenho.
- **AC3 ✅** Nada foi enfraquecido, e a mutação A/B/C1/C2 é a prova de que o poder de alcance
  continua lá. Conferido item por item da lista de proibições: `.toEqual` intacto; contagem por nome
  de arquivo mantida (nenhum arquivo "perdoado" sem número); `{arquivosComChamada: 24, chamadas: 30}`
  intactos; `toBeGreaterThan(100)` intacto; os 6 `it`s do segundo `describe` intactos;
  `fonte-scan.ts` intacto por `git diff --exit-code`.
- **AC4 ✅** Nenhum arquivo de produção tocado. `papel-do-host.ts` byte a byte como em `origin/main`.
- **AC5 ✅** `test` / `type-check` / `lint` todos **exit 0**, cache do turbo forçado.
- **[AUTO-DECISION]** *O cabeçalho do arquivo (linha 28) também dizia "Dois dos **seis** declarados
  hospedam sítios migrados" → corrigido para "sete".* Razão: é a mesma mentira aritmética que a
  AC1.1 manda matar, no mesmo arquivo, e a AC1.1 justifica-se dizendo que "um cabeçalho que conta
  errado é o primeiro passo para alguém 'arrumar' o mapa apagando uma entrada" — deixar a segunda
  ocorrência viva anularia metade do AC. É uma palavra, em comentário, sem tocar asserção nem dado,
  e a afirmação corrigida continua verdadeira (os dois arquivos que hospedam sítios migrados seguem
  sendo `lib/notificacoes.ts` e `billing-reminders`). Alternativa considerada e rejeitada: deixar
  como está para respeitar a letra do AC1.1, que nomeia só o JSDoc do mapa.
- **Nada ficou sem prova.** Não há item desta story cuja verificação eu não tenha executado.
- **Fora de escopo, não feito, apenas nomeado:** o cabeçalho diz, em rhetórica, que `.has` "fica
  verde com sete arquivos a mais" (linha 14). É número retórico, não contagem do mapa — não foi
  alterado, mas agora colide visualmente com o "sete" real do mapa. Se incomodar, é uma linha de
  prosa numa story futura; não mexi para não inflar o diff de um P0.

### File List

**Modificado (1):**
- `packages/web/src/lib/tenancy/app-url-fallback.test.ts` — AC1 (sétima entrada em
  `RESIDUAL_DECLARADO`), AC1.1 (JSDoc do mapa reescrito para sete/três famílias), AC2
  (`toHaveLength(6)`→`(7)` e `it` renomeado), + a correção de "seis"→"sete" no cabeçalho do arquivo.

**Nenhum arquivo de produção modificado. Nenhuma migration.**

---

## QA Results

### Review Date: 2026-09-04 — Rodada 1

### Reviewed By: Quinn (@qa, Test Architect)

**Veredito: PASS.** Commit avaliado: `9e0d87ce`, sobre `origin/main` = `19843658`
(`git merge-base origin/main HEAD` = `19843658` — a branch está na ponta, não precisa rebase nem
retarget). Escopo real conferido por `git diff origin/main HEAD --name-only`: fora de `docs/`,
**um único arquivo** — `packages/web/src/lib/tenancy/app-url-fallback.test.ts` (+26/−5).

#### Não confiei no relato — remedi

- **Contraprova de que `main` está vermelha.** Escrevi a versão de `origin/main` do arquivo de
  teste sobre esta árvore (byte a byte igual a `origin/main` em produção, provado) e rodei:
  **EXIT=1**, `expected { …(7) } to deeply equal { …(6) }`, `+ "lib/tenancy/papel-do-host.ts": 1`.
  Sem esta contraprova, o verde da branch poderia significar apenas "o teste não roda".
- **A contagem `1` é a medida certa, medida por mim.** Não conferi o número pelo `grep`: subi a
  contagem declarada para `2` e li o lado `Received` da assertion, que é o `ocorrenciasNoCodigo()`
  real. Devolveu **1**. No cru são 4 ocorrências (linhas 42, 78, 104, 105); 3 em JSDoc, 1 em
  código — a da linha 78, dentro de `HOSTS_DE_TENANT`.
- **4 mutações de controle, todas EXIT 1**, todas restauradas e a restauração provada
  (`shasum -c` OK, `git status --short -- packages/` **vazio**, `git diff --stat HEAD -- packages/`
  **vazio**):

| # | Mutação | Exit | O que ficou vermelho |
|---|---|---|---|
| M2 | Remover a sétima entrada (volta ao estado de `origin/main`) | **1** | 2 `it`s: `to have a length of 7 but got 6` **e** `{ …(7) } to deeply equal { …(6) }` |
| M1 | Contagem declarada `1` → `2` | **1** | `- "lib/tenancy/papel-do-host.ts": 2` / `+ … : 1` |
| C1 | Host nu em código num arquivo de produção **não declarado** (arquivo novo temporário) | **1** | `{ …(8) } to deeply equal { …(7) }`, `+ "lib/tenancy/_qa-900-68-temp.ts": 1` |
| C2 | **Segunda** ocorrência em código num arquivo **já declarado** (`lib/notificacoes.ts`, declarado 1) | **1** | `- "lib/notificacoes.ts": 1` / `+ "lib/notificacoes.ts": 2` |

  **C2 é a que importa, e eu a confirmei por conta própria:** o perdão continua sendo do **literal
  declarado**, nunca do **arquivo**. A cegueira nº 3 do cabeçalho segue fechada depois desta story.

#### A régua não foi enfraquecida (AC3) — conferido por leitura E por mutação

`.toEqual` sobre o mapa inteiro (linha 247) **intacto**, não mudou uma letra no diff · contagem ao
lado de cada nome **mantida** (sete entradas, sete números; nenhum arquivo perdoado sem número) ·
`toBeGreaterThan(100)` (linha 235) **intacto** · `{arquivosComChamada: 24, chamadas: 30}` (linha
266) **intactos**, fora de qualquer hunk · os **6** `it`s do detector (linhas 271, 275, 279, 290,
294, 299) **intactos** · `fonte-scan.ts` **intacto** (`git diff --exit-code` = 0).

#### Gates do CI (o check bloqueante é `pnpm type-check` / `pnpm lint` / `pnpm test`, conferido em `.github/workflows/ci.yml`)

| Comando | Exit | Saída |
|---|---|---|
| `TURBO_FORCE=true pnpm type-check` | **0** | 8/8, `Cached: 0 cached, 8 total` — 23.8s |
| `TURBO_FORCE=true pnpm lint` | **0** | 8/8, `Cached: 0 cached`; `✖ 30 problems (0 errors, 30 warnings)` |
| `pnpm test` | **0** | `Test Files 324 passed (324)` / `Tests 4599 passed \| 6 expected fail (4605)` — 98.2s |
| `npx vitest run app-url-fallback.test.ts` | **0** | 24 passed (24) |

Cache hit não é evidência: forcei com `TURBO_FORCE=true` e confirmei `Cached: 0 cached` nos dois.
Os 30 warnings do lint são **pré-existentes e de outros arquivos** — conferi a lista de arquivos
citados no log e `app-url-fallback.test.ts` **não aparece nenhuma vez**. Confirmo também a leitura
do @dev sobre os dois falsos vermelhos (`pnpm test --force` → `CACError`; `pnpm type-check --
--force` → `TS5093`): nenhum é reprovação de código.

#### AC4 — nenhum arquivo de produção tocado

`git diff --exit-code origin/main HEAD -- papel-do-host.ts fonte-scan.ts app-url-fallback.ts` =
**0**. Zero migration. Como produção é byte a byte igual a `origin/main`, não há comportamento de
runtime que possa ter regredido.

#### A decisão de desenho está certa — e verificada no código, não só na prosa

`HOSTS_DE_TENANT` (papel-do-host.ts:77) tem **um único consumidor**: `hostsAdminDeclarados()`
(linha 134, `HOSTS_DE_TENANT.includes(host)` na 140), que alimenta `decidirNoHostAdmin` (linha 162)
a cada requisição. Do outro lado, `resolveAppUrlFallback` (app-url-fallback.ts:96) **lê env**
(`falhaFechadaLigada()`) e **lança** `AppUrlIndisponivelError`. Rotear a denylist pelo resolver
colocaria leitura de env e um caminho que lança dentro de uma guarda de segurança hoje estática e
resolvida em import-time. Declarar era a saída correta; não reabri a decisão.

#### Parecer sobre a [AUTO-DECISION] do @dev (linha 28: "seis" → "sete") — **CERTA, aprovada**

A linha 28 é uma contagem **da lista declarada** ("Dois dos seis declarados"), a mesma classe de
mentira aritmética que o AC1.1 existe para matar, no mesmo arquivo, e ficou falsa no instante em
que a sétima entrada entrou. Pior: é justamente o parágrafo que **explica por que a contagem ao
lado de cada nome existe** (cegueira nº 3) — deixá-la contando errado anularia metade do valor do
AC1.1, cuja própria justificativa se aplica verbatim a ela. Verifiquei que a frase corrigida
continua **verdadeira**: dois dos sete declarados (`lib/notificacoes.ts` e `billing-reminders`)
seguem sendo os que hospedam sítios migrados. Custo: uma palavra em comentário, zero asserção,
zero dado — não colide com o AC3, que proíbe enfraquecer régua, não corrigir prosa.

#### Parecer sobre a linha 14 ("sete arquivos a mais") — **DEIXAR COMO ESTÁ**

O @dev acertou em não mexer. Aquele "sete" não é contagem do mapa: é o número retórico do
argumento das linhas 6-7 do mesmo cabeçalho ("alcançar 21 dos 28 sítios e esquecer 7"). É
rastreável e não ficou falso com esta story. E o risco que o AC1.1 protege é alguém **apagar uma
entrada** porque o cabeçalho discorda do mapa — a linha 14 não afirma nada sobre quantas entradas o
mapa tem, então não pode induzir esse erro. Registrado como **DOC-001 (low, não bloqueante)**:
numa story futura de prosa, remover o numeral ("fica verde com arquivos a mais que ninguém
migrou"). Não vale inflar o diff de um P0 nem gastar outra rodada de gate por uma palavra.

#### Os 7 checks

| # | Check | Resultado |
|---|---|---|
| 1 | Code review | **PASS** — um arquivo de teste, diff legível, comentário da entrada nova no padrão das outras 6 e factualmente verdadeiro |
| 2 | Unit tests | **PASS** — 324 arquivos / 4599 passed + 6 expected fail, exit 0; alvo 24/24; 4 mutações provam que o teste é capaz de reprovar |
| 3 | Acceptance criteria | **PASS** — AC1, AC1.1, AC2, AC3, AC4, AC5 todos MET, cada um verificado por mim |
| 4 | No regressions | **PASS** — produção byte a byte igual a `origin/main`; suíte inteira verde |
| 5 | Performance | **PASS** — nenhuma mudança de runtime; uma chave a mais no mapa é O(1) |
| 6 | Security | **PASS** — nenhuma superfície nova; a saída escolhida **preserva** a denylist estática em import-time |
| 7 | Documentation | **PASS** — JSDoc e cabeçalho atualizados e verdadeiros; DOC-001 (low) registrado |

#### Recomendação

**MERGEAR IMEDIATAMENTE**, base `main`, sem empilhamento (a branch está na ponta de `origin/main`).
Enquanto isso não mergear, o check bloqueante segue vermelho por um motivo que não é o PR de
ninguém, e o sinal de CI de todo PR aberto — inclusive o **#570** — segue cego. `Ready for Review`
→ `Done` após o merge por @devops. O corpo de PR sugerido está no campo `corpo_do_pr` do gate.

### Gate Status

Gate: PASS → `docs/qa/gates/900.68-declara-papel-do-host-no-residual-ac10.yml`
