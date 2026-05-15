# Story 29.6 — UI: Gestão de Tipos de Brinde + Integração na Tabela

## Status: Ready

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run typecheck", "npm run lint", "browser test"]

## Story

**Como** administrador do Trifold CRM,
**Quero** gerenciar o catálogo de tipos de brinde (criar, editar, desativar) e selecionar o tipo de brinde ao registrar uma entrega,
**Para que** eu possa rastrear exatamente qual brinde (com tamanho e cor) foi entregue a cada destinatário.

## Contexto

Depende das Stories 29.4 (schema) e 29.5 (API). Esta é a entrega final: a interface de gestão de tipos e a integração no fluxo de registro de entrega.

**Padrão de referência:** `datas-modal.tsx` (gerenciamento de datas comemorativas) e `status-badge.tsx` (atualização de status de entrega inline).

## Acceptance Criteria

### Gerenciar Tipos de Brinde
- [ ] AC1: Botão "Gerenciar Tipos" adicionado na página `/dashboard/brindes`, ao lado do botão "Gerenciar Datas" existente
- [ ] AC2: Clicar em "Gerenciar Tipos" abre modal `TiposModal` com lista de tipos cadastrados (nome, tamanho, cor, badge ativo/inativo)
- [ ] AC3: Modal exibe formulário inline para criar novo tipo com campos: Nome (obrigatório), Descrição (opcional), Tamanho (opcional, ex: "P", "M", "G", "GG" ou texto livre), Cor (opcional)
- [ ] AC4: Ao salvar novo tipo, chama `POST /api/brindes/tipos` e atualiza a lista sem reload
- [ ] AC5: Cada tipo na lista tem botão "Editar" que abre sub-form inline com os campos preenchidos; salvar chama `PATCH /api/brindes/tipos/[id]`
- [ ] AC6: Cada tipo tem botão "Desativar/Ativar" que chama `PATCH /api/brindes/tipos/[id]` com `{ ativo: !tipo.ativo }`; tipos inativos aparecem com visual desabilitado (opacidade reduzida)
- [ ] AC7: Tipos inativos não aparecem no seletor de brinde ao registrar entrega (AC10)

### Seleção de Tipo no Registro de Entrega
- [ ] AC8: O dropdown de status de entrega (no `status-badge.tsx`) exibe, além das opções de status, um seletor de tipo de brinde quando uma data comemorativa está selecionada
- [ ] AC9: O seletor de tipo lista apenas os tipos `ativo = true` da org, ordenados por nome
- [ ] AC10: Ao confirmar a entrega com status "Entregue", o `brinde_tipo_id` selecionado (ou null se não selecionado) é enviado no body do `POST /api/brindes/entregas`
- [ ] AC11: O tipo de brinde selecionado é persistido e exibido como tooltip ou texto secundário no badge de status após salvar

### Exibição na Tabela
- [ ] AC12: A coluna "STATUS" na tabela de brindes exibe o tipo de brinde abaixo do badge de status quando `brinde_tipo_id` estiver preenchido (texto secundário pequeno: nome do tipo + tamanho + cor)
- [ ] AC13: Se não há tipo associado à entrega, a coluna exibe apenas o badge de status (sem alteração no layout atual)

### Carregamento de Dados
- [ ] AC14: A lista de tipos ativos é carregada uma vez na inicialização da página (`GET /api/brindes/tipos?ativo=true`) e passada como prop para os componentes que precisam (StatusBadge e TiposModal)
- [ ] AC15: Após criar/editar/desativar um tipo no modal, `router.refresh()` atualiza os dados da página

## Escopo

**IN:**
- `TiposModal` component (novo)
- Atualização de `status-badge.tsx` (incluir tipo no dropdown)
- Atualização de `brindes-table.tsx` (exibir tipo na coluna status)
- Atualização de `page.tsx` (carregar tipos, exibir botão "Gerenciar Tipos")

**OUT:**
- Alterações no schema (Story 29.4)
- Alterações na API (Story 29.5)
- Campo de tipo no modal de criação/edição de destinatário (tipo é do brinde entregue, não do destinatário)

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| StatusBadge com seletor de tipo aumenta complexidade do dropdown | Média | Implementar como dois campos separados: status select + tipo select no dropdown, com layout simples |
| Usuários não cadastrando tipos antes de usar | Média | Seletor de tipo mostra "Nenhum tipo cadastrado — clique em Gerenciar Tipos" quando lista vazia |

## Dev Notes

### Arquivos a criar/modificar
```
packages/web/src/app/dashboard/brindes/_components/tipos-modal.tsx  ← CRIAR
packages/web/src/app/dashboard/brindes/_components/status-badge.tsx ← MODIFICAR
packages/web/src/app/dashboard/brindes/_components/brindes-table.tsx ← MODIFICAR
packages/web/src/app/dashboard/brindes/page.tsx                      ← MODIFICAR
```

### Padrão do TiposModal (baseado em datas-modal.tsx)
```typescript
"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"

interface BrindeTipo {
  id: string
  nome: string
  descricao: string | null
  tamanho: string | null
  cor: string | null
  ativo: boolean
}

interface TiposModalProps {
  tipos: BrindeTipo[]
  onClose: () => void
}

export function TiposModal({ tipos: initialTipos, onClose }: TiposModalProps) {
  const router = useRouter()
  const [tipos, setTipos] = useState(initialTipos)
  // ... CRUD handlers seguindo padrão de datas-modal.tsx
}
```

### Atualização do StatusBadge
O dropdown inline atual exibe opções de status. Adicionar após as opções de status um `<select>` para tipo de brinde:
```typescript
// No body do PATCH/POST de entrega, incluir:
body: JSON.stringify({ 
  destinatario_id, 
  data_comemorativa_id,
  status: selectedStatus,
  brinde_tipo_id: selectedTipoId || null  // novo campo
})
```

### Exibição do tipo na tabela (coluna STATUS em brindes-table.tsx)
A API retorna `brindes_tipos: { nome, tamanho, cor } | null` via join Supabase (AC6 da Story 29.5).
```tsx
// Após o StatusBadge, exibir tipo se disponível:
{entrega?.brindes_tipos && (
  <span className="text-xs text-muted-foreground block mt-0.5">
    {entrega.brindes_tipos.nome}
    {entrega.brindes_tipos.tamanho && ` · ${entrega.brindes_tipos.tamanho}`}
    {entrega.brindes_tipos.cor && ` · ${entrega.brindes_tipos.cor}`}
  </span>
)}
```

### Carregamento em page.tsx (Server Component)
```typescript
// Adicionar fetch de tipos junto com fetch de datas:
const [datasRes, tiposRes] = await Promise.all([
  fetch(`${baseUrl}/api/brindes/datas`),
  fetch(`${baseUrl}/api/brindes/tipos?ativo=true`),
])
const { data: tipos } = await tiposRes.json()
```

### Tipos TypeScript — adicionar em types.ts
```typescript
export interface BrindeTipo {
  id: string
  nome: string
  descricao: string | null
  tamanho: string | null
  cor: string | null
  ativo: boolean
}
```

### Consideração de UX para lista de tipos vazia
Quando `GET /api/brindes/tipos?ativo=true` retornar array vazio, o seletor de tipo no StatusBadge deve exibir:
```tsx
<option value="" disabled>Nenhum tipo cadastrado</option>
```
E a tabela não exibe coluna extra (AC13 garante compatibilidade).

## Tasks / Subtasks

- [ ] Task 1: Adicionar interface `BrindeTipo` ao arquivo `types.ts` existente (ou criar se necessário)
- [ ] Task 2: Criar `tipos-modal.tsx` com CRUD de tipos (criar, editar inline, ativar/desativar) (AC2, AC3, AC4, AC5, AC6)
- [ ] Task 3: Atualizar `page.tsx` — carregar tipos via `GET /api/brindes/tipos?ativo=true`, adicionar botão "Gerenciar Tipos" e passar tipos como prop (AC1, AC14, AC15)
- [ ] Task 4: Atualizar `status-badge.tsx` — adicionar seletor de tipo de brinde no dropdown de status, enviar `brinde_tipo_id` no body do POST entregas (AC8, AC9, AC10, AC11)
- [ ] Task 5: Atualizar `brindes-table.tsx` — exibir nome/tamanho/cor do tipo abaixo do badge de status quando disponível (AC12, AC13)
- [ ] Task 6: Verificar `npm run typecheck` e `npm run lint` sem erros
- [ ] Task 7: Testar no browser — fluxo completo: criar tipo → selecionar ao registrar entrega → verificar exibição na tabela

## File List

- `packages/web/src/app/dashboard/brindes/_components/tipos-modal.tsx` — criado
- `packages/web/src/app/dashboard/brindes/_components/status-badge.tsx` — modificado
- `packages/web/src/app/dashboard/brindes/_components/brindes-table.tsx` — modificado
- `packages/web/src/app/dashboard/brindes/page.tsx` — modificado

## 🤖 CodeRabbit Integration

### Story Type Analysis
- **Primary Type:** Frontend
- **Secondary Type:** API (integração com rotas de tipos)
- **Complexity:** Medium (múltiplos componentes modificados, novo modal, novo fluxo de dados)

### Specialized Agent Assignment
- **Primary:** @dev
- **Supporting:** @ux-design-expert (revisão do layout do dropdown de status com tipo)

### Quality Gate Tasks
- [ ] Pre-Commit (@dev): `npm run typecheck && npm run lint` sem erros
- [ ] Pre-Commit (@dev): Testar browser — criar tipo, registrar entrega com tipo, verificar tabela
- [ ] Pre-PR (@devops): Revisar acessibilidade do novo seletor (label + aria)

### CodeRabbit Focus Areas
- UX consistency: botão "Gerenciar Tipos" ao lado de "Gerenciar Datas" (mesmo estilo)
- Tipos inativos excluídos do seletor (AC7)
- Estado vazio: comportamento quando nenhum tipo cadastrado (AC13)
- router.refresh() após mutações para consistência de dados
