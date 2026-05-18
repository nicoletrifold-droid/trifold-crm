export const PIPELINE_STAGES = [
  "novo",
  "qualificado",
  "agendado",
  "no_show",
  "visitou",
  "proposta",
  "fechado",
  "perdido",
  "represamento",
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]
