# ADR-003: Entitlement como Camada Distinta do RBAC, Aplicada na Aplicação

- **Status:** **Proposed** — aguarda sign-off do dono do produto (Gabriel) nas questões Q7/Q8/Q9 de `saas-multi-tenant.md` §11.3
- **Data:** 2026-07-29
- **Decisor técnico:** @architect (Aria)
- **Documento pai:** `docs/architecture/saas-multi-tenant.md` §3, §4
- **Código afetado:** `packages/web/src/lib/permissions.ts`, `permissions-modules.ts`, `lib/tenancy/*`

---

## Contexto

O projeto já tem um RBAC por módulo maduro:

- `roles` e `role_permissions (role_id, module, can_access)` por org (`supabase/migrations/047_roles_permissions.sql`).
- `user_permission_exceptions` com prioridade absoluta sobre o perfil.
- Suporte a sub-módulos com `.` (`configuracoes.integracoes`, `sistema.notificacoes-financeiras`).
- 26 módulos em `ALL_MODULES` (`packages/web/src/lib/permissions-modules.ts`).
- Cache via `unstable_cache` com tags `permissions-{orgId}`, `permissions-role-{roleId}`, `permissions-user-{userId}`.
- **70 arquivos** chamam `canAccess(userId, orgId, module)`; 2 layouts chamam `getUserPermissions`.

O que esse sistema responde é: **"este usuário pode acessar este módulo?"** — uma pergunta intra-org.

O que ele não responde, e que o SaaS exige: **"esta empresa contratou este módulo?"** — uma pergunta comercial, cujo dono é a Trifold, não o admin do cliente.

Misturar as duas quebra de forma previsível: se entitlement fosse gravado em `role_permissions`, um admin de cliente poderia se conceder um módulo não pago pela própria UI de perfis de acesso (que ele legitimamente controla).

## Decisão

### 1. Duas camadas, compostas por interseção

```
acessoEfetivo(user, módulo) = assinaturaViva(org)
                            ∧ orgEntitled(org, módulo)   ← NOVO
                            ∧ rbacPermite(user, módulo)  ← existente, inalterado
```

O entitlement é um **teto**, não um voto: aplicado **por último**, depois das exceções por usuário. Uma exceção individual nunca concede um módulo que a empresa não contratou.

### 2. Ponto único de composição

A interseção acontece dentro de `getUserPermissions()` em `packages/web/src/lib/permissions.ts`, como passo 5 (depois da aplicação de `user_permission_exceptions`). São ~15 linhas.

Motivo: os 70 call sites de `canAccess()`, a navegação da sidebar (`NAV_MODULE_MAP` em `app/dashboard/layout.tsx`) e o `app/broker/layout.tsx` herdam o comportamento sem alteração. Nenhuma migração de call site.

Dois detalhes que exigem atenção:
- O ramo `userRole === 'admin'` recebe hoje `fullMatrix()` (tudo, inclusive módulos futuros). Aplicando o filtro no passo 5, esse ramo também é filtrado — que é o comportamento correto (o admin do cliente não vê o que a empresa não comprou).
- As exceções por usuário mantêm "prioridade absoluta sobre o perfil base" **dentro** do contratado.

### 3. Entitlement é derivado, nunca materializado

Não existe tabela `org_entitlements`. O conjunto é sempre computado por `public.org_entitled_modules(p_org_id)` a partir de `org_subscriptions` + `plan_modules` + `org_module_grants` + `status`, com precedência `core > revoked > add_on > plan`.

Motivo: uma tabela materializada cria a pior classe de bug deste domínio — divergência silenciosa entre "o que o cliente pagou" e "o que o cliente acessa", em qualquer das duas direções (perda de receita ou vazamento de módulo). Derivar custa uma RPC, mitigada por cache de 300s.

### 4. Entitlement **não** entra no RLS

RLS continua com uma responsabilidade só: isolamento de tenant. O entitlement é imposto na aplicação (`getUserPermissions`, `resolveAccess`, `assertOrgEntitled` nos crons).

### 5. `resolveAccess` preserva o motivo da negativa

`Record<string, boolean>` não distingue "seu perfil não permite" de "sua empresa não contratou". Sem essa distinção o entitlement fica comercialmente invisível — o cliente vê erro em vez de oferta.

```ts
export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: 'no_permission' }
  | { allowed: false; reason: 'not_entitled'; upsellTier: number | null }
  | { allowed: false; reason: 'subscription_suspended' }
```

`canAccess()` sobrevive como wrapper booleano; as páginas que precisam de UX de upsell migram para `resolveAccess` gradualmente.

### 6. Fail-open, deliberadamente

Se a resolução de entitlement falhar (RPC fora, timeout), assume-se **tudo entitled** e emite-se alerta crítico. É o oposto do default-deny do RBAC, e é proposital: default-deny aqui derruba a operação de todos os clientes simultaneamente. Minutos de módulo extra visível custam pouco; uma hora de dashboard vazio para todos custa muito. Kill switch: `ENTITLEMENTS_ENFORCEMENT=off`.

### 7. Módulos core, nunca bloqueáveis

`dashboard`, `chamados`, `configuracoes` têm `sellable_modules.is_core = true` e ignoram plano e status. Sem eles o admin do cliente ficaria trancado fora das próprias configurações e sem canal de suporte — inclusive sem canal para pedir upgrade ou reclamar de uma suspensão indevida. (Sujeito a Q7.)

### 8. Downgrade preserva dado

Módulo removido do plano: linhas permanecem no banco com RLS intacta; rotas renderizam `<ModuleLockedScreen>` (não 404 — 404 parece bug, bloqueio parece produto); item de nav fica com cadeado se for de tier superior (oportunidade de venda) ou desaparece se foi revogação comercial específica; crons pulam a org; webhooks continuam **aceitando e persistindo** dado externo mas não disparam automação. Reativação é instantânea.

Corolário importante: **`role_permissions` continua tendo linha para todos os 26 módulos**, mesmo os não contratados. O entitlement filtra na leitura, não na escrita. Assim, contratar um módulo faz valer imediatamente a configuração de permissões que o cliente já tinha — o upgrade é um UPDATE de uma linha, não um projeto de migração.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| **Entitlement dentro de `role_permissions`** | o admin do cliente controla essa tabela pela UI; ele se concederia módulos não pagos. Além disso, downgrade/upgrade perderiam a configuração de permissões do cliente |
| **Entitlement no RLS** (policies checando `org_has_module()`) | multiplica a complexidade de 218 policies; downgrade passaria a bloquear **leitura**, conflitando com "dados preservados"; risco alto de quebrar a operação da Trifold; e ainda não protegeria as 166 rotas service-role. RLS ganha uma segunda responsabilidade e fica pior nas duas |
| **Tabela `org_entitlements` materializada por trigger** | divergência silenciosa entre pago e acessado; drift em qualquer caminho de escrita que esqueça o trigger |
| **Coluna `organizations.settings.modules` (jsonb)** | sem histórico, sem preço, sem add-on com validade, sem `reason` de revogação; e `settings` já é usado para outras coisas |
| **Middleware por rota** em vez de composição em `permissions.ts` | 285 rotas + 87 páginas para anotar; qualquer esquecimento é vazamento de módulo. O ponto único é auditável |

## Consequências

**Positivas:** raio de mudança minúsculo (~15 linhas no core + módulo novo isolado); RBAC intocado; upsell tem lugar natural; downgrade é reversível e não destrutivo; a Trifold vira apenas "org com plano `completo-interno`", o que torna a operação real da empresa o melhor teste de regressão do sistema.

**Negativas e aceitas:**
- Latência de até 300s entre a Trifold liberar um módulo e o cliente ver (mitigado: o botão do `/platform` invalida a tag na hora; o TTL só cobre mudança feita direto no banco).
- O entitlement fora do RLS significa que um bug de aplicação pode expor um módulo não contratado. É uma perda de receita, não um vazamento de dado de outro tenant — escolha consciente de qual falha é tolerável.
- `permissions.ts` passa a ser o arquivo mais crítico do sistema (decide se todo mundo vê qualquer coisa). Exige teste do caminho de falha, não só do caminho felizardo.
- Existe uma deriva a controlar: `getHardcodedPermissions()` (TypeScript, `permissions.ts:62-116`) é hoje a fonte dos defaults por role, e o provisionamento de nova org precisa dos mesmos defaults em SQL. Solução: tabela `role_default_permissions` como fonte única + teste de paridade.
