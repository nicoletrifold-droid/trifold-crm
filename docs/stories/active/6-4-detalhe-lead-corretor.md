status: Done

# Story 6.4 — Detalhe do Lead (Versao Corretor)

## Contexto
O corretor precisa ver os dados completos do lead antes de atender: preferencias, historico da conversa com a Nicole, resumo IA e notas. A pagina reutiliza componentes da Story 4.5 (detalhe do lead admin), mas com permissoes diferentes: corretor pode adicionar notas e mover etapa, mas NAO pode redesignar, deletar ou editar dados do lead.

## Acceptance Criteria
- [x] AC1: Pagina `/broker/leads/[id]` renderiza detalhe completo do lead
- [x] AC2: **Header:** Nome, telefone (link para WhatsApp — `https://wa.me/55...`), empreendimento, etapa, score
- [x] AC3: **Resumo IA** exibido no topo como card destacado (Story 4.8 / 6.5)
- [x] AC4: **Conversa do agente:** Historico completo de mensagens (Nicole + lead + corretor) — read-only
- [x] AC5: **Dados do lead:** Preferencias (quartos, andar, vista, garagem), origem, tem entrada — read-only
- [x] AC6: **Timeline:** Activity logs do lead — read-only
- [ ] AC7: **Notas:** Corretor pode adicionar notas em texto livre (salva com `created_by = broker_id`)
- [ ] AC8: **Acoes do corretor:** Mover para etapa (dropdown), Marcar visita agendada (date picker)
- [x] AC9: Corretor NAO pode: redesignar a outro corretor, deletar lead, editar dados do lead
- [x] AC10: Botao "Abrir no WhatsApp" — abre `https://wa.me/{phone}` para continuar conversa no WhatsApp Business App
- [ ] AC11: Validacao: corretor so pode acessar leads designados a ele (retorna 403 se tentar acessar lead de outro corretor)

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/broker/leads/[id]/page.tsx` — Pagina de detalhe
- `packages/web/src/app/api/leads/[id]/notes/route.ts` — POST (adicionar nota)

### Reuso de componentes (da Story 4.5):
```typescript
// Reusar:
// - lead-header.tsx (com prop readOnly)
// - lead-info.tsx (com prop readOnly)
// - lead-summary.tsx
// - lead-conversation.tsx
// - lead-timeline.tsx
// - lead-notes.tsx (com prop canAdd=true)

// Nao exibir:
// - lead-actions.tsx com acoes de admin (redesignar, deletar)
```

### Validacao de acesso:
```typescript
// No API route ou no server component
const lead = await getLeadDetail(leadId);
if (lead.assigned_broker_id !== currentUser.id) {
  return new Response('Forbidden', { status: 403 });
}
```

### Nota sobre Coexistence Mode:
O botao "Abrir no WhatsApp" e a acao principal do corretor. Ele clica, abre o WhatsApp Business App, e responde ao lead. As mensagens enviadas pelo corretor via App sao capturadas pelo Messaging Echoes (Story 7.3) e aparecem no CRM automaticamente.

## Dependencias
- Depende de: 6.1 (login corretor), 4.5 (componentes de detalhe), 4.7 (conversa), 4.8 (resumo IA)
- Bloqueia: Nenhuma

## Estimativa
M (Media) — 2 horas (reusar ~70% da Story 4.5)

## File List

- `packages/web/src/app/broker/leads/[id]/page.tsx` — Pagina de detalhe do lead para o corretor com header, resumo IA, conversa, dados e timeline; sem acoes de redesignacao/delecao

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
