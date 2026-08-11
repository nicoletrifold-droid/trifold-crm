# Story 87-1 — Governança do painel: quem mudou o prompt, quando, por quê, e como voltar

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** Ready for Review
**Origem:** extraída da Story **87-0** (era a AC5-A) no corte aprovado pelo Gabriel em 05/08/2026
**Criada por:** @sm (River) em 2026-08-05 · **Validada por:** @po (Pax) em 2026-08-10 (GO condicionado, 7/10)
**Tamanho:** **M** (migration + trigger + 2 caminhos de escrita + 1 componente de UI + runbook)
**Executores:** @dev (server action, rota, UI, npm script) · @data-engineer (trigger + aplicação em prod)
**Depende de:** 87-0 **Tarefa 1** (snapshot + `--check`) — **entregue e em produção** (PR #377,
commit `17e9a8dc`). A **Tarefa 2** (reconciliação de conteúdo) foi feita **à mão em produção** em
06/08 e **não voltou para o repositório** — o `--check` está **vermelho hoje** (ver §Medições).
Isso **não bloqueia** esta story; é a evidência de que ela é necessária.
**Não bloqueia a Onda 1.** Cabe na regra de corte: é adição de **processo**, não de **caminho de
decisão da Nicole** (nenhum arquivo de `packages/ai/src/chat/` é tocado).

---

## Medições do @po (2026-08-10, produção `dsopqkqjkmhytudaaolv`, somente SELECT + o script `--check`)

**M1 — O snapshot apodreceu em 2 dias.** `npx tsx scripts/dump-agent-prompts.ts --check` sai **1**
com **3 de 7 slugs divergentes** — o snapshot foi commitado em 07/08 e já não descreve a produção:

```
❌ agent_prompts DIVERGE do snapshot (3 problema(s)):
   • guardrails: snapshot 9071 chars / sha 3c2daa66 · banco 9070 chars / sha 1eb1d414
       L20 snapshot: "...disponivel la no stand de vendas!..."
       L20 banco:    "...disponivel la na sede da Trifold!..."
   • property-presentation: snapshot 3905 chars / sha 4d3343b5 · banco 4525 chars / sha 1af195a6
       L5  banco:    "REGRA DE OURO DESTA SECAO: status, endereco, previsao de entrega..."
   • system-personality: snapshot 2477 chars / sha 2e5cefe0 · banco 2477 chars / sha c24c5713
       L19 snapshot: "...queira VISITAR o stand de vendas"
       L19 banco:    "...queira VISITAR a sede da Trifold"
```

Duas dessas três edições (`stand de vendas` → `sede da Trifold`) **não têm story, não têm commit e
não têm autor**. Foi exatamente assim que o `visit-scheduling` de 04/08 nasceu. **O mecanismo
reincidiu em 72 horas.**

**M2 — O erro que chegou à lead ainda está no repositório.** O cabeçalho `### YARDEN RESIDENCE`
(nome errado; no cadastro é **Yarden**) foi corrigido em produção — hoje o banco diz
`### YARDEN — como posicionar`. Mas `packages/ai/src/prompts/_production/property-presentation.txt:22`
**ainda diz `### YARDEN RESIDENCE`**. A cópia revisável do repo é, neste momento, a versão com o
defeito. Um rollback cego pelo snapshot **reintroduz o bug que queimou 4 dias de conversa.**

**M3 — Não existe campo de autoria.** Colunas de `agent_prompts` em produção:
`id, org_id, name, slug, content, type, is_active, created_at, updated_at`. **Não há `updated_by`.**
"Quem editou isso?" é hoje literalmente irrespondível pelo banco.

**M4 — `updated_at` dos 7 slugs = `2026-08-10T13:50:52` … `13:51:00` UTC.** Os sete foram escritos
hoje, numa janela de 8 segundos — o experimento de sentinela do Gabriel (injeção + restauração).
O experimento foi legítimo e reversível, **mas do banco ninguém consegue saber disso**: 14 escritas
em prompts de produção, sem autor, sem motivo, sem "isto era um teste". E ele **apagou o
`updated_at` de 04/08 17:28** que era a última pista do mistério da 87-0 (o valor sobreviveu por
acidente no `manifest.json` do snapshot). **A story não é hipótese: o dano que ela previne ocorreu
enquanto ela esperava validação.** Este é o baseline da AC5.

**M5 — Existe uma QUARTA superfície de escrita, não mapeada, e é a pior.**
`scripts/run-seed.ts:71-77` faz `upsert` dos **7 slugs** com `content: "[placeholder — Story 3.x]"`,
e está ligada ao comando **`npm run seed`** (`package.json:10`). Não é hipotética nem obscura: é o
comando de seed documentado do repositório. Um `npm run seed` apontando para `.env.local` **zera os
sete prompts de produção**.

**M6 — A AC12 da 87-0 NÃO foi implementada.** `scripts/seed-prompts.ts` (99 linhas) **não tem
nenhum gate**: `grep` por `--bootstrap`, `process.exit`, `confirm`, `SEED_` não retorna nada. A
87-0 continua `Ready` (só a Tarefa 1 subiu). A tabela das superfícies desta story dizia
"neutralizado pela AC12 da 87-0" — **falso hoje**; corrigido abaixo.

**M7 — O `--check` não tem dono nem gatilho.** `.github/workflows` **não existe** (só
`.github/agents/`), **D5 segue sem decisão**, e não há npm script (`package.json` tem `test`,
`lint`, `type-check`, `seed` — nenhum `prompts:check`). O `--check` funciona perfeitamente e
**ninguém o executa**. Daí a **AC7**.

---

## Story

**Como** quem acabou de descobrir que o prompt de produção era um fork editado à mão, sem autor,
sem data e sem motivo,
**Quero** que toda escrita em `agent_prompts` registre **quem, quando e por quê**, e guarde a
versão anterior,
**Para que** a próxima divergência seja uma pergunta de 30 segundos (`quem mudou isso?`) em vez
de uma investigação de dois dias — e para que voltar atrás seja um `UPDATE`, não uma arqueologia.

---

## Context

A **D-87-0-a** (05/08) definiu que **o painel admin é a fonte da verdade** dos prompts da Nicole.
Isso resolve a ambiguidade, mas **transfere para o painel um trabalho que o git fazia de graça**:
histórico, autoria, motivo e rollback.

Enquanto o código era a fonte de fato, um `git log` respondia tudo. Agora não responde mais —
e a Story 87-0 documenta o custo exato disso:

- o `visit-scheduling` de produção não correspondia a **nenhum commit**, e até hoje **não se sabe
  quem o editou** em 2026-08-04 17:28 UTC (limitação nº 5 do @analyst: *"vale descobrir por quem
  e por quê antes de sobrescrever"*);
- a divergência sobreviveu **~4 meses** porque nada registrava que ela existia.

> **A 87-0 restaura a paridade uma vez. Esta story é o que impede a paridade de apodrecer de
> novo pelo lado do painel.** A outra metade da rede é o job de diff em CI (condição nº 10 do
> @architect, item de backlog `[CI] Job de diff de agent_prompts`, dependente de D5).

### As CINCO superfícies de escrita (corrigido pelo @po em 10/08 — eram três no draft)

| # | caminho | quem usa | destrutivo? | motivo hoje? | coberto por |
|---|---|---|---|---|---|
| 1 | server action `savePromptAction` (`personalidade/page.tsx:17-39`) | **produto, no painel — o caminho real** | não | não | AC1 + **AC2** |
| 2 | `PUT /api/admin/agent-prompts/[slug]` (`route.ts:46-94`) | integrações / uso programático | não | não | AC1 + **AC2** |
| 3 | `scripts/seed-prompts.ts:69-73` (upsert dos 7 a partir das constantes) | bootstrap | **sim** | não | AC1 + **AC2-b** ⚠️ AC12 da 87-0 **não implementada** (M6) |
| 4 | 🆕 `scripts/run-seed.ts:71-77` — **`npm run seed`**, upsert dos 7 com `[placeholder — Story 3.x]` | seed do repositório | **sim, e pior: grava placeholder** | não | AC1 + **AC2-b** |
| 5 | SQL direto: migrations (`121`, `122`), runbooks (`docs/runbooks/75-268-*.sql`), Management API | quem tem a chave | sim | não | **AC1 (trigger)** — único mecanismo possível |

> **[@po, C4 da validação da 87-0, revisto em 10/08]** A AC original mirava só o caminho 2 — **que o
> painel não usa**. O `visit-scheduling` de 04/08 e as duas edições `stand de vendas → sede da
> Trifold` que a M1 acabou de encontrar vieram **por fora dos caminhos da aplicação**. Por isso o
> histórico é **por trigger no banco**: é o único ponto por onde *toda* escrita passa.
>
> **Mas trigger só resolve a metade "quem fez".** A metade "não faça" é a **AC2-b**: os caminhos
> **3 e 4** podem apagar a fonte da verdade inteira, e hoje nada os impede. A governança teria
> porta dos fundos sem eles — e a maior das duas (`npm run seed`) não estava em nenhuma story.

---

### O que esta story NÃO prova — e a story precisa carregar isso escrito

O experimento de sentinela (Gabriel, 10/08) e o teste automatizado que a 87-0 entregou
(`packages/ai/src/config-surfaces.test.ts`, AC13) provam que **5 dos 7 slugs chegam ao system
prompt** — `system-personality`, `guardrails`, `qualification-flow`, `property-presentation`,
`visit-scheduling` — e que `off-hours` e `handoff-summary` **não chegam** (são as órfãs conhecidas,
dívida da **87-2**). Ou seja: para 5 slugs, **editar o painel muda o que a Nicole lê**.

> ⚠️ **Isso prova que o texto CHEGA, não que ela OBEDECE.** O caso Ronaldo (09/08) é o
> contraexemplo medido: a recusa estava no prompt, explícita, e ela contrariou. Governança de
> prompt é uma condição **necessária** do enforcement, nunca suficiente — o enforcement é a
> **Onda 3**. Nenhuma AC desta story pode ser lida como garantia de comportamento da Nicole.
>
> **Corolário operacional:** o inventário 5/7 **já é teste no repo**. Ninguém precisa refazer a
> injeção de sentinela à mão — refazê-la custa 14 escritas não rastreadas em produção (foi o que a
> M4 registrou). Rode `npx vitest run packages/ai/src/config-surfaces.test.ts`.

---

## Escopo

1. **Histórico de versões de `agent_prompts`**, alimentado por **trigger** (agnóstico ao caminho
   de escrita) — guarda conteúdo anterior, autor, timestamp e motivo.
2. **Motivo obrigatório** nos caminhos 1 e 2. Sem motivo, não grava.
3. **Fechar a porta dos fundos destrutiva** (caminhos 3 e 4): nenhum script apaga os 7 slugs sem
   gate explícito.
4. **Rollback documentado**: restaurar uma versão anterior é um procedimento escrito e exercitado,
   não improviso.
5. **O painel mostra o histórico** — quem editou, quando e por quê, ao lado do campo.
6. **Aviso de divergência painel × repositório** no próprio painel, e um dono declarado para o
   `--check`. Sem isso, a story registra a história de uma paridade que ninguém sabe que quebrou.

### Fora de escopo

- **Job de diff em CI** — condição nº 10 do @architect, depende de **D5**, item de backlog próprio.
  A **AC6/AC7** são o substituto *sem CI*, não a CI. Quando a D5 sair, o job substitui a AC7 (não a
  AC6, que é UI).
- **Fazer a Nicole obedecer ao prompt** — é enforcement, Onda 3.
- **O switch por empreendimento** (episódio Japurá/Solum, hoje contido por `is_active=false`) — é
  story do @sm em andamento. Esta aqui protege **o texto**, não o **cadastro**.
- **Reconciliação de conteúdo** — é a 87-0.
- **Fazer os campos órfãos valerem** — é a 87-2.
- **Aprovação/workflow de duas pessoas** para publicar prompt. Discutido e **deliberadamente fora**:
  a decisão D-87-0-a valoriza justamente a edição rápida sem deploy. O controle aqui é
  *rastreabilidade*, não *burocracia*. Se um dia for necessário, é story própria.
- **Versionar `agent_config`** (`personality_prompt`, `greeting_message`, …) — o destino desses
  campos é decidido na **87-2**; versionar antes de saber se vão existir é trabalho jogado fora.

---

## Acceptance Criteria

**AC1 — Toda escrita em `agent_prompts` deixa rastro, por qualquer caminho.**
Existe trigger em `agent_prompts` que, a cada `UPDATE` de `content`, grava a versão anterior.
*Verifica-se:* executar um `UPDATE` **direto por SQL/Management API** (o caminho que ninguém
controla) e confirmar que apareceu uma linha no histórico com o conteúdo **anterior**, o
timestamp e o autor disponível (`auth.uid()` quando houver). Este é o teste que importa: se
funciona por SQL cru, funciona pelos outros três.

**AC2 — Motivo é obrigatório no painel, e a mensagem de erro é útil.**
*Verifica-se:* salvar pela tela **sem** motivo → não grava (o `updated_at` do slug não muda) e a
tela mostra o porquê; salvar **com** motivo → grava, e o motivo aparece no histórico. Idem para
`PUT /api/admin/agent-prompts/[slug]`, que passa a exigir o campo e a responder **400** sem ele.

> **Detalhe que hoje faria o save falhar em silêncio:** `savePromptAction` (`page.tsx:17-39`) é uma
> server action que **retorna `void` em todos os caminhos de rejeição** (`if (!slug || !content)
> return`, `if (user.role !== 'admin') return`). Um `return` novo para "sem motivo" seria
> indistinguível de sucesso na tela. A AC exige **mensagem visível** — `useActionState` ou
> equivalente. "Não gravou" sem aviso é pior que gravar.

**AC2-b 🆕 — Nenhum script apaga a fonte da verdade sem gate explícito (superfícies 3 e 4).**
Os dois scripts de seed passam a **falhar sem write** quando invocados sem um gate deliberado
(flag `--bootstrap` ou env dedicada), e o cabeçalho de cada um declara **bootstrap-only** apontando
para esta story.
*Verifica-se:* (i) `npx tsx scripts/seed-prompts.ts` **sem** o gate → sai != 0, e os `updated_at`
dos 7 slugs ficam **inalterados** (conferido antes/depois); (ii) **`npm run seed`** sem o gate →
o bloco de `agent_prompts` (`run-seed.ts:71-77`) não executa nenhum write, e os 7 `updated_at`
ficam inalterados; (iii) com o gate, ambos rodam.
> **Esta AC absorve a AC12 da 87-0**, que foi escrita e **não implementada** (M6), e acrescenta a
> superfície 4, que a 87-0 não conhecia. Se a 87-0 for retomada, a AC12 dela vira ponteiro para cá
> — não se implementa duas vezes. O `run-seed.ts` grava **`[placeholder — Story 3.x]`**: é a única
> superfície capaz de deixar a Nicole sem prompt nenhum.

**AC3 — O histórico é legível por quem vai precisar dele às 23h de um sábado.**
*Verifica-se:* a tela de personalidade lista, por slug, as últimas N versões com **data, autor,
motivo** e um diff (ou o conteúdo anterior). Verificado por captura de tela anexada + teste da
consulta.

**AC4 — Rollback é procedimento, não improviso — e o alvo do rollback é conferido antes de virar produção.**
*Verifica-se:* seguindo o runbook escrito nesta story, restaurar um slug para a versão anterior
e confirmar por `dump-agent-prompts --check` (script entregue pela 87-0) que o snapshot volta a
divergir/convergir conforme o esperado. Exercitado uma vez, com output colado.
> 🔴 **Emenda do @po (M2), e não é formalidade.** O runbook tem de ter um passo obrigatório de
> **revisar o conteúdo que vai ser restaurado** antes de escrevê-lo. Hoje, restaurar
> `property-presentation` a partir do snapshot commitado **reintroduziria dois defeitos conhecidos**:
> o cabeçalho `### YARDEN RESIDENCE` (o erro que chegou à lead do Marcos) e os fatos de
> empreendimento que a Tarefa 2 da 87-0 removeu de propósito. "Voltar atrás" para um estado que
> ninguém olhou é o mesmo incidente com outro sinal. O runbook declara: **restaurar sempre a partir
> da linha do histórico (AC1), e conferir o diff; o snapshot só é alvo de rollback quando o
> `--check` estiver verde.**

**AC5 — Nenhuma regressão e nenhuma escrita perdida.**
*Verifica-se:* `npx vitest run`, `npm run type-check` e `npm run lint` sem erro novo; e o
`updated_at` dos 7 slugs **não muda** durante a implementação (a migration não pode tocar em
`content`).
> **Baseline declarado (@po, 10/08 — a AC não vale sem número):**
> `guardrails 13:50:53.564243` · `off-hours 13:50:52.301487` · `system-personality 13:50:54.827` ·
> `handoff-summary 13:50:56.060621` · `qualification-flow 13:50:57.382295` ·
> `property-presentation 13:50:58.600381` · `visit-scheduling 13:51:00.00538` (todos
> `2026-08-10`, UTC). Se algum divergir no fim da implementação sem uma linha de histórico
> explicando, a AC5 **falhou** — e o mecanismo desta story acabou de se provar sozinho.

**AC6 🆕 — O painel avisa quando o que está em produção não foi revisado no repositório.**
Na tela de personalidade, cada slug exibe um indicador de paridade contra o snapshot commitado
(`packages/ai/src/prompts/_production/manifest.json`): **✅ em paridade** quando o `sha256` do
`content` normalizado bate com o do manifest, **⚠️ divergente do repositório** quando não bate,
com o que fazer ao lado (`--write` + commit, ou reverter).
*Verifica-se:* (i) hoje, **antes** de qualquer `--write`, a tela mostra ⚠️ em **exatamente 3**
slugs (`guardrails`, `property-presentation`, `system-personality`) e ✅ nos outros 4 — o mesmo
resultado do `--check` da M1, por construção independente; (ii) após um `--write` + commit, os 7
ficam ✅; (iii) um save pelo painel deixa aquele slug ⚠️ imediatamente.
> **Por que esta é a AC que faltava.** Nenhuma das AC1–AC5 teria evitado o episódio do Marcos:
> histórico e motivo dizem *quem* e *por quê*, não *que está errado*. O que fecha a distância entre
> "editei" e "a lead recebeu" é **alguém ver o diff**. A AC6 é a versão barata disso, e é a única
> que funciona **sem CI** — que é a situação real (M7, D5 pendente).
> **Não é a CI e não a substitui:** a AC6 avisa quem já está olhando a tela; a CI avisa quem não está.

**AC7 🆕 — O `--check` tem dono e gatilho declarados.**
(i) Existe `"prompts:check": "tsx scripts/dump-agent-prompts.ts --check"` em `package.json`, para
que o comando seja descobrível sem ler o cabeçalho do script.
(ii) O **@qa roda `npm run prompts:check` no gate de toda story do Epic 87 que toque prompt, config
da Nicole ou `packages/ai/src/prompts/`** — registrado no `Definition of Done` desta story e
anexado ao gate. É o mesmo mecanismo que o epic já mandata em **R-F** ("até a D5 sair, gate manual
do @qa com a suíte completa é obrigatório").
(iii) O runbook da AC4 declara: **toda edição legítima pelo painel termina em `--write` + commit no
mesmo dia**, e o responsável é quem editou.
> **Limite honesto, escrito de propósito:** isto é um dono humano, não um mecanismo. Vai falhar
> algum dia — é por isso que a **D5** continua aberta e é por isso que a **AC6** existe em paralelo.
> Quando o job de CI subir, ele **substitui o item (ii)** e a AC7 vira redundância bem-vinda.
> **Não aceitar como fechamento desta story:** "vamos criar a CI". A CI é a D5 e não é desta story.

---

## Tarefas

- [x] **0.** *(acrescentada pelo @dev — Risco 5, antes de tudo)* `--write` do snapshot e
  reconciliação da dívida: os 3 slugs divergentes zeraram. → **pré-requisito da AC6**
- [x] **1.** **(@dev)** Migration `219`: tabela `agent_prompt_versions` + trigger em
  `agent_prompts`. Aplicada por Management API. → **AC1**
- [x] **2.** **(@dev)** Motivo obrigatório na server action (com mensagem visível) e no `PUT`. → **AC2**
- [x] **3.** **(@dev)** Gate de bootstrap em `seed-prompts.ts` **e** no bloco de `agent_prompts` de
  `run-seed.ts`. → **AC2-b**
- [x] **4.** **(@dev)** UI: histórico por slug (data, autor, motivo, diff) + selo de paridade. → **AC3 + AC6**
- [x] **5.** **(@dev)** `npm run prompts:check` + item de gate no DoD. → **AC7**
- [x] **6.** **(@dev)** Runbook de rollback, **exercitado uma vez**, output colado. → **AC4**
- [ ] **7.** **(@qa)** Suíte + baseline de `updated_at` conferido. → **AC5**
  *(o @dev já rodou e colou os números; a conferência de gate é do @qa)*

> **Nota do @dev sobre a divisão @dev × @data-engineer:** as Tarefas 1 e 6 estavam
> atribuídas ao @data-engineer. Executei-as porque a migration é o coração da AC1 e testá-la
> por SQL cru **antes** de o painel depender dela (condição D1 do @po) é pré-requisito das
> Tarefas 2 e 4 — separar em dois agentes teria bloqueado o resto da story. A migration segue
> revisável no arquivo, e a Tarefa 7 continua com o @qa.

---

## Dev Notes

- 🔴 **Prefixo de migration — o número da story está VELHO.** O draft dizia 215; hoje existem
  `216_clientes_cpf_normalizado.sql`, `217_leads_qualificacao_comercial.sql` e
  `218_system_events_dedupe_nicole.sql`. **O próximo livre é `219`** — e mesmo isso precisa ser
  reconferido no momento de criar (`218` foi renumerado de `217` hoje; há duas migrations não
  commitadas em voo). Aplicar por **Supabase Management API**, arquivo inteiro num POST —
  `supabase db push` é proibido neste projeto (R-G do epic).
- 🔴 **Nome do trigger — já existe um `set_updated_at` nesta tabela.**
  `001_base_schema.sql:295`: `CREATE TRIGGER set_updated_at BEFORE UPDATE ON agent_prompts`.
  O trigger novo precisa de outro nome (ex.: `agent_prompts_versionar`) e deve ser **AFTER UPDATE**,
  para não competir com o `BEFORE` que carimba o `updated_at`.
- 🔴 **A RLS admin-only é a migration `098`, não a `096`.** O arquivo é
  `098_harden_rls_agent_prompts_admin_only.sql` (Story 53-2); `096` é
  `096_crm_pipeline_readonly_layer.sql`, outra coisa. O comentário em `page.tsx:15` também cita
  096 e está errado — corrigir de passagem. A tabela de histórico nasce com RLS coerente: leitura
  para admin, escrita só pelo trigger (`SECURITY DEFINER`, senão a RLS da tabela nova bloqueia o
  próprio trigger).
- 🔴 **Como o MOTIVO chega ao trigger — decidir e declarar.** Um trigger de linha só enxerga
  `NEW`/`OLD`; `motivo` não é coluna de `agent_prompts`. Duas opções, ambas aceitáveis:
  **(a)** coluna nova `agent_prompts.last_change_reason`, escrita no mesmo `UPDATE` pela aplicação
  e copiada pelo trigger para a linha de histórico (simples, visível, mas polui a tabela);
  **(b)** `set_config('app.change_reason', ..., true)` na mesma transação, lido por
  `current_setting(..., true)` (limpo, mas exige `.rpc()` antes do `update` — o Supabase JS não
  compartilha transação entre chamadas, então **(b) só funciona se a escrita virar uma função
  RPC única**). **Restrição inegociável, seja qual for:** `UPDATE` **sem** motivo (SQL cru,
  Management API, migration) **ainda grava histórico**, com motivo nulo/`não informado`. Motivo
  ausente nunca pode virar escrita perdida.
- **Onde o painel escreve:** server action `savePromptAction`
  (`packages/web/src/app/dashboard/configuracoes/personalidade/page.tsx:17-39`), que faz
  `update({ content })` direto no Supabase com o client do servidor — **não** passa pela rota de
  API. Qualquer validação só na rota é validação que o produto nunca vê.
- **Autor:** o trigger deve tolerar `auth.uid()` nulo (escrita por service role / Management API),
  gravando algo como `system` em vez de falhar. **Uma escrita sem autor identificado precisa
  aparecer no histórico como tal** — é exatamente o caso do `visit-scheduling` de 04/08, e
  esconder isso derrotaria o propósito da story.
- 🔴 **AC6 na Vercel: NÃO chame `readSnapshotManifest()`.** `packages/ai/src/prompts/snapshot.ts:104`
  implementa `findRepoRoot()` subindo o filesystem a partir de `process.cwd()` procurando
  `packages/ai/src/prompts/index.ts` — **isso lança exceção em serverless**, onde a árvore do repo
  não existe. Para o selo de paridade, importe o JSON estaticamente
  (`import manifest from "@trifold/ai/src/prompts/_production/manifest.json"`), que o bundler
  embute, e reaproveite `sha256` + `normalizePromptContent` (exportados do mesmo arquivo e
  puros — esses sim são seguros). `@trifold/ai` já é `workspace:*` em `packages/web`.
- **O painel filtra `is_active=true`** (`page.tsx:93`) ao listar. Os 7 estão ativos hoje, mas o
  `savePromptAction` escreve por slug **sem** olhar `is_active`: um slug desativado some da tela e
  continua gravável. O histórico e o selo devem cobrir os 7, ativos ou não.
- **Não versione o conteúdo em arquivo aqui.** O snapshot em
  `packages/ai/src/prompts/_production/` é da 87-0 e continua sendo a cópia revisável no repo.
  Esta story cuida do histórico **dentro** do banco — e, pela AC6, de **avisar** quando os dois
  discordam.
- **O inventário 5/7 já é teste:** `packages/ai/src/config-surfaces.test.ts` (87-0/AC13). Não
  refazer injeção de sentinela em produção para "confirmar" — custa 14 escritas não rastreadas.

---

## Riscos

| # | risco | sev | mitigação |
|---|---|---|---|
| 1 | Trigger mal escrito **bloqueia escrita** de prompt em produção — no incidente seguinte, ninguém consegue corrigir a Nicole | **Alta** | 🔴 **Mitigação corrigida pelo @po (10/08): "não validar" NÃO basta.** O trigger roda na mesma transação do `UPDATE`; um `INSERT` que falhe por RLS, `NOT NULL`, FK ou tipo **aborta a escrita do prompt** mesmo sem validar nada. Exigências: (a) `EXCEPTION WHEN OTHERS THEN RETURN NEW` — histórico perdido é aceitável, prompt não gravado não é; (b) `SECURITY DEFINER` para não esbarrar na RLS da tabela nova; (c) nenhuma coluna `NOT NULL` sem default na tabela de histórico; (d) testar `UPDATE` por SQL cru **antes** de o painel depender disso |
| 2 | Motivo obrigatório vira campo preenchido com "." e o histórico fica inútil | **Média** | Mínimo de caracteres + o motivo aparece na tela ao lado da versão (constrangimento social funciona melhor que validação) |
| 3 | Tabela de histórico cresce sem limite | **Baixa** | Prompt muda raramente (7 slugs, ~1 edição/mês). Sem política de expurgo por ora, registrado |
| 4 🆕 | **Fricção empurra a edição para fora do painel.** Motivo obrigatório + selo vermelho tornam o painel mais caro que um `UPDATE` por Management API — e aí a governança produz exatamente a superfície 5 que ela queria eliminar | **Média** | O trigger (AC1) cobre o caminho de fuga: ele registra, com autor `system` e motivo nulo, e o selo da AC6 fica vermelho. **A fuga fica visível, não invisível.** Manter a fricção mínima: um campo de uma linha, sem workflow de aprovação (deliberadamente fora de escopo) |
| 5 🆕 | **AC6 vira ruído:** o selo nasce vermelho em 3 de 7 slugs (M1) e, se ninguém rodar `--write`, o vermelho permanente deixa de significar algo | **Média** | A **primeira tarefa do @dev nesta story é zerar a dívida**: `--write` + commit do snapshot reconciliado, no PR desta story, **antes** de a AC6 subir. Selo que nasce vermelho é selo que ninguém olha |

---

## Referências

- `docs/stories/87-0-paridade-reconciliacao-agent-prompts.story.md` — decisão **D-87-0-a**, a
  Nota de tensão sobre a CI, e o script `dump-agent-prompts --check` usado na AC4
- `docs/qa/po-validation-87-0.md` — correção **C4**: as três superfícies de escrita e a
  recomendação de trigger
- `docs/architecture/2026-08-05-validacao-epic-87.md` §6.3 item 3, §7 item 10
- Stories 53-1 (mecanismo de override) e 53-2 (painel admin-only — **migration `098`**, não 096)
- `docs/qa/po-validation-87-1.md` — parecer de validação desta story (@po, 10/08), com as sete
  medições contra produção
- `packages/ai/src/config-surfaces.test.ts` — o inventário 5/7 de slugs que chegam ao prompt (87-0/AC13)
- Epic 87 §**R-D** (o banco mascara o código), §**R-F** (não existe CI), §**D5** (criar CI?)

---

**CodeRabbit Integration**: Disabled (sem `coderabbit_integration` em `.aios-core/core-config.yaml`)

---

## Definition of Done

- [x] **AC1–AC7** verificadas, com output colado nas que exigem execução (ver Dev Agent Record)
- [x] Migration aplicada em produção por Management API, prefixo conferido no momento
      (**219** — `216`/`217`/`218` já ocupados, `219` livre, conferido em 11/08 antes de criar)
- [x] Snapshot reconciliado (`--write`) **no mesmo PR**, antes da AC6 subir — Risco 5
      ⚠️ **commit pendente com o @devops** (o @dev não faz commit nesta casa); o snapshot está
      no working tree e precisa entrar no MESMO PR do código da AC6
- [x] `npm run prompts:check` **verde** ao fim (é o critério da AC6-(ii))
- [x] Runbook de rollback escrito **e exercitado** uma vez, com o passo de revisão do alvo (AC4)
      → `docs/runbooks/87-1-rollback-agent-prompts.md`
- [x] `updated_at` dos 7 slugs conferido contra o baseline da AC5 (6 de 7 idênticos; o 7º é o
      `off-hours` do exercício de rollback, com 4 linhas de histórico explicando cada escrita)
- [ ] @po validou · @qa deu gate · @devops fez o push
- [ ] 🆕 **Gate permanente (AC7-ii):** o **@qa roda `npm run prompts:check` no gate de toda
      story do Epic 87** que toque prompt, config da Nicole ou `packages/ai/src/prompts/`, e
      anexa o output ao gate. Vale até a **D5** (job de CI) sair — quando sair, o job substitui
      este item.

---

## Dev Agent Record

**Agente:** @dev (Dex) · **Modelo:** claude-opus-5 · **Modo:** YOLO · **Data:** 2026-08-11
**Produção:** `dsopqkqjkmhytudaaolv` · **Branch:** `main` (sem commit — @devops)

### D2 decidida antes de codar: **opção (a), coluna `agent_prompts.last_change_reason`**

O @po deixou duas opções para o motivo chegar ao trigger. Escolhi **(a)**:

| | (a) coluna `last_change_reason` | (b) `set_config` + `current_setting` |
|---|---|---|
| o que muda na aplicação | uma chave a mais no `update()` já existente, nos 2 caminhos | **reescrever as 2 escritas como RPC** (o supabase-js não compartilha transação) |
| SQL cru / Management API | funciona: basta pôr a coluna no `UPDATE` | não funciona sem quem chame a função |
| custo | 1 coluna a mais na tabela | 1 função RPC + mudança de contrato das 2 superfícies |

**Guarda que a opção (a) exigiu e que não estava na story.** Se o trigger copiasse
`NEW.last_change_reason` cegamente, um `UPDATE` por SQL cru **herdaria o motivo da última
edição do painel** — e o histórico passaria a *mentir* sobre por que a mudança aconteceu.
Pior que motivo ausente. Por isso o trigger só credita o motivo quando ele **muda no próprio
`UPDATE`** (`NEW.last_change_reason IS DISTINCT FROM OLD.last_change_reason`). Efeito colateral
aceito e documentado na migration: duas edições seguidas com texto de motivo **idêntico**
registram a segunda como "não informado". **Erra para menos, nunca para mais.**

Restrição inegociável mantida: `UPDATE` sem motivo **ainda grava histórico** (`change_reason`
nulo, autor `system`) — provado abaixo.

---

### AC1 — toda escrita deixa rastro, por qualquer caminho ✅

Migration `219` aplicada por Management API (arquivo inteiro num POST, HTTP 201). Objetos
conferidos em produção: trigger `agent_prompts_versionar` **AFTER** UPDATE convivendo com o
`set_updated_at` **BEFORE** que já existia; tabela sem NOT NULL-sem-default e **sem FK**; RLS
ligada com policy de SELECT admin-only; `anon` sem grant nenhum; `authenticated` só SELECT.

Teste que importa — `UPDATE` **por SQL cru, sem motivo**, no slug `off-hours`:

```
slug        change_reason  author_label  prev_chars  novo_chars  created_at
off-hours   (null)         system        327         363         2026-08-11 11:09:08+00

md5(previous_content) = a6f042a0582d112527c932acd35570a0
md5 do conteúdo ANTES do teste (medido independentemente) = a6f042a0582d112527c932acd35570a0  ✅
```

Autor `system` e motivo nulo **aparecem como tal** — é exatamente o caso do `visit-scheduling`
de 04/08, e escondê-lo derrotaria a story.

E o caminho que a aplicação usa de verdade (PostgREST) foi conferido, porque `NOTIFY pgrst`
não é opcional aqui — sem ele o primeiro save do painel morreria com "column not found":

```
GET /rest/v1/agent_prompt_versions   (service role) → 200, linhas do histórico
GET /rest/v1/agent_prompts?select=slug,last_change_reason → 200, coluna visível
GET /rest/v1/agent_prompt_versions   (anon)         → 401  permission denied for table
```

O `anon` apanha no **grant**, antes da RLS (`REVOKE ALL … FROM PUBLIC, anon, authenticated` +
`GRANT SELECT TO authenticated`) — as duas camadas, porque um `GRANT` a `PUBLIC` fura `REVOKE`
de `anon`, e `GRANT ALL` (o default do Supabase) inclui `TRUNCATE`, que **não passa** por RLS.

**Por que `off-hours`:** é um dos dois slugs **órfãos** (`config-surfaces.test.ts`, 87-0/AC13) —
não chega ao system prompt. Nem durante o teste a Nicole ficou exposta. **Não refiz injeção de
sentinela** (a M4 mostrou o custo: 14 escritas não rastreadas).

#### Risco 1 — o trigger não pode abortar o `UPDATE`: **medido, não declarado**

Forcei o `INSERT` de histórico a falhar (`ALTER TABLE agent_prompt_versions ADD CONSTRAINT
tmp_87_1_forca_falha CHECK (false) NOT VALID`) e rodei um `UPDATE` de prompt:

```
chars_prompt = 386   ← o prompt GRAVOU (363 + 23 do marcador)
linhas_historico = 1 ← o histórico NÃO cresceu (o INSERT falhou e foi engolido)
```

Constraint removida em seguida. O trade-off da story está implementado literalmente: **histórico
perdido é aceitável, prompt não gravado não é.** E a perda é **detectável**: o `previous_content`
de uma linha deixa de bater com o `new_content` da anterior (o salto `363 → 386` no extrato do
runbook é essa cicatriz). Registrado no runbook como detector.

#### O motivo, e a guarda contra herança

```
hora      change_reason                                author_label  prev  novo
11:09:08  (null)                                       system         327   363   ← SQL cru sem motivo
11:09:46  teste 87-1: o motivo viaja no mesmo UPDATE   system         386   412   ← com motivo
11:09:47  (null)                                       system         412   455   ← sem tocar no motivo → NÃO herdou
11:10:24  rollback exercitado pelo runbook 87-1 (AC4)  system         455   327   ← o rollback também deixa rastro
```

Na linha das 11:09:47 a coluna `last_change_reason` ainda continha o texto das 11:09:46 — e o
histórico gravou `null`. A guarda funciona.

### AC2 — motivo obrigatório, e a mensagem é visível ✅

- **Server action** movida de dentro do `page.tsx` para `personalidade/actions.ts` e reescrita
  para **devolver estado** (`useActionState`). Era o defeito **D7**: ela retornava `void` em toda
  rejeição, então um `return` novo para "sem motivo" seria indistinguível de sucesso. Agora todo
  caminho de rejeição tem mensagem na tela — inclusive o que ninguém tinha notado: **`update`
  sem linha afetada não é erro no PostgREST**, é o que a RLS devolve ao negar a escrita. Sem
  checar `data`, "negado pela RLS" parecia "salvo".
- **`PUT /api/admin/agent-prompts/[slug]`** passa a exigir `motivo` e responder **400** sem ele.
  Conferido que **não há nenhum caller** desta rota no repositório (só os tipos gerados do Next) —
  a mudança de contrato não quebra ninguém.
- As duas superfícies usam **as mesmas** validações (`@web/lib/agent-prompts`) para não divergirem
  com o tempo. Mínimo de 10 caracteres barra o motivo-álibi (Risco 2); o que faz o trabalho de
  verdade é o motivo aparecer ao lado da versão (AC3).
- 14 testes novos em `packages/web/src/lib/agent-prompts.test.ts`.

### AC2-b — nenhum script apaga a fonte da verdade sem gate ✅

Gate único e compartilhado (`scripts/agent-prompts-bootstrap-gate.ts`) — duplicá-lo nos dois
scripts seria deixar um deles envelhecer sozinho. Aceita `SEED_AGENT_PROMPTS_BOOTSTRAP=1` ou
`--bootstrap`. **Verificado por execução, nunca apontando para produção** (URL morta):

```
(i)   npx tsx scripts/seed-prompts.ts                → EXIT=1, mensagem explicando, ZERO write
(iii) SEED_AGENT_PROMPTS_BOOTSTRAP=1 …seed-prompts   → passa do gate e tenta escrever (o gate não é bloqueio permanente)
(ii)  tsx scripts/run-seed.ts (sem gate)             → "Seeding agent prompts... PULADO (gate AC2-b)",
                                                       nenhuma tentativa de write; o RESTO do seed segue
(ii-b) …com gate                                     → o bloco volta a rodar
```

`updated_at` dos 7 slugs conferido antes e depois: **inalterado** (nunca houve conexão com prod).

> ⚠️ **`npm run seed`: use a ENV, não a flag.** O npm anexa argumentos ao **fim** da cadeia
> (`… && tsx scripts/seed-properties.ts --bootstrap`), então `--bootstrap` nunca chegaria ao
> `run-seed.ts`. Está no cabeçalho dos dois scripts e na mensagem do gate.
>
> 🔻 **Registrado, fora de escopo:** o resto do `run-seed.ts` continua sem gate e continua
> perigoso contra produção — ele faz upsert de `agent_config` (`personality_prompt`,
> `greeting_message`, `out_of_hours_message`, `business_hours`) e **cria usuários de auth com
> senha fixa**. A AC2-b fala de `agent_prompts`; `agent_config` é a **87-2**. Deixei o aviso no
> cabeçalho do arquivo para não virar surpresa.

### AC3 — histórico legível às 23h de um sábado ✅

`PromptEditor` (Client Component) lista as últimas 5 versões por slug com **data, autor, motivo**
e a **primeira linha divergente** (`- antes` / `+ depois`, o mesmo recorte do `--check --verbose`),
mais o conteúdo anterior inteiro num `details` — que é o alvo de rollback do runbook. Motivo
ausente aparece em **âmbar**, escrito *"sem motivo (escrita fora do painel)"*: a fuga fica
visível, não invisível (Risco 4).

O filtro `is_active=true` da listagem **saiu**: um slug desativado sumia da tela e continuava
gravável por slug. Agora os 7 aparecem, com marcador "inativo — a Nicole não lê este".

### AC4 — rollback é procedimento ✅

`docs/runbooks/87-1-rollback-agent-prompts.md`, **exercitado uma vez em produção**, output colado
no próprio runbook. A emenda **M2/D8** virou o Passo 2, obrigatório: *ler o conteúdo antes de
escrevê-lo*, com checklist do que conferir (nome de empreendimento, fatos de cadastro,
empreendimento fora de venda). E a regra de alvo está escrita: **restaure pela linha do
histórico; o snapshot só é alvo quando o `prompts:check` estiver verde.**

```
md5 alvo (antes de tudo):  a6f042a0582d112527c932acd35570a0
md5 depois do rollback:    a6f042a0582d112527c932acd35570a0   ✅ byte a byte
$ npx tsx scripts/dump-agent-prompts.ts --check
✅ agent_prompts == snapshot (7 slugs, org 00000000-0000-0000-0000-000000000001)
```

### AC5 — nenhuma regressão, nenhuma escrita perdida ✅

```
$ npx vitest run
 Test Files  171 passed (171)
      Tests  2157 passed | 6 expected fail (2163)

$ npm run lint          → 8/8 tarefas OK, 0 erros, 24 warnings (todos pré-existentes, nenhum nos
                          arquivos desta story). `packages/ai` não tem eslint: o `lint` dele
                          É `tsc --noEmit`, e passou.
$ npm run type-check    → 8/8 tarefas OK.
$ npx next build        → ✓ Compiled successfully. É esta a verificação que fecha o **D6**:
                          `/dashboard/configuracoes/personalidade` compila com o `manifest.json`
                          importado estaticamente. (De passagem: o `type-check` acusava um erro em
                          `.next/types/validator.ts` sobre `portal-viewer/[vinculo_id]` que sumiu
                          depois do build — era artefato gerado **velho**, não código.)
$ npm run prompts:check → ✅ agent_prompts == snapshot (7 slugs)
```

⚠️ **Nota de ambiente para o @qa:** ao começar, 5 arquivos de teste e 16 erros de tipo vinham de
dependências **declaradas e não instaladas** (`sharp`, `satori`, `pdf-lib`, `react-email-editor`).
Um `pnpm install --frozen-lockfile` resolveu, **sem tocar no `pnpm-lock.yaml`**. Se a suíte
aparecer vermelha aí, rode o install antes de suspeitar da story.

**`updated_at` × baseline do @po:**

| slug | baseline (10/08) | agora | histórico |
|---|---|---|---|
| guardrails | 13:50:53.564243 | **idêntico** | 0 |
| off-hours | 13:50:52.301487 | `2026-08-11 11:10:24.31699` | **4 linhas** |
| system-personality | 13:50:54.827 | **idêntico** | 0 |
| handoff-summary | 13:50:56.060621 | **idêntico** | 0 |
| qualification-flow | 13:50:57.382295 | **idêntico** | 0 |
| property-presentation | 13:50:58.600381 | **idêntico** | 0 |
| visit-scheduling | 13:51:00.00538 | **idêntico** | 0 |

O único que se moveu é o `off-hours` do exercício do runbook, com **4 linhas de histórico
explicando cada escrita** e `content` byte a byte igual ao baseline — que é o critério literal da
AC5 ("se algum divergir sem uma linha de histórico explicando, a AC5 falhou"). A migration não
tocou em `content` (o `ALTER TABLE ADD COLUMN` não dispara trigger e não mexeu em `updated_at`).

#### O teste da 87-0 que meu `--write` fez disparar — e por que isso é o sistema funcionando

`packages/ai/src/prompts/contradiction.test.ts` ficou vermelho **por sucesso**. O arquivo se
descreve assim: *"no dia em que a reconciliação limpar as frases o marcador `it.fails` PASSA A
FALHAR, obrigando quem fechar a Tarefa 2 a remover o marcador"*. Foi o que aconteceu. Medido:

- lado do **snapshot**: **0 contradições** (eram 4 — guardrails ×2, property-presentation ×1,
  system-personality ×1). O `debtCase` virou `it`: de fotografia de dívida a **guarda de
  regressão** — se "stand" voltar ao banco pelo painel, fica vermelho;
- lado das **constantes do código**: **continua devendo 2** (`GUARDRAILS_PROMPT` linhas 20 e 85).
  Segue `debtCase`, intocado — é edição de prompt, não de processo;
- neutralizadas por negação no snapshot: 2 → **3** (a nova é
  `property-presentation:36`, *"NUNCA passe o endereco da obra para visita"*, que a reconciliação
  de 06/08 **acrescentou** — guardrail corretivo, não contradição).

Só atualizei os números pinados e a razão de cada um. Nenhuma régua foi afrouxada.

### AC6 — o painel avisa quando produção não foi revisada no repositório ✅

Selo por slug, calculado no servidor com `sha256(normalizePromptContent(content))` contra o
`manifest.json` **importado estaticamente** — nunca `readSnapshotManifest()`, que chama
`findRepoRoot()` e **lança em serverless** (D6). O selo aparece **com o card fechado** também:
um aviso que só existe depois de expandir avisa quem já foi olhar, e ninguém foi olhar no
episódio que originou esta story. Há ainda um resumo no topo da tela.

Verificação de (i) e (ii) por **caminho de código independente** do `--check`, rodando o mesmo
`promptParity` contra o conteúdo real do banco:

```
(i)  manifest de HEAD (o estado ANTES do --write)   [capturado em 2026-08-05T23:03:36]
   ⚠️  guardrails · ⚠️  property-presentation · ⚠️  system-personality
   ✅ handoff-summary · off-hours · qualification-flow · visit-scheduling
   → 3 de 7 divergentes        ← exatamente os 3 da M1, por construção independente

(ii) manifest do working tree (DEPOIS do --write)   [capturado em 2026-08-11T11:04:12]
   → 0 de 7 divergentes
```

> **Sobre a ordem de (i):** a AC pedia observar os 3 vermelhos **antes** de qualquer `--write`,
> mas o Risco 5 e o §6.1 do parecer mandam o `--write` **primeiro**. Cumpri a ordem normativa e
> reproduzi (i) contra o manifest de `HEAD`, que é o mesmo estado — sem custar escrita nenhuma em
> produção. (iii) — "um save pelo painel deixa aquele slug ⚠️ imediatamente" — é consequência de
> o selo ser recalculado a cada render, e está coberto por teste unitário; a própria mensagem de
> sucesso do save já diz ao admin que o slug ficou divergente e o que fazer.

### AC7 — o `--check` tem dono e gatilho ✅

- `npm run prompts:check` (e `npm run prompts:write`, para que a **remediação** citada em toda
  mensagem do selo também seja descobrível — foi a única adição minha fora da letra da AC);
- item de gate permanente do **@qa** acrescentado ao DoD (AC7-ii), com validade declarada: cai
  quando a **D5** entregar a CI;
- o runbook fecha com a regra do AC7-(iii): *toda edição legítima pelo painel termina em
  `--write` + commit no mesmo dia, e o responsável é quem editou.*

### Riscos: o que sobrou

- **Risco 5 (selo que nasce vermelho)** — **eliminado**: o selo nasce ✅ nos 7. **Mas isso depende
  do @devops commitar o snapshot no MESMO PR.** Se o código da AC6 subir sem os `.txt`
  reconciliados, o selo nasce ⚠️ em 3 e a AC6 vira ruído no dia 1.
- **Risco 4 (fricção empurra a edição para fora do painel)** — mitigado como previsto: um campo
  de uma linha, sem workflow de aprovação, e o trigger cobre a fuga com autor `system` + selo
  vermelho. **A fuga fica visível, não invisível.**
- **Risco 3 (tabela cresce)** — sem política de expurgo, como decidido. Registro um número para
  quem revisitar: 7 slugs × ~1 edição/mês × ~2×5 KB por linha ≈ **desprezível**; a tela lê no
  máximo 35 linhas.
- **Fora de escopo, confirmado intocado:** `packages/ai/src/prompts/property-presentation.ts:25`
  segue com `### YARDEN RESIDENCE`, `"em torno de 80 mil reais"` e fatos de empreendimento
  (contra D-87-0-a/b/f), e `guardrails.ts` segue com as 2 ocorrências de "stand". É o **fallback
  de bootstrap**: enquanto houver linha ativa com conteúdo em `agent_prompts`, essas constantes
  **nunca são lidas** (`prompts/index.ts:84-88`). Continua sendo dívida com dono a definir.
- **Regra de corte respeitada:** nenhum arquivo de `packages/ai/src/chat/` foi tocado.

### Correções do gate CONCERNS (2026-08-11, segunda passada)

O gate não reprovou nenhuma AC. Três achados foram fechados; `TEST-001` (AC2 em navegador),
`REQ-002` (braço `AFTER DELETE`) e `MNT-001` (o DDL em produção, já revertido) ficam como
estavam, por instrução explícita.

**REQ-001 — a tela afirmava procedência falsa.** A guarda contra herança de motivo continua
intocada (o @qa validou o desenho); o defeito era a **cópia**. Quando `change_reason` é nulo,
a tela dizia *"sem motivo (escrita fora do painel)"* — mas o caso que a guarda cria é
exatamente uma escrita **do painel**, com autor identificado; e no `PUT` (feito para
integrações) quem mandar sempre o mesmo `motivo` teria **todas** as escritas depois da
primeira rotuladas assim.

A frase passa a decidir pelo que a **linha sabe**. O trigger grava `author_auth_id`
(`auth.uid()`) e `author_user_id` (`public_user_id()`), então a linha sabe se há autor:

| o que a linha tem | o que a tela escreve |
|---|---|
| autor identificado (qualquer um dos dois ids) | **"motivo não registrado nesta edição"** |
| nenhum dos dois ids | **"sem motivo — escrita sem autor identificado"** |

**Por que esta redação, e não a que o gate sugeriu.** A sugestão ("motivo não registrado
nesta edição" para todos os casos) fecha a afirmação falsa, mas apaga da linha de motivo o
sinal do **Risco 4** — a fuga do painel tinha de continuar visível. O segundo rótulo
preserva esse sinal dizendo **só um fato da linha** (não há autor identificado), sem
afirmar por qual caminho a escrita entrou — que é o que a linha, de fato, não sabe.
Os dois rótulos seguem em âmbar: os dois são anomalia.

A frase virou função pura em `@web/lib/agent-prompt-versions` (`rotuloDeMotivoAusente`) em
vez de ficar embutida no componente, porque componente aqui não é testável (TEST-001: o
repositório não tem `@testing-library`). São 3 testes, e o primeiro barra a regressão:
`expect(rotulo).not.toMatch(/painel|fora/i)` quando há autor.

**REL-001 — o histórico sumia justo quando importa.** A leitura saiu de `page.tsx` para
`@web/lib/agent-prompt-versions` e o teto virou **do banco e por slug**: uma consulta por
slug com `limit(5)`, coberta pelo índice `(org_id, slug, created_at DESC)` que a 219 já
criou para esta leitura. O payload da página não cresce — nenhuma consulta traz mais linhas
do que a tela mostra, que era o motivo do teto original.

O teste monta a **distribuição desigual** (40 edições em `guardrails` numa noite, uma
edição antiga em cada um dos outros seis) e roda as **duas** implementações contra o mesmo
banco falso, porque o caso feliz passa nas duas e não mede nada:

```
CONTROLE (teto compartilhado de 35 linhas, o algoritmo antigo)
   guardrails → 5 · os outros 6 → 0   ← "Sem histórico ainda" em quem tinha histórico

buscarVersoesPorSlug (teto por slug, no banco)
   guardrails → 5 · os outros 6 → 1   ← nenhum slug perdido
```

Mutação, para não declarar vermelho sem medi-lo: substituí o corpo de
`buscarVersoesPorSlug` pelo algoritmo antigo e **3 testes ficaram vermelhos**
(distribuição desigual, forma da consulta, slug sem edição); troquei o rótulo de volta para
"escrita fora do painel" e os **3** do REQ-001 ficaram vermelhos. Arquivo restaurado e
verde de novo (10 testes).

**DOC-001 — o `manifest.json` mentia sobre um `updated_at`.** `npm run prompts:write`
rodado agora: `off-hours.updated_at` passou de `2026-08-10T13:50:52` (capturado **antes** do
rollback da AC4) para `2026-08-11T11:10:24.31699+00:00`, que é o que o banco diz. Só
metadata mudou — `prompts:check` já estava verde antes e continua verde depois, o que só é
possível se o conteúdo dos `.txt` não se moveu.

**Restrição nova, acatada:** nada de DDL experimental em produção. Esta passada não emitiu
DDL nenhum, em lugar nenhum: só leitura de produção pelo `dump-agent-prompts` (que não tem
`insert/update/upsert` no arquivo) e testes com banco falso em memória. Para o resto do
Epic 87, prova de trigger/DDL vai no projeto de dev `xnxvygyfyyyzwhiuoehz`.

**Revalidação completa depois das correções:**

```
$ npx vitest run                    → 172 arquivos · 2167 passed | 6 expected fail (2173)
$ npx turbo type-check lint --force → 13/13 tarefas, 0 em cache · 0 erros, 24 warnings
                                      (os mesmos 24 pré-existentes; nenhum em arquivo desta story)
$ npx next build                    → ✓ Compiled successfully in 19.4s
$ npm run prompts:check             → ✅ agent_prompts == snapshot (7 slugs) · EXIT=0
```

`packages/ai` não tem eslint — o `lint` dele é `tsc --noEmit`, e passou.

### File List

**Criados**

| arquivo | o quê |
|---|---|
| `supabase/migrations/219_agent_prompts_historico_versoes.sql` | tabela + trigger + coluna do motivo + RLS (**aplicada em prod**) |
| `packages/web/src/lib/agent-prompts.ts` | validações puras (motivo/conteúdo), compartilhadas pelas 2 superfícies e pela UI |
| `packages/web/src/lib/agent-prompt-versions.ts` | 🆕 leitura do histórico **5 por slug** (REL-001) + o rótulo de motivo ausente (REQ-001) |
| `packages/web/src/lib/agent-prompt-versions.test.ts` | 🆕 10 testes: distribuição desigual com controle do algoritmo antigo, forma da consulta e a regra do rótulo |
| `packages/web/src/lib/agent-prompts-parity.ts` | selo de paridade (server-only; manifest estático) |
| `packages/web/src/lib/agent-prompts.test.ts` | 14 testes (validação + paridade contra o snapshot real) |
| `packages/web/src/app/dashboard/configuracoes/personalidade/actions.ts` | server action com motivo obrigatório e estado de retorno |
| `packages/web/src/app/dashboard/configuracoes/personalidade/prompt-editor.tsx` | editor + selo + histórico; o rótulo de motivo ausente vem de `rotuloDeMotivoAusente` (REQ-001) e o tipo `VersaoDoPrompt` mora em `@web/lib/agent-prompt-versions` |
| `scripts/agent-prompts-bootstrap-gate.ts` | gate único dos dois seeds |
| `docs/runbooks/87-1-rollback-agent-prompts.md` | runbook de rollback, com o exercício colado |

**Modificados**

| arquivo | o quê |
|---|---|
| `packages/web/src/app/dashboard/configuracoes/personalidade/page.tsx` | usa o `PromptEditor`, busca o histórico (agora **5 por slug**, via `buscarVersoesPorSlug` — REL-001), calcula o selo, lista os 7 (não só os ativos); comentário da RLS corrigido **096 → 098** |
| `packages/web/src/app/api/admin/agent-prompts/[slug]/route.ts` | `PUT` exige `motivo` (400 sem ele) e grava `last_change_reason` |
| `scripts/seed-prompts.ts` | cabeçalho bootstrap-only + gate |
| `scripts/run-seed.ts` | cabeçalho + gate no bloco de `agent_prompts` (extraído para `seedAgentPrompts()`), `seedUsers()` extraído |
| `package.json` | `prompts:check` e `prompts:write` |
| `packages/ai/src/prompts/contradiction.test.ts` | números pinados atualizados; `debtCase` do snapshot → `it` (dívida quitada) |
| `packages/ai/src/prompts/_production/{guardrails,property-presentation,system-personality}.txt` + `manifest.json` | snapshot reconciliado (`--write`) — **Risco 5** |

**Fora de escopo — NÃO alterados, registrados de propósito:**
`packages/ai/src/prompts/property-presentation.ts`, `packages/ai/src/prompts/guardrails.ts`.

### Para o @devops

0. **O `manifest.json` foi regravado (DOC-001) depois do gate** — só metadata mudou
   (`off-hours.updated_at` agora bate com o banco). Continua valendo o item 1 abaixo: os
   `.txt` + `manifest.json` vão no mesmo commit do código da AC6.
1. **O snapshot (`_production/*`) tem de ir no MESMO commit/PR do código da AC6** — se ficar de
   fora, o selo nasce vermelho em 3 slugs e a AC6 morre no dia 1 (Risco 5).
2. A **migration 219 já está aplicada em produção**; o arquivo sobe para versionar o que já está
   no ar (mesmo padrão da 218).
3. Nada a fazer na Vercel: sem env nova, sem cron novo.

## QA Results

**Revisado por:** @qa (Quinn, Test Architect) · **Data:** 2026-08-11
**Método:** reprodução do zero. Nada aceito por relato. Introspecção **somente-leitura** em
produção (`dsopqkqjkmhytudaaolv`); **toda** escrita de teste e **toda** mutação no projeto
Supabase isolado de dev (`xnxvygyfyyyzwhiuoehz`), onde apliquei a migration `219` a partir do
arquivo do working tree e limpei depois. Cenários de seed contra URL morta (`127.0.0.1:1`).
**Produção não recebeu uma escrita sequer minha** — os 7 `updated_at` e os 7 `md5(content)`
lidos no início e no fim da revisão são idênticos.

### Gate Status

Gate: **CONCERNS** → `docs/qa/gates/87.1-governanca-painel-agent-prompts.yml`

Nenhuma AC falhou. Dois achados médios, nenhum bloqueante, e uma **condição de deploy
bloqueante** para o @devops (abaixo).

### AC7-(ii) — output do gate permanente do Epic 87, anexado como a AC exige

```
$ npm run prompts:check
✅ agent_prompts == snapshot (7 slugs, org 00000000-0000-0000-0000-000000000001)
EXIT=0
```

E provei que ele **discrimina**, não só que sai verde: apontado para um banco de dev com os 7
slugs do snapshot e **um** termo trocado em `guardrails` (`sede da Trifold` → `stand de vendas`),
saiu **exit 1**, nomeando o slug e a linha 20.

### O que eu contestei, reproduzi ou provei por mutação

| # | ponto | resultado |
|---|---|---|
| 1 | **Fail-safe do trigger** | Provado nos **dois sentidos**, com mecanismo diferente do `CHECK` do @dev (um `BEFORE INSERT` que levanta exceção): **com** a guarda, o prompt grava e o histórico se perde; **sem** o bloco `EXCEPTION WHEN OTHERS`, o `UPDATE` **aborta** e o `content` fica no valor anterior. A guarda é o que carrega o peso. |
| 2 | **"Teste com RLS negando"** | **Não é reproduzível — e isso é um resultado, não uma omissão.** Liguei `FORCE ROW LEVEL SECURITY` na tabela de histórico (que não tem policy de INSERT) e o trigger inseriu assim mesmo: `SECURITY DEFINER` roda como `postgres`, que tem `rolbypassrls = true`. A RLS **não consegue** negar este INSERT. É mais forte que uma guarda. |
| 3 | **`SECURITY DEFINER` é load-bearing?** | Sim, e sua ausência falha **em silêncio**: troquei por `INVOKER` e rodei um `UPDATE` como `authenticated` admin — o prompt gravou e o histórico **não cresceu** (o `permission denied` foi engolido pela guarda; `authenticated` só tem SELECT). Sem `DEFINER`, **toda** edição pelo painel perderia histórico sem ninguém perceber. |
| 4 | **O autor humano chega ao histórico?** | **Era a prova que faltava.** As 4 linhas de produção são todas `system` — nada nesta story provava o caminho que responde a pergunta que ela existe para responder. Simulei sessão `authenticated` de admin no dev: gravou `author_label = "Fulana Admin QA"`, `author_auth_id` e `author_user_id` preenchidos, motivo creditado. **Funciona.** |
| 5 | **"`update` sem linha afetada não é erro no PostgREST" — fechado mesmo?** | Sim. Reproduzi a negação com JWT de **não-admin da mesma org**: `UPDATE ... RETURNING` devolveu **0 linhas e nenhum erro**, `content` intacto. É literalmente `{ data: null, error: null }`. O `if (!data)` de `actions.ts` é o que impede "negado pela RLS" de aparecer como "salvo". |
| 6 | **AC6 na Vercel (D6)** | Prova **direta**, não "o build passou": rodei `promptParity` com `cwd=/` e ele respondeu certo. Mutação confirmando: `readSnapshotManifest()` do mesmo `cwd` **lança**. E no artefato: o sha do manifest está embutido no chunk de servidor, enquanto a string de erro de `findRepoRoot` só sobrevive no `.map` — a função saiu do bundle de runtime. |
| 7 | **AC2-b, o gate do seed** | 4 cenários + 3 valores de env que **não** liberam (`""`, `0`, `false`) + o gotcha do npm. Tudo contra URL morta. `npm run seed -- --bootstrap` continua **bloqueado** — falha para o lado seguro. A extração de `seedUsers()` preservou o comportamento (users e `Seed complete!` saem uma vez só). |
| 8 | **AC6-(i), os 3 vermelhos** | Reproduzido por um **quarto caminho** independente: `sha256` do content normalizado calculado **dentro do Postgres** contra o manifest de `HEAD` → **exatamente 3**, e são os 3 da M1. Contra o manifest do working tree → **0**. |
| 9 | **AC5, critério literal** | O título da AC ("os 7 `updated_at` não mudam") é **contraditório com AC1+AC4**, que exigem um `UPDATE` por SQL cru e um rollback exercitado. A cláusula de desempate da própria AC — "se algum divergir **sem uma linha de histórico explicando**" — está satisfeita: 6 idênticos ao microssegundo, e o `off-hours` com 4 linhas explicando e `md5(content)` hoje **igual** ao `previous_content` da **primeira** linha do histórico, que é o estado anterior à implementação. |
| 10 | **`contradiction.test.ts` — afrouxaram alguma régua?** | Não: `debtCase` → `it` e a contagem pinada 3 fontes → `{}` são **mais** estritos. O `2 → 3` corresponde a uma frase real (`_production/property-presentation.txt:36`). E a guarda convertida não é decorativa: acrescentei "podemos te receber no stand de vendas" a um `.txt` e **dois** testes ficaram vermelhos; restaurei byte a byte (md5 conferido). |
| 11 | **Os testes novos discriminam?** | Sim, por mutação: anular o mínimo de caracteres derruba **exatamente** o teste do motivo-álibi; tirar a normalização do selo derruba **exatamente** o teste de CRLF. Um teste vermelho cada, sem herança. |

### Suíte, lint e tipos — rodados por mim, sem cache

```
pnpm install --frozen-lockfile     → resolve os 5 arquivos de teste e os 16 erros de tipo
                                     das deps declaradas e não instaladas (o aviso do @dev procede)
npx vitest run                     → 171 arquivos · 2157 passed | 6 expected fail (2163)
npx turbo lint type-check --force  → 13 tarefas, 0 em cache, todas OK · 0 erros, 24 warnings
                                     (todos pré-existentes, nenhum em arquivo desta story)
npx next build                     → exit 0
```

`packages/ai` **não tem eslint** — o `lint` dele **é** `tsc --noEmit`. O @dev reportou pelo nome certo.

### Achados (nenhum bloqueia)

| id | sev | achado |
|---|---|---|
| **REQ-001** | média | **Dois motivos idênticos seguidos: o segundo vira `null` — e a tela rotula `null` como "sem motivo (escrita fora do painel)".** Reproduzido no dev. O @dev documentou o "erra para menos"; o que não foi considerado é que o rótulo **afirma uma procedência falsa** — a escrita veio do painel, com autor identificado e com motivo dado. Na superfície 2 (o `PUT`, feito para integrações) não é esporádico: uma integração que mande sempre o mesmo `motivo` terá **todas** as escritas depois da primeira rotuladas assim. Correção barata: trocar a cópia para "motivo não registrado nesta edição". Fechamento completo: a aplicação escrever um valor inerentemente distinto (prefixo de timestamp) e o trigger separá-lo. |
| **REL-001** | média | **O histórico da tela pode ficar cego justamente durante um incidente.** `page.tsx` lê as **35 linhas mais recentes de todos os slugs juntos** e só depois separa 5 por slug. Como 7 × 5 = 35, "últimas 5 por slug" só vale se as edições estiverem perfeitamente distribuídas. Numa noite de correções repetidas em **um** slug — o cenário literal da AC3, "às 23h de um sábado" — os outros 6 mostram *"Sem histórico ainda"*, que se lê como **"ninguém nunca editou isto"**, não como "truncado". Uma consulta por slug resolve (o índice `(org_id, slug, created_at DESC)` já existe). |
| **REQ-002** | baixa | AC1 diz "toda escrita deixa rastro"; o que subiu cobre **UPDATE**. Um `DELETE` apaga um slug sem rastro nenhum (a policy é `FOR ALL`, e o service-role sempre pode), e o `INSERT` que o recriasse também não deixa — confirmei no dev. O `upsert` dos seeds sobre linha existente **é** UPDATE e está coberto; um delete-e-semeia não está. Não é regressão. Backlog: braço `AFTER DELETE`. |
| **DOC-001** | baixa | **O `manifest.json` que vai ser commitado mente sobre um `updated_at`.** Capturado às `11:04:12`, **antes** do rollback da AC4: registra `off-hours.updated_at = 2026-08-10T13:50:52`, o banco diz `2026-08-11T11:10:24`. A paridade não sofre (o check compara sha), mas a **M4 do próprio parecer do @po** mostrou que é justamente este campo que preservou a última pista física do mistério de 04/08. Um `npm run prompts:write` antes do commit torna a metadata verdadeira sem mexer em conteúdo. |
| **MNT-001** | baixa | **A story sobre governança foi implementada com DDL não auditado em produção.** Para provar o Risco 1, o `ALTER TABLE ... ADD CONSTRAINT tmp_87_1_forca_falha CHECK (false)` foi aplicado na tabela de **produção**: enquanto existiu, qualquer edição real pelo painel ou pela API — em **qualquer** dos 7 slugs, não só no órfão — teria perdido a linha de histórico em silêncio. Está revertido (conferi: só a PK). A escolha do slug órfão para as escritas de conteúdo foi bom julgamento; o DDL não teve o mesmo cuidado de escopo. Para o resto do Epic 87: prova de trigger/DDL vai no projeto de dev — **demonstrei viável nesta revisão**, com quatro mutações e limpeza completa. |
| **TEST-001** | baixa | **A parte da AC2 que diz "a tela mostra o porquê" não foi verificada em navegador — nem por mim nem pelo @dev.** Este repositório não tem `@testing-library`, então não há teste de componente possível, e eu não dirigi o painel com sessão de admin. **Registro como não verificado em vez de preencher.** Provado: a action devolve estado em todo caminho de rejeição, o Client Component consome por `useActionState` e renderiza `role="alert"`/`role="status"`, e os validadores têm teste. Falta a prova da renderização — 30 segundos no primeiro deploy fecham isso. |

### 🔴 Condição de deploy — bloqueante para o @devops

O snapshot reconciliado (`packages/ai/src/prompts/_production/{guardrails,property-presentation,system-personality}.txt` + `manifest.json`) **tem de ir no MESMO commit/PR** do código da AC6 (`agent-prompts-parity.ts`, `page.tsx`, `prompt-editor.tsx`).

Não é formalidade — está **medido**: contra o manifest de `HEAD` o selo dá **3 de 7 vermelhos**; contra o manifest do working tree, **0**. Se o selo subir sem os `.txt`, ele nasce ⚠️ em 3 slugs e a AC6 morre no dia 1 (Risco 5) — o mesmo padrão de "critério que nasce vermelho" que o @po pegou na 87-13.

Conferência após o merge: `npm run prompts:check` tem de sair **0** com os 7 slugs.

A migration `219` **já está em produção** (conferida objeto a objeto: trigger, função, tabela, índice, RLS, grants); o arquivo sobe para versionar o que já está no ar, mesmo padrão da `218`. Nada a fazer na Vercel.

---

## Change Log

| data | quem | o que |
|---|---|---|
| 2026-08-05 | @sm | Story criada a partir da AC5-A da 87-0, no corte aprovado pelo Gabriel. Incorpora a correção **C4** do @po (as 3 superfícies de escrita; o painel usa server action, não a rota PUT; histórico por trigger porque o `visit-scheduling` foi editado por fora das três). |
| 2026-08-11 | @dev (Dex) | **Implementada — `Ready` → `Ready for Review`.** D2 decidida e escrita antes de codar (opção (a), coluna `last_change_reason`), com uma guarda que a story não previa: o motivo só é creditado quando **muda no próprio `UPDATE`**, senão um `UPDATE` por SQL cru herdaria o motivo da última edição do painel e o histórico passaria a *mentir*. Ordem cumprida: `--write` do snapshot **primeiro** (Risco 5 — os 3 divergentes zeraram), migration `219` aplicada por Management API depois, código por último. Risco 1 **medido, não declarado**: forcei o `INSERT` de histórico a falhar com um `CHECK (false)` e confirmei que o `UPDATE` do prompt gravou assim mesmo (e que a perda de histórico é detectável pela descontinuidade `new_content` → `previous_content`). AC1 provada por SQL cru **sem motivo** (autor `system`, motivo nulo). AC4 exercitada em produção no slug **órfão** `off-hours` — escolhido para não expor a Nicole nem durante o teste — com rollback byte a byte e `--check` verde. Descoberto de passagem e corrigido: `update` sem linha afetada **não é erro** no PostgREST, então "negado pela RLS" parecia "salvo". Efeito colateral registrado: o `--write` quitou metade da dívida medida pelo `contradiction.test.ts` da 87-0 (snapshot: 4 → **0** contradições; constantes do código: seguem devendo 2), e o `it.fails` do lado do snapshot virou guarda de regressão — exatamente o comportamento que aquele teste foi escrito para forçar. |
| 2026-08-11 | @dev (Dex) | **Correções do gate CONCERNS — três itens, nada além.** **REQ-001:** a tela afirmava procedência falsa. A guarda contra herança de motivo (validada pelo @qa) **não foi tocada**; mudou a cópia, e agora ela decide pelo que a **linha sabe** — com autor identificado (`author_auth_id`/`author_user_id`) escreve "motivo não registrado nesta edição"; sem nenhum dos dois, "sem motivo — escrita sem autor identificado". Não adotei a redação única sugerida pelo gate porque ela apagaria o sinal do **Risco 4** (a fuga do painel tem de ficar visível): o segundo rótulo mantém o sinal dizendo só um fato da linha, sem afirmar o caminho da escrita. A frase virou função pura testável (`rotuloDeMotivoAusente`), já que componente aqui não é testável (TEST-001). **REL-001:** a leitura do histórico saiu de `page.tsx` para `@web/lib/agent-prompt-versions` e o teto passou a ser **do banco e por slug** (uma consulta por slug, `limit(5)`, sobre o índice `(org_id, slug, created_at DESC)` que a 219 já tinha). O teste monta a distribuição **desigual** (40 edições num slug, uma antiga em cada um dos outros seis) e roda o algoritmo **antigo como controle** no mesmo banco falso: antigo perde 6 dos 7 slugs, novo não perde nenhum. Vermelho medido por mutação, não declarado: o algoritmo antigo derruba 3 testes, o rótulo antigo derruba os outros 3. **DOC-001:** `npm run prompts:write` rodado — `off-hours.updated_at` deixou de dizer `10/08 13:50:52` e passou a dizer `11/08 11:10:24.31699`, que é o banco; só metadata mudou (o `prompts:check` estava e continua verde). Fora de escopo, por instrução: `TEST-001`, `REQ-002`, `MNT-001` e a guarda "só credita quando muda". **Restrição nova acatada: nenhum DDL emitido em lugar nenhum nesta passada** — só leitura de produção pelo `dump-agent-prompts` e testes em memória. Revalidado: `vitest` 172 arquivos/2167 passed, `turbo type-check lint --force` 13/13 com 0 erros, `next build` OK, `prompts:check` EXIT=0. |
| 2026-08-10 | @po (Pax) | **Validada — GO condicionado (7/10) · `Draft` → `Ready`.** Sete medições contra produção anexadas (§Medições). **Emendas aplicadas por mim:** (1) **AC6 nova** — selo de divergência painel × repositório, a única AC que teria tornado visível o erro "Yarden Residence" sem CI; (2) **AC7 nova** — dono e gatilho do `--check` (`npm run prompts:check` + gate do @qa), porque o script funciona e ninguém roda (M7); (3) **AC2-b nova** — gate de bootstrap nos scripts de seed, incluindo a **4ª superfície de escrita, `scripts/run-seed.ts` / `npm run seed`, que não estava em nenhuma story e grava `[placeholder]` nos 7 slugs** (M5); (4) tabela de superfícies corrigida de 3 → **5**, e removida a afirmação falsa de que a AC12 da 87-0 já neutralizou `seed-prompts.ts` (M6: o arquivo não tem gate nenhum); (5) **AC4** ganhou passo obrigatório de revisar o conteúdo antes de restaurar — hoje o snapshot commitado reintroduziria o cabeçalho `### YARDEN RESIDENCE` e os fatos removidos pela Tarefa 2 (M2); (6) **AC5** ganhou baseline numérico de `updated_at`; (7) **Risco 1 remitigado** — "trigger não valida" não impede o rollback do `UPDATE` quando o `INSERT` de histórico falha: exigidos `EXCEPTION WHEN OTHERS` + `SECURITY DEFINER`; (8) **Riscos 4 e 5 novos** (fricção empurra edição para fora do painel; selo que nasce vermelho vira ruído); (9) Dev Notes: prefixo de migration **215 → 219**, colisão do nome `set_updated_at` (001:295), RLS é a **098** e não a 096, mecanismo de transporte do motivo até o trigger, e `findRepoRoot()` quebra na Vercel (importar o `manifest.json` estaticamente); (10) acrescentados `Tarefas`, `Dev Agent Record`, `QA Results`, tamanho **M**, e a ressalva "o texto chega ≠ ela obedece" (caso Ronaldo, 09/08). Dependência de 87-0 reclassificada: Tarefa 1 entregue, Tarefa 2 feita à mão em prod e não devolvida ao repo — **não bloqueia**. |
