status: Done

# Story 4.4 — Lead Management (CRUD)

## Contexto
O CRUD de leads e a base do CRM. Leads sao criados automaticamente quando alguem envia mensagem no WhatsApp/Telegram ou quando chega via webhook do Meta Ads, mas o admin tambem precisa poder criar/editar leads manualmente (ex: lead que ligou por telefone). Cada lead tem dados pessoais, preferencias imobiliarias, origem, score de qualificacao, corretor designado e resumo IA.

## Acceptance Criteria
- [x] AC1: API route `GET /api/leads` retorna lista paginada de leads da org (20 por pagina, cursor-based)
- [x] AC2: API route `GET /api/leads/[id]` retorna lead completo com: property_interest, assigned_broker, current_stage, conversations
- [x] AC3: API route `POST /api/leads` cria lead manualmente (admin/supervisor only) com campos minimos: nome, telefone
- [x] AC4: API route `PATCH /api/leads/[id]` atualiza dados do lead (admin/supervisor/broker designado)
- [x] AC5: API route `DELETE /api/leads/[id]` faz soft delete (`is_active = false`, admin only)
- [ ] AC6: Campos suportados: nome, telefone, email, empreendimento de interesse, tipologia de interesse, preferencias (andar, vista, garagem, quartos), tem_entrada, status de qualificacao, score, corretor designado, notas, origem, UTM params
- [ ] AC7: Validacao: telefone obrigatorio e unico (por org), formato brasileiro (+55...)
- [ ] AC8: Se lead com mesmo telefone ja existe, retorna erro 409 com link para o lead existente
- [x] AC9: Pagina `/dashboard/leads` com tabela de leads: nome, telefone, empreendimento, etapa, corretor, score, ultimo contato
- [x] AC10: Tabela com ordenacao por colunas (nome, score, data, etapa)
- [x] AC11: Busca por nome ou telefone (search bar)
- [ ] AC12: Botao "Novo lead" abre modal/formulario de criacao

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/api/leads/route.ts` — GET (list), POST (create)
- `packages/web/src/app/api/leads/[id]/route.ts` — GET (detail), PATCH (update), DELETE
- `packages/web/src/app/dashboard/leads/page.tsx` — Listagem
- `packages/web/src/components/leads/leads-table.tsx` — Tabela de leads
- `packages/web/src/components/leads/lead-form.tsx` — Formulario de criacao/edicao (modal)
- `packages/web/src/components/leads/lead-search.tsx` — Busca
- `packages/db/src/queries/leads.ts` — Queries Supabase
- `packages/shared/src/types/lead.ts` — Types TypeScript

### Query paginada:
```typescript
export async function getLeads(orgId: string, options: {
  page?: number;
  search?: string;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}) {
  let query = supabase
    .from('leads')
    .select(`
      id, name, phone, email, qualification_score, source, created_at, updated_at,
      property_interest:properties(id, name),
      assigned_broker:users(id, name),
      current_stage:kanban_stages(id, name, color)
    `, { count: 'exact' })
    .eq('org_id', orgId)
    .eq('is_active', true);

  if (options.search) {
    query = query.or(`name.ilike.%${options.search}%,phone.ilike.%${options.search}%`);
  }

  return query
    .order(options.orderBy || 'created_at', { ascending: options.orderDir === 'asc' })
    .range((options.page || 0) * 20, ((options.page || 0) + 1) * 20 - 1);
}
```

### Referencia agente-linda:
- Adaptar CRUD de leads de `~/agente-linda/packages/web/src/app/dashboard/leads/` (se existir)
- Adaptar API routes de `~/agente-linda/packages/web/src/app/api/leads/`
- Adicionar campos imobiliarios que nao existem no agente-linda

## Dependencias
- Depende de: 1.2 (schema), 1.5 (auth), 2.1 (properties para vincular interesse)
- Bloqueia: 4.5 (detalhe do lead), 4.6 (designacao)

## Estimativa
M (Media) — 2-3 horas

## File List

- `packages/web/src/app/api/leads/route.ts` — GET (list paginado), POST (create)
- `packages/web/src/app/api/leads/[id]/route.ts` — GET (detail), PATCH (update), DELETE (soft delete)
- `packages/web/src/app/dashboard/leads/page.tsx` — Pagina de listagem com tabela, busca e ordenacao

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
