---
name: landing-pages-deploy-asymmetry
description: landing-pages/vind-residence é versionado no git e vai por PR; landing-pages/trifold-design-system é untracked e só existe no deploy — não tratar os dois como iguais
metadata:
  type: project
---

Os dois diretórios sob `landing-pages/` **não** seguem a mesma convenção, apesar de
parecerem simétricos:

| Diretório | Versionado? | Código entra por | Site sobe por |
|---|---|---|---|
| `landing-pages/vind-residence/` | SIM (~61 arquivos) | commit + PR (#478, #483, #494) | `vercel deploy --prod` manual |
| `landing-pages/trifold-design-system/` | NÃO (0 arquivos tracked) | não entra — vive só no disco | `vercel deploy --prod` manual |

Nenhum dos dois tem CI git-linked: a publicação é sempre `vercel deploy --prod --yes
--scope trifold-s-projects` rodado de dentro do diretório (cada um com seu
`.vercel/project.json`).

**Why:** A v0.2 da Story 86-11 afirmava que **ambos** eram untracked e ficavam fora de
PR/CI. Metade errado. Isso confunde @devops na hora do push (a parte de `vind-residence`
entra no PR normal; a de `trifold-design-system` não entra em PR nenhum) e cria um ponto
cego real de auditoria: mudanças de CSP no `trifold-design-system/vercel.json` não deixam
diff versionado.

**How to apply:** Em qualquer story que toque `landing-pages/*`, exigir que a seção de
deploy separe "como o código entra" de "como o site sobe", e que mudanças no
`trifold-design-system` sejam transcritas no Dev Agent Record / comentário do PR — já que
não haverá histórico git para consultar depois. Verificar com `git ls-files landing-pages/<dir>/`
antes de aceitar qualquer afirmação sobre versionamento.
