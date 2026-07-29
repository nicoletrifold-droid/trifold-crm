# Story 75-227 — Brindes: campo "Cargo" no destinatário

**Status:** Done
**Tipo:** Melhoria (ticket de Suporte)
**Epic:** Controle de Brindes (29)
**Complexidade:** S

## Contexto
Ticket da Samara (Suporte, 28/07 17:53): *"na parte de brindes, em observação os que
são colaboradores coloquei o cargo, seria possível criar este campo? só detalhe mesmo
para a perfeccionista aqui kkkk"* — motivo: ponto de melhoria.

Hoje o cargo do colaborador vai improvisado no campo Observação. O módulo **não tem**
distinção colaborador × cliente (Tipo = mãe/pai/outro é parentesco; o único sinal de
cliente é `cliente_id`), então a solução de menor blast radius é um campo **`cargo`
livre, opcional (nullable), sempre visível** — preenche quem faz sentido. Sem flag
nova, sem mexer no CHECK de `tipo`, sem mudança de validação.

## Acceptance Criteria
1. **AC1 — Migração 196:** `brindes_destinatarios.cargo text` (nullable, sem CHECK),
   padrão da mig 040 (`ADD COLUMN IF NOT EXISTS`). RLS herdada (policy é FOR ALL).
2. **AC2 — Formulário:** input "Cargo" (opcional) no modal de criar/editar
   destinatário, ao lado/abaixo do Nome; hidrata no edit; string vazia grava NULL
   (mesmo helper `str()` dos demais campos).
3. **AC3 — API:** POST aceita `cargo`; PATCH aceita `cargo` na whitelist
   (inclusive limpar: enviar vazio → NULL).
4. **AC4 — Listagem:** coluna "Cargo" na tabela de destinatários (— quando vazio);
   `colSpan` das linhas de vazio/carregando ajustado.
5. **AC5 — Impressão:** cargo aparece na folha de impressão junto ao nome (mesmo
   tratamento visual da observação inline).
6. **AC6 — Sem regressão:** criar/editar destinatário sem cargo continua igual;
   observação continua existindo e independente.

## Fora do escopo
- Flag colaborador × cliente (não existe demanda além do cargo).
- Cargo no import CSV (formato posicional documentado — mexer só se a Samara pedir).
- Filtro por cargo na barra de filtros.
- Prefill de cargo a partir de `clientes.profissao` (colaborador não é cliente CRM).

## Riscos
- Tabela de impressão tem CSS próprio — validar que a coluna/linha extra não quebra o
  layout de impressão A4.

## Dev Agent Record
### File List
- `supabase/migrations/196_brindes_destinatarios_cargo.sql` (novo)
- `packages/web/src/app/dashboard/brindes/_components/types.ts`
- `packages/web/src/app/dashboard/brindes/_components/destinatario-modal.tsx`
- `packages/web/src/app/dashboard/brindes/_components/brindes-table.tsx`
- `packages/web/src/app/dashboard/brindes/_components/print-modal.tsx`
- `packages/web/src/app/api/brindes/destinatarios/route.ts`
- `packages/web/src/app/api/brindes/destinatarios/[id]/route.ts`
- `docs/stories/75-227-brindes-cargo-destinatario.story.md` (novo)

## QA Results
### Review Date: 2026-07-29 — Reviewed By: Quinn
Gate: **CONCERNS→PASS** — 7/7 checks de código PASS (migração idempotente; modal
EMPTY/hydrate/body/input; POST/PATCH com limpeza ""→NULL; export usa select(*) e o
PrintModal renderiza o cargo; colSpan 6→7 nos dois estados; impressão cresce
vertical na célula nome, A4 ok; suíte 1260/1260). CONCERNS eram só de processo
(commit pendente + story hygiene) — resolvidos neste commit.
Débito pré-existente anotado: print-modal interpola campos sem escape HTML
(padrão antigo do módulo, não piorado pela story) — candidato a escapeHtml futuro.

### Deploy (@devops, 29/07)
- Mig 196 aplicada em PROD e DEV via Supabase Management API (PAT em
  ~/.config/supabase/pat — novo caminho padrão, 100% terminal); coluna verificada
  nos dois bancos.
- PR #298 squash-merged; deploy Vercel success.
