# Story 75-249 — A visita segue o dono do lead em QUALQUER troca

**Status:** Done
**Tipo:** Fix de comportamento (completa a 75-247)
**Epic:** Agendamento da Nicole
**Complexidade:** S

## Contexto

Furo na 75-247, pego pelo Marcos em 31/07/2026 poucos minutos depois do deploy,
olhando a Agenda:

> "O Ailton já está com o corretor Matheus, não mais com a Thielly. Vai mudar
> aqui na agenda o nome de quem irá atender? Irá aparecer na agenda do novo
> responsável? Ele receberá as notificações?"

Resposta era **não** para as três. Verificado no banco:

| | |
|---|---|
| dono do lead | Matheus Barbosa Rodrigues (desde 31/07 10:05 BRT) |
| corretor na visita | **Thielly** (o anterior) |
| como trocou | `POST /api/leads/[id]/assign` (activity `broker_assigned`) |

A 75-247 só movia visita **com dono** no endpoint de **transferir**. Nos outros
caminhos ela era `claimOrphanVisitsForBroker` — que por desenho só adota visita
**órfã** (`broker_id IS NULL`). Como a visita do Ailton já tinha a Thielly, todos
esses caminhos davam no-op. O princípio que o Marcos já havia definido ("o novo
responsável recebe a visita, as notificações e o histórico") valia para o botão
de transferir e não valia para reatribuir — distinção que não existe na cabeça de
quem usa, e não deveria existir no código.

**Consequência concreta, não teórica:** `appointment-whatsapp-reminders` e
`appointment-email-reminders` leem `users!broker_id` **da visita**, não o dono do
lead. O lembrete da visita de sábado 01/08 10h iria para a **Thielly**, e o
Matheus — que atende o lead — não receberia nada.

Dado corrigido à mão em prod antes desta story (visita → Matheus, com
`metadata.reason` e activity). Auditoria confirmou **nenhuma outra** visita
futura fora de sincronia.

## Critérios de aceite

- **AC1** — Dado um lead com visita futura do corretor A, quando o lead passa a
  ser do corretor B por **qualquer** caminho (roleta, bolsão, `assign`, `PATCH`,
  transferência), então a visita passa a ser de B.
- **AC2** — Dado o mesmo cenário, quando a visita muda de mão, então **B é
  avisado** ("Lead novo COM visita marcada") e **A é avisado** ("Visita saiu da
  sua agenda"), e a activity registra de/para.
- **AC3** — Dado que a visita já é do dono atual, quando qualquer caminho roda,
  então nada muda e ninguém é notificado (idempotente).
- **AC4** — Visita **passada**, **cancelada**, **de outro lead** ou
  **`team='imob'`** não é tocada (IMOB: dono é a imobiliária).
- **AC5** — Uma única função para a regra ("a visita futura pertence a quem
  atende o lead"), chamada nos 6 caminhos — sem duas semânticas concorrentes.
- **AC6** — Best-effort: falha aqui não derruba distribuição nem atribuição.
- **AC7** — Zero regressão: suíte completa verde, `tsc` limpo, lint 0 erros,
  build OK.

## Escopo

**IN:**
- `claim-orphan-visits.ts` → **`sync-visit-owner.ts`**:
  `claimOrphanVisitsForBroker` + `transferHouseVisitsToBroker` viram
  **`syncFutureVisitsWithLeadOwner`**. Duas funções com semânticas diferentes era
  a origem do bug; agora é uma regra só.
- Os 6 call sites passam a usar a função unificada.
- `sync-visit-owner.test.ts` — 10 testes (o antigo "não rouba visita com dono"
  deixou de ser verdade **de propósito** e virou "leva a visita ao novo dono").

**OUT (decidido):**
- Visita `team='imob'` (dono é a imobiliária).
- Visita criada por um gestor **para outro corretor** num lead de terceiro: numa
  troca de dono ela também vai para o novo responsável. É a consequência
  consciente de "a visita é de quem atende o lead"; se algum dia precisar de
  visita "de fora" fixa, isso pede campo próprio, não exceção escondida.
- Notificar o **cliente** que mudou o corretor: não foi pedido.

## Dependências

Completa a 75-247 (já em prod, commit `f3f0d17d`). Nenhuma migração.

## Riscos

- **Renomeação de arquivo/função:** `tsc` limpo e busca por referências órfãs
  zerada garantem que não sobrou call site antigo.
- **Notificação a mais numa troca frequente:** se um gestor ficar remanejando o
  mesmo lead, cada troca gera aviso para os dois lados. É o comportamento certo
  (a agenda de duas pessoas mudou), e o `moved_out` só sai quando havia dono.

## QA Gate — PASS

- 10 testes cobrindo AC1–AC4 e AC6, incluindo o caso real (`assign` de Thielly
  para Matheus → visita move, `inherited` para Matheus e `moved_out` para
  Thielly, na ordem).
- Suíte completa: **1410 testes, 124 arquivos, verde**. `tsc` limpo em `web`,
  lint 0 erros (18 warnings pré-existentes), `npm run build` OK.
- Busca por `claimOrphanVisitsForBroker` / `transferHouseVisitsToBroker` /
  `claim-orphan` no código de produção: **zero** ocorrências.

## Deploy — 31/07/2026 ✅

Merge PR #328 → commit `861bd2f3` → produção `READY` (Vercel, ~10:52).
`crm.trifold.eng.br` respondendo 200; zero evento `error`/`warn` nos 10 min
seguintes.

Estado conferido em prod depois do deploy:

| checagem | resultado |
|---|---|
| visitas futuras `house` fora de sincronia com o dono do lead | **0** |
| corretor na visita do Ailton (sáb 01/08 10h) | **Matheus Barbosa Rodrigues** |
| `NICOLE_SLOT_MISMATCH` acumulado (75-245) | **0** |

Fica em observação de campo (não é pendência de código): a próxima reatribuição
real de lead com visita marcada — o nome troca na Agenda, o novo corretor recebe
"Lead novo COM visita marcada" e o antigo recebe "Visita saiu da sua agenda".
