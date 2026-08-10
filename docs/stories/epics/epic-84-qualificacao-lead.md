---
epic: 84
title: Qualificação do Lead — campo de qualidade de conversão, independente da Temperatura
status: Draft
created_at: 2026-08-04
updated_at: 2026-08-04
created_by: Morgan (@pm)
priority: P2
objetivo_negocio:
  - Separar "estágio do funil" (Temperatura: quente/morno/frio) de "qualidade real do lead"
    (Qualificação: Bom/Regular/Ruim/Inválido) — hoje só existe o primeiro, e ele não captura
    perfil/capacidade de compra real.
  - Dar ao comercial um campo combinável com a Temperatura (qualquer par é válido: lead quente
    + Ruim, lead frio + Bom) para priorizar ação por qualidade, não só por engajamento.
  - Prazos e cadências de ação por classificação (24h/3 dias/30 dias) viram configuráveis,
    não hardcoded — ajustáveis pela equipe comercial conforme capacidade real de resposta.
depends_on:
  - "leads.interest_level (enum cold|warm|hot, supabase/migrations/001_base_schema.sql:43-47,127)
    como padrão de arquitetura de coluna simples a seguir para o novo campo — MAS não como
    exemplo de campo manual (ver correção abaixo)."
  - "audit_logs (059_audit_logs.sql) + logAudit() (packages/web/src/lib/audit.ts) — reusar para
    o histórico de mudanças, sem tabela nova."
  - "roles/role_permissions (047_roles_permissions.sql) + canAccess()
    (packages/web/src/lib/permissions.ts, permissions-modules.ts) — reusar matriz de submódulos,
    mesmo padrão migrado em Campanhas (Story 75-229)."
  - "roleta_config (padrão de tabela de config por org) e notifyBroker/notifyBrokerOfStalledLead
    (packages/web/src/lib/broker/notify-stalled-lead.ts, Epic 51) — reusar para prazos
    configuráveis e alertas com anti-spam, em vez de criar infraestrutura nova."
  - "behavior_analysis (Epic 82, migration 182_leads_behavior_analysis.sql) — precedente direto
    do padrão \"sistema sugere, humano confirma\" que a sugestão automática desta epic deve seguir."
related:
  - packages/web/src/app/broker/leads/[id]/_components/lead-edit-form.tsx:44-49 (edição de interest_level hoje)
  - packages/web/src/app/broker/pipeline/page.tsx (kanban)
  - packages/web/src/app/broker/leads/page.tsx (lista/filtros)
  - packages/web/src/lib/audit.ts (logAudit, fire-and-forget, imutável)
  - packages/web/src/lib/permissions.ts, permissions-modules.ts (matriz RBAC)
  - packages/web/src/lib/broker/notify-stalled-lead.ts (notificação com anti-spam, Epic 51)
  - packages/web/src/app/api/webhooks/meta-ads/route.ts, packages/web/src/app/api/webhook/whatsapp/route.ts
    (confirmados: NÃO escrevem em interest_level/qualification_* hoje — campo novo nasce isolado
    dessas integrações)
  - "CORREÇÃO (2026-08-04, achado durante o draft da 84-1): a investigação inicial errou ao dizer
    que interest_level é 100% manual. packages/ai/src/chat/pipeline.ts:892-894 e
    packages/ai/src/flows/haiku-enrichment.ts:203-205 calculam um score de engajamento no chat e
    sobrescrevem, automaticamente e nesta ordem: leads.qualification_score,
    leads.qualification_status (enum not_started|in_progress|qualified|not_qualified|lost,
    001_base_schema.sql:14-20,125-126) e leads.interest_level. Ou seja, JÁ existe um campo
    'qualification_status' — mas ele mede engajamento no chat (score >= 70 = qualified), não
    qualidade real do lead. É o mesmo problema que esta epic resolve, só que para a Temperatura.
    Por isso o novo campo NÃO se chama leads.qualification (colidiria em nome e em conceito) —
    nasce como leads.qualificacao_comercial (enum qualificacao_comercial: bom|regular|ruim|invalido),
    deixando explícito que é uma avaliação comercial manual, sem nenhuma relação com o
    qualification_status/score automático da Nicole."
stories_planned: [84-1, 84-2, 84-3, 84-4, 84-5]
---

# Epic 84 — Qualificação do Lead

## Problema

O CRM classifica leads só por Temperatura (quente/morno/frio), definida pelo estágio de
atendimento e respostas do lead — ou seja, mede *engajamento no funil*, não *qualidade real*.
Um lead pode estar "quente" (responde rápido, avança no atendimento) sem perfil ou capacidade
de compra; e um lead "frio" (ainda não visitou o stand) pode ser excelente (documentação
enviada, alto interesse). O comercial precisa de um segundo campo, independente, que meça
probabilidade de conversão — sem substituir nem sobrescrever a Temperatura.

## Decisões (brief de produto, 2026-08-04)

- **100% manual.** Nenhuma ação isolada do lead (visitou o stand, respondeu rápido) pode
  aplicar a classificação sozinha — no máximo alimenta uma **sugestão não-vinculante**
  confirmada pelo usuário (mesmo espírito do `behavior_analysis` do Epic 82).
- **Independente da Temperatura.** Qualquer combinação entre os dois campos é válida; devem
  ser visualmente distintos na UI para não confundir "estágio do atendimento" com "qualidade
  do lead".
- **4 valores fixos:** Bom, Regular, Ruim, Inválido (critérios abaixo).
- **Prazos configuráveis, não hardcoded** — a tabela abaixo é ponto de partida; a equipe
  comercial deve poder ajustar.
- **Webhooks externos (Meta Ads, WhatsApp) ficam isolados do campo.** A investigação confirmou
  que nenhum dos dois escreve em `interest_level`/`qualification_*` hoje — a Qualificação nasce
  com o mesmo isolamento, até decisão deliberada de conectar sugestões automáticas.
- **Nome do campo corrigido para `leads.qualificacao_comercial`** (não `leads.qualification`),
  para não colidir em nome nem em conceito com o `qualification_status`/`qualification_score`
  já existente, que é automático e mede engajamento no chat, não qualidade real (ver correção
  no `depends_on`).

## Contrato do campo

| Classificação | Critérios (resumo) | Prioridade | Ação recomendada | Prazo (configurável) |
|---|---|---|---|---|
| **Bom** | Alto interesse/capacidade de compra, responde com frequência, agendou visita, enviou documentação | Alta | Contato imediato — priorizar confirmação/agendamento | 24h |
| **Regular** | Contatos válidos, interage mas demora a responder, sem interesse imediato de compra | Média | Reengajar ativamente; sem resposta → mover para nutrição | 3 dias |
| **Ruim** | Contatos válidos, não responde, 48h+ sem interação, sem interesse, fora do perfil do produto | Baixa | Nutrição de longo prazo; reclassificar se houver nova interação | Revisar a cada 30 dias |
| **Inválido** | Telefone, WhatsApp ou e-mail incorretos | — | Solicitar atualização de contato; remover da base ativa se não houver retorno (ação manual) | Imediato |

## Stories

- **84-1 — Backend: schema + permissões + auditoria.** Migration com enum
  `qualificacao_comercial` (bom|regular|ruim|invalido) + coluna `leads.qualificacao_comercial`
  (nullable, sem default) — mesmo padrão estrutural de `interest_level`, mas 100% manual (ver
  correção acima). Submódulo `leads.qualificacao` na matriz de permissões (mesmo padrão da
  Story 75-229). Endpoint de update chama `logAudit()` (old_value → new_value, sem tabela de
  histórico nova). Prazos por classificação guardados em tabela de config por org (padrão
  `roleta_config`), não hardcoded.

- **84-2 — UI: ficha do lead, kanban/lista e filtro.** Controle (select/tag) visualmente
  distinto da Temperatura em `lead-edit-form.tsx` e no card do pipeline/kanban. Filtro
  combinável com o filtro de Temperatura já existente. Histórico de mudanças consultável no
  próprio card, lendo de `audit_logs`.

- **84-3 — Sugestão automática não-vinculante.** Avalia critérios objetivos já existentes no
  schema (visit_feedback, documentos enviados, atividade/mensagens) e exibe uma sugestão
  ("Sugestão: Bom — agendou visita e enviou documentação") com botão explícito de confirmar.
  Nunca escreve em `leads.qualificacao_comercial` sozinha — mesmo contrato do
  `behavior_analysis` (Epic 82: sistema sugere, humano decide).

- **84-4 — Alertas configuráveis por prazo/classificação.** Job (cron novo ou extensão de um
  existente) lê os prazos da 84-1 e dispara `notifyBroker` (reusando o guard de anti-spam de
  `notify-stalled-lead.ts`) para: Bom/Regular sem interação dentro do prazo; Ruim sem revisão
  há 30+ dias; Inválido sem retorno (sinalização — remoção da base é sempre ação manual).

- **84-5 — Relatório: Qualificação × Temperatura × Origem × Empreendimento.** Visão cruzando
  os 4 eixos, reaproveitando componentes de relatório/dashboard já existentes no projeto em vez
  de criar um do zero.

## Sequência e dependências

84-1 → 84-2 → (84-3 e 84-4 em paralelo, ambos dependem de 84-1) → 84-5 (depende de 84-1 e 84-2
para o dado existir e ser filtrável).

## Fora de escopo (Epic 84)

- Qualquer automação que force a classificação sem confirmação manual do usuário.
- Conectar webhooks externos (Meta Ads, WhatsApp) à Qualificação — decisão futura deliberada.
- Remoção automática de leads "Inválido" da base ativa — sempre ação manual.
- Alterar o campo de Temperatura existente ou sua lógica atual.
- **Alterar o pipeline da Nicole** (`chat/pipeline.ts`, `haiku-enrichment.ts`) — ele continua
  escrevendo `interest_level`/`qualification_score`/`qualification_status` automaticamente a
  cada mensagem, exatamente como hoje. Esta epic não toca nesse mecanismo, só cria um campo
  novo e sem relação (`qualificacao_comercial`) ao lado dele.

## Riscos

- **Confusão de nome/conceito com `qualification_status` já existente** (automático, mede
  engajamento no chat) — mitigado pelo nome distinto `qualificacao_comercial` e por uma nota
  explícita nos Dev Notes da 84-1/84-2 sobre a diferença.
- **Confusão visual entre os dois campos** — mitigado por exigência explícita de distinção
  (cor/ícone própria) na 84-2.
- **Sugestão (84-3) virar classificação automática de fato**, por conveniência do usuário
  clicar sem checar — mitigado por exigir confirmação explícita e logar quem confirmou (audit).
- **Prazos hardcoded por atalho de implementação** — mitigado por exigência explícita de
  configuração em tabela (84-1), não constante no código.
- **Volume de notificações (spam)** se muitos leads baterem o prazo ao mesmo tempo — reusa o
  guard de anti-spam já existente em `notifyBroker`/`notify-stalled-lead.ts`.
