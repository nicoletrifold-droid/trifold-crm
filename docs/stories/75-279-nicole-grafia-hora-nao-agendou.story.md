# Story 75-279 — Nicole confirmou visita e não agendou: "As 11hrs" não é lido como hora

**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** M (~5 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Dependências:** nenhuma bloqueante. Toca código das stories 75-245 / 75-268 (ambas em prod), sem
  depender de entrega delas.

**CodeRabbit Integration:** Disabled (`coderabbit_integration` ausente do `core-config.yaml`).

---

## Story

Como **cliente que combinou uma visita com a Nicole pelo WhatsApp**, quero que a visita realmente
exista na agenda — hoje a Nicole responde "Anotado, te espero sábado às 11h" e **nada é gravado**,
então ninguém do time sabe que eu vou aparecer.

E como **gestor**, quero que uma confirmação de visita que o sistema não autorizou **grite**, em vez
de morrer em silêncio até alguém abrir a conversa por acaso.

---

## Context

Achado em 06/08 pelo Marcos, na conversa da lead **Maria Oliveira**
(`754f2d4f-fdb4-44b4-b434-189b25922c4e`). Diagnóstico feito contra produção.

### A conversa (trecho real, 06/08 10:03–10:04)

| Quem | Mensagem |
|---|---|
| Nicole | Ótimo, sábado funciona bem! Qual horário fica melhor pra você? Atendemos das 8h às 12h. |
| Cliente | **As 11hrs** |
| Nicole | Deixa eu confirmar se esse horário está disponível no sábado, dia 8.<br>**[SISTEMA: horário 11h do sábado 08/08 — LIVRE]**<br>Anotado, Maria! Te espero sábado, dia 8, às 11h aqui na sede da Trifold… |

Resultado em prod: **zero linhas** em `appointments` para essa lead, `leads.visit_scheduled_at`
nulo, etapa parada em "1º Contato". A data que ela citou estava certa — 08/08/2026 é sábado.

### Causa-raiz 1 — a grafia da hora cai num vão entre duas regras

`packages/ai/src/flows/visit-slot.ts`:

- **`:217`** — regra de hora com marcador: `/\b(\d{1,2})\s*(?:[:h]|\s*horas?)\s*(\d{2})?\b/`. Casa o
  "11" e o "h" de `11hrs`, mas exige **fronteira de palavra** logo depois; vem um "r" e a regra
  desiste.
- **`:177`** — `parseBareHour`, o recurso de número solto criado pela 75-268 (para entender
  "as 10" / "Umas 14"). Tem o lookahead `(?![\d.,:h/])`, que **rejeita de propósito** número
  seguido de "h" — justamente para não pisar na regra acima.

`11hrs` não é aceito por nenhuma das duas. Medido rodando o parser real:

| O cliente escreve | `parseTimeParts(..., {bareNumberAllowed:true})` |
|---|---|
| `as 11h` | ✅ 11:00 |
| `as 11` | ✅ 11:00 |
| `11 horas` | ✅ 11:00 |
| `as 11 hrs` (com espaço) | ✅ 11:00 |
| **`As 11hrs`** | ❌ `null` |
| **`11hs`** | ❌ `null` |
| **`as 11hrs por favor`** | ❌ `null` |

Sem hora, o turno caiu no ramo "tem o dia, falta o horário" (`pipeline.ts:841`), que injeta
*"pergunte qual horário prefere — NÃO afirme nenhum horário"*. `bookableSlotUtc` ficou `null` e o
INSERT de `appointments` (`pipeline.ts:1132`) nunca foi alcançado.

**Prova no banco, não dedução:** o `conversation_state` da conversa **ainda tem**
`visit_pending_date: "2026-08-08"` pendurado. O ramo que agenda apaga essa pendência
(`pipeline.ts:815-817`). Ela continua lá → aquele ramo nunca rodou.

> ⚠️ **Não é regressão da 75-268.** O gate `isVisitSchedulingMode` abriu corretamente
> (`visit_proposed: true`, `visit_pending_date` gravado no turno anterior). O fix da 268 continua
> de pé — ele resolveu o número **pelado**; `11hrs` não é pelado nem tem marcador reconhecido.

### Causa-raiz 2 — a guarda anti-alucinação é cega no caso pior

A Nicole **inventou um bloco `[SISTEMA: …]`** que o pipeline nunca emitiu, fingiu a consulta de
disponibilidade, respondeu "LIVRE" a si mesma e confirmou um horário que o sistema mandou ela
**não** afirmar.

A guarda da 75-245 existe e não pegou, por uma condição em `pipeline.ts:942`:

```ts
if (saidUtc && authorizedSlotUtc) {   // ← só compara quando ALGO foi autorizado
```

Com `authorizedSlotUtc === null` (nada autorizado neste turno), a guarda não roda. Ou seja: ela
cobre *"autorizei 12h e ela falou 10h"* e é **cega** em *"não autorizei nada e ela confirmou do
nada"* — que é exatamente a classe do agendamento fantasma.

### Causa-raiz 3 — o protocolo interno vazou para a cliente

Não existe nenhum sanitizador entre a resposta do modelo e o envio: `assistantMessage`
(`pipeline.ts:931`) vai direto para `saveMessages` (`:1315`) e para o `response` (`:1401`). O texto
`[SISTEMA: horário 11h do sábado 08/08 — LIVRE]` **foi enviado para a cliente no WhatsApp**.

### Evidência de prod que sustenta o AC4 (levantada na validação @po, 06/08)

| Fato medido | Valor | O que prova |
|---|---|---|
| `APPOINTMENT_INSERT_FAILED` em `system_events` | **0** | O INSERT não falhou — **nunca foi tentado**. Fecha a causa-raiz 1 |
| `NICOLE_SLOT_MISMATCH` em `system_events` | **0** desde 07/07 | A guarda da 75-245 **nunca disparou uma vez** em produção |
| `appointments` com `created_by = 'nicole'` | **6** no total (10/06 → **31/07**) | A Nicole não agenda desde 31/07 |
| `appointments` criados por humano | 55 (`broker` 43 · `admin` 12) | O agendamento pela IA é a exceção, não a regra |

Cruzando com a incidência abaixo: **6 visitas criadas contra ~12 confirmadas na conversa** — na
ordem de **1 a cada 3 tentativas** virando visita de verdade. O denominador é heurístico (ver
ressalva), mas a ordem de grandeza é o argumento da story.

> A janela de `system_events` começa em **07/07** (retenção). As 3 visitas da Nicole anteriores a
> essa data não têm evento — não é notificação perdida. Após 07/07: 3 visitas, 3 eventos. Confere.

### Incidência medida em prod (06/08)

- Grafia exata que quebra (`hrs`/`hs`): **2 ocorrências** — Maria Oliveira (06/08, "As 11hrs") e
  **Silvana (24/07, "As 9hs")**. Nenhuma das duas tem `appointment`; a Silvana está em **Perdido**.
- Filtro largo (mensagem da Nicole com "te espero"/"anotado" + lead sem nenhum `appointment`):
  **12 leads desde 10/06, 8 deles hoje em Perdido**. Heurística de texto, com falso positivo
  esperado — serve para dimensionar, não para acusar linha a linha.

### 🔥 Ação operacional fora do código (urgente)

A **Maria Oliveira acredita que tem visita sábado 08/08 às 11h**. Não existe nada na agenda. Alguém
precisa criar a visita e/ou falar com ela **antes de sábado**, independente desta story.

---

## Acceptance Criteria

- [x] **AC1 — grafia colada.** `parseTimeParts` reconhece `hrs`, `hs`, `hr` colados ao número:
      `As 11hrs`, `11hs`, `as 9hs`, `as 11hrs por favor` → 11:00 / 11:00 / 9:00 / 11:00.
- [x] **AC2 — nada do que já funcionava regride.** Continuam válidos: `as 11h`, `as 11`,
      `11 horas`, `as 11 hrs`, `11h30`, `11:00`, `meio-dia`, `3 da tarde`.
- [x] **AC3 — as guardas da 75-268 continuam de pé.** O número **não** vira hora em:
      "não vou poder, tenho compromisso as 15", "só consigo depois das 17", "andar 11", "11 anos",
      "67m²", "dia 10 de agosto". Reusar os casos que já existem em `pipeline.test.ts` /
      testes de `visit-slot`, não escrever gêmeos.
- [x] **AC4 — confirmação não autorizada grita.** Quando a Nicole **afirma** dia+hora único e
      `authorizedSlotUtc` é `null`, emitir evento de erro dedicado (ex.:
      `NICOLE_SLOT_UNAUTHORIZED`) com `lead_id`, o horário afirmado e o trecho da resposta.
      Hoje `pipeline.ts:942` sai calado. Mantém a postura **fail-open** do resto do sistema:
      loga, não derruba o envio.
      - ✅ **Verificado na validação:** `system_events` **não** tem CHECK em `event_type` (só em
        `category` e `level`). Tipo novo entra sem migration — não é o caso da 75-224.
      - ⚠️ Reusar a guarda de ambiguidade que o `detectSlotMismatch` já tem: quando ela **oferece
        opções** ("8h ou 11h") o evento não pode disparar. Se o log encher de falso positivo, o
        ajuste é do filtro — não desligar o evento.
- [x] **AC5 — `[SISTEMA` nunca chega ao cliente.** A resposta é higienizada e o fato é logado
      (é sintoma de alucinação de protocolo, não de formatação).
      - ⚠️ **A higienização é UMA vez, logo após `pipeline.ts:931`** — antes de todos os consumidores.
        `assistantMessage` alimenta 5 caminhos: `detectSlotMismatch` (`:941`), `VISIT_INVITE_PATTERNS`
        (`:970`), `extractCollectedData` (`:995`), o histórico (`:1023`), `saveMessages` (`:1315`) e o
        `response` devolvido (`:1401`). Higienizar só na saída deixa o vazamento **gravado** na
        conversa e polui a extração.
- [x] **AC6 — teste ponta a ponta do `processMessage`.** Com `visit_proposed: true` e
      `visit_pending_date` de sábado, a mensagem `"As 11hrs"` resulta em **INSERT real** em
      `appointments` (fake do Supabase), `visit_pending_date` limpo do `collected_data` e lead
      avançado para "Visita Agendada". Este é o teste que faltava — a 75-268 passou por QA com o
      INSERT nunca exercitado (ver [[project-nicole-agendamento-fantasma]]).
- [x] **AC7 — regressão do caso real completo.** Um teste reproduz a conversa da Maria (dia num
      turno, hora `"As 11hrs"` no seguinte) e falha se `bookableSlotUtc` não for setado.

---

## Fora de escopo

- **Bloquear o envio** da mensagem quando a Nicole afirma horário não autorizado. É mudança de
  postura (o sistema é fail-open em todo lugar) e a decisão é do Marcos — o AC4 entrega a
  visibilidade, que é o que falta hoje. Avaliar em story própria se o log mostrar recorrência.
- **Backfill dos 12 leads** do filtro largo. São em maioria leads já em Perdido; mexer neles é
  decisão comercial, não técnica.
- **Reescrever o parser de horário** para um extrator por LLM. Tentador, mas troca um defeito
  conhecido por uma classe nova de erro num caminho que hoje é determinístico e testável.
- Notificar o corretor quando a Nicole agenda (já existe hoje pelo `APPOINTMENT_CREATED`).

---

## Riscos

- **O AC1 mexe na regex que a 75-268 acabou de calibrar.** O risco real não é `hrs` virar hora — é
  afrouxar a fronteira e reabrir o agendamento fantasma da 75-245. Por isso o AC3 é obrigatório e
  deve rodar **antes** de o AC1 ser dado como pronto.
- **Consertar a grafia não fecha a classe do defeito.** Amanhã aparece "onze horas", "11 e meia",
  "11:00hrs". O que fecha a classe é o AC4 — a confirmação sem autorização parar de ser silenciosa.
  Se for preciso cortar escopo, cortar o AC1 antes do AC4.

---

## Sequência de implementação (@dev)

1. **Testes primeiro** dos AC1/AC2/AC3 em `visit-slot.test.ts` — vermelhos antes da correção.
2. **AC1** no parser. Rodar a suíte inteira de `visit-slot` + `pipeline` antes de seguir: é aqui que
   mora o risco de reabrir a 75-245.
3. **AC4** e **AC5** no `pipeline.ts` — independentes entre si e do passo 2.
4. **AC6/AC7** por último: o teste ponta a ponta é o mais caro e serve de rede para os anteriores.

Passos 2 e 3 podem ir em paralelo; o 4 depende dos dois.

## Notas para o @dev

- O parser é puro e já tem suíte (`packages/ai/src/flows/visit-slot.ts` + testes). Começar por lá,
  com os casos do AC1/AC2/AC3 escritos **antes** da correção.
- Sugestão de direção para o AC1 (não é prescrição): trocar a exigência de `\b` no fim da regra
  `:217` por um lookahead que aceite o sufixo de hora, em vez de mexer no `parseBareHour` — o
  `parseBareHour` é onde moram as guardas anti-fantasma da 268 e é o lugar mais caro de errar.
- O AC6 provavelmente exige um fake de Supabase com encadeamento (`from().insert().select()`) para
  `processMessage`. Ver o fake que a 75-270 montou — e o alerta registrado lá:
  **o `fakeDb` daquele teste ignora `.eq()`**, então não dá para confiar nele para asserção de
  filtro sem ajustar ([[project-nicole-envio-midia-proativo]]).
- Guardrails da Nicole vivem **também** no banco (`agent_prompts`), que mascara o código. Se a
  correção envolver instrução de prompt, editar os dois ([[project-nicole-guardrails-db]]).

### File List
| Arquivo | Mudança |
|---|---|
| `packages/ai/src/flows/visit-slot.ts` | `parseHour`: marcador aceita `hrs`/`hs`/`hr` colados, com `(?![a-z])` segurando o afrouxamento · `countTimeMentions`: mesmo sufixo, para a detecção de ambiguidade não cegar (AC1) |
| `packages/ai/src/flows/visit-slot.test.ts` | +7 casos: AC1, AC2, AC3 e o slot real da Maria (AC7) |
| `packages/ai/src/chat/pipeline.ts` | `detectAffirmedSlot` extraída de `detectSlotMismatch`; ramo novo quando não há slot autorizado → `NICOLE_SLOT_UNAUTHORIZED` (AC4) · `stripSystemBlocks` aplicada logo após extrair a resposta → `NICOLE_SYSTEM_BLOCK_LEAK` (AC5) |
| `packages/ai/src/chat/pipeline.test.ts` | +9 casos para `detectAffirmedSlot` e `stripSystemBlocks` |
| `packages/ai/src/chat/__fixtures__/fake-supabase.ts` | **novo** — fake do PostgREST com filtros reais (`eq`/`in`/`gt`/`lt`/`is`/`or`) |
| `packages/ai/src/chat/pipeline-scheduling.test.ts` | **novo** — AC6/AC7 ponta a ponta no `processMessage` |

## Dev Notes

**O que a correção do parser realmente foi.** A regra do marcador exigia fronteira de palavra depois
do "h"; em `11hrs` vinha um "r". Agora o marcador aceita o sufixo (`h`, `hr`, `hs`, `hrs`) e é
seguido de `(?![a-z])` — é esse lookahead que impede o afrouxamento de transformar "11 hoje" em
11:00. Tem teste para isso (AC3).

**A parte que quase passou batido.** Ensinar o parser a ler `8hrs` sem ensinar o `countTimeMentions`
teria reaberto a 75-245: "8hrs ou 9hrs" contaria ZERO horários, `isAmbiguousSlotText` devolveria
false, e um texto de DUAS opções viraria slot único e agendável. Os dois regexes andam juntos.

**O harness (AC6) foi verificado contra o defeito.** Depois de verde, o parser foi revertido e o
teste rodado de novo: **3 dos 5 casos falharam**, inclusive o do INSERT. Um fake que passa pelo
motivo errado seria pior que nenhum — em especial depois do alerta da 75-270 sobre `fakeDb`
ignorando `.eq()`. Aqui os filtros são aplicados de verdade, e isso apareceu na prática: o primeiro
`seed` usava um `stage_id` inventado e o guard só-avança da `advanceToVisitaAgendada` **recusou**
o avanço, como deveria.

**`detectSlotMismatch` foi preservada, não substituída.** Ela continua com a semântica exata da
75-245 (só dispara com slot autorizado) e agora delega o parse à `detectAffirmedSlot`. Quando há
autorização, o caminho é byte-idêntico ao anterior.

## QA Results

Gate: **PASS com CONCERNS** — `docs/qa/gates/75.279-nicole-grafia-hora-nao-agendou.yml`

1.776 testes verdes (144 arquivos), type-check limpo em `ai` e `web`.

**A revisão encontrou 2 defeitos no próprio diff, os dois corrigidos antes do gate:**

1. 🔴 **A higienização do AC5 podia calar a Nicole.** Se a resposta inteira fosse o bloco vazado, a
   limpeza deixaria string vazia — e o webhook envia `text: { body: response }` **sem guarda de
   vazio** (`whatsapp/route.ts`), com a Graph API recusando corpo vazio. O AC5 teria trocado um
   vazamento por uma mensagem perdida. Corrigido com fala de reserva neutra, que não afirma dia nem
   horário, coberta por teste ponta a ponta.
2. 🟡 **`stripped` saía da suspeita, não da remoção.** A flag ficava `true` só porque o texto continha
   `[SISTEMA`. Uma variante fora do regex (`[SISTEMAS: …]`) vazaria e ainda seria reportada como
   higienizada. O `` saiu (a variante que o modelo inventa não é previsível) e a flag passou a ser
   a comparação `cleaned !== text`.

**Concerns registrados (não bloqueiam):**

- **`NICOLE_SLOT_UNAUTHORIZED` não tem histórico.** Fora do modo agendamento, `authorizedSlotUtc` é
  sempre null — qualquer afirmação de dia+hora dispara. Medir o volume nos primeiros dias; se houver
  ruído, apertar o filtro, não desligar o evento.
- **Nada bloqueia o envio.** Confirmação alucinada continua chegando ao cliente; o ganho é saber no
  mesmo minuto. Decisão de produto, fora de escopo.
- **`SANITIZED_EMPTY_FALLBACK` é copy hardcoded** enquanto o resto da fala da Nicole vive em
  `agent_prompts` (banco). Ver [[project-nicole-guardrails-db]].
- **Build:** `@trifold/shared` falha no lint e no type-check (`TS2688`, `@types/node` ausente).
  Verificado com `git stash -u`: **falha igual com a árvore limpa**. É ambiente, não regressão — mas
  o @devops vai esbarrar nisso no CI.

## Change Log
| Data | Mudança |
|---|---|
| 2026-08-06 | Achado pelo Marcos na conversa da Maria Oliveira. Causa-raiz confirmada em prod (`conversation_state` com a pendência intacta) e parser reproduzido com a frase real. Story criada (@sm) |
| 2026-08-06 | **@qa — PASS com CONCERNS (8/10).** 2 defeitos achados no diff e corrigidos: mensagem vazia após higienização (alto) e flag de vazamento imprecisa (médio). +3 testes. Status → InReview mantido até o push |
| 2026-08-06 | **@dev** — implementado. 1.773 testes verdes (144 arquivos), type-check do pacote `ai` limpo. Harness validado contra o defeito (revert do parser → 3 falhas). Status → InReview |
| 2026-08-06 | **@po — GO (9/10).** Draft → **Ready**. Acrescentados: campos de executor, dependências, evidência de prod do AC4 (guarda nunca disparou; `APPOINTMENT_INSERT_FAILED` = 0), sequência de implementação. AC4 e AC5 endurecidos (ponto único de higienização; `event_type` sem CHECK verificado) |
