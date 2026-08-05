# Validação PO — Epic 87 (SaaS Multi-Tenant)

- **Artefato:** `docs/stories/epics/epic-87-saas-multi-tenant.md` (1.213 linhas, 51 stories ativas)
- **Validador:** Pax (@po)
- **Rodada 1:** 2026-08-01 — 🔴 NO-GO (7,5/10), 6 bloqueantes + 13 melhorias
- **Rodada 2:** 2026-08-02 — 🟡 GO com ressalvas (9/10), 2 bloqueantes (F1, F2) + 3 correções
- **Rodada 3 (esta):** 2026-08-02 — checagem de delta F1-F5 → ✅ **GO**
- **Branch:** `hotfix/rls-org-scope-lote0` (PR #308 aberto) — nada commitado, nada editado no epic por nenhuma destas validações

---

# 🟢 Veredito final — GO

**F1, F2, F3, F4 e F5 verificados no arquivo. Os dois bloqueantes da rodada 2 estão fechados.**

Achei **uma aresta nova** (E1) e um resíduo de texto (E2), ambos na mesma constante e ambos com **uma única correção**. Não bloqueiam, por três razões que valem mais que a contagem:

1. **Não perdem artefato, não fecham ciclo, não escondem furo de segurança** — diferente de todos os defeitos das rodadas 1 e 2.
2. **Não tocam o front de draft imediato.** E1 atinge `87-31` e `87-44`, ambas fora das 27; a correção mora em `87-22`, que **está** no front e será draftada antes.
3. **Falham alto.** `platformQuery()` rejeita em runtime, no primeiro `pnpm dev`. Todos os defeitos anteriores falhavam em silêncio — tabela que não existe, trilha mutável, contador reinterpretado. Este grita.

O @sm pode começar. E1/E2 entram como ajuste no draft de `87-22`, ou como edição de 5 minutos do @pm antes dele.

---

## Delta verificado

| # | Correção | Evidência | Veredito |
|---|---|---|---|
| **F1** | `CREATE TABLE org_billing_periods` em `87-26` (linha 680, "a tabela nasce aqui"); `87-33` **adiciona** `cost_micro_usd` aditivamente com "já existe desde `87-26`" (linha 771); `org_entitlement_snapshot` (linha 681) agora lê tabela criada na própria story | linhas 680, 681, 771 | ✅ limpo |
| **F2** | `87-42a` declara lista provisória e "**draftável e entregável sem a resposta do Gabriel**" (linha 894) | linhas 889, 890, 894 | ✅ com E2 |
| **F3** | `platformQuery()` + `PLATFORM_READABLE_TABLES` nascem em `87-22` (linha 633), com o princípio escrito: *"o artefato nasce onde é primeiro usado, e é refinado depois"*. FR-28 atualizada (linha 265) | linhas 265, 633, 805, 891 | ✅ com E1 |
| **F4** | `87-31`: "**Sem lista de faturas nesta onda**", com o precedente da AC (b) de `87-25` citado; `87-43` fica com a seção **e** o `CREATE TABLE` | linhas 743, 910 | ✅ limpo |
| **F5** | Lápide agora diz "parcialmente **rejeitado** — não superseded, porque nunca saiu de `Proposed`" (linha 938); R16 e a lápide com sufixo | linhas 333, 936, 938 | ✅ menos 1 resíduo |

**Sobre o F3 — concordo que ele fez melhor que a minha sugestão.** Eu propus declarar `87-35` → `87-42a`; ele moveu o artefato para onde é primeiro usado. O argumento dele está certo e é o mesmo do B1: declarar a dependência documentaria a inversão de ondas em vez de removê-la. O princípio agora está escrito duas vezes no epic (`platform_audit_log` e `platformQuery`), o que o torna citável no próximo caso.

---

## 🟠 E1 (aresta nova) — a lista cresce em 5 stories e só 2 declaram o crescimento

O F3 acertou o **nascimento** da constante e não propagou o **crescimento** dela. `PLATFORM_READABLE_TABLES` não é artefato atômico: cada tela nova de `/platform` precisa das suas tabelas na lista, senão `platformQuery()` rejeita em runtime.

| Story | Onda | Telas de `/platform` que adiciona | Tabelas que essas telas leem | Declara o crescimento? |
|---|---|---|---|---|
| `87-22` | 2 | `/platform/orgs`, `/orgs/new` | `organizations`, `users` | ✅ cria com 2 |
| **`87-31`** | **3** | `/platform/orgs/[id]/plano` | `org_subscriptions`, `plans`, `plan_modules`, `org_module_grants`, `plan_limits` | ❌ **não** |
| `87-35` | 4 | `/orgs/[id]/ia`, `/platform/usage` | `ai_usage_daily`, `org_billing_periods` | ✅ (linha 805) |
| `87-42a` | 6 | — (mecanismo) | consolida 7 tabelas | 🟡 ver E2 |
| **`87-44`** | **6** | `/plans`, `/invoices`, `/audit`, `/admins`, `/orgs/[id]/{usuarios,auditoria}` | `tenant_invoices`, `tenant_invoice_lines`, `platform_audit_log`, `platform_admins`, `roles`, `kanban_stages` | ❌ **não** |

Efeito prático: a tela de plano de `87-31` bate em `platformQuery()` com a lista de duas tabelas de `87-22` e é rejeitada — ou o @dev contorna `platformQuery()` naquela rota, que é pior, porque esvazia o mecanismo justamente onde ele deveria valer.

Há ainda uma contradição literal: o comentário de topo prescrito em `87-22` diz *"lista PROVISÓRIA — fechada por 87-42b; **não alargar aqui**"*, mas o epic prescreve alargá-la em `87-35`, `87-42a` e (necessariamente) em `87-31` e `87-44`. A regra que o @pm claramente quer dizer é outra: **só alargar junto com a tela que lê a tabela, nunca preventivamente.**

## 🟡 E2 — `87-42a` ainda diz que "entrega" a constante

Linha 889: "**esta story entrega uma lista mínima**". Linha 891, no bullet seguinte: "`platformQuery(table, orgId)` — **criada em `87-22`**". As duas não podem valer juntas — é texto que sobreviveu ao movimento do F3. `87-42a` não entrega a lista; ela **consolida, endurece e audita** a lista acumulada, e ativa a R12.

## Correção — uma regra, não cinco edições

Em **`87-22`**, onde a constante nasce, acrescentar a regra de crescimento e ajustar o comentário de topo:

> Toda story que adicionar tela de `/platform` acrescenta, **no mesmo PR**, as tabelas que aquela tela lê, com o comentário de topo atualizado. Alargar só com a tela que precisa; nunca preventivamente. `87-42b` substitui a lista acumulada pela decidida.

E em **`87-42a`**, trocar "entrega uma lista mínima" por "consolida e audita a lista acumulada até aqui". Duas frases fecham E1 e E2.

---

## A tabela de provenance — **não existe no arquivo**

Fui verificar a tabela (artefato → criado em → 1ª menção → situação) e ela não está lá. Conferi os **18 cabeçalhos de tabela** do documento, um a um: nenhum é de provenance. Também procurei por "artefato", "criado em", "nasce em", "1ª menção" e pelo padrão de menção negativa.

**O que existe — e é bom:** o @pm institucionalizou a lição **inline, dentro das ACs**, e as declarações que encontrei estão todas corretas:

| Declaração | Onde |
|---|---|
| "a tabela nasce aqui" (`org_billing_periods`) | `87-26`, linha 680 |
| "já existe desde `87-26`; esta story adiciona aditivamente" | `87-33`, linha 771 |
| "`platformQuery()` … nascem nesta story" | `87-22`, linha 633 |
| "que já existe desde `87-22`" | `87-35`, linha 805 |
| "criada em `87-22` — é endurecida aqui" | `87-42a`, linha 891 |
| "`platform_audit_log` e `platform_audit()` já existem desde `87-16` — esta story **consome, não cria**" | `87-42a`, linha 893 |
| "que já existe desde `87-16`" | `87-31`, linha 745 |
| "`tenant_invoices` só nasce em `87-43`" | `87-31`, linha 743 |

Mais um item de DoD (linha 1102: "toda tabela e função citada em alguma AC tem uma story que a cria") e um bullet no §15 (linha 1202).

**E é justamente a ausência da tabela que explica o E1.** Oito declarações espalhadas por 1.213 linhas servem bem ao @sm, que lê uma story por vez — e não servem a ninguém que precise ver o todo. Nenhuma delas revela que `PLATFORM_READABLE_TABLES` é tocada por cinco stories e declarada por duas. Uma tabela central revelaria na hora.

**Recomendo criá-la, com uma coluna que eu não tinha pedido:** `artefato | criado em | estendido por | 1ª menção | situação`. A coluna "estendido por" é o que teria pego E1 — e, olhando para trás, é o que teria pego os três defeitos das três rodadas.

---

## Contagem conferida

**27 procede.** `87-1` … `87-25` são exatamente **25 headings**, sem buraco (contei), mais `87-27a` e `87-42a` = **27**. O epic declara isso na linha 1200.

Resíduo trivial de F5: a linha 189 ainda diz "implementada em 87-16 e **87-42**" sem sufixo (as outras duas foram corrigidas); e o cabeçalho da Onda 0 (linha 394) continua sem a ressalva de que PRE-0 não bloqueia `87-1` — que está correta no frontmatter, na tabela de PRE e no quadro-resumo.

---

## Padrão: é estrutural — mas do artefato, não do epic

Você perguntou se três rodadas com três arestas indicam algo estrutural ou é o custo normal de mexer num documento de 93 KB. **É estrutural, e tem nome.**

As três arestas não foram aleatórias. Todas caíram sobre artefatos **incrementais** — definidos em pedaços, ao longo de várias ondas, por desenho:

| Rodada | Artefato | Por que era incremental |
|---|---|---|
| 1 | `platform_audit_log` | criada numa onda, endurecida em outra |
| 2 | `org_billing_periods` | criada numa onda, +`cost_micro_usd` em outra, +`consumed_atendimentos` numa terceira |
| 3 | `PLATFORM_READABLE_TABLES` | criada numa onda, crescida em quatro |

**Nenhum defeito caiu sobre artefato atômico.** Tabela criada uma vez e usada — `sellable_modules`, `ai_usage_events`, `role_default_permissions`, `platform_admins`, `tenant_invoices` — nunca deu problema, porque o grafo `Dep:` já cobre esse caso.

E a razão é boa, não ruim: este epic **exige** expand → migrate → contract (NFR-1) em tudo que toca dado existente. Fatiar a definição de um artefato ao longo das ondas é o que a metodologia manda fazer. O grafo `Dep:` foi feito para ordenar *stories*; a fatia de um artefato atravessa stories sem aparecer nele. É um ponto cego previsível de qualquer epic que faça expand→migrate→contract a sério — e por isso a contramedida é a coluna "estendido por", não mais uma rodada de revisão.

O custo de mexer no documento é real, mas é o segundo fator. O primeiro é esse.

---

# Ordem de draft para o @sm

**Front imediato — 27 stories.**

| Ordem | Stories | Notas |
|---|---|---|
| 1 | **`87-1`** | Começa **hoje**. Não depende de PRE-0 nem de nada. |
| 2 | `87-2` | Draftar já; executar após PRE-0 (o baseline vem de introspecção do schema real). Quebrar pela regra do §10. |
| 3 | `87-4` … `87-18` (15) | `87-8`/`87-9`/`87-10`: draftar sim, **não promover a `Ready`** antes de `87-2` emitir `rls-gate-baseline.json`. `87-3`/`87-17`: idem até PRE-1 existir. Quebrar `87-12` e `87-13` pela regra do §10. |
| 4 | `87-19` … `87-25` (7) | Onda 2 completa. **`87-22` é a que carrega a correção E1/E2** — draftar com a regra de crescimento da lista. Quebrar `87-20` (dual-run / cutover). `87-21` drafta com PEND-8 como campo a preencher. |
| 5 | `87-27a`, `87-42a` | Livres. `87-42a` com E2 corrigido: consolida, não entrega. |

**Fora do front, sem furo — gated por ordem de entrega, não por falta de informação:** `87-26`, `87-28` … `87-40`, `87-43`, `87-44`, `87-46` … `87-50`. Ao draftar `87-31` e `87-44`, aplicar a regra de crescimento da lista (E1).

**Três stories 🔒, e só três:** `87-27b` (PEND-1 + PEND-1c), `87-41` (PEND-1b), `87-42b` (PEND-4).

**Para o Gabriel, por urgência:** PRE-0 (aplicar o PR #308 — trava `87-2` e a Onda 1 inteira) → PRE-1 (Supabase descartável — sem ele o epic para no fim da Onda 1) → PEND-4 (antes de a Onda 6 ser *planejada*) → PEND-1 + PEND-1c → PEND-1b + regra de contagem → PEND-6/8/9.

---

<details>
<summary><strong>Rodada 2 (2026-08-02) — 🟡 GO com ressalvas, 9/10 — histórico</strong></summary>

# Veredito da rodada 2

# 🟡 GO com ressalvas — 9/10

**Os 6 bloqueantes foram corrigidos. Verifiquei cada um por leitura do arquivo, não pelo relato — as seis correções são reais, e três delas são melhores do que eu tinha pedido.**

A ressalva existe e é específica: **a correção do B3 introduziu uma aresta para frente nova**, da mesma classe que causou o NO-GO da rodada 1. `org_billing_periods` é criada em `87-33` (Onda 4) e passou a ser consumida por `87-26` **e** `87-31` (Onda 3). Não é um defeito de raciocínio — é o efeito colateral esperado de mover a criação da assinatura entre ondas, e é por isso que a re-verificação de provenance era obrigatória.

**O que mudou de verdade no veredito:** na rodada 1 o @sm não conseguia sair da Onda 1. Agora ele tem **26 stories draftáveis imediatamente** — Ondas 0, 1, **2 inteira** e `87-27a` — e o resto depende de **três correções de um bullet cada**. Isso não é o mesmo documento com defeitos remanescentes; é um documento em outro patamar, com dois furos localizados.

Não estou inflando para fechar o ciclo: se os furos estivessem na Onda 0/1 ou fossem estruturais, seria NO-GO de novo. Eles estão na Onda 3, são de uma tabela só, e a correção é mover uma linha de DDL.

---

## Placar

| # | Critério | R1 | R2 | Nota |
|---|---|---|---|---|
| 1 | Título claro | ✅ | ✅ | — |
| 2 | Descrição completa | ✅ | ✅ | — |
| 3 | AC testáveis | 🟡 | ✅ | M4 e M5 corrigidas; 87-9/87-10 agora ancoradas na partição do baseline |
| 4 | Escopo IN/OUT | ✅ | ✅ | §2.2 ganhou o mecanismo substituto como exclusão declarada |
| 5 | Dependências | 🔴 | 🟡 | Grafo `Dep:` limpo; grafo de artefatos com **1 furo bloqueante + 2 lacunas de declaração** (era 4 furos + 1 ciclo) |
| 6 | Estimativas | 🟡 | ✅ | 87-32 P→M; regra objetiva do §10 + tabela de candidatas |
| 7 | Valor de negócio | ✅ | ✅ | — |
| 8 | Riscos | ✅ | ✅ | R16 elevado a alto |
| 9 | DoD | ✅ | ✅ | — |
| 10 | Alinhamento | 🟡 | ✅ | As incoerências herdadas da arquitetura agora são resolvidas **e documentadas como resolução**, não herdadas em silêncio |

---

# Parte 1 — Os 6 bloqueantes, verificados por leitura

## ✅ B1 — `platform_audit_log` nasce append-only em 87-16

**Verificado nas linhas 557-559.** A tabela, o `REVOKE UPDATE, DELETE ON platform_audit_log FROM authenticated, service_role` **na mesma migration**, e a função `platform_audit(...) SECURITY DEFINER SET search_path` — as três coisas em `87-16`, Onda 1. `87-42a` diz explicitamente "**consome, não cria**" (linha 887), e `87-31` reforça "que já existe desde 87-16 … nenhuma escrita de auditoria acontece em tabela mutável" (linha 743).

Sua pergunta era se o `REVOKE` ficou na mesma migration. **Ficou, e está escrito com essas palavras.** A justificativa que o @pm anexou — "imutabilidade é atributo de nascimento, não de refino" — é melhor que a minha formulação original.

## ✅ B2 — esqueleto de `org_integrations` em 87-21

**Linha 619.** Tabela + `org_id` + `provider` + `status` + `config jsonb` + `UNIQUE (org_id, provider)` + RLS na Onda 2; `87-47` fica com `secret_ref`/Vault, índices UNIQUE de roteamento reverso, `resolveIntegration` e `platform_shared` (linhas 961-965). O argumento está registrado: uma tabela consumida na Onda 2 não pode nascer numa onda declarada sob demanda.

Efeito colateral positivo que confirmei: `87-24` (roteamento de webhook por `phone_number_id`, Onda 2) passa a ter onde ler o identificador. Antes ele dependia de uma tabela de Onda 7.

## ✅ B3 — ciclo quebrado

Quatro pontos, todos verificados:

- **Linha 616:** `p_plan_id` NULLABLE e sempre NULL na Onda 2; sem `org_subscriptions`, sem `org_billing_periods`. A citação da §10 da arquitetura ("sem plano, sem fatura") está no corpo da AC, junto com a frase que importa: *"a incoerência é da arquitetura; a resolução é esta"*.
- **Linha 630:** o wizard perdeu "plano" e "módulos extras", com a razão escrita.
- **Linha 659:** a AC (b) de `87-25` foi removida **com o motivo factual** — `provision_org` semeia `role_permissions` para os 26 módulos, então sem `87-28` o admin vê tudo. Está herdada em `87-32` (linha 753).
- **Linha 617:** o ciclo `87-25 → 87-27 → 87-26 → 87-25` está nomeado no epic como razão de ser da escolha.

**E `87-25` continua com critério verificável na própria onda** (sua pergunta 3): sobraram (a) admin recebe convite e loga, (c) lead cai no stage `novo` da própria org, (d) nenhuma query retorna dado da Trifold, (e) a Trifold não vê nada da Sandbox. Os itens (c), (d) e (e) são o núcleo do teste de isolamento multi-org — é exatamente o que a Onda 2 promete provar. A story não ficou oca.

## ✅ B4 — PEND-1c criada

Presente no frontmatter (`open_questions`, linha 32), em `depends_on` (linha 21), na §14 com a explicação de por que faltava (linhas 1118-1119), na tabela PRE-3 (linha 1062) e no quadro-resumo (linha 1164). `87-27b` cita as duas pendências: "São dois números distintos e nenhum dos dois pode ser derivado" (linha 701).

## ✅ B5 — a Onda 4 deixou de depender do Gabriel

**Linhas 772-776.** `87-33` grava por chamada e ponto: `ai_usage_events` + `ai_usage_daily` + `org_billing_periods.cost_micro_usd`. `consumed_atendimentos` está **explicitamente fora**, com o motivo técnico correto, e nasce em `87-37` como migration aditiva (linha 827).

Esta é a correção com o melhor retorno de todas: **a Onda 4 inteira — medição, reconciliação de ±5%, tela de margem — anda sem resposta do dono do produto.** Eu tinha oferecido duas saídas; o @pm escolheu a que desbloqueia, não a que documenta o bloqueio.

Nomenclatura também resolvida (M6): `consumed_atendimentos`, `ai_quota_atendimentos`, `overage_atendimentos`, com a razão anotada na §4.2 (linha 223) e em `87-33` (linha 774).

## ✅ B6 — 27a/27b e o fecho transitivo

`87-27a` (linhas 685-693) e `87-27b` (695-702). A tabela de PRE ganhou as colunas "Bloqueio direto" e "Bloqueio transitivo" (linhas 1057-1064), e o texto de abertura diz por que a distinção existe. PRE-1 agora declara "o epic **para no fim da Onda 1**" sem o projeto descartável; PRE-0 declara "**não bloqueia 87-1**".

`87-27a` traz uma AC que eu não tinha pedido e que vale registrar: **teste de completude** — a união dos 3 tiers cobre exatamente os 26 de `ALL_MODULES`, sem sobra nem falta. É a verificação que eu fiz à mão na rodada 1, virada em teste automatizado.

## Melhorias — verificadas

M1 ✅ (frontmatter + PRE-0) · M2 ✅ (FR-2 agora diz R1-R12, linha 239) · M3 ✅ (contradição do Storage resolvida a favor do `Dep:`, com o argumento de `87-46`→`87-13` preservado, linha 1051) · M4 ✅ (87-9 e 87-10 com AC própria ancorada na partição do baseline + nota de execução sobre `Ready`) · M5 ✅ (a contagem virou métrica de acompanhamento, não critério, linha 549) · M6 ✅ · M10 ✅ (`max_requests_per_min` em `87-26`, linha 676) · M11 ✅ (convite movido para `87-22` com o atenuante do código registrado, linha 633; `87-49` anota a saída) · M12 ✅ (R16 → **alto**) · M13 ✅ no §3.2 (linhas 185, 190).

---

# Parte 2 — Regressões e achados novos

## 🔴 F1 (BLOQUEANTE) — `org_billing_periods` é criada na Onda 4 e consumida na Onda 3

Esta é a regressão introduzida pela correção do B3, e é exatamente a classe de defeito da rodada 1.

| Story | Onda | O que faz com `org_billing_periods` |
|---|---|---|
| `87-26` | 3 | `org_entitlement_snapshot(p_org_id)` "devolve módulos + limites **+ linha do ciclo**" (linha 679) — a linha do ciclo **é** `org_billing_periods` |
| `87-31` | 3 | "cria … `org_subscriptions` **+ `org_billing_periods` do ciclo corrente** para as orgs já provisionadas" (linha 742) |
| `87-33` | **4** | **cria a tabela** (linha 767) |

E a lista de migrations de `87-26` (linha 675) confirma a ausência: `sellable_modules`, `plans`, `plan_modules`, `plan_limits`, `org_subscriptions`, `org_module_grants`, `org_limit_overrides` — **sem `org_billing_periods`**.

O caso de `87-26` é anterior à correção (eu não o peguei na rodada 1 — registro o erro). O de `87-31` é novo e nasceu do B3: ao tirar a criação da assinatura da Onda 2, ela foi para a Onda 3 trazendo junto o ciclo de faturamento, cuja tabela mora na Onda 4.

**Correção, e ela é de uma linha:** mover o `CREATE TABLE org_billing_periods` de `87-33` para `87-26`. É o lugar natural — `org_billing_periods` é o **ciclo de uma assinatura**, não um artefato de IA; ela existe para toda org com plano, independente de haver medição de IA. `87-33` então faz com ela exatamente o que `87-37` já faz: adiciona a coluna do seu domínio (`cost_micro_usd`) por migration aditiva. O padrão já está estabelecido e escrito no epic — só precisa ser aplicado mais uma vez.

**Impacto:** trava `87-26` e `87-31`, e por dependência o resto da Onda 3. **Não toca Ondas 0, 1 e 2.**

## 🟠 F2 (BLOQUEANTE-LEVE) — `87-42a` é declarada livre, mas nenhuma AC diz de onde vem a lista

Você perguntou exatamente isso, e a resposta é: **`87-27a` está genuinamente livre; `87-42a` ainda não.**

- **`87-27a` — livre de verdade.** Verifiquei: catálogo, composição, plano interno e teste de completude são todos deriváveis de D7/D8/§3.1/`ALL_MODULES`. As colunas de preço e cota ficam **NULL**, com `NOT NULL` adiado para `87-27b` (linha 691). Nada nela precisa de `87-27b`. ✅
- **`87-42a` — quase.** O objetivo diz "depende de *existir uma lista*, não de saber qual é" (linha 881), o que é o raciocínio certo. Mas isso está no **objetivo**, não numa AC. A AC operativa (linha 885) diz que `platformQuery(table, orgId)` "rejeita em runtime qualquer tabela fora de `PLATFORM_READABLE_TABLES`" — e a constante é entregue por `87-42b`, que é 🔒 e cuja instrução literal é "**não desenhar a lista antes da resposta**" (linha 897).

O @sm que draftar `87-42a` bate nessa parede no meio da story — que é precisamente o risco que você nomeou: *uma metade "livre" que na prática precisa da outra é pior que a story inteira bloqueada*.

**Correção, um bullet em `87-42a`:** declarar que a story entrega `PLATFORM_READABLE_TABLES` **provisória**, semeada com as 16 tabelas da §3.4, marcada em código como provisória e amarrada a `87-42b` por comentário e teste; e que **nenhuma tela de `/platform` que leia dado de cliente entra em produção antes de `87-42b`**. Isso não arbitra a resposta de PEND-4 — a §3.4 já está registrada no epic como "ponto de partida que **não** é resposta" (linha 896), e o mecanismo é testável contra qualquer lista.

## 🟠 F3 (CORRIGIR) — `platformQuery()` é exigida na Onda 4 e criada na Onda 6

`87-35` (Onda 4): "`/platform/usage` agrega cross-org; **só via `platformQuery()`**" (linha 801). `platformQuery` nasce em `87-42a` (Onda 6, linha 885).

**A boa notícia é que não há ciclo:** `87-42a` depende de `87-32`, ou seja, está disponível assim que a Onda 3 fecha — antes de `87-33`. É lacuna de **declaração**, não de ordem. Correção: acrescentar `87-42a` ao `Dep:` de `87-35`, ou registrar no cabeçalho da Onda 4 que `87-42a` a precede.

Vale anotar junto: `87-42a` diz que `withPlatformAdmin` "embrulha **toda** rota de `app/api/platform/**`", e rotas de `/platform` já existem desde `87-22` (Onda 2) e `87-31` (Onda 3). O retrofit dessas rotas está implícito; deixar explícito evita que ele seja esquecido.

## 🟡 F4 (CORRIGIR) — `87-31` mostra faturas de uma tabela da Onda 6

`87-31` (Onda 3): `/dashboard/configuracoes/plano` exibe "plano, módulos inclusos, **faturas**, CTA de upgrade" (linha 741). `tenant_invoices` nasce em `87-43` (Onda 6, linha 903) — que, aliás, já é dona dessa AC: "Cliente vê as próprias faturas em `/dashboard/configuracoes/plano`" (linha 907).

É a mesma classe da AC (b) de `87-25` que acabou de ser corrigida: um item insatisfazível na própria onda, duplicado numa story posterior. Correção: remover "faturas" do bullet de `87-31`.

## 🟢 F5 (LIMPEZA) — resíduos textuais

- **Referências a `87-42` sem sufixo** nas linhas 189, 333 e 929. Nenhuma está em linha `Dep:` — a afirmação do @pm sobre o grafo é verdadeira — mas mandam o @sm para um ID que não existe mais. Devem ser `87-42a` (linha 189, mecanismo) e `87-42b` (linhas 333 e 929, a lista).
- **"parcialmente superseded" sobreviveu na lápide de `87-45`** (linha 931), enquanto o §3.2 já foi corrigido para "parcialmente **REJEITADO**" (linhas 185, 190). M13 ficou pela metade.
- **Cabeçalho da Onda 0** ainda diz "Pré-requisito externo: PRE-0 (PR #308 aplicado em produção)" (linha 394), sem a ressalva de que `87-1` não é bloqueada. O frontmatter e a tabela PRE já trazem a nuance; quem lê só o cabeçalho da onda perde ela — e é justamente a informação que permite começar hoje.

---

# Parte 3 — Seus dois pedidos de julgamento

## A regra do §10 substitui a quebra das stories G? **Sim, e é melhor que a quebra.**

Eu levantei M7 e o @pm respondeu com um critério em vez de com seis quebras. Julgo que ele está certo, por três razões:

1. **O critério não é subjetivo.** "Se uma story contém mais de uma fase de expand → migrate → contract, ela é mais de uma story" é derivado do NFR-1 do próprio epic — não é opinião de tamanho. O corolário sobre janela de observação ("dual-run de 7 dias, reconciliação de 14 dias ⇒ story própria, senão fica `InProgress` por uma semana bloqueando o board") é operacionalmente verificável por qualquer um.
2. **Ele não delegou o problema, delegou a execução.** A tabela de candidatas (linhas 378-386) nomeia as 6 stories **e o corte sugerido de cada uma** — inclusive o de `87-12`, que separa preparação reversível do flip irreversível, que era o ponto de risco (R13). O @sm recebe o *quê* e o *como*; decide o *quanto*.
3. **Quebrar no epic seria pior.** O corte certo de `87-8`/`87-9`/`87-10` só é conhecível depois que `87-2` emitir o baseline — o próprio epic reconhece isso na nota de execução dessas stories. Congelar sufixos agora criaria numeração que não sobrevive ao primeiro contato com o dado.

Uma ressalva: a regra vale "para toda story estimada G", e `87-15` e `87-23` são G e **não** estão na tabela de candidatas. Nenhuma das duas tem fase de expand→migrate→contract nem janela de observação, então a regra simplesmente não as pega — mas o @sm pode ler a tabela como exaustiva. Uma frase dizendo que a tabela é ilustrativa e a regra é o critério resolve.

## `87-27a` e `87-42a` estão livres?

Respondido em F2: **`87-27a` sim, `87-42a` depois de um bullet.** Registro que sua desconfiança estava calibrada — das duas metades "livres", uma realmente não estava.

## Números conferidos

| Declarado | Verificado | ✓ |
|---|---|---|
| 52 headings `#### 86-` | 52 | ✅ |
| 51 stories ativas (52 − lápide de `87-45`) | 51 | ✅ |
| 51 linhas `Dep:` | 51 | ✅ |
| Zero órfãs no grafo `Dep:` | todo ID citado existe | ✅ |
| Zero `Dep:` apontando para `87-27`/`87-42` sem sufixo | confirmado — `87-32`→`87-27a`, `87-27b`→`87-27a`, `87-43`→`87-42a`, `87-42b`→`87-42a` | ✅ |
| `87-45` fora de todo `Dep:` | confirmado (12 menções, todas lápide) | ✅ |
| Toda dependência aponta para trás | confirmado no grafo `Dep:` | ✅ |
| 20 stories liberadas | **26** — o @pm subcontou a própria correção (ver abaixo) | 🟡 |

**Sobre as 26.** O §15 diz "Onda 0 e Onda 1 estão livres (18 stories)" e o @pm somou `87-27a` + `87-42a` = 20. Mas **a Onda 2 inteira (`87-19` … `87-25`, 7 stories) ficou livre justamente por causa do B3**: `p_plan_id` NULL, sem assinatura, sem ciclo, `org_integrations` e `platform_audit_log` com dono, e `87-25` com AC satisfazível. Conferi artefato por artefato e não sobrou nenhuma dependência de onda futura na Onda 2. São **18 + 7 + `87-27a` = 26** — e `87-42a` entra como 27ª assim que F2 for corrigida.

**PRE-0 e PRE-1** estão corretamente travados: PRE-0 → `87-2` em diante, com `87-1` explicitamente livre (frontmatter linha 18, tabela linha 1059, quadro linha 1172); PRE-1 → `87-3`/`87-17` diretos e "o epic para no fim da Onda 1" como transitivo (linha 1060).

---

# Plano

## Para o @pm — 2 bloqueantes + 3 correções (estimo 30 minutos)

| # | Correção | Onde | Tamanho |
|---|---|---|---|
| **F1** | Mover `CREATE TABLE org_billing_periods` de `87-33` para `87-26`; `87-33` passa a **adicionar** `cost_micro_usd` (aditiva), como `87-37` já faz com `consumed_atendimentos` | `87-26`, `87-33` | 2 bullets |
| **F2** | `87-42a` entrega `PLATFORM_READABLE_TABLES` **provisória** (as 16 da §3.4, marcada como tal em código e amarrada a `87-42b`); nenhuma tela de `/platform` com dado de cliente em produção antes de `87-42b` | `87-42a` | 1 bullet |
| F3 | `87-42a` no `Dep:` de `87-35`; tornar explícito o retrofit das rotas de `/platform` de Ondas 2-3 | `87-35`, `87-42a` | 1 linha |
| F4 | Remover "faturas" do bullet de `87-31` (já é AC de `87-43`) | `87-31` | 1 palavra |
| F5 | `87-42`→`87-42a`/`87-42b` nas linhas 189, 333, 929; "superseded"→"rejeitado" na linha 931; ressalva do PRE-0 no cabeçalho da Onda 0; nota de que a tabela do §10 é ilustrativa | 4 pontos | trivial |

## Para o @sm — pode começar agora

**26 stories liberadas, nesta ordem:**

1. **`87-1` — hoje.** Não depende de PRE-0. É a única coisa no epic que não depende de nada.
2. **`87-2`** — draftar já; executar depois de PRE-0 (PR #308 em produção), porque o baseline é gerado por introspecção do schema real.
3. **Onda 1 completa (`87-4` … `87-18`, 15 stories).** Notas: `87-8`/`87-9`/`87-10` draftar sim, **não promover a `Ready`** antes de `87-2` emitir `rls-gate-baseline.json`; `87-3` e `87-17` idem até PRE-1 existir. Aplicar a regra do §10 nas G (`87-2`, `87-12`, `87-13`).
4. **Onda 2 completa (`87-19` … `87-25`, 7 stories)** — liberada pela correção do B3. `87-20` quebrar pela regra do §10 (dual-run / cutover+contract). `87-21` drafta com PEND-8 como campo a preencher.
5. **`87-27a`** — livre, mas depende de `87-26`, que espera F1.

**Aguardando F1:** `87-26`, `87-28`, `87-29`, `87-30`, `87-31`, `87-32` e, por dependência, Ondas 4-8.
**Aguardando F2:** `87-42a`.
**Aguardando decisão do Gabriel:** `87-27b` (PEND-1 + PEND-1c), `87-41` (PEND-1b), `87-42b` (PEND-4). Nenhuma outra.

## Para o Gabriel — em ordem de urgência

1. **PRE-0** — aplicar o PR #308 em produção. Trava `87-2` e, por ele, toda a Onda 1. É o único item que trava trabalho **hoje**.
2. **PRE-1** — o projeto Supabase descartável. Sem ele o epic para no fim da Onda 1, e essa parada chega antes do que parece.
3. **PEND-4** — o que o super-admin vê. Precisa chegar **antes de a Onda 6 ser planejada**, porque a resposta pode criar uma story G nova (§2.2 e PRE-5 registram a contingência corretamente).
4. **PEND-1 + PEND-1c** — preço e cota por tier. Travam `87-27b` e o marco "vendável", e **nada além disso** depois da quebra 27a/27b.
5. **PEND-1b** e a **regra de contagem de atendimento** — travam `87-41` e `87-37`; a Onda 4 anda sem elas.
6. **PEND-6, PEND-8, PEND-9** — baixo impacto, podem vir junto com as stories.

---

## Nota de fechamento

Duas coisas que quero deixar registradas.

A primeira é que **o @pm não corrigiu os 6 pontos, ele corrigiu a causa.** O §15 agora carrega a instrução "provenance de artefato é critério de validação, não só o grafo `Dep:`" como orientação de draft, e três correções (B1, B3, B5) trazem escrito no corpo da AC *por que* a escolha foi feita — de modo que ninguém as desfaça por engano daqui a três meses. O B5 foi além do pedido: eu ofereci duas saídas e ele escolheu a que desbloqueia a Onda 4 inteira.

A segunda é que **eu errei na rodada 1.** O `org_entitlement_snapshot` de `87-26` já lia a "linha do ciclo" antes desta revisão, e eu não peguei — achei quatro furos de provenance e havia cinco. É a evidência mais direta de que a verificação de artefato precisa ser mecânica e repetida a cada revisão, não uma passada de olho por documento. Foi por rodar de novo, sobre o grafo alterado, que apareceram o F1 novo e o F1 antigo juntos.

Com F1 e F2 aplicados, este epic está pronto para 51 stories.

</details>

---

## Anexo — Rodada 1 (2026-08-01), para histórico

Veredito: 🔴 NO-GO parcial, 7,5/10. Seis bloqueantes, todos de **provenance de artefato**:

| # | Achado | Estado em R2 |
|---|---|---|
| B1 | `platform_audit_log` sem story que a criasse; NFR-13 violado por 4 ondas | ✅ corrigido em `87-16` |
| B2 | `org_integrations` semeada na Onda 2, criada na Onda 7 (sob demanda) | ✅ esqueleto em `87-21` |
| B3 | Onda 2 dependia de `plans`/`org_subscriptions` da Onda 3 → ciclo `87-25 → 87-27 → 87-26 → 87-25`; AC (b) de `87-25` insatisfazível | ✅ Opção A aplicada |
| B4 | Cota de atendimentos por tier era número sem pendência declarada | ✅ PEND-1c |
| B5 | Regra de contagem exigida em `87-33` (Onda 4), pendurada em `87-37` (Onda 5) | ✅ `87-33` só por chamada |
| B6 | PEND-1 travava 20 stories por transitividade, declarado como 2 | ✅ quebra 27a/27b + colunas de fecho |

Treze melhorias (M1-M13): todas aplicadas exceto M7/M8, substituídas pela regra objetiva do §10 (julgado adequado).

Também verificado e aprovado na R1, sem alteração nas rodadas seguintes: **13/13 achados da auditoria rastreados**; **zero preço/prazo/métrica inventados**; **ordem de risco honrada** (nada de venda antes de `87-18`); **zero resquício de impersonation**; **`87-45` fora de todo `Dep:`**; **exclusão pós-cancelamento cobrindo Storage** com dependência dura de `87-13`.

---

— Pax, equilibrando prioridades 🎯

Também verificado e aprovado na R1, sem alteração na R2: **13/13 achados da auditoria rastreados**; **zero preço/prazo/métrica inventados**; **ordem de risco honrada** (nada de venda antes de `87-18`); **zero resquício de impersonation**; **`87-45` fora de todo `Dep:`**; **exclusão pós-cancelamento cobrindo Storage** com dependência dura de `87-13`.
