# Story 64-1 — Classificação de contato (lead vs não-lead) antes da roleta

## Metadata
- **Status:** Done
- **Epic:** 64 — Nicole: Triagem de Contatos Não-Lead
- **Branch:** feature/64-1-classificacao-contato-nao-lead-roleta
- **Complexidade:** M (3 pontos) — 1 arquivo novo + 1 gate no webhook + sync de dados

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck, unit-tests]

## Story

**As a** gestor da imobiliária,
**I want** que contatos que não são compradores de imóvel (candidatos a emprego, parcerias, fornecedores, mídia) não sejam distribuídos para corretores,
**so that** a fila da roleta fique limpa e os corretores só recebam leads reais de compra.

## Contexto

Casos reais em produção (18/06/2026):
- Lead "Massaroni" enviou um **pitch profissional** ("15 anos de experiência... minha experiência profissional possa ajudar essa empresa") — candidato a emprego — e foi **distribuído para a corretora Ana**.
- A primeira mensagem **não continha nenhuma palavra-chave** detectável (`currículo`, `vaga de emprego` etc.), então o filtro de keyword da Story anterior (`isNonLeadContact`) não pegou.
- A Nicole (LLM) entendeu perfeitamente que era candidato ("Que currículo impressionante", "este canal é focado em atendimento comercial") — **a IA acerta onde a keyword falha**.

**Causa raiz:** a decisão "isso é um lead?" hoje é feita por palavra-chave burra (`isNonLeadContact`), enquanto a IA, que entende de verdade, não participa da decisão de distribuição.

**Por que não "distribuir e desfazer":** ao distribuir, `distributeLeadToNextBroker` notifica o corretor (push/email/WhatsApp) e consome a vez dele na roleta (`roleta_pick_and_advance`). Reverter geraria notificação fantasma e quebraria a justiça da fila. Logo, é obrigatório **classificar ANTES de distribuir**.

**Bug correlato (DB shadow):** os guardrails da Nicole moram na tabela `agent_prompts` (slug `guardrails`) e o código (`buildStaticSystemContent`) usa `overrides?.guardrails || GUARDRAILS_PROMPT`. A linha do banco (editada em 2026-04-01) **não tem** o telefone comercial nem o RN10 — então as edições de guardrail feitas no código nunca chegam à produção. Por isso a Nicole ainda responde "e-mail/site" em vez de `(44) 3222-9698`.

**Arquivos alvo:**
- `packages/ai/src/flows/classify-contact.ts` (NOVO)
- `packages/ai/src/flows/index.ts` (export)
- `packages/web/src/app/api/webhook/whatsapp/route.ts` (~linha 600, bloco `_brand_new`)
- Tabela `agent_prompts`, slug `guardrails` (sync de dados)

## Escopo

**IN (esta story):**
- Classificador `classifyContactIntent(anthropic, message, opts)` em `@trifold/ai`, modelo Haiku, retornando `{ isLead, category, reason }`.
- Camada 1 (fast-path): se `isNonLeadContact(message)` (keyword) → não-lead, sem chamar LLM.
- Camada 2: caso contrário, Haiku classifica. Hint `hasDocument` quando há anexo de documento.
- Default seguro: qualquer erro/timeout/parse inválido → `isLead: true` (nunca bloquear comprador real).
- Webhook: no bloco de lead novo (`_brand_new`), classificar ANTES de `distributeLeadToNextBroker`. Distribuir só se `isLead`. Quando não-lead, logar `roleta_skip_non_lead` com `category` e `reason`.
- Sync do guardrail no banco (`agent_prompts.guardrails`) com o conteúdo atual do código (inclui RN10 + telefone).

**OUT (fora desta story):**
- Suprimir a automação de boas-vindas (`triggerAutomations`) para não-leads — decisão adiada (opção B do usuário).
- Reclassificar contatos antigos já distribuídos.
- Classificar mensagens subsequentes (só a 1ª — `_brand_new`).
- Migrar o `shouldHandoff` para LLM (continua usando keyword `isNonLeadContact`).

## Acceptance Criteria

1. **Dado** a mensagem do Massaroni ("...15 anos de experiência... minha experiência profissional possa ajudar essa empresa"), **quando** classificada, **então** `isLead === false` (sem keyword, via Haiku).
2. **Dado** "esse apê tem vaga de garagem?", **quando** classificada, **então** `isLead === true` (vaga de garagem é interesse de compra).
3. **Dado** "quero enviar meu currículo", **quando** classificada, **então** `isLead === false` via fast-path de keyword, **sem** chamada ao Haiku.
4. **Dado** falha/timeout do Haiku, **quando** classificada, **então** `isLead === true` (default seguro) e a distribuição ocorre normalmente.
5. No webhook, um contato classificado como não-lead **não** chama `distributeLeadToNextBroker` e gera log `roleta_skip_non_lead` com `category` e `reason`.
6. Um contato classificado como lead distribui normalmente (sem regressão).
7. A linha `agent_prompts.guardrails` passa a conter `3222-9698` e `RN10`.
8. Testes unitários do classificador passam; typecheck dos pacotes `ai` e `web` sem erros nos arquivos tocados.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Haiku classifica comprador como não-lead (falso positivo) | Baixa | Prompt enfático: "na dúvida é LEAD"; default seguro em erro |
| Latência extra na 1ª mensagem | Baixa | Roda em `after()` (async, fora do caminho do HTTP 200); só 1ª msg por lead |
| Custo de chamada Haiku por lead novo | Baixa | Haiku é barato; fast-path keyword evita LLM nos óbvios |
| Anexo-só (currículo PDF sem texto) escapa | Média | Hint `hasDocument` no prompt; cobertura total fica para iteração futura |
| Sync do guardrail sobrescreve edição manual no banco | Baixa | Verificar diff antes; conteúdo do código é o canônico |

## Tasks / Subtasks

- [x] **Task 0 — Sync guardrail no banco** (AC: 7)
  - [x] 0.1 Atualizar `agent_prompts.guardrails` com `GUARDRAILS_PROMPT` atual (RN10 + telefone)
  - [x] 0.2 Confirmar `content ILIKE '%3222-9698%'` e `'%RN10%'` → ambos `true`

- [x] **Task 1 — Classificador `classify-contact.ts`** (AC: 1, 2, 3, 4)
  - [x] 1.1 `classifyContactIntent(anthropic, message, opts?)` com fast-path keyword
  - [x] 1.2 Prompt Haiku (lead vs emprego/parceria/midia/fornecedor/outro; "vaga"=garagem=lead)
  - [x] 1.3 Parser tolerante (strip markdown, default seguro em erro)
  - [x] 1.4 Export em `flows/index.ts`

- [x] **Task 2 — Webhook gate** (AC: 5, 6)
  - [x] 2.1 Classificar antes de `distributeLeadToNextBroker` no bloco `_brand_new`
  - [x] 2.2 Distribuir só se `isLead`; logar `roleta_skip_non_lead` caso contrário
  - [x] 2.3 `hasDocument` derivado de `asyncMediaBlock?.type === "document"`

- [x] **Task 3 — Testes + typecheck** (AC: 8)
  - [x] 3.1 Testes unitários `classify-contact.test.ts` — 11 testes passando
  - [x] 3.2 `tsc --noEmit` nos pacotes ai e web — zero erros

## Dev Notes

### Convenção de chamada Haiku
Seguir `haiku-enrichment.ts`: modelo `claude-haiku-4-5-20251001`, `timeout: 15000`, parser que faz `replace(/```json?/...)` e `JSON.parse` dentro de try/catch.

### Default seguro (princípio da assimetria)
Não distribuir um comprador real é pior que distribuir um não-lead ocasional. Por isso TODA falha resolve para `isLead: true`.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-18 | 1.0 | Story criada | River (@sm) |
| 2026-06-18 | 1.1 | Validação 9/10 GO (estimativa adicionada) — Status → Ready | Pax (@po) |
| 2026-06-18 | 1.2 | Implementação concluída — 287 testes AI / typecheck 0 erros / guardrail DB sincronizado — Status → InReview | Dex (@dev) |
| 2026-06-18 | 1.3 | QA Gate PASS 7/7 — Status → Done | Quinn (@qa) |
