# Story 81-7 — Modal interno: imobiliária vinculada + corretor parceiro na equipe IMOB

## Metadata
- **Status:** InReview
- **Epic:** 81 — Agenda HOUSE × IMOB (`docs/stories/epics/epic-81-agenda-house-imob.md`)
- **Branch:** feat/81-7-modal-interno-imob-campos

## Context
Pedido do Marcos (2026-07-17): quando a Daiana (ou admin/supervisor em modo IMOB) cria um
compromisso pelo "Novo Compromisso" interno, ter os MESMOS campos do link público:
- **Imobiliária vinculada** (select da base + "+ Nova" para cadastrar na hora — reusa o
  `ImobiliariaFormModal` da 75-148), **opcional**;
- **Corretor parceiro** (nome + telefone), **opcional**;
- Daiana pode atender SEM imobiliária → o chip da agenda mostra IMOB + o nome DELA
  (já acontece: broker_id = criadora → linha do responsável no chip).

**Restrição reforçada pelo diretor:** Daiana NUNCA cria como house (chip fixo IMOB, sem
seletor); corretores/gerente-comercial não veem seletor nem campos IMOB. Já garantido em
2 camadas desde a 81-1/81-2 (`canPickTeam` na UI + `resolveTeam` no servidor) — mantido.

## Acceptance Criteria
- [x] AC1: Bloco IMOB no modal (só quando equipe=IMOB): select de imobiliária ("Sem
  imobiliária (atendimento direto)" default) carregado de `/api/imob/imobiliarias` + botão
  "+ Nova" abrindo o `ImobiliariaFormModal` inline (criada → entra na lista já selecionada).
- [x] AC2: Campos corretor parceiro (nome/telefone) opcionais no mesmo bloco.
- [x] AC3: POST `/api/appointments` (team=imob): valida `imobiliaria_id` na org (admin client —
  tabela com RLS sem policy) → grava coluna + `metadata.imobiliaria_nome` +
  `metadata.corretor_parceiro` + linha nas notes (mesma gravação do link público 81-4/81-5).
  Team house ignora os extras.
- [x] AC4: Sem imobiliária → chip mostra IMOB + nome da responsável (broker_id da criadora).
- [x] AC5: type-check/lint/suíte verdes (1059/1059).

## File List
- `docs/stories/81-7-modal-interno-campos-imob.story.md` (this file)
- `packages/web/src/components/appointments/new-appointment-modal.tsx`
- `packages/web/src/app/api/appointments/route.ts`

## Change Log
- @sm/@po: fluxo mínimo (pedido direto do diretor; design espelha o link público).
- @dev (Dex): bloco IMOB no modal + POST com validação org-scoped; fix no meio do caminho:
  lookup de imobiliárias via admin client (RLS sem policy — user client retornaria vazio).
- @qa (Quinn): PASS — extras só com team=imob; segurança de equipe inalterada (2 camadas).
