---
epic: 18
story: 18.3
title: Gerenciamento de Templates — Admin UI
status: Ready
priority: P1-ALTO
created_at: 2026-04-29
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [ui_accessibility, rbac_validation, preview_rendering, variable_parsing]
complexity: G
estimated_hours: 6
depends_on: [18.1, 18.2]
---

# Story 18.3 — Gerenciamento de Templates (Admin UI)

## Contexto

Com o schema criado em 18.1 e o layout base criado em 18.2, esta story implementa a interface administrativa para criar, editar e gerenciar templates de email. Apenas usuários com `role = 'admin'` podem acessar esta área.

Templates são a base para automações (18.7) e blasts (18.8) — sem templates publicados, essas features não funcionam.

## Story Statement

**Como** administrador do Trifold CRM,
**Quero** criar e gerenciar templates de email com variáveis e preview visual,
**Para que** todos os emails enviados pelo sistema sigam um padrão visual e textual consistente definido por mim.

## Acceptance Criteria

- [ ] **AC1:** Página `/dashboard/sistema/email-templates` criada com listagem de templates:
  - Tabela com colunas: Nome, Categoria, Status (Ativo/Rascunho), Criado em, Ações
  - Badge colorido: Ativo=verde, Rascunho=cinza
  - Filtro por categoria (select: Todos / Transacional / Campanha / Automação)
  - Botão "Novo Template" que navega para `/dashboard/sistema/email-templates/novo`
  - Ação "Editar" para cada template
  - Ação "Arquivar" (soft delete via `is_active = false`) com confirmação

- [ ] **AC2:** Página `/dashboard/sistema/email-templates/[id]` (criação e edição) com campos:
  - **Nome:** input text obrigatório
  - **Slug:** input text, auto-gerado a partir do nome (kebab-case), editável manualmente
  - **Categoria:** select obrigatório (transacional / campanha / automação)
  - **Assunto:** input text obrigatório, suporta variáveis `{{nome}}`
  - **Corpo HTML:** textarea ou editor básico, suporta variáveis `{{nome}}`

- [ ] **AC3:** Detecção automática de variáveis no assunto e corpo:
  - Ao digitar `{{nome}}` em qualquer campo, a variável `nome` aparece automaticamente na seção "Variáveis"
  - Para cada variável detectada: campos de Label (ex: "Nome do destinatário"), Tipo (text/url/date) e Obrigatório (toggle)
  - Variáveis removidas do texto desaparecem da seção automaticamente

- [ ] **AC4:** Botão "Preview" abre modal com email renderizado:
  - Chama `POST /api/admin/email-templates/preview` passando html_body atual
  - Preview usa `renderBaseLayout` do módulo 18.2
  - Variáveis obrigatórias não preenchidas mostram placeholder `[NOME]` em destaque laranja
  - Modal tem botão de fechar

- [ ] **AC5:** Dois botões de ação no formulário:
  - **"Salvar Rascunho"** — salva com `is_active = false` (não publicado)
  - **"Publicar"** — salva com `is_active = true`; bloqueia publicação se há variáveis obrigatórias sem label definido

- [ ] **AC6:** API Routes criadas em `packages/web/src/app/api/admin/email-templates/`:
  - `GET /api/admin/email-templates` — lista templates da org (com paginação: `limit`, `offset`, `category`)
  - `POST /api/admin/email-templates` — cria template (retorna 201 com template criado)
  - `PUT /api/admin/email-templates/[id]` — edita template
  - `DELETE /api/admin/email-templates/[id]` — arquiva (soft delete, `is_active = false`)
  - `POST /api/admin/email-templates/preview` — renderiza preview HTML

- [ ] **AC7:** Proteção de acesso: apenas `role = 'admin'` acessa as API routes e a página:
  - API routes verificam `role` do usuário via `createServerClient()` + query em `organization_members`
  - Retornam 403 para não-admins
  - Página redireciona para `/dashboard` se não-admin

- [ ] **AC8:** Zero regressões — rotas e funcionalidades existentes do dashboard funcionando normalmente

## Scope

### IN
- Listagem, criação, edição e arquivamento de templates
- Detecção automática de variáveis
- Preview com layout base (18.2)
- API routes admin protegidas
- RBAC: somente admin

### OUT
- Editor visual drag-and-drop (fora do MVP)
- Versionamento de templates
- Duplicar template
- Templates compartilhados entre orgs
- Envio de email de teste para um endereço real (fora do MVP)

## Dev Notes

### Verificação de role admin

Seguir o padrão de verificação de role já existente no projeto. Verificar em `packages/web/src/app/api/admin/webhook-logs/route.ts` como a proteção admin é implementada:

```typescript
// Padrão de proteção admin existente
const supabase = createServerClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

const { data: member } = await supabase
  .from('organization_members')
  .select('role')
  .eq('user_id', user.id)
  .single()

if (member?.role !== 'admin') {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

### Detecção de variáveis (regex)

```typescript
// Detectar todas as variáveis {{chave}} em um string
function extractVariables(text: string): string[] {
  const matches = text.matchAll(/\{\{(\w+)\}\}/g)
  return [...new Set([...matches].map(m => m[1]))]
}
```

### Preview API — endpoint

```typescript
// POST /api/admin/email-templates/preview
// Body: { html_body: string, variables?: Record<string, string> }
// Retorna: { html: string }
import { renderBaseLayout } from "@web/lib/email-layout"

// Substituir variáveis com valores fornecidos ou placeholder
function resolveVariables(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] ?? `<span style="color:#f97316;font-weight:bold;">[${key.toUpperCase()}]</span>`
  )
}
```

### Estrutura de arquivos

```
packages/web/src/app/
  dashboard/sistema/email-templates/
    page.tsx                     -- Listagem de templates
    novo/page.tsx                -- Criação de template
    [id]/page.tsx                -- Edição de template
    _components/
      template-form.tsx          -- Formulário compartilhado (criação/edição)
      variable-editor.tsx        -- Seção de gerenciamento de variáveis
      preview-modal.tsx          -- Modal de preview
  api/admin/email-templates/
    route.ts                     -- GET (lista) + POST (cria)
    [id]/route.ts                -- PUT (edita) + DELETE (arquiva)
    preview/route.ts             -- POST (preview)
```

### Slug auto-gerado

```typescript
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
```

### Testing

- Testar proteção 403 para não-admin
- Testar detecção de variáveis com `{{nome}} e {{imovel}}`
- Testar preview com variável obrigatória vazia (deve mostrar placeholder laranja)
- Testar publicação bloqueada se variável obrigatória sem label
- `npm run type-check` deve passar sem erros

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: Frontend + API
- Secondary Type(s): Security (RBAC)
- Complexity: High (UI + API + RBAC + integração com 18.1 e 18.2)

**Specialized Agent Assignment:**
- Primary Agents: @dev, @qa (quality gate)
- Supporting Agents: @architect (revisar padrão RBAC)

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): `npm run type-check` passa sem erros
- [ ] Pre-PR (@devops): Testar acesso 403 para não-admin manualmente

**CodeRabbit Focus Areas:**
- Primary: RBAC — 403 retornado corretamente para não-admins em todas as rotas
- Primary: Variáveis obrigatórias bloqueiam publicação
- Secondary: Preview usa renderBaseLayout de 18.2 (não HTML ad-hoc)
- Secondary: Soft delete preserva `email_logs` via FK ON DELETE SET NULL

**Self-Healing Configuration:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2 | Timeout: 15min | Severity Filter: CRITICAL
- CRITICAL: auto_fix | HIGH: document_only

## Tasks / Subtasks

- [ ] **Task 1 — API Routes** (AC: 6, 7)
  - [ ] `GET /api/admin/email-templates` com paginação e filtro de categoria
  - [ ] `POST /api/admin/email-templates` — cria template
  - [ ] `PUT /api/admin/email-templates/[id]` — edita template
  - [ ] `DELETE /api/admin/email-templates/[id]` — arquiva (soft delete)
  - [ ] `POST /api/admin/email-templates/preview` — retorna HTML renderizado
  - [ ] Proteção admin em todas as rotas (401/403)

- [ ] **Task 2 — Componentes compartilhados** (AC: 2, 3, 4)
  - [ ] `variable-editor.tsx` — detecta e lista variáveis do template
  - [ ] `preview-modal.tsx` — chama API de preview e exibe modal
  - [ ] `template-form.tsx` — formulário completo (usa os dois acima)

- [ ] **Task 3 — Página de listagem** (AC: 1)
  - [ ] `dashboard/sistema/email-templates/page.tsx`
  - [ ] Tabela com filtro de categoria
  - [ ] Ações: Editar, Arquivar (com modal de confirmação)

- [ ] **Task 4 — Páginas de criação/edição** (AC: 2, 3, 4, 5)
  - [ ] `novo/page.tsx` — usa `template-form.tsx`
  - [ ] `[id]/page.tsx` — carrega template existente + usa `template-form.tsx`
  - [ ] Slug auto-gerado a partir do nome

- [ ] **Task 5 — Proteção de página** (AC: 7)
  - [ ] Verificar role admin no layout ou page server component
  - [ ] Redirect para `/dashboard` se não-admin

- [ ] **Task 6 — Validação e qualidade** (AC: 8)
  - [ ] `npm run type-check` sem erros
  - [ ] Testar fluxo completo: criar → preview → publicar
  - [ ] Testar acesso 403 para usuário sem role admin

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-29 | 1.0 | Story criada | River (@sm) |
