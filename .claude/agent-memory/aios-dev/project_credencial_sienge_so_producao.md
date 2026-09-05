---
name: credencial-de-sienge-so-existe-em-producao
description: Não existe ambiente de teste do Sienge neste repo — por decisão deliberada; scripts que falam com o Sienge só rodam contra produção e a cota é de 1.000 chamadas/dia
metadata:
  type: project
---

`SIENGE_SUBDOMAIN` / `SIENGE_USERNAME` / `SIENGE_PASSWORD` **não existem** em `.env.teste`,
`packages/web/.env.development` nem `.env.development.example` — e isso é intencional: o próprio
`.env.development` diz que "tokens de integração externa (Meta/WhatsApp, Sienge, Resend) ficam FORA
de propósito: em dev eles disparariam efeito real no mundo". O fluxo pretendido dos scripts do Sienge
é `vercel env pull <tmp>` + `--env-file <tmp>`.

**Why:** a assinatura tem cota de **1.000 chamadas/dia** e já esteve em 84% (um cron 4x/dia comia a
folga, corrigido no PR #548). Gastar cota para "ver se funciona" é dano real, não hipótese. E como não
há sandbox, qualquer chamada é contra os dados de verdade da empreendedora.

**How to apply:** nunca inventar credencial de Sienge nem rodar script que fale com a API só para
validar. Para provar mudança de env/carregamento, use a **mensagem de variáveis faltando** — os
scripts (`sienge-recto-liquido-check.ts`, `sienge-conciliar-extrato-pdf.ts`) checam `REQUIRED` e saem
**antes** de qualquer HTTP, então a lista é prova grátis. Antes de rodar, confirme
`grep -c '^SIENGE' packages/web/.env.producao.local` → `0`: com as chaves presentes o script
*passaria* da checagem e iria à rede. Relacionado: [[env-layout-deste-checkout]].
