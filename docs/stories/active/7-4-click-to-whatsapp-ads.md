status: Done

# Story 7.4 — Click-to-WhatsApp Ads (Referral Data + Janela 72h)

## Contexto
Click-to-WhatsApp Ads (CTWA) sao anuncios no Facebook/Instagram com botao "Enviar mensagem" que abre o WhatsApp direto. A Meta envia dados de referral no webhook (campaign_id, ad_id, ctwa_clid) e abre uma janela de 72h gratuita (vs 24h padrao). Capturar esses dados permite rastrear qual campanha/criativo gerou cada lead e otimizar investimento em marketing.

## Acceptance Criteria
- [ ] AC1: Quando mensagem chega com referral data (`messages[0].referral`), extrair e salvar:
  - `source_url` — URL do anuncio
  - `source_id` — ID do anuncio
  - `source_type` — Tipo (ad, post, etc.)
  - `headline` — Titulo do anuncio
  - `body` — Corpo do anuncio
  - `ctwa_clid` — Click-to-WhatsApp click ID (unico por clique)
- [ ] AC2: Dados de referral salvos em `leads.metadata.referral` (jsonb)
- [ ] AC3: Lead criado com `source = 'ctwa'`
- [ ] AC4: Se possivel, resolver `campaign_id` e `ad_id` via Graph API para obter nomes legibles
- [ ] AC5: Janela de 72h rastreada: campo `leads.metadata.ctwa_window_expires_at` = timestamp de criacao + 72h
- [ ] AC6: Dentro da janela de 72h, templates de marketing sao gratuitos — sistema deve priorizar envios dentro dessa janela
- [ ] AC7: Badge especial no card do lead: "CTWA Ad" com nome da campanha (se disponivel)
- [ ] AC8: No detalhe do lead, secao "Origem" exibe dados completos do anuncio: campanha, criativo, URL
- [ ] AC9: Activity log: `lead_created` com metadata `{ source: 'ctwa', campaign: '...', ad: '...' }`
- [ ] AC10: API route `GET /api/analytics/ctwa` retorna leads por campanha CTWA (para futuro analytics)

## Detalhes Tecnicos

### Arquivos a modificar:
- `packages/bot/src/adapters/whatsapp-cloud-adapter.ts` — Extrair referral do payload
- `packages/bot/src/handlers/message-handler.ts` — Salvar referral data ao criar lead
- `packages/web/src/components/leads/source-badge.tsx` — Badge especial para CTWA

### Arquivos a criar:
- `packages/web/src/components/leads/ctwa-info.tsx` — Exibicao de dados CTWA no detalhe
- `packages/web/src/app/api/analytics/ctwa/route.ts` — GET (leads por campanha CTWA)

### Payload de referral (ja documentado na Story 3.7):
```json
{
  "messages": [{
    "from": "5544999999999",
    "type": "text",
    "text": { "body": "Quero saber sobre o Yarden" },
    "referral": {
      "source_url": "https://fb.me/...",
      "source_id": "120208XXXXXX",
      "source_type": "ad",
      "headline": "Yarden Residence - Lancamento",
      "body": "2 suites, rooftop completo",
      "ctwa_clid": "ARAk..."
    }
  }]
}
```

### Salvar referral:
```typescript
if (parsedMessage.referral) {
  await supabase.from('leads').update({
    source: 'ctwa',
    metadata: {
      ...lead.metadata,
      referral: parsedMessage.referral,
      ctwa_window_expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    },
  }).eq('id', leadId);
}
```

### Resolver nomes de campanha:
```typescript
// Opcional — so funciona se tivermos access_token com permissao ads_read
async function resolveCampaignName(campaignId: string): Promise<string> {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${campaignId}?fields=name&access_token=${META_ADS_ACCESS_TOKEN}`
  );
  const data = await response.json();
  return data.name;
}
```

## Dependencias
- Depende de: 3.7 (adapter captura referral), 7.2 (tracking de origem)
- Bloqueia: 8.4 (performance por campanha)

## Estimativa
M (Media) — 2-3 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
