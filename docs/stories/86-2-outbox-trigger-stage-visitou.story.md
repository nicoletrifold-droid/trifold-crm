# Story 86-2 — Migration: tabela `meta_capi_outbox` + extensão do trigger de mudança de etapa

**Status:** Review
**Epic:** 86 — Conversions API (CAPI) e Rastreamento Meta
**Executor:** @data-engineer (Dara)
**Prioridade:** P0 (bloqueador)
**Depende de:** 86-1 (credenciais — não bloqueia a migration em si, mas o dispatcher que a consome)

## Contexto

O ponto de convergência para detectar "lead moveu para o stage Visitou" já
existe: `trg_log_lead_stage_change` (`supabase/migrations/124_stage_change_activity_trigger.sql`),
disparado em `AFTER UPDATE OF stage_id ON leads` sempre que
`NEW.stage_id IS DISTINCT FROM OLD.stage_id`. Esse trigger cobre **100% dos
caminhos de mudança de stage** — inclusive o `UPDATE` direto do client em
`packages/web/src/components/pipeline/kanban-board.tsx` (drag-and-drop no
kanban, que chama `supabase.from("leads").update({ stage_id: newStageId }).eq("id", leadId)`
sem passar por nenhuma API route) e qualquer mudança via API/roleta/admin.

Esta story estende (não substitui) essa função de trigger para, quando o novo
stage for `visitou` (`STAGE_IDS.visitou = "00000000-0000-0000-0001-000000000005"`,
`packages/shared/src/constants/stages.ts`), inserir uma linha em uma nova
tabela `meta_capi_outbox` — um outbox pattern clássico que desacopla a
detecção do evento (síncrona, no banco) do envio à CAPI (assíncrono, via cron
na Story 86-4).

## Acceptance Criteria

1. **AC1 — Tabela `meta_capi_outbox` criada.** Nova tabela com, no mínimo,
   estas colunas:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`
   - `lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE`
   - `event_name TEXT NOT NULL DEFAULT 'Schedule'`
   - `event_id TEXT NOT NULL` — determinístico, formato `visit_<lead_id>_<outbox_row_id>`
     (o `id` da própria linha, gerado antes do insert via `gen_random_uuid()`
     em CTE ou via trigger `BEFORE INSERT`, para garantir unicidade estável).
   - `status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped'))`
   - `attempts INTEGER NOT NULL DEFAULT 0`
   - `last_error TEXT`
   - `sent_at TIMESTAMPTZ`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   - Índice em `(status, created_at)` para a query do dispatcher (Story 86-4)
     buscar pendentes eficientemente.
   - `UNIQUE (lead_id, event_name)` — evita duplicar o evento Visitou se o lead
     transitar para `visitou` mais de uma vez (ex.: voltou e foi movido de novo);
     ver Dev Notes sobre a decisão de "primeira vez apenas" vs. "toda vez".
2. **AC2 — RLS na outbox.** Tabela nova tem RLS habilitado. Como o trigger que
   escreve é `SECURITY DEFINER` (mesmo padrão do `log_lead_stage_change`), o
   insert do trigger não é afetado por RLS. Política de leitura: apenas
   `service_role` (o dispatcher cron usa `createAdminClient()`, que já
   contorna RLS) — não é necessário expor a tabela para `authenticated`, então
   uma policy restritiva (`false` para `authenticated`/`anon`, sem policy de
   INSERT/UPDATE/DELETE para esses roles) é suficiente. Seguir o padrão de
   `REVOKE` explícito documentado na gotcha "Supabase GRANT ALL default"
   (memória do projeto): `REVOKE ALL ON meta_capi_outbox FROM authenticated, anon;`
   já que o Supabase concede `GRANT ALL` por padrão a esses roles.
3. **AC3 — Função `log_lead_stage_change()` estendida.** A função existente em
   `124_stage_change_activity_trigger.sql` é alterada (via `CREATE OR REPLACE
   FUNCTION`, nova migration) para, **depois** do insert em `activities`
   (comportamento existente preservado), verificar
   `IF NEW.stage_id = '00000000-0000-0000-0001-000000000005'::uuid THEN` e
   inserir em `meta_capi_outbox (org_id, lead_id, event_name, event_id)` com
   `event_id` gerado como `'visit_' || NEW.id || '_' || gen_random_uuid()`. O
   `INSERT` usa `ON CONFLICT (lead_id, event_name) DO NOTHING` para respeitar
   o `UNIQUE` do AC1 sem lançar erro.
4. **AC4 — Trigger não quebra em caso de erro no insert da outbox.** O bloco de
   insert na outbox é envolvido de forma que uma falha nele (ex.: constraint
   inesperada) não impede o insert em `activities` nem a atualização do lead —
   avaliar `BEGIN ... EXCEPTION WHEN OTHERS THEN` isolado só para o bloco da
   outbox, logando via `RAISE WARNING` em vez de propagar a exceção. Isso
   preserva a garantia P0 já existente (registro de `stage_change` em
   `activities`) mesmo que o CAPI outbox tenha um problema — inclusão do
   tracking Meta não pode ser um novo ponto de falha para o kanban.
5. **AC5 — `STAGE_IDS.visitou` usado como fonte de verdade, hardcoded na SQL
   com comentário do valor exato.** Como a função SQL não pode importar
   `packages/shared/src/constants/stages.ts`, o UUID é hardcoded na migration
   com um comentário explícito citando o arquivo TS de origem, para que
   qualquer mudança futura em `STAGE_IDS.visitou` seja visível como
   discrepância a ser sincronizada manualmente (mesmo padrão de risco
   assumido pelo trigger 124 original, que também hardcoda lógica de negócio
   em SQL).
6. **AC6 — Teste manual comprovando os 3 caminhos de mudança de stage.**
   Mover um lead de teste para o stage `visitou` via (a) drag-and-drop no
   kanban, (b) `UPDATE` direto via SQL/Supabase Studio, e (c) qualquer rota de
   API que atualize `stage_id` (se existir uma testável) — em todos os 3
   casos, uma linha aparece em `meta_capi_outbox` com `status = 'pending'`.
7. **AC7 — Nenhuma duplicação quando o lead já tem uma linha na outbox para o
   mesmo evento.** Mover um lead para `visitou`, depois para outro stage, e de
   volta para `visitou` NÃO cria uma segunda linha (`UNIQUE` + `ON CONFLICT DO
   NOTHING` do AC1/AC3) — o evento Visitou é enviado apenas uma vez por lead
   nesta primeira versão (ver Dev Notes).

## Tasks

- [x] **T1 (AC1)** — Criar migration `supabase/migrations/215_meta_capi_outbox.sql`
  com o `CREATE TABLE meta_capi_outbox` completo (colunas, índice, unique
  constraint) descrito no AC1.
- [x] **T2 (AC2)** — Na mesma migration: `ALTER TABLE meta_capi_outbox ENABLE
  ROW LEVEL SECURITY;` + `REVOKE ALL ON meta_capi_outbox FROM authenticated,
  anon;` (sem GRANT para esses roles — apenas `service_role`/owner tem
  acesso, que é como o dispatcher cron vai operar via `createAdminClient()`).
- [x] **T3 (AC3, AC4, AC5)** — Na mesma migration: `CREATE OR REPLACE FUNCTION
  log_lead_stage_change()` com o bloco novo de insert condicional na outbox,
  isolado em `BEGIN...EXCEPTION` para não quebrar o fluxo principal.
  [AUTO-DECISION] Arquivo único (200), não 200+201: tabela e extensão do trigger
  são uma unidade lógica atômica (o trigger referencia a outbox); separar exigiria
  ordem de aplicação estrita sem ganho de clareza. Rollback continua trivial
  (DROP TABLE + CREATE OR REPLACE restaurando a versão 124).
- [~] **T4 (AC6)** — Teste manual dos 3 caminhos de stage em ambiente dev:
  NÃO executado por este agente — a story de dev-eng cria apenas o `.sql`; a
  aplicação da migration e o smoke test em dev/prod ficam para o @devops/fluxo
  de deploy (regra do spawn: não aplicar em nenhum banco). SQL a rodar após
  apply está na seção Testing dos Dev Notes.
- [~] **T5 (AC7)** — Idempotência (visitou → outro → visitou): coberta por
  design (`UNIQUE(lead_id, event_name)` + `ON CONFLICT DO NOTHING`). Teste
  runtime pendente de apply, mesma condição da T4.
- [x] **T6** — Comentário de topo da migration (estilo 124) documenta o "porquê"
  da extensão, a âncora ao `STAGE_IDS` de `stages.ts` e a decisão de idempotência.

## Dev Notes

### [@po fix — event_id: reconciliar AC1 vs AC3]
O AC1 descreve o formato do `event_id` como `visit_<lead_id>_<outbox_row_id>`, mas
o AC3 gera `'visit_' || NEW.id || '_' || gen_random_uuid()`. No trigger, `NEW.id`
é o **lead_id** (correto), porém o segundo termo (`gen_random_uuid()`) é um UUID
**aleatório novo**, NÃO o `id` da linha da outbox (`outbox_row_id`). Isso não é um
bug funcional — o `event_id` continua único e determinístico o suficiente para a
idempotência do lado do Meta —, mas o texto do AC1 fica enganoso. @dev/@data-engineer:
ou (a) alinhar o AC1 para dizer `visit_<lead_id>_<random_uuid>`, ou (b) se de fato
quiser o id da própria linha da outbox, gerar o id em CTE/`BEFORE INSERT` e usá-lo.
Recomendação do @po: opção (a) — mais simples, o `UNIQUE(lead_id, event_name)` +
`ON CONFLICT DO NOTHING` já garante 1 linha por lead, então o sufixo aleatório é
irrelevante para unicidade e serve apenas para tornar o `event_id` opaco. Não
bloqueante; corrigir a redação do AC1 na próxima edição.

### Decisão: evento único por lead (não um por transição)
[AUTO-DECISION] O `UNIQUE (lead_id, event_name)` do AC1 implica que, se um
lead for movido para `visitou`, saia, e volte, o evento CAPI **não** é
reenviado. Razão: o Meta trata "Visitou" como sinal de qualificação de fundo
de funil — reenviar a cada oscilação de kanban infla artificialmente o volume
do evento sem adicionar sinal novo, e poderia distorcer a Custom Conversion
(Story 86-8) usada para Lookalike. Se o negócio decidir futuramente que
"visitou de novo" deve gerar novo evento (ex.: segunda visita agendada meses
depois), isso é uma mudança de escopo explícita para uma story futura — não
implementar agora.

### Por que estender a função em vez de criar um trigger separado
Um segundo trigger `AFTER UPDATE OF stage_id ON leads` funcionaria, mas
executar 2 triggers na mesma coluna em toda mudança de stage (potencialmente
com ordem de execução não determinística entre triggers do mesmo evento)
adiciona superfície de risco desnecessária. Estender a função existente
garante ordem determinística (outbox só é avaliado depois do insert em
`activities`, que é o comportamento crítico já testado em produção) e mantém
o "convergence point" único mencionado pelo @architect.

### `SECURITY DEFINER` já resolve RLS do insert
A função já é `SECURITY DEFINER` (linha 18 do arquivo 124) — o insert na
outbox roda com o owner da função, contornando RLS automaticamente, igual ao
insert em `activities`. Não é necessário nenhuma policy de INSERT para
`authenticated` na outbox.

### Numeração de migration
Última migration confirmada no repo: `199_seed_campanhas_agente_submodule.sql`
(Story 75-229, ainda em InReview no momento desta auditoria). Esta story usa
`215_meta_capi_outbox.sql` — **conferir contra o schema remoto de prod antes
de aplicar** (lição repetida em várias stories recentes, ex. 75-188, 75-229:
numeração pode colidir se outra story mergear migrations no meio tempo).
> **Renumeração 200→215 (2026-08-04):** o número 200 foi atribuído antes de `main`
> avançar ~50 commits; ao abrir o PR #358, `main` já continha
> `200_marketing_brand_assets_icone.sql` e migrations até a 214. Renumerado para
> `215_meta_capi_outbox.sql` (próximo livre) para evitar a colisão. Conferir
> novamente contra o schema remoto de prod antes do apply.

### `org_id` na outbox
O trigger tem acesso a `NEW.org_id` (coluna de `leads`, NOT NULL) — mesma
fonte usada pelo insert em `activities` (linha 30 do arquivo 124). Não é
necessário buscar `org_id` de outra tabela.

### Testing
- SQL manual: `UPDATE leads SET stage_id = '00000000-0000-0000-0001-000000000005' WHERE id = '<lead-de-teste>';`
  seguido de `SELECT * FROM meta_capi_outbox WHERE lead_id = '<lead-de-teste>';`
  — deve retornar 1 linha `status='pending'`.
- Repetir a mesma UPDATE (idempotência): sem segunda linha.
- Drag-and-drop manual no kanban (ambiente dev) movendo um lead de teste para
  a coluna "Visitou" — confirmar linha na outbox via Supabase Studio.
- Confirmar que `activities` continua recebendo o registro `stage_change`
  normalmente (sem regressão no comportamento da Story 75-72).

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Quality validation via revisão manual do @data-engineer + @qa gate.

**Story Type:** Database (migration, trigger, RLS)
**Complexidade:** Medium — estende lógica existente crítica (trigger de stage change), não cria domínio novo.
**Focus Areas:** Migration reversível/idempotente (`ON CONFLICT DO NOTHING`, `CREATE OR REPLACE`), RLS explícito (REVOKE de authenticated/anon), preservação do comportamento pré-existente do trigger 124 (regressão zero em `activities`).

## File List

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/migrations/215_meta_capi_outbox.sql` | criado | `CREATE TABLE meta_capi_outbox` (colunas + índice `(status, created_at)` + `UNIQUE(lead_id, event_name)`), RLS habilitada + `REVOKE ALL FROM authenticated, anon`, e `CREATE OR REPLACE FUNCTION log_lead_stage_change()` estendendo o trigger 124 com o enqueue condicional na outbox (isolado em `BEGIN...EXCEPTION`). |

## Dev Agent Record

**Agent:** @data-engineer (Dara) — 2026-08-04

### Decisões
- **[AUTO-DECISION] Arquivo único (200) vs. 200+201** → único (reason: tabela +
  extensão do trigger formam uma unidade atômica; o trigger referencia a outbox,
  então separar só criaria acoplamento de ordem de aplicação sem ganho de
  clareza/rollback).
- **event_id (fix @po, opção a)** → `'visit_' || NEW.id || '_' || gen_random_uuid()`
  = `visit_<lead_id>_<random_uuid>`. O sufixo é um UUID aleatório (não o `id` da
  linha da outbox); a unicidade lógica "1 por lead" vem do `UNIQUE(lead_id,
  event_name)`, não do sufixo. AC1 e SQL agora coerentes (comentário na coluna
  `event_id` documenta isso).
- **Não recriar o trigger** → só `CREATE OR REPLACE FUNCTION`; o trigger 124
  (`trg_log_lead_stage_change`, `AFTER UPDATE OF stage_id`) já aponta para a
  função e continua válido. Zero risco de duplicar/reordenar triggers.
- **Isolamento AC4** → o enqueue na outbox roda DEPOIS do insert em `activities`,
  dentro de um `BEGIN...EXCEPTION WHEN OTHERS THEN RAISE WARNING`. Falha na
  outbox nunca propaga → garantia P0 do `stage_change` + o UPDATE do lead
  permanecem intactos.

### Validação
- `STAGE_IDS.visitou` confirmado em `packages/shared/src/constants/stages.ts`
  = `00000000-0000-0000-0001-000000000005` (hardcoded na SQL com âncora ao TS, AC5).
- Numeração: última migration no repo é `199_seed_campanhas_agente_submodule.sql`;
  `200` está livre. **Conferir contra o schema remoto de prod antes do apply**
  (colisão histórica de numeração — lição 75-188/75-229).
- Migration 124 relida: usa `kanban_stages` (nomes), `NEW.org_id`/`NEW.id`,
  `SECURITY DEFINER`, `SET search_path = public, pg_temp`. Corpo preservado
  byte-a-byte no `CREATE OR REPLACE` (regressão zero em `activities`).
- Revisão SQL manual (sem psql/sqlfluff no ambiente): dollar-quotes `$$` balanceados,
  `BEGIN/EXCEPTION/END` aninhado corretamente dentro do bloco externo,
  `IF/END IF` e `CHECK`/`UNIQUE` OK, `ON CONFLICT` casa com o nome das colunas do
  `UNIQUE`, `::uuid` cast explícito no literal do stage.

### Não executado (fora do escopo deste agente)
- Migration **não aplicada** em nenhum banco (dev/prod) — só o `.sql` foi criado.
- Testes runtime (T4/T5, AC6/AC7) pendentes de apply — SQL de verificação na
  seção Testing dos Dev Notes.

### Shape final da tabela (para @dev das stories 86-3/86-4 — cron consumer)
```
meta_capi_outbox
  id          uuid  PK        (gen_random_uuid)
  org_id      uuid  NOT NULL  FK organizations ON DELETE CASCADE
  lead_id     uuid  NOT NULL  FK leads         ON DELETE CASCADE
  event_name  text  NOT NULL  DEFAULT 'Schedule'
  event_id    text  NOT NULL  ('visit_<lead_id>_<random_uuid>')
  status      text  NOT NULL  DEFAULT 'pending'  CHECK IN ('pending','sent','failed','skipped')
  attempts    integer NOT NULL DEFAULT 0
  last_error  text  NULL
  sent_at     timestamptz NULL
  created_at  timestamptz NOT NULL DEFAULT now()
  UNIQUE (lead_id, event_name)   -- constraint meta_capi_outbox_lead_event_uniq
  INDEX idx_meta_capi_outbox_status_created ON (status, created_at)
```
- **Dispatcher (86-4):** buscar `WHERE status='pending' ORDER BY created_at`
  (usa o índice). Ao processar: em sucesso `status='sent', sent_at=now()`; em
  falha `attempts=attempts+1, last_error=...` e `status='failed'` ao esgotar
  tentativas; `status='skipped'` para descartes por regra de negócio.
- **Acesso:** a tabela NÃO é visível a `authenticated`/`anon` (RLS sem policy +
  REVOKE ALL). O cron deve usar `createAdminClient()` (service-role) para
  ler/atualizar.
- `event_name` só assume `'Schedule'` nesta versão; o `UNIQUE(lead_id, event_name)`
  já deixa espaço para outros tipos de evento por lead no futuro sem colidir.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-04 | 0.1 | Draft criado a partir da auditoria de tracking Meta. Estende trigger 124 sem substituí-lo; outbox pattern com idempotência por lead. | @sm (River) |
| 2026-08-04 | 0.2 | Validação @po (10-point): GO, 8/10. Draft → Ready. Verificado contra migration 124 real (SECURITY DEFINER ✓, NEW.org_id existe ✓, STAGE_IDS.visitou UUID confere ✓). Migration 200 livre (última é 199). RLS/REVOKE explícito presente (respeita gotcha GRANT ALL default ✓). Fix não bloqueante registrado: reconciliar redação do event_id (AC1 vs AC3). | @po (Pax) |
| 2026-08-04 | 0.3 | Implementação: criada `200_meta_capi_outbox.sql` (tabela + índice + UNIQUE + RLS/REVOKE + `CREATE OR REPLACE` do trigger 124 com enqueue isolado). Fix @po aplicado (event_id = `visit_<lead_id>_<random_uuid>`, coerência AC1/AC3). Arquivo único (não 200+201). Ready → Review. Apply/testes runtime delegados ao @devops (não aplicado em banco). | @data-engineer (Dara) |
| 2026-08-04 | 0.4 | Renumeração da migration `200_meta_capi_outbox.sql` → `215_meta_capi_outbox.sql` no PR #358: ao abrir o PR, `main` já continha `200_marketing_brand_assets_icone.sql` e migrations até a 214 (colisão de numeração). `215` é o próximo livre. Conteúdo intacto; conferir contra o schema remoto de prod antes do apply. Migration NÃO aplicada em banco. | @devops (Gage) |

## QA Results

### Review Date: 2026-08-04

### Reviewed By: Quinn (Test Architect)

**Escopo:** `supabase/migrations/200_meta_capi_outbox.sql` comparada byte-a-byte contra `124_stage_change_activity_trigger.sql`. Confirmado `STAGE_IDS.visitou = 00000000-0000-0000-0001-000000000005` em `packages/shared/src/constants/stages.ts:11` (casa com o literal hardcoded na SQL, cast `::uuid` correto). Numeração `200` livre (última real = `199_seed_campanhas_agente_submodule.sql`).

**7 quality checks:**
1. **Code review** — PASS. SQL legível, comentário de topo documenta o porquê (outbox pattern, extend vs. 2º trigger, idempotência).
2. **Testes** — CONCERNS (low). AC6/AC7 runtime pendentes de apply (não é possível rodar SQL sem banco). Idempotência coberta por design.
3. **AC** — PASS. AC1 (schema completo: colunas, índice `(status,created_at)`, `UNIQUE(lead_id,event_name)`), AC2 (`ENABLE ROW LEVEL SECURITY` + `REVOKE ALL FROM authenticated, anon`, sem policy de propósito), AC3 (enqueue condicional `stage_id = ...0005` + `ON CONFLICT DO NOTHING`), AC4 (`BEGIN...EXCEPTION WHEN OTHERS THEN RAISE WARNING` isolando só a outbox), AC5 (UUID hardcoded + âncora ao TS) — todos atendidos. AC6/AC7 runtime-only.
4. **Regressão** — PASS (FOCO). Corpo do `INSERT INTO activities (...)` do trigger 124 preservado byte-a-byte no `CREATE OR REPLACE`; `SECURITY DEFINER`, `SET search_path = public, pg_temp` e assinatura mantidos. O enqueue roda DEPOIS do insert crítico. Trigger `trg_log_lead_stage_change` NÃO recriado (continua apontando p/ a função). Zero regressão em `activities`.
5. **Performance** — PASS. Índice `(status, created_at)` serve a query do dispatcher. Enqueue é 1 INSERT condicional.
6. **Segurança** — PASS. RLS habilitada; `REVOKE ALL` explícito (respeita gotcha "Supabase GRANT ALL default" — TRUNCATE não passa por RLS). Insert via `SECURITY DEFINER` contorna RLS corretamente.
7. **Docs** — PASS. File List e Change Log atualizados.

### Gate Status

Gate: PASS → docs/qa/gates/86.2-outbox-trigger-stage-visitou.yml

**Condição para @devops:** conferir numeração `200` contra o schema remoto de prod antes de aplicar (lição 75-188/75-229). Após apply, executar o SQL de verificação da seção Testing (AC6/AC7 runtime).
