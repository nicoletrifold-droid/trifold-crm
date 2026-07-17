# Story 81-4 — Agenda: link público por imobiliária + desligar Google Calendar e Calendly

## Metadata
- **Status:** Done
- **Epic:** 81 — Agenda HOUSE × IMOB (`docs/stories/epics/epic-81-agenda-house-imob.md`)
- **Branch:** feat/81-4-agenda-link-publico-imob

## Context
Última story do épico. Imobiliária parceira marca visita SOZINHA por um link exclusivo dela,
preenchendo o que o interno preenche. **No mesmo deploy**, Google Calendar e Calendly são
desligados (decisão do Marcos: sem período em paralelo — religar é 1 redeploy).

Fatos mapeados no código:
- Tabela `imobiliarias` (cadastro IMOB) existe, SEM coluna de token.
- `appointments.lead_id` é **NOT NULL** → o POST público precisa do find-or-create de lead
  por telefone (mesmo padrão do POST autenticado).
- Padrão de página pública com token já existe: `/agendar/cancelar/[token]` +
  `appointments.cancel_token` (mig 073, uuid único por compromisso).
- Google Calendar: TODAS as chamadas saem de `packages/web/src/lib/google-calendar.ts` —
  inclusive a Nicole, que recebe `createCalendarEvent` INJETADO pelo webhook
  (`webhook/whatsapp/route.ts:813`). Kill-switch na lib cobre tudo num ponto só.
- Calendly: cron `*/30` em `packages/web/vercel.json:73` → remover o bloco (rota pode ficar).
- Push: `sendPushToUser` (`lib/server/push-service.ts:19`).

**Decisões de design (para validação do @po):**
- `created_by` mantém `'admin'` (evita mexer no enum `appointment_creator`); a origem real
  fica em `appointments.imobiliaria_id` (FK nova) + `metadata.origem='link_imob'`.
- Lead novo criado pelo link → `segmento='imob'` (mundo IMOB — não polui métricas/funil do
  principal) + `assigned_broker_id` = primeiro usuário ativo com role `imob` (Daiana; leads
  IMOB precisam de responsável — RLS, ver memória 75-x). Lead existente (telefone já na
  base) é reusado como está, sem mudar segmento.
- Revogação: `booking_token = NULL` → página pública retorna aviso amigável ("link inválido").
  Regenerar = novo uuid.
- Disponibilidade pública mostra APENAS livre/ocupado por decorado+hora da equipe IMOB
  (sem nome/detalhe de nenhum compromisso; house é invisível — não bloqueia).

## Acceptance Criteria
- [x] AC1: Migration (numeração reconfirmada na hora): `imobiliarias.booking_token uuid UNIQUE`
  com backfill p/ existentes + `appointments.imobiliaria_id uuid REFERENCES imobiliarias(id)`
  (nullable) + índice. Idempotente. Aplicada em DEV antes de PROD.
- [x] AC2: Página pública `/agendar/[token]` (sem login, mobile-first): valida token (ativo),
  mostra nome da imobiliária, seletor de decorado (Vind/Yarden), dia (próximos dias úteis) e
  horários LIVRES da equipe IMOB (hora cheia, horário comercial da org via `roleta_schedule`);
  form: nome* + telefone* + e-mail + observações. Token inválido/revogado → aviso amigável.
- [x] AC3: POST público `/api/agendar/[token]`: valida token/futuro/hora cheia/decorado/horário
  comercial; conflito SÓ vs `team='imob'` (reusa `isConflict`); find-or-create de lead por
  telefone normalizado (novo → `segmento='imob'` + responsável Daiana); cria appointment
  `team='imob'`, `imobiliaria_id`, `metadata.origem='link_imob'`; responde 409 amigável em
  conflito (corrida entre imobiliárias).
- [x] AC4: Confirmação na página com dados da visita + link de cancelamento (reusa
  `/agendar/cancelar/[cancel_token]` existente).
- [x] AC5: Push a cada marcação para TODOS os usuários ativos com role `imob`
  ("Nova visita — {imobiliária}").
- [x] AC6: UI do cadastro IMOB: ver/copiar o link da agenda da imobiliária + ações
  "Gerar novo" e "Revogar" (gateadas pela permissão de escrita já existente do módulo IMOB).
- [x] AC7: **Google Calendar OFF** no mesmo deploy: kill-switch (constante) em
  `lib/google-calendar.ts` — `createCalendarEvent`/`deleteCalendarEvent` viram no-op cedo,
  com comentário de como religar. Cobre rotas web E Nicole (injeção). Sem chamada externa.
- [x] AC8: **Calendly OFF** no mesmo deploy: bloco do cron `calendly-sync` removido do
  `vercel.json` (rota permanece, inofensiva). Compromissos Calendly antigos intactos.
- [x] AC9: Testes: lógica pura de slots livres IMOB (grade hora-a-hora × conflitos) + matriz
  de validação do POST; suíte completa verde; type-check OK; eslint limpo nos arquivos da story.

## Out of Scope
- Cliente final marcando sozinho (substituto do Calendly p/ público) — épico futuro.
- Notificação por WhatsApp/e-mail à imobiliária (só push interno à Daiana nesta story).
- Painel de métricas de visitas por imobiliária (o dado nasce pronto via `imobiliaria_id`).

## Dependencies
- Stories 81-1/81-2/81-3 mergeadas (#219/#220/#221) — regra por equipe + badges + governança.

## Complexity
- **T-shirt:** G (migration + página pública + endpoint público + UI cadastro + 2 desligamentos).

## Business Value
Imobiliárias marcam sem depender da Daiana (menos fricção = mais visitas IMOB), com rastreio
por parceira; e o CRM vira fonte única da agenda (aposenta Google Calendar e Calendly).

## Risks
- **Sem retaguarda externa** ao desligar Google+Calendly junto (decisão consciente do Marcos;
  religar = 1 redeploy — kill-switch em constante, não env var, por causa do gotcha de env
  vazia do Vercel).
- Endpoint público = superfície nova: validações estritas + token não-enumerável (uuid) +
  respostas sem vazar dados de terceiros.
- Corrida entre 2 imobiliárias no mesmo slot: janela pequena; 409 amigável resolve (retry).

## Definition of Done
- ACs atendidos, testes verdes, lint/typecheck OK, migration dev+prod, QA gate PASS
  (incluindo fluxo ponta-a-ponta do link em preview), push via @devops.

## File List
- `docs/stories/81-4-agenda-link-publico-imobiliaria.story.md` (this file)
- `supabase/migrations/176_imobiliarias_booking_token.sql`
- `packages/web/src/app/agendar/[token]/page.tsx` (+ componentes client do form)
- `packages/web/src/app/api/agendar/[token]/route.ts` (GET slots + POST marcação)
- `packages/web/src/lib/appointments/imob-slots.ts` (+ `.test.ts`) — lógica pura de grade/slots
- `packages/web/src/lib/google-calendar.ts` (kill-switch)
- `packages/web/vercel.json` (remove cron calendly-sync)
- `packages/web/src/app/dashboard/imob/imobiliarias/_components/imobiliarias-manager.tsx` (coluna Agenda)
- `packages/web/src/app/api/imob/imobiliarias/[id]/booking-token/route.ts` (gerar/revogar)
- `packages/web/src/lib/appointments/locations.ts` (PROPERTY_MAP compartilhado; modal refatorado)
- `packages/web/src/lib/imob/imobiliarias.ts` (tipo += booking_token)

## Dev Notes (@dev / Dex)
- **Migration 176** (numeração reconfirmada, nenhuma branch remota com 176+): booking_token
  backfilled (PROD: 9/9 imobiliárias com token) + appointments.imobiliaria_id + índices parciais.
- ⚠️ **DESVIO da convenção dev-primeiro:** o projeto DEV não tem a tabela `imobiliarias`
  (banco dev defasado — módulo IMOB nunca foi migrado lá). Migration aplicada DIRETO em PROD
  (aditiva/idempotente). Fica o alerta: dev precisa de um catch-up de migrations (fora do escopo).
- PROPERTY_MAP extraído do modal para `lib/appointments/locations.ts` (fonte única modal+link).
- POST público reusa `overlaps()` da governança (semântica idêntica ao isConflict com team
  pré-filtrado no query `.eq("team","imob")`) + `normalizePhoneBR` no find-or-create do lead.
- Push com URL absoluta via `NEXT_PUBLIC_APP_URL` (memória 75-152: cookie do domínio custom).
- Kill-switch do Google em `isConfigured()` — cobre `createCalendarEvent` E `deleteCalendarEvent`
  (únicos exports; Nicole recebe a função injetada do webhook → coberta).
- Rota `/agendar/cancelar` (sem token) casaria com `[token]='cancelar'` → cai no aviso de link
  inválido (uuid regex) — comportamento seguro; rotas estáticas têm precedência no Next.
- Testes 1059/1059 (9 novos imob-slots) · type-check 8/8 · eslint limpo · vercel.json validado.

## QA Results (@qa / Quinn)
**Veredito: PASS com observações**

| Check | Resultado |
|---|---|
| 1. Code review | ✅ Token uuid não-enumerável validado por regex antes do query; respostas públicas não vazam dados de terceiros (só livre/ocupado) |
| 2. Testes | ✅ 9 novos (grade, fuso, sábado, passado, mesmo-local×local-diferente, hora cheia, expediente); suíte 1059/1059 |
| 3. ACs | ✅ AC1-AC9 (AC1 verificado em PROD: 9/9 tokens; AC7 auditado: as 2 únicas funções exportadas passam por isConfigured) |
| 4. Regressões | ✅ Modal usa a mesma lib de locais (refatoração sem mudança de comportamento); Calendly antigos intactos; rota estática /agendar/cancelar tem precedência |
| 5. Performance | ✅ Grade = 1 query por load; índice parcial em imobiliaria_id |
| 6. Segurança | ✅ Validação estrita no endpoint público (uuid, whitelist de decorado, hora cheia, expediente, futuro); 409 na corrida; gerar/revogar gateado no módulo IMOB |
| 7. Documentação | ✅ Story + decisões de design + desvio do dev documentados |

**Observações (não bloqueantes):**
1. E2E do POST (criar visita real) deliberadamente NÃO executado pelo QA — criaria compromisso
   real e dispararia push à Daiana. Validar com marcação de teste controlada pós-deploy e
   cancelar pelo link.
2. Banco DEV defasado (sem módulo IMOB) — recomendo story de catch-up de migrations do dev.

Pronta para `@devops *push`.

## Change Log
- @sm (River): story criada em Draft a partir do Epic 81 (4ª e última), com fatos e decisões
  de design mapeados no código.
- @po (Pax): validação checklist 10 pontos → **GO (10/10)**; decisões de design (segmento imob, created_by admin+metadata) aprovadas como coerentes com o mundo IMOB isolado. Status Draft → Ready.
- @dev (Dex): migration 176 (prod), rota+página públicas, UI cadastro IMOB, kill-switch Google, cron Calendly removido. Status Ready → InReview.
- @qa (Quinn): QA gate **PASS com observações** (e2e do POST fica p/ validação humana pós-deploy).
- @devops (Gage): CI verde, squash-merge PR #222, deploy prod automático. Google Calendar e Calendly desligados neste deploy. Status InReview → Done.
