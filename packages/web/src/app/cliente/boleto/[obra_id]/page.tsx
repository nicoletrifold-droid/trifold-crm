import { redirect } from "next/navigation"
import { isUuid } from "@web/lib/uuid"

/**
 * Story 75-67 — Rota de redirect para o deep-link do template `novo_boleto_cliente`.
 * A Meta exige que a variável da URL dinâmica fique no FIM do link; como a página real é
 * `/cliente/[obra_id]/financeiro/boleto` (variável no meio), o botão do template aponta para
 * `/cliente/boleto/{{1}}` e esta rota redireciona para o destino real.
 */
export default async function BoletoRedirectPage({
  params,
}: {
  params: Promise<{ obra_id: string }>
}) {
  const { obra_id } = await params
  if (!isUuid(obra_id)) redirect("/cliente")
  redirect(`/cliente/${obra_id}/financeiro/boleto`)
}
