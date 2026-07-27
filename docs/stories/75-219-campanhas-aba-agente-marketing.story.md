# Story 75-219 — Módulo Campanhas: aba "Agente" (fundação do agente de marketing IA + geração de sugestões)

**Status:** Ready for Review
**Tipo:** Feature (fundação de épico)
**Epic:** Agente de Marketing (Fase 2 — módulo no CRM)
**Complexidade:** M/L

## Contexto

Pedido do Marcos (27/07): o CRM já sincroniza campanhas Meta Ads (aba **Meta Ads** em
`dashboard/campaigns/meta/`, com spend/impressões/CTR/CPL por campanha) e os leads
carregam o criativo de origem (`leads.metadata->>'ad_id'` → `meta_ads.meta_ad_id`,
98+ leads vinculados em prod). A Fase 1 do agente de marketing (arte via Canva no
Claude, briefing mestre) já roda **fora** do CRM. Esta story cria o ambiente do agente
**dentro** do CRM: uma 3ª aba no módulo Campanhas onde o agente propõe posts com base
na performance real (até fundo de funil — ex.: Ação Muffato com 176 cadastros e 0
válidos é aprendizado, não sucesso) e um humano aprova/rejeita. **Nada é publicado
automaticamente** — publicação via Graph API, calendário automático e integração
Canva Connect/autofill (🔥 exige Canva ENTERPRISE) ficam para stories futuras.

## Arquitetura

Mesmo padrão dos agentes existentes ("agentes conversam" = compartilham o banco):

1. **Fila no banco** — tabela `marketing_posts` (fila de aprovação), análoga à fila
   de aprovações de obra: o agente INSERE sugestões, o humano decide.
2. **Pipeline IA no padrão Nicole/Análise de Comportamento** — flow puro em
   `packages/ai/src/flows/` (Claude API via `createAnthropicClient()` +
   `ANTHROPIC_MODELS` de `@trifold/ai`), chamado on-demand por uma rota API
   (mesmo desenho da Story 82-1: rota junta contexto → flow chama o modelo →
   parse JSON estrito → persiste; JSON inválido → nada é persistido).
3. **Fontes de dados já existentes** — RPC `public.creative_performance(p_days)`
   (mig 101: spend/CTR/CPL por criativo × funil CRM agendado/visitou/proposta/
   fechado), `meta_campaigns` + `meta_insights_daily` (padrão da rota
   `/api/meta-ads/campaigns`) e `properties` (empreendimentos, `is_active = true`).

## Acceptance Criteria

1. **AC1 — Aba "Agente" no módulo Campanhas.** Nova rota
   `packages/web/src/app/dashboard/campaigns/agente/` como 3ª aba
   (`CRM | Meta Ads | Agente`), seguindo o padrão de tabs existente (links com
   borda laranja no ativo). As tabs das telas CRM (`page.tsx`) e Meta Ads
   (`campaigns-meta-client.tsx`) passam a exibir o link "Agente". Tema segue a
   convenção `/dashboard`: light/dark com classes `dark:`.
2. **AC2 — Acesso restrito.** A página e TODAS as rotas API da aba são gateadas
   a **admin/supervisor** (server-side). Perfis sem acesso não veem a aba nem
   conseguem chamar os endpoints (403). Corretor/SDR/gerente ficam de fora nesta
   fase.
3. **AC3 — Migration `marketing_posts`.** Tabela criada em
   `supabase/migrations/193_marketing_posts.sql` (⚠️ conferir numeração contra a
   pasta local — última hoje: 192 — E contra o schema remoto de prod antes de
   aplicar; gotchas 074/075 e lição 75-188) com no mínimo: `id`, `org_id`,
   `empreendimento_id` (FK `properties`, nullable — post institucional),
   `canal` (`instagram`/`facebook`), `copy` (text), `arte_url` (text nullable —
   link do design Canva colado manualmente nesta fase), `scheduled_for` (date
   sugerida, nullable), `status` (`sugerido` → `aprovado` | `rejeitado` →
   `publicado`), `justificativa` (text — por que o agente sugeriu),
   `origem` (`agente`/`humano`), `created_by` (FK `users`, nullable),
   `created_at`/`updated_at`. RLS habilitada coerente com o módulo.
4. **AC4 — UI com 3 áreas.** A aba mostra: **Sugestões** (posts `status=sugerido`
   com a `justificativa` visível em cada card), **Fila de aprovação** (ações
   aprovar / editar / rejeitar sobre as sugestões) e **Publicados** (histórico;
   posts `aprovado` têm ação manual "Marcar como publicado"). Post rejeitado sai
   da fila mas permanece consultável (não é DELETE).
5. **AC5 — Cadastro manual.** Botão "+ Novo post" abre formulário
   (empreendimento, canal, copy, arte_url, data sugerida) e cria post com
   `origem='humano'` e `status='sugerido'` (entra na mesma fila de aprovação).
6. **AC6 — Botão "Gerar sugestões".** Endpoint API que monta o contexto
   (performance das campanhas/criativos Meta sincronizados **incluindo leads
   válidos vs cadastros brutos**, funil CRM por criativo via
   `creative_performance`, e empreendimentos ativos) e chama a Claude API no
   padrão do pipeline da Nicole. Saída: N posts (3–5) inseridos em
   `marketing_posts` com `status='sugerido'`, `origem='agente'` e
   `justificativa` preenchida citando os dados que motivaram a sugestão.
7. **AC7 — Fail-open / nunca publica sozinho.** Erro da Claude API, JSON
   inválido ou timeout → nenhuma linha é inserida e a UI mostra erro amigável
   com retry; o CRM segue funcionando (nada além desta feature depende do
   modelo). O agente NUNCA cria posts com status diferente de `sugerido` e não
   existe nenhum caminho de publicação automática nesta story.

## Tasks

- [x] **T1 (AC3)** — Migration `supabase/migrations/193_marketing_posts.sql`:
  tabela + CHECKs de `canal`/`status`/`origem` + índice `(org_id, status)` +
  `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (ver Dev Notes › RLS) + COMMENTs.
- [x] **T2 (AC6)** — Flow `packages/ai/src/flows/marketing-suggestions.ts` (+
  teste) no padrão de `behavior-analysis.ts`: prompt JSON-only, parser estrito
  (`parseMarketingSuggestions`), export em `flows/index.ts`.
- [x] **T3 (AC2, AC6)** — Rotas API em
  `packages/web/src/app/api/marketing-posts/`:
  - `GET /api/marketing-posts?status=` (listagem por área)
  - `POST /api/marketing-posts` (cadastro manual, `origem='humano'`)
  - `PATCH /api/marketing-posts/[id]` (editar copy/arte_url/scheduled_for;
    transições aprovar/rejeitar/publicar com validação de transição)
  - `POST /api/marketing-posts/generate` (monta contexto + chama flow + insere
    sugestões; `export const maxDuration = 90`)
  Todas com `requireAuth` + `requireRole(appUser, ["admin", "supervisor"])`.
- [x] **T4 (AC1, AC4, AC5)** — UI `dashboard/campaigns/agente/` (page server +
  client component): 3 áreas, cards de sugestão com justificativa, ações
  aprovar/editar/rejeitar/publicar, modal "+ Novo post", botão "Gerar sugestões"
  com loading/erro/retry. Tabs atualizadas nas 2 telas existentes.
- [x] **T5 (AC2)** — Gate server-side da página (redirect/403 para não
  admin/supervisor) sem quebrar o acesso já existente às abas CRM e Meta Ads.
- [x] **T6** — Testes: parser do flow (JSON válido/inválido/truncado), guard de
  transição de status, gate de acesso das rotas. `npm run lint` + `typecheck` +
  suíte completa verdes.

## Dev Notes

### Tabs (AC1)
O padrão atual é um componente `CampaignsTabs` **duplicado inline** em
`dashboard/campaigns/page.tsx` (linhas 6–23) e em
`dashboard/campaigns/meta/campaigns-meta-client.tsx` (linha 166, com prop
`active`). Adicionar o link "Agente" nos dois + criar a versão da nova página.
[AUTO-DECISION] Manter o padrão duplicado-inline (3 cópias) em vez de extrair
componente compartilhado — é o padrão vigente e extração é refactor fora do
escopo; se o @dev preferir extrair para `_components/campaigns-tabs.tsx`, ok,
desde que as 3 telas usem.
[AUTO-DECISION] O link "Agente" nas tabs só aparece para admin/supervisor
(as outras abas continuam para quem já acessa o módulo "campanhas") — evita
aba visível que devolve 403.

### Gate de acesso (AC2)
O módulo Campanhas é gateado pelo layout (`dashboard/layout.tsx` mapeia
`"/dashboard/campaigns" → "campanhas"`); a tela Meta Ads usa
`canAccess(user.id, user.orgId, "sistema")` apenas para ações administrativas.
[AUTO-DECISION] Gate da aba Agente = `requireRole(["admin","supervisor"])` nas
rotas API (helper `packages/web/src/lib/api-auth.ts:56`) + checagem de role na
page server-side. NÃO usar `canAccess("sistema")` (só admin por padrão —
excluiria supervisor) nem criar módulo novo na matriz (épico de capabilities
[[project-perfis-capabilities-epico]] vai repensar isso; não antecipar).

### Migration / RLS (AC3)
- Última migration local: `192_stamp_primeiro_atendimento_ignora_sdr.sql` →
  esta será a **193**. Conferir também o remoto de prod antes de aplicar
  (lição 75-188: dev DB ≠ prod).
- Esqueleto sugerido:
  ```sql
  CREATE TABLE IF NOT EXISTS marketing_posts (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    empreendimento_id uuid REFERENCES properties(id) ON DELETE SET NULL,
    canal             text NOT NULL CHECK (canal IN ('instagram', 'facebook')),
    copy              text NOT NULL,
    arte_url          text,
    scheduled_for     date,
    status            text NOT NULL DEFAULT 'sugerido'
                        CHECK (status IN ('sugerido', 'aprovado', 'rejeitado', 'publicado')),
    justificativa     text,
    origem            text NOT NULL DEFAULT 'agente' CHECK (origem IN ('agente', 'humano')),
    created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_marketing_posts_org_status ON marketing_posts(org_id, status);
  ALTER TABLE marketing_posts ENABLE ROW LEVEL SECURITY;
  ```
- [AUTO-DECISION] RLS: **habilitada SEM policies** + acesso exclusivamente via
  rotas API gateadas (admin client/service-role) — mesmo padrão de
  `lancamentos` (mig 145), `imobiliarias` (131) e `imob_*` (129), que são os
  módulos análogos (restritos a gestão). Alternativa policy `org_isolation`
  (padrão meta_*, mig 015) fica documentada caso o @po prefira leitura via
  client do usuário.
- A tabela de empreendimentos é **`properties`** (mig 002; `campaigns` já
  referencia `property_id → properties`). Empreendimento "ativo" =
  `is_active = true`.
- `created_by`: para `origem='humano'` = usuário logado; para
  `origem='agente'` = NULL (o campo `origem` já identifica o autor-agente).
- Convenção análoga a "nunca inserir org_id em messages": aqui `org_id` é
  OBRIGATÓRIO em todo INSERT (tabela nova multi-org, sem trigger que preencha).

### Flow IA (AC6, AC7)
- Cliente/modelos: `createAnthropicClient()` e `ANTHROPIC_MODELS` em
  `packages/ai/src/client/anthropic.ts` (exportados por `@trifold/ai`).
  [AUTO-DECISION] Modelo = `ANTHROPIC_MODELS.sonnet` — a tarefa é raciocínio
  sobre performance + criação de copy (mesma classe da análise de
  comportamento), não extração barata (haiku).
- 🔥 GOTCHA Sonnet 5 (memória + `behavior-analysis.ts:108-122`): adaptive
  thinking POR PADRÃO → **nunca ler `content[0]`**; sempre
  `.filter((b) => b.type === "text")` e `max_tokens` folgado (8000 no flow de
  referência).
- Padrão da rota (referência: Story 82-1,
  `app/api/leads/[id]/behavior-analysis/route.ts`): `export const maxDuration
  = 90` (Sonnet com thinking passa do timeout default do Vercel); parse
  inválido → 502 sem persistir nada; try/catch → 500 amigável. Fail-open: o
  erro fica contido na feature.
- ⚠️ **Qual client usar em cada acesso da rota `generate` (INEQUÍVOCO):**
  | Acesso | Client | Por quê |
  |--------|--------|---------|
  | RPC `creative_performance` | **client do USUÁRIO** (o `supabase` devolvido por `requireAuth`) | A função é SECURITY INVOKER e tem `WHERE a.org_id = public.user_org_id() AND public.is_admin_or_supervisor()` (mig 101, linhas 126-127). Com o admin/service-role client `auth.uid()` é NULL → as duas condições falham → **retorna 0 linhas SILENCIOSAMENTE** (sem erro). Bug clássico e invisível. |
  | `meta_campaigns` + `meta_insights_daily` | client do usuário (tabelas têm policy `org_isolation`, mig 015) | Mesmo desenho da rota `/api/meta-ads/campaigns`. |
  | `properties` (`is_active = true`) | client do usuário | RLS já permite leitura para staff. |
  | INSERT/SELECT em `marketing_posts` | **admin client** (service-role) | RLS habilitada SEM policies (ver AUTO-DECISION acima) → o client do usuário não enxerga a tabela. Vale para TODAS as rotas de `marketing_posts` (GET/POST/PATCH/generate). |

  O gate `requireRole(["admin","supervisor"])` do AC2 é MAIS restrito que o
  guard interno da RPC (`is_admin_or_supervisor()` inclui também obras/
  gerente-*/sdr desde a mig 189) — então todo usuário que passa do gate passa
  na RPC. Sanity check no @dev: logar `rows.length` do RPC em dev; 0 linhas
  com dados Meta sincronizados = client errado.
- Contexto a montar na rota `generate`:
  1. `supabase.rpc("creative_performance", { p_days: 30 })` — por criativo:
     spend, impressões, CTR, CPL, `total_leads` (cadastros brutos Meta) vs
     `crm_leads_total/agendado/visitou/proposta/fechado` (funil real).
  2. `meta_campaigns` + `meta_insights_daily` da org (mesmo desenho da rota
     `/api/meta-ads/campaigns`) — visão por campanha.
  3. `properties` com `is_active = true` (name, status, city, delivery_date,
     differentials) — o que há para divulgar.
- "Leads válidos vs cadastros": usar o contraste `total_leads` (Meta) ×
  `crm_leads_*` (CRM) da `creative_performance`. Se o flow consultar `leads`
  diretamente, filtrar `segmento = 'principal'` (convenção do mundo principal).
- ⚠️ PostgREST corta em 1000 linhas: agregações sempre via RPC/count, nunca
  contando linhas de um select paginado (convenção
  [[project-teto-leads-regua-unica]]).
- Contrato de saída do flow (JSON-only, sem markdown):
  `{ posts: [{ empreendimento_id|null, canal, copy, scheduled_for|null,
  justificativa }] }` — máx. 5. O flow retorna `null` em parse inválido;
  a rota insere com `status='sugerido'`, `origem='agente'`.
- `justificativa` deve citar dados concretos ("criativo X: CPL R$ 12 e 4
  visitas em 30d" / "Muffato: 176 cadastros, 0 no funil → evitar formato").

### UI (AC4, AC5)
- Tema: página em `/dashboard` → light/dark com `dark:` (padrão visível em
  `campaigns/page.tsx`: `dark:bg-stone-900`, `dark:text-stone-*`,
  `dark:ring-stone-800`; accent laranja `orange-600`/`dark:orange-300`).
- Transições de status válidas (validar no PATCH):
  `sugerido → aprovado | rejeitado`; `aprovado → publicado`; `rejeitado` e
  `publicado` são terminais. Editar (copy/arte_url/scheduled_for) permitido em
  `sugerido` e `aprovado`.
- `arte_url` é um link colado manualmente (design do Canva) nesta fase — campo
  de texto simples, sem upload. Se algum dia virar upload de imagem, seguir a
  CONVENÇÃO signed URL ([[project-upload-signed-url-convencao]] — Vercel corta
  body em 4.5MB).
- Sem realtime/notificações nesta story — refresh após ação é suficiente.

### Fora do escopo (stories futuras)
- Publicação via Graph API (Instagram/Facebook).
- Calendário automático / agendamento recorrente.
- Integração Canva Connect/autofill (🔥 GOTCHA: autofill exige Canva
  ENTERPRISE; alternativas mapeadas em memória do projeto).
- Notificações (sino/e-mail) de novas sugestões.
- Acesso para perfis além de admin/supervisor.

### Testing
- Testes de unidade junto aos arquivos (padrão do repo, ex.:
  `packages/ai/src/flows/behavior-analysis.test.ts`):
  - parser do flow: JSON válido, JSON com campos faltando, resposta com
    thinking block antes do text, resposta não-JSON → `null`.
  - guard de transição de status do PATCH (matriz válida/inválida).
  - gate: role broker/gerente → 403 nas 4 rotas.
- Manual: gerar sugestões em dev com dados Meta sincronizados; aprovar →
  publicados; rejeitar → some da fila; cadastro manual entra como sugerido.
- Suíte completa + `tsc` + `eslint` + `build` limpos antes do gate.

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only (@qa gate).

## Pendências / Atenção do @po — RESOLVIDAS (@po, 2026-07-27)

1. ✅ **`scheduled_for` como date (sem hora): SIM, basta.**
   [AUTO-DECISION] Nesta fase NADA é publicado automaticamente — o campo é só
   uma sugestão de DIA para o humano; hora de publicação é decisão manual fora
   do CRM. Quando o calendário automático (story futura) precisar de hora,
   `ALTER COLUMN scheduled_for TYPE timestamptz` é migração trivial e
   retrocompatível. Adicionar hora agora = precisão falsa sem consumidor.
2. ✅ **Canais: manter só `instagram`/`facebook`.**
   [AUTO-DECISION] "Stories" é um FORMATO dentro do Instagram, não um canal —
   misturar os dois eixos no mesmo CHECK criaria inconsistência (`stories` de
   qual rede?). O briefing do projeto (memória project-agente-marketing) fala
   em posts IG/FB. Se formato virar requisito, entra como coluna `formato`
   própria em story futura; o CHECK de `canal` estende-se com 1 linha.
3. ✅ **Gate por `requireRole(["admin","supervisor"])`: APROVADO.**
   [AUTO-DECISION] Criar módulo novo na matriz exigiria a varredura completa
   da convenção de role novo (union+rank+RLS, ver project-perfil-sdr) para uma
   superfície que o épico de capabilities [[project-perfis-capabilities-epico]]
   vai redesenhar — antecipar seria retrabalho certo. `requireRole` server-side
   nas 4 rotas + page é suficiente, auditável e fácil de migrar. A convenção
   "gatear por canAccess, não role fixo" (project-brindes-canaccess) aplica-se
   a escrita DENTRO de módulos já na matriz; aqui a aba inteira é nova e
   deliberadamente restrita. Migração para a matriz fica registrada em "Fora
   do escopo".
4. ✅ **RLS habilitada SEM policies (padrão lancamentos): APROVADO.**
   [AUTO-DECISION] Verificado na mig 145: `lancamentos` usa exatamente esse
   padrão com comentário explícito ("sem CREATE POLICY de propósito"). É o
   padrão dos módulos restritos a gestão — `marketing_posts` é análogo
   (admin/supervisor only). Policy `org_isolation` (padrão meta_*, mig 015)
   daria leitura a QUALQUER usuário autenticado da org — mais superfície do
   que o AC2 permite. Consequência prática documentada nos Dev Notes: TODAS as
   operações em `marketing_posts` usam o admin client.
5. ✅ **AC6 / client da `creative_performance`: contradição corrigida.**
   Os Dev Notes diziam "(server-side, admin client)" no cabeçalho da mesma
   lista cujo item 1 mandava usar o client do usuário. Substituído por tabela
   inequívoca "qual client em cada acesso" + explicação do modo de falha
   (service-role → `auth.uid()` NULL → 0 linhas silenciosas) + sanity check
   para o @dev. Verificado na mig 101 (linhas 126-127) que o guard fica no
   WHERE — falha silenciosa confirmada, não erro.

## Dev Agent Record

### Agent Model Used
Claude Fable 5 (claude-fable-5) — @dev (Dex), modo YOLO.

### File List
**Criados:**
- `supabase/migrations/193_marketing_posts.sql` — tabela `marketing_posts` + CHECKs + índice `(org_id, status)` + RLS habilitada SEM policies (padrão mig 145) + COMMENTs.
- `packages/ai/src/flows/marketing-suggestions.ts` — flow IA (Sonnet, prompt JSON-only, parser estrito `parseMarketingSuggestions`, filtro de thinking blocks, max_tokens 8000).
- `packages/ai/src/flows/marketing-suggestions.test.ts` — 12 testes (parser válido/inválido/truncado/canal inválido/limite 5; blocos thinking antes do text; só-thinking → null).
- `packages/web/src/lib/marketing/posts.ts` — regras puras: `MARKETING_POST_ROLES`, matriz de transição (`canTransitionMarketingPost`), `isMarketingPostEditable`, `validateMarketingPostInput`.
- `packages/web/src/lib/marketing/posts.test.ts` — 13 testes (matriz de transição completa incl. terminais/regressões, roles do gate, validação de input).
- `packages/web/src/lib/marketing/guard.ts` — `marketingGuard()`: requireAuth + requireRole(admin/supervisor) + admin client + client do usuário.
- `packages/web/src/app/api/marketing-posts/route.ts` — GET (?status=) + POST manual (origem='humano', status='sugerido').
- `packages/web/src/app/api/marketing-posts/[id]/route.ts` — PATCH: edição (só sugerido/aprovado) + transição validada server-side (422 em transição inválida; rejeitar ≠ DELETE).
- `packages/web/src/app/api/marketing-posts/generate/route.ts` — POST gerar sugestões (`maxDuration = 90`): RPC `creative_performance` via client do USUÁRIO (tabela de clients da story), meta_campaigns/insights/properties via client do usuário, INSERT via admin client; fail-open (502 parse inválido / 500 erro / nada persistido).
- `packages/web/src/app/dashboard/campaigns/agente/page.tsx` — page server: gate admin/supervisor (redirect) + properties ativas p/ o form.
- `packages/web/src/app/dashboard/campaigns/agente/agente-client.tsx` — UI: 3 áreas (Sugestões—fila de aprovação / Publicados / Rejeitados), cards com justificativa, ações aprovar/editar/rejeitar/publicar, modal "+ Novo post", botão "Gerar sugestões" com loading/erro/retry.

**Modificados:**
- `packages/ai/src/flows/index.ts` — export do novo flow + types.
- `packages/web/src/app/dashboard/campaigns/page.tsx` — tab "Agente" (prop `showAgente`, só admin/supervisor).
- `packages/web/src/app/dashboard/campaigns/meta/page.tsx` — calcula `showAgenteTab` e repassa ao client.
- `packages/web/src/app/dashboard/campaigns/meta/campaigns-meta-client.tsx` — tab "Agente" condicional no `CampaignsTabs`.
- `docs/stories/75-219-campanhas-aba-agente-marketing.story.md` — checkboxes, Dev Agent Record, status.

### Completion Notes
- **AC1–AC7 implementados.** Nenhuma migration aplicada em banco (aplicação = passo do deploy; conferir numeração 193 contra o schema remoto de prod antes de aplicar — lição 75-188).
- **[AUTO-DECISION] Layout das 3 áreas (AC4):** "Sugestões" e "Fila de aprovação" são a MESMA lista (status=sugerido) — a fila é a camada de ações sobre as sugestões, então a área única "Sugestões — fila de aprovação" traz cards com justificativa + ações aprovar/editar/rejeitar. Área "Publicados" lista aprovados (com "Marcar como publicado") + publicados; área "Rejeitados" mantém o histórico consultável (nunca DELETE). Interpretação literal de 3 blocos separados duplicaria a mesma lista na tela.
- **[AUTO-DECISION] Tabs:** mantido o padrão duplicado-inline (3ª cópia na aba Agente), conforme facultado pela story.
- **[AUTO-DECISION] `empreendimento_id` alucinado pelo modelo:** id fora da lista de properties ativas vira `null` (post institucional) em vez de quebrar o INSERT na FK.
- **Gate das rotas nos testes:** o teste cobre a matriz `MARKETING_POST_ROLES` (broker/gerente/sdr/obras/imob excluídos) — o 403 em si é dado pelo `requireRole` pré-existente usado pelo `marketingGuard` nas 4 rotas (repo não tem testes de integração de route handlers).
- **Validações:** suíte completa 1242 testes verdes (114 arquivos); `type-check` verde; `eslint` limpo nos arquivos da story (os 12 erros restantes do `pnpm lint` em packages/web são PRÉ-EXISTENTES na main — encoderWorker.min.js, informe/*, weather-widget — confirmado com `git stash`); `npm run build` verde.

### Debug Log References
- Sanity check da RPC no `generate`: `console.log("[marketing-posts/generate] creative_performance rows: N")` — 0 linhas com Meta sincronizada = client errado (falha silenciosa documentada na story).

## QA Results

### Review Date: 2026-07-27

### Reviewed By: Quinn (Test Architect) — @qa

**Veredito: CONCERNS (aprovado com ressalvas — pode seguir para @devops com o checklist de deploy do gate).**

**7 checks:** code_review PASS · unit_tests PASS (1242/1242, +25 novos) · acceptance_criteria PASS (AC1–AC7) · regressions PASS · performance CONCERNS (PERF-001, debt) · security PASS · documentation PASS.

**Validações executadas:** `npm run test` (1242/1242 ✅) · `npm run type-check` (8/8 ✅) · `npm run build` (✅) · eslint dirigido nos arquivos da story (0 erros/0 warnings; os 12 erros do `pnpm lint` em packages/web confirmados pré-existentes nos mesmos 4 arquivos da main) · revisão manual completa do diff (16 arquivos, CodeRabbit disabled) · validação estática da migration 193 (CHECKs, FKs, índice, RLS sem policies = padrão mig 145, numeração correta vs pasta local) · verificação cruzada da mig 101 (SECURITY INVOKER + guard no WHERE → RPC via client do usuário confirmada no código) · skill claude-api carregada para validar o uso do SDK (modelo `claude-sonnet-5` válido; filter de thinking blocks correto; timeout 75s em ms; max_tokens folgado).

**Pontos de atenção do @dev — resolução:**
1. Verificação manual em dev pendente → **TEST-001 (medium)**: review estático rigoroso feito; risco residual = runtime nunca exercitado. Smoke obrigatório pós-deploy (checklist no gate).
2. Gate 403 por teste de constante → **TEST-002 (low)**: aceito (repo sem infra de teste de route handlers; `requireRole` battle-tested); curl de verificação pós-deploy.
3. [AUTO-DECISION] fusão Sugestões+Fila → **VALIDADA contra o AC4**: interpretação literal duplicaria a mesma lista; todas as funções pedidas presentes (justificativa por card, aprovar/editar/rejeitar, Publicados com ação manual, rejeitado consultável ≠ DELETE) + área Rejeitados extra. Atende o espírito do AC.
4. Migration 193 não aplicada → correto; validada estaticamente; aplicar no deploy conferindo numeração contra prod (lição 75-188).
5. CodeRabbit disabled → revisão 100% manual concluída.

**Achados:** TEST-001 (medium) verificação manual pendente · TEST-002 (low) 403 sem teste de integração · MNT-001 (low) PATCH edita também canal/empreendimento_id (superset benigno, manter) · PERF-001 (low, debt) meta_insights_daily sem paginação no generate (corte PostgREST 1000 linhas com >33 campanhas; mesmo desenho da rota existente) · MNT-002 (low) PATCH com id não-UUID → 500 em vez de 400.

**Destaques positivos:** client correto por acesso no generate (RPC via usuário + sanity log; marketing_posts via admin) · transições validadas contra o estado do banco, não do client · whitelist de input impede mass assignment · `empreendimento_id` alucinado → null protege a FK · zero caminho de publicação externa (grep confirmou) · tema dark: consistente em toda a UI nova.

### Gate Status

Gate: CONCERNS → docs/qa/gates/75.219-campanhas-aba-agente-marketing.yml

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-27 | 0.1 | Draft criado a partir da decisão de 27/07 (3ª aba no módulo Campanhas, fundação + IA). | @sm (River) |
| 2026-07-27 | 0.2 | Validação PO: GO (9/10). 5 pendências resolvidas ([AUTO-DECISION] 1-5); Dev Notes do AC6 corrigidos (tabela de client por acesso — RPC via client do usuário, marketing_posts via admin client). Status Draft → Ready. | @po (Pax) |
| 2026-07-27 | 0.3 | Implementação completa (T1–T6, modo YOLO): migration 193, flow marketing-suggestions + testes, 4 rotas API gateadas, aba Agente (UI 3 áreas + novo post + gerar sugestões), tabs atualizadas. Suíte/typecheck/build verdes. Status Ready → Ready for Review. | @dev (Dex) |
