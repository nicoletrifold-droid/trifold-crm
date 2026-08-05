# Story 75-276 — Aproveitamento: faixa "Agendou/fez visita" substitui "Fechados"

**Epic:** 75 (CRM Trifold) · **Status:** Done (aguardando push) · **Estimativa:** S (~3 pts)

**CodeRabbit Integration:** Disabled (`coderabbit_integration` ausente do `core-config.yaml`) —
revisão manual no gate do @qa.

---

## Story

Como **gestor lendo o Aproveitamento por Origem/Corretor**, quero a faixa verde mostrando
**quem chegou à visita** em vez de "Fechados" — porque Fechados é 0% em toda linha e a faixa
não informa nada, enquanto visita é o desfecho que eu de fato cobro de origem e de corretor.

---

## Context

Pedido do Marcos em 05/08 (com print da tela `/dashboard/analytics?range=7d`): *"queria trocar
onde tem o fechados para outra coisa; o Visitou/Visita Agendada pode colocar os 2 juntos na soma"*.

Os dois cards (`Aproveitamento por Origem` e `Aproveitamento por Corretor`) são barras 100%
empilhadas com quatro faixas mutuamente exclusivas — **Fechados · Em atendimento · Perdidos ·
Não-lead/Cliente** —, montadas por `classifyOutcome` em cascata.

### Por que Fechados é espaço morto

Só a etapa **Fechamento** (`slug=fechou`, casada pelo regex `/fechamento|ganho|fechado/i` na rota)
conta como fechado. Medido em prod (05/08): **zero** leads fechados nos últimos 7 dias e nos
últimos 30. A faixa ocupa lugar na legenda e nunca pinta.

### 🔥 A armadilha: "somar as 2 etapas" é a pior das três formas de contar

A leitura literal do pedido é somar quem está **hoje** nas etapas Visita Agendada + Visitou. Medido
em prod, leads criados na janela:

| Como contar | 7 dias (de 133) | 30 dias (de 466) |
|---|---|---|
| **a)** está **hoje** na etapa Visita Agendada/Visitou | 3 (2,3%) | 14 (3,0%) |
| **b)** **já passou** por essas etapas (`activities.type='stage_change'`) | 5 (3,8%) | 32 (6,9%) |
| **c)** tem registro em `appointments` | 5 (3,8%) | 30 (6,4%) |

"Etapa atual" é foto, não histórico: quem visitou e avançou para Proposta sai da conta, e quem
visitou e foi perdido sai da conta. Em 30 dias a opção (a) **descarta mais da metade do sinal** —
num card chamado *Aproveitamento*, isso faz a origem parecer pior do que foi.

**Decisão: a faixa sai de `appointments` (opção c).** Razões, em ordem:
1. (b) e (c) chegam quase no mesmo número (32 vs 30 em 30d), o que valida as duas — mas (c) lê a
   tabela onde a visita realmente mora, enquanto (b) depende do log de `stage_change`, que já
   quebrou antes por outro motivo (mig 125) e falha em silêncio quando o move é feito por helper
   direto (ex.: `advanceToVisitaAgendada`) em vez de pela UI.
2. É a mesma fonte do card **Visitas**, logo abaixo na mesma tela — os dois números passam a bater
   em vez de divergirem e alguém ter que descobrir por quê depois.
3. Deixa a porta aberta para separar "agendou" de "compareceu" sem migração (`appointments.status`).

### Decisão do Marcos: perdido manda

Lead que fez a visita e **depois** foi perdido conta em **Perdidos**, não no verde. Consequência
aceita explicitamente: o verde é "está vivo **E** chegou à visita", e fica um pouco menor que os 30
de 30d. Em troca, **a barra vermelha continua significando exatamente o que significa hoje** — a
mudança só reparte o azul. Trocar isso mudaria de sentido um número que o Marcos já lê todo dia.

### Fora de escopo (verificado, não é omissão)

- **PDF/relatório semanal:** `outcomeBySource`/`outcomeByBroker` **não** entram no
  `analytics-report-data.ts` — são só de tela. A convenção "relatório segue a tela"
  ([[feedback-relatorio-segue-tela]]) não gera trabalho aqui. Conferido por grep.
- **Etapas Visita Agendada / Visitou** continuam existindo e valendo no Kanban. Esta story não
  mexe em etapa nenhuma.

---

## Acceptance Criteria

- [x] **AC1** — nos dois cards, a faixa verde é rotulada **"Agendou/fez visita"**; "Fechados"
      não aparece mais na legenda nem na barra.
- [x] **AC2** — o verde conta lead com **≥1 registro em `appointments`**, não etapa atual: lead que
      visitou e já avançou para Proposta/Negociando/Fechamento **continua** no verde.
- [x] **AC3** — lead com `lost_reason` preenchido fica em **Perdidos** mesmo tendo visita
      registrada (perdido manda). A contagem de Perdidos é **idêntica** à de antes da mudança.
      ⚠️ A cascata sozinha **não** garante isso: hoje `fechado` vem antes de `perdido`, então um
      lead em etapa Fechamento **com** `lost_reason` sairia de Fechados e entraria em Perdidos.
      A garantia vem de medição, não de lógica — **0 leads** nessa condição na base inteira
      (prod, 05/08, sem filtro de data). Se algum dia existir, o certo é ele ir para Perdidos.
- [x] **AC9** — lead **inativo sem motivo** (a faixa cinza "Não-lead/Cliente") que **tem** visita
      registrada conta no **verde** — `visita` vem antes de `outro` na cascata. Medido em prod: **0**
      em 7d, 30d e 90d, então a faixa cinza não muda de tamanho hoje (21 em 30d, 42 em 90d, todos
      sem visita). Está aqui como decisão explícita para o dev não ter que escolher no escuro.
- [x] **AC4** — a barra continua fechando 100%: para toda linha,
      `visitas + ativos + perdidos + outros === total`.
- [x] **AC5** — em range de **90 dias** (>1000 leads) nenhum lead perde a visita por corte do
      PostgREST — a busca de `appointments` por lead é paginada/loteada como o resto da rota.
- [x] **AC6** — o `appointments` consultado respeita os mesmos recortes da rota:
      `org_id` e `team='house'` (agenda IMOB fora do analytics principal, Epic 81/75-98).
- [x] **AC7** — a faixa cinza "Não-lead/Cliente" segue aparecendo **só** quando existe (o
      `hasInativos` atual), e o tooltip segue mostrando contagem absoluta + % correta.
- [x] **AC8** — teste cobre a cascata nova: lead com visita **e** `lost_reason` → perdido; lead
      com visita e ativo → visita; lead ativo sem visita → ativo.

---

## Tasks / Subtasks

A ordem importa: a troca de tipo em `executive.ts` **quebra o build** dos dois consumidores até
serem ajustados. Fazer nessa sequência mantém o type-check como guia em vez de ruído.

- [x] **T1** (AC1-AC4, AC9) — `lib/analytics/executive.ts`: `Outcome` (`"fechado"`→`"visita"`),
      `OutcomeRow.fechados`→`.visitas`, `OutcomeLead` ganha `id`, cascata nova, assinatura de
      `buildOutcomeRows` recebendo `visitLeadIds: Set<string>`.
- [x] **T2** (AC8, AC3, AC9) — `executive.test.ts`: casos da cascata (visita+perdido → perdido;
      visita+ativo → visita; ativo sem visita → ativo; inativo sem motivo **com** visita → visita)
      e a asserção de soma = total. Escrever **antes** do T3 — é o teste que prova a cascata sem
      depender da rota.
- [x] **T3** (AC2, AC5, AC6) — `api/analytics/executive/route.ts`: `id` no `LeadRow` e nas duas
      strings de coluna; remover o bloco `fechadoStageIds`; busca loteada de `appointments`
      (`lead_id`, `org_id`, `team='house'`) montando o `Set`.
- [x] **T4** (AC1, AC7) — `components/analytics/executive-charts.tsx`: rótulo, chave de cor e tipo
      da paleta.
- [x] **T5** — verificação: type-check + lint + suíte; e conferir na tela com **range de 90 dias**
      (não só 7d) que nenhuma barra deixa de fechar 100%.

---

## Dev Notes

### Cascata nova em `classifyOutcome`

```
perdido (lost_reason)  →  visita (tem appointment)  →  ativo (is_active)  →  outro
```

Hoje a cascata começa por `fechado` (etapa) e só depois `perdido`. O `fechado` **sai inteiro**:
lead fechado tem visita registrada e cai naturalmente no verde ("chegou à visita ou além"). Fechado
sem visita nenhuma cairia em `ativo` — caso de borda irrelevante (zero em 30d), não vale ramo.

`Outcome`: `"fechado"` → `"visita"`. `OutcomeRow.fechados` → `.visitas`. `OutcomeLead` ganha `id`
(a classificação passa a precisar do id do lead para cruzar com o conjunto de visitas). Assinatura
proposta: `buildOutcomeRows(rows, visitLeadIds: Set<string>, keyOf, labelOf)` — o
`fechadoStageIds: Set<string>` sai dos dois call sites.

### Na rota (`api/analytics/executive/route.ts`)

- `LeadRow` ganha `id: string`; as duas strings de coluna do `fetchLeads` (linhas 95-96) ganham
  `id`. Manter as duas idênticas — o comentário da 75-269 pede recorte/filtros/ordem iguais.
- O bloco `fechadoStageIds` (regex sobre `kanban_stages.name`) **sai** — é usado só por esses dois
  call sites. Se `stagesData` ou `stage_id` ficarem sem uso, **deixe o type-check dizer**; não
  remova por leitura.
- Nova busca: `appointments` → `select("lead_id")`, `eq(org_id)`, `eq(team,'house')`,
  `in("lead_id", chunk)` — **em lotes**, porque a lista de leads passa de 1000 em 90 dias e o
  `.in()` grande também estoura a URL. Reaproveitar o padrão de `fetch-all-leads.ts` /
  `LEADS_PAGE_SIZE` em vez de inventar constante (⚠️ [[feedback-consultar-fonte-nao-duplicar-constante]]).
  Não dá para filtrar `appointments` por data: a visita pode ser marcada muito depois da entrada do
  lead — o filtro é **por lead**, não por período.

### No componente (`components/analytics/executive-charts.tsx`)

`OUTCOME_SEGMENTS[0]` vira `{ key: "visitas", label: "Agendou/fez visita" }`; o `colorOf` troca a
chave mas **mantém o verde** (`#16a34a` nos dois temas). A chave `p.outcome.fechado` pode ser
renomeada para `visita` sem medo: **conferido** — ela só existe neste arquivo (tipo na linha 36,
valores em 50 e 63, uso em 355), nenhum outro card consome. Ordem das faixas inalterada: verde
primeiro.

### ⚠️ OBS para o Marcos — achado colateral, NÃO faz parte desta story

A etapa chamada **"Atendimento"** tem `slug = no-show` no banco (`kanban_stages`, position 4), e
**27 leads** criados nos últimos 7 dias estão nela. Ou a etapa foi renomeada e reaproveitada como
passo geral de atendimento, ou existe gente sendo marcada como no-show sem ser. Qualquer métrica
que leia no-show **por slug** está lendo esses 27 como falta de comparecimento. Fica registrado
aqui para virar story própria se o Marcos confirmar que é problema.

### 🔄 Desvio do plano (T3): conjunto inteiro paginado, não lotes de `lead_id`

O plano pedia `.in("lead_id", lote)`. **Medi antes de implementar:** a tabela `appointments` tem
**59 linhas no total** (55 `team='house'`, 43 leads distintos). Lote de uuid resolveria um problema
que não existe e ainda traria um risco novo — `.in()` com 300 uuid dá ~12KB de URL, acima do limite
usual de linha de header. Fiz o oposto: **uma** busca do conjunto inteiro, paginada pelo
`fetchAllLeads` já existente (AC5 atendido por paginação real, não por lote), e o cruzamento sai em
memória. Comentário no código marca o gatilho para revisitar: ordem de 20k linhas.

Ganho de bônus: a query `kanban_stages` **saiu inteira** do `Promise.all` — era usada só pelo
`fechadoStageIds`. Uma ida ao banco menos por carregamento da tela, e `stage_id` saiu do select.

**Decisão nova, registrada aqui porque ninguém havia perguntado:** a busca de visitas **não** filtra
por `property_id`, mesmo com filtro de empreendimento ativo. A pergunta é "este lead chegou à
visita?", e o recorte de empreendimento já foi aplicado na lista de leads — um lead interessado no
Vind que visitou o Yarden chegou à visita do mesmo jeito. Filtrar subtrairia visita legítima.

### ✅ Validação com dado REAL de prod (90d, 1.663 leads, funções reais via `tsx`)

| Origem | total | verde | ativo | perdido | outro | fecha 100%? |
|---|---|---|---|---|---|---|
| meta_ads | 885 | 8 (0,9%) | 278 | 597 | 2 | ✓ |
| other | 428 | 7 (1,6%) | 192 | 229 | 0 | ✓ |
| whatsapp_click_to_ad | 129 | 5 (3,9%) | 52 | 68 | 4 | ✓ |
| broker_sponsored | 87 | 4 (4,6%) | 51 | 32 | 0 | ✓ |
| whatsapp_organic | 57 | 0 | 5 | 25 | 27 | ✓ |
| website | 37 | 1 (2,7%) | 7 | 25 | 4 | ✓ |
| walk_in | 30 | 3 (10,0%) | 7 | 17 | 3 | ✓ |
| referral | 10 | 0 | 3 | 5 | 2 | ✓ |

- **AC4** — 0 linhas fora de 100%.
- **AC3** — Perdidos: régua antiga **998** = régua nova **998**. Idêntico, como prometido.
- **AC9** — não-lead/cliente com visita: **0**, como medido antes.
- **🔥 Para os olhos do Marcos (OBS-001):** dos **42** leads desse recorte que chegaram à visita,
  **28 estão no verde e 14 foram perdidos depois de visitar** — ou seja, **um terço** das visitas
  vira Perdido. É exatamente a consequência da decisão "perdido manda", agora com número. A decisão
  segue válida (o vermelho não muda de sentido), mas se 33% for mais do que ele imaginava, inverter é
  trocar duas linhas na cascata.

### File List
| Arquivo | Mudança |
|---|---|
| `lib/analytics/executive.ts` | `Outcome`/`OutcomeRow`/`classifyOutcome`/`buildOutcomeRows` + doc da cascata |
| `lib/analytics/executive.test.ts` | 3 casos novos (AC2/AC9/AC4) + cascata reescrita (AC8) |
| `app/api/analytics/executive/route.ts` | `id` no LeadRow/select; saem `fechadoStageIds` **e** a query `kanban_stages`; entra busca paginada de `appointments` |
| `components/analytics/executive-charts.tsx` | rótulo da faixa, chave de cor e tipo da paleta |

## QA Results

Gate: **PASS** — `docs/qa/gates/75.276-analytics-faixa-visita-substitui-fechados.yml`

**QA-001 (medium) — CORRIGIDO no gate.** A busca paginada de `appointments` ordenava por
`lead_id`, que **não é único**: medido em prod, 8 leads têm 2+ visitas e um tem 5. O
`fetchAllLeads` pagina com `.range()`, e ordem com empate não é determinística entre páginas —
linha pulada ou repetida. O efeito seria um lead COM visita classificado como "em atendimento":
número silenciosamente errado na tela, a classe de defeito que este projeto já pagou caro.
Estava **dormente** (59 linhas, nunca pagina) e acordaria sozinho com o crescimento, sem
ninguém tocar no código. Corrigido para `.order("id")` (a PK), com comentário do porquê.

**QA-002 (low) — ACEITO.** O AC5 pedia lote por `lead_id`; o @dev entregou conjunto inteiro
paginado. Desvio medido e documentado; o que o AC protege (nenhum lead perde visita por corte do
PostgREST) está atendido por paginação real.

**Conferido que NÃO quebrou:** RLS de `appointments` é org-scoped (a query sem filtro de data
não amplia exposição para nenhum dos 4 perfis) · o card de topo de Fechamento/conversão tem o
próprio `fechadoStageIds` e segue intacto — a noção de "fechou" não sai da tela · PDF não
consome esses cards · `stagesData`/`stage_id` ficaram sem consumidor, confirmado por type-check.

1.738 testes verdes, type-check do `web` limpo, lint 0 erros.

**Para os olhos do Marcos:** OBS-001 (14 de 42 visitas viraram Perdido — um terço) e o render
da legenda, que ganhou rótulo mais largo.

## Change Log
| Data | Mudança |
|---|---|
| 2026-08-05 | Story criada do pedido do Marcos. Medição em prod trocou a implementação (etapa → `appointments`); decisão "perdido manda" tomada por ele |
| 2026-08-05 | @po validou: **GO**, 9/10. Draft → **Ready**. Dois furos fechados com medição em prod (AC3 ganhou a ressalva de `fechado`+`lost_reason`; **AC9 novo** para o cinza com visita, que a cascata decidia sem ninguém ter escolhido). Somadas Tasks/Subtasks (a troca de tipo quebra o build dos consumidores — a ordem é o que mantém o type-check útil) e confirmada a contenção da chave de paleta |
| 2026-08-05 | @dev implementou na branch `feat/75-276-analytics-faixa-visita`. Desvio no T3 (conjunto paginado em vez de lotes de `lead_id`) medido e justificado; `kanban_stages` saiu do Promise.all. 1.738 testes verdes, type-check do `web` limpo, lint 0 erros. Validado com prod real (90d): Perdidos idêntico (998=998), 0 barras fora de 100%. **OBS-001 para o Marcos: 14 de 42 visitas viraram Perdido.** Ready → InReview |
| 2026-08-05 | @qa gate **PASS**. QA-001 (ordem de paginação por coluna não-única) achado e corrigido; QA-002 aceito. InReview → Done, aguardando push do @devops |
