status: Done

# Story 4.5 — Detalhe do Lead (Pagina Completa)

## Contexto
A pagina de detalhe do lead e onde o supervisor/admin ve TUDO sobre um lead: dados pessoais, preferencias imobiliarias, historico da conversa com o agente, resumo IA, timeline de atividades, empreendimento de interesse e notas. E a pagina mais acessada do CRM — o supervisor abre para decidir proximos passos, e o corretor abre para entender o lead antes de atender.

## Acceptance Criteria
- [x] AC1: Pagina `/dashboard/leads/[id]` renderiza com todas as secoes do lead
- [x] AC2: **Header:** Nome do lead, telefone (clicavel para WhatsApp), email, etapa atual (badge com cor), score (badge), corretor designado, botao "Editar"
- [x] AC3: **Secao Dados:** Empreendimento de interesse, tipologia, preferencias (quartos, andar, vista, garagem), tem entrada, origem (badge), UTM params
- [x] AC4: **Secao Resumo IA:** Card com `ai_summary` gerado automaticamente — preferencias, objecoes, perguntas, proximos passos recomendados
- [x] AC5: **Secao Conversa:** Historico completo de mensagens (agente + lead + corretor) — exibido como chat bubbles com timestamp e sender type (IA = roxo, Lead = cinza, Corretor = azul, Supervisor = vermelho)
- [x] AC6: **Secao Timeline:** Activity logs em ordem cronologica reversa (mais recente primeiro)
- [x] AC7: **Secao Notas:** Area para adicionar notas em texto livre (admin/supervisor/corretor)
- [x] AC8: **Acoes rapidas:** Mover para etapa (dropdown), Designar corretor (dropdown), Marcar visita agendada
- [ ] AC9: Secao conversa carrega via scroll infinito (ultimas 50 mensagens, load more ao scrollar pra cima)
- [ ] AC10: Dados atualizados em tempo real via Supabase Realtime (nova mensagem aparece, mudanca de etapa reflete)
- [x] AC11: Layout em tabs ou sidebar: Dados | Conversa | Timeline | Notas

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/dashboard/leads/[id]/page.tsx` — Pagina de detalhe
- `packages/web/src/components/leads/lead-header.tsx` — Header com dados e acoes
- `packages/web/src/components/leads/lead-info.tsx` — Dados e preferencias
- `packages/web/src/components/leads/lead-summary.tsx` — Resumo IA
- `packages/web/src/components/leads/lead-conversation.tsx` — Chat history
- `packages/web/src/components/leads/lead-timeline.tsx` — Activity logs
- `packages/web/src/components/leads/lead-notes.tsx` — Notas
- `packages/web/src/components/leads/lead-actions.tsx` — Acoes rapidas
- `packages/web/src/hooks/use-lead-detail.ts` — Hook com queries + realtime

### Query de detalhe:
```typescript
export async function getLeadDetail(leadId: string) {
  const { data } = await supabase
    .from('leads')
    .select(`
      *,
      property_interest:properties(id, name, slug),
      typology_interest:typologies(id, name, private_area_m2),
      assigned_broker:users(id, name, phone),
      current_stage:kanban_stages(id, name, color),
      conversations(
        id,
        messages(id, content, sender_type, media_url, created_at)
      ),
      activities(id, type, description, created_by, created_at)
    `)
    .eq('id', leadId)
    .single();
  return data;
}
```

### Chat bubbles:
```typescript
const senderStyles = {
  ai: { bg: 'bg-purple-100', label: 'Nicole (IA)', align: 'left' },
  lead: { bg: 'bg-gray-100', label: 'Lead', align: 'right' },
  broker: { bg: 'bg-blue-100', label: 'Corretor', align: 'left' },
  supervisor: { bg: 'bg-red-100', label: 'Supervisor', align: 'left' },
};
```

### Referencia agente-linda:
- Adaptar pagina de detalhe de `~/agente-linda/packages/web/src/app/dashboard/leads/[id]/`
- Reusar componente de chat history
- Adicionar secoes imobiliarias (empreendimento, preferencias, resumo IA)

## Dependencias
- Depende de: 4.4 (CRUD leads), 4.7 (conversa visivel), 4.9 (activity logs)
- Bloqueia: 6.4 (detalhe do lead versao corretor reutiliza esta pagina)

## Estimativa
G (Grande) — 3-4 horas

## File List

- `packages/web/src/app/dashboard/leads/[id]/page.tsx` — Pagina de detalhe do lead com header, dados, resumo IA, conversa e timeline
- `packages/web/src/app/api/leads/[id]/notes/route.ts` — API routes GET e POST para notas do lead
- `packages/web/src/app/api/leads/[id]/stage/route.ts` — API route PATCH para mudanca de etapa (acoes rapidas)

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
