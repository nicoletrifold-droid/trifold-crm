# Story 87-2 — Os campos do painel que não fazem nada passam a valer (são 5, não 3)

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** Draft
**Origem:** extraída da Story **87-0** (era a AC8) no corte aprovado pelo Gabriel em 05/08/2026
**Criada por:** @sm (River) em 2026-08-05
**Executores:** @dev · produto (Gabriel) aprova os textos que passarem a valer
**Depende de:** 87-0 (Tarefa 2 — a sessão de reconciliação decide os textos promovidos)
**Não bloqueia a Onda 1** — é comportamento novo, não paridade.

---

## Story

**Como** admin que edita a configuração da Nicole no painel,
**Quero** que **todo** campo editável tenha efeito no runtime,
**Para que** "eu configurei" signifique "mudou" — e não mais quatro meses de gente escrevendo em
caixas de texto desconectadas.

---

## Context

A **D-87-0-c** (Gabriel, 05/08) é direta: **os campos mortos têm que passar a valer. Nada sai do
painel.** Coerente com a D-87-0-a — se o painel é a fonte da verdade, a resposta para "esse campo
não faz nada" é fazer valer, não escondê-lo.

O @architect nomeou o custo dessa classe de defeito com precisão, e o Epic 87 inteiro é a prova:

> *"Configuração que não faz nada é pior que configuração ausente — foi exatamente o que
> sustentou 4 meses de crença errada no MemPalace."*

### As 5 superfícies órfãs — auditadas no código, não supostas

| # | superfície | editável por | o que o runtime faz | classe |
|---|---|---|---|---|
| 1 | `agent_prompts.off-hours` | tela (loop de prompts) | **nada** — o runtime lê `agent_config.out_of_hours_message` (`pipeline.ts:206`, `resolveOffHoursResponse`) | **botão que mente, e o lead lê a diferença** |
| 2 | `agent_prompts.handoff-summary` | tela (loop de prompts) | **nada** — fora de `DbPromptOverrides`; `HANDOFF_SUMMARY_PROMPT` só é exportada (`prompts/index.ts:6`) e usada pelo seed. O resumo real é código puro (`flows/handoff.ts:115-158`) | **morto nas duas pontas** |
| 3 | `agent_config.personality_prompt` (12.445 chars) | `PATCH /api/agent-config` (`route.ts:36`) | carregado (`pipeline.ts:1457/1494`) e **descartado** | duplicata do slug `system-personality` |
| 4 | `agent_config.greeting_message` | **tela** (`page.tsx:178`) + `PATCH` | carregado (`pipeline.ts:1457/1502`) e **descartado**. O comentário da linha 191 admite: *"disponível mas sem ponto de uso nesta story"* | **botão que mente** |
| 5 | `agent_config.guardrails` (array) | **ninguém** | carregado (`pipeline.ts:1457/1495`) e **descartado** | coluna morta na query, não é botão |

> **O #1 é o pior, porque não é abstrato.** O painel tem uma mensagem de fora do horário com os
> horários de atendimento e o convite para adiantar o assunto; o lead recebe a constante curta do
> código. Quem escreveu a do painel acha, **desde 18/06**, que está no ar.
>
> **E a mesma tela tem duas caixas para isso:** o card "Mensagem fora do horario"
> (`page.tsx:198`, escreve `out_of_hours_message`, **funciona**) e o item `off-hours` do loop
> (**não funciona**). O admin escolhe entre as duas com 50% de chance de acertar.

**Nota de precisão sobre o #5:** `agent_config.guardrails` não é "botão que mente" — **nenhuma
tela ou API o expõe**. É peso morto na query. "Passar a valer" não se aplica do mesmo jeito: ou
ganha superfície de edição **e** consumidor, ou para de ser carregado. Ver AC5, que trata isso
como decisão registrada em vez de assumir.

---

## Escopo

### Item 1 — `off-hours`: uma caixa só, e ela funciona

`resolveOffHoursResponse` (`pipeline.ts:202-207`) passa a ler o slug `off-hours`, com
`agent_config.out_of_hours_message` como fallback e `OFF_HOURS_PROMPT` como último recurso. As
duas caixas da tela viram **uma**.

Duas decisões de produto, que chegam ao lead e por isso **precisam do OK do Gabriel** (D-87-0-e):
- **qual texto vence** — o do painel (com horários) ou o que o lead recebe hoje;
- **emoji.** O texto do painel tem emoji; o `LEMBRETE FINAL` (`index.ts:93`) manda **ZERO
  emojis**. Como esta é mensagem fixa e não saída de modelo, a regra pode não se aplicar — mas
  isso precisa ser **decidido**, não herdado por acidente.

### Item 2 — `handoff-summary`: o painel controla a MOLDURA, os valores vêm do código

Decisão **D-87-0-d** (Gabriel, 05/08) — **Opção A**, e o motivo é o próprio Epic 87: *o corretor
age com base nesse resumo, e resumo gerado por modelo é a classe de erro que produziu o
`ai_summary` da Sandra afirmando visita inexistente.* Um humano ligando para o cliente sobre uma
visita que não existe é **pior** que o problema original.

| editável pelo painel (**moldura**) | continua no código (**valores**) |
|---|---|
| cabeçalho (`=== RESUMO DO LEAD (HANDOFF) ===`) | todo valor vem de `collectedData` |
| títulos de seção (DADOS DO CONTATO / INTERESSE / MENSAGENS DO LEAD) | as mensagens vêm de `messages` (`role='user'`) |
| rótulos dos campos | truncamento de 200 chars por mensagem |
| **quais campos entram e em que ordem** | `TOTAL DE MENSAGENS` |
| quantas mensagens recentes aparecem (hoje fixo em 5, `handoff.ts:131`) | — |
| rodapé (`=== FIM DO RESUMO ===`) | — |

> **Regra inegociável:** **nenhum valor do resumo pode ser gerado por modelo.** Nenhuma chamada
> de LLM entra neste caminho — nem agora, nem "só para melhorar a redação depois". A AC2(iv)
> transforma isso em trava verificável.

### Item 3 — `personality_prompt`, `greeting_message`, `guardrails`

- **`personality_prompt`:** para de ser carregado. É **duplicata** do slug `system-personality`,
  que já funciona e já é editável. Fazer os dois valerem criaria **duas fontes para a mesma
  coisa** — o oposto da D-87-0-a. Aqui não se remove capacidade do painel: ela continua, no campo
  certo.
- **`greeting_message`:** editável na tela e sem consumidor. Duas saídas legítimas — passar a ser
  usado (na primeira mensagem de uma conversa nova) ou sair da tela. **Decisão de produto**, ver
  AC4. É o único dos cinco cuja resposta "passa a valer" exige desenhar comportamento novo da
  Nicole, e por isso precisa de escolha explícita.
- **`guardrails`:** ver a nota de precisão acima e a AC5.

### Item 4 — O bug do `visit_availability` no resumo do corretor

`handoff.ts:138` renderiza `visit_availability` com `formatBoolean`. **A premissa comum sobre este
bug está invertida** — ver Dev Notes. Corrigido aqui porque o Item 2 reescreve exatamente esta
montagem: tornar rótulo e ordem editáveis por cima de um campo que descarta o valor seria entregar
uma moldura em volta de um buraco.

---

## Acceptance Criteria

**AC1 — `off-hours`: o que está no painel é o que o lead recebe, e há uma caixa só.**
*Verifica-se:* (i) teste unitário de `resolveOffHoursResponse` cobrindo a precedência
slug → `out_of_hours_message` → `OFF_HOURS_PROMPT`, um caso por nível; (ii) **teste sentinela**:
gravar um texto único no slug `off-hours` e afirmar que é exatamente ele que sai como resposta de
fora do horário — **vermelho hoje**, porque o runtime lê outro campo; (iii) a tela renderiza
**uma única** caixa de mensagem de fora do horário (hoje são duas), verificado por teste ou
captura anexada; (iv) o texto promovido e a decisão sobre emoji estão registrados e **aprovados
pelo Gabriel** antes de ir ao banco.

**AC2 — `handoff-summary`: o painel controla a moldura, e o modelo não entra.**
*Verifica-se:* (i) alterar um rótulo no painel ("Entrada disponivel" → "Tem entrada?") muda o
texto que o corretor recebe, provado por teste que monta o resumo com override de moldura;
(ii) mudar a **ordem** dos campos e o **número** de mensagens recentes tem efeito, provado por
teste; (iii) **placeholder desconhecido não quebra e não vaza** — moldura com
`{campo_que_nao_existe}` produz resumo válido, sem `undefined` nem `{...}` no texto do corretor;
(iv) **`grep -nE "async|anthropic|messages\.create" packages/ai/src/flows/handoff.ts` retorna 0** —
`generateHandoffSummary` continua **pura e síncrona**. O item (iv) é a trava contra a deriva para
LLM e vale para **toda story futura** que tocar este arquivo.

**AC3 — `personality_prompt` para de trafegar.**
*Verifica-se:* `grep -n "personality_prompt" packages/ai/src/chat/pipeline.ts` retorna **0**
(hoje são **4**: linhas 184, 1457, 1465, 1494) — sai do `select`, do tipo `AgentConfig` e do
retorno; e sai da allowlist de `PATCH /api/agent-config` (`route.ts:36`), com teste de que um
`PATCH` com esse campo é rejeitado ou ignorado. A **coluna não é dropada** (sem migration
destrutiva): fica no banco com o valor atual, registrada como legado.

**AC4 — `greeting_message` deixa de mentir, do jeito que o produto escolher.**
*Verifica-se, conforme a decisão registrada:*
- **[passa a valer]** teste provando que o texto salvo no painel é usado na primeira mensagem de
  uma conversa nova; **ou**
- **[sai da tela]** o campo deixa de ser editável (fora de `AGENT_CONFIG_FIELDS` em
  `page.tsx:10` e da allowlist do `PATCH`) e deixa de ser carregado no pipeline.
Em qualquer caso: ao fim da story **não existe caixa editável sem efeito**.

**AC5 — `agent_config.guardrails` tem destino escrito.**
*Verifica-se:* ou some do `select` de `loadAgentConfig` e do tipo `AgentConfig` (`grep` = 0), ou
ganha consumidor **e** superfície de edição, com teste. A decisão e o motivo ficam registrados na
story. Não é aceitável terminar carregando uma coluna que ninguém lê e ninguém edita.

**AC6 — O resumo do corretor para de perder a disponibilidade do lead.**
*Verifica-se:* (i) teste com `visit_availability: "sábado de manhã"` → o resumo mostra o texto,
**não** "nao informado" — **vermelho hoje**; (ii) o valor é **truncado em ~120 chars** e rotulado
como *declarado pelo lead*, porque este é justamente o campo que a auditoria de 05/08 mostrou
conter falas da própria Nicole (CR-4); (iii) `formatBoolean(has_down_payment)` **não muda** — ali
o campo é booleano de verdade (`qualification.ts:233,238`) e o helper está correto.

**AC7 — O detector de config órfã fica verde, sem marcador nenhum.**
A Story 87-0 entregou `packages/ai/src/config-surfaces.test.ts`, que enumera as superfícies de
configuração e marca as órfãs atuais com **`it.fails`** (escolha deliberada do @dev: `skip`
apodrece em silêncio; `it.fails` **passa a falhar** quando a dívida é paga, obrigando quem pagou
a remover o marcador).
*Verifica-se:* ao fim desta story **não resta nenhum `it.fails`** nesse arquivo referente às 5
superfícies, e `npx vitest run packages/ai/src/config-surfaces.test.ts` passa sem
`expected fail`. É o fecho que impede esta story de terminar "quase pronta" — e é o motivo de o
detector ter nascido na 87-0 em vez de aqui.

**AC8 — Sem regressão.**
*Verifica-se:* `npx vitest run`, `npm run type-check`, `npm run lint` sem erro novo. Atenção à
suíte existente `packages/ai/src/flows/handoff.test.ts` (9 casos) — ela fixa o formato atual do
resumo e **vai precisar acompanhar** a moldura; mudanças ali são esperadas e devem ser
justificadas no PR, não silenciadas.

---

## Dev Notes

### ⚠️ O bug do `visit_availability` — a premissa comum está **invertida**

`formatBoolean` (`handoff.ts:160-164`):

```ts
if (value === true) return "sim"
if (value === false) return "nao"
return "nao informado"
```

`visit_availability` é gravado como **string** — `updated.visit_availability = aiResponse.trim()`
(`qualification.ts:298`). String **nunca** é `=== true`. Logo:

> O corretor **não** lê "sim" para um campo com uma frase dentro. Ele lê **"nao informado"** —
> **sempre**, inclusive quando o lead disse claramente quando pode ir.

Não é valor errado exibido, é **perda silenciosa de informação** no documento que o corretor usa
para ligar. Menos alarmante e mais insidioso: nunca vai parecer bug para quem lê o resumo.

**Sibling que fica FORA desta story, de propósito:** `detect-appointment.ts:71` faz
`collectedData.visit_availability === true` — mesma confusão de tipo, sempre falsa, sinal morto na
detecção de agendamento. Corrigi-lo torna a Nicole **mais** propensa a detectar agendamento:
mudança de **caminho de decisão**, que a regra de corte da Onda 1 proíbe. O handoff não é caminho
de decisão — é texto que um humano lê. Registrado para **W1-2b / W2-3**.

### Mapa de código

| arquivo | linha | o quê |
|---|---|---|
| `packages/ai/src/chat/pipeline.ts` | 202-207, 442-443 | `resolveOffHoursResponse` — AC1 |
| `packages/ai/src/chat/pipeline.ts` | 184, 191, 1457, 1465, 1494-1502 | os campos de `agent_config` carregados e descartados — AC3, AC4, AC5 |
| `packages/ai/src/chat/pipeline.ts` | 1025 | única chamada de `generateHandoffSummary` |
| `packages/ai/src/flows/handoff.ts` | 115-164 | `generateHandoffSummary` + `formatBoolean` — AC2, AC6 |
| `packages/ai/src/flows/handoff.test.ts` | 158-232 | suíte que fixa o formato atual — AC8 |
| `packages/ai/src/prompts/index.ts` | 41-47 | `DbPromptOverrides` — os slugs consumidos |
| `packages/web/.../personalidade/page.tsx` | 10, 172-210, 250-285 | as duas caixas de fora-do-horário + o loop de prompts |
| `packages/web/src/app/api/agent-config/route.ts` | 33-40 | allowlist do `PATCH` |

### Detalhes

- **Formato do template da moldura:** escolha do @dev/@architect, com três restrições —
  declarativo (sem execução de código), degradação segura em placeholder desconhecido, e
  `generateHandoffSummary` **pura e síncrona**.
- **Fallback:** se a moldura do banco estiver vazia ou inválida, o resumo cai no formato do código.
  O corretor nunca pode receber resumo quebrado por causa de um save ruim no painel.
- **Sem migration prevista.** Nenhuma coluna nova; `personality_prompt` e `guardrails` **não** são
  dropados.
- **Copy tem dono:** todo texto que passar a valer (item 1 e a moldura do item 2) precisa do OK do
  **Gabriel** antes de ir ao banco — D-87-0-e, mesma regra da Tarefa 2 da 87-0.

---

## Riscos

| # | risco | sev | mitigação |
|---|---|---|---|
| 1 | **A moldura editável vira porta de entrada para texto gerado por modelo** ("só para melhorar a redação") — a classe de erro do `ai_summary` da Sandra, agora com um humano agindo em cima | **Alta** | AC2(iv) trava por grep; a regra vale para toda story futura que tocar o arquivo |
| 2 | `off-hours` passa a valer e o lead recebe um texto que ninguém revisou como "no ar" (inclusive emoji, que o LEMBRETE FINAL proíbe) | **Média** | AC1(iv) exige texto e emoji decididos e aprovados pelo Gabriel **antes** de ligar. É mensagem fixa: dá para ler a versão final inteira em 1 minuto |
| 3 | Moldura mal preenchida quebra o resumo do corretor em produção | **Média** | AC2(iii) exige degradação segura + fallback para o formato do código |
| 4 | `greeting_message` "passa a valer" e a Nicole muda o jeito de abrir conversa — comportamento novo, em cima de um incidente aberto | **Média** | AC4 admite explicitamente o branch "sai da tela"; se for "passa a valer", é mudança de comportamento e merece janela de observação como qualquer deploy da Onda 1 |
| 5 | AC6 expõe no resumo um `visit_availability` **contaminado** (fala da Nicole, CR-4) | **Média** | AC6(ii) trunca e rotula como *declarado pelo lead*. A remediação do dado é W1-2a; aqui o corretor passa a **ver** o texto, o que é melhor que não ver nada e ajuda a flagrar contaminação |

---

## Referências

- `docs/stories/87-0-paridade-reconciliacao-agent-prompts.story.md` — decisões **D-87-0-a/c/d/e**,
  a auditoria das superfícies órfãs e o detector da AC7
- `docs/qa/po-validation-87-0.md` — correção **C5**: a 3ª superfície (`PATCH /api/agent-config`) e
  a proibição de usar `is_active = false` para "sumir" com slug
- `docs/architecture/2026-08-05-validacao-epic-87.md` §6.0 e §6.3 item 5
- `docs/research/2026-08-05-nicole-anti-alucinacao/analise-tecnica.md` §1.7 **N1b** (botões mortos)
  e §P4 (`CONFIG_DEAD_KNOB`)

---

**CodeRabbit Integration**: Disabled (sem `coderabbit_integration` em `.aios-core/core-config.yaml`)

---

## Definition of Done

- [ ] AC1–AC8 verificadas; AC1(ii), AC2(i) e AC6(i) com o **vermelho antes** colado
- [ ] Textos promovidos aprovados pelo **Gabriel** antes de irem ao banco (D-87-0-e)
- [ ] Decisões de `greeting_message` (AC4) e `guardrails` (AC5) registradas com motivo
- [ ] Lista de exceções do detector da 87-0 **vazia** (AC7)
- [ ] @po validou · @qa deu gate · @devops fez o push

---

## Change Log

| data | quem | o que |
|---|---|---|
| 2026-08-05 | @sm | Story criada a partir da AC8 da 87-0, no corte aprovado pelo Gabriel. Escopo ampliado de 3 para **5** superfícies órfãs: entram `agent_config.greeting_message` (editável na tela, sem consumidor) e `agent_config.guardrails` (carregado, sem consumidor e sem superfície de edição — classe diferente, tratada na AC5). Inclui a correção de premissa sobre `formatBoolean` e a exclusão deliberada do sibling em `detect-appointment.ts:71`. |
