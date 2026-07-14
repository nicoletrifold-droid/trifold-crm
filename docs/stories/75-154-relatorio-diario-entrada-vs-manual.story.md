# Story 75-154 — Relatório diário: "Leads de entrada" (funil) × cadastros manuais + origem das redistribuições

**Status:** Done
**Epic:** Relatório diário do diretor / métricas de leads
**Relacionado:** 75-45 (relatório diário original), 75-57/75-58 (dia comercial ciente da agenda), Epic 64 / 75-149 (bolsão + `pegar_lead_bolsao`), 75-151 ("Leads hoje" = volume bruto)
**Complexidade:** M (2 arquivos TS + testes + 1 template Meta novo; sem migration, sem UI)

## Contexto
O **Relatório Diário Trifold** (WhatsApp, cron 07:59 BRT, dia comercial anterior — `daily-leads-report.ts` + `send-daily-report.ts`, template HSM `relatorio_diario_leads`) conta em **"🆕 Leads recebidos"** *todo registro de lead criado no dia* (`leads` created, `segmento='principal'`, `is_active=true`). Isso inclui **cadastros manuais** que os corretores lançam direto no CRM, inflando o número.

**Incidente 2026-07-14 (motivador):** o relatório de 13/07 mostrou **"38 leads recebidos"** e o diretor Alexandre questionou *"38 de vdd?"*. Investigação em prod (reproduzindo a janela do dia comercial 13/07 = `2026-07-13T00:00Z → 2026-07-14T00:00Z`, fechamento 21:00 BRT):

| Grupo | Qtd | Como se identifica |
|---|---|---|
| **Entrada real (funil)** | **15** | Meta Ads 9 + WhatsApp 6. Têm sinal de origem: `metadata` de campanha (Meta Ads/CTWA), OU `ai_summary` (Nicole atuou), OU ≥1 `messages`, OU registro em `lead_distribution_log`. (14 distribuídos + 1 CTWA represado.) |
| **Cadastros manuais** | **23** | `assigned_broker_id` = **user_id** (atribuição direta, não roleta), **0 mensagens**, `ai_summary`/`metadata` vazios; Robson e Valeria lançaram/trabalharam à mão (`broker_note` acao=whatsapp), a maioria perdido/no-show; inclui teste ("TESTE PWA") e lixo (notas "Em"/"Ghhh"/"sss"). Todos com `channel='whatsapp'` → é o que inflava o "WhatsApp 29" (5-6 inbound reais + 23 manuais). "Meta Ads 9" sempre esteve correto. |

**Decisão do diretor (Marcos):** o número principal deve refletir o **volume de entrada real (funil)**; os cadastros manuais aparecem em **linha separada**, sem inflar o topo. E as **redistribuições** devem mostrar a **origem** (bolsão × roleta).

## Story
**As a** diretor/gestor comercial que lê o relatório diário no WhatsApp,
**I want** que "Leads recebidos" mostre só a **entrada real do funil**, com os cadastros manuais e a origem das redistribuições **explícitos**,
**so that** o número do topo reflita a demanda inbound de verdade e ninguém precise perguntar "é de verdade?".

## Regra de classificação (núcleo da story)
Um lead criado na janela conta como **ENTRADA (funil)** se tiver **qualquer** sinal de origem real:
- `metadata` de campanha não-vazio (`metadata && Object.keys(metadata).length > 0` — Meta Ads / CTWA), **ou**
- `ai_summary` preenchido (Nicole atuou), **ou**
- ≥ 1 registro em `messages` para o lead, **ou**
- ≥ 1 registro em `lead_distribution_log` (distribuído pela roleta).

Caso contrário → **cadastro manual**. `entrada = |funil|`, `manuais = total − entrada`.

## Origem das redistribuições
- `redistribuições = totalEventos − leadsUnicosDistribuidos` (como hoje).
- `redistribuições de bolsão` = **nº de activities `type='bolsao_pull'` na janela** (a RPC `pegar_lead_bolsao` / mig 164 grava um `lead_distribution_log status='distributed'` extra a cada puxada).
- `redistribuições de roleta` = `redistribuições − bolsão`.
- **Guard carryover:** `bolsão = min(pulls, redistribuições)` e `roleta = max(0, redistribuições − bolsão)` — cobre o caso do lead cujo 1º envio foi em dia anterior e que é puxado do bolsão hoje.

## Acceptance Criteria
1. **AC1** — O número principal do relatório passa a ser **"🆕 Leads de entrada: N"**, contando **só** os leads do funil pela regra acima (13/07 → 15). Cadastros manuais **não** entram nesse número.
2. **AC2** — Nova linha **"✍️ Cadastros manuais de corretor: M"** (13/07 → 23).
3. **AC3** — **"📥 Por canal"** conta **só** os canais dos leads de entrada (funil) — não os manuais (13/07 → "Meta Ads 9 · WhatsApp 6").
4. **AC4** — A linha **"📦 Distribuídos"** usa o denominador do funil: `"{coberturaUnica} de {entrada} do funil"` (13/07 → "14 de 15 do funil").
5. **AC5** — Quando houver redistribuição, a linha "Distribuídos" mostra a origem, **dentro do mesmo parâmetro** (sem placeholder novo): `"… (R redistribuições: bolsão X · roleta Y)"` com plural/singular correto (13/07 → "18 envios no total (4 redistribuições: bolsão 4 · roleta 0)"). Sem redistribuição → mantém o formato enxuto atual.
6. **AC6** — Blocos **"Por corretor"** e **"Tempo médio de atendimento"** permanecem **inalterados** (já são baseados em `lead_distribution_log` / `primeiro_atendimento_em`).
7. **AC7** — Envio passa a usar um **template Meta novo `relatorio_diario_leads_v2`** (pt_BR) com **7 parâmetros** na ordem: `{{1}}` data · `{{2}}` entrada · `{{3}}` canais · `{{4}}` manuais · `{{5}}` corretores · `{{6}}` distribuídos · `{{7}}` tempo. `send-daily-report.ts` monta os 7 params nessa ordem.
8. **AC8** — A regra de classificação funil×manual e a formatação da linha "Distribuídos" (com origem) ficam em **funções puras exportadas e testadas** (padrão do arquivo, que já testa `formatDistribuidos`/`aggregateBrokerRows`).
9. **AC9** — **Sem migration** (nenhuma mudança de schema; os sinais já existem em `leads`/`messages`/`lead_distribution_log`/`activities`).

## Corpo do template `relatorio_diario_leads_v2` (para submeter na Meta — @devops)
```
📊 Relatório Diário Trifold — {{1}}
🆕 Leads de entrada: {{2}}
📥 Por canal: {{3}}
✍️ Cadastros manuais de corretor: {{4}}
👥 Por corretor (distribuídos → atenderam): {{5}}
📦 Distribuídos: {{6}}
⏱️ Tempo médio de atendimento: {{7}}
Bom dia! Relatório gerado automaticamente.
```

## Tasks / Subtasks
- [x] **Task 1 — Classificação funil×manual** (AC: 1, 2, 3, 8)
  - [x] Em `daily-leads-report.ts`, exportar `isLeadFunil({ metadata, ai_summary }, hasMessage, hasDistribution): boolean` (pura).
  - [x] Em `buildDailyLeadsReport`: adicionar `metadata, ai_summary` ao `select` dos leads; buscar set de `lead_id` com ≥1 `messages`; classificar cada lead → funil/manual.
  - [x] `entrada = |funil|`; `manuais = total − entrada`; `canalCounts` calculado **só sobre funil**.
- [x] **Task 2 — Linha "Distribuídos" + origem** (AC: 4, 5, 8)
  - [x] Reescrever `formatDistribuidos` para receber `{ funil, coberturaUnica, totalEventos, leadsUnicos, redistribBolsao }` e emitir `"{cobertura} de {funil} do funil …"` + `"(R redistribuições: bolsão X · roleta Y)"` (com guard carryover).
  - [x] Em `buildDailyLeadsReport`: `redistribBolsao` = count de `activities type='bolsao_pull'` na janela (org + janela).
- [x] **Task 3 — Vars + envio (template v2)** (AC: 1, 2, 7)
  - [x] `DailyReportVars`: renomear `total → entrada`, adicionar `manuais`. Ordem final: data, entrada, canais, manuais, corretores, distribuidos, tempo.
  - [x] `send-daily-report.ts`: `template.name = "relatorio_diario_leads_v2"`; `params = [data, entrada, canais, manuais, corretores, distribuidos, tempo]`.
- [x] **Task 4 — Testes** (AC: 8)
  - [x] `daily-leads-report.test.ts`: casos de `isLeadFunil` (cada sinal isolado + manual puro); `formatDistribuidos` novo formato (13/07: 14 de 15 do funil · 18 envios (4 redistribuições: bolsão 4 · roleta 0)); guard carryover (bolsão > redistrib → roleta 0, bolsão clampado); singular/plural; sem redistribuição.
- [x] **Task 5 — Verificação** (AC: 1-6, 9)
  - [x] `npm run type-check` (0 erros) + `npm run lint` (0 nos arquivos tocados) + `npm test` (vitest **966/966**, sem regressão).
  - [x] Simulação read-only em prod da janela 13/07 confirmando **15 entrada (Meta Ads 9 · WhatsApp 6) / 23 manuais / 14 de 15 do funil · 18 envios (4 redistribuições: bolsão 4 · roleta 0)** — bate 1:1 com o esperado.
  - [ ] **DEFERIDO p/ @devops:** submeter `relatorio_diario_leads_v2` na Meta e aguardar APPROVED **antes** do deploy do código (o código novo aponta para o template v2; sem ele aprovado, o envio falha). Deploy + template devem ir juntos.

## Dev Notes
- **Semântica:** "entrada/funil" ≠ "distribuídos". Um lead pode entrar (funil) e ficar represado sem distribuir (caso "Cida" em 13/07: CTWA do VIND, `ai_summary` preenchido, ainda não distribuído). Por isso `entrada=15` e `distribuídos=14`.
- **Detecção de bolsão:** `pegar_lead_bolsao` (mig 164) insere `lead_distribution_log status='distributed'` **e** `activities type='bolsao_pull'` a cada puxada — contar os `bolsao_pull` da janela é a forma direta e validada (13/07: 4 pulls = 4 redistribuições, todas de bolsão). Ver memória `project-bolsao-leads` / `project-relatorio-diario-funil-vs-manual`.
- **`hasDistribution` na classificação:** os leads são criados na janela, logo qualquer distribuição deles também cai na janela → reusar `distinctDistributedIds` (já computado) é suficiente; `metadata`/`ai_summary`/`messages` cobrem o resto.
- **Template na Meta:** os rótulos ("🆕 Leads de entrada:", etc.) vivem no **corpo do template registrado na Meta**, não no código — por isso a mudança de rótulo + a linha nova de manuais exigem template **novo** (`_v2`, 7 params). A quebra bolsão/roleta **não** adiciona placeholder (vai dentro do texto de `{{6}}`, linha única — regra de parâmetro HSM: sem quebra de linha/tab/4+ espaços).
- **Regra do projeto (`feedback-nao-quebrar-o-que-funciona`):** raio de impacto = só o relatório diário (2 arquivos + template). "Por corretor"/"Tempo" intocados. Testar caminho real via simulação SQL da janela 13/07.
- **Sem migration** (AC9): nenhuma mudança de schema.

### Testing
- Funções puras testadas via vitest (padrão existente do arquivo). `buildDailyLeadsReport`/`sendDailyReport` (DB/HTTP) não têm teste unitário no repo → verificação por simulação read-only em prod (mesmo padrão de 75-45/75-151).
- Suíte existente deve permanecer verde; `typecheck`/`lint` sem novos erros. **Atenção:** os testes atuais de `formatDistribuidos` mudam (assinatura/rótulo "recebidos"→"do funil") — atualizar como parte da story.

## Out of Scope
- Blocos "Por corretor" e "Tempo médio" (inalterados).
- Retroatividade de relatórios já enviados.
- Detectar/impedir cadastro manual com `channel='whatsapp'` enganoso na criação do lead (é a causa do "canal errado", mas é outra frente — aqui só **classificamos** no relatório).
- Dashboard/analytics on-screen (o relatório espelha a tela em `analytics-report-data.ts`, mas o card "Leads hoje" = volume bruto por decisão da 75-151; esta story só muda o **relatório diário**).

## Riscos
- **Template v2 não aprovado antes do deploy** → envio falha (template inexistente). Mitigação: AC7 + Task 5 exigem APPROVED antes do deploy; @devops sincroniza template + push.
- **Classificação falso-manual** (lead inbound sem nenhum dos 4 sinais) → subcontagem de entrada. Mitigação: 4 sinais independentes cobrem os caminhos de origem; validado contra 13/07.
- **Roleta negativa** por carryover de bolsão. Mitigação: guard `min/max` no `formatDistribuidos` + teste dedicado.

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-14 | 0.1 | Story criada: relatório diário separa "Leads de entrada" (funil) de cadastros manuais + origem das redistribuições (bolsão×roleta); template Meta v2 (7 params); sem migration. Motivada pelo questionamento "38 de vdd?" (relatório 13/07). | @sm (River) |
| 2026-07-14 | 0.2 | Validação PO (10-point): **GO, 9/10**. Fidelidade técnica confirmada — `send-daily-report.ts` usa 6 params/template `relatorio_diario_leads` (v2 justificado), `DailyReportVars` tem `total` (rename→entrada OK), `messages.lead_id` e `activities.type='bolsao_pull'` existem, `pegar_lead_bolsao` (mig 164) grava `lead_distribution_log status='distributed'` + activity `bolsao_pull` (base da contagem de bolsão). AC testáveis, escopo IN/OUT claro, dependência externa (aprovação do template) mapeada em AC7/Task 5, sem migration (AC9). Sem invenção (Article IV OK). Único ponto <10: dependência de aprovação Meta é externa (fora do controle do dev) — mitigada. Status Draft → Ready. | @po (Pax) |
| 2026-07-14 | 0.3 | Implementação @dev: `isLeadFunil` (pura) + classificação funil×manual em `buildDailyLeadsReport` (novos sinais `metadata`/`ai_summary`/`messages`); `formatDistribuidos` reescrita ("do funil" + origem bolsão/roleta c/ guard carryover); `DailyReportVars` (total→entrada, +manuais, 7 campos); `send-daily-report.ts` → template `relatorio_diario_leads_v2` (7 params). type-check 0 erros, lint 0 nos arquivos tocados, vitest **966/966**. Simulação read-only prod 13/07 = 15 entrada (MetaAds 9·WA 6) / 23 manuais / "14 de 15 do funil · 18 envios (4 redistribuições: bolsão 4 · roleta 0)". Sem migration. Status Ready → Review. | @dev (Dex) |
| 2026-07-14 | 0.4 | QA gate (@qa): **PASS 9/10**. 7 checks PASS; AC1-AC9 traçados; verificações adversariais (X≤Y garantido, guard carryover testado, sem query duplicada, messages sem org_id). vitest 966/966. Gate: docs/qa/gates/75.154-relatorio-diario-entrada-vs-manual.yml. −1 = dependência externa (aprovação do template Meta v2 antes do deploy). Pendente @devops: submeter template v2 (APPROVED) + push junto. | @qa (Quinn) |
| 2026-07-14 | 0.5 | @devops (parcial): template HSM `relatorio_diario_leads_v2` (pt_BR, UTILITY, 7 params) **submetido via Graph API** ao WABA `35524602787124855` — **id `1571227027692653`, status PENDING**. Corpo clona o estilo do v1 (blocos separados por linha em branco; `{{3}}` canais e `{{5}}` corretores em linha própria) + 2 linhas novas ("Leads de entrada" e "Cadastros manuais"). **Push/deploy AGUARDANDO APPROVED** (decisão do usuário: só após aprovação). Código ainda NÃO commitado/pushado. | @devops (Gage) |
| 2026-07-14 | 0.6 | Template `relatorio_diario_leads_v2` (id `1571227027692653`) **APPROVED** pela Meta (~16 min após submissão). Dependência externa resolvida → liberado para commit + push. | @devops (Gage) |
| 2026-07-14 | 0.7 | @devops: commit + push + **PR #193 mergeado (squash) na `main`** após build de preview Vercel verde → deploy de produção. Template v2 APPROVED antes do merge (envio roda no cron 07:59 BRT). Status Review → **Done**. | @devops (Gage) |

## Dev Agent Record
### Agent Model Used
Claude Opus 4.8 (1M context) — @dev (Dex)

### Debug Log References
Simulação read-only em prod (`dsopqkqjkmhytudaaolv`), janela do dia comercial 13/07
(`2026-07-13T00:00Z → 2026-07-14T00:00Z`, fechamento 21:00 BRT), aplicando a lógica nova
(`isLeadFunil` + `formatDistribuidos`) sobre `leads`/`lead_distribution_log`/`messages`/`activities`:

```
🆕 Leads de entrada: 15
📥 Por canal: Meta Ads 9 · WhatsApp 6
✍️ Cadastros manuais de corretor: 23
📦 Distribuídos: 14 de 15 do funil · 18 envios no total (4 redistribuições: bolsão 4 · roleta 0)
```

Total bruto de leads criados na janela = 38 (15 funil + 23 manuais), confirmando o "38" que o
diretor viu e a origem da inflação (23 cadastros manuais, todos `channel='whatsapp'`, 0 mensagens).

### Completion Notes
- **Task 1:** `isLeadFunil` classifica por 4 sinais independentes (metadata de campanha, ai_summary,
  ≥1 mensagem, distribuição). `buildDailyLeadsReport` passou a: (a) selecionar `metadata, ai_summary`;
  (b) buscar o set de leads com mensagem; (c) reusar `distinctDistributedIds`; (d) montar `funilIds`,
  `entrada`, `manuais`; (e) calcular `canalCounts` **só sobre funil**. A query de `lead_distribution_log`
  foi movida para antes da classificação (era usada só no fim) — sem query duplicada.
- **Task 2:** `formatDistribuidos` novo denominador "do funil" e sufixo de origem
  `(R redistribuições: bolsão X · roleta Y)` com guard carryover (`bolsão = min(pulls, redistrib)`,
  `roleta = max(0, redistrib − bolsão)`). `redistribBolsao` = `count(activities type='bolsao_pull')` na janela.
- **Task 3:** `DailyReportVars` de 6→7 campos (`total`→`entrada`, +`manuais`); `send-daily-report.ts`
  aponta para `relatorio_diario_leads_v2` e envia 7 params na ordem do corpo do template.
- **Task 4:** +5 casos `isLeadFunil` e reescrita dos 7 casos `formatDistribuidos` (inclui guard
  carryover e mista bolsão/roleta). Suíte do arquivo: 30/30.
- **Sem migration** (AC9). **Template v2 NÃO submetido** nesta sessão (ação externa na Meta) — deferido
  p/ @devops, deve estar APPROVED antes do deploy (o código já referencia o v2).

### File List
- `packages/web/src/lib/reports/daily-leads-report.ts` (modificado — `isLeadFunil`, `formatDistribuidos`, `DailyReportVars`, `buildDailyLeadsReport`)
- `packages/web/src/lib/reports/send-daily-report.ts` (modificado — template v2 + 7 params)
- `packages/web/src/lib/reports/daily-leads-report.test.ts` (modificado — testes `isLeadFunil` + `formatDistribuidos`)
- `docs/stories/75-154-relatorio-diario-entrada-vs-manual.story.md` (novo — story)

## QA Results

### Review Date: 2026-07-14
### Reviewed By: Quinn (Test Architect & Quality Advisor)

**Veredito: PASS** (readiness 9/10 — o −1 é a dependência externa de aprovação do template na Meta, fora do controle do dev).

Revisão adversarial da branch `feat/75-154-relatorio-entrada-vs-manual`. Mudança contida ao relatório diário (2 arquivos de código + testes), com funções puras testadas e simulação read-only em prod batendo 1:1 com o esperado.

| Check | Resultado | Nota |
|---|---|---|
| 1. Code review | PASS | `isLeadFunil`/`formatDistribuidos` puras; `buildDailyLeadsReport` reordenado sem query duplicada; ordem de declaração correta; `messages` consultada **sem `org_id`** (convenção) |
| 2. Unit tests | PASS | vitest **966/966 (87 files)**; +5 casos `isLeadFunil`, 7 de `formatDistribuidos` (guard carryover, mista, singular/plural) |
| 3. Acceptance criteria | PASS | AC1–AC9 (trace no gate) |
| 4. No regressions | PASS | "Por corretor" e "Tempo médio" intocados; cron só repassa `vars`; nenhum outro consumidor lê campos de `DailyReportVars` |
| 5. Performance | PASS | +2 queries leves/dia (messages; count `bolsao_pull` head) — volume diário pequeno |
| 6. Security | PASS | PostgREST parametrizado; sem SQL dinâmica; sem novo dado exposto |
| 7. Documentation | PASS | cabeçalhos citam a story; corpo do template v2 documentado; Dev Agent Record + File List completos |

**Verificações-foco (adversariais):**
- Todo lead distribuído é `funil` (`isLeadFunil` true se `hasDistribution`) → `coberturaUnica ⊆ funil` ⇒ "X de Y" sempre com X ≤ Y (14 ≤ 15). Impossível o antigo estouro "13 de 9".
- Guard carryover testado (pulls 2 > redistrib 1 → bolsão 1 · roleta 0); roleta nunca negativa.
- Sem query duplicada de `lead_distribution_log`: a da janela subiu e é reusada; a da seção de tempo é a original (por `attendedRows`), inalterada.
- Diff vs main: story + gate + `daily-leads-report.ts` + `send-daily-report.ts` + test. Nada fora de escopo.

**Observação (não bloqueante, mas crítica p/ deploy):** o código já aponta para `relatorio_diario_leads_v2`. O template **precisa estar APPROVED na Meta antes do 1º envio** (cron 07:59 BRT) — senão todos os envios falham. Template + deploy vão **juntos** (responsabilidade @devops).

### Gate Status

Gate: PASS → docs/qa/gates/75.154-relatorio-diario-entrada-vs-manual.yml

**Pendências para @devops (`*push`):** (1) submeter o template HSM `relatorio_diario_leads_v2` (pt_BR) na Meta e aguardar **APPROVED**; (2) push + deploy **junto** com a aprovação do template. Status → **Done** após deploy + template APPROVED.
