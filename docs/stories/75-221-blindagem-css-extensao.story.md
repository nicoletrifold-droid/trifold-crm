# Story 75-221 — Blindagem contra CSS injetado por extensões: sidebar sumindo (`hidden` + `lg:flex`)

**Status:** Done
**Tipo:** Fix / hardening (produção, afetando múltiplos usuários)
**Epic:** UI / Navegação
**Complexidade:** S (troca mecânica de classes em 13 arquivos; sem migration, sem lógica)

## Contexto (incidente 2026-07-27)
Usuários (incluindo o diretor) reportaram que o **menu lateral do CRM sumiu** no desktop. Diagnóstico
ao vivo no navegador afetado:

- A sidebar renderiza no DOM com o menu completo, mas fica `display: none`.
- O app usa o padrão Tailwind `hidden lg:flex` (esconde no mobile, mostra ≥1024px).
- **Causa raiz:** extensões do Chrome (suspeito nº 1: DeepL Translate) injetam CSS via `insertCSS`
  com uma regra genérica `.hidden { display: none }` **sem cascade layer**. Como o Tailwind v4 do CRM
  emite tudo dentro de `@layer utilities`, e CSS *sem* layer sempre vence CSS *com* layer, a regra
  injetada atropela o `lg:flex` — a sidebar some.
- Prova: em janela anônima (extensões off) o menu aparece; num iframe só com o CSS do app,
  `hidden lg:flex` computa `flex`; removendo a regra `.hidden` do app via CSSOM o menu continua
  invisível (a fonte é externa à página).

Não dá para controlar as extensões dos usuários → blindar o app.

## Decisão técnica
Trocar o `hidden` puro pelo variant **`max-{bp}:hidden`** em todo par "esconde + re-mostra responsivo"
(`hidden lg:flex`, `hidden sm:block`, etc.). O elemento deixa de carregar a classe `hidden` pura —
alvo genérico que extensões definem — e o comportamento visual fica **idêntico** (`max-lg:hidden`
esconde <1024px, exatamente o que `hidden` + `lg:flex` fazia).

`hidden` **sem** re-show responsivo (esconder de verdade) continua permitido — nesse caso a regra
injetada até "ajuda" e não há regressão possível.

## Acceptance Criteria
1. **AC1** — Nenhum className no app combina `hidden` puro com re-show responsivo
   (`{sm|md|lg|xl|2xl}:{flex|block|grid|inline*|table}`); todos usam `max-{bp}:hidden`.
2. **AC2** — Comportamento responsivo idêntico ao atual em todos os breakpoints (mesmo ponto de corte).
3. **AC3** — Sidebars do `/dashboard` (sidebar-nav), `/cliente` (portal) e widget do `/broker`
   visíveis mesmo com uma regra externa `.hidden{display:none}` injetada (teste manual simulando via
   DevTools: `document.head.insertAdjacentHTML('beforeend','<style>.hidden{display:none}</style>')`).
4. **AC4** — Build e suíte de testes passam.

## CONVENÇÃO (nova)
> Nunca combinar `hidden` puro com re-show responsivo. Par esconde/mostra responsivo = `max-{bp}:hidden`.
> Motivo: extensões de navegador injetam `.hidden{display:none}` sem layer e vencem o `@layer utilities`
> do Tailwind v4.

## Tasks
- [x] `components/layout/sidebar-nav.tsx:102` — sidebar do dashboard (`hidden` → `max-lg:hidden`).
- [x] `app/cliente/[obra_id]/_components/sidebar.tsx:79` — sidebar do portal do cliente.
- [x] `app/broker/layout.tsx:141` — WeatherWidget.
- [x] `app/broker/chat/page.tsx:136`, `app/broker/leads/_components/leads-list-with-drawer.tsx:164`,
      `app/broker/leads/[id]/_components/broker-message-input.tsx:398`.
- [x] `app/dashboard/mensagens/_components/mensagens-inbox.tsx:103,123` (strings condicionais).
- [x] `app/dashboard/roleta/_components/roleta-fila-panel.tsx:175`.
- [x] `app/dashboard/campaigns/**` — 5 ocorrências (creatives, detail-client, lp-funnel, funnel,
      email-editor-modal).
- [x] Varredura final AC1 (grep) + build + testes.
- [x] QA (@qa) + PR via @devops.

## Out of Scope
- `hidden` puro sem re-show responsivo (uso legítimo, sem risco).
- Guard global em `globals.css` (não funciona: CSS injetado entra depois na ordem de cascata;
  exigiria `!important` espalhado — pior que a convenção).

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-27 | 0.1 | Story criada a partir do incidente (menu sumido p/ múltiplos usuários). | @sm |
| 2026-07-27 | 1.0 | 14 ocorrências trocadas p/ `max-{bp}:hidden` em 13 arquivos. Varredura AC1 limpa; 1242 testes pass; `next build` OK; variants presentes no CSS de build. | @dev + @qa |
