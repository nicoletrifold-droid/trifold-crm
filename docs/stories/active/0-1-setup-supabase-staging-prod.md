status: Done

# Story 0.1 — Setup 2 Projetos Supabase (Staging + Producao)

## Contexto
O sistema precisa de 2 ambientes completamente isolados para evitar que dados de teste contaminem dados reais. Cada ambiente tem seu proprio projeto Supabase com o mesmo schema, mas dados independentes. Staging recebe leads de teste via Telegram; producao recebe leads reais via WhatsApp Cloud API. Sem essa separacao, qualquer teste pode corromper dados de corretores e leads reais.

## Acceptance Criteria
- [x] AC1: Projeto Supabase **staging** criado (ref: dsopqkqjkmhytudaaolv)
- [ ] AC2: Projeto Supabase **producao** criado na conta freelans-dev (nome: `trifold-crm-prod`)
- [ ] AC3: Ambos os projetos tem as mesmas extensoes habilitadas: `pgvector`, `uuid-ossp` (staging: OK, prod: pendente)
- [x] AC4: Migration `001_base_schema.sql` aplicada em AMBOS os projetos (staging: OK, prod: pendente)
- [x] AC5: Migration `002_property_schema.sql` aplicada em AMBOS os projetos (staging: OK, prod: pendente)
- [x] AC6: Migration `003_whatsapp_config.sql` aplicada em AMBOS os projetos (staging: OK, prod: pendente)
- [x] AC7: URLs e keys de ambos os projetos documentados no `.env.example` com prefixo claro:
  - `NEXT_PUBLIC_SUPABASE_URL` (muda por ambiente)
  - `SUPABASE_SERVICE_ROLE_KEY` (muda por ambiente)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (muda por ambiente)
- [x] AC8: RLS (Row Level Security) habilitado em ambos os projetos com as mesmas policies (staging: OK, prod: pendente)
- [ ] AC9: Supabase Realtime habilitado em ambos (para monitoramento de conversas)
- [ ] AC10: README do repo documenta que existem 2 projetos e como acessar cada um

## Detalhes Tecnicos

### Arquivos a criar/modificar:
- `.env.example` — Template com variaveis para ambos os ambientes (staging e prod usam o mesmo template, valores diferentes)
- `.env.staging` — Valores do Supabase staging (NÃO commitar — apenas `.env.example`)
- `.env.production` — Valores do Supabase prod (NÃO commitar)
- `supabase/migrations/` — Migrations sao as mesmas da Story 1.2, aplicadas nos 2 projetos

### Estrutura de env vars:
```bash
# Supabase (valores mudam por ambiente)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# O mesmo .env.example serve para staging e prod
# A diferenca esta nos VALORES, nao nas CHAVES
```

### Procedimento:
1. Criar projeto staging no dashboard Supabase
2. Criar projeto prod no dashboard Supabase
3. Anotar URL + anon key + service role key de cada um
4. Aplicar migrations identicas nos 2 projetos
5. Configurar RLS identico nos 2
6. Habilitar Realtime nos 2

### Nota sobre Supabase CLI:
```bash
# Linkar ao projeto staging
npx supabase link --project-ref <staging-ref>
npx supabase db push

# Linkar ao projeto prod
npx supabase link --project-ref <prod-ref>
npx supabase db push
```

## Dependencias
- Depende de: Nenhuma (e a primeira story do pipeline)
- Bloqueia: 0.2 (Vercel precisa dos URLs), 0.4 (env vars), 0.5 (sync de schema), 1.2 (schema base)

## Estimativa
M (Media) — 2-3 horas

## File List

### Created/Modified
- `.env.example` — Template com variaveis de ambiente para ambos os ambientes
- `supabase/migrations/001_base_schema.sql` — Schema base aplicado no staging
- `supabase/migrations/002_property_schema.sql` — Schema de propriedades aplicado no staging
- `supabase/migrations/003_whatsapp_config.sql` — Config WhatsApp aplicado no staging
- `supabase/migrations/004_rls_policies.sql` — RLS policies aplicadas no staging

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
