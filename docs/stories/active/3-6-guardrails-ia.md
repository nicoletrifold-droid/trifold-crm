status: Done

# Story 3.6 — Guardrails da IA

## Contexto
Os guardrails sao a camada de seguranca que impede a Nicole de cometer erros criticos. Sao 6 restricoes definidas pela Trifold por razoes juridicas e comerciais. A Nicole NUNCA deve: prometer materiais de acabamento, simular financiamento, expor memorial descritivo, dar preco exato, revelar que e IA, ou inventar informacao. Violacao de qualquer guardrail e incidente critico.

## Acceptance Criteria
- [x] AC1: Guardrail RN1 ativo: Nicole NAO promete materiais/acabamentos especificos. Se perguntarem sobre piso/revestimento/acabamento, responde "os acabamentos serao definidos no memorial descritivo final, venha conhecer o decorado para ter uma ideia do padrao"
- [x] AC2: Guardrail RN2 ativo: Nicole NAO faz simulacao financeira. Se perguntarem "quanto fica a parcela?", responde "as condicoes dependem do seu perfil, o corretor pode fazer uma simulacao personalizada presencialmente"
- [x] AC3: Guardrail RN3 ativo: Nicole NAO expoe memorial descritivo tecnico. Se pedirem memorial, responde "o memorial completo esta disponivel no stand de vendas, posso agendar uma visita?"
- [x] AC4: Guardrail RN4 ativo: Nicole NAO da preco exato por unidade. Se perguntarem preco, responde com faixa generica (se configurada) ou direciona ao corretor
- [x] AC5: Guardrail RN5 ativo: Nicole NAO revela que e IA/bot. Se perguntarem, diz que e da equipe comercial
- [x] AC6: Guardrail RN6 ativo: Nicole NAO inventa informacao. Se nao sabe, diz que vai verificar e sugere visita
- [x] AC7: Funcao `applyGuardrails(response, context)` que verifica a resposta ANTES de enviar e corrige/bloqueia se necessario
- [ ] AC8: Log de violacao tentada: quando IA tenta violar guardrail, registra em `activities` como `guardrail_triggered` com tipo de guardrail
- [x] AC9: Guardrails sao configurados na tabela `agent_prompts` (slug: `guardrails`) e podem ser editados pelo admin
- [ ] AC10: Teste: enviar 6 mensagens que tentam violar cada guardrail e confirmar que Nicole responde adequadamente

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/ai/src/guardrails/index.ts` — Aplicacao de guardrails
- `packages/ai/src/guardrails/validators.ts` — Validadores individuais por tipo
- `packages/ai/src/guardrails/responses.ts` — Respostas padrao para cada guardrail

### Abordagem tecnica:
Os guardrails sao aplicados em 2 camadas:
1. **Pre-geracao (prompt injection):** Instrucoes no system prompt que proibem os comportamentos
2. **Pos-geracao (validacao):** Funcao que analisa a resposta gerada e detecta violacoes

### Validacao pos-geracao:
```typescript
const GUARDRAIL_PATTERNS = {
  price_disclosure: /R\$\s*\d+[\.,]\d+|(\d+\.?\d*)\s*(mil|milhao|milhoes)/i,
  material_promise: /(porcelanato|granito|marmore|piso|revestimento|acabamento)\s+(sera|vai ser|e de)/i,
  financing_simulation: /(parcela|prestacao)\s+(de|fica|seria)\s+R?\$?\s*\d+/i,
  ai_reveal: /(sou uma? (ia|inteligencia artificial|bot|chatbot|robo))/i,
};

export function checkGuardrailViolation(
  response: string
): { violated: boolean; type: string | null; suggestion: string | null } {
  for (const [type, pattern] of Object.entries(GUARDRAIL_PATTERNS)) {
    if (pattern.test(response)) {
      return { violated: true, type, suggestion: FALLBACK_RESPONSES[type] };
    }
  }
  return { violated: false, type: null, suggestion: null };
}
```

### Referencia agente-linda:
- Adaptar guardrails de `~/agente-linda/packages/ai/src/guardrails/` (se existir)
- Reusar pattern de pos-processamento de resposta

## Dependencias
- Depende de: 3.1 (prompt de guardrails no system prompt)
- Bloqueia: nenhuma (e uma camada transversal aplicada em toda resposta)

## Estimativa
M (Media) — 2 horas

## File List
- `packages/ai/src/prompts/guardrails.ts` — Definicao dos 6 guardrails (RN1-RN6) com instrucoes de prompt e respostas padrao

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
