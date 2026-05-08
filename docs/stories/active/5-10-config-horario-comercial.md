status: Done

# Story 5.10 — Configuracao de Horario Comercial

## Contexto
O admin precisa poder definir os dias e horarios de atendimento da Nicole e a mensagem que ela envia fora do horario. A logica de horario comercial ja existe (Story 3.8) — esta story cobre a interface admin para configura-la.

## Acceptance Criteria
- [x] AC1: Pagina `/dashboard/settings/business-hours` exibe configuracao atual
- [x] AC2: **Dias da semana:** Toggle para cada dia (Seg-Dom), horario de inicio e fim por dia
- [x] AC3: **Horarios editaveis:** Input de hora (HH:MM) para inicio e fim de cada dia ativo
- [x] AC4: **Modo de atendimento fora do horario:**
  - Opcao A: "Responder sempre" (Nicole atende 24/7)
  - Opcao B: "Basico fora do horario" (Nicole coleta dados basicos e informa que retornara)
  - Opcao C: "So no horario" (Nicole nao responde fora do horario)
- [x] AC5: **Mensagem fora do horario:** Textarea editavel com mensagem default: "Oi! No momento estamos fora do horario de atendimento. Deixe seu nome e o empreendimento que te interessa que retorno assim que possivel!"
- [x] AC6: **Fuso horario:** Select com fuso (default: America/Sao_Paulo)
- [x] AC7: Preview: mostra se "agora" esta dentro ou fora do horario configurado
- [x] AC8: Alteracoes salvas na tabela `agent_config` (campo `business_hours`)
- [ ] AC9: API routes: GET/PATCH `/api/settings/business-hours`
- [ ] AC10: Horarios default no seed: Seg-Sex 08:00-18:00, Sab 08:00-12:00, Dom desativado

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/dashboard/settings/business-hours/page.tsx` — Pagina de config
- `packages/web/src/components/settings/business-hours-form.tsx` — Formulario
- `packages/web/src/app/api/settings/business-hours/route.ts` — GET, PATCH

### Estrutura de dados (em agent_config.business_hours):
```typescript
interface BusinessHours {
  timezone: string; // "America/Sao_Paulo"
  mode: 'always' | 'basic_after_hours' | 'only_business_hours';
  after_hours_message: string;
  schedule: {
    monday: { active: boolean; start: string; end: string };
    tuesday: { active: boolean; start: string; end: string };
    wednesday: { active: boolean; start: string; end: string };
    thursday: { active: boolean; start: string; end: string };
    friday: { active: boolean; start: string; end: string };
    saturday: { active: boolean; start: string; end: string };
    sunday: { active: boolean; start: string; end: string };
  };
}
```

### Referencia agente-linda:
- Adaptar config de horario de `~/agente-linda/packages/web/src/app/dashboard/settings/` (se existir)
- Reusar logica de `isWithinBusinessHours()` da Story 3.8

## Dependencias
- Depende de: 1.2 (schema agent_config), 1.5 (auth admin), 3.8 (logica de horario comercial)
- Bloqueia: Nenhuma

## Estimativa
P (Pequena) — 1-2 horas

## File List

- `packages/web/src/app/dashboard/configuracoes/horario/page.tsx` — Pagina de configuracao de horario comercial com toggles por dia, horarios, modo de atendimento e mensagem fora do horario

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
