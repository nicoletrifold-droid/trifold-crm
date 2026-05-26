# Epic 39 — PWA Excellence

## Status: Draft

## Objetivo

Elevar o PWA do Trifold CRM de funcional para classe mundial: experiência de instalação fluida em iOS e Android, offline confiável nos dois contextos (CRM + Portal), push notifications com UX persuasiva, e infraestrutura de SW à prova de regressão.

## Contexto de Negócio

A análise UX conduzida pela agente Uma (2026-05-25) identificou gaps críticos na implementação PWA existente (Epic 22 + melhorias de maio/2026):
- Corretores com iPhone (maioria no BR) não conseguem instalar o CRM — sem orientação iOS
- Ícones idênticos entre CRM e Portal geram confusão no launcher quando ambos instalados
- Ausência de splash screen iOS → flash branco/preto ao abrir = percepção de "app travado"
- Cache sem versionamento por build hash → risco de usuários presos em versão velha
- CRM sem offline page → corretor em campo com sinal fraco vê erro genérico
- Push notifications pedidas no load → taxa de aceitação < 30% (best practice: 70%+ com pre-prompt)

## Escopo das Stories

| Story | Título | Tema | P | Agente | Est. | Dep. |
|-------|--------|------|---|--------|------|------|
| 39-1 | Ícones distintos por app + maskable 192px | Assets | P0 | @dev | 2h | — |
| 39-2 | iOS PWA: startup images + install modal | iOS | P0 | @dev | 6h | 39-1 |
| 39-3 | Screenshots no manifest (rich install dialog) | Install | P0 | @dev | 3h | 39-1 |
| 39-4 | CRM offline page + SW fallback para /dashboard | Offline | P0 | @dev | 4h | — |
| 39-5 | Cache versioning por build hash | Infra SW | P0 | @dev | 3h | — |
| 39-6 | Pre-prompt pattern para push notifications | Push UX | P1 | @dev | 5h | — |
| 39-7 | Update notification toast + SW message handler | Update UX | P1 | @dev | 3h | 39-5 |
| 39-8 | Status offline persistente + storage quota | Reliability | P1 | @dev | 4h | 39-4 |

**Total estimado:** ~30h  
**Sequência obrigatória:** 39-1 → 39-2 + 39-3 (paralelo) → 39-5 → 39-7  
**Independentes entre si:** 39-4, 39-6, 39-8

## Critérios de Sucesso do Epic

- Lighthouse PWA score >= 90 nos dois contextos
- Instalar CRM e Portal no mesmo iPhone resulta em dois ícones visualmente distintos no launcher
- Abrir PWA instalada no iPhone não mostra flash branco/preto (splash image presente)
- Corretor abre `/dashboard/pipeline` sem sinal → vê página offline branded, não erro do browser
- Taxa de aceitação de push no Portal >= 50% (medida via analytics)
- Novo deploy invalida cache automaticamente sem hard reload manual

## Referências

- Análise UX: conversa de 2026-05-25 (agente Uma / aios-ux)
- Implementação base PWA: commit `079ca46` (feat(pwa): melhorias completas de PWA)
- Arquivos base: `public/sw.js`, `public/manifest.json`, `public/cliente-manifest.json`
- Componentes: `src/components/pwa-init.tsx`, `src/components/pwa-install-prompt.tsx`, `src/components/portal/push-prompt.tsx`
