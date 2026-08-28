---
name: roas-attribution-gap
description: ROAS=0 em todas campanhas Meta apesar de centenas de leads — hipótese de gap de registro de venda no CRM
metadata:
  type: project
---

Em 2026-07-08, a view `meta_campaign_roas` (prod, all-time, BRL) mostrava **ROAS=0 em 100% das campanhas ativas**, com 231+ leads no CRM e nenhuma venda atribuída via `unit_sales`.

**Why:** Duas hipóteses — (a) ciclo de venda imobiliário longo ainda não maturou; (b) gap de processo: vendas fechadas não estão sendo registradas no CRM vinculadas ao lead de origem, quebrando atribuição. A #2 é a mais provável se NENHUMA venda existe após meses.
**How to apply:** Antes de recomendar escalar mídia por CPL, sempre verificar se existe registro de venda vinculado a lead (`unit_sales`). Sem esse loop fechado, CPL é o único sinal disponível — não há nCAC/LTV real. Investigar: fluxo do vendedor ao fechar venda vincula lead_id/telefone/email? Ver [[campaign-naming-attribution]].

Referência de dados: view `meta_campaign_roas`. CPLs de referência achados: Vind ~R$15–20, Yarden ~R$30. Campanha WhatsApp CTWA (OUTCOME_ENGAGEMENT) tinha o menor CPL (R$11,79).
