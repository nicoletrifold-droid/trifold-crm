---
name: vercel-static-deploy-concurrency
description: Deploys de landing-pages/ podem colidir com outro agente editando a mesma pasta; sempre revalidar contra o estado live, nao contra o spec recebido
metadata:
  type: feedback
---

Ao deployar sites estáticos de `landing-pages/` (ver [[vercel-landing-pages-projects]]), **valide sempre contra o que está live no momento da checagem, e re-liste `vercel ls` no fim** — não assuma que o seu deploy é o último nem que o estado da pasta é o descrito no prompt.

**Protocolo de 3 passos (use este, não contagem de ocorrências de texto):**
1. Antes do deploy: `curl -s https://trifold-design-system.vercel.app/{arquivo} > tmp && diff tmp "{arquivo local}"` — mostra exatamente o que o deploy vai mudar.
2. Deploy: `vercel deploy --prod --yes --scope trifold-s-projects` de dentro da pasta.
3. Depois: repetir o diff (deve sair vazio) e rodar `vercel ls trifold-design-system --scope trifold-s-projects` para confirmar que o deployment mais recente é o seu. Validar também pelo hostname custom (`https://trifold.eng.br`) além do alias `.vercel.app` — mesmo objeto, mas confirma que o domínio aponta pro deploy novo.

Em 2026-08-19 o pedido dizia "3 trocas de 'Orce sua obra' → 'Solicitar orçamento'" (1 na Home, 2 na B2B), mas só 2 linhas diferiam do live: o CTA do hero da B2B já tinha sido trocado por outro processo. Contar ocorrências daria leitura ambígua; o diff mostrou a verdade em 1 comando.

**Why:** em 2026-08-17 dois processos trabalhavam na mesma pasta `trifold-design-system` simultaneamente. Fiz `vercel deploy --prod` e validei OK; ~1 min depois outro processo converteu `hero-b2b.png`/`fachada.png` para `.webp`, reescreveu as tags `<link rel="preload">` desses dois HTMLs e publicou um deploy novo por cima do meu. Uma validação feita "uma vez só" teria reportado FALHA falsa (o href esperado no spec, `assets/hero-b2b.png`, virou `assets/hero-b2b.webp`).

**How to apply:**
- Depois de validar, rode `vercel ls {project}` e confirme que o deployment mais recente é o seu; se não for, revalide.
- Compare o HTML servido byte a byte com o arquivo local (`curl -s URL > tmp && diff tmp "arquivo local"`) — isso detecta divergência de snapshot muito melhor que grep de uma tag.
- Se o spec do prompt divergir do estado atual da pasta, o estado da pasta ganha: reporte a divergência em vez de tratá-la como falha.

Padrão confirmado em 2026-08-19: `trifold-design-system` recebe deploys de outros processos a cada poucas horas (3 deploys nas 13h anteriores ao meu; reconfirmado em 2026-08-20 com 3 deploys nos 27 min anteriores). Trate a pasta como editada concorrentemente por default. O `diff` byte a byte contra o arquivo local + `vercel ls` no fim funcionou bem — mantenha essa dupla como validação padrão.

**A concorrência é em rajadas, não constante:** em 2026-08-21 o deploy anterior ao meu tinha 17h de idade e o diff pré-deploy trouxe exatamente 1 linha (a que eu editei). Diff limpo **não** é sinal de que o protocolo é desnecessário — é o resultado esperado quando ninguém mexeu. O diff pré-deploy é justamente o que garante que você não publica por cima do trabalho de outro processo; nunca deployar sem rodá-lo.

**Username NÃO distingue autoria (corrigido 2026-08-20):** os deploys que eu mesmo faço da pasta também aparecem em `vercel ls` como `nicoletrifold-droid` — é a conta autenticada no CLI daquele diretório, não um terceiro. Para identificar o *meu* deploy use `Age` + o `dpl_...` retornado pelo `vercel deploy`. O sinal confiável de que outro processo mexeu é o **diff pré-deploy trazer linhas que eu não editei**.

**Gotcha de validação:** `curl -s URL | grep -o '...' | head -1` dá falso negativo intermitente (SIGPIPE mata o curl antes do fim do stream). Salve em arquivo primeiro, depois faça grep. Grep de contagem serve só como sanity check secundário.

Para assets binários trocados no mesmo path, diff não é o instrumento — use SHA256: [[vercel-static-deploy-cdn-stale]]. Para provar valores resolvidos em runtime nos `.dc.html` (template client-side), é preciso render headless: [[headless-render-validation]].
