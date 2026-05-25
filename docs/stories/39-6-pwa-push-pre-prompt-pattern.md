# Story 39-6: Pre-prompt pattern para push notifications

## Status
Done

## Complexity
M (Medium) — refactor do push-prompt existente + dois estágios de UX

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run type-check", "npm run lint"]
```

## Story

**As a** cliente do Portal Minha Obra,
**I want** entender por que o app quer enviar notificações antes de ser solicitado pela API do browser,
**so that** eu possa tomar uma decisão informada e a taxa de aceitação seja maior.

## Acceptance Criteria

### Estágio 1 — Soft ask (in-app, sem permissão do browser)

1. O componente `src/components/portal/push-prompt.tsx` é refatorado para ter dois estágios:
   - **Estágio 1 (soft):** banner custom (in-app, sem chamar a API do browser) com:
     - Texto: "🔔 Quer saber quando sua obra avançar? Receba fotos e atualizações direto no celular."
     - Botão primário: "Sim, quero receber" (accent `#e8856a`)
     - Botão secundário: "Agora não"
   - **Estágio 2 (hard):** só é iniciado após click em "Sim, quero receber" do estágio 1 — chama `Notification.requestPermission()` e o subscribe flow existente

2. Trigger do estágio 1: exibir quando **todas** estas condições forem verdadeiras:
   - `'serviceWorker' in navigator` — SW suportado
   - `typeof Notification !== 'undefined'` — notificações suportadas
   - `Notification.permission === 'default'` — ainda não decidiu
   - `!sessionStorage.getItem('push-dismissed')` — não foi dispensado nesta sessão
   - `!localStorage.getItem('push-soft-declined-until')` — não recusou recentemente (soft)
   - Usuário está na página há mais de 10 segundos (timeout via `setTimeout`)
   - **NÃO** existe outro prompt visível (verificar se `push-dismissed` de sessão está setado)

3. Ao clicar "Agora não" no estágio 1:
   - Gravar `localStorage.setItem('push-soft-declined-until', String(Date.now() + 7*24*60*60*1000))` (7 dias)
   - Esconder o banner

4. Ao clicar "Sim, quero receber" no estágio 1:
   - Avançar para estágio 2 imediatamente
   - Estágio 2 chama `Notification.requestPermission()`:
     - Se `granted`: executar subscribe flow (igual ao código atual — `pushManager.subscribe` + POST `/api/push/subscribe`)
     - Se `denied` ou `default`: gravar `sessionStorage.setItem('push-dismissed', '1')` e esconder

5. Se `Notification.permission === 'granted'` ao montar o componente (já concedida anteriormente), executar o subscribe flow diretamente **sem** mostrar qualquer banner (flow silencioso para re-subscription).

6. Se `Notification.permission === 'denied'`, não mostrar nenhum banner (permission foi revogada pelo usuário, game over).

### UX adicional

7. O banner do estágio 1 tem animação de entrada suave (slide-up de 16px, opacity 0→1, 200ms) e respeita `prefers-reduced-motion`:
   ```css
   @media (prefers-reduced-motion: reduce) { animation: none; transition: none; }
   ```

8. O banner tem `role="region"` e `aria-label="Ativar notificações"`.

9. `npm run type-check` e `npm run lint` passam.

## Scope

### IN
- `packages/web/src/components/portal/push-prompt.tsx` — refactor (dois estágios)

### OUT
- Push notifications para o CRM dashboard (backlog separado, story 39-6b futura)
- Preference center (categorias de notificação — backlog evolutivo)
- Re-prompt após revogação de permissão (requer settings manual do browser — fora de escopo)

## Dependencies

- `/api/push/subscribe` — endpoint existente, sem mudanças
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — env var existente
- SW registrado com suporte a Push — garantido pelo `pwa-init.tsx`

## Dev Notes

### Estado do componente refatorado
```tsx
type Stage = 'hidden' | 'soft' | 'hard' | 'done'
const [stage, setStage] = useState<Stage>('hidden')
```

### Por que 10 segundos de delay?
Evita "assault by prompts" — se o usuário acabou de chegar na página e já aparece push prompt + potencialmente outros elementos, a taxa de dismiss é muito alta. 10 segundos dá tempo para o usuário orientar-se.

### Soft decline vs hard decline
- **Soft decline** (click "Agora não"): respeitar por 7 dias, depois perguntar de novo. O usuário não foi definitivo — só estava ocupado.
- **Hard decline** (browser API retorna "denied"): NUNCA perguntar de novo. A browser permission é permanente até o usuário mudar nas configurações manualmente.

### Re-subscription silenciosa
Se o usuário já concedeu permissão anteriormente mas a subscription expirou (ex.: SW foi recriado), o componente deve tentar re-subscribe silenciosamente sem banner. Isso garante que push funcione após reinstalação do app.

```tsx
useEffect(() => {
  if (Notification.permission === 'granted') {
    // tentar subscribe silencioso
    void silentResubscribe()
    return
  }
  // lógica de trigger do estágio 1
}, [])
```

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
Nenhum — implementação direta sem blockers.

### Completion Notes
- `push-prompt.tsx` reescrito com `type Stage = 'hidden' | 'soft' | 'hard' | 'done'`.
- Stage 1 (soft): banner in-app com delay de 10s, guards de `Notification.permission`, `push-dismissed` (session) e `push-soft-declined-until` (local, 7 dias).
- Stage 2 (hard): iniciado apenas após click em "Sim, quero receber" — chama `Notification.requestPermission()` + subscribe flow existente.
- Re-subscription silenciosa quando `permission === 'granted'` (sem banner).
- "Agora não" grava `push-soft-declined-until` por 7 dias.
- Animação `motion-safe:animate-[slideUp_0.2s_ease-out]` (reutiliza keyframe já definido em globals.css pela story 39-7).
- `role="region"` + `aria-label="Ativar notificações"` para acessibilidade.
- `npm run type-check` e `npm run lint` passam sem erros.

### File List
- `packages/web/src/components/portal/push-prompt.tsx` — MODIFICADO (dois estágios, soft/hard, delay 10s)

### Change Log
- 2026-05-25: Implementação concluída por @dev (Dex) — claude-sonnet-4-6
