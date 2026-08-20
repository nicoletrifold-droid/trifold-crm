---
name: vind-residence-landing-deploy
description: Landing page estatica vind-residence tem projeto Vercel proprio separado do trifold-crm de producao
metadata:
  type: project
---

A landing page `/Users/lucasprado/trifold-crm/landing-pages/vind-residence` (replica de vindresidence.com.br) tem seu proprio projeto Vercel de TESTE, separado do trifold-crm de producao.

- Projeto Vercel: `vind-residence-teste` (prj_bSyrklkya14GAfeXdOlUXdyntqWp), team Trifold's projects (`trifold-s-projects`, orgId team_XCf2jBxUmCXao0prWVy0VmOZ).
- URL de teste: https://vind-residence-teste.vercel.app — SEM dominio customizado (cliente ainda vai decidir sobre o dominio final).
- Site estatico puro: index.html autocontido + pasta assets/. Sem build step, sem framework.
- `.vercelignore` na pasta exclui `.claude/` (que fica dentro de assets/) e README.md do deploy.

**Why:** Cliente pediu para testar a landing antes de decidir o dominio; nao deve interferir no projeto/dominio de producao trifold-crm (crm.trifold.eng.br).

**How to apply:** Para redeploy de teste, rodar na pasta da landing: `vercel deploy --prod --yes --scope trifold-s-projects`. Nunca vincular ao projeto trifold-crm. Nao commitar `.vercel/` nem fazer push git — deploy e direto de arquivos. Ver [[project-main-divergence-2026-06-08]] para contexto do repo principal.
