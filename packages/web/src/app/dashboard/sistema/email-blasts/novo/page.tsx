import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { BlastWizard } from "./_components/wizard"

export default async function NovoBlasteEmailPage() {
  const user = await getServerUser()
  if (user.role !== "admin") redirect("/dashboard")
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <BlastWizard />
    </div>
  )
}
