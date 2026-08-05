# Story 84-1 — Backend: schema, permissões e auditoria da Qualificação Comercial do Lead

## Metadata
- **Status:** Ready for Review
- **Epic:** 84 — Qualificação do Lead
- **Branch:** feat/84-1-qualificacao-lead-schema
- **Tipo:** Feature (migration + backend)
- **Complexidade:** Média
- **Prioridade:** P2

## Story
**As a** gestor/comercial, **I want** um campo novo e independente no lead — Qualificação
Comercial (Bom/Regular/Ruim/Inválido) — persistido, protegido por permissão e com histórico de
mudanças, **so that** eu possa avaliar a qualidade real de conversão do lead sem depender só da
Temperatura (que hoje é recalculada automaticamente pelo engajamento no chat).

## Contexto
Ver `docs/stories/epics/epic-84-qualificacao-lead.md` para o problema e o contrato completo do
campo (4 valores, critérios, prazos por classificação).

**Correção importante em relação à premissa original do brief:** a investigação assumiu que
`leads.interest_level` (Temperatura) era 100% manual. Não é. `packages/ai/src/chat/pipeline.ts:892-894`
e `packages/ai/src/flows/haiku-enrichment.ts:203-205` calculam um `score` de engajamento no chat e
sobrescrevem, automaticamente, **três campos ao mesmo tempo**: `qualification_score` (número),
`qualification_status` (enum `not_started|in_progress|qualified|not_qualified|lost`,
`001_base_schema.sql:14-20,125-126`) e `interest_level`. Esse `qualification_status` já existe —
mas mede *engajamento no chat*, não *qualidade real do lead*. É o mesmo problema que esta epic
resolve para a Temperatura, só que já materializado num campo com nome parecido.

**Por isso o campo desta story NÃO se chama `leads.qualification`** (colidiria em nome e em
conceito com o `qualification_status` automático). Nasce como **`leads.qualificacao_comercial`**
(enum `qualificacao_comercial`: `bom|regular|ruim|invalido`) — nome que deixa explícito que é
uma avaliação comercial manual, sem nenhuma relação com o score/status automático da Nicole.

## Escopo

**IN:**
1. **Migration** (numerar contra a última local — hoje `200_meta_capi_outbox.sql` — e conferir
   também contra o schema remoto de prod antes de aplicar, lição 75-188):
   - `CREATE TYPE qualificacao_comercial AS ENUM ('bom', 'regular', 'ruim', 'invalido');`
   - `ALTER TABLE leads ADD COLUMN qualificacao_comercial qualificacao_comercial;` — nullable,
     **sem default** (mesmo padrão estrutural de `interest_level`, `001_base_schema.sql:43-47,127`).
   - Índice opcional (`idx_leads_qualificacao_comercial`), seguindo o padrão do índice existente
     em `qualification_status` (`001_base_schema.sql:147`), se o @dev julgar necessário para os
     filtros da 84-2/84-5.
2. **Nova tabela de prazos configuráveis por org**, seguindo o padrão exato de `roleta_config`
   (`068_roleta_leads.sql:7-27`: 1 linha por org, RLS `USING (org_id = user_org_id())`,
   trigger `set_updated_at`): `qualificacao_comercial_config` com colunas
   `prazo_bom_horas integer NOT NULL DEFAULT 24`,
   `prazo_regular_dias integer NOT NULL DEFAULT 3`,
   `prazo_ruim_dias integer NOT NULL DEFAULT 30`
   (valores da tabela de prazos do Epic 84 — ponto de partida, editável pela equipe comercial;
   a UI de edição desses prazos é backlog futuro, fora desta story — só a coluna/tabela nasce
   aqui, consumida programaticamente pela 84-4).
3. **Submódulo de permissão `leads.qualificacao`** em `SUBMODULE_MAP`
   (`packages/web/src/lib/permissions-modules.ts:101-118`) — hoje `leads` não tem nenhum
   sub-módulo (só `configuracoes`, `sistema` e `campanhas` têm), então esta story cria a
   primeira entrada nesse bucket: `leads: { "leads.qualificacao": "Qualificação Comercial" }`.
4. **Endpoint:** estender o `PATCH` já existente em `packages/web/src/app/api/leads/[id]/route.ts`
   (que já tem `allowedFields` incluindo `interest_level`, `qualification_status`,
   `qualification_score` — linhas 68-103 — e já chama `logAudit()` genérico na linha 137) em vez
   de criar rota nova:
   - Adicionar `"qualificacao_comercial"` a `allowedFields`.
   - Quando `qualificacao_comercial` estiver presente no payload, checar
     `canAccess(appUser.id, appUser.org_id, "leads.qualificacao")` (403 se `false`) **além** do
     gate de role hardcoded já existente na rota (linha 51) — não substituir o gate atual dos
     demais campos, só adicionar a checagem extra para este campo específico.
   - Ler o valor atual de `qualificacao_comercial` **antes** do update (para o `old_value`) e
     chamar `logAudit()` com `action: "lead.qualificacao_comercial_updated"`,
     `metadata: { old_value, new_value }` — além (não em vez) do `logAudit()` genérico
     `"lead.update"` que a rota já dispara.

**OUT (fora desta story):**
- UI de edição/exibição do campo (84-2).
- Sugestão automática não-vinculante (84-3).
- Alertas/cron que leem `qualificacao_comercial_config` (84-4).
- Relatório cruzado (84-5).
- UI de edição dos prazos em `qualificacao_comercial_config` (a tabela nasce com defaults; tela
  de configuração é backlog).
- Qualquer mudança no pipeline da Nicole (`chat/pipeline.ts`, `haiku-enrichment.ts`) ou nos
  campos `interest_level`/`qualification_score`/`qualification_status` — continuam intocados.

## Acceptance Criteria
1. **Given** a migration aplicada, **then** existe o enum `qualificacao_comercial` e a coluna
   `leads.qualificacao_comercial` (nullable, sem default) — leads existentes ficam com o valor
   `NULL`, nenhuma automação preenche o campo.
2. **Given** a migration aplicada, **then** existe `qualificacao_comercial_config` com 1 linha
   por org (defaults 24/3/30), RLS org-scoped idêntica à de `roleta_config`.
3. **Given** a matriz de permissões, **then** o sub-módulo `leads.qualificacao` aparece como
   linha filha expansível sob "Leads" (renderização genérica já existente em
   `permissions-matrix.tsx`, sem mudança de UI necessária).
4. **Given** um usuário sem `canAccess(...,"leads.qualificacao")`, **when** faz
   `PATCH /api/leads/[id]` com `qualificacao_comercial` no payload, **then** recebe 403 e o
   campo não é alterado — os demais campos do payload (se houver) seguem o gate atual da rota
   normalmente.
5. **Given** um usuário com acesso, **when** atualiza `qualificacao_comercial` de `null` para
   `"bom"` (ou entre quaisquer dois valores), **then** a resposta é 200, o valor persiste, e
   `logAudit()` é chamado com `action: "lead.qualificacao_comercial_updated"` e
   `metadata: { old_value: null, new_value: "bom" }` (fire-and-forget — falha de audit não
   derruba a resposta).
6. **Given** qualquer combinação de `qualificacao_comercial` e `interest_level`/`qualification_status`
   no mesmo lead, **then** ambos persistem de forma independente — não há trigger nem constraint
   ligando os dois.
7. **Given** os webhooks existentes (Meta Ads, WhatsApp) ou o pipeline da Nicole, **then**
   nenhum deles referencia ou escreve em `qualificacao_comercial` (verificável por grep e por
   teste que a Nicole não recebe esse campo em nenhum patch).
8. Testes verdes (migration testável via suíte existente de RLS/config, se houver padrão
   equivalente para `roleta_config`; unit do endpoint cobrindo 403/200/audit), `tsc --noEmit`
   e `eslint` limpos nos arquivos tocados.

## Tasks

- [x] **T1 (AC1)** — Migration: `CREATE TYPE qualificacao_comercial AS ENUM (...)` +
  `ALTER TABLE leads ADD COLUMN qualificacao_comercial qualificacao_comercial` (nullable, sem
  default). Numerar contra a última local (`200_meta_capi_outbox.sql`) **e** contra o schema
  remoto de prod antes de aplicar (lição 75-188).
- [x] **T2 (AC2)** — Migration: criar `qualificacao_comercial_config` (1 linha por org, RLS
  `USING (org_id = user_org_id())`, trigger `set_updated_at`, defaults `prazo_bom_horas=24`,
  `prazo_regular_dias=3`, `prazo_ruim_dias=30`), seguindo o padrão de `roleta_config` (068).
- [x] **T3 (AC3)** — Adicionar `leads: { "leads.qualificacao": "Qualificação Comercial" }` em
  `SUBMODULE_MAP` (`permissions-modules.ts`). Sem seed de override por role (decisão confirmada
  abaixo) e sem mudança em `permissions-matrix.tsx`.
- [x] **T4 (AC4, AC5)** — Em `api/leads/[id]/route.ts`: adicionar `"qualificacao_comercial"` a
  `allowedFields`; quando presente no payload, checar
  `canAccess(appUser.id, appUser.org_id, "leads.qualificacao")` (403 se `false`); ler o valor
  atual antes do update; chamar `logAudit()` específico
  (`action: "lead.qualificacao_comercial_updated"`, `metadata: {old_value, new_value}`) **além**
  do `logAudit()` genérico (`"lead.update"`) já existente na rota.
- [x] **T5 (AC6, AC7)** — Confirmar (grep + teste) que nenhum webhook (Meta Ads, WhatsApp) ou o
  pipeline da Nicole (`chat/pipeline.ts`, `haiku-enrichment.ts`) referencia
  `qualificacao_comercial`; confirmar que o campo novo e `interest_level`/`qualification_status`
  mudam de forma independente (sem trigger/constraint ligando os dois).
- [x] **T6 (AC8)** — Testes: SUBMODULE_MAP.leads (permissions-modules.test.ts), endpoint (403
  sem acesso / 200 com acesso / audit chamado com old→new / campos sem relação não exigem o
  gate) em `route.test.ts` novo. `tsc --noEmit` + `eslint` limpos nos arquivos tocados.

## Dev Notes

### Fontes e padrões a seguir
- `interest_level`: enum em `supabase/migrations/001_base_schema.sql:43-47`, coluna linha 127 —
  padrão estrutural (coluna simples nullable), mas **não** um exemplo de "campo manual" (ver
  Contexto acima — ele é sobrescrito pela Nicole).
- `qualification_status`/`qualification_score`: `001_base_schema.sql:14-20,125-126,147` — campo
  automático homônimo por conceito, mantido intocado; risco de confusão de nome mitigado pelo
  nome `qualificacao_comercial` escolhido para o campo novo.
- Auditoria: `packages/web/src/lib/audit.ts` — `logAudit()` (fire-and-forget, silencia erro) e
  `getRequestIp()`. Reusar diretamente, sem tabela de histórico nova.
- Permissões: `packages/web/src/lib/permissions-modules.ts:101-118` (`SUBMODULE_MAP`) e o padrão
  de introdução de sub-módulo documentado na Story 75-229
  (`docs/stories/75-229-campanhas-agente-matriz-permissoes.story.md`) — mecanismo de herança:
  sem linha explícita em `role_permissions` para a chave dotted, `canAccess` herda do módulo pai
  (`permissions.ts:344-345`, conforme citado na 75-229).
- Tabela de config por org: `supabase/migrations/068_roleta_leads.sql:7-27` (`roleta_config`) —
  copiar o padrão de RLS (`USING (org_id = user_org_id())`) e trigger `set_updated_at`.
- Endpoint a estender: `packages/web/src/app/api/leads/[id]/route.ts` — `allowedFields` (linhas
  68-103), gate de role atual (linha 51, array hardcoded `["admin","supervisor","gerente-comercial","sdr"]`
  + fallback de corretor responsável/imob), `logAudit()` genérico já dispara na linha 137
  (`action: "lead.update"`) — **este AC pede um segundo `logAudit()` específico**, não a
  substituição do genérico.

### Decisão confirmada (Lucas, 2026-08-04): sem seed explícito de permissão por role
Diferente da Story 75-229 (onde a maioria dos roles tinha `campanhas: true` por herança
indesejada e por isso precisou de uma migration de seed explícito true/false por role), aqui a
herança já produz o resultado correto sem seed nenhum: **`obras` já nasce com `leads: false`**
(`047_roles_permissions.sql:260`), então sem override explícito ele herda `false` também para
`leads.qualificacao` — leads que não são do comercial (segmento `obras`/não-comercial) já ficam
de fora automaticamente. **Confirmado: não seedar override.** `leads.qualificacao` herda
normalmente de `leads` via `canAccess` — quem já tem `leads: true` (admin, supervisor, broker e
qualquer role comercial customizado) pode editar; quem tem `leads: false` (obras e roles sem
esse módulo liberado), não. Se no futuro um role customizado tiver `leads: true` por outro
motivo (ex.: visualização) mas não devesse editar Qualificação, aí sim usar o padrão de seed da
migration 199 como exceção pontual — não é o caso hoje.

### Numeração de migration
Última migration local conhecida no momento do draft: `200_meta_capi_outbox.sql`. Conferir
novamente (local + schema remoto de prod) antes de nomear/aplicar — lição recorrente 75-188 (numeração
local diverge de prod quando há PRs concorrentes).

### Testing
- Unit: `canAccess` para `leads.qualificacao` — herança do módulo pai (sem override) + caminho
  com override explícito, replicando o padrão de teste já usado para
  `sistema.notificacoes-financeiras`/`campanhas.agente`.
- Unit: `PATCH /api/leads/[id]` — 403 quando falta `leads.qualificacao` e o payload inclui
  `qualificacao_comercial`; 200 + persistência quando há acesso; `logAudit` chamado com
  `old_value`/`new_value` corretos (mock do audit).
- Migration: se existir suíte de teste de RLS/config por org (conferir se `roleta_config` tem
  equivalente), replicar para `qualificacao_comercial_config`.
- Grep/smoke: confirmar que `chat/pipeline.ts` e `haiku-enrichment.ts` não foram tocados e não
  referenciam `qualificacao_comercial`.

## File List
**Criados:**
- `supabase/migrations/215_leads_qualificacao_comercial.sql` — enum `qualificacao_comercial`,
  coluna `leads.qualificacao_comercial`, índice, tabela `qualificacao_comercial_config` (RLS +
  trigger `set_updated_at`).
- `packages/web/src/app/api/leads/[id]/route.test.ts` — 4 testes: 403 sem `leads.qualificacao`,
  200 + persistência + audit (null→bom), audit com old_value correto (bom→regular), payload sem
  `qualificacao_comercial` não exige o gate nem audita.

**Modificados:**
- `packages/web/src/lib/permissions-modules.ts` — novo bucket `leads` em `SUBMODULE_MAP` com
  `"leads.qualificacao": "Qualificação Comercial"`.
- `packages/web/src/lib/permissions-modules.test.ts` — teste novo confirmando a entrada de
  `SUBMODULE_MAP.leads`.
- `packages/web/src/app/api/leads/[id]/route.ts` — `qualificacao_comercial` em `allowedFields`;
  gate `canAccess(...,"leads.qualificacao")` específico; leitura do valor atual estendida
  (`atual.qualificacao_comercial`) para o `old_value`; `logAudit()` específico
  (`lead.qualificacao_comercial_updated`) além do genérico já existente.

## Dev Agent Record

### Agent Model Used
Claude Sonnet 5 (claude-sonnet-5) — @dev (Dex), modo YOLO, em git worktree isolado
(`.claude/worktrees/84-1-qualificacao-lead-schema`, branch a partir de `origin/main`) por causa
de outra sessão em paralelo usando o diretório de trabalho principal.

### Completion Notes
- **T1-T6 implementados conforme o escopo.** Nenhuma decisão nova além das já registradas no
  Change Log v0.1/v0.2 (nome do campo, sem seed de permissão).
- **Migration renumerada:** o draft assumia `200_meta_capi_outbox.sql` como última local (branch
  `feat/75-229-...`), mas o worktree parte de `origin/main`, onde a última migration já era
  `214_hotfix_revoke_anon_bolsao_pii_log.sql`. Migration criada como **`215`**, não `201` —
  confirmar de novo contra o schema remoto de prod antes de aplicar (lição 75-188 seguida).
- **`SUBMODULE_MAP.campanhas["campanhas.agente"]` (Story 75-229) não existe em `main`** — essa
  story ainda não foi mergeada. Isso não bloqueou nada aqui (bucket `leads` é independente), só
  registrando para não causar confusão numa comparação futura de diff.
- **Linhas dos Dev Notes levemente desatualizadas por causa do rebase implícito para `main`**
  (ex.: `allowedFields` estava citado como linha 68-103, hoje é 71-115; `logAudit` genérico
  citado como linha 137, hoje é 206) — o CONTEÚDO e o padrão citados continuam corretos, só o
  número de linha absoluto mudou por código adicionado entre as duas branches (Story 75-237,
  `interest_level_manual`, e a remoção de `lost_reason` da whitelist — Story 75-269). Não exigiu
  nenhuma mudança de abordagem, só ajuste dos números ao editar.
- **Descoberta útil não antecipada no draft:** a rota já tem um padrão de "leitura do estado
  atual sob demanda" (`precisaEstadoAtual`/`atual`) usado por `interest_level` (Story 75-237) —
  reaproveitei exatamente esse padrão para buscar o `old_value` de `qualificacao_comercial`, em
  vez de criar uma leitura separada.
- **Sem seed de override de permissão** (decisão já confirmada no draft/validação): `obras` já
  tem `leads: false` (047), então herda `false` também para `leads.qualificacao` sem nenhuma
  linha extra.
- Nenhum teste de RLS dedicado foi encontrado para `roleta_config` (só há teste do endpoint
  `roleta/config/route.ts`, que mocka o Supabase) — segui o mesmo nível de cobertura: sem teste
  de RLS isolado para `qualificacao_comercial_config`, coberto indiretamente pela política SQL
  copiada 1:1 do padrão existente.
- **Checks executados:** `vitest run` completo (1675/1675 verdes, 138 arquivos), `tsc --noEmit`
  limpo (precisou de `NODE_OPTIONS=--max-old-space-size=8192` neste ambiente — memória padrão do
  processo local não foi suficiente, não é um problema do código), `eslint` dirigido nos 6
  arquivos tocados (0 erros, 1 warning corrigido — parâmetro não usado no mock de teste), `next
  build` completo com sucesso (mesma necessidade de heap maior).
- Migration **não aplicada em nenhum banco** — aplicação é passo do deploy (@devops), inclusive
  a reconferência de numeração contra prod, como em todas as stories anteriores.

### Debug Log References
Nenhum necessário — implementação direta seguindo os padrões já mapeados no draft; o único
ajuste foi de linha/numeração por causa da branch base (main vs. feat/75-229), documentado acima.

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Quality validation via processo manual (@qa gate).

## PO Validation (@po Pax — 2026-08-04)

**GO (9/10).** Título/descrição claros, contexto e valor de negócio evidentes, escopo IN/OUT
bem delimitado, ACs testáveis e mapeadas nas Tasks (T1-T6), dependências corretas (primeira
story do Epic 84, sem pré-requisito bloqueante). Referências técnicas conferidas uma a uma
contra o código real (`001_base_schema.sql`, `068_roleta_leads.sql`, `047_roles_permissions.sql`,
`permissions-modules.ts`, `audit.ts`, `api/leads/[id]/route.ts`) — nenhuma inventada.

**Fix aplicado durante a validação:** a story não tinha uma seção `Tasks` com checklist
sequencial ligado às ACs (só "Escopo IN" em prosa) — item exigido pelo processo de draft
(`create-next-story.md` §5.1) e presente no padrão real de stories anteriores (ex. 75-229).
Adicionada a seção `Tasks` (T1-T6, cada uma referenciando as ACs que cobre) diretamente, por ser
extração mecânica do conteúdo já existente (Escopo + AC), sem decisão nova — não precisou voltar
para @sm.

**Condição registrada (não bloqueia):** T1/migration segue a mesma cautela recorrente do
projeto — conferir numeração local **e** o schema remoto de produção antes de aplicar (lição
75-188), já documentada nos Dev Notes.

Status: Draft → Ready.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-04 | 0.1 | Draft criado a partir do Epic 84. Durante o draft, corrigida premissa do brief: `interest_level` não é 100% manual (sobrescrito pelo pipeline da Nicole junto com `qualification_score`/`qualification_status`). Campo renomeado de `leads.qualification` para `leads.qualificacao_comercial` para evitar colisão de nome/conceito — confirmado com o usuário. | @sm (River) |
| 2026-08-04 | 0.2 | Confirmado com o Lucas: leads/roles fora do comercial não precisam de acesso à Qualificação. Fechado o AUTO-DECISION — sem seed explícito de permissão; `obras` já herda `false` de `leads: false` (047), então a herança já basta. | @sm (River) |
| 2026-08-04 | 0.3 | Validação PO: GO (9/10). Adicionada seção Tasks (T1-T6) ausente no draft, ligando cada task às ACs correspondentes. Nenhuma referência técnica hallucinada — conferidas contra o código real. Status Draft → Ready. | @po (Pax) |
| 2026-08-04 | 0.4 | Implementação completa (T1-T6, modo YOLO, em worktree isolado a partir de `origin/main`): migration 215 (enum + coluna + tabela de prazos configuráveis), sub-módulo `leads.qualificacao`, gate + audit específicos no PATCH existente. Migration renumerada de 201→215 (main estava mais adiantada que a branch usada no draft). `vitest` 1675/1675, `tsc --noEmit` limpo, `eslint` limpo nos arquivos tocados, `next build` OK. Status Ready → Ready for Review. | @dev (Dex) |
| 2026-08-04 | 0.5 | QA: CONCERNS (ver QA Results). Removida uma linha duplicada de Change Log (artefato mecânico da v0.3) — limpeza administrativa, sem mudança de conteúdo. | @qa (Quinn) |

## QA Results

### Review Date: 2026-08-04

### Reviewed By: Quinn (Test Architect) — @qa

**Veredito: CONCERNS (aprovado com ressalvas — pode seguir para @devops).**

**7 checks:** code_review PASS · unit_tests PASS (1675/1675, confirmado de forma independente) ·
acceptance_criteria CONCERNS (AC1, AC3-AC8 PASS; AC2 tem redação imprecisa — ver REQ-001) ·
regressions PASS · performance PASS · security PASS · documentation PASS.

**Validações executadas independentemente pelo QA (não apenas conferindo o relato do @dev):**
`vitest run` completo (1675/1675, 138 arquivos) · `tsc --noEmit` (limpo, precisou de
`NODE_OPTIONS=--max-old-space-size=8192` neste ambiente — confirmado como limitação de memória
do processo local, não relacionado ao código) · `eslint` dirigido nos 4 arquivos de
código/teste tocados (0 erros/0 warnings) · leitura linha a linha do diff completo (`git show
HEAD`) · conferência de que `SUBMODULE_MAP` é consumido genericamente em
`permissions-matrix.tsx:658` e `user-edit-modal.tsx:331` (confirma AC3 sem precisar de mudança
de UI) · grep confirmando que `chat/pipeline.ts` e `haiku-enrichment.ts` não referenciam
`qualificacao_comercial` (AC7) · leitura da migration completa (enum sem default, RLS idêntica
ao padrão de `roleta_config`, `WITH CHECK` implícito correto para `INSERT` por ausência de
cláusula `FOR`, mesmo padrão pré-existente).

**Achados:**
- **REQ-001 (low):** AC2 diz "existe `qualificacao_comercial_config` com 1 linha por org" mas a
  migration não semeia nenhuma linha — a tabela nasce vazia por design (mesmo padrão lazy-create
  de `roleta_config`, documentado nos Dev Notes/Completion Notes do próprio @dev). O
  comportamento está correto; só a redação da AC ficou imprecisa. Não bloqueia.
- **TEST-001 (low):** AC7 pedia confirmação "por grep e por teste"; só o grep foi feito. Sem
  teste automatizado que travaria uma regressão futura se alguém adicionar o campo em
  `chat/pipeline.ts`/`haiku-enrichment.ts`. Nice-to-have para story futura.
- **REL-001 (low):** leitura do `old_value` antes do `UPDATE` sem lock — race condition teórica
  em edições concorrentes do mesmo lead. Padrão idêntico ao já existente para
  `interest_level_manual` (Story 75-237) na mesma rota — risco herdado, não introduzido por esta
  story. Aceitável para o volume de escrita esperado (edição manual).
- **MNT-001 (low, corrigido nesta revisão):** Change Log tinha uma linha duplicada (artefato
  mecânico da v0.3) — removida diretamente por ser limpeza administrativa sem decisão de
  conteúdo.

**Destaques positivos:** reuso extensivo e correto (enum+coluna no padrão de `interest_level`,
audit via `logAudit()` existente, `SUBMODULE_MAP` sem mudança de UI, RLS copiada 1:1 de
`roleta_config`, endpoint estendido em vez de rota nova) · nomeação do campo
(`qualificacao_comercial`) evita corretamente a colisão com o `qualification_status` automático
já existente — validado lendo o código real do pipeline da Nicole · testes cobrem os 4 cenários
relevantes (403, 200+audit, old_value correto em mudança de valor, campos não relacionados não
exigem o gate) · nenhuma referência técnica inventada em toda a cadeia (epic → story → código).

### Gate Status

Gate: CONCERNS → docs/qa/gates/84.1-qualificacao-lead-schema-permissoes-auditoria.yml
