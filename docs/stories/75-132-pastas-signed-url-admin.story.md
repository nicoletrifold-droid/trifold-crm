# Story 75-132 — BUG: "Object not found" ao Visualizar/Baixar documento da pasta (signed URL com cliente errado)

## Metadata
- **Status:** Done · **Epic:** Pastas · **Branch:** fix/75-132-pastas-signed-url-admin · **PR:** #129 · **Complexidade:** XS (1 ponto)
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Após o deploy da 75-130/131, Visualizar/Baixar de **qualquer** documento da pasta retorna **"Object not found"** (agora visível graças ao banner de erro da 75-130 — antes era o "nada acontece" silencioso). Ver [[project-pastas-documentos]].

**Causa raiz (bug pré-existente):** a rota `GET /api/pastas/[id]/documentos/[docId]/signed-url` gera o signed URL com o cliente **`supabase` do usuário (RLS-scoped)**. O bucket `pastas` é **privado** e não tem policy de SELECT pro usuário autenticado → o Storage responde **"Object not found"** (é a resposta do Storage quando o RLS bloqueia). O upload grava via **`admin`** (service role), e a rota do documento **assinado** (75-120) já lê via `createAdminClient()` com o comentário *"Bucket privado só acessível via service role"* — a rota dos documentos comuns ficou inconsistente.

**Verificação (prod `dsopqkqjkmhytudaaolv`):** os 5 objetos da pasta de teste **existem** no bucket (`storage.objects` → `objeto_existe = true` p/ todos). Logo não é arquivo faltando; é o cliente errado gerando a URL.

## Escopo
**IN:** em `documentos/[docId]/signed-url/route.ts`, gerar o signed URL via `createAdminClient()` (como a rota do assinado). Manter a autorização atual: `isPastaManager(role)` + query `pasta_documentos` org-scoped (RLS) confirma que o doc é da org antes de gerar a URL.

**OUT:** criar storage policy de SELECT pro bucket (desnecessário — service role já resolve, e é o padrão do módulo); mudar o upload; mexer na rota do assinado (já correta).

## Acceptance Criteria
1. **Given** um documento anexado numa pasta da minha org, **when** clico em Visualizar, **then** o arquivo abre inline (sem "Object not found").
2. **Given** o mesmo documento, **when** clico em Baixar, **then** o arquivo baixa (Content-Disposition), sem erro.
3. **Given** um `docId` de outra org / inexistente, **then** retorna 404 (autorização preservada — a query org-scoped continua sendo o gate).
4. tsc/lint/testes limpos.

## Tasks (@dev)
- [ ] `documentos/[docId]/signed-url/route.ts`: importar `createAdminClient`; trocar `supabase.storage.createSignedUrl(...)` por `admin.storage.createSignedUrl(...)`. Manter a query `supabase` (RLS) como gate de autorização.
- [ ] tsc/eslint/vitest.

## Riscos
- **Muito baixo.** Espelha exatamente a rota do assinado (já em prod). Autorização não muda: role + query org-scoped continuam antes da geração da URL; o admin só é usado pra assinar a URL de um path já validado.

## Dev Agent Record (@dev — 2026-07-06)
- **`documentos/[docId]/signed-url/route.ts`:** import `createAdminClient`; `createSignedUrl` agora via `admin.storage` (era `supabase.storage`, RLS-scoped → "Object not found" em bucket privado). Autorização inalterada: `isPastaManager` + query `pasta_documentos` org-scoped (RLS) seguem como gate antes de assinar a URL de um path já validado.
- **Checks:** tsc 0 · eslint 0 · vitest 757/757.
- **Files:** `app/api/pastas/[id]/documentos/[docId]/signed-url/route.ts`.

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1/AC2 (Visualizar/Baixar sem "Object not found" — padrão idêntico ao da rota do assinado, já em prod) ✓ · AC3 (404 preservado: query org-scoped continua sendo o gate; admin só assina o path já validado) ✓ · AC4 (tsc/eslint/757) ✓. Objetos confirmados existentes no bucket (prod).

## Change Log
- 2026-07-06 — @devops — Branch + commit + push + **PR #129** + merge. Status → Done.
- 2026-07-06 — @qa — **QA GATE: PASS**. 4 ACs, 757/757.
- 2026-07-06 — @dev — Fix (signed URL via admin). Status → InReview.
- 2026-07-06 — @po — **GO (10/10)**. Status Draft → Ready → InProgress.
- 2026-07-06 — @sm — Story criada (Draft).
