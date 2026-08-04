# Story 86-1 — Provisionar credenciais do Meta Conversions API (System User token)

**Status:** Ready
**Epic:** 86 — Conversions API (CAPI) e Rastreamento Meta
**Executor:** @devops (Gage)
**Prioridade:** P0 (bloqueador — pré-requisito de todas as demais stories do epic)
**Depende de:** —

## Contexto

O repositório não possui hoje nenhuma credencial para chamar o Meta Conversions
API (CAPI). Todas as chamadas existentes ao Graph API (`packages/shared/src/meta/client.ts`,
`packages/web/src/lib/meta/process-lead.ts`) usam tokens de **leitura** da
Marketing API (ads_read), obtidos via OAuth de usuário (Story 51-4). CAPI exige
um token de **escrita de eventos**, tipicamente um **System User token** de longa
duração com o escopo `ads_management` (ou `business_management` +
`ads_management`), gerado no Business Manager (Meta Business Suite) para o
Dataset/Pixel ID `1337310707164669` ("TRIFOLD - VIND").

Esta story é puramente de provisionamento de infraestrutura — não escreve
código de aplicação. É o pré-requisito de 86-2/86-3/86-4.

## Acceptance Criteria

1. **AC1 — System User criado no Business Manager.** Um System User (ou
   reaproveitamento de um já existente com o escopo correto, documentado)
   existe no Business Manager associado ao Pixel/Dataset `1337310707164669`,
   com permissão `ads_management` no dataset (não apenas leitura).
2. **AC2 — Token de longa duração gerado.** Um token de acesso do System User
   é gerado com validade longa (idealmente sem expiração — tokens de System
   User no Meta não expiram por padrão, diferente de tokens de usuário). O
   token é copiado para um local seguro temporário (gerenciador de senhas ou
   arquivo local fora do git) antes de ser configurado como env var.
3. **AC3 — Env vars configuradas em produção via REST API (não pipe).**
   Duas variáveis de ambiente novas são criadas no projeto Vercel de produção
   (`trifold-crm.vercel.app`) seguindo o gotcha do `CLAUDE.md`
   (`scripts/vercel-env-set.sh` ou `POST /v10/projects/{id}/env` diretamente —
   **nunca** `vercel env add` via stdin/pipe):
   - `META_CAPI_ACCESS_TOKEN` — o token do System User (tipo `encrypted`).
   - `META_CAPI_DATASET_ID` — `1337310707164669` (pode ser `encrypted` ou
     variável simples; não é secreto per se, mas mantém paridade com o outro
     valor).
4. **AC4 — Env vars replicadas em dev, se aplicável.** Se houver um ambiente
   de teste/dev para o CAPI (recomendado: usar o **Test Events** do Meta Events
   Manager, que aceita um `test_event_code` sem custo e sem afetar métricas de
   produção), documentar o `test_event_code` correspondente e, se necessário,
   configurar `META_CAPI_TEST_EVENT_CODE` em `packages/web/.env.development`
   (não versionado) ou como env var Vercel Preview.
5. **AC5 — Redeploy executado.** Após criar/atualizar as env vars, um
   `vercel redeploy` (ou deploy equivalente) é executado — env vars só valem
   após redeploy, conforme gotcha já documentado.
6. **AC6 — Validação de sanidade sem código de produção.** Um teste manual via
   `curl` confirma que o token funciona antes de qualquer story de código ser
   iniciada: uma chamada de teste ao endpoint CAPI (usando
   `test_event_code`, evento `event_name: "Schedule"` de exemplo com
   `test_event_code`) retorna sucesso (`{"events_received": 1, ...}`), validável
   no painel "Test Events" do Events Manager.
7. **AC7 — Documentação da credencial.** As env vars criadas, seus nomes
   exatos, e o processo de rotação (caso o token precise ser regenerado) são
   documentados em memória de agente (`@devops`) ou runbook — não em código,
   não em texto plano no repositório.

## Tasks

- [ ] **T1 (AC1)** — No Business Manager, confirmar/criar System User com
  acesso `ads_management` ao Dataset `1337310707164669`. Se já existir um
  System User usado pela integração OAuth existente (Story 51-4), avaliar
  reuso vs. criação de um dedicado para CAPI — documentar a decisão.
- [ ] **T2 (AC2)** — Gerar token de longa duração do System User com o escopo
  necessário.
- [ ] **T3 (AC3, AC5)** — Configurar `META_CAPI_ACCESS_TOKEN` e
  `META_CAPI_DATASET_ID` via REST API Vercel (produção) usando
  `scripts/vercel-env-set.sh` ou chamada direta documentada no gotcha do
  `CLAUDE.md`. Executar `vercel redeploy` após configurar.
- [ ] **T4 (AC4)** — Obter `test_event_code` do Events Manager (aba "Test
  Events" do Dataset `1337310707164669`) e configurar como env var de
  dev/preview.
- [ ] **T5 (AC6)** — Validar com `curl` manual (não versionar o comando com o
  token em claro — usar variável de shell local) que o evento de teste chega
  ao Test Events do Meta.
- [ ] **T6 (AC7)** — Registrar em memória `@devops` (`reference_meta_capi_credentials.md`
  ou similar): nomes das env vars, onde estão configuradas (prod/preview),
  processo de rotação, e o `test_event_code` (não o token em si).

## Dev Notes

### Por que System User e não token de usuário
Tokens de usuário expiram (60 dias mesmo os de longa duração) e ficam
vinculados à conta pessoal de quem gerou. CAPI é uma integração
servidor-a-servidor que roda indefinidamente via cron (stories 86-3/86-4);
precisa de um token que não dependa de um humano re-autenticar periodicamente.
System User tokens do Meta Business Manager não expiram por padrão — é o
padrão recomendado pela documentação oficial do Meta para CAPI.

### Sem sobreposição com o token OAuth existente
O projeto já tem uma integração OAuth de usuário para a Marketing API
read-only (Story 51-4, `google_ads_oauth` — nome da story sugere Google Ads,
mas confirmar se há equivalente Meta). Este token CAPI é conceitualmente
separado: **escrita de eventos de conversão**, não leitura de métricas de
campanha. Não reaproveitar o mesmo token mesmo que tecnicamente funcione —
manter escopos de permissão separados por integração é mais seguro e mais
fácil de revogar/rotacionar independentemente.

### Vercel env vars — gotcha crítico (CLAUDE.md)
> **NUNCA use `vercel env add` via stdin/pipe** (`echo x | vercel env add ...`):
> grava valor VAZIO silenciosamente. Já causou 2 incidentes documentados.
> Sempre use a REST API (`scripts/vercel-env-set.sh`), e sempre `vercel redeploy`
> após a mudança — env vars só valem após redeploy.

### Sem código de aplicação nesta story
Esta story não cria nem modifica nenhum arquivo `.ts`/`.tsx`/`.sql`. É
puramente infraestrutura (Business Manager + Vercel env vars). O `curl` de
validação (T5/AC6) é um comando manual de teste, não um script committado.

### Testing
- Validação manual via `curl` contra o endpoint CAPI com `test_event_code`,
  confirmando `events_received: 1` na resposta e o evento aparecendo na aba
  "Test Events" do Events Manager dentro de ~1 minuto.
- Não há testes automatizados nesta story (não há código).

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only (@qa gate, se aplicável).
> Esta story não produz código — quality gate é validação manual do @devops.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-04 | 0.1 | Draft criado a partir da auditoria de tracking Meta (@architect Aria + @analyst Atlas). Primeira story do Epic 86, bloqueadora de todas as demais. | @sm (River) |
| 2026-08-04 | 0.2 | Validação @po (10-point): GO, 9/10. Draft → Ready. Gotcha Vercel corretamente incorporado (REST API / `scripts/vercel-env-set.sh`, nunca pipe). Nenhum fix bloqueante. | @po (Pax) |
