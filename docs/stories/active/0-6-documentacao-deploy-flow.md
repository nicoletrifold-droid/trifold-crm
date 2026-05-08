status: Done

# Story 0.6 — Documentacao do Deploy Flow

## Contexto
Com 2 ambientes (staging + prod), 2 projetos Supabase, 2 canais (Telegram + WhatsApp), o time precisa de documentacao clara de como testar, promover e fazer rollback. Sem isso, qualquer novo desenvolvedor (ou o proprio time apos ferias) vai ter dificuldade para entender o fluxo. Essa documentacao e referencia operacional, nao marketing.

## Acceptance Criteria
- [ ] AC1: Arquivo `docs/deploy/deploy-flow.md` criado com fluxo completo de desenvolvimento a producao
- [ ] AC2: Documento inclui diagrama ASCII do fluxo: dev -> staging -> validacao -> prod
- [ ] AC3: Documento detalha como testar em staging:
  - Como acessar o Telegram bot (@NicoleTrifoldBot)
  - Como ver logs no Vercel (staging)
  - Como verificar dados no Supabase staging
- [ ] AC4: Documento detalha como promover para producao:
  - Como criar PR de staging para main
  - Checklist pre-merge (quality gates: tsc, build, testes manuais)
  - Como verificar o deploy no Vercel
- [ ] AC5: Documento detalha como fazer rollback:
  - Vercel: revert to previous deployment
  - Supabase: como reverter migration (manual — Supabase nao tem rollback nativo)
- [ ] AC6: Documento inclui tabela de ambientes:
  | Ambiente | Supabase | Canal | Vercel URL | Branch |
- [ ] AC7: Documento inclui lista de env vars por ambiente
- [ ] AC8: Documento inclui troubleshooting basico (webhook nao recebe, bot nao responde, build falha)

## Detalhes Tecnicos

### Arquivo a criar:
- `docs/deploy/deploy-flow.md`

### Conteudo esperado:
```markdown
# Deploy Flow — Trifold CRM

## Ambientes

| Ambiente | Supabase | Canal | URL | Branch | Dados |
|----------|----------|-------|-----|--------|-------|
| Staging | trifold-crm-staging | Telegram (@NicoleTrifoldBot) | staging.trifold-crm.vercel.app | staging | Teste |
| Producao | trifold-crm-prod | WhatsApp Cloud API | crm.3fold.com.br (futuro) | main | Reais |

## Fluxo de Desenvolvimento
[diagrama + passos]

## Como Testar em Staging
[passos detalhados]

## Como Promover para Producao
[checklist + passos]

## Rollback
[procedimento]

## Troubleshooting
[FAQ tecnico]
```

## Dependencias
- Depende de: 0.1, 0.2, 0.3, 0.4, 0.5 (todos os stories de infra staging precisam estar prontos para documentar)
- Bloqueia: Nenhuma

## Estimativa
P (Pequena) — 1 hora

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
