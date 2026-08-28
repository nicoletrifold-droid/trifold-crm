# Story 87-19 — Alerta por WhatsApp quando a Nicole para por erro da API de IA

## Metadata
- **Epic:** 87 — Nicole: Confiabilidade de Contexto, Estado e Enforcement
- **Story:** 87-19
- **Status:** Ready for Review
- **Priority:** P1 — falha de produção **já ocorrida e silenciosa por 22h** (incidente 27-28/08/2026, evidência abaixo). Não é hipótese: 3 leads ficaram sem resposta e ninguém foi avisado.
- **Complexity:** M (1 classificador puro + 1 cron novo + 1 canal de alerta + 1 template Meta; **sem migration**; ~4-6h)
- **Created:** 2026-08-28
- **Author:** @sm (River)

> **Nota de numeração e de epic (@po, 28/08/2026):** esta story nasceu numerada como `78-16` (Epic 78 — Painel de Saúde & Billing) e foi **renumerada para `87-19` na validação**. Motivo: nenhum FR do Epic 78 cobre runtime — o epic trata de catálogo de serviços, vencimentos e coleta de custo, e a "saúde" do seu FR-8 é explicitamente *status de coleta por serviço*. O Epic 87 é o dono legítimo: declara `system_events` como canal de medição em produção, é P0 por incidente ativo, e já contém a irmã direta **87-18 ("erro de consulta vira horário livre em silêncio")** — a mesma família de defeito, a falha da Nicole que ninguém vê. O `logEventOnce` que esta story reusa também nasceu aqui (87-6). `docs/stories/87-*` ia até `87-18`; `87-19` estava livre.

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[cron_pattern_review, idempotency_review, honesty_of_signal_review]`

---

## User Story

**Como** administrador da plataforma Trifold,
**Quero** receber um WhatsApp assim que a Nicole parar de responder por erro da API de IA (crédito esgotado, credencial inválida, rate limit ou sobrecarga),
**Para que** eu aja em minutos em vez de descobrir horas depois que leads pagos ficaram sem resposta.

---

## Context — o incidente que originou esta story (evidência, não hipótese)

Em **27/08/2026 às 08:02 BRT** a API da Anthropic passou a responder **HTTP 400** a toda chamada do pipeline da Nicole:

```
"Your credit balance is too low to access the Anthropic API."
```

O saldo da conta havia acabado. O CRM continuou operando **como se estivesse tudo certo**: lead criado, conversa criada, RAG executado — e a geração falhando no último passo. Diagnóstico feito em 28/08 às 06:55 BRT a partir de `system_events`, **22 horas** após a primeira falha.

Recorte real de `system_events` para o lead `b9f3be16-769c-4270-9347-3e65a2b0d10c` (28/08, 09:05 UTC = 06:05 BRT):

```
09:05:31.518  info   webhook  lead_created          New lead created via WhatsApp inbound
09:05:31.791  info   webhook  conversation_created  New active conversation created
09:05:40.407  info   ai       RAG_SUCCESS           RAG returned 2 results
09:05:41.798  ERROR  webhook  WEBHOOK_ASYNC_ERROR   400 ... "credit balance is too low"
```

**Alcance medido do incidente** — 11 eventos de erro, em 3 caminhos distintos, todos com a mesma causa:

| Origem (`source`) | Ocorrências |
|---|---|
| `api/webhook/whatsapp` (resposta ao lead) | 7 |
| `api/cron/followup` (follow-up pós-visita) | 2 |
| `lib/appointments/visit-feedback-core` | 2 |

**3 leads ficaram sem resposta** (conversas com `is_ai_active=true` e `last_message_role='user'` desde 27/08 11:00 UTC), sendo um deles CTWA de campanha paga em veiculação.

### O buraco, dito com precisão

A UI mostrava "Nicole está atendendo automaticamente" e o banco concordava (`is_ai_active: true`, `handoff_at: null`, `relationship_checked: true`). **Do ponto de vista do CRM não havia defeito algum** — quem recusou foi a API externa. O erro foi corretamente gravado em `system_events` e **morreu ali**: nenhum canal leva um `level='error'` a um ser humano.

### Por que a 78-13 (Done) não cobre isto

A 78-13 alerta quando o **coletor de custo** falha 3 dias seguidos (`service_cost_snapshots.metric='collection_error'`). São credenciais e caminhos diferentes: o coletor usa `ANTHROPIC_ADMIN_KEY` contra `/v1/organizations/cost_report`, que **continuou respondendo 200 normalmente durante todo o incidente** — saldo zerado não derruba o relatório de custo já incorrido. Além disso, o limiar de 3 dias é por construção lento demais para um sinal que trava o atendimento no primeiro minuto. As duas stories são complementares: 78-13 = "a coleta de custo adoeceu"; 78-16 = "a IA parou agora".

### Por que o canal admin que existe hoje não serviu

`packages/web/src/lib/telegram.ts` expõe `sendTelegramAdminAlert()` e é usado por 4 crons (incluindo `webhook-health`). Em produção **`TELEGRAM_BOT_TOKEN` e `TELEGRAM_ADMIN_CHAT_ID` não existem** (conferido via `vercel env ls production` em 28/08/2026) — a função cai no `console.warn("alert suppressed")` e o alerta evapora. Ou seja: já existe um canal admin no código que nunca foi ligado. Esta story **não conserta o Telegram** (ver OUT); entrega o canal que o usuário escolheu explicitamente nesta sessão: **WhatsApp**.

---

## Scope

### IN (esta story entrega)

1. **Classificador puro** `packages/web/src/lib/alerts/erro-ia.ts` — sem I/O, testável isoladamente: recebe o `message` de um `system_event` e devolve o tipo de falha de API de IA (`credito` | `auth` | `rate_limit` | `sobrecarga` | `null`).
2. **Canal de alerta** `packages/web/src/lib/alerts/admin-whatsapp.ts` — envia template WhatsApp aos números de `ALERTA_SISTEMA_PHONES`, reusando `sendWhatsAppTemplate` (75-142) e `logWhatsappSend`.
3. **Cron novo** `GET /api/cron/nicole-health` — a cada 10 min, varre `system_events` recentes, classifica, aplica limiar por tipo, dispara alerta com dedup horário via `logEventOnce`.
4. **Template Meta novo** `alerta_sistema_admin` (categoria UTILITY, pt_BR) — submetido e aprovado antes do merge.
5. `?dry=1` (mesmo padrão de `billing-reminders`/`sla-alerts`) e kill-switch por env.

### OUT (não entra nesta story)

- **Canal Telegram** — `sendTelegramAdminAlert` está morto em produção (sem `TELEGRAM_BOT_TOKEN`/`TELEGRAM_ADMIN_CHAT_ID`) e 5 chamadores alertam para o vazio (`webhook-health`, `meta-sync-entities`, `meta-sync-health`, `nicole-agenda-reconcile`, `admin/email-stats`). **O usuário confirmou em 28/08/2026 que o Telegram não está em uso** — portanto não é dívida a consertar, e sim código inerte. Não ligar, não remover nesta story: remoção é limpeza própria, com seus próprios testes, e sem relação com o alerta que esta story entrega. Registrado aqui só para o próximo leitor não confundir "existe um alerta admin" com "alguém é avisado".
- **Reprocessar as conversas órfãs do incidente** — não existe retry: o erro derruba o caminho assíncrono e nenhuma mensagem de assistente é gravada. Recuperar os 3 leads de 27-28/08 é ação manual, já comunicada ao usuário. Fila de retry de geração é escopo próprio e maior.
- **Push e e-mail** como canais adicionais — a infra existe (`sendPushToUser`, `sendEmail`, usados por 78-11/78-13) e sairia barato, mas o usuário escolheu **WhatsApp** explicitamente. Não adicionar canal não pedido (Article IV).
- **Contagem de leads afetados na mensagem** — exigiria uma segunda query sobre `conversations`; a primeira versão informa quantas **ocorrências de erro** houve na janela, que é o mesmo dado sem custo extra.
- **UI de configuração dos destinatários** — a lista é env (padrão de `SLA_ESCALATION_PHONES`), não tela. Se virar necessidade, é a extensão que a 75-345 já fez para o relatório diário.
- **Alterar qualquer catch existente** — o classificador roda sobre o que já é gravado. Nenhum dos 3 caminhos de erro é tocado.

---

## Acceptance Criteria

- [x] **AC1 — Erro de crédito dispara alerta imediato:** Dado ≥1 `system_events` com `level='error'` e `message` contendo a assinatura de saldo insuficiente (a string real do incidente: `"Your credit balance is too low to access the Anthropic API"`) nos últimos 15 min: o cron envia 1 WhatsApp a cada número de `ALERTA_SISTEMA_PHONES` identificando o motivo como crédito/saldo, o horário da primeira ocorrência da janela e a contagem de ocorrências.

- [x] **AC2 — Erro de credencial dispara alerta imediato:** Idem AC1 para assinatura de autenticação (`authentication_error`, `invalid x-api-key`, HTTP 401). Limiar 1 — credencial revogada não se cura sozinha.

- [x] **AC3 — Erro transitório exige recorrência (anti-ruído):** Dado erro de `rate_limit_error` (429) ou `overloaded_error` (529): o alerta só dispara com **≥3 ocorrências na mesma janela de 15 min**. 1 ou 2 ocorrências → nenhum alerta. Rationale no AUTO-DECISION dos Dev Notes.

- [x] **AC4 — Erro que não é de API de IA nunca alerta:** Dado `system_events` com `level='error'` de qualquer outra natureza (falha de Supabase, erro da Graph API do WhatsApp, TypeError de código): o classificador devolve `null` e o cron **não** envia nada. Este AC é o guarda contra transformar o cron num megafone de todo erro do sistema.

- [x] **AC5 — Dedup horário (não spamma, não silencia):** Enquanto a falha persistir, sai **no máximo 1 alerta por tipo por hora**. Implementado com `logEventOnce({ dedupe_key })` (87-6) sobre o índice `ux_system_events_dedupe_key` **já existente em produção** (migration 218, conferida via `pg_indexes` em 28/08/2026) — sem migration, sem tabela nova. Duas execuções do cron dentro da mesma hora com o mesmo tipo → 1 envio; a segunda vê `inserted:false` e não envia.

- [x] **AC6 — Alerta reincide na hora seguinte se a falha continuar:** Dado que a falha persiste após a virada da hora: um novo `dedupe_key` é aceito e **novo** alerta sai. O incidente de 22h teria gerado alertas recorrentes, não um único aviso perdido.

- [x] **AC7 — Cessa sozinho:** Resolvida a causa (saldo recarregado), a janela de 15 min deixa de conter erros classificáveis e o alerta para. **Sem ação manual de reset.**

- [x] **AC8 — Roda 24h, sem gate de horário comercial:** O cron **não** replica o `isBusinessHoursBRT()` de `webhook-health`. O incidente que originou esta story ocorreu às 06:05 BRT (09:05 UTC) — fora da janela 11h–23h UTC daquele cron, que portanto jamais o teria detectado. A Nicole atende fora do horário comercial; o alerta também vigia.

- [x] **AC9 — Guard e dry-run (padrão do épico):** `CRON_SECRET` via `Authorization: Bearer` — ausente → 503, incorreto → 401 (idêntico a `billing-reminders`). `?dry=1` classifica, calcula e devolve o summary **sem** enviar WhatsApp e **sem** gravar o marcador de dedup.

- [x] **AC10 — Kill-switch:** Com `ALERTA_SISTEMA_OFF=1` o cron responde `{ skipped: "desligado" }` sem consultar nada. Com `ALERTA_SISTEMA_PHONES` vazia/ausente, responde `{ skipped: "sem destinatário" }` — explícito, nunca um "ok" silencioso (mesma disciplina do `daily-report`).

- [ ] **AC11 — Mensagem honesta:** O texto diz que **a IA parou de responder** e qual a causa provável observada, com o horário da primeira ocorrência. Não afirma valor de saldo (a API não expõe saldo — confirmado pela 78-13) nem número de leads perdidos (fora de escopo). Não promete que já foi corrigido.

- [x] **AC12 — Falha do próprio alerta não derruba o cron:** Erro no envio a um número é isolado (`Promise.allSettled`, `.catch` por destinatário), logado, e não impede os demais nem retorna 500 — mesmo padrão best-effort de `sla-alerts`.

- [x] **AC13 — Sem migration:** Nenhuma tabela, coluna ou índice novo. Confirmado: `ux_system_events_dedupe_key` já existe em produção; a última migration do repo é a `243`.

- [x] **AC14 — Config de WhatsApp ausente não derruba o cron (@po, 28/08):** Dado que `whatsapp_config` não retorna linha para a org, ou retorna com `status != 'active'`, ou sem `access_token`/`phone_number_id`: o cron responde `{ skipped: "whatsapp indisponível" }` **sem lançar** e **sem gravar o marcador de dedup** — o alerta não pode ser consumido por um envio que nunca aconteceu. O caso é logado (`logEvent`, `category:"cron"`, `level:"warn"`) para não virar um segundo silêncio.

---

## Riscos & Mitigação

| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| **R1** | **Casamento por string quebra** se o provedor mudar o texto do erro | Alerta silencioso — o mesmo defeito que a story existe para matar | T1.2 fixa as strings **reais** do incidente em teste; classificação por assinaturas múltiplas por tipo (texto + código de status), não uma frase única |
| **R2** | **Falso positivo** transformando o cron em megafone de todo erro | Fadiga de alerta → o canal morre por descrédito | AC4 é o teste-guarda: erro de Supabase e erro da Graph API têm que devolver `null`. Limiar 3 para transitórios (AC3) |
| **R3** | **Template Meta não aprovado** a tempo | Story não fecha — `sendWhatsAppTemplate` devolve 400 | T3 é bloqueante e explicitamente anterior ao gate do @qa. UTILITY costuma sair em minutos/horas |
| **R4** | **Env gravada vazia** pelo gotcha do `vercel env add` via pipe | Alerta configurado que nunca dispara — falha **silenciosa**, a pior classe aqui | T5.3 obriga `scripts/vercel-env-set.sh`; T5.4 obriga reler o valor antes de fechar |
| **R5** | **Teto de 40 crons** da Vercel (hoje 36; este é o 37º) | Deploy recusado, ou pressão para remover cron alheio | T5.1 manda **parar e escalar** se estiver em 40 — nunca remover cron de outro dono por conta própria |
| **R6** | O alerta depende do WhatsApp, que é **o mesmo canal** que pode estar fora | Alerta não chega justamente num apagão de Meta | Aceito nesta versão: as causas são independentes (saldo de IA × Cloud API). Se virar problema real, um 2º canal é extensão, não retrabalho — `alertarAdminWhatsApp` já isola o envio atrás de uma função |

---

## Questões Abertas

| # | Questão | Dono | Bloqueia? |
|---|---|---|---|
| **Q1** | O número `5544999761478` (cadastro admin do Marcos) é o WhatsApp correto para receber os alertas? | Usuário | Não bloqueia o código; **bloqueia o T5.3** (gravar a env) |
| **Q2** | Submissão do template `alerta_sistema_admin` na WABA — feita pelo agente via Graph API ou pelo usuário no Business Manager? | Usuário | **Bloqueia o T3** |

---

## Tasks / Subtasks

- [x] **T1** — Classificador puro (AC1-AC4)
  - [x] T1.1 — Criar `packages/web/src/lib/alerts/erro-ia.ts`:
    - `export type TipoErroIA = "credito" | "auth" | "rate_limit" | "sobrecarga"`
    - `classificarErroIA(message: string): TipoErroIA | null` — casamento por assinatura, **case-insensitive**, ordem de precedência: `credito` → `auth` → `rate_limit` → `sobrecarga` → `null`
    - `LIMIAR_POR_TIPO: Record<TipoErroIA, number>` = `{ credito: 1, auth: 1, rate_limit: 3, sobrecarga: 3 }`
    - `deveAlertar(tipo, ocorrencias): boolean` — pura
  - [x] T1.2 — `erro-ia.test.ts` — **usar as strings reais do incidente** (recuperáveis de `system_events` em produção, `message ilike '%credit balance%'`), não strings inventadas. Cobrir: crédito → `credito`; 401/`invalid x-api-key` → `auth`; 429 → `rate_limit`; 529 → `sobrecarga`; erro de Supabase → `null`; erro da Graph API do WhatsApp → `null`; string vazia → `null`; **AC4 é o teste que precisa ser capaz de reprovar** — se o classificador virar um `return "credito"` genérico, este teste tem que ficar vermelho.

- [x] **T2** — Canal de alerta (AC1, AC12)
  - [x] T2.1 — Criar `packages/web/src/lib/alerts/admin-whatsapp.ts` com `alertarAdminWhatsApp(admin, { orgId, tipo, desdeIso, ocorrencias })`
  - [x] T2.2 — Ler destinatários de `ALERTA_SISTEMA_PHONES` (CSV, `.split(",").map(trim).filter(Boolean)`) — mesmo parsing de `SLA_ESCALATION_PHONES` em `sla-alerts/route.ts:100`
  - [x] T2.3 — Buscar config WhatsApp da org (`whatsapp_config`: `phone_number_id`, `access_token`) **uma vez**, não por destinatário (padrão de `sla-alerts:129`)
  - [x] T2.4 — Enviar via `sendWhatsAppTemplate` (`lib/whatsapp/send-template.ts`, Story 75-142) com o template `alerta_sistema_admin` e 3 parâmetros de body
  - [x] T2.5 — `logWhatsappSend` por destinatário (`template: "alerta_sistema_admin"`, `category: "utility"`, `recipientType: "gestor"`, status `sent`/`failed`) — mesma instrumentação de `sla-alerts`
  - [x] T2.6 — `Promise.allSettled` + `.catch` por número (AC12)

- [ ] **T3** — Template Meta `alerta_sistema_admin` (AC1, AC11) — **BLOQUEANTE do merge**
  - [ ] T3.1 — Submeter na WABA `35524602787124855`, categoria **UTILITY** (não MARKETING — é notificação operacional), idioma `pt_BR`, 3 variáveis, **sem botão** (botão URL exigiria um id de entidade que este alerta não tem)
  - [ ] T3.2 — Corpo proposto (ajustar só se a Meta reprovar):
    ```
    🚨 Sistema Trifold — a Nicole parou de responder.

    Motivo provável: {{1}}
    Primeira ocorrência: {{2}}
    Falhas na última janela: {{3}}

    Verifique o painel e a conta do provedor de IA.
    ```
  - [ ] T3.3 — Confirmar `status: APPROVED` via `GET /v21.0/35524602787124855/message_templates` antes de o @qa liberar o gate. Templates UTILITY costumam sair em minutos/horas, mas **a story não fecha com o template pendente** — sem ele, `sendWhatsAppTemplate` devolve 400 e o alerta não existe.
  - [ ] T3.4 — Mapa `tipo → texto de {{1}}` (constante no código, não string solta): `credito` → "saldo/crédito da API de IA esgotado"; `auth` → "credencial da API de IA inválida ou revogada"; `rate_limit` → "limite de requisições da API de IA atingido"; `sobrecarga` → "API de IA sobrecarregada"

- [x] **T4** — Cron `GET /api/cron/nicole-health` (AC1-AC3, AC5-AC10, AC12)
  - [x] T4.1 — Guard `CRON_SECRET` idêntico a `billing-reminders/route.ts` (AC9)
  - [x] T4.2 — Kill-switch `ALERTA_SISTEMA_OFF` e guarda de lista vazia, ambos com `skipped` explícito (AC10)
  - [x] T4.3 — Query: `system_events` `.select("created_at, message, source")` `.eq("level","error")` `.gte("created_at", agora - 15min)` `.order("created_at")` — **sem** filtro de `category` (o incidente atingiu `webhook` e `cron`; filtrar por categoria perderia metade dos caminhos)
  - [x] T4.4 — Classificar cada linha (T1.1), agrupar por tipo → `{ tipo: { ocorrencias, primeiraOcorrencia } }`
  - [x] T4.5 — Para cada tipo com `deveAlertar(tipo, ocorrencias)`: `logEventOnce({ level:"warn", category:"system", event_type:"NICOLE_HEALTH_ALERTA", dedupe_key: \`nicole-health:${tipo}:${horaIsoTruncadaNaHora}\`, ... })`; só envia se `inserted === true` (AC5/AC6)
  - [x] T4.6 — Enviar via T2 e responder summary: `{ ok, janelaMin, porTipo, alertasEnviados, dedupPulados, dryRun }`
  - [x] T4.7 — `?dry=1` pula T4.5 (marcador) e T4.6 (envio) (AC9)
  - [x] T4.8 — `export const maxDuration = 60` (padrão das rotas de cron do épico)

- [ ] **T5** — Registro do cron e das envs
  - [x] T5.1 — `packages/web/vercel.json`: adicionar `{ "schedule": "*/10 * * * *", "path": "/api/cron/nicole-health" }`. ⚠️ **Conferir o total antes**: hoje são **36 crons**; este é o **37º**. O plano Vercel Pro limita a **40 cron jobs** — se o `vercel.json` já estiver em 40 no momento do `*develop`, **parar e escalar ao usuário**, não remover cron alheio por conta própria.
  - [x] T5.2 — Reconferir colisão de horário contra `docs/stories/78-*.story.md` por horários reservados textualmente e ainda não aplicados (disciplina exigida pela 78-13/T3.2). `*/10` já é compartilhado com `sla-alerts` — schedules iguais em paths distintos são permitidos pela Vercel e não colidem.
  - [ ] T5.3 — Criar `ALERTA_SISTEMA_PHONES` em produção com o número do usuário (`5544999761478`). 🔥 **GOTCHA REGISTRADO (CLAUDE.md):** **NUNCA** usar `vercel env add` via stdin/pipe — grava valor **VAZIO** silenciosamente (2 incidentes: VAPID 75-40, `PORTAL_NOTIF_PAUSED` 75-66). Usar `scripts/vercel-env-set.sh` (REST API). Não usar `type:"sensitive"`. A env só vale após `vercel redeploy`.
  - [ ] T5.4 — **Conferir o valor gravado** relendo a env antes de dar a task por concluída (o modo de falha do gotcha é silencioso).

- [x] **T6** — Testes (ver seção Testing)

---

## Dev Notes

### Arquivos de referência obrigatórios (ler antes de implementar)
- `packages/web/src/app/api/cron/sla-alerts/route.ts` — padrão de envio de template a gestores, parsing de env CSV de telefones, config de WhatsApp buscada uma vez, `logWhatsappSend`, kill-switch, `?dry=1`. **É o arquivo mais próximo do que esta story faz.**
- `packages/web/src/app/api/cron/billing-reminders/route.ts` (78-11) — guard `CRON_SECRET`, `Promise.allSettled` best-effort, `?dry=1`.
- `packages/web/src/lib/logger.ts` — `logEventOnce({ dedupe_key })`, devolve `{ inserted }`; `23505` → `inserted:false` **não é erro**, é o dedup funcionando.
- `supabase/migrations/218_system_events_dedupe_nicole.sql` — o índice único parcial `ux_system_events_dedupe_key ON system_events (event_type, (metadata->>'dedupe_key')) WHERE metadata->>'dedupe_key' IS NOT NULL`. **Verificado presente em produção em 28/08/2026** — nenhuma migration nesta story.
- `packages/web/src/lib/whatsapp/send-template.ts` (75-142) — `sendWhatsAppTemplate`; lança em `!res.ok`, então o `.catch` do T2.6 é obrigatório.
- `packages/web/src/app/api/cron/webhook-health/route.ts` — **ler para NÃO copiar duas coisas:** (a) o `isBusinessHoursBRT()`, que cegaria o alerta justamente no horário do incidente (AC8); (b) o `sendTelegramAdminAlert`, que está morto em produção.

### Por que detectar por `system_events` e não instrumentar as chamadas (AUTO-DECISION)
[AUTO-DECISION] Detecção **a partir do que já é gravado**, não instrumentando os pontos de chamada → **reason:** existem **18 chamadas** `anthropic.messages.create` no monorepo (`packages/ai/src/flows/*`, `packages/ai/src/chat/pipeline.ts`, `packages/web/src/lib/pastas/termo/extract.ts`, rotas de `leads/[id]`). Instrumentar cada uma significa 18 pontos para manter e um 19º que alguém esquece no próximo flow. Os catches existentes **já** gravam a mensagem de erro íntegra em `system_events` — os 11 eventos do incidente provam isso, vindos de 3 caminhos diferentes que ninguém precisou tocar. Ler o dado já gravado cobre o passado, o presente e todo flow futuro de graça, com **zero alteração no caminho quente** do webhook. O custo é a latência do cron (≤10 min) e a fragilidade de casar string — mitigada por T1.2 usar as strings reais e por AC4 travar o falso positivo.

### Por que cron e não alerta síncrono no `catch` (AUTO-DECISION)
[AUTO-DECISION] Cron, não envio direto no `catch` do webhook → **reason:** o caminho assíncrono do webhook (`void (async () => {...})()`, `route.ts:1328`) roda **depois** da resposta HTTP; no serverless da Vercel esse trabalho pode ser cortado. Um alerta que depende do mesmo runtime que acabou de falhar é um alerta que se perde exatamente quando é necessário. O cron lê do banco — dado já persistido, execução independente. Também dá agregação natural: 7 falhas viram **1** aviso, não 7.

### Por que limiar 1 para crédito/auth e 3 para rate limit/sobrecarga (AUTO-DECISION)
[AUTO-DECISION] Limiar por tipo → **reason:** crédito esgotado e credencial revogada são estados **absorventes** — não se curam sozinhos e travam 100% do atendimento no primeiro minuto; esperar recorrência só adia o prejuízo (no incidente real, cada minuto de espera era um lead pago sem resposta). Rate limit e sobrecarga são **transitórios por natureza** e o próprio provedor se recupera; alertar na primeira ocorrência geraria fadiga de alerta, que é como um canal de alerta morre. 3 ocorrências em 15 min distingue "pico momentâneo" de "estamos batendo no teto".

### Janela de 15 min com cron de 10 min (sobreposição proposital)
A janela de consulta (15 min) é **maior** que o intervalo do cron (10 min) de propósito: um erro que ocorre nos segundos finais de uma janela seria perdido por um cron de janela justa. A sobreposição gera reprocessamento do mesmo erro na execução seguinte — **inofensivo**, porque o dedup horário (AC5) impede o segundo envio.

### Telefone do destinatário
`5544999761478` (Marcos, `users.role='admin'`) — formato E.164 sem `+`, o mesmo que a Cloud API espera e que `SLA_ESCALATION_PHONES` já usa. A env aceita CSV, então incluir outros admins depois é edição de env, sem deploy de código.

---

## Testing

### Unitários (obrigatórios)
- `packages/web/src/lib/alerts/erro-ia.test.ts` — T1.2, com as strings reais do incidente.
- `packages/web/src/lib/alerts/admin-whatsapp.test.ts` — env vazia → não envia e não lança; 2 números, 1 falhando → o outro recebe (AC12); `sendWhatsAppTemplate` chamado com `alerta_sistema_admin` e exatamente 3 parâmetros.
- `packages/web/src/app/api/cron/nicole-health/route.test.ts` — sem secret → 503; secret errado → 401; `ALERTA_SISTEMA_OFF=1` → `skipped`; lista vazia → `skipped`; 1 erro de crédito → 1 alerta; 2 erros de rate limit → **nenhum** alerta; 3 → alerta; erro não-IA → nenhum alerta (AC4); `logEventOnce` devolvendo `inserted:false` → **não** envia (AC5); `?dry=1` → nada enviado, nada gravado.

### Validação (disciplina obrigatória do projeto)
- ✅ Verificar por **exit code**, nunca por `grep -c` na saída — `grep -c` devolve 0 achados como sucesso e produz **falso verde**.
- ✅ `timeout` **não existe** no macOS por padrão; não usar em script de validação sem `gtimeout`/fallback.
- ✅ Cada teste novo precisa ser **capaz de reprovar**: escrever o teste, vê-lo vermelho, então implementar. Um teste que passa contra uma implementação vazia não testa nada.
- ✅ `npm run lint` e `npm run typecheck` limpos antes do gate.

### Validação em produção (após deploy, antes de fechar a story)
1. `GET /api/cron/nicole-health?dry=1` com o `CRON_SECRET` → conferir summary sem envio.
2. Reler `ALERTA_SISTEMA_PHONES` em produção e conferir que **não está vazia** (o gotcha silencioso do T5.3).
3. Prova de fogo do canal: um `?dry=0` numa janela em que exista erro classificável, **ou** inserção controlada de um `system_event` de teste — combinar com o usuário antes, porque dispara WhatsApp real.

---

## CodeRabbit Integration

Review automático roda pelo GitHub App no PR. Achado do bot **não bloqueia merge** e não precisa ser reportado ao usuário, salvo defeito vital verificado no código.

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-08-28 | 1.0 | Story criada a partir do incidente real de 27-28/08/2026 (saldo Anthropic esgotado, 22h sem detecção, 3 leads sem resposta). Canal WhatsApp escolhido pelo usuário. | @sm (River) |
| 2026-08-28 | 1.2 | Implementação (YOLO): classificador + canal + cron + 42 testes (3 arquivos), mutação executada nos 3 pontos críticos, suíte completa verde (3219). T3 (template Meta) e T5.3 (env) bloqueados por Q1/Q2. Status → `Ready for Review`. | @dev (Dex) |
| 2026-08-28 | 1.1 | Validação: **GO condicional 8.5/10**. Fixes aplicados: (F1) renumerada `78-16` → `87-19` e movida do Epic 78 para o Epic 87 — nenhum FR do 78 cobre runtime; (F2) seção **Riscos & Mitigação** criada (R1-R6); (F3) **AC14** — config de WhatsApp ausente não pode consumir o dedup; (F4) **Questões Abertas** Q1/Q2 registradas. Status `Draft` → `Ready`. | @po (Pax) |

---

## Dev Agent Record

- **Agent Model Used:** claude-opus-5[1m] (@dev / Dex, modo YOLO)

- **Debug Log References:**
  - Strings de erro reais extraídas de `system_events` em produção (`message ilike '%credit balance%'`) e fixadas em `erro-ia.test.ts`.
  - Suíte completa: **260 arquivos, 3219 testes, 0 falhas** (`npx vitest run`, exit 0).
  - Typecheck `tsc --noEmit` exit 0; `npm run lint` exit 0 (warnings restantes são pré-existentes no repo).

- **Completion Notes:**

  1. **Teste de mutação executado** (disciplina do projeto: teste que não reprova não testa nada):
     - Mutante `classificarErroIA → return "credito"` → **7 testes vermelhos**.
     - Mutante `if (!inserted)` neutralizado (ignora o dedup) → **1 vermelho** (AC5).
     - Mutante `deveAlertar → true` (ignora limiar) → **1 vermelho** (AC3).
     - Todos revertidos; suíte verde depois.
  2. **Classificação pelo `error.type`, não pela frase.** `rate_limit_error`/`overloaded_error`/
     `authentication_error` são contrato de API; o texto em inglês não é. É também o que impede o
     falso-positivo mais provável: a Graph API do WhatsApp devolve `(#80007) rate limit hit`, que
     casaria com um ingênuo `"rate limit"` mas nunca com `rate_limit_error`. Há teste para isso.
     `credito` é a exceção que precisa da frase — saldo esgotado não tem `error.type` próprio na
     Anthropic, vem como `invalid_request_error` genérico.
  3. **`insufficient_quota` (OpenAI) incluído em `credito`** — o projeto tem `OPENAI_API_KEY` em
     produção e o mesmo modo de falha se aplica. Decisão autônoma, dentro do escopo "erro da API de IA".
  4. **Ordem no cron: detectar → carregar canal → gravar dedup → enviar.** Carregar a config do
     WhatsApp só depois de saber que há algo a alertar evita I/O à toa nas ~143 execuções diárias em
     que nada acontece, e é o que faz o AC14 funcionar sem gambiarra.
  5. **`vercel.json` editado por script com asserção de teto** (`assert n < 40`) em vez de edição
     manual — o diff saiu com 4 linhas adicionadas e nada reformatado. Total: 36 → 37 crons.
  6. **CodeRabbit CLI não executado.** Conforme `.claude/rules/coderabbit-integration.md`, o gatilho
     que vale neste repo é o GitHub App no PR; o CLI nesta máquina falhou com `WebSocket closed` na
     Story 90-1 e a rule manda registrar "não executado" em vez de reportar como aprovado.

- **Bloqueado (não implementado, aguardando o usuário):**
  - **T3 — template `alerta_sistema_admin`**: não submetido à Meta. Sem ele, `sendWhatsAppTemplate`
    devolve 400 e nenhum alerta sai. É o único item que impede a story de funcionar de ponta a ponta.
  - **T5.3/T5.4 — `ALERTA_SISTEMA_PHONES` em produção**: não gravada (Q1 em aberto). Sem ela o cron
    responde `{ skipped: "sem destinatário" }` — degradação explícita, não quebra.
  - **AC11** deixado sem marcar: depende do texto final aprovado pela Meta.

- **File List:**
  - `packages/web/src/lib/alerts/erro-ia.ts` (novo)
  - `packages/web/src/lib/alerts/erro-ia.test.ts` (novo)
  - `packages/web/src/lib/alerts/admin-whatsapp.ts` (novo)
  - `packages/web/src/lib/alerts/admin-whatsapp.test.ts` (novo)
  - `packages/web/src/app/api/cron/nicole-health/route.ts` (novo)
  - `packages/web/src/app/api/cron/nicole-health/route.test.ts` (novo)
  - `packages/web/vercel.json` (modificado — 1 entrada de cron)
  - `docs/stories/87-19-alerta-quando-a-nicole-para-por-erro-da-api.story.md` (esta story)
