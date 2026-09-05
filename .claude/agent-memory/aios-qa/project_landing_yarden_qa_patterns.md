---
name: landing-yarden-qa-patterns
description: Como auditar as landings estáticas (yarden/vind-residence) sem aceitar relato — hash de blocos, extrator próprio de assets, contraprova visual e o teto de luminância da banda CTA
metadata:
  type: project
---

Auditoria da landing estática de `landing-pages/{yarden,vind-residence}/` tem 5 medições
que **só valem se o QA refizer**, porque o @dev costuma relatar o número certo pelo método
errado (ou pelo método certo, mas sem deixar como provar).

**Why:** Story 86-13 (gate PASS, 2026-09-04). O @dev alegou "diff byte a byte" do tracking,
"luminância 107" da foto da banda e "2 bugs corrigidos". As três alegações eram verdadeiras —
mas nenhuma delas era verificável pelo relato, e a diferença entre "editado" e "corrigido"
só apareceu na contraprova.

**How to apply:**

1. **Testes intocados prova-se por blob, não por `git diff`.**
   `git rev-parse 06e9ecfa:arquivo` vs `git rev-parse HEAD:arquivo`. Um diff vazio pode ser
   um arquivo recriado idêntico; blob igual é identidade. Ver [[feedback_reverificacao_focada]].

2. **Tracking intacto prova-se por sha256 dos BLOCOS, não do arquivo.**
   Extrair `<script>`, `<noscript>` e `<form>` com regex non-greedy dos dois commits e
   hashear cada um. Se o @dev citar bytes 17 a menos que os seus, ele mediu o conteúdo
   interno e você mediu com as tags (`<script>`+`</script>` = 17) — convergem.

3. **Integridade de assets: escreva o SEU extrator, mais amplo que o do teste.**
   O de `tracking-browser.test.ts` lê só `(src|srcset|href|content)`. Acrescente `poster`
   e `data-src`, e cruze separadamente os `url()` do `<style>`. A armadilha real da AC15 é
   `background-image` no CSS: invisível para o extrator, o arquivo vira órfão. A saída
   legítima é o CSS apontar para um arquivo que **outro** ponto do HTML já referencia por
   atributo (a `.banda` do Yarden aponta para `galeria-05.jpg`, que a Galeria serve).

4. **"Bug corrigido" prova-se revertendo o fix e vendo o bug voltar.**
   `perl -pi -e` remove a regra, Playwright mede, restaura do backup. Dois exemplos que
   valeram: sem `.g-wide{grid-column:span 1}` no breakpoint tablet o grid de 2 colunas
   abre 2 células vazias (detectar varrendo o centro de cada célula do grid e checando se
   alguma figura o cobre); sem `max-width:62ch` o `<p>` do "Sobre" vai a 739px e colide com
   o `.wa-float` fixo em `right:22px`. Medir por interseção de `getBoundingClientRect`,
   nunca a olho.

5. **Contraste da banda CTA: medir o PIOR pixel, não a média.**
   PIL + luminância relativa WCAG. A média enganaria numa foto noturna com parede clara.
   Componha o overlay (`rgba(0,0,0,α)`) sobre o pixel mais claro da imagem e exija ≥4.5:1.
   No Yarden deu 5.53:1 no pior caso — passa, mas a margem é essa.

**Armadilha que me pegou:** testar foco visível com `element.focus()` programático dá
`outline-style: none` porque o Chromium não ativa `:focus-visible` sem interação de teclado.
Use `page.keyboard.press('Tab')` de verdade, ou você abre um falso positivo de acessibilidade.

**Ruído fixo desta worktree:** `node_modules` é symlink para o da raiz, instalado para um
`main` que está ~18 commits à frente da branch. Resultado: 71 falhas de vitest e 12 erros de
`turbo type-check` em `packages/web` que **não são da story**. Prova em uma linha:
`git log $(git merge-base origin/main HEAD)..HEAD -- packages/` vazio. Rodar baseline em
worktree efêmera do commit-base **não funciona** (sem `.pnpm` local dá 121 arquivos falhos —
baseline pior que o ruído que se quer medir). Ver [[project_epic_86_qa_patterns]].
