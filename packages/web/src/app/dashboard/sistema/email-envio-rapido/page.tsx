import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { QuickSendForm } from "./_components/quick-send-form"

export default async function EmailEnvioRapidoPage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "sistema"))) redirect("/dashboard")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Envio Rápido</h1>
        <p className="mt-0.5 text-sm text-stone-500">
          Envie um email avulso para um destinatário usando qualquer template ativo
        </p>
      </div>
      <div className="max-w-xl">
        <QuickSendForm />
      </div>
    </div>
  )
}
