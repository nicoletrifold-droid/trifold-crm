---
epic: 86
title: Conversions API (CAPI) e Rastreamento Meta — Evento "Visitou"
status: Draft
created_at: 2026-08-04
updated_at: 2026-09-03
created_by: River (@sm)
priority: High
sub_epics:
  - 86A: Base CAPI (credenciais, outbox, dispatcher, helper de payload)
  - 86B: Atribuição de Origem (fbclid/fbc/fbp) e Migração de Landing/Forms
stories_planned: [86-1, 86-2, 86-3, 86-4, 86-8, 86-10, 86-12]
stories_added: [86-9, 86-10, 86-11, 86-12, 86-13]
stories_done: [86-9, 86-11]
stories_superseded: [86-5, 86-6, 86-7]
---

# Epic 86 — Conversions API (CAPI) e Rastreamento Meta

## Origem

Auditoria de tracking Meta conduzida por @architect (Aria) e @analyst (Atlas) em
2026-08-04 (memória: `.claude/agent-memory/aios-architect/project_meta_capi_tracking_audit.md`).

## Achado central

O repositório `trifold-crm` **não tem Meta Pixel no browser nem Conversions API
(CAPI)**. Os eventos `PageView` (~2,4 mil) e `Lead` (~22/mês) vistos no Events
Manager (Pixel/Dataset ID `1337310707164669`, conta "TRIFOLD - VIND") são
disparados **fora deste repo** — pela landing page WordPress e pelos Instant Forms
nativos do Meta. Match quality em 3.9/10 porque nada no nosso código controla o
advanced matching.

O repo só tem **entrada** de dados Meta:
- Marketing API read-only: `packages/shared/src/meta/client.ts` (`metaFetch`, `META_BASE = graph.facebook.com/v21.0`)
- Ingestão de leadgen: `packages/web/src/lib/meta/process-lead.ts` (`META_API_BASE`, mesma versão v21)
- Webhook Meta Ads: `packages/web/src/app/api/webhooks/meta-ads/route.ts`
- CTWA (WhatsApp Click-to-Ad): `packages/web/src/app/api/webhook/whatsapp/ctwa-metadata.ts` (`buildCtwaMetadata`)

Zero chamada `/events` (CAPI) de conversão. Nenhuma captura de `fbclid`/`fbc`/`fbp`
no frontend deste repo.

## Objetivo de negócio

Enviar ao Meta dois eventos que a campanha precisa:
1. **Lead** — já entra via Instant Forms/WordPress (fora deste repo, sem mudança nesta entrega).
2. **"Visitou"** — o lead de fundo de funil, registrado no CRM quando o card é
   **movido para o stage `visitou`** no kanban (`STAGE_IDS.visitou`,
   `packages/shared/src/constants/stages.ts:11`). É o lead mais qualificado; a
   campanha precisa deste sinal para medir e (futuramente) buscar leads
   parecidos via Lookalike.

## Decisões de Produto (Travadas — não reabrir)

> Decisões tomadas pelo stakeholder (lucas@) em 2026-08-04. Stories não devem
> reabrir estes pontos.

1. **Migrar os forms/landing para o CRM.** Em vez de depender do
   WordPress/Instant Forms (sem controle de tracking), o CRM passa a ter
   landing pages/forms próprios, instrumentados com Pixel + captura de clique
   por padrão. Dá controle total do tracking. Escopo maior — story própria (86-5).
2. **Evento de conversão = standard event `Schedule`**, com
   `custom_data.content_name = "Visitou"` (rótulo interno, não nome de evento).
   NÃO usar custom event puro — `Schedule` é reconhecido nativamente pelo Meta,
   tem melhor delivery e permite Custom Conversion.
3. Avançar para stories agora (esta é a formalização do plano da auditoria).

## Arquitetura recomendada (do @architect)

- **Ponto de convergência único** para o evento Visitou: o trigger de banco
  `trg_log_lead_stage_change` (`supabase/migrations/124_stage_change_activity_trigger.sql`)
  já vê 100% das transições de `stage_id` — inclusive o `UPDATE` direto do
  client em `packages/web/src/components/pipeline/kanban-board.tsx` (chamada
  `supabase.from("leads").update({ stage_id: newStageId }).eq("id", leadId)`)
  que bypassa qualquer API route. Estender esse trigger (não substituir) para
  também enfileirar em uma nova tabela `meta_capi_outbox` quando
  `NEW.stage_id = STAGE_IDS.visitou`.
- **Cron `meta-capi-dispatch`** drena a outbox e chama a CAPI via o `metaFetch`
  existente, com retry e idempotência por `event_id` determinístico
  (`visit_<lead_id>_<outbox_row_id>`).
- Persistir dados de atribuição em `leads.metadata` (coluna JSONB da migration
  075 já existe, mesmo padrão de `buildCtwaMetadata`): shape
  `metadata.meta_ad = { fbc, fbp, fbclid, client_ip, client_ua, captured_at }`.

## Detalhes técnicos CAPI (do @analyst, best practices 2025/2026)

- Endpoint: `POST https://graph.facebook.com/v25.0/{DATASET_ID}/events?access_token={SYSTEM_USER_TOKEN}`
  (Dataset ID = Pixel ID = `1337310707164669`). `META_API_BASE`/`META_BASE` do
  repo estão em v21 — atualizar para v23+ (v25 estável em 02/2026) faz parte
  desta entrega (story 86-3), mas SOMENTE no módulo novo de CAPI — não é
  escopo tocar os módulos read-only existentes (`process-lead.ts`, `client.ts`)
  nesta entrega, salvo se a story explicitamente disser o contrário.
- Token: System User token com `ads_management`, guardado como env var —
  seguir o gotcha Vercel do `CLAUDE.md` (nunca `vercel env add` via pipe; usar
  REST API / `scripts/vercel-env-set.sh`).
- Payload do evento Visitou: `event_name:"Schedule"`, `event_time`,
  `action_source:"system_generated"`, `event_id` determinístico, `user_data`
  (em, ph, fn, ln, external_id=lead_id, fbc, fbp, client_ip_address,
  client_user_agent), `custom_data:{content_name:"Visitou", value, currency:"BRL"}`.
- Hashing: SHA-256 hex lowercase, com normalização ANTES do hash (email
  trim+lower; phone E.164 sem `+` com prefixo `55` — reusar `normalizePhoneBR`
  de `@trifold/shared`; nomes lowercase). NUNCA hashear `fbc`/`fbp`/IP/user-agent.
  Cada campo hasheado vai como array (`em: [hash]`).
- Formato `fbc`: `fb.1.{creation_time_ms}.{fbclid}`. Formato `fbp`:
  `fb.1.{creation_time_ms}.{random}`.
- Dedup: `event_id` + `event_name`, janela 48h. Para Visitou (evento
  server-side apenas) o `event_id` já serve como idempotência.
- Advanced matching no pixel do browser (das novas landings do CRM): ligar
  Automatic Advanced Matching + passar `external_id` (lead_id), `em`, `ph` no
  `fbq('init')`. `external_id` é o campo que mais sobe o EMQ.
- **Estratégia de campanha** (documentar como Dev Note/runbook, não é código):
  com ~22 leads/mês, NÃO otimizar a campanha diretamente por "Visitou" (ficaria
  em Learning Limited permanente — Meta pede ~50 conv/semana). Usar Visitou
  como (a) sinal de mensuração via Custom Conversion, (b) semente de Lookalike;
  continuar otimizando a campanha por `Lead`.

## Sequência de Execução (dependências)

```
86-1 (credenciais, @devops)
  └─▶ 86-2 (migration outbox + trigger, @data-engineer)
        └─▶ 86-3 (helper CAPI + hashing, @dev)
              └─▶ 86-4 (cron dispatcher, @dev)
                    └─▶ [P0 completo — evento Visitou fluindo]

86-4 completo
  └─▶ 86-6 (captura fbclid/fbc/fbp + persistência, @dev)
        └─▶ 86-7 (Advanced Matching no pixel, @dev) [depende também de 86-5]
  └─▶ 86-5 (landing/form próprio no CRM, @dev + @ux-design-expert) [pode iniciar em paralelo a 86-6, mas pixel do form depende do 86-7 pra AAM completo]
        └─▶ 86-8 (Custom Conversion + Lookalike + otimização, @devops — runbook manual)
```

## Stories

| ID | Título | Executor | Prioridade | Depende de |
|----|--------|----------|------------|-------------|
| 86-1 | Provisionar credenciais CAPI (System User token) | @devops | P0 | — |
| 86-2 | Migration: `meta_capi_outbox` + extensão do trigger de stage change | @data-engineer | P0 | 86-1 |
| 86-3 | Módulo CAPI server-side (payload + hashing + POST v25) | @dev | P0 | 86-2 |
| 86-4 | Cron `meta-capi-dispatch` (drena outbox, retry, idempotência) | @dev | P0 | 86-3 |
| 86-5 | Landing/form próprio no CRM com Pixel instrumentado | @dev + @ux-design-expert | P1 | 86-4 |
| 86-6 | Captura de fbclid/fbc/fbp + IP/UA na entrada do lead | @dev | P1 | 86-4 |
| 86-7 | Advanced Matching no Pixel (AAM + external_id/em/ph) | @dev | P1 | 86-5, 86-6 |
| 86-8 | Custom Conversion "Visitou" + Lookalike + ajuste de otimização | @devops (runbook manual) | P1 | 86-4, 86-7 |
| 86-9 | Pixel + eventos CAPI no formulário de qualificação (`/formulario/[token]`) | @dev | P0 | 86-3, 86-4 |
| 86-10 | Follow-up de e-mail opcional no passo de agendamento | @dev | P2 | 86-9 |
| 86-11 | Pixel + CAPI na landing do Vind Residence (`/vindresidence/`) | @dev | P1 | 86-1, 86-3 |
| 86-12 | Pixel + CAPI na landing do Yarden (`/yarden/`), landing nova sem tracking nem conteúdo — inclui o discriminador multi-landing (`resolveLandingConfig`) | @dev | P2 | 86-1, 86-3, 86-11 |
| 86-13 | Landing do Yarden: seções institucionais completas (Overview/Stats, Lazer, Galeria, Sobre a Trifold, Nav, Banda CTA), replicando a estrutura de conteúdo do Vind Residence com dados/imagens reais do Yarden — sem tocar em tracking/CAPI | @dev | P2 | 86-12 |

> **Correção de curso (registrada em 2026-08-24 pelo @po).** A tabela acima
> parou na 86-8 por um tempo e não refletia o que de fato aconteceu:
>
> - **86-5, 86-6 e 86-7 foram substituídas pela 86-9.** As três presumiam uma
>   landing nova com `POST /api/public/leads` que nunca foi construída — o
>   Epic 89 entregou, no lugar, o formulário de qualificação em
>   `/formulario/[token]`. Devem ser tratadas como `Superseded`.
> - **86-9 está implementada e em produção** (QA PASS). É ela que criou os
>   módulos hoje reusados por toda story de tracking:
>   `packages/shared/src/meta/*` (`buildCapiUserData`, `buildFormEvent`,
>   `FORM_CAPI_EVENTS`) e `packages/web/src/lib/meta/*` (`form-capi.ts`,
>   `visitor-id.ts`, `browser-attribution.ts`, `pixel-events.ts`).
> - **86-10 está reservada, ainda não redigida.**
> - **86-11 é a irmã arquitetural da 86-9**, levando o mesmo padrão para a
>   landing estática do Vind Residence — runtime standalone, fora do workspace
>   pnpm. Validada pelo @po em 2026-08-24 (GO 9.0/10) e **`Done` desde
>   2026-08-26** (QA CONCERNS aceito na iteração 2).
>
> **Atualização de 2026-08-26 (@po, na validação da 86-12).** A 86-12 leva o
> mesmo padrão para a landing nova do Yarden e é a primeira story do epic a
> tornar os módulos server-side **multi-landing** (`LANDING_CONFIGS`/
> `resolveLandingConfig` em `landing-page-tracking.ts`) — até aqui eles
> hardcodavam identificadores do Vind Residence. Depois da 86-12, qualquer
> landing nova custa apenas uma entrada no `Record` + um proxy clonado.
> Validada pelo @po em 2026-08-26 (GO 9.5/10), status `Ready`.
>
> **Atualização de 2026-08-28 (@devops, no merge da 86-12).** A 86-12 está com o
> **código mergeado em `main`** (PR #512, squash `0c2b4eb8`) mas **NÃO está
> `Done`** — e a distinção é material neste epic, não burocracia. O merge
> publica automaticamente **só** a parte `packages/web` (o discriminador
> multi-landing `LANDING_CONFIGS`/`resolveLandingConfig`), porque é o único
> pedaço da story que vive no projeto Vercel git-linkado. As outras duas partes
> são projetos Vercel **separados, sem git link, de publicação manual**: o
> projeto `yarden` **ainda não existe** (T12) e a CSP/rewrites do
> `trifold-design-system` (AC9) só valem após um `vercel deploy --prod` de
> dentro do seu diretório. Portanto `trifold.eng.br/yarden/` **não está no ar** e
> o AC13 (Test Events com `content_category: "landing_yarden"` + não-regressão do
> Vind Residence em produção) segue **não validado**. Por isso a 86-12 **não
> entrou em `stories_done`** no frontmatter: nesta convenção `Done` significa
> "verificado em produção", não "mergeado". Consequência para o epic: o
> multi-landing (`resolveLandingConfig`) já está em produção e disponível para
> stories futuras de landing, mesmo com a landing do Yarden ainda offline.
>
> **Atualização de 2026-09-02 (@devops, no merge do PR #553 da 86-12).** O
> **conteúdo e design definitivos** da landing do Yarden estão agora em `main`
> (squash `86ea676a`), substituindo o placeholder estrutural que o #512 havia
> mergeado: página completa a partir do mockup "Yarden LP v1.png", 3 formulários,
> 13 assets e os 4 links para o PDF da política de privacidade. **Nada disso muda
> o status da 86-12, que continua `InReview`, nem o `stories_done`, que segue
> `[86-9, 86-11]`** — a leitura de 2026-08-28 acima permanece **inteiramente
> válida**, porque este PR não tocou em infraestrutura: o projeto Vercel `yarden`
> **ainda não existe** (T12), a CSP/rewrites do `trifold-design-system` (AC9)
> seguem sem `vercel deploy --prod`, `trifold.eng.br/yarden/` **continua fora do
> ar** e o **AC13 segue não validado** (T13). A distinção "mergeado ≠ em
> produção" que este epic já registrava fica, se possível, mais afiada: a página
> definitiva existe no repo e não existe para nenhum visitante. Consequência
> prática para o epic: a 86-12 é hoje a única story de landing cujo código está
> integralmente em `main` sem um `Done` correspondente, e a lacuna é
> **exclusivamente de provisionamento manual de projeto Vercel**, não de
> desenvolvimento — T12/T13 são de @devops e dependem de autorização explícita do
> stakeholder, que até aqui cobriu apenas os merges.

## Decisões de Produto — adendo de 2026-08-26 (Travadas)

> Decisões tomadas pelo stakeholder (lucas@) em 2026-08-26, durante a validação
> @po da Story 86-12. Mesmo peso das travadas de 2026-08-04 acima.

4. **Uma landing nova NÃO ganha dataset/Pixel próprio.** Todas as landings do
   CRM reusam o dataset **`1337310707164669`** (conta "TRIFOLD - VIND"). A
   segmentação por empreendimento é feita por `content_category`
   (`landing_vind_residence`, `landing_yarden`, …) — que é o que permite Custom
   Conversions separadas sem multiplicar ativos no Business Manager. Stories
   futuras de landing não devem reabrir este ponto nem propor um dataset novo.
5. **Convenção de nome de projeto Vercel por landing = nome do
   empreendimento.** `vind-residence` → `vind-residence.vercel.app`;
   `yarden` → `yarden.vercel.app`. A URL pública final é
   `trifold.eng.br/{empreendimento}/` via rewrite no
   `landing-pages/trifold-design-system/vercel.json` (não a URL curta antiga do
   WordPress, ex. `/y/`).

## Fora do escopo deste epic

- Migrar o Lead Ad Form nativo do Meta para o CRM (mantido como está —
  Instant Forms continua sendo a origem do evento `Lead`).
- Descontinuar a landing page WordPress imediatamente — 86-5 cria a alternativa
  no CRM; a migração de tráfego/DNS é decisão de negócio posterior, fora do
  escopo técnico.
- Qualquer mudança nos módulos read-only existentes de Marketing API
  (`packages/shared/src/meta/client.ts`, `packages/web/src/lib/meta/process-lead.ts`)
  além do necessário para os novos módulos CAPI coexistirem (nenhuma mudança
  prevista nesta entrega).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-04 | 0.1 | Epic criado a partir da auditoria de tracking Meta (@architect Aria + @analyst Atlas). 8 stories esboçadas, sequenciadas por dependência. | @sm (River) |
| 2026-08-24 | 0.2 | Tabela de stories reconciliada com a realidade durante a validação da 86-11: acrescentadas 86-9 (implementada, em produção, QA PASS), 86-10 (reservada) e 86-11 (`Ready`), e registrado que 86-5/86-6/86-7 foram substituídas pela 86-9 — as três apontavam para uma landing (`POST /api/public/leads`) que nunca existiu. Nenhuma mudança nas Decisões de Produto travadas nem na arquitetura recomendada. | @po (Pax) |
| 2026-08-26 | 0.3 | Acrescentada 86-12 (`Draft`) — Pixel + CAPI na landing nova do Yarden (`/yarden/`), irmã arquitetural da 86-11 (Vind Residence), motivada pela constatação de que a landing WordPress antiga do Yarden (`/y/`) está 404 em produção. A 86-12 introduz um AC novo (discriminador multi-landing em `landing-page-tracking.ts`, ADAPT) porque os módulos server-side reusados da 86-11 hardcodavam identificadores "Vind Residence" — achado não previsto na auditoria original. Duas decisões de negócio deixadas abertas na story para @po validar com o usuário: dataset/Pixel ID do Yarden e a ausência de conteúdo definitivo da página. 86-10 permanece reservada e não redigida. | @sm (River) |
| 2026-08-26 | 0.4 | Validação @po da 86-12 (GO 9.5/10, `Draft` → `Ready`). Duas decisões de negócio do stakeholder promovidas a **Decisões de Produto travadas** do epic (adendo, itens 4 e 5): (4) landings novas reusam o dataset `1337310707164669` e se segmentam por `content_category`, nunca por dataset próprio; (5) convenção de nome de projeto Vercel = nome do empreendimento (`yarden` → `yarden.vercel.app`). Frontmatter reconciliado com a realidade: `stories_done: [86-9, 86-11]` (estava vazio), `stories_added: [86-9, 86-10, 86-11, 86-12]`, `stories_superseded: [86-5, 86-6, 86-7]`, e `stories_planned` deixou de listar as três substituídas. 86-11 registrada como `Done` (estava como `Ready`). | @po (Pax) |
| 2026-08-28 | 0.5 | **86-12 mergeada em `main` (PR #512, squash `0c2b4eb8`) e deliberadamente NÃO promovida a `Done`.** `stories_done` segue `[86-9, 86-11]` — nesta convenção `Done` é "verificado em produção", e o merge cobre apenas a fatia `packages/web` da story (o discriminador multi-landing `LANDING_CONFIGS`/`resolveLandingConfig`), que é a única a viver no projeto Vercel git-linkado e portanto a única que sobe sozinha. O projeto Vercel `yarden` **não existe** (T12 aberta) e a CSP/rewrites do `trifold-design-system` (AC9) exigem `vercel deploy --prod` manual — logo `trifold.eng.br/yarden/` está offline e o AC13 não foi validado (T13 aberta). Registrado no bloco de "Correção de curso" o porquê da distinção merge≠Done neste epic: as landings são **projetos Vercel separados e sem git link**, então o merge de uma story de landing nunca é evidência de que a landing está no ar — armadilha que vale para toda story futura de landing deste epic. Ganho já efetivo para o epic: o multi-landing está em produção, então a próxima landing custa uma entrada no `Record` + um proxy clonado. Nenhuma decisão de produto alterada. | @devops (Gage) |
| 2026-09-02 | 0.6 | **Conteúdo definitivo da landing do Yarden mergeado em `main` (86-12, PR #553, squash `86ea676a`, `mergedAt: 2026-09-02T12:10:16Z`) — e a 86-12 segue NÃO `Done` pela segunda vez.** `stories_done` permanece `[86-9, 86-11]`, `status` da story permanece `InReview`. O #553 substitui o placeholder estrutural que o #512 trouxe: página completa do mockup "Yarden LP v1.png", 3 formulários, 13 assets e os 4 links (3 checkboxes + rodapé) para `assets/politica-de-privacidade.pdf`, que fecha o `86.12-QA-002` **no código**. `reviewDecision: APPROVED` (CodeRabbit), 7 checks `SUCCESS`, `mergeStateStatus: CLEAN` — re-lidos imediatamente antes do merge, e a review incremental do CodeRabbit sobre o commit final (`66632608`) não trouxe achado nenhum. **Por que não é `Done`:** este PR **não provisionou infraestrutura** — o projeto Vercel `yarden` continua inexistente (T12), a CSP/rewrites do `trifold-design-system` (AC9) seguem sem `vercel deploy --prod`, `trifold.eng.br/yarden/` **está fora do ar** e o **AC13 não foi validado** (T13). A convenção do epic — `Done` = "verificado em produção", não "mergeado" — se aplica com mais força aqui do que em 2026-08-28: agora a página **definitiva** existe no repo e não existe para nenhum visitante, inclusive o PDF de política, que está versionado e não servido. T12/T13 são de @devops e aguardam autorização explícita do stakeholder (lucas@trifold.eng.br), que até aqui cobriu somente os merges. Adendo textual correspondente na seção de stories ("Atualização de 2026-09-02"); `stories_planned`/`stories_added`/`stories_superseded` inalterados. | @devops (Gage) |
| 2026-09-03 | 0.7 | Acrescentada 86-13 (`Draft`) — a pedido do usuário, expande a landing do Yarden para ter a mesma estrutura rica de seções da landing do Vind Residence (Overview/Stats, Lazer, Galeria, Sobre a Trifold, Nav, Banda CTA), com dados reais da Ficha Técnica oficial e renders reais do book do empreendimento (39 arquivos inventariados, não 41 como estimado inicialmente), preservando as 3 seções de conteúdo já existentes do Yarden e sem tocar em nenhuma parte de tracking/CAPI da 86-12 — é puramente conteúdo/layout dentro de `landing-pages/yarden/index.html`. A seção de Depoimentos ficou explicitamente fora de escopo (vídeos do Yarden ainda não hospedados no YouTube, dependência externa do usuário). 5 decisões de curadoria/conteúdo (stats do Overview, chips de amenidades do Lazer, as 9 fotos da Galeria, texto/foto de "Sobre a Trifold", profundidade do redesenho de "Localização") ficaram deliberadamente abertas na story para o @po levar ao stakeholder, não decididas autonomamente. Depende da 86-12 apenas no sentido de que constrói sobre o HTML já mergeado em `main` — não depende da 86-12 estar `Done` (T12/T13 de infraestrutura seguem sendo escopo exclusivo da 86-12). `stories_added` passou a incluir `86-13`; nenhuma decisão de produto travada foi alterada. | @sm (River) |
