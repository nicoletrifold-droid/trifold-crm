import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { BlastWizard } from "./_components/wizard"

export default async function NovoBlasteEmailPage() {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "sistema"))) redirect("/dashboard")
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <BlastWizard />
    </div>
  )
}
