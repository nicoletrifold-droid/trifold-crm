# Story 75-62 — Contador de disparos e custo de WhatsApp (Passo 2)

## Metadata
- **Status:** Review · **Epic:** 75 · **Branch:** main · **Complexidade:** L (8 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]

## Story
**As a** admin (Marcos), **I want** ver quantos **disparos de template de WhatsApp** a Trifold faz (por categoria
e período) e uma **estimativa de custo em R$**, com atalho pra fatura real da Meta, **so that** eu entenda e
controle o gasto com WhatsApp — não só o volume conversacional (Passo 1).

## Contexto
Passo 1 (Story 75-61) entregou o **volume conversacional** (tabela `messages`). Mas o que **custa** na Meta são os
**templates proativos** (notificações, alertas) — e esses **não são registrados em lugar nenhum** hoje: os envios
estão espalhados em ~12 sites, cada um com seu `fetch` pra `graph.facebook.com/.../messages` (não há sender único).

**Modelo de preço Meta (pesquisado, jul/2025+ = por MENSAGEM):** Brasil 2026 ≈ **Utility R$0,05** · Authentication
R$0,17 · **Marketing R$0,35** · **Service R$0 (grátis)**. Quase todo disparo da Trifold é **utility** (~R$0,05);
respostas da Nicole na janela de 24h são **service (grátis)**.

⚠️ **Duas premissas:** (a) o log conta **a partir do deploy** (sem histórico). (b) Cobre os **senders de template**
listados no escopo; respostas conversacionais/mídia (service, grátis) ficam fora (já contam no volume do Passo 1).

## Escopo
**IN — Infra:**
1. **Migration — tabela `whatsapp_send_log`**: `id`, `org_id`, `template` (text, null p/ texto livre), `category`
   (utility|marketing|authentication|service), `recipient_type` (cliente|corretor|gestor|lead), `to_phone` (text,
   opcional), `status` (sent|failed), `error` (text, null), `wam_id` (text, null = id retornado pela Meta),
   `created_at`. Índice `(org_id, created_at)`. RLS por org (mesmo padrão).
2. **Migration — tabela `whatsapp_pricing`**: `category` (pk), `price_brl` (numeric). Seed: utility 0.05,
   authentication 0.17, marketing 0.35, service 0.00. (Editável via SQL/futura UI — preços mudam.)
3. **Helper** `logWhatsappSend(admin, {...})` (lib): grava 1 linha em `whatsapp_send_log`. Fire-and-forget
   (`.catch` logando erro) — NUNCA quebra o envio.

**IN — Instrumentar os senders de TEMPLATE pago (1 chamada de log após cada envio) — 5 sites confirmados:**
4. `lib/notificacoes.ts` (portal cliente → `atualizacao_obra_cliente`/`novo_boleto_cliente`, **utility**, cliente).
5. `lib/roleta/notify-broker.ts` — **apenas** o envio do corretor `novo_lead_corretor` (`type:"template"`, **utility**).
   ⚠️ O envio do GESTOR neste arquivo é `type:"text"` (janela 24h, grátis) → NÃO logar (vai pro OUT).
6. `app/api/cron/sla-alerts/route.ts` (gestor `alerta_sla_gestor`, `type:"template"`, **utility**).
7. `app/api/campaigns/[id]/send-whatsapp/route.ts` + `app/api/cron/campaign-poll/route.ts` (campanhas, `type:"template"` → **marketing**).

**IN — Leitura e UI:**
9. **RPC** `get_whatsapp_cost_summary(p_org_id)`: agrega `whatsapp_send_log` por categoria × janela (24h/7d/30d),
   cruza com `whatsapp_pricing` → retorna jsonb com {disparos por categoria, custo estimado R$} por janela.
10. **Rota `/api/system-events`**: expor `metrics.whatsapp_cost` (admin-only já garante acesso).
11. **`/sistema`**: ampliar a seção "Volume de WhatsApp" com **Disparos pagos** (por categoria/período) + **Custo
    estimado (R$)** + **link "Fatura na Meta"** (WhatsApp Manager / Business Settings billing).

**OUT (são `type:"text"`/service = grátis na janela 24h; não custam → não logar):**
- **Lembrete de visita** (`cron/appointment-whatsapp-reminders` — é `type:"text"`, não template). ⟵ removido do escopo após verificação.
- **Gestor da roleta** (`notify-broker` notifyImobiliaria — `type:"text"`). ⟵ só o corretor (template) é pago.
- Respostas da Nicole no webhook, send-file, nicole/media, relacionamento, dispatch-broker-message,
  send-library-media — service/freeform; volume já no Passo 1.
- Integração com a **API de billing da Meta** (custo exato) — decisão do usuário foi estimativa nossa + link.
- UI de edição da tabela de preços (editar via SQL por enquanto).
- Histórico retroativo (impossível — não havia log).

## Acceptance Criteria
1. **Given** um disparo de template (qualquer um dos senders do escopo), **when** enviado, **then** grava 1 linha
   em `whatsapp_send_log` com category/template/recipient/status — sem quebrar o envio se o log falhar.
2. **Given** a tabela `whatsapp_pricing`, **then** vem semeada (utility 0.05, auth 0.17, marketing 0.35, service 0)
   e é a fonte do preço por categoria (editável sem deploy).
3. **Given** a RPC `get_whatsapp_cost_summary(org)`, **then** retorna disparos por categoria e **custo estimado**
   (Σ disparos_categoria × preço_categoria) por janela 24h/7d/30d, só do org.
4. **Given** `/sistema` (admin), **then** mostra disparos pagos por categoria/período + custo estimado em R$ + link
   pra fatura da Meta. Renderiza com guard null (se RPC falhar, não quebra a página).
5. **Given** a config atual, **then** o painel deixa claro que é **estimativa** (não a fatura) e que conta **a
   partir do deploy**.
6. typecheck/lint/vitest limpos; teste unitário do cálculo de custo (disparos × preço) se houver função pura.

## Dev Notes
- Senders e linhas aproximadas: `notificacoes.ts:~228` (sendWhatsApp), `notify-broker.ts:114` e `:178`,
  `cron/sla-alerts/route.ts:~18+envio`, `cron/appointment-whatsapp-reminders/route.ts:~115`,
  `campaigns/[id]/send-whatsapp/route.ts:11`, `cron/campaign-poll/route.ts:21`. Cada um já tem `org_id`/`config`.
- Logar APÓS resposta da Meta: `status='sent'` + `wam_id` se 2xx; `status='failed'` + `error` se não. Não `await`
  bloqueante — `void logWhatsappSend(...).catch(...)`.
- `category`: utility p/ os de notificação/alerta/lembrete; marketing p/ campanhas. (Conferir a categoria real
  aprovada de cada template na Meta — todos os de utilidade são UTILITY.)
- RPC e UI seguem o padrão da Story 75-61 (`get_whatsapp_volume_summary`, seção no /sistema, expor em system-events).
- Migration: conferir próximo número livre (última = 117; cuidado com a colisão histórica — usar o próximo real).
- Tema /dashboard = light/dark ([[feedback-theme-convention]]).

### Testing
- Unit do cálculo de custo (se extrair função pura `estimateCost(counts, pricing)`).
- `vitest packages/web` + `tsc --noEmit` + lint.
- Verificação manual pós-deploy: disparar uma notificação de teste → conferir 1 linha em `whatsapp_send_log` e o card refletindo.

## Riscos
- **Muitos pontos de instrumentação** (6 senders) → risco de quebrar um envio ou esquecer um. Mitigação: log
  fire-and-forget (`.catch`), revisar cada site no QA, cobertura explícita no escopo. **Médio.**
- **Categoria errada** → custo estimado errado. Mitigação: mapear category por template conferindo o aprovado na Meta. **Baixo/Médio.**
- **Estimativa ≠ fatura** → expectativa. Mitigação: rotular "estimativa" + link pra Meta. **Baixo.**

## File List
- `supabase/migrations/118_whatsapp_send_log.sql` (novo) — tabela `whatsapp_send_log` + `whatsapp_pricing` (seed) + RPC `get_whatsapp_cost_summary` (tudo em uma migration).
- `packages/web/src/lib/whatsapp/log-send.ts` (novo) — helper `logWhatsappSend` (fire-and-forget).
- `packages/web/src/lib/notificacoes.ts` — log no sendWhatsApp (utility/cliente).
- `packages/web/src/lib/roleta/notify-broker.ts` — log só no `novo_lead_corretor` (utility/corretor).
- `packages/web/src/app/api/cron/sla-alerts/route.ts` — log no `alerta_sla_gestor` (utility/gestor); `sendGestorSlaWhatsApp` ganhou `admin`+`orgId`.
- `packages/web/src/app/api/campaigns/[id]/send-whatsapp/route.ts` — log (marketing/lead).
- `packages/web/src/app/api/cron/campaign-poll/route.ts` — log (marketing/lead).
- `packages/web/src/app/api/system-events/route.ts` — chama `get_whatsapp_cost_summary`, expõe `metrics.whatsapp_cost`.
- `packages/web/src/app/dashboard/sistema/page.tsx` — seção "Disparos & custo de WhatsApp" + link fatura Meta.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.62-whatsapp-custo-disparos.yml`) · readiness 9/10
- 11 logs, **todos `void`** (fire-and-forget) — nenhum quebra o envio; categorias corretas; lógica de envio intacta. 265/265 testes; typecheck limpo.
- Observação (low): categoria das campanhas fixa em "marketing" — se usar template utility, superestima (aceitável p/ MVP). Hardening multi-tenant da RPC = item futuro (família).
- RPC valida só pós-deploy (tabela não existe em prod ainda). Conta a partir do deploy; estimativa (não fatura).

## Dev Agent Record
- **Agent Model:** Claude Opus 4.8 (1M)
- **Completion Notes:**
  - 5 senders de template instrumentados; cada log é `void logWhatsappSend(...)` (fire-and-forget, swallow interno) → não quebra o envio. Categoria: utility (notif/roleta-corretor/SLA), marketing (campanhas).
  - `whatsapp_pricing` semeada com preços Meta BR 2026 (utility 0.05, auth 0.17, marketing 0.35, service 0) — editável via SQL.
  - RPC `get_whatsapp_cost_summary`: disparos + custo (Σ disparos×preço) por janela 24h/7d/30d + `por_categoria` no 30d.
  - Painel no /sistema: disparos pagos + custo estimado + **link "Fatura na Meta"** + nota "estimativa, conta a partir do deploy".
  - **Validação:** `tsc --noEmit` (web) **exit 0**; `vitest packages/web` **265/265 verdes**. Migration 118 NÃO aplicada em prod (@devops no deploy; RPC só roda após criar a tabela — validar pós-deploy).

## Change Log
- 2026-06-25 — @sm — Story criada. Passo 2: log de disparos de template + tabela de preços (Meta BR pesquisada) +
  RPC de custo + painel no /sistema. Conta a partir do deploy; cobre senders de template (service grátis fora).
- 2026-06-25 — @po — Validação: **GO**, 9/10. Anti-alucinação corrigiu o escopo: `appointment-reminders` e o
  gestor do `notify-broker` são `type:"text"` (grátis) → REMOVIDOS; ficam 5 sites de template pago (portal, corretor,
  SLA gestor, campaigns, campaign-poll). Próxima migration = 118. Status Draft → Ready.
- 2026-06-25 — @dev — Implementado: migration 118 (tabelas+pricing+RPC), helper `log-send`, 5 senders, rota expõe
  `whatsapp_cost`, painel no /sistema. 265/265 testes, typecheck limpo. Status Ready → Review.
- 2026-06-25 — @qa — Gate **PASS** (9/10). 11 logs fire-and-forget verificados; sem regressão. Observações low
  (categoria campanha fixa marketing; hardening multi-tenant da família). Pendente @devops: aplicar migration 118.
