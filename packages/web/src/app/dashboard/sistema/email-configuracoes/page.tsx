import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { EmailSettingsForm } from "./_components/email-settings-form"

export default async function EmailConfiguracoesPage() {
  const user = await getServerUser()
  if (user.role !== "admin") redirect("/dashboard")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Configurações de Email</h1>
        <p className="mt-0.5 text-sm text-stone-500">
          Remetente, quotas e alertas para todos os emails enviados pela plataforma
        </p>
      </div>
      <EmailSettingsForm />
    </div>
  )
}
