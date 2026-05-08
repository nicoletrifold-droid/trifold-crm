status: Done

# Story 10.4 — Tela de Leads Mobile (PWA)

## Contexto
Alem da agenda, o corretor precisa acessar seus leads pelo celular: quem sao, qual o status, qual o ultimo contato, qual o resumo da IA. A tela de leads mobile e uma versao otimizada da Story 6.3 (lista de leads corretor) para touch. Cards compactos com informacoes essenciais, badge de leads novos nao vistos, e toque pra ver resumo IA e conversa do agente. O corretor NAO conversa com leads pela PWA — apenas consulta informacoes para se preparar antes de ligar ou enviar mensagem pelo WhatsApp.

## Acceptance Criteria
- [ ] AC1: Rota `/corretor/leads` renderiza layout mobile quando viewport < 768px (responsive)
- [ ] AC2: Lista de leads do corretor em cards compactos, ordenados por ultima interacao (mais recente primeiro)
- [ ] AC3: Card exibe: nome do lead, empreendimento de interesse, status do pipeline (badge), tempo desde ultima interacao ("ha 2h", "ontem")
- [ ] AC4: Badge numerico no icone de leads (bottom nav) indicando quantidade de leads novos nao vistos
- [ ] AC5: Tabela `lead_views` ou campo `last_viewed_at` no lead para rastrear visualizacao pelo corretor
- [ ] AC6: Toque no card abre pagina de detalhe mobile com:
  - Resumo IA no topo (Story 4.8 / 6.5)
  - Dados do lead (nome, telefone, empreendimento, score)
  - Timeline de atividades resumida
  - Botao "Ver conversa do agente" (abre historico Nicole + lead)
  - Botoes de acao: Ligar (tel:), WhatsApp (wa.me), Copiar telefone
- [ ] AC7: Busca por nome ou telefone com input no topo da lista
- [ ] AC8: Filtro rapido por status do pipeline (chips horizontais scrollaveis)
- [ ] AC9: Pull to refresh na lista
- [ ] AC10: Infinite scroll (carregar mais leads ao chegar no fim da lista — paginacao cursor-based)
- [ ] AC11: Estado vazio: "Nenhum lead designado ainda"
- [ ] AC12: Performance: skeleton loading nos cards, lazy load de resumo IA

## Detalhes Tecnicos

### Arquivos a criar/modificar:
- `packages/web/src/components/leads/mobile/leads-list-mobile.tsx` — Lista mobile
- `packages/web/src/components/leads/mobile/lead-card-mobile.tsx` — Card compacto
- `packages/web/src/components/leads/mobile/lead-detail-mobile.tsx` — Detalhe mobile
- `packages/web/src/components/leads/mobile/lead-search-bar.tsx` — Busca mobile
- `packages/web/src/app/(dashboard)/corretor/leads/page.tsx` — Modificar para responsive
- `packages/web/src/app/(dashboard)/corretor/leads/[id]/page.tsx` — Detalhe responsivo
- `packages/web/src/hooks/use-lead-views.ts` — Hook para rastrear visualizacao

### Responsividade na pagina:
```tsx
// corretor/leads/page.tsx
export default function LeadsPage() {
  return (
    <>
      <div className="hidden md:block">
        <LeadsListDesktop ... /> {/* Story 6.3 */}
      </div>
      <div className="block md:hidden">
        <LeadsListMobile ... />
      </div>
    </>
  );
}
```

### Card mobile:
```tsx
// lead-card-mobile.tsx
function LeadCardMobile({ lead, isNew }: { lead: Lead; isNew: boolean }) {
  return (
    <Link href={`/corretor/leads/${lead.id}`}>
      <div className="flex items-center gap-3 p-4 border-b relative">
        {/* Badge novo */}
        {isNew && <div className="absolute top-2 right-2 w-2 h-2 bg-orange-500 rounded-full" />}

        {/* Avatar com iniciais */}
        <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-semibold text-sm shrink-0">
          {getInitials(lead.name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{lead.name}</p>
          <p className="text-sm text-muted-foreground truncate">{lead.property_name || 'Sem empreendimento'}</p>
        </div>

        {/* Status + tempo */}
        <div className="text-right shrink-0">
          <Badge variant={statusVariant(lead.pipeline_status)}>{lead.pipeline_status}</Badge>
          <p className="text-xs text-muted-foreground mt-1">{timeAgo(lead.last_interaction_at)}</p>
        </div>
      </div>
    </Link>
  );
}
```

### Rastreamento de visualizacao (leads novos):
```sql
-- Opcao 1: tabela dedicada
CREATE TABLE lead_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lead_id, user_id)
);

CREATE INDEX idx_lead_views_user ON lead_views(user_id);
```

```typescript
// use-lead-views.ts
export function useUnseenLeadsCount() {
  return useQuery({
    queryKey: ['unseen-leads-count'],
    queryFn: async () => {
      // Leads designados ao corretor que ele ainda nao visualizou
      const { count } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_broker_id', userId)
        .not('id', 'in', supabase.from('lead_views').select('lead_id').eq('user_id', userId));
      return count;
    },
    refetchInterval: 30000 // Refresh a cada 30s
  });
}

// Marcar como visto ao abrir detalhe
export function useMarkLeadViewed(leadId: string) {
  useEffect(() => {
    supabase.from('lead_views').upsert({
      lead_id: leadId,
      user_id: userId,
      viewed_at: new Date()
    }, { onConflict: 'lead_id,user_id' });
  }, [leadId]);
}
```

### Paginacao cursor-based:
```typescript
// Infinite scroll com cursor
export function useLeadsList(filters: LeadFilters) {
  return useInfiniteQuery({
    queryKey: ['leads', filters],
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from('leads')
        .select('*, property:properties(name)')
        .eq('assigned_broker_id', userId)
        .order('last_interaction_at', { ascending: false })
        .limit(20);

      if (pageParam) {
        query = query.lt('last_interaction_at', pageParam);
      }
      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
      }
      if (filters.status) {
        query = query.eq('pipeline_status', filters.status);
      }

      const { data } = await query;
      return data;
    },
    getNextPageParam: (lastPage) =>
      lastPage?.length === 20 ? lastPage[lastPage.length - 1].last_interaction_at : undefined
  });
}
```

### Bottom nav da PWA:
```tsx
// Adicionar bottom navigation fixo para mobile
<nav className="fixed bottom-0 left-0 right-0 bg-white border-t flex md:hidden z-50">
  <NavItem href="/corretor/agenda" icon={<CalendarIcon />} label="Agenda" />
  <NavItem href="/corretor/leads" icon={<UsersIcon />} label="Leads" badge={unseenCount} />
  <NavItem href="/corretor/perfil" icon={<UserIcon />} label="Perfil" />
</nav>
```

## Dependencias
- Depende de: 6.3 (lista leads corretor — logica base), 6.5 (resumo IA corretor), 10.1 (PWA setup)
- Bloqueia: nenhuma

## Estimativa
G (Grande) — 3-4 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
