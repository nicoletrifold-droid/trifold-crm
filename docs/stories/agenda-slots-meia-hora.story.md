# Story — Agenda: início de compromisso a cada 30min (duração segue 1h)

**Status:** Done (PR #276 merged em ea8354ef; deploy prod Vercel OK 2026-07-23)
**Tipo:** Feature (ajuste de UX/regra de agenda)
**Epic:** Agenda / Epic 81 (HOUSE × IMOB)
**Relacionado:** Stories 81-4/81-8/81-9 (grade de slots compartilhada), 75-103 (revalida conflito ao remarcar), [[project-agenda-house-imob]]
**Complexidade:** S (1 lib + 3 guards de rota + 1 grid CSS + testes; sem migration)

## Pedido (Marcos, 2026-07-23)
> "Hoje nossos agendamentos são de 1 hora e isto está perfeito. Porém aparece para marcar
> somente hora fechada (8:00, 9:00, 10:00). Seria possível ainda ser atendimento de 1 hora,
> mas na agenda ter horários disponíveis de meia em meia hora (8:00, 8:30, 9:00, 9:30)?"

## Regra
- Duração do compromisso: **1h, inalterada** (`duration_minutes: 60` forçado no servidor).
- Início do slot: **passo de 30min** (`SLOT_STEP_MIN = 30` em `imob-slots.ts`).
- O compromisso precisa **caber inteiro no expediente**: início + 60min ≤ fechamento.
  Com fechamento em hora cheia o último slot não muda (fecha 18:00 → último início 17:00);
  17:30 só aparece se o expediente fechar 18:30+.
- Conflito continua por **sobreposição de intervalos** intra-equipe (`governance.ts` —
  nenhuma mudança): visita 14:00–15:00 bloqueia inícios 13:30/14:00/14:30.

## Superfícies cobertas (mesma grade, gerador único)
- Modal "Novo Compromisso" da agenda interna (/dashboard/agenda e /broker/agenda).
- Link público de agendamento por imobiliária (/agendar/[token]).
- Guards de servidor que forçavam `:00` agora alinham a `:00/:30` (snap para baixo):
  POST /api/appointments, PATCH /api/appointments/[id] (remarcar), POST /api/agendar/[token].

## FORA de escopo (registrado)
- **Nicole**: já ACEITA horário quebrado pedido pelo lead (parseHour entende "15h30" e o
  insert não faz snap), mas as ALTERNATIVAS que ela oferece seguem de hora em hora
  (`packages/ai/src/flows/visit-slot.ts`, laços hora-a-hora + expediente hardcoded 8–18/8–12
  divergente do roleta_schedule). Unificar fica para uma story própria se o Marcos quiser.

## File List
- `packages/web/src/lib/appointments/imob-slots.ts` (SLOT_STEP_MIN=30; grade + isValidImobSlot)
- `packages/web/src/lib/appointments/imob-slots.test.ts` (19 slots/dia útil; sobreposição parcial)
- `packages/web/src/app/api/appointments/route.ts` (snap :00/:30)
- `packages/web/src/app/api/appointments/[id]/route.ts` (snap :00/:30 ao remarcar)
- `packages/web/src/app/api/agendar/[token]/route.ts` (snap :00/:30)
- `packages/web/src/components/appointments/new-appointment-modal.tsx` (grid sm:6 colunas)
- `docs/stories/agenda-slots-meia-hora.story.md` (esta)

## Tasks
- [x] Gerador com passo 30min + validação alinhada
- [x] Guards de servidor (3 rotas)
- [x] Grid do modal
- [x] Testes atualizados (sobreposição parcial 13:30/14:30 coberta)
- [x] QA gate: vitest (1161 ✅) + lint + type-check + build
- [x] @devops: push/deploy (PR #276, prod success)
