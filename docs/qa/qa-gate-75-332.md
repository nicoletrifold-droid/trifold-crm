# QA Gate — Story 75-332 (*IA lê as respostas abertas do formulário*)

**Revisor:** @qa (Quinn) · **Data:** 2026-08-17 · **Story:** `docs/stories/75-332-formulario-leitura-ia.story.md`
**Base:** branch `story/75-332-formulario-leitura-ia`, empilhada sobre a 75-331 → 75-330
**Validação @po:** no corpo da story (GO 9/10)

---

## VEREDITO: 🟡 **CONCERNS** — 1 defeito corrigido no gate, 1 limitação aceita

O defeito que este gate encontrou é o mesmo padrão do `22P02` da 75-330: **um bug que o
projeto já consertou uma vez, sendo reintroduzido por uma porta nova** — e a story, escrita
por mim como @sm, é que mandava fazer errado.

---

## 1. 🔴 O achado — `void` fire-and-forget mata a leitura em produção

**A AC3 dizia:** *"Dispara em segundo plano (fire-and-forget), como o `notify*` do
`/api/agendar/[token]`."* Implementei exatamente isso: `void analisarRespostasAbertas(...)`.

**Está errado, e o próprio repositório documenta por quê.** De
`app/login/actions.ts:188-192`:

> *"`after()` (Next 16, estável desde v15.1) agenda o envio para DEPOIS que a resposta é
> enviada ao cliente, mas o runtime AGUARDA sua conclusão antes de congelar a invocação
> serverless (usa `waitUntil` por baixo na Vercel). Isso corrige o bug do fire-and-forget
> solto (`void sendEmail`), em que a função era encerrada antes do round-trip ao Resend
> completar e **o e-mail nunca era enviado** (Story 75-139)."*

Na Vercel a invocação congela assim que a resposta sai. Trabalho pendente morre no meio, sem
erro e sem log.

**Por que aqui é pior do que no `/api/agendar`.** Aquele precedente dispara notificações
curtas; esta chamada tem **timeout de 15 segundos** contra um modelo. A janela entre "resposta
enviada" e "trabalho concluído" é uma ordem de grandeza maior — não é um risco teórico, é a
leitura simplesmente não acontecendo na maioria das vezes. E o modo de falha é invisível: o
lead vê sucesso, o formulário grava, e a ficha do corretor fica sem resumo para sempre.

**Correção aplicada:** `after()` de `next/server`, com o porquê no código para ninguém
"simplificar" de volta para `void`.

**Consequência para a story:** a AC3 aponta para o padrão errado. Corrigida no corpo — o
`notify*` do `/api/agendar` deixa de ser o modelo a seguir.

## 2. 🟡 Limitação aceita — sem saída estruturada

Escrevi o flow com `output_config.format` (o formato garantido pela API, que o Haiku 4.5
suporta) e o `tsc` reprovou: o SDK fixado é **`@anthropic-ai/sdk@0.52.0`**, que antecede o
recurso e não tipa o campo.

**Não subi o SDK dentro desta story.** Ele é dependência de todos os flows de IA — a Nicole
inclusive — e um upgrade desses tem raio de impacto próprio.

O que ficou no lugar: formato pedido no prompt, e a garantia real em `validarLeitura`, que
trata como falha tudo que não for exatamente o esperado. Registrado em comentário no código e
aqui. **Subir o SDK é story própria**, e vale: eliminaria a classe inteira de "o modelo
respondeu em outro formato".

## 3. Os 7 checks

| # | Check | Resultado |
|---|-------|-----------|
| 1 | Code review | ✅ após §1. A decisão (o que mandar, o que aceitar, quando pular) está em função pura; a rota só orquestra |
| 2 | Testes | ✅ **2524 passed** (201 arquivos), +19 nesta story |
| 3 | Critérios de aceite | ✅ AC1–AC8 cobertos; AC3 corrigida no gate |
| 4 | Sem regressão | ✅ a extração da régua do calor é mecânica, e o teste da AC5 amarra os dois caminhos |
| 5 | Performance | ✅ `after()` não soma latência à resposta do lead; AC8 evita chamada inútil |
| 6 | Segurança | ✅ prompt manda não deduzir o que não foi escrito; `qualificacao_comercial` intocada; resumo é para o corretor, nunca devolvido ao lead |
| 7 | Documentação | ✅ o "porquê" do `after()` e do SDK travado está no código, não só aqui |

**Gates:** `type-check` 8/8 · `lint` exit 0, 25 warnings (baseline) · `build` 5/5 ·
`test` 2524 passed.

## 4. O que gostei de ver

**O teste da AC4 usa o guard REAL, não um dublê.** `stripManualInterestLevel` entra pelo
`importActual`; só a chamada ao modelo é mockada. Um teste que stubasse o guard passaria mesmo
com o guard removido — ou seja, provaria nada. Como está, se alguém tirar a proteção, o teste
quebra.

**Calor inválido não descarta o resumo.** O modelo devolvendo "quentíssimo" cai na régua do
score e o resumo sobrevive. Trocar o que o corretor mais usa pelo que ele menos usa, por causa
de uma palavra, seria o pior negócio possível.

## 5. Ressalvas que o merge NÃO resolve

1. ⛔ **Empilhamento triplo.** Ordem obrigatória: **#437 (330) → #438 (331) → esta**. Fora
   dela, quebra — os arquivos de `lib/forms/` não existiriam.
2. ⛔ **Nada exercitado contra o modelo real.** Todos os testes mockam a chamada. A qualidade
   do resumo — se é útil para o corretor, se respeita o "não invente" — só se sabe com um lead
   de verdade. É o item nº 1 da DoD e continua aberto.
3. 🟡 **O prompt é a única barreira contra invenção.** O guardrail de "não deduza" está no
   texto do sistema, e este projeto já viu a IA inventar a fachada de um prédio. Vale conferir
   os primeiros resumos reais com olho crítico antes de confiar.

**Decisão:** liberado para o @devops, atrás da 331.

— Quinn, @qa
