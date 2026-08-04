# Story 75-265 — Abertura automática de WhatsApp para lead de formulário Meta

**Epic:** 75 (CRM Trifold) · **Status:** Draft
**Criada por:** @sm (River) em 2026-08-04
**Formato:** Automação de primeiro toque + trilho de mensuração (SLA/follow-up/Nicole)
**Origem:** desdobramento direto do achado da 75-264 ("não conseguimos falar" = maior grupo de perda)

---

## Story

**Como** quem paga por lead de formulário Meta e cobra o time comercial pelo atendimento,
**Quero** que todo lead de formulário, ao ser distribuído a um corretor, receba automaticamente o
template de abertura de WhatsApp — do número da empresa, em nome do corretor,
**Para que** a conversa exista DENTRO do CRM desde o minuto zero: o lead entra no SLA e no
follow-up mensuráveis, a Nicole assume quando ele responde, e "não atende ligações do celular
pessoal do corretor" deixa de ser o destino de 42% das perdas.

---

## Context — o número que motivou a story

Medido HOJE (04/08) em produção, via `v_lead_lost_reason_grupo` (a view que a 75-264 entregou —
este é exatamente o tipo de pergunta que ela nasceu para responder):

| métrica (Meta, 90 dias) | valor |
|---|---|
| Leads | 1.009 |
| Perdidos | 685 |
| **Maior grupo de perda: "não conseguimos falar"** | **291 (42,5% dos perdidos)** |
| Desses 291, vindos de FORMULÁRIO (`source='meta_ads'`) | 267 |
| **Dos 267, NUNCA tiveram uma conversa de WhatsApp aberta no CRM** | **247 (92%)** |
| Sem carimbo de 1º atendimento E sem nenhuma mensagem de corretor | 208 |
| Dos 291, falaram com a Nicole | só 24 (essencialmente os CTWA, que chegam já conversando) |

**O contraste que entrega o diagnóstico:** lead CTWA (clique → WhatsApp) tem **100% de conversa**
e mediana de **17min** de 1º atendimento. Lead de formulário chega como nome+telefone num card —
e o corretor tenta por **ligação do celular pessoal** (os textos de `lost_reason` dizem "não
atende ligações"). Essa tentativa é invisível ao CRM, ao SLA e ao follow-up. Não é (só) preguiça:
é canal errado + esforço não instrumentado.

Por corretor (perdidos-sem-falar ÷ carteira): Robson 47%, Matheus 43%, Valeria 33% (mediana 7h
quando atende), Elisabete 32% — mas **0 sem atendimento e mediana 16min**. Ou seja: quem abre a
conversa cedo, fala. O sistema deve abrir a conversa por todos.

**A tese:** o lead de formulário deve nascer como o CTWA vive — com uma conversa de WhatsApp
aberta no CRM. O template de abertura já existe (75-142/217/225), o corretor só precisa deixar de
ser o gargalo do primeiro toque.

---

## Os cinco itens

### Item 1 — o gancho pós-distribuição (um ponto, todos os caminhos)

O disparo acontece **dentro de `distributeLeadToNextBroker`**, imediatamente após a distribuição
bem-sucedida — nos DOIS retornos `status: "distributed"`:

- caminho `priorizar_lead_ativo` (`lib/roleta/distributor.ts:203`);
- caminho normal via RPC `roleta_pick_and_advance` (`lib/roleta/distributor.ts:333`).

Assim TODOS os caminhos que distribuem ficam cobertos sem duplicação de código:

| caminho | arquivo:linha |
|---|---|
| Webhook Meta (form) | `lib/meta/process-lead.ts:315` (chamado por `webhooks/meta-ads/route.ts:102`) |
| Cron retry 15min do webhook | `cron/meta-leads-retry/route.ts:90` → mesmo `processMetaLead` |
| Roleta pós-conversa (idle 5min) | `cron/roleta-retry/route.ts:150` |
| Landing page | `webhooks/landing-page/route.ts:198` |
| Distribuição manual | `roleta/distribute/route.ts:21` |
| Reativação | `leads/[id]/reativar/route.ts:162` |
| Ação em massa (voltar à roleta) | `leads/bulk/route.ts:103` |

O **bolsão pull** (`bolsao/[id]/pegar/route.ts:29`, RPC `pegar_lead_bolsao`) NÃO passa pelo
distributor — e não precisa: para chegar ao bolsão o lead já foi distribuído uma vez, logo o
disparo já aconteceu (ou já foi barrado pelos guards). O dedupe do item 4 fecha essa porta.

**✅ DECIDIDO (Marcos, 04/08 — D3):** o disparo vale **uma única vez por lead** (a 1ª
distribuição). Redistribuição — bolsão pull, reativação, voltar-à-roleta em massa — NÃO
re-dispara: repetir o mesmo template vira spam e queima o número. Re-engajamento de quem não
respondeu fica para story própria, com a taxa de resposta desta na mão.

O envio é **fire-and-forget com try/catch** (fail-open): nenhum erro do disparo pode quebrar ou
atrasar a distribuição — mesmo padrão do `notifyImobiliaria` (`distributor.ts:192-201`).

### Item 2 — o envio reusa o pipeline do "Iniciar atendimento", não o duplica

O caminho manual já resolve tudo (Story 75-142/217): validação contra a Meta (só template
APROVADO sai), corpo real para o espelho, variáveis, envio, log. A story **extrai um helper**
(ex.: `lib/whatsapp/send-opening-template.ts`) do miolo de
`app/api/leads/[id]/start-whatsapp/route.ts:49-101` para que rota manual e disparo automático
compartilhem a MESMA lógica — e não uma cópia que desatualiza (lição da 75-166):

- Mapa de templates: `OPENING_TEMPLATE_PARAMS` em `lib/whatsapp/opening-templates.ts:9-17`
  (4 templates hoje: `abertura_atendimento_corretor` [nome+corretor+empreendimento],
  `abertura_interesse_prioridades`, `abertura_interesse_status`, `abertura_basica` [só nome]).
- Validação/corpo real: `listApprovedOpeningTemplates` (`opening-templates.ts:59`).
- Variáveis: `resolveOpeningParams` + `renderOpeningBody` (`opening-templates.ts:32,48`).
- Envio Graph API: `sendWhatsAppTemplate` (`lib/whatsapp/send-template.ts:10`).
- Contexto (nome do lead, empreendimento com fallback "que você procura", credenciais):
  `loadOpeningContext` (`lib/whatsapp/opening-context.ts:22`) — ATENÇÃO: ele recebe `appUser`
  (usuário logado). O disparo automático roda em contexto de sistema; o helper precisa aceitar
  o **corretor sorteado** (`brokerUserId` retornado pelo distributor) como "quem assina" — a
  75-164 nomeia quem assumiu (`opening-context.ts:49-50`); aqui quem assume É o corretor sorteado.
- Log de envio: `logWhatsappSend` (padrão de `start-whatsapp/route.ts:76-80`).

**✅ DECIDIDO (Marcos, 04/08 — D2): template NOVO, específico para lead de formulário.**
O texto deve reconhecer a origem (ex.: "recebemos seu cadastro no anúncio do {empreendimento}"),
apresentar o corretor pelo nome e citar o empreendimento (via `property_interest_id`, que o
webhook Meta já detecta — `process-lead.ts:198-205` — com fallback quando não detectado).
**Pré-requisito de deploy (CONVENÇÃO 75-242):** criar `abertura_formulario_v1` via Graph API,
aguardar APPROVED (~9min) e registrar 1 linha no mapa (`opening-templates.ts:9`). Sequência:
@dev redige a copy → **Marcos aprova o texto** → cria na Meta → APPROVED → deploy. Nunca editar
template aprovado. Fallback de segurança: se `abertura_formulario_v1` não estiver APPROVED em
runtime, o disparo NÃO sai (fail-open, guard 5) — jamais cair para outro template silenciosamente.

### Item 3 — a conversa nasce, e a Nicole fica de plantão (SEM handoff)

Aqui o disparo automático **diverge de propósito** do manual:

- **Manual** (`start-whatsapp/route.ts:110-115`): o corretor assumiu → desliga a Nicole
  (`is_ai_active: false`, `handoff_reason: 'broker_reply'`). Correto: um humano clicou.
- **Automático**: NINGUÉM assumiu. A conversa é criada com **`is_ai_active: true`** (mesmo
  default do webhook, `webhook/whatsapp/route.ts:1207`) e **NÃO faz handoff**. Quando o lead
  responde, o webhook vê `is_ai_active=true` e a Nicole atende (`route.ts:758,799`) — ela é a
  SDR IA, e é exatamente o comportamento que dá 100% de conversa ao CTWA.

Isso respeita as duas regras existentes:
- **"Nicole nunca se cala sozinha"** — nunca a desligamos; não há handoff sem humano agindo.
- **Roleta pós-conversa não redistribui**: o lead JÁ tem dono. O guard do distributor
  (`distributor.ts:87`, `assigned_broker_id !== null` → não redistribui) e o filtro do cron
  (`roleta-retry/route.ts:52`, `.is("assigned_broker_id", null)`) garantem que a resposta do
  lead ao template jamais devolve o lead à roleta.

A mensagem espelhada no histórico: `role='broker'`, `content` = corpo REAL renderizado
(`renderOpeningBody`), `metadata: { template, automated: true, sent_by: <brokerUserId>, channel:
'whatsapp' }` — o `automated: true` é o que separa, para sempre, "corretor falou" de "sistema
abriu" em qualquer métrica futura. **CONVENÇÃO: nunca inserir `org_id` em `messages`**
(`start-whatsapp/route.ts:104-109` já obedece). A assinatura de remetente humano
(`lib/broker/message-signature.ts:7-9`) **explicitamente exclui template de abertura** — nada a
fazer: o nome do corretor já vai como variável do corpo do template.

⚠️ `@dev` deve conferir `lib/broker/broker-takeover-status.ts` e a âncora de reativação do
webhook (`route.ts:759-793`): ambos leem "última msg `role='broker'`", mas só quando
`is_ai_active=false` — como o disparo não faz handoff, não há conflito; confirmar com teste.

### Item 4 — guards e idempotência (a parte que não pode dar errado)

Na ordem, ANTES de qualquer envio:

1. **Só `source='meta_ads'`** (formulário). CTWA é `source='whatsapp_click_to_ad'`
   (`lib/constants.ts:15-16`) e já chega conversando — intocado. Landing page, manual, etc.:
   fora (fora de escopo desta story).
2. **Só se NÃO existe conversa do lead** (qualquer status, não só `active`): se o lead já falou
   conosco alguma vez, o template de abertura é redundante/estranho.
3. **Disparo ÚNICO por lead — claim atômico**: coluna nova `leads.abertura_automatica_em`
   (timestamptz) reivindicada com
   `.update({...}).eq("id", leadId).is("abertura_automatica_em", null).select()` — mesmo padrão
   do claim de distribuição (`distributor.ts:160-164`). Retry do webhook e cron 15min já não
   duplicam LEAD (dedupe por `leadgen_id`, `process-lead.ts:109-119`, que nem chama o distributor
   no caminho dedupe); o claim fecha corrida entre execuções concorrentes do distributor.
4. **Lead Perdido = TERMINAL**: já garantido ANTES do gancho — o distributor retorna em
   `distributor.ts:110-112` sem distribuir; o gancho só roda após `distributed`.
5. **Telefone inválido → fail-open com log**: `toWhatsAppNumber` falhou / config ausente /
   template não aprovado → grava `logWhatsappSend(status: 'failed')` + `console.error` e a
   distribuição CONCLUI normalmente. O corretor foi notificado como sempre
   (`notifyBroker`) e segue o fluxo manual de hoje.
6. **✅ DECIDIDO (Marcos, 04/08 — D1): disparar junto com a distribuição, sem gate extra de
   horário.** A roleta normal só distribui dentro do horário comercial (`distributor.ts:216`),
   então o disparo herda o horário. Exceção teórica: o caminho `priorizar_lead_ativo` distribui
   independente de horário (`distributor.ts:114-117`) — mas nesse caminho o telefone já tem lead
   ativo com corretor, quase sempre COM conversa → guard 2 barra.

### Item 5 — o disparo não pode maquiar a métrica que o motivou

O carimbo de 1º atendimento é por MUDANÇA DE ETAPA — trigger `stamp_primeiro_atendimento`
(migs 112/192) carimba na saída da etapa `novo` (`192_stamp_primeiro_atendimento_ignora_sdr.sql:35-39`).
O disparo automático **não mexe em etapa** → não carimba. É requisito, não acaso:

- **SLA continua cobrando o corretor**: `cron/sla-alerts` filtra `stage_id=novo` +
  `primeiro_atendimento_em IS NULL` (`sla-alerts/route.ts:161-162`) — o lead com template
  enviado e corretor inerte continua alarmando.
- **Bolsão continua funcionando**: mesmos critérios (`bolsao-rebalance/route.ts:91-103`) — 15min
  sem atendimento REAL e o lead vai pro bolsão, template ou não.
- **Relatório do diretor** (tempo de atendimento = `primeiro_atendimento_em`) intocado.

Efeito colateral consciente: o INSERT em `messages` avança `leads.last_contact_at`
(trigger da mig `152_leads_last_contact_at.sql:20-36`, qualquer role) → o "dias sem contato" e a
régua do follow-up (`cron/followup/route.ts:276`) passam a contar a partir do template. É
semanticamente correto (um contato ACONTECEU — e é justamente o que põe o lead no trilho do
follow-up, que hoje o ignora por não ter conversa), mas fica documentado.

Observabilidade: registrar `activity` tipo `abertura_automatica` no lead (padrão
`process-lead.ts:327-342`) + `logWhatsappSend`. É o que permite medir em 30 dias: % de leads de
formulário com conversa (hoje 8%), taxa de resposta ao template, e o grupo "não conseguimos
falar" na `v_lead_lost_reason_grupo` (hoje 42,5%).

---

## Acceptance Criteria

- [ ] **AC0 — pré-requisito** — template `abertura_formulario_v1` criado na Meta e APPROVED,
      com texto aprovado pelo Marcos, registrado no mapa `OPENING_TEMPLATE_PARAMS`; enquanto não
      APPROVED, o disparo não sai (e loga `failed`), sem cair para outro template.
- [ ] **AC1** — lead novo com `source='meta_ads'` distribuído a um corretor (qualquer caminho que
      passe pelo distributor) recebe o template de abertura automaticamente: mensagem sai do
      número da empresa em nome do corretor sorteado, conversa criada no CRM com o corpo real
      espelhado (`role='broker'`, `metadata.automated=true`, SEM `org_id` em messages).
- [ ] **AC2** — guards comprovados por teste: NÃO dispara se já existe conversa do lead; NÃO
      dispara para `source ≠ 'meta_ads'`; disparo único por lead (claim atômico) — reprocessar o
      mesmo evento do webhook, rodar o cron de retry e redistribuir o lead não geram 2º envio.
- [ ] **AC3** — a conversa nasce com `is_ai_active=true` e sem handoff; quando o lead responde,
      a Nicole atende (verificar ponta-a-ponta) e o corretor é notificado da resposta.
- [ ] **AC4 — sem regressão (SLA)** — o disparo NÃO carimba `primeiro_atendimento_em` e NÃO muda
      a etapa do lead: após o envio, o lead segue em "Aguardando atendimento", o cron `sla-alerts`
      ainda o vê como não atendido e o `bolsao-rebalance` ainda o move após 15min sem atendimento
      real.
- [ ] **AC5 — sem regressão (roleta)** — a resposta do lead ao template não redistribui nem
      devolve o lead à roleta (`assigned_broker_id` preservado); lead em Perdido nunca recebe
      disparo.
- [ ] **AC6 — sem regressão (CTWA e manual)** — lead `whatsapp_click_to_ad` segue o fluxo atual
      sem nenhum disparo; o botão manual "Iniciar atendimento" continua funcionando idêntico
      (inclusive o handoff que desliga a Nicole).
- [ ] **AC7 — fail-open** — telefone inválido, `whatsapp_config` ausente ou template não aprovado:
      o envio falha COM log (`logWhatsappSend status='failed'`) e a distribuição conclui
      normalmente (corretor atribuído e notificado).
- [ ] **AC8** — rastro auditável: `activity` `abertura_automatica` no lead + linha em
      `whatsapp_send_log`; dá para responder "quantos disparos, quantas respostas" com uma query
      (registrar a query no PR).

---

## Dev Notes

- 🔴 **Ponto do gancho:** os DOIS retornos `distributed` de `distributeLeadToNextBroker`
  (`packages/web/src/lib/roleta/distributor.ts:203` e `:333`). Fire-and-forget + try/catch;
  jamais `await` que atrase/derrube a distribuição.
- 🔴 **NÃO carimbar 1º atendimento**: o trigger (`supabase/migrations/192_...sql:35-39`) é por
  saída da etapa `novo` — basta o disparo não tocar em `stage_id`. Qualquer tentação de "mover o
  lead porque já foi contatado" mata o SLA e o relatório do diretor (é o incidente 75-213 de novo).
- 🔴 **Sem handoff**: diferente do manual (`start-whatsapp/route.ts:110-115`). A Nicole fica
  ativa; ela é quem responde. Regra "Nicole nunca se cala sozinha" e reativação 24h
  (`webhook/whatsapp/route.ts:748-793`) não são acionadas porque `is_ai_active` nunca vai a false.
- **Reuso, não cópia:** extrair helper do miolo de `start-whatsapp/route.ts:49-101`;
  `loadOpeningContext` (`lib/whatsapp/opening-context.ts:22`) precisa de variante que receba o
  corretor sorteado em vez de `appUser` (o nome dele entra como variável do template — 75-164).
- **CONVENÇÃO templates:** nunca editar aprovado; texto novo = `_v2`/novo nome via Graph API →
  APPROVED → 1 linha no mapa `OPENING_TEMPLATE_PARAMS` (`lib/whatsapp/opening-templates.ts:9`).
- **CONVENÇÃO messages:** nunca inserir `org_id`; assinatura humana
  (`lib/broker/message-signature.ts`) não se aplica a template.
- **Claim atômico:** coluna `leads.abertura_automatica_em` + `.is(..., null)` no UPDATE (padrão
  `distributor.ts:160-164`). Migration idempotente, aplicar via Management API (nunca `db push`),
  replicar no dev.
- **Efeito em `last_contact_at`:** o espelho avança o relógio de "dias sem contato" (mig 152) —
  documentado como comportamento esperado no item 5.
- ⚠️ **Incoerência aceita:** se o lead cair no bolsão e outro corretor puxar, o template já saiu
  em nome do corretor original. Raro e de baixo dano (a Nicole conduz; o humano que assumir
  assina a próxima mensagem). Não tratar nesta story.

### ✅ Decisões do Marcos (04/08)

| # | Decisão | Resolução |
|---|---|---|
| D1 | Horário do disparo | Junto com a distribuição, sem gate extra (herda o horário comercial da roleta) |
| D2 | Template | **NOVO** — `abertura_formulario_v1`, específico p/ lead de formulário. Copy do @dev → aprovação do Marcos → criar na Meta → APPROVED **antes** do deploy. Sem fallback silencioso p/ outro template |
| D3 | Redistribuição re-dispara? | Não — disparo único por lead (1ª distribuição); re-engajamento = story futura |

---

## Fora de escopo

- **Nicole abordar lead de formulário diretamente, sem template** — impossível fora da janela de
  24h (a Meta exige HSM) e mudaria o contrato da Nicole (hoje ela só responde). Fica fora.
- **2º toque de follow-up** para quem não respondeu ao template (re-engajamento) — é a story
  seguinte, com o dado de taxa de resposta desta na mão.
- **Retroativo**: os 247 já perdidos não recebem template (spam em massa num número produtivo).
- **Leads de landing page / outras origens** — só `source='meta_ads'` nesta story.
- **Biblioteca de templates por empreendimento** — hoje o empreendimento é variável do template
  único; criar um template por empreendimento é decisão futura, se o texto genérico converter mal.

---

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-04 | 0.1 | Story criada a partir da medição de HOJE na `v_lead_lost_reason_grupo` (75-264): 247 dos 267 perdidos-sem-falar de formulário nunca tiveram conversa no CRM, contra 100% de conversa no CTWA. Desenho: gancho único no distributor (cobre todos os caminhos), reuso do pipeline do "Iniciar atendimento", conversa nasce com Nicole ativa e SEM handoff, claim atômico de disparo único, e o disparo proibido de carimbar 1º atendimento (senão mata SLA/bolsão/relatório). 3 decisões abertas para o Marcos (D1 horário, D2 template, D3 redistribuição). | @sm (River) |
| 2026-08-04 | 0.2 | Decisões do Marcos incorporadas: D1 disparo junto com a distribuição; D2 template NOVO `abertura_formulario_v1` (copy → aprovação → Meta APPROVED antes do deploy, sem fallback silencioso) → novo AC0; D3 disparo único por lead. | @sm (River) |
