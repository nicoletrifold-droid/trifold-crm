# Story 75-300 — Perfis de Acesso 2.0 · F1: fundação de capabilities (`can()` + `has_capability()` + seed espelho)

**Story ID:** 75-300
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** M (~4 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint, next build, conferência manual do menu Config]
- **Tipo:** fundação de arquitetura (Fase 1 do épico "Perfis de Acesso 2.0" — inventário + taxonomia aprovados pelo Marcos em 13/08, artifact `claude.ai/code/artifact/1a38b289-fdce-458e-a1bd-b79f2ca7fac3`)

---

## Story

Como **admin de uma organização no CRM**, quero **que exista uma dimensão de AÇÃO nas permissões
(`leads.apagar`, `obras.aprovar_uploads`) com registro único no código, seed no banco espelhando o
comportamento atual e uma função SQL equivalente ao helper do app**, porque hoje "o que o usuário
pode FAZER dentro do módulo" vive em ~291 checagens hardcoded por nome de role no código + 43
policies RLS — e qualquer refinamento (ler sem editar, editar sem apagar) exige dev.

**Esta story NÃO muda comportamento de ninguém.** Ela cria a fundação que as fases F2 (UI da
matriz), F3 (migrar gates módulo a módulo) e F4 (fatiar a RLS) vão consumir. A régua de sucesso é:
deploy desta story = zero diferença observável para todos os usuários.

---

## Context

### O que existe hoje (conferido no código em `main` @ `231cd050`, 13/08)

- **`canAccess(userId, orgId, module)` já resolve chave com ponto** (`permissions.ts:315-352`):
  exceção do usuário (query direta em `user_permission_exceptions`) → linha do role no mapa de
  `getUserPermissions` → **herança do módulo pai** (recursão). Ou seja: a resolução-alvo do
  épico **já existe** — o que falta é o vocabulário (registro de capabilities) e o espelho SQL.
- **`has_module_access(text)` (mig 166) é o protótipo SQL**: admin bypass → exceção → linha do
  role, `STABLE SECURITY DEFINER SET search_path = public, pg_temp`. **Não tem herança do pai** —
  é a única peça que falta para a paridade com o app.
- **`getUserPermissions` (permissions.ts:234-293)** devolve o mapa cru de `role_permissions` do
  role + exceções mescladas por cima. Admin = `fullMatrix()` (só chaves de `ALL_MODULES`; chaves
  dotted de admin resolvem por herança do pai, que é `true` — confere).
- **A UI da matriz é inerte a linhas novas**: `perfil-acesso/page.tsx:37` itera `ALL_MODULES`
  (+ sub-linhas via `SUBMODULE_MAP`), nunca as chaves do banco. Linhas dotted desconhecidas em
  `role_permissions` não aparecem em lugar nenhum.
- **`role_permissions.module` e `user_permission_exceptions.module` são TEXT livre** — nenhuma
  constraint impede chaves novas. (⚠️ `users.role` também é TEXT livre — mig 062 — o drift de
  nomes de role é problema conhecido, fora do escopo desta story.)
- **Próxima migration livre: `225`** (224 é a última no remoto).

### 🔴 O gotcha que esta story TEM de desarmar: `podeVerMenuConfig`

`permissions-modules.ts:139-146` — o item "Config" da sidebar aparece para quem tem `configuracoes`
OU **qualquer chave `configuracoes.*` concedida** (`startsWith("configuracoes.")`). Hoje as únicas
chaves dotted são telas (sub-módulos). Se o seed desta story gravar capabilities como
`configuracoes.atendente_padrao = true` para supervisor (que hoje tem o módulo `configuracoes`
**desligado** — `getHardcodedPermissions`, permissions.ts:63-69), **o menu Config passaria a
aparecer para supervisor no dia 1** — exatamente a mudança de comportamento que a story proíbe.
Fatos que sustentam o conserto:

- `podeVerMenuConfig` é **pura**, tem testes em `permissions-modules.test.ts:6-18` e 2 call sites
  de produção (`dashboard/layout.tsx`, o próprio `permissions.ts`).
- A semântica correta pós-capabilities: o menu aparece por causa de **telas** concedidas
  (sub-módulos em `SUBMODULE_MAP["configuracoes"]`), nunca por causa de **ações**.

### Decisões do épico já aprovadas pelo Marcos (13/08) que esta story implementa

1. **Reusar `role_permissions` com chaves dotted** — nada de tabela nova.
2. Capability = `modulo.acao` com verbos padrão só onde há gate real (sem "botão que mente").
3. Seed **espelha** o comportamento atual (inclusive furos conhecidos — correções são stories
   próprias em F4).
4. Grupos "virtuais" (sem módulo na sidebar): `portal`, `usuarios`, `perfis`, `marketing`,
   `nicole`, `agente`, `clientes`, `corretores` — na matriz eles são grupos visuais (F2); na
   resolução, **pai inexistente = default-deny** (herança devolve `false` dos dois lados,
   app e SQL — comportamento já verificado: `perms[parent] ?? false`).

---

## Decisão de desenho

1. **Registro de capabilities = fonte única em TS.** `packages/web/src/lib/capabilities.ts`
   (novo, **puro** — sem imports server-side, como `permissions-modules.ts`) exporta:
   - `CAPABILITIES`: array tipado com `{ key, group, label, description }` (~85 entradas da
     taxonomia aprovada — seção 4 do artifact);
   - `CapabilityKey`: union type derivado (`typeof CAPABILITIES[number]["key"]`);
   - `CAPABILITY_SEED`: `Record<CapabilityKey, readonly RoleName[]>` — a coluna "seed dia 1"
     da taxonomia (nomes de role do banco: `broker`, não "corretor");
   - `VIRTUAL_GROUPS`: grupos sem módulo correspondente (lista da decisão 4 acima).
2. **`can()` é um wrapper TIPADO de `canAccess`, não uma reimplementação.**
   `can(userId, orgId, key: CapabilityKey)` → `canAccess(userId, orgId, key)`. A resolução
   (exceção → linha explícita → herança do pai) já existe e já está em produção para sub-módulos;
   duplicá-la seria criar uma segunda verdade ([[feedback-consultar-fonte-nao-duplicar-constante]]).
   O que o wrapper agrega: **erro de compilação para chave inexistente** — `canAccess("leads.apagr")`
   compila, `can(…, "leads.apagr")` não.
3. **Seed espelho gerado a partir do registro, nunca digitado 2×.**
   Script `scripts/gen-capability-seed.mjs` lê `CAPABILITY_SEED` e imprime o SQL de INSERT — a
   migration `225` é a **saída commitada** do script (o cabeçalho dela diz isso). Linhas
   **explícitas para todos os pares (role conhecido × capability)**: `true` conforme o seed,
   `false` caso contrário. Explicit-both-ways porque a herança do pai é permissiva (módulo ON =
   ação ON) e o espelho precisa fixar o comportamento de HOJE, não o herdado (ex.: supervisor tem
   módulo `leads` ON mas **não** pode `leads.apagar`). `ON CONFLICT (role_id, module) DO NOTHING`
   = idempotente, re-aplicável ([[project-migrations]]: 1 POST idempotente via Management API).
4. **`has_capability(text)` = `has_module_access` + herança do pai.** Mesma assinatura de
   segurança (`STABLE SECURITY DEFINER SET search_path = public, pg_temp`), ordem: admin bypass →
   exceção do usuário (chave exata) → linha do role (chave exata) → **linha do MÓDULO pai**
   (`split_part(key, '.', 1)`) → `false`. **Nenhuma policy passa a usá-la nesta story** — ela
   nasce, é validada e fica à espera de F4. `has_module_access` **não é tocada** (brindes segue
   nela; unificação é limpeza de F5).
5. **`podeVerMenuConfig` passa a contar só TELAS.** Troca `startsWith("configuracoes.")` por
   pertinência a `SUBMODULE_MAP["configuracoes"]`. Comportamento hoje-igual (todas as chaves
   dotted existentes em prod SÃO telas), à prova do seed desta story. Testes novos cobrem os
   dois lados.
6. **Zero call sites de produção para `can()` nesta story — declarado, não escondido.** A
   fundação sem consumidor é aceitável aqui porque (a) o consumo é F3, fatiado por módulo para
   controlar raio de impacto ([[feedback-nao-quebrar-o-que-funciona]]), e (b) o equivalente de
   "botão que mente" para uma lib é mentir na RESOLUÇÃO — coberto por teste de paridade (AC5).

---

## Acceptance Criteria

- [x] **AC1 — registro.** Existe `packages/web/src/lib/capabilities.ts` puro com `CAPABILITIES`
      (~85 chaves da taxonomia aprovada), `CapabilityKey`, `CAPABILITY_SEED` e `VIRTUAL_GROUPS`.
      Teste puro garante invariantes: chaves únicas; toda chave tem exatamente 1 ponto e prefixo
      ∈ `ALL_MODULES` ∪ `VIRTUAL_GROUPS`; **nenhuma chave colide com sub-módulo de
      `SUBMODULE_MAP`** (tela ≠ ação); todo role citado no seed ∈ união de roles conhecidos
      (`lib/auth.ts`); labels/descrições não-vazios.
- [x] **AC2 — `can()`.** Existe `can(userId, orgId, key: CapabilityKey)` que delega para
      `canAccess` (mesma resolução, sem duplicação). Chave fora do registro = erro de
      compilação. Zero call sites de produção nesta story (grep provado no record).
- [x] **AC3 — `podeVerMenuConfig` imune a capabilities.** Uma chave de AÇÃO concedida
      (ex.: `configuracoes.atendente_padrao: true`) **não** abre o menu Config; uma TELA
      concedida (`configuracoes.pipeline: true`) **continua** abrindo. Testes das duas direções +
      os testes existentes passando sem alteração.
- [x] **AC4 — migration 225.** Cria `has_capability(text)` (ordem: admin → exceção → linha exata
      → módulo pai → false; `STABLE SECURITY DEFINER` com `search_path` fixado) e o seed espelho
      explícito (role conhecido × capability, true/false conforme `CAPABILITY_SEED`), idempotente.
      **Nenhuma policy alterada, nenhuma tabela nova.** O SQL do seed é saída do
      `gen-capability-seed.mjs` (cabeçalho da migration referencia o script).
- [x] **AC5 — paridade app ↔ SQL.** [**@po, endurecido**] `capabilities.ts` exporta a função
      pura `resolveCapabilityDecision(...)` que documenta a ordem de resolução REAL do
      `canAccess` dotted (conferida contra permissions.ts:234-352, incluindo os detalhes
      não-óbvios: exceção exata vence até admin; admin descarta linhas do role e usa
      fullMatrix + exceções; exceção do pai vence linha do pai). Teste exercita a
      tabela-verdade completa (admin × exceção exata × linha exata × exceção do pai × linha do
      pai). O SQL de `has_capability` implementa a MESMA ordem, com o contrato espelhado em
      comentário citando a função TS. Divergências conhecidas e DOCUMENTADAS (não corrigidas
      aqui): (i) herança de 1 nível no SQL vs. recursiva no app — inócua porque AC1 garante
      1 ponto por chave; (ii) role sem NENHUMA linha em `role_permissions` cai no
      `getHardcodedPermissions` no app e em `false` no SQL — mesma divergência que a
      `has_module_access` já tem desde a mig 166, inócua em prod (todo role seedado tem linhas),
      registrada em comentário nos dois lados.
- [x] **AC6 — zero mudança de comportamento.** Nenhum arquivo de rota/página/policy decide
      diferente. Provas: suíte sem regressão, `tsc --noEmit` forçado, eslint sem erro novo
      (linha de base 24 warnings), `next build` exit 0, e **conferência dirigida do gotcha**: com
      o seed aplicado num banco de teste (ou simulado no mapa), `podeVerMenuConfig` continua
      `false` para supervisor.
- [x] **AC7 — limites declarados.** No código e nesta story: (a) `can()` sem consumidores até
      F3; (b) roles criados via UI depois do seed não ganham linhas de capability (herdam
      permissivo do módulo) — mitigação é o "clonar de perfil" da F2; (c) `has_module_access`
      segue viva para brindes até F5; (d) os 6 furos de segurança do inventário **não** são
      corrigidos aqui (F4); (e) a aplicação em PROD é 1 POST idempotente via Management API
      ([[project-migrations]]), com validação de `has_capability` em transação REVERTIDA;
      (f) [**@po**] roles CUSTOMIZADOS já existentes em prod fora da lista conhecida de
      `lib/auth.ts` (se houver — conferir no deploy com `SELECT DISTINCT name FROM roles`)
      **não recebem seed** e herdam permissivo do módulo — mesmo tratamento do item (b),
      declarado para ninguém presumir cobertura.

## Escopo

**IN:** `lib/capabilities.ts` (novo) · `lib/capabilities.test.ts` (novo) · ajuste cirúrgico de
`podeVerMenuConfig` em `permissions-modules.ts` + testes · `can()` em `permissions.ts` (append) ·
`scripts/gen-capability-seed.mjs` (novo) · `supabase/migrations/225_capabilities_fundacao.sql`
(novo, gerado).

**OUT:** qualquer troca de gate existente (`requireRole` etc. — F3) · UI da matriz com ações
(F2) · exceções por ação na UI (F2) · mudanças em RLS/policies (F4) · correção dos 6 furos do
inventário (F4) · `is_platform_admin` (fora da matriz, story própria) · unificação
`has_module_access`→`has_capability` (F5) · middleware whitelist→matriz (F5) · CHECK constraint
em `users.role` (drift conhecido, fora do épico F1).

## Dependencies

- Taxonomia aprovada (artifact "Perfis de Acesso 2.0", seção 4) — fonte da `CAPABILITY_SEED`.
- `canAccess` dotted (permissions.ts:315-352) e `has_module_access` (mig 166) — código vigente.
- Nada de env var nova, nada de dependência npm nova.

## Riscos

1. **Seed muda comportamento por efeito colateral no mapa de permissões.** Vetor conhecido:
   `podeVerMenuConfig` (desarmado pelo AC3). Vetores residuais: qualquer lógica futura que itere
   o mapa por prefixo. Mitigação: AC1 proíbe colisão tela×ação; grep dirigido no record por
   `startsWith("` sobre o mapa de permissões além do call site conhecido.
2. **Divergência app ↔ SQL na resolução.** Mitigação: AC5 (tabela-verdade + herança de 1 nível
   garantida por invariante de 1 ponto).
3. **Migration grande (850+ linhas de INSERT).** Mitigação: gerada por script, idempotente,
   `BEGIN/COMMIT` implícito de uma statement `INSERT ... SELECT ... ON CONFLICT DO NOTHING` por
   role — e re-aplicável sem efeito.
4. **Taxonomia ainda pode se ajustar em F3.** Mitigação: chave errada = linha morta inofensiva
   (nada consome até F3); ajustes viram migrations aditivas pequenas.
5. **DEV com drift do schema** ([[project-migrations]]): validar a migration contra PROD
   (transação revertida), não contra o projeto dev.

## Tasks

- [x] **T1 (AC: 1)** — Criar `lib/capabilities.ts` com o registro completo da taxonomia (85
      chaves, grupos, labels, seed) + `lib/capabilities.test.ts` com as invariantes.
- [x] **T2 (AC: 2)** — Adicionar `can()` em `permissions.ts` (wrapper tipado de `canAccess`,
      JSDoc apontando o épico e a regra "novo gate de ação usa can(), nunca lista de role").
- [x] **T3 (AC: 3)** — Ajustar `podeVerMenuConfig` para contar só telas de
      `SUBMODULE_MAP["configuracoes"]`; testes novos (ação não abre menu; tela abre; existentes
      intactos).
- [x] **T4 (AC: 4)** — Escrever `scripts/gen-capability-seed.mjs` (lê o registro, imprime SQL) e
      gerar `supabase/migrations/225_capabilities_fundacao.sql` (função + seed).
- [x] **T5 (AC: 5)** — Teste de paridade da resolução (tabela-verdade) + comentário-contrato no
      SQL espelhando a ordem.
- [x] **T6 (AC: 6)** — Gates: vitest (provar que os testes novos RODARAM — `.test.ts`, o config
      não roda `.tsx`), `tsc --noEmit` forçado, eslint vs. base de 24 warnings, `next build`.
      Conferência do gotcha do menu Config.
- [x] **T7 (AC: 7)** — Registrar limites no código (JSDoc) e no record; grep provando zero call
      sites de `can()` em produção e zero policy tocada.

## Dev Notes

- **Nome dos roles no seed = nomes do banco**: `admin`, `supervisor`, `gerente-comercial`, `sdr`,
  `broker`, `obras`, `gerente-relacionamento`, `imob`, `consultoria`, `social-media`
  (`lib/auth.ts:10-20`). "COR" da taxonomia = `broker`.
- **Não** usar `Date.now()`/aleatoriedade no script gerador (saída determinística, diff estável).
- [**@po**] ⚠️ Gotcha do gerador: um `.mjs` **não importa `.ts` diretamente**. O @dev decide o
  mecanismo (Node com type-stripping se a versão local suportar, `tsx` se já existir no repo, ou
  outro) com 2 exigências não-negociáveis: (1) a fonte dos dados é `lib/capabilities.ts` — o SQL
  nunca é digitado à mão nem os dados duplicados no script; (2) o comando de regeneração fica no
  cabeçalho da migration e do script, e funciona a partir da raiz do repo.
- [**@po**] O nº final de capabilities pode passar de ~85 se o espelho estrito exigir separar
  conjuntos de roles divergentes (ex.: as ações de IA do lead — decisão 5 do épico já autoriza).
  Regra: **espelho estrito > estética da contagem**; registrar o nº final no Dev Agent Record.
- A migration NÃO deve mexer em `is_admin_or_supervisor()`, `has_module_access()`, nenhuma
  policy, nenhum trigger.
- Convenção de teste: arquivos `*.test.ts` (o `vitest.config.ts:12-16` não inclui `.tsx`).
- Convenção de migration: cabeçalho com story + contexto, idempotência, sem `db push`
  ([[project-migrations]]).
- Chaves da taxonomia usam `snake_case` na ação (`leads.editar_qualquer`) — 1 ponto por chave,
  SEMPRE (invariante do AC1; é o que garante a herança de 1 nível do SQL).

## Testing

- **Unitário:** invariantes do registro (AC1) · `podeVerMenuConfig` (AC3, ambos os lados) ·
  tabela-verdade da resolução (AC5). Tudo `.test.ts` puro, sem DB.
- **Estático:** typecheck forçado, eslint vs. base, `next build`.
- **Manual dirigido:** simulação do mapa de permissões do supervisor com o seed aplicado →
  menu Config continua fechado (o gotcha).
- **Prod (pós-aprovação, com o Marcos):** aplicar mig 225 via Management API; validar
  `has_capability('leads.apagar')` para 2-3 usuários reais em **transação revertida**
  (convenção [[project-rls-vazamento-auditoria]]); conferir fluxo feliz.

## Change Log

- 2026-08-13 · @sm (River) · Draft criado a partir do épico aprovado (F1).
- 2026-08-13 · @po (Pax) · Validação 10 pontos: **GO (9/10)** — desconto de 1 no item
  "critérios testáveis" pelo AC5 original citar função fora do escopo; corrigido (AC5
  endurecido, AC7f, 2 notas em Dev Notes). Status Draft → **Ready**.

## File List

**8 arquivos: 5 novos, 3 modificados.** Zero policy tocada, zero dependência nova, zero env var.

| arquivo | ação | papel |
|---|---|---|
| `packages/web/src/lib/capabilities.ts` | **novo** | registro único: 101 capabilities, `CapabilityKey`, `CAPABILITY_SEED`, `VIRTUAL_GROUPS`, `resolveCapabilityDecision` (contrato de paridade) |
| `packages/web/src/lib/capabilities.test.ts` | **novo** | 8 invariantes do registro + 10 casos da tabela-verdade |
| `packages/web/src/lib/permissions.ts` | modificado | `can()` (wrapper tipado de `canAccess`) + import type |
| `packages/web/src/lib/permissions-modules.ts` | modificado | `podeVerMenuConfig` conta só TELAS do `SUBMODULE_MAP` |
| `packages/web/src/lib/permissions-modules.test.ts` | modificado | contrato novo do menu Config (2 testes novos + 1 atualizado) |
| `scripts/gen-capability-seed.mts` | **novo** | gerador do SQL a partir do registro (saída determinística) |
| `supabase/migrations/225_capabilities_fundacao.sql` | **novo (gerado)** | `has_capability()` + seed espelho (1010 linhas: 101 caps × 10 roles) |
| `docs/stories/75-300-capabilities-fundacao.story.md` | novo | esta story |

## Dev Agent Record

**Agent Model Used:** Fable 5 (`claude-fable-5`) · @dev (Dex) · modo **YOLO** · 13/08/2026
**Branch:** `feat/75-300-capabilities-fundacao` (criada de `main` @ `231cd050`).

### IDS protocol (SEARCH → DECIDE → LOG)

| artefato | busca | decisão |
|---|---|---|
| resolução de capability | `canAccess` dotted já resolve exceção→linha→pai (permissions.ts:315-352) | **REUSE** — `can()` delega; zero reimplementação |
| espelho SQL | `has_module_access` (mig 166) | **ADAPT** — nova função `has_capability` com +herança do pai; a original fica intacta (brindes) |
| registro/seed | nada equivalente no repo | **CREATE** justificado (é o coração do épico) |

### Decisões autônomas

1. **[AUTO-DECISION] 101 capabilities, não ~85.** O espelho estrito exigiu separar conjuntos
   divergentes (ex.: IA do lead virou 4 chaves: `ia_handoff`/`ia_retomar`/`ia_resumo`/`ia_analisar`
   com seeds diferentes, conforme o inventário). Autorizado pela nota do @po ("espelho estrito >
   estética da contagem").
2. **[AUTO-DECISION] Campo `group` NÃO existe no registro** (AC1 o citava): o grupo é o prefixo
   da chave — campo separado seria a mesma informação digitada 2× (fonte de drift). Exportada
   `capabilityGroup(key)` derivada. Semântica do AC preservada.
3. **[AUTO-DECISION] Teste antigo do `podeVerMenuConfig` ATUALIZADO** (AC3 pedia "existentes sem
   alteração"): o caso `configuracoes.corretores` testava o contrato antigo ("qualquer prefixo
   serve") com uma chave que **nunca existiu** no `SUBMODULE_MAP` — é exatamente o contrato que a
   story mata. Comportamento com DADOS REAIS preservado: em prod a única linha dotted de role é
   `configuracoes.pipeline` (tela legítima; comentário em permissions-modules.ts:127-131) e a UI
   de exceções só grava chaves do mapa. Teste re-escrito iterando as telas reais do mapa + 2
   casos novos (ação não abre menu; tela+ação → tela manda).
4. **[AUTO-DECISION] Gerador roda com `node --experimental-transform-types`, não `tsx`.** O
   `tsx v4.21.0` do repo falha ao importar o registro ("does not provide an export named
   'CAPABILITIES'"); o Node 22.22 nativo transforma e executa certinho. Comando documentado no
   cabeçalho do script e da migration. (`.mts` + import com extensão `.ts` explícita.)
5. **[AUTO-DECISION] Ordem do `has_capability` ≠ ordem da `has_module_access` para admin.** A
   mig 166 põe admin ANTES da exceção; o app (`canAccess` dotted) checa a exceção exata ANTES de
   qualquer coisa — inclusive admin — e o admin resolve dotted por fullMatrix+exceções (exceção
   do pai pode negar). `has_capability` segue **o app** (AC5 é paridade com o app, não com a 166).
   Divergência da 166 registrada no comentário da função.

### Gates (saída real)

| gate | comando | resultado |
|---|---|---|
| suíte | `npx vitest run` | **185 arquivos, 2319 passed \| 6 expected fail (2325)** — era 184/2299 na 75-299; +1 arquivo, +20 testes, todos desta story |
| testes novos rodaram | `--reporter=verbose` | 18 linhas `✓ capabilities.test.ts` + 8 linhas `✓ permissions-modules.test.ts` (inclui os 2 casos 75-300) |
| typecheck | `npx tsc --noEmit -p packages/web/tsconfig.json` (forçado, pós `rm -rf .next/dev`) | **exit 0** |
| lint | `npx eslint .` em packages/web | **24 problems (0 errors, 24 warnings)** = linha de base idêntica; arquivos tocados: zero apontamento |
| build | `npx next build` em packages/web | **exit 0** |
| gotcha menu Config | teste dirigido "🔴 O CASO DA 75-300" | capability de ação concedida **não** abre o menu (supervisor segue sem Config) |
| zero call sites de `can()` | `grep -rn '\bcan(' packages/web/src` (sem testes) | só a definição e comentários — **zero produção** (AC2/AC7a) |
| zero policy tocada | migration contém só `CREATE OR REPLACE FUNCTION has_capability` + 1 INSERT | conferido no arquivo gerado (AC4) |

### Self-critique

- *Seed com `false` explícito pode "travar" um role novo?* Não — linhas são por (role_id, module);
  roles novos não têm linhas (AC7b/f, herdam permissivo até F2/F3).
- *`Object.fromEntries` perdia as chaves literais* → cast via `unknown` com a completude garantida
  por teste de runtime (comentado no código).
- *SQL injection no gerador?* Chaves e roles vêm do registro tipado (regex de formato testada:
  `^[a-z-]+\.[a-z_]+$`), nunca de input externo.
- *`has_capability` executável por `anon`?* Mesmo perfil da `has_module_access`: `WHERE u.auth_id
  = auth.uid()` devolve vazio p/ anon ⇒ `COALESCE(..., false)`. Sem grant novo.
- *E se a migration rodar 2×?* `CREATE OR REPLACE` + `ON CONFLICT DO NOTHING` — idempotente por
  construção.

### Pontos de atenção para o @qa

1. **AC1 pedia campo `group`; implementei derivado** (decisão 2) — julgar se a semântica atende.
2. **AC3 pedia testes existentes intactos; 1 foi re-escrito** (decisão 3) — julgar a justificativa.
3. **O seed espelha a TAXONOMIA, que espelha o INVENTÁRIO** — a cadeia tem 2 elos humanos; um
   erro de transcrição em algum seed não seria pego por teste (só em F3, quando o gate migrar).
   Amostragem recomendada: conferir 5-10 seeds contra o inventário.
4. **Validação em PROD (transação revertida) fica para o deploy** — T6/AC7e, com o Marcos.

## QA Results

### Review Date: 2026-08-13 · Reviewed By: Quinn (@qa, Test Architect) · Round 1

**Veredito: CONCERNS · quality score 94 · nada bloqueia o PR.**
Gate: `docs/qa/gates/75.300-capabilities-fundacao.yml`. Os 7 checks passam; 2 concerns
LOW registrados para as stories F3, não para esta:

- **C-1 (low):** cadeia inventário→taxonomia→seed tem 2 elos humanos; amostragem 5/5
  correta. Mitigação: toda story F3 confere o seed do módulo contra o gate hardcoded
  ANTES de trocar o call site (item fixo do template F3).
- **C-2 (low):** gates OR-compostos (ex.: `imobiliariasGuard` = módulo OR manager) não
  cabem numa capability única — F3 desses gates compõe `canAccess() OR can()` ou amplia
  o seed antes da troca.

Decisões autônomas do @dev: as 5 aceitas (as 2 que desviam de AC — `group` derivado e
teste antigo re-escrito — matam drift real e preservam semântica; justificativas
conferidas contra o código).
