# Story 15.6 — QR Code: Geracao com UTM Tracking

## Status
Blocked

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["manual-review"]

## Story
**As a** equipe de marketing da Trifold,
**I want** um QR code de alta resolucao que aponte para o Google Forms com parametros UTM,
**so that** possamos rastrear a origem dos leads e imprimir o QR no banner do PDV Supermuffato.

## Contexto

**Epic 15 — Campaign Engine + Google Forms Integration (Fase 1 MVP)**

O QR code e impresso no banner posicionado atras da caixa de acrilico no PDV. Nao sera impresso em panfletos — o objetivo e ancorar o participante no stand.

**Requisitos do briefing:**
- Alta resolucao para impressao (minimo 300 dpi, formato PNG ou SVG)
- Parametros UTM: `utm_source=supermuffato&utm_campaign=vind-concurso`
- Painel de analytics do QR (recomendado: QR Tiger, Bitly ou Beaconstac)

**Dependencias:** Google Forms precisa estar criado (pre-requisito externo, nao e story de codigo)

## Acceptance Criteria

1. [ ] AC1: URL do Google Forms com parametros UTM montada: `{form_url}?utm_source=supermuffato&utm_campaign=vind-concurso`
2. [ ] AC2: QR code gerado em alta resolucao: PNG (minimo 300 dpi, 1000x1000px) E SVG (vetorial para impressao)
3. [ ] AC3: QR code gerado usando ferramenta com painel de analytics que registra: total de scans, scans por horario, scans por dia, sistema operacional (iOS/Android)
4. [ ] AC4: Arquivos do QR code salvos em `docs/assets/campaigns/vind-supermuffato/` para referencia
5. [ ] AC5: QR code testado: escanear com celular abre o formulario correto com UTMs na URL

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled

## Tasks / Subtasks

- [ ] Task 1: Montar URL com UTM (AC1)
  - [ ] 1.1: Pegar URL do Google Forms (quando criado)
  - [ ] 1.2: Adicionar parametros UTM

- [ ] Task 2: Gerar QR Code (AC2, AC3)
  - [ ] 2.1: Usar ferramenta com analytics (QR Tiger, Bitly ou Beaconstac recomendados)
  - [ ] 2.2: Gerar PNG em alta resolucao (1000x1000px minimo)
  - [ ] 2.3: Gerar SVG para impressao

- [ ] Task 3: Salvar e testar (AC4, AC5)
  - [ ] 3.1: Salvar em `docs/assets/campaigns/vind-supermuffato/`
  - [ ] 3.2: Testar scan com celular iOS e Android

## Dev Notes

### URL Final Esperada

```
https://docs.google.com/forms/d/{FORM_ID}/viewform?utm_source=supermuffato&utm_campaign=vind-concurso
```

### Ferramentas Recomendadas (do briefing)

- **QR Tiger** — painel de analytics completo, QR dinamico
- **Bitly** — simples, boa analytics
- **Beaconstac** — enterprise, bom para impressao

### Nota

Esta story e mais operacional que tecnica. Nao envolve codigo no CRM. O QR aponta diretamente para o Google Forms. O rastreamento de UTM e feito no lado do cron (story 15.5) que le os parametros da URL via HTTP referer ou os recebe como campos ocultos no form.

**Importante:** Os parametros UTM na URL do Google Forms NAO sao capturados automaticamente pelo Forms. Para captura-los, adicionar campos ocultos no form ou mapea-los via URL pre-fill. Alternativa: o campo UTM e configurado diretamente na tabela `campaigns` (utm_source e utm_campaign sao preenchidos no cadastro da campanha, nao extraidos da URL).

### Testing

- Scan com celular → abre formulario
- Verificar que URL tem UTMs corretas

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-16 | 1.0 | Story criada | @sm (River) |
| 2026-05-06 | Story bloqueada: requer URL do Google Forms criado manualmente + ferramenta externa (QR Tiger/Bitly). Não é tarefa de código. | Pax (@po) |
