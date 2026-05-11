# Story 24.1 — DB Migration: `property_id` em `obras`

## Status: Done

## Story

**Como** administrador do sistema,
**Quero** que a tabela `obras` tenha uma coluna `property_id` (FK para `properties`),
**Para que** cada obra possa ser vinculada a um empreendimento específico, estabelecendo a base para todas as features do Epic 24.

## Contexto

Fundação do Epic 24. Todas as outras stories dependem desta migration estar aplicada.
A coluna é **nullable** porque obras internas (sem empreendimento) devem continuar funcionando.

**Tabela alvo:** `obras` (criada em `020_portal_cliente.sql`)
**Referência:** `properties.id` (criada em `002_property_schema.sql`)

## Acceptance Criteria

- [x] AC1: Migration `027_property_id_obras.sql` criada em `supabase/migrations/` (próxima após `026_email_settings.sql`)
- [x] AC2: Coluna `property_id uuid NULL REFERENCES properties(id) ON DELETE SET NULL` adicionada à tabela `obras`
- [x] AC3: Index `idx_obras_property_id` criado para performance de query
- [x] AC4: Migration aplicada ao remote via Management API (sem erros — conflito 021/024/025 contornado com stubs locais)
- [x] AC5: Obras existentes continuam funcionando (property_id = NULL é válido — confirmado via query de teste)
- [x] AC6: TypeScript type `Obra` atualizado em `obra-edit-modal.tsx`, `obra-edit-button.tsx`; select de `page.tsx` atualizado com `property_id`
- [x] AC7: Nenhuma RLS policy quebrada — nova coluna é nullable, não interfere com policies existentes

## Escopo

**IN:**
- Arquivo de migration SQL
- Index de performance
- Atualização de tipos TypeScript se existirem tipos gerados

**OUT:**
- Nenhuma mudança em UI
- Nenhuma mudança em API routes existentes
- Não migrar dados existentes (backfill é Story 24.3)

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Gap de numeração (024/025 ausentes localmente) | Confirmado | Usar `027_` — próxima após `026_email_settings.sql` existente |
| Migration 024/025 pode existir remotamente (aplicada via Studio) | Média | Rodar `supabase migration list` antes de aplicar para verificar divergência |
| Conflito de nome se outra migration 027 for criada em paralelo | Baixa | Coordenar com equipe antes de aplicar |

## Dev Notes

- **Número correto da migration: `027_property_id_obras.sql`** — `026_email_settings.sql` é a última local; 024/025 ausentes localmente (possível conflito remoto, verificar)
- Usar `ALTER TABLE obras ADD COLUMN IF NOT EXISTS` para idempotência
- `ON DELETE SET NULL` garante que deletar um empreendimento não deleta a obra
- Checar se existem tipos gerados pelo Supabase CLI: `packages/web/src/types/supabase.ts` ou similar
- Antes de aplicar: rodar `supabase migration list` para confirmar status do remote
- Testar com: `SELECT obras.id, obras.name, properties.name as property_name FROM obras LEFT JOIN properties ON obras.property_id = properties.id;`

## Tasks

- [x] 1. Rodar `supabase migration list` para verificar divergência local/remoto (migrations 024/025)
- [x] 2. Criar `supabase/migrations/027_property_id_obras.sql`
- [x] 3. Escrever SQL: ALTER TABLE + INDEX
- [x] 4. Aplicar migration ao remote via Management API (024/025 contornados com stubs + repair)
- [x] 5. Verificar/atualizar tipos TypeScript — 3 arquivos atualizados
- [x] 6. Confirmar query de teste funciona — JOIN obras ↔ properties retorna dados corretos

## Estimativa: 2h

## Dependências

- Nenhuma (é a story fundação do Epic 24)

## Change Log

| Data | Agente | Mudança |
|------|--------|---------|
| 2026-05-11 | @pm (Morgan) | Story criada |
| 2026-05-11 | @sm (River) | Corrigido número de migration 024→027; adicionada seção Riscos; score 9/10 — encaminhado para @po |
| 2026-05-11 | @po (Pax) | Validação GO — score 10/10 — Status: Draft → Ready |
| 2026-05-11 | @dev (Dex) | Implementação completa — migration 027 aplicada, tipos TS atualizados, query de teste OK — Status: Ready → Done |
