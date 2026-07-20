# Story 75-181 — Perfil do lead p/ marketing: profissão, renda, filhos e mais 5 campos

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (leads / enriquecimento)
- **Branch:** feat/75-181-lead-perfil-marketing
- **Tipo:** Feature — pedido do Marcos (2026-07-20, screenshot do Editar Lead)

## Context
O marketing usa o CRM como fonte de insights p/ campanhas, mas o cadastro captura pouco perfil
demográfico. Pedido: cadastro robusto, **nenhum campo obrigatório**, com profissão (lista de
profissões do Brasil + "Outra" abrindo texto livre), renda familiar, filhos "e por aí vai".
Campos aprovados pelo Marcos (AskUserQuestion — 8 campos, 4 superfícies):

| Campo | Coluna | Tipo |
|---|---|---|
| Profissão | `profissao` | text livre (select com ~32 opções + "Outra" → texto). SEM CHECK. |
| Renda familiar mensal | `renda_familiar` | CHECK — faixas ancoradas no MCMV: ate_2850 · 2850_4700 · 4700_8000 · 8000_12000 · 12000_20000 · acima_20000 |
| Filhos | `filhos` | CHECK: nenhum · 1 · 2 · 3_mais |
| Estado civil | `estado_civil` | CHECK: solteiro · casado_uniao · divorciado · viuvo |
| Faixa etária | `faixa_etaria` | CHECK: 18_24 · 25_34 · 35_44 · 45_54 · 55_64 · 65_mais |
| Situação de moradia | `situacao_moradia` | CHECK: aluguel · propria · com_familia |
| Cidade/Bairro atual | `cidade_bairro` | text livre |
| Tem pet? | `tem_pet` | CHECK: sim · nao |

Segue o padrão da 75-112 ([[project-lead-enriquecimento]]): colunas nullable + CHECKs na
migration, opções em `lib/leads/enrich.ts`, editável por quem já edita o lead. Convenção
`profissao`: guarda o RÓTULO legível (ou o texto livre da opção "Outra") — export de marketing
sem de-para.

## Acceptance Criteria
- [x] AC1 (mig 179): 8 colunas nullable em `leads` + CHECKs (exceto profissao/cidade_bairro).
- [x] AC2 (enrich.ts): PROFISSAO_OPTIONS (~32, alfabético) + RENDA_FAMILIAR / FILHOS /
  ESTADO_CIVIL / FAIXA_ETARIA / SITUACAO_MORADIA / TEM_PET (options + labels).
- [x] AC3 (componente único): `components/leads/perfil-fields.tsx` — bloco "Perfil (marketing)"
  com os 8 campos; profissão com select + "Outra" abrindo input. API `value/onChange` (controlado).
  REUSE nas 4 superfícies (IDS).
- [x] AC4 (4 superfícies): edição dashboard + edição corretor + cadastro dashboard
  (`/dashboard/leads/new`) + modal de cadastro do corretor. Nenhum campo obrigatório.
- [x] AC5 (APIs): PATCH `/api/leads/[id]` allowedFields += 8; POST `/api/leads` insert += 8.
- [x] AC6: type-check/lint/suíte verdes; migration aplicada em prod e conferida.

## Out of Scope
- Exibição dos campos no drawer/página de visualização do lead (captura primeiro; leitura em
  follow-up junto com o marketing).
- Tela de analytics por perfil (ex.: leads por faixa de renda) — épico próprio.
- Nicole preencher esses campos automaticamente da conversa (ótimo follow-up de IA).
- Backfill de leads antigos.

## File List
- `docs/stories/75-181-lead-perfil-marketing.story.md` (this file)
- `supabase/migrations/179_lead_perfil_marketing.sql` (novo)
- `packages/web/src/lib/leads/enrich.ts` (opções/labels novos)
- `packages/web/src/components/leads/perfil-fields.tsx` (novo — bloco compartilhado)
- `packages/web/src/app/dashboard/leads/[id]/_components/dashboard-lead-edit-form.tsx`
- `packages/web/src/app/broker/leads/[id]/_components/lead-edit-form.tsx`
- `packages/web/src/app/dashboard/leads/new/page.tsx`
- `packages/web/src/app/broker/_components/new-lead-modal.tsx`
- `packages/web/src/app/api/leads/[id]/route.ts`
- `packages/web/src/app/api/leads/route.ts`

## Change Log
- @sm/@po: campos e superfícies aprovados pelo Marcos (AskUserQuestion 2026-07-20).
- @dev (Dex): mig 179 (8 colunas nullable + 6 CHECKs); enrich.ts com PROFISSAO_SUGESTOES (32) e
  6 grupos de options/labels; componente compartilhado `perfil-fields.tsx` (controlado +
  variante FormData p/ server action; profissão "Outra" com sentinela de espaço → trim no payload);
  plugado nas 4 superfícies (edição dashboard/corretor via cadeia de tipos, cadastro dashboard via
  hidden inputs, modal do corretor com scroll max-h-[90vh]); PATCH allowedFields += 8; POST += 8.
- @qa (Quinn): PASS — 1080/1080, tsc verde, lint limpo no raio. Migration aplicada em prod
  (Management API): 8 colunas + 6 CHECKs conferidos. next build gate no Vercel do PR.
- @devops (Gage): (pendente)
