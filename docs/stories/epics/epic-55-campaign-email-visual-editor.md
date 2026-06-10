# Epic 55 — Campaign Email Visual Editor & A/B Creative Performance

## Status
Draft

## Summary
Substituir o textarea de HTML cru no form de campanhas de sorteio por um editor visual (Unlayer/react-email-editor), adicionar suporte a upload de imagens com variant ID por bloco, injetar UTM automático por variante, e criar aba de Performance por campanha que mede click-rate por imagem — habilitando testes A/B de criativos em e-mails de confirmação.

## Business Value
- Permite que o time de marketing crie e-mails visualmente sem escrever HTML
- Habilita teste A/B de imagens em campanhas de sorteio (feature estratégica pedida pelo Lucas)
- Gera dados de criativos vencedores para orientar futuras campanhas
- Reduz erros de HTML mal formatado que quebram layout de e-mail

## Stories

| Story | Título | Status |
|-------|--------|--------|
| 55-1 | Editor Visual de E-mail com A/B de Imagens | Draft |

## Technical Scope
- Schema: `campaigns.email_body_json JSONB`, `campaign_email_images` table, bucket `campaign-assets`
- Editor: reuso de `visual-editor.tsx` (Unlayer/react-email-editor)
- UTM injection: `injectUtmToHtml()` helper no cron `campaign-poll`
- Performance tab: aggregation de `campaign_events.metadata.click.link` por `utm_content`
- Compat retroativa: campanhas existentes sem `email_body_json` continuam funcionando

## Dependencies
- `visual-editor.tsx` já existe em `sistema/email-templates/_components/` (untracked 2026-06-09) — deve ser merged/committed antes de T3 da Story 55-1
- Migration 092 deve anteceder qualquer código (T0 bloqueia T1-T8)

## Out of Scope (deste epic)
- Dashboard global cross-campanha
- A/B de subject line
- Integração com Meta Ads criativos (Epic 50)

## Notes
Epic criado em 2026-06-10 por @sm (River) a partir de sessão de escopo com Lucas.
