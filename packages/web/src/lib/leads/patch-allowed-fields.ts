// Story 75-273 — a whitelist de campos do `PATCH /api/leads/[id]` mora aqui para
// poder ser TESTADA.
//
// POR QUE FOI EXTRAÍDA. A 75-269 removeu `lost_reason` desta lista (aceitava
// texto livre sem grupo e recriava motivo não classificado, desfazendo a 75-264
// um lead por vez) e o @qa dela registrou o buraco: enquanto a lista fosse uma
// `const` local dentro do handler, **nada impedia alguém de reintroduzir o campo
// numa story futura** — a suíte seguiria verde. Guard-rail que não é testado é
// intenção, não regra.
//
// `buildUpdatePayload` itera esta lista e IGNORA EM SILÊNCIO o que não está
// nela, então tirar um campo daqui não basta: a rota também rejeita
// explicitamente `lost_reason` no corpo (fix QA-001 da 75-269). Os dois juntos:
// o campo não é gravável E quem tenta é avisado.

/** Campos que o PATCH genérico de lead aceita atualizar. */
// Mutável (string[], não readonly) porque `buildUpdatePayload` recebe string[].
// Tornar readonly exigiria mudar a assinatura dele e todos os outros callers —
// custo desproporcional para um ganho de imutabilidade que o teste já garante.
export const LEAD_PATCH_ALLOWED_FIELDS: string[] = [
  "name",
  "phone",
  "email",
  "channel",
  "stage_id",
  "property_interest_id",
  "has_down_payment",
  "preferred_bedrooms",
  "preferred_floor",
  "preferred_view",
  "preferred_garage_count",
  "qualification_status",
  "qualification_score",
  "interest_level",
  // Story 84-1 — Qualificação Comercial: manual, independente de interest_level/
  // qualification_status/qualification_score (que são recalculados pela Nicole).
  "qualificacao_comercial",
  "source",
  "assigned_broker_id",
  "ai_summary",
  "visit_scheduled_at",
  // Story 75-269 — `lost_reason` SAIU da whitelist. Ele aceitava texto livre
  // sem exigir grupo, o que recriava motivo não classificado e desfazia a
  // estruturação da 75-264 um lead por vez. Varredura em packages/ e scripts/:
  // NENHUM caller escrevia por aqui — marcar perdido passa por
  // `/api/leads/[id]/mark-lost` (grava motivo E grupo, route.ts:54-55) e por
  // `/api/leads/bulk` (sempre manda `lost_reason_grupo`); `stage/route.ts:71`,
  // `bulk/route.ts:52,64` e `reativar/route.ts:151` apenas LIMPAM (`= null`).
  // Era capacidade vestigial: fechar a porta é melhor que vigiá-la.
  // Para limpar o motivo, use os endpoints acima (reativar/stage/bulk).
  "lost_reason_grupo",
  // Story 75-112 — enriquecimento do perfil (editável por quem já edita o lead)
  "observacao",
  "finalidade",
  "orcamento",
  "prazo_compra",
  "forma_pagamento",
  // Story 75-181 — perfil p/ marketing
  "profissao",
  "renda_familiar",
  "filhos",
  "estado_civil",
  "faixa_etaria",
  "situacao_moradia",
  "cidade_bairro",
  "tem_pet",
]

/**
 * Campos que NUNCA podem voltar para a whitelist, com o motivo. O teste falha se
 * algum reaparecer — é o que transforma a decisão em regra.
 */
export const LEAD_PATCH_FORBIDDEN_FIELDS: Record<string, string> = {
  lost_reason:
    "Story 75-269: aceitava texto livre sem grupo e recriava motivo não classificado. " +
    "Marcar perdido passa por POST /api/leads/[id]/mark-lost (grava motivo E grupo); " +
    "limpar, pelos fluxos de reativação/etapa/bulk.",
}
