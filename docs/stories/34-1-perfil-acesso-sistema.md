# Story 34.1 — Perfil de Acesso ao Sistema

## Status: Ready for Review

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run typecheck", "npm run lint", "browser test"]

## Story

**Como** administrador do Trifold CRM,
**Quero** uma página "Perfil de Acesso" dentro de Configurações que exiba os perfis de acesso existentes no sistema e suas permissões,
**Para que** eu possa consultar facilmente o que cada tipo de usuário pode ver e fazer na plataforma.

## Contexto

O sistema possui 4 roles fixos: `admin`, `supervisor`, `broker` (Corretor) e `obras`. Atualmente não há nenhuma interface que documente ou exiba o que cada role pode acessar — o conhecimento está disperso no código (`getServerUser`, redirects, guards de UI).

Esta story cria uma página informativa em `/dashboard/configuracoes/perfil-acesso` que lista os perfis e suas capacidades de acesso ao sistema, acessível apenas para `admin`.

**Padrão visual de referência:** `/dashboard/configuracoes/usuarios/page.tsx` — estrutura de página com back link, heading, e tabela/cards em `bg-white dark:bg-stone-900`.

**Padrão de rota:** server component de página, sem client component separado (leitura estática).

## Acceptance Criteria

### Card na página de Configurações
- [x] AC1: Card "Perfil de Acesso" adicionado ao array `CONFIG_CARDS` em `/dashboard/configuracoes/page.tsx` com `href: "/dashboard/configuracoes/perfil-acesso"`, `icon: "◫"`, `title: "Perfil de Acesso"`, `description: "Permissões por perfil de usuário"`
- [x] AC2: Card renderiza corretamente na grade (dark mode e light mode)

### Proteção de acesso
- [x] AC3: Página `/dashboard/configuracoes/perfil-acesso/page.tsx` chama `getServerUser()` e redireciona para `/dashboard` se `user.role !== "admin"`

### Exibição dos perfis
- [x] AC4: Página exibe 4 cards/blocos — um para cada role: **Admin**, **Supervisor**, **Corretor** (`broker`), **Obras**
- [x] AC5: Cada card exibe: nome do perfil, badge colorido com a role (reutilizar as cores de `usuarios/page.tsx`: purple=admin, blue=supervisor, green=broker, yellow=obras), e lista de módulos/páginas que o perfil pode acessar
- [x] AC6: A matriz de acesso é definida como constante estática no arquivo da página (sem banco de dados) e reflete o comportamento real do sistema:

| Módulo | Admin | Supervisor | Corretor | Obras |
|--------|-------|------------|----------|-------|
| Dashboard | ✓ | ✓ | — | — |
| Pipeline | ✓ | ✓ | ✓ (próprio) | — |
| Leads | ✓ | ✓ | ✓ (próprios) | — |
| Imóveis | ✓ | ✓ | ✓ | — |
| Corretores | ✓ | ✓ | — | — |
| Conversas | ✓ | ✓ | ✓ | — |
| Agenda | ✓ | ✓ | ✓ | — |
| Alertas | ✓ | ✓ | ✓ | — |
| Atividades | ✓ | ✓ | ✓ | — |
| Analytics | ✓ | ✓ | — | — |
| Campanhas | ✓ | ✓ | — | — |
| Treinamento | ✓ | ✓ | ✓ | — |
| Obras | ✓ | ✓ | — | ✓ |
| Brindes | ✓ | ✓ | — | ✓ |
| Mensagens | ✓ | ✓ | — | — |
| Configurações | ✓ | — | — | — |
| Sistema | ✓ | — | — | — |

- [x] AC7: Itens com acesso exibem ícone ✓ verde; itens sem acesso exibem "—" em cinza (não exibir ✗ vermelho — foco positivo)
- [x] AC8: Nota de rodapé: *"Perfis de acesso são fixos no sistema. Para alterar o perfil de um usuário, acesse [Usuários](/dashboard/configuracoes/usuarios)."*

### Layout e UX
- [x] AC9: Back link `← Configurações` no topo da página (href `/dashboard/configuracoes`)
- [x] AC10: Heading `Perfil de Acesso` com subtítulo `Módulos disponíveis por perfil de usuário`
- [x] AC11: Cards organizados em grid `grid-cols-1 sm:grid-cols-2` com visual consistente ao restante de Configurações

## Escopo

**IN:**
- `/dashboard/configuracoes/page.tsx` — adicionar card "Perfil de Acesso"
- `/dashboard/configuracoes/perfil-acesso/page.tsx` — nova página (server component)

**OUT:**
- Edição ou customização de permissões (sistema de roles é fixo no código)
- Persistência em banco de dados
- Qualquer alteração no sistema de autenticação ou guards existentes
- Novas roles ou modificação das roles existentes

## Dependências

- Nenhuma dependência de story — feature standalone de UI
- Depende de: `getServerUser()` em `@web/lib/auth` (já existe)

## Estimativa

**Complexidade:** XS — 1 arquivo novo + 1 linha em arquivo existente, apenas UI estática

## Valor de Negócio

Administradores precisam entender rapidamente o que cada perfil pode fazer antes de atribuir roles a novos usuários. Hoje esse conhecimento não existe na UI, gerando dúvidas e suporte desnecessário.

## Riscos

- Baixo: matriz de acesso definida manualmente pode ficar desatualizada se novas páginas forem adicionadas sem atualizar esta página — aceitável para MVP

## Definition of Done

- [x] Card "Perfil de Acesso" visível e clicável em `/dashboard/configuracoes`
- [x] Página exibe os 4 perfis com suas permissões
- [x] Acesso restrito a `admin` (redirect para `/dashboard` para outros roles)
- [x] Dark mode funcionando corretamente
- [x] `npm run typecheck` passa sem erros novos
- [x] `npm run lint` passa sem erros novos

## File List

### Modified
- `packages/web/src/app/dashboard/configuracoes/page.tsx`

### Created
- `packages/web/src/app/dashboard/configuracoes/perfil-acesso/page.tsx`

## QA Results

**Veredicto:** PASS
**Data:** 2026-05-20 | **Agente:** @qa (Quinn)

**Checks:** 7/7 ✅
- Código limpo, seguro, padrões do projeto respeitados
- 11/11 ACs verificados
- Zero regressões
- Performance ótima (server component estático)
- Segurança: guard admin + redirect implementado corretamente

**Observação LOW (out of scope):** Card visível para supervisor/broker em `/configuracoes` — comportamento consistente com padrão existente do projeto (card Usuários tem o mesmo comportamento).

---

## Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-05-20 | @sm (River) | Story criada — Draft |
| 2026-05-20 | @po (Pax) | Validação 10/10 — Status Draft → Ready |
| 2026-05-20 | @dev (Dex) | Implementação completa — 11/11 ACs ✓ — Status → Ready for Review |
| 2026-05-20 | @qa (Quinn) | QA Gate PASS — 7/7 checks ✓ — Aprovado para push |
