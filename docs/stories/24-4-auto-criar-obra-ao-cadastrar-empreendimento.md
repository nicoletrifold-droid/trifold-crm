# Story 24.4 — Auto-criar Obra ao Cadastrar Empreendimento

## Status: Ready for Review

## Story

**Como** administrador,
**Quero** ter a opção de criar uma obra de acompanhamento automaticamente ao cadastrar um novo empreendimento,
**Para que** o portal do cliente esteja pronto desde o início sem precisar criar a obra manualmente depois.

## Contexto

Depende de Story 24.1 e 24.2. Melhoria do fluxo de criação de empreendimentos em `/dashboard/properties/new` (ou equivalente).

Ao criar um empreendimento, o admin pode optar por já criar a obra vinculada no mesmo passo, evitando a necessidade de navegar até `/dashboard/obras` depois.

## Acceptance Criteria

- [ ] AC1: Na tela de criação de empreendimento, há um checkbox/toggle "Criar obra de acompanhamento"
- [ ] AC2: Se ativado, ao salvar o empreendimento, uma obra é criada automaticamente com:
  - `name` = nome do empreendimento
  - `org_id` = org do usuário logado
  - `property_id` = ID do empreendimento recém-criado
  - `status` = `em_andamento`
  - `expected_delivery_date` = `delivery_date` do empreendimento (se informado)
- [ ] AC3: Se desativado, o empreendimento é criado normalmente sem obra (comportamento atual)
- [ ] AC4: Após criação com obra, usuário é redirecionado para o empreendimento com badge "Obra criada ✓"
- [ ] AC5: Em caso de falha na criação da obra (após o empreendimento já criado), o empreendimento NÃO é revertido — apenas exibe aviso que obra pode ser criada manualmente
- [ ] AC6: Toggle é visível e marcado por padrão (opt-out, não opt-in)

## Escopo

**IN:**
- Modificação na tela de criação de empreendimento
- Lógica de criação de obra vinculada na API de criação de empreendimento

**OUT:**
- Modificar o fluxo de edição de empreendimento (usar Story 24.2 para vincular post-criação)
- Criar fases da obra automaticamente (admin faz manualmente na tela da obra)

## Dev Notes

- Verificar localização do formulário de criação: provavelmente `POST /api/properties` ou similar
- A criação da obra deve ser feita APÓS a property ser salva (precisa do property_id)
- Usar transaction se possível, mas degradar graciosamente se falhar (AC5)
- O toggle pode ser um campo extra no body do formulário: `{ ..., create_obra: true }`
- Obra criada deve ter `progress_pct: 0` e sem `current_phase_id` (admin popula depois)

## Tasks

- [x] 1. Verificar rota e formulário de criação de empreendimento
- [x] 2. Adicionar toggle "Criar obra de acompanhamento" ao formulário
- [x] 3. Modificar API de criação para aceitar `create_obra: boolean`
- [x] 4. Implementar criação de obra vinculada na API (após inserção da property)
- [x] 5. Tratar erro de criação de obra sem reverter a property (AC5)
- [x] 6. Adicionar feedback visual na tela de empreendimento após criação

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Obra criada mas property não salva (ordem inversa) | Baixa | Criar obra APÓS property (Task 4); AC5 cobre o caso inverso |
| Toggle opt-out cria obras indesejadas para admins que não percebem | Baixa | AC6 define que é opt-out por design; dev pode ajustar se produto mudar |
| Rota de criação de empreendimento não aceitar campo extra | Baixa | Task 1 prevê verificação prévia; campo extra no body é pattern já usado |
| `delivery_date` do empreendimento vazio → obra sem data | Baixa | AC2 define `expected_delivery_date` = delivery_date SE informado; opcional |

## Estimativa: 3h

## Dependências

- Story 24.1 (coluna property_id) — MUST be Done
- Story 24.2 (API de vínculo) — SHOULD be Done (reutilizar lógica de criar obra com property_id)

## Dev Agent Record

### File List
- `src/app/api/properties/route.ts` — MODIFIED: aceita `create_obra`, cria obra vinculada após property, retorna `obra_created` + `obra_error`
- `src/app/dashboard/properties/new/page.tsx` — MODIFIED: toggle opt-out "Criar obra de acompanhamento" + redirect para detalhe com query param
- `src/app/dashboard/properties/[id]/page.tsx` — MODIFIED: aceita `searchParams`, exibe banner verde (obra_created) ou ambar (obra_error)

### Completion Notes
- Toggle é opt-out (checked por default — AC6)
- API cria obra APÓS property salva, falha silenciosa sem reverter (AC5)
- Redirect vai para `/dashboard/properties/{id}?obra_created=true` quando obra criada, ou `?obra_error=true` se falhou
- Banner ambar orienta admin a vincular manualmente via seção ObraVinculadaSection já existente

## QA Results

**Decisão: PASS (com CONCERNS LOW)**
**Data:** 2026-05-11
**Agente:** @qa (Quinn)

**ACs verificados:** 6/6 ✅

**Concerns (LOW — não bloqueantes):**
1. Banner `?obra_created=true` sem dismiss — permanece na URL até o admin navegar; one-shot, sem impacto funcional
2. Mensagem exata de erro da obra não chega ao banner — admin vê aviso genérico mas é suficiente para orientação
3. Edge case `?` vazio no URL quando `createObra=true` mas sem resultado — inofensivo

**Build:** ✅ | **TypeScript:** ✅ | **ESLint:** ✅

## Change Log

| Data | Agente | Mudança |
|------|--------|---------|
| 2026-05-11 | @pm (Morgan) | Story criada |
| 2026-05-11 | @po (Pax) | Validação GO 8.8/10 — seção Riscos adicionada — Status: Draft → Ready |
| 2026-05-11 | @dev (Dex) | Implementação completa — todas as tasks [x] — Status: Ready for Review |
| 2026-05-11 | @qa (Quinn) | QA Gate PASS — 6/6 ACs verificados — 3 concerns LOW não bloqueantes |
