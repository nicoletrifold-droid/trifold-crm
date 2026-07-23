# Story — Nicole: knowledge_base gera embedding ao salvar (fix raiz do gotcha 75-173)

**Status:** Done
**Tipo:** Bug fix (conhecimento invisível) + conteúdo
**Epic:** Nicole / RAG
**Relacionado:** 75-173 (conserto do RAG — backfill + threshold 0.45), [[project-nicole-rag-conserto]]
**Complexidade:** S

## Pedido (Marcos, 2026-07-23)
> Lead perguntou se o Vind é habilitado para Airbnb; a Nicole não soube responder — e a
> resposta é SIM. Colocar essa informação para ela.

## O que foi feito
1. **Conteúdo (prod, imediato):** entrada "Airbnb e locação de curta temporada no VIND"
   inserida na `knowledge_base` de PRODUÇÃO com embedding real (script novo
   `scripts/add-kb-entry.ts`), escopada ao Vind (`source_id`), categoria `investimento`.
   Validação: `match_knowledge("o vind pode ser usado para airbnb?")` → similaridade
   **0.671**, 1º lugar (threshold do runtime = 0.45). ✅ Nicole responde já.
2. **Fix raiz:** a tela Config › Nicole › Treinamento (API `/api/knowledge-base`) salvava
   SEM embedding → entrada invisível pra Nicole (RPC exige `embedding NOT NULL`).
   - POST: gera embedding na criação (`title + content`).
   - PATCH: regenera quando título/conteúdo mudam (edição parcial usa o valor atual).
   - Falha da OpenAI → **recusa com 502 e mensagem clara** (melhor que salvar invisível);
     nunca usa o fallback-hash para GRAVAÇÃO (envenenaria o índice) — nova
     `generateEmbeddingStrict` em `packages/ai/src/rag/embeddings.ts`.
3. **Script reutilizável** `scripts/add-kb-entry.ts`: insere entrada com embedding e
   valida a recuperação na sequência (`--title/--content/--property/--category/--test`).

## File List
- `packages/ai/src/rag/embeddings.ts` (+generateEmbeddingStrict)
- `packages/ai/src/rag/index.ts` (export)
- `packages/web/src/app/api/knowledge-base/route.ts` (POST embeda)
- `packages/web/src/app/api/knowledge-base/[id]/route.ts` (PATCH re-embeda; select explícito)
- `scripts/add-kb-entry.ts` (novo)
- `docs/stories/nicole-kb-embedding-on-save.story.md` (esta)

## QA
vitest 1176 ✅ · type-check 8/8 ✅ · lint ✅ · next build ✅ · validação em PROD (0.671) ✅
