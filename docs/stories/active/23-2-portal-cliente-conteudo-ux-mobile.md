---
epic: 23
story: 23.2
title: Portal do Cliente — Conteúdo UX Mobile (Home, Fases, Fotos, Docs)
status: Done
priority: P2
created_at: 2026-05-11
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [mobile_grid, visual_consistency, data_accuracy, tap_targets]
complexity: S
estimated_hours: 2
depends_on: ["23.1"]
blocks: []
---

# Story 23.2 — Portal do Cliente: Conteúdo UX Mobile

## Contexto

**Epic 23 — Portal do Cliente: UX Mobile-First**
**Auditoria UX:** Uma (@ux-design-expert) · 2026-05-11

Esta story corrige problemas de médio/alto impacto nas 4 telas de conteúdo do portal:
Home (page.tsx), Fases (fases/page.tsx), Galeria (fotos/page.tsx) e Documentos (documentos/page.tsx).

**Depende de 23.1** apenas para verificação de regressão — pode ser desenvolvida em paralelo
se necessário, pois os arquivos não se sobrepõem.

### Infraestrutura existente relevante

- `packages/web/src/app/cliente/[obra_id]/page.tsx` — Home do portal
- `packages/web/src/app/cliente/[obra_id]/fases/page.tsx` — timeline de fases
- `packages/web/src/app/cliente/[obra_id]/_components/fases-list.tsx` — componente de lista (dashboard home)
- `packages/web/src/app/cliente/[obra_id]/fotos/page.tsx` — galeria com filtro por fase
- `packages/web/src/app/cliente/[obra_id]/documentos/page.tsx` — lista de documentos com download

### Problema raiz — card duplicado na Home

`page.tsx:150-176` renderiza 4 `StatCard`. Cards 1 e 3 exibem o mesmo valor (`currentPhase?.name`),
diferindo apenas no sub-texto. Um deles deve ser substituído por "Status" (`statusLabel`).

### Problema raiz — badges de fases inconsistentes

Dois arquivos implementam o mesmo mapeamento `status → visual` de forma diferente:
- `fases-list.tsx` usa filled backgrounds (`bg-amber-900/40`)
- `fases/page.tsx` usa border-only (`border border-amber-600/60`)
O badge "Concluída" em `fases/page.tsx` usa `border-stone-600 text-stone-300` — visualmente
idêntico ao "Pendente". Unificar ambos no padrão filled de `fases-list.tsx`.

### Problema raiz — galeria de fotos em 1 coluna

Fotos iniciam em `grid-cols-1` no mobile. Para obras de construção civil onde a comparação
visual de progresso é crítica, 2 colunas a partir do mobile é o padrão adequado.

### Problema raiz — metadados ocultos em documentos

Categoria e tamanho do arquivo usam `hidden sm:block` — no mobile o usuário baixa sem saber
o tamanho. Refatorar para linha secundária visível em todos os breakpoints.

## Story Statement

**Como** cliente da Trifold acessando o portal pelo celular,
**Quero** que a tela inicial mostre informações sem repetição, que as fases sejam visualmente
distinguíveis por status, que a galeria de fotos mostre miniaturas em 2 colunas, e que
os documentos mostrem tamanho e categoria antes do download,
**Para que** eu consiga extrair informações relevantes da minha obra rapidamente,
sem confusão ou scroll excessivo.

## Acceptance Criteria

- [ ] **AC1 — Home sem duplicatas:** os 4 StatCards da home exibem valores distintos. Nenhum label ou valor se repete entre cards.
- [ ] **AC2 — StatCard legível:** valor principal dos cards usa `text-lg font-bold` (verificar que não está mais em `text-base font-semibold`).
- [ ] **AC3 — Hero border correto:** o card hero da home usa `ring-1 ring-stone-800 ring-inset` em vez de `border border-stone-800` + `border-l-4 border-l-[#E8856A]` conflitante.
- [ ] **AC4 — Linha do timeline visível:** a linha vertical da timeline em `fases/page.tsx` usa `bg-stone-700` (não `bg-stone-800`).
- [ ] **AC5 — Badges unificados — Concluída:** em AMBAS as páginas de fases, badge "Concluída" exibe `bg-green-900/40 text-green-400`.
- [ ] **AC6 — Badges unificados — Em andamento:** em AMBAS as páginas de fases, badge "Em andamento" exibe `bg-amber-900/40 text-amber-400`.
- [ ] **AC7 — Dot de fases concluídas:** na timeline (`fases/page.tsx`), o dot de fase com status `concluida` exibe ícone de check branco sobre fundo verde.
- [ ] **AC8 — Grid de fotos 2 colunas:** em viewport 375px, a galeria de fotos mostra 2 colunas (não 1).
- [ ] **AC9 — Aspecto das fotos:** imagens usam `aspect-square` no mobile (`< sm`) e `aspect-video` em `sm` e acima.
- [ ] **AC10 — Filtros de fase com scroll horizontal:** pills de filtro em `fotos/page.tsx` usam `overflow-x-auto` com `flex-shrink-0` em cada pill — sem quebra de linha.
- [ ] **AC11 — Metadados de documento visíveis no mobile:** em viewport 375px, cada item de documento exibe categoria e tamanho em linha abaixo do nome (não oculto).
- [ ] **AC12 — Botão de download com 44px:** botão "Baixar" em `documentos/page.tsx` tem altura mínima de 44px.
- [ ] **AC13 — Sem regressão:** download de documentos, filtro por fase nas fotos e navegação geral continuam funcionando.

## 🤖 CodeRabbit Integration

**Primary Type:** Frontend · Responsividade · Consistência Visual
**Complexity:** Small — 4 arquivos, zero lógica de negócio alterada
**Max Iterations:** 2 | **Severity Filter:** CRITICAL, HIGH

**Specialized Agents:**
- Primary: `@dev` (implementação)
- Quality Gate: `@qa` (revisão mobile)

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): verificar grid, badges e metadados em DevTools mobile emulation
- [ ] Pre-PR (@devops): CodeRabbit scan foco em responsividade

**Focus Areas:**
- Consistência de classes Tailwind entre arquivos (badge unification)
- Grid responsivo sem quebra em 375px
- Tap target mínimo 44px no botão de download
- Nenhum valor hardcoded duplicado

## Tasks / Subtasks

### Task 1 — Home: remover card duplicado + aumentar legibilidade (AC1, AC2, AC3)

**Arquivo:** `packages/web/src/app/cliente/[obra_id]/page.tsx`

- [x] 1.1 — Substituir 3º StatCard (linha 165-170) por card "Status"
- [x] 1.2 — Alterar `StatCard` component: `text-base font-semibold` → `text-lg font-bold truncate`
- [x] 1.3 — Corrigir hero border: substituir `border border-stone-800 border-l-4 border-l-[#E8856A]` por `ring-1 ring-stone-800 ring-inset border-l-4 border-l-[#E8856A]`

```tsx
// Task 1.1 — Substituir 3º StatCard (linha 165-170)
// ANTES
<StatCard
  label="Fase da Obra"
  value={currentPhase?.name ?? "—"}
  sub={currentPhase ? "Em execução" : "—"}
/>
// DEPOIS
<StatCard
  label="Status"
  value={statusLabel}
  sub={obra.status === "em_andamento" ? "No prazo" : ""}
/>

// Task 1.2 — StatCard component (linha 261)
// ANTES
<p className="text-base font-semibold text-white">{value}</p>
// DEPOIS
<p className="truncate text-lg font-bold text-white">{value}</p>

// Task 1.3 — Hero div (linha 120)
// ANTES
<div className="mb-5 rounded-2xl border border-stone-800 border-l-4 border-l-[#E8856A] bg-stone-900 p-6 lg:p-8">
// DEPOIS
<div className="mb-5 rounded-2xl border-l-4 border-l-[#E8856A] bg-stone-900 p-6 ring-1 ring-inset ring-stone-800 lg:p-8">
```

---

### Task 2 — Fases: linha do timeline + badges unificados + dot de check (AC4, AC5, AC6, AC7)

**Arquivo:** `packages/web/src/app/cliente/[obra_id]/fases/page.tsx`

- [x] 2.1 — Alterar linha do timeline (linha 96): `bg-stone-800` → `bg-stone-700`
- [x] 2.2 — Substituir `STATUS_BADGE` (linhas 22-26) pelo sistema filled unificado
- [x] 2.3 — Substituir dot simples (linhas 106-108) por dot condicional com check em `concluida`

```tsx
// Task 2.1 — linha 96
// ANTES
<div className="absolute left-[7px] top-2 bottom-2 w-px bg-stone-800" />
// DEPOIS
<div className="absolute left-[7px] top-2 bottom-2 w-px bg-stone-700" />

// Task 2.2 — STATUS_BADGE (linhas 22-26)
// ANTES
const STATUS_BADGE: Record<string, string> = {
  pendente:     "border border-stone-700 text-stone-400",
  em_andamento: "border border-amber-600/60 text-amber-400",
  concluida:    "border border-stone-600 text-stone-300",
}
// DEPOIS
const STATUS_BADGE: Record<string, string> = {
  pendente:     "bg-stone-800 text-stone-400",
  em_andamento: "bg-amber-900/40 text-amber-400",
  concluida:    "bg-green-900/40 text-green-400",
}

// Task 2.3 — dot condicional (linhas 104-108)
// ANTES
<div key={fase.id} className="relative">
  <span
    className={`absolute -left-6 top-[18px] z-10 block h-3.5 w-3.5 rounded-full ${dotColor}`}
  />

// DEPOIS
<div key={fase.id} className="relative">
  {fase.status === "concluida" ? (
    <span className="absolute -left-6 top-[18px] z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-500">
      <svg className="h-2 w-2 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
      </svg>
    </span>
  ) : (
    <span className={`absolute -left-6 top-[18px] z-10 block h-3.5 w-3.5 rounded-full ${dotColor}`} />
  )}
```

**Arquivo:** `packages/web/src/app/cliente/[obra_id]/_components/fases-list.tsx`

- [x] 2.4 — Verificar `STATUS_CONFIG` (linhas 16-32): já usa o padrão filled correto — confirmar que está alinhado (não alterar se já estiver correto)

---

### Task 3 — Galeria: grid 2 colunas + aspecto + filtros scroll horizontal (AC8, AC9, AC10)

**Arquivo:** `packages/web/src/app/cliente/[obra_id]/fotos/page.tsx`

- [x] 3.1 — Alterar grid (linha 174): `grid-cols-1 gap-3 sm:grid-cols-2` → `grid-cols-2 gap-2 sm:grid-cols-2`
- [x] 3.2 — Alterar aspecto da foto (linha 182): `aspect-video` → `aspect-square sm:aspect-video`
- [x] 3.3 — Alterar container dos filtros (linha 102): `flex flex-wrap gap-2` → `flex gap-2 overflow-x-auto pb-1 scrollbar-none`
- [x] 3.4 — Adicionar `flex-shrink-0` em cada pill de filtro (Links de fase e "Todas")

```tsx
// Task 3.1 — grid (linha 174)
// ANTES
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
// DEPOIS
<div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-3">

// Task 3.2 — aspecto (linha 182)
// ANTES
<div className="relative aspect-video w-full">
// DEPOIS
<div className="relative aspect-square w-full sm:aspect-video">

// Task 3.3 — container filtros (linha 102)
// ANTES
<div className="mb-6 flex flex-wrap gap-2">
// DEPOIS
<div className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-none">

// Task 3.4 — adicionar flex-shrink-0 em cada Link de filtro
// "Todas as fases" (linha 103-110):
<Link
  href={`/cliente/${obra_id}/fotos`}
  className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${...}`}
>
// Links de fase (linha 111-120):
<Link
  key={fase.id}
  href={`/cliente/${obra_id}/fotos?fase=${fase.id}`}
  className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${...}`}
>
```

**Nota sobre `scrollbar-none`:** adicionar ao `globals.css` ou equivalente:
```css
.scrollbar-none::-webkit-scrollbar { display: none; }
.scrollbar-none { scrollbar-width: none; }
```

Verificar se o projeto tem `globals.css` em `packages/web/src/app/globals.css`. Se existir,
adicionar lá. Se não, verificar alternativa — Tailwind v3 não tem `scrollbar-none` nativo
(é do plugin `@tailwindcss/scrollbar`). Alternativa sem CSS customizado: usar `-ms-overflow-style: none`
via `style` inline ou aceitar scrollbar visível (comportamento ainda correto).

---

### Task 4 — Documentos: metadados visíveis + botão download 44px (AC11, AC12)

**Arquivo:** `packages/web/src/app/cliente/[obra_id]/documentos/page.tsx`

- [x] 4.1 — Refatorar seção de metadados (linhas 114-134): unificar em div único com linha secundária
- [x] 4.2 — Remover bloco `hidden sm:block` (linhas 127-133)
- [x] 4.3 — Alterar botão de download (linhas 137-145): adicionar `h-11` e aumentar ícone

```tsx
// Task 4.1 + 4.2 — refatorar div de info (linhas 114-134)
// ANTES
<div className="min-w-0 flex-1">
  <p className="truncate text-sm font-medium text-white">{doc.name}</p>
  {doc.filename && (
    <p className="truncate text-xs text-stone-500">{doc.filename}</p>
  )}
</div>
<div className="hidden flex-shrink-0 text-right sm:block">
  {doc.category && (
    <p className="text-xs text-stone-400">{doc.category}</p>
  )}
  <p className="text-xs text-stone-500">{formatBytes(doc.file_size_bytes)}</p>
</div>

// DEPOIS — bloco hidden removido; metadados na linha secundária
<div className="min-w-0 flex-1">
  <p className="truncate text-sm font-medium text-white">{doc.name}</p>
  <p className="mt-0.5 truncate text-xs text-stone-500">
    {[doc.category, formatBytes(doc.file_size_bytes)].filter(Boolean).join(" · ")}
  </p>
</div>

// Task 4.3 — botão download (linhas 137-145)
// ANTES
<a
  href={`/api/cliente/obras/${obra_id}/documentos/${doc.id}/download-redirect`}
  target="_blank"
  rel="noopener noreferrer"
  className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-medium text-stone-300 transition-colors hover:bg-stone-700 hover:text-white"
>
  <FileDown className="h-3.5 w-3.5" />
  Baixar
</a>

// DEPOIS
<a
  href={`/api/cliente/obras/${obra_id}/documentos/${doc.id}/download-redirect`}
  target="_blank"
  rel="noopener noreferrer"
  className="flex h-11 flex-shrink-0 items-center gap-1.5 rounded-xl bg-stone-800 px-3 text-xs font-medium text-stone-300 transition-colors hover:bg-stone-700 hover:text-white"
>
  <FileDown className="h-4 w-4" />
  Baixar
</a>
```

---

### Task 5 — Verificação e testes (AC13)

- [x] 5.1 — Verificar Home em 375px: 4 cards distintos, valores legíveis
- [x] 5.2 — Verificar Fases: timeline visível, badges verde/âmbar/cinza corretos em ambos os arquivos
- [x] 5.3 — Verificar Fotos em 375px: 2 colunas sem scroll horizontal, pills com scroll horizontal OK
- [x] 5.4 — Verificar Documentos em 375px: categoria e tamanho visíveis, botão com altura >= 44px
- [x] 5.5 — Testar download de documento: deve continuar funcionando
- [x] 5.6 — Testar filtro por fase na galeria: deve continuar funcionando
- [x] 5.7 — `npm run lint` e `npm run typecheck` sem erros

## Dev Notes

### Stack e padrões relevantes

- **Framework:** Next.js 14 App Router com TypeScript (Server Components nas pages de conteúdo)
- **Estilo:** Tailwind CSS v4 — `@import "tailwindcss"` em `globals.css`. Classes `aspect-*`, `ring-*`, `grid-cols-*` funcionam igual ao v3 nesta story
- **Cor de acento:** `#E8856A` (laranja Trifold)
- **Tema:** dark (`stone-950` base, `stone-900` superfícies)

### `ring-1 ring-inset` vs `border`

`ring` no Tailwind usa `box-shadow` em vez de `border`. Isso permite `border-l-4` em paralelo
sem conflito de especificidade CSS. `ring-inset` posiciona o anel dentro do elemento (não
expande as dimensões). Resultado visual: borda sutil em stone-800 em todos os lados + borda
esquerda laranja 4px — sem double-declaration.

### `aspect-square sm:aspect-video`

Em Tailwind v3, `aspect-{ratio}` são utilitários disponíveis sem plugin. `aspect-square` =
`aspect-ratio: 1 / 1`, `aspect-video` = `aspect-ratio: 16 / 9`. A classe `sm:aspect-video`
sobrescreve em breakpoint `sm` (640px+). Verificar que o componente `Image` tem `fill` prop
— necessário quando o container define aspecto.

### `scrollbar-none` — estratégia

O arquivo `packages/web/src/app/globals.css` **existe** e já tem regras de scrollbar customizadas
nas linhas 32-53 (`::-webkit-scrollbar`, `scrollbar-width: thin`). Adicionar `.scrollbar-none`
no **final** do arquivo para não colidir com as regras globais existentes:

```css
/* ADICIONAR NO FINAL de packages/web/src/app/globals.css */
.scrollbar-none::-webkit-scrollbar { display: none; }
.scrollbar-none { scrollbar-width: none; }
```

Esta classe aplica-se apenas ao seletor `.scrollbar-none`, não afeta as regras globais de
scrollbar já existentes. Não instalar plugins para isso.

Alternativa sem CSS customizado (se preferir não tocar no globals.css):
```tsx
<div style={{ scrollbarWidth: "none" }} className="flex gap-2 overflow-x-auto pb-1">
```

### `filter(Boolean).join(" · ")` em documentos

`[doc.category, formatBytes(doc.file_size_bytes)].filter(Boolean)` remove `null`, `undefined`
e string vazia. `join(" · ")` usa o ponto médio (·) como separador — padrão de UI para metadados
(ex: "Contratos · 2.3 MB"). Se `doc.category` for null, exibe só o tamanho; se `file_size_bytes`
for null, `formatBytes` retorna "—" (não vazio), então sempre haverá algo.

### Não alterar lógica de negócio

Esta story é APENAS UI/CSS. Não alterar:
- Queries Supabase
- Lógica de filtro (faseFilter, categoriaAtiva)
- Tipos TypeScript existentes
- API routes

### Ordem de execução recomendada

1. Task 1 (Home) — mais simples, baixo risco
2. Task 2 (Fases) — alterar `fases/page.tsx` e verificar `fases-list.tsx`
3. Task 3 (Fotos) — atenção ao `scrollbar-none`
4. Task 4 (Documentos) — atenção ao filter(Boolean)
5. Task 5 (verificação) — testar tudo junto

### Testing

- Não há testes unitários para componentes de UI neste projeto
- Validação via inspeção manual no browser (DevTools → Device Emulation)
- Dispositivos de teste: iPhone SE (375x667) e iPad (768x1024)
- `npm run lint` e `npm run typecheck` obrigatórios antes de marcar completo

## Dev Agent Record

**Agent Model Used:** claude-sonnet-4-6

### File List

| Arquivo | Ação |
|---------|------|
| `packages/web/src/app/cliente/[obra_id]/page.tsx` | Modificado |
| `packages/web/src/app/cliente/[obra_id]/fases/page.tsx` | Modificado |
| `packages/web/src/app/cliente/[obra_id]/fotos/page.tsx` | Modificado |
| `packages/web/src/app/cliente/[obra_id]/documentos/page.tsx` | Modificado |
| `packages/web/src/app/globals.css` | Modificado |

### Completion Notes

- `fases-list.tsx` já usava padrão filled correto — não foi necessário alterar (Task 2.4 confirmado)
- `scrollbar-none` adicionado no final de globals.css para não colidir com regras existentes (linhas 32-53)
- Lint e typecheck passaram sem erros

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-05-11 | 1.0 | Story criada a partir da auditoria UX do Epic 23 | River (@sm) |
| 2026-05-11 | 1.1 | Corrigido: versão Tailwind v3→v4; nota scrollbar-none expandida com contexto do globals.css existente | Pax (@po) |
| 2026-05-11 | 1.1 | Validação PO: GO — status Draft→Ready | Pax (@po) |
| 2026-05-11 | 1.2 | Implementação completa: Tasks 1-5 concluídas, lint+typecheck OK | Dex (@dev) |
| 2026-05-11 | 1.3 | QA Gate: PASS — todos os 13 ACs verificados; 1 observação informativa documentada | Quinn (@qa) |

## QA Results

### Review Date: 2026-05-11

### Reviewed By: Quinn (Test Architect & Guardian)

### Code Review

Implementação tipo "refator de superfície" — apenas classes Tailwind, JSX estrutural e CSS
utilitário em `globals.css`. Zero alteração de schema, queries Supabase, lógica de filtro
(`faseFilter`, `categoriaAtiva`) ou API routes. Padrões consistentes entre `fases/page.tsx`
e `_components/fases-list.tsx` — sistema filled unificado (`bg-amber-900/40`, `bg-green-900/40`,
`bg-stone-800`). `ring-1 ring-inset` é a escolha correta para coexistir com `border-l-4` sem
conflito de especificidade (`ring` usa box-shadow, não border).

### Acceptance Criteria Verification

- **AC1** PASS — 4 StatCards distintos em `page.tsx:162-187`: "Fase Atual", "Progresso", "Status", "Entrega Prevista". Nenhum label/valor repetido.
- **AC2** PASS — `page.tsx:272` aplica `truncate text-lg font-bold text-white` no `<p>` do `value`.
- **AC3** PASS — `page.tsx:131` usa `border-l-4 border-l-[#E8856A] bg-stone-900 p-6 ring-1 ring-inset ring-stone-800`. `border` neutro removido.
- **AC4** PASS — `fases/page.tsx:96` usa `bg-stone-700` na linha vertical.
- **AC5** PASS — `fases/page.tsx:25` usa `bg-green-900/40 text-green-400` para concluida; `fases-list.tsx:28-32` igual.
- **AC6** PASS — `fases/page.tsx:24` usa `bg-amber-900/40 text-amber-400`; `fases-list.tsx:23-26` igual.
- **AC7** PASS — `fases/page.tsx:106-111` renderiza `<svg>` check branco (`text-white`) sobre `bg-green-500` para status `concluida`.
- **AC8** PASS — `fotos/page.tsx:174` usa `grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-3`.
- **AC9** PASS — `fotos/page.tsx:182` usa `aspect-square w-full sm:aspect-video`.
- **AC10** PASS — `fotos/page.tsx:102` usa `flex gap-2 overflow-x-auto pb-1 scrollbar-none`; `:105` e `:117` adicionam `flex-shrink-0` nos pills.
- **AC11** PASS — `documentos/page.tsx:115-122` mostra metadados na linha secundária via `[doc.category, formatBytes(doc.file_size_bytes)].filter(Boolean).join(" · ")` sem `hidden sm:block`.
- **AC12** PASS — `documentos/page.tsx:125-133` aplica `h-11` no botão; ícone `FileDown` em `h-4 w-4`.
- **AC13** PASS — Queries Supabase, `redirect`, RLS implícito, filtros `faseFilter`/`categoriaAtiva` e download route (`/api/cliente/obras/.../download-redirect`) intactos.

### Quality Checks (7-point)

| Check | Status | Notes |
|-------|--------|-------|
| Code review | PASS | Idiomático, padrões unificados entre arquivos |
| Unit tests | N/A | Padrão do projeto: sem testes unitários para UI |
| Acceptance criteria | PASS | 13/13 ACs verificados no código |
| No regressions | PASS | Queries, RLS, API routes, lógica de filtros preservados |
| Performance | PASS | Apenas classes utilitárias; nenhum overhead novo |
| Security | PASS | Zero nova superfície de ataque; rel/noopener preservado |
| Documentation | PASS | File List + Change Log atualizados |

### Lint / Typecheck

- `npx eslint "src/app/cliente/**/*.tsx"` → 0 erros
- `npx tsc --noEmit` → 0 erros

### CSS / globals.css

`scrollbar-none` adicionada nas linhas 79-80 de `globals.css`, no final do arquivo, em
seletor específico (`.scrollbar-none`) — não colide com as regras globais `::-webkit-scrollbar`
existentes nas linhas 31-48 (que usam thumb `#d6d3d1`). Pattern correto.

### Observations (informational, non-blocking)

- **DOC-001 (info):** Em `documentos/page.tsx`, o refator de metadados removeu a renderização
  de `doc.filename` (que antes aparecia truncado em linha secundária quando presente). O spec
  prescreveu a substituição completa do bloco, então o comportamento implementado está fiel,
  mas a informação `filename` deixou de ser exibida no UI. Avaliar com PO se isso é desejável —
  em casos onde dois documentos compartilham o mesmo `name` mas têm `filename` distinto, o
  usuário perdeu o discriminador. Pode ser endereçado em uma próxima iteração se relevante.
- Os checkboxes da seção "Acceptance Criteria" (`- [ ]`) permanecem desmarcados, embora os
  Task checkboxes estejam marcados. Cosmético — não bloqueia o gate.

### Gate Status

Gate: **PASS** → docs/qa/gates/23.2-portal-cliente-conteudo-ux-mobile.yml
