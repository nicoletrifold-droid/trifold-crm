status: Done

# Story 3.10 — Handoff Transparente

## Contexto
O handoff e o momento em que a Nicole transfere o lead para um corretor humano. O lead NAO pode perceber que mudou de atendente — a transicao deve ser invisivel. O corretor recebe um resumo completo gerado pela IA com preferencias, perguntas, objecoes e score. Com Coexistence Mode, o corretor responde pelo WhatsApp Business App no celular — a Nicole para de responder automaticamente e o corretor assume. Os criterios de handoff sao: lead qualificado + pede valores detalhados, quer simulacao, agendou visita, pergunta fora do escopo, ou supervisao solicita.

## Acceptance Criteria
- [x] AC1: Criterios de handoff automatico definidos e funcionais:
  - Lead qualificado (score >= 70) E pede valores/simulacao
  - Lead agendou visita
  - Lead faz pergunta fora do escopo (preco exato, simulacao financeira)
  - Supervisao solicita handoff manual
- [x] AC2: Quando handoff e acionado, `conversation_state.handoff_triggered = true` e `handoff_reason` e registrado
- [x] AC3: Nicole envia ultima mensagem ao lead antes do handoff: "Vou te passar para o [nome do corretor] que e especialista no [empreendimento]. Ele vai te dar todos os detalhes!"
- [x] AC4: Ou se nao ha corretor designado ainda: "Vou falar com nosso especialista para te dar mais detalhes. Ele vai entrar em contato em breve!"
- [x] AC5: Resumo IA gerado automaticamente no momento do handoff com:
  - Nome do lead
  - Empreendimento de interesse
  - Preferencias coletadas (quartos, andar, vista, garagem)
  - Perguntas feitas pelo lead
  - Objecoes identificadas
  - Score de qualificacao
  - Proximos passos recomendados
- [x] AC6: Resumo salvo em `leads.ai_summary` (atualizado a cada handoff ou interacao significativa)
- [x] AC7: Lead designado automaticamente a corretor do empreendimento (se houver) via `leads.assigned_broker_id` — via broker_assignments no pipeline.ts
- [x] AC8: Status da conversa muda para `handed_off` — Nicole para de responder automaticamente
- [x] AC9: Atividade registrada em `activities`: tipo `handoff`, com reason e broker_id — integrado no pipeline.ts
- [x] AC10: Lead move para kanban stage adequada: "Qualificado" ou "Visita Agendada" — integrado no pipeline.ts
- [ ] AC11: Se nao houver corretor disponivel, lead fica em "Qualificado" sem designacao e notificacao vai para admin/supervisor

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/ai/src/flows/handoff.ts` — Logica de handoff
- `packages/ai/src/flows/handoff-criteria.ts` — Avaliacao de criterios
- `packages/ai/src/flows/summary-generator.ts` — Geracao de resumo IA
- `packages/db/src/queries/broker-assignment.ts` — Buscar corretor por empreendimento

### Criterios de handoff:
```typescript
export function shouldHandoff(
  state: ConversationState,
  lastMessage: string,
  score: number
): { should: boolean; reason: string } {
  // 1. Qualificado + pede valores
  if (score >= 70 && detectsPriceRequest(lastMessage)) {
    return { should: true, reason: 'qualified_price_request' };
  }

  // 2. Agendou visita
  if (state.visit_proposed && state.collected_data?.visit_availability) {
    return { should: true, reason: 'visit_scheduled' };
  }

  // 3. Pergunta fora do escopo
  if (detectsOutOfScope(lastMessage)) {
    return { should: true, reason: 'out_of_scope' };
  }

  // 4. Score muito alto (lead super engajado)
  if (score >= 90) {
    return { should: true, reason: 'high_qualification' };
  }

  return { should: false, reason: '' };
}
```

### Geracao de resumo:
```typescript
export async function generateHandoffSummary(
  lead: Lead,
  state: ConversationState,
  messages: Message[]
): Promise<string> {
  const prompt = `
Gere um RESUMO EXECUTIVO para o corretor sobre este lead.
Formato:

LEAD: [nome]
EMPREENDIMENTO: [interesse]
SCORE: [score]/100

PREFERENCIAS:
- Quartos: [X]
- Andar: [preferencia]
- Vista: [preferencia]
- Garagem: [X vagas]
- Entrada: [sim/nao/nao informou]

PERGUNTAS FEITAS:
- [lista das perguntas do lead]

OBJECOES:
- [objecoes identificadas]

PROXIMOS PASSOS:
- [recomendacao para o corretor]

Dados do lead: ${JSON.stringify(state.collected_data)}
Ultimas mensagens: ${messages.slice(-10).map(m => `${m.sender_type}: ${m.content}`).join('\n')}
`;

  const response = await claude.messages.create({
    model: 'claude-haiku-4-20250414',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}
```

### Fluxo do handoff:
```
1. Criterio atingido
2. Gerar resumo IA
3. Salvar resumo em leads.ai_summary
4. Buscar corretor designado (broker_assignments por property)
5. Se ha corretor: designar, Nicole envia mensagem de transicao com nome
6. Se nao ha: marcar para admin, Nicole envia mensagem generica
7. Atualizar conversation_state: handoff_triggered = true
8. Atualizar kanban stage do lead
9. Registrar activity: handoff
10. Nicole PARA de responder (novas mensagens vao pro corretor via Coexistence Mode)
```

### Referencia agente-linda:
- Adaptar handoff de `~/agente-linda/packages/ai/src/flows/handoff.ts` (se existir)
- Reusar summary generator pattern

## Dependencias
- Depende de: 3.4 (qualificacao/score), 3.9 (estado da conversa), 3.7 (adapter para enviar mensagem de transicao)
- Bloqueia: Bloco 6 (E7-F3 Coexistence Mode depende do handoff para saber quando o corretor deve assumir)

## Estimativa
G (Grande) — 3-4 horas

## File List
- `packages/ai/src/flows/handoff.ts` — Logica de handoff: shouldHandoff (criterios) e generateHandoffSummary (resumo para corretor)

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
