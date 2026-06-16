# Story 58-1 — Seletor de Obra/Unidade no Portal do Cliente

## Metadata
- **Status:** Done
- **Epic:** 58 — Portal do Cliente — Multi-Unidade
- **Branch:** main

## Context
Clientes com mais de uma unidade comprada (mesmo empreendimento ou empreendimentos diferentes) acessam o portal com o mesmo e-mail/senha. Hoje o sistema redireciona sempre para a primeira obra registrada em `cliente_obras`, sem oferecer escolha. Com múltiplas unidades, todas as informações do portal (Fases, Fotos, Financeiro, Documentos, Mensagens) são específicas de cada obra — o cliente precisa poder navegar entre elas.

A maioria dos acessos é via celular, então a solução deve priorizar UX mobile (touch-friendly, telas cheias, sem dropdowns minúsculos).

## Acceptance Criteria

- [x] **AC1 — Login com 1 obra:** comportamento atual preservado — redireciona diretamente para `/cliente/[obra_id]`, sem tela intermediária
- [x] **AC2 — Login com 2+ obras:** redireciona para `/cliente/selecionar` ao invés de ir direto para uma obra
- [x] **AC3 — Tela de seleção (`/cliente/selecionar`):** exibe cards para cada obra do cliente com:
  - Nome do empreendimento (ex: "Yarden")
  - Número da unidade (de `cliente_obras.numero_unidade`, ex: "Ap 302")
  - Status da obra (ex: "Em construção")
  - Percentual de progresso (de `obras.progress_pct`)
- [x] **AC4 — Tela de seleção protegida:** redireciona para `/cliente` (login) se o usuário não estiver autenticado como `cliente`
- [x] **AC5 — Indicador de obra na sidebar (desktop):** entre o logo e o menu de navegação, exibir o nome do empreendimento + número da unidade atual. Se o cliente tiver 2+ obras, o chip é clicável e leva para `/cliente/selecionar`. Se tiver só 1, aparece como texto estático
- [x] **AC6 — Indicador de obra no mobile:** barra fina no topo do conteúdo (abaixo do header nativo) exibindo "Yarden · Ap 302" com ícone de troca (só visível quando 2+ obras). Toque leva para `/cliente/selecionar`
- [x] **AC7 — Sem quebra para clientes com 1 obra:** toda a lógica de indicador/switcher é condicional — clientes com 1 obra não veem nenhuma mudança visual
- [x] **AC8 — Tema sempre dark:** portal do cliente usa dark hardcoded (sem `dark:` condicional)

## Out of Scope
- Definição de obra "favorita/padrão" pelo cliente
- Notificações cross-obra (ex: badge total de mensagens de todas as obras)
- Histórico de última obra acessada via localStorage

## File List
- `docs/stories/58-1-portal-cliente-seletor-multiplas-obras.story.md` (this file)
- `packages/web/src/app/login/actions.ts` (updated — redirecionar para /cliente/selecionar quando 2+ obras)
- `packages/web/src/app/cliente/selecionar/page.tsx` (new — tela de seleção de obra)
- `packages/web/src/app/cliente/[obra_id]/_components/sidebar.tsx` (updated — chip de obra AC5)
- `packages/web/src/app/cliente/[obra_id]/_components/obra-switcher-bar.tsx` (new — barra mobile AC6)
- `packages/web/src/app/cliente/[obra_id]/layout.tsx` (updated — buscar total de obras do cliente + passar para sidebar/bar)

## Dev Notes
- A query para verificar quantas obras o cliente tem: `SELECT obra_id, numero_unidade FROM cliente_obras WHERE user_id = ? ORDER BY is_primary DESC`
- Para a tela de seleção, fazer JOIN com `obras` para pegar `name`, `progress_pct`, `status`; JOIN com `properties` para `city`
- O `numero_unidade` fica em `cliente_obras.numero_unidade`, não em `units`
- A lógica de contagem (1 vs 2+) deve ser feita na action de login **antes** do redirect, sem query extra se já buscou o vinculo: basta usar `.limit(2)` em vez de `.limit(1)` e verificar `data.length`
- O `ObraTabNav` (mobile bottom bar) **não** deve ser alterado — a barra de indicador é separada, aparece no topo do conteúdo
- Sidebar: o chip fica entre o bloco do logo (`border-b`) e a `<nav>` — adicionar um `<div className="px-4 py-3 border-b border-stone-800/30">` com o nome da obra
