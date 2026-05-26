# Story 39-5: Cache versioning por build hash no service worker

## Status
Done

## Complexity
S (Small) — Next.js route para servir SW com hash + remoção de versão hardcoded

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run type-check", "npm run lint", "npm run build"]
```

## Story

**As a** desenvolvedor do CRM,
**I want** que o cache do service worker seja invalidado automaticamente a cada deploy,
**so that** usuários nunca fiquem presos em versões antigas do app sem perceber.

## Acceptance Criteria

1. Existe o arquivo `packages/web/src/app/sw/route.ts` que serve o service worker como uma Next.js Route Handler:
   - Handler `GET` que retorna o conteúdo do SW como `text/javascript`
   - Injeta o `NEXT_PUBLIC_BUILD_ID` (ou `process.env.BUILD_ID` / git SHA) como constante no topo do arquivo
   - Header `Cache-Control: no-cache, no-store, must-revalidate` na resposta (o SW em si não deve ser cacheado pelo browser — apenas os recursos que ele cacheia)
   - Header `Service-Worker-Allowed: /` na resposta (necessário quando SW é servido de path diferente de raiz)

2. O `public/sw.js` existente é **deletado** — o SW agora é servido pela route `/sw/route.ts`.

3. O `src/app/sw/route.ts` lê o conteúdo base do SW de um arquivo template `src/lib/sw-template.js` (ou similar), substitui o placeholder `__BUILD_HASH__` pelo valor real, e retorna como Response.

4. O arquivo template `src/lib/sw-template.js` (ou `src/lib/pwa/sw-source.js`):
   - Contém o código completo do SW atual (migrado de `public/sw.js`)
   - Usa `const BUILD_HASH = '__BUILD_HASH__'` no topo
   - As constantes de cache usam o hash: `const APP_SHELL_CACHE = \`trifold-shell-\${BUILD_HASH}\``  e `const STATIC_CACHE = \`trifold-static-\${BUILD_HASH}\``
   - O resto do código é idêntico ao `public/sw.js` atual (exceto nomes de cache)

5. O `src/components/pwa-init.tsx` é atualizado para registrar `/sw` em vez de `/sw.js`:
   ```tsx
   navigator.serviceWorker.register('/sw', { scope: '/' })
   ```
   O mesmo vale para `src/components/portal/push-prompt.tsx` que também faz `register('/sw.js')` — atualizar para `/sw`.

6. O `BUILD_HASH` injetado é gerado de forma estável: usar `process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` (disponível automaticamente na Vercel) com fallback para `process.env.BUILD_ID` e por último `Date.now().toString()`. O valor deve ser o mesmo para todos os requests dentro de um deploy.

7. `npm run build` compila sem erros. O arquivo `/sw` retorna HTTP 200 com `Content-Type: text/javascript` quando acessado.

8. `npm run type-check` e `npm run lint` passam.

## Scope

### IN
- `packages/web/src/app/sw/route.ts` — novo Route Handler para servir o SW
- `packages/web/src/lib/pwa/sw-source.js` (ou caminho equivalente) — template do SW com `__BUILD_HASH__`
- `packages/web/src/components/pwa-init.tsx` — atualizar URL de registro
- `packages/web/src/components/portal/push-prompt.tsx` — atualizar URL de registro
- `packages/web/public/sw.js` — **deletar**

### OUT
- Webpack plugin para injeção de hash (overengineering; Route Handler é mais simples)
- Versionamento de outros assets além do SW

## Dependencies

- `packages/web/public/sw.js` (atual) — conteúdo a ser migrado para o template
- `src/components/pwa-init.tsx` e `src/components/portal/push-prompt.tsx` — URLs a atualizar
- Variável de ambiente `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` (disponível automaticamente na Vercel; em dev local usa fallback)

## Dev Notes

### Estrutura do Route Handler
```typescript
// src/app/sw/route.ts
import { readFileSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'

const BUILD_HASH =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
  process.env.BUILD_ID ??
  Date.now().toString()

export const dynamic = 'force-dynamic'

export async function GET() {
  const template = readFileSync(
    join(process.cwd(), 'src/lib/pwa/sw-source.js'),
    'utf-8'
  )
  const swContent = template.replaceAll('__BUILD_HASH__', BUILD_HASH)

  return new NextResponse(swContent, {
    headers: {
      'Content-Type': 'text/javascript',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  })
}
```

### Por que não usar `next-pwa` ou similar?
O projeto já tem um SW customizado com lógica específica (offline pages, push notifications, background sync). Usar um plugin adicionaria abstração desnecessária. A Route Handler é a solução mais simples e controlável.

### Cuidado com `readFileSync` em produção (Vercel)
Na Vercel, o filesystem é somente-leitura após o build. `readFileSync` em um Route Handler com `force-dynamic` funciona porque lê arquivos incluídos no bundle. Garantir que `src/lib/pwa/sw-source.js` seja incluído no output do Next.js — arquivos dentro de `src/` são automaticamente incluídos.

Alternativa sem `readFileSync`: importar o conteúdo como string via template literal ou usar `import swSource from './sw-source.js?raw'` (Vite syntax, não suportado no Next.js). A abordagem `readFileSync` é a mais portável.

### Validação após deploy
1. Abrir DevTools → Application > Service Workers
2. Verificar que o SW registrado é `/sw` (não `/sw.js`)
3. Application > Cache Storage → confirmar que o cache name inclui o git hash (ex: `trifold-shell-abc1234`)
4. Após simular novo deploy (mudar hash), confirmar que antigo cache é deletado e novo criado

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
Nenhum — implementação direta sem blockers.

### Completion Notes
- `src/lib/pwa/sw-source.js` criado com `BUILD_HASH = '__BUILD_HASH__'` e caches usando template literal.
- `src/app/sw/route.ts` criado: lê template via `readFileSync`, substitui `__BUILD_HASH__` com priority chain (VERCEL_GIT_COMMIT_SHA → BUILD_ID → Date.now()), retorna com headers corretos.
- `pwa-init.tsx` e `push-prompt.tsx` atualizados de `/sw.js` para `/sw`.
- `public/sw.js` deletado — SW agora servido exclusivamente pela rota `/sw`.
- Build confirma rota `/sw` como `ƒ` (dynamic) — HTTP 200 com Content-Type text/javascript.

### File List
- `packages/web/src/lib/pwa/sw-source.js` — CRIADO (template do SW)
- `packages/web/src/app/sw/route.ts` — CRIADO (Route Handler)
- `packages/web/src/components/pwa-init.tsx` — MODIFICADO (URL /sw)
- `packages/web/src/components/portal/push-prompt.tsx` — MODIFICADO (URL /sw)
- `packages/web/public/sw.js` — DELETADO

### Change Log
- 2026-05-25: Implementação concluída por @dev (Dex) — claude-sonnet-4-6
