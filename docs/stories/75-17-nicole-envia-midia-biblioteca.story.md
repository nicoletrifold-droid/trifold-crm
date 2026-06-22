# Story 75-17 — Nicole envia mídia da biblioteca ao lead quando ele pede

## Metadata
- **Status:** Done
- **Epic:** Nicole / Mídia
- **Branch:** main

## Context
A biblioteca de mídia da Nicole (`agent_media_assets`, Config → Nicole → Mídia) existia, mas só o **corretor** enviava manualmente (📎, Story 56-1). A Nicole (IA) **não** enviava plantas/imagens quando o lead pedia. Pedido: quando o lead pede material, a Nicole envia o arquivo do empreendimento de interesse.

Abordagem (segura): passo **aditivo** após a resposta de texto da Nicole no webhook do WhatsApp — não altera o texto/raciocínio dela. Casamento **preciso** por `agent_media_assets.property_id = leads.property_interest_id` (sem adivinhação). Reaproveita o envio de mídia via WhatsApp (image/document por link).

## Acceptance Criteria
- [x] AC1: Helper `lib/ai/send-library-media.ts` — `detectMaterialRequest(text)` retorna planta/tabela/fachada/qualquer/null (conservador; ignora saudações). `sendLibraryMediaIfRequested` só envia se: pedido claro + `leads.property_interest_id` presente + asset ATIVO daquele `property_id`.
- [x] AC2: Filtra por categoria quando o tipo é específico (planta→planta, tabela→tabela, fachada→fachada; "qualquer"→sem filtro). Envia no máx. 2 assets.
- [x] AC3: Integrado no `webhook/whatsapp/route.ts` APÓS o envio do texto da Nicole, em try/catch — nunca quebra a resposta. Envia image/document por link (mesmo mecanismo do envio do corretor). Registra em `messages` (role assistant, metadata is_media, source nicole_library).
- [x] AC4: Sem migration. Sem alteração no prompt/raciocínio da Nicole. Degrada com segurança (sem pedido claro / sem empreendimento / sem asset → não envia nada).

## Out of Scope
- Tool-calling no agente (a decisão é heurística pós-resposta, não LLM). Pode evoluir depois.
- Match por empreendimento citado em texto livre quando o lead não tem property_interest_id (hoje exige o interesse setado, para não adivinhar).

## Dependencies
- `agent_media_assets` (property_id, category, file_type, file_url) + `leads.property_interest_id` + `whatsapp_config`. Tudo já existe.

## Risks
- Médio (fluxo da Nicole). Mitigado: aditivo + isolado em try/catch; matching exato por property_id; conservador (não dispara sem pedido claro). Verificado: 12 assets ativos c/ property_id, 46 leads com interesse; detector sem falso-positivo em saudações. **Verificar pós-deploy** com uma conversa real.

## File List
- `packages/web/src/lib/ai/send-library-media.ts` (new)
- `packages/web/src/app/api/webhook/whatsapp/route.ts` (chamada pós-resposta)

## QA Results (@qa / Quinn)
**Veredito: PASS** — AC1–AC4. Heurística conservadora validada; matching preciso por property_id; dados existem em prod. Aditivo e isolado (não quebra a resposta da Nicole). type-check/eslint OK. Verificar pós-deploy com conversa real.

## Change Log
- @sm/@po/@dev/@qa: criada, implementada, QA PASS.
