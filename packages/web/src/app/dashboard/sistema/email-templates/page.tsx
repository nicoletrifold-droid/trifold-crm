import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { redirect } from "next/navigation"
import { EmailTemplateList } from "./_components/template-list"

export default async function EmailTemplatesPage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "sistema"))) redirect("/dashboard")

  return <EmailTemplateList />
}
