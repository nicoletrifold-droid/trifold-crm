# Story 75-19 — Nome do corretor clicável → ficha de consulta + lápis para editar

## Metadata
- **Status:** Done
- **Epic:** 75 (ajustes operacionais / UX)
- **Branch:** main (mudança incremental, padrão do repo)
- **Complexidade:** M (3 pontos)

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck, lint]

## Story

**As a** gestor/gerente que usa a lista de corretores,
**I want** clicar no nome do corretor e abrir a ficha dele em modo consulta (todos os dados),
   com um lápis para entrar em edição quando precisar,
**so that** eu não dependa do botão "Editar" que fica no fim da linha (tabela larga, rola
   horizontal e some) — navegação ruim hoje.

## Contexto

Pedido do usuário (conversa 2026-06-23). Na lista
`/dashboard/configuracoes/corretores`, a única forma de abrir um corretor é o botão
"Editar" na última coluna, que exige rolar a tabela até a direita (ScrollableX).
O nome (primeira coluna, sempre visível) não é clicável.

Decisão do usuário (escolha em pergunta): a tela deve abrir em **modo consulta**
(read-only com todas as infos) e ter um **lápis "Editar"** que libera os campos —
o lápis só aparece para quem tem permissão de editar; qualquer um com acesso à
página pode consultar.

## Escopo

**IN:**
- Lista: nome do corretor vira link para `/dashboard/configuracoes/corretores/[id]`
  (com estilo de link/hover). Redundância proposital com o botão "Editar".
- Página `[id]`: passa a abrir em **modo consulta** — ficha read-only com nome, email,
  CRECI, telefone, tipo, limite de leads, status (ativo/desativado + disponível) e
  empreendimentos vinculados (chips).
- Botão **lápis "Editar"** no topo da ficha, visível só se o usuário pode editar
  (`canAccess sistema || corretores`, mesma regra da coluna de ações da lista).
- Ao clicar no lápis, a ficha entra em **modo edição** (o formulário atual: dados
  profissionais, empreendimentos interativos, acesso/senha, ativar/desativar).
  "Cancelar" volta para consulta; salvar volta para consulta e atualiza os dados.

**OUT:**
- Mudança nas regras de permissão de salvar (já tratadas na 75-18 / API).
- Linha inteira clicável (só o nome, conforme pedido).
- Novos campos de corretor.

## Implementação
- `[id]/page.tsx` vira **server component**: `getServerUser()` + `canAccess` →
  calcula `canEdit` e renderiza `<CorretorDetail brokerId canEdit />`.
- `[id]/_detail.tsx` (novo, client): toda a lógica atual de fetch/edição + estado
  `editing` + UI de consulta. Lápis (ícone `Pencil`) alterna para edição.
- `corretores/page.tsx`: nome envolto em `<Link>`.

## Acceptance Criteria
1. Na lista, clicar no nome do corretor abre `/dashboard/configuracoes/corretores/[id]`.
2. A página abre em modo consulta, read-only, mostrando todos os dados do corretor.
3. Usuário COM permissão de editar vê o lápis "Editar"; ao clicar, a ficha vira editável.
4. Usuário SEM permissão de editar consulta a ficha mas NÃO vê o lápis.
5. Em edição, "Cancelar" volta para consulta sem salvar; salvar persiste e volta para consulta com dados atualizados.
6. O botão "Editar" da última coluna da lista continua funcionando (redundância mantida).

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.19-...yml`, quality_score 95)
- **typecheck:** `tsc --noEmit` sem erros nos arquivos da story.
- **lint:** `eslint` sem erros/warnings nos 3 arquivos.
- **Permissão:** lápis gateado por `canEdit` (server); escrita já enforçada na API (+ RLS da 75-18).

## File List
- `packages/web/src/app/dashboard/configuracoes/corretores/[id]/page.tsx` (server wrapper)
- `packages/web/src/app/dashboard/configuracoes/corretores/[id]/_detail.tsx` (novo, client)
- `packages/web/src/app/dashboard/configuracoes/corretores/page.tsx` (nome clicável)
