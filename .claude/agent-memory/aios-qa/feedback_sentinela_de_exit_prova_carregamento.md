---
name: sentinela-de-exit-prova-carregamento-de-env
description: Como provar que um script carregou um arquivo de env sem copiar nem instrumentar o arquivo real — sentinela em process.on('exit') via NODE_OPTIONS, com controle negativo que preserva __dirname
metadata:
  type: feedback
---

Quando o efeito a provar é "este script leu ESTE arquivo" e o script sai por `process.exit(1)`
antes de imprimir qualquer coisa útil:

```bash
# sentinel.mjs (fora do repo):  process.on('exit', () => console.log('SET=' + Boolean(process.env.X)))
NODE_OPTIONS="--import file:///…/sentinel.mjs" npx tsx scripts/o-script-real.ts
```

O handler de `exit` **dispara mesmo com `process.exit()`**, e a medição é feita contra o **arquivo
real**, não contra uma cópia nem uma sonda redigitada — que é o furo das sondas "montadas byte a
byte": elas provam a sonda, não o script.

**Controle negativo que vale:** `git show origin/main:scripts/X.ts > scripts/__baseline.ts` —
gravado **no mesmo diretório**, porque `resolve(__dirname, "../...")` muda de significado se o
arquivo mudar de pasta. Rodar de `/tmp` daria um falso vermelho. Remover depois e provar com
`git status --porcelain -uall -- <dir>` vazio.

**Why:** duas armadilhas medidas na Story 900-69. (1) O `tsx` gera **processos filhos**: a sentinela
imprime 3 linhas por execução e só a do processo que rodou o script vale — quem lê a última conclui
`false` e erra o veredito. (2) `EXIT=0` de linter/script não prova alcance: `eslint arquivo` sai 0
tanto para "limpo" quanto para "ignorado". Confirme com `-f json` (o `filePath` tem que aparecer) e
com uma sonda de erro real no mesmo diretório.

**How to apply:** em qualquer gate cuja prova seja "carregou o arquivo certo" / "leu a variável".
Complemento barato e às vezes suficiente: se a função carregadora for **byte-idêntica** entre dois
scripts do mesmo diretório (`sha256` do corpo + da linha de chamada), a medição de um transfere para
o outro sem hipótese nova. Relacionado: [[mutacao-prova-teste-real]],
[[layout-de-env-deste-checkout]], [[scripts-da-raiz-sem-gate-estatico]].
