# Story 15.4 — Servico de E-mail: Setup Resend + lib/email.ts

## Status
Done

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["code-review", "test-validation"]

## Story
**As a** sistema CRM,
**I want** ter um servico de envio de e-mail integrado,
**so that** leads de campanhas recebam confirmacoes automaticas por e-mail alem do WhatsApp.

## Contexto

**Epic 15 — Campaign Engine + Google Forms Integration (Fase 1 MVP)**

Hoje o CRM nao tem NENHUMA infraestrutura de e-mail. Esta story adiciona o Resend como provider.

**Decisao D5 da arquitetura:** Resend escolhido por: melhor DX com Next.js/TS, free tier de 3.000/mes, webhooks de tracking nativos (open, bounce).

**Referencia:** Arquitetura secao 4.4

**Dependencias:** Nenhuma tecnica. Pre-requisito externo: conta Resend criada + dominio `trifold.eng.br` verificado (DNS TXT + DKIM).

## Acceptance Criteria

1. [ ] AC1: Pacote `resend` instalado como dependencia do `packages/web`
2. [ ] AC2: Servico `packages/web/src/lib/email.ts` criado com funcao `sendEmail({ to, subject, html, tags? })` que retorna `{ id: string | null, error?: string }`
3. [ ] AC3: Remetente configurado como `Trifold <contato@trifold.eng.br>`
4. [ ] AC4: Suporte a `tags` para tracking (campaign_id, entry_id) — tags sao enviadas ao Resend para vincular webhooks de status aos registros corretos
5. [ ] AC5: Se `RESEND_API_KEY` nao estiver configurada, a funcao retorna `{ id: null, error: "RESEND_API_KEY not configured" }` sem lancar excecao (graceful degradation)
6. [ ] AC6: Env var `RESEND_API_KEY` documentada
7. [ ] AC7: `pnpm run type-check` passa sem erros
8. [ ] AC8: Nenhum secret/token hardcoded no codigo

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled

## Tasks / Subtasks

- [x] Task 1: Instalar dependencia (AC1)
  - [x] 1.1: `pnpm add resend` no `packages/web`

- [x] Task 2: Criar servico de e-mail (AC2, AC3, AC4, AC5)
  - [x] 2.1: Criar `packages/web/src/lib/email.ts`
  - [x] 2.2: Implementar `sendEmail()` com Resend SDK
  - [x] 2.3: Tratar caso de API key ausente (graceful degradation)
  - [x] 2.4: Incluir tags no envio para rastreabilidade

- [x] Task 3: Validacao (AC6, AC7, AC8)
  - [x] 3.1: Documentar env var (adicionada ao .env.local)
  - [x] 3.2: type-check

## Dev Notes

### Implementacao Esperada

```typescript
import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
  tags?: { name: string; value: string }[]
}): Promise<{ id: string | null; error?: string }> {
  if (!resend) {
    return { id: null, error: "RESEND_API_KEY not configured" }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'Trifold <contato@trifold.eng.br>',
      to: params.to,
      subject: params.subject,
      html: params.html,
      tags: params.tags,
    })
    if (error) return { id: null, error: error.message }
    return { id: data?.id ?? null }
  } catch (err) {
    return { id: null, error: err instanceof Error ? err.message : "Unknown error" }
  }
}
```

### Source Tree Relevante

- `packages/web/src/lib/` — pasta de services (supabase, logger, api-auth)
- Nenhum servico de e-mail existe hoje

### Pre-requisito Externo

- Criar conta no Resend (resend.com)
- Verificar dominio `trifold.eng.br` (DNS TXT + DKIM records)
- Obter API key

### Testing

- `pnpm run type-check`
- Teste manual: enviar e-mail de teste apos configurar API key

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-16 | 1.0 | Story criada | @sm (River) |
| 2026-05-08 | @po | Story closed — implementada em produção, Campaign Engine verificado | — |
