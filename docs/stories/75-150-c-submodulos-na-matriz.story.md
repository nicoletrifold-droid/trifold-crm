# Story 75-150-c — Sub-módulos gerenciáveis na matriz de Perfil de Acesso

## Metadata
- **Status:** Done
- **Epic:** 75 — Perfil de Acesso
- **Branch:** story-75-150c-submodulos-matriz

## Context
Follow-up da 75-150-b. Os sub-módulos por role (ex.: `sistema.notificacoes-financeiras`) eram geridos só por dado/migration — não apareciam na tela da matriz de Perfil de Acesso. Marcos pediu para deixar pronto o gerenciamento pela interface.

Base já existia: `SUBMODULE_MAP` (permissions-modules.ts), `updatePermission` aceita qualquer `module` (inclusive dotted) e é admin-only, e o `canAccess` já resolve sub-módulo por role (75-150-b).

## Acceptance Criteria
- [x] AC1: a matriz renderiza, sob cada módulo que tem sub-módulos (via `SUBMODULE_MAP`), uma sub-linha por sub-módulo, com toggle por role.
- [x] AC2: o toggle do sub-módulo grava a chave dotted em `role_permissions` (reusa `updatePermission`), com update otimista + rollback (mesmo fluxo dos módulos).
- [x] AC3: herança visual — sub sem valor explícito mostra o estado do módulo pai (o efetivo do `canAccess`).
- [x] AC4: `sistema.notificacoes-financeiras` cadastrado no `SUBMODULE_MAP` (aparece sob "Sistema").
- [x] AC5: busca também casa rótulos de sub-módulos (mostra o pai quando o termo bate num sub).
- [x] AC6: sem regressão — módulos top-level e o resto da matriz inalterados; `configuracoes.*` continua listado.

## Out of Scope
- Enforcement de novos sub-módulos além dos já gateados no código (a matriz só liga/desliga; o `canAccess` no código é que restringe de fato — não criar toggle sem gate para evitar "botão que mente").

## Dependencies
- `SUBMODULE_MAP`, `updatePermission`, `canAccess` (sub-módulo por role, 75-150-b).

## Complexity
- **T-shirt:** S (registro no SUBMODULE_MAP + sub-linhas na matriz).

## Business Value
Admin passa a conceder/revogar sub-módulos (ex.: "Notificações Financeiras" para supervisor) direto na interface, sem depender de dev/migration. Firma o padrão de acesso fino gerenciável.

## Risks
- Baixo. UI-only. Só cria toggles para sub-módulos que já têm gate no código (hoje `sistema.notificacoes-financeiras` e os `configuracoes.*`). Não expõe sub-módulos sem enforcement.

## File List
- `docs/stories/75-150-c-submodulos-na-matriz.story.md` (this file)
- `packages/web/src/lib/permissions-modules.ts` (SUBMODULE_MAP += sistema)
- `packages/web/src/app/dashboard/configuracoes/perfil-acesso/permissions-matrix.tsx` (sub-linhas + busca por sub-label)

## QA Results (@qa / Quinn)
- **Gate: PASS.** `tsc` 0, ESLint limpo, suíte 883/883. Reusa `updatePermission` (admin-only) + fluxo otimista existente. Herança visual do pai para subs sem valor explícito.
- **Validação real:** Config › Perfil de Acesso → expandir "Sistema" → ver a sub-linha "Notificações Financeiras" com o supervisor ligado; ligar/desligar reflete no acesso.
