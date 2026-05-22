# Story 36-4: Obras Arquivadas — Visibilidade e Reativação Admin

## Status
Ready for Review

## Complexity
S (Small) — sem migration, sem nova rota; apenas mudanças em 3 arquivos existentes + 1 componente novo

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run type-check", "npm run lint"]
```

## Story

**As a** administrador da plataforma,
**I want** ver as obras arquivadas na listagem com visual esmaecido e poder reativá-las com um clique,
**so that** saiba que existem obras arquivadas, consiga identificá-las visualmente, e recupere uma obra removida por engano sem precisar de intervenção técnica no banco de dados.

## Acceptance Criteria

1. A query da página `dashboard/obras/page.tsx` busca **todas** as obras da org (sem filtro `deleted_at IS NULL`), incluindo a coluna `deleted_at` no SELECT. As obras são separadas em dois grupos em JS: `ativas` (deleted_at IS NULL) e `arquivadas` (deleted_at IS NOT NULL).

2. O contador no cabeçalho da página exibe apenas as obras ativas: `{ativas.length} obra(s) cadastrada(s)`. Se houver obras arquivadas, exibe uma linha secundária abaixo: `{arquivadas.length} arquivada(s)`.

3. As obras ativas são renderizadas normalmente (comportamento atual). As obras arquivadas aparecem **abaixo** das ativas, com as seguintes diferenças visuais na linha da tabela:
   - `opacity-50` na linha toda
   - Badge "Arquivada" (fundo cinza escuro, texto cinza claro) no lugar do badge de status
   - Barra de progresso esmaecida (sem cor laranja — usar cinza)
   - Coluna de ação: exibe botão "Reativar" (somente para `user.role === "admin"`) em vez do link "Gerenciar"; para não-admins, exibe apenas o link "Gerenciar" normalmente

4. O componente `ObraReativarButton` em `packages/web/src/app/dashboard/obras/_components/obra-reativar-button.tsx` é um Client Component que:
   - Recebe props: `obraId: string`, `obraName: string`
   - Ao clicar exibe uma confirmação simples inline (sem modal grande): `"Reativar '${obraName}'?"` com botões "Sim" e "Cancelar"
   - Ao confirmar, chama `PATCH /api/admin/obras/{obraId}` com body `{ deleted_at: null }`
   - Em caso de sucesso, chama `router.refresh()` para recarregar a listagem com os dados atualizados
   - Exibe loading state no botão durante a requisição
   - Em caso de erro da API, exibe mensagem inline no lugar dos botões de confirmação

5. O handler `PATCH /api/admin/obras/[obra_id]/route.ts` passa a suportar reativação: se `body.deleted_at === null` E o usuário for `admin`, adiciona `deleted_at: null` ao objeto `updates`. Para roles não-admin, o campo `deleted_at` é ignorado silenciosamente (sem erro).

6. A query de `existing` no PATCH handler **não** filtra por `deleted_at` (já está assim) — garantindo que obras arquivadas também possam ser encontradas para reativação.

7. O link "Gerenciar" de obras arquivadas (visível para não-admins) leva para a página de detalhe normalmente. A page de detalhe `dashboard/obras/[obra_id]/page.tsx` e o GET da API continuam filtrando `deleted_at IS NULL` — ou seja, acessar diretamente uma obra arquivada via URL resulta em `notFound()`. Isso é intencional: a reativação só é possível pela listagem.

8. A API de listagem `GET /api/admin/obras/route.ts` passa a incluir `deleted_at` no SELECT e remove o filtro `deleted_at IS NULL`, retornando todas as obras. O frontend que consome esta API já filtra por `deleted_at` em JS se necessário.

## Scope

### IN
- Modificação da query da listagem (page + API) para incluir obras arquivadas
- Visual diferenciado para linhas arquivadas (opacity, badge, barra de progresso)
- Componente `ObraReativarButton` com confirmação inline
- Suporte a `deleted_at: null` no PATCH handler (admin only)
- Contador secundário de obras arquivadas no cabeçalho

### OUT
- Filtro/toggle para ocultar/exibir obras arquivadas (futuro)
- Paginação separada para obras arquivadas
- Notificação de email ao reativar
- Histórico de reativações
- Reativação em massa

## Dependencies
- Story 36-3 (InReview) — depende da coluna `deleted_at` na tabela `obras` (migration 058) e do soft delete implementado
- `getServerUser()` retorna `{ role }` — já disponível na page
- `router.refresh()` do `next/navigation` — padrão já usado no projeto

## Dev Notes

### Query modificada — `dashboard/obras/page.tsx`
```typescript
// ANTES (Story 36-3):
const { data: obras } = await supabase
  .from("obras")
  .select("id, name, status, progress_pct, expected_delivery_date")
  .eq("org_id", user.orgId)
  .is("deleted_at", null)
  .order("created_at", { ascending: false })

// DEPOIS (Story 36-4):
const { data: obras } = await supabase
  .from("obras")
  .select("id, name, status, progress_pct, expected_delivery_date, deleted_at")
  .eq("org_id", user.orgId)
  .order("created_at", { ascending: false })

// Separar em JS:
const ativas = (obras ?? []).filter((o) => !o.deleted_at)
const arquivadas = (obras ?? []).filter((o) => !!o.deleted_at)
```

### Query modificada — `api/admin/obras/route.ts` (GET listagem)
```typescript
// Remover .is("deleted_at", null) e adicionar deleted_at ao SELECT
// Retornar { obras: [...] } com campo deleted_at em cada item
```

### Suporte a reativação — `api/admin/obras/[obra_id]/route.ts` (PATCH)
```typescript
// Adicionar após os outros campos aceitos:
if ("deleted_at" in body && body.deleted_at === null && ADMIN_ONLY.includes(appUser.role)) {
  updates.deleted_at = null
}
```
Nota: a query de `existing` no PATCH já não filtra por `deleted_at` — obras arquivadas são encontradas normalmente.

### Componente ObraReativarButton — estrutura
```typescript
"use client"
// Props: obraId: string, obraName: string
// Estado: confirming: boolean, loading: boolean, error: string | null
// Fluxo: clicar "Reativar" → setConfirming(true) → mostrar inline "Reativar 'X'? [Sim] [Cancelar]"
// Ao confirmar:
//   fetch PATCH /api/admin/obras/${obraId} com body { deleted_at: null }
//   → success: router.refresh()
//   → error: setError(msg)
// Estilo: botão pequeno, variante outline/ghost em verde ou cinza
```

### Renderização das linhas arquivadas — `dashboard/obras/page.tsx`
```tsx
// Após renderizar as linhas ativas normalmente:
{arquivadas.map((obra) => (
  <tr key={obra.id} className="opacity-50">
    <td className="px-6 py-4 font-medium text-gray-500 dark:text-stone-400">{obra.name}</td>
    <td className="px-6 py-4">
      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-stone-700 dark:text-stone-400">
        Arquivada
      </span>
    </td>
    <td className="px-6 py-4">
      {/* barra cinza, sem cor laranja */}
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 rounded-full bg-gray-200 dark:bg-stone-700">
          <div className="h-1.5 rounded-full bg-gray-400" style={{ width: `${obra.progress_pct}%` }} />
        </div>
        <span className="text-xs text-gray-400">{obra.progress_pct}%</span>
      </div>
    </td>
    <td className="px-6 py-4 text-sm text-gray-400">{formatDeliveryDate(obra.expected_delivery_date)}</td>
    <td className="px-6 py-4 text-right">
      {user.role === "admin"
        ? <ObraReativarButton obraId={obra.id} obraName={obra.name} />
        : <Link href={`/dashboard/obras/${obra.id}`}>Gerenciar</Link>
      }
    </td>
  </tr>
))}
```

### Localização do novo componente
- `packages/web/src/app/dashboard/obras/_components/obra-reativar-button.tsx`
- Diretório `_components/` no nível `obras/` (não dentro de `[obra_id]/`) — acessível pela listagem

### Padrão de autenticação
- Pages SSR: `getServerUser()` → `user.role`
- API routes: `requireAuth()` → `appUser.role`
- Client Components: `fetch("/api/...")` diretamente (não server actions)

## Tasks

- [x] 1. Modificar `dashboard/obras/page.tsx`: adicionar `deleted_at` ao SELECT, remover filtro `.is('deleted_at', null)`, separar em `ativas`/`arquivadas`, atualizar contador, renderizar arquivadas com visual diferenciado
- [x] 2. Modificar `api/admin/obras/route.ts` (GET): adicionar `deleted_at` ao SELECT e remover filtro `.is('deleted_at', null)`
- [x] 3. Modificar `api/admin/obras/[obra_id]/route.ts` (PATCH): adicionar suporte a `deleted_at: null` para admin
- [x] 4. Criar `packages/web/src/app/dashboard/obras/_components/obra-reativar-button.tsx` com confirmação inline e `router.refresh()` no sucesso
- [x] 5. Integrar `ObraReativarButton` na renderização das obras arquivadas em `page.tsx`
- [x] 6. Executar `npm run type-check` e `npm run lint` e corrigir todos os erros

## 🤖 CodeRabbit Integration

Story Type Analysis:
  Primary Type: Full-Stack (API + Frontend)
  Complexity: Small

Specialized Agent Assignment:
  Primary Agents:
    - @dev (implementação + pre-commit reviews)
  Supporting Agents:
    - @qa (gate final)

Quality Gate Tasks:
  - [ ] Pre-Commit (@dev): `npm run type-check` + `npm run lint` antes de marcar completo
  - [ ] Pre-PR (@devops): review antes de criar PR

CodeRabbit Focus Areas:
  - Confirmar que `router.refresh()` é chamado após reativação bem-sucedida (não `router.push`)
  - Confirmar que o PATCH handler ignora `deleted_at` silenciosamente para não-admin (sem 403)
  - Confirmar que a page de detalhe ainda retorna 404 para obras arquivadas (AC7)
  - Verificar que `deleted_at` não vaza para o frontend onde não é necessário

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes
- Sem migration necessária — usa coluna `deleted_at` da migration 058 (Story 36-3)
- `dashboard/obras/page.tsx`: query sem filtro deleted_at, separação JS em `ativas`/`arquivadas`, contador secundário de arquivadas, linhas arquivadas com opacity-50 + badge "Arquivada" + barra cinza + ObraReativarButton apenas para admin (não-admins não veem ação)
- `api/admin/obras/route.ts` (GET): `deleted_at` adicionado ao SELECT, filtro removido — API retorna todas as obras
- `api/admin/obras/[obra_id]/route.ts` (PATCH): suporte a `{ deleted_at: null }` admin-only; `.single()` substituído por `.maybeSingle()` no check de `existing` (obras arquivadas também são encontradas)
- `ObraReativarButton`: confirmação inline sem modal, loading state, erro inline, `router.refresh()` no sucesso
- Erros pré-existentes em `lead-detail-drawer.tsx` (lint) e `shared/commercial-rules.ts` (typecheck) — não relacionados a esta story

### Debug Log References
- Nenhum

## File List

- `packages/web/src/app/dashboard/obras/page.tsx` (modificado — query sem filtro, separação ativas/arquivadas, contador, linhas arquivadas, ObraReativarButton)
- `packages/web/src/app/api/admin/obras/route.ts` (modificado — deleted_at no SELECT, filtro removido)
- `packages/web/src/app/api/admin/obras/[obra_id]/route.ts` (modificado — suporte deleted_at: null no PATCH, single→maybeSingle)
- `packages/web/src/app/dashboard/obras/_components/obra-reativar-button.tsx` (criado)

## Change Log

| Date | Agent | Change |
|------|-------|--------|
| 2026-05-22 | @sm | Story criada |
| 2026-05-22 | @po | Validação GO — 9/10. Obs: não-admins em obras arquivadas não devem ver link "Gerenciar" clicável (levaria a 404) — @dev deve omitir a ação para não-admins. Status → Ready |
| 2026-05-22 | @dev | Implementação completa — 6 tasks concluídas. Status → Ready for Review |
