# Story 75-355 — O lead que nunca escreveu era descartado pelo cron, e é justamente quem só o template alcança

**Status:** InReview — gate PASS · sem migration
**Tipo:** População inteira excluída por uma linha de guarda
**Epic:** 75 — CRM Trifold
**Complexidade:** S (~2 pts — 1 função pura, 1 guarda invertida, criação de conversa na entrega)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Depende de:** 75-353 (o template) — já em produção (`238d241f`).

## Como apareceu

Depois de ligar o template na etapa Atendimento (decisão do Marcos: `abertura_interesse_prioridades`),
fui medir **quantas mensagens sairiam na run seguinte** antes de ela acontecer. A resposta foi **zero** —
e o cooldown não era o motivo:

| Recorte (etapa Atendimento, 20/08) | Leads |
|---|---|
| Na etapa | 125 |
| Sem contato há ≥ 3 dias (gatilho da regra) | **47** |
| ↳ em cooldown de 48h | 10 |
| ↳ **sem NENHUMA conversa registrada** | **37** |
| ↳ em opt-out | 0 |
| **Elegíveis** | **0** |

## O defeito, em uma linha

```ts
if (!conversationId) continue   // sem conversa → lead descartado
```

Lead que nunca escreveu não tem registro em `conversations`. E é exatamente ele que **só** o template
alcança: quem nunca mandou mensagem tem a janela de 24h fechada por definição.

Quem são os 37 — não é lixo antigo:

| Origem | Leads | Período | Telefone |
|---|---|---|---|
| `meta_ads` | 21 | 08/06 a 19/07 | 21/21 |
| `other` | 11 | 08/06 a **13/08** | 11/11 |
| `website` | 3 | 03/07 a 14/07 | 3/3 |
| `broker_sponsored` | 2 | 21/07 a 27/07 | 2/2 |

Leads de tráfego pago que entraram, foram para Atendimento e **ninguém falou com eles** — nem humano,
nem Nicole. O follow-up nunca os alcançou, e a 75-353 sozinha não mudaria isso.

## AC1 — Sem conversa deixa de ser descarte, mas a liberação é ESTREITA

`podeFollowUpSemConversa` (função pura, testada) libera só quando **a etapa tem template** E o lead
**passou do `nicole_takeover_days`** — o limiar da mensagem, não o do alerta.

**Por que estreita:** liberar em geral faria o ramo de `alert_broker` valer para os 37 leads de uma vez.
O histórico de 30 dias tem 224 alertas nessa etapa; somar 37 de golpe seria rajada de notificação ao
corretor — consertar uma coisa estragando outra. Com a guarda, esses leads só entram pelo caminho da
mensagem.

## AC2 — Sem mensagem, o limiar usa o último contato real

Sem conversa não há `lastMessage`, e o cálculo de "dias sem contato" caía nele. Agora a referência é
`last_contact_at` → `created_at` do lead, nessa ordem. Conversa que **existe mas está vazia** continua
sendo descarte: é estado inconsistente, não lead novo.

`brokerSentRecently` com lista vazia é `false` — sem conversa não há mensagem de corretor, então o
follow-up segue, que é o correto.

## AC3 — A conversa nasce na ENTREGA, não na tentativa

Quando o template é entregue a um lead sem conversa, a conversa é criada ali (mesmo padrão do botão
manual "Iniciar atendimento") e a mensagem é gravada nela — assim a resposta do lead cai no fluxo normal
da Nicole.

**Só na entrega:** conversa criada por tentativa que falhou seria conversa fantasma na tela do corretor.
Falha na criação grita (`FOLLOWUP_CONVERSA_NAO_CRIADA`) sem derrubar a run — a mensagem já foi entregue e
não há como desfazer.

## Dev Agent Record

- [x] AC1 — `podeFollowUpSemConversa` + guarda invertida no laço.
- [x] AC2 — referência de contato com fallback; conversa vazia segue descartada.
- [x] AC3 — criação da conversa na entrega + log de falha.

### Decisões de implementação

- **Função pura em vez de condição inline.** A decisão é a parte que erra caro (liberar demais = rajada
  de alerta), e o projeto não tem teste de rota. 4 testes cobrem os quatro quadrantes.
- **Nada de backfill de conversa.** Criar conversa para os 37 leads agora encheria a tela do corretor de
  conversas vazias. Cada uma nasce quando a mensagem sai.

### Validações

`npx vitest run` 233 arquivos / **2.828 testes** ✅ (4 novos) · `type-check` 8/8 ✅ · `eslint` 0 erros
(3 warnings pré-existentes).

## File List

- `packages/web/src/lib/followup/template-fallback.ts` — AC1
- `packages/web/src/lib/followup/template-fallback.test.ts` — 4 testes novos
- `packages/web/src/app/api/cron/followup/route.ts` — AC1/AC2/AC3
- `docs/qa/gates/75-355-followup-sem-conversa.yml` *(novo)*

## Verificar depois do deploy

1. **O alcance mudou** — na run seguinte, `entregas_por_template` no recibo deve deixar de ser 0.
2. **Conversas nascendo só com mensagem:**
   ```sql
   select c.created_at, (select count(*) from messages m where m.conversation_id=c.id) as msgs
     from conversations c where c.created_at > now() - interval '1 day' order by 1 desc;
   ```
   Nenhuma linha com `msgs = 0`.
3. **Nenhuma rajada de alerta:** `select count(*) from follow_up_log where type='alert_broker' and created_at > now() - interval '3 hours';`
   deve seguir na casa de unidades, como hoje — não 37.
