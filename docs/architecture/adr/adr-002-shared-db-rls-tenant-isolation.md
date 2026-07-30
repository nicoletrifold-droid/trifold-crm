# ADR-002: Isolamento de Tenant por Shared Database + RLS Endurecida

- **Status:** **Accepted** (decisão de negócio do dono do produto, Gabriel, em 2026-07-29 — não reaberta neste ADR); desenho técnico do @architect (Aria)
- **Data:** 2026-07-29
- **Decisores:** dono do produto (escolha do modelo); @architect (mecanismo de garantia)
- **Documento pai:** `docs/architecture/saas-multi-tenant.md` §1, §8
- **Dependência:** `docs/audits/rls-multi-tenant-audit.md` (@data-engineer)

---

## Contexto

O Trifold CRM vai de single-tenant (uso interno da Trifold Engenharia) para SaaS multi-tenant. A pergunta de isolamento tem três respostas clássicas: banco por tenant, schema por tenant, ou banco compartilhado com Row Level Security.

O estado atual favorece fortemente a terceira opção, porque ela já está meio construída:

- `organizations` existe desde `supabase/migrations/001_base_schema.sql:58`.
- `users.org_id NOT NULL REFERENCES organizations` desde o dia 1.
- `public.user_org_id()` existe desde `supabase/migrations/004_rls_policies.sql:10-13`.
- `org_id` aparece em 121 migrations e 357 arquivos TS/TSX.
- 218 policies RLS já escritas em 59 migrations.

E o estado atual também revela o problema:

- Apenas **~98 de 195 cláusulas `USING`** mencionam `org_id`. Há lacunas reais de isolamento cross-tenant (detalhamento na auditoria do @data-engineer).
- **166 dos 285 route handlers usam `createAdminClient()`** — service-role, que **bypassa RLS por completo**. Nessas rotas o isolamento hoje depende de alguém ter escrito `.eq("org_id", …)` à mão.
- **Não existe CI.** `.github/` só tem `agents/`. Nada verifica nada automaticamente.
- **Não existe staging.** O Supabase de dev aponta para produção.

## Decisão

**Shared database + RLS endurecida**, com quatro mecanismos de garantia obrigatórios:

1. **Invariante de schema:** toda tabela de dados de tenant tem `org_id NOT NULL`, RLS habilitada, e policy org-scoped para **cada** um dos quatro comandos (SELECT/INSERT/UPDATE/DELETE), com `WITH CHECK` onde há escrita.
2. **Gate automatizado em CI** (`pnpm gate:tenancy`, `scripts/gate-tenancy.ts`) com as regras R1-R7 de `saas-multi-tenant.md` §8.2, operando com **baseline + catraca**: a contagem de violações nunca pode aumentar, e qualquer tabela nova sem `org_id` fora da allowlist é FAIL absoluto desde o dia 1.
3. **Testes de isolamento cross-tenant** (`tests/tenancy/cross-tenant.spec.ts`), data-driven pelo snapshot de schema, cobrindo leitura, escrita cega, e tentativa de forjar `org_id` no INSERT.
4. **Escopo obrigatório no caminho service-role:** `createOrgScopedAdminClient(orgId)` — proxy que injeta o filtro de org em toda query e lança se a tabela tiver `org_id` e o filtro não puder ser aplicado — mais regra de ESLint `aios/no-unscoped-admin-client`.

O item 4 é o que diferencia esta decisão de "só escrever policies". Como 58% dos handlers bypassam RLS, **RLS é a rede, não o piso**. Sem o item 4 o gate dá falsa segurança: o banco fica correto e a aplicação continua podendo vazar.

Tabelas legitimamente sem `org_id` (plataforma: `platform_*`, `plans`, `sellable_modules`, e as três tabelas do Epic 78) ficam em `docs/audits/tenancy-allowlist.yml` com campo `reason:` obrigatório.

## Alternativas consideradas

| Alternativa | Prós | Contras | Veredito |
|---|---|---|---|
| **Banco por tenant** | isolamento físico; blast radius de bug = 1 cliente; export/delete trivial | 192 migrations × N bancos; sem query cross-org para o `/platform`; custo por tenant no Supabase; provisionamento pesado; nenhum reuso das 218 policies | rejeitado (decisão do dono do produto) |
| **Schema por tenant** | isolamento razoável, um banco | `search_path` por request é frágil em conexão pooled do Supabase; migrations em N schemas; RLS existente jogada fora | rejeitado |
| **Shared DB + RLS** | reaproveita 100% do investimento existente; `/platform` cross-org é query normal; provisionamento é INSERT; custo constante | um bug de policy afeta todos; service-role bypassa; exige disciplina verificável | **aceito** |
| Shared DB **sem** gate de CI | menos trabalho inicial | a invariante degrada em silêncio; foi exatamente assim que surgiram as ~97 lacunas atuais | rejeitado |

## Consequências

**Positivas:** provisionamento de org é uma transação; o painel `/platform` faz agregação cross-org com SQL comum; custo de infra não cresce por cliente; as 218 policies existentes são ativo, não passivo.

**Negativas e aceitas:**
- Uma policy errada em uma tabela quente pode expor dado de todos os tenants. Mitigação: gate + testes + revisão obrigatória de QA em migration de policy.
- A Onda 1 (fechar as lacunas) é grande, chata e sem valor visível para o usuário — risco real de perda de momento. Mitigação: baseline com catraca permite trabalho em lotes por domínio, com progresso mensurável em cada PR.
- Os testes cross-tenant criam e apagam orgs, então **não podem rodar em produção**. Como o Supabase de dev aponta para prod, isso é um **bloqueador aberto** (questão Q6 em `saas-multi-tenant.md` §11.3).

**Regra de sequenciamento:** nenhuma feature de venda entra antes do gate estar bloqueante e verde. Um vazamento cross-tenant no primeiro cliente encerra o produto; um atraso de duas semanas não.
