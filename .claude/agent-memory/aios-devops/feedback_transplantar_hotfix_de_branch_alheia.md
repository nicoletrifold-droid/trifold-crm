---
name: transplantar-hotfix-de-branch-alheia
description: Hotfix sem commit por cima de uma feature branch alheia — transplantar por patch 3-way, nunca por stash pop, quando a branch de origem tem commits nos mesmos arquivos
metadata:
  type: feedback
---

Quando trabalho uncommitted precisa sair de uma feature branch alheia para uma branch própria a
partir de `origin/main`: **salvar `git diff HEAD` como patch, `git stash push` só os arquivos
rastreados, criar a branch de `origin/main`, e reaplicar com `git apply --3way`** — resolvendo à
mão os conflitos que sobrarem. Nunca `git stash pop` às cegas, e nunca copiar o conteúdo do working
tree inteiro.

**Why:** o working tree de uma feature branch é `origin/main` + commits daquela branch + o meu
delta. Copiar o arquivo inteiro arrasta os commits da outra branch para dentro do meu PR. Foi
exatamente o risco na 900-14b (2026-08-24): o hotfix P0 estava sem commit por cima de
`fix/75-367-…` (PR #492), e três `MEMORY.md` de agente tinham linhas *daquela* branch misturadas às
minhas. `git apply --3way` acerta a maioria porque reconstrói o preimage do blob; onde a linha
alheia é vizinha da minha, ele conflita — e conflitar é o comportamento **desejado**, porque
sinaliza exatamente onde eu preciso escolher.

**How to apply:**
1. `git diff HEAD -- <arquivos> > patch` (é o delta exato, e serve de backup).
2. Arquivos **untracked** não precisam de nada: `git checkout -b` não os toca, sobrevivem à troca
   de branch.
3. `git stash push -- <arquivos rastreados>`, deixando os untracked no lugar.
4. `git checkout -b nova origin/main` → **`git branch --unset-upstream` imediatamente**, senão a
   nova branch rastreia `origin/main` e um `git push` sem argumentos vai para a `main`.
5. `git apply --3way patch`, resolver conflitos mantendo **só** as minhas linhas.
6. Provar antes de commitar: `git log --oneline origin/main..HEAD` = vazio, e
   `git diff --stat origin/main..HEAD` **igual, número por número**, ao `git diff --stat` original
   (na 900-14b: 131 inserções / 6 remoções nos dois).
7. Diferenças de suíte de teste depois da separação não são regressão até prova em contrário —
   confira se o arquivo faltante veio da outra branch (`git cat-file -e origin/main:<path>`). Na
   900-14b, 245/2982 → 244/2975 era 1 arquivo / 7 casos de teste que só existem no PR #492.

O stash fica como rede; **não faço `stash drop` sozinho** — se popado por engano na branch antiga,
reinjeta o hotfix no PR alheio, então vale avisar o usuário que ele existe.

Relacionado: [[force-push-vs-merge-main]], [[no-add-all-secret-leak]],
[[incidente-deploy-900-14b]].
