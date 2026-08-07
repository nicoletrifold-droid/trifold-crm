---
epic: 87
title: Nicole — Confiabilidade de Contexto, Estado e Enforcement (fim da alucinação)
status: Draft
created_at: 2026-08-05
updated_at: 2026-08-07
created_by: Morgan (@pm)
priority: P0 (incidente ativo em produção)
origem:
  - Dossiê de incidente de 05/08/2026, levantado contra código real + banco de produção (`dsopqkqjkmhytudaaolv`)
  - 4 incidentes reportados por Gabriel: Sandra, Sueli, Valnira, Orlice
objetivo_negocio:
  - Cada alucinação da Nicole queima um lead pago de Meta Ads. O custo não é "erro de bot", é CAC jogado fora + dano de marca no primeiro contato.
  - A Nicole está em produção atendendo AGORA. O epic existe para parar de sangrar sem trocar um problema conhecido por um desconhecido.
  - Mudar o regime: sair de "corrigir o sintoma no prompt/regex" para "corrigir o substrato (contexto e estado) e provar por teste".
depends_on:
  - Stories 75-245 (Done), 75-268 (mergeada 04/08, AC7 aberto), 75-270 (mergeada 04/08, AC7 aberto) — este epic NÃO refaz o que elas já corrigiram.
  - `system_events` (packages/web/src/lib/logger.ts) como canal de medição em produção.
  - Acesso à Supabase Management API para remediação de dados e migrations (runbook existente).
related:
  - packages/ai/src/chat/pipeline.ts (1843 linhas — `processMessage`, montagem de contexto, estado de agenda, guardas)
  - packages/ai/src/memory/loader.ts · packages/ai/src/memory/writer.ts (MemPalace — código vivo, banco morto)
  - packages/ai/src/flows/lead-memory.ts (`updateLeadMemory` — gerador do `ai_summary`)
  - packages/ai/src/flows/visit-slot.ts (lógica determinística de agenda, pronta para virar tool)
  - packages/ai/src/flows/qualification.ts (`extractCollectedData`)
  - packages/ai/src/prompts/guardrails.ts (RN1–RN14 — texto, sem enforcement)
  - packages/web/src/lib/ai/send-library-media.ts (`resolveSendableMedia`)
  - packages/web/src/app/api/webhook/whatsapp/route.ts (orquestração do turno, `is_ai_active`)
  - supabase/migrations/012_lead_memory_system.sql (registrada como aplicada, sem efeito no banco)
revisado_por:
  - docs/architecture/2026-08-05-validacao-epic-87.md (@architect, 05/08 — validação adversarial; criou o W0-0)
  - docs/architecture/2026-08-07-debate-tool-use-nicole.md (@architect, 07/08 — §8 lista G-1..G-5, as incoerências deste arquivo)
  - docs/qa/po-validation-epic-88.md (@po, 06/08 — §2 lista as 9 edições obrigatórias aqui)
epic_irmao:
  - 88 (docs/stories/epics/epic-88-nicole-tool-use-agenda.md) — absorve o antigo W4-1
stories_planned:
  - item: W0-0
    story: docs/stories/87-0-paridade-reconciliacao-agent-prompts.story.md
    status: Ready
  - item: '— (derivado do W0-0, cortado em 05/08: era a AC5-A)'
    story: docs/stories/87-1-governanca-painel-agent-prompts.story.md
    status: Draft
  - item: '— (derivado do W0-0, cortado em 05/08: era a AC8)'
    story: docs/stories/87-2-campos-mortos-do-painel-passam-a-valer.story.md
    status: Draft
stories_added: []
stories_done: []
---

# Epic 87 — Nicole: Confiabilidade de Contexto, Estado e Enforcement

> **Nota de numeração.** O maior epic existente é o **86** (usado duas vezes: `epic-86-meta-capi-tracking.md`
> em `main` e `epic-86-saas-multi-tenant.md` no branch `docs/epic-86-saas-multi-tenant`). Este epic assume
> **87**. Stories sugeridas como `87-N` (padrão do Epic 86); a decisão final de ID é do @sm.
> **Atualização 07/08:** o **Epic 88** (`epic-88-nicole-tool-use-agenda.md`) nasceu em 06/08 e é o
> epic irmão deste — absorveu o antigo `W4-1`.

---

## 1. O problema, com evidência

A Nicole não está "inventando" no sentido usual. **Ela está respondendo com precisão a um
contexto errado**, e gravando o resultado como se fosse fato. Há um loop de contaminação
fechado, medido em produção:

```
histórico errado (CR-1)  →  Nicole responde ao passado
      ↓
resumo grava a fala dela como fato (CR-3)
      ↓
estado de agenda persiste a frase dela como disponibilidade do lead (CR-4)
      ↓
próxima sessão abre com o fato falso, agora com mais confiança
      ↑
guarda anti-alucinação é cega justamente aqui e nunca bloqueia (CR-5)
```

### Os 4 sintomas relatados (05/08/2026)

| # | Lead | Sintoma | Causa raiz | Situação |
|---|------|---------|-----------|----------|
| 1 | Sandra | Devolveu ao lead o teto que ele mesmo declarou ("seu orçamento de R$ 400 mil") e abriu a conversa com "Sábado, dia 8, está anotado" sem nada agendado | CR-1 + CR-3 + CR-4 | **Vivo** |
| 2 | Sueli | Afirmou que sexta 14h não é horário comercial (é: seg–sex 8h–18h) | CR-1 + gate de agendamento | Correção mergeada 04/08 (75-268), **validação em prod aberta** |
| 3 | Sueli + Valnira | Confirmou visitas que nunca entraram na agenda | 75-268 | Correção mergeada 04/08, **validação em prod aberta** |
| 4 | Orlice | Mandou planta do Vind falando de Yarden | 75-270 + CR-6 | Mídia mergeada 04/08; **a troca de empreendimento por conta própria (CR-6) continua sem guarda** |

> **Nota de 07/08 — esta tabela é o que o Gabriel relatou, não o universo do defeito.** A auditoria
> do @po (06/08, banco de produção) varreu **8 semanas** em vez de 14 dias e encontrou mais quatro
> casos da classe "a Nicole afirmou visita sem lastro": **Célia (28/06), Helena (23/06), Miriam
> (07/07)** e o mismatch do **Ailton (30/07)**. A **Silvana** sai da lista — ela pediu **ligação**,
> não visita, e a ligação aconteceu. Placar auditado: **6 de 7**. A Célia é o caso mais grave e o
> mais antigo: confirmada em 28/06, **zero appointments até hoje**, cinco semanas sem que ninguém
> percebesse. Isso não enfraquece o diagnóstico abaixo — desloca parte do peso de "o sistema erra"
> para **"nada no sistema compara o que a Nicole diz com o que o banco tem"**. Ver W2-2 e a §3.

Dos quatro, **dois já têm código em `main`** (commits `e2757d91` e `442c296a`, 04/08) e pendem
apenas de validação com lead real. Os que continuam vivos e sem tratamento são os de
**contexto e estado** — exatamente os que este epic ataca.

### Causas raiz (todas verificadas contra código + banco de produção)

**CR-1 — O histórico da conversa está invertido.**
`pipeline.ts:1430` (`loadConversationHistory`) faz `.order("created_at", { ascending: true }).limit(20)`:
pega as **20 primeiras** mensagens, não as 20 últimas. Em conversa longa, a Nicole enxerga o
início do relacionamento e é **cega para o presente**. Introduzido em `7194d9b2` (31/03/2026) —
**nunca funcionou**. Alcance medido: 19 de 324 conversas dos últimos 30 dias passam de 20
mensagens (5,9%) — e são precisamente os leads que reengajam, os de maior valor.
Confirmado no arquivo hoje (05/08), linha por linha.
*A Sandra disse "só posso até 400 mil" em 27/07; a Nicole devolveu isso hoje porque, para ela, 27/07 é o presente.*

**CR-2 — MemPalace: código vivo, banco morto, há ~4 meses.**
`lead_facts`, `lead_memories` e a RPC `match_lead_memory` **não existem** em nenhum schema de
produção, apesar da migration `012_lead_memory_system` constar como aplicada em
`supabase_migrations.schema_migrations` com os statements íntegros. Nenhum `DROP` nas migrations;
`pgvector` instalado. Auditoria de paridade código↔banco: das 110 tabelas referenciadas no
código, faltam só `lead_facts`, `lead_memories` e a view `meta_campaign_roas` — o problema é
**isolado, não sistêmico**. Ninguém percebeu porque **toda falha é silenciosa por design**
(`loader.ts:62,114` → `if (error || !facts) return ""`; escritas em try/catch com `console.error`).

**CR-3 — O `ai_summary` virou amplificador da alucinação.**
Com L1/L2/L3 sempre vazios, o caminho ativo é `ai_summary` + histórico invertido.
`updateLeadMemory` (`flows/lead-memory.ts`, Haiku, a cada 5 mensagens) recebe `assistantMessage`
— a fala da Nicole, alucinações incluídas — e é instruída a *"incorporar informação nova"*, com
**zero verificação contra a fonte da verdade** (`appointments`). Confirmado no código hoje: o
prompt não tem uma única regra sobre não gravar compromisso. O `ai_summary` da Sandra em produção
diz literalmente *"Sandra agendou visita para sábado, dia 8"* — ela nunca agendou nada.
217 de 1673 leads (13%) têm `ai_summary`.

**CR-4 — Estado de agenda que ressuscita entre sessões.**
`conversation_state.collected_data` da Sandra, em produção:
`{"visit_availability": "sábado, dia 8, de 8h às 12h", "visit_pending_date": "2026-08-08"}`.
Frase de expediente da **própria Nicole**, capturada por `extractCollectedData(assistantMessage, …)`
e persistida como disponibilidade do lead. Como `hasPendingSlot` liga o modo agendamento sozinho
(`pipeline.ts:651,97`), a **primeiríssima** resposta de hoje foi "Sábado, dia 8, está anotado" —
para um lead form que só dizia "tenho interesse". A guarda `isAmbiguousSlotText` (75-245) protege o
`visit_availability`, **não** o `visit_pending_date` já derivado dele numa sessão anterior. **E nada expira.**

**CR-5 — A guarda anti-alucinação é cega no pior caso e fail-open.**
`detectSlotMismatch` (`pipeline.ts:109`) retorna `null` quando `authorizedSlotUtc` é `null` — ou seja,
**quando o sistema não autorizou nada**, que é exatamente o cenário do agendamento fantasma.
Além disso só emite `NICOLE_SLOT_MISMATCH` e deixa a mensagem passar. Confirmação em produção:
**zero eventos em 7 dias**, apesar dos incidentes. Zero aqui não é sucesso: é cegueira.

**CR-6 — Troca de empreendimento por conta própria.**
A Orlice pediu Vind; a Nicole emendou *"Temos o Yarden Residence, que é nosso lançamento mais
recente…"* e o `resolveSendableMedia` seguiu obedientemente. A 75-270 corrigiu a **mídia**
(que agora segue a fala); **nada impede a fala** de introduzir outro produto que o lead não pediu.

### Por que os remendos anteriores não seguraram — a leitura estratégica

Quatro stories atacaram este mesmo tema (75-157, 75-245, 75-268, 75-270) e o problema reincidiu
em dias. Não foi falta de rigor: as três últimas têm incidente medido em prod, AC testáveis e
gate de QA. Reincidiram por **três razões estruturais**:

1. **Corrigiram o sintoma, não o substrato.** Todas atuaram em parser, regex ou prompt. Nenhuma
   tocou a montagem do contexto. Enquanto o histórico está invertido e o resumo grava alucinação
   como fato, **toda camada acima está resolvendo bem um problema mal colocado**.
2. **Não existe harness de integração do `processMessage`.** O @qa registrou na 75-268 que essa é a
   **4ª recaída da área a pedir isso**: `pipeline.test.ts` só testa helpers puros; o INSERT em
   `appointments` e as mutações de `collected_data` **não têm cobertura automatizada**. Cada fix é
   provado até o slot e validado no cliente real.
3. **Guardrail em prompt não é enforcement.** RN8 ("NÃO invente informações") existe desde sempre e
   não impediu nenhum dos incidentes. Pior: os prompts de produção vêm de `agent_prompts` no
   **banco**, que mascara o código — um guardrail pode estar anulado agora mesmo sem ninguém saber.

**A tese deste epic:** enquanto o substrato mentir, cada fix novo compra semanas. Corrigido o
substrato e construída a rede de segurança, os fixes anteriores passam a funcionar como foram
desenhados.

---

## 2. Objetivo mensurável

**Objetivo:** eliminar as afirmações não-fundamentadas da Nicole — sobre agenda, sobre orçamento
do lead e sobre empreendimento — garantindo que ela responda ao **presente da conversa daquele
lead**, e que qualquer afirmação sem lastro no sistema seja **detectada e barrada**, não apenas logada.

**Invariante inegociável (R4):** o contexto de uma resposta usa exclusivamente dados **daquele
lead**. A auditoria de 05/08 não encontrou nenhum caminho de vazamento cross-lead — hoje isso é
verdade **por construção, sem nada que a proteja de regressão**. Este epic transforma isso em
**invariante testado**.

---

## 3. Critérios de sucesso (medíveis em produção)

Todas as métricas usam `system_events`, `appointments`, `conversation_state` e `leads` — fontes
que já existem. **Baseline obrigatório antes do primeiro deploy** (item W0-3).

| # | Métrica | Como medir | Alvo |
|---|---------|-----------|------|
| **M1** | Confirmação sem agenda | Conversas em que a Nicole afirma dia+hora e **não** existe `appointment` com `created_by='nicole'` em ±30 min **e** `created_at ≤ fala + 2 min` | **0** em 14 dias corridos |
| **M2** | Agendamento gravado à mão | `appointments` com `created_by in ('broker','admin')` criados **depois** de a Nicole ter dito "confirmado" na conversa | **0** (baseline conhecido: 2 em 04/08 — Sueli e Valnira) |
| **M3** | Contexto do presente | Nenhuma resposta montada com histórico do início da conversa: evento novo `NICOLE_HISTORY_TRUNCATED` deve reportar sempre a **cauda**; teste de regressão fixa a ordem | **0** ocorrências de cauda errada |
| **M4** | Estado fantasma | `conversation_state` com `visit_pending_date` sem `appointment` correspondente e sem mensagem do **lead** contendo aquele dia | **0** (baseline a medir; Sandra é um caso confirmado) |
| **M5** | Resumo contaminado | `leads.ai_summary` afirmando agendamento sem `appointment` correspondente | **0** dos 217 resumos existentes |
| **M6** | Guarda com denominador | `NICOLE_SLOT_MISMATCH` deixa de ser zero-por-cegueira: passa a disparar também sem slot autorizado; taxa de **falso positivo** medida em shadow mode | FP **< 5%** antes de ligar bloqueio |
| **M7** | Orçamento devolvido | Respostas contendo o teto declarado pelo lead (detectado pelo validador) | **0** após W3-2 |
| **M8** | Empreendimento não pedido | Respostas que introduzem empreendimento ausente do pedido do lead e do contexto | **0** após W3-2 |
| **M9** | Isolamento cross-lead | Suíte de invariantes: todo carregador de contexto filtra por `conversation_id`/`lead_id`; 0 telefones com 2 leads; 0 conversas órfãs | **verde sempre**, falha bloqueia merge |
| **M10** | ~~Sem regressão de negócio~~ | **Renomeada. Uma régua só: ver `Epic 88 · PM8`** (`appointments created_by='nicole'`/semana + visitas criadas à mão logo após conversa da Nicole), declarada **não conclusiva** por n≈1/semana | ver PM8 |

**A intenção da M10 continua valendo, e o instrumento mudou de dono.** Uma Nicole que nunca
alucina porque virou muda não resolve o problema de negócio — cada onda precisa provar que não
estancou a hemorragia matando o paciente. Mas M10 e a PM8 do Epic 88 **eram a mesma métrica com
dois nomes**, ambas com o mesmo defeito (`created_by='nicole'` = 6 no total do projeto, ~1/semana:
nenhuma regressão de até ~70% seria detectável em 14 dias — @architect §1.1, ressalva 3).
**A régua única é a PM8**, com o proxy de volume que o @architect exigiu (condição 8): taxa de
resposta do lead ao turno seguinte e `HANDOFF_TRIGGERED`/conversa. Toda métrica com n<10/semana
entra no runbook marcada como **não conclusiva**.

> **Baseline de lastro declarado (medido, não estimado):** **31%** — 5 de 16 falas que afirmam
> visita marcada entre 10/06 e 06/08 tinham `appointment` do pipeline no momento da fala
> (@po, `po-validation-epic-88.md` §5.1; ratificado pelo @architect em `2026-08-07-debate…` §2.4).
> **A definição é parte do baseline:** contar "existe appointment" sem `created_by`/janela faz o
> número saltar para **81%** — porque conta a visita que um **humano criou horas depois** para
> consertar. Sueli, Valnira e Maria Oliveira, que são os incidentes, apareceriam como sucesso.
> Qualquer métrica de lastro deste epic herda essa definição.

---

## 4. Escopo

**IN:**
- Montagem de contexto do turno: histórico, memória, resumo, estado de agenda (`pipeline.ts`, `memory/loader.ts`, `flows/lead-memory.ts`, `flows/qualification.ts`).
- Instrumentação das falhas silenciosas (memória, histórico, fallback de resumo) em `system_events`.
- Remediação de dados em produção: estado de agenda fantasma e resumos contaminados.
- Harness de integração do `processMessage` + suíte de reencenação dos incidentes reais.
- Camada de validação pós-resposta (enforcement) com regras: dia/hora não autorizado, teto de orçamento devolvido, empreendimento não pedido, mídia prometida e não enviada.
- Paridade `agent_prompts` (banco) × prompts do código.
- Invariante de isolamento cross-lead como teste.
- ~~Grounding incremental via tools, começando pela agenda~~ → **migrou para o Epic 88** (era o
  `W4-1`). Continuam **neste** epic as tools de **dados do empreendimento** (W4-2) e de **mídia**
  (W4-3), que passam a depender da infraestrutura construída lá.
- Correção da documentação/memória de projeto que afirma que o MemPalace está em produção.

**FORA DE ESCOPO (decidido, não é esquecimento):**
- **Reescrever a Nicole** ou trocar de modelo/arquitetura multi-agente. O `pipeline.ts` continua sendo `processMessage`; a evolução é incremental.
- **Reviver o MemPalace nas Ondas 0–3.** Aplicar a migration `012` liga ~4 meses de código nunca exercitado contra leads reais. Fica para a Onda 4, atrás da decisão **D2**.
- **Mudanças de personalidade, tom ou copy** que não sejam guardrail com enforcement.
- **Roleta/distribuição, notificação de corretor, Epic 86 (CAPI)** — raio de impacto próprio.
- **Refazer 75-268 e 75-270.** Já estão em `main`; este epic apenas **fecha a validação em prod** delas (W1-5).
- **Carimbar `broker_id` em appointments** (fora de escopo desde a 75-245) e **slot por corretor** — permanecem fora.
- **Cobrança/otimização de custo do modelo.** Só entra como restrição (**D6, parte de custo** — a
  parte de latência foi revogada em favor do `Epic 88 · D88-3`), não como objetivo.

---

## 5. Riscos do epic

| # | Risco | Sev | Mitigação |
|---|-------|-----|-----------|
| **R-A** | Corrigir CR-1 muda o que a Nicole vê em 5,9% das conversas — **as de maior valor**. Prompts e guardas foram calibrados num mundo onde ela via o começo da conversa. O comportamento pode mudar de formas não previstas (para melhor, mas não previstas) | **Alta** | Deploy **isolado**, janela de observação de 24h, amostragem manual de 10 conversas longas antes/depois, métricas M1 / `Epic 88 · PM8` |
| **R-B** | Purge de `collected_data` e de `ai_summary` é **escrita destrutiva em produção** | **Alta** | Backup das colunas antes; script idempotente; lista revisada por humano antes de executar; @data-engineer executa, com aval (D8) |
| **R-C** | Enforcement fail-closed pode silenciar a Nicole ou responder genérico — troca alucinação por frustração | **Alta** | Shadow mode obrigatório com FP medido (M6) antes de ligar bloqueio; ligar regra a regra, nunca em bloco |
| **R-D** | `agent_prompts` no **banco** mascara o prompt do código. Todo guardrail pode estar anulado em produção agora mesmo | **Alta** | **W0-0** (paridade + reconciliação, Onda 0, BLOQUEANTE — story 87-0) é pré-requisito de qualquer guardrail novo valer alguma coisa. Reconciliado em prod em 05/08 20:58; **sem o job de diff em CI (D5) apodrece de novo** |
| **R-E** | Tool use aumenta latência e custo por turno; o webhook do WhatsApp tem orçamento de tempo | **Média** | Medir p95 antes; teto declarado em **`Epic 88 · D88-3`** (o D6 deste epic foi revogado — ver §8); tool atrás de flag, e o escopo migrou para o Epic 88 |
| **R-F** | **Não existe CI** (`.github/workflows` não existe). "Invariante testado em CI" hoje significa "teste que alguém lembra de rodar" | **Média** | Decisão D5; até lá, gate manual do @qa com a suíte completa é obrigatório em toda story deste epic |
| **R-G** | Migrations: maior prefixo local é **215**, e o registro em produção está ~52 versões atrasado; `db push` é proibido | **Média** | Aplicar via Management API, arquivo inteiro num POST (runbook `docs/runbooks/aplicar-209-210.md`); conferir o maior prefixo no momento de criar |
| **R-H** | `pipeline.ts` tem 1843 linhas e uma função que faz tudo — raio de impacto amplo, sem harness | **Alta** | Nenhuma mudança estrutural (Ondas 3 e 4) antes do harness (W2-1). Regra de corte da Onda 1: **nenhum caminho de decisão novo** |
| **R-I** | Leads já contaminados (Sandra e outros) continuam recebendo respostas erradas até a remediação, e alguns acreditam ter visita marcada | **Alta** | W1-2a pode rodar **hoje, por SQL, sem deploy**; comunicação ativa com os leads afetados é decisão **D8** |
| **R-J** | Corrigir o substrato pode fazer guardas existentes (75-245/268/270) dispararem em cenários novos | **Média** | Suíte de reencenação (W2-2) roda os incidentes reais **auditados** a cada mudança — são 7, não 5 (ver W2-2) |

---

## 6. A tensão: estancar rápido × fazer certo — posição recomendada

Os dois lados são reais. A Nicole está alucinando com leads pagos **neste momento**; e a evidência
do próprio projeto diz que pressa nessa área produz remendo que reincide em 72 horas.

**Posição recomendada — corte por natureza da mudança, não por urgência:**

1. **Vai rápido o que remove mentira sem adicionar comportamento.** CR-1, CR-3 e CR-4 são fixes de
   *substrato*: cada um apaga uma fonte de informação falsa. Nenhum deles ensina a Nicole a fazer
   algo novo. O risco é contido e mensurável, e o custo de esperar é certo.
2. **Regra de corte da Onda 1:** nenhuma story pode adicionar um **novo caminho de decisão** da
   Nicole. Se um fix precisa de comportamento novo, ele é Onda 3 ou 4, por definição.
3. **Nada estrutural antes da rede.** Enforcement (Onda 3) e tools (Onda 4, e o Epic 88) só depois
   do harness. Essa é a única linha do epic que não se negocia por urgência — é a que quebra o ciclo
   de reincidência. **O que se negocia é o que conta como rede**, e isso está escrito na regra de
   corte da Onda 2 (§7): o harness de efeito colateral já veio na 75-279, o de entrada do modelo é o
   item 88-2. Princípio intacto, aplicação verificável.
4. **Um fix de substrato por deploy**, com janela de observação. Se algo piorar, precisamos saber
   **qual** foi. Isso custa 2–3 dias a mais e vale cada hora.
5. **A remediação de dados não espera deploy.** O purge do estado fantasma e a lista de resumos
   contaminados são SQL; podem sair hoje, sob D8.
6. **Não pausar a Nicole** (ver D1): a pausa tem custo certo sobre 100% dos leads para conter um
   dano que hoje é probabilístico e cujos piores gatilhos podem ser desarmados por dados em horas.

---

## 7. Roadmap por ondas

Legenda de esforço: **XS** ≈ 1h · **S** ≈ 2–4h · **M** ≈ 1 dia · **L** ≈ 2–3 dias · **XL** ≈ 1 semana+.
Risco = risco de **regressão em produção**.

### Onda 0 — Verdade e visibilidade (mesmo dia · não muda comportamento)

> Objetivo: parar de operar às cegas e ter o "antes" antes de mexer.

| ID | Título | Resolve | Esforço | Risco | Depende de | Executor |
|----|--------|---------|---------|-------|-----------|----------|
| **W0-0** 🔒 | **Paridade e reconciliação de `agent_prompts` (banco) × prompts do código** — snapshot versionado, reconciliação humana única, direção única depois disso, teste de contradição sede×stand | **R-D** — hoje qualquer guardrail pode estar anulado em produção | S/M | **Baixo** | — | @dev + @devops + produto |
| **W0-1** | Corrigir a documentação que afirma MemPalace em produção | **CR-2** (a crença errada que sustentou 4 meses de cegueira) | XS | **Nenhum** | — | @pm / @po |
| **W0-2** | Instrumentar as falhas silenciosas em `system_events` | **CR-2, CR-3** — torna auditável o que hoje é `return ""` | S | **Baixo** (só log) | — | @dev |
| **W0-3** | Baseline de métricas M1–M5 em produção + runbook de medição | Todas — sem baseline não há prova de melhora | XS | **Nenhum** | W0-2 | @qa + @data-engineer |
| **W0-4** | Kill switch global da Nicole (flag lido no webhook antes de `processMessage`) | Válvula de segurança operacional; habilita **D1** de verdade | S | **Baixo** | — | @dev + @devops |

**W0-0 🔒 BLOQUEANTE — item criado pelo @architect na validação de 05/08 (§6.3), era o `W2-4` da
Onda 2.** Foi promovido porque o próprio epic o descrevia como *"pré-requisito de qualquer
guardrail novo valer alguma coisa"* e mesmo assim o agendava depois de uma onda inteira de mudança
de comportamento — contradição interna. Não é teórica: **5 dos 7 slugs de `agent_prompts`
divergiam do código em produção**, e um deles (`visit-scheduling`) é causa mecânica direta do
incidente da Sandra. Condição de aceite nº 1 do @architect: **nada da Onda 1 sobe antes dele.**

> **Story:** `docs/stories/87-0-paridade-reconciliacao-agent-prompts.story.md` (Ready, GO 8/10 do
> @po). Duas decisões do Gabriel de 05/08 são lei aqui: **D-87-0-a** — o painel admin é a fonte da
> verdade; o código vira fallback de bootstrap. **D-87-0-b** — fato de empreendimento não mora em
> prompt. Derivadas: stories **87-1** (governança do painel) e **87-2** (campos mortos passam a
> valer), ambas cortadas da 87-0 e **fora do caminho crítico da Onda 1**.
>
> **Estado em 07/08:** a reconciliação **já aconteceu em produção** (05/08 20:58) — `"stand"` = 0
> nos 7 slugs, `"Agendei sua visita"` = 0, `visit-scheduling` com 5.105 chars e `is_active=true`
> (verificado no banco pelo @po em 06/08 e pelo @architect em 07/08). **O que falta é mecanismo,
> não conteúdo:** sem o job de diff em CI (D5) a paridade apodrece de novo em semanas. Consequência
> registrada em §7/Onda 4: o W0-0 **deixou de bloquear o Epic 88 inteiro** e passou a bloquear
> apenas o item **88-9** (enforce), que é o único com AC de prompt.

**W0-1** — a memória de projeto já foi parcialmente corrigida em 05/08, mas ainda contém o
frontmatter `name: "MemPalace (em produção)"`, o checklist "✅ MemPalace tables / ✅ pgvector
embeddings" e a linha de índice em `MEMORY.md` descrevendo o sistema como implementado. Enquanto
esses trechos existirem, o próximo agente relerá a afirmação errada. Custo ~15 minutos; foi a
crença que atrasou este diagnóstico em meses.

**W0-2** — o que instrumentar: erro de query em `loader.ts:62,114` (hoje vira string vazia),
falha de escrita em `pipeline.ts:1330` e `writer.ts:130`, uso de `ai_summary` como fallback
(`loader.ts:196`), e truncamento do histórico. **Regra:** nenhum trecho de conversa em metadata
além do que já é praticado; PII mínima.

**W0-4** — hoje existe apenas `conversations.is_ai_active` (por conversa, default `true` na
criação). Não há como pausar a Nicole globalmente sem `UPDATE` em massa. Independente de D1, é
a válvula que faltará no próximo incidente. **Atenção ao gotcha do Vercel:** nunca `vercel env add`
via pipe; usar `scripts/vercel-env-set.sh`.

---

### Onda 1 — Estancar (2–4 dias · muda comportamento, alta certeza)

> Objetivo: cortar as três fontes de mentira. Um deploy por fix, 24h de observação entre eles.
> **A ordem abaixo é a que o @architect assinou (validação de 05/08, §1.2 e condição 2)** — a
> ordem original (W1-1 primeiro) foi **REPROVADA** e está revogada. A tabela está em ordem de
> execução.

| ID | Título | Resolve | Esforço | Risco | Depende de | Executor |
|----|--------|---------|---------|-------|-----------|----------|
| **W1-2a** | Remediação de dados: purge do estado de agenda fantasma | **CR-4** | S | **Médio** (R-B) | **W0-0**, D8 | @data-engineer |
| **W1-3a** | Remediação de dados: resumos que afirmam agendamento inexistente | **CR-3** | S | **Médio** (R-B) | **W0-0**, D8 — **sai no mesmo dia da W1-2a** (O-3) | @data-engineer |
| **W1-2b** | Estado de agenda: **âncora temporal** + TTL + não nasce da fala da Nicole — **deploy 1** | **CR-4** | M | **Médio** | W1-2a + W1-3a | @dev |
| **W1-3b** | `updateLeadMemory` deixa de gravar a fala da Nicole como fato — **deploy 2** | **CR-3** | M | **Médio** | W1-2b em prod | @dev |
| **W1-1** | Histórico passa a ser a **cauda** da conversa — **deploy 3** | **CR-1** | XS (código) / M (teste + validação) | **Médio** (R-A) | W0-3, W1-3b em prod | @dev |
| **W1-4** | Invariante de isolamento cross-lead como teste (R4) | **R4** | M | **Nenhum** (só testes) | — (paralelo) | @dev + @qa |
| **W1-5** | Fechar validação em prod das 75-268 e 75-270 (AC7) | Sintomas 2, 3 e 4 | XS (zero código) | **Nenhum** | D7 | @qa + Marcos/Thielly |

**W1-1 vai por último, e não é rebaixamento.** O @architect contou as mensagens no banco: a
conversa da Sandra tinha **14 mensagens** no momento do incidente — o `limit(20)` não cortou nada,
CR-1 não teve participação nenhuma nos incidentes relatados (alcance real: 7,3% dos turnos). Pior:
corrigir o histórico muda o referente de `lastAssistantMsg`, que alimenta `isVisitSchedulingMode` e
`nameExpected` — ou seja, **ver a cauda deixa o modo agendamento MAIS propenso a ligar**, e subir
isso antes do W1-2b piora o sintoma da Sandra durante a própria janela de observação (O-2). A
correção continua sendo uma linha (`ascending: false` + `.limit(20)` + reverter antes de injetar);
o trabalho real é o teste de ordem e a **observação**. Deploy **sozinho**. A story precisa trazer
AC explícita sobre os dois gates e **decisão escrita sobre as mensagens `role='broker'`**
(recomendação do @architect: continuar cega ao corretor, **com teste que fixe isso como intenção**).

**W1-2** — três partes, e a ordem importa: o purge (a) elimina o dano imediato **sem deploy**; a
âncora + TTL + o corte da derivação a partir de `assistantMessage` (b) impedem que volte. A guarda
`isAmbiguousSlotText` (75-245) continua valendo — este item cobre o `visit_pending_date` **já
derivado numa sessão anterior**, que ela não protege.

> **A âncora temporal não é enfeite — é o que separa mitigar de resolver, e é como o Epic 88 já
> cita este item.** O defeito nomeado pelo @architect: *expressões temporais relativas são gravadas
> sem âncora e reavaliadas contra o `now` de qualquer turno futuro*. A mesma string gravada em
> 27/07 resolve para 08/08 se lida em 05/08 e para 15/08 se lida em 12/08 — um relógio que aponta
> para sempre ao "próximo sábado". TTL mitiga; **âncora resolve**. Proposta: `visit_availability`
> deixa de ser texto livre e vira `{ raw, anchored_date, anchored_at, source: 'lead'|'system' }`, e
> `resolveVisitSlotParts` **nunca reancora**. Teste que o @architect exige ver vermelho antes:
> `resolveVisitSlotParts(availability_de_27/07, now=12/08)` **não** pode devolver 15/08.
>
> **Escala medida em 07/08 (`2026-08-07-debate-tool-use-nicole.md` §2.7), e ela muda a urgência da
> W1-2a:** são **59** `conversation_state` vivos com resíduo de agenda; a guarda da 75-245 cobre
> **4**; **46** carregam uma data que anda sozinha; e **3 (Célia, Adriele, Wilson) criam um
> `appointment` fantasma na próxima mensagem que o lead mandar — inclusive "Oi"**. O purge da
> W1-2a deixou de ser higiene e virou desarme; e precisa virar **rotina** até a âncora existir
> (O-7), porque sem cortar a fonte o estado se reenvenena no turno seguinte.
>
> **Defeito determinístico da mesma raiz, que a story precisa cobrir (evidência: Valnira, 03/08
> 23:57):** o lead pediu *"semana de manhã"* e o pré-fetch ofereceu **três sábados**. Causa em
> `visit-slot.ts:363-381` — a guarda de período da 75-268 foi aplicada ao caminho
> `visitAvailability` e **não** ao caminho `pendingDay`, que é justamente o campo que o pipeline
> escreve sozinho, sem guarda de ambiguidade nenhuma. **A 75-268 corrigiu metade do bug que ela
> mesma nomeia.** Não é item novo: é o mesmo estado sem âncora, sem TTL e sem procedência — e é o
> lado que o Epic 88 preserva intocado, então nenhuma tool o alcança.

**W1-3** — `updateLeadMemory` hoje recebe `assistantMessage` e a instrução "incorpore informação
nova", sem uma única regra sobre compromissos. Duas opções para o @architect avaliar: (i) não
passar mais a fala da Nicole como fonte de fato, (ii) passar, mas proibir explicitamente gravar
estado de agenda e cruzar com `appointments`. **Recomendação: (i) + fatos de agenda vindos só do
banco** — regra de prompt aqui é exatamente o que já falhou.

**W1-4** — roda em paralelo, não compete com nada: é test-only, **não vai a produção**. Honra o
requisito inegociável sem atrasar o estancamento. Cobre os 7 caminhos auditados
(`loadConversationHistory`, `loadMemoryContext`, `ai_summary`, RAG, mídia, prompt caching,
`checkSlotAvailability`) + as invariantes de banco.

**W1-5** — custo zero e alto valor: as duas stories estão `InReview` desde 04/08 esperando um lead
real. Sem isso, o epic corre o risco de "corrigir" de novo o que já está corrigido.

---

### Onda 2 — Rede de segurança (~1 semana · pré-requisito de tudo que vem depois)

> Objetivo: tornar impossível a 5ª reincidência silenciosa.
>
> **Regra de corte (reescrita em 07/08 — a formulação anterior proibia o Epic 88 por escrito):**
> **nenhuma story das Ondas 3 e 4 deste epic começa antes de W2-1 estar verde.** O **Epic 88 não é
> exceção ao princípio — ele o satisfaz por outro caminho**, e isso precisa estar escrito para não
> virar interpretação: o harness de **efeito colateral** já foi entregue pela Story **75-279**
> (`__fixtures__/fake-supabase.ts` com filtros reais + `pipeline-scheduling.test.ts` exercitando o
> INSERT de ponta a ponta, com vermelho comprovado), e o harness de **entrada do modelo** é o item
> **88-2**, que é da Onda 0 do próprio Epic 88. Portanto: a **Onda 0 do Epic 88 (88-1 a 88-4) está
> autorizada a começar**, e **nada do Epic 88 da Onda 1 em diante sobe antes de 88-2 verde**.
> Em nenhuma hipótese o princípio se afrouxa: **mudança estrutural sem rede é a origem do ciclo de
> reincidência que este epic existe para quebrar.**

| ID | Título | Resolve | Esforço | Risco | Depende de | Executor |
|----|--------|---------|---------|-------|-----------|----------|
| **W2-1** | Harness de integração do `processMessage` | A dívida que 4 stories seguidas apontaram | **L/XL** | **Nenhum** (test infra) | Onda 1 em prod | @dev + @qa |
| **W2-2** | Suíte de reencenação dos incidentes reais **auditados** (Sandra, Sueli, Valnira, Orlice, Ailton, Maria Oliveira, Célia, Helena, Miriam) | Todas as CR — regressão vira falha de teste | M | **Nenhum** | W2-1 | @qa |
| **W2-3** | `detectSlotMismatch` deixa de ser cega (roda também sem slot autorizado) — **em shadow mode** | **CR-5** | M | **Médio** (falso positivo) | W2-1 | @dev |
| ~~**W2-4**~~ | ~~Paridade `agent_prompts` × código~~ → **movido para `W0-0` (Onda 0), BLOQUEANTE**, por decisão do @architect (validação de 05/08, §6.3). Não executar a partir daqui | — | — | — | — | — |

**W2-1** é a story mais importante do epic e a que menos parece urgente. Precisa reencenar uma
conversa turno a turno com Supabase e Anthropic mockados e **afirmar efeitos colaterais**: INSERT em
`appointments`, mutação de `collected_data`, mídia enviada, escrita de resumo. Hoje `pipeline.test.ts`
só testa helpers puros — é por isso que todo fix é provado "até o slot" e validado no cliente real.

**W2-2 — o conjunto de incidentes mudou depois da auditoria do @po (06/08), e o @architect
ratificou (07/08).** Não é ajuste cosmético: **a Silvana sai** (ela pediu **ligação**, não visita, e
a ligação aconteceu — `lead_tasks` concluída 27/07 09:39; misturar os dois na mesma fixture
contamina o teste), e **entram Célia (28/06), Helena (23/06) e Miriam (07/07)**, medidas no
histórico completo de 8 semanas e não na janela de 14 dias. O placar da classe "a Nicole afirmou
visita sem lastro" é **6 de 7**, não 4 de 5. **Célia é o caso mais limpo e o mais antigo:** a Nicole
disse *"Agendei sua visita para este sábado às 9h"* e **nunca existiu appointment** — ninguém
corrigiu à mão, e o sistema levou **cinco semanas** para descobrir. É o argumento mais forte do
epic e ele estava fora do documento.

**W2-3** — ampliar a guarda **sem** ligar bloqueio. O objetivo desta onda é obter o **denominador**:
quantas vezes ela afirma dia+hora sem autorização, e quantas dessas são falso positivo (ofertas,
horário de expediente, remarcação). Sem esse número, ligar fail-closed é apostar (R-C).
**Insumo medido que a story precisa absorver (@po, 06/08):** a guarda **também falhou com slot
autorizado** — Ailton, 30/07 22:17, slot autorizado às 10:00, a Nicole afirmou 9h, e
`NICOLE_SLOT_MISMATCH` tem **0 eventos em toda a história do `system_events`**. Ou seja: ela não é
só cega quando `authorizedSlotUtc` é `null`; ela não disparou num caso em que ele **não** era.
Ampliar o gatilho sem investigar esse caso reproduz a cegueira com mais código.

---

### Onda 3 — Enforcement de verdade (R3) (~1–2 semanas)

> Objetivo: transformar guardrail de texto em contrato verificado. **Toda regra entra em shadow mode primeiro.**

| ID | Título | Resolve | Esforço | Risco | Depende de | Executor |
|----|--------|---------|---------|-------|-----------|----------|
| **W3-1** | Bloco de fatos autorizados tipado + validador pós-resposta (shadow) | **CR-5, R3** — dá ao sistema como distinguir "o sistema me disse" de "eu completei a frase" | **L** | **Baixo** (shadow) | W2-1, W2-3 | @architect + @dev |
| **W3-2a** | Regra: **nunca devolver ao lead o teto de orçamento que ele declarou** | Sintoma 1 (Sandra) — pedido direto do usuário | S | **Baixo** (shadow) | W3-1 | @dev |
| **W3-2b** | Regra: **nunca introduzir outro empreendimento sem o lead pedir** | **CR-6** (Orlice) — pedido direto do usuário | M | **Médio** (pivô legítimo existe e é bom) | W3-1 | @dev |
| **W3-2c** | Regra: dia/hora afirmado sem slot autorizado | **CR-5** | S | **Baixo** | W3-1, W2-3 | @dev |
| **W3-2d** | Regra: mídia prometida além do que sai | 75-157/75-270 (trade-off assumido lá) | S | **Baixo** | W3-1 | @dev |
| **W3-3** | Ligar **fail-closed**: regenerar 1× → degradar para resposta segura / handoff | **CR-5, R3** | M | **Alto** (R-C) | **D4** + FP < 5% (M6) | @dev + @qa |

**W3-2b tem uma sutileza que a story precisa respeitar:** o pivô da Orlice para o Yarden foi
**leitura comercial correta** — ela disse que queria outra região e prazo maior. O que faltou foi a
mídia acompanhar (já corrigido) e o lead ter **pedido ou consentido**. A regra não pode ser "nunca
citar outro empreendimento", e sim "não apresentar outro empreendimento como oferta ativa sem que o
lead tenha sinalizado incompatibilidade com o atual". Regra mal calibrada aqui destrói uma
capacidade que funciona.

**W3-3** é a única story do epic que pode piorar a experiência do lead. Só entra com o número de
falso positivo na mão e com D4 decidida.

---

### Onda 4 — Grounding e memória (R2) (~2–4 semanas)

> Objetivo: a Nicole **consulta** em vez de saber. Incremental, uma capacidade por vez, atrás de flag.

| ID | Título | Resolve | Esforço | Risco | Depende de | Executor |
|----|--------|---------|---------|-------|-----------|----------|
| ~~**W4-1**~~ | ~~Tool de agenda~~ → **REMOVIDO deste epic. Substituído pelo Epic 88** (`docs/stories/epics/epic-88-nicole-tool-use-agenda.md`), após o veto do @architect (validação de 05/08, §5.1). Não executar a partir daqui | — | — | — | — | — |
| **W4-2** | Tool de dados do empreendimento (preço/faixa, endereço, metragem, entrega) com "não sei" explícito | **R2**, RN4/RN6/RN9 | **L** | **Médio** | **Epic 88 · Onda 3 concluída** | @dev |
| **W4-3** | Tool de mídia resolvida **depois** da fala | 75-270 (trade-off assumido) | M | **Médio** | **Epic 88 · Onda 3 concluída** | @dev |
| **W4-4** | Decisão e execução sobre a memória: reviver `012` × redesenhar enxuto × enterrar | **CR-2** | **XL** | **Alto** | **D2**, W3-1 | @architect + @data-engineer |

**Por que o W4-1 saiu, e qual é o gate entre os dois epics.** O @architect reprovou a tool como
desenhada aqui: *"tool use conserta 'o modelo afirma um fato que não está no contexto'; os
incidentes são 'o contexto contém um fato falso e o modelo o repete fielmente'"* — verdadeiro para
a Sandra, e a auditoria do @po mostrou que **não** é verdadeiro para a maioria dos outros. O Epic 88
é a resposta ao veto, com a fronteira redesenhada (**o determinismo mantém a LEITURA, a tool assume
a ESCRITA**). W4-2 e W4-3 continuam vivos aqui, e agora dependem da infraestrutura de tool que o
Epic 88 constrói — não de um item que não existe mais.

> **O veto do @architect mudou de forma em 07/08 (`2026-08-07-debate-tool-use-nicole.md` §6): de
> REPROVADO para ADIADO COM CRITÉRIO NUMÉRICO DE ENTRADA.** Este é o gate explícito entre os dois
> epics, e ele é um número, não uma opinião:
>
> 1. Executar primeiro as **correções determinísticas** (âncora e procedência do estado, guarda do
>    `pendingDay`, `isSlotFree` fail-closed, funil instrumentado, reconciliação diária fala × banco)
>    — a maior parte é Onda 1 e Onda 2 **deste** epic, mais os itens 88-1/88-3/88-4 do Epic 88, que
>    são higiene obrigatória mesmo que tool nenhuma exista.
> 2. **Remedir o lastro** pelo instrumento novo, com a definição da §3 (`created_by='nicole'` a
>    ±30 min **e** `created_at ≤ fala + 2 min`). **Baseline: 31%.**
> 3. **Lastro ≥ 90%** → a tool de escrita não se justifica; o Epic 88 fecha reduzido ao que já foi
>    entregue. **Lastro < 90%** → o **Epic 88 sobe como está escrito**, com o gap residual atribuído
>    porta a porta, e o @architect assina.
>
> O que **não** muda com o gate: a Onda 0 do Epic 88 é higiene e está liberada agora (ver a regra de
> corte da Onda 2).

**W4-4 por último, e de propósito.** O MemPalace morto **não é causa de alucinação** — o `ai_summary`
contaminado é (CR-3). Consertar a memória primeiro seria trocar um problema conhecido por 4 meses de
código nunca exercitado, e reintroduzir escrita automática de "fatos" — exatamente a classe de erro
do CR-3. Ver **D2**.

---

## 8. Decisões que dependem do Gabriel

> Nenhuma destas é decisão de PM. Cada uma tem recomendação e o custo de errar.

### D1 — Pausar a Nicole enquanto corrige, ou corrigir com ela no ar?

| Opção | A favor | Contra |
|-------|---------|--------|
| **(a) Pausa total** | Zero risco de novo lead queimado | Custo **certo** sobre **100%** dos leads; hoje não existe kill switch (só `is_ai_active` por conversa); reativar traz backlog de conversas mortas |
| **(b) Pausa seletiva nas conversas longas (>20 msgs)** | Ataca exatamente a população do CR-1 (5,9%) | São **os leads que reengajam — os de maior valor**. Pausar justamente esses é o pior recorte possível |
| **(c) Corrigir no ar, em ondas curtas, com remediação de dados imediata** | Onda 1 leva dias; o purge (W1-2a/W1-3a) desarma hoje o pior gatilho **sem deploy** | Aceita risco residual em conversas longas até W1-1 ir a produção |

**Recomendação: (c), com o kill switch (W0-4) construído mesmo assim.** O dano é probabilístico e
concentrado em gatilhos que a remediação de dados desarma em horas; a pausa é dano certo sobre
todos. Mas quero a válvula existindo antes do primeiro deploy — se a Onda 1 revelar
comportamento inesperado (R-A), a alternativa a "reverter e esperar" não pode ser um `UPDATE` em
massa improvisado.

### D2 — MemPalace: reviver, redesenhar ou enterrar?

| Opção | A favor | Contra |
|-------|---------|--------|
| **(a) Reaplicar a migration `012`** | A migration já está escrita; "só" falta rodar | Liga **~4 meses de código nunca exercitado** contra leads reais; reintroduz escrita automática de "fatos" (a classe de erro do CR-3); zero evidência de que funcione, porque nunca rodou |
| **(b) Redesenhar enxuto** — fatos estruturados escritos **só** a partir da fala do lead e do banco, sem embeddings no v1 | Ataca a causa (fato sem procedência), não o sintoma; verificável | Custa mais; abre mão de L2/L3 semântico por ora |
| **(c) Enterrar o código morto e ficar no `ai_summary` saneado** | Mais barato; remove código que finge funcionar | A Nicole segue com memória rasa; o problema volta como pedido de produto em semanas |

**Recomendação: (c) agora + (b) na Onda 4.** Na Onda 0/1: tornar a falha **ruidosa** (W0-2) e sanear
o `ai_summary` (W1-3). Código morto que finge funcionar é pior que ausência de memória — foi ele que
sustentou 4 meses de crença errada. **Não reaplicar a `012` às cegas.** Se você quiser (a) por
custo, aceite explicitamente que estamos ligando um sistema não testado em cima de um incidente
aberto — nesse caso ele vai atrás do harness (W2-1), nunca antes.

### D3 — Tool use completo ou grounding incremental? — ✅ **FECHADA (06/08)**

> **Decidida: (b) — grounding incremental, agenda primeiro.** A decisão saiu do papel e virou
> documento próprio: **`Epic 88 · §2`** (fronteira leitura/escrita), depois do veto do @architect ao
> W4-1 e da arbitragem @architect × @analyst. **A entrada em execução do Epic 88 está sujeita ao
> critério numérico de lastro descrito na Onda 4 (≥90% / <90%).** Decisão aberta em dois lugares é
> decisão que ninguém executa — esta tem um dono e um documento. O texto abaixo fica como registro
> do raciocínio que produziu a escolha.

| Opção | A favor | Contra |
|-------|---------|--------|
| **(a) Reescrever para tool use completo** | Arquitetura limpa; resolve R2 de uma vez; a Nicole nunca "sabe", sempre consulta | Big-bang num `processMessage` de 1843 linhas **sem** teste de integração; latência e custo mudam para todos os turnos; regressão em áreas que hoje funcionam |
| **(b) Incremental — agenda primeiro, atrás de flag** | Cada tool é reversível e medível; a lógica da agenda já existe pronta | Deixa um híbrido (parte pré-injetada, parte consultada) por semanas; exige disciplina para não parar no meio |

**Recomendação: (b), agenda primeiro, e só depois do harness.** O híbrido é desconfortável mas
honesto: o valor não está em "ter tools", está em a Nicole parar de completar frase sobre fatos
verificáveis. A agenda entrega quase todo esse valor com a lógica que já está escrita e testada.

### D4 — O que fazer quando o validador acusa violação?

| Opção | A favor | Contra |
|-------|---------|--------|
| **(a) Só logar** (comportamento atual) | Zero risco de piorar a conversa | Não resolve nada — é o que temos hoje, com 0 eventos em 7 dias |
| **(b) Regenerar 1× e enviar mesmo assim** | Melhora sem nunca silenciar | Se ela insistir, o lead recebe a alucinação com um turno de atraso |
| **(c) Regenerar 1× → se persistir, resposta segura genérica** | Nunca envia afirmação sem lastro | Resposta genérica frustra; +1 chamada de modelo em latência e custo |
| **(d) Regenerar 1× → handoff humano** | Máxima segurança; lead quente vai para gente | Depende de haver humano disponível; fora do horário vira silêncio |

**Recomendação: (c) para agenda e orçamento, (d) quando a mesma violação se repetir na mesma
conversa.** E **só depois** do shadow mode com FP < 5% (M6). Um lead que ouve "deixa eu confirmar
esse horário certinho e já te retorno" é recuperável; um lead que aparece no stand para uma visita
que não existe, não.

### D5 — Criar CI de verdade?

Não existe `.github/workflows` neste repositório. O requisito **R4** ("invariante testado em CI") e
a rede de segurança da Onda 2 **não são executáveis** como escritos: hoje "CI" é o @qa lembrar de
rodar a suíte.

| Opção | A favor | Contra |
|-------|---------|--------|
| **(a) CI mínima em PR** (`test` + `type-check` + `lint`) | Torna a Onda 2 real; barato (@devops, ~S/M) | Tempo do @devops agora, no meio do incidente |
| **(b) Manter gate manual do @qa** | Zero trabalho novo | A tese inteira do epic — "remendo sem rede reincide" — fica sem mecanismo |

**Recomendação: (a), em paralelo à Onda 1, pelo @devops.** Não compete com o estancamento (times
diferentes de trabalho) e é o que dá sentido a W1-4, W2-1 e W2-2.

### D6 — Teto de latência e custo por turno — ⛔ **REVOGADA. O teto único é `Epic 88 · D88-3`**

A intenção continua certa (sem teto declarado, a Onda 4 vira discussão de opinião no code review),
mas **este epic media o componente errado** e produzia dois tetos contraditórios em dois documentos
ativos — que é exatamente o que o D6 existia para evitar.

- **O que estava escrito aqui:** teto sobre `CLAUDE_RESPONSE` (p95 atual + 30%).
- **O que vale a partir de 07/08:** teto sobre o **turno percebido** (`whatsapp_async_done`), com
  **baseline declarado e medido: p95 = 12.469 ms (n=442, 14 dias)**, teto = **+10%** → 13.716 ms,
  com a compensação do `typing-delay` ativa. Dono: **`Epic 88 · D88-3`**, decisão arquitetural
  ratificada, não pendência do Gabriel.
- **Por quê:** o que decide se o lead sai da conversa é o tempo entre a mensagem dele e a resposta
  chegar, não o tempo da chamada ao modelo. Medir o componente errado autoriza a decisão errada nos
  dois sentidos. E há vários segundos por turno que **não** são o modelo (MemPalace morto, laços
  sequenciais de `isSlotFree`) — o orçamento para qualquer coisa nova é **financiado**, não gratuito.

**A parte de custo continua valendo e continua sendo deste epic:** aceitar até 3× o atual
(~$0,003/lead/mês) — irrelevante frente a um lead queimado.

### D7 — Quem valida em produção, e com que critério de rollback?

As ACs de validação em prod das 75-268 e 75-270 estão abertas desde 04/08 porque dependem de um
lead real. Este epic multiplica esse tipo de AC.
**Recomendação:** nomear responsável (Marcos ou Thielly) com janela de 24h após cada deploy, e um
critério de rollback escrito **antes** do deploy — para W1-1: qualquer aumento em M1/M2 ou queda em
`Epic 88 · PM8` na janela = reverter. Sem responsável nomeado, as ondas ficam `InReview` para
sempre e o epic não fecha.

> **Esta decisão é única e vale para os dois epics.** O `D88-6` do Epic 88 é a mesma pergunta e
> **herda daqui**; o que ele acrescenta é o requisito de **janela de 24h por degrau de rollout**
> (canário → 10% → 100%). Dois donos para a mesma decisão = zero donos.

### D8 — Remediação dos leads já contaminados: mexer no dado e falar com o cliente?

Sandra tem, em produção **agora**, um `ai_summary` afirmando que ela agendou visita para sábado
dia 8 e um `visit_pending_date` para essa data. Ela não agendou nada. Há outros casos — a lista sai
por query (M4/M5).

| Dimensão | Opções |
|----------|--------|
| **Dado** | (a) purge automático de tudo que a query pegar · (b) lista revisada por humano antes de executar · (c) não mexer e deixar o código novo se corrigir |
| **Cliente** | (a) contato ativo com quem recebeu confirmação de visita inexistente · (b) deixar a Nicole se corrigir sozinha na próxima mensagem |

**Recomendação: dado (b) + cliente (a) restrito.** Purge automático em produção sem revisão viola
R-B — pode apagar negociação legítima em andamento. E quem foi informado de uma visita que não
existe merece um contato humano: é barato, salva o lead e evita alguém aparecer no stand no sábado.
**Esta é a decisão mais urgente da lista — vale para hoje, não depende de nenhum deploy.**

---

## 9. Sequência de execução (dependências)

```
W0-0 🔒 (paridade de prompts — story 87-0)   ← BLOQUEANTE: nada da Onda 1 antes dele
   │
W0-1 ─┐
W0-2 ─┼─▶ W0-3 (baseline) ──┐
W0-4 ─┘                     │
                            ▼
                    [D1, D8 decididas]
                            │
        ┌───────────────────┼────────────────────┐
        ▼                   │                    ▼
   W1-2a + W1-3a            │                 W1-4 (test-only,
   (SQL, juntos, hoje)      │                  paralelo, sem deploy)
        │                   │
        ▼                   │
   W1-2b (deploy 1 — âncora + TTL + não deriva da fala dela)
        ▼ +24h              │
   W1-3b (deploy 2 — resumo)
        ▼ +24h              │
   W1-1  (deploy 3 — histórico = cauda; por último: raio desconhecido)
        │                   │
   W1-5 (validação em prod das 75-268/270)
                            │
                            ▼
                       W2-1 (harness)  ◀── [D5: CI, em paralelo pelo @devops]
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
           W2-2                        W2-3
        (reencenação: 9 casos)       (shadow)
                            │
                            ▼
                       W3-1 (validador, shadow)
                            │
              ┌─────────────┼─────────────┬─────────────┐
              ▼             ▼             ▼             ▼
           W3-2a         W3-2b         W3-2c         W3-2d
              └─────────────┴──────┬──────┴─────────────┘
                                   ▼  [D4 + M6 (FP<5%)]
                                W3-3 (fail-closed)
                                   │
                                   ▼
                     ══════════════════════════════════
                      REMEDIR O LASTRO (baseline 31%)
                      ≥90% → tool não se justifica
                      <90% → Epic 88 sobe como escrito
                     ══════════════════════════════════
                                   │
                                   ▼
                     ┌─────────────────────────────┐
                     │  EPIC 88 — tool use na       │
                     │  agenda (era o W4-1)         │
                     │  Onda 0 (88-1..88-4): LIVRE  │
                     │  Onda 1+ : depois de 88-2    │
                     └──────────────┬──────────────┘
                                    │ Onda 3 concluída
                       ┌────────────┴──────────┐
                       ▼                       ▼
                    W4-2 / W4-3            W4-4  [D2 — memória]
```

> **Leitura do diagrama:** o `W0-0` e a Onda 0 do **Epic 88** são as duas coisas que podem começar
> hoje. O bloco "REMEDIR O LASTRO" é o gate do @architect e é o que decide se o Epic 88 sobe inteiro
> ou fecha reduzido — ele **não** bloqueia a Onda 0 do 88, que é higiene obrigatória de qualquer
> forma.

**Marcos:**
- **Fim da Onda 0** — paramos de operar às cegas; existe "antes".
- **Fim da Onda 1** — 🩹 hemorragia estancada: M1, M4 e M5 zerados.
- **Fim da Onda 2** — 🕸️ rede de segurança: a 5ª reincidência falha um teste em vez de aparecer num WhatsApp.
- **Fim da Onda 3** — 🛡️ guardrail vira contrato verificado: M6, M7, M8 zerados.
- **Fim da Onda 4** — 🎯 a Nicole consulta em vez de saber.

---

## 10. Notas para o @sm

- **Não redigir stories a partir deste roadmap sem reler o dossiê** — cada item W tem evidência
  específica (linha de código, registro de banco) que precisa entrar na story como contexto medido,
  não reconstruído.
- **Uma story por item W.** W1-2 e W1-3 estão deliberadamente partidos em `a` (dado) e `b` (código):
  são executores e riscos diferentes.
- **A identidade item↔story já quebrou — use o mapa, não a numeração.** O `stories_planned` do
  frontmatter é a tabela item→story e é a fonte da verdade: `W0-0 → 87-0`; as stories `87-1` e
  `87-2` foram **cortadas** da 87-0 em 05/08 e **não correspondem** a `W0-1`/`W0-2`. Toda story nova
  entra nesse mapa no mesmo commit em que nasce.
- **AC de prompt se verifica no BANCO.** Sob a decisão **D-87-0-a** do Gabriel (05/08), o painel
  admin é a fonte da verdade e o código é **fallback de bootstrap declarado**. A orientação antiga
  ("AC dupla, código **e** banco") está **revogada**: ela faz o @dev editar dois lugares e acreditar
  que os dois valem — a doença que a 87-0 curou. A regra é: a AC se verifica em `agent_prompts`, e o
  código não pode contradizê-lo.
- **Toda story da Onda 1 precisa de critério de rollback escrito** antes do deploy (D7).
- **Nenhuma AC pode ser "existe no painel / existe no env".** Tem que ser **efeito verificado em
  produção** — e atenção ao projeto Vercel: o webhook da Nicole é atendido por
  `prj_KMm5f2…` (freelans), **não** pelo `prj_s3ARh1…` que o `.vercel/project.json` deste repo
  aponta. Já falhou duas vezes nesta casa por esse motivo (vale para W0-4).
- **Migrations:** o maior prefixo local hoje é **215**; conferir no momento de criar e aplicar por
  Management API (R-G).
- **Numeração de story:** sugerido `87-N`, seguindo o padrão do Epic 86. Decisão do @sm.

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-08-05 | 0.1 | Epic criado a partir do dossiê de incidente de 05/08 (código real + banco de produção). 6 causas raiz, 5 ondas, 21 itens de roadmap, 8 decisões pendentes do stakeholder. | @pm (Morgan) |
| 2026-08-07 | 0.2 | **Reconciliação do documento com o que já foi decidido e medido depois de 05/08.** O epic não era editado desde a criação e, por escrito, proibia o Epic 88 e apontava para itens inexistentes — três revisores independentes (@architect §8 do debate de 07/08, @po §2 da validação do Epic 88, @pm) chegaram à mesma lista. **Nenhum item novo foi inventado e nenhuma onda foi reordenada além da que o @architect reprovou.** O que mudou e por quê: **(1)** criado o **`W0-0`** (paridade `agent_prompts`, BLOQUEANTE, Onda 0) e `W2-4` marcado como movido — o item existia na validação do @architect e na story 87-0, e não no epic; **(2)** **`W4-1` removido**, substituído pelo **Epic 88**, e `W4-2`/`W4-3` repontados para "Epic 88 · Onda 3 concluída" (estavam órfãos); **(3)** **regra de corte da Onda 2 reescrita** — o princípio ("nada estrutural sem rede") é mantido e ganha a exceção explícita: Onda 0 do Epic 88 liberada, Onda 1+ atrás do 88-2, porque o harness de efeito colateral já veio na 75-279; **(4)** **`D6` revogada** em favor do **`D88-3`** (teto sobre `whatsapp_async_done`, baseline medido p95 = 12.469 ms, n=442) — havia dois tetos contraditórios em documentos ativos; **(5)** **`M10` vira ponteiro para `PM8`** — eram a mesma métrica com dois nomes; **(6)** **`D3` fechada** (decidida no Epic 88 §2); **(7)** **ordem da Onda 1 corrigida** para a que o @architect assinou (W1-2a+W1-3a → W1-2b → W1-3b → W1-1), com o racional medido (a conversa da Sandra tinha 14 mensagens: CR-1 não causou o incidente, e a cauda deixa o modo agendamento *mais* propenso a ligar); **(8)** `stories_planned` preenchido com o mapa item→story (87-0, 87-1, 87-2). **Fatos novos absorvidos:** F-7 morreu (prompts reconciliados em prod em 05/08 20:58 — o `W0-0` deixa de bloquear o Epic 88 e passa a bloquear só o 88-9); placar de incidentes auditado é **6 de 7** (Silvana sai — era ligação e ela aconteceu; entram Célia, Helena e Miriam), com a Célia invisível por 5 semanas; **baseline de lastro = 31%**, com a definição que impede a métrica de melhorar sozinha quando um humano conserta depois; o veto do @architect virou **critério numérico de entrada** (≥90% / <90%) e está escrito como o gate entre os dois epics; escala das minas vivas (59 estados, 46 com data que anda, **3 armados**) e o defeito determinístico do `pendingDay` ("semana de manhã" → três sábados), ambos ancorados no W1-2a/W1-2b; e a AC de prompt passa a se verificar **no banco**, sob a D-87-0-a. | @pm (Morgan) |
