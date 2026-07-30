# Auditoria de Isolamento Multi-Tenant — Trifold CRM

**Data:** 2026-07-29
**Método:** consultas read-only ao banco de **produção** (`dsopqkqjkmhytudaaolv`) via Supabase Management API — estado *acumulado* real, não inferência estática das 216 migrations.
**Escopo:** preparação para SaaS multi-empresa com shared DB + RLS (decisão do dono do produto).
**Documento irmão:** `docs/architecture/saas-multi-tenant.md` (@architect).

> ⚠️ **Quatro achados são vazamento em produção HOJE, com uma única org.** Não são riscos futuros de multi-tenant. Dois foram confirmados por exploração real (leitura sem login, com a chave anônima que está no bundle do navegador). Ver P1 e P2.

---

## Sumário executivo

| Severidade | Qtd | Natureza |
|---|---|---|
| 🔴 **CRÍTICO — vaza hoje** | 4 | Acessível sem login ou por qualquer usuário logado, org única inclusive |
| 🔴 **CRÍTICO — vaza no 2º tenant** | 3 | Só não vaza porque existe uma org |
| 🟠 **ALTO** | 3 | Isolamento dependente de código, colisão funcional |
| 🟡 **MÉDIO** | 3 | Performance, restrição arquitetural, dado global |

**Números do banco:**

| Métrica | Valor |
|---|---|
| Tabelas em `public` | 109 |
| Tabelas com `org_id` | 86 |
| Tabelas com RLS desabilitada | **0** ✅ |
| Tabelas com `org_id` e **zero policies** | 16 |
| Tabelas com `org_id` sem índice iniciando em `org_id` | 16 (+4 views) |
| Funções `SECURITY DEFINER` | 27 |
| Policies em `storage.objects` | 20 — **nenhuma com escopo de org** |

**Boa notícia estrutural:** existe o event trigger `ensure_rls` (função `rls_auto_enable()`), ativo, que habilita RLS automaticamente em toda tabela nova em `public`. É por isso que `rls_off = 0`. Uma tabela nova **não pode nascer sem RLS** — metade do gate de CI que o Gabriel pediu já existe no banco. A outra metade (garantir `org_id` + policy org-scoped) não existe e é o que falta.

**Nuance importante sobre esse trigger:** RLS habilitada com zero policies = *deny-all*. O efeito colateral é que o desenvolvedor, ao bater na parede, resolve com `createAdminClient()` (service-role, que ignora RLS) em vez de escrever a policy. Isso explica as 16 tabelas com `org_id` e zero policies, e conecta diretamente ao risco nº 1 do @architect: **166 dos 285 route handlers usam service-role**. O gate de RLS, sozinho, dá falsa segurança.

---

## 🔴 P1 — RPCs `SECURITY DEFINER` com `p_org_id` confiado, executáveis por `anon`

**Severidade: CRÍTICO — confirmado explorável hoje, sem autenticação.**

8 funções `SECURITY DEFINER` (que por definição ignoram RLS) recebem `p_org_id` como **parâmetro** e não validam contra `user_org_id()`. Todas têm `EXECUTE` concedido a `anon` **e** `authenticated`.

| Função | anon | authenticated | valida org | escrita |
|---|---|---|---|---|
| `get_whatsapp_cost_summary(p_org_id)` | ✅ | ✅ | ❌ | — |
| `get_whatsapp_volume_summary(p_org_id)` | ✅ | ✅ | ❌ | — |
| `get_broker_dashboard_counts(p_org_id, p_broker_id)` | ✅ | ✅ | ❌ | — |
| `get_broker_funnel_stats(p_org_id, p_broker_id)` | ✅ | ✅ | ❌ | — |
| `get_brokers_active_lead_counts(p_org_id)` | ✅ | ✅ | ❌ | — |
| `broker_active_leads_count(p_org_id, p_broker_user_id)` | ✅ | ✅ | ❌ | — |
| `roleta_pick_and_advance(p_org_id, p_lead_id, …)` | ✅ | ✅ | ❌ | **SIM** |
| `seed_system_roles(p_org_id)` | ✅ | ✅ | ❌ | **SIM** |

`log_pii_access(p_org_id, …)` é a única do conjunto que valida (`user_org_id()`) — serve de referência do padrão correto.

**Evidência — exploração real, sem login:**

```bash
curl -X POST "https://dsopqkqjkmhytudaaolv.supabase.co/rest/v1/rpc/get_whatsapp_cost_summary" \
  -H "apikey: <ANON_KEY — está no bundle do navegador>" \
  -d '{"p_org_id":"00000000-0000-0000-0000-000000000001"}'

→ {"d7":{"disparos":295,"custo_brl":35.45},
   "d30":{"disparos":947,"custo_brl":90.55,
          "por_categoria":{"utility":803,"marketing":144}},
   "h24":{"disparos":9,"custo_brl":1.95}}
```

**Impacto hoje:** qualquer pessoa na internet lê volume e custo operacional de WhatsApp, contagens de leads e funil por corretor da Trifold. A chave `anon` é pública por design — está no JavaScript servido ao navegador.

**Impacto no 2º tenant:** a empresa B enumera `org_id` e lê métricas comerciais, funil e performance de corretores da empresa A. `seed_system_roles` permite **sobrescrever roles/permissões** de qualquer org (escalada de privilégio cross-tenant); `roleta_pick_and_advance` permite manipular distribuição de leads de qualquer org.

> As duas de escrita **não foram testadas** — mutariam produção. O grant é idêntico ao das confirmadas, então a exploração é a mesma.

**Correção — versão corrigida após a implementação (2026-07-29):**

> ⚠️ **Erro desta auditoria, encontrado pelo @dev:** eu prescrevi `REVOKE EXECUTE ... FROM anon`, que **não fecharia o furo**. 5 das 8 funções (`get_broker_dashboard_counts`, `get_broker_funnel_stats`, `get_whatsapp_cost_summary`, `get_whatsapp_volume_summary`, `seed_system_roles`) têm `EXECUTE` concedido ao pseudo-role **`PUBLIC`** (`=X/postgres` em `proacl`), não a `anon`. Revogar de `anon` deixaria o acesso intacto por herança de `PUBLIC`. O revoke tem de ser `FROM PUBLIC, anon`, com re-concessão explícita a `authenticated, service_role`.
>
> **Lição para o gate de CI:** verificar grant por `has_function_privilege('anon', …)` detecta o problema (foi como achei), mas prescrever o fix em termos de `anon` não o resolve. Auditoria de grant precisa olhar `proacl` e o papel `PUBLIC` explicitamente.

1. Guarda de org no início do corpo, via helper `assert_org_scope(p_org_id)`.
2. `REVOKE EXECUTE ... FROM PUBLIC, anon` + `GRANT EXECUTE ... TO authenticated, service_role`.

**Guarda para as chamadas de service-role:** `user_org_id()` retorna NULL sem JWT, e `p_org_id IS DISTINCT FROM NULL` é TRUE — a guarda incondicional derrubaria `roleta_pick_and_advance` (chamada por `lib/roleta/distributor.ts` com `createAdminClient()`) e o provisionamento. O helper retorna cedo quando `auth.uid() IS NULL`. Usar `auth.uid() IS NOT NULL` em vez de `user_org_id() IS NOT NULL` é estritamente mais forte: existem 2 usuários em `auth.users` sem linha em `public.users`, e com essa guarda eles são negados.

**Nota de implementação:** 4 das 8 eram `LANGUAGE sql` e foram convertidas para `plpgsql` — SQL puro não tem `IF`/`RAISE`. Colocar a guarda dentro de `WHERE`/CTE dependeria de o planner avaliar a expressão, o que não é garantia contratual e é inaceitável para um controle de segurança.

**Correção melhor, se houver apetite:** eliminar o parâmetro `p_org_id` e derivar de `user_org_id()` dentro da função. Remove a classe inteira de bug em vez de tapar 8 instâncias. Custo: alterar os call sites em TS.

---

## 🔴 P2 — Views sem `security_invoker` legíveis por `anon`

**Severidade: CRÍTICO — confirmado hoje, sem autenticação.**

> ⚠️ **Segundo erro desta auditoria, encontrado pelo @qa:** tratei `meta_campaign_roas` como view. Ela é **MATERIALIZED VIEW** (`relkind = 'm'`) desde `035_materialize_meta_campaign_roas_remote_only.sql` (Story 29.6), com `REFRESH CONCURRENTLY` por `pg_cron` a cada 3h sob o role `postgres`.
>
> Consequência: **`security_invoker` não se aplica a matview** — é reloption de view, e `ALTER VIEW` sobre `relkind='m'` levanta ERRCODE 42809. Mais fundo: o conteúdo de uma matview é materializado no REFRESH, executado por `postgres` (`rolbypassrls = true`), então **RLS de tabela-base nunca filtra leitura de matview**. O objetivo declarado do P2 é estruturalmente inalcançável para esse objeto.
>
> **Controle correto para matview: grant, não RLS.** `REVOKE ALL ON TABLE meta_campaign_roas FROM anon, authenticated` — incluindo `authenticated`, senão qualquer usuário logado (corretor incluso) lê `total_spend`, `total_revenue`, `roas` e `cpl_real` de todas as campanhas por PostgREST direto.
>
> **Lição para o gate de CI:** checar `pg_class.relkind` **antes** de prescrever `security_invoker`. A asserção nº 3 do gate, como escrita, acusaria falha permanente e legítima em matview.

| Objeto | `relkind` | `security_invoker` | anon lê | Respeita RLS |
|---|---|---|---|---|
| `v_mensagens_admin` | `v` view | **não definido** | ✅ | ❌ bypass — corrigível por `security_invoker` |
| `meta_campaign_roas` | **`m` matview** | n/a | ✅ | ❌ **nunca** — só grant controla |
| `v_lead_conversations` | `on` | ❌ | ✅ ok |
| `v_lead_drill` | `on` | ❌ | ✅ ok |
| `v_pipeline_stage_distribution` | `on` | ❌ | ✅ ok |

Sem `security_invoker`, a view executa com os direitos do **owner** e ignora as policies das tabelas-base. As três `v_lead_*` já estão corretas — o padrão bom existe no projeto, só não foi aplicado nessas duas.

**Evidência (contagem, sem expor PII):**
```
GET /rest/v1/v_mensagens_admin?limit=0  (apikey: anon)  → HTTP 206, content-range: */15
GET /rest/v1/meta_campaign_roas?limit=0 (apikey: anon)  → HTTP 206, content-range: */104
```

**Impacto:** `v_mensagens_admin` é uma view sobre mensagens — conteúdo de atendimento, dado pessoal sob LGPD, exposto sem login. `meta_campaign_roas` expõe ROAS e investimento em mídia.

**Correção:**
```sql
ALTER VIEW v_mensagens_admin  SET (security_invoker = on);
ALTER VIEW meta_campaign_roas SET (security_invoker = on);
REVOKE SELECT ON v_mensagens_admin, meta_campaign_roas FROM anon;
```
⚠️ Ao ligar `security_invoker`, quem consome a view passa a precisar de policy nas tabelas-base. Verificar os call sites antes: se hoje a view é lida por uma rota em service-role, nada quebra; se é lida com o client do usuário, pode esvaziar a tela.

---

## 🔴 P3 — `system_events`: policy permissiva `USING (true)` para `public`

**Severidade: CRÍTICO — vaza SEM LOGIN, hoje. 10.149 linhas.**

> ⚠️ **Terceira correção desta auditoria (@qa):** eu classifiquei este item como "vaza para qualquer usuário logado". É pior — vaza para `anon`, ou seja, para a internet. Confirmado read-only:
> ```
> GET /rest/v1/system_events?limit=0  (apikey: anon)  → HTTP 206, content-range: */10149
> ```
> Isto eleva o P3 ao mesmo patamar de P1 e P2, e faz dele o item mais caro de ficar para trás numa aplicação parcial da migration.

```
[system_events] "Service role full access" (ALL) roles=public
  USING: true    CHECK: true
```

A tabela tem `org_id` e uma segunda policy org-scoped, **que é irrelevante**: policies permissivas são combinadas com `OR`. Uma policy `USING (true)` para o role `public` anula qualquer restrição das demais.

O nome revela a intenção — dar acesso ao service-role — mas o role aplicado é `public`, que inclui `authenticated`. Service-role **não precisa de policy**: ele ignora RLS por natureza. A policy é desnecessária e nociva.

**Impacto:** qualquer usuário autenticado lê e **escreve** `system_events` de todas as orgs. Escrita inclui poluir a trilha de eventos de outra empresa.

**Correção:** `DROP POLICY "Service role full access" ON system_events;` — a policy org-scoped existente passa a valer. Confirmar antes que nenhuma rota use client de usuário (não service-role) para gravar evento.

---

## 🔴 P4 — Tabelas de custo interno da Trifold legíveis por admin de cliente

**Severidade: CRÍTICO no modelo SaaS — expõe margem ao cliente.**

As tabelas do Epic 78 (custo que **a Trifold paga**) têm policy `admin_only` = `user_role() = 'admin'`, **sem noção de org**:

| Tabela | Policy | Conteúdo |
|---|---|---|
| `platform_services` | `user_role()='admin'` | Serviços/integrações contratados pela Trifold |
| `service_cost_snapshots` | `user_role()='admin'` | Custo real por serviço (inclui Anthropic) |
| `service_billing_reminders` | `user_role()='admin'` | Faturas a pagar |
| `billing_cost_alerts_sent` | `user_role()='admin'` | Alertas de custo |
| `billing_monthly_summary_log` | `user_role()='admin'` | Resumo mensal de gasto |

Hoje "admin" só existe dentro da Trifold, então é inofensivo. **No momento em que o primeiro cliente recebe uma conta admin — que é o próprio modelo de provisionamento aprovado — esse cliente lê o custo que a Trifold paga pela IA.** Como o modelo de cobrança é custo + markup, o cliente passa a conhecer exatamente a nossa margem. É um dano comercial, não só técnico.

**Correção:** essas tabelas são **plataforma**, não tenant. Não devem ganhar `org_id`; devem exigir um papel novo, `platform_admin`, que não existe hoje e que nenhum usuário de cliente pode ter. Depende da camada de platform-admin do @architect (ADR-004). Até ela existir, mitigação imediata: `REVOKE` do role `authenticated` e acesso só via service-role em rota gated — o padrão de `131_imobiliarias.sql`.

**Este achado precisa entrar na Onda 1**, não na Onda 6 junto com o painel: o gatilho do dano é a criação da primeira conta admin de cliente, que acontece na Onda 2.

---

## 🔴 P5 — `privacy_consents`: consentimentos LGPD sem escopo de org

**Severidade: CRÍTICO no 2º tenant — dado sensível LGPD.**

```
[privacy_consents] privacy_consents_select_admin (SELECT)
  USING: is_admin_or_supervisor()          ← sem org
[privacy_consents] privacy_consents_insert_own (INSERT)
  CHECK: user_id = (SELECT id FROM users WHERE auth_id = auth.uid())   ← ok
```

A tabela não tem `org_id`. O SELECT libera para qualquer admin/supervisor, de qualquer empresa.

**Impacto:** admin da empresa B lê os registros de consentimento LGPD dos clientes da empresa A. Registro de consentimento é a prova de conformidade — vazá-lo entre controladores distintos é incidente reportável.

**Correção:** adicionar `org_id` (backfill via `users.org_id`) e ancorar a policy. Como é tabela pequena e append-only, o backfill é barato.

---

## 🔴 P6 — `financial_notification_log` sem escopo de org

**Severidade: CRÍTICO no 2º tenant.**

```
[financial_notification_log] fin_notif_select (SELECT)
  USING: is_admin_or_supervisor()     ← tem org_id na tabela, mas a policy ignora
```

Única policy da tabela, e não usa o `org_id` que a própria tabela possui. Admin da empresa B lê notificações financeiras (inadimplência, boletos, parcelas) dos clientes da empresa A.

**Correção:** `USING (org_id = user_org_id() AND is_admin_or_supervisor())`. Correção de uma linha, risco baixo — hoje, com uma org, o comportamento é idêntico.

---

## 🔴 P7 — Storage: 20 policies, zero escopo de org

**Severidade: CRÍTICO no 2º tenant; parcialmente exposto hoje.**

**Nenhuma** das 20 policies de `storage.objects` referencia org. Buckets:

| Bucket | Público | Risco |
|---|---|---|
| `obra-docs` | privado | `authenticated_read_obra_docs` = `bucket_id='obra-docs'` — **qualquer usuário logado lê todos os documentos de obra de todas as orgs** |
| `obra-mensagens` | privado | idem, leitura e upload liberados a qualquer autenticado |
| `lancamentos` | privado | sem policy de leitura (só service-role) — ok |
| `pastas` | privado | sem policy de leitura — ok |
| `obra-fotos` | **público** | fotos de obra legíveis por qualquer um com a URL |
| `nicole-media` | **público** | mídia de atendimento (áudio, PDF, imagem de conversa) pública |
| `campaign-assets` | **público** | criativos de campanha públicos |
| `chamados-attachments` | **público** | anexos de suporte — a policy de SELECT *é* ancorada em `users.id` na pasta, mas o bucket público permite acesso direto por URL, contornando a policy |
| `marketing-brands` | **público** | ativos de marca públicos |

Duas classes de problema:

1. **Policies sem org:** `authenticated_read_obra_docs` e `authenticated_read_obra_mensagens` liberam por `bucket_id` apenas. Com 2 tenants, o cliente da empresa B baixa a documentação de obra da empresa A. As policies com `is_admin_or_supervisor()` (upload/delete de `obra-docs` e `obra-fotos`) permitem admin de B **apagar** arquivo de A.
2. **Buckets públicos:** em bucket público, policy de SELECT é irrelevante — a URL basta. `nicole-media` guardando áudio e PDF de conversa em bucket público é exposição de PII já hoje, independente de multi-tenant.

**Correção:** convenção de path com org na primeira pasta (`{org_id}/…`) + policies usando `(storage.foldername(name))[1] = user_org_id()::text`. Para os buckets que hospedam PII (`nicole-media`, `obra-fotos`), migrar para privado + URL assinada. A migração de path exige mover objetos existentes e atualizar as referências gravadas no banco — é a correção mais cara da lista e merece story própria.

---

## 🟠 P8 — 16 tabelas com `org_id` e zero policies: isolamento 100% no código

**Severidade: ALTO — risco arquitetural, não furo direto.**

Com RLS habilitada e nenhuma policy, o resultado é *deny-all* para `anon`/`authenticated`: **não há vazamento por acesso direto**. O padrão é deliberado e documentado (`131_imobiliarias.sql`): acesso só por service-role em rota gated.

Tabelas: `fornecedores`, `imobiliarias`, `imob_cards`, `imob_columns`, `imob_card_comments`, `lancamentos`, `lancamento_cards`, `lancamento_columns`, `lancamento_card_attachments`, `lancamento_card_checklist`, `lancamento_card_comments`, `lancamento_card_fornecedores`, `marketing_brands`, `marketing_brand_assets`, `marketing_posts`, `supremo_sync_log`.

O problema não é o padrão — é a **escala** dele. Todo o isolamento desses 16 domínios depende de alguém ter escrito `.eq("org_id", …)` à mão em cada query. Combinado com os 166 route handlers em service-role apontados pelo @architect, isso significa que **o gate de RLS que o Gabriel pediu não cobre a maior superfície de risco**. Um gate que só verifica policies daria luz verde a essas 16 tabelas.

**Correção:** não mexer nas policies. Atacar pelo código: o `createOrgScopedAdminClient()` proposto pelo @architect (proxy que injeta o filtro de org obrigatoriamente) + lint proibindo `createAdminClient()` cru em rota de dados de tenant. E o gate de CI deve ter **duas** asserções, não uma: (a) tabela com `org_id` tem policy org-scoped **ou** está numa allowlist explícita de "service-role only"; (b) a allowlist não cresce sem revisão.

---

## 🟠 P9 — UNIQUEs globais que colidem entre empresas

**Severidade: ALTO — quebra funcional no onboarding do 2º tenant.**

Varri os 111 UNIQUEs de tabelas com `org_id`. A **maioria é falso positivo**: estão ancorados em FK de um pai já org-scoped (`campaign_id`, `card_id`, `obra_id`, `role_id`, `destinatario_id`) ou são tokens que *devem* ser globalmente únicos (`cancel_token`, `pastas.token`, `pasta_links.token`, `clicksign_envelope_id`, `calendly_event_uri`). Dois são colisão real:

| Constraint | Problema |
|---|---|
| `properties_slug_key UNIQUE (slug)` | Duas empresas não podem ter imóvel com o mesmo slug. "residencial-vista-mar" é nome genérico — colisão é questão de tempo. **Deve ser `(org_id, slug)`.** Atenção: se o slug compõe URL pública, a rota precisa passar a resolver por org (subdomínio ou path), o que amplia o escopo. |
| `idx_leads_supremo_id UNIQUE (supremo_id) WHERE NOT NULL` | ID externo do Supremo, único globalmente. Se duas orgs integrarem Supremo, o lead da segunda é rejeitado silenciosamente pelo upsert. **Deve ser `(org_id, supremo_id)`.** |

---

## 🟡 P10 — `users.auth_id UNIQUE`: uma pessoa pertence a exatamente uma empresa

**Severidade: MÉDIO — restrição arquitetural, decisão de produto.**

`users_auth_id_key UNIQUE (auth_id)` + `users.org_id NOT NULL` implicam que uma conta de autenticação mapeia para exatamente um usuário e uma org. Consequências:

- Um corretor que atenda duas imobiliárias clientes precisa de dois e-mails.
- A equipe da Trifold não pode ter uma conta que transite entre orgs — o que é exatamente o que o painel super-admin exige. Reforça a necessidade da camada `platform_admin` separada de `users` (ADR-004), em vez de "um usuário admin com acesso a várias orgs".

Não é furo. É a pergunta 4 do @architect, e o custo de mudar depois é alto: `user_org_id()` e as 218 policies dependem dessa premissa. **Vale decidir agora, não na Onda 6.**

---

## 🟡 P11 — 16 tabelas com `org_id` sem índice iniciando em `org_id`

**Severidade: MÉDIO — performance sob multi-tenant.**

Com 1 org, filtrar por `org_id` não seleciona nada e o índice é indiferente. Com N orgs, toda policy `org_id = user_org_id()` vira predicado quente em cada query.

`agent_config`, `agent_media_assets`, `brindes_entregas`, `campaign_entries`, `campaign_events`, `email_automations`, `email_sends_queue`, `imob_card_comments`, `lancamento_card_attachments`, `lancamento_card_checklist`, `lancamento_card_comments`, `lancamento_card_fornecedores`, `lancamento_columns`, `marketing_brand_assets`, `role_permissions`, `user_permission_exceptions`.

Relevante dado o histórico: a memória do projeto registra que a lentidão anterior era latência de região, não banco — ou seja, o banco tinha folga. Multi-tenant consome essa folga. `role_permissions` e `user_permission_exceptions` são as mais sensíveis: entram no caminho de **toda** verificação de permissão.

**Correção:** `CREATE INDEX CONCURRENTLY` (fora de transação) em cada uma. Barato, sem downtime, sem risco funcional.

---

## 🟠 P13 — `SECURITY DEFINER` sem `SET search_path` (achado do @dev, não meu)

**Severidade: ALTO — vetor de hijack de search_path.**

Três funções `SECURITY DEFINER` não fixam `search_path`: `get_broker_dashboard_counts`, `get_broker_funnel_stats`, `seed_system_roles`. Uma função `SECURITY DEFINER` sem `search_path` fixo pode ser induzida a resolver um nome de tabela/função para um objeto plantado por um schema sob controle do chamador, executando código com os privilégios do owner.

**Esta auditoria não procurou por isso** — foi encontrado pelo @dev durante a implementação do P1. Ficou **fora** do hotfix por decisão dele de não ampliar escopo, e está correto: é vetor distinto do isolamento cross-tenant.

**Correção:** `ALTER FUNCTION … SET search_path = pg_catalog, public;` nas três. Verificar antes se alguma depende de resolução dinâmica de schema.

**Para o gate de CI:** adicionar quinta asserção — `pg_proc` com `prosecdef = true` e `proconfig` sem `search_path`.

---

## 🟡 P12 — `whatsapp_pricing` legível por todos

```
[whatsapp_pricing] wa_pricing_read (SELECT) USING: true
```

Tabela de referência de preços da Meta, sem `org_id`. Global e read-only é aceitável — não é dado de tenant. Fica registrado por transparência: expõe a tabela de custo de WhatsApp a qualquer usuário. Se o preço repassado ao cliente for diferente do custo, isso revela markup. Decidir junto com P4.

---

## Ordem de remediação

Agrupada para caber em stories, priorizando o que vaza dado. **Todo item roda em produção sem staging isolado** — a coluna de risco reflete isso.

### Lote 0 — Hotfix de segurança (dias, não semanas)
Vaza hoje, correção pequena, risco de regressão baixo. **Não depende de nada do trabalho de multi-tenant.**

| # | Ação | Risco operacional |
|---|---|---|
| P1 | `REVOKE EXECUTE ... FROM anon` nas 8 RPCs + validar `p_org_id = user_org_id()` | Baixo. Verificar antes se alguma página pública/webhook chama essas RPCs com a anon key — se sim, ela quebra e precisa migrar para rota server-side. |
| P3 | `DROP POLICY "Service role full access" ON system_events` | Baixo. Confirmar que nenhuma gravação de evento usa client de usuário. |
| P2 | `security_invoker = on` nas 2 views + revoke de `anon` | **Médio.** Ligar invoker faz a view respeitar RLS; se um consumidor lê com client de usuário sem policy na base, a tela esvazia. Testar os call sites. |
| P6 | `financial_notification_log`: adicionar `org_id = user_org_id()` na policy | Baixo. Com uma org, comportamento idêntico. |
| P4 | Revoke das 5 tabelas de custo interno de `authenticated` | Baixo hoje, mas **obrigatório antes da 1ª conta admin de cliente**. |

### Lote 1 — Antes do 2º tenant existir
| # | Ação | Risco |
|---|---|---|
| P5 | `org_id` em `privacy_consents` + backfill + policy | Baixo (tabela pequena, append-only) |
| P9 | `properties_slug_key` → `(org_id, slug)`; `idx_leads_supremo_id` → `(org_id, supremo_id)` | Médio — se o slug compõe URL pública, a resolução de rota muda |
| P11 | 16 índices `CONCURRENTLY` | Baixo |
| P10 | **Decisão de produto** sobre usuário em múltiplas orgs | — |

### Lote 2 — Storage (story própria)
| # | Ação | Risco |
|---|---|---|
| P7a | Policies de `obra-docs` e `obra-mensagens` ancoradas em org | Médio |
| P7b | `nicole-media` e `obra-fotos` → privados + URL assinada | **Alto** — quebra URLs já distribuídas a clientes; exige varrer referências gravadas no banco |
| P7c | Convenção de path `{org_id}/…` + migração dos objetos existentes | **Alto** — mover objetos e reescrever referências |

### Lote 3 — Estrutural (junto com a arquitetura)
| # | Ação |
|---|---|
| P8 | `createOrgScopedAdminClient()` + lint + allowlist revisada das 16 tabelas service-role-only |
| P4 | Papel `platform_admin` de verdade (depende de ADR-004) |
| — | Gate de CI (abaixo) |

---

## Proposta de gate de CI

O event trigger `ensure_rls` já garante RLS em tabela nova. O gate cobre o que falta, com **três** asserções — a terceira é a que fecha o furo que um gate ingênuo deixaria (P8):

```sql
-- 1) tabela com org_id precisa de policy org-scoped OU allowlist explícita
WITH org_tables AS (
  SELECT DISTINCT table_name FROM information_schema.columns
  WHERE table_schema='public' AND column_name='org_id'
),
scoped AS (
  SELECT DISTINCT tablename FROM pg_policies
  WHERE schemaname='public'
    AND coalesce(qual,'')||' '||coalesce(with_check,'') LIKE '%org_id%'
),
allowlist(t) AS (VALUES ('imobiliarias'),('imob_cards') /* … 16 tabelas service-role-only */)
SELECT o.table_name, 'sem policy org-scoped e fora da allowlist' AS falha
FROM org_tables o
LEFT JOIN scoped s ON s.tablename=o.table_name
WHERE s.tablename IS NULL AND o.table_name NOT IN (SELECT t FROM allowlist)

UNION ALL
-- 2) nenhuma policy permissiva USING(true) para public/authenticated em tabela de tenant
SELECT tablename, 'policy permissiva USING(true)'
FROM pg_policies
WHERE schemaname='public' AND permissive='PERMISSIVE'
  AND btrim(coalesce(qual,'')) IN ('true')
  AND roles && ARRAY['public','authenticated']::name[]

UNION ALL
-- 3) view exposta a anon/authenticated sem security_invoker
SELECT c.relname, 'view sem security_invoker legivel por anon/authenticated'
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('v','m')
  AND coalesce((SELECT option_value FROM pg_options_to_table(c.reloptions)
                WHERE option_name='security_invoker'),'off') NOT IN ('on','true')
  AND (has_table_privilege('anon', c.oid,'SELECT')
       OR has_table_privilege('authenticated', c.oid,'SELECT'))

UNION ALL
-- 4) SECURITY DEFINER com p_org_id que nao valida user_org_id, executavel por anon
SELECT p.proname, 'SECURITY DEFINER confia em p_org_id e e executavel por anon'
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND pg_get_function_identity_arguments(p.oid) LIKE '%p_org_id%'
  AND position('user_org_id' in pg_get_functiondef(p.oid)) = 0
  AND has_function_privilege('anon', p.oid, 'EXECUTE');
```

**Onde plugar.** O @architect apurou que **não existe `.github/workflows` nem husky** — a esteira precisa ser criada. Recomendação: teste `vitest` em `packages/web/src/lib/__tests__/rls-gate.test.ts` que roda a query e falha se retornar linhas, com a allowlist versionada em arquivo (assim crescer a allowlist exige diff revisável). Roda no CI e localmente via `pnpm test`.

**Ressalva importante:** este gate valida o **banco**, não o código. Ele não vê query em service-role sem `.eq("org_id")` — a maior superfície de risco (P8). Precisa do par: lint sobre `createAdminClient()`. Vender o gate de RLS como "isolamento garantido" seria falso.

---

## Confiabilidade desta auditoria

**Forte:** inventário, policies, grants, `SECURITY DEFINER`, views, UNIQUEs, índices, buckets — todos lidos do banco de produção, estado acumulado real. P1 e P2 confirmados por exploração (leitura sem login).

**Não verificado:**
- **Corpo completo** das 8 RPCs de P1 — confirmei ausência de `user_org_id()` no texto e a exploração de uma. Se alguma valida org por outro mecanismo, o achado individual cai (a de escrita `seed_system_roles` merece leitura manual antes do fix).
- **As 2 RPCs de escrita** não foram exploradas (mutariam produção).
- **Call sites** das views de P2 e das policies alteradas no Lote 0 — cada fix precisa dessa verificação antes de aplicar.
- **Conteúdo** de `v_mensagens_admin`: confirmei acesso (15 registros) sem ler dados, para não expor PII no relatório.
- **`packages/web/src/lib/permissions.ts` e as 166 rotas em service-role** — fora do escopo desta auditoria (é do @architect); citados porque determinam o desenho do gate.
