# Story 63-6 — Composer Fixo (Sticky) no Rodapé

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-6
- **Status:** QA PASS — cleared for @devops push (aguardando push; Done após push)
- **Validated:** 2026-06-18 by @po (Pax) — verdict GO (8/10). Status Draft → Ready. Story autossuficiente em `page.tsx` (não bloqueada por 63-5 — story declara aplicação isolada). Ressalvas não-bloqueantes a corrigir nas Dev Notes durante implementação: (a) `max-h-96 overflow-y-auto` agora está em `page.tsx` L209 (não L192) — drift pós-Fase 1; (b) container externo é `<div className="space-y-6">` (L78) sem parent flex full-height — o @dev precisa estabelecer o contexto de altura a partir do layout do broker; (c) `.mobile-nav-safe` existe em `globals.css` L129 mas aplica APENAS `padding-bottom: env(safe-area-inset-bottom)` — NÃO encoda a altura da própria bottom nav; o composer deve compensar a altura real da barra além do safe-area; (d) NÃO existe a var CSS `--header-height` citada no T-snippet — usar `100dvh`/flex a partir de container conhecido. CON-1/CON-5 OK.
- **Priority:** P1 — chat empurrado para baixo do formulário e limitado a 96px de altura — inutilizável em mobile
- **Complexity:** M (4-6h)
- **Fase:** 2 (Estrutural)
- **Created:** 2026-06-18
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[layout_mobile_check, safe_area_check, scroll_check]`
- **Depende de:** Story 63-5 Done ou pode ser aplicada isoladamente em `page.tsx` como pré-requisito

---

## User Story

**Como** corretor que usa o chat no celular,
**Quero** que o histórico de conversa ocupe a tela inteira e o compositor fique fixo no rodapé,
**Para que** eu possa ler mensagens e responder sem ter que rolar para baixo de um formulário enorme.

---

## Context

Em `packages/web/src/app/broker/leads/[id]/page.tsx`, o layout atual é:
1. `LeadEditForm` grande (L112) — toma o topo da tela
2. 2 cards: "Dados do Lead" e "Resumo IA" (L130)
3. Seção de conversa com `<div className="... max-h-96 overflow-y-auto">` (L192) — limitada a 384px

**Problema:** O composer (`BrokerMessageInput`) está *dentro* do scroll de 96px, não fixo na tela.
Em mobile, o corretor precisa rolar até o final da lista de mensagens E encontrar o campo de texto
dentro de uma área scrollável aninhada — péssima UX de chat.

### Solução alvo
Layout de **chat full-screen** na tela do corretor:
- Container principal: `flex flex-col h-[calc(100dvh-var(--header-height))]` (ou equivalente)
- Histórico de mensagens: `flex-1 overflow-y-auto` — ocupa todo o espaço disponível
- Composer: `sticky bottom-0` ou `shrink-0` — sempre visível no rodapé
- Acima da bottom tab bar PWA: `padding-bottom: env(safe-area-inset-bottom)` + margem do `mobile-nav-safe`

### Relação com outras stories
- Se a 63-5 já criou `ConversationThread`, este layout deve ser aplicado dentro dele
- Se 63-5 não estiver done, aplicar em `page.tsx` diretamente e ajustar depois

### A Story 63-7 (Detalhes em Sheet) é complementar
A 63-7 remove o `LeadEditForm` do caminho principal. Esta story (63-6) muda o layout do chat
independentemente. Ambas podem ser feitas em paralelo ou em sequência — 63-6 é mais urgente pois
melhora o chat mesmo com o formulário presente (que vai para sheet na 63-7).

---

## Acceptance Criteria

- [x] **AC1:** O container de histórico de mensagens em `page.tsx` (ou `ConversationThread` se 63-5 done) NÃO usa `max-h-96` — o histórico ocupa o espaço disponível com `flex-1 overflow-y-auto`
- [x] **AC2:** O `BrokerMessageInput` é renderizado fora do scroll de mensagens, fixo no rodapé da área de chat — o usuário não precisa rolar para encontrar o compositor
- [x] **AC3:** Em mobile (< 1024px), o compositor fica acima da bottom tab bar (`mobile-nav-safe` / `padding-bottom: env(safe-area-inset-bottom)`) — não fica por baixo da barra de navegação fixa
- [x] **AC4:** Em desktop (≥ 1024px), o layout continua funcional — o chat não deve ocupar a tela inteira no desktop se o layout de 2 colunas existir
- [x] **AC5:** O scroll do histórico funciona corretamente — novas mensagens aparecem no final e o usuário pode rolar para cima para ver mensagens antigas
- [x] **AC6:** TypeScript compila sem erros; ESLint passa; nenhuma regressão nas funcionalidades de envio

---

## Tasks / Subtasks

- [x] **T1 — Auditar o layout atual de `page.tsx` (ou `ConversationThread`)**
  - Identificar a hierarquia de divs e classes CSS que causam o `max-h-96`
  - Mapear as classes de height/flex no container pai para entender o contexto
  - Identificar a variável CSS ou classe do `mobile-nav-safe`

- [x] **T2 — Refatorar layout do chat**
  - Remover `max-h-96 overflow-y-auto` do container de mensagens
  - Aplicar estrutura flex: `flex flex-col` no container pai + `flex-1 overflow-y-auto` no histórico + `shrink-0` no compositor
  - Adicionar `pb-[env(safe-area-inset-bottom)]` ou margem do `mobile-nav-safe` ao compositor
  - Garantir que o layout use `100dvh` (dynamic viewport height) em mobile para evitar jump de barra de endereços

- [x] **T3 — Verificar e ajustar `scroll-to-bottom` automático**
  - Quando uma nova mensagem é enviada, o scroll deve ir para o final automaticamente
  - Verificar se já existe scroll automático; se não, adicionar `useEffect` com `scrollIntoView` na última mensagem

- [x] **T4 — Testar em mobile (DevTools ou dispositivo físico)**
  - Breakpoint 375px (iPhone SE): chat ocupa a tela, compositor visível, sem sobreposição com bottom nav
  - Breakpoint 390px (iPhone 14): mesmo comportamento
  - Desktop 1440px: layout de coluna preservado sem regressão

- [x] **T5 — QA pré-commit**
  - `pnpm --filter @trifold/web type-check` → zero erros
  - `pnpm --filter @trifold/web lint` → zero erros nos arquivos da story

---

## Dev Notes

### Paths-chave
```
packages/web/src/app/broker/leads/[id]/page.tsx                              ← EDITAR (T2)
packages/web/src/app/broker/leads/[id]/_components/conversation-thread.tsx   ← EDITAR se 63-5 done (T2)
```

### Contexto de código (verificado em auditoria)
- `page.tsx` L192: `<div className="... max-h-96 overflow-y-auto">` — esta é a div a ser refatorada
- `mobile-nav-safe`: classe Tailwind customizada para safe-area iOS definida no design system do projeto — verificar em `tailwind.config.ts` antes de usar

### Padrão de layout de chat recomendado
```tsx
// Container externo (equivalente ao "ecrã de chat")
<div className="flex flex-col h-full">
  {/* Histórico scrollável */}
  <div className="flex-1 overflow-y-auto px-4 py-2">
    {messages.map(msg => <MessageBubble ... />)}
    <div ref={bottomRef} /> {/* ancora para scroll automático */}
  </div>
  {/* Compositor fixo */}
  <div className="shrink-0 border-t pb-[env(safe-area-inset-bottom)]">
    <BrokerMessageInput ... />
  </div>
</div>
```

### Gotchas
- **`100dvh` vs `100vh`:** em mobile, `100dvh` usa o viewport dinâmico (exclui barra de endereços retrátil); `100vh` pode ser maior que a área visível. Usar `100dvh` com fallback `100vh`
- **`mobile-nav-safe`:** verificar o valor exato dessa classe no tailwind.config — pode ser `pb-16`, `pb-20` ou uma variável CSS custom. Somar com `env(safe-area-inset-bottom)`
- **Scroll automático:** `scrollIntoView({ behavior: 'smooth' })` na última mensagem via `useEffect([messages])`; não fazer no primeiro render (seria confuso se o usuário está lendo mensagens antigas)

---

## File List

### Modificar
- `packages/web/src/app/broker/leads/[id]/page.tsx` — card de conversa convertido em painel de chat flex full-height; histórico `flex-1 overflow-y-auto` (removido `max-h-96`); compositor `shrink-0` no rodapé com safe-area (T2, T3)

### Criar
- `packages/web/src/app/broker/leads/[id]/_components/chat-scroll-area.tsx` — wrapper client mínimo para auto-scroll da área rolável de mensagens (T3); rola apenas o container, nunca a janela

> Nota: `conversation-thread.tsx` (citado no draft) NÃO existe — é artefato da Story 63-5 (ainda não Done). 63-6 foi aplicada isoladamente em `page.tsx`, conforme previsto pelo @po.

---

## Dev Agent Record

### Agent Model Used
Dex (Builder) — @dev — Opus 4.8 (modo YOLO autônomo)

### Completion Notes

**Abordagem (decisão IDS):**
- **REUSE:** `getBubbleStyle`, `WindowStatusBadge`, `BrokerMessageInput` (incl. `disabledByWindow`), e o padrão de auto-scroll já estabelecido em `cliente/.../chat-feed.tsx`.
- **CREATE:** `chat-scroll-area.tsx` — wrapper client mínimo. Justificativa: `page.tsx` é Server Component e precisa de auto-scroll client-side; `chat-feed.tsx` é monolítico e acoplado ao contexto de obra (não reutilizável como wrapper genérico). O wrapper rola **apenas o próprio container** (`el.scrollTo`), nunca a janela — evita o page-jump no carregamento (a página tem o `LeadEditForm` acima até a 63-7).

**AC atendidas:**
- AC1: `max-h-96` removido; histórico agora `min-h-0 flex-1 overflow-y-auto`.
- AC2: compositor (`BrokerMessageInput`) fora da `<ChatScrollArea>`, em `<div className="shrink-0 ...">` no rodapé do painel.
- AC3: compositor com `pb-[max(1rem,env(safe-area-inset-bottom))]`; o painel vive no fluxo dentro do container do layout broker que já tem `pb-24` no mobile, separando-o da bottom tab bar (`.mobile-nav-safe`, que aplica só `padding-bottom: env(safe-area-inset-bottom)` — confirmado em `globals.css` L128-132).
- AC4: altura `lg:h-[34rem]` no desktop (não ocupa a tela inteira); `h-[calc(100dvh-8rem)]` apenas no mobile.
- AC5: scroll do histórico interno funciona; auto-scroll ao final no mount (instantâneo) e em nova mensagem após `router.refresh()` (suave, via dependência `messageCount`).
- AC6: type-check sem erros nos arquivos da story; lint limpo; envio (`BrokerMessageInput`) e `WindowStatusBadge`/`disabledByWindow` intactos.

**Notas de escopo (honestidade):**
- A unificação 2-colunas e o `ConversationThread` são da **Story 63-5** (não invadidos). Quando 63-5 estiver Done, o painel de chat pode migrar para dentro de `ConversationThread`.
- A remoção do `LeadEditForm`/cards do caminho principal (que hoje ficam acima do chat e exigem rolar até o painel no mobile) é da **Story 63-7** (sheet de detalhes) — não invadida. 63-6 entrega o painel de chat full-height/composer fixo independentemente, como a story define.
- Var CSS `--header-height` (citada no snippet do draft) **não existe** — não foi inventada; usei `100dvh` + flex a partir de container conhecido, conforme ressalva do @po.

**CON-1:** Nenhum `tel:`/`wa.me`/`api.whatsapp.com`/click-to-call introduzido (grep verificado). Contato com o lead permanece exclusivamente pelo chat interno.

### Validações executadas
- `pnpm --filter @trifold/web type-check` → zero erros nos arquivos da story (erros pré-existentes não relacionados em `dashboard/.../visual-editor.tsx` — módulo `react-email-editor` ausente, não tocado).
- `pnpm exec eslint` nos 2 arquivos da story → zero erros/warnings.
- `npx vitest run packages/web/src/app/broker` → 1 arquivo, 5 testes, todos passando (sem regressão).

---

## Testing

### Framework
Vitest (padrão do projeto) — lógica de layout testada visualmente; apenas smoke

### Smoke pós-deploy
- Abrir tela do lead no mobile: compositor visível sem rolar; histórico de mensagens acima
- Enviar mensagem: scroll automático para o final
- Rolar para cima: histórico de mensagens visível; compositor permanece no rodapé
- Verificar que compositor não fica por baixo da bottom nav bar no PWA

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | `mobile-nav-safe` com valor diferente do esperado — compositor sobrepõe a nav bar | T1: verificar classe no tailwind.config antes de implementar |
| R2 | `100dvh` não suportado em browsers antigos | Fallback `100vh` como segunda opção; Android WebView 2022+ suporta |
| R3 | Layout de coluna desktop quebra com `flex flex-col h-full` | T4: verificar no desktop antes de marcar Done; ajustar condicionalmente se necessário |

---

## Out of Scope

- Mover `LeadEditForm` para sheet (→ Story 63-7)
- Pull-to-refresh para atualizar histórico
- Paginação de mensagens antigas

---

## Definition of Done

- [ ] AC1–AC6 marcados como completos
- [ ] T1–T5 marcados como done
- [ ] @qa executou quality gate com verdict ≥ PASS
- [ ] @devops fez push

---

## QA Results

### Review Date: 2026-06-18

### Reviewed By: Quinn (@qa) — Test Architect

**Veredito: PASS** (quality_score 95) — 6/6 ACs atendidos por código, sem regressão, CON-1 inviolável limpo, 3 issues LOW documentadas.

#### Quality checks (7)
1. **Traceability AC→código:** PASS — todos os 6 ACs rastreados (ver `ac_traceability` no gate file). A ressalva honesta do dev (form + cards ainda acima do chat no mobile até a 63-7) é **aceitável** para esta story: os ACs testáveis da 63-6 NÃO exigem remover o form (Out of Scope L203), e o @po validou o split (GO 8/10). Registrada como SCOPE-001 (LOW).
2. **CON-1 INVIOLÁVEL:** PASS/CLEAN — `git grep -nE 'tel:|wa.me|api.whatsapp.com|whatsapp://|click-to-call' HEAD` nos 2 arquivos tocados → **zero ocorrências** (exit 1).
3. **Regressão:** PASS — `BrokerMessageInput`, `WindowStatusBadge` e `disabledByWindow` intactos (page passa as mesmas props). Auto-scroll de `chat-scroll-area.tsx` rola **apenas o container** via `el.scrollTo`, **nunca a window** (verificado em L33-38) — sem page-jump. CON-3 (is_ai_active/takeover) não tocado.
4. **Mobile/PWA:** PASS — `100dvh` (não `100vh`) é a escolha correta (exclui barra de endereços retrátil). `env(safe-area-inset-bottom)` correto. Compositor não sobrepõe a bottom tab bar (`fixed bottom-0 lg:hidden` em `sidebar-nav.tsx:145`): clearance via `pb-24` do `broker/layout.tsx:44`. Cálculo `8rem` é heurístico/não-crítico (painel in-flow) → LAYOUT-001 (LOW).
5. **Acessibilidade:** PASS — composer reusa controles ≥44px + aria-labels (herdado 63-3); foco do textarea preservado; histórico rolável por teclado (overflow nativo).
6. **Escopo:** PASS — NÃO invadiu 63-5 (`ConversationThread`/2-colunas) nem 63-7 (remoção do `LeadEditForm`/sheet). Aplicada isoladamente em `page.tsx`.
7. **Testes:** suíte REAL `npx vitest run` → **414/414 (31 files)**. ESLint nos 2 arquivos → **0 erros/0 warnings**. `type-check` → **0 erros nos arquivos da story** (3 erros pré-existentes em `visual-editor.tsx`/`react-email-editor` — ambientais, não relacionados). `chat-scroll-area.tsx` sem teste unitário → TEST-001 (LOW): repo não tem infra de teste de componente React (sem @testing-library/jsdom/env dom, zero `.test.tsx`); comportamento é layout-dependente, não unit-testável em node. **Decisão: não adicionar teste frágil** — fora do escopo do gate e do padrão do projeto (só helpers puros têm teste no Epic 63).

#### Issues (todas LOW, não-bloqueantes)
| ID | Sev | Achado |
|----|-----|--------|
| TEST-001 | low | `chat-scroll-area.tsx` sem teste (repo sem infra de teste de componente React; scroll é layout-dependente). |
| LAYOUT-001 | low | `8rem` em `h-[calc(100dvh-8rem)]` é buffer heurístico, não derivado das alturas reais — revisar em 63-5/63-7. |
| SCOPE-001 | low | Mobile: form + cards acima do chat até 63-7 (por design do faseamento; ACs da 63-6 atendidos). |

### Gate Status

Gate: PASS → docs/qa/gates/63.6-composer-sticky-rodape.yml

**Recomendação:** LIBERADO para @devops *push — pode entrar no PR #14 (commit `eab263b`).

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-18 | 0.1 | Story drafted — Epic 63, Fase 2, composer sticky e layout full-screen | @sm (River) |
| 2026-06-18 | 0.2 | **Validação PO — verdict GO (8/10). Status Draft → Ready.** Story bem-formada e autossuficiente em `page.tsx`. Ressalvas não-bloqueantes nas Dev Notes (drift de linhas pós-Fase 1: `max-h-96` L209; `.mobile-nav-safe` só aplica safe-area-padding, não a altura da nav; var `--header-height` inexistente). CON-1/CON-5 respeitados. | @po (Pax) |
| 2026-06-18 | 0.3 | **Implementação @dev — Status InProgress → Ready for Review.** Card de conversa convertido em painel de chat flex full-height (`h-[calc(100dvh-8rem)]` mobile / `lg:h-[34rem]` desktop); `max-h-96` removido (AC1); histórico `flex-1 overflow-y-auto`; compositor `shrink-0` no rodapé com safe-area (AC2/AC3). Novo wrapper client `chat-scroll-area.tsx` p/ auto-scroll (AC5). type-check/lint/vitest verdes. CON-1 OK. Sem invadir 63-5/63-7. | @dev (Dex) |
| 2026-06-18 | 0.4 | **Quality Gate @qa — verdict PASS (score 95). Status Ready for Review → QA PASS (cleared for @devops push).** 6/6 ACs por código; CON-1 limpo (git grep zero); suíte 414/414; ESLint 0; type-check 0 na story; auto-scroll rola só o container (sem page-jump). 3 issues LOW (TEST-001, LAYOUT-001, SCOPE-001). Liberado para PR #14. | @qa (Quinn) |
