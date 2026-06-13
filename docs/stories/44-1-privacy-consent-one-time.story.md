# Story 44.1 — Aceite de privacidade único com log de auditoria (LGPD)

**Status:** Done  
**Epic:** 44 — Conformidade Legal / LGPD  
**Criada por:** @sm (River)  
**Data:** 2026-05-26  

---

## Contexto

O portal do cliente exibe um modal de aceite da Política de Privacidade (LGPD) a cada acesso.
A intenção já era exibir apenas uma vez (o campo `privacy_accepted_at` existe em `users`), mas
o aceite nunca é salvo porque a RLS da tabela `users` só permite UPDATE por admins — o server
action falha silenciosamente e `privacy_accepted_at` fica sempre `null`.

Além de corrigir o bug, o usuário quer um **log de auditoria imutável** do aceite para uso jurídico
(data, hora, usuário, versão da política).

---

## User Stories

> Como **cliente do portal**, quero que o modal de privacidade apareça apenas na primeira vez que
> acesso o sistema, para que não precise aceitar os termos a cada login.

> Como **gestor da Trifold**, quero que cada aceite fique registrado com data, hora e identificação
> do cliente, para que tenhamos prova jurídica válida em caso de questionamentos sobre a LGPD.

---

## Acceptance Criteria

### AC-1: Aceite salvo corretamente na primeira vez
- [ ] Ao clicar "Aceitar e continuar", o campo `privacy_accepted_at` é gravado em `users` via `createAdminClient()` (bypassa RLS)
- [ ] Na próxima visita (novo login ou recarregamento), o modal NÃO aparece mais
- [ ] O modal só aparece de novo se `privacy_accepted_at` for explicitamente zerado (ex: nova versão da política)

### AC-2: Log de auditoria imutável
- [ ] Tabela `privacy_consents` criada com campos: `id`, `user_id`, `accepted_at`, `policy_version`
- [ ] A cada aceite, um registro é inserido em `privacy_consents` (não é update — é INSERT, log imutável)
- [ ] `policy_version` armazena a versão atual da política (string, ex: `"2026-05-26"`)
- [ ] RLS: apenas o próprio usuário pode inserir; admin pode ler todos

### AC-3: Server action corrigida
- [ ] `acceptPrivacy()` usa `createAdminClient()` para o UPDATE em `users.privacy_accepted_at`
- [ ] `acceptPrivacy()` insere registro em `privacy_consents` com `user_id` e `accepted_at`
- [ ] Em caso de falha em qualquer etapa, retorna `{ error: "..." }` — nunca retorna `{ ok: true }` se o dado não foi salvo
- [ ] Nenhuma alteração necessária no componente frontend (`PrivacyConsentModal`) — já funciona corretamente

### AC-4: Sem regressões
- [ ] Clientes que já tinham `privacy_accepted_at` preenchido continuam sem ver o modal
- [ ] Clientes com `privacy_accepted_at = null` (todos os atuais) verão o modal uma última vez

---

## Causa Raiz Identificada

```sql
-- Policy atual (bloqueia clientes de atualizar seu próprio registro):
"users_update_admin": USING (org_id = user_org_id() AND user_role() = 'admin')
```

O `acceptPrivacy()` chamava `supabase.from("users").update(...)` com o client RLS-restricted.
Como o cliente tem `role='cliente'` (não `'admin'`), o UPDATE retornava 0 linhas sem erro.

**Fix:** usar `createAdminClient()` (service role key) no server action — operação segura pois
o server action roda exclusivamente no servidor.

---

## Tarefas

- [x] T1: Migration `067_privacy_consents.sql` — criar tabela `privacy_consents` + RLS
- [x] T2: Corrigir `acceptPrivacy()` em `actions.ts` — usar `createAdminClient()` + inserir em `privacy_consents`
- [x] T3: QA gate — TypeScript: 0 erros, ESLint: 0 erros, testar fluxo no local

---

## Arquivos Afetados

**Novos:**
- `supabase/migrations/067_privacy_consents.sql`

**Modificados:**
- `packages/web/src/app/cliente/[obra_id]/actions.ts`

---

## Notas Técnicas

- `createAdminClient()` usa `SUPABASE_SERVICE_ROLE_KEY` — seguro em server actions (nunca exposto ao browser)
- `policy_version`: usar data ISO da política atual (`"2026-05-26"`) — fácil de atualizar quando a política mudar
- Não alterar o componente `PrivacyConsentModal` — a lógica frontend já está correta
- Log imutável: `privacy_consents` só tem INSERT (sem UPDATE/DELETE para não-admins)

---

## Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-05-26 | @sm (River) | Story criada — causa raiz identificada via query SQL |
| 2026-05-26 | @po (Pax) | Validação GO (10/10) — Status: Draft → Ready |
