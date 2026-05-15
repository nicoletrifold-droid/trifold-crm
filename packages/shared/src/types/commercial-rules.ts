/**
 * Commercial Rules — canonical contract for `properties.commercial_rules` (jsonb).
 *
 * Origem: docs/architecture/nicole-data-layer-refactor.md (Seções 3.2 e 3.5).
 *
 * Esta é a fonte única de verdade para tipos relacionados às regras comerciais
 * de empreendimentos. Todas as stories do Epic 31 (Nicole Data Layer Refactor)
 * — pipeline, API, UI — devem importar daqui em vez de duplicar tipos locais.
 *
 * O schema é declarado como `.partial()` (todos os campos opcionais) porque
 * empreendimentos podem ser cadastrados sem todas as regras preenchidas —
 * a validação estrita ocorre no consumer (Nicole/API) quando a regra é exigida.
 */
import { z } from "zod"

/**
 * Opções de financiamento aceitas pela construtora.
 * Substitui o texto livre "banco, direto, etc" hardcoded em prompts antigos.
 */
export const FinancingOptionSchema = z.enum([
  "banco",
  "construtora_direto",
  "consorcio_contemplado",
  "fgts",
  "mcmv",
])

/**
 * Schema Zod canônico de `commercial_rules`.
 * `.partial()` torna todos os campos opcionais — alinhado à CHECK constraint
 * do DB (Migration 040) que valida shape mas não exige completude.
 */
export const CommercialRulesSchema = z
  .object({
    /** Se o empreendimento exige entrada (pode ser comprado 100% financiado quando false). */
    requires_down_payment: z.boolean(),
    /** Percentual mínimo de entrada, entre 0 e 100. Ex: 10 para 10%. */
    min_down_payment_pct: z.number().min(0).max(100),
    /** Valor exemplo de entrada em BRL para Nicole comunicar (ex: 40000). Null se não definido. */
    example_down_payment_brl: z.number().nonnegative().nullable(),
    /** True se a construtora aceita consórcio/permuta/alternativas à entrada padrão. */
    down_payment_flexible: z.boolean(),
    /** Opções de financiamento disponíveis para esse empreendimento. */
    financing_options: z.array(FinancingOptionSchema),
    /** Se o imóvel é elegível ao programa Minha Casa Minha Vida. */
    mcmv_eligible: z.boolean(),
    /** Bullets curtos com argumentos de venda para Nicole usar em apresentações. */
    key_selling_points: z.array(z.string()),
    /** Perfil ideal de comprador em texto curto (ex: "quem busca rooftop completo"). */
    ideal_buyer_profile: z.string().nullable(),
    /** Palavras-chave para identificação do empreendimento no parser de mensagens. */
    identification_keywords: z.array(z.string()),
    /** Label descritivo que sobrescreve o status default (ex: "lançamento mais recente"). */
    status_label: z.string().nullable(),
    /** Escape hatch livre para regras não-modeladas. Visível para Nicole. */
    notes: z.string().nullable(),
  })
  .partial()

/**
 * Interface canônica TypeScript inferida do schema Zod.
 * Use este tipo em props, retornos de função e tipagem de DB rows.
 */
export type CommercialRules = z.infer<typeof CommercialRulesSchema>

/**
 * Union de string literals com os 5 valores aceitos de financiamento.
 */
export type FinancingOption = z.infer<typeof FinancingOptionSchema>

/**
 * Tipo de entrada do schema (antes do parse) — útil para formulários/payloads.
 */
export type CommercialRulesInput = z.input<typeof CommercialRulesSchema>

/**
 * Tipo de saída do schema (após parse) — útil para consumers do resultado validado.
 */
export type CommercialRulesParsed = z.output<typeof CommercialRulesSchema>
