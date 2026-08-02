# Story 86-2b — Gate de Tenancy: Regras R5-R9 (grants, relkind, colisão de migration)

## Metadata
- **Epic:** 86 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** 0 — Esteira e observabilidade (sem mudança funcional)
- **Story:** 86-2b (parte 2 de 3 da quebra de `86-2` — ver Change Log)
- **Status:** Ready
- **Priority:** P0 — estas 5 regras nasceram de erros reais deste ciclo (auditoria + hotfix); sem elas o gate mediria só a metade mais óbvia do problema.
- **Complexity:** G→M (dentro do G original de `86-2`, esta é a fatia mais densa: 5 regras, duas delas — R5 e R9 — com mecanismo distinto de introspecção pura de RLS)
- **Created:** 2026-08-02
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex) + @data-engineer (Dara)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[sql_rule_review, security_definer_review, migration_collision_review]`

---

## User Story

**Como** engenharia do Trifold CRM,
**Quero** as 5 regras do gate de tenancy que capturam os erros que **já aconteceram neste ciclo** — matview tratada como view comum, grant concedido a `PUBLIC` mas revogado só de `anon`, `SECURITY DEFINER` sem `search_path`, e duas migrations redefinindo a mesma função em silêncio —
**Para que** o gate não repita, em código, os mesmos erros que a auditoria e o @dev já cometeram e corrigiram manualmente uma vez.

---

## Context

Esta é a fatia 2/3 da quebra de `86-2` (ver `86-2a` para o motor e R1-R4). Estende o motor de `86-2a` com R5 a R9, seguindo o corte sugerido pela validação do @po: **"R5-R9 (grants, relkind, colisão)"**.

Diferente de R1-R4 (que reproduzem, quase literalmente, a proposta original de gate da auditoria), estas 5 regras existem porque **alguém errou primeiro e documentou o erro**:

- **R5** existe porque o @qa encontrou que `meta_campaign_roas` é `MATERIALIZED VIEW` (`relkind = 'm'`), não view comum — a auditoria original (P2) tinha prescrito `security_invoker` para ela, o que levantaria `ERRCODE 42809` se alguém tentasse aplicar. Uma matview é sempre materializada pelo `REFRESH` sob o role `postgres` (`rolbypassrls = true`), então RLS de tabela-base **nunca** filtra o conteúdo de uma matview — o controle correto é grant, não RLS.
- **R6** existe porque o @dev encontrou, ao implementar o fix de P1, que 5 das 8 RPCs vulneráveis tinham `EXECUTE` concedido ao **pseudo-role `PUBLIC`** (`=X/postgres` em `proacl`), não a `anon` — e o Supabase tem `ALTER DEFAULT PRIVILEGES ... TO anon, authenticated`, então todo objeto novo já nasce com grant. Um fix que revoga só de `anon` deixa o acesso intacto por herança de `PUBLIC`.
- **R7** existe porque o @dev encontrou, durante a implementação de P1, 3 funções `SECURITY DEFINER` sem `SET search_path` — vetor de hijack onde a função pode ser induzida a resolver um nome de objeto para algo plantado num schema sob controle do chamador (P13 da auditoria — achado que **não estava** no escopo original).
- **R8** é a regra original da auditoria (validação de `p_org_id` contra `user_org_id()`), mas com severidade **WARN → FAIL na Onda 2** — não é dia-1 porque hoje só existe uma org, então o dano de um `p_org_id` não validado é teórico até a segunda org existir.
- **R9** existe porque **quase reverteu um fix de segurança neste ciclo**: `195_sdr_na_roleta.sql` (Story 75-226) e `199_hotfix_rls_org_scope.sql` (o próprio PR #308 desta Onda) redefinem a mesma função (`roleta_pick_and_advance`) via `CREATE OR REPLACE FUNCTION`. Duas migrations que fazem isso **não conflitam no git** — são arquivos diferentes, sem overlap de linha — e o último aplicado ganha em silêncio. Se a ordem de aplicação tivesse sido invertida, o hotfix de segurança teria sido silenciosamente desfeito pela migration anterior.

Estas 5 regras são, em conjunto, a razão pela qual o prompt desta tarefa as chama de "quatro delas nasceram de erros reais cometidos neste ciclo" (mais R8, que é a original da auditoria, elevada a severidade específica). Nenhuma delas é reproduzível a partir de intuição — todas vêm de `docs/audits/rls-multi-tenant-audit.md` (correções P1, P2, P13) e de `CON-7`/`R15` do epic (a colisão de migration).

---

## Scope

### IN (esta story entrega)
- Regra **R5**: checa `pg_class.relkind` antes de prescrever `security_invoker`. `relkind = 'v'` → exige `security_invoker = on`. `relkind = 'm'` → `security_invoker` é inaplicável; a regra verifica **ausência de grant** de `SELECT` a `anon` **e** a `authenticated` (via `has_table_privilege`/`relacl`).
- Regra **R6**: para funções (`pg_proc.proacl`) e tabelas/views (`pg_class.relacl`), busca entrada explícita do pseudo-role `PUBLIC` (padrão `=X/postgres` para funções, `=r/postgres` ou similar para tabelas) — não apenas `anon`/`authenticated` nomeados.
- Regra **R7**: `pg_proc.prosecdef = true` **e** `proconfig` (ou ausência dele) sem entrada `search_path=...`.
- Regra **R8**: função `SECURITY DEFINER` cuja assinatura (`pg_get_function_identity_arguments`) contém `p_org_id`, cujo corpo (`pg_get_functiondef`) **não** contém a string `user_org_id` nem `assert_org_scope` — **e** que não está na allowlist de service-role-only. Severidade **WARN** nesta story (Onda 0); a promoção a FAIL na Onda 2 é uma flag de configuração que `86-2c` ativa via wiring — o mecanismo de severidade condicional nasce aqui, mas a mudança de estado é responsabilidade de story futura da Onda 2.
- Regra **R9**: compara migrations **ainda não aplicadas em produção** (via `supabase_migrations.schema_migrations`, tabela real de tracking do Supabase CLI já usada no projeto — ver Dev Notes) contra migrations presentes no PR, procurando `CREATE OR REPLACE FUNCTION <nome>` duplicado entre arquivos distintos não aplicados. Requer leitura de arquivos (`supabase/migrations/*.sql`), não só introspecção de banco — mecanismo estruturalmente diferente das outras 8 regras, documentado explicitamente nesta story.
- Extensão da lista `rules: Rule[]` do motor de `86-2a`, sem alterar sua assinatura.
- Testes unitários com fixtures que reproduzem exatamente os 4 padrões documentados acima (matview, grant PUBLIC, search_path ausente, colisão de migration).

### OUT (não entra nesta story)
- R10, R11, R12 — `86-2c` (dependem de artefatos de ondas futuras; nascem com flag desligada).
- Baseline, allowlist populada, wiring no CI, ressalva de cobertura no relatório, teste contra os 13 achados da auditoria — todos `86-2c`.
- A promoção efetiva de R8 de WARN para FAIL na Onda 2 — é uma mudança de configuração futura, não desta story (esta story só constrói o mecanismo de severidade parametrizável).
- Correção real do código de produção (aplicar `SET search_path`, revogar de `PUBLIC`, etc.) em qualquer objeto que a R5-R9 encontrar violando — isso é trabalho da Onda 1 (`86-4` em diante). Esta story **mede**, não corrige.

---

## Acceptance Criteria

- [ ] **AC1 — R5 checa `relkind` antes de agir:** para todo objeto em `pg_class` com `relkind IN ('v', 'm')` legível por `anon` ou `authenticated`: se `relkind = 'v'` e `security_invoker` não estiver `on`/`true`, violação `{ rule: "R5", table, detail: "view sem security_invoker" }`; se `relkind = 'm'` e houver `SELECT` grant a `anon` ou `authenticated`, violação `{ rule: "R5", table, detail: "matview com grant a {role} — security_invoker não se aplica (ERRCODE 42809); controle correto é revoke" }`. **Nunca** gerar recomendação de `security_invoker` para `relkind = 'm'`. [Source: epic-86 §9, R5; auditoria P2]

- [ ] **AC2 — R6 lê `PUBLIC`, não só `anon`/`authenticated`:** para funções (via `proacl`) e tabelas/views com `org_id` (via `relacl`), a regra detecta entrada do pseudo-role `PUBLIC` (padrão ACL `=X/postgres` para EXECUTE em função, `=r/postgres` ou equivalente para SELECT em tabela) e gera violação `{ rule: "R6", object, detail: "grant concedido a PUBLIC — revoke só de anon/authenticated não fecha o furo" }` mesmo quando `anon`/`authenticated` não aparecem nomeadamente no ACL. [Source: epic-86 §9, R6; auditoria P1, correção pós-implementação]

- [ ] **AC3 — R7 detecta `SECURITY DEFINER` sem `search_path`:** toda função com `pg_proc.prosecdef = true` cujo `proconfig` seja `NULL` ou não contenha um item `search_path=...` gera violação `{ rule: "R7", function, detail: "SECURITY DEFINER sem SET search_path — vetor de hijack" }`. [Source: epic-86 §9, R7; auditoria P13]

- [ ] **AC4 — R8 valida `p_org_id`, severidade WARN nesta onda:** toda função `SECURITY DEFINER` cuja assinatura contenha um parâmetro `p_org_id` e cujo corpo não referencie `user_org_id` nem `assert_org_scope`, e que não esteja na allowlist de service-role (allowlist vazia nesta story, populada em `86-2c` — mesma ressalva de `86-2a`/AC5), gera violação `{ rule: "R8", function, detail: "SECURITY DEFINER recebe p_org_id sem validar contra user_org_id()", severity: "WARN" }`. O motor suporta severidade por regra (não apenas FAIL binário) — mecanismo novo desta story, usado só por R8 por enquanto. [Source: epic-86 §9, R8: "WARN → FAIL na Onda 2"]

- [ ] **AC5 — R9 detecta colisão entre migrations não aplicadas:** o motor (a) consulta `supabase_migrations.schema_migrations` (via Management API) para determinar a última versão de migration aplicada em produção; (b) lista arquivos `supabase/migrations/*.sql` com número de versão maior que a última aplicada (isto é, migrations do PR ainda não em produção); (c) para cada arquivo desse conjunto, extrai por regex os nomes de função em statements `CREATE OR REPLACE FUNCTION <nome>`; (d) se dois ou mais arquivos distintos desse conjunto redefinem o mesmo nome de função, gera violação `{ rule: "R9", function, detail: "migrations {file1} e {file2} ambas redefinem {nome} — o último aplicado ganha em silêncio" }`. [Source: epic-86 §9, R9; CON-7, evidência real `195_sdr_na_roleta.sql` × `199_hotfix_rls_org_scope.sql`]

- [ ] **AC6 — R9 é validado contra o caso real documentado:** um teste unitário reproduz literalmente o cenário `195_sdr_na_roleta.sql`/`199_hotfix_rls_org_scope.sql` (fixtures com os nomes reais de arquivo e a função `roleta_pick_and_advance` redefinida nos dois) e confirma que R9 teria detectado a colisão **se ambos estivessem pendentes de aplicação simultaneamente**. Nota: no cenário real, `199` foi aplicado depois de `195` já estar em produção — o teste cobre o caso hipotético de ambos chegarem juntos num mesmo PR, que é o caso que R9 previne daqui pra frente. [Source: prompt desta tarefa — "quase reverteu a Story 75-226"]

- [ ] **AC7 — Motor estendido sem quebrar `86-2a`:** as 4 regras de R1-R4 continuam passando nos mesmos testes de `86-2a` após a extensão (nenhuma regressão). `rules: Rule[]` agora contém 9 entradas (R1-R9). [Source: epic-86 §10, regra de decomposição — a interface estável de `86-2a` é o que permite este corte]

- [ ] **AC8 — Mecanismo de severidade por regra, não binário:** o tipo `Violation` ganha um campo `severity: "FAIL" | "WARN"`; a saída (stdout + JSON) distingue os dois; o exit code continua `1` se houver qualquer `FAIL` (R1-R7, R9), mas uma execução com **apenas** violações `WARN` (R8) retorna exit code `0` — a promoção de R8 para FAIL é trabalho de configuração de story futura da Onda 2, não desta. [Source: epic-86 §9, R8]

---

## Tasks / Subtasks

- [ ] **T1** — Estender o motor de `86-2a` com suporte a severidade (AC8)
  - [ ] T1.1 — Adicionar `severity` ao tipo `Violation`
  - [ ] T1.2 — Ajustar lógica de exit code para considerar só `FAIL`

- [ ] **T2** — Implementar R5 (AC1)
  - [ ] T2.1 — Query `pg_class` + `pg_namespace` para objetos `relkind IN ('v','m')` legíveis por `anon`/`authenticated`
  - [ ] T2.2 — Ramificação por `relkind`: `'v'` → checar `security_invoker`; `'m'` → checar ausência de grant
  - [ ] T2.3 — Teste unitário reproduzindo `meta_campaign_roas` (matview) e `v_mensagens_admin` (view comum)

- [ ] **T3** — Implementar R6 (AC2)
  - [ ] T3.1 — Parser de ACL (`proacl`/`relacl`) reconhecendo o padrão `PUBLIC` (`=X/...`, `=r/...`) além de nomes de role explícitos
  - [ ] T3.2 — Teste unitário reproduzindo o padrão das 5 RPCs de P1 com grant só a `PUBLIC` (sem `anon` nomeado)

- [ ] **T4** — Implementar R7 (AC3)
  - [ ] T4.1 — Query `pg_proc` filtrando `prosecdef = true`
  - [ ] T4.2 — Parser de `proconfig` procurando `search_path=`
  - [ ] T4.3 — Teste unitário reproduzindo as 3 funções de P13 (`get_broker_dashboard_counts`, `get_broker_funnel_stats`, `seed_system_roles`)

- [ ] **T5** — Implementar R8 (AC4)
  - [ ] T5.1 — Query `pg_proc` filtrando `prosecdef = true` e assinatura com `p_org_id`
  - [ ] T5.2 — Busca por `user_org_id`/`assert_org_scope` no corpo via `pg_get_functiondef`
  - [ ] T5.3 — Marcar violação como `severity: "WARN"`

- [ ] **T6** — Implementar R9 (AC5, AC6)
  - [ ] T6.1 — Query `supabase_migrations.schema_migrations` para última versão aplicada
  - [ ] T6.2 — Leitura de `supabase/migrations/*.sql` (filesystem, não banco) e filtro por versão > última aplicada
  - [ ] T6.3 — Regex de extração de `CREATE OR REPLACE FUNCTION <nome>` por arquivo
  - [ ] T6.4 — Detecção de nome duplicado entre arquivos do conjunto "ainda não aplicado"
  - [ ] T6.5 — Teste unitário com o caso real `195`/`199`/`roleta_pick_and_advance` (AC6)

- [ ] **T7** — Regressão e validação final (AC7)
  - [ ] T7.1 — Rodar suíte completa de `86-2a` + novos testes de `86-2b` — 0 regressão
  - [ ] T7.2 — Rodar `pnpm gate:tenancy` contra produção (read-only, pós PR #308) e documentar violações R5-R9 encontradas

---

## Dev Notes

### Arquivo estendido (não criado do zero)
- `scripts/gate-tenancy.ts` — adiciona `ruleR5`...`ruleR9` à lista `rules` definida em `86-2a`.

### `supabase_migrations.schema_migrations` — confirmado real e em uso no projeto
Esta tabela de tracking do Supabase CLI **já é usada** em outras stories deste projeto para operações de rollback/registro manual de migration (ex.: `docs/qa/po-validation-31-2.md`, `docs/qa/gates/30-8-architect-gate.md` — ambos citam consultas e updates diretos nela via Management API). R9 apenas **lê** (`SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1`), nunca escreve.

### R9 — mecanismo é filesystem + banco, não só banco
Diferente de R1-R8 (introspecção pura de schema via Management API), R9 precisa **ler arquivos** do repositório (`supabase/migrations/*.sql`) — porque a colisão que importa é entre migrations que **ainda não foram aplicadas**, e o conteúdo delas só existe no filesystem até serem aplicadas. Isso significa que R9, ao contrário das outras 8 regras, só funciona corretamente quando `gate-tenancy.ts` roda **dentro do checkout do PR** (CI ou local), nunca isoladamente contra produção sem o código do PR presente. Documentar essa distinção no próprio código (comentário) para que quem ler `86-2c` (wiring) saiba que R9 não pode rodar como um cron independente do PR.

### R9 — regex de extração, não parser SQL completo
`CREATE OR REPLACE FUNCTION nome_da_funcao(` — regex razoável, mas frágil a variações de formatação (quebra de linha entre `FUNCTION` e o nome, schema-qualificado `public.nome_funcao`, etc.). [AUTO-DECISION] Escrever a regex tolerando espaço/quebra de linha e prefixo `public.` opcional, mas **não** tentar parsear SQL completo (fora de escopo — um parser SQL real seria semanas de trabalho para um ganho marginal). Se a regex falhar em capturar algum padrão exótico, isso é falso-negativo aceito nesta story — documentado como limitação conhecida, não como bug a resolver aqui.

### R6 — padrão de ACL do Postgres
`proacl`/`relacl` são arrays de `aclitem`, formato textual `grantee=privileges/grantor`. `PUBLIC` aparece como grantee **vazio** antes do `=` (ex.: `=X/postgres` para EXECUTE, `=r/postgres` para SELECT). Um role nomeado aparece como `nome=X/postgres`. A regra precisa distinguir `=X/postgres` (PUBLIC) de `anon=X/postgres` (role nomeado `anon`) — não basta fazer `LIKE '%X%'`, que casaria com qualquer grant de EXECUTE independente do grantee.

### Testing Standards
- Mesmo padrão de `86-2a`: testes unitários com fixtures sintéticas, sem chamada real à Management API na suíte de `pnpm test`.
- R9 precisa de fixture de **filesystem simulado** (mock de leitura de diretório + conteúdo de arquivo), não só de resposta de API mockada — atenção especial na implementação do teste (AC6).

---

## Testing

### Abordagem
Testes unitários com fixtures sintéticas para cada regra nova, incluindo os 4 casos reais documentados na auditoria/epic (matview, grant PUBLIC, search_path ausente, colisão de migration).

### Cenários de teste
1. **R5 — matview com grant:** fixture `relkind='m'`, `SELECT` grant a `anon` → violação `R5`, mensagem menciona `ERRCODE 42809`/inaplicabilidade de `security_invoker`.
2. **R5 — view comum sem invoker:** fixture `relkind='v'`, `security_invoker` ausente, legível por `authenticated` → violação `R5`.
3. **R5 — matview sem grant:** fixture `relkind='m'` sem grant a `anon`/`authenticated` → nenhuma violação.
4. **R6 — grant só a PUBLIC:** fixture com `proacl` contendo `=X/postgres` mas sem `anon=X/postgres` explícito → violação `R6` (reproduzindo as 5 RPCs de P1).
5. **R6 — grant nomeado, sem PUBLIC:** fixture só com `authenticated=X/postgres` → nenhuma violação `R6`.
6. **R7 — sem search_path:** fixture `prosecdef=true`, `proconfig=NULL` → violação `R7`.
7. **R7 — com search_path:** fixture `proconfig=['search_path=pg_catalog, public']` → nenhuma violação.
8. **R8 — `p_org_id` sem validação:** fixture com corpo de função sem `user_org_id` → violação `R8` com `severity: "WARN"`.
9. **R8 — `p_org_id` validado:** fixture com corpo contendo `user_org_id()` → nenhuma violação.
10. **R9 — caso real:** fixture com dois arquivos de migration não aplicados, ambos com `CREATE OR REPLACE FUNCTION roleta_pick_and_advance` → violação `R9` citando os dois arquivos (AC6).
11. **R9 — sem colisão:** fixture com dois arquivos redefinindo funções diferentes → nenhuma violação `R9`.
12. **R9 — função já aplicada não conta:** fixture onde só um dos dois arquivos está no conjunto "não aplicado" (o outro já tem versão <= última aplicada) → nenhuma violação (a colisão só importa entre pendentes).
13. **Exit code com só WARN:** rodar com apenas violações R8 → exit code `0`.
14. **Exit code com FAIL:** rodar com qualquer violação R1-R7/R9 → exit code `1`.
15. **Regressão:** todos os testes de `86-2a` (R1-R4) continuam passando após a extensão.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Parser de ACL (R6) mal implementado gera falso-negativo (não detecta `PUBLIC`) — repetindo o próprio erro que motivou a regra | **Alta** | Cenário de teste #4 é literal reprodução do achado real; revisão explícita no quality gate |
| R2 | Regex de R9 falha em capturar algum formato de `CREATE OR REPLACE FUNCTION` não previsto | Média | Documentado como limitação conhecida (Dev Notes); não é regressão de segurança (pior caso é não detectar uma colisão nova, mesmo estado de hoje) |
| R3 | R9 rodando fora do contexto de PR (ex.: cron isolado) dá falso-negativo por não ter acesso aos arquivos do PR | Baixa (mitigado por documentação explícita de que R9 exige checkout do PR) | Comentário no código + nota em `86-2c` (wiring) |
| R4 | Confundir `WARN` com "sem problema" e nunca promover R8 para FAIL na Onda 2 | Média | AC8 deixa explícito que a promoção é responsabilidade de story futura — não fechar esta story como se R8 já fosse bloqueante |

---

## Dependencies

- **Depende de:** `86-2a` (motor + interface `Rule` + R1-R4) — dependência dura, esta story só estende
- **Depende de (para execução com dado real):** PRE-0 (mesma razão de `86-2a`)
- **Bloqueia diretamente:** `86-2c` (baseline + allowlist + wiring, que consome as 9 regras completas)
- **Dependências técnicas:** `supabase_migrations.schema_migrations` (leitura), `supabase/migrations/*.sql` (leitura de filesystem)

---

## Definition of Done

- [ ] R5-R9 implementadas e integradas à lista `rules` do motor de `86-2a`
- [ ] Mecanismo de severidade (`FAIL`/`WARN`) implementado e usado corretamente por R8
- [ ] R9 implementada com o mecanismo de leitura de filesystem + `schema_migrations`
- [ ] 15 cenários de teste unitário passando, incluindo os 4 casos reais documentados
- [ ] Zero regressão nos testes de `86-2a`
- [ ] Validação manual contra produção (read-only, pós PR #308) documentada no Dev Agent Record
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
| 2026-08-02 | 0.1 | Story criada a partir da quebra de `86-2` (Epic 86 §10), fatia 2/3 (R5-R9). Todas as 5 regras rastreadas a achados reais documentados: R5→auditoria P2 (correção pós-@qa, matview), R6→auditoria P1 (correção pós-@dev, grant PUBLIC), R7→auditoria P13 (achado do @dev), R8→auditoria P1 original (severidade WARN→FAIL Onda 2), R9→CON-7/R15 do epic (colisão real `195`/`199`). [AUTO-DECISION] R9 implementado como leitura de filesystem + `schema_migrations`, mecanismo distinto das demais regras (introspecção pura) — documentado explicitamente para não ser confundido com um cron isolado. [AUTO-DECISION] Mecanismo de severidade por regra (`FAIL`/`WARN`) introduzido nesta story especificamente para suportar R8; promoção de R8 a FAIL na Onda 2 fica para story futura. | @sm (River) |
| 2026-08-02 | 0.2 | **Validação @po — GO limpo (10/10), zero correção.** Confirmado que AC7 (9 entradas em `rules`, zero regressão nos testes de `86-2a`) fecha a costura do corte 2a/2b/2c pelo lado do destino, simetricamente ao AC10 de `86-2a` (interface `Rule` com JSDoc de contrato) pelo lado da origem. Status Draft → **Ready** (aplicado por @sm a pedido do coordenador, em nome do veredito GO do @po — @po não pôde editar a story diretamente por restrição da própria tarefa dele). | @po (Pax) via @sm |

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
