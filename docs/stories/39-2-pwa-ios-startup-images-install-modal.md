# Story 39-2: iOS PWA — startup images + modal de instalação

## Status
Ready

## Complexity
M (Medium) — geração de 14+ imagens de splash + componente React interativo

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run type-check", "npm run lint"]
```

## Story

**As a** usuário com iPhone,
**I want** que ao abrir o app instalado na tela inicial não apareça uma tela branca/preta,
**and** que o Safari me mostre instruções claras de como instalar o app,
**so that** a experiência de instalação e abertura seja indistinguível de um app nativo.

## Acceptance Criteria

### Splash screens (startup images)

1. Existem arquivos de splash em `packages/web/public/splash/` para os principais dispositivos iOS. No mínimo os 6 mais comuns (portrait):
   - `iphone-se-portrait.png` — 750×1334 (iPhone SE 2nd/3rd gen)
   - `iphone-14-portrait.png` — 1170×2532 (iPhone 14)
   - `iphone-14-pro-portrait.png` — 1179×2556 (iPhone 14 Pro)
   - `iphone-15-portrait.png` — 1179×2556 (iPhone 15)
   - `iphone-15-pro-max-portrait.png` — 1290×2796 (iPhone 15 Pro Max)
   - `ipad-pro-11-portrait.png` — 1668×2388 (iPad Pro 11")
   - Cada imagem tem fundo sólido correspondente ao contexto:
     - CRM: `#fafaf9` com ícone CRM centralizado
     - Portal: `#0c0a09` com ícone Portal centralizado

2. O layout root `src/app/layout.tsx` tem as startup images do CRM declaradas em `metadata.icons.other[]`:
   ```tsx
   other: [
     { rel: 'apple-touch-startup-image', media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)', url: '/splash/iphone-se-portrait.png' },
     { rel: 'apple-touch-startup-image', media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', url: '/splash/iphone-14-portrait.png' },
     // ... restante dos devices
   ]
   ```

3. O layout do portal `src/app/cliente/[obra_id]/layout.tsx` tem as startup images do Portal equivalentes (fundo escuro) declaradas da mesma forma em `metadata.icons.other[]`.

### Modal de instalação iOS

4. Existe o componente `src/components/ios-install-prompt.tsx` com as seguintes características:
   - É um componente client (`'use client'`)
   - Renderiza `null` se: (a) não é iOS/iPadOS (`/iphone|ipad|ipod/i.test(navigator.userAgent)`), OU (b) já está em modo standalone (`window.matchMedia('(display-mode: standalone)').matches || navigator.standalone`), OU (c) `localStorage.getItem('ios-install-dismissed-until')` existe e é um timestamp futuro
   - Quando visível, exibe um sheet/modal bottom-aligned com:
     - Cabeçalho com ícone do app + título "Instalar na tela inicial"
     - 3 passos numerados com ícones:
       1. Toque no botão compartilhar (ícone de upload/share do Safari) `↑`
       2. Role a lista de ações para baixo
       3. Toque em "Adicionar à Tela de Início" `＋`
     - Botão "Entendi" (dismiss com TTL 30 dias: `Date.now() + 30*24*60*60*1000`)
     - Botão "Mais tarde" (dismiss com TTL 3 dias)
   - Trigger: exibir após 15 segundos na página OU após o usuário realizar scroll de >200px — não no load imediato

5. O componente `IosInstallPrompt` é importado e renderizado em:
   - `src/app/layout.tsx` (para CRM)
   - `src/app/cliente/[obra_id]/layout.tsx` (para Portal) — com prop `variant="portal"` que ajusta cores (fundo escuro, accent salmão)

6. O modal tem `role="dialog"`, `aria-labelledby` apontando para o título, e fecha com tecla Escape.

7. `npm run type-check` e `npm run lint` passam sem erros.

## Scope

### IN
- `packages/web/public/splash/` — diretório com imagens de splash (mínimo 6 por app = 12 total)
- `packages/web/src/components/ios-install-prompt.tsx` — componente novo
- `packages/web/src/app/layout.tsx` — adicionar startup images + `IosInstallPrompt`
- `packages/web/src/app/cliente/[obra_id]/layout.tsx` — adicionar startup images Portal + `IosInstallPrompt`

### OUT
- Splash em landscape (orientação landscape não é o foco de CRM/Portal)
- Splash para macOS Safari (não é PWA mobile)
- Animação de transição da splash para o app

## Dependencies

- Story 39-1 concluída (ícones CRM e Portal separados, usados nas splash images)
- Ferramenta para gerar splash images: `pwa-asset-generator` ou script custom com `sharp`
  - Alternativa: gerar manualmente com dimensões exatas usando `canvas` / Figma

## Dev Notes

### Geração automatizada de splash images
O pacote `pwa-asset-generator` pode gerar splash images automaticamente:
```bash
pnpm dlx pwa-asset-generator /path/to/source-icon.png packages/web/public/splash \
  --background "#fafaf9" \
  --splash-only \
  --landscape-only false
```
O output inclui o HTML de `<link>` com os media queries corretos — copiar para os layouts.

### Media queries por device (referência)
Os media queries para `apple-touch-startup-image` seguem o padrão:
```
(device-width: {CSS_WIDTH}px) and (device-height: {CSS_HEIGHT}px) and (-webkit-device-pixel-ratio: {DPR}) and (orientation: portrait)
```
Referência completa: https://appsco.pe/developer/splash-screens

### iOS timing do trigger
O trigger de 15 segundos evita o "assault by prompts" (push + install ao mesmo tempo). Se `push-prompt` já estiver visível, aguardar dismiss antes de mostrar este modal.

### Prop `variant` no componente
```tsx
interface IosInstallPromptProps {
  variant?: 'crm' | 'portal'
}
// CRM: bg-white text-gray-900 accent-orange-600
// Portal: bg-stone-900 text-stone-100 accent-[#e8856a]
```

## Dev Agent Record

### Agent Model Used
_a preencher_

### Debug Log References
_a preencher_

### Completion Notes
_a preencher_

### File List
_a preencher_

### Change Log
_a preencher_
