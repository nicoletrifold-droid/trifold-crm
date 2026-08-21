# Story 75-363 — Push para ninguém é invisível: `sendPushToUser` não deixa rastro

**Status:** InReview — implementada · testes/lint/type-check verdes · sem migration, sem env nova
**Tipo:** Observabilidade — telemetria de entrega de push em `system_events`
**Epic:** 75 — CRM Trifold
**Complexidade:** XS (~1 pt — 1 arquivo de produção, 1 de teste)
**Fluxo:** @sm → @po → @dev → @qa → @devops

## De onde veio

Conferência pós-deploy da 75-361 (21/08): a escalação de preço do lead Frederico Lemos disparou
certinho — dedupe ok, evento `PRECO_INSISTENCIA_ESCALADA` 1× — e o push foi para **ninguém**,
porque a Thielly (dona do lead) tem **0 linhas em `push_subscriptions`**. O `sendPushToUser`
retornou sem erro, sem log, sem rastro. Só descobrimos porque a auditoria manual cruzou as tabelas.

É a **terceira** vez que essa família de falha silenciosa nos morde:

1. Chave VAPID com `\n` → push **morto por 81 dias** sem um erro logado (75-355);
2. Relatório diário do diretor sem rastro de envio no banco (75-345, anotado como risco);
3. Agora: destinatário sem subscription = push no vácuo, indistinguível de push entregue.

E o `sendPushToUser` é o canal de **19 pontos de chamada**: escalação de preço, SLA, roleta,
bolsão, transferência, aprovações, billing, relacionamento. Qualquer um deles pode estar falando
com o vácuo agora, e não temos como saber sem query manual.

## O que muda

`sendPushToUser` passa a deixar **exatamente 1 evento em `system_events` por chamada** (via
`logEvent`, o mesmo caminho dos ~200 outros pontos do app), classificando o desfecho:

| evento | nível | quando |
|---|---|---|
| `PUSH_VAPID_AUSENTE` | error | VAPID não configurada — o modo de falha dos 81 dias vira alarme |
| `PUSH_SEM_SUBSCRIPTION` | warn | destinatário sem subscription (o caso Thielly); inclui `query_error` se a consulta falhou |
| `PUSH_SEM_ENTREGA` | warn | havia subscriptions e **zero** entregou (status codes no metadata) |
| `PUSH_ENVIADO` | info | ≥1 subscription recebeu; contadores de expiradas/falhas juntos |

Metadata comum: `user_id`, `title` (identifica a origem — "quer saber o valor", "Lead sem
atendimento", etc.), e contadores. Volume: 1 linha por push ≈ dezenas/dia, nada perto do que
`system_events` já recebe.

## ACs

**AC1 — Sem subscription vira sinal.** 0 linhas em `push_subscriptions` para o `userId` →
`PUSH_SEM_SUBSCRIPTION` (warn) com `user_id` e `title`. Erro na própria consulta não se disfarça
de "sem subscription": vai em `metadata.query_error`.

**AC2 — VAPID ausente vira alarme.** `ensureVapid()` falso → `PUSH_VAPID_AUSENTE` (error). Hoje é
`return` silencioso — exatamente o buraco onde o push ficou 81 dias morto.

**AC3 — Zero entrega é distinguível de entrega.** Subscriptions existiam mas nenhuma recebeu →
`PUSH_SEM_ENTREGA` (warn) com os status codes. Entregou a ≥1 → `PUSH_ENVIADO` (info) com
`enviados`/`expiradas`/`falhas`.

**AC4 — Comportamento de envio INALTERADO.** Mesma assinatura, mesmo retorno (`void`), continua
**nunca lançando** (vários chamadores dão `await` sem catch dentro de cron). A limpeza de
subscription 410 continua. Logging é best-effort: se o logger falhar, o push não sofre.

**AC5 — Sem migration, sem env.** `system_events` e `logEvent` já existem.

## Fora de escopo (de propósito)

- Alertar/notificar alguém sobre pushes no vácuo — isso é leitura dos eventos, decisão futura.
- UI de diagnóstico de subscriptions por usuário.
- Registrar push em tabela própria de notificações — `system_events` basta para o rastro.
- Migrar chamadores para `logEventOnce` — push não é "última escrita antes do response" em nenhum
  dos 19 pontos (todos fire-and-forget ou aguardados no meio de cron).

## Dev Agent Record

**Branch:** `75-363-rastro-push` (worktree `~/tmp_claude/wt-75-363`)

| arquivo | o quê |
|---|---|
| `packages/web/src/lib/server/push-service.ts` | classifica o desfecho e emite 1 evento por chamada; corpo em try/catch (garantia de nunca lançar vira explícita) |
| `packages/web/src/lib/server/push-service.test.ts` | novo — cobre os 4 desfechos + 410 + garantia de não lançar |

**Como conferir depois do deploy**

```sql
select created_at at time zone 'America/Sao_Paulo' as quando, event_type, level,
       metadata->>'user_id' as user_id, metadata->>'title' as title, message
from system_events
where event_type in ('PUSH_ENVIADO','PUSH_SEM_SUBSCRIPTION','PUSH_SEM_ENTREGA','PUSH_VAPID_AUSENTE')
order by created_at desc limit 50;
```

Esperado: todo `PRECO_INSISTENCIA_ESCALADA`, SLA, roleta etc. com um evento `PUSH_*` par. Enquanto
a Thielly não ativar as notificações, os pushes dela devem aparecer como `PUSH_SEM_SUBSCRIPTION` —
é o rastro provando que funciona.

## QA Results

**Verdict: PASS** (com 1 observação)

1. Code review ✓ — segue o padrão `logEvent` dos ~200 pontos do app; 1 evento por chamada.
2. Testes ✓ — 8 novos, todos os ACs cobertos; suíte completa 2885 passando (239 arquivos).
3. ACs ✓ — os 4 desfechos classificados; contrato "nunca lança" fixado em teste.
4. Regressões ✓ — assinatura/retorno intactos; única mudança de timing: o DELETE da
   subscription 410 agora é aguardado (antes era fire-and-forget) — irrelevante nos chamadores.
5. Performance ✓ — 1 insert best-effort por push, dezenas/dia.
6. Segurança ✓ — nada de payload do push no evento além do `title`; endpoint/keys ficam fora.
7. Docs ✓ — story com query de conferência pós-deploy.

**Observação (não bloqueia):** `logEvent` é fire-and-forget; nos chamadores que fazem
`void sendPushToUser()` imediatamente antes do response, o evento herda o risco documentado
no logger (lambda congela antes do insert). O push em si já tinha esse risco — o rastro não
piora nada, só pode ocasionalmente faltar nesses pontos.

## Change Log

- 21/08 @sm: draft a partir do achado da conferência pós-deploy da 75-361.
- 21/08 @po: GO (10/10) — escopo IN/OUT explícito, ACs testáveis, sem dependências.
- 21/08 @dev: implementada + testes; vitest 2885 ✓ · type-check 13/13 ✓ · lint ✓.
- 21/08 @qa: PASS.
