# Story 75-105 — Pastas: deletar pasta + upload interno (gestor) + acesso p/ 4 perfis

## Metadata
- **Status:** Done (QA PASS) — pronto p/ @devops · **Epic:** Pastas · **Branch:** feat/75-105-pastas-delete-upload · **Complexidade:** M (4 pontos)
- **executor:** @dev · **quality_gate:** @qa · **Prioridade:** 🟢 evolução do módulo (pedido do diretor).

## Contexto
Fase 1 (Story 75-104) no ar. Pedidos:
1. **Deletar pasta** — botão para os perfis **admin / supervisor / gerente-comercial / imob**. (Hoje só admin/supervisor têm acesso ao módulo → precisa liberar os 4.)
2. **Upload interno pelo gestor** — na tela da pasta, poder **anexar arquivos** direto (não só pelo link do interessado), para cadastrar/corrigir documentos.

## Escopo
**IN:**
1. **Acesso ao módulo** para os 4 perfis: migration `141` seta `role_permissions.pastas = true` também p/ `gerente-comercial` e `imob` (além de admin/supervisor). Constante única `lib/pastas/roles.ts` `PASTA_MANAGER_ROLES = [admin, supervisor, gerente-comercial, imob]` usada em páginas e APIs.
2. **Deletar pasta:** `DELETE /api/pastas/[id]` (gated `isPastaManager`) — remove os arquivos do bucket (`pastas/{id}/…`) + a linha (cascade nos documentos). Botão na **lista** (ícone lixeira + confirmação) e no **cabeçalho do detalhe**.
3. **Upload interno:** `POST /api/pastas/[id]/documentos/[docId]/upload` (gated, auth) — multipart → bucket privado via admin → doc vira `entregue`. Botão **Anexar** por documento na tela de detalhe (funciona p/ pendente e p/ substituir/corrigir um já entregue).
4. Refatorar `MANAGER_ROLES` (admin/supervisor) das rotas/páginas de pastas p/ `isPastaManager` (inclui os 4).

**OUT:** perfil revisor dedicado ("Deferido") continua futuro; notificações (Fase 2).

## Acceptance Criteria
1. **Given** admin/supervisor/gerente-comercial/imob, **then** veem o módulo Pastas e o botão de **excluir** pasta (na lista e no detalhe); demais perfis não.
2. **Given** excluir pasta, **then** confirma, remove arquivos do bucket + a pasta (e seus documentos) e volta pra lista.
3. **Given** a tela da pasta, **when** o gestor clica **Anexar** num documento e escolhe um arquivo, **then** sobe pro bucket privado e o documento vira **entregue** (igual ao upload pelo link).
4. Rotas de pastas aceitam os 4 perfis; qualquer outro → 403/redirect.
5. tsc/lint limpos.

## Dev Agent Record (@dev — 2026-07-01)
- [x] **migration 141** — `pastas` = true p/ gerente-comercial + imob (upsert). Testado em transação: acesso = admin/supervisor/gerente-comercial/imob (os 4); demais false.
- [x] `lib/pastas/roles.ts` (`PASTA_MANAGER_ROLES` + `isPastaManager`) — refatorado em `pastas/route.ts`, `[docId]/route.ts`, `signed-url/route.ts`, `pastas/page.tsx`, `pastas/[id]/page.tsx`.
- [x] **DELETE** `/api/pastas/[id]` (gated) — remove arquivos do bucket (`list`+`remove` de `{id}/…`) + linha (cascade docs). Botões: lixeira por linha (lista, modal de confirmação) + "Excluir pasta" no cabeçalho do detalhe (confirmação inline → volta p/ lista).
- [x] **POST** `/api/pastas/[id]/documentos/[docId]/upload` (gated, auth) — upload interno (multipart → bucket via admin → situacao=entregue). Botão **Anexar/Substituir** por documento no detalhe.
- **Checks:** `tsc` 0 · `eslint` 0. Migration validada em transação. Reusa bucket/tabelas da 139.
- **Nota:** consultoria NÃO incluída (o diretor listou admin/supervisor/gerente-comercial/imob). Fácil adicionar depois.

## QA Results (@qa — 2026-07-01)
- **PASS.**
- **AC1/AC4:** rotas e páginas gated por `isPastaManager` (4 perfis); acesso ao módulo via migration 141 (verificado em transação — só os 4). Demais → redirect/403.
- **AC2:** DELETE remove objetos do bucket + linha (cascade nos docs via FK). Confirmação na lista (modal) e no detalhe (inline).
- **AC3:** upload interno reusa a mesma mecânica do público (25MB, pdf/imagem, situacao=entregue), mas autenticado e gated; valida doc∈pasta∈org.
- **Segurança:** todas as rotas de pastas exigem `isPastaManager`; storage segue privado (upload/remoção via service role no servidor). Sem migration de dados destrutiva.

## Change Log
- 2026-07-01 — @dev/@qa — deletar pasta + upload interno + acesso p/ 4 perfis. Done.
- 2026-07-01 — @po — GO (9/10).
- 2026-07-01 — @sm — Story criada.
