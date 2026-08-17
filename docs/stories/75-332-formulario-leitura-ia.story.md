# Story 75-332 — IA lê as respostas abertas do formulário

**Status:** InReview
**Tipo:** Feature (IA sobre dado já capturado)
**Epic:** 89 — Formulário de qualificação para tráfego pago
**Story ID:** 75-332
**Complexidade:** M (~4 pts — 1 flow de IA, 1 gatilho, 0 migrations)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Depende de:** **75-330** (PR #437) e **75-331** (PR #438). Branch empilhada sobre a 331.
**Migrations:** **nenhuma**.

## Contexto

A 75-330 captura as respostas e a 75-331 marca a visita. Falta o que nenhuma das duas faz:
**ler o que a pessoa escreveu por extenso.**

O score da 75-330 só sabe pontuar opção de múltipla escolha. Quando o lead escreve *"estou
saindo do aluguel, minha filha começa na escola do bairro em janeiro"*, isso não vira ponto
nenhum — e é exatamente o que o corretor precisaria saber antes de mandar a primeira mensagem.

Esta story põe o Haiku para ler as respostas abertas e devolver duas coisas: um **resumo curto
para o corretor** e o **calor do lead**.

## 🔴 Dois achados que mudam o que o épico dizia

### 1. `qualificacao_comercial` é campo MANUAL — a IA NÃO pode escrever nele

O Épico 89 §5 dizia que a 75-332 preencheria "calor, qualificação comercial e resumo". A
qualificação comercial **está fora**, e o motivo está na migration que a criou:

> `217_leads_qualificacao_comercial.sql` — *"Story 84-1 (Epic 84) — Qualificação Comercial do
> lead: campo **manual** e independente da Temperatura (`leads.interest_level`) e do
> `qualification_status`/`qualification_score` automáticos"*

É a avaliação humana da qualidade do lead, desenhada de propósito como independente do que a
máquina calcula. Se a IA escrever ali, ela apaga o julgamento do corretor — e esse filme já
passou: a migration **201** existe porque a IA sobrescrevia o calor que o humano tinha
definido (*"corretor evoluía p/ Quente e a próxima mensagem devolvia p/ Frio"*). Repetir isso
em outro campo seria reincidência, não novidade.

**Decisão:** a story escreve **calor** e **resumo**. `qualificacao_comercial` continua só do
humano. O epic é corrigido junto.

### 2. O enriquecimento que já existe NUNCA vai alcançar o lead do formulário

`app/api/cron/enrich-leads/route.ts:38-41` itera sobre **`conversations`** com
`is_ai_active = true`, e alimenta o Haiku com as **mensagens** da conversa. O lead que nasce
do formulário **não tem conversa e não tem mensagem nenhuma** — ele nunca entra nesse laço.

Ou seja: sem esta story, o lead do formulário fica **sem calor para sempre**, mesmo tendo
respondido tudo. Não é que a leitura por IA seria "um extra": é o único caminho.

## O que já existe e vai ser REUSADO

| Peça | Onde | Observação |
|------|------|-----------|
| Cliente e modelo | `packages/ai` — `createAnthropicClient`, `ANTHROPIC_MODELS.haiku` | O mesmo do enriquecimento; **conferir o id do modelo na skill `claude-api` antes de escrever**, nunca de memória |
| Guard do calor manual | `packages/ai/src/flows/haiku-enrichment.ts` — **`stripManualInterestLevel`** (já exportada) | Fail-safe: lead que não pôde ser lido conta como manual |
| Painel na ficha | `components/leads/form-responses-panel.tsx` (75-330) | O resumo entra aqui, onde o corretor já olha |
| Respostas formatadas | `lib/forms/format-response.ts` (75-330) | Já resolve rótulo de opção; a IA recebe texto legível, não jsonb cru |

## ⚠️ A régua do calor está solta e precisa virar fonte única

`haiku-enrichment.ts:253` calcula o calor **inline**:

```ts
patch.interest_level = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold"
```

Se esta story reproduzir esses números, passam a existir **duas réguas** que divergem no
primeiro ajuste — e o mesmo lead teria calor diferente conforme o caminho. A story **extrai**
essa expressão para uma função exportada e faz os dois lugares importarem a mesma.

## Escopo

### IN

1. Flow de IA que lê as respostas **abertas** (tipos `texto`/`numero`) + o score, e devolve
   `{ resumo, calor }`.
2. Extração da régua do calor para função única, usada aqui e no `haiku-enrichment`.
3. Gatilho na finalização do formulário (`POST /api/formulario/[token]`, `finalizar: true`).
4. Resumo gravado em `lead_form_responses.metadata` (sem migration) e exibido no painel da ficha.
5. Calor gravado em `leads.interest_level`, **atrás do `stripManualInterestLevel`**.

### OUT

- **`qualificacao_comercial`** — campo manual (achado 1)
- **`leads.ai_summary`** — pertence ao pipeline/memória da Nicole (`packages/ai/src/memory/loader.ts`, `chat/pipeline.ts`). Escrever ali apagaria a memória da conversa
- Reanálise em lote de formulários já respondidos
- Sugestão de etapa (a IA só sugere etapa na Análise de Comportamento, Épico 82)

## Acceptance Criteria

1. **AC1 — Lê o que o score não vê.** O flow recebe as respostas de tipo aberto já
   formatadas (pergunta + resposta, via `format-response.ts`) e devolve um resumo de **até 3
   linhas**, escrito para o corretor abrir a conversa sabendo do contexto.

2. **AC2 — FAIL-OPEN: a IA nunca derruba o formulário.** Erro, timeout ou resposta inválida
   do modelo **não** pode impedir a finalização, o lead, nem o agendamento da 75-331. Falhou →
   segue sem resumo, e o erro vai para o log. Mesmo espírito da guarda de ortografia (Épico 83).

3. **AC3 — Roda depois de responder, não durante.** O gatilho não pode somar latência de
   modelo ao clique de "Enviar" do lead.

   🔴 `[@qa 17/08]` **CORRIGIDA.** A redação original mandava "fire-and-forget, como o
   `notify*` do `/api/agendar/[token]`" — e isso está **errado**. Na Vercel a invocação
   congela assim que a resposta sai; um `void` solto morre no meio, sem erro e sem log. O
   projeto já pagou por isso: o e-mail de reset **nunca era enviado** (Story 75-139), e o
   conserto foi o `after()` do Next (`app/login/actions.ts:188-192`). Com um round-trip de
   até 15s ao modelo, a janela é uma ordem de grandeza maior que a do `notify*`. **Usar
   `after()` de `next/server`, nunca `void`.**

4. **AC4 — 🔴 O calor respeita o humano.** A escrita de `interest_level` passa
   **obrigatoriamente** por `stripManualInterestLevel`. Lead com `interest_level_manual = true`
   **não** tem o calor tocado. Lead que não pôde ser lido conta como manual (fail-safe).

   **Teste obrigatório:** lead com `interest_level_manual = true` mantém o calor que o corretor
   escolheu, mesmo quando a IA devolve outro.

5. **AC5 — Uma régua só.** `haiku-enrichment.ts:253` e esta story usam a **mesma função**
   exportada. Teste que prove que os dois caminhos dão o mesmo calor para o mesmo score.

6. **AC6 — `qualificacao_comercial` intocada.** Nenhum caminho desta story escreve nesse
   campo. Teste que prove que ele continua `null` depois da análise.

7. **AC7 — Resumo visível onde o corretor já olha.** Aparece no `FormResponsesPanel` da ficha,
   junto das respostas. Sem resumo (IA falhou ou formulário sem pergunta aberta), o painel
   renderiza como hoje, sem espaço vazio.

8. **AC8 — Formulário sem pergunta aberta não chama o modelo.** Se todas as perguntas são de
   múltipla escolha, não há texto a interpretar: pular a chamada economiza token e evita um
   resumo inventado a partir de nada.

## Notas técnicas

- **Carregar a skill `claude-api` antes de escrever o flow.** O id do modelo, os parâmetros e o
  formato de resposta não saem de memória.
- **Saída estruturada:** o flow precisa de uma forma previsível (`{ resumo, calor }`). Resposta
  fora do formato = tratada como falha (AC2), nunca gravada a meio.
- **Prompt:** o resumo é para o CORRETOR, não para o lead. Sem saudação, sem elogio ao lead,
  sem inventar o que não foi dito — o guardrail de "não inventar" já mordeu neste projeto (a
  IA inventou fachada de prédio, Épico da Lídia).
- **Testes:** as decisões (o que mandar ao modelo, o que fazer com a resposta, quando pular)
  vão para função pura, como nas 330/331. A chamada ao modelo é mockada.

## Definition of Done

- [ ] Resumo aparecendo na ficha de um lead real vindo do formulário
- [ ] **Teste do calor manual preservado** (AC4)
- [ ] **Teste da régua única** (AC5) e de `qualificacao_comercial` intocada (AC6)
- [ ] Falha simulada do modelo não impede finalizar o formulário (AC2)
- [ ] `tsc` 0 · `eslint` sem warning nova · `build` · `vitest` sem regressão
- [ ] @qa PASS antes do push

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 17/08/2026 | @sm (River) | Story criada. Dois achados mudaram o escopo do epic: `qualificacao_comercial` é manual por design (mig 217) e a IA não pode escrever nela; e o cron de enriquecimento nunca alcança lead de formulário (itera sobre conversas) |

---

## Validação @po — 17/08/2026

**VEREDITO: 🟢 GO — `Draft` → `Ready`. Checklist 9/10.**

Verifiquei as duas afirmações centrais **executando**, não lendo:

### ✅ Achado 1 confirmado, e é mais forte do que a story diz

`qualificacao_comercial` não é campo teórico — está em **uso humano real em produção**
(medido em `SELECT`, 17/08):

```
null: 1736 · regular: 38 · ruim: 26 · bom: 2
```

**66 leads já foram classificados à mão.** A IA escrevendo ali não "ocuparia um campo vazio":
apagaria julgamento já registrado por gente. O corte está certo, e a evidência é mais dura do
que o argumento de design.

### ✅ Achado 2 confirmado

`stripManualInterestLevel` está exportada em `flows/haiku-enrichment.ts:267`, sai no barril
(`flows/index.ts:64`) e portanto é importável como `@trifold/ai` — **sem precisar mexer nos
exports**. Ela já tem teste próprio (`haiku-enrichment.test.ts:201`). O @dev importa, não
reimplementa.

### Ressalvas

- ⚠️ **A AC5 (régua única) mexe em código vivo da Nicole.** Extrair a expressão de
  `haiku-enrichment.ts:253` é o certo, mas aquele arquivo roda no cron de enriquecimento a cada
  execução. A extração precisa ser **puramente mecânica** — mesmos números, mesmo resultado — e
  o teste da AC5 é o que prova isso. Nenhum ajuste de régua nesta story.
- ⚠️ **Empilhamento triplo.** Esta branch depende da 331, que depende da 330. Ordem de merge:
  **#437 → #438 → esta**. Fora dela, quebra.
- ⚠️ **A AC8 (pular o modelo sem pergunta aberta) é economia, não correção** — mas também evita
  um resumo inventado a partir de nada, que é o risco real.

— Pax, @po
| 17/08/2026 | @dev (Dex) | Implementada. Régua do calor extraída para `interest-level.ts` (os dois caminhos importam a mesma). Structured outputs tentada e revertida: SDK 0.52.0 não suporta |
| 17/08/2026 | @qa (Quinn) | **CONCERNS** — `void` fire-and-forget reintroduzia o bug da 75-139 (trabalho morre quando o lambda congela); trocado por `after()`. AC3 estava errada e foi corrigida. Parecer: `docs/qa/qa-gate-75-332.md` |
