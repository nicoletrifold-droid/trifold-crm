# Story 15.3 — WhatsApp: Adicionar sendTemplate() ao Adapter

## Status
InProgress

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["code-review", "test-validation"]

## Story
**As a** sistema CRM,
**I want** enviar template messages via WhatsApp Business API,
**so that** leads de campanhas recebam confirmacoes automaticas mesmo fora da janela de 24h.

## Contexto

**Epic 15 — Campaign Engine + Google Forms Integration (Fase 1 MVP)**

A Meta exige template messages para mensagens proativas (fora da janela de 24h de conversa). O `WhatsAppAdapter` atual so tem `sendText()`, `sendImage()` e `sendDocument()`. Esta story adiciona `sendTemplate()`.

**Referencia:** Arquitetura secao 4.3

**Dependencias:** Nenhuma tecnica. Porem, o template precisa ser aprovado na Meta Business antes de usar em producao.

## Acceptance Criteria

1. [ ] AC1: Interface `MessagingAdapter` em `messaging-adapter.ts` extendida com metodo opcional `sendTemplate?(to, templateName, languageCode, components?)`
2. [ ] AC2: `WhatsAppAdapter` implementa `sendTemplate()` que chama a Meta Graph API v21.0 com payload `type: "template"`
3. [ ] AC3: Tipo `TemplateComponent` exportado de `messaging-adapter.ts` com estrutura: `{ type: 'body' | 'header', parameters: { type: 'text', text: string }[] }`
4. [ ] AC4: Chamada a API usa o mesmo `callApi()` privado existente no adapter
5. [ ] AC5: Se a API retornar erro, o metodo lanca Error com status e mensagem (mesmo padrao de `sendText`)
6. [ ] AC6: `pnpm run type-check` passa sem erros
7. [ ] AC7: Testes unitarios para `sendTemplate()` com mock da API

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled

## Tasks / Subtasks

- [x] Task 1: Definir tipos (AC3)
  - [x] 1.1: Adicionar `TemplateComponent` type em `packages/bot/src/adapters/messaging-adapter.ts`

- [x] Task 2: Atualizar interface (AC1)
  - [x] 2.1: Adicionar `sendTemplate?` como metodo opcional na interface `MessagingAdapter`

- [x] Task 3: Implementar sendTemplate no WhatsAppAdapter (AC2, AC4, AC5)
  - [x] 3.1: Adicionar metodo `sendTemplate()` em `packages/bot/src/adapters/whatsapp-adapter.ts`
  - [x] 3.2: Payload: `{ messaging_product: "whatsapp", to, type: "template", template: { name, language: { code }, components } }`
  - [x] 3.3: Usar `this.callApi("messages", payload)` existente

- [x] Task 4: Testes (AC6, AC7)
  - [ ] 4.1: Criar teste unitario para `sendTemplate` com mock de fetch
  - [x] 4.2: type-check

## Dev Notes

### Source Tree Relevante

- `packages/bot/src/adapters/whatsapp-adapter.ts` — adapter atual (96 linhas), metodo `callApi()` na linha 75
- `packages/bot/src/adapters/messaging-adapter.ts` — interface `MessagingAdapter` + `ParsedMessage`

### Payload Esperado pela Meta API

```json
{
  "messaging_product": "whatsapp",
  "to": "5544999999999",
  "type": "template",
  "template": {
    "name": "concurso_vind_confirmacao",
    "language": { "code": "pt_BR" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "João" },
          { "type": "text", "text": "847" }
        ]
      }
    ]
  }
}
```

### Nota sobre Optional

O metodo e `optional` na interface (`sendTemplate?`) porque o `TelegramAdapter` nao precisa dele. Telegram nao tem conceito de templates aprovados.

### Testing

- Mock do `fetch` para simular resposta da Meta API
- Testar caso de sucesso e caso de erro (API retorna 400)
- `pnpm run type-check`

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-16 | 1.0 | Story criada | @sm (River) |
