# Story 75-331 — Agenda no fim do formulário

**Status:** InReview
**Tipo:** Feature (rota pública)
**Epic:** 89 — Formulário de qualificação para tráfego pago
**Story ID:** 75-331
**Complexidade:** M (~5 pts — 2 endpoints públicos, 1 passo de UI, 0 migrations)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Depende de:** **75-330** (PR #437, aberto). Esta branch está **empilhada** sobre ela.
**Migrations:** **nenhuma**.

> **v2 (17/08)** — a primeira versão desta story era **L** e incluía confirmação do SDR +
> entrega à roleta. O Marcos simplificou a D3 ao ver o custo: **não há confirmação e não há
> roleta neste fluxo.** Some a tela de confirmar, some a chamada ao distribuidor e some a
> migration na `roleta_pick_and_advance`. O histórico do que foi cortado — e por quê — está em
> `docs/qa/po-validation-75-331.md`.

## Contexto

A 75-330 entregou o motor: o formulário roda, ramifica e cria o lead, terminando numa
mensagem. Esta story põe **a agenda nesse fim** — o ponto inteiro do Épico 89: o lead do
anúncio marca a visita ao decorado sozinho.

O que esta story implementa das decisões do diretor:

- **D1** — o horário escolhido **bloqueia na hora**: visita nasce `scheduled`, some da grade,
  espelha no Google Agenda.
- **D2** — a agenda aparece para **todos**. O score continua inerte.
- **D3 (revisada)** — o lead fica com o **SDR** como responsável. **Nada mais acontece
  automaticamente**: o SDR trabalha o lead e, quando fizer sentido, **transfere manualmente**
  para um corretor pelo endpoint que já existe.

### Por que a D3 encolheu (vale saber antes de "melhorar" isto depois)

A versão original esbarrava em duas coisas que a validação encontrou:

1. `distributeLeadToNextBroker` (`lib/roleta/distributor.ts:86-88`) **desiste se o lead já tem
   dono**. Carimbar o SDR e depois chamar o distribuidor devolveria `sem_corretor_disponivel`
   sem erro e sem log — a entrega à roleta pareceria implementada e nunca aconteceria.
2. A Thielly **está no pool da roleta** (medido em produção) e a RPC
   `roleta_pick_and_advance(uuid,uuid,uuid,integer)` **não tem parâmetro de exclusão** — a
   roleta poderia devolver o lead para a própria SDR que acabou de confirmá-lo.

**Sem roleta neste fluxo, os dois problemas deixam de existir.** Não é atalho: é escopo menor
que evita mexer na função mais concorrente do sistema para resolver um problema que a operação
resolve com uma transferência manual.

## ⚠️ Pré-requisito operacional (não é código)

**Medido em produção em 17/08:**

```
leads.transferir → admin: true · supervisor: true · sdr: FALSE
```

Do jeito que está, **a Thielly não consegue transferir o lead**. Duas saídas, ambas fora do
código: ligar `leads.transferir` para o perfil `sdr` na matriz de Perfis de Acesso (tela já
existente), **ou** deixar a transferência com admin/supervisor. **Decisão do Marcos.** A story
não depende dela para ser implementada, mas o fluxo não fecha na operação sem ela.

## O que já existe e vai ser REUSADO

| Peça | Onde | Observação |
|------|------|-----------|
| Grade de horários | `lib/appointments/imob-slots.ts` — `imobSlotsForDay`, `buildDayOptions`, `isValidImobSlot` | **Não olham `team`**: genéricas apesar do nome |
| Horário da empresa | `lib/roleta/business-time.ts` — `getOrgSchedule` | — |
| Grade HOUSE autenticada | `app/api/appointments/slots/route.ts` | Mesma conta que a rota pública precisa → **extrair helper, não duplicar** |
| Decorados | `lib/appointments/locations.ts` — `LOCATIONS`, `PROPERTY_MAP`, `isBookableLocation` | — |
| Criação + conflito 409 | `app/api/agendar/[token]/route.ts` | Modelo a copiar (lá é `team='imob'`; aqui `house`) |
| Espelho no Google | `lib/appointments/google-mirror.ts` — `mirrorCreate` | — |
| Etapa do lead | `@trifold/shared` — `advanceToVisitaAgendada` | Guard só-avança |
| Transferência manual | `app/api/leads/[id]/transferir/route.ts` | Já aceita `sdr` como destino (75-226); a visita acompanha via `sync-visit-owner` |

## Escopo

### IN

1. Configuração da agenda **dentro do `schema` jsonb** da 75-330 (`agenda: { ativa, local }`) — sem migration, controlada por campanha.
2. `GET /api/formulario/[token]/agenda?date=` — dias e horários livres, público por token.
3. `POST /api/formulario/[token]/agenda` — cria a visita `scheduled`, equipe `house`, dona = SDR.
4. Passo de agenda no fim do `FormRunner`, depois do envio.
5. Extração do helper de slots compartilhado entre a rota autenticada e a pública.

### OUT

- **Confirmação do SDR e entrega à roleta** — cortadas pela revisão da D3
- Remarcar/cancelar pelo lead (o `/agendar/cancelar/[token]` já existe; story própria)
- Leitura das respostas por IA → **75-332**
- Lembrete de véspera

## Acceptance Criteria

1. **AC1 — A agenda aparece para todos, no fim.** Terminada a resposta (`completa`), o passo
   seguinte é escolher dia e horário. Nenhuma resposta e nenhum score esconde a agenda (**D2**).
   Com `agenda.ativa: false` no schema, o formulário termina na mensagem final da 75-330 — isso
   é configuração, não qualificação.

2. **AC2 — Horários reais, da equipe HOUSE.** A grade sai de `getOrgSchedule` +
   `imobSlotsForDay`, filtrando ocupados por `team = 'house'` e
   `status IN ('scheduled','confirmed')`. Compromisso da IMOB **não** bloqueia horário da HOUSE
   e vice-versa (Story 81-1).

3. **AC3 — Bloqueia na hora (D1).** Criada a visita com `status = 'scheduled'`,
   `team = 'house'`, 60min, o horário **some da grade** imediatamente. Corrida entre dois leads
   no mesmo slot → **409** pedindo outro horário, como no `/api/agendar/[token]`.

4. **AC4 — Espelho e etapa, nessa ordem.** A visita espelha no Google (`mirrorCreate`) e o lead
   avança para **Visita Agendada** (`advanceToVisitaAgendada`) — **depois** de a visita estar
   gravada, nunca antes: se o agendamento falhar, o lead não pode ficar com visita fantasma
   (lição da 75-196).

5. **AC5 — O lead é do SDR.** O lead agendado fica com o usuário de perfil `sdr` ativo em
   `assigned_broker_id` (que, apesar do nome, referencia **`users(id)`** —
   `001_base_schema.sql:134`). **Nenhuma** chamada ao distribuidor da roleta neste fluxo.
   Sem SDR ativo na org, o lead fica sem responsável em vez de quebrar o agendamento.

6. **AC6 — A tela final não promete o que ninguém vai fazer.** *"Visita agendada para {dia} às
   {hora}, no {decorado}. Nossa equipe entra em contato."* Como **não existe** passo de
   confirmação, a tela **não** pode dizer "confirmaremos" — prometer confirmação que ninguém
   vai dar é fabricar no-show.

7. **AC7 — Sem agenda, nada quebra.** `agenda.ativa: false`, decorado inválido ou org sem
   horário configurado → termina na mensagem final **sem erro**. A captação do lead (75-330)
   nunca pode ser derrubada por problema de agenda.

8. **AC8 — Agendar é idempotente por sessão.** Um POST repetido da mesma sessão de formulário
   não cria duas visitas para o mesmo lead no mesmo horário.

## Notas técnicas

- **Não duplicar a lógica de slots**: extrair de `app/api/appointments/slots/route.ts` para
  `lib/appointments/`, usar nas duas. A autenticada mantém seu gate; a pública valida o token.
- **Testes:** o @qa da 75-330 recomendou, para esta story, um **teste de fluxo do POST com fake
  do Supabase** — os dois bloqueantes daquele gate eram de junção entre peças corretas, não de
  peça isolada. Fica como exigência aqui.
- **`confirmed` fica sem uso neste fluxo.** A visita segue `scheduled` até acontecer. Isso é
  consequência esperada da D3 revisada, não esquecimento — os dois status já bloqueiam a grade
  igualmente.

## Definition of Done

- [ ] Grade pública mostrando horários reais, sem enxergar compromissos da IMOB
- [ ] Visita nasce `scheduled` e o horário some da grade na hora (D1)
- [ ] Lead com o SDR como responsável e etapa Visita Agendada
- [ ] Espelho no Google conferido numa visita real
- [ ] POST repetido não duplica visita (AC8)
- [ ] Teste de fluxo do POST com fake do Supabase
- [ ] `tsc` 0 · `eslint` sem warning nova · `build` · `vitest` sem regressão
- [ ] @qa PASS antes do push
- [ ] ⚠️ **Fora do código:** decidir quem transfere (ligar `leads.transferir` para `sdr`, ou deixar com admin/supervisor)

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 17/08/2026 | @sm (River) | Story criada a partir do Épico 89. Levantada a armadilha do `assigned_broker_id` no distribuidor |
| 17/08/2026 | @po (Pax) | GO BLOQUEADO: a Thielly está no pool da roleta e a RPC não tem exclusão — a roleta devolveria o lead para ela mesma. Escalado ao Marcos |
| 17/08/2026 | Marcos | **D3 simplificada**: sem confirmação e sem roleta. SDR fica dono e transfere manualmente. Story cai de **L para M**; saem a tela de confirmar, o distribuidor e a migration na RPC |
| 17/08/2026 | @dev (Dex) | Implementada. Helper de slots extraído e a rota autenticada 81-8 passou a usá-lo (uma grade só). Agenda configurada no jsonb, sem migration |
| 17/08/2026 | @qa (Quinn) | **CONCERNS** — refatorei-a-rota-sem-teste virou `team-slots.test.ts` (7 casos). Gates verdes, 2506 testes. Parecer: `docs/qa/qa-gate-75-331.md` |
