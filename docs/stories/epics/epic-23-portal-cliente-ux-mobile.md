---
epic: 23
title: Portal do Cliente — UX Mobile-First
status: Draft
created_at: 2026-05-11
updated_at: 2026-05-11
created_by: River (@sm)
ux_audit_by: Uma (@ux-design-expert)
priority: High
objetivo_negocio:
  - Corrigir problemas críticos de usabilidade mobile no portal do cliente
  - Garantir conformidade WCAG AA em navegação e áreas de toque
  - Aumentar clareza visual e reduzir fricção na comunicação cliente-equipe
depends_on:
  - Epic 20 completo (schema obras, auth cliente, todas as telas)
  - Epic 22 completo (PWA instalável, push notifications)
stories_planned: [23.1, 23.2]
---

# Epic 23 — Portal do Cliente: UX Mobile-First

## Objetivo do Epic

Refinar a experiência do cliente no portal de acompanhamento de obra com foco em **mobile-first**.
A auditoria UX conduzida por `@ux-design-expert` (Uma) identificou 18 problemas distribuídos em
6 áreas funcionais. Este epic os corrige em 2 stories sequenciais, priorizando impacto máximo
com mínimo de risco de regressão.

## Contexto do Audit UX

**Auditado por:** Uma (@ux-design-expert) em 2026-05-11
**Escopo:** 9 arquivos, 5 seções funcionais, layout completo
**Metodologia:** Atomic Design · Mobile-First · WCAG AA

### Problemas identificados por severidade

| Severidade | Qtd | Áreas |
|-----------|-----|-------|
| 🔴 Crítico | 4 | Chat (contraste, sobreposição, datas, tap targets) |
| 🟠 Alto | 5 | Tab Nav (active state, acessibilidade), Notificações (órfã) |
| 🟡 Médio | 9 | Home, Fases, Fotos, Documentos |

## Arquivos em Escopo

| Arquivo | Stories |
|---------|---------|
| `packages/web/src/app/cliente/[obra_id]/mensagens/page.tsx` | 23.1 |
| `packages/web/src/app/cliente/[obra_id]/mensagens/_components/chat-feed.tsx` | 23.1 |
| `packages/web/src/app/cliente/[obra_id]/_components/obra-tab-nav.tsx` | 23.1 |
| `packages/web/src/app/cliente/[obra_id]/_components/sidebar.tsx` | 23.1 |
| `packages/web/src/app/cliente/[obra_id]/page.tsx` | 23.2 |
| `packages/web/src/app/cliente/[obra_id]/fases/page.tsx` | 23.2 |
| `packages/web/src/app/cliente/[obra_id]/fotos/page.tsx` | 23.2 |
| `packages/web/src/app/cliente/[obra_id]/documentos/page.tsx` | 23.2 |

## Stories

---

### Story 23.1 — Chat UX + Navegação

**Executor:** `@dev` | **Quality Gate:** `@qa`
**Complexidade:** S (2h)
**Prioridade:** P1 — problemas críticos de usabilidade

Corrige sobreposição do chat com tab bar, distinção visual de mensagens, separadores
de data, tap targets e active state da navegação inferior.

---

### Story 23.2 — Conteúdo: Home, Fases, Fotos, Documentos

**Executor:** `@dev` | **Quality Gate:** `@qa`
**Complexidade:** S (1h30)
**Prioridade:** P2 — após 23.1

Corrige card duplicado na home, badges inconsistentes de fases, grid de fotos no mobile
e metadados ocultos em documentos.

---

## Compatibilidade

- [x] Nenhuma alteração de schema/banco de dados
- [x] Nenhuma alteração de API routes
- [x] Apenas modificações de UI/CSS/Tailwind nos componentes listados
- [x] Stack: Next.js App Router, Tailwind CSS v3, TypeScript, Lucide React

## Estimativa e Sequência

| Story | Executor | Estimativa | Bloqueada por |
|-------|----------|------------|---------------|
| 23.1 — Chat + Nav | @dev | 2h | — |
| 23.2 — Conteúdo | @dev | 1h30 | 23.1 (verificação de regressão) |

**Total estimado: ~3h30min**

## Definition of Done

- [ ] Story 23.1: Chat sem sobreposição, mensagens visualmente distintas, nav com active state correto
- [ ] Story 23.2: Zero cards duplicados, badges unificados, fotos em 2 colunas mobile, metadados visíveis
- [ ] QA gate PASS em ambas as stories
- [ ] @devops push após QA gate aprovado

— River, removendo obstáculos 🌊
