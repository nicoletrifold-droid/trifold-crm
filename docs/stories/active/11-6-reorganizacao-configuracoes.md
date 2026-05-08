status: Done

# Story 11.6 — Reorganizacao Configuracoes

## Contexto
Separar "Configuracoes" (empresa, usuarios) de "Pipeline" (etapas, follow-up). Criar CRUD de usuarios.

## Acceptance Criteria
- [ ] AC1: /dashboard/configuracoes vira hub com cards: Empresa, Usuarios, Horario Comercial, Integracoes, Personalidade Nicole
- [ ] AC2: /dashboard/configuracoes/empresa — dados da Trifold (nome, endereco, logo, CNPJ). GET/PATCH /api/organization
- [ ] AC3: /dashboard/configuracoes/usuarios — lista de todos os usuarios da org com role, status, acoes
- [ ] AC4: CRUD de usuarios: criar (com Supabase Auth), editar role, ativar/desativar
- [ ] AC5: Pipeline config (etapas + follow-up) move para /dashboard/pipeline/config
- [ ] AC6: Sidebar reflete nova organizacao: "Config" leva ao hub, "Pipeline" inclui sub-item "Config"
- [ ] AC7: Responsivo: cards no hub se adaptam em mobile
- [ ] AC8: Breadcrumbs nas sub-paginas de configuracao

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/dashboard/configuracoes/page.tsx` — hub de configuracoes com cards
- `packages/web/src/app/dashboard/configuracoes/empresa/page.tsx` — pagina de dados da empresa
- `packages/web/src/app/dashboard/configuracoes/usuarios/page.tsx` — lista e CRUD de usuarios
- `packages/web/src/app/api/organization/route.ts` — API GET/PATCH dados da organizacao
- `packages/web/src/app/api/users/route.ts` — API CRUD de usuarios

## Dependencias
- Depende de: Nenhuma
- Bloqueia: Nenhuma

## Estimativa
M — 2-3h

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
