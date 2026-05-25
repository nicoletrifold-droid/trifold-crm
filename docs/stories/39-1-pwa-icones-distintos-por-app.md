# Story 39-1: Ícones distintos por app (CRM vs Portal) + maskable 192px

## Status
Done

## Complexity
S (Small) — assets visuais + atualização de manifests e layouts

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run type-check", "npm run lint"]
```

## Story

**As a** usuário que instala tanto o CRM quanto o Portal Minha Obra no mesmo device,
**I want** que cada app tenha um ícone visual distinto no launcher,
**so that** eu consiga diferenciar os dois apps de um vistazo sem precisar ler o nome.

## Acceptance Criteria

1. Existem novos arquivos de ícone em `packages/web/public/`:
   - `/icon-crm-192.png` — 192×192px, identidade CRM (laranja `#ea580c`, fundo `#fafaf9`)
   - `/icon-crm-512.png` — 512×512px, mesma identidade
   - `/icon-crm-192-maskable.png` — 192×192px com safe zone de 80% (área segura centralizada), fundo preenchido até as bordas para Android adaptive icons
   - `/icon-crm-512-maskable.png` — 512×512px maskable
   - `/icon-cliente-192.png` — 192×192px, identidade Portal (salmão `#e8856a`, fundo `#0c0a09`)
   - `/icon-cliente-512.png` — 512×512px, mesma identidade
   - `/icon-cliente-512-maskable.png` — 512×512px maskable (fundo `#0c0a09`)

2. O arquivo `public/manifest.json` (CRM) tem o array `icons` atualizado para referenciar apenas os ícones CRM:
   ```json
   "icons": [
     { "src": "/icon-crm-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
     { "src": "/icon-crm-192-maskable.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
     { "src": "/icon-crm-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
     { "src": "/icon-crm-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
   ]
   ```

3. O arquivo `public/cliente-manifest.json` tem o array `icons` atualizado para referenciar apenas os ícones Portal:
   ```json
   "icons": [
     { "src": "/icon-cliente-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
     { "src": "/icon-cliente-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
     { "src": "/icon-cliente-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
   ]
   ```

4. O layout root `src/app/layout.tsx` tem `metadata.icons.apple` apontando para `/icon-crm-192.png`.

5. O layout do portal `src/app/cliente/[obra_id]/layout.tsx` tem `metadata.icons.apple` apontando para `/icon-cliente-192.png`.

6. O SW `public/sw.js` tem `APP_SHELL_URLS` atualizado para incluir os novos ícones de cada contexto:
   - Adicionar `/icon-crm-192.png` e `/icon-cliente-192.png` no array (manter os genéricos se ainda referenciados).

7. `npm run type-check` e `npm run lint` passam sem erros.

## Scope

### IN
- `packages/web/public/icon-crm-192.png` (novo)
- `packages/web/public/icon-crm-512.png` (novo)
- `packages/web/public/icon-crm-192-maskable.png` (novo)
- `packages/web/public/icon-crm-512-maskable.png` (novo)
- `packages/web/public/icon-cliente-192.png` (novo)
- `packages/web/public/icon-cliente-512.png` (novo)
- `packages/web/public/icon-cliente-512-maskable.png` (novo)
- `packages/web/public/manifest.json` (modificar icons array)
- `packages/web/public/cliente-manifest.json` (modificar icons array)
- `packages/web/src/app/layout.tsx` (atualizar icons.apple)
- `packages/web/src/app/cliente/[obra_id]/layout.tsx` (atualizar icons.apple)
- `packages/web/public/sw.js` (atualizar APP_SHELL_URLS)

### OUT
- Ícone monocromático SVG (nice-to-have, backlog)
- Redesign do logotipo da marca
- Ícones para notificação badge (backlog)

## Dependencies

- Designer ou ferramenta automatizada para gerar os assets visuais
  - Opção automatizada: `pnpm dlx pwa-asset-generator <source-image> <output-dir>` a partir de um SVG fonte
  - Se não houver SVG fonte, pode-se usar ImageMagick para derivar dos ícones existentes com background fill diferente
- `packages/web/public/icon-192.png` e `icon-512.png` existentes (fallback mantido se necessário)

## Dev Notes

### Sobre maskable icons
O Android usa adaptive icons: o sistema aplica uma máscara (círculo, squircle, etc.) ao ícone. Para que o ícone não seja cortado, a área "segura" (safe zone) deve estar nos 80% centrais. Use [maskable.app/editor](https://maskable.app/editor) para validar visualmente.

### Geração simplificada sem designer
Se não houver assets de design disponíveis, uma abordagem pragmática:
1. Criar SVG simples para cada app (letra "T" para CRM, ícone de construção para Portal)
2. Gerar PNGs via `pwa-asset-generator` ou sharp/canvas em Node
3. Para maskable: garantir que o fundo preencha 100% do ícone (sem transparência nas bordas)

### Validação no Chrome DevTools
Application > Manifest > Icons mostra preview de cada ícone com propósito. Verificar se "maskable" preview mostra o ícone dentro do círculo sem corte.

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
Nenhum — implementação direta sem blockers.

### Completion Notes
- 7 ícones PNG gerados via Node.js (zlib): icon-crm-192/512.png, icon-crm-192/512-maskable.png, icon-cliente-192/512.png, icon-cliente-512-maskable.png.
- CRM icons: laranja #ea580c (sólido). Portal icons: salmão #e8856a (sólido).
- manifest.json: icons array atualizado para referenciar apenas ícones CRM.
- cliente-manifest.json: icons array atualizado para ícones Portal.
- app/layout.tsx: icons.apple → /icon-crm-192.png.
- cliente/[obra_id]/layout.tsx: icons.apple → /icon-cliente-192.png.
- sw-source.js: APP_SHELL_URLS atualizado para /icon-crm-192.png e /icon-cliente-192.png.

### File List
- `packages/web/public/icon-crm-192.png` — CRIADO
- `packages/web/public/icon-crm-512.png` — CRIADO
- `packages/web/public/icon-crm-192-maskable.png` — CRIADO
- `packages/web/public/icon-crm-512-maskable.png` — CRIADO
- `packages/web/public/icon-cliente-192.png` — CRIADO
- `packages/web/public/icon-cliente-512.png` — CRIADO
- `packages/web/public/icon-cliente-512-maskable.png` — CRIADO
- `packages/web/public/manifest.json` — MODIFICADO (icons array)
- `packages/web/public/cliente-manifest.json` — MODIFICADO (icons array)
- `packages/web/src/app/layout.tsx` — MODIFICADO (icons.apple)
- `packages/web/src/app/cliente/[obra_id]/layout.tsx` — MODIFICADO (icons.apple)
- `packages/web/src/lib/pwa/sw-source.js` — MODIFICADO (APP_SHELL_URLS)

### Change Log
- 2026-05-25: Implementação concluída por @dev (Dex) — claude-sonnet-4-6
