---
name: validate-deploy-diff-vs-live
description: Validar deploy do trifold-design-system com diff byte a byte (live vs arquivo local) antes e depois, mais vercel ls no fim — a pasta recebe deploys concorrentes de outro processo
metadata:
  type: feedback
---

Ao publicar mudanças em `trifold-design-system`, use este protocolo em vez de contar ocorrências de texto:
1. Antes do deploy: `curl -s https://trifold-design-system.vercel.app/{arquivo} > tmp && diff tmp {arquivo local}` — isso mostra exatamente o que o deploy vai mudar.
2. Deploy: `vercel deploy --prod --yes --scope trifold-s-projects` de dentro da pasta.
3. Depois: repetir o diff (deve sair vazio) e rodar `vercel ls trifold-design-system --scope trifold-s-projects` para confirmar que o deployment mais recente é o seu.

**Why:** a pasta é editada e deployada concorrentemente por outro processo (usuário Vercel `nicoletrifold-droid`, ~9 deploys nas 6h anteriores em 2026-08-19, um deles 8 min antes do meu). Consequência prática: a contagem de ocorrências descrita no prompt pode não bater com o diff real. Em 2026-08-19 o pedido dizia "3 trocas de 'Orce sua obra' → 'Solicitar orçamento'" (1 na Home, 2 na B2B), mas só 2 linhas diferiam do live — o CTA do hero da B2B já tinha sido trocado por outro processo. Contar ocorrências daria leitura ambígua; o diff mostrou a verdade em 1 comando.

Frequência de deploys concorrentes reconfirmada em 2026-08-20: 3 deploys de `nicoletrifold-droid` nos 27 min anteriores ao meu. O diff pré-deploy é o que garante que você não vai publicar por cima do trabalho de outro processo — nunca deployar sem rodá-lo. Valide também pelo hostname `https://trifold.eng.br` além do alias `.vercel.app` (mesmo objeto, mas confirma que o domínio custom aponta para o deploy novo).

**How to apply:** o estado da pasta local ganha do spec do prompt — se divergirem, reporte a divergência em vez de tratar como falha. Grep de contagem serve só como sanity check secundário; nunca com `curl | grep -o ... | head` (SIGPIPE mata o curl e dá falso negativo — salve em arquivo primeiro). Para assets binários trocados no mesmo path, use SHA256 em vez de diff: ver [[vercel-static-deploy-cdn-stale]]. Para provar valores resolvidos em runtime nos `.dc.html`, é preciso render headless: ver [[headless-render-validation]].
