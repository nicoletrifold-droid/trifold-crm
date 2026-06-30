# Story 75-77 — Notificações do portal: janela de coalescing 12h + agrupamento de tipos

## Metadata
- **Status:** InReview · **Epic:** 75 · **Branch:** feat/75-77-notif-coalescing-12h-agrupamento · **Complexidade:** XS (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, test]
- **Nota de processo:** ajuste de política escopado pelo diretor direto na conversa. Sem mudança de schema (a RPC `claim_obra_notif` já parametriza chave e janela). Estende a Story 75-66.

## Story
**As a** cliente do portal Trifold, **I want** receber no máximo um aviso de "atualização da obra" a cada 12 horas por
obra (juntando fotos, documentos e progresso num só), **so that** eu não seja inundado por uma enxurrada de
notificações quando o time de obras sobe vários arquivos ao longo do dia.

## Contexto
O coalescing anti-flood da Story 75-66 já existe (`obra_notif_dedup` + RPC `claim_obra_notif`, migration 123), mas com
janela de **15 minutos por (obra, evento)**. Na prática o time de obras sobe fotos/documentos em horários espalhados
pelo dia → cada lote separado por >15 min reabre a janela → várias notificações/dia (print do diretor, Samara
encaminhando 3 avisos: 2 "Nova foto" do Vind + 1 "Progresso" do Yarden). Decisão do diretor (2026-06-30, após cogitar
4h e digest em horário fixo): **janela deslizante de 12h** + **agrupar os tipos de atualização de obra**, mantendo a
mensagem direta da equipe sempre passando. Ver [[project-notificacoes-portal]].

## Escopo
**IN:**
- `packages/web/src/lib/notificacoes.ts`:
  - `COALESCE_WINDOW_SECONDS`: `15*60` → `12*60*60` (12 horas).
  - Novo mapa `COALESCE_GROUP` (por `EventoNotificacao`): `nova_foto`/`novo_documento`/`progresso` → chave única
    `"atualizacao_obra"`; `nova_mensagem` → `null`.
  - `notifyClientes`: só chama `claim_obra_notif` quando a chave de grupo for não-nula (passando a chave de grupo como
    `p_evento`); `null` (nova_mensagem) pula o coalescing e sempre envia.
- Testes em `notificacoes.test.ts`: cobrir (a) foto/doc/progresso usam a chave `"atualizacao_obra"`; (b) `nova_mensagem`
  não chama o claim e segue direto.

**OUT:**
- Sem migration (a RPC `claim_obra_notif` já recebe `p_evento` e `p_window_seconds` como parâmetros).
- Não mexer nas preferências por usuário (`obra_notificacao_prefs`) nem nos canais (e-mail/WhatsApp/push).
- Não mudar a copy/labels dos eventos (`EVENTO_LABEL`).
- Não implementar digest em horário fixo (descartado em favor da janela deslizante).

## Acceptance Criteria
1. **Given** uma foto é publicada numa obra **and** menos de 12h se passaram desde o último aviso de atualização
   daquela obra, **when** outra foto/documento/progresso é publicado, **then** nenhuma notificação nova é enviada (o
   cliente vê tudo no portal).
2. **Given** passaram-se ≥12h desde o último aviso de atualização da obra, **when** uma foto/documento/progresso é
   publicado, **then** o cliente é notificado na hora (janela deslizante, sem horário fixo).
3. **Given** foto, documento e progresso da MESMA obra dentro da janela, **then** compartilham um único slot
   (`"atualizacao_obra"`) → no máximo 1 aviso por janela, e não 1 por tipo.
4. **Given** uma `nova_mensagem` (mensagem direta da equipe), **then** ela NUNCA é coalescida — sempre envia.
5. **Given** a RPC `claim_obra_notif` falha, **then** o envio NÃO é bloqueado (fallback seguro preservado).
6. typecheck/lint/test limpos; sem regressão nos casos da Story 75-66.

## Dev Notes
- Arquivo único de produção: `packages/web/src/lib/notificacoes.ts`. Chave de grupo entra como `p_evento` na RPC.
- Linhas antigas em `obra_notif_dedup` (evento='nova_foto'/'novo_documento'/'progresso') ficam órfãs após o deploy —
  inócuas (a tabela é só dedup). Não precisa limpar.
- Edge aceito pelo diretor: cliente que só habilitou "documento" mas uma foto chegou primeiro na janela não recebe o
  aviso do documento (vê no portal mesmo assim). Consequência direta de "juntar" os tipos.

## File List
- `packages/web/src/lib/notificacoes.ts` — janela 12h + `COALESCE_GROUP` + claim por chave de grupo.
- `packages/web/src/lib/notificacoes.test.ts` — +2 casos (agrupamento; nova_mensagem nunca coalesce).

## QA Results
- **Verdict:** PASS — test 6/6, typecheck 0, lint 0.
- ACs: AC1/AC2 (janela 12h desliza — lógica 75-66 preservada, só a constante mudou), AC3 (foto/doc/progresso → chave `"atualizacao_obra"`, teste direto), AC4 (nova_mensagem pula o claim, teste direto), AC5 (fallback de erro da RPC mantido), AC6 (gates limpos).
- Sem regressão: 4 casos da Story 75-66 continuam passando. Sem migration (RPC já parametrizada).
- CONCERNS: nenhum bloqueante. Edge da pref-por-tipo dentro do grupo aceito pelo diretor (cliente vê no portal).

## Change Log
- 2026-06-30 — @sm — Story criada (Draft). Estende 75-66: janela 15min→12h + agrupamento foto/doc/progresso, mensagem da equipe sempre passa. Decisão do diretor na conversa. Ver [[project-notificacoes-portal]].
- 2026-06-30 — @po — Validação 10/10 → GO. Status Draft → Ready.
- 2026-06-30 — @dev — Implementado em `notificacoes.ts` (janela 12h + COALESCE_GROUP + claim por chave de grupo) + 2 testes. test 6/6, typecheck/lint limpos. Branch `feat/75-77-notif-coalescing-12h-agrupamento`. Status → InReview.
