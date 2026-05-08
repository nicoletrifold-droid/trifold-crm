status: Done

# Story 7.2 — Tracking de Origem (UTM Params e Source)

## Contexto
Saber de onde cada lead veio e fundamental para ROI de marketing. Cada lead tem uma origem (whatsapp, meta_ads, site, indicacao) e opcionalmente UTM params (campaign, source, medium, content). A origem e capturada automaticamente na criacao do lead — por webhook Meta Ads, por referral data do Click-to-WhatsApp Ads, ou manualmente. A informacao e exibida no card do lead e nos filtros do pipeline.

## Acceptance Criteria
- [ ] AC1: Campo `source` no lead preenchido automaticamente baseado na origem:
  - `whatsapp` — lead iniciou conversa pelo WhatsApp (sem referral)
  - `meta_ads` — lead veio de formulario Meta Ads (Story 7.1)
  - `ctwa` — lead veio de Click-to-WhatsApp Ads (referral data presente)
  - `site` — lead veio do site (futuro)
  - `referral` — indicacao (criado manualmente)
  - `manual` — criado pelo admin
- [ ] AC2: Campos UTM preenchidos quando disponiveis: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
- [ ] AC3: Para leads de CTWA Ads, capturar dados de referral adicionais: `ctwa_clid`, `source_url`, `ad_id`, `campaign_id` (armazenados em `leads.metadata`)
- [ ] AC4: Badge de origem visivel no card do lead no pipeline kanban (icone + texto)
- [ ] AC5: Badge de origem visivel no detalhe do lead
- [ ] AC6: Filtro por origem no pipeline (Story 4.3 — ja previsto)
- [ ] AC7: Na listagem de leads (Story 4.4), coluna "Origem" com badge
- [ ] AC8: Se lead vem de CTWA Ads e tem `campaign_id`, resolver nome da campanha via cache/lookup
- [ ] AC9: API route `GET /api/analytics/sources` retorna contagem de leads por origem (para dashboard futuro)
- [ ] AC10: Origem e imutavel apos criacao (nao pode ser editada — e historica)

## Detalhes Tecnicos

### Arquivos a criar/modificar:
- `packages/web/src/components/leads/source-badge.tsx` — Badge de origem
- `packages/bot/src/handlers/message-handler.ts` — (modificar) Detectar source ao criar lead
- `packages/web/src/app/api/analytics/sources/route.ts` — GET (contagem por origem)
- `packages/shared/src/types/lead.ts` — (modificar) Adicionar enum `LeadSource`

### Badge de origem:
```typescript
const sourceConfig: Record<LeadSource, { label: string; color: string; icon: string }> = {
  whatsapp: { label: 'WhatsApp', color: 'green', icon: 'MessageCircle' },
  meta_ads: { label: 'Meta Ads', color: 'blue', icon: 'Facebook' },
  ctwa: { label: 'CTWA Ad', color: 'purple', icon: 'MousePointerClick' },
  site: { label: 'Site', color: 'gray', icon: 'Globe' },
  referral: { label: 'Indicacao', color: 'orange', icon: 'Users' },
  manual: { label: 'Manual', color: 'slate', icon: 'Pencil' },
};
```

### Deteccao automatica de source:
```typescript
// No message-handler.ts, ao criar lead:
function detectSource(parsedMessage: ParsedMessage): LeadSource {
  if (parsedMessage.referral?.ctwa_clid) return 'ctwa';
  if (parsedMessage.referral) return 'meta_ads';
  return 'whatsapp'; // Default para mensagens organicas
}
```

## Dependencias
- Depende de: 1.2 (campos source/utm no schema), 3.7 (adapter captura referral), 7.1 (Meta Ads webhook)
- Bloqueia: 7.4 (CTWA Ads tracking), 8.4 (performance por campanha)

## Estimativa
M (Media) — 2 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
