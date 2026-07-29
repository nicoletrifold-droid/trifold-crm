# Story 75-230 — Kit de Marcas v2: estrutura do Brand Hub (cores/fontes/variações)

**Status:** Done
**Tipo:** Melhoria (UX)
**Epic:** Agente de Marketing
**Complexidade:** S

## Contexto
Feedback do Marcos (29/07, com screenshots do Brand Hub do Canva) sobre a 75-229:
"foi feito mas acho que dá pra melhorar". Gaps vs Canva: cores eram texto hex
separado por vírgula (Canva tem papel Primária/Secundária e seleção visual);
fontes eram texto livre (Canva tem papéis Título/Subtítulo/Corpo); variações de
logo sem nome (Canva nomeia azul esc/branco/gelo…); arquivos sem agrupamento.

## Acceptance Criteria
1. **AC1 — Cores estruturadas:** editor visual por linha — color picker + hex +
   papel (datalist Primária/Secundária/Fundo/Texto/Destaque) + remover; salvas
   como `[{hex, nome}]`. Compat: API ainda aceita strings v1 (converte).
2. **AC2 — Fontes por papel:** linhas papel (datalist Título/Subtítulo/Cabeçalho/
   Corpo/Legenda) + nome da fonte; mig 198 muda `fontes` text→jsonb `[{papel,nome}]`
   (sem dados na virada — verificado em prod e dev).
3. **AC3 — Variação nomeada:** campo "Variação (ex.: azul escuro)" no upload →
   `label` do asset; exibida no card do arquivo (title com nome do arquivo).
4. **AC4 — Agrupamento:** arquivos do modal agrupados por categoria (Logotipos /
   Fotos / Elementos gráficos) com contagem, como o Brand Hub.
5. **AC5 — Sem regressão:** cards da seção continuam mostrando bolinhas de cor
   (agora com tooltip do papel); validador puro atualizado com testes.

## Fora do escopo
- Upload de arquivo de fonte (.ttf) — papel+nome é o que a direção de arte usa.
- Categorias extras (Ícones separado de Logotipos, Componentes) — label cobre.

## Dev Agent Record
### File List
- `supabase/migrations/198_marketing_brands_v2.sql` (novo)
- `packages/web/src/lib/marketing/brands.ts` + `brands.test.ts`
- `packages/web/src/app/dashboard/campaigns/agente/marcas-section.tsx`
- `docs/stories/75-230-kit-marcas-v2-brand-hub.story.md` (novo)

## QA Results
### Review Date: 2026-07-29 — Reviewed By: Quinn
Gate: **CONCERNS→PASS** — ACs 1-5 ok, JSX íntegro, zero regressão. 2 MEDIUM
corrigidos: (1) "+ Adicionar cor" não preenchida gerava 400 (filtro client
descarta hex "#"; hex inválido digitado segue ao server); (2) label de variação
grudava na leva seguinte (reset pós-upload). Mig blindada (LOW): filtro
table_schema + conversão PRESERVA dados (fontes text → [{papel:Geral,nome}],
cores v1 strings → objetos) em vez de DROP. Cosméticos aceitos (picker fallback
p/ hex 3 dígitos). Suíte 1270/1270; tsc/eslint/build limpos.
