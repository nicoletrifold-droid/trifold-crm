---
epic: 82
title: Análise de Comportamento IA do lead — estágio real, abordagem e próxima ação
status: Draft
created_at: 2026-07-21
updated_at: 2026-07-21
created_by: Morgan (@pm)
priority: P1
objetivo_negocio:
  - Corretor/gestor bate o olho e entende o ESTÁGIO REAL do lead (não só a etapa do funil) e COMO abordá-lo — tom, argumento, momento e próxima ação concreta.
  - Cruzar TODAS as fontes que hoje ninguém junta — conversa com a Nicole, observação, notas do Histórico de Contatos, mudanças de etapa, tarefas, agendamentos/visitas e feedback pós-visita — em uma cronologia única interpretada por IA.
  - Comportamento é TEMPO, não só texto — cadência de resposta, sumiços, remarcações e no-shows entram na análise via timestamps.
  - Incentivo saudável: quanto mais o corretor registra, melhor a IA trabalha pra ele.
depends_on:
  - Resumo IA on-demand existente (api/leads/[id]/summary — Story original do épico 12/75) como base do padrão on-demand + persistência.
  - Pipeline de enriquecimento (packages/ai/src/flows/haiku-enrichment.ts + cron enrich-leads) como padrão de chamada LLM no packages/ai.
  - visit_feedback funcional em prod (mig 180 / Story 75-188) — retroativo vazio, fonte enriquece daqui pra frente.
related:
  - packages/web/src/app/api/leads/[id]/summary/route.ts (Resumo IA atual — só lê messages; usa string de modelo antiga claude-haiku-4-20250414)
  - packages/web/src/app/dashboard/leads/[id]/page.tsx (abas Info/Conversa/Histórico/Resumo IA; TABS linha ~23)
  - packages/ai/src/flows/haiku-enrichment.ts (padrão de flow LLM + testes)
  - packages/ai/src/client/anthropic.ts (createAnthropicClient)
  - packages/web/src/app/api/leads/[id]/notes/route.ts (broker_note em activities)
  - supabase/migrations/001_base_schema.sql (leads/conversations/messages/activities), 154 (observacao/perfil), 124-125 (trigger stage change)
  - Tabelas-fonte: messages, conversation_state, activities, follow_up_log, tasks, appointments, visit_feedback, leads (perfil)
stories_planned: [82-1, 82-2, 82-3]
---

# Epic 82 — Análise de Comportamento IA do lead

## Problema
O "Resumo IA" atual enxerga só a conversa com a Nicole. Tudo que o CORRETOR preenche —
observação, notas do Histórico de Contatos ("Nota · Robson Silva"), mudanças de etapa,
tarefas, visitas e feedback pós-visita — fica invisível para a IA. E o resumo apenas
descreve; não interpreta. O gestor/corretor precisa de algo que responda: **qual o estágio
real deste cliente e como eu devo abordá-lo agora?** Exemplo real (lead Palmieri): a nota
diz "estava com médico, vem semana que vem... deixar o apartamento se pagando" — um resumo
repete isso; uma análise conclui: interesse real (remarcou, não fugiu), perfil investidor
disfarçado de moradia, risco de esfriar até a tarefa de 28/07, abordagem = confirmar visita
segunda com simulação de renda de aluguel.

## Decisões (Marcos, 2026-07-21)
- **On-demand com cache:** botão gera/regenera a cada clique; resultado + data persistem no lead;
  aviso de "análise desatualizada" quando houve atividade nova após a geração. SEM cron.
- **Modelo: Sonnet (`claude-sonnet-5`).** Opus só se a qualidade decepcionar em teste real
  (avaliação delegada ao time; preço intro do Sonnet 5 vigente até 2026-08-31).
- **UI: funde na aba existente** — "Resumo IA" vira **"Análise IA"**. O resumo (leads.ai_summary,
  mantido atualizado pelo cron enrich-leads) vira bloco de contexto no topo; a análise estruturada
  é o conteúdo principal; botão único "Analisar comportamento".
- **Acesso: admin, supervisor, gerente-comercial e corretor** (corretor só nos leads dele, no /broker).
- **IA só SUGERE estágio — NUNCA move etapa** (regra vigente do produto: só corretor move).
- **Saída estruturada (JSON persistido)** com campo honesto de "dados faltando" — lead raso recebe
  análise rasa assumida, nunca profundidade inventada.

## Saída da análise (contrato)
| Campo | Conteúdo |
|---|---|
| `estagio_real` | Estágio percebido do cliente + comparação com a etapa atual do funil (sugestão, não ação) |
| `temperatura` | Frio/morno/quente comportamental + justificativa (pode divergir do score atual) |
| `sinais` | 2-4 sinais observados na cronologia (cadência, sumiços, remarcações, comparecimento) |
| `objecoes` | Objeções ditas e não-ditas prováveis |
| `como_abordar` | Tom, canal, argumento e momento sugeridos |
| `proxima_acao` | Ação concreta e imediata |
| `dados_faltando` | O que registrar/coletar para melhorar a análise (vazio se base rica) |
| `resumo` | 2-3 frases de contexto geral |

## Stories
- **82-1 — Backend: cronologia única + análise Sonnet + persistência.** Migration
  (`leads.behavior_analysis` jsonb + `behavior_analyzed_at`), flow novo em `packages/ai`
  (Sonnet, JSON estruturado, timestamps na cronologia), rota `POST /api/leads/[id]/behavior-analysis`
  agregando todas as fontes. Bônus: unificar a string de modelo antiga da rota /summary.
- **82-2 — UI dashboard: aba "Análise IA".** Renomear aba, render estruturado da análise,
  botão gerar/regenerar, data de geração + aviso de staleness, ai_summary como contexto no topo.
- **82-3 — Acesso corretor + gerente-comercial.** Rota liberada para os 4 perfis (corretor
  restrito aos leads dele), aba/seção no `/broker/leads/[id]` reutilizando o componente compartilhado.

## Sequência e dependências
82-1 → 82-2 → 82-3. A 82-3 depende do componente compartilhado nascido na 82-2.

## Fora de escopo (Epic 82)
- Geração automática (cron) — decisão explícita: só on-demand.
- Mover etapa, alterar score ou qualquer escrita no lead além das 2 colunas novas.
- Reprocessamento retroativo de visit_feedback (pendência do 75-188, corre em paralelo).
- Análise em lote / tela de analytics agregando análises (possível épico futuro).

## Riscos
- **Base rasa → análise rasa:** mitigado pelo contrato (`dados_faltando` obrigatório quando
  a cronologia tem < N eventos; prompt instrui a não inventar profundidade).
- **Custo por clique (Sonnet):** centavos por análise; sem cron não há gasto em lead parado.
  Monitorar tamanho médio da cronologia (leads com conversas longas) e truncar com critério
  (mais recentes + marcos) se necessário.
- **visit_feedback quase vazio no retroativo** (portas mortas até mig 180): análise já lê a
  fonte, mas ela só engorda daqui pra frente — o campo `dados_faltando` cobra o registro.
- **Permissão por nome de role** (padrão atual do repo): a 82-3 precisa incluir explicitamente
  gerente-comercial e corretor nos checks — perfis são cumulativos por convenção, não por herança.
