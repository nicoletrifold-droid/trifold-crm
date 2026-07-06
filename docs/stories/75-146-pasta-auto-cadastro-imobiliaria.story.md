# Story 75-146 — Auto-cadastro de Pasta pela imobiliária (link público de CRIAÇÃO)

## Metadata
- **Status:** Ready for Review · **Epic:** Pastas · **PR:** — · **Complexidade:** L (8 pontos) · **Branch:** feat/75-146-pasta-auto-cadastro-imobiliaria
- **executor:** @dev · **quality_gate:** @qa · **design:** @ux-design-expert
- **MIGRATION:** ✅ SIM (migration `161` — nova tabela `pasta_links` + colunas `pastas.origem`/`pastas.link_id`). Aplicar MANUALMENTE em prod (SQL Editor ou Management API com PAT — projeto sem CI/CLI).

## Contexto
Hoje o link público do módulo Pastas (`/pasta/[token]`) só permite ao interessado **fazer UPLOAD** de documentos numa pasta que um usuário logado já criou. Criar pasta exige login (`requireAuth` + `isPastaManager`) — ver `src/app/api/pastas/route.ts`. O diretor quer um **link público de CRIAÇÃO**, um **por imobiliária parceira**, para que a imobiliária rode o wizard, cadastre o comprador e anexe documentos **sem** o diretor precisar criar um usuário do sistema para cada imobiliária. Ver [[project-pastas-documentos]].

Decisões de produto já tomadas (diretor, 2026-07-06) — tratar como requisitos fixos:
1. **Um link POR imobiliária** (NÃO um link universal). Gera-se um link por parceira; o nome da imobiliária vem **pré-preenchido e TRAVADO** no wizard público. Rastreável (saber qual imobiliária criou cada pasta) e **revogável** (desativar um link específico).
2. Pastas criadas pelo link público são **sinalizadas** como "auto-cadastro (imobiliária)" **E** disparam **notificação ao gestor** na criação (reusar `lib/email.ts` / `lib/notificacoes.ts`).
3. **Wizard completo** — o formulário público mostra as MESMAS 3 telas do wizard interno, INCLUINDO o toggle PIX e a preferência de Fluxo de pagamento.

## Contexto técnico (verificado no código)
- **Criação interna:** `src/app/api/pastas/route.ts` (POST) → `requireAuth`+`isPastaManager`; deriva `org_id`/`created_by` do usuário logado; insere em `pastas`; semeia `pasta_documentos` via `buildDocSlots(tipo, casado, temPix, uniaoEstavel)` de `lib/pastas/checklist.ts`; gera `token` (`randomBytes(24).hex`); retorna `{ id, token, docs }`. Rollback manual da pasta se o insert de docs falhar. **NB:** não usar `.order()` no retorno de INSERT (gotcha PostgREST — [[feedback-postgrest-order-insert]]).
- **Wizard interno (UI):** `src/app/dashboard/pastas/_components/pastas-manager.tsx` — componente `CreateModal` = stepper 3 telas (Tela 1 corretor/origem + imobiliária + empreendimento + fluxo_pagamento + PIX; Tela 2 comprador PF/PJ + casado/união estável + contatos; Tela 3 docs — anexa inline + copia link). A pasta é criada ao avançar da Tela 2.
- **Padrão público existente:** `src/app/pasta/[token]/page.tsx` (Server, `createAdminClient()` service role, valida token via `.eq("token", token)`) + `_components/pasta-public.tsx` + `api/pasta/[token]/route.ts` (PATCH form_data) + `api/pasta/[token]/upload/route.ts` (POST, `MAX_SIZE_BYTES = 25MB`, accept pdf/imagens). Sem auth; service role ignora RLS.
- **Schema `pastas` (mig 139 + 158 + 159 + 160):** já tem `nome, tipo, casado, uniao_estavel, empreendimento, tem_pix, fluxo_pagamento, corretor_nome/telefone/email, imobiliaria, interessado_telefone/email, token, status, form_data, created_by (FK users, nullable), org_id`. RLS: `pastas_org_rw` / `pasta_documentos_org_rw` org-scoped p/ `authenticated`; público passa por service role.
- **Roles:** `lib/pastas/roles.ts` → `isPastaManager` = admin/supervisor/gerente-comercial/imob.
- **Prod single-org:** `org_id = 00000000-0000-0000-0000-000000000001`; org resolvida a partir do registro do link.
- **Helpers de envio:** `lib/email.ts` → `sendEmail({ to, subject, html, orgId? })`; `lib/notificacoes.ts` (foco em clientes/portal). `lib/whatsapp/send-whatsapp-message.ts` → `sendWhatsAppMessage(...)` (exige `whatsapp_config` da org).

## Escopo
**IN:**
1. **Migration `161_pasta_links.sql`:**
   - Tabela `pasta_links`: `id uuid pk default gen_random_uuid()`, `org_id uuid not null references organizations(id) on delete cascade`, `imobiliaria text not null`, `token text not null unique`, `ativo boolean not null default true`, `corretor_nome text`, `corretor_telefone text`, `corretor_email text` (defaults opcionais de corretor, todos nullable), `created_by uuid references users(id)`, `created_at timestamptz not null default now()`. Índices: `idx_pasta_links_org (org_id)`, `idx_pasta_links_token (token)`.
   - RLS org-scoped espelhando `pastas` (policy `pasta_links_org_rw` `for all to authenticated` com `using/with check org_id in (select u.org_id from public.users u where u.auth_id = auth.uid())`). Público NÃO usa a policy (service role).
   - Colunas em `pastas`: `origem text not null default 'interno' check (origem in ('interno','auto_cadastro'))` e `link_id uuid references pasta_links(id) on delete set null`. Nullable/default → pastas existentes seguem válidas sem backfill.
2. **Extrair wizard reutilizável:** refatorar `CreateModal` de `pastas-manager.tsx` para um componente compartilhado que aceite **modo público** (imobiliária travada/pré-preenchida, `submitUrl` parametrizável, sem depender de `router`/`fetch("/api/pastas")` hardcoded) SEM regredir o fluxo interno. As 3 telas idênticas (Tela 1 com PIX + fluxo; Tela 2 PF/PJ+casado/união; Tela 3 docs inline + copiar link).
3. **Página pública de criação** `src/app/pasta/nova/[token]/page.tsx` (Server, `createAdminClient()`): resolve o link por `token` **e** `ativo = true`; se inexistente/inativo → tela "Link inválido ou desativado". Renderiza o wizard em modo público com **imobiliária travada** (do registro) e defaults de corretor do link (editáveis). Client component em `_components/pasta-nova-public.tsx`.
4. **Endpoint público de criação** `src/app/api/pasta/nova/[token]/route.ts` (POST, `createAdminClient()`, SEM auth): valida link `ativo`; resolve `org_id` do link; espelha a lógica de insert+seed do `/api/pastas` (mesma sanitização `optStr`, `buildDocSlots`, rollback manual) **porém** `created_by = null`, `imobiliaria` = a do link (ignora o body), `origem = 'auto_cadastro'`, `link_id`. Retorna `{ id, token, docs }` (token da pasta criada). O front redireciona para `/pasta/[token]` (UI de upload existente).
5. **Notificação na criação (e-mail + WhatsApp):** ao criar via link público, notificar os gestores de Pastas (ver [AUTO-DECISION #1]) por **dois canais**, ambos best-effort e **não bloqueantes**:
   - **E-mail** (`sendEmail`): para cada gestor com e-mail cadastrado — assunto/corpo com nome do comprador, imobiliária e link direto `/dashboard/pastas/[id]`. `orgId` = a do link.
   - **WhatsApp** (mensagem PROATIVA ao gestor → **exige template HSM aprovado**): para cada gestor com telefone, disparar o template **`nova_pasta_gestor`** (pt_BR) espelhando EXATAMENTE o padrão de `sendBoletoWhatsApp` em `lib/notificacoes.ts` — resolve `whatsapp_config` (`phone_number_id`/`access_token`) da org, `fetch` Graph API `type:"template"`. **Dependência externa:** o template `nova_pasta_gestor` está sendo submetido à Meta em paralelo e hoje estará **PENDING**; enquanto não aprovado, a Graph API falha e o envio de WhatsApp **cai no `.catch` (log via `logWhatsappSend`), SEM derrubar a criação da pasta nem impedir o e-mail** (mesma degradação graciosa já usada nos templates de boleto `boleto_vence_hoje`/`boleto_em_atraso`, hoje PENDING).
   - Toda a notificação (ambos canais) roda em `try/catch`/`.catch` independente: **qualquer falha só é logada** — a pasta persiste (AC 4).
6. **Gestão dos links no dashboard** (`dashboard/pastas`, gate `isPastaManager`): seção "Links de auto-cadastro (imobiliárias)" — gerar link por imobiliária (input nome + opcionais de corretor), listar (imobiliária, status ativo/revogado, copiar URL `/pasta/nova/[token]`), **revogar** (toggle `ativo=false`) e reativar. Endpoints internos: `POST /api/pasta-links` (cria, gera token, `isPastaManager`), `PATCH /api/pasta-links/[id]` (ativo true/false), `GET` via server component da página.
7. **Selo de origem na listagem:** na linha da pasta (`MetaLine`/`StatusPill` em `pastas-manager.tsx`), badge "Auto-cadastro · {imobiliária}" quando `origem = 'auto_cadastro'`. Requer incluir `origem` nas rows de `page.tsx`.

**OUT:**
- Perfil revisor dedicado (segue futuro — [[project-pastas-documentos]]).
- CAPTCHA/rate-limit avançado (mitigação = token por imobiliária revogável + limite de 25MB já existente no upload). Anotar como follow-up se houver abuso real.
- Multi-org: prod é single-org; org sempre resolvida do link. Não gerar UI de seleção de org.
- **Submissão/aprovação do template `nova_pasta_gestor` na Meta** — é feita FORA desta story (em paralelo pelo diretor/@devops via Meta Business). Esta story só CONSOME o template; se PENDING, o envio degrada graciosamente. Não bloquear a entrega esperando a aprovação.
- Pré-preencher signatário Clicksign a partir do auto-cadastro (fora de escopo).

## Acceptance Criteria
1. **Given** um gestor de Pastas em `dashboard/pastas`, **when** gera um link para a imobiliária "X", **then** um registro em `pasta_links` é criado com `imobiliaria='X'`, `token` único e `ativo=true`, e o gestor consegue copiar a URL `/pasta/nova/{token}`.
2. **Given** a URL pública `/pasta/nova/{token}` de um link **ativo**, **when** alguém a abre, **then** vê o wizard completo (3 telas, incluindo PIX e Fluxo de pagamento) com o campo Imobiliária **pré-preenchido com "X" e travado** (não editável). **Given** o link está **revogado** (`ativo=false`) ou o token não existe, **then** vê "Link inválido ou desativado" e não consegue criar.
3. **Given** o wizard público preenchido, **when** submete, **then** uma pasta é criada com `origem='auto_cadastro'`, `imobiliaria` = a do link (mesmo que o body tente outra), `link_id` = o link, `created_by=null`, `org_id` = a do link; os `pasta_documentos` são semeados exatamente como no fluxo interno (`buildDocSlots` respeitando PF/PJ, casado/união estável e PIX); e o usuário é redirecionado para `/pasta/{tokenDaPasta}` (UI de upload existente).
4. **Given** uma pasta criada via link público, **then** os gestores de Pastas com e-mail cadastrado recebem uma **notificação por e-mail** contendo comprador, imobiliária e link para `/dashboard/pastas/{id}`, **and** os gestores com telefone recebem uma **notificação por WhatsApp** via template HSM `nova_pasta_gestor` (padrão `sendBoletoWhatsApp`); **and** uma falha em **qualquer** canal (incl. template WhatsApp ainda **PENDING** na Meta → Graph API falha) **não** impede a criação da pasta nem o outro canal — a pasta persiste e o erro é só logado (`.catch`/`logWhatsappSend`).
5. **Given** a listagem de pastas no dashboard, **then** pastas com `origem='auto_cadastro'` exibem badge "Auto-cadastro · {imobiliária}"; pastas internas (`origem='interno'`) não exibem o badge.
6. **Não quebrar o que funciona:** o wizard interno (`CreateModal`) e `POST /api/pastas` continuam idênticos em comportamento (imobiliária editável, `created_by` = usuário, `origem='interno'` por default). O endpoint público **não** exige auth e valida o token/`ativo` sozinho (service role). RLS de `pasta_links` bloqueia leitura cross-org por usuários autenticados.
7. **Migration `161`** aplicada manualmente em prod (documentar no Change Log); colunas nullable/default garantem que pastas e fluxo interno pré-existentes seguem válidos sem backfill. `tsc`/`eslint`/`vitest` limpos; tema light/dark ok no dashboard (a página pública `/pasta/*` segue o padrão claro existente).

## Tasks (@dev)
- [x] **Migration** `supabase/migrations/161_pasta_links.sql`: tabela `pasta_links` (+índices +RLS org-scoped) + `pastas.origem` (check interno/auto_cadastro, default interno) + `pastas.link_id` (FK set null). (AC: 1,3,5,6,7)
- [x] **Refatorar** `CreateModal` → wizard compartilhado com prop de modo (interno/público): imobiliária travável, `submitUrl`/callback de submit parametrizáveis, sem regredir o interno. (AC: 2,6)
- [x] `src/app/pasta/nova/[token]/page.tsx` + `_components/pasta-nova-public.tsx`: resolve link ativo (service role), wizard público imobiliária travada, redireciona p/ `/pasta/[token]` no sucesso. (AC: 2,3)
- [x] `src/app/api/pasta/nova/[token]/route.ts` (POST, service role, sem auth): valida link ativo → insert+seed espelhando `/api/pastas` com `created_by=null`, `imobiliaria` do link, `origem='auto_cadastro'`, `link_id`; rollback manual; retorna `{id, token, docs}`. (AC: 3,6)
- [x] Notificação aos gestores na criação via link — **e-mail** (`sendEmail`, gestores com e-mail) **+ WhatsApp** (template `nova_pasta_gestor`, gestores com telefone, espelhando `sendBoletoWhatsApp`: resolve `whatsapp_config`, `type:"template"`). Ambos best-effort/`.catch`, não bloqueantes; template PENDING → falha graciosa logada. (AC: 4)
- [x] `src/app/api/pasta-links/route.ts` (POST cria link, `isPastaManager`) + `src/app/api/pasta-links/[id]/route.ts` (PATCH ativo). (AC: 1)
- [x] `dashboard/pastas/page.tsx` + `pastas-manager.tsx`: seção de links (gerar/listar/copiar/revogar/reativar) + badge "Auto-cadastro · {imobiliária}"; incluir `origem` nas rows. (AC: 1,5)
- [x] Testes: `lib`/route seguindo padrões (`lib/pastas/*.test.ts`) — POST público (origem/link_id/created_by/imobiliária-do-link, token inexistente/revogado, body ignorado, rollback), gate de gestor no link create, não-regressão do interno, fallback gracioso da notificação. tsc/eslint/vitest limpos. (AC: 3,6,7)

## Dev Agent Record

### Agent Model Used
Opus 4.8 (1M context) — @dev (Dex)

### File List
**Novos:**
- `supabase/migrations/161_pasta_links.sql` — tabela `pasta_links` (+índices +RLS `pasta_links_org_rw`) + `pastas.origem` + `pastas.link_id`. NÃO aplicada em prod (aplicar manualmente).
- `packages/web/src/components/pastas/pasta-wizard.tsx` — wizard 3 telas compartilhado (modo interno/público).
- `packages/web/src/app/pasta/nova/[token]/page.tsx` — página pública (server) que resolve o link ativo.
- `packages/web/src/app/pasta/nova/[token]/_components/pasta-nova-public.tsx` — client wrapper (tema claro) + redirect p/ `/pasta/[token]`.
- `packages/web/src/app/api/pasta/nova/[token]/route.ts` — POST público (service role, sem auth).
- `packages/web/src/app/api/pasta-links/route.ts` — POST cria link (gate `isPastaManager`).
- `packages/web/src/app/api/pasta-links/[id]/route.ts` — PATCH revoga/reativa (gate + org-scoped).
- `packages/web/src/app/api/pasta/nova/[token]/route.test.ts`
- `packages/web/src/app/api/pasta-links/route.test.ts`
- `packages/web/src/app/api/pastas/route.test.ts`
- `packages/web/src/lib/notificacoes.nova-pasta.test.ts`

**Modificados:**
- `packages/web/src/app/dashboard/pastas/_components/pastas-manager.tsx` — usa o wizard compartilhado; `LinksSection` (gerar/listar/copiar/revogar/reativar); `OrigemPill` (selo auto-cadastro); `origem` na row.
- `packages/web/src/app/dashboard/pastas/page.tsx` — busca `pasta_links` + `origem`; passa `links` ao manager.
- `packages/web/src/lib/notificacoes.ts` — `notifyNovaPastaGestor` (e-mail + WhatsApp template `nova_pasta_gestor`), fire-and-forget.

### Completion Notes
- Wizard extraído sem regressão do fluxo interno: modo `internal` mantém imobiliária editável, `created_by`=usuário, Tela 3 inline; `origem`='interno' vem do default do banco (POST /api/pastas inalterado — teste de não-regressão adicionado). Modo `public` trava a imobiliária, pré-preenche corretor (editável) e redireciona p/ `/pasta/[token]` no sucesso.
- POST público espelha `/api/pastas` (mesma `optStr`/`buildDocSlots`/rollback), mas resolve `org_id`/`imobiliaria` do link, ignora imobiliária do body, seta `origem='auto_cadastro'`/`link_id`/`created_by=null`. Token inexistente OU `ativo=false` → 404 limpo.
- Notificação aos gestores (`PASTA_MANAGER_ROLES`, ativos) por e-mail + WhatsApp (template `nova_pasta_gestor`, PENDING na Meta), toda em `.catch` fire-and-forget — não bloqueia a criação. NÃO gateada por `PORTAL_NOTIF_PAUSED` (kill switch é só do portal do cliente; esta é notificação interna de equipe).
- Tema: página pública em tema claro (`bg-stone-50`), consistente com `/pasta/[token]`. O wizard mantém variantes `dark:` (inócuas na página pública, que não aplica `.dark`).
- **[AUTO-DECISION] URL base do dashboard na notificação** → `https://crm.trifold.eng.br` hardcoded (mesma base do botão do template WhatsApp; `NEXT_PUBLIC_APP_URL` aponta p/ o portal do cliente, não p/ o CRM).
- Verificação: `pnpm --filter @trifold/web type-check` OK; eslint nos arquivos alterados OK; `pnpm test` (vitest) — 76 arquivos / 829 testes PASS (inclui 12 novos).
- **Migration 161 NÃO aplicada em prod** (aguarda aplicação manual deliberada via Supabase MCP/SQL Editor).

## Riscos
- **Médio.** Novo endpoint **público sem auth** que ESCREVE no banco → mitigação: token aleatório por imobiliária, revogável (`ativo`), validação server-side do token, e limite de 25MB já existente no upload. Espelhar exatamente a sanitização (`optStr`, slice) do `/api/pastas`.
- **Refactor do wizard** (670 linhas em `pastas-manager.tsx`) tem raio de impacto no fluxo interno — testar o caminho interno REAL (criar pasta logado) além do público. [[feedback-nao-quebrar-o-que-funciona]].
- **Migration manual** (sem CI/CLI): numeração `161` verificada (última aplicada = 160). Atenção ao gotcha histórico 074/075 (não afeta este range). Aplicar via SQL Editor/Management API com PAT e registrar no Change Log.
- Gotcha PostgREST: não usar `.order()` no retorno do INSERT ([[feedback-postgrest-order-insert]]).
- Colisão de rotas: `/pasta/nova/[token]` (2 segmentos) NÃO colide com `/pasta/[token]` (1 segmento); idem `/api/pasta/nova/[token]` vs `/api/pasta/[token]`. `/pasta/nova` sem token cairia em `/pasta/[token]` com token="nova" → "Link inválido" (inócuo).

## Decisões (RESOLVIDAS pelo diretor 2026-07-06 — @po validou)
- **[DECISION #1 ✅ CONFIRMADA] Destinatário da notificação** → **gestores de Pastas da org** = usuários com role em `PASTA_MANAGER_ROLES` (admin/supervisor/gerente-comercial/imob). E-mail para quem tem e-mail cadastrado; WhatsApp para quem tem telefone. (Diretor confirmou: notificar os gestores de Pastas, sem hardcode de e-mail/lista dedicada.)
- **[DECISION #2 ✅ RESOLVIDA — diretor] Canais da notificação** → **e-mail + WhatsApp (ambos)**. E-mail via `sendEmail`. WhatsApp = mensagem PROATIVA ao gestor, portanto **exige template HSM aprovado**: novo template **`nova_pasta_gestor`** submetido à Meta em paralelo (hoje **PENDING**). O envio de WhatsApp espelha o padrão `sendBoletoWhatsApp`/`type:"template"` com **fallback gracioso** — se o template não estiver aprovado, a chamada falha silenciosamente (log via `.catch`/`logWhatsappSend`) e **NÃO** bloqueia a criação da pasta; o e-mail ainda é enviado. Aprovação Meta = dependência EXTERNA (fora do escopo desta story). (Substitui a decisão-@sm anterior de "só e-mail / WhatsApp follow-up".)
- **[DECISION #3 ✅ CONFIRMADA] Corretor é EDITÁVEL** → o `pasta_links` guarda `corretor_nome/telefone/email` **opcionais** que pré-preenchem (editáveis) a Tela 1 do wizard público; **só a imobiliária fica travada** a partir do link. (Diretor confirmou: travar apenas a imobiliária; corretor editável no wizard público.)
- **[DECISION #4 ✅ CONFIRMADA] URL pública** → `/pasta/nova/[token]` (espelha `/pasta/[token]`). Verificado sem colisão de rota: `/pasta/nova/[token]` (2 segmentos) ≠ `/pasta/[token]` (1 segmento); idem em `/api/`. (Confirmado no código: só existem `src/app/pasta/[token]/` e `src/app/api/pasta/[token]/`.)

## Change Log
- 2026-07-06 — @sm — Story criada (Draft). Migration 161 planejada (tabela `pasta_links` + `pastas.origem`/`link_id`), a aplicar manualmente em prod.
- 2026-07-06 — @dev (Dex) — `*develop`: implementado. Migration 161 criada (NÃO aplicada em prod). Wizard extraído p/ `components/pastas/pasta-wizard.tsx` (interno/público) sem regressão; página+POST públicos `/pasta/nova/[token]`; `notifyNovaPastaGestor` (e-mail+WhatsApp `nova_pasta_gestor`, fire-and-forget); API `pasta-links` (POST/PATCH, gate gestor); UI de links + selo auto-cadastro. tsc/eslint OK; vitest 829/829 (12 novos). Branch `feat/75-146-pasta-auto-cadastro`. **Status Ready → Ready for Review.**
- 2026-07-06 — @po (Pax) — `*validate-next-story`: **GO** (score 9/10). Decisões #1–#4 do diretor incorporadas. Ajuste principal (DECISION #2): notificação passa de "só e-mail" para **e-mail + WhatsApp** com fallback gracioso (template HSM `nova_pasta_gestor` PENDING na Meta; aprovação = dependência externa). Verificados no código: migration 161 livre (última = 160), sem colisão de rota `/pasta/nova/[token]`, padrão `sendBoletoWhatsApp` (`type:"template"` + `.catch`) e `sendEmail({to,subject,html,orgId})`, `PASTA_MANAGER_ROLES`, `optStr`/`buildDocSlots` no `/api/pastas`. Editados: Escopo IN #5, Escopo OUT, AC 4, Task de notificação, bloco de Decisões. **Status Draft → Ready.**
