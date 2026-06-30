# Story 75-79 — Documento da obra com slot de notificação próprio (separa do agrupamento foto/fase)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** fix/75-79-coalescing-documento-slot-proprio · **Complexidade:** S (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, teste de coalescing]
- Ajusta a Story 75-77 ([[project-notificacoes-portal]]).

## Story
**As a** cliente do portal, **I want** ser avisado quando um documento novo da obra for disponibilizado,
**so that** um documento não passe despercebido por ter caído na mesma janela de uma foto/atualização visual.

## Contexto
A Story 75-77 (PR #65) agrupou **foto + documento + fase de obra** num único slot `atualizacao_obra` com janela
de 12h → dentro de 12h, só a 1ª novidade dispara aviso; as demais ficam silenciosas. Decisão do usuário
(2026-06-30): manter os 12h e o agrupamento de **foto + fase**, mas o **documento geral passa a ter slot
próprio** (não é mais suprimido pela foto). Boleto já é independente (`notifyNovoBoleto`, fora do coalescing) e
mensagem já nunca agrupa (`null`).

## Escopo
**IN:**
- `notificacoes.ts` → `COALESCE_GROUP`: `novo_documento` deixa de ser `"atualizacao_obra"` e passa a ter chave
  própria `"novo_documento"` (continua coalescido em 12h DENTRO do próprio grupo — lote de docs = 1 aviso —
  mas NÃO é mais bloqueado por foto/fase nem as bloqueia).
- Atualizar comentário explicando os grupos.

**OUT:**
- Não muda a janela (segue 12h), nem foto/fase (seguem juntos em `atualizacao_obra`), nem mensagem (`null`),
  nem boleto (caminho próprio `notifyNovoBoleto`).
- Não torna documento "sem coalescing" (cada arquivo): mantém 1 aviso por lote de 12h (anti-flood). Se quiserem
  cada documento avisando, é trocar `"novo_documento"` por `null` (follow-up trivial).

## Acceptance Criteria
1. **Given** uma foto e um documento na mesma janela de 12h (mesma obra), **then** o cliente recebe **2 avisos**
   (1 de atualização visual + 1 de documento) — antes recebia só 1.
2. **Given** vários documentos no mesmo lote/janela, **then** 1 único aviso de documento (coalescido no próprio slot).
3. **Given** várias fotos + fases na janela, **then** seguem em 1 aviso `atualizacao_obra` (inalterado).
4. **Given** mensagem da equipe, **then** sempre dispara (inalterado).
5. typecheck/lint limpos; teste de coalescing cobrindo doc-separado-de-foto.

## Dev Notes
- `COALESCE_GROUP` em `packages/web/src/lib/notificacoes.ts` (~L25). Lógica: `coalesceKey = COALESCE_GROUP[evento]`;
  se truthy, `claim_obra_notif(obraId, coalesceKey, 12h)`; se null, sempre envia. Mudar só o valor de `novo_documento`.
- Atualizar `notificacoes.test.ts` (PR #65 adicionou testes de coalescing) p/ refletir doc em slot próprio.

## File List
- `packages/web/src/lib/notificacoes.ts` — `COALESCE_GROUP.novo_documento` → `"novo_documento"`.
- `packages/web/src/lib/notificacoes.test.ts` — ajustar/!adicionar caso doc-separado.

## QA Results
- **Verdict: PASS.** Teste de coalescing atualizado: foto/progresso → `atualizacao_obra`, `novo_documento` →
  slot próprio `novo_documento`, `nova_mensagem` → sem claim (sempre envia). 6/6 testes, type-check 0, lint 0.
  Mudança de 1 valor no `COALESCE_GROUP` (aditiva/isolada) — sem impacto em boleto (caminho próprio) nem nos
  demais grupos.

## Change Log
- 2026-06-30 — @sm — Story criada. Documento ganha slot de coalescing próprio (separa de foto/fase), mantendo 12h.
  Ajuste da 75-77 por decisão do usuário. Ver [[project-notificacoes-portal]].
