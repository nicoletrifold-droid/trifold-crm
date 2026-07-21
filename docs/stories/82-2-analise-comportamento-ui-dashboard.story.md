# Story 82-2 — UI dashboard: aba "Análise IA" (funde Resumo IA + análise de comportamento)

## Metadata
- **Status:** Approved
- **Epic:** 82 — Análise de Comportamento IA do lead
- **Branch:** feat/82-2-analise-comportamento-ui-dashboard
- **Tipo:** Feature (frontend dashboard)
- **Complexidade:** Média
- **Prioridade:** P1
- **Depende de:** 82-1 (rota + persistência)

## Story
**As a** gestor no dashboard, **I want** uma aba "Análise IA" no detalhe do lead que mostre a
análise comportamental estruturada, com botão para gerar/regenerar e aviso quando está
desatualizada, **so that** eu decida a abordagem sem sair da tela.

## Contexto
Hoje a aba "Resumo IA" (`dashboard/leads/[id]/page.tsx`, TABS ~linha 23, conteúdo ~507-541)
mostra `leads.ai_summary` (texto corrido) + botão "Gerar resumo". Decisão do épico: a aba é
RENOMEADA para "Análise IA"; o resumo vira bloco de contexto no topo (o cron enrich-leads já
o mantém atualizado a cada 30min); a análise estruturada é o conteúdo principal; botão único
"Analisar comportamento". O botão "Gerar resumo" separado sai — menos botões, menos confusão.

## Escopo
**IN:**
- Renomear a aba `resumo` → label "Análise IA" (manter a key/querystring para não quebrar links? — decisão do dev; se trocar a key, redirecionar `?tab=resumo`).
- Componente compartilhado `behavior-analysis-panel.tsx` (em `packages/web/src/components/leads/`),
  pensado para reuso no /broker (82-3):
  - Bloco "Resumo da conversa" no topo (ai_summary, colapsável, com data).
  - Render estruturado da análise: estágio real percebido **vs** etapa atual (deixar claro que é
    sugestão — corretor decide), temperatura com justificativa, sinais, objeções, como abordar,
    próxima ação em destaque, e `dados_faltando` como checklist acionável ("registre X para
    melhorar a análise").
  - Botão "Analisar comportamento" → POST `/api/leads/[id]/behavior-analysis`, loading state,
    erro amigável; regenera a cada clique (decisão do Marcos).
  - Data de geração visível + **aviso de staleness**: se houve atividade nova (última message /
    activity / appointment > `behavior_analyzed_at`), mostrar "Houve movimentação desde esta
    análise — gere novamente".
  - Estado vazio (nunca analisado): explicação curta + botão.
- Tema: página é /dashboard → light/dark com `dark:` (convenção do repo).

**OUT:**
- /broker e permissões ampliadas (82-3); mudanças no backend além de, se necessário, expor no
  server component os timestamps para o cálculo de staleness; qualquer alteração no cron enrich.

## Acceptance Criteria
1. **Given** lead sem análise, **when** abro a aba Análise IA, **then** vejo estado vazio +
   botão; ao clicar, a análise aparece renderizada por seção (sem JSON cru) com data de geração.
2. **Given** lead com análise persistida, **when** abro a aba, **then** a análise carrega do
   banco (sem nova chamada de IA) — regeneração só ao clicar no botão.
3. **Given** atividade nova após `behavior_analyzed_at` (nova mensagem, nota ou agendamento),
   **then** o aviso de desatualização aparece; sem atividade nova, não aparece.
4. **Given** a análise sugere estágio diferente da etapa atual, **then** a UI apresenta como
   sugestão (comparação lado a lado) e NÃO oferece ação de mover etapa.
5. **Given** `dados_faltando` não-vazio, **then** aparece como lista acionável destacada.
6. O ai_summary continua visível (bloco contexto no topo) e o botão antigo "Gerar resumo" some
   sem deixar rota/import órfão. Light/dark OK. Type-check/lint/suíte verdes.

## Dev Notes
- Base atual: `dashboard/leads/[id]/page.tsx` (Server Component; abas via `?tab=`); botão antigo
  `components/leads/generate-summary-button.tsx` (remover uso; avaliar apagar arquivo se sem outros usos).
- Componente novo é client component com fetch; o server component passa `lead.behavior_analysis`,
  `behavior_analyzed_at` e os timestamps de última atividade para o staleness (evita query no client).
- Reuso futuro no /broker é requisito de design: zero dependência de contexto exclusivo do dashboard.

## File List
- `docs/stories/82-2-analise-comportamento-ui-dashboard.story.md` (this file)
- `packages/web/src/components/leads/behavior-analysis-panel.tsx` (novo — client, prop `theme` p/ reuso no /broker)
- `packages/web/src/app/dashboard/leads/[id]/page.tsx` (aba renomeada + painel + staleness server-side)
- `packages/web/src/components/leads/generate-summary-button.tsx` (REMOVIDO — sem outros usos)

## Dev Agent Record (@dev Dex — 2026-07-21)
- Aba mantém a key `?tab=resumo` (condição @po: links salvos seguem funcionando); só o label muda.
- Staleness calculado no server (última mensagem via conversations[0].last_message_at + activities[0] +
  1 query de appointments) e passado ao painel — sem query no client.
- ai_summary vira bloco colapsável "Resumo da conversa" no topo (cron enrich mantém atualizado);
  botão "Gerar resumo" e componente antigos removidos.
- Painel destaca "Próxima ação", apresenta estágio da IA como SUGESTÃO ao lado da etapa do funil
  (sem ação de mover) e renderiza `dados_faltando` como checklist de registro.
- Checks: vitest 1103/1103, tsc limpo, eslint limpo nos arquivos tocados.
- Branch: feat/82-1-analise-comportamento-backend (mesma branch do épico — PR único)

## PO Validation (@po Pax — 2026-07-21)
**GO (9/10).** ACs testáveis, escopo claro, dependência da 82-1 mapeada. Condição (não bloqueia):
manter a key `?tab=resumo` funcionando (redirect ou alias) — links salvos/notificações podem apontar pra ela.
Status: Draft → Approved.

## Change Log
- 2026-07-21 @sm (River): story criada a partir do Epic 82. Status: Draft.
- 2026-07-21 @po (Pax): validação GO 9/10. Status: Approved.
