# Story 75-63 — UX da tela /sistema: agrupar e dar hierarquia às métricas

## Metadata
- **Status:** Ready · **Epic:** 75 · **Branch:** main · **Complexidade:** S (2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]

## Story
**As a** admin, **I want** que a área de métricas do `/dashboard/sistema` tenha grupos visualmente claros e
separados, **so that** eu leia a informação sem que tudo "cole" numa parede de cards cinza iguais.

## Contexto
Hoje há 4 grades de cards quase idênticas empilhadas: **Saúde** (sem título), **Métricas 24h** (sem título),
**Volume de WhatsApp** e **Disparos & custo**. Sem hierarquia/separação, parece tudo interligado (feedback do
usuário 2026-06-25). Tarefa de **@ux (Uma)** — só apresentação, sem mudar dado nem lógica.

## Escopo
**IN (somente `packages/web/src/app/dashboard/sistema/page.tsx`):**
1. Componente `SectionHeader` reutilizável: ícone (laranja) + rótulo MAIÚSCULO espaçado + meta opcional à direita.
2. **Saúde do sistema** (health cards) ganha header (ícone Activity).
3. **Métricas · 24h** (Mensagens/Tempo Claude/Fallback/Erros) ganha header (ícone Gauge).
4. **WhatsApp**: agrupar Volume + Disparos&custo sob UM header "WhatsApp" (ícone MessageCircle, meta "30 dias" à
   direita), com dois sub-rótulos ("Volume" e "Disparos & custo" + link Fatura na Meta) — quebra a monotonia e
   junta o que é do mesmo assunto.
5. Espaçamento/separação consistentes entre os grupos (respiro/divisória). Tema light/dark mantido.

**OUT:** mudar números, queries, a tabela de eventos, ou os cards de atalho (Email/Auditoria, que já têm header).

## Acceptance Criteria
1. Cada grupo (Saúde, Métricas, WhatsApp) tem header consistente (ícone + rótulo) e separação visual clara.
2. Volume e Disparos&custo ficam sob o mesmo bloco "WhatsApp" com sub-rótulos; o link "Fatura na Meta" e a nota
   de estimativa permanecem.
3. Nenhum dado/valor muda; guards null preservados (seções WhatsApp só aparecem se houver dados).
4. Tema light/dark consistente ([[feedback-theme-convention]]); responsivo (2 col mobile / 4 col desktop).
5. typecheck/lint/vitest limpos.

## Dev Notes
- Arquivo único: `packages/web/src/app/dashboard/sistema/page.tsx`. Health grid ~187, Metrics ~203, WhatsApp ~226+.
- Ícones lucide (adicionar): Activity, Gauge, MessageCircle. Padrão de header já existe nos painéis Email/Auditoria.
- Não introduzir aninhamento pesado de bordas; preferir header + grid + espaçamento.

## File List (provável)
- `packages/web/src/app/dashboard/sistema/page.tsx`

## QA Results
- **Verdict:** PASS · readiness 9/10. Mudança **só de apresentação** (layout/classes em 1 arquivo) — nenhum dado, query ou guard null alterado; `SectionHeader` reutilizável; WhatsApp agrupado (volume+custo) sob um painel com sub-rótulos. 265/265 testes; typecheck exit 0. Verificação visual final = no deploy.

## Change Log
- 2026-06-25 — @sm/@ux — Story criada. Polimento visual do /sistema: headers de seção consistentes + agrupar
  WhatsApp (volume+custo) num bloco. Só apresentação. @po: GO (mudança visual, baixo risco, single-file).
