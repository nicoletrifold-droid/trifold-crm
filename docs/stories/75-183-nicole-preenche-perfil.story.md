# Story 75-183 — Nicole auto-preenche o Perfil (marketing) a partir da conversa

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (Nicole / enriquecimento)
- **Branch:** feat/75-183-nicole-preenche-perfil
- **Tipo:** Follow-up da 75-181 (2/3 do lote aprovado pelo Marcos)

## Context
Os 8 campos de perfil (75-181) dependem do corretor preencher. A Nicole já tem um fluxo de
extração estruturada via **Haiku** que roda no cron `enrich-leads` a cada 30 min
(`enrichLeadFromConversation` + `mapExtractedDataToLeadFields` → patch no lead). Esta story
estende esse fluxo p/ extrair também o perfil — profissão, renda, filhos, estado civil,
faixa etária, moradia, cidade/bairro e pet — **só quando o lead mencionou explicitamente**.

Regras de segurança:
- **Nunca inventar**: prompt já exige "APENAS campos EXPLICITAMENTE mencionados"; os novos
  campos entram com enum fechado (valores do CHECK da mig 179) e instrução anti-inferência
  (ex.: faixa etária SÓ se o lead disse a idade).
- **Nunca sobrescrever humano**: guard no cron — campo de perfil já preenchido no lead
  NÃO é atualizado pela extração (diferente de score/summary, que continuam dinâmicos).

## Acceptance Criteria
- [x] AC1 (prompt): ENRICHMENT_PROMPT ganha os 8 campos com valores exatos dos CHECKs +
  instruções anti-inferência (renda mapeada p/ faixa; idade → faixa etária apenas se dita).
- [x] AC2 (map): `mapExtractedDataToLeadFields` mapeia os 8 campos com validação de enum
  (valor fora da lista = descartado — nunca quebra o CHECK); profissao/cidade_bairro
  saneados (trim + limite de tamanho).
- [x] AC3 (guard): cron `enrich-leads` carrega os campos de perfil atuais do lead e remove
  do patch qualquer campo de perfil JÁ preenchido (corretor/manual vence a IA).
- [x] AC4 (testes): unit tests p/ o mapeamento (enum válido/ inválido/ ausente) e p/ o guard.
- [x] AC5: type-check/lint/suíte verdes.

## Out of Scope
- Extração em tempo real no pipeline (o cron de 30 min cobre; latência é aceitável p/ perfil).
- Backfill de conversas antigas (o cron só processa conversa com atividade recente).
- UI de "quem preencheu" (IA vs corretor) — metadata pode vir depois.

## File List
- `docs/stories/75-183-nicole-preenche-perfil.story.md` (this file)
- `packages/ai/src/flows/haiku-enrichment.ts` (prompt + mapeamento + PERFIL_LEAD_FIELDS)
- `packages/ai/src/flows/haiku-enrichment.test.ts` (testes novos)
- `packages/web/src/app/api/cron/enrich-leads/route.ts` (guard não-sobrescrever)

## Change Log
- @sm/@po: fluxo — follow-up direto aprovado ("vamos fazer os 3"); arquitetura mapeada por agente Explore.
- @dev (Dex): prompt Haiku += 8 campos (enums exatos dos CHECKs + anti-inferência); mapExtractedDataToLeadFields valida enum e saneia texto livre; helper puro stripAlreadyFilledPerfil (guard) usado no cron; 7 testes.
- @qa (Quinn): PASS — 1087/1087, tsc ai+web verdes, lint limpo.
- @devops (Gage): PR squash-merge, deploy prod automático.
