---
name: vercelignore-static-projects-exposure
description: Projetos Vercel estáticos sem .vercelignore publicam .claude/ na web; ao criar o arquivo migre as regras do .gitignore que existiam ANTES (o fallback morre) — mas NÃO espelhe o .gitignore depois: assets/ é ignorado no git e obrigatório no deploy
metadata:
  type: feedback
---

Em projeto Vercel estático (deploy manual via `vercel deploy --prod`), **tudo o que está no diretório sobe** — incluindo `.claude/agent-memory/`. Sempre confira se existe `.vercelignore` antes do primeiro deploy de um diretório de landing page.

**Why:** em 2026-08-26, `landing-pages/trifold-design-system/` não tinha `.vercelignore` e `https://trifold.eng.br/.claude/agent-memory/aios-devops/MEMORY.md` retornava **200** em produção — memórias de agente (incluindo notas de infra) publicamente legíveis. Corrigido no mesmo deploy que publicou os CTAs do Vind (`dpl_6hut13kS8eYJFHM5hu6CGYhi7re8`).

**How to apply:**
- Ao **criar** um `.vercelignore` onde não havia: o Vercel usava o `.gitignore` como fallback, e esse fallback **deixa de valer**. Migre as regras que o `.gitignore` tinha **naquele momento** (aqui era só `.vercel`) — senão você silenciosamente passa a subir o que antes era ignorado.
- **A partir daí os dois arquivos divergem de propósito — nunca sincronize um com o outro.** Em landing page estática o `.gitignore` filtra por *auditabilidade* (fora: binário pesado gerado) e o `.vercelignore` filtra por *o que o site precisa em runtime*. `assets/`, `uploads/`, `preview/`, `brand_imgs/` estão no `.gitignore` do `trifold-design-system` e **não podem** entrar no `.vercelignore`: são 77 MB de imagens/fontes que o site serve — copiar essas linhas derruba o visual inteiro em produção. Há aviso no topo de ambos os arquivos; leia antes de editar.
- Prova definitiva do que subiu (melhor que curl, que pode dar 404 por roteamento e não por ausência):
  `GET https://api.vercel.com/v7/deployments/{dpl_id}/files?teamId={team}&base=/src` — lista o diretório de fonte real do deployment. Sem `base`, retorna só `/src` e `/out`.
- Só o 404 no **alias** (`trifold.eng.br`) é sinal válido; a URL crua do deployment responde **302** (deployment protection), o que não diz nada sobre o arquivo.
- Regra `.claude` (sem barra) já cobre o diretório inteiro — sintaxe é a do `.gitignore`.
- **Versione o `.vercelignore` no git**, mesmo em diretório cujo conteúdo fica fora do controle de versão. O deploy é manual e a pasta pode ser reconstruída em outra máquina a partir do deployment de produção — sem o arquivo no repo, a exposição volta. Feito em PR #505 (branch `fix/design-system-vercelignore-claude-exposure`); `landing-pages/vind-residence` já seguia esse padrão.

- **Desconfie da justificativa escrita no README antes de herdá-la.** O README do `trifold-design-system` dizia que `.dc.html`/`support.js` ficavam fora do git por serem "grandes (~100+ MB)" — e por isso o PR #471 foi fechado. Ao medir: os 77 MB eram só `assets/` + `uploads/`; o HTML+JS somava **253 KB**. Resultado do argumento não verificado: ficamos sem histórico de pixel Meta/GA, CSP inline e da function do form de contato. Corrigido no 2º commit do PR #505 — `du -sh *` custa 2 segundos e vale mais que a prosa do README.

Ver [[vercel-landing-pages-projects]], [[vercel-static-deploy-concurrency]], [[headless-render-validation]].
