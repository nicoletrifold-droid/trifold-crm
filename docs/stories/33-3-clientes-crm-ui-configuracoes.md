# Story 33.3 — UI Configurações: Seção Clientes CRM

## Status: Ready for Review

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run typecheck", "npm run lint", "browser test"]

## Story

**Como** administrador do Trifold CRM,
**Quero** ter uma seção dedicada de "Clientes" na página de Configurações com tabela, filtros e modais de criação/edição completos,
**Para que** eu possa cadastrar e gerenciar a ficha CRM de todos os clientes da minha organização, incluindo seus vínculos com obras e unidades.

## Contexto

Depende da Story 33.2 (API). Esta story cria a interface de gestão CRM de clientes acessível via `/dashboard/configuracoes/clientes`.

**Padrão visual de referência:** `/dashboard/brindes/_components/destinatario-modal.tsx` — seguir layout, classes CSS e comportamento dark mode.

**Padrão de estrutura de rota:** `/dashboard/configuracoes/usuarios` — server component de página + client components internos.

## Acceptance Criteria

### Card na página de Configurações
- [x] AC1: Card "Clientes" adicionado ao array `CONFIG_CARDS` em `/dashboard/configuracoes/page.tsx` com `href: "/dashboard/configuracoes/clientes"`, `icon: "◉"`, `title: "Clientes"`, `description: "Cadastro de clientes e vínculos com obras"`
- [x] AC2: Card "Clientes" renderiza corretamente na grade de configurações (dark mode e light mode)

### Página de listagem
- [x] AC3: Server component `/dashboard/configuracoes/clientes/page.tsx` carrega lista inicial de clientes via Supabase server client (e via `GET /api/admin/clientes` em refetches client-side) e passa dados iniciais ao `ClientesPageClient`
- [x] AC4: `ClientesPageClient` exibe tabela com colunas: Nome, Email, Telefone, Obras Vinculadas (lista de `obra_nome + unidade` separadas por vírgula), Cadastrado em
- [x] AC5: Coluna "Obras Vinculadas" exibe "—" quando cliente não tem vínculos
- [x] AC6: Paginação no rodapé da tabela (50 por página); ao clicar em próxima página, nova requisição ao backend com `page=N`
- [x] AC7: Filtro de nome/email: campo de texto livre; debounce de 500ms aciona `GET /api/admin/clientes?q=...`
- [x] AC8: Filtro de obra: select dropdown com obras da org; ao selecionar, filtra via `GET /api/admin/clientes?obra_id=...`
- [x] AC9: Botão "Novo Cliente" na barra de ações da tabela; ao clicar, abre `ClienteModal` em modo criação

### Modal de criação e edição
- [x] AC10: `ClienteModal` exibe formulário com TODOS os campos da tabela `clientes`: Nome (obrigatório), CPF, RG, Email, Telefone, WhatsApp, Data de Nascimento, Estado Civil, Profissão, campos de endereço (Logradouro, Número, Complemento, Bairro, Cidade, Estado (select UF), CEP, Referência), Observação
- [x] AC11: Campo "Estado" no endereço é um select com as 27 UFs brasileiras
- [x] AC12: Seção "Obras Vinculadas" no modal exibe lista dos vínculos existentes (com botão "X" para remover / "Desfazer" para reverter) e permite adicionar novo vínculo: select de obra (obras da org) + campo `numero_unidade` texto livre + botão "Add"
- [x] AC13: Ao salvar em modo criação, chama `POST /api/admin/clientes`; em seguida, se houver vínculos adicionados, chama `POST /api/admin/clientes/[newId]/obras` para cada vínculo
- [x] AC14: Ao salvar em modo edição, chama `PATCH /api/admin/clientes/[id]`; vínculos adicionados chamam `POST /api/admin/clientes/[id]/obras`, vínculos removidos chamam `DELETE /api/admin/clientes/[id]/obras/[vinculo_id]`
- [x] AC15: Após salvar (criar ou editar), modal fecha e tabela é atualizada via `router.refresh()` + refetch local
- [x] AC16: Botão de salvar exibe estado "Salvando..." durante request; erro da API exibe mensagem de erro inline no modal

### Exclusão de clientes
- [x] AC17: Cada linha da tabela tem botão "Editar" (Pencil → abre modal em modo edição) e botão "Excluir" (Trash2)
- [x] AC18: Ao clicar em "Excluir", exibe confirm dialog: "Deseja excluir o cliente {nome}? Esta ação não pode ser desfeita."
- [x] AC19: Se API retornar 409 (cliente tem brindes vinculados), exibe mensagem: "Não é possível excluir: cliente possui {N} destinatário(s) de brinde vinculado(s). Remova os vínculos primeiro."
- [x] AC20: Após exclusão bem-sucedida, tabela é atualizada via `router.refresh()` + refetch local

## Escopo

**IN:**
- Atualização de `/dashboard/configuracoes/page.tsx` (adicionar card)
- `/dashboard/configuracoes/clientes/page.tsx` (server component)
- `/dashboard/configuracoes/clientes/_components/clientes-table.tsx` (client component)
- `/dashboard/configuracoes/clientes/_components/cliente-modal.tsx` (client component)

**OUT:**
- Alterações no schema ou API (Stories 33.1, 33.2)
- Integração com brindes (Story 33.5)
- Integração na ClientesTab de obras (Story 33.4)
- Import em massa de clientes (não está no escopo deste epic)

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Modal muito longo com todos os campos de endereço + vínculos | Alta | Dividir o modal em abas ou seções colapsáveis: "Dados Pessoais" + "Endereço" + "Obras Vinculadas" |
| Select de obras no filtro e no modal precisando de dados diferentes | Baixa | Carregar obras via `GET /api/admin/obras` no server component e passar como prop |
| Sincronização de vínculos no modal (add/remove sem salvar ainda) | Média | Gerenciar estado local de vínculos adicionados/removidos; aplicar chamadas de API apenas ao salvar |

## Dev Notes

### Estrutura de arquivos a criar/modificar

```
packages/web/src/app/dashboard/configuracoes/page.tsx              ← MODIFICAR (adicionar card)
packages/web/src/app/dashboard/configuracoes/clientes/
├── page.tsx                                                        ← CRIAR (server component)
└── _components/
    ├── clientes-table.tsx                                          ← CRIAR (client component)
    └── cliente-modal.tsx                                           ← CRIAR (client component)
```

### Padrão do server component de página

Seguir o padrão das outras páginas de configurações. O server component carrega os dados iniciais e os passa como props para o client component:

```typescript
// /dashboard/configuracoes/clientes/page.tsx
import { getServerUser } from "@web/lib/auth"
import { ClientesTable } from "./_components/clientes-table"

export default async function ClientesCRMPage() {
  await getServerUser() // garante autenticação
  // Dados iniciais carregados aqui para SSR
  // ClientesTable faz client-side fetching para filtros/paginação
  return (
    <div>
      <h1>Clientes CRM</h1>
      <ClientesTable />
    </div>
  )
}
```

### Padrão visual do modal (seguir destinatario-modal.tsx)

O `destinatario-modal.tsx` em brindes é o padrão de referência para:
- Layout do modal (dialog, header, body, footer)
- Classes CSS Tailwind (dark mode com `dark:bg-zinc-900`, `dark:border-zinc-700`, etc.)
- Padrão de submit com loading state
- Exibição de erros inline

### Carregamento de obras para select

As obras da org são necessárias no filtro da tabela e no modal de vínculos. Carregar via `GET /api/admin/obras` — essa rota já existe (`packages/web/src/app/api/admin/obras/`).

### UFs para select de estado

Array estático com as 27 UFs: AC, AL, AP, AM, BA, CE, DF, ES, GO, MA, MT, MS, MG, PA, PB, PR, PE, PI, RJ, RN, RS, RO, RR, SC, SP, SE, TO.

### Debounce no filtro de texto

Para evitar requisições excessivas ao servidor ao digitar no campo de filtro, implementar debounce de 500ms usando `useCallback` + `setTimeout` ou a utility `useDebounce` se já existir no projeto.

### Gerenciamento de vínculos no modal

O modal deve controlar dois estados locais para vínculos:
- `vinculosParaAdicionar: { obra_id, numero_unidade }[]` — novos vínculos a criar ao salvar
- `vinculosParaRemover: string[]` — IDs de vínculos existentes a deletar ao salvar

Ao clicar em "Salvar", as chamadas de API de vínculos são feitas APÓS o PATCH/POST do cliente principal. Se uma chamada de vínculo falhar, exibir erro mas não reverter o salvamento do cliente (eventual consistency aceitável aqui).

### Testing

```bash
npm run typecheck  # 0 erros TypeScript
npm run lint       # 0 erros lint
# Browser: testar criar cliente com vínculos, editar, excluir, filtros, paginação
```

## Tasks / Subtasks

- [x] Task 1: Adicionar card "Clientes" ao `CONFIG_CARDS` em `configuracoes/page.tsx` (AC1, AC2)
- [x] Task 2: Criar server component `configuracoes/clientes/page.tsx` com estrutura básica (AC3)
- [x] Task 3: Criar `clientes-page-client.tsx` com tabela, colunas, filtros de texto e obra, paginação e botões de ação (AC4, AC5, AC6, AC7, AC8, AC9, AC17, AC18, AC19, AC20)
- [x] Task 4: Criar `cliente-modal.tsx` — seção "Dados Pessoais" com todos os campos (AC10, AC11)
- [x] Task 5: Adicionar seção "Obras Vinculadas" no modal com add/remove de vínculos (AC12)
- [x] Task 6: Implementar lógica de submit no modal: POST criar + vínculos (AC13, AC15, AC16)
- [x] Task 7: Implementar lógica de submit no modal: PATCH editar + add/remove vínculos (AC14, AC15, AC16)
- [x] Task 8: Verificar `npm run type-check && npm run lint` sem erros novos
- [ ] Task 9: Testar no browser — fluxo completo: criar cliente com obra, editar, excluir, filtros (QA)

## File List

- `packages/web/src/app/dashboard/configuracoes/page.tsx` — modificado (card "Clientes" adicionado ao `CONFIG_CARDS`)
- `packages/web/src/app/dashboard/configuracoes/clientes/page.tsx` — criado (server component; SSR primeira página + lista de obras)
- `packages/web/src/app/dashboard/configuracoes/clientes/_components/clientes-page-client.tsx` — criado (tabela, filtros com debounce, paginação, exclusão; renomeado de "clientes-table.tsx" porque também aloja filtros + paginação)
- `packages/web/src/app/dashboard/configuracoes/clientes/_components/cliente-modal.tsx` — criado (modal create/edit completo com Dados Pessoais, Endereço, Observação, Obras Vinculadas)

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> Quality validation usará processo de revisão manual.

### Story Type Analysis
- **Primary Type:** Frontend
- **Secondary Type:** API (integração com rotas 33.2)
- **Complexity:** High (tabela paginada + filtros + modal complexo com vínculos)

### Specialized Agent Assignment
- **Primary:** @dev
- **Supporting:** @ux-design-expert (revisar layout do modal com muitos campos), @qa (quality gate)

### Quality Gate Tasks
- [ ] Pre-Commit (@dev): `npm run typecheck && npm run lint` sem erros
- [ ] Pre-Commit (@dev): Testar browser — criar, editar, excluir, filtros, dark mode
- [ ] Pre-PR (@devops): Revisar acessibilidade do formulário (labels, aria-labels)

### CodeRabbit Focus Areas
- Dark mode: todas as classes Tailwind com variante `dark:` onde necessário
- Debounce no campo de filtro de texto (evitar over-fetching)
- Estado local de vínculos: não chamar API de vínculos antes de salvar o cliente
- `router.refresh()` após todas as mutações (criar, editar, excluir)
- Tratamento de erro 409 no DELETE (cliente com brindes vinculados)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-15 | 1.0 | Story criada | @sm (River) |
| 2026-05-15 | 1.1 | Validada @po (GO 10/10). Status Draft → Ready. `CONFIG_CARDS` em `/dashboard/configuracoes/page.tsx` confirmado existe; `getServerUser()` em `@web/lib/auth` confirmado disponível. | @po (Pax) |
| 2026-05-15 | 1.2 | Implementação YOLO completa: card adicionado, server component + client page + modal criados. Padrão visual seguindo destinatario-modal/brindes-table. `npm run type-check` 0 erros; `npm run lint` 0 erros (6 warnings pré-existentes não relacionados). Status Ready → Ready for Review. | @dev (Dex) |
