# Story 75-190 — Link público de agendamento: enum lead_source sem 'imob_link' (cadastro falhava)

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core / relacionado ao Epic 81 (agenda IMOB)
- **Branch:** fix/75-190-enum-imob-link
- **Tipo:** Bug — reportado pelo Marcos (print do parceiro, 2026-07-21): "Não foi
  possível registrar o cliente. Tente novamente." ao confirmar visita no link público.

## Context
Sequência do incidente de hoje: a 75-189 destravou o ACESSO ao link público
(`/agendar/[token]` caía no login); com a página aberta, o parceiro esbarrou no
próximo defeito — o POST `/api/agendar/[token]` cria o lead com
`source: "imob_link"`, valor que NUNCA foi adicionado ao enum `lead_source`.
INSERT falhava com 22P02 → 500 → "Não foi possível registrar o cliente".

Reproduzido no banco de prod com o INSERT exato da rota (BEGIN/ROLLBACK). O
restante do fluxo foi smoke-testado e está íntegro: INSERT de `appointments` com
`team='imob'`/`imobiliaria_id`/`client_*`/`cancel_token` OK (migs 175/176 aplicadas),
responsável perfil imob resolve.

## Acceptance Criteria
- [x] AC1: migration `181_lead_source_imob_link.sql` — `ALTER TYPE lead_source ADD
  VALUE IF NOT EXISTS 'imob_link'` — aplicada no PROD via Management API e
  registrada em `schema_migrations` ('181'). Sem deploy necessário (fix é no banco).
- [x] AC2: INSERT exato da rota re-executado no prod (com ROLLBACK) → sucesso,
  com `segmento='imob'` e responsável do perfil imob preenchidos.
- [x] AC3: labels de UI — `imob_link` em `SOURCE_LABELS` ("Link Imobiliária") e
  `SOURCE_LABELS_SHORT` ("Link Imob") p/ o badge não cair no fallback "Outro".
- [x] AC4: type-check/lint/suíte verdes.

## File List
- `docs/stories/75-190-lead-source-imob-link-enum.story.md` (this file)
- `supabase/migrations/181_lead_source_imob_link.sql`
- `packages/web/src/lib/constants.ts` (labels imob_link)

## Change Log
- @sm/@po: fluxo mínimo — erro reproduzido no banco (22P02); GO.
- @dev (Dex)/@data-engineer (Dara): enum corrigido no prod (Management API) +
  registrado; insert reproduzido com sucesso; labels de origem adicionados.
- @qa (Quinn): PASS — smoke do fluxo completo no banco (lead + appointment);
  demais valores do enum intactos; suíte verde. LIÇÃO (mesma da 75-188): valor
  novo de enum usado no código exige migration aplicada NO PROD — dev DB ≠ prod.
- @devops (Gage): PR squash-merge (repo hygiene; o fix de prod já estava ativo).
