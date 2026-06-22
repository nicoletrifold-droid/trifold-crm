---
name: reference-meta-page-forms
description: Meta Page "Trifold" (Real Estate Developer) tem 29 leadgen forms ACTIVE — para teste E2E priorize forms recentes (VIND RESIDENCE 02.02.26, REMARKETING TODOS 19.01.26)
metadata:
  type: reference
---

A Meta Page conectada ao webhook leadgen é "Trifold" (categoria Real Estate Developer). Page ID em `.env.local` como `META_PAGE_ID` (sufixo `...0861`).

Forms ativos relevantes para teste E2E via Lead Ads Testing Tool (validados em 2026-06-08):

- `1458828689172641` — VIND RESIDENCE 02.02.26 (mais recente, ACTIVE, criado 2026-02-02)
- `1311883497651909` — REMARKETING TODOS 19.01.26 (ACTIVE, 2026-01-19)
- `857521620343892` — CONDIÇÕES ESPECIAL CORRETORES. 01 (ACTIVE, 2025-12-12)
- `25169725352679357` — BLACK PERGUNTA SE TEM INTERESSE VIND OU YARDEN - 2 (ACTIVE, 2025-11-28)

Total: 27 ACTIVE + 2 ARCHIVED. Para listar atual: GET `/v21.0/{META_PAGE_ID}/leadgen_forms?fields=id,name,status,created_time` — NOTA: campo `leadgen_export_csv_url` foi deprecated a partir de v5.0 e quebra a query se incluído.

Why: Quando o user precisa disparar lead-teste via `developers.facebook.com/tools/lead-ads-testing/` ele precisa selecionar (a) a página e (b) um form ativo dela. Sem essa lista pronta o user gasta tempo navegando o painel.

How to apply: Quando user mencionar "disparar lead-teste", "test lead", "Lead Ads Testing Tool" ou validação E2E do webhook leadgen, apresente os forms mais recentes (não os de 2023). Para validar pós-disparo, consulte [[project-meta-subscription]] e verifique `webhook_logs` source=meta_ads.
