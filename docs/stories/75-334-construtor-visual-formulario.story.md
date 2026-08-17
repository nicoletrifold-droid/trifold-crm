# Story 75-334 — Construtor visual de perguntas (sai o JSON)

**Status:** Ready
**Tipo:** Correção de usabilidade (troca a tela de edição, não o modelo de dados)
**Epic:** 89 — Formulário de qualificação para tráfego pago
**Story ID:** 75-334
**Complexidade:** M (~5 pts — 1 tela, 2 funções puras, 0 migrations, 0 mudança de API)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Migrations:** **nenhuma**.

## O pedido (Marcos, 17/08, olhando a tela em produção)

> *"É para ser assim mesmo preenchido? Eu queria algo assim [YayForms], copia mesmo."*

Ele abriu a aba nova, viu `{"perguntas": []}` num textarea e recusou — com razão.

## O erro que esta story conserta é meu, e é de julgamento

A 75-330 registrou "editor visual arrastando campos" como **fora de escopo**, com a
justificativa de que o que importava era *"dar para mudar as perguntas sem deploy"*. A frase é
verdadeira e a conclusão é errada: **editar JSON à mão não é editar formulário, é programar.**

Quem mexe nas perguntas de uma campanha é quem toca a campanha. Pedir a essa pessoa que acerte
vírgula, aspas e o nome exato de `campo_contato` não é uma limitação aceitável de v1 — é
entregar a funcionalidade fechada com a chave por dentro. O `problemasParaPublicar` que o @qa
adicionou na 75-330 (barrar formulário sem campo de contato) é sintoma disso: existia porque a
tela permitia montar um formulário quebrado.

## O que NÃO muda (e por isso a story é M, não L)

O `schema` jsonb continua sendo o armazenamento, com o mesmo formato. `parseFormSchema`,
`branching`, `score`, o runner público, a API — **nada disso muda**. Troca-se apenas quem
escreve o JSON: em vez do dedo do usuário, a tela.

Consequência prática: qualquer formulário criado antes desta story continua funcionando, e o
JSON segue disponível como saída de emergência (§AC7).

## Escopo

### IN

1. Construtor visual: adicionar, editar, reordenar e remover perguntas sem ver JSON.
2. Por pergunta: título, tipo, ajuda, obrigatória, campo de contato.
3. Para escolha/múltipla: opções com rótulo e peso.
4. Condição de exibição em linguagem de gente ("só mostrar se …").
5. Configuração da agenda (ligada/desligada, decorado) e mensagem final.
6. Avisos do que impede publicar, na hora — não no envio do lead.

### OUT

- Arrastar-e-soltar com mouse (mover para cima/baixo resolve e é acessível por teclado)
- Pré-visualização do formulário renderizado (vale story própria; o link público já serve de preview)
- Lógica de salto ("pular para a pergunta X") — a ramificação atual é por condição, e mudá-la mexeria no motor

## Acceptance Criteria

1. **AC1 — Dá para montar um formulário completo sem ver uma chave `{`.** Adicionar pergunta,
   escolher tipo, marcar obrigatória, definir opções e salvar — tudo em campos de formulário.

2. **AC2 — Contato é escolha guiada, não string.** `campo_contato` vira um seletor
   ("Nome / E-mail / Telefone / — nenhum"). Digitar `cpf` e descobrir no envio que não existe
   era o modo de falha antigo.

3. **AC3 — Condição em português.** "Só mostrar esta pergunta se **[pergunta]** for
   **[opções]**", com as perguntas oferecidas limitadas às **anteriores** e os valores às
   opções reais daquela pergunta. O `parseFormSchema` já recusa condição para frente — a tela
   passa a tornar o erro **impossível**, em vez de detectá-lo.

4. **AC4 — Reordenar sem quebrar condição.** Mover uma pergunta para cima de outra que ela
   referencia **não pode** gerar schema inválido: ou a UI impede o movimento, ou remove a
   condição órfã avisando. Salvar um formulário que o próprio parse recusa é o pior resultado.

5. **AC5 — O que impede publicar aparece ANTES de salvar.** Sem pergunta de nome e telefone, a
   tela avisa na hora (reusando `problemasParaPublicar`), em vez de o lead descobrir no envio.

6. **AC6 — Peso explicado onde ele é usado.** O campo de peso diz para que serve (score
   0–100, hoje sem efeito) — senão vira número mágico que ninguém sabe preencher.

7. **AC7 — O JSON continua acessível, recolhido.** Um "ver JSON" mostra o schema atual, para
   suporte e para depurar formulário antigo. Ele **não** é mais o caminho principal.

8. **AC8 — Nenhum formulário existente quebra.** O que foi criado pela tela antiga abre no
   construtor com todas as perguntas. Formato de armazenamento inalterado.

## Notas técnicas

- **A decisão vai para função pura**, como nas stories anteriores: mover pergunta preservando
  (ou limpando) condições, e converter o estado do construtor em `FormSchema`. O projeto não
  tem jsdom — o que decide não pode morar no componente.
- **Reusar `TIPOS_PERGUNTA` e `CAMPOS_CONTATO`** de `lib/forms/schema.ts`, importando. Um
  seletor com a lista reproduzida à mão diverge no primeiro tipo novo.
- **Salvar continua passando pelo `PATCH /api/lead-forms`**, que já valida com
  `parseFormSchema` + `problemasParaPublicar`. A tela reduz o erro; o servidor continua sendo
  quem garante.

## Definition of Done

- [ ] Montar um formulário do zero, publicar e preencher pelo link — sem abrir o JSON
- [ ] Teste da reordenação com condição (AC4)
- [ ] Formulário criado antes da story abre no construtor sem perder pergunta
- [ ] `tsc` 0 · `eslint` sem warning nova · `build` · `vitest` sem regressão
- [ ] @qa PASS antes do push

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 17/08/2026 | @sm (River) | Story criada após o Marcos ver a tela em produção. O "editor visual fora de escopo" da 75-330 foi erro de julgamento meu: editar JSON à mão não é editar formulário |
