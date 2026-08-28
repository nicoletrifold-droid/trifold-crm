---
name: project-epic87
description: Epic 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) — roadmap por ondas, stories filhas e a story corretiva 87-17 (oferta de horário; arbitragem do @po = opção (i), sem ofertas_do_sistema)
metadata:
  type: project
---

Epic 87 corrige a Nicole (agente WhatsApp) para parar de inventar fatos de agenda — em ambas as
direções: **disponibilidade que não existe** (agendamento fantasma, 75-245/87-4) e **indisponibilidade
que existe** (a Nicole nega horário livre, 87-17).

**Roadmap por ondas** (`docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md` §7):
- Onda 0 — verdade/visibilidade (não muda comportamento). `W0-0` é BLOQUEANTE de tudo.
- Onda 1 — "Estancar": regra de corte rígida — **nenhuma story pode adicionar caminho de decisão
  novo da Nicole**. Itens: `W1-2a/W1-3a` (remediação de dados), `W1-2b` (= Story 87-4, âncora
  temporal), `W1-2c` (= Story 87-10, escrita de `ofertas_do_sistema`/`afirmado_pela_nicole` —
  **dividido**: leitura fica na Onda 3, `W3-2e`), `W1-3b`, `W1-1` (histórico = cauda), `W1-7`
  (histórico inclui fala do corretor), `W1-6` (= story `87-11`, ainda sem arquivo, remove despejo
  cru de `collected_data` do prompt), `W1-4`, `W1-5`.
- Onda 2 — rede de segurança (harness). Onda 3 — enforcement determinístico (`W3-2e` lê
  `ofertas_do_sistema` para resolver o "Ok" do lead). Onda 4 — tool use, absorvida pelo Epic 88.

**Stories existentes (até 2026-08-27):** 87-0, 87-1 a 87-8, 87-10, 87-13, 87-14, 87-15, 87-16.
**87-9, 87-11, 87-12 são citadas no texto de outras stories mas NÃO existem como arquivo** — ficar
atento antes de assumir que existem.

**Story 87-10 (`W1-2c`, metade de ESCRITA):** Status `Ready`, **não implementada, não implantada**
(confirmado em 2026-08-27 por grep: `agenda_registro`/`RegistroAgenda` não existem no código).
Desenha 7 sítios de escrita de `ofertas_do_sistema` dentro de `pipeline.ts` (tabela em §2 do
Desenho dela) e o `afirmado_pela_nicole` (write-only, precisão 71,9%/81,3%). Ordem de deploy rígida:
`87-12 → 87-5 A → 87-5 B → 87-11 → 87-10`. Decisão de desenho ratificada pelo @po (10/08): os dois
campos devem sair de `AgendaState` para uma chave irmã `agenda_registro` em `collected_data` — mas
**isso ainda não foi feito**; hoje `ofertas_do_sistema`/`afirmado_pela_nicole` continuam declarados
DENTRO de `AgendaState` (`agenda-state.ts:125-126`), reservados, sem leitor nem escritor.

**Story 87-17 (Fatia 1 em PR #517 — aguardando; criada 2026-08-27 por @sm a partir de evidência de
produção — conversa da Ana, 26/08/2026):** dois defeitos numa raiz de "a Nicole nega horário que
existe":
1. **Defeito A (Fatia 1, independente, sem gate):** `freeSlotsInPeriod` (`visit-slot.ts:633`)
   sempre devolvia os 3 primeiros horários de um período (12h/12h30/13h para "tarde", 8h/8h30/9h
   para "manhã") — geométrico ao algoritmo, não depende de agenda ocupada. **Implementado:**
   coleta os candidatos livres do período e amostra espalhado (`espalhar`, índices
   `round(i*(N-1)/(k-1))`), com `Promise.all` no chamador. Commit `1454d4ca`, PR #517.
2. **Defeito B (Fatia 2, ainda não implementada):** "mais tarde" cai no ramo `day && !time`
   (`pipeline.ts:1128-1131`) que não injeta lista nenhuma — o modelo reafirma a lista velha do
   histórico. `parsePeriodParts` retorna `null` para "mais tarde" DE PROPÓSITO (não é o período
   "tarde", é "depois").

**⚠️ ARBITRAGEM DO @po (2026-08-27, `docs/qa/po-validation-87-17.md`) — DECIDIDA, NÃO RELITIGAR.**
A recomendação original do @sm era a **opção (ii)**: escrever `ofertas_do_sistema` no sítio nº 7 e
ler no "mais tarde" para excluir o que já foi oferecido. **O @po derrubou e escolheu a opção (i):
a 87-17 não escreve NEM LÊ `ofertas_do_sistema`.** Dois motivos, o primeiro decisivo:

- **`filter(!jaOfertados)` é "ainda não oferecido", não "mais tarde".** As duas coisas só coincidem
  enquanto o Defeito A existir. Depois do Defeito A, `espalhar` sempre inclui o último livre do
  período, então a diferença de conjuntos vira o **MEIO**: a Nicole responderia "mais tarde não
  tem?" com `12h30, 13h30, 15h`. E a AC5 original ficaria **verde** em cima dessa falsidade.
- Governança: a leitura é `W3-2e`/Onda 3 por arbitragem anterior do @po, e a `AC1` da 87-10
  **remove** o campo de `AgendaState` — a (ii) escreveria num campo marcado para deleção.

**A Fatia 2 saiu sem campo novo:** `freeSlotsInPeriod` recalculada **no turno do "mais tarde"**,
com `day` herdado (`visit-slot.ts:424`) + `agenda_state.periodo` — campo vivo da 87-4, escrito hoje
e sem leitor. **Implicação para a 87-10: NENHUMA** — a premissa de "zero registros" da `AC1-(ii)`
segue intacta (registrado no Change Log v0.3 da 87-10).

**Lição para o @sm:** ao propor reuso de campo de outra story, verificar se o filtro proposto
significa de fato o que a frase do lead pede — e se a AC escrita seria capaz de reprovar a versão
errada. A AC5 original não era.

**Padrão recorrente da 87-4/87-10/87-17:** "regra de corte da Onda 1" = pipeline pode computar e
entregar dados frescos ao modelo (subtração/correção determinística), mas o MODELO nunca ganha
liberdade de decisão nova. Fixture de teste sempre usa a citação literal da conversa real de
produção, com `now` fixado explicitamente (senão o teste muda de resultado por calendário).

**Story numbering:** próxima após 87-17 seria 87-18 (ou 87-9/87-11/87-12 se alguém decidir
preencher os números pulados — confirmar antes de assumir).
