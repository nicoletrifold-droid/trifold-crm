# Story 45.1 — PWA: prompt de instalação para Android igual ao do iOS

**Status:** Ready  
**Epic:** 45 — PWA & Mobile  
**Criada por:** @sm (River) / @po (Pax)  
**Data:** 2026-05-26  

---

## Contexto

O iOS já tem um bottom sheet educativo (IosInstallPrompt) que ensina como adicionar o app à tela inicial em 3 passos. No Android, existe apenas um pequeno cartão discreto (PwaInstallPrompt) que chama a API nativa `beforeinstallprompt`. A experiência é inconsistente — no Android o usuário não recebe instrução clara.

---

## Acceptance Criteria

- [ ] Criar `AndroidInstallPrompt` — bottom sheet idêntico ao iOS com passo a passo para Android Chrome
- [ ] Passos Android: (1) Toque no menu ⋮ do Chrome, (2) Toque em "Adicionar à tela inicial", (3) Confirme tocando em "Instalar"
- [ ] Se `beforeinstallprompt` disponível → botão "Instalar" aciona diretamente a API nativa (experiência melhor)
- [ ] Suporta `variant='crm' | 'portal'` com as mesmas cores do iOS (dark para portal, white para CRM)
- [ ] Lógica de dismiss idêntica ao iOS: Entendi = 30 dias, X / Mais tarde = 3 dias (localStorage)
- [ ] Só aparece em Android (não iOS, não desktop) e não em modo standalone (já instalado)
- [ ] Aparece após 15s ou scroll de 200px — igual iOS
- [ ] Adicionado nos mesmos layouts que o iOS: `app/layout.tsx` (crm) e `cliente/[obra_id]/layout.tsx` (portal)
- [ ] `PwaInstallPrompt` removido do `dashboard/layout.tsx` (substituído pelo novo)
- [ ] TypeScript: 0 erros, ESLint: 0 erros

---

## Tarefas

- [ ] T1: Criar `src/components/android-install-prompt.tsx`
- [ ] T2: Adicionar em `app/layout.tsx` com `variant="crm"` (excluindo rotas `/cliente/*`)
- [ ] T3: Adicionar em `cliente/[obra_id]/layout.tsx` com `variant="portal"`
- [ ] T4: Remover `PwaInstallPrompt` de `dashboard/layout.tsx`
- [ ] T5: QA gate

---

## Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-05-26 | @sm/@po | Story criada e validada — Status: Draft → Ready |
