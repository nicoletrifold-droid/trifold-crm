# Story 86-2c — Gate de Tenancy: Baseline, Allowlist e Wiring no CI (não-bloqueante)

## Metadata
- **Epic:** 86 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** 0 — Esteira e observabilidade (sem mudança funcional)
- **Story:** 86-2c (parte 3 de 3 da quebra de `86-2` — ver Change Log)
- **Status:** Ready
- **Priority:** P0 — sem esta story, o gate existe como script mas não roda em lugar nenhum, e a dívida de isolamento continua invisível em todo PR (o objetivo central da Onda 0).
- **Complexity:** M (dentro do G original de `86-2`, fatia final: baseline, allowlist, wiring, ressalva de cobertura, teste contra a auditoria)
- **Created:** 2026-08-02
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex) + @data-engineer (Dara)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[baseline_review, ci_wiring_review, coverage_disclaimer_review]`

---

## User Story

**Como** engenharia do Trifold CRM,
**Quero** o gate de tenancy rodando em todo PR, com a dívida atual registrada como baseline com catraca (nunca sobe), e a ressalva de cobertura impressa no próprio relatório,
**Para que** a Onda 1 tenha uma métrica visível e decrescente para trabalhar, sem que ligar o gate no dia 1 trave todo o desenvolvimento — e sem vender ao Gabriel uma falsa sensação de "isolamento garantido" quando o gate não cobre a maior superfície de risco (rotas service-role).

---

## Context

Fatia final da quebra de `86-2` (ver `86-2a` — motor + R1-R4 — e `86-2b` — R5-R9). Esta story:

1. Gera `docs/audits/rls-gate-baseline.json` e `docs/audits/tenancy-allowlist.yml` a partir do estado real de produção (pós PR #308).
2. Implementa a lógica de catraca sobre o motor de `86-2a`/`86-2b`: o gate não falha o PR nesta onda por violação **já conhecida** no baseline; falha se a contagem total **subir**, se uma violação **nova** aparecer fora do baseline, ou — sempre, sem exceção — se houver **qualquer** violação de R3.
3. Liga o job no `.github/workflows/ci.yml` criado em `86-1`, como job **não-bloqueante** (`continue-on-error: true` no nível do job, não dos steps individuais — distinção importante, ver Dev Notes).
4. Imprime a ressalva de cobertura exigida pelo §9 do epic, com o texto quase literal do documento-fonte.
5. Roda o teste "contra os 13 achados da auditoria" pedido pela AC original do epic — **com uma correção de escopo que esta story descobriu e precisa registrar** (ver "Aresta encontrada" abaixo).

### Aresta encontrada nesta story — a AC "13 achados" do epic não é literalmente cumprível por R1-R9

A AC original de `86-2` (epic §10) diz: *"Teste do gate contra os 13 achados da auditoria: cada achado que ainda existe é detectado; cada um já corrigido pelo PR #308 não aparece."* Ao mapear os 13 achados (P1-P13) contra as 9 regras mecânicas de R1-R9, nem todos são do tipo de coisa que R1-R9 sabe procurar:

| Achado | Fixado pelo PR #308 (Lote 0)? | Mecanismo do gate que o cobriria | Coberto por R1-R9? |
|---|---|---|---|
| P1 (RPCs `p_org_id` + `anon`) | ✅ sim | R6 (grant PUBLIC) + R8 (validação p_org_id) | Sim — não deve mais aparecer |
| P2 (views/matview sem invoker) | ✅ sim | R5 | Sim — não deve mais aparecer |
| P3 (`system_events` `USING(true)`) | ✅ sim | R4 | Sim — não deve mais aparecer |
| P4 (tabelas de custo legíveis por admin de cliente) | ✅ sim (revoke de `authenticated`) | — (tabelas de plataforma, sem `org_id` — fora do escopo de R1-R4 por desenho) | **Fora de escopo do gate por natureza**, não só nesta story |
| P5 (`privacy_consents` sem `org_id`) | ❌ não (é `86-4`, Onda 1) | R1/R2 — **mas só depois que `org_id` existir na tabela** | **Não detectável ainda** — R1-R3 só avaliam tabelas que **já têm** coluna `org_id`; uma tabela que deveria ter `org_id` e não tem é invisível para R1-R3 até a coluna existir |
| P6 (`financial_notification_log` sem escopo) | ✅ sim | R2 (a tabela já tem `org_id`; a policy não o referenciava) | Sim — não deve mais aparecer |
| P7 (Storage sem escopo de org) | ❌ não (Lote 2, story futura) | — (`storage.objects` não tem coluna `org_id`; é escopo por `path`, mecanismo diferente) | **Fora de escopo do gate por natureza** — R1-R9 introspeccionam `information_schema`/`pg_catalog` de `public`, não policies de `storage.objects` |
| P8 (16 tabelas com `org_id` e zero policies) | ❌ não (é o padrão "service-role only") | R2 | Sim, mas **resolvido pela allowlist**, não por correção — deve aparecer como "allowlisted", não como violação |
| P9 (UNIQUEs globais colidindo) | ❌ não (é `86-5`, Onda 1) | — (constraint `UNIQUE`, não RLS/grant/`SECURITY DEFINER`) | **Fora de escopo do gate por desenho** — nenhuma das 9 regras verifica constraints de unicidade |
| P10 (usuário em 1 org — decisão de produto) | N/A (decisão, não código) | — | **Não é um achado de código**, não se aplica ao gate |
| P11 (índices ausentes) | ❌ não (`86-5`/story de índice, Onda 1) | — (performance, não isolamento) | **Fora de escopo do gate por desenho** |
| P12 (`whatsapp_pricing` legível por todos) | N/A (risco aceito, não fixado) | R4 avaliaria, mas a tabela **não tem `org_id`** | **Fora de escopo de R4** por desenho (R4 só olha tabelas com `org_id`) — e é intencional (dado global aceito) |
| P13 (`SECURITY DEFINER` sem `search_path`) | ❌ não (explicitamente fora do hotfix, por decisão do @dev) | R7 | Sim — deve aparecer como violação ativa |

**Conclusão (contagem corrigida — ver AC7 para a versão de referência):** dos 13 achados, **6 são mecanicamente verificáveis pelo gate como está desenhado**: P1, P2, P3, P6 (Sim — fixados pelo PR #308, não devem mais aparecer), P8 (Sim, mas resolvido pela allowlist — aparece como "allowlisted", não violação) e P13 (Sim, violação ativa — R7). **Os outros 7 estão fora do que este teste afirma detectar nesta story**, e por duas razões distintas que não devem ser fundidas: (a) **6 são estrutural e permanentemente fora do alcance de R1-R9** — P4 (tabela de plataforma, sem `org_id`, nunca cai no escopo de R1-R4 por desenho), P7 (Storage, sem coluna `org_id`, mecanismo por `path`), P9 (constraint `UNIQUE`, nenhuma das 9 regras verifica isso), P10 (decisão de produto, não é achado de código), P11 (índice, é performance, não isolamento), P12 (dado global aceito, sem `org_id`) — nenhum desses é uma lacuna do gate, é categoria de problema que R1-R9 nunca pretendeu cobrir; (b) **1 está numa zona intermediária, não permanente** — P5 é mecanicamente detectável por R1/R2, mas só **depois** que `86-4` adicionar a coluna `org_id` a `privacy_consents`; antes disso é invisível ao gate por construção, não por bug, e por isso entra no mesmo grupo de "não afirmado por este teste" (AC7) sem ser da mesma natureza dos outros 6. Total: 6 cobertos + 7 não afirmados (6 permanentes + 1 temporário) = 13.

**Isto não é uma falha de implementação — é uma imprecisão da redação da AC do epic**, que generaliza "detectar os 13 achados" sem diferenciar achados de RLS/grant (o que o gate mede) de achados estruturais (constraint, storage, índice, decisão de produto) que sempre precisaram de mecanismo próprio. A correção desta story é **redigir a AC de teste de forma verificável**: o teste cobre os achados que estão dentro do desenho declarado do gate (R1-R9), e a **ressalva de cobertura** (que o próprio epic já exige) é o lugar certo — e o único honesto — para declarar os que não estão. Ver AC7.

---

## Scope

### IN (esta story entrega)
- `docs/audits/rls-gate-baseline.json`, gerado a partir de uma execução real do motor (`86-2a`+`86-2b`) contra produção pós PR #308 — contagem de violações conhecidas por regra e por tabela/objeto.
- `docs/audits/tenancy-allowlist.yml`, com as 16 tabelas de P8 (`fornecedores`, `imobiliarias`, `imob_cards`, `imob_columns`, `imob_card_comments`, `lancamentos`, `lancamento_cards`, `lancamento_columns`, `lancamento_card_attachments`, `lancamento_card_checklist`, `lancamento_card_comments`, `lancamento_card_fornecedores`, `marketing_brands`, `marketing_brand_assets`, `marketing_posts`, `supremo_sync_log`), cada uma com `reason:` explicando o padrão service-role-only (citando `131_imobiliarias.sql` como precedente, conforme a auditoria).
- Lógica de catraca: gate falha se (a) contagem total de violações **aumentar** em relação ao baseline, (b) uma violação **nova** aparecer numa tabela/objeto que não está no baseline nem na allowlist, ou (c) **qualquer** violação de R3 aparecer (sempre bloqueante, sem exceção de baseline).
- Wiring no `.github/workflows/ci.yml` (criado em `86-1`): novo job `tenancy-gate`, rodando `pnpm gate:tenancy`, com `continue-on-error: true` no **job** (não-bloqueante nesta onda — o PR não fica vermelho por violação já conhecida, mas o relatório aparece).
- Publicação do relatório no PR (comentário automático via GitHub Actions, usando o JSON gerado pelo motor) — implementação mínima aceitável: comentário de texto com a tabela de violações e a contagem total comparada ao baseline.
- Texto de ressalva de cobertura impresso em **todo** relatório do gate (stdout e comentário de PR), citando literalmente que o gate valida o banco, não o código, e não vê rota service-role sem `.eq("org_id")`.
- Ativação de R10/R11/R12 com flag desligada (as regras existem no código, registradas em `rules`, mas retornam vazio/skip até a flag de onda correspondente ser ligada — mecanismo de flag, não a lógica de negócio das regras em si, que nasce nas ondas 3/4/6 respectivamente).
- Teste do gate contra os achados da auditoria, com o escopo corrigido pela "Aresta encontrada" acima — ver AC7.

### OUT (não entra nesta story)
- Correção de qualquer violação encontrada — isso é a Onda 1 inteira (`86-4` em diante).
- Tornar o gate bloqueante — isso é o critério de saída da Onda 1 ("baseline em zero, gate bloqueante e verde").
- R10/R11/R12 com lógica de negócio real ativada — nascem desligadas; a ativação real é das stories que criam os artefatos que elas checam (`sellable_modules` em `86-27a`, `AiUsageContext` em `86-33`, `PLATFORM_READABLE_TABLES` em `86-22`).
- Testes de isolamento cross-tenant (`tests/tenancy/cross-tenant.spec.ts`) — depende do Supabase descartável (`86-3`), é trabalho de Onda 1.
- Qualquer alteração em `docs/architecture/saas-multi-tenant.md` — a imprecisão sobre `sync-schema.sh` encontrada em `86-2a` e a generalização da AC "13 achados" encontrada aqui devem ser reportadas ao @architect/@pm, não corrigidas pelo @sm ou pelo executor desta story (fora da autoridade destes agentes).

---

## Acceptance Criteria

- [ ] **AC1 — Baseline gerado a partir de dado real:** `docs/audits/rls-gate-baseline.json` criado rodando `pnpm gate:tenancy` contra produção **pós** aplicação do PR #308 (PRE-0), registrando contagem de violações por regra e por tabela/objeto no formato que a lógica de catraca (AC3) consome. [Source: epic-86 §9, "baseline com catraca"]

- [ ] **AC2 — Allowlist com `reason:` obrigatório:** `docs/audits/tenancy-allowlist.yml` criado com as 16 tabelas de P8, cada entrada com `table:` e `reason:` preenchidos (não vazio) — o motor de `86-2a` (AC5) já sabe ler este arquivo; esta story o popula pela primeira vez. [Source: epic-86 §9; auditoria P8]

- [ ] **AC3 — Catraca implementada:** o gate falha (mesmo dentro do job não-bloqueante — isto é, o **exit code** do script continua refletindo a regra, é o **wiring do CI** que decide não travar o PR) se: (a) contagem total de violações subir em relação a `rls-gate-baseline.json`, (b) violação nova aparece fora do baseline e fora da allowlist, ou (c) qualquer violação de R3 existir — R3 nunca entra em baseline, é sempre bloqueante na lógica do script (a não-bloqueância do job no CI é a única coisa que impede isso de travar o PR nesta onda; documentar essa tensão explicitamente no código). [Source: epic-86 §9, "o gate falha se (a) ... (b) ... (c) qualquer violação de R3"]

- [ ] **AC4 — Job wired no CI, não-bloqueante:** `.github/workflows/ci.yml` (de `86-1`) ganha um job `tenancy-gate` que roda `pnpm gate:tenancy` com `continue-on-error: true` no nível do job. `SUPABASE_MANAGEMENT_PAT` gravado como secret do repositório GitHub (via `gh secret set`, não via `vercel env add`/stdin — mecanismo diferente do gotcha da Vercel documentado no `CLAUDE.md`, mas mesma disciplina de nunca gravar valor vazio silenciosamente). [Source: epic-86 §10, story 86-2, AC "job entra não-bloqueante nesta onda"]

- [ ] **AC5 — Relatório publicado no PR:** o job `tenancy-gate` publica um comentário no PR (ou atualiza um existente) com a tabela de violações (regra, objeto, detalhe, severidade) e a comparação contra o baseline (subiu/desceu/igual). [Source: epic-86 §9, "Saída dupla: tabela legível + JSON para comentário no PR"]

- [ ] **AC6 — Ressalva de cobertura impressa:** todo output do gate (stdout local e comentário de PR) inclui, de forma destacada, o texto: *"Este gate valida o banco, não o código. Não vê rota em service-role sem `.eq('org_id')` — a maior superfície de risco (166 de 285 route handlers). O par indispensável é a regra de ESLint da story 86-14."* (paráfrase fiel do §9 do epic, adaptada para output de terminal/Markdown). [Source: epic-86 §9, último parágrafo, "Ressalva obrigatória, escrita no próprio relatório do gate"]

- [ ] **AC7 — Teste contra os achados da auditoria, com escopo corrigido:** um teste automatizado (ou checklist de verificação manual documentada, se automatizar não for viável nesta story — decisão do executor, documentada) confirma, para os **6 achados mecanicamente cobertos por R1-R9** (P1, P2, P3, P6, P8, P13 — ver tabela em "Aresta encontrada"): os que foram fixados pelo PR #308 (P1, P2, P3, P6) **não aparecem** como violação ativa; P8 aparece como **allowlisted**, não como violação; P13 aparece como violação **ativa** (R7, ainda não corrigido). Para os **7 achados fora do desenho do gate** (P4-plataforma, P5, P7, P9, P10, P11, P12), o teste **não** afirma detecção — a ressalva de cobertura (AC6) e a Dev Note desta story documentam explicitamente por que cada um está fora, para que ninguém leia "gate verde" como "auditoria fechada". [Source: epic-86 §10, story 86-2, AC "teste do gate contra os 13 achados" — **escopo corrigido nesta story, ver "Aresta encontrada"**]

- [ ] **AC8 — R10/R11/R12 registradas com flag desligada:** `rules` do motor ganha 3 entradas adicionais (stubs), cada uma checando uma flag de configuração (ex.: `GATE_ONDA >= 3` para R10, `>= 4` para R11, `>= 6` para R12) antes de executar qualquer lógica — retornando lista vazia de violações quando a flag não estiver satisfeita. Nenhuma lógica de negócio real (leitura de `sellable_modules`, `AiUsageContext`, `PLATFORM_READABLE_TABLES`) é implementada nesta story, porque os artefatos que essas regras checariam ainda não existem no schema. [Source: epic-86 §10, story 86-2, AC "R10/R11/R12 implementadas com flag de ativação por onda"]

---

## Tasks / Subtasks

- [ ] **T1** — Gerar baseline e allowlist a partir de dado real (AC1, AC2)
  - [ ] T1.1 — Confirmar que PRE-0 (PR #308) já foi aplicado em produção antes de rodar — se não, **bloquear** a execução desta task e escalar (esta story não pode ser fechada com baseline gerado pré-hotfix, isso mediria um estado que está prestes a mudar)
  - [ ] T1.2 — Rodar `pnpm gate:tenancy` contra produção, capturar JSON completo
  - [ ] T1.3 — Transformar a saída em `rls-gate-baseline.json` (contagem por regra/tabela)
  - [ ] T1.4 — Escrever `tenancy-allowlist.yml` com as 16 tabelas de P8 + `reason:` citando `131_imobiliarias.sql`

- [ ] **T2** — Implementar lógica de catraca (AC3)
  - [ ] T2.1 — Comparação de contagem total (atual vs. baseline)
  - [ ] T2.2 — Detecção de violação nova fora de baseline+allowlist
  - [ ] T2.3 — R3 sempre bloqueante, nunca entra em baseline

- [ ] **T3** — Wiring no CI (AC4, AC5)
  - [ ] T3.1 — Adicionar job `tenancy-gate` a `.github/workflows/ci.yml` (estender o arquivo de `86-1`, não recriar)
  - [ ] T3.2 — `continue-on-error: true` no job
  - [ ] T3.3 — `gh secret set SUPABASE_MANAGEMENT_PAT` no repositório (ou documentar o passo para quem tiver permissão, se o executor não tiver acesso de admin do repo)
  - [ ] T3.4 — Step de comentário de PR (ação simples: `actions/github-script` ou similar, publicando o markdown gerado pelo JSON)

- [ ] **T4** — Ressalva de cobertura (AC6)
  - [ ] T4.1 — Adicionar o texto fixo ao final de toda execução do script (stdout) e ao comentário de PR

- [ ] **T5** — Teste contra a auditoria, com escopo corrigido (AC7)
  - [ ] T5.1 — Escrever a tabela de mapeamento achado→regra→coberto (a mesma desta story, formalizada em teste ou checklist)
  - [ ] T5.2 — Validar P1/P2/P3/P6 ausentes como violação ativa (fixados por PR #308)
  - [ ] T5.3 — Validar P8 presente como "allowlisted"
  - [ ] T5.4 — Validar P13 presente como violação ativa (R7)
  - [ ] T5.5 — Documentar os 7 achados fora de escopo, com a razão de cada um, no próprio arquivo de teste/checklist (não deixar implícito)

- [ ] **T6** — R10/R11/R12 como stubs com flag (AC8)
  - [ ] T6.1 — Mecanismo de flag de onda (env var ou config, ex.: `GATE_ONDA` — nome a confirmar com @architect se já existir convenção)
  - [ ] T6.2 — 3 regras stub, cada uma checando sua flag antes de rodar

---

## Dev Notes

### Arquivos criados/estendidos
- `docs/audits/rls-gate-baseline.json` — novo
- `docs/audits/tenancy-allowlist.yml` — novo
- `.github/workflows/ci.yml` — estendido (job `tenancy-gate` adicionado ao arquivo de `86-1`)
- `scripts/gate-tenancy.ts` — estendido (catraca, ressalva, R10/R11/R12 stub)

### Por que `continue-on-error` no **job**, não nos **steps**
Se `continue-on-error: true` fosse posto em cada step individualmente, um erro no step de instalação de dependências (por exemplo) também não travaria o job — o que esconderia falhas de infraestrutura do próprio gate, não só violações de tenancy. Posto no nível do **job** (`jobs.tenancy-gate.continue-on-error: true`), qualquer falha do job (incluindo o script retornando exit code 1 por violação) marca o job como "neutro" no PR (não bloqueia merge), mas o log e o comentário do PR continuam visíveis e o step de execução do script em si roda normalmente até o fim — preservando a distinção entre "o gate rodou e encontrou algo" e "o gate quebrou".

### A tensão documentada em AC3 — por que ela precisa estar no código, não só nesta story
O script (`gate-tenancy.ts`) **sempre** retorna exit code 1 quando a lógica de catraca decide que há regressão (incluindo R3). É o **workflow do CI** que, nesta onda, escolhe não deixar isso travar o merge (`continue-on-error`). Essa separação é deliberada: quando a Onda 1 terminar e o baseline chegar a zero, a mudança para "gate bloqueante" é **só** remover `continue-on-error` do `ci.yml` — nenhuma mudança na lógica do script. Documentar isso no comentário do workflow (`# TODO(Onda 1): remover continue-on-error quando rls-gate-baseline.json chegar a zero`).

### Convenção de flag para R10/R11/R12 — a confirmar com @architect
O epic não define o nome exato da variável/mecanismo de "flag de ativação por onda". [AUTO-DECISION] Usar uma env var simples `GATE_ONDA` (inteiro, default `0`) lida pelo script, com cada regra R10/R11/R12 checando o mínimo necessário (`>= 3`, `>= 4`, `>= 6` respectivamente) → reason: mecanismo mais simples possível que atende à AC ("flag de ativação por onda") sem inventar infraestrutura nova (feature flag service, etc.) que o epic não pede. Se o @architect já tiver um padrão de feature flag no projeto (não encontrado nesta pesquisa), o executor deve preferir o padrão existente — sinalizar no Dev Agent Record se um padrão diferente for adotado.

### A ressalva de cobertura — texto-fonte
Copiado quase literalmente de `docs/architecture/saas-multi-tenant.md` §8.4 e do epic §9 (último parágrafo): *"Sem isso, o gate de RLS dá uma falsa sensação de segurança: o banco fica correto e a aplicação continua podendo vazar."* / *"este gate valida o banco, não o código. Não vê query em service-role sem `.eq("org_id")` — a maior superfície de risco. O par indispensável é a regra de ESLint da story 86-14."* Manter o número exato "166 de 285" tal como auditado — não arredondar nem generalizar, para que a ressalva permaneça verificável contra a fonte.

### Testing Standards
- Mesmo padrão das stories `86-2a`/`86-2b`: Vitest, fixtures sintéticas para a lógica de catraca; validação manual (documentada) contra produção real para os achados da auditoria, já que isso envolve estado real do banco pós-hotfix, não fixture.

---

## Testing

### Abordagem
- Testes unitários para a lógica de catraca (comparação com baseline, detecção de violação nova, R3 sempre bloqueante).
- Validação manual documentada (checklist ou teste com fixture representando o estado real pós-PR #308) para o mapeamento achado→regra do AC7.
- Validação do wiring no CI só é observável rodando um PR real (mesmo mecanismo de `86-1`, T3).

### Cenários de teste
1. **Catraca — sem regressão:** violações atuais == baseline → gate não falha por catraca.
2. **Catraca — contagem subiu:** uma violação a mais que o baseline, mesma tabela → falha.
3. **Catraca — violação nova fora de baseline/allowlist:** tabela nova com violação, ausente de ambos os arquivos → falha.
4. **Catraca — violação conhecida no baseline:** mesma contagem, mesma tabela → não falha (mesmo com violação presente).
5. **R3 sempre bloqueante:** violação de R3 presente, mesmo estando "no baseline" hipoteticamente → falha de qualquer forma (R3 nunca é elegível a baseline, por construção do próprio script, não por checagem externa).
6. **Allowlist neutraliza R2:** tabela nas 16 de P8, sem policy → não aparece como violação de R2, aparece como entrada "allowlisted" no relatório.
7. **AC7 — P1/P2/P3/P6 ausentes:** rodando contra fixture pós-hotfix, nenhuma violação correspondente a esses 4 achados aparece.
8. **AC7 — P13 presente:** rodando contra fixture pós-hotfix (sem fix de P13, que ficou fora do escopo do hotfix por decisão do @dev), violação R7 aparece para as 3 funções.
9. **R10/R11/R12 — flag desligada:** com `GATE_ONDA=0` (default), as 3 regras retornam lista vazia mesmo com dado que "violaria" a regra se ativa.
10. **Ressalva sempre presente:** todo output (com ou sem violação) inclui o texto da ressalva de cobertura.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Baseline gerado **antes** de PR #308 estar em produção mede um estado que vai mudar, invalidando a story inteira | **Alta** | T1.1 é um gate explícito — bloquear a task se PRE-0 não estiver confirmado |
| R2 | `continue-on-error` colocado no step errado (em vez do job) esconde falha real de infraestrutura do gate, não só violação de tenancy | Média | Dev Notes explica a distinção; revisão explícita no quality gate do @architect |
| R3 | AC "13 achados" interpretada literalmente (sem a correção desta story) leva a um teste que tenta forçar detecção de coisas estruturalmente fora de alcance (P7, P9, P11), gerando trabalho não previsto ou, pior, um teste que "finge" detectar via workaround | Média-Alta | AC7 já redige a versão corrigida; reportar a imprecisão ao @pm/@architect (ver Change Log) em vez de silenciosamente cumprir a letra da AC original |
| R4 | Secret `SUPABASE_MANAGEMENT_PAT` do GitHub Actions gravado incorretamente (ex.: com quebra de linha, valor truncado) e o gate falha silenciosamente em modo fallback sem ninguém perceber | Média | AC3 do fallback (`86-2a`) já emite aviso explícito quando cai em modo snapshot — reforçar que esse aviso apareça também no comentário de PR (AC5), não só no stdout do runner |

---

## Dependencies

- **Depende de:** `86-1` (workflow existente para estender), `86-2a` (motor + R1-R4), `86-2b` (R5-R9)
- **Depende de (bloqueante, não só para dado real):** PRE-0 (PR #308 aplicado em produção) — **esta story não pode gerar o baseline final antes disso** (diferente de `86-2a`/`86-2b`, que podem ser codificadas e testadas com fixtures antes de PRE-0; `86-2c` tem uma task, T1.1, que trava explicitamente nisso)
- **Bloqueia diretamente:** toda a Onda 1 (`86-4` em diante — precisam do baseline para saber o que corrigir e para o QA gate verificar que o baseline abaixou a cada lote)
- **Dependências técnicas:** `gh secret set` (permissão de admin no repositório GitHub — confirmar com @devops se o executor desta story tem acesso, ou se precisa delegar esse passo específico)

---

## Definition of Done

- [ ] `rls-gate-baseline.json` gerado contra produção real, pós PR #308
- [ ] `tenancy-allowlist.yml` com as 16 tabelas de P8 e `reason:` preenchido em todas
- [ ] Lógica de catraca implementada e testada (5 cenários dedicados)
- [ ] Job `tenancy-gate` wired em `.github/workflows/ci.yml`, `continue-on-error` no nível do job
- [ ] Comentário de PR funcionando (validado em PR real)
- [ ] Ressalva de cobertura presente em todo output
- [ ] R10/R11/R12 registradas como stub com flag de onda
- [ ] Teste do AC7 documentado com o escopo corrigido (6 achados mecanicamente cobertos, 7 fora de escopo com razão explícita)
- [ ] Imprecisão da AC original do epic ("13 achados") reportada ao @pm/@architect (ver Change Log desta story)
- [ ] @architect executou quality gate com verdict PASS ou CONCERNS documentados e aceitos
- [ ] @devops fez push do commit final

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave `coderabbit_integration` ausente).
> Validação de qualidade usará processo de revisão manual pelo @architect (quality gate desta story).

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-08-02 | 0.1 | Story criada a partir da quebra de `86-2` (Epic 86 §10), fatia 3/3 (baseline + allowlist + wiring de CI). **Aresta encontrada e documentada nesta story:** a AC original do epic ("teste do gate contra os 13 achados: cada achado que ainda existe é detectado") não é literalmente cumprível por R1-R9 — **6 dos 13 achados são mecanicamente cobertos** (P1/P2/P3/P6/P8/P13) e **7 ficam fora do que este teste afirma detectar** (P4, P5, P7, P9, P10, P11, P12): 6 deles (P4, P7, P9, P10, P11, P12) estrutural e permanentemente fora do desenho do gate (constraint de unicidade, policy de Storage sem coluna `org_id`, decisão de produto, índice, dado global aceito), e 1 (P5) numa zona intermediária — não permanente, só detectável após `86-4` adicionar a coluna `org_id` a `privacy_consents`. AC7 é a redação de referência (6 cobertos / 7 não afirmados, 6+7=13) — reused no Change Log 0.2 para corrigir uma contagem bamba encontrada na primeira versão deste parágrafo (que somava 7 nomes sob o rótulo "6"). Recomendado ao @pm/@architect: atualizar a redação da AC de `86-2` no epic para refletir essa distinção, e considerar se `sync-schema.sh` (§8.2 da arquitetura, corrigido em `86-2a`) precisa de ajuste no documento-fonte. [AUTO-DECISION] `continue-on-error: true` no nível do job, não dos steps → reason: preservar visibilidade de falha de infraestrutura do próprio gate, distinta de violação de tenancy. [AUTO-DECISION] Flag de onda via env var simples `GATE_ONDA` para R10/R11/R12 → reason: nenhum padrão de feature flag encontrado no repo; mecanismo mínimo que atende a AC sem inventar infraestrutura nova. | @sm (River) |
| 2026-08-02 | 0.2 | **Validação @po — GO (9/10), 1 correção aplicada.** Corte 2a/2b/2c confirmado. **Correção aplicada:** inconsistência de contagem no parágrafo "Conclusão" da seção "Aresta encontrada" — a versão anterior dizia "6 são mecanicamente verificáveis" mas listava 7 nomes (incluindo `P4-parcial-via-revoke-já-feito`, que a própria tabela de mapeamento já marcava como inteiramente fora de escopo, sem split); reescrito para bater exatamente com AC7 (6 cobertos: P1/P2/P3/P6/P8/P13; 7 não afirmados por este teste: P4/P5/P7/P9/P10/P11/P12, com P5 sinalizado à parte como caso temporário, não permanente). Esta entrada 0.1 acima também foi ajustada para a mesma contagem, eliminando a leitura de "6 fora" que conflitava com o "7 fora" de AC7. Status Draft → **Ready** (aplicado por @sm a pedido do coordenador, em nome do veredito GO do @po — @po não pôde editar a story diretamente por restrição da própria tarefa dele). | @po (Pax) via @sm |

---

## Dev Agent Record

### Agent Model Used
_A preencher pelo @dev/@data-engineer na implementação._

### Debug Log References
_A preencher._

### Completion Notes List
_A preencher._

### File List
_A preencher._

---

## QA Results

_A preencher pelo @architect (quality gate desta story)._
