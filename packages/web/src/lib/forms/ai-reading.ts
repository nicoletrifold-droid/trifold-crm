import type { SupabaseClient } from "@supabase/supabase-js"
import { lerRespostasDoFormulario, stripManualInterestLevel, type RespostaAberta } from "@trifold/ai"
import type { FormSchema } from "./schema"
import { perguntasVisiveis, type Respostas } from "./branching"

// Story 75-332 (Epic 89) — cola entre a rota pública e o flow de IA.
//
// O que é decisão pura (quais perguntas são abertas, o que mandar ao modelo)
// mora em `extrairAbertas`, testável sem rede. O que é efeito (chamar o modelo,
// gravar) mora aqui.

/**
 * As respostas de tipo ABERTO, já com o título da pergunta.
 *
 * Só tipos livres (`texto` / `numero`): opção de múltipla escolha o score já
 * pontua, e mandá-la ao modelo gastaria token para reler o que a régua sabe.
 * Só perguntas VISÍVEIS: uma resposta de ramo abandonado descreveria um caminho
 * que a pessoa não seguiu.
 */
export function extrairAbertas(schema: FormSchema, respostas: Respostas): RespostaAberta[] {
  const abertas: RespostaAberta[] = []
  for (const pergunta of perguntasVisiveis(schema, respostas)) {
    if (pergunta.tipo !== "texto" && pergunta.tipo !== "numero") continue
    const bruta = respostas[pergunta.id]
    if (bruta === undefined || bruta === null || Array.isArray(bruta)) continue
    const texto = String(bruta).trim()
    if (!texto) continue
    abertas.push({ pergunta: pergunta.titulo, resposta: texto })
  }
  return abertas
}

/**
 * Lê as respostas abertas e grava o resultado. Silenciosa por contrato: quem
 * chama usa `void ... .catch()` e nunca espera (AC2/AC3).
 */
export async function analisarRespostasAbertas(params: {
  admin: SupabaseClient
  schema: FormSchema
  respostas: Respostas
  score: number
  leadId: string | null
  respostaId: string | null
  orgId: string
}): Promise<void> {
  const { admin, schema, respostas, score, leadId, respostaId } = params

  const abertas = extrairAbertas(schema, respostas)
  if (abertas.length === 0) return // AC8 — nada a interpretar

  const leitura = await lerRespostasDoFormulario({ abertas, score })
  if (!leitura) return // FAIL-OPEN

  // Resumo no metadata da resposta — sem migration, e é de onde a ficha lê.
  if (respostaId) {
    const { data: atual } = await admin
      .from("lead_form_responses")
      .select("metadata")
      .eq("id", respostaId)
      .maybeSingle()
    const metadata = (atual?.metadata ?? {}) as Record<string, unknown>
    await admin
      .from("lead_form_responses")
      .update({ metadata: { ...metadata, resumo_ia: leitura.resumo } })
      .eq("id", respostaId)
  }

  if (!leadId) return

  // AC4 — 🔴 o humano manda. `stripManualInterestLevel` apaga `interest_level`
  // do patch quando o corretor já definiu o calor à mão, e trata lead ilegível
  // como manual (fail-safe da Story 75-237). É a MESMA função que o cron de
  // enriquecimento usa; reimplementar a checagem aqui seria recriar o bug que a
  // migration 201 consertou.
  const { data: lead } = await admin
    .from("leads")
    .select("interest_level_manual")
    .eq("id", leadId)
    .maybeSingle()

  const patch: Record<string, unknown> = { interest_level: leitura.calor }
  stripManualInterestLevel(patch, lead)

  // Só sobra `interest_level` no patch — `qualificacao_comercial` NUNCA entra
  // aqui (AC6): é campo do humano.
  if (Object.keys(patch).length > 0) {
    await admin.from("leads").update(patch).eq("id", leadId)
  }
}
