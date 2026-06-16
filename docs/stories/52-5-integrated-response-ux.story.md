# Story 52-5 — UX da Resposta Integrada

## Metadata
- **Epic:** 52 — Agente de Tráfego com Acesso Read-Only ao Pipeline do CRM
- **Story:** 52-5
- **Status:** Ready (P3 — opcional/deferrable)
- **Priority:** P3 — polish; condicional (ver Recomendacao ao PO abaixo)
- **Complexity:** S (TypeScript/React puro — sem schema/migration; ~3-4h)
- **Created:** 2026-06-15
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @ux-design-expert (Uma) — coordenar com @dev (Dex) para a implementacao React
- **Quality Gate:** @dev (Dex)
- **Quality Gate Tools:** `[visual_regression_check, layout_test, dark_mode_check, responsive_check]`

---

## Recomendacao ao PO (River → Pax)

> **[AUTO-DECISION] Avaliar se a story se justifica como separada → Decisao: CONDICIONAL — recomendo mesclar com 52-2, mas deixo ao @po decidir.**
>
> Motivo: Apos analise do `agent-chat-panel.tsx`, o `renderMarkdown` ja suporta tabelas markdown (deteccao por `|` + `---`, render com `<table>`/`<th>`/`<td>`, `overflow-x-auto`). O system prompt ja instrui o modelo a usar tabelas para 3+ itens. Portanto, as respostas de CPL, funil e drill que a story 52-2 vai gerar serao **automaticamente renderizadas de forma legivel** sem nenhuma alteracao de frontend.
>
> O que esta story adiciona de incremental:
> 1. **Visualizacao de funil proporcional** — uma representacao visual (barras CSS) do fluxo de stages, complementando a tabela de distribuicao. Util para leitura rapida, mas nao obrigatoria para FR-9.
> 2. **Robustez do parser de tabela** — o parser atual faz `split("|")` simples; pode haver edge cases com valores `fmtBRL` que contenham `,` mas nao `|`. Em testes rapidos com os formatos gerados por `context-builder.ts`, o parser deve funcionar sem problemas para os formatos previstos pelas views 52-1.
> 3. **Hint no empty state** — atualizar o placeholder do painel para mencionar perguntas de pipeline/funil alem das de Meta Ads.
>
> **Opcao A (recomendada):** Absorver os itens 2 e 3 como subtarefas da story 52-2 (sao triviais). Manter item 1 como story 52-5 apenas se o produto quiser a visualizacao de funil proporcional. Isso reduz o overhead de uma story separada para algo que pode ser uma task de 1h dentro de 52-2.
>
> **Opcao B:** Manter 52-5 como story separada de polish, com escopo exato descrito aqui. Adequado se quiser um gate de qualidade dedicado ao componente visual de funil.
>
> **O @po deve decidir na validacao.**

---

## User Story

**Como** administrador do Trifold CRM usando o agente de trafego,
**Quero** que as respostas integradas de pipeline × midia (tabelas CPL→fechamento, distribuicao de funil por campanha e drill de lead individual) sejam exibidas de forma clara e legivel no painel do agente,
**Para que** eu consiga ler e interpretar os dados cruzados sem precisar sair do painel ou fazer parse manual de texto.

---

## Context

Esta story e a ultima do Epic 52. Ela depende de 52-2 (injecao de contexto integrado), que e responsavel por gerar as respostas. A preocupacao aqui e exclusivamente de **apresentacao**: garantir que o que o modelo produz chegue ao usuario de forma visualmente coerente com o padrao atual do painel.

**Estado atual do rendering (analise factual do repo):**

O `agent-chat-panel.tsx` ja implementa `renderMarkdown()` com suporte a:
- Tabelas markdown (`| col | col |` com linha `---`) — renderizadas como `<table>` com classes Tailwind (`overflow-x-auto`, `text-xs`, `border-collapse`, `dark:*`)
- Bullet lists (`-` ou `*`)
- Headings (`#`, `##`)
- Inline: **bold**, *italic*, `code`
- Paragrafos com `<br>` entre linhas

O `AGENT_SYSTEM_PROMPT` ja instrui: "Para comparacoes, use tabelas quando houver 3+ itens".

**Consequencia:** As respostas de CPL→fechamento, distribuicao por stage e drill de lead que 52-2 vai gerar (em markdown, usando `fmtBRL`/`fmtPct`) **ja serao renderizadas de forma legivel** no painel sem nenhuma alteracao adicional de frontend.

**O que esta story adiciona sobre o baseline:**
1. **Componente `FunnelBar`** — visualizacao proporcional inline do funil por campanha (barras CSS simples, sem biblioteca pesada), complementando a tabela de distribuicao de stages quando o modelo responde FR-3.
2. **Robustez do parser de tabela** — validar e, se necessario, corrigir edge cases no `renderMarkdown` para valores formatados como `R$ 1.234,56` dentro de celulas (confirmar que `split("|")` nao quebra).
3. **Empty state atualizado** — placeholder do painel menciona perguntas de pipeline/funil alem de Meta Ads (uma linha de texto, sem alteracao estrutural).

**Escopo reduzido e preciso.** Se o @po optar por mesclar com 52-2, os tres itens viram subtarefas de 52-2 sem necessidade desta story.

---

## Scope

### IN (esta story entrega)
- Componente `FunnelBar` inline (sem importacao de biblioteca de chart) para visualizar a distribuicao de stages recebida do modelo em respostas a FR-3 — exibido quando a resposta contem bloco de funil identificado por convencao de formatacao definida em 52-2
- Validacao e eventual correcao do parser de tabela markdown em `renderMarkdown()` para nao quebrar com valores `fmtBRL` (`R$ 1.234,56`) ou percentuais dentro de celulas
- Atualizacao do texto do empty state em `agent-chat-panel.tsx` para incluir exemplos de perguntas de pipeline

### OUT (nao entra nesta story)
- Geracao das respostas integradas — escopo de 52-2
- Views SQL / camada de dados — escopo de 52-1
- Guards de acesso admin — escopo de 52-3
- Auditoria PII — escopo de 52-4
- Adicao de biblioteca de charts pesada (Chart.js, Recharts, Victory, etc.) — proibida sem justificativa de necessidade real
- Redesign do painel ou mudanca de layout geral
- Suporte a roles alem de admin (feature ja restrita por 52-3)
- Internacionalizacao ou novos idiomas

---

## Acceptance Criteria

- [ ] **AC1 — Tabelas CPL→fechamento renderizadas sem quebra:** Dado que o modelo responde com uma tabela markdown de CPL por campanha (ex.: colunas `Campanha | Total Leads | Leads Fecharam | CPL Real`), a tabela e exibida com cabecalho destacado, linhas alternadas legiveis e valores `R$ X.XXX,XX` sem truncamento ou quebra de layout no painel (`sm:w-[420px]` responsivo).

- [ ] **AC2 — Tabela de distribuicao de funil renderizada:** Dado que o modelo responde com tabela de distribuicao de stages por campanha (ex.: colunas `Stage | Leads | % do Total`), a tabela e exibida de forma legivel, com percentuais formatados e sem overflow horizontal que quebre o painel.

- [ ] **AC3 — FunnelBar exibida para respostas de funil:** Dado que a resposta do modelo inclui um bloco de funil proporcional (identificado por convencao de marcacao definida entre 52-2 e 52-5 — ex.: bloco com prefixo `FUNNEL:` ou outro marcador acordado), o componente `FunnelBar` renderiza barras proporcionais inline (CSS puro, sem SVG ou canvas), uma por stage, com label e percentual visivel, no dark mode e light mode.

- [ ] **AC4 — Drill de lead exibido claramente:** Dado que o modelo responde com dados de drill de lead individual (nome, score, stage, UTM, ai_summary), a resposta e exibida como bullet list ou tabela de duas colunas legivel, sem quebra de layout.

- [ ] **AC5 — Parser de tabela robusto a valores BRL/PCT:** Dado que uma celula de tabela contem `R$ 1.234,56` ou `12,5%`, o `renderMarkdown` renderiza a celula corretamente (o valor nao e confundido como separador de coluna extra). Confirmar via teste unitario ou teste manual com fixture.

- [ ] **AC6 — Empty state atualizado:** O placeholder exibido quando o painel esta vazio menciona exemplos de perguntas de pipeline (ex.: "Qual campanha traz mais leads que fecham?", "Onde os leads travam no funil?") alem dos exemplos de Meta Ads existentes.

- [ ] **AC7 — Consistencia visual com o padrao atual:** Todos os elementos novos (FunnelBar, ajustes de tabela) usam as mesmas classes Tailwind e tokens de cor do painel existente (`orange-*`, `gray-*`, `stone-*`, `dark:*`). Nenhuma classe CSS customizada nova fora do padrao Tailwind do projeto.

- [ ] **AC8 — Sem regressao no rendering existente:** Respostas de Meta Ads puras (sem contexto de pipeline) continuam sendo renderizadas identicamente ao comportamento pre-52-5. `action_card` e `MessageActionCard` nao sao afetados.

- [ ] **AC9 — Responsivo no painel:** Todos os elementos renderizados corretamente na largura `sm:w-[420px]` do painel (viewport mobile e desktop). Tabelas com `overflow-x-auto` funcionam; FunnelBar nao vaza lateralmente.

---

## Tasks / Subtasks

- [ ] **T1** — Analise pre-implementacao: confirmar estado atual do rendering (AC5, AC8)
  - [ ] T1.1 — Ler `packages/web/src/components/agent/agent-chat-panel.tsx` (funcoes `renderMarkdown` e `applyInline`) e mapear o comportamento atual do parser de tabela com valores contendo virgula
  - [ ] T1.2 — Criar fixture de teste: string markdown com tabela contendo `R$ 1.234,56` e `12,5%` em celulas; verificar output do `renderMarkdown` via teste unitario ou console
  - [ ] T1.3 — Acordar com a story 52-2 a convencao de marcacao do bloco de funil (marcador de inicio/fim do bloco `FunnelBar`) — documentar a convencao no Change Log desta story antes de implementar T3

- [ ] **T2** — Corrigir/robustecer o parser de tabela em `renderMarkdown` (AC5)
  - [ ] T2.1 — Se T1.2 identificar quebra: ajustar o split de celulas para ignorar `|` dentro de valores monetarios/percentuais, OU garantir que o model (via instrucao em 52-2) sempre use ponto decimal, sem ponto de milhar, em celulas de tabela. Documentar a abordagem escolhida.
  - [ ] T2.2 — Se T1.2 nao identificar quebra: documentar como PASS no Change Log e pular T2.1

- [ ] **T3** — Implementar componente `FunnelBar` (AC3, AC7, AC9)
  - [ ] T3.1 — Criar funcao `renderFunnelBar(lines: string[]): React.ReactNode` dentro de `agent-chat-panel.tsx` (ou arquivo separado `funnel-bar.tsx` em `components/agent/`) — decidir localizacao conforme tamanho do componente
  - [ ] T3.2 — Implementar deteccao do bloco de funil em `renderMarkdown`: quando um bloco comeca com o marcador acordado em T1.3, chamar `renderFunnelBar` em vez do render de paragrafos
  - [ ] T3.3 — Implementar `FunnelBar` como divs proporcionais (largura em `%` via style inline), com label de stage e percentual. Usar cores do design system (`bg-orange-*` para ativo, `bg-gray-*` para outros stages, `dark:bg-stone-*` equivalente)
  - [ ] T3.4 — Testar dark mode e light mode manualmente no painel local
  - [ ] T3.5 — Testar com `overflow-x-auto` e painel em largura `420px`

- [ ] **T4** — Atualizar empty state (AC6)
  - [ ] T4.1 — Localizar o bloco de empty state em `agent-chat-panel.tsx` (linhas aprox. 574-584 na versao atual): texto "Pergunte sobre performance, CPL, criativos ou solicite recomendacoes."
  - [ ] T4.2 — Atualizar para incluir exemplos de pipeline: "Qual campanha traz mais leads que fecham?", "Onde os leads travam no funil?". Manter o tom existente (conciso, em portugues)

- [ ] **T5** — Validacao de regressao (AC8)
  - [ ] T5.1 — Testar manualmente uma resposta de Meta Ads pura (sem pipeline) no painel local — confirmar que action_card, tabelas de campanha e bullet lists continuam identicos
  - [ ] T5.2 — Verificar que `MessageActionCard` nao e afetado

- [ ] **T6** — Revisao de consistencia visual (AC7)
  - [ ] T6.1 — Revisar todas as classes Tailwind adicionadas; confirmar que nao ha classes customizadas fora do padrao do projeto
  - [ ] T6.2 — Revisar dark mode: todas as classes `dark:*` aplicadas consistentemente com o padrao `dark:bg-stone-*`, `dark:text-stone-*`, `dark:border-stone-*` do painel existente

---

## Dev Notes

### Arquivo principal a modificar
- `packages/web/src/components/agent/agent-chat-panel.tsx` — funcao `renderMarkdown` (tabela + FunnelBar) e bloco de empty state

### Arquivo a criar (opcional, conforme T3.1)
- `packages/web/src/components/agent/funnel-bar.tsx` — somente se o componente `FunnelBar` crescer alem de ~40 linhas; caso contrario, embutir em `agent-chat-panel.tsx`

### Parser de tabela atual — comportamento documentado
O `renderMarkdown` detecta tabelas assim (linhas 43-60 do arquivo):
```
// Table detection: lines with | separators
if (lines.length >= 2 && lines[0]?.includes("|") && lines[1]?.includes("---")) {
  const headers = lines[0]!.split("|").map((h) => h.trim()).filter(Boolean)
  const rows = lines.slice(2).map((l) => l.split("|").map((c) => c.trim()).filter(Boolean))
  ...
}
```
O split e feito por `|` simples. Valores como `R$ 1.234,56` nao contem `|`, logo nao quebram o split. Valores como `R$1.234|56` (com pipe no lugar de virgula — improvavel) quebrariam. O risco real e baixo, mas T1.2 valida isso antes de qualquer alteracao.

### Convencao de bloco FunnelBar (a acordar com 52-2)
A convencao exata de marcacao deve ser definida em T1.3 junto com a story 52-2. Sugestao de ponto de partida (nao definitiva):
- O model emite um bloco de codigo com linguagem `funnel` (ex.: ` ```funnel\nnovo:45%\nqualificado:30%\n...``` `) — o `renderMarkdown` detecta e renderiza como `FunnelBar`
- Alternativa: bloco precedido por linha `<!-- FUNNEL -->` (HTML comment — ignorado pelo markdown padrao, detectavel no parser)
- A convencao escolhida deve ser instruida no `AGENT_SYSTEM_PROMPT` atualizado em 52-2

**Importante:** Nao implementar T3 sem essa convencao estar definida e documentada. Se 52-2 nao for implementada ainda, deixar T3 como placeholder e coordenar com o @dev de 52-2.

### Instancias do painel
O `AgentChatPanel` e reutilizado em:
- `packages/web/src/app/dashboard/campaigns/meta/campaigns-meta-client.tsx`
- `packages/web/src/app/dashboard/campaigns/meta/[campaign_id]/campaign-detail-client.tsx`

Alteracoes em `agent-chat-panel.tsx` afetam as duas instancias automaticamente — confirmar que ambas continuam funcionando apos T4 (empty state).

### Helpers de formatacao existentes (nao reimplementar)
`fmtBRL` e `fmtPct` estao em `packages/web/src/lib/agent/context-builder.ts`. Sao usados no servidor (context-builder). No frontend, os valores ja chegam formatados como strings no conteudo da mensagem — nao e necessario reimplementar no componente.

### NFR-MAINT-1 — Padrao visual
Espelhar exatamente o padrao de classes do painel:
- Cores primarias: `orange-600` (ativo), `gray-100`/`stone-800` (fundo de mensagem do assistente)
- Bordas: `border-gray-200`/`dark:border-stone-700`
- Texto: `text-xs` para conteudo de tabela (ja definido no `renderMarkdown` atual)
- Dark mode: usar `dark:` prefix consistentemente

### Sem biblioteca de chart pesada
NFR-MAINT-1 proibe adicionar dependencia nova (Chart.js, Recharts, etc.) sem justificativa. O `FunnelBar` deve ser implementado com divs CSS proporcionais — simples e zero-dependencia.

---

## Testing

### Abordagem
- Validacao manual no painel local (Next.js dev server)
- Teste de fixture para o parser de tabela (unitario ou manual com `console.log`)
- Checklist visual: dark mode, light mode, mobile (420px), desktop

### Cenarios de teste

1. **Parser de tabela — valores BRL:** Montar string markdown com tabela contendo celula `R$ 1.234,56` — confirmar que `renderMarkdown` produz 1 celula (nao 2)

2. **Tabela CPL→fechamento:** Colar response simulada com tabela de 3 campanhas, colunas CPL/fechamento — confirmar render correto no painel (largura, dark mode, overflow)

3. **FunnelBar — render proporcional:** Forcar bloco de funil com stages de percentuais conhecidos (ex.: novo:40%, qualificado:25%, visitou:15%, fechado:5%) — confirmar que as barras sao proporcionais e labels visiveis

4. **FunnelBar — dark mode:** Abrir painel em dark mode (`prefers-color-scheme: dark` ou classe `dark` no root) — confirmar que barras e labels sao visiveis

5. **Empty state atualizado:** Abrir painel sem mensagens — confirmar que o novo texto de placeholder contem exemplos de pipeline

6. **Regressao — Meta Ads puro:** Enviar pergunta de Meta Ads pura (sem pipeline no contexto) — confirmar que action_card, tabelas de campanha e bullet lists funcionam identicamente ao pre-52-5

7. **Responsividade:** Redimensionar o painel para 420px — confirmar que tabelas usam `overflow-x-auto` e FunnelBar nao vaza

---

## Riscos

| ID | Risco | Severidade | Mitigacao |
|----|-------|-----------|-----------|
| R1 | Over-engineering: FunnelBar adiciona complexidade sem valor real sobre a tabela markdown ja renderizada | Media | Avaliar com usuario antes de implementar; se tabela markdown ja atende, FunnelBar e opcional (AC3 e P3) |
| R2 | Drift visual: novas classes CSS quebram consistencia do padrao atual | Baixa | AC7 e T6 exigem revisao de classes; espelhar 100% o padrao existente |
| R3 | Convencao de marcacao de funil nao alinhada com 52-2 | Media | T1.3 obrigatorio antes de T3; bloquear implementacao de FunnelBar ate convencao acordada |
| R4 | Regressao no rendering de Meta Ads puro | Baixa | AC8 + cenario de teste 6; alteracoes cirurgicas apenas em `renderMarkdown` |
| R5 | 52-2 nao esta concluida quando 52-5 e implementada | Media | 52-5 depende de 52-2; nao iniciar antes de 52-2 Done. FunnelBar pode ser implementado com fixture de dados mockados para validar visualmente, mas o marcador de bloco deve ser acordado com 52-2 antes |

---

## Dependencies

- **Depende de:** Story 52-2 (Injecao de Contexto Integrado no Agente) — a convencao de marcacao do bloco FunnelBar e o formato das respostas integradas devem ser definidos em 52-2 antes de implementar T3 desta story
- **Bloqueia:** nada — ultima story do Epic 52
- **Dependencias tecnicas:**
  - `packages/web/src/components/agent/agent-chat-panel.tsx` (arquivo principal a modificar)
  - `packages/web/src/lib/agent/system-prompt.ts` (lido por referencia — a instrucao de formatacao de bloco FunnelBar deve ser adicionada la em 52-2, nao aqui)

---

## Definition of Done

- [ ] Parser de tabela validado (AC5): sem quebra com valores `fmtBRL`/`fmtPct` em celulas
- [ ] Tabelas CPL→fechamento e distribuicao de funil renderizadas corretamente no painel (AC1, AC2)
- [ ] Componente `FunnelBar` implementado e exibido para blocos de funil (AC3) — ou documentado como dispensado se @po optar por Opcao A (merge com 52-2)
- [ ] Drill de lead exibido claramente via markdown existente (AC4)
- [ ] Empty state atualizado com exemplos de pipeline (AC6)
- [ ] Consistencia visual confirmada: classes Tailwind, dark mode, responsivo (AC7, AC9)
- [ ] Sem regressao no rendering de Meta Ads puro e action_card (AC8)
- [ ] @qa executou quality gate com verdict PASS ou CONCERNS documentados e aceitos
- [ ] @devops fez push do commit final

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Validacao de qualidade usara processo de revisao manual pelo @qa.

---

## Change Log

| Data | Versao | Descricao | Autor |
|------|--------|-----------|-------|
| 2026-06-15 | 0.1 | Story drafted a partir do Epic 52 (FR-9). Analise do agent-chat-panel.tsx concluida: rendering markdown de tabelas ja funciona; story reduzida a scope minimo (FunnelBar + parser robustez + empty state). Recomendacao de merge com 52-2 documentada para decisao do @po. | @sm (River) |
| 2026-06-15 | 0.2 | Validacao PO (checklist GO). Status → Ready, classificada P3/opcional/deferrable. DECISAO PO: itens (2) robustez do parser e (3) empty state PODEM ser absorvidos como subtarefas da 52-2; a story 52-5 permanece separada APENAS para o componente FunnelBar (unico entregavel com substancia). FR-9 ja ~80% coberto pelo renderMarkdown atual. 52-5 nao bloqueia o fechamento do epico — pode ser feita por ultimo ou dispensada se o FunnelBar nao for desejado. | @po (Pax) |

---

## Dev Agent Record

### Agent Model Used
_(a ser preenchido pelo @ux-design-expert / @dev durante implementacao)_

### Debug Log References
_(a ser preenchido durante implementacao)_

### Completion Notes List
_(a ser preenchido durante implementacao)_

### File List

#### Modified
- `packages/web/src/components/agent/agent-chat-panel.tsx`

#### Created (condicional)
- `packages/web/src/components/agent/funnel-bar.tsx` — somente se FunnelBar crescer alem de ~40 linhas

---

## QA Results
_(a ser preenchido pelo @qa)_
