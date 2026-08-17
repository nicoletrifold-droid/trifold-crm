# Validação do @po — Story 88-2 (harness que afirma a ENTRADA do modelo)

**Agente:** Pax (@po) · **Data:** 2026-08-16 · **Story:** `docs/stories/88-2-harness-afirma-a-entrada-do-modelo.story.md`
**Epic:** 88 (`docs/stories/epics/epic-88-nicole-tool-use-agenda.md`) · item `88-2`, Onda 0
**Veredito: 🟢 GO — 8,5/10 — `Draft` → `Ready`, com 8 emendas aplicadas por mim nas ACs.**
**Confiança de implementação: Alta.**

**Método.** Nada foi medido na árvore de trabalho, que está com a `87-16` não commitada e com o
@qa rodando o gate em cima. Tudo em **worktree isolado** de `origin/main a60a1bc6`
(`git worktree add --detach`, `node_modules` por symlink), mais **produção somente-SELECT** via
Management API. Zero arquivo de produção tocado. Os dois arquivos de medição que criei viveram
dentro do worktree e foram apagados; o worktree foi removido ao fim.

---

## 1. As três correções do @sm — todas RATIFICADAS, com medição independente

### 1.1 C-1 — *"nenhum teste consegue afirmar o bloco `[SISTEMA]`"* é **falso**. O @sm está certo; eu estava errada.

```
$ grep -c 't.bloco).toContain' packages/ai/src/chat/pipeline-agenda-state.test.ts   → 8
$ grep -c '\.bloco'            packages/ai/src/chat/pipeline-agenda-state.test.ts   → 25
:299  expect(t.bloco).toContain("Visita JÁ confirmada para sexta-feira, 14 de agosto às 10:00")
```

Eu repassei aquela frase como fato e ela não sobrevive a um `grep`. **Registro no meu inventário:**
a capacidade existe em **3 dos 5** arquivos; o que não existe é o **rótulo** de qual chamada, a
**captura de `tools`/`tool_choice`** e a **fixture do José**. A reformulação do @sm (*"dá para
afirmar de cinco jeitos, nenhum diz qual chamada"*) é verdadeira **e pior** — e é a que sustenta a
story.

### 1.2 C-2 — a causa do turno do José **não é** o `detectRescheduleIntent`. Reproduzido de ponta a ponta.

Rodei `processMessageWithMetadata` contra `createFakeSupabase`, relógio fixo, `appointment` ativo em
`2026-08-17T13:00:00.000Z`, **zero linha de produção alterada** (os dois símbolos já são exportados
— o que também fecha o escopo negativo da AC8-i).

| # | Mensagem | `parseTimeParts` | `reschedule` | Bloco `[SISTEMA]` | `scheduled_at` depois |
|---|---|---|---|---|---|
| 1 | `…justamente às 10h, dá pra ser a partir das 14h?` | `{hour:10}` | `false` | 🔴 `Visita JÁ confirmada … às 10:00` | `13:00Z` (intacto) |
| 2 | **`podemos remarcar?` + a mesma frase** | `{hour:10}` | **`true`** | 🔴 **IDÊNTICO** | `13:00Z` (intacto) |
| 3 | `dá pra ser a partir das 14h?` | `{hour:14}` | `false` | ✅ `REMARCAR … para … 14:00. O novo horário está LIVRE` | **`17:00Z`** |
| 4 | `… as 10, da pra ser a partir das 14h?` | `{hour:14}` | `false` | ✅ `REMARCAR … 14:00` | **`17:00Z`** |
| 5 | `tenho um compromisso às 10h amanhã, consegue às 14h?` | `{hour:10}` | `false` | 🔴 `Visita JÁ confirmada … às 10:00` | `13:00Z` |

**Com a palavra-chave enxertada o bloco sai igual, byte a byte.** A causa vinculante é a que o @sm
nomeia: `parseHour` (`visit-slot.ts:197`) usa `t.match(...)` e devolve a **primeira** hora da frase —
a do **conflito** —, `newStartUtc` cai em cima do `appointment`, `differs = false`
(`pipeline.ts:950`) e a cadeia escorrega até o `else` do `:1014`, cuja premissa é *"o cliente não
pediu para mudar"*. Confirmei por leitura que o ramo `:900-1018` **não** foi tocado pela `87-16` na
working tree, então a medição vale para as duas árvores.

**E fui além da story: colhi a string real de produção.**

```sql
messages.role='user', 2026-08-16 14:16:03.242939+00, lead José
"Bom dia! Me surgiu um compromisso no trabalho para amanhã justamente ás 10h da pra  ser em algum horário a partir das 14h?"
```

Rodada literal: `parseTimeParts={hour:10}` · `Visita JÁ confirmada … às 10:00` · `scheduled_at`
intacto. **Virou a emenda E3** — a fixture usa a string do banco, não a paráfrase.

**Os 4 casos discriminam de verdade**, e é o que eu vim conferir: o caso 2 mata a hipótese do
regex, o 3 prova que o pipeline sabe acertar, o 4 mostra que o dano depende de o lead escrever
`10h` e não `10`. Uma fixture de 1 caso ficaria verde no dia em que alguém acrescentasse
`"a partir de"` ao `RESCHEDULE_RE`, **sem o defeito ser tocado**. *(Confirmei também as 12
alternâncias do `RESCHEDULE_RE` e que a 12ª é inalcançável — `\bmuda\w*\b` já casa "mudar".)*

### 1.3 C-3 — o arquivo que o epic manda estender é o que não captura nada

`pipeline-scheduling.test.ts:39 → create: async () => ({…})`, zero argumentos. Confirmado. **Pedido
de correção ao @pm mantido** (§6.1 do epic).

---

## 2. Os quatro pontos de desconfiança — julgados

### 2.1 O "vermelho antes" resolvido com `it.fails` — **idioma honesto, com um buraco que eu fechei**

O idioma é da casa (`config-surfaces.test.ts:56`, `prompts/contradiction.test.ts:68`, mesmo formato
de env var). E o @sm fez a coisa difícil: escreveu **com todas as letras** que uma fixture que
descreve defeito vivo **nasce verde** e que vender isso como "vermelho comprovado" seria teatro.
Isso é o oposto de dívida tolerada — `it.fails` **se apaga sozinho** no dia em que alguém conserta,
enquanto `skip` apodrece.

**O buraco, medido:**

```
✓ A: falha por ASSERÇÃO (o vermelho honesto)                    → expected fail
✓ B: falha por ERRO DE SETUP (TypeError), asserção nem roda     → expected fail
Tests  2 expected fail (2)
```

`it.fails` é verde para **qualquer** `throw`. E o `casoDeDivida` roda um `processMessage` inteiro
sobre seeds que a **`87-16` está editando agora**: um seed que mude de forma ⇒ `TypeError` ⇒ o
marcador fica verde para sempre, e a evidência do AC5-v é um `paste` de uma vez só. **Emenda E7:** o
**caso 1 (caracterização)** roda o mesmo turno pelo mesmo helper e é declarado **guarda de
vivacidade** do marcador — se o turno quebrar, ele fica vermelho. Custa zero e fecha o R-6 pelo
outro lado (a caracterização deixa de parecer redundante).

**Ressalva de inventário:** a raiz já carrega **6** marcadores abertos (`2416 passed | 6 expected
fail`), nenhum fechado. Este é o **7º**. Sete é o teto que eu aceito sem um item de faxina.

### 2.2 A auto-régua — 🔴 **as três camadas NÃO fecham. Faltava a quarta.**

Rodei a régua proposta contra a população real e simulei o arquivo que a story promete verde:

```
populacao chat/**/*.test.ts (a60a1bc6) = 8    fabricas ad-hoc = 5     ← o §1 da story confere
blind spot flows/*.test.ts com o cast = 5                              ← o ponto cego declarado confere

SIMULACAO anthropic-harness.test.ts com a fixture M5a como LITERAL  → bate nele mesmo?  true
SIMULACAO M5b (cast quebrado em duas linhas, como literal)          → bate?             true
REMEDIO (montado por join, idioma da 87-16)                         → bate?             false
```

A camada 3 (*"as fixtures de mutação nunca tocam o disco"*) protege o **input** da régua — **não o
arquivo que carrega o literal**. O `anthropic-harness.test.ts` **está** na população, **é** lido do
disco pela AC7-ii, e vai conter o cast **como dado** (M5a) e **quebrado em duas linhas** (M5b). A
igualdade de conjunto acende contra o teste do próprio harness, e o conserto natural é a
**auto-exceção** — a semente que a `87-16` proibiu por escrito no cabeçalho do
`pipeline-sem-mempalace.test.ts`. **Emenda E5 (AC7-vi):** o cast é **montado por `join`**, nunca
escrito por extenso, e há um caso explícito provando que a varredura de disco **não** devolve o
próprio arquivo do harness.

**Sobre "exceção por igualdade de conjunto, não por lista": confirmado e é bom desenho** — acende
nos dois sentidos.

### 2.3 A fixture de 4 casos — **discrimina** (tabela do §1.2), e ganhou controle de efeito

**Emenda E2:** o AC5-vi (*"o `appointment` permanece intacto"*) reprovaria os casos 3 e 4 — neles o
pipeline **remarca de verdade**, `13:00Z → 17:00Z`, com `appointments` continuando em 1 linha.
Escopo corrigido: intacto nos casos 1–2, **movido para `17:00Z`** nos casos 3–4. O par
intacto × movido é prova melhor que "o bloco contém REMARCAR": é **efeito**, não instrução.

### 2.4 Os 2 arquivos fora da migração — **contenção, com a emenda E6; seria porta aberta sem ela**

O mecanismo é bom. O que estava errado era a **contabilidade** e a **titularidade**:

- **A 6ª fábrica já nasceu — e não é a do #428.** Medido na working tree: a população de `chat/`
  subiu de 8 para **10**, e `pipeline-ai-summary-no-prompt.test.ts:118` (criado pela **`87-16`**,
  que está no gate agora) tem o cast. O §5 da story só previa o `pipeline-collected-data.test.ts`
  do #428 — que confirmei por `gh pr view 428` e está correto. **Faltava o terceiro.** Estado
  esperado no merge: **3 exceções**, não 2.
- **"Condição de saída" sem dono não é condição, é intenção.** `EXCECOES_DECLARADAS` passa a
  referenciar um item nomeado (**`88-2b`**), senão o resíduo fica órfão com uma frase educada ao
  lado.

### 2.5 A proibição de afirmar total de chamadas — **bem motivada, mas escondia um buraco**

Medido: **2** no retorno; **3** após 400 ms quando `msgCount % 5 == 0` (o `12.5b` tem um `await`
antes do `create` e cai fora do tick). A proibição está certa. **O buraco:** a **AC1** pede
exatamente uma contagem (*"há 2 entradas com `indice` 0 e 1"*) — se o @dev a exercer sobre um turno
real, escreve a asserção flaky que a própria story proíbe. **Emenda E4:** AC1 só no teste de
**contrato**, com chamadas diretas ao fake; sobre turno real valem `doTurno()`/`resposta()`/
`auxiliares()` e nunca `chamadas.length`.

---

## 3. Escopo negativo — confirmado por execução, não por leitura

Reproduzi o incidente inteiro importando `processMessageWithMetadata` e `createFakeSupabase`,
**ambos já exportados**. Nada em `packages/ai/src/chat/pipeline.ts` precisa mudar — nem export. O
§3 do @sm procede. **Emenda E8-a:** o comando da AC8-i passa a comparar contra o **merge-base**, não
contra a ponta de `origin/main` — com a `87-16` e o #428 mergeando no meio, o diff de duas pontas
mostraria o que o main ganhou e o branch não tem, e a AC viraria falso vermelho (ou, pior, um
vermelho "explicado").

**Baselines reconferidos no worktree limpo:** `chat` = **8 arquivos / 202 testes** verdes ·
raiz = **188 arquivos / 2416 passed | 6 expected fail** · `packages/ai` `tsc --noEmit` = **0**.
A story só declarava o baseline de `chat`; o da raiz virou a **emenda E8-b**, porque é ele que
explica o delta do 7º `expected fail`.

---

## 4. 🔴 Posição de produto sobre PRIORIDADE — decisão do Gabriel, com o meu parecer

### 4.1 O argumento do @pm está morto. A conclusão dele sobrevive — por outros motivos.

**Morto:** *"a `87-10` é precisamente a correção que o José pede"*. A `87-10` é o **`W1-2c`, metade
de ESCRITA**, e o cabeçalho dela diz, textualmente: ***"Nada passa a decidir nada nesta story."***
Ela persiste `ofertas_do_sistema` e `afirmado_pela_nicole`; a metade de **leitura** é o `W3-2e`,
**Onda 3**. Ela não toca `parseHour`, não toca `differs`, não toca o ramo `:900-1018`. **Com a
`87-10` em produção, o turno do José sai exatamente igual.** Um argumento falsificado que fica de
pé é reutilizado; este precisa sair do registro.

**Vivo:** as **quatro razões técnicas** do §8.1 do epic (estado que mente · gatilho envenenado ·
`isSlotFree` fail-open · o `88-2` como pré-requisito) **não dependem** do caso do José e continuam
inteiras. **Minha posição: a ORDEM não muda.** Deixar a premissa falsificada inverter a decisão por
default seria o erro simétrico do que estou corrigindo.

### 4.2 A quarta opção existe, é real — e **não é substituta de nada**

Ela também **não é redundante com o Epic 88**, e este é o ponto que ninguém mapeou:

> Com a tool ligada, o pré-fetch determinístico **continua** injetando
> `Visita JÁ confirmada … às 10:00. Se o cliente NÃO pediu para mudar, apenas confirme` — o epic
> **preserva a leitura de propósito** (§2.2.4). Some-se o `tool_choice` **forçado** (§4.1, o lead
> falou de hora) e o `REGRA ABSOLUTA: só afirme dia/horário que esteja NESTE bloco`, e o modelo é
> **obrigado** a chamar `agendar_visita` num turno cujo contexto manda reconfirmar **10:00**.
> É o **F-10 com uma segunda origem** — e pior que o Ronaldo: lá o bloco **recusava**; aqui ele
> **afirma** o horário errado com autoridade.

Ou seja: **o defeito do `parseHour` não desaparece com a tool — ele migra para uma contradição
entre o bloco e a tool.** Consertá-lo é pré-requisito de o `88-5`/`88-7` funcionarem no caso que
motivou tudo. O pedido nº 4 do @sm está certo e eu o ratifico com força maior.

### 4.3 Dimensionamento honesto — a frequência é baixa, e isso muda o COMO, não o SE

Medido em produção (60 dias): **1.683** mensagens de lead · **14** com expressão horária ·
**1** com duas horas na mesma frase — **e ela é o José**. Mesma ordem de grandeza do Ronaldo
(1 ocorrência). Custo quando dispara: 99 ms depois do `NICOLE_SLOT_MISMATCH` a mensagem saiu assim
mesmo, e **67 min** de reparo humano.

Isso me impede de pedir "para tudo e conserta o parser". E há a contra-evidência do @architect, que
é do mesmo lado: **falso positivo de parser é estritamente pior que falso negativo** (*"o 7° andar
me agrada"* → 7h). Um afrouxamento mal desenhado troca 1 erro em 60 dias por vários.

**Minha recomendação, para o @pm redigir e o @architect assinar:**

| | |
|---|---|
| **Item** | **`88-14` — o pré-fetch de remarcação lê a hora do PEDIDO, não a do conflito** (Onda 0, higiene determinística, PR próprio, fora da janela de deploy) |
| **Esforço** | **XS–S** — a correção mora no ramo `activeAppointment` (`pipeline.ts:900-1018`), não no `parseHour` global |
| **Forma defensável** | **estreita, e só ali**: quando existe visita ativa e a hora resolvida **coincide** com o `scheduled_at` existente **e** a mensagem contém outra hora ⇒ prefere a outra. Nada de mexer no `parseHour` global, nada de mais um sufixo no regex |
| **Régua vermelha antes** | as **14** mensagens com expressão horária dos últimos 60 dias como corpus retrospectivo: a correção tem de mudar o veredito de **exatamente 1 de 14**. Mudou 2 ⇒ é falso positivo, reprova |
| **Prioridade** | **P2 por frequência (1/60 d), P1 por classe** — é a **leitura**, o lado que o §2.3 do epic declara competente e que a tool **herda** |
| **Sequência** | **depois da `88-2`**, porque é a `88-2` que entrega a fixture do José e a régua que provam o conserto. Independente do #428, do #429 e da `87-16` |

**E é isto que fecha a pergunta "priorizar a 88-2?": sim, e agora por dois motivos.** Ela é
pré-requisito duro das Ondas 1–3 (§8.1 do epic) **e** virou o instrumento sem o qual o conserto do
José não tem como se provar. Ela sai por PR próprio, não consome janela de 24 h, não depende de
nada da fila. **Não há motivo para segurá-la.**

### 4.4 Emendas que o @pm precisa fazer no epic (o @sm não edita o corpo)

1. **§6.1, linha do `88-2`** — *"Estende `pipeline-scheduling.test.ts`"* aponta para o único dos
   cinco que **não captura nada** (C-3). *(E o §8 estima o item em "~5 linhas, XS", enquanto o §6.1
   diz M — a contradição interna precisa de um lado só.)*
2. **§2.3** — a tabela diz que *"que dia e hora o cliente quis dizer"* é a única pergunta não
   determinística. O caso do José mostra o determinismo **respondendo a essa pergunta hoje, com
   confiança, e errado** — e é a resposta dele que entra no bloco. A linha precisa de emenda.
3. **§2.5** — segundo contra-exemplo medido, e ele **reforça** a tese central: o parser
   **entendeu** dia e hora, só que a hora **errada**. Defeito de **leitura e de autoridade**, não
   de compreensão — mesmo caminho do Ronaldo.
4. **F-10** — a segunda origem descrita no §4.2 acima. É AC do `88-5` (o executor revalida) e do
   `88-7` (o gatilho emite o veredito do turno).
5. **§7 / `PM1`** — o ponteiro *"Suíte (88-2)"* passa a apontar para o item novo do golden set
   (arbitragem R1), senão o `PM1` fica órfão achando que já foi entregue.

---

## 5. Checklist de validação (10 pontos)

| # | Critério | Nota | Observação |
|---|---|---|---|
| 1 | Título e objetivo claros | ✅ | "prova o que a Nicole RECEBEU" — a story inteira em uma frase |
| 2 | Descrição completa | ✅ | Excepcional: 5 fábricas tabeladas, o falso verde documentado no próprio repo, o incidente com carimbo de tempo |
| 3 | ACs testáveis | ⚠️→✅ | **AC6-iii era insatisfazível, AC5-vi reprovaria os controles, AC1 contradizia a M7-proibida.** Corrigidas (E1/E2/E4) |
| 4 | Escopo IN/OUT | ✅ | Cada exclusão com motivo; escopo negativo confirmado por execução |
| 5 | Dependências mapeadas | ⚠️→✅ | Faltava a 6ª fábrica nascida na `87-16` (E6). Fila e colisões corretas |
| 6 | Estimativa | ✅ | M coerente com 3 arquivos novos + 4 migrações; divergência com o §8 do epic é do epic |
| 7 | Valor de negócio | ✅ | Pré-requisito duro das Ondas 1–3 **e** instrumento do conserto do José |
| 8 | Riscos | ✅ | 7 riscos, com o R-1 (esvaziar arquivo em silêncio) atacado por mutação |
| 9 | DoD | ✅ | Exige contagem declarada **antes** e saída colada |
| 10 | Alinhamento com o epic | ⚠️ | Alinhada — mas expõe 5 emendas necessárias no epic (§4.4) |

**Score: 8,5/10.** Nenhum dos defeitos é de concepção; todos são de **precisão de AC**, e todos
estavam na direção certa. Aplicados por mim (autoridade de AC do @po), a story vai para `Ready`
sem retorno ao @sm.

---

## 6. O que o @dev precisa saber antes de começar

1. **Remedir na árvore do dia.** Os números do §4 valem para `a60a1bc6`. Com a `87-16` mergeada, o
   turno faz 1 a 2 chamadas, e `auxiliares()` pode ser `[]` — o que é válido (armadilha 5).
2. **T6 (`nicole-enabled`, separador `join("\n\n")` × `join("")`): eu conferi — é seguro.** As 5
   asserções reais dele são `toContain` de token único (`"Japura"`, `"Solum"`, `"Vind Residence"`)
   e um `length > 1000`; nenhuma atravessa fronteira de bloco. Trocar o separador não muda
   veredito. Confira o `length` depois, por higiene.
3. **REUSE:** se a `87-16` mergear antes, `packages/shared/src/testing/source-scan.ts` já entrega
   `listTestFiles()` (população derivada do `include` do `vitest.config.ts`) e `readRepoFile()`.
   **Filtrar `chat/**` a partir dela, não reescrever glob.** O `vitest.config.ts` da raiz **inclui**
   `__fixtures__/**` — conferido: `packages/ai/src/**/*.test.ts`, sem `exclude` de fixtures. O
   `anthropic-harness.test.ts` **vai rodar**.
4. **A fixture usa a string literal do banco** (E3), com os dois espaços e a crase invertida.

— Pax, equilibrando prioridades 🎯
