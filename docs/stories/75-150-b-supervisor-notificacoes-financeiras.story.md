# Story 75-150-b — Supervisor vê só "Notificações Financeiras" no Sistema (sub-módulo por role)

## Metadata
- **Status:** Done
- **Epic:** 75 — Notificações do Portal / Perfil de Acesso
- **Branch:** story-75-150b-supervisor-notif-financeiras

## Context
Follow-up da 75-150. O extrato Notificações Financeiras ficou admin-only (módulo `sistema` só do admin). Marcos quer que **todos os supervisores** vejam o módulo Sistema mas, por dentro, **só** o card de Notificações Financeiras — o mesmo padrão de sub-módulo que a Fernanda usa no Config.

Achado: o `canAccess` resolvia sub-módulo (`modulo.sub`) só por **exceção de usuário** (`user_permission_exceptions`), herdando o pai caso contrário. Não havia suporte a sub-módulo por **role**. Confirmado que NÃO existem linhas dotted em `role_permissions` hoje → estender é retrocompatível.

## Acceptance Criteria
- [x] AC1: `canAccess` passa a resolver sub-módulo por ROLE — após a exceção de usuário, consulta o mapa de permissões (role_permissions) para a chave dotted antes de herdar o pai. Retrocompatível (sem linhas dotted → comportamento antigo).
- [x] AC2: role `supervisor` recebe `sistema.notificacoes-financeiras = true` (migration 168, idempotente).
- [x] AC3: menu lateral mostra "Sistema" para acesso total OU `sistema.notificacoes-financeiras`; "Email Marketing" só para acesso total.
- [x] AC4: a tela Sistema, para quem tem só o sub-módulo, mostra **apenas** o card Notificações Financeiras (sem Email Marketing, Plataforma, Log de Atividades nem telemetria de admin). Acesso total inalterado.
- [x] AC5: página/API do extrato gateadas por `canAccess("sistema.notificacoes-financeiras")` (admin herda; supervisor via role).
- [x] AC6: sem regressão — admin continua vendo tudo; testes/tsc/lint limpos.

## Out of Scope
- Expor sub-módulos na UI da matriz de Perfil de Acesso (hoje geridos por dado, como as exceções da Fernanda).
- Aplicar o padrão a outros cards do Sistema.

## Dependencies
- `canAccess`/`getUserPermissions` (permissions.ts), `role_permissions`, layout do dashboard, tela Sistema.

## Complexity
- **T-shirt:** M (extensão de função core + migration + sidebar + refactor da landing + novo endpoint de acesso).

## Business Value
Supervisores passam a acompanhar as cobranças enviadas aos clientes por empreendimento, sem ganhar acesso ao resto do Sistema. Firma o padrão de sub-módulo por role, reutilizável.

## Risks
- `canAccess` é core (~37 usos). Mudança isolada ao ramo dotted e retrocompatível (0 linhas dotted hoje). Ramo não-dotted intocado.

## Definition of Done
- AC1–AC6; migrations 168 aplicada; testes 883/883; `tsc`+ESLint limpos; deploy via @devops.

## File List
- `docs/stories/75-150-b-supervisor-notificacoes-financeiras.story.md` (this file)
- `supabase/migrations/168_supervisor_notificacoes_financeiras.sql` (grant do sub-módulo ao supervisor)
- `packages/web/src/lib/permissions.ts` (canAccess: sub-módulo por role)
- `packages/web/src/app/dashboard/layout.tsx` (sidebar: Sistema p/ sub-módulo, Email só total)
- `packages/web/src/app/api/sistema/access/route.ts` (novo — capacidades do usuário na tela Sistema)
- `packages/web/src/app/dashboard/sistema/page.tsx` (modo restrito: só cards permitidos)
- `packages/web/src/app/api/sistema/notificacoes-financeiras/route.ts` (gate por sub-módulo)

## QA Results (@qa / Quinn)
- **Gate: PASS.** Migration 168 aplicada; `tsc` 0, ESLint limpo, suíte 883/883. Extensão do canAccess restrita ao ramo dotted e retrocompatível (0 linhas dotted pré-existentes). 
- **Validação real sugerida:** logar como supervisor → ver "Sistema" no menu → abrir → só o card "Notificações Financeiras" → abrir o extrato. Admin: tudo igual.
