# QA Gate — Story 75-330 (*motor do formulário público de qualificação*)

**Revisor:** @qa (Quinn) · **Data:** 2026-08-17 · **Story:** `docs/stories/75-330-formulario-qualificacao-motor.story.md`
**Base:** branch `story/75-330-formulario-qualificacao-publico`, commit revisado `9bfb5b91`
**Parecer @po:** `docs/qa/po-validation-75-330.md` (GO 8/10)

---

## VEREDITO: 🟡 **CONCERNS** — aprovado com 3 defeitos **corrigidos durante o gate**

O gate abriu em **FAIL**: encontrei um defeito que impedia qualquer pessoa de terminar o
formulário. Os três achados foram corrigidos e cobertos por teste de regressão; o gate fecha
em CONCERNS por causa das ressalvas da §5, que não são código e não bloqueiam merge.

---

## 1. 🔴 BLOQUEANTE (corrigido) — pergunta opcional em branco TRAVAVA o formulário

**O defeito.** Ao clicar "Continuar" numa pergunta **opcional** sem preencher nada, o
formulário devolvia **a mesma pergunta, para sempre**. Não havia mensagem de erro, botão
morto nem tela de falha — a pergunta simplesmente não passava. O usuário ficava presoedge e
abandonava.

**Por que passou pelo @dev.** Cada peça isolada estava certa. O `responder()` deixa a
opcional passar em branco (correto). O `limparRespostas` preserva a chave (correto). Mas o
`proximaPergunta` decidia "respondida" por *conteúdo não-vazio*, então uma chave presente e
vazia continuava contando como pendente. O defeito só existia na **junção** das três — que é
exatamente o que teste de unidade por função não pega e teste de fluxo pega.

**Prova, antes do fix** (executada, não deduzida):

```
respostas = { nome: "Ana" }            → proximaPergunta = "obs"     ✓ esperado
respostas = { nome: "Ana", obs: "" }   → proximaPergunta = "obs"     ✗ deveria ser "fim"
```

**Impacto real.** Formulário de tráfego pago. Todo lead que pulasse um campo opcional ficava
sem terminar — e como o lead só nasce com nome + telefone, boa parte nem viraria lead. A
campanha rodaria pagando por clique e coletando quase nada, sem nenhum erro em log: para o
sistema, "usuário não terminou" é indistinguível de desistência.

**Correção.** `proximaPergunta` passou a separar os dois casos: chave ausente = nunca vista
(pergunta); chave presente e vazia = **pulada de propósito** — segue se for opcional, continua
pendente se for obrigatória. Regressão fixada em `branching.test.ts`, incluindo múltipla
opcional sem nada marcado.

## 2. 🔴 ALTO (corrigido) — formulário sem campo de contato falhava só NO ENVIO

Nada impedia salvar um formulário sem nenhuma pergunta marcada com
`campo_contato: "nome"` / `"telefone"`. O formulário rodava inteiro, bonito, e estourava
**no envio**, na cara do lead: *"Informe nome e telefone válidos"* — sobre campos que o
formulário nunca pediu. Sem saída possível para quem preencheu.

De novo o mesmo padrão de falha: campanha no ar, dinheiro saindo, zero lead entrando, e o
defeito visível apenas para quem clicou no anúncio — nunca para quem publicou.

**Correção.** `problemasParaPublicar()` (função pura, testada) barra na **gravação**, com
mensagem para o admin. Formulário vazio continua passando de propósito: é o rascunho
recém-criado, e a página pública já recusa servir formulário sem perguntas.

## 3. 🟡 MÉDIO (corrigido) — vazamento de memória no rate limit

O padrão foi reusado do `agent/chat/route.ts` conforme o @po mandou, mas com uma diferença
que muda o comportamento: lá a chave é **usuário** (limitada pelo tamanho do time), aqui é
**IP de tráfego pago**. Sem poda, o `Map` cresce sem teto enquanto a lambda viver.

Reusar o padrão estava certo; reusar sem notar a troca de chave, não. Adicionada a poda dos
IPs com janela expirada.

## 4. Os 7 checks

| # | Check | Resultado |
|---|-------|-----------|
| 1 | Code review | ✅ após as 3 correções. Decisão em funções puras, tela sem regra — consistente com o projeto não ter jsdom |
| 2 | Testes | ✅ **2485 passed** (195 arquivos), +5 casos de regressão vindos deste gate |
| 3 | Critérios de aceite | ⚠️ AC1/AC10 **não verificáveis aqui** — dependem de deploy e das migrations (§5) |
| 4 | Sem regressão | ✅ baseline intacta; nenhuma suíte existente alterada |
| 5 | Performance | ✅ após §3. Índices coerentes com as queries (`lead_id` parcial, `org_id+form_id`) |
| 6 | Segurança | ✅ RLS sem policies + service-role atrás de gate; token inválido com resposta única; `org_id` explícito em todo WHERE; LGPD com CHECK no banco, não só na aplicação |
| 7 | Documentação | ✅ story com decisões D-A/D-B e desvios justificados |

**Gates:** `type-check` 8/8 · `lint` exit 0, 25 warnings (baseline, nenhuma nova) ·
`build` 5/5 · `test` 2485 passed.

> Nota: o `build` falhou uma vez com `Failed to fetch Geist Mono from Google Fonts` — rede,
> não código. Repetido: 5/5.

## 5. Ressalvas que o merge NÃO resolve

1. ⛔ **As migrations 231 e 232 não foram aplicadas em lugar nenhum.** Enquanto não forem, o
   código em produção **quebra**: `22P02` no INSERT do lead e tabelas inexistentes. A 231
   precisa entrar **antes** do deploy do código, como manda o cabeçalho da 227.
2. ⛔ **AC1 (`curl` anônimo) e AC10 (RLS em transação revertida) seguem por verificar** — são
   pós-deploy por natureza. Não os marquei como cumpridos.
3. 🟡 **A retomada de quem abandona não existe** (decisão D-B, consciente). Até ela chegar, a
   Nicole pode repetir perguntas já respondidas. Mitigado só do lado humano: o corretor vê as
   respostas parciais com o selo "Não terminou".
4. 🟡 **Não houve teste de fluxo ponta a ponta com banco real.** Os dois defeitos bloqueantes
   deste gate eram de *junção* entre peças corretas — o tipo exato de coisa que só um teste de
   fluxo pega. Recomendação para a 75-331: um teste de integração do POST, com fake do
   Supabase, antes de somar a agenda por cima.

**Decisão:** liberado para o @devops, **condicionado à ordem**: migration 231 → migration 232
→ deploy do código. Fora dessa ordem, quebra.

— Quinn, @qa
