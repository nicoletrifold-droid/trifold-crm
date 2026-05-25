# Story 39-8: Status offline persistente + storage quota management

## Status
Done

## Complexity
S (Small) — hook de status + badge no header + LRU no SW

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run type-check", "npm run lint"]
```

## Story

**As a** usuário do CRM ou Portal,
**I want** ver claramente quando estou offline (não só quando navego para outra rota),
**and** que o app nunca falhe silenciosamente por falta de espaço em disco,
**so that** eu tenha confiança nos dados que estou vendo e o app funcione de forma confiável a longo prazo.

## Acceptance Criteria

### Badge de status offline (visual)

1. Existe o hook `src/hooks/use-online-status.ts`:
   ```ts
   import { useState, useEffect } from 'react'
   export function useOnlineStatus() {
     const [online, setOnline] = useState(
       typeof navigator !== 'undefined' ? navigator.onLine : true
     )
     useEffect(() => {
       const on = () => setOnline(true)
       const off = () => setOnline(false)
       window.addEventListener('online', on)
       window.addEventListener('offline', off)
       return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
     }, [])
     return online
   }
   ```

2. Existe o componente `src/components/offline-badge.tsx`:
   - Usa `useOnlineStatus()`
   - Quando **offline**: renderiza badge âmbar com ícone `WifiOff` (Lucide) + texto "Offline"
   - Quando **online**: renderiza `null` (não poluir a UI em estado normal)
   - Badge tem `role="status"` e `aria-live="polite"` com `aria-label="Você está offline"`
   - Texto e ícone: nunca usa cor como único diferenciador (ícone + label sempre presentes)
   - CSS: `fixed top-4 left-1/2 -translate-x-1/2 z-50` (centrado no topo, visível em qualquer rota)
   - Animação de entrada slide-down, respeita `prefers-reduced-motion`

3. O componente `OfflineBadge` é importado e renderizado em `src/app/layout.tsx` (cobre todas as rotas).

4. Testar com DevTools → Network → Offline: badge deve aparecer imediatamente sem necessidade de navegar.

### Storage quota management no SW

5. O SW (seja `public/sw.js` ou template de 39-5) tem função `trimCache`:
   ```js
   async function trimCache(cacheName, maxEntries) {
     const cache = await caches.open(cacheName)
     const keys = await cache.keys()
     if (keys.length > maxEntries) {
       await Promise.all(
         keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k))
       )
     }
   }
   ```

6. A função `trimCache` é chamada após cada `cache.put()` no `STATIC_CACHE` com `maxEntries = 100`.

7. O `pwa-init.tsx` solicita persistência de storage após montagem:
   ```ts
   if (navigator.storage?.persist) {
     await navigator.storage.persist()
   }
   ```
   (Silencioso — sem UI. Só registrar resultado no console.log em dev.)

8. `npm run type-check` e `npm run lint` passam.

## Scope

### IN
- `packages/web/src/hooks/use-online-status.ts` — novo hook
- `packages/web/src/components/offline-badge.tsx` — novo componente
- `packages/web/src/app/layout.tsx` — renderizar `OfflineBadge`
- `packages/web/public/sw.js` (ou template 39-5) — adicionar `trimCache` + chamada após puts
- `packages/web/src/components/pwa-init.tsx` — adicionar `navigator.storage.persist()`

### OUT
- Last-synced timestamp em listas de dados (backlog — requer integração com data-fetching layer)
- Quota check com UI de aviso para o usuário ("armazenamento quase cheio")
- Background Sync real para ações offline (backlog maior — story separada)
- IndexedDB para dados offline

## Dependencies

- `packages/web/src/components/pwa-init.tsx` existente (para adicionar `persist()`)
- Lucide `WifiOff` icon (já disponível como dependência do projeto)
- `packages/web/public/sw.js` existente (ou template de 39-5 se concluída primeiro)

## Dev Notes

### Por que `fixed top-4 left-1/2` e não no header/sidebar?
O badge offline é transversal — aparece em rotas de CRM e Portal, que têm headers completamente diferentes. Posicionamento fixed centrado evita acoplamento com cada layout.

### Interação com tema claro/escuro
Badge âmbar funciona bem tanto em fundo claro quanto escuro. Usar classes Tailwind que funcionam nos dois:
```
bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300
```
Com border sutil: `border border-amber-300 dark:border-amber-500/40`

### `navigator.storage.persist()` — o que faz?
Sem persistência: o browser pode desalocar o cache de um site que não foi visitado recentemente para liberar espaço. Com `persist()`, o browser pede confirmação ao usuário antes de apagar (ou nunca apaga, dependendo do browser). Aumenta a confiabilidade do cache offline.

### `trimCache` — por que 100 entradas?
O `STATIC_CACHE` acumula assets JS/CSS/imagens do Next.js. Assets são hashed por build (`_next/static/chunks/...`), então cada deploy adiciona novos arquivos. 100 entradas ≈ ~10-20MB típico. Ajustar se necessário.

### Validação do trimCache
No DevTools → Application > Cache Storage > STATIC_CACHE, verificar que o número de entradas não cresce infinitamente após múltiplas navegações.

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
Nenhum — implementação direta sem blockers.

### Completion Notes
- `use-online-status.ts` criado conforme spec exata do AC com cleanup correto dos listeners.
- `offline-badge.tsx` criado: fixed top centrado, WifiOff + "Offline", role="status" aria-live="polite", aria-label, animação slideDown com `motion-safe:`, cores âmbar dark/light.
- Keyframe `@keyframes slideDown` adicionado em `globals.css` (referência via `motion-safe:animate-[slideDown_0.2s_ease-out]`).
- `OfflineBadge` importado e renderizado em `layout.tsx` (cobre todas as rotas).
- `pwa-init.tsx` atualizado com `navigator.storage.persist()` — silencioso, log apenas em dev.
- `sw.js` atualizado: função `trimCache` adicionada, chamada após cada `cache.put` no STATIC_CACHE com maxEntries=100.

### File List
- `packages/web/src/hooks/use-online-status.ts` — CRIADO
- `packages/web/src/components/offline-badge.tsx` — CRIADO
- `packages/web/src/app/layout.tsx` — MODIFICADO (import + render OfflineBadge)
- `packages/web/src/app/globals.css` — MODIFICADO (keyframe slideDown)
- `packages/web/src/components/pwa-init.tsx` — MODIFICADO (storage.persist)
- `packages/web/public/sw.js` — MODIFICADO (trimCache + chamada após cache.put)

### Change Log
- 2026-05-25: Implementação concluída por @dev (Dex) — claude-sonnet-4-6
