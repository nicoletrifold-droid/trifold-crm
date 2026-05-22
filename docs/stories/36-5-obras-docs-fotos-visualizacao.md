# Story 36-5: Documentos e Fotos de Obras — Visualização e Lightbox

## Status
Ready for Review

## Complexity
S (Small) — sem migration, sem novo schema; 1 nova rota API + modificações em 1 componente existente

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run type-check", "npm run lint"]
```

## Story

**As a** usuário com acesso ao módulo de obras,
**I want** poder abrir/visualizar um documento e ver uma foto em tamanho completo diretamente no painel,
**so that** consiga revisar o conteúdo antes de decidir excluir ou trocar um arquivo, sem precisar baixar localmente ou sair do painel.

## Acceptance Criteria

1. Na aba **Documentos** de uma obra, cada item da lista exibe um botão "Visualizar" (ícone de olho ou link) ao lado do botão de excluir existente. Ao clicar:
   - O frontend chama `GET /api/admin/obras/{obraId}/documentos/{docId}/signed-url`
   - O botão exibe estado de carregamento enquanto aguarda
   - Em caso de sucesso, o arquivo abre em nova aba do navegador (`window.open(url, '_blank')`)
   - Em caso de erro, exibe mensagem inline temporária no lugar do botão (ex.: "Erro ao gerar link")

2. O endpoint `GET /api/admin/obras/[obra_id]/documentos/[doc_id]/signed-url`:
   - Requer autenticação via `requireAuth()`, roles `admin | supervisor | obras`
   - Busca o `storage_path` do documento em `obra_documentos` filtrando por `doc_id`, `obra_id` e `org_id`
   - Retorna 404 se não encontrado
   - Chama `supabase.storage.from("obra-docs").createSignedUrl(doc.storage_path, 3600)` (validade: 1 hora)
   - Retorna `{ url: string }` com status 200
   - Em caso de erro do storage, retorna 500 com `{ error: string }`

3. Na aba **Fotos** de uma obra, clicar em uma miniatura abre um lightbox (overlay tela cheia) exibindo a imagem em tamanho completo. O lightbox:
   - É implementado diretamente em `obra-detail-tabs.tsx` via estado local (`lightboxFoto: Foto | null`)
   - Usa a mesma URL pública já calculada no grid: `${supabaseUrl}/storage/v1/object/public/obra-fotos/${foto.storage_path}`
   - Overlay com fundo `bg-black/80`, imagem centralizada com `max-h-[90vh] max-w-[90vw] object-contain`
   - Fecha ao clicar fora da imagem (no overlay) ou ao pressionar `Escape` (via `useEffect` com event listener)
   - Exibe o `foto.caption` abaixo da imagem quando preenchido
   - **NÃO** remove o `FotoDeleteButton` existente no grid de miniaturas

4. Não há alteração no comportamento de exclusão — os botões de excluir existentes em documentos e fotos continuam funcionando normalmente.

5. O acesso ao endpoint de signed-url é idêntico ao acesso à listagem de documentos: roles `admin | supervisor | obras`. Não é restrito a `admin`.

## Scope

### IN
- Novo endpoint `GET /api/admin/obras/[obra_id]/documentos/[doc_id]/signed-url`
- Botão "Visualizar" na lista de documentos em `obra-detail-tabs.tsx`
- Lightbox de fotos em `obra-detail-tabs.tsx`

### OUT
- Substituição do arquivo de um documento (upload de nova versão)
- Lightbox com navegação entre fotos (anterior/próxima)
- Download forçado (o signed URL já permite abrir/baixar conforme o browser do usuário)
- Preview inline de documentos (PDF embed) — abrir em nova aba é suficiente
- Controle de quem pode visualizar vs. excluir (mesmo role para ambas as ações)
- Histórico de acesso / auditoria de visualizações

## Dependencies
- Story 36-3 (InReview) — não bloqueia diretamente, mas o mesmo módulo de obras
- `requireAuth()` de `@web/lib/api-auth` — padrão já em uso
- `supabase.storage.createSignedUrl` — API Supabase Storage, sem configuração adicional
- Bucket `obra-docs` já existe e foi utilizado no upload de documentos (POST documentos route)
- Bucket `obra-fotos` já existe e é público (URL direta já usada no grid)

## Dev Notes

### Nova rota — `GET /api/admin/obras/[obra_id]/documentos/[doc_id]/signed-url`

```typescript
// Localização: packages/web/src/app/api/admin/obras/[obra_id]/documentos/[doc_id]/signed-url/route.ts

import { NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

const ALLOWED_ROLES = ["admin", "supervisor", "obras"]

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ obra_id: string; doc_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id, doc_id } = await params

  const { data: doc } = await supabase
    .from("obra_documentos")
    .select("storage_path")
    .eq("id", doc_id)
    .eq("obra_id", obra_id)
    .eq("org_id", appUser.org_id)
    .maybeSingle()

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { data: signed, error } = await supabase.storage
    .from("obra-docs")
    .createSignedUrl(doc.storage_path, 3600)

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Erro ao gerar URL" }, { status: 500 })
  }

  return NextResponse.json({ url: signed.signedUrl })
}
```

### Botão "Visualizar" em `obra-detail-tabs.tsx`

```typescript
// Adicionar estado no componente ObraDetailTabs:
const [viewingDocId, setViewingDocId] = useState<string | null>(null)
const [viewError, setViewError] = useState<string | null>(null)

async function handleViewDoc(docId: string) {
  setViewingDocId(docId)
  setViewError(null)
  try {
    const res = await fetch(`/api/admin/obras/${obraId}/documentos/${docId}/signed-url`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? "Erro ao gerar link")
    window.open(data.url, "_blank")
  } catch (err) {
    setViewError(err instanceof Error ? err.message : "Erro ao gerar link")
    setTimeout(() => setViewError(null), 4000)
  } finally {
    setViewingDocId(null)
  }
}

// Na renderização de cada documento:
// Ao lado do <DocDeleteButton>, adicionar:
<button
  onClick={() => handleViewDoc(doc.id)}
  disabled={viewingDocId === doc.id}
  className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50"
  title="Visualizar documento"
>
  {viewingDocId === doc.id
    ? <span className="text-xs">...</span>
    : <Eye className="h-4 w-4" />
  }
</button>
// importar Eye de "lucide-react"
// Se viewError: exibir inline abaixo do documento afetado
```

### Lightbox de fotos em `obra-detail-tabs.tsx`

```typescript
// Adicionar estado:
const [lightboxFoto, setLightboxFoto] = useState<Foto | null>(null)

// useEffect para fechar com Escape:
useEffect(() => {
  if (!lightboxFoto) return
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") setLightboxFoto(null)
  }
  window.addEventListener("keydown", onKey)
  return () => window.removeEventListener("keydown", onKey)
}, [lightboxFoto])

// Fazer a div de cada foto clicável:
<div
  key={foto.id}
  className="group relative cursor-pointer overflow-hidden rounded-lg border border-gray-200 dark:border-stone-800"
  onClick={() => setLightboxFoto(foto)}
>
  {/* ... conteúdo existente ... */}
</div>

// Lightbox overlay (ao final do componente, antes do return):
{lightboxFoto && (
  <div
    className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4"
    onClick={() => setLightboxFoto(null)}
  >
    <img
      src={`${supabaseUrl}/storage/v1/object/public/obra-fotos/${lightboxFoto.storage_path}`}
      alt={lightboxFoto.caption ?? "Foto da obra"}
      className="max-h-[90vh] max-w-[90vw] rounded object-contain shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    />
    {lightboxFoto.caption && (
      <p className="mt-3 text-sm text-white/80">{lightboxFoto.caption}</p>
    )}
  </div>
)}
```

### Localização do novo arquivo
- `packages/web/src/app/api/admin/obras/[obra_id]/documentos/[doc_id]/signed-url/route.ts`
- Criar novo diretório `signed-url/` dentro de `[doc_id]/`

### Padrão de autenticação
- API routes: `requireAuth()` → `appUser.role`
- Client Component: `fetch("/api/...")` diretamente (sem server actions)
- `.maybeSingle()` (nunca `.single()`) em queries que podem retornar 0 rows

## Tasks

- [x] 1. Criar `packages/web/src/app/api/admin/obras/[obra_id]/documentos/[doc_id]/signed-url/route.ts` com handler GET
- [x] 2. Adicionar estado `viewingDocId` + `viewErrorDoc` + função `handleViewDoc` em `obra-detail-tabs.tsx`
- [x] 3. Adicionar botão "Visualizar" (ícone Eye) na lista de documentos, ao lado do DocDeleteButton
- [x] 4. Adicionar estado `lightboxFoto` + useEffect para Escape em `obra-detail-tabs.tsx`
- [x] 5. Tornar miniaturas de fotos clicáveis e renderizar overlay do lightbox
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
  - Confirmar que o signed URL expira em 1 hora e não é cacheado no frontend
  - Confirmar isolamento de org: query filtra por `org_id` além de `obra_id` e `doc_id`
  - Confirmar que o lightbox não quebra o layout existente do grid de fotos
  - Confirmar que `e.stopPropagation()` na imagem do lightbox evita fechar ao clicar nela

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes
- Rota `GET .../signed-url` criada com isolamento de org (filtra `obra_id` + `org_id`), `.maybeSingle()`, validade de 1 hora
- `viewErrorDoc: { docId, message } | null` implementado (não `viewError` global) conforme obs @po — erro aparece apenas na linha do documento afetado
- Botão Visualizar com Eye icon + estado de loading (pulse)
- `FotoDeleteButton.handleDelete` recebe `React.MouseEvent` e chama `e.stopPropagation()` — corrige conflito com lightbox
- Lightbox com `onClick` no overlay fecha ao clicar fora; `e.stopPropagation()` na imagem evita fechar ao clicar nela; `useEffect` fecha com Escape
- `<img>` nativo no lightbox com `eslint-disable-next-line` — justificado: dimensões desconhecidas em runtime, Next.js Image com fill não se aplica a overlay fullscreen sem container dimensionado
- Erro pré-existente em `shared/commercial-rules.ts` — não relacionado a esta story

### Debug Log References
- Nenhum

## File List

- `packages/web/src/app/api/admin/obras/[obra_id]/documentos/[doc_id]/signed-url/route.ts` (criado)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx` (modificado — estados, handleViewDoc, botão Eye, lightbox)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/foto-delete-button.tsx` (modificado — stopPropagation no handleDelete)

## Change Log

| Date | Agent | Change |
|------|-------|--------|
| 2026-05-22 | @sm | Story criada |
| 2026-05-22 | @dev | Implementação completa — 6 tasks concluídas. Status → Ready for Review |
| 2026-05-22 | @po | Validação GO — 9/10. Obs: (1) FotoDeleteButton dentro da div clicável — @dev deve adicionar stopPropagation para evitar abrir lightbox ao excluir; (2) viewError precisa de viewErrorDocId para erro aparecer na linha correta; (3) usar Image do Next.js no lightbox ou justificar img nativo. Status → Ready |
