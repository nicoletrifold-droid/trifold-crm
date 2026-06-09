# ADR-001: Fonte de Verdade para `leads.assigned_broker_id`

- **Status:** Proposed — aguardando sign-off de produto (Gabriel) na decisão de negócio (ver "Decisão Pendente do Dono")
- **Recomendação técnica:** @architect (Aria) — Accepted (ver "Sign-off do Architect")
- **Data:** 2026-06-09
- **Story:** 51-6 (spike/ADR) — Epic 51 (Handoff Nicole → Corretor)
- **Decisores:** @architect (Aria) recomenda; dono do produto (Gabriel) aprova a política de negócio
- **Stories afetadas:** 51-1, 51-3, 51-4

---

## Contexto

O campo `leads.assigned_broker_id` armazena o **`user_id`** do corretor responsável pelo lead (não o `brokers.id` — confirmado na migration `085` e em `notify-appointment.ts:24`). Esse valor é **load-bearing** para três comportamentos críticos:

1. **RLS (migration `085_fix_broker_rls_leads_only_own.sql`):** corretor enxerga e edita APENAS os leads onde `assigned_broker_id = (brokers.user_id do corretor logado)`. Admin/supervisor veem tudo. **Trocar o `assigned_broker_id` REMOVE imediatamente a visibilidade do corretor anterior** — ele perde o lead do pipeline, dos alertas e do chat.
2. **Ownership do chat do corretor (Story 51-1):** o envio de mensagem (`/api/leads/[id]/send-message/route.ts:86`) valida `lead.assigned_broker_id !== appUser.id` para autorizar o corretor a responder. Se o valor mudar, o corretor que estava conversando perde o direito de responder.
3. **Notificações de agendamento/follow-up (Stories 51-3, 51-4):** a notificação de visita e o alerta de follow-ups esgotados são endereçados ao corretor de `assigned_broker_id`.

### As fontes de escrita (mapeamento completo do spike — AC1)

Foram encontrados **7 call-sites que escrevem** `assigned_broker_id` (INSERT ou UPDATE), agrupados por origem:

#### Grupo A — Roleta (atribuição automática na ENTRADA)
| # | Local | Tipo | Condição |
|---|-------|------|----------|
| A1 | `packages/web/src/lib/roleta/distributor.ts:135` | UPDATE | "Priorizar lead ativo": mesmo telefone já tem corretor em lead ativo → roteia para ele (continuidade) |
| A2 | `supabase/migrations/069_roleta_fixes.sql:119` (RPC `roleta_pick_and_advance`, chamada em `distributor.ts:200`) | UPDATE | round-robin via advisory lock, respeita horário comercial e `max_leads_per_day` |

A roleta é disparada em `packages/web/src/app/api/webhook/whatsapp/route.ts:550` (apenas para leads **brand-new** do WhatsApp) e na rota `api/roleta/distribute/route.ts`. **Telegram NÃO dispara a roleta.**

#### Grupo B — Corretor primário do imóvel (pipeline da Nicole)
| # | Local | Tipo | Condição |
|---|-------|------|----------|
| B1 | `packages/ai/src/chat/pipeline.ts:621` | UPDATE (via `leadPatch`) | **Agendamento de visita**: busca `broker_assignments.is_primary` do imóvel de interesse → sobrescreve `assigned_broker_id`. Só seta `if (assignedBrokerId)` (ou seja, só se ACHOU um primário) |
| B2 | `packages/ai/src/chat/pipeline.ts:659` | UPDATE (via `leadPatch`) | **Handoff (gatilho de qualificação)**: idem, busca primário do `identifiedPropertyId` → sobrescreve. Só seta `if (brokerId)` |

#### Grupo C — Ações humanas (admin/supervisor/corretor)
| # | Local | Tipo | Condição |
|---|-------|------|----------|
| C1 | `packages/web/src/app/api/leads/[id]/assign/route.ts:44` | UPDATE | Atribuição manual — admin/supervisor only (`requireRole`) |
| C2 | `packages/web/src/app/api/leads/[id]/handoff/route.ts:72` | UPDATE | Handoff manual — admin/supervisor only, `if (body.broker_id)` |
| C3 | `packages/web/src/app/api/leads/bulk/route.ts:32` | UPDATE | Reatribuição em massa — admin only |
| C4 | `packages/web/src/app/api/leads/route.ts:109` + `[id]/route.ts:81-92` + `dashboard/leads/new/page.tsx:68` | INSERT/UPDATE | Criação/edição manual de lead (corretor só atribui a si mesmo) |

> O cron de follow-up (`api/cron/followup/route.ts:373`) apenas **lê** `assigned_broker_id`; não escreve.

### O problema central (conflito B sobrescreve A)

Hoje **não existe nenhum guard de precedência** entre os grupos. O `leadPatch.assigned_broker_id` em B1/B2 é um `UPDATE` cego: sobrescreve qualquer valor anterior (da roleta ou de uma atribuição humana) toda vez que a Nicole identifica um imóvel com corretor primário no momento do agendamento/handoff. Como o `assigned_broker_id` é apenas a coluna comum, **o último UPDATE vence** — o que, combinado com a RLS `085`, troca silenciosamente o dono do lead.

---

## Cenários de conflito mapeados

| # | Cenário | Comportamento atual | Avaliação |
|---|---------|---------------------|-----------|
| 1 | Lead entra via WhatsApp → roleta atribui **Corretor A** → lead demonstra interesse no imóvel X (primário = **Corretor B**) → Nicole agenda | B1 **sobrescreve A→B**. A perde o lead (RLS), B recebe a notificação de agendamento (51-3), comissão/atividade ficam inconsistentes | **BUG.** Quebra continuidade de relacionamento e a Story 51-1 (A estava conversando) |
| 2 | Re-agendamento: lead já tem visita; Nicole reativa e agenda de novo | O guard `!existing future appointment` (pipeline.ts:575-582) impede recriar o appointment, **então B1 não roda de novo** — bom. Mas se o appointment anterior foi cancelado/passou, pode reatribuir | **Parcialmente protegido** por acaso, não por design |
| 3 | Lead sem imóvel identificado (`propertyId` null) no agendamento | B1 não acha primário → `assignedBrokerId` fica null → o `if (assignedBrokerId)` **não sobrescreve**. Roleta preservada | **OK hoje** (efeito colateral feliz do guard `if`) |
| 4 | Imóvel sem `broker_assignments.is_primary` (APPOINTMENT_NO_BROKER) | `assignment` null → não sobrescreve; emite warn `APPOINTMENT_NO_BROKER` | **OK** (atribuição da roleta preservada) |
| 5 | `is_primary` aponta para corretor inativo/offline | B1/B2 **não verificam status** do corretor. Atribui mesmo assim → lead vai para corretor que não responde | **Risco.** Continuidade pode ir para corretor inativo |
| 6 | Telegram (sem roleta): lead entra, Nicole agenda imóvel X | `assigned_broker_id` começa NULL (sem roleta). B1 atribui o primário do imóvel | **Desejado** — é a única atribuição automática que o Telegram tem hoje |
| 7 | Admin atribui manualmente Corretor A (C1) → depois Nicole agenda imóvel de B | B1 **sobrescreve a decisão humana**. A intenção explícita do admin é perdida | **BUG grave.** Decisão humana deve ter precedência máxima |
| 8 | Corretor humano já assumiu o chat (51-1, `is_ai_active=false`) → Nicole não roda mais; mas se IA for reativada e agendar | Se a IA for reativada, B1 pode reatribuir e tirar o lead do corretor que já interagiu | **Risco** ligado a 51-1 |

**Conclusão do spike (AC4):** os cenários 1, 5, 7 e 8 são **bugs reais de reatribuição silenciosa**, não apenas teóricos. Cenários 3, 4 e 6 funcionam por efeito colateral do `if (assignedBrokerId)`, não por uma regra de precedência intencional. Recomenda-se abrir story de implementação separada (ver Follow-ups) — esta story está limitada ao ADR.

---

## Opções consideradas

### Opção 1 — Roleta sempre vence (primeiro corretor "dono"; B nunca sobrescreve)
- **Prós:** máxima continuidade de relacionamento; coerente com RLS `085` e Story 51-1; respeita o investimento do corretor que atendeu desde o início; o "priorizar lead ativo" da roleta já sinaliza que continuidade é valor do produto.
- **Contras:** o especialista no imóvel (corretor primário) pode não ser quem fecha; em imóveis com corretor dedicado, perde-se a especialização.

### Opção 2 — Corretor do imóvel sempre vence (B sobrescreve A — comportamento atual)
- **Prós:** especialização no produto; quem conhece o imóvel conduz a visita.
- **Contras:** **é o comportamento que gera os bugs 1, 7, 8**; quebra continuidade; sobrescreve até decisão humana; incoerente com 51-1 (corretor que conversava perde o lead).

### Opção 3 — Híbrido / First-write-wins com guard (recomendada)
- **Regra:** `assigned_broker_id` é definido pela **primeira** atribuição válida e **não é sobrescrito automaticamente**. A Nicole (B1/B2) só seta `assigned_broker_id` **quando ele está NULL**. Atribuições humanas (C1/C2/C3) sempre podem sobrescrever (são intencionais).
- **Prós:** elimina os bugs 1, 7, 8; preserva o caso Telegram (cenário 6: NULL → B preenche); preserva cenários 3/4 por design e não por acaso; coerente com RLS e 51-1; mínima mudança de código (um guard `if NULL`).
- **Contras:** o corretor primário do imóvel pode não ser o atribuído — mas ele ainda pode ser notificado do agendamento (a notificação 51-3 pode usar o primário do imóvel como "corretor da visita" sem mudar o **dono** do lead, se o produto quiser separar os dois papéis).

### Opção 4 — Política "não trocar corretor que já interagiu"
- Variante de 3, mais granular: bloquear sobrescrita automática apenas se houver atividade humana registrada no lead. Mais complexa (precisa consultar `activities`/`messages`), maior custo, ganho marginal sobre a Opção 3. Descartada como default.

---

## Decisão (recomendada)

**Adotar a Opção 3 (Híbrido / First-write-wins com guard), com a seguinte regra de precedência:**

> **Precedência de atribuição de `leads.assigned_broker_id` (do mais forte para o mais fraco):**
> 1. **Atribuição humana explícita** (admin/supervisor manual, handoff manual, bulk, criação manual) — SEMPRE vence e SEMPRE pode sobrescrever.
> 2. **Roleta de entrada** (round-robin / priorizar lead ativo) — define a atribuição **inicial** do lead.
> 3. **Corretor primário do imóvel (pipeline da Nicole — agendamento/handoff)** — só atribui quando `assigned_broker_id` está **NULL**. **NUNCA sobrescreve** um corretor já atribuído.

**Fonte de verdade:** `leads.assigned_broker_id` permanece a única fonte de verdade para *ownership* do lead. O **corretor primário do imóvel** (`broker_assignments.is_primary`) é fonte de verdade apenas para "quem é o especialista do imóvel" — um conceito separado de ownership, que pode ser usado para *notificação* da visita (51-3) sem alterar o dono.

**Separação de papéis (recomendação para 51-3):** quando o corretor da visita (primário do imóvel) for diferente do dono do lead, notifique **ambos** (ou, no mínimo, o dono), em vez de transferir o lead. Isso resolve o trade-off continuidade × especialização sem perda silenciosa.

---

## Consequências

### Impacto nas stories do Epic 51
- **51-1 (Chat bidirecional do corretor):** o ownership do chat (`send-message:86`) fica estável — o corretor que assumiu não perde o lead por uma ação automática da Nicole. **Comportamento esperado:** `assigned_broker_id` só muda por ação humana após a primeira atribuição.
- **51-3 (Notificar corretor do agendamento):** a notificação deve ser endereçada ao **dono atual do lead** (`assigned_broker_id`); opcionalmente também ao corretor primário do imóvel como "corretor da visita". O pipeline **não deve mais reatribuir** o lead ao primário — apenas notificar.
- **51-4 (Notificar follow-ups esgotados):** o alerta vai para o dono estável do lead; sem risco de a notificação "pular" para outro corretor por reatribuição silenciosa.

### Impacto em comissões/relatórios
- Com a atribuição estável, `assigned_broker_id` passa a refletir consistentemente quem acompanhou o lead → relatórios por corretor (`analytics-report-data.ts`, `dashboard/analytics`) e qualquer cálculo futuro de comissão ficam confiáveis. O comportamento atual (Opção 2) gera divergência entre quem atendeu e quem "recebe" o lead.

### Impacto técnico / RLS
- A regra é coerente com a RLS `085`: como a sobrescrita automática deixa de existir, um corretor não perde acesso ao lead sem ação humana.
- Mudança de código é mínima e localizada (guard no pipeline). Sem mudança de schema.

### Riscos da decisão
- Se um imóvel tiver corretor dedicado e o produto realmente quiser que o especialista assuma o lead na visita, a Opção 3 exigirá ação humana (handoff manual) ou a notificação dupla. Esse é o trade-off explícito que precisa do aval do dono (ver abaixo).

---

## Decisão Pendente do Dono (produto — Gabriel)

A decisão **técnica** (eliminar a sobrescrita silenciosa) é clara e recomendada. A decisão **de negócio** que precisa do seu aval:

> **Quando um lead já tem corretor (da roleta) e a Nicole agenda visita a um imóvel cujo corretor primário é OUTRO, o que deve acontecer?**
> - (a) **Manter o corretor original como dono** e apenas **notificar** o corretor primário do imóvel sobre a visita (recomendado — Opção 3). *Continuidade > especialização.*
> - (b) Transferir o lead para o corretor do imóvel (comportamento atual — Opção 2). *Especialização > continuidade.*
> - (c) Outra regra (ex.: transferir só se o corretor original estiver inativo).

Enquanto não houver sign-off do dono, este ADR fica **Proposed**. A recomendação do architect é a opção **(a)**.

---

## Sign-off do Architect (Aria)

Revisei os 7 call-sites de escrita, a RLS `085`, o RPC `roleta_pick_and_advance` (069) e a interação com 51-1/51-3/51-4. **Aprovo tecnicamente a Opção 3.** O ponto crítico é que a sobrescrita em `pipeline.ts:621` e `:659` é um UPDATE cego sem guard de precedência — esse é o defeito a corrigir. A separação entre "dono do lead" (`assigned_broker_id`) e "especialista do imóvel" (`broker_assignments.is_primary`) é a peça conceitual que destrava o trade-off continuidade × especialização. — @architect (Aria), 2026-06-09

---

## Follow-ups de implementação (story futura — NÃO nesta story)

> Escopo desta story 51-6 é só o ADR. As mudanças abaixo são recomendações para uma story de implementação separada (sugestão de título: "51-7 — Guard de precedência em assigned_broker_id").

1. **Guard no pipeline (B1/B2):** em `pipeline.ts:621` e `:659`, só setar `leadPatch.assigned_broker_id` quando o lead atual tiver `assigned_broker_id === null`. Carregar o valor atual de `assigned_broker_id` junto de `currentLead` (já há um fetch de lead no pipeline) e condicionar a atribuição.
2. **Notificação sem reatribuição (51-3):** desacoplar a notificação da visita da atribuição — notificar o dono atual e (opcional) o corretor primário do imóvel, sem trocar o `assigned_broker_id`.
3. **Telefone/continuidade:** manter o comportamento "priorizar lead ativo" da roleta (A1) — já alinhado com a decisão.
4. **(Opcional) Checar status do corretor** antes de atribuir o primário do imóvel quando o lead estiver NULL (cenário 5) — evitar atribuir a corretor inativo.
5. **(Opcional) Auditoria:** registrar toda mudança de `assigned_broker_id` em `activities` (hoje só C1 registra `broker_assigned`; B1/B2 e a roleta não logam a *troca* de dono de forma uniforme) — facilita investigar reatribuições.
6. **Bug histórico (AC4):** abrir issue para auditar leads que já sofreram reatribuição silenciosa (query em `lead_distribution_log` vs `assigned_broker_id` atual) — fora do escopo de implementação do guard.
