---
epic: 18
title: Central de Email — Teste A/B de Assunto no Email Blast
status: Draft
created_at: 2026-07-13
updated_at: 2026-07-13
created_by: Morgan (@pm)
priority: Medium
parent_epic: docs/stories/epics/epic-18-central-email.md
stories_done: []
stories_next: [80.1, 80.2, 80.3, 80.4, 80.5]
---

# Epic 18 (extensão) — Teste A/B de Assunto no Email Blast

## Objetivo do Epic

Adicionar teste A/B de **assunto (subject line)** ao wizard de Email Blast já existente — permitindo enviar duas versões de assunto para o mesmo corpo de email, divididas automaticamente 50/50 entre a audiência do blast, e comparar desempenho por taxa de abertura e taxa de clique.

## Contexto do Sistema Existente

- **Wizard de Email Blast:** 3 passos (Audiência → Conteúdo → Confirmação), `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/` (`step-audience.tsx`, `step-content.tsx`, `step-schedule.tsx`, `wizard.tsx`). Lista de blasts em `_components/blast-list.tsx`.
- **Schema atual (migration 018):** `email_blasts` (id, org_id, name, template_id, subject_override, segment_filter, total_recipients, sent_count, status, scheduled_for, ...), `email_logs` (id, org_id, template_id, to_email, subject, status, tags, triggered_by, sent_at, delivered_at, **opened_at**, **clicked_at**, bounced_at), `email_sends_queue` (fila com rate limiting).
- **Tracking já existe:** webhook Resend (`packages/web/src/app/api/webhook/resend/route.ts`) já atualiza `email_logs.status`/`opened_at`/`clicked_at` conforme eventos `email.opened`/`email.clicked` chegam — não precisa criar tracking novo, só **segmentar por variante** o que já é rastreado.
- **Rate limiting:** Story 78-1 (Done) corrigiu o cron da fila (`api/cron/email-queue/route.ts`) para respeitar `daily_quota` por organização via `getEmailSettings(orgId)` — qualquer lógica nova de envio de A/B passa pela mesma fila/cron, sem exceção de quota.
- **Sistema de A/B diferente e já existente (Epic 55):** testa **imagens** em campanhas de **sorteio** (tabelas `campaigns`/`campaign_email_images`, não `email_blasts`). Público e schema completamente separados — não deve ser reusado nem confundido com este epic. Pode servir de referência de padrão de agregação de métricas por variante (via `utm_content` em `campaign_events`), mas a implementação aqui é independente.
- **Padrões visuais recentes (Stories 76-1, 77-1):** contraste de campos (`text-stone-800`/`bg-white` explícitos) e banner de confirmação reaproveitando padrão inline existente (sem lib de toast) — a UI desta feature deve seguir os mesmos padrões.

## Decisões de Produto (já tomadas pelo usuário — Lucas)

1. **Variável testada:** apenas o **assunto**. Duas versões de assunto (A e B) para o **mesmo** corpo/template — não é teste de corpo, imagem ou remetente.
2. **Divisão de audiência:** split automático **50/50** entre variante A e variante B.
3. **Sem vencedor automático:** o sistema **não decide** qual variante "ganhou". Ele só **mapeia/exibe** taxa de abertura e taxa de clique lado a lado, por variante — a decisão de qual performou melhor é feita pelo próprio usuário, olhando os números. Isso elimina a necessidade de critério de desempate, amostra mínima ou threshold de decisão — não há "decisão automática" para regrar.

## Decisões em Aberto

- **Envio automático da variante "vencedora" para o restante da lista** (padrão clássico "teste em X%, envia vencedora para o resto") — o usuário pediu apenas split 50/50 de teste com números lado a lado, **não pediu** uma segunda etapa de envio em massa. Isso fica **fora de escopo** deste epic; se o usuário quiser esse fluxo depois (precisaria antes definir como decidir a "vencedora", já que não há mais critério automático), é uma nova story.

## Critérios de Sucesso (mensuráveis)

- [ ] Admin consegue ativar "Teste A/B de assunto" no Passo 2 do wizard e informar 2 versões de assunto
- [ ] Ao confirmar o blast, a audiência é dividida automaticamente ~50/50 entre variante A e B (tolerância de arredondamento para número ímpar de destinatários)
- [ ] Cada `email_log` enviado carrega qual variante recebeu (rastreável em consulta/relatório)
- [ ] Tela de detalhe/lista do blast mostra, por variante: enviados, taxa de abertura, taxa de clique — lado a lado, sem indicar vencedor
- [ ] Nenhuma regressão no envio de blasts sem A/B ativado (comportamento atual continua idêntico quando a feature não é usada)
- [ ] Rate limiting (Story 78-1) continua sendo respeitado — envio de A/B não abre uma via paralela que ignore `daily_quota`

## Stories

| Story | Título | Executor | Quality Gate | Complexidade |
|---|---|---|---|---|
| 80.1 | Schema: colunas de A/B em `email_blasts` + `variant` em `email_logs` | @data-engineer | @dev | P |
| 80.2 | Wizard: toggle de teste A/B + campo de Assunto B no Passo 2 | @dev | @qa | M |
| 80.3 | Split 50/50 + tagging de variante no enfileiramento do blast | @dev | @qa | M |
| 80.4 | Agregação de métricas por variante (enviados, taxa de abertura, taxa de clique — sem vencedor automático) | @dev | @qa | P |
| 80.5 | UI de resultados do teste A/B (números lado a lado por variante) | @dev | @qa | M |

### 80.1 — Schema: colunas de A/B em `email_blasts` + `variant` em `email_logs`

**Descrição:** Nova migration (próximo número livre, verificar antes de criar — 168 é a última aplicada nesta sessão) adicionando:
- `email_blasts.ab_test_enabled BOOLEAN NOT NULL DEFAULT false`
- `email_blasts.subject_variant_a TEXT` (nullable — quando A/B ativo, substitui `subject_override` para a variante A)
- `email_blasts.subject_variant_b TEXT` (nullable — assunto da variante B)
- `email_logs.variant TEXT CHECK (variant IN ('a','b'))` (nullable — só preenchido para envios de blast com A/B ativo)

Sem coluna de "vencedor" — o sistema não decide, só exibe os números (ver Decisões de Produto).

**ACs:**
- [ ] Migration aplicada em dev antes de prod (seguir convenção do projeto de checar numeração antes de criar)
- [ ] Colunas nullable/com default não quebram nenhuma query existente sobre `email_blasts`/`email_logs`
- [ ] Índice em `email_logs(variant)` combinado com `triggered_by` se a query de agregação (Story 80.4) precisar (avaliar na implementação)

### 80.2 — Wizard: toggle de teste A/B + campo de Assunto B no Passo 2

**Descrição:** Em `step-content.tsx`, adicionar checkbox/toggle "Ativar teste A/B de assunto". Quando ativo: renomear o campo de assunto existente para "Assunto A" e mostrar um segundo campo "Assunto B" (mesmo padrão de contraste da Story 77-1: `text-stone-800`/`bg-white`). Quando A/B ativo, `subjectOverride` único não é usado — os dois assuntos vão nos campos de variante.

**ACs:**
- [ ] Toggle desligado (padrão) preserva 100% o comportamento atual — nenhuma mudança visível pra quem não usa A/B
- [ ] Toggle ligado exige os 2 campos preenchidos antes de avançar (mesma validação `canProceed` já existente, estendida)
- [ ] Passo 3 (Confirmação) mostra resumo indicando que é um teste A/B e os 2 assuntos

### 80.3 — Split 50/50 + tagging de variante no enfileiramento do blast

**Descrição:** Em `api/admin/email-blasts/route.ts` (POST), quando `ab_test_enabled=true`: dividir a lista de destinatários resolvida pelo `segment_filter` em duas metades (~50/50, arredondamento definido na implementação), criar `email_logs`/`email_sends_queue` com `subject` = assunto da variante correspondente e `variant` = 'a'/'b' respectivamente.

**ACs:**
- [ ] Split determinístico o suficiente para ser auditável (ex: ordenar por id do lead antes de dividir, não aleatório sem seed) — decisão de implementação, documentar no Dev Notes
- [ ] Continua respeitando a fila/rate limiting existente (Story 78-1) — nenhum caminho de envio direto que pule `email_sends_queue`
- [ ] Blast sem A/B ativado continua usando exatamente o fluxo atual (sem variant, sem split)

### 80.4 — Agregação de métricas por variante

**Descrição:** Função/query que, dado um `blast_id`, agrega por `variant`: total enviado, total aberto (`opened_at IS NOT NULL`), total clicado (`clicked_at IS NOT NULL`), calculando taxa de abertura e taxa de clique. **Sem lógica de vencedor** — só os números, para o usuário analisar.

**ACs:**
- [ ] Cálculo correto de taxas por variante, testável com dados de exemplo
- [ ] Nenhuma lógica de comparação/decisão entre variantes — só agregação

### 80.5 — UI de resultados do teste A/B

**Descrição:** Na lista de blasts (`blast-list.tsx`) ou numa tela de detalhe do blast (verificar se já existe ou precisa ser criada), exibir para blasts com A/B ativo: métricas lado a lado por variante (enviados, taxa de abertura, taxa de clique), sem nenhum indicador de "vencedor" ou "líder" — apresentação neutra dos números.

**ACs:**
- [ ] Blasts sem A/B continuam mostrando a UI atual sem alteração
- [ ] Métricas exibidas batem com a agregação da Story 80.4
- [ ] Nenhum texto ou badge de "vencedor"/"líder" — só os números lado a lado (Variante A vs Variante B)

## Technical Scope

- Migration nova (schema): `email_blasts` (4 colunas), `email_logs` (1 coluna)
- Backend: `api/admin/email-blasts/route.ts` (split + tagging), nova função de agregação (local em lib ou API route de detalhe)
- Frontend: `step-content.tsx` (toggle + campo B), `step-schedule.tsx` (resumo), `blast-list.tsx` ou tela de detalhe nova (resultados)
- Sem novas dependências externas

## Out of Scope (deste epic)

- Teste A/B de corpo/template, imagem ou remetente (só assunto, por decisão do usuário)
- Envio automático da variante vencedora para o restante de uma lista maior (padrão "test then send winner") — não pedido
- Qualquer alteração no sistema de A/B de imagens do Epic 55 (campanhas de sorteio) — sistemas independentes
- Split configurável (ex: 70/30) — só 50/50, por decisão do usuário

## Dependencies

- Story 78-1 (Done) — rate limiting por org já corrigido, esta feature deve respeitá-lo
- Stories 76-1, 77-1 (Done) — padrões visuais de contraste e confirmação já estabelecidos no wizard

## Notes

Epic criado em 2026-07-13 por @pm (Morgan) a partir de decisões de escopo tomadas por Lucas em sessão de trabalho no wizard de Email Blast. Numeração de stories: **80.1–80.5** (batch sequencial do projeto — 76 a 79 já em uso por outras sessões concorrentes no momento da criação deste epic).
