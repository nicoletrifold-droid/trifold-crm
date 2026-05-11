# Story 24.3 — Backfill: Vincular Empreendimentos Existentes a Obras

## Status: Ready for Review

## Story

**Como** administrador,
**Quero** uma interface simples para vincular manualmente os empreendimentos já cadastrados às obras existentes,
**Para que** o histórico de dados já disponíveis no sistema seja conectado sem precisar recriar nada.

## Contexto

Os empreendimentos existentes no CRM (tabela `properties`) e as obras existentes (tabela `obras`) foram criados de forma independente. Esta story cria uma ferramenta de backfill para o admin fazer o match manualmente, com revisão visual antes de salvar.

**Importante:** esta story é operacional, não uma feature permanente de UX. Uma vez que os vínculos existentes forem feitos, o fluxo regular (Story 24.2 e 24.4) cuida dos novos.

## Acceptance Criteria

- [ ] AC1: Página `/dashboard/obras/backfill` (ou modal na listagem de obras) acessível para role `admin`
- [ ] AC2: Lista todos os empreendimentos que NÃO têm obra vinculada
- [ ] AC3: Para cada empreendimento, exibe dropdown com obras disponíveis (sem property_id vinculado)
- [ ] AC4: Admin pode selecionar 0 ou 1 obra por empreendimento antes de salvar
- [ ] AC5: Botão "Salvar Vínculos" persiste todas as seleções em batch (PATCH `obras.property_id` para cada seleção)
- [ ] AC6: Feedback visual de sucesso/erro por empreendimento após salvar
- [ ] AC7: Empreendimentos que já têm obra vinculada ficam fora da lista (ou com badge "já vinculado")
- [ ] AC8: API batch `POST /api/admin/obras/backfill` aceita array `[{ obra_id, property_id }]` e aplica os vínculos

## Escopo

**IN:**
- Página de backfill (pode ser uma rota nova simples, sem layout complexo)
- API batch para aplicar vínculos em lote
- Listagem de empreendimentos sem obra + obras disponíveis

**OUT:**
- Criar obras novas nesta tela (se o empreendimento não tem obra, criar é Story 24.4)
- Desfazer vínculos em batch
- Histórico de backfill

## Dev Notes

- Rota sugerida: `/dashboard/obras/backfill` — adicionar link no menu de obras
- Pode ser uma página simples server-side (não precisa de SWR/React Query para este caso)
- API batch: iterar e fazer UPDATE obras SET property_id = X WHERE id = Y para cada item do array
- Validação: checar que cada obra_id não já tem um property_id diferente (evitar override acidental)
- Esta página pode ser removida ou arquivada após o backfill ser concluído (low priority)

## Tasks

- [x] 1. Criar `GET /api/admin/properties?sem_obra=true` para listar empreendimentos sem obra vinculada
- [x] 2. Criar `POST /api/admin/obras/backfill` para vincular em batch
- [x] 3. Criar página `/dashboard/obras/backfill/page.tsx`
- [x] 4. Implementar formulário de matching (empreendimento → dropdown de obras)
- [x] 5. Implementar submit com feedback visual
- [x] 6. Adicionar link para a página de backfill no `/dashboard/obras` (botão ou menu)
- [x] 7. Testar com dados reais: confirmar que vínculos são persistidos corretamente

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Override acidental de obra já vinculada | Média | Dev Notes já prevê validação; API batch deve checar `property_id IS NULL` antes de atualizar |
| Página temporária ficar esquecida no código | Baixa | Dev Notes já sinaliza remoção; adicionar TODO comment na página |
| Performance com muitos empreendimentos/obras | Baixa | Batch é simples UPDATE em loop; paginação deferida para futuro se necessário |
| Admin submete seleção parcial por engano | Baixa | AC6 garante feedback por empreendimento; admin pode reenviar o batch |

## Estimativa: 3h

## Dependências

- Story 24.1 (coluna property_id) — MUST be Done
- Story 24.2 (API de vínculo) — SHOULD be Done (pode reutilizar a lógica de vinculação)

## Dev Agent Record

### File List
- `src/app/api/admin/properties/route.ts` — NEW: GET com `?sem_obra=true`
- `src/app/api/admin/obras/backfill/route.ts` — NEW: POST batch backfill
- `src/app/dashboard/obras/backfill/page.tsx` — NEW: página server-side
- `src/app/dashboard/obras/backfill/_components/backfill-form.tsx` — NEW: formulário client
- `src/app/dashboard/obras/page.tsx` — MODIFIED: link "Vincular empreendimentos" para admin

### Completion Notes
- API `GET /api/admin/properties?sem_obra=true` filtra propriedades sem obra via dois passos: busca IDs linkados, exclui com `.not("id","in",...)`
- API `POST /api/admin/obras/backfill` valida `property_id IS NULL` com `.is("property_id", null)` no UPDATE para proteção contra override acidental
- Página backfill é server component puro; apenas o formulário interativo é client component
- TODO comments adicionados na página e no componente para sinalizar remoção pós-backfill

## QA Results

**Decisão: PASS (com CONCERNS LOW)**
**Data:** 2026-05-11
**Agente:** @qa (Quinn)

**ACs verificados:** 8/8 ✅

**Concerns (LOW — não bloqueantes):**
1. `submitted` state bloqueia retry após erros parciais sem reload — aceitável para ferramenta operacional de uso único
2. Obras vinculadas permanecem no dropdown de outros empreendimentos na mesma sessão — API protege contra double-link, UX aceitável dado escopo temporário
3. Cast `as BackfillLink[]` sem schema validation extra — validação por campo no loop é suficiente

**Build:** ✅ Compila sem erros | **TypeScript:** ✅ Zero erros | **ESLint:** ✅ Zero erros nos arquivos novos

## Change Log

| Data | Agente | Mudança |
|------|--------|---------|
| 2026-05-11 | @pm (Morgan) | Story criada |
| 2026-05-11 | @po (Pax) | Validação GO — score 9/10 — seção Riscos adicionada — Status: Draft → Ready |
| 2026-05-11 | @dev (Dex) | Implementação completa — todas as tasks [x] — Status: Ready for Review |
| 2026-05-11 | @qa (Quinn) | QA Gate PASS — 8/8 ACs verificados — 3 concerns LOW não bloqueantes |
