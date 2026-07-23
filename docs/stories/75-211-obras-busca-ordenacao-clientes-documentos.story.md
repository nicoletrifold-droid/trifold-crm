# Story 75-211 — Obras: busca e ordenação nas abas Clientes e Documentos

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (obras/portal)
- **Branch:** feat/75-211-obras-busca-ordenacao
- **Tipo:** Melhoria de UX — Marcos (prints, 2026-07-23): na obra Vind Residence
  (43 clientes, 124 documentos) está difícil localizar apartamento/cliente e
  documento. Pedido: ordenação (cronológica, alfabética ou por nº do apto) +
  barra de pesquisa nas duas abas; nos documentos, poder filtrar também pelo
  tipo (Contratos etc.).

## Acceptance Criteria
- [x] AC1 (Clientes — busca): campo de busca acima da lista "Clientes
  Vinculados" filtrando em tempo real por nome, CPF, e-mail e nº da unidade.
  Busca insensível a acentos/caixa; CPF casa por dígitos (com ou sem
  pontuação). Contador do cabeçalho reflete o filtro (ex: "3 de 43") e estado
  vazio tem mensagem própria ("Nenhum cliente encontrado para a busca").
- [x] AC2 (Clientes — ordenação): seletor com **Nome (A–Z)** (default),
  **Unidade** (ordenação numérica natural: 302 antes de 1201; sem unidade vai
  para o fim) e **Mais recentes** (created_at do vínculo, mais novo primeiro).
- [x] AC3 (Documentos — busca + tipo): campo de busca filtrando por nome do
  documento e rótulo do destinatário (insensível a acentos/caixa) + seletor de
  categoria ("Todas as categorias" + categorias presentes nos docs da obra,
  ex: Contratos, ART/RRT, Memoriais, Outros). Uploads pendentes/rejeitados do
  autor (75-176) também respeitam busca/categoria. Contador reflete o filtro.
- [x] AC4 (Documentos — ordenação): seletor com **Mais recentes** (default,
  comportamento atual), **Mais antigos** e **Nome (A–Z)**.
- [x] AC5 (dados): `page.tsx` passa `created_at` do vínculo
  (clientes_obras_vinculos) para viabilizar AC2; nenhum fetch novo — tudo
  client-side sobre dados já carregados (43/124 itens, volume trivial).
- [x] AC6: type-check, lint e suíte de testes verdes.

## Dev Notes
- Tela: `/dashboard/obras/[obra_id]` — abas em `obra-detail-tabs.tsx`
  (Documentos inline) e `clientes-tab.tsx` (Clientes).
- Sem componente de busca compartilhado no projeto; normalização NFD local
  segue padrão existente (ex: `lib/leads/search.ts`).
- Ordenação natural de unidade: `localeCompare(..., { numeric: true })`.
- Não mexer em RLS/API — filtro e ordenação 100% no cliente.

## File List
- `docs/stories/75-211-obras-busca-ordenacao-clientes-documentos.story.md` (this file)
- `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx`
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/clientes-tab.tsx`
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx`

## Change Log
- @sm (River) 2026-07-23: draft a partir do pedido do Marcos (2 prints).
- @po (Pax) 2026-07-23: GO — escopo 100% client-side, sem invenção.
- @dev (Dex) 2026-07-23: busca+ordenação nas duas abas; `created_at` do
  vínculo exposto no page.tsx; pendentes do autor respeitam os filtros.
- @qa (Quinn) 2026-07-23: PASS — type-check ok, lint limpo nos arquivos da
  story (12 erros globais pré-existentes em arquivos não tocados), testes
  1184/1184. Default dos documentos segue "Mais recentes" (sem mudança de
  comportamento sem filtro).
