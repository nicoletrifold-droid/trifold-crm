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
  - packages/web/src/app/api/cron/enrich-leads/route.ts + packages/ai/src/flows/haiku-enrichment.ts — **a SEGUNDA esteira de escrita do `collected_data`, fora do `processMessage`**: último escritor de 39 dos 56 estados residuais (@po, 07/08). Também é o 2º leitor que descarta `role='broker'` (W1-7)
  - supabase/migrations/012_lead_memory_system.sql (registrada como aplicada, sem efeito no banco)
revisado_por:
  - docs/architecture/2026-08-05-validacao-epic-87.md (@architect, 05/08 — validação adversarial; criou o W0-0)
  - docs/architecture/2026-08-07-debate-tool-use-nicole.md (@architect, 07/08 — §8 lista G-1..G-5, as incoerências deste arquivo)
  - docs/qa/po-validation-epic-88.md (@po, 06/08 — §2 lista as 9 edições obrigatórias aqui)
  - docs/qa/po-validation-87-3-87-4-87-5.md (@po, 07/08 — §6 lista as 3 edições `P1`–`P3` desta v0.6; §2.1 e §3.3 trazem as medições que elas absorvem)
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
  - item: W0-5
    story: docs/stories/87-3-reconciliacao-diaria-fala-x-banco.story.md
    status: Ready
  - item: W1-2b
    story: docs/stories/87-4-estado-de-agenda-com-ancora-temporal.story.md
    status: Ready
  - item: W1-7
    story: docs/stories/87-5-historico-rotulado-fala-do-corretor.story.md
    status: Ready
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
>
> ⚠️ **O `31%` é baseline MANUAL, e o instrumento ainda não o reproduz.** A régua rodada exatamente
> como especificada contra 60 dias de produção dá **7%** (@po, `po-validation-87-3-87-4.md` §1.4),
> por quatro causas medidas: denominador (16 falas curadas × 30 disparos do instrumento), unidade
> nunca declarada (fala × lead), filtro de `status` que contradiz a própria Dev Note da story, e o
> balde `lembrete` ausente — que rotula **lembrete de visita que já existia** como conserto humano.
> O viés **subconta** lastro. Recalibrar é a correção **B6** da Story 87-3; até lá, o número informa
> escopo e ordem e **não arbitra decisão de arquitetura** (ver Onda 4 e `Epic 88 · §8.1`).

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

**Legenda de risco — dois eixos, e eles não são a mesma coisa** (correção `A4` do @po, 07/08). Por
padrão a coluna "Risco" mede **regressão em produção**: a chance de o item quebrar o que hoje
funciona. Mas os itens que **adicionam um caminho de decisão novo** têm um segundo eixo — a chance
de o comportamento novo estar **errado** —, e ele pode ser alto com o primeiro baixo. Trinta linhas
determinísticas dificilmente quebram algo (regressão **Baixa**) e podem, ainda assim, fazer a Nicole
agendar sozinha (comportamento novo **Alto**). Nesses itens a coluna vem como
**`regressão / comportamento novo`**; nos demais, um valor só, que é o de regressão.

> **Por que a distinção importa e não é preciosismo:** o @sm e o @po chegaram a classificações
> opostas do mesmo item (`W1-2c`) porque **mediam eixos diferentes, e os dois estavam certos sobre o
> próprio eixo**. Um item lido como "Baixo" no eixo errado atravessa a regra de corte da onda sem
> ninguém perceber.

### Onda 0 — Verdade e visibilidade (mesmo dia · não muda comportamento)

> Objetivo: parar de operar às cegas e ter o "antes" antes de mexer.

| ID | Título | Resolve | Esforço | Risco | Depende de | Executor |
|----|--------|---------|---------|-------|-----------|----------|
| **W0-0** 🔒 | **Paridade e reconciliação de `agent_prompts` (banco) × prompts do código** — snapshot versionado, reconciliação humana única, direção única depois disso, teste de contradição sede×stand | **R-D** — hoje qualquer guardrail pode estar anulado em produção | S/M | **Baixo** | — | @dev + @devops + produto |
| **W0-1** | Corrigir a documentação que afirma MemPalace em produção | **CR-2** (a crença errada que sustentou 4 meses de cegueira) | XS | **Nenhum** | — | @pm / @po |
| **W0-2** | Instrumentar as falhas silenciosas em `system_events` | **CR-2, CR-3** — torna auditável o que hoje é `return ""` | S | **Baixo** (só log) | — | @dev |
| **W0-3** | Baseline de métricas M1–M5 em produção + runbook de medição | Todas — sem baseline não há prova de melhora | XS | **Nenhum** | W0-2 | @qa + @data-engineer |
| **W0-4** | Kill switch global da Nicole (flag lido no webhook antes de `processMessage`) | Válvula de segurança operacional; habilita **D1** de verdade | S | **Baixo** | — | @dev + @devops |
| **W0-5** 🔴 | **Reconciliação diária fala × banco, com alerta nomeado** — cron sobre as falas da Nicole das últimas 24h: afirmou dia+hora e não existe `appointment` a ±30 min → alerta | **O tempo de descoberta.** Nenhum outro item dos dois epics detecta a Célia | **M** | **Nenhum** (só leitura + alerta) | W0-2 | @dev + @data-engineer |

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

**W0-5 🔴 — item novo, e é o de maior ROI dos dois epics.** Vem do @architect
(`2026-08-07-debate-tool-use-nicole.md` §2.3 e §4, itens 0.2 e "(a)") e não tinha dono em epic
nenhum. O argumento é a Célia: em **28/06** a Nicole escreveu *"Agendei sua visita para este sábado
às 9h"*; **zero appointments até hoje**; **cinco semanas** até alguém notar, por acidente, lendo a
conversa. Nenhum outro item destes dois epics detecta isso.

> **O reenquadramento que este item traz:** *a falha de parser durou 5 semanas e custou uma
> cliente; a falha de detecção durou as mesmas 5 semanas e custou todas as outras.* Enquanto nada
> compara a fala com a linha no banco, **todo defeito novo — de parser, de gate, de estado, de
> expediente — tem tempo de descoberta medido em semanas e um descobridor humano por acidente.**
>
> **Custo:** uma consulta e um cron. **Critério de aceite que o @architect exige (condição 2):**
> rodado sobre 60 dias retroativos, o job precisa listar **Célia, Helena, Miriam, Sandra, Sueli,
> Valnira e Maria Oliveira**. Se não listar, ele não serve.
>
> **Esforço corrigido de `S` para `M` (07/08).** A story `87-3` está em **M** desde a v0.2 e o
> roadmap ficou dizendo `S` — o epic autorizando um dimensionamento que a story já tinha
> desmentido. Não foi inchaço de escopo: *"uma consulta e um cron"* continua sendo o desenho, mas a
> régua ganhou o que a validação exigiu para não mentir — **quatro baldes com precedência
> normativa** (`com_lastro` → `reparo_humano` → `lembrete` → `sem_lastro`), discriminador
> **visita × ligação**, janela bilateral de 15 min, normalização de `timestamptz` e a publicação do
> número **nas duas leituras**. **A parte cara deste item é a régua, não o cron.**
>
> **Vale independentemente de qualquer decisão de tool** — e é o instrumento que mede o **lastro**,
> ou seja, é ele que produz o número que **dimensiona** a v1 do Epic 88: escopo, ordem e tamanho dos
> degraus de rollout (ver Onda 4 e `Epic 88 · §8.1`). Sem ele, o `PM2` do Epic 88 é métrica sem
> instrumento. **O número não decide se o Epic 88 existe** — condicionar arquitetura a estatística
> foi a redação revogada em 07/08. Por isso este item está na Onda 0 e não como métrica: **é
> entrega, não régua.**

---

### Onda 1 — Estancar (2–4 dias · muda comportamento, alta certeza)

> Objetivo: cortar as três fontes de mentira. Um deploy por fix, 24h de observação entre eles.
> **A ordem abaixo é a que o @architect assinou (validação de 05/08, §1.2 e condição 2)** — a
> ordem original (W1-1 primeiro) foi **REPROVADA** e está revogada. A tabela está em ordem de
> execução.

| ID | Título | Resolve | Esforço | Risco | Depende de | Executor |
|----|--------|---------|---------|-------|-----------|----------|
| **W1-2a** | Remediação de dados: purge do estado de agenda fantasma | **CR-4** | S | **Médio** (R-B) | **W0-0**, D8 | @data-engineer |
| **W1-3a** | Remediação de dados: resumos que afirmam agendamento inexistente — **tamanho medido em 07/08: 1 lead (Marilda)** | **CR-3** | **XS** | **Baixo** (R-B contido: uma linha revisada, não purge por query) | **W0-0**, D8 — **sai no mesmo dia da W1-2a** (O-3) | @data-engineer |
| **W1-2b** | Estado de agenda: **âncora temporal** + TTL + não nasce da fala da Nicole — **deploy 1** | **CR-4** | M | **Médio** | W1-2a + W1-3a | @dev |
| **W1-2c** | **ESCRITA apenas: o estado passa a REGISTRAR o que o SISTEMA ofereceu e o que a Nicole afirmou**, com data absoluta (`ofertas_do_sistema`, `afirmado_pela_nicole`). **A leitura — o "Ok" resolvendo contra a oferta — NÃO está aqui: é o `W3-2e`** | **CR-4, o outro sinal do mesmo defeito** — hoje o "Ok" do lead não tem a que se referir; este item dá a ele um referente persistido | S | **Baixo / Baixo** | W1-2b | @dev |
| **W1-3b** | `updateLeadMemory` deixa de gravar a fala da Nicole como fato — **deploy 2** | **CR-3** | M | **Médio** | W1-2b em prod | @dev |
| **W1-1** | Histórico passa a ser a **cauda** da conversa — **deploy 3** | **CR-1** | XS (código) / M (teste + validação) | **Médio** (R-A) | W0-3, W1-3b em prod | @dev |
| **W1-7** 🆕 | **Histórico passa a incluir a fala do CORRETOR, rotulada por papel** — `role='broker'` deixa de ser descartado por `loadConversationHistory` e pelo `enrich-leads` — **deploy 4** | **CR-1 (parcial)** + o defeito de leitura do `role='broker'`: 882 mensagens em 287 conversas invisíveis, e **31 respostas da Nicole cegas** para negociação em curso | M | **Médio / Baixo** | **W1-1 em prod** (ver condição de escape) | @dev |
| **W1-6** | `collected_data` **deixa de ser despejado como JSON cru** no system prompt; entra classificado por procedência ou não entra | **CR-3, CR-4** — hoje o fato falso chega ao modelo **duas vezes** | XS | **Baixo** | W1-2b | @dev |
| **W1-4** | Invariante de isolamento cross-lead como teste (R4) | **R4** | M | **Nenhum** (só testes) | — (paralelo) | @dev + @qa |
| **W1-5** | Fechar validação em prod das 75-268 e 75-270 (AC7) | Sintomas 2, 3 e 4 | XS (zero código) | **Nenhum** | D7 | @qa + Marcos/Thielly |

**W1-1 é o último dos três deploys originais, e não é rebaixamento** (o `W1-7`, criado depois,
é o deploy 4 e vem **atrás** dele — ver adiante). O @architect contou as mensagens no banco: a
conversa da Sandra tinha **14 mensagens** no momento do incidente — o `limit(20)` não cortou nada,
CR-1 não teve participação nenhuma nos incidentes relatados (alcance real: 7,3% dos turnos). Pior:
corrigir o histórico muda o referente de `lastAssistantMsg`, que alimenta `isVisitSchedulingMode` e
`nameExpected` — ou seja, **ver a cauda deixa o modo agendamento MAIS propenso a ligar**, e subir
isso antes do W1-2b piora o sintoma da Sandra durante a própria janela de observação (O-2). A
correção continua sendo uma linha (`ascending: false` + `.limit(20)` + reverter antes de injetar);
o trabalho real é o teste de ordem e a **observação**. Deploy **sozinho**. A story precisa trazer
AC explícita sobre os dois gates e **decisão escrita sobre as mensagens `role='broker'`** — essa
decisão **existe e é o `W1-7`**: elas entram, **rotuladas**, em item próprio, depois do `W1-1`. A
recomendação original do @architect (*"continuar cega ao corretor, com teste que fixe isso como
intenção"*) foi **superada pela decisão do Gabriel de 07/08**, tomada contra dado medido. O que a
story do `W1-1` mantém é a AC do **referente do `lastAssistantMsg`** no eixo da **janela**; o eixo do
**papel** é do `W1-7`.

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
> **Escala medida em 07/08 (`2026-08-07-debate-tool-use-nicole.md` §2.7):** eram **59**
> `conversation_state` vivos com resíduo de agenda; a guarda da 75-245 cobria **4**; **46**
> carregavam uma data que anda sozinha; e **3 (Célia, Adriele, Wilson) criavam um `appointment`
> fantasma na próxima mensagem que o lead mandasse — inclusive "Oi"**.
>
> **✅ Desarme executado em 07/08 (D8, decisão e execução do Gabriel).** Os 3 armados foram
> desarmados e `visit_availability` / `visit_pending_*` removidos, **com backup das 59 conversas
> antes** e preservando quem tem visita real — exatamente a opção (b) recomendada em D8 (lista
> revisada, não purge cego). **O incidente agudo está fechado.**
>
> **O que resta da W1-2a, e é menor do que era:** limpeza dos **~22 registros restantes**
> (majoritariamente fala da própria Nicole, sem data concreta — não armam INSERT, mas continuam
> entrando no contexto como se fossem disponibilidade do lead) e **a rotina de purge até a âncora
> existir** (O-7).
>
> **O item que sobra é de código, não de dado.** O purge não impede o estado de nascer de novo: a
> fonte (`extractCollectedData` sobre a fala dela) continua ativa e reenvenena no turno seguinte.
> **Isso é o W1-2b, e o desarme de 07/08 aumenta — não diminui — a urgência dele:** sem a âncora e
> sem o corte da derivação, em duas semanas estaremos purgando de novo, com o time acreditando que
> o problema foi resolvido em 07/08.
>
> 🔴 **E são DUAS fontes, não uma — a segunda é a maioria, e este epic a descrevia como caso de
> borda.** Medição do @po em 07/08 (`po-validation-87-3-87-4-87-5.md` §2.1, correção C1): dos **56**
> estados com resíduo de agenda, **39 (70%) têm o cron `enrich-leads` como ÚLTIMO ESCRITOR** —
> `conversation_state.updated_at` a menos de **1 segundo** de `conversations.last_enriched_at`. Não
> foi turno de conversa que escreveu aquilo; foi o **Haiku do cron**, fora do `processMessage`
> (`haiku-enrichment.ts:31` → `enrich-leads/route.ts:150`), fazendo merge direto no
> `collected_data`. **A leitura que muda:** a §1 e o CR-4 contam a história do envenenamento como se
> ele fosse todo do pipeline (`extractCollectedData` sobre a fala da Nicole). É verdade para o caso
> Sandra e é **minoria** no agregado. **Consequência prática, e ela não é teórica:** um `W1-2b` que
> conserte só a esteira do `processMessage` deixa **70% da reposição intocada** — a âncora entra,
> o cron continua escrevendo texto livre sem procedência por cima, e o item é declarado pronto com o
> defeito vivo. É por isso que a `87-4` carrega **AC8-b** e **T5-b** para o cron, e por isso a AC8
> não pode ser lida como *"o contador global chega a zero"* (ele **decai** nos estados dormentes e
> **oscila** nos ativos): a leitura correta é a da AC8-b-(iii) — *"nada tocado depois do deploy volta
> a ter a chave"*. **Escritor externo não é caso de borda deste item; é a maioria dele.**
>
> **Defeito determinístico da mesma raiz, que a story precisa cobrir (evidência: Valnira, 03/08
> 23:57):** o lead pediu *"semana de manhã"* e o pré-fetch ofereceu **três sábados**. Causa em
> `visit-slot.ts:363-381` — a guarda de período da 75-268 foi aplicada ao caminho
> `visitAvailability` e **não** ao caminho `pendingDay`, que é justamente o campo que o pipeline
> escreve sozinho, sem guarda de ambiguidade nenhuma. **A 75-268 corrigiu metade do bug que ela
> mesma nomeia.** Não é item novo: é o mesmo estado sem âncora, sem TTL e sem procedência — e é o
> lado que o Epic 88 preserva intocado, então nenhuma tool o alcança.

**W1-3a — o `Depende de` órfão, fechado em 07/08: EXECUTAR, não dispensar.** O @po achou o furo ao
validar a `87-4` (`po-validation-87-3-87-4-87-5.md` §2.2): o `W1-2b` declara `Depende de: W1-2a +
W1-3a`; o `W1-2a` foi executado pelo Gabriel em 07/08 **e ficou registrado**, e o `W1-3a` **sumiu da
conversa** — sem execução, sem dispensa, sem menção. Um bloqueador que ninguém fechou e ninguém
dispensou não é um bloqueador: é uma dependência que só reaparece no retrospecto, no dia de subir.

**Tamanho real, medido em produção (@po, 07/08 22h UTC):**

```
leads com ai_summary                                    224
… cujo resumo AFIRMA agendamento                          8
… desses, com appointment de verdade (resumo correto)     7
… sem appointment nenhum  →  Marilda                      1   ← o W1-3a inteiro
```

> **Decisão (@pm, 07/08): executar. A dispensa estava disponível e é a escolha errada.** Dispensar
> custaria zero hoje e deixaria a **M5** (*"0 dos resumos afirmando agendamento sem `appointment`"*)
> **violada por construção no dia em que o epic fosse declarado fechado** — um critério de sucesso
> derrubado para poupar **um `UPDATE` de uma linha, sem deploy**. Pior que o número: o resumo da
> Marilda continua entrando no contexto dela a cada turno (**CR-3**), e o `ai_summary` é o caminho
> ativo enquanto L1/L2/L3 estão vazios. É literalmente o loop da §1 rodando, com um caso conhecido e
> nomeado.
>
> **Como este item fecha** — mesmo padrão do `W1-2a`, e é a única forma de o `Depende de` do
> `W1-2b` sair do caminho: @data-engineer executa, **com o valor anterior salvo** (R-B) e a linha
> revisada por humano antes — nunca por query cega —, e **o registro volta para cá, com data e
> executor**. Enquanto esse registro não existir, a story `87-4` está `Ready` mas **não
> desbloqueada**. Operacionalmente é a **T0-a** da `87-4`.
>
> **O que este item NÃO é:** os **7** resumos legítimos usam data **relativa** (*"visita agendada
> para amanhã (sexta-feira às 15h)"*) — é o mesmo defeito de âncora do `W1-2b`, em prosa, e o
> conserto dele é o **`W1-3b`**. Não ampliar o escopo aqui: 1 linha é 1 linha.
>
> **Lado cliente:** a Marilda entra na lista da **D8** (*cliente continua aberto*) — ela pode
> acreditar que tem visita marcada. Apagar o resumo remove o dano ao sistema, não o dano a ela.

**W1-2c — item novo (@architect, 07/08 §2.5), e é o mesmo defeito com o sinal invertido.** A
máquina de estados **lê o interlocutor errado nas duas direções**: transcreve a **Nicole** onde
deveria transcrever o **lead** (caso Sandra, tratado no W1-2b) e é **surda** onde deveria registrar
a Nicole. Quando o pipeline oferece horários ou autoriza um slot, nada é persistido —
`authorizedSlotUtc` é variável local e **morre no fim do turno**. Consequência medida:

```
[04/08 00:10] Valnira
  NICOLE : "a quinta-feira às 10h está confirmada para você! Anota o endereço…"
  LEAD   : "Ok"                    → parser: dia=—  hora=—   (o estado não tem nada)
  NICOLE : "Ótimo! Só para confirmar — qual horário na quinta-feira fica melhor pra você?"
```

**6 ocorrências em 60 dias** dessa classe (Valnira, Idalina, Sueli-aceite). Custo: ~30 linhas, zero
chamadas de modelo, zero latência, determinístico. **Duas consequências fora deste item:** (i) é o
que permite o "Ok" resolver sem modelo nenhum; (ii) **o gatilho turn-local do Epic 88 (§4.1) fica
cego exatamente nestes turnos** — "Ok" não tem expressão temporal, então o `tool_choice` forçado não
dispara justamente nos casos que aquele epic promete fechar. Por isso o W1-2c é **habilitante do
Epic 88**, e o @architect o registra como pré-requisito nos dois caminhos possíveis.

> ### 🔨 O `W1-2c` foi DIVIDIDO em 07/08 — escrita aqui, leitura na Onda 3 (`W3-2e`)
>
> Arbitragem do @po (`docs/qa/po-validation-87-3-87-4.md` §3), a partir de um apontamento do @sm.
> As duas metades têm naturezas opostas:
>
> | Metade | O que é | Onda | Por quê |
> |---|---|---|---|
> | **ESCRITA** — `W1-2c` | Persistir `ofertas_do_sistema` e `afirmado_pela_nicole` com data absoluta | **1** | **Subtração de cegueira.** Nada passa a decidir nada; o sistema só para de jogar fora o que já calculou. Cabe na regra de corte |
> | **LEITURA** — `W3-2e` | O `"Ok"` do lead **resolver** um slot concreto contra a oferta registrada | **3** | **Caminho de decisão novo, sem margem:** o `"Ok"` passaria a poder criar `appointment` **sem o lead ter dito dia nem hora em turno nenhum** — que é a classe de incidente que este epic existe para fechar. Hoje o sistema pergunta de novo (medido: Valnira, 04/08 00:10) |
>
> **A confiabilidade das duas escritas não é a mesma, e isso decide o que a Onda 3 pode ler:**
>
> | Campo | Origem | Confiança | Uso permitido |
> |---|---|---|---|
> | **`ofertas_do_sistema`** | `authorizedSlotUtc` / `freeSlotsInPeriod` — **o sistema calculou** | **Alta** — é o mesmo valor determinístico que hoje morre no fim do turno | Escrito aqui; **é este que o `W3-2e` lê** |
> | **`afirmado_pela_nicole`** | `detectAffirmedSlot` — **parseado da prosa dela** | **~79%** (21% são perguntas e ofertas, não afirmações) | Escrito aqui como **observabilidade write-only, rotulado não-confiável**. **Nunca** é insumo de decisão até a guarda de interrogação do Epic 88 (`88-13`) subir |
>
> **A condição nº 4 do @architect é atendida em DUAS ondas — e não há contradição a arbitrar.** O
> texto dele é *"o estado registrar oferta e afirmação com data absoluta, com teste em que o lead
> responde 'Ok' a uma oferta e o slot resolve sem chamar modelo nenhum"*. É condição de **aceite do
> epic inteiro**; ela **não atribui onda**. A atribuição é deste epic, e por omissão ele nunca a
> fez: a escrita fica no `W1-2c` (Onda 1) e o teste do `"Ok"` no `W3-2e` (Onda 3). **Nada do
> @architect está sendo revogado** — o @sm achou uma lacuna, não um conflito.
>
> ⚠️ **E isto NÃO atrasa o Epic 88.** O item `88-7` depende da metade de **escrita** (basta o gatilho
> saber que **existe oferta viva**; quem resolve o slot é a tool). Ver `Epic 88 · §4.1`. **Não
> "restaure" a leitura para a Onda 1 citando urgência do Epic 88** — não desbloqueia nada lá e hoje
> seria alimentada por um sinal com 21% de erro.

**W1-6 — item novo (@architect, 07/08 §2.5), XS, e derruba uma premissa dos dois epics.**
`buildSystemPrompt` faz `convoLines.push(\`Data collected so far: ${JSON.stringify(state.collected_data)}\`)`:
o `collected_data` inteiro vai ao modelo como **JSON cru, sem instrução nenhuma**. Então o
`visit_availability` envenenado chega **duas vezes** — uma no bloco `[SISTEMA]` (com regras de
leitura) e outra solta. **Enquanto essa linha existir, tratar o `[SISTEMA]` como "fonte única de
fatos autorizados" é ficção** — e isso vale para o W3-1 daqui e para o desenho do Epic 88. Cabe na
regra de corte da Onda 1: remove uma fonte de mentira **sem** adicionar caminho de decisão.

**W1-7 🆕 — item novo (decisão do Gabriel, 07/08, com dado medido pelo @po), e ele fecha o buraco de
leitura que o `W1-1` deixou aberto.** A fala do corretor **é gravada** desde a migration 001
(`messages.role='broker'`) e é o **maior volume dos três interlocutores** — **882 mensagens em 287
conversas** em 30 dias, contra 867 do lead (181 conversas) e 612 da Nicole (136). **E dois leitores a
descartam com o mesmo filtro:** `loadConversationHistory` (`pipeline.ts:1543`) e o cron
`enrich-leads` (`route.ts:66`), ambos com `.in("role", ["user","assistant"])`.

**Dano medido:** **9 conversas** em que o corretor falou e a Nicole voltou a responder depois —
**31 respostas dela cegas para a negociação já em curso**. É o cenário de reativação, o mais caro
que existe.

> **A decisão do Gabriel: entram COM RÓTULO DE PAPEL, não fundidas na fala dela.** O motivo é
> concreto e tem caso: o corretor pode dizer valor fechado que a Nicole não pode repetir — o **Odair
> falou "entrada de 35 mil"** na conversa da Sandra. Sem rótulo, a Nicole leria isso como fala
> própria e o repetiria; é a mesma classe de defeito do `is_transition` (fala humana gravada como
> `role='assistant'`), só que com 882 mensagens em vez de 104.

**Por que depois do `W1-1`, e o argumento é técnico e não de fila** (@sm, endossado): com a janela de
**cabeça-20** de hoje, acrescentar ~3 mensagens de corretor por conversa **come o orçamento** e
empurra para fora as mensagens recentes, que já eram poucas. Com o `W1-1` em produção o histórico é
**cauda-20**, e *"as últimas 20 falas de quem quer que seja"* é a janela coerente quando existem
**três** interlocutores. **Esta story fica estritamente melhor depois do `W1-1`, e o `W1-1` fica
estritamente mais simples antes dela.** O `lastAssistantMsg` se resolve **ordenando, não fundindo**:
um deploy por variável — o `W1-1` muda a **janela**, o `W1-7` muda o **papel**, cada um com seu teste.

> ### Condição de escape — **denominador declarado, medida e RESOLVIDA em 07/08**
>
> A redação original (*"menos de 10% das conversas ativas passam de 20 mensagens"*) tinha o limiar
> certo e **nenhum denominador**. O @po mediu as quatro leituras que ela admite, contra 30 dias de
> produção (`po-validation-87-3-87-4-87-5.md` §3.3):
>
> | população | convs | > 20 msgs | % | escape dispararia? |
> |---|---|---|---|---|
> | todas com atividade | 338 | 30 | 8,9% | ✅ sim |
> | só as que têm corretor | 286 | 24 | 8,4% | ✅ sim |
> | só as que têm Nicole ativa | 136 | 23 | 16,9% | ❌ não |
> | **Nicole E corretor — a população que a story muda** | **85** | **17** | **20,0%** | ❌ **não, com folga** |
>
> **O denominador correto é o da última linha, e ele fica declarado aqui:** *conversas com pelo
> menos uma mensagem `role='assistant'` **e** pelo menos uma `role='broker'` nos últimos 30 dias*.
> A razão é mecânica, não de gosto: a **janela de 20 só é disputada onde existem os dois
> interlocutores**. Nas 253 conversas sem Nicole ativa o `limit(20)` não é lido por ninguém —
> incluí-las no denominador é diluir a pressão da janela com conversas em que ela não existe.
>
> **Resultado: 20,0% — o dobro do limiar. O escape NÃO dispara, e a ordem `W1-7` depois do `W1-1`
> fica confirmada por número, não só pelo argumento técnico do parágrafo anterior.** Os dois se
> sustentam sozinhos e agora apontam para o mesmo lado. Reabrir a ordem exige **remedir** esta
> população e publicar o número, não reinterpretar o percentual.
>
> Se algum dia a medição cair abaixo de 10% **neste** denominador, o escape volta a valer com as
> condições originais: o `W1-7` sobe **sozinho** e a story do `W1-1` recebe a AC de que o referente
> do `lastAssistantMsg` já está blindado por ele.
>
> ⚠️ **Regra que este epic passa a seguir, e ela nasceu de errar aqui:** *régua percentual sem
> denominador declarado responde o que quiserem perguntar.* Foi a **mesma classe de defeito** que
> derrubou a régua da `87-3` (4 denominadores possíveis lá, 4 aqui) — e, sem esta correção, **o epic
> autorizaria por escrito exatamente o que a story proíbe, usando o mesmo número.** Toda régua
> numérica deste epic declara **unidade e denominador** junto com o limiar.

**Por que cabe na Onda 1 — e a condição é a espinha da story.** O rótulo em si é **subtração**:
devolve contexto que já está no banco e **remove** a ambiguidade de autoria que hoje existe. Mas
**dois dos seis consumidores de `history` viram mudança de decisão se ficarem intocados** —
`lastAssistantMsg` (que alimenta o gate de agendamento) e `buildNoReintroContext`. **O item só é
Onda 1 porque fixa esses dois na direção RESTRITIVA** (menos coisas contam como fala da Nicole),
nunca permissiva. Daí o risco em dois eixos: **Médio de regressão** (muda o que a Nicole vê em 287
conversas) e **Baixo de comportamento novo** (nada novo é decidido; o que muda é o referente).

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
| **W3-2e** 🆕 | **LEITURA: o `"Ok"` do lead resolve contra `ofertas_do_sistema`** — a metade de leitura que saiu do `W1-2c` | **CR-4** — fecha a condição nº 4 do @architect (o `"Ok"` resolve sem chamar modelo nenhum) | S | **Baixo / Alto** | `W1-2c` (escrita) + **W3-1** + **guarda de interrogação do Epic 88 (`88-13`)** | @dev |
| **W3-3** | Ligar **fail-closed**: regenerar 1× → degradar para resposta segura / handoff | **CR-5, R3** | M | **Alto** (R-C) | **D4** + FP < 5% (M6) | @dev + @qa |

**W3-2b tem uma sutileza que a story precisa respeitar:** o pivô da Orlice para o Yarden foi
**leitura comercial correta** — ela disse que queria outra região e prazo maior. O que faltou foi a
mídia acompanhar (já corrigido) e o lead ter **pedido ou consentido**. A regra não pode ser "nunca
citar outro empreendimento", e sim "não apresentar outro empreendimento como oferta ativa sem que o
lead tenha sinalizado incompatibilidade com o atual". Regra mal calibrada aqui destrói uma
capacidade que funciona.

**W3-2e 🆕 — a metade de leitura do `W1-2c`, e ela está aqui por três razões, não por burocracia.**
(1) É **caminho de decisão novo**: o `"Ok"` passa a poder criar `appointment` sem o lead ter dito dia
nem hora em turno nenhum — a regra de corte da Onda 1 se aplica sem interpretação. (2) **Resolve
contra `ofertas_do_sistema` e NUNCA contra `afirmado_pela_nicole`** — e isso precisa estar escrito na
story com todas as letras: a segunda vem da `detectAffirmedSlot`, cuja precisão medida é **~79%**;
ligar a leitura sobre ela é deixar o `"Ok"` resolver contra um horário que a Nicole **nunca afirmou**
em ~1 de cada 5 casos. É também a letra da condição nº 4 do @architect, que diz *"o lead responde
'Ok' **a uma oferta**"* — não "a uma afirmação". (3) Por isso a **guarda de interrogação (`88-13`,
Epic 88)** entra como dependência: o próprio autor da condição nº 4 já tinha escrito o pré-requisito
na condição nº 7; ninguém tinha ligado as duas coisas.

**Risco em dois eixos, e é o caso didático da nova legenda:** ~30 linhas determinísticas dificilmente
quebram o que existe (**regressão Baixa**), e o comportamento novo é agendar a partir de um "Ok"
(**comportamento novo Alto**). Classificar só o primeiro eixo foi o que quase deixou este item passar
como "Baixo" na Onda 1.

**Não bloqueia o Epic 88.** O `88-7` depende da metade de **escrita**; ver `Epic 88 · §4.1`. O
`W3-2e` é o caminho determinístico equivalente — ele só faz falta no cenário em que a v1 do Epic 88
é dimensionada para baixo e a tool de escrita chega mais tarde.

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

> **A fronteira entre os dois epics é de SEQUENCIAMENTO, não de existência — corrigido em 07/08
> (Gabriel).** Este bloco dizia, até a v0.3: *"lastro ≥ 90% → a tool de escrita não se justifica;
> < 90% → o Epic 88 sobe como está escrito"*. **Essa redação condicionava arquitetura a estatística
> e está REVOGADA.** A formulação que vale (dona: `Epic 88 · §8.1`):
>
> 1. Executar primeiro as **correções determinísticas** (âncora e procedência do estado, guarda do
>    `pendingDay`, `isSlotFree` fail-closed, funil instrumentado, reconciliação diária fala × banco)
>    — a maior parte é Onda 1 e Onda 2 **deste** epic, mais os itens 88-1/88-3/88-4/88-13 do Epic 88,
>    que são higiene obrigatória mesmo que tool nenhuma exista. **Esta ordem continua valendo, e as
>    razões dela são técnicas:** tool sobre estado que mente escreve o erro com autoridade;
>    `tool_choice` forçado sobre gatilho envenenado **fabrica** o argumento e a citação; `isSlotFree`
>    devolve "livre" quando a query **falha**.
> 2. **Remedir o lastro** pelo instrumento do `W0-5`, com a definição da §3 (`created_by='nicole'` a
>    ±30 min **e** `created_at ≤ fala + 2 min`).
> 3. **O número remedido DIMENSIONA a v1 do Epic 88 — não decide se ela existe.** Lastro alto →
>    a v1 **encolhe** (menos tools, degraus de rollout mais lentos, shadow mais longo). Lastro baixo
>    → a v1 sobe no escopo escrito. **O Epic 88 acontece nos dois casos:** o argumento a favor da
>    tool é de desenho (hoje a fala confirma a visita e um código separado decide se grava — duas
>    autoridades sobre o mesmo fato), e desenho errado não fica certo por ser raro.
>
> ⚠️ **E o número ainda não está calibrado.** A régua da PM2, rodada como especificada contra 60 dias
> de produção, dá **7%** e não os 31% do baseline manual (@po, `po-validation-87-3-87-4.md` §1.4) —
> e o viés **subconta** lastro, isto é, apontava justamente para *"<90%"*. Recalibrar é a correção
> **B6** da Story 87-3. Enquanto ela não entrar, **nenhum número desta métrica autoriza nem veta
> decisão de arquitetura.**
>
> O que **não** muda: a Onda 0 do Epic 88 é higiene e está liberada agora (ver a regra de corte da
> Onda 2). E as condições técnicas de aceite do @architect (harness antes, uma autoridade de escrita
> só, remoção do ramo do parser no mesmo PR, gatilho turn-local, guarda de interrogação) continuam
> **todas** vigentes.

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
> W4-1 e da arbitragem @architect × @analyst. **O Epic 88 não está condicionado a nenhum número — o
> lastro remedido descrito na Onda 4 dimensiona o escopo da v1 dele, não a existência dela.**
> Decisão aberta em dois lugares é
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

### D8 — Remediação dos leads já contaminados — ✅ **DECIDIDA E EXECUTADA (07/08)** · lado cliente aberto

> **Dado: executado.** Gabriel desarmou em 07/08 os 3 estados que criariam `appointment` fantasma
> (Célia, Adriele, Wilson) e removeu `visit_availability` / `visit_pending_*`, **com backup das 59
> conversas antes** e preservando quem tem visita real — a opção **(b)** recomendada abaixo (lista
> revisada por humano), não o purge cego. Resta a limpeza dos ~22 registros restantes e a **rotina**
> de purge até a âncora existir (W1-2a), além do item de código que impede o renascimento (W1-2b).
>
> **Cliente: continua aberto.** Quem recebeu confirmação de visita que não existe ainda não foi
> contatado — e a auditoria do @po acrescentou um caso que ninguém tinha visto: **a Célia foi
> confirmada em 28/06 e nunca teve appointment; são 40+ dias.** É decisão comercial, não técnica.

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
W0-4 ─┤                     │
W0-5 ─┘ 🔴 reconciliação diária fala × banco — o instrumento do lastro
                            ▼
                [D1 decidida · D8 EXECUTADA 07/08:
                 3 estados armados desarmados, backup feito]
                            │
        ┌───────────────────┼────────────────────┐
        ▼                   │                    ▼
   W1-2a + W1-3a            │                 W1-4 (test-only,
   (SQL — resta ~22 +       │                  paralelo, sem deploy)
    rotina até a âncora;    │
    W1-3a = 1 lead,         │
    Marilda — EXECUTAR,     │
    registro volta ao epic) │
        │                   │
        ▼                   │
   W1-2b (deploy 1 — âncora + TTL + não deriva da fala dela)
        ▼                   │
   W1-2c (ESCRITA: registra oferta e afirmação) ──▶ habilita o 88-7
        ▼                   │      (a LEITURA do "Ok" é o W3-2e, Onda 3)
   W1-6  (collected_data sai do prompt como JSON cru)
        ▼ +24h              │
   W1-3b (deploy 2 — resumo)
        ▼ +24h              │
   W1-1  (deploy 3 — histórico = cauda; por último: raio desconhecido)
        ▼ +24h              │
   W1-7  (deploy 4 — histórico inclui o CORRETOR, rotulado)
        │                   │      ⤷ escape MEDIDO 07/08: 20,0% (17 de 85 convs com Nicole
        │                   │        E corretor, 30d) — o dobro do limiar ⇒ NÃO dispara.
        │                   │        Ordem "depois do W1-1" confirmada por número.
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
              │             │             │             │
              │        W3-2e ("Ok" resolve contra ofertas_do_sistema)
              │        ◀── requer W1-2c(escrita) + 88-13 (guarda de interrogação)
              └─────────────┴──────┬──────┴─────────────┘
                                   ▼  [D4 + M6 (FP<5%)]
                                W3-3 (fail-closed)
                                   │
                                   ▼
                     ══════════════════════════════════
                      REMEDIR O LASTRO (W0-5) — o número
                      DIMENSIONA a v1 do Epic 88:
                        alto  → v1 encolhe (menos tools,
                                rollout mais lento)
                        baixo → v1 no escopo escrito
                      ⚠️ NÃO decide se o Epic 88 existe
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
> hoje. O bloco "REMEDIR O LASTRO" **não é um gate de existência** — ele **dimensiona** a v1 do
> Epic 88 (quantas tools, qual escopo, que tamanho de degrau no rollout). O Epic 88 acontece de
> qualquer forma; o que o número muda é **quando e com que escopo**. E ele **não** bloqueia a Onda 0
> do 88, que é higiene obrigatória de qualquer forma.

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
| 2026-08-07 | 0.6 | **Edição cirúrgica: as três correções `P1`–`P3` pedidas pelo @po na validação de 87-3/87-4/87-5, mais dois fatos medidos que mudam decisão. Nenhum item novo, nenhuma onda reordenada, nenhuma story tocada.** **(P1) A condição de escape do `W1-7` ganha DENOMINADOR declarado, e o número resolve a ordem.** A redação *"<10% das conversas ativas"* admitia **quatro** denominadores, e o @po mediu os quatro: **8,4% · 8,9% · 16,9% · 20,0%** — **dois liberavam a story da fila e dois a mantinham**. O correto é *"conversas com ao menos uma mensagem `assistant` **e** uma `broker` nos últimos 30 dias"* — **a população que a story muda** —, porque a janela de 20 só é disputada onde existem os dois interlocutores; nas 253 conversas sem Nicole ativa o `limit(20)` não é lido por ninguém. **Medido: 20,0% (17 de 85), o dobro do limiar → o escape NÃO dispara e a ordem `W1-7` depois do `W1-1` fica confirmada por número**, e não só pelo argumento técnico da janela. Sem esta edição **o epic autorizava por escrito o que a story proíbe, com o mesmo número**. Corrigido também no diagrama da §9, e registrada a regra geral que o defeito produziu (é a mesma classe que derrubou a régua da `87-3`): **toda régua percentual deste epic declara unidade e denominador junto com o limiar.** **(P2) `W1-3a` — o único `Depende de` declarado do roadmap que ninguém executou nem dispensou — fechado: EXECUTAR.** O `W1-2b` declara `Depende de: W1-2a + W1-3a`; o `W1-2a` foi executado em 07/08 e ficou registrado, o `W1-3a` sumiu da conversa. Tamanho medido pelo @po: dos **224** leads com `ai_summary`, **8** afirmam agendamento, **7 têm `appointment` de verdade** e **1 não tem — a Marilda**. É **uma linha**, e por isso a dispensa foi recusada: dispensar deixaria a **M5** violada por construção no dia de declarar o epic fechado, para poupar um `UPDATE` sem deploy, com o resumo contaminado seguindo no contexto dela a cada turno (**CR-3** rodando com caso conhecido e nomeado). Item repontuado para **XS**, risco **Baixo** (R-B contido: linha revisada, não purge por query), com critério de fechamento igual ao do `W1-2a` — **o registro de execução volta para este epic, com data e executor**; até lá a `87-4` está `Ready` mas **não desbloqueada**. Os **7** resumos legítimos usam data relativa e são `W1-3b`, **não** ampliação daqui. Marilda entra na lista da **D8** (lado cliente, aberto). **(P3) `W0-5`: esforço `S` → `M`** na tabela da Onda 0 — a story `87-3` está em M desde a v0.2 e o roadmap seguia dizendo S. Não é inchaço de escopo: *"uma consulta e um cron"* continua sendo o desenho, mas **a parte cara é a régua**, que ganhou precedência normativa de quatro baldes, discriminador visita×ligação, janela bilateral de 15 min e publicação do número nas duas leituras. **Fato medido nº 1 — a C1 é maior do que este epic dizia:** dos **56** estados com resíduo, **39 (70%) têm o cron `enrich-leads` como ÚLTIMO ESCRITOR** (`updated_at` a < 1 s de `last_enriched_at`) — escrita do **Haiku, fora do `processMessage`**. A §1 e o CR-4 contam o envenenamento como se fosse todo do pipeline: é verdade para a Sandra e **minoria** no agregado. **Um `W1-2b` que conserte só a esteira do `processMessage` deixa 70% da reposição intocada e é declarado pronto com o defeito vivo** — daí a AC8-b/T5-b da `87-4` e a leitura da AC8 pela AC8-b-(iii), não pelo contador global. As duas fontes (`enrich-leads` e `haiku-enrichment.ts`) entraram no `related` do frontmatter, onde nunca estiveram. **Fato medido nº 2 — o fantasma do bolsão, registrado FORA daqui:** o fix da 75-286 corrigiu a **leitura** (o digest parou de contar), e `/assign`, `/handoff` e `/transferir` continuam **criando** o carimbo sujo — 14 avisos em 05/08, **2 em 06/08 depois da limpeza manual**; e o dano maior nunca foi o spam: **lead com carimbo sujo não é resgatado pelo cron** (`bolsao-rebalance:100` exige `bolsao_em IS NULL`) e perde a rede de segurança do bolsão — **antes o spam denunciava, agora o fantasma nasce em silêncio**. Vai para `docs/backlog.md` como **P1**, e **não** para este epic: roleta/distribuição está em `FORA DE ESCOPO` (§4) por raio de impacto próprio, e trazê-lo para cá seria reabrir escopo no meio da Onda 1. | @pm (Morgan) |
| 2026-08-07 | 0.5 | **Dois itens novos no roadmap e a divisão do `W1-2c` (edições `A1`–`A4` do @po, aplicadas).** **(1) `W1-7` 🆕 na Onda 1, deploy 4** — *"histórico passa a incluir a fala do CORRETOR, rotulada por papel"*, com `Depende de: W1-1 em prod`, Esforço **M**, Risco **Médio / Baixo**, `@dev`; `stories_planned` recebe `W1-7 → 87-5`. Decisão do Gabriel (07/08) contra dado medido pelo @po: `role='broker'` é o **maior volume dos três** (**882 mensagens em 287 conversas** em 30 dias, contra 612 da Nicole em 136) e **dois leitores o descartam** (`pipeline.ts:1543` e `enrich-leads:66`, mesmo `.in("role", ["user","assistant"])`), com dano medido de **31 respostas cegas** em 9 conversas de reativação. **Entram com RÓTULO DE PAPEL** porque o corretor pode falar valor fechado que a Nicole não pode repetir (o Odair falou *"entrada de 35 mil"* na conversa da Sandra). Ordem endossada do @sm — **depois do `W1-1`, por razão técnica**: com cabeça-20 o corretor come o orçamento do histórico; com cauda-20, *"as últimas 20 de quem quer que seja"* é a janela certa para três interlocutores. `lastAssistantMsg` se resolve **ordenando, não fundindo** (um deploy por variável: `W1-1` = janela, `W1-7` = papel), e fica registrada a **condição de escape medível** (<10% das conversas acima de 20 mensagens ⇒ pode ir antes, ainda sozinho). A recomendação anterior do @architect (*"continuar cega ao corretor"*) fica **superada** e a nota do `W1-1` repontada. **(2) `W1-2c` DIVIDIDO** — a Onda 1 fica com a **ESCRITA** (`ofertas_do_sistema`, `afirmado_pela_nicole`, este rotulado write-only e não-confiável a ~79%) e a **LEITURA** vira o **`W3-2e` 🆕 na Onda 3** (*"o `'Ok'` resolve contra `ofertas_do_sistema`"*, atrás do `W3-1` **e** da guarda de interrogação `88-13`), porque a leitura é caminho de decisão novo: o `"Ok"` poderia criar `appointment` sem o lead ter dito dia nem hora em turno nenhum. **(3)** Registrado que **a condição nº 4 do @architect é atendida em duas ondas e não atribui onda** — a atribuição é do epic, que a fazia por omissão; nada dele é revogado. **(4)** **Legenda de risco passa a ter dois eixos** (`regressão / comportamento novo`) nos itens que adicionam caminho de decisão — `W1-2c`, `W1-7`, `W3-2e`; foi por medirem eixos diferentes que @sm e @po classificaram o mesmo item de formas opostas, **os dois certos**. Diagrama §9 atualizado nos dois pontos. **Resolve o ponteiro quebrado** que o Epic 88 v0.3 sinalizou (`W3-2e` citado e inexistente). | @pm (Morgan) |
| 2026-08-07 | 0.4 | **Edição cirúrgica: o gate com o Epic 88 deixa de ser condição de existência e vira critério de sequenciamento e dimensionamento** (correção do Gabriel, aceita). A redação *"lastro ≥90% → a tool não se justifica; <90% → o Epic 88 sobe"* **condicionava arquitetura a estatística** e foi revogada em quatro lugares: o bloco do gate na **Onda 4**, o **diagrama da §9** (e sua leitura), o ponteiro do **`W0-5`** na Onda 0 e a nota da **`D3`**. Formulação nova, cuja dona é a `Epic 88 · §8.1`: **o Epic 88 acontece; o lastro remedido define escopo, ordem e tamanho dos degraus de rollout** — lastro alto **encolhe** a v1, não a cancela. **A ordem não mudou**, e as razões dela seguem técnicas e escritas: tool sobre estado que mente escreve o erro com autoridade, `tool_choice` forçado sobre gatilho envenenado **fabrica** argumento e citação, e `isSlotFree` devolve "livre" quando a query falha. Acrescentada à **§3** a procedência do baseline: o **`31%` é manual e o instrumento ainda não o reproduz — a régua rodada como especificada dá 7%** (@po, `po-validation-87-3-87-4.md` §1.4), com viés que **subconta** lastro, ou seja, apontava para o próprio lado *"<90%"*; recalibrar é a **B6** da Story 87-3 e, até lá, o número não arbitra decisão de arquitetura. **Nenhum item, onda, ordem ou story foi alterado.** As edições `A1`–`A4` do @po (§3.5 da mesma validação) ficaram fora desta passada por mexerem em roadmap — **aplicadas na v0.5**. | @pm (Morgan) |
| 2026-08-07 | 0.3 | **Segunda passada: D8 executada e os itens órfãos do Tier 1 do @architect ganharam dono.** **(a)** `W1-2a` atualizado — o **desarme dos 3 estados armados (Célia, Adriele, Wilson) foi executado pelo Gabriel em 07/08**, com backup das 59 conversas e preservando visitas reais; resta a limpeza de ~22 registros e a rotina até a âncora existir. Registrado que **o item que sobra é de código (W1-2b), não de dado** — sem cortar a fonte, purgamos de novo em duas semanas achando que estava resolvido. **(b)** Três itens que não tinham dono em epic nenhum entraram aqui, todos vindos do debate de 07/08: **`W0-5`** (🔴 reconciliação diária fala × banco — o maior ROI dos dois epics, o único que teria pego a Célia no dia seguinte em vez de 5 semanas, e o **instrumento que mede o lastro** do gate com o Epic 88); **`W1-2c`** (o estado passa a registrar oferta e afirmação do sistema — o outro sinal do mesmo defeito, e **habilitante do gatilho turn-local do Epic 88**, que hoje fica cego nos turnos "Ok"); **`W1-6`** (`collected_data` sai do system prompt como JSON cru — enquanto essa linha existir, "bloco `[SISTEMA]` como fonte única de fatos" é ficção nos dois epics). Os demais órfãos foram para o Epic 88 (`isSlotFree` fail-closed, UNIQUE parcial em `appointments`, guarda de interrogação no `detectAffirmedSlot`) e para `docs/backlog.md`. | @pm (Morgan) |
| 2026-08-07 | 0.2 | **Reconciliação do documento com o que já foi decidido e medido depois de 05/08.** O epic não era editado desde a criação e, por escrito, proibia o Epic 88 e apontava para itens inexistentes — três revisores independentes (@architect §8 do debate de 07/08, @po §2 da validação do Epic 88, @pm) chegaram à mesma lista. **Nenhum item novo foi inventado e nenhuma onda foi reordenada além da que o @architect reprovou.** O que mudou e por quê: **(1)** criado o **`W0-0`** (paridade `agent_prompts`, BLOQUEANTE, Onda 0) e `W2-4` marcado como movido — o item existia na validação do @architect e na story 87-0, e não no epic; **(2)** **`W4-1` removido**, substituído pelo **Epic 88**, e `W4-2`/`W4-3` repontados para "Epic 88 · Onda 3 concluída" (estavam órfãos); **(3)** **regra de corte da Onda 2 reescrita** — o princípio ("nada estrutural sem rede") é mantido e ganha a exceção explícita: Onda 0 do Epic 88 liberada, Onda 1+ atrás do 88-2, porque o harness de efeito colateral já veio na 75-279; **(4)** **`D6` revogada** em favor do **`D88-3`** (teto sobre `whatsapp_async_done`, baseline medido p95 = 12.469 ms, n=442) — havia dois tetos contraditórios em documentos ativos; **(5)** **`M10` vira ponteiro para `PM8`** — eram a mesma métrica com dois nomes; **(6)** **`D3` fechada** (decidida no Epic 88 §2); **(7)** **ordem da Onda 1 corrigida** para a que o @architect assinou (W1-2a+W1-3a → W1-2b → W1-3b → W1-1), com o racional medido (a conversa da Sandra tinha 14 mensagens: CR-1 não causou o incidente, e a cauda deixa o modo agendamento *mais* propenso a ligar); **(8)** `stories_planned` preenchido com o mapa item→story (87-0, 87-1, 87-2). **Fatos novos absorvidos:** F-7 morreu (prompts reconciliados em prod em 05/08 20:58 — o `W0-0` deixa de bloquear o Epic 88 e passa a bloquear só o 88-9); placar de incidentes auditado é **6 de 7** (Silvana sai — era ligação e ela aconteceu; entram Célia, Helena e Miriam), com a Célia invisível por 5 semanas; **baseline de lastro = 31%**, com a definição que impede a métrica de melhorar sozinha quando um humano conserta depois; o veto do @architect virou **critério numérico de entrada** (≥90% / <90%) e está escrito como o gate entre os dois epics; escala das minas vivas (59 estados, 46 com data que anda, **3 armados**) e o defeito determinístico do `pendingDay` ("semana de manhã" → três sábados), ambos ancorados no W1-2a/W1-2b; e a AC de prompt passa a se verificar **no banco**, sob a D-87-0-a. | @pm (Morgan) |
