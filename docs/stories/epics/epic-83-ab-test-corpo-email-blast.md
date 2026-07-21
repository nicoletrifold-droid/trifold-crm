---
epic: 83
title: Central de Email — Teste A/B de Corpo no Email Blast
status: Done
created_at: 2026-07-21
updated_at: 2026-07-21
created_by: Morgan (@pm)
priority: Medium
parent_epic: docs/stories/epics/epic-18-ab-test-assunto-email-blast.md
stories_done: [83.1, 83.2, 83.3, 83.4]
stories_next: []
---

# Epic 83 — Teste A/B de Corpo no Email Blast

## Objetivo do Epic

Estender o sistema de teste A/B do Email Blast (Epic 18, Done — hoje só testa **assunto**) para permitir testar o **corpo do email** também, sem misturar as duas variáveis no mesmo blast. O admin escolhe, por blast, qual variável está testando: Assunto (como já existe) ou Corpo (novo).

## Contexto do Sistema Existente

- **Epic 18 (Done, 5/5 stories):** já existe toda a infraestrutura de teste A/B — schema (`email_blasts.ab_test_enabled`, `email_logs.variant`), split determinístico 50/50 (`api/admin/email-blasts/route.ts`, Story 80-3), agregação de métricas por variante (`api/admin/email-blasts/[id]/stats`, Story 80-4), e UI de resultados lado a lado (`blast-detail.tsx`, Story 80-5). **Reaproveitar tudo isso — não recriar.**
- **Wizard hoje (`step-content.tsx`):** admin escolhe **1** template existente via dropdown (`/api/admin/email-templates`). Não há editor de HTML livre no wizard — o corpo (`html_body`) e o assunto padrão vêm inteiros do template cadastrado na Central de Templates.
- **`sendTemplateEmail()` (`packages/web/src/lib/email.ts`):** busca o template por `templateSlug`, resolve variáveis no `subject` e no `html_body`, e aceita `subjectOverride` opcional (usado hoje para o A/B de assunto) e `variant?: "a"|"b"` (gravado em `email_logs.variant`). **A função já é agnóstica ao que está sendo testado** — só precisa receber o `templateSlug` correto por variante em vez de sempre o mesmo.
- **Endpoint de stats (`[id]/stats/route.ts`):** agrega por `variant` (sent/opened/opened_rate/clicked/click_rate) de forma **agnóstica ao que está sendo testado** — não precisa de lógica nova de agregação, só devolver também qual é a "label" de cada variante (hoje é o texto do assunto; para corpo, seria o nome do template).

## Decisões de Produto (confirmadas pelo usuário — Lucas, 2026-07-21)

1. **Fonte dos 2 corpos:** selecionar **2 templates já existentes** (Template A / Template B) — não um editor de HTML livre no wizard. Reaproveita a Central de Templates já existente.
2. **Uma variável por vez:** o blast testa **Assunto OU Corpo**, nunca os dois simultaneamente. Evita ambiguidade sobre qual variável explica a diferença de resultado.
3. **Sem vencedor automático (herdado do Epic 18, mantido):** o sistema continua só exibindo os números por variante — nenhuma lógica de comparação/decisão é introduzida.

## Critérios de Sucesso (mensuráveis)

- [x] Admin escolhe, no Passo 2 do wizard, se o teste A/B é de "Assunto" ou "Corpo" (quando A/B está ativo)
- [x] Modo "Corpo": admin seleciona Template A e Template B (dropdowns, mesma fonte de dados do dropdown de template único já existente) — sem campos de assunto A/B
- [x] Split 50/50 (já existente) envia cada metade com o `html_body` + `subject` do template correspondente à sua variante, sem override de assunto
- [x] Tela de detalhe do blast (`blast-detail.tsx`) mostra, quando `ab_test_variable = 'body'`, o nome de cada template como label da variante (em vez do texto do assunto) — mesma estrutura lado a lado, sem vencedor
- [x] Nenhuma regressão no teste A/B de Assunto (Epic 18) — comportamento idêntico ao atual
- [x] Nenhuma regressão em blasts sem A/B ativado

## Stories

| Story | Título | Executor | Quality Gate | Complexidade | Status |
|---|---|---|---|---|---|
| 83.1 | Schema: `ab_test_variable` + colunas de template por variante em `email_blasts` | @data-engineer | @dev | P | Done |
| 83.2 | Wizard: seletor "Assunto ou Corpo" + dropdowns de Template A/B no Passo 2 | @dev | @qa | M | Done |
| 83.3 | Split + envio usando o template correto por variante (sem override de assunto) | @dev | @qa | M | Done (gate CONCERNS — ver Fechamento) |
| 83.4 | Endpoint de stats devolve label da variante (template) + UI de detalhe exibe corretamente | @dev | @qa | M | Done |

### 83.1 — Schema: `ab_test_variable` + colunas de template por variante

**Descrição:** Nova migration (próximo número livre, verificar antes de criar — 181 é a última aplicada no momento da criação deste epic) adicionando em `email_blasts`:
- `ab_test_variable TEXT NOT NULL DEFAULT 'subject' CHECK (ab_test_variable IN ('subject', 'body'))`
- `body_variant_a_template_id UUID REFERENCES email_templates(id)` (nullable)
- `body_variant_a_slug TEXT` (nullable — evita join extra no momento do envio, mesmo padrão de `template_slug` já usado)
- `body_variant_b_template_id UUID REFERENCES email_templates(id)` (nullable)
- `body_variant_b_slug TEXT` (nullable)

Nenhuma coluna nova em `email_logs` — a coluna `variant` (Epic 18) já é suficiente e agnóstica ao que está sendo testado.

**ACs:**
- [x] Migration aplicada em dev antes de prod
- [x] `ab_test_variable` default `'subject'` não quebra nenhum blast existente (todos os blasts do Epic 18 continuam válidos, implicitamente testando assunto)
- [x] Colunas novas nullable, sem impacto em queries existentes

### 83.2 — Wizard: seletor "Assunto ou Corpo" + dropdowns de Template A/B

**Descrição:** Em `step-content.tsx`, quando "Ativar teste A/B" estiver marcado, mostrar um seletor (radio) "O que testar?" com opções "Assunto" (default) e "Corpo". Modo Assunto = comportamento atual, sem mudança. Modo Corpo: esconder os campos de Assunto A/B e mostrar 2 dropdowns "Template A" e "Template B" (mesmo fetch de `/api/admin/email-templates` já usado no dropdown de template único).

**ACs:**
- [x] Comportamento atual (teste de assunto) 100% preservado quando o seletor está em "Assunto" — nenhuma regressão visual ou funcional no Epic 18
- [x] Modo "Corpo" exige os 2 templates selecionados antes de avançar (`canProceed` estendido)
- [x] Passo 3 (Confirmação) mostra resumo indicando quais 2 templates estão sendo testados quando o modo é "Corpo"

### 83.3 — Split + envio usando o template correto por variante

**Descrição:** Em `api/admin/email-blasts/route.ts` (POST), quando `ab_test_variable === 'body'`: reaproveitar o split determinístico já existente (Story 80-3, mesma lógica de ordenação por `id` do lead), mas no loop de envio (`sendTemplateEmail`) usar `templateSlug` = slug do Template A ou B conforme a variante do lead, **sem** passar `subjectOverride` (cada template usa seu próprio assunto cadastrado).

**ACs:**
- [x] Split reaproveita exatamente a mesma função/lógica de divisão 50/50 já existente (não duplicar)
- [x] Envio usa o `html_body` e `subject` do template correto por variante, validado com teste manual (dados fabricados em produção, removidos após)
- [x] Modo "Assunto" (Epic 18) e blasts sem A/B continuam usando exatamente o fluxo atual, sem alteração

### 83.4 — Endpoint de stats + UI de detalhe exibem a variante corretamente

**Descrição:** Em `[id]/stats/route.ts`, incluir no payload `ab_test_variable` e, quando `'body'`, os nomes dos templates A/B (join simples em `email_templates` pelos ids já salvos). Em `blast-detail.tsx`, usar esse campo para decidir o label de cada variante: "Assunto: {texto}" (modo atual) ou "Template: {nome}" (modo novo) — mesma estrutura lado a lado, mesmas métricas, **sem indicador de vencedor** (herdado do Epic 18).

**ACs:**
- [x] Endpoint devolve `ab_test_variable` sempre, e nomes de template quando `'body'`
- [x] UI mostra o label correto conforme a variável testada, sem quebrar o layout já existente do Epic 18
- [x] Nenhum indicador de vencedor/líder introduzido (mesma regra do Epic 18)

## Technical Scope

- Migration nova (schema): `email_blasts` (5 colunas novas)
- Backend: `api/admin/email-blasts/route.ts` (branch por `ab_test_variable`), `[id]/stats/route.ts` (label de variante)
- Frontend: `step-content.tsx` (seletor + dropdowns duplos), `step-schedule.tsx` (resumo), `blast-detail.tsx` (label condicional)
- Sem novas dependências externas, sem editor de HTML novo

## Out of Scope (deste epic)

- Editor de HTML livre por variante (usa templates já cadastrados na Central de Templates)
- Testar corpo E assunto simultaneamente no mesmo blast (decisão do usuário: uma variável por vez)
- Qualquer lógica de vencedor automático (mesma decisão do Epic 18)
- Criação de templates a partir do wizard (fluxo de criação de template já existe em outro lugar da Central de Email)

## Dependencies

- Epic 18 (Done) — toda a infraestrutura de A/B (split, tagging, agregação, UI) vem de lá e é reaproveitada, não recriada

## Notes

Epic criado em 2026-07-21 por @pm (Morgan) a partir de pergunta direta do usuário ("Consigo mandar 2 tipos de copy, para fazer o teste A/B?") em sessão de trabalho subsequente ao fechamento do Epic 18. Decisões de escopo (fonte dos corpos = templates existentes; uma variável por vez) confirmadas pelo usuário via pergunta direta antes da criação deste documento. Numeração: epic 83, stories 83.1–83.4, migration a partir de 182 (verificar numeração livre no momento de cada implementação — repositório de alta concorrência).

Numeração de epic/story colidiu duas vezes durante o desenvolvimento com sessões concorrentes (originalmente criado como "Epic 82", renumerado para 83 antes do primeiro push; depois um segundo "Epic 83" de sessão concorrente foi mergeado com numeração própria — sem conflito de arquivo, só ambiguidade de numeração documentada nas stories).

## Fechamento (@po / Pax — 2026-07-21)

Epic concluído: 4/4 stories Done, todos os Critérios de Sucesso atendidos. A decisão de produto "sem vencedor automático" foi respeitada de ponta a ponta (schema, split/envio e UI) — nenhuma lógica de comparação entre variantes foi introduzida.

**Débito técnico leve (não bloqueante):** a Story 83-3 fechou com gate **CONCERNS** — o fallback `?? templateSlug` no cálculo do template efetivo por variante (em `api/admin/email-blasts/route.ts`) degrada silenciosamente para o template principal caso os slugs de variante venham vazios (cenário de baixa probabilidade, já que o wizard exige os 2 templates preenchidos antes de enviar). Recomendação registrada no QA Results da 83-3: considerar logar um aviso quando esse fallback for acionado, para tornar uma eventual falha de integração futura detectável. Não bloqueia o uso da feature hoje.
