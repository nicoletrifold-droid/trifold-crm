---
epic: 63
title: UX do Atendimento do Corretor — Chat Mobile-First
status: Draft
created_at: 2026-06-18
updated_at: 2026-06-18
created_by: River (@sm)
priority: P0/P1/P2
objetivo_negocio:
  - Permitir que o corretor responda leads de forma rápida e intuitiva principalmente no celular/PWA
  - Centralizar o atendimento no número oficial Trifold (WhatsApp Cloud API já conectado) — nunca no WhatsApp pessoal
  - Eliminar fricção e ambiguidade na UI de chat (bolhas inconsistentes, janela de 24h invisível, composer escondido)
depends_on:
  - Epic 51 (Handoff Nicole → Corretor + Chat do Corretor) — API de envio, BrokerMessageInput, dispatch channel já implementados
  - Story 51-1 (Chat Bidirecional) — POST /api/leads/[id]/send-message, dispatchBrokerMessage, BrokerMessageInput existentes
  - Story 51-7 (Guard Precedência assigned_broker_id) — estabilidade de ownership do lead
related:
  - packages/web/src/app/broker/leads/[id]/page.tsx (tela de detalhe do lead — chat + forms)
  - packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx (composer atual)
  - packages/web/src/app/broker/leads/_components/leads-list-with-drawer.tsx (lista de leads mobile+desktop)
  - packages/web/src/components/leads/lead-detail-drawer.tsx (drawer alternativo — duplicação a unificar na S5)
stories_planned: [63-1, 63-2, 63-3, 63-4, 63-5, 63-6, 63-7, 63-8, 63-9, 63-10]
---

# Epic 63 — UX do Atendimento do Corretor: Chat Mobile-First

## Objetivo do Epic

O Epic 51 entregou a **capacidade** técnica: o corretor pode enviar mensagens ao lead diretamente
pelo CRM, via número oficial Trifold (WhatsApp Cloud API), sem precisar do WhatsApp pessoal.

Este epic entrega a **experiência**: a UI do corretor — principalmente no celular/PWA — precisa ser
rápida, clara e sem fricção para o atendimento diário. Hoje há quatro problemas concretos auditados
em código:

1. **Ícone errado** — a ação principal da lista de leads usa `Pencil` (editar) em vez de um ícone
   de conversa. Sinaliza edição de cadastro, não "responder ao lead".
2. **Bolhas inconsistentes** — `page.tsx` e `lead-detail-drawer.tsx` têm esquemas de cores e rótulos
   diferentes para o mesmo chat. A mensagem do corretor não tem cor distintiva nem indicador de status.
3. **Composer não é mobile-first** — usa emoji 📎, botão de texto "Enviar", dica de atalho de teclado
   visível no mobile, e alvos de toque menores que 44px.
4. **Janela de 24h invisível** — o corretor só descobre que não pode enviar *depois* de tentar. Não há
   sinalização proativa do status da janela WhatsApp Business.

Além desses quick wins, a tela de detalhe precisa de reestruturação arquitetural: o formulário de
edição do lead domina o topo e empurra o chat para baixo, e a duplicação `page.tsx`/`drawer.tsx`
gera manutenção redobrada.

---

## Restrição Dura (inviolável)

**NÃO usar `tel:`, `wa.me` ou qualquer mecanismo de click-to-call/click-to-chat externo.**

Essas abordagens abrem o WhatsApp *pessoal* do corretor, vazam o número individual, quebram a
atribuição de lead no CRM e fragmentam o histórico de conversa. A solução correta é melhorar a
experiência do chat interno que já despacha pelo número oficial (Epic 51, `dispatchBrokerMessage`).

---

## O que JÁ EXISTE (não recriar — herdar do Epic 51)

| Artefato | Path | Relevância |
|----------|------|-----------|
| API de envio | `packages/web/src/app/api/leads/[id]/send-message/route.ts` | Envia via WhatsApp/Telegram, grava `role='broker'` |
| Helper dispatch | `packages/web/src/lib/broker/dispatch-broker-message.ts` | Branch WhatsApp/Telegram, verifica janela 24h |
| Composer atual | `packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx` | Já modela `OptimisticMessage.pending/failed` (L9-16) |
| Tela de detalhe | `packages/web/src/app/broker/leads/[id]/page.tsx` | `last_message_at` e `is_ai_active` já buscados (L41) |
| Verificação de janela | `dispatch-broker-message.ts` | `WHATSAPP_WINDOW_CLOSED` quando `last_message_at > 24h` |
| Design system | Tailwind, `orange-500`, dark: `stone`, breakpoint `lg` | Laranja é a cor primária da marca |
| Bottom nav PWA | `mobile-nav-safe` (safe-area iOS) | Composer precisa ficar acima desta barra |

---

## Auditoria de Código — Problemas Identificados com Localização

| Problema | Arquivo | Linhas | Story |
|----------|---------|--------|-------|
| Ícone `Pencil` na ação de lead | `broker/leads/_components/leads-list-with-drawer.tsx` | L81-87 (mobile), L154-160 (desktop) | 63-1 |
| Bolhas sem rótulo/status; `page.tsx` diverge do drawer | `broker/leads/[id]/page.tsx` L196-216; `lead-detail-drawer.tsx` todo | — | 63-2 |
| 📎 emoji, "Enviar" texto, dica atalho, alvos pequenos | `broker/leads/[id]/_components/broker-message-input.tsx` L99-106, L127 | — | 63-3 |
| Janela 24h visível só pós-erro (WHATSAPP_WINDOW_CLOSED) | `broker-message-input.tsx` L54-59; `page.tsx` L41 tem `last_message_at` | — | 63-4 |
| Duplicação de UI de chat (page.tsx vs drawer.tsx ~975 linhas) | `page.tsx` + `lead-detail-drawer.tsx` | — | 63-5 |
| Composer dentro de `max-h-96 overflow-y-auto` | `page.tsx` L192 | — | 63-6 |
| `LeadEditForm` (L112) + 2 cards (L130) bloqueiam o chat | `page.tsx` L112-L191 | — | 63-7 |
| Sem banner de estado Nicole ativo/corretor assumiu | `page.tsx`; `is_ai_active` disponível (L41) | — | 63-8 |
| Sem badge de janela na lista de leads | `leads-list-with-drawer.tsx` | — | 63-9 |
| Sem caminho de saída quando janela fechada | `broker-message-input.tsx` L54-59 | — | 63-10 |

---

## Stories

### Story 63-1 — Ícone de Ação na Lista de Leads (P0)
**Executor:** @dev | **QG:** @qa | **Complexity:** XS (1-2h) | **Prioridade:** P0 | **Fase:** 1
Trocar `Pencil` → `MessageCircle` (lucide-react) e label "Atender lead" → "Responder" em mobile (L81-87) e desktop (L154-160) de `leads-list-with-drawer.tsx`. Alvo de toque ≥44px.
**Depende de:** nada (autossuficiente)

### Story 63-2 — Padronizar Bolhas do Chat (P0)
**Executor:** @dev | **QG:** @qa | **Complexity:** S (2-3h) | **Prioridade:** P0 | **Fase:** 1
Corretor=laranja à direita com rótulo "Você" e status de entrega (⏳/✓/⚠ via `OptimisticMessage.pending/failed`); lead=cinza esquerda + "Lead"; Nicole=roxo esquerda + "Nicole". Alinhar `page.tsx` ao padrão do drawer (ou vice-versa, definir padrão canônico). Corrigir contraste de timestamps.
**Depende de:** nada (autossuficiente); prepara terreno para 63-5

### Story 63-3 — Composer Mobile-First (P0)
**Executor:** @dev | **QG:** @qa | **Complexity:** S (2h) | **Prioridade:** P0 | **Fase:** 1
`broker-message-input.tsx`: emoji 📎 → ícone `Paperclip` com aria-label; "Enviar" → ícone `Send`; dica de atalho teclado oculta em mobile; alvos de toque ≥44px.
**Depende de:** nada (autossuficiente)

### Story 63-4 — Estado da Janela de 24h Visível Antes do Envio (P0)
**Executor:** @dev | **QG:** @qa | **Complexity:** S/M (3-4h) | **Prioridade:** P0 | **Fase:** 1
Badge no header do chat: verde (aberta + countdown) / âmbar (< 2h para fechar) / cinza (fechada). Desabilitar composer proativamente quando fechada, com mensagem explicativa. Derivado de `conversations.last_message_at` já buscado em `page.tsx` L41.
**Depende de:** nada (autossuficiente)

### Story 63-5 — Unificar Página vs Drawer em Componente Único (P1)
**Executor:** @dev | **QG:** @qa | **Complexity:** L (8-12h) | **Prioridade:** P1 | **Fase:** 2
Extrair lógica de renderização de conversa de `page.tsx` e `lead-detail-drawer.tsx` (~975 linhas) em um único componente `ConversationThread`. Mobile = tela cheia estilo chat; desktop = 2 colunas lista + conversa. Eliminar duplicação de cores/rótulos/fetch.
**Depende de:** 63-2 (padrão de bolhas definido); bloqueia: manutenibilidade futura

### Story 63-6 — Composer Fixo (Sticky) no Rodapé (P1)
**Executor:** @dev | **QG:** @qa | **Complexity:** M (4-6h) | **Prioridade:** P1 | **Fase:** 2
Remover `max-h-96 overflow-y-auto` do container de mensagens em `page.tsx` (L192). Conversa ocupa a tela inteira com `flex-1 overflow-y-auto`. Composer fixo com `sticky bottom-0` acima da bottom tab bar (`mb-mobile-nav-safe` ou equivalente de safe-area iOS).
**Depende de:** 63-5 (componente unificado) ou pode ser aplicado em `page.tsx` isoladamente como pré-requisito

### Story 63-7 — Detalhes do Lead em Sheet/Aba Secundária (P1)
**Executor:** @dev | **QG:** @qa | **Complexity:** M (4-6h) | **Prioridade:** P1 | **Fase:** 2
Mover `LeadEditForm` (L112), cards "Dados do Lead" e "Resumo IA" (L130) e botão "Transferir corretor" para uma sheet ou aba "Detalhes" acionada por ícone ⋯ no header. O caminho default na tela é o chat, não o formulário de edição.
**Depende de:** 63-5 (estrutura da tela definida); 63-6 (layout de chat confirmado)

### Story 63-8 — Banner "Nicole no Controle / Você Assumiu" (P1)
**Executor:** @dev | **QG:** @qa | **Complexity:** S (2h) | **Prioridade:** P1 | **Fase:** 3
Banner no topo da conversa indicando estado atual: "Nicole está atendendo" (quando `is_ai_active=true`) vs. "Você assumiu o atendimento" (quando `is_ai_active=false`). Botão de takeover explícito para o corretor assumir manualmente (chama API existente de handoff). Derivado de `conversations.is_ai_active` já disponível em `page.tsx` L41.
**Depende de:** 63-5 (opcional — pode ser aplicado em `page.tsx` isoladamente)

### Story 63-9 — Badge de Janela de 24h na Lista de Leads (P2)
**Executor:** @dev | **QG:** @qa | **Complexity:** S/M (3h) | **Prioridade:** P2 | **Fase:** 3
Badge na lista de leads (`leads-list-with-drawer.tsx`) indicando estado da janela WhatsApp: verde/âmbar/cinza. Opção de ordenar lista por "janela fechando primeiro" para o corretor priorizar atendimentos urgentes.
**Depende de:** 63-4 (helper de status de janela reutilizável); 63-1 (ícone atualizado)

### Story 63-10 — Caminho de Saída quando Janela Fechada (P2)
**Executor:** @dev | **QG:** @qa | **Complexity:** S (2-3h) | **Prioridade:** P2 | **Fase:** 3
Quando janela fechada: botão "Me avisar quando o lead responder" (grava preferência local/DB) + placeholder explicativo sobre template aprovado. Prepara a arquitetura para o envio real de template (não implementa envio — somente UI e estrutura de dados para futura integração).
**Depende de:** 63-4 (estado de janela implementado)

---

## Ordem de Execução Recomendada

```
FASE 1 — Em paralelo (todos autossuficientes):
  63-1 (Ícone) — XS
  63-2 (Bolhas) — S
  63-3 (Composer mobile-first) — S
  63-4 (Janela 24h) — S/M

FASE 2 — Sequencial (estrutural):
  63-5 (Unificar page/drawer) — L, depende de 63-2
    ↓
  63-6 (Composer sticky) — M
    ↓
  63-7 (Detalhes sheet) — M, depende de 63-5 + 63-6

FASE 3 — Em paralelo após Fase 2:
  63-8 (Banner Nicole) — S
  63-9 (Badge lista) — S/M, depende de 63-4
  63-10 (Saída janela) — S, depende de 63-4
```

---

## Constraints (CON)

- **CON-1 (INVIOLÁVEL):** NÃO usar `tel:`, `wa.me` ou qualquer deep link para WhatsApp pessoal — viola RLS, fragmenta histórico e expõe número do corretor
- **CON-2:** NÃO reimplementar o mecanismo de envio — reusar `dispatchBrokerMessage` e `POST /api/leads/[id]/send-message` do Epic 51
- **CON-3:** NÃO alterar `is_ai_active` nem lógica de takeover — `brokerSentRecently` no cron já cuida disso automaticamente
- **CON-4:** NÃO criar nova migration para stories de FASE 1 — todas as mudanças são UI/componentes puros
- **CON-5:** Composer DEVE ficar acima da bottom tab bar (`mobile-nav-safe` / safe-area iOS) em todas as stories que tocarem o layout
- **CON-6:** Design system: Tailwind, laranja `orange-500`/`ea580c`, dark mode `stone`, breakpoint `lg` (1024px), lucide-react para ícones

---

## NFRs do Epic

- **NFR-1:** Cada story de FASE 1 deve ser implementável de forma isolada sem afetar as outras — não criar dependências desnecessárias entre S1-S4
- **NFR-2:** Alvos de toque ≥ 44×44px em todos os controles interativos (WCAG 2.5.5)
- **NFR-3:** Contraste ≥ 3:1 para texto não-essencial (timestamps, rótulos), ≥ 4.5:1 para conteúdo primário — em modo claro e escuro
- **NFR-4:** Nenhuma story de FASE 1 deve adicionar queries adicionais ao banco — usar apenas dados já disponíveis na tela
- **NFR-5:** O `ConversationThread` unificado (63-5) deve renderizar corretamente em mobile (< 1024px) e desktop (≥ 1024px)

---

## Critérios de Done do Epic

- [ ] Story 63-1 Done → ícone e label corretos na lista de leads
- [ ] Story 63-2 Done → bolhas padronizadas com rótulo de autor e status de entrega nas duas UIs
- [ ] Story 63-3 Done → composer com ícones, alvos ≥44px, sem dica de atalho no mobile
- [ ] Story 63-4 Done → janela 24h visível antes de tentar enviar; composer desabilitado proativamente
- [ ] Story 63-5 Done → componente `ConversationThread` único usado em page e drawer
- [ ] Story 63-6 Done → chat ocupa tela inteira; composer fixo acima da nav bar
- [ ] Story 63-7 Done → LeadEditForm e cards acessíveis via sheet "Detalhes", não bloqueando o chat
- [ ] Story 63-8 Done → banner Nicole/corretor visível no topo da conversa
- [ ] Story 63-9 Done → badge de janela na lista; ordenação por urgência disponível
- [ ] Story 63-10 Done → caminho de saída implementado quando janela fechada
- [ ] Zero regressão na API de envio (Epic 51 continua funcional)
- [ ] Zero regressão no brokerSentRecently (Nicole continua pausando automaticamente)

---

## Riscos Globais do Epic

| ID | Risco | Prob | Impacto | Mitigação |
|----|-------|------|---------|-----------|
| GR-1 | Story 63-5 (unificação) causa regressão no drawer existente | Alta | Alto | Migrar gradualmente — manter drawer.tsx como wrapper até validação completa |
| GR-2 | Refactor do layout (63-6/63-7) quebra safe-area iOS no PWA | Média | Alto | Testar em dispositivo físico iOS antes de marcar Done; usar `env(safe-area-inset-bottom)` |
| GR-3 | Badge de janela 24h com cálculo client-side dessincroniza com estado real | Baixa | Médio | Usar `last_message_at` + `Date.now()` (sem polling extra); tolerância de ±1min é aceitável |
| GR-4 | 63-7 (sheet de detalhes) afeta fluxo de edição de cadastro do lead | Média | Médio | Preservar URL de navegação e funcionalidade de `LeadEditForm` dentro da sheet |
| GR-5 | FASE 1 bloqueada esperando FASE 2 por dependências acidentais | Baixa | Alto | CON-4: FASE 1 sem migration, autossuficiente — verificar isolamento antes de iniciar |

---

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-06-18 | @sm (River) | Epic criado após auditoria de UX da área do corretor (10 problemas identificados em código; 3 fases; 10 stories) |
