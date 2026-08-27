---
name: project-epic87
description: Epic 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) — roadmap por ondas, stories filhas e a story corretiva 87-17 (oferta de horário)
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

**Story 87-17 (Draft, criada 2026-08-27 por @sm a partir de evidência de produção — conversa da
Ana, 26/08/2026):** dois defeitos numa raiz de "a Nicole nega horário que existe":
1. **Defeito A (independente, sem gate):** `freeSlotsInPeriod` (`visit-slot.ts:633`) sempre
   devolve os 3 primeiros horários de um período (12h/12h30/13h para "tarde", 8h/8h30/9h para
   "manhã") — geométrico ao algoritmo, não depende de agenda ocupada. Fix: coletar todos os
   candidatos livres do período (limitado a ~11) e amostrar espalhados (`espalhar`, índices
   `round(i*(N-1)/(k-1))`).
2. **Defeito B (gated pela decisão do @po):** "mais tarde" cai no ramo `day && !time`
   (`pipeline.ts:1128-1131`) que não injeta lista nenhuma — o modelo reafirma a lista velha do
   histórico. `parsePeriodParts` retorna `null` para "mais tarde" DE PROPÓSITO (não é o período
   "tarde", é "depois"). Fix proposto implementa **apenas o sítio nº 7** (`day && period`,
   `pipeline.ts:1120-1127`) da tabela de 7 sítios da 87-10 — escreve `ofertas_do_sistema` só ali,
   lê no "mais tarde" para excluir o que já foi oferecido e mostrar horários novos. Decisão de
   fronteira (i/ii/iii) posta ao @po: recomendação (ii) = implementar só o sítio 7, com as mesmas
   proteções de vazamento em prompt que a 87-10 desenhou (AC6/AC6-b), aplicadas via
   `omitAgendaKeys`/`omitLegacyAgendaKeys` (já existentes) nos 3 sítios de despejo cru
   (`pipeline.ts:2088`, `lead-memory.ts:79`, `haiku-enrichment.ts:90` — nenhum dos 3 filtra
   `agenda_state` hoje, confirmado por leitura de código em 2026-08-27).
   **Consequência a repassar ao @po/dono da 87-10:** se 87-17 (opção ii) subir antes da 87-10, a
   prova "zero registros com os dois campos" da AC1-(ii) da 87-10 deixa de ser verdadeira — a 87-10
   precisará remedir antes de reusar essa prova. Mitigado pelo TTL de 48h (mesmo
   `TTL_AGENDA_STATE_HORAS`) — sem necessidade de migração de dado, só reconferência da premissa.

**Padrão recorrente da 87-4/87-10/87-17:** "regra de corte da Onda 1" = pipeline pode computar e
entregar dados frescos ao modelo (subtração/correção determinística), mas o MODELO nunca ganha
liberdade de decisão nova. Fixture de teste sempre usa a citação literal da conversa real de
produção, com `now` fixado explicitamente (senão o teste muda de resultado por calendário).

**Story numbering:** próxima após 87-17 seria 87-18 (ou 87-9/87-11/87-12 se alguém decidir
preencher os números pulados — confirmar antes de assumir).
