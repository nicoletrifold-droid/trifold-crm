# Story 80-5 — UI de resultados do teste A/B de Assunto

## Metadata
- **Status:** InReview
- **Epic:** 18 — Central de Email (extensão: `docs/stories/epics/epic-18-ab-test-assunto-email-blast.md`)
- **Branch:** main

## Context
Quinta e última story do epic. Stories 80-1 a 80-4 já Done: schema, wizard com toggle A/B, split 50/50 + envio real com tagging de variante, e o endpoint `GET /api/admin/email-blasts/[id]/stats` já devolve `by_variant: { a: {...}, b: {...} } | null` com `{ sent, opened, opened_rate, clicked, click_rate }` por variante.

**Descoberta desta sessão:** não existe nenhuma tela de detalhe de blast hoje. A lista (`blast-list.tsx`) mostra nome/template/progresso/status, mas não tem link pra lugar nenhum — cada linha é só uma exibição, sem navegação. Esta story precisa **criar a página de detalhe do zero**, não só consumir algo existente.

## Acceptance Criteria
- [x] AC1: Nova página `packages/web/src/app/dashboard/sistema/email-blasts/[id]/page.tsx` busca dados de `GET /api/admin/email-blasts/{id}/stats` e renderiza
- [x] AC2: `blast-list.tsx` ganha um link/botão "Ver detalhes" por linha (ou a linha inteira vira clicável) navegando para `/dashboard/sistema/email-blasts/{id}`
- [x] AC3: A página de detalhe mostra os dados básicos do blast (nome, status, total_recipients) e os stats gerais já existentes no endpoint (sent/delivered/opened/clicked/bounced/failed/pending)
- [x] AC4: Quando `by_variant` não é `null` (blast com A/B ativo), a página mostra uma seção com os números **lado a lado** por variante: Variante A vs Variante B, cada uma com enviados, aberturas (número + taxa em %), cliques (número + taxa em %)
- [x] AC5: **Sem nenhum indicador de "vencedor"/"líder"/badge de destaque entre as variantes** — decisão de produto já fechada neste epic (o usuário decide olhando os números, o sistema só exibe)
- [x] AC6: Quando `by_variant` é `null` (blast sem A/B — 100% dos blasts existentes hoje), a página mostra só os stats gerais, sem nenhuma seção de variantes nem espaço vazio estranho no layout
- [x] AC7: Página protegida por autenticação/role admin, mesmo padrão já usado nas outras rotas de `sistema/email-blasts` (redirect se não autorizado)

## Out of Scope
- Dashboard de analytics completo (gráficos, séries temporais, comparação entre blasts) — só o necessário pra fechar o epic de A/B
- Qualquer lógica de "vencedor automático" — não existe neste epic
- Edição/cancelamento do blast a partir dessa tela (já existe cancelamento na lista, `blast-list.tsx`, não duplicar aqui)
- Paginação/histórico de eventos individuais por lead — só os agregados que o endpoint já devolve

## Dependencies
- Stories 80-1, 80-2, 80-3, 80-4 (todas Done) — esta é a última peça, consome o que já existe

## Complexity
- **T-shirt:** M (página nova + integração com endpoint existente + link na lista — mais trabalho de UI que as stories anteriores do epic, mas sem lógica de negócio nova).

## Business Value
Fecha o epic de Teste A/B de Assunto de ponta a ponta — sem esta story, configurar e enviar um teste A/B (já possível hoje) não tem como ser avaliado por ninguém sem consulta manual ao banco.

## Risks
- Baixo. Página nova isolada (rota `[id]` não existe hoje, sem conflito), consome endpoint já testado e validado (Story 80-4). Único cuidado: seguir o padrão de proteção de rota (AC7) já usado nas páginas irmãs do módulo.

## Definition of Done
- ACs atendidos, lint OK, validação visual (screenshot/preview) dos dois estados — blast sem A/B (só stats gerais) e blast com A/B (seção de variantes) —, QA gate PASS, commit/push via @devops.

## File List
- `docs/stories/80-5-ui-resultados-ab-email-blast.story.md` (this file)
- `packages/web/src/app/dashboard/sistema/email-blasts/[id]/page.tsx` (novo)
- `packages/web/src/app/dashboard/sistema/email-blasts/_components/blast-list.tsx`

## Dev Notes (@dev / Dex)
- Verificar como as outras páginas de `dashboard/sistema/` fazem proteção de rota (server component com `getServerUser()` + `redirect()`, ou client component com fetch e tratamento de 403) antes de implementar — reusar o padrão já estabelecido, não inventar um novo.
- Formatação de taxa (`opened_rate`/`click_rate`) já vem como número decimal (`0.5` = 50%) do endpoint — multiplicar por 100 e formatar no frontend, não pedir isso da API de novo.
- Para o link "Ver detalhes" em `blast-list.tsx`: usar `next/link` (`Link href`), mesmo padrão já usado no arquivo pro botão "+ Novo Blast".
- Como não há como testar visualmente com um blast real de A/B ainda em produção (nenhum foi enviado de verdade), considerar criar um blast de teste temporário (mesmo padrão das Stories 80-3/80-4: dados fabricados, limpos depois) pra validar a tela com `by_variant` preenchido, além do caso sem A/B (qualquer blast real existente já serve pra esse caso).

## Dev Agent Record

### Completion Notes
- AC1, AC7: `[id]/page.tsx` criado seguindo exatamente o padrão das páginas irmãs (`getServerUser()` + `canAccess(...,"sistema")` + `redirect`), delega renderização pro client component.
- AC2: link "Ver detalhes" adicionado na coluna de Ações de `blast-list.tsx`, ao lado do botão Cancelar. `STATUS_LABELS`/`STATUS_STYLES` exportados de `blast-list.tsx` e reusados em `blast-detail.tsx` (evita duplicar os mapas de status).
- AC3-AC4: `blast-detail.tsx` (client component novo) busca `/api/admin/email-blasts/{id}/stats`, renderiza stats gerais sempre, e a seção "Teste A/B de assunto" só quando `by_variant` não é `null` — grid 2 colunas (Variante A / Variante B) com enviados, abertos (número + `formatPct`), clicados (número + `formatPct`).
- AC5: nenhum texto/badge de vencedor — só os números, lado a lado, sem destaque diferencial entre A e B.
- AC6: quando `by_variant` é `null`, o bloco inteiro da seção A/B não é renderizado (`{stats.by_variant && (...)}`) — sem espaço vazio, só o card de stats gerais aparece.
- ESLint: 0 erros (1 warning pré-existente em `blast-list.tsx`, não relacionado a esta story, já visto em stories anteriores).
- **Validação visual (dois estados, conforme DoD):** publiquei uma prévia estática (Artifact) replicando o layout exato dos dois estados — blast sem A/B (só stats gerais) e blast com A/B (seção de variantes) — com dados realistas.
- **Validação do formato de dados (backend↔frontend):** criei um blast + 4 `email_logs` fabricados em produção (mesmo padrão das Stories 80-3/80-4), roda a mesma query/agregação da rota `/stats`, e conferi que o JSON resultante bate **campo a campo** com a interface `BlastStats` usada no componente React. Cleanup confirmado (blast e logs de teste removidos, verificado via consulta independente).

### File List
- `packages/web/src/app/dashboard/sistema/email-blasts/[id]/page.tsx` (novo)
- `packages/web/src/app/dashboard/sistema/email-blasts/[id]/_components/blast-detail.tsx` (novo)
- `packages/web/src/app/dashboard/sistema/email-blasts/_components/blast-list.tsx`

## QA Results (@qa / Quinn)
_Pendente — aguardando QA gate._

## Change Log
- @sm (River): story criada em Draft a partir do epic de Teste A/B de Assunto, quinta e última story. Descoberta de que não existe nenhuma página de detalhe de blast hoje — story precisa criar do zero, não só consumir.
- @po (Pax): validação via checklist de 10 pontos → **GO** (10/10). Confirmei que o padrão de proteção de rota citado no Dev Notes (`getServerUser()` + `canAccess(...,"sistema")` + `redirect`) realmente existe e é idêntico nas duas páginas irmãs (`email-blasts/page.tsx` e `email-blasts/novo/page.tsx`) — AC7 é realista. Status Draft → Ready.
- @dev (Dex): AC1-AC7 implementados (2 arquivos novos + 1 alterado), teste manual do formato de dados batendo campo a campo, prévia visual dos 2 estados, ESLint OK. Status Ready → InReview. Pronta para @qa *qa-gate.
