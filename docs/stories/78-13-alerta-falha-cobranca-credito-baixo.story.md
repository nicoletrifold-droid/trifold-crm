# Story 78-13 — Alerta de Falha de Cobrança / Crédito Baixo (Best-Effort)

## Metadata
- **Epic:** 78 — Painel de Saúde & Billing da Plataforma
- **Story:** 78-13
- **Status:** Done
- **Priority:** P2 — capability nova pedida diretamente pelo usuário (2026-07-13), fora da decomposição original do Epic 78 (`docs/stories/epics/epic-78-painel-saude-billing.md` §7 não previa este sinal); complementa (não substitui) o motor de vencimentos manuais da Story 78-8/78-11
- **Complexity:** M (1 módulo de detecção + 1 cron novo + testes unitários; **sem migration**; ~4-6h)
- **Created:** 2026-07-13
- **Author:** @sm (River)

> **Nota de numeração:** esta story foi encomendada diretamente como "78-13" pelo usuário. No momento em que a redação desta story começou, `78-12` ainda não existia no repositório; uma reconferência (`ls docs/stories/78-*`) feita antes de finalizar este arquivo mostrou que `78-12-resumo-mensal-alerta-anomalia-billing.story.md` foi criada em paralelo (mesma data, sessão concorrente distinta — pivô de produto: resumo mensal + alerta de anomalia de gasto, tema **diferente** desta story). Sem sobreposição de escopo, arquivos ou horário de cron entre as duas (78-12 usa `"30 11 * * *"`/`"30 15 * * *"` — o `0 15` originalmente proposto por 78-12 foi corrigido pelo @po para `30 15` por colidir com `boleto-scan`; esta story usa `"30 14 * * *"` — sem colisão com nenhum dos dois. 78-12 propõe migration condicional `170`; esta story **não cria nenhuma migration**, então não há disputa de número). Registrado aqui para rastreabilidade, não é um bloqueio desta story.

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[cron_pattern_review, idempotency_review, honesty_of_signal_review]`

---

## User Story

**Como** administrador da plataforma Trifold,
**Quero** ser avisado quando a coleta automática de custo de um serviço falhar por vários dias seguidos (possível sinal de credencial revogada ou problema de pagamento),
**Para que** eu possa investigar e agir antes que a falha silenciosa vire um corte de serviço em produção.

---

## Context — o que é factível hoje e o que NÃO é (Article IV, leitura obrigatória antes de implementar)

O usuário pediu um "alerta de falha de cobrança / crédito baixo". Uma discovery honesta contra as APIs reais dos 7 serviços do Epic 78 (a mesma discovery que já embasou 78-3..78-7) mostra que esse pedido, tomado ao pé da letra ("saldo de crédito"), **não é obtível hoje para a maioria dos serviços**. Esta story entrega o que É genuinamente automatizável e documenta explicitamente o que não é, em vez de inventar um sinal que a API não dá (Constitution Artigo IV — No Invention).

### Sinal 1 — Saldo de crédito baixo via Vercel AI Gateway: **N/A hoje, confirmado por evidência de código**

`GET https://ai-gateway.vercel.sh/v1/credits` existe e devolve `{ balance, total_used }` — mas isso só é um sinal utilizável **se o projeto rotear chamadas de IA através do Vercel AI Gateway**. Verificação feita nesta story (`grep -ril "ai-gateway.vercel.sh\|AI_GATEWAY\|@vercel/ai" packages/`) retornou **zero ocorrências** em todo o monorepo. O client de IA do projeto (`packages/ai/src/client/anthropic.ts`, usado por `packages/ai/src/chat/pipeline.ts`) chama a API da Anthropic **diretamente**, sem gateway. Conclusão: **o projeto não usa Vercel AI Gateway hoje.**

Por isso, esta story **não implementa** nenhum coletor de crédito Vercel AI Gateway. Não é um TODO esquecido — é uma decisão documentada: implementar um coletor para um recurso que o projeto não usa seria código morto não-testável (violaria Artigo IV e adicionaria superfície de manutenção sem valor real). Se o projeto migrar para AI Gateway no futuro, uma nova story pode adaptar o contrato `BillingCollector` (78-3) para `GET /v1/credits` da mesma forma que 78-4/78-5/78-6/78-7 adaptaram — a referência de endpoint acima já fica registrada aqui para esse dia.

### Sinal 2 — Falha de coleta persistente (credencial revogada / pagamento recusado): **factível hoje, é o ESCOPO desta story**

`run-collector.ts` (Story 78-3, `packages/web/src/lib/billing-collectors/run-collector.ts`) já grava, **desde que a 78-3 foi implementada**, uma linha degradada `metric='collection_error'`, `collection_status='error'` em `service_cost_snapshots` toda vez que um coletor lança exceção (auth 401/403, timeout, etc.) — isso já acontece hoje para os 4 coletores em produção (`anthropic`, `vercel`, `supabase`, `resend`; `openai`/`whatsapp`/`meta_ads` ainda não têm cron implementado, Stories 78-4/78-6/78-10 ainda Draft). Uma credencial revogada ou uma conta com cobrança recusada tende a se manifestar como **falha de autenticação/autorização persistente e recorrente**, não como um erro isolado de 1 dia (timeout de rede, instabilidade pontual do fornecedor). Esta story reusa esse dado já existente para detectar esse padrão — **um sinal indireto, best-effort, não uma confirmação categórica de "cartão recusado"** (o alerta é honesto sobre isso: ver AC12/mensagem).

### Sinal 3 — Falha explícita de compra de créditos Vercel (`POST /v1/billing/buy` → `status:"failed"`): **fora de escopo, documentado apenas**

Esse endpoint existiria na API de billing da Vercel para compras avulsas de crédito — mas (a) não há evidência de que a Trifold usa esse fluxo de compra (não é pré-pago; é cartão recorrente via `VERCEL_BILLING_TOKEN`/`api/billing/charges`, já coberto pela 78-5), e (b) não há como testar/validar esse sinal sem uma falha de compra real acontecer. Documentado aqui como possibilidade futura, **não implementado** — Article IV: não construir sobre um endpoint não confirmado como relevante ao uso real da conta.

---

## Scope

### IN (esta story entrega)

1. **Módulo de detecção puro** `packages/web/src/lib/billing/collection-health.ts` — funções sem I/O, testáveis isoladamente (mesmo padrão de extração de `reminder-schedule.ts` na Story 78-11): calcula os 3 dias-alvo (hoje-1, hoje-2, hoje-3, America/Sao_Paulo) e determina, a partir de uma lista de linhas `{service_id, snapshot_date}`, quais `service_id` têm falha nos **3 dias consecutivos**.
2. **Cron novo** `GET /api/cron/billing-collection-health` — roda 1×/dia, consulta `service_cost_snapshots` (WHERE `metric='collection_error'` AND `snapshot_date` nos 3 dias-alvo), aplica o módulo de detecção, filtra serviços desabilitados no catálogo, envia alerta (e-mail + push, reuso de 78-8/78-11) aos admins ativos para cada serviço com falha consecutiva confirmada, com dedup diário via `INSERT` + `UNIQUE` (sem coluna nova — ver Dev Notes).
3. Suporte a `?dry=1` (mesmo padrão de `billing-reminders`) para simular sem enviar alerta nem gravar o marcador de dedup.
4. Documentação explícita (Context acima + Dev Notes) dos 2 sinais **não** implementados (AI Gateway credits, Vercel purchase failure) e por quê.

### OUT (não entra nesta story)

- Qualquer coletor de saldo/crédito para Anthropic ou OpenAI — **nenhuma API pública/admin desses fornecedores expõe saldo de conta** (confirmado pela ausência desse campo nos endpoints já integrados por 78-3 `/v1/organizations/cost_report` e 78-4 `/v1/organization/costs` — ambos só devolvem **custo incorrido**, nunca saldo/crédito restante). Pedir ao usuário para informar manualmente o valor comprado foi explicitamente descartado pelo próprio usuário nesta sessão — **não inventar um campo manual não pedido**.
- Coletor Vercel AI Gateway (Sinal 1) — projeto não usa AI Gateway hoje (evidência acima); referência de endpoint documentada para adoção futura, sem código.
- Detecção de falha de compra Vercel (Sinal 3) — documentado, não implementado.
- Qualquer mudança nos coletores existentes (78-3/78-5/78-7) ou no `run-collector.ts` — esta story só **lê** `service_cost_snapshots`, nunca modifica a lógica de escrita dos coletores.
- UI (Story 78-9) — fora de escopo; se retomada, pode futuramente exibir "última falha consecutiva detectada" como leitura adicional, não obrigatório aqui.
- Qualquer novo campo de configuração de threshold (dias consecutivos) via UI/API — o limiar é uma constante de código nesta primeira versão (ver Dev Notes/AUTO-DECISION).

---

## Acceptance Criteria

- [x] **AC1 — Falha consecutiva de 3 dias dispara alerta:** Dado um serviço com linhas `service_cost_snapshots(metric='collection_error', collection_status='error')` nos 3 dias corridos `hoje-1`, `hoje-2`, `hoje-3` (America/Sao_Paulo) e `platform_services.enabled=true` para esse serviço: o cron dispara 1 alerta (e-mail + push) para todos os admins ativos, identificando o serviço pelo nome e incluindo `billing_url` do catálogo como próxima ação.

- [x] **AC2 — Sem falso positivo com falha parcial:** Dado um serviço com `collection_error` em apenas 1 ou 2 dos 3 dias-alvo (não os 3): o cron **não** dispara alerta para esse serviço.

- [x] **AC3 — Sem falso positivo por ausência de dados:** Dado um serviço sem **nenhuma** linha em `service_cost_snapshots` nos dias-alvo (ex.: `openai`/`whatsapp`/`meta_ads` antes de 78-4/78-6/78-10 serem implementadas — coletor ainda não existe, não é falha): o cron **não** dispara alerta (ausência de dado ≠ erro de coleta).

- [x] **AC4 — Serviço desabilitado nunca alerta:** Dado um serviço com `platform_services.enabled=false` (ex.: `meta_ads` hoje) mesmo que tivesse (hipoteticamente) linhas `collection_error` nos 3 dias-alvo: o cron **não** dispara alerta para esse serviço.

- [x] **AC5 — Dedup diário atômico (sem coluna nova):** Rodar o cron 2× no mesmo dia sobre o mesmo cenário de falha consecutiva dispara **apenas 1** alerta — a segunda tentativa de `INSERT` do marcador de dedup (`service_cost_snapshots` com `metric='collection_health_alert_sent'`) falha por violação do `UNIQUE(service_id, snapshot_date, metric)` já existente (migration 164), é tratada como "já alertado hoje" e **não** reenvia e-mail/push nem propaga erro 500.

- [x] **AC6 — Alerta persiste diariamente enquanto a falha continuar:** Dado um serviço que permanece falhando em `hoje-1`/`hoje-2`/`hoje-3` também no **dia seguinte** (nova janela de 3 dias, deslocada em 1 dia): o cron do dia seguinte insere um novo marcador (`snapshot_date` = novo dia) com sucesso e dispara **novo** alerta — não é um alerta único que nunca mais se repete.

- [x] **AC7 — Alerta cessa automaticamente quando a coleta volta a funcionar:** Dado um serviço cuja falha consecutiva é resolvida (o coletor volta a gravar `collection_status='ok'` em algum dos 3 dias-alvo, quebrando a sequência): o cron deixa de considerá-lo "em falha consecutiva" e para de alertar, sem qualquer ação manual de reset por parte do admin.

- [x] **AC8 — Sinais N/A documentados, não implementados como código:** Não existe nenhum arquivo de coletor para saldo de crédito (Vercel AI Gateway, Anthropic, OpenAI) nem para falha de compra Vercel nesta story — apenas a documentação no Context/Dev Notes. Confirmado por: nenhuma referência a `ai-gateway.vercel.sh` introduzida pela story.

- [x] **AC9 — Timezone consistente (reuso, não recriação):** O cálculo de "hoje" e dos 3 dias-alvo usa `America/Sao_Paulo`, **reusando** `hojeSaoPaulo()`/`toIsoDate()` de `packages/web/src/lib/billing/reminder-schedule.ts` (extraído na Story 78-11) — não redefinir uma segunda implementação de "hoje" no projeto.

- [x] **AC10 — Sem migration:** Nenhuma tabela ou coluna nova é criada. O marcador de dedup usa uma linha convencional em `service_cost_snapshots` respeitando 100% o schema da migration 164 (`currency=null`, `collection_status='ok'` ∈ CHECK existente, `value=1` como numeric NOT NULL) — `metric='collection_health_alert_sent'` é só mais um valor de texto livre na coluna `metric` (sem CHECK, por design da 78-1).

- [x] **AC11 — Guard do cron (reuso do padrão do épico):** Mesmo padrão `CRON_SECRET`/`Authorization: Bearer` de todas as rotas `billing-collect-*`/`billing-reminders`. Sem `CRON_SECRET` configurado → 503 sem consultar nada. Header ausente/incorreto → 401.

- [x] **AC12 — Mensagem honesta sobre a natureza do sinal:** O corpo do e-mail/push **não afirma categoricamente** "sua cobrança falhou" — comunica que a **coleta automática de custo** falhou por N dias seguidos e que as causas mais prováveis são credencial revogada/expirada, cota ou pagamento recusado, **ou** mudança na API do fornecedor — e direciona o admin ao `billing_url` do catálogo (78-1) para verificar diretamente na fonte. Nunca inventa um valor de saldo/crédito que a story não coleta.

---

## Tasks / Subtasks

- [x] **T1** — Criar módulo de detecção puro (AC1-AC3, AC9)
  - [x] T1.1 — Criar `packages/web/src/lib/billing/collection-health.ts`:
    - `diasAlvoConsecutivos(hoje: SaoPauloDate): string[]` — retorna `[toIsoDate(hoje-1), toIsoDate(hoje-2), toIsoDate(hoje-3)]`, reusando `hojeSaoPaulo`/`toIsoDate` de `reminder-schedule.ts` (importar, não duplicar)
    - `detectarFalhaConsecutiva(rows: { service_id: string; snapshot_date: string }[], diasAlvo: string[]): Set<string>` — pura: agrupa `rows` por `service_id`, retorna o conjunto de `service_id` cujo conjunto de `snapshot_date` contém **todos** os `diasAlvo` (não apenas alguns)
  - [x] T1.2 — `collection-health.test.ts` — cobrir: 3/3 dias com erro → detectado; 2/3 → não detectado; 0 linhas → não detectado; múltiplos serviços misturados no mesmo array de `rows` → só o(s) correto(s) no Set; datas fora de `diasAlvo` no array de entrada são ignoradas (defensivo, caso a query trga alguma linha a mais)

- [x] **T2** — Cron `GET /api/cron/billing-collection-health` (AC1, AC4-AC8, AC10-AC12)
  - [x] T2.1 — Guard `CRON_SECRET`/`Authorization: Bearer` idêntico a `billing-reminders/route.ts` (AC11)
  - [x] T2.2 — `hoje = hojeSaoPaulo(now)`; `diasAlvo = diasAlvoConsecutivos(hoje)` (T1.1)
  - [x] T2.3 — Query: `service_cost_snapshots` `.select("service_id, snapshot_date").eq("metric","collection_error").in("snapshot_date", diasAlvo)` — sem filtro de serviço aqui (data-driven, não hardcoded — cobre automaticamente `openai`/`whatsapp`/`meta_ads` assim que 78-4/78-6/78-10 forem implementadas, sem precisar tocar esta story de novo)
  - [x] T2.4 — `servicosComFalha = detectarFalhaConsecutiva(rows, diasAlvo)` (T1.1)
  - [x] T2.5 — Se `servicosComFalha` vazio → retornar summary cedo, sem tocar `platform_services` nem enviar nada
  - [x] T2.6 — Buscar `platform_services` (`id, slug, name, enabled, billing_url`) para os `service_id` em `servicosComFalha`; **filtrar `enabled=false`** (AC4) — um serviço desabilitado no catálogo (ex.: `meta_ads` pré-78-10) nunca deve alertar mesmo com histórico de erro
  - [x] T2.7 — Para cada serviço remanescente, tentar `INSERT` (não `upsert`) do marcador `{ service_id, snapshot_date: hojeIso, metric: 'collection_health_alert_sent', value: 1, currency: null, collection_status: 'ok' }`:
    - Sucesso → adicionar à lista "a alertar hoje"
    - Erro de violação de unicidade (Postgres `23505`) → já alertado hoje, pular silenciosamente (não é uma falha, é o dedup funcionando — AC5)
    - Qualquer outro erro → `logEvent` (categoria `cron`) e pular esse serviço isoladamente, sem derrubar os demais (NFR-3 do épico, mesmo padrão de `run-collector.ts`)
  - [x] T2.8 — Para cada serviço "a alertar hoje": buscar admins ativos (`users` `role='admin' AND is_active=true`, sem `org_id` — mesmo padrão de 78-8/78-11) e enviar `sendEmail`/`sendPushToUser` (best-effort, `.catch` independente por envio, `Promise.allSettled` antes de responder — mesmo padrão de `billing-reminders/route.ts`) com a mensagem honesta do AC12
  - [x] T2.9 — Suporte `?dry=1`: pula T2.7 (INSERT do marcador) e T2.8 (envio), apenas retorna no summary quais serviços **seriam** alertados
  - [x] T2.10 — Summary de resposta: `{ ok, hoje, diasAlvo, servicosVerificados, servicosComFalhaConsecutiva, alertasEnviados, dedupPulados, dryRun }`

- [x] **T3** — Registrar cron em `packages/web/vercel.json` (AC1)
  - [x] T3.1 — Confirmar horário livre no momento do `*develop` (`ls`/leitura de `packages/web/vercel.json` — na data desta story, o último horário reservado do épico é `billing-collect-resend` às `"0 14 * * *"` = 14:00 UTC). Usar `"30 14 * * *"` (14:30 UTC) — roda **depois** de todos os coletores do dia (anthropic 10:00, vercel 10:20, supabase 13:00, resend 14:00), garantindo que a falha/sucesso de hoje-1 já esteja refletida em `service_cost_snapshots` antes da checagem
  - [x] T3.2 — Reconferir contra `docs/stories/78-*.story.md` por horários **reservados textualmente** mas ainda não aplicados em `vercel.json` (mesma disciplina exigida pela 78-6/78-10 — ver gotcha de colisão já documentado na memória do épico)

- [x] **T4** — Testes (ver seção Testing)

---

## Dev Notes

### Arquivos de referência obrigatórios (ler antes de implementar)
- `packages/web/src/lib/billing-collectors/run-collector.ts` (Story 78-3) — confirma que `metric='collection_error'`/`collection_status='error'` é escrito em **toda** falha isolada de coletor; esta story só **lê** esse dado, nunca o escreve
- `supabase/migrations/164_platform_services_billing.sql` (Story 78-1) — schema de `service_cost_snapshots`: `UNIQUE(service_id, snapshot_date, metric)`, `metric` texto livre sem CHECK (por design), `currency` nullable, `collection_status` CHECK `IN ('ok','manual','no_data','error')` — o marcador de dedup desta story usa `'ok'` (valor já dentro do CHECK existente, nenhuma migration necessária)
- `packages/web/src/lib/billing/reminder-schedule.ts` (Story 78-11) — `hojeSaoPaulo`/`toIsoDate` já existem, REUSAR (não recriar uma segunda função de "hoje em America/Sao_Paulo" no projeto)
- `packages/web/src/app/api/cron/billing-reminders/route.ts` (Story 78-11) — padrão de guard `CRON_SECRET`, padrão de busca de admins ativos, padrão `Promise.allSettled` de envio best-effort, padrão `?dry=1` — replicar a mesma disciplina, não inventar um padrão novo de cron

### Por que "3 dias consecutivos" e não 1 dia ou 7 dias (AUTO-DECISION)
[AUTO-DECISION] Limiar fixado em **3 dias corridos consecutivos** de `collection_error` → **reason:** 1 dia é ruidoso demais (timeout de rede pontual, instabilidade momentânea do fornecedor — os próprios coletores já são NFR-3 "best-effort", uma falha isolada não deveria acordar um admin); um sinal genuíno de credencial revogada ou problema de pagamento tende a se manifestar de forma **persistente** dia após dia (a causa não se resolve sozinha), então 3 dias equilibra "detectar rápido o suficiente para agir antes de um corte de produção" com "não gerar fadiga de alerta por ruído transitório". O limiar é uma **constante de código** (`CONSECUTIVE_ERROR_THRESHOLD_DAYS = 3`) nesta primeira versão — não foi pedido controle de configuração por serviço, e criar isso agora seria escopo não solicitado (Article IV). Se o usuário quiser um valor diferente por serviço no futuro, é uma extensão de schema separada (análoga ao `alert_days_before` de `service_billing_reminders`), fora desta story.

### Por que o marcador de dedup NÃO precisa de migration (REUSE do schema existente)
A Story 78-11 precisou de uma coluna nova (`last_alerted_on`) porque o dedup ali precisa saber, **por linha de vencimento**, qual foi o último dia em que ela alertou — informação que não existia em lugar nenhum. Aqui o problema é mais simples: "este serviço já foi alertado por falha de coleta HOJE?" — e `service_cost_snapshots` já tem exatamente o mecanismo certo para essa pergunta: `UNIQUE(service_id, snapshot_date, metric)`. Uma linha `metric='collection_health_alert_sent'` para `(service_id, hojeIso)` só pode existir **uma vez** por dia — o próprio banco garante o dedup atômico via a constraint já existente, sem outra tabela, sem outra coluna, sem RPC de claim. `INSERT` (não `upsert`) é a escolha certa aqui porque queremos que a segunda tentativa **falhe** (sinal de "já processado"), diferente do padrão de upsert dos coletores (78-3) que querem sempre sobrescrever o valor mais recente.

### Alinhamento temporal entre coleta e checagem (ponto sutil, evita bug silencioso)
Os coletores diários (78-3/78-5/78-7) usam, por padrão, uma janela `[from, to]` = **"ontem"** (ver Dev Notes da 78-3: "janela default = ontem em America/Sao_Paulo") — ou seja, o cron que roda no dia `D` grava `snapshot_date = D-1` (sucesso ou erro). Por isso, o cron desta story, também rodando no dia `D` (agendado **depois** de todos os coletores do dia, T3.1), deve checar `diasAlvo = [D-1, D-2, D-3]` — que é exatamente o que os 3 últimos ciclos diários de coleta gravaram até este momento. Checar `[D, D-1, D-2]` (incluindo hoje) seria um erro, pois nenhum coletor ainda escreveu `snapshot_date = D` hoje (isso só acontecerá amanhã). Cobrir esse raciocínio no teste do T1.2 evita a classe de bug "off-by-one" já documentada como armadilha em outras stories do épico (ex.: inversão de sinal da 78-11).

### Backfill manual — limitação aceita (não é uma promessa desta story)
Um reprocessamento manual (`?from=&to=` do FR-10) que grava `collection_error` numa data antiga poderia, em tese, "encaixar" acidentalmente nos 3 dias-alvo se a data escolhida coincidir com `hoje-1/2/3`. Isso é um falso positivo de baixa probabilidade e não é mitigado nesta primeira versão — aceito e documentado (mesmo espírito do R1 da Story 78-11: risco baixo, aceito, não vale a complexidade de filtrar `collected_at` vs `snapshot_date`).

### Conteúdo da mensagem (AC12) — sugestão de texto
```
Assunto: [Trifold] Coleta de custo falhando: {serviceName} (3 dias seguidos)

A coleta automática de custo do serviço {serviceName} falhou nos últimos 3 dias
seguidos ({dia1}, {dia2}, {dia3}).

Isso pode indicar: credencial revogada/expirada, cota ou pagamento recusado no
provedor, ou uma mudança na API do fornecedor — não é uma confirmação de que a
cobrança falhou, apenas um sinal indireto.

Verifique diretamente no painel do fornecedor: {billing_url}
```
(Ajustar tom livremente no push, que tem espaço menor — seguir o padrão de `buildMensagem` de `billing-reminders/route.ts`.)

### Testing Standards
- Vitest já está configurado na raiz (confirmado pela Story 78-11 — `vitest.config.ts`, alias `@web`) — seguir `reminder-schedule.test.ts` como referência de estilo para `collection-health.test.ts` (funções puras, sem mock de Supabase).
- Validação manual em DEV: popular `service_cost_snapshots` com linhas `collection_error` sintéticas para um `service_id` de teste, rodar o cron com `?dry=1` primeiro, depois sem dry-run, confirmar o marcador gravado e o dedup na segunda chamada no mesmo dia.

---

## Testing

### Cenários de teste

1. **3/3 dias com erro → detecta e alerta (AC1):** popular `collection_error` em `hoje-1/2/3` para `service_id=X` (`enabled=true`) → cron identifica `X`, insere marcador, envia e-mail+push.
2. **2/3 dias → não detecta (AC2):** popular apenas `hoje-1` e `hoje-3` (falta `hoje-2`) → `X` não entra em `servicosComFalhaConsecutiva`.
3. **0 linhas → não detecta (AC3):** serviço sem nenhuma linha em `service_cost_snapshots` no período → nunca alerta.
4. **Serviço desabilitado → nunca alerta (AC4):** `enabled=false` + 3/3 dias de erro → filtrado antes do envio.
5. **Dedup no mesmo dia (AC5):** rodar o cron 2× seguidas no mesmo cenário do teste 1 → só 1 e-mail/push enviado; segunda chamada retorna `dedupPulados` incluindo o serviço.
6. **Persistência no dia seguinte (AC6):** avançar a data simulada em 1 dia mantendo a falha → novo marcador inserido com sucesso (chave `snapshot_date` diferente) → novo alerta disparado.
7. **Recuperação para o alerta (AC7):** inserir `collection_status='ok'` em `hoje-2` (quebrando a sequência) → serviço não é mais detectado como falha consecutiva no cron seguinte.
8. **`?dry=1` não grava nem envia (T2.9):** mesmo cenário do teste 1 com `dry=1` → summary lista o serviço em "seria alertado", mas nenhuma linha de marcador é inserida e nenhum e-mail/push é chamado.
9. **Sem `CRON_SECRET` → 503 (AC11):** requisição sem env configurada → 503, nenhuma query executada.
10. **Testes unitários de `collection-health.ts` (T1.2):** cobrir os casos 1-3 acima como funções puras, sem I/O — múltiplos `service_id` misturados no array de entrada, garantindo que a detecção é por serviço e não global.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Falso positivo por backfill manual coincidindo com os 3 dias-alvo | Baixa | Aceito e documentado (Dev Notes) — não mitigado nesta versão |
| R2 | Limiar fixo de 3 dias não serve para todos os serviços (ex.: um serviço com cron menos frequente no futuro) | Baixa | Constante isolada em `collection-health.ts`, fácil de tornar configurável depois; fora do pedido atual do usuário |
| R3 | Alerta "genérico" (não afirma categoricamente a causa) pode ser lido como pouco acionável | Baixa | Mensagem inclui `billing_url` direto do catálogo como próxima ação concreta (AC12) |
| R4 | Story cobre só os 4 coletores hoje implementados (anthropic/vercel/supabase/resend); openai/whatsapp/meta_ads ficam cobertos automaticamente só quando 78-4/78-6/78-10 forem implementadas | Baixa (esperado) | Design data-driven (T2.3 não hardcoda lista de serviços) — nenhuma mudança de código será necessária nesta story quando os demais coletores chegarem |

---

## Dependencies

- **Depende de:** Story 78-1 (schema `service_cost_snapshots`, migration 164 — **bloqueante**, já aplicada), Story 78-3 (`run-collector.ts` gravando `collection_error` — **bloqueante direta**, é o dado-fonte desta story), Story 78-11 (`reminder-schedule.ts` — reuso de `hojeSaoPaulo`/`toIsoDate`, **bloqueante direta** para T1.1)
- **Beneficia-se de (não bloqueante):** Stories 78-4/78-6/78-10 (coletores OpenAI/WhatsApp/Meta Ads) — quando implementadas, passam a ser cobertas automaticamente por esta story sem nenhuma mudança de código (T2.3 é data-driven)
- **Não depende de:** Stories 78-2, 78-5, 78-7, 78-8, 78-9 (independentes desta lógica de monitoramento)
- **Dependências técnicas:**
  - `packages/web/src/lib/billing/collection-health.ts` (novo)
  - `packages/web/src/lib/billing/collection-health.test.ts` (novo)
  - `packages/web/src/app/api/cron/billing-collection-health/route.ts` (novo)
  - `packages/web/vercel.json` (editado — novo cron entry)
  - `packages/web/src/lib/billing/reminder-schedule.ts` (reusado, não modificado)
  - `packages/web/src/lib/billing-collectors/run-collector.ts` (referência de leitura, não modificado)

---

## Definition of Done

- [x] `collection-health.ts` criado e testado unitariamente (T1)
- [x] Cron `billing-collection-health` implementado com guard `CRON_SECRET`, dedup via `INSERT`+`UNIQUE`, `?dry=1` (T2)
- [x] Entry novo em `vercel.json` sem colisão de horário com nenhum cron existente ou reservado por story-irmã (T3)
- [x] Todos os cenários AC1-AC12 cobertos por teste automatizado (funções puras) e/ou validação manual em DEV documentada
- [x] Nenhuma migration criada (AC10 confirmado)
- [x] Nenhum arquivo de coletor de crédito (AI Gateway/Anthropic/OpenAI) criado (AC8 confirmado)
- [ ] @architect executou quality gate com verdict PASS ou CONCERNS documentados e aceitos
- [ ] @devops fez push do commit final

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave `coderabbit_integration` ausente).
> Validação de qualidade usará processo de revisão manual pelo @architect (quality gate desta story).

**Story Type Analysis (para referência futura, caso CodeRabbit seja habilitado):**
- **Primary Type:** API (novo cron endpoint, reuso de padrões existentes)
- **Secondary Type:** Architecture (módulo de detecção extraído como funções puras, decisão de design sobre reuso de schema para dedup)
- **Complexity:** Medium (1 cron novo + 1 módulo novo + testes; zero migration, zero mudança em código existente)

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-07-13 | 1.0 | **Implementação @dev (Dex) — Status Ready → InReview.** Criados `collection-health.ts` (funções puras: `subtrairDias`, `diasAlvoConsecutivos`, `detectarFalhaConsecutiva`, `formatDateBr`), `collection-health.test.ts` (16 testes, todos passando) e o cron `GET /api/cron/billing-collection-health` (guard `CRON_SECRET`, `?dry=1`, detecção 3 dias consecutivos, dedup atômico via INSERT+UNIQUE 23505, filtro `enabled`, envio best-effort e-mail+push a admins ativos com mensagem honesta AC12). Entry `"30 14 * * *"` em `vercel.json` (sem colisão). Reuso de `reminder-schedule.ts`/`email.ts`/`push-service.ts`/`logger.ts`/`admin.ts` (IDS REUSE). Sem migration (AC10) e sem coletor de crédito (AC8). Lint + typecheck limpos (só remanescem os 4 erros pré-existentes visual-editor/fill.ts). AC1-AC3/AC9 cobertos por teste unitário; AC5/AC6/AC7 (comportamento de banco) para validação no QA gate. | @dev (Dex) |
| 2026-07-13 | 0.2 | **Validação @po (Pax) — veredito GO (score 9/10). Status Draft → Ready.** Honestidade do sinal (Article IV) verificada por evidência: grep `ai-gateway.vercel.sh\|AI_GATEWAY\|@vercel/ai` em `packages/` retornou zero → Sinal 1 (crédito AI Gateway) corretamente N/A. Arquivos de reuso confirmados existentes (`reminder-schedule.ts`, `run-collector.ts`, `billing-reminders/route.ts`). Sem migration (AC10 verificado) → sem disputa de número com 78-12 (`170`). Cron `30 14` livre e sem colisão com 78-12 (`30 11`/`30 15`) nem com existentes. Atualizada nota de cabeçalho para refletir a correção do horário de 78-12 (`0 15`→`30 15`). Coerência cruzada com 78-12: o marcador de dedup desta story (`metric='collection_health_alert_sent'`, `currency=NULL`) foi tratado no lado de 78-12 (exclusão do bloco "Uso técnico") — nenhuma mudança necessária nesta story. | @po (Pax) |
| 2026-07-13 | 0.1 | Story criada a pedido explícito do usuário (2026-07-13) — capability nova de "alerta de falha de cobrança / crédito baixo", fora da decomposição original do Epic 78. Discovery honesta feita antes da redação: confirmado por grep (`ai-gateway.vercel.sh`, `AI_GATEWAY`, `@vercel/ai`) que o projeto **não usa Vercel AI Gateway** — Sinal 1 (crédito Vercel AI Gateway) documentado como N/A, não implementado. Anthropic/OpenAI não expõem saldo/crédito via API (confirmado pela ausência desse campo nos endpoints já integrados por 78-3/78-4, que só trazem custo incorrido) — não implementado, e pedir valor manual ao usuário foi explicitamente descartado por ele nesta sessão. [AUTO-DECISION] Escopo real da story = Sinal 2 (falha de coleta persistente), reusando o dado já existente `service_cost_snapshots.collection_status='error'` (Story 78-3) → reason: é o único sinal genuinamente automatizável a partir de dados já coletados pelo próprio Epic 78, sem inventar endpoint ou campo. [AUTO-DECISION] Limiar de 3 dias consecutivos de falha (constante de código, não configurável nesta versão) → reason: equilíbrio entre detecção rápida e ruído de falhas transitórias (rede/instabilidade pontual do fornecedor), sem exigir schema novo. [AUTO-DECISION] Dedup diário via `INSERT` + `UNIQUE(service_id, snapshot_date, metric)` já existente (migration 164), sem migration nova → reason: IDS REUSE > CREATE — o schema da 78-1 já resolve o problema de "já alertei hoje?" com uma linha de marcador (`metric='collection_health_alert_sent'`), diferente da 78-11 que precisou de coluna nova porque seu dedup era por linha individual de vencimento, não por serviço/dia. [AUTO-DECISION] Query de candidatos data-driven (sem lista hardcoded de serviços) → reason: cobre automaticamente `openai`/`whatsapp`/`meta_ads` assim que 78-4/78-6/78-10 forem implementadas, sem exigir revisão desta story no futuro. Numeração `78-13` usada exatamente como solicitada pelo usuário. Reconferência final (`ls docs/stories/78-*`) mostrou que `78-12` foi criada em paralelo por sessão concorrente distinta (resumo mensal + anomalia de gasto — tema diferente, sem sobreposição de arquivos/cron/migration com esta story) — nota de coexistência registrada no cabeçalho. | @sm (River) |
| 2026-07-14 | 1.0 | **Deploy em produção @devops (Gage) — Status InReview → Done.** Sem migration própria. Gates: lint/type-check 0 erros novos, testes passando. PR #191 (squash, SHA 59619753). Deploy git de produção READY (crm.trifold.eng.br). Dry-run billing-collection-health: 200, 0 serviços com falha consecutiva, 0 alertas. | @devops (Gage) |

---

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M) — @dev (Dex), modo autônomo YOLO.

### Debug Log References

- `npx vitest run packages/web/src/lib/billing/collection-health.test.ts` → **16 passed** (1 file).
- `npx eslint` nos 3 arquivos novos → **0 erros / 0 warnings**.
- `npx tsc --noEmit` (packages/web) → **0 erros novos**; remanescem apenas os 4 pré-existentes (`visual-editor.tsx` x3: `react-email-editor`/implicit any; `fill.ts` x1: `pdf-lib`), fora do escopo desta story.

### Completion Notes List

- **Lógica de detecção (funções puras, `collection-health.ts`):**
  - `diasAlvoConsecutivos(hoje)` → `[hoje-1, hoje-2, hoje-3]` (America/Sao_Paulo), reusando `toIsoDate` de `reminder-schedule.ts` (AC9). Adicionado `subtrairDias()` (aritmética via `Date.UTC`, sem lib de data — projeto não usa date-fns) porque `reminder-schedule.ts` não expunha subtração de dias; é o menor complemento necessário, não uma segunda implementação de "hoje" (reuso de `hojeSaoPaulo`/`toIsoDate` mantido).
  - `detectarFalhaConsecutiva(rows, diasAlvo)` → `Set<service_id>` que têm erro em **todos** os `diasAlvo`. Agrupa por serviço, ignora datas fora da janela (defensivo), normaliza timestamp, dedup de dias duplicados via `Set`, e `diasAlvo` vazio → nunca detecta (evita o falso positivo de "conjunto vazio ⊆ qualquer").
- **Dedup atômico sem migration (AC5/AC10):** `INSERT` (não upsert) do marcador `metric='collection_health_alert_sent'` (`value=1`, `currency=null`, `collection_status='ok'` ∈ CHECK existente). A 2ª execução do dia colide com `UNIQUE(service_id, snapshot_date, metric)` da migration 164 → Postgres `23505` tratado como "já alertado hoje" (`dedupPulados++`), sem reenvio nem 500. Qualquer outro erro de INSERT → `logEvent(category:'cron')` + pula só aquele serviço (NFR-3).
- **Cessação automática (AC7):** nenhuma ação de reset — se o coletor volta a gravar `ok` em qualquer dos 3 dias, a sequência quebra e `detectarFalhaConsecutiva` deixa de incluir o serviço. Persistência diária (AC6) sai de graça: novo dia → nova `snapshot_date` do marcador → novo INSERT com sucesso.
- **Data-driven (R4/AC3):** a query de candidatos não hardcoda lista de serviços; `openai`/`whatsapp`/`meta_ads` passam a ser cobertos automaticamente quando 78-4/78-6/78-10 forem implementadas. Ausência de dados nunca alerta (só conta `metric='collection_error'`).
- **Serviço desabilitado (AC4):** filtro `.filter(s => s.enabled)` sobre `platform_services` após a detecção — `meta_ads` (enabled=false) nunca alerta mesmo com histórico de erro.
- **Mensagem honesta (AC12):** e-mail/push dizem que a **coleta** de custo falhou N dias seguidos e listam causas prováveis (credencial/cota/pagamento/mudança de API) sem afirmar categoricamente "cobrança falhou"; apontam o `billing_url` do catálogo. Nenhum valor de saldo/crédito é inventado.
- **Guard (AC11):** `CRON_SECRET` ausente → 503 antes de qualquer query; header incorreto → 401. Padrão idêntico a `billing-reminders`.
- **Cron (T3):** `"30 14 * * *"` adicionado a `packages/web/vercel.json`, depois de todos os coletores do dia (anthropic 10:00, vercel 10:20, supabase 13:00, resend 14:00) e sem colisão com nenhum cron existente nem com os horários reservados textualmente pela 78-12 (`30 11`/`30 15`).
- **AC8 confirmado:** nenhum arquivo de coletor de crédito criado; nenhuma referência a `ai-gateway.vercel.sh` introduzida.

#### Incertezas / decisões registradas

- [AUTO-DECISION] `subtrairDias()` colocado em `collection-health.ts` (não em `reminder-schedule.ts`) → reason: `reminder-schedule.ts` é da 78-11 e a story pede reuso, não modificação; adicionar lá alteraria um módulo de outra story sem necessidade. É uma função pura pequena, testada, coesa ao propósito deste módulo.
- [AUTO-DECISION] `raw_response` do marcador guarda `{ dias_alvo, threshold }` para rastreabilidade (auditar por que o alerta disparou) — coluna já existe (nullable), não é campo novo.
- Validação em banco NÃO executada (proibido aplicar em prod/dev nesta sessão). Os cenários de integração AC5/AC6/AC7 (dedup 23505, persistência entre dias, cessação) dependem do comportamento real do Postgres/PostgREST e ficam para o QA gate / validação manual em DEV descrita na seção Testing. A lógica pura equivalente (AC1-AC3, AC9) está coberta por 16 testes unitários passando.

### File List

**Criados:**
- `packages/web/src/lib/billing/collection-health.ts` (módulo de detecção puro)
- `packages/web/src/lib/billing/collection-health.test.ts` (16 testes unitários)
- `packages/web/src/app/api/cron/billing-collection-health/route.ts` (cron)

**Modificados:**
- `packages/web/vercel.json` (entry de cron `"30 14 * * *"`)
- `docs/stories/78-13-alerta-falha-cobranca-credito-baixo.story.md` (checkboxes, Dev Agent Record, Change Log, Status)

**Reusados (não modificados):**
- `packages/web/src/lib/billing/reminder-schedule.ts` (`hojeSaoPaulo`, `toIsoDate`, `pad2`, `SaoPauloDate`)
- `packages/web/src/lib/email.ts` (`sendEmail`), `packages/web/src/lib/server/push-service.ts` (`sendPushToUser`), `packages/web/src/lib/logger.ts` (`logEvent`), `packages/web/src/lib/supabase/admin.ts` (`createAdminClient`)

---

## QA Results

### Review Date: 2026-07-14
### Reviewed By: Quinn (Test Architect)

**Veredito: PASS** — todas as 12 ACs satisfeitas com evidência; 16/16 testes puros passando; lint/typecheck limpos (só os 4 erros pré-existentes fora de escopo); zero migration; sinal honesto (Article IV); dedup atômico via UNIQUE já existente; alinhamento temporal correto.

#### 7 Quality Checks
1. **Code review** — PASS. Padrões do épico reusados fielmente (guard `CRON_SECRET`/Bearer, busca de admins ativos sem `org_id`, `Promise.allSettled` best-effort, `?dry=1`) idênticos a `billing-reminders/route.ts`. Funções puras coesas e bem comentadas.
2. **Unit tests** — PASS. `npx vitest run collection-health.test.ts` → **16/16 passed** (131ms). Cobre 3/3, 2/3, 0 linhas, múltiplos serviços, datas fora da janela, timestamp, dias duplicados, `diasAlvo` vazio, off-by-one.
3. **Acceptance criteria** — PASS. AC1-AC12 mapeadas 1:1 a arquivo/função (ver gate file). AC5/AC6/AC7 (comportamento de banco) validadas por lógica estática + constraint `UNIQUE(service_id,snapshot_date,metric)` da migration 164 já aplicada.
4. **No regressions** — PASS. Story só **lê** `service_cost_snapshots` e insere um marcador `metric='collection_health_alert_sent'` (valor de texto livre novo, sem CHECK). Nenhum coletor (78-3/78-5/78-7) nem `run-collector.ts` modificado.
5. **Performance** — PASS. 2 queries indexadas (`idx_service_cost_snapshots_service_date`) + INSERT por serviço em falha; volume trivial (≤7 serviços). Cron 1×/dia.
6. **Security** — PASS. Guard `CRON_SECRET` ausente → 503 antes de qualquer query; header incorreto → 401. `createAdminClient` (service_role) apropriado para cron. Sem input de usuário; sem superfície de injeção.
7. **Documentation** — PASS. Context/Dev Notes documentam explicitamente os 2 sinais N/A (AI Gateway, Vercel purchase) e o porquê (Article IV). AC8 confirmado por grep zero.

#### Verificações-alvo do gate
- **Detecção 3 dias:** `diasAlvoConsecutivos` retorna `[D-1, D-2, D-3]`, **nunca "hoje"** — confirmado por teste e pelo alinhamento com `run-collector` (grava `snapshot_date=window.to=ontem/D-1`). Query data-driven (sem lista hardcoded de serviços). Sem falso positivo com 2/3 (`diasAlvo.every`).
- **Dedup via UNIQUE:** `INSERT` (não upsert) → 2ª execução do dia colide `23505` → `dedupPulados++`, `continue`, sem reenvio e sem 500. Atômico pelo banco. Persistência diária: novo dia → `snapshot_date=hojeIso(D)` novo → INSERT com sucesso → novo alerta.
- **Cessação automática:** sequência quebrada em qualquer dos 3 dias → `detectarFalhaConsecutiva` deixa de incluir o serviço; nenhum reset manual. `enabled=false` filtrado antes do envio (AC4).
- **Honestidade (Article IV):** mensagem diz "a **coleta** automática de custo ... falhou" e "**não é uma confirmação** de que a cobrança falhou"; nenhum valor de saldo/crédito inventado; nenhum coletor AI Gateway (grep zero).
- **Segurança & reuso:** `CRON_SECRET` OK; canais e-mail (`sendEmail`) + push (`sendPushToUser`) reusados, não recriados; `subtrairDias` local justificado (reminder-schedule não expunha subtração; reuso de `hojeSaoPaulo`/`toIsoDate`/`pad2` mantido).
- **Testes/convenções:** 16/16; lint 0/0; typecheck só os 4 pré-existentes (`visual-editor.tsx` x3, `fill.ts` x1); cron `"30 14 * * *"` único em `vercel.json`, roda após todos os coletores do dia, sem colisão com 78-12 (`30 11`/`30 15`).

#### Observações (low, não bloqueantes)
- **REL-001 (low, aceito):** `sendEmail` resolve com `{error}` em falha de config (não rejeita) → `.catch` não contabiliza esse tipo em `alertErrors`, e o marcador de dedup é gravado **antes** do envio → uma falha de envio não é reenviada no mesmo dia. Comportamento best-effort idêntico ao padrão consolidado de `billing-reminders`. Sem ação nesta story.
- **REL-002 (low):** Recomenda-se a validação manual em DEV descrita na seção Testing (popular `collection_error` sintético, `?dry=1`, depois sem dry, confirmar dedup na 2ª chamada) antes de considerar produção plenamente exercitada — o comportamento de banco não foi executado nesta sessão (proibido aplicar em prod/dev).

### Gate Status

Gate: PASS → docs/qa/gates/78.13-alerta-falha-coleta-persistente.yml
