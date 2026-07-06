# Story 75-137 — Pastas: linha rica (imobiliária/corretor/empreendimento/data) + barra de filtros

## Metadata
- **Status:** Done · **Epic:** Pastas · **PR:** #134 · **Complexidade:** M (5 pontos) · **Branch:** feat/75-137-pastas-linha-rica-filtros
- **executor:** @dev · **quality_gate:** @qa · **design:** @ux-design-expert

## Contexto
Com pastas reais chegando, a listagem precisa de mais contexto por linha (hoje só cliente + status + contagem) e de **filtros** para localizar rápido. Imobiliária, corretor, empreendimento e data de criação já são colunas em `pastas` (preenchidas no wizard "Nova pasta"), então não precisa migration. Ver [[project-pastas-documentos]]. Design escolhido com @ux-design-expert: **linha de meta com ícones** + barra de filtros.

## Escopo
**IN:**
1. **`page.tsx`:** incluir `corretor_nome, imobiliaria, empreendimento, created_at` nas rows.
2. **Linha rica (`pastas-manager.tsx`):** abaixo do nome+selo, uma linha de meta com ícones — 🏢 Imobiliária · 👤 Corretor · 🏗 Empreendimento · 📅 data (dd/mm/aaaa). Itens vazios são omitidos. Mantém a linha de contagem de documentos.
3. **`lib/pastas/filter.ts`** (novo + teste): `filterPastas(rows, filtros)` puro. Filtros: **busca** (nome do cliente OU corretor OU imobiliária, case-insensitive), **status** (aguardando/em_analise/concluida), **empreendimento** (exato), **corretor** (exato), **imobiliária** (exato), **período** (dateFrom/dateTo sobre created_at).
4. **Barra de filtros (`pastas-manager.tsx`):** busca (input) + selects (Status, Empreendimento, Corretor, Imobiliária, populados a partir dos dados) + período (De/Até, `input[type=date]`) + botão **Limpar** (quando algo ativo) + **contador** "N de M pastas". Filtragem client-side (volume baixo). Responsivo (flex-wrap), tema light/dark.

**OUT:** paginação/ordenação por coluna; salvar filtros na URL/localStorage (follow-up); filtro por tipo PF/PJ (pode entrar depois).

## Acceptance Criteria
1. **Given** uma pasta com imobiliária/corretor/empreendimento/data, **then** a linha mostra 🏢/👤/🏗/📅 com esses valores; campos ausentes não aparecem (sem "·" órfão).
2. **Given** texto na busca, **then** a lista mostra só pastas cujo cliente, corretor **ou** imobiliária contêm o texto (case-insensitive).
3. **Given** um status selecionado, **then** só as pastas naquele status; idem para empreendimento, corretor e imobiliária (valor exato).
4. **Given** período De/Até, **then** só pastas com `created_at` dentro do intervalo (inclusive); De ou Até isolados também funcionam.
5. **Given** filtros combinados, **then** aplicam em conjunto (E). **Given** "Limpar", **then** todos resetam. Contador "N de M" reflete o resultado.
6. `filterPastas` com testes (cada filtro + combinação + datas de borda). tsc/lint/vitest limpos; tema ok.

## Tasks (@dev)
- [ ] `page.tsx`: rows += corretorNome/imobiliaria/empreendimento/createdAt.
- [ ] `lib/pastas/filter.ts` + `filter.test.ts`.
- [ ] `pastas-manager.tsx`: linha de meta com ícones + data; barra de filtros (busca/selects/período/limpar/contador); aplicar `filterPastas`.
- [ ] tsc/eslint/vitest.

## Riscos
- **Baixo.** Só leitura/apresentação + filtro client-side; sem migration. Cuidar da formatação de data (client component, `toLocaleDateString('pt-BR')`) e da omissão limpa de campos vazios. Convenção de tema [[feedback-theme-convention]] (/dashboard = light/dark com `dark:`).

## Dev Agent Record (@dev — 2026-07-06)
- **`page.tsx`:** select/rows += `corretor_nome`, `imobiliaria`, `created_at`.
- **`lib/pastas/filter.ts`** (+8 testes): `filterPastas` (busca em nome/corretor/imobiliária; status; empreendimento/corretor/imobiliária exatos; período dateFrom/dateTo sobre created_at), `distinctValues`, `hasActiveFilters`, `EMPTY_FILTERS`.
- **`pastas-manager.tsx`:** `MetaLine` (🏢 imobiliária · 👤 corretor · 🏗 empreendimento · 📅 data pt-BR; omite vazios); barra de filtros (busca + 4 selects populados por `distinctValues` + período De/Até + contador "N de M" + Limpar); aplica `filterPastas` via `useMemo`; empty state específico p/ "nenhuma com esses filtros".
- **Design:** @ux-design-expert — linha de meta com ícones (escolha do diretor) + barra de filtros responsiva (flex-wrap).
- **Checks:** tsc 0 · eslint 0 · vitest 788/788 (+8).
- **Files:** `app/dashboard/pastas/page.tsx`; `_components/pastas-manager.tsx`; `lib/pastas/filter.ts` (+test).

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1 (meta com ícones, sem "·" órfão) ✓ · AC2 (busca cliente/corretor/imobiliária) ✓ · AC3 (status/empreendimento/corretor/imobiliária exatos) ✓ · AC4 (período inclusive/isolado) ✓ · AC5 (combinação E, Limpar, contador N de M) ✓ · AC6 (8 testes, tsc/eslint/788, dark:) ✓. Só apresentação/filtro client-side; sem migration.

## Change Log
- 2026-07-06 — @devops — Branch + commit + push + **PR #134** + merge. Status → Done.
- 2026-07-06 — @qa — **QA GATE: PASS**. 6 ACs, 788/788.
- 2026-07-06 — @dev — Implementado (linha rica + filtros). Status → InReview.
- 2026-07-06 — @ux-design-expert — Design: linha de meta com ícones + barra de filtros.
- 2026-07-06 — @po — **GO (10/10)**. Status Draft → Ready → InProgress.
- 2026-07-06 — @sm — Story criada (Draft).
