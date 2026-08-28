---
name: trifold-crm-domains
description: Dominios/aliases Vercel do projeto trifold-crm — canonico e o alias .vercel.app real
metadata:
  type: reference
---

Projeto Vercel "trifold-crm" (prj_s3ARh1fpDnzbx9ua4MYJf9iqdRhj, team_XCf2jBxUmCXao0prWVy0VmOZ):

- Dominio de producao CANONICO: `crm.trifold.eng.br` (verified). Usar este em webhooks/integracoes externas.
- Alias `.vercel.app` real: `trifold-crm-delta.vercel.app`. NAO existe `trifold-crm.vercel.app` — nao assumir esse host.

**Why:** ao conectar a landing vind-residence ao webhook `/api/webhooks/landing-page`, precisei confirmar o host correto; o palpite `trifold-crm.vercel.app` estaria errado.

**How to apply:** para qualquer proxy/integracao que aponte para o CRM, use `crm.trifold.eng.br`. Ver tambem [[project_vercel_landing_pages_projects]].
