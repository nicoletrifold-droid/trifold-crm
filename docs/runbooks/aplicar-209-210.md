# Runbook — aplicar as migrations `209` e `210` em produção

**Para:** Gabriel
**Escopo:** hotfix de segurança do lote 0 da auditoria RLS (PR #308, já mergeado) + o follow-up de ACL (PR #338).
**Spec:** `docs/audits/rls-multi-tenant-audit.md` · **Gate:** `docs/qa/gates/hotfix-rls-org-scope-lote0.yml` (PASS)

---

## Contexto em 6 linhas

O PR #308 está **mergeado na `main`**, então o código novo já foi deployado pela Vercel.
**O banco não foi tocado — os vazamentos continuam abertos.** Medido em 2026-08-03, sem login:
`rpc/get_whatsapp_cost_summary` devolve `200` **com os dados**, `v_mensagens_admin` devolve
`206 */15` (PII de conversa) e `meta_campaign_roas` devolve `206 */104`. Além disso, o `anon`
tem `EXECUTE` em `roleta_pick_and_advance`, que é **função de escrita**.
Este runbook fecha tudo isso. São ~15 minutos de trabalho e 24h de monitoramento.

**Aplique de manhã, não à noite.** O vetor mais provável de regressão é lead caindo em
`sem_corretor_disponivel` — sintoma silencioso. Aplicar às 22h joga isso no pico da manhã
seguinte sem ninguém olhando.

---

## Pré-requisitos

```bash
cd ~/trifold-crm
git checkout main && git pull

export PAT="$(cat ~/.config/supabase/pat | tr -d '\n')"
export REF="dsopqkqjkmhytudaaolv"                      # PROD
export SB="https://api.supabase.com/v1/projects/$REF/database/query"

# helper: roda um arquivo .sql inteiro num único POST
sbq() { python3 -c "import json,sys;print(json.dumps({'query':open(sys.argv[1]).read()}))" "$1" > /tmp/sbq.json \
        && curl -s -X POST "$SB" -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" --data-binary @/tmp/sbq.json; }

# helper: roda uma query inline
sbi() { python3 -c "import json,sys;print(json.dumps({'query':sys.argv[1]}))" "$1" > /tmp/sbi.json \
        && curl -s -X POST "$SB" -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" --data-binary @/tmp/sbi.json; }
```

Confirme que está no projeto certo antes de qualquer coisa:

```bash
sbi "select current_database(), current_user, inet_server_addr()"
```

---

## ⛔ Três proibições

1. **NUNCA `supabase db push` contra produção.** O registro `supabase_migrations.schema_migrations`
   está **52 migrations atrasado** — a última versão registrada é `20260710171933` (10/07) e o repo
   já vai até a `210`. Um `db push` tentaria reaplicar tudo desde a `164`. Aplique sempre pela
   Management API, arquivo por arquivo.
2. **NUNCA fatie a migration por statement.** Manda o arquivo **inteiro** num único POST. Múltiplos
   statements numa só query rodam em **transação implícita**, então um erro aborta tudo sem deixar
   estado parcial. Isso é a mitigação do único gap que restou do QA: 4 corpos convertidos para
   `plpgsql` sem parser verificado.
3. **NUNCA `BEGIN; … ROLLBACK;` pra "testar".** A Management API é autocommit por statement —
   gravaria em produção sem volta.

---

## Passo 0 — confirmar que a `209` ainda NÃO foi aplicada

```bash
sbi "select count(*) as assert_org_scope_existe from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='assert_org_scope'"
```

**Esperado: `0`.** Se vier `1`, a `209` já rodou — pare e me chame antes de continuar.

## Passo 1 — confirmar o código novo no ar, ANTES de tocar o banco

A ordem é assimétrica: o código novo funciona com o banco antigo (service-role sempre teve
acesso), mas **a migration não é compatível com o código antigo** — o revoke do P4 derrubaria o
painel Saúde & Billing, que lia com client de usuário.

Logado como **admin**, confirme que respondem:

- `/dashboard/sistema/billing` — painel + lista
- detalhe de uma campanha com bloco de ROAS preenchido

Se algum dos dois estiver quebrado agora, **pare aqui e não aplique nada** — o problema é do
deploy, não do banco.

## Passo 2 — controle positivo (prova que a verificação funciona)

```bash
sed -n '807,879p' supabase/migrations/209_hotfix_rls_org_scope.sql | sed 's/^-- //; s/^--$//' > /tmp/verif-209.sql
sbq /tmp/verif-209.sql
```

**Esperado: exatamente 24 linhas**, distribuídas assim (já conferido em 03/08):

| qtd | falha |
|---|---|
| 8 | `P1: ainda executavel por anon` |
| 8 | `P1: sem guarda de org no corpo` |
| 1 | `P2: view sem security_invoker ou ainda legivel por anon` |
| 1 | `P2: matview ainda legivel por anon ou authenticated` |
| 1 | `P6: fin_notif_select sem org_id` |
| 5 | `P4: tabela de custo interno ainda legivel por authenticated/anon` |

**24 é o esperado, não é problema.** Se você viu "25" em alguma anotação antiga: a linha do P3
saiu porque o P3 foi fechado em 31/07 pela `206`. Rodar isso antes serve pra você confiar no zero
depois — uma query quebrada também retorna zero linhas.

## Passo 3 — aplicar a `209`

```bash
sbq supabase/migrations/209_hotfix_rls_org_scope.sql
```

Se der erro, **nada foi gravado** (transação implícita). Manda o erro pra mim.

## Passo 4 — verificação pós-aplicação

```bash
sbq /tmp/verif-209.sql
```

**Esperado: ZERO linhas** (`[]`). Qualquer linha = item que não pegou. Não siga com linha sobrando.

## Passo 5 — smoke com sessões reais (4 perfis)

- `/broker` como **corretor**
- `/dashboard` como **gerente-comercial**
- `/dashboard/configuracoes/corretores` — a coluna de **leads ativos NÃO pode zerar**
- `/dashboard/sistema` como **admin** — lista **e** semáforos de saúde
- `/dashboard/sistema/billing` como **admin** — painel + lista + **1 editar** + **1 excluir**
- detalhe de campanha com ROAS — **inclusive com o usuário `social-media`**, que é o perfil no
  limite exato do achado do P2

## Passo 6 — smoke OBRIGATÓRIO da roleta (1 lead ponta a ponta)

`roleta_pick_and_advance` é a **única função de escrita com guarda nova** e **não foi exercitada
em nenhum dos dois rounds de QA**, porque mutaria produção. **Não pule este passo.**

Crie um lead de teste e deixe a roleta distribuir. Depois confirme o desfecho:

```bash
sbi "select status, count(*) from lead_distribution_log where created_at > now() - interval '30 minutes' group by 1"
```

**Esperado: `distributed`.** Se aparecer `sem_corretor_disponivel` com corretor disponível na
fila, é regressão da guarda — vai pro rollback (passo 11).

## Passo 7 — probes anônimos (a prova de que o hotfix pegou)

```bash
export ANON="<a NEXT_PUBLIC_SUPABASE_ANON_KEY de prod>"
export URL="https://dsopqkqjkmhytudaaolv.supabase.co/rest/v1"
probe() { printf "%-32s " "$1"; curl -s -o /dev/null -w "HTTP %{http_code}\n" "$URL/$2" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"; }

probe "v_mensagens_admin"   "v_mensagens_admin?select=id&limit=1"
probe "meta_campaign_roas"  "meta_campaign_roas?select=*&limit=1"
probe "system_events"       "system_events?select=id&limit=1"

# P1 — a RPC que hoje devolve os dados de custo sem login
curl -s -o /dev/null -w "rpc cost_summary            HTTP %{http_code}\n" -X POST "$URL/rpc/get_whatsapp_cost_summary" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -d '{"p_org_id":"00000000-0000-0000-0000-000000000001"}'
```

| objeto | hoje (03/08) | esperado depois |
|---|---|---|
| `v_mensagens_admin` | `206` | **`401` ou `403`** |
| `meta_campaign_roas` | `206` | **`401` ou `403`** |
| `system_events` | `200 */0` | `200 */0` (já fechado pela `206` — **é o esperado ANTES de aplicar**, não confunda com a migration já ter rodado) |
| `rpc/get_whatsapp_cost_summary` | `200` **com dados** | **`404` ou `403`** |

Teste também a matview **com JWT de usuário comum** (não só anon) — é o teste específico do
revoke de `authenticated`, e nenhum outro passo cobre isso.

## Passo 8 — aplicar a `210` (follow-up de ACL)

Mergeie o **PR #338** e então:

```bash
git pull
sbq supabase/migrations/210_hotfix_revoke_authenticated_roleta.sql
```

Ela tem **guarda de ordem**: aborta com `RAISE` se a `209` não tiver sido aplicada, porque a `209`
concede `EXECUTE` a `authenticated` nas mesmas funções e desfaria a `210`.

Verificação (as duas queries já foram conferidas read-only contra prod):

```bash
# regressão — esperado: ZERO linhas (antes da 210 e depois da 209: 4 linhas)
sbi "SELECT f.fn, r.rolname FROM (VALUES ('public.roleta_pick_and_advance(uuid,uuid,uuid,integer)'),('public.seed_system_roles(uuid)')) AS f(fn) CROSS JOIN (SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')) AS r WHERE has_function_privilege(r.rolname, f.fn, 'EXECUTE')"

# contraprova — esperado: 2 linhas (o service_role NÃO pode ser afetado)
sbi "SELECT f.fn FROM (VALUES ('public.roleta_pick_and_advance(uuid,uuid,uuid,integer)'),('public.seed_system_roles(uuid)')) AS f(fn) WHERE has_function_privilege('service_role', f.fn, 'EXECUTE')"
```

## Passo 9 — repetir o smoke da roleta

A `210` mexe na ACL do **mesmo caminho de escrita** do passo 6. Distribua mais um lead e confira
o `lead_distribution_log` de novo.

## Passo 10 — monitorar 24h (qualquer ocorrência é regressão)

- Logs Vercel: `"org mismatch"`, `"org scope required"`, **ERRCODE 42501** (`permission denied for function`)
- `[roleta] RPC error:` — **vetor mais provável**
- `[SYSTEM_EVENTS] RPC get_whatsapp_*_summary failed`
- taxa de `distributed` vs `sem_corretor_disponivel` comparada à véspera:

```bash
sbi "select date_trunc('day', created_at) as dia, status, count(*) from lead_distribution_log where created_at > now() - interval '3 days' group by 1,2 order by 1 desc, 3 desc"
```

## Passo 11 — rollback

A `209` tem bloco `-- ROLLBACK` comentado com as 4 definições originais em `LANGUAGE sql`,
validadas byte a byte contra produção pelo @qa. Dois avisos que valem mais que o resto:

- **NÃO execute o `DROP FUNCTION public.assert_org_scope` (linha 1011) antes de remover as 8
  chamadas `PERFORM`.** O Postgres não rastreia dependência função→função: o DROP passa e as 4
  funções que continuam `plpgsql` quebram **em runtime**, com erro pior que o estado revertido — e
  sob pressão de incidente.
- **A policy `USING(true)` de `system_events` NUNCA deve ser recriada.** Se algum writer quebrar, a
  correção é migrar aquele writer para service-role.

Rollback da `210`, se aparecer `42501` em algum caminho não mapeado:

```sql
GRANT EXECUTE ON FUNCTION public.roleta_pick_and_advance(uuid, uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_system_roles(uuid) TO authenticated;
```

Mesmo aí, a correção definitiva é migrar o caminho para service-role. **Nunca re-conceder a
`PUBLIC` nem a `anon`.**

---

## Checklist

- [ ] Passo 0 — `assert_org_scope` não existe (`0`)
- [ ] Passo 1 — billing e detalhe de campanha respondendo, com o banco antigo
- [ ] Passo 2 — controle positivo: **24 linhas**
- [ ] Passo 3 — `209` aplicada em transação única
- [ ] Passo 4 — verificação: **zero linhas**
- [ ] Passo 5 — smoke dos 4 perfis (leads ativos não zerou)
- [ ] Passo 6 — 1 lead distribuído ponta a ponta
- [ ] Passo 7 — probes anônimos em `401`/`403`/`404`
- [ ] Passo 8 — #338 mergeado, `210` aplicada, verificações OK
- [ ] Passo 9 — segundo lead distribuído
- [ ] Passo 10 — 24h monitoradas

## Follow-ups que ficam abertos (não são deste runbook)

1. `SET search_path` em 3 funções `SECURITY DEFINER` — P13 da auditoria.
2. Converter o ramo **fail-open** de `assert_org_scope` para fail-closed. O fail-open vale
   **somente quando `auth.uid() IS NULL`**: aí a guarda nega apenas se conseguir identificar o
   request como anônimo (`claims->>'role' = 'anon'`) e libera qualquer formato de claims que não
   reconheça — necessário porque a service role key deste projeto é do formato novo
   (`sb_secret_…`, não-JWT) e negar por padrão pararia a distribuição de leads no cron.
   **Com usuário logado a guarda já é fail-closed** e barra cross-tenant
   (`p_org_id IS DISTINCT FROM user_org_id()` → `org mismatch`), então isto **não** é um
   bloqueio do multi-tenant. É endurecimento de defesa em profundidade: hoje o controle que
   fecha o vetor anônimo é o `REVOKE`, e a guarda é no-op nesse caminho.
3. Registrar as ~52 migrations não registradas em `schema_migrations`, ou aceitar formalmente que
   `db push` não vale para produção neste projeto.
