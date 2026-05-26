# Story 39-7: Update notification toast + SW message handler

## Status
Done

## Complexity
S (Small) — hook de detecção de update + toast + postMessage no SW

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run type-check", "npm run lint"]
```

## Story

**As a** usuário com o CRM ou Portal aberto,
**I want** ser informado quando uma nova versão estiver disponível e poder atualizar com um clique,
**so that** eu nunca trabalhe com uma versão desatualizada sem perceber.

## Acceptance Criteria

1. O arquivo `src/components/pwa-init.tsx` é expandido para detectar updates do SW:
   - Após registrar o SW, escuta o evento `updatefound` no registration:
     ```
     reg.addEventListener('updatefound', () => {
       const newWorker = reg.installing
       newWorker.addEventListener('statechange', () => {
         if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
           onUpdateAvailable()
         }
       })
     })
     ```
   - `onUpdateAvailable` dispara um custom event `pwa-update-available` no `window`

2. Existe o componente `src/components/pwa-update-toast.tsx`:
   - Componente client que escuta o evento `pwa-update-available` via `window.addEventListener`
   - Quando disparado, exibe um toast fixo (position: fixed, bottom-right ou top-center) com:
     - Ícone de refresh (Lucide `RefreshCw`)
     - Texto: "Nova versão disponível"
     - Botão "Atualizar agora" (accent laranja para CRM, accent salmão para Portal — via prop ou CSS var)
     - Botão × para dispensar (sem recarregar)
   - Ao clicar "Atualizar agora":
     - Envia `postMessage({ type: 'SKIP_WAITING' })` para `navigator.serviceWorker.waiting`
     - Após `controllerchange` event no `navigator.serviceWorker`, faz `window.location.reload()`
   - Toast tem `role="status"` e `aria-live="polite"` para anunciar ao screen reader
   - Respeita `prefers-reduced-motion`

3. O SW (seja `public/sw.js` ou o template de 39-5) tem o handler de mensagem:
   ```js
   self.addEventListener('message', (event) => {
     if (event.data?.type === 'SKIP_WAITING') {
       self.skipWaiting()
     }
   })
   ```

4. O componente `PwaUpdateToast` é importado e renderizado em:
   - `src/app/layout.tsx` (root — cobre CRM e Portal)
   - Ou alternativamente em `src/components/pwa-init.tsx` como parte do próprio componente de init (escolher abordagem mais simples)

5. `npm run type-check` e `npm run lint` passam.

## Scope

### IN
- `packages/web/src/components/pwa-init.tsx` — adicionar detecção de `updatefound` + dispatch de evento
- `packages/web/src/components/pwa-update-toast.tsx` — novo componente
- `packages/web/public/sw.js` (ou template 39-5) — adicionar `message` event handler
- `packages/web/src/app/layout.tsx` — renderizar `PwaUpdateToast`

### OUT
- Auto-reload sem confirmação do usuário (respeitar agência do usuário)
- Changelog detalhado da nova versão no toast
- Forçar update após X horas (backlog)

## Dependencies

- Story 39-5 (opcional mas recomendado — se concluída primeiro, aplicar o `message` handler no template do SW; se não, aplicar no `public/sw.js`)
- `src/components/pwa-init.tsx` existente (base para expandir)

## Dev Notes

### Por que custom event em vez de prop drilling?
O `pwa-init.tsx` é um leaf component sem filhos — não tem como passar estado para o toast via props. O custom event `pwa-update-available` é a forma mais limpa de comunicação desacoplada entre o detector (pwa-init) e o display (toast).

### Sequência exata do update flow
```
1. Deploy → novo SW baixado em background
2. SW novo fica em estado 'waiting' (antigo ainda ativo)
3. pwa-init detecta 'updatefound' → 'installed' → dispara evento
4. Toast aparece para o usuário
5. Usuário clica "Atualizar" → postMessage SKIP_WAITING
6. SW novo ativa → 'controllerchange' dispara
7. window.location.reload() → app roda com versão nova
```

### Cuidado com o `controllerchange` timing
```tsx
navigator.serviceWorker.addEventListener('controllerchange', () => {
  window.location.reload()
})
```
Este listener deve ser adicionado **antes** de enviar o `postMessage`, para não perder o evento.

### Toast posicionamento
Para o CRM: `fixed bottom-4 right-4` (não conflita com sidebar na esquerda).
Para o Portal: o Portal tem tab bar na parte inferior (mobile), então `fixed top-4 right-4` pode ser mais seguro. Avaliar no contexto.

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
Nenhum — implementação direta sem blockers.

### Completion Notes
- `pwa-init.tsx` expandido: `.then(reg => ...)` substitui `.catch()` direto — escuta `updatefound` → `statechange` → `installed+controller` → dispara `CustomEvent('pwa-update-available')`.
- `pwa-update-toast.tsx` criado: toast `fixed bottom-4 right-4` com RefreshCw, botão "Atualizar agora" (accent laranja), botão × dismiss. `controllerchange` listener adicionado ANTES do `postMessage` para evitar race condition.
- `sw-source.js` atualizado: handler `message` adicionado no final com guard `event.data?.type === 'SKIP_WAITING'`.
- `layout.tsx` atualizado: `PwaUpdateToast` importado e renderizado entre `OfflineBadge` e `PwaInit`.
- `globals.css` atualizado: `@keyframes slideUp` adicionado para animação do toast.
- `npm run type-check` e `npm run lint` passam sem erros.

### File List
- `packages/web/src/components/pwa-init.tsx` — MODIFICADO (updatefound + custom event)
- `packages/web/src/components/pwa-update-toast.tsx` — CRIADO
- `packages/web/src/lib/pwa/sw-source.js` — MODIFICADO (message handler)
- `packages/web/src/app/layout.tsx` — MODIFICADO (PwaUpdateToast)
- `packages/web/src/app/globals.css` — MODIFICADO (slideUp keyframe)

### Change Log
- 2026-05-25: Implementação concluída por @dev (Dex) — claude-sonnet-4-6
