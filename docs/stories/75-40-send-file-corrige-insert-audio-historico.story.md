# Story 75-40 — Áudio/arquivo do corretor não gravava no histórico (org_id inexistente)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** S (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** corretor/gestor, **I want** que o áudio (e arquivos) enviados ao lead apareçam no
histórico da conversa no CRM, **so that** eu tenha o registro do que foi enviado — hoje o
áudio chega no WhatsApp do lead mas some do CRM.

## Contexto
Pedido/diagnóstico do usuário (2026-06-23): após liberar `audio/ogg` no bucket `nicole-media`
(config de storage, fix anterior), o áudio passou a CHEGAR no WhatsApp, mas NÃO aparecia no
thread. Causa-raiz: `POST /api/leads/[id]/send-file` insere em `messages` com
`org_id: appUser.org_id`, **mas `messages` não tem coluna `org_id`** (colunas reais:
id, conversation_id, role, content, media_url, media_type, metadata, created_at). O insert
falha ("column does not exist") e a rota **não checava o erro** → falha silenciosa
(`return success:true` mesmo assim). O envio de TEXTO (`send-message`) funciona porque não
seta `org_id` e ainda checa o erro do insert.

## Escopo
**IN:**
- `send-file/route.ts`: remover `org_id` do insert; popular as colunas dedicadas
  `media_url`/`media_type` (além do metadata); checar o erro do insert e logar/retornar
  `MESSAGE_INSERT_FAILED`; retornar `messageId`.
**OUT:** mudar UI do recorder; bucket (já corrigido); player inline no thread (backlog).

## Acceptance Criteria
1. Enviar áudio pelo composer grava `messages` (role=broker, content "[Áudio]",
   media_type "audio") e aparece no histórico após refresh.
2. Enviar arquivo (imagem/documento) idem (media_type image/document).
3. Falha de insert deixa de ser silenciosa: logada no servidor e refletida na resposta.
4. Comportamento de envio ao WhatsApp inalterado (e janela 24h continua respeitada).
5. typecheck e lint limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.40-send-file-corrige-insert-audio-historico.yml`)
- **typecheck/lint:** limpos.

## File List
- `packages/web/src/app/api/leads/[id]/send-file/route.ts`
