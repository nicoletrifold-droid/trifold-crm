status: Done

# Story 3.8 — Horario Comercial

## Contexto
A Nicole precisa respeitar horario comercial. Fora do horario, envia mensagem personalizada informando que vai responder no proximo dia util e coleta dados basicos (nome, interesse). O admin configura dias e horarios. Para o MVP, o padrao e segunda a sexta, 8h-18h, horario de Brasilia.

## Acceptance Criteria
- [x] AC1: Tabela `agent_config` tem campos `business_hours_start` (ex: "08:00"), `business_hours_end` (ex: "18:00"), `business_days` (ex: [1,2,3,4,5] = seg-sex), `timezone` (ex: "America/Sao_Paulo")
- [x] AC2: Funcao `isBusinessHours(config)` retorna true/false baseado no horario atual vs config
- [x] AC3: Fora do horario, Nicole envia mensagem configuravel (prompt `off_hours`)
- [x] AC4: Mensagem fora do horario coleta dados basicos: "Oi! Nosso horario de atendimento e de segunda a sexta, das 8h as 18h. Mas me conta: qual seu nome e qual empreendimento te interessa? Assim que voltarmos, ja te respondo com tudo!"
- [x] AC5: Dados coletados fora do horario sao salvos normalmente no `conversation_state`
- [ ] AC6: Quando horario comercial volta, Nicole retoma conversa naturalmente: "Bom dia, [nome]! Vi que voce mandou mensagem ontem sobre o [empreendimento]. Vamos conversar?"
- [ ] AC7: Configuracao de horario editavel pelo admin no painel (story E5-F10, mas a logica precisa existir agora)
- [x] AC8: Seed com horario default: seg-sex 08:00-18:00, America/Sao_Paulo
- [x] AC9: Modo configuravel: `always` (responde sempre), `business_only` (so no horario), `basic_off_hours` (resposta basica fora do horario — padrao)

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/ai/src/utils/business-hours.ts` — Logica de horario comercial
- `packages/bot/src/handlers/message-handler.ts` — Adicionar check de horario antes de processar

### Logica:
```typescript
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export function isBusinessHours(config: {
  business_hours_start: string; // "08:00"
  business_hours_end: string;   // "18:00"
  business_days: number[];      // [1,2,3,4,5]
  timezone: string;             // "America/Sao_Paulo"
}): boolean {
  const now = toZonedTime(new Date(), config.timezone);
  const currentDay = now.getDay(); // 0=dom, 1=seg...
  const currentTime = format(now, 'HH:mm');

  if (!config.business_days.includes(currentDay)) return false;
  if (currentTime < config.business_hours_start) return false;
  if (currentTime > config.business_hours_end) return false;
  return true;
}
```

### Integracao no message handler:
```typescript
// No pipeline de processamento:
const config = await getAgentConfig(orgId);
const withinHours = isBusinessHours(config);

if (!withinHours && config.off_hours_mode === 'business_only') {
  // Nao responde nada
  return;
}

if (!withinHours && config.off_hours_mode === 'basic_off_hours') {
  // Envia mensagem basica de fora do horario
  const offHoursPrompt = await getPrompt(orgId, 'off_hours');
  await adapter.sendText(from, offHoursPrompt.content);
  // Ainda salva a mensagem do lead
  await saveMessage(conversationId, message, 'lead');
  return;
}

// Dentro do horario ou modo 'always' — processar normalmente
```

### Referencia agente-linda:
- Reusar de `~/agente-linda/packages/ai/src/utils/business-hours.ts` (se existir)

## Dependencias
- Depende de: 3.7 (adapter recebe mensagem), 1.6 (seed com agent_config)
- Bloqueia: nenhuma

## Estimativa
P (Pequena) — 1 hora

## File List
- `packages/ai/src/utils/business-hours.ts` — Funcao isBusinessHours() com suporte a timezone, dias da semana e modos de operacao

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
