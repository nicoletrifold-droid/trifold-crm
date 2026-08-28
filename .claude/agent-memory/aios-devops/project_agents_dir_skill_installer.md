---
name: agents-dir-skill-installer
description: Untracked .agents/skills/* + symlink em .claude/skills/ + skills-lock.json na raiz sao artefato de um instalador de skills de terceiros, nao lixo nem trabalho da branch atual
metadata:
  type: project
---

O trio `.agents/skills/<nome>/`, `skills-lock.json` (raiz) e um **symlink** `.claude/skills/<nome> -> ../../.agents/skills/<nome>` e a assinatura de um instalador de skills de terceiros (marketplace/GitHub). Primeiro caso visto: `copywriting` de `coreyhaines31/marketingskills`, instalado em 2026-08-21, com `computedHash` no lock.

Isso **nao** e a convencao do repo: as 66 entradas ja versionadas em `.claude/skills/` sao diretorios reais, commitados direto, sem lockfile e sem `.agents/`.

**Why:** aparece como untracked no `git status` de qualquer branch e da a impressao de ser sujeira de sessao. Nao e — tem conteudo legitimo e um lockfile com hash. Mas adotar `.agents/` + symlink versionado no git e uma decisao estrutural (symlink em git e fragil entre plataformas, e um `.agents/` na raiz precisa de decisao de `.vercelignore` como em [[feedback_vercelignore_static_projects_exposure]]), nao um detalhe de housekeeping.

**How to apply:** nao varrer para dentro de uma branch de escopo alheio so porque estava no working tree. Deixar untracked e reportar; a adocao (ou o descarte) do padrao e decisao do Lucas / da sessao que instalou. Se um dia for versionado, versionar `.agents/` + `skills-lock.json` + symlink **juntos** — commitar so o symlink deixa a skill quebrada. Ver [[feedback_agent_memory_only_at_repo_root]] para o risco analogo de diretorio de agente fora do git.
