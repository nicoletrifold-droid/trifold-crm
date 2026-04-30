import { getServerUser } from "@web/lib/auth"
import { redirect } from "next/navigation"
import { createAdminClient } from "@web/lib/supabase/admin"
import { TemplateForm } from "../_components/template-form"

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getServerUser()
  if (user.role !== "admin") redirect("/dashboard")

  const { id } = await params
  const supabase = createAdminClient()

  const { data: template } = await supabase
    .from("email_templates")
    .select("*")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .single()

  if (!template) redirect("/dashboard/sistema/email-templates")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Editar Template</h1>
        <p className="mt-0.5 text-sm text-stone-500">{template.name}</p>
      </div>
      <TemplateForm
        initialData={{
          id: template.id,
          name: template.name,
          slug: template.slug,
          category: template.category,
          subject: template.subject,
          html_body: template.html_body,
          variables: (template.variables as import("../_components/variable-editor").TemplateVariable[]) ?? [],
          is_active: template.is_active,
        }}
      />
    </div>
  )
}
