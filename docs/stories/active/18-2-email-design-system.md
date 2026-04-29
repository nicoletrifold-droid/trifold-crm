---
epic: 18
story: 18.2
title: Email Design System — Layout Base
status: Ready
priority: P1-ALTO
created_at: 2026-04-29
created_by: River (@sm)
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: [html_email_compatibility, responsive_design, variable_resolution, inline_css]
complexity: M
estimated_hours: 3
depends_on: []
---

# Story 18.2 — Email Design System (Layout Base)

## Contexto

Atualmente cada email enviado pelo sistema tem HTML ad-hoc, sem padrão visual. A função `sendEmail()` em `packages/web/src/lib/email.ts` recebe `html: string` puro — cabe ao caller montar o HTML.

Esta story cria o **layout base padronizado** que todos os emails novos do sistema devem usar. O layout fornece header, footer e zona de conteúdo. Templates individuais (Story 18.3) apenas preenchem a zona de conteúdo — o padrão visual é sempre consistente.

Não há dependência de 18.1 (não usa banco de dados). Pode ser desenvolvida em paralelo com 18.4.

## Story Statement

**Como** desenvolvedor do sistema Trifold CRM,
**Quero** um layout base de email padronizado com header, footer e zona de conteúdo,
**Para que** todos os emails enviados pelo sistema tenham identidade visual consistente sem duplicar código de layout.

## Acceptance Criteria

- [ ] **AC1:** Módulo `packages/web/src/lib/email-layout/` criado com estrutura:
  ```
  email-layout/
    index.ts           -- exporta renderBaseLayout
    styles.ts          -- tokens de design (cores, fontes, espaçamentos)
    components/
      header.ts        -- logo + barra de cor primária
      footer.ts        -- endereço, link de descadastro
      button.ts        -- CTA button padronizado
    types.ts           -- interfaces EmailLayoutOptions, EmailVariables
  ```

- [ ] **AC2:** Função `renderBaseLayout(content: string, options: EmailLayoutOptions): string` exportada de `index.ts`:
  - Recebe HTML do conteúdo e opções de personalização
  - Retorna HTML completo com `<!DOCTYPE html>`, `<html>`, `<head>`, `<body>`
  - Aplica tokens de design (cores, fontes, max-width 600px)
  - Injeta header, conteúdo e footer na estrutura

- [ ] **AC3:** Header com:
  - Texto "Trifold" ou `options.orgName` (fallback para "Trifold")
  - Barra superior com cor primária `#1a1a2e`
  - Padding adequado para leitura em mobile

- [ ] **AC4:** Footer com:
  - Texto: "© 2026 Trifold | contato@trifold.com.br"
  - Link de descadastro: `options.unsubscribeUrl` (obrigatório — sem este link o footer não renderiza o texto de descadastro mas renderiza o footer)
  - Texto em cinza claro (`#9ca3af`), fonte 12px

- [ ] **AC5:** HTML usa **inline CSS exclusivamente** — sem `<style>` em `<head>` (compatibilidade com Gmail, Outlook):
  - Todos os estilos aplicados via atributo `style=""` diretamente nos elementos
  - Sem classes CSS, sem folha de estilos externa

- [ ] **AC6:** Interface `EmailLayoutOptions` exportada de `types.ts`:
  ```typescript
  interface EmailLayoutOptions {
    orgName?: string           // fallback: "Trifold"
    unsubscribeUrl?: string    // link de descadastro
    previewText?: string       // texto de preview (aparece em clientes de email antes de abrir)
  }
  ```

- [ ] **AC7:** Função `renderButton(text: string, url: string): string` exportada de `components/button.ts`:
  - Retorna HTML de botão CTA com cor de acento `#4f46e5`
  - Texto branco, border-radius 6px, padding 12px 24px
  - Link wrapping o botão (não apenas texto)

- [ ] **AC8:** Sem dependências de pacotes externos (`@react-email`, etc.) — apenas string manipulation TypeScript puro
  - Zero novas dependencies no `package.json`

- [ ] **AC9:** Testes unitários em `packages/web/src/lib/email-layout/__tests__/`:
  - `renderBaseLayout` retorna HTML com `<!DOCTYPE html>`
  - `renderBaseLayout` contém o conteúdo passado
  - `renderBaseLayout` contém footer
  - `renderButton` retorna elemento `<a>` com a URL correta

## Scope

### IN
- Módulo `email-layout` em `packages/web/src/lib/`
- `renderBaseLayout()` — função principal
- `renderButton()` — componente CTA
- Tipos TypeScript
- Testes unitários

### OUT
- Integração com banco de dados (→ Stories 18.3, 18.4)
- Template de email específico de negócio (ex: "Boas-vindas") — esses são os templates em 18.3
- Preview interativo no browser (→ Story 18.3 faz o preview via API)
- Suporte a React Email ou JSX (manter TypeScript puro para zero deps)

## Dev Notes

### Por que inline CSS (não React Email)

Clientes de email como Gmail e Outlook não suportam `<style>` no `<head>`. O único CSS garantido de funcionar é inline no atributo `style=""`. Usar React Email adiciona uma dependência pesada quando string manipulation TypeScript é suficiente para o escopo atual.

### Estrutura HTML base do layout

```typescript
// Estrutura aproximada que renderBaseLayout deve gerar:
`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;">${previewText}</div>` : ''}
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
    <tr><td align="center" style="padding:24px 16px;">
      <table width="600" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <!-- HEADER -->
        <tr><td style="background-color:#1a1a2e;padding:24px 32px;">
          <span style="color:#ffffff;font-size:20px;font-weight:700;">${orgName}</span>
        </td></tr>
        <!-- CONTENT -->
        <tr><td style="padding:32px;">
          ${content}
        </td></tr>
        <!-- FOOTER -->
        <tr><td style="background-color:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center;">
            © 2026 Trifold | contato@trifold.com.br
            ${unsubscribeUrl ? ` | <a href="${unsubscribeUrl}" style="color:#9ca3af;">Descadastrar</a>` : ''}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
```

### Tokens de design (styles.ts)

```typescript
export const emailTokens = {
  colors: {
    primary: '#1a1a2e',
    accent: '#4f46e5',
    background: '#f3f4f6',
    surface: '#ffffff',
    muted: '#f9fafb',
    border: '#e5e7eb',
    text: {
      primary: '#111827',
      secondary: '#6b7280',
      muted: '#9ca3af',
      inverse: '#ffffff',
    }
  },
  fonts: {
    base: 'Inter, Arial, sans-serif',
    sizes: { sm: '12px', base: '14px', md: '16px', lg: '20px' }
  },
  spacing: { sm: '8px', md: '16px', lg: '24px', xl: '32px' },
  maxWidth: '600px',
  borderRadius: { card: '8px', button: '6px' }
} as const
```

### Localização dos arquivos

- Módulo: `packages/web/src/lib/email-layout/`
- Testes: `packages/web/src/lib/email-layout/__tests__/email-layout.test.ts`
- Importação esperada em 18.4: `import { renderBaseLayout } from "@web/lib/email-layout"`

### Testing

- Framework: Jest (já configurado no projeto)
- Localização dos testes: `__tests__/` dentro do módulo
- Testar com HTML mínimo como `content` — verificar wrap correto
- Testar `previewText` aparece no HTML mas invisível (display:none)
- Testar ausência de `unsubscribeUrl` — footer deve renderizar sem link

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: API (lib TypeScript puro)
- Secondary Type(s): —
- Complexity: Low (módulo isolado, zero deps externas)

**Specialized Agent Assignment:**
- Primary Agents: @dev, @architect (quality gate)
- Supporting Agents: —

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): Verificar que zero packages externos foram adicionados
- [ ] Pre-PR (@devops): Revisar compatibilidade de HTML email antes de PR

**CodeRabbit Focus Areas:**
- Primary: Inline CSS exclusivo (sem `<style>` em head)
- Primary: Zero novas dependências no package.json
- Secondary: Testes unitários passando
- Secondary: TypeScript sem `any` explícito

**Self-Healing Configuration:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2 | Timeout: 15min | Severity Filter: CRITICAL
- CRITICAL: auto_fix | HIGH: document_only

## Tasks / Subtasks

- [x] **Task 1 — Estrutura do módulo** (AC: 1)
  - [x] Criar diretório `packages/web/src/lib/email-layout/`
  - [x] Criar arquivo `types.ts` com `EmailLayoutOptions`
  - [x] Criar `styles.ts` com `emailTokens`

- [x] **Task 2 — Componentes** (AC: 3, 4, 7)
  - [x] `components/header.ts` — renderHeader(orgName)
  - [x] `components/footer.ts` — renderFooter(unsubscribeUrl?)
  - [x] `components/button.ts` — renderButton(text, url)

- [x] **Task 3 — Função principal** (AC: 2, 5, 6)
  - [x] `index.ts` com `renderBaseLayout(content, options)`
  - [x] Estrutura table-based (não div — melhor compatibilidade email)
  - [x] Preview text injetado com display:none

- [x] **Task 4 — Verificar zero dependências** (AC: 8)
  - [x] `package.json` não foi alterado — zero novas deps
  - [x] Apenas imports internos do projeto

- [x] **Task 5 — Testes unitários** (AC: 9)
  - [x] `__tests__/email-layout.test.ts` criado com 12 testes
  - [x] Testes cobrem: DOCTYPE, content, footer, previewText, orgName, unsubscribeUrl, button
  - [x] `pnpm test` passa — 217 testes (12 novos incluídos)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-29 | 1.0 | Story criada | River (@sm) |
| 2026-04-29 | 1.1 | Módulo email-layout implementado. footer usa text.secondary (#6b7280) para WCAG AA (fix UX report). 12 testes unitários. 217 testes passando. type-check OK. | Dex (@dev) |
