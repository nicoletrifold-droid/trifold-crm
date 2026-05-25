# Story 39-3: Screenshots no manifest para rich install dialog

## Status
Ready

## Complexity
S (Small) — capturas de tela + campo screenshots[] nos manifests

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run type-check", "npm run lint"]
```

## Story

**As a** usuário Android com Chrome,
**I want** ver uma prévia do app antes de instalar (rich install dialog com screenshots),
**so that** eu entenda o que estou instalando e a taxa de conversão de instalação aumente.

## Acceptance Criteria

1. Existem 4 arquivos de screenshot em `packages/web/public/screenshots/` para o **CRM**:
   - `crm-pipeline-wide.webp` — 1280×720px (desktop, form_factor: "wide") — tela do pipeline
   - `crm-leads-wide.webp` — 1280×720px (desktop) — tela de leads
   - `crm-pipeline-mobile.webp` — 390×844px (mobile, form_factor: "narrow") — pipeline em mobile
   - `crm-leads-mobile.webp` — 390×844px (mobile) — leads em mobile
   - Cada arquivo tem tamanho < 300KB (usar compressão WebP quality 80)

2. Existem 4 arquivos de screenshot em `packages/web/public/screenshots/` para o **Portal**:
   - `portal-obra-wide.webp` — 1280×720px — tela principal da obra (desktop/tablet)
   - `portal-fotos-wide.webp` — 1280×720px — galeria de fotos da obra
   - `portal-obra-mobile.webp` — 390×844px — tela principal mobile
   - `portal-fotos-mobile.webp` — 390×844px — galeria mobile

3. O `public/manifest.json` (CRM) tem campo `screenshots` populado:
   ```json
   "screenshots": [
     {
       "src": "/screenshots/crm-pipeline-wide.webp",
       "sizes": "1280x720",
       "type": "image/webp",
       "form_factor": "wide",
       "label": "Pipeline de vendas — acompanhe leads em cada etapa do funil"
     },
     {
       "src": "/screenshots/crm-leads-wide.webp",
       "sizes": "1280x720",
       "type": "image/webp",
       "form_factor": "wide",
       "label": "Gestão de leads — histórico completo e ações rápidas"
     },
     {
       "src": "/screenshots/crm-pipeline-mobile.webp",
       "sizes": "390x844",
       "type": "image/webp",
       "form_factor": "narrow",
       "label": "Pipeline em mobile"
     },
     {
       "src": "/screenshots/crm-leads-mobile.webp",
       "sizes": "390x844",
       "type": "image/webp",
       "form_factor": "narrow",
       "label": "Leads em mobile"
     }
   ]
   ```

4. O `public/cliente-manifest.json` (Portal) tem campo `screenshots` equivalente com as 4 screenshots do Portal.

5. Os arquivos WebP gerados são válidos (não corrompidos) e abrem corretamente em browser.

6. `npm run type-check` e `npm run lint` passam sem erros (os JSONs dos manifests não são verificados pelo TS, mas lint pode verificar JSON syntax).

## Scope

### IN
- `packages/web/public/screenshots/` — diretório com 8 screenshots (4 CRM + 4 Portal)
- `packages/web/public/manifest.json` — adicionar campo `screenshots`
- `packages/web/public/cliente-manifest.json` — adicionar campo `screenshots`

### OUT
- Screenshots de outras telas do sistema (backlog)
- Screenshots em outros idiomas
- Screenshots animadas / GIFs

## Dependencies

- Story 39-1 concluída (ícones corretos já aplicados; a identidade visual das screenshots deve ser consistente)
- Servidor de desenvolvimento rodando em `localhost:3000` para capturar screenshots
- Ferramenta de captura: Chrome DevTools (device toolbar) ou `playwright` para automação

## Dev Notes

### Captura automatizada com Playwright (recomendado)
```bash
# instalar playwright se necessário
pnpm dlx playwright install chromium

# script de captura (criar packages/web/scripts/capture-screenshots.ts)
# navegar para as rotas, definir viewport, tirar screenshot, converter para WebP
```

### Captura manual com Chrome DevTools
1. Abrir `localhost:3000/dashboard/pipeline` com usuário logado
2. DevTools → Toggle device toolbar → definir viewport 1280×720 (wide) ou 390×844 (narrow)
3. Ctrl+Shift+P → "Capture screenshot" → salvar como PNG → converter para WebP com `cwebp` ou `sharp`

### Conversão para WebP via sharp
```bash
# exemplo com sharp CLI
pnpm dlx sharp-cli --input screenshot.png --output crm-pipeline-wide.webp --format webp --quality 80
```

### Validação do rich install dialog
No Chrome Android (ou DevTools → Application > Manifest > Screenshots), verificar se o manifest exibe preview das screenshots. O rich dialog só aparece quando todas as condições PWA são atendidas (service worker ativo, HTTPS/localhost, manifest válido).

### Labels de screenshot
O campo `label` é lido por screen readers — deve ser descritivo e em português, descrevendo o que o usuário vê na imagem.

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
