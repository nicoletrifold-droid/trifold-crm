# Runbook — aplicar as migrations `242` e `243` em produção (Live Coach)

**Escopo:** Story 90-1 (Epic 90 — Live Coach). **PR:** #513 (aberto, CI verde, **não mergeado**)
**Gate:** `docs/qa/gates/90-1-live-coach-backend.yml` (PASS, condicionado a este runbook)

---

## Contexto em 6 linhas

O PR #513 **não pode ser mergeado antes deste runbook**. O código novo lê a tabela
`coach_suggestions` e a capability `leads.live_coach`; nenhuma das duas existe em produção.
Se mergear primeiro, a Vercel deploya, o coach falha no fail-open (silencioso, porque é
exatamente o desenho da feature) e a capability resolve como negada — ninguém percebe nada,
e a story parece "funcionando" sem nunca gerar uma sugestão.

**`supabase db push` é PROIBIDO aqui.** `supabase_migrations.schema_migrations` em produção
está congelada na **168**, então o `push` consideraria 169..243 pendentes e tentaria aplicar
~75 migrations de uma vez. Aplique por **SQL Editor** do painel (`Trifold` → ícone `>_`) ou
Management API com PAT. São ~5 minutos.

**Ordem obrigatória: pré-condições → 242 → 243 → conferência → merge.**

---

## Passo 0 — Pré-condições (obrigatório, 30 segundos)

A policy da 242 depende de três funções. Se qualquer uma faltar, a migration falha na criação
da policy — e falha no meio, deixando a tabela criada sem RLS de leitura.

```sql
-- Devem retornar 3 linhas. Se vier menos, PARE.
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('has_capability', 'user_org_id', 'user_broker_id')
ORDER BY p.proname;

-- Deve retornar 0 linhas (a tabela ainda não existe).
-- Se retornar 1, a 242 já foi aplicada — pule o Passo 1.
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'coach_suggestions';

-- Deve retornar 0 linhas (a capability ainda não existe).
-- Se retornar > 0, a 243 já foi aplicada — pule o Passo 2.
SELECT COUNT(*) AS linhas_live_coach
FROM public.role_permissions
WHERE module = 'leads.live_coach';
```

---

## Passo 1 — Migration 242 (tabela + RLS + Realtime)

Cole **o conteúdo inteiro** de `supabase/migrations/242_coach_suggestions.sql`. É idempotente
(`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`, publicação dentro de guarda).

Três coisas que ela faz e por que importam:
- **Policy `coach_suggestions_select`** espelhando `messages_select` (mig 229). Sem ela, a
  Story 90-2 não recebe nada — Realtime entrega filtrado por RLS da sessão, e o sintoma
  enganoso é "realtime não funciona".
- **Publicação Realtime** (`supabase_realtime`), pré-requisito da 90-2.
- **Nenhuma policy de INSERT/UPDATE**: escrita é exclusiva do service-role (o webhook).

---

## Passo 2 — Migration 243 (capability `leads.live_coach`)

O arquivo tem ~1130 linhas, mas **só as 10 linhas da capability nova fazem efeito** — o resto
cai em `ON CONFLICT DO NOTHING` e a `has_capability` é `CREATE OR REPLACE` de função idêntica.

Você pode colar o arquivo inteiro (seguro) **ou** este subconjunto equivalente (mais rápido de
conferir):

```sql
WITH caps(cap_key, role_name, granted) AS (
  VALUES
    ('leads.live_coach', 'admin', true),
    ('leads.live_coach', 'supervisor', true),
    ('leads.live_coach', 'gerente-comercial', true),
    ('leads.live_coach', 'sdr', true),
    ('leads.live_coach', 'broker', true),
    ('leads.live_coach', 'obras', false),
    ('leads.live_coach', 'gerente-relacionamento', false),
    ('leads.live_coach', 'imob', false),
    ('leads.live_coach', 'consultoria', false),
    ('leads.live_coach', 'social-media', false)
)
INSERT INTO public.role_permissions (org_id, role_id, module, can_access)
SELECT r.org_id, r.id, c.cap_key, c.granted
FROM caps c
JOIN public.roles r ON r.name = c.role_name
ON CONFLICT (role_id, module) DO NOTHING;
```

**`broker` entra como `true`** — ao contrário de `leads.followup_nicole` (mig 241). Aqui a
capability não é "mexer em lead de terceiro": ela é o **kill switch do coach**, e o corretor
dono é justamente quem recebe as sugestões. A geração confere a capability no perfil do
corretor **dono do lead**, então desligar um perfil **para de gerar**, não só de exibir.

---

## Passo 3 — Conferência (leia o resultado antes de mergear)

```sql
-- 1) Tabela, RLS ligada e policy no lugar
SELECT c.relname,
       c.relrowsecurity                                AS rls_ligada,
       (SELECT COUNT(*) FROM pg_policies p
         WHERE p.tablename = 'coach_suggestions')      AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'coach_suggestions';
-- esperado: coach_suggestions | true | 1

-- 2) Realtime
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'coach_suggestions';
-- esperado: 1 linha

-- 3) Capability (5 perfis com true, 5 com false)
SELECT r.name, rp.can_access
FROM public.role_permissions rp
JOIN public.roles r ON r.id = rp.role_id
WHERE rp.module = 'leads.live_coach'
ORDER BY rp.can_access DESC, r.name;
-- esperado: admin/broker/gerente-comercial/sdr/supervisor = true;
--           consultoria/gerente-relacionamento/imob/obras/social-media = false

-- 4) Trigger de updated_at
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.coach_suggestions'::regclass AND NOT tgisinternal;
-- esperado: set_updated_at
```

Se as quatro conferem → **mergear o PR #513**.

---

## T8 — Medição (rodar ~48h depois do merge)

Sem estes números não há como decidir se a Story 90-2 vale a pena. O ponto de decisão é a
coluna `ancorada`: sugestão sem lastro em dado real é o que faz corretor ignorar o card.

```sql
-- Volume, ancoragem e mix de objeções
SELECT tipo,
       COUNT(*)                                                       AS sugestoes,
       ROUND(100.0 * AVG((ancorada)::int), 1)                          AS pct_ancorada,
       ROUND(100.0 * AVG((confianca = 'alta')::int), 1)                AS pct_confianca_alta
FROM coach_suggestions
WHERE created_at > now() - interval '48 hours'
GROUP BY tipo
ORDER BY sugestoes DESC;

-- Funil do gate: quantas mensagens chegaram a cada estágio (custo real)
SELECT event_type, COUNT(*)
FROM system_events
WHERE created_at > now() - interval '48 hours'
  AND event_type LIKE 'LIVE_COACH%'
GROUP BY event_type
ORDER BY 2 DESC;
-- LIVE_COACH_SKIPPED      → descartado por gate (custo ~zero)
-- LIVE_COACH_NO_OBJECTION → pagou 1 Haiku, sem objeção
-- LIVE_COACH_SUGGESTED    → pagou Haiku + Sonnet
-- LIVE_COACH_FAILED       → investigar; deve ser ~0
-- LIVE_COACH_SUPERSEDE_FAILED → deve ser 0

-- Taxa de detecção: das mensagens que passaram os gates, quantas viraram sugestão
SELECT
  COUNT(*) FILTER (WHERE event_type = 'LIVE_COACH_SUGGESTED')                          AS com_objecao,
  COUNT(*) FILTER (WHERE event_type IN ('LIVE_COACH_SUGGESTED','LIVE_COACH_NO_OBJECTION')) AS analisadas,
  ROUND(100.0 * COUNT(*) FILTER (WHERE event_type = 'LIVE_COACH_SUGGESTED')
        / NULLIF(COUNT(*) FILTER (WHERE event_type IN ('LIVE_COACH_SUGGESTED','LIVE_COACH_NO_OBJECTION')), 0), 1) AS pct_deteccao
FROM system_events
WHERE created_at > now() - interval '48 hours' AND event_type LIKE 'LIVE_COACH%';
```

**Leitura crua das sugestões — é isto que decide a 90-2.** Números não dizem se a sugestão
presta; leia 20 e julgue:

```sql
SELECT created_at, tipo, confianca, ancorada, objecao,
       respostas, ancoras, cuidado
FROM coach_suggestions
ORDER BY created_at DESC
LIMIT 20;
```

Critérios sugeridos para seguir para a 90-2: `pct_ancorada` ≥ 60%, `LIVE_COACH_FAILED` ≈ 0,
e as 20 sugestões lidas parecendo algo que **você** mandaria a um cliente. Se `pct_ancorada`
vier baixa, o problema é a base de conhecimento (RAG), não o coach — e o conserto é alimentar
o RAG antes de construir UI.

> `used_at` / `dismissed_at` só ganham sinal com a Story 90-2 (a UI é quem os escreve por ação
> do corretor). Nesta fase, `dismissed_at` preenchido = supersede automático, não descarte
> humano.

---

## Rollback

| Cenário | Ação |
|---|---|
| Coach gerando sugestão ruim / custo alto | Desligar a capability `leads.live_coach` para todos os perfis — **para de gerar sem deploy** |
| Precisa reverter o código | Remover o `after()` do coach no webhook e deployar. A tabela pode ficar (órfã e inofensiva) |
| Migration 242 falhou no meio | `DROP TABLE IF EXISTS public.coach_suggestions CASCADE;` e reaplicar após corrigir a pré-condição |

Nada aqui altera comportamento existente: o coach só LÊ o que já existe e escreve em tabela
nova. Com a capability desligada, o sistema se comporta exatamente como antes do merge.
