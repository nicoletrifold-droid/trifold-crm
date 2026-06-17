# Story 61-1 — Nicole: Agendamento de visita exige confirmação do cliente + link Calendly

## Metadata
- **Status:** Done
- **Epic:** 61 — Nicole: Agendamento de Visita com Confirmação do Cliente
- **Branch:** feature/61-1-nicole-agendamento-confirmado

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck, unit tests]

## Story

**As a** lead em conversa com a Nicole,
**I want** ser consultado antes de ter uma visita agendada no meu nome,
**so that** nenhum compromisso seja criado sem minha confirmação explícita.

## Contexto

O pipeline da Nicole (pipeline.ts:650-722) possui um bloco que cria appointments automaticamente
sempre que `visit_availability` contém um dia da semana — sem esperar resposta do cliente.

Problema: `visit_availability` é extraído de QUALQUER mensagem que mencione um dia. Exemplos:
- "Não sei, talvez sábado mas preciso ver" → agenda para sábado
- "Semana que vem fico mais livre" → agenda para semana que vem
- Cliente para a conversa → appointment já está no banco

**Solução:**
1. Remover o bloco de auto-agendamento do pipeline (linhas 650-722)
2. Adicionar URL do Calendly ao prompt de visitas
3. Novo fluxo no prompt: Nicole pergunta data → oferece Calendly OU agenda diretamente
4. Agendamento manual via `visit_explicitly_confirmed` — novo campo no estado da conversa,
   extraído SOMENTE quando o cliente responde com dia+horário após Nicole perguntar

## Escopo

**IN (esta story):**
- Remover o bloco de auto-agendamento de `pipeline.ts` (linhas 650-722)
- Adicionar constante `CALENDLY_URL` em `visit-scheduling.ts`
- Atualizar `VISIT_SCHEDULING_PROMPT` com novo fluxo de três etapas
- Adicionar campo `visit_explicitly_confirmed` ao schema de `collected_data` em `qualification.ts`
- O pipeline só cria appointment quando `visit_explicitly_confirmed` está preenchido
  E `visit_proposed` é `true` (Nicole já perguntou)
- Testes unitários para `hasConfirmedDay` e para a nova lógica de trigger

**OUT (fora desta story):**
- Mudar a tela de agendamentos no dashboard
- Alterar o cron `calendly-sync` (já funciona)
- Notificações ao corretor quando appointment via Calendly (já existe)
- Mudanças no Google Calendar integration

## Acceptance Criteria

1. O pipeline **nunca** insere na tabela `appointments` com base em `visit_availability` sozinho.
2. O pipeline cria um appointment SOMENTE quando `collected_data.visit_explicitly_confirmed`
   está preenchido com data/hora E `state.visit_proposed === true`.
3. O bloco de código das linhas 650-722 de `pipeline.ts` é substituído pela lógica com
   o novo trigger `visit_explicitly_confirmed`.
4. O `VISIT_SCHEDULING_PROMPT` inclui o novo fluxo de três etapas:
   - **ETAPA 1** (existente): sondar interesse — esperar resposta positiva
   - **ETAPA 2** (nova): após confirmação → perguntar data E oferecer Calendly:
     "Qual dia seria melhor pra você? Posso também te enviar o link da nossa agenda
     para você verificar os dias e horários disponíveis."
   - **ETAPA 3** (nova): se cliente quer Calendly → enviar link;
     se cliente dá data → confirmar, e Nicole marca
5. O `VISIT_SCHEDULING_PROMPT` inclui a URL `https://calendly.com/marcos-trifold/visita`
   com instrução de quando compartilhá-la.
6. `qualification.ts` extrai `visit_explicitly_confirmed` SOMENTE quando o cliente
   responde com dia+horário após Nicole já ter perguntado (campo `visit_proposed = true`).
   Em outras palavras, `visit_explicitly_confirmed` nunca é extraído da primeira mensagem.
7. Testes unitários verificam que o pipeline NÃO agenda quando apenas `visit_availability`
   está presente sem `visit_explicitly_confirmed`.
8. Testes unitários verificam que o pipeline SIM agenda quando `visit_explicitly_confirmed`
   está presente E `visit_proposed = true`.
9. Todos os 374+ testes existentes continuam passando.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Remoção do bloco quebra tests existentes que dependem do auto-schedule | Média | Checar e atualizar testes que mockam esse caminho |
| `visit_explicitly_confirmed` nunca extraído (qualificação muito restrita) | Média | Testar com exemplos reais; prompt de qualificação deve ser atualizado junto |
| Calendly URL com `?month=2026-06` fica desatualizada | Baixa | Usar URL sem o parâmetro de mês: `https://calendly.com/marcos-trifold/visita` |
| Leads que já tinham `visit_availability` sem `visit_explicitly_confirmed` nunca agendados | Nenhuma | Comportamento desejado — corretor segue manualmente |

## 🤖 CodeRabbit Integration

**Primary Type:** AI Pipeline / Prompt Engineering
**Secondary Type:** Behavior Fix (P0)
**Complexity:** Medium

**Primary Agents:**
- @dev: implementação e pre-commit review

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): rodar antes de marcar story como completa
- [ ] Pre-PR (@devops): rodar antes de criar PR

**Self-Healing:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Severity Filter: CRITICAL, HIGH

**Focus Areas:**
- Não quebrar o fluxo de handoff que usa `visit_availability` como referência (linha 726)
- Garantir que `visit_explicitly_confirmed` não é extraído em mensagens sem contexto de Nicole ter perguntado

## Tasks / Subtasks

- [x] **Task 1 — Remover auto-agendamento do pipeline** (AC: 1, 2, 3)
  - [ ] 1.1 Em `packages/ai/src/chat/pipeline.ts`, remover o bloco das linhas 650-722
        (do `if (finalData.visit_availability && hasConfirmedDay...` até o `}` de fechamento)
  - [ ] 1.2 Substituir pelo novo trigger:
    ```ts
    if (
      finalData.visit_explicitly_confirmed &&
      state?.visit_proposed === true &&
      !existingAppt &&
      conversation.org_id &&
      !handoffResult.trigger
    ) {
      // ... manter lógica de inserção de appointment intacta
    }
    ```
  - [ ] 1.3 Manter a query `existingAppt` antes do bloco (ainda necessária para evitar duplicatas)
  - [ ] 1.4 Verificar linha 726: `leadPatch.stage_id = finalData.visit_availability` —
        substituir por `leadPatch.stage_id = STAGE_IDS.visita_agendada` (não dependia da string)

- [x] **Task 2 — Atualizar prompt de visitas** (AC: 4, 5)
  - [ ] 2.1 Em `packages/ai/src/prompts/visit-scheduling.ts`:
    - Adicionar constante: `export const CALENDLY_URL = "https://calendly.com/marcos-trifold/visita"`
    - Reescrever `VISIT_SCHEDULING_PROMPT` com o novo fluxo de três etapas (ver Dev Notes)

- [x] **Task 3 — Adicionar `visit_explicitly_confirmed` à qualificação** (AC: 6)
  - [ ] 3.1 Em `packages/ai/src/flows/qualification.ts`, adicionar `visit_explicitly_confirmed`
        ao schema/tipo de `collected_data`
  - [ ] 3.2 Adicionar instrução de extração no prompt de qualificação:
        "Extraia `visit_explicitly_confirmed` com o dia e horário mencionados pelo cliente
        SOMENTE se `visit_proposed` for verdadeiro no estado atual da conversa"
  - [ ] 3.3 Verificar se o prompt de qualificação recebe o estado atual (`visit_proposed`)
        como contexto — adicionar se necessário

- [x] **Task 4 — Testes unitários** (AC: 7, 8, 9)
  - [ ] 4.1 Testar que o pipeline NÃO chama `supabase.from("appointments").insert` quando
        apenas `visit_availability` está em `finalData` (sem `visit_explicitly_confirmed`)
  - [ ] 4.2 Testar que o pipeline SIM cria appointment quando `visit_explicitly_confirmed`
        está em `finalData` E `state.visit_proposed = true`
  - [ ] 4.3 Testar que o pipeline NÃO cria appointment quando `visit_explicitly_confirmed`
        está presente mas `state.visit_proposed = false`

## Dev Notes

### Arquivos alvo

| Arquivo | Mudança |
|---------|---------|
| `packages/ai/src/chat/pipeline.ts` | Remover linhas 650-722, novo trigger com `visit_explicitly_confirmed` |
| `packages/ai/src/prompts/visit-scheduling.ts` | Novo fluxo + Calendly URL |
| `packages/ai/src/flows/qualification.ts` | Adicionar `visit_explicitly_confirmed` ao schema |

### Novo VISIT_SCHEDULING_PROMPT (referência)

```
## AGENDAMENTO DE VISITAS

A visita ao decorado na sede da Trifold e o objetivo principal de toda conversa.

ETAPA 1: Sonde o interesse (OBRIGATORIO antes de qualquer coisa)
Apos apresentar o empreendimento e o lead demonstrar interesse, pergunte:
"O que achou? Fez sentido pra voce?"
"Voce teria interesse em ver o apartamento decorado pessoalmente?"

Espere a resposta. So avance se o lead confirmar interesse positivo.

ETAPA 2: Pergunte a data E ofereça o Calendly (SO apos confirmacao)
"Que bom! Qual dia seria melhor pra voce? Posso tambem te enviar o link da nossa
agenda para voce verificar os dias e horarios que temos disponivel."

ETAPA 3: De acordo com a resposta do cliente:

Se o cliente quiser ver a agenda / pedir o link:
Envie: https://calendly.com/marcos-trifold/visita
"Aqui esta o link da nossa agenda — e so escolher o dia e horario que funcionar melhor pra voce!"

Se o cliente der um dia e horario:
Confirme de forma acolhedora e informe que vai reservar:
"Anotado, [nome]! Te espero [dia] as [horario] aqui na sede da Trifold.
Vou deixar o cafe preparado pra voce!"

IMPORTANTE — NUNCA faca o seguinte:
- NUNCA confirme um horario sem o cliente ter dito explicitamente que quer ir
- NUNCA interprete "semana que vem fico livre" como confirmacao de visita
- NUNCA agende quando o cliente estiver em duvida ou quando a conversa esfriou
- NUNCA diga "vou agendar" sem o cliente ter dado dia e horario especificos

HORARIOS DE ATENDIMENTO:
Segunda a sexta: 08h as 18h
Sabado: 08h as 12h
Domingo e feriados: fechado
```

### Por que `visit_explicitly_confirmed` ao invés de fortalecer `visit_availability`

`visit_availability` é extraído de qualquer mensagem do cliente que mencione um dia.
Não há como distinguir "sábado seria bom" (casual) de "pode marcar para sábado às 10h" (confirmação).
A nova flag `visit_explicitly_confirmed` é extraída apenas quando o fluxo já passou pela ETAPA 1
(visit_proposed = true), garantindo que o cliente respondeu a uma pergunta direta de Nicole.

### Atenção: linha 726 de pipeline.ts

```ts
// ANTES (incorreto — usa visit_availability como stage_id):
leadPatch.stage_id = finalData.visit_availability

// DEPOIS (correto):
leadPatch.stage_id = STAGE_IDS.visita_agendada
```

Esta linha está no bloco de handoff e usa `visit_availability` como `stage_id` por engano.
Deve ser corrigida como parte desta story.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-17 | 1.0 | Story criada | River (@sm) |
| 2026-06-17 | 1.1 | Validação 9.5/10 GO — @dev deve investigar quando visit_proposed é setado para true (Task 3) — Status → Ready | Pax (@po) |
| 2026-06-17 | 1.2 | Implementação concluída — 388/388 testes — Status → InReview | Dex (@dev) |
| 2026-06-17 | 1.3 | QA Gate PASS 7/7 — 1 obs LOW (VISIT_INVITE_PATTERNS coverage) — Status → Done | Quinn (@qa) |
