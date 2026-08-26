---
name: agent-memory-only-at-repo-root
description: Nunca criar .claude/agent-memory/ dentro de subprojeto — em pasta de deploy estático ele fica simultaneamente publicado na web E fora do git; o único lugar válido é .claude/agent-memory/<agente>/ na raiz
metadata:
  type: feedback
---

Memória de agente vive **exclusivamente** em `.claude/agent-memory/<agente>/` na raiz do repo. Nunca criar um segundo `.claude/` dentro de subprojeto (`landing-pages/*`, `packages/*`).

**Why:** em `landing-pages/trifold-design-system/` existia um `.claude/agent-memory/aios-devops/` com 10 memórias (~44KB) sobre CSP, cache de edge, View Transitions e validação headless. Aquela pasta é raiz de deploy estático da Vercel, então o diretório caiu numa armadilha de dois lados: (1) sem `.vercelignore`, ele **subia pra web** — `https://trifold.eng.br/.claude/agent-memory/aios-devops/MEMORY.md` respondia 200 em produção (bug do PR #505); (2) o fix natural — `.claude` no `.gitignore`/`.vercelignore` local — deixou o conteúdo **fora do git**, existindo só naquele laptop. Ou seja: publicado onde não devia e versionado em lugar nenhum. Migrado pra raiz em 2026-08-26 (PR #505) e o dir local apagado.

**How to apply:**
- Ao escrever memória sobre um subprojeto, o caminho é sempre a raiz. O nome do arquivo carrega o escopo (`project_vercel_static_deploy_cdn_stale.md`), não o diretório.
- Se encontrar um `.claude/` em subpasta: leia tudo antes de apagar, migre por conteúdo (não por `cp` — pode haver memória obsoleta) e **reverifique cada afirmação contra o código atual**. Nesta migração, 1 das 10 estava obsoleta (o "502 do form é esperado, Resend em sandbox" — o domínio já tinha sido verificado) e 2 duplicavam memórias que já existiam na raiz com outro nome, então foram absorvidas em vez de copiadas.
- Manter as regras `.claude` no `.gitignore` e no `.vercelignore` da pasta como defesa em profundidade, mesmo depois de remover o diretório: a pasta é reconstruída à mão em deploy manual e o erro voltaria calado.

Ver [[vercelignore-static-projects-exposure]] (o incidente de exposição) e [[vercel-landing-pages-projects]] (por que essas pastas ficam fora do git).
