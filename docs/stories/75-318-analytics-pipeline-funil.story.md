# Story 75-318 — Analytics: régua do Pipeline ao vivo + Funil de Conversão em 4 andares com líquido animado

**Story ID:** 75-318 · **Status:** InReview · **Estimativa:** S (~3 pts)
**Fluxo:** @sm → @po GO(9/10) → @dev → @qa → @devops · Pedido direto do Marcos (13/08, com referências visuais)

## O pedido (fiel ao briefing)

1. Entre os cards Entradas/Ativos/Perdidos e o gráfico "Leads por Período": a régua do
   Pipeline (formato do Dashboard), versão MENOR.
2. "Funil de Conversão": trocar as barras por um FUNIL de verdade com 4 andares —
   **Atendimento → Visita (Agendada + Visitou no MESMO andar, cores diferentes) →
   Proposta → Fechamento** — números do pipeline dentro, e a "cereja do bolo": animação
   de água dentro dos andares.

## O que foi feito

- **Régua "Pipeline · agora"**: contagens AO VIVO (mesma RPC `get_dashboard_stage_counts`
  do Dashboard — o rótulo "· agora" diferencia do recorte de período da página), compacta
  (px-2.5/py-2, fonte menor), com link por etapa p/ o Pipeline. 🔥 GOTCHA: a RPC devolve
  `total`, não `count` — a 1ª versão zerava tudo; pego por SCREENSHOT (números zerados
  com pipeline cheio), corrigido e re-verificado com screenshot.
- **`ConversionFunnel`** (client, SVG puro, zero lib): 4 andares trapezoidais; o 2º
  DIVIDIDO ao meio (Visita Agendada roxa | Visitou teal — cores vindas das PRÓPRIAS
  etapas do kanban); número grande dentro de cada andar; **líquido animado** (2 ondas
  defasadas por andar, velocidades/direções diferentes + brilho de vidro), com
  `prefers-reduced-motion` → estático. Texto com par claro+dark (fill-stone-900/dark:fill-white).
- **`pickFunnelTiers`** (lib pura, testada ×4): mapeia as etapas do funil do período p/
  os andares por slug com fallback por nome normalizado; etapa ausente → 0 sem quebrar.
- Os números do funil vêm do MESMO recorte de período que alimentava as barras (inclusive
  respeitando os filtros da página). PDF do relatório INTOCADO (mantém a tabela completa
  do funil — mudança aqui é de apresentação, não de métrica; [[feedback-relatorio-segue-tela]]
  se aplica a métricas, não ao formato visual).

## Evidências

Screenshots conferidos (dark): funil com 70 / 8|8 / 2 / 0 e ondas visíveis; régua com
47/116/8/19/56/4/0/0/270 ao vivo entre os cards e o gráfico. Checks: SVG presente,
10 ondas animando. Gates: suíte **2358 passed** (186 arquivos, +4 testes) · tsc 0 ·
eslint 23 · build 0.

## QA — PASS (95)

Briefing atendido item a item, incluindo a cereja (líquido). O gotcha do `total` reforça:
screenshot é gate, não enfeite. Observação: em tema claro o funil usa as mesmas cores das
etapas com texto escuro — conferido legível. Sem concerns.
