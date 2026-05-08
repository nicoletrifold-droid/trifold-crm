status: Done

# Story 2.1 — CRUD Empreendimentos

## Contexto
O empreendimento e a entidade raiz do negocio. Tudo gira em torno de Vind e Yarden. A Nicole precisa dos dados para responder leads, os corretores precisam para negociar, e o admin precisa de uma interface para cadastrar/editar. Esta story cobre o backend (API routes) e o frontend basico de listagem/cadastro. A interface admin completa (com tabs) e coberta no Bloco 5 (E5-F7).

## Acceptance Criteria
- [x] AC1: API route `GET /api/properties` retorna lista de empreendimentos da org do usuario autenticado
- [x] AC2: API route `GET /api/properties/[id]` retorna empreendimento completo por ID
- [x] AC3: API route `POST /api/properties` cria novo empreendimento (admin/supervisor only)
- [x] AC4: API route `PATCH /api/properties/[id]` atualiza empreendimento (admin/supervisor only)
- [x] AC5: API route `DELETE /api/properties/[id]` faz soft delete (is_active = false, admin only)
- [ ] AC6: Todos os campos do schema `properties` sao suportados nas APIs (nome, slug, status, endereco, conceito, amenities, FAQ, regras comerciais, etc.)
- [ ] AC7: Slug e gerado automaticamente a partir do nome se nao fornecido
- [ ] AC8: Validacao: nome obrigatorio, status valido, cidade obrigatoria, estado obrigatorio (2 chars)
- [x] AC9: Pagina `/dashboard/properties` lista empreendimentos com: nome, status, cidade, total unidades, data entrega
- [ ] AC10: Pagina `/dashboard/properties/new` permite criar novo empreendimento
- [x] AC11: Pagina `/dashboard/properties/[id]` permite editar empreendimento existente

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/api/properties/route.ts` — GET (list), POST (create)
- `packages/web/src/app/api/properties/[id]/route.ts` — GET (detail), PATCH (update), DELETE (soft delete)
- `packages/web/src/app/dashboard/properties/page.tsx` — Listagem
- `packages/web/src/app/dashboard/properties/new/page.tsx` — Criacao
- `packages/web/src/app/dashboard/properties/[id]/page.tsx` — Edicao
- `packages/web/src/components/properties/property-form.tsx` — Formulario reutilizavel
- `packages/web/src/components/properties/property-list.tsx` — Tabela/cards de listagem
- `packages/shared/src/types/property.ts` — Types TypeScript
- `packages/db/src/queries/properties.ts` — Queries Supabase

### Campos do formulario:
- Nome* | Status* (select: lancamento/comercializacao/em obras/entregue)
- Endereco* | Bairro | Cidade* | Estado*
- Conceito (textarea) | Descricao (textarea)
- Diferenciais (lista editavel)
- Amenities (lista editavel — areas de lazer)
- Data de entrega | Total unidades | Andares tipo | Subsolos | Pavimentos lazer | Unidades/andar
- FAQ (lista de pergunta/resposta com toggle ativo/inativo)
- Regras comerciais: exige entrada? (toggle) | Valor minimo entrada | MCMV? | Faixa de preco visivel?
- Restricoes da IA (lista de textos — o que NAO pode dizer)

### Referencia agente-linda:
- Adaptar pattern de CRUD de `~/agente-linda/packages/web/src/app/dashboard/` (provavelmente `leads/` ou similar)
- Reusar pattern de API routes com auth check

## Dependencias
- Depende de: 1.2 (schema), 1.4 (env vars), 1.5 (auth)
- Bloqueia: 2.2 (tipologias referenciam property), 2.3 (unidades referenciam property), 2.5 (seed Vind), 2.6 (seed Yarden)

## Estimativa
M (Media) — 2-3 horas

## File List

### Created/Modified
- `packages/web/src/app/api/properties/route.ts` — GET (list), POST (create)
- `packages/web/src/app/api/properties/[id]/route.ts` — GET (detail), PATCH (update), DELETE (soft delete)
- `packages/web/src/app/dashboard/properties/page.tsx` — Listagem de empreendimentos
- `packages/web/src/app/dashboard/properties/[id]/page.tsx` — Detalhe/edicao de empreendimento

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
