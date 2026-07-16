import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { canAccess } from "@web/lib/permissions"
import { BlastDetail } from "./_components/blast-detail"

export default async function BlastDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getServerUser()
  if (!(await canAccess(user.id, user.orgId, "sistema"))) redirect("/dashboard")

  const { id } = await params

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <BlastDetail id={id} />
    </div>
  )
}
