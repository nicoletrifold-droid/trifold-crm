# Story 75-120 — Integração Clicksign: assinatura eletrônica a partir do módulo Pastas

## Metadata
- **Status:** Draft (spec) — aguardando @po *validate + decisões de produto · **Epic:** Integrações / Pastas · **Branch:** feat/75-120-clicksign-pastas · **Complexidade:** L (8 pontos) · **Tipo:** feature + integração externa
- **executor:** @dev + @data-engineer (tabela + bucket) · **quality_gate:** @qa · **quality_gate_tools:** [teste ponta-a-ponta no SANDBOX Clicksign, HMAC do webhook, typecheck, lint, migration idempotente]
- **Prioridade:** 🟠 a definir com o usuário
- **Dependência externa:** conta Clicksign 483765 tem acesso à API confirmado (Gerar Access Token + Webhooks disponíveis). Widget Embedded ("Contratar") NÃO é necessário. Token de **sandbox** para desenvolvimento; token de **produção** só no go-live.

## Story
**As a** gestão (admin/supervisor), **I want** enviar um documento de uma Pasta para assinatura eletrônica via Clicksign e acompanhar o status dentro do CRM, **so that** o interessado assine sem sair do fluxo e o PDF assinado volte pra Pasta automaticamente.

## Contexto
**Módulo Pastas** (Story 75-104, migrations 139-141): `pastas` (nome, tipo PF/PJ, casado, empreendimento, token, `form_data` jsonb, status) + `pasta_documentos` (label, titular interessado/conjuge/representante, `situacao` pendente/entregue/deferido/recusado, `storage_path` no bucket privado `pastas`, filename). Bucket `pastas` é privado (signed URL no dashboard). Gate por matriz de Perfil de Acesso (`permissions["pastas"]`).

**Clicksign API 3.0 (Envelope)** — REST, `Content-Type: application/vnd.api+json`, header `Authorization: {token}`. Base: sandbox `https://sandbox.clicksign.com/api/v3`, prod `https://app.clicksign.com/api/v3` (confirmar host de prod no primeiro teste). Fluxo: criar envelope → adicionar documento (PDF base64) → adicionar signatário → criar requisitos (papel `sign` + auth) → `PATCH status: running` → `POST notifications`. Webhooks para eventos (`sign`, `refusal`, `auto_close`/`document_closed`, `deadline`, `cancel`…) com validação HMAC.

Padrões reusáveis já existentes no CRM: webhook com verificação de assinatura (`api/webhooks/meta-ads`), bucket privado + signed URL (Pastas/Lançamentos), env var via `scripts/vercel-env-set.sh` (⚠️ nunca `vercel env add` por stdin), gate por matriz.

## Escopo
**IN:**
1. **Tabela `signature_envelopes`** (migration nova, próx. número livre — checar `supabase/migrations`):
   - `id uuid pk`, `org_id`, `pasta_id fk`, `pasta_documento_id fk null`, `clicksign_envelope_id text`, `clicksign_document_id text`, `clicksign_signer_id text`, `signer_name`, `signer_email`, `signer_phone`, `auth_method text` (email/sms/whatsapp), `status text` (draft/running/signed/refused/canceled/closed), `signed_storage_path text null`, `created_by`, `created_at`, `updated_at`. RLS org-scoped (mesmo molde das policies de `pastas`).
2. **Cliente Clicksign** em `lib/clicksign/` (fetch wrapper: base URL + token do env; funções `createEnvelope`, `addDocument`, `addSigner`, `addRequirements`, `activateEnvelope`, `notify`). Puro/testável.
3. **Ação "Enviar para assinatura"** no `pasta-detail` (por documento entregue): modal captura **nome + e-mail e/ou telefone do signatário** (pré-preenche com `pastas.nome`/`form_data` quando houver) e o **método de autenticação** (default e-mail). Chama a sequência da API, grava `signature_envelopes`, mostra "Aguardando assinatura".
4. **Webhook** `POST /api/webhooks/clicksign`: valida HMAC, mapeia evento → status em `signature_envelopes`; em `sign`/`document_closed` **baixa o PDF assinado** da Clicksign e salva no bucket `pastas` (`signed_storage_path`); atualiza a UI. Idempotente (dedup por evento/envelope).
5. **Status na UI**: coluna/badge de assinatura no `pasta-detail` + link pro PDF assinado (signed URL) quando disponível.
6. **Env vars**: `CLICKSIGN_API_TOKEN`, `CLICKSIGN_API_BASE_URL` (sandbox/prod), `CLICKSIGN_WEBHOOK_HMAC_SECRET`. Guard de env documentado no CLAUDE.md.
7. **Gate**: começar restrito a admin/supervisor (via matriz `pastas` + checagem de role). Ampliar depois (decisão do usuário: "definir depois").

**OUT:**
- Widget Embedded (assinatura dentro do CRM) — pago e desnecessário; o interessado assina pelo link/e-mail da Clicksign.
- Assinatura a partir de outros módulos (lead/cliente/obra/IMOB) — fase futura.
- Geração/montagem de contrato dentro do CRM (por ora envia um PDF já existente na Pasta).
- Múltiplos signatários por documento na v1 (1 signatário; multi-signer = follow-up).

## Decisões de produto necessárias (para @po / usuário)
1. **Contato do signatário:** capturar no momento do envio (recomendado, sem mudar schema da pasta) OU adicionar e-mail/telefone ao cadastro da Pasta? → *default proposto: capturar no envio*.
2. **Método de autenticação do signatário** (como a Clicksign confirma identidade): e-mail (default), SMS, WhatsApp, ou selfie/documento? → *default proposto: e-mail; WhatsApp como opção depois*.
3. **1 signatário só na v1?** (interessado). Cônjuge/representante como multi-signer = follow-up? → *default proposto: sim, 1 signatário na v1*.
4. **Prazo de assinatura** (deadline do envelope) — definir default (ex.: sem prazo) ou configurável.

## Acceptance Criteria
1. **Given** um documento entregue numa Pasta, **when** a gestão clica "Enviar para assinatura" e informa nome + contato, **then** o CRM cria o envelope na Clicksign (sandbox), dispara a notificação e grava `signature_envelopes` com status "running".
2. **Given** o signatário assina no sandbox, **then** o webhook recebe o evento, o status vira "signed", o **PDF assinado é baixado pro bucket** e fica acessível na Pasta.
3. **Given** recusa/cancelamento, **then** o status reflete (refused/canceled) na UI.
4. **Given** um evento repetido do webhook, **then** não duplica (idempotência) e o HMAC inválido é rejeitado (401).
5. **Given** um perfil sem acesso, **then** não vê a ação nem chama a API.
6. Teste ponta-a-ponta executado no **sandbox** (não em prod); typecheck/lint limpos; migration idempotente.

## Dev Notes
- **Sequência da API** (por documento): `POST /envelopes` → `POST /envelopes/{id}/documents` (PDF do bucket `pastas` em base64 `data:application/pdf;base64,...`) → `POST /envelopes/{id}/signers` → `POST /envelopes/{id}/requirements` (action `agree` role `sign`; action `provide_evidence` auth `email`) → `PATCH /envelopes/{id}` `status:running` → `POST /envelopes/{id}/notifications`.
- **HMAC do webhook**: confirmar cabeçalho/algoritmo exatos contra o sandbox (docs "Segurança de Webhooks"); espelhar o padrão de verificação de assinatura do `meta-ads`.
- **Download do assinado**: obter a URL do documento finalizado (evento `sign`/`document_closed` → detalhe do envelope) e persistir no bucket.
- **Segurança/env**: token via `scripts/vercel-env-set.sh` (REST API, nunca stdin). Sandbox p/ dev; prod só no go-live. Não commitar token.
- **Não quebrar o que funciona**: integração é aditiva ao módulo Pastas (não altera o fluxo público de upload nem o schema existente de `pasta_documentos`). Ref. [[project-pastas-documentos]], [[feedback-nao-quebrar-o-que-funciona]].
- **Numeração de migration**: checar o maior número atual antes de criar (histórico de conflito 074/075).
- Docs: https://developers.clicksign.com/reference/comece-agora · https://developers.clicksign.com/reference/criar-requisito-de-autenticacao
