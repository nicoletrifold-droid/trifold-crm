# Story 15.8 — UI: Lista de Campanhas + Criacao com Auto-discovery

## Status
Draft

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["code-review", "ui-review"]

## Story
**As a** admin da Trifold,
**I want** visualizar todas as campanhas e criar novas diretamente pelo painel,
**so that** eu consiga gerenciar acoes de marketing sem depender de desenvolvedores.

## Contexto

**Epic 15 — Campaign Engine (Fase 2 — Painel + Tracking)**

UI para listar campanhas e criar novas. Ao criar, o admin cola o link do Google Forms e o sistema sugere o mapeamento de campos automaticamente.

**Referencia:** Arquitetura secoes 4.6.2 (Lista + Nova Campanha)

**Dependencias:** Story 15.7 (API CRUD campanhas)

## Acceptance Criteria

### Navegacao

1. [ ] AC1: Item "Campanhas" adicionado ao sidebar do dashboard layout (`layout.tsx`) entre "Analytics" e "Config", usando icone `Megaphone` do lucide-react

### Lista de Campanhas (`/dashboard/campaigns`)

2. [ ] AC2: Pagina server-side que lista campanhas da org via `GET /api/campaigns` ou query direta ao Supabase
3. [ ] AC3: Tabela com colunas: Nome, Empreendimento, Periodo (starts_at — ends_at formatado), Status (badge colorido: rascunho/ativa/pausada/encerrada), Cadastros, Validos, Taxa validacao
4. [ ] AC4: Botao "+ Nova Campanha" no header que navega para `/dashboard/campaigns/nova`
5. [ ] AC5: Clicar numa linha navega para `/dashboard/campaigns/[id]`
6. [ ] AC6: Se nao ha campanhas, exibir empty state com mensagem e botao de criar

### Criacao de Campanha (`/dashboard/campaigns/nova`)

7. [ ] AC7: Formulario com campos: Nome da acao (text), Descricao/Contexto (textarea), Empreendimento (select com properties), Data inicio (date), Data encerramento (date), URL do Google Forms (url)
8. [ ] AC8: Ao colar/digitar URL do Forms e sair do campo (onBlur ou botao "Detectar campos"), chama `POST /api/campaigns/discover-fields` e exibe secao de mapeamento de campos
9. [ ] AC9: Secao de mapeamento mostra tabela: Pergunta do Forms | Mapear para (dropdown: Nome, WhatsApp, E-mail, Campo personalizado, Ignorar) | Badge de confianca (Auto/Manual). Valores pre-preenchidos pela sugestao da API
10. [ ] AC10: Apos mapeamento, exibe secao "Confirmacoes": Template WhatsApp (text), E-mail habilitado (toggle default on), Assunto do e-mail (text), Corpo do e-mail (textarea HTML)
11. [ ] AC11: Botao "Salvar" chama `POST /api/campaigns` com todos os dados. Status salvo como 'draft'. Redireciona para detalhe da campanha
12. [ ] AC12: Na pagina de detalhe, botao "Ativar" chama `POST /api/campaigns/[id]/activate`. Se Google nao conectado ou field_mapping vazio, exibe erro
13. [ ] AC13: Se Google nao esta conectado, o campo URL do Forms exibe alerta: "Conecte sua conta Google em Configuracoes > Integracoes antes de criar campanhas"

### Qualidade

14. [ ] AC14: `pnpm run type-check` passa sem erros
15. [ ] AC15: Paginas seguem o design system existente (Tailwind, mesmos padroes de spacing, cores, tipografia do dashboard)

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled

## Tasks / Subtasks

- [ ] Task 1: Adicionar item no sidebar (AC1)
  - [ ] 1.1: Editar `packages/web/src/app/dashboard/layout.tsx` — adicionar nav item "Campanhas" com icone Megaphone

- [ ] Task 2: Pagina lista de campanhas (AC2-AC6)
  - [ ] 2.1: Criar `packages/web/src/app/dashboard/campaigns/page.tsx`
  - [ ] 2.2: Query Supabase para campanhas com contagem de entries
  - [ ] 2.3: Tabela com colunas especificadas
  - [ ] 2.4: Botao "+ Nova Campanha"
  - [ ] 2.5: Empty state

- [ ] Task 3: Pagina criacao de campanha (AC7-AC13)
  - [ ] 3.1: Criar `packages/web/src/app/dashboard/campaigns/nova/page.tsx`
  - [ ] 3.2: Formulario com campos basicos (nome, descricao, empreendimento, datas, URL)
  - [ ] 3.3: Componente client de auto-discovery que chama API ao colar URL
  - [ ] 3.4: Secao de mapeamento de campos com dropdowns editaveis
  - [ ] 3.5: Secao de confirmacoes (WhatsApp template, email)
  - [ ] 3.6: Submit → POST /api/campaigns → redirect para detalhe
  - [ ] 3.7: Alerta se Google nao conectado

- [ ] Task 4: Validacao (AC14, AC15)
  - [ ] 4.1: type-check
  - [ ] 4.2: Verificar consistencia visual com dashboard existente

## Dev Notes

### Source Tree Relevante

- `packages/web/src/app/dashboard/layout.tsx` — sidebar nav items (linhas 22-35)
- `packages/web/src/app/dashboard/leads/page.tsx` — referencia de pagina com tabela
- `packages/web/src/app/dashboard/configuracoes/integracoes/page.tsx` — referencia de pagina com cards
- `packages/web/src/app/api/campaigns/` — API routes (story 15.7)

### Lucide Icon

Importar `Megaphone` de `lucide-react`. Adicionar entre BarChart3 (Analytics) e Settings (Config):
```typescript
import { Megaphone } from "lucide-react"
// ...
{ href: "/dashboard/campaigns", label: "Campanhas", icon: <Megaphone className={ICON_SIZE} /> },
```

### Design Patterns do Dashboard

- Tabelas: `rounded-lg bg-white shadow-sm` com header `bg-gray-50`
- Badges de status: verde (ativa), cinza (rascunho), amarelo (pausada), vermelho (encerrada)
- Botoes primarios: `bg-orange-600 hover:bg-orange-700 text-white`
- Empty states: icone + texto + botao de acao

### Testing

- `pnpm run type-check`
- Navegar pelo sidebar → lista vazia → criar campanha → voltar a lista

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-16 | 1.0 | Story criada | @sm (River) |
