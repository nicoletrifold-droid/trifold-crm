# Story 63-2 — Padronizar Bolhas do Chat do Corretor

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-2
- **Status:** Ready for Review
- **Validated:** 2026-06-18 by @po (Pax) — verdict GO (9/10); refs confirmadas (`page.tsx` L192 `max-h-96`, loop L196-216; `OptimisticMessage` L9-16; drawer 974 linhas). AC4 com ressalva arquitetural já documentada (R2)
- **Priority:** P0 — ambiguidade de cores/rótulos gera confusão sobre quem enviou cada mensagem
- **Complexity:** S (2-3h)
- **Fase:** 1 (Quick Win)
- **Created:** 2026-06-18
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[bubble_render_check, contrast_check, optimistic_status_check]`

---

## User Story

**Como** corretor que lê o histórico de conversa no chat,
**Quero** identificar visualmente quem enviou cada mensagem (eu, o lead, ou a Nicole) e ver o status de entrega das minhas mensagens,
**Para que** eu saiba exatamente o estado da conversa sem precisar adivinhar pela posição ou cor.

---

## Context

Existem **duas UIs de chat** para o mesmo lead no CRM do corretor:

1. `packages/web/src/app/broker/leads/[id]/page.tsx` (L192-L216) — tela de detalhe
2. `packages/web/src/components/leads/lead-detail-drawer.tsx` (~975 linhas) — drawer lateral

As duas divergem em cores e rótulos:

| Mensagem | `page.tsx` | `lead-detail-drawer.tsx` |
|----------|-----------|--------------------------|
| `role='user'` (lead) | cinza, esquerda | — (estilos próprios) |
| `role='assistant'` (Nicole) | roxo, direita | laranja, COM rótulo |
| `role='broker'` (corretor) | azul, direita | azul, COM rótulo |

**Problema 1 — Nicole no lugar errado:** Na `page.tsx`, Nicole (assistente) aparece à *direita*,
lado que convencionalmente representa "você" numa interface de chat. O lead é quem está do outro
lado — portanto Nicole deveria estar à esquerda (junto com o lead, do ponto de vista do corretor).

**Problema 2 — Sem rótulo de autor:** `page.tsx` não mostra quem enviou cada mensagem (sem
"Você", "Lead", "Nicole"). O drawer tem rótulos mas cores diferentes.

**Problema 3 — Sem status de entrega:** `broker-message-input.tsx` já modela
`OptimisticMessage.pending` e `OptimisticMessage.failed` (L9-16), mas as bolhas não exibem
indicadores visuais (⏳ quando pendente, ✓ quando enviado, ⚠ quando falhou).

**Problema 4 — Contraste de timestamps:** Os timestamps podem ter contraste insuficiente (< 3:1)
em modo escuro (dark: stone palette).

### Padrão canônico a adotar (esta story define o padrão)

| Role | Posição | Cor de fundo | Rótulo |
|------|---------|--------------|--------|
| `'broker'` | DIREITA | `bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-100` | "Você" |
| `'user'` | ESQUERDA | `bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-stone-100` | "Lead" |
| `'assistant'` | ESQUERDA | `bg-purple-100 text-purple-900 dark:bg-purple-900/30 dark:text-purple-100` | "Nicole" |
| `'system'` | CENTRO | `text-stone-500 text-xs italic` (sem bolha) | — |

### O que muda
- `page.tsx` (L196-216): adotar o padrão canônico acima
- `lead-detail-drawer.tsx`: alinhar ao mesmo padrão (só onde diverge)
- Exibir rótulo de autor acima ou abaixo da bolha (pequeno, text-xs, text-stone-500)
- Exibir ícone de status apenas em mensagens `role='broker'`: ⏳ `pending`, ✓ enviado, ⚠ `failed`
- Corrigir contraste de timestamps: `text-stone-400 dark:text-stone-500` → `text-stone-500 dark:text-stone-400` (inverter para garantir contraste em modo escuro)

---

## Acceptance Criteria

- [x] **AC1:** Mensagens `role='broker'` em `page.tsx` renderizam como bolha à DIREITA com cor laranja (`bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-100`) e rótulo "Você" (text-xs acima ou abaixo da bolha)
- [x] **AC2:** Mensagens `role='user'` renderizam como bolha à ESQUERDA com cor cinza (`bg-stone-100` / `dark:bg-stone-800`) e rótulo "Lead"
- [x] **AC3:** Mensagens `role='assistant'` renderizam como bolha à ESQUERDA com cor roxa (`bg-purple-100` / `dark:bg-purple-900/30`) e rótulo "Nicole"
- [x] **AC4:** _(parcial — limitação arquitetural documentada em R2)_ `page.tsx` é Server Component e renderiza apenas mensagens do banco, sem acesso ao estado otimista (`pending`/`failed`) do `BrokerMessageInput`. Conforme simplificação da story, mensagens `role='broker'` do banco exibem ícone `Check` (✓ enviado). Status `Loader2`/`AlertCircle` permanece responsabilidade do state local do composer (não consumido nesta tela) — ver Completion Notes.
- [x] **AC5:** O `lead-detail-drawer.tsx` usa o mesmo padrão de cores e rótulos que `page.tsx` — reutiliza `getBubbleStyle`; divergência (broker azul→laranja, assistant laranja→roxo, labels) eliminada
- [x] **AC6:** Timestamps usam `text-stone-500 dark:text-stone-400` (page.tsx) e bloco de metadados do drawer ajustado de `text-stone-400 dark:text-stone-500` → `text-stone-500 dark:text-stone-400` para contraste em ambos os modos
- [x] **AC7:** TypeScript compila sem erros nos arquivos da story; ESLint passa (0 erros); 5 testes do helper passando; nenhum teste existente regride

---

## Tasks / Subtasks

- [x] **T1 — Criar/extrair helper `getBubbleStyle(role: string)`**
  - Função pura que retorna `{ containerClass, bubbleClass, label, side }` com base no `role`
  - Implementar o padrão canônico da tabela acima
  - Localizá-la em `packages/web/src/app/broker/leads/[id]/_components/bubble-styles.ts` (ou inline se pequeno)
  - Escrever teste unitário: `getBubbleStyle('broker')` → side='right', label='Você', etc.

- [x] **T2 — Atualizar `page.tsx` (L196-216): renderização de bolhas**
  - Usar `getBubbleStyle(msg.role)` para classes e rótulo
  - Adicionar elemento de rótulo (texto pequeno, acima ou abaixo da bolha)
  - Adicionar ícone de status para `role='broker'` (AC4) usando `OptimisticMessage.pending/failed` → simplificado: `Check` para mensagens do banco (Server Component sem state otimista)

- [x] **T3 — Atualizar `lead-detail-drawer.tsx`: alinhar ao padrão canônico**
  - Identificar trecho de renderização de mensagens no drawer
  - Substituir classes divergentes pelas do padrão canônico (reusar `getBubbleStyle` do T1)
  - Preservar todo o restante do drawer intocado

- [x] **T4 — Corrigir contraste de timestamps**
  - Em `page.tsx` e `lead-detail-drawer.tsx`: ajustar classe de timestamp para `text-stone-500 dark:text-stone-400`

- [x] **T5 — Testes unitários**
  - `getBubbleStyle('broker')` → `{ side: 'right', label: 'Você', bubbleClass: /orange/ }`
  - `getBubbleStyle('user')` → `{ side: 'left', label: 'Lead', bubbleClass: /stone/ }`
  - `getBubbleStyle('assistant')` → `{ side: 'left', label: 'Nicole', bubbleClass: /purple/ }`
  - `getBubbleStyle('system')` → `{ side: 'center', label: '' }`

- [x] **T6 — QA pré-commit**
  - `pnpm --filter @trifold/web type-check` → zero erros nos arquivos da story
  - `pnpm --filter @trifold/web lint` → zero erros nos arquivos desta story

---

## Dev Notes

### Paths-chave
```
packages/web/src/app/broker/leads/[id]/page.tsx                              ← EDITAR (T2, T4)
packages/web/src/components/leads/lead-detail-drawer.tsx                     ← EDITAR (T3, T4)
packages/web/src/app/broker/leads/[id]/_components/bubble-styles.ts          ← CRIAR (T1)
packages/web/src/app/broker/leads/[id]/_components/bubble-styles.test.ts     ← CRIAR (T5)
```

### Contexto de código (verificado em auditoria)
- `page.tsx` L192: container de mensagens com `max-h-96 overflow-y-auto` — NÃO remover nesta story (isso é escopo de 63-6)
- `page.tsx` L196-216: loop de renderização das bolhas — ESTE É O TRECHO A EDITAR
- `broker-message-input.tsx` L9-16: definição de `OptimisticMessage` com campos `pending: boolean` e `failed: boolean`
- `lead-detail-drawer.tsx` ~975 linhas: buscar o trecho de renderização de mensagens; não editar nada fora do loop de bolhas

### Design system
- Laranja (`orange-500`/`#ea580c`) é a cor primária da marca — adequada para "Você" (corretor)
- Roxo para Nicole é convenção já usada no dashboard admin — manter consistência
- Cinza (`stone`) para o lead — neutro, pois o lead não é da equipe
- Modo escuro: paleta `stone` como base; as classes `/30` de opacidade funcionam bem para bolhas no dark mode

### Gotchas
- **`OptimisticMessage` em `page.tsx`:** verificar se `page.tsx` já consume mensagens otimistas do state do `BrokerMessageInput` ou se apenas renderiza mensagens do banco. Se renderiza só do banco, o status de entrega (AC4) precisa de um mecanismo de merge entre estado local e dados do banco — simplificar: mostrar ⏳/⚠ apenas nas mensagens do state local; as do banco renderizam com ✓ por default
- **`lead-detail-drawer.tsx` é grande (~975 linhas):** localizar o trecho de mensagens por busca textual (`role`, `message`, `content`) antes de editar — não ler o arquivo inteiro
- **Não alterar lógica de fetch ou API nesta story** — apenas renderização visual

---

## File List

### Criar
- `packages/web/src/app/broker/leads/[id]/_components/bubble-styles.ts` — helper puro de estilos de bolha (T1)
- `packages/web/src/app/broker/leads/[id]/_components/bubble-styles.test.ts` — testes do helper (T5)

### Modificar
- `packages/web/src/app/broker/leads/[id]/page.tsx` — renderização de bolhas + contraste de timestamps (T2, T4)
- `packages/web/src/components/leads/lead-detail-drawer.tsx` — alinhamento ao padrão canônico (T3, T4)

### Referência (não modificar)
- `packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx` — definição de `OptimisticMessage` (L9-16)

---

## Testing

### Framework
Vitest (padrão do projeto — NÃO Jest)

### Cenários obrigatórios (T5)
1. `getBubbleStyle('broker')` → `side='right'`, `label='Você'`, classe contém `orange`
2. `getBubbleStyle('user')` → `side='left'`, `label='Lead'`, classe contém `stone`
3. `getBubbleStyle('assistant')` → `side='left'`, `label='Nicole'`, classe contém `purple`
4. `getBubbleStyle('system')` → `side='center'`, `label=''` (sem bolha)
5. `getBubbleStyle('')` (role desconhecido) → graceful default (sem throw)

### Smoke pós-deploy
- Abrir conversa com mensagens de `role='broker'`, `role='user'` e `role='assistant'`
- Verificar: broker à direita com laranja + "Você"; lead à esquerda com cinza + "Lead"; Nicole à esquerda com roxo + "Nicole"
- Enviar uma mensagem e observar ícone ⏳ durante envio → ✓ após confirmação
- Verificar no drawer: mesmas cores e rótulos que na página de detalhe

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | `lead-detail-drawer.tsx` grande — edição acidental de trecho errado | Usar busca textual para localizar loop de mensagens; editar apenas esse trecho |
| R2 | Mensagens otimistas não expostas para `page.tsx` — status de entrega impossível de renderizar | Simplificar AC4: status visível apenas no state local do BrokerMessageInput; mensagens do banco com ✓ por default |
| R3 | Cor laranja para broker conflita com cor de Nicole/IA em outros contextos do app | Verificar paleta atual no drawer antes de aplicar — se Nicole já usa laranja no drawer, ajustar |

---

## Out of Scope

- Remover `max-h-96` e fazer o chat ocupar a tela (→ Story 63-6)
- Unificar Page e Drawer em componente único (→ Story 63-5)
- Exibir foto/avatar do corretor nas bolhas
- Read receipts vindos do WhatsApp (checagem de entrega real via API)

---

## Definition of Done

- [ ] AC1–AC7 marcados como completos
- [ ] T1–T6 marcados como done
- [ ] @qa executou quality gate com verdict ≥ PASS
- [ ] @devops fez push

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-18 | 0.1 | Story drafted — Epic 63, Fase 1, padronização de bolhas | @sm (River) |
| 2026-06-18 | 1.0 | **Implementação @dev (Dex).** Criado helper puro `getBubbleStyle(role)` em `_components/bubble-styles.ts` retornando `{ side, containerClass, bubbleClass, label }` (padrão canônico: broker=laranja/direita/"Você", user=stone/esquerda/"Lead", assistant=roxo/esquerda/"Nicole", system=centro/sem rótulo, default graceful). `page.tsx`: loop de bolhas reescrito usando o helper, com rótulo de autor (text-xs stone-500), `Check` (✓) para broker, timestamps `text-stone-500 dark:text-stone-400`, e tratamento `side='center'` para system. `lead-detail-drawer.tsx`: preview de mensagens passou a reusar `getBubbleStyle` (broker azul→laranja, assistant laranja→roxo, labels "Você"/"Nicole"); contraste do bloco de metadados corrigido. **AC4 parcial** (R2): Server Component não consome estado otimista → só ✓ no banco. 5 testes do helper passando; type-check e ESLint limpos (warnings pré-existentes no drawer intocados). Sem `tel:`/`wa.me`. Status → Ready for Review. | @dev (Dex) |
| 2026-06-18 | 0.2 | **Validação PO — verdict GO (9/10). Status Draft → Ready.** Refs confirmadas no código: `page.tsx` L41 (`is_ai_active`, `last_message_at`), L192 (`max-h-96 overflow-y-auto`), loop de bolhas L196-216 (hoje `user`=cinza-esquerda, `assistant`=roxo-direita, `broker`=azul-direita — diagnóstico do epic confere); `OptimisticMessage` em `broker-message-input.tsx` L9-16; drawer com 974 linhas. **Ressalva não-bloqueante (já documentada em R2/Gotcha):** `page.tsx` é Server Component e renderiza só mensagens do banco — o `onSent`/estado otimista do `BrokerMessageInput` não é consumido na página, logo AC4 (status ⏳/✓/⚠) é parcialmente aspiracional; a story já simplifica para "✓ por default no banco, status só no state local". Design system (laranja/stone/roxo) e CON-1 respeitados. | @po (Pax) |

---

## QA Results

### Review Date: 2026-06-18
### Reviewed By: Quinn (@qa — Test Architect)

### Code Quality Assessment
`getBubbleStyle` é função pura, sem deps React, com default graceful para `role` desconhecido (sem throw) e tipos exportados. JSDoc claro (ponto de vista do corretor). Reuso real em `page.tsx` E no preview do `lead-detail-drawer.tsx` — divergência (broker azul→laranja, assistant laranja→roxo, labels) eliminada. Drawer alterado apenas no loop de preview (slice 0,3); restante intocado.

### Compliance Check
- Coding Standards: ✓ (helper puro, imports absolutos)
- Contraste (NFR-3): ✓ timestamps `text-stone-500 dark:text-stone-400` (≥3:1 claro+escuro); rótulo de autor identifica remetente sem depender só de cor
- All ACs Met: ✓ AC1-AC3, AC5-AC7 plenos; ⚠ AC4 PARCIAL (documentado, ver issue)
- CON-1: ✓ git grep limpo

### Verificação independente (resultados reais)
- Vitest `bubble-styles.test.ts`: 5/5 verde (broker/user/assistant/system + role vazio/desconhecido graceful)
- ESLint (arquivos da story): 0 erros (2 warnings no drawer — `isCTWA` L302, `handleAddNote` L359 — são PRÉ-EXISTENTES, fora da região editada L825-845)
- type-check: 0 erros nos arquivos da story
- Vitest suíte completa: 414/414 verde

### Issues
- BUBBLE-001 (low): AC4 parcial — `page.tsx` (Server Component) exibe `Check` (✓) fixo para TODA mensagem `role='broker'` do banco, inclusive as gravadas com `metadata.send_error` (page.tsx só seleciona `id/role/content/created_at`, sem `metadata`). O ✓ representa "persistido", não "entregue" — pode induzir o corretor a achar que a mensagem chegou. Os estados `pending`(⏳)/`failed`(⚠) seguem modelados em `OptimisticMessage` mas não surfaced. Simplificação baked-in no próprio AC e aceita pelo @po. Tratar surfacing real ao unificar em 63-5 (casar com REL-001 de 51.1). Não-bloqueante.

### Gate Status
Gate: PASS → docs/qa/gates/63.2-padronizar-bolhas-chat.yml
Consolidado: docs/qa/gates/epic-63-fase1.yml

### Recommended Status
✓ Ready for Done (liberar para @devops *push)
