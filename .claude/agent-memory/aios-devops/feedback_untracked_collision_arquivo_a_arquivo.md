---
name: untracked-collision-arquivo-a-arquivo
description: Quando o merge aborta com "untracked working tree file would be overwritten", resolva arquivo por arquivo com backup+sha256 — nunca com clean/checkout -f/stash -u
metadata:
  type: feedback
---

Quando `git merge`/`pull` aborta com **"untracked working tree file would be overwritten by merge"**,
resolva **o arquivo específico**, com backup e conferência de hash. **Nunca** com `git clean`,
`git checkout -f` ou `git stash -u`.

**Why:** em `trifold-crm` o diretório `landing-pages/trifold-design-system/` é untracked de propósito
e guarda ~77MB / 211 arquivos de assets reais (`uploads/`, `brand_imgs/`, `assets/`, `.dc.html`) que
**não existem em lugar nenhum além do disco local** — o site é publicado por upload direto na Vercel,
sem git (ver [[vercel-landing-pages-projects]]). Só 2 arquivos ali são tracked (`vercel.json` e
`README.md`, desde o PR #501). Qualquer comando que atue no diretório inteiro destrói os outros 209.
`git stash -u` é traiçoeiro porque parece cirúrgico mas **remove untracked da working tree**.

**How to apply (receita validada em 2026-08-25, PR #502):**
1. Descobrir o conjunto exato de colisões: `git ls-tree -r --name-only origin/main -- <dir>/`
   comparado com o que existe no disco. No caso real era **1 arquivo só** (`vercel.json`); o
   `README.md` nem existia localmente, então não colidia.
2. `find <dir> -type f | wc -l` e `du -sh <dir>` **antes** — é a linha de base que prova, depois, que
   nada sumiu.
3. `cp -p` do arquivo colidente para o scratchpad + `shasum -a 256` dos dois; `rm` **só** dele.
   Reconferir o `find | wc -l` (tem que cair exatamente 1).
4. Merge. O git traz o arquivo como **tracked**.
5. `diff` backup × arquivo restaurado + `shasum -a 256` dos dois. Só depois de idênticos, apagar o
   backup. Se divergirem, o backup é a versão a preservar — aí sim é decisão de conteúdo.
6. Reconferir `find | wc -l` + `du -sh` no fim (esperado: base + os arquivos que o merge trouxe).

**Corolário — modificações tracked fora do escopo do PR** (ex.: `.claude/agent-memory/*`) também
travam o merge. Aí `git stash push -- <paths>` **com paths explícitos e sem `-u`** é seguro: mexe só
no que foi listado e não toca untracked. Ao dar `pop`, os índices `MEMORY.md` conflitam quase sempre —
são listas append-only, resolva por **união dos dois lados**, nunca escolhendo um
([[merge-main-na-branch-nao-rebase]]).

Relacionado: [[main-divergence-2026-06-08]], [[no-add-all-secret-leak]].
