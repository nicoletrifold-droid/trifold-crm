---
name: campaign-naming-attribution
description: Convenção de nomenclatura de campanha Meta e como o CRM Trifold atribui lead→campanha (via utm_campaign = nome exato)
metadata:
  type: project
---

O CRM Trifold associa lead→campanha via `utm_campaign` = **nome exato da campanha no Meta**. Em Lead Ads (webhook `leadgen`) e CTWA (`referral/ad_id`) a atribuição é automática — **não precisa UTM manual**.

Padrão de nome observado nas campanhas ativas: `[OBJETIVO. PRODUTO. PÚBLICO] [DD.MM.AA]` — ex: `[LEADS. VIND. INVESTIDORES] [08.06.26]`.

**Why:** Se a campanha for renomeada depois de rodando, quebra a atribuição histórica no CRM (o vínculo é pelo nome-string, não por ID).
**How to apply:** Ao recomendar criação/iteração de campanha, sempre instruir manter o nome estável; para iterar, criar campanha NOVA com data nova em vez de renomear. Produtos ativos em tráfego: Vind Residence (Maringá-PR, investidores + moradores locais) e Yarden.
