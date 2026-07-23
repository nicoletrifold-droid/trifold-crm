# Story 75-212 — Relatório diário: linha "Patrocinado Corretor" (ajuda de custo)

## Metadata
- **Status:** Done
- **Epic:** 75 — Relatório diário do diretor / métricas de leads
- **Branch:** feat/75-212-relatorio-patrocinado-corretor
- **Relacionado:** 75-45 (relatório original), 75-154 (v2: entrada × manual — precedente de troca de template)
- **Tipo:** Feature — Marcos (print, 2026-07-23): o diretor Alexandre recebe o
  relatório diário no WhatsApp, mas ele não mostra os leads de origem
  "Patrocinado Corretor" (`source='broker_sponsored'`). É o Alexandre quem paga
  a **ajuda de custo** dos corretores por esses leads — precisa ver quantos
  entraram e de qual corretor. Prod (23/07): 51 leads broker_sponsored em 30
  dias (Valeria e Robson), todos cadastros manuais — hoje somem dentro do
  número "Cadastros manuais de corretor".

## Acceptance Criteria
- [x] AC1: nova linha no relatório, logo após "Cadastros manuais":
  `💰 Patrocinado Corretor: {{5}}` — parâmetro no formato
  `"N — Valeria 2 · Robson 1"` (total + por corretor, primeiro nome, ordenado
  desc; lead sem corretor atribuído agrupa como "Sem corretor"). Sem nenhum
  lead na janela → `"0"`. Uma linha só, sem quebra (regra de parâmetro Meta).
- [x] AC2: contagem = leads criados na janela do dia comercial (mesma janela
  do restante do relatório) com `source='broker_sponsored'`, org,
  `segmento='principal'`, `is_active=true`, agrupados por
  `assigned_broker_id` (FK → users.id; nome via `users`).
- [x] AC3: novo template Meta `relatorio_diario_leads_v3` (pt_BR, UTILITY,
  8 params, numeração em ordem de aparição: 1 data · 2 entrada · 3 canais ·
  4 manuais · **5 patrocinados** · 6 corretores · 7 distribuídos · 8 tempo),
  corpo idêntico ao v2 + a linha nova. `send-daily-report.ts` aponta para o
  v3 com os 8 params nessa ordem. Deploy só com template APPROVED (lição
  75-154).
- [x] AC4: formatação em função pura exportada e testada
  (`formatPatrocinados`), padrão do arquivo. Demais linhas do relatório
  inalteradas.
- [x] AC5: sem migration; type-check, lint (arquivos tocados) e suíte verdes.

## Corpo do template `relatorio_diario_leads_v3` (submeter na Meta — @devops)
```
📊 Relatório Diário Trifold — {{1}}

🆕 Leads de entrada: {{2}}

📥 Por canal:
{{3}}

✍️ Cadastros manuais de corretor: {{4}}

💰 Patrocinado Corretor: {{5}}

👥 Por corretor (distribuídos → atenderam):
{{6}}

📦 Distribuídos: {{7}}

⏱️ Tempo médio de atendimento: {{8}}

Bom dia! Relatório gerado automaticamente.
```

## File List
- `docs/stories/75-212-relatorio-diario-patrocinado-corretor.story.md` (this file)
- `packages/web/src/lib/reports/daily-leads-report.ts`
- `packages/web/src/lib/reports/daily-leads-report.test.ts`
- `packages/web/src/lib/reports/send-daily-report.ts`

## Change Log
- @sm (River) 2026-07-23: draft a partir do pedido do Marcos (print do
  relatório de 22/07) + verificação read-only em prod.
- @po (Pax) 2026-07-23: GO — Draft → Ready. Janela/filtros espelham o
  relatório existente; template versionado como na 75-154.
- @dev (Dex) 2026-07-23: `formatPatrocinados` (pura, 4 testes) + agregação em
  `buildDailyLeadsReport` (reusa a query de leads da janela, +1 lookup de
  nomes só quando há patrocinado); envio → v3 com 8 params. Simulação
  read-only em prod (janela 22/07): `"2 — Valeria 2"` — bate com o relatório
  real de 22/07 ("Cadastros manuais: 2", ambos da Valeria).
- @qa (Quinn) 2026-07-23: PASS — type-check ok, lint limpo nos 3 arquivos,
  vitest 1191/1191. Único consumidor de `DailyReportVars` é o cron (repassa).
  CONDIÇÃO de deploy: template v3 APPROVED na Meta antes do merge (senão o
  envio das 07:59 falha) — mesma condição da 75-154.
- @devops (Gage) 2026-07-23: template `relatorio_diario_leads_v3` submetido
  via Graph API (id 1396497332349932) — aguardando APPROVED para merge+deploy.
- @devops (Gage) 2026-07-23 16:31: template v3 APPROVED na Meta → merge +
  deploy liberados. Primeiro envio no novo formato: próximo cron 07:59 BRT.
