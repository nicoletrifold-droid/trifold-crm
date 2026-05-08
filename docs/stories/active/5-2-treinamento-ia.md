status: Done

# Story 5.2 — Treinamento da IA (Editar Base de Conhecimento)

## Contexto
O admin precisa poder editar a base de conhecimento da Nicole sem depender de desenvolvedor. A base alimenta o RAG (Story 3.2) e define o que a Nicole sabe responder. O admin pode adicionar/editar/remover pares pergunta-resposta, categorizar por empreendimento ou geral, e ativar/desativar entradas. Ao salvar, os embeddings sao regenerados automaticamente.

## Acceptance Criteria
- [x] AC1: Pagina `/dashboard/treinamento` lista todas as entradas da base de conhecimento
- [x] AC2: Cada entrada tem: titulo, conteudo, fonte, empreendimento, status ativo/inativo
- [x] AC3: Botao "Adicionar" abre formulario de criacao inline
- [x] AC4: Link "Editar" por entrada abre formulario de edicao via query param
- [ ] AC5: Toggle ativo/inativo por entrada (sem deletar)
- [x] AC6: Link "Excluir" por entrada com acao de delete via query param
- [ ] AC7: Ao salvar (criar/editar/deletar), embeddings sao regenerados para a entrada afetada via `generateEmbedding()` (Story 3.2)
- [ ] AC8: Botao "Regenerar todos os embeddings" (admin only) regenera tudo
- [x] AC9: Filtro por empreendimento (property/source_id) com botao limpar
- [ ] AC10: Busca por texto na pergunta/resposta
- [ ] AC11: Contador total: "X entradas ativas | Y inativas"
- [ ] AC12: API routes: GET/POST/PATCH/DELETE `/api/knowledge`

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/dashboard/settings/knowledge/page.tsx` — Listagem
- `packages/web/src/components/settings/knowledge-list.tsx` — Tabela/lista de entradas
- `packages/web/src/components/settings/knowledge-form.tsx` — Formulario
- `packages/web/src/app/api/knowledge/route.ts` — GET (list), POST (create)
- `packages/web/src/app/api/knowledge/[id]/route.ts` — PATCH (update), DELETE
- `packages/web/src/app/api/knowledge/regenerate/route.ts` — POST (regenerar todos)
- `packages/db/src/queries/knowledge.ts` — Queries

### Schema (tabela `knowledge_base` — ja definida na Story 1.2):
```sql
-- knowledge_base
-- id, org_id, question, answer, category, property_id (nullable), priority,
-- embedding (vector), is_active, created_at, updated_at
```

### Fluxo de embedding:
```typescript
// Ao criar/editar entrada
async function saveKnowledgeEntry(entry: KnowledgeEntry) {
  // 1. Salvar no banco
  // 2. Gerar embedding do texto (question + answer concatenados)
  const text = `${entry.question}\n${entry.answer}`;
  const embedding = await generateEmbedding(text); // Anthropic ou OpenAI embeddings
  // 3. Atualizar campo embedding
  await supabase
    .from('knowledge_base')
    .update({ embedding })
    .eq('id', entry.id);
}
```

### Referencia agente-linda:
- Adaptar interface de treinamento de `~/agente-linda/packages/web/src/app/dashboard/settings/knowledge/` (se existir)
- Reusar logica de embedding generation de `~/agente-linda/packages/ai/src/rag/`

## Dependencias
- Depende de: 1.2 (schema), 1.5 (auth admin), 3.2 (RAG e embeddings)
- Bloqueia: Nenhuma (melhora a qualidade da Nicole, mas nao bloqueia)

## Estimativa
M (Media) — 2-3 horas

## File List

### Created/Modified
- `packages/web/src/app/dashboard/treinamento/page.tsx` — Criado: pagina de listagem da base de conhecimento com filtro por empreendimento (source_id), formulario inline de adicao (titulo, fonte, empreendimento, conteudo), links de editar/excluir por entrada, tabela com colunas titulo/conteudo/fonte/empreendimento/ativo; acesso restrito a admin/supervisor

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
