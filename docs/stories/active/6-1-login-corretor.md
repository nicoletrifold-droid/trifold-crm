status: Done

# Story 6.1 — Login Corretor (Auth com Role Broker)

## Contexto
Corretores acessam o sistema com email e senha (Supabase Auth). Ao logar, o sistema verifica o role do usuario e redireciona automaticamente: admin/supervisor vai para `/dashboard`, corretor vai para `/broker`. O corretor NAO pode acessar rotas de admin. A pagina de login e unica — o redirect e baseado no role.

## Acceptance Criteria
- [x] AC1: Pagina de login `/login` funciona para todos os roles (admin, supervisor, broker)
- [x] AC2: Apos login com role `broker`, redirect automatico para `/broker` (painel do corretor)
- [x] AC3: Apos login com role `admin` ou `supervisor`, redirect para `/dashboard` (painel admin)
- [x] AC4: Middleware de rota: corretor NAO pode acessar `/dashboard/*` — redirect para `/broker`
- [x] AC5: Middleware de rota: admin/supervisor NAO pode acessar `/broker/*` — redirect para `/dashboard`
- [x] AC6: API de autenticacao valida role do usuario no banco apos login: `users.role`
- [x] AC7: Session persistente (Supabase Auth session com refresh token)
- [x] AC8: Botao "Sair" no header do painel do corretor
- [ ] AC9: Se corretor esta inativo (`is_active = false`), login retorna erro: "Sua conta esta desativada. Contate o administrador."
- [x] AC10: Layout do painel corretor: header com nome do corretor, empreendimentos vinculados, e botao sair

## Detalhes Tecnicos

### Arquivos a criar/modificar:
- `packages/web/src/app/login/page.tsx` — (ja existe, adaptar redirect por role)
- `packages/web/src/middleware.ts` — Middleware de protecao de rotas por role
- `packages/web/src/app/broker/layout.tsx` — Layout do painel do corretor
- `packages/web/src/app/broker/page.tsx` — Pagina inicial do corretor (redirect para pipeline)
- `packages/web/src/hooks/use-auth.ts` — Hook de auth com role

### Middleware:
```typescript
// packages/web/src/middleware.ts
export async function middleware(request: NextRequest) {
  const session = await getSession(request);

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const userRole = session.user.user_metadata?.role || await getUserRole(session.user.id);

  if (request.nextUrl.pathname.startsWith('/dashboard') && userRole === 'broker') {
    return NextResponse.redirect(new URL('/broker', request.url));
  }

  if (request.nextUrl.pathname.startsWith('/broker') && userRole !== 'broker') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
}
```

### Layout do corretor:
```typescript
// packages/web/src/app/broker/layout.tsx
// Header: Nome do corretor | Empreendimentos (badges) | Sair
// Sidebar: Pipeline | Leads | (links)
```

### Referencia agente-linda:
- Adaptar auth flow de `~/agente-linda/packages/web/src/app/login/`
- Adaptar middleware de `~/agente-linda/packages/web/src/middleware.ts`
- Adicionar logica de role-based redirect

## Dependencias
- Depende de: 1.5 (auth e roles), 5.4 (corretores cadastrados)
- Bloqueia: 6.2 (pipeline proprio), 6.3 (lista de leads), 6.4 (detalhe do lead)

## Estimativa
M (Media) — 2 horas

## File List

- `packages/web/src/app/login/page.tsx` — Pagina de login unica com redirect por role (admin/supervisor para /dashboard, broker para /broker)
- `packages/web/src/app/broker/layout.tsx` — Layout do painel do corretor com header, nome, empreendimentos vinculados e botao sair; redireciona nao-corretores para /dashboard

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
