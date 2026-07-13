# Story 78-2 — Provisionamento & Configuração de Secrets para Coletores de Billing

## Metadata
- **Epic:** 78 — Painel de Saúde & Billing da Plataforma
- **Story:** 78-2
- **Status:** InProgress (parcial — Vercel/Supabase/Resend provisionados e validados; Anthropic/OpenAI/Meta PENDENTES de pré-requisito humano de owner)
- **Priority:** P1 — **PRÉ-REQUISITO BLOQUEANTE** para as Stories 78-3, 78-4, 78-5, 78-6 e 78-10 (nenhum coletor funciona sem as credenciais desta story)
- **Complexity:** M (sem código de aplicação; provisionamento de 8 env vars + validação read-only de cada credencial; depende de ações humanas fora do repositório para gerar 3 das credenciais)
- **Created:** 2026-07-08
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @devops (Gage)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[secrets_audit, rest_api_usage_review, no_client_exposure_check, rotation_doc_review]`

> Mapping confirmado no Epic 78 (§7, tabela de stories): "78-2 | Provisionamento & config de secrets | ... | @devops | @architect".

---

## User Story

**Como** sistema Trifold CRM,
**Quero** que as credenciais de billing/uso (Anthropic Admin key, OpenAI Admin key, Vercel access token, Meta System User token, Supabase PAT) estejam provisionadas como env vars encrypted no Vercel — gravadas exclusivamente via REST API/helper seguro, nunca via `vercel env add` por stdin — e validadas com uma chamada de teste read-only a cada API correspondente,
**Para que** as Stories 78-3 a 78-6 e 78-10 (coletores de custo) tenham as credenciais que hoje **não existem no projeto** e possam ser implementadas sem re-descobrir como provisionar secrets de alto privilégio, e sem repetir os 2 incidentes históricos de env var gravada vazia.

---

## Context

O Epic 78 entrega um Painel de Saúde & Billing que consolida custo/vencimento/deep-link de 7 serviços (Anthropic, OpenAI, Vercel, WhatsApp/Meta, Supabase, Resend, Meta Ads opcional). A Story 78-1 (Ready) já criou o schema (`platform_services`, `service_billing_reminders`, `service_cost_snapshots`) que os coletores vão popular — mas **nenhum coletor pode ser implementado ainda**, porque as APIs de custo das camadas FORTE e MÉDIA (Anthropic `cost_report`, OpenAI `organization/costs`, Vercel `billing/charges`, WhatsApp `pricing_analytics`) exigem credenciais de **nível organização/admin** que são **diferentes** das chaves de API normais já configuradas no projeto (confirmado em `.claude/agent-memory/.../reference_vercel_env.md`: `ANTHROPIC_API_KEY` e `OPENAI_API_KEY` já existem no Vercel, mas são chaves de **uso de produto** — não dão acesso a endpoints de billing/custo da organização).

Esta story é o **CON-2** do épico tornado acionável: "Anthropic e OpenAI exigem Admin key de organização (≠ API key normal) — sem elas, os coletores 78-3/78-4 não funcionam. Provisionar antes (78-2)."

**Diferente das demais stories do épico, esta story tem uma dependência que o código sozinho não resolve:** 3 das 5 credenciais (Anthropic Admin key, OpenAI Admin key, Meta System User token com os escopos corretos) só podem ser **geradas por um humano com papel de owner/admin** nos respectivos consoles — não existe endpoint de API para "criar uma admin key" de forma automatizada por um agente. Essas ações estão marcadas explicitamente na seção **Pré-requisitos Humanos** abaixo e bloqueiam a conclusão desta story até serem executadas.

---

## Scope

### IN (esta story entrega)
- Definição do **contrato de nomes de env var** (nomenclatura fixa que 78-3..78-6/78-10 devem consumir) — FR transversal do épico, análogo ao "contrato de dados" fixado pela 78-1 para o schema.
- Provisionamento de **8 env vars** no Vercel (produção), todas **server-only** (nenhuma `NEXT_PUBLIC_*`), via `scripts/vercel-env-set.sh` (REST API) — nunca `vercel env add` por stdin.
- **Health-check read-only** de cada credencial: uma chamada de teste de baixo custo/sem efeito colateral a cada API, confirmando que a credencial é válida e tem o escopo esperado (ex.: Anthropic `cost_report` últimas 24h, Vercel `GET /v9/projects` ou `/v2/user`, etc.) — sem persistir dado nenhum (isso é escopo dos coletores 78-3+).
- Documentação de **rotação de credenciais** (onde cada uma é gerada, quem é o owner responsável, o que fazer se vazar/expirar).
- Confirmação/atualização do `vercel redeploy` necessário após a gravação (env só vale em deployment novo).

### OUT (não entra nesta story)
- Qualquer lógica de coleta de custo (parsing de `cost_report`, JSONL do Vercel, `pricing_analytics`, etc.) — escopo das Stories 78-3 a 78-6/78-10.
- Geração das credenciais em si nos consoles de terceiros — ação **humana**, listada em "Pré-requisitos Humanos"; esta story provisiona (grava no Vercel) e valida (chamada de teste), mas não pode gerar a chave.
- Cron job / agendamento — os coletores (78-3+) criam suas próprias rotas de cron; esta story só garante que as credenciais **existirão** quando esses crons forem escritos.
- Rotação automática de secrets (fora de escopo do MVP do épico) — apenas documentação do processo manual de rotação.
- Env vars de Resend e do próprio `SUPABASE_SERVICE_ROLE_KEY`/`ANTHROPIC_API_KEY`/`OPENAI_API_KEY` já existentes — não são tocadas por esta story (Resend não tem endpoint de billing por design do épico — CON-3; ver Story 78-7 para fallback manual).

---

## Acceptance Criteria

- [ ] **AC1 — Contrato de nomes de env var fixado:** As 8 variáveis a seguir estão documentadas nos Dev Notes desta story com nome exato, propósito, formato esperado e qual(is) story(ies) consumidora(s): `ANTHROPIC_ADMIN_KEY`, `OPENAI_ADMIN_KEY`, `VERCEL_BILLING_TOKEN`, `VERCEL_TEAM_ID`, `META_SYSTEM_USER_TOKEN`, `SUPABASE_MANAGEMENT_PAT`, `SUPABASE_ORG_SLUG`, `WHATSAPP_BUSINESS_ACCOUNT_ID`. Nenhuma story subsequente (78-3..78-6/78-10) pode introduzir nome diferente sem revisão do @po/@sm (mesma regra da 78-1 para o schema). (Nota @po 2026-07-08: `WHATSAPP_BUSINESS_ACCOUNT_ID` — identificador do WABA, análogo a `VERCEL_TEAM_ID`/`SUPABASE_ORG_SLUG` — foi adicionado como 8ª variável durante a validação cruzada do backlog, para fechar o gap identificado pela Story 78-6, que precisa desse ID para montar a URL do endpoint `pricing_analytics`. Não é secret de alto privilégio; segue o mesmo fluxo de gravação segura das demais.)

- [ ] **AC2 — Todas as 8 env vars gravadas via REST API/helper, nunca via stdin:** Cada variável é criada/atualizada no Vercel (ambiente `production`, e `preview`/`development` quando aplicável ao fluxo de teste) usando `scripts/vercel-env-set.sh <KEY> <VALUE> <target>` (que usa `POST /v10/projects/{id}/env` ou `PATCH /v9/projects/{id}/env/{envId}` internamente) ou uma chamada REST equivalente feita diretamente pelo @devops. **Nenhuma chamada usa `vercel env add` com valor via pipe/stdin** (`echo x | vercel env add ...`) — esse padrão é proibido nesta story (gotcha documentado no `CLAUDE.md` do projeto: já causou 2 incidentes de valor gravado vazio).

- [ ] **AC3 — Nenhum valor vazio:** Para cada uma das 8 env vars, após a gravação, `vercel env pull --environment=production <tmp>` (ou a leitura de confirmação já embutida no helper) confirma um valor **não vazio** e com o formato esperado (ex.: `ANTHROPIC_ADMIN_KEY` começa com `sk-ant-admin01-`). Se qualquer valor vier vazio, a AC falha e a story não pode ser marcada como concluída.

- [ ] **AC4 — Nenhuma env var exposta ao client:** Nenhuma das 8 variáveis é prefixada `NEXT_PUBLIC_*` nem referenciada em código client-side. Todas são consumidas exclusivamente por rotas server-only (Route Handlers / cron jobs) nas futuras stories 78-3..78-6/78-10.

- [ ] **AC5 — Health-check read-only de cada credencial:** Para cada uma das 5 credenciais de terceiro (Anthropic, OpenAI, Vercel, Meta, Supabase — Vercel Team ID, Supabase Org Slug e WhatsApp Business Account ID não são "credenciais" mas sim identificadores, não precisam de teste próprio), o @devops executa **uma chamada de teste read-only** (ver tabela na seção Dev Notes) e documenta no Change Log desta story: comando/endpoint usado, código de resposta HTTP e um trecho não-sensível da resposta (sem vazar o valor da chave). Uma credencial sem chamada de teste bem-sucedida documentada **bloqueia** a AC10 (DoD).

- [ ] **AC6 — Documentação de rotação:** A seção "Rotação de Credenciais" nos Dev Notes está preenchida para as 5 credenciais, com: onde é gerada (console/URL), quem é o owner (papel, não necessariamente nome — ex. "owner da organização Anthropic"), e o procedimento de rotação em caso de vazamento/expiração (gerar nova → gravar via helper → `vercel redeploy` → revogar a antiga no console de origem).

- [ ] **AC7 — Redeploy após gravação:** Após todas as 7 env vars estarem gravadas e confirmadas (AC3), é executado `vercel redeploy <último deployment de produção>` (a mudança de env só vale em um novo deployment — gotcha documentado no CLAUDE.md) e o Change Log registra o ID/URL do redeploy.

- [ ] **AC8 — Pré-requisitos humanos explicitados e rastreados:** A seção "Pré-requisitos Humanos" (Dev Notes) lista, para cada uma das 3 credenciais que exigem geração manual por um owner (Anthropic Admin key, OpenAI Admin key, Meta System User token com os escopos corretos), exatamente onde gerar, quem tem permissão de owner, e o status (`PENDENTE` / `CONCLUÍDO` com data). A story **não pode transicionar para Done** enquanto qualquer um desses 3 itens estiver `PENDENTE` (ver Definition of Done).

- [ ] **AC9 — Sem regressão nas env vars existentes:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` e demais env vars já configuradas (ver `reference_vercel_env.md`) não são sobrescritas nem removidas por esta story — as 7 novas variáveis coexistem com as existentes sob nomes distintos (AC1 já garante isso pela nomenclatura).

- [ ] **AC10 — Painel de status desta story documentado:** Uma tabela final (Dev Notes ou Change Log) resume, para cada uma das 8 env vars: nome, gravada (S/N), valor confirmado não-vazio (S/N), teste read-only OK (S/N ou N/A para identificadores), pré-requisito humano pendente (S/N). Esta tabela é a evidência de conclusão consultada pelo quality gate (@architect) e pela QA.

---

## Tasks / Subtasks

- [x] **T1 — Confirmar nomenclatura e ausência de colisão (AC1, AC9)** ✅ 2026-07-13
  - [x] T1.1 — Verificado via `GET /v10/projects/{id}/env` (74 env vars no projeto): dos 8 nomes do contrato, nenhum dos 7 novos já existia (`VERCEL_BILLING_TOKEN`, `VERCEL_TEAM_ID`, `SUPABASE_MANAGEMENT_PAT`, `SUPABASE_ORG_SLUG`, `ANTHROPIC_ADMIN_KEY`, `OPENAI_ADMIN_KEY`, `META_SYSTEM_USER_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID` = ABSENT). `RESEND_API_KEY` já existe (prod+preview, não faz parte do contrato desta story). Sem colisão — AC9 preservada
  - [x] T1.2 — Tabela de contrato de nomes já fixada nos Dev Notes (feita pelo @sm/@po na criação)

- [ ] **T2 — Pré-requisitos humanos: solicitar geração das 3 credenciais de owner (AC8)**
  - [x] T2.1 — Anthropic Admin key gerada pelo owner e fornecida ao @devops ✅ 2026-07-13 (`https://console.anthropic.com/settings/admin-keys`, papel Organization Owner) — CONCLUÍDO
  - [ ] T2.2 — Notificar o usuário/owner para gerar a OpenAI Admin/Org key em `https://platform.openai.com/settings/organization/admin-keys` (requer papel de Org Owner/Admin)
  - [ ] T2.3 — Notificar o usuário/owner para gerar um Meta System User token com os escopos `whatsapp_business_management` (78-6) e `ads_read` (78-10, opcional) via Business Manager → System Users
  - [ ] T2.4 — Registrar status (`PENDENTE`/`CONCLUÍDO`) de cada item na tabela de Pré-requisitos Humanos

- [x] **T3 — Provisionar Vercel access token + Team ID (AC2, AC3)** ✅ 2026-07-13
  - [x] T3.1 — Vercel Access Token dedicado fornecido pelo usuário (conta `nicoletrifold-droid`, escopo com acesso a `/v1/billing/charges` confirmado) — **não** foi reusado o token pessoal do CLI (`auth.json`, logado como `freelans-dev` sem acesso à trifold)
  - [x] T3.2 — `teamId` confirmado: `team_XCf2jBxUmCXao0prWVy0VmOZ` (slug `trifold-s-projects`), derivado via `GET /v2/teams`; projeto `prj_s3ARh1fpDnzbx9ua4MYJf9iqdRhj` acessível (HTTP 200)
  - [x] T3.3 — `VERCEL_BILLING_TOKEN` e `VERCEL_TEAM_ID` gravados via REST API direta `POST /v10/projects/{id}/env` (`type:encrypted`, target `production/preview/development`) — **nunca stdin**. Helper `vercel-env-set.sh` não usado porque autentica via `auth.json` (conta sem acesso à trifold); usada a REST API com o token fornecido

- [x] **T4 — Provisionar Supabase Management PAT + Org slug (AC2, AC3)** ✅ 2026-07-13
  - [x] T4.1 — PAT do Supabase fornecido pelo usuário; validado via `GET /v1/organizations` (HTTP 200)
  - [x] T4.2 — Org slug confirmado: `hgvhxeyntttvnjxxdnkz` (org name "trifold"); projeto de prod `dsopqkqjkmhytudaaolv` confirmado sob essa org via `GET /v1/projects`
  - [x] T4.3 — `SUPABASE_MANAGEMENT_PAT` e `SUPABASE_ORG_SLUG` gravados via REST API direta `POST /v10/projects/{id}/env` (`type:encrypted`) — nunca stdin

- [ ] **T5 — Gravar as 3 credenciais geradas pelo owner assim que disponíveis (AC2, AC3, AC8)** — PARCIAL (Anthropic ✅; OpenAI/Meta pendentes)
  - [x] T5.1 — `ANTHROPIC_ADMIN_KEY` gravada via REST API direta `POST /v10/projects/{id}/env` (`type:encrypted`, targets `production/preview/development`, env id `3qxeovn8AHYzklrp`) — nunca stdin. Re-GET decrypted confirmou valor não-vazio (len 110, prefixo `sk-ant-admin01-` OK) ✅ 2026-07-13
  - [ ] T5.2 — Gravar `OPENAI_ADMIN_KEY` assim que T2.2 concluído
  - [ ] T5.3 — Gravar `META_SYSTEM_USER_TOKEN` assim que T2.3 concluído
  - [ ] T5.4 — Gravar `WHATSAPP_BUSINESS_ACCOUNT_ID` (identificador do WABA — **não** exige pré-requisito humano de owner; valor observável em payload real do webhook de mensagens `entry[0].id` ou via Business Manager → WhatsApp Manager) via `scripts/vercel-env-set.sh`, nunca stdin

- [ ] **T6 — Validar cada credencial com chamada de teste read-only (AC5)** — PARCIAL (Vercel/Supabase/Anthropic ✅; OpenAI/Meta pendentes)
  - [x] T6.1 — Anthropic: `GET /v1/organizations/cost_report?starting_at=2026-07-06&ending_at=2026-07-13` com header `x-api-key: $ANTHROPIC_ADMIN_KEY` + `anthropic-version: 2023-06-01` — **HTTP 200**, retornou 7 buckets diários com 7 result entries (dados de custo presentes). Escopo de billing de organização confirmado ✅ 2026-07-13
  - [ ] T6.2 — OpenAI: `GET /v1/organization/costs?start_time=<epoch hoje-1d>` com `Authorization: Bearer $OPENAI_ADMIN_KEY` — **PENDENTE** (admin key não gerada)
  - [x] T6.3 — Vercel: validado com `GET /v2/user` (HTTP 200, user `nicoletrifold-droid`), `GET /v9/projects/{id}?teamId=` (HTTP 200) e adicionalmente `GET /v1/billing/charges?from=..&to=..&teamId=` (HTTP 200, retornou JSONL de charges FOCUS com campos `BilledCost`/`ServiceName`) — escopo de billing confirmado ✅ 2026-07-13
  - [ ] T6.4 — Meta: `GET /<WABA_ID>?fields=id&access_token=$META_SYSTEM_USER_TOKEN` — **PENDENTE** (System User token não gerado)
  - [x] T6.5 — Supabase: `GET /v1/organizations` (HTTP 200, org `hgvhxeyntttvnjxxdnkz`) + `GET /v1/projects` (HTTP 200, prod `dsopqkqjkmhytudaaolv` presente). Nota: usado `curl` (não urllib) — `api.supabase.com` bloqueia UA do urllib Python via Cloudflare ✅ 2026-07-13
  - [x] T6.6 — Resultados documentados no Change Log (comando, status HTTP, trecho não-sensível) — apenas para as credenciais já provisionadas

- [ ] **T7 — Redeploy e confirmação final (AC7, AC10)**
  - [ ] T7.1 — `vercel redeploy <último deployment de produção>`
  - [ ] T7.2 — Preencher a tabela-resumo final (AC10)

- [ ] **T8 — Documentar rotação de credenciais (AC6)**
  - [ ] T8.1 — Preencher a seção "Rotação de Credenciais" nos Dev Notes para as 5 credenciais

---

## Dev Notes

### Nenhum arquivo de código é criado ou modificado por esta story
Esta é uma story de **configuração/infraestrutura pura** — nenhum arquivo em `packages/` é tocado. O único artefato de "código" já existe (`scripts/vercel-env-set.sh`) e é reutilizado, não criado. O "File List" do Dev Agent Record ficará vazio ou conterá apenas evidências (ex.: transcript de comandos), não diffs de código.

### Contrato de Nomes de Env Var (fixado nesta story — AC1)

> Este contrato é fixado nesta story e não pode ser alterado pelas stories seguintes (78-3..78-6/78-10) sem revisão do @po + @sm — mesma regra aplicada ao contrato de dados da Story 78-1.

| Env Var | Tipo | Propósito | Consumida por | Formato esperado |
|---------|------|-----------|----------------|-------------------|
| `ANTHROPIC_ADMIN_KEY` | Secret (encrypted) | Admin key de organização Anthropic — **diferente** de `ANTHROPIC_API_KEY` (já existente, uso de produto) | Story 78-3 (coletor Anthropic) | `sk-ant-admin01-...` |
| `OPENAI_ADMIN_KEY` | Secret (encrypted) | Admin/Org key OpenAI — **diferente** de `OPENAI_API_KEY` (já existente) | Story 78-4 (coletor OpenAI) | Bearer token OpenAI (formato `sk-...` de org) |
| `VERCEL_BILLING_TOKEN` | Secret (encrypted) | Access token Vercel dedicado para `GET /v1/billing/charges` — token de escopo mínimo, **não** o token pessoal do CLI | Story 78-5 (coletor Vercel) | Bearer token Vercel |
| `VERCEL_TEAM_ID` | Config (encrypted por padrão, não é segredo crítico mas mantido junto por coesão) | `teamId` usado em toda chamada à API Vercel (`?teamId=...`) | Story 78-5 | string `team_xxxxxxxx` |
| `META_SYSTEM_USER_TOKEN` | Secret (encrypted) | Token de System User do Meta Business Manager, com escopos `whatsapp_business_management` (78-6) e `ads_read` (78-10, opcional) | Story 78-6 (WhatsApp) e opcionalmente 78-10 (Meta Ads) | Token de acesso Meta (long-lived, gerado via System User) |
| `SUPABASE_MANAGEMENT_PAT` | Secret (encrypted) | Personal Access Token do Supabase Management API — usado para plano/uso técnico (não há endpoint de fatura) | Story 78-7 (fallback manual + uso técnico Supabase) | `sbp_...` |
| `SUPABASE_ORG_SLUG` | Config (encrypted por padrão) | Slug da organização Supabase, usado em `GET /v1/organizations/{slug}` e para completar o deep-link `billing_url` de `platform_services` (Story 78-1 seedou com `billing_url_confirmed = false` justamente por faltar este dado) | Story 78-7; também usado para **atualizar** a seed da 78-1 (`UPDATE platform_services SET billing_url = ..., billing_url_confirmed = true WHERE slug = 'supabase'`, fora do escopo desta story mas habilitado por ela) | string do slug da org |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Config (encrypted por padrão, não é segredo crítico — identificador análogo a `VERCEL_TEAM_ID`/`SUPABASE_ORG_SLUG`) | WABA ID usado para montar a URL do endpoint de billing do WhatsApp (`GET /<WABA_ID>?fields=pricing_analytics`); valor observável hoje em payloads reais do webhook de mensagens (`entry[0].id`), não inventado | Story 78-6 (coletor WhatsApp/Meta) | string numérica do WABA ID (ex.: `1234567890`) |

**Nota de nomenclatura:** `ANTHROPIC_ADMIN_KEY`/`OPENAI_ADMIN_KEY` usam sufixo `_ADMIN_KEY` (não `_API_KEY`) deliberadamente, para eliminar ambiguidade visual com as chaves já existentes `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` em qualquer leitura futura de `vercel env ls` ou do painel Vercel.

### Gotcha crítico — `vercel env add` via stdin (AC2)
> [Source: CLAUDE.md — seção "Vercel — variáveis de ambiente (GOTCHA crítico)"]

**NUNCA** usar `echo "$VALUE" | vercel env add KEY production` — esse padrão grava **valor VAZIO** silenciosamente. Já causou 2 incidentes documentados: VAPID key corrompida (Story 75-40) e a pausa do portal que não pegou (`PORTAL_NOTIF_PAUSED=""`, Story 75-66). Nesta story, o risco é agravado porque as credenciais são secrets de **alto privilégio** (admin/org-level) — um valor vazio não geraria erro imediato, apenas faria os futuros coletores (78-3+) falharem silenciosamente com 401/403, dificultando o diagnóstico.

**Uso correto (helper já existente no repo):**
```bash
scripts/vercel-env-set.sh ANTHROPIC_ADMIN_KEY "sk-ant-admin01-xxxxx" production
scripts/vercel-env-set.sh VERCEL_TEAM_ID "team_xxxxxxxx" production
```
O helper usa a REST API internamente (`POST /v10/projects/{id}/env` com `type:"encrypted"` para criar, `PATCH /v9/projects/{id}/env/{envId}` para atualizar), lê `projectId`/`teamId` de `.vercel/project.json` e o token de autenticação de `~/Library/Application Support/com.vercel.cli/auth.json`, e **confirma o valor gravado** via `vercel env pull` antes de retornar sucesso (satisfaz AC3 automaticamente para quem usa o helper).

**Se o @devops preferir chamar a REST API diretamente** (sem o helper, por exemplo para casos que o helper não cobre): usar sempre `POST /v10/projects/{id}/env` (criação, `type:"encrypted"`) ou `PATCH /v9/projects/{id}/env/{envId}` (atualização) — nunca o CLI `vercel env add` interativo/stdin.

**Evitar `type:"sensitive"`** para estas variáveis, exceto se o usuário explicitamente pedir — valores `sensitive` são write-only/ilegíveis mesmo pelo painel, o que dificultaria auditoria/conferência futura destas credenciais de alto privilégio.

### Nenhuma exposição ao client (AC4)
Todas as 7 variáveis são consumidas exclusivamente por: (a) rotas de cron server-side (`packages/web/src/app/api/cron/*`, padrão já existente no projeto) que as futuras stories 78-3..78-6/78-10 vão criar; (b) eventualmente uma Server Action ou Route Handler admin-only. Nenhuma delas deve, em hipótese alguma, ser prefixada `NEXT_PUBLIC_*` nem lida em Client Components. Esta regra é a mesma que rege `SUPABASE_SERVICE_ROLE_KEY` no projeto.

### Health-checks read-only (AC5) — detalhes por credencial
| Credencial | Chamada de teste (read-only, sem side-effect) | Sucesso esperado |
|-----------|------------------------------------------------|-------------------|
| `ANTHROPIC_ADMIN_KEY` | `GET https://api.anthropic.com/v1/organizations/cost_report?starting_at={ontem}T00:00:00Z` com headers `x-api-key`, `anthropic-version: 2023-06-01` | HTTP 200 com corpo JSON (mesmo que vazio de dados, o 200 confirma escopo válido) |
| `OPENAI_ADMIN_KEY` | `GET https://api.openai.com/v1/organization/costs?start_time={epoch ontem}` com `Authorization: Bearer` | HTTP 200 |
| `VERCEL_BILLING_TOKEN` + `VERCEL_TEAM_ID` | `GET https://api.vercel.com/v9/projects?teamId={team}` com `Authorization: Bearer` | HTTP 200 (não é preciso testar `/v1/billing/charges` diretamente nesta story — qualquer endpoint autenticado do mesmo token já valida o token) |
| `META_SYSTEM_USER_TOKEN` | `GET https://graph.facebook.com/v19.0/{WABA_ID}?fields=id&access_token={token}` | HTTP 200; um 400/190 indica token inválido ou escopo insuficiente |
| `SUPABASE_MANAGEMENT_PAT` + `SUPABASE_ORG_SLUG` | `GET https://api.supabase.com/v1/organizations/{slug}` com `Authorization: Bearer` | HTTP 200 |

**Importante:** nenhum destes testes deve ser persistido em `service_cost_snapshots` — isso é explicitamente escopo dos coletores (78-3+). O objetivo aqui é só confirmar "a credencial funciona", não popular dado real.

### Pré-requisitos Humanos (AC8) — ação obrigatória FORA deste agente

> **BLOQUEANTE:** esta story não pode ser marcada `Done` enquanto os 3 itens abaixo estiverem `PENDENTE`. Nenhum agente (incluindo @devops) pode gerar estas credenciais — elas exigem login humano com papel de owner/admin nos consoles de terceiros.

| # | Credencial | Onde gerar | Papel necessário | Status |
|---|-----------|------------|-------------------|--------|
| 1 | Anthropic Admin key | `https://console.anthropic.com/settings/admin-keys` | Organization Owner da conta Anthropic da Trifold | **CONCLUÍDO** 2026-07-13 (gerada pelo owner, provisionada e validada — HTTP 200 no `cost_report`) |
| 2 | OpenAI Admin/Org key | `https://platform.openai.com/settings/organization/admin-keys` | Org Owner/Admin da conta OpenAI da Trifold | **PENDENTE** |
| 3 | Meta System User token (`whatsapp_business_management` + `ads_read`) | Business Manager → Configurações do Negócio → Usuários do Sistema → gerar token com os 2 escopos | Admin do Business Manager da Trifold (mesma conta do App "Ações Trifold", ID `1249990980457973`) | **PENDENTE** |

O @devops (executor desta story) deve, ao assumir a story em `*develop`, comunicar explicitamente ao usuário/lead do projeto estes 3 pré-requisitos e aguardar confirmação antes de prosseguir para T5/T6 relativos a estas 3 credenciais. Vercel token e Supabase PAT (T3/T4) **não** têm essa dependência — podem ser gerados pelo próprio @devops se ele tiver acesso às contas correspondentes, ou também ficam pendentes de owner se não tiver.

### Rotação de Credenciais (AC6 — preencher durante T8)

| Credencial | Onde é gerada | Owner responsável | Procedimento de rotação |
|-----------|----------------|---------------------|---------------------------|
| Anthropic Admin key | Console Anthropic → Admin Keys | Organization Owner | Gerar nova key → gravar via `vercel-env-set.sh` → `vercel redeploy` → revogar a antiga no console |
| OpenAI Admin key | Platform OpenAI → Organization → Admin keys | Org Owner/Admin | Idem |
| Vercel access token | `vercel.com/account/tokens` | Quem gerou (idealmente conta de serviço/owner do time) | Revogar token antigo no painel Vercel após confirmar novo funcionando |
| Meta System User token | Business Manager → System Users | Admin do Business Manager | Gerar novo token para o mesmo System User (mantém permissões) → gravar → redeploy → revogar o antigo |
| Supabase Management PAT | `supabase.com/dashboard/account/tokens` | Owner da organização Supabase | Gerar novo PAT → gravar → redeploy → revogar o antigo |

### Testing Standards
- Não há suíte de testes automatizados aplicável a provisionamento de secrets (mesmo padrão observado na Story 78-1 para migrations — validação é manual/operacional).
- "Testing" aqui significa: cada chamada de teste read-only da tabela de health-check (T6) executada com sucesso e documentada — não existe código a testar.
- Nenhum valor de secret deve aparecer em texto plano em nenhum lugar desta story, do Change Log, ou de qualquer log de comando colado na story — usar apenas indicadores de sucesso (status HTTP, prefixo do formato como `sk-ant-admin01-...`) sem colar o valor completo.

---

## Testing

### Abordagem
- Validação puramente operacional (sem testes automatizados de código): confirmação de gravação (AC3), health-check read-only por credencial (AC5/T6), confirmação de redeploy (AC7).
- Nenhum ambiente de CI executa esta story — é 100% execução manual pelo @devops com os comandos documentados nos Dev Notes.

### Cenários de teste
1. **Gravação sem stdin:** Confirmar (por revisão do histórico de comandos do @devops) que nenhuma das 7 gravações usou `vercel env add` com pipe — todas via `scripts/vercel-env-set.sh` ou REST API direta.
2. **Valor não vazio:** Para as 7 variáveis, `vercel env pull` (ou a confirmação embutida no helper) mostra valor presente e com o formato esperado da tabela de contrato.
3. **Health-check por credencial:** As 5 chamadas de teste da tabela (T6.1–T6.5) retornam HTTP 200 (ou erro claro e documentado, caso a credencial ainda não tenha sido gerada — nesse caso a AC5 correspondente fica `PENDENTE`, não `FALHOU`).
4. **Sem exposição ao client:** `grep -rn "NEXT_PUBLIC_ANTHROPIC_ADMIN\|NEXT_PUBLIC_OPENAI_ADMIN\|NEXT_PUBLIC_VERCEL_BILLING\|NEXT_PUBLIC_META_SYSTEM_USER\|NEXT_PUBLIC_SUPABASE_MANAGEMENT" packages/` retorna vazio (nenhum uso indevido, mesmo que ainda não exista código consumidor).
5. **Redeploy confirmado:** Existe um deployment de produção posterior ao momento da última gravação de env var.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Pré-requisitos humanos (Anthropic/OpenAI/Meta admin keys) atrasam indefinidamente a story, bloqueando 78-3/78-4/78-6 | ALTA | AC8 torna o bloqueio explícito e rastreável; @devops comunica a dependência imediatamente ao assumir a story, em vez de descobrir isso no meio da 78-3 |
| R2 | Uso acidental de `vercel env add` via stdin por pressa/hábito, gravando valor vazio silenciosamente | ALTA | AC2 proíbe explicitamente; `scripts/vercel-env-set.sh` já existe e é o caminho de menor esforço, reduzindo a tentação de usar o CLI interativo |
| R3 | Token de escopo excessivo (ex. token pessoal do CLI Vercel, ou Meta token sem escopo de `ads_read` quando 78-10 for implementada) | MÉDIA | T3.1 exige token dedicado de escopo mínimo; contrato de nomes (AC1) já reserva `META_SYSTEM_USER_TOKEN` com os 2 escopos desde já, evitando retrabalho na 78-10 |
| R4 | Secret vazado (valor colado em log/story/Change Log) | ALTA | Dev Notes e Testing Standards proíbem explicitamente colar valor completo de secret em qualquer lugar da story |
| R5 | Health-check de credencial ainda inexistente (pré-requisito humano pendente) é confundido com "coletor com bug" | BAIXA | AC5/T6 tratam explicitamente o estado "pendente de geração" como distinto de "falhou" |

---

## Dependencies

- **Depende de:** nada tecnicamente bloqueante da Story 78-1 (schema e secrets podem ser feitos em paralelo, conforme nota de sequenciamento do épico: "78-1 → 78-2 primeiro (fundação + secrets)"), mas **precisa** que os 3 pré-requisitos humanos (AC8) sejam resolvidos por alguém com papel de owner nas respectivas plataformas.
- **Bloqueia diretamente:** Story 78-3 (coletor Anthropic — precisa de `ANTHROPIC_ADMIN_KEY`), Story 78-4 (coletor OpenAI — precisa de `OPENAI_ADMIN_KEY`), Story 78-5 (coletor Vercel — precisa de `VERCEL_BILLING_TOKEN`/`VERCEL_TEAM_ID`), Story 78-6 (coletor WhatsApp — precisa de `META_SYSTEM_USER_TOKEN`), Story 78-7 (fallback Supabase — precisa de `SUPABASE_MANAGEMENT_PAT`/`SUPABASE_ORG_SLUG`), Story 78-10 opcional (Meta Ads — reusa `META_SYSTEM_USER_TOKEN` com escopo `ads_read`).
- **Dependências técnicas:**
  - `scripts/vercel-env-set.sh` (helper existente)
  - `.vercel/project.json` (projectId/teamId do projeto)
  - `~/Library/Application Support/com.vercel.cli/auth.json` (token de autenticação do CLI, usado pelo helper)

---

## Definition of Done

- [ ] Contrato de nomes de env var (AC1) documentado e sem colisão com env vars existentes
- [ ] As 2 credenciais sem dependência de owner externo (Vercel token, Supabase PAT) gravadas e validadas
- [ ] Os 3 pré-requisitos humanos (Anthropic, OpenAI, Meta) resolvidos pelo owner e as respectivas env vars gravadas e validadas — **story não pode ser Done com qualquer um destes 3 ainda `PENDENTE`**
- [ ] Todas as 8 env vars confirmadas com valor não vazio (AC3)
- [ ] Nenhuma gravação usou `vercel env add` via stdin (AC2)
- [ ] Health-check read-only executado e documentado para as 5 credenciais (AC5)
- [ ] Nenhuma env var exposta como `NEXT_PUBLIC_*` (AC4)
- [ ] Documentação de rotação preenchida (AC6)
- [ ] `vercel redeploy` executado após a última gravação (AC7)
- [ ] Tabela-resumo final preenchida (AC10)
- [ ] @architect executou quality gate com verdict PASS ou CONCERNS documentados e aceitos
- [ ] @devops fez push do commit final (apenas a documentação desta story — não há código de aplicação)

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave `coderabbit_integration` ausente).
> Validação de qualidade usará processo de revisão manual pelo @architect (quality gate desta story).
> Nota adicional: mesmo se habilitado, esta story não teria diff de código para o CodeRabbit analisar (é provisionamento de infraestrutura), então o quality gate seria majoritariamente uma auditoria manual de comandos/evidências.

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-07-08 | 0.1 | Story criada a partir do Epic 78 (§7, story 78-2; CON-2; risco "Admin keys Anthropic/OpenAI como pré-requisito"). Contrato de 7 env vars fixado: `ANTHROPIC_ADMIN_KEY`, `OPENAI_ADMIN_KEY`, `VERCEL_BILLING_TOKEN`, `VERCEL_TEAM_ID`, `META_SYSTEM_USER_TOKEN`, `SUPABASE_MANAGEMENT_PAT`, `SUPABASE_ORG_SLUG`. [AUTO-DECISION] Sufixo `_ADMIN_KEY` (não `_API_KEY`) para Anthropic/OpenAI → reason: eliminar ambiguidade com `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` já existentes no Vercel (confirmado via memória `reference_vercel_env.md` — nenhuma colisão de nome). [AUTO-DECISION] `META_SYSTEM_USER_TOKEN` único (não dois tokens separados para WhatsApp/Ads) → reason: System User do Meta Business Manager pode carregar múltiplos escopos (`whatsapp_business_management` + `ads_read`) no mesmo token; evita retrabalho de provisionamento quando a Story 78-10 opcional for ativada (depende de OQ-2). [AUTO-DECISION] Vercel access token dedicado (não reusar token pessoal do CLI de `auth.json`) → reason: separar credencial de automação/produção do login pessoal do desenvolvedor, seguindo princípio de menor privilégio. [AUTO-DECISION] 3 credenciais marcadas como Pré-requisito Humano bloqueante (AC8) → reason: não existe endpoint de API para gerar admin/org keys ou System User tokens de forma automatizada; exige login humano com papel de owner nos consoles Anthropic/OpenAI/Meta — Article II (Agent Authority) não permite a um agente assumir esse papel. Executor @devops, quality gate @architect (mapping confirmado no Epic 78 §7). CodeRabbit Disabled (mesma constatação da Story 78-1 — chave ausente em core-config.yaml). | @sm (River) |
| 2026-07-13 | 0.3 | **Execução PARCIAL (@devops Gage) — Status Ready → InProgress.** Provisionadas e validadas as credenciais cujos tokens o usuário já forneceu: **Vercel** (`VERCEL_BILLING_TOKEN` + `VERCEL_TEAM_ID`) e **Supabase** (`SUPABASE_MANAGEMENT_PAT` + `SUPABASE_ORG_SLUG`), todas via REST API direta `POST /v10/projects/{id}/env` (`type:encrypted`, target production/preview/development) — nunca stdin (AC2), nenhuma vazia (AC3, confirmado por re-GET decrypted, valor nunca ecoado). Health-check read-only OK: Vercel `GET /v2/user`+`/v9/projects/{id}` HTTP 200 e `GET /v1/billing/charges` HTTP 200 (JSONL FOCUS com `BilledCost`/`ServiceName` — escopo de billing confirmado); Supabase `GET /v1/organizations`+`/v1/projects` HTTP 200 (org slug `hgvhxeyntttvnjxxdnkz`, prod `dsopqkqjkmhytudaaolv` confirmado). `RESEND_API_KEY` já existia (prod+preview, `re_`, 36 chars) — conferida e NÃO recadastrada (AC9). Sem colisão de nomes (T1.1: 74 env vars, 7 novos ABSENT). Nenhum `NEXT_PUBLIC_*` (AC4). **NÃO executado:** redeploy (AC7 — adiado até o código dos coletores 78-5/78-7 existir, por instrução) e as 3 credenciais de pré-requisito humano de owner permanecem **PENDENTES** (Anthropic Admin key, OpenAI Admin key, Meta System User token) + `WHATSAPP_BUSINESS_ACCOUNT_ID` ainda a gravar. Story **não pode ser Done** (AC8/DoD). [AUTO-DECISION] REST API direta em vez de `vercel-env-set.sh` → reason: helper autentica via `auth.json` (conta `freelans-dev` sem acesso à trifold, daria 403); usado token fornecido pelo usuário. Arquivo temporário de tokens apagado ao fim da sessão (`rm -f`); nenhum valor de secret escrito no working tree. | @devops (Gage) |
| 2026-07-13 | 0.4 | **Provisionamento Anthropic (@devops Gage) — pré-requisito humano #1 resolvido.** Owner gerou a Anthropic Admin key e forneceu ao @devops. Validada ANTES de gravar: `GET /v1/organizations/cost_report?starting_at=2026-07-06&ending_at=2026-07-13` (headers `x-api-key` + `anthropic-version: 2023-06-01`) → **HTTP 200**, 7 buckets diários / 7 result entries com dados de custo presentes (escopo billing de organização confirmado; valor da key nunca ecoado). Gravada `ANTHROPIC_ADMIN_KEY` via REST API direta `POST /v10/projects/prj_s3ARh1fpDnzbx9ua4MYJf9iqdRhj/env?teamId=team_XCf2jBxUmCXao0prWVy0VmOZ` (`type:encrypted`, targets production/preview/development, HTTP 201, env id `3qxeovn8AHYzklrp`) — nunca stdin (AC2). Re-GET decrypted confirmou não-vazia (len 110, prefixo `sk-ant-admin01-` OK — AC3). Autenticação via `VERCEL_BILLING_TOKEN` de escopo trifold (conta `nicoletrifold-droid`), não o CLI `auth.json`. **NÃO executado:** redeploy (AC7 — batch com coletores 78-5/78-7). Ambos os arquivos temporários de token apagados (`rm -f`); nenhum valor de secret no working tree. **Ainda PENDENTES** (AC8/DoD, story não pode ser Done): `OPENAI_ADMIN_KEY` (pré-req humano #2), `META_SYSTEM_USER_TOKEN` (pré-req humano #3) e o identificador `WHATSAPP_BUSINESS_ACCOUNT_ID` (T5.4). | @devops (Gage) |
| 2026-07-08 | 0.2 | **Validação cruzada do backlog do Epic 78 (@po Pax) — GO, Status Draft → Ready.** Correção obrigatória aplicada: contrato de env vars ampliado de 7 → **8** variáveis com a inclusão de `WHATSAPP_BUSINESS_ACCOUNT_ID` (identificador do WABA, análogo a `VERCEL_TEAM_ID`/`SUPABASE_ORG_SLUG`), fechando o gap identificado pela Story 78-6 (que precisa desse ID para montar a URL de `pricing_analytics` e não o encontrava no contrato). Atualizados: tabela de contrato (Dev Notes), AC1, AC2/AC3/AC4/AC10 (contagem 7→8), AC5 (WABA ID listado como identificador sem health-check próprio), T1.1 (7→8), nova subtask T5.4 (gravar o identificador, sem pré-requisito humano). Verificado que 78-7 (Supabase/Resend) e 78-10 (Meta Ads) não introduzem env var fora deste contrato (`RESEND_API_KEY`/`NEXT_PUBLIC_SUPABASE_URL` pré-existentes; `meta_account_id` lido de `meta_ad_accounts`, não env). | @po (Pax) |

---

## Dev Agent Record

_A ser preenchido pelo @devops durante a implementação._

### Agent Model Used
Opus 4.8 (1M) — @devops (Gage), execução parcial 2026-07-13

### Debug Log References
—

### Completion Notes List

**Execução PARCIAL 2026-07-13 (@devops).** Provisionadas e validadas apenas as credenciais cujos tokens o usuário já forneceu (Vercel, Supabase) + conferência da pré-existente (Resend). As 3 credenciais de pré-requisito humano (Anthropic Admin key, OpenAI Admin key, Meta System User token) permanecem **PENDENTES** — não há endpoint de API para gerá-las e exigem login humano de owner nos consoles. A story **NÃO** pode transicionar para Done enquanto esses 3 itens estiverem pendentes (DoD + AC8).

**Env vars provisionadas nesta sessão (nomes, nunca valores):**

| Env Var | Ação | Método | Target | Valor não-vazio |
|---------|------|--------|--------|-----------------|
| `VERCEL_BILLING_TOKEN` | CRIADA (id `H1z7fZcAx2JBANK8`) | `POST /v10/.../env` `type:encrypted` | production/preview/development | S (len 60) |
| `VERCEL_TEAM_ID` | CRIADA (id `WE98TAFRFEkh8FAC`) | `POST /v10/.../env` `type:encrypted` | production/preview/development | S (len 29, prefixo `team_`) |
| `SUPABASE_MANAGEMENT_PAT` | CRIADA (id `JzGSHdWcZwAkrzze`) | `POST /v10/.../env` `type:encrypted` | production/preview/development | S (len 44, prefixo `sbp_`) |
| `SUPABASE_ORG_SLUG` | CRIADA (id `zXqqMy6xb9lcjgnd`) | `POST /v10/.../env` `type:encrypted` | production/preview/development | S (len 20) |
| `RESEND_API_KEY` | NÃO tocada (já existia, prod id `WQ1P2KYEm92h1ed5`) | — | production/preview | S (len 36, prefixo `re_`) — conferida, não recadastrada |

**Identificadores derivados (não-secretos):**
- `VERCEL_TEAM_ID` = `team_XCf2jBxUmCXao0prWVy0VmOZ` (slug `trifold-s-projects`)
- `SUPABASE_ORG_SLUG` = `hgvhxeyntttvnjxxdnkz` (org name "trifold"; projeto prod `dsopqkqjkmhytudaaolv` confirmado)

**Gotcha do valor vazio (R2/AC3):** NÃO ocorreu. Gravação via REST API direta (não `vercel env add` por stdin); confirmação de não-vazio feita via re-GET decrypted de cada id (apenas comprimento/prefixo inspecionados, valor nunca ecoado).

**[AUTO-DECISION]** Não usar `scripts/vercel-env-set.sh` → reason: o helper autentica via `~/Library/Application Support/com.vercel.cli/auth.json`, que está logado na conta `freelans-dev` (sem acesso à trifold, daria 403). Usada a REST API direta com o token fornecido pelo usuário (`Authorization: Bearer`) — mesmo endpoint interno do helper, satisfazendo AC2.

**[AUTO-DECISION]** target = production + preview + development para as 4 novas vars → reason: coletores futuros (78-5/78-7) podem ser testados localmente via `vercel env pull` e em preview deploys; ter as credenciais/identificadores nos 3 ambientes evita re-provisionamento.

**Redeploy (AC7): NÃO executado nesta sessão** — por instrução explícita, o `vercel redeploy` fica para quando o código dos coletores (78-5/78-7) for implementado, para não gerar deploy sem consumidor das novas vars.

**PENDENTE para fechar a story (pré-requisito humano de owner):**
- `ANTHROPIC_ADMIN_KEY` (T2.1/T5.1/T6.1) — gerar em console.anthropic.com/settings/admin-keys
- `OPENAI_ADMIN_KEY` (T2.2/T5.2/T6.2) — gerar em platform.openai.com/settings/organization/admin-keys
- `META_SYSTEM_USER_TOKEN` (T2.3/T5.3/T6.4) — Business Manager → System Users (escopos `whatsapp_business_management` + `ads_read`)
- `WHATSAPP_BUSINESS_ACCOUNT_ID` (T5.4) — identificador do WABA; não exige owner, mas não fazia parte dos tokens fornecidos nesta sessão → ainda a gravar
- Redeploy (AC7) + tabela-resumo final completa (AC10) após as 4 acima.

### File List
Nenhum arquivo de código (story de infraestrutura pura). Alterações apenas neste arquivo de story. Secrets provisionados no Vercel (fora do repositório).

---

## QA Results

_A ser preenchido pelo @architect durante o quality gate desta story (papel de quality gate, conforme Executor Assignment)._
