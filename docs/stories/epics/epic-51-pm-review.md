# PM Review — Epic 51 Google Ads Marketing API

**Reviewer:** @pm (Morgan)
**Date:** 2026-06-08
**Reviewed artifacts:**
- `docs/stories/epics/epic-51-google-ads-marketing-api.md`
- `docs/stories/51-1-google-ads-schema-and-auth.story.md`
- `docs/stories/51-2-google-ads-sync-insights.story.md`
- `docs/stories/51-3-google-ads-spend-ui.story.md`

**Verdict:** **NEEDS_CHANGES** (close to APPROVED — 3 blocking gaps, several nits)

---

## TL;DR

O trabalho do @sm está sólido: scope MVP enxuto, padrão de espelhamento Meta bem aplicado, ACs majoritariamente testáveis, riscos mapeados. O epic responde a uma necessidade real e mensurável ("quanto gastamos no Google Ads na semana X?").

Porém, há **três gaps blocantes** antes de @po validar:

1. **Como o usuário conecta a conta?** Story de fluxo OAuth UI está ausente. Story 51-1 cria a coluna `google_ads_config` e Story 51-3 lê o status — mas nenhuma story escreve nesta coluna. Sem isto, o sync nunca terá credenciais válidas em produção e a UI sempre mostrará "Não configurado".
2. **Story 51-1 não cobre seed de campanhas.** Story 51-2 faz join com `google_ads_campaigns` para obter `name`, mas nenhuma story popula essa tabela. Story 51-3 vai exibir `entity_id` em vez de nome legível no MVP.
3. **`average_cpc` em micros é uma incerteza, não um fato.** Story 51-2 AC implica conversão, mas o Dev Note R4 admite que precisa verificar. PM precisa cravar a decisão antes de @dev implementar.

Os demais gaps (alertas, multi-account, plan B de developer token) são justificadamente fora de MVP, mas devem ser registrados como Phase 2.

---

## 1. Business Value Assessment

### Vale o investimento? Sim — com escopo certo.

**Pro:**
- Usuário (lucas@) já fez a pergunta concreta "quanto gastei no Google Ads na semana 01-07/06/2026" e descobrimos o gap. Demanda comprovada, não especulativa.
- Custo estimado: ~16h dev (~2 dias) — investimento baixo para fechar buraco de visibilidade financeira.
- Já temos Meta Ads tracking funcional → pattern reuse maximiza ROI (≈70% do código é espelho de Meta).
- Sem isso, o CRM falha numa pergunta financeira básica para um time que está investindo em mídia paga.

**Risco se NÃO fizer:**
- Time continua alternando entre painel Google Ads e CRM para responder perguntas básicas → fricção operacional + risco de decisões com dados desatualizados.
- ROAS cross-channel (Meta + Google) impossível enquanto Google Ads não estiver no banco.

**Articulação do "porquê" no epic:** OK, mas poderia ser mais forte. O epic diz "spend tracking diário", mas não explicita a pergunta de negócio que originou a demanda. **Sugestão:** Adicionar bullet de "Driving question" no objetivo.

> **Veredito:** Business value claro e proporcional ao custo. APPROVED nesta dimensão.

---

## 2. Scope Analysis

### O scope MVP está certo? Sim, mas com uma omissão crítica.

**O que está bem:**
- Decisão de ficar em **campaign-level** (não adset/ad) no MVP é correta. O usuário só pediu "quanto gastei" — não precisa de drill-down.
- Decisão de não fazer ROAS imobiliário no MVP (que Meta tem na Story 16.10) é a decisão certa. Google Ads não tem o mesmo nível de attribution para leads que Meta + CTWA.
- Decisão de fazer 1 customer_id por org é correta para MVP. Multi-account é Phase 2.

**O que está faltando no scope:**

| Gap | Severidade | Por quê é blocante |
|---|---|---|
| **Fluxo de conexão OAuth (UI + backend)** | **CRÍTICO** | Sem isto, ninguém consegue conectar uma conta. Story 51-3 só lê status; quem escreve credenciais? |
| **Sync de hierarquia (campaigns metadata)** | **ALTO** | Story 51-2 popula apenas `google_ads_insights_daily`. A tabela `google_ads_campaigns` (criada em 51-1) nunca recebe dados. Logo Story 51-3 faz join e mostra `entity_id` numérico em vez do nome da campanha. |
| **Plan B se developer token demorar > 3 dias** | **MÉDIO** | Risco documentado mas sem mitigação concreta. O time fica bloqueado? @dev faz mock? |

**Comparação Meta vs Google — o que faltou espelhar:**

| Story Meta (Epic 16) | Equivalente Google (Epic 51) | Status |
|---|---|---|
| 16.1 (schema) | 51.1 | ✅ Presente |
| 16.2 (API client lib) | _(embutido em 51.2 T1+T2)_ | ⚠️ OK para MVP, mas mais frágil |
| **16.3 (Auth UI: conectar conta)** | _(AUSENTE)_ | ❌ **GAP CRÍTICO** |
| 16.4 (cron entities/campaigns) | _(AUSENTE)_ | ❌ Falta sync de metadados |
| 16.5 (cron insights) | 51.2 | ✅ Presente |
| 16.8 (UI lista campanhas) | 51.3 | ✅ Presente |
| 16.13 (alertas/health) | _(AUSENTE)_ | ⚠️ OK adiar para Phase 2 |

> **Veredito:** Scope MVP é razoável em ambição, mas tem **dois buracos funcionais (OAuth UI + campaigns metadata sync)** que impedem o epic de cumprir seu próprio Definition of Done.

---

## 3. Story Sequencing & Dependencies

### A ordem 51-1 → 51-2 → 51-3 faz sentido? Sim, com paralelização parcial possível.

**Análise:**
- 51-1 (schema) é fundacional. Bloqueia 51-2 e 51-3. Não paralelizável.
- 51-2 (sync) precisa do schema. Bloqueia 51-3 (que precisa de dados).
- 51-3 (UI) precisa de dados. Mas… AC do 51-3 prevê "seed SQL para testar UI sem cron" — o que significa **51-3 pode ser desenvolvida em paralelo com 51-2 usando seed data**, contanto que o schema (51-1) esteja pronto.

**Recomendação:** Após 51-1 completa, 51-2 e 51-3 podem rodar em paralelo (2 devs ou 1 dev alternando entre branches). Cuidado: o merge precisa garantir que `customer_id` e org_id usados no seed batem com a conta real.

**Paralelização adicional disponível:**
- Solicitação do Developer Token do Google (manual, externa) deve começar **agora**, antes mesmo de 51-1 ser implementada. Latência típica: 1-3 dias úteis. Sem isto, 51-2 fica em standby aguardando aprovação Google.
- Setup do OAuth App no Google Cloud Console (`client_id` + `client_secret`) — também externo, pode rodar em paralelo a 51-1.

> **Veredito:** Sequência está correta. Adicionar action item para iniciar Developer Token + OAuth App setup **antes** de 51-1.

---

## 4. Story-by-Story Review

### Story 51-1 — Schema Postgres + Auth Storage

**Strengths:**
- ACs detalhados, mensuráveis (AC1-AC10 cobrem schema completo + RLS + idempotência).
- Dev Notes mencionam corretamente a referência obrigatória (`015_meta_marketing_api.sql`).
- Risco de numeração de migration mapeado (R3) — importante porque o histórico recente teve conflito de numeração 074.
- Convenção monetária Google (`micros`) explicitada com clareza e correção (÷ 1.000.000).

**Concerns:**
- **AC8 ambíguo sobre segurança:** "armazenar em plaintext como Meta Ads faz com `access_token`". Isto repete um débito técnico conhecido. Refresh tokens Google são credenciais de **longa duração** (não expiram automaticamente) — vazamento é mais grave que Meta access_token. Esta é uma decisão estratégica que deve ser explicitada e aprovada, não tratada como detalhe.
- **AC10 redundante:** "TypeScript compila" — story é puramente SQL, não muda código TS. Remover ou esclarecer.
- **Coluna `google_ads_config` não declara constraint de shape.** JSONB livre vai aceitar qualquer estrutura — o que torna AC2 da Story 51-2 frágil (depende de chaves específicas).
- **Falta tabela equivalente a `meta_ads`?** Meta tem `meta_campaigns`, `meta_adsets`, `meta_ads`. Google só tem `google_ads_campaigns`. Decisão consciente (campaign-level only no MVP), mas vale comentar no epic.

**Required changes:**
- [ ] Adicionar AC explícito: "decisão de armazenar refresh_token em plaintext está documentada como débito técnico e será revisitada em story futura (encryption-at-rest)".
- [ ] Remover AC10 ou reescrever como "Tipos Supabase regenerados (responsabilidade fora desta story; documentar no Handoff)".
- [ ] Adicionar comentário SQL na coluna `google_ads_config` documentando o shape esperado (já está em Dev Notes — replicar no SQL como `COMMENT ON COLUMN`).

### Story 51-2 — Cron Sync Diário de Insights

**Strengths:**
- ACs muito bem decompostos (AC1-AC11). Cobrem auth, transform, upsert, log, error handling.
- Dev Notes incluem mapeamento de campos GAQL → DB com transformações explícitas (excelente).
- Padrão `customer_id` sem hífens na URL documentado (gotcha real do Google Ads API).
- AC9 (cron retorna HTTP 200 mesmo em erro) é uma decisão **correta** de Vercel cron — Vercel marca cron como falho permanentemente se retornar não-200 repetidamente.

**Concerns:**
- **`average_cpc` em micros é incerteza (R4), não decisão.** Esta dúvida precisa ser **resolvida ANTES** da implementação — não durante. Caso contrário @dev vai gastar tempo investigando docs Google.
  - **Resposta definitiva:** Google Ads API v17 retorna `metrics.average_cpc` em micros, sim. Confirmado por mapeamento na própria story (tabela linhas 213-224). Remover R4 e cravar decisão.
- **`ctr` em GAQL é decimal (0.015 = 1.5%) mas o schema declara `NUMERIC(8,4)` em 51-1.** Verificar precisão suficiente. (0.015 cabe em (8,4) com folga — OK.)
- **AC5 cita `date_preset = yesterday` mas T3.2 cita `WHERE segments.date = '{yesterday}'` (literal).** Inconsistência. GAQL não suporta `date_preset` — usa `WHERE segments.date BETWEEN` ou `= 'YYYY-MM-DD'`. AC5 está semanticamente errado. **Bloqueante para @po.**
- **Sem cron de hierarquia (entidades/metadados de campanha).** Story 16.4 do Meta faz isto. Sem essa sync, `google_ads_campaigns` fica vazia → join na Story 51-3 retorna campanhas sem nome. Pode ser mitigado fazendo o sync de campaigns metadata DENTRO do mesmo cron de insights (resolvendo campanha pelo `campaign.name` da query GAQL já existente), mas isto não está no AC.
- **Não há paginação no `searchStream`.** Para uma conta com 50+ campanhas e múltiplos níveis isto pode quebrar. Para MVP (1 conta, campaign-level, 1 dia) é OK, mas comentar como limitação.
- **`organizations.google_ads_config` precisa ter status válido — qual é o critério?** AC3 fala em `google_ads_accounts.status = 'active'`, mas a configuração OAuth vive em `organizations.google_ads_config`. Há possibilidade de descompasso (conta marked active mas config NULL). AC + Dev Notes não explicitam o critério canônico. Risco R5 menciona mas como "skip" — qual o handling?

**Required changes:**
- [ ] Resolver R4 (cravar `average_cpc` é micros, ÷ 1.000.000). Atualizar tabela de mapeamento (já tem) e remover risco.
- [ ] Reescrever AC5: substituir `date_preset = yesterday` por `WHERE segments.date = '{YYYY-MM-DD de ontem em UTC}'`.
- [ ] Adicionar AC ou Task: **se `name` da campanha vier no resultado GAQL, fazer upsert leve em `google_ads_campaigns`** (campos mínimos: `org_id`, `account_id`, `google_campaign_id`, `name`, `status`, `synced_at`). Custo: ~10 linhas. Benefício: 51-3 funciona sem story adicional.
- [ ] Documentar como o cron descobre quais orgs sincronizar: `SELECT o.id, o.google_ads_config FROM organizations o WHERE o.google_ads_config IS NOT NULL` — e que esse é o critério canônico, não `google_ads_accounts.status`.

### Story 51-3 — UI de Spend + Placeholder

**Strengths:**
- AC1 substitui placeholder específico (linhas 200-216) → escopo cirúrgico.
- AC6 explícito sobre formatação BRL (R$ 1.234,56) → previne ambiguidade.
- Estado vazio explicitado (AC4) — boa prática UX.
- Risco R3 (join falhar se `google_ads_campaigns` vazia) está mapeado.

**Concerns:**
- **AC8 vago:** "acessível via menu lateral OU na página de integrações — não fica órfã". Decidir agora qual: menu lateral é melhor para descoberta; integrações é mais barato. Como Meta usa `/dashboard/campaigns/meta`, há precedente para item de menu "Campanhas" com submenu. **Decisão:** seguir padrão Meta — adicionar link no menu lateral.
- **AC2 deriva status de `google_ads_accounts.status = 'active'`**, mas Story 51-2 deriva sync de `organizations.google_ads_config IS NOT NULL`. Inconsistência. Definir uma fonte canônica de truth. Recomendação: fonte canônica é `organizations.google_ads_config.status = 'connected'`. `google_ads_accounts` é um mirror das contas reais (1 row por customer_id; pode ter múltiplas no futuro).
- **Falta link/CTA para configurar a conta.** Se status = "Não configurado", o card só mostra texto explicativo. Cadê o botão "Conectar conta Google Ads"? Sem ele o usuário vê o card e fica sem ação possível. Este é o ponto de entrada para o **fluxo OAuth ausente** (ver Missing Stories).
- **AC4 — "Estado vazio com mensagem":** OK, mas falta cenário "conta conectada mas ainda sem sync". Mostrar "Aguardando primeira sincronização (próxima às 07h BRT)"?

**Required changes:**
- [ ] AC1: incluir botão/link "Conectar conta Google Ads" no estado "Não configurado".
- [ ] AC2 → AC2': mudar critério de status para `organizations.google_ads_config.status = 'connected'` (alinhar com 51-2).
- [ ] AC8: cravar "link no menu lateral em Campanhas (espelhando Meta)" como decisão.
- [ ] AC4: adicionar estado "conectado mas sem dados ainda" (loading inicial).

---

## 5. Missing Stories

### Critical (blocking for MVP completion):

#### **Story 51-4 (proposta) — Fluxo OAuth: Conectar Conta Google Ads**
- **Por que é blocante:** Sem isto, a coluna `google_ads_config` criada em 51-1 nunca é populada → cron de 51-2 sempre pula a org → UI de 51-3 sempre mostra "Não configurado". O Definition of Done do epic ("Placeholder substituído por UI funcional de status/spend") é impossível de cumprir sem este fluxo.
- **Scope sugerido:**
  - Página `/dashboard/configuracoes/integracoes/google-ads/page.tsx` (espelhando `meta-ads/page.tsx`)
  - Input: `customer_id`, `developer_token` (opcional override por org)
  - Botão "Autorizar via Google" → OAuth flow (popup ou redirect) → recebe `authorization_code`
  - Trocar code por `refresh_token` (chamada server-side a `oauth2.googleapis.com/token`)
  - Salvar credenciais em `organizations.google_ads_config`
  - Botão "Testar conexão" → faz GAQL `SELECT customer.descriptive_name FROM customer` para validar
  - Botão "Desconectar" → seta `google_ads_config = NULL`
- **Estimativa:** ~6h (espelha Meta 16.3 em complexidade).
- **Dependências:** 51-1 (precisa da coluna). Bloqueia: end-to-end teste de 51-2 e 51-3 com dados reais.

### High (should be in MVP or pre-MVP):

#### **Story 51-0 (proposta) — Setup Externo: Developer Token + OAuth App**
- **Por que importante:** Bloquei externo crítico, mas sem story para rastrear. Hoje a única menção é uma nota no epic dizendo "iniciar antes de 51-1". Sem dono e sem deadline, atrasa.
- **Scope sugerido:**
  - Solicitar Developer Token via Google Ads Manager Account → API Center
  - Criar OAuth App no Google Cloud Console (`client_id` + `client_secret`)
  - Configurar OAuth consent screen (escopo `https://www.googleapis.com/auth/adwords`)
  - Documentar processo em `docs/integrations/google-ads-setup.md`
  - Adicionar env vars no Vercel (production + preview): `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`
- **Executor:** humano (lucas@) — não @dev. PM/SM pode escrever os passos, mas a aprovação é manual com Google.
- **Estimativa:** 1-3 dias úteis (latência Google), ~1h de trabalho efetivo.
- **Risco se omitir:** 51-2 fica em "Done" mas não funciona em produção; falha silenciosa.

### Nice-to-have (Phase 2, NOT blocking MVP):

| Story | Justificativa de adiar |
|---|---|
| Alertas/notificações (estourou budget) | Não foi pedido pelo usuário; ROI baixo no MVP |
| Multi-account (várias contas Google Ads por org) | 1 conta por org cobre 95% dos casos do CRM Trifold |
| ROAS imobiliário Google (paridade com Meta 16.10) | Google Ads não tem CTWA/leadgen como Meta; attribution é mais fraca |
| Health check + monitoring (paridade com Meta 16.13) | Pode ser feito em epic de "Observability" cross-channel |
| Backfill histórico (últimos N dias) | Resolve com seed manual + sync diário daqui pra frente |
| Sync de ad_groups e ads (não só campaign) | Drill-down não foi pedido no MVP |
| Documentação de troubleshooting para o time | Criar em conjunto com Story 51-4 |

---

## 6. External Blocker Handling

### Developer Token approval — está bem mitigado?

**Status atual:** Mapeado como risco R1 no epic e nas Stories 51-1/51-2. Latência típica documentada (1-3 dias para Basic Access). MAS:

**Gaps:**
1. **Sem owner explícito.** Quem solicita o token? Sem story dedicada (vide 51-0 proposta), responsabilidade dispersa.
2. **Sem plan B documentado se demorar > 3 dias.** Opções viáveis:
   - **Plan B1:** @dev implementa 51-2 com mock (fixture JSON simulando resposta GAQL) → mas isto exige refactor para produção.
   - **Plan B2:** @dev pula direto para 51-3 usando seed SQL (caminho já documentado na Story 51-3). Aceita gap temporário no fluxo end-to-end.
   - **Plan B3:** Pausar o epic; @dev pega outra story do backlog. Aceita risco de descontinuidade.
3. **Sem critério de timeout.** Quanto tempo esperar antes de acionar plan B? Sugestão: 5 dias úteis após submissão.

**Required changes:**
- [ ] Adicionar seção "External Blocker Plan B" no epic com B2 como plano padrão (caminho seed SQL → migrar para dados reais quando token sair).
- [ ] Definir owner do developer token: lucas@ (usuário).
- [ ] Critério de timeout: se > 5 dias úteis, escalar para revisar prioridade do epic.

---

## 7. Priorização

### Esse epic deve ir antes ou depois dos outros epics em backlog?

**Outros epics em Draft/InProgress no backlog (snapshot via `ls docs/stories/epics/`):**

| Epic | Status | Prioridade relativa |
|---|---|---|
| 16 — Meta Ads Marketing API | InProgress | continuar |
| 50 — Meta Creative Attribution Pipeline | Recém-mergeado (commits 5ade0d8) | done na prática |
| 21 — WhatsApp Channel Reliability | ? | provavelmente alta (canal crítico) |
| 33 — Clientes CRM | ? | alta (core domain) |
| 39 — PWA Excellence | ? | média (UX-driven) |
| **51 — Google Ads Marketing API** | **Draft (this)** | **alta** |

**Recomendação de priorização:**

Epic 51 deve **começar imediatamente após 51-0 (setup externo) iniciar**, em paralelo com qualquer epic em andamento. Justificativas:

1. **Custo é baixo (~16h dev) e blocker externo é longo (~1-3 dias).** Esperar o blocker resolver "sozinho" sem trabalho paralelo seria desperdício.
2. **Risco de obsolescência:** Google Ads API v17 é versão atual; se atrasar muito, time pode pegar v18 com breaking changes.
3. **ROI imediato:** Resposta única à pergunta financeira que originou a demanda. Visibilidade financeira tem urgência operacional alta.

**Sequência ideal:**
```
Dia 0 (hoje):  Iniciar 51-0 (setup externo, owner: lucas@)
Dia 1:         @sm aplica action items, @po valida stories revisadas
Dia 1-2:       @data-engineer faz 51-1
Dia 2-4:       @dev faz 51-2 + 51-4 (OAuth UI) em paralelo
Dia 4-5:       @dev faz 51-3 (UI spend)
Dia 5:         QA gate + push (depende de Developer Token estar aprovado)
```

> **Veredito:** Alta prioridade, mas só inicia trabalho de dev após action items abaixo aplicados.

---

## Action Items (para o @sm aplicar antes de @po validar)

### Blocking (precisa antes de @po):

- [ ] **AI-1:** Criar Story **51-0 — Setup Externo (Developer Token + OAuth App)**. Owner: lucas@. Não é code work mas precisa de rastreamento.
- [ ] **AI-2:** Criar Story **51-4 — Fluxo OAuth: Conectar Conta Google Ads**. Espelhar Meta 16.3. Estimativa ~6h. Atualizar epic para incluir esta story no DoD.
- [ ] **AI-3:** Story 51-2 AC5: corrigir `date_preset = yesterday` → `WHERE segments.date = '{YYYY-MM-DD ontem em UTC}'` (GAQL não suporta date_preset).
- [ ] **AI-4:** Story 51-2: cravar `average_cpc` em micros (÷ 1.000.000). Remover R4 (incerteza vira decisão).
- [ ] **AI-5:** Story 51-2: adicionar Task ou AC para fazer **upsert leve em `google_ads_campaigns`** quando o GAQL retornar `campaign.name`. Sem isso a UI da 51-3 mostra IDs em vez de nomes.
- [ ] **AI-6:** Padronizar fonte canônica de "está conectado": `organizations.google_ads_config.status = 'connected'`. Alinhar AC2 da Story 51-3 e critério de iteração do cron em 51-2.
- [ ] **AI-7:** Story 51-3 AC1: adicionar botão "Conectar conta Google Ads" no estado "Não configurado", apontando para nova página criada em Story 51-4.

### Non-blocking (recomendado, pode ser ajustado durante implementação):

- [ ] **AI-8:** Atualizar epic Definition of Done para incluir Stories 51-0 e 51-4.
- [ ] **AI-9:** Adicionar seção "External Blocker Plan B" no epic com decisão clara (recomendado: B2 = seed SQL).
- [ ] **AI-10:** Story 51-1 AC8: documentar débito técnico explícito de "refresh_token em plaintext" como decisão consciente, com referência a story futura de encryption.
- [ ] **AI-11:** Story 51-1: remover AC10 (typecheck) ou reescrever — story é SQL-only.
- [ ] **AI-12:** Story 51-1: adicionar `COMMENT ON COLUMN organizations.google_ads_config IS '{...shape...}'` no SQL.
- [ ] **AI-13:** Story 51-3 AC8: cravar "link no menu lateral em Campanhas (espelhando Meta)".
- [ ] **AI-14:** Story 51-3 AC4: adicionar estado "conectado mas sem sync ainda" (entre "não configurado" e "com dados").
- [ ] **AI-15:** Epic: adicionar bullet em "Objetivo do Epic" com a driving question original ("Quanto gastei no Google Ads na semana 01-07/06/2026?") como evidência de demanda.

---

## Closing Note

Bom trabalho do @sm — o padrão de espelhamento Meta foi aplicado com cuidado e a maioria dos detalhes técnicos sutis (micros, customer_id sem hífens, idempotência, cron status 200) está corretamente capturada. As mudanças necessárias são **gaps de scope** (OAuth UI ausente, campaigns metadata sync ausente) e **ambiguidades pontuais nos ACs**, não problemas estruturais.

Aplicados os action items blocantes (AI-1 a AI-7), o epic está pronto para @po validar e iniciar implementação.

— Morgan, planejando o futuro
