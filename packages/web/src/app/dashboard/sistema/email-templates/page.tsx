import { getServerUser } from "@web/lib/auth"
import { redirect } from "next/navigation"
import { EmailTemplateList } from "./_components/template-list"

export default async function EmailTemplatesPage() {
  const user = await getServerUser()
  if (user.role !== "admin") redirect("/dashboard")

  return <EmailTemplateList />
}
