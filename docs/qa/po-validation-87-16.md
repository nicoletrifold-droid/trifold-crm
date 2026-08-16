# Validação @po — Story 87-16 (*"enterrar o MemPalace sem levar a memória da Nicole junto"*)

**Validador:** @po (Pax) · **Data:** 2026-08-16 · **Story:** `docs/stories/87-16-enterrar-o-mempalace-sem-levar-a-memoria-da-nicole-junto.story.md`
**Base:** `HEAD` = `origin/main` = `199a7a84` (0 ahead / 0 behind, conferido com `git fetch` + `rev-list --left-right`) · produção `dsopqkqjkmhytudaaolv`, Management API, **somente `SELECT`** · suíte rodada nesta árvore de trabalho (suja com `87-5 B`, `87-11`, `87-12`)
**Parecer anterior:** `docs/qa/po-validation-87-15.md` (NO-GO de 16/08 — este é o recorte que eu mandei fazer)

---

## VEREDITO: 🟢 **GO condicional** — `Draft` → **`Ready`**

**Placar do checklist: 8,5 / 10.** Nenhum defeito bloqueante. Os três defeitos que eu achei são de
**régua**, não de comportamento: nenhum deles quebra produção, e os três estão corrigidos no corpo da
story, marcados **`[@po 16/08]`** — ACs e escopo são meus por autoridade, e devolver a story para o
@sm por um filtro de `SQL` e dois controles positivos seria churn.

⛔ **A condição não mudou e não pode sumir: o MERGE fica atrás de uma linha do Gabriel ratificando o
`D2-(c)`.** Escrever, implementar e testar podem seguir. Conferi a base disso hoje contra o epic:
`epic-87:1108` diz *"**Recomendação:** (c) agora + (b) na Onda 4"* — **recomendação**. O `D3`, em
`:1114`, traz *"✅ **FECHADA (06/08)**"*. O `D2` não tem esse selo. A assimetria contra a `87-15`
continua justificada por **custo de errar** (`git revert` de um comando × tabela, view, índice e
escritor em produção), não por conveniência. Está no cabeçalho, na §"assimetria" e na DoD. **Fica.**

---

## 1. Os dois pontos que o @sm pediu para eu confirmar — confirmados **executando**

### 1.1 ✅ A correção dele sobre a MINHA correção está certa. Eu estava errado.

Meu parecer da `87-15` §1 dizia *"o ramo `catch` já contém o substituto exato"*. **Não contém.** Rodei
os dois literais em Node, com um resumo de 11 caracteres:

```
vivo   len: 145
catch  len: 174
prop   len: 145
vivo === proposto : true
vivo === catch    : false
delta catch-vivo  : 29 chars
(resumo).len = 8   (informacoes de conversas anteriores).len = 37
--- JSON vivo ---
"\nMEMORIA DO LEAD (resumo):\nRESUMO_AQUI\n\nUse essas informacoes para personalizar o atendimento. Chame pelo nome, referencie o que ja conversaram.\n"
--- JSON catch ---
"\nMEMORIA DO LEAD (informacoes de conversas anteriores):\nRESUMO_AQUI\n\nUse essas informacoes para personalizar o atendimento. Chame pelo nome, referencie o que ja conversaram.\n"
```

**O bloco "Depois" proposto na §"Desenho" é byte-idêntico ao ramo vivo.** A AC1(iii) está calibrada
certa, e o meu *"colapsar no ramo do `catch`"* teria embarcado diff de prompt em 59,3 % dos turnos —
dentro de uma story de subtração. **Aceito a correção sem ressalva.** É exatamente o tipo de coisa
que só aparece quando alguém roda a string em vez de ler o diagnóstico.

**Duas precisões minhas, e elas importam porque a AC é de equivalência byte a byte:**

| | story dizia | medido |
|---|---|---|
| diferença entre os ramos | **+30** caracteres | **+29** (37 − 8) |
| nº de cabeçalhos no código | *"duas versões e só uma roda"* | **três** — falta `loader.ts:77` `MEMORIA DO LEAD (fatos ativos):`, que também **nunca** rodou (`lead_facts` não existe) |

Corrigidos na §2 e na Armadilha 1.

### 1.2 ✅ A mutação dá ZERO. E é **pior** do que a story mede.

Reproduzido, `grep` na árvore:

```
testes que contêm "MEMORIA DO LEAD" : 0
testes que citam memoryContext      : 0
fixtures de pipeline com ai_summary : 6 arquivos, TODOS `ai_summary: null`
```

**Não parei aí.** Executei a mutação da AC1(iv) — apaguei o bloco de injeção inteiro de
`pipeline.ts` e rodei a suíte:

```
 Test Files  190 passed (190)
      Tests  2444 passed | 6 expected fail (2450)
```

**Zero vermelhos.** A AC1(iv) está calibrada certa: o número **é** zero, e a AC exige `0 → ≥ 3`.

**E fui além, porque a AC3 pede a conta antes de rodar.** Executei a **subtração inteira** — imports
32/37/38, colapso do `memoryContext` com a string viva, remoção do `12.5a`, do `12.5c`, e
`rm -rf packages/ai/src/memory` + `memory-extraction.{ts,test.ts}`:

```
 Test Files  187 passed (187)
      Tests  2390 passed | 6 expected fail (2396)
```

**`190 − 3 = 187` e `2.450 − 54 = 2.396`, ao número, com ZERO vermelhos.** Três consequências:

1. O lado subtrativo da AC3 está **fechado antes de o @dev começar**; a única incógnita é `N`/`M`.
2. **A story inteira é invisível para a suíte de hoje**, não só a injeção. Reforça o Risco 3.
3. Foi essa rodada que revelou o `pipeline.ts:1635` (§2.3 abaixo).

*(Árvore restaurada e conferida: `md5` do `pipeline.ts` idêntico ao backup pré-mutação, `git status`
de `packages/` igual ao inicial, suíte de volta a `190 / 2450`.)*

---

## 2. 🔴 Três defeitos novos — medidos, e corrigidos por mim no corpo da story

### 2.1 **AC7(a): `role='assistant'` não é o número de execuções do pipeline. São 476, não 593.**

A story corrigiu o *"exatamente"* da `87-15` — e **recolocou a mesma palavra num numerador ainda
errado**. `role='assistant'` tem **sete escritores** e só um é o pipeline. O `saveMessages`
(`pipeline.ts:2030`) grava **sem `metadata`**; todos os outros escrevem chaves. Partição medida em
produção, mesma janela de 30 dias:

```
role='assistant', 30 d                                                593
  metadata vazio  → saveMessages (pipeline)                           476   80,3 %
  is_transition   → HUMANO, send-message/route.ts:220                  83   14,0 %
  is_media        → send-library-media.ts:548                          29    4,9 %
  relationship_handoff → route-inbound.ts:178                           5    0,8 %
  followup_cron / post_visit_followup                                   0
                                                                     ----
  NÃO-pipeline                                                        117   19,7 %
```

**A contraprova estava no repositório, como da outra vez.** `conversation-history.ts:15`, escrito
pela `87-5` **mergeada**: *"`send-message/route.ts:220` grava a transição do handoff — escrita por
**humano** — com `role: "assistant"`. São **127** mensagens em 60 dias."*

**593 superestima em 24,6 %**, e o número aparece em quatro lugares: a tabela de custo da §1, o
argumento de custo de atraso da §6 (que é o que sustenta a prioridade `P1`), a AC7(a) e a derivação
do `12.5b`. **Corrigido nos quatro**, com a régua junto:

```sql
where role='assistant' and (metadata is null or metadata = '{}'::jsonb)
```

*(Conferido também o que eu suspeitava ser o vazamento e não é: `assistant` de conversa **sem**
`lead_id` = **0** em 30 d. A guarda `if (conversation?.lead_id)` do `12.5c` não perde nada. O
vazamento são os outros escritores.)*

**A AC7(a) passa a pedir os dois números publicados** — 593 bruto e 476 filtrado, com o filtro
escrito — para que a próxima story não herde o numerador errado. **A direção do argumento não muda:
476 Haiku + ~1.831 embeddings + ~1.600 round-trips a cada 30 dias continua pagando o `D88-3`.**

### 2.2 **A AC6 reprova a AC5, na mesma PR.**

O @sm registrou a armadilha certa — *"a catraca reprova a si mesma se o scanner morar dentro do
arquivo de teste"* — e o remédio dele (scanner em módulo importável) **funciona**. Mas ele não viu
que **a AC5 cai na mesma armadilha**, e a AC5 é da mesma PR.

A implementação natural da AC5 lê o **fonte** como texto. `fs.readFileSync(path.resolve(__dirname,
"./pipeline.ts"))` não é `from` / `import()` / `require()` / `vi.mock()` — que é exatamente o que a
catraca procura. **Escrevi esse arquivo e rodei o scanner da AC6 contra a árvore:**

```
populacao: 191
ZERO-IMPORT (catraca AC6 flagraria): 2
  -> packages/ai/src/chat/__po_probe_ac5.test.ts     ← a AC5 escrita do jeito óbvio
  -> packages/ai/src/memory/loader.test.ts
```

**Se o @dev implementar as duas ACs de forma óbvia, a T6 reprova a T5** — e a saída fácil é pôr a
AC5 no ignore da catraca, que é literalmente a semente do próximo `loader.test.ts`, plantada dentro
da PR que o enterra. **Remédio estendido na AC5: o leitor de fonte vai para módulo importável,
nunca auto-exceção.**

### 2.3 **O controle positivo da AC6 estava engolido pela pré-condição.**

A AC pedia *"um `.test.ts` temporário só com `import { it } from "vitest"`, e colar a saída
vermelha"*. **Esse arquivo fica vermelho com ou sem a catraca.** Rodei:

```
 ❯ packages/ai/src/__po_probe_tmp.test.ts (0 test)
 FAIL  packages/ai/src/__po_probe_tmp.test.ts
 Error: No test suite found in file .../__po_probe_tmp.test.ts
 Test Files  1 failed (1)   |   Tests  no tests
```

O vermelho vem do **coletor do vitest**, não da catraca. Um controle positivo que fica vermelho pela
pré-condição não prova a régua — prova o vitest. **A sonda passa a exigir um `it(...)` trivial que
PASSA e nenhum import de módulo do projeto**, para que o único vermelho possível seja o da catraca.

---

## 3. ⚠️ Quatro precisões, também corrigidas no corpo

| # | O que estava | Medido | Onde dói |
|---|---|---|---|
| a | **AC8(a):** *"todo arquivo em `packages/ai/src/` tem call site fora de teste"* | Dos **45** módulos não-teste, **2 não têm** hoje: `__fixtures__/fake-supabase.ts` e `__fixtures__/properties-producao.ts` | **A AC nasce reprovada**, por dois arquivos que a story não possui — e um deles é o fixture que a própria §"Abordagem de teste" manda usar. ⇒ `__fixtures__`/`__mocks__` fora da população; denominador **43 módulos de produção** |
| b | **Tabela "O que sai"** não lista o cabeçalho da seção 12.5 | Depois da remoção inteira, **sobra exatamente 1** `lead_facts` em código de produção: `pipeline.ts:1635` (`// 12.5 Memory system — regex extraction + lead_facts + Haiku batch`) | **A AC2 é régua de `grep`**: sem reescrever esse comentário ela dá **1**, não 0 |
| c | `shouldRunHaiku` em `:1684`; `12.5a` em `1641-1675` | `:1685`; o `}` do `catch` do `12.5a` está em **`:1676`** | Seguir a T2 à letra deixa **chave órfã**. Numa story que insiste em precisão de linha (Armadilha 4), o mapa tem de fechar |
| d | *"124 de 195 leads ativos (63,6 %)"*, sem definição | `124/195` (**63,6 %**) sob *"lead com mensagem `role='user'` em 30 d"*; **`135/357` (37,8 %)** sob *"qualquer mensagem"* | Denominador sem régua é o defeito que a story existe para não repetir. **A definição vai escrita ao lado do número** |

---

## 4. As quatro desconfianças do briefing — respostas diretas

### 4.1 *"A catraca (AC6) resolve a armadilha ou só a menciona?"*

**Resolve — e agora resolve também para a irmã, que era o buraco.** Confirmei que o remédio escrito
(scanner em módulo real, importado) faz o arquivo de teste passar na própria catraca. O que **não**
estava resolvido era (a) a AC5 cair no mesmo laço (§2.2) e (b) o controle positivo ser confundido
(§2.3). Os dois estão fechados no corpo.

**E a catraca tem poder discriminante?** Depois da PR ela fica em **0 de 189** — um guarda que não
pega nada no dia do merge. Isso é aceitável **porque** o controle positivo é obrigatório: é ele que
prova que a régua separa. Sem o controle positivo corrigido, a AC6 seria uma catraca que ninguém
nunca viu fechar.

### 4.2 *"`1 de 190` — a população bate?"*

**Bate, e derivei do jeito certo.** População dos globs do `vitest.config.ts`
(`packages/{ai,shared,web}/src/**/*.test.ts`):

```
populacao derivada dos globs do vitest.config.ts: 190
ZERO-IMPORT de modulo do projeto: 1
  -> packages/ai/src/memory/loader.test.ts
```

**190 é o mesmo número de arquivos que a suíte reporta** (`Test Files 190 passed (190)`), o que é a
verificação cruzada que faltava nas minhas duas primeiras passadas — as que deram **41** e **3**. O
@sm reproduziu por conta própria e chegou ao mesmo lugar pelo mesmo caminho. **A varredura continua
não virando story; a catraca continua sendo o certo.**

### 4.3 *"Na `87-15`, as minhas duas descobertas viraram AC próprias — a redação sustenta?"*

**Sustenta, e em dois pontos ficou melhor do que eu escrevi.**

- **AC3 (índice único):** traz o denominador vermelho **16 de 182 (8,8 %)**, obriga o
  @data-engineer a **escolher entre (a) e (b) e escrever por quê**, exige rodar a chave escolhida
  contra os 182 reais com meta de **0 colisões falsas**, e põe o par `32e0ee55` (`available_day='quinta'`
  em **2026-08-03** e **2026-08-04**) como **fixture obrigatória**, com a frase que fecha o buraco:
  *"Se a fixture não separar os dois, ela não mede a chave — mede o predicado."* Tem controle
  negativo (duplicata verdadeira ⇒ `23505`) e obriga declarar por escrito o comportamento do
  `expires_at` × índice parcial. ✅
- **AC4 (`kind`):** é **por mensagem**, com *"classificar por PREDICADO é **proibido** por esta AC"*
  escrito — que é a parte que eu não tinha travado. Controle positivo **95/95**, negativo **0/5** com
  as cinco declarações reais entrando como **fixture literal** (incluindo *"E o yarden?"*, a mais
  curta e a que mais parece autotexto), denominador **100**, e mutação esperando **≥ 5** vermelhos com
  *"se for zero, a AC não mede nada"*. Manda reusar o `isPendencia` da `87-4` em vez de escrever um
  segundo. ✅
- O sub-item que eu levantei sobre o `resolved_hour` está registrado na AC2 com a consequência certa
  (*"o controle positivo precisa de fixture com dia E hora na MESMA mensagem, senão o positivo nunca
  é exercitado"*). ✅

### 4.4 *"O 'volta restaurado do sha' foi rejeitado — concorda?"*

**Concordo, e a implementação da rejeição está limpa nas duas stories.** A `87-15 §4` diz
explicitamente que o módulo **não volta**, a **T9 revisada** substitui o delete-e-restaura por régua
nova sob a AC10 de lá, e **nenhuma AC de nenhuma das duas depende do sha** — ele fica na PR da
`87-16` como valor de arquivo. Era o ponto: um sha dentro de AC apodrece em rebase, e prometer
restauração de um módulo cujos predicados a própria story reprova é promessa que não se cumpre.

---

## 5. O que eu reproduzi e bateu ao número

**Produção** (Management API, `SELECT`):

```
lf     | lm     | rpc | mig012 | u30  | a30 | a30_sem_lead
-------+--------+-----+--------+------+-----+--------------
null   | null   | 0   | 1      | 1052 | 593 | 0
```

```
leads_com_resumo 263 | leads_total 1788        (14,7 %)
turnos_com_resumo 624 | turnos_total 1052      (59,3 %)   ← o eixo que importa
ativos_com_resumo 124 | ativos_user_30d 195    (63,6 %)
```

**Código e suíte:**

| Alegação | Resultado |
|---|---|
| Suíte baseline | `190 passed (190)` / `2444 passed \| 6 expected fail (2450)` ✅ |
| Os 3 arquivos que saem, pelo executor | `3 passed (3)` / `54 passed (54)` ✅ (`grep -c "it("` daria 55) |
| AC2 no `HEAD` | **24 ocorrências / 9 arquivos** ✅ · árvore suja: 25 / 10 (a fixture da `87-11`) ✅ |
| Fixtures `lead_facts: []` | **5** no `HEAD`, **6** na árvore suja ✅ (bate com o *"5 a 6"* da story) |
| 4 sítios fora de `packages/ai/src/memory/` | 2 imports (`pipeline.ts:37,38`) + 2 docstrings (`summary-grounding.ts:9`, `collected-data.ts:50`) ✅ |
| `memoryContext` no `dynamicSuffix` **sem** `cache_control` | ✅ `pipeline.ts:733` documenta o bloco como sem cache; os 8 estáticos não são tocados |
| Nenhum teste fora dos 3 arquivos depende dos módulos removidos | ✅ — e a subtração inteira confirma (`2396`, zero vermelhos) |
| `Epic 88 · §8` | **8 linhas**, MemPalace é a **6ª**, coluna *"Bloqueia o quê?"* = **"habilitante — latência"** ✅ — **financia, não destrava** |
| `W4-4` deps `D2, W3-1` | ✅ `epic-87:1034` — e a herança do `W3-1` é falsa para o enterro |
| `D2` sem selo de fechada | ✅ `epic-87:1108` recomendação × `:1114` `D3` *"✅ FECHADA (06/08)"* |
| CodeRabbit **Disabled** | ✅ sem chave `coderabbit` em `.aios-core/core-config.yaml` |

---

## 6. Checklist de 10 pontos

| # | Item | Nota | Observação |
|---|---|---|---|
| 1 | Título claro | ✅ | Diz o que faz **e** o que não pode acontecer junto |
| 2 | Descrição completa | ✅ | A §2 é o motivo de a story existir e está medida, não narrada |
| 3 | ACs testáveis | ⚠️ | Padrão altíssimo (mutação + positivo + negativo + denominador em cada uma). **AC7(a) com numerador errado**, **AC8(a) nascendo reprovada**, **AC6 × AC5 colidindo** e **controle positivo da AC6 confundido** — os quatro corrigidos por mim |
| 4 | Escopo definido | ✅ | A §"O que esta story NÃO faz" é modelar; 6 itens, cada um com dono |
| 5 | Dependências mapeadas | ✅ | Herança falsa do `W3-1` cortada, `Epic 88 §8` conferido linha a linha, sem migration, fronteira com `87-11` declarada com o denominador nas duas árvores |
| 6 | Estimativa | ✅ | S, coerente com o que eu executei |
| 7 | Valor de negócio | ⚠️ | Medido em 30 dias, mas o headline estava **24,6 % inflado** (593 → 476). Corrigido nos quatro sítios; a direção do argumento não muda |
| 8 | Riscos documentados | ✅ | O Risco 1 voltou ao sinal certo com o denominador certo. Acrescentei os riscos 8 e 9 |
| 9 | Definition of Done | ✅ | Inclui o gate ⛔ da ratificação do `D2-(c)` antes do merge |
| 10 | Alinhamento com o epic | ✅ | Regra de corte da Onda 1 atendida (nenhum caminho de decisão novo), `D2` lido como recomendação, `W4-4` recortado |

**Placar: 8 ✅ · 2 ⚠️ ⇒ 8,5 / 10.** Acima do corte, sem bloqueante. **GO.**

---

## 7. Encaminhamento

| Para | O quê |
|---|---|
| **@dev (Dex)** | Implementar. **Ler primeiro os blocos `[@po 16/08]`** — são 8 no corpo. Os três que mudam o trabalho: **T2 corta `12.5a` até `:1676`** e reescreve `pipeline.ts:1635`; **a AC5 põe o leitor de fonte em módulo importável** (senão a AC6 a reprova); **a sonda da AC6 tem `it(...)` que passa**. A conta subtrativa da AC3 já está verificada: `187 / 2396` |
| **@qa (Quinn)** | AC7(a) **com o filtro `metadata = '{}'`**, publicando os dois números. AC7(c) mede ou declara não-medível — **não copia** o ~95. Amostra sem efeito é **inconclusiva** |
| **@pm (Morgan)** | Os 7 pedidos da story valem. **Acrescentar:** o custo declarado do MemPalace é **476/30 d**, não 593 — se o número entrar em `Epic 88 · §8` ou no orçamento do `D88-3`, entra corrigido |
| **Gabriel** | **Uma linha ratificando o `D2-(c)`.** É o que destrava o merge. Sim/não de trinta segundos, e a assinatura fica onde está a irreversibilidade — que aqui é quase nenhuma (`git revert`, sem migration, sem dado) |
| **Backlog** | **Achado 7 novo:** `role='assistant'` é papel sobrecarregado com 7 escritores e sem discriminador de primeira classe (só `metadata = '{}'`). Dá **denominador** ao item de modelo de dados que a `87-5` já deixou em `docs/backlog.md`: qualquer métrica futura sobre "turnos da Nicole" que use `role='assistant'` cru erra por ~20 % |

---

## 8. Nota de método

Duas coisas que eu quero guardar desta rodada.

**A primeira é contra mim.** Eu propus *"colapsar no ramo do `catch`"* com o diagnóstico certo e a
string errada. O @sm não aceitou o parecer do @po como fato — **ele rodou as duas strings.** Se
tivesse obedecido, a story teria embarcado +29 caracteres de prompt em 59,3 % dos turnos sob o
título *"subtração pura"*. **Parecer de @po é alegação como qualquer outra, e a régua vale para
quem a escreveu.**

**A segunda é a forma repetida.** Pela segunda story seguida, o defeito não estava no que foi
medido — estava no **numerador**. Na `87-15` era *"14,7 % dos leads"* quando a injeção é por turno.
Aqui é `role='assistant'` = 593 quando o pipeline escreve 476 e **um humano escreve 83 delas**. Nos
dois casos a contraprova já estava no repositório, escrita por uma story mergeada
(`summary-grounding.ts:9` lá, `conversation-history.ts:15` aqui). **Quando um número vira argumento
de prioridade, a pergunta seguinte não é "está certo?" — é "quem mais escreve nessa coluna?".**

— Pax, equilibrando prioridades 🎯
