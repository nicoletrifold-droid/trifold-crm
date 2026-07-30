# ADR-004: Impersonation Auditada para Suporte Cross-Org

- **Status:** **Proposed** — requer aprovação explícita do dono do produto (questões Q3 e Q4 de `saas-multi-tenant.md` §11.3). **Não implementar sem sign-off.**
- **Data:** 2026-07-29
- **Decisor técnico:** @architect (Aria)
- **Documento pai:** `docs/architecture/saas-multi-tenant.md` §3.3, §3.5, §6.2
- **Código afetado:** `packages/web/src/lib/auth.ts` (`getServerUser`), `lib/tenancy/platform-auth.ts`, `app/platform/**`

---

## Contexto

Com o SaaS, a Trifold vai prestar suporte a empresas cujos dados ela não deve ver rotineiramente. Duas necessidades entram em conflito:

1. **Operacional:** "a Nicole respondeu errado nesse lead", "o corretor não está vendo o card" — diagnosticar exige ver a tela do cliente.
2. **Privacidade/LGPD:** os dados incluem PII de **terceiros** (os leads do cliente, que não têm relação contratual com a Trifold) e comunicação privada.

O painel `/platform` foi projetado para ver apenas metadados e agregados (§3.4: lista fechada `PLATFORM_READABLE_TABLES`, sem PII de lead, sem conteúdo de mensagem, sem documento, sem financeiro do Sienge). Isso resolve 90% do suporte (status de integração, cota, permissões, stages) e **não** resolve os 10% que exigem ver a tela.

Sem uma resposta explícita, o vácuo se preenche do pior jeito: pedir print ao cliente (não diagnostica), rodar SQL manual em produção (sem auditoria, sem limite, invisível) ou pedir a senha do cliente (indefensável).

Há também um obstáculo técnico específico deste stack: o RLS deriva a org de `auth.uid()` via `public.user_org_id()` (`supabase/migrations/004_rls_policies.sql:10-13`). Durante uma impersonation o `auth.uid()` continua sendo o do operador da Trifold, então uma leitura pelo client autenticado devolveria a org **da Trifold**, não a do cliente.

## Decisão

**Sim a impersonation**, com sete controles simultâneos. Ausência de qualquer um deles reprova a implementação no QA gate.

| # | Controle | Regra |
|---|---|---|
| 1 | Autorização | apenas `platform_admins.level ∈ {owner, operator}`; `support` só read-only |
| 2 | Justificativa | `reason` obrigatório, mínimo 20 caracteres, gravado em `platform_impersonation_sessions.reason` e em `platform_audit_log` |
| 3 | Tempo | máximo **60 minutos** (`expires_at`), verificado em **cada request**, não só na abertura |
| 4 | Escrita | **read-only por padrão.** `write_enabled = true` exige `level = 'owner'` + segundo confirm explícito |
| 5 | Visibilidade | banner fixo vermelho em todas as páginas com nome da org e cronômetro de expiração |
| 6 | Notificação | e-mail automático ao admin da org no início da sessão (`client_notified_at`) |
| 7 | Trilha | leitura registra `action='impersonation.read'` com a tabela; escrita registra `before`/`after`. `platform_audit_log` é **append-only** (`REVOKE UPDATE, DELETE`), escrita só por função `SECURITY DEFINER` |

### Mecanismo técnico

`createImpersonationClient(session)`: client **service-role** embrulhado em `Proxy` que injeta `.eq('org_id', session.target_org_id)` em toda query e **lança** se a tabela tiver `org_id` e o filtro não puder ser aplicado. Se `write_enabled = false`, bloqueia `insert`/`update`/`delete`/`upsert`/`rpc` mutante.

`getServerUser()` em `packages/web/src/lib/auth.ts` ganha overlay: cookie de sessão de impersonation válido + caller é platform admin ⇒ retorna `AppUser` com `orgId`/`role` do alvo e metadado `impersonation: { sessionId, expiresAt, writeEnabled }`.

**Proibido:** mutar `users.org_id` para impersonar. Seria irreversível em caso de crash no meio da sessão e apareceria no banco como dado real.

## Alternativas consideradas

| Alternativa | Análise | Veredito |
|---|---|---|
| **Não ter impersonation** | força print/SQL manual/senha do cliente — todos piores e sem auditoria. O risco de não ter excede o de ter | rejeitado |
| **Emitir sessão Supabase do usuário-alvo** | credencial real de outra pessoa; indistinguível de invasão nos logs de auth; permite escrita sem controle; o cliente não consegue provar que não foi ele | rejeitado |
| **GUC/claim lido por `user_org_id()`** — `begin_impersonation()` faz `set_config('app.impersonated_org', …)` e a função passa a preferir o GUC | elegante e mantém o RLS como enforcement. Mas o PostgREST do Supabase usa **conexões pooled** e o ciclo de vida de GUC por request não é confiável o bastante para ser a base de um controle de segurança. Se vazar entre requests, é vazamento cross-tenant silencioso — o cenário catastrófico exato que estamos tentando evitar | rejeitado nesta fase; reavaliar se o Supabase documentar garantia de reset por request |
| **Service-role com filtro de org forçado** | perde o RLS como rede durante a sessão, mas é determinístico e testável | **aceito** |
| Impersonation com escrita liberada por padrão | remove a maior parte do valor de auditoria (não se distingue "olhei" de "mudei") e cria risco de o suporte alterar dado do cliente por engano | rejeitado |

## Consequências

**Positivas:** suporte diagnostica de verdade; toda entrada em ambiente de cliente tem ator, motivo, duração e trilha imutável; o cliente é notificado (defensável perante LGPD e perante o próprio cliente); o caminho de acesso privilegiado fica concentrado em ~80 linhas testáveis em vez de espalhado em SQL manual.

**Negativas e aceitas:**
- **Perde-se o RLS como rede durante a sessão.** É o custo direto da alternativa escolhida. Mitigações: o wrapper é único no código, tem teste por tabela, a sessão é curta, justificada, notificada e auditada, e o mesmo wrapper (`createOrgScopedAdminClient`) é reaproveitado no hardening das 166 rotas service-role — ou seja, é código que precisa existir de qualquer forma (ADR-002, item 4).
- **É uma backdoor por design.** Risco R7 do documento pai, classificado como impacto crítico. Aceito somente com os sete controles ativos.
- `getServerUser()` passa a ter um caminho condicional, e é a função por onde passa 100% das requests autenticadas. Exige teste dedicado do caminho sem impersonation (o caminho comum não pode regredir).
- O e-mail ao cliente (controle 6) é o ponto comercialmente sensível: dá transparência, mas expõe que a Trifold entrou no ambiente. É a questão Q3 para o dono do produto. Recomendação: manter — a alternativa é o cliente descobrir depois, o que é muito pior.

## Pendências para sign-off

- **Q3:** aprovação dos sete controles como pacote, especialmente o e-mail automático ao admin do cliente.
- **Q4:** existe caso de suporte que exija ver PII/conversa **fora** de impersonation? Se sim, modelar como pedido de acesso com aprovação do cliente, não como permissão padrão do `/platform`.
