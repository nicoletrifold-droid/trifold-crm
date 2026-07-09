---
epic: 78
title: Painel de Saúde & Billing da Plataforma — lembrar vencimentos, trazer custos e linkar billings
status: Draft
created_at: 2026-07-08
updated_at: 2026-07-08
created_by: Morgan (@pm)
priority: P1
tipo: Brownfield Enhancement (PRD-level, multi-story)
objetivo_negocio:
  - Nunca esquecer de pagar uma fatura de serviço/integração (lembretes antes do vencimento).
  - Enxergar o custo/gasto do mês de cada serviço num só lugar (automático onde a API permite; manual onde não permite).
  - Acessar em 1 clique o painel de billing de cada plataforma (deep-links).
  - Dar uma visão consolidada de "saúde financeira/operacional" das integrações (status por serviço + gasto agregado).
depends_on:
  - Nenhuma story bloqueante. Reusa infra existente (Supabase, cron Vercel, webhook Resend `/api/webhook/resend`).
related:
  - packages/web/src/app/api/webhook/resend/route.ts (contagem de envios Resend — sem API de billing)
  - packages/web/src/app/api/webhook/whatsapp/route.ts (contexto WhatsApp/Meta já integrado)
  - scripts/vercel-env-set.sh (provisionamento seguro de secrets no Vercel — GOTCHA env vazio via stdin)
  - Padrão de cron jobs existentes em packages/web/src/app/api/cron/*
stories_planned: [78-1, 78-2, 78-3, 78-4, 78-5, 78-6, 78-7, 78-8, 78-9, 78-10]
open_questions: [OQ-1 RESOLVED 2026-07-08 (WhatsApp cobrado direto pela Meta), OQ-2 RESOLVED 2026-07-08 (Meta Ads incluído como módulo separado)]
---

# Epic 78 — Painel de Saúde & Billing da Plataforma

## 1. Visão & Objetivo

Hoje os custos das integrações e serviços (IA, hospedagem, mensageria, e-mail, banco) estão espalhados
em painéis de cada fornecedor. Não há um lugar único que (a) **lembre** os vencimentos, (b) **traga** os
valores gastos e (c) **linke** direto para cada billing. O risco concreto é **esquecer de pagar** uma fatura
(corte de serviço em produção `crm.trifold.eng.br`) e **não ter visibilidade** do gasto acumulado.

**Objetivo:** entregar um **Painel de Saúde & Billing** (admin-only) que consolide os 7 serviços em escopo,
coletando custo automaticamente onde a API permite, registrando vencimentos/valores manualmente onde não
permite, e emitindo **lembretes antes do vencimento**.

Frase-guia do usuário: *"Lembrar as faturas, trazer os valores e ter links diretos para consultar os billings
de cada plataforma."*

## 2. Escopo

### 2.1 Serviços EM ESCOPO (7)

Classificados por capacidade de automação da coleta de custo (discovery já concluída — Article IV: fatos pesquisados):

| # | Serviço | Camada | Custo automático? | Endpoint-chave | Pré-requisito |
|---|---------|--------|-------------------|----------------|---------------|
| 1 | **Anthropic (Claude)** | FORTE | Sim (USD diário) | `GET /v1/organizations/cost_report` + `/usage_report/messages` | **Admin key** `sk-ant-admin01-…` (≠ API key) + Org configurada |
| 2 | **OpenAI** | FORTE | Sim (USD diário) | `GET /v1/organization/costs` + `/usage` | **Admin key** de organização |
| 3 | **Vercel** | FORTE | Sim (custo+uso, FOCUS/FinOps) | `GET /v1/billing/charges` (JSONL) + CLI `vercel usage` | Bearer token; janela ≤ 1 ano |
| 4 | **WhatsApp Cloud API (Meta)** | MÉDIA | Sim (custo estimado; WABA cobrado direto pela Meta — OQ-1 resolvida) | `GET /<WABA_ID>?fields=pricing_analytics` | Token System User `whatsapp_business_management` |
| 5 | **Supabase** | FRACA | Não (só plano + uso técnico) | `GET /v1/organizations/{slug}` + `/projects/{ref}/analytics/endpoints/usage.*` | PAT Bearer; **valor/vencimento manual** |
| 6 | **Resend** | FRACA | Não (uso via headers/webhook) | headers `x-resend-monthly-quota`; webhook `/api/webhook/resend` | **valor/vencimento manual** |
| 7 | **Meta Ads** | módulo separado (in-scope — OQ-2 resolvida) | `insights.spend` (budget de mídia, não conta a pagar) | `insights?fields=spend` | Exibido em seção própria do painel, distinta das faturas de infraestrutura |

**Detalhes técnicos da coleta (para os coletores):**
- **Anthropic:** header `x-api-key` + `anthropic-version: 2023-06-01`. Dados frescos ~5 min. Granularidade diária.
- **OpenAI:** `Authorization: Bearer`. Granularidade **só diária**.
- **Vercel:** resposta **JSONL** (formato FOCUS); parsear linha-a-linha; custo e uso por serviço.
- **WhatsApp:** usar `pricing_analytics` (NÃO `conversation_analytics`, descontinuado); params `start`/`end`/`granularity`.
- **Supabase:** custo/fatura/vencimento **NÃO têm endpoint oficial** — só plano e uso técnico (requests/egress).
- **Resend:** **sem endpoint de billing**; uso via HEADERS de resposta (`x-resend-monthly-quota`, `x-resend-daily-quota` só no free) ou contagem própria via webhook `/api/webhook/resend`.

### 2.2 FORA de escopo

- **ElevenLabs, Calendly, Supremo CRM** — excluídos pelo usuário (já cobertos pelo financeiro).
- **Sienge** (ERP do cliente), **Telegram** (grátis), **Google OAuth/Forms** (grátis).
- Provisionamento de orçamento/limites de gasto nas plataformas (não gerenciamos budget lá dentro).
- Pagamento automático de faturas (o painel **lembra e mostra**; não executa pagamento).

## 3. Requisitos Funcionais (FR)

| ID | Requisito | Origem |
|----|-----------|--------|
| **FR-1** | Manter um **catálogo de serviços** (os 7 em escopo) com nome, categoria, camada de automação, deep-link do billing e status de habilitação. | Usuário: "links diretos" |
| **FR-2** | Registrar/editar por serviço um **vencimento**: data de vencimento, valor esperado, ciclo de cobrança (mensal/anual/uso), moeda. | Requisito transversal crítico |
| **FR-3** | Emitir **lembretes/alertas antes do vencimento** (N dias antes, configurável por serviço), entregues por canal de notificação já existente no CRM. | Usuário: "lembrar as faturas" |
| **FR-4** | **Coletar custo automaticamente** (cron 1×/dia) para os serviços da camada FORTE (Anthropic, OpenAI, Vercel), com granularidade diária, persistindo snapshots. | Usuário: "trazer os valores" |
| **FR-5** | **Coletar custo estimado do WhatsApp/Meta** via `pricing_analytics` (campo COST) — WABA cobrado direto pela Meta (OQ-1 resolvida), logo o custo entra **automático via API**, sem fallback manual de valor. | Discovery WhatsApp |
| **FR-6** | **Fallback manual + uso técnico** para Supabase e Resend: valor/vencimento inseridos manualmente + exibição do uso técnico disponível (plano/requests/egress; quota/contagem de envios). | Discovery camada FRACA |
| **FR-7** | Exibir **deep-links** para o painel de billing de cada plataforma (1 clique). | Usuário: "links diretos" |
| **FR-8** | Apresentar uma **visão consolidada de saúde**: status de coleta por serviço (OK / manual / sem dado / erro), **gasto do mês agregado** e **próximos vencimentos** ordenados por data. | Usuário: "saúde da plataforma" |
| **FR-9** | Mostrar o **gasto do mês corrente** por serviço (soma dos snapshots do mês, onde automático; valor esperado, onde manual). | Usuário: "custo/gasto atual" |
| **FR-10** | Permitir **reprocessar/backfill** manual de um período por serviço (janela ≤ limites da API; Vercel ≤ 1 ano). | Robustez operacional |
| **FR-11** | Módulo separado de **gasto de mídia Meta Ads** (`insights.spend`), exibido em **seção própria do painel**, claramente rotulado como "budget de campanha" e **distinto das faturas de infraestrutura** (não soma ao "a pagar"). Incluído no escopo (OQ-2 resolvida). | Usuário / OQ-2 |

## 4. Requisitos Não-Funcionais (NFR)

| ID | Requisito |
|----|-----------|
| **NFR-1 (Segurança)** | **Admin/Org keys de billing** (Anthropic admin, OpenAI admin/org, Vercel token, Meta System User token, Supabase PAT) são **secrets de alto privilégio**. Guardar **exclusivamente** via env vars no Vercel, gravadas pela **REST API / `scripts/vercel-env-set.sh`** — **NUNCA** `vercel env add` via stdin (grava vazio; 2 incidentes históricos). Nunca commitar chaves. |
| **NFR-2 (Autorização)** | Painel e dados de custo são **admin-only** (RLS restringindo `service_*` a papéis administrativos; sem exposição a corretores). |
| **NFR-3 (Resiliência)** | Coleta é **best-effort e idempotente**: falha/timeout de uma API **não derruba** as demais nem o painel; registrar `collection_status` por serviço/dia; retry no próximo cron. |
| **NFR-4 (Idempotência)** | Snapshots de custo com **UNIQUE (service, date, metric)** — reprocessar o mesmo dia faz **upsert**, nunca duplica. |
| **NFR-5 (Custo/rate-limit)** | Coleta 1×/dia por serviço (cron), respeitando janelas e rate-limits das APIs; sem polling agressivo. |
| **NFR-6 (Observabilidade)** | Registrar última coleta bem-sucedida por serviço, erros e latência; a UI mostra "atualizado há X" e destaca coletas com erro/atrasadas. |
| **NFR-7 (Moeda)** | Custos automáticos vêm em **USD**; exibir moeda de origem sem conversão silenciosa (conversão BRL, se desejada, é decisão futura — não inventar taxa). |
| **NFR-8 (Timezone)** | Vencimentos e "gasto do mês" respeitam timezone do projeto (America/Sao_Paulo) para evitar erro de borda de dia/mês. |

## 5. Constraints (CON)

| ID | Constraint |
|----|-----------|
| **CON-1** | **Nenhuma API expõe "data de vencimento"** — o cadastro manual de vencimentos (FR-2) é **obrigatório** e é o coração do "não esquecer de pagar". |
| **CON-2** | **Anthropic e OpenAI exigem Admin key de organização** (≠ API key normal) — sem elas, os coletores 78-3/78-4 **não funcionam**. Provisionar antes (78-2). |
| **CON-3** | **Supabase e Resend não têm endpoint de fatura/valor** — custo desses dois é **sempre manual**; a automação só traz uso técnico. |
| **CON-4** | **WhatsApp/Meta:** o WABA da Trifold é cobrado **direto pela Meta** (OQ-1 resolvida 2026-07-08), logo o campo COST de `pricing_analytics` é populado e a coleta de custo é automática. (Referência: se algum dia migrar para cobrança via BSP/parceiro, o COST viria vazio e exigiria fallback manual — revisar 78-6.) |
| **CON-5** | **Vercel `/billing/charges`** retorna **JSONL** e janela **≤ 1 ano** — parsing e backfill precisam respeitar isso. |
| **CON-6** | Granularidade máxima das APIs de custo é **diária** (OpenAI notadamente) — não há custo em tempo real/hora confiável. |
| **CON-7** | Metodologia AIOS obrigatória: stories em `docs/stories/`, fluxo `@sm → @po → @dev → @qa → @devops`. Sem push direto. |
| **CON-8** | Meta Ads (`insights.spend`) é **budget de mídia**, não conta a pagar nossa — incluído (OQ-2 resolvida) em **seção própria e rotulada** do painel, **sem somar** ao total "a pagar" das faturas de infraestrutura. |

## 6. Riscos & Mitigação

| Risco | Sev. | Mitigação |
|-------|------|-----------|
| **Admin keys Anthropic/OpenAI como pré-requisito** — sem elas, 2 coletores morrem. | ALTA | Story 78-2 provisiona e valida as keys **antes** de 78-3/78-4; painel degrada graciosamente para "sem dado / manual" se ausente. |
| ~~WhatsApp cobrado via BSP → COST vazio~~ **RESOLVIDO** (OQ-1: WABA cobrado direto pela Meta). | BAIXA | Risco neutralizado — COST é populado e a coleta é automática. 78-6 ainda registra `collection_status` para o caso de futura migração para BSP. |
| **Supabase/Resend sem API de fatura** → custo depende de input humano desatualizado. | MÉDIA | FR-6 torna o cadastro manual explícito + lembrete de "revisar valor"; exibe uso técnico como sanity check. |
| **Secret de alto privilégio vazado** (Admin/Org keys dão acesso a billing e uso da org inteira). | ALTA | NFR-1: só via REST API/`vercel-env-set.sh`, admin-only, sem log de valor, sem commit. |
| **`vercel env add` via stdin grava vazio** (2 incidentes prévios). | ALTA | Proibido no epic; usar helper `scripts/vercel-env-set.sh` (POST/PATCH REST). |
| **Coleta de uma API falha e derruba o painel.** | MÉDIA | NFR-3: coleta isolada/best-effort, status por serviço, retry no próximo cron. |
| **Duplicação de custo ao reprocessar.** | BAIXA | NFR-4: UNIQUE + upsert. |
| **Divergência de moeda (USD vs BRL).** | BAIXA | NFR-7: exibir moeda de origem, sem conversão inventada. |

## 7. Decomposição em Stories

> Sequência recomendada: **78-1 → 78-2** primeiro (fundação + secrets). **78-3** estabelece o **padrão de coletor** reusado por 78-4/78-5/78-6. **78-8** (lembretes) e **78-9** (UI) fecham o valor entregue ao usuário. **78-10** (Meta Ads, seção separada) fecha o escopo. Todas as 10 stories são in-scope (OQ-1 e OQ-2 resolvidas em 2026-07-08).

| Story | Título | Escopo (resumo) | Executor | Quality Gate |
|-------|--------|-----------------|----------|--------------|
| **78-1** | Modelo de dados & migration | Tabelas `platform_services` (catálogo dos 7 + deep-link + camada), `service_billing_reminders` (vencimento, valor esperado, ciclo, moeda, dias-antes-de-alertar), `service_cost_snapshots` (serviço, data, métrica, valor, moeda, `collection_status`). RLS **admin-only**. UNIQUE(service,date,metric). Seed dos 7 serviços + deep-links oficiais. | @data-engineer | @dev |
| **78-2** | Provisionamento & config de secrets | Provisionar/validar Admin key Anthropic, Admin/Org key OpenAI, token Vercel, token System User Meta, PAT Supabase — **via REST API / `scripts/vercel-env-set.sh`** (NUNCA stdin). Doc de rotação. Health-check de cada credencial. | @devops | @architect |
| **78-3** | Coletor Anthropic (cron 1×/dia) + **padrão de coletor** | `cost_report` (USD) + `usage_report/messages` (tokens); upsert em snapshots; `collection_status`; retry idempotente. Estabelece a **interface de coletor** reusada pelos próximos. | @dev | @architect |
| **78-4** | Coletor OpenAI (cron 1×/dia) | `organization/costs` (USD) + `organization/usage`; granularidade diária; reusa padrão de 78-3. | @dev | @architect |
| **78-5** | Coletor Vercel (cron 1×/dia) | `billing/charges` (JSONL/FOCUS) — parsear linha-a-linha, custo+uso por serviço; janela ≤ 1 ano; backfill. | @dev | @architect |
| **78-6** | Coletor WhatsApp/Meta (cron 1×/dia) | `pricing_analytics` (start/end/granularity); custo (campo COST) + volume por categoria. WABA cobrado **direto pela Meta** (OQ-1 resolvida) → custo **automático**; sem fallback manual de valor. Registrar `collection_status` para robustez. | @dev | @architect |
| **78-7** | Fallback manual + uso técnico (Supabase & Resend) | Supabase: plano + uso técnico (requests/egress) via Management API. Resend: contagem de envios via webhook `/api/webhook/resend` + headers de quota. Valor/vencimento **manual** (usa 78-1). | @dev | @architect |
| **78-8** | Cadastro de vencimentos + motor de lembretes/alertas | CRUD de vencimentos por serviço (data, valor, ciclo, dias-antes). Motor que dispara **lembrete N dias antes** via canal de notificação existente; marca "pago/adiado". | @dev | @architect |
| **78-9** | UI do Painel de Saúde & Billing (admin-only) | Visão consolidada: cards por serviço (status de coleta, gasto do mês, próximo vencimento), **gasto agregado**, lista de **próximos vencimentos** ordenada, **deep-links** 1-clique, "atualizado há X". | @ux-design-expert | @dev |
| **78-10** | Módulo Meta Ads spend (seção separada) | `insights.spend` como **budget de mídia**, exibido em **seção própria** do painel, rotulado à parte e **sem somar** ao total "a pagar". In-scope (OQ-2 resolvida). | @dev | @architect |

**Notas de sequenciamento e reuso (IDS REUSE > ADAPT > CREATE):**
- 78-3 cria o contrato de coletor; 78-4/78-5/78-6 **adaptam**, não recriam.
- Deep-links vivem no catálogo (78-1) e são apenas renderizados pela UI (78-9) — sem duplicação.
- Motor de notificação de 78-8 **reusa** `packages/web/src/lib/notificacoes.ts` / canais existentes; não cria canal novo.

## 8. Compatibility Requirements

- [ ] Não altera APIs/fluxos existentes do CRM; adiciona rotas de cron e UI admin novas.
- [ ] Migrations backward-compatible (só adiciona tabelas; verificar numeração — conflito histórico 074/075).
- [ ] UI segue padrões existentes (App Router `packages/web/src`, tema claro/escuro).
- [ ] Impacto de performance mínimo (coleta 1×/dia, fora do hot-path do usuário).

## 9. Definition of Done (Epic)

- [ ] 7 serviços no catálogo com deep-links válidos.
- [ ] Coleta automática funcionando para Anthropic, OpenAI, Vercel (camada FORTE) com snapshots diários.
- [ ] WhatsApp coletando custo automático via `pricing_analytics` (WABA cobrado direto pela Meta).
- [ ] Meta Ads exibido em seção própria (budget de mídia), sem somar ao total "a pagar".
- [ ] Supabase e Resend com valor/vencimento manual + uso técnico visível.
- [ ] Lembretes disparando antes do vencimento por canal existente.
- [ ] Painel consolidado (status + gasto do mês + próximos vencimentos + deep-links) admin-only.
- [ ] Secrets provisionados via REST API (nenhum via stdin), sem chave commitada.
- [ ] Sem regressão em funcionalidades existentes.

## 10. Questões Abertas — RESOLVIDAS (2026-07-08)

- **OQ-1 — WhatsApp: billing direto vs BSP? → RESOLVED (2026-07-08).**
  Decisão do usuário: o WABA da Trifold é cobrado **direto pela Meta** (não via BSP). Logo, o campo COST de
  `pricing_analytics` é populado e o custo do WhatsApp entra **automático via API** na Story 78-6 — **sem
  fallback manual** de valor. (Se um dia migrar para cobrança via BSP, COST viria vazio e exigiria fallback —
  revisitar 78-6.)

- **OQ-2 — Incluir Meta Ads (gasto de mídia)? → RESOLVED (2026-07-08).**
  Decisão do usuário: **incluir** Meta Ads como **módulo separado**. A Story 78-10 passa a ser **in-scope**
  (não mais opcional), exibida numa **seção própria** do painel, distinta das faturas de infraestrutura, com
  `insights.spend` claramente rotulado como **budget de mídia** e **sem somar** ao total "a pagar".

## 11. Handoff para Story Manager (@sm)

"Desenvolver as stories detalhadas do Epic 78 (Painel de Saúde & Billing). Considerações-chave:
- Enhancement brownfield sobre CRM Next.js (App Router, `packages/web/src`) + Supabase + cron Vercel.
- Integração: reusar cron pattern e webhook Resend existentes; canal de notificação existente para lembretes.
- Padrões a seguir: idempotência de webhook/coleta (UNIQUE + upsert), RLS admin-only, absolute imports.
- Compatibilidade crítica: secrets **só** via `scripts/vercel-env-set.sh`/REST API; nunca stdin.
- Cada story verifica que a coleta é best-effort e não derruba o painel.
- Começar por 78-1 e 78-2. OQ-1 e OQ-2 já resolvidas (2026-07-08): WhatsApp custo automático (78-6) e Meta Ads in-scope em seção separada (78-10).
O epic mantém a integridade do sistema enquanto entrega visibilidade de custo e lembretes de vencimento."
