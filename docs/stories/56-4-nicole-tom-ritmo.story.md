# Story 56-4 — Calibração de tom/ritmo da Nicole (não ser afobada)

## Metadata
- **Status:** Done
- **Epic:** 56 — Biblioteca de Mídia da Nicole
- **Branch:** story-56-4-nicole-tom-ritmo

## Context
Teste real (2026-07-10, Marcos/Vind) após a 56-3: o dedup passou a funcionar (confirmado no banco: envios logados com `source='nicole_library'`, e Brinquedoteca enviada às 08:27 em vez de repetir Academia). Mas surgiu um desvio de **tom**: no meio do envio de fotos (lead ainda explorando), a Nicole emendou *"Você prefere andar mais alto ou mais baixo, Marcos?"* — uma pergunta de qualificação disparada cedo demais. Feedback do Marcos: induzir visita/abrir conversa **não é ruim**, mas o **tom/ritmo precisa ser controlado** (ela está "afobada").

Origem: `qualification-flow` lista "Preferência de andar — 'Prefere andar mais alto ou mais baixo?'" como coleta de qualificação, e a Nicole a dispara logo após dar informação/enviar fotos.

## Acceptance Criteria
- [x] AC1 (RN14 — ritmo): quando o lead está pedindo/vendo fotos e informações, a Nicole prioriza atender o pedido e mantém a conversa leve; NÃO emenda perguntas de qualificação (andar, quartos, vagas, entrada) logo após enviar imagens/dar informação.
- [x] AC2 (qualificação gateada): preferência de andar/vista/vagas só é perguntada quando o lead demonstra intenção de escolher unidade ou visitar — não durante a exploração de fotos.
- [x] AC3 (comportamento preservado): induzir visita e abrir conversa continuam permitidos — com naturalidade e no tempo do lead (uma pergunta leve/aberta por mensagem).
- [x] AC4 (paridade): RN14 no `guardrails` e a nota de RITMO no `qualification-flow` atualizados TANTO no banco (`agent_prompts`) QUANTO no código; item 7 (Entrada) do banco tem deriva prévia e foi preservado (replace cirúrgico).

## Out of Scope
- Reescrever o fluxo de qualificação; coordenação forte texto↔mídia no pipeline; enum lazer/localizacao.

## Dependencies
- Prompts no banco (`agent_prompts` mascara o código). Sobre 56-2/56-3.

## Complexity
- **T-shirt:** XS (2 regras de prompt; banco vale imediato, código = paridade).

## Business Value
Nicole mantém a proatividade (induzir visita, abrir conversa) mas com tom no ritmo do lead — menos "vendedora afobada", mais consultora acolhedora. Reduz atrito no momento de exploração e melhora a experiência.

## Risks
- Baixo. Risco de ficar passiva demais: mitigado por manter explicitamente permitido induzir visita/abrir conversa com uma pergunta leve.

## Definition of Done
- AC1–AC4 atendidos; prompts do banco verificados; testes/tsc verdes; deploy de paridade via @devops.

## File List
- `docs/stories/56-4-nicole-tom-ritmo.story.md` (this file)
- `packages/ai/src/prompts/guardrails.ts` (RN14)
- `packages/ai/src/prompts/qualification.ts` (nota de RITMO no item 4)
- `agent_prompts` banco prod: `guardrails` (RN14) + `qualification-flow` (RITMO) — aplicados via SQL, valem imediatamente

## QA Results (@qa / Quinn)
- **Gate: PASS.** Testes de prompts 18/18, `tsc` (ai) 0 erros. Prompts do banco verificados (`guardrails` has RN14; `qualification-flow` has RITMO). Deriva do item 7 preservada.
- **Validação real:** repetir com Marcos — pedir fotos/lazer e confirmar que ela NÃO dispara "andar alto/baixo" no meio da navegação; que ainda convida pra visita, mas com tom leve.
