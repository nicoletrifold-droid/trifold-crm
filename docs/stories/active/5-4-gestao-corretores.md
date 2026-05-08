status: Done

# Story 5.4 — Gestao de Corretores (CRUD)

## Contexto
Corretores sao usuarios do sistema com role `broker`. O admin precisa poder cadastrar, editar, ativar/desativar corretores e vincular cada um a 1+ empreendimentos. O numero de telefone Trifold e obrigatorio porque com Coexistence Mode o corretor responde via WhatsApp Business App vinculado ao numero oficial. A tabela `users` (com role `broker`) e `broker_assignments` (vinculo corretor <-> empreendimento) sao usadas.

## Acceptance Criteria
- [x] AC1: Pagina `/dashboard/settings/brokers` lista todos os corretores da org
- [x] AC2: Lista exibe: nome, email, telefone pessoal, empreendimentos vinculados (badges), status (ativo/inativo), total de leads designados
- [x] AC3: Botao "Novo corretor" abre formulario de criacao
- [x] AC4: Formulario de criacao: nome*, email*, telefone pessoal*, empreendimentos atribuidos* (multi-select: Vind, Yarden), status
- [ ] AC5: Ao criar corretor, usuario e criado na Supabase Auth com role `broker` e senha temporaria (ou convite por email)
- [x] AC6: Edicao: todos os campos editaveis exceto email (imutavel apos criacao)
- [x] AC7: Toggle ativo/inativo: corretor inativo nao recebe novos leads mas mantem leads existentes
- [x] AC8: Vincular/desvincular empreendimentos atualiza tabela `broker_assignments`
- [x] AC9: API routes: GET/POST `/api/brokers`, GET/PATCH/DELETE `/api/brokers/[id]`
- [ ] AC10: Validacao: email unico, pelo menos 1 empreendimento vinculado
- [ ] AC11: Ao desativar corretor, leads nao-finalizados sao listados com warning ("Este corretor tem X leads ativos")

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/dashboard/settings/brokers/page.tsx` — Listagem
- `packages/web/src/components/settings/broker-list.tsx` — Tabela de corretores
- `packages/web/src/components/settings/broker-form.tsx` — Formulario
- `packages/web/src/app/api/brokers/route.ts` — GET (list), POST (create)
- `packages/web/src/app/api/brokers/[id]/route.ts` — GET (detail), PATCH (update), DELETE (deactivate)
- `packages/db/src/queries/brokers.ts` — Queries

### Schema (tabelas envolvidas):
```sql
-- users (role = 'broker')
-- id, org_id, name, email, phone, role, is_active, created_at, updated_at

-- broker_assignments (vinculo corretor <-> empreendimento)
-- id, broker_id (FK users), property_id (FK properties), created_at
-- UNIQUE(broker_id, property_id)
```

### Criacao de corretor:
```typescript
async function createBroker(data: CreateBrokerInput) {
  // 1. Criar usuario no Supabase Auth (email + senha temporaria)
  const { data: authUser } = await supabase.auth.admin.createUser({
    email: data.email,
    password: generateTempPassword(),
    email_confirm: true,
  });

  // 2. Inserir na tabela users com role broker
  await supabase.from('users').insert({
    id: authUser.user.id,
    org_id: data.orgId,
    name: data.name,
    email: data.email,
    phone: data.phone,
    role: 'broker',
  });

  // 3. Criar broker_assignments para cada empreendimento
  await supabase.from('broker_assignments').insert(
    data.propertyIds.map(pid => ({
      broker_id: authUser.user.id,
      property_id: pid,
    }))
  );
}
```

## Dependencias
- Depende de: 1.2 (schema), 1.5 (auth + Supabase Auth admin), 2.1 (properties para vinculo)
- Bloqueia: 4.6 (designacao de leads precisa de corretores), 6.1 (login corretor)

## Estimativa
M (Media) — 2-3 horas

## File List

- `packages/web/src/app/dashboard/corretores/page.tsx` — Pagina de gestao de corretores com listagem, criacao e edicao
- `packages/web/src/app/api/brokers/route.ts` — GET (list), POST (create)
- `packages/web/src/app/api/brokers/[id]/route.ts` — GET (detail), PATCH (update), DELETE (deactivate)

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
