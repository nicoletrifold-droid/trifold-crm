# Story 24.3 — Backfill: Vincular Empreendimentos Existentes a Obras

## Status: Draft

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

- [ ] 1. Criar `GET /api/admin/properties?sem_obra=true` para listar empreendimentos sem obra vinculada
- [ ] 2. Criar `POST /api/admin/obras/backfill` para vincular em batch
- [ ] 3. Criar página `/dashboard/obras/backfill/page.tsx`
- [ ] 4. Implementar formulário de matching (empreendimento → dropdown de obras)
- [ ] 5. Implementar submit com feedback visual
- [ ] 6. Adicionar link para a página de backfill no `/dashboard/obras` (botão ou menu)
- [ ] 7. Testar com dados reais: confirmar que vínculos são persistidos corretamente

## Estimativa: 3h

## Dependências

- Story 24.1 (coluna property_id) — MUST be Done
- Story 24.2 (API de vínculo) — SHOULD be Done (pode reutilizar a lógica de vinculação)

## Change Log

| Data | Agente | Mudança |
|------|--------|---------|
| 2026-05-11 | @pm (Morgan) | Story criada |
