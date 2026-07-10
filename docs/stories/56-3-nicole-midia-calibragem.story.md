# Story 56-3 — Calibragem do envio de mídia da Nicole (dedup + fala coerente)

## Metadata
- **Status:** Done
- **Epic:** 56 — Biblioteca de Mídia da Nicole
- **Branch:** story-56-3-nicole-midia-calibragem

## Context
Teste real (2026-07-10, Marcos/Vind) após a 56-2 expôs 3 desvios de comportamento:

1. **Reenvio da mesma imagem (dedup falhava).** Causa raiz encontrada no banco: a tabela `messages` **não tem coluna `org_id`**; o helper `send-library-media.ts` inseria `org_id` (coluna inexistente) → **o INSERT falhava silenciosamente** → nenhuma linha de mídia era gravada → o dedup (que lê `messages.metadata.media_asset_id`) nunca via histórico. Além disso, a própria query de dedup filtrava por `org_id` (também falhava). Bug herdado da 75-17 (o log de mídia nunca funcionou). Confirmado: 0 linhas `source='nicole_library'` na conversa de teste, apesar das imagens terem chegado.
2. **"Não consigo enviar imagens por aqui" (e enviava).** Emergente do prompt: o modelo não sabe que a mídia é enviada (helper é passo determinístico pós-texto), então caía no padrão de deflexão "vem no stand". Guardrails não tinham regra sobre a capacidade de enviar.
3. **"Você está perguntando sobre qual empreendimento?"** com o Vind já estabelecido na conversa (ela mesma tinha citado Vind Residence no turno anterior).

## Acceptance Criteria
- [x] AC1 (dedup real): o log de mídia grava em `messages` (sem `org_id`, shape espelhando `saveMessages`); pedidos de "mais" imagens não reenviam assets já mandados na conversa.
- [x] AC2 (fala coerente — RN12): a Nicole NUNCA diz que não consegue enviar imagens; quando o lead pede material, ela envia e comenta com naturalidade ("te mandei aqui a planta e umas fotos"), conduzindo para a visita.
- [x] AC3 (não repergunta — RN13): quando o empreendimento já está estabelecido na conversa, a Nicole não pergunta de novo qual é.
- [x] AC4 (paridade prompt): RN12/RN13 atualizados TANTO no código (`guardrails.ts`) QUANTO no banco (`agent_prompts.slug='guardrails'`) — o banco mascara o código, então ambos.
- [x] AC5 (regressão): funções puras da 56-2 intactas; suíte completa verde; `tsc`+ESLint limpos.

## Out of Scope
- Coordenação forte texto↔mídia via injeção de contexto no pipeline (packages/ai) — RN12 já resolve o caso comum; injeção fica como follow-up se o descompasso persistir.
- Expandir enum `lazer`/`localizacao`; Telegram/Portal.

## Dependencies
- Sobre a 56-2 (`send-library-media.ts`) e a 56-1 (biblioteca). Prompt no banco: ver convenção de override (`agent_prompts` mascara o código).

## Complexity
- **T-shirt:** S (2 fixes pequenos + 2 regras de prompt + testes).

## Business Value
Nicole passa a enviar as imagens certas SEM se contradizer ("não consigo enviar" enquanto envia) e SEM repetir imagens nem reperguntar o empreendimento — comportamento calibrado e confiável no momento de maior interesse do lead.

## Risks
- RN12 pode, num caso raro (pedido de foto sem empreendimento identificável), fazer a Nicole comentar que enviou sem o helper ter enviado. Mitigado: RN13 estabelece o empreendimento; sem empreendimento, ela pergunta (não afirma). Residual baixo.

## Definition of Done
- AC1–AC5 atendidos; testes 866/866; `tsc`+ESLint limpos; prompt do banco atualizado e verificado; deploy via @devops.

## File List
- `docs/stories/56-3-nicole-midia-calibragem.story.md` (this file)
- `packages/web/src/lib/ai/send-library-media.ts` (remove `org_id` do insert e da query de dedup)
- `packages/web/src/lib/ai/send-library-media.test.ts` (+3 testes de I/O com admin fake)
- `packages/ai/src/prompts/guardrails.ts` (RN12 + RN13)
- `agent_prompts.slug='guardrails'` no banco prod (RN12 + RN13 anexadas — aplicado via SQL, vale imediatamente)

## Dev Agent Record (@dev / Dex)
### Completion Notes
- Causa raiz do dedup confirmada por inspeção do schema (`messages` sem `org_id`; `topic`/`extension` NOT NULL preenchidos por trigger) e da conversa de teste (0 linhas de mídia). Fix = insert sem `org_id`, espelhando `saveMessages`.
- Teste de regressão trava o `org_id`: `expect(row).not.toHaveProperty("org_id")` + dedup ponta-a-ponta (fachada já enviada não reenvia).
- Prompt: banco atualizado (6476→8014 chars) por `UPDATE ... content = content || RN12+RN13`; código em paridade.

## QA Results (@qa / Quinn)
- **Gate: PASS.** 866/866 testes (18 no módulo, +3 de I/O), `tsc` 0 erros, ESLint limpo. Bug do `org_id` coberto por teste. Prompt verificado no banco.
- **Follow-up de validação real:** repetir o teste do Marcos — pedir fotos no Vind, pedir "mais", e confirmar: (a) sem "não consigo enviar", (b) imagens diferentes na segunda vez, (c) sem repergunta de empreendimento.
