import { createAdminClient } from "@web/lib/supabase/admin"
import { parseFormSchema } from "@web/lib/forms/schema"
import { FormRunner } from "./form-runner"

// Story 75-330 (Epic 89) — página PÚBLICA do formulário de qualificação do
// tráfego pago (sem login; mesmo padrão de /agendar/[token]). Token inválido,
// revogado, de formulário inativo ou com schema quebrado → a MESMA tela
// genérica, sem vazar org, campanha nem a existência do token.
//
// A agenda no fim é a Story 75-331.

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function LinkInvalido() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-950 px-4">
      <div className="w-full max-w-md rounded-2xl bg-stone-900 p-8 text-center ring-1 ring-stone-800">
        <p className="text-3xl">🔗</p>
        <h1 className="mt-3 text-lg font-semibold text-stone-100">Link inválido ou desativado</h1>
        <p className="mt-2 text-sm text-stone-400">
          Este formulário não está mais disponível. Se você chegou por um anúncio, fale com a
          equipe Trifold para receber um novo link.
        </p>
      </div>
    </div>
  )
}

export default async function FormularioPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  if (!UUID_RE.test(token)) return <LinkInvalido />

  const admin = createAdminClient()
  const { data } = await admin
    .from("lead_forms")
    .select("nome, schema")
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle()

  if (!data) return <LinkInvalido />

  // Schema quebrado no banco (alguém salvou algo que o parse recusa) não pode
  // virar página quebrada para quem clicou no anúncio pago.
  let schema
  try {
    schema = parseFormSchema(data.schema)
  } catch (e) {
    console.error("[formulario] schema inválido:", e)
    return <LinkInvalido />
  }

  if (schema.perguntas.length === 0) return <LinkInvalido />

  return (
    <div className="min-h-screen bg-stone-950 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-2xl bg-stone-900 p-6 ring-1 ring-stone-800 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">Trifold</p>
          <h1 className="mt-1 text-xl font-bold text-stone-100">{data.nome as string}</h1>
          <div className="mt-6">
            <FormRunner token={token} schema={schema} />
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-stone-600">
          Suas respostas são usadas apenas para o atendimento da Trifold.
        </p>
      </div>
    </div>
  )
}
