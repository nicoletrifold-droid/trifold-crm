import { getServerUser } from "@web/lib/auth"
import { redirect } from "next/navigation"
import { TemplateForm } from "../_components/template-form"

export default async function NewTemplatePage() {
  const user = await getServerUser()
  if (user.role !== "admin") redirect("/dashboard")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Novo Template</h1>
        <p className="mt-0.5 text-sm text-stone-500">Crie um novo template de email</p>
      </div>
      <TemplateForm />
    </div>
  )
}
