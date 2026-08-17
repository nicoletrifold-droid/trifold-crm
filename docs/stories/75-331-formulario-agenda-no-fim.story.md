# Story 75-331 — Agenda no fim do formulário (visita nasce pré-agendada)

**Status:** Draft
**Tipo:** Feature (rota pública + ação interna nova)
**Epic:** 89 — Formulário de qualificação para tráfego pago
**Story ID:** 75-331
**Complexidade:** L (~8 pts — 2 endpoints públicos, 1 ação interna nova, 1 passo de UI, 0 migrations)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Depende de:** **75-330** (PR #437, ainda aberto). Esta branch está **empilhada** sobre ela.
**Migrations:** **nenhuma** — `appointment_status` já tem `scheduled` e `confirmed` desde a 006, e a configuração da agenda cabe no `schema` jsonb que a 75-330 criou.

## Contexto

A 75-330 entregou o motor: o formulário roda, ramifica e cria o lead. Ele termina numa
mensagem. Esta story põe **a agenda nesse fim** — que é o ponto inteiro do Épico 89: o lead
do anúncio marca a visita ao decorado sozinho, sem intermediário.

É aqui que as decisões **D1** e **D3** do diretor saem do papel:

- **D1** — o horário escolhido **bloqueia na hora**. A visita nasce `scheduled`, some da grade
  e espelha no Google Agenda.
- **D3** — o lead nasce com o **SDR** como dono; quando o SDR confirma, a visita vira
  `confirmed` e só então o lead vai para a **roleta**.
- **D2** segue valendo e não se implementa: a agenda aparece para **todos**. O score continua
  inerte.

## 🔴 A armadilha que define esta story

`distributeLeadToNextBroker` (`lib/roleta/distributor.ts:86-88`) tem este guard:

```ts
// Guard: lead já foi atribuído por execução concorrente — não redistribuir
if (lead.assigned_broker_id !== null) {
  return { status: "sem_corretor_disponivel" }
}
```

Ou seja: **se o formulário carimbar o SDR em `assigned_broker_id`, o lead nunca mais entra na
roleta.** A confirmação do SDR chamaria o distribuidor, receberia `sem_corretor_disponivel` e
**não distribuiria nada** — sem erro, sem log de falha, sem ninguém perceber. O lead ficaria
parado com o SDR para sempre, que é exatamente o oposto da D3.

A story precisa resolver isso explicitamente (AC5). Não é detalhe de implementação: é a
diferença entre a D3 funcionar e a D3 parecer que funciona.

## O que já existe e vai ser REUSADO

| Peça | Onde | Observação |
|------|------|-----------|
| Grade de horários | `lib/appointments/imob-slots.ts` — `imobSlotsForDay`, `buildDayOptions`, `isValidImobSlot` | **Não olham `team`**: são genéricas apesar do nome. Quem filtra por equipe é o chamador |
| Horário da empresa | `lib/roleta/business-time.ts` — `getOrgSchedule` | — |
| Grade HOUSE autenticada | `app/api/appointments/slots/route.ts` | A lógica de "busy da equipe + monta slots" é **a mesma** que a rota pública precisa → extrair helper, não duplicar |
| Decorados | `lib/appointments/locations.ts` — `LOCATIONS`, `PROPERTY_MAP`, `isBookableLocation` | — |
| Criação + conflito 409 | `app/api/agendar/[token]/route.ts` | Modelo a copiar (é `team='imob'`; aqui é `house`) |
| Espelho no Google | `lib/appointments/google-mirror.ts` — `mirrorCreate` | — |
| Etapa do lead | `@trifold/shared` — `advanceToVisitaAgendada` | Guard só-avança; não regride nem ressuscita perdido |
| Visita segue o dono | `lib/appointments/sync-visit-owner.ts` | Ao entregar à roleta, a visita acompanha |
| Entrega à roleta | `lib/roleta/distributor.ts` — `distributeLeadToNextBroker` | ⚠️ ver a armadilha acima |

## Escopo

### IN

1. Configuração da agenda **dentro do `schema` jsonb** da 75-330 (`agenda: { ativa, local }`) —
   sem migration, e marketing controla por campanha.
2. `GET /api/formulario/[token]/agenda?date=` — dias e horários livres, público por token.
3. `POST /api/formulario/[token]/agenda` — cria a visita `scheduled`, equipe `house`.
4. Passo de agenda no fim do `FormRunner`, depois do envio.
5. Ação de **confirmar** para o SDR: `scheduled` → `confirmed` → entrega à roleta.
6. Extração do helper de slots compartilhado entre a rota autenticada e a pública.

### OUT

- Remarcar/cancelar pelo lead (o `/agendar/cancelar/[token]` já existe e pode ser reusado numa story própria)
- Leitura das respostas por IA → **75-332**
- Lembrete de véspera da visita
- Qualquer mudança na D2 (piso de qualificação)

## Acceptance Criteria

1. **AC1 — A agenda aparece para todos, no fim.** Terminado o formulário (resposta
   `completa`), o passo seguinte é a escolha de dia e horário. Nenhuma resposta e nenhum score
   esconde a agenda (**D2**). Se `agenda.ativa` for `false` no schema, o formulário termina na
   mensagem final como na 75-330 — e isso é configuração, não qualificação.

2. **AC2 — Horários reais, da equipe HOUSE.** A grade sai de `getOrgSchedule` +
   `imobSlotsForDay`, filtrando ocupados por `team = 'house'` e
   `status IN ('scheduled','confirmed')`. Compromisso da IMOB **não** bloqueia horário da
   HOUSE (Story 81-1) e vice-versa.

3. **AC3 — Bloqueia na hora (D1).** Escolhido o horário, a visita é criada com
   `status = 'scheduled'`, `team = 'house'`, duração 60min, e o horário **some da grade**
   imediatamente. Corrida entre dois leads no mesmo slot → **409** com mensagem pedindo outro
   horário (mesmo comportamento do `/api/agendar/[token]`).

4. **AC4 — Espelho e etapa.** A visita criada espelha no Google Agenda (`mirrorCreate`) e o
   lead avança para **Visita Agendada** via `advanceToVisitaAgendada` — **depois** de a visita
   estar gravada, nunca antes (se o agendamento falhar, o lead não pode ficar carimbado com
   visita fantasma; é a lição da Story 75-196).

5. **AC5 — 🔴 O lead é do SDR, e AINDA ASSIM chega na roleta depois.** O lead fica com o SDR
   como responsável até a confirmação. Mas a entrega à roleta **tem** de funcionar depois:
   dado o guard de `assigned_broker_id` no distribuidor, a story precisa
   **limpar `assigned_broker_id` imediatamente antes** de chamar
   `distributeLeadToNextBroker`, ou o lead nunca sai do SDR.

   `[@po 17/08]` Apesar do nome, **`assigned_broker_id` referencia `users(id)`**
   (`001_base_schema.sql:134`), não `brokers(id)` — carimbar o usuário do SDR funciona direto.

   **Teste obrigatório:** um lead que agendou pelo formulário, após a confirmação do SDR,
   **muda de responsável**. Um teste que só verifique `status = 'confirmed'` não vale — é
   justamente a parte silenciosa que precisa de prova.

   🔴 `[@po 17/08]` **PENDENTE DE DECISÃO — ver `docs/qa/po-validation-75-331.md` §2.** A
   Thielly está no pool da roleta (medido em produção) e a RPC
   `roleta_pick_and_advance(uuid,uuid,uuid,integer)` **não tem parâmetro de exclusão**: a
   roleta pode devolver o lead para a própria SDR que acabou de confirmá-lo. O @dev NÃO
   começa antes desta resposta — as saídas (a)/(b)/(c) mudam se há migration e qual é o
   tamanho da story.

6. **AC6 — Confirmar é ação de quem pode.** A confirmação (`scheduled` → `confirmed`) é
   exposta ao SDR e aos gestores, com o mesmo gate da governança de agenda já existente
   (`lib/appointments/governance.ts`). Corretor comum não confirma visita que não é dele.

7. **AC7 — Confirmar é idempotente.** Confirmar duas vezes não distribui o lead duas vezes.
   A transição só dispara a entrega à roleta quando o status **era** `scheduled`.

8. **AC8 — A visita acompanha o novo dono.** Distribuído o lead, a visita passa ao corretor
   que assumiu (`sync-visit-owner`), sem duplicar nem perder o compromisso no Google.

9. **AC9 — O lead sabe o que aconteceu.** Tela final: *"Visita pré-agendada para {dia} às
   {hora}, no {decorado}. Nossa equipe confirma com você em breve."* — **"pré-agendada"**, não
   "confirmada": quem confirma é o SDR, e prometer confirmação que ainda não houve é criar
   no-show.

10. **AC10 — Sem agenda, nada quebra.** Formulário com `agenda.ativa: false`, sem decorado
    válido, ou org sem horário configurado termina na mensagem final **sem erro** — a captação
    do lead (75-330) não pode ser derrubada por um problema de agenda.

## Notas técnicas

- **Não duplicar a lógica de slots.** A rota autenticada
  (`app/api/appointments/slots/route.ts`) e a pública precisam da mesma conta. Extrair para
  `lib/appointments/` e usar nas duas — a rota autenticada continua com seu gate de
  capability, a pública valida o token.
- **Onde vive a ação de confirmar:** hoje **nenhuma tela** promove um compromisso para
  `confirmed` (o único `status: "confirmed"` do código está em
  `app/api/leads/[id]/visit-feedback/route.ts:216`, que é outro fluxo). É construção nova, não
  reuso — considerar isso na estimativa.
- **Decisão pendente para o @po:** com D2 (todos agendam), o decorado pode receber visita de
  lead muito fora do perfil. A story **não** trata disso de propósito — é o custo aceito da
  D2. Se virar problema, o instrumento já existe: o score gravado pela 75-330.
- **Testes:** as decisões novas (o slot está livre? a transição pode disparar a roleta?) vão
  para função pura testável, como na 75-330. O @qa da 75-330 recomendou, para esta story, um
  **teste de fluxo do POST com fake do Supabase** — os dois bloqueantes daquele gate eram de
  junção entre peças corretas, não de peça isolada.

## Definition of Done

- [ ] Grade pública mostrando horários reais, sem enxergar compromissos da IMOB
- [ ] Visita nasce `scheduled` e o horário some da grade na hora (D1)
- [ ] **Teste provando a troca de responsável após a confirmação** (AC5) — não só o status
- [ ] Confirmar duas vezes não distribui duas vezes (AC7)
- [ ] Espelho no Google conferido numa visita real
- [ ] `tsc` 0 · `eslint` sem warning nova · `build` · `vitest` sem regressão
- [ ] @qa PASS antes do push

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 17/08/2026 | @sm (River) | Story criada a partir do Épico 89 (D1/D2/D3). Levantada a armadilha do `assigned_broker_id` no distribuidor, que define a AC5 |
