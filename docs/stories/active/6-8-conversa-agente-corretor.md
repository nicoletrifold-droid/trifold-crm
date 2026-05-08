status: Done

# Story 6.8 — Visualizar Conversa do Agente (Painel Corretor)

## Contexto
O corretor precisa ver toda a conversa que a Nicole teve com o lead antes do handoff. Isso e essencial para nao repetir perguntas e entender o contexto. O componente e o mesmo da Story 4.7 (conversa visivel no admin) — esta story garante que funciona no painel do corretor com as devidas permissoes e destaques de informacoes chave.

## Acceptance Criteria
- [x] AC1: No detalhe do lead do corretor (Story 6.4), tab/secao "Conversa" exibe o historico completo
- [x] AC2: Mensagens exibidas como chat bubbles (reusar componente da Story 4.7)
- [ ] AC3: Informacoes chave extraidas pela IA destacadas visualmente:
  - Nome mencionado pelo lead (highlight amarelo)
  - Preferencias mencionadas (quartos, andar, vista — badges inline)
  - Objecoes identificadas (highlight vermelho sutil)
- [ ] AC4: Separator visual de handoff: "Nicole transferiu a conversa para voce — [timestamp]"
- [x] AC5: Mensagens do corretor (via Coexistence Mode / Messaging Echoes) exibidas em azul
- [x] AC6: Scroll automatico para a mensagem mais recente ao abrir
- [ ] AC7: Mensagens atualizadas em tempo real (novas mensagens do lead aparecem — Realtime)
- [ ] AC8: Corretor so ve conversas dos leads designados a ele (validacao server-side)

## Detalhes Tecnicos

### Arquivos a criar/modificar:
- `packages/web/src/components/leads/lead-conversation.tsx` — Adicionar prop `highlightKeys` para destacar infos
- `packages/web/src/components/chat/key-info-highlight.tsx` — Componente de highlight

### Destacar informacoes chave:
```typescript
// Usar os dados coletados do conversation_state para saber o que destacar
// Ex: se state.collected_data.preferred_bedrooms = 2, destacar quando lead menciona "2 quartos"

interface ConversationHighlights {
  name?: string;
  preferences?: Record<string, string>;
  objections?: string[];
}
```

### Reuso:
- 90% reutiliza Story 4.7 (lead-conversation.tsx, message-bubble.tsx)
- Adiciona highlights e separator de handoff

## Dependencias
- Depende de: 4.7 (componente de conversa), 6.4 (pagina de detalhe do corretor), 3.10 (handoff registra separator)
- Bloqueia: Nenhuma

## Estimativa
P (Pequena) — 1-2 horas (reusar 90% da Story 4.7)

## File List

- `packages/web/src/app/broker/leads/[id]/page.tsx` — Secao de conversa integrada na pagina de detalhe do lead do corretor com chat bubbles, cores por sender type e scroll automatico para mensagem mais recente

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
