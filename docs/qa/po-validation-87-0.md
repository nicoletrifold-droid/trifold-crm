---
validator: Pax (@po)
story: 87-0
story_title: "Os prompts que rodam em produção não são os do código (paridade + reconciliação de `agent_prompts`)"
epic: 87
roadmap_item: W0-0 (bloqueante — nada da Onda 1 sobe antes)
validation_date: 2026-08-05
checklist: po-master / story-draft (AIOS 10-point)
arch_ref: docs/architecture/2026-08-05-validacao-epic-87.md (§6.0–§6.3, §7 itens 1 e 10)
metodo: leitura do código real + consulta ao banco de produção `dsopqkqjkmhytudaaolv`
  (Management API, 05/08 ~21h) — nenhuma afirmação abaixo é reconstruída da story
verdict: GO (com ressalvas — 6 correções obrigatórias, todas já aplicadas na story pelo @po)
score: 8 / 10
implementation_readiness: 8
confidence: High (mecanismo) / Medium (conteúdo da reconciliação — depende de 2–3h de produto)
risk: HIGH (muda comportamento da Nicole em produção; sem CI como rede)
status_transition: Draft → Ready
---

# PO Validation Report — Story 87-0

## TL;DR

**GO, 8/10.** A story está entre as melhores que este projeto produziu: diagnóstico medido (não
inferido), decisões do Gabriel corretamente traduzidas em ACs, escopo defendido com uma seção
"Fora de escopo" que faz trabalho de verdade, e uma "Nota de tensão" que registra o furo em vez de
escondê-lo. O @sm acertou o difícil.

**O que ela errou é o fácil — e errou de um jeito específico: as ACs foram escritas contra a
medição do @architect de *antes* da correção do `visit-scheduling` de 05/08.** Fui ao banco
conferir cada número. Quatro ACs afirmam coisas que a produção de hoje não confirma:

| AC | O que a story diz | O que o banco diz (05/08, 21h) |
|---|---|---|
| AC6/AC7 | "as **5** ocorrências de stand" (implicando o `visit-scheduling`) | **4**, em `guardrails` (2), `property-presentation` (1) e `system-personality` (1). `visit-scheduling` = **0** |
| AC11(i) | o regex fica vermelho "porque o `property-presentation` casa vários" | casa também `guardrails` (2027) e `visit-scheduling` (03/08/2026 — **falso positivo**, é data de incidente). E `pré-lançamento`/"N unidades" **não existem no banco** — só no código |
| AC11(ii) | "Em comercializacao aparece **uma vez**" | **duas** — Yarden **e** Vind estão os dois com `status='selling'` |
| AC5-A(ii) | motivo obrigatório testado "na rota `PUT /api/admin/agent-prompts/[slug]`" | o painel **não usa essa rota**: grava pela server action `savePromptAction` |

Nenhuma delas é fatal, todas são fatais para o *"vermelho antes"* — que é o padrão de aceite do
@architect neste epic e a única coisa que separa esta story do quinto remendo. **Corrigi as seis
ACs diretamente no arquivo** (AC/escopo são autoridade do @po) e movi o status para `Ready`. O
@dev não precisa refazer essa medição: ela está na story, em tabela, com o slug de cada hit.

Respostas diretas aos 6 pontos do Gabriel na seção "Perguntas que a lead pediu para eu olhar".
A curta: **concordo com o corte do @sm** (política fica, fato sai, ESCASSEZ fica) e **não bloqueio
por causa da CI** — mas o encaminhamento de D5 virou item de backlog, porque parágrafo não é
mecanismo.

---

## 10-Point Checklist (AIOS Master)

| # | Critério | Status | Justificativa |
|---|---|---|---|
| 1 | Título claro e objetivo | **PASS** | "Os prompts que rodam em produção não são os do código" — o título é o achado. Subtítulo marca W0-0/bloqueante. |
| 2 | Descrição completa | **PASS** | Seção "Context — o que foi medido (não inferido)" com mecanismo (`index.ts:80-106`), consequência (o fork do `visit-scheduling`), tabela dos 7 slugs, a camada fantasma (`agent_config.personality_prompt`, 12.445 chars) e a cadeia causal do incidente da Sandra. Self-contained: dá para implementar sem abrir o doc do @architect. |
| 3 | AC testáveis | **CONCERN → corrigido** | 12 ACs, **todas** com "Verifica-se:" e comando exato — amostrei 5 (AC2, AC6, AC7, AC10, AC11) e rodei os comandos. O mecanismo é sólido; **os números e os alvos estavam errados** em 4 delas (tabela do TL;DR). Corrigido na story. |
| 4 | Escopo bem definido | **CONCERN → corrigido** | "Fora de escopo" tem 6 itens e todos são reais. **Mas o escopo se contradizia:** AC7 (banir "stand") exige editar `guardrails` e `system-personality`, e "Fora de escopo" proíbe "reescrever o conteúdo dos prompts". Declarei a exceção autorizada e delimitada (só a frase que cita stand). |
| 5 | Dependências mapeadas | **PASS** | Ordem do epic, D5/CI, W1-*, Stories 53-1/53-2, 75-64/75-65, 75-245/75-268. Dependência invertida (a story bloqueia, não é bloqueada) está explícita. |
| 6 | Estimativa de complexidade | **CONCERN** | Não há tamanho declarado para a story. Só existe a estimativa do @architect para a Tarefa 2 (2–3h). Com 12 ACs, 5 tarefas, script novo, testes novos, migration provável e uma sessão de produto, isto é no mínimo **M/L** — e o @dev merece saber antes de começar. Não bloqueia; anotado. |
| 7 | Valor de negócio | **PASS** | Explícito e verdadeiro: "corrigi o prompt" volta a significar "o comportamento mudou". Sem ela, as ACs de prompt das ~20 stories seguintes são inverificáveis (O-4 do @architect). |
| 8 | Riscos documentados | **PASS** | 6 riscos com severidade e mitigação, critério de rollback escrito **antes** do deploy (D7), e a Nota de tensão sobre D5 — que é o risco que a maioria das stories esconderia. Risco 4 corretamente elevado para Alta. |
| 9 | Definition of Done clara | **PASS** | 11 itens, com exigência de output colado para as ACs de medição e ensaio de rollback. Acrescentei 2 (backlog de D5, atualização do epic). |
| 10 | Alinhamento com PRD/Epic | **CONCERN** | O conteúdo bate 100% com §6.0–§6.3 e §7 do @architect. **Mas o epic não foi atualizado:** `docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md:329` ainda descreve o item como **W2-4, Onda 2, "com alerta de divergência"** — exatamente o desenho que o @architect reprovou ("alerta pressupõe que uma das duas versões é a certa"). Quem ler o epic vai sequenciar errado. Tarefa do @pm, virou item de DoD. |

**Score: 8/10** (3 CONCERN, 7 PASS)

---

## Perguntas que a lead pediu para eu olhar

### 1. As ACs são verificáveis de verdade? (amostrei 5)

**AC2 (`--check` detecta divergência)** — desenho correto: exige provar o vermelho mexendo 1
caractere e revertendo. É a única AC que testa o próprio instrumento de medição. Nada a corrigir.

**AC7 (`grep` de stand)** — rodei os dois comandos contra um diretório de teste com
`stand de vendas` + `standard quality`:
```
grep -riwEc "stands?" dir/   →  guardrails.txt:1   off-hours.txt:0
grep -riwE  "stands?" dir/   →  guardrails.txt:no stand de vendas
```
O `-w` faz o que a AC promete (não casa "standard") e o `-c` imprime `:0` por arquivo. **O comando
está certo; o número esperado estava errado** — são 4 hits, não 5, e nenhum no `visit-scheduling`.
Corrigido, com a tabela de onde cada um está.

**AC10 (regressão)** — `npx vitest run` (o `test` do root é `vitest run`), `npm run type-check` e
`npm run lint` existem e `packages/ai/src/**/*.test.ts` está no `include` do `vitest.config.ts`.
Verificado. A parte da conversa real em produção é a única verificação manual da story e está
corretamente exigida com horário + telefone.

**AC6 (teste de contradição)** — bom desenho, **mas cego para o fallback**: lia só
`_production/*.txt`. Como o código virou o bootstrap declarado (AC5-A iv) e `guardrails.ts:23`
manda dizer *"O memorial completo fica disponivel la no stand de vendas!"*, o fallback embarcaria
a frase banida e a AC9 (que testa justamente o caminho do fallback) a injetaria. Estendi a AC para
rodar sobre as constantes também.

**AC5-A (motivo + histórico)** — a única AC que estava apontando para o lugar errado. Ver ponto 4
abaixo.

### 2. A AC11 realmente prova que as três versões viraram uma?

**A via existe e é a certa — mas, como estava escrita, não fecharia.** Três defeitos, todos
medidos:

1. **`Pré-lançamento` tem 0 hits no banco.** A string vive na constante do código
   (`property-presentation.ts:26`). Se o teste roda só contra `_production/`, esse padrão **nunca
   fica vermelho** — a AC provaria a ausência de algo que já estava ausente.
2. **"Em comercializacao aparece uma vez" é falso.** Yarden **e** Vind Residence estão os dois com
   `status='selling'` no cadastro, e `buildPropertyDataContext` percorre todas as properties
   ativas: aparece **2×**. A asserção literal falha no primeiro run e o @dev vai "consertar" o
   teste em vez do prompt.
3. **Faltava a metade positiva.** A AC afirmava só ausências. Ausência prova que apagamos, não que
   substituímos — que é exatamente o Risco 5 da própria story.

**Com as três correções, sim, é suficiente** — e passa a ser a AC mais forte da story:
montar com overrides (vermelho de hoje = "Recém lançado") **e** sem overrides (vermelho de hoje =
"Pré-lançamento Jul/2026"), afirmar sobre o bloco do Yarden, e afirmar **positivamente** que
entrega ("segundo semestre de 2029", de `delivery_date=2029-06-30`), tipologias (`83.66m2` /
`79.81m2`) e endereço continuam presentes via cadastro. Aplicado.

Sobre "regex sozinho não prova": o @sm está certo, e a medição confirma o instinto dele. O regex
de ano fica vermelho em `visit-scheduling` por causa de *"aconteceu com dois clientes em
03/08/2026"* — data de incidente, não fato de empreendimento. Regex vê string; só a montagem vê
contradição.

### 3. O corte "o que sai × o que fica" está correto do ponto de vista de produto?

**Concordo com o corte, nos três pontos que ele decidiu.** E ele acertou pelo motivo certo, não
por sorte:

- **"Não vendemos sem entrada" (20%) fica.** O cadastro injeta apenas o booleano
  `requires_down_payment` → *"IMPORTANTE: Exige entrada para compra"*. O número, a conduta ("use
  aproximações, nunca o valor exato") e a saída empática não têm campo no cadastro e não são fato
  de empreendimento — são política da Trifold. Além disso é **o guardrail que a produção perdeu**;
  tirá-lo do prompt seria consumar o incidente em vez de corrigi-lo.
- **`ESCASSEZ E EXCLUSIVIDADE` fica.** Confirmei no código a razão que o @sm citou:
  `pipeline.ts` diz, no comentário do bloco de estoque, *"A copy fica a cargo do prompt
  (PROPERTY_PRESENTATION_PROMPT, secao ESCASSEZ E EXCLUSIVIDADE)"*, e a linha de lançamento injeta
  literalmente *"enquadre como oportunidade de entrar cedo…"*. Remover a seção deixaria o cadastro
  delegando a redação para um lugar vazio. Fica, e fica por dependência explícita.
- **Estágio/entrega/metragem/estoque saem.** Todos verificados como injetados hoje.

**Onde eu acrescento (não discordo — completo):**

1. **A regra de 20% está escrita DUAS vezes no código** — `qualification.ts:34-40` e
   `property-presentation.ts:47-56`, com o mesmo exemplo dos "80 mil". Reconciliar sem nomear
   **um** slug dono é recriar a divergência: foi justamente o `qualification-flow` do banco que
   perdeu a regra enquanto a cópia do `property-presentation` sobreviveu. Virou item obrigatório
   da AC4.
2. **"entrada em torno de 80 mil" é uma quarta versão do mesmo fato.** O cadastro do Vind tem
   `commercial_rules.min_down_payment = 68000`; o Yarden não tem o campo. Nada disso é injetado
   (só o booleano). Pela regra da story o número **fica** no prompt — mas fica declarado como fato
   sem dono no cadastro, com data de revisão. É exatamente a classe "três versões do mesmo fato"
   que a story descreve, e ela não tinha visto essa.
3. **A regra precisa valer para EXEMPLOS, não só para seções declarativas.** O incidente da Sandra
   nasceu de uma **frase-molde de exemplo** que a Nicole disse literalmente. Em ESCASSEZ há
   *"o Vind é bem concorrido, boa parte das unidades já foi"* — um exemplo que embute estado de
   estoque por empreendimento. Nenhum regex da AC11 pega isso. Anotado na Tarefa 2 como trabalho
   de leitura humana.

### 4. A restrição "só sai o fato que o cadastro comprovadamente injeta" está aplicada?

**Sim — e é a melhor decisão de engenharia de requisito da story.** Confirmei os dois lados:
`differentials` e `description` são selecionados (`pipeline.ts:1514-1520`), tipados
(`pipeline.ts:219-221`) e **nunca usados** na montagem; `restrictions`, `leisure_floors` e
`video_tour_url` nem entram no `select`.

**Mas fui além do código, e o cadastro reforça a restrição de um jeito que a story não sabia:**
`differentials` está **`[]` (vazio) nos dois empreendimentos**. Ou seja, mesmo que a story de
ampliação passasse a injetá-lo, hoje não há o que injetar — rooftop com sport bar, sacada com
churrasqueira, 2 vagas, andares altos existem **só no prompt**. Se a Tarefa 2 apagar o bloco
inteiro do empreendimento em nome do "fato sai", a Nicole fica sem argumento de venda. Explicitei
na Tarefa 2: **Diferenciais, Quando apresentar e Argumento-chave FICAM.**

Um ajuste de precisão que também apliquei: **"total de unidades" sai por outro motivo**. O cadastro
tem `total_units`, mas `buildPropertyDataContext` **deliberadamente não imprime número cru em fase
de lançamento** (Stories 75-64/75-65). A remoção é correta, só que por política de escassez, não
por injeção — sem isso escrito, a regra "só sai o que o cadastro injeta" parece violada e alguém
vai reabrir a discussão no meio da sessão de reconciliação.

### 5. A "Nota de tensão" sobre a D5 (CI) deveria bloquear a story?

**Não. Bloquear seria inverter a dependência** — a story que destrava o epic ficaria esperando a
story que depende dela para ter o que checar. O `--check` que a CI vai chamar é entregue **aqui**;
o que falta é o `.github/workflows/` (hoje `.github/` tem 11 arquivos de agente e zero workflows).

**Mas o encaminhamento, como estava, não era um mecanismo — era um parágrafo bem escrito.** Duas
condições para eu aceitar:

1. **Item de backlog criado** (fiz: `docs/backlog.md`, `[CI] Job de diff de agent_prompts`, P1,
   com esta story como origem). Um compromisso de "mesma sprint" que só existe dentro da story que
   está sendo fechada não sobrevive à sprint seguinte.
2. **Rede interina de custo zero:** enquanto a CI não existir, o `--check` roda no gate do @qa em
   toda story do Epic 87 que toque prompt — o epic já exige AC dupla código+banco. Divergência
   encontrada no gate é achado bloqueante da story em curso.

Com isso a condição nº 10 do @architect fica **aberta e rastreada**, que é diferente de aberta e
esquecida. Registrei também na story.

### 6. A story inchou?

**Não.** As 5 tarefas mapeiam 1:1 nas 12 ACs, sem tarefa órfã e sem AC sem tarefa. Os candidatos a
outra story estão todos em "Fora de escopo" e nenhum vazou: ampliação da injeção de cadastro
(`differentials`/`description`/`restrictions`), fiação da CI (D5), alerta/monitoramento contínuo,
correções da Onda 1, melhoria de copy, RLS/roles. O C1 do bolsão não aparece em lugar nenhum da
story — correto, não tem relação.

O único vazamento real era **inverso** e eu o formalizei: a AC7 já **exigia** editar `guardrails` e
`system-personality`, o que "Fora de escopo" proibia. Escopo declarado agora bate com escopo
exigido.

---

## Estado real de produção — medido nesta validação (05/08, ~21h)

Consultado via Management API no projeto `dsopqkqjkmhytudaaolv`. É a linha de base do @dev:

| slug | ativo | chars | `updated_at` | "stand" | ano 20XX | metragem | recém-lanç |
|---|---|---|---|---|---|---|---|
| `guardrails` | ✔ | 9.070 | 16/07 | **2** | 2027 | — | — |
| `visit-scheduling` | ✔ | **5.105** | **05/08 20:58** | 0 | 2026 (falso positivo) | — | — |
| `system-personality` | ✔ | 2.478 | 18/06 | **1** | — | — | — |
| `property-presentation` | ✔ | 3.952 | 26/06 | **1** | 2025, 2027, 2029 | ✔ | ✔ |
| `qualification-flow` | ✔ | 2.458 | 10/07 | 0 | — | — | — |
| `handoff-summary` | ✔ | 1.942 | 13/06 | 0 | — | — | — |
| `off-hours` | ✔ | 327 | 18/06 | 0 | — | — | — |

Confirmações relevantes:

- **7/7 ativos** — a Dev Note está certa, não existe slug inativo.
- **`visit-scheduling` = 5.105 chars, exatamente o tamanho do código**, `updated_at` 05/08 20:58 e
  0 ocorrências de "stand". A correção de hoje está de pé e é o modelo dos outros.
- **`property-presentation` tem `\r\n`** (o hit de stand veio como `"...visita ao stand\r\n"`) —
  a exigência de normalização CRLF/NFC nos Dev Notes não é teórica.
- **Cadastro:** Yarden `selling`, entrega 2029-06-30, 60 unidades, 19 andares, 2 tipologias
  (83.66m² / 79.81m²), `requires_down_payment: true`, `differentials: []`. Vind `selling`, entrega
  2027-06-30, 48 unidades, 15 andares, 1 tipologia (66.91m²), `min_down_payment: 68000`,
  `differentials: []`. Os dois com `concept` e `description` preenchidos.

---

## Correções obrigatórias — todas já aplicadas na story pelo @po

| # | AC/seção | O que mudou | Por quê |
|---|---|---|---|
| C1 | AC6 / AC7 | Número e localização reais do "stand" (4 hits, 3 slugs, tabela); editar `guardrails` e `system-personality` declarado **dentro do escopo**, limitado à frase que cita stand; testes passam a cobrir também as constantes do código | O "vermelho antes" não fecharia, e o @dev bateria de frente com "Fora de escopo" |
| C2 | AC11(i) | Mapa medido de hits por slug; `visit-scheduling` (03/08/2026) declarado falso positivo com motivo escrito; `guardrails` (2027) declarado alvo legítimo; registrado que `pré-lançamento` e "N unidades" só existem no código | Sem isso, a AC força editar slugs marcados como intocáveis — ou vira allowlist sem critério |
| C3 | AC11(ii) | "uma vez" → afirmar sobre o bloco do Yarden (são 2 `selling`); montagem roda **com e sem** overrides; asserção **positiva** de entrega/tipologia/endereço | Era a AC que prova a tese da story e ela falharia por aritmética; a asserção positiva é a mitigação real do Risco 5 |
| C4 | AC5-A | Motivo + histórico valem para os **3 caminhos de escrita** (server action `savePromptAction` — o caminho de produto —, `PUT /api/admin/agent-prompts/[slug]`, `seed-prompts.ts`); histórico recomendado por **trigger** (agnóstico ao caminho, cobre UPDATE por Management API); migration passa a ser esperada | A AC protegia a rota que o painel **não** usa. O `visit-scheduling` foi editado por fora das duas rotas, em 04/08 e 05/08 |
| C5 | AC8 | Inclui a 3ª superfície editável (`PATCH /api/agent-config`, allowlist em `route.ts:34`); proíbe implementar "sai do painel" via `is_active=false` | O campo é gravável por API sem efeito nenhum; e `is_active=false` colidiria com a AC3 (7 ativos) e reintroduziria o mecanismo "desativa que o código assume" que a D-87-0-a proíbe |
| C6 | AC4 / Tarefa 2 | Path corrigido para `docs/architecture/adr/adr-008-…` (o repo não tem `docs/decisions/`; ADRs vivem em `docs/architecture/adr/`, hoje até a 007) e placeholder `2026-08-XX` resolvido; 3 fatos obrigatórios no documento (20% duplicado, "80 mil" × `min_down_payment`, `differentials: []`); regra dos exemplos com fato embutido | AC com placeholder não é verificável; e o documento é o entregável de maior ROI do epic |

Fora das ACs: 2 itens de DoD (backlog de D5, atualização do epic pelo @pm) e 1 item de backlog
criado (`[CI] Job de diff de agent_prompts`).

---

## Should-fix (não bloqueiam)

1. **Tamanho da story não declarado.** Recomendo classificar como **L** e considerar partir em
   87-0a (snapshot + script + testes + AC12 — @dev, sem dependência humana) e 87-0b (reconciliação
   + AC5-A + AC8 — depende de sessão com produto). O bloqueio do epic é resolvido pelo 87-0a
   parcialmente: sem a reconciliação aplicada, a AC3 não fecha. Decisão do Gabriel; a story está
   implementável inteira.
2. **`\r\n` no `property-presentation`** — confirma a exigência de normalização; vale o @dev
   começar pelo normalizador, senão o primeiro `--check` mente.
3. **`buildPropertyDataContext` não injeta `description`** (que está preenchido nos dois) — mais
   um candidato para a story de ampliação já registrada em "Fora de escopo".
4. **"Você trabalha com 2 empreendimentos"** no `property-presentation` é uma contagem que envelhece
   com o cadastro. Na reconciliação, trocar por formulação sem número.

---

## Anti-alucinação — o que conferi contra a fonte

| Afirmação da story | Verificado? |
|---|---|
| `buildStaticSystemContent` monta 8 seções, 5 sobrescrevíveis, 3 imunes (`index.ts:82,83,91-102`) | ✔ código |
| `loadAgentConfig` filtra `is_active=true` e grava **todos** os slugs retornados (`pipeline.ts:1476-1490`) | ✔ código |
| `agent_config.personality_prompt` carregado e nunca usado | ✔ código — 4 ocorrências em `pipeline.ts` (184, 1457, 1465, 1494), nenhuma no `buildSystemPrompt` |
| `buildPropertyDataContext` injeta status/endereço/concept/entrega/estoque/andares/tipologias/lazer/`requires_down_payment`/FAQ | ✔ código (`pipeline.ts:1756-1845`) |
| `differentials` e `description` selecionados e nunca usados; `restrictions`/`leisure_floors`/`video_tour_url` nem selecionados | ✔ código — e `differentials` está **vazio** no cadastro |
| `seed-prompts.ts` faz upsert dos 7 slugs + escreve `agent_config.personality_prompt` | ✔ código (é destrutivo mesmo — AC12 procede) |
| Testes de override da 53-1 em `index.test.ts:120-193` | ✔ existem, cobrem override/null/vazio/parcial/seções imunes — a AC9 corretamente manda **completar**, não reescrever |
| 7 linhas, todas ativas, org `…0001` | ✔ banco |
| Estado do `visit-scheduling` (reescrito e reativado) | ✔ banco |
| "5 ocorrências de stand" | ✘ **4**, e em outros slugs — corrigido |
| "Em comercializacao aparece uma vez" | ✘ **2** properties `selling` — corrigido |
| Painel grava pelo `PUT` da API admin | ✘ grava por **server action** — corrigido |
| `docs/decisions/` como local do documento | ✘ não existe; convenção é `docs/architecture/adr/` — corrigido |
| Epic descreve o item como W0-0 bloqueante | ✘ epic ainda diz **W2-4, Onda 2, "alerta de divergência"** — item de DoD para o @pm |

---

## Veredito

**GO — 8/10. Status movido de `Draft` para `Ready`.**

Implementation readiness **8/10**; confiança **alta** no mecanismo (script, snapshot, testes,
neutralização do seed) e **média** no conteúdo da reconciliação, que depende de 2–3h de produto e
é, por natureza, julgamento humano — a story faz o máximo que um documento pode fazer para
proteger esse julgamento.

**O que o @dev precisa saber antes da primeira linha:**

1. **Comece pelo snapshot e pelo normalizador** (`\r\n` → `\n`, `trim`, NFC). O `guardrails`
   difere por 1 caractere e o `property-presentation` tem CRLF: sem normalização declarada, o
   `--check` nasce mentindo e ninguém confia nele depois.
2. **Não toque no `visit-scheduling`.** Ele é o modelo, não o alvo. Se um teste seu ficar vermelho
   nele (o ano 03/08/2026 vai), a resposta é exceção declarada **com motivo na linha**, não edição.
3. **Você VAI editar `guardrails` e `system-personality`** — só as frases com "stand", nada além.
   Isso está autorizado no escopo agora; não é você excedendo a story.
4. **Motivo obrigatório e histórico precisam pegar a server action**, não só a rota admin. Se for
   de trigger, é migration (conferir o prefixo no momento; hoje 215).
5. **A AC11(ii) roda duas vezes** — com e sem overrides. É o único jeito de a "Pré-lançamento
   Jul/2026" do código ficar vermelha.
6. **Não rode `scripts/seed-prompts.ts`.** Neutralizá-lo é a AC12, e rodá-lo hoje apagaria o
   `visit-scheduling` corrigido às 20:58 de 05/08.

— Pax, equilibrando prioridades 🎯
