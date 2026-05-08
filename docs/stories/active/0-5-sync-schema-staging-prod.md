status: Done

# Story 0.5 — Script de Sync de Schema (Staging <-> Producao)

## Contexto
Com 2 projetos Supabase separados, as migrations precisam ser aplicadas nos dois ambientes de forma consistente. Se uma migration for aplicada em staging mas esquecida em producao, o deploy quebra. Este script automatiza a aplicacao de migrations em ambos os projetos e valida que os schemas estao em sync.

## Acceptance Criteria
- [ ] AC1: Script `scripts/db-migrate.sh` criado com opcoes: `--staging`, `--prod`, `--both`
- [ ] AC2: `npm run db:migrate:staging` aplica todas as migrations pendentes no Supabase staging
- [ ] AC3: `npm run db:migrate:prod` aplica todas as migrations pendentes no Supabase prod
- [ ] AC4: `npm run db:migrate:both` aplica em ambos sequencialmente (staging primeiro, prod depois)
- [ ] AC5: Script valida que a migration foi aplicada com sucesso antes de prosseguir para o proximo ambiente
- [ ] AC6: Script mostra diff de migrations pendentes antes de aplicar (confirmacao interativa em prod)
- [ ] AC7: Script `npm run db:status` mostra quais migrations estao aplicadas em cada ambiente
- [ ] AC8: Arquivo `supabase/.env.staging` e `supabase/.env.prod` com project refs (listados no `.gitignore`)
- [ ] AC9: README de migrations criado em `supabase/README.md` com instrucoes de como criar e aplicar migrations

## Detalhes Tecnicos

### Arquivos a criar:
- `scripts/db-migrate.sh` — Script principal de migracao
- `scripts/db-status.sh` — Script para checar status das migrations
- `supabase/.env.staging` — Project ref do staging (nao commitar)
- `supabase/.env.prod` — Project ref do prod (nao commitar)
- `supabase/README.md` — Documentacao de migrations

### Package.json scripts:
```json
{
  "scripts": {
    "db:migrate:staging": "bash scripts/db-migrate.sh --staging",
    "db:migrate:prod": "bash scripts/db-migrate.sh --prod",
    "db:migrate:both": "bash scripts/db-migrate.sh --both",
    "db:status": "bash scripts/db-status.sh",
    "db:new-migration": "npx supabase migration new"
  }
}
```

### Script de migracao:
```bash
#!/bin/bash
# scripts/db-migrate.sh

STAGING_REF=$(cat supabase/.env.staging)
PROD_REF=$(cat supabase/.env.prod)

migrate_env() {
  local env=$1
  local ref=$2
  echo "=== Migrating $env (ref: $ref) ==="
  npx supabase link --project-ref $ref
  npx supabase db push
  if [ $? -ne 0 ]; then
    echo "ERROR: Migration failed for $env"
    exit 1
  fi
  echo "=== $env migration complete ==="
}

case "$1" in
  --staging) migrate_env "staging" $STAGING_REF ;;
  --prod)
    echo "WARNING: Applying to PRODUCTION. Ctrl+C to cancel."
    sleep 3
    migrate_env "production" $PROD_REF
    ;;
  --both)
    migrate_env "staging" $STAGING_REF
    migrate_env "production" $PROD_REF
    ;;
  *) echo "Usage: db-migrate.sh [--staging|--prod|--both]" ;;
esac
```

### Fluxo de nova migration:
```
1. npm run db:new-migration -- nome_da_migration
2. Editar arquivo em supabase/migrations/
3. npm run db:migrate:staging (testar)
4. Validar no staging
5. npm run db:migrate:prod (aplicar em prod)
```

## Dependencias
- Depende de: 0.1 (2 projetos Supabase existem)
- Bloqueia: Nenhuma (e ferramenta de suporte, nao bloqueia features)

## Estimativa
P (Pequena) — 1-2 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
