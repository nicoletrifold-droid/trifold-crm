# Story 31.3 — UI: Painel de Aprovações e Indicadores de Status

## Status: Ready for Review

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run lint", "npm run type-check", "browser visual check"]

## Story

**Como** administrador ou supervisor,
**Quero** ver os uploads pendentes de aprovação com um painel dedicado na obra e ser notificado visualmente sobre novas pendências,
**Para que** eu possa aprovar ou rejeitar cada arquivo antes da publicação para o cliente.

**Como** usuário com perfil `obras`,
**Quero** ver o status dos meus uploads (pendente / aprovado / rejeitado) com destaque visual,
**Para que** eu saiba se meu conteúdo está aguardando revisão ou já foi publicado/rejeitado.

## Contexto

Terceira e última story do Epic 31. Depende das Stories 31.1 (schema) e 31.2 (API).

Esta story implementa toda a camada visual do workflow de aprovação:

1. **Aba "Aprovações"** na página da obra — visível apenas para `admin` e `supervisor` — lista uploads pendentes com preview, botões de aprovar/rejeitar e modal de motivo de rejeição.
2. **Indicador visual nas abas Fotos/Documentos** — uploads com `status='pendente'` aparecem com opacidade reduzida e badge "Aguardando aprovação" quando vistos pelo perfil `obras`. Ao perfil `admin`/`supervisor` esses itens aparecem na aba de Aprovações, não nas abas principais.
3. **Badge de pendências na sidebar** — contador numérico ao lado do item "Obras" para `admin`/`supervisor`.

## Acceptance Criteria

- [ ] AC1: Adicionar tipo `Tab = "aprovacoes"` ao union existente em `obra-detail-tabs.tsx`. A aba "Aprovações (N)" só aparece no array `tabs` quando `userRole` é `admin` ou `supervisor`. O contador `N` representa o total de pendentes da obra.
- [ ] AC2: Aba "Aprovações" exibe lista de itens pendentes de `GET /api/admin/obras/[obra_id]/aprovacoes`. Cada item mostra:
  - Preview: thumbnail para fotos (tag `<img>` com a signed URL) ou ícone de arquivo para documentos
  - Nome/identificador: caption da foto ou nome do documento
  - Tipo: badge "Foto" ou "Documento"
  - Enviado por: nome do usuário obras
  - Data de envio: `created_at` formatado em pt-BR
  - Botão "Aprovar" (verde) e botão "Rejeitar" (vermelho)
- [ ] AC3: Botão "Aprovar" aciona `PATCH /api/admin/obras/[obra_id]/aprovacoes/[id]` com `{ acao: 'aprovar' }`. Após sucesso, remove o item da lista local (otimistic update) e exibe toast/mensagem de confirmação. Não recarrega a página.
- [ ] AC4: Botão "Rejeitar" abre modal com campo de texto obrigatório "Motivo da rejeição". Modal tem botão "Confirmar rejeição" (desabilitado enquanto o campo estiver vazio) e "Cancelar". Ao confirmar, aciona `PATCH` com `{ acao: 'rejeitar', motivo_rejeicao: string }`. Após sucesso, remove o item da lista e fecha o modal.
- [ ] AC5: Estado de loading nos botões durante a requisição (disabled + spinner ou texto "Aprovando..."/"Rejeitando..."). Previne duplo-clique.
- [ ] AC6: Mensagem de estado vazio na aba "Aprovações" quando não há pendências: "Nenhum upload aguardando aprovação." com ícone de check.
- [ ] AC7: Na aba "Fotos", quando o usuário autenticado tem `role === 'obras'`, os uploads com `status='pendente'` são exibidos **junto às fotos aprovadas** porém com:
  - `opacity-50` ou equivalente (visual mais claro/acinzentado)
  - Badge amarelo "Aguardando aprovação" abaixo da foto
  - Sem botão de excluir (não pode interagir, apenas visualizar)
  - Se `status='rejeitado'`: badge vermelho "Rejeitado" + tooltip ou texto com o `motivo_rejeicao`
- [ ] AC8: Na aba "Documentos", mesma lógica do AC7 para documentos pendentes/rejeitados.
- [ ] AC9: Para `admin` e `supervisor`, os uploads com `status='pendente'` NÃO aparecem nas abas "Fotos" e "Documentos" (evita duplicação — já aparecem em "Aprovações"). As abas Fotos/Documentos continuam exibindo apenas registros das tabelas `obra_fotos` e `obra_documentos` (publicados).
- [ ] AC10: Badge na sidebar ao lado do item "Obras" para `admin` e `supervisor`. Modificar `packages/web/src/app/dashboard/layout.tsx` (Server Component) seguindo o padrão existente de `mensagensCount`: adicionar query `supabase.from("obra_upload_aprovacoes").select("id", { count: "exact", head: true }).eq("org_id", user.orgId).eq("status", "pendente")` ao `Promise.all` existente (somente se `permissions["obras"]` for true). Passar o resultado como `badge` no `NAV_ITEM_OBRAS`: `{ ...NAV_ITEM_OBRAS, badge: aprovacoesPendentesCount ?? 0 }`. O badge atualiza a cada navegação (comportamento consistente com os outros badges do sistema).
- [ ] AC11: A página `dashboard/obras/[obra_id]/page.tsx` passa `userRole` para `ObraDetailTabs` se ainda não passa. Busca os uploads pendentes da obra via `GET /api/admin/obras/[obra_id]/aprovacoes?status=pendente` no server component e passa como prop inicial para hidratação sem flash.
- [ ] AC12: Todos os novos elementos visuais respeitam o tema claro/escuro (variantes `dark:`). Padrão: cards `dark:bg-stone-900 dark:ring-1 dark:ring-stone-800`, textos `dark:text-stone-100`/`dark:text-stone-400`.
- [ ] AC13: Suporte a `?tab=aprovacoes` na URL — ao abrir a página com este query param, a aba "Aprovações" é selecionada automaticamente (link do email da Story 31.2).

## Escopo

**IN:**
- Aba "Aprovações" em `obra-detail-tabs.tsx`
- Modal de rejeição com campo obrigatório
- Indicadores visuais (opacidade + badge) nas abas Fotos e Documentos para role `obras`
- Badge de pendências na sidebar
- Suporte a `?tab=aprovacoes` na URL

**OUT:**
- Push notifications (fora do escopo deste epic)
- Página dedicada de aprovações (usa aba na obra)
- Histórico de aprovações/rejeições anteriores (fora do escopo)
- Edição de uploads pendentes

## Dependências

- **Requer:** Story 31.2 Done — rotas de API funcionando
- **Arquivos a modificar:**
  - `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx`
  - `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx`
  - `packages/web/src/app/dashboard/layout.tsx` — adicionar `aprovacoesPendentesCount` ao `Promise.all` e `{ ...NAV_ITEM_OBRAS, badge: aprovacoesPendentesCount ?? 0 }` ao `navItems`
- **Novos componentes a criar:**
  - `aprovacoes-tab.tsx` — aba de aprovações completa (Client Component)
  - `rejeitar-modal.tsx` — modal de rejeição com campo obrigatório

## Dev Notes

### Estrutura da aba de aprovações

```typescript
// packages/web/src/app/dashboard/obras/[obra_id]/_components/aprovacoes-tab.tsx
"use client"

interface AprovacaoItem {
  id: string
  tipo: "foto" | "documento"
  storage_path: string
  signed_url: string | null
  metadata: Record<string, unknown>
  enviado_por_nome: string
  created_at: string
}

interface AprovacoesTabProps {
  obraId: string
  initialItems: AprovacaoItem[]
}
```

### Badge na aba

```typescript
// Em obra-detail-tabs.tsx, adicionar ao tabs array:
...(["admin", "supervisor"].includes(userRole)
  ? [{ key: "aprovacoes" as Tab, label: `Aprovações${totalPendentes > 0 ? ` (${totalPendentes})` : ""}` }]
  : [])
```

### Visual de pendente/rejeitado para role obras

```tsx
// Na renderização de fotos, para role obras:
{foto.status === "pendente" && (
  <div className="relative opacity-50">
    <img src={signedUrl} alt={foto.caption ?? "Foto"} className="..." />
    <span className="absolute bottom-1 left-1 rounded bg-yellow-400/90 px-1.5 py-0.5 text-xs font-medium text-yellow-900">
      Aguardando aprovação
    </span>
  </div>
)}
{foto.status === "rejeitado" && (
  <div className="relative opacity-40">
    <img src={signedUrl} alt={foto.caption ?? "Foto"} className="grayscale" />
    <span className="absolute bottom-1 left-1 rounded bg-red-500/90 px-1.5 py-0.5 text-xs font-medium text-white">
      Rejeitado
    </span>
  </div>
)}
```

### Badge na sidebar — padrão Server Component

O layout em `packages/web/src/app/dashboard/layout.tsx` já busca `mensagensCount` e `alertCount` no servidor. Seguir o mesmo padrão:

```typescript
// Em layout.tsx — adicionar ao Promise.all existente (linhas 92-107):
const [{ count: alertCount }, { count: mensagensCount }, { count: aprovacoesPendentesCount }] =
  permissions["alertas"] || permissions["mensagens"] || permissions["obras"]
    ? await Promise.all([
        supabase.from("follow_up_log")...  // existente
        supabase.from("obra_mensagens")... // existente
        permissions["obras"] && ["admin", "supervisor"].includes(user.role)
          ? supabase
              .from("obra_upload_aprovacoes")
              .select("id", { count: "exact", head: true })
              .eq("org_id", user.orgId)
              .eq("status", "pendente")
          : Promise.resolve({ count: 0 }),
      ])
    : [{ count: 0 }, { count: 0 }, { count: 0 }]

// Na montagem de navItems:
...(permissions["obras"]
  ? [{ ...NAV_ITEM_OBRAS, badge: aprovacoesPendentesCount ?? 0 }]
  : []),
```

O badge atualiza a cada navegação — sem necessidade de polling (comportamento consistente com `mensagensCount`).

### Suporte a ?tab=aprovacoes

```typescript
// Em ObraDetailTabs, receber initialTab como prop:
const [tab, setTab] = useState<Tab>(props.initialTab ?? "fases")

// Em page.tsx (server component):
const initialTab = (await searchParams).tab as Tab | undefined
```

### Prop userRole em ObraDetailTabs

Verificar se `ObraDetailTabs` já recebe `userRole`. Se não, adicionar ao interface `ObraDetailTabsProps` e passar de `page.tsx` via `appUser.role`.

## Tasks / Subtasks

- [x] Task 1 (AC11, AC13): Modificar `page.tsx` da obra — buscar pendentes no server, passar `userRole`, `initialAprovacoes` e `initialTab` para `ObraDetailTabs`
- [x] Task 2 (AC1): Adicionar tipo `"aprovacoes"` ao `Tab` union e condicionalmente ao array `tabs` em `obra-detail-tabs.tsx`; adicionar prop `userRole` e `initialAprovacoes`
- [x] Task 3 (AC2, AC5, AC6): Criar `aprovacoes-tab.tsx` com listagem de pendentes, preview de foto/ícone de doc, botões Aprovar/Rejeitar com loading state e estado vazio
- [x] Task 4 (AC3): Implementar handler de aprovação no `aprovacoes-tab.tsx` — fetch PATCH, optimistic update, mensagem de sucesso
- [x] Task 5 (AC4): Criar `rejeitar-modal.tsx` com campo obrigatório; implementar handler de rejeição
- [x] Task 6 (AC7, AC8): Modificar aba Fotos em `obra-detail-tabs.tsx` — para role `obras`, incluir uploads pendentes/rejeitados com visual muted + badges; para admin/supervisor, ocultar pendentes da aba Fotos
- [x] Task 7 (AC8): Mesma lógica para aba Documentos
- [x] Task 8 (AC10): Adicionar badge de pendências globais na sidebar
- [x] Task 9 (AC12): Verificar tema claro/escuro em todos os novos elementos
- [x] Task 10 (AC13): Suporte a `?tab=aprovacoes` na URL

## Checklist Pré-Commit

- [ ] Aba "Aprovações" visível apenas para `admin` e `supervisor`
- [ ] Role `obras` vê seus uploads pendentes com visual muted (opacity-50) nas abas Fotos/Documentos
- [ ] Admin/supervisor NÃO vê pendentes nas abas Fotos/Documentos (evita duplicação)
- [ ] Modal de rejeição bloqueia submit se motivo vazio
- [ ] Botões desabilitados durante loading
- [ ] Badge na sidebar some quando `total === 0`
- [ ] URL `?tab=aprovacoes` abre aba correta
- [ ] Tema escuro aplicado em todos os novos elementos
- [ ] `npm run lint` e `npm run type-check` passando

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: Frontend/UI
- Secondary Type(s): State management, UX
- Complexity: High (múltiplos componentes, lógica condicional por role, polling)

**Specialized Agent Assignment:**
- Primary Agents: @dev
- Supporting Agents: N/A

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): Testar fluxo completo no browser (upload → pendente visual → aprovação → sumiu da aba)
- [ ] Pre-PR (@devops): Confirmar que lint e type-check passam

**CodeRabbit Focus Areas:**
- Lógica condicional por role (admin/supervisor vs obras)
- Optimistic update correto (sem stale state)
- Tema claro/escuro em todos os novos elementos
- Acessibilidade básica no modal (focus trap, ESC para fechar)

**Self-Healing Configuration:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Severity Filter: CRITICAL, HIGH

## File List

- `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx` — modificado: userRole, initialAprovacoes, initialTab, busca server-side de aprovações
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx` — modificado: aba Aprovações, visual muted para obras, badge tab, suporte a ?tab=
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/aprovacoes-tab.tsx` — criado: listagem, aprovar/rejeitar, optimistic update, estado vazio
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/rejeitar-modal.tsx` — criado: modal com campo obrigatório, ESC para fechar
- `packages/web/src/app/dashboard/layout.tsx` — modificado: badge obras na sidebar via Promise.all server-side

## Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-05-25 | @sm (River) | Story criada — Draft |
| 2026-05-25 | @po (Pax) | Validação 10-pt: 7/10 GO — corrigido AC10 (Server Component pattern vs SWR polling); adicionado path exato do layout.tsx; status → Ready |
| 2026-05-25 | @dev (Dex) | Implementação completa — 5 arquivos (2 modificados, 3 criados) — status → Ready for Review |
