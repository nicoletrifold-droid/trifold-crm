# Story 75-228 — Fotos pendentes: aparecem sem F5 e acima da dobra

**Status:** InReview
**Tipo:** Bug fix + UX
**Epic:** Aprovações de obra
**Complexidade:** S

## Contexto
Ticket da Samara (28/07 17:51): *"Pode deixar as imagens também que estão aguardando
aprovação? igual você fez com os documentos?"*

Investigação (29/07) provou que a paridade **já existe** (75-176/75-209: fotos e
documentos usam a mesma fila `obra_upload_aprovacoes`, mesmo gate, mesmos botões
Visualizar/Excluir do autor). O que gerou a percepção de "não vejo" foram dois
problemas reais na aba Fotos:

1. **Bug:** `obra-detail-tabs.tsx` guarda `initialAprovacoes` em `useState` sem
   sincronizar quando a prop muda — o `router.refresh()` pós-upload re-renderiza o
   server component, mas o client mantém o array velho. A foto recém-enviada só
   aparecia após F5; com zero fotos publicadas a tela dizia **"Nenhuma foto ainda."**
   logo depois do envio (sensação de sumiço). Docs têm o mesmo defeito por baixo,
   mascarado pelo volume de docs publicados.
2. **UX:** o bloco "Aguardando aprovação" das fotos era renderizado DEPOIS de todos
   os grupos publicados — abaixo da dobra em obra grande.

## Acceptance Criteria
1. **AC1:** após enviar foto (role obras/gerente-relacionamento), o item pendente
   aparece na aba Fotos **sem recarregar a página** (sincronização estado↔prop).
2. **AC2:** o bloco "Aguardando aprovação" vem **antes** dos grupos de fotos
   publicadas na aba Fotos.
3. **AC3:** excluir/visualizar pendente continua funcionando (75-209); contador do
   título ("Fotos (N)") continua somando publicadas + pendentes; empty state só
   aparece quando não há NEM publicada NEM pendente.
4. **AC4:** documentos herdam a mesma correção de sincronização (mesmo estado) sem
   mudança de comportamento visível além de atualizar sem F5.

## Fora do escopo
- Busca/categoria/ordenação nas fotos (paridade com 75-211 dos docs) — só se a
  Samara pedir depois.
- Mudanças no fluxo de aprovação em si.

## Dev Agent Record
### File List
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx`
- `docs/stories/75-228-fotos-pendentes-visibilidade.story.md` (novo)

## QA Results
### Review Date: 2026-07-29 — Reviewed By: Quinn
Gate: **PASS** — 6/6 checks (useEffect dep única sem loop; delete local sem flicker,
sem refresh imediato; bloco movido íntegro no mesmo container, nada duplicado; aba
Documentos intocada; contador/empty state/botões verbatim; ambos upload forms
terminam em router.refresh()). Suíte 1260/1260; tsc/eslint/build limpos.
Observação não-bloqueante registrada: race estreito refresh-em-voo × delete pode
ressuscitar item na tela até o próximo refresh (janela minúscula, banco correto) —
não vale complexidade numa story S.
