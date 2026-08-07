# Story 87-0 — Os prompts que rodam em produção não são os do código (paridade + reconciliação de `agent_prompts`)

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** Ready
**Item do roadmap:** **W0-0** — criado pelo @architect na validação de 05/08 (era `W2-4`, promovido a Onda 0 e marcado **BLOQUEANTE**)
**Criada por:** @sm (River) em 2026-08-05
**Formato:** Correção de substrato + reconciliação de configuração, com incidente medido em prod
**Executores:** @dev (script + testes) · @devops (acesso a prod, CI) · Gabriel + Marcos (reconciliação de produto) · @data-engineer (só se houver escrita em massa no banco)

> ## ✅ DESBLOQUEADA — as duas decisões do Gabriel saíram em 05/08
>
> **D-87-0-a — O PAINEL ADMIN É A FONTE DA VERDADE.** *"Não quero prompt fora do painel admin, o
> certo é o prompt ser o que veio de cadastro do painel admin, onde tem os campos editáveis."*
> É a **Opção A**: o banco (`agent_prompts`) é a fonte; o código vira **fallback de bootstrap**.
> **AC5-A vale — e foi extraída para a Story 87-1 no corte de 05/08. AC5-B é N/A.**
>
> **D-87-0-b — FATO DE EMPREENDIMENTO NÃO MORA EM PROMPT.** *"Informações dos empreendimentos
> precisa vir da tool empreendimentos, onde temos várias informações cadastradas."* Isso **muda a
> Tarefa 2** para o `property-presentation` e **reduz** o escopo da reconciliação — ver
> "Decisões tomadas", item b.
>
> ## ⛔ NADA DA ONDA 1 PODE SUBIR ANTES DELA
>
> Condição de aceite nº 1 do @architect
> (`docs/architecture/2026-08-05-validacao-epic-87.md`, seção 7): *"W0-0 sair **antes de qualquer
> deploy da Onda 1**"*. Toda AC de prompt das outras stories do Epic 87 é **inverificável**
> enquanto o que roda em produção não for o que está no repositório.

---

## Story

**Como** engenharia e produto da Trifold, que há ~4 meses corrigem o comportamento da Nicole
editando arquivos que a produção não lê,
**Queremos** uma fonte única e versionada para os prompts que realmente montam o system prompt
dela,
**Para que** "corrigi o prompt" volte a significar "o comportamento mudou em produção" — e para
que as ACs de prompt das próximas 20 stories do Epic 87 sejam verificáveis em vez de promessas.

---

## Context — o que foi medido (não inferido)

### O mecanismo

`buildStaticSystemContent` (`packages/ai/src/prompts/index.ts:80-106`) monta 8 seções. Cinco
delas são **sobrescrevíveis pelo banco**, com o padrão:

```ts
overrides?.["system-personality"] || PERSONALITY_PROMPT,   // index.ts:84
overrides?.["guardrails"]         || GUARDRAILS_PROMPT,    // index.ts:85
overrides?.["qualification-flow"] || QUALIFICATION_PROMPT, // index.ts:86
overrides?.["property-presentation"] || PROPERTY_PRESENTATION_PROMPT, // index.ts:87
overrides?.["visit-scheduling"]   || VISIT_SCHEDULING_PROMPT,         // index.ts:88
```

Os overrides vêm de `loadAgentConfig` (`packages/ai/src/chat/pipeline.ts:1476-1490`), que lê
`agent_prompts` filtrando `org_id` + `is_active = true`. **Enquanto houver linha ativa com
conteúdo não-vazio, a constante do código nunca é usada.**

Só três seções são imunes por construção — **IDIOMA** (`index.ts:82`), **ENDEREÇO DA SEDE**
(`index.ts:83`) e **LEMBRETE FINAL** (`index.ts:91-102`).

### A consequência, verificada em produção (`dsopqkqjkmhytudaaolv`) em 05/08

O `visit-scheduling` que rodava era **um fork editado à mão no painel, que não corresponde a
nenhum commit do repositório**. Perdeu, em relação ao código:

- as **3 etapas** de agendamento (ETAPA 1 obriga a sondar interesse **antes** de perguntar dia/hora);
- o bloco **REGRAS CRÍTICAS — NUNCA**;
- o tratamento de **`[SISTEMA: FORA DO HORARIO]`** e de "cliente deu só o dia";

e ganhou, coladas, a frase-molde *"Qual o melhor dia pra você, durante a semana ou sábado de
manhã?"* e *"O endereço do stand é [endereço do empreendimento]"*.

Essa frase-molde é **a origem mecânica do incidente da Sandra**: ela aparece literalmente na
conversa de 27/07 15:47, virou `visit_availability` no `conversation_state`, e foi reancorada em
05/08 como "sábado, dia 8". A palavra **"sede" aparece 0 vezes** nos overrides; **"stand", 5
vezes** — ou seja, mandamos ao modelo, no mesmo system prompt, a seção não-sobrescrevível
dizendo "todos os decorados ficam na SEDE" e um override dizendo para dar o endereço da obra.

**Guardrails do código que estavam anulados em produção** (@architect, §6.2): o fluxo de 3
etapas, a canonização do endereço da sede (anulada **e invertida**), a regra de **entrada mínima
de 20%** (`qualification-flow`) e as instruções de leitura do marcador `[SISTEMA]`.

### Estado medido dos 7 slugs (§6.0 da validação)

| slug | DB | código | `updated_at` | situação |
|---|---|---|---|---|
| `guardrails` | 9.070 | 9.069 | 2026-07-16 | **paridade semântica** — as 14 RNs iguais nos dois lados; diferença de emoji/acento/whitespace |
| `visit-scheduling` | 3.756 | 5.105 | 2026-08-04 17:28 | **JÁ RESOLVIDO em 05/08** — `content` reescrito no banco com a versão boa e **reativado**; ver Dev Notes, não refazer |
| `system-personality` | 2.478 | 5.468 | 2026-06-18 | **diverge** — reescrito, 55% menor no banco, textos estruturalmente diferentes |
| `property-presentation` | 3.952 | 5.063 | 2026-06-26 | **diverge — e a divergência é bidirecional** (ver abaixo) |
| `qualification-flow` | 2.458 | 2.940 | 2026-07-10 | **diverge** — banco perdeu a regra de entrada mínima de 20% |
| `handoff-summary` | 1.942 | — | 2026-06-13 | carregado e **nunca consumido** (botão morto) |
| `off-hours` | 327 | — | 2026-06-18 | carregado e **nunca consumido** (botão morto) |

**`property-presentation` é o caso que impede tratar isto como "restaurar o código".** O banco
perdeu as seções **CONDIÇÕES DE PAGAMENTO** (entrada mínima de 20%, *"não vendemos sem entrada —
isso é inegociável"*) e **DECORADOS E VISITAS** — mas é **mais correto que o código em fatos de
negócio**: Yarden "recém-lançado em 11/2025" (código diz "pré-lançamento Jul/2026"), entrega
"abril/2027" (código diz "2027"), e uma seção inteira de "ESCASSEZ E EXCLUSIVIDADE" que o código
não tem.

Sob a decisão **D-87-0-b**, essa disputa se resolve por eliminação, não por escolha: **as
seções de política ficam** (entrada mínima, decorados na sede, escassez como copy) e **os fatos
saem dos dois lados** (estágio, entrega, metragem, estoque) porque já vêm do cadastro.

> **Ninguém errou. Falta mecanismo.** Produto edita no painel, engenharia edita no repo, e nada
> reconcilia. É por isso que o entregável central desta story é uma **reconciliação humana**, não
> um `git checkout` do prompt.
>
> **E há um terceiro competidor que ninguém contou:** o cadastro. Para o Yarden, `properties`
> diz `status='selling'` ("Em comercialização") e é injetado a cada turno — enquanto o código diz
> "Pré-lançamento Jul/2026" e o banco diz "Recém lançado 11/2025". Não são duas versões
> disputando, são **três**, e a terceira é a única que está certa e se mantém sozinha. É
> exatamente isso que a decisão **D-87-0-b** resolve: esses fatos **saem do prompt**, dos dois
> lados. Ver "Decisões tomadas", item (b), e **AC11**.

### Uma terceira camada fantasma

`agent_config.personality_prompt` tem **12.445 caracteres** em produção, é carregado
(`pipeline.ts:1457,1494`) e **não é usado em lugar nenhum** de `buildSystemPrompt`. Alguém
escreveu isso. Não tem efeito nenhum.

---

## ✅ Decisões tomadas — 05/08/2026 (Gabriel)

> Item 3 do @architect (§6.3): *"Ou o banco é a fonte (e o código vira fallback de bootstrap, com
> o painel obrigando a registrar a mudança), ou o código é a fonte (e o painel some). **Não
> defendo qual — defendo que exista uma.**"*

### (a) Direção única: **o painel admin é a fonte da verdade** → Opção A

*"Não quero prompt fora do painel admin, o certo é o prompt ser o que veio de cadastro do painel
admin, onde tem os campos editáveis."* — Gabriel, 05/08/2026

**Consequências que a story assume:**
1. `agent_prompts` é a fonte; `packages/ai/src/prompts/*.ts` vira **fallback de bootstrap**
   (usado só quando não existe linha ativa com conteúdo).
2. **AC5-A vale, e virou a Story 87-1** (governança do painel); AC5-B é N/A e fica registrada apenas para memória da decisão.
3. Os controles listados no "Custo de implementação" da Opção A **deixam de ser opcionais** —
   sem histórico de versão, motivo obrigatório e diff automatizado, a Opção A reproduz em meses
   exatamente o estado que originou esta story. Ver a **Nota de tensão** ao fim desta seção.
4. `scripts/seed-prompts.ts`, que sobrescreve o banco a partir das constantes, passa a ser
   **destrutivo por definição** → **AC12**.

### (b) Fato de empreendimento **não mora em prompt** — vem do cadastro

*"Informações dos empreendimentos precisa vir da tool empreendimentos, onde temos várias
informações cadastradas."* — Gabriel, 05/08/2026

Isto **muda a Tarefa 2** e, no caso do `property-presentation`, **dissolve** a reconciliação em
vez de resolvê-la. Verificado no código e no cadastro de produção:

- `buildPropertyDataContext` (`pipeline.ts:1756-1845`) **já injeta**, a cada turno, direto do
  cadastro: `status` (mapeado para texto), endereço, `concept`, previsão de entrega (com a regra
  "nunca diga data exata"), **estoque real** com enquadramento de escassez (Stories 75-64/75-65),
  andares, tipologias, amenities, `commercial_rules.requires_down_payment` ("Exige entrada para
  compra") e o **FAQ aprovado** do empreendimento identificado.
- O cadastro em produção está **correto e completo**: Yarden `status='selling'`, entrega
  2029-06-30, 9 de 60 disponíveis; Vind 12 de 48, entrega 2027-06-30 — ambos com amenities,
  differentials, `commercial_rules` e FAQ preenchidos.

**Logo os fatos no `property-presentation` são redundantes E contraditórios.** Hoje a Nicole
recebe, no mesmo system prompt, **três versões do mesmo fato**: "Yarden: Em comercialização"
(cadastro, correto) + "Yarden: Pré-lançamento Jul/2026" (código) **ou** "Recém lançado 11/2025"
(banco). A reconciliação certa não é escolher entre a segunda e a terceira — é **apagar as duas**.

> **Precisão de vocabulário, para ninguém implementar a coisa errada:** "tool empreendimentos"
> aqui significa a **injeção determinística que já existe** (`buildPropertyDataContext`), **não**
> tool use da API da Anthropic. O @architect reprovou tool use como lever para este problema
> (§5.1) e defendeu exatamente isto: *"manter o grounding determinístico e consertar sua
> entrada"*. Nenhuma chamada de tool nova entra nesta story.

### Nota de tensão com a condição de aceite do @architect — **não silenciada**

A Opção A é legítima e o @architect explicitamente não defendeu direção. Mas ela desloca o peso
da condição nº 1 dele (*diff vazio*) para a condição nº 10 (*CI com job de diff de
`agent_prompts`*), que depende de **D5 — e D5 ainda não foi decidida**.

Com o código como fonte, o git seria a rede. Com o painel como fonte, **a única rede é o job de
diff + o histórico de versões**. Sem eles, a AC3 desta story vira uma **foto de um instante**: o
diff fica vazio no dia do gate e volta a divergir no primeiro save do painel. Palavras do
@architect: *"é o único jeito de a paridade não voltar a apodrecer em 4 meses"*.

**Encaminhamento (não bloqueia esta story):** os controles da **Story 87-1** cobrem o essencial do lado do
painel (motivo obrigatório + histórico + snapshot pós-save). A CI continua sendo da story de D5 e
**precisa entrar no mesmo sprint**. Se D5 for adiada, este parágrafo é o registro de que a
condição nº 10 ficou aberta por decisão consciente, não por esquecimento. Ver Risco 4.

> **[@po 05/08] Aceito o encaminhamento — mas parágrafo não é mecanismo.** Bloquear a W0-0 numa
> decisão que ainda não existe (D5) inverteria a dependência: a story que destrava o epic ficaria
> esperando a story que depende dela para ter o que checar. Duas condições para o encaminhamento
> valer:
> 1. **Item de backlog criado nesta validação** (`docs/backlog.md`, item de D5) nomeando o job
>    `dump-agent-prompts --check` em CI, com esta story como origem. Sem entrada em backlog, a
>    "mesma sprint" é uma intenção guardada num parágrafo que ninguém relê.
> 2. **Rede interina, custo zero:** enquanto a CI não existir, o `--check` é rodado pelo @qa em
>    **todo gate de story do Epic 87 que toque prompt** (o epic já exige AC dupla código+banco).
>    Divergência encontrada no gate = achado bloqueante da story em curso, não desta.

---

### Opção A — **O banco é a fonte** (código vira fallback de bootstrap) — ✅ **ESCOLHIDA**

| | |
|---|---|
| **A favor** | Produto ajusta tom, fato e copy **sem deploy**, em minutos — é o que o Marcos já faz hoje e é o que produziu o `property-presentation` mais correto que o do código. Uma correção de fato de negócio errado não fica esperando fila de PR. |
| **Contra** | O prompt vira **dado não versionado**: sem code review, sem diff, sem blame, sem rollback por git. A única defesa contra o que aconteceu (fork de mão que perdeu 3 seções e 3 guardrails) passa a ser disciplina humana. Toda AC de prompt das stories futuras teria que ser verificada **no banco**, não no repo — e o @qa precisa de acesso a produção para fechar gate. |
| **Custo de implementação** | Histórico de versões de `agent_prompts` (tabela ou coluna `previous_content`) + campo **obrigatório** de motivo no painel + snapshot automático pós-save + job de diff diário. Sem isso, apodrece de novo em 4 meses. |
| **Efeito nas ACs desta story** | AC5-A vale (→ Story 87-1), AC5-B não se aplica. AC3 (diff vazio) continua sendo o portão **aqui**. |

### Opção B — **O código é a fonte** (o painel some) — ❌ **NÃO ESCOLHIDA** (registro da decisão)

| | |
|---|---|
| **A favor** | O prompt volta a ser código: PR, review, diff, teste automatizado, rollback por git, e as ACs de prompt do Epic 87 passam a ser verificáveis no repositório. Elimina a **classe inteira** de "corrigi e não pegou" — que é a razão de existir desta story. |
| **Contra** | Todo ajuste de tom/fato passa a exigir **deploy**. Remove uma capacidade que produto usa de verdade e que, em pelo menos um slug, produziu conteúdo **melhor** que o do código. Risco alto de o painel voltar em 3 meses por pressão operacional — e voltar sem os controles. |
| **Custo de implementação** | Desativar/remover as linhas de `agent_prompts`, remover ou congelar as telas e as rotas admin, e **prever um caminho de emergência** para hot-fix sem deploy (flag/env), senão o primeiro incidente fora do horário comercial reabre o painel na marra. |
| **Efeito nas ACs desta story** | AC5-B vale, AC5-A não se aplica. AC3 vira "nenhuma linha ativa em `agent_prompts`" (ver AC3, nota). |

### (c) e (d) — os campos órfãos e o handoff → **extraídos para a Story 87-2**

Decisões do Gabriel, 05/08: **(c)** os campos do painel que não fazem nada **passam a valer**
(nada sai do painel) e **(d)** o handoff é **moldura editável, valores do código, sem LLM**.

Ambas foram extraídas para **`87-2-campos-mortos-do-painel-passam-a-valer.story.md`** no corte
aprovado — são **comportamento novo** e não tocam em nenhum dos 5 overrides que mascaram o system
prompt, logo não pertencem ao bloqueio da Onda 1. A auditoria completa (**5** superfícies órfãs,
não 3) está lá.

**O que fica aqui:** a 87-0 entrega o **detector** — o teste que enumera configuração sem
consumidor, com as 5 atuais como exceções declaradas (AC13). A 87-2 esvazia a lista.

---

## Escopo — as 5 tarefas (item 6.3 da validação do @architect)

### Tarefa 1 — Snapshot versionado

Dump de `agent_prompts` de produção para `packages/ai/src/prompts/_production/`, **commitado**.
Passa a existir um diff revisável. Um arquivo por slug + um `manifest.json` com procedência
(org, `is_active`, `updated_at`, `sha256`, `char_count`, `captured_at`).

Entregável adicional: `scripts/dump-agent-prompts.ts` com dois modos — `--write` (regrava o
snapshot) e `--check` (compara e sai com código ≠ 0 na divergência). É o `--check` que a CI vai
chamar depois (condição 10 do @architect; a fiação da CI é da story de D5, não desta).

**O snapshot é também o backup.** Ele precisa estar commitado **antes** de qualquer `UPDATE` em
`agent_prompts` — é o critério de rollback da Tarefa 4.

### Tarefa 2 — Reconciliação humana, uma vez

**Isto é uma tarefa com entregável, não uma intenção.** Produto (Gabriel/Marcos) + engenharia
sentam com o diff, **slug a slug**, e produzem a versão única. Estimativa do @architect: **2–3h**.
Ele chama de *"o melhor ROI do epic inteiro"*.

> **A decisão (b) muda a natureza desta tarefa para um slug e reduz o escopo dos demais.**
> A pergunta deixa de ser sempre *"qual das duas versões vence?"* e passa a ter três respostas
> possíveis por seção: **banco vence · código vence · a seção não deveria existir no prompt**.
> Regra que passa a valer para os 7 slugs: **fato de empreendimento que já está no cadastro sai
> do prompt.** O prompt fica com a **forma** de apresentar (tom, ordem, o que enfatizar, como
> lidar com objeção); o **conteúdo factual** vem de `buildPropertyDataContext`.
>
> Aplicação concreta em `property-presentation`: saem status/estágio de lançamento, data de
> entrega, metragens, número de unidades e endereço — **todos já injetados do cadastro**.
> Fica a seção **ESCASSEZ E EXCLUSIVIDADE** (que é copy, e que o próprio
> `buildPropertyDataContext` referencia no comentário da linha ~1789 como responsável pela
> redação), fica **CONDIÇÕES DE PAGAMENTO** na parte que é regra de conduta ("não vendemos sem
> entrada — isso é inegociável" é política comercial, não fato de empreendimento) e fica
> **DECORADOS E VISITAS**. Ver **AC11**.
>
> **[@po 05/08] Duas precisões neste corte, para o @dev não errar por excesso nem por falta:**
> - **Ficam também: `Diferenciais`, `Quando apresentar` e `Argumento-chave`** de cada
>   empreendimento. `differentials` está **`[]` nos dois** no cadastro (verificado), e
>   "quando apresentar/argumento-chave" é julgamento de venda, não fato. Sai fato injetado, não
>   sai a inteligência comercial.
> - **"Total de unidades" sai por outro motivo** — o cadastro tem `total_units` mas
>   `buildPropertyDataContext` **deliberadamente não imprime número cru em fase de lançamento**
>   (Stories 75-64/75-65). Ou seja: aqui a razão não é "já vem do cadastro", é "a política de
>   escassez proíbe o número". Registrar assim no documento da AC4, senão a regra
>   "só sai o que o cadastro injeta" parece violada.
> - **A regra vale para EXEMPLOS, não só para seções declarativas.** O incidente da Sandra nasceu
>   de uma **frase-molde de exemplo** que a Nicole falou literalmente. Logo, exemplos que embutem
>   estado por empreendimento (ex.: *"o Vind é bem concorrido, boa parte das unidades já foi"*,
>   em ESCASSEZ E EXCLUSIVIDADE) precisam virar genéricos ("esse empreendimento…"), ancorados no
>   bloco DADOS ATUALIZADOS. Nenhum regex da AC11 pega essa classe — é trabalho da leitura humana
>   da Tarefa 2, e está aqui para não passar batido.

Entregável: `docs/decisions/2026-08-XX-reconciliacao-agent-prompts.md`, com **uma linha por slug**
(os 7) e, para cada:

| campo | conteúdo |
|---|---|
| decisão | `banco vence` · `código vence` · `merge` · **`sai do prompt` (fato que vem do cadastro — decisão b)** — com o texto final anexado |
| motivo | por que, em uma frase |
| fatos de negócio conferidos | entrada mínima de 20% e decorado na sede (**política**, fica no prompt) × lançamento/entrega/metragem/estoque do Yarden e do Vind (**fato de cadastro**, sai do prompt) |
| origem da edição no banco | quem editou e por quê, **quando conhecido** — o `visit-scheduling` foi alterado em 2026-08-04 17:28 UTC e não sabemos por quem (limitação nº 5 do @analyst: *"vale descobrir antes de sobrescrever"*) |
| assinatura | produto **e** engenharia |

**Nenhum slug pode ficar com decisão "pendente".** Regra explícita, porque a divergência é
bidirecional: **não assumir que o código vence** — em `qualification-flow` o código tem o
guardrail de entrada mínima que o banco perdeu, e no `property-presentation` boa parte da disputa
simplesmente **deixa de existir** com a decisão (b), porque os fatos saem dos dois lados.

#### 🔒 Gate de copy — **o Gabriel aprova antes de aplicar** (D-87-0-e, 05/08)

**Nenhum texto vai ao banco sem OK dele.** A lead monta a proposta de reconciliação slug a slug e
leva; o @dev **não decide texto** e o @sm **também não**. O papel desta story é preparar o diff,
a estrutura da decisão e a verificação — não escolher a redação.

*Verifica-se* na AC4: o documento registra a aprovação (nome + data) **antes** de qualquer
`UPDATE` em `agent_prompts`. Um `updated_at` novo sem aprovação registrada é achado bloqueante.

#### 💰 Regra de entrada: **percentual, nunca valor em reais** (D-87-0-f, 05/08)

Decisão do Gabriel. O prompt fala **"entrada mínima de 20%"** e **não cita valor absoluto**. Saem
as frases *"a entrada fica em torno de 80 mil"* e *"com cerca de 80 mil você já garante sua
unidade"*.

**Motivo, com a evidência que o @po levantou:** o cadastro do Vind tem
`commercial_rules.min_down_payment = **68000**`, o prompt dizia **80 mil**, e o Yarden não tem o
campo. Valor em reais **desatualiza sozinho** e nasce uma quarta versão do mesmo fato — a doença
que esta story existe para curar. Percentual é regra de negócio estável; reais é preço.

**Isso resolve o conflito da regra escrita duas vezes** (`qualification.ts:34-40` e
`property-presentation.ts:47-56`, com o mesmo exemplo dos 80 mil), apontado pelo @po: a regra
passa a ter **um dono declarado** e **sem número absoluto**. A AC4 exige que o documento nomeie
qual slug é o dono — manter a duplicata é recriar a divergência de origem.

### Tarefa 3 — Direção única: **o painel é a fonte** (Opção A)

Executar a Opção A: banco como fonte, **código como fallback de bootstrap declarado**
(comentário de cabeçalho nos `packages/ai/src/prompts/*.ts` dizendo que a fonte é o banco).

> **A governança do painel — motivo obrigatório, histórico de versão por trigger, migration —
> foi extraída para a Story `87-1-governanca-painel-agent-prompts.story.md`** no corte aprovado.
> Ela **não bloqueia a Onda 1** (previne apodrecer, não restaura paridade), mas é a rede que a
> decisão A exige: ver a **Nota de tensão** acima. A **AC5-A saiu desta story**; a AC5-B
> permanece registrada como N/A.

### Tarefa 4 — Teste de contradição *(não de divergência)*

Divergência é "os textos são diferentes"; **contradição** é "as duas instruções não podem ser
verdadeiras ao mesmo tempo". Nenhuma seção sobrescrevível pode afirmar
"stand / endereço da obra" como local de visita enquanto a seção **não-sobrescrevível**
(`index.ts:83`) afirma que o decorado fica na **sede**. Verificável por regex, e **pega a classe
inteira**, não só o caso conhecido.

### Tarefa 5 — Detector de configuração sem consumidor *(o que sobrou aqui da Tarefa 5 original)*

A construção dos campos órfãos foi para a **87-2**. O que **fica nesta story** é o instrumento que
torna o problema visível e impede que ele cresça: um teste que enumera as superfícies de
configuração editáveis e afirma que cada uma tem consumidor no runtime.

Como as 5 atuais só ficam verdes na 87-2, elas entram como **exceções declaradas com motivo e
ponteiro para a 87-2**. O teste falha se aparecer uma **nova** superfície órfã — que é a garantia
de que a próxima não vai levar 4 meses para ser notada. Ver **AC13**.

---

## Acceptance Criteria

> Toda AC diz **como se verifica**. As ACs 3 e 7 são, literalmente, as duas condições de aceite
> exigidas pelo @architect (§7, item 1).

**AC1 — O snapshot existe, é completo e é auditável.**
`packages/ai/src/prompts/_production/` contém um arquivo `{slug}.txt` para **cada linha** de
`agent_prompts` da org `00000000-0000-0000-0000-000000000001` (7 hoje, ativas **e inativas**) e um
`manifest.json` com `slug, name, type, is_active, updated_at, char_count, sha256, captured_at, org_id`.
*Verifica-se:* `ls packages/ai/src/prompts/_production/*.txt | wc -l` == número de linhas
retornadas por `select count(*) from agent_prompts where org_id = '…0001'`; e para cada arquivo,
`shasum -a 256` bate com o `sha256` do manifest. Arquivos e manifest **commitados**.

**AC2 — O `--check` detecta divergência e não dá falso verde.**
`npx tsx scripts/dump-agent-prompts.ts --check` sai com **0** quando snapshot == produção, e com
**≠ 0** listando o slug divergente quando não. *Verifica-se:* rodar `--check` (verde) → alterar 1
caractere em um arquivo do snapshot → rodar de novo → sai ≠ 0 e o output nomeia o slug alterado →
reverter. Os dois resultados vão colados no Dev Agent Record.

**AC3 — [Condição nº 1 do @architect] O diff entre snapshot e produção é vazio, com a versão
reconciliada já aplicada.**
*Verifica-se:* `npx tsx scripts/dump-agent-prompts.ts --check` retorna exit 0 **depois** de a
Tarefa 2 estar aplicada em produção, com o output colado na story.
*Estado esperado sob D-87-0-a:* **7 linhas, todas `is_active = true`**, com os `content`
reconciliados. Qualquer linha inativa no manifest é achado a explicar no gate, não o esperado.

**AC4 — A reconciliação é um documento assinado, sem lacunas.**
*Verifica-se:* existe `docs/architecture/adr/adr-008-reconciliacao-agent-prompts.md` (convenção do
repo — `docs/decisions/` não existe; ADRs moram em `docs/architecture/adr/`) com **7 linhas**
(uma por slug), **nenhuma** com decisão "pendente", cada uma com motivo, e com a separação de
D-87-0-b explícita: **política/forma fica** — (a) **entrada mínima de 20%** (hoje ausente em
produção), (b) decorado na **sede** vs. endereço da obra, (c) escassez e exclusividade; **fato de
cadastro sai** — (d) estágio de lançamento e data de entrega do Yarden e do Vind, (e) metragens e
estoque. Assinado por produto e por engenharia (nome + data no documento).
Acrescido pelas decisões de 05/08: (f) o documento nomeia **qual slug é o dono** da regra de
entrada — hoje ela está escrita em `qualification.ts:34-40` **e** `property-presentation.ts:47-56`
— e registra que ela é **percentual (20%), sem valor em reais** (D-87-0-f); (g) o documento
registra a **aprovação do Gabriel** (nome + data) **antes** de qualquer `UPDATE` no banco
(D-87-0-e).
*Verifica-se também por grep, depois de aplicado:*
`grep -rniE "80 ?mil|R\$ ?80|\b68\.?000\b" packages/ai/src/prompts/_production/` retorna **0** —
nenhum valor de entrada em reais sobrevive nos overrides.

> **[@po 05/08] Três itens que o documento da AC4 é obrigado a resolver — medidos no cadastro de
> produção hoje, não inferidos:**
> 1. **A regra de 20% está escrita DUAS vezes no código** — `qualification.ts:34-40` e
>    `property-presentation.ts:47-56`, com o mesmo exemplo dos "80 mil". O documento precisa
>    nomear **um** slug dono; manter nos dois recria a divergência que originou a story (foi
>    exatamente o `qualification-flow` do banco que perdeu a regra).
> 2. **"entrada em torno de 80 mil" × cadastro:** `commercial_rules.min_down_payment` = **68000**
>    no Vind e **ausente** no Yarden. O número do prompt não é injetado por
>    `buildPropertyDataContext` (só o booleano `requires_down_payment` vira "Exige entrada para
>    compra") — então ele **fica**, mas fica declarado como fato sem dono no cadastro, com data de
>    revisão. É a mesma classe de "terceira versão" que a story descreve.
> 3. **`differentials` está `[]` nos DOIS empreendimentos** (verificado 05/08). Logo as seções
>    **Diferenciais**, **Quando apresentar** e **Argumento-chave** do `property-presentation`
>    **FICAM** — não há cadastro para elas. Removê-las é a materialização do Risco 5.

**AC5-A — ➡️ MIGRADA para a Story 87-1** (governança do painel: motivo obrigatório nos 3 caminhos
de escrita, histórico por trigger, migration). Saiu daqui no corte aprovado em 05/08 porque
**previne apodrecer**, não restaura paridade — logo não pertence ao bloqueio da Onda 1. As
correções **C4** do @po (as 3 superfícies de escrita; o painel usa a server action `savePromptAction`,
não a rota `PUT`; histórico por trigger porque o `visit-scheduling` foi editado por fora das três)
foram transportadas **na íntegra** para lá.

> **O que sobrou aqui da AC5-A:** o **fallback declarado** — os `packages/ai/src/prompts/*.ts`
> ganham comentário de cabeçalho dizendo que são bootstrap e que a fonte é o banco.
> *Verifica-se:* `grep -l "bootstrap" packages/ai/src/prompts/*.ts` lista os 5 arquivos de override.

**AC5-B — ❌ N/A.** A Opção B não foi escolhida (decisão D-87-0-a, 05/08). Mantida no texto apenas
como registro; nada a verificar.

> ⚠️ **O item (iii) da AC5-B não se perde — virou a AC9.** Com o banco como fonte, o fallback do
> código continua existindo (bootstrap) e precisa continuar testado, senão vira a próxima camada
> que ninguém sabe se funciona.

**AC6 — Teste de contradição sede × stand, vermelho antes e verde depois.**
Existe teste automatizado (`packages/ai/src/prompts/*.test.ts`) que carrega **todos** os arquivos
de `_production/` **e também as constantes de `packages/ai/src/prompts/*.ts`** (o fallback de
bootstrap ship junto com o deploy — se ele carrega a frase banida, a AC9 injeta a contradição
sempre que faltar override) e falha se qualquer um casar os padrões de "obra como local de
visita" — mínimo: `/\bstands?\b/i`, `/endere[çc]o d[oa]s? (empreendimento|obra)/i`,
`/no local da obra/i`. *Verifica-se:* rodando contra o snapshot **capturado hoje**, o teste
**falha**; rodando contra o snapshot reconciliado, **passa**. Os dois resultados vão colados na
story — um teste que nunca ficou vermelho não prova nada.

> **[@po 05/08] Onde o "stand" realmente está hoje — medido no banco de produção às 21h, depois
> da correção do `visit-scheduling`.** As "5 ocorrências" do @architect são de **antes** daquela
> correção e a story as atribuía ao slug errado. O estado real é:
>
> | slug | ocorrências de "stand" | trecho |
> |---|---|---|
> | `guardrails` | **2** | *"O memorial completo fica disponivel la no stand de vendas!"* · *"…nem que so da pra ver no stand"* |
> | `property-presentation` | **1** | *"…ze com convite para visita ao stand"* |
> | `system-personality` | **1** | *"…caso o lead queira visitar o stand de vendas"* |
> | `visit-scheduling` | **0** | já reconciliado em 05/08 |
> | `handoff-summary`, `off-hours`, `qualification-flow` | **0** | — |
>
> Mesmo padrão no código: `guardrails.ts:23` e `:88` têm as mesmas duas frases.
> **Consequência de escopo, e ela é obrigatória:** limpar o "stand" **exige editar `guardrails` e
> `system-personality`** — dois slugs que a tabela do Context marca como "paridade" / "diverge,
> mas não é o caso crítico". Essa edição é **explicitamente dentro do escopo** desta story e é a
> única exceção autorizada ao item "não reescrever o conteúdo dos prompts" de *Fora de escopo*:
> o corte permitido é **apagar/reescrever a frase que cita stand**, nada além dela.

**AC7 — [Condição nº 1 do @architect, segunda metade] `grep` de "stand" nos overrides = 0.**
*Verifica-se:* `grep -riwEc "stands?" packages/ai/src/prompts/_production/` reporta **`:0` em
todos os arquivos** (o `-w` evita falso positivo com "standard"), e
`grep -riwE "stands?" packages/ai/src/prompts/_production/` não imprime nenhuma linha.
Decisão registrada: **a palavra "stand" fica banida dos overrides** — a Trifold não tem stand, os
decorados ficam na sede — o que torna o critério um zero limpo, sem allowlist e sem julgamento de
contexto. Rodar o mesmo `grep` **antes** da reconciliação deve mostrar **4 ocorrências em 3
slugs** (`guardrails` 2, `property-presentation` 1, `system-personality` 1 — ver tabela na AC6);
os dois outputs vão colados na story. O mesmo zero vale para as constantes do código
(`grep -riwEc "stands?" packages/ai/src/prompts/*.ts` ignorando comentários JSDoc — hoje
`guardrails.ts` tem 2 dentro do texto do prompt e `visit-scheduling.ts` tem 1 **fora** dele, no
cabeçalho de comentário, que não conta).

**AC8 — ➡️ MIGRADA para a Story 87-2** (`87-2-campos-mortos-do-painel-passam-a-valer.story.md`).
As quatro sub-ACs (AC8-a off-hours · AC8-b moldura do handoff com a trava `pura e síncrona` ·
AC8-c `personality_prompt` · AC8-d bug do `visit_availability`) foram transportadas na íntegra,
junto com as correções **C5** do @po (3ª superfície `PATCH /api/agent-config`; proibição de usar
`is_active = false`). Lá o escopo cresceu para **5** superfícies órfãs — entram
`agent_config.greeting_message` e `agent_config.guardrails`.

> **O que fica nesta story:** o **detector** (AC13), não a construção.

**AC9 — O fallback de bootstrap continua funcionando, e isso vira intenção testada.**
Com o painel como fonte, o código só entra quando **não há** linha ativa com conteúdo — e esse
caminho precisa continuar coberto, senão vira a próxima camada que ninguém sabe se funciona.
*Verifica-se:* existem testes que provam que `buildStaticSystemContent` usa a constante do código
quando o override do slug é (i) ausente, (ii) `null`, (iii) string vazia — e que usa o conteúdo do
banco quando ele é string não-vazia (os testes da Story 53-1 em `index.test.ts:120-193` já cobrem
parte disto; completar o que faltar em vez de reescrever). Somado a isso, um teste que prove que
um slug com `is_active = false` **não** chega a `prompt_overrides` (o filtro está em
`pipeline.ts:1482`).

**AC10 — Sem regressão e sem surpresa em produção.**
*Verifica-se:* `npx vitest run` verde (incluindo os testes existentes de override da Story 53-1 em
`packages/ai/src/prompts/index.test.ts`), `npm run type-check` e `npm run lint` sem erro novo; e,
**após o deploy/aplicação**, uma conversa de teste real em produção em que a Nicole (a) não usa a
palavra "stand", (b) sonda o interesse antes de perguntar dia/hora, (c) menciona o endereço da
sede quando perguntada. Resultado registrado com o horário e o telefone de teste.

**AC11 — [decisão b] Fato de empreendimento não aparece mais em prompt nenhum.**
Nenhum dos 7 arquivos de `_production/` afirma fato que já vem do cadastro via
`buildPropertyDataContext`. *Verifica-se por três vias, todas obrigatórias:*
- (i) **Regex, no mesmo teste da AC6:** os overrides não casam
  `/pr[ée]-?lan[çc]amento/i`, `/rec[ée]m[- ]lan[çc]ad/i`, `/\b20(2[5-9]|3[0-9])\b/` (ano de
  entrega), `/\d+\s?m2|\d+\s?m²/` (metragem) nem `/\b\d+\s+unidades\b/i`. O teste roda
  **vermelho** contra o snapshot de hoje (o `property-presentation` casa vários) e **verde**
  depois. Padrões e exceções ficam declarados no próprio teste.

  > **[@po 05/08] O que esses regexes casam HOJE, medido no banco — leia antes de escrever o
  > teste, porque dois dos alvos não são fato de empreendimento:**
  >
  > | slug | casa o quê |
  > |---|---|
  > | `property-presentation` | `rec[ée]m lan` ✔ · metragem ✔ · anos **2025, 2027, 2029** ✔ — **estes são os alvos legítimos** |
  > | `guardrails` | ano **2027** — em *"previsao para o primeiro semestre de 2027"*, exemplo de fala. **É fato de entrega e deve sair** (o cadastro injeta o semestre certo): trocar o ano pelo genérico "o semestre que o bloco DADOS ATUALIZADOS informar" |
  > | `visit-scheduling` | ano **2026** — em *"aconteceu com dois clientes em 03/08/2026"*. **Falso positivo**: é data de incidente, não fato de empreendimento. **Não editar este slug** (ele já está reconciliado) — a exceção é declarada no teste, com o motivo escrito |
  > | `pr[ée]-lan[çc]amento` | **0 hits no banco.** Essa string vive na **constante do código** (`property-presentation.ts:26`, "Pre-lancamento (lancamento previsto Jul/2026)"). Se o teste rodar só contra `_production/`, esse padrão **nunca fica vermelho** — rode-o também contra as constantes, como já exigido na AC6 |
  > | `\d+ unidades` | **0 hits no banco** (só no código, "48/60 apartamentos"). Mesmo raciocínio |
  >
  > Regra que fecha o buraco: **exceção no teste só vale com motivo escrito na linha**. Exceção
  > sem motivo é o começo do próximo `--check` que todo mundo ignora.
- (ii) **Contradição resolvida na prática:** montar o system prompt completo
  (`buildSystemPrompt` + `buildPropertyDataContext` com o cadastro real) e afirmar sobre o
  resultado. É a asserção que prova que as três versões do mesmo fato viraram uma.

  > **[@po 05/08] Como escrever esta asserção para ela provar o que promete** — conferido contra
  > o cadastro de produção de hoje:
  > - **"aparece uma vez" está errado:** `Yarden` **e** `Vind Residence` estão os dois com
  >   `status='selling'`, e `buildPropertyDataContext` percorre todas as properties ativas. Com o
  >   cadastro real, **"Em comercializacao" aparece 2×**. Afirmar sobre o **bloco do Yarden**
  >   (`Yarden (Em comercializacao)`), ou fixar a fixture em uma property.
  > - **Rodar a montagem DUAS vezes:** (a) com os overrides de `_production/` — aqui o vermelho
  >   de hoje é **"Recém lançado"**; (b) **sem overrides** (o fallback de bootstrap, AC9) — aqui o
  >   vermelho de hoje é **"Pré-lançamento (lançamento previsto Jul/2026)"**. As três versões só
  >   viram uma quando os dois caminhos passam.
  > - **Asserção positiva, obrigatória (é a mitigação real do Risco 5):** o prompt montado
  >   **continua contendo** para o Yarden — previsão de entrega ("segundo semestre de 2029",
  >   de `delivery_date=2029-06-30`), as tipologias com metragem (`83.66m2` / `79.81m2`, 2 linhas
  >   em `typologies`) e o endereço. Sem essa metade, a AC prova que apagamos, não que
  >   substituímos.
- (iii) **O que fica, fica de propósito:** o documento da AC4 lista, para
  `property-presentation`, quais seções permaneceram (ESCASSEZ E EXCLUSIVIDADE, CONDIÇÕES DE
  PAGAMENTO, DECORADOS E VISITAS) e por que cada uma é **forma/política**, não fato.

**AC12 — `scripts/seed-prompts.ts` não pode mais destruir a fonte da verdade.**
Com o painel como fonte, um `upsert` cego a partir das constantes do código apaga o trabalho da
Tarefa 2. *Verifica-se:* rodar o script sem o novo gate **falha com mensagem explícita** e **não
executa nenhum write** (conferir por `updated_at` inalterado nos 7 slugs); com o gate explícito
(flag `--bootstrap` / env dedicada), ele roda. O cabeçalho do arquivo declara **bootstrap-only**
e aponta para esta story. A escrita em `agent_config.personality_prompt` (linhas 84-88) fica sob
o **mesmo gate** — o destino final desse campo é da **87-2** (AC3 de lá), mas ele não pode ser
sobrescrito por engano enquanto isso.

**AC13 — Configuração sem consumidor vira teste, com as pendências declaradas.**
Existe teste que cruza **toda superfície de configuração editável** com o consumidor no runtime e
falha quando alguma não tem — a classe de defeito que sustentou 4 meses de MemPalace e 5 campos
mortos neste painel.
*Verifica-se:* (i) o teste enumera os slugs de `agent_prompts` e os campos de `agent_config`
carregados em `loadAgentConfig`, e afirma consumidor para cada um; (ii) as **órfãs atuais**
(`off-hours`, `handoff-summary`, `personality_prompt`, `greeting_message`, `guardrails`) ficam
marcadas **com motivo escrito e ponteiro para a 87-2** — nenhuma pendência sem justificativa;
(iii) acrescentar uma superfície nova sem consumidor deixa o teste **vermelho** — provado
adicionando um campo fake e revertendo.
*Entregue em `packages/ai/src/config-surfaces.test.ts` (@dev, 05/08).*

> **O mecanismo de marcação é `it.fails`, não allowlist nem `skip` — e isso é melhor do que a AC
> pedia.** `skip` apodrece em silêncio (foi assim que o `handoff-summary` ficou 4 meses morto);
> com `it.fails`, no dia em que a 87-2 fechar a dívida o marcador **passa a falhar** e obriga
> quem fechou a removê-lo. A dívida não pode ser esquecida nem por acidente. Registrado aqui
> como a forma aceita.

*Fecho:* a **AC7 da Story 87-2** exige que esses marcadores terminem **removidos**, com o teste
verde sem exceção nenhuma. Aqui entregamos o instrumento; lá ele fica verde sozinho.

---

## Dev Notes

### ⚠️ O `visit-scheduling` JÁ FOI RESOLVIDO em 05/08 — não refaça, e não procure slug inativo

Houve **duas** intervenções em 05/08, nesta ordem. Só o estado final importa para quem implementa:

1. **Primeiro** o slug foi **desativado** (`is_active = false`), fazendo o `||` do `index.ts:88`
   cair na constante do código. Funcionou, mas contrariava a decisão D-87-0-a (painel é a fonte)
   e tirava o slug do painel.
2. **Depois** — e este é o **estado atual** — o `content` foi **reescrito no banco com a versão
   boa e o slug foi reativado**. **Verificado em produção: `is_active = true`, 7/7 slugs ativos**,
   e o conteúdo tem as 3 etapas, o FORA DO HORÁRIO e as REGRAS CRÍTICAS — **sem** a frase-gatilho
   e **sem** o "endereço do empreendimento como stand". Existe backup do estado anterior.

> **Portanto: não existe mais slug desativado.** Qualquer instrução anterior sobre "o
> `visit-scheduling` está inativo" está superada. O snapshot da Tarefa 1 vai capturar **7 linhas,
> todas ativas** — se vier alguma inativa, isso é achado, não o esperado.

Implicações para quem for implementar:
1. **Não reescreva o `visit-scheduling`.** Ele é o único slug que já está na versão reconciliada;
   na Tarefa 2 ele entra como **`banco vence`, já executado**, e serve de **modelo** do que os
   outros 4 precisam virar. Ainda assim ele **entra no snapshot e nos testes** — as ACs 6, 7 e 11
   valem para os 7 arquivos, sem exceção.
2. **Não rode `scripts/seed-prompts.ts`.** Com o painel como fonte, ele é destrutivo por
   definição: faz `upsert` dos 7 slugs a partir das constantes e sobrescreve
   `agent_config.personality_prompt`. Rodá-lo hoje apagaria a versão boa do `visit-scheduling`
   que acabou de ser gravada. Neutralizá-lo é a **AC12**.
3. Os **outros 6 slugs continuam ativos**, 4 deles divergentes. Desativar slug "para resolver
   rápido" deixou de ser uma saída: sob a decisão D-87-0-a, a correção é **editar o conteúdo no
   banco**, não desligar a linha para o código assumir.
4. O painel filtra `is_active = true` (`personalidade/page.tsx`) — com 7/7 ativos, os 7 aparecem
   na tela. Consequência a considerar na Tarefa 5: `handoff-summary` e `off-hours` estão
   **visíveis e editáveis** ali, e não fazem nada — tratado na **Story 87-2**; aqui só o detector (AC13).

### Mapa de código (o que ler antes de mexer)

| arquivo | linha | o quê |
|---|---|---|
| `packages/ai/src/prompts/index.ts` | 41-47 | `DbPromptOverrides` — tipa **5** slugs |
| `packages/ai/src/prompts/index.ts` | 80-106 | `buildStaticSystemContent` — as 8 seções, e o `override \|\| CONSTANTE` |
| `packages/ai/src/prompts/index.ts` | 82, 83, 91-102 | as 3 seções **não-sobrescrevíveis** (IDIOMA, SEDE, LEMBRETE FINAL) — a régua do teste de contradição |
| `packages/ai/src/chat/pipeline.ts` | 1476-1490 | `loadAgentConfig` — `select slug, content … .eq("is_active", true)` |
| *(off-hours, handoff, `agent_config`)* | — | ➡️ mapa completo na **Story 87-2** |
| `packages/web/src/app/dashboard/configuracoes/personalidade/page.tsx` | — | painel; server action `savePromptAction` grava direto em `agent_prompts` |
| `packages/web/src/app/api/admin/agent-prompts/[slug]/route.ts` | — | `PUT` admin-only, só altera `content` (não cria/deleta slug) |
| `packages/ai/src/chat/pipeline.ts` | 1756-1845 | `buildPropertyDataContext` — **o que já vem do cadastro** (a régua da decisão b e da AC11) |
| `scripts/seed-prompts.ts` | 24-88 | upsert dos 7 slugs + escrita em `agent_config.personality_prompt` — **AC12** |
| `packages/ai/src/prompts/index.test.ts` | 120-193 | testes de override da Story 53-1 — **não quebrar** |

### Detalhes que economizam tempo

- `loadAgentConfig` grava **todas** as linhas retornadas no objeto de overrides
  (`prompt_overrides[row.slug as keyof DbPromptOverrides]`, pipeline.ts:1489), mas
  `buildStaticSystemContent` só consome 5. É por isso que `handoff-summary` e `off-hours` são
  botões mortos: o dado chega e é ignorado. Não é bug de tipo em runtime — é falta de consumidor.
- Só há **uma org com conversas**: `00000000-0000-0000-0000-000000000001`. O snapshot **precisa**
  declarar a org no manifest — o projeto está indo para multi-tenant (Epic 86) e um snapshot sem
  org vira armadilha.
- Acesso a produção: **Supabase Management API com PAT** (projeto `dsopqkqjkmhytudaaolv`), runbook
  existente. `supabase db push` é **proibido** neste projeto (R-G do epic).
- **Sem migration prevista.** Se a Opção A exigir tabela/coluna de histórico, conferir o maior
  prefixo local **no momento de criar** (hoje **215**) e aplicar por Management API, arquivo
  inteiro num POST.
- **Prompt caching:** o bloco estático é cacheável (`cache_control: ephemeral`, min 1024 tokens).
  Mudar o conteúdo dos overrides invalida o cache **uma vez**; sem outro impacto. Se o texto
  reconciliado encolher muito, conferir que o bloco continua acima de `PROMPT_CACHE_MIN_TOKENS` —
  abaixo disso o `onWarning` dispara e o cache é pulado (index.ts:136-144).
- **O que `buildPropertyDataContext` NÃO injeta hoje** (levantado ao checar a decisão b, para a
  reconciliação não apagar um fato que o cadastro tem mas não entrega): `differentials` e
  `description` são **selecionados e tipados** (`pipeline.ts:219-221`) e **nunca usados** na
  montagem; `restrictions`, `leisure_floors` e `video_tour_url` existem na tabela
  (`supabase/migrations/002_property_schema.sql:64-68`) e **nem são selecionados**. Só remova do
  prompt o fato que o cadastro **realmente injeta** — o resto é a story de ampliação citada em
  "Fora de escopo".
- **Normalização do diff precisa ser declarada** e implementada no script: `\r\n` → `\n`,
  `trim()` final, e Unicode NFC. O `guardrails` difere hoje por **1 caractere** (emoji/acento) e
  está semanticamente em paridade — sem normalização declarada, essa diferença vira ruído
  permanente e treina todo mundo a ignorar o `--check`.

### O bug do `visit_availability` no handoff → **Story 87-2**

Levantado durante esta story e **verificado**: `formatBoolean` (`handoff.ts:160-164`) só devolve
"sim"/"nao" para booleano, e `visit_availability` é gravado como **string**
(`qualification.ts:298`) — logo o corretor lê **"nao informado" sempre**, mesmo com o campo
preenchido. É perda silenciosa de informação, não valor errado. Análise completa, a correção e a
exclusão deliberada do sibling (`detect-appointment.ts:71`, caminho de decisão) estão na
**87-2** (AC6 + Dev Notes).

### Testes

- Framework: **Vitest** (`npx vitest run`), não Jest.
- Os testes novos são de **conteúdo de prompt** (leem `_production/`), não de pipeline — não
  dependem do harness da W2-1 e podem rodar hoje.
- **Uma asserção "vermelho antes"** é obrigatória (AC6). O padrão de aceite do @architect no Epic
  87 é *"o teste que eu quero ver vermelho antes e verde depois"*.

---

## 📐 Corte aprovado — 05/08/2026 (Gabriel), no eixo proposto pelo @sm

A story foi partida em **três**, cortando pelo **que destrava a Onda 1** (proposta do @sm) e não
por dependência humana (proposta original do @po). A condição do @sm foi aceita: **87-1 e 87-2
criadas no mesmo dia, com número, dentro do epic** — não viraram backlog.

| story | conteúdo | destrava a Onda 1? |
|---|---|---|
| **87-0** (esta) | snapshot + normalizador + `--check` + reconciliação + teste de contradição + neutralizar o seed + **detector de config órfã** | **SIM — é o bloqueio inteiro** |
| **87-1** `87-1-governanca-painel-agent-prompts.story.md` | motivo obrigatório, histórico por trigger, migration (era a AC5-A) | não — previne apodrecer |
| **87-2** `87-2-campos-mortos-do-painel-passam-a-valer.story.md` | off-hours, moldura do handoff, `personality_prompt`, `greeting_message`, `guardrails`, bug do `visit_availability` (era a AC8) | não — é comportamento novo |

**Racional que sustentou o eixo:** a AC8 não toca em **nenhum** dos 5 overrides que mascaram o
system prompt — mantê-la dentro faria a Onda 1 esperar por uma *feature* (moldura de handoff é
build, não reconciliação). E o corte por dependência humana não funcionaria porque a
reconciliação **não pode** sair da 87-0: sem ela aplicada, a AC3 não fecha e nada destrava.

**Acoplamento que sobrou entre 87-0 e 87-2, de propósito:** a **AC13** (detector) nasce aqui com
as 5 superfícies órfãs como **exceções declaradas**; a **AC7 da 87-2** exige que essa lista
termine **vazia**. O instrumento é entregue no bloqueio, a limpeza acontece depois — e nenhuma
das duas stories pode fingir que a outra não existe.

---

## Riscos

| # | risco | sev | mitigação |
|---|---|---|---|
| **1** | Sobrescrever no banco conteúdo **melhor** que o do código (`property-presentation`: ESCASSEZ E EXCLUSIVIDADE, que o código não tem) | **Alta** | Reconciliação slug a slug com revisão humana (Tarefa 2 + AC4). Proibido rodar `seed-prompts.ts` cego → **AC12** |
| **2** | Alguém sobrescrever o `visit-scheduling` já corrigido em 05/08 (por `seed-prompts.ts`, por "restaurar o código" ou por save no painel sem contexto) | **Alta** | AC12 neutraliza o script; Dev Notes marca o slug como já reconciliado; AC6/AC7/AC11 valem para ele também e pegariam a regressão |
| **3** | A reconciliação **muda o comportamento da Nicole em produção** — não é refactor neutro | **Média** | Aplicação isolada, janela de observação de 24h, critério de rollback escrito abaixo (D7 do epic) |
| **4** | **Com o painel como fonte (D-87-0-a), a ausência de CI deixa de ser incômodo e vira o furo principal.** O git não é mais a rede; sem job de diff + histórico, a divergência volta no primeiro save | **Alta** (era Média) | A **Story 87-1** entrega motivo obrigatório + histórico por trigger (rede do lado do painel) — e por isso **precisa sair junto**, não depois. O job de diff é D5 e **precisa entrar no mesmo sprint** — ver "Nota de tensão". Se D5 for adiada, registrar como aceite consciente |
| **5** | Remover fato demais do `property-presentation` e a Nicole ficar sem informação que o cadastro **não** injeta (`differentials`, `description`, `restrictions`) | **Média** | AC11(ii) monta o prompt completo e afirma sobre o resultado; a lista do que não é injetado está nos Dev Notes; na dúvida, o fato fica |
| **6** | O texto reconciliado encolher o bloco estático abaixo do mínimo de cache | **Baixa** | Conferir `estimateTokens` do bloco estático no teste (index.test.ts já tem o padrão) |
| **7-9** | ➡️ **migrados para a 87-2** (texto do off-hours indo ao lead sem revisão · moldura do handoff virando porta para LLM · moldura quebrando o resumo do corretor) | — | Ver Riscos 1-3 da `87-2-campos-mortos-do-painel-passam-a-valer.story.md` |

### Critério de rollback (escrito **antes** do deploy — D7 do epic)

O snapshot da Tarefa 1 é o backup. Se, na janela de 24h, aparecer qualquer resposta da Nicole que
(a) volte a citar "stand"/endereço de obra como local de visita, (b) proponha dia/hora sem sondar
interesse, (c) contradiga a regra de entrada mínima de 20%, ou (d) **erre um fato de
empreendimento que antes acertava** — o modo de falha novo introduzido pela decisão (b), se o
cadastro não injetar algo que o prompt afirmava — **restaurar os `content` do snapshot anterior**
por Management API e reabrir a story. Responsável nomeado pela observação:
**a definir com o Gabriel** (Marcos ou Thielly, conforme D7).

---

## Fora de escopo

- **Corrigir o histórico invertido, o estado de agenda ou o `ai_summary`** — são W1-1, W1-2 e
  W1-3. Esta story não toca `pipeline.ts` além de, no máximo, parar de carregar
  `agent_config.personality_prompt` (**Story 87-2**).
- **Fiação da CI** (job de diff em PR) — é a story de **D5**, do @devops. Esta story entrega o
  script que a CI vai chamar.
- **Alerta/monitoramento contínuo de divergência** (`CONFIG_DEAD_KNOB`, job diário) — proposta P4
  do @analyst. Com a decisão D-87-0-a isto ganha peso; ainda assim é escopo do job de D5.
- **Ampliar o que a "tool empreendimentos" injeta.** `differentials` e `description` são
  selecionados e nunca usados; `restrictions`, `leisure_floors` e `video_tour_url` existem na
  tabela e nem são selecionados. Levantado ao verificar a decisão (b) e registrado aqui como
  **candidato a story própria** (`87-N`, executor @dev) — **não resolver nesta**. Consequência
  prática: nesta story, só sai do prompt o fato que o cadastro **comprovadamente injeta**.
- **Reescrever o conteúdo dos prompts para melhorar o comportamento da Nicole.** Esta story
  reconcilia o que existe nos dois lados e escolhe uma fonte. Melhoria de copy é outra conversa —
  e, com a fonte única no lugar, passa a ser uma conversa que funciona.
- **Mudar quem pode editar o painel** (RLS/roles da Story 53-2) — permanece admin-only, como está.
  O que muda é *como* se edita (motivo obrigatório + histórico) — e isso é a **Story 87-1**.

---

## Referências

- `docs/architecture/2026-08-05-validacao-epic-87.md` — **§6.0** (os 7 slugs medidos), **§6.1**
  (a prova causal do `visit-scheduling`), **§6.2** (os 4 guardrails anulados), **§6.3** (os 5
  itens que viraram as tarefas desta story), **§7 itens 1 e 10** (as condições de aceite)
- `docs/research/2026-08-05-nicole-anti-alucinacao/analise-tecnica.md` — **§1.7 N1/N1b** (a
  divergência e os botões mortos), **§P4** (drift de configuração), **limitação nº 5** (não se sabe
  quem editou o banco em 04/08)
- `docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md` — **R-D** (severidade Alta),
  **O-4**, **notas para o @sm** (AC dupla código + banco em toda story de prompt)
- Stories 53-1 e 53-2 — origem do mecanismo de override e do painel admin

---

**CodeRabbit Integration**: Disabled (sem chave `coderabbit_integration` em
`.aios-core/core-config.yaml`)

---

## Dev Agent Record

**Agente:** @dev (Dex) · **Modelo:** claude-opus-5 · **Data:** 2026-08-05
**Branch:** `story/87-0-paridade-agent-prompts` (a partir de `main`)
**Escopo desta passagem:** apenas a **parte mecânica** — Tarefa 1 (snapshot + `--check`) e
Tarefa 4 (teste de contradição), mais o teste de "config sem consumidor" que dá lastro à
Tarefa 5. **Nenhum conteúdo de prompt foi editado**, nem no banco nem no código: isso é a
Tarefa 2 e depende de decisão de produto. **Nenhuma escrita no banco de produção.**

### Entregue

- **Tarefa 1 / AC1 / AC2** — `scripts/dump-agent-prompts.ts` (`--write` / `--check`), snapshot
  dos **7 slugs** em `packages/ai/src/prompts/_production/` + `manifest.json` com procedência.
  Normalizador declarado (`\r\n`→`\n`, NFC, `trim`) em `packages/ai/src/prompts/snapshot.ts`,
  compartilhado entre script e testes.
- **Tarefa 4 / AC6 / AC7 (parcial)** — `packages/ai/src/prompts/contradiction.test.ts`, sobre o
  snapshot **e** sobre as constantes do código. **Vermelho hoje**, como exigido.
- **Lastro da Tarefa 5 / AC8** — `packages/ai/src/config-surfaces.test.ts`: enumera toda
  superfície de configuração editável e exige prova de consumo no runtime. **Vermelho hoje**,
  nomeando as 5 órfãs.
- `packages/ai/src/prompts/snapshot.test.ts` — integridade do snapshot commitado (sha × arquivo,
  7/7 ativos, normalização idempotente).

### Vermelhos esperados — como estão marcados e por quê

Os casos de dívida usam `it.fails` do Vitest, e não `skip`. Motivo: `skip` apodrece em silêncio
(foi assim que o `handoff-summary` ficou 4 meses morto); com `it.fails`, no dia em que a
reconciliação/Tarefa 5 fechar a dívida o marcador **passa a falhar** e obriga quem fechou a
removê-lo. A suíte fica verde no meio-tempo — `7 expected fail`.

Para ver o vermelho real, sem marcadores:
`AIOS_87_0_SEM_MARCADORES=1 npx vitest run packages/ai/src/prompts/contradiction.test.ts packages/ai/src/config-surfaces.test.ts`

### Divergências entre a story e o que foi medido no código

1. **`generateHandoffSummary` tem 2 parâmetros** (`collectedData`, `messages`), não os 3 que a
   leitura de `handoff.ts:115-158` sugere na Dev Note. Não muda a conclusão (o slug continua sem
   consumidor: não há por onde passar moldura).
2. **`char_count` do manifest é medido em UTF-16 (JS)**; o `char_length` do Postgres conta *code
   points*. Por isso `guardrails` aparece como 9.071 aqui e 9.070 na medição do @po — e o mesmo
   ±1/±2 em `handoff-summary` e `off-hours`. **Não é divergência de conteúdo**; está registrado no
   README do snapshot. Os slugs sem emoji batem exatamente com a tabela do @po.
3. **Os dois padrões extras da AC6** (`endere[çc]o d[oa]s? (empreendimento|obra)` e
   `no local da obra`), aplicados crus, **casam apenas frases NEGADAS** — inclusive a régua
   não-sobrescrevível (`index.ts:83` e `:96`) e o guardrail `"NUNCA passe o endereco da obra para
   visita"` (`property-presentation.ts:60`). Um teste assim mandaria apagar a própria correção.
   Resolvido por **regra de classe declarada** (contexto de negação neutraliza esses dois
   padrões), não por allowlist de frases — allowlist é onde este tipo de teste morre. **`stand`
   continua absoluto**, mesmo negado, como manda a AC7. Com a regra, a contagem bate exatamente
   com a do @po: **4 no snapshot** (guardrails 2, property-presentation 1, system-personality 1) e
   **2 no código** (`GUARDRAILS_PROMPT`).
4. **`agent_config.guardrails` é uma sexta superfície carregada e descartada** (`pipeline.ts:1495`),
   além das citadas na story. Sem tela hoje, mas gravável direto no banco. Entrou no registro.

### Fora do que foi entregue (de propósito)

Tarefa 2 (reconciliação), Tarefa 3 (AC5-A: motivo obrigatório + histórico + migration), Tarefa 5
(AC8-a/b/c/d), AC11 (regexes de fato de empreendimento + montagem com/sem overrides) e AC12
(neutralizar `seed-prompts.ts`). AC3 **não fecha** enquanto a Tarefa 2 não for aplicada.

### Validações

| o quê | resultado |
|---|---|
| `npx vitest run` | `1680 passed · 7 expected fail` |
| `npx vitest run` — 5 arquivos em falha | **pré-existentes em `main`**: `satori`/`sharp`/`pdf-lib` não instalados (marketing/arte-*, pastas/termo) |
| `packages/ai` `tsc --noEmit` | limpo |
| `packages/web` `eslint` | 0 erros (18 warnings pré-existentes, nenhum em arquivo desta story) |
| `npm run type-check` (turbo) | falha em `@trifold/shared` por `@types/node` ausente — **reproduzido em `main` com stash**, não é desta story |
| `dump-agent-prompts.ts --check` | exit **0** contra produção |

### File List

| arquivo | ação |
|---|---|
| `scripts/dump-agent-prompts.ts` | criado |
| `packages/ai/src/prompts/snapshot.ts` | criado (normalizador + leitor, fora do barrel `prompts/index.ts`) |
| `packages/ai/src/prompts/snapshot.test.ts` | criado |
| `packages/ai/src/prompts/contradiction.test.ts` | criado |
| `packages/ai/src/config-surfaces.test.ts` | criado |
| `packages/ai/src/prompts/_production/{7 slugs}.txt` | criado (dump de produção) |
| `packages/ai/src/prompts/_production/manifest.json` | criado |
| `packages/ai/src/prompts/_production/README.md` | criado |

---

## Definition of Done

- [x] Decisão do Gabriel registrada na story — **D-87-0-a** (painel é a fonte) e **D-87-0-b**
      (fato de empreendimento vem do cadastro), 05/08/2026
- [x] Destino dos 3 botões mortos decidido — **decisão (c)**: passam a valer, nada sai do painel;
      **decisão (d)**: handoff é moldura editável, valores do código, sem LLM
- [x] **Corte aprovado e executado** — `87-1-governanca-painel-agent-prompts.story.md` e
      `87-2-campos-mortos-do-painel-passam-a-valer.story.md` criadas em 05/08, com número
- [ ] AC1–AC4 verificadas com output colado
- [x] **AC5-A migrada para a 87-1** · AC5-B N/A · fallback declarado (o que sobrou) verificado
- [ ] AC6 e **AC11(i)** com os dois resultados (vermelho antes / verde depois) colados
- [ ] AC7 com os dois outputs do `grep` (antes e depois)
- [x] **AC8 migrada para a 87-2** (as 4 sub-ACs + as correções C5 do @po)
- [ ] AC9, AC10, **AC11(ii)(iii)**, **AC12**, **AC13** verificadas
- [ ] **Gate de copy cumprido** — todo texto aprovado pelo **Gabriel** antes do `UPDATE`
      (D-87-0-e); documento da AC4 registra nome e data
- [ ] **Regra de entrada sem valor em reais** conferida por grep (D-87-0-f)
- [ ] Documento de reconciliação assinado por produto **e** engenharia
- [ ] Critério de rollback exercitado ao menos em ensaio (restaurar 1 slug do snapshot e reverter)
- [ ] **Item de backlog de D5 criado**, nomeando o job `dump-agent-prompts --check` em CI (Nota de
      tensão) — a condição nº 10 do @architect fica rastreada fora desta story
- [ ] **Epic 87 atualizado pelo @pm:** `W2-4` sai da Onda 2 e vira `W0-0` bloqueante no roadmap
      (§9 do epic ainda descreve o item como "alerta de divergência" na Onda 2)
- [x] @po validou (`docs/qa/po-validation-87-0.md`, 05/08 — GO 8/10) · [ ] @qa deu gate ·
      [ ] @devops fez o push

---

## Change Log

| data | quem | o que |
|---|---|---|
| 2026-08-05 | @sm | Story criada a partir do item **W0-0** (§6.3 + §7 da validação do @architect). Bloqueada aguardando a decisão do Gabriel sobre a direção única (Tarefa 3). |
| 2026-08-05 | @sm | **Desbloqueada.** D-87-0-a: painel admin é a fonte (Opção A; AC5-A vale, AC5-B N/A). D-87-0-b: fato de empreendimento vem do cadastro → Tarefa 2 reescrita para `property-presentation` (**remover** fatos em vez de reconciliá-los) + **AC11**. Novo **AC12** (neutralizar `seed-prompts.ts`, agora destrutivo por definição). Dev Notes corrigido: o `visit-scheduling` foi **reescrito e reativado**, 7/7 slugs ativos — não existe mais slug inativo. Risco 4 elevado a **Alta** e registrada a **Nota de tensão** com a condição nº 10 do @architect (CI/D5). Registrada em "Fora de escopo" a story candidata de ampliação da injeção de cadastro. |
| 2026-08-05 | @po | **Validada — GO (8/10), Draft → Ready.** Relatório em `docs/qa/po-validation-87-0.md`. Correções aplicadas nas ACs a partir de medição no banco de produção (Management API, 05/08 21h), não de releitura: **AC4** path corrigido para `docs/architecture/adr/` (convenção do repo) + 3 fatos obrigatórios no documento (regra de 20% duplicada em 2 slugs, "80 mil" × `min_down_payment=68000` do Vind, `differentials=[]` nos dois → seções de diferenciais FICAM). **AC5-A** passa a cobrir os 3 caminhos de escrita (a server action `savePromptAction` é o caminho de produto e não estava na AC) e recomenda histórico por trigger + migration. **AC6/AC7** número e localização do "stand" corrigidos: são **4 ocorrências em `guardrails` (2), `property-presentation` (1) e `system-personality` (1)** — 0 no `visit-scheduling` — e editá-los vira exceção autorizada ao "Fora de escopo"; testes passam a rodar também sobre as constantes do código (o fallback). **AC8** ganha a 3ª superfície editável (`PATCH /api/agent-config`, allowlist linha 34) e resolve a colisão com a AC3 (proibido usar `is_active=false`). **AC11(i)** ganha o mapa real de hits (falso positivo em `visit-scheduling`; `pré-lançamento` e "N unidades" só existem no código) e **AC11(ii)** é corrigida: "Em comercializacao" aparece **2×** (Yarden e Vind são ambos `selling`), a montagem roda com e sem overrides, e ganha asserção **positiva** (entrega/tipologia/endereço continuam presentes) como mitigação real do Risco 5. **Tarefa 2** ganha o corte explícito (diferenciais ficam; "total de unidades" sai por política de escassez, não por injeção) e a regra de que exemplos com fato embutido também são alvo. DoD: backlog de D5 e atualização do Epic 87 (@pm) viram itens. |
| 2026-08-05 | @dev | **Parte mecânica implementada** (Tarefas 1 e 4 + lastro da 5) — ver Dev Agent Record. Entregues `scripts/dump-agent-prompts.ts` (`--write`/`--check`, só leitura no banco), o snapshot dos 7 slugs em `_production/` com manifest, o normalizador declarado, o teste de contradição (vermelho: 4 hits no snapshot, 2 no código) e o teste "nada de config sem consumidor" (vermelho: 5 órfãs). Dívidas marcadas com `it.fails` — suíte verde, marcador quebra quando a dívida fechar. **Nenhum conteúdo de prompt editado; nenhuma escrita em produção.** 4 divergências entre story e código registradas no Dev Agent Record — a principal: os 2 padrões extras da AC6, aplicados crus, casam só frases NEGADAS (inclusive a própria régua), resolvido por regra de classe declarada. |
| 2026-08-05 | @sm | **Corte executado** no eixo aprovado pelo Gabriel: **AC5-A → Story 87-1** (governança do painel) e **AC8 → Story 87-2** (campos mortos passam a valer, escopo ampliado para **5** superfícies órfãs com `greeting_message` e `guardrails`). As correções **C4** e **C5** do @po foram transportadas na íntegra para as stories de destino. Fica aqui o **detector** (**AC13**, já entregue pelo @dev em `packages/ai/src/config-surfaces.test.ts`), cujo fecho é a AC7 da 87-2. Aplicadas as decisões **D-87-0-e** (gate de copy: nada vai ao banco sem OK do Gabriel; @dev e @sm não decidem texto) e **D-87-0-f** (regra de entrada é **percentual, nunca valor em reais** — saem "80 mil" e afins; a AC4 passa a exigir **um dono declarado** para a regra, hoje duplicada em `qualification.ts:34-40` e `property-presentation.ts:47-56`, e um grep que prova 0 valores em reais nos overrides). Riscos 7-9 migrados; Risco 4 repontado para a 87-1. |
