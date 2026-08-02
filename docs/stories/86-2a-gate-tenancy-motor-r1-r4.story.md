# Story 86-2a — Gate de Tenancy: Motor de Introspecção + Regras R1-R4

## Metadata
- **Epic:** 86 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** 0 — Esteira e observabilidade (sem mudança funcional)
- **Story:** 86-2a (parte 1 de 3 da quebra de `86-2` — ver Change Log)
- **Status:** Ready
- **Priority:** P0 — fundação do gate de tenancy; sem ela, `86-2b` e `86-2c` não têm motor para estender.
- **Complexity:** M (dentro do G original de `86-2`, esta é a fatia "motor + R1-R4")
- **Created:** 2026-08-02
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex) + @data-engineer (Dara)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[schema_introspection_review, sql_rule_review, rls_test]`

---

## User Story

**Como** engenharia do Trifold CRM,
**Quero** um motor de introspecção de schema (`scripts/gate-tenancy.ts`) com as 4 regras fundamentais de isolamento (R1-R4) implementadas contra o schema real de produção,
**Para que** exista, pela primeira vez, uma medição objetiva e repetível de quais tabelas com `org_id` estão sem policy org-scoped — em vez de depender de auditoria manual pontual como a que já foi feita uma vez (`docs/audits/rls-multi-tenant-audit.md`).

---

## Context

Esta story é a primeira fatia de `86-2` (Gate de tenancy R1-R12 com baseline e catraca), quebrada em três (`86-2a`/`86-2b`/`86-2c`) conforme a regra de decomposição do §10 do epic e o corte explicitamente sugerido pela validação do @po (`docs/qa/epic-86-po-validation.md`, tabela de candidatas): **"motor + R1-R4 / R5-R9 (grants, relkind, colisão) / baseline + allowlist + wiring de CI"**.

`86-2a` entrega só o motor e as 4 regras que a auditoria original já tinha desenhado como proposta de gate (`docs/audits/rls-multi-tenant-audit.md`, seção "Proposta de gate de CI") — **antes** das 4 lições duras que vieram depois (matview, grant `PUBLIC`, `search_path`, colisão de migration), que são o assunto de `86-2b`. Separar assim permite que `86-2a` seja revisada e mergeada com uma superfície pequena e bem entendida, e que `86-2b` — que carrega as partes mais sutis e mais caras de errar — receba atenção dedicada.

**Dependência dura:** `86-2a` depende de `86-1` (a esteira de CI precisa existir para que o job rodar `pnpm gate:tenancy` tenha onde disparar — embora o wiring em si só aconteça em `86-2c`). `86-2a` **não** depende de PRE-0 para ser **draftada** ou **codificada**, mas depende dele para ser **executada com dado real de produção**: o motor introspecciona o schema, e o schema muda quando o PR #308 (migration `199_hotfix_rls_org_scope.sql`) for aplicado. Rodar o gate antes de PRE-0 mediria um schema que está prestes a mudar — a validação de que os achados P1/P2/P3/P4/P6 (Lote 0) "desaparecem" do relatório só faz sentido pós-aplicação.

---

## Scope

### IN (esta story entrega)
- `scripts/gate-tenancy.ts`, executável via `pnpm gate:tenancy` (novo script adicionado ao `package.json` raiz).
- Camada de introspecção via **Supabase Management API** (`SUPABASE_MANAGEMENT_PAT`, `POST https://api.supabase.com/v1/projects/{ref}/database/query`, padrão já usado no projeto — ver Dev Notes) consultando `information_schema.columns`, `pg_policies`, `pg_class`/`pg_namespace` do schema `public`.
- Fallback de introspecção via snapshot versionado `docs/audits/schema-snapshot.json`, **gerado por um script novo** desta story (ver Dev Notes — correção de uma imprecisão da arquitetura) quando `SUPABASE_MANAGEMENT_PAT` estiver ausente ou a API indisponível.
- Regras **R1, R2, R3, R4** implementadas (severidade FAIL nas quatro — nenhuma delas tem exceção de baseline; a lógica de baseline/catraca em si é `86-2c`, mas as regras já produzem violações individuais nomeadas desde já).
- Estrutura de saída dupla: tabela legível (stdout, para humano) + JSON estruturado (para consumo por `86-2c`/comentário de PR), com uma violação por linha: `{ rule, table, detail }`.
- Estrutura mínima que permite `86-2b` **adicionar** regras (R5-R9) sem reescrever o motor — interface de regra é uma função `(schema: IntrospectedSchema) => Violation[]`, registrada numa lista ordenada.
- Suporte a leitura de um arquivo de allowlist (`docs/audits/tenancy-allowlist.yml`) **se existir** — mas o arquivo em si, populado com as entradas reais (as 16 tabelas de P8 + o que mais for necessário), é entregue em `86-2c`. Nesta story, se o arquivo não existir, R2/R3 tratam a allowlist como vazia (nenhuma tabela isenta).
- Exit code 1 se qualquer regra retornar violação; exit code 0 se limpo — comportamento cru, sem baseline (o "não-bloqueante nesta onda" da AC do epic é resolvido pelo **wiring** em `86-2c`, não pela lógica interna do script).

### OUT (não entra nesta story)
- Regras R5-R9 (checagem de `relkind`/matview, grant `PUBLIC`, `search_path`, `p_org_id` validado, colisão de migration) — `86-2b`.
- Regras R10/R11/R12 (drift de `sellable_modules`, uso de `AiUsageContext`, `PLATFORM_READABLE_TABLES`) com flag de ativação por onda — `86-2c`, porque fazem parte do wiring/config final e dependem de artefatos de ondas futuras que ainda não existem (não é possível testar R10 contra `sellable_modules` antes de `86-27a` criar a tabela, por exemplo — a regra nasce com um flag desligado).
- `docs/audits/rls-gate-baseline.json` e a lógica de catraca (contagem nunca sobe) — `86-2c`.
- `docs/audits/tenancy-allowlist.yml` **populado** com as entradas reais — `86-2c` (esta story só define o formato que o motor sabe ler).
- Wiring no `.github/workflows/ci.yml` criado em `86-1` — `86-2c`.
- Ressalva de cobertura impressa no relatório (texto fixo exigido pelo §9 do epic) — `86-2c`, porque é parte do output final consolidado, junto com o teste contra os 13 achados da auditoria.
- Teste do gate contra os 13 achados da auditoria — `86-2c` (só faz sentido com todas as 9 regras + baseline prontos; testar R1-R4 isoladamente contra achados que dependem de R5-R9 daria falso-negativo).

---

## Acceptance Criteria

- [ ] **AC1 — Script e comando existem:** `scripts/gate-tenancy.ts` criado; `package.json` raiz ganha o script `"gate:tenancy": "tsx scripts/gate-tenancy.ts"` (reusando `tsx`, já devDependency do projeto). [Source: epic-86 §10, story 86-2, AC1]

- [ ] **AC2 — Introspecção via Management API:** o motor consulta o schema `public` de produção via `POST /v1/projects/{ref}/database/query` com `Authorization: Bearer ${SUPABASE_MANAGEMENT_PAT}`, buscando: (a) todas as colunas `org_id` de `information_schema.columns`, (b) todas as policies de `pg_policies` (colunas `tablename`, `cmd`, `qual`, `with_check`, `roles`, `permissive`), (c) `rowsecurity` de `pg_class`/`pg_tables`. [Source: epic-86 §9; memória do projeto `reference_supabase_management_api.md`]

- [ ] **AC3 — Fallback funcional:** se `SUPABASE_MANAGEMENT_PAT` não estiver definido, ou a chamada à API retornar erro, o motor lê `docs/audits/schema-snapshot.json` (mesmo formato de dados que a introspecção via API produziria) e continua a execução, emitindo um aviso claro (não um erro silencioso) informando que está rodando em modo snapshot. [Source: epic-86 §9 "com fallback para snapshot versionado"]

- [ ] **AC4 — Regra R1 (rowsecurity):** toda tabela de `public` com coluna `org_id` reportada com `rowsecurity = false` gera violação `{ rule: "R1", table, detail: "RLS desabilitada em tabela com org_id" }`, severidade FAIL. [Source: epic-86 §9, tabela R1]

- [ ] **AC5 — Regra R2 (policy por comando):** para cada tabela com `org_id` (e fora da allowlist, se o arquivo existir), o motor verifica que existe pelo menos uma policy cujo `qual` (SELECT/UPDATE/DELETE) ou `with_check` (INSERT/UPDATE) referencia `org_id` — separadamente para os comandos SELECT, INSERT, UPDATE, DELETE (uma policy `FOR ALL` conta para os quatro se seu `qual`/`with_check` cobrir org). Ausência de cobertura para qualquer um dos quatro comandos gera violação `{ rule: "R2", table, detail: "sem policy org-scoped para {comando}" }`. [Source: epic-86 §9, tabela R2; auditoria P8]

- [ ] **AC6 — Regra R3 (tabela nova):** o motor compara a lista atual de tabelas de `public` contra um snapshot de tabelas conhecidas gravado nesta story (`docs/audits/tenancy-known-tables.json`, gerado a partir do estado atual de produção — ver Dev Notes/AUTO-DECISION). Toda tabela que aparecer no schema mas não estiver nesse snapshot ("tabela nova") e não tiver `org_id NOT NULL`, gera violação `{ rule: "R3", table, detail: "tabela nova sem org_id NOT NULL" }` — **sem exceção de baseline**, mesmo que listada na allowlist ainda não populada (a allowlist com `reason:` de `86-2c` é a única forma de isentar, e mesmo assim R3 nunca entra no baseline — é FAIL absoluto desde o dia 1, conforme o epic). [Source: epic-86 §9, tabela R3: "FAIL absoluto desde o dia 1, sem baseline"]

  **Invariante obrigatório de `tenancy-known-tables.json` — este arquivo NUNCA cresce.** É funcionalmente uma grandfather list: existe só para dar a R3 um ponto de referência do que já era schema legado no dia em que o gate nasceu. R3 é a única regra que o epic marca como "FAIL absoluto desde o dia 1, sem baseline" — ou seja, é a regra desenhada para não ter válvula de escape. Se `tenancy-known-tables.json` puder ganhar entradas depois da geração inicial (T3.3), qualquer `@dev` que veja R3 vermelho por uma tabela nova legítima tem um caminho de um commit para calar a regra para sempre, sem `reason:`, sem revisão — o oposto exato do que R3 existe para impedir. **O caminho correto para uma tabela nova legítima sem `org_id` (ex.: tabela de plataforma, como as de custo interno do Epic 78) é a allowlist de `86-2c` (`docs/audits/tenancy-allowlist.yml`), com `reason:` obrigatório e revisável em diff — nunca uma edição em `tenancy-known-tables.json`.** Esta story deve deixar isso explícito em pelo menos dois lugares com força de contrato: (a) um comentário no próprio arquivo gerado (`tenancy-known-tables.json` ou um `README` ao lado) dizendo "NÃO EDITAR — grandfather list congelada em {data}; tabela nova sem org_id vai para tenancy-allowlist.yml com reason:"; (b) idealmente, o motor recusa a rodar (ou emite erro forte) se detectar que o arquivo foi editado fora do processo de geração automatizada (ex.: checksum ou contagem de linhas gravada junto — decisão de implementação do @dev, desde que o efeito líquido seja "editar este arquivo à mão é visivelmente anômalo", não silencioso).

- [ ] **AC7 — Regra R4 (policy permissiva `USING(true)`):** toda tabela com `org_id` que tiver uma policy `PERMISSIVE` com `qual` igual a `true` (após `btrim`) e `roles` contendo `public` ou `authenticated` gera violação `{ rule: "R4", table, detail: "policy permissiva USING(true) anula as demais" }` — reproduzindo o padrão exato do achado P3 da auditoria (`system_events`). [Source: epic-86 §9, tabela R4; auditoria P3]

- [ ] **AC8 — Saída dupla:** rodar `pnpm gate:tenancy` imprime (a) uma tabela legível no stdout com uma linha por violação (regra, tabela, detalhe) e (b) grava um JSON (`docs/audits/gate-tenancy-report.json` ou caminho equivalente documentado no Dev Notes) com a mesma informação estruturada, pronto para ser lido por `86-2c` (comentário de PR) sem reprocessamento. [Source: epic-86 §9, "Saída dupla: tabela legível + JSON"]

- [ ] **AC9 — Exit code:** `pnpm gate:tenancy` retorna exit code `1` se qualquer regra R1-R4 encontrar violação, `0` caso contrário. (A camada de baseline/catraca que transforma isso em "não-bloqueante nesta onda" é `86-2c` — este script, isolado, é cru.) [Source: epic-86 §9, "Exit code 1 em FAIL"]

- [ ] **AC10 — Interface extensível:** as regras são implementadas como funções independentes registradas numa lista (`const rules: Rule[] = [ruleR1, ruleR2, ruleR3, ruleR4]`), de forma que `86-2b` adicione R5-R9 sem alterar a assinatura do motor nem a lógica de introspecção. Documentar a interface `Rule` no próprio arquivo (JSDoc) para uso direto por quem implementar `86-2b`. [Source: epic-86 §10, regra de decomposição — corte "motor + R1-R4 / R5-R9" só funciona se a interface for estável entre as duas stories]

---

## Tasks / Subtasks

- [ ] **T1** — Confirmar padrão de acesso à Management API (AC2, AC3)
  - [ ] T1.1 — Ler memória do projeto (`reference_supabase_management_api.md`) e confirmar o endpoint `POST /v1/projects/{ref}/database/query` com `Authorization: Bearer {PAT}`
  - [ ] T1.2 — Confirmar variável de ambiente `SUPABASE_MANAGEMENT_PAT` (nome exato usado na arquitetura e no epic — não inventar nome alternativo) e `project_ref` de produção (`dsopqkqjkmhytudaaolv`, já usado em outras stories/QA gates do projeto)

- [ ] **T2** — Implementar o motor de introspecção (AC2, AC3, AC8)
  - [ ] T2.1 — Função de query via Management API (colunas `org_id`, `pg_policies`, `rowsecurity`)
  - [ ] T2.2 — Script novo `scripts/generate-schema-snapshot.ts` que roda a mesma introspecção e grava `docs/audits/schema-snapshot.json` (**correção da arquitetura** — ver Dev Notes; NÃO reusar `scripts/sync-schema.sh`, que faz `supabase db push` e não gera snapshot nenhum)
  - [ ] T2.3 — Lógica de fallback: `SUPABASE_MANAGEMENT_PAT` ausente/erro de API → ler `schema-snapshot.json` com aviso explícito no stdout
  - [ ] T2.4 — Formato de saída dupla (stdout tabela + JSON em arquivo)

- [ ] **T3** — Implementar R1-R4 (AC4-AC7)
  - [ ] T3.1 — R1: `rowsecurity = false` em tabela com `org_id`
  - [ ] T3.2 — R2: cobertura de policy por comando (SELECT/INSERT/UPDATE/DELETE)
  - [ ] T3.3 — Gerar `docs/audits/tenancy-known-tables.json` (snapshot da lista atual de tabelas, ver AC6/AUTO-DECISION) e implementar R3 contra ele
  - [ ] T3.4 — R4: policy `PERMISSIVE`, `qual = 'true'`, `roles` contendo `public`/`authenticated`

- [ ] **T4** — Interface extensível para `86-2b` (AC10)
  - [ ] T4.1 — Definir tipo `Rule` (`(schema: IntrospectedSchema) => Violation[]`) e lista `rules: Rule[]`
  - [ ] T4.2 — JSDoc de contrato para quem implementar R5-R9

- [ ] **T5** — Rodar contra produção (read-only) e validar (AC9)
  - [ ] T5.1 — Rodar `pnpm gate:tenancy` contra o schema real (via Management API, read-only — `SELECT`, nunca `INSERT`/`UPDATE`/`DELETE`)
  - [ ] T5.2 — Conferir que as violações batem, na direção esperada, com os achados ainda abertos da auditoria (P5, P8 — sem exigir 100% de cobertura, já que R5-R9 e a allowlist ainda não existem; documentar o que aparece)
  - [ ] T5.3 — Confirmar exit code correto nos dois cenários (com e sem violação simulada)

---

## Dev Notes

### Arquivos a criar
- `scripts/gate-tenancy.ts` — motor + R1-R4
- `scripts/generate-schema-snapshot.ts` — gerador do fallback (novo; ver correção abaixo)
- `docs/audits/tenancy-known-tables.json` — snapshot de tabelas conhecidas para R3 (gerado nesta story, a partir do estado real de produção no momento da implementação)
- `docs/audits/gate-tenancy-report.json` — saída JSON do gate (gerado em runtime, não commitado; documentar `.gitignore` se aplicável)

### Correção de uma imprecisão da arquitetura — `scripts/sync-schema.sh` NÃO gera snapshot
`docs/architecture/saas-multi-tenant.md` §8.2 afirma: "fallback para um snapshot versionado `docs/audits/schema-snapshot.json` regenerado por `scripts/sync-schema.sh` (já existe)". **Isso é impreciso — verificado por leitura direta do arquivo nesta story.** `scripts/sync-schema.sh` existente faz `supabase db push --db-url ...` (empurra migrations locais para staging/prod); ele **não lê nem grava** `schema-snapshot.json`, e não tem lógica de introspecção alguma. [AUTO-DECISION] Esta story cria um script novo e pequeno, `scripts/generate-schema-snapshot.ts`, reusando a mesma função de introspecção do motor (T2.1) para produzir o arquivo → reason: Artigo IV proíbe assumir que um mecanismo existe sem verificar; a alternativa (inventar que `sync-schema.sh` faz algo que não faz) seria pior. Reportar esta correção ao @architect para atualizar `saas-multi-tenant.md` §8.2 (fora do escopo desta story consertar o documento de arquitetura, mas o gap deve ser sinalizado).

### AUTO-DECISION — snapshot de "tabelas conhecidas" para R3
O epic não especifica **como** o gate sabe se uma tabela é "nova" (R3). [AUTO-DECISION] Gerar `docs/audits/tenancy-known-tables.json` nesta story, como lista congelada dos nomes de tabela de `public` existentes no momento em que `86-2a` é implementada → reason: sem essa referência, R3 não tem como distinguir "tabela que já existia" de "tabela nova criada por uma migration futura"; qualquer tabela ausente desse snapshot e sem `org_id NOT NULL` é tratada como nova e falha, sem exceção de baseline (conforme a AC do epic). Esse arquivo é análogo em espírito ao `rls-gate-baseline.json` de `86-2c`, mas resolve um problema diferente (identidade de tabela nova vs. contagem de violação existente) — não confundir os dois artefatos.

**Invariante — este arquivo nunca cresce.** `tenancy-known-tables.json` é congelado no momento da geração (T3.3) e não recebe novas entradas depois. Tabela nova legítima sem `org_id` (ex.: futura tabela de plataforma) vai para `docs/audits/tenancy-allowlist.yml` (`86-2c`) com `reason:` obrigatório — nunca para este arquivo. Ver AC6 para o contrato completo e a razão (R3 é a única regra "sem baseline" do epic; um grandfather list que cresce mata essa garantia em silêncio).

### Padrão de acesso à Management API
```bash
# Padrão já documentado na memória do projeto (reference_supabase_management_api.md)
curl -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_MANAGEMENT_PAT}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT ..."}'
```
Em CI, `SUPABASE_MANAGEMENT_PAT` é um secret do GitHub Actions (gravado por `86-2c` no wiring, seguindo NFR-10 — nunca via `vercel env add`/stdin; aqui é secret do GitHub, não da Vercel, então o mecanismo de gravação é `gh secret set`, não o script `vercel-env-set.sh`). Localmente, o desenvolvedor usa seu próprio PAT via `supabase login` (`~/.supabase/access-token`) ou a env var direta.

### Regra R2 — cuidado com `FOR ALL`
Uma policy `FOR ALL` no Postgres se aplica a todos os comandos (SELECT/INSERT/UPDATE/DELETE). O motor precisa expandir isso corretamente: se `pg_policies.cmd = 'ALL'`, a policy conta para os quatro comandos ao avaliar cobertura — não tratar `cmd = 'ALL'` como "nenhum comando coberto" (bug que geraria falso-positivo maciço, já que boa parte das policies do projeto usa `FOR ALL`, como visto no padrão RLS de `004_rls_policies.sql` e replicado em `164_platform_services_billing.sql`).

### Regra R2 — `WITH CHECK` só é exigido onde há escrita
Para SELECT/DELETE, `qual` (a cláusula `USING`) é o que importa. Para INSERT, só `with_check` existe (não há `USING` em INSERT). Para UPDATE, os dois são relevantes (`USING` filtra quais linhas podem ser atualizadas, `WITH CHECK` valida o estado pós-update) — o epic é explícito: "com `WITH CHECK` onde há escrita". Implementar a checagem separando os quatro comandos, não tratando `qual`/`with_check` como intercambiáveis.

### Testing Standards
- Vitest (`vitest run`), consistente com o resto do projeto — **não Jest**.
- Testes desta story são **unitários sobre a lógica das regras**, alimentados por fixtures sintéticas (schemas simulados representando os padrões P1/P3/P8 da auditoria), não uma chamada real à Management API em cada run do `pnpm test` (isso pertence à validação manual de T5, contra produção read-only, fora da suíte automatizada — mesmo padrão observado em `78-1`, que não tem suíte de teste de migration automatizada).
- Local de teste sugerido: `scripts/__tests__/gate-tenancy.test.ts` (ou `packages/*/src/**/__tests__` se o motor for movido para dentro de um pacote — decisão de organização de código do @dev, desde que dentro de `pnpm test` já coberto por `86-1`).

---

## Testing

### Abordagem
- Testes unitários com fixtures sintéticas para cada regra (R1-R4), cobrindo caso violador e caso limpo.
- Validação manual contra produção (read-only) como parte do quality gate desta story — não roda em `pnpm test` (evita depender de rede/credenciais em CI antes de `86-2c` fazer o wiring propriamente).

### Cenários de teste
1. **R1 — violação:** fixture com tabela `org_id` presente e `rowsecurity = false` → violação `R1` reportada.
2. **R1 — limpo:** fixture com `rowsecurity = true` → nenhuma violação `R1`.
3. **R2 — violação por comando faltante:** fixture com policy só para SELECT numa tabela com `org_id` → violações `R2` para INSERT/UPDATE/DELETE.
4. **R2 — `FOR ALL` cobre os 4 comandos:** fixture com uma única policy `cmd = 'ALL'` referenciando `org_id` → nenhuma violação `R2`.
5. **R3 — tabela nova sem `org_id`:** fixture com uma tabela ausente do `tenancy-known-tables.json` e sem `org_id NOT NULL` → violação `R3`.
6. **R3 — tabela conhecida sem `org_id`:** fixture com tabela presente no snapshot de conhecidas, sem `org_id` → **nenhuma** violação `R3` (não é nova).
7. **R4 — `USING(true)` para `authenticated`:** reproduzir o padrão exato do achado P3 (`system_events` antes da correção) → violação `R4`.
8. **R4 — policy org-scoped normal:** fixture com `qual` referenciando `org_id = user_org_id()` → nenhuma violação `R4`.
9. **Fallback:** simular `SUPABASE_MANAGEMENT_PAT` ausente → motor lê `schema-snapshot.json` e roda normalmente, com aviso no stdout.
10. **Exit code:** rodar com fixture violadora → processo termina com código 1; rodar com fixture limpa → código 0.
11. **R3 — invariante do grandfather list:** confirmar que `tenancy-known-tables.json` gerado por T3.3 traz o marcador "NÃO EDITAR" (ou mecanismo equivalente de detecção de edição manual, ver AC6) — e que uma tabela nova sem `org_id` **não** desaparece de R3 por ter sido adicionada manualmente ao arquivo (teste negativo: editar o arquivo à mão para "esconder" uma tabela nova deve continuar falhando R3, ou pelo menos disparar o alerta de anomalia descrito em AC6).

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | `pg_policies.cmd = 'ALL'` tratado incorretamente gera avalanche de falso-positivo R2 | **Alta** se não testado | Cenário de teste #4 dedicado; revisão explícita no quality gate do @architect |
| R2 | Introspecção via Management API expõe `SUPABASE_MANAGEMENT_PAT` em log de CI se mal configurada | Média | Nunca logar o valor do token; usar `***` em qualquer output de erro que inclua headers |
| R3 | Fallback (`schema-snapshot.json`) fica desatualizado silenciosamente e mascara mudanças reais de schema | Média | Aviso explícito no stdout quando rodando em modo fallback (AC3) — não deixar passar despercebido |
| R4 | `docs/audits/tenancy-known-tables.json` congelado no momento errado (antes do PR #308 aplicar) inclui/exclui tabelas incorretamente | Baixa | T5.1 roda contra produção só após confirmar que PR #308 foi aplicado (ou documentar explicitamente que o snapshot foi gerado pré-PR #308, se a implementação correr em paralelo) |
| R5 | `tenancy-known-tables.json` vira um "grandfather list que cresce": um @dev, vendo R3 vermelho, resolve acrescentando a tabela nova ao arquivo em vez de justificá-la na allowlist — matando a única regra "sem baseline" do epic em silêncio | **Alta** se não prevenido | Invariante explícito em AC6/Dev Notes ("este arquivo nunca cresce"), marcador "NÃO EDITAR" no arquivo/README, cenário de teste #11, e revisão dedicada no quality gate do @architect: qualquer PR que só adicione linha a `tenancy-known-tables.json` deve ser tratado como suspeito por padrão |

---

## Dependencies

- **Depende de:** `86-1` (esteira de CI — precondição para o job existir, embora o wiring seja `86-2c`)
- **Depende de (para execução com dado real):** PRE-0 (PR #308 aplicado em produção) — não bloqueia o **draft** nem a **implementação do motor**, mas a validação final contra schema real (T5) deve rodar pós-aplicação
- **Bloqueia diretamente:** `86-2b` (estende o motor com R5-R9), `86-2c` (baseline + allowlist + wiring)
- **Dependências técnicas:** `SUPABASE_MANAGEMENT_PAT` (env var, provisionamento fora do escopo desta story — é secret de CI gravado em `86-2c`, mas usado localmente pelo @dev/@data-engineer durante a implementação via seu próprio PAT)

---

## Definition of Done

- [ ] `scripts/gate-tenancy.ts` criado com R1-R4 implementadas
- [ ] `scripts/generate-schema-snapshot.ts` criado (fallback funcional)
- [ ] `docs/audits/tenancy-known-tables.json` gerado a partir do estado real de produção
- [ ] `pnpm gate:tenancy` funciona localmente (com e sem `SUPABASE_MANAGEMENT_PAT`)
- [ ] Saída dupla (stdout + JSON) implementada
- [ ] Exit code correto nos dois cenários
- [ ] Interface `Rule` documentada para uso por `86-2b`
- [ ] 10 cenários de teste unitário passando
- [ ] Validação manual contra produção (read-only) documentada no Dev Agent Record
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
| 2026-08-02 | 0.1 | Story criada a partir da quebra de `86-2` (Epic 86 §10), conforme corte sugerido pela validação do @po (`docs/qa/epic-86-po-validation.md`, tabela de candidatas): "motor + R1-R4 / R5-R9 / baseline + allowlist + wiring de CI". Esta é a fatia 1/3 (motor + R1-R4). Corrigida uma imprecisão da arquitetura: `scripts/sync-schema.sh` NÃO gera snapshot de schema (verificado por leitura direta) — criado script novo `generate-schema-snapshot.ts` em vez de reusar um mecanismo inexistente. [AUTO-DECISION] Node/tsx para o motor, reusando devDependency já presente. [AUTO-DECISION] `tenancy-known-tables.json` criado como artefato novo para viabilizar R3 (o epic não especifica o mecanismo de detecção de "tabela nova"). | @sm (River) |
| 2026-08-02 | 0.2 | **Validação @po — GO (9/10), 1 correção aplicada.** Corte 2a/2b/2c confirmado como sobrevivente à redação (interface `Rule` travada na origem — AC10 — e no destino — AC7 de `86-2b`). Elogiado: exit code cru em R1-R4 (a não-bloqueância vive no wiring de `86-2c`, não na lógica do motor) e o fato de o gate se tornar bloqueante virar "remover uma linha do `ci.yml`". **Correção aplicada:** typo "só faz sentido come todas as 9 regras" → "com todas as 9 regras" (linha do Scope/OUT). **Invariante acrescentado a AC6 e Dev Notes:** `tenancy-known-tables.json` nunca cresce após a geração inicial — é um grandfather list, e R3 é a única regra do epic "sem baseline, FAIL absoluto desde o dia 1"; tabela nova legítima sem `org_id` vai para a allowlist de `86-2c` com `reason:`, nunca para este arquivo. Marcador "NÃO EDITAR" exigido no artefato gerado; cenário de teste #11 e risco R5 adicionados. Status Draft → **Ready** (aplicado por @sm a pedido do coordenador, em nome do veredito GO do @po — @po não pôde editar a story diretamente por restrição da própria tarefa dele). | @po (Pax) via @sm |

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
