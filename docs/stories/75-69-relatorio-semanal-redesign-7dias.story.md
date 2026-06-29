# Story 75-69 — Relatório semanal: janela única de 7 dias + redesign "Movimento da semana"

## Metadata
- **Status:** Review · **Epic:** 75 · **Branch:** feature/75-69-relatorio-semanal-redesign · **Complexidade:** M-L (5-8 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]
- **UX ref:** mockup "Movimento da semana" aprovado pelo usuário (Uma, 2026-06-29) — comparativo como herói; ver Dev Notes.

## Story
**As a** diretoria/gestão comercial que recebe o **relatório de analytics semanal automático** (cron, por e-mail),
**I want** que **todos** os blocos do relatório reflitam a **mesma janela de 7 dias** anunciada no cabeçalho — e
que o layout coloque o **comparativo da semana em destaque** —, **so that** o relatório seja coerente (sem misturar
"mês", "desde sempre" e "hoje" no mesmo documento), sem o bug do "Esta Semana = 0", e sem quebra de página no meio
das tabelas.

## Contexto
O PDF semanal (gerado pelo cron `api/cron/analytics-report/route.ts:48`, que chama `buildAnalyticsReportData`
**sem `period`**) promete no cabeçalho "21–28 jun (7 dias)", mas o corpo mistura **5 escalas de tempo** diferentes —
confirmado no PDF de 28/06/2026 e no código `packages/web/src/lib/analytics-report-data.ts`:

| Bloco | Mede hoje | Período real |
|---|---|---|
| Card "Total de Leads" (1115) | todos `is_active` | desde sempre (sem filtro de data) — linha ~181 |
| Card "Esta Semana" (0) | `created_at >= weekStart` | **BUG** (ver abaixo) |
| Card "Este Mês" (1127) | `created_at >= monthStart` | mês inteiro — linha ~184 |
| Card "Hoje" (1) | dia comercial | hoje |
| Funil / Empreendimento / Origens / Leads por Corretor | RPC `get_analytics_summary` com `p_since=monthStart` | **mês** — linhas ~186-187, 236-259 |
| Comparativo Semanal / Tempo de Atendimento | últimos 7 dias | **7 dias** (únicos corretos) |

**Bug "Esta Semana = 0":** `weekStart` (linhas ~140-142) usa `getDay()`. Quando o cron roda no **domingo**
(`getDay()===0`), a conta `- getDay() + 1` joga o início da semana para a **segunda-feira seguinte** (futuro) →
`leadsWeek` conta zero. O envio caiu domingo 28/06 23:00 → "Esta Semana = 0". **Repete todo envio que cair em domingo.**

**Decisão do usuário (2026-06-29): "tudo em 7 dias"** — período único, sem ambiguidade. UX aprovou o layout
"Movimento da semana" (comparativo como bloco central). Ver [[project-relatorio-semanal-redesign]].

> Caveat de UX (honesto): um funil só de leads *criados* nos últimos 7 dias fica concentrado no topo (leads novos
> ainda não percorreram o pipeline). É esperado — por isso o comparativo, não o funil, é o herói do relatório.

## Escopo
**IN:**
1. **Janela única de 7 dias no cron.** Fazer o relatório semanal (caminho SEM `period`) refletir os últimos 7 dias
   em **todos** os blocos: funil, por empreendimento, origens e leads por corretor. **Abordagem recomendada**
   (menor risco, reaproveita infra existente): fazer o cron construir um `ResolvedPeriod` de 7 dias e passar para
   `buildAnalyticsReportData` — isso já roteia para `get_analytics_summary_ranged` + comparativo período-anterior
   (ver Dev Notes). A mecânica exata fica a critério do @dev, desde que os ACs sejam satisfeitos.
2. **Cards de topo redesenhados (4, todos 7d)** conforme mockup: **Novos leads** (com Δ vs período anterior),
   **Fechamentos**, **Perdidos**, **Tempo médio de atendimento**. Remover os cards atuais "Total de Leads"
   (desde sempre), "Este Mês" e "Esta Semana".
3. **Corrigir/remover o bug `getDay()`** (linhas ~140-142): se os cards novos não usarem mais `leadsWeek`/`weekStart`,
   **remover o código morto**; se permanecer algum uso, corrigir o cálculo da segunda-feira para não zerar no domingo.
4. **Layout "Movimento da semana"** em `analytics-report-pdf.tsx`: comparativo 7d-vs-7d-anteriores como bloco
   **central** (logo após os cards); funil como apoio (rotulado "entradas dos últimos 7 dias"); tempo de atendimento
   ao final. Cabeçalho com a janela explícita (ex.: chip "Últimos 7 dias" + intervalo de datas).
5. **Quebra de página:** aplicar `wrap={false}` em cada `<View>` de seção do `analytics-report-pdf.tsx` (funil,
   colunas, corretores, comparativo, tempo de atendimento) para que nenhuma tabela seja cortada ao meio.

**OUT:**
- **Não regredir o PDF sob demanda** (`api/analytics/report`, caminho COM `period`): ele já respeita a janela
  escolhida na tela. Como compartilha o componente `analytics-report-pdf.tsx`, herdará o novo layout/cards — isso é
  desejado; apenas garantir que continue refletindo o período selecionado (não fixar em 7 dias).
- **Não alterar a tela Analytics** (`dashboard/analytics/page.tsx`) — fora de escopo; este é o relatório/cron.
- Não mudar a definição de "tempo de atendimento" (distribuição → `primeiro_atendimento_em`, horário comercial —
  Story 75-60) nem o cálculo do dia comercial (75-57).
- Não criar nova RPC: usar `get_analytics_summary_ranged`, que já existe.

## Acceptance Criteria
1. **Given** o relatório semanal automático (cron), **when** gerado, **then** funil, por empreendimento, origens e
   leads por corretor refletem **os últimos 7 dias** (não mais o mês) — coerente com o intervalo do cabeçalho.
2. **Given** o cabeçalho do relatório, **then** ele declara explicitamente a janela de 7 dias (rótulo + intervalo de
   datas), sem ambiguidade.
3. **Given** os cards de topo, **then** são exatamente: Novos leads (com variação vs 7 dias anteriores), Fechamentos,
   Perdidos e Tempo médio de atendimento — todos referentes aos últimos 7 dias. Os cards "Total de Leads", "Este Mês"
   e "Esta Semana" não aparecem mais.
4. **Given** o cron rodando num **domingo**, **then** o número de "novos leads (7d)" é o real dos últimos 7 dias
   (NUNCA zero por causa do cálculo de início de semana). O bug `getDay()` está corrigido ou o código morto removido.
5. **Given** o PDF renderizado com muitos corretores/origens, **then** nenhuma seção é cortada no meio por quebra de
   página — cada bloco aparece inteiro (eventualmente "pulando" para a próxima página).
6. **Given** o bloco comparativo, **then** ele é o bloco central/destacado do relatório (logo após os cards),
   mostrando Total, Por Empreendimento, Por Corretor e Por Origem com a coluna de variação (verde/vermelho).
7. **Given** o PDF sob demanda da tela (`api/analytics/report`, com `period`), **then** continua refletindo o período
   selecionado na tela (NÃO regride para 7 dias fixos) e adota o novo layout sem erro de render.
8. typecheck/lint/vitest limpos; PDF renderiza sem exceção em ambos os caminhos (cron e sob demanda).

## Dev Notes
- **Caller do cron:** `packages/web/src/app/api/cron/analytics-report/route.ts:48` → `buildAnalyticsReportData(supabase, org.id)` (sem period).
- **Caller sob demanda (não regredir):** `packages/web/src/app/api/analytics/report/route.ts:25` → passa `period`.
- **Builder:** `packages/web/src/lib/analytics-report-data.ts`. O caminho COM `period` já faz quase tudo que
  queremos para 7 dias: usa `get_analytics_summary_ranged` (linha ~186), filtra empreendimento/origens por
  `[aggSince, aggUntil)`, monta comparativo período-vs-período-anterior (linhas ~158-159, 313-316) e calcula
  `periodTotal`/`perdidos`/`conversao` (linhas ~339-351). **Reaproveitar isso** construindo no cron um período de
  7 dias é o caminho de menor risco. `ResolvedPeriod` vem de `@web/lib/analytics/period` (shape confirmado:
  `{ range, sinceISO, untilISO, days }`). **Dica (@po):** não precisa montar o objeto na mão — `resolvePeriod("7d")`
  (period.ts:22, preset "7d") já devolve o período de 7 dias pronto; o cron só precisa chamar e repassar.
- **Card "Tempo médio" (agregado):** hoje só existe a tabela por corretor (`brokerResponseTimes`). Para o card,
  derivar a média ponderada por `count` desses mesmos dados (sem nova query). Se custo/edge-case inviabilizar,
  alinhar com @po um 4º card alternativo (ex.: Conversão %) — mas a preferência é seguir o mockup.
- **PDF:** `packages/web/src/lib/pdf/analytics-report-pdf.tsx`. Reordenar para: header → cards → **comparativo** →
  funil → tempo de atendimento. `wrap={false}` nos `<View>` de seção. Cores já são tokens no topo do arquivo
  (BRAND `#EA580C`, etc.) — reusar, não hardcodar novos.
- **Bug getDay():** `analytics-report-data.ts:140-142`. Ao migrar o cron para o período de 7 dias, `weekStart`/
  `leadsWeek`/`leadsMonth`/`totalLeads`/`leadsToday` (cards antigos) tendem a virar código morto no caminho do cron —
  remover o que não for mais usado (cuidado: o tipo `AnalyticsReportData` e o branch `isPeriod` do PDF ainda podem
  referenciá-los; ajustar com consistência).
- **Consistência tela ↔ PDF** ([[feedback-relatorio-segue-tela]]): manter. O cálculo do tempo de atendimento segue
  horário comercial (Story 75-60); o "por dia" segue dia comercial (Story 75-57).

### Testing
- `vitest packages/web` + `tsc --noEmit` (web) + lint limpos.
- Render dos dois caminhos sem exceção: cron (período 7d construído) e sob demanda (período da tela).
- Verificação manual: gerar o PDF do cron e conferir — (a) cabeçalho com janela 7d; (b) 4 cards novos; (c) funil/
  corretores/origens batendo com os números de 7 dias (devem casar com a coluna "Atual" do comparativo); (d) nenhum
  bloco cortado por quebra de página; (e) "Novos leads" ≠ 0 simulando geração no domingo.

## Riscos
- **Código morto / tipo `AnalyticsReportData`**: remover cards antigos pode quebrar o branch `isPeriod` do PDF se
  feito pela metade → mitigação: AC7/AC8 + revisão no QA dos dois caminhos. **Médio.**
- **Card "Tempo médio" agregado** pode ter edge-cases (sem atendimentos no período) → tratar "—"/sem dados. **Baixo.**
- **Funil 7d "vazio/topo-pesado"** pode estranhar a diretoria → caveat comunicado; é esperado. **Baixo/expectativa.**
- **Compartilhamento do componente PDF** (cron + sob demanda) → qualquer regressão de layout atinge os dois; testar ambos. **Médio.**

## File List
- `packages/web/src/lib/analytics-report-data.ts` — cron passa a usar janela de 7 dias; remoção/correção do bug getDay e dos cards antigos; agregado "tempo médio".
- `packages/web/src/lib/pdf/analytics-report-pdf.tsx` — layout "Movimento da semana", cards novos, `wrap={false}`, cabeçalho com janela.
- `packages/web/src/app/api/cron/analytics-report/route.ts` — (provável) construir/passar o período de 7 dias.
- `packages/web/src/app/api/analytics/report/route.ts` — período agora sempre resolvido (default 30d); removido o ramo `period=undefined` (que quebraria com período obrigatório).
- _(não alterado)_ `packages/web/src/lib/analytics/period.ts` — `resolvePeriod("7d")` reusado, sem mudanças.

## Dev Agent Record
- **Agent Model:** Claude Opus 4.8 (1M) · Modo: Interativo
- **Decisão do usuário:** "Limpar de vez" — `period` virou **obrigatório** e o ramo sem-período foi removido por inteiro (mata o bug `getDay()` e o código morto de uma vez).
- **Completion Notes:**
  - `analytics-report-data.ts`: assinatura `period: ResolvedPeriod` (obrigatório). Removidos `weekStart`/`getDay`, `monthStart`, `oneWeekAgo`/`twoWeeksAgo`, `todayStart` (+ import `commercialDayRangeForOrg`) e as 4 contagens antigas (Total/Hoje/Semana/Mês). Funil/empreendimento/origens/corretores agora sempre via `get_analytics_summary_ranged` na janela [since, until). Novos campos de saída: `periodRange`, `rangeLabel`, `novosLeads` (+`novosLeadsDelta`, da linha Total do comparativo), `fechamentos` (stage Fechamento), `perdidos` e `tempoMedioMin` (média ponderada por corretor; `null` se sem atendimentos). Removidos `totalLeads/leadsToday/leadsWeek/leadsMonth/isPeriod/periodTotal/mediaDiaria/conversao`.
  - `analytics-report-pdf.tsx`: layout "Movimento da semana" — header com chip `rangeLabel` + intervalo; 4 cards novos (Novos leads+Δ em destaque laranja, Fechamentos, Perdidos, Tempo médio); **comparativo como bloco herói** (eyebrow "DESTAQUE DO PERÍODO") logo após os cards; funil e tempo de atendimento como apoio. `wrap={false}` em cards, cada grupo do comparativo, funil e tabela de tempo → sem corte no meio. Seções standalone de Empreendimento/Origens/Corretor removidas (o comparativo já as cobre com Δ). Interface `AnalyticsReportData` atualizada.
  - `cron/analytics-report/route.ts`: passa `resolvePeriod("7d")`; corpo do e-mail alinhado aos 7 dias (Novos leads+Δ, Fechamentos, Perdidos — saem o "Total geral"/"este mês").
  - `analytics/report/route.ts`: período sempre resolvido (default 30d) — removido o ramo `undefined` que quebraria.
  - **Validação:** `tsc --noEmit` (web) **exit 0**; `eslint` nos 4 arquivos **exit 0**; `vitest` (raiz) **629/629 verdes**. **Render real** do PDF com dados de 28/06 (via `@react-pdf/renderer`): renderiza sem exceção (AC8) e a tabela de tempo **pulou inteira p/ pág. 2** (AC5 confirmado visualmente).
  - **Não regrediu** o PDF sob demanda: continua refletindo o período da tela (default 30d sem params).

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.69-relatorio-semanal-redesign-7dias.yml`) · readiness 9/10
- Verificação independente: `tsc` exit 0, `vitest` **629/629**, `eslint` 0, e **render real** do PDF (dados 28/06) sem exceção (AC8) com a tabela de tempo pulando inteira p/ pág.2 (AC5).
- Anti-regressão: grep confirmou **zero** referências a símbolos removidos (`getDay`/`weekStart`/`leadsWeek`/etc.) e **nenhum** consumidor usando campos antigos. Sob-demanda não regride.
- ACs 1-8 rastreados e atendidos (ver gate).
- Observações (não-bloqueantes): (low) "Novos leads" exclui perdidos p/ casar com a linha Total do comparativo; (low) "Fechamentos" = estágio atual; (medium) `wrap={false}` por grupo pode dar overflow se um grupo isolado exceder uma página no sob-demanda 90d — OK para o semanal; (low) properties/sources/brokers seguem computados mas não renderizados (mantidos de propósito).
- Recomendado: verificação visual do e-mail/anexo no 1º envio real pós-deploy.

## Change Log
- 2026-06-29 — @sm — Story criada. Redesign do relatório semanal (cron): janela única de 7 dias em todos os blocos,
  cards novos, layout "Movimento da semana" (comparativo herói), fix do bug `getDay()` que zera "Esta Semana" no
  domingo, e `wrap={false}` contra quebra de página. UX aprovada (mockup Uma). Ref: PDF 28/06 + código
  `analytics-report-data.ts`. Ver [[project-relatorio-semanal-redesign]], [[feedback-relatorio-segue-tela]].
- 2026-06-29 — @po — Validação 10 pontos: **GO, 9.5/10**. Anti-alucinação confirmou: bug `getDay()`
  (analytics-report-data.ts:140-142, usado em :183), caller do cron (cron/analytics-report/route.ts:48),
  `get_analytics_summary_ranged` (:186) e shape do `ResolvedPeriod` (period.ts:10-14). Dica adicionada:
  `resolvePeriod("7d")` entrega o período pronto. Status Draft → Ready.
- 2026-06-29 — @dev — Implementado nos 4 arquivos (modo interativo; decisão "limpar de vez"). Caminho único com
  `period` obrigatório; bug `getDay()` e ramo sem-período removidos; layout "Movimento da semana" com comparativo
  herói e `wrap={false}`. tsc 0 / lint 0 / vitest 629/629; render real do PDF OK (AC5/AC8 confirmados). Status
  Ready → Review.
- 2026-06-29 — @qa — Gate **PASS** (9/10). tsc 0 / vitest 629/629 / lint 0 / render real OK (AC5/AC8). Anti-regressão
  limpa (grep). 4 observações low/medium não-bloqueantes documentadas. Aguarda push @devops.
