---
id: "40.1"
epic: 40
title: "Portal do Cliente — Ações de Serviços (Boleto, Extrato, Informe de Rendimentos)"
status: Ready for Review
created_at: 2026-05-26
updated_at: 2026-05-26
created_by: River (@sm)
priority: Medium
complexity: S
estimate: 2h
executor: "@dev"
quality_gate: "@qa"
depends_on: []
---

# Story 40.1 — Portal do Cliente: Ações de Serviços

## Contexto

O portal do cliente (`/cliente/[obra_id]`) já tem a home com hero, stats cards, atividades
recentes e próximos marcos. Para preparar a integração futura com outro sistema financeiro
(emissão de boletos, consulta de extrato e informe de rendimentos), precisamos adicionar
uma seção de "Ações Rápidas" com 3 botões bem identificados na home.

Por enquanto, ao clicar em qualquer botão, abre um modal informando que a funcionalidade
está em breve. A integração real com o sistema externo virá em story futura.

## Descrição

Como **cliente do portal**, quero ver botões de acesso rápido para Boleto, Extrato e
Informe de Rendimentos na home da minha obra, para que eu saiba que esses serviços
estarão disponíveis e possa acessá-los quando estiverem integrados.

## Escopo

### IN
- Seção "Serviços" com 3 botões na home do portal (`/cliente/[obra_id]/page.tsx`)
- Botões: **Boleto**, **Extrato**, **Informe de Rendimentos**
- Modal "Em Breve" ao clicar em qualquer um dos 3 botões
- Visual consistente com o dark theme existente (stone-950, acento #F27A5E)
- Componente de modal reutilizável em `_components/`

### OUT
- Integração real com sistema externo (story futura)
- Rotas novas (`/cliente/[obra_id]/boleto`, etc.) — não criar por ora
- Qualquer lógica de backend ou chamada de API

## Arquivos a Modificar/Criar

| Arquivo | Ação |
|---------|------|
| `packages/web/src/app/cliente/[obra_id]/page.tsx` | Adicionar seção de serviços com os 3 botões |
| `packages/web/src/app/cliente/[obra_id]/_components/servicos-section.tsx` | Criar — seção com botões + modal "em breve" |

## Design

A seção fica posicionada **entre os stats cards e o grid de atividades/marcos**.

```
[Hero: nome da obra + progress bar]

[Stats cards: 4 cards]

[Serviços]          ← NOVO
  [Boleto]  [Extrato]  [Informe de Rendimentos]

[Atividades recentes | Próximos marcos]
```

**Visual dos botões:**
- Container: `rounded-2xl border border-stone-800 bg-stone-900 p-5`
- Título da seção: `"Serviços"` — mesmo estilo dos outros headers (`text-sm font-semibold text-white`)
- Grid de 3 colunas (1 coluna em mobile)
- Cada botão: card com ícone + label, bordas arredondadas, hover com destaque sutil
  - Boleto: ícone `FileText` (lucide-react)
  - Extrato: ícone `BarChart3` (lucide-react)
  - Informe de Rendimentos: ícone `Receipt` (lucide-react)
- Todos os ícones e textos em `text-stone-400`, hover `text-white`

**Modal "Em Breve":**
- Overlay com `fixed inset-0 bg-black/60 z-50`
- Card central: `bg-stone-900 border border-stone-800 rounded-2xl p-6 max-w-sm`
- Título: `"Em breve"` (bold, white)
- Texto: `"Esta funcionalidade estará disponível em breve. Aguarde novidades!"` (stone-400)
- Botão fechar: `"Entendido"` com estilo padrão do portal (bg-[#F27A5E] text-white)
- Acessível: `role="dialog"`, `aria-modal="true"`, fechar com ESC e clique no overlay

## Acceptance Criteria

- [ ] AC1: Seção "Serviços" aparece na home do portal entre os stats cards e o grid de atividades
- [ ] AC2: Três botões visíveis: "Boleto", "Extrato" e "Informe de Rendimentos", cada um com ícone
- [ ] AC3: Clicar em qualquer botão abre o modal "Em Breve"
- [ ] AC4: Modal fecha ao clicar em "Entendido", no overlay ou pressionar ESC
- [ ] AC5: Layout responsivo — botões em grid 3 colunas (desktop) e 1 coluna (mobile)
- [ ] AC6: Visual consistente com o dark theme existente (stone-950/900, acento #F27A5E)
- [ ] AC7: Nenhuma rota nova criada, nenhuma chamada de API adicionada
- [ ] AC8: Componente `servicos-section.tsx` é Client Component (`'use client'`) — modal usa estado local

## Dev Notes

- `page.tsx` do portal é Server Component — a nova seção deve ser extraída para um Client
  Component separado (`servicos-section.tsx`) para poder usar `useState` no modal
- Ícones disponíveis: `lucide-react` já instalado no projeto
- Não criar arquivo de servidor dedicado — toda lógica fica no componente client

## Tasks

- [x] 1. Criar `_components/servicos-section.tsx` com os 3 botões e o modal "em breve"
- [x] 2. Importar e renderizar `<ServicosSection />` em `page.tsx` (entre stats e grid de atividades)
- [x] 3. Verificar responsividade em mobile (grid 1 col) e desktop (3 cols)
- [x] 4. Testar abertura e fechamento do modal (botão, overlay, ESC)

## Definition of Done

- [ ] ACs 1–8 verificados manualmente
- [ ] TypeScript sem erros (`npm run typecheck`)
- [ ] Lint passando (`npm run lint`)
- [ ] QA gate PASS

## Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-05-26 | @sm (River) | Story criada |
| 2026-05-26 | @po (Pax) | Validação GO (8/10) — status Draft → Ready |
| 2026-05-26 | @dev (Dex) | Implementação completa — 2 arquivos, 0 erros TS/lint |

---
*Epic 40 — Serviços ao Cliente | Story 40.1*
