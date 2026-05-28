# Story 41.1 — CPF obrigatório e vinculação de clientes em obras via CPF

**Status:** Done  
**Branch:** main  
**Epic:** Cadastro de Clientes  

## Descrição
CPF torna-se campo obrigatório no cadastro de clientes (Configurações > Clientes). Na aba Clientes da obra, a vinculação passa a ser feita via CPF consultando o cadastro mestre — não mais por email ou qualquer outro campo.

## Acceptance Criteria
- [ ] AC1: Campo CPF é obrigatório no formulário Config > Clientes (label com *, input required, validação no submit)
- [ ] AC2: API POST /api/admin/clientes rejeita (400) se CPF ausente
- [ ] AC3: API PATCH /api/admin/clientes/[id] rejeita (400) se CPF for explicitamente limpo
- [ ] AC4: Busca por CPF disponível em /api/admin/clientes/search?cpf=
- [ ] AC5: Aba Clientes em Obras — Formulário A (criar novo) exige CPF, verifica CRM antes de criar
- [ ] AC6: Aba Clientes em Obras — Formulário B (vincular existente) usa CPF (não email), busca no CRM mestre
- [ ] AC7: Lista de clientes vinculados a obras usa clientes_obras_vinculos (tabela CRM)
- [ ] AC8: Desvincular e editar unidade operam em clientes_obras_vinculos

## Tasks
- [x] T1: Criar story
- [x] T2: cliente-modal.tsx — CPF obrigatório
- [x] T3: POST /api/admin/clientes — CPF required
- [x] T4: PATCH /api/admin/clientes/[id] — rejeitar limpeza de CPF
- [x] T5: /api/admin/clientes/search — adicionar param cpf
- [x] T6: clientes-tab.tsx — refatorar formulários para CPF
- [x] T7: POST /api/admin/obras/[obra_id]/clientes — novo fluxo CPF
- [x] T8: GET /api/admin/obras/[obra_id]/clientes — usar clientes_obras_vinculos
- [x] T9: DELETE/PATCH /api/admin/obras/[obra_id]/clientes/[user_id] — usar clientes_obras_vinculos
- [x] T10: page.tsx obras/[obra_id] — carregar clientes de clientes_obras_vinculos

## File List
- packages/web/src/app/dashboard/configuracoes/clientes/_components/cliente-modal.tsx
- packages/web/src/app/api/admin/clientes/route.ts
- packages/web/src/app/api/admin/clientes/[id]/route.ts
- packages/web/src/app/api/admin/clientes/search/route.ts
- packages/web/src/app/dashboard/obras/[obra_id]/_components/clientes-tab.tsx
- packages/web/src/app/api/admin/obras/[obra_id]/clientes/route.ts
- packages/web/src/app/api/admin/obras/[obra_id]/clientes/[user_id]/route.ts
- packages/web/src/app/dashboard/obras/[obra_id]/page.tsx
