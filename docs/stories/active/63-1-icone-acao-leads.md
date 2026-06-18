# Story 63-1 — Ícone de Ação na Lista de Leads

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-1
- **Status:** Ready for Review
- **Validated:** 2026-06-18 by @po (Pax) — verdict GO (10/10); refs de código confirmadas (`Pencil` import L5; mobile L81-87; desktop L154-160)
- **Priority:** P0 — quick win de 1-2h; corrige sinalização errada na ação principal
- **Complexity:** XS (1-2h)
- **Fase:** 1 (Quick Win)
- **Created:** 2026-06-18
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[icon_render_check, label_check, touch_target_check]`

---

## User Story

**Como** corretor que acessa a lista de leads no celular,
**Quero** que o botão de ação principal do lead mostre um ícone de conversa com label "Responder",
**Para que** eu entenda imediatamente que aquela ação me leva ao chat — não ao formulário de cadastro.

---

## Context

Em `packages/web/src/app/broker/leads/_components/leads-list-with-drawer.tsx`, a ação primária de
abrir um lead usa o ícone `Pencil` (lápis) com o label "Atender lead":

- **Mobile card (L81-87):** botão com `Pencil` e label "Atender lead"
- **Desktop table (L154-160):** coluna de ação com `Pencil` e label "Atender lead"

O ícone `Pencil` sinaliza *edição de cadastro*, não *resposta ao lead*. Desde o Epic 51, a ação
real é abrir o chat bidirecional — o corretor responde mensagens, não edita um formulário. A
mudança é de nomenclatura/semântica e não altera nenhuma lógica de navegação.

O ícone correto é `MessageCircle` de `lucide-react` (já usado em outras partes do sistema), que
sinaliza conversa/chat. O label deve ser "Responder".

O alvo de toque atual pode ser menor que 44px no mobile — ajustar padding para garantir
`min-h-[44px] min-w-[44px]` conforme WCAG 2.5.5 (NFR-2 do epic).

### O que NÃO muda
- A ação em si (navegação para a página do lead ou abertura do drawer) não muda
- Nenhuma lógica de negócio é alterada
- Nenhuma migration é necessária

---

## Acceptance Criteria

- [x] **AC1:** O ícone de ação primária no card mobile de `leads-list-with-drawer.tsx` (L81-87) exibe `MessageCircle` de `lucide-react` em vez de `Pencil`
- [x] **AC2:** O rótulo acessível do botão é "Responder" em vez de "Atender lead" (tanto em `aria-label` quanto em qualquer texto visível associado ao botão)
- [x] **AC3:** A área de toque do botão no card mobile é ≥ 44×44px (ex.: `min-h-[44px] min-w-[44px]` ou padding equivalente como `p-3`)
- [x] **AC4:** O mesmo ajuste é aplicado na coluna de ação da tabela desktop (L154-160): ícone `MessageCircle`, label "Responder", alvo ≥44px
- [x] **AC5:** A ação de navegação/abertura do lead é preservada sem alteração — apenas ícone e label mudam
- [x] **AC6:** TypeScript compila sem erros nos arquivos da story; ESLint passa; não há regressão nos testes existentes

---

## Tasks / Subtasks

- [x] **T1 — Editar `leads-list-with-drawer.tsx`: bloco mobile (L81-87)**
  - Importar `MessageCircle` de `lucide-react` (remover import de `Pencil` se não usado em outro lugar)
  - Substituir `<Pencil ... />` por `<MessageCircle ... />`
  - Atualizar `aria-label` e/ou texto visível de "Atender lead" → "Responder"
  - Adicionar `min-h-[44px] min-w-[44px]` ou padding `p-3` ao elemento botão

- [x] **T2 — Editar `leads-list-with-drawer.tsx`: coluna desktop (L154-160)**
  - Mesmo ajuste de ícone, label e alvo de toque na tabela desktop

- [x] **T3 — Verificar imports**
  - Confirmar que `Pencil` não é usado em outro lugar no arquivo antes de remover o import
  - Se `Pencil` for usado em outro lugar, manter o import e apenas remover o uso nos botões de ação

- [x] **T4 — QA pré-commit**
  - `pnpm --filter @trifold/web type-check` → zero erros nos arquivos da story
  - `pnpm --filter @trifold/web lint` → zero erros/warnings nos arquivos desta story

---

## Dev Notes

### Paths-chave
```
packages/web/src/app/broker/leads/_components/leads-list-with-drawer.tsx  ← EDITAR (T1, T2)
```

### Contexto de código (verificado em auditoria)
- L81-87: card mobile — botão com ícone `Pencil` e label "Atender lead"
- L154-160: tabela desktop — coluna de ação com ícone `Pencil` e label "Atender lead"
- L50: o card mobile já navega para a página do lead ao clicar (esse comportamento NÃO muda)

### Design system
- Ícones: `lucide-react` (padrão do projeto)
- `MessageCircle` está disponível em `lucide-react` — não precisa instalar pacote
- Breakpoint `lg` (1024px) separa mobile/desktop
- Cor do ícone: seguir o padrão existente no arquivo (não alterar cor)

### Gotchas
- **Import de `Pencil`:** verificar se é usado em outro ponto do arquivo antes de remover. Usar grep no arquivo
- **`aria-label` vs texto visível:** preferir atualizar ambos para consistência com leitores de tela

---

## File List

### Modificar
- `packages/web/src/app/broker/leads/_components/leads-list-with-drawer.tsx` — ícone, label, alvo de toque (T1, T2)

### Referência (não modificar)
- `packages/web/src/app/broker/leads/[id]/page.tsx` — tela de destino da ação (não muda)

---

## Testing

### Framework
Vitest (padrão do projeto — NÃO Jest)

### Cenários obrigatórios
Não há lógica complexa para testar unitariamente. Validação principal é visual + lint/type-check.

### Smoke pós-deploy
- Acessar lista de leads no mobile: botão de ação exibe ícone de conversa (não lápis)
- Tooltip/label do botão exibe "Responder"
- Clicar no botão abre o lead normalmente (sem regressão na navegação)
- Verificar tamanho do alvo de toque no DevTools (inspect element → computed size ≥ 44×44px)

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | `Pencil` usado em outro lugar no arquivo — remover import quebra | T3: verificar antes de remover |
| R2 | Label "Responder" conflita com label de outro botão próximo | Verificar no contexto visual — se conflito, usar "Abrir conversa" como alternativa |

---

## Out of Scope

- Alterar a ação de navegação em si (destino, drawer vs. page)
- Redesign do card de lead
- Qualquer mudança na tela de detalhe do lead

---

## Definition of Done

- [ ] AC1–AC6 marcados como completos
- [ ] T1–T4 marcados como done
- [ ] @qa executou quality gate com verdict ≥ PASS
- [ ] @devops fez push

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-18 | 0.1 | Story drafted — Epic 63, Fase 1, quick win de ícone/label | @sm (River) |
| 2026-06-18 | 0.2 | **Validação PO — verdict GO (10/10). Status Draft → Ready.** Refs confirmadas no código: `Pencil` importado em `leads-list-with-drawer.tsx` L5 (usado só nos 2 botões de ação → import pode ser removido na T3); botão mobile L81-87 (`aria-label="Atender lead"`, `p-3` ~40px, abaixo de 44px → AC3 justificado); botão desktop L154-160 (`p-1.5` + ícone `h-3.5` ~26px → AC4 justificado). Obs. não-bloqueante: o botão alvo abre o **drawer** (`setSelectedLeadId`), enquanto o `<Link>` (L49-51) navega para a página — AC5 ("abertura do lead preservada") cobre ambos. CON-1 respeitado (sem `tel:`/`wa.me`). | @po (Pax) |
| 2026-06-18 | 1.0 | **Implementação @dev (Dex).** `Pencil` import removido (era usado só nos 2 botões → trocado por `MessageCircle`). Mobile: `aria-label="Responder"`, ícone `MessageCircle h-5 w-5`, `flex min-h-[44px] min-w-[44px] items-center justify-center` (alvo ≥44px). Desktop: `aria-label="Responder"`, `MessageCircle h-4 w-4`, `inline-flex min-h-[44px] min-w-[44px] items-center justify-center` (era ~26px → agora ≥44px). Navegação (`setSelectedLeadId`/`<Link>`) preservada — apenas ícone/label/alvo mudaram. type-check e ESLint limpos no arquivo. Sem `tel:`/`wa.me`. Status → Ready for Review. | @dev (Dex) |
