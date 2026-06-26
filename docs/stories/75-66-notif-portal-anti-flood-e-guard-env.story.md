# Story 75-66 — Notificações do portal: anti-flood (coalescing) + guard de env (REST API)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** M (3-5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]

## Story
**As a** equipe Trifold, **I want** que as notificações do portal do cliente **não disparem em lote** (uma
mensagem por foto) e que o **kill switch nunca mais falhe silenciosamente**, **so that** ao religar o portal o
cliente não receba uma enxurrada de mensagens idênticas e a pausa seja confiável.

## Contexto
Incidente 2026-06-26: a cliente Samara recebeu a MESMA notificação "Nova foto adicionada à sua obra" **4× no
mesmo minuto** (13:07). Dois problemas distintos:

1. **Pausa quebrada (causa raiz da enxurrada chegar):** a pausa de 25/06 foi feita com `vercel env add` via
   stdin, que **grava valor VAZIO** (bug conhecido do CLI — mesmo que derrubou a VAPID key, Story 75-40).
   `PORTAL_NOTIF_PAUSED=""` ≠ `"1"` → kill switch nunca ligou. **Já corrigido 2026-06-26** (recriado via REST
   API = `"1"` + redeploy; portal está PAUSADO agora). Falta **blindar contra repetição** (doc + ferramenta).
2. **Flood/duplicação (o "monte de mensagem"):** `api/admin/obras/[obra_id]/fotos/route.ts:212` chama
   `notifyClientes(obra_id, "nova_foto", obra.name)` **uma vez por foto**; o texto é genérico → lote de N fotos
   = N mensagens idênticas. Não há dedup. Vale para upload direto (admin/supervisor) e para aprovação em lote.

**Decisão do usuário (2026-06-26):** NÃO religar as notificações agora; só corrigir o flood e blindar o env.
Notificações seguem pausadas (deploy seguro — nada será enviado até religarem).

## Escopo
**IN:**
1. **Coalescing por (obra, evento)** — `supabase/migrations/123_obra_notif_dedup_coalescing.sql`:
   - tabela `obra_notif_dedup(obra_id uuid, evento text, last_sent_at timestamptz, pk(obra_id,evento))`;
   - RPC atômica `claim_obra_notif(p_obra_id uuid, p_evento text, p_window_seconds int) returns boolean` —
     `INSERT ... ON CONFLICT DO UPDATE SET last_sent_at = now() WHERE last_sent_at < now() - janela RETURNING true`.
     Retorna `true` só para quem "ganhou o slot" (1º do lote ou fora da janela); demais → sem linha → `null`.
2. **`packages/web/src/lib/notificacoes.ts`** — em `notifyClientes`, logo após `createAdminClient()` (e DEPOIS do
   guard de pausa), chamar `claim_obra_notif` com janela `COALESCE_WINDOW_SECONDS = 15*60`. Se não reivindicou
   (`!claimed`), logar "coalescido" e `return` — sem consultar usuários nem enviar nada. Mantém pausa antes do claim.
3. **Guard de env (documentação durável no REPO, não só memória):**
   - `.claude/CLAUDE.md` (seção Project-Specific Context) — nota: **NUNCA usar `vercel env add` via stdin**
     (grava vazio); sempre **REST API** (`PATCH/POST /v9|v10/projects/{id}/env`) com token do CLI; histórico
     (VAPID 75-40, PORTAL_NOTIF_PAUSED 75-66). `vercel env rm` e `vercel env pull` funcionam normal.
   - `scripts/vercel-env-set.sh` — helper que seta/atualiza uma env var via REST API (lê token do auth.json do
     CLI), evitando o `vercel env add`. Uso documentado no topo do script.
4. **Teste** `packages/web/src/lib/notificacoes.test.ts` (novo) — mock de `createAdminClient`/envios:
   (a) `claim` retorna `false` → NÃO consulta usuários (`admin.from` não chamado) e NÃO envia (email/whatsapp/push);
   (b) `PORTAL_NOTIF_PAUSED=1` → retorna cedo, `rpc` nem é chamado.

**OUT:**
- **NÃO religar** as notificações (segue pausado). Sem mudança no valor de `PORTAL_NOTIF_PAUSED`.
- Não mudar o template HSM da Meta (coalescing envia 1 msg, sem precisar de texto "N fotos").
- Não mexer nos canais de corretor/roleta.
- Não alterar prefs por usuário nem a lógica de distrato.

## Acceptance Criteria
1. **Given** N fotos enviadas para a mesma obra dentro de `COALESCE_WINDOW_SECONDS`, **when** cada upload chama
   `notifyClientes(obra, "nova_foto", ...)`, **then** apenas a 1ª dispara envio; as demais são coalescidas
   (nenhum email/whatsapp/push e nenhuma consulta de usuários).
2. **Given** dois eventos DIFERENTES (`nova_foto` e `novo_documento`) na mesma obra, **when** disparados juntos,
   **then** cada um envia 1× (chaveado por evento — não se coalescem entre si).
3. **Given** `claim_obra_notif` chamada concorrente por vários uploads, **when** executam, **then** exatamente
   um recebe `true` na janela (atomicidade via `ON CONFLICT ... WHERE`).
4. **Given** `PORTAL_NOTIF_PAUSED=1`, **when** `notifyClientes` roda, **then** retorna antes do claim e de
   qualquer envio (pausa tem prioridade; comportamento atual preservado).
5. **Given** a necessidade de setar uma env var no Vercel, **when** a equipe/agente segue o repo, **then**
   `.claude/CLAUDE.md` orienta REST API (nunca `vercel env add`) e `scripts/vercel-env-set.sh` está disponível.
6. typecheck/lint/vitest limpos.

## Dev Notes
- **SQL da RPC (idempotente, atômica):**
```sql
create table if not exists obra_notif_dedup (
  obra_id uuid not null,
  evento text not null,
  last_sent_at timestamptz not null default now(),
  primary key (obra_id, evento)
);
create or replace function claim_obra_notif(p_obra_id uuid, p_evento text, p_window_seconds int)
returns boolean language sql as $$
  insert into obra_notif_dedup (obra_id, evento, last_sent_at)
  values (p_obra_id, p_evento, now())
  on conflict (obra_id, evento) do update set last_sent_at = now()
    where obra_notif_dedup.last_sent_at < now() - make_interval(secs => p_window_seconds)
  returning true;
$$;
```
  - 1ª chamada (sem linha) → INSERT → `true`. Dentro da janela → conflito + WHERE falso → 0 linhas → `null`.
    Fora da janela → UPDATE → `true`. supabase-js `rpc` retorna `data === true` (claimed) ou `null` (coalescido).
- **Posição no código:** pausa (`portalNotificacoesPausadas`) PRIMEIRO; depois `admin = createAdminClient()`;
  depois o claim. Coalescido pula até as queries (economiza trabalho).
- **Janela 15 min:** cobre lote de upload/aprovação; curta o suficiente p/ não suprimir novidades reais (cliente
  vê todas as fotos no portal de qualquer forma). Constante nomeada, ajustável.
- **Aplicação da migration:** via Supabase Management API + PAT (@devops), como 121/122. Seguro agora (pausado).
- Reuso: estende [[project-notificacoes-portal]]. Guard de env relaciona a [[project-migrations]] (gotcha VAPID 75-40).

### Testing
- `vitest packages/web` (novo `notificacoes.test.ts`, mock de createAdminClient/email/push) + `type-check` + `lint`.
- Migration idempotente (`create table if not exists` / `create or replace`).
- Verificação manual pós-religamento (futuro): subir 3 fotos em lote → cliente recebe **1** notificação.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.66-notif-portal-anti-flood-e-guard-env.yml`) · readiness 9/10
- 7/7 checagens OK. Testes: `notificacoes.test.ts` 4/4 + broker 109/109; `pnpm type-check` 8/8 tasks.
- AC1/AC4 por teste; AC2 pela PK (obra,evento); AC3 atomicidade `ON CONFLICT...WHERE`; AC5 doc+script.
- 1 obs **medium**: aplicar migration 123 junto do deploy (fallback cobre a janela + portal pausado); 1 low: janela 15 min ajustável.
- **Pendente @devops:** aplicar migration 123 + merge (NÃO religar). Status → Done após push.

## Riscos
- **Coalescing suprime novidade legítima dentro da janela:** ex.: foto e, 5 min depois, outra foto → 2ª não
  notifica. Aceitável (portal mostra tudo; janela curta). **Baixo.**
- **RPC não aplicada em prod antes do código chamar:** `notifyClientes` chamaria RPC inexistente → erro logado
  no catch e, pior, poderia abortar envio. Mitigação: aplicar migration 123 ANTES/junto do deploy; como está
  pausado, sem impacto real. Tratar `claim` com fallback: se `rpc` der erro, **enviar** (degrada para o
  comportamento atual, não bloqueia). **Médio.**
- **Race em alta concorrência:** coberto pela atomicidade do `ON CONFLICT ... WHERE` (AC3). **Baixo.**

## File List
- `supabase/migrations/123_obra_notif_dedup_coalescing.sql` — tabela `obra_notif_dedup` + RPC atômica `claim_obra_notif`.
- `packages/web/src/lib/notificacoes.ts` — constante `COALESCE_WINDOW_SECONDS=15*60`; guard de coalescing após a
  pausa (claim antes de consultar/enviar) com fallback seguro se a RPC falhar.
- `packages/web/src/lib/notificacoes.test.ts` — **novo**; 4 casos (coalescido, pausa, claim=true segue, fallback de erro).
- `.claude/CLAUDE.md` — seção "Vercel — variáveis de ambiente (GOTCHA)": nunca `vercel env add`, sempre REST API.
- `scripts/vercel-env-set.sh` — **novo**; helper REST API para setar env var com confirmação (evita o bug do CLI).

## Dev Agent Record
- **Agent Model:** Claude Opus 4.8 (1M)
- **Completion Notes:**
  - Coalescing por (obra, evento): só o 1º do lote dentro de 15 min envia; demais suprimidos. Vale p/ todos os eventos.
  - Ordem garantida: pausa → admin → claim → queries. Pausa tem prioridade (claim nem é chamado).
  - **Fallback seguro:** se `claim_obra_notif` retornar erro (ex.: RPC ainda não aplicada), NÃO bloqueia — envia
    (degrada para o comportamento atual). Testado.
  - Guard de env atende ao pedido do usuário (durável no REPO, não só na memória): doc no CLAUDE.md + script.
  - **Validação local:** `vitest` (notificacoes.test.ts 4/4 + broker 109/109); `pnpm type-check` 8/8 tasks OK.
  - **NÃO religa notificações** — `PORTAL_NOTIF_PAUSED` segue `"1"`. Migration 123 a aplicar em prod (@devops); seguro (pausado).

## Change Log
- 2026-06-26 — @sm — Story criada. Remediação do incidente de 26/06: coalescing anti-flood (tabela+RPC+guard no
  dispatcher) + blindagem do env (doc no CLAUDE.md + helper REST API). Portal segue PAUSADO. Ver
  [[project-notificacoes-portal]].
- 2026-06-26 — @po — Validação (checklist 10 pontos): **GO**, 9/10. Problema/contexto claros (2 causas distintas);
  6 ACs Given/When/Then testáveis (incl. atomicidade e prioridade da pausa); escopo IN/OUT explícito (NÃO religar);
  dependências mapeadas; complexidade M; valor claro (não floodar ao religar + pausa confiável); riscos com
  mitigação (fallback se RPC falhar — reforçar no @dev); DoD claro; alinhado ao Epic 75. Status Draft → Ready.
  Nota: garantir o **fallback "em erro de RPC, enviar"** na implementação (degrada seguro).
- 2026-06-26 — @dev — Implementado: migration 123 (tabela `obra_notif_dedup` + RPC `claim_obra_notif`); guard de
  coalescing em `notifyClientes` (15 min, com fallback seguro); doc no CLAUDE.md + `scripts/vercel-env-set.sh`;
  teste novo 4/4. type-check 8/8. NÃO religa (PORTAL_NOTIF_PAUSED="1"). Status Ready → Review.
- 2026-06-26 — @qa — Gate **PASS** (9/10), 7/7 OK. 1 obs medium (aplicar migration junto do deploy — fallback +
  pausa cobrem), 1 low (janela ajustável). Pendente @devops: migration 123 + merge sem religar. Status segue Review.
- 2026-06-26 — @devops — Migration 123 aplicada em prod (Management API) e testada (claim 1ª=true, 2ª=null; linha
  de teste removida). PR #50 (squash) merged → deploy. `PORTAL_NOTIF_PAUSED` **mantido "1"** (NÃO religado).
  Coalescing ativo no código p/ quando religarem. Status Review → **Done**.
