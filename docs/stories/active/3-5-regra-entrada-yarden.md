status: Done

# Story 3.5 — Regra de Entrada Yarden

## Contexto
Regra de negocio critica definida por Alexandre: lead sem entrada disponivel NAO qualifica para o Yarden. O Yarden e empreendimento de alto padrao e exige entrada. A Nicole precisa verificar isso com empatia — sem ser brusca ou excludente. Se nao tem entrada, sugere o Vind ou manter contato para oportunidades futuras.

## Acceptance Criteria
- [x] AC1: Quando `current_property_id` = Yarden E `collected_data.has_down_payment` = false, Nicole informa com empatia que entrada e necessaria
- [x] AC2: Nicole NAO usa linguagem negativa ("voce nao pode", "nao e possivel") — usa tom positivo e sugere alternativas
- [x] AC3: Alternativas sugeridas: conhecer o Vind (sem exigencia de entrada) OU manter contato para oportunidades futuras
- [x] AC4: Lead e marcado como `qualification_status = 'disqualified'` com `disqualification_reason = 'no_down_payment_yarden'`
- [x] AC5: Se lead disqualificado para Yarden mostrar interesse no Vind, a conversa continua normalmente com redirecionamento para Vind
- [x] AC6: Se lead inicialmente disser que nao tem entrada mas depois corrigir ("na verdade eu tenho"), o status e revertido para `pending` e qualificacao continua
- [x] AC7: A regra so se aplica ao Yarden — Vind nao exige entrada
- [x] AC8: A verificacao acontece automaticamente quando `has_down_payment` e coletado no fluxo de qualificacao

## Detalhes Tecnicos

### Arquivos a criar/modificar:
- `packages/ai/src/flows/yarden-gate.ts` — Logica de gate de entrada
- `packages/ai/src/flows/qualification.ts` — Adicionar check de Yarden gate

### Logica:
```typescript
export function checkYardenGate(
  propertySlug: string,
  collectedData: CollectedData
): { passed: boolean; action: 'continue' | 'redirect_vind' | 'ask_payment' } {
  // So aplica ao Yarden
  if (propertySlug !== 'yarden-residence') {
    return { passed: true, action: 'continue' };
  }

  // Ainda nao perguntou sobre entrada
  if (collectedData.has_down_payment === undefined) {
    return { passed: false, action: 'ask_payment' };
  }

  // Nao tem entrada
  if (collectedData.has_down_payment === false) {
    return { passed: false, action: 'redirect_vind' };
  }

  // Tem entrada
  return { passed: true, action: 'continue' };
}
```

### Prompt de redirecionamento (exemplo):
```
O lead informou que nao tem entrada disponivel no momento. O Yarden exige entrada.
Responda com EMPATIA e POSITIVIDADE:
- Agradeca o interesse no Yarden
- Informe que o Yarden trabalha com condicoes que incluem entrada
- Sugira conhecer o Vind: "Temos tambem o Vind Residence, um empreendimento incrivel com condicoes mais flexiveis. Posso te contar mais sobre ele?"
- Ou: "Posso te manter informado sobre novidades e oportunidades especiais"
- NUNCA diga "voce nao pode comprar" ou "voce nao se qualifica"
```

### Referencia agente-linda:
- Logica nova (agente-linda nao tinha gate de qualificacao por empreendimento)

## Dependencias
- Depende de: 3.4 (qualificacao coleta has_down_payment), 3.3 (empreendimento identificado como Yarden), 2.6 (seed Yarden com commercial_rules.requires_down_payment = true)
- Bloqueia: nenhuma (e um gate dentro do fluxo)

## Estimativa
P (Pequena) — 1 hora

## File List
- `packages/ai/src/flows/yarden-gate.ts` — Logica do gate de entrada: checkYardenGate, redirecionamento para Vind com empatia

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
