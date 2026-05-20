---
name: Animações em packages/web — sem tailwindcss-animate
description: packages/web usa Tailwind 4 sem o plugin tailwindcss-animate; animações de modal/dialog vivem como keyframes em globals.css
type: project
---

`packages/web` usa Tailwind CSS v4 puro (apenas `@tailwindcss/postcss`), SEM o plugin `tailwindcss-animate`. As classes `animate-in fade-in zoom-in-95 slide-in-from-bottom-4` etc. NÃO funcionam.

**Why:** O `postcss.config.mjs` só carrega `@tailwindcss/postcss`. O `globals.css` define keyframes próprios (`fadeIn`, `slideInFromRight`) e agora também `modalBackdropIn`/`modalDialogIn` (utility classes `.modal-backdrop-in` e `.modal-dialog-in`).

**How to apply:** Ao precisar de animação de entrada para modal/dropdown/toast, defina keyframe em `src/app/globals.css` e exponha como utility class. NÃO importe nem use sintaxe `animate-in *` — falha silenciosa (classes não geradas).
