---
epic: 900
title: Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
status: Draft
created_at: 2026-07-29
updated_at: 2026-08-22  # faixa 900 + premissas reconferidas contra a main (capabilities, rotas, migrations)
created_by: Morgan (@pm)
priority: P0
tipo: Brownfield Enhancement (PRD-level, multi-story, 8 ondas)
numbering_note: "epic 900 — faixa alta reservada; renumerado de 84→86→87→900 após 3 colisões (ver §0.1)"
objetivo_negocio:
  - Vender o Trifold CRM para outras empresas em 3 tiers acumulativos, sem interromper a operação da Trifold Engenharia que roda em produção.
  - Transformar isolamento de tenant de convenção em invariante verificada por gate automatizado — pré-condição absoluta da venda.
  - Provisionar cliente novo em minutos pelo painel super-admin, sem SQL manual e sem deploy.
  - Medir e limitar consumo de IA por empresa, com margem por cliente observável.
  - Manter cobrança plugável (manual agora, gateway depois) sem acoplar regra de negócio a provider.
depends_on:
  - "PRE-0 (externo): PR #308 / migration 209_hotfix_rls_org_scope.sql aplicada em PRODUÇÃO. Precede 900-2 em diante — NÃO bloqueia 900-1 (criar a esteira de CI independe de migration aplicada)."
  - "PRE-1 (externo): projeto Supabase descartável criado (autorizado pelo dono do produto, ainda não existe). Bloqueia 900-3 e 900-17."
  - "PRE-2 (fato): não existe CI nem husky no repo (.github/ só tem agents/). A esteira é criação do zero, não configuração."
  - "PRE-3 (comercial): preço dos 3 tiers (PEND-1), cota de atendimentos por tier (PEND-1c) e preço do excedente (PEND-1b). Bloqueiam 900-27b e 900-41 — e SÓ elas, após a quebra 27a/27b."
fontes:
  - docs/architecture/saas-multi-tenant.md (arquitetura, 8 ondas, critérios de saída e reversão)
  - docs/audits/rls-multi-tenant-audit.md (auditoria contra produção, 13 achados, 4 lotes)
  - docs/architecture/adr/adr-002-shared-db-rls-tenant-isolation.md (Accepted)
  - docs/architecture/adr/adr-003-entitlements-layer-vs-rbac.md
  - docs/architecture/adr/adr-004-platform-admin-impersonation.md (Proposed — PARCIALMENTE REJEITADO por D14: a metade de impersonation caiu; a de platform_admin vale; ver §3.2)
  - docs/architecture/adr/adr-005-tenant-secrets-storage.md
  - docs/architecture/adr/adr-006-billing-provider-abstraction.md
  - docs/architecture/adr/adr-007-ai-usage-metering-unit.md (Proposed — unidade de VENDA sobrescrita pelo dono do produto)
stories_planned: [900-1 .. 900-50, exceto 900-45 (removida por D14); 900-27 e 900-42 quebradas em a/b — 51 stories ativas]
open_questions: [PEND-1, PEND-1b, PEND-1c, PEND-4, PEND-6, PEND-8, PEND-9, regra-de-contagem-de-atendimento]
resolved_questions: [PEND-0 (epic 900), PEND-2 → D11, PEND-3 → D14 (não), PEND-5 → D13, PEND-7 → D12]
---

# Epic 900 — Trifold CRM → SaaS Multi-Tenant

## 0. Antes de qualquer coisa: três avisos operacionais

### 0.1 Numeração — faixa reservada 900, a partir de 2026-08-22

**Este epic é o 900, e o número alto é deliberado.** Ele nasceu como 84, virou 86 em 2026-07-30, 87 em 2026-08-05 e **900** em 2026-08-22. Três colisões seguidas, todas pela mesma causa mecânica, que agora está resolvida por desenho em vez de por sorte.

**A causa, medida:** este epic passou de 02/08 a 22/08 como PR aberto sem merge (PR #337). Nesse intervalo a `main` entregou ~28 commits e **cada número que este epic reivindicou foi tomado por outro trabalho antes de o PR mergear**:

| Nº | Tomado por | Quando |
|---|---|---|
| 84 | `epic-84-qualificacao-lead` (PRs #362/#366) | 04-05/08 |
| 86 | `epic-86-meta-capi-tracking` — mergeado, `86-1` em produção (migration 215) | 04/08 |
| 87 | `epic-87-nicole-confiabilidade-contexto` — stories `87-0`…`87-13`, várias mergeadas | 05/08 |
| 88 | `epic-88-nicole-tool-use-agenda` | ~11/08 |

**Por que 900 encerra o problema.** A convenção do projeto é *"maior número existente + 1"*, o que faz todo epic novo mirar a mesma vizinhança e disputá-la com stories pontuais que nascem e mergeiam no mesmo dia. Um epic de 8 ondas não mergeia no mesmo dia — ele é estruturalmente lento, e por isso estruturalmente perdedor nessa disputa. A faixa **900+** fica fora do alcance do incremento natural: para colidir, o projeto teria de criar ~660 epics. **Não é uma exceção pontual — é a regra para epics multi-onda:** quem não mergeia no dia em que nasce não disputa a faixa baixa.

As stories deste epic são `900-1` … `900-50`, das quais **51 estão ativas** (com `900-27` e `900-42` quebradas em `a`/`b`): o ID `900-45` foi **removido por decisão de produto** (D14, sem impersonation) e deliberadamente **não** foi reaproveitado — ver §3.2. `900-45` não é lacuna nem esquecimento.

> Ao ler referências cruzadas: qualquer `84-N`, `85-N`, `86-N`, `87-N` ou `88-N` citado neste documento aponta para trabalho **de fora** deste epic. **Nenhuma story deste epic usa prefixo de dois dígitos.**

> ⚠️ **Lição operacional — é do processo, não deste documento.** "Próximo número livre" resolve a colisão no instante em que o epic é escrito e **não a impede depois**. Entre draftar e mergear, qualquer story pontual toma o número. Duas saídas, e este epic precisou das duas: **faixa alta** (esta seção) **e merge imediato do epic em `Draft`**, para o número existir na `main`. Renumerar 1037 referências cruzadas custa um `perl -pi`; revisar o que o regex não alcança — prosa que afirma "este epic é o 86", tabelas de prefixos, `numbering_note` — é o que custa, e foi feito três vezes.

### 0.2 ⚠️ Numeração de migration: a próxima é **238** — e o diretório tem armadilhas

Estado **reverificado no repo em 2026-08-22** (os valores de 2026-08-03 estão na coluna da direita para mostrar a velocidade da deriva):

| Fato | Valor hoje | Em 03/08 |
|---|---|---|
| Arquivos `.sql` em `supabase/migrations/` | **259** | 222 |
| Maior **número** de prefixo | **237** | 209 |
| **Próxima migration deste epic** | **238** | 210 |
| Prefixos **duplicados** | **21** — `021 024 025 027 028 029 031 032 033 034 036 044 048 063 066 075 102 104 164 170 230` | 20 |
| Arquivos `_remote_only.sql` | **11** | 11 |

**Contagem de arquivos ≠ maior número.** São 259 arquivos e o maior prefixo é 237, porque há 21 prefixos repetidos (e lacunas). Qualquer AC que diga "as N migrations" precisa dizer **qual** N — nunca derivar um do outro. **Reconferir estes números no dia em que a story for implementada**, não na leitura do epic: em 19 dias o diretório ganhou 37 arquivos e um prefixo duplicado novo (`230`).

**A armadilha de ordenação, para `900-3` — e ela deixou de ser teórica.** A ordem **lexicográfica** difere da **numérica** (`024_phone_normalization_part1.sql`, `024_phone_normalization_part1_remote_only.sql`, `024b_mensagens_sender_display_name.sql`).

**Isto foi executado em 2026-08-05 e produziu resultado**, então não é mais previsão: as migrations então existentes (237 arquivos, até a `215`) foram aplicadas do zero num Supabase limpo. **233 aplicaram; 4 falharam**, e o schema final ficou a 116 tabelas contra 115 de produção. As 4 falhas, todas reais e nenhuma causada por ordenação:

| Migration | Causa | O que revela |
|---|---|---|
| `011_noshow_stage` · `063_add_proposta_represamento_stages` | Inserem em `kanban_stages` com `org_id = 00000000-…-0001`, e **nenhuma migration cria essa organização** | O banco reconstruído do zero **não é funcional sem um seed manual**. A org `Trifold Engenharia` existe em produção desde 01/04 e não vem de migration. É a prova mais direta do FR-11 (fim dos UUID de org hardcoded) |
| `025_phone_normalization_part2` (+ `_remote_only`) | Criam o mesmo índice que `021_phone_normalization_part2` já criou, sem `IF NOT EXISTS` | Migration renumerada **sem remover a antiga** — a duplicação de prefixos não é só cosmética |

**Achado adicional, e é o mais consequente: o drift migrations↔produção é bidirecional.**

- Nas migrations, **ausentes em produção**: `lead_facts`, `lead_memories`, `match_lead_memory` — confirma por evidência independente que a camada de memória da Nicole tem código vivo e banco morto.
- Em produção, **ausentes das migrations**: `clicksign_webhook_debug`, `qualificacao_comercial_config`, e as funções `normalize_clientes_cpf`, `rls_auto_enable`, `sync_property_available_units` — criadas fora do controle de migrations.

**Consequência de método para `900-3`:** aplicar via Management API roda **o arquivo inteiro numa transação**, o que faz `ALTER TYPE … ADD VALUE` + uso do valor no mesmo arquivo estourar `55P04`. O `db push` real usa `psql` em autocommit por statement. Quem reimplementar precisa replicar o autocommit (5 arquivos exigiram isso), senão vai diagnosticar como defeito de migration o que é artefato do método — erro que já foi cometido e corrigido nesta apuração.

---

### 0.3 🆕 A camada de `capabilities` nasceu depois deste epic — e o FR-17 precisa dela

**Fato verificado em 2026-08-22.** Entre 02/08 e 22/08, enquanto este epic esperava merge, a `main` entregou as Stories **75-300 a 75-317**: uma camada de autorização nova, `packages/web/src/lib/capabilities.ts`, com `can()`, `resolveCapabilityDecision()`, `has_capability()` em SQL e uma matriz de ações por perfil. Migrations `226`–`230` fazem parte dela; 61 policies passaram a decidir por `has_capability`.

**Por que isso importa para este epic, e não é detalhe de implementação.** O FR-17 manda interseccionar o entitlement **como passo 5 dentro de `getUserPermissions()`**, com o argumento de que "um ponto de composição cobre todos". Esse argumento era verdadeiro quando escrito e **deixou de ser**:

| Caminho de autorização | Arquivos que o usam | Coberto pelo FR-17 como escrito? |
|---|---|---|
| `canAccess()` / `getUserPermissions()` | 98 | sim |
| `requireCapability()` / `can()` (capabilities) | **114** | **não** |
| `has_capability()` em policy SQL | 6 migrations | não |

A camada nova já é **maior** que a que o epic mapeou. Se o entitlement for interceptado só em `getUserPermissions()`, um módulo **não contratado** continuará acessível por qualquer rota que decida via `requireCapability` — que hoje são 114. O epic acertaria o alvo que existia em julho e erraria o que existe agora.

**O que isto muda, concretamente:**

1. **FR-17 e a story `900-28` precisam de dois pontos de composição, não um** — `getUserPermissions()` **e** o resolvedor de capabilities. A decisão de *onde* compor é do @architect e deve preceder o draft da Onda 3.
2. **A regra R12 do gate** (`900-42a`), que hoje procura duplicação TS↔SQL de permissões, tem uma terceira superfície a cobrir: a matriz de capabilities.
3. **A tabela `role_default_permissions` (`900-21`)** foi desenhada como fonte única dos defaults por role × módulo. Com a matriz de capabilities semeada em banco, existe risco de **duas fontes de verdade** para a mesma pergunta. Reconciliar as duas é pré-requisito de `900-21`, não trabalho posterior.

**Nada disto invalida o epic.** Entitlement ("esta empresa contratou?") continua ortogonal a RBAC ("este usuário pode?"), que é a tese do ADR-003 e segue de pé — capabilities é RBAC mais granular, não entitlement. O que mudou é a **superfície de aplicação**: virou duas, e o epic descreve uma.

> **Para o @architect, antes da Onda 3:** revalidar ADR-003 contra `capabilities.ts` e decidir o ponto (ou os pontos) de composição. Enquanto isso não acontecer, as Ondas 0, 1 e 2 seguem sem bloqueio — nenhuma delas toca entitlement.

---

## 1. Visão & Objetivo de Negócio

O Trifold CRM é hoje **multi-tenant no esqueleto e single-tenant na prática**: `organizations` existe desde a migration 001, `users.org_id NOT NULL` desde o dia 1, `org_id` aparece em 121 migrations e 357 arquivos TS/TSX, e há 218 policies RLS escritas. O que falta não é a estrutura — é a **garantia**.

Três lacunas medidas, não estimadas:

| Lacuna | Medida | Fonte |
|---|---|---|
| RLS não isola de verdade | ~98 de 195 cláusulas `USING` mencionam `org_id`; 16 tabelas com `org_id` e **zero** policies; 20 policies de Storage e **nenhuma** com escopo de org | `rls-multi-tenant-audit.md` |
| RLS não é a camada de enforcement efetiva | **129 dos 318 route handlers** usam `createAdminClient()` (service-role, bypassa RLS) | `saas-multi-tenant.md` §1.1 |
| Não existe camada de entitlement nem medição de IA por org | `permissions.ts` só responde "este usuário pode?", nunca "esta empresa contratou?"; nenhuma das 222 migrations tem `input_tokens`/custo por chamada | §1.1, ADR-007 |

**Objetivo:** transformar o sistema em SaaS multi-tenant com venda modular escalonada (3 tiers acumulativos), provisionamento pela Trifold via painel super-admin, e cobrança recorrente com cota de IA + excedente — **sem interromper a operação real da Trifold Engenharia, que roda em produção sem staging**.

**Princípio de ordenação (P6 da arquitetura):** isolamento e segurança **antes** de qualquer feature de venda. Um vazamento cross-tenant no primeiro cliente encerra o produto; duas semanas de atraso não.

### 1.1 Marco comercial

| Marco | Onda | Significado |
|---|---|---|
| **Vendável** | fim da **Onda 3** | Módulos ligam/desligam por contrato. IA cobrada "no olhômetro" — aceitável para o primeiro cliente, com contrato dizendo isso. |
| **Cobrável corretamente** | fim da **Onda 5** | Cota de atendimentos vale, alertas disparam, excedente é faturável. |
| **Erro irrecuperável** | vender **antes da Onda 1** | Isolamento não provado + primeiro cliente = incidente reportável e fim do produto. |

---

## 2. Escopo

### 2.1 EM escopo

1. Fechamento das lacunas de isolamento apontadas pela auditoria — **Lotes 1, 2 e 3** (o Lote 0 já foi feito: PR #308).
2. Esteira de CI criada do zero + gate de tenancy com baseline e catraca + testes cross-tenant.
3. `createOrgScopedAdminClient()` + regra de ESLint — o piso de isolamento nas rotas service-role.
4. Fim das constantes de UUID de org (14 arquivos) via chave semântica.
5. `provision_org()` + wizard de provisionamento no painel super-admin `/platform`.
6. Camada de entitlement (3 tiers acumulativos) ortogonal ao RBAC existente.
7. Medição de consumo de IA por org, com custo real por chamada persistido.
8. Cota de IA vendida em **atendimentos/mês**, com alertas em 80% e 100%.
9. Faturas internas (`tenant_invoices`) + `ManualBillingProvider` atrás da abstração `TenantBillingProvider`.
10. Papel `platform_admin` e auditoria append-only. **Sem impersonation** (D14).
11. Credenciais de integração por tenant (Vault) + roteamento reverso de webhook.

### 2.2 FORA de escopo (declarado)

| Fora | Por quê |
|---|---|
| **Gateway de pagamento** (Asaas/Stripe) | Decisão do dono do produto: nenhum agora. Cobrança acontece fora do sistema, atrás da abstração. Onda 8 só sob demanda de volume. |
| **Signup público / self-service** | Provisionamento é 100% pela Trifold via `/platform`. Não existe tela de cadastro para o público. |
| **Um usuário em várias empresas** | Decisão: 1 usuário = 1 empresa. `users.auth_id UNIQUE` + `users.org_id NOT NULL` permanecem. Acesso da Trifold a várias orgs vem da camada `platform_admin`, nunca de um usuário multi-org. (Fecha a Q9 da arquitetura e o P10 da auditoria.) |
| **Suspensão automática por inadimplência** | Decisão: suspensão é sempre manual pelo painel. O cron `subscription-lifecycle` marca `past_due` e alerta; **nunca** suspende. |
| **Revenda de números WhatsApp sob a WABA da Trifold** | Decisão: cliente traz o próprio número/WABA. Fecha a Q11 e reduz a Onda 7 a "onboarding de integração por cliente". |
| **Mecanismo de "pedido de acesso pontual com aprovação do cliente"** | **Fora de escopo, e a exclusão é deliberada.** É um sistema completo — pedido, justificativa, aprovação do admin do cliente, escopo, TTL, revogação, trilha imutável — ou seja, quase os mesmos 7 controles do ADR-004 que D14 rejeitou, com a aprovação deslocada do operador para o cliente. **Não pode ser especificado agora porque não se sabe se é necessário:** isso é a resposta de PEND-4. Contingência registrada: se PEND-4 concluir que existe caso de suporte que exige conteúdo, **nasce uma story G nova, que precisa passar por desenho antes de a Onda 6 ser planejada** — não uma cláusula condicional dentro da AC de outra story. Ver §14, PEND-4. |
| **Impersonation / "ver como o cliente"** | Decisão D14 (2026-07-30): não haverá. Suporte opera apenas com metadados e agregados via `PLATFORM_READABLE_TABLES`. Consequência de desenho em §3.2 — diagnóstico fica mais lento por escolha, e não existe backdoor a auditar. |
| **Banco por tenant / schema por tenant** | Rejeitado em ADR-002 (decisão de negócio). |
| **`lib/billing/**` e `platform_services`/`service_billing_*` (Epic 78)** | Domínio diferente: é o custo que a **Trifold paga**. Não ganha `org_id`. Só é tocado em 900-16, para re-ancorar a policy. |
| **`packages/bot` (Telegram)** | Canal de staging/teste da Trifold. Permanece single-tenant. |
| **Conversão de moeda BRL↔USD** | Exibir moeda de origem, sem taxa inventada (mesma regra do Epic 78, NFR-7). |
| **Reescrita de regra de negócio** (leads, roleta, obras, Sienge) | Entitlement é um filtro por cima, não uma reescrita. |

---

## 3. Decisões do dono do produto — são lei neste epic

Registradas em 2026-07-29. **Não reabrir.**

| # | Tema | Decisão | Consequência no epic |
|---|---|---|---|
| D1 | Isolamento | Shared DB + RLS endurecida, com gate de CI | ADR-002 Accepted; Ondas 0-1 |
| D2 | Gateway de pagamento | Nenhum agora; cobrança fora do sistema, atrás de `BillingProvider` | `ManualBillingProvider` em 900-43; Onda 8 sob demanda |
| D3 | Onboarding | Provisionamento pela Trifold via `/platform`; sem signup público | 900-21, 900-22 |
| D4 | Usuário × org | 1 usuário = 1 empresa; Trifold acessa via `platform_admin` | Fecha Q9/P10; 900-16 |
| D5 | Suspensão por inadimplência | **Manual**, nunca automática | 900-46: cron alerta, não suspende |
| D6 | Ambiente de teste | Supabase descartável **autorizado** (ainda não existe) | PRE-1; 900-3 |
| D7 | Planos | **3 tiers acumulativos**, exatamente a composição sugerida em §11.3 Q8 | 900-27a (composição) + 900-27b (preço) — ver §3.1 |
| D8 | Módulos core | `dashboard`, `chamados`, `configuracoes` sempre inclusos, nunca bloqueáveis | `sellable_modules.is_core = true`; fecha Q7 |
| D9 | Unidade de **venda** da IA | **Atendimentos/mês** | Sobrescreve ADR-007 §2 na dimensão comercial; ver §4 |
| D10 | WhatsApp | Cliente traz o próprio número/WABA; sem revenda | Fecha Q11; reduz Onda 7 |

Decisões adicionais tomadas em **2026-07-30** (ex-PEND-2, 7, 5 e 3):

| # | Tema | Decisão | Consequência no epic |
|---|---|---|---|
| D11 | Medição de IA por baixo da venda | **Sim** — vender em atendimento **e** persistir custo real por chamada, internamente | Desbloqueia 900-33, 900-34, 900-35, 900-37; ver §4 |
| D12 | Política no 100% da cota | **`overage`** para `active` (a Nicole nunca para; excedente vai para a fatura); `hard_stop` só em trial; **hard cap de 3×** a cota como proteção contra loop de bug | Desbloqueia 900-38; fecha Q2/Q2 do ADR-007 §4 |
| D13 | Retenção pós-cancelamento | **90 dias de janela de export, depois exclusão definitiva** | Desbloqueia 900-46; exige exclusão real **incluindo Storage** e cláusula de contrato |
| D14 | Impersonation | **NÃO haverá impersonation.** Suporte opera só com metadados e agregados | **Remove a story 900-45**; invalida parcialmente o ADR-004; eleva `900-42b` e PEND-4 (ver §3.2) |

### 3.0-bis ⚠️ REVISÃO DE MODELO — 2026-08-24: D2 e D3 REVOGADAS

**O dono do produto mudou o go-to-market.** As decisões D2 (sem gateway) e D3 (sem signup
público) estavam marcadas como lei e "não reabrir" — foram reabertas e revogadas nesta data.
Registrar isso explicitamente importa: o resto do epic foi escrito assumindo as duas, e quem
ler as ondas sem passar por aqui vai planejar contra um modelo que não existe mais.

| # | Decisão nova | Revoga |
|---|---|---|
| **D15** | **Signup público self-service.** Landing onde o interessado se cadastra, cria a própria organização e escolhe os módulos que quer contratar. | **D3** ("provisionamento 100% pela Trifold, sem signup público") |
| **D16** | **Trial de 3 dias com cartão vinculado no cadastro.** Passado o prazo sem cancelamento, a cobrança acontece automaticamente. | **D2** ("nenhum gateway agora; cobrança fora do sistema") |

**Razão de negócio:** colher lead, dar experiência real do produto e chegar à venda já
madura — PLG em vez de venda assistida.

#### O que isso reordena

1. **Entitlements deixam de ser Onda 3 e viram pré-requisito.** Se o cliente escolhe módulos
   no cadastro, o sistema precisa ligar e desligar módulo por contrato antes de existir
   cadastro. `plans`, `plan_modules` e `org_module_grants` passam a ser caminho crítico.
2. **Gateway sai da Onda 8 e vira P0.** Cartão tokenizado, assinatura recorrente, webhook de
   cobrança e tratamento de falha de pagamento passam a ser fundação, não "sob demanda".
3. **`provision_org()` ganha um segundo chamador.** Hoje só o painel a chama, com
   service-role e autorização na rota. Com signup público, ela passa a ser acionada por
   requisição anônima — e aí a validação de entrada e o anti-abuso (rate limit, verificação
   de e-mail, captcha) deixam de ser opcionais.

#### ⚠️ O risco que muda de natureza — e a decisão tomada sobre ele

O epic afirma que *"vender antes do fim da Onda 1 é o único erro irrecuperável"*. No modelo
antigo isso era administrável, porque **a Trifold escolhia quando o primeiro cliente entrava**.
Com signup público, não escolhe: qualquer pessoa cria organização a qualquer momento.

Estado do isolamento em 2026-08-24: **83 violações** no baseline do gate, **178 rotas** ainda
em service-role sem escopo forçado, **3 buckets públicos** (`nicole-media`, `obra-fotos`,
`campaign-assets`).

**Decisão do dono do produto (2026-08-24): fechar o isolamento ANTES de abrir a landing.**
A ordem de trabalho passa a ser:

    Onda 1 (isolamento) → entitlements → billing/gateway → landing + signup

Construir a landing antes disso a deixaria pronta antes de haver o que vender **e** antes de
ser seguro receber quem se cadastrar.

#### Aberto

- **Gateway não escolhido.** Comparação em `docs/research/gateways-pagamento-plg.md`.
- **Preço dos tiers** (PEND-1) sobe de prioridade: no modelo antigo dava para vender com preço
  combinado fora do sistema; com autoatendimento, o preço precisa estar na tela.
- **Compliance de cobrança automática pós-trial**: aviso claro, cancelamento acessível e
  direito de arrependimento (CDC art. 49) passam a ser requisito da landing, não detalhe.

---

### 3.1 Composição dos 3 tiers (D7 — literal da §11.3 Q8)

| Tier | `tier_order` | Módulos |
|---|---|---|
| **CRM** | 10 | `dashboard`, `pipeline`, `leads`, `imoveis`, `conversas`, `agenda`, `alertas`, `atividades`, `corretores`, `chamados`, `configuracoes` |
| **CRM + Marketing** | 20 | tudo do 10 **+** `campanhas`, `analytics`, `roleta`, `bolsao`, `mensagens`, `materiais`, `treinamento` |
| **Completo** | 30 | tudo do 20 **+** `obras`, `lancamentos`, `brindes`, `chat`, `imob`, `fluxo`, `pastas`, `sistema` |

Acumulativo: o tier 20 contém o 10, o 30 contém o 20. `dashboard`, `chamados` e `configuracoes` são `is_core` — aparecem no tier 10 e nunca são removíveis por downgrade nem por `org_module_grants.granted = false`.

**Preço de cada tier: NÃO DEFINIDO.** → PEND-1. `plans.monthly_price_cents` não pode ser semeado com número inventado (Constitution, Artigo IV).

### 3.2 Suporte sem impersonation — o que D14 muda no desenho

D14 não é "apagar uma story". Muda quem carrega o peso do suporte.

**O que cai:**

- A story `900-45` inteira: `createImpersonationClient`, o overlay em `getServerUser()`, o banner vermelho com cronômetro, `platform_impersonation_sessions`, o e-mail de notificação ao admin do cliente, os 7 controles do ADR-004.
- O FR-29 e o risco R9 ("impersonation vira backdoor") — deixam de existir, não são mitigados.
- `packages/web/src/lib/auth.ts` **sai da lista de arquivos de risco concentrado** (R3): sem overlay, `getServerUser()` não é tocada por este epic. O risco R3 passa de três arquivos para **dois**.
- A tabela `platform_impersonation_sessions` sai do modelo de dados (§2.7 da arquitetura).

**O que fica mais importante, e é o ponto que exige atenção:**

`PLATFORM_READABLE_TABLES` deixa de ser um complemento ("o que o super-admin vê **fora** da impersonation") e passa a ser o **único** mecanismo pelo qual a Trifold enxerga qualquer coisa de um cliente. Consequências diretas:

1. **A definição da lista (story `900-42b`) sobe de importância.** Ela não é mais só a fronteira de privacidade — é a totalidade da capacidade de suporte. Uma lista curta demais inviabiliza atender o cliente; uma lista larga demais é vazamento de PII de terceiro sem trilha de justificativa (que era o que a impersonation dava).
2. **PEND-4 muda de natureza e fica mais consequente** — reescrita nesses termos na §14.
3. **Trade-off aceito pelo dono do produto, explicitamente:** diagnosticar problema específico de uma org fica **mais lento por desenho**. Sem impersonation, o caminho é: metadados do `/platform` → pedir informação ao cliente → se insuficiente, pedido de acesso pontual (modelo a definir em PEND-4). O ganho é que não existe backdoor para auditar, porque não existe backdoor.
4. **`createOrgScopedAdminClient` (900-14) continua obrigatório.** Ele foi projetado como o wrapper reaproveitado pela impersonation, mas sua razão principal sempre foi outra: o piso de isolamento das 166 rotas em service-role (R1). D14 não o afeta.

**ADR-004 precisa de revisão pelo @architect — está parcialmente REJEITADO, não superseded.** A distinção não é preciosismo: o ADR nunca saiu de `Proposed` ("não implementar sem sign-off"), e um ADR não aceito não pode ser superseded. Isso muda o que o @architect faz — superseder um ADR aceito exigiria um ADR novo; um `Proposed` parcialmente rejeitado se resolve mudando o status e recortando a metade viva. O documento cobre dois assuntos e só o primeiro sobrevive:

| Parte do ADR-004 | Estado após D14 |
|---|---|
| Camada `platform_admin` (tabela `platform_admins`, níveis `owner`/`operator`/`support`, `requirePlatformAdmin`, auditoria append-only, `withPlatformAdmin` como decorador) | **válida** — implementada em `900-16` e `900-42a` |
| Impersonation (os 7 controles, `createImpersonationClient`, overlay em `getServerUser`, notificação ao cliente, `platform_impersonation_sessions`) | **rejeitada por decisão de produto** |
| Análise das alternativas de mecanismo (sessão do usuário-alvo, GUC em conexão pooled, service-role com filtro forçado) | **histórica** — continua útil como registro, não como plano |

Reescrever o ADR é do @architect, não deste epic. O que este epic registra é: **não implementar a segunda metade, e não tratar o ADR-004 como aprovado na íntegra.**

---

## 4. Venda × medição de IA — DECIDIDO (D11)

**D9 vale: a cota é vendida em atendimentos/mês.** A UI, o contrato e a cota operam nessa unidade.

E **D11, aprovada em 2026-07-30: mede-se custo real por baixo.** As duas dimensões coexistem, desacopladas.

O risco que motivou isso é real e medido: a variância de custo por atendimento chega a **~20×** (conversa longa com histórico grande vs. "oi") — ADR-007 §2 e `saas-multi-tenant.md` §5.3. Vendendo só em atendimento, a margem por cliente seria imprevisível, e **um cliente deficitário só apareceria na fatura consolidada da Anthropic — sem saber qual cliente é**.

### 4.1 A decisão (D11)

Desacoplar a unidade de **venda** da unidade de **medição**:

- **Venda / cota / alertas / UI / contrato:** atendimentos/mês (D9, mantida integralmente e sem tradução para o cliente).
- **Medição interna:** custo real por chamada persistido em `ai_usage_events.cost_micro_usd`, somado em `org_billing_periods.cost_micro_usd`. **Nunca exibido ao cliente.**

O trade-off que justificou a decisão:
> **Com** o registro de custo, a margem por org é observável desde a Onda 4 e o preço pode ser corrigido com dado antes da renovação. **Sem** ele, a cota funcionaria igual, mas a Trifold só descobriria um cliente deficitário na fatura consolidada da Anthropic.

Custo de implementar: **zero incremental** — e foi o que fechou a decisão. O proxy sobre `createAnthropicClient()` (Onda 4, story 900-34) já lê `response.usage` para contar o atendimento; gravar `cost_micro_usd` na mesma linha é a mesma escrita. As tabelas já preveem as duas colunas (`saas-multi-tenant.md` §2.5).

**Consequência de aceite, não opcional:** `/platform/usage` (900-35) tem de mostrar **margem por org**, não só consumo. Sem essa tela, o custo é coletado e ninguém olha — e a decisão perde a razão de existir.

### 4.2 Como fica modelado

| Dimensão | Unidade | Onde vive | Quem vê |
|---|---|---|---|
| Cota vendida | atendimentos/mês | `plans.ai_quota_atendimentos` e `org_billing_periods.consumed_atendimentos` — **nomes próprios, não `*_credits` reinterpretado** (ver 900-33: no ADR-007 "crédito" significa custo real, e reaproveitar o identificador criaria ambiguidade em cima de uma linha de fatura) | Cliente (`/dashboard/configuracoes/plano`) e Trifold |
| Alertas 80% / 100% | atendimentos | `org_billing_periods.alert_80_at` / `alert_100_at` | Cliente + Trifold |
| Excedente faturado | atendimentos × preço da faixa | `tenant_invoice_lines.kind = 'ai_overage'` | Cliente |
| **Custo real** | micro-USD por chamada | `ai_usage_events.cost_micro_usd`, `org_billing_periods.cost_micro_usd` | **Só Trifold** (`/platform/usage`) |

Definição de "atendimento" contável é trabalho de story (900-37) e não pode ser inventada aqui: precisa de regra objetiva (conversa por lead com janela de N horas? Chamada de `nicole.chat`? Handoff conta?). É a única parte da Onda 5 que ainda depende de resposta do dono do produto, e é a unidade que o cliente vai auditar na fatura.

---

## 5. Requisitos Funcionais (FR) — todos rastreados

Artigo IV (No Invention): cada FR aponta para a seção de arquitetura, o achado de auditoria ou a decisão que o origina.

| ID | Requisito | Origem |
|---|---|---|
| FR-1 | Esteira de CI executando `type-check`, `lint`, `test` em PR e push para `main` | §8.1 (não existe CI) |
| FR-2 | Gate `pnpm gate:tenancy` com as regras **R1-R12** de §9, baseline versionado e catraca (contagem nunca sobe) | §8.2, ADR-002 item 2 |
| FR-3 | Testes cross-tenant data-driven pelo snapshot de schema, cobrindo leitura, escrita cega, DELETE alheio, INSERT com `org_id` forjado e RPCs com `org_id` de outra org | §8.3, ADR-002 item 3 |
| FR-4 | Toda tabela com `org_id` tem policy org-scoped para SELECT/INSERT/UPDATE/DELETE, com `WITH CHECK` onde há escrita — ou entrada justificada na allowlist service-role-only | Auditoria P8; §8.2 R2 |
| FR-5 | `privacy_consents` ganha `org_id` (backfill via `users.org_id`) e policy ancorada | Auditoria P5 (Lote 1) |
| FR-6 | `properties_slug_key` → `UNIQUE (org_id, slug)`; `idx_leads_supremo_id` → `UNIQUE (org_id, supremo_id)` | Auditoria P9 (Lote 1) |
| FR-7 | 16 índices `CREATE INDEX CONCURRENTLY` iniciando em `org_id` | Auditoria P11 (Lote 1) |
| FR-8 | Storage: policies ancoradas em org, buckets com PII privados + URL assinada, convenção de path `{org_id}/…` | Auditoria P7 (Lote 2) |
| FR-9 | `createOrgScopedAdminClient(orgId)` + regra ESLint `aios/no-unscoped-admin-client` + allowlist revisável | Auditoria P8; §8.4; ADR-002 item 4 |
| FR-10 | Papel `platform_admin` real (`platform_admins.level ∈ {owner, operator, support}`), e as 5 tabelas de custo interno do Epic 78 re-ancoradas nele | Auditoria P4; ADR-004 |
| FR-11 | Fim de todo UUID de org hardcoded (14 arquivos) via `kanban_stages.semantic_key` + `properties.semantic_key`, com dual-run antes do cutover | §7.1, §7.2, §7.3 |
| FR-12 | `provision_org()` idempotente por slug, em uma transação, semeando roles, `role_permissions`, stages, configs, assinatura e integrações | §7.4 |
| FR-13 | Painel `/platform` como segmento top-level, com chrome visualmente distinto e `requirePlatformAdmin()` no layout | §6.1, §6.2 |
| FR-14 | 37 crons iteram orgs via `forEachActiveOrg` / `forEachEntitledOrg`, isolando erro por org | §4.6 |
| FR-15 | Webhooks resolvem a org pelo identificador do payload (`phone_number_id`, `page_id`) e respondem 200+log quando não encontram | §7.5 |
| FR-16 | Entitlement derivado (sem tabela materializada) via `org_entitled_modules()` + `org_entitlement_snapshot()` | ADR-003; §2.4 |
| FR-17 | `acessoEfetivo = assinaturaViva ∧ orgEntitled ∧ rbacPermite`, interseccionado como passo 5 dentro de `getUserPermissions()` | §3.2 |
| FR-18 | `resolveAccess()` distingue `no_permission` (403) de `not_entitled` (upsell) de `subscription_suspended` | §3.3 |
| FR-19 | Downgrade nunca destrói dado: `ModuleLockedScreen` + cadeado na sidebar quando `min_tier_order > planTierOrder` + CTA que abre `chamado` de `upgrade_request` | P3; §4.4 |
| FR-20 | Medição de IA na fábrica do client (`createAnthropicClient(ctx)` / `createOpenAIClient(ctx)`), com sink injetado e falha aberta | ADR-007; §5.1, §5.2 |
| FR-21 | Três níveis de agregação: `ai_usage_events` (particionada) → `ai_usage_daily` → `org_billing_periods` (1 linha por org/ciclo, é o contador quente) | §2.5, §5.4 |
| FR-22 | Cota, alertas (80%/100%) e excedente operam em **atendimentos/mês** | D9 |
| FR-23 | Custo real por chamada persistido para observabilidade de **margem por org**, invisível ao cliente. `/platform/usage` exibe margem, não só consumo | **D11**; §4 |
| FR-24 | `checkAiQuota()` com vereditos `normal/warn/degrade/overage/blocked` e `pickModel(tier, verdict)` | §5.5 |
| FR-25 | Rollout `AI_QUOTA_ENFORCEMENT ∈ {off, shadow, on}` com reconciliação de ±5% contra `billing-collect-anthropic` por 14 dias como critério de saída do shadow | §5.7; ADR-007 §6 |
| FR-26 | `tenant_invoices` + `tenant_invoice_lines` + `buildInvoiceForPeriod()` puro + `ManualBillingProvider` atrás de `TenantBillingProvider` | ADR-006; §2.6 |
| FR-27 | `platform_audit_log` append-only (`REVOKE UPDATE, DELETE`), escrita só por função `SECURITY DEFINER`, auditoria por decorador `withPlatformAdmin` | §2.7, §6.2 |
| FR-28 | `/platform` só consulta a lista fechada `PLATFORM_READABLE_TABLES`, validada em runtime por `platformQuery()` (nasce em `900-22`, endurecida em `900-42a`, lista fechada em `900-42b`) e por teste que varre `app/api/platform/**` | §3.4 |
| ~~FR-29~~ | ~~Impersonation com os 7 controles do ADR-004~~ — **REMOVIDO por D14.** Não implementar. Suporte é só metadado (FR-28) | D14; §3.2 |
| FR-30 | Segredos de integração por tenant no Supabase Vault (`org_integrations.secret_ref`), nunca em `jsonb` legível nem em env por cliente | ADR-005; §2.8 |
| FR-31 | Cron `subscription-lifecycle` vence trial, marca `past_due` e alerta — **nunca suspende** | D5 |

---

## 6. Requisitos Não-Funcionais (NFR)

| ID | Requisito | Origem |
|---|---|---|
| NFR-1 | **Toda onda é deployável sozinha e reversível.** Expand → migrate → contract em tudo que toca dado existente. Sem produção paralela, sem big bang. | P2 |
| NFR-2 | **Trifold é apenas mais um tenant.** Nenhum `if (orgId === TRIFOLD)` no código. A Trifold recebe o plano `completo-interno` e passa pelos mesmos caminhos — é o melhor teste de regressão existente. | P1 |
| NFR-3 | **Entitlement falha aberta** (`fail-open`, assume tudo liberado) + alerta crítico. É o oposto do default-deny do RBAC e é proposital: default-deny aqui derruba a operação de todos os clientes de uma vez. | §9.4 item 1 |
| NFR-4 | **Medição de IA falha aberta.** O sink nunca relança. Métrica perdida é prejuízo pequeno; conversa perdida é prejuízo grande. | P5; ADR-007 §5 |
| NFR-5 | **RLS é a rede, não o piso.** O piso é o filtro explícito de org + lint. Ambos obrigatórios — 129 de 318 handlers bypassam RLS. | P7; §8.4 |
| NFR-6 | **Entitlement nunca destrói dado.** Downgrade bloqueia acesso; jamais apaga. Reativação é instantânea, sem migração. | P3; §4.4 |
| NFR-7 | **Cobrança é plugável.** Nenhuma regra de negócio (excedente, entitlement, suspensão) sabe se o pagamento é boleto manual ou gateway. | P4; ADR-006 |
| NFR-8 | Toda migration de policy traz o `DROP/CREATE` reverso documentado no próprio arquivo. | §10 Onda 1 |
| NFR-9 | Flush de telemetria em rota request-scoped usa `after()` do `next/server`; webhook e cron dão `await`. Promise solta com `void` morre quando a Vercel encerra a função (incidente da Story 75-139). | §5.2 |
| NFR-10 | Toda env var deste epic é gravada por `scripts/vercel-env-set.sh` / REST API. **Nunca** `vercel env add` via stdin — grava valor vazio em silêncio (2 incidentes: Story 75-40 e 75-66). Valor não reconhecido em `AI_QUOTA_ENFORCEMENT` é tratado como `off` (fail-safe explícito). | §5.7; gotcha do projeto |
| NFR-11 | Cache: entitlement 300s (tag `entitlements-${orgId}`), stages 300s, cota 30s (tag `quota-${orgId}`). Invalidação explícita obrigatória em toda mutação de `/platform`. | §4.2 |
| NFR-12 | Webhook nunca responde 4xx/5xx para a Meta (ela desabilita o webhook após falhas repetidas). Persistir evento bruto antes de processar; idempotência por identificador externo. | §7.5 |
| NFR-13 | `platform_audit_log` é imutável. Quem consegue apagar a auditoria não está auditado. | §2.7 |
| NFR-14 | Migrations deste epic começam em **238**. Índices `CONCURRENTLY` e `REFRESH CONCURRENTLY` vão em arquivo `_remote_only.sql` (não transacional). | §0.2; convenção do projeto |

---

## 7. Constraints (CON)

| ID | Constraint |
|---|---|
| CON-1 | **Não existe staging.** O Supabase de dev aponta para produção. Nenhuma troca pode ser atômica: a fase dual-run (`both`) é o que substitui o staging que não existe. O Supabase descartável (D6/PRE-1) serve **só** aos testes cross-tenant, que criam e apagam orgs. |
| CON-2 | **Não existe CI nem husky.** `.github/` contém apenas `agents/`. Criar a esteira é story, não configuração. |
| CON-3 | **A operação da Trifold roda em produção durante todo o epic.** Nicole atendendo leads reais. Nenhuma story pode exigir janela de indisponibilidade. |
| CON-4 | **129 de 318 route handlers usam service-role.** O gate de RLS **não** cobre essa superfície. Vender o gate como "isolamento garantido" seria falso (ressalva explícita da auditoria). |
| CON-5 | `security_invoker` **não se aplica a MATERIALIZED VIEW** (`relkind='m'`): `ALTER VIEW` levanta ERRCODE 42809, e o conteúdo é materializado no REFRESH sob role `postgres` (`rolbypassrls = true`), então RLS de tabela-base nunca filtra. Controle correto para matview é **grant**. |
| CON-6 | O Supabase tem `ALTER DEFAULT PRIVILEGES … TO anon, authenticated`: **todo objeto novo nasce com grant**. Revogar só de `anon` não fecha o furo quando o grant está no pseudo-role `PUBLIC` (`=X/postgres` em `proacl`). |
| CON-7 | Duas migrations que fazem `CREATE OR REPLACE FUNCTION` da mesma função **não conflitam no git** e o último aplicado ganha em silêncio. Ocorreu neste ciclo: `195_sdr_na_roleta.sql` (Story 75-226) e `209_hotfix_rls_org_scope.sql` ambos redefinem `roleta_pick_and_advance`. |
| CON-8 | `ANTHROPIC_API_KEY` e `OPENAI_API_KEY` são **sempre da Trifold** — é a premissa do modelo de cota. Nunca por tenant. |
| CON-9 | `packages/ai` não pode depender de `packages/web` nem do Supabase. A persistência de medição entra por sink injetado. |
| CON-10 | LGPD: a Trifold passa a ser **operadora** de dado de terceiro (o lead do cliente não tem relação contratual com a Trifold). Contrato de operador é pré-requisito **jurídico** da venda, fora do escopo técnico deste epic, mas bloqueia o faturamento do primeiro cliente. |
| CON-11 | Metodologia AIOS obrigatória: `@sm *draft → @po *validate → @dev *develop → @qa *qa-gate → @devops *push`. Sem push direto. |

---

## 8. Riscos & Mitigação

Herdados de `saas-multi-tenant.md` §11.1, com os três que o dono do produto precisa ver em destaque.

### 8.1 Os três riscos que definem este epic

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| **R1** | **Vazamento cross-tenant por rota service-role.** 129 dos 318 handlers usam `createAdminClient()` e ignoram RLS. **O gate de CI não cobre essa superfície** — o banco fica correto e a aplicação continua podendo vazar. | **alta** | **crítico** | Stories 900-14 e 900-15: `createOrgScopedAdminClient` + ESLint rule, migração priorizada pelas rotas que tocam PII. É o risco nº 1 do projeto e a razão de o gate ter par de lint, não só SQL. |
| **R2** | **Ausência de CI e de staging.** Nada verifica nada automaticamente hoje; o Supabase de dev aponta para prod. Sem staging, os testes cross-tenant (que criam e apagam orgs) não têm onde rodar. | **alta** | alto | Onda 0 cria a esteira do zero (900-1, 900-2). PRE-1 (Supabase descartável) desbloqueia 900-3/900-17. Enquanto não existir, o job de isolamento fica `continue-on-error` — proteção bem mais fraca, registrada como risco aceito. |
| **R3** | **Dois arquivos concentram o risco de regressão.** `lib/permissions.ts` (15 linhas que decidem se **todo mundo** vê **qualquer coisa**) e `packages/ai/src/client/anthropic.ts` (se o proxy lançar, a Nicole para). `lib/auth.ts` / `getServerUser()` **saiu desta lista por D14**: sem overlay de impersonation, este epic não toca a função por onde passam 100% das requests autenticadas — é o único benefício técnico de não ter impersonation. | média | **crítico** | QA gate reforçado nas stories 900-28 e 900-34. Teste unitário obrigatório do **caminho de falha**, não só do caminho felizardo: `fail-open` em entitlement, `try/catch` total no proxy de IA. |

### 8.2 Demais riscos

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| R4 | Policy nova mais restritiva quebra tela da Trifold em produção | média | alto | Lotes pequenos por domínio (900-8/9/10), QA gate por lote, migration inversa documentada (NFR-8), Trifold como detector rápido |
| R5 | Entitlement mal resolvido tranca clientes fora do sistema | média | alto | `fail-open` + kill switch `ENTITLEMENTS_ENFORCEMENT=off` + alerta crítico (NFR-3) |
| R6 | Medição de IA quebra a Nicole em produção | média | **crítico** | `ctx` opcional, proxy com `try/catch`, shadow mode, reconciliação de ±5% (900-36) |
| R7 | **Margem negativa invisível** por vender atendimento e não medir custo | **média** | **médio-alto** | **Mitigado por D11:** custo real por chamada em `ai_usage_events` + margem por org em `/platform/usage` (900-35). O risco residual passa a ser não *olhar* a tela — por isso a margem é AC de 900-35, não item de backlog |
| R8 | Corte de cota mata conversa de lead de cliente pagante | **baixa** | alto | **Mitigado por D12:** `overage` para `active` — a Nicole nunca para por cota; `hard_stop` só em trial; hard cap de 3× protege a Trifold contra loop de bug |
| ~~R9~~ | ~~Impersonation vira backdoor~~ — **ELIMINADO por D14**, não mitigado: não existe o mecanismo. Em troca nasce R16 | — | — | — |
| **R16** | **Suporte cego.** Sem impersonation, `PLATFORM_READABLE_TABLES` é o único acesso da Trifold a dado de cliente. Lista curta demais ⇒ suporte não consegue diagnosticar e o cliente fica sem resposta; lista larga demais ⇒ PII de terceiro exposta **sem** a trilha de justificativa que a impersonation dava | **média** | **alto** (elevado de médio a pedido do @po: o pior caso é da mesma classe do R14/LGPD, que já era alto) | 900-42b desenha a lista com PEND-4 respondida; diagnóstico mais lento é trade-off aceito explicitamente (§3.2); se um caso real de suporte exigir PII, modelar como pedido de acesso pontual com aprovação do cliente — nunca alargar a lista em silêncio |
| R10 | Webhook roteado para a org errada (WhatsApp/Meta) | média | **crítico** | Índices UNIQUE em `phone_number_id`/`page_id`, dual-run, rejeitar-e-logar em vez de adivinhar (900-48) |
| R11 | Onda 1 vira poço sem fundo (218 policies) e o projeto perde momento | **alta** | médio | Baseline com catraca permite trabalho paralelo; lotes por domínio com progresso mensurável em cada PR; Onda 2 pode começar em paralelo aos domínios já fechados |
| R12 | Deriva entre `getHardcodedPermissions()` (TS) e o seed de provisionamento (SQL) | média | médio | `role_default_permissions` como fonte única + teste de paridade (900-21) |
| R13 | Storage: mudar bucket para privado quebra URLs já distribuídas a clientes | **alta** | alto | 900-12 exige varredura das referências gravadas no banco antes do flip; URL assinada com fallback e período de sobreposição |
| R14 | LGPD: Trifold como operadora sem contrato de operador | média | alto | Jurídico, fora do escopo técnico (CON-10), mas bloqueia a venda |
| R15 | Colisão silenciosa de `CREATE OR REPLACE FUNCTION` entre migrations | média | alto | Asserção **R10** do gate (900-2). Quase reverteu a Story 75-226 neste ciclo |

---

## 9. O gate de CI — asserções consolidadas

Story 900-2 implementa `scripts/gate-tenancy.ts` (`pnpm gate:tenancy`). Fonte da verdade do schema: introspecção via Supabase Management API (`SUPABASE_MANAGEMENT_PAT`, padrão já usado no projeto), com fallback para snapshot versionado. **Não parsear os 222 arquivos de migration** — o schema efetivo é o que importa.

### 9.1 Correção de fato: o gerador de snapshot não existe

A §8.2 da arquitetura afirma que o fallback usa *"um snapshot versionado `docs/audits/schema-snapshot.json` regenerado por `scripts/sync-schema.sh` (já existe)"*. **A afirmação é falsa e foi verificada no repo:** `scripts/sync-schema.sh` só executa `supabase db push` contra staging/prod (`--env staging|prod|both`) e **não tem nenhuma lógica de introspecção**. Não existe hoje nada que gere `schema-snapshot.json`.

**Resolução adotada:** `900-2` cria um gerador novo, `scripts/generate-schema-snapshot.ts`. Não é correção do script existente — são coisas diferentes.

**O que NÃO muda, para evitar correção excessiva:** `scripts/sync-schema.sh` **é** corretamente reaproveitável em `900-3`, para aplicar as 222 migrations num projeto Supabase novo. A imprecisão da arquitetura é só sobre a alegação de snapshot; o script serve bem ao propósito para o qual foi escrito.

> **Pendência para o @architect:** corrigir a §8.2 quando revisar o documento. Some-se ao ADR-004, que já está pendente de revisão pela rejeição da impersonation (§3.2). **Não reescrevi a arquitetura** — este epic só registra a divergência e a resolução.

### 9.2 O que o gate alcança — e o que ele não alcança por construção

A auditoria produziu 13 achados. **O gate cobre 6.** Isso não é lacuna de implementação: as regras R1-R9 avaliam RLS, grants, `SECURITY DEFINER` e views, e sete dos achados são de categorias que essas regras nunca pretenderam cobrir. Escrever AC que prometa 13 seria fabricar cobertura.

| Achado | Coberto? | Por quê |
|---|---|---|
| **P1** RPCs `SECURITY DEFINER` com `p_org_id` confiado | ✅ R6, R8 | grant a `PUBLIC` + validação de org |
| **P2** views/matview sem `security_invoker` | ✅ R5 | com o teste de `relkind` |
| **P3** policy permissiva `USING(true)` | ✅ R4 | |
| **P6** policy sem escopo de org em tabela com `org_id` | ✅ R2 | |
| **P8** tabela com `org_id` e zero policies | ✅ R2 + allowlist | |
| **P13** `SECURITY DEFINER` sem `SET search_path` | ✅ R7 | |
| **P5** `privacy_consents` sem `org_id` | 🟡 **só a partir de `900-4`** | R1-R3 avaliam apenas tabelas que **já têm** `org_id`. Enquanto a coluna não existir, o gate é cego para esta tabela **por construção** — não por falha. Depois que `900-4` a adicionar, ela entra no alcance de R1 e R2 e passa a ser protegida contra regressão |
| **P4** tabelas de custo do Epic 78 | ❌ | são tabelas de **plataforma**, legitimamente sem `org_id` — vão para a allowlist. O controle é `900-16`, não o gate |
| **P7** Storage sem escopo de org | ❌ | o gate lê `pg_policies` de `public`; policies de `storage.objects` e buckets públicos estão fora do alcance. Controle: `900-11`/`900-12`/`900-13` |
| **P9** UNIQUEs globais que colidem | ❌ | é forma de constraint, não isolamento. Controle: `900-5` |
| **P10** `users.auth_id UNIQUE` | ❌ | decisão de produto (D4), não defeito |
| **P11** 16 índices faltando | ❌ | performance, não isolamento. Controle: `900-6` |
| **P12** `whatsapp_pricing` global | ❌ | dado global aceito; decisão registrada em `900-16` |

**Consequência para a ressalva de cobertura**, que já era obrigatória e agora tem número: o relatório do gate diz que ele valida o **banco** e não o código — e deve dizer também que cobre **6 dos 13 achados**, com os outros 7 endereçados por stories específicas. Um gate verde não significa auditoria fechada.

| Regra | Asserção | Severidade | Origem |
|---|---|---|---|
| **R1** | Toda tabela de `public` com coluna `org_id` tem `rowsecurity = true` | FAIL | §8.2. Já garantido pelo event trigger `ensure_rls` — a asserção é a rede |
| **R2** | Para cada tabela com `org_id`, existe policy org-scoped para **cada** comando (SELECT/INSERT/UPDATE/DELETE), com `WITH CHECK` onde há escrita — **ou** entrada na allowlist `service-role-only` com `reason:` | FAIL | §8.2; auditoria P8 |
| **R3** | Toda tabela nova de `public` tem `org_id NOT NULL`, salvo allowlist com `reason:` preenchido. **FAIL absoluto desde o dia 1, sem baseline** — é a regra que impede dívida nova | FAIL | §8.2 |
| **R4** | Nenhuma policy permissiva `USING(true)` para `public`/`authenticated` em tabela com `org_id`. Policies permissivas combinam com `OR`: uma `USING(true)` anula todas as outras | FAIL | Auditoria P3 |
| **R5** | **Checar `pg_class.relkind` ANTES de prescrever `security_invoker`.** `relkind='v'` → exigir `security_invoker = on`. `relkind='m'` (matview) → `security_invoker` é **inaplicável** (ERRCODE 42809; conteúdo materializado sob `postgres`, `rolbypassrls`); a asserção correta é **ausência de grant** a `anon` **e** `authenticated` | FAIL | Auditoria P2, lição do @qa |
| **R6** | **Auditoria de grant contra o pseudo-role `PUBLIC`**: ler `proacl` (funções) e `relacl` (tabelas/views) procurando entrada de `PUBLIC` (`=X/postgres`, `=r/postgres`), não só `anon`/`authenticated`. O Supabase tem `ALTER DEFAULT PRIVILEGES … TO anon, authenticated`, então **todo objeto novo nasce com grant** — e revoke prescrito só de `anon` não fecha o furo | FAIL | Auditoria P1, lição do @dev |
| **R7** | `SECURITY DEFINER` **sem** `SET search_path` (`pg_proc.prosecdef = true` e `proconfig` sem `search_path`). Vetor de hijack: a função pode ser induzida a resolver um nome para objeto plantado, executando com privilégio do owner | FAIL | Auditoria **P13** (achado do @dev) |
| **R8** | Função `SECURITY DEFINER` que recebe `p_org_id` valida contra `user_org_id()` / `assert_org_scope()`, ou está na allowlist de service-role | WARN → FAIL na Onda 2 | §8.2 R4; auditoria P1 |
| **R9** | **Colisão de `CREATE OR REPLACE FUNCTION`**: se o PR adiciona migration que redefine uma função também redefinida por outra migration ainda não aplicada em produção, FALHA e exige reconhecimento explícito. Duas redefinições **não conflitam no git** e o último aplicado ganha em silêncio. Evidência real: `195_sdr_na_roleta.sql` (Story 75-226) e `209_hotfix_rls_org_scope.sql` ambos redefinem `roleta_pick_and_advance` | FAIL | CON-7 |
| **R10** | `sellable_modules.key` ⊇ `ALL_MODULES` de `permissions-modules.ts` (drift do catálogo comercial) | FAIL, a partir da Onda 3 | §8.2 R6 |
| **R11** | Nenhum arquivo em `packages/web/src/app/api/**` chama `createAnthropicClient()` / `createOpenAIClient()` sem `AiUsageContext` | FAIL, a partir da Onda 4 | §8.2 R7; ADR-007 |
| **R12** | Nenhum arquivo em `app/api/platform/**` faz `.from("…")` com tabela fora de `PLATFORM_READABLE_TABLES`, nem `select('*')` em `users` | FAIL, a partir da Onda 6 | §3.4 |

**Baseline com catraca.** A auditoria aponta ~97 cláusulas `USING` sem `org_id`. Ligar o gate bloqueando no dia 1 travaria todo desenvolvimento. Então: `docs/audits/rls-gate-baseline.json` registra as violações conhecidas por regra; o gate falha se (a) a contagem total **aumentar**, (b) uma violação **nova** aparecer em tabela fora do baseline, ou (c) **qualquer** violação de R3. Cada correção da Onda 1 abaixa o baseline. Ele nunca sobe. **A Onda 1 termina quando o baseline chega a zero.**

**Ressalva obrigatória, escrita no próprio relatório do gate:** este gate valida o **banco**, não o código. Não vê query em service-role sem `.eq("org_id")` — a maior superfície de risco (R1/CON-4). O par indispensável é a regra de ESLint da story 900-14.

---

## 10. Decomposição em Stories

Escala de estimativa (a mesma de `saas-multi-tenant.md` §9.2): **P** = pequeno (<1 dia-agente) · **M** = médio (2-5) · **G** = grande (>5).

Legenda de bloqueio: 🔒 = bloqueada por decisão pendente (não draftar sem resolver).

**Regra de decomposição para o @sm (vale para toda story estimada G).** O epic define o *quê*; quebrar em unidades executáveis é do @sm. O critério não é subjetivo — é o próprio NFR-1 deste epic: **se uma story contém mais de uma fase de expand → migrate → contract, ela é mais de uma story.** Corolário operacional: **uma story que contém janela de observação (dual-run de 7 dias, reconciliação de 14 dias) não passa por QA gate como unidade** — a fase de observação vira story própria, senão fica `InProgress` por uma semana bloqueando o board.

Candidatas identificadas na validação do @po, a quebrar no draft (sufixo `a`/`b`/`c`, preservando a numeração):

| Story | Corte sugerido |
|---|---|
| 900-2 | **ADOTADO pelo @sm em 2026-08-03** → `900-2a` (motor + R1-R4 + snapshot + `known-tables`) · `900-2b` (R5-R9: grants, `relkind`, colisão) · `900-2c` (baseline + allowlist + wiring de CI) |
| 900-12 | preparação reversível (varredura de referências + leitor por URL assinada) / **flip dos buckets** (irreversível na prática, R13 alto) |
| 900-13 | expand (convenção + escritas novas) / migrate (mover objetos + reescrever referências) / contract (policy por path) |
| 900-20 | **dual-run de 7 dias** / cutover + contract |
| 900-44 | são 6 telas distintas — é um mini-épico, não uma story |
| 900-48 | dual-run de roteamento / cutover |

### 10.1 Provenance de artefato — quem cria, quem estende

**Esta tabela existe por causa de um defeito real, encontrado em duas rodadas de validação do @po.** As linhas `Dep:` de cada story estavam corretas — grafo sem órfãs, todas as arestas para trás — e ainda assim quatro artefatos eram consumidos por ondas **anteriores** àquela que os criava. Um deles fechava ciclo. Grafo declarado e grafo de artefatos são coisas diferentes, e só o primeiro é visível nas linhas `Dep:`.

**O padrão é estrutural, e é do artefato — não do epic.** Todas as arestas invertidas caíram sobre artefatos **incrementais**, nunca sobre atômicos:

| Classe | Exemplos | Deu problema? |
|---|---|---|
| **Atômico** — nasce completo numa story | `sellable_modules`, `ai_usage_events`, `platform_admins`, `tenant_invoices`, `role_default_permissions` | **Nunca.** O grafo `Dep:` já cobre esse caso |
| **Incremental** — definição fatiada entre ondas | `platform_audit_log` (criada/endurecida), `org_billing_periods` (criada + 2 colunas em 2 ondas), `PLATFORM_READABLE_TABLES` (criada + estendida 3× + consolidada + fechada) | **Todas as arestas invertidas** |

A razão é que este epic **exige** expand → migrate → contract (NFR-1). Fatiar a definição de um artefato entre ondas não é desleixo — é o que a metodologia manda. Só que **`Dep:` ordena *stories*, e a fatia de um artefato atravessa stories sem aparecer no grafo delas.** É ponto cego previsível de qualquer epic que leve o NFR-1 a sério, e a contramedida é a coluna **"estendido por"**: ela torna visível o que `Dep:` não mostra.

> **Para quem escrever o próximo epic:** valide provenance de artefato, não só `Dep:`. Para cada tabela, função ou constante citada numa AC, pergunte **onde nasce** e **quem a modifica depois**. Se a resposta for "várias stories", ela é incremental e precisa de linha nesta tabela.

**Princípio aplicado em todos os casos abaixo, e vale citar:** *o artefato nasce onde é primeiro usado, e é refinado depois.* Foi assim que `platform_audit_log` foi de `900-42a` para `900-16`, `org_billing_periods` de `900-33` para `900-26`, e `platformQuery()` de `900-42a` para `900-22`. Atributo de segurança (append-only, `NOT NULL`, escopo de org) é **atributo de nascimento**, nunca refino posterior.

> **Nota de leitura:** os IDs `900-2a`/`900-2b`/`900-2c` referem-se às sub-stories já draftadas pelo @sm em `docs/stories/` (a quebra sugerida no §10 foi adotada em 2026-08-03). Elas **não** têm cabeçalho próprio neste epic, que mantém `900-2` como unidade de planejamento — não são referências órfãs.

| Artefato | Criado em | **Estendido por** | 1ª menção | Nota |
|---|---|---|---|---|
| `.github/workflows/ci.yml` | `900-1` | `900-2c` (job `tenancy-gate`), `900-17` (job `isolation`), `900-18` (torna o gate bloqueante) | `900-1` | Incremental: cada onda pendura um job. Nunca reescrever o workflow — **acrescentar job** |
| `scripts/generate-schema-snapshot.ts` | `900-2a` | `900-17` (os testes cross-tenant são data-driven pelo snapshot) | `900-2a` | Criado do zero — **não** existe hoje, ver §9.1 |
| `scripts/gate-tenancy.ts` | `900-2a` (motor + R1-R4) | `900-2b` (R5-R9), `900-2c` (baseline, allowlist, saída de PR), `900-26` (liga R10), `900-34` (liga R11), `900-42a` (liga R12) | `900-2a` | **O artefato mais estendido do epic depois da `PLATFORM_READABLE_TABLES`.** Três regras são ligadas por ondas futuras |
| `docs/audits/tenancy-known-tables.json` | `900-2a` | **nenhuma — o arquivo NUNCA cresce** | `900-2a` | Ver o invariante abaixo. É a linha mais importante desta tabela |
| `docs/audits/tenancy-allowlist.yml` | `900-2c` | `900-10` (16 tabelas service-role-only), `900-26` (tabelas de plataforma sem `org_id`), `900-18` (congela o conteúdo na saída da Onda 1) | `900-2` | Cresce **só** com `reason:` preenchido e diff revisável |
| `rls-gate-baseline.json` | `900-2c` | `900-8`, `900-9`, `900-10` (cada lote abaixa a contagem), `900-18` (zera e torna bloqueante) | `900-2a` | Incremental por desenho — é a catraca |
| `createOrgScopedAdminClient()` | `900-14` | `900-15` (migra as rotas; ESLint `warn` → `error`) | `900-14` | |
| `platform_admins` | `900-16` | — | `900-16` | Atômico |
| `platform_audit_log` + `platform_audit()` | `900-16` | — | `900-16` | **Movido de `900-42a` para cá (B1).** Nasce append-only na mesma migration: imutabilidade é atributo de nascimento |
| `kanban_stages.semantic_key`, `properties.semantic_key` | `900-19` | `900-20` (resolver, dual-run, cutover, contract) | `900-19` | expand aqui, migrate/contract lá |
| `role_default_permissions` | `900-21` | — | `900-21` | Atômico |
| `org_integrations` | `900-21` (esqueleto) → **entregue de fato na `900-21b`, ver nota de rastreabilidade abaixo** | `900-47` (`secret_ref`/Vault, `resolveIntegration`) | `900-21`, `900-21b` | **Movido de `900-47` (B2)** — a Onda 7 é sob demanda e pode nunca acontecer |
| `org_integrations` — nota de rastreabilidade | esqueleto entregue em **`900-21b`** (migration `246`): tabela + `org_id` + `provider` (`CHECK IN` de **6** valores, com `meta_ads` e `meta_capi` **separados**) + `status` + `config jsonb` + `UNIQUE (org_id, provider)` + RLS + seed/backfill via `provision_org()` | `900-47` mantém `secret_ref`/Vault, `resolveIntegration`, view `org_integrations_public`, `platform_shared` | `900-21b` (@po, 2026-08-29) | **Divergência registrada, não silenciosa — duas.** (1) O **índice UNIQUE parcial de roteamento reverso de `meta_ads`** (`config->>'page_id'`) sai na `900-21b`, **não** na `900-47` como as linhas acima e a §900-21 dizem: o plano da Onda 2 aprovado pelo dono do produto é explícito (*"os índices vêm agora, não na Onda 7: roteamento reverso sem índice UNIQUE é roteamento por convenção"*). (2) O índice equivalente para `whatsapp` **nunca vai existir** — decisão travada do plano, reafirmada pelo dono do produto (toda empresa terá WABA própria): WhatsApp resolve por `whatsapp_config.phone_number_id`, não por `org_integrations`, para não criar duas fontes de verdade do mesmo identificador. A `900-21b` torna isso invariante com `CONSTRAINT whatsapp_sem_identificador_proprio CHECK (provider <> 'whatsapp' OR NOT (config ? 'phone_number_id'))`. Quem draftar a `900-47` deve ler esta linha antes de assumir "dois índices" como alvo. |
| `provision_org()` | `900-21` (`p_plan_id` NULL) | `900-31` (`p_plan_id` não-nulo + cria a assinatura) | `900-21` | Fatiado para quebrar o ciclo O2↔O3 (B3) |
| `provision_org()` — nota de rastreabilidade | entregue em `900-21`/PR #498 com assinatura `(p_name, p_slug)` — **sem** `p_admin_email`/`p_admin_name`/`p_actor_user_id` | `p_admin_email` resolvido na camada de rota pela `900-22b` (`organizations.admin_invite_email` + `ensureAdminInvited`), **não** por parâmetro novo; `p_plan_id` segue como trabalho da `900-31`; `p_actor_user_id` pendente junto da `900-16` (auditoria) | `900-22b`, 2026-08-28 | **Divergência registrada, não silenciosa.** Quem draftar a `900-31` deve ler esta linha antes de assumir a assinatura de 6 argumentos de `§7.4` como alvo — o alvo real, no momento desta nota, é `(p_name, p_slug, p_plan_id)`. |
| `PLATFORM_READABLE_TABLES` | `900-22` (provisória mínima) | `900-31`, `900-35`, `900-44` (cada tela acrescenta as suas tabelas) · `900-42a` **consolida e audita** · `900-42b` **fecha** 🔒 | `900-22` | **O artefato mais fatiado do epic — 6 stories.** É o que o E1 revelou |
| `platformQuery()` | `900-22` | `900-42a` (endurece + regra R12 do gate) | `900-22` | **Movido de `900-42a` para cá (F3)** — `900-35` o exige na Onda 4 |
| `sellable_modules`, `plans`, `plan_modules`, `plan_limits`, `org_module_grants`, `org_limit_overrides` | `900-26` | `900-27a` (seed do catálogo e composição) · `900-27b` (preços e cotas) 🔒 | `900-26` | DDL atômico; o seed é que é fatiado |
| `org_subscriptions` | `900-26` | `900-31` (cria as linhas), `900-46` (lifecycle de status) | `900-21` (menção **negativa**) | |
| `org_billing_periods` | `900-26` | `900-33` (`cost_micro_usd`), `900-37` (`consumed_atendimentos`), `900-41` (`overage_*`) | `900-21` (menção **negativa**) | **Movido de `900-33` para cá (F1).** Três ondas escrevem colunas nele |
| `ai_usage_events`, `ai_usage_daily`, `record_ai_usage()` | `900-33` | `900-37` (incremento de atendimento dentro da RPC) | `900-33` | |
| `/dashboard/configuracoes/plano` | `900-31` | `900-39` (barra de cota), `900-43` (seção de faturas) | `900-31` | |
| `withPlatformAdmin` | `900-42a` | `900-44` (aplica em todas as rotas de `/platform`) | `900-42a` | |
| `tenant_invoices`, `tenant_invoice_lines` | `900-43` | `900-50` (campos `provider_*` do gateway) | `900-31` (menção **negativa**) | |

> ### ⚠️ Invariante de `tenancy-known-tables.json` — **o arquivo nunca cresce**
>
> Ele é o retrato congelado das tabelas que existiam quando o gate nasceu. É contra esse retrato que a regra **R3** decide o que é "tabela nova" — e R3 é a única regra que este epic marca como **FAIL absoluto desde o dia 1, sem baseline**, justamente porque é a que impede dívida nova.
>
> **Tabela nova legítima sem `org_id` vai para `tenancy-allowlist.yml` com `reason:` preenchido — nunca para `known-tables.json`.** Sem esse invariante escrito, o primeiro @dev que vir R3 vermelha resolve acrescentando uma linha no arquivo errado, e **mata a regra em silêncio**: a partir dali toda tabela nova sem `org_id` passa despercebida, e o gate continua verde. É a falha mais barata de cometer e a mais cara de descobrir.
>
> AC obrigatória em `900-2a`: comentário no topo do arquivo com esse invariante, e o **próprio gate falha** se `known-tables.json` tiver mais entradas que na revisão anterior.

**As três "menções negativas" são deliberadas e devem permanecer.** São ACs que dizem *"esta story NÃO cria/exibe X — quem cria é Y"*: `900-21` sobre `org_billing_periods`/`org_subscriptions`, `900-31` sobre `tenant_invoices`, `900-33` sobre `consumed_atendimentos`. Elas existem para impedir que o @sm ou o @dev assumam que o artefato está disponível. Uma menção negativa vale mais que a ausência de menção.

---

### Onda 0 — Esteira e observabilidade (sem mudança funcional)

> **Entrega:** CI existe; o schema é introspectável; o gate roda em modo relatório.
> **Critério de saída:** o número de violações está medido e visível em todo PR. **Zero mudança de comportamento em produção.**
> **Reversão:** apagar o workflow.
> **Pré-requisito externo:** PRE-0 (PR #308 aplicado em produção).

#### 900-1 — Esteira de CI do zero
**Objetivo:** existir verificação automática de qualquer coisa. Hoje não existe (CON-2).
**AC:**
- `.github/workflows/ci.yml` roda em `pull_request` e `push: [main]`, com job `static`: install → `type-check` → `lint` → `test`.
- O workflow falha o PR quando qualquer um dos três falha.
- Tempo de execução documentado; cache de dependências configurado.
- Nenhuma mudança em código de aplicação.
**Dep:** — · **Est:** M · **Executor:** @devops

#### 900-2 — Gate de tenancy (R1-R12) com baseline e catraca, não-bloqueante
**Objetivo:** medir a dívida de isolamento e impedir que ela cresça.
**AC:**
- `scripts/gate-tenancy.ts` + script `gate:tenancy` no `package.json`; introspecção via Management API com fallback para snapshot versionado.
- Regras **R1-R9** implementadas conforme §9 deste epic (R10/R11/R12 implementadas com flag de ativação por onda).
- **R5 checa `pg_class.relkind` antes de prescrever `security_invoker`**; matview é avaliada por grant.
- **R6 lê `proacl`/`relacl` procurando `PUBLIC`**, não só `anon`/`authenticated`.
- **R7** detecta `SECURITY DEFINER` sem `SET search_path`.
- **R9** detecta colisão de `CREATE OR REPLACE FUNCTION` entre migrations não aplicadas.
- **Snapshot de schema:** o fallback exige um gerador de introspecção que **não existe** — ver §9.1. Criar `scripts/generate-schema-snapshot.ts`; **não** reutilizar `scripts/sync-schema.sh`, que só faz `supabase db push`.
- `docs/audits/tenancy-allowlist.yml` (com `reason:` obrigatório) e `docs/audits/rls-gate-baseline.json` gerados a partir do estado atual.
- Saída dupla: tabela legível + JSON para comentário no PR. Exit code 1 em FAIL, mas o job entra **não-bloqueante** nesta onda.
- Ressalva de cobertura (§9, último parágrafo) impressa no próprio relatório.
- **Teste do gate contra os 6 achados da auditoria que são estruturalmente verificáveis por ele — P1, P2, P3, P6, P8 e P13** (ver §9.2): cada um que ainda existisse seria detectado; cada um já corrigido pelo PR #308 não aparece. **Não** escrever teste que finja cobrir os outros 7 — o gate não os alcança por construção, e prometer isso produziria exatamente a falsa segurança contra a qual o próprio gate alerta.
**Dep:** 900-1 · **Est:** G · **Executor:** @dev + @data-engineer

#### 900-3 — Projeto Supabase descartável + harness de isolamento
**Objetivo:** dar aos testes cross-tenant um lugar onde rodar. Sem isso a Onda 1 termina sem prova automatizada (R2).
**AC:**
- Projeto Supabase separado provisionado (autorizado em D6), com os **222 arquivos de migration** aplicados do zero — o que também prova que a sequência é reproduzível.
- **AC de ordenação (§0.2):** confirmar que a ordem de aplicação do `db push` no projeto novo é equivalente à que produção aplicou. O diretório tem **20 prefixos duplicados** e pelo menos um caso onde a ordem lexicográfica diverge da numérica (`024_…`, `024_…_remote_only`, `024b_…`). Se divergir, o projeto descartável deixa de ser réplica fiel **exatamente daquilo que ele existe para provar** — e o resultado é comparar o schema efetivo dos dois lados, não presumir.
- Credenciais no CI como secrets, gravadas por REST API (NFR-10).
- `scripts/` com reset determinístico do projeto de teste.
- Documentado que este projeto **nunca** recebe dado de produção.
**Dep:** PRE-1 · **Est:** M · **Executor:** @devops

---

### Onda 1 — Isolamento (a onda mais importante e a mais chata)

> **Entrega:** o banco realmente isola os tenants, e o código tem um piso além da rede.
> **Critério de saída:** gate **bloqueante e verde**; testes cross-tenant passando; nenhuma tabela com `org_id` sem policy org-scoped nas 4 operações; baseline em **zero**.
> **Risco a gerenciar:** policy nova mais restritiva pode quebrar uma tela da Trifold em produção. Mitigação: por lote, nunca big bang; QA gate por lote; a Trifold é usuária ativa e detecta rápido.
> **Reversão:** por lote, migration inversa — documentada no próprio arquivo (NFR-8).
> **Marco:** ⛔ **vender antes do fim desta onda é o único erro irrecuperável do epic.**

#### 900-4 — Lote 1 / P5: `privacy_consents` com escopo de org
**Objetivo:** consentimentos LGPD deixam de ser legíveis por admin de qualquer empresa. A tabela não tem `org_id` e o SELECT libera para todo admin/supervisor.
**AC:**
- Migration 210: `ALTER TABLE privacy_consents ADD COLUMN org_id uuid` + backfill via `users.org_id` + `NOT NULL` + FK.
- Policy `privacy_consents_select_admin` reescrita para `org_id = user_org_id() AND is_admin_or_supervisor()`.
- `WITH CHECK` no INSERT garantindo `org_id = user_org_id()`.
- Zero linhas com `org_id NULL` após o backfill (verificado no QA gate).
- Migration inversa documentada no arquivo.
**Dep:** 900-2 · **Est:** P · **Executor:** @data-engineer

#### 900-5 — Lote 1 / P9: UNIQUEs compostos com `org_id`
**Objetivo:** duas empresas poderem ter imóvel com o mesmo slug e leads do mesmo `supremo_id`.
**AC:**
- `properties_slug_key UNIQUE (slug)` → `UNIQUE (org_id, slug)`.
- `idx_leads_supremo_id UNIQUE (supremo_id) WHERE NOT NULL` → `UNIQUE (org_id, supremo_id) WHERE supremo_id IS NOT NULL`.
- **Verificação obrigatória antes do merge:** se `properties.slug` compõe URL pública, a rota passa a resolver por org (subdomínio ou path) — mapear todos os call sites e decidir no PR; se ampliar escopo, abrir story derivada em vez de improvisar.
- Nenhuma colisão existente em produção (query de verificação no PR).
**Dep:** 900-2 · **Est:** M · **Executor:** @data-engineer

#### 900-6 — Lote 1 / P11: 16 índices `CONCURRENTLY` iniciando em `org_id`
**Objetivo:** `org_id = user_org_id()` vira predicado quente de toda query com N orgs. Com 1 org, filtrar não seleciona nada e o índice é indiferente — com N, é o caminho.
**AC:**
- 16 índices criados via `CREATE INDEX CONCURRENTLY` em arquivo `_remote_only.sql` (NFR-14) nas tabelas: `agent_config`, `agent_media_assets`, `brindes_entregas`, `campaign_entries`, `campaign_events`, `email_automations`, `email_sends_queue`, `imob_card_comments`, `lancamento_card_attachments`, `lancamento_card_checklist`, `lancamento_card_comments`, `lancamento_card_fornecedores`, `lancamento_columns`, `marketing_brand_assets`, `role_permissions`, `user_permission_exceptions`.
- `role_permissions` e `user_permission_exceptions` primeiro: entram no caminho de **toda** verificação de permissão.
- Nenhum `CONCURRENTLY` dentro de transação; zero downtime.
**Dep:** 900-2 · **Est:** P · **Executor:** @data-engineer

#### 900-7 — P13 + varredura final de views: `search_path` e `security_invoker`
**Objetivo:** fechar o vetor de hijack de `search_path` e o resíduo de views sem `security_invoker`. Ficou fora do Lote 0 por decisão correta de não ampliar escopo do hotfix.
**AC:**
- `ALTER FUNCTION … SET search_path = pg_catalog, public` em `get_broker_dashboard_counts`, `get_broker_funnel_stats`, `seed_system_roles`, verificando antes se alguma depende de resolução dinâmica de schema.
- Varredura das 27 funções `SECURITY DEFINER`: nenhuma sem `search_path` ao fim da story (R7 do gate em zero).
- Varredura de views/matviews restantes: `relkind='v'` com `security_invoker=on`; `relkind='m'` sem grant a `anon`/`authenticated` (CON-5).
- Call sites verificados antes de ligar `security_invoker` em qualquer view (risco de esvaziar tela).
**Dep:** 900-2 · **Est:** P · **Executor:** @data-engineer

#### 900-8 — Policies org-scoped, lote A: leads, conversas, mensagens (PII primeiro)
**Objetivo:** fechar as lacunas de RLS onde o dado é PII de terceiro — a maior consequência de vazamento.
**AC:**
- Cada tabela do domínio com `org_id` tem policy org-scoped nas 4 operações, com `WITH CHECK` em INSERT/UPDATE.
- `WITH CHECK` adicionado onde só existia `USING` — impede forjar `org_id` no INSERT (o passo mais esquecido).
- **O conjunto de tabelas deste lote é a partição A de `docs/audits/rls-gate-baseline.json`** (leads, conversas, mensagens) — a partição das três é exaustiva e disjunta, e é o baseline que a define.
- Baseline do gate reduzido pela contagem exata deste lote (diff do `rls-gate-baseline.json` no PR).
- Nenhuma regressão nas telas da Trifold do domínio (checklist de telas no QA gate).
- Migration inversa documentada.
**Dep:** 900-2 · **Est:** G · **Executor:** @data-engineer

#### 900-9 — Policies org-scoped, lote B: agenda, obras, portal do cliente, pastas
**Objetivo:** mesmo padrão do lote A no domínio de obras/agenda/portal.
**AC:**
- **O conjunto de tabelas deste lote é a partição B de `docs/audits/rls-gate-baseline.json`** (agenda, obras, portal, pastas) — enumerada no baseline, não neste epic: a lista só é conhecível depois que 900-2 emitir o arquivo.
- Policy org-scoped nas 4 operações para cada tabela da partição, com `WITH CHECK` em INSERT/UPDATE.
- Baseline cai pela **contagem exata** deste lote (diff do JSON no PR).
- Revisão de RLS do portal do cliente (`app/cliente`, `app/portal-viewer`, `app/pasta`) — já escopado por token/lead, mas nunca auditado.
- Migration inversa documentada; nenhuma regressão nas telas da Trifold do domínio.
> **Nota de execução:** draftável agora; **não promover a `Ready`** antes de 900-2 emitir o baseline.
**Dep:** 900-8 (padrão estabelecido) · **Est:** G · **Executor:** @data-engineer

#### 900-10 — Policies org-scoped, lote C: financeiro, imob, campanhas, marketing, `system_events`
**Objetivo:** fechar o restante, incluindo as tabelas que hoje dependem 100% de service-role.
**AC:**
- **O conjunto de tabelas deste lote é a partição C de `docs/audits/rls-gate-baseline.json`** (financeiro, imob, campanhas, marketing, `system_events`).
- Policy org-scoped nas 4 operações, com `WITH CHECK` em INSERT/UPDATE; baseline cai pela contagem exata do lote.
- Decisão documentada **tabela por tabela** entre "escrever policy" e "manter service-role-only com entrada justificada na allowlist", para as 16 tabelas do achado P8 (`fornecedores`, `imobiliarias`, `imob_*`, `lancamento*`, `marketing_*`, `supremo_sync_log`).
- Migration inversa documentada.
> **Nota de execução:** draftável agora; **não promover a `Ready`** antes de 900-2 emitir o baseline.
**Dep:** 900-8 · **Est:** G · **Executor:** @data-engineer

#### 900-11 — Lote 2a / P7a: policies de Storage ancoradas em org
**Objetivo:** `authenticated_read_obra_docs` e `authenticated_read_obra_mensagens` liberam por `bucket_id` apenas — qualquer usuário logado lê documento de obra de qualquer empresa. As policies com `is_admin_or_supervisor()` permitem **apagar** arquivo de outra org.
**AC:**
- Policies de `obra-docs` e `obra-mensagens` (SELECT/INSERT/UPDATE/DELETE) ancoradas em org.
- Nenhuma das 20 policies de `storage.objects` fica sem noção de org ou sem justificativa registrada.
- Verificado que nenhum fluxo legítimo da Trifold quebra (upload de obra, mensagens de obra).
**Dep:** 900-2 · **Est:** M · **Executor:** @data-engineer

#### 900-12 — Lote 2b / P7b: buckets com PII → privados + URL assinada
**Objetivo:** `nicole-media` (áudio, PDF, imagem de conversa) e `obra-fotos` são buckets **públicos** — em bucket público, policy de SELECT é irrelevante: a URL basta. É exposição de PII **hoje**, independente de multi-tenant.
**AC:**
- Varredura completa das referências gravadas no banco antes de qualquer flip (R13).
- `nicole-media` e `obra-fotos` privados; leitura por URL assinada com TTL.
- Período de sobreposição documentado para URLs já distribuídas a clientes; nenhuma imagem/áudio quebrado no portal ou no chat após o flip.
- `chamados-attachments`, `campaign-assets`, `marketing-brands`: decisão explícita registrada (público é aceitável ou não), com justificativa.
**Dep:** 900-11 · **Est:** G · **Executor:** @dev + @data-engineer

#### 900-13 — Lote 2c / P7c: convenção de path `{org_id}/…` + migração de objetos
**Objetivo:** tornar o escopo de org verificável no próprio path, permitindo policy por `(storage.foldername(name))[1] = user_org_id()::text`.
**AC:**
- Convenção `{org_id}/…` aplicada a todos os buckets de tenant, documentada em um único lugar.
- Objetos existentes movidos e **todas** as referências gravadas no banco reescritas, com script idempotente e reversível.
- Policies migradas para o predicado de path.
- Zero referência órfã após a migração (query de verificação no PR).
**Dep:** 900-12 · **Est:** G · **Executor:** @dev + @data-engineer

#### 900-14 — Lote 3 / P8: `createOrgScopedAdminClient()` + regra de ESLint
**Objetivo:** criar o **piso** de isolamento. RLS é a rede (NFR-5): 129 de 318 handlers a bypassam.
**AC:**
- `createOrgScopedAdminClient(orgId)`: proxy service-role que injeta `.eq('org_id', orgId)` em toda query e **lança** se a tabela tiver `org_id` e o filtro não puder ser aplicado.
- Teste unitário por classe de query (select/insert/update/delete/upsert/rpc) e por tabela sem `org_id`.
- Regra ESLint `aios/no-unscoped-admin-client`: sinaliza `createAdminClient()` em `app/api/**` que não passe pelo client escopado nem esteja em allowlist justificada (webhook pré-resolução de org, cron cross-org, rota de plataforma).
- Regra entra como **warn** nesta story; vira **error** ao fim de 900-15.
- Razão principal do wrapper é o piso de isolamento das 166 rotas service-role, e ela **não** mudou com D14 (a impersonation, que também o reaproveitaria, foi cancelada). Esta story continua obrigatória e independente.
**Dep:** 900-2 · **Est:** M · **Executor:** @dev

#### 900-15 — Migração das rotas service-role que tocam PII para o client escopado
**Objetivo:** aplicar o piso onde o dano é maior primeiro.
**AC:**
- Todas as rotas de `app/api/**` que leem/escrevem `leads`, `messages`, conversas, documentos e `privacy_consents` migradas para `createOrgScopedAdminClient`.
- Allowlist da regra de ESLint reduzida ao mínimo justificado, com `reason` por entrada.
- Regra ESLint promovida de `warn` para `error`.
- Contagem "handlers em service-role cru" publicada antes/depois no PR, **como métrica de acompanhamento e não como critério de aprovação** — o critério verificável é a primeira AC (as rotas de `leads`/`messages`/conversas/documentos/`privacy_consents` migradas). Um alvo declarado por quem executa não reprova ninguém.
**Dep:** 900-14 · **Est:** G · **Executor:** @dev

#### 900-16 — Lote 3 / P4: papel `platform_admin`, trilha imutável + re-ancoragem das tabelas do Epic 78
**Objetivo:** as 5 tabelas de custo interno da Trifold (`platform_services`, `service_cost_snapshots`, `service_billing_reminders`, `billing_cost_alerts_sent`, `billing_monthly_summary_log`) têm policy `user_role() = 'admin'` **sem noção de org**. No momento em que o primeiro cliente recebe uma conta admin — que é o próprio modelo de provisionamento aprovado (D3) — esse cliente lê o custo que a Trifold paga pela IA. É dano comercial, não só técnico.
**AC:**
- Tabela `platform_admins` (`user_id`, `level ∈ {owner, operator, support}`, `created_by`, `revoked_at`) criada com RLS deny-all.
- `requirePlatformAdmin(min)` implementada em `lib/tenancy/platform-auth.ts`.
- **`CREATE TABLE platform_audit_log` (§2.7 da arquitetura), nascendo já append-only** — `REVOKE UPDATE, DELETE ON platform_audit_log FROM authenticated, service_role` na **mesma migration** que a cria. `actor_email` desnormalizado (sobrevive à exclusão do usuário).
- **Função `platform_audit(...)` `SECURITY DEFINER SET search_path`** como **único** caminho de escrita na trilha, criada aqui e não depois.
- **Por que a tabela nasce aqui e não em `900-42a`, onde o mecanismo é construído:** ela passa a ser **escrita** já em 900-21 (`action='org.create'`, Onda 2) e 900-31 (Onda 3). Criá-la sem o `REVOKE` e endurecê-la quatro ondas depois deixaria a trilha do provisionamento do **primeiro cliente pagante** forjável e apagável por `service_role` — violando o NFR-13 deste epic por 4 ondas. Imutabilidade é atributo de nascimento, não de refino.
- As 5 tabelas do Epic 78: `REVOKE` de `authenticated`, acesso só por service-role em rota gated por `requirePlatformAdmin` (padrão de `131_imobiliarias.sql`).
- `whatsapp_pricing` (`USING(true)`): decisão registrada junto — se o preço repassado difere do custo, a tabela revela markup (P12).
- **Esta story precede a criação da primeira conta admin de cliente (900-22/900-25).** Gatilho do dano é a Onda 2, não a Onda 6.
**Dep:** 900-2 · **Est:** M · **Executor:** @dev + @data-engineer

#### 900-17 — Testes de isolamento cross-tenant, data-driven
**Objetivo:** provar comportamento, não só schema. O gate valida o banco; este teste valida o isolamento.
**AC:**
- `tests/tenancy/cross-tenant.spec.ts` data-driven pelo snapshot de schema — tabela nova entra na cobertura automaticamente, sem ninguém lembrar.
- Para cada tabela com `org_id`, com dois clients **ANON** (não service-role): leitura não retorna linha alheia; UPDATE em linha alheia afeta 0 linhas; DELETE idem; **INSERT com `org_id` de outra org é rejeitado por policy** (o passo mais importante e o mais esquecido); RPC com `org_id` alheio retorna erro/vazio.
- Roda no CI contra o projeto descartável (900-3), não contra produção.
- Job passa a `continue-on-error: false` ao fim da story.
**Dep:** 900-3, 900-8, 900-9, 900-10 · **Est:** M · **Executor:** @qa + @dev

#### 900-18 — Baseline a zero + gate bloqueante
**Objetivo:** fechar a Onda 1. A catraca deixa de ser catraca e passa a ser piso.
**AC:**
- `rls-gate-baseline.json` com contagem **zero** em todas as regras.
- Job `tenancy-gate` bloqueante em PR e em `main`.
- R8 promovida de WARN para FAIL.
- Documento de saída da onda: quais tabelas ficaram na allowlist service-role-only e por quê.
**Dep:** 900-4 … 900-17 (todas) · **Est:** P · **Executor:** @qa + @devops

---

### Onda 2 — Multi-org de verdade (sem venda ainda)

> **Entrega:** é possível criar uma segunda org e ela funciona.
> **Critério de saída:** o teste de aceitação de `saas-multi-tenant.md` §7.4 passa; **nenhuma constante de UUID de org resta no código**; a operação da Trifold segue idêntica.
> **Reversão:** flag `STAGE_RESOLVER=legacy` volta o comportamento antigo **sem deploy de código**.

#### 900-19 — Expand: chaves semânticas de stage e imóvel (aditivo, backfill)
**Objetivo:** transformar as duas listas de UUID de `stage-filters.ts` em **predicados de dado**, para cada org ter os próprios stages perdidos/acervo sem código novo.
**AC:**
- Migration aditiva (nullable): `kanban_stages.semantic_key`, `is_lost`, `excluded_from_active`; `UNIQUE (org_id, semantic_key) WHERE semantic_key IS NOT NULL`.
- `properties.semantic_key` pelo mesmo padrão (para `locations.ts` e `supremo-sync`).
- Backfill por PK dos UUIDs hoje hardcoded (mapa em §7.2 da arquitetura), incluindo `novo`, `perdido`, `nao_qualificado`, `represamento`, `corretores_antigos`.
- **Código não muda nesta story.** Risco ~zero.
**Dep:** 900-18 · **Est:** M · **Executor:** @data-engineer

#### 900-20 — Resolver de stage/imóvel + dual-run + cutover + contract (14 arquivos)
**Objetivo:** eliminar os 14 arquivos com UUID de org hardcoded. O pior deles: `default-stage.ts`, cuja função já consulta por org mas cujo **fallback devolve o stage de outra org**.
**AC:**
- `lib/leads/stage-resolver.ts` com `getOrgStages`, `getStageId`, `getExcludedFromActiveIds`, `getLostStageIds` — cache 300s, tag `stages-${orgId}`.
- Flag `STAGE_RESOLVER ∈ {legacy, both, semantic}`. Em `both`: resolve pelos dois caminhos, **usa o legacy** e loga divergência com contador. **Rodar 7 dias.**
- Cutover para `semantic` só com **divergência zero observada** — é o critério de aceite, e é o que substitui o staging que não existe (CON-1).
- Contract em commit separado: constantes e flag removidas dos 14 arquivos (`default-stage.ts`, `stage-filters.ts`, `sla/waiting.ts`, `appointments/locations.ts`, `cron/supremo-sync`, `cron/daily-report`, `broker/page.tsx`, `dashboard/pipeline/page.tsx`, `leads/[id]/{tasks,notes,mark-lost}`, `api/imob/leads`, `webhooks/landing-page`, `lead-detail-drawer.tsx`).
- Grep de verificação: zero UUID de org em `packages/web/src`.
**Dep:** 900-19 · **Est:** G · **Executor:** @dev

#### 900-21 — `role_default_permissions` + `provision_org()` idempotente
**Objetivo:** provisionar org nova em uma transação, sem duplicar o switch de `getHardcodedPermissions()` em SQL (R12).
**AC:**
- Tabela `role_default_permissions` semeada uma vez como **fonte única** dos defaults por role × módulo, substituindo a duplicação TS↔SQL.
- **Teste de paridade** entre `getHardcodedPermissions()` (`permissions.ts:62-116`) e `role_default_permissions` — falha se divergirem.
- `provision_org(p_name, p_slug, p_plan_id, p_admin_email, p_admin_name, p_actor_user_id)`: uma transação, `SECURITY DEFINER SET search_path = public`, **idempotente por slug** (re-executar retoma o que falta).
- **`p_plan_id` é NULLABLE e na Onda 2 é sempre NULL.** A arquitetura é explícita — §10, Onda 2: *"Mínimo do `/platform`: layout + guard + `/platform/orgs` + `/platform/orgs/new`. **Sem plano, sem fatura.**"* — e a assinatura herdada da §7.4 contradizia isso. **A incoerência é da arquitetura; a resolução é esta:** a Onda 2 provisiona org **sem plano**, sem `org_subscriptions` e sem `org_billing_periods`. Esses passos entram quando `plans` existir (900-26/27a, Onda 3), como AC de 900-31.
- Consequência de ordem, e é a razão de ser desta escolha: sem ela o grafo de artefatos fecha um **ciclo** (900-25 → 900-27 → 900-26 → 900-25) e o critério de saída da Onda 2 passaria a depender de um preço em aberto — a inversão exata que o §1.1 proíbe.
- Semeia: `organizations`, os 9 roles (4 system + `gerente-relacionamento`, `gerente-comercial`, `imob`, `consultoria`, `sdr`), `role_permissions` para todos os 26 `ALL_MODULES`, `kanban_stages` canônicos com `semantic_key`, configs (`roleta_config`, horário comercial, follow-up, prompts da Nicole do Epic 53 — validando que o fallback é org-agnóstico), `org_integrations` `disconnected` por provider, entrada em `platform_audit_log` via `platform_audit()` com `action='org.create'`.
- **[@po 2026-08-29] Esta AC foi entregue pela `900-21b`, não pela `900-21`.** A migration `240` (PR #498) entregou só `organizations` + roles + `role_permissions` + `kanban_stages`; `org_integrations`, o seed de `whatsapp_config` e as UNIQUE parciais saíram na `900-21b` (migration `246`), com **6** providers (`meta_ads`/`meta_capi` separados) e o índice de roteamento reverso de `meta_ads` **antecipado da `900-47`**. Ver a nota de rastreabilidade de `org_integrations` na matriz de ownership. `role_default_permissions` **continua pendente**, sem story — é a única parte desta `900-21` ainda em aberto.
- **Esqueleto de `org_integrations` criado nesta story** (tabela + `org_id` + `provider` + `status` + `config jsonb` com identificadores públicos + `UNIQUE (org_id, provider)` + RLS): `provision_org` a semeia, e ela **não pode nascer na Onda 7**, que é declarada sob demanda e pode nunca acontecer. O que fica para 900-47 é o que é de fato da Onda 7: `secret_ref`/Vault, índices UNIQUE de roteamento reverso, `resolveIntegration`, `platform_shared`. É o mesmo expand→migrate que o epic exige de todo o resto (NFR-1).
- Efeitos externos **fora** da transação, com retry: convite do admin via Supabase Auth + linha em `users` com `role='admin'` + e-mail de boas-vindas. Falha ⇒ a org existe e o `/platform` mostra "convite pendente" com botão de reenviar (melhor que rollback de org criada).
- **PEND-8** define se `provision_org` cria assinatura com `status='trial'` ou `'active'`. Não bloqueia o draft — o status inicial é um parâmetro, e a resposta só precisa chegar antes do QA gate.
- **Nota de rastreabilidade (`900-22b`, 2026-08-28):** o `provision_org()` efetivamente entregue (PR #498, migration `240`) tem assinatura `(p_name, p_slug)` — **sem** `p_admin_email`, `p_admin_name` nem `p_actor_user_id`. A `900-22b` decidiu, de forma registrada e justificada (ver a própria story), resolver o convite do admin **na camada de rota** em vez de estender a assinatura da função — para não empilhar um segundo overload de `provision_org` antes de a `900-31` precisar mexer nela de novo por `p_plan_id`. **Quem draftar a `900-31` parte de `(p_name, p_slug, p_plan_id)` como assinatura viva, não dos 6 argumentos deste parágrafo.** `p_actor_user_id`/auditoria continuam pendentes, amarrados à `900-16` (não entregue).
**Dep:** 900-19, 900-16 · **Est:** G · **Executor:** @data-engineer + @dev

#### 900-22 — `/platform` mínimo: layout, guard, lista de orgs, wizard de provisionamento
**Objetivo:** a Trifold consegue criar uma org sem SQL manual.
**AC:**
- `packages/web/src/app/platform/` como segmento **top-level** (irmão de `dashboard/`), **não** subdiretório de `/dashboard` — a separação física é o que impede que um `layout.tsx` mal configurado exponha o plano de plataforma.
- `layout.tsx` com `requirePlatformAdmin()` e chrome deliberadamente distinto (barra escura, badge "PLATAFORMA"): um operador com duas abas abertas não pode confundir Trifold com cliente X.
- `/platform/orgs` (lista com status e última atividade) e `/platform/orgs/new` (wizard: **nome, slug, e-mail do admin** → chama `provisionOrg()`).
- **O wizard não tem seleção de plano nem de módulos extras nesta onda** — `plans`, `plan_modules` e `org_module_grants` só existem a partir de 900-26 (Onda 3). Os campos comerciais entram em 900-31, que é dona da tela de plano. Antecipá-los aqui criaria dependência de artefato de uma onda futura, que é o defeito que esta correção fecha.
- `/dashboard` **não importa nada** de `lib/tenancy/platform-*` (fronteira de módulo, não só de rota) — verificado por teste.
- `platform_admins` não concede **nada** dentro de `/dashboard`: um platform admin logado é, no `/dashboard`, apenas um usuário da própria org. Teste dedicado.
- **`platformQuery(table, orgId)` e a constante `PLATFORM_READABLE_TABLES` nascem nesta story**, junto da primeira tela de `/platform`, com a lista provisória mínima (`organizations`, `users`) e o comentário de topo *"lista PROVISÓRIA — consolidada por 900-42a, fechada por 900-42b"*.
- **Regra de crescimento da lista, válida do `900-22` em diante:** *toda story que adiciona tela de `/platform` acrescenta, no mesmo PR, as tabelas que aquela tela lê* — com uma linha de justificativa por tabela. Sem essa regra, a próxima tela bate em `platformQuery()`, é rejeitada, e o @dev contorna o mecanismo exatamente onde ele deveria valer. Quem estende: `900-31`, `900-35`, `900-44`. Quem consolida e audita: `900-42a`. Quem fecha: `900-42b`. Motivo: `900-35` (Onda 4) já exige "só via `platformQuery()`", e `900-42a` é da Onda 6 — declarar a dependência para frente inverteria a ordem de ondas. Vale o mesmo princípio do `platform_audit_log`: **o artefato nasce onde é primeiro usado**, e é refinado depois (`900-42a` adiciona o decorador, os níveis e a regra R12; `900-42b` fecha a lista). Como efeito colateral, `/platform/orgs` deixa de ser a única tela de plataforma sem guarda de leitura.
- **Convite de usuário só pode criar usuário na org de quem convida** (§8.5 da arquitetura). Movido para cá vindo de 900-49 (Onda 7, sob demanda): é vetor de escalada cross-tenant e **a primeira conta admin de cliente nasce nesta story**. Atenuante verificado no código — `packages/web/src/app/api/brokers/route.ts` já deriva `org_id` de `appUser.org_id` em todos os pontos de escrita — então o trabalho é **verificar e replicar**, não corrigir.
**Dep:** 900-16, 900-21 · **Est:** M · **Executor:** @dev

#### 900-23 — crons iteram orgs (`forEachActiveOrg`) — fim do `DEFAULT_ORG_ID`
**Objetivo:** o backend deixa de assumir uma org. É onde o vazamento aconteceria (§4.6).
**AC:**
- `forEachActiveOrg(fn)` em `lib/tenancy/for-each-org.ts` — **corrigido de `guard.ts` ([@po] 2026-08-29):** `guard.ts` nunca existiu no repositório, e `platform-guard.ts` já ocupa o radical "guard" com sentido de autorização (`requirePlatformAdmin`). Com **isolamento de erro por org** (uma org que falha não aborta as outras) e log por org.
- **[@po 2026-08-29] A contagem "37 crons migrados" era estimativa e está errada — a partição medida contra `e8ea5433` é esta, e fecha exatamente nos 40 diretórios reais de `packages/web/src/app/api/cron/`:** **2** migram para o helper (`daily-report`, `nicole-agenda-reconcile`) · **1** reclassifica sem migrar (`nicole-health` — vigia de plataforma; migrar criaria N alertas para o mesmo incidente) · **3** têm correção bespoke sem o helper (`meta-ads-intelligence`, `meta-capi-dispatch`, `followup` — derivam a org da linha que processam, não de `organizations`) · **19** ficam como estão, ganhando só isolamento de erro · **12** são cross-org de plataforma, permanentes · **3** são órfãos não agendados (decisão adiada para a Onda 3). `2+1+3+19+12+3 = 40`. **Migrar os 19 seria regressão de eficiência** (troca "deriva a org da linha" por "pergunte a cada org", com N-1 queries vazias) — não é dívida, é a decisão certa.
- `DEFAULT_ORG_ID` removido de `cron/daily-report`, `cron/nicole-agenda-reconcile` e `cron/nicole-health`. **Ressalva medida ([@po] 2026-08-29):** o grep do *nome* é satisfeito por um rename. O literal `00000000-0000-0000-0000-000000000001` **sobrevive em 2 lugares por desenho** — `lib/tenancy/trifold-org.ts` (marcador de qual org é a Trifold, para escopar canais globais de notificação: `DAILY_REPORT_RECIPIENTS` e o Telegram administrativo) e `nicole-health` (`PLATFORM_ALERT_ORG_ID`, canal de **entrega** do alerta de plataforma, não filtro do que é lido). Os dois são exceções nomeadas com catraca (AC10 da `900-23`), e o **§900-20 herda essa dívida**: o "grep de verificação: zero UUID de org em `packages/web/src`" daquela story precisa contar com esses dois, ou nasce como régua impossível.
- Crons de infraestrutura (`keep-alive`, `webhook-health`, `purge-rejected-uploads`) e do Epic 78 (`billing-*`) **explicitamente marcados como cross-org** e não migrados — são custo de plataforma, não de tenant.
- Ainda **sem** entitlement (só iteração) — o filtro por módulo entra em 900-30.
**Dep:** ~~900-20~~ → **900-21b** ([@po] 2026-08-29 — a dependência real é `org_integrations`/migration `246`, que a AC5 lê para resolver o `dataset_id` por org; a `900-23` **não** depende do resolver de stage. Mantido `900-20` o grafo dizia que esta story estava bloqueada por uma story que ainda não existe, e a `900-24` depende desta.) · **Est:** G · **Executor:** @dev

#### 900-24 — Roteamento de webhook por identificador, com dual-run
**Objetivo:** `api/webhook/whatsapp` e `api/webhooks/meta-ads` assumem uma org. Passam a resolver pelo payload.
**AC:**
- Resolução da org por `phone_number_id` (WhatsApp) e `page_id` (Meta), com **fallback para a org única enquanto houver só uma** (dual-run).
- Não encontrou org ⇒ **200 + log estruturado**, nunca 4xx/5xx (NFR-12: a Meta desabilita o webhook após falhas repetidas).
- Idempotência e persistência do evento bruto **antes** do processamento preservadas.
- Contador de "resolvido por identificador" vs. "caiu no fallback" observável antes de remover o fallback.
**Dep:** 900-23 · **Est:** M · **Executor:** @dev

#### 900-25 — Org "Trifold Sandbox" + teste de aceitação de multi-tenancy
**Objetivo:** o teste que **prova** que o multi-tenant funciona. Esta org fica permanentemente como canário de regressão.
**AC (o teste da §7.4, na parte satisfazível nesta onda):**
- Org "Trifold Sandbox" criada em produção via `/platform/orgs/new`, **sem plano** (a Onda 2 não tem `plans` — ver 900-21/900-22).
- (a) o admin recebe convite e loga; (c) cria um lead que cai no stage `novo` **da própria org**; (d) nenhuma query retorna dado da Trifold; (e) a Trifold não vê nada dessa org.
- **A AC (b) da §7.4 — "vê Pipeline/Leads/Imóveis e não vê Obras/Lançamentos" — NÃO é verificável nesta onda e foi movida para 900-32.** Motivo, e é factual: `provision_org` semeia `role_permissions` para os **26 `ALL_MODULES`** em cada role; sem a camada de entitlement (900-28) o admin de uma org nova **vê tudo**, inclusive Obras e Lançamentos. Exigir (b) aqui seria uma AC insatisfazível por construção, e ela já está coberta em 900-32 ("Trifold Sandbox com plano `crm` vê exatamente os módulos do tier 10").
- Roteiro do teste versionado e re-executável a cada onda seguinte, ganhando (b) quando a Onda 3 fechar.
**Dep:** 900-22, 900-24 · **Est:** P · **Executor:** @qa

---

### Onda 3 — Entitlements (a camada que habilita a venda)

> **Entrega:** módulos podem ser ligados/desligados por contrato.
> **Critério de saída:** a Trifold **não percebe nenhuma diferença** (NFR-2 verificado); a Trifold Sandbox com plano `crm` vê exatamente os módulos do plano; downgrade e re-upgrade preservam dados **e** a configuração de permissão.
> **Reversão:** flag `ENTITLEMENTS_ENFORCEMENT=off` faz `getOrgEntitlements` retornar todos os módulos (fail-open, NFR-3).
> **Marco:** 🟢 **vendável ao fim desta onda** — com IA cobrada no olhômetro e contrato dizendo isso.

#### 900-26 — Modelo de dados de tenancy + entitlement derivado
**Objetivo:** as tabelas comerciais e a função que deriva o entitlement. Aditivo — ninguém lê ainda, risco baixo.
**AC:**
- Migrations: `sellable_modules`, `plans`, `plan_modules`, `plan_limits`, `org_subscriptions` (com `UNIQUE (org_id) WHERE status <> 'cancelled'`), `org_module_grants`, `org_limit_overrides`.
- **`plan_limits` já contempla `max_requests_per_min`** (§8.5 da arquitetura: rate limit por org não é da Onda 1, mas "a coluna nasce junto"). Sem uso ainda; adicionar depois custaria migration nova em tabela já povoada.
- **Nenhuma tabela `org_entitlements`** — entitlement é sempre derivado (ADR-003). Uma tabela materializada cria a pior classe de bug do domínio: divergência silenciosa entre o que o cliente pagou e o que acessa.
- `org_entitled_modules(p_org_id)` com precedência **core > revoked > add_on > plan**: uma revogação explícita não derruba módulo core (senão o admin do cliente se tranca fora).
- **`CREATE TABLE org_billing_periods`** (1 linha por org por ciclo: `period_start`/`period_end`, `quota_*`, `alert_80_at`, `alert_100_at`, `closed_at`) — **a tabela nasce aqui, não na Onda 4.** Ela é consumida por `org_entitlement_snapshot()` nesta mesma story ("linha do ciclo") e por `900-31` (Onda 3), duas ondas antes de `900-33`. Mesma classe do defeito do `platform_audit_log`: criar tarde deixa duas stories sem onde ler.
- `org_entitlement_snapshot(p_org_id) RETURNS jsonb` — uma ida ao banco devolve módulos + limites + **a linha corrente de `org_billing_periods`**.
- RLS conforme §2.9, tabela por tabela (catálogo legível por `authenticated`; `org_module_grants`/`org_limit_overrides` **deny-all** — é a planilha da negociação, o cliente vê o efeito, não o preço).
- Todas as tabelas novas entram na allowlist de tenancy do gate com `reason:`.
- R10 do gate ativada (`sellable_modules.key ⊇ ALL_MODULES`).
**Dep:** 900-25 · **Est:** M · **Executor:** @data-engineer

#### 900-27a — Seed do catálogo de módulos e da composição dos 3 tiers (**sem preço**)
**Objetivo:** popular o catálogo comercial e a composição dos tiers de D7. **Nada aqui depende de decisão comercial pendente** — a composição está fechada por D7/§3.1, que reproduz literalmente a Q8 da arquitetura.
**AC:**
- 26 módulos de `ALL_MODULES` em `sellable_modules`, com `is_core = true` para `dashboard`, `chamados`, `configuracoes` (D8) e `min_tier_order` conforme §3.1.
- 3 planos com `tier_order` 10/20/30 e `plan_modules` **acumulativos** conforme §3.1; plano `completo-interno` com `is_internal = true`.
- **Teste de completude:** a união dos 3 tiers cobre exatamente os 26 de `ALL_MODULES`, sem sobra nem falta (é a regra R10 do gate, verificável desde já).
- Colunas de preço e cota deixadas **NULL**, com `NOT NULL` adiado para 900-27b — plano sem preço não pode ser vendido, mas pode ser semeado e testado.
**Dep:** 900-26 · **Est:** P · **Executor:** @data-engineer
**Por que existe separada:** enquanto catálogo e preço eram uma story só, PEND-1 travava por transitividade **20 stories** (900-27 → 900-32 → Ondas 4, 5, 6, 7, 8). Separados, um preço em aberto trava apenas a cobrança — que é o que a tabela de PRE-3 sempre dizia e agora é verdade.

#### 900-27b — 🔒 Preços e cotas dos 3 tiers
**Objetivo:** tornar os planos vendáveis.
**AC:**
- `monthly_price_cents` e `setup_fee_cents` dos 3 tiers preenchidos com os valores reais e promovidos a `NOT NULL`.
- `ai_quota_*` em atendimentos/mês (D9), com a cota real incluída em cada tier.
- Nenhum valor default, placeholder ou "a definir" no banco: plano sem preço fica `is_active = false`.
**🔒 BLOQUEADA por PEND-1** (preço dos 3 tiers) **e por PEND-1c** (quantos atendimentos/mês cada tier inclui). São dois números distintos e nenhum dos dois pode ser derivado — Constitution Artigo IV. A semântica da cota, essa sim, já está fechada por D11/D12.
**Dep:** 900-27a · **Est:** P · **Executor:** @pm (valores) + @data-engineer (seed)

#### 900-28 — Camada de entitlement no código + interseção no RBAC
**Objetivo:** `acessoEfetivo = assinaturaViva ∧ orgEntitled ∧ rbacPermite`, com o **menor raio de explosão possível**.
**AC:**
- `lib/tenancy/{entitlements,access,guard}.ts`; `getOrgEntitlements(orgId)` com `unstable_cache`, TTL 300s, tag `entitlements-${orgId}`.
- Interseção como **passo 5 dentro de `getUserPermissions()`**, depois das exceções por usuário — não em cada rota. 70 arquivos chamam `canAccess()` e 2 layouts chamam `getUserPermissions()`: um ponto de composição cobre todos, inclusive `NAV_MODULE_MAP` da sidebar.
- **`fullMatrix()` do ramo `admin` também é interseccionada** (aplicar no passo 5 garante isso; aplicar antes deixaria o admin do cliente ver módulos não contratados).
- **Ordem: entitlement por último.** Exceção por usuário continua com prioridade absoluta **dentro** do que a org contratou. Entitlement é teto, não voto.
- `resolveAccess()` retorna `no_permission` | `not_entitled` (+ `upsellTier`) | `subscription_suspended`; `canAccess()` permanece como wrapper booleano, preservando os 70 call sites.
- **`fail-open` obrigatório** (NFR-3): falha ao resolver entitlement ⇒ assume tudo liberado + alerta crítico. Teste unitário do caminho de falha.
- Kill switch `ENTITLEMENTS_ENFORCEMENT=off`, gravado por `vercel-env-set.sh` (NFR-10).
- `revalidateOrgEntitlements(orgId)` chamada em **toda** mutação de `/platform` sobre plano/módulo/status.
- **QA gate reforçado (R3):** `permissions.ts` decide se todo mundo vê qualquer coisa.
**Dep:** 900-26 · **Est:** M em código, **alto em consequência** · **Executor:** @dev

#### 900-29 — `ModuleLockedScreen`, cadeado na sidebar e CTA de upgrade
**Objetivo:** tornar o entitlement uma oferta, não um erro. 404 parece bug; tela de bloqueio parece produto.
**AC:**
- Rota de módulo não contratado renderiza `<ModuleLockedScreen module="…" />`, **nunca 404**.
- Item de navegação continua visível **com cadeado** quando `min_tier_order > planTierOrder` (oportunidade de venda); **some** quando revogado por `org_module_grants.granted = false` (decisão comercial específica, não upsell).
- Tela reusa `MODULE_LABELS`/`MODULE_DESCRIPTIONS` de `permissions-modules.ts` — reaproveitar, não duplicar (IDS: REUSE > ADAPT > CREATE).
- CTA abre um `chamado` do tipo `upgrade_request` — aproveita o módulo core `chamados`, sem construir funil novo.
- Nenhum dado apagado em downgrade; re-upgrade restaura acesso sem migração (NFR-6).
**Dep:** 900-28 · **Est:** M · **Executor:** @ux-design-expert + @dev

#### 900-30 — Entitlement no lado servidor: crons e webhooks
**Objetivo:** fechar o buraco que quase todo SaaS deixa — a UI respeita o plano e o backend não.
**AC:**
- `assertOrgEntitled(orgId, module)` e `forEachEntitledOrg(module, fn)` em `lib/tenancy/guard.ts`.
- Cada um dos 37 crons anotado com o módulo requerido (mapa em §4.6: `roleta`/`bolsao`, `leads`+cota, `campanhas`, `obras`, `analytics`, `fluxo`/`imob`).
- Webhooks de entrada continuam **aceitando e persistindo** (nunca perder dado de origem externa) mas **não disparam automação** de módulo não contratado. Ex.: lead do Meta entra; a roleta não distribui se `roleta` não está liberada.
- Org `suspended`: automações **pausadas**, dados intactos, usuário **não deslogado** (deslogar inadimplente transforma cobrança atrasada em cliente perdido).
**Dep:** 900-28, 900-23 · **Est:** M · **Executor:** @dev

#### 900-31 — `/platform/orgs/[id]/plano` + `/dashboard/configuracoes/plano`
**Objetivo:** a Trifold muda plano pelo painel; o cliente vê o que contratou.
**AC:**
- `/platform/orgs/[id]/plano`: plano atual, toggle por módulo (add-on / revogação **com `reason` obrigatório**), limites, status da assinatura. Salvar invalida o cache na hora.
- **Estende `PLATFORM_READABLE_TABLES`** (regra de crescimento de `900-22`) com `org_subscriptions`, `plans`, `plan_modules`, `org_module_grants` e `org_limit_overrides` — as tabelas que esta tela lê —, uma justificativa por tabela, no mesmo PR.
- `/dashboard/configuracoes/plano` como sub-módulo `configuracoes.plano` no `SUBMODULE_MAP` existente, só para `role='admin'` da org: plano, módulos inclusos, CTA de upgrade.
- **Sem lista de faturas nesta onda**: `tenant_invoices` só nasce em `900-43` (Onda 6). A seção de faturas é adicionada por `900-43`, na mesma story que cria a tabela. É a mesma correção da AC (b) de `900-25` — não exibir na Onda 3 o que só existe na Onda 6.
- **Esta story cria a assinatura da org**, que a Onda 2 deliberadamente não cria: `org_subscriptions` + `org_billing_periods` do ciclo corrente para as orgs já provisionadas, e `provision_org` passa a aceitar `p_plan_id` não-nulo. É aqui que o "sem plano, sem fatura" da Onda 2 termina.
- Toda mutação registra a trilha via `platform_audit()` — **que já existe desde 900-16**, com `REVOKE UPDATE, DELETE` aplicado no nascimento (B1). Nenhuma escrita de auditoria acontece em tabela mutável.
**Dep:** 900-28, 900-22 · **Est:** M · **Executor:** @dev

#### 900-32 — Trifold no plano `completo-interno` + verificação de NFR-2
**Objetivo:** provar que a camada está correta pelo melhor teste de regressão que existe: se a Trifold não perceber nada, está certo.
**AC:**
- Trifold recebe `completo-interno`; nenhum `if (orgId === TRIFOLD)` no código (grep de verificação).
- Checklist das 87 páginas do dashboard: nenhuma diferença de comportamento para usuários da Trifold.
- Trifold Sandbox com plano `crm` vê exatamente os módulos do tier 10.
- Downgrade → re-upgrade da Sandbox preserva dados **e** a configuração de `role_permissions`.
- **Herda a AC (b) de 900-25** (movida por ser insatisfazível na Onda 2): a Sandbox vê Pipeline/Leads/Imóveis e **não** vê Obras/Lançamentos.
**Dep:** **900-27a**, 900-29, 900-30, 900-31 · **Est:** **M** (o checklist das 87 páginas do dashboard não cabe em <1 dia-agente) · **Executor:** @qa

---

### Onda 4 — Medição de IA em shadow

> **Entrega:** sabemos quanto cada org consome, sem cobrar nem bloquear.
> **Critério de saída:** reconciliação de **±5%** contra `billing-collect-anthropic` por **14 dias consecutivos**.
> **Reversão:** `AI_QUOTA_ENFORCEMENT=off`.

#### 900-33 — Modelo de dados de consumo de IA + RPC de registro
**Objetivo:** três níveis de agregação para que o caminho quente da Nicole leia **exatamente uma linha**.
**AC:**
- `ai_usage_events` particionada por mês (append-only, retenção 13 meses, `UNIQUE (provider, provider_request_id, occurred_at) WHERE provider_request_id IS NOT NULL` para idempotência) e `ai_usage_daily` (rollup).
- **`org_billing_periods` já existe desde `900-26`** (Onda 3). Esta story **adiciona `cost_micro_usd` de forma aditiva** — mesmo padrão que `900-37` usa para `consumed_atendimentos`. Não recriar a tabela.
- RPC `record_ai_usage(p_event jsonb)` `SECURITY DEFINER SET search_path`: as três escritas na mesma transação.
- Cruzamentos de limiar idempotentes por `COALESCE(alert_80_at, CASE WHEN … THEN now() END)` — sem trigger extra e sem race (o `UPDATE` pega row lock).
- A RPC **não** notifica (banco não faz I/O externo).
- `ai_usage_events` com RLS **deny-all**; o cliente consome via `ai_usage_daily`.
- **Esta story grava por CHAMADA, não por atendimento.** `record_ai_usage` insere em `ai_usage_events` (com `cost_micro_usd`), faz o upsert em `ai_usage_daily` e soma `org_billing_periods.cost_micro_usd`. **Ponto.**
- **`consumed_atendimentos` está explicitamente FORA desta story** e é introduzida por 900-37. Motivo: incrementar um contador de atendimentos dentro de uma escrita por chamada exige saber se aquela chamada **abre** um atendimento novo ou **continua** um existente — que é exatamente a regra de contagem ainda pendente. Sem ela, ou o @dev inventa a janela dentro da RPC, ou a coluna nasce contando chamadas e é reinterpretada depois. **Reinterpretar contador de faturamento em produção é a mesma classe de bug que este epic recusa em ADR-003 quando rejeita entitlement materializado.**
- **Nomenclatura (fecha ambiguidade herdada do ADR-007):** a coluna de cota chama-se **`consumed_atendimentos`**, nunca `consumed_credits`. No ADR-007 §2 "crédito" = US$ 0,001 de custo real; aqui a unidade é atendimento. Como a tabela nasce do zero nesta story, o nome certo custa zero agora e evita que o mesmo identificador signifique duas coisas em dois documentos vivos — e que a diferença apareça numa linha de fatura.
- `ai_usage_events.cost_micro_usd` é registro **interno**: nenhuma policy o expõe ao cliente (a tabela é deny-all e `ai_usage_daily` não replica custo para leitura de cliente).
- **Consequência boa desta separação:** a Onda 4 inteira anda **sem** depender de resposta do Gabriel. A medição de custo, a reconciliação de ±5% e a tela de margem não precisam da regra de contagem.
**Dep:** 900-32 · **Est:** M · **Executor:** @data-engineer

#### 900-34 — Proxy de medição na fábrica do client + `ctx` nos 12 call sites
**Objetivo:** um único ponto de interceptação captura 100% do consumo. `new Anthropic(` aparece **apenas** em `packages/ai/src/client/anthropic.ts` — é sorte arquitetural que a Story 82-1 preparou.
**AC:**
- `packages/ai/src/usage/`: `AiUsageContext`, `AiUsageEvent`, `AiUsageSink`, `setAiUsageSink`/`getAiUsageSink` (default no-op).
- `createAnthropicClient(ctx?)` retorna client embrulhado por `withUsageMetering` quando há `ctx`; **`ctx` opcional de propósito** (migração incremental; esquecer um não quebra nada — NFR-4).
- Streaming coberto: `usage` acumulado de `message_delta`/`message_stop` e registrado no fim do stream.
- `createOpenAIClient(ctx)` equivalente para os embeddings do RAG.
- Sink Supabase em `lib/revenue/ai-usage-sink.ts` com `try/catch` que **nunca relança**; registrado uma vez no boot.
- **NFR-9:** rota request-scoped usa `after()` do `next/server`; webhook e cron dão `await` no insert.
- `ctx` nos 12 call sites; price table versionada por `effective_from` em `lib/revenue/ai-price-table.ts`, com comentário cruzado obrigatório para `lib/billing/subscriptions/price-table.ts` (Epic 78, domínio diferente).
- `AI_QUOTA_ENFORCEMENT=shadow` gravado por `vercel-env-set.sh`; valor não reconhecido ⇒ `off`.
- Regra **R11** do gate ativada.
- **QA gate reforçado (R3):** se o proxy lançar, a Nicole para. Teste do caminho de falha obrigatório.
**Dep:** 900-33 · **Est:** G · **Executor:** @dev

#### 900-35 — `/platform/orgs/[id]/ia` + `/platform/usage` **com margem por org**
**Objetivo:** dar à Trifold a visão de consumo **e de margem por org**. Esta tela é a razão de D11 existir: sem ela, o custo é coletado e ninguém olha.
**AC:**
- Gráfico diário de atendimentos, breakdown por feature e modelo.
- **Estende `PLATFORM_READABLE_TABLES`** com `ai_usage_daily` e `org_billing_periods` (regra de `900-22`).
- **`/platform/usage` exibe margem por org, não só consumo** — obrigatório, não opcional: custo real do ciclo (`org_billing_periods.cost_micro_usd`) ao lado da receita contratada do plano, com a margem resultante por org e ordenação que traz **as orgs deficitárias primeiro**.
- Margem visível **desde a Onda 4**, antes de qualquer cobrança — é o que permite corrigir preço com dado antes da renovação (mitiga R7 e R12).
- Custo real **nunca** aparece em tela de cliente; só em `/platform`.
- `/platform/usage` agrega cross-org; só via `platformQuery()` — **que já existe desde `900-22`**, com a lista ampliada aqui para incluir `ai_usage_daily` e `org_billing_periods`.
- Nenhuma PII de lead nessas telas (`PLATFORM_READABLE_TABLES`).
**Dep:** 900-34 · **Est:** M · **Executor:** @dev

#### 900-36 — Reconciliação com o oráculo do Epic 78 (gate de saída da onda)
**Objetivo:** validar a medição contra tráfego real de produção **sem staging**. O cron `billing-collect-anthropic` já conhece o gasto real total da Trifold na Anthropic — é um teste de integração de graça.
**AC:**
- Job/relatório que compara, por período, o total medido em `ai_usage_events` com o valor coletado pelo Epic 78.
- **Critério de saída da onda:** dentro de **±5%** por 14 dias consecutivos.
- Divergência maior ⇒ investigar call site sem `ctx` ou price table errada. **Não avançar para a Onda 5**: nos dois casos, cobrar seria errado.
- Resultado registrado no epic antes de qualquer mudança de enforcement.
**Dep:** 900-34 · **Est:** P · **Executor:** @qa

---

### Onda 5 — Cota, alertas e enforcement

> **Entrega:** a cota vale.
> **Critério de saída:** alerta de 80% disparado e recebido em teste real; simulação de 100% em `degrade` e em `hard_stop` **sem exceção não tratada no caminho da Nicole**.
> **Reversão:** `AI_QUOTA_ENFORCEMENT=off` (env var, sem deploy).
> **Marco:** 💰 **cobrável corretamente ao fim desta onda.**

#### 900-37 — Unidade de venda "atendimento": definição contável e contador do ciclo
**Objetivo:** materializar D9. A cota é vendida em atendimentos; o contador tem de ser objetivo e auditável pelo cliente.
**AC:**
- Regra de contagem de "atendimento" definida e documentada (janela por lead? por conversa? handoff conta? follow-up automático conta?) — **decisão de produto, não de implementação**.
- **Esta story introduz `org_billing_periods.consumed_atendimentos`** (migration aditiva) e o incremento correspondente na RPC `record_ai_usage`, que 900-33 deixou deliberadamente de fora. A UI do cliente exibe a mesma unidade do contrato, sem tradução nem estimativa.
- Contador idempotente: reprocessar não duplica atendimento.
- **D11:** `cost_micro_usd` continua sendo somado em paralelo ao contador de atendimentos, **invisível ao cliente**, visível no `/platform`. O contador de venda e o de custo são independentes: um bug em um não corrompe o outro.
**Desbloqueada por D11** (2026-07-30). Resta a **regra de contagem de atendimento**, que é resposta do dono do produto e é a primeira AC desta story — o @sm pode draftar o resto e deixar a regra como campo a preencher, mas a story não vai para `Ready` sem ela.
**Dep:** 900-36 · **Est:** M · **Executor:** @pm (regra) + @dev

#### 900-38 — `checkAiQuota` + `pickModel(tier, verdict)` + desligamento de flows opcionais
**Objetivo:** o gate no caminho quente, lendo **uma linha** com cache de 30s.
**AC:**
- `checkAiQuota(orgId)` com vereditos `normal | warn | degrade | overage | blocked`; cache 30s, tag `quota-${orgId}`.
- `pickModel(tier, verdict)`: degradação Sonnet→Haiku onde a qualidade tolera — viável porque `ANTHROPIC_MODELS` já é centralizado (Story 82-1).
- `blocked`: **não chama LLM**; envia mensagem estática de handoff e cria alerta para o corretor.
- `degrade`: flows opcionais (behavior-analysis, memory-extraction, post-visit-followup, enrich) desligados; Nicole continua respondendo.
- `plans.ai_hard_cap_multiplier` (default 3×) como válvula **independente da política comercial**: proteção contra loop de bug (a chave é da Trifold, a fatura é da Trifold).
- Teste do caminho de exceção: nenhuma exceção não tratada no caminho da Nicole em nenhum veredito.
**Desbloqueada por D12** (2026-07-30): política **`overage` para `active`** — a Nicole nunca para por cota e o excedente vai para a fatura; **`hard_stop` só em trial** (se houver trial — PEND-8 segue aberta, e sem trial esse ramo nasce sem uso); **hard cap de 3×** a cota como proteção da Trifold contra loop de bug, independente da política comercial.
- AC adicional de D12: `plans.ai_overage_policy` semeada como `overage` nos 3 tiers; o veredito `blocked` por `hard_cap` alerta a Trifold **com urgência** e é distinguível de `blocked` por `hard_stop` no log e no alerta.
**Dep:** 900-37 · **Est:** M · **Executor:** @dev

#### 900-39 — Cron `ai-quota-notify` + barra de consumo no dashboard do cliente
**Objetivo:** o cliente sabe onde está antes de estourar. Alertas em **atendimentos** (D9).
**AC:**
- Cron a cada 15 min varre `org_billing_periods` onde `alert_80_at IS NOT NULL AND alert_80_notified_at IS NULL` e dispara — mesmo padrão dos lembretes do Epic 78 (`service_billing_reminders_last_alerted`).
- Alertas de 80%, 100% e hard cap: e-mail + notificação in-app ao admin da org + alerta interno para a Trifold.
- Barra de consumo em `/dashboard/configuracoes/plano`, na unidade do contrato.
- Idempotência: um alerta por limiar por ciclo.
**Dep:** 900-38 · **Est:** M · **Executor:** @dev

#### 900-40 — `AI_QUOTA_ENFORCEMENT=on` com rollout escalonado
**Objetivo:** ligar o enforcement sem arriscar a operação da Trifold.
**AC:**
- Ordem obrigatória: **Trifold Sandbox → clientes → Trifold por último**.
- Trifold no plano `is_internal = true` com cota alta e hard cap generoso: bug de cálculo não para a operação da empresa.
- Env gravada por `vercel-env-set.sh` + `vercel redeploy` (mudança de env só vale após redeploy).
- Rollback em uma env var, testado antes do rollout.
**Dep:** 900-39, 900-36 · **Est:** P · **Executor:** @devops

#### 900-41 — 🔒 Faturamento do excedente de atendimentos
**Objetivo:** o excedente vira linha de fatura.
**AC:**
- `plans.ai_overage_tiers` populado com as faixas reais (preço por atendimento excedente; faixas decrescentes se houver), validado por CHECK de shape + Zod no `/platform`.
- `org_billing_periods.overage_atendimentos`/`overage_amount_cents` calculados por faixa.
- Linha `kind='ai_overage'` gerada por `buildInvoiceForPeriod` (900-43).
**🔒 BLOQUEADA por PEND-1b** (preço do excedente e existência de faixas decrescentes). Sem isso `ai_overage_tiers` fica vazio e **o excedente não é faturável** — a Onda 5 não fecha.
**Dep:** 900-38 · **Est:** M · **Executor:** @pm (valores) + @dev

---

### Onda 6 — Painel completo, faturamento interno e auditoria (5 stories: 900-42a, 900-42b, 900-43, 900-44, 900-46 — 900-45 removida por D14)

> **Entrega:** a Trifold opera o SaaS sem SQL manual.
> **Critério de saída:** um ciclo de faturamento fechado de ponta a ponta para a Trifold Sandbox, **sem intervenção em banco**.

#### 900-42a — Mecanismo de plataforma: `withPlatformAdmin`, níveis e `platformQuery()`
**Objetivo:** o aparato que torna o `/platform` auditável e contido. **Totalmente especificado e desbloqueado** — depende de *existir uma lista*, não de saber qual é.
**AC:**
- `withPlatformAdmin(handler, { level, action })` embrulha **toda** rota de `app/api/platform/**`: autentica → checa `platform_admins` (não-revogado, nível suficiente) → executa → grava trilha via `platform_audit()` com before/after em qualquer método ≠ GET. **Auditoria por decorador, não por disciplina do dev.**
- Níveis: `support` (lê tudo do plano de plataforma), `operator` (+ criar org, mudar plano/limites, emitir e dar baixa em fatura), `owner` (+ gerir `platform_admins`, editar planos).
- **Esta story CONSOLIDA E AUDITA a `PLATFORM_READABLE_TABLES`** — não a cria e não a entrega. A constante nasce em `900-22` e cresce incrementalmente por `900-31`, `900-35` e `900-44`, cada uma acrescentando as tabelas da própria tela (regra de crescimento de `900-22`). Aqui ela é: revisada entrada por entrada, com a justificativa de cada tabela conferida contra o que a tela realmente lê; limpa de entradas órfãs (tabela na lista que nenhuma tela consulta); e congelada contra crescimento silencioso.
- Comentário obrigatório no topo do arquivo: *"lista PROVISÓRIA — consolidada em 900-42a, fechada por 900-42b quando PEND-4 for respondida."*
- **A lista consolidada aqui ainda não é a resposta de PEND-4** — é o retrato auditado do que o produto passou a ler. `900-42b` a confronta com a decisão do dono do produto e a fecha.
- `platformQuery(table, orgId)` — **criada em `900-22`** — é endurecida aqui: rejeição em runtime contra a lista vigente, `select` explícito de colunas, nunca `select('*')` em `users`, e a regra R12 do gate passando a cobri-la.
- Teste que varre `app/api/platform/**` procurando `.from("…")` fora da lista. Regra **R12** do gate ativada.
- `platform_audit_log` e `platform_audit()` **já existem desde 900-16** — esta story consome, não cria.
- **Esta story é draftável e entregável sem a resposta do Gabriel.** O mecanismo depende de *existir uma lista*, não de saber qual é — e o bullet acima garante que existe uma. O que depende da decisão é o **conteúdo** da lista, isolado em `900-42b`.
**Dep:** 900-32 · **Est:** M · **Executor:** @dev

#### 900-42b — 🔒 A lista: o que o super-admin pode ver de um cliente
**Objetivo:** definir `PLATFORM_READABLE_TABLES`. **⚠️ D14 transformou o peso desta story.** Sem impersonation, esta lista não é mais a fronteira "fora do acesso privilegiado" — é a **totalidade** do que a Trifold consegue ver de um cliente, e portanto a totalidade da capacidade de suporte. Ver §3.2 e o risco R16.
**AC:**
- `PLATFORM_READABLE_TABLES` fechada conforme a resposta de PEND-4, com **justificativa por tabela** e revisão obrigatória de @po.
- Colunas sensíveis de `users` filtradas por `select` explícito.
- Qualquer alargamento futuro da lista exige diff revisável e justificativa — nunca crescimento silencioso.
**Ponto de partida declarado, que NÃO é a resposta:** a §3.4 da arquitetura lista 16 tabelas (`organizations`, `users`, `roles`, `role_permissions`, `org_subscriptions`, `plans`, `plan_modules`, `org_module_grants`, `org_limit_overrides`, `org_billing_periods`, `ai_usage_daily`, `tenant_invoices`, `tenant_invoice_lines`, `org_integrations`, `kanban_stages`, `platform_audit_log`). **Ela foi desenhada sob a premissa de que a impersonation existia como válvula de escape** — o texto original diz que o proibido é o que o `/platform` não vê *"nunca, sem impersonation auditada"*. Com D14 o qualificador caiu e os itens proibidos viraram **inacessíveis, ponto**. A lista está textualmente idêntica e **funcionalmente diferente**: serve de partida, não de resposta.
**🔒 BLOQUEADA por PEND-4.** Não desenhar a lista antes da resposta, e não arbitrá-la — é decisão do dono do produto.
**Dep:** 900-42a · **Est:** P · **Executor:** @pm (decisão) + @dev (implementação)

#### 900-43 — Faturas internas + `ManualBillingProvider`
**Objetivo:** a fatura interna é o **modelo canônico**; um gateway futuro é só um espelho dela (ADR-006, D2).
**AC:**
- `tenant_invoices` + `tenant_invoice_lines` conforme §2.6, com `UNIQUE (org_id, period_start)`.
- `buildInvoiceForPeriod(orgId, period)` como **função pura** sobre `org_billing_periods` + `plans` + `org_module_grants`, com o resultado persistido. **Proibido** gravar linha de fatura direto de uma tela — a fatura tem de ser reproduzível e auditável.
- Interface `TenantBillingProvider` + `ManualBillingProvider` (`ensureCustomer` no-op, `issueInvoice` marca `issued` e dispara e-mail com PDF gerado internamente, `syncInvoiceStatus` lê o que o operador marcou).
- Factory `getBillingProvider(subscription.billing_provider)`; **nenhuma regra de negócio** (excedente, entitlement, suspensão) sabe qual provider está ativo (NFR-7).
- **Esta story adiciona a seção de faturas a `/dashboard/configuracoes/plano`** (a tela nasceu em `900-31` sem ela, porque `tenant_invoices` não existia). Cliente vê as próprias faturas; RLS `org_id = user_org_id() AND is_admin()`.
- Exportação CSV; geração do ciclo em lote.
**Dep:** 900-42a, 900-41 · **Est:** G · **Executor:** @dev

#### 900-44 — `/platform` completo
**Objetivo:** operar sem SQL manual.
**AC:**
- `/platform` (overview: nº de orgs por status, MRR contratado, orgs >80% de cota, orgs `past_due`, integrações em erro).
- `/platform/plans` (CRUD + composição de módulos + faixas de excedente, `owner` only).
- `/platform/invoices` (gerar ciclo em lote, marcar como paga, exportar CSV).
- `/platform/audit` (trilha filtrável por ator/org/ação/período).
- `/platform/admins` (`owner` only).
- `/platform/orgs/[id]/{usuarios,auditoria}`.
- Todas as rotas passam por `withPlatformAdmin` e `platformQuery` (`900-42a`).
- **Estende `PLATFORM_READABLE_TABLES`** com o que as 6 telas leem — `tenant_invoices`, `tenant_invoice_lines`, `platform_audit_log`, `platform_admins`, `org_integrations`, `kanban_stages` —, uma justificativa por tabela. É a maior extensão do epic e a que mais se aproxima do limite de PEND-4: se alguma dessas telas exigir tabela fora do escopo de metadados, **parar e escalar**, não alargar.
**Dep:** 900-43 · **Est:** G · **Executor:** @dev + @ux-design-expert

#### 900-45 — ~~Impersonation auditada~~ — **REMOVIDA por decisão de produto (D14, 2026-07-30)**

**O ID 900-45 fica permanentemente vago e NÃO deve ser reaproveitado.** Isto não é lacuna, esquecimento nem story esquecida no meio da numeração — é registro deliberado de uma remoção, para que ninguém reabra o assunto achando que caiu por descuido.

**O que foi cancelado:** `createImpersonationClient`, o overlay de impersonation em `getServerUser()`, o banner vermelho com cronômetro, a tabela `platform_impersonation_sessions`, o e-mail automático ao admin do cliente e os 7 controles do ADR-004.

**Por quê:** o dono do produto decidiu que a Trifold não terá capacidade de "ver como o cliente". Suporte opera apenas com metadados e agregados via `PLATFORM_READABLE_TABLES` (`900-42a` entrega o mecanismo; `900-42b` fecha a lista).

**Consequências, todas registradas em §3.2:** o ADR-004 fica parcialmente **rejeitado** — não superseded, porque nunca saiu de `Proposed` (a metade de `platform_admin` continua válida); `lib/auth.ts` sai da lista de arquivos de risco concentrado (R3 vai de três para dois arquivos); o risco R9 é eliminado e nasce o R16 (suporte cego); e diagnosticar problema específico de uma org fica **mais lento por desenho** — trade-off aceito explicitamente.

**Nenhuma outra story dependia de 900-45.** Verificado: a única menção era em 900-14, sobre reaproveitamento do wrapper de escopo, e essa story permanece obrigatória por razão própria (o piso das 166 rotas service-role).

#### 900-46 — Cron `subscription-lifecycle` (nunca suspende)
**Objetivo:** vencer trial, marcar `past_due` e alertar. **Suspensão é sempre manual** (D5).
**AC:**
- Cron diário: vence trial, marca `past_due`, invalida cache de entitlement.
- Alerta interno à Trifold quando uma org entra/permanece em `past_due` (limiar de dias → PEND-6).
- **O cron nunca escreve `status='suspended'`.** Suspensão só por ação de `operator`/`owner` no `/platform`, com `reason` e audit.
- Efeito de `suspended` conforme §4.3: só módulos core, IA bloqueada, automações pausadas, **usuário não deslogado** — vê tela de suspensão com faturas em aberto e contato da Trifold.
- `cancelled` (**D13**): só core, read-only, **90 dias de janela de export** a partir de `cancelled_at`, depois **exclusão definitiva**.
- **A exclusão tem de ser real e incluir o Storage.** `DELETE` em tabela não remove objeto de bucket: sem varrer o Storage, "exclusão definitiva" seria exclusão só do que é fácil de apagar, e o dado pessoal do cliente continuaria existindo — o pior tipo de falha de LGPD, porque é invisível e documentada como resolvida.
- **Depende de 900-13** (convenção de path `{org_id}/…`): com os objetos sob o prefixo da org, a exclusão é enumerável e verificável por prefixo. Sem 900-13, não há como provar que sobrou zero objeto — por isso a dependência é dura, não conveniência.
- Exclusão idempotente, com relatório do que foi apagado (contagem por tabela e por bucket) gravado em `platform_audit_log` **antes** de a org sumir.
- Nada é apagado antes dos 90 dias, e o export tem de estar disponível durante toda a janela.
- **Item externo ao código:** o prazo de 90 dias e a exclusão definitiva precisam constar do contrato de SaaS. Sem cláusula, apagar dado de cliente é risco jurídico mesmo estando certo tecnicamente (ver CON-10).
**Dep:** 900-43, **900-13** · **Est:** M · **Executor:** @dev + @data-engineer

---

### Onda 7 — Credenciais e integrações por tenant

> **Entrega:** o primeiro cliente com WhatsApp/Meta/Sienge próprios.
> **Disparador:** só necessária quando esse cliente existir.
> **É a onda de maior risco operacional:** webhook quebrado = lead perdido (R10).

#### 900-47 — `org_integrations` + Vault + `resolveIntegration` com fallback explícito
**Objetivo:** credencial por tenant sem env por cliente. Uma variável por cliente exigiria redeploy a cada venda — e o gotcha de `vercel env add` gravando vazio já causou 2 incidentes.
**AC:**
- `org_integrations` conforme §2.8: `config jsonb` com **só identificadores públicos**, `secret_ref` apontando para o Supabase Vault (ADR-005). **Nunca o segredo em `config`.**
- Índices UNIQUE de roteamento reverso: `(config->>'phone_number_id') WHERE provider='whatsapp'`, `(config->>'page_id') WHERE provider='meta_ads'`.
- View `org_integrations_public` sem `secret_ref`; RLS `org_id = user_org_id() AND is_admin()` sobre a view.
- `resolveIntegration(orgId, provider)`: credencial do tenant se `status='connected'`, senão env global **apenas** se o provider for marcado `platform_shared`. Fallback **explícito por provider, nunca implícito** — mantém a Trifold funcionando sem migração de credencial no dia 1.
- `platform_shared` por provider conforme §7.5: Anthropic/OpenAI **sempre global** (CON-8), `META_APP_SECRET` global, Resend global com `from_domain` por org, Telegram global, Supremo/ClickSign global até um cliente precisar.
**Dep:** 900-44 · **Est:** M · **Executor:** @dev + @data-engineer

#### 900-48 — Roteamento reverso de webhook por tenant (WhatsApp e Meta), com dual-run
**Objetivo:** o cliente traz o próprio número/WABA (D10). Webhook roteado para a org errada é o cenário crítico.
**AC:**
- `api/webhook/whatsapp` resolve por `phone_number_id`; `api/webhooks/meta-ads` resolve por `page_id`.
- **Dual-run** antes do cutover: resolve pelos dois caminhos, usa o legado, loga divergência (mesmo padrão de 900-20).
- Não encontrou ⇒ **200 + log**, nunca adivinhar org (NFR-12).
- Monitorado pelo cron `webhook-health` já existente; alerta em qualquer divergência.
- Zero lead perdido durante o cutover (contador antes/depois no PR).
**Dep:** 900-47, 900-24 · **Est:** G · **Executor:** @dev

#### 900-49 — Sienge e Resend por org + `/platform/orgs/[id]/integracoes`
**Objetivo:** onboarding de integração por cliente, operável pelo painel.
**AC:**
- Sienge 100% por org no Vault (cliente sem Sienge não tem a integração).
- Resend: `RESEND_API_KEY` global + `from_domain` por org com verificação de domínio.
- `/platform/orgs/[id]/integracoes`: status por provider, `last_error`, `last_check_at`, ação de reconectar.
- (O item "convite de usuário só cria usuário na org de quem convida" **saiu desta story e foi para 900-22**, Onda 2 — ver justificativa lá.)
**Dep:** 900-47 · **Est:** M · **Executor:** @dev

---

### Onda 8 — Gateway de pagamento (sob demanda)

> **Disparador:** volume de clientes que torne a cobrança manual custosa. **Não é escopo agora** (D2).

#### 900-50 — Provider de gateway contra a interface existente
**Objetivo:** trocar `manual` por Asaas/Stripe registrando outra implementação no factory. **Nenhuma regra de negócio muda.**
**AC:**
- `AsaasBillingProvider` (ou Stripe) implementando `TenantBillingProvider` integralmente.
- `tenant_invoices.provider_*` preenchidos; `syncInvoiceStatus` reconcilia.
- Teste que prova que `buildInvoiceForPeriod` produz o mesmo resultado com qualquer provider.
- Nenhum arquivo de entitlement, cota ou suspensão alterado (verificado no diff).
**Dep:** 900-43 · **Est:** M · **Executor:** @dev

---

## 11. Sequenciamento e caminho crítico

```
PRE-0 (PR #308 em produção)
  └─ 900-1 ─ 900-2 ──┬─ [900-4 900-5 900-6 900-7] ─────────────────┐   (Lote 1 — paralelo)
                   ├─ 900-8 ─ 900-9 ─ 900-10 ───────────────────┤   (policies por domínio)
                   ├─ 900-11 ─ 900-12 ─ 900-13 ─────────────────┤   (Lote 2 — Storage)
                   ├─ 900-14 ─ 900-15 ────────────────────────┤   (Lote 3 — piso de código)
                   ├─ 900-16 ────────────────────────────────┤   (platform_admin / P4)
PRE-1 ─ 900-3 ──────┴─ 900-17 ──────────────────────────────────┴─ 900-18  ← gate bloqueante, baseline=0
                                                                   │
  900-19 ─ 900-20 ─ 900-21 ─ 900-22 ─ 900-23 ─ 900-24 ─ 900-25 ───────────┤   ONDA 2
                                                                   │
  900-26 ─ 900-27a ─┬─ 900-27b🔒 (preço) ─┐                          │
                  └─ 900-28 ─ 900-29 ─ 900-30 ─ 900-31 ─┴─ 900-32 ─────┤   ONDA 3 (🟢 vendável só com 27b)
                                                                   │
  900-33 ─ 900-34 ─ 900-35 ─ 900-36 ────────────────────────────────────┤   ONDA 4 (±5% × 14d)
                                                                   │
  900-37 ─ 900-38 ─ 900-39 ─ 900-40 ─ 900-41🔒 ────────────────────────┤   ONDA 5 → 💰 COBRÁVEL
                                                                   │
  900-42a ─┬─ 900-42b🔒 (lista/PEND-4)                              │
          └─ 900-43 ─ 900-44 ─ 900-46   (900-45 removida por D14) ────┤   ONDA 6
                                                                   │
  900-47 ─ 900-48 ─ 900-49  (sob demanda)    900-50  (sob demanda) ────┘   ONDAS 7-8
```

**Caminho crítico (a corrente mais longa, sem folga):**

```
900-1 → 900-2 ─┬─ 900-8 → 900-9 → 900-10 ──┐
   (PRE-0     ├─ 900-11 → 900-12 → 900-13 ┤   ← Storage: corrente longa, e 900-46 depende de 900-13
    trava      ├─ 900-14 → 900-15 ────────┤
    o 900-2)    └─ 900-17 (PRE-1) ────────┴→ 900-18   ← gate bloqueante, baseline = 0
   → 900-19 → 900-20 → 900-21 → 900-22 → 900-24 → 900-25
   → 900-26 → 900-27a → 900-28 → 900-31 → 900-32        ← fim da Onda 3
   → 900-33 → 900-34 → 900-36
   → 900-37 → 900-38 → 900-39 → 900-40                 ← enforcement de cota

Marcos comerciais, que NÃO estão no caminho crítico técnico:
  🟢 vendável  = fim da Onda 3 **+ 900-27b** (preço)  → travado por PEND-1 e PEND-1c
  💰 cobrável  = fim da Onda 5 **+ 900-41** (excedente) → travado por PEND-1b
```

As três correntes paralelas da Onda 1 (policies, Storage, piso de código) foram omitidas do caminho crítico anterior, assim como 900-27a. A corrente de Storage é a mais longa das três e é a que dita, na prática, quando 900-18 fecha.

**Onde o paralelismo existe de verdade:** os quatro lotes da Onda 1 (Lote 1, policies por domínio, Storage, piso de código) são independentes **entre si** e podem correr em paralelo — é exatamente o que a catraca do baseline habilita (mitigação do R11).

**Correção importante sobre o Storage.** Uma versão anterior deste epic dizia que "o Storage não bloqueia 900-18", o que contradizia o próprio `Dep:` de 900-18 (**"900-4 … 900-17, todas"**). **Vale o `Dep:`: 900-11/12/13 estão dentro da Onda 1 e bloqueiam 900-18.** A frase anterior estava errada e era perigosa por uma razão concreta: **900-46 (exclusão pós-cancelamento, D13) depende duramente de 900-13** — sem a convenção de path `{org_id}/…`, a exclusão de Storage não é enumerável nem verificável por prefixo. Desescopar o Storage da Onda 1 com base naquela frase derrubaria silenciosamente a fundação da exclusão LGPD, quatro ondas depois e sem ninguém perceber.

**Pré-requisitos externos:**

Bloqueio **direto** e bloqueio **transitivo** são colunas separadas de propósito: até esta revisão a tabela só declarava o direto, e isso subestimava gravemente o que cada pendência congela. É a informação que decide o que o Gabriel precisa responder primeiro.

| ID | Pré-requisito | Bloqueio direto | **Bloqueio transitivo (fecho pelos `Dep:`)** | Estado |
|---|---|---|---|---|
| PRE-0 | Migration `209_hotfix_rls_org_scope.sql` (PR #308) **aplicada em produção** | **900-2** | tudo a partir de 900-2 | PR aberto em `hotfix/rls-org-scope-lote0`, QA PASS, **não aplicado**. **Não bloqueia 900-1** — criar a esteira de CI independe de migration aplicada |
| PRE-1 | Projeto Supabase descartável criado | 900-3, 900-17 | **900-18 e todas as ondas seguintes** — 900-18 depende de 900-17, e a Onda 2 inteira depende de 900-18. Sem o projeto, o epic **para no fim da Onda 1** | autorizado (D6), **não existe** |
| PRE-2 | Não existe CI nem husky | 900-1 é criação do zero | — | fato verificado |
| PRE-3 | Preço dos 3 tiers (PEND-1) + cota por tier (PEND-1c) + excedente (PEND-1b) | **900-27b, 900-41** | **apenas essas duas**, depois da quebra 27a/27b. Antes da quebra o fecho era de **20 stories** (900-27 → 900-32 → Ondas 4-8) | PEND-1, PEND-1b, PEND-1c |
| PRE-4 | Contrato de operador de dados (LGPD) | faturamento do 1º cliente | — | jurídico, fora do escopo técnico (CON-10) |
| PRE-5 | **PEND-4 respondida** | 900-42b | nenhuma story existente — mas a resposta pode **criar** uma story G de acesso pontual (§2.2). Precisa chegar **antes de a Onda 6 ser planejada**, não antes de começar | aberta |

---

## 12. Compatibility Requirements

- [ ] Nenhuma story exige janela de indisponibilidade. A Nicole atende leads reais durante todo o epic (CON-3).
- [ ] Toda mudança que toca dado existente segue expand → migrate (dual-run) → cutover → contract (NFR-1).
- [ ] Migrations começam em **238** e são backward-compatible; `CONCURRENTLY` em arquivo `_remote_only.sql` (NFR-14).
- [ ] Toda migration de policy traz o `DROP/CREATE` reverso documentado no próprio arquivo (NFR-8).
- [ ] Nenhuma assinatura pública existente é quebrada: `canAccess()` permanece booleana; `createAnthropicClient()` mantém `ctx` opcional.
- [ ] UI segue os padrões existentes (App Router em `packages/web/src`, tema claro/escuro, absolute imports).
- [ ] `lib/billing/**` e as tabelas do Epic 78 permanecem intocadas, exceto a re-ancoragem de policy em 900-16.
- [ ] `packages/video`, `packages/shared`, `packages/bot` sem mudança de tenancy.

## 13. Definition of Done (Epic)

- [ ] Gate `pnpm gate:tenancy` **bloqueante e verde**, baseline em zero, ressalva de cobertura impressa no relatório.
- [ ] Testes cross-tenant passando no CI contra o Supabase descartável, incluindo o caso de INSERT com `org_id` forjado.
- [ ] Zero UUID de org hardcoded em `packages/web/src` (grep de verificação).
- [ ] Nenhuma policy de Storage sem escopo de org; nenhum bucket com PII público.
- [ ] Regra ESLint `aios/no-unscoped-admin-client` em `error`, com allowlist justificada entrada por entrada.
- [ ] 5 tabelas de custo interno do Epic 78 inacessíveis a `authenticated` — verificado **antes** da primeira conta admin de cliente.
- [ ] Org "Trifold Sandbox" provisionada pelo `/platform` e passando os 5 itens do teste de aceitação, re-executado a cada onda.
- [ ] A Trifold no plano `completo-interno` **sem perceber nenhuma diferença** (NFR-2), nenhum `if (orgId === TRIFOLD)` no código.
- [ ] Downgrade e re-upgrade preservam dado **e** configuração de permissão.
- [ ] Reconciliação de consumo de IA dentro de ±5% por 14 dias consecutivos.
- [ ] Cota em atendimentos/mês valendo, com alertas de 80% e 100% recebidos em teste real.
- [ ] **Margem por org visível em `/platform/usage`** (D11), com as orgs deficitárias ordenadas primeiro — e custo real nunca exposto em tela de cliente.
- [ ] **Nenhum código de impersonation no repo** (D14): sem `createImpersonationClient`, sem overlay em `getServerUser()`, sem `platform_impersonation_sessions`. Verificado por grep.
- [ ] `PLATFORM_READABLE_TABLES` fechada com PEND-4 respondida, **com justificativa por tabela** — é o único acesso da Trifold a dado de cliente.
- [ ] **Toda tabela, função e constante citada em alguma AC tem uma story que a cria**, e todo artefato incremental tem a coluna "estendido por" preenchida na §10.1 — verificação de provenance de artefato, não só do grafo `Dep:`.
- [ ] `platform_audit_log` nasceu append-only **na mesma migration que a criou** (900-16), nunca existiu mutável.
- [ ] Exclusão pós-cancelamento (90 dias, D13) apaga **tabelas e Storage**, com relatório por prefixo de org gravado em auditoria antes de a org sumir.
- [ ] Um ciclo de faturamento fechado de ponta a ponta para a Trifold Sandbox, sem intervenção em banco.
- [ ] `platform_audit_log` imutável, com trilha de toda mutação de `/platform`.
- [ ] Sem regressão em nenhuma das 87 páginas do dashboard nem no caminho da Nicole.

---

## 14. Decisões pendentes — perguntas objetivas para o Gabriel

Ordenadas por quanto bloqueiam trabalho. **Nenhum valor foi inventado para nenhuma delas** (Constitution, Artigo IV).

### Resolvido — não precisa da sua atenção

**PEND-0 — Numeração deste epic. RESOLVIDO em 2026-07-30, sem escalar.**
Este epic é o **86**. Os prefixos 84 e 85 já estavam ocupados por dois fixes pontuais não relacionados. A decisão é mecânica e o custo é assimétrico: renomear antes de qualquer story existir é trivial; depois de 50 draftadas, é retrabalho em cascata. Detalhe em §0.1.

### Bloqueia a Onda 3 — e trava o marco "vendável"

**PEND-1 — Preço de cada um dos 3 tiers.**
`plans.monthly_price_cents` e `setup_fee_cents` de CRM (10), CRM+Marketing (20) e Completo (30).

**PEND-1c — Quantos atendimentos/mês cada tier inclui.** *(nova — a pergunta que faltava)*
É um **terceiro número**, distinto dos outros dois, e não estava sendo perguntado em lugar nenhum: PEND-1 é preço, PEND-1b é excedente, e a Q8 da arquitetura só define composição de módulos. A cota por tier não aparecia em nenhuma pendência, enquanto a AC da story mandava preencher "os valores reais" — a armadilha do Artigo IV escrita dentro da story que carrega o cadeado do Artigo IV. Sem PEND-1c, `plans.ai_quota_atendimentos` não pode ser semeada.

Juntas, PEND-1 e PEND-1c travam **900-27b** e, com ela, o marco **"vendável"**. Não travam mais o resto da Onda 3: a quebra de 900-27 em **27a** (catálogo e composição, livre) e **27b** (preços e cotas, 🔒) tirou 18 stories do fecho transitivo desses dois números.

### Bloqueia a Onda 5 — e trava o marco "cobrável"

**PEND-1b — Preço do atendimento excedente.**
Preço por atendimento acima da cota, e **se há faixas decrescentes** (ex.: os primeiros N excedentes a X, os seguintes a Y). Sem isso `ai_overage_tiers` fica vazio, o excedente **não é faturável** (story 900-41) e a cobrança correta não fecha.

**Também de sua alçada, em 900-37: a regra de contagem de atendimento.**
Uma conversa por lead com janela de N horas? Cada chamada de `nicole.chat`? Follow-up automático conta? Handoff conta? É a unidade que o cliente vai auditar na fatura — não posso derivá-la da arquitetura. Com D11 aprovada, é o que resta para a Onda 5 poder ser draftada por inteiro.

### Bloqueia a Onda 6 — e agora pesa mais do que pesava

**PEND-4 — O que o super-admin pode ver de um cliente. Ponto.**

A pergunta mudou de natureza com D14. Antes era "o que o super-admin vê **fora** da impersonation" — uma fronteira de privacidade, com a impersonation como válvula de escape para os casos difíceis. **Agora é "o que o super-admin vê, e não há mais nada além disso".** `PLATFORM_READABLE_TABLES` virou o mecanismo único de suporte da Trifold sobre dados de cliente.

O que preciso decidido:

1. O `/platform` fica **estritamente** em metadados e agregados — identidade da org, assinatura, consumo, contagens, status de integração, roles e stages — **sem nenhum** acesso a PII de lead, conteúdo de mensagem, documento, ou financeiro do Sienge?
2. Existe caso de suporte real que exija ver o conteúdo ("a Nicole respondeu errado, me mostra a conversa")? Se existir, **modelo como pedido de acesso pontual com aprovação do cliente** — nunca como alargamento silencioso da lista.

**Ponto de partida que existe, e por que ele não é resposta:** a §3.4 da arquitetura já lista 16 tabelas. Mas ela foi escrita sob a premissa de que a impersonation existia — o texto diz que o proibido é o que o `/platform` não vê *"nunca, **sem impersonation auditada**"*. Com D14 o qualificador caiu: a lista está textualmente igual e **funcionalmente diferente**. Serve de partida; não arbitro a resposta.

**Contingência que precisa da sua ciência:** se a resposta a (2) for **sim**, nasce uma **story G nova** — pedido, justificativa, aprovação do admin do cliente, escopo, TTL, revogação, trilha imutável — ou seja, quase os mesmos 7 controles do ADR-004 que você acabou de rejeitar, com a aprovação deslocada do operador para o cliente. Por isso PEND-4 precisa ser respondida **antes de a Onda 6 ser planejada**, não antes de começar: a resposta muda o tamanho da onda. Deixei o mecanismo **explicitamente fora de escopo** na §2.2, em vez de escondido como cláusula condicional dentro da AC de outra story.

**Trade-off que você já aceitou ao decidir D14, registrado para ficar explícito:** diagnosticar problema específico de uma org fica **mais lento por desenho**. O caminho passa a ser metadados → perguntar ao cliente → pedido de acesso pontual. O ganho é que não existe backdoor para auditar, porque não existe backdoor. O risco novo é o R16 (suporte cego): lista curta demais e o cliente fica sem resposta; larga demais e é PII de terceiro exposta **sem** a trilha de justificativa que a impersonation dava.

**PEND-6 — Dias em `past_due` antes do alerta interno.**
A suspensão é manual (D5, fechado). Falta o limiar: quantos dias em `past_due` antes de o cron alertar a Trifold? Sugestão da arquitetura: 10 dias. Baixo impacto — 900-46 pode ser draftada com o número como campo a preencher.

### Não bloqueia, mas quero seu aval

**PEND-8 — Existe trial no modelo comercial?**
O status `trial` está modelado e `provision_org()` precisa saber com qual status criar a assinatura. Ficou mais consequente com D12: o `hard_stop` de IA foi confirmado **só para trial** — se não houver trial, esse ramo nasce sem uso e a política efetiva é `overage` para todo mundo, com o hard cap de 3× como única trava.

**PEND-9 — Nomes dos domínios.**
Confirma `lib/tenancy/` (quem é o tenant e o que contratou) e `lib/revenue/` (o que a Trifold recebe), mantendo `lib/billing/` **reservado** para o custo interno do Epic 78? Se preferir outro par, é agora — depois vira renomeação de ~30 arquivos.

### Quadro-resumo: o que cada pendência trava, depois das correções

| Pendência | Trava | Marco afetado |
|---|---|---|
| **PEND-1** — preço dos 3 tiers | `900-27b` | 🟢 vendável |
| **PEND-1c** — cota de atendimentos/mês por tier *(nova)* | `900-27b` | 🟢 vendável |
| **PEND-1b** — preço do excedente + faixas | `900-41` | 💰 cobrável |
| **Regra de contagem de atendimento** | `900-37` (não mais `900-33` — a Onda 4 anda sem ela) | 💰 cobrável |
| **PEND-4** — o que o super-admin vê | `900-42b`, e pode **criar** uma story G nova | planejamento da Onda 6 |
| **PEND-6** — dias em `past_due` | `900-46` (campo a preencher, não bloqueia draft) | — |
| **PEND-8** — existe trial? | `900-21` (parâmetro, não bloqueia draft) | — |
| **PEND-9** — nomes `lib/tenancy`/`lib/revenue` | nada; renomeação de ~30 arquivos se mudar depois | — |
| **PRE-1** — Supabase descartável | `900-3`, `900-17` → **e o epic inteiro a partir de 900-18** | todos |
| **PRE-0** — PR #308 em produção | `900-2` (**não** `900-1`) | todos |

### Resolvidas — registro, não pergunta

| ID | Pergunta | Resposta | Data | Desbloqueou |
|---|---|---|---|---|
| PEND-0 | Numeração do epic | Epic **86** (84/85 ocupados por fixes pontuais) | 2026-07-30 | @sm pode draftar |
| PEND-2 | Medir custo real por baixo da venda em atendimento? | **Sim** → D11 | 2026-07-30 | 900-33, 900-34, 900-35, 900-37 |
| PEND-7 | Política no 100% da cota | **`overage`** para `active`, `hard_stop` em trial, hard cap 3× → D12 | 2026-07-30 | 900-38 |
| PEND-5 | Retenção pós-cancelamento | **90 dias de export, depois exclusão definitiva** → D13 | 2026-07-30 | 900-46 |
| PEND-3 | Impersonation | **Não haverá** → D14 | 2026-07-30 | Removeu 900-45; ver §3.2 |

---

## 15. Handoff para o Story Manager (@sm)

"Desenvolver as stories detalhadas do Epic 900 (SaaS Multi-Tenant). Considerações-chave:

- **Este epic é o 86; as stories são `900-1` … `900-50`.** Os prefixos 84 e 85 pertencem a dois fixes pontuais não relacionados (`84-1-fix-created-by-auth-id-email`, `85-1-fix-subject-ausente-email-templates-api`) — não confundir nem sobrescrever.
- **As três stories com 🔒 são `900-27b`, `900-41` e `900-42b`.** Não draftar nenhuma delas: exigiriam inventar preço (PEND-1/PEND-1b), cota (PEND-1c) ou a lista de tabelas do `/platform` (PEND-4), e o Artigo IV proíbe. **`900-27a` e `900-42a` — as metades livres — estão liberadas**, e juntas destravam quase toda a Onda 3 e a Onda 6.
- **900-37 e 900-38 foram desbloqueadas** por D11 e D12. `900-37` ainda precisa da regra de contagem de atendimento antes de ir para `Ready` — mas **900-33 não precisa mais dela**: a Onda 4 inteira anda sem resposta do Gabriel, porque `consumed_atendimentos` saiu de 900-33 e nasce em 900-37.
- **Front de draft imediato: 27 stories.** Ondas 0, 1 e 2 inteiras (`900-1` … `900-25`, 25 stories) mais `900-27a` e `900-42a`. A Onda 2 ficou livre com a correção do ciclo O2↔O3 — ela não depende mais de nenhum artefato comercial. As demais stories não-🔒 (Ondas 3-8) também não têm furo de provenance nem cadeado; ficam gated por **ordem de entrega**, não por falta de informação.
- `900-1` pode começar **hoje** — não depende de PRE-0. `900-8`/`900-9`/`900-10` podem ser draftadas, mas **não promovidas a `Ready`** antes de 900-2 emitir `rls-gate-baseline.json`: a lista de tabelas de cada lote é a partição desse arquivo. `900-3` e `900-17` idem, até PRE-1 existir.
### ⛔ Antes de draftar qualquer story — dois passos obrigatórios

Estes dois vinham enterrados no meio da lista de considerações e **falharam na primeira oportunidade**: ao draftar a Onda 0, quatro artefatos incrementais novos (`ci.yml`, `gate-tenancy.ts`, `tenancy-known-tables.json`, `tenancy-allowlist.yml`) nasceram sem entrar na §10.1, e quem pegou foi o @po. A regra existia; estava escondida. Por isso agora ela abre o handoff.

**Passo 1 — leia a §10.1 (Provenance de artefato).** Ela diz, para cada artefato, **onde nasce** e **quem o estende depois** — informação que as linhas `Dep:` não carregam.

**Passo 2 — ao terminar o draft, feche o ciclo em duas direções:**

| Situação | O que fazer |
|---|---|
| Sua story **cita** tabela/função/constante que **não está na §10.1** e é tocada por mais de uma story | **Pare e devolva ao @pm.** É defeito do epic, não coisa para resolver no draft |
| Sua story **cria** um artefato novo que outra story vai estender | **Devolva ao @pm para entrar na §10.1** com a coluna "estendido por". Vale para arquivo de config, workflow de CI e script — não só tabela de banco |
| Sua story **estende** um artefato incremental | **Declare a extensão na AC.** Vale especialmente para `PLATFORM_READABLE_TABLES` (regra de crescimento em `900-22`) e para `.github/workflows/ci.yml` (acrescentar job, nunca reescrever) |
| Sua story **quebra** em `a`/`b`/`c` | **Avise o @pm:** as linhas da §10.1 que apontam para o ID antigo precisam apontar para a sub-story certa. Aconteceu com `rls-gate-baseline.json`, que ficou dizendo `900-2` depois da quebra em `2a/2b/2c` |

**O ponto cego tem nome e é previsível:** artefato **incremental** — aquele cuja definição é fatiada entre ondas. `Dep:` ordena *stories*; a fatia de um artefato atravessa stories sem aparecer no grafo delas. Artefato atômico nunca deu problema neste epic; incremental deu **todas** as vezes.


- **`900-45` não existe** — removida por D14 (sem impersonation). O ID fica vago de propósito e não deve ser reaproveitado; a numeração salta de 900-44 para 900-46.
- **Ordem é lei:** nenhuma story de Onda 3+ entra antes de 900-18 (gate bloqueante e verde). Vender antes da Onda 1 é o único erro irrecuperável do epic.
- Migrations começam em **238** (reverificado em 2026-08-22); a numeração 193 citada na arquitetura está **três renumerações atrás**. São 259 arquivos `.sql` com 21 prefixos duplicados — ver §0.2, que agora traz o resultado real da aplicação do zero (233/237 OK, 4 falhas reais, drift bidirecional), não mais uma previsão.
- Toda story que toca dado existente precisa de fase dual-run explícita nas AC — é o que substitui o staging que não existe.
- **Dois** arquivos exigem QA gate reforçado e teste do caminho de falha: `lib/permissions.ts` (900-28) e `packages/ai/src/client/anthropic.ts` (900-34). `lib/auth.ts` saiu da lista com D14 — sem overlay de impersonation, este epic não toca `getServerUser()`.
- **Toda story G deve ser quebrada no draft** pela regra do §10 (mais de uma fase expand→migrate→contract ⇒ mais de uma story; janela de observação ⇒ story própria). Candidatas já mapeadas: 900-2, 900-12, 900-13, 900-20, 900-44, 900-48.
- Reuso obrigatório (IDS: REUSE > ADAPT > CREATE): `MODULE_LABELS`/`MODULE_DESCRIPTIONS` em 900-29; `unstable_cache` de `permissions.ts` em 900-28; padrão de lembrete do Epic 78 em 900-39; padrão de RLS de `131_imobiliarias.sql` em 900-16.
- Env vars **só** por `scripts/vercel-env-set.sh`/REST API; nunca `vercel env add` via stdin.
- Fluxo AIOS por story: `@sm *draft → @po *validate → @dev *develop → @qa *qa-gate → @devops *push`.

O epic preserva a operação da Trifold Engenharia em produção enquanto converte o CRM em SaaS vendável."
